-- Stores + product↔store link (Option A) + 1:1 source traceability.
-- Does not touch the 10 demo products (store_id stays NULL) nor orders/quotes.

create table public.stores (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  logo_url      text,
  store_type    text not null default 'food',
  country       text not null default 'BE',
  is_active     boolean not null default true,
  display_order integer not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint stores_store_type_check
    check (store_type in ('food', 'clothing', 'hygiene', 'diy', 'other'))
);

alter table public.stores enable row level security;
create policy "stores public read" on public.stores for select using (true);
create policy "stores admin write" on public.stores for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create trigger stores_touch before update on public.stores
  for each row execute function public.touch_updated_at();

-- Product -> store (RESTRICT: disable a store, never delete one with products).
alter table public.products
  add column store_id uuid references public.stores(id) on delete restrict;
create index products_store_id_idx on public.products(store_id);

-- Informational attributes (on products for display/filtering).
alter table public.products
  add column requires_cold_chain boolean,
  add column is_alcoholic        boolean not null default false;

-- 1:1 source traceability.
create table public.product_sources (
  product_id         uuid primary key references public.products(id) on delete cascade,
  store_id           uuid references public.stores(id) on delete restrict,
  source_url         text,
  source_product_id  text,
  source_category    text,
  last_checked_at    timestamptz,
  eligibility_status text check (eligibility_status is null or eligibility_status in ('accepted')),
  eligibility_reason text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index product_sources_store_source_idx
  on public.product_sources(store_id, source_product_id)
  where source_product_id is not null;

alter table public.product_sources enable row level security;
create policy "product_sources admin all" on public.product_sources for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create trigger product_sources_touch before update on public.product_sources
  for each row execute function public.touch_updated_at();

-- store_id is derived from products.store_id (source of truth).
-- Fires on ANY insert/update so a direct edit is snapped back; search_path=''.
create or replace function public.sync_product_source_store()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select p.store_id into new.store_id from public.products p where p.id = new.product_id;
  return new;
end $$;

create trigger product_sources_sync_store
  before insert or update on public.product_sources
  for each row execute function public.sync_product_source_store();

create or replace function public.propagate_product_store()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.product_sources set store_id = new.store_id where product_id = new.id;
  return new;
end $$;

create trigger products_propagate_store
  after update of store_id on public.products
  for each row execute function public.propagate_product_store();
