import { Decimal, type DecimalLike } from './decimal';

// Textes des indicateurs comme l'app : Core/Formatting/Formatters.swift et Features/Listings/ListingCardFormatting.swift.
//
// L'app passe la valeur décimale exacte à ICU (Decimal.FormatStyle → unumf_formatDecimal), qui arrondit au plus
// proche avec égalité au chiffre PAIR (aucun mode d'arrondi n'est donné au squelette ICU) : 0,0565 → « 5,6 % »,
// 1 400,50 € → « 1 400 € ». Intl.NumberFormat arrondit les égalités en s'éloignant de zéro (« 5,7 % », « 1 401 € »)
// et part d'un double (0,0565 n'existe pas en binaire). On arrondit donc d'abord en décimal, comme ICU, puis Intl
// ne fait que mettre en forme un nombre qui a déjà le bon nombre de décimales.
//
// Les espaces viennent des données CLDR du navigateur (« 1 400 € » : espace fine insécable entre les milliers,
// insécable avant € et %), comme sur l'iPhone ; elles peuvent varier d'une version à l'autre.

const LOCALE = 'fr-FR';
const priceFormat = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const amountFormat = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const percentFormats = new Map<number, Intl.NumberFormat>();

function percentFormat(fractionDigits: number): Intl.NumberFormat {
  let format = percentFormats.get(fractionDigits);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, { style: 'percent', minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
    percentFormats.set(fractionDigits, format);
  }
  return format;
}

/** Arrondi d'ICU (égalité au pair) ; un négatif arrondi à zéro garde son signe (« -0,0 % »), comme ICU. */
function icuRounded(value: DecimalLike, scale: number): number {
  const exact = Decimal.from(value);
  const rounded = exact.rounded(scale, 'bankers');
  return rounded.isZero && exact.lt(0) ? -0 : rounded.toNumber();
}

/** `Formatters.price` : arrondi à l'euro, « 245 000 € ». */
export function formatPrice(value: DecimalLike): string {
  return priceFormat.format(icuRounded(value, 0));
}

/** `Formatters.amount` : au centime si nécessaire, « 1 043,93 € », « 629 € ». */
export function formatAmount(value: DecimalLike): string {
  return amountFormat.format(icuRounded(value, 2));
}

/** `Formatters.signedAmount` : « +120 € », « −85 € » (signe moins U+2212), « 0 € ». */
export function formatSignedAmount(value: DecimalLike): string {
  const exact = Decimal.from(value);
  const formatted = formatAmount(exact.abs());
  if (exact.gt(0)) return `+${formatted}`;
  if (exact.lt(0)) return `−${formatted}`;
  return formatted;
}

/** `Formatters.percent` : fraction en pourcentage, 0,0712 → « 7,1 % ». */
export function formatPercent(fraction: DecimalLike, fractionDigits = 1): string {
  return percentFormat(fractionDigits).format(icuRounded(fraction, fractionDigits + 2));
}

/**
 * Cash-flow des cartes : `Formatters.signedAmount(cashFlow.rounded(scale: 0))`, « −629 € » (« /mois » à ajouter).
 * L'arrondi à l'euro est l'arrondi commercial de Decimal (.plain) : −420,50 € → −421 €, là où Math.round donne −420.
 */
export function formatCashFlow(monthlyCashFlow: DecimalLike): string {
  return formatSignedAmount(Decimal.from(monthlyCashFlow).rounded(0));
}

/** Seuil du bon rendement brut : pastille verte à partir de 7 %, orange en dessous (`ListingCardFormatting.goodYield`). */
export const GOOD_YIELD = Decimal.from('0.07');

export type YieldTone = 'positive' | 'caution';
export type CashFlowTone = 'positive' | 'negative' | 'neutral';

/** Vert pour un bon rendement brut, orange en dessous ; le rendement net prend la couleur du brut. */
export const yieldTone = (grossYield: DecimalLike): YieldTone => (Decimal.from(grossYield).gte(GOOD_YIELD) ? 'positive' : 'caution');

/** Couleur du cash-flow, d'après sa valeur au centime (avant l'arrondi à l'euro de l'affichage). */
export function cashFlowTone(monthlyCashFlow: DecimalLike): CashFlowTone {
  const value = Decimal.from(monthlyCashFlow);
  return value.gt(0) ? 'positive' : value.lt(0) ? 'negative' : 'neutral';
}

const monthYearFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * Fin de bail : « juin 2027 » (`.dateTime.month(.wide).year()`). L'app affiche dans le fuseau de l'iPhone : par
 * défaut celui du navigateur ; `timeZone` (« Europe/Paris ») pour un résultat fixe.
 */
export function formatMonthYear(date: Date, timeZone?: string): string {
  const key = timeZone ?? '';
  let format = monthYearFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', ...(timeZone ? { timeZone } : {}) });
    monthYearFormats.set(key, format);
  }
  return format.format(date);
}
