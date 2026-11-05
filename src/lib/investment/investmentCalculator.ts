import { D, Decimal } from './decimal';
import {
  canComputeInvestment, inputsFromListing, InvestmentResult, isTypicallyCoOwnership, rentalBanYear, STANDARD_ASSUMPTIONS,
  type InvestmentAssumptions, type InvestmentHighlights, type InvestmentInputs, type InvestmentLine, type InvestmentListing,
  type InvestmentProperty, type InvestmentWarning, type SourcedValue,
} from './domain';
import { LoanMath } from './loanMath';
import { DefaultMissingValueEstimator, type MissingValueEstimating } from './missingValueEstimating';

// Moteur de rentabilité, recopié de InvestmentEngine/InvestmentCalculator.swift et InvestmentCalculating.swift.
// Tous les montants sont des Decimal (base 10) : mêmes arrondis que l'app, au centime près.

export type InvestmentCalculationErrorCode =
  /** Aucun loyer connu ni estimable : la rentabilité ne peut pas être calculée. */
  | 'missingRent'
  /** Prix d'achat nul ou négatif. */
  | 'invalidPurchasePrice';

export class InvestmentCalculationError extends Error {
  constructor(readonly code: InvestmentCalculationErrorCode) {
    super(code);
    this.name = 'InvestmentCalculationError';
  }
}

/** Contrat du moteur de rentabilité : les écrans dépendent de ce contrat, pas des formules. */
export interface InvestmentCalculating {
  calculate(inputs: InvestmentInputs, assumptions: InvestmentAssumptions): InvestmentResult;
}

/**
 * Implémentation par défaut du moteur de rentabilité.
 *
 * Conventions (identiques à l'app et aux cas de test partagés) :
 * - Rentabilité brute = loyers annuels / prix d'achat
 * - Rentabilité nette = (loyers encaissés − charges du propriétaire) / coût total du projet
 * - Cash-flow mensuel = (loyers encaissés − charges) / 12 − mensualité − assurance emprunteur
 * - Montants arrondis au centime, rendements à 4 décimales (0,0712 = 7,12 %)
 */
export class InvestmentCalculator implements InvestmentCalculating {
  static readonly calculationVersion = 1;

  constructor(private readonly estimator: MissingValueEstimating = new DefaultMissingValueEstimator()) {}

