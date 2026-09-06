-- Fix: the legacy `blog_posts.slug` column was left NOT NULL when the
-- bilingual-slugs migration (20260906020000) added slug_fr + slug_en.
-- Every new post upsert via the admin (with only slug_fr / slug_en set)
-- was rejected with "null value in column slug violates not-null
-- constraint". Relax the constraint — the column is dead-code on the
-- frontend now.
alter table public.blog_posts alter column slug drop not null;
