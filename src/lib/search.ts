import { assetDetails, int, rentalInfo, scopeLabel, sourced, type HotelScope } from './listingJson';
import type { PropertyType, SearchMode } from './labels';
import { LISTING_COLUMNS, PUBLIC_STATUSES, type ListingRow } from './listings';
import { searchNormalized, type Coordinate, type PlaceKind } from './places';
import { supabase } from './supabase';

// Recherche du site, mêmes règles que l'app :
// - critères : App/AppRouter.swift (SearchDraft.query(for:)) ;
// - serveur : Data/Supabase/SupabaseListingRepository.swift (matchingSummaries) ;
// - correspondance fine dans le navigateur : ImmoDomain/Search/SearchMatching.swift.

export type SortOrder =
  | 'newest'
  | 'priceAscending'
  | 'priceDescending'
  | 'pricePerSquareMeterAscending'
  | 'grossYieldDescending'
  | 'netYieldDescending'
  | 'cashFlowDescending';

/** Cadre de la carte : ouest, sud, est, nord. */
export type BoundingBox = [number, number, number, number];

/** Lieu choisi dans les suggestions. */
export type ChosenPlace = {
  kind: PlaceKind;
  /** Texte repris dans le champ (« Péron », « Lyon 3e »). */
  name: string;
  postalCode?: string;
  inseeCode?: string;
  coordinate?: Coordinate;
};

/** Critères de recherche, tels que saisis (comme `SearchDraft` dans l'app). Les montants sont en euros. */
export type SearchDraft = {
  mode: SearchMode;
  place: string;
  chosen: ChosenPlace | null;
  /** Rayon autour d'une ville, en km ; `null` = 10 km. */
  radiusKm: number | null;
  /** Cadre de la carte, s'il remplace le lieu (« Rechercher dans cette zone »). */
  area: BoundingBox | null;
  priceMin: number | null;
  priceMax: number | null;
  livingAreaMin: number | null;
  livingAreaMax: number | null;
  roomsMin: number | null;
  types: PropertyType[];
  sort: SortOrder;
  /** Investir : apport, rendements minimum (en %), cash-flow minimum par mois. */
  downPayment: number | null;
  minGrossYieldPercent: number | null;
  minNetYieldPercent: number | null;
  minMonthlyCashFlow: number | null;
  /** Investir : travaux maximum (0 = aucun travaux), immeuble mixte (logements et commerces). */
  maxWorksAmount: number | null;
  mixedBuilding: boolean;
  /** Location : meublée, non meublée, ou indifférent (`null`). */
  furnished: boolean | null;
  /** Hôtels : ce que comprend le prix (murs et fonds, murs seuls, fonds seul). */
  hotelScope: HotelScope | null;

  // Critères des filtres (feuille « Filtres de recherche » de l'app), vides par défaut.
  /** Chambres minimum (logements). */
  bedroomsMin: number | null;
  /** Classe énergie la moins bonne acceptée (« D » = A à D). */
  worstEnergyClass: EnergyClass | null;
  excludesGroundFloor: boolean;
  floorMin: number | null;
  floorMax: number | null;
  yearBuiltMin: number | null;
  yearBuiltMax: number | null;
  requiresElevator: boolean;
  /** Au moins un de ces extérieurs (vide = indifférent). */
  outdoorSpaces: OutdoorSpace[];
  requiresParking: boolean;
  /** Résidentiel : neuf, ancien ou indifférent ; prix au m² ; critères de terrain. */
  isNewBuild: boolean | null;
  pricePerSquareMeterMin: number | null;
  pricePerSquareMeterMax: number | null;
  requiresDocumentedBuildability: boolean;
  requiresServiced: boolean;
  zoning: string;
  /** Location : charges mensuelles maximum ; disponible au plus tard le (AAAA-MM-JJ). */
  maxMonthlyCharges: number | null;
  availableBy: string | null;
  /** Investir : taxe foncière, loyer déclaré, situation locative, loyer actuel, charges annuelles, lots. */
  maxAnnualPropertyTax: number | null;
  requiresDeclaredRent: boolean;
  leasedOnly: boolean;
  vacantOnly: boolean;
  minCurrentMonthlyRent: number | null;
  maxAnnualCharges: number | null;
  minUnits: number | null;
  maxVacantUnits: number | null;
  /** Hôtels : classement, chiffre d'affaires, EBITDA, résultat d'exploitation, taux d'occupation (en %). */
  minHotelStars: number | null;
  minAnnualRevenue: number | null;
  minEbitda: number | null;
  minOperatingIncome: number | null;
  minOccupancyRatePercent: number | null;
};