  calculate(inputs: InvestmentInputs, assumptions: InvestmentAssumptions): InvestmentResult {
    const price = inputs.purchasePrice.value;
    if (!price.gt(0)) throw new InvestmentCalculationError('invalidPurchasePrice');

    const lines: InvestmentLine[] = [];
    const warnings: InvestmentWarning[] = [];

    // Loyer
    let rent: SourcedValue<Decimal>;
    const estimated = inputs.monthlyRent ? null : this.estimator.estimatedMonthlyRent(inputs);
    if (inputs.monthlyRent) {
      rent = inputs.monthlyRent;
      if (inputs.isRentPotential) warnings.push({ kind: 'rentIsPotential' });
    } else if (estimated !== null) {
      rent = { value: estimated, origin: 'estimated' };
      warnings.push({ kind: 'rentEstimated' });
    } else {
      throw new InvestmentCalculationError('missingRent');
    }
    const monthlyRent = rent.value;

    // Coût du projet
    const notaryRate = inputs.isNewBuild ? assumptions.notaryFeeRateNewBuild : assumptions.notaryFeeRateExisting;
    const notaryFees = price.times(notaryRate).roundedToCents;
    const bankFees = assumptions.bankFees.roundedToCents;
    const acquisitionCosts = notaryFees.plus(bankFees);
    const works = inputs.worksAmount?.value ?? D(0);
    const furniture = inputs.furnitureAmount?.value ?? D(0);
    const totalProjectCost = price.plus(acquisitionCosts).plus(works).plus(furniture);

    lines.push({ kind: 'purchasePrice', amount: price, period: 'oneOff', origin: inputs.purchasePrice.origin });
    lines.push({ kind: 'notaryFees', amount: notaryFees, period: 'oneOff', origin: 'estimated' });
    if (bankFees.gt(0)) {
      lines.push({ kind: 'bankFees', amount: bankFees, period: 'oneOff', origin: 'user' });
    }
    if (inputs.worksAmount) {
      lines.push({ kind: 'works', amount: inputs.worksAmount.value, period: 'oneOff', origin: inputs.worksAmount.origin });
    }
    if (inputs.furnitureAmount) {
      lines.push({ kind: 'furniture', amount: inputs.furnitureAmount.value, period: 'oneOff', origin: inputs.furnitureAmount.origin });
    }

    // Financement
    const downPayment = Decimal.min(assumptions.downPayment ?? acquisitionCosts, totalProjectCost);
    const loanAmount = Decimal.max(0, totalProjectCost.minus(downPayment));
    const monthlyLoanPayment = LoanMath.monthlyPayment(loanAmount, assumptions.loanAnnualRate, assumptions.loanDurationMonths).roundedToCents;
    const monthlyLoanInsurance = LoanMath.monthlyInsurance(loanAmount, assumptions.borrowerInsuranceAnnualRate).roundedToCents;

    lines.push({ kind: 'downPayment', amount: downPayment, period: 'oneOff', origin: 'user' });
    lines.push({ kind: 'loanAmount', amount: loanAmount, period: 'oneOff', origin: 'estimated' });
    if (loanAmount.gt(0)) {
      lines.push({ kind: 'loanPayment', amount: monthlyLoanPayment, period: 'monthly', origin: 'estimated' });
      lines.push({ kind: 'borrowerInsurance', amount: monthlyLoanInsurance, period: 'monthly', origin: 'estimated' });
    }

    // Revenus
    const annualGrossRent = monthlyRent.times(12);
    const annualCollectedRent = annualGrossRent.times(D(1).minus(assumptions.vacancyRate)).roundedToCents;
    const annualVacancy = annualGrossRent.minus(annualCollectedRent);
    lines.push({ kind: 'monthlyRent', amount: monthlyRent, period: 'monthly', origin: rent.origin });
    if (annualVacancy.gt(0)) {
      lines.push({ kind: 'vacancy', amount: annualVacancy, period: 'annual', origin: 'estimated' });
    }

    // Charges du propriétaire
    let propertyTax: Decimal;
    if (inputs.annualPropertyTax) {
      propertyTax = inputs.annualPropertyTax.value;
      lines.push({ kind: 'propertyTax', amount: propertyTax, period: 'annual', origin: inputs.annualPropertyTax.origin });
    } else {
      propertyTax = this.estimator.estimatedAnnualPropertyTax(inputs, monthlyRent) ?? D(0);
      warnings.push({ kind: 'propertyTaxEstimated' });
      lines.push({ kind: 'propertyTax', amount: propertyTax, period: 'annual', origin: 'estimated' });
    }

    let annualNonRecoverableCharges = D(0);
    const coOwnership = inputs.monthlyCoOwnershipCharges;
    if (coOwnership) {
      // Part récupérable inconnue : on suppose prudemment qu'aucune charge n'est refacturée au locataire.
      const recoverable = inputs.recoverableMonthlyCharges?.value ?? D(0);
      if (!inputs.recoverableMonthlyCharges && coOwnership.value.gt(0)) {
        warnings.push({ kind: 'recoverableChargesUnknown' });
      }
      annualNonRecoverableCharges = Decimal.max(0, coOwnership.value.minus(recoverable)).times(12).roundedToCents;
      lines.push({ kind: 'coOwnershipCharges', amount: coOwnership.value, period: 'monthly', origin: coOwnership.origin });
      if (inputs.recoverableMonthlyCharges) {
        const recoverableCharges = inputs.recoverableMonthlyCharges;
        lines.push({ kind: 'recoverableCharges', amount: recoverableCharges.value, period: 'monthly', origin: recoverableCharges.origin });
      }
    } else if (isTypicallyCoOwnership(inputs.propertyType)) {
      warnings.push({ kind: 'coOwnershipChargesMissing' });
    }

    const landlordInsurance = assumptions.annualLandlordInsurance;
    const managementFees = annualCollectedRent.times(assumptions.managementFeeRate).roundedToCents;
    const maintenance = annualCollectedRent.times(assumptions.maintenanceRate).roundedToCents;
    lines.push({ kind: 'landlordInsurance', amount: landlordInsurance, period: 'annual', origin: 'estimated' });
    if (managementFees.gt(0)) {
      lines.push({ kind: 'managementFees', amount: managementFees, period: 'annual', origin: 'user' });
    }
    if (maintenance.gt(0)) {
      lines.push({ kind: 'maintenance', amount: maintenance, period: 'annual', origin: 'user' });
    }

    const annualOperatingExpenses = annualNonRecoverableCharges.plus(propertyTax).plus(landlordInsurance).plus(managementFees)
      .plus(maintenance).roundedToCents;
    const annualNetOperatingIncome = annualCollectedRent.minus(annualOperatingExpenses);

    // Indicateurs
    const grossYield = annualGrossRent.dividedBy(price).rounded(4);
    const netYield = annualNetOperatingIncome.dividedBy(totalProjectCost).rounded(4);
    const monthlyCashFlow = annualNetOperatingIncome.dividedBy(12).minus(monthlyLoanPayment).minus(monthlyLoanInsurance).roundedToCents;

    const banYear = inputs.energyClass ? rentalBanYear(inputs.energyClass) : null;
    if (inputs.energyClass && banYear !== null) {
      warnings.push({ kind: 'energyRentalRestriction', energyClass: inputs.energyClass, year: banYear });
    }

    return new InvestmentResult({
      purchasePrice: price,
      notaryFees,
      bankFees,
      worksAmount: works,
      furnitureAmount: furniture,
      acquisitionCosts,
      totalProjectCost,
      downPayment,
      loanAmount,
      monthlyLoanPayment,
      monthlyLoanInsurance,
      annualGrossRent,
      annualCollectedRent,
      annualOperatingExpenses,
      grossYield,
      netYield,
      monthlyCashFlow,
      lines,
      warnings,
      calculationVersion: InvestmentCalculator.calculationVersion,
    });
  }

