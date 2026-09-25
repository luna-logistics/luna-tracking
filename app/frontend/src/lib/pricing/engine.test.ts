import { describe, it, expect } from 'vitest';
import { computeQuote, transitTimeFor, type PricingConfig, type PricedResult, type ModeResult } from './engine';
import { TEST_PRICING_CONFIG } from './test-config';

/**
 * The money core. These cases come straight from the owner's confirmed tariff
 * (see the brief). Everything is asserted in INTEGER CENTS and must match to the
 * cent. Config mirrors the seeded `pricing_config` row so the tests are hermetic.
 */
const CONFIG: PricingConfig = {
  ...TEST_PRICING_CONFIG,
  presets: [
    { key: 'carton_std', lengthCm: 60, widthCm: 40, heightCm: 40, seaFlatTransportCents: 7000 },
    { key: 'carton_small', lengthCm: 40, widthCm: 30, heightCm: 30, seaFlatTransportCents: 2500 },
  ],
  transitTimes: { express: null, cargo: null, sea: null },
  vatStatus: null,
  includes: null,
  effectiveFrom: null,
};

const priced = (r: ModeResult): PricedResult => {
  expect(r.kind).toBe('price');
  return r as PricedResult;
};
const hasLine = (r: PricedResult, key: string) => r.lines.some((l) => l.key === key);

