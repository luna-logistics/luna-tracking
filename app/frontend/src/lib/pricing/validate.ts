import type { Mode, PricingConfig } from './engine';

/** A validation failure as a code + params, translated by the admin UI. */
export interface ConfigError {
  code: string;
  /** Path of the offending value in the document — the same vocabulary as the
   *  diff and the change history (e.g. "modes.express.perKgCents"). */
  field?: string;
  params?: Record<string, string | number>;
}

const MODES: readonly Mode[] = ['express', 'cargo', 'sea'];
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isOptText = (v: unknown) => v == null || typeof v === 'string';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Guard a pricing document before it goes live — and before the site prices
 * with one read from the database (lib/pricing/fallback.ts): anything this
 * rejects is replaced by the fallback grid, so a bad value can never reach the
 * engine as NaN or Infinity. Never throws, whatever the input. Returns [] when
 * the document is safe.
 *
 *   • rates and fees: a number (an empty field or text is refused), never negative;
 *   • divisor and quote thresholds: a number above 0;
 *   • sea tiers: at least one, bounds increasing (no overlap), the last one equal
 *     to the sea maximum (no gap before the quote threshold);
 *   • the rest (corridor, ratio modes, presets, optional texts): the shape the
 *     engine and the calculator read.
 * A rate at 0 is valid here; the admin confirms it explicitly (zeroRateFields).
 */
export function validatePricingConfig(config: unknown): ConfigError[] {
  const errs: ConfigError[] = [];
  const push = (code: string, field: string, params?: ConfigError['params']) => { errs.push(params ? { code, field, params } : { code, field }); };
  if (!isObj(config)) {
    push('structure', '');
    return errs;
  }
  const c = config;

  const money = (v: unknown, field: string) => {
    if (!isNum(v)) push('required', field);
    else if (v < 0) push('negative', field);
  };
  const positive = (v: unknown, field: string, code: string, params?: ConfigError['params']) => {
    if (!isNum(v)) push('required', field);
    else if (v <= 0) push(code, field, params);
  };
  const optNonNegative = (v: unknown, field: string) => {
    if (v != null && !(isNum(v) && v >= 0)) push('structure', field);
  };

  /**
   * The rate/fee/tier/preset part of a grid — shared by the root config and every
   * extra corridor. `pfx` prefixes the reported paths ('' for the root,
   * 'corridors.lubumbashi.' for a corridor). The corridor identity and the
   * informational fields are checked only at the root, by the caller below.
   */
  const gridErrors = (g: Record<string, unknown>, pfx: string) => {
    money(g.handlingFeeCents, `${pfx}handlingFeeCents`);
    if (g.customsAdminFeeCents != null) money(g.customsAdminFeeCents, `${pfx}customsAdminFeeCents`);
    positive(g.volumetricDivisor, `${pfx}volumetricDivisor`, 'divisor_positive');
    money(g.volumetricSurchargeRateCentsPerKg, `${pfx}volumetricSurchargeRateCentsPerKg`);
    if (g.seaWeightSurchargeCentsPerKg != null) money(g.seaWeightSurchargeCentsPerKg, `${pfx}seaWeightSurchargeCentsPerKg`);

    const ratio = g.ratioQuote;
    if (ratio != null) {
      if (!isObj(ratio)) push('structure', `${pfx}ratioQuote`);
      else {
        positive(ratio.thresholdKgPerM3, `${pfx}ratioQuote.thresholdKgPerM3`, 'ratio_positive');
        if (!Array.isArray(ratio.appliesTo) || ratio.appliesTo.some((m) => !MODES.includes(m as Mode))) {
          push('structure', `${pfx}ratioQuote.appliesTo`);
        }
      }
    }

    const modes = isObj(g.modes) ? g.modes : null;
    if (!modes) push('structure', `${pfx}modes`);
    else {
      for (const mode of ['express', 'cargo'] as const) {
        const m = modes[mode];
        if (!isObj(m)) {
          push('structure', `${pfx}modes.${mode}`);
          continue;
        }
        money(m.perKgCents, `${pfx}modes.${mode}.perKgCents`);
        if (mode === 'express') money(m.flatMinCents, `${pfx}modes.express.flatMinCents`);
        positive(m.maxKg, `${pfx}modes.${mode}.maxKg`, 'max_positive', { mode });
        optNonNegative(m.minKg, `${pfx}modes.${mode}.minKg`);
      }

      // Sea tiers: non-empty, positive, strictly increasing (no overlap), and the last
      // boundary must equal maxM3 so coverage is contiguous up to the quote threshold.
      const sea = modes.sea;
      if (!isObj(sea)) push('structure', `${pfx}modes.sea`);
      else {
        const tiers = sea.tiers;
        let prev = 0;
        if (!Array.isArray(tiers) || tiers.length === 0) push('sea_no_tiers', `${pfx}modes.sea.tiers`);
        else {
          tiers.forEach((tt, i) => {
            const base = `${pfx}modes.sea.tiers.${i}`;
            if (!isObj(tt)) {
              push('structure', base);
              return;
            }
            if (!isNum(tt.uptoM3)) push('required', `${base}.uptoM3`);
            else if (tt.uptoM3 <= 0) push('sea_tier_positive', `${base}.uptoM3`, { index: i + 1 });
            else if (tt.uptoM3 <= prev) push('sea_tiers_order', `${base}.uptoM3`, { index: i + 1 });
            if (isNum(tt.uptoM3)) prev = tt.uptoM3;
            money(tt.perM3Cents, `${base}.perM3Cents`);
          });
        }
        if (!isNum(sea.maxM3)) push('required', `${pfx}modes.sea.maxM3`);
        else if (sea.maxM3 <= 0) push('sea_max_positive', `${pfx}modes.sea.maxM3`);
        else if (prev > 0 && prev !== sea.maxM3) push('sea_boundary', `${pfx}modes.sea.maxM3`, { last: prev, max: sea.maxM3 });
      }
    }

    const presets = g.presets;
    if (presets != null) {
      if (!Array.isArray(presets)) push('structure', `${pfx}presets`);
      else {
        const keys = new Set<string>();
        for (const p of presets) {
          if (!isObj(p) || typeof p.key !== 'string' || !p.key || keys.has(p.key)) {
            push('structure', `${pfx}presets`);
            continue;
          }
          keys.add(p.key);
          const base = `${pfx}presets.${p.key}`;
          for (const k of ['lengthCm', 'widthCm', 'heightCm', 'weightKg', 'volumeM3', 'sheetPriceCents']) optNonNegative(p[k], `${base}.${k}`);
          if (p.seaFlatTransportCents != null) money(p.seaFlatTransportCents, `${base}.seaFlatTransportCents`);
        }
      }
    }
  };

  const corridor = c.corridor;
  if (!isObj(corridor) || typeof corridor.origin !== 'string' || !corridor.origin.trim()
    || typeof corridor.destination !== 'string' || !corridor.destination.trim()) {
    push('structure', 'corridor');
  }

  gridErrors(c, '');

  // Informational fields: rendered as text by the calculator. Root-level only.
  for (const field of ['transitTimes', 'includes'] as const) {
    const v = c[field];
    if (v != null && (!isObj(v) || Object.values(v).some((x) => !isOptText(x)))) push('structure', field);
  }
  if (!isOptText(c.vatStatus)) push('structure', 'vatStatus');
  if (c.effectiveFrom != null && !(typeof c.effectiveFrom === 'string' && ISO_DATE.test(c.effectiveFrom))) {
    push('structure', 'effectiveFrom');
  }

  // Extra corridors (optional): each a full grid keyed by destination slug.
  const corridors = c.corridors;
  if (corridors != null) {
    if (!isObj(corridors)) push('structure', 'corridors');
    else {
      for (const [slug, entry] of Object.entries(corridors)) {
        if (!isObj(entry)) push('structure', `corridors.${slug}`);
        else gridErrors(entry, `corridors.${slug}.`);
      }
    }
  }

  return errs;
}

