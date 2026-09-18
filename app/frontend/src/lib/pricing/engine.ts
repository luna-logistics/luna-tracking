/**
 * Shipping price engine — Brussels → Kinshasa corridor.
 *
 * PURE logic, no React, no I/O: it takes a shipment + a pricing configuration
 * (the active `pricing_config.config` document) and returns, for each mode
 * (express / cargo / sea), either a priced result with a line-by-line breakdown
 * or a quote-request result. It is unit-tested in isolation and reusable by any
 * surface (the /calculateur page today, an API or the counter tool tomorrow).
 *
 * MONEY DISCIPLINE (see the brief):
 *   • All money is in INTEGER CENTS. Rates in the config are cents (e.g. €18/kg
 *     = 1800). Weights are used to the gram — never rounded up.
 *   • Intermediate line values are exact cents; the TOTAL is rounded ONCE, at the
 *     end, with Math.round. No floating-point euros anywhere.
 *   • A wrong price is worse than no price: whenever the confirmed rules don't
 *     cover a case, the mode returns a quote request, never an approximation.
 *
 * Nothing here invents a business value. Every number comes from the config
 * document, which is seeded from the owner's confirmed tariff.
 */

export type Mode = 'express' | 'cargo' | 'sea';

export interface SeaTier {
  /** Upper bound of this tier in m³ (inclusive-ish; first matching tier wins). */
  uptoM3: number;
  perM3Cents: number;
}

export interface PricingConfig {
  corridor: { origin: string; destination: string };
  handlingFeeCents: number;
  /** Sous-douane administrative fee. Informational only — never auto-applied. */
  customsAdminFeeCents: number | null;
  volumetricDivisor: number;                 // 6000
  volumetricSurchargeRateCentsPerKg: number; // €8/kg = 800
  /** Density surcharge is undefined → forces a quote. `appliesTo` scopes it. */
  ratioQuote: { thresholdKgPerM3: number; appliesTo: Mode[] } | null;
  modes: {
    express: { perKgCents: number; flatMinCents: number; minKg: number | null; maxKg: number };
    cargo: { perKgCents: number; minKg: number | null; maxKg: number };
    sea: { tiers: SeaTier[]; maxM3: number };
  };
  presets?: PricingPreset[];
  transitTimes?: Partial<Record<Mode, string | null>> | null;
  vatStatus?: string | null;
  includes?: Record<string, string | null> | null;
  effectiveFrom?: string | null;
}

export interface PricingPreset {
  key: string;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  volumeM3?: number | null;
  /** The full flat price printed on the tariff sheet, kept for reference. */
  sheetPriceCents?: number | null;
  /** Sea transport price for a parcel of EXACTLY these dimensions, BEFORE the
   *  handling fee. When set, a sea shipment whose per-parcel dimensions match this
   *  preset is billed `seaFlatTransportCents × parcels + handling` instead of the
   *  per-m³ rule — so a single carton totals exactly the printed price. */
  seaFlatTransportCents?: number | null;
}

export interface ShipmentInput {
  weightKg?: number | null;   // actual weight of ONE parcel
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  volumeM3?: number | null;   // direct volume of ONE parcel (sea shortcut)
  parcels?: number | null;    // count of identical parcels (default 1)
  origin?: string | null;     // default: corridor.origin
  destination?: string | null; // default: corridor.destination
}

export interface BreakdownLine {
  key: 'weight' | 'volumetric_diff' | 'volume' | 'carton_flat' | 'handling';
  cents: number;              // exact cents for this line (round only for display)
  qtyKg?: number;
  qtyM3?: number;
  rateCentsPerKg?: number;
  rateCentsPerM3?: number;
}

export type QuoteReason =
  | 'destination'        // not the confirmed corridor
  | 'origin'
  | 'over_max_weight'    // express > 200 kg / cargo > 500 kg
  | 'over_max_volume'    // sea > 10 m³
  | 'ratio';             // density > 374 kg/m³ (undefined surcharge)

export interface PricedResult {
  mode: Mode;
  kind: 'price';
  totalCents: number;
  actualWeightKg: number;               // total across all parcels
  volumetricWeightKg: number | null;    // air modes only
  volumeM3: number | null;              // sea only
  chargeableBasis: 'actual' | 'volumetric' | 'volume';
  lines: BreakdownLine[];
  parcels: number;
}

export interface QuoteResult {
  mode: Mode;
  kind: 'quote';
  reason: QuoteReason;
}

export interface EmptyResult {
  mode: Mode;
  kind: 'empty'; // not enough input to price this mode yet
}

export type ModeResult = PricedResult | QuoteResult | EmptyResult;

