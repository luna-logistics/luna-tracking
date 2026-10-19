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
