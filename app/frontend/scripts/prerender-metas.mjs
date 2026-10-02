/**
 * Post-build meta prerender.
 *
 * The site is a client-rendered SPA — react-helmet-async only injects
 * <title>, <meta description>, canonical, hreflang, OG, JSON-LD AFTER
 * the JS bundle runs. Bing, Google, Facebook, Slack, WhatsApp all read
 * the *initial* HTML, so on the shell they saw no metas at all.
 *
 * This script writes a per-URL `dist/<path>/index.html` with the correct
 * head for that route. Body + scripts stay identical (the SPA still
 * hydrates and takes over); the head is replaced.
 *
 * Sources of truth, in order:
 *   1. site_content overrides (admin edits win — meta_title / meta_description
 *      per (page, lang) via the /admin/contenus form).
 *   2. i18n JSON defaults (locales/fr.json + en.json) — every route ships
 *      with a hand-written meta baseline.
 *   3. custom_pages / blog_posts / products rows for dynamic URLs.
 *
 * Degrades gracefully: if Supabase creds aren't set, static routes still
 * prerender from i18n defaults and dynamic URLs are skipped rather than
 * blocking the build.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { articleGraph, productSchema, customPageGraph, serviceGraph, brandFromName } from '../src/lib/seo/jsonld.data.mjs';
import { calcFigures, FALLBACK_CALC_GRID } from '../src/lib/pricing/figures.data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesMod = await import(
  pathToFileURL(path.resolve(__dirname, '..', 'src/lib/url/routes.data.mjs')).href
);
const { ROUTES, urlFor, productUrl, blogPostUrl, customPageUrl } = routesMod;

const DIST      = path.resolve(__dirname, '..', 'dist');
const SITE_URL  = 'https://lunatrackinglogistics.com';
const ogFallback = (lang) => `${SITE_URL}/brand/og-default${lang === 'en' ? '-en' : ''}.jpg`;
const SITE_NAME = 'Luna Tracking Logistics';

const shellHtml = await fs.readFile(path.join(DIST, 'index.html'), 'utf8');
const fr = JSON.parse(await fs.readFile(path.resolve(__dirname, '..', 'src/locales/fr.json'), 'utf8'));
const en = JSON.parse(await fs.readFile(path.resolve(__dirname, '..', 'src/locales/en.json'), 'utf8'));
const LOCALES = { fr, en };

/** RouteKey → i18n page key. Some routes use a shorter key in the JSON
 *  than the registry key (shopAndShip → shop). Keep them in one map so
 *  every URL that ships with a meta_title finds it. */
const ROUTE_I18N = {
  home:        'home',
  tracking:    'tracking',
  pricing:     'pricing',
  contact:     'contact',
  shopAndShip: 'shop',
  forwarding:  'forwarding',
  blogIndex:   'blog',
  apiDocs:     'api_docs',
  about:       'about',
  legalNotice: 'legal_notice',
  terms:       'legal_terms',
  privacy:     'legal_privacy',
  rateCalculator: 'calc',
  serviceAir:     'svc_air',
  serviceSea:     'svc_sea',
  serviceHome:    'svc_home',
  servicePickup:  'svc_pickup',
  transitaire:    'transitaire',
};

/** RouteKey → site_content page key, where it differs from the i18n key
 *  (RateCalculator.tsx reads its admin overrides under 'calculator'). */
const ROUTE_CONTENT = {
  rateCalculator: 'calculator',
};

/** Which i18n field feeds the initial-HTML <h1> per page + optional
 *  <h2>s. Only used to inject a body skeleton into `<div id="root">` so
 *  Bing (and any non-JS crawler) sees a real heading structure BEFORE
 *  React hydrates. React clears `#root` on mount so users still see the
 *  full app — the skeleton is invisible in-browser.
 *
 *  Every field here is admin-editable via `<Ed page field>` on the live
 *  page + /admin/contenus + DeepL translation, and the prerender picks
 *  up the same site_content overrides. */
const ROUTE_HEADINGS = {
  home:        { h1: 'hero_title',   h2s: ['pillars_title', 'how_title'] },
  tracking:    { h1: 'page_title',   h2s: [] },
  pricing:     { h1: 'page_title',   h2s: [] },
  contact:     { h1: 'page_title',   h2s: ['email_title', 'address_title', 'hours_title'] },
  shopAndShip: { h1: 'page_title',   h2s: [] },
  forwarding:  { h1: 'page_title',   h2s: ['how_title', 'examples_title', 'form_title'] },
  blogIndex:   { h1: 'page_title',   h2s: [] },
  about:       { h1: 'page_title',   h2s: ['story_title', 'values_title', 'company_title'] },
  legalNotice: { h1: 'page_title',   h2s: ['s1_title', 's2_title', 's3_title'] },
  terms:       { h1: 'page_title',   h2s: ['s1_title', 's2_title', 's3_title'] },
  privacy:     { h1: 'page_title',   h2s: ['s1_title', 's2_title', 's3_title'] },
  serviceAir:    { h1: 'h1', h2s: [] },
  serviceSea:    { h1: 'h1', h2s: [] },
  serviceHome:   { h1: 'h1', h2s: [] },
  servicePickup: { h1: 'h1', h2s: [] },
};

