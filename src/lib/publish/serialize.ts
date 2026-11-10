import { date, hotelScope, num, int, bool, sourced, type Json, type Sourced } from '../listingJson';
import { sortedPhotos, type ListingRow } from '../listings';
import { ENERGY_CLASSES, OUTDOOR_SPACES, type EnergyClass, type OutdoorSpace } from '../search';
import {
  CHARGES_MODES, CONDITIONS, FEE_PAYERS, HOTEL_AMENITIES, HOTEL_STATUSES, LEASE_TYPES, OFFICE_EQUIPMENT, PARKING_TYPES, categoryTransaction,
  categoryTypes, coOwnershipLots, emptyRental, energyCostRange, hasRooms, inventoryFee, newDraft, rentControl, showsCoOwnership, showsEnergyCosts,
  syncBuildingRent,
  isDwelling,
  type AssetDraft, type ChargesMode, type Day, type DraftPhoto, type FeePayer, type HotelAmenity, type HotelOperatingStatus, type LeaseType,
  type OfficeEquipment, type ParkingType, type PropertyCondition, type PropertyType, type PublishCategory, type PublishDraft, type RentalDraft,
} from './draft';

// Brouillon ↔ ligne de la table listings, exactement comme l'app les écrit (SupabaseListingRepository.ListingWrite,
// ListingDraft.makeListing) et les relit (ListingDraft(details:)). L'app décode chaque ligne sans tolérance : un champ
// JSON mal formé ferait échouer toute sa liste d'annonces, d'où la vérification `appDecodingProblems` avant d'écrire.

/** Colonnes que le site écrit (jamais celles calculées par le serveur). `status` seulement à la création. */
export type ListingWrite = {
  id: string;
  status?: 'draft';
  transaction: 'sale' | 'rent';
  property_type: PropertyType;
  publish_category: PublishCategory | null;
  title: string;
  description: string;
  price: number;
  monthly_charges: number | null;
  annual_property_tax: number | null;
  works_amount: number | null;
  agency_fees_amount: number | null;
  agency_fees_paid_by: FeePayer | null;
  co_ownership_lots: number | null;
  co_ownership_has_procedure: boolean | null;
  country_code: 'FR';
  postal_code: string;
  city: string;
  insee_code: string | null;
  location_precision: 'exact' | 'approximate';
  living_area: number;
  land_area: number | null;
  rooms: number | null;
  bedrooms: number | null;
  floor: number | null;
  total_floors: number | null;
  has_elevator: boolean | null;
  outdoor_spaces: OutdoorSpace[];
  parking: ParkingType;
  year_built: number | null;
  is_new_build: boolean;
  has_cellar: boolean | null;
  condition: PropertyCondition | null;
  accepts_video_visits: true | null;
  energy_class: EnergyClass | null;
  climate_class: EnergyClass | null;
  primary_energy_consumption: number | null;
  annual_energy_cost_min: number | null;
  annual_energy_cost_max: number | null;
  diagnostic_date: string | null;
  rental_info: Json | null;
  asset_details: Json | null;
};

// MARK: - Dates

/**
 * Jour choisi → date écrite comme l'app (supabase-swift : ISO 8601 avec millisecondes, en UTC). Midi UTC : le même
 * jour partout en Europe, comme le calendrier de l'app.
 */
export function dayToDate(day: Day): string {
  return `${day}T12:00:00.000Z`;
}

