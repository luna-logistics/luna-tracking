import { describe, it, expect } from 'vitest';
import type { PricingConfig } from './engine';
import { FALLBACK_PRICING_CONFIG } from './fallback';
import { validatePricingConfig, zeroRateFields } from './validate';

/** The admin form's strict validation (also the gate before the site prices
 *  with a grid read from the database). */
const grid = (edit: (c: PricingConfig) => void = () => {}): PricingConfig => {
  const c = structuredClone(FALLBACK_PRICING_CONFIG);
  edit(c);
  return c;
};
const codes = (c: unknown) => validatePricingConfig(c).map((e) => `${e.code}:${e.field}`);

describe('validatePricingConfig', () => {
  it('accepts the published grid', () => {
    expect(validatePricingConfig(grid())).toEqual([]);
  });

  it('an emptied field is an error, never a silent 0', () => {
    expect(codes(grid((c) => { c.modes.express.perKgCents = NaN; }))).toEqual(['required:modes.express.perKgCents']);
    expect(codes(grid((c) => { c.handlingFeeCents = NaN; }))).toEqual(['required:handlingFeeCents']);
    expect(codes(grid((c) => { c.presets![0].seaFlatTransportCents = NaN; }))).toEqual(['required:presets.carton_std.seaFlatTransportCents']);
  });

  it('refuses negative rates and non-positive thresholds', () => {
    expect(codes(grid((c) => { c.volumetricSurchargeRateCentsPerKg = -550; }))).toEqual(['negative:volumetricSurchargeRateCentsPerKg']);
    expect(codes(grid((c) => { c.modes.cargo.maxKg = 0; }))).toEqual(['max_positive:modes.cargo.maxKg']);
    expect(codes(grid((c) => { c.ratioQuote!.thresholdKgPerM3 = 0; }))).toEqual(['ratio_positive:ratioQuote.thresholdKgPerM3']);
    expect(codes(grid((c) => { c.volumetricDivisor = 0; }))).toEqual(['divisor_positive:volumetricDivisor']);
  });

  it('keeps the thresholds coherent: sea tiers increasing and ending at the sea maximum', () => {
    expect(codes(grid((c) => { c.modes.sea.tiers[1].uptoM3 = 5; }))).toEqual([
      'sea_tiers_order:modes.sea.tiers.1.uptoM3', 'sea_boundary:modes.sea.maxM3']);
    expect(codes(grid((c) => { c.modes.sea.maxM3 = 12; }))).toEqual(['sea_boundary:modes.sea.maxM3']);
    expect(codes(grid((c) => { c.modes.sea.tiers = []; }))).toEqual(['sea_no_tiers:modes.sea.tiers']);
    expect(codes(grid((c) => { c.modes.sea.tiers.push({ uptoM3: 20, perM3Cents: 70000 }); c.modes.sea.maxM3 = 20; }))).toEqual([]);
  });

  it('a rate at 0 is valid but listed for an explicit confirmation', () => {
    const free = grid((c) => { c.handlingFeeCents = 0; c.modes.sea.tiers[1].perM3Cents = 0; });
    expect(validatePricingConfig(free)).toEqual([]);
    expect(zeroRateFields(free)).toEqual(['modes.sea.tiers.1.perM3Cents', 'handlingFeeCents']);
    expect(zeroRateFields(grid())).toEqual([]);
  });

  it('never throws on a malformed document', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { modes: [] }, { modes: { sea: { tiers: 'x' } } },
      { presets: [null, 1, { key: 'a' }, { key: 'a' }] }, { ratioQuote: 'x' }, { includes: [1] }, { effectiveFrom: 20260925 }]) {
      expect(() => validatePricingConfig(bad)).not.toThrow();
      expect(validatePricingConfig(bad).length).toBeGreaterThan(0);
    }
  });

  it('checks the effective date format and duplicate preset keys', () => {
    expect(codes({ ...grid(), effectiveFrom: '25/09/2026' })).toEqual(['structure:effectiveFrom']);
    expect(codes(grid((c) => { c.presets![1].key = 'carton_std'; }))).toEqual(['structure:presets']);
  });
});
