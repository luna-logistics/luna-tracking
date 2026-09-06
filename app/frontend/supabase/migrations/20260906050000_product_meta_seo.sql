-- Luna Tracking — SEO meta on product cards.
--
-- Bilingual meta_title + meta_description per product, same shape as
-- blog_posts. Optional (nullable) — when missing, the product detail
-- page falls back to `title` and `description`.

alter table public.products
  add column if not exists meta_title_fr       text,
  add column if not exists meta_title_en       text,
  add column if not exists meta_description_fr text,
  add column if not exists meta_description_en text;
