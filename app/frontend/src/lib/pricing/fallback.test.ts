import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeQuote, type ModeResult, type PricedResult, type PricingConfig, type ShipmentInput } from './engine';
import {
  FALLBACK_PRICING_CONFIG, hasFallbackTariff, isTariffPath, resolvePricingConfig, withFallbackTariff,
} from './fallback';
import { validatePricingConfig } from './validate';
import { TEST_PRICING_CONFIG } from './test-config';

/**
 * The fallback grid (valeurs de secours) and the resolver that decides between
 * it and the database grid. Totals in integer cents, from the owner's confirmed
 * rules: real weight × rate, + (volumetric − real) × volume rate when the
 * volumetric weight is higher, + €5 handling; billed to the gram.
 */
const FB = FALLBACK_PRICING_CONFIG;
const priced = (r: ModeResult): PricedResult => {
  expect(r.kind).toBe('price');
  return r as PricedResult;
};
const quote = (r: ModeResult) => {
  expect(r.kind).toBe('quote');
  return r.kind === 'quote' ? r.reason : null;
};
const q = (i: ShipmentInput, c: PricingConfig = FB) => computeQuote(i, c);
const clone = (): PricingConfig => structuredClone(FB);

/** The fallback document with one value replaced (or removed) — a stored row gone wrong. */
const DELETE = Symbol('delete');
function storedWith(path: string, value: unknown): unknown {
  const doc = JSON.parse(JSON.stringify(FB)) as Record<string, unknown>;
  const keys = path.split('.');
  let node = doc;
  for (const k of keys.slice(0, -1)) node = node[k] as Record<string, unknown>;
  const last = keys[keys.length - 1];
  if (value === DELETE) delete node[last];
  else node[last] = value;
  return doc;
}

/** Same document, every object's keys in reverse order. */
const reverseKeys = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(reverseKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)]));
  return v;
};

describe('fallback grid = the tariff published on 2026-09-25', () => {
  it('is a valid grid, frozen against accidental edits', () => {
    expect(validatePricingConfig(FB)).toEqual([]);
    expect(Object.isFrozen(FB)).toBe(true);
    expect(Object.isFrozen(FB.modes.sea.tiers[0])).toBe(true);
  });

  it('has the same rates as the grid the engine suites pin (test-config.ts)', () => {
    for (const k of ['corridor', 'handlingFeeCents', 'customsAdminFeeCents', 'volumetricDivisor',
      'volumetricSurchargeRateCentsPerKg', 'ratioQuote', 'modes'] as const) {
      expect(FB[k]).toEqual(TEST_PRICING_CONFIG[k]);
    }
    expect(FB.presets?.map((p) => [p.key, p.seaFlatTransportCents ?? null]))
      .toEqual([['carton_std', 7000], ['carton_small', 2500], ['suitcase', null], ['move_3m3', null]]);
    expect(FB.effectiveFrom).toBeNull();
  });

  it('is exactly the document the migration seeds when no grid is active', () => {
    const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20260928100000_pricing_settings_history.sql'), 'utf8');
    const seed = /\$json\$([\s\S]*?)\$json\$/.exec(sql);
    expect(seed).not.toBeNull();
    expect(JSON.parse(seed![1])).toEqual(FB);
  });
});

