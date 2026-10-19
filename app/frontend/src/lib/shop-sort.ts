/**
 * Shop catalogue ordering. The DB returns products A→Z, which put a whole
 * family (e.g. "Lingettes …") at the top and buried everything else. The
 * default "featured" order interleaves categories so the first screen shows
 * the variety of the shop.
 */
import type { Brand, Product, ProductCategory } from '@/lib/products';
import { normalizeBrandText } from '@/lib/brand-detect';

export type SortMode = 'featured' | 'price_asc' | 'price_desc' | 'name_asc' | 'brand' | 'category';
export const SORT_MODES: SortMode[] = ['featured', 'price_asc', 'price_desc', 'name_asc', 'brand', 'category'];

type Lang = 'fr' | 'en';
type Ctx = { categories: ProductCategory[]; brands: Brand[]; lang: Lang };

const nameOf = (p: Product, lang: Lang) => (lang === 'en' ? p.name_en : p.name_fr) ?? '';
const cmpName = (a: Product, b: Product, lang: Lang) => nameOf(a, lang).localeCompare(nameOf(b, lang), lang, { sensitivity: 'base' });

export function sortProducts(list: Product[], mode: SortMode, { categories, brands, lang }: Ctx): Product[] {
  const catOrder = new Map(categories.map((c) => [c.id, c.display_order]));
  const brandName = new Map(brands.map((b) => [b.id, (lang === 'en' ? b.name_en : b.name_fr) ?? '']));
  const byCat = (a: Product, b: Product) => (catOrder.get(a.category_id) ?? 999) - (catOrder.get(b.category_id) ?? 999);

  switch (mode) {
    case 'price_asc': return [...list].sort((a, b) => a.price - b.price || cmpName(a, b, lang));
    case 'price_desc': return [...list].sort((a, b) => b.price - a.price || cmpName(a, b, lang));
    case 'name_asc': return [...list].sort((a, b) => cmpName(a, b, lang));
    case 'category': return [...list].sort((a, b) => byCat(a, b) || cmpName(a, b, lang));
    case 'brand': return [...list].sort((a, b) => {
      const ba = a.brand_id ? brandName.get(a.brand_id) : undefined;
      const bb = b.brand_id ? brandName.get(b.brand_id) : undefined;
      if (!ba && !bb) return cmpName(a, b, lang);
      if (!ba) return 1;          // unbranded last
      if (!bb) return -1;
      return ba.localeCompare(bb, lang, { sensitivity: 'base' }) || cmpName(a, b, lang);
    });
    case 'featured':
    default: {
      // Round-robin across categories: one product from each category per
      // round, products with a photo first inside a category.
      const groups = new Map<string, Product[]>();
      for (const p of [...list].sort((a, b) => Number(!!b.image_url) - Number(!!a.image_url) || cmpName(a, b, lang))) {
        const g = groups.get(p.category_id) ?? [];
        g.push(p);
        groups.set(p.category_id, g);
      }
      const ordered = [...groups.entries()].sort((a, b) => (catOrder.get(a[0]) ?? 999) - (catOrder.get(b[0]) ?? 999)).map(([, g]) => g);
      const out: Product[] = [];
      for (let i = 0; ordered.some((g) => i < g.length); i++) {
        for (const g of ordered) if (i < g.length) out.push(g[i]);
      }
      return out;
    }
  }
}

/** Search across name, brand and category (accent/case-insensitive, all words must match). */
export function matchesQuery(p: Product, query: string, { categories, brands, lang }: Ctx): boolean {
  const q = normalizeBrandText(query);
  if (!q) return true;
  const cat = categories.find((c) => c.id === p.category_id);
  const brand = brands.find((b) => b.id === p.brand_id);
  const hay = normalizeBrandText([
    p.name_fr, p.name_en,
    brand ? `${brand.name_fr} ${brand.name_en}` : '',
    cat ? (lang === 'en' ? cat.name_en : cat.name_fr) : '',
  ].join(' '));
  return q.split(' ').every((w) => hay.includes(w));
}
