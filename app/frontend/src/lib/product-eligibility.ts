/**
 * Generic product eligibility filter — store-agnostic.
 *
 * Answers ONE question: does this product belong to a category Luna
 * currently wants to list in "Courses"? i.e. shelf-stable, no cold chain,
 * not fresh/perishable. It says NOTHING about DRC customs / import
 * legality — that is a separate concern and must not be added here.
 *
 * Three outcomes, never collapsed into each other:
 *   • accepted   — a positive shelf-stable signal was found.
 *   • excluded   — a clear fresh / refrigerated / frozen / perishable
 *                  signal was found (with a readable reason).
 *   • to_verify  — not enough information to decide (unknown/absent type,
 *                  a type with no validated rules yet, or a food product
 *                  with no conclusive signal). NEVER auto-promoted to
 *                  accepted — a human decides.
 *
 * Design rules:
 *   • Multiple signals, not just the name: source_category, name,
 *     description, storage_info and the raw payload are all searched.
 *   • Exclusion wins over acceptance (safety first).
 *   • Absence of information ≠ acceptance (→ to_verify).
 *   • Alcohol is ALLOWED. It is only flagged (`is_alcoholic`), never a
 *     reason to exclude.
 *
 * To change the business rules, edit ONLY the ELIGIBILITY_RULES block
 * below. The matching engine underneath is generic and should not need
 * to change when rules evolve.
 */
import type { NormalizedProduct } from './normalized-product';

export type EligibilityStatus = 'accepted' | 'excluded' | 'to_verify';

export interface EligibilityResult {
  status: EligibilityStatus;
  /** Stable machine code, e.g. 'excluded_frozen', 'to_verify_no_type'. */
  code: string;
  /** Human-readable reason for logs / preview, e.g. "boulangerie". */
  reason: string;
  /** Keywords that triggered the decision (for debugging). */
  matched: string[];
  /** Informational — alcohol is allowed, this never affects `status`. */
  is_alcoholic: boolean;
}

// ════════════════════════════════════════════════════════════════════════
//  ELIGIBILITY_RULES — the single source of business rules. Edit here.
//  [DÉCISION UTILISATEUR] Every list below reflects an explicit Luna
//  decision. Do not add categories on your own initiative.
//  Keywords are lowercase, accent-insensitive; the engine normalises the
//  same way. A keyword with a space (or hyphen) matches as a phrase; a
//  single word matches whole-word only (so "frais" does not fire on
//  "fraîchement", and "thé" is never matched via bare "the").
// ════════════════════════════════════════════════════════════════════════

interface KeywordRule {
  /** Machine code, prefixed excluded_/accept_ . */
  code: string;
  /** Readable reason (French), shown in preview + logs. */
  reason: string;
  keywords: string[];
  /** If ANY of these phrases is present in the corpus, the whole rule is
   *  suppressed. Used for conditional cold ("à conserver au frais APRÈS
   *  OUVERTURE" is not a cold-chain product). */
  suppressIfPresent?: string[];
  /** A single-word keyword only counts if at least one occurrence is NOT
   *  immediately preceded by one of these words. Used so "menthe fraîche"
   *  / "goût frais" (a flavour) is not read as a conservation signal. */
  suppressIfPrecededBy?: string[];
}

interface TypeRules {
  /** false = structure exists but NO validated rules yet → to_verify. */
  hasRules: boolean;
  /** Checked first; first match wins → excluded. */
  exclude: KeywordRule[];
  /** Checked next; first match wins → accepted. */
  accept: KeywordRule[];
}

/** Alcohol keywords — used ONLY to set is_alcoholic (allowed, informational).
 *  Also serve as a positive shelf-stable "beverage" acceptance signal. */
const ALCOHOL_KEYWORDS = [
  'vin', 'vins', 'wine', 'biere', 'bieres', 'beer', 'champagne', 'cremant',
  'spiritueux', 'spirits', 'whisky', 'whiskey', 'rhum', 'rum', 'vodka', 'gin',
  'liqueur', 'liqueurs', 'aperitif', 'apero', 'pastis', 'cognac', 'tequila',
  'porto', 'martini', 'prosecco', 'cava', 'sangria', 'ricard',
];

