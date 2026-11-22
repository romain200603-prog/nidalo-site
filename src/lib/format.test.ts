import { describe, expect, it } from 'vitest';
import { formatAmount, formatFraction, formatPinPrice, formatPrice, formatSignedAmount } from './format';

const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('formats', () => {
  it('écrit les prix et les bulles de la carte comme l’app', () => {
    expect(plain(formatPrice(238000))).toBe('238 000 €');
    expect(plain(formatPinPrice(238000, 'sale'))).toBe('238 k€');
    expect(plain(formatPinPrice(1_240_000, 'sale'))).toBe('1,2 M€');
    expect(plain(formatPinPrice(1_000_000, 'sale'))).toBe('1 M€');
    expect(plain(formatPinPrice(1200, 'rent'))).toBe('1 200 €/mois');
  });
  it('arrondit la bulle aux milliers d’abord : 999 600 € donne « 1 M€ » (n° 153)', () => {
    expect(plain(formatPinPrice(999_600, 'sale'))).toBe('1 M€');
    expect(plain(formatPinPrice(999_500, 'sale'))).toBe('1 M€');
    expect(plain(formatPinPrice(999_499, 'sale'))).toBe('999 k€');
    expect(plain(formatPinPrice(1_250_000, 'sale'))).toBe('1,3 M€');
  });
  it('écrit un montant entier sans décimale, sinon avec exactement 2 (n° 142)', () => {
    expect(plain(formatAmount(450.5))).toBe('450,50 €');
    expect(plain(formatAmount(837.5))).toBe('837,50 €');
    expect(plain(formatAmount(450))).toBe('450 €');
    expect(plain(formatAmount(450.996))).toBe('451 €');
    expect(plain(formatAmount(1043.925))).toBe('1 043,93 €');
  });
  it('écrit les pourcentages et les cash-flows signés', () => {
    expect(plain(formatFraction(0.072))).toBe('7,2 %');
    expect(plain(formatSignedAmount(120))).toBe('+120 €');
    expect(plain(formatSignedAmount(-85.5))).toBe('−85,50 €');
    expect(plain(formatSignedAmount(0))).toBe('0 €');
  });
});
