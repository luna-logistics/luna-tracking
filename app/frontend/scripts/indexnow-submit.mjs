#!/usr/bin/env node
// Submit every URL in dist/sitemap.xml to Bing / Yandex / Seznam via
// IndexNow. Run manually after a deploy, or wire to a Supabase edge
// function on a cron. The verification file `public/<KEY>.txt` MUST
// stay deployed at the site root for submissions to be accepted.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'lunatrackinglogistics.com';
const KEY  = '3f56ce6aac0c9c1407445ca24782b3c3';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/IndexNow';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sitemapPath = path.resolve(__dirname, '..', 'dist', 'sitemap.xml');

const xml = await fs.readFile(sitemapPath, 'utf8');
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urls.length === 0) {
  console.error('[indexnow] no URLs found in sitemap');
  process.exit(1);
}

const body = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls };

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log(`[indexnow] ${res.status} ${res.statusText} — ${urls.length} URL(s)`);
if (text.trim()) console.log(text);
if (!res.ok) process.exit(1);