describe('air: real weight vs volumetric weight (60 × 40 × 40 cm = 16 kg volumetric)', () => {
  const carton = (weightKg: number) => q({ weightKg, lengthCm: 60, widthCm: 40, heightCm: 40 });

  it('real = volumetric (16 kg): real weight only, no volume line', () => {
    const ex = priced(carton(16).express);
    expect(ex.totalCents).toBe(29300);                    // 16×18 + 5
    expect(ex.chargeableBasis).toBe('actual');
    expect(ex.lines.some((l) => l.key === 'volumetric_diff')).toBe(false);
    expect(priced(carton(16).cargo).totalCents).toBe(26100); // 16×16 + 5
  });

  it('real > volumetric (20 kg): real weight only', () => {
    expect(priced(carton(20).express).totalCents).toBe(36500); // 20×18 + 5
    expect(priced(carton(20).cargo).totalCents).toBe(32500);   // 20×16 + 5
  });

  it('volumetric > real (6 kg): real × rate + 10 kg × €5.50, express and cargo alike', () => {
    const ex = priced(carton(6).express);
    expect(ex.totalCents).toBe(16800);                    // 6×18 + 10×5.50 + 5
    const diff = ex.lines.find((l) => l.key === 'volumetric_diff');
    expect(diff?.qtyKg).toBe(10);
    expect(diff?.rateCentsPerKg).toBe(550);
    expect(priced(carton(6).cargo).totalCents).toBe(15600); // 6×16 + 10×5.50 + 5
  });

  it('billed to the gram, express minimum, handling once', () => {
    expect(priced(q({ weightKg: 1.3 }).express).totalCents).toBe(2840);  // 1.3×18 + 5
    expect(priced(q({ weightKg: 0.4 }).express).totalCents).toBe(2300);  // €18 minimum + 5
    expect(priced(q({ weightKg: 12.345 }).cargo).totalCents).toBe(20252); // 12.345×16 = 197.52 + 5
  });
});

describe('quote thresholds', () => {
  it('cargo: 500 kg priced, above → quote; express: 200 kg priced, above → quote', () => {
    expect(priced(q({ weightKg: 500 }).cargo).totalCents).toBe(800500);
    expect(quote(q({ weightKg: 500.001 }).cargo)).toBe('over_max_weight');
    expect(priced(q({ weightKg: 200 }).express).totalCents).toBe(360500);
    expect(quote(q({ weightKg: 200.5 }).express)).toBe('over_max_weight');
  });

  it('sea: tiers up to 10 m³, above → quote', () => {
    expect(priced(q({ volumeM3: 5 }).sea).totalCents).toBe(375500);    // 5×750 + 5
    expect(priced(q({ volumeM3: 5.5 }).sea).totalCents).toBe(399250);  // 5.5×725 + 5
    expect(priced(q({ volumeM3: 10 }).sea).totalCents).toBe(725500);   // 10×725 + 5
    expect(quote(q({ volumeM3: 10.001 }).sea)).toBe('over_max_volume');
  });

  it('ratio: 374 kg/m³ priced, above → sea quote (air stays billed by weight)', () => {
    expect(priced(q({ weightKg: 374, volumeM3: 1 }).sea).totalCents).toBe(75500);
    const over = q({ weightKg: 374.5, volumeM3: 1 });
    expect(quote(over.sea)).toBe('ratio');
    expect(over.cargo.kind).toBe('price');
  });

  it('sea carton flat rate: one 60 × 40 × 40 carton = €75', () => {
    expect(priced(q({ lengthCm: 60, widthCm: 40, heightCm: 40 }).sea).totalCents).toBe(7500);
  });
});

