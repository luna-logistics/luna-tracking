import { describe, it, expect } from 'vitest';
import { computeQuote, type CorridorGrid, type ModeResult, type PricedResult, type PricingConfig, type ShipmentInput } from './engine';
import { suggestFromGrid } from './pro-suggest';
import { TEST_PRICING_CONFIG } from './test-config';

/**
 * Brussels → Lubumbashi corridor (PDF « Grille tarifaire Lubumbashi »): express
 * €21/kg (min €21), cargo €17.50/kg, sea 750/725/700 €/m³ up to 30 m³ with a flat
 * +€3/kg on every tier AND carton (billed on the actual weight), €5 dossier, and
 * NO sous-douane. Same volumetric rules as Kinshasa. All totals in integer cents.
 */
const LUBUMBASHI: CorridorGrid = {
  handlingFeeCents: 500,
  customsAdminFeeCents: null,
  volumetricDivisor: 6000,
  volumetricSurchargeRateCentsPerKg: 550,
  seaWeightSurchargeCentsPerKg: 300,
  ratioQuote: { thresholdKgPerM3: 374, appliesTo: ['sea'] },
  modes: {
    express: { perKgCents: 2100, flatMinCents: 2100, minKg: 0.1, maxKg: 200 },
    cargo: { perKgCents: 1750, minKg: 1, maxKg: 500 },
    sea: { tiers: [{ uptoM3: 5, perM3Cents: 75000 }, { uptoM3: 10, perM3Cents: 72500 }, { uptoM3: 30, perM3Cents: 70000 }], maxM3: 30 },
  },
  presets: [
    { key: 'carton_std', lengthCm: 60, widthCm: 40, heightCm: 40, sheetPriceCents: 7500, seaFlatTransportCents: 7000 },
    { key: 'carton_small', lengthCm: 40, widthCm: 30, heightCm: 30, sheetPriceCents: 3000, seaFlatTransportCents: 2500 },
  ],
  transitTimes: { express: null, cargo: null, sea: null },
  vatStatus: null,
  includes: null,
};

const CONFIG: PricingConfig = {
  ...TEST_PRICING_CONFIG,
  presets: [
    { key: 'carton_std', lengthCm: 60, widthCm: 40, heightCm: 40, sheetPriceCents: 7500, seaFlatTransportCents: 7000 },
    { key: 'carton_small', lengthCm: 40, widthCm: 30, heightCm: 30, sheetPriceCents: 3000, seaFlatTransportCents: 2500 },
  ],
  corridors: { lubumbashi: LUBUMBASHI },
};

const toLub = (i: ShipmentInput): ShipmentInput => ({ ...i, destination: 'lubumbashi' });
const priced = (r: ModeResult): PricedResult => { expect(r.kind).toBe('price'); return r as PricedResult; };
const q = (i: ShipmentInput) => computeQuote(toLub(i), CONFIG);

describe('Lubumbashi — air (express / cargo)', () => {
  it('express 0.1–1 kg = €21 flat minimum (+ €5 dossier)', () => {
    expect(priced(q({ weightKg: 0.4 }).express).totalCents).toBe(2600);  // €21 min + 5
    expect(priced(q({ weightKg: 1 }).express).totalCents).toBe(2600);    // 1×21 + 5
  });
  it('express 1–200 kg = €21/kg; cargo = €17.50/kg', () => {
    expect(priced(q({ weightKg: 2 }).express).totalCents).toBe(4700);    // 2×21 + 5
    expect(priced(q({ weightKg: 10 }).cargo).totalCents).toBe(18000);    // 10×17.50 + 5
    expect(priced(q({ weightKg: 1.3 }).express).totalCents).toBe(3230);  // 1.3×21 + 5 (to the gram)
  });
  it('above the weight ceilings → quote', () => {
    expect(q({ weightKg: 200.001 }).express.kind).toBe('quote');
    expect(q({ weightKg: 500.001 }).cargo.kind).toBe('quote');
    expect(priced(q({ weightKg: 200 }).express).totalCents).toBe(420500); // 200×21 + 5
    expect(priced(q({ weightKg: 500 }).cargo).totalCents).toBe(875500);   // 500×17.50 + 5
  });
  it('volumetric weight drives when it exceeds the actual weight (same rule as Kinshasa)', () => {
    const ex = priced(q({ weightKg: 6, lengthCm: 60, widthCm: 40, heightCm: 40 }).express);
    expect(ex.totalCents).toBe(18600);  // 6×21 + 10×5.50 + 5
    expect(ex.volumetricWeightKg).toBe(16);
    expect(priced(q({ weightKg: 6, lengthCm: 60, widthCm: 40, heightCm: 40 }).cargo).totalCents).toBe(16500); // 6×17.50 + 10×5.50 + 5
  });
});

