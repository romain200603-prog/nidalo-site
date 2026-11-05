import { describe, expect, it } from 'vitest';
import { formatFraction, formatPinPrice, formatPrice, formatSignedAmount } from './format';

const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('formats', () => {
  it('écrit les prix et les bulles de la carte comme l’app', () => {
    expect(plain(formatPrice(238000))).toBe('238 000 €');
    expect(plain(formatPinPrice(238000, 'sale'))).toBe('238 k€');
    expect(plain(formatPinPrice(1_240_000, 'sale'))).toBe('1,2 M€');
    expect(plain(formatPinPrice(1_000_000, 'sale'))).toBe('1 M€');
    expect(plain(formatPinPrice(1200, 'rent'))).toBe('1 200 €/mois');
  });
  it('écrit les pourcentages et les cash-flows signés', () => {
    expect(plain(formatFraction(0.072))).toBe('7,2 %');
    expect(plain(formatSignedAmount(120))).toBe('+120 €');
    expect(plain(formatSignedAmount(-85.5))).toBe('−85,5 €');
    expect(plain(formatSignedAmount(0))).toBe('0 €');
  });
});
