import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import {
  decodeCsvBytes, detectDelimiter, detectSourceFormat, diagnoseFile, looksLikeCents,
  parseDecimal, parseImportCsv, pickProfile, resolveStore,
} from './import-csv';
import { applyImportProfile, headerSignature, type ImportProfile } from './import-profile';
import { validateImportRow } from './import-validate';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

// Real Eloshon Scraper export (Delhaize vodka, 2026-10-21) and the same file
// after "Ouvrir le CSV" → re-saved: lines with quotes got wrapped again.
const ORIGINAL = fixture('eloshon-delhaize.csv');
const RESAVED = fixture('eloshon-delhaize-excel-resaved.csv');

const STORES = [
  { id: 's-lidl', slug: 'lidl', name: 'LIDL' },
  { id: 's-del', slug: 'delhaize', name: 'Delhaize' },
  { id: 's-ed', slug: 'electro-depot', name: 'Electro Dépôt' },
];
const CATS = [{ id: 'c-alc', slug: 'alcohol' }];

describe('reading the Eloshon export', () => {
  it('papaparse alone guesses "|" on the re-saved file (the bug)', () => {
    const { text } = decodeCsvBytes(RESAVED);
    const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    expect(res.meta.delimiter).toBe('|');
    expect(res.data[0].name_fr).toBeUndefined();
  });

  it('reads the re-saved file correctly: comma, all columns, wrapped lines decoded', () => {
    const { text, encoding } = decodeCsvBytes(RESAVED);
    expect(encoding).toBe('utf-8');
    const p = parseImportCsv(text);
    expect(p.delimiter).toBe(',');
    expect(p.headers).toContain('weight_estimated');
    expect(p.headers[0]).toBe('slug_fr');
    expect(p.unwrapped).toBeGreaterThan(0);
    expect(p.rows[0].name_fr).toBe('Eristoff | Vodka | Blanc | 37,5% ALC.');
    expect(p.rows[0].price).toBe('1599');
    expect(p.rows[0].store_slug).toBe('Delhaize');
    expect(p.rows[1].name_fr).toBe('Smirnoff | Vodka | 37.5% ALC.');
  });

  it('gives the same rows for the original and the re-saved file', () => {
    const a = parseImportCsv(decodeCsvBytes(ORIGINAL).text);
    const b = parseImportCsv(decodeCsvBytes(RESAVED).text);
    expect(b.rows.slice(0, a.rows.length)).toEqual(a.rows);
    expect(a.unwrapped).toBe(0);
  });

  it('recognises the Eloshon format and the store written as "Delhaize"', () => {
    const p = parseImportCsv(decodeCsvBytes(ORIGINAL).text);
    expect(detectSourceFormat(p.headers)).toBe('eloshon');
    expect(resolveStore(p.rows[0].store_slug, STORES)?.id).toBe('s-del');
  });

  it('flags the cents prices and the profile rule fixes them', () => {
    const p = parseImportCsv(decodeCsvBytes(ORIGINAL).text);
    expect(looksLikeCents(p.rows.map((r) => r.price))).toBe(true);
    const out = applyImportProfile(p.rows[0], { rules: { price_in_cents: true } }, [], { storeSlug: null, categorySlugById: new Map() });
    expect(out.raw.price).toBe('15.99');
  });

  it('imports a row once category and cents are fixed', () => {
    const p = parseImportCsv(decodeCsvBytes(ORIGINAL).text);
    const prof = applyImportProfile(p.rows[0], { rules: { price_in_cents: true } }, [], { storeSlug: null, categorySlugById: new Map() });
    const before = validateImportRow(prof.raw, CATS, STORES);
    expect(before.errors.map((e) => e.code)).toEqual(['missing_category']);
    const v = validateImportRow({ ...prof.raw, category_slug: 'alcohol' }, CATS, STORES);
    expect(v.errors).toEqual([]);
    expect(v.storeId).toBe('s-del');
    expect(v.data?.price).toBe(15.99);
    expect(v.data?.slug_fr).toMatch(/^eristoff-vodka-blanc/);
  });
});

describe('detectDelimiter', () => {
  it('uses the header line only', () => {
    expect(detectDelimiter('a,b,c\n"x | y | z",1,2')).toBe(',');
    expect(detectDelimiter('slug_fr;name_fr;price\na;Eau 1,5L;0,89')).toBe(';');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detectDelimiter('"slug_fr,name_fr,price"\n')).toBe(',');
  });
});

