-- ─── One consistent permission model ────────────────────────────
--
-- Old: `admin_users` allowlist checked by `is_admin(uid)`.
-- New: `is_admin(uid)` = owner/admin of the ONE business flagged as
-- "platform" (Luna itself for now). Every existing RLS policy that
-- calls `is_admin(...)` keeps working, but the source of truth is now
-- `business_members` — the same table that gates quotes, shipments,
-- clients, API keys, etc. One model across the whole app.
--
-- `admin_users` is kept as a temporary bridge: `is_admin()` returns
-- true if the user is admin under EITHER the new model OR the legacy
-- allowlist. This lets us reroute the RLS gate to business_role
-- without breaking /admin/collaborateurs, which still writes to
-- `admin_users` with granular per-section permissions. When that UI
-- is migrated to BusinessTeam-style member management, drop the
-- second branch of `is_admin()` and (optionally) `admin_users` itself.
--
-- When a second logistics company eventually joins the platform,
-- add `business_id` to products/orders/forwarding_requests and swap
-- their RLS from `is_admin` to `is_business_member(business_id,uid)`.
-- Separate chantier — not needed today, Luna is the sole tenant.

-- 1. Column that marks the platform business (exactly one row at a time).
alter table public.businesses
  add column if not exists is_platform boolean not null default false;

create unique index if not exists businesses_platform_singleton
  on public.businesses (is_platform) where is_platform;

-- 2. Rewire is_admin(). Same signature, same return type — every
-- existing RLS policy that calls it continues to work.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members m
    join public.businesses b on b.id = m.business_id
    where m.user_id = uid
      and m.role in ('owner','admin')
      and b.is_platform = true
  )
  or exists (
    select 1 from public.admin_users where user_id = uid
  );
$$;

-- 3. Data operation applied once for this deployment (idempotent):
-- mark the existing LUNA business as the platform tenant.
-- Adjust the WHERE clause for your own environment if you fork this.
update public.businesses
   set is_platform = true
 where lower(name) like '%luna%' and is_platform = false
returning id, name;
