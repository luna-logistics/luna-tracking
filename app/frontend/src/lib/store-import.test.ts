import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { unwrapDoubleEncodedRows } from './store-import';
import { categoryGroupKey, isGenericDescription, applyImportProfile } from './import-profile';

const parseLine = (line: string) => (Papa.parse<string[]>(line, { header: false }).data[0] ?? []) as string[];

describe('unwrapDoubleEncodedRows', () => {
  it('decodes rows that were quoted a second time', () => {
    const csv = 'slug_fr,name_fr,price\n"a-1,""Eau 1,5L"",1.2"\n"b-2,Lait,0.9"\n';
    const res = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    const out = unwrapDoubleEncodedRows(res.meta.fields ?? [], res.data, parseLine);
    expect(out).toEqual([
      { slug_fr: 'a-1', name_fr: 'Eau 1,5L', price: '1.2' },
      { slug_fr: 'b-2', name_fr: 'Lait', price: '0.9' },
    ]);
  });
  it('leaves a normal CSV alone', () => {
    const res = Papa.parse<Record<string, string>>('slug_fr,name_fr\na,"Eau 1,5L"\n', { header: true, skipEmptyLines: true });
    expect(unwrapDoubleEncodedRows(res.meta.fields ?? [], res.data, parseLine)).toBeNull();
  });
});

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
