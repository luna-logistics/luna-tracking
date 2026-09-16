#!/usr/bin/env node
/**
 * Luna scraper — autonomous CLI (usable without Claude Code).
 *
 *   pnpm probe  --origin "https://example.com"
 *   pnpm scrape --origin "https://example.com" [--store S] [--limit N] ...
 *   pnpm resume --job JOB_ID
 *
 * Produces, under scraper-output/:
 *   jobs/<id>/     resumable job state (config, discovered, processed, products)
 *   csv/<id>.csv   admin-import CSV (accepted rows) [+ <id>-to-verify.csv]
 *   reports/<id>.{json,txt}
 *
 * The scraper never writes to the DB. Load the CSV in Admin → Produits → Import
 * CSV. Ctrl+C stops safely and the job can be resumed. On a CAPTCHA/challenge/
 * login under the browser (with --intervene), it PAUSES for you to act manually
 * — no automatic bypass.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { loadConfig, outputRoot, REPO_ROOT } from './scraper/config.mjs';
import { createJob, Job } from './scraper/jobstore.mjs';
import { Fetcher } from './scraper/http-fetcher.mjs';
import { discoverProducts } from './scraper/discover.mjs';
import { runScrape } from './scraper/engine.mjs';
import { BrowserSession, browserAvailable } from './scraper/browser.mjs';
import { toImportCsv } from './scraper/csv.mjs';
import { probeSource, formatProbe } from './scraper/probe.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── args ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { _: [], url: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--browser') a.browser = true;
    else if (t === '--no-browser') a.browser = false;
    else if (t === '--intervene') a.intervene = true;
    else if (t.startsWith('--')) { const k = t.slice(2); const v = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? 'true' : argv[++i]; if (k === 'url') a.url.push(v); else a[k] = v; }
    else a._.push(t);
  }
  return a;
}
const intOr = (v, d) => (v != null && v !== '' ? parseInt(v, 10) : d);

function loadEnv() {
  const env = {};
  try {
    for (const line of fs.readFileSync(path.join(REPO_ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* none */ }
  return env;
}
async function assertStore(slug) {
  const env = loadEnv();
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) { console.warn('[scrape] Supabase env not found — store existence not checked.'); return; }
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/stores?slug=eq.${encodeURIComponent(slug)}&select=slug`, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` } });
  if (!res.ok) throw new Error(`store check failed: HTTP ${res.status}`);
  if (!(await res.json()).length) throw new Error(`Unknown store: ${slug} — create it in Admin → Magasins first (no store is auto-created).`);
}

const ask = (q) => new Promise((resolve) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (ans) => { rl.close(); resolve(ans); }); });

