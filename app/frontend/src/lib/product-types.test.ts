import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { isLunaEligibleProduct } from './product-eligibility';
import { validateImportRow } from './import-validate';
import { BUILTIN_PRODUCT_TYPES, isBuiltinType, productTypeSlug, withProductType } from './product-types';

const base = { name_fr: 'Samsung Galaxy Tab A9', name_en: 'Samsung Galaxy Tab A9' };

describe('productTypeSlug', () => {
  it('follows the table rule (a-z, 0-9, dashes, 40 chars max)', () => {
    expect(productTypeSlug('Parfum & beauté')).toBe('parfum-beaute');
    expect(productTypeSlug('  Électronique ')).toBe('electronique');
    expect(productTypeSlug('x'.repeat(60))).toHaveLength(40);
    expect(productTypeSlug('!!!')).toBe('');
  });
});

describe('built-in and created types', () => {
  it('keeps the five types of the code as built-in', () => {
    expect(BUILTIN_PRODUCT_TYPES.map((t) => t.slug).every(isBuiltinType)).toBe(true);
    expect(isBuiltinType('electronique')).toBe(false);
  });
  it('adds a created type in display order', () => {
    const list = withProductType(BUILTIN_PRODUCT_TYPES, { slug: 'electronique', name_fr: 'Électronique', name_en: 'Electronics', auto_accept: true, display_order: 50 });
    expect(list.map((t) => t.slug)).toEqual(['food', 'hygiene', 'household', 'clothing', 'electronique', 'other']);
  });
});

describe('eligibility with a type the admin created', () => {
  it('an unknown type stays "unknown type" when Luna has not declared it', () => {
    expect(isLunaEligibleProduct({ ...base, product_type: 'electronique' }).code).toBe('to_verify_unknown_type');
  });
  it('a created type is known: to verify, or accepted when auto_accept is on', () => {
    expect(isLunaEligibleProduct({ ...base, product_type: 'electronique' }, [{ slug: 'electronique', auto_accept: false }]))
      .toMatchObject({ status: 'to_verify', code: 'to_verify_no_rules' });
    expect(isLunaEligibleProduct({ ...base, product_type: 'electronique' }, [{ slug: 'electronique', auto_accept: true }]))
      .toMatchObject({ status: 'accepted', code: 'accepted_type_auto' });
  });
  it('never lets a created type override the food rules', () => {
    const r = isLunaEligibleProduct({ name_fr: 'Saumon frais', name_en: 'Fresh salmon', product_type: 'food' }, [{ slug: 'food', auto_accept: true }]);
    expect(r.status).toBe('excluded');
  });
  it('reaches the import validation', () => {
    const row = { name_fr: 'Galaxy Tab A9', price: '199', category_slug: 'tablets', product_type: 'electronique' };
    const v = validateImportRow(row, [{ id: 'c1', slug: 'tablets' }], [], [{ slug: 'electronique', auto_accept: true }]);
    expect(v.errors).toEqual([]);
    expect(v.eligibility.status).toBe('accepted');
  });
});
