-- Luna Tracking — destination cities (Congo).
--
-- The quote form on /tarifs reads this table; the admin at /admin/destinations
-- flips a row between 'active' and 'coming_soon'. Deliberately one table, not
-- a JSON blob or hardcoded list, so a city can move status without a code
-- deploy — and so the schema is already in place when we add more countries.
--
-- No hard deletes from the app: rows lifecycle through status only. That
-- keeps history and prevents a silent removal of a city we've quoted for.

create table if not exists public.destination_cities (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name         text not null,
  country_code char(2) not null default 'CD',
  status       text not null default 'coming_soon' check (status in ('active','coming_soon')),
  display_order int  not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists destination_cities_status_order_idx
  on public.destination_cities (status, display_order);

-- keep updated_at fresh
create or replace function public.destination_cities_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists destination_cities_touch on public.destination_cities;
create trigger destination_cities_touch
  before update on public.destination_cities
  for each row execute function public.destination_cities_touch();

-- RLS: everyone reads (feeds the public quote form), only authenticated users
-- write. Admin-role gating is a future chantier once profiles.role exists —
-- for now, any signed-in user can toggle, matching Luna's tiny team footprint.
alter table public.destination_cities enable row level security;

drop policy if exists "destination_cities public read" on public.destination_cities;
create policy "destination_cities public read"
  on public.destination_cities for select
  using (true);

drop policy if exists "destination_cities auth write" on public.destination_cities;
create policy "destination_cities auth write"
  on public.destination_cities for update
  using (auth.role() = 'authenticated');

drop policy if exists "destination_cities auth insert" on public.destination_cities;
create policy "destination_cities auth insert"
  on public.destination_cities for insert
  with check (auth.role() = 'authenticated');

-- Seed: Kinshasa alone is active at launch. The others are pre-seeded as
-- 'coming_soon' so the schema does NOT need a migration to add them later —
-- the admin can flip them on when Luna is ready to serve them.
--
-- City choice: population + trade-route relevance for Belgium↔DRC freight.
-- Kinshasa (capital, primary import port). Lubumbashi (Katanga mining hub).
-- Mbuji-Mayi (Kasai, third-largest city). Kisangani (Congo river hub, east).
-- Goma (North Kivu, Great Lakes trade). Matadi (main Atlantic seaport, near
-- Kinshasa — often the actual entry point for maritime freight).
insert into public.destination_cities (slug, name, country_code, status, display_order) values
  ('kinshasa',    'Kinshasa',    'CD', 'active',      10),
  ('matadi',      'Matadi',      'CD', 'coming_soon', 20),
  ('lubumbashi',  'Lubumbashi',  'CD', 'coming_soon', 30),
  ('mbuji-mayi',  'Mbuji-Mayi',  'CD', 'coming_soon', 40),
  ('kisangani',   'Kisangani',   'CD', 'coming_soon', 50),
  ('goma',        'Goma',        'CD', 'coming_soon', 60)
on conflict (slug) do nothing;
