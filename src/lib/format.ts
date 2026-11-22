import { Decimal } from './investment/decimal';

// Formats français, comme l'app (espaces fines entre les milliers).
const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const plainNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export const formatPrice = (value: number): string => euros.format(value);
export const formatNumber = (value: number): string => plainNumber.format(value);
export const formatArea = (value: number): string => `${plainNumber.format(value)} m²`;
export const formatPercent = (value: number): string => `${percent.format(value)} %`;
export const formatPerMonth = (value: number): string => `${euros.format(value)}/mois`;

export function plural(count: number, one: string, many: string): string {
  return `${plainNumber.format(count)} ${count > 1 ? many : one}`;
}

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : longDate.format(date);
}

const fractionPercent = (digits: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits });
const centsEuros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Fraction en pourcentage : 0,072 → « 7,2 % ». */
export const formatFraction = (fraction: number, digits = 1): string => fractionPercent(digits).format(fraction);

/**
 * Montant au centime si nécessaire (Formatters.amount, n° 142) : arrondi au centime d'abord (Decimal .plain, la moitié
 * s'éloigne de zéro), puis sans décimale pour un montant entier, sinon exactement 2 : « 1 043,93 € », « 450,50 € »,
 * « 629 € » ; 450,996 → « 451 € ».
 */
export function formatAmount(value: number): string {
  const cents = Decimal.from(value).rounded(2);
  const amount = cents.isZero ? 0 : cents.toNumber();
  return cents.eq(cents.rounded(0)) ? euros.format(amount) : centsEuros.format(amount);
}

/** Montant signé d'un cash-flow : « +120 € », « −85,50 € », « 0 € » (Formatters.signedAmount). */
export function formatSignedAmount(value: number): string {
  const formatted = formatAmount(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

/**
 * Bulle de prix de la carte : « 238 k€ », « 1,2 M€ » ; « 1 200 €/mois » pour une location (MapPricePin.label).
 * Arrondi aux milliers d'abord : 999 600 € donne « 1 M€ », pas « 1 000 k€ » (Formatters.compactPrice, n° 153).
 */
export function formatPinPrice(price: number, transaction: 'sale' | 'rent'): string {
  if (transaction !== 'sale') return `${euros.format(price)}/mois`;
  const thousands = Math.round(price / 1_000);
  if (thousands >= 1_000) return `${compact.format(Math.round(price / 100_000) / 10)} M€`;
  return `${whole.format(thousands)} k€`;
}
