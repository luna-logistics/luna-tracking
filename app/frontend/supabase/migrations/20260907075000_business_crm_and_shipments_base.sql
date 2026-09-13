-- Reference baseline for the CRM + shipments core.
--
-- These six tables (business_customers, customer_addresses, shipments,
-- shipment_packages, shipment_charges, shipment_templates) were applied
-- to the live project during Phase 3/5 but their original CREATE TABLE
-- migrations were never committed to the repo — later migrations
-- (documents, events, tracking, quotes, invoices, reports, webhooks)
-- only ALTER or reference them. A fresh `supabase db push` therefore
-- could not rebuild the schema.
--
-- This file reconstructs that base, transcribed verbatim from the live
-- database's authoritative definitions. It is dated 20260907075000 so it
-- runs AFTER 20260907070000_businesses.sql (which defines touch_updated_at,
-- is_business_member and business_role) and BEFORE the first dependent
-- migration (20260907080000_shipment_documents). Everything is idempotent
-- (create ... if not exists / create or replace / drop ... if exists), so
-- applying it to the existing project is a no-op — it neither drops nor
-- recreates the live tables. The tracking_token/tracking_enabled columns
-- and the events/webhooks triggers are intentionally omitted here: they
-- are added by their own later migrations (100000, 090000, 160000).

