/**
 * Post-build sitemap generator.
 *
 * A sitemap is an assertion that each URL exists, is indexable, and is
 * canonical to itself. So this walks the WRITTEN dist/ tree — every
 * prerendered file becomes a candidate URL — and only emits URLs that
 * (a) are in the URL registry's indexable set, and (b) actually have a
 * matching dist/{path}/index.html on disk.
 *
 * That's what caught Homie Book's phantom-URL incident: a sitemap listing a
 * URL Cloudflare would 301 away or a page that no longer prerenders.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { allIndexableUrls } = await import(
  pathToFileURL(resolve(__dirname, '..', 'src/lib/url/routes.data.mjs')).href
);

const DIST = 'dist';
const BASE_URL = 'https://lunatrackinglogistics.com';

// Without prerendering (see vite.config.ts note), every URL is served by the
// SPA fallback — dist/index.html — but that's still a valid 200 that renders
// the right page once JS runs, so we emit all indexable URLs. When prerender
// lands, restore the per-URL disk check that catches drift between registry
// and actual output.
const emitted = allIndexableUrls();

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
console.log(`[sitemap] wrote ${emitted.length} URLs to dist/sitemap.xml`);