/** Classe énergie (DPE), de A (meilleure) à G. */
export type EnergyClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export const ENERGY_CLASSES: EnergyClass[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export type OutdoorSpace = 'balcony' | 'terrace' | 'garden';
export const OUTDOOR_SPACES: OutdoorSpace[] = ['balcony', 'terrace', 'garden'];
export const OUTDOOR_LABELS: Record<OutdoorSpace, string> = { balcony: 'Balcon', terrace: 'Terrasse', garden: 'Jardin' };
/** Noms dans l'adresse de la page. */
const OUTDOOR_PARAMS: Record<OutdoorSpace, string> = { balcony: 'balcon', terrace: 'terrasse', garden: 'jardin' };

/** « DPE A à D », « DPE A ». */
export function energyRangeLabel(worst: EnergyClass): string {
  return worst === 'A' ? 'DPE A' : `DPE A à ${worst}`;
}

/** « Type d'investissement » de l'accueil : une vue des types et de l'immeuble mixte (comme l'app). */
export type InvestmentKind = 'classic' | 'building' | 'mixedBuilding' | 'commercial' | 'office';

/** « Légers uniquement » : jusqu'à 15 000 € de travaux (SearchDraft.lightWorksLimit). */
export const LIGHT_WORKS_LIMIT = 15_000;

export function investmentKind(draft: Pick<SearchDraft, 'types' | 'mixedBuilding'>): InvestmentKind {
  if (draft.mixedBuilding) return 'mixedBuilding';
  if (draft.types.length === 1) {
    const [only] = draft.types;
    if (only === 'building' || only === 'commercial' || only === 'office') return only;
  }
  return 'classic';
}

/** Choisir un type d'investissement réécrit les types et l'immeuble mixte, comme le setter de l'app. */
export function withInvestmentKind(draft: SearchDraft, kind: InvestmentKind): SearchDraft {
  const assetKind = draft.types.length === 1 && ['building', 'commercial', 'office'].includes(draft.types[0]);
  let types = assetKind ? [] : draft.types;
  if (kind === 'building' || kind === 'commercial' || kind === 'office') types = [kind];
  return { ...draft, types, mixedBuilding: kind === 'mixedBuilding' };
}

export type SearchLocation =
  | { kind: 'anywhere' }
  | { kind: 'city'; name: string; postalCode?: string }
  | { kind: 'around'; center: Coordinate; radiusMeters: number }
  | { kind: 'area'; box: BoundingBox };

/** Indicateurs de rentabilité d'une annonce (fractions : 0,07 = 7 %), calculés avec l'apport de la recherche. */
export type Highlights = {
  grossYield: number;
  netYield: number;
  monthlyCashFlow: number;
  isRentEstimated: boolean;
  /** Textes de l'app, arrondis comme elle (« 6,2 % », « −629 € ») ; à défaut, arrondis du navigateur. */
  text?: { grossYield: string; netYield: string; monthlyCashFlow: string; monthlyRentFromYield: string };
};

export const FETCH_LIMIT = 500;

/** Tris proposés par mode, dans l'ordre de l'app (SearchViewModel.sortOptions). */
export function sortOptions(mode: SearchMode): SortOrder[] {
  return mode === 'invest'
    ? ['newest', 'netYieldDescending', 'grossYieldDescending', 'cashFlowDescending', 'priceAscending']
    : ['newest', 'priceAscending', 'priceDescending'];
}

/** Tri effectif : celui choisi s'il existe dans ce mode, sinon « Pertinence ». */
export function effectiveSort(draft: SearchDraft): SortOrder {
  return sortOptions(draft.mode).includes(draft.sort) ? draft.sort : 'newest';
}

export const SORT_LABELS: Record<SortOrder, string> = {
  newest: 'Pertinence',
  priceAscending: 'Prix croissant',
  priceDescending: 'Prix décroissant',
  pricePerSquareMeterAscending: 'Prix au m² croissant',
  grossYieldDescending: 'Rentabilité brute',
  netYieldDescending: 'Rentabilité nette',
  cashFlowDescending: 'Cash-flow',
};
export const DEFAULT_RADIUS_METERS = 10_000;

/** Types proposés par mode ; aucun type choisi = tous ceux du mode. */
export const MODE_PROPERTY_TYPES: Record<SearchMode, PropertyType[]> = {
  buy: ['apartment', 'house', 'land'],
  rent: ['apartment', 'house', 'parking', 'land', 'commercial', 'office'],
  invest: ['apartment', 'house', 'building', 'commercial', 'office'],
  hotel: ['hotel'],
};

/** Grandes villes : « Lyon » cherche aussi aux alentours, dans un rayon autour du centre (Core/Geo/KnownCities.swift). */
const KNOWN_CITIES: Record<string, Coordinate> = {
  paris: { latitude: 48.8566, longitude: 2.3522 },
  lyon: { latitude: 45.764, longitude: 4.8357 },
  marseille: { latitude: 43.2965, longitude: 5.3698 },
  bordeaux: { latitude: 44.8378, longitude: -0.5792 },
  nantes: { latitude: 47.2184, longitude: -1.5536 },
  toulouse: { latitude: 43.6047, longitude: 1.4442 },
  lille: { latitude: 50.6292, longitude: 3.0573 },
  montpellier: { latitude: 43.6108, longitude: 3.8767 },
};

export function knownCityCenter(place: string): Coordinate | null {
  return KNOWN_CITIES[searchNormalized(place)] ?? null;
}

export function defaultDraft(mode: SearchMode = 'buy'): SearchDraft {
  return {
    mode,
    place: '',
    chosen: null,
    radiusKm: null,
    area: null,
    priceMin: null,
    priceMax: null,
    livingAreaMin: null,
    livingAreaMax: null,
    roomsMin: null,
    types: [],
    // « Pertinence » : les plus récentes d'abord, dans tous les modes (comme l'app).
    sort: 'newest',
    downPayment: null,
    minGrossYieldPercent: null,
    minNetYieldPercent: null,
    minMonthlyCashFlow: null,
    maxWorksAmount: null,
    mixedBuilding: false,
    furnished: null,
    hotelScope: null,
    bedroomsMin: null,
    worstEnergyClass: null,
    excludesGroundFloor: false,
    floorMin: null,
    floorMax: null,
    yearBuiltMin: null,
    yearBuiltMax: null,
    requiresElevator: false,
    outdoorSpaces: [],
    requiresParking: false,
    isNewBuild: null,
    pricePerSquareMeterMin: null,
    pricePerSquareMeterMax: null,
    requiresDocumentedBuildability: false,
    requiresServiced: false,
    zoning: '',
    maxMonthlyCharges: null,
    availableBy: null,
    maxAnnualPropertyTax: null,
    requiresDeclaredRent: false,
    leasedOnly: false,
    vacantOnly: false,
    minCurrentMonthlyRent: null,
    maxAnnualCharges: null,
    minUnits: null,
    maxVacantUnits: null,
    minHotelStars: null,
    minAnnualRevenue: null,
    minEbitda: null,
    minOperatingIncome: null,
    minOccupancyRatePercent: null,
  };
}

/** « Réinitialiser les filtres de cette catégorie » : tout est vidé sauf le lieu et le rayon (comme l'app). */
export function resetFilters(draft: SearchDraft): SearchDraft {
  return { ...defaultDraft(draft.mode), place: draft.place, chosen: draft.chosen, radiusKm: draft.radiusKm, area: draft.area };
}

/**
 * Changer de mode : comme dans l'app, chaque mode garde ses propres critères (un budget de vente ne devient pas un
 * loyer). Sur le site, le lieu suit le changement de mode.
 */
export function switchMode(current: SearchDraft, mode: SearchMode, remembered?: SearchDraft): SearchDraft {
  const base = remembered && remembered.mode === mode ? remembered : defaultDraft(mode);
  return { ...base, mode, place: current.place, chosen: current.chosen, radiusKm: current.radiusKm, area: current.area };
}

/** Lieu choisi, s'il correspond encore au texte du champ. */
export function chosenPlace(draft: SearchDraft): ChosenPlace | null {
  return draft.chosen && draft.chosen.name === draft.place.trim() ? draft.chosen : null;
}

/** Centre d'une recherche « et alentours » : grande ville, ou commune / quartier choisi (pas un arrondissement). */
export function searchCenter(draft: SearchDraft): Coordinate | null {
  const known = knownCityCenter(draft.place);
  if (known) return known;
  const chosen = chosenPlace(draft);
  if (!chosen || chosen.kind === 'district') return null;
  return chosen.coordinate ?? null;
}

/** « Lyon et alentours », « Péron et alentours », sinon le lieu tel que saisi. */
export function placeLabel(draft: SearchDraft): string {
  const place = draft.place.trim();
  if (knownCityCenter(place)) return `${place.charAt(0).toLocaleUpperCase('fr-FR')}${place.slice(1)} et alentours`;
  return searchCenter(draft) ? `${place} et alentours` : place;
}

export function locationFor(draft: SearchDraft): SearchLocation {
  if (draft.area) return { kind: 'area', box: draft.area };
  const place = draft.place.trim();
  const center = searchCenter(draft);
  if (center) return { kind: 'around', center, radiusMeters: draft.radiusKm ? draft.radiusKm * 1000 : DEFAULT_RADIUS_METERS };
  const chosen = chosenPlace(draft);
  if (chosen) return { kind: 'city', name: place, postalCode: chosen.postalCode };
  return place ? { kind: 'city', name: place } : { kind: 'anywhere' };
}

/** Types cherchés : ceux choisis parmi ceux du mode, sinon tous ceux du mode. */
export function propertyTypesFor(draft: SearchDraft): PropertyType[] {
  const allowed = MODE_PROPERTY_TYPES[draft.mode];
  const chosen = draft.types.filter((type) => allowed.includes(type));
  // Investir, « Immeuble mixte » : les immeubles s'ajoutent aux types choisis.
  if (draft.mode === 'invest' && draft.mixedBuilding && !chosen.includes('building')) chosen.push('building');
  return chosen.length ? chosen : allowed;
}

/**
 * Nombre de chambres d'un hôtel. L'app filtre sur la colonne `rooms`, mais la publication enregistre les chambres
 * d'un hôtel dans ses détails (asset_details.hotel.rooms) : le site lit d'abord celles-ci, pour ne pas écarter
 * les vrais hôtels.
 */
export function hotelRoomCount(row: Pick<ListingRow, 'asset_details' | 'rooms'>): number | null {
  const fromDetails = Number(assetDetails(row, 'hotel')?.rooms);
  if (Number.isFinite(fromDetails) && fromDetails > 0) return Math.trunc(fromDetails);
  return row.rooms ?? null;
}

export function transactionFor(mode: SearchMode): 'sale' | 'rent' {
  return mode === 'rent' ? 'rent' : 'sale';
}

/** Une borne min > max n'est pas appliquée (comme l'app). */
function range(min: number | null, max: number | null): [number | null, number | null] {
  if (min !== null && max !== null && min > max) return [null, null];
  return [min, max];
}

const isUnbounded = ([min, max]: [number | null, number | null]) => min === null && max === null;

/** Bornes incluses ; une borne absente est ignorée. */
function inRange(value: number, [min, max]: [number | null, number | null]): boolean {
  return (min === null || value >= min) && (max === null || value <= max);
}

/** Étages cherchés : « Hors rez-de-chaussée » relève le minimum à 1 (comme `query(for:)`). */
export function floorRange(draft: Pick<SearchDraft, 'floorMin' | 'floorMax' | 'excludesGroundFloor'>): [number | null, number | null] {
  const lowest = Math.max(draft.floorMin ?? 0, draft.excludesGroundFloor ? 1 : 0);
  return range(lowest > 0 ? lowest : null, draft.floorMax);
}

/** Pourcentage saisi en fraction (7 → 0,07) ; `null` s'il est hors 0–100 % (le champ affiche son erreur). */
function fraction(percent: number | null): number | null {
  return percent !== null && validPercent(percent) ? percent / 100 : null;
}

/** Fin de la journée choisie (« au plus tard le » inclut ce jour), à l'heure du navigateur. */
export function endOfDay(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) || date.getDate() !== Number(match[3]) ? null : date.getTime();
}

