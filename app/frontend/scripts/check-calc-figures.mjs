/**
 * Build gate — no raw tariff figure in the calculator copy.
 *
 * Every price shown as text on /calculateur (the rate card, the "how a price is
 * built" bullets, the FAQ answers) and injected into the FAQPage JSON-LD must be
 * interpolated from the active pricing_config via a {{placeholder}} resolved by
 * src/lib/pricing/figures.data.mjs — NEVER typed into the locale strings.
 * Otherwise editing a tariff in /admin/tarifs would leave this copy (and its
 * structured data) stale. This check fails the build if a literal euro amount
 * ("18 €", "€18", "5,50 €") or a bare divisor ("÷ 6000") reappears in one of the
 * figure-driven calc keys, in either language. Runs right after check-i18n.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// calc.* keys whose figures MUST stay interpolated from the grid.
const GUARDED_KEYS = [
  'mode_express_rate', 'mode_cargo_rate', 'mode_sea_rate',
  'how_b2_body', 'how_b3_body', 'customs_note',
  'a_weight', 'a_volumetric', 'a_when_air', 'a_when_sea', 'a_multi', 'a_customs',
];

// A literal euro amount ("18 €", "5,50 €", "€18", "€5.50") or a bare divisor
// ("÷ 6000"). A {{placeholder}} never puts a digit next to € or ÷, so templated
// copy such as "{{expressRate}}/kg" or "÷ {{divisor}}" passes cleanly.
const TARIFF_RE = /\d[\d.,]*\s*€|€\s*\d|÷\s*\d/;

const offenders = [];
for (const lang of ['fr', 'en']) {
  const calc = JSON.parse(readFileSync(resolve(root, `src/locales/${lang}.json`), 'utf8')).calc ?? {};
  for (const key of GUARDED_KEYS) {
    const v = calc[key];
    if (typeof v === 'string' && TARIFF_RE.test(v)) {
      offenders.push(`${lang}.json → calc.${key}: ${JSON.stringify(v.slice(0, 90))}`);
    }
  }
}

if (offenders.length) {
  console.error('\n[check-calc-figures] raw tariff figure(s) found in calculator copy:');
  for (const o of offenders) console.error(`  ✗ ${o}`);
  console.error('\nUse a {{placeholder}} from src/lib/pricing/figures.data.mjs (calcFigures) instead of a typed amount.\n');
  process.exit(1);
}
console.log(`[check-calc-figures] OK — ${GUARDED_KEYS.length} calc keys × 2 langs carry no hardcoded tariff.`);
