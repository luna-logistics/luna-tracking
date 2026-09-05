/**
 * ESM mirror of routes.ts — loaded by post-build scripts (Node.js) that can't
 * import a .ts file directly. Keep in sync by hand; the check-i18n build gate
 * diffs the two exports and fails the build on drift.
 */

export const SUPPORTED_LANGS = ['fr', 'en'];
export const DEFAULT_LANG = 'fr';

export const ROUTES = {
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

export function urlFor(key, lang = 'fr') {
  const def = ROUTES[key];
  const slug = def[lang];
  if (lang === 'fr') return slug;
  return slug === '/' ? '/en' : `/en${slug}`;
}

export function allIndexableUrls() {
  const urls = [];
  for (const [key, def] of Object.entries(ROUTES)) {
    if (!def.indexable) continue;
    urls.push(urlFor(key, 'fr'));
    if (def.bilingual) urls.push(urlFor(key, 'en'));
  }
  return urls;
}
