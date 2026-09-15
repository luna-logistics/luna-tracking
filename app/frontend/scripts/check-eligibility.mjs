/**
 * Eligibility filter test harness (no test framework in this project).
 *
 * Runs the SAME filter the admin/CSV import uses against a fixed set of
 * cases and asserts the expected status + reason. Imports the TS module
 * directly via Node's native type-stripping (Node ≥ 22.18 / 23.6) — the
 * module is written in erasable-only TypeScript, so no build step is
 * needed.
 *
 *   node scripts/check-eligibility.mjs
 *
 * Exits non-zero on any mismatch so it can gate CI later if wanted.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..', 'src/lib/product-eligibility.ts');
const { isLunaEligibleProduct } = await import(pathToFileURL(SRC).href);

let pass = 0, fail = 0;
/** @param {string} label @param {object} product @param {string} expectStatus @param {string} [reasonIncludes] */
function check(label, product, expectStatus, reasonIncludes) {
  const r = isLunaEligibleProduct(product);
  const okStatus = r.status === expectStatus;
  const okReason = !reasonIncludes || r.reason.toLowerCase().includes(reasonIncludes.toLowerCase());
  const ok = okStatus && okReason;
  if (ok) pass++; else fail++;
  const alc = r.is_alcoholic ? ' [alcool]' : '';
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(46)} → ${r.status.toUpperCase()} — ${r.reason}${alc}`);
  if (!ok) console.log(`        expected ${expectStatus}${reasonIncludes ? ` / reason~"${reasonIncludes}"` : ''}`);
}

const food = (name, extra = {}) => ({ product_type: 'food', name_fr: name, name_en: name, ...extra });

console.log('\n— EXCLUDED (fresh / cold / frozen / bakery / meat) —');
check('Pain frais boulangerie',       food('Pain frais', { source_category: 'Boulangerie' }), 'excluded', 'boulangerie');
check('Croissants',                    food('Croissants au beurre'),                            'excluded', 'boulangerie');
check('Jambon (charcuterie)',          food('Jambon', { source_category: 'Charcuterie' }),      'excluded', 'viande');
check('Viande hachée fraîche',         food('Viande hachée de boeuf'),                          'excluded', 'viande');
check('Yaourt nature',                 food('Yaourt nature x4'),                                'excluded', 'laitier');
check('Pizza surgelée',                food('Pizza surgelée 4 fromages'),                       'excluded', 'surgel');
check('Glace vanille (crème glacée)',  food('Crème glacée vanille'),                            'excluded', 'surgel');
check('Fruits frais (pommes)',         food('Pommes', { source_category: 'Fruits et légumes' }),'excluded', 'fruits');
check('Saumon frais',                  food('Filet de saumon frais'),                           'excluded', 'viande');
check('Cold-chain via storage_info',   food('Sauce X', { storage_info: 'À conserver au frais entre 2 et 4°C' }), 'excluded', 'froid');

console.log('\n— ACCEPTED (shelf-stable) —');
check('Pâtes sèches',                  food('Spaghetti n°5'),                                   'accepted');
check('Riz basmati',                   food('Riz basmati 1kg'),                                 'accepted');
check('Tomates pelées (conserve)',     food('Tomates pelées en conserve'),                      'accepted');
check('Biscuits',                      food('Biscuits sablés'),                                 'accepted');
check('Café moulu',                    food('Café moulu 250g'),                                 'accepted');
check('Sauce tomate',                  food('Sauce tomate basilic'),                            'accepted');
check('Huile de tournesol',            food('Huile de tournesol 1L'),                           'accepted');
check('Chocolat tablette',             food('Tablette de chocolat noir'),                       'accepted');

console.log('\n— ALCOHOL (accepted + flagged) —');
check('Vin rouge',                     food('Vin rouge Bordeaux 75cl'),                         'accepted');
check('Bière blonde',                  food('Bière blonde pils 6x33cl'),                        'accepted');

console.log('\n— MILK POWDER (report case) —');
check('Lait en poudre 900g',           food('Lait en poudre entier 900g'),                      'accepted');

console.log('\n— TO VERIFY —');
check('No product_type',               { name_fr: 'Produit X', name_en: 'Product X' },          'to_verify', 'type de produit manquant');
check('Unknown product_type',          { product_type: 'toys', name_fr: 'Jouet', name_en: 'Toy' }, 'to_verify', 'inconnu');
check('Clothing (no rules yet)',       { product_type: 'clothing', name_fr: 'T-shirt', name_en: 'T-shirt' }, 'to_verify', 'aucune règle');
check('Food, inconclusive name',       food('Article maison', { source_category: '', storage_info: '' }), 'to_verify', 'insuffisantes');

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