const FOOD_RULES: TypeRules = {
  hasRules: true,

  // ─── EXCLUDE (fresh / cold-chain / frozen / perishable) ──────────────
  // Ordered specific → generic so the reason is as precise as possible.
  // Category-specific reasons come first so the log is precise
  // ("charcuterie" rather than the generic "conservation au froid");
  // frozen / cold-chain / generic-fresh are the fallbacks.
  exclude: [
    { code: 'excluded_frozen', reason: 'surgelé',
      keywords: ['surgele', 'surgeles', 'surgelee', 'surgelees', 'congele', 'congeles',
        'congelee', 'congelees', 'frozen', 'deep frozen', 'creme glacee', 'ice cream',
        'sorbet', 'esquimau', 'batonnet glace'] },

    { code: 'excluded_bakery', reason: 'boulangerie',
      keywords: ['boulangerie', 'boulanger', 'viennoiserie', 'viennoiseries', 'croissant',
        'croissants', 'pain frais', 'baguette', 'baguettes', 'brioche fraiche',
        'patisserie fraiche', 'patisseries fraiches', 'gateau frais', 'gateaux frais',
        'dessert frais', 'desserts frais', 'tarte fraiche', 'pain au chocolat'] },

    { code: 'excluded_meat_seafood', reason: 'viande / charcuterie / poisson frais',
      keywords: ['charcuterie', 'boucherie', 'viande fraiche', 'viande hachee', 'steak frais',
        'volaille', 'volaille fraiche', 'poulet frais', 'dinde fraiche', 'poisson frais',
        'fruits de mer', 'saumon frais', 'cabillaud frais', 'jambon frais', 'lardons',
        'saucisse fraiche', 'saucisses fraiches', 'merguez', 'chair a saucisse'] },

    { code: 'excluded_dairy_fresh', reason: 'produit laitier frais',
      keywords: ['yaourt', 'yaourts', 'yogurt', 'yoghurt', 'fromage frais', 'fromage blanc',
        'fromages frais', 'creme fraiche', 'lait frais', 'beurre frais', 'skyr',
        'petit suisse', 'faisselle', 'dessert lacte frais'] },

    { code: 'excluded_produce_fresh', reason: 'fruits / légumes frais',
      keywords: ['fruits frais', 'legumes frais', 'fruit frais', 'legume frais',
        'salade fraiche', 'salade en sachet', 'herbes fraiches', 'fines herbes fraiches',
        'fruits et legumes'] },

    // Unconditional cold signals — always exclude, even with "après
    // ouverture" present (a genuinely refrigerated product / a stated
    // temperature range before opening).
    // Unconditional cold WORDS. Numeric temperatures (any stated ≤ 8 °C
    // range, or a negative °C = frozen) are handled separately by
    // temperatureSignal() so we don't have to enumerate every range.
    { code: 'excluded_refrigerated', reason: 'conservation au froid',
      keywords: ['produit refrigere', 'refrigere', 'refrigeres', 'keep refrigerated',
        'keep chilled', 'store chilled', 'store refrigerated', 'chaine du froid',
        'conservation au froid'] },

    // Conditional cold signals — DO NOT count when they only apply "après
    // ouverture" (ketchup, mayonnaise, jams, spreads… are shelf-stable
    // before opening), nor when the phrase is the ambient "endroit frais
    // et sec" (a dry-storage mention, not a cold one).
    { code: 'excluded_cold_chain', reason: 'conservation au froid',
      keywords: ['a conserver au frais', 'conserver au frais', 'au frais',
        'a conserver au refrigerateur', 'conserver au refrigerateur', 'refrigerateur',
        'maintenir au froid'],
      suppressIfPresent: ['apres ouverture', 'apres l ouverture', 'une fois ouvert',
        'une fois ouverte', 'after opening', 'once opened', 'frais et sec'] },

    // Generic fresh/perishable marker — last, so specific reasons win first.
    // NB: bare English "fresh" is deliberately NOT a keyword — English puts
    // the flavour adjective before the noun ("fresh mint"), and "fresh" is
    // common shelf-stable marketing. Belgian sources label in FR/NL, so the
    // reliable marker is the French "frais/fraîche". "poisson frais",
    // "produit frais", a "Frais" aisle category, etc. still trigger.
    { code: 'excluded_fresh', reason: 'produit frais',
      keywords: ['frais', 'fraiche', 'fraiches', 'perissable',
        'a consommer rapidement', 'date courte'],
      // Flavours ("menthe fraîche", "goût frais"), serving suggestions
      // ("servir bien frais") and the cold-storage phrase "au frais"
      // (already handled unconditionally by the cold-chain rule) are not
      // a "produit frais" signal on their own.
      suppressIfPrecededBy: ['menthe', 'gout', 'gouts', 'arome', 'aromes', 'saveur',
        'saveurs', 'parfum', 'parfums', 'note', 'notes', 'sensation', 'effet', 'air',
        'senteur', 'senteurs', 'au', 'bien', 'servir', 'servez', 'deguster',
        'endroit', 'lieu'] },
  ],

  // ─── ACCEPT (shelf-stable / long conservation) ───────────────────────
  accept: [
    { code: 'accept_dry_grocery', reason: 'épicerie sèche / longue conservation',
      keywords: ['epicerie', 'epicerie seche', 'longue conservation', 'long life', 'longlife',
        'shelf stable', 'conservation normale', 'temperature ambiante', 'a temperature ambiante',
        'ambient', 'uht', 'sterilise', 'appertise', 'deshydrate', 'deshydrates', 'en poudre',
        'lyophilise', 'pain de mie', 'pain grille', 'pain croustillant'] },

    { code: 'accept_pasta_grains', reason: 'féculents secs (pâtes, riz, céréales)',
      keywords: ['pates', 'pate alimentaire', 'pasta', 'spaghetti', 'penne', 'macaroni',
        'tagliatelle', 'nouilles', 'noodles', 'riz', 'rice', 'basmati', 'semoule', 'semolina',
        'couscous', 'cereales', 'cereal', 'flocons', 'avoine', 'oats', 'muesli', 'farine',
        'flour', 'ble', 'polenta', 'quinoa', 'boulgour', 'lentilles', 'pois casses'] },

    { code: 'accept_canned', reason: 'conserves',
      keywords: ['conserve', 'conserves', 'en conserve', 'canned', 'bocal', 'en bocal',
        'pelees', 'pelee', 'concentre de tomate', 'sardine', 'sardines', 'thon', 'tuna',
        'maquereau', 'haricots rouges', 'haricots blancs', 'pois chiches', 'mais doux',
        'corned beef', 'pate de foie'] },

    { code: 'accept_sauces_condiments', reason: 'sauces & condiments',
      keywords: ['sauce', 'sauces', 'ketchup', 'mayonnaise', 'moutarde', 'mustard', 'vinaigre',
        'vinegar', 'sel', 'salt', 'poivre', 'epices', 'epice', 'spice', 'spices', 'condiment',
        'bouillon', 'fond de', 'pesto', 'harissa', 'curry', 'paprika'] },

    { code: 'accept_oils', reason: 'huiles',
      keywords: ['huile', 'oil', 'huile d olive', 'olive oil', 'tournesol', 'sunflower oil',
        'huile de colza', 'huile vegetale'] },

    { code: 'accept_hot_drinks', reason: 'café / thé / cacao',
      keywords: ['cafe', 'coffee', 'nescafe', 'the vert', 'the noir', 'tea', 'infusion',
        'tisane', 'rooibos', 'cacao', 'cocoa', 'chocolat en poudre', 'chocolat chaud'] },

    { code: 'accept_sweets_snacks', reason: 'biscuits, snacks, confiseries, chocolat',
      keywords: ['biscuit', 'biscuits', 'cookie', 'cookies', 'gaufre', 'gaufres', 'wafer',
        'cracker', 'crackers', 'biscotte', 'biscottes', 'chips', 'tuiles', 'snack', 'snacks',
        'bonbon', 'bonbons', 'confiserie', 'confiseries', 'candy', 'sweets', 'chewing gum',
        'chocolat', 'chocolate', 'tablette de chocolat', 'barre chocolatee', 'confiture',
        'jam', 'miel', 'honey', 'pate a tartiner', 'fruits secs', 'fruit sec', 'noix',
        'amandes', 'cacahuetes', 'raisins secs'] },

    { code: 'accept_beverages', reason: 'boissons à conservation normale',
      keywords: ['eau', 'water', 'eau minerale', 'eau de source', 'jus', 'juice',
        'jus de fruits', 'soda', 'boisson gazeuse', 'cola', 'limonade', 'sirop', 'syrup',
        'boisson', 'soft drink', 'ice tea', 'the glace', 'energy drink'] },

    { code: 'accept_baking_sugar', reason: 'épicerie sucrée / pâtisserie sèche',
      keywords: ['sucre', 'sugar', 'levure', 'sucre vanille', 'vanille', 'maizena', 'fecule',
        'pepites de chocolat', 'preparation gateau'] },

    // Alcohol is allowed and shelf-stable → a valid acceptance signal.
    { code: 'accept_alcohol', reason: 'boisson alcoolisée (autorisée)',
      keywords: [...ALCOHOL_KEYWORDS] },
  ],
};

