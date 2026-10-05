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
import { volumeM3FromCm } from './volume';

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
  volumetricSurchargeRateCentsPerKg: number; // cents/kg, e.g. €5.50/kg = 550 (live value: pricing_config)
  /** Flat €/kg surcharge added to EVERY sea shipment of THIS corridor (per-m³
   *  tiers AND carton flats), billed on the actual weight to the gram. Absent or
   *  0 on Kinshasa; the Lubumbashi corridor sets it to 300 (€3/kg). */
  seaWeightSurchargeCentsPerKg?: number | null;
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
  /** Extra priced destinations keyed by city slug (e.g. "lubumbashi"). Each entry
   *  is a COMPLETE grid for Brussels → <slug> (same shape as the root, minus the
   *  corridor identity). The root stays the Kinshasa grid, untouched; a shipment
   *  is priced with the entry whose slug matches its destination, or on quote
   *  when no entry (or no grid) covers it. */
  corridors?: Record<string, CorridorGrid> | null;
}

/** A full pricing grid for one extra destination — every field a root config has
 *  except the corridor identity (the key is the destination slug; the origin is
 *  inherited from the root). Includes the optional sea weight surcharge. */
export type CorridorGrid = Omit<PricingConfig, 'corridor' | 'corridors'>;

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
  /** Opt-in: when no L×l×h is given, derive the air volumetric weight from
   *  `volumeM3` (same physics: cm³ / divisor). Off by default so the public
   *  calculator's volume field stays a sea-only shortcut; the pro quote form,
   *  which only knows total weight + total volume, turns it on. */
  volumetricFromVolume?: boolean;
  /** `weightKg` is the shipment's TOTAL weight, not one parcel's (/tarifs and
   *  the pro form ask for a total; the calculator asks per parcel). */
  weightIsTotal?: boolean;
}

export interface BreakdownLine {
  key: 'weight' | 'volumetric_diff' | 'volume' | 'carton_flat' | 'sea_weight_surcharge' | 'handling';
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
  volumetricFromVolume: boolean;
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
  return volumeM3FromCm(i.lengthCm, i.widthCm, i.heightCm);
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
  const weightKg = isPos(input.weightKg) ? input.weightKg : null;
  const perParcelWeightKg = weightKg == null ? null : (input.weightIsTotal ? weightKg / parcels : weightKg);
  const perParcelVolumeM3 = isPos(input.volumeM3) ? input.volumeM3 : volumeFromDims(input);
  const dims = isPos(input.lengthCm) && isPos(input.widthCm) && isPos(input.heightCm)
    ? { lengthCm: input.lengthCm, widthCm: input.widthCm, heightCm: input.heightCm }
    : null;
  return {
    parcels,
    origin: norm(input.origin) || norm(config.corridor.origin),
    destination: norm(input.destination) || norm(config.corridor.destination),
    perParcelWeightKg,
    totalWeightKg: weightKg == null ? null : (input.weightIsTotal ? weightKg : weightKg * parcels),
    perParcelVolumeM3,
    totalVolumeM3: perParcelVolumeM3 == null ? null : perParcelVolumeM3 * parcels,
    dims,
    volumetricFromVolume: input.volumetricFromVolume === true,
  };
}

/** Off-corridor? Returns the quote reason, or null when it's the served corridor. */
function corridorReason(n: NormalizedInput, config: PricingConfig): QuoteReason | null {
  if (n.origin !== norm(config.corridor.origin)) return 'origin';
  if (n.destination !== norm(config.corridor.destination)) return 'destination';
  return null;
}

/**
 * The grid to price a given destination with: the root config for the root
 * corridor (Kinshasa — byte-for-byte the same object, so its pricing is
 * untouched), the matching `corridors[slug]` entry (as a full config whose
 * corridor is Brussels → slug) for an extra destination, or null when no entry
 * covers the destination (the caller then returns a quote request). An empty
 * destination resolves to the root corridor, exactly as `normalizeInput` defaults it.
 */
export function resolveCorridorConfig(config: PricingConfig, destination?: string | null): PricingConfig | null {
  const slug = norm(destination) || norm(config.corridor.destination);
  if (slug === norm(config.corridor.destination)) return config;
  const grid = config.corridors?.[slug];
  if (!grid) return null;
  return {
    ...grid,
    corridor: { origin: config.corridor.origin, destination: slug },
    corridors: undefined,
    effectiveFrom: grid.effectiveFrom ?? config.effectiveFrom ?? null,
  };
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

  let pv = volumetricWeightKg({ lengthCm: n.dims?.lengthCm, widthCm: n.dims?.widthCm, heightCm: n.dims?.heightCm }, config.volumetricDivisor);
  if (pv == null && n.volumetricFromVolume && isPos(n.perParcelVolumeM3)) {
    pv = (n.perParcelVolumeM3 * 1_000_000) / config.volumetricDivisor;
  }
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

  // Some corridors add a flat €/kg sea surcharge (Lubumbashi: +€3/kg on every
  // tier and carton). It is billed on the actual weight, so without a weight the
  // mode waits for input rather than under-charging. Absent/0 on Kinshasa → the
  // guard and the line below never fire and the price is identical.
  const surchargeRate = config.seaWeightSurchargeCentsPerKg ?? 0;
  if (surchargeRate > 0 && !isPos(n.totalWeightKg)) return { mode: 'sea', kind: 'empty' };

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
  if (surchargeRate > 0 && isPos(n.totalWeightKg)) {
    lines.push({ key: 'sea_weight_surcharge', cents: n.totalWeightKg * surchargeRate, qtyKg: n.totalWeightKg, rateCentsPerKg: surchargeRate });
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
  // Pick the grid for the chosen destination. The root corridor (Kinshasa) is
  // returned unchanged; an extra corridor (Lubumbashi) is priced with its own
  // grid; an unknown destination has no grid → every mode is a quote request,
  // with the origin checked first so a wrong origin still reads 'origin'.
  const eff = resolveCorridorConfig(config, n.destination);
  if (!eff) {
    const reason: QuoteReason = n.origin !== norm(config.corridor.origin) ? 'origin' : 'destination';
    const q = (mode: Mode): QuoteResult => ({ mode, kind: 'quote', reason });
    return { express: q('express'), cargo: q('cargo'), sea: q('sea'), input: n };
  }
  return {
    express: priceAir('express', n, eff),
    cargo: priceAir('cargo', n, eff),
    sea: priceSea(n, eff),
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
