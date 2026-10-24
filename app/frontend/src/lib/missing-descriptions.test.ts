import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { findMissingDescriptions, isMissing, planDescription } from './missing-descriptions';
import { extractDescription, isUsableDescription, looksBlocked, pageLanguage } from '../../supabase/functions/_shared/product-description';

const p = (id: string, fr: string | null, en: string | null) => ({
  id, name_fr: `Produit ${id}`, name_en: `Product ${id}`, slug_fr: `produit-${id}`, barcode: id === 'b' ? '5410000000001' : null,
  description_fr: fr, description_en: en,
});
const PRODUCTS = [p('a', null, null), p('b', 'Texte', null), p('c', null, 'Text'), p('d', 'Texte', 'Text'), p('e', '  ', '')];

describe('findMissingDescriptions', () => {
  it('filters by missing language', () => {
    const ids = (scope: Parameters<typeof isMissing>[1]) => findMissingDescriptions(PRODUCTS, scope).map((x) => x.id);
    expect(ids('any')).toEqual(['a', 'b', 'c', 'e']);
    expect(ids('fr')).toEqual(['a', 'c', 'e']);
    expect(ids('en')).toEqual(['a', 'b', 'e']);
    expect(ids('both')).toEqual(['a', 'e']);
  });
  it('searches name, slug and barcode, accents ignored', () => {
    expect(findMissingDescriptions(PRODUCTS, 'any', 'PRODUIT a').map((x) => x.id)).toEqual(['a']);
    expect(findMissingDescriptions(PRODUCTS, 'any', '541000').map((x) => x.id)).toEqual(['b']);
    expect(findMissingDescriptions([{ ...p('f', null, null), name_fr: 'Crème brûlée' }], 'any', 'creme').length).toBe(1);
  });
});

describe('planDescription', () => {
  it('French page: writes FR as is, translates EN, never overwrites', () => {
    expect(planDescription({ description_fr: null, description_en: null }, 'Texte FR', 'fr'))
      .toEqual({ patch: { description_fr: 'Texte FR' }, translate: [{ field: 'description_en', target: 'en' }], source: 'fr' });
    expect(planDescription({ description_fr: 'Déjà là', description_en: null }, 'Texte FR', 'fr'))
      .toEqual({ patch: {}, translate: [{ field: 'description_en', target: 'en' }], source: 'fr' });
  });
  it('Dutch page: both languages are translations, source detected by DeepL', () => {
    expect(planDescription({ description_fr: null, description_en: null }, 'Tekst', 'nl')).toEqual({
      patch: {}, translate: [{ field: 'description_fr', target: 'fr' }, { field: 'description_en', target: 'en' }], source: undefined,
    });
  });
  it('without "translate the other language", the French field is still filled in French', () => {
    expect(planDescription({ description_fr: null, description_en: null }, 'Text', 'en', false))
      .toEqual({ patch: { description_en: 'Text' }, translate: [{ field: 'description_fr', target: 'fr' }], source: 'en' });
    expect(planDescription({ description_fr: null, description_en: null }, 'Texte', null, false))
      .toEqual({ patch: { description_fr: 'Texte' }, translate: [], source: 'fr' });
  });
});

describe('extractDescription (Edge Function product-description)', () => {
  const LONG = 'Ce bundle Apple comprend l’iPhone 18 Pro 256 Go, pour des photos de qualité professionnelle.';
  it('prefers the JSON-LD Product description, as text', () => {
    const html = `<html lang="fr-BE"><head>
      <meta name="description" content="Achetez en ligne chez MediaMarkt">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList"},{"@type":"Product","name":"iPhone","description":"<p>${LONG}</p><ul><li>5G</li></ul>"}]}</script>
      </head></html>`;
    expect(extractDescription(html, 'https://www.mediamarkt.be/fr/product/x.html', 'iPhone'))
      .toEqual({ text: `${LONG}\n• 5G`, lang: 'fr', source: 'jsonld' });
  });
  it('falls back to the meta description and reads the language from the URL', () => {
    const html = `<head><meta property="og:description" content="Sì Parfum van Giorgio Armani, de meest intense uitdrukking van Sì."></head>`;
    expect(extractDescription(html, 'https://www.iciparisxl.be/nl/armani/si/p/BP_1')).toMatchObject({ lang: 'nl', source: 'meta' });
  });
  it('refuses store boilerplate, short texts and the product name', () => {
    expect(isUsableDescription('Découvrez le produit Vodka | 37.5% ALC. de la marque Smirnoff chez Delhaize dans la catégorie .')).toBe(false);
    expect(isUsableDescription('Toujours au meilleur prix. Voir toutes les informations sur les produits.')).toBe(false);
    expect(isUsableDescription('Trop court')).toBe(false);
    expect(isUsableDescription('Samsung Galaxy Tab S9 FE 128 Go Wi-Fi Gris argenté', 'SAMSUNG Galaxy Tab S9 FE 128 Go Wi-Fi Gris argenté')).toBe(false);
    expect(extractDescription('<meta name="description" content="Toujours au meilleur prix chez Colruyt, voir toutes les informations sur les produits">', 'https://www.colruyt.be/fr/produits/1')).toBeNull();
  });
  it('never takes a customer review or the store SEO line for the description (Electro Dépôt)', () => {
    const html = `<meta name="description" content="Besoin de Barbecue charbon ? Retrouvez votre Barbecue charbon VALBERG au meilleur prix chez ELECTRO DEPOT">
      <meta itemprop="description" content="" />
      <div itemprop="review"><span itemprop="description">Très satisfait de cet article, possibilité de le déplacer en fonction des besoins.</span></div>`;
    expect(extractDescription(html, 'https://www.electrodepot.be/fr/barbecue.html')).toBeNull();
  });
  it('tells a bot wall from a page without description', () => {
    expect(looksBlocked(405, '')).toBe(true);
    expect(looksBlocked(403, '')).toBe(true);
    expect(looksBlocked(200, '<div id="cf-chl-widget">')).toBe(true);
    expect(looksBlocked(200, '<html><body>Produit</body></html>')).toBe(false);
    expect(pageLanguage('<html lang="nl">', 'https://x.be/fr/p')).toBe('nl');
  });
});
