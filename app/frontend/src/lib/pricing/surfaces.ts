/**
 * The ONE place where each public/pro surface turns its form fields into an
 * engine input — so /calculateur, the /tarifs quote form and the pro
 * "Suggérer un tarif" can never drift apart again (cross-surface.test.ts).
 *
 * All three price with computeQuote() on the active pricing_config row. The
 * builders only differ in which fields a surface has:
 *   • calculator: weight + optional L×l×H + optional volume + parcels, and a
 *     Kinshasa / other destination choice;
 *   • /tarifs: origin city value + destination city slug + totals;
 *   • pro quote: countries + free-text cities + totals (pro-suggest.ts).
 * Volumetric weight is derived from a typed volume when no dimensions are
 * given, on every surface (it is the same L×l×H / divisor physics).
 */
import { computeQuote, formatEuros, type Mode, type PricingConfig, type QuoteResponse, type ShipmentInput } from './engine';

/** City spellings that mean the corridor's origin / destination. */
export const BRUSSELS_RE = /^(bruxelles|brussels|brussel|bxl)$/i;
export const KINSHASA_RE = /^kinshasa$/i;

const toNum = (v: string | number | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export type CalculatorFields = {
  weight: string; length: string; width: string; height: string;
  parcels: string; volume: string; destination: 'kinshasa' | 'other';
};

/** /calculateur form → engine input. Origin is always the corridor origin. */
export function calculatorEngineInput(f: CalculatorFields): ShipmentInput {
  return {
    weightKg: toNum(f.weight),
    lengthCm: toNum(f.length), widthCm: toNum(f.width), heightCm: toNum(f.height),
    parcels: toNum(f.parcels) || 1,
    volumeM3: toNum(f.volume),
    destination: f.destination === 'kinshasa' ? 'kinshasa' : 'autre',
    volumetricFromVolume: true,
  };
}

/** /tarifs quote form → engine input (city values → corridor tokens). */
export function tarifsEngineInput(
  f: { originValue: string; destinationSlug: string; weight: string | number | null; volume: string | number | null },
  config: PricingConfig,
): ShipmentInput {
  return {
    weightKg: toNum(f.weight),
    volumeM3: toNum(f.volume),
    parcels: 1,
    origin: BRUSSELS_RE.test(f.originValue.trim()) ? config.corridor.origin : (f.originValue.trim().toLowerCase() || 'autre'),
    destination: KINSHASA_RE.test(f.destinationSlug.trim()) ? config.corridor.destination : (f.destinationSlug.trim().toLowerCase() || 'autre'),
    volumetricFromVolume: true,
  };
}

export function quoteFor(input: ShipmentInput, config: PricingConfig): QuoteResponse {
  return computeQuote(input, config);
}

const MODES: Mode[] = ['express', 'cargo', 'sea'];

/** Human lines summarising the grid's answer, for the quote-request message
 *  the office receives ("Estimation selon la grille publique"). Returns [] when
 *  no mode could be priced (nothing useful to add beyond the reason). */
export function gridEstimateLines(
  q: QuoteResponse,
  t: (k: string, o?: Record<string, unknown>) => string,
  lang: 'fr' | 'en',
): string[] {
  if (!MODES.some((m) => q[m].kind === 'price')) return [];
  const lines = [t('grid_estimate.title')];
  for (const m of MODES) {
    const r = q[m];
    if (r.kind === 'price') lines.push(`— ${t(`calc.mode_${m}`)} : ${formatEuros(r.totalCents, lang)}`);
    else if (r.kind === 'quote') lines.push(`— ${t(`calc.mode_${m}`)} : ${t('grid_estimate.sur_devis')} (${t(`calc.quote_reason_${r.reason}`)})`);
  }
  return lines;
}
