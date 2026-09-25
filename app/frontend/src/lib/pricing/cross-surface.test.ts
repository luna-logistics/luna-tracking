import { describe, it, expect } from 'vitest';
import { computeQuote, type PricingConfig, type QuoteResponse } from './engine';
import { TEST_PRICING_CONFIG } from './test-config';
import { calculatorEngineInput, tarifsEngineInput, gridEstimateLines, packageLinesSize, type PackageLine } from './surfaces';
import { suggestFromGrid, type ProQuoteInput } from './pro-suggest';
import { formatM3, parseDecimal, volumeFieldValue, volumeM3FromCm } from './volume';

/**
 * One grid, three surfaces: /calculateur, the /tarifs quote form and the pro
 * "Suggérer un tarif" must give the same figures for the same shipment.
 * Reference case confirmed with the owner: 6 kg in a 60×40×40 carton
 * (0.096 m³ → 16 kg volumetric) → express €168, cargo €156 at the €5.50/kg
 * volumetric surcharge (2026-09-25; was €193 / €181 at €8/kg).
 */
const CONFIG = TEST_PRICING_CONFIG;

/** One package line (L, l, H, weight as typed); W(kg) = weight only. */
const L = (length: string, width: string, height: string, weight: string): PackageLine => ({ length, width, height, weight });
const W = (weight: string) => L('', '', '', weight);
const CARTON = L('60', '40', '40', '6');
const calc = (f: Partial<Parameters<typeof calculatorEngineInput>[0]>) => computeQuote(calculatorEngineInput({
  lines: [], volume: '', destination: 'kinshasa', ...f,
}), CONFIG);
const tarifs = (f: Partial<Parameters<typeof tarifsEngineInput>[0]>) => computeQuote(tarifsEngineInput({
  originValue: 'bruxelles', destinationSlug: 'kinshasa', weight: null, volume: null, ...f,
}, CONFIG), CONFIG);
const cents = (q: QuoteResponse, m: 'express' | 'cargo' | 'sea') => (q[m].kind === 'price' ? q[m].totalCents : q[m].kind);
const pro = (weightKg: number, volumeM3: number | null, mode: 'air' | 'sea' = 'air',
  dimsCm: ProQuoteInput['dimsCm'] = null, config: PricingConfig = CONFIG) => {
  const s = suggestFromGrid({ mode, originCountry: 'BE', destinationCountry: 'CD', originCity: 'Bruxelles',
    destinationCity: 'Kinshasa', weightKg, volumeM3, underCustoms: false, dimsCm }, config);
  if (s.kind !== 'options') throw new Error('no options');
  return Object.fromEntries(s.options.map((o) => [o.mode, o.kind === 'price' ? o.totalCents : o.kind]));
};

describe('same grid on every surface', () => {
  it('reference case: express €168 / cargo €156 on calculator (dims), calculator (volume), /tarifs and pro', () => {
    for (const q of [calc({ lines: [CARTON] }), calc({ lines: [W('6')], volume: '0,096' }),
      tarifs({ weight: '6', volume: '0.096' })]) {
      expect(cents(q, 'express')).toBe(16800);
      expect(cents(q, 'cargo')).toBe(15600);
    }
    expect(pro(6, 0.096)).toEqual({ express: 16800, cargo: 15600 });
  });

  it('sea 3 m³ → €2,255 on calculator, /tarifs and pro', () => {
    expect(cents(calc({ lines: [W('100')], volume: '3' }), 'sea')).toBe(225500);
    expect(cents(tarifs({ weight: '100', volume: '3' }), 'sea')).toBe(225500);
    expect(pro(100, 3, 'sea')).toEqual({ sea: 225500 });
  });

  it('off-corridor → sur devis everywhere (never a price for a route the grid does not cover)', () => {
    const other = calc({ lines: [W('6')], volume: '0.096', destination: 'other' });
    const anvers = tarifs({ originValue: 'anvers', weight: '6', volume: '0.096' });
    const lubum = tarifs({ destinationSlug: 'lubumbashi', weight: '6', volume: '0.096' });
    for (const q of [other, lubum]) expect(q.express).toMatchObject({ kind: 'quote', reason: 'destination' });
    expect(anvers.express).toMatchObject({ kind: 'quote', reason: 'origin' });
  });

  it('estimate lines for the office: figures when priced, nothing when the whole grid says sur devis', () => {
    const t = (k: string) => k;
    const lines = gridEstimateLines(calc({ lines: [CARTON] }), t, 'fr');
    expect(lines[0]).toBe('grid_estimate.title');
    expect(lines.join('\n')).toMatch(/168,00/); // express 6×18 + 10×5.50 + 5
    expect(gridEstimateLines(calc({ lines: [W('6')], destination: 'other' }), t, 'fr')).toEqual([]);
  });
});

