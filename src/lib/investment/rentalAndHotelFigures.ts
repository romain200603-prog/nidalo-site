import { D, Decimal, type DecimalLike } from './decimal';

// InvestmentEngine/RentalAndHotelFigures.swift.

export type RentalVerdict = 'solid' | 'solidWithGuarantor' | 'guarantorAdvised';

const optional = (value: DecimalLike | null | undefined): Decimal | null => (value == null ? null : D(value));

/**
 * « Coût de la location » d'un logement à louer : loyer charges comprises, loyer au m², revenus demandés, coût à
 * l'entrée et part du loyer dans les revenus. Valeurs non arrondies (arrondi seulement à l'affichage).
 */
export class RentalCost {
  /** Règle courante : des revenus nets d'au moins 3 fois le loyer charges comprises. */
  static readonly incomeMultiple = D(3);
  /** Repère de la jauge : un tiers des revenus. */
  static readonly referenceShare = D(1).dividedBy(D(3));

  readonly rentExcludingCharges: Decimal;
  readonly charges: Decimal | null;
  readonly area: Decimal | null;
  /** null : non précisé (le maximum légal du dépôt est alors inconnu). */
  readonly isFurnished: boolean | null;
  /** Dépôt indiqué dans l'annonce ; sinon le maximum légal est retenu. */
  readonly declaredDeposit: Decimal | null;
  readonly agencyFees: Decimal | null;
  /** Charges au forfait (montant fixe) plutôt qu'en provisions régularisées chaque année. */
  readonly chargesAreFlatRate: boolean;

  constructor(fields: {
    rentExcludingCharges: DecimalLike; charges: DecimalLike | null; area: DecimalLike | null; isFurnished: boolean | null;
    declaredDeposit: DecimalLike | null; agencyFees: DecimalLike | null; chargesAreFlatRate?: boolean;
  }) {
    this.rentExcludingCharges = D(fields.rentExcludingCharges);
    this.charges = optional(fields.charges);
    this.area = optional(fields.area);
    this.isFurnished = fields.isFurnished;
    this.declaredDeposit = optional(fields.declaredDeposit);
    this.agencyFees = optional(fields.agencyFees);
    this.chargesAreFlatRate = fields.chargesAreFlatRate ?? false;
  }

  get rentIncludingCharges(): Decimal {
    return this.rentExcludingCharges.plus(this.charges ?? D(0));
  }

  get rentPerSquareMeter(): Decimal | null {
    return this.area !== null && this.area.gt(0) ? this.rentExcludingCharges.dividedBy(this.area) : null;
  }

  get requiredIncome(): Decimal {
    return this.rentIncludingCharges.times(RentalCost.incomeMultiple);
  }

  /** Maximum légal : 1 mois hors charges (vide), 2 mois (meublé). */
  get legalMaximumDeposit(): Decimal | null {
    return this.isFurnished === null ? null : this.rentExcludingCharges.times(this.isFurnished ? 2 : 1);
  }

  /** Dépôt indiqué, sinon le maximum légal ; null si ni l'un ni l'autre n'est connu. */
  get deposit(): Decimal | null {
    return this.declaredDeposit ?? this.legalMaximumDeposit;
  }

  get isDepositDeclared(): boolean {
    return this.declaredDeposit !== null;
  }

  get entryTotal(): Decimal {
    return this.rentIncludingCharges.plus(this.deposit ?? D(0)).plus(this.agencyFees ?? D(0));
  }

  /**
   * Revenus proposés dans « Simuler mon dossier » : 2,4 × et 3,6 × le loyer CC arrondis à la centaine, et 3 ×
   * arrondi à la centaine supérieure (choix par défaut).
   */
  get incomeOptions(): Decimal[] {
    const cc = this.rentIncludingCharges;
    return [
      cc.times(D('2.4')).dividedBy(100).rounded(0).times(100),
      RentalCost.ceilHundred(cc.times(3)),
      cc.times(D('3.6')).dividedBy(100).rounded(0).times(100),
    ];
  }

