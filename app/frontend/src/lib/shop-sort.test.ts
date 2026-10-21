import { describe, expect, it } from 'vitest';
import type { Brand, Product, ProductCategory } from './products';
import { matchesQuery, sortProducts } from './shop-sort';

const cat = (id: string, order: number, name: string) => ({ id, slug: id, name_fr: name, name_en: name, display_order: order } as ProductCategory);
const CATS = [cat('w', 1, 'Lingettes'), cat('d', 2, 'Dentifrice'), cat('a', 3, 'Alcool')];
const BR: Brand[] = [{ id: 'jw', slug: 'jw', name_fr: 'Johnnie Walker', name_en: 'Johnnie Walker', display_order: 1 }];
const p = (id: string, category_id: string, name: string, price: number, image_url: string | null = 'x', brand_id: string | null = null) =>
  ({ id, category_id, name_fr: name, name_en: name, price, image_url, brand_id } as Product);
const ctx = { categories: CATS, brands: BR, lang: 'fr' as const };
const LIST = [
  p('w1', 'w', 'Lingettes A', 3), p('w2', 'w', 'Lingettes B', 2), p('w3', 'w', 'Lingettes C', 4),
  p('d1', 'd', 'Dentifrice A', 5), p('a1', 'a', 'Whisky', 30, 'x', 'jw'),
];

describe('sortProducts', () => {
  it('featured: interleaves categories (A→Z) so the first screen is varied', () => {
    expect(sortProducts(LIST, 'featured', ctx).map((x) => x.id)).toEqual(['a1', 'd1', 'w1', 'w2', 'w3']);
  });
  it('category: categories A→Z by name, whatever their display order', () => {
    expect(sortProducts(LIST, 'category', ctx).map((x) => x.id)).toEqual(['a1', 'd1', 'w1', 'w2', 'w3']);
  });
  it('featured: photo products come first inside a category', () => {
    const l = [p('w1', 'w', 'A', 1, null), p('w2', 'w', 'B', 1, 'img')];
    expect(sortProducts(l, 'featured', ctx).map((x) => x.id)).toEqual(['w2', 'w1']);
  });
  it('price and name sorts', () => {
    expect(sortProducts(LIST, 'price_asc', ctx)[0].id).toBe('w2');
    expect(sortProducts(LIST, 'price_desc', ctx)[0].id).toBe('a1');
    expect(sortProducts(LIST, 'name_asc', ctx)[0].id).toBe('d1');
  });
  it('brand: branded first (A→Z), unbranded last', () => {
    const r = sortProducts(LIST, 'brand', ctx);
    expect(r[0].id).toBe('a1');
    expect(r.slice(1).map((x) => x.id)).toEqual(['d1', 'w1', 'w2', 'w3']);
  });
  it('does not mutate the input', () => {
    const copy = [...LIST];
    sortProducts(LIST, 'price_desc', ctx);
    expect(LIST).toEqual(copy);
  });
});

describe('matchesQuery', () => {
  it('matches name, brand and category, accent-insensitively, all words', () => {
    expect(matchesQuery(LIST[4], 'johnnie', ctx)).toBe(true);
    expect(matchesQuery(LIST[4], 'whisky walker', ctx)).toBe(true);
    expect(matchesQuery(LIST[0], 'lingette', ctx)).toBe(true);
    expect(matchesQuery(LIST[0], 'dentifrice', ctx)).toBe(false);
    expect(matchesQuery(LIST[0], '', ctx)).toBe(true);
  });
});
