-- IndexNow: notify on blog BODY / FAQ edits too.
--
-- tg_blog_posts_seo_changed() only stamped seo_changed_at on title / meta /
-- slug / published changes, so editing an already-published article's body
-- (content_fr/content_en) or its FAQ (faq_fr/faq_en, added later) never told
-- IndexNow the page had changed. Add those columns to the watch list. Purely
-- additive: same INSERT behaviour, only the UPDATE condition widens.

create or replace function public.tg_blog_posts_seo_changed()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.seo_changed_at := now();
  elsif tg_op = 'UPDATE' and (
       new.published            is distinct from old.published
    or new.slug                 is distinct from old.slug
    or new.slug_fr              is distinct from old.slug_fr
    or new.slug_en              is distinct from old.slug_en
    or new.title_fr             is distinct from old.title_fr
    or new.title_en             is distinct from old.title_en
    or new.meta_title_fr        is distinct from old.meta_title_fr
    or new.meta_title_en        is distinct from old.meta_title_en
    or new.meta_description_fr  is distinct from old.meta_description_fr
    or new.meta_description_en  is distinct from old.meta_description_en
    or new.content_fr           is distinct from old.content_fr
    or new.content_en           is distinct from old.content_en
    or new.faq_fr               is distinct from old.faq_fr
    or new.faq_en               is distinct from old.faq_en
  ) then new.seo_changed_at := now();
  end if;
  return new;
end $$;
