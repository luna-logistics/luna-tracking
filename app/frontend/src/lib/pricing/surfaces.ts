/**
 * The ONE place where each public/pro surface turns its form fields into an
 * engine input — so /calculateur, the /tarifs quote form and the pro
 * "Suggérer un tarif" can never drift apart again (cross-surface.test.ts).
 *
 * All three price with computeQuote() on the active pricing_config row. The
 * builders only differ in which fields a surface has:
 *   • calculator: package lines (L×l×H + weight each) + optional typed total
 *     volume, and a Kinshasa / other destination choice;
 *   • /tarifs: origin city value + destination city slug + package lines;
 *   • pro quote: countries + free-text cities + totals, pre-filled from the
 *     same package lines (pro-suggest.ts).
 * Package lines → size fields: packageLinesSize(), one rule for all three.
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
  lines: PackageLine[];
  /** Typed TOTAL volume override ('' while the field follows the lines). */
  volume: string;
  destination: 'kinshasa' | 'other';
};

/** /calculateur form → engine input. Origin is always the corridor origin.
 *  Weight and volume are shipment totals over the package lines (same rule as
 *  /tarifs); a typed volume replaces the lines' dimensions. */
export function calculatorEngineInput(f: CalculatorFields): ShipmentInput {
  const s = packageLinesSize(f.lines).fields;
  return {
    ...sizeInput({ ...s, weightIsTotal: true, volume: toNum(f.volume) ?? s.volume }),
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

/** One package line (raw field strings) — /calculateur, /tarifs and the pro
 *  Devis form all edit these with components/PackageLinesEditor. */
export type PackageLine = { length: string; width: string; height: string; weight: string };
export const emptyPackageLine = (): PackageLine => ({ length: '', width: '', height: '', weight: '' });

export type PackageLinesSize = {
  /** Lines with at least one field filled in. */
  used: number;
  /** Total weight (kg) — null unless EVERY used line has a weight. */
  totalWeightKg: number | null;
  /** Total volume (m³) — null unless EVERY used line has full dimensions. */
  totalVolumeM3: number | null;
  /** Some used line has a weight but incomplete dimensions (or the reverse). */
  missingDims: boolean;
  missingWeight: boolean;
  /** Size fields for the engine builders (tarifsEngineInput, calculatorEngineInput, pro dimsCm). */
  fields: { weight: Num; volume: Num; length?: Num; width?: Num; height?: Num; parcels?: Num };
};

/**
 * Package lines → the size fields every surface prices with.
 *   • all used lines share the same L×l×H → "N identical parcels" (dimension
 *     path: keeps the sea flat price of a standard carton, same result as the
 *     old "colis identiques" field);
 *   • different sizes → total volume (Σ L×l×H), volumetric weight derived from
 *     it — the same cm³ ÷ divisor physics as per-parcel dimensions;
 *   • a line missing its weight or its dimensions is never guessed: no weight
 *     → no air price; no complete dimensions → no volume (air on actual
 *     weight only, sea on quote) and the form asks for them.
 */
export function packageLinesSize(lines: PackageLine[]): PackageLinesSize {
  const used = lines.filter((l) => [l.length, l.width, l.height, l.weight].some((v) => v.trim() !== ''));
  const dims = used.map((l) => {
    const L = toNum(l.length), W = toNum(l.width), H = toNum(l.height);
    return { L, W, H, v: volumeM3FromCm(L, W, H) };
  });
  const weights = used.map((l) => toNum(l.weight));
  const missingWeight = weights.some((w) => w == null || w <= 0);
  const missingDims = dims.some((d) => d.v == null);
  const totalWeightKg = used.length && !missingWeight ? weights.reduce<number>((s, w) => s + (w as number), 0) : null;
  const totalVolumeM3 = used.length && !missingDims ? dims.reduce((s, d) => s + (d.v as number), 0) : null;

  let fields: PackageLinesSize['fields'] = { weight: totalWeightKg, volume: null };
  if (totalVolumeM3 != null) {
    const first = dims[0];
    const identical = dims.every((d) => d.L === first.L && d.W === first.W && d.H === first.H);
    fields = identical
      ? { weight: totalWeightKg, volume: null, length: first.L, width: first.W, height: first.H, parcels: used.length }
      : { weight: totalWeightKg, volume: totalVolumeM3 };
  }
  return { used: used.length, totalWeightKg, totalVolumeM3, missingDims, missingWeight, fields };
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
