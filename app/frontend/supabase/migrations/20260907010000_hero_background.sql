-- Luna Tracking — hero background image config.
--
-- Extends site_images with the four knobs the admin needs to place a
-- background photo behind a hero band without a designer:
--   focal_x / focal_y : 0-100 percent — the point of the image that stays
--                        centered when the browser crops it (aka focal point).
--   zoom              : 100-200 percent — how much to enlarge past `cover`
--                        for tighter framing.
--   overlay           : 0-70 percent — dark-navy overlay opacity so light
--                        text stays legible on any photo.
--
-- Existing rows keep the defaults (50/50/100/45), which reproduces
-- background-size:cover + a 45% navy overlay — a safe starting point.

alter table public.site_images
  add column if not exists focal_x numeric not null default 50
    check (focal_x between 0 and 100),
  add column if not exists focal_y numeric not null default 50
    check (focal_y between 0 and 100),
  add column if not exists zoom numeric not null default 100
    check (zoom between 100 and 200),
  add column if not exists overlay numeric not null default 45
    check (overlay between 0 and 90);
