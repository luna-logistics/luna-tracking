import { describe, expect, it } from 'vitest';
import { buildMetaFeed, FEED_COLUMNS } from './meta-feed.mjs';

const cats = [
  { id: 'h', slug: 'hygiene', name_fr: 'Hygiène', name_en: 'Hygiene', parent_id: null },
  { id: 'd', slug: 'deodorant', name_fr: 'Déodorant', name_en: 'Deodorant', parent_id: 'h' },
  { id: 'a', slug: 'alcohol', name_fr: 'Alcool', name_en: 'Alcohol', parent_id: null },
  { id: 'i', slug: 'intimate', name_fr: 'Intimité', name_en: 'Intimate', parent_id: 'h' },
];
const brands = [{ id: 'b1', name_fr: 'AXE', name_en: 'AXE' }];
const p = (o: object) => ({ id: 'x', slug_fr: 'axe-deo', slug_en: 'axe-deo-en', name_fr: 'AXE deo 150ml', name_en: 'AXE deodorant 150ml', description_fr: null, description_en: null, price: 3.5, image_url: 'https://img/x.jpg', category_id: 'd', brand_id: 'b1', is_active: true, is_alcoholic: false, ...o });
const parse = (csv: string) => csv.trim().split('\r\n');

describe('buildMetaFeed', () => {
  it('writes the header and one complete row per eligible product', () => {
    const { csv, included } = buildMetaFeed([p({ id: 'u1' })], brands, cats);
    const [head, row] = parse(csv);
    expect(head).toBe(FEED_COLUMNS.map((c) => `"${c}"`).join(','));
    expect(included).toBe(1);
    expect(row).toContain('"u1"');
    expect(row).toContain('"3.50 EUR"');
    expect(row).toContain('"https://lunatrackinglogistics.com/achat-envoi/axe-deo"');
    expect(row).toContain('"in stock","new"');
    expect(row).toContain('"AXE"');
    expect(row).toContain('"Hygiène > Déodorant"');
    expect(row).toContain('Acheté en Belgique et livré en RDC.');
  });

  it('English feed uses EN names, slugs and path', () => {
    const { csv } = buildMetaFeed([p({})], brands, cats, { lang: 'en' });
    expect(csv).toContain('/en/shop-and-ship/axe-deo-en');
    expect(csv).toContain('AXE deodorant 150ml');
    expect(csv).toContain('Hygiene > Deodorant');
  });

  it('leaves out alcohol, restricted categories, no photo, no price, inactive', () => {
    const { included, skipped } = buildMetaFeed([
      p({ id: '1', category_id: 'a' }),
      p({ id: '2', is_alcoholic: true }),
      p({ id: '3', category_id: 'i' }),
      p({ id: '4', image_url: '' }),
      p({ id: '5', price: 0 }),
      p({ id: '6', is_active: false }),
      p({ id: '7' }),
    ], brands, cats);
    expect(included).toBe(1);
    expect(skipped).toMatchObject({ alcohol: 2, restricted_category: 1, no_image: 1, no_price: 1, inactive: 1 });
  });

  it('escapes quotes and flattens line breaks', () => {
    const { csv } = buildMetaFeed([p({ name_fr: 'Gel "Fresh"\n250ml' })], brands, cats);
    expect(csv).toContain('"Gel ""Fresh"" 250ml"');
  });
});
