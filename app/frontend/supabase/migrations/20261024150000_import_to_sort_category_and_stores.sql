-- CSV import: nothing the admin can complete in bulk later blocks a row.
--
-- * "À classer" / "To sort": the category of imported products Luna could
--   not place (no category in the file, none guessed from the store's
--   category path, no import mapping). products.category_id is NOT NULL, so
--   these rows need a real category; the admin moves them in bulk from
--   Admin → Produits (filter on this category). Imports land as drafts, and
--   the shop only lists categories that hold active products.
-- * Stores scraped with the Eloshon Scraper that Luna did not know yet:
--   ICI Paris XL (perfume & beauty) and adidas. The import reads the store
--   from the product link (www.iciparisxl.be, www.adidas.be).

insert into public.product_categories (slug, name_fr, name_en, display_order, parent_id)
select 'a-classer', 'À classer', 'To sort', 999, null
where not exists (select 1 from public.product_categories where slug = 'a-classer');

insert into public.stores (slug, name, store_type, country, is_active, display_order) values
  ('ici-paris-xl', 'ICI Paris XL', 'hygiene', 'BE', true, 100),
  ('adidas', 'adidas', 'clothing', 'BE', true, 100)
on conflict (slug) do nothing;
