/**
 * Volume from dimensions — the ONE formula (L × l × H in cm → m³) behind the
 * pricing engine, the shipment packing list, /calculateur, /tarifs and the pro
 * Devis form. The three forms share the same field behaviour: the volume
 * pre-fills live from the dimensions, stays editable, and a typed volume is an
 * explicit override that replaces the dimensions for pricing.
 */

const isPos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** "0,096" / "0.096" / 0.096 → 0.096; blank, zero, negative or garbage → null. */
export function parseDecimal(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return isPos(n) ? n : null;
}

/** L × l × H (cm) × quantity → m³, or null unless all three dimensions are > 0. */
export function volumeM3FromCm(
  lengthCm: number | null | undefined,
  widthCm: number | null | undefined,
  heightCm: number | null | undefined,
  quantity: number | null | undefined = 1,
): number | null {
  if (!isPos(lengthCm) || !isPos(widthCm) || !isPos(heightCm)) return null;
  const qty = isPos(quantity) ? quantity : 1;
  return (lengthCm * widthCm * heightCm / 1_000_000) * qty;
}

/** m³ for a volume field: 4 decimals max (100 cm³), trailing zeros dropped. */
export function formatM3(v: number): string {
  return String(Number(v.toFixed(4)));
}

/** Rounded value stored/pre-filled in a number field (same 4 decimals). */
export function roundM3(v: number): number {
  return Number(v.toFixed(4));
}

/** What a volume field shows: the typed override when there is one, else the
 *  volume derived from the dimensions (blank when the dimensions are incomplete). */
export function volumeFieldValue(typed: string | null, derived: number | null): string {
  if (typed != null) return typed;
  return derived == null ? '' : formatM3(derived);
}
