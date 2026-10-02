/**
 * Calculator display figures — the single source for every tariff number shown
 * as TEXT on /calculateur (the rate card, the "how a price is built" bullets and
 * the FAQ answers) and injected into the FAQPage JSON-LD.
 *
 * Imported by BOTH `RateCalculator.tsx` (browser, from the live grid via
 * usePricingConfig) AND `scripts/prerender-metas.mjs` (Node, build time, from the
 * active pricing_config it fetches) — exactly like `routes.data.mjs` and
 * `jsonld.data.mjs`. One formatter, two runtimes → the figures a crawler reads in
 * the prerendered FAQPage and the figures a visitor sees after hydration can
 * never diverge, and a tariff edited in /admin/tarifs reaches the copy with no
 * code change.
 *
 * Pure data in, formatted strings out. No React, DOM, i18n or Node APIs.
 * `scripts/check-calc-figures.mjs` fails the build if a raw tariff figure is ever
 * retyped into one of these locale keys instead of a {{placeholder}}.
 */

const localeTag = (lang) => (lang === 'en' ? 'en-IE' : 'fr-BE');

/** 1800 → "18 €" / "€18"; 550 → "5,50 €" / "€5.50" (no decimals on whole euros).
 *  Mirror of eur() in src/lib/pricing/service-figures.ts. */
export function eur(cents, lang) {
  return new Intl.NumberFormat(localeTag(lang), {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** 5 → "5"; 0.1 → "0,1" (fr) / "0.1" (en). Mirror of num() in service-figures.ts. */
export function num(n, lang) {
  return new Intl.NumberFormat(localeTag(lang), { maximumFractionDigits: 3 }).format(n);
}

/**
 * Tariff subset of the Brussels → Kinshasa grid, used ONLY when the live
 * pricing_config can't be read at build time (no Supabase env on a local or CI
 * run). Kept in sync with FALLBACK_PRICING_CONFIG in src/lib/pricing/fallback.ts
 * — figures.data.test.ts fails if the two drift. The browser never uses this
 * copy: usePricingConfig already resolves to the live grid or the full fallback.
 */
export const FALLBACK_CALC_GRID = {
  handlingFeeCents: 500,
  customsAdminFeeCents: 12500,
  volumetricDivisor: 6000,
  volumetricSurchargeRateCentsPerKg: 550,
  modes: {
    express: { perKgCents: 1800, flatMinCents: 1800, minKg: 0.1, maxKg: 200 },
    cargo: { perKgCents: 1600, minKg: 1, maxKg: 500 },
    sea: { tiers: [{ uptoM3: 5, perM3Cents: 75000 }, { uptoM3: 10, perM3Cents: 72500 }], maxM3: 10 },
  },
};

/**
 * Every figure the calculator copy interpolates, formatted for `lang`. The keys
 * are the {{placeholders}} used in the `calc.*` locale strings. `surcharge`
 * carries its "/kg" suffix (the calc copy expects it inline, unlike the service
 * pages); `seaRate` is the first sea tier, `seaRate2` the last, `seaTier` the m³
 * boundary between them.
 */
export function calcFigures(config, lang) {
  const { express, cargo, sea } = config.modes;
  const tiers = [...((sea && sea.tiers) || [])].sort((a, b) => a.uptoM3 - b.uptoM3);
  const first = tiers[0];
  const last = tiers[tiers.length - 1];
  return {
    expressRate: eur(express.perKgCents, lang),
    expressMin: eur(express.flatMinCents, lang),
    expressMinKg: num(express.minKg, lang),
    expressMaxKg: num(express.maxKg, lang),
    cargoRate: eur(cargo.perKgCents, lang),
    cargoMaxKg: num(cargo.maxKg, lang),
    seaRate: first ? eur(first.perM3Cents, lang) : '',
    seaRate2: last ? eur(last.perM3Cents, lang) : '',
    seaTier: first ? num(first.uptoM3, lang) : '',
    handling: eur(config.handlingFeeCents, lang),
    customs: eur(config.customsAdminFeeCents, lang),
    fee: eur(config.customsAdminFeeCents, lang),
    divisor: num(config.volumetricDivisor, lang),
    surcharge: `${eur(config.volumetricSurchargeRateCentsPerKg, lang)}/kg`,
  };
}
