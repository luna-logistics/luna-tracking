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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesMod = await import(
  pathToFileURL(path.resolve(__dirname, '..', 'src/lib/url/routes.data.mjs')).href
);
const { ROUTES, urlFor, productUrl, blogPostUrl, customPageUrl } = routesMod;

const DIST      = path.resolve(__dirname, '..', 'dist');
const SITE_URL  = 'https://lunatrackinglogistics.com';
const OG_FALLBACK = `${SITE_URL}/brand/og-default.jpg`;
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
const productRows   = await sbFetch('products',     'select=slug_fr,slug_en,name_fr,name_en,description_fr,description_en,meta_title_fr,meta_title_en,meta_description_fr,meta_description_en,image_url&is_active=eq.true');
const blogRows      = await sbFetch('blog_posts',   'select=slug_fr,slug_en,title_fr,title_en,excerpt_fr,excerpt_en,meta_title_fr,meta_title_en,meta_description_fr,meta_description_en,featured_image,published_at,updated_at&published=eq.true');
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
  parts.push(`<link ${RH} rel="canonical" href="${escapeHtml(canonical)}" />`);
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
  if (jsonLd) parts.push(`<script ${RH} type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`);
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

function heroOgImage(pageKey) {
  // Prefer the page's own hero image, then its OG slot, then the site fallback.
  return imagesByKey.get(`${pageKey}_hero`)
      ?? imagesByKey.get(`${pageKey}_og`)
      ?? imagesByKey.get('home_og')
      ?? OG_FALLBACK;
}

/** Alt text for that same image, from the admin-authored override in
 *  site_content (bilingual). Falls back to the default the caller passes. */
function heroOgImageAlt(pageKey, lang, fallback) {
  for (const suffix of ['_hero', '_og']) {
    const key = `image::${lang}::${pageKey}${suffix}_alt`;
    if (overrides.has(key)) return overrides.get(key);
  }
  const home = overrides.get(`image::${lang}::home_og_alt`);
  return home ?? fallback;
}

async function emitStaticRoute(key, def) {
  if (!def.indexable) return;
  const i18nPage = ROUTE_I18N[key] ?? key;
  for (const lang of def.bilingual ? ['fr', 'en'] : ['fr']) {
    const urlPath  = urlFor(key, lang);
    const canonical = `${SITE_URL}${urlPath}`;

    const title       = overrideOr(i18nPage, lang, 'meta_title',       readI18n(lang, i18nPage, 'meta_title') ?? SITE_NAME);
    const description = overrideOr(i18nPage, lang, 'meta_description', readI18n(lang, i18nPage, 'meta_description') ?? '');

    const hreflangs = def.bilingual
      ? [
          { hreflang: 'fr',        href: `${SITE_URL}${urlFor(key, 'fr')}` },
          { hreflang: 'en',        href: `${SITE_URL}${urlFor(key, 'en')}` },
          { hreflang: 'x-default', href: `${SITE_URL}${urlFor(key, 'fr')}` },
        ]
      : [];

    // Homepage carries a small graph: Organization (feeds Google's
    // Knowledge Graph / business panel), WebSite with SearchAction (the
    // sitelinks-search-box entrypoint), plus WebPage. Other static pages
    // ship a single WebPage node linked back to the WebSite.
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
              email: 'info@lunatrackinglogistics.be',
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
              areaServed: [
                { '@type': 'Country', name: 'Belgium'   },
                { '@type': 'City',    name: 'Bruxelles' },
                { '@type': 'City',    name: 'Ixelles'   },
                { '@type': 'Country', name: 'Democratic Republic of the Congo' },
              ],
            },
            {
              '@type': 'WebSite',
              '@id': `${SITE_URL}/#site`,
              name: SITE_NAME,
              url: SITE_URL,
              inLanguage: lang,
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
      ogImage: heroOgImage(i18nPage),
      ogImageAlt: heroOgImageAlt(i18nPage, lang, title),
      hreflangs, jsonLd,
    });

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
    if (skel) html = injectBodySkeleton(html, skel);
    await writeHtml(urlPath, html);
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
    const ogImage = row.featured_image || OG_FALLBACK;

    const hreflangs = [];
    if (row.slug_fr) hreflangs.push({ hreflang: 'fr',        href: `${SITE_URL}${blogPostUrl(row.slug_fr, 'fr')}` });
    if (row.slug_en) hreflangs.push({ hreflang: 'en',        href: `${SITE_URL}${blogPostUrl(row.slug_en, 'en')}` });
    if (row.slug_fr) hreflangs.push({ hreflang: 'x-default', href: `${SITE_URL}${blogPostUrl(row.slug_fr, 'fr')}` });

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: (lang === 'en' ? row.title_en : row.title_fr),
      description,
      image: ogImage ? [ogImage] : undefined,
      datePublished: row.published_at,
      dateModified: row.updated_at,
      author: { '@type': 'Organization', name: SITE_NAME },
      publisher: {
        '@type': 'Organization', name: SITE_NAME,
        logo: { '@type': 'ImageObject', url: `${SITE_URL}/brand/logo-luna-navbar2.png` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      inLanguage: lang,
    };

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
    const ogImage = row.og_image || OG_FALLBACK;

    const hreflangs = [];
    if (row.slug_fr) hreflangs.push({ hreflang: 'fr',        href: `${SITE_URL}${customPageUrl(row.slug_fr, 'fr')}` });
    if (row.slug_en) hreflangs.push({ hreflang: 'en',        href: `${SITE_URL}${customPageUrl(row.slug_en, 'en')}` });
    if (row.slug_fr) hreflangs.push({ hreflang: 'x-default', href: `${SITE_URL}${customPageUrl(row.slug_fr, 'fr')}` });

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: (lang === 'en' ? row.title_en : row.title_fr),
      description: description || undefined,
      url: canonical,
      inLanguage: lang,
      datePublished: row.published_at,
      dateModified: row.updated_at,
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
      image: ogImage,
    };

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
    const ogImage = row.image_url || OG_FALLBACK;

    const hreflangs = [];
    if (row.slug_fr) hreflangs.push({ hreflang: 'fr',        href: `${SITE_URL}${productUrl(row.slug_fr, 'fr')}` });
    if (row.slug_en) hreflangs.push({ hreflang: 'en',        href: `${SITE_URL}${productUrl(row.slug_en, 'en')}` });
    if (row.slug_fr) hreflangs.push({ hreflang: 'x-default', href: `${SITE_URL}${productUrl(row.slug_fr, 'fr')}` });

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name,
      description: description || undefined,
      image: ogImage,
      inLanguage: lang,
      url: canonical,
    };

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
for (const row of blogRows)   { await emitBlogPost(row);   count += (row.slug_fr ? 1 : 0) + (row.slug_en ? 1 : 0); }
for (const row of customRows) { await emitCustomPage(row); count += (row.slug_fr ? 1 : 0) + (row.slug_en ? 1 : 0); }
for (const row of productRows){ await emitProduct(row);    count += (row.slug_fr ? 1 : 0) + (row.slug_en ? 1 : 0); }

console.log(
  `[prerender] wrote ${count} HTML files with full <head>` +
  ` (overrides: ${overrides.size}, images: ${imagesByKey.size},` +
  ` blog: ${blogRows.length}, custom: ${customRows.length}, product: ${productRows.length})`
);
