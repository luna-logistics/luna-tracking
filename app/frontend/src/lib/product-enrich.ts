/**
 * Bulk enrichment helpers for the admin "complete the product sheets" panel:
 * values that can be derived from data we already have, so 800+ products
 * don't have to be edited one by one. Pure functions (unit-tested).
 */

const UNIT_KG: Record<string, number> = {
  kg: 1, g: 0.001, gr: 0.001, l: 1, ltr: 1, liter: 1, litre: 1, cl: 0.01, ml: 0.001,
};
const MULTI = /(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|gr|g|ltr|liter|litre|l|cl|ml)(?![a-z])/i;
const SINGLE = /(\d+(?:[.,]\d+)?)\s*(kg|gr|g|ltr|liter|litre|l|cl|ml)(?![a-z])/gi;

/**
 * Net content in kg read from a product name: "250ml" → 0.25, "4x90g" → 0.36,
 * "1,5L" → 1.5, "2x400 ml" → 0.8. Liquids count as 1 kg per litre (an
 * estimate). Null when the name has no unit (e.g. "20pc").
 */
export function parseWeightKg(name: string): number | null {
  const n = name.toLowerCase().replace(/(\d)\s+(?=[.,]\d)/g, '$1');
  const m = n.match(MULTI);
  if (m) {
    const v = Number(m[1]) * Number(m[2].replace(',', '.')) * UNIT_KG[m[3].toLowerCase()];
    return v > 0 ? round(v) : null;
  }
  let last: RegExpExecArray | null = null;
  for (const x of n.matchAll(SINGLE)) last = x as RegExpExecArray;
  if (!last) return null;
  const v = Number(last[1].replace(',', '.')) * UNIT_KG[last[2].toLowerCase()];
  return v > 0 ? round(v) : null;
}

const round = (v: number) => Math.round(v * 1000) / 1000;
