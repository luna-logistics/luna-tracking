#!/usr/bin/env node
/**
 * Submit every URL in dist/sitemap.xml to Bing (and every IndexNow
 * partner engine — Yandex, Seznam, Naver — via api.indexnow.org, which
 * fans out to all of them).
 *
 * Per Bing IndexNow specification (bing.com/indexnow):
 *   1. Key file:  https://<host>/<KEY>.txt  contains exactly the KEY,
 *      no BOM, no trailing newline, mime text/plain. Verified once by
 *      the engine on first submission; must remain reachable long-term.
 *   2. POST body: JSON { host, key, keyLocation, urlList }.
 *   3. URL list:  only INDEXABLE URLs your site actually serves — no
 *      404s, no redirects, no noindex. Duplicates are rejected. HTTPS.
 *   4. Batches:   up to 10,000 URLs per request. We submit whatever the
 *      sitemap holds (well under that today).
 *   5. Rate:      one batch per few minutes is polite. This script fires
 *      one batch when invoked; the caller decides when.
 *
 * Response codes:
 *   200 — accepted (Bing crawls URLs on its own schedule from here).
 *   202 — accepted, key verification pending (first submission, or
 *         after a key rotation).
 *   400 — malformed request (URL not owned by host, bad JSON, etc.).
 *   403 — key file returned wrong content or unreachable.
 *   422 — URLs in the list don't match host.
 *   429 — rate limited.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'lunatrackinglogistics.com';
const KEY  = '7c5abad259dd4708bdfae721ce54bb1a';        // Bing Webmaster IndexNow key
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/IndexNow';   // fans out to Bing, Yandex, Seznam, Naver
const BATCH_MAX = 10000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sitemapPath = path.resolve(__dirname, '..', 'dist', 'sitemap.xml');

const xml = await fs.readFile(sitemapPath, 'utf8');
// dedupe + sort so re-submits look identical (helps the engine's own
// dedup and keeps our logs stable).
const urls = Array.from(new Set(
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
)).sort();

if (urls.length === 0) {
  console.error('[indexnow] no URLs found in sitemap');
  process.exit(1);
}
if (urls.length > BATCH_MAX) {
  console.error(`[indexnow] sitemap has ${urls.length} URLs — over the ${BATCH_MAX} per-batch limit; split before submitting`);
  process.exit(1);
}

// Sanity: every URL must live under our host, else IndexNow 422s the
// whole batch.
const bad = urls.filter((u) => !u.startsWith(`https://${HOST}/`) && u !== `https://${HOST}`);
if (bad.length) {
  console.error(`[indexnow] ${bad.length} URL(s) don't match host ${HOST}:`);
  bad.slice(0, 5).forEach((u) => console.error('  ' + u));
  process.exit(1);
}

const body = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls };

console.log(`[indexnow] submitting ${urls.length} URL(s) to ${ENDPOINT}`);
console.log(`[indexnow] key file: ${KEY_LOCATION}`);

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'accept': 'application/json',
  },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log(`[indexnow] ${res.status} ${res.statusText}`);
if (text.trim()) console.log(text);

// 200 = accepted, 202 = accepted (key verification pending). Both good.
if (res.status === 200 || res.status === 202) {
  console.log('[indexnow] ✓ accepted');
  process.exit(0);
}

console.error('[indexnow] ✗ rejected — check key file is reachable and URLs are indexable');
process.exit(1);
