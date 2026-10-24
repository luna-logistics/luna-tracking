import { describe, expect, it } from 'vitest';
import { parseImportCsv } from './import-csv';
import { validateImportRow } from './import-validate';
import { detectCategoryFromSource } from './category-detect';
import {
  cleanPrice, firstUrl, htmlToText, lunaColumnFor, notAProductReason, recognizeColumns, specsToText, storeFromUrl, urlLanguage,
} from './import-columns';

const STORES = [
  { id: 's-lidl', slug: 'lidl', name: 'LIDL' },
  { id: 's-col', slug: 'colruyt', name: 'Colruyt' },
  { id: 's-ed', slug: 'electro-depot', name: 'Electro Dépôt' },
  { id: 's-mm', slug: 'mediamarkt', name: 'Mediamarkt' },
  { id: 's-del', slug: 'delhaize', name: 'Delhaize' },
  { id: 's-ici', slug: 'ici-paris-xl', name: 'ICI Paris XL' },
  { id: 's-adi', slug: 'adidas', name: 'adidas' },
];
const CATEGORIES = [
  { id: 'c-elec', slug: 'electronics' }, { id: 'c-tab', slug: 'computers-tablets' }, { id: 'c-gsm', slug: 'gsm-smartphones' },
  { id: 'c-tv', slug: 'televisions' }, { id: 'c-hyg', slug: 'hygiene' }, { id: 'c-frag', slug: 'fragrance' },
  { id: 'c-sort', slug: 'a-classer' },
];

/** Eloshon browser-extension export ("Exporter CSV"): labelled columns, every cell quoted. */
const EXTENSION_CSV = [
  '"Description","Prix","Prix barré","Marque","Collection","Image","Lien","Référence","Nom","Caractéristiques techniques"',
  '"","1538 EUR","1 599,00 €","APPLE","Téléphone & Objets connectés","https://assets.mmsrg.com/isr/1.webp, https://assets.mmsrg.com/isr/2.webp","https://www.mediamarkt.be/fr/product/_apple-iphone-18-pro-2254165.html","2254165","APPLE iPhone 18 Pro - 256 GB","Écran : 6,3 pouces ; Stockage : 256 Go"',
  '"","215 EUR","","","Ordinateur > Tablette","https://assets.mmsrg.com/isr/3.webp","https://assets.mmsrg.com/ada/166325/c1/-/-/ASSET_MMS_174160572/?direct","ASSET_MMS_174160572","Fiche technique du produit",""',
].join('\n');

/** Eloshon app export, 28 columns (2026-10-24): trailing brand … technical_specs. */
const APP_HEADER = 'slug_fr,slug_en,name_fr,name_en,description_fr,description_en,price,category_slug,barcode,hs_code,weight_kg,image_url,store_slug,source_url,source_product_id,source_category,product_type,storage_info,is_alcoholic,color,variants,weight_estimated,brand,availability,rating,review_count,net_content,technical_specs';
const appRow = (cells: Record<string, string>) => APP_HEADER.split(',').map((c) => {
  const v = cells[c] ?? '';
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}).join(',');

describe('column labels', () => {
  it('maps French, English and Dutch labels to Luna columns, Luna names unchanged', () => {
    expect(lunaColumnFor('Nom')).toBe('name_fr');
    expect(lunaColumnFor('Prix barré')).toBe('list_price');
    expect(lunaColumnFor('Caractéristiques techniques')).toBe('technical_specs');
    expect(lunaColumnFor('EAN')).toBe('barcode');
    expect(lunaColumnFor('Lien')).toBe('source_url');
    expect(lunaColumnFor('Merk')).toBe('brand');
    expect(lunaColumnFor('Variantes')).toBe('variants');
    expect(lunaColumnFor('name_fr')).toBe('name_fr');
    expect(lunaColumnFor('Couleur préférée du chat')).toBeNull();
  });
});