describe('Lubumbashi — sea (per-m³ + €3/kg surcharge)', () => {
  it('each tier carries the +€3/kg surcharge on the actual weight', () => {
    expect(priced(q({ volumeM3: 3, weightKg: 100 }).sea).totalCents).toBe(255500);  // 3×750 + 100×3 + 5
    expect(priced(q({ volumeM3: 5, weightKg: 100 }).sea).totalCents).toBe(405500);  // 5×750 + 300 + 5
    expect(priced(q({ volumeM3: 5.5, weightKg: 100 }).sea).totalCents).toBe(429250); // 5.5×725 + 300 + 5
    expect(priced(q({ volumeM3: 20, weightKg: 100 }).sea).totalCents).toBe(1430500); // 20×700 + 300 + 5
    expect(priced(q({ volumeM3: 30, weightKg: 100 }).sea).totalCents).toBe(2130500); // 30×700 + 300 + 5
  });
  it('the surcharge is a line billed at €3/kg on the actual weight', () => {
    const s = priced(q({ volumeM3: 3, weightKg: 100 }).sea);
    const line = s.lines.find((l) => l.key === 'sea_weight_surcharge');
    expect(line?.rateCentsPerKg).toBe(300);
    expect(line?.qtyKg).toBe(100);
    expect(line?.cents).toBe(30000);
  });
  it('over 30 m³ → quote; sea needs a weight to apply the surcharge → empty without one', () => {
    expect(q({ volumeM3: 30.001, weightKg: 100 }).sea.kind).toBe('quote');
    expect(q({ volumeM3: 3 }).sea.kind).toBe('empty'); // no weight → cannot price the €3/kg
  });
  it('density ratio above 374 kg/m³ still forces a quote', () => {
    expect(q({ volumeM3: 1, weightKg: 374.5 }).sea.kind).toBe('quote');
    const r = q({ volumeM3: 1, weightKg: 374.5 }).sea;
    if (r.kind === 'quote') expect(r.reason).toBe('ratio');
  });
  it('carton flats: €75 / €30 base + €3/kg (exact dimensions)', () => {
    // 60×40×40, 6 kg → 70 transport + 5 dossier + 6×3 = €93
    expect(priced(q({ lengthCm: 60, widthCm: 40, heightCm: 40, weightKg: 6 }).sea).totalCents).toBe(9300);
    // 40×30×30, 6 kg → 25 + 5 + 18 = €48
    expect(priced(q({ lengthCm: 40, widthCm: 30, heightCm: 30, weightKg: 6 }).sea).totalCents).toBe(4800);
  });
});

describe('Lubumbashi — no sous-douane, unknown cities stay on quote', () => {
  it('a destination without a corridor is a quote on every mode', () => {
    const r = computeQuote({ weightKg: 10, destination: 'matadi' }, CONFIG);
    for (const m of [r.express, r.cargo, r.sea]) {
      expect(m.kind).toBe('quote');
      if (m.kind === 'quote') expect(m.reason).toBe('destination');
    }
  });
  it('pro suggestion never adds the €125 admin fee for Lubumbashi, but does for Kinshasa', () => {
    const base = { originCountry: 'BE', originCity: 'Brussels', weightKg: 10, volumeM3: null, dimsCm: null } as const;
    const lub = suggestFromGrid({ ...base, mode: 'air', destinationCountry: 'CD', destinationCity: 'Lubumbashi', underCustoms: true }, CONFIG);
    const kin = suggestFromGrid({ ...base, mode: 'air', destinationCountry: 'CD', destinationCity: 'Kinshasa', underCustoms: true }, CONFIG);
    const hasCustoms = (s: typeof lub) => s.kind === 'options' && s.options.some((o) => o.kind === 'price' && o.lines.some((l) => l.key === 'customs_admin'));
    expect(hasCustoms(lub)).toBe(false);
    expect(hasCustoms(kin)).toBe(true);
  });
});
