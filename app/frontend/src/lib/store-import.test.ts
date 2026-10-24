import { describe, expect, it } from 'vitest';
import { categoryGroupKey, isGenericDescription, applyImportProfile } from './import-profile';

describe('categoryGroupKey', () => {
  it('drops a trailing segment that is the product itself', () => {
    expect(categoryGroupKey('Produits > Charcuterie > Jambon cuit > BONI jambon cuit', 'BONI jambon cuit 150g')).toBe('Produits > Charcuterie > Jambon cuit');
  });
  it('keeps a real category path', () => {
    expect(categoryGroupKey('Produits > Charcuterie > Jambon cuit', 'BONI jambon cuit 150g')).toBe('Produits > Charcuterie > Jambon cuit');
    expect(categoryGroupKey('Produits > Boissons > Eaux', 'SPA Reine 1,5L')).toBe('Produits > Boissons > Eaux');
  });
});

describe('generic description rule', () => {
  it('recognises the store blurb', () => {
    expect(isGenericDescription('Toujours au meilleur prix. Voir toutes les informations sur les produits…')).toBe(true);
    expect(isGenericDescription('Jambon cuit supérieur, sans nitrite.')).toBe(false);
  });
  it('empties it during profiling', () => {
    const r = applyImportProfile(
      { name_fr: 'X', name_en: 'X', description_fr: 'Toujours au meilleur prix. Ajoutez directement à votre liste.', price: '1' },
      { rules: {} }, [], { storeSlug: null, categorySlugById: new Map() },
    );
    expect(r.raw.description_fr).toBe('');
    expect(r.notes).toContain('texte générique du magasin retiré');
  });
});
