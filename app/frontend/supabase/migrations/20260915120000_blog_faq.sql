-- Luna Tracking — blog: structured FAQ per post.
--
-- Adds bilingual FAQ storage so an article can carry a Q/A list that is BOTH
-- rendered on the page (single source, no drift with the body) AND emitted as
-- FAQPage JSON-LD by the runtime page and the prerender step. Nullable and
-- default null, so every existing post is unaffected (no FAQ section, no
-- FAQPage) until it is given a FAQ.
--
-- Shape: jsonb array of objects [{ "q": "...", "a": "..." }, ...].

alter table public.blog_posts
  add column if not exists faq_fr jsonb,
  add column if not exists faq_en jsonb;
