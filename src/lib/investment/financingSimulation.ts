import { D, Decimal, type DecimalLike } from './decimal';
import { STANDARD_ASSUMPTIONS, type InvestmentAssumptions, type InvestmentInputs, type InvestmentLineKind, type InvestmentResult, type ValueOrigin } from './domain';
import { InvestmentCalculator, type InvestmentCalculating } from './investmentCalculator';

// InvestmentEngine/FinancingSimulation.swift.

/**
 * Simulation « Ajuster le financement » de la fiche : trois choix (apport, durée, taux) appliqués au moteur de
 * rentabilité existant, avec ses hypothèses (frais de notaire, vacance, assurances). Rien n'est stocké : tout se
 * recalcule à partir des choix. Les rendements brut et net ne dépendent pas du financement.
 */
export class FinancingSimulation {
  /** Achat au comptant, aucun crédit (`Decimal.greatestFiniteMagnitude`). */
  static readonly cashPurchase = Decimal.greatestFiniteMagnitude;

  // Options proposées, définies à un seul endroit.
  static readonly downPaymentOptions: readonly Decimal[] = [D(0), D('0.10'), D('0.20')];
  static readonly durationOptions: readonly number[] = [15, 20, 25];
  static readonly rateOptions: readonly Decimal[] = [D('0.030'), D('0.035'), D('0.040')];

  /** Choix par défaut : ceux des hypothèses standard (mêmes chiffres que le reste de l'app). */
  static readonly standard = new FinancingSimulation(
    D(0), Math.trunc(STANDARD_ASSUMPTIONS.loanDurationMonths / 12), STANDARD_ASSUMPTIONS.loanAnnualRate,
  );

  readonly downPaymentShare: Decimal;
  readonly years: number;
  readonly annualRate: Decimal;
  readonly fixedDownPayment: Decimal | null;

  /**
   * @param downPaymentShare part du prix payée par l'apport, en plus des frais d'acquisition (0 = le calcul standard :
   *   le crédit couvre le prix, l'apport paie les frais)
   * @param annualRate taux nominal annuel (0,035 = 3,5 %)
   * @param fixedDownPayment apport fixe en euros (celui du projet immobilier), à la place de `downPaymentShare` : il paie
   *   d'abord les frais, le crédit finance le reste, jamais moins que zéro. `cashPurchase` : achat au comptant.
   */
  constructor(downPaymentShare: DecimalLike, years: number, annualRate: DecimalLike, fixedDownPayment: DecimalLike | null = null) {
    this.downPaymentShare = D(downPaymentShare);
    this.years = years;
    this.annualRate = D(annualRate);
    this.fixedDownPayment = fixedDownPayment === null ? null : D(fixedDownPayment);
  }

  /** Copie modifiée (`var simulation = …; simulation.fixedDownPayment = 50_000`). */
  with(changes: { downPaymentShare?: DecimalLike; years?: number; annualRate?: DecimalLike; fixedDownPayment?: DecimalLike | null }): FinancingSimulation {
    return new FinancingSimulation(
      changes.downPaymentShare ?? this.downPaymentShare,
      changes.years ?? this.years,
      changes.annualRate ?? this.annualRate,
      changes.fixedDownPayment === undefined ? this.fixedDownPayment : changes.fixedDownPayment,
    );
  }

  /** Hypothèses du moteur pour ces choix. */
  assumptions(acquisitionCosts: Decimal, price: Decimal, base: InvestmentAssumptions = STANDARD_ASSUMPTIONS): InvestmentAssumptions {
    const assumptions: InvestmentAssumptions = { ...base, loanAnnualRate: this.annualRate, loanDurationMonths: this.years * 12 };
    if (this.fixedDownPayment !== null) {
      assumptions.downPayment = Decimal.max(0, this.fixedDownPayment);
    } else if (this.downPaymentShare.gt(0)) {
      assumptions.downPayment = acquisitionCosts.plus(price.times(this.downPaymentShare).roundedToCents);
    }
    return assumptions;
  }

  /** Résultat du moteur avec ces choix. */
  result(inputs: InvestmentInputs, calculator: InvestmentCalculating = new InvestmentCalculator(),
    base: InvestmentAssumptions = STANDARD_ASSUMPTIONS): InvestmentResult {
    const reference = calculator.calculate(inputs, base);
    const assumptions = this.assumptions(reference.acquisitionCosts, reference.purchasePrice, base);
    return calculator.calculate(inputs, assumptions);
  }
}

/** Lignes de « Votre mois type ». */
export type MonthlyBreakdownKind =
  /** Loyer encaissé, vacance déduite. */
  | 'collectedRent'
  /** Mensualité du crédit et assurance emprunteur. */
  | 'loan'
  | 'nonRecoverableCharges'
  | 'propertyTax'
  | 'landlordInsurance'
  | 'managementFees'
  | 'maintenance';

export type MonthlyBreakdownEntry = {
  kind: MonthlyBreakdownKind;
  /** Montant mensuel signé (non arrondi : on arrondit seulement à l'affichage). */
  amount: Decimal;
  origin: ValueOrigin | null;
};

/**
 * « Votre mois type » : les lignes du cash-flow ramenées au mois, signées (+ entrée, − sortie). Leur somme est
 * exactement le cash-flow du moteur.
 */
export class MonthlyBreakdown {
  readonly entries: readonly MonthlyBreakdownEntry[];
  readonly cashFlow: Decimal;
  /** Mensualité du crédit et assurance emprunteur (« Mensualité estimée »). */
  readonly monthlyPayment: Decimal;

  constructor(result: InvestmentResult) {
    const entries: MonthlyBreakdownEntry[] = [
      { kind: 'collectedRent', amount: result.annualCollectedRent.dividedBy(12), origin: result.line('monthlyRent')?.origin ?? null },
    ];
    const payment = result.monthlyLoanPayment.plus(result.monthlyLoanInsurance);
    if (payment.gt(0)) entries.push({ kind: 'loan', amount: payment.negated(), origin: 'estimated' });
    const coOwnership = result.line('coOwnershipCharges');
    if (coOwnership) {
      const monthly = Decimal.max(0, coOwnership.amount.minus(result.line('recoverableCharges')?.amount ?? D(0)));
      // Même arrondi annuel que le moteur.
      const annual = monthly.times(12).roundedToCents;
      if (annual.gt(0)) entries.push({ kind: 'nonRecoverableCharges', amount: annual.negated().dividedBy(12), origin: coOwnership.origin });
    }
    const annualLines: [InvestmentLineKind, MonthlyBreakdownKind][] = [
      ['propertyTax', 'propertyTax'], ['landlordInsurance', 'landlordInsurance'], ['managementFees', 'managementFees'], ['maintenance', 'maintenance'],
    ];
    for (const [lineKind, kind] of annualLines) {
      const line = result.line(lineKind);
      if (line && line.amount.gt(0)) entries.push({ kind, amount: line.amount.negated().dividedBy(12), origin: line.origin });
    }
    this.entries = entries;
    this.cashFlow = result.monthlyCashFlow;
    this.monthlyPayment = payment;
  }

  /** Plus grand montant (en valeur absolue), pour la longueur des barres. */
  get largestAmount(): Decimal {
    let largest: Decimal | null = null;
    for (const entry of this.entries) {
      const amount = entry.amount.abs();
      if (largest === null || largest.lt(amount)) largest = amount;
    }
    return largest ?? D(0);
  }
}
