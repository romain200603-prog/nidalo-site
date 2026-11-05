import { describe, expect, it } from 'vitest';
import { D } from './decimal';
import {
  cashFlowTone, formatAmount, formatCashFlow, formatMonthYear, formatPercent, formatPrice, formatSignedAmount, GOOD_YIELD, yieldTone,
} from './display';
import { investmentForRow } from './row';

// L'app arrondit en décimal exact (égalité au pair pour les textes ICU, loin de zéro pour Decimal.rounded) ; les
// flottants et Intl.NumberFormat arrondissent autrement. Chaque cas ci-dessous est une égalité où l'arrondi naïf du
// navigateur afficherait autre chose que l'app.

const plain = (text: string | null) => text?.replace(/[  ]/g, ' ') ?? null;
const intlPercent = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const intlPrice = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const saleRow = (fields: Record<string, unknown>, rental: Record<string, unknown>) => ({
  transaction: 'sale', property_type: 'apartment', monthly_charges: null, annual_property_tax: null, works_amount: null,
  is_new_build: false, energy_class: 'C', ...fields, rental_info: { isLeased: true, ...rental },
});

describe('formatPercent (Formatters.percent)', () => {
  it('arrondit les égalités au chiffre pair, comme ICU sur un Decimal', () => {
    expect(plain(formatPercent(0.0565))).toBe('5,6 %');
    expect(plain(intlPercent.format(0.0565))).toBe('5,7 %'); // le piège
    expect(plain(formatPercent(0.0575))).toBe('5,8 %');
    expect(plain(formatPercent(0.0605))).toBe('6,0 %');
    expect(plain(formatPercent(0.0566))).toBe('5,7 %');
    expect(plain(formatPercent(D('0.0712')))).toBe('7,1 %');
    expect(plain(formatPercent(0.785, 0))).toBe('78 %');
  });

  it('garde le signe d’un négatif arrondi à zéro, comme ICU', () => {
    expect(plain(formatPercent(-0.0123))).toBe('-1,2 %');
    expect(plain(formatPercent(-0.0004))).toBe('-0,0 %');
    expect(plain(formatPercent(0))).toBe('0,0 %');
  });
});

describe('montants (Formatters.price, amount, signedAmount)', () => {
  it('arrondit le prix à l’euro, égalité au pair', () => {
    expect(plain(formatPrice(245000))).toBe('245 000 €');
    expect(plain(formatPrice(1400.5))).toBe('1 400 €');
    expect(plain(intlPrice.format(1400.5))).toBe('1 401 €'); // le piège
    expect(plain(formatPrice(1401.5))).toBe('1 402 €');
  });

  it('affiche les centimes seulement s’il y en a', () => {
    expect(plain(formatAmount(1043.93))).toBe('1 043,93 €');
    expect(plain(formatAmount(1043.9))).toBe('1 043,9 €');
    expect(plain(formatAmount(629))).toBe('629 €');
    expect(plain(formatAmount('1043.925'))).toBe('1 043,92 €');
  });

  it('signe les montants avec + et le vrai signe moins', () => {
    expect(plain(formatSignedAmount(120))).toBe('+120 €');
    expect(plain(formatSignedAmount(-85))).toBe('−85 €');
    expect(plain(formatSignedAmount(0))).toBe('0 €');
  });

  it('arrondit le cash-flow des cartes à l’euro loin de zéro (Decimal .plain), pas comme Math.round', () => {
    expect(plain(formatCashFlow(-420.5))).toBe('−421 €');
    expect(Math.round(-420.5)).toBe(-420); // le piège
    expect(plain(formatCashFlow(-628.81))).toBe('−629 €');
    expect(plain(formatCashFlow(440.69))).toBe('+441 €');
    expect(plain(formatCashFlow(-0.5))).toBe('−1 €');
    expect(plain(formatCashFlow(-0.4))).toBe('0 €');
    expect(cashFlowTone(-0.4)).toBe('negative'); // la couleur suit la valeur au centime
    expect(cashFlowTone(0)).toBe('neutral');
    expect(cashFlowTone(12.3)).toBe('positive');
  });
});

