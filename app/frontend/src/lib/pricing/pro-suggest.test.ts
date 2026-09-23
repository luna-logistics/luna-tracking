import { describe, it, expect } from 'vitest';
import { suggestFromGrid, type ProQuoteInput, type ProOption } from './pro-suggest';
import type { PricingConfig } from './engine';

// Mirrors the active pricing_config row (same values as engine.test.ts).
const CONFIG: PricingConfig = {
  corridor: { origin: 'brussels', destination: 'kinshasa' },
  handlingFeeCents: 500,
  customsAdminFeeCents: 12500,
  volumetricDivisor: 6000,
  volumetricSurchargeRateCentsPerKg: 800,
  ratioQuote: { thresholdKgPerM3: 374, appliesTo: ['sea'] },
  modes: {
    express: { perKgCents: 1800, flatMinCents: 1800, minKg: 0.1, maxKg: 200 },
    cargo: { perKgCents: 1600, minKg: 1, maxKg: 500 },
    sea: { tiers: [{ uptoM3: 5, perM3Cents: 75000 }, { uptoM3: 10, perM3Cents: 72500 }], maxM3: 10 },
  },
};

const base: ProQuoteInput = {
  mode: 'air', originCountry: 'BE', destinationCountry: 'CD',
  originCity: null, destinationCity: null, weightKg: 6, volumeM3: 0.096, underCustoms: false,
};
const opts = (q: Partial<ProQuoteInput>): ProOption[] => {
  const s = suggestFromGrid({ ...base, ...q }, CONFIG);
  if (s.kind !== 'options') throw new Error('expected options');
  return s.options;
};
const total = (o: ProOption) => (o.kind === 'price' ? o.totalCents : null);

describe('pro quote suggestion — same grid as /calculateur', () => {
  it('air → express + cargo; weight × rate + (volumetric − weight) × €8 + €5 dossier', () => {
    const [express, cargo] = opts({});
    expect(express.mode).toBe('express');
    expect(total(express)).toBe(19300); // 6×18 + 10×8 + 5
    expect(total(cargo)).toBe(18100);   // 6×16 + 10×8 + 5
  });

  it('real weight ≥ volumetric → no volumetric line', () => {
    const [express] = opts({ weightKg: 10, volumeM3: 0.008 });
    expect(total(express)).toBe(18500); // 10×18 + 5
    expect(express.kind === 'price' && express.lines.some((l) => l.key === 'volumetric_diff')).toBe(false);
  });

  it('billed to the gram: 1.3 kg express → €28.40', () => {
    const [express] = opts({ weightKg: 1.3, volumeM3: null });
    expect(total(express)).toBe(2840);
  });

  it('under customs adds the €125 admin fee; otherwise never', () => {
    const [plain] = opts({});
    const [customs] = opts({ underCustoms: true });
    expect(total(customs)! - total(plain)!).toBe(12500);
  });

  it('thresholds fall back to sur devis: cargo > 500 kg, express > 200 kg, sea > 10 m³', () => {
    const [express, cargo] = opts({ weightKg: 600, volumeM3: 1 });
    expect(express).toMatchObject({ kind: 'quote', reason: 'over_max_weight' });
    expect(cargo).toMatchObject({ kind: 'quote', reason: 'over_max_weight' });
    const [sea] = opts({ mode: 'sea', weightKg: 100, volumeM3: 12 });
    expect(sea).toMatchObject({ kind: 'quote', reason: 'over_max_volume' });
  });

  it('density above the configured ratio → sea sur devis', () => {
    const [sea] = opts({ mode: 'sea', weightKg: 50, volumeM3: 0.096 });
    expect(sea).toMatchObject({ kind: 'quote', reason: 'ratio' });
  });

  it('sea 3 m³ → €2,255', () => {
    const [sea] = opts({ mode: 'sea', weightKg: 100, volumeM3: 3 });
    expect(total(sea)).toBe(225500);
  });

  it('off-corridor → sur devis (reverse lane, other city)', () => {
    const [rev] = opts({ originCountry: 'CD', destinationCountry: 'BE' });
    expect(rev).toMatchObject({ kind: 'quote', reason: 'origin' });
    const [anvers] = opts({ originCity: 'Anvers' });
    expect(anvers).toMatchObject({ kind: 'quote', reason: 'origin' });
    const [bxl] = opts({ originCity: 'Bruxelles', destinationCity: 'Kinshasa' });
    expect(total(bxl)).toBe(19300);
  });

  it('road has no grid → explicit no_grid_for_mode', () => {
    expect(suggestFromGrid({ ...base, mode: 'road' }, CONFIG)).toEqual({ kind: 'no_grid_for_mode', mode: 'road' });
  });
});
