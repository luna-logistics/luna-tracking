/**
 * Shared store-import pipeline: normalise → filter → (preview) → import.
 *
 * Every source funnels through here. Today the only source is the admin
 * CSV import (`normalizeCsvRow`). A future per-store scraper produces
 * `NormalizedProduct[]` directly and reuses the exact same
 * `isLunaEligibleProduct` filter + import mapping — no duplicated logic.
 *
 * This module holds ZERO React / DOM code so it can run in the browser,
 * in build scripts, and in the node test harness.
 */
import type { NormalizedProduct } from './normalized-product';

const TRUE_TOKENS = new Set(['true', '1', 'oui', 'yes', 'vrai', 'x', 'y']);

function parseBool(v: string | undefined): boolean {
  return !!v && TRUE_TOKENS.has(v.trim().toLowerCase());
}

const str = (v: string | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/**
 * Build a NormalizedProduct from one raw CSV row.
 *
 * Structural/importable columns are the SAME as before (name, price,
 * category_slug, …). The extra columns below are OPTIONAL, read only to
 * feed the eligibility filter + preview, and are NOT persisted yet
 * (persisting source/store needs a migration — see PROPOSITION B):
 *   store_slug, source_url, source_product_id, source_category,
 *   product_type, storage_info, is_alcoholic.
 */
export function normalizeCsvRow(raw: Record<string, string>): NormalizedProduct {
  return {
    store_slug: str(raw.store_slug),
    source_url: str(raw.source_url),
    source_product_id: str(raw.source_product_id),
    source_category: str(raw.source_category),
    product_type: str(raw.product_type),
    name_fr: raw.name_fr?.trim() ?? '',
    name_en: raw.name_en?.trim() ?? '',
    description_fr: str(raw.description_fr),
    description_en: str(raw.description_en),
    storage_info: str(raw.storage_info),
    is_alcoholic: parseBool(raw.is_alcoholic),
    price: raw.price != null && raw.price.trim() !== '' ? Number(raw.price) : null,
    weight_kg: raw.weight_kg != null && raw.weight_kg.trim() !== '' ? Number(raw.weight_kg) : null,
    barcode: str(raw.barcode),
    hs_code: str(raw.hs_code),
    image_url: str(raw.image_url),
    category_slug: str(raw.category_slug),
    raw,
  };
}

/** Serialise rejected rows (excluded + to-verify) to a CSV string with a
 *  `luna_status` + `luna_reason` column appended, for admin download. */
export function rejectedRowsToCsv(
  rows: Array<{ raw: Record<string, string>; status: string; reason: string }>,
): string {
  if (rows.length === 0) return '';
  const cols = Array.from(
    rows.reduce((set, r) => { Object.keys(r.raw).forEach((k) => set.add(k)); return set; }, new Set<string>()),
  );
  const header = [...cols, 'luna_status', 'luna_reason'];
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [header.map(esc).join(',')];
  for (const r of rows) {
    const cells = cols.map((c) => esc(r.raw[c] ?? ''));
    cells.push(esc(r.status), esc(r.reason));
    lines.push(cells.join(','));
  }
  return lines.join('\r\n');
}