/** All three modes' outcome for one quote, comparable with toEqual. */
const all = (q: QuoteResponse) => ({ express: cents(q, 'express'), cargo: cents(q, 'cargo'), sea: cents(q, 'sea') });

describe('volume from dimensions — one formula, same answer as a typed volume', () => {
  it('shared formula: 60×40×40 cm = 0.096 m³; × quantity; incomplete dims → nothing', () => {
    expect(volumeM3FromCm(60, 40, 40)).toBeCloseTo(0.096, 12);
    expect(volumeM3FromCm(60, 40, 40, 2)).toBeCloseTo(0.192, 12);
    expect(volumeM3FromCm(60, 40, null)).toBeNull();
    expect(parseDecimal('0,096')).toBe(0.096);
    expect(formatM3(0.1234567)).toBe('0.1235');
    expect(volumeFieldValue(null, 0.096)).toBe('0.096');   // auto-filled
    expect(volumeFieldValue('0.2', 0.096)).toBe('0.2');    // typed override wins
    expect(volumeFieldValue(null, null)).toBe('');
  });

  it('calculator: dimensions only = the volume typed directly (1 and 2 parcels)', () => {
    expect(all(calc({ lines: [CARTON] }))).toEqual(all(calc({ lines: [W('6')], volume: '0.096' })));
    expect(all(calc({ lines: [CARTON, CARTON] }))).toEqual(all(calc({ lines: [W('12')], volume: '0.192' })));
  });

  it('/tarifs: dimensions × colis (total weight) = total volume typed = calculator', () => {
    const dims = all(tarifs({ weight: '12', length: '60', width: '40', height: '40', parcels: '2' }));
    expect(dims).toEqual(all(tarifs({ weight: '12', volume: '0.192' })));
    expect(dims).toEqual(all(calc({ lines: [CARTON, CARTON] })));
    expect(all(tarifs({ weight: '6', length: '60', width: '40', height: '40' }))).toEqual({ express: 16800, cargo: 15600, sea: all(calc({ lines: [W('6')], volume: '0.096' })).sea });
  });

  it('pro Devis: dimensions × pièces = total volume typed = /tarifs', () => {
    const d = { length: 60, width: 40, height: 40, pieces: 2 };
    expect(pro(12, 0.192, 'air', d)).toEqual(pro(12, 0.192));
    expect(pro(12, 0.192, 'sea', d)).toEqual(pro(12, 0.192, 'sea'));
    const t = all(tarifs({ weight: '12', length: '60', width: '40', height: '40', parcels: '2' }));
    expect(pro(12, 0.192, 'air', d)).toEqual({ express: t.express, cargo: t.cargo });
    expect(pro(12, 0.192, 'sea', d)).toEqual({ sea: t.sea });
  });

  it('a typed volume overrides the dimensions on every surface', () => {
    expect(all(calc({ lines: [CARTON], volume: '0.2' }))).toEqual(all(calc({ lines: [W('6')], volume: '0.2' })));
    expect(all(tarifs({ weight: '6', length: '60', width: '40', height: '40', volume: '0.2' })))
      .toEqual(all(tarifs({ weight: '6', volume: '0.2' })));
  });

  it('incomplete dimensions on the pro form never drop the typed volume', () => {
    expect(pro(100, 3, 'sea', { length: 60, width: null, height: 40, pieces: 1 })).toEqual({ sea: 225500 });
  });

  it('a carton-preset size prices the same flat sea rate on all three surfaces', () => {
    const withPreset: PricingConfig = { ...CONFIG, presets: [{ key: 'carton_std', lengthCm: 60, widthCm: 40, heightCm: 40, seaFlatTransportCents: 6500 }] };
    const c = computeQuote(calculatorEngineInput({ lines: [CARTON], volume: '', destination: 'kinshasa' }), withPreset);
    const tq = computeQuote(tarifsEngineInput({ originValue: 'bruxelles', destinationSlug: 'kinshasa', weight: '6', volume: '', length: '60', width: '40', height: '40' }, withPreset), withPreset);
    expect(cents(c, 'sea')).toBe(7000);
    expect(cents(tq, 'sea')).toBe(7000);
    expect(pro(6, 0.096, 'sea', { length: 60, width: 40, height: 40, pieces: 1 }, withPreset)).toEqual({ sea: 7000 });
  });
});

