import type { PricingConfig } from './engine';

/**
 * The ONE pricing fixture shared by the pricing test suites (engine,
 * pro-suggest, cross-surface). It mirrors the live grid in
 * pricing_config (the real source of truth, edited in /admin/tarifs):
 * change a rate here once, then update the expected totals — never keep a
 * second copy of a rate in another test file.
 */
export const TEST_PRICING_CONFIG: PricingConfig = {
  corridor: { origin: 'brussels', destination: 'kinshasa' },
  handlingFeeCents: 500,
  customsAdminFeeCents: 12500,
  volumetricDivisor: 6000,
  volumetricSurchargeRateCentsPerKg: 550, // €5.50/kg (air express + cargo), from 2026-09-25
  ratioQuote: { thresholdKgPerM3: 374, appliesTo: ['sea'] },
  modes: {
    express: { perKgCents: 1800, flatMinCents: 1800, minKg: 0.1, maxKg: 200 },
    cargo: { perKgCents: 1600, minKg: 1, maxKg: 500 },
    sea: { tiers: [{ uptoM3: 5, perM3Cents: 75000 }, { uptoM3: 10, perM3Cents: 72500 }], maxM3: 10 },
  },
};
