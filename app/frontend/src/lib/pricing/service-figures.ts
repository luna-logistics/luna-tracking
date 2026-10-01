/**
 * Figures shown on the service pages (/fret-aerien, /fret-maritime), derived
 * from the SAME grid the calculator prices with (lib/pricing/config via
 * hooks/usePricingConfig) — never retyped in the locale files, so a tariff
 * change in /admin/tarifs reaches these pages with no deploy.
 *
 * Pure functions, no React. scripts/prerender-metas.mjs mirrors seaMetaFigures
 * by hand (Node can't import this .ts), the same way it mirrors formatEuros.
 */
import type { PricingConfig } from './engine';

export type Lang = 'fr' | 'en';

const locale = (lang: Lang) => (lang === 'en' ? 'en-IE' : 'fr-BE');

/** 1800 → "18 €" / "€18"; 550 → "5,50 €" / "€5.50" (no decimals on whole euros). */
export function eur(cents: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang), {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** 5 → "5", 0.096 → "0,096" (fr) / "0.096" (en). */
export function num(n: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 3 }).format(n);
}

export interface SeaTierView { fromM3: number | null; uptoM3: number; perM3Cents: number }

/** Sea tiers in order; `fromM3` is the previous tier's upper bound (null for the first). */
export function seaTiers(config: PricingConfig): SeaTierView[] {
  const sorted = [...config.modes.sea.tiers].sort((a, b) => a.uptoM3 - b.uptoM3);
  return sorted.map((t, i) => ({ fromM3: i === 0 ? null : sorted[i - 1].uptoM3, uptoM3: t.uptoM3, perM3Cents: t.perM3Cents }));
}

export interface CartonForfait { dims: string; totalCents: number; volumeM3: number }

/** Flat carton prices: transport + the handling fee, as printed on the tariff
 *  sheet (the engine adds handling once per shipment). Biggest carton first. */
export function cartonForfaits(config: PricingConfig, lang: Lang): CartonForfait[] {
  const out: CartonForfait[] = [];
  for (const p of config.presets ?? []) {
    if (p.seaFlatTransportCents == null || p.lengthCm == null || p.widthCm == null || p.heightCm == null) continue;
    out.push({
      dims: [p.lengthCm, p.widthCm, p.heightCm].map((d) => num(d, lang)).join(' × '),
      totalCents: p.seaFlatTransportCents + config.handlingFeeCents,
      volumeM3: (p.lengthCm * p.widthCm * p.heightCm) / 1_000_000,
    });
  }
  return out.sort((a, b) => b.volumeM3 - a.volumeM3);
}

/** Lowest flat carton price, or null when the grid has none. */
export function cartonFromCents(config: PricingConfig): number | null {
  const all = cartonForfaits(config, 'fr');
  return all.length ? Math.min(...all.map((c) => c.totalCents)) : null;
}

/** "750 €/m³ jusqu'à 5 m³, 725 €/m³ de 5 à 10 m³" — the meta-description fragment,
 *  built from locale templates `svc_sea.meta_tier_first` / `meta_tier_next`. */
export function seaMetaTiers(
  config: PricingConfig, lang: Lang,
  tpl: { first: string; next: string },
): string {
  return seaTiers(config).map((t) => {
    const s = t.fromM3 == null ? tpl.first : tpl.next;
    return s.replace('{{rate}}', eur(t.perM3Cents, lang))
      .replace('{{upto}}', num(t.uptoM3, lang))
      .replace('{{from}}', t.fromM3 == null ? '' : num(t.fromM3, lang));
  }).join(', ');
}