// ─── Fetch admin overrides + dynamic slugs from Supabase ──────────────────
const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY;

async function sbFetch(table, query) {
  if (!SB_URL || !SB_KEY) return [];
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!res.ok) { console.warn(`[prerender] ${table} → ${res.status}`); return []; }
    return await res.json();
  } catch (err) {
    console.warn(`[prerender] ${table} fetch failed:`, err?.message ?? err);
    return [];
  }
}

// Pull meta_title/meta_description (used for <head> tags) AND every
// row on the synthetic `image` page (used for og:image:alt overrides).
const overrideRows  = await sbFetch('site_content', 'select=page_key,lang,field_key,value&or=(field_key.in.(meta_title,meta_description),page_key.eq.image)');
const imageRows     = await sbFetch('site_images',  'select=image_key,url');
const productRows   = await sbFetch('products',     'select=slug_fr,slug_en,name_fr,name_en,description_fr,description_en,meta_title_fr,meta_title_en,meta_description_fr,meta_description_en,image_url,price,barcode,weight_kg,is_active&is_active=eq.true');
const blogRows      = await sbFetch('blog_posts',   'select=slug_fr,slug_en,title_fr,title_en,excerpt_fr,excerpt_en,meta_title_fr,meta_title_en,meta_description_fr,meta_description_en,featured_image,featured_image_en,faq_fr,faq_en,published_at,updated_at&published=eq.true');
const pricingRows   = await sbFetch('pricing_config', 'select=config&is_active=eq.true');
const customRows    = await sbFetch('custom_pages', 'select=slug_fr,slug_en,title_fr,title_en,meta_title_fr,meta_title_en,meta_description_fr,meta_description_en,og_image,published_at,updated_at&published=eq.true');

const overrides = new Map();
for (const r of overrideRows) overrides.set(`${r.page_key}::${r.lang}::${r.field_key}`, r.value);

const imagesByKey = new Map();
for (const r of imageRows) imagesByKey.set(r.image_key, r.url);

