import type { CorridorGrid, PricingConfig } from './engine';
import { validatePricingConfig } from './validate';
import { diffPricingConfigs } from './diff';

/**
 * VALEURS DE SECOURS — the Brussels → Kinshasa grid exactly as published in
 * pricing_config on 2026-09-25 (€5.50/kg volumetric rate). The live grid is
 * the database row edited in /admin/tarifs; this copy is what the site prices
 * with whenever that row can't be used (network error, table missing or empty,
 * invalid value), so a visitor never sees NaN, Infinity or a made-up price.
 *
 * The same document seeds pricing_config when no active row exists (migration
 * 20260928100000) — fallback.test.ts fails if the two drift apart. Update both
 * when the published tariff changes durably. The effective date stays null: the
 * site does not claim a date while it runs on this copy.
 */
const GRID: PricingConfig = {
  corridor: { origin: 'brussels', destination: 'kinshasa' },
  handlingFeeCents: 500,
  customsAdminFeeCents: 12500,
  volumetricDivisor: 6000,
  volumetricSurchargeRateCentsPerKg: 550,
  ratioQuote: { thresholdKgPerM3: 374, appliesTo: ['sea'] },
  modes: {
    express: { perKgCents: 1800, flatMinCents: 1800, minKg: 0.1, maxKg: 200 },
    cargo: { perKgCents: 1600, minKg: 1, maxKg: 500 },
    sea: {
      tiers: [
        { uptoM3: 5, perM3Cents: 75000 },
        { uptoM3: 10, perM3Cents: 72500 },
      ],
      maxM3: 10,
    },
  },
  presets: [
    { key: 'carton_std', lengthCm: 60, widthCm: 40, heightCm: 40, sheetPriceCents: 7500, seaFlatTransportCents: 7000 },
    { key: 'carton_small', lengthCm: 40, widthCm: 30, heightCm: 30, sheetPriceCents: 3000, seaFlatTransportCents: 2500 },
    { key: 'suitcase', weightKg: 23 },
    { key: 'move_3m3', volumeM3: 3 },
  ],
  transitTimes: { express: null, cargo: null, sea: null },
  vatStatus: null,
  includes: {
    homeDeliveryKinshasa: null,
    collection: null,
    customsDuties: null,
    congoleseVatOnArrival: null,
    insurance: null,
    insuranceCeiling: null,
  },
  effectiveFrom: null,
};

/**
 * Default Brussels → Lubumbashi grid (PDF « Grille tarifaire Lubumbashi »):
 * express €21/kg (min €21), cargo €17.50/kg, sea 750/725/700 €/m³ up to 30 m³
 * with a flat +€3/kg on every tier and carton, the €5 dossier fee, and NO
 * sous-douane (customsAdminFeeCents null). The live corridor lives in the DB
 * (pricing_config.config.corridors.lubumbashi); this copy is only what
 * /admin/tarifs restores with "valeurs par défaut" for this corridor. It is NOT
 * part of the root fallback GRID, which stays the Kinshasa grid so an offline
 * site degrades Lubumbashi to "Sur devis" rather than inventing a price.
 */
const LUBUMBASHI_GRID: CorridorGrid = {
  handlingFeeCents: 500,
  customsAdminFeeCents: null,
  volumetricDivisor: 6000,
  volumetricSurchargeRateCentsPerKg: 550,
  seaWeightSurchargeCentsPerKg: 300,
  ratioQuote: { thresholdKgPerM3: 374, appliesTo: ['sea'] },
  modes: {
    express: { perKgCents: 2100, flatMinCents: 2100, minKg: 0.1, maxKg: 200 },
    cargo: { perKgCents: 1750, minKg: 1, maxKg: 500 },
    sea: {
      tiers: [
        { uptoM3: 5, perM3Cents: 75000 },
        { uptoM3: 10, perM3Cents: 72500 },
        { uptoM3: 30, perM3Cents: 70000 },
      ],
      maxM3: 30,
    },
  },
  presets: [
    { key: 'carton_std', lengthCm: 60, widthCm: 40, heightCm: 40, sheetPriceCents: 7500, seaFlatTransportCents: 7000 },
    { key: 'carton_small', lengthCm: 40, widthCm: 30, heightCm: 30, sheetPriceCents: 3000, seaFlatTransportCents: 2500 },
    { key: 'suitcase', weightKg: 23 },
    { key: 'move_3m3', volumeM3: 3 },
  ],
  transitTimes: { express: null, cargo: null, sea: null },
  vatStatus: null,
  includes: null,
};

