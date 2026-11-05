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
const amountEuros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Fraction en pourcentage : 0,072 → « 7,2 % ». */
export const formatFraction = (fraction: number, digits = 1): string => fractionPercent(digits).format(fraction);

/** Montant au centime si nécessaire : « 1 043,93 € ». */
export const formatAmount = (value: number): string => amountEuros.format(value);

/** Montant signé d'un cash-flow : « +120 € », « −85 € », « 0 € ». */
export function formatSignedAmount(value: number): string {
  const formatted = amountEuros.format(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

/** Bulle de prix de la carte : « 238 k€ », « 1,2 M€ » ; « 1 200 €/mois » pour une location. */
export function formatPinPrice(price: number, transaction: 'sale' | 'rent'): string {
  if (transaction !== 'sale') return `${euros.format(price)}/mois`;
  if (price >= 1_000_000) return `${compact.format(Math.round(price / 100_000) / 10)} M€`;
  return `${whole.format(Math.round(price / 1_000))} k€`;
}