// ─── HTML helpers ─────────────────────────────────────────────────────────
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Replace the <html lang="..."> attribute on the shell. */
const setHtmlLang = (html, lang) =>
  html.replace(/<html\b[^>]*>/i, (m) => m.replace(/\slang="[^"]*"/i, '').replace('<html', `<html lang="${lang}"`));

/** Insert a chunk of markup just before </head>. */
const injectHead = (html, chunk) =>
  html.replace(/<\/head>/i, `${chunk}\n</head>`);

/** Replace `<div id="root"></div>` with a fallback body that carries the
 *  page's H1 + a few H2s. React discards this content on mount (it uses
 *  `createRoot(...).render(...)`, not `hydrate`), so this only ever
 *  reaches non-JS crawlers — Bing indexer, some social-preview bots,
 *  Google's first-pass indexer before its render queue picks up the
 *  page. Visible-in-browser rendering is unchanged. */
function injectBodySkeleton(html, { h1, h2s = [] }) {
  if (!h1) return html;
  const parts = [`  <h1>${escapeHtml(h1)}</h1>`];
  for (const t of h2s) if (t) parts.push(`  <h2>${escapeHtml(t)}</h2>`);
  const skeleton = `<div id="root">\n${parts.join('\n')}\n</div>`;
  return html.replace(/<div id="root"><\/div>/i, skeleton);
}

// ─── Service pages: a static body for non-JS crawlers ─────────────────────
// The four service pages render their body with React once the pricing grid is
// in hand. Non-JS fetchers (Bing, GPTBot, ClaudeBot, …) only ever see the
// prerendered HTML, so inject the real content here: the H1 stays the single
// VISIBLE skeleton node (styled by index.html, LCP candidate, no layout shift),
// while the intro, section titles and FAQ go in a visually-hidden block — in
// the DOM for crawlers, invisible to visitors, and thrown away with the rest of
// #root when React mounts. Section titles live in svc_common or the page's own
// namespace ("ns.field"); the FAQ count is per page. Figure-dependent answers
// (only svc_air.faq_a2 → {{surcharge}}) are interpolated from the build grid;
// anything still carrying an unresolved {{var}} is skipped rather than shown raw.
const SR_ONLY = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0';
const SERVICE_SKELETON = {
  svc_air:    { sections: ['svc_common.how_title', 'svc_air.formulas_title', 'svc_air.dest_title', 'svc_common.from_drc_title', 'svc_common.example_title', 'svc_common.faq_title'], faq: 5 },
  svc_sea:    { sections: ['svc_common.how_title', 'svc_sea.cartons_title', 'svc_common.from_drc_title', 'svc_common.example_title', 'svc_common.faq_title'], faq: 3 },
  svc_home:   { sections: ['svc_common.how_title', 'svc_home.cities_title', 'svc_common.example_title', 'svc_common.faq_title'], faq: 2 },
  svc_pickup: { sections: ['svc_common.how_title', 'svc_common.example_title', 'svc_common.faq_title'], faq: 2 },
  transitaire: { sections: ['transitaire.who_title', 'transitaire.services_title', 'transitaire.how_title', 'transitaire.pricing_title', 'transitaire.tracking_title', 'svc_common.faq_title'], faq: 5 },
};

// Service-skeleton pages whose runtime serviceGraph ALSO passes `faq`, so the
// prerendered FAQPage and the hydrated one match. The plain service pages
// (svc_sea/home/pickup) emit no FAQPage on either side.
const FAQ_GRAPH_PAGES = new Set(['svc_air', 'transitaire']);

function serviceSkeletonHtml(i18nPage, lang) {
  const spec = SERVICE_SKELETON[i18nPage];
  if (!spec) return null;
  const h1 = overrideOr(i18nPage, lang, 'h1', readI18n(lang, i18nPage, 'h1'));
  const surcharge = surchargeCents != null ? formatEuros(surchargeCents, lang) : null;

  const detail = [];
  const intro = overrideOr(i18nPage, lang, 'intro', readI18n(lang, i18nPage, 'intro'));
  if (intro) detail.push(`    <p>${escapeHtml(intro)}</p>`);
  for (const ref of spec.sections) {
    const [ns, field] = ref.split('.');
    const title = overrideOr(ns, lang, field, readI18n(lang, ns, field));
    if (title) detail.push(`    <h2>${escapeHtml(title)}</h2>`);
  }
  for (let n = 1; n <= spec.faq; n++) {
    const q = readI18n(lang, i18nPage, `faq_q${n}`);
    let a = readI18n(lang, i18nPage, `faq_a${n}`);
    if (a && surcharge) a = a.replace(/\{\{surcharge\}\}/g, surcharge);
    if (q && a && !/\{\{/.test(a)) {
      detail.push(`    <h3>${escapeHtml(q)}</h3>`);
      detail.push(`    <p>${escapeHtml(a)}</p>`);
    }
  }

  const parts = [];
  if (h1) parts.push(`  <h1>${escapeHtml(h1)}</h1>`);
  if (detail.length) parts.push(`  <div style="${SR_ONLY}">\n${detail.join('\n')}\n  </div>`);
  return parts.length ? parts.join('\n') : null;
}

/** FAQ items (q + fully-resolved a) for a service page's FAQPage JSON-LD, built
 *  from the same locale keys + grid as serviceSkeletonHtml so the schema matches
 *  the visible answers. The only figure is {{surcharge}} (from the build grid);
 *  an answer still carrying an unresolved {{var}} is skipped, never emitted raw. */
function serviceFaqForGraph(i18nPage, lang) {
  const spec = SERVICE_SKELETON[i18nPage];
  if (!spec) return undefined;
  const surcharge = surchargeCents != null ? formatEuros(surchargeCents, lang) : null;
  const out = [];
  for (let n = 1; n <= spec.faq; n++) {
    const q = readI18n(lang, i18nPage, `faq_q${n}`);
    let a = readI18n(lang, i18nPage, `faq_a${n}`);
    if (a && surcharge) a = a.replace(/\{\{surcharge\}\}/g, surcharge);
    if (q && a && !/\{\{/.test(a)) out.push({ q, a });
  }
  return out.length ? out : undefined;
}

/**
 * Emit the head chunk. Every tag carries `data-rh="true"` so
 * react-helmet-async — which owns the exact same set once the SPA
 * hydrates — recognises them as helmet-managed and takes over in
 * place instead of appending a second copy (Bing was flagging
 * "More than one Meta Description tag" / duplicate canonical
 * because the prerendered tag and helmet's tag were both live).
 */
function metaTagsFor({ lang, title, description, canonical, ogImage, ogImageAlt, hreflangs, jsonLd, extra }) {
  const RH = 'data-rh="true"';
  const parts = [];
  parts.push(`<title ${RH}>${escapeHtml(title)}</title>`);
  if (description) parts.push(`<meta ${RH} name="description" content="${escapeHtml(description)}" />`);
  if (extra?.noindex) parts.push(`<meta ${RH} name="robots" content="noindex" />`);
  else parts.push(`<link ${RH} rel="canonical" href="${escapeHtml(canonical)}" />`);
  for (const alt of hreflangs) {
    parts.push(`<link ${RH} rel="alternate" hreflang="${alt.hreflang}" href="${escapeHtml(alt.href)}" />`);
  }
  parts.push(`<meta ${RH} property="og:type" content="${escapeHtml(extra?.ogType ?? 'website')}" />`);
  parts.push(`<meta ${RH} property="og:url" content="${escapeHtml(canonical)}" />`);
  parts.push(`<meta ${RH} property="og:title" content="${escapeHtml(title)}" />`);
  if (description) parts.push(`<meta ${RH} property="og:description" content="${escapeHtml(description)}" />`);
  parts.push(`<meta ${RH} property="og:image" content="${escapeHtml(ogImage)}" />`);
  if (ogImageAlt) parts.push(`<meta ${RH} property="og:image:alt" content="${escapeHtml(ogImageAlt)}" />`);
  parts.push(`<meta ${RH} property="og:locale" content="${lang === 'en' ? 'en_US' : 'fr_BE'}" />`);
  parts.push(`<meta ${RH} property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`);
  parts.push(`<meta ${RH} name="twitter:card" content="summary_large_image" />`);
  parts.push(`<meta ${RH} name="twitter:title" content="${escapeHtml(title)}" />`);
  if (description) parts.push(`<meta ${RH} name="twitter:description" content="${escapeHtml(description)}" />`);
  parts.push(`<meta ${RH} name="twitter:image" content="${escapeHtml(ogImage)}" />`);
  // JSON-LD is emitted WITHOUT data-rh and with a stable id: react-helmet-async
  // must NOT own it (it would strip the block ~100 ms after load, the way it
  // used to), so it stays in the DOM for crawlers that render. The runtime
  // <JsonLd> on dynamic pages (blog/product/custom) updates this same node in
  // place, so there is always exactly one.
  if (jsonLd) parts.push(`<script id="ld-page" type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`);
  return parts.join('\n  ');
}

async function writeHtml(urlPath, html) {
  // "/" → dist/index.html; "/suivi" → dist/suivi/index.html; "/en" → dist/en/index.html
  const rel = urlPath === '/' ? 'index.html' : path.posix.join(urlPath.replace(/^\//, ''), 'index.html');
  const abs = path.join(DIST, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, html, 'utf8');
}

// ─── Per-URL builders ────────────────────────────────────────────────────
function overrideOr(pageKey, lang, field, fallback) {
  return overrides.get(`${pageKey}::${lang}::${field}`) ?? fallback;
}

function readI18n(lang, page, field) {
  const p = LOCALES[lang]?.[page];
  return (p && typeof p === 'object') ? p[field] : undefined;
}

/** Pages whose og:image is generated from the page itself — used when the
 *  admin hasn't uploaded a `${page}_hero` / `${page}_og` image.
 *  tracking: the no-search route map, rendered by /og/suivi and screenshotted
 *  server-side (/admin/contenus → "Régénérer l'image de preview", worker.js);
 *  the URL stays /brand/og-suivi-{lang}.jpg (the Worker serves the latest
 *  generated image, else the committed .default.jpg). Also the image of every
 *  shared tracking link. */
const REPO_OG = {
  tracking: {
    url: (lang) => `${SITE_URL}/brand/og-suivi-${lang}.jpg`,
    alt: (lang) => overrideOr('tracking', lang, 'map_alt', readI18n(lang, 'tracking', 'map_alt')),
  },
};
const ownOgImage = (pageKey) => imagesByKey.get(`${pageKey}_hero`) ?? imagesByKey.get(`${pageKey}_og`);

function heroOgImage(pageKey, lang) {
  // Prefer the page's own hero image, then its OG slot, then a repo-generated
  // image for that page, then the site fallback.
  return ownOgImage(pageKey)
      ?? REPO_OG[pageKey]?.url(lang)
      ?? imagesByKey.get('home_og')
      ?? ogFallback(lang);
}

/** Alt text for that same image, from the admin-authored override in
 *  site_content (bilingual). Falls back to the default the caller passes. */
function heroOgImageAlt(pageKey, lang, fallback) {
  for (const suffix of ['_hero', '_og']) {
    const key = `image::${lang}::${pageKey}${suffix}_alt`;
    if (overrides.has(key)) return overrides.get(key);
  }
  if (!ownOgImage(pageKey) && REPO_OG[pageKey]) return REPO_OG[pageKey].alt(lang) ?? fallback;
  const home = overrides.get(`image::${lang}::home_og_alt`);
  return home ?? fallback;
}

// ─── Calculator FAQPage ────────────────────────────────────────────────────
// Same source as RateCalculator.tsx (src/lib/calc-faq.json + locales) and the
// same text the page renders once the active pricing_config has loaded, so the
// FAQPage in the initial HTML matches the visible answers. The page updates
// this <script> in place by id (no data-rh: Helmet must not own it).
const CALC_FAQ = JSON.parse(await fs.readFile(path.resolve(__dirname, '..', 'src/lib/calc-faq.json'), 'utf8'));
const surchargeCents = pricingRows[0]?.config?.volumetricSurchargeRateCentsPerKg;
if (surchargeCents == null) console.warn('[prerender] pricing_config unavailable — calculator FAQ + service figures use the in-code fallback grid');

/** Mirror of formatEuros() in src/lib/pricing/engine.ts. */
const formatEuros = (cents, lang) => new Intl.NumberFormat(lang === 'en' ? 'en-IE' : 'fr-BE', {
  style: 'currency', currency: 'EUR',
}).format(cents / 100);

function calcFaqScript(lang) {
  const calc = LOCALES[lang].calc;
  // Same figures the page interpolates: from the fetched active grid, or the
  // in-code fallback when no Supabase env (local/CI). Every {{placeholder}} in
  // the FAQ answers resolves here, so the prerendered FAQPage carries real
  // numbers and matches the hydrated page.
  const figures = calcFigures(pricingRows[0]?.config ?? FALLBACK_CALC_GRID, lang);
  const interpolate = (s) => s.replace(/\{\{(\w+)\}\}/g, (m, key) => (figures[key] != null ? figures[key] : m));
  const mainEntity = CALC_FAQ.items.map(({ k, link }) => {
    const q = calc[`q_${k}`];
    const aRaw = typeof calc[`a_${k}`] === 'string' ? interpolate(calc[`a_${k}`]) : undefined;
    const label = link ? calc[link.labelKey] : null;
    if (!q || !aRaw || /\{\{/.test(aRaw) || (link && !label)) throw new Error(`[prerender] calculator FAQ: missing/uninterpolated text for "${k}" (${lang})`);
    return { '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: label ? `${aRaw} ${label}` : aRaw } };
  });
  const json = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json" id="calc-faq-jsonld">${json}</script>`;
}

// ─── Sea-freight page meta ─────────────────────────────────────────────────
// The /fret-maritime meta description quotes the live sea tiers and the lowest
// flat carton price. Mirror of seaMetaTiers() / cartonFromCents() / eur() in
// src/lib/pricing/service-figures.ts (Node can't import the .ts), same source
// as the page: the active pricing_config row. Without it (no creds, or the row
// is unreachable) the figure-free sentence is used — same degradation as the
// calculator FAQ above.
const activeGrid = pricingRows[0]?.config;
const eurShort = (cents, lang) => new Intl.NumberFormat(lang === 'en' ? 'en-IE' : 'fr-BE', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
}).format(cents / 100);
const numShort = (n, lang) => new Intl.NumberFormat(lang === 'en' ? 'en-IE' : 'fr-BE', { maximumFractionDigits: 3 }).format(n);

function seaMetaDescription(lang) {
  const s = LOCALES[lang].svc_sea;
  const tiers = activeGrid?.modes?.sea?.tiers;
  const flats = (activeGrid?.presets ?? [])
    .filter((p) => p.seaFlatTransportCents != null && p.lengthCm != null && p.widthCm != null && p.heightCm != null)
    .map((p) => p.seaFlatTransportCents + activeGrid.handlingFeeCents);
  if (!Array.isArray(tiers) || tiers.length === 0 || flats.length === 0) {
    console.warn('[prerender] pricing_config unavailable — /fret-maritime meta uses the figure-free sentence');
    return s.meta_description_generic;
  }
  const sorted = [...tiers].sort((a, b) => a.uptoM3 - b.uptoM3);
  const phrase = sorted.map((t, i) => (i === 0 ? s.meta_tier_first : s.meta_tier_next)
    .replace('{{rate}}', eurShort(t.perM3Cents, lang))
    .replace('{{upto}}', numShort(t.uptoM3, lang))
    .replace('{{from}}', i === 0 ? '' : numShort(sorted[i - 1].uptoM3, lang))).join(', ');
  return s.meta_description
    .replace('{{tiers}}', phrase)
    .replace('{{cartonFrom}}', eurShort(Math.min(...flats), lang));
}

async function emitStaticRoute(key, def) {
  if (!def.indexable) return;
  const i18nPage = ROUTE_I18N[key] ?? key;
  for (const lang of def.bilingual ? ['fr', 'en'] : ['fr']) {
    const urlPath  = urlFor(key, lang);
    const canonical = `${SITE_URL}${urlPath}`;

    const contentPage = ROUTE_CONTENT[key] ?? i18nPage;
    const title       = overrideOr(contentPage, lang, 'meta_title',       readI18n(lang, i18nPage, 'meta_title') ?? SITE_NAME);
    const description = overrideOr(contentPage, lang, 'meta_description',
      key === 'serviceSea' ? seaMetaDescription(lang) : (readI18n(lang, i18nPage, 'meta_description') ?? ''));

    const hreflangs = def.bilingual
      ? [
          { hreflang: 'fr',        href: `${SITE_URL}${urlFor(key, 'fr')}` },
          { hreflang: 'en',        href: `${SITE_URL}${urlFor(key, 'en')}` },
          { hreflang: 'x-default', href: `${SITE_URL}${urlFor(key, 'fr')}` },
        ]
      : [];

    // Homepage carries a small graph: Organization (feeds Google's
    // Knowledge Graph / business panel), WebSite and WebPage. No
    // SearchAction / sitelinks-search-box node: Google retired that rich
    // result, and the site exposes no text-search endpoint to point one at.
    // Other static pages ship a single WebPage node linked back to the WebSite.
    const jsonLd = key === 'home'
      ? {
          '@context': 'https://schema.org',
          '@graph': [
            {
              // Double type: Organization for brand-panel + LocalBusiness
              // for the map/local-panel rich result. Google respects both.
              '@type': ['Organization', 'LocalBusiness'],
              '@id': `${SITE_URL}/#org`,
              name: SITE_NAME,
              url: SITE_URL,
              logo: `${SITE_URL}/brand/logo-luna-navbar2.png`,
              image: `${SITE_URL}/brand/logo-luna-navbar2.png`,
              email: 'info@lunatrackinglogistics.com',
              telephone: '+32 2 241 96 72',
              vatID: 'BE1040011234',
              legalName: 'Luna Tracking Logistics SRL',
              address: {
                '@type': 'PostalAddress',
                streetAddress: "Rue de l'Automne 59",
                postalCode: '1050',
                addressLocality: 'Ixelles',
                addressRegion: 'Bruxelles-Capitale',
                addressCountry: 'BE',
              },
              hasMap: 'https://www.google.com/maps/search/?api=1&query=Rue+de+l%27Automne+59+1050+Ixelles+Bruxelles',
              sameAs: ['https://www.instagram.com/Luna_TrackingLogistics/'],
              // Opening hours + contactPoint copied from lib/contact-data.ts
              // (OFFICE_HOURS: Mon–Fri 10–18, Sat 12–18) and the /contact
              // LocalBusiness — same data, not newly declared. No `geo`: no
              // coordinates exist in the code to copy, so none are invented.
              openingHoursSpecification: [
                { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '10:00', closes: '18:00' },
                { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'], opens: '12:00', closes: '18:00' },
              ],
              contactPoint: [{
                '@type': 'ContactPoint',
                telephone: '+32 2 241 96 72',
                contactType: 'customer service',
                availableLanguage: ['fr', 'en'],
                areaServed: ['BE', 'CD'],
              }],
              // Second office in Kinshasa, alongside the Ixelles address above.
              location: [{
                '@type': 'Place',
                name: 'Luna Tracking Logistics — Kinshasa',
                address: {
                  '@type': 'PostalAddress',
                  streetAddress: '8e rue Industrielle n° 22, Limete',
                  addressLocality: 'Kinshasa',
                  addressCountry: 'CD',
                },
              }],
              areaServed: [
                { '@type': 'Country', name: 'Belgium'   },
                { '@type': 'City',    name: 'Bruxelles' },
                { '@type': 'City',    name: 'Ixelles'   },
                { '@type': 'City',    name: 'Kinshasa'  },
                { '@type': 'City',    name: 'Lubumbashi' },
                { '@type': 'Country', name: 'Democratic Republic of the Congo' },
              ],
            },
            {
              '@type': 'WebSite',
              '@id': `${SITE_URL}/#site`,
              name: SITE_NAME,
              url: SITE_URL,
              inLanguage: ['fr', 'en'],
              publisher: { '@id': `${SITE_URL}/#org` },
            },
            {
              '@type': 'WebPage',
              '@id': `${canonical}#page`,
              url: canonical,
              name: title,
              description: description || undefined,
              inLanguage: lang,
              isPartOf: { '@id': `${SITE_URL}/#site` },
              about: { '@id': `${SITE_URL}/#org` },
            },
          ],
        }
      : SERVICE_SKELETON[i18nPage]
        ? serviceGraph({
            lang, canonical, title, description,
            homeUrl: urlFor('home', lang),
            homeLabel: lang === 'en' ? 'Home' : 'Accueil',
            serviceName: overrideOr(i18nPage, lang, 'h1', readI18n(lang, i18nPage, 'h1')) || title,
            // FAQPage only where the runtime serviceGraph also passes faq, so
            // the prerendered and hydrated JSON-LD match (see FAQ_GRAPH_PAGES).
            faq: FAQ_GRAPH_PAGES.has(i18nPage) ? serviceFaqForGraph(i18nPage, lang) : undefined,
          })
        : {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: title,
            description: description || undefined,
            url: canonical,
            inLanguage: lang,
            isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
          };

    const head = metaTagsFor({
      lang, title, description, canonical,
      ogImage: heroOgImage(i18nPage, lang),
      ogImageAlt: heroOgImageAlt(i18nPage, lang, title),
      hreflangs, jsonLd,
    }) + (key === 'rateCalculator' ? '\n  ' + calcFaqScript(lang) : '');

    // Body skeleton: resolve H1 + H2 fields for this page. Admin
    // overrides (site_content) win over the i18n JSON default — same
    // precedence <Ed> uses on the live page, so what Bing sees in the
    // initial HTML matches what visitors read after React hydrates.
    const headings = ROUTE_HEADINGS[key];
    const skel = headings ? {
      h1:  overrideOr(i18nPage, lang, headings.h1, readI18n(lang, i18nPage, headings.h1)),
      h2s: headings.h2s.map((f) => overrideOr(i18nPage, lang, f, readI18n(lang, i18nPage, f))).filter(Boolean),
    } : null;

    let html = setHtmlLang(shellHtml, lang);
    html = injectHead(html, head);
    if (key === 'home') {
      html = injectHead(html, '<link rel="preload" as="image" href="/brand/hero-map.webp" type="image/webp" fetchpriority="high" />');
    }
    const serviceHtml = serviceSkeletonHtml(i18nPage, lang);
    if (serviceHtml) {
      html = html.replace(/<div id="root"><\/div>/i, `<div id="root">\n${serviceHtml}\n</div>`);
    } else if (skel) {
      html = injectBodySkeleton(html, skel);
    }
    await writeHtml(urlPath, html);
  }
}

/**
 * Share-link head template (/suivi/lien/:token, /en/tracking/link/:token).
 *
 * A per-shipment token can't be enumerated at build time, so instead of a
 * file per URL we emit ONE template per language at a non-routed path;
 * worker.js serves it for any token it confirms live, rewriting og:url to
 * the requested URL. The preview is visible to anyone the link is sent
 * to, so it carries generic copy only — never shipment or client data.
 * No canonical/hreflang/JSON-LD: the page is private (noindex).
 */
async function emitShareLinkTemplate() {
  for (const lang of ['fr', 'en']) {
    const title       = overrideOr('public_tracking', lang, 'meta_title',       readI18n(lang, 'public_tracking', 'meta_title') ?? SITE_NAME);
    const description = overrideOr('public_tracking', lang, 'meta_description', readI18n(lang, 'public_tracking', 'intro') ?? '');
    const head = metaTagsFor({
      lang, title, description,
      canonical: `${SITE_URL}${urlFor('publicTracking', lang)}`,
      ogImage: heroOgImage('tracking', lang),
      ogImageAlt: heroOgImageAlt('tracking', lang, title),
      hreflangs: [],
      extra: { noindex: true },
    });
    let html = setHtmlLang(shellHtml, lang);
    html = injectHead(html, head);
    html = injectBodySkeleton(html, { h1: readI18n(lang, 'public_tracking', 'heading') });
    await writeHtml(`/_share/public-tracking-${lang}`, html);
  }
}

async function emitBlogPost(row) {
  for (const lang of ['fr', 'en']) {
    const slug = lang === 'en' ? row.slug_en : row.slug_fr;
    if (!slug) continue;
    const urlPath = blogPostUrl(slug, lang);
    const canonical = `${SITE_URL}${urlPath}`;
    const title = (lang === 'en' ? row.meta_title_en : row.meta_title_fr)
      || (lang === 'en' ? row.title_en : row.title_fr);
    const description = (lang === 'en' ? row.meta_description_en : row.meta_description_fr)
      || (lang === 'en' ? row.excerpt_en : row.excerpt_fr) || '';
    const ogImage = (lang === 'en' ? (row.featured_image_en || row.featured_image) : row.featured_image) || ogFallback(lang);

    const hreflangs = [];
    if (row.slug_fr) hreflangs.push({ hreflang: 'fr',        href: `${SITE_URL}${blogPostUrl(row.slug_fr, 'fr')}` });
    if (row.slug_en) hreflangs.push({ hreflang: 'en',        href: `${SITE_URL}${blogPostUrl(row.slug_en, 'en')}` });
    if (row.slug_fr) hreflangs.push({ hreflang: 'x-default', href: `${SITE_URL}${blogPostUrl(row.slug_fr, 'fr')}` });

    // Article + BreadcrumbList (+ FAQPage when the post carries a FAQ), built by
    // the SHARED builder so this prerendered block and the runtime BlogPost
    // emitter stay identical. FAQ is read from the row (never a static block).
    const faq = Array.isArray(lang === 'en' ? row.faq_en : row.faq_fr)
      ? (lang === 'en' ? row.faq_en : row.faq_fr).filter((x) => x && x.q && x.a)
      : [];
    const jsonLd = articleGraph({
      canonical, lang,
      title: (lang === 'en' ? row.title_en : row.title_fr),
      description,
      image: ogImage || undefined,
      datePublished: row.published_at,
      dateModified: row.updated_at,
      homeUrl: urlFor('home', lang),
      homeLabel: lang === 'en' ? 'Home' : 'Accueil',
      blogUrl: urlFor('blogIndex', lang),
      blogLabel: 'Blog',
      faq,
    });

    const head = metaTagsFor({
      lang, title, description, canonical, ogImage, ogImageAlt: title,
      hreflangs, jsonLd, extra: { ogType: 'article' },
    });
    let html = setHtmlLang(shellHtml, lang);
    html = injectHead(html, head);
    html = injectBodySkeleton(html, {
      h1: (lang === 'en' ? row.title_en : row.title_fr) || title,
    });
    await writeHtml(urlPath, html);
  }
}

async function emitCustomPage(row) {
  for (const lang of ['fr', 'en']) {
    const slug = lang === 'en' ? row.slug_en : row.slug_fr;
    if (!slug) continue;
    const urlPath = customPageUrl(slug, lang);
    const canonical = `${SITE_URL}${urlPath}`;
    const title = (lang === 'en' ? row.meta_title_en : row.meta_title_fr)
      || (lang === 'en' ? row.title_en : row.title_fr);
    const description = (lang === 'en' ? row.meta_description_en : row.meta_description_fr) || '';
    const ogImage = row.og_image || ogFallback(lang);

    const hreflangs = [];
    if (row.slug_fr) hreflangs.push({ hreflang: 'fr',        href: `${SITE_URL}${customPageUrl(row.slug_fr, 'fr')}` });
    if (row.slug_en) hreflangs.push({ hreflang: 'en',        href: `${SITE_URL}${customPageUrl(row.slug_en, 'en')}` });
    if (row.slug_fr) hreflangs.push({ hreflang: 'x-default', href: `${SITE_URL}${customPageUrl(row.slug_fr, 'fr')}` });

    const jsonLd = customPageGraph({
      canonical, lang,
      title: (lang === 'en' ? row.title_en : row.title_fr),
      description,
      image: ogImage,
      datePublished: row.published_at,
      dateModified: row.updated_at,
    });

    const head = metaTagsFor({
      lang, title, description, canonical, ogImage, ogImageAlt: title,
      hreflangs, jsonLd,
    });
    let html = setHtmlLang(shellHtml, lang);
    html = injectHead(html, head);
    html = injectBodySkeleton(html, {
      h1: (lang === 'en' ? row.title_en : row.title_fr) || title,
    });
    await writeHtml(urlPath, html);
  }
}

async function emitProduct(row) {
  for (const lang of ['fr', 'en']) {
    const slug = lang === 'en' ? row.slug_en : row.slug_fr;
    if (!slug) continue;
    const urlPath = productUrl(slug, lang);
    const canonical = `${SITE_URL}${urlPath}`;
    const name = (lang === 'en' ? row.name_en : row.name_fr) || slug;
    const title = (lang === 'en' ? row.meta_title_en : row.meta_title_fr) || `${name} — ${SITE_NAME}`;
    const description = (lang === 'en' ? row.meta_description_en : row.meta_description_fr)
      || (lang === 'en' ? row.description_en : row.description_fr) || '';
    const ogImage = row.image_url || ogFallback(lang);

    const hreflangs = [];
    if (row.slug_fr) hreflangs.push({ hreflang: 'fr',        href: `${SITE_URL}${productUrl(row.slug_fr, 'fr')}` });
    if (row.slug_en) hreflangs.push({ hreflang: 'en',        href: `${SITE_URL}${productUrl(row.slug_en, 'en')}` });
    if (row.slug_fr) hreflangs.push({ hreflang: 'x-default', href: `${SITE_URL}${productUrl(row.slug_fr, 'fr')}` });

    const jsonLd = productSchema({
      canonical, lang, name,
      description: description || undefined,
      sku: slug,
      gtin: row.barcode || undefined,
      brand: brandFromName(name),
      weightKg: row.weight_kg != null ? Number(row.weight_kg) : undefined,
      price: row.price != null ? Number(row.price) : undefined,
      inStock: row.is_active !== false,
      image: ogImage,
    });

    const head = metaTagsFor({
      lang, title, description, canonical, ogImage, ogImageAlt: name,
      hreflangs, jsonLd,
    });
    let html = setHtmlLang(shellHtml, lang);
    html = injectHead(html, head);
    html = injectBodySkeleton(html, { h1: name });
    await writeHtml(urlPath, html);
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────
let count = 0;
for (const [key, def] of Object.entries(ROUTES)) {
  await emitStaticRoute(key, def);
  if (def.indexable) count += def.bilingual ? 2 : 1;
}
await emitShareLinkTemplate(); count += 2;
for (const row of blogRows)   { await emitBlogPost(row);   count += (row.slug_fr ? 1 : 0) + (row.slug_en ? 1 : 0); }
for (const row of customRows) { await emitCustomPage(row); count += (row.slug_fr ? 1 : 0) + (row.slug_en ? 1 : 0); }
for (const row of productRows){ await emitProduct(row);    count += (row.slug_fr ? 1 : 0) + (row.slug_en ? 1 : 0); }

console.log(
  `[prerender] wrote ${count} HTML files with full <head>` +
  ` (overrides: ${overrides.size}, images: ${imagesByKey.size},` +
  ` blog: ${blogRows.length}, custom: ${customRows.length}, product: ${productRows.length})`
);
