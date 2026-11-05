import { describe, expect, it } from 'vitest';
import { D } from './decimal';
import { LoanMath } from './loanMath';

// Tests/InvestmentEngineTests/LoanMathTests.swift

describe('LoanMath', () => {
  it('standardMortgagePayment : 200 000 € à 3,5 % sur 20 ans ≈ 1 159,92 €/mois', () => {
    const payment = LoanMath.monthlyPayment(D(200_000), D('0.035'), 240);
    expect(payment.roundedToCents.eq(D('1159.92'))).toBe(true);
  });

  it('zeroRateIsLinear', () => {
    expect(LoanMath.monthlyPayment(D(120_000), D(0), 120).eq(1_000)).toBe(true);
  });

  it('noPrincipalMeansNoPayment', () => {
    expect(LoanMath.monthlyPayment(D(0), D('0.035'), 240).eq(0)).toBe(true);
    expect(LoanMath.monthlyInsurance(D(0), D('0.003')).eq(0)).toBe(true);
  });

  it('totalInterestIsPositive', () => {
    const interest = LoanMath.totalInterest(D(200_000), D('0.035'), 240);
    expect(interest.gt(78_000) && interest.lt(79_000)).toBe(true);
  });
});
