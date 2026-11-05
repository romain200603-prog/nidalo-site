import type { Decimal } from './decimal';
import type { InvestmentInputs } from './domain';

/** Estime les valeurs absentes de l'annonce. Toute valeur produite ici est marquée « estimated ». */
export interface MissingValueEstimating {
  /** Loyer mensuel hors charges si le vendeur ne l'a pas fourni (null = pas d'estimation possible). */
  estimatedMonthlyRent(inputs: InvestmentInputs): Decimal | null;
  /** Taxe foncière annuelle si elle n'est pas renseignée. */
  estimatedAnnualPropertyTax(inputs: InvestmentInputs, monthlyRent: Decimal): Decimal | null;
}

/**
 * Estimations par défaut du MVP (InvestmentEngine/MissingValueEstimating.swift).
 * - Loyer : aucune estimation (prévue en phase 2 à partir des loyers de référence par commune).
 * - Taxe foncière : règle empirique d'environ un mois de loyer par an.
 */
export class DefaultMissingValueEstimator implements MissingValueEstimating {
  estimatedMonthlyRent(_inputs: InvestmentInputs): Decimal | null {
    return null;
  }

  estimatedAnnualPropertyTax(_inputs: InvestmentInputs, monthlyRent: Decimal): Decimal | null {
    return monthlyRent.roundedToCents;
  }
}