const requiresEnergyDiagnostic = (type: string) => type !== 'land' && type !== 'parking';
const PARKING_KINDS = ['outdoorSpace', 'indoorSpace', 'garage'];

function energyRank(value: string | null): number | null {
  const index = ENERGY_CLASSES.indexOf(value as EnergyClass);
  return index < 0 ? null : index;
}

/** Critères hôteliers appliqués (comme `HotelCriteria`) ; `null` si aucun. */
function hotelCriteria(draft: SearchDraft) {
  const criteria = {
    minStars: draft.minHotelStars,
    minAnnualRevenue: draft.minAnnualRevenue,
    minEbitda: draft.minEbitda,
    minOperatingIncome: draft.minOperatingIncome,
    minOccupancyRate: fraction(draft.minOccupancyRatePercent),
    scope: draft.hotelScope,
  };
  return Object.values(criteria).every((v) => v === null) ? null : criteria;
}

/** L'hôtel répond-il aux seuils ? Un seuil posé écarte l'hôtel qui ne communique pas la donnée. */
function hotelMatches(row: ListingRow, draft: SearchDraft): boolean {
  const criteria = hotelCriteria(draft);
  if (!criteria) return true;
  const hotel = assetDetails(row, 'hotel');
  if (!hotel) return false;
  const atLeast = (value: number | null, min: number | null) => min === null || (value !== null && value >= min);
  return atLeast(int(hotel.stars), criteria.minStars)
    && atLeast(sourced(hotel.annualRevenue)?.value ?? null, criteria.minAnnualRevenue)
    && atLeast(sourced(hotel.ebitda)?.value ?? null, criteria.minEbitda)
    && atLeast(sourced(hotel.operatingIncome)?.value ?? null, criteria.minOperatingIncome)
    && atLeast(sourced(hotel.occupancyRate)?.value ?? null, criteria.minOccupancyRate)
    && (criteria.scope === null || hotel.scope === criteria.scope);
}

/** Lots d'un immeuble (comme `BuildingCriteria`) : une donnée non déclarée écarte l'immeuble. */
function buildingMatches(row: ListingRow, draft: SearchDraft): boolean {
  // Immeuble mixte sans immeuble choisi : l'immeuble doit avoir des logements et des commerces.
  const mixedOnly = draft.mixedBuilding && !draft.types.includes('building');
  if (draft.minUnits === null && draft.maxVacantUnits === null && !mixedOnly) return true;
  const building = assetDetails(row, 'building');
  if (!building) return false;
  const residential = int(building.residentialUnits);
  const commercial = int(building.commercialUnits);
  const total = residential === null && commercial === null ? null : (residential ?? 0) + (commercial ?? 0);
  if (draft.minUnits !== null && !(total !== null && total >= draft.minUnits)) return false;
  const vacant = int(building.vacantUnits);
  if (draft.maxVacantUnits !== null && !(vacant !== null && vacant <= draft.maxVacantUnits)) return false;
  if (mixedOnly && (!residential || !commercial)) return false;
  return true;
}

/** Critères de terrain (Résidentiel) : seulement pour les terrains ; donnée absente = exclu. */
function landMatches(row: ListingRow, draft: SearchDraft): boolean {
  const zone = draft.zoning.trim();
  if (!draft.requiresDocumentedBuildability && !draft.requiresServiced && !zone) return true;
  const land = assetDetails(row, 'land');
  if (!land) return false;
  if (draft.requiresDocumentedBuildability && (land.buildability === null || land.buildability === undefined)) return false;
  if (draft.requiresServiced && land.isServiced !== true) return false;
  if (zone && !(typeof land.zoning === 'string' && searchNormalized(land.zoning).startsWith(searchNormalized(zone)))) return false;
  return true;
}

