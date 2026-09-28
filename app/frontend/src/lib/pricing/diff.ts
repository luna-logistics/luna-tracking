/**
 * A pricing document as "path → value" leaves, and old vs new — the TypeScript
 * twin of pricing_config_leaves / pricing_config_diff (migration
 * 20260928100000), so the confirmation shown before publishing lists exactly
 * the rows the change history records.
 *
 *   • objects are walked by key ("modes.express.perKgCents");
 *   • arrays of objects by their `key` when they have one (carton presets:
 *     "presets.carton_std.seaFlatTransportCents"), else by index (sea tiers:
 *     "modes.sea.tiers.0.perM3Cents");
 *   • arrays of plain values stay one value ("ratioQuote.appliesTo").
 * The document is normalised through JSON first, exactly like the RPC payload.
 */
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface PricingChange {
  path: string;
  /** undefined = the field did not exist on that side. */
  before: Json | undefined;
  after: Json | undefined;
}

const isContainer = (v: unknown): v is object => v !== null && typeof v === 'object';

function isLeaf(v: Json): boolean {
  if (!isContainer(v)) return true;
  if (Array.isArray(v)) return !v.some(isContainer);
  return Object.keys(v).length === 0;
}

export function pricingLeaves(doc: unknown): Map<string, Json> {
  const out = new Map<string, Json>();
  const text = doc === undefined ? undefined : JSON.stringify(doc);
  if (text === undefined) return out;

  const walk = (v: Json, path: string | null) => {
    if (isLeaf(v)) {
      if (path !== null) out.set(path, v);
      return;
    }
    const at = (seg: string) => (path === null ? seg : `${path}.${seg}`);
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        const key = isContainer(item) && !Array.isArray(item) ? (item as { [k: string]: Json }).key : undefined;
        walk(item, at(key != null && !isContainer(key) ? String(key) : String(i)));
      });
    } else {
      for (const [k, item] of Object.entries(v)) walk(item, at(k));
    }
  };
  walk(JSON.parse(text) as Json, null);
  return out;
}

export function diffPricingConfigs(before: unknown, after: unknown): PricingChange[] {
  const a = pricingLeaves(before);
  const b = pricingLeaves(after);
  const out: PricingChange[] = [];
  for (const path of new Set([...a.keys(), ...b.keys()])) {
    const inA = a.has(path);
    const inB = b.has(path);
    if (inA !== inB || JSON.stringify(a.get(path)) !== JSON.stringify(b.get(path))) {
      out.push({ path, before: inA ? a.get(path) : undefined, after: inB ? b.get(path) : undefined });
    }
  }
  return out;
}
