-- Luna Tracking — blog.
--
-- One table (blog_posts) with bilingual title / excerpt / content / meta.
-- Content is stored as markdown; the public page renders it with
-- markdown-to-jsx at read time. Featured image lives in a dedicated
-- Storage bucket (blog-images) with the same public-read + admin-write
-- policies as site-images.
--
-- Public read is gated on `published = true` — draft rows never leak.
-- Admins get read + write on everything via is_admin().

create table if not exists public.blog_posts (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title_fr              text not null,
  title_en              text not null,
  excerpt_fr            text,
  excerpt_en            text,
  content_fr            text not null default '',
  content_en            text not null default '',
  featured_image        text,
  featured_image_alt_fr text,
  featured_image_alt_en text,
  meta_title_fr         text,
  meta_title_en         text,
  meta_description_fr   text,
  meta_description_en   text,
  published             boolean not null default false,
  published_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists blog_posts_published_idx on public.blog_posts (published, published_at desc);

drop trigger if exists blog_posts_touch on public.blog_posts;
create trigger blog_posts_touch
  before update on public.blog_posts
  for each row execute function public.touch_updated_at();

-- Auto-stamp published_at when the row flips to published for the first
-- time. Editing a published post won't shift the date.
create or replace function public.blog_posts_stamp_published_at()
returns trigger language plpgsql as $$
begin
  if new.published and (old is null or not old.published) and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

drop trigger if exists blog_posts_stamp on public.blog_posts;
create trigger blog_posts_stamp
  before insert or update on public.blog_posts
  for each row execute function public.blog_posts_stamp_published_at();

alter table public.blog_posts enable row level security;

-- Public read: only published rows. Admin read: everything via is_admin.
drop policy if exists "blog_posts public read published" on public.blog_posts;
create policy "blog_posts public read published" on public.blog_posts for select
  using (published = true or public.is_admin(auth.uid()));

drop policy if exists "blog_posts admin write" on public.blog_posts;
create policy "blog_posts admin write" on public.blog_posts for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ─── Storage bucket for featured images ───────────────────────────────────
insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do nothing;

drop policy if exists "blog-images bucket public read" on storage.objects;
create policy "blog-images bucket public read" on storage.objects for select
  using (bucket_id = 'blog-images');

drop policy if exists "blog-images bucket admin write" on storage.objects;
create policy "blog-images bucket admin write" on storage.objects for all
  using (bucket_id = 'blog-images' and public.is_admin(auth.uid()))
  with check (bucket_id = 'blog-images' and public.is_admin(auth.uid()));