/** Zone rectangulaire autour d'un point (vérifiée ensuite à la distance exacte). */
export function boxAround(center: Coordinate, radiusMeters: number): BoundingBox {
  const latitudeDelta = radiusMeters / 111_320;
  const longitudeDelta = radiusMeters / (111_320 * Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.01));
  return [center.longitude - longitudeDelta, center.latitude - latitudeDelta, center.longitude + longitudeDelta, center.latitude + latitudeDelta];
}

/** Distance en mètres (haversine). */
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const earthRadius = 6_371_000;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const deltaLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const deltaLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function rowCoordinate(row: ListingRow): Coordinate | null {
  return row.public_latitude === null || row.public_longitude === null
    ? null
    : { latitude: Number(row.public_latitude), longitude: Number(row.public_longitude) };
}

/** Le bien est-il dans la zone recherchée ? */
export function locationContains(location: SearchLocation, row: ListingRow): boolean {
  switch (location.kind) {
    case 'anywhere':
      return true;
    case 'city': {
      if (location.postalCode) return row.postal_code.startsWith(location.postalCode);
      // Saisie libre : « lyon », « Lyon 3e » ou « 690 » trouvent les annonces de Lyon.
      const text = searchNormalized(location.name);
      if (!text) return true;
      return searchNormalized(row.city).includes(text) || row.postal_code.startsWith(text);
    }
    case 'around': {
      const coordinate = rowCoordinate(row);
      return coordinate !== null && distanceMeters(coordinate, location.center) <= location.radiusMeters;
    }
    case 'area': {
      const coordinate = rowCoordinate(row);
      const [west, south, east, north] = location.box;
      return coordinate !== null && coordinate.latitude >= south && coordinate.latitude <= north
        && coordinate.longitude >= west && coordinate.longitude <= east;
    }
  }
}

const isDwelling = (type: string) => type === 'apartment' || type === 'house';

/** Prix au m² d'une vente (prix ÷ surface habitable), arrondi à l'euro. */
export function pricePerSquareMeter(row: Pick<ListingRow, 'transaction' | 'living_area' | 'price'>): number | null {
  const area = Number(row.living_area);
  if (row.transaction !== 'sale' || !(area > 0)) return null;
  return Math.round(Number(row.price) / area);
}

/**
 * L'annonce correspond-elle à la recherche ? (SearchMatching.swift : bornes incluses, critère absent ignoré,
 * donnée inconnue exclue ; en Investir, une annonce sans indicateurs est exclue.)
 */
export function matches(row: ListingRow, draft: SearchDraft, highlights: Highlights | null, options: { ignoreLocation?: boolean } = {}): boolean {
  if (!(PUBLIC_STATUSES as readonly string[]).includes(row.status)) return false;
  if (row.transaction !== transactionFor(draft.mode)) return false;
  const type = row.property_type;
  if (!propertyTypesFor(draft).includes(type as PropertyType)) return false;
  if (!options.ignoreLocation && !locationContains(locationFor(draft), row)) return false;
  const price = Number(row.price);
  if (!inRange(price, range(draft.priceMin, draft.priceMax))) return false;
  if (!inRange(Number(row.living_area), range(draft.livingAreaMin, draft.livingAreaMax))) return false;
  const isRent = draft.mode === 'rent';
  // En location, pièces, chambres et ameublement ne concernent que les logements ;
  // le DPE, seulement les biens qui y sont soumis (pas un parking ni un terrain).
  const appliesHousingCriteria = !isRent || isDwelling(type);
  if (appliesHousingCriteria && draft.roomsMin !== null) {
    const rooms = draft.mode === 'hotel' ? hotelRoomCount(row) : row.rooms;
    if (!(rooms !== null && rooms >= draft.roomsMin)) return false;
  }
  if (appliesHousingCriteria && draft.bedroomsMin !== null && !(row.bedrooms !== null && row.bedrooms >= draft.bedroomsMin)) return false;
  const floors = floorRange(draft);
  if (!isUnbounded(floors) && !(row.floor !== null && inRange(row.floor, floors))) return false;
  if (draft.worstEnergyClass !== null && (!isRent || requiresEnergyDiagnostic(type))) {
    const rank = energyRank(row.energy_class);
    if (rank === null || rank > ENERGY_CLASSES.indexOf(draft.worstEnergyClass)) return false;
  }
  if (draft.requiresElevator && row.has_elevator !== true) return false;
  if (draft.outdoorSpaces.length && !draft.outdoorSpaces.some((space) => (row.outdoor_spaces ?? []).includes(space))) return false;
  if (draft.requiresParking && !PARKING_KINDS.includes(row.parking)) return false;
  if (isRent && draft.furnished !== null && appliesHousingCriteria && rentalInfo(row)?.isFurnished !== draft.furnished) return false;
  const years = range(draft.yearBuiltMin, draft.yearBuiltMax);
  if (!isUnbounded(years) && !(row.year_built !== null && inRange(row.year_built, years))) return false;
  if (draft.mode === 'buy') {
    // Neuf ou ancien : un bien sans précision compte comme ancien (comme l'app).
    if (draft.isNewBuild !== null && (row.is_new_build ?? false) !== draft.isNewBuild) return false;
    // Résidentiel écarte les biens vendus loués (ils sont dans Investir).
    if (rentalInfo(row)?.isLeased === true) return false;
    if (type === 'land' && !landMatches(row, draft)) return false;
    const perSquareMeter = range(draft.pricePerSquareMeterMin, draft.pricePerSquareMeterMax);
    if (!isUnbounded(perSquareMeter)) {
      // Surface du terrain pour un terrain, habitable sinon ; sans surface, le prix au m² est inconnu.
      const area = Number(type === 'land' ? row.land_area : row.living_area);
      if (!(area > 0 && inRange(price / area, perSquareMeter))) return false;
    }
  }
  if (isRent) {
    if (draft.maxMonthlyCharges !== null && !(row.monthly_charges !== null && Number(row.monthly_charges) <= draft.maxMonthlyCharges)) return false;
    if (draft.availableBy !== null) {
      const latest = endOfDay(draft.availableBy);
      const from = rentalInfo(row)?.availableFrom ?? null;
      if (latest !== null && !(from !== null && from.getTime() <= latest)) return false;
    }
  }
  // Critères hôteliers et d'immeuble : seulement pour ces types.
  if (draft.mode === 'hotel' && type === 'hotel' && !hotelMatches(row, draft)) return false;
  if (draft.mode === 'invest' && type === 'building' && !buildingMatches(row, draft)) return false;
  if (draft.mode === 'invest') {
    if (!highlights) return false;
    const minGross = fraction(draft.minGrossYieldPercent);
    const minNet = fraction(draft.minNetYieldPercent);
    if (minGross !== null && highlights.grossYield < minGross) return false;
    if (minNet !== null && highlights.netYield < minNet) return false;
    if (draft.minMonthlyCashFlow !== null && highlights.monthlyCashFlow < draft.minMonthlyCashFlow) return false;
    // Travaux et taxe foncière non renseignés : on ne peut pas écarter l'annonce.
    if (draft.maxWorksAmount !== null && row.works_amount !== null && Number(row.works_amount) > draft.maxWorksAmount) return false;
    if (draft.maxAnnualPropertyTax !== null && row.annual_property_tax !== null && Number(row.annual_property_tax) > draft.maxAnnualPropertyTax) return false;
    if (draft.requiresDeclaredRent && highlights.isRentEstimated) return false;
    const rental = rentalInfo(row);
    if (draft.leasedOnly && rental?.isLeased !== true) return false;
    if (draft.vacantOnly && rental?.isLeased === true) return false;
    if (draft.minCurrentMonthlyRent !== null) {
      const rent = rental?.currentMonthlyRent ?? null;
      if (!(rent !== null && rent >= draft.minCurrentMonthlyRent)) return false;
    }
    if (draft.maxAnnualCharges !== null && !(row.monthly_charges !== null && Number(row.monthly_charges) * 12 <= draft.maxAnnualCharges)) return false;
  }
  return true;
}

