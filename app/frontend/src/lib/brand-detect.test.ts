import { describe, expect, it } from 'vitest';
import type { Brand, Product } from './products';
import { brandSlug, detectBrandInText, detectExistingBrands, matchBrandName, normalizeBrandText, suggestNewBrands } from './brand-detect';

const b = (id: string, name: string): Brand => ({ id, slug: brandSlug(name), name_fr: name, name_en: name, display_order: 1 });
const BRANDS = [b('jd', "Jack Daniel's"), b('ob', 'OB'), b('hs', 'HEAD&SHOULDERS'), b('lo', "L'OREAL"), b('ox', 'ORAL-B'), b('ax', 'AXE')];
const p = (id: string, name: string, brand_id: string | null = null) => ({ id, name_fr: name, name_en: name, brand_id } as Product);

describe('brand detection', () => {
  it('normalises punctuation, accents and apostrophes', () => {
    expect(normalizeBrandText("Jack Daniel's")).toBe('jack daniels');
    expect(normalizeBrandText('ORAL-B')).toBe('oral b');
    expect(normalizeBrandText("L'Oréal Paris")).toBe('loreal paris');
  });

  it('finds whole-word brands in names', () => {
    expect(detectBrandInText("Whisky Jack Daniels Old No.7 70cl", BRANDS)?.id).toBe('jd');
    expect(detectBrandInText('Oral-B Pro Expert brosse', BRANDS)?.id).toBe('ox');
    expect(detectBrandInText('Head & Shoulders Classic 250ml', BRANDS)?.id).toBe('hs');
    expect(detectBrandInText("Elseve L'Oréal Paris", BRANDS)?.id).toBe('lo');
    expect(detectBrandInText('Déodorant AXE Africa 150ml', BRANDS)?.id).toBe('ax');
  });

  it('does not match inside another word, and short names only at the start', () => {
    expect(detectBrandInText('Taxer cleaner', BRANDS)).toBeNull();
    expect(detectBrandInText('Gel douche Bob', BRANDS)).toBeNull();
    expect(detectBrandInText('OB ProComfort Normal', BRANDS)?.id).toBe('ob');
  });

  it('matches an explicit brand string exactly', () => {
    expect(matchBrandName('oral-b', BRANDS)?.id).toBe('ox');
    expect(matchBrandName('Inconnue', BRANDS)).toBeNull();
    expect(matchBrandName('', BRANDS)).toBeNull();
  });

  it('groups unbranded products by detected existing brand', () => {
    const res = detectExistingBrands([p('1', 'AXE Black'), p('2', 'AXE Gold'), p('3', 'AXE Dark', 'ax'), p('4', 'Sans marque')], BRANDS);
    expect(res).toHaveLength(1);
    expect(res[0].productIds).toEqual(['1', '2']);
  });

  it('suggests new brands from repeated first words, skipping generic words', () => {
    const list = [
      p('1', 'Vichy Gel douche'), p('2', 'Vichy Shampoing'), p('3', 'Vichy Crème'),
      p('4', 'Lingettes bébé'), p('5', 'Lingettes femme'), p('6', 'Lingettes visage'),
      p('7', 'Dettol Spray'), p('8', 'Dettol Gel'),
    ];
    const res = suggestNewBrands(list, BRANDS);
    expect(res.map((r) => r.token)).toEqual(['vichy']);
    expect(res[0].label).toBe('Vichy');
    expect(res[0].productIds).toEqual(['1', '2', '3']);
  });
});
