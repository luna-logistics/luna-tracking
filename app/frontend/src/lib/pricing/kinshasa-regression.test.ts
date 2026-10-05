import { describe, it, expect } from 'vitest';
import { computeQuote, type CorridorGrid, type PricingConfig, type ShipmentInput } from './engine';
import { TEST_PRICING_CONFIG } from './test-config';

/**
 * REGRESSION GUARD — Kinshasa must price EXACTLY the same before and after the
 * Lubumbashi corridor was added. Two proofs over a broad input matrix:
 *
 *   1. Adding a `corridors.lubumbashi` block (and leaving the root untouched)
 *      changes nothing for a Kinshasa shipment: computeQuote(input, Kinshasa-only)
 *      is deep-equal to computeQuote(input, Kinshasa + Lubumbashi) for every input
 *      whose destination is Kinshasa (explicit or defaulted).
 *   2. Anchor totals: the confirmed Kinshasa prices stay at the exact cent.
 *
 * If a future change to the corridor machinery leaks into the root grid, proof 1
 * fails; if a rate drifts, proof 2 fails.
 */

const CONFIG_K: PricingConfig = {
  ...TEST_PRICING_CONFIG,
  presets: [
    { key: 'carton_std', lengthCm: 60, widthCm: 40, heightCm: 40, sheetPriceCents: 7500, seaFlatTransportCents: 7000 },
    { key: 'carton_small', lengthCm: 40, widthCm: 30, heightCm: 30, sheetPriceCents: 3000, seaFlatTransportCents: 2500 },
    { key: 'suitcase', weightKg: 23 },
    { key: 'move_3m3', volumeM3: 3 },
  ],
  transitTimes: { express: null, cargo: null, sea: null },
  vatStatus: null,
  includes: null,
  effectiveFrom: null,
};

// A full Lubumbashi corridor grid (the PDF grid) grafted onto the SAME root.
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
  presets: CONFIG_K.presets,
  transitTimes: { express: null, cargo: null, sea: null },
  vatStatus: null,
  includes: null,
};

const CONFIG_K_WITH_LUB: PricingConfig = { ...CONFIG_K, corridors: { lubumbashi: LUBUMBASHI } };

// A broad matrix: express/cargo (weights, volumetric, thresholds) and sea
// (volumes, cartons, ratio, over-max), with and without an explicit Kinshasa
// destination, plus customs-irrelevant variations.
const MATRIX: ShipmentInput[] = [
  { weightKg: 0.4 }, { weightKg: 1 }, { weightKg: 1.3 }, { weightKg: 6 }, { weightKg: 12.345 },
  { weightKg: 23 }, { weightKg: 200 }, { weightKg: 200.5 }, { weightKg: 500 }, { weightKg: 500.001 }, { weightKg: 600 },
  { weightKg: 6, lengthCm: 60, widthCm: 40, heightCm: 40 },
  { weightKg: 16, lengthCm: 60, widthCm: 40, heightCm: 40 },
  { weightKg: 20, lengthCm: 60, widthCm: 40, heightCm: 40 },
  { weightKg: 10, lengthCm: 20, widthCm: 20, heightCm: 20 },
  { weightKg: 6, volumeM3: 0.096, volumetricFromVolume: true },
  { volumeM3: 3 }, { volumeM3: 5 }, { volumeM3: 5.5 }, { volumeM3: 7 }, { volumeM3: 10 }, { volumeM3: 10.001 }, { volumeM3: 12 },
  { lengthCm: 60, widthCm: 40, heightCm: 40 }, { lengthCm: 60, widthCm: 40, heightCm: 40, parcels: 3 },
  { lengthCm: 40, widthCm: 30, heightCm: 30 }, { lengthCm: 61, widthCm: 40, heightCm: 40 },
  { weightKg: 374, volumeM3: 1 }, { weightKg: 374.5, volumeM3: 1 }, { weightKg: 50, lengthCm: 60, widthCm: 40, heightCm: 40 },
];

describe('Kinshasa is byte-for-byte unaffected by the Lubumbashi corridor', () => {
  it.each(MATRIX.map((i, idx) => [idx, i] as const))(
    'input #%i prices identically with and without the extra corridor',
    (_idx, input) => {
      // Default destination (Kinshasa) and explicit Kinshasa both match.
      expect(computeQuote(input, CONFIG_K_WITH_LUB)).toEqual(computeQuote(input, CONFIG_K));
      expect(computeQuote({ ...input, destination: 'kinshasa' }, CONFIG_K_WITH_LUB))
        .toEqual(computeQuote({ ...input, destination: 'kinshasa' }, CONFIG_K));
    },
  );
});

describe('Kinshasa anchor totals (confirmed tariff, to the cent)', () => {
  const total = (input: ShipmentInput, mode: 'express' | 'cargo' | 'sea', config = CONFIG_K) => {
    const r = computeQuote(input, config)[mode];
    return r.kind === 'price' ? r.totalCents : r.kind;
  };
  it('express / cargo', () => {
    expect(total({ weightKg: 0.4 }, 'express')).toBe(2300);          // €18 min + 5
    expect(total({ weightKg: 1.3 }, 'express')).toBe(2840);          // 1.3×18 + 5
    expect(total({ weightKg: 6, lengthCm: 60, widthCm: 40, heightCm: 40 }, 'express')).toBe(16800); // 6×18 + 10×5.50 + 5
    expect(total({ weightKg: 6, lengthCm: 60, widthCm: 40, heightCm: 40 }, 'cargo')).toBe(15600);   // 6×16 + 10×5.50 + 5
    expect(total({ weightKg: 200 }, 'express')).toBe(360500);
    expect(total({ weightKg: 200.5 }, 'express')).toBe('quote');
    expect(total({ weightKg: 500 }, 'cargo')).toBe(800500);
    expect(total({ weightKg: 500.001 }, 'cargo')).toBe('quote');
  });
  it('sea (tiers, cartons, ratio, over-max)', () => {
    expect(total({ volumeM3: 3 }, 'sea')).toBe(225500);
    expect(total({ volumeM3: 5.5 }, 'sea')).toBe(399250);
    expect(total({ volumeM3: 10 }, 'sea')).toBe(725500);
    expect(total({ volumeM3: 10.001 }, 'sea')).toBe('quote');
    expect(total({ lengthCm: 60, widthCm: 40, heightCm: 40 }, 'sea')).toBe(7500);   // €75
    expect(total({ lengthCm: 40, widthCm: 30, heightCm: 30 }, 'sea')).toBe(3000);   // €30
    expect(total({ lengthCm: 60, widthCm: 40, heightCm: 40, parcels: 3 }, 'sea')).toBe(21500);
    expect(total({ weightKg: 374, volumeM3: 1 }, 'sea')).toBe(75500);
    expect(total({ weightKg: 374.5, volumeM3: 1 }, 'sea')).toBe('quote');
  });
  it('no Kinshasa sea shipment ever carries a weight surcharge line', () => {
    for (const input of MATRIX) {
      const r = computeQuote(input, CONFIG_K_WITH_LUB).sea;
      if (r.kind === 'price') expect(r.lines.some((l) => l.key === 'sea_weight_surcharge')).toBe(false);
    }
  });
});
