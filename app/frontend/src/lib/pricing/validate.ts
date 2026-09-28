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

  const corridor = c.corridor;
  if (!isObj(corridor) || typeof corridor.origin !== 'string' || !corridor.origin.trim()
    || typeof corridor.destination !== 'string' || !corridor.destination.trim()) {
    push('structure', 'corridor');
  }

  money(c.handlingFeeCents, 'handlingFeeCents');
  if (c.customsAdminFeeCents != null) money(c.customsAdminFeeCents, 'customsAdminFeeCents');
  positive(c.volumetricDivisor, 'volumetricDivisor', 'divisor_positive');
  money(c.volumetricSurchargeRateCentsPerKg, 'volumetricSurchargeRateCentsPerKg');

  const ratio = c.ratioQuote;
  if (ratio != null) {
    if (!isObj(ratio)) push('structure', 'ratioQuote');
    else {
      positive(ratio.thresholdKgPerM3, 'ratioQuote.thresholdKgPerM3', 'ratio_positive');
      if (!Array.isArray(ratio.appliesTo) || ratio.appliesTo.some((m) => !MODES.includes(m as Mode))) {
        push('structure', 'ratioQuote.appliesTo');
      }
    }
  }

  const modes = isObj(c.modes) ? c.modes : null;
  if (!modes) push('structure', 'modes');
  else {
    for (const mode of ['express', 'cargo'] as const) {
      const m = modes[mode];
      if (!isObj(m)) {
        push('structure', `modes.${mode}`);
        continue;
      }
      money(m.perKgCents, `modes.${mode}.perKgCents`);
      if (mode === 'express') money(m.flatMinCents, 'modes.express.flatMinCents');
      positive(m.maxKg, `modes.${mode}.maxKg`, 'max_positive', { mode });
      optNonNegative(m.minKg, `modes.${mode}.minKg`);
    }

    // Sea tiers: non-empty, positive, strictly increasing (no overlap), and the last
    // boundary must equal maxM3 so coverage is contiguous up to the quote threshold.
    const sea = modes.sea;
    if (!isObj(sea)) push('structure', 'modes.sea');
    else {
      const tiers = sea.tiers;
      let prev = 0;
      if (!Array.isArray(tiers) || tiers.length === 0) push('sea_no_tiers', 'modes.sea.tiers');
      else {
        tiers.forEach((tt, i) => {
          const base = `modes.sea.tiers.${i}`;
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
      if (!isNum(sea.maxM3)) push('required', 'modes.sea.maxM3');
      else if (sea.maxM3 <= 0) push('sea_max_positive', 'modes.sea.maxM3');
      else if (prev > 0 && prev !== sea.maxM3) push('sea_boundary', 'modes.sea.maxM3', { last: prev, max: sea.maxM3 });
    }
  }

  const presets = c.presets;
  if (presets != null) {
    if (!Array.isArray(presets)) push('structure', 'presets');
    else {
      const keys = new Set<string>();
      for (const p of presets) {
        if (!isObj(p) || typeof p.key !== 'string' || !p.key || keys.has(p.key)) {
          push('structure', 'presets');
          continue;
        }
        keys.add(p.key);
        const base = `presets.${p.key}`;
        for (const k of ['lengthCm', 'widthCm', 'heightCm', 'weightKg', 'volumeM3', 'sheetPriceCents']) optNonNegative(p[k], `${base}.${k}`);
        if (p.seaFlatTransportCents != null) money(p.seaFlatTransportCents, `${base}.seaFlatTransportCents`);
      }
    }
  }

  // Informational fields: rendered as text by the calculator.
  for (const field of ['transitTimes', 'includes'] as const) {
    const v = c[field];
    if (v != null && (!isObj(v) || Object.values(v).some((x) => !isOptText(x)))) push('structure', field);
  }
  if (!isOptText(c.vatStatus)) push('structure', 'vatStatus');
  if (c.effectiveFrom != null && !(typeof c.effectiveFrom === 'string' && ISO_DATE.test(c.effectiveFrom))) {
    push('structure', 'effectiveFrom');
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
  zero(c.modes.express.perKgCents, 'modes.express.perKgCents');
  zero(c.modes.express.flatMinCents, 'modes.express.flatMinCents');
  zero(c.modes.cargo.perKgCents, 'modes.cargo.perKgCents');
  zero(c.volumetricSurchargeRateCentsPerKg, 'volumetricSurchargeRateCentsPerKg');
  c.modes.sea.tiers.forEach((t, i) => zero(t.perM3Cents, `modes.sea.tiers.${i}.perM3Cents`));
  zero(c.handlingFeeCents, 'handlingFeeCents');
  zero(c.customsAdminFeeCents, 'customsAdminFeeCents');
  for (const p of c.presets ?? []) zero(p.seaFlatTransportCents, `presets.${p.key}.seaFlatTransportCents`);
  return out;
}