describe('resolvePricingConfig: database grid or fallback, never a mix', () => {
  const live = { ...clone(), effectiveFrom: '2026-09-25' };

  it('a valid stored grid is used as is', () => {
    const r = resolvePricingConfig(live);
    expect(r.source).toBe('database');
    expect(r.reason).toBeNull();
    expect(r.config).toBe(live);
  });

  it('a stored grid with other rates is used as is (the admin changed them)', () => {
    const edited = clone();
    edited.modes.express.perKgCents = 1950;
    expect(priced(q({ weightKg: 2 }, resolvePricingConfig(edited).config).express).totalCents).toBe(4400); // 2×19.50 + 5
  });

  it('no row → fallback (missing)', () => {
    expect(resolvePricingConfig(null)).toMatchObject({ source: 'fallback', reason: 'missing', config: FB });
    expect(resolvePricingConfig(undefined)).toMatchObject({ source: 'fallback', reason: 'missing' });
  });

  const broken: [string, unknown][] = [
    ['text instead of a document', 'grid'],
    ['an array', []],
    ['an empty document', {}],
    ['rate stored as text', storedWith('modes.express.perKgCents', '18')],
    ['negative handling fee', storedWith('handlingFeeCents', -500)],
    ['Infinity (1e999 in the JSON)', JSON.parse(JSON.stringify(FB).replace('"perKgCents":1600', '"perKgCents":1e999'))],
    ['NaN', storedWith('volumetricSurchargeRateCentsPerKg', NaN)],
    ['missing volume rate', storedWith('volumetricSurchargeRateCentsPerKg', DELETE)],
    ['null cargo maximum', storedWith('modes.cargo.maxKg', null)],
    ['divisor 0 (division by zero)', storedWith('volumetricDivisor', 0)],
    ['tiers out of order', storedWith('modes.sea.tiers', [{ uptoM3: 10, perM3Cents: 72500 }, { uptoM3: 5, perM3Cents: 75000 }])],
    ['tiers not a list', storedWith('modes.sea.tiers', { uptoM3: 10 })],
    ['ratio modes not a list', storedWith('ratioQuote.appliesTo', 'sea')],
    ['presets not a list', storedWith('presets', { carton_std: 7000 })],
    ['VAT text as an object', storedWith('vatStatus', { fr: 'TTC' })],
    ['no corridor', storedWith('corridor', DELETE)],
  ];

  it.each(broken)('%s → the whole fallback grid (invalid)', (_label, stored) => {
    const r = resolvePricingConfig(stored);
    expect(r.source).toBe('fallback');
    expect(r.reason).toBe('invalid');
    expect(r.config).toBe(FB);
  });

  it('whatever is stored, a shown price is a finite, non-negative whole number of cents', () => {
    const inputs: ShipmentInput[] = [
      { weightKg: 6, lengthCm: 60, widthCm: 40, heightCm: 40 }, { weightKg: 0.4 }, { weightKg: 499.999 },
      { volumeM3: 3 }, { volumeM3: 9.999, weightKg: 100 }, { lengthCm: 40, widthCm: 30, heightCm: 30, parcels: 4 },
      { weightKg: 23, volumeM3: 0.2, volumetricFromVolume: true },
    ];
    for (const [, stored] of [...broken, ['valid', live] as [string, unknown]]) {
      const cfg = resolvePricingConfig(stored).config;
      for (const i of inputs) {
        const res = computeQuote(i, cfg);
        for (const r of [res.express, res.cargo, res.sea]) {
          if (r.kind !== 'price') continue;
          expect(Number.isInteger(r.totalCents)).toBe(true);
          expect(r.totalCents).toBeGreaterThanOrEqual(0);
          for (const l of r.lines) expect(Number.isFinite(l.cents)).toBe(true);
        }
      }
    }
  });
});

describe('restore default values', () => {
  it('resets the tariff, keeps the informational fields', () => {
    const edited = clone();
    edited.modes.cargo.perKgCents = 1700;
    edited.modes.sea.tiers.push({ uptoM3: 20, perM3Cents: 70000 });
    edited.transitTimes = { express: '3 à 5 jours', cargo: null, sea: null };
    edited.vatStatus = 'Prix TTC';
    edited.effectiveFrom = '2026-10-01';
    const restored = withFallbackTariff(edited);
    expect(restored.modes).toEqual(FB.modes);
    expect(restored.transitTimes).toEqual({ express: '3 à 5 jours', cargo: null, sea: null });
    expect(restored.vatStatus).toBe('Prix TTC');
    expect(restored.effectiveFrom).toBe('2026-10-01');
    expect(hasFallbackTariff(restored)).toBe(true);
    expect(hasFallbackTariff(edited)).toBe(false);
    expect(Object.isFrozen(restored.modes)).toBe(false); // an editable copy
  });

  it('ignores key order (Postgres jsonb reorders keys)', () => {
    const reordered = reverseKeys(FB) as PricingConfig;
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(FB));
    expect(hasFallbackTariff(reordered)).toBe(true);
  });

  it('tells tariff paths from informational ones', () => {
    expect(isTariffPath('modes.express.perKgCents')).toBe(true);
    expect(isTariffPath('presets.carton_std.seaFlatTransportCents')).toBe(true);
    expect(isTariffPath('handlingFeeCents')).toBe(true);
    expect(isTariffPath('transitTimes.sea')).toBe(false);
    expect(isTariffPath('effectiveFrom')).toBe(false);
    expect(isTariffPath('includes.insurance')).toBe(false);
  });
});
