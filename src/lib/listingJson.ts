import type { ListingRow } from './listings';

// Lecture des champs JSON d'une annonce (rental_info, asset_details), encodés par l'app :
// ImmoDomain/Listing/Listing.swift (RentalInfo) et AssetDetails.swift (`{"hotel": {"_0": {...}}}`).

export type Sourced = { value: number; origin: 'seller' | 'estimated' | 'user' };
export type HotelScope = 'wallsAndBusiness' | 'wallsOnly' | 'businessOnly';

export type Json = Record<string, unknown>;

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function int(value: unknown): number | null {
  const n = num(value);
  return n === null ? null : Math.trunc(n);
}

export function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/** Swift compte les dates en secondes depuis le 1er janvier 2001 quand elles ne sont pas écrites en texte. */
const SWIFT_REFERENCE_DATE_SECONDS = 978_307_200;

export function date(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  // Texte ISO 8601 (écrit par l'app via le serveur) ; un nombre est une date Swift par défaut.
  const d = typeof value === 'number' ? new Date((value + SWIFT_REFERENCE_DATE_SECONDS) * 1000) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function sourced(value: unknown): Sourced | null {
  if (!value || typeof value !== 'object') return null;
  const v = num((value as Json).value);
  const origin = (value as Json).origin;
  if (v === null) return null;
  return { value: v, origin: origin === 'estimated' || origin === 'user' ? origin : 'seller' };
}

/** Détails propres au type (encodage de l'app : `{"hotel": {"_0": {...}}}`). */
export function assetDetails(row: Pick<ListingRow, 'asset_details'>, kind: 'hotel' | 'commercial' | 'office' | 'land' | 'building'): Json | null {
  const raw = row.asset_details as Json | null;
  const wrapped = raw?.[kind];
  if (!wrapped || typeof wrapped !== 'object') return null;
  const inner = (wrapped as Json)._0 ?? wrapped;
  return inner && typeof inner === 'object' ? (inner as Json) : null;
}

export type Rental = {
  isLeased: boolean;
  currentMonthlyRent: number | null;
  potentialMonthlyRent: number | null;
  leaseEndDate: Date | null;
  availableFrom: Date | null;
  isFurnished: boolean | null;
  recoverableMonthlyCharges: number | null;
  securityDeposit: number | null;
};

export function rentalInfo(row: Pick<ListingRow, 'rental_info'>): Rental | null {
  const r = row.rental_info as Json | null;
  if (!r || typeof r !== 'object') return null;
  return {
    isLeased: r.isLeased === true,
    currentMonthlyRent: num(r.currentMonthlyRent),
    potentialMonthlyRent: num(r.potentialMonthlyRent),
    leaseEndDate: date(r.leaseEndDate),
    availableFrom: date(r.availableFrom),
    isFurnished: bool(r.isFurnished),
    recoverableMonthlyCharges: num(r.recoverableMonthlyCharges),
    securityDeposit: num(r.securityDeposit),
  };
}


export function hotelScope(value: unknown): HotelScope | null {
  return value === 'wallsAndBusiness' || value === 'wallsOnly' || value === 'businessOnly' ? value : null;
}

export function scopeLabel(scope: HotelScope): string {
  switch (scope) {
    case 'wallsAndBusiness': return 'Murs et fonds';
    case 'wallsOnly': return 'Murs seuls';
    default: return 'Fonds de commerce seul';
  }
}