describe('couleurs et dates', () => {
  it('passe au vert à partir de 7 % brut', () => {
    expect(GOOD_YIELD.toString()).toBe('0.07');
    expect(yieldTone(0.07)).toBe('positive');
    expect(yieldTone(0.0699)).toBe('caution');
  });

  it('écrit le mois et l’année de fin de bail', () => {
    expect(formatMonthYear(new Date('2027-06-30T22:00:00Z'), 'Europe/Paris')).toBe('juillet 2027');
    expect(formatMonthYear(new Date('2027-06-15T12:00:00Z'), 'UTC')).toBe('juin 2027');
  });
});

describe('cartes : mêmes textes que l’app là où les flottants divergent', () => {
  it('rendement brut de 5,65 % pile : « 5,6 % »', () => {
    // 565 × 12 / 120 000 = 0,0565 exactement.
    const investment = investmentForRow(saleRow({ price: 120000, monthly_charges: 80, annual_property_tax: 650 }, { currentMonthlyRent: 565 }))!;
    expect(investment.grossYield).toBe(0.0565);
    expect(plain(investment.text.grossYield)).toBe('5,6 %');
    expect(plain(intlPercent.format(investment.grossYield))).toBe('5,7 %');
  });

  it('rendement net de 6,05 % pile avec l’apport de la recherche : « 6,0 % »', () => {
    // (13 248 − 2 850) / 172 000 = 0,060453… → 0,0605.
    const investment = investmentForRow(saleRow({ price: 160000, monthly_charges: 60, annual_property_tax: 1980 }, { currentMonthlyRent: 1150 }),
      { downPayment: 50000 })!;
    expect(investment.netYield).toBe(0.0605);
    expect(plain(investment.text.netYield)).toBe('6,0 %');
    expect(plain(investment.text.monthlyCashFlow)).toBe('+128 €'); // 128,45 €
  });

  it('cash-flow de −351,495 € : −351,50 € au centime, « −352 € » à l’euro', () => {
    // Loyers encaissés 1 155,13 × 12 × 0,96 = 13 307,0976 → 13 307,10 ; charges (125 × 12) + 630 + 150 = 2 280 ;
    // mensualité 1 217,92 € et assurance 52,50 € pour 210 000 € : 11 027,10 / 12 − 1 270,42 = −351,495 → −351,50.
    const investment = investmentForRow(saleRow({ price: 210000, monthly_charges: 125, annual_property_tax: 630 }, { currentMonthlyRent: 1155.13 }))!;
    expect(investment.result.monthlyLoanPayment.toString()).toBe('1217.92');
    expect(investment.monthlyCashFlow).toBe(-351.5);
    expect(plain(investment.text.monthlyCashFlow)).toBe('−352 €');
    // En flottants : −351,495 devient −351,49 au centime (Math.round arrondit les égalités vers +∞), affiché −351 €.
    const float = (13307.1 - 2280) / 12 - 1217.92 - 52.5;
    expect(Math.round(float * 100) / 100).toBe(-351.49);
  });

  it('cash-flow de −126,50 € : « −127 € »', () => {
    // 22 521,60 − 1 390 = 21 131,60 ; 21 131,60 / 12 − 1 809,47 − 78 = −126,50.
    const investment = investmentForRow(saleRow({ price: 312000, annual_property_tax: 1240 }, { currentMonthlyRent: 1955 }))!;
    expect(investment.monthlyCashFlow).toBe(-126.5);
    expect(plain(investment.text.monthlyCashFlow)).toBe('−127 €');
    expect(Math.round(investment.monthlyCashFlow)).toBe(-126);
  });

  it('rendement brut de 6,995 % : arrondi à 7,00 %, pastille verte', () => {
    // 1 399 × 12 / 240 000 = 0,06995 : arrondi commercial à 4 décimales → 0,0700 ≥ 7 %.
    const investment = investmentForRow(saleRow({ price: 240000, monthly_charges: 90, annual_property_tax: 1100 }, { currentMonthlyRent: 1399 }))!;
    expect(investment.grossYield).toBe(0.07);
    expect(investment.tone.yield).toBe('positive');
    expect(plain(investment.text.grossYield)).toBe('7,0 %');
  });

  it('loyer de 1 400,50 € : « 1 400 € », loyers annuels « 16 806 € »', () => {
    const investment = investmentForRow(saleRow({ price: 275000, monthly_charges: 180 }, { currentMonthlyRent: 1400.5 }))!;
    expect(plain(investment.text.currentRent)).toBe('1 400 €');
    expect(investment.annualRent).toBe(16806);
    expect(plain(investment.text.annualRent)).toBe('16 806 €');
  });
});
