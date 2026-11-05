import { D, Decimal } from './decimal';

// Types du moteur, comme ImmoDomain : Common/ValueOrigin.swift, Property/PropertyType.swift, Property/EnergyClass.swift,
// Listing/Listing.swift (RentalInfo), Investment/InvestmentAssumptions.swift, InvestmentInputs.swift,
// InvestmentResult.swift et Listing/ListingSummary.swift (InvestmentHighlights).

/** Provenance d'une valeur : vendeur, estimée par l'app, saisie par l'utilisateur, source partenaire. */
export type ValueOrigin = 'seller' | 'estimated' | 'user' | 'partner';

/** Une valeur accompagnée de sa provenance. */
export type SourcedValue<T> = { value: T; origin: ValueOrigin };

export const sourced = <T>(value: T, origin: ValueOrigin): SourcedValue<T> => ({ value, origin });

export type TransactionType = 'sale' | 'rent';

export const PROPERTY_TYPES = ['apartment', 'house', 'building', 'land', 'commercial', 'office', 'parking', 'hotel', 'other'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Bien généralement soumis au régime de la copropriété (charges de copropriété). */
export const isTypicallyCoOwnership = (type: PropertyType): boolean => type === 'apartment' || type === 'parking';

/** Classe énergie (DPE), de A (meilleure) à G. */
export const ENERGY_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export type EnergyClass = (typeof ENERGY_CLASSES)[number];

/** Année d'interdiction de mise en location (loi Climat et Résilience) ; null si aucune. */
export function rentalBanYear(energyClass: EnergyClass): number | null {
  switch (energyClass) {
    case 'G': return 2025;
    case 'F': return 2028;
    case 'E': return 2034;
    default: return null;
  }
}

/** Informations locatives d'une vente (`RentalInfo`) : loyers actuel et potentiel restent distincts. */
export type RentalInfo = {
  /** Loyer hors charges actuellement perçu (bien loué). */
  currentMonthlyRent: Decimal | null;
  /** Loyer hors charges envisageable selon le vendeur. */
  potentialMonthlyRent: Decimal | null;
  /** Bien vendu loué (bail en cours). */
  isLeased: boolean;
  leaseEndDate: Date | null;
  availableFrom: Date | null;
  /** Part des charges de copropriété refacturée au locataire, par mois. */
  recoverableMonthlyCharges: Decimal | null;
  isFurnished: boolean | null;
  securityDeposit: Decimal | null;
  leaseDurationMonths: number | null;
};

export function rentalInfo(fields: Partial<RentalInfo> = {}): RentalInfo {
  return {
    currentMonthlyRent: null, potentialMonthlyRent: null, isLeased: false, leaseEndDate: null, availableFrom: null,
    recoverableMonthlyCharges: null, isFurnished: null, securityDeposit: null, leaseDurationMonths: null, ...fields,
  };
}

/** Loyer retenu pour les calculs : le loyer actuel s'il existe, sinon le loyer potentiel. */
export const referenceMonthlyRent = (rental: RentalInfo): Decimal | null => rental.currentMonthlyRent ?? rental.potentialMonthlyRent;

/** Champs d'une annonce (`Listing`) lus par le moteur. */
export type InvestmentListing = {
  transaction: TransactionType;
  /** Prix de vente (FAI) ou loyer mensuel hors charges pour une location. */
  price: Decimal;
  /** Charges de copropriété mensuelles (vente) ou provisions sur charges (location). */
  monthlyCharges: Decimal | null;
  annualPropertyTax: Decimal | null;
  worksAmount: Decimal | null;
  rentalInfo: RentalInfo | null;
};

/** Champs du bien (`Property`) lus par le moteur. */
export type InvestmentProperty = { type: PropertyType; isNewBuild: boolean; energyClass: EnergyClass | null };

/** Une analyse de rentabilité est possible : bien en vente avec un loyer connu (`canComputeInvestment`). */
export const canComputeInvestment = (listing: InvestmentListing): boolean =>
  listing.transaction === 'sale' && listing.rentalInfo !== null && referenceMonthlyRent(listing.rentalInfo) !== null;

/**
 * Hypothèses de calcul (`InvestmentAssumptions`). Les valeurs par défaut sont volontairement prudentes et toujours
 * modifiables par l'utilisateur dans le simulateur.
 */
export type InvestmentAssumptions = {
  /** Frais de notaire dans l'ancien (≈ 7 à 8 %). */
  notaryFeeRateExisting: Decimal;
  /** Frais de notaire dans le neuf (≈ 2 à 3 %). */
  notaryFeeRateNewBuild: Decimal;
  /** Frais bancaires : dossier, garantie… */
  bankFees: Decimal;
  /** Part de l'année sans locataire (0,04 ≈ 2 semaines). */
  vacancyRate: Decimal;
  /** Frais de gestion locative en % des loyers encaissés (0 = gestion en direct). */
  managementFeeRate: Decimal;
  /** Provision pour entretien en % des loyers encaissés. */
  maintenanceRate: Decimal;
  /** Assurance propriétaire non occupant, par an. */
  annualLandlordInsurance: Decimal;
  /** Apport personnel. null = l'apport couvre les frais d'acquisition (cas le plus courant). */
  downPayment: Decimal | null;
  /** Taux nominal annuel du crédit (0,035 = 3,5 %). */
  loanAnnualRate: Decimal;
  loanDurationMonths: number;
  /** Taux annuel de l'assurance emprunteur, appliqué au capital emprunté. */
  borrowerInsuranceAnnualRate: Decimal;
};

/** `InvestmentAssumptions(...)` avec les valeurs par défaut de l'app. */
export function investmentAssumptions(overrides: Partial<InvestmentAssumptions> = {}): InvestmentAssumptions {
  return {
    notaryFeeRateExisting: D('0.075'),
    notaryFeeRateNewBuild: D('0.025'),
    bankFees: D(0),
    vacancyRate: D('0.04'),
    managementFeeRate: D(0),
    maintenanceRate: D(0),
    annualLandlordInsurance: D(150),
    downPayment: null,
    loanAnnualRate: D('0.035'),
    loanDurationMonths: 240,
    borrowerInsuranceAnnualRate: D('0.003'),
    ...overrides,
  };
}

/** Hypothèses standard utilisées pour classer et filtrer les annonces (`InvestmentAssumptions.standard`). */
export const STANDARD_ASSUMPTIONS: Readonly<InvestmentAssumptions> = Object.freeze(investmentAssumptions());

/** Données d'un bien utilisées par le moteur (`InvestmentInputs`) ; chaque valeur porte sa provenance. */
export type InvestmentInputs = {
  propertyType: PropertyType;
  purchasePrice: SourcedValue<Decimal>;
  /** Loyer mensuel hors charges. */
  monthlyRent: SourcedValue<Decimal> | null;
  /** true si le loyer est un loyer potentiel (bien non loué actuellement). */
  isRentPotential: boolean;
  monthlyCoOwnershipCharges: SourcedValue<Decimal> | null;
  recoverableMonthlyCharges: SourcedValue<Decimal> | null;
  annualPropertyTax: SourcedValue<Decimal> | null;
  worksAmount: SourcedValue<Decimal> | null;
  furnitureAmount: SourcedValue<Decimal> | null;
  isNewBuild: boolean;
  energyClass: EnergyClass | null;
};

/** `InvestmentInputs(...)` : les champs absents prennent les valeurs par défaut de Swift. */
export function investmentInputs(
  fields: Pick<InvestmentInputs, 'propertyType' | 'purchasePrice'> & Partial<InvestmentInputs>,
): InvestmentInputs {
  return {
    monthlyRent: null, isRentPotential: false, monthlyCoOwnershipCharges: null, recoverableMonthlyCharges: null,
    annualPropertyTax: null, worksAmount: null, furnitureAmount: null, isNewBuild: false, energyClass: null, ...fields,
  };
}

/** `InvestmentInputs(listing:property:sourceOrigin:)` : entrées d'une annonce de vente ; null pour une location. */
export function inputsFromListing(
  listing: InvestmentListing,
  property: InvestmentProperty,
  sourceOrigin: ValueOrigin = 'seller',
): InvestmentInputs | null {
  if (listing.transaction !== 'sale') return null;
  const rental = listing.rentalInfo;
  const source = (value: Decimal | null | undefined) => (value == null ? null : sourced(value, sourceOrigin));
  const rent = rental ? referenceMonthlyRent(rental) : null;
  return investmentInputs({
    propertyType: property.type,
    purchasePrice: sourced(listing.price, sourceOrigin),
    monthlyRent: source(rent),
    isRentPotential: rental?.currentMonthlyRent == null && rental?.potentialMonthlyRent != null,
    monthlyCoOwnershipCharges: source(listing.monthlyCharges),
    recoverableMonthlyCharges: source(rental?.recoverableMonthlyCharges),
    annualPropertyTax: source(listing.annualPropertyTax),
    worksAmount: source(listing.worksAmount),
    isNewBuild: property.isNewBuild,
    energyClass: property.energyClass,
  });
}

/** Nature d'une ligne du détail financier. */
export const INVESTMENT_LINE_KINDS = [
  'purchasePrice', 'notaryFees', 'bankFees', 'works', 'furniture', 'downPayment', 'loanAmount', 'monthlyRent', 'vacancy',
  'coOwnershipCharges', 'recoverableCharges', 'propertyTax', 'landlordInsurance', 'managementFees', 'maintenance',
  'loanPayment', 'borrowerInsurance',
] as const;
export type InvestmentLineKind = (typeof INVESTMENT_LINE_KINDS)[number];
export type InvestmentLinePeriod = 'oneOff' | 'monthly' | 'annual';

/** Une ligne du détail affiché dans l'analyse financière, avec sa provenance. */
export type InvestmentLine = { kind: InvestmentLineKind; amount: Decimal; period: InvestmentLinePeriod; origin: ValueOrigin };

/** Points d'attention signalés à l'investisseur. */
export type InvestmentWarning =
  /** Le loyer est un loyer potentiel, pas un loyer réellement perçu. */
  | { kind: 'rentIsPotential' }
  /** Le loyer a été estimé par l'application. */
  | { kind: 'rentEstimated' }
  /** Taxe foncière non renseignée : une estimation est utilisée. */
  | { kind: 'propertyTaxEstimated' }
  /** Bien en copropriété sans charges renseignées. */
  | { kind: 'coOwnershipChargesMissing' }
  /** Part récupérable des charges inconnue : on suppose (prudemment) qu'aucune charge n'est refacturée. */
  | { kind: 'recoverableChargesUnknown' }
  /** Classe énergie concernée par une interdiction de mise en location. */
  | { kind: 'energyRentalRestriction'; energyClass: EnergyClass; year: number };

/** Indicateurs clés affichés sur une carte d'annonce (`InvestmentHighlights`). */
export type InvestmentHighlights = {
  grossYield: Decimal;
  netYield: Decimal;
  monthlyCashFlow: Decimal;
  /** true si le loyer utilisé est estimé et non déclaré par le vendeur. */
  isRentEstimated: boolean;
};

export type InvestmentResultFields = {
  // Coût du projet
  purchasePrice: Decimal;
  notaryFees: Decimal;
  bankFees: Decimal;
  worksAmount: Decimal;
  furnitureAmount: Decimal;
  /** Frais d'acquisition = notaire + frais bancaires. */
  acquisitionCosts: Decimal;
  totalProjectCost: Decimal;
  // Financement
  downPayment: Decimal;
  loanAmount: Decimal;
  monthlyLoanPayment: Decimal;
  monthlyLoanInsurance: Decimal;
  // Exploitation
  /** Loyers annuels théoriques (12 mois, sans vacance). */
  annualGrossRent: Decimal;
  /** Loyers annuels après vacance locative. */
  annualCollectedRent: Decimal;
  /** Charges annuelles du propriétaire (hors crédit). */
  annualOperatingExpenses: Decimal;
  // Indicateurs (fractions : 0,0712 = 7,12 %)
  /** Loyers annuels / prix d'achat. */
  grossYield: Decimal;
  /** (Loyers encaissés − charges) / coût total du projet. */
  netYield: Decimal;
  /** Trésorerie mensuelle après crédit et charges (négatif = effort d'épargne). */
  monthlyCashFlow: Decimal;
  lines: InvestmentLine[];
  warnings: InvestmentWarning[];
  /** Version des formules, pour recalculer si elles évoluent. */
  calculationVersion: number;
};

/** Résultat complet d'une analyse de rentabilité (`InvestmentResult`). */
export interface InvestmentResult extends Readonly<InvestmentResultFields> {}

export class InvestmentResult {
  constructor(fields: InvestmentResultFields) {
    Object.assign(this, fields);
  }

  /** Indicateurs résumés pour les cartes d'annonce. */
  get highlights(): InvestmentHighlights {
    return {
      grossYield: this.grossYield,
      netYield: this.netYield,
      monthlyCashFlow: this.monthlyCashFlow,
      isRentEstimated: hasWarning(this, 'rentEstimated'),
    };
  }

  line(kind: InvestmentLineKind): InvestmentLine | null {
    return this.lines.find((line) => line.kind === kind) ?? null;
  }
}

/** `warnings.contains(...)` : par nature, ou exactement (classe énergie et année comprises). */
export function hasWarning(result: Pick<InvestmentResultFields, 'warnings'>, warning: InvestmentWarning['kind'] | InvestmentWarning): boolean {
  const expected: InvestmentWarning | null = typeof warning === 'string' ? null : warning;
  const kind = typeof warning === 'string' ? warning : warning.kind;
  return result.warnings.some((w) => {
    if (w.kind !== kind) return false;
    if (expected?.kind !== 'energyRentalRestriction' || w.kind !== 'energyRentalRestriction') return true;
    return w.energyClass === expected.energyClass && w.year === expected.year;
  });
}
