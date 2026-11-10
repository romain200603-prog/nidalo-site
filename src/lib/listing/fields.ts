import type { ListingRow } from '../listings';

// Lecture des champs JSON d'une annonce, comme l'app les enregistre (ImmoDomain/Listing/Listing.swift et
// AssetDetails.swift) : clés en camelCase, détails du type sous `{"hotel": {"_0": {…}}}`, dates ISO 8601.

type Json = Record<string, unknown>;

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

export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function date(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function strings(value: unknown): string[] | null {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : null;
}

export type Origin = 'seller' | 'estimated' | 'user' | 'partner';
export type Sourced = { value: number; origin: Origin };

function sourced(value: unknown): Sourced | null {
  if (!value || typeof value !== 'object') return null;
  const v = num((value as Json).value);
  if (v === null) return null;
  const origin = (value as Json).origin;
  return { value: v, origin: origin === 'estimated' || origin === 'user' || origin === 'partner' ? origin : 'seller' };
}

// MARK: - Informations locatives

export type RentalDetails = {
  isLeased: boolean;
  currentMonthlyRent: number | null;
  potentialMonthlyRent: number | null;
  leaseEndDate: Date | null;
  availableFrom: Date | null;
  recoverableMonthlyCharges: number | null;
  isFurnished: boolean | null;
  securityDeposit: number | null;
  leaseDurationMonths: number | null;
  /** Location : charges au forfait ou en provisions ; null = non précisé. */
  chargesMode: 'provision' | 'flatRate' | null;
  /** Location d'un professionnel : part des honoraires du locataire pour l'état des lieux (TTC). */
  inventoryFee: number | null;
  /** Logement dans une commune où les loyers sont encadrés ; null = non précisé. */
  isRentControlled: boolean | null;
  /** Loyer de référence et loyer de référence majoré, en €/m²/mois (arrêté du préfet). */
  referenceRent: number | null;
  maxReferenceRent: number | null;
  /** Complément de loyer, en €/mois, compris dans le loyer hors charges. */
  rentSupplement: number | null;
};

export function rentalDetails(row: Pick<ListingRow, 'rental_info'>): RentalDetails | null {
  const r = row.rental_info as Json | null;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  return {
    isLeased: r.isLeased === true,
    currentMonthlyRent: num(r.currentMonthlyRent),
    potentialMonthlyRent: num(r.potentialMonthlyRent),
    leaseEndDate: date(r.leaseEndDate),
    availableFrom: date(r.availableFrom),
    recoverableMonthlyCharges: num(r.recoverableMonthlyCharges),
    isFurnished: bool(r.isFurnished),
    securityDeposit: num(r.securityDeposit),
    leaseDurationMonths: int(r.leaseDurationMonths),
    chargesMode: oneOf(r.chargesMode, ['provision', 'flatRate'] as const),
    inventoryFee: num(r.inventoryFee),
    isRentControlled: bool(r.isRentControlled),
    referenceRent: num(r.referenceRent),
    maxReferenceRent: num(r.maxReferenceRent),
    rentSupplement: num(r.rentSupplement),
  };
}

/** Loyer retenu pour les calculs : le loyer actuel, sinon le loyer potentiel (RentalInfo.referenceMonthlyRent). */
export function referenceMonthlyRent(rental: RentalDetails | null): number | null {
  return rental?.currentMonthlyRent ?? rental?.potentialMonthlyRent ?? null;
}

// MARK: - Détails propres au type

export type HotelDetails = {
  rooms: number | null;
  stars: number | null;
  annualRevenue: Sourced | null;
  ebitda: Sourced | null;
  operatingIncome: Sourced | null;
  scope: 'wallsAndBusiness' | 'wallsOnly' | 'businessOnly' | null;
  occupancyRate: Sourced | null;
  financialYear: number | null;
  averageDailyRate: Sourced | null;
  operatingStatus: 'operating' | 'seasonal' | 'closed' | null;
  amenities: string[] | null;
  /** Fonds seul : loyer annuel des murs payé par l'exploitant. */
  wallsAnnualRent: number | null;
};

export type CommercialDetails = {
  frontageMeters: number | null;
  salesArea: number | null;
  leaseType: string | null;
  leaseEndDate: Date | null;
};

export type OfficeDetails = {
  workstations: number | null;
  parkingSpaces: number | null;
  isAccessible: boolean | null;
  equipment: string[] | null;
  leaseType: string | null;
  leaseEndDate: Date | null;
};

export type LandDetails = {
  zoning: string | null;
  buildability: { floorArea: number; documentReference: string } | null;
  isServiced: boolean | null;
  hasBuildings: boolean | null;
};

export type BuildingDetails = {
  residentialUnits: number | null;
  commercialUnits: number | null;
  vacantUnits: number | null;
  residentialArea: number | null;
  commercialArea: number | null;
  residentialAnnualRent: number | null;
  commercialAnnualRent: number | null;
};

export type Asset =
  | { kind: 'hotel'; hotel: HotelDetails }
  | { kind: 'commercial'; commercial: CommercialDetails }
  | { kind: 'office'; office: OfficeDetails }
  | { kind: 'land'; land: LandDetails }
  | { kind: 'building'; building: BuildingDetails };

function unwrap(raw: Json, key: string): Json | null {
  const wrapped = raw[key];
  if (!wrapped || typeof wrapped !== 'object') return null;
  const inner = (wrapped as Json)._0 ?? wrapped;
  return inner && typeof inner === 'object' ? (inner as Json) : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function readAsset(row: Pick<ListingRow, 'asset_details'>): Asset | null {
  const raw = row.asset_details as Json | null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let d = unwrap(raw, 'hotel');
  if (d) {
    return {
      kind: 'hotel',
      hotel: {
        rooms: int(d.rooms),
        stars: int(d.stars),
        annualRevenue: sourced(d.annualRevenue),
        ebitda: sourced(d.ebitda),
        operatingIncome: sourced(d.operatingIncome),
        scope: oneOf(d.scope, ['wallsAndBusiness', 'wallsOnly', 'businessOnly'] as const),
        occupancyRate: sourced(d.occupancyRate),
        financialYear: int(d.financialYear),
        averageDailyRate: sourced(d.averageDailyRate),
        operatingStatus: oneOf(d.operatingStatus, ['operating', 'seasonal', 'closed'] as const),
        amenities: strings(d.amenities),
        wallsAnnualRent: num(d.wallsAnnualRent),
      },
    };
  }
  d = unwrap(raw, 'commercial');
  if (d) {
    return {
      kind: 'commercial',
      commercial: { frontageMeters: num(d.frontageMeters), salesArea: num(d.salesArea), leaseType: text(d.leaseType), leaseEndDate: date(d.leaseEndDate) },
    };
  }
  d = unwrap(raw, 'office');
  if (d) {
    return {
      kind: 'office',
      office: {
        workstations: int(d.workstations), parkingSpaces: int(d.parkingSpaces), isAccessible: bool(d.isAccessible),
        equipment: strings(d.equipment), leaseType: text(d.leaseType), leaseEndDate: date(d.leaseEndDate),
      },
    };
  }
  d = unwrap(raw, 'land');
  if (d) {
    const b = d.buildability && typeof d.buildability === 'object' ? (d.buildability as Json) : null;
    const floorArea = b ? num(b.floorArea) : null;
    return {
      kind: 'land',
      land: {
        zoning: text(d.zoning),
        buildability: b && floorArea !== null ? { floorArea, documentReference: typeof b.documentReference === 'string' ? b.documentReference : '' } : null,
        isServiced: bool(d.isServiced),
        hasBuildings: bool(d.hasBuildings),
      },
    };
  }
  d = unwrap(raw, 'building');
  if (d) {
    return {
      kind: 'building',
      building: {
        residentialUnits: int(d.residentialUnits), commercialUnits: int(d.commercialUnits), vacantUnits: int(d.vacantUnits),
        residentialArea: num(d.residentialArea), commercialArea: num(d.commercialArea),
        residentialAnnualRent: num(d.residentialAnnualRent), commercialAnnualRent: num(d.commercialAnnualRent),
      },
    };
  }
  return null;
}

export function hotelOf(row: Pick<ListingRow, 'asset_details'>): HotelDetails | null {
  const asset = readAsset(row);
  return asset?.kind === 'hotel' ? asset.hotel : null;
}
