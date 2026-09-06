-- Fix: site_content.field_key CHECK was `^[a-z0-9_]+$` (underscores only),
-- so an image-alt field like `shop-and-ship_hero_alt` (image_key contains
-- hyphens) was rejected. Relax to allow hyphens too — every existing
-- field_key still passes.
alter table public.site_content drop constraint if exists site_content_field_key_check;
alter table public.site_content
  add constraint site_content_field_key_check
  check (field_key ~ '^[a-z0-9_-]+$');
