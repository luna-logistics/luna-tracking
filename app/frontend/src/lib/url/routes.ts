/**
 * URL registry — the single source of truth for every route on Luna Tracking.
 *
 * ONE record per logical page (FR slug + EN slug). Everything downstream —
 * router, hreflang, sitemap generator, language switcher — asks THIS file, so
 * a route can never exist in one language and be orphaned in the other.
 *
 * Dynamic content (product detail pages) uses the `productUrl` helper below.
 * The convention is that the slug itself is ALWAYS English and shared across
 * both locales — /achat-envoi/rice-5kg and /en/shop-and-ship/rice-5kg point
 * to the same DB row.
 */

export type Lang = 'fr' | 'en';
export const SUPPORTED_LANGS: readonly Lang[] = ['fr', 'en'] as const;
export const DEFAULT_LANG: Lang = 'fr';

export type RouteKey =
  | 'home'
  | 'tracking'
  | 'pricing'
  | 'contact'
  | 'shopAndShip'
  | 'forwarding'
  | 'login'
  | 'signup'
  | 'forgotPassword'
  | 'authCallback'
  | 'account'
  | 'accountOrders'
  | 'accountInvoices'
  | 'admin'
  | 'adminCities'
  | 'adminProducts'
  | 'adminOrders'
  | 'adminForwarding'
  | 'adminAuthProviders'
  | 'adminContent';

type RouteDef = {
  indexable: boolean;
  bilingual: boolean;
  fr: string;
  en: string;
};

export const ROUTES: Record<RouteKey, RouteDef> = {
  home:            { indexable: true,  bilingual: true,  fr: '/',                   en: '/' },
  tracking:        { indexable: true,  bilingual: true,  fr: '/suivi',              en: '/tracking' },
  pricing:         { indexable: true,  bilingual: true,  fr: '/tarifs',             en: '/pricing' },
  contact:         { indexable: true,  bilingual: true,  fr: '/contact',            en: '/contact' },
  shopAndShip:     { indexable: true,  bilingual: true,  fr: '/achat-envoi',        en: '/shop-and-ship' },
  forwarding:      { indexable: true,  bilingual: true,  fr: '/reexpedition',       en: '/international-forwarding' },
  login:           { indexable: false, bilingual: true,  fr: '/connexion',          en: '/login' },
  signup:          { indexable: false, bilingual: true,  fr: '/inscription',        en: '/signup' },
  forgotPassword:  { indexable: false, bilingual: true,  fr: '/mot-de-passe-oublie', en: '/forgot-password' },
  authCallback:    { indexable: false, bilingual: false, fr: '/auth/callback',      en: '/auth/callback' },
  account:         { indexable: false, bilingual: true,  fr: '/compte',             en: '/account' },
  accountOrders:   { indexable: false, bilingual: true,  fr: '/compte/commandes',   en: '/account/orders' },
  accountInvoices: { indexable: false, bilingual: true,  fr: '/compte/factures',    en: '/account/invoices' },
  admin:           { indexable: false, bilingual: false, fr: '/admin',              en: '/admin' },
  adminCities:     { indexable: false, bilingual: false, fr: '/admin/destinations', en: '/admin/destinations' },
  adminProducts:   { indexable: false, bilingual: false, fr: '/admin/produits',     en: '/admin/produits' },
  adminOrders:     { indexable: false, bilingual: false, fr: '/admin/commandes',    en: '/admin/commandes' },
  adminForwarding: { indexable: false, bilingual: false, fr: '/admin/demandes-reexpedition', en: '/admin/demandes-reexpedition' },
  adminAuthProviders: { indexable: false, bilingual: false, fr: '/admin/auth-sociale', en: '/admin/auth-sociale' },
  adminContent: { indexable: false, bilingual: false, fr: '/admin/contenus', en: '/admin/contenus' },
};

export function urlFor(key: RouteKey, lang: Lang = 'fr'): string {
  const def = ROUTES[key];
  const slug = def[lang];
  if (lang === 'fr') return slug;
  return slug === '/' ? '/en' : `/en${slug}`;
}

export function matchUrl(pathname: string): { key: RouteKey; lang: Lang } | null {
  const enMatch = pathname.match(/^\/en(\/.*)?$/);
  const isEn = !!enMatch;
  const bare = isEn ? (enMatch![1] || '/') : pathname;
  for (const [key, def] of Object.entries(ROUTES) as [RouteKey, RouteDef][]) {
    if (isEn && def.en === bare) return { key, lang: 'en' };
    if (!isEn && def.fr === bare) return { key, lang: 'fr' };
  }
  // Dynamic content: product detail — same slug in both locales, only the
  // parent path differs. Reports the shopAndShip key so the language switcher
  // knows how to swap parents while preserving the slug.
  const prod = matchProductUrl(pathname);
  if (prod) return { key: 'shopAndShip', lang: prod.lang };
  return null;
}

/** Build the URL for a specific product detail page, in the target language. */
export function productUrl(slug: string, lang: Lang = 'fr'): string {
  return `${urlFor('shopAndShip', lang)}/${slug}`;
}

/** Detect a product detail URL and extract {slug, lang}, else null. */
export function matchProductUrl(pathname: string): { slug: string; lang: Lang } | null {
  const enMatch = pathname.match(/^\/en\/shop-and-ship\/([a-z0-9-]+)$/);
  if (enMatch) return { slug: enMatch[1], lang: 'en' };
  const frMatch = pathname.match(/^\/achat-envoi\/([a-z0-9-]+)$/);
  if (frMatch) return { slug: frMatch[1], lang: 'fr' };
  return null;
}

/** Every static-registry indexable URL across both languages. */
export function allIndexableUrls(): string[] {
  const urls: string[] = [];
  for (const [key, def] of Object.entries(ROUTES) as [RouteKey, RouteDef][]) {
    if (!def.indexable) continue;
    urls.push(urlFor(key, 'fr'));
    if (def.bilingual) urls.push(urlFor(key, 'en'));
  }
  return urls;
}