/** Jour AAAA-MM-JJ à l'heure du navigateur (comme isoDay des filtres). */
function localDay(d: Date): Day {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date écrite par l'app ou par le site → jour du calendrier, à l'heure du navigateur. */
export function dateToDay(value: unknown): Day | null {
  const d = date(value);
  return d ? localDay(d) : null;
}

// MARK: - JSON (RentalInfo, AssetDetails)

/** Ajoute la clé seulement si la valeur existe (encodeIfPresent de Swift). */
function put(target: Json, key: string, value: unknown) {
  if (value !== null && value !== undefined) target[key] = value;
}

function sortedBy<T extends string>(values: T[] | null, order: T[]): T[] | null {
  return values === null ? null : order.filter((value) => values.includes(value));
}

/** RentalInfo : `isLeased` toujours présent (il n'est pas facultatif dans l'app). */
export function rentalJson(info: RentalDraft): Json {
  const json: Json = {};
  put(json, 'currentMonthlyRent', info.currentMonthlyRent);
  put(json, 'potentialMonthlyRent', info.potentialMonthlyRent);
  json.isLeased = info.isLeased;
  put(json, 'leaseEndDate', info.leaseEndDate && dayToDate(info.leaseEndDate));
  put(json, 'availableFrom', info.availableFrom && dayToDate(info.availableFrom));
  put(json, 'recoverableMonthlyCharges', info.recoverableMonthlyCharges);
  put(json, 'isFurnished', info.isFurnished);
  put(json, 'securityDeposit', info.securityDeposit);
  put(json, 'leaseDurationMonths', info.leaseDurationMonths);
  put(json, 'chargesMode', info.chargesMode);
  put(json, 'inventoryFee', info.inventoryFee);
  put(json, 'isRentControlled', info.isRentControlled);
  put(json, 'referenceRent', info.referenceRent);
  put(json, 'maxReferenceRent', info.maxReferenceRent);
  put(json, 'rentSupplement', info.rentSupplement);
  return json;
}

function sourcedJson(value: Sourced | null): Json | null {
  return value === null ? null : { value: value.value, origin: value.origin };
}

/** AssetDetails, encodé comme une énumération Swift : `{"hotel": {"_0": {...}}}`. */
export function assetJson(asset: AssetDraft): Json {
  const inner: Json = {};
  switch (asset.kind) {
    case 'hotel': {
      const h = asset.hotel;
      put(inner, 'rooms', h.rooms);
      put(inner, 'stars', h.stars);
      put(inner, 'annualRevenue', sourcedJson(h.annualRevenue));
      put(inner, 'ebitda', sourcedJson(h.ebitda));
      put(inner, 'operatingIncome', sourcedJson(h.operatingIncome));
      put(inner, 'scope', h.scope);
      put(inner, 'occupancyRate', sourcedJson(h.occupancyRate));
      put(inner, 'financialYear', h.financialYear);
      put(inner, 'averageDailyRate', sourcedJson(h.averageDailyRate));
      put(inner, 'operatingStatus', h.operatingStatus);
      put(inner, 'amenities', sortedBy(h.amenities, HOTEL_AMENITIES));
      put(inner, 'wallsAnnualRent', h.wallsAnnualRent);
      break;
    }
    case 'commercial': {
      const c = asset.commercial;
      put(inner, 'frontageMeters', c.frontageMeters);
      put(inner, 'salesArea', c.salesArea);
      put(inner, 'leaseType', c.leaseType);
      put(inner, 'leaseEndDate', c.leaseEndDate && dayToDate(c.leaseEndDate));
      break;
    }
    case 'office': {
      const o = asset.office;
      put(inner, 'workstations', o.workstations);
      put(inner, 'parkingSpaces', o.parkingSpaces);
      put(inner, 'isAccessible', o.isAccessible);
      put(inner, 'equipment', sortedBy(o.equipment, OFFICE_EQUIPMENT));
      put(inner, 'leaseType', o.leaseType);
      put(inner, 'leaseEndDate', o.leaseEndDate && dayToDate(o.leaseEndDate));
      break;
    }
    case 'land': {
      const l = asset.land;
      put(inner, 'zoning', l.zoning);
      put(inner, 'buildability', l.buildability && { floorArea: l.buildability.floorArea, documentReference: l.buildability.documentReference });
      put(inner, 'isServiced', l.isServiced);
      put(inner, 'hasBuildings', l.hasBuildings);
      break;
    }
    case 'building': {
      const b = asset.building;
      put(inner, 'residentialUnits', b.residentialUnits);
      put(inner, 'commercialUnits', b.commercialUnits);
      put(inner, 'vacantUnits', b.vacantUnits);
      put(inner, 'residentialArea', b.residentialArea);
      put(inner, 'commercialArea', b.commercialArea);
      put(inner, 'residentialAnnualRent', b.residentialAnnualRent);
      put(inner, 'commercialAnnualRent', b.commercialAnnualRent);
      break;
    }
  }
  return { [asset.kind]: { _0: inner } };
}

// MARK: - Écriture

const trimmed = (text: string): string => text.trim();

/**
 * Ligne écrite pour le brouillon (ListingDraft.makeListing + ListingWrite). Publier exige l'annonce complète
 * (`missingRequiredFields` vide) ; un brouillon garde ce qui est saisi, avec un prix à 0 tant qu'il manque.
 */
export function listingWrite(source: PublishDraft, { insert }: { insert: boolean }): ListingWrite {
  const draft = syncBuildingRent(source);
  const type = draft.propertyType;
  const transaction = draft.transaction;
  const address = draft.address;
  if (type === null || transaction === null || address === null) throw new Error('Brouillon incomplet : type, transaction ou adresse manquants.');
  let rental: RentalDraft | null = draft.rentalInfo;
  // Location : seuls l'ameublement (logement), la disponibilité, le dépôt, la durée du bail, le mode des charges, la part
  // de l'état des lieux (honoraires du locataire) et l'encadrement des loyers (logement) ont un sens.
  if (transaction === 'rent' && rental) {
    rental = {
      ...emptyRental(),
      isFurnished: isDwelling(type) ? rental.isFurnished : null,
      availableFrom: rental.availableFrom,
      securityDeposit: rental.securityDeposit,
      leaseDurationMonths: rental.leaseDurationMonths,
      chargesMode: rental.chargesMode,
      inventoryFee: inventoryFee(draft),
      ...rentControl(draft),
    };
  }
  // Hôtel : le loyer des murs est un revenu pour « Murs seuls » (informations locatives, comme un local loué) et une
  // charge pour « Fonds seul » (détails de l'hôtel) ; ni l'un ni l'autre pour « Murs et fonds ».
  const hotel = draft.assetDetails?.kind === 'hotel' ? draft.assetDetails.hotel : null;
  if (hotel && hotel.scope !== 'wallsOnly') rental = null;
  const assetDetails: AssetDraft | null = hotel && hotel.scope !== 'businessOnly'
    ? { kind: 'hotel', hotel: { ...hotel, wallsAnnualRent: null } }
    : draft.assetDetails;
  // Dépenses d'énergie : saisies pour un logement ou un immeuble ; ailleurs, gardées telles quelles.
  const energyCosts = showsEnergyCosts(type)
    ? energyCostRange(draft.energy)
    : { min: draft.energy.annualEnergyCostMin, max: draft.energy.annualEnergyCostMax };
  // Honoraires : le montant et qui les paie, ensemble ou pas du tout (règle du serveur).
  const fees = draft.agencyFeesAmount !== null && draft.agencyFeesPaidBy !== null;
  // Copropriété : seulement pour une vente qui la demande (appartement, investissement sauf immeuble entier).
  const coOwnership = showsCoOwnership(draft);
  const insee = address.inseeCode?.trim() ?? '';
  const write: ListingWrite = {
    id: draft.id,
    transaction,
    property_type: type,
    publish_category: draft.category,
    title: [...trimmed(draft.title)].slice(0, 150).join(''),
    description: [...trimmed(draft.description)].slice(0, 10_000).join(''),
    price: draft.price ?? 0,
    monthly_charges: draft.monthlyCharges,
    annual_property_tax: draft.annualPropertyTax,
    works_amount: draft.worksAmount,
    agency_fees_amount: fees ? draft.agencyFeesAmount : null,
    agency_fees_paid_by: fees ? draft.agencyFeesPaidBy : null,
    co_ownership_lots: coOwnershipLots(draft),
    co_ownership_has_procedure: coOwnership ? draft.coOwnershipHasProcedure : null,
    country_code: 'FR',
    postal_code: trimmed(address.postalCode),
    city: trimmed(address.city),
    insee_code: insee.length === 5 ? insee : null,
    location_precision: draft.locationPrecision,
    living_area: draft.livingArea ?? 0,
    land_area: draft.landArea,
    rooms: hasRooms(type) ? draft.rooms : null,
    bedrooms: hasRooms(type) ? draft.bedrooms : null,
    floor: draft.floor,
    total_floors: draft.totalFloors,
    has_elevator: draft.hasElevator,
    outdoor_spaces: OUTDOOR_SPACES.filter((space) => draft.outdoorSpaces.includes(space)),
    parking: draft.parking,
    year_built: draft.yearBuilt,
    is_new_build: draft.isNewBuild,
    has_cellar: draft.hasCellar,
    condition: draft.condition,
    accepts_video_visits: draft.acceptsVideoVisits === true ? true : null,
    energy_class: draft.energy.energyClass,
    climate_class: draft.energy.climateClass,
    primary_energy_consumption: draft.energy.primaryEnergyConsumption,
    annual_energy_cost_min: energyCosts.min,
    annual_energy_cost_max: energyCosts.max,
    diagnostic_date: draft.energy.diagnosticDate,
    rental_info: rental ? rentalJson(rental) : null,
    asset_details: assetDetails ? assetJson(assetDetails) : null,
  };
  return insert ? { ...write, status: 'draft' } : write;
}

// MARK: - Vérification : ce que l'app sait décoder

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const ORIGINS = ['seller', 'estimated', 'user', 'partner'];
const SCOPES = ['wallsAndBusiness', 'wallsOnly', 'businessOnly'];

type FieldRule = 'decimal' | 'int' | 'bool' | 'date' | 'string' | 'sourced' | { oneOf: string[] } | { setOf: string[] } | 'buildability';

const RENTAL_RULES: Record<string, FieldRule> = {
  currentMonthlyRent: 'decimal', potentialMonthlyRent: 'decimal', isLeased: 'bool', leaseEndDate: 'date', availableFrom: 'date',
  recoverableMonthlyCharges: 'decimal', isFurnished: 'bool', securityDeposit: 'decimal', leaseDurationMonths: 'int',
  chargesMode: { oneOf: CHARGES_MODES }, inventoryFee: 'decimal', isRentControlled: 'bool', referenceRent: 'decimal',
  maxReferenceRent: 'decimal', rentSupplement: 'decimal',
};

const ASSET_RULES: Record<string, Record<string, FieldRule>> = {
  hotel: {
    rooms: 'int', stars: 'int', annualRevenue: 'sourced', ebitda: 'sourced', operatingIncome: 'sourced', scope: { oneOf: SCOPES },
    occupancyRate: 'sourced', financialYear: 'int', averageDailyRate: 'sourced', operatingStatus: { oneOf: HOTEL_STATUSES },
    amenities: { setOf: HOTEL_AMENITIES }, wallsAnnualRent: 'decimal',
  },
  commercial: { frontageMeters: 'decimal', salesArea: 'decimal', leaseType: { oneOf: LEASE_TYPES }, leaseEndDate: 'date' },
  office: {
    workstations: 'int', parkingSpaces: 'int', isAccessible: 'bool', equipment: { setOf: OFFICE_EQUIPMENT },
    leaseType: { oneOf: LEASE_TYPES }, leaseEndDate: 'date',
  },
  land: { zoning: 'string', buildability: 'buildability', isServiced: 'bool', hasBuildings: 'bool' },
  building: {
    residentialUnits: 'int', commercialUnits: 'int', vacantUnits: 'int', residentialArea: 'decimal', commercialArea: 'decimal',
    residentialAnnualRent: 'decimal', commercialAnnualRent: 'decimal',
  },
};

function fieldProblem(value: unknown, rule: FieldRule): boolean {
  if (value === null) return false;
  if (rule === 'decimal') return typeof value !== 'number' || !Number.isFinite(value);
  if (rule === 'int') return typeof value !== 'number' || !Number.isInteger(value);
  if (rule === 'bool') return typeof value !== 'boolean';
  if (rule === 'date') return typeof value !== 'string' || !ISO_DATE.test(value);
  if (rule === 'string') return typeof value !== 'string';
  if (rule === 'sourced') {
    const v = value as Json;
    return typeof v !== 'object' || typeof v.value !== 'number' || !Number.isFinite(v.value) || !ORIGINS.includes(v.origin as string);
  }
  if (rule === 'buildability') {
    const v = value as Json;
    return typeof v !== 'object' || typeof v.floorArea !== 'number' || typeof v.documentReference !== 'string';
  }
  if ('oneOf' in rule) return typeof value !== 'string' || !rule.oneOf.includes(value);
  return !Array.isArray(value) || value.some((item) => typeof item !== 'string' || !rule.setOf.includes(item));
}

function objectProblems(json: Json, rules: Record<string, FieldRule>, where: string): string[] {
  const problems: string[] = [];
  for (const [key, rule] of Object.entries(rules)) {
    if (key in json && fieldProblem(json[key], rule)) problems.push(`${where}.${key}`);
  }
  return problems;
}

/** Ce qui empêcherait l'app de relire la ligne (décodage Swift strict) ; liste vide = rien. */
export function appDecodingProblems(write: ListingWrite): string[] {
  const problems: string[] = [];
  const rental = write.rental_info;
  if (rental !== null) {
    if (typeof rental.isLeased !== 'boolean') problems.push('rental_info.isLeased');
    problems.push(...objectProblems(rental, RENTAL_RULES, 'rental_info'));
  }
  const asset = write.asset_details;
  if (asset !== null) {
    const keys = Object.keys(asset);
    const kind = keys[0];
    const wrapped = asset[kind] as Json | undefined;
    const inner = wrapped?._0 as Json | undefined;
    if (keys.length !== 1 || !(kind in ASSET_RULES) || !wrapped || Object.keys(wrapped).length !== 1 || !inner || typeof inner !== 'object') {
      problems.push('asset_details');
    } else {
      problems.push(...objectProblems(inner, ASSET_RULES[kind], `asset_details.${kind}`));
    }
  }
  for (const key of ['rooms', 'bedrooms', 'floor', 'total_floors', 'year_built', 'primary_energy_consumption', 'co_ownership_lots'] as const) {
    const value = write[key];
    if (value !== null && !Number.isInteger(value)) problems.push(key);
  }
  if (!PARKING_TYPES.includes(write.parking)) problems.push('parking');
  if (write.condition !== null && !CONDITIONS.includes(write.condition)) problems.push('condition');
  if (write.energy_class !== null && !ENERGY_CLASSES.includes(write.energy_class)) problems.push('energy_class');
  if (write.climate_class !== null && !ENERGY_CLASSES.includes(write.climate_class)) problems.push('climate_class');
  return problems;
}

// MARK: - Lecture : annonce existante → brouillon (ListingDraft(details:))

const ALL_TYPES: PropertyType[] = ['apartment', 'house', 'building', 'land', 'commercial', 'office', 'parking', 'hotel', 'other'];
const CATEGORIES: PublishCategory[] = ['residential', 'investment', 'rental', 'hotel'];

function oneOf<T extends string>(value: unknown, values: readonly T[]): T | null {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : null;
}

function setOf<T extends string>(value: unknown, values: readonly T[]): T[] | null {
  if (!Array.isArray(value)) return null;
  return values.filter((item) => value.includes(item));
}

function rentalFromJson(raw: unknown): RentalDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Json;
  return {
    currentMonthlyRent: num(r.currentMonthlyRent),
    potentialMonthlyRent: num(r.potentialMonthlyRent),
    isLeased: r.isLeased === true,
    leaseEndDate: dateToDay(r.leaseEndDate),
    availableFrom: dateToDay(r.availableFrom),
    recoverableMonthlyCharges: num(r.recoverableMonthlyCharges),
    isFurnished: bool(r.isFurnished),
    securityDeposit: num(r.securityDeposit),
    leaseDurationMonths: int(r.leaseDurationMonths),
    chargesMode: oneOf<ChargesMode>(r.chargesMode, CHARGES_MODES),
    inventoryFee: num(r.inventoryFee),
    isRentControlled: bool(r.isRentControlled),
    referenceRent: num(r.referenceRent),
    maxReferenceRent: num(r.maxReferenceRent),
    rentSupplement: num(r.rentSupplement),
  };
}

