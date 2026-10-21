import { describe, expect, it } from 'vitest';
import { byCategoryName, compareLabels } from './sort-labels';

describe('compareLabels', () => {
  it('ignores case and accents', () => {
    const list = ['Hygiène', 'électronique', 'Boissons', 'Épicerie', 'alcool'];
    expect([...list].sort((a, b) => compareLabels(a, b))).toEqual(['alcool', 'Boissons', 'électronique', 'Épicerie', 'Hygiène']);
  });
  it('sorts numbers naturally', () => {
    expect(['Pack 10', 'Pack 2'].sort((a, b) => compareLabels(a, b))).toEqual(['Pack 2', 'Pack 10']);
  });
});

describe('byCategoryName', () => {
  const cats = [
    { name_fr: 'Vitres', name_en: 'Glass cleaners' },
    { name_fr: 'Balais', name_en: 'Mops' },
  ];
  it('uses the name in the requested language', () => {
    expect([...cats].sort(byCategoryName('fr')).map((c) => c.name_fr)).toEqual(['Balais', 'Vitres']);
    expect([...cats].sort(byCategoryName('en')).map((c) => c.name_en)).toEqual(['Glass cleaners', 'Mops']);
  });
});
