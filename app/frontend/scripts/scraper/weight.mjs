/**
 * Weight / format parser. Converts a contenance string to weight_kg WHEN it is
 * reliable (mass units). For volumes (L/cl/ml) it does NOT invent a kg value —
 * water-density assumptions would be wrong for oil, alcohol, etc. — it returns
 * kg=null and keeps the text so a human/the filter can decide.
 *
 * Handles: "500 g", "1 kg", "1,5 kg", "250g", "6 x 33 cl", "2x1L",
 *          "12 pièces", "1 L", "750 ml".
 */

/** @returns {{ weight_kg: number|null, text: string|null, volume_l: number|null, count: number|null }} */
export function parseWeight(input) {
  const empty = { weight_kg: null, text: null, volume_l: null, count: null };
  if (!input) return empty;
  const text = String(input).trim();
  const s = text.toLowerCase().replace(',', '.');

  // multipack: "6 x 33 cl", "2x1l", "12 x 100 g"
  const multi = s.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|mg|l|cl|ml)\b/);
  if (multi) {
    const count = parseFloat(multi[1]);
    const per = parseFloat(multi[2]);
    const unit = multi[3];
    const mass = toKg(per, unit);
    const vol = toL(per, unit);
    return {
      weight_kg: mass != null ? round(mass * count) : null,
      volume_l: vol != null ? round(vol * count) : null,
      count, text,
    };
  }

  // single mass/volume: "500 g", "1.5 kg", "750 ml", "1 l"
  const single = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|mg|l|cl|ml)\b/);
  if (single) {
    const val = parseFloat(single[1]);
    const unit = single[2];
    return { weight_kg: toKg(val, unit), volume_l: toL(val, unit), count: null, text };
  }

  // piece count only: "12 pièces", "x6", "lot de 4"
  const pieces = s.match(/(\d+)\s*(?:pi[eè]ces?|pcs?|stuks?|units?)\b/) || s.match(/\bx\s*(\d+)\b/) || s.match(/lot de (\d+)/);
  if (pieces) return { weight_kg: null, volume_l: null, count: parseInt(pieces[1], 10), text };

  return { ...empty, text };
}

function toKg(val, unit) {
  switch (unit) {
    case 'kg': return round(val);
    case 'g': return round(val / 1000);
    case 'mg': return round(val / 1e6);
    default: return null; // L/cl/ml are volume, not mass
  }
}

function toL(val, unit) {
  switch (unit) {
    case 'l': return round(val);
    case 'cl': return round(val / 100);
    case 'ml': return round(val / 1000);
    default: return null;
  }
}

function round(n) { return Math.round(n * 1000) / 1000; }
