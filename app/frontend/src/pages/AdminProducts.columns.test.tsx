// @vitest-environment jsdom
/**
 * The CSV import screen with a MediaMarkt file from the Eloshon browser
 * extension (labelled columns "Nom", "Prix", "Lien"…): Luna recognises the
 * columns, drops the PDF data-sheet rows, reads the store from the link and
 * files the products; the admin creates a product type on the spot and
 * imports. Only the data layer (Supabase) is mocked.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from '@/locales/fr.json';

const CATEGORIES = [
  { id: 'c-elec', slug: 'electronics', name_fr: 'Électronique', name_en: 'Electronics', display_order: 1, parent_id: null },
  { id: 'c-gsm', slug: 'gsm-smartphones', name_fr: 'Gsm-Smartphones', name_en: 'Smartphones', display_order: 1, parent_id: 'c-elec' },
  { id: 'c-tab', slug: 'computers-tablets', name_fr: 'Ordinateurs & tablettes', name_en: 'Computers & tablets', display_order: 2, parent_id: 'c-elec' },
  { id: 'c-sort', slug: 'a-classer', name_fr: 'À classer', name_en: 'To sort', display_order: 999, parent_id: null },
];
const STORES = [
  { id: 's-mm', slug: 'mediamarkt', name: 'Mediamarkt', logo_url: null, store_type: 'other', country: 'BE', is_active: true, display_order: 1 },
];
const CSV = [
  '"Description","Prix","Prix barré","Marque","Collection","Image","Lien","Référence","Nom"',
  '"","1538 EUR","","APPLE","Téléphone & Objets connectés","https://assets.mmsrg.com/isr/1.webp","https://www.mediamarkt.be/fr/product/_apple-iphone-18-pro-2254165.html","2254165","APPLE iPhone 18 Pro - 256 GB"',
  '"","215 EUR","","","Ordinateur > Tablette","https://assets.mmsrg.com/isr/3.webp","https://assets.mmsrg.com/ada/166325/c1/-/-/ASSET_MMS_174160572/?direct","ASSET_MMS_174160572","Fiche technique du produit"',
  '"","329 EUR","","SAMSUNG","Ordinateur > Tablette","https://assets.mmsrg.com/isr/4.webp","https://www.mediamarkt.be/fr/product/_samsung-galaxy-tab-s9-fe-1.html","1","SAMSUNG Galaxy Tab S9 FE"',
].join('\n');

const upsertProduct = vi.fn(async (p: Record<string, unknown>) => ({ id: `new-${String(p.slug_fr)}`, ...p }));
const createProductType = vi.fn(async (p: { name_fr: string; name_en: string; auto_accept: boolean }) => ({
  slug: 'electronique', name_fr: p.name_fr, name_en: p.name_en || p.name_fr, auto_accept: p.auto_accept, display_order: 100,
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/components/SEO', () => ({ SEO: () => null }));
vi.mock('@/components/ProductEnrichPanel', () => ({ ProductEnrichPanel: () => null }));
vi.mock('@/components/CategoryAutoSort', () => ({ CategoryAutoSort: () => null }));
vi.mock('@/components/BrandAutoDetect', () => ({ BrandAutoDetect: () => null }));
vi.mock('@/lib/translate', () => ({ translateText: vi.fn() }));
vi.mock('@/lib/products', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/products')>()),
  fetchAllProducts: async () => [],
  fetchProductCategories: async () => CATEGORIES,
  fetchBrands: async () => [],
  fetchStores: async () => STORES,
  upsertProduct: (p: Record<string, unknown>) => upsertProduct(p),
  upsertProductSource: async () => undefined,
}));
vi.mock('@/lib/import-profiles-db', () => ({
  fetchImportProfiles: async () => [],
  fetchCategoryMappings: async () => [],
  createImportProfile: vi.fn(),
  updateImportProfile: vi.fn(),
  saveCategoryMapping: vi.fn(),
  deleteCategoryMapping: vi.fn(),
  findProductBySource: async () => null,
  updateProductFromSource: vi.fn(),
}));
vi.mock('@/lib/product-types', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/product-types')>();
  return { ...real, fetchProductTypes: async () => real.BUILTIN_PRODUCT_TYPES, createProductType: (p: never) => createProductType(p) };
});

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'fr', resources: { fr: { translation: fr } }, interpolation: { escapeValue: false } });
});
afterEach(cleanup);

describe('CSV import screen — MediaMarkt export of the Eloshon extension', () => {
  it('recognises the columns, then imports after creating a product type', { timeout: 20000 }, async () => {
    const { default: AdminProducts } = await import('./AdminProducts');
    const { container } = render(<AdminProducts />);
    fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
    await waitFor(() => expect(screen.getByText(/Choisir un fichier CSV/)).toBeTruthy());
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File([CSV], 'eloshon-export.csv', { type: 'text/csv' })] } });

    await screen.findByText('Colonnes reconnues');
    expect(screen.getByText(/nom → name_fr/)).toBeTruthy();
    expect(screen.getByText(/1 ligne\(s\) retirée\(s\)/)).toBeTruthy();
    // Nothing to fix: no file diagnostic, no error group.
    expect(screen.queryByText(/ne peut pas être importé tel quel/)).toBeNull();
    expect(screen.queryByText(/Lignes à corriger/)).toBeNull();
    expect(screen.getByText(/2 produit\(s\) classé\(s\) d'après la catégorie du magasin/)).toBeTruthy();

    // No product type in the file → "to verify". Create "Électronique" (accepted without review) for both rows.
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner ces 2 lignes' }));
    await screen.findByText('2 ligne(s) sélectionnée(s)');
    fireEvent.change(container.querySelector('#imp-bulk-type')!, { target: { value: '__new__' } });
    fireEvent.change(screen.getByPlaceholderText('ex. Électronique'), { target: { value: 'Électronique' } });
    fireEvent.click(screen.getByLabelText('Accepter ses produits sans vérification'));
    fireEvent.click(screen.getByRole('button', { name: 'Créer le type' }));
    await waitFor(() => expect(createProductType).toHaveBeenCalledWith({ name_fr: 'Électronique', name_en: '', auto_accept: true }));
    await waitFor(() => expect((container.querySelector('#imp-bulk-type') as HTMLSelectElement).value).toBe('electronique'));
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    const btn = await screen.findByRole('button', { name: /Importer 2 produits acceptés/ });
    fireEvent.click(btn);
    await waitFor(() => expect(upsertProduct).toHaveBeenCalledTimes(2));
    expect(upsertProduct.mock.calls.map((c) => c[0])).toEqual([
      expect.objectContaining({ name_fr: 'APPLE iPhone 18 Pro - 256 GB', price: 1538, category_id: 'c-gsm', store_id: 's-mm', is_active: false }),
      expect.objectContaining({ name_fr: 'SAMSUNG Galaxy Tab S9 FE', price: 329, category_id: 'c-tab', store_id: 's-mm' }),
    ]);
  });
});