/** Un pourcentage hors 0–100 % n'est pas appliqué (le champ affiche son erreur). */
export function validPercent(value: number): boolean {
  return value >= 0 && value <= 100;
}

export type Result = { row: ListingRow; highlights: Highlights | null };

/** Tri final, comme l'app (les annonces sans indicateur à la fin). */
export function sortResults(results: Result[], sort: SortOrder): Result[] {
  const published = (r: Result) => (r.row.published_at ? Date.parse(r.row.published_at) : -Infinity);
  const perSquare = (r: Result) => pricePerSquareMeter(r.row) ?? Number.MAX_VALUE;
  const compare: (a: Result, b: Result) => number = (() => {
    switch (sort) {
      case 'priceAscending': return (a: Result, b: Result) => Number(a.row.price) - Number(b.row.price);
      case 'priceDescending': return (a: Result, b: Result) => Number(b.row.price) - Number(a.row.price);
      case 'pricePerSquareMeterAscending': return (a: Result, b: Result) => perSquare(a) - perSquare(b);
      case 'grossYieldDescending': return (a: Result, b: Result) => (b.highlights?.grossYield ?? -1) - (a.highlights?.grossYield ?? -1);
      case 'netYieldDescending': return (a: Result, b: Result) => (b.highlights?.netYield ?? -1) - (a.highlights?.netYield ?? -1);
      case 'cashFlowDescending': return (a: Result, b: Result) => (b.highlights?.monthlyCashFlow ?? -Number.MAX_VALUE) - (a.highlights?.monthlyCashFlow ?? -Number.MAX_VALUE);
      default: return (a: Result, b: Result) => {
        const pa = published(a);
        const pb = published(b);
        return pa === pb ? 0 : pb > pa ? 1 : -1;
      };
    }
  })();
  return [...results].sort(compare);
}

/** Annonces publiées qui passent les filtres simples, lues sur le serveur (comme matchingSummaries). */
export async function fetchCandidates(draft: SearchDraft): Promise<ListingRow[]> {
  let request = supabase
    .from('listings')
    .select(LISTING_COLUMNS)
    .in('status', [...PUBLIC_STATUSES])
    .eq('transaction', transactionFor(draft.mode))
    .in('property_type', propertyTypesFor(draft));
  const [priceMin, priceMax] = range(draft.priceMin, draft.priceMax);
  if (priceMin !== null) request = request.gte('price', priceMin);
  if (priceMax !== null) request = request.lte('price', priceMax);
  const [areaMin] = range(draft.livingAreaMin, draft.livingAreaMax);
  if (areaMin !== null) request = request.gte('living_area', areaMin);
  // Hôtels : les chambres sont lues dans les détails de l'annonce, pas sur le serveur (voir hotelRoomCount).
  if (draft.roomsMin !== null && draft.mode !== 'hotel') request = request.gte('rooms', draft.roomsMin);
  const location = locationFor(draft);
  let box: BoundingBox | null = null;
  if (location.kind === 'area') box = location.box;
  else if (location.kind === 'around') box = boxAround(location.center, location.radiusMeters);
  else if (location.kind === 'city' && location.postalCode) request = request.like('postal_code', `${location.postalCode.replace(/[^0-9A-Za-z]/g, '')}%`);
  if (box) {
    const [west, south, east, north] = box;
    request = request.gte('public_latitude', south).lte('public_latitude', north)
      .gte('public_longitude', west).lte('public_longitude', east);
  }
  const ordered = (() => {
    switch (effectiveSort(draft)) {
      case 'priceAscending': return request.order('price', { ascending: true });
      case 'priceDescending': return request.order('price', { ascending: false });
      case 'pricePerSquareMeterAscending': return request.order('price_per_square_meter', { ascending: true });
      default: return request.order('published_at', { ascending: false }).order('id', { ascending: false });
    }
  })();
  const { data, error } = await ordered.limit(FETCH_LIMIT);
  if (error) throw error;
  return (data as unknown as ListingRow[] | null) ?? [];
}

/** Recherche complète : serveur, puis indicateurs et correspondance fine dans le navigateur, puis tri. */
export async function search(draft: SearchDraft, highlightsFor: (row: ListingRow) => Highlights | null): Promise<Result[]> {
  const rows = await fetchCandidates(draft);
  const results: Result[] = [];
  for (const row of rows) {
    const highlights = highlightsFor(row);
    if (matches(row, draft, highlights)) results.push({ row, highlights });
  }
  return sortResults(results, effectiveSort(draft));
}

// MARK: - Adresse de la page (lien partageable)

const MODES: SearchMode[] = ['buy', 'rent', 'invest', 'hotel'];
const SORTS: SortOrder[] = [
  'newest', 'priceAscending', 'priceDescending', 'pricePerSquareMeterAscending',
  'grossYieldDescending', 'netYieldDescending', 'cashFlowDescending',
];
const TYPES: PropertyType[] = ['apartment', 'house', 'building', 'land', 'commercial', 'office', 'parking', 'hotel', 'other'];
const KINDS: PlaceKind[] = ['municipality', 'district', 'locality'];

