#!/usr/bin/env node
/**
 * Scraper CLI.
 *
 *   node scripts/scrape.mjs probe <url>
 *   node scripts/scrape.mjs run --store <slug> --origin <site> [--limit N]
 *        [--product-type food] [--category-slug cafe-the] [--concurrency 4]
 *        [--browser] [--out out.csv]
 *   node scripts/scrape.mjs run --store <slug> --url <productUrl> [--url ...] ...
 *
 * The scraper NEVER writes to the DB. `run` produces a CSV in the admin-import
 * format; load it in Admin → Produits → Import CSV (preview + draft import).
 * The store must already exist (created in Admin → Magasins); an unknown store
 * stops the job with a clear error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeSource, formatProbe } from './scraper/probe.mjs';
import { runScrape, formatReport } from './scraper/engine.mjs';
import { toImportCsv } from './scraper/csv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const p = path.resolve(__dirname, '..', '.env.local');
  const env = {};
  try {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no env file */ }
  return env;
}

function parseArgs(argv) {
  const args = { _: [], url: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--browser') args.browser = true;
    else if (a === '--no-browser') args['no-browser'] = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[++i];
      if (key === 'url') args.url.push(val);
      else args[key] = val;
    } else args._.push(a);
  }
  return args;
}

async function assertStoreExists(slug, env) {
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    console.warn('[scrape] Supabase env not found — skipping store existence check (store_slug will be trusted).');
    return;
  }
  const url = `${env.VITE_SUPABASE_URL}/rest/v1/stores?slug=eq.${encodeURIComponent(slug)}&select=slug,is_active`;
  const res = await fetch(url, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` } });
  if (!res.ok) throw new Error(`store check failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!rows.length) throw new Error(`Unknown store: ${slug} — create it first in Admin → Magasins. No store is ever auto-created.`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (cmd === 'probe') {
    const url = args._[0] || args.url[0] || args.origin;
    if (!url) { console.error('usage: scrape.mjs probe <url>'); process.exit(2); }
    const result = await probeSource(url);
    console.log('\n' + formatProbe(result) + '\n');
    return;
  }

  if (cmd === 'run') {
    if (!args.store) { console.error('run: --store <slug> is required'); process.exit(2); }
    if (!args.origin && args.url.length === 0) { console.error('run: provide --origin <site> or one/more --url <productUrl>'); process.exit(2); }
    const env = loadEnv();
    await assertStoreExists(args.store, env); // throws on unknown store → controlled stop

    const { products, report } = await runScrape({
      store: { slug: args.store },
      origin: args.origin,
      urls: args.url.length ? args.url : undefined,
      limit: args.limit ? parseInt(args.limit, 10) : undefined,
      concurrency: args.concurrency ? parseInt(args.concurrency, 10) : undefined,
      maxPages: args['max-pages'] ? parseInt(args['max-pages'], 10) : undefined,
      maxDepth: args['max-depth'] ? parseInt(args['max-depth'], 10) : undefined,
      maxBrowser: args['max-browser'] ? parseInt(args['max-browser'], 10) : undefined,
      defaultProductType: args['product-type'] || null,
      categorySlug: args['category-slug'] || null,
      lang: args.lang === 'en' ? 'en' : 'fr',
      useBrowser: args['no-browser'] ? false : undefined, // auto-on when Playwright is installed
      onProgress: (n, t) => process.stdout.write(`\r  fetched ${n}/${t}   `),
    });
    process.stdout.write('\r');
    console.log('\n' + formatReport(report) + '\n');

    // Only ACCEPTED rows are worth importing as-is; to-verify/excluded are shown for review.
    const accepted = products.filter((p) => p.__eligibility?.status === 'accepted');
    const toVerify = products.filter((p) => p.__eligibility?.status === 'to_verify');
    if (report.notes.length) console.log('notes:\n  - ' + report.notes.join('\n  - ') + '\n');
    if (report.errors.length) console.log(`first errors:\n  - ${report.errors.slice(0, 5).join('\n  - ')}\n`);

    if (args.out) {
      const csv = toImportCsv(accepted, { storeSlug: args.store, categorySlug: args['category-slug'] });
      fs.writeFileSync(args.out, csv, 'utf8');
      console.log(`Wrote ${accepted.length} ACCEPTED rows → ${args.out}`);
      if (toVerify.length) {
        const tvOut = args.out.replace(/\.csv$/i, '') + '-a-verifier.csv';
        fs.writeFileSync(tvOut, toImportCsv(toVerify, { storeSlug: args.store, categorySlug: args['category-slug'] }), 'utf8');
        console.log(`Wrote ${toVerify.length} TO-VERIFY rows → ${tvOut}`);
      }
      console.log('Next: load the ACCEPTED CSV in Admin → Produits → Import CSV (preview + draft import). Fill category_slug there if empty.');
    } else {
      console.log('(no --out given; re-run with --out file.csv to write the admin-import CSV)');
    }
    return;
  }

  console.error('usage:\n  scrape.mjs probe <url>\n  scrape.mjs run --store <slug> --origin <site> [--limit N] [--product-type food] [--category-slug X] [--out file.csv]');
  process.exit(2);
}

main().catch((e) => { console.error('\n[scrape] error:', e.message); process.exit(1); });
