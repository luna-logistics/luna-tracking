-- Luna Tracking — admin role gating.
--
-- Now that public signup is live, "any authenticated user" is no longer a safe
-- proxy for admin (it just means "signed up"). This migration:
--   1. Creates admin_users — a simple allowlist. A row for a user_id grants
--      admin rights everywhere.
--   2. Defines is_admin(uuid) as SECURITY DEFINER so any caller can check
--      their own admin status without needing SELECT on admin_users itself.
--   3. Rewrites RLS on the 5 tables that previously used auth.role() =
--      'authenticated' as a stand-in for "admin".
--
-- The public paths that must keep working:
--   - Anyone reads public catalog (products, product_categories) + destination_cities.
--   - Signed-in user inserts their OWN order at checkout.
--   - Signed-in user reads their OWN orders on /compte/commandes.
--   - Anonymous visitor submits a forwarding lead form.

-- ─── admin_users allowlist ─────────────────────────────────────────────────
create table if not exists public.admin_users (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- ─── is_admin() helper — MUST be created BEFORE any policy references it ──
-- SECURITY DEFINER runs with the table owner's rights, so the RLS-blocked
-- admin_users read succeeds. `stable` because it's a pure lookup with no
-- side effects — Postgres can cache it per statement.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = uid);
$$;

-- The empty-set case (uid null, or user not in the table) returns false, which
-- is the correct default. Grant EXECUTE to both anon (so anon RLS predicates
-- can safely reference it without granting extra rights) and authenticated.
grant execute on function public.is_admin(uuid) to anon, authenticated;

-- ─── admin_users own policies (now that is_admin exists) ──────────────────
-- Only admins can read the table (would-be-admin themselves can't enumerate
-- other admins). is_admin() bypasses this via SECURITY DEFINER, so a user
-- can still check "am I an admin?".
drop policy if exists "admin_users admin read" on public.admin_users;
create policy "admin_users admin read" on public.admin_users for select
  using (public.is_admin(auth.uid()));

drop policy if exists "admin_users admin write" on public.admin_users;
create policy "admin_users admin write" on public.admin_users for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ─── rewrite policies on the other tables ─────────────────────────────────

-- product_categories: everyone reads; only admins write.
drop policy if exists "categories public read" on public.product_categories;
drop policy if exists "categories auth write" on public.product_categories;
drop policy if exists "categories admin write" on public.product_categories;
create policy "categories public read" on public.product_categories for select using (true);
create policy "categories admin write" on public.product_categories for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- products: everyone reads (public catalog); only admins write.
drop policy if exists "products public read" on public.products;
drop policy if exists "products auth write" on public.products;
drop policy if exists "products admin write" on public.products;
create policy "products public read" on public.products for select using (true);
create policy "products admin write" on public.products for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- orders:
--   SELECT — user reads own OR admin reads all (previous policy leaked every
--            order to every signed-in user; that was the bug this fixes).
--   INSERT — user inserts own only (unchanged).
--   UPDATE — admin only (was any-authenticated).
drop policy if exists "orders self read" on public.orders;
drop policy if exists "orders self insert" on public.orders;
drop policy if exists "orders auth update" on public.orders;
drop policy if exists "orders admin update" on public.orders;
create policy "orders self read" on public.orders for select
  using (auth.uid() = user_id or public.is_admin(auth.uid()));
create policy "orders self insert" on public.orders for insert
  with check (auth.uid() = user_id);
create policy "orders admin update" on public.orders for update
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- forwarding_requests:
--   INSERT — anon (the public lead form; unchanged).
--   SELECT — admin only (was any-authenticated).
--   UPDATE — admin only (was any-authenticated).
drop policy if exists "forwarding anon insert" on public.forwarding_requests;
drop policy if exists "forwarding auth read" on public.forwarding_requests;
drop policy if exists "forwarding auth update" on public.forwarding_requests;
drop policy if exists "forwarding admin read" on public.forwarding_requests;
drop policy if exists "forwarding admin update" on public.forwarding_requests;
create policy "forwarding anon insert" on public.forwarding_requests for insert with check (true);
create policy "forwarding admin read" on public.forwarding_requests for select
  using (public.is_admin(auth.uid()));
create policy "forwarding admin update" on public.forwarding_requests for update
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- destination_cities: everyone reads (feeds the public /tarifs form); only
-- admins toggle active / coming_soon. Previously any authenticated user could.
drop policy if exists "destination_cities public read" on public.destination_cities;
drop policy if exists "destination_cities auth write" on public.destination_cities;
drop policy if exists "destination_cities auth insert" on public.destination_cities;
drop policy if exists "destination_cities admin write" on public.destination_cities;
create policy "destination_cities public read" on public.destination_cities for select using (true);
create policy "destination_cities admin write" on public.destination_cities for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ─── bootstrap ─────────────────────────────────────────────────────────────
-- Grant admin to the initial account by uncommenting this after replacing the
-- email. See docs/HANDOFF.md for the full snippet — it's separate because it
-- MUST be a manual, deliberate step (not something the migration runs blind).
--
--   insert into public.admin_users (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict (user_id) do nothing;
