import { describe, expect, it } from 'vitest';
import { detectCategorySlug } from './category-detect';

describe('detectCategorySlug', () => {
  it.each([
    ['NIVEA MEN gel raser pr.care/cool 200ml', 'razors'],
    ['SANEX dch dermo nourishing refill 500ml', 'shower-gel'],
    ['AXE deo africa 150ml', 'deodorant'],
    ['AXE gel douche black 400ml', 'shower-gel'],
    ['BONI papier toilette 3é 180f 16r', 'toilet-paper'],
    ['TENA Discreet Maxi 12pc', 'incontinence'],
    ['OB tampons ProComfort mini 32pc', 'tampons'],
    ['ALWAYS protège-slip normal fresh 9', 'sanitary-napkin'],
    ['DUREX préservatifs Thin Feel 12pc', 'intimate'],
    ['Johnnie Walker Black Label 70cl', 'alcohol'],
    ['DOVE deo fresh 0% melon/original 150ml', 'deodorant'],
    ['ORAL-B br. à dents élec. Pro1 Cross', 'toothbrush'],
    ['COLGATE dentifrice max insta 75ml', 'toothpaste'],
    ['HEAD&SHOULDERS anti-démangeaisons 250ml', 'shampoo'],
    ['ULTRA DOUX apres-shampoing grape 250ml', 'conditioner'],
    ['GARNIER Belle Color noir 80', 'hair-color'],
    ['ELNETT fixation forte 400ml', 'hair-styling'],
    ['GARNIER eau micellaire 400ml', 'face-care'],
    ['KLEENEX mouchoirs Balsam 24pc', 'tissues'],
  ])('%s → %s', (name, slug) => {
    expect(detectCategorySlug(name)).toBe(slug);
  });

  it('returns null for an unknown product', () => {
    expect(detectCategorySlug('Produit mystère 12pc')).toBeNull();
  });
});

describe('detectCategorySlug — cheese & dairy (family-restricted)', () => {
  const DAIRY = new Set(['eggs', 'cream', 'butter-margarine', 'plant-drinks', 'drinkable-yogurt', 'dairy-desserts', 'skyr-greek', 'grated-cheese', 'goat-cheese', 'italian-greek-cheese', 'soft-cheese', 'spread-cheese', 'fresh-cheese-desserts', 'yogurts', 'milk-drinks', 'sliced-cheese']);
  it.each([
    ['FLANDRIEN jeune réposé tranch 200g', 'sliced-cheese'],
    ['BONI Flan Caramel 4x100g', 'dairy-desserts'],
    ['EVERYDAY yaourt crème entier fruits 150g', 'yogurts'],
    ['PRÉSIDENT camembert crème 125g', 'soft-cheese'],
    ['MAREDSOUS from.tart. double crème 250g', 'spread-cheese'],
    ['BONI crème culinaire 20%mg brique 25cl', 'cream'],
    ['ALPRO soja tartiner 500g', 'butter-margarine'],
    ['ALPRO boisson soja 1L', 'plant-drinks'],
    ['VACHE BLEUE Fun Cheese Strings 80g', 'spread-cheese'],
    ['EVERYDAY emmental râpé 500g', 'grated-cheese'],
    ['CAMPINA Demi-écrémé Brique 1L', 'milk-drinks'],
    ['BONI oeufs Belges sol L 6pc', 'eggs'],
  ])('%s → %s', (name, slug) => {
    expect(detectCategorySlug(name, DAIRY)).toBe(slug);
  });
  it('without a family, food rules stay off', () => {
    expect(detectCategorySlug('BONI Flan Caramel 4x100g')).toBeNull();
  });
});

describe('detectCategorySlug — household cleaning (family-restricted)', () => {
  const HOUSEHOLD = new Set(['laundry-detergents', 'dishwashing', 'bathroom-wc', 'all-purpose-cleaners', 'floors-furniture', 'window-cleaners', 'cleaning-basics', 'drain-cleaners', 'air-fresheners', 'sponges-cloths', 'mops-brooms', 'bins-bags', 'food-wrap', 'paper-towels', 'pest-humidity', 'shoe-care']);
  it.each([
    ['DASH pods color 26pc', 'laundry-detergents'],
    ['LENOR perles parfum aérien 240g', 'laundry-detergents'],
    ['FINISH ULTIMATE tabs regular 16pc', 'dishwashing'],
    ['ECOVER vais.power bergamotte&sauge 450ml', 'dishwashing'],
    ['HARPIC WC-gel 100% détartrant 750ml', 'bathroom-wc'],
    ['AIR WICK PURE spray Coton 250ml', 'air-fresheners'],
    ['DESTOP gel turbo 1L', 'drain-cleaners'],
    ['VILEDA Dermoplus gant M 1p', 'sponges-cloths'],
    ['SWIFFER Wet Refills citrus 24pc', 'mops-brooms'],
    ['INTRADURA HVZ 60L 10pc', 'bins-bags'],
    ['TOPPITS sachets congélation 40x1L', 'food-wrap'],
    ['OKAY essuie-tout 2é 65f 4r', 'paper-towels'],
    ['LA CROIX eau de javel 5L', 'cleaning-basics'],
    ['CAROLIN nett.sol sav.marseille-orange 1L', 'floors-furniture'],
    ['HG nettoyant pour vitres 500ml', 'window-cleaners'],
    ['ÇA-VA-SEUL cirage chaussures noir 60ml', 'shoe-care'],
    ['MR PROPRE nettoie-tout fleurs coton 2L', 'all-purpose-cleaners'],
  ])('%s → %s', (name, slug) => {
    expect(detectCategorySlug(name, HOUSEHOLD)).toBe(slug);
  });
});