function assetFromJson(raw: unknown): AssetDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const json = raw as Json;
  const kind = Object.keys(json)[0];
  const wrapped = json[kind] as Json | undefined;
  const v = ((wrapped?._0 ?? wrapped) ?? null) as Json | null;
  if (!v || typeof v !== 'object') return null;
  switch (kind) {
    case 'hotel': return {
      kind: 'hotel',
      hotel: {
        rooms: int(v.rooms), stars: int(v.stars), annualRevenue: sourced(v.annualRevenue), ebitda: sourced(v.ebitda),
        operatingIncome: sourced(v.operatingIncome), scope: hotelScope(v.scope), occupancyRate: sourced(v.occupancyRate),
        financialYear: int(v.financialYear), averageDailyRate: sourced(v.averageDailyRate),
        operatingStatus: oneOf<HotelOperatingStatus>(v.operatingStatus, HOTEL_STATUSES),
        amenities: setOf<HotelAmenity>(v.amenities, HOTEL_AMENITIES),
        wallsAnnualRent: num(v.wallsAnnualRent),
      },
    };
    case 'commercial': return {
      kind: 'commercial',
      commercial: { frontageMeters: num(v.frontageMeters), salesArea: num(v.salesArea), leaseType: oneOf<LeaseType>(v.leaseType, LEASE_TYPES), leaseEndDate: dateToDay(v.leaseEndDate) },
    };
    case 'office': return {
      kind: 'office',
      office: {
        workstations: int(v.workstations), parkingSpaces: int(v.parkingSpaces), isAccessible: bool(v.isAccessible),
        equipment: setOf<OfficeEquipment>(v.equipment, OFFICE_EQUIPMENT), leaseType: oneOf<LeaseType>(v.leaseType, LEASE_TYPES),
        leaseEndDate: dateToDay(v.leaseEndDate),
      },
    };
    case 'land': {
      const b = v.buildability as Json | undefined;
      const floorArea = b ? num(b.floorArea) : null;
      return {
        kind: 'land',
        land: {
          zoning: typeof v.zoning === 'string' ? v.zoning : null,
          buildability: floorArea !== null ? { floorArea, documentReference: typeof b?.documentReference === 'string' ? b.documentReference : '' } : null,
          isServiced: bool(v.isServiced), hasBuildings: bool(v.hasBuildings),
        },
      };
    }
    case 'building': return {
      kind: 'building',
      building: {
        residentialUnits: int(v.residentialUnits), commercialUnits: int(v.commercialUnits), vacantUnits: int(v.vacantUnits),
        residentialArea: num(v.residentialArea), commercialArea: num(v.commercialArea),
        residentialAnnualRent: num(v.residentialAnnualRent), commercialAnnualRent: num(v.commercialAnnualRent),
      },
    };
    default: return null;
  }
}

