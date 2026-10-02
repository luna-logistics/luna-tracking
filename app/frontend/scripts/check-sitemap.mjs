/**
 * Sitemap integrity gate — fails the build if the sitemap asserts a URL that
 * either isn't on disk or is redirected by _redirects.
 *
 * The same-shape guard that would have caught Homie Book's August de-indexing:
 * the sitemap listed URLs that Cloudflare 301s to a different path, so Google
 * dropped the whole set. Here we cross-check every emitted URL against the
 * dist/ tree and against dist/_redirects.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const redirects = existsSync(join(DIST, '_redirects'))
  ? readFileSync(join(DIST, '_redirects'), 'utf8')
  : '';

// Very simple _redirects rule parser — one rule per line, "from  to  status".
const rules = [];
for (const line of redirects.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) continue;
  const [from, to, statusStr] = parts;
  const status = statusStr ? parseInt(statusStr, 10) : 301;
  rules.push({ from, to, status });
}

function isRedirected(pathname) {
  for (const r of rules) {
    if (r.status === 200) continue; // SPA fallback isn't a redirect
    if (r.from === '/*' || r.from.endsWith('/*')) {
      const prefix = r.from.slice(0, -1);
      if (pathname.startsWith(prefix)) return r;
    } else if (r.from === pathname) {
      return r;
    }
  }
  return null;
}

// Prerendering is active (scripts/prerender-metas.mjs writes one
// dist/<path>/index.html per URL), so we assert every sitemap URL both
// resolves to a real prerendered file on disk AND is not 301'd away by
// _redirects — the same-shape guard that would have caught Homie Book's
// de-indexing.
const bad = [];
for (const url of urls) {
  const u = new URL(url);
  const pathname = u.pathname;
  const red = isRedirected(pathname);
  if (red) { bad.push(`${url} — redirected by _redirects (${red.from} → ${red.to} ${red.status})`); continue; }
  const segs = pathname.split('/').filter(Boolean);
  if (!existsSync(join(DIST, ...segs, 'index.html'))) {
    bad.push(`${url} — no prerendered file on disk (expected dist/${[...segs, 'index.html'].join('/')})`);
  }
}

if (bad.length) {
  console.error(`\n[check-sitemap] ${bad.length} sitemap URL(s) are not 200 + self-canonical:`);
  for (const b of bad) console.error(`  ✗ ${b}`);
  console.error('\nA sitemap must assert pages that exist and are canonical to themselves.\n');
  process.exit(1);
}
console.log(`[check-sitemap] OK — ${urls.length} URLs, all 200 + self-canonical.`);