export interface NormalizedInput {
  parcels: number;
  origin: string;
  destination: string;
  perParcelWeightKg: number | null;
  totalWeightKg: number | null;
  perParcelVolumeM3: number | null;
  totalVolumeM3: number | null;
  dims: { lengthCm: number; widthCm: number; heightCm: number } | null;
}

export interface QuoteResponse {
  express: ModeResult;
  cargo: ModeResult;
  sea: ModeResult;
  input: NormalizedInput;
}

const isPos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** Geometric volume of one parcel in m³ from cm dimensions, or null. */
function volumeFromDims(i: ShipmentInput): number | null {
  if (isPos(i.lengthCm) && isPos(i.widthCm) && isPos(i.heightCm)) {
    return (i.lengthCm * i.widthCm * i.heightCm) / 1_000_000;
  }
  return null;
}

/** Volumetric weight (kg) of one parcel: L×l×h(cm) / divisor. */
function volumetricWeightKg(i: ShipmentInput, divisor: number): number | null {
  if (isPos(i.lengthCm) && isPos(i.widthCm) && isPos(i.heightCm)) {
    return (i.lengthCm * i.widthCm * i.heightCm) / divisor;
  }
  return null;
}

export function normalizeInput(input: ShipmentInput, config: PricingConfig): NormalizedInput {
  const parcels = isPos(input.parcels) ? Math.floor(input.parcels) : 1;
  const perParcelWeightKg = isPos(input.weightKg) ? input.weightKg : null;
  const perParcelVolumeM3 = isPos(input.volumeM3) ? input.volumeM3 : volumeFromDims(input);
  const dims = isPos(input.lengthCm) && isPos(input.widthCm) && isPos(input.heightCm)
    ? { lengthCm: input.lengthCm, widthCm: input.widthCm, heightCm: input.heightCm }
    : null;
  return {
    parcels,
    origin: norm(input.origin) || norm(config.corridor.origin),
    destination: norm(input.destination) || norm(config.corridor.destination),
    perParcelWeightKg,
    totalWeightKg: perParcelWeightKg == null ? null : perParcelWeightKg * parcels,
    perParcelVolumeM3,
    totalVolumeM3: perParcelVolumeM3 == null ? null : perParcelVolumeM3 * parcels,
    dims,
  };
}

/** Off-corridor? Returns the quote reason, or null when it's the served corridor. */
function corridorReason(n: NormalizedInput, config: PricingConfig): QuoteReason | null {
  if (n.origin !== norm(config.corridor.origin)) return 'origin';
  if (n.destination !== norm(config.corridor.destination)) return 'destination';
  return null;
}

/** Density surcharge → quote, when scoped to this mode and computable. */
function ratioForcesQuote(mode: Mode, n: NormalizedInput, config: PricingConfig): boolean {
  const r = config.ratioQuote;
  if (!r || !r.appliesTo.includes(mode)) return false;
  if (!isPos(n.totalWeightKg) || !isPos(n.totalVolumeM3)) return false;
  return n.totalWeightKg / n.totalVolumeM3 > r.thresholdKgPerM3;
}

/** Round a summed set of exact-cent lines to a single integer-cent total. */
function totalOf(lines: BreakdownLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.cents, 0));
}

/** A carton's dimensions as an orientation-independent key (sorted). */
const dimKey = (l: number, w: number, h: number) => [l, w, h].slice().sort((a, b) => a - b).join('x');

/** Flat sea transport price (per parcel, before handling) when the per-parcel
 *  dimensions EXACTLY match a carton preset; null otherwise (→ per-m³ rule). */
function cartonFlatCents(n: NormalizedInput, config: PricingConfig): number | null {
  if (!n.dims) return null;
  const key = dimKey(n.dims.lengthCm, n.dims.widthCm, n.dims.heightCm);
  for (const p of config.presets ?? []) {
    if (p.seaFlatTransportCents == null) continue;
    if (p.lengthCm == null || p.widthCm == null || p.heightCm == null) continue;
    if (dimKey(p.lengthCm, p.widthCm, p.heightCm) === key) return p.seaFlatTransportCents;
  }
  return null;
}

