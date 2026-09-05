/**
 * URL registry — the single source of truth for every route on Luna Tracking.
 *
 * ONE record per logical page, with its FR slug (default, no prefix) and its
 * EN slug (mounted under /en). Everything else — the router, hreflang tags,
 * the sitemap generator, the language switcher — asks THIS file, so a route
 * can never exist in one language and be orphaned in the other.
 *
 * When adding a page: add its key here, THEN wire it in App.tsx. The build
 * gate (scripts/check-i18n.mjs walks this file's exports) fails if a key is
 * missing an EN slug.
 */

export type Lang = 'fr' | 'en';
export const SUPPORTED_LANGS: readonly Lang[] = ['fr', 'en'] as const;
export const DEFAULT_LANG: Lang = 'fr';

/** Every static page's key. Dynamic detail pages (future) get their own registry. */
export type RouteKey =
  | 'home'
  | 'tracking'
  | 'pricing'
  | 'contact'
  | 'login'
  | 'signup'
  | 'forgotPassword'
  | 'authCallback'
  | 'account'
  | 'accountOrders'
  | 'accountInvoices'
  | 'admin'
  | 'adminCities';

type RouteDef = {
  /** Whether the URL is public and indexable — feeds the sitemap generator. */
  indexable: boolean;
  /** Whether the page mirrors under /en. Admin lives FR-only by convention. */
  bilingual: boolean;
  /** FR path (default, no prefix). EN path is `/en` + `en` or just `/en`. */
  fr: string;
  en: string;
};

export const ROUTES: Record<RouteKey, RouteDef> = {
  home:            { indexable: true,  bilingual: true,  fr: '/',                 en: '/' },
  tracking:        { indexable: true,  bilingual: true,  fr: '/suivi',            en: '/tracking' },
  pricing:         { indexable: true,  bilingual: true,  fr: '/tarifs',           en: '/pricing' },
  contact:         { indexable: true,  bilingual: true,  fr: '/contact',          en: '/contact' },
  login:           { indexable: false, bilingual: true,  fr: '/connexion',        en: '/login' },
  signup:          { indexable: false, bilingual: true,  fr: '/inscription',      en: '/signup' },
  forgotPassword:  { indexable: false, bilingual: true,  fr: '/mot-de-passe-oublie', en: '/forgot-password' },
  authCallback:    { indexable: false, bilingual: false, fr: '/auth/callback',    en: '/auth/callback' },
  account:         { indexable: false, bilingual: true,  fr: '/compte',           en: '/account' },
  accountOrders:   { indexable: false, bilingual: true,  fr: '/compte/commandes', en: '/account/orders' },
  accountInvoices: { indexable: false, bilingual: true,  fr: '/compte/factures',  en: '/account/invoices' },
  admin:           { indexable: false, bilingual: false, fr: '/admin',            en: '/admin' },
  adminCities:     { indexable: false, bilingual: false, fr: '/admin/destinations', en: '/admin/destinations' },
};

/** Build the absolute path for a route in a given language. */
export function urlFor(key: RouteKey, lang: Lang = 'fr'): string {
  const def = ROUTES[key];
  const slug = def[lang];
  if (lang === 'fr') return slug;
  // EN: slug already carries its leading slash; home collapses to /en, everything else to /en + slug.
  return slug === '/' ? '/en' : `/en${slug}`;
}

/** Reverse lookup: given a URL, find its RouteKey and the language of its slug. */
export function matchUrl(pathname: string): { key: RouteKey; lang: Lang } | null {
  // Strip the optional leading /en so we can compare against the FR/EN slug fields.
  const enMatch = pathname.match(/^\/en(\/.*)?$/);
  const isEn = !!enMatch;
  const bare = isEn ? (enMatch![1] || '/') : pathname;
  for (const [key, def] of Object.entries(ROUTES) as [RouteKey, RouteDef][]) {
    if (isEn && def.en === bare) return { key, lang: 'en' };
    if (!isEn && def.fr === bare) return { key, lang: 'fr' };
  }
  return null;
}

/** All indexable URLs across both languages — what the sitemap emits. */
export function allIndexableUrls(): string[] {
  const urls: string[] = [];
  for (const [key, def] of Object.entries(ROUTES) as [RouteKey, RouteDef][]) {
    if (!def.indexable) continue;
    urls.push(urlFor(key, 'fr'));
    if (def.bilingual) urls.push(urlFor(key, 'en'));
  }
  return urls;
}
