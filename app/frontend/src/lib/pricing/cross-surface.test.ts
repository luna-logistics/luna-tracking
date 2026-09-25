import { describe, it, expect } from 'vitest';
import { computeQuote, type QuoteResponse } from './engine';
import { TEST_PRICING_CONFIG } from './test-config';
import { calculatorEngineInput, tarifsEngineInput, gridEstimateLines } from './surfaces';
import { suggestFromGrid, type ProQuoteInput } from './pro-suggest';
import { formatM3, parseDecimal, volumeFieldValue, volumeM3FromCm } from './volume';

/**
 * One grid, three surfaces: /calculateur, the /tarifs quote form and the pro
 * "Suggérer un tarif" must give the same figures for the same shipment.
 * Reference case confirmed with the owner: 6 kg in a 60×40×40 carton
 * (0.096 m³) → express €193, cargo €181.
 */
const CONFIG = TEST_PRICING_CONFIG;

const calc = (f: Partial<Parameters<typeof calculatorEngineInput>[0]>) => computeQuote(calculatorEngineInput({
  weight: '', length: '', width: '', height: '', parcels: '1', volume: '', destination: 'kinshasa', ...f,
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
  it('reference case: express €193 / cargo €181 on calculator (dims), calculator (volume), /tarifs and pro', () => {
    for (const q of [calc({ weight: '6', length: '60', width: '40', height: '40' }), calc({ weight: '6', volume: '0,096' }),
      tarifs({ weight: '6', volume: '0.096' })]) {
      expect(cents(q, 'express')).toBe(16800);
      expect(cents(q, 'cargo')).toBe(15600);
    }
    expect(pro(6, 0.096)).toEqual({ express: 16800, cargo: 15600 });
  });

  it('sea 3 m³ → €2,255 on calculator, /tarifs and pro', () => {
    expect(cents(calc({ weight: '100', volume: '3' }), 'sea')).toBe(225500);
    expect(cents(tarifs({ weight: '100', volume: '3' }), 'sea')).toBe(225500);
    expect(pro(100, 3, 'sea')).toEqual({ sea: 225500 });
  });

  it('off-corridor → sur devis everywhere (never a price for a route the grid does not cover)', () => {
    const other = calc({ weight: '6', volume: '0.096', destination: 'other' });
    const anvers = tarifs({ originValue: 'anvers', weight: '6', volume: '0.096' });
    const lubum = tarifs({ destinationSlug: 'lubumbashi', weight: '6', volume: '0.096' });
    for (const q of [other, lubum]) expect(q.express).toMatchObject({ kind: 'quote', reason: 'destination' });
    expect(anvers.express).toMatchObject({ kind: 'quote', reason: 'origin' });
  });

  it('estimate lines for the office: figures when priced, nothing when the whole grid says sur devis', () => {
    const t = (k: string) => k;
    const lines = gridEstimateLines(calc({ weight: '6', length: '60', width: '40', height: '40' }), t, 'fr');
    expect(lines[0]).toBe('grid_estimate.title');
    expect(lines.join('\n')).toMatch(/168,00/); // express 6×18 + 10×5.50 + 5
    expect(gridEstimateLines(calc({ weight: '6', destination: 'other' }), t, 'fr')).toEqual([]);
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
    expect(all(calc({ weight: '6', length: '60', width: '40', height: '40' })))
      .toEqual(all(calc({ weight: '6', volume: '0.096' })));
    expect(all(calc({ weight: '6', length: '60', width: '40', height: '40', parcels: '2' })))
      .toEqual(all(calc({ weight: '6', volume: '0.096', parcels: '2' })));
  });

  it('/tarifs: dimensions × colis (total weight) = total volume typed = calculator', () => {
    const dims = all(tarifs({ weight: '12', length: '60', width: '40', height: '40', parcels: '2' }));
    expect(dims).toEqual(all(tarifs({ weight: '12', volume: '0.192' })));
    expect(dims).toEqual(all(calc({ weight: '6', length: '60', width: '40', height: '40', parcels: '2' })));
    expect(all(tarifs({ weight: '6', length: '60', width: '40', height: '40' }))).toEqual({ express: 16800, cargo: 15600, sea: all(calc({ weight: '6', volume: '0.096' })).sea });
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
    expect(all(calc({ weight: '6', length: '60', width: '40', height: '40', volume: '0.2' })))
      .toEqual(all(calc({ weight: '6', volume: '0.2' })));
    expect(all(tarifs({ weight: '6', length: '60', width: '40', height: '40', volume: '0.2' })))
      .toEqual(all(tarifs({ weight: '6', volume: '0.2' })));
  });

  it('incomplete dimensions on the pro form never drop the typed volume', () => {
    expect(pro(100, 3, 'sea', { length: 60, width: null, height: 40, pieces: 1 })).toEqual({ sea: 225500 });
  });

  it('a carton-preset size prices the same flat sea rate on all three surfaces', () => {
    const withPreset: PricingConfig = { ...CONFIG, presets: [{ key: 'carton_std', lengthCm: 60, widthCm: 40, heightCm: 40, seaFlatTransportCents: 6500 }] };
    const c = computeQuote(calculatorEngineInput({ weight: '6', length: '60', width: '40', height: '40', parcels: '1', volume: '', destination: 'kinshasa' }), withPreset);
    const tq = computeQuote(tarifsEngineInput({ originValue: 'bruxelles', destinationSlug: 'kinshasa', weight: '6', volume: '', length: '60', width: '40', height: '40' }, withPreset), withPreset);
    expect(cents(c, 'sea')).toBe(7000);
    expect(cents(tq, 'sea')).toBe(7000);
    expect(pro(6, 0.096, 'sea', { length: 60, width: 40, height: 40, pieces: 1 }, withPreset)).toEqual({ sea: 7000 });
  });
});
