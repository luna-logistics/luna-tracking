/**
 * HS (Harmonized System) tariff-code classifier for grocery / hygiene /
 * everyday goods — the categories Achat & Envoi ships. Rule-based on a
 * curated FR + EN keyword dictionary — no API call, works offline.
 *
 * Confidence scales with the number of distinct keywords that hit:
 *   high   = ≥ 3 matches (very unlikely a false positive)
 *   medium = 2
 *   low    = 1 (glance-check before accepting)
 *
 * Missing category = null returned. UI should surface "no suggestion,
 * please fill manually" — never guess a code the classifier didn't
 * commit to.
 *
 * Adding a new rule: append to HS_RULES. Keep keywords lowercase; the
 * matcher normalises input the same way. Include FR + EN keywords in
 * the same entry so the classifier works regardless of product-name
 * language.
 */

export type HsSuggestion = {
  code: string;
  labelFr: string;
  labelEn: string;
  confidence: 'high' | 'medium' | 'low';
  matched: string[];
};

type Rule = { keywords: string[]; code: string; labelFr: string; labelEn: string };

const HS_RULES: Rule[] = [
  // ─── Grains, flour, sugar ───────────────────────────────────────────────
  { keywords: ['riz', 'rice', 'basmati', 'jasmin', 'jasmine', 'long grain'],
    code: '1006.30', labelFr: 'Riz semi-blanchi ou blanchi', labelEn: 'Semi-milled or wholly milled rice' },
  { keywords: ['farine', 'flour', 'blé', 'wheat', 't55', 't65', 't45'],
    code: '1101.00', labelFr: 'Farine de blé', labelEn: 'Wheat flour' },
  { keywords: ['sucre', 'sugar', 'cassonade', 'granulé'],
    code: '1701.99', labelFr: 'Sucre raffiné', labelEn: 'Refined sugar' },
  { keywords: ['pâtes', 'pasta', 'spaghetti', 'penne', 'macaroni', 'nouilles', 'noodles'],
    code: '1902.19', labelFr: 'Pâtes alimentaires sèches', labelEn: 'Dry pasta' },
  { keywords: ['semoule', 'semolina', 'couscous'],
    code: '1103.11', labelFr: 'Semoule de blé', labelEn: 'Wheat semolina' },
  { keywords: ['maïs', 'corn', 'maize', 'polenta'],
    code: '1005.90', labelFr: 'Maïs', labelEn: 'Maize (corn)' },
  { keywords: ['haricot', 'bean', 'lentille', 'lentil', 'pois chiche', 'chickpea'],
    code: '0713.33', labelFr: 'Légumineuses séchées', labelEn: 'Dried pulses' },

  // ─── Fats & oils ─────────────────────────────────────────────────────────
  { keywords: ['huile', 'oil', 'tournesol', 'sunflower'],
    code: '1512.19', labelFr: 'Huile de tournesol raffinée', labelEn: 'Refined sunflower oil' },
  { keywords: ['olive', 'huile d\'olive'],
    code: '1509.10', labelFr: 'Huile d\'olive vierge', labelEn: 'Virgin olive oil' },
  { keywords: ['huile de palme', 'palm oil'],
    code: '1511.90', labelFr: 'Huile de palme raffinée', labelEn: 'Refined palm oil' },
  { keywords: ['beurre', 'butter'],
    code: '0405.10', labelFr: 'Beurre laitier', labelEn: 'Dairy butter' },
  { keywords: ['margarine'],
    code: '1517.10', labelFr: 'Margarine', labelEn: 'Margarine' },

  // ─── Dairy ────────────────────────────────────────────────────────────────
  { keywords: ['lait en poudre', 'milk powder', 'lait poudre', 'poudre de lait'],
    code: '0402.10', labelFr: 'Lait entier en poudre', labelEn: 'Whole milk powder' },
  { keywords: ['lait', 'milk', 'uht'],
    code: '0401.20', labelFr: 'Lait liquide', labelEn: 'Liquid milk' },
  { keywords: ['fromage', 'cheese', 'gouda', 'edam', 'cheddar'],
    code: '0406.10', labelFr: 'Fromage frais', labelEn: 'Fresh cheese' },
  { keywords: ['yaourt', 'yogurt', 'yoghurt'],
    code: '0403.20', labelFr: 'Yaourt', labelEn: 'Yogurt' },

  // ─── Canned / preserved ─────────────────────────────────────────────────
  { keywords: ['tomate', 'tomato', 'pelée', 'peeled', 'concentré', 'passata'],
    code: '2002.10', labelFr: 'Tomates préparées ou conservées', labelEn: 'Prepared or preserved tomatoes' },
  { keywords: ['sardine', 'sardines'],
    code: '1604.13', labelFr: 'Sardines en conserve', labelEn: 'Preserved sardines' },
  { keywords: ['thon', 'tuna'],
    code: '1604.14', labelFr: 'Thon en conserve', labelEn: 'Preserved tuna' },
  { keywords: ['corned beef', 'boeuf en conserve', 'viande en conserve'],
    code: '1602.50', labelFr: 'Viande de bovin préparée', labelEn: 'Prepared bovine meat' },
  { keywords: ['haricots rouges', 'red beans', 'kidney beans', 'haricots blancs', 'white beans'],
    code: '2005.51', labelFr: 'Haricots préparés', labelEn: 'Prepared beans' },

  // ─── Sauces / condiments ────────────────────────────────────────────────
  { keywords: ['mayonnaise'], code: '2103.90', labelFr: 'Mayonnaise', labelEn: 'Mayonnaise' },
  { keywords: ['ketchup'],    code: '2103.20', labelFr: 'Sauce tomate ketchup', labelEn: 'Tomato ketchup' },
  { keywords: ['moutarde', 'mustard'], code: '2103.30', labelFr: 'Moutarde', labelEn: 'Mustard' },
  { keywords: ['vinaigre', 'vinegar'], code: '2209.00', labelFr: 'Vinaigre', labelEn: 'Vinegar' },
  { keywords: ['sel', 'salt'],  code: '2501.00', labelFr: 'Sel', labelEn: 'Salt' },
  { keywords: ['piment', 'pepper', 'poivre'], code: '0904.11', labelFr: 'Poivre / piment', labelEn: 'Pepper / chili' },

  // ─── Snacks & sweet ─────────────────────────────────────────────────────
  { keywords: ['biscuit', 'cookie', 'gaufre', 'wafer'],
    code: '1905.31', labelFr: 'Biscuits sucrés', labelEn: 'Sweet biscuits' },
  { keywords: ['chocolat', 'chocolate', 'cacao'],
    code: '1806.32', labelFr: 'Chocolat', labelEn: 'Chocolate' },
  { keywords: ['confiture', 'jam', 'jelly', 'gelée'],
    code: '2007.99', labelFr: 'Confiture', labelEn: 'Jam' },
  { keywords: ['miel', 'honey'],
    code: '0409.00', labelFr: 'Miel naturel', labelEn: 'Natural honey' },

  // ─── Beverages ──────────────────────────────────────────────────────────
  { keywords: ['eau', 'water', 'minérale', 'mineral'],
    code: '2201.10', labelFr: 'Eau minérale', labelEn: 'Mineral water' },
  { keywords: ['jus', 'juice'],
    code: '2009.90', labelFr: 'Jus de fruits', labelEn: 'Fruit juice' },
  { keywords: ['soda', 'boisson gazeuse', 'coca', 'sprite', 'fanta'],
    code: '2202.10', labelFr: 'Boisson gazeuse sucrée', labelEn: 'Sweetened soft drink' },
  { keywords: ['café', 'coffee', 'nescafé', 'instant coffee'],
    code: '0901.21', labelFr: 'Café torréfié', labelEn: 'Roasted coffee' },
  { keywords: ['thé', 'tea'],
    code: '0902.30', labelFr: 'Thé noir', labelEn: 'Black tea' },
  { keywords: ['bière', 'beer'],
    code: '2203.00', labelFr: 'Bière', labelEn: 'Beer' },
  { keywords: ['vin', 'wine'],
    code: '2204.21', labelFr: 'Vin', labelEn: 'Wine' },

  // ─── Hygiene / cosmetics ────────────────────────────────────────────────
  { keywords: ['savon', 'soap', 'marseille'],
    code: '3401.11', labelFr: 'Savon de toilette', labelEn: 'Toilet soap' },
  { keywords: ['dentifrice', 'toothpaste'],
    code: '3306.10', labelFr: 'Dentifrice', labelEn: 'Toothpaste' },
  { keywords: ['brosse à dents', 'toothbrush'],
    code: '9603.21', labelFr: 'Brosse à dents', labelEn: 'Toothbrush' },
  { keywords: ['shampoing', 'shampooing', 'shampoo'],
    code: '3305.10', labelFr: 'Shampoing', labelEn: 'Shampoo' },
  { keywords: ['gel douche', 'shower gel', 'body wash'],
    code: '3401.30', labelFr: 'Gel douche', labelEn: 'Shower gel' },
  { keywords: ['déodorant', 'deodorant'],
    code: '3307.20', labelFr: 'Déodorant', labelEn: 'Deodorant' },
  { keywords: ['crème', 'cream', 'lotion', 'hydratante', 'moisturiser', 'moisturizer'],
    code: '3304.99', labelFr: 'Crème / lotion pour la peau', labelEn: 'Skin cream / lotion' },
  { keywords: ['parfum', 'perfume', 'fragrance'],
    code: '3303.00', labelFr: 'Parfum', labelEn: 'Perfume' },

  // ─── Baby & household ───────────────────────────────────────────────────
  { keywords: ['couches', 'couche', 'diapers', 'diaper', 'pampers'],
    code: '9619.00', labelFr: 'Couches pour bébé', labelEn: 'Baby diapers' },
  { keywords: ['lait infantile', 'infant formula', 'baby formula', 'lait bébé'],
    code: '1901.10', labelFr: 'Lait infantile', labelEn: 'Infant milk formula' },
  { keywords: ['lessive', 'detergent', 'laundry'],
    code: '3402.20', labelFr: 'Détergent à lessive', labelEn: 'Laundry detergent' },
  { keywords: ['javel', 'bleach'],
    code: '2828.90', labelFr: 'Eau de Javel', labelEn: 'Bleach' },
  { keywords: ['papier toilette', 'toilet paper', 'papier hygiénique'],
    code: '4818.10', labelFr: 'Papier hygiénique', labelEn: 'Toilet paper' },
  { keywords: ['essuie-tout', 'kitchen towel', 'paper towel', 'sopalin'],
    code: '4818.20', labelFr: 'Essuie-tout papier', labelEn: 'Paper kitchen towels' },
];

function normalise(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Suggest an HS code from a product name (or any short text). Returns
 * null when no rule matched at all — the caller must NOT silently apply
 * a fallback code.
 *
 * @param inputs any number of strings to search in (name_fr, name_en,
 *   description, ...); merged into one search corpus.
 */
export function suggestHsCode(...inputs: (string | null | undefined)[]): HsSuggestion | null {
  const corpus = normalise(inputs.filter(Boolean).join(' | '));
  if (!corpus.trim()) return null;

  let best: { rule: Rule; matched: string[] } | null = null;
  for (const rule of HS_RULES) {
    const matched = rule.keywords.filter((k) => corpus.includes(normalise(k)));
    if (matched.length === 0) continue;
    if (!best || matched.length > best.matched.length) best = { rule, matched };
  }
  if (!best) return null;

  const confidence: HsSuggestion['confidence'] =
    best.matched.length >= 3 ? 'high' : best.matched.length === 2 ? 'medium' : 'low';

  return {
    code: best.rule.code,
    labelFr: best.rule.labelFr,
    labelEn: best.rule.labelEn,
    confidence,
    matched: best.matched,
  };
}
