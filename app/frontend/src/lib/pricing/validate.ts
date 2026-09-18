import type { PricingConfig } from './engine';

/** A validation failure as a code + params, translated by the admin UI. */
export interface ConfigError {
  code: string;
  params?: Record<string, string | number>;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Guard a pricing configuration before it goes live. Catches the three classes the
 * brief calls out — negative rates, overlapping tiers, a missing tier boundary —
 * plus the obvious structural mistakes. Returns [] when the config is safe to save.
 */
export function validatePricingConfig(c: PricingConfig): ConfigError[] {
  const errs: ConfigError[] = [];
  const neg = (v: unknown, field: string) => { if (isNum(v) && v < 0) errs.push({ code: 'negative', params: { field } }); };

  neg(c.handlingFeeCents, 'handling');
  if (c.customsAdminFeeCents != null) neg(c.customsAdminFeeCents, 'customs');
  neg(c.volumetricSurchargeRateCentsPerKg, 'volumetric_surcharge');
  if (!isNum(c.volumetricDivisor) || c.volumetricDivisor <= 0) errs.push({ code: 'divisor_positive' });
  if (c.ratioQuote && (!isNum(c.ratioQuote.thresholdKgPerM3) || c.ratioQuote.thresholdKgPerM3 <= 0)) {
    errs.push({ code: 'ratio_positive' });
  }

  // Express
  neg(c.modes?.express?.perKgCents, 'express_per_kg');
  neg(c.modes?.express?.flatMinCents, 'express_flat_min');
  if (!isNum(c.modes?.express?.maxKg) || c.modes.express.maxKg <= 0) errs.push({ code: 'max_positive', params: { mode: 'express' } });

  // Cargo
  neg(c.modes?.cargo?.perKgCents, 'cargo_per_kg');
  if (!isNum(c.modes?.cargo?.maxKg) || c.modes.cargo.maxKg <= 0) errs.push({ code: 'max_positive', params: { mode: 'cargo' } });

  // Sea tiers: non-empty, positive, strictly increasing (no overlap), and the last
  // boundary must equal maxM3 so coverage is contiguous up to the quote threshold.
  const sea = c.modes?.sea;
  const tiers = sea?.tiers ?? [];
  if (tiers.length === 0) {
    errs.push({ code: 'sea_no_tiers' });
  } else {
    let prev = 0;
    for (let i = 0; i < tiers.length; i++) {
      const tt = tiers[i];
      neg(tt.perM3Cents, 'sea_per_m3');
      if (!isNum(tt.uptoM3) || tt.uptoM3 <= 0) errs.push({ code: 'sea_tier_positive', params: { index: i + 1 } });
      else if (tt.uptoM3 <= prev) errs.push({ code: 'sea_tiers_order', params: { index: i + 1 } });
      if (isNum(tt.uptoM3)) prev = tt.uptoM3;
    }
    if (!isNum(sea!.maxM3) || sea!.maxM3 <= 0) errs.push({ code: 'sea_max_positive' });
    else if (isNum(prev) && prev !== sea!.maxM3) errs.push({ code: 'sea_boundary', params: { last: prev, max: sea!.maxM3 } });
  }

  for (const p of c.presets ?? []) {
    if (p.seaFlatTransportCents != null) neg(p.seaFlatTransportCents, `preset_${p.key}`);
  }

  return errs;
}
