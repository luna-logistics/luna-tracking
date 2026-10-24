-- Product types become a table the admin can extend.
--
-- Until now the type of an imported product (it feeds the eligibility
-- filter) was one of five values hard-coded in a CHECK constraint, so an
-- import of perfume or electronics could only be filed under "other". The
-- admin can now create a type ("Électronique", "Parfum & beauté"…) from the
-- CSV import or from Admin → Produits → Types.
--
--   * slug         the value stored in import_category_mappings.product_type
--                  and in a CSV's product_type column;
--   * name_fr/en   labels shown in the admin;
--   * auto_accept  products of this type are accepted by the eligibility
--                  filter without a per-product review (for families with
--                  no cold-chain risk, e.g. electronics). Off by default:
--                  a new type's products stay "to verify" like today.
-- The five historical types are seeded; "food" keeps its own rules in code
-- and its auto_accept flag is ignored there.

create table if not exists public.product_types (
  slug          text primary key check (slug ~ '^[a-z0-9-]+$' and length(slug) <= 40),
  name_fr       text not null check (length(trim(name_fr)) > 0),
  name_en       text not null check (length(trim(name_en)) > 0),
  auto_accept   boolean not null default false,
  display_order integer not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

insert into public.product_types (slug, name_fr, name_en, display_order) values
  ('food', 'Alimentaire', 'Food', 10),
  ('hygiene', 'Hygiène & beauté', 'Hygiene & beauty', 20),
  ('household', 'Entretien & maison', 'Household', 30),
  ('clothing', 'Vêtements', 'Clothing', 40),
  ('other', 'Autre', 'Other', 90)
on conflict (slug) do nothing;

alter table public.product_types enable row level security;
drop policy if exists product_types_admin on public.product_types;
create policy product_types_admin on public.product_types for all
  using ((select is_admin((select auth.uid())))) with check ((select is_admin((select auth.uid()))));
revoke all on public.product_types from anon;

drop trigger if exists product_types_touch on public.product_types;
create trigger product_types_touch before update on public.product_types
  for each row execute function public.touch_updated_at();

-- Mappings now point at the table instead of the fixed list.
alter table public.import_category_mappings drop constraint if exists import_category_mappings_product_type_check;
alter table public.import_category_mappings drop constraint if exists import_category_mappings_product_type_fkey;
alter table public.import_category_mappings add constraint import_category_mappings_product_type_fkey
  foreign key (product_type) references public.product_types(slug) on update cascade on delete restrict;