describe('values', () => {
  it('cleans prices written with a currency', () => {
    expect(cleanPrice('1538 EUR')).toBe('1538');
    expect(cleanPrice('119,99 €')).toBe('119,99');
    expect(cleanPrice('À partir de 12,99 €')).toBe('12,99');
    expect(cleanPrice('15.99')).toBe('15.99');
  });
  it('keeps the first image of a list', () => {
    expect(firstUrl('https://a/1.jpg, https://a/2.jpg')).toBe('https://a/1.jpg');
    expect(firstUrl('https://a/1.jpg | https://a/2.jpg')).toBe('https://a/1.jpg');
  });
  it('turns an HTML description into text', () => {
    expect(htmlToText('Sì Parfum<br><br>Omarm de kracht &amp; elegantie')).toBe('Sì Parfum\n\nOmarm de kracht & elegantie');
    expect(htmlToText('<p>Un</p><ul><li>deux</li><li>trois</li></ul>')).toBe('Un\n• deux\n• trois');
    expect(htmlToText('Pas de balise')).toBe('Pas de balise');
  });
  it('writes technical specs (JSON or text) as one line', () => {
    expect(specsToText('{"Type de produit":"Pack smartphone","Caractéristiques techniques · Système":"iOS","Liste":["a"]}'))
      .toBe('Type de produit : Pack smartphone · Système : iOS');
    expect(specsToText('Écran : 6,3 pouces ; Stockage : 256 Go')).toBe('Écran : 6,3 pouces · Stockage : 256 Go');
  });
  it('reads the language of a page from its URL', () => {
    expect(urlLanguage('https://www.iciparisxl.be/nl/armani/si/p/BP_1')).toBe('nl');
    expect(urlLanguage('https://www.lidl.be/c/fr-BE/abonner/s1')).toBeNull();
    expect(urlLanguage('https://www.mediamarkt.be/fr/product/x.html')).toBe('fr');
  });
  it('finds the store from the site of the product link', () => {
    expect(storeFromUrl('https://www.mediamarkt.be/fr/product/x.html', STORES)?.slug).toBe('mediamarkt');
    expect(storeFromUrl('https://www.iciparisxl.be/fr/dior/p/BP_1', STORES)?.slug).toBe('ici-paris-xl');
    expect(storeFromUrl('https://www.electrodepot.be/fr/tv.html', STORES)?.slug).toBe('electro-depot');
    expect(storeFromUrl('https://ecgproductsearchmw.colruytgroup.com/x', STORES)?.slug).toBe('colruyt');
    expect(storeFromUrl('https://www.adidas.be/fr/chaussure/IF6490.html', STORES)?.slug).toBe('adidas');
    expect(storeFromUrl('https://www.nike.com/be/t/x', STORES)).toBeNull();
    expect(storeFromUrl('pas une url', STORES)).toBeNull();
  });
  it('spots rows that are not products', () => {
    expect(notAProductReason({ name_fr: 'Fiche technique du produit', source_url: 'https://assets.mmsrg.com/ada/1/?direct' })).toBe('not_a_product');
    expect(notAProductReason({ name_fr: 'Newsletter', source_url: 'https://www.lidl.be/c/fr-BE/abonner/s10008105' })).toBe('not_a_product');
    expect(notAProductReason({ name_fr: 'Notice', source_url: 'https://x/notice.pdf' })).toBe('not_a_product');
    expect(notAProductReason({ name_fr: 'Fiche 2 connecteurs F', source_url: 'https://www.electrodepot.be/fr/f.html' })).toBeNull();
  });
});

describe('recognizeColumns — MediaMarkt export of the Eloshon extension', () => {
  const csv = parseImportCsv(EXTENSION_CSV);
  const rec = recognizeColumns(csv.headers, csv.rows, STORES);

  it('renames the labelled columns and drops the PDF data-sheet row', () => {
    expect(rec.headers).toEqual(['description_fr', 'price', 'list_price', 'brand', 'source_category', 'image_url', 'source_url', 'source_product_id', 'name_fr', 'technical_specs']);
    expect(rec.renamed).toContainEqual({ from: 'nom', to: 'name_fr' });
    expect(rec.dropped.not_a_product).toBe(1);
    expect(rec.rows).toHaveLength(1);
  });
  it('cleans the values and fills store + description', () => {
    const r = rec.rows[0];
    expect(r).toMatchObject({
      price: '1538', list_price: '1 599,00', brand: 'APPLE', store_slug: 'mediamarkt',
      image_url: 'https://assets.mmsrg.com/isr/1.webp', description_fr: 'Écran : 6,3 pouces · Stockage : 256 Go',
    });
    expect(rec.storeFromLink).toBe(1);
    expect(rec.specsAsDescription).toBe(1);
  });
  it('imports without error: category guessed from the store path, store from the link', () => {
    const v = validateImportRow(rec.rows[0], CATEGORIES, STORES, [], 'a-classer');
    expect(v.errors).toEqual([]);
    expect(v.storeId).toBe('s-mm');
    expect(v.data).toMatchObject({ price: 1538, category_id: 'c-gsm', name_en: 'APPLE iPhone 18 Pro - 256 GB' });
    expect(v.filled).toContain('category_guessed');
  });
});

