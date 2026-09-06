/**
 * ESM mirror of routes.ts — loaded by post-build scripts (Node.js). Keep in
 * sync by hand; check-i18n.mjs diffs the two exports and fails on drift.
 */

export const SUPPORTED_LANGS = ['fr', 'en'];
export const DEFAULT_LANG = 'fr';

export const ROUTES = {
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
  blogIndex:    { indexable: true,  bilingual: true,  fr: '/blog',            en: '/blog' },
  adminBlog:    { indexable: false, bilingual: false, fr: '/admin/blog',      en: '/admin/blog' },
  adminCollaborators: { indexable: false, bilingual: false, fr: '/admin/collaborateurs', en: '/admin/collaborateurs' },
};

export function urlFor(key, lang = 'fr') {
  const def = ROUTES[key];
  const slug = def[lang];
  if (lang === 'fr') return slug;
  return slug === '/' ? '/en' : `/en${slug}`;
}

export function productUrl(slug, lang = 'fr') {
  return `${urlFor('shopAndShip', lang)}/${slug}`;
}

export function blogPostUrl(slug, lang = 'fr') {
  return `${urlFor('blogIndex', lang)}/${slug}`;
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
