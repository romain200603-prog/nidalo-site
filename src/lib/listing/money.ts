import { D, formatPercent, formatPrice, type DecimalLike } from '../investment';

// Montants des cartes du haut de la fiche, comme l'app (TopCardFormat et CategoryFormat). Les arrondis se font en
// décimal sur la valeur exacte du moteur : `Decimal.rounded(scale:)` (au plus proche, la moitié loin de zéro) pour les
// euros, ICU (égalité au chiffre pair) pour les centimes et les pourcentages, comme `formatPercent` du moteur.

const NARROW = ' ';
const NO_BREAK = ' ';

/** Espaces insécables normales à la place des fines (comme `CategoryFormat.thin`). */
export function thin(text: string): string {
  return text.replaceAll(NARROW, NO_BREAK);
}

/** « 238 000 € », « −1 440 € », « +1 485 € » : arrondi à l'euro, seulement à l'affichage (TopCardFormat.euros). */
export function euros(value: DecimalLike, signed = false): string {
  const exact = D(value);
  const text = formatPrice(exact.abs().rounded(0));
  if (!signed) return text;
  return (exact.lt(0) ? '−' : '+') + text;
}

const cents = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** « −62,18 € » : cash-flow au centime, toujours signé (TopCardFormat.cents). */
export function signedCents(value: DecimalLike): string {
  const exact = D(value);
  return (exact.lt(0) ? '−' : '+') + cents.format(exact.abs().rounded(2, 'bankers').toNumber());
}

/** Montants des cartes « Coût de la location », « Rentabilité » et « Rentabilité hôtelière » (CategoryFormat.euros). */
export const cardEuros = (value: DecimalLike, signed = false): string => thin(euros(value, signed));

/** « 16,4 € » (CategoryFormat.euros1). */
export const cardEuros1 = (value: DecimalLike): string => thin(oneDecimal.format(D(value).rounded(1).toNumber()));

/** « 33 % », « 3,5 % » (CategoryFormat.percent). */
export const cardPercent = (fraction: DecimalLike, digits: number): string => thin(formatPercent(fraction, digits));

/** « ≈ 2,61 M€ », ou « ≈ 663 000 € » sous 1 M€ (CategoryFormat.capacity). */
export function capacity(value: DecimalLike): string {
  const exact = D(value);
  if (exact.gte(1_000_000)) {
    return `≈${NO_BREAK}${thin(twoDecimals.format(exact.dividedBy(1_000_000).rounded(2).toNumber()))}${NO_BREAK}M€`;
  }
  return `≈${NO_BREAK}${cardEuros(exact.dividedBy(1_000).rounded(0).times(1_000))}`;
}