describe('package lines — /tarifs, /calculateur and the pro Devis share one editor + rule', () => {
  const E = L('', '', '', '');
  const byLines = (lines: PackageLine[], config: PricingConfig = CONFIG) =>
    computeQuote(tarifsEngineInput({ originValue: 'bruxelles', destinationSlug: 'kinshasa', ...packageLinesSize(lines).fields }, config), config);
  /** The pro form: totals pre-filled from the lines, dimsCm only for identical lines. */
  const proByLines = (lines: PackageLine[], mode: 'air' | 'sea') => {
    const s = packageLinesSize(lines);
    const f = s.fields;
    const d = f.length != null ? { length: Number(f.length), width: Number(f.width), height: Number(f.height), pieces: Number(f.parcels) } : null;
    return pro(s.totalWeightKg as number, s.totalVolumeM3, mode, d);
  };
  const all = (q: QuoteResponse) => ({ express: cents(q, 'express'), cargo: cents(q, 'cargo'), sea: cents(q, 'sea') });

  it('one line + two empty default lines = the reference case', () => {
    const q = byLines([L('60', '40', '40', '6'), E, E]);
    expect(cents(q, 'express')).toBe(16800);
    expect(cents(q, 'cargo')).toBe(15600);
    expect(all(q)).toEqual(all(tarifs({ weight: '6', length: '60', width: '40', height: '40' })));
  });

  it('identical lines price like "N identical parcels" (keeps the carton flat sea rate)', () => {
    const withPreset: PricingConfig = { ...CONFIG, presets: [{ key: 'carton_std', lengthCm: 60, widthCm: 40, heightCm: 40, seaFlatTransportCents: 7000 }] };
    const three = byLines([L('60', '40', '40', '6'), L('60', '40', '40', '6'), L('60', '40', '40', '6')], withPreset);
    expect(all(three)).toEqual(all(computeQuote(tarifsEngineInput({ originValue: 'bruxelles', destinationSlug: 'kinshasa',
      weight: '18', volume: null, length: '60', width: '40', height: '40', parcels: '3' }, withPreset), withPreset)));
  });

  it('different sizes aggregate weight and volume like the pro colisage totals', () => {
    const s = packageLinesSize([L('60', '40', '40', '6'), L('40', '30', '30', '4'), E]);
    expect(s.totalWeightKg).toBe(10);
    expect(s.totalVolumeM3).toBeCloseTo(0.096 + 0.036, 10);
    // volumetric (0.132 m³ → 22 kg) over 10 kg actual: 10×18 + 12×5.50 + 5
    expect(cents(byLines([L('60', '40', '40', '6'), L('40', '30', '30', '4')]), 'express')).toBe(25100);
    expect(all(byLines([L('60', '40', '40', '6'), L('40', '30', '30', '4')])))
      .toEqual(all(tarifs({ weight: '10', volume: String(0.096 + 0.036) })));
  });

  it('never guesses: a line without dimensions → no volume (sea not priced); without weight → no air price', () => {
    const noDims = packageLinesSize([L('60', '40', '40', '6'), L('', '', '', '4')]);
    expect(noDims.missingDims).toBe(true);
    expect(noDims.totalVolumeM3).toBeNull();
    expect(noDims.totalWeightKg).toBe(10);
    const q = byLines([L('60', '40', '40', '6'), L('', '', '', '4')]);
    expect(cents(q, 'express')).toBe(18500); // 10×18 + 5, actual weight only
    expect(cents(q, 'sea')).not.toEqual(expect.any(Number));

    const noWeight = packageLinesSize([L('60', '40', '40', '6'), L('40', '30', '30', '')]);
    expect(noWeight.missingWeight).toBe(true);
    expect(noWeight.totalWeightKg).toBeNull();
  });

  it('every line counts, not just the first — same totals + prices on all three surfaces', () => {
    const mixed = [L('60', '40', '40', '6'), L('40', '30', '30', '4'), L('80', '50', '50', '15')];
    const s = packageLinesSize(mixed);
    expect(s.used).toBe(3);
    expect(s.totalWeightKg).toBe(25);
    expect(s.totalVolumeM3).toBeCloseTo(0.096 + 0.036 + 0.2, 10);
    const t = all(byLines(mixed));
    // volumetric 0.332 m³ → 55.33 kg over 25 kg actual: 25×18 + 30.33×5.50 + 5
    expect(t.express).toBe(Math.round(25 * 1800 + (0.332 * 1e6 / 6000 - 25) * 550 + 500));
    expect(all(calc({ lines: mixed }))).toEqual(t);
    expect(proByLines(mixed, 'air')).toEqual({ express: t.express, cargo: t.cargo });
    expect(proByLines(mixed, 'sea')).toEqual({ sea: t.sea });
    // …and differs from pricing the first line alone.
    expect(all(calc({ lines: [mixed[0]] }))).not.toEqual(t);
  });

  it('calculator: identical lines = carton × N, and a typed total volume replaces the lines', () => {
    expect(all(calc({ lines: [CARTON, CARTON, CARTON] }))).toEqual(all(byLines([CARTON, CARTON, CARTON])));
    expect(all(calc({ lines: [CARTON, L('40', '30', '30', '4')], volume: '1' })))
      .toEqual(all(tarifs({ weight: '10', volume: '1' })));
    expect(proByLines([CARTON, CARTON], 'air')).toEqual(pro(12, 0.192));
  });

  it('empty form → nothing used', () => {
    expect(packageLinesSize([E, E, E]).used).toBe(0);
  });
});
