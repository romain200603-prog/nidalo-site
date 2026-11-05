import { describe, expect, it } from 'vitest';
import { D, Decimal } from './decimal';
import { investmentAssumptions, investmentInputs, sourced, type InvestmentAssumptions, type InvestmentInputs } from './domain';
import { InvestmentCalculator } from './investmentCalculator';
import { INVESTMENT_CASES, type InvestmentCase } from './investmentCases.test-data';

// Tests/InvestmentEngineTests/InvestmentFixtureTests.swift : cas de référence partagés (Fixtures/investment-cases.json).

const decimal = (text: string | null | undefined): Decimal | null => (text == null ? null : Decimal.parse(text, false));
const sourcedValue = (text: string | null | undefined) => {
  const value = decimal(text);
  return value === null ? null : sourced(value, 'seller');
};

function makeInputs(inputs: InvestmentCase['inputs']): InvestmentInputs {
  return investmentInputs({
    propertyType: inputs.coOwnership == null ? 'house' : 'apartment',
    purchasePrice: sourced(decimal(inputs.purchasePrice)!, 'seller'),
    monthlyRent: sourcedValue(inputs.monthlyRent),
    monthlyCoOwnershipCharges: sourcedValue(inputs.coOwnership),
    recoverableMonthlyCharges: sourcedValue(inputs.recoverable),
    annualPropertyTax: sourcedValue(inputs.propertyTax),
    worksAmount: sourcedValue(inputs.works),
    furnitureAmount: sourcedValue(inputs.furniture),
    isNewBuild: inputs.isNewBuild ?? false,
  });
}

function makeAssumptions(assumptions: InvestmentCase['assumptions']): InvestmentAssumptions {
  return investmentAssumptions({
    notaryFeeRateExisting: decimal(assumptions.notaryOld)!,
    notaryFeeRateNewBuild: decimal(assumptions.notaryNew)!,
    bankFees: decimal(assumptions.bankFees)!,
    vacancyRate: decimal(assumptions.vacancy)!,
    managementFeeRate: decimal(assumptions.management)!,
    maintenanceRate: decimal(assumptions.maintenance)!,
    annualLandlordInsurance: decimal(assumptions.pno)!,
    downPayment: decimal(assumptions.downPayment),
    loanAnnualRate: decimal(assumptions.loanRate)!,
    loanDurationMonths: assumptions.months,
    borrowerInsuranceAnnualRate: decimal(assumptions.insuranceRate)!,
  });
}

describe('InvestmentFixtureTests', () => {
  it('fixturesAreLoaded', () => {
    expect(INVESTMENT_CASES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(INVESTMENT_CASES.map((fixture) => [fixture.name, fixture] as const))('matchesReferenceValues : %s', (_name, fixture) => {
    const result = new InvestmentCalculator().calculate(makeInputs(fixture.inputs), makeAssumptions(fixture.assumptions));
    const money: [string, Decimal][] = [
      ['notaryFees', result.notaryFees],
      ['totalProjectCost', result.totalProjectCost],
      ['loanAmount', result.loanAmount],
      ['monthlyLoanPayment', result.monthlyLoanPayment],
      ['monthlyLoanInsurance', result.monthlyLoanInsurance],
      ['annualCollectedRent', result.annualCollectedRent],
      ['annualOperatingExpenses', result.annualOperatingExpenses],
      ['monthlyCashFlow', result.monthlyCashFlow],
    ];
    for (const [key, actual] of money) {
      const expected = decimal(fixture.expected[key]);
      expect(expected, `valeur attendue manquante : ${key}`).not.toBeNull();
      expect(actual.minus(expected!).abs().lte(D('0.01')), `${key} : obtenu ${actual}, attendu ${expected}`).toBe(true);
      // Plus strict que la tolérance de Swift : au centime près.
      expect(actual.eq(expected!), `${key} : obtenu ${actual}, attendu ${expected}`).toBe(true);
    }
    const yields: [string, Decimal][] = [['grossYield', result.grossYield], ['netYield', result.netYield]];
    for (const [key, actual] of yields) {
      const expected = decimal(fixture.expected[key]);
      expect(expected, `valeur attendue manquante : ${key}`).not.toBeNull();
      expect(actual.minus(expected!).abs().lte(D('0.0001')), `${key} : obtenu ${actual}, attendu ${expected}`).toBe(true);
      expect(actual.eq(expected!), `${key} : obtenu ${actual}, attendu ${expected}`).toBe(true);
    }
  });
});
