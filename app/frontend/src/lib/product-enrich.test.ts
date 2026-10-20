import { describe, expect, it } from 'vitest';
import { parseWeightKg } from './product-enrich';

describe('parseWeightKg', () => {
  it.each([
    ['AXE deo africa 150ml', 0.15],
    ['DOVE Beauty cream bar 4x90g', 0.36],
    ['SPA Reine 1,5L', 1.5],
    ['Johnnie Walker Red Label 70cl', 0.7],
    ['COME A CASA lasagne bolognaise 1kg', 1],
    ['ELNETT hairspr. extra fort +mini 2x400ml', 0.8],
    ['BONI lasagne bolognaise 1,6kg', 1.6],
    ['Jack Daniel\'s 1,75ltr', 1.75],
  ])('%s → %s kg', (name, kg) => {
    expect(parseWeightKg(name)).toBe(kg);
  });
  it('returns null without a unit', () => {
    expect(parseWeightKg('TENA Discreet Maxi 12pc')).toBeNull();
    expect(parseWeightKg('GARNIER Belle Color noir 80')).toBeNull();
  });
});
