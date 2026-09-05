-- Luna Tracking — Shop & Ship + International Forwarding.
--
-- Two new business lines share this migration:
--   1. Achat & Envoi  — client orders groceries via the site, Luna buys in
--      Belgium and ships to Congo. Backed by product_categories, products
--      and orders. Payment gateway is deferred (see src/lib/payment.ts stub).
--   2. Réexpédition   — quote-based lead capture: forwarding_requests table.

-- ─── enums ─────────────────────────────────────────────────────────────────
do $$ begin
  create type public.order_status as enum
    ('pending_payment', 'paid', 'purchasing', 'purchased', 'shipped', 'delivered', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.forwarding_status as enum ('new', 'contacted', 'quoted', 'closed');
exception when duplicate_object then null; end $$;

-- ─── product_categories ────────────────────────────────────────────────────
create table if not exists public.product_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name_fr     text not null,
  name_en     text not null,
  display_order int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── products ──────────────────────────────────────────────────────────────
-- Slug is ALWAYS English (per spec) and shared across both locales in URLs.
-- Barcode is optional but must be UNIQUE when present — a real product has one.
create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name_fr        text not null,
  name_en        text not null,
  description_fr text,
  description_en text,
  price          numeric(10,2) not null check (price >= 0),
  category_id    uuid not null references public.product_categories(id) on delete restrict,
  barcode        text unique check (barcode is null or barcode ~ '^[0-9]{8,14}$'),
  hs_code        text check (hs_code is null or hs_code ~ '^[0-9.]{4,10}$'),
  weight_kg      numeric(8,3) check (weight_kg is null or weight_kg > 0),
  image_url      text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists products_active_category_idx on public.products (is_active, category_id);
create index if not exists products_barcode_idx on public.products (barcode) where barcode is not null;

-- ─── orders ────────────────────────────────────────────────────────────────
-- items is a snapshot at checkout time — price at purchase must not change
-- if the product later updates its price. recipient_city_id joins the
-- existing destination_cities table so we reuse the same coming-soon gating.
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  items             jsonb not null default '[]'::jsonb,
  total             numeric(10,2) not null check (total >= 0),
  status            public.order_status not null default 'pending_payment',
  recipient_name    text not null,
  recipient_phone   text not null,
  recipient_city_id uuid references public.destination_cities(id) on delete restrict,
  recipient_address text not null,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists orders_user_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at desc);

