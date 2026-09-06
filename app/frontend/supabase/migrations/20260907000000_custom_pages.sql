-- Luna Tracking — custom (admin-authored) top-level pages.
--
-- Bilingual slugs (slug_fr + slug_en, unique per column) so /{slug_fr} in
-- French and /en/{slug_en} in English resolve to the same DB row — no URL is
-- ever "forced" into the other language's slug. A DB check blocks slugs that
-- would collide with a static route (/suivi, /tarifs, /blog, /admin, …); the
-- admin form re-checks on save with a friendlier message.
--
-- Body is stored as HTML written by the same RichTextEditor as the blog and
-- sanitized on render with sanitizeBlogHtml. Content is per-language.
--
-- Public read is gated on `published = true`; drafts never leak. Admins read
-- + write everything via is_admin().

create table if not exists public.custom_pages (
  id                    uuid primary key default gen_random_uuid(),
  slug_fr               text not null unique
    check (slug_fr ~ '^[a-z0-9-]+$'
      and slug_fr not in (
        'suivi','tarifs','contact','achat-envoi','reexpedition','blog','en','admin',
        'compte','connexion','inscription','mot-de-passe-oublie','auth','tracking',
        'pricing','shop-and-ship','international-forwarding','account','login','signup',
        'forgot-password','robots.txt','sitemap.xml','favicon.ico','brand'
      )),
  slug_en               text not null unique
    check (slug_en ~ '^[a-z0-9-]+$'
      and slug_en not in (
        'suivi','tarifs','contact','achat-envoi','reexpedition','blog','en','admin',
        'compte','connexion','inscription','mot-de-passe-oublie','auth','tracking',
        'pricing','shop-and-ship','international-forwarding','account','login','signup',
        'forgot-password','robots.txt','sitemap.xml','favicon.ico','brand'
      )),
  title_fr              text not null,
  title_en              text not null,
  content_fr            text not null default '',
  content_en            text not null default '',
  og_image              text,
  og_image_alt_fr       text,
  og_image_alt_en       text,
  meta_title_fr         text,
  meta_title_en         text,
  meta_description_fr   text,
  meta_description_en   text,
  published             boolean not null default false,
  published_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists custom_pages_published_idx on public.custom_pages (published, published_at desc);

drop trigger if exists custom_pages_touch on public.custom_pages;
create trigger custom_pages_touch
  before update on public.custom_pages
  for each row execute function public.touch_updated_at();

create or replace function public.custom_pages_stamp_published_at()
returns trigger language plpgsql as $$
begin
  if new.published and (old is null or not old.published) and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

drop trigger if exists custom_pages_stamp on public.custom_pages;
create trigger custom_pages_stamp
  before insert or update on public.custom_pages
  for each row execute function public.custom_pages_stamp_published_at();

alter table public.custom_pages enable row level security;

drop policy if exists "custom_pages public read published" on public.custom_pages;
create policy "custom_pages public read published" on public.custom_pages for select
  using (published = true or public.is_admin(auth.uid()));

drop policy if exists "custom_pages admin write" on public.custom_pages;
create policy "custom_pages admin write" on public.custom_pages for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
