import { formatEuros } from '@/lib/pricing/engine';

/**
 * Human wording for a pricing-document path ("modes.express.perKgCents" →
 * "Express — prix au kg", "18,00 €/kg"): the ONE vocabulary shared by the
 * validation messages, the confirmation before publishing and the change
 * history of /admin/tarifs.
 */
type T = (key: string, opts?: Record<string, unknown>) => string;
type Unit = 'eur' | 'eur_kg' | 'eur_m3' | 'kg' | 'm3' | 'kg_m3' | 'cm' | 'number' | 'modes' | 'text';

interface PathInfo { label: string; unit: Unit; order: number }

const MODE_FIELD = /^modes\.(express|cargo)\.(perKgCents|flatMinCents|maxKg|minKg)$/;
const TIER_FIELD = /^modes\.sea\.tiers\.(\d+)\.(uptoM3|perM3Cents)$/;
const TIER = /^modes\.sea\.tiers\.(\d+)$/;
const PRESET_FIELD = /^presets\.([^.]+)\.([A-Za-z]+)$/;
const TRANSIT = /^transitTimes\.(express|cargo|sea)$/;
const INCLUDE = /^includes\.([A-Za-z]+)$/;

const PRESET_UNITS: Record<string, Unit> = {
  seaFlatTransportCents: 'eur', sheetPriceCents: 'eur', lengthCm: 'cm', widthCm: 'cm', heightCm: 'cm', weightKg: 'kg', volumeM3: 'm3',
};

export function describePricingPath(path: string, t: T): PathInfo {
  const simple: Record<string, [string, Unit, number]> = {
    volumetricSurchargeRateCentsPerKg: ['admin_pricing.lbl_surcharge', 'eur_kg', 20],
    volumetricDivisor: ['admin_pricing.lbl_divisor', 'number', 21],
    'modes.sea.tiers': ['admin_pricing.lbl_sea_tiers', 'text', 30],
    'modes.sea.maxM3': ['admin_pricing.lbl_sea_max', 'm3', 60],
    presets: ['admin_pricing.lbl_presets', 'text', 45],
    handlingFeeCents: ['admin_pricing.lbl_handling', 'eur', 50],
    customsAdminFeeCents: ['admin_pricing.lbl_customs', 'eur', 51],
    'ratioQuote.thresholdKgPerM3': ['admin_pricing.lbl_ratio_threshold', 'kg_m3', 63],
    'ratioQuote.appliesTo': ['admin_pricing.lbl_ratio_modes', 'modes', 64],
    ratioQuote: ['admin_pricing.lbl_ratio_threshold', 'text', 63],
    vatStatus: ['admin_pricing.lbl_vat', 'text', 80],
    effectiveFrom: ['admin_pricing.lbl_effective_from', 'text', 81],
    'corridor.origin': ['admin_pricing.lbl_corridor_origin', 'text', 90],
    'corridor.destination': ['admin_pricing.lbl_corridor_destination', 'text', 91],
  };
  const hit = simple[path];
  if (hit) return { label: t(hit[0]), unit: hit[1], order: hit[2] };

  let m = MODE_FIELD.exec(path);
  if (m) {
    const [, mode, field] = m;
    const spec: Record<string, [string, Unit, number]> = {
      perKgCents: ['admin_pricing.lbl_per_kg', 'eur_kg', 0],
      flatMinCents: ['admin_pricing.lbl_flat_min', 'eur', 1],
      maxKg: ['admin_pricing.lbl_max_kg', 'kg', 60],
      minKg: ['admin_pricing.lbl_min_kg', 'kg', 70],
    };
    const [key, unit, base] = spec[field];
    return { label: t(key, { mode: t(`calc.mode_${mode}`) }), unit, order: base + (mode === 'express' ? 10 : 12) };
  }
  m = TIER_FIELD.exec(path);
  if (m) {
    const n = Number(m[1]) + 1;
    return m[2] === 'uptoM3'
      ? { label: t('admin_pricing.lbl_tier_upto', { n }), unit: 'm3', order: 31 + n / 100 }
      : { label: t('admin_pricing.lbl_tier_price', { n }), unit: 'eur_m3', order: 31 + n / 100 + 0.001 };
  }
  m = TIER.exec(path);
  if (m) return { label: t('admin_pricing.lbl_tier', { n: Number(m[1]) + 1 }), unit: 'text', order: 31 + (Number(m[1]) + 1) / 100 };
  m = PRESET_FIELD.exec(path);
  if (m) {
    const name = presetName(m[1], t);
    return m[2] === 'seaFlatTransportCents'
      ? { label: t('admin_pricing.lbl_carton_transport', { name }), unit: 'eur', order: 40 }
      : { label: t('admin_pricing.lbl_preset_field', { name, field: m[2] }), unit: PRESET_UNITS[m[2]] ?? 'text', order: 46 };
  }
  m = TRANSIT.exec(path);
  if (m) return { label: t('admin_pricing.lbl_transit', { mode: t(`calc.mode_${m[1]}`) }), unit: 'text', order: 75 };
  m = INCLUDE.exec(path);
  if (m) return { label: t('admin_pricing.lbl_include', { name: t(`admin_pricing.inc_${m[1]}`) }), unit: 'text', order: 85 };
  return { label: path, unit: 'text', order: 99 };
}

/** A preset's display name: the calculator's own label when it has one. */
export function presetName(key: string, t: T): string {
  const k = `calc.preset_${key === 'move_3m3' ? 'move' : key}`;
  const v = t(k);
  return v === k ? key : v;
}

const num = (n: number, lang: 'fr' | 'en') =>
  new Intl.NumberFormat(lang === 'en' ? 'en-IE' : 'fr-BE', { maximumFractionDigits: 3 }).format(n);

/** A stored value in the path's unit ("—" when empty / absent). */
export function formatPricingValue(path: string, value: unknown, lang: 'fr' | 'en', t: T): string {
  if (value === undefined || value === null || value === '') return '—';
  const { unit } = describePricingPath(path, t);
  if (typeof value === 'number' && Number.isFinite(value)) {
    switch (unit) {
      case 'eur': return formatEuros(value, lang);
      case 'eur_kg': return `${formatEuros(value, lang)}/kg`;
      case 'eur_m3': return `${formatEuros(value, lang)}/m³`;
      case 'kg': return `${num(value, lang)} kg`;
      case 'm3': return `${num(value, lang)} m³`;
      case 'kg_m3': return `${num(value, lang)} kg/m³`;
      case 'cm': return `${num(value, lang)} cm`;
      default: return num(value, lang);
    }
  }
  if (unit === 'modes' && Array.isArray(value)) {
    return value.length ? value.map((m) => t(`calc.mode_${String(m)}`)).join(', ') : '—';
  }
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** Sort key: the order of the form (air, volume, sea, fees, thresholds, texts). */
export function pricingPathOrder(path: string, t: T): number {
  return describePricingPath(path, t).order;
}
