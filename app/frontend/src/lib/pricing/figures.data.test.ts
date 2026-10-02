import { describe, it, expect } from 'vitest';
import fr from '../../locales/fr.json';
import en from '../../locales/en.json';
import { FALLBACK_PRICING_CONFIG } from './fallback';
import { calcFigures, FALLBACK_CALC_GRID } from './figures.data.mjs';

/**
 * figures.data.mjs is the single source for the tariff numbers printed as text
 * on /calculateur and injected into its FAQPage JSON-LD (browser + prerender).
 * These tests stop the two ways it could silently rot: the build-only fallback
 * grid drifting from the real fallback, and a calc key using a {{placeholder}}
 * that calcFigures doesn't actually provide.
 */

describe('FALLBACK_CALC_GRID stays in sync with FALLBACK_PRICING_CONFIG', () => {
  const g = FALLBACK_PRICING_CONFIG;
  it('matches the tariff fields', () => {
    expect(FALLBACK_CALC_GRID.handlingFeeCents).toBe(g.handlingFeeCents);
    expect(FALLBACK_CALC_GRID.customsAdminFeeCents).toBe(g.customsAdminFeeCents);
    expect(FALLBACK_CALC_GRID.volumetricDivisor).toBe(g.volumetricDivisor);
    expect(FALLBACK_CALC_GRID.volumetricSurchargeRateCentsPerKg).toBe(g.volumetricSurchargeRateCentsPerKg);
    expect(FALLBACK_CALC_GRID.modes.express).toEqual(g.modes.express);
    expect(FALLBACK_CALC_GRID.modes.cargo).toEqual(g.modes.cargo);
    expect(FALLBACK_CALC_GRID.modes.sea.tiers).toEqual(g.modes.sea.tiers);
  });
});

// Every calc.* key whose copy interpolates a grid figure.
const GUARDED_KEYS = [
  'mode_express_rate', 'mode_cargo_rate', 'mode_sea_rate',
  'how_b2_body', 'how_b3_body', 'customs_note',
  'a_weight', 'a_volumetric', 'a_when_air', 'a_when_sea', 'a_multi', 'a_customs',
];

describe('calcFigures resolves every placeholder used in the calc copy', () => {
  for (const lang of ['fr', 'en'] as const) {
    const calc = (lang === 'fr' ? fr : en).calc as Record<string, string>;
    const figures = calcFigures(FALLBACK_CALC_GRID, lang) as Record<string, string>;
    for (const key of GUARDED_KEYS) {
      it(`${lang}.calc.${key} leaves no unresolved {{var}}`, () => {
        const raw = calc[key];
        expect(typeof raw).toBe('string');
        const resolved = raw.replace(/\{\{(\w+)\}\}/g, (m, k) => (figures[k] != null ? figures[k] : m));
        expect(resolved).not.toMatch(/\{\{/);
        expect(resolved).not.toContain('undefined');
      });
    }
  }
});
