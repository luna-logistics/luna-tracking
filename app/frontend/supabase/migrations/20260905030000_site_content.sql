-- Luna Tracking — editable site content + images.
--
-- Two thin tables that let the admin override any labelled field on a
-- public page without a redeploy:
--   * site_content : one row per (page_key, lang, field_key) with a text
--     value. Used for headings, intros, meta title/description, alt text,
--     and any other editable string.
--   * site_images  : one row per image slot (image_key), pointing to a
--     Storage URL. Used for hero images, share-preview og:images, etc.
--
-- Pages resolve each field via the `useContent(page, field, defaultValue)`
-- hook: an override wins; otherwise the default i18n string ships. No page
-- breaks if a row is missing.
--
-- Public read on both tables — required so an unauthenticated visitor sees
-- the same overrides as anyone else. Admin-only write via the is_admin()
-- helper.

-- ─── site_content ─────────────────────────────────────────────────────────
create table if not exists public.site_content (
  id         uuid primary key default gen_random_uuid(),
  page_key   text not null check (page_key ~ '^[a-z0-9-]+$'),
  lang       text not null check (lang in ('fr','en')),
  field_key  text not null check (field_key ~ '^[a-z0-9_]+$'),
  value      text not null,
  updated_at timestamptz not null default now(),
  unique (page_key, lang, field_key)
);

create index if not exists site_content_page_lang_idx on public.site_content (page_key, lang);

drop trigger if exists site_content_touch on public.site_content;
create trigger site_content_touch
  before update on public.site_content
  for each row execute function public.touch_updated_at();

alter table public.site_content enable row level security;

drop policy if exists "site_content public read" on public.site_content;
create policy "site_content public read" on public.site_content for select using (true);

drop policy if exists "site_content admin write" on public.site_content;
create policy "site_content admin write" on public.site_content for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ─── site_images ──────────────────────────────────────────────────────────
create table if not exists public.site_images (
  id         uuid primary key default gen_random_uuid(),
  image_key  text not null unique check (image_key ~ '^[a-z0-9_]+$'),
  url        text not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists site_images_touch on public.site_images;
create trigger site_images_touch
  before update on public.site_images
  for each row execute function public.touch_updated_at();

alter table public.site_images enable row level security;

drop policy if exists "site_images public read" on public.site_images;
create policy "site_images public read" on public.site_images for select using (true);

drop policy if exists "site_images admin write" on public.site_images;
create policy "site_images admin write" on public.site_images for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ─── Storage bucket for uploads ───────────────────────────────────────────
-- Public read so an <img src> from the frontend works without a token;
-- admin-only insert / update / delete so a signed-in-non-admin can't
-- inject or overwrite files.
insert into storage.buckets (id, name, public)
values ('site-images', 'site-images', true)
on conflict (id) do nothing;

drop policy if exists "site-images bucket public read" on storage.objects;
create policy "site-images bucket public read" on storage.objects for select
  using (bucket_id = 'site-images');

drop policy if exists "site-images bucket admin write" on storage.objects;
create policy "site-images bucket admin write" on storage.objects for all
  using (bucket_id = 'site-images' and public.is_admin(auth.uid()))
  with check (bucket_id = 'site-images' and public.is_admin(auth.uid()));