describe('recognizeColumns — Eloshon app export (28 columns)', () => {
  const ici = appRow({
    slug_fr: 'armani-si-parfum-18unrj', name_fr: 'ARMANI Sì Parfum - damesgeur', name_en: 'ARMANI Sì Parfum - damesgeur',
    description_fr: 'Sì Parfum van Giorgio Armani<br><br>Omarm de kracht', price: '77.7', barcode: '3614274322309',
    store_slug: 'ICI Paris XL', source_url: 'https://www.iciparisxl.be/nl/armani/si/parfum-damesgeur/p/BP_1386195',
    source_product_id: '3614274322309', source_category: 'Parfum > Damesgeuren > Geuren', brand: 'ARMANI',
    net_content: '30 ml', technical_specs: '{"Contenance":"30 ML"}',
  });
  const colruyt = appRow({ slug_fr: 'everyday-papier-toilette-zi7p', name_fr: 'EVERYDAY Papier toilette 6r', name_en: 'EVERYDAY Papier toilette 6r', price: '2.35', store_slug: 'LIDL', source_url: 'https://www.colruyt.be/fr/produits/6061', source_product_id: '6061', source_category: 'Entretien/Papier' });
  const nike = appRow({ slug_fr: 'nike-pegasus-ab12', name_fr: 'Nike Pegasus 41', name_en: 'Nike Pegasus 41', price: '139.99', store_slug: 'NIKE DE', source_url: 'https://www.nike.com/be/t/pegasus-41', source_product_id: 'FD2722' });
  const csv = parseImportCsv([APP_HEADER, ici, colruyt, nike].join('\r\n'));
  const rec = recognizeColumns(csv.headers, csv.rows, STORES);

  it('keeps Luna column names and reads the trailing columns', () => {
    expect(rec.headers).toEqual(APP_HEADER.split(','));
    expect(rec.renamed).toEqual([]);
    expect(rec.unused).toEqual(['color', 'variants', 'weight_estimated', 'availability', 'rating', 'review_count']);
  });
  it('fixes the store from the link, cleans the description, reads the net content', () => {
    const [r, c] = rec.rows;
    // "ICI Paris XL" already names a Luna store: left as written.
    expect(r.store_slug).toBe('ICI Paris XL');
    expect(r.description_fr).toBe('Sì Parfum van Giorgio Armani\n\nOmarm de kracht');
    expect(r.weight_kg).toBe('0.03');
    expect(c.store_slug).toBe('colruyt');
    expect(rec.storeFromLink).toBe(1);
  });
  it('says when the pages are not the French version', () => {
    const one = recognizeColumns(csv.headers, [csv.rows[0]], STORES);
    expect(one.foreignLanguage).toBe('nl');
    expect(rec.foreignLanguage).toBeNull();
  });
  it('blocks no row for what can be completed in bulk later', () => {
    const [ici2, col2, nike2] = rec.rows.map((r) => validateImportRow(r, CATEGORIES, STORES, [], 'a-classer'));
    expect(ici2.errors).toEqual([]);
    expect(ici2.data?.category_id).toBe('c-frag');
    expect(col2.errors).toEqual([]);
    expect(col2.filled).toContain('category_fallback');
    expect(col2.data?.category_id).toBe('c-sort');
    // A store Luna does not have: imported without a store, never invented.
    expect(nike2.errors).toEqual([]);
    expect(nike2.storeUnknown).toBe(true);
    expect(nike2.storeId).toBeNull();
  });
  it('still refuses a row with no name or no price', () => {
    const v = validateImportRow({ name_fr: '', price: '' }, CATEGORIES, STORES, [], 'a-classer');
    expect(v.errors.map((e) => e.code)).toEqual(['missing_name', 'missing_price']);
  });
});

describe('detectCategoryFromSource', () => {
  const all = new Set(CATEGORIES.map((c) => c.slug));
  it('reads the store path first, then the name', () => {
    expect(detectCategoryFromSource('Ordinateur > Tablette', 'Samsung Galaxy Tab', all)).toBe('computers-tablets');
    expect(detectCategoryFromSource('TV & Audio > Téléviseurs', 'LG OLED 65', all)).toBe('televisions');
    expect(detectCategoryFromSource('Parfum > Damesgeuren', 'Si', all)).toBe('fragrance');
    expect(detectCategoryFromSource('', 'DIOR Miss Dior eau de parfum 50 ml', all)).toBe('fragrance');
  });
  it('answers only with an existing category, and never on an unrelated word', () => {
    expect(detectCategoryFromSource('Ordinateur > Souris', 'Logitech M185', all)).toBeNull();
    expect(detectCategoryFromSource('Visage', 'Crème anti-rougeurs', new Set(['fragrance']))).toBeNull();
  });
});