/**
 * Money fields set to 0 in a (valid) grid. Allowed — but a free line is rarely
 * what the admin meant, so publishing one asks for an explicit confirmation.
 */
export function zeroRateFields(c: PricingConfig): string[] {
  const out: string[] = [];
  const zero = (v: unknown, path: string) => { if (v === 0) out.push(path); };
  const gridZeros = (g: Omit<PricingConfig, 'corridor' | 'corridors'>, pfx: string) => {
    zero(g.modes.express.perKgCents, `${pfx}modes.express.perKgCents`);
    zero(g.modes.express.flatMinCents, `${pfx}modes.express.flatMinCents`);
    zero(g.modes.cargo.perKgCents, `${pfx}modes.cargo.perKgCents`);
    zero(g.volumetricSurchargeRateCentsPerKg, `${pfx}volumetricSurchargeRateCentsPerKg`);
    g.modes.sea.tiers.forEach((t, i) => zero(t.perM3Cents, `${pfx}modes.sea.tiers.${i}.perM3Cents`));
    zero(g.handlingFeeCents, `${pfx}handlingFeeCents`);
    zero(g.customsAdminFeeCents, `${pfx}customsAdminFeeCents`);
    for (const p of g.presets ?? []) zero(p.seaFlatTransportCents, `${pfx}presets.${p.key}.seaFlatTransportCents`);
  };
  gridZeros(c, '');
  for (const [slug, entry] of Object.entries(c.corridors ?? {})) gridZeros(entry, `corridors.${slug}.`);
  return out;
}