-- ─── business_customers ─────────────────────────────────────────
create table if not exists public.business_customers (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  customer_type  text not null default 'company' check (customer_type in ('individual','company')),
  display_name   text not null check (length(trim(display_name)) > 0),
  company_name   text,
  first_name     text,
  last_name      text,
  email          text,
  phone          text,
  vat_number     text,
  company_number text,
  notes          text,
  is_active      boolean not null default true,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists business_customers_biz_idx     on public.business_customers (business_id);
create index if not exists business_customers_active_idx  on public.business_customers (business_id, is_active);
create index if not exists business_customers_display_idx on public.business_customers (business_id, lower(display_name));

alter table public.business_customers enable row level security;
drop policy if exists "customers member read" on public.business_customers;
create policy "customers member read" on public.business_customers
  for select using (public.is_business_member(business_id, auth.uid()));
drop policy if exists "customers manager write" on public.business_customers;
create policy "customers manager write" on public.business_customers
  for all using (public.business_role(business_id, auth.uid()) = any (array['owner','admin','manager','operations']))
  with check (public.business_role(business_id, auth.uid()) = any (array['owner','admin','manager','operations']));

drop trigger if exists business_customers_touch on public.business_customers;
create trigger business_customers_touch before update on public.business_customers
  for each row execute function public.touch_updated_at();

-- ─── customer_addresses ─────────────────────────────────────────
create table if not exists public.customer_addresses (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references public.business_customers(id) on delete cascade,
  label               text,
  address_line1       text not null,
  address_line2       text,
  postal_code         text,
  city                text,
  country             text not null default 'BE' check (length(country) = 2 and country = upper(country)),
  is_default_billing  boolean not null default false,
  is_default_shipping boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists customer_addresses_customer_idx on public.customer_addresses (customer_id);

alter table public.customer_addresses enable row level security;
drop policy if exists "addresses member read" on public.customer_addresses;
create policy "addresses member read" on public.customer_addresses
  for select using (exists (
    select 1 from public.business_customers c
    where c.id = customer_id and public.is_business_member(c.business_id, auth.uid())));
drop policy if exists "addresses manager write" on public.customer_addresses;
create policy "addresses manager write" on public.customer_addresses
  for all using (exists (
    select 1 from public.business_customers c
    where c.id = customer_id and public.business_role(c.business_id, auth.uid()) = any (array['owner','admin','manager','operations'])))
  with check (exists (
    select 1 from public.business_customers c
    where c.id = customer_id and public.business_role(c.business_id, auth.uid()) = any (array['owner','admin','manager','operations'])));

drop trigger if exists customer_addresses_touch on public.customer_addresses;
create trigger customer_addresses_touch before update on public.customer_addresses
  for each row execute function public.touch_updated_at();

-- ─── shipments (base; tracking columns added by 100000) ─────────
create table if not exists public.shipments (
  id                        uuid primary key default gen_random_uuid(),
  business_id               uuid not null references public.businesses(id) on delete cascade,
  customer_id               uuid references public.business_customers(id) on delete restrict,
  reference                 text not null,
  direction                 text not null default 'export' check (direction in ('export','import','domestic')),
  mode                      text not null default 'road'   check (mode in ('air','sea','road','rail','multi')),
  status                    text not null default 'draft'
                            check (status in ('draft','quoted','booked','received','in_transit','customs','delivered','cancelled')),
  incoterm                  text check (incoterm is null or (length(incoterm) >= 3 and length(incoterm) <= 5)),
  origin_name               text,
  origin_address_line1      text,
  origin_address_line2      text,
  origin_postal_code        text,
  origin_city               text,
  origin_country            text check (origin_country is null or (length(origin_country) = 2 and origin_country = upper(origin_country))),
  destination_name          text,
  destination_address_line1 text,
  destination_address_line2 text,
  destination_postal_code   text,
  destination_city          text,
  destination_country       text check (destination_country is null or (length(destination_country) = 2 and destination_country = upper(destination_country))),
  carrier_name              text,
  tracking_number           text,
  estimated_pickup          date,
  estimated_delivery        date,
  actual_pickup             date,
  actual_delivery           date,
  total_weight_kg           numeric,
  total_volume_m3           numeric,
  goods_value               numeric,
  currency                  text not null default 'EUR' check (currency in ('EUR','USD','GBP','CDF','CHF','CAD','XOF','XAF')),
  notes                     text,
  created_by                uuid references auth.users(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (business_id, reference)
);
create index if not exists shipments_biz_status_idx on public.shipments (business_id, status);
create index if not exists shipments_customer_idx   on public.shipments (customer_id) where customer_id is not null;
create index if not exists shipments_biz_date_idx   on public.shipments (business_id, created_at desc);

alter table public.shipments enable row level security;
drop policy if exists "shipments member read" on public.shipments;
create policy "shipments member read" on public.shipments
  for select using (public.is_business_member(business_id, auth.uid()));
drop policy if exists "shipments manager write" on public.shipments;
create policy "shipments manager write" on public.shipments
  for all using (public.business_role(business_id, auth.uid()) = any (array['owner','admin','manager','operations']))
  with check (public.business_role(business_id, auth.uid()) = any (array['owner','admin','manager','operations']));

-- Per-business gapless-ish reference SHP-NNNNNN (verbatim from live DB).
create or replace function public.shipments_generate_reference()
returns trigger language plpgsql security definer set search_path = public as $$
declare next_n int;
begin
  if new.reference is not null and length(trim(new.reference)) > 0 then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('shipments_ref_' || new.business_id::text));
  select coalesce(max(cast(regexp_replace(reference, '^SHP-', '') as int)), 0) + 1
    into next_n
  from public.shipments
  where business_id = new.business_id and reference ~ '^SHP-\d+$';
  new.reference := 'SHP-' || lpad(next_n::text, 6, '0');
  return new;
end $$;

drop trigger if exists shipments_gen_ref on public.shipments;
create trigger shipments_gen_ref before insert on public.shipments
  for each row execute function public.shipments_generate_reference();
drop trigger if exists shipments_touch on public.shipments;
create trigger shipments_touch before update on public.shipments
  for each row execute function public.touch_updated_at();

-- ─── shipment_packages ──────────────────────────────────────────
create table if not exists public.shipment_packages (
  id                uuid primary key default gen_random_uuid(),
  shipment_id       uuid not null references public.shipments(id) on delete cascade,
  package_index     integer not null default 1,
  description       text,
  quantity          integer not null default 1 check (quantity > 0),
  weight_kg         numeric,
  length_cm         numeric,
  width_cm          numeric,
  height_cm         numeric,
  contents_value    numeric,
  contents_currency text check (contents_currency is null or contents_currency in ('EUR','USD','GBP','CDF','CHF','CAD','XOF','XAF')),
  hs_code           text,
  marks_and_numbers text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists shipment_packages_shipment_idx on public.shipment_packages (shipment_id);

alter table public.shipment_packages enable row level security;
drop policy if exists "packages member read" on public.shipment_packages;
create policy "packages member read" on public.shipment_packages
  for select using (exists (
    select 1 from public.shipments s
    where s.id = shipment_id and public.is_business_member(s.business_id, auth.uid())));
drop policy if exists "packages manager write" on public.shipment_packages;
create policy "packages manager write" on public.shipment_packages
  for all using (exists (
    select 1 from public.shipments s
    where s.id = shipment_id and public.business_role(s.business_id, auth.uid()) = any (array['owner','admin','manager','operations'])))
  with check (exists (
    select 1 from public.shipments s
    where s.id = shipment_id and public.business_role(s.business_id, auth.uid()) = any (array['owner','admin','manager','operations'])));

drop trigger if exists shipment_packages_touch on public.shipment_packages;
create trigger shipment_packages_touch before update on public.shipment_packages
  for each row execute function public.touch_updated_at();

-- ─── shipment_charges ───────────────────────────────────────────
create table if not exists public.shipment_charges (
  id          uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  kind        text not null default 'transport' check (kind in ('transport','handling','insurance','customs','storage','fuel','other')),
  label       text not null,
  amount      numeric not null default 0,
  currency    text not null default 'EUR' check (currency in ('EUR','USD','GBP','CDF','CHF','CAD','XOF','XAF')),
  is_billable boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists shipment_charges_shipment_idx on public.shipment_charges (shipment_id);

alter table public.shipment_charges enable row level security;
drop policy if exists "charges member read" on public.shipment_charges;
create policy "charges member read" on public.shipment_charges
  for select using (exists (
    select 1 from public.shipments s
    where s.id = shipment_id and public.is_business_member(s.business_id, auth.uid())));
drop policy if exists "charges manager write" on public.shipment_charges;
create policy "charges manager write" on public.shipment_charges
  for all using (exists (
    select 1 from public.shipments s
    where s.id = shipment_id and public.business_role(s.business_id, auth.uid()) = any (array['owner','admin','manager','operations'])))
  with check (exists (
    select 1 from public.shipments s
    where s.id = shipment_id and public.business_role(s.business_id, auth.uid()) = any (array['owner','admin','manager','operations'])));

drop trigger if exists shipment_charges_touch on public.shipment_charges;
create trigger shipment_charges_touch before update on public.shipment_charges
  for each row execute function public.touch_updated_at();

-- ─── shipment_templates ─────────────────────────────────────────
create table if not exists public.shipment_templates (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  description text,
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists shipment_templates_biz_idx on public.shipment_templates (business_id);

alter table public.shipment_templates enable row level security;
drop policy if exists "templates member read" on public.shipment_templates;
create policy "templates member read" on public.shipment_templates
  for select using (public.is_business_member(business_id, auth.uid()));
drop policy if exists "templates manager write" on public.shipment_templates;
create policy "templates manager write" on public.shipment_templates
  for all using (public.business_role(business_id, auth.uid()) = any (array['owner','admin','manager','operations']))
  with check (public.business_role(business_id, auth.uid()) = any (array['owner','admin','manager','operations']));

drop trigger if exists shipment_templates_touch on public.shipment_templates;
create trigger shipment_templates_touch before update on public.shipment_templates
  for each row execute function public.touch_updated_at();