  get defaultIncome(): Decimal {
    return this.incomeOptions[1];
  }

  /** Part du loyer CC dans des revenus donnés (0,33 = 33 %). */
  share(income: DecimalLike): Decimal | null {
    const value = D(income);
    return value.gt(0) ? this.rentIncludingCharges.dividedBy(value) : null;
  }

  verdict(income: DecimalLike, hasGuarantor: boolean): RentalVerdict {
    if (D(income).gte(this.requiredIncome)) return 'solid';
    return hasGuarantor ? 'solidWithGuarantor' : 'guarantorAdvised';
  }

  private static ceilHundred(value: Decimal): Decimal {
    return value.dividedBy(100).rounded(0, 'up').times(100);
  }
}

/** « Rentabilité hôtelière » d'un hôtel à vendre, à partir des chiffres du vendeur. */
export class HotelPerformance {
  /** L'EBITDA doit couvrir 1,3 fois les mensualités. */
  static readonly debtCoverage = D('1.3');
  static readonly durationOptions: readonly number[] = [15, 20, 25];
  static readonly rateOptions: readonly Decimal[] = [D('0.030'), D('0.035'), D('0.040')];

  readonly annualRevenue: Decimal;
  readonly ebitda: Decimal;
  readonly rooms: number | null;
  readonly occupancyRate: Decimal | null;

  constructor(fields: { annualRevenue: DecimalLike; ebitda: DecimalLike; rooms: number | null; occupancyRate: DecimalLike | null }) {
    this.annualRevenue = D(fields.annualRevenue);
    this.ebitda = D(fields.ebitda);
    this.rooms = fields.rooms;
    this.occupancyRate = optional(fields.occupancyRate);
  }

  get margin(): Decimal | null {
    return this.annualRevenue.gt(0) ? this.ebitda.dividedBy(this.annualRevenue) : null;
  }

  get monthlyRevenue(): Decimal {
    return this.annualRevenue.dividedBy(12);
  }

  get monthlyCharges(): Decimal {
    return this.annualRevenue.minus(this.ebitda).dividedBy(12);
  }

  get monthlyEbitda(): Decimal {
    return this.ebitda.dividedBy(12);
  }

  /** Chiffre d'affaires par chambre disponible et par nuit. */
  get revPAR(): Decimal | null {
    return this.rooms !== null && this.rooms > 0 ? this.annualRevenue.dividedBy(Decimal.fromInteger(this.rooms * 365)) : null;
  }

  /** Prix moyen par nuitée vendue. */
  get averageRoomRate(): Decimal | null {
    const revPAR = this.revPAR;
    if (revPAR === null || this.occupancyRate === null || !this.occupancyRate.gt(0)) return null;
    return revPAR.dividedBy(this.occupancyRate);
  }

  get maximumMonthlyPayment(): Decimal {
    return this.ebitda.dividedBy(HotelPerformance.debtCoverage).dividedBy(12);
  }

  /**
   * Capacité d'emprunt : capital remboursable avec la mensualité maximale.
   * Calcul en Double dans l'app (pow) : même enchaînement ici, avec les doubles IEEE 754 de JavaScript. Math.pow peut
   * différer du pow de l'iPhone au dernier bit, soit ~1e-10 € sur des millions : sans effet sur les montants affichés.
   */
  borrowingCapacity(years: number, annualRate: DecimalLike): Decimal {
    const payment = this.maximumMonthlyPayment;
    const months = years * 12;
    if (!(months > 0) || !payment.gt(0)) return D(0);
    const rateDecimal = D(annualRate);
    if (!rateDecimal.gt(0)) return payment.times(Decimal.fromInteger(months));
    const rate = rateDecimal.dividedBy(12).doubleValue();
    const factor = (1 - Math.pow(1 + rate, -months)) / rate;
    return payment.times(Decimal.fromDouble(factor));
  }
}
