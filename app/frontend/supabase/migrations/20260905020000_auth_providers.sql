-- Luna Tracking — social auth provider toggles.
--
-- One row per OAuth provider we might offer (Google, Facebook, ...). The
-- `enabled` flag controls whether the button appears on /connexion and
-- /inscription. Client ID / Secret live in the Supabase dashboard's Auth
-- Providers section — NOT here (never in a browser-readable table).
--
-- Public read is required: the login/signup pages need to know which
-- buttons to render BEFORE the visitor authenticates.

create table if not exists public.auth_providers (
  id         uuid primary key default gen_random_uuid(),
  provider   text not null unique check (provider ~ '^[a-z]+$'),
  enabled    boolean not null default false,
  updated_at timestamptz not null default now()
);

drop trigger if exists auth_providers_touch on public.auth_providers;
create trigger auth_providers_touch
  before update on public.auth_providers
  for each row execute function public.touch_updated_at();

alter table public.auth_providers enable row level security;

drop policy if exists "auth_providers public read" on public.auth_providers;
create policy "auth_providers public read" on public.auth_providers for select using (true);

drop policy if exists "auth_providers admin write" on public.auth_providers;
create policy "auth_providers admin write" on public.auth_providers for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Seed: both providers we scaffold, disabled by default. Admin flips the
-- toggle in /admin/auth-sociale AFTER configuring credentials in Supabase.
insert into public.auth_providers (provider, enabled) values
  ('google',   false),
  ('facebook', false)
on conflict (provider) do nothing;