// ─── Cured / dried meat & fish (shelf-stable when dried + ambient) ───────
// [DÉCISION UTILISATEUR] Dried charcuterie (saucisson sec, jambon cru
// affiné, chorizo sec…) and dried/salted meat & fish (biltong, morue salée
// séchée…) are ALLOWED when a drying signal + an ambient-storage signal are
// both present. A cold signal ALWAYS wins (→ excluded). Drying signal but
// no conservation info → to_verify (many dried-sliced products need cold).
const MEATFISH_SIGNALS = ['charcuterie', 'saucisson', 'chorizo', 'salami',
  'jambon', 'viande', 'boeuf', 'porc', 'poulet', 'dinde', 'volaille', 'poisson', 'morue',
  'cabillaud', 'saumon', 'hareng', 'maquereau', 'anchois', 'biltong', 'jerky', 'ham',
  'sausage', 'beef', 'fish', 'cod'];
const FISH_SIGNALS = ['poisson', 'morue', 'cabillaud', 'saumon', 'hareng', 'maquereau',
  'anchois', 'fish', 'cod'];
const DRIED_SIGNALS = ['sec', 'seche', 'sechee', 'seches', 'sechees', 'affine', 'affinee',
  'affines', 'affinees', 'curado', 'cru affine', 'crue affinee', 'salaison', 'fume seche',
  'biltong', 'jerky', 'beef jerky', 'dried', 'cured', 'air dried'];
