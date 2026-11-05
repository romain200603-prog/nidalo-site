// Moteur de rentabilité de l'app (Packages/ImmoKit/Sources/InvestmentEngine et ImmoDomain/Investment), recopié pour le
// site : mêmes formules, même Decimal en base 10, mêmes arrondis. Point d'entrée des cartes : investmentForRow.

export { D, Decimal } from './decimal';
export type { DecimalLike, RoundingMode } from './decimal';
export {
  canComputeInvestment, ENERGY_CLASSES, hasWarning, inputsFromListing, INVESTMENT_LINE_KINDS, investmentAssumptions,
  investmentInputs, InvestmentResult, isTypicallyCoOwnership, PROPERTY_TYPES, referenceMonthlyRent, rentalBanYear,
  rentalInfo, sourced, STANDARD_ASSUMPTIONS,
} from './domain';
export type {
  EnergyClass, InvestmentAssumptions, InvestmentHighlights, InvestmentInputs, InvestmentLine, InvestmentLineKind,
  InvestmentLinePeriod, InvestmentListing, InvestmentProperty, InvestmentResultFields, InvestmentWarning, PropertyType,
  RentalInfo, SourcedValue, TransactionType, ValueOrigin,
} from './domain';
export { LoanMath } from './loanMath';
export { DefaultMissingValueEstimator } from './missingValueEstimating';
export type { MissingValueEstimating } from './missingValueEstimating';
export { InvestmentCalculationError, InvestmentCalculator, listingInvestment } from './investmentCalculator';
export type { InvestmentCalculating, InvestmentCalculationErrorCode } from './investmentCalculator';
export { FinancingSimulation, MonthlyBreakdown } from './financingSimulation';
export type { MonthlyBreakdownEntry, MonthlyBreakdownKind } from './financingSimulation';
export { HotelPerformance, RentalCost } from './rentalAndHotelFigures';
export type { RentalVerdict } from './rentalAndHotelFigures';
export {
  cashFlowTone, formatAmount, formatCashFlow, formatMonthYear, formatPercent, formatPrice, formatSignedAmount, GOOD_YIELD,
  yieldTone,
} from './display';
export type { CashFlowTone, YieldTone } from './display';
export {
  assumptionsFor, INVEST_SEARCH_OPTIONS, inputsFromRow, INVESTMENT_COLUMNS, investmentForRow, listingFromRow, STANDARD_OPTIONS,
} from './row';
export type { CardInvestment, InvestmentColumn, InvestmentOptions, InvestmentRow } from './row';
