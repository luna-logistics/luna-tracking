import { describe, expect, it } from 'vitest';
import {
  applyImportProfile, categoryPrefixes, cleanDescription, descriptionPrice, findMapping,
  headerSignature, slugify, stripSlugSuffix, type CategoryMapping,
} from './import-profile';

const LIDL_HEADERS = 'slug_fr,slug_en,name_fr,name_en,description_fr,description_en,price,category_slug,barcode,hs_code,weight_kg,image_url,store_slug,source_url,source_product_id,source_category,product_type,storage_info,is_alcoholic,color,variants'.split(',');

const m = (source_category: string, extra: Partial<CategoryMapping>): CategoryMapping => ({
  id: source_category, profile_id: 'p', source_category, action: 'map', category_id: null, product_type: null, ...extra,
});

const mappings: CategoryMapping[] = [
  m('Home > Services de Lidl', { action: 'skip' }),
  m('Home > Aliments & boissons > Confiseries & snacks', { category_id: 'c-sweets', product_type: 'food' }),
  m('Home > Aliments & boissons > Céréales & pâtes à tartiner', { category_id: 'c-staples', product_type: 'food' }),
];
const ctx = { storeSlug: 'lidl', categorySlugById: new Map([['c-sweets', 'confiseries'], ['c-staples', 'staples']]) };
const profile = { rules: {} };

const row = (o: Record<string, string>) => ({
  slug_fr: '', slug_en: '', name_fr: '', name_en: '', description_fr: '', description_en: '', price: '',
  category_slug: '', store_slug: 'LIDL', source_category: '', product_type: '', ...o,
});

describe('headerSignature', () => {
  it('ignores order, case and whitespace', () => {
    expect(headerSignature([...LIDL_HEADERS].reverse().map((h) => ` ${h.toUpperCase()} `)))
      .toBe(headerSignature(LIDL_HEADERS));
  });
});

describe('category mapping', () => {
  it('lists prefixes most specific first', () => {
    expect(categoryPrefixes('A > B > C')).toEqual(['A > B > C', 'A > B', 'A']);
  });
  it('matches an ancestor path, longest first, never a partial segment', () => {
    expect(findMapping('Home > Aliments & boissons > Confiseries & snacks > Chocolat & barres chocolatées', mappings)?.category_id).toBe('c-sweets');
    expect(findMapping('Home > Aliments & boissons > Confiseries', mappings)).toBeNull();
    expect(findMapping(null, mappings)).toBeNull();
  });
});

describe('description cleanup', () => {
  it('reads and strips the scraper price suffix (with or without €)', () => {
    expect(descriptionPrice('Lard en tranches - 4.95 € (25.09.2026)')).toBe(4.95);
    expect(descriptionPrice('Épinards frais - 0.99 (25.09.2026)')).toBe(0.99);
    expect(descriptionPrice('Une vraie description')).toBeNull();
    expect(cleanDescription('Miel de fleurs liquide - 1.59 € (25.09.2026)', 'Miel de fleurs liquide')).toBe('');
    expect(cleanDescription('Bon miel crémeux - 1.59 € (25.09.2026)', 'Miel')).toBe('Bon miel crémeux');
  });
});

describe('slugs', () => {
  it('strips the scraper suffix, rebuilding truncated slugs on a word boundary', () => {
    expect(stripSlugSuffix('miel-de-fleurs-liquide-9gcetk', 'Miel de fleurs liquide')).toBe('miel-de-fleurs-liquide');
    const drill = stripSlugSuffix(
      'perceuse-visseuse-sans-fil-20-v-parkside-performance-ppabss2-kbrjeu',
      'Perceuse-visseuse sans fil, 20 V PARKSIDE PERFORMANCE® PPABSS20 »Signature Limited Edition«, avec batterie et chargeur',
    );
    expect(drill.length).toBeLessThanOrEqual(80);
    expect(drill).toMatch(/^perceuse-visseuse-sans-fil-20-v-parkside-performance-ppabss20-/);
    expect(drill.endsWith('-')).toBe(false);
  });
  it('never touches a slug that does not follow the scraper pattern', () => {
    expect(stripSlugSuffix('sucre-blanc', 'Farine')).toBe('sucre-blanc');
    expect(stripSlugSuffix('rice-basmati-5kg', 'Riz basmati 5 kg')).toBe('rice-basmati-5kg');
  });
  it('slugify cuts on a word boundary', () => {
    expect(slugify('Épinards frais')).toBe('epinards-frais');
    expect(slugify('aaa bbb ccc', 6)).toBe('aaa');
  });
});

describe('applyImportProfile on the real Lidl rows', () => {
  it('fixes a ×1000 price and maps the category + type', () => {
    const p = applyImportProfile(row({
      slug_fr: 'barres-chocolatees-9gceud', slug_en: 'barres-chocolatees-9gceud',
      name_fr: 'Barres chocolatées', name_en: 'Barres chocolatées', price: '1990',
      description_fr: 'Barres chocolatées - 1.99 (25.09.2026)', description_en: 'Barres chocolatées - 1.99 (25.09.2026)',
      source_category: 'Home > Aliments & boissons > Confiseries & snacks > Chocolat & barres chocolatées',
    }), profile, mappings, ctx);
    expect(p.raw.price).toBe('1.99');
    expect(p.raw.category_slug).toBe('confiseries');
    expect(p.raw.product_type).toBe('food');
    expect(p.raw.store_slug).toBe('lidl');
    expect(p.raw.slug_fr).toBe('barres-chocolatees');
    expect(p.raw.description_fr).toBe('');
    expect(p.priceProblem).toBeNull();
    expect(p.untranslated).toBe(true);
    expect(p.notes.join(' ')).toContain('×1000');
  });
  it('blocks an inconsistent price instead of guessing', () => {
    const p = applyImportProfile(row({ name_fr: 'Épinards frais', name_en: 'Épinards frais', price: '2.2',
      description_fr: 'Épinards frais - 0.99 (25.09.2026)' }), profile, mappings, ctx);
    expect(p.priceProblem).toContain('2.2');
    expect(p.raw.price).toBe('2.2');
  });
  it('skips a saved "skip" category (Newsletter)', () => {
    const p = applyImportProfile(row({ name_fr: 'Newsletter', price: '60', source_category: 'Home > Services de Lidl' }), profile, mappings, ctx);
    expect(p.skip).toContain('Services de Lidl');
  });
  it('flags an unmapped category', () => {
    const p = applyImportProfile(row({ name_fr: 'Lard', price: '4.95', source_category: 'Home > Aliments & boissons > Viande & volaille' }), profile, mappings, ctx);
    expect(p.unmapped).toBe(true);
    expect(p.skip).toBeNull();
  });
  it('keeps an explicit category_slug / product_type from the CSV', () => {
    const p = applyImportProfile(row({ name_fr: 'Miel', price: '1.59', category_slug: 'canned', product_type: 'other',
      source_category: 'Home > Aliments & boissons > Céréales & pâtes à tartiner > Confitures' }), profile, mappings, ctx);
    expect(p.raw.category_slug).toBe('canned');
    expect(p.raw.product_type).toBe('other');
  });
  it('refuses implausible prices', () => {
    const p = applyImportProfile(row({ name_fr: 'X', price: '99999' }), { rules: { max_price: 5000 } }, [], ctx);
    expect(p.priceProblem).toContain('improbable');
  });
});
