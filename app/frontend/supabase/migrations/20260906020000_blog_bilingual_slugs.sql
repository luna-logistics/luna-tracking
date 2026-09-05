-- Luna Tracking — blog: bilingual slugs (slug_fr + slug_en).
--
-- Per the site-wide rule: no EN URL should be forced into FR. Blog posts
-- now carry two slugs — /blog/{slug_fr} in French, /en/blog/{slug_en} in
-- English. Uniqueness enforced per column.
--
-- Safe on an empty or partially-seeded table (idempotent guards).

alter table public.blog_posts
  add column if not exists slug_fr text,
  add column if not exists slug_en text;

-- Backfill: if the pre-existing single `slug` column has values, seed both
-- new columns with it so nothing 404s during the roll-forward.
update public.blog_posts set slug_fr = slug where slug_fr is null and slug is not null;
update public.blog_posts set slug_en = slug where slug_en is null and slug is not null;

-- Only enforce NOT NULL if every row now has a value — dodges an error on
-- a table that has rows but no `slug` values (shouldn't happen but safe).
do $$
begin
  if not exists (select 1 from public.blog_posts where slug_fr is null) then
    alter table public.blog_posts alter column slug_fr set not null;
  end if;
  if not exists (select 1 from public.blog_posts where slug_en is null) then
    alter table public.blog_posts alter column slug_en set not null;
  end if;
end $$;

-- Uniqueness + format constraints per language.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'blog_posts_slug_fr_key') then
    alter table public.blog_posts add constraint blog_posts_slug_fr_key unique (slug_fr);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'blog_posts_slug_en_key') then
    alter table public.blog_posts add constraint blog_posts_slug_en_key unique (slug_en);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'blog_posts_slug_fr_format') then
    alter table public.blog_posts add constraint blog_posts_slug_fr_format check (slug_fr ~ '^[a-z0-9-]+$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'blog_posts_slug_en_format') then
    alter table public.blog_posts add constraint blog_posts_slug_en_format check (slug_en ~ '^[a-z0-9-]+$');
  end if;
end $$;

-- Drop the legacy single-slug unique constraint so the same French slug
-- can be reused freely if a new post's FR slug happens to match.
alter table public.blog_posts drop constraint if exists blog_posts_slug_key;
-- Keep the `slug` COLUMN itself for now — nullable, unused by the frontend
-- after this migration. A follow-up can drop it once we're confident no
-- clients read it.
