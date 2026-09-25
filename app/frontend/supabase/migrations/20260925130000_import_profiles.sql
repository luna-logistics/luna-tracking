-- Product CSV import profiles — remember how to read a given source.
--
-- A profile is recognised automatically on the next upload by its header
-- signature (sorted, lower-cased column names). It carries:
--   * the store every row belongs to (the scraper's store_slug is ignored);
--   * cleaning rules (jsonb): strip "- 4.95 € (25.09.2026)" from
--     descriptions, fix ×1000 prices when the description disagrees,
--     strip the scraper's random slug suffix, maximum plausible price;
--   * category mappings: a source_category path (or a prefix of it, e.g.
--     "Home > Aliments & boissons > Confiseries & snacks") → a Luna
--     category + product_type (feeds the eligibility filter), or 'skip'
--     (never import: e.g. "Home > Services de Lidl"). Longest prefix wins.
-- Every mapping validated once in the import preview is re-applied to the
-- next files of the same source. Admin-only.
--
-- product_sources.eligibility_status also accepts 'forced': a row the
-- eligibility filter left "to verify" (never an excluded one) that an admin
-- explicitly chose to import anyway.

create table if not exists public.import_profiles (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name             text not null check (length(trim(name)) > 0),
  header_signature text not null,
  store_id         uuid references public.stores(id) on delete set null,
  rules            jsonb not null default '{}'::jsonb,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists import_profiles_signature_idx on public.import_profiles (header_signature);

create table if not exists public.import_category_mappings (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.import_profiles(id) on delete cascade,
  source_category text not null check (length(trim(source_category)) > 0),
  action          text not null default 'map' check (action in ('map', 'skip')),
  category_id     uuid references public.product_categories(id) on delete cascade,
  product_type    text check (product_type in ('food', 'clothing', 'hygiene', 'household', 'other')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (profile_id, source_category),
  constraint import_mapping_target check (action = 'skip' or (category_id is not null and product_type is not null))
);

alter table public.import_profiles enable row level security;
alter table public.import_category_mappings enable row level security;

drop policy if exists import_profiles_admin on public.import_profiles;
create policy import_profiles_admin on public.import_profiles for all
  using ((select is_admin((select auth.uid())))) with check ((select is_admin((select auth.uid()))));
drop policy if exists import_mappings_admin on public.import_category_mappings;
create policy import_mappings_admin on public.import_category_mappings for all
  using ((select is_admin((select auth.uid())))) with check ((select is_admin((select auth.uid()))));
revoke all on public.import_profiles, public.import_category_mappings from anon;

drop trigger if exists import_profiles_touch on public.import_profiles;
create trigger import_profiles_touch before update on public.import_profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists import_category_mappings_touch on public.import_category_mappings;
create trigger import_category_mappings_touch before update on public.import_category_mappings
  for each row execute function public.touch_updated_at();

alter table public.product_sources drop constraint if exists product_sources_eligibility_status_check;
alter table public.product_sources add constraint product_sources_eligibility_status_check
  check (eligibility_status is null or eligibility_status in ('accepted', 'forced'));
