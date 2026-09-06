-- Fix: site_images.image_key CHECK was `^[a-z0-9_]+$` (underscores only),
-- so a hero key like `shop-and-ship_hero` (page.key contains hyphens)
-- was rejected. Relax to allow hyphens too — every existing key still
-- passes.
alter table public.site_images drop constraint if exists site_images_image_key_check;
alter table public.site_images
  add constraint site_images_image_key_check
  check (image_key ~ '^[a-z0-9_-]+$');
