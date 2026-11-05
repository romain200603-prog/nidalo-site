import { describe, expect, it } from 'vitest';
import { D, Decimal } from './decimal';
import {
  hasWarning, investmentAssumptions, investmentInputs, rentalBanYear, rentalInfo, sourced, STANDARD_ASSUMPTIONS,
  type EnergyClass, type InvestmentInputs, type InvestmentListing, type InvestmentProperty, type ValueOrigin,
} from './domain';
import { InvestmentCalculationError, InvestmentCalculator } from './investmentCalculator';

// Tests/InvestmentEngineTests/InvestmentCalculatorTests.swift

const calculator = new InvestmentCalculator();

type InputOptions = {
  price?: Decimal;
  rent?: Decimal | null;
  rentOrigin?: ValueOrigin;
  isRentPotential?: boolean;
  coOwnership?: Decimal | null;
  recoverable?: Decimal | null;
  tax?: Decimal | null;
  energyClass?: EnergyClass | null;
};

function inputs({
  price = D(180_000), rent = D(850), rentOrigin = 'seller', isRentPotential = false, coOwnership = D(120),
  recoverable = D(60), tax = D(900), energyClass = 'D',
}: InputOptions = {}): InvestmentInputs {
  return investmentInputs({
    propertyType: 'apartment',
    purchasePrice: sourced(price, 'seller'),
    monthlyRent: rent && sourced(rent, rentOrigin),
    isRentPotential,
    monthlyCoOwnershipCharges: coOwnership && sourced(coOwnership, 'seller'),
    recoverableMonthlyCharges: recoverable && sourced(recoverable, 'seller'),
    annualPropertyTax: tax && sourced(tax, 'seller'),
    energyClass,
  });
}

function calculationError(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof InvestmentCalculationError ? error.code : String(error);
  }
}

describe('InvestmentCalculator', () => {
  it('missingRentThrows', () => {
    expect(calculationError(() => calculator.calculate(inputs({ rent: null }), STANDARD_ASSUMPTIONS))).toBe('missingRent');
  });

  it('zeroPriceThrows', () => {
    expect(calculationError(() => calculator.calculate(inputs({ price: D(0) }), STANDARD_ASSUMPTIONS))).toBe('invalidPurchasePrice');
  });

  it('completeDataProducesNoDataWarnings', () => {
    const result = calculator.calculate(inputs(), STANDARD_ASSUMPTIONS);
    expect(result.warnings).toEqual([]);
    expect(result.calculationVersion).toBe(InvestmentCalculator.calculationVersion);
  });

  it('missingPropertyTaxIsEstimatedAndFlagged', () => {
    const result = calculator.calculate(inputs({ tax: null }), STANDARD_ASSUMPTIONS);
    expect(hasWarning(result, 'propertyTaxEstimated')).toBe(true);
    const line = result.line('propertyTax');
    expect(line).not.toBeNull();
    expect(line?.origin).toBe('estimated');
    expect(line?.amount.eq(850)).toBe(true);
  });

  it('sellerValuesKeepTheirOrigin', () => {
    const result = calculator.calculate(inputs(), STANDARD_ASSUMPTIONS);
    expect(result.line('monthlyRent')?.origin).toBe('seller');
    expect(result.line('propertyTax')?.origin).toBe('seller');
    expect(result.line('notaryFees')?.origin).toBe('estimated');
  });

  it('potentialRentIsFlagged', () => {
    const result = calculator.calculate(inputs({ isRentPotential: true }), STANDARD_ASSUMPTIONS);
    expect(hasWarning(result, 'rentIsPotential')).toBe(true);
  });

  it('unknownRecoverableChargesAreConservative', () => {
    const withRecoverable = calculator.calculate(inputs(), STANDARD_ASSUMPTIONS);
    const withoutRecoverable = calculator.calculate(inputs({ recoverable: null }), STANDARD_ASSUMPTIONS);
    expect(hasWarning(withoutRecoverable, 'recoverableChargesUnknown')).toBe(true);
    expect(withoutRecoverable.netYield.lt(withRecoverable.netYield)).toBe(true);
  });

  it('missingCoOwnershipChargesFlaggedForApartment', () => {
    const result = calculator.calculate(inputs({ coOwnership: null, recoverable: null }), STANDARD_ASSUMPTIONS);
    expect(hasWarning(result, 'coOwnershipChargesMissing')).toBe(true);
  });

  it.each(['E', 'F', 'G'] as const)('poorEnergyClassTriggersRentalRestriction (%s)', (energyClass) => {
    const result = calculator.calculate(inputs({ energyClass }), STANDARD_ASSUMPTIONS);
    const year = rentalBanYear(energyClass)!;
    expect(hasWarning(result, { kind: 'energyRentalRestriction', energyClass, year })).toBe(true);
    expect(year).toBe({ E: 2034, F: 2028, G: 2025 }[energyClass]);
  });

  it('largeDownPaymentMeansNoLoan', () => {
    const assumptions = investmentAssumptions({ downPayment: D(1_000_000) });
    const result = calculator.calculate(inputs(), assumptions);
    expect(result.loanAmount.eq(0)).toBe(true);
    expect(result.monthlyLoanPayment.eq(0)).toBe(true);
    expect(result.downPayment.eq(result.totalProjectCost)).toBe(true);
    expect(result.monthlyCashFlow.gt(0)).toBe(true);
  });

  it('higherRentIncreasesEveryIndicator', () => {
    const low = calculator.calculate(inputs({ rent: D(800) }), STANDARD_ASSUMPTIONS);
    const high = calculator.calculate(inputs({ rent: D(1_000) }), STANDARD_ASSUMPTIONS);
    expect(high.grossYield.gt(low.grossYield)).toBe(true);
    expect(high.netYield.gt(low.netYield)).toBe(true);
    expect(high.monthlyCashFlow.gt(low.monthlyCashFlow)).toBe(true);
  });

  it('highlightsForRentalListingAreNil', () => {
    const property: InvestmentProperty = { type: 'apartment', isNewBuild: false, energyClass: null };
    const listing: InvestmentListing = {
      transaction: 'rent', price: D(850), monthlyCharges: null, annualPropertyTax: null, worksAmount: null, rentalInfo: null,
    };
    expect(calculator.highlights(listing, property)).toBeNull();
  });

  it('highlightsForSaleWithRentalInfo', () => {
    const property: InvestmentProperty = { type: 'apartment', isNewBuild: false, energyClass: 'C' };
    const listing: InvestmentListing = {
      transaction: 'sale',
      price: D(180_000),
      monthlyCharges: D(120),
      annualPropertyTax: D(900),
      worksAmount: null,
      rentalInfo: rentalInfo({ currentMonthlyRent: D(850), isLeased: true, recoverableMonthlyCharges: D(60) }),
    };
    const highlights = calculator.highlights(listing, property);
    expect(highlights).not.toBeNull();
    expect(highlights!.grossYield.eq(D('0.0567'))).toBe(true);
    expect(highlights!.isRentEstimated).toBe(false);
  });
});
