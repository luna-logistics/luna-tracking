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

    { code: 'excluded_cold_chain', reason: 'conservation au froid',
      keywords: ['a conserver au frais', 'conserver au frais', 'a conserver entre',
        'conserver entre', 'chaine du froid', 'conservation au froid', 'refrigere',
        'refrigeres', 'refrigerer', 'keep refrigerated', 'keep chilled', 'store chilled',
        'store refrigerated', 'maintenir au froid'] },

    // Generic fresh/perishable marker — last, so specific reasons win first.
    { code: 'excluded_fresh', reason: 'produit frais',
      keywords: ['frais', 'fraiche', 'fraiches', 'fresh', 'perissable',
        'a consommer rapidement', 'date courte'] },
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
function buildCorpus(p: NormalizedProduct): { text: string; words: Set<string> } {
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
  return { text, words: new Set(text.split(' ').filter(Boolean)) };
}

function matchKeyword(kw: string, corpus: { text: string; words: Set<string> }): boolean {
  const k = clean(kw);
  if (!k) return false;
  return k.includes(' ') ? corpus.text.includes(k) : corpus.words.has(k);
}

/** First rule whose keywords hit; returns the rule + the tokens that matched. */
function firstMatch(rules: KeywordRule[], corpus: { text: string; words: Set<string> }) {
  for (const rule of rules) {
    const matched = rule.keywords.filter((k) => matchKeyword(k, corpus));
    if (matched.length) return { rule, matched };
  }
  return null;
}

/**
 * Classify one normalised product.
 *
 * Precedence:
 *   1. no / unknown product_type            → to_verify
 *   2. type has no validated rules yet       → to_verify
 *   3. an exclude signal fires               → excluded (safety first)
 *   4. an accept signal fires                → accepted
 *   5. otherwise (no conclusive signal)      → to_verify
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
