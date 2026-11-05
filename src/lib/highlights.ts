import { investmentForRow } from './investment';
import type { ListingRow } from './listings';
import type { Highlights } from './search';

/**
 * Indicateurs de rentabilité d'une annonce (rendement brut, net, cash-flow), calculés par le moteur de l'app
 * (src/lib/investment) : hypothèses standard (crédit sur 20 ans à 3,5 %, l'apport couvre les frais de notaire), ou
 * l'apport saisi dans la recherche Investir. null quand l'app n'en affiche pas : location, aucun loyer connu, prix nul.
 */
export function highlightsFor(row: ListingRow, downPayment: number | null): Highlights | null {
  const investment = investmentForRow(row, { downPayment });
  if (!investment) return null;
  return {
    grossYield: investment.grossYield,
    netYield: investment.netYield,
    monthlyCashFlow: investment.monthlyCashFlow,
    isRentEstimated: investment.isRentEstimated,
    text: {
      grossYield: investment.text.grossYield,
      netYield: investment.text.netYield,
      monthlyCashFlow: investment.text.monthlyCashFlow,
      monthlyRentFromYield: investment.text.monthlyRentFromYield,
    },
  };
}
