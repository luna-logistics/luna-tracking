-- Luna Tracking — user profiles + account type.
--
-- Adds an application-level profile row for every auth.users record so
-- we can (a) route new users through an onboarding step where they pick
-- "particulier" vs "indépendant/entreprise", and (b) branch the whole
-- authenticated area between two very different dashboards.
--
-- Design:
--   * profiles.id = auth.users.id (1:1). No standalone PK — coupling the
--     lifecycles avoids orphan rows.
--   * account_type is CHECKED to a small enum but stored as text so
--     future values (e.g. 'freelance', 'ngo') can be added by CHECK
--     replacement without a full type migration.
--   * onboarded_at NULL = still on the "choose your account type"
--     screen; NOT NULL = they've made the pick.
--   * Existing users (there are a handful of test accounts + the admin)
--     get backfilled to 'individual' and marked onboarded — no forced
--     re-onboarding for anyone already active.
--   * handle_new_user() trigger inserts a profiles row on signup so the
--     frontend never has to worry about race conditions between auth
--     and the profile fetch.
--
-- RLS: strict owner-only. Even the admin can't read other users'
-- profiles by default (a future admin-user-management page would go
-- through a SECURITY DEFINER RPC scoped to is_admin()).

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  account_type  text
    check (account_type is null or account_type in ('individual','business')),
  onboarded_at  timestamptz,
  full_name     text,
  phone         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Auto-create profile on signup ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill existing users: give them a profile pre-set to 'individual'
-- + onboarded so nobody sees the onboarding screen unexpectedly. Anyone
-- who really wants a business account can flip it later from their
-- profile page.
insert into public.profiles (id, account_type, onboarded_at)
select id, 'individual', now() from auth.users
on conflict (id) do update
  set account_type = coalesce(public.profiles.account_type, 'individual'),
      onboarded_at = coalesce(public.profiles.onboarded_at, now());

-- ─── RLS ────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles owner read" on public.profiles;
create policy "profiles owner read" on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles owner update" on public.profiles;
create policy "profiles owner update" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- Insert is normally handled by the trigger but allow authenticated
-- self-insert as a fallback (idempotent because of the PK).
drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles for insert
  with check (auth.uid() = id);