function priceAir(mode: 'express' | 'cargo', n: NormalizedInput, config: PricingConfig): ModeResult {
  const corridor = corridorReason(n, config);
  if (corridor) return { mode, kind: 'quote', reason: corridor };
  if (!isPos(n.totalWeightKg)) return { mode, kind: 'empty' };

  const m = config.modes[mode];
  if (n.totalWeightKg > m.maxKg) return { mode, kind: 'quote', reason: 'over_max_weight' };
  if (ratioForcesQuote(mode, n, config)) return { mode, kind: 'quote', reason: 'ratio' };

  const rate = m.perKgCents;
  // Actual-weight line. Express carries a flat minimum (a floor, not a proportional
  // rate); cargo has none unless the config sets one.
  let weightCents = n.totalWeightKg * rate;
  if (mode === 'express') weightCents = Math.max(config.modes.express.flatMinCents, weightCents);

  const pv = volumetricWeightKg({ lengthCm: n.dims?.lengthCm, widthCm: n.dims?.widthCm, heightCm: n.dims?.heightCm }, config.volumetricDivisor);
  const totalPv = pv == null ? null : pv * n.parcels;

  const lines: BreakdownLine[] = [
    { key: 'weight', cents: weightCents, qtyKg: n.totalWeightKg, rateCentsPerKg: rate },
  ];
  let basis: PricedResult['chargeableBasis'] = 'actual';
  // Volumetric differential: only when the volumetric weight exceeds the actual.
  if (totalPv != null && totalPv > n.totalWeightKg) {
    const diffKg = totalPv - n.totalWeightKg;
    lines.push({
      key: 'volumetric_diff',
      cents: diffKg * config.volumetricSurchargeRateCentsPerKg,
      qtyKg: diffKg,
      rateCentsPerKg: config.volumetricSurchargeRateCentsPerKg,
    });
    basis = 'volumetric';
  }
  lines.push({ key: 'handling', cents: config.handlingFeeCents });

  return {
    mode,
    kind: 'price',
    totalCents: totalOf(lines),
    actualWeightKg: n.totalWeightKg,
    volumetricWeightKg: totalPv,
    volumeM3: null,
    chargeableBasis: basis,
    lines,
    parcels: n.parcels,
  };
}

function priceSea(n: NormalizedInput, config: PricingConfig): ModeResult {
  const corridor = corridorReason(n, config);
  if (corridor) return { mode: 'sea', kind: 'quote', reason: corridor };
  if (!isPos(n.totalVolumeM3)) return { mode: 'sea', kind: 'empty' };

  const sea = config.modes.sea;
  if (n.totalVolumeM3 > sea.maxM3) return { mode: 'sea', kind: 'quote', reason: 'over_max_volume' };
  if (ratioForcesQuote('sea', n, config)) return { mode: 'sea', kind: 'quote', reason: 'ratio' };

  // A carton of EXACTLY a preset's dimensions ships at its printed flat transport
  // price (handling added once), so the site never quotes above the paper sheet.
  // Any other dimensions fall through to the per-m³ rule.
  const flat = cartonFlatCents(n, config);
  const lines: BreakdownLine[] = [];
  if (flat != null) {
    lines.push({ key: 'carton_flat', cents: flat * n.parcels });
  } else {
    // Flat-rate-by-bracket: the whole volume is charged at the tier its total falls
    // in (not marginal). First tier whose upper bound covers the volume wins.
    const tier = sea.tiers.find((tt) => n.totalVolumeM3! <= tt.uptoM3) ?? sea.tiers[sea.tiers.length - 1];
    lines.push({ key: 'volume', cents: n.totalVolumeM3 * tier.perM3Cents, qtyM3: n.totalVolumeM3, rateCentsPerM3: tier.perM3Cents });
  }
  lines.push({ key: 'handling', cents: config.handlingFeeCents });
  return {
    mode: 'sea',
    kind: 'price',
    totalCents: totalOf(lines),
    actualWeightKg: n.totalWeightKg ?? 0,
    volumetricWeightKg: null,
    volumeM3: n.totalVolumeM3,
    chargeableBasis: 'volume',
    lines,
    parcels: n.parcels,
  };
}

/**
 * Price a shipment across all three modes. The single entry point for any caller.
 */
export function computeQuote(input: ShipmentInput, config: PricingConfig): QuoteResponse {
  const n = normalizeInput(input, config);
  return {
    express: priceAir('express', n, config),
    cargo: priceAir('cargo', n, config),
    sea: priceSea(n, config),
    input: n,
  };
}

/**
 * Transit time for a mode, or null when the owner hasn't provided one yet. The UI
 * renders a delay line only when this is non-null — never a placeholder or guess.
 */
export function transitTimeFor(config: PricingConfig, mode: Mode): string | null {
  const v = config.transitTimes?.[mode];
  return v != null && String(v).trim() !== '' ? String(v) : null;
}

/** Convenience for formatting: integer cents → a localized euro string. */
export function formatEuros(cents: number, lang: 'fr' | 'en' = 'fr'): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-IE' : 'fr-BE', {
    style: 'currency', currency: 'EUR',
  }).format(cents / 100);
}
