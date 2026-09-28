import { describe, it, expect } from 'vitest';
import { diffPricingConfigs, pricingLeaves } from './diff';
import { FALLBACK_PRICING_CONFIG } from './fallback';

/**
 * Same cases as the Postgres check of pricing_config_diff (migration
 * 20260928100000): what the admin confirms is what the history records.
 */
const rows = (a: unknown, b: unknown) =>
  diffPricingConfigs(a, b)
    .map((c) => [c.path, c.before ?? null, c.after ?? null])
    .sort((x, y) => String(x[0]).localeCompare(String(y[0])));

describe('pricing document diff', () => {
  it('the 2026-09-25 publication: €8 → €5.50 volume rate + effective date', () => {
    const before = { ...structuredClone(FALLBACK_PRICING_CONFIG), volumetricSurchargeRateCentsPerKg: 800, effectiveFrom: null };
    const after = { ...structuredClone(FALLBACK_PRICING_CONFIG), effectiveFrom: '2026-09-25' };
    expect(rows(before, after)).toEqual([
      ['effectiveFrom', null, '2026-09-25'],
      ['volumetricSurchargeRateCentsPerKg', 800, 550],
    ]);
  });

  it('sea tiers by index, carton presets by key, ratio modes as one value', () => {
    expect(rows({ modes: { sea: { tiers: [{ uptoM3: 5, perM3Cents: 1 }] } } },
      { modes: { sea: { tiers: [{ uptoM3: 5, perM3Cents: 1 }, { uptoM3: 10, perM3Cents: 2 }] } } }))
      .toEqual([['modes.sea.tiers.1.perM3Cents', null, 2], ['modes.sea.tiers.1.uptoM3', null, 10]]);
    expect(rows({ presets: [{ key: 'carton_std', seaFlatTransportCents: 7000 }] },
      { presets: [{ key: 'carton_std', seaFlatTransportCents: 7100 }] }))
      .toEqual([['presets.carton_std.seaFlatTransportCents', 7000, 7100]]);
    expect(rows({ ratioQuote: { appliesTo: ['sea'] } }, { ratioQuote: { appliesTo: ['sea', 'cargo'] } }))
      .toEqual([['ratioQuote.appliesTo', ['sea'], ['sea', 'cargo']]]);
  });

  it('text changes, first version, empty objects, null vs absent', () => {
    expect(rows({ vatStatus: null, a: 1 }, { vatStatus: 'TTC', a: 1 })).toEqual([['vatStatus', null, 'TTC']]);
    expect(rows(null, { a: { b: 1 }, c: [] })).toEqual([['a.b', null, 1], ['c', null, []]]);
    const d = diffPricingConfigs({ x: {} }, { x: { y: null } });
    expect(d).toEqual([{ path: 'x', before: {}, after: undefined }, { path: 'x.y', before: undefined, after: null }]);
  });

  it('key order is irrelevant; identical grids have no change', () => {
    const fb = FALLBACK_PRICING_CONFIG;
    const reordered = JSON.parse(JSON.stringify({ modes: fb.modes, corridor: fb.corridor, ...fb }));
    expect(diffPricingConfigs(fb, reordered)).toEqual([]);
    expect(pricingLeaves(fb).get('modes.express.perKgCents')).toBe(1800);
    expect(pricingLeaves(fb).get('presets.carton_small.seaFlatTransportCents')).toBe(2500);
  });
});
