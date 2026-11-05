import type { ListingRow } from './listings';
import type { Highlights } from './search';

/**
 * Indicateurs de rentabilité d'une annonce (rendement brut, net, cash-flow), calculés comme l'app : hypothèses
 * standard, et l'apport de la recherche Investir s'il est choisi. Branché sur le moteur de calcul de l'app
 * (src/lib/investment) dès qu'il est recopié.
 */
export function highlightsFor(_row: ListingRow, _downPayment: number | null): Highlights | null {
  return null;
}
