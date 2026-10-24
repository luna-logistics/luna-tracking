// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from '@/locales/fr.json';
import type { Product } from '@/lib/products';

const fetchSourceDescriptions = vi.fn();
const translateText = vi.fn(async (text: string, target: string) => ({ translation: `[${target}] ${text}`, translations: [`[${target}] ${text}`] }));
const updateProductFields = vi.fn(async () => undefined);

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/translate', () => ({ translateText: (t: string, l: string) => translateText(t, l) }));
vi.mock('@/lib/products', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/products')>()),
  updateProductFields: (id: string, patch: unknown) => updateProductFields(id, patch),
}));
vi.mock('@/lib/missing-descriptions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/missing-descriptions')>()),
  fetchSourceDescriptions: (ids: string[]) => fetchSourceDescriptions(ids),
}));

const product = (id: string, name: string, fr: string | null, en: string | null) => ({
  id, name_fr: name, name_en: name, slug_fr: id, slug_en: id, description_fr: fr, description_en: en, price: 1,
  category_id: 'c', barcode: null, hs_code: null, weight_kg: null, image_url: null, is_active: true,
  meta_title_fr: null, meta_title_en: null, meta_description_fr: null, meta_description_en: null,
}) as Product;
const PRODUCTS = [
  product('p1', 'LG OLED 65', null, null),
  product('p2', 'Dior Miss Dior', null, null),
  product('p3', 'Savon Dove', 'Déjà décrit', null),
  product('p4', 'Complet', 'FR', 'EN'),
];

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'fr', resources: { fr: { translation: fr } }, interpolation: { escapeValue: false } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('MissingDescriptionsPanel', () => {
  it('lists the products without description and narrows them by language and search', async () => {
    const { MissingDescriptionsPanel } = await import('./MissingDescriptionsPanel');
    render(<ul><MissingDescriptionsPanel products={PRODUCTS} onChanged={() => undefined} /></ul>);
    expect(screen.getByText(/3 produit\(s\) sans description : 2 sans description FR, 3 sans description EN/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Voir la liste (3)' }));
    expect(screen.getByText('Savon Dove')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Produits'), { target: { value: 'fr' } });
    expect(screen.queryByText('Savon Dove')).toBeNull();
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'dior' } });
    expect(screen.getByRole('button', { name: 'Masquer la liste' })).toBeTruthy();
    expect(screen.getByText('Dior Miss Dior')).toBeTruthy();
    expect(screen.queryByText('LG OLED 65')).toBeNull();
  });

  it('fills only the empty fields, translating the missing language', async () => {
    fetchSourceDescriptions.mockResolvedValue([
      { id: 'p1', status: 'found', description: 'Téléviseur OLED 65 pouces, processeur α9.', lang: 'fr' },
      { id: 'p2', status: 'found', description: 'Een frisse, bloemige eau de toilette.', lang: 'nl' },
      { id: 'p3', status: 'blocked' },
    ]);
    const onChanged = vi.fn();
    const { MissingDescriptionsPanel } = await import('./MissingDescriptionsPanel');
    render(<ul><MissingDescriptionsPanel products={PRODUCTS} onChanged={onChanged} /></ul>);
    fireEvent.click(screen.getByRole('button', { name: 'Chercher la description sur la page du magasin (3)' }));
    await screen.findByText(/Terminé : 2 produit\(s\) complété\(s\).*Site qui refuse Luna : 1/);
    expect(fetchSourceDescriptions).toHaveBeenCalledWith(['p1', 'p2', 'p3']);
    expect(updateProductFields).toHaveBeenCalledWith('p1', {
      description_fr: 'Téléviseur OLED 65 pouces, processeur α9.', description_en: '[en] Téléviseur OLED 65 pouces, processeur α9.',
    });
    expect(updateProductFields).toHaveBeenCalledWith('p2', {
      description_fr: '[fr] Een frisse, bloemige eau de toilette.', description_en: '[en] Een frisse, bloemige eau de toilette.',
    });
    expect(updateProductFields).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
