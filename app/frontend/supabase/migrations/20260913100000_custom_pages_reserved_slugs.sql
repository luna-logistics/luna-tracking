-- Reserved custom-page slugs: sync the DB check with the URL registry.
-- New fixed routes shipped 2026-09-13 (about + three legal pages) plus the
-- calculator / API docs paths that the original list never covered. The
-- frontend RESERVED_SLUGS set mirrors this list by hand.

alter table public.custom_pages
  drop constraint if exists custom_pages_slug_fr_check,
  drop constraint if exists custom_pages_slug_en_check;

alter table public.custom_pages
  add constraint custom_pages_slug_fr_check
    check (slug_fr ~ '^[a-z0-9-]+$'
      and slug_fr not in (
        'suivi','tarifs','contact','achat-envoi','reexpedition','blog','en','admin',
        'compte','connexion','inscription','mot-de-passe-oublie','auth','tracking',
        'pricing','shop-and-ship','international-forwarding','account','login','signup',
        'forgot-password','robots.txt','sitemap.xml','favicon.ico','brand',
        'a-propos','about','mentions-legales','legal-notice','conditions-generales','terms',
        'confidentialite','privacy','calculateur','calculator','docs'
      )),
  add constraint custom_pages_slug_en_check
    check (slug_en ~ '^[a-z0-9-]+$'
      and slug_en not in (
        'suivi','tarifs','contact','achat-envoi','reexpedition','blog','en','admin',
        'compte','connexion','inscription','mot-de-passe-oublie','auth','tracking',
        'pricing','shop-and-ship','international-forwarding','account','login','signup',
        'forgot-password','robots.txt','sitemap.xml','favicon.ico','brand',
        'a-propos','about','mentions-legales','legal-notice','conditions-generales','terms',
        'confidentialite','privacy','calculateur','calculator','docs'
      ));
