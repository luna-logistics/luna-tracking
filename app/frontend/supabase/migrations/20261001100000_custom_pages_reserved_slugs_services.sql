-- Reserved custom-page slugs: the four service pages (hard-coded routes)
-- shipped 2026-10-01. An admin-authored page at one of these slugs would be
-- shadowed by the fixed route, so the DB check refuses them.
-- Additive: same list as 20260913100000 plus the eight new slugs (FR + EN).
-- The frontend RESERVED_SLUGS set (src/lib/custom-pages.ts) mirrors it by hand.

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
        'confidentialite','privacy','calculateur','calculator','docs',
        'fret-aerien','fret-maritime','livraison-domicile-congo','enlevement-colis',
        'air-freight','sea-freight','home-delivery-congo','parcel-pickup'
      )),
  add constraint custom_pages_slug_en_check
    check (slug_en ~ '^[a-z0-9-]+$'
      and slug_en not in (
        'suivi','tarifs','contact','achat-envoi','reexpedition','blog','en','admin',
        'compte','connexion','inscription','mot-de-passe-oublie','auth','tracking',
        'pricing','shop-and-ship','international-forwarding','account','login','signup',
        'forgot-password','robots.txt','sitemap.xml','favicon.ico','brand',
        'a-propos','about','mentions-legales','legal-notice','conditions-generales','terms',
        'confidentialite','privacy','calculateur','calculator','docs',
        'fret-aerien','fret-maritime','livraison-domicile-congo','enlevement-colis',
        'air-freight','sea-freight','home-delivery-congo','parcel-pickup'
      ));
