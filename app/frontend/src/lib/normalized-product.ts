/**
 * Normalised product format — the single shape EVERY source (CSV import
 * today, per-store scrapers later) must produce before it reaches the
 * eligibility filter and the import pipeline.
 *
 * Nothing here is store-specific: a Lidl connector, a Colruyt connector,
 * a clothing-site connector all emit `NormalizedProduct[]`, then the same
 * `isLunaEligibleProduct` filter and the same preview → import path run
 * unchanged. That is the whole point of this file — one contract, many
 * sources, zero duplicated business logic.
 *
 * IMPORTANT: this format says nothing about customs / import legality
 * into the DRC. `product_type` + the eligibility rules only answer
 * "does Luna currently want to list this kind of product" (shelf-stable,
 * no cold chain). Customs is a separate concern handled elsewhere.
 *
 * This module is types-only (plus one runtime constant) so it can be
 * imported by React code, by build scripts, and by the node test harness
 * without pulling in any runtime dependency.
 */

/** Coarse family of a product. Drives which rule set the filter applies.
 *  Only `food` has validated rules today; the others are declared so the
 *  structure exists, but carry NO rules yet — their products fall to
 *  "to_verify" until a rule set is explicitly approved. */
export type ProductType = 'food' | 'clothing' | 'hygiene' | 'household' | 'other';

/** The known product types, as data — used to detect "unknown type". */
export const PRODUCT_TYPES: readonly ProductType[] = ['food', 'clothing', 'hygiene', 'household', 'other'];

export interface NormalizedProduct {
  /** Which store this came from (e.g. "lidl", "colruyt"). Free text for
   *  now — no `stores` table exists yet (see PROPOSITION A). */
  store_slug?: string | null;
  /** Canonical URL of the product on the source site. */
  source_url?: string | null;
  /** The store's own product id / reference. */
  source_product_id?: string | null;
  /** The store's own category label or path (a strong filtering signal). */
  source_category?: string | null;

  /** Coarse family. May be an unknown string or null → filter returns
   *  "to_verify" rather than guessing. */
  product_type?: ProductType | string | null;

  name_fr: string;
  name_en: string;
  description_fr?: string | null;
  description_en?: string | null;

  /** Any storage / conservation text the source exposes ("à conserver au
   *  frais", "keep refrigerated", "conservation à température ambiante"…).
   *  The most reliable cold-chain signal when present. */
  storage_info?: string | null;

  /** Informational only — alcohol is ALLOWED. Never a reason to exclude. */
  is_alcoholic?: boolean | null;

  price?: number | null;
  weight_kg?: number | null;
  barcode?: string | null;
  hs_code?: string | null;
  image_url?: string | null;

  /** Luna catalogue category slug (maps to products.category_id on import). */
  category_slug?: string | null;

  /** Untouched source payload, kept for traceability / future signals.
   *  Its string values are also folded into the filter's search corpus. */
  raw?: Record<string, unknown>;
}
