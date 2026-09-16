/**
 * Simple local configuration. Defaults live here; an optional
 * `scraper-output/config.json` (gitignored) overrides them; CLI flags override
 * both. No secrets here — the browser profile (cookies/logins) lives on disk
 * under scraper-output/.browser-profile and is never committed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..'); // app/frontend

export const DEFAULTS = {
  outputDir: 'scraper-output',
  // fetcher
  timeoutMs: 20000,
  retries: 2,
  rateLimitMs: 600,   // polite per-host spacing
  workers: 4,
  // discovery / crawl guardrails
  maxPages: 150,
  maxProducts: 1000,
  maxDepth: 3,
  // browser fallback
  browser: true,      // allow Playwright fallback for CSR pages
  maxBrowser: 40,
  headless: true,     // headful only needed for manual intervention
  breaker: 6,
};

export function loadConfig(overrides = {}) {
  const cfg = { ...DEFAULTS };
  const filePath = path.join(REPO_ROOT, DEFAULTS.outputDir, 'config.json');
  try {
    if (fs.existsSync(filePath)) Object.assign(cfg, JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (e) { console.warn('[scraper] ignoring invalid config.json:', e.message); }
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined) cfg[k] = v;
  return cfg;
}

export function outputRoot(cfg) { return path.isAbsolute(cfg.outputDir) ? cfg.outputDir : path.join(REPO_ROOT, cfg.outputDir); }