const AMBIENT_SIGNALS = ['endroit frais et sec', 'frais et sec', 'endroit sec',
  'temperature ambiante', 'a temperature ambiante', 'a l abri de la chaleur',
  'a l abri de la lumiere', 'conservation ambiante', 'longue conservation', 'ambient',
  'shelf stable', 'temperature de la piece'];

/** Rules per product_type. Only `food` is validated. The others exist so
 *  the structure is ready, but have NO rules → their products are
 *  "to_verify" until Luna approves a rule set. */
export const ELIGIBILITY_RULES: Record<string, TypeRules> = {
  food:      FOOD_RULES,
  clothing:  { hasRules: false, exclude: [], accept: [] },
  hygiene:   { hasRules: false, exclude: [], accept: [] },
  household: { hasRules: false, exclude: [], accept: [] },
  other:     { hasRules: false, exclude: [], accept: [] },
};

// ════════════════════════════════════════════════════════════════════════
//  Matching engine — generic. Should not need edits when rules change.
// ════════════════════════════════════════════════════════════════════════

/** Lowercase, strip diacritics, and flatten separators to spaces. */
function clean(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_/.]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build the search corpus from every meaningful signal — not just the
 *  name. Source category and storage info are the strongest signals and
 *  are always included when present. */
function buildCorpus(p: NormalizedProduct): Corpus {
  const parts: string[] = [
    p.source_category, p.name_fr, p.name_en, p.description_fr, p.description_en,
    p.storage_info, p.category_slug,
  ].filter((x): x is string => typeof x === 'string' && x.length > 0);

  // Fold in extra raw fields (future scrapers may expose useful text), but
  // skip identifiers, URLs and purely-numeric values — folding "weight_kg:
  // 0.4" next to "category: canned" once produced a spurious "4 c" cold
  // match. Keep only descriptive text.
  if (p.raw) {
    const SKIP = new Set(['price', 'weight_kg', 'barcode', 'hs_code', 'source_url',
      'source_product_id', 'image_url', 'slug', 'slug_fr', 'slug_en', 'is_alcoholic']);
    for (const [k, v] of Object.entries(p.raw)) {
      if (SKIP.has(k) || typeof v !== 'string') continue;
      const t = v.trim();
      if (!t || /^https?:\/\//i.test(t) || /^[\d.,\s]+$/.test(t)) continue;
      parts.push(t);
    }
  }

  const text = clean(parts.join('  |  '));
  const list = text.split(' ').filter(Boolean);

  // Product-identity sub-corpus (name + category + description, NOT storage).
  // The drying signal for cured products must come from the PRODUCT, never
  // from a "endroit frais et SEC" storage mention.
  const productParts = [p.source_category, p.name_fr, p.name_en, p.description_fr, p.description_en]
    .filter((x): x is string => typeof x === 'string' && x.length > 0);
  const productText = clean(productParts.join('  |  '));

  return {
    text, words: new Set(list), list,
    tempText: tempNormalize(parts.join(' ')),
    productText, productWords: new Set(productText.split(' ').filter(Boolean)),
  };
}

type Corpus = {
  text: string; words: Set<string>; list: string[]; tempText: string;
  productText: string; productWords: Set<string>;
};

/** Lowercase + strip accents but KEEP digits and signs, and turn ° into a
 *  space, so "À conserver entre 2 et 6 °C" → "a conserver entre 2 et 6  c"
 *  and "-18 °C" → "-18  c". Used only for temperatureSignal. */
function tempNormalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/°/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Detect a conservation temperature from free text.
 *   • any °C value ≤ -5      → 'frozen'  (e.g. "-18 °C")
 *   • any °C value ≤ 8       → 'cold'    (e.g. "entre 0 et 4 °C", "4 à 8 °C")
 *   • otherwise              → null      (oven/cooking temps, volumes like
 *                                         "75 cl", ambient text, no number)
 * Reads a number only when it is directly tied to a °C marker (`\d c`), so
 * "endroit frais et sec", "75 cl", "cuisson 200 °C" never trigger.
 */
function temperatureSignal(t: string): 'frozen' | 'cold' | null {
  const re = /([+-]?\d{1,3})\s?c\b/g;
  let m: RegExpExecArray | null;
  let cold = false;
  while ((m = re.exec(t))) {
    const v = Number.parseInt(m[1], 10);
    if (Number.isNaN(v)) continue;
    if (v <= -5) return 'frozen';
    if (v <= 8) cold = true;
  }
  return cold ? 'cold' : null;
}

function matchKeyword(kw: string, corpus: Corpus): boolean {
  const k = clean(kw);
  if (!k) return false;
  return k.includes(' ') ? corpus.text.includes(k) : corpus.words.has(k);
}

/** True if `word` appears at least once NOT immediately preceded by one of
 *  the guard words (used to ignore "menthe fraîche", "goût frais"…). */
function hasUnguardedOccurrence(word: string, list: string[], guards: string[]): boolean {
  const gset = new Set(guards.map(clean));
  for (let i = 0; i < list.length; i++) {
    if (list[i] === word && !gset.has(i > 0 ? list[i - 1] : '')) return true;
  }
  return false;
}

/** Tokens of a rule that actually count, honouring its guards. */
function ruleMatches(rule: KeywordRule, corpus: Corpus): string[] | null {
  if (rule.suppressIfPresent?.some((p) => corpus.text.includes(clean(p)))) return null;
  const matched: string[] = [];
  for (const kw of rule.keywords) {
    if (!matchKeyword(kw, corpus)) continue;
    if (rule.suppressIfPrecededBy && !clean(kw).includes(' ')
        && !hasUnguardedOccurrence(clean(kw), corpus.list, rule.suppressIfPrecededBy)) continue;
    matched.push(kw);
  }
  return matched.length ? matched : null;
}

/** First rule whose keywords hit; returns the rule + the tokens that matched. */
function firstMatch(rules: KeywordRule[], corpus: Corpus) {
  for (const rule of rules) {
    const matched = ruleMatches(rule, corpus);
    if (matched) return { rule, matched };
  }
  return null;
}

/** True if any keyword hits the given (text, words) pair. */
function hasAny(keywords: string[], text: string, words: Set<string>): boolean {
  return keywords.some((kw) => { const k = clean(kw); return k.includes(' ') ? text.includes(k) : words.has(k); });
}

// Named refs into the food config, for the food-specific precedence below.
const foodRule = (code: string) => FOOD_RULES.exclude.find((r) => r.code === code) as KeywordRule;
const FROZEN_RULE = foodRule('excluded_frozen');
const REFRIGERATED_RULE = foodRule('excluded_refrigerated');
const COLDCHAIN_RULE = foodRule('excluded_cold_chain');
const BAKERY_RULE = foodRule('excluded_bakery');
const MEAT_RULE = foodRule('excluded_meat_seafood');
const DAIRY_RULE = foodRule('excluded_dairy_fresh');
const PRODUCE_RULE = foodRule('excluded_produce_fresh');
const FRESH_RULE = foodRule('excluded_fresh');

/** Cold-chain signal: a stated ≤ 8 °C temperature, a "produit réfrigéré"
 *  word, or a "à conserver au frais/réfrigérateur" phrase that isn't
 *  neutralised (après ouverture / endroit frais et sec). */
function isColdSignal(corpus: Corpus): boolean {
  return temperatureSignal(corpus.tempText) === 'cold'
    || !!ruleMatches(REFRIGERATED_RULE, corpus)
    || !!ruleMatches(COLDCHAIN_RULE, corpus);
}

/**
 * Food-specific classifier. Precedence:
 *   1. frozen (negative °C or a frozen word)                 → excluded
 *   2. cured/dried meat & fish:
 *        cold signal → excluded · ambient → accepted · else  → to_verify
 *   3. fresh categories (bakery, meat, dairy, produce)       → excluded
 *   4. any remaining cold signal (e.g. plain butter + range) → excluded
 *   5. generic "frais/fraîche" marker                        → excluded
 *   6. a shelf-stable acceptance signal                      → accepted
 *   7. nothing conclusive                                    → to_verify
 */
function classifyFood(corpus: Corpus, is_alcoholic: boolean): EligibilityResult {
  const R = (status: EligibilityStatus, code: string, reason: string, matched: string[] = []): EligibilityResult =>
    ({ status, code, reason, matched, is_alcoholic });

  if (temperatureSignal(corpus.tempText) === 'frozen') return R('excluded', 'excluded_frozen', 'surgelé', ['température négative']);
  const frozenKw = ruleMatches(FROZEN_RULE, corpus);
  if (frozenKw) return R('excluded', 'excluded_frozen', 'surgelé', frozenKw);

  const cold = isColdSignal(corpus);

  const isMeatFish = hasAny(MEATFISH_SIGNALS, corpus.productText, corpus.productWords);
  const isDried = hasAny(DRIED_SIGNALS, corpus.productText, corpus.productWords);
  if (isMeatFish && isDried) {
    if (cold) return R('excluded', 'excluded_cold_chain', 'conservation au froid', ['séché mais réfrigéré']);
    const dryReason = hasAny(FISH_SIGNALS, corpus.productText, corpus.productWords) ? 'poisson séché / salé' : 'charcuterie sèche';
    if (hasAny(AMBIENT_SIGNALS, corpus.text, corpus.words)) return R('accepted', 'accept_cured_dry', dryReason);
    return R('to_verify', 'to_verify_cured_no_storage', `${dryReason} — conservation à confirmer`);
  }

  const cat = firstMatch([BAKERY_RULE, MEAT_RULE, DAIRY_RULE, PRODUCE_RULE], corpus);
  if (cat) return R('excluded', cat.rule.code, cat.rule.reason, cat.matched);

  if (cold) return R('excluded', 'excluded_refrigerated', 'conservation au froid', ['froid']);

  const fresh = ruleMatches(FRESH_RULE, corpus);
  if (fresh) return R('excluded', 'excluded_fresh', 'produit frais', fresh);

  const acc = firstMatch(FOOD_RULES.accept, corpus);
  if (acc) return R('accepted', acc.rule.code, acc.rule.reason, acc.matched);

  return R('to_verify', 'to_verify_insufficient', 'informations insuffisantes pour déterminer la conservation');
}

/**
 * Classify one normalised product.
 *
 * Precedence:
 *   1. no / unknown product_type            → to_verify
 *   2. type has no validated rules yet       → to_verify
 *   3. food → dedicated classifier (see classifyFood)
 *   4. other typed rules → generic exclude → accept → to_verify
 */
export function isLunaEligibleProduct(p: NormalizedProduct): EligibilityResult {
  const corpus = buildCorpus(p);

  // is_alcoholic is informational only (alcohol is allowed).
  const alcoholMatch = ALCOHOL_KEYWORDS.filter((k) => matchKeyword(k, corpus));
  const is_alcoholic = p.is_alcoholic === true || alcoholMatch.length > 0;

  const type = typeof p.product_type === 'string' ? p.product_type.trim().toLowerCase() : '';

  if (!type) {
    return { status: 'to_verify', code: 'to_verify_no_type',
      reason: 'informations insuffisantes — type de produit manquant', matched: [], is_alcoholic };
  }
  // A type Luna hasn't declared at all (the rules map holds every known
  // type, including those with no rules yet).
  if (!Object.prototype.hasOwnProperty.call(ELIGIBILITY_RULES, type)) {
    return { status: 'to_verify', code: 'to_verify_unknown_type',
      reason: `informations insuffisantes — type de produit inconnu « ${type} »`, matched: [], is_alcoholic };
  }

  const rules = ELIGIBILITY_RULES[type];
  if (!rules.hasRules) {
    return { status: 'to_verify', code: 'to_verify_no_rules',
      reason: `aucune règle validée pour le type « ${type} »`, matched: [], is_alcoholic };
  }

  if (type === 'food') return classifyFood(corpus, is_alcoholic);

  // Generic path for any future typed rule set (none today besides food).
  const excluded = firstMatch(rules.exclude, corpus);
  if (excluded) {
    return { status: 'excluded', code: excluded.rule.code,
      reason: excluded.rule.reason, matched: excluded.matched, is_alcoholic };
  }

  const accepted = firstMatch(rules.accept, corpus);
  if (accepted) {
    return { status: 'accepted', code: accepted.rule.code,
      reason: accepted.rule.reason, matched: accepted.matched, is_alcoholic };
  }

  return { status: 'to_verify', code: 'to_verify_insufficient',
    reason: 'informations insuffisantes pour déterminer la conservation', matched: [], is_alcoholic };
}

/** Convenience: classify a list, split by status. Order is preserved. */
export function filterLunaProducts(products: NormalizedProduct[]): {
  accepted: Array<{ product: NormalizedProduct; result: EligibilityResult }>;
  excluded: Array<{ product: NormalizedProduct; result: EligibilityResult }>;
  toVerify: Array<{ product: NormalizedProduct; result: EligibilityResult }>;
} {
  const accepted = [], excluded = [], toVerify = [];
  for (const product of products) {
    const result = isLunaEligibleProduct(product);
    const entry = { product, result };
    if (result.status === 'accepted') accepted.push(entry);
    else if (result.status === 'excluded') excluded.push(entry);
    else toVerify.push(entry);
  }
  return { accepted, excluded, toVerify };
}

/** Status prefix for display / logs, e.g. "EXCLU — boulangerie". */
export function formatEligibility(r: EligibilityResult): string {
  const prefix = r.status === 'accepted' ? 'ACCEPTÉ' : r.status === 'excluded' ? 'EXCLU' : 'À VÉRIFIER';
  return `${prefix} — ${r.reason}`;
}
