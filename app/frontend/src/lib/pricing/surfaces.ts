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
import { parseDecimal, volumeM3FromCm } from './volume';

/** City spellings that mean the corridor's origin / destination. */
export const BRUSSELS_RE = /^(bruxelles|brussels|brussel|bxl)$/i;
export const KINSHASA_RE = /^kinshasa$/i;

const toNum = parseDecimal;

type Num = string | number | null | undefined;

/**
 * Size fields → engine input, the same rule on every surface: the dimensions
 * (per parcel, × parcels) price the shipment while the volume field follows
 * them; a TYPED volume is an explicit override and replaces the dimensions
 * (volumetric weight then comes from that volume — same L×l×H / divisor physics).
 * `volume` is the typed override only ('' / null while the field auto-fills).
 */
export function sizeInput(f: {
  weight: Num; weightIsTotal: boolean; volume: Num;
  length?: Num; width?: Num; height?: Num; parcels?: Num;
}): Pick<ShipmentInput, 'weightKg' | 'weightIsTotal' | 'lengthCm' | 'widthCm' | 'heightCm' | 'parcels' | 'volumeM3' | 'volumetricFromVolume'> {
  const typed = toNum(f.volume);
  const l = toNum(f.length), w = toNum(f.width), h = toNum(f.height);
  const useDims = volumeM3FromCm(l, w, h) != null && typed == null;
  const parcels = toNum(f.parcels) || 1;
  return {
    weightKg: toNum(f.weight),
    weightIsTotal: f.weightIsTotal,
    lengthCm: useDims ? l : null, widthCm: useDims ? w : null, heightCm: useDims ? h : null,
    // A typed volume on a totals form is the TOTAL volume → one "parcel".
    parcels: useDims || !f.weightIsTotal ? parcels : 1,
    volumeM3: typed,
    volumetricFromVolume: true,
  };
}

export type CalculatorFields = {
  weight: string; length: string; width: string; height: string;
  parcels: string; volume: string; destination: 'kinshasa' | 'other';
};

/** /calculateur form → engine input. Origin is always the corridor origin.
 *  Weight and volume are per parcel here (× "colis identiques"). */
export function calculatorEngineInput(f: CalculatorFields): ShipmentInput {
  return {
    ...sizeInput({ weight: f.weight, weightIsTotal: false, volume: f.volume,
      length: f.length, width: f.width, height: f.height, parcels: f.parcels }),
    destination: f.destination === 'kinshasa' ? 'kinshasa' : 'autre',
  };
}

/** /tarifs quote form → engine input (city values → corridor tokens). The
 *  weight is the shipment total; dimensions are per parcel × parcels. */
export function tarifsEngineInput(
  f: {
    originValue: string; destinationSlug: string; weight: Num; volume: Num;
    length?: Num; width?: Num; height?: Num; parcels?: Num;
  },
  config: PricingConfig,
): ShipmentInput {
  return {
    ...sizeInput({ weight: f.weight, weightIsTotal: true, volume: f.volume,
      length: f.length, width: f.width, height: f.height, parcels: f.parcels }),
    origin: BRUSSELS_RE.test(f.originValue.trim()) ? config.corridor.origin : (f.originValue.trim().toLowerCase() || 'autre'),
    destination: KINSHASA_RE.test(f.destinationSlug.trim()) ? config.corridor.destination : (f.destinationSlug.trim().toLowerCase() || 'autre'),
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
