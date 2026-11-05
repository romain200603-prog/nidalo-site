import { describe, expect, it } from 'vitest';
import { D } from './decimal';
import { investmentInputs, sourced, STANDARD_ASSUMPTIONS } from './domain';
import { FinancingSimulation, MonthlyBreakdown } from './financingSimulation';
import { InvestmentCalculator } from './investmentCalculator';

// Tests/InvestmentEngineTests/FinancingSimulationTests.swift — « Simulation du financement »

/** Appartement 3 pièces à Lyon 2e (données de démonstration). */
const lyon = investmentInputs({
  propertyType: 'apartment',
  purchasePrice: sourced(D(238_000), 'seller'),
  monthlyRent: sourced(D(1_547), 'seller'),
  isRentPotential: true,
  monthlyCoOwnershipCharges: sourced(D(80), 'seller'),
  recoverableMonthlyCharges: sourced(D(60), 'seller'),
  annualPropertyTax: sourced(D(900), 'seller'),
});

describe('FinancingSimulation', () => {
  it('defaultChoicesGiveTheCurrentFigures', () => {
    const current = new InvestmentCalculator().calculate(lyon, STANDARD_ASSUMPTIONS);
    const simulated = FinancingSimulation.standard.result(lyon);
    expect(simulated).toEqual(current);
    expect(simulated.monthlyCashFlow.eq(D('-62.18'))).toBe(true);
    expect(new MonthlyBreakdown(simulated).monthlyPayment.eq(D('1439.80'))).toBe(true);
  });

  it('breakdownAddsUpToTheCashFlow', () => {
    const breakdown = new MonthlyBreakdown(FinancingSimulation.standard.result(lyon));
    const sum = breakdown.entries.reduce((total, entry) => total.plus(entry.amount), D(0));
    expect(sum.roundedToCents.eq(breakdown.cashFlow)).toBe(true);
    expect(breakdown.entries.map((entry) => entry.kind)).toEqual(['collectedRent', 'loan', 'nonRecoverableCharges', 'propertyTax', 'landlordInsurance']);
  });

  it('zeroRateWorks', () => {
    const result = new FinancingSimulation(0, 20, 0).result(lyon);
    expect(result.monthlyLoanPayment.eq(result.loanAmount.dividedBy(240).roundedToCents)).toBe(true);
  });

  it('moreDownPaymentLowersThePayment', () => {
    const payments = FinancingSimulation.downPaymentOptions.map((share) =>
      new FinancingSimulation(share, 20, D('0.035')).result(lyon).monthlyLoanPayment);
    expect(payments[0].gt(payments[1]) && payments[1].gt(payments[2])).toBe(true);
  });

  it('shorterDurationRaisesThePayment', () => {
    const rate = D('0.035');
    const short = new FinancingSimulation(0, 15, rate).result(lyon);
    const long = new FinancingSimulation(0, 25, rate).result(lyon);
    expect(short.monthlyLoanPayment.gt(long.monthlyLoanPayment)).toBe(true);
  });

  it('cashFlowSignFollowsTheFinancing', () => {
    expect(FinancingSimulation.standard.result(lyon).monthlyCashFlow.lt(0)).toBe(true);
    // 20 % d'apport sur 25 ans à 3 % : le loyer couvre tout.
    const comfortable = new FinancingSimulation(D('0.20'), 25, D('0.030')).result(lyon);
    expect(comfortable.monthlyCashFlow.gt(0)).toBe(true);
  });

  it('yieldsDoNotDependOnFinancing', () => {
    const a = FinancingSimulation.standard.result(lyon);
    const b = new FinancingSimulation(D('0.20'), 15, D('0.040')).result(lyon);
    expect(a.grossYield.eq(b.grossYield) && a.netYield.eq(b.netYield)).toBe(true);
  });

  it('fixedDownPaymentFinancesTheRest', () => {
    const simulation = FinancingSimulation.standard.with({ fixedDownPayment: 50_000 });
    const result = simulation.result(lyon);
    expect(result.downPayment.eq(50_000)).toBe(true);
    expect(result.loanAmount.eq(result.totalProjectCost.minus(50_000))).toBe(true);
  });

  it('downPaymentAboveTheCostMeansNoLoan', () => {
    let simulation = FinancingSimulation.standard.with({ fixedDownPayment: 1_000_000 });
    const result = simulation.result(lyon);
    expect(result.loanAmount.eq(0)).toBe(true);
    expect(result.downPayment.eq(result.totalProjectCost)).toBe(true);
    simulation = simulation.with({ fixedDownPayment: FinancingSimulation.cashPurchase });
    expect(simulation.result(lyon).loanAmount.eq(0)).toBe(true);
  });

  it('garde les choix proposés par l’app', () => {
    expect(FinancingSimulation.standard).toMatchObject({ years: 20, fixedDownPayment: null });
    expect(FinancingSimulation.standard.annualRate.eq(D('0.035'))).toBe(true);
    expect(FinancingSimulation.durationOptions).toEqual([15, 20, 25]);
    expect(FinancingSimulation.rateOptions.map(String)).toEqual(['0.03', '0.035', '0.04']);
    expect(FinancingSimulation.downPaymentOptions.map(String)).toEqual(['0', '0.1', '0.2']);
    // Plus grande barre : le loyer encaissé, 1 547 × 12 × 0,96 / 12.
    expect(new MonthlyBreakdown(FinancingSimulation.standard.result(lyon)).largestAmount.eq(D('1485.12'))).toBe(true);
  });
});
