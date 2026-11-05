import { D, Decimal } from './decimal';

/** Calculs de crédit immobilier (prêt amortissable à mensualités constantes), comme InvestmentEngine/LoanMath.swift. */
export const LoanMath = {
  /**
   * Mensualité hors assurance.
   * @param principal capital emprunté
   * @param annualRate taux nominal annuel (0,035 = 3,5 %)
   * @param months durée en mois
   */
  monthlyPayment(principal: Decimal, annualRate: Decimal, months: number): Decimal {
    if (!principal.gt(0) || !(months > 0)) return D(0);
    if (!annualRate.gt(0)) return principal.dividedBy(Decimal.fromInteger(months));
    const monthlyRate = annualRate.dividedBy(12);
    const growth = D(1).plus(monthlyRate).pow(months);
    return principal.times(monthlyRate).times(growth).dividedBy(growth.minus(1));
  },

  /** Assurance emprunteur mensuelle, calculée sur le capital initial. */
  monthlyInsurance(principal: Decimal, annualRate: Decimal): Decimal {
    if (!principal.gt(0) || !annualRate.gt(0)) return D(0);
    return principal.times(annualRate).dividedBy(12);
  },

  /** Coût total des intérêts sur la durée du prêt. */
  totalInterest(principal: Decimal, annualRate: Decimal, months: number): Decimal {
    const payment = LoanMath.monthlyPayment(principal, annualRate, months);
    return Decimal.max(0, payment.times(Decimal.fromInteger(months)).minus(principal));
  },
};