describe('parseImportCsv', () => {
  it('reads an Excel semicolon file with decimal commas', () => {
    const p = parseImportCsv('Slug_FR;Name_FR;Price\nspa;SPA Reine 1,5L;0,89\n');
    expect(p.headers).toEqual(['slug_fr', 'name_fr', 'price']);
    expect(p.rows[0]).toEqual({ slug_fr: 'spa', name_fr: 'SPA Reine 1,5L', price: '0,89' });
  });
  it('decodes a file whose header and rows are all wrapped', () => {
    const p = parseImportCsv('"slug_fr,name_fr,price"\n"a-1,""Eau 1,5L"",1.2"\n"b-2,Lait,0.9"\n');
    expect(p.rows).toEqual([
      { slug_fr: 'a-1', name_fr: 'Eau 1,5L', price: '1.2' },
      { slug_fr: 'b-2', name_fr: 'Lait', price: '0.9' },
    ]);
  });
  it('does not touch a normal row whose first cell has a comma', () => {
    const p = parseImportCsv('name_fr,price,weight_kg\n"Eau 1,5L",,\n');
    expect(p.unwrapped).toBe(0);
    expect(p.rows[0].name_fr).toBe('Eau 1,5L');
  });
});

describe('decodeCsvBytes', () => {
  it('falls back to Windows-1252 (Excel "CSV" save)', () => {
    const bytes = new Uint8Array([0x6e, 0x61, 0x6d, 0x65, 0x0a, 0x50, 0xe2, 0x74, 0xe9]); // "name\nPâté"
    expect(decodeCsvBytes(bytes)).toEqual({ text: 'name\nPâté', encoding: 'windows-1252' });
  });
  it('strips the UTF-8 BOM', () => {
    expect(decodeCsvBytes(new TextEncoder().encode('\uFEFFname_fr')).text).toBe('name_fr');
  });
});

describe('parseDecimal', () => {
  it.each([
    ['15,99', 15.99], ['15.99', 15.99], ['1 599,00 €', 1599], ['1.599,00', 1599], ['1,599.00', 1599], ['', null], ['abc', NaN],
  ])('%s → %s', (input, expected) => {
    expect(parseDecimal(input)).toEqual(expected);
  });
});

describe('diagnoseFile', () => {
  it('explains a file read as one column', () => {
    expect(diagnoseFile(['slug_fr,slug_en,name_fr'])).toEqual({ missing: ['name_fr', 'price'], singleColumn: true });
    expect(diagnoseFile(['name_fr', 'price'])).toBeNull();
  });
});

describe('pickProfile', () => {
  const cols21 = ['barcode', 'category_slug', 'color', 'description_en', 'description_fr', 'hs_code', 'image_url', 'is_alcoholic', 'name_en', 'name_fr', 'price', 'product_type', 'slug_en', 'slug_fr', 'source_category', 'source_product_id', 'source_url', 'storage_info', 'store_slug', 'variants', 'weight_kg'];
  const prof = (id: string, store_id: string | null, cols = cols21): ImportProfile =>
    ({ id, slug: id, name: id, header_signature: headerSignature(cols), store_id, rules: {} });

  it('keeps an exact column match first', () => {
    expect(pickProfile(cols21, 's-del', [prof('a', 's-del'), prof('b', null)])?.profile.id).toBe('a');
  });
  it('recognises a newer Eloshon export (extra column) by format and store', () => {
    const cols22 = [...cols21, 'weight_estimated'];
    const res = pickProfile(cols22, 's-del', [prof('lidl', 's-lidl'), prof('del', 's-del')]);
    expect(res).toEqual({ profile: expect.objectContaining({ id: 'del' }), how: 'format' });
    expect(pickProfile(cols22, 's-ed', [prof('lidl', 's-lidl'), prof('any', null)])?.profile.id).toBe('any');
    expect(pickProfile(cols22, 's-ed', [prof('lidl', 's-lidl')])).toBeNull();
  });
  it('never matches a non-Eloshon file by format', () => {
    expect(pickProfile(['name_fr', 'price'], null, [prof('any', null)])).toBeNull();
  });
});

describe('validateImportRow', () => {
  it('fills slugs and the English name instead of refusing the row', () => {
    const v = validateImportRow({ name_fr: 'Pâté Ardennais 200g', price: '2,49', category_slug: 'alcohol' }, CATS, STORES);
    expect(v.errors).toEqual([]);
    expect(v.data).toMatchObject({ slug_fr: 'pate-ardennais-200g', slug_en: 'pate-ardennais-200g', name_en: 'Pâté Ardennais 200g', price: 2.49 });
    expect(v.filled).toEqual(['name_en', 'slug_fr', 'slug_en']);
  });
  it('returns one code per problem', () => {
    const v = validateImportRow({ name_fr: '', price: 'abc', weight_kg: 'x', category_slug: 'nope', store_slug: 'COL' }, CATS, STORES);
    expect(v.errors.map((e) => e.code)).toEqual(['missing_name', 'bad_price', 'bad_weight', 'unknown_category']);
    expect(v.storeUnknown).toBe(true);
  });
});