// ── shared run helper (scrape + resume) ──────────────────────────────────────
function fmtDur(ms) { const s = Math.round(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

function printReport(rep, csvPath) {
  const d = rep.discovery || {};
  console.log(`\nSCRAPING\nSource : ${rep.store || '(unassigned)'}   status: ${rep.status}\n`);
  console.log(`Discovery\n  method       : ${d.method || 'provided URLs'}\n  URLs (HTTP)  : ${d.httpProductUrls ?? rep.discovered}\n  URLs (browser): ${d.browserProductUrls ?? 0}\n  URLs (total) : ${rep.discovered}\n  pages        : ${d.pagesCrawled ?? 0} HTTP + ${d.browserPagesRendered ?? 0} browser\n`);
  console.log(`Extraction\n  Produits   : ${rep.detected}\n  Complets   : ${rep.detected - rep.incomplete}\n  Incomplets : ${rep.incomplete}\n`);
  console.log(`Éligibilité\n  Acceptés    : ${rep.accepted}\n  Exclus      : ${rep.excluded}\n  À vérifier  : ${rep.toVerify}\n`);
  console.log(`Browser\n  Pages HTTP    : ${rep.fetched}\n  Pages Browser : ${rep.browserUsed || 0}${rep.playwrightAvailable ? '' : ' (Playwright absent)'}\n`);
  console.log(`Erreurs : ${rep.networkErrors + rep.parseErrors}   (network ${rep.networkErrors}, parse ${rep.parseErrors})`);
  if (rep.blocked) console.log(`\n⚠ SOURCE STOPPED: ${rep.blocked.code} — ${rep.blocked.reason}\n  remaining: ${rep.remaining} URL(s) → resumable`);
  console.log(`\nDurée : ${fmtDur(rep.durationMs)}`);
  if (csvPath) console.log(`CSV   : ${csvPath}`);
}

async function executeJob(job, cfg, { origin, urls, store, productType, categorySlug, lang, browser, intervene }) {
  const fetcher = new Fetcher({ timeoutMs: cfg.timeoutMs, retries: cfg.retries, minDelayMs: cfg.rateLimitMs });

  // One lazy, shared browser session (discovery + extraction). Headful +
  // persistent profile only when --intervene (manual CAPTCHA/login handling).
  const browserEnabled = browser !== false;
  const onIntervention = intervene ? async ({ url, code, reason }) => {
    console.log(`\n============================================\nINTERVENTION REQUISE\nURL    : ${url}\nRAISON : ${code} — ${reason}\nLe navigateur reste ouvert : agis manuellement (résous le CAPTCHA / connecte-toi),\npuis appuie sur ENTER pour reprendre. (Aucun contournement automatique.)\n============================================`);
    await ask('ENTER pour reprendre > ');
    return 'retry';
  } : undefined;
  let _bs = null, _bsTried = false;
  const getBrowser = async () => {
    if (_bsTried) return _bs;
    _bsTried = true;
    if (!browserEnabled || !(await browserAvailable())) return null;
    const profileDir = path.join(outputRoot(cfg), '.browser-profile');
    if (intervene) fs.mkdirSync(profileDir, { recursive: true });
    _bs = new BrowserSession({ headless: !intervene, userDataDir: intervene ? profileDir : undefined, userAgent: fetcher.userAgent, onIntervention });
    return _bs;
  };

  // Discovery (only if not already discovered — resume reuses saved list).
  let discReport = null;
  if (!job.discovered.length) {
    job.setStatus('discovering');
    if (origin) {
      process.stdout.write('Discovery…\r');
      const disc = await discoverProducts(fetcher, origin, { maxProducts: cfg.maxProducts, maxPages: cfg.maxPages, maxDepth: cfg.maxDepth, maxBrowserPages: cfg.maxBrowser, getBrowser });
      job.setDiscovered(disc.urls); discReport = disc.report;
      console.log(`Discovery : ${disc.report.method} — ${disc.urls.length} product URLs (HTTP ${disc.report.httpProductUrls}, browser ${disc.report.browserProductUrls}; ${disc.report.pagesCrawled} HTTP pages, ${disc.report.browserPagesRendered} browser pages)`);
      if (disc.report.stopped) console.log(`  ⚠ discovery stopped: ${disc.report.stopped.code} — ${disc.report.stopped.reason}`);
    } else {
      job.setDiscovered(urls);
      console.log(`Discovery : ${urls.length} provided URL(s)`);
    }
  } else {
    console.log(`Resuming : ${job.remaining().length} of ${job.discovered.length} URL(s) left`);
  }

  job.setStatus('running');
  const remaining = job.remaining();
  let lastFlush = Date.now();
  const flushMaybe = () => { if (Date.now() - lastFlush > 1500) { job.flush(); lastFlush = Date.now(); } };

  const { report } = await runScrape({
    store: { slug: store || '' },
    urls: remaining,
    concurrency: cfg.workers, maxBrowser: cfg.maxBrowser, breaker: cfg.breaker,
    defaultProductType: productType || null, categorySlug: categorySlug || null, lang: lang || 'fr',
    useBrowser: browser === false ? false : undefined,
    interactive: !!intervene,
    getBrowserSession: getBrowser,
    onProduct: (np) => { job.addProduct(np); flushMaybe(); },
    onProcessed: (url) => { job.markProcessed(url); flushMaybe(); },
    onProgress: (n, t) => process.stdout.write(`\r  fetched ${n}/${t}   `),
  });
  process.stdout.write('\r');
  if (_bs) await _bs.close();
  if (discReport) report.discovery = discReport;
  job.flush();

  // Outputs: CSV (accepted) + to-verify CSV + reports. products.json already saved.
  const accepted = job.products.filter((p) => p.__eligibility?.status === 'accepted');
  const toVerify = job.products.filter((p) => p.__eligibility?.status === 'to_verify');
  fs.writeFileSync(job.paths.csv, toImportCsv(accepted, { storeSlug: store, categorySlug }), 'utf8');
  if (toVerify.length) fs.writeFileSync(job.paths.csv.replace(/\.csv$/, '-to-verify.csv'), toImportCsv(toVerify, { storeSlug: store, categorySlug }), 'utf8');
  fs.writeFileSync(job.paths.reportJson, JSON.stringify(report, null, 2));

  report.store = store || job.job.meta?.store || '(unassigned)';
  job.setStatus(report.blocked ? `stopped:${report.blocked.code}` : 'done', { report: { ...report, resumeUrls: undefined } });
  printReport(report, job.paths.csv);
  fs.writeFileSync(job.paths.reportTxt, `Job ${job.id}\n${JSON.stringify(report, null, 2)}`);
  console.log(`\nJob    : ${job.id}\nResume : pnpm resume --job ${job.id}`);
  if (!store) console.log('Note   : no --store set → store_slug is blank in the CSV; set it before importing.');
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (mode === 'probe') {
    const url = args.origin || args._[0] || args.url[0];
    if (!url) { console.error('usage: pnpm probe --origin <url>'); process.exit(2); }
    console.log(formatProbe(await probeSource(url)) + '\n');
    return;
  }

  const cfg = loadConfig({
    maxProducts: intOr(args.limit ?? args['max-products'], undefined),
    maxPages: intOr(args['max-pages'], undefined),
    maxDepth: intOr(args['max-depth'], undefined),
    workers: intOr(args.workers, undefined),
    maxBrowser: intOr(args['max-browser'], undefined),
    browser: args.browser,
  });

  if (mode === 'scrape') {
    if (!args.origin && args.url.length === 0) { console.error('usage: pnpm scrape --origin <url> | --url <productUrl> ...'); process.exit(2); }
    if (args.store) await assertStore(args.store);
    const meta = { origin: args.origin || null, store: args.store || null, productType: args['product-type'] || null, categorySlug: args['category-slug'] || null, lang: args.lang || 'fr' };
    const { id } = createJob(cfg, meta);
    const job = new Job(cfg, id);
    console.log(`Job ${id} started.  (Ctrl+C stops safely → pnpm resume --job ${id})`);
    installSigint(job);
    await executeJob(job, cfg, { origin: meta.origin, urls: args.url, store: meta.store, productType: meta.productType, categorySlug: meta.categorySlug, lang: meta.lang, browser: args.browser, intervene: args.intervene });
    return;
  }

  if (mode === 'resume') {
    const id = args.job || args._[0];
    if (!id) { console.error('usage: pnpm resume --job <JOB_ID>'); process.exit(2); }
    const job = new Job(cfg, id);
    const m = job.job.meta || {};
    console.log(`Resuming job ${id} (origin: ${m.origin || 'provided URLs'})`);
    installSigint(job);
    await executeJob(job, cfg, { origin: null, urls: [], store: m.store, productType: m.productType, categorySlug: m.categorySlug, lang: m.lang, browser: args.browser, intervene: args.intervene });
    return;
  }

  console.error('usage:\n  pnpm probe  --origin <url>\n  pnpm scrape --origin <url> [--store S] [--limit N] [--max-pages N] [--max-depth N] [--workers N] [--browser|--no-browser] [--intervene] [--product-type food] [--category-slug X]\n  pnpm resume --job <JOB_ID>');
  process.exit(2);
}

let sigintArmed = false;
function installSigint(job) {
  if (sigintArmed) return; sigintArmed = true;
  process.on('SIGINT', () => {
    try { job.flush(); job.setStatus('interrupted'); } catch { /* ignore */ }
    console.log(`\n\n⏸ Interrupted. Progress saved.\nResume with: pnpm resume --job ${job.id}\n`);
    process.exit(130);
  });
}

main().catch((e) => { console.error('\n[scrape] error:', e.message); process.exit(1); });
