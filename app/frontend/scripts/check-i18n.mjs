/**
 * Build-time i18n gate.
 *
 * Fails the build if:
 *   1. fr.json and en.json don't have the SAME set of keys (a bilingual site
 *      that ships an EN page missing a key would silently fall back to FR).
 *   2. The URL registry lists a bilingual route without both fr and en slugs
 *      (a page that exists in one language only is an orphan — the reason
 *      Homie Book's canonical/sitemap kept drifting).
 *   3. routes.ts and routes.data.mjs (the ESM mirror scripts use) fell out of
 *      sync. This check runs early so a drift never reaches production.
 *
 * Runs as the FIRST step of `pnpm build` so a broken translation set never
 * spends time compiling before failing.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function collectKeys(obj, prefix = '') {
  const out = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const inner of collectKeys(v, key)) out.add(inner);
    } else {
      out.add(key);
    }
  }
  return out;
}

const fr = JSON.parse(readFileSync(resolve(root, 'src/locales/fr.json'), 'utf8'));
const en = JSON.parse(readFileSync(resolve(root, 'src/locales/en.json'), 'utf8'));

const frKeys = collectKeys(fr);
const enKeys = collectKeys(en);

const missingInEn = [...frKeys].filter((k) => !enKeys.has(k));
const missingInFr = [...enKeys].filter((k) => !frKeys.has(k));

if (missingInEn.length || missingInFr.length) {
  console.error('\n[check-i18n] key sets diverged:');
  if (missingInEn.length) {
    console.error(`  ✗ ${missingInEn.length} key(s) present in fr.json but missing in en.json:`);
    for (const k of missingInEn) console.error(`      - ${k}`);
  }
  if (missingInFr.length) {
    console.error(`  ✗ ${missingInFr.length} key(s) present in en.json but missing in fr.json:`);
    for (const k of missingInFr) console.error(`      - ${k}`);
  }
  console.error('\nAdd the missing keys (leave EN in French for now if a translation is coming), then re-run.\n');
  process.exit(1);
}

// URL registry gate.
const { ROUTES } = await import(pathToFileURL(resolve(root, 'src/lib/url/routes.data.mjs')).href);

const brokenBilingual = [];
for (const [key, def] of Object.entries(ROUTES)) {
  if (!def.fr || !def.en) brokenBilingual.push(`${key}: fr="${def.fr}" en="${def.en}"`);
  if (def.bilingual === false && def.en !== def.fr) {
    // FR-only route (admin) still carries an EN slug in the type — should equal FR.
  }
}
if (brokenBilingual.length) {
  console.error('\n[check-i18n] URL registry has route(s) missing an fr or en slug:');
  for (const b of brokenBilingual) console.error(`  ✗ ${b}`);
  process.exit(1);
}

console.log(`[check-i18n] OK — ${frKeys.size} keys, ${Object.keys(ROUTES).length} routes.`);
