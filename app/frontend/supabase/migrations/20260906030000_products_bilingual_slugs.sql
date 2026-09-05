-- Luna Tracking — products: bilingual slugs (slug_fr + slug_en).
--
-- Same rule as blog: no EN URL should be forced into FR.
-- /achat-envoi/{slug_fr}  ·  /en/shop-and-ship/{slug_en}
--
-- Backfills the 10 seeded products with proper French slugs; other rows
-- (admin-created) fall back to the existing slug for both columns and
-- can be edited later in /admin/produits.

alter table public.products
  add column if not exists slug_fr text,
  add column if not exists slug_en text;

-- EN column always seeded from the existing English `slug` column
-- (the original single-slug design was English-only).
update public.products set slug_en = slug where slug_en is null and slug is not null;

-- FR seed for the 10 shipped products.
update public.products set slug_fr = 'riz-basmati-5kg'      where slug = 'rice-basmati-5kg'     and slug_fr is null;
update public.products set slug_fr = 'huile-tournesol-1l'   where slug = 'sunflower-oil-1l'     and slug_fr is null;
update public.products set slug_fr = 'farine-ble-1kg'       where slug = 'wheat-flour-1kg'      and slug_fr is null;
update public.products set slug_fr = 'lait-poudre-900g'     where slug = 'milk-powder-900g'     and slug_fr is null;
update public.products set slug_fr = 'tomates-pelees-400g'  where slug = 'peeled-tomatoes-400g' and slug_fr is null;
update public.products set slug_fr = 'sardines-huile-125g'  where slug = 'sardines-oil-125g'    and slug_fr is null;
update public.products set slug_fr = 'haricots-rouges-400g' where slug = 'red-beans-400g'       and slug_fr is null;
update public.products set slug_fr = 'savon-marseille-300g' where slug = 'marseille-soap-300g'  and slug_fr is null;
update public.products set slug_fr = 'dentifrice-75ml'      where slug = 'toothpaste-75ml'      and slug_fr is null;
update public.products set slug_fr = 'shampoing-400ml'      where slug = 'shampoo-400ml'        and slug_fr is null;

-- Anything else still without a FR slug — fall back to the EN slug (safe
-- default; admin can rename via /admin/produits).
update public.products set slug_fr = slug where slug_fr is null and slug is not null;

do $$
begin
  if not exists (select 1 from public.products where slug_fr is null) then
    alter table public.products alter column slug_fr set not null;
  end if;
  if not exists (select 1 from public.products where slug_en is null) then
    alter table public.products alter column slug_en set not null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_slug_fr_key') then
    alter table public.products add constraint products_slug_fr_key unique (slug_fr);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_slug_en_key') then
    alter table public.products add constraint products_slug_en_key unique (slug_en);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_slug_fr_format') then
    alter table public.products add constraint products_slug_fr_format check (slug_fr ~ '^[a-z0-9-]+$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_slug_en_format') then
    alter table public.products add constraint products_slug_en_format check (slug_en ~ '^[a-z0-9-]+$');
  end if;
end $$;

-- Drop the legacy single-slug unique so the FR variant of one product
-- can freely reuse the EN slug of another. The `slug` column itself
-- stays for the roll-forward window; frontend stops reading it.
alter table public.products drop constraint if exists products_slug_key;
