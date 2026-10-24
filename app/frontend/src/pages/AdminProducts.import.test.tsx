// @vitest-environment jsdom
/**
 * The CSV import screen, end to end in the browser DOM, with the real file
 * that showed every row as "Erreur" (Eloshon Scraper Delhaize export after
 * a pass through Excel). Only the data layer (Supabase) is mocked.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from '@/locales/fr.json';
import { headerSignature } from '@/lib/import-profile';

const CATEGORIES = [
  { id: 'c-drinks', slug: 'drinks', name_fr: 'Boissons', name_en: 'Drinks', display_order: 1, parent_id: null },
  { id: 'c-alc', slug: 'alcohol', name_fr: 'Alcool', name_en: 'Alcohol', display_order: 1, parent_id: 'c-drinks' },
];
const STORES = [
  { id: 's-lidl', slug: 'lidl', name: 'LIDL', logo_url: null, store_type: 'supermarket', country: 'BE', is_active: true, display_order: 1 },
  { id: 's-del', slug: 'delhaize', name: 'Delhaize', logo_url: null, store_type: 'supermarket', country: 'BE', is_active: true, display_order: 2 },
];
// The saved profile as it is in production: 21 columns (before the scraper
// added weight_estimated), no store.
const COLS21 = 'barcode|category_slug|color|description_en|description_fr|hs_code|image_url|is_alcoholic|name_en|name_fr|price|product_type|slug_en|slug_fr|source_category|source_product_id|source_url|storage_info|store_slug|variants|weight_kg';
const PROFILE = { id: 'p1', slug: 'eloshon-scraper-lidl', name: 'Eloshon Scraper — Lidl', header_signature: headerSignature(COLS21.split('|')), store_id: null, rules: {} };

const upsertProduct = vi.fn(async (p: Record<string, unknown>) => ({ id: `new-${String(p.slug_fr)}`, ...p }));
const upsertProductSource = vi.fn(async () => undefined);

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
  upsertProductSource: () => upsertProductSource(),
}));
vi.mock('@/lib/import-profiles-db', () => ({
  fetchImportProfiles: async () => [PROFILE],
  fetchCategoryMappings: async () => [],
  createImportProfile: vi.fn(),
  updateImportProfile: vi.fn(async () => undefined),
  saveCategoryMapping: vi.fn(),
  deleteCategoryMapping: vi.fn(),
  findProductBySource: async () => null,
  updateProductFromSource: vi.fn(),
}));

const fixture = readFileSync(path.resolve(__dirname, '../lib/__fixtures__/eloshon-delhaize-excel-resaved.csv'));

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'fr', resources: { fr: { translation: fr } }, interpolation: { escapeValue: false } });
});
afterEach(cleanup);

async function openImportWithFile() {
  const { default: AdminProducts } = await import('./AdminProducts');
  const { container } = render(<AdminProducts />);
  fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  await waitFor(() => expect(screen.getByText(/Choisir un fichier CSV/)).toBeTruthy());
  // Let stores + profiles load before the file arrives (as for a human).
  await new Promise((r) => setTimeout(r, 0));
  fireEvent.change(input, { target: { files: [new File([fixture], 'vodka delhaize.csv', { type: 'text/csv' })] } });
  await screen.findByText(/Fichier lu : 5 lignes, 22 colonnes, séparateur « , »/);
  return container;
}

describe('CSV import screen — Eloshon Delhaize export re-saved in Excel', () => {
  it('reads every row (no all-empty "Erreur" rows) and recognises the profile by format', async () => {
    const container = await openImportWithFile();
    expect(screen.queryByText(/ne peut pas être importé tel quel/)).toBeNull();
    expect(screen.getByText(/format Eloshon Scraper reconnu/)).toBeTruthy();
    expect((screen.getByLabelText('Profil') as HTMLSelectElement).value).toBe('p1');
    // Names are read; the only remaining problem is the Luna category.
    expect(screen.getAllByText('Eristoff | Vodka | Blanc | 37,5% ALC.').length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/name_fr required|slug_fr required/);
    expect(screen.getByText('Lignes à corriger (5)')).toBeTruthy();
    expect(screen.getAllByText('Pas de catégorie Luna.').length).toBeGreaterThan(0);
    expect(screen.getByText(/Les prix semblent écrits en centimes/)).toBeTruthy();
  });

  it('bulk-fixes category + type + cents and imports the rows', async () => {
    const container = await openImportWithFile();
    fireEvent.click(screen.getByRole('button', { name: 'Diviser les prix par 100' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner ces 5 lignes' }));
    await screen.findByText('5 ligne(s) sélectionnée(s)');
    fireEvent.change(container.querySelector('#imp-bulk-cat')!, { target: { value: 'alcohol' } });
    fireEvent.change(container.querySelector('#imp-bulk-type')!, { target: { value: 'food' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    await waitFor(() => expect(screen.queryByText(/Lignes à corriger/)).toBeNull());
    fireEvent.change(screen.getByLabelText('Afficher'), { target: { value: 'all' } });
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('15.99 €').length).toBe(1);
    // Spirits are shelf-stable food: accepted by the unchanged eligibility filter.
    const btn = await screen.findByRole('button', { name: /Importer \d+ produits acceptés/ });
    const n = Number(/Importer (\d+)/.exec(btn.textContent ?? '')?.[1]);
    expect(n).toBeGreaterThan(0);
    fireEvent.click(btn);
    await waitFor(() => expect(upsertProduct).toHaveBeenCalledTimes(n));
    expect(upsertProduct.mock.calls[0][0]).toMatchObject({
      name_fr: 'Eristoff | Vodka | Blanc | 37,5% ALC.', price: 15.99, category_id: 'c-alc', store_id: 's-del', is_active: false,
    });
  });
});
