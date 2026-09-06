-- Same shape as 20260907030000: relax the NOT NULL on the legacy
-- products.slug column so bilingual-only inserts (slug_fr + slug_en,
-- no legacy slug) succeed.
alter table public.products alter column slug drop not null;