function amount(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[\s  ]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function signedAmount(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[\s  ]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function draftFromParams(params: URLSearchParams): SearchDraft {
  const modeParam = params.get('mode') as SearchMode | null;
  const draft = defaultDraft(modeParam && MODES.includes(modeParam) ? modeParam : 'buy');
  draft.place = (params.get('lieu') ?? '').trim().slice(0, 120);
  const kind = params.get('choix') as PlaceKind | null;
  if (draft.place && kind && KINDS.includes(kind)) {
    const lat = signedAmount(params.get('lat'));
    const lng = signedAmount(params.get('lng'));
    draft.chosen = {
      kind,
      name: draft.place,
      postalCode: params.get('cp')?.trim() || undefined,
      inseeCode: params.get('insee')?.trim() || undefined,
      coordinate: lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { latitude: lat, longitude: lng } : undefined,
    };
  }
  const radius = amount(params.get('rayon'));
  draft.radiusKm = radius && radius >= 1 && radius <= 200 ? Math.round(radius) : null;
  const box = params.get('zone')?.split(',').map(Number);
  if (box && box.length === 4 && box.every(Number.isFinite) && box[0] < box[2] && box[1] < box[3]) draft.area = box as BoundingBox;
  draft.priceMin = amount(params.get('prixMin'));
  draft.priceMax = amount(params.get('prixMax'));
  draft.livingAreaMin = amount(params.get('surfaceMin'));
  draft.livingAreaMax = amount(params.get('surfaceMax'));
  const rooms = amount(params.get('piecesMin'));
  draft.roomsMin = rooms === null ? null : Math.round(rooms);
  draft.types = (params.get('types') ?? '').split(',').filter((t): t is PropertyType => TYPES.includes(t as PropertyType));
  const sort = params.get('tri') as SortOrder | null;
  if (sort && SORTS.includes(sort)) draft.sort = sort;
  const whole = (name: string) => {
    const n = amount(params.get(name));
    return n === null ? null : Math.round(n);
  };
  const flag = (name: string) => params.get(name) === '1';
  // Chaque mode ne lit que les critères que ses filtres proposent (pas de critère invisible).
  if (draft.mode !== 'hotel') {
    draft.bedroomsMin = whole('chambresMin');
    const dpe = params.get('dpe')?.toUpperCase() as EnergyClass | undefined;
    draft.worstEnergyClass = dpe && ENERGY_CLASSES.includes(dpe) ? dpe : null;
    draft.yearBuiltMin = whole('anneeMin');
    draft.yearBuiltMax = whole('anneeMax');
    draft.requiresElevator = flag('ascenseur');
  }
  if (draft.mode === 'buy' || draft.mode === 'rent') {
    draft.floorMin = whole('etageMin');
    draft.floorMax = whole('etageMax');
    draft.excludesGroundFloor = flag('horsRdc');
    const outdoor = (params.get('exterieur') ?? '').split(',');
    draft.outdoorSpaces = OUTDOOR_SPACES.filter((space) => outdoor.includes(OUTDOOR_PARAMS[space]));
  }
  draft.requiresParking = flag('parking');
  if (draft.mode === 'buy') {
    const isNew = params.get('neuf');
    draft.isNewBuild = isNew === '1' ? true : isNew === '0' ? false : null;
    draft.pricePerSquareMeterMin = amount(params.get('prixM2Min'));
    draft.pricePerSquareMeterMax = amount(params.get('prixM2Max'));
    draft.requiresDocumentedBuildability = flag('constructible');
    draft.requiresServiced = flag('viabilise');
    draft.zoning = (params.get('plu') ?? '').trim().slice(0, 12);
  }
  if (draft.mode === 'invest') {
    draft.downPayment = amount(params.get('apport'));
    draft.minGrossYieldPercent = amount(params.get('brutMin'));
    draft.minNetYieldPercent = amount(params.get('netMin'));
    draft.minMonthlyCashFlow = signedAmount(params.get('cashflowMin'));
    draft.maxWorksAmount = amount(params.get('travauxMax'));
    draft.mixedBuilding = flag('mixte');
    draft.maxAnnualPropertyTax = amount(params.get('taxeMax'));
    draft.requiresDeclaredRent = flag('loyerDeclare');
    const situation = params.get('situation');
    draft.leasedOnly = situation === 'loue';
    draft.vacantOnly = situation === 'libre';
    draft.minCurrentMonthlyRent = amount(params.get('loyerMin'));
    draft.maxAnnualCharges = amount(params.get('chargesAnMax'));
    draft.minUnits = whole('lotsMin');
    draft.maxVacantUnits = whole('vacantsMax');
  }
  if (draft.mode === 'rent') {
    const furnished = params.get('meuble');
    draft.furnished = furnished === '1' ? true : furnished === '0' ? false : null;
    draft.maxMonthlyCharges = amount(params.get('chargesMax'));
    const available = params.get('dispo');
    draft.availableBy = available && endOfDay(available) !== null ? available : null;
  }
  if (draft.mode === 'hotel') {
    const scope = params.get('vente');
    draft.hotelScope = scope === 'wallsAndBusiness' || scope === 'wallsOnly' || scope === 'businessOnly' ? scope : null;
    const stars = whole('etoilesMin');
    draft.minHotelStars = stars !== null && stars >= 1 && stars <= 5 ? stars : null;
    draft.minAnnualRevenue = amount(params.get('caMin'));
    draft.minEbitda = amount(params.get('ebitdaMin'));
    draft.minOperatingIncome = amount(params.get('resultatMin'));
    draft.minOccupancyRatePercent = amount(params.get('occupationMin'));
  }
  return draft;
}

export function paramsFromDraft(draft: SearchDraft): URLSearchParams {
  const params = new URLSearchParams();
  params.set('mode', draft.mode);
  const place = draft.place.trim();
  if (place) params.set('lieu', place);
  const chosen = chosenPlace(draft);
  if (chosen) {
    params.set('choix', chosen.kind);
    if (chosen.postalCode) params.set('cp', chosen.postalCode);
    if (chosen.inseeCode) params.set('insee', chosen.inseeCode);
    if (chosen.coordinate) {
      params.set('lat', chosen.coordinate.latitude.toFixed(5));
      params.set('lng', chosen.coordinate.longitude.toFixed(5));
    }
  }
  if (draft.radiusKm !== null) params.set('rayon', String(draft.radiusKm));
  if (draft.area) params.set('zone', draft.area.map((n) => n.toFixed(5)).join(','));
  if (draft.priceMin !== null) params.set('prixMin', String(draft.priceMin));
  if (draft.priceMax !== null) params.set('prixMax', String(draft.priceMax));
  if (draft.livingAreaMin !== null) params.set('surfaceMin', String(draft.livingAreaMin));
  if (draft.livingAreaMax !== null) params.set('surfaceMax', String(draft.livingAreaMax));
  if (draft.roomsMin !== null) params.set('piecesMin', String(draft.roomsMin));
  if (draft.types.length) params.set('types', draft.types.join(','));
  if (draft.sort !== defaultDraft(draft.mode).sort) params.set('tri', draft.sort);
  const set = (name: string, value: number | null) => { if (value !== null) params.set(name, String(value)); };
  const setFlag = (name: string, on: boolean) => { if (on) params.set(name, '1'); };
  if (draft.mode !== 'hotel') {
    set('chambresMin', draft.bedroomsMin);
    if (draft.worstEnergyClass) params.set('dpe', draft.worstEnergyClass);
    set('anneeMin', draft.yearBuiltMin);
    set('anneeMax', draft.yearBuiltMax);
    setFlag('ascenseur', draft.requiresElevator);
  }
  if (draft.mode === 'buy' || draft.mode === 'rent') {
    set('etageMin', draft.floorMin);
    set('etageMax', draft.floorMax);
    setFlag('horsRdc', draft.excludesGroundFloor);
    const outdoor = OUTDOOR_SPACES.filter((space) => draft.outdoorSpaces.includes(space));
    if (outdoor.length) params.set('exterieur', outdoor.map((space) => OUTDOOR_PARAMS[space]).join(','));
  }
  setFlag('parking', draft.requiresParking);
  if (draft.mode === 'buy') {
    if (draft.isNewBuild !== null) params.set('neuf', draft.isNewBuild ? '1' : '0');
    set('prixM2Min', draft.pricePerSquareMeterMin);
    set('prixM2Max', draft.pricePerSquareMeterMax);
    setFlag('constructible', draft.requiresDocumentedBuildability);
    setFlag('viabilise', draft.requiresServiced);
    if (draft.zoning.trim()) params.set('plu', draft.zoning.trim());
  }
  if (draft.mode === 'invest') {
    set('apport', draft.downPayment);
    set('brutMin', draft.minGrossYieldPercent);
    set('netMin', draft.minNetYieldPercent);
    set('cashflowMin', draft.minMonthlyCashFlow);
    set('travauxMax', draft.maxWorksAmount);
    setFlag('mixte', draft.mixedBuilding);
    set('taxeMax', draft.maxAnnualPropertyTax);
    setFlag('loyerDeclare', draft.requiresDeclaredRent);
    if (draft.leasedOnly) params.set('situation', 'loue');
    else if (draft.vacantOnly) params.set('situation', 'libre');
    set('loyerMin', draft.minCurrentMonthlyRent);
    set('chargesAnMax', draft.maxAnnualCharges);
    set('lotsMin', draft.minUnits);
    set('vacantsMax', draft.maxVacantUnits);
  }
  if (draft.mode === 'rent') {
    if (draft.furnished !== null) params.set('meuble', draft.furnished ? '1' : '0');
    set('chargesMax', draft.maxMonthlyCharges);
    if (draft.availableBy) params.set('dispo', draft.availableBy);
  }
  if (draft.mode === 'hotel') {
    if (draft.hotelScope !== null) params.set('vente', draft.hotelScope);
    set('etoilesMin', draft.minHotelStars);
    set('caMin', draft.minAnnualRevenue);
    set('ebitdaMin', draft.minEbitda);
    set('resultatMin', draft.minOperatingIncome);
    set('occupationMin', draft.minOccupancyRatePercent);
  }
  return params;
}

/** Nombre de filtres posés (pastille du bouton Filtres) : autant que de pastilles, comme l'app. */
export function activeFilterCount(draft: SearchDraft): number {
  return filterChips(draft).length;
}

// MARK: - Pastilles des critères (SearchFilterChips.swift)

export type FilterChip = { id: string; label: string; remove: (draft: SearchDraft) => SearchDraft };

const thousands = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const euroFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const areaFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** « 250 k€ » pour un montant rond en milliers, sinon « 1 250 € ». */
export function compactPrice(value: number): string {
  const k = value / 1000;
  if (value < 10_000 || k !== Math.round(k)) return euroFormat.format(value);
  return `${thousands.format(k)} k€`;
}

/** « 150 k€ – 250 k€ », « min 40 m² », « 250 k€ » ; `null` si vide ou incohérent. */
export function rangeLabel(min: number | null, max: number | null, format: (n: number) => string): string | null {
  if (min !== null && max !== null) return min <= max ? `${format(min)} – ${format(max)}` : null;
  if (min !== null) return `min ${format(min)}`;
  if (max !== null) return format(max);
  return null;
}

const TYPE_NAMES: Record<PropertyType, string> = {
  apartment: 'Appartement', house: 'Maison', building: 'Immeuble', land: 'Terrain', commercial: 'Local commercial',
  office: 'Bureaux', parking: 'Parking', hotel: 'Hôtel', other: 'Autre',
};

const roundPercent = (value: number) => `${thousands.format(value)} %`;
const shortDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** « 7 % », « 6,5 % » : rendement de l'accueil (SearchCriterionOptions.yieldLabel). */
function yieldPercent(percent: number): string {
  const digits = Number.isInteger(percent) ? 0 : 1;
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(percent)} %`;
}

/** Montant signé d'un cash-flow : « +120 € », « −85 € », « 0 € » (Formatters.signedAmount). */
function signedEuros(value: number): string {
  const formatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Math.abs(value));
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
}

/** Pastilles des critères appliqués, dans l'ordre de l'app (le lieu est dans le champ). */
export function filterChips(draft: SearchDraft): FilterChip[] {
  const chips: FilterChip[] = [];
  const add = (id: string, label: string | null, remove: (d: SearchDraft) => SearchDraft) => { if (label) chips.push({ id, label, remove }); };
  const { mode } = draft;
  const invest = mode === 'invest';
  if (draft.radiusKm !== null) add('radius', `Rayon : ${draft.radiusKm} km`, (d) => ({ ...d, radiusKm: null }));
  const perMonth = mode === 'rent';
  const budget = rangeLabel(draft.priceMin, draft.priceMax, perMonth ? (n) => euroFormat.format(n) : compactPrice);
  add('budget', budget && `${perMonth ? 'Loyer' : 'Budget'} : ${budget}`, (d) => ({ ...d, priceMin: null, priceMax: null }));
  if (mode === 'buy') {
    const perSquare = rangeLabel(draft.pricePerSquareMeterMin, draft.pricePerSquareMeterMax, (n) => `${euroFormat.format(n)}/m²`);
    add('pricePerSquareMeter', perSquare && `Prix au m² : ${perSquare}`, (d) => ({ ...d, pricePerSquareMeterMin: null, pricePerSquareMeterMax: null }));
  }
  if (invest && draft.minGrossYieldPercent !== null && validPercent(draft.minGrossYieldPercent)) {
    add('gross', `Rendement : ${yieldPercent(draft.minGrossYieldPercent)}`, (d) => ({ ...d, minGrossYieldPercent: null }));
  }
  const types = MODE_PROPERTY_TYPES[mode].filter((t) => draft.types.includes(t));
  if (mode !== 'hotel' && types.length) add('types', types.map((t) => TYPE_NAMES[t]).join(', '), (d) => ({ ...d, types: [] }));
  const area = rangeLabel(draft.livingAreaMin, draft.livingAreaMax, (n) => `${areaFormat.format(n)} m²`);
  add('area', area && `Surface : ${area}`, (d) => ({ ...d, livingAreaMin: null, livingAreaMax: null }));
  if (draft.roomsMin !== null) {
    const [one, many] = mode === 'hotel' ? ['chambre', 'chambres'] : ['pièce', 'pièces'];
    add('rooms', draft.roomsMin > 1 ? `${draft.roomsMin} ${many} et +` : `1 ${one} et +`, (d) => ({ ...d, roomsMin: null }));
  }
  if (mode === 'buy' && draft.isNewBuild !== null) add('newBuild', draft.isNewBuild ? 'Neuf' : 'Ancien', (d) => ({ ...d, isNewBuild: null }));
  if (mode === 'hotel') {
    if (draft.minHotelStars !== null) {
      add('stars', `${draft.minHotelStars} étoile${draft.minHotelStars > 1 ? 's' : ''} et +`, (d) => ({ ...d, minHotelStars: null }));
    }
    if (draft.hotelScope !== null) add('scope', scopeLabel(draft.hotelScope), (d) => ({ ...d, hotelScope: null }));
    if (draft.minAnnualRevenue !== null) add('revenue', `CA : ${compactPrice(draft.minAnnualRevenue)} min`, (d) => ({ ...d, minAnnualRevenue: null }));
    if (draft.minEbitda !== null) add('ebitda', `EBITDA : ${compactPrice(draft.minEbitda)} min`, (d) => ({ ...d, minEbitda: null }));
    if (draft.minOperatingIncome !== null) {
      add('operatingIncome', `Résultat d'exploitation : ${compactPrice(draft.minOperatingIncome)} min`, (d) => ({ ...d, minOperatingIncome: null }));
    }
    if (draft.minOccupancyRatePercent !== null && validPercent(draft.minOccupancyRatePercent)) {
      add('occupancy', `Occupation : ${roundPercent(draft.minOccupancyRatePercent)} min`, (d) => ({ ...d, minOccupancyRatePercent: null }));
    }
  }
  if (mode !== 'hotel' && draft.bedroomsMin !== null) {
    add('bedrooms', draft.bedroomsMin > 1 ? `${draft.bedroomsMin} chambres et +` : '1 chambre et +', (d) => ({ ...d, bedroomsMin: null }));
  }
  if (mode === 'rent') {
    if (draft.furnished !== null) add('furnished', draft.furnished ? 'Meublée' : 'Non meublée', (d) => ({ ...d, furnished: null }));
    if (draft.maxMonthlyCharges !== null) add('charges', `Charges : ${euroFormat.format(draft.maxMonthlyCharges)} max`, (d) => ({ ...d, maxMonthlyCharges: null }));
    const latest = draft.availableBy ? endOfDay(draft.availableBy) : null;
    if (latest !== null) add('available', `Dispo. avant le ${shortDay.format(latest)}`, (d) => ({ ...d, availableBy: null }));
  }
  if (invest) {
    if (draft.minNetYieldPercent !== null && validPercent(draft.minNetYieldPercent)) {
      add('net', `Net : ${roundPercent(draft.minNetYieldPercent)}`, (d) => ({ ...d, minNetYieldPercent: null }));
    }
    if (draft.minMonthlyCashFlow !== null) add('cashflow', `Cash-flow : ${signedEuros(draft.minMonthlyCashFlow)}`, (d) => ({ ...d, minMonthlyCashFlow: null }));
    if (draft.downPayment !== null) add('downPayment', `Apport : ${compactPrice(draft.downPayment)}`, (d) => ({ ...d, downPayment: null }));
    if (draft.maxWorksAmount !== null) {
      add('works', draft.maxWorksAmount === 0 ? 'Sans travaux' : `Travaux : ${compactPrice(draft.maxWorksAmount)} max`, (d) => ({ ...d, maxWorksAmount: null }));
    }
    if (draft.maxAnnualPropertyTax !== null) {
      add('tax', `Taxe foncière : ${compactPrice(draft.maxAnnualPropertyTax)} max`, (d) => ({ ...d, maxAnnualPropertyTax: null }));
    }
    // Situation locative et immeuble mixte (les types d'actif ont déjà leur pastille).
    if (draft.leasedOnly) add('leased', 'Vendu loué', (d) => ({ ...d, leasedOnly: false }));
    if (draft.vacantOnly) add('vacant', 'Bien libre', (d) => ({ ...d, vacantOnly: false }));
    if (draft.mixedBuilding) add('investmentKind', 'Immeuble mixte', (d) => withInvestmentKind(d, 'classic'));
    if (draft.requiresDeclaredRent) add('declaredRent', 'Loyer déclaré', (d) => ({ ...d, requiresDeclaredRent: false }));
  }
  if (draft.worstEnergyClass !== null) add('energy', energyRangeLabel(draft.worstEnergyClass), (d) => ({ ...d, worstEnergyClass: null }));
  const floors = rangeLabel(draft.floorMin, draft.floorMax, (n) => `${n}e`);
  add('floorRange', floors && `Étage : ${floors}`, (d) => ({ ...d, floorMin: null, floorMax: null }));
  const years = rangeLabel(draft.yearBuiltMin, draft.yearBuiltMax, (n) => String(n));
  add('year', years && `Construction : ${years}`, (d) => ({ ...d, yearBuiltMin: null, yearBuiltMax: null }));
  if (mode === 'buy') {
    if (draft.requiresDocumentedBuildability) add('buildable', 'Constructibilité documentée', (d) => ({ ...d, requiresDocumentedBuildability: false }));
    if (draft.requiresServiced) add('serviced', 'Viabilisé', (d) => ({ ...d, requiresServiced: false }));
    if (draft.zoning.trim()) add('zoning', `Zone ${draft.zoning.trim()}`, (d) => ({ ...d, zoning: '' }));
  }
  if (invest && draft.minCurrentMonthlyRent !== null) {
    add('currentRent', `Loyer actuel : ${euroFormat.format(draft.minCurrentMonthlyRent)} min`, (d) => ({ ...d, minCurrentMonthlyRent: null }));
  }
  if (invest && draft.maxAnnualCharges !== null) {
    add('annualCharges', `Charges : ${compactPrice(draft.maxAnnualCharges)}/an max`, (d) => ({ ...d, maxAnnualCharges: null }));
  }
  if (draft.excludesGroundFloor) add('floor', 'Hors rez-de-chaussée', (d) => ({ ...d, excludesGroundFloor: false }));
  if (draft.requiresElevator) add('elevator', 'Ascenseur', (d) => ({ ...d, requiresElevator: false }));
  const outdoor = OUTDOOR_SPACES.filter((space) => draft.outdoorSpaces.includes(space));
  if (outdoor.length) add('outdoor', outdoor.map((space) => OUTDOOR_LABELS[space]).join(' ou '), (d) => ({ ...d, outdoorSpaces: [] }));
  if (draft.requiresParking) add('parking', 'Parking', (d) => ({ ...d, requiresParking: false }));
  return chips;
}
