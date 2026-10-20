/**
 * Category detection from a product name (store receipts abbreviate heavily:
 * "NIVEA MEN gel raser pr.care/cool 200ml", "SANEX dch dermo ..."). Ordered
 * rules, first match wins; they run on the accent-free lowercase name. Used by
 * the admin "sort automatically" tool for products that sit directly in a
 * family (Hygiene, Drinks) instead of a sub-category. Slugs are the
 * product_categories slugs.
 */
const RULES: Array<[string, RegExp]> = [
  ['shower-gel', /dch\/shamp/],
  ['intimate', /durex|preserv|lubrifiant|intimy|lactacyd/],
  ['body-care', /creme mains|creme des mains|trayon|huile de corps|beard|vaseline|eviline|hydration boost/],
  ['body-lotion', /nivea soft|nivea creme(?! (de douche|nuit))|nivea care|dove nourishing/],
  ['fragrance', /parfum|cologne|body mist|eau precieuse|frag\./],
  ['makeup', /essence|maybelline|eyeshadow|blush|highlighter|mascara|fit me|superst/],
  ['alcohol', /%\s?vol|whisk|vodka|\bgin\b|rhum|pastis|porto|amaretto|aperitif|campari|ricard|jack daniel|johnnie walker|marie galante|\bj&b\b|smirnoff|disaronno|eristoff|captain morgan|amuro/],
  ['shower-gel', /petit mars/],
  ['toothbrush', /oral-b.*brossett/],
  ['accessories', /zenner|lunettes|lentilles|swirl|zeiss|infocus|raclean|scholl (lime|pedi)|ciseaux|coupe-?ongle|couple-?ongle|stylingcomb|pince/],
  ['incontinence', /inco|\btena\b|discreet|langes|alese|\bpants\b|culotte/],
  ['tampons', /tampon|tampax|\bob\b/],
  ['sanitary-napkin', /serviet|serv\.|\bser\.hyg|protege-?slip|prot-?slip|\bpsl\b|liners|carefree|\balways\b|\bvania\b|\bsh plat|ultra long|platinum|extra secure/],
  ['intimate', /durex|preserv|lubrifiant|intimy|lactacyd/],
  ['dental-care', /bain de bouche|bain bouche|b\.bou|listerine|fil dent|floss|soft-?picks|cure-?dents|interdent|between|dentier|fixodent|corega|steradent|soin buc|s\.buccal|tablettes eff/],
  ['toilet-paper', /papier toilet|pap\.?toilet|p\. toilette|\bnalys\b|scottex|cosynel|\b\d{2,3}f\b|humi/],
  ['tissues', /mouchoir|kleenex|^tempo\b/],
  ['cotton', /coton|disque|disq\.|demak|baton|cotons tiges/],
  ['hair-removal', /veet|epil|depil|\bcire\b/],
  ['razors', /nivea men sensitive 75|rasoir|\bras\.|lames|raser|rasage|mach3|wilkinson|venus|apres-?ras|aftershave|denim|philips|\bbic\b|intuition|gillette (blue|fusion|labs|series|sensor|jet|simply|ras|lames|rasoir)/],
  ['hair-color', /belle color|\bolia\b|casting|excellence (blond|chatain)|magic retouch|syoss (noir|chatain|oleo intense rouge|spray racines)|coloration/],
  ['hair-styling', /elnett|\btaft\b|studio line|hairspr|spray cheveux|spr\.cheveux|got2b|\bwella\b|gel v12|mousse curl|nivea mousse|glue ?spray|fixation|laque/],
  ['face-care', /visage|\bvis\b|masq\.vis|masque (collag|tissu|yeux)|masque.*peau|patch|serum|retinol|anti-?rides|anti-?age|age perfect|wrinkle|revitalift|filler|micell|demaq|miccel|dissolvant|\btonic\b|nettoyant|gel nettoyant|clear-up|clean deeper|pimple|pure activ|hydro boost|hydra nutrition|\bbb\b|cr\.jour|creme (jour|nuit|yeux|hydratante)|cr\.apais|soin (jour|contour)|hydratant soin|lingettes hydratantes|xpres|face|celenes(?!.*bodyl)|derma v10|moist\.|upcircle|neutrogena|nivea cr\.nuit|nivea visage|nivea soin|niv.*q10|vitamine/],
  ['conditioner', /apres-?\s?sh|apres-?shamp|conditioner|\bcond\b|\bcond\.|condit\.|\bcd\b|\bap\.sh|masque|masq\.|gliss kur|oil nut|petrole hahn|lotion chev|spray anti|anti-noeud|\bmask\b/],
  ['shampoo', /shamp|(^|[ .\\/])sh([ .]|$)|barre shamp|alpecin|head&shoulders|ultra doux|schauma|fructis|pantene|elseve|syoss|monday|gliss|happysoaps/],
  ['shower-gel', /\bdch\b|\bdcg\b|douche|\bgel d\b|gel d\.|\bgel dch|cr\.dch|creme de douche|\bbain\b|bain creme|body wash|2en1 sir|petit mars|petit marseil|tahiti|sunlight(?!.*savon)|sanex(?!.*(deo|alun))|melkmeisje|dettol green|\bcorine de farme\b|palmolive (gel|dch|douche)|\bfa 2en1|sh\.?c?h?\b(?=.*men)/],
  ['soap', /savon|sav\.|barsoap|cream bar|soap|sanytol|ecover|seepje|marcel's green|dettol|palmolive|everyday savon|diaderm.*savon|ref\.hon/],
  ['deodorant', /\bdeo|deospray|roll[- ]?on|\brol\b|\bstick\b|pierre.*alun|mennen|borotalco|rexona|fresh step|invisible dry|extra fresh|\bdeod|\bd.o\b/],
  ['body-lotion', /bodymilk|body milk|lait corp|body cream|body int|body r|bodyl|nivea soft|nivea creme(?! (de douche|nuit))|nivea care|dove nourishing|creme hydratante/],
  ['body-care', /vaseline|trayon|huile de corps|hydration boost|creme mains|creme des mains|beard|baume|eviline/],
  ['makeup', /essence|maybelline|eyeshadow|blush|highlighter|mascara|fit me|superst/],
  ['fragrance', /parfum|cologne|body mist|eau precieuse|frag\./],
  ['toothbrush', /brosse.*dent|br. ?a? ?dents|\bbd\b|brosset|toothbrush|bross\.|jordan clean smile/],
  ['toothpaste', /dentif|\bdf\b|\bdt\b|\btp\b|\btp\.|meridol|parodontax|theramed|elmex|colgate|sensodyne|signal|oral-b/],
];

/** Cheese & dairy ("Fromages", "Crèmerie & œufs") plus the few bakery-dough
 *  items stores file under dairy. Checked only when the caller allows these
 *  slugs (see `allowed`), so they never compete with the hygiene rules. */
const FOOD_RULES: Array<[string, RegExp]> = [
  ['dough-crepes', /pate (brisee|feuilletee|a pizza)|pinsami|crepes|feuilles de lasagne/],
  ['fresh-pasta', /gnocchi|nouilles/],
  ['eggs', /\boeufs?\b/],
  ['cream', /cuisine (veget|soja)/],
  ['butter-margarine', /beurr|margarine|marg\.|becel|\bsolo\b|planta|fama|vitelma|bertolli|cuire ?(&|et) ?rotir|soja tartiner|beur\./],
  ['plant-drinks', /alpro|oatly|plan't|\bsoja\b|\bsoya\b|amandes|avoine/],
  ['drinkable-yogurt', /actimel|yakult|kefir|a boire|benecol|protein drink|hipro drink/],
  ['dairy-desserts', /pudding|mousse|\bflan\b|riz au lait|riz lait|creme dessert|danette|tiramisu|liegeois|viennois|cheesy choc|zott|semoule|homemade desserts|kinder|paula/],
  ['skyr-greek', /skyr|grec|greek|oikos|kri kri/],
  ['grated-cheese', /rape|grattug|gratin|spaghetti mix|special mix|pasta mix|pamesello/],
  ['goat-cheese', /chevr|chavroux|soignon/],
  ['italian-greek-cheese', /mozzarella|burrata|ricotta|mascarpone|parm|grana|pecorino|feta|halloumi|apetina|gorgonzola/],
  ['soft-cheese', /brie|camembert|chaumes|caprice|reblochon|vieux pane|cambozola|roquefort|\bbleu\b|tartiflette|isigny/],
  ['spread-cheese', /boursin|philadelphia|st moret|kiri|vache qui rit|tartiner|from\.tart|babybel|heks|strings|double creme 16p|cremeux ail|madame loik/],
  ['fresh-cheese-desserts', /fromage frais|danio|petit suisse|danonino|maquee|cottage|petit boni|pouch/],
  ['yogurts', /yaourt|activia|vitalinea|yoplait panier|inex/],
  ['cream', /\bcreme\b|\bcre\.|double creme/],
  ['milk-drinks', /\blait\b|ecreme brique|chocomel|fristi|lait battu|boisson a fraise|macchiato|cafe glace|nutroma/],
  ['sliced-cheese', /gouda|emmental|cheddar|abbaye|maasdammer|leerdammer|raclette|comte|gruyere|cubes|tranches|bloc|brugge|flandrien|beemster|hollander|amsterdam|passendale|maredsous|grimbergen|chimay|joseph|jambon 48|fromage/],
];

/** Accent/punctuation-light normalisation that keeps the characters the rules rely on (. / % & -). */
function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\u2019/g, "'");
}

/** The sub-category slug for a product name, or null when no rule matches.
 *  `allowed` limits the answer to those slugs (e.g. the sub-categories of the
 *  product's family); without it only the historical hygiene/drinks rules run. */
export function detectCategorySlug(name: string, allowed?: Set<string>): string | null {
  const n = normalizeName(name);
  const rules = allowed ? [...RULES, ...FOOD_RULES] : RULES;
  for (const [slug, rx] of rules) {
    if (allowed && !allowed.has(slug)) continue;
    if (rx.test(n)) return slug;
  }
  return null;
}