export type ExactLocation = { street: string | null; latitude: number; longitude: number };

/**
 * Brouillon prérempli à partir d'une annonce du compte (brouillon du serveur ou annonce publiée), comme
 * ListingDraft(details:) : catégorie, champs et photos reviennent tels qu'ils ont été enregistrés.
 */
export function draftFromRow(row: ListingRow, location: ExactLocation | null): PublishDraft {
  const draft = newDraft(row.id);
  const type = oneOf(row.property_type, ALL_TYPES) ?? 'other';
  const transaction = row.transaction === 'rent' ? 'rent' : 'sale';
  const rentalInfo = rentalFromJson(row.rental_info);
  // Annonces publiées avant que la catégorie soit gardée : déduite de la transaction et du type.
  const guessed: PublishCategory = transaction === 'rent' ? 'rental'
    : type === 'hotel' ? 'hotel'
      : type === 'building' || type === 'commercial' || type === 'office' ? 'investment'
        : (type === 'apartment' || type === 'house') && rentalInfo?.isLeased === true ? 'investment' : 'residential';
  // Une catégorie qui ne propose pas ce type pour cette transaction n'est pas imposée.
  const category = [oneOf(row.publish_category, CATEGORIES), guessed]
    .find((c): c is PublishCategory => c !== null && categoryTransaction(c) === transaction && categoryTypes(c).includes(type)) ?? null;
  const assetDetails = assetFromJson(row.asset_details);
  const building = assetDetails?.kind === 'building' ? assetDetails.building : null;
  const price = num(row.price);
  const livingArea = num(row.living_area);
  // Honoraires : gardés par le serveur avec qui les paie, ou pas du tout.
  const fees = num(row.agency_fees_amount);
  const payer = oneOf<FeePayer>(row.agency_fees_paid_by, FEE_PAYERS);
  const photos: DraftPhoto[] = sortedPhotos(row).map((photo) => ({
    kind: 'stored', id: photo.id, storagePath: photo.storage_path, width: photo.width, height: photo.height,
  }));
  return {
    ...draft,
    category,
    transaction,
    propertyType: type,
    isMixedBuilding: (building?.residentialUnits ?? 0) > 0 && (building?.commercialUnits ?? 0) > 0,
    photos,
    address: { street: location?.street ?? null, postalCode: row.postal_code ?? '', city: row.city ?? '', inseeCode: row.insee_code },
    coordinate: location ? { latitude: location.latitude, longitude: location.longitude } : null,
    locationPrecision: row.location_precision === 'exact' ? 'exact' : 'approximate',
    // Brouillon enregistré sans prix : le serveur garde 0, le champ revient vide.
    price: price !== null && price > 0 ? price : null,
    monthlyCharges: num(row.monthly_charges),
    annualPropertyTax: num(row.annual_property_tax),
    livingArea: livingArea !== null && livingArea > 0 ? livingArea : null,
    landArea: num(row.land_area),
    rooms: int(row.rooms),
    bedrooms: int(row.bedrooms),
    floor: int(row.floor),
    totalFloors: int(row.total_floors),
    hasElevator: bool(row.has_elevator),
    outdoorSpaces: OUTDOOR_SPACES.filter((space) => (row.outdoor_spaces ?? []).includes(space)),
    parking: oneOf<ParkingType>(row.parking, PARKING_TYPES) ?? 'none',
    yearBuilt: int(row.year_built),
    isNewBuild: row.is_new_build === true,
    energy: {
      energyClass: oneOf<EnergyClass>(row.energy_class, ENERGY_CLASSES),
      climateClass: oneOf<EnergyClass>(row.climate_class, ENERGY_CLASSES),
      primaryEnergyConsumption: int(row.primary_energy_consumption),
      annualEnergyCostMin: num(row.annual_energy_cost_min),
      annualEnergyCostMax: num(row.annual_energy_cost_max),
      diagnosticDate: row.diagnostic_date,
    },
    title: row.title ?? '',
    description: row.description ?? '',
    rentalInfo,
    assetDetails,
    worksAmount: num(row.works_amount),
    hasCellar: bool(row.has_cellar),
    condition: oneOf<PropertyCondition>(row.condition, CONDITIONS),
    acceptsVideoVisits: bool(row.accepts_video_visits),
    agencyFeesAmount: fees !== null && payer !== null ? fees : null,
    agencyFeesPaidBy: fees !== null && payer !== null ? payer : null,
    coOwnershipLots: int(row.co_ownership_lots),
    coOwnershipHasProcedure: bool(row.co_ownership_has_procedure),
  };
}