  /**
   * Indicateurs d'une annonce avec les hypothèses standard (`highlights(for:property:)`).
   * null si l'annonce n'est pas une vente ou si les données sont insuffisantes.
   */
  highlights(listing: InvestmentListing, property: InvestmentProperty): InvestmentHighlights | null {
    const inputs = inputsFromListing(listing, property);
    if (!inputs) return null;
    try {
      return this.calculate(inputs, STANDARD_ASSUMPTIONS).highlights;
    } catch (error) {
      if (error instanceof InvestmentCalculationError) return null;
      throw error;
    }
  }
}

/**
 * Analyse d'une annonce pour ses cartes (`ListingSummary(details:calculator:)` et `highlights(_:downPayment:)` de
 * SupabaseListingRepository) : seulement si l'analyse est possible, sinon null.
 */
export function listingInvestment(
  listing: InvestmentListing,
  property: InvestmentProperty,
  assumptions: InvestmentAssumptions = STANDARD_ASSUMPTIONS,
  calculator: InvestmentCalculating = new InvestmentCalculator(),
): InvestmentResult | null {
  if (!canComputeInvestment(listing)) return null;
  const inputs = inputsFromListing(listing, property);
  if (!inputs) return null;
  try {
    return calculator.calculate(inputs, assumptions);
  } catch (error) {
    if (error instanceof InvestmentCalculationError) return null;
    throw error;
  }
}
