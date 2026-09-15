-- Blog: per-language featured image.
--
-- featured_image holds the FR (default) hero/OG image; featured_image_en, when
-- set, is used on /en/blog/* for the hero, Open Graph image and Article JSON-LD.
-- Nullable and additive: posts without an EN image fall back to featured_image,
-- so every existing post is unaffected.

alter table public.blog_posts
  add column if not exists featured_image_en text;