export const FALLBACK_LUBUMBASHI_CORRIDOR: CorridorGrid = deepFreeze(structuredClone(LUBUMBASHI_GRID));

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

export const FALLBACK_PRICING_CONFIG: PricingConfig = deepFreeze(GRID);

export type PricingSource = 'database' | 'fallback';
/** Why the fallback grid is in use: the database could not be reached (or the
 *  table is missing), it holds no active grid, or the active grid is invalid. */
export type FallbackReason = 'unreachable' | 'missing' | 'invalid';

export interface ResolvedPricing {
  config: PricingConfig;
  source: PricingSource;
  reason: FallbackReason | null;
}

export const fallbackPricing = (reason: FallbackReason): ResolvedPricing => ({
  config: FALLBACK_PRICING_CONFIG, source: 'fallback', reason,
});

/**
 * The stored document → the grid the site prices with. The database grid is
 * used only when it is complete and valid; otherwise the WHOLE fallback grid
 * (never a mix of the two, which would be a grid nobody approved).
 */
export function resolvePricingConfig(stored: unknown): ResolvedPricing {
  if (stored == null) return fallbackPricing('missing');
  try {
    if (validatePricingConfig(stored).length === 0) {
      return { config: stored as PricingConfig, source: 'database', reason: null };
    }
  } catch {
    // validatePricingConfig never throws; belt and braces for a hostile document.
  }
  return fallbackPricing('invalid');
}

/** The tariff part of a grid — what "Restaurer les valeurs par défaut" resets.
 *  Transit times, VAT wording, "what the price includes" and the effective
 *  date are informational and stay as the admin set them. */
const TARIFF_KEYS = [
  'corridor', 'handlingFeeCents', 'customsAdminFeeCents', 'volumetricDivisor',
  'volumetricSurchargeRateCentsPerKg', 'ratioQuote', 'modes', 'presets',
] as const;

const tariffOf = (c: PricingConfig) => Object.fromEntries(TARIFF_KEYS.map((k) => [k, c[k]]));

/** Does this document path (lib/pricing/diff) belong to the tariff part? */
export const isTariffPath = (path: string) => TARIFF_KEYS.some((k) => path === k || path.startsWith(`${k}.`));

export function withFallbackTariff(config: PricingConfig): PricingConfig {
  const out = structuredClone(config);
  for (const k of TARIFF_KEYS) (out as unknown as Record<string, unknown>)[k] = structuredClone(FALLBACK_PRICING_CONFIG[k]);
  return out;
}

export function hasFallbackTariff(config: PricingConfig): boolean {
  return diffPricingConfigs(tariffOf(config), tariffOf(FALLBACK_PRICING_CONFIG)).length === 0;
}

/** Default grid for an extra corridor, or null when none is known. Only
 *  Lubumbashi has a built-in default (the published PDF grid). */
export function fallbackCorridorGrid(slug: string): CorridorGrid | null {
  return slug === 'lubumbashi' ? structuredClone(FALLBACK_LUBUMBASHI_CORRIDOR) : null;
}

/** Reset one extra corridor to its default grid (admin "restaurer les valeurs
 *  par défaut" while editing that corridor). No-op when the slug has no default. */
export function withFallbackCorridor(config: PricingConfig, slug: string): PricingConfig {
  const grid = fallbackCorridorGrid(slug);
  if (!grid) return config;
  const out = structuredClone(config);
  out.corridors = { ...(out.corridors ?? {}), [slug]: grid };
  return out;
}

/** Is this corridor already on its default grid? */
export function hasFallbackCorridor(config: PricingConfig, slug: string): boolean {
  const grid = fallbackCorridorGrid(slug);
  const entry = config.corridors?.[slug];
  if (!grid || !entry) return false;
  return diffPricingConfigs(entry, grid).length === 0;
}
