/**
 * Post-build sitemap generator.
 *
 * Two sources of URLs, both authoritative:
 *   (a) the static URL registry — every route with indexable:true, both langs.
 *   (b) dynamic content — active product slugs fetched from Supabase at build
 *       time. Emits /achat-envoi/{slug} + /en/shop-and-ship/{slug} per product.
 *
 * If Supabase is unreachable at build time (network hiccup, key missing on a
 * local run), we log a warning and emit ONLY the static registry URLs rather
 * than failing the build — a partial sitemap is better than a broken deploy.
 * check-sitemap.mjs still validates the emitted list against _redirects.
 */
import { writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { allIndexableUrls, productUrl, blogPostUrl } = await import(
  pathToFileURL(resolve(__dirname, '..', 'src/lib/url/routes.data.mjs')).href
);

const DIST = 'dist';
const BASE_URL = 'https://lunatrackinglogistics.com';

// Static URLs from the registry (home, tracking, shop-and-ship parent, etc.).
const staticUrls = allIndexableUrls();

// Dynamic URLs — degrade gracefully if Supabase is unavailable.
async function fetchRows(table, query) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn(`[sitemap] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — skipping ${table}.`);
    return [];
  }
  try {
    const res = await fetch(`${url}/rest/v1/${table}?${query}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) { console.warn(`[sitemap] ${table} → ${res.status} — skipping.`); return []; }
    return await res.json();
  } catch (err) {
    console.warn(`[sitemap] ${table} fetch failed:`, err?.message ?? err);
    return [];
  }
}

const productRows = await fetchRows('products', 'select=slug_fr,slug_en&is_active=eq.true');
const productUrls = [];
for (const row of productRows) {
  if (typeof row.slug_fr === 'string') productUrls.push(productUrl(row.slug_fr, 'fr'));
  if (typeof row.slug_en === 'string') productUrls.push(productUrl(row.slug_en, 'en'));
}

const blogRows = await fetchRows('blog_posts', 'select=slug_fr,slug_en&published=eq.true');
const blogUrls = [];
for (const row of blogRows) {
  if (typeof row.slug_fr === 'string') blogUrls.push(blogPostUrl(row.slug_fr, 'fr'));
  if (typeof row.slug_en === 'string') blogUrls.push(blogPostUrl(row.slug_en, 'en'));
}

const emitted = [...staticUrls, ...productUrls, ...blogUrls];
const now = new Date().toISOString().split('T')[0];
const xml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  emitted
    .sort()
    .map((u) => `  <url><loc>${BASE_URL}${u}</loc><lastmod>${now}</lastmod></url>`)
    .join('\n') +
  '\n</urlset>\n';

writeFileSync(join(DIST, 'sitemap.xml'), xml, 'utf8');
console.log(
  `[sitemap] wrote ${emitted.length} URLs to dist/sitemap.xml ` +
  `(${staticUrls.length} static + ${productUrls.length} product + ${blogUrls.length} blog).`
);