describe('pricing engine — Brussels → Kinshasa', () => {
  it('1. 6 kg in a 60×40×40 carton → express €168, cargo €156 (volumetric drives)', () => {
    const q = computeQuote({ weightKg: 6, lengthCm: 60, widthCm: 40, heightCm: 40 }, CONFIG);
    const ex = priced(q.express);
    expect(ex.totalCents).toBe(16800);              // 6×18 + 10×5.50 + 5
    expect(ex.volumetricWeightKg).toBe(16);
    expect(ex.chargeableBasis).toBe('volumetric');
    expect(hasLine(ex, 'volumetric_diff')).toBe(true);
    const ca = priced(q.cargo);
    expect(ca.totalCents).toBe(15600);              // 6×16 + 10×5.50 + 5
    expect(hasLine(ca, 'volumetric_diff')).toBe(true);
  });

  it('2. 10 kg in a 20×20×20 carton (Pv 1.33, P>Pv) → express €185, no volumetric line', () => {
    const q = computeQuote({ weightKg: 10, lengthCm: 20, widthCm: 20, heightCm: 20 }, CONFIG);
    const ex = priced(q.express);
    expect(ex.totalCents).toBe(18500);              // 10×18 + 5
    expect(ex.chargeableBasis).toBe('actual');
    expect(hasLine(ex, 'volumetric_diff')).toBe(false);
    expect(priced(q.cargo).totalCents).toBe(16500); // 10×16 + 5
  });

  it('3. 0.4 kg express → €23 (flat €18 minimum, not proportional)', () => {
    const q = computeQuote({ weightKg: 0.4 }, CONFIG);
    const ex = priced(q.express);
    expect(ex.totalCents).toBe(2300);               // 18 (min) + 5
    expect(hasLine(ex, 'volumetric_diff')).toBe(false);
  });

  it('4. 1.3 kg express → €28.40, billed to the gram (no rounding up)', () => {
    const q = computeQuote({ weightKg: 1.3 }, CONFIG);
    expect(priced(q.express).totalCents).toBe(2840); // 1.3×18 + 5
  });

  it('5. sea 3 m³ → €2,255 ; sea 7 m³ → €5,080', () => {
    expect(priced(computeQuote({ volumeM3: 3 }, CONFIG).sea).totalCents).toBe(225500);
    expect(priced(computeQuote({ volumeM3: 7 }, CONFIG).sea).totalCents).toBe(508000);
  });

  it('6. sea 12 m³ → quote request, no price', () => {
    const r = computeQuote({ volumeM3: 12 }, CONFIG).sea;
    expect(r.kind).toBe('quote');
    if (r.kind === 'quote') expect(r.reason).toBe('over_max_volume');
  });

  it('7. 600 kg cargo → quote ; 250 kg express → quote (over max weight)', () => {
    const cargo = computeQuote({ weightKg: 600 }, CONFIG).cargo;
    expect(cargo.kind).toBe('quote');
    if (cargo.kind === 'quote') expect(cargo.reason).toBe('over_max_weight');
    const express = computeQuote({ weightKg: 250 }, CONFIG).express;
    expect(express.kind).toBe('quote');
    if (express.kind === 'quote') expect(express.reason).toBe('over_max_weight');
  });

  it('8. 0.096 m³ @ 50 kg (ratio 520 kg/m³) → sea quote; weight-billed air modes stay priced', () => {
    const q = computeQuote({ weightKg: 50, lengthCm: 60, widthCm: 40, heightCm: 40 }, CONFIG);
    // The density surcharge is a volume-billing concern → it forces a quote on sea.
    expect(q.sea.kind).toBe('quote');
    if (q.sea.kind === 'quote') expect(q.sea.reason).toBe('ratio');
    // Air is billed by weight, so density never forces a quote there (see test 2).
    expect(priced(q.express).totalCents).toBe(90500); // 50×18 + 5
    expect(priced(q.cargo).totalCents).toBe(80500);   // 50×16 + 5
  });

  it('9. transit time: absent in config → null; present → the value', () => {
    expect(transitTimeFor(CONFIG, 'express')).toBeNull();
    const withTransit: PricingConfig = { ...CONFIG, transitTimes: { express: '3–5 j', cargo: null, sea: null } };
    expect(transitTimeFor(withTransit, 'express')).toBe('3–5 j');
    expect(transitTimeFor(withTransit, 'sea')).toBeNull();
  });

  it('10. every priced total is an integer number of cents', () => {
    const inputs = [
      { weightKg: 6, lengthCm: 60, widthCm: 40, heightCm: 40 },
      { weightKg: 1.3 }, { weightKg: 0.4 }, { volumeM3: 3 }, { volumeM3: 7 }, { weightKg: 23 },
    ];
    for (const i of inputs) {
      const q = computeQuote(i, CONFIG);
      for (const r of [q.express, q.cargo, q.sea]) {
        if (r.kind === 'price') expect(Number.isInteger(r.totalCents)).toBe(true);
      }
    }
  });

  it('flat carton: exact dimensions bill at the printed price (transport + €5), matching the paper sheet', () => {
    // one 60×40×40 → €75 (70 transport + 5 handling)
    expect(priced(computeQuote({ lengthCm: 60, widthCm: 40, heightCm: 40 }, CONFIG).sea).totalCents).toBe(7500);
    // three 60×40×40 → 3×70 + 5 (handling once) = €215
    expect(priced(computeQuote({ lengthCm: 60, widthCm: 40, heightCm: 40, parcels: 3 }, CONFIG).sea).totalCents).toBe(21500);
    // one 40×30×30 → €30 (25 transport + 5 handling)
    expect(priced(computeQuote({ lengthCm: 40, widthCm: 30, heightCm: 30 }, CONFIG).sea).totalCents).toBe(3000);
    // 61×40×40 is NOT a preset → per-m³ rule (0.0976 m³ × €750 + €5 = €78.20), no flat line
    const odd = priced(computeQuote({ lengthCm: 61, widthCm: 40, heightCm: 40 }, CONFIG).sea);
    expect(odd.totalCents).toBe(7820);
    expect(odd.lines.some((l) => l.key === 'carton_flat')).toBe(false);
    expect(odd.lines.some((l) => l.key === 'volume')).toBe(true);
  });

  it('volumetricFromVolume: 6 kg + 0.096 m³ (no dims) prices like the 60×40×40 carton; off by default', () => {
    const on = computeQuote({ weightKg: 6, volumeM3: 0.096, volumetricFromVolume: true }, CONFIG);
    expect(priced(on.express).totalCents).toBe(16800);
    expect(priced(on.cargo).totalCents).toBe(15600);
    const off = computeQuote({ weightKg: 6, volumeM3: 0.096 }, CONFIG);
    expect(hasLine(priced(off.express), 'volumetric_diff')).toBe(false);
  });

  it('bonus: a non-Kinshasa destination forces a quote on every mode', () => {
    const q = computeQuote({ weightKg: 10, destination: 'lubumbashi' }, CONFIG);
    for (const r of [q.express, q.cargo, q.sea]) {
      expect(r.kind).toBe('quote');
      if (r.kind === 'quote') expect(r.reason).toBe('destination');
    }
  });
});
