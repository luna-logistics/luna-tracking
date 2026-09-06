-- Luna Tracking — businesses + members + invitations.
--
-- Phase 2 of the pro-account chantier. Every professional user works
-- inside at least one business. A business has an owner (the creator),
-- can have multiple members with per-role permissions, and is the scope
-- that every phase-3+ table (customers, quotes, shipments, invoices,
-- expenses, ...) will attach to via a business_id column.
--
-- Design notes:
--   * A user can belong to multiple businesses over time (agency
--     accountant, invited teammate, ...). Frontend picks the "current"
--     one — the context is per-session, not per-user.
--   * Owner is materialised as a member row with role=owner AND kept
--     on businesses.owner_user_id for the fast lookup that RLS needs.
--     Both are kept in sync by triggers so a delete of the owner-member
--     row can never leave a business orphaned.
--   * Roles are a small text enum:
--       owner      - one per business, cannot be removed by anyone but themself
--       admin      - full read/write on everything except billing tier / delete
--       manager    - all ops (clients, quotes, shipments) + read on invoices
--       accounting - read on ops + full read/write on invoices, expenses, reports
--       operations - read/write on shipments + read on clients; no billing
--       viewer     - read-only across the business
--     The mapping role → actions lives in the frontend AND is re-checked
--     by RLS predicates. Frontend gate is UX; DB gate is security.
--   * Invitations are pre-users: the invited email may not have signed
--     up yet. On signup, a trigger claims any pending invitation whose
--     email matches and inserts the member row. Until then the invite
--     is visible on the Team page as "pending".

-- businesses ─────────────────────────────────────────────────────────
create table if not exists public.businesses (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references auth.users(id) on delete restrict,
  name           text not null check (length(trim(name)) > 0),
  legal_name     text,
  vat_number     text,
  company_number text,
  email          text,
  phone          text,
  address_line1  text,
  address_line2  text,
  postal_code    text,
  city           text,
  country        text not null default 'BE'
    check (length(country) = 2 and country = upper(country)),
  currency       text not null default 'EUR'
    check (currency in ('EUR','USD','GBP','CDF','CHF','CAD','XOF','XAF')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists businesses_touch on public.businesses;
create trigger businesses_touch before update on public.businesses
  for each row execute function public.touch_updated_at();

-- business_members ──────────────────────────────────────────────────
create table if not exists public.business_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'viewer'
    check (role in ('owner','admin','manager','accounting','operations','viewer')),
  invited_by   uuid references auth.users(id) on delete set null,
  joined_at    timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists business_members_user_idx on public.business_members(user_id);
create index if not exists business_members_business_idx on public.business_members(business_id);

-- business_invitations ─────────────────────────────────────────────
create table if not exists public.business_invitations (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  email         text not null check (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  role          text not null default 'viewer'
    check (role in ('admin','manager','accounting','operations','viewer')),
  invited_by    uuid references auth.users(id) on delete set null,
  claimed_at    timestamptz,
  claimed_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (business_id, email)
);

-- Membership helpers (used by RLS + frontend queries) ────────────────
create or replace function public.is_business_member(biz uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.business_members
    where business_id = biz and user_id = uid
  );
$fn$;

create or replace function public.business_role(biz uuid, uid uuid)
returns text language sql stable security definer set search_path = public as $fn$
  select role from public.business_members
  where business_id = biz and user_id = uid
  limit 1;
$fn$;

-- Owner sync: keep businesses.owner_user_id ↔ members.role=owner ──
create or replace function public.businesses_after_insert_add_owner()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.business_members (business_id, user_id, role, joined_at)
  values (new.id, new.owner_user_id, 'owner', now())
  on conflict (business_id, user_id) do update set role = 'owner';
  return new;
end $fn$;

drop trigger if exists businesses_add_owner_member on public.businesses;
create trigger businesses_add_owner_member
  after insert on public.businesses
  for each row execute function public.businesses_after_insert_add_owner();

-- Claim pending invitations on signup ───────────────────────────────
-- Runs after our existing handle_new_user() (which creates the profile
-- row). Any business_invitations rows whose email matches the newly-
-- created auth.users row are converted into business_members rows and
-- marked claimed.
create or replace function public.claim_pending_invitations()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.business_members (business_id, user_id, role, invited_by, joined_at)
  select business_id, new.id, role, invited_by, now()
  from public.business_invitations
  where lower(email) = lower(new.email) and claimed_at is null
  on conflict (business_id, user_id) do nothing;

  update public.business_invitations
     set claimed_at = now(), claimed_by = new.id
   where lower(email) = lower(new.email) and claimed_at is null;

  return new;
end $fn$;

drop trigger if exists on_auth_user_claim_invites on auth.users;
create trigger on_auth_user_claim_invites
  after insert on auth.users
  for each row execute function public.claim_pending_invitations();

-- RLS ────────────────────────────────────────────────────────────────
alter table public.businesses         enable row level security;
alter table public.business_members   enable row level security;
alter table public.business_invitations enable row level security;

-- businesses: any member reads; only the owner updates or deletes.
drop policy if exists "businesses member read" on public.businesses;
create policy "businesses member read" on public.businesses for select
  using (public.is_business_member(id, auth.uid()));

drop policy if exists "businesses owner update" on public.businesses;
create policy "businesses owner update" on public.businesses for update
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists "businesses owner delete" on public.businesses;
create policy "businesses owner delete" on public.businesses for delete
  using (owner_user_id = auth.uid());

-- INSERT: any authenticated user can create a business (they become owner).
drop policy if exists "businesses authenticated insert" on public.businesses;
create policy "businesses authenticated insert" on public.businesses for insert
  with check (owner_user_id = auth.uid());

-- business_members: members read their own business roster; owner +
-- admins can add/update/remove.
drop policy if exists "members read own business" on public.business_members;
create policy "members read own business" on public.business_members for select
  using (public.is_business_member(business_id, auth.uid()));

drop policy if exists "members admin write" on public.business_members;
create policy "members admin write" on public.business_members for all
  using (
    public.business_role(business_id, auth.uid()) in ('owner','admin')
    and (role <> 'owner' or public.business_role(business_id, auth.uid()) = 'owner')
  )
  with check (
    public.business_role(business_id, auth.uid()) in ('owner','admin')
    and (role <> 'owner' or public.business_role(business_id, auth.uid()) = 'owner')
  );

-- Let a member leave their own business (delete their own row) without
-- being an admin — same UX as GitHub "Leave organization".
drop policy if exists "members self leave" on public.business_members;
create policy "members self leave" on public.business_members for delete
  using (user_id = auth.uid() and role <> 'owner');

-- business_invitations: only admins of the target business see, create,
-- delete. Public read is intentionally NOT granted — the invited email
-- discovers the invite when they sign up (via the claim trigger).
drop policy if exists "invitations admin all" on public.business_invitations;
create policy "invitations admin all" on public.business_invitations for all
  using (public.business_role(business_id, auth.uid()) in ('owner','admin'))
  with check (public.business_role(business_id, auth.uid()) in ('owner','admin'));