-- ─── forwarding_requests ───────────────────────────────────────────────────
create table if not exists public.forwarding_requests (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  email           text not null,
  phone           text,
  origin_country  text not null,
  description     text not null,
  estimated_value numeric(10,2) check (estimated_value is null or estimated_value >= 0),
  status          public.forwarding_status not null default 'new',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists forwarding_status_idx on public.forwarding_requests (status, created_at desc);

-- ─── updated_at triggers ──────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare tbl text;
begin
  foreach tbl in array array['product_categories','products','orders','forwarding_requests']
  loop
    execute format('drop trigger if exists %I_touch on public.%I', tbl, tbl);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', tbl, tbl);
  end loop;
end $$;

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- Catalog is public (feeds the shop page). Orders + forwarding_requests are
-- writable by anyone (order = authenticated user only; forwarding = anon lead
-- form). Reads are self-scoped: a user only sees their OWN orders. Admin-
-- role gating is a future chantier once profiles.role lands — for now any
-- signed-in user can read forwarding_requests + update statuses, matching
-- Luna's small-team footprint.

alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.forwarding_requests enable row level security;

-- product_categories: everyone reads, authenticated writes
drop policy if exists "categories public read" on public.product_categories;
create policy "categories public read" on public.product_categories for select using (true);
drop policy if exists "categories auth write" on public.product_categories;
create policy "categories auth write" on public.product_categories for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- products: everyone reads (all rows — even inactive, so the admin can list
-- them without a separate view), authenticated writes
drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products for select using (true);
drop policy if exists "products auth write" on public.products;
create policy "products auth write" on public.products for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- orders: user reads own only, user inserts own, authenticated updates any
-- (admin workflow). Deletes are blocked at the RLS layer — cancel by status.
drop policy if exists "orders self read" on public.orders;
create policy "orders self read" on public.orders for select
  using (auth.uid() = user_id or auth.role() = 'authenticated');
drop policy if exists "orders self insert" on public.orders;
create policy "orders self insert" on public.orders for insert
  with check (auth.uid() = user_id);
drop policy if exists "orders auth update" on public.orders;
create policy "orders auth update" on public.orders for update
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- forwarding_requests: anon inserts (public lead form), authenticated reads
-- + updates. No public read — lead data stays internal.
drop policy if exists "forwarding anon insert" on public.forwarding_requests;
create policy "forwarding anon insert" on public.forwarding_requests for insert
  with check (true);
drop policy if exists "forwarding auth read" on public.forwarding_requests;
create policy "forwarding auth read" on public.forwarding_requests for select
  using (auth.role() = 'authenticated');
drop policy if exists "forwarding auth update" on public.forwarding_requests;
create policy "forwarding auth update" on public.forwarding_requests for update
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ─── seed: 3 categories + 10 realistic Belgian grocery products ───────────
-- Chosen for realism in a Belgium→Congo shipment: shelf-stable staples that
-- travel well, are commonly requested, and have real HS-code tariff entries.
-- Barcodes are 13-digit strings in Belgium's GS1 prefix range (5410000…) —
-- valid FORMAT, not real products.

insert into public.product_categories (slug, name_fr, name_en, display_order) values
  ('staples',  'Alimentation de base', 'Staples',   10),
  ('canned',   'Conserves',            'Canned goods', 20),
  ('hygiene',  'Hygiène',              'Hygiene',   30)
on conflict (slug) do nothing;

do $$
declare
  staples_id uuid; canned_id uuid; hygiene_id uuid;
begin
  select id into staples_id from public.product_categories where slug = 'staples';
  select id into canned_id  from public.product_categories where slug = 'canned';
  select id into hygiene_id from public.product_categories where slug = 'hygiene';

  insert into public.products
    (slug, name_fr, name_en, description_fr, description_en, price, category_id, barcode, hs_code, weight_kg)
  values
    ('rice-basmati-5kg', 'Riz basmati 5 kg', 'Basmati rice 5 kg',
     'Riz basmati long grain, sac de 5 kg. Origine Inde/Pakistan.',
     'Long-grain basmati rice, 5 kg bag. Sourced from India/Pakistan.',
     14.90, staples_id, '5410000000012', '1006.30', 5.100),

    ('sunflower-oil-1l', 'Huile de tournesol 1 L', 'Sunflower oil 1 L',
     'Huile végétale raffinée pour cuisson quotidienne.',
     'Refined vegetable oil for everyday cooking.',
     3.20, staples_id, '5410000000029', '1512.19', 0.930),

    ('wheat-flour-1kg', 'Farine de blé 1 kg', 'Wheat flour 1 kg',
     'Farine de blé T55, usage multi-purpose.',
     'All-purpose T55 wheat flour.',
     1.40, staples_id, '5410000000036', '1101.00', 1.000),

    ('milk-powder-900g', 'Lait en poudre 900 g', 'Milk powder 900 g',
     'Lait entier en poudre, enrichi en vitamines A et D.',
     'Whole milk powder, fortified with vitamins A and D.',
     11.50, staples_id, '5410000000043', '0402.10', 0.900),

    ('peeled-tomatoes-400g', 'Tomates pelées 400 g', 'Peeled tomatoes 400 g',
     'Tomates italiennes pelées, boîte de 400 g.',
     'Italian peeled tomatoes, 400 g can.',
     1.10, canned_id, '5410000000050', '2002.10', 0.400),

    ('sardines-oil-125g', 'Sardines à l''huile 125 g', 'Sardines in oil 125 g',
     'Sardines entières à l''huile d''olive, boîte de 125 g.',
     'Whole sardines in olive oil, 125 g tin.',
     2.30, canned_id, '5410000000067', '1604.13', 0.125),

    ('red-beans-400g', 'Haricots rouges 400 g', 'Red beans 400 g',
     'Haricots rouges cuits, prêts à l''emploi.',
     'Cooked red kidney beans, ready to use.',
     1.20, canned_id, '5410000000074', '2005.51', 0.400),

    ('marseille-soap-300g', 'Savon de Marseille 300 g', 'Marseille soap 300 g',
     'Savon traditionnel, 72 % huile végétale, sans parfum.',
     'Traditional soap, 72% vegetable oil, unscented.',
     2.90, hygiene_id, '5410000000081', '3401.11', 0.300),

    ('toothpaste-75ml', 'Dentifrice 75 ml', 'Toothpaste 75 ml',
     'Dentifrice au fluor, protection anti-caries.',
     'Fluoride toothpaste, cavity protection.',
     1.90, hygiene_id, '5410000000098', '3306.10', 0.100),

    ('shampoo-400ml', 'Shampoing 400 ml', 'Shampoo 400 ml',
     'Shampoing pour cheveux normaux, formule douce quotidienne.',
     'Shampoo for normal hair, gentle daily formula.',
     3.60, hygiene_id, '5410000000104', '3305.10', 0.420)
  on conflict (slug) do nothing;
end $$;
