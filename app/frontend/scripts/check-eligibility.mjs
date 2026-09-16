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
/** @param {string} label @param {object} product @param {string} expectStatus
 *  @param {string} [reasonIncludes] @param {(boolean|null|'skip')} [expectRcc] */
function check(label, product, expectStatus, reasonIncludes, expectRcc = 'skip') {
  const r = isLunaEligibleProduct(product);
  const okStatus = r.status === expectStatus;
  const okReason = !reasonIncludes || r.reason.toLowerCase().includes(reasonIncludes.toLowerCase());
  const okRcc = expectRcc === 'skip' || r.requires_cold_chain === expectRcc;
  const ok = okStatus && okReason && okRcc;
  if (ok) pass++; else fail++;
  const alc = r.is_alcoholic ? ' [alcool]' : '';
  const rcc = r.requires_cold_chain === true ? ' rcc:true' : r.requires_cold_chain === false ? ' rcc:false' : ' rcc:—';
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(42)} → ${r.status.toUpperCase().padEnd(9)}${rcc} — ${r.reason}${alc}`);
  if (!ok) console.log(`        expected ${expectStatus}${reasonIncludes ? ` / reason~"${reasonIncludes}"` : ''}${expectRcc !== 'skip' ? ` / rcc=${expectRcc}` : ''}`);
}

const food = (name, extra = {}) => ({ product_type: 'food', name_fr: name, name_en: name, ...extra });

console.log('\n— EXCLUDED (fresh / cold / frozen / bakery / meat) —');
check('Pain frais boulangerie',       food('Pain frais', { source_category: 'Boulangerie' }), 'excluded', 'boulangerie');
check('Croissants',                    food('Croissants au beurre'),                            'excluded', 'boulangerie');
check('Saucisses fraîches',            food('Saucisses fraîches', { source_category: 'Charcuterie' }), 'excluded', 'viande');
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

console.log('\n— COLD "after opening" vs real cold-chain, flavour "frais" —');
check('Ketchup (fridge after opening)',  food('Ketchup', { storage_info: 'À conserver au réfrigérateur après ouverture' }), 'accepted');
check('Mayonnaise (after opening)',      food('Mayonnaise', { storage_info: 'Après ouverture, à conserver au frais' }), 'accepted');
check('Confiture (after opening)',       food('Confiture de fraises', { storage_info: 'Après ouverture à conserver au frais' }), 'accepted');
check('Sauce carbonara (refrigerated)',  food('Sauce carbonara', { storage_info: 'À conserver entre 2 et 4°C, produit réfrigéré' }), 'excluded', 'froid');
check('Chewing-gum menthe fraîche',      food('Chewing-gum menthe fraîche'),                      'accepted');
check('Goût frais (soda)',               food('Soda goût frais citron'),                          'accepted');
check('Pâtes fraîches (real fresh)',     food('Pâtes fraîches tagliatelles'),                     'excluded', 'frais');

console.log('\n— AMBIENT dry-storage & real cold ranges —');
check('Chips "endroit frais et sec"',    food('Chips sel', { source_category: 'Snacks', storage_info: 'À conserver dans un endroit frais et sec' }), 'accepted');
check('Farine "endroit sec"',            food('Farine de blé', { storage_info: "À conserver dans un endroit sec, à l'abri de la chaleur" }), 'accepted');
check('Huile olive "abri lumière"',      food("Huile d'olive vierge extra", { storage_info: "À conserver à l'abri de la lumière" }), 'accepted');
check('Jus orange ambiant',              food("Jus d'orange", { source_category: 'Boissons', storage_info: 'Conservation à température ambiante. Après ouverture, à conserver au réfrigérateur' }), 'accepted');
check('Jus pressé réfrigéré 0-4°C',      food("Jus d'orange pressé réfrigéré", { storage_info: 'À conserver entre 0 et 4 °C' }), 'excluded', 'froid');
check('Beurre doux 2-6°C',               food('Beurre doux', { source_category: 'Produits laitiers', storage_info: 'À conserver entre 2 et 6 °C' }), 'excluded', 'froid');
check('Emmental râpé 4-8°C',             food('Emmental râpé', { source_category: 'Produits laitiers', storage_info: 'À conserver entre 4 et 8 °C' }), 'excluded', 'froid');
check('Glace vanille -18°C',             food('Glace vanille', { source_category: 'Surgelés', storage_info: 'À conserver à -18 °C' }), 'excluded', 'surgel');
check('Œufs x6',                          food('Œufs x6', { source_category: 'Œufs' }), 'to_verify');
check('Lait UHT ambiant (report)',       food('Lait demi-écrémé UHT', { source_category: 'Produits laitiers', storage_info: 'Avant ouverture, conservation à température ambiante' }), 'accepted');

console.log('\n— JAMBON (accepted in every form; rcc informational) —');
check('Jambon cuit tranché 0-4°C',       food('Jambon cuit tranché', { source_category: 'Charcuterie', storage_info: 'À conserver entre 0 et 4 °C' }), 'accepted', 'jambon', true);
check('Jambon sec tranché 0-4°C',        food('Jambon sec tranché', { source_category: 'Charcuterie', storage_info: 'À conserver entre 0 et 4 °C' }), 'accepted', 'jambon', true);
check('Jambon sec "endroit frais et sec"', food('Jambon sec', { source_category: 'Charcuterie', storage_info: 'À conserver dans un endroit frais et sec' }), 'accepted', 'jambon', false);
check('Jambon cru affiné (no info)',     food('Jambon cru affiné', { source_category: 'Charcuterie' }), 'accepted', 'jambon', null);
check('Pâté 0-4°C (unchanged)',          food('Pâté de campagne', { source_category: 'Charcuterie', storage_info: 'À conserver entre 0 et 4 °C' }), 'excluded');
check('Pâté de jambon 0-4°C',            food('Pâté de jambon', { source_category: 'Charcuterie', storage_info: 'À conserver entre 0 et 4 °C' }), 'excluded');
check('Lardons fumés (unchanged)',       food('Lardons fumés', { source_category: 'Charcuterie' }), 'excluded', 'viande');

console.log('\n— CURED / DRIED meat & fish (ambient OK, cold wins) —');
check('Saucisson sec "frais et sec"',    food('Saucisson sec', { source_category: 'Charcuterie', storage_info: 'À conserver dans un endroit frais et sec' }), 'accepted', 'charcuterie');
check('Biltong température ambiante',     food('Biltong boeuf séché', { storage_info: 'À conserver à température ambiante' }), 'accepted');
check('Morue salée séchée ambiant',      food('Morue salée séchée', { storage_info: 'À conserver dans un endroit frais et sec' }), 'accepted', 'poisson');
check('Saumon fumé 0-4°C',               food('Saumon fumé', { storage_info: 'À conserver entre 0 et 4 °C' }), 'excluded', 'froid');

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
