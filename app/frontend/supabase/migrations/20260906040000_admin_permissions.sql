-- Luna Tracking — per-admin section permissions.
--
-- Adds admin_users.permissions (jsonb) — a set of section keys the admin
-- is allowed to touch. Existing admins get every permission (backward
-- compat: they were full-access before this migration). New admins
-- added via /admin/collaborateurs start empty and can be granted
-- section-by-section.
--
-- Permission keys (must match the AdminPermission union in the frontend):
--   destinations, products, orders, forwarding, auth_providers,
--   content, blog, admins
--
-- Storage shape: {"all": true} OR {"destinations": true, "products": true, ...}
-- 'all' is a convenience meaning every section. The frontend can(x)
-- helper accepts either shape.
--
-- Note: this is UX-layer gating, not RLS-layer. Any admin can still
-- write to any table at the DB layer via is_admin(). Real per-section
-- DB security is a future chantier (would need per-table policies that
-- read permissions).

alter table public.admin_users
  add column if not exists permissions jsonb not null default '{"all": true}'::jsonb;

-- Existing rows already default to {"all": true} thanks to the default —
-- but a row inserted BEFORE this migration ran would have had no column,
-- so backfill defensively.
update public.admin_users
  set permissions = '{"all": true}'::jsonb
  where permissions is null or permissions = '{}'::jsonb;

-- Helper: check whether an admin has a specific permission. Returns
-- false for non-admins (which is what the caller expects).
create or replace function public.admin_has_permission(uid uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (permissions->>'all')::boolean or (permissions->>perm)::boolean
     from public.admin_users where user_id = uid),
    false
  );
$$;

grant execute on function public.admin_has_permission(uuid, text) to anon, authenticated;

-- ─── auth.users bridge RPCs ───────────────────────────────────────────────
-- PostgREST doesn't expose auth.users. Two admin-only helpers that read
-- from it via SECURITY DEFINER so the /admin/collaborateurs page can
-- resolve emails and look up user_ids by email — without granting broad
-- read on auth.users.

-- Look up ONE user_id by email (case-insensitive). Returns null if none.
-- Admin-only guard inside the function body so a non-admin call returns
-- null (not "permission denied") — the frontend surfaces a friendlier
-- "no such user" hint when null comes back.
create or replace function public.user_id_for_email(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found uuid;
begin
  if not public.is_admin(auth.uid()) then return null; end if;
  select id into found from auth.users where lower(email) = lower(p_email) limit 1;
  return found;
end $$;

-- List email addresses for every admin (used to render the list on
-- /admin/collaborateurs). Admin-only.
create or replace function public.admin_emails()
returns table (user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then return; end if;
  return query
    select au.user_id, u.email::text
    from public.admin_users au
    join auth.users u on u.id = au.user_id;
end $$;

grant execute on function public.user_id_for_email(text) to authenticated;
grant execute on function public.admin_emails() to authenticated;
