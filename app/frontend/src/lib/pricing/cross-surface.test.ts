import { describe, it, expect } from 'vitest';
import { computeQuote, type PricingConfig, type QuoteResponse } from './engine';
import { calculatorEngineInput, tarifsEngineInput, gridEstimateLines } from './surfaces';
import { suggestFromGrid } from './pro-suggest';

/**
 * One grid, three surfaces: /calculateur, the /tarifs quote form and the pro
 * "Suggérer un tarif" must give the same figures for the same shipment.
 * Reference case confirmed with the owner: 6 kg in a 60×40×40 carton
 * (0.096 m³) → express €193, cargo €181.
 */
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

const calc = (f: Partial<Parameters<typeof calculatorEngineInput>[0]>) => computeQuote(calculatorEngineInput({
  weight: '', length: '', width: '', height: '', parcels: '1', volume: '', destination: 'kinshasa', ...f,
}), CONFIG);
const tarifs = (f: Partial<Parameters<typeof tarifsEngineInput>[0]>) => computeQuote(tarifsEngineInput({
  originValue: 'bruxelles', destinationSlug: 'kinshasa', weight: null, volume: null, ...f,
}, CONFIG), CONFIG);
const cents = (q: QuoteResponse, m: 'express' | 'cargo' | 'sea') => (q[m].kind === 'price' ? q[m].totalCents : q[m].kind);
const pro = (weightKg: number, volumeM3: number, mode: 'air' | 'sea' = 'air') => {
  const s = suggestFromGrid({ mode, originCountry: 'BE', destinationCountry: 'CD', originCity: 'Bruxelles',
    destinationCity: 'Kinshasa', weightKg, volumeM3, underCustoms: false }, CONFIG);
  if (s.kind !== 'options') throw new Error('no options');
  return Object.fromEntries(s.options.map((o) => [o.mode, o.kind === 'price' ? o.totalCents : o.kind]));
};

describe('same grid on every surface', () => {
  it('reference case: express €193 / cargo €181 on calculator (dims), calculator (volume), /tarifs and pro', () => {
    for (const q of [calc({ weight: '6', length: '60', width: '40', height: '40' }), calc({ weight: '6', volume: '0,096' }),
      tarifs({ weight: '6', volume: '0.096' })]) {
      expect(cents(q, 'express')).toBe(19300);
      expect(cents(q, 'cargo')).toBe(18100);
    }
    expect(pro(6, 0.096)).toEqual({ express: 19300, cargo: 18100 });
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
    expect(lines.join('\n')).toMatch(/193,00/);
    expect(gridEstimateLines(calc({ weight: '6', destination: 'other' }), t, 'fr')).toEqual([]);
  });
});
