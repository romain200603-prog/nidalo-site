import type { PropertyType, SearchMode } from './labels';
import type { HotelScope } from './listingJson';
import type { Coordinate } from './places';
import { defaultDraft, knownCityCenter, type EnergyClass, type OutdoorSpace, type SearchDraft } from './search';

// Recherche réglée par le projet immobilier, comme l'app : critères du projet (colonne criteria de
// real_estate_projects, ImmoDomain/Engagement/ProjectCriteria.swift), part renseignée (completion(for:)) et
// recherche qu'ils donnent (SearchDraft(project:), App/AppRouter.swift 381–450). L'app l'applique dès que le projet
// a des critères (applyProject, AppRouter.swift 818–821) ; le site s'en sert pour « Biens similaires à vos recherches ».

type Json = Record<string, unknown>;

const PROPERTY_TYPES: PropertyType[] = ['apartment', 'house', 'building', 'land', 'commercial', 'office', 'parking', 'hotel', 'other'];
/** Actifs d'investissement (InvestmentProjectCriteria.assetTypes) : l'hôtel a sa propre catégorie. */
const INVESTMENT_ASSET_TYPES: PropertyType[] = ['apartment', 'house', 'building', 'commercial', 'office'];
const ENERGY_CLASSES: EnergyClass[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const OUTDOOR_SPACES: OutdoorSpace[] = ['balcony', 'terrace', 'garden'];
const HOTEL_SCOPES: HotelScope[] = ['wallsAndBusiness', 'wallsOnly', 'businessOnly'];
const FINANCING = ['bankLoan', 'cash', 'undecided'];

function object(value: unknown): Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

/** Montant (Decimal de l'app, encodé en nombre) ; null s'il est absent. */
function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integer(value: unknown): number | null {
  const n = number(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

function flag(value: unknown): boolean {
  return value === true;
}

function optionalFlag(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function setOf<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is T => typeof item === 'string' && (allowed as readonly string[]).includes(item)))];
}

/** Fraction (0,07) en pourcentage saisi (7), sans bruit de calcul. */
function percent(value: unknown): number | null {
  const n = number(value);
  return n === null ? null : Number((n * 100).toPrecision(12));
}

/** Date ISO 8601 en jour AAAA-MM-JJ du navigateur (champ « Disponible au plus tard le » de la recherche). */
function localDay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type ProjectLocation = { place: string; radiusKm: number | null; center: Coordinate | null };

function location(value: unknown): ProjectLocation {
  const json = object(value);
  const center = object(json.center);
  const latitude = number(center.latitude);
  const longitude = number(center.longitude);
  return {
    place: typeof json.place === 'string' ? json.place : '',
    radiusKm: integer(json.radiusKilometers),
    center: latitude !== null && longitude !== null ? { latitude, longitude } : null,
  };
}

/** Critères de la catégorie du projet (une catégorie absente reste vide, comme le décodage tolérant de l'app). */
function criteriaFor(kind: SearchMode, criteria: unknown): Json {
  const json = object(criteria);
  switch (kind) {
    case 'buy': return object(json.residential);
    case 'invest': return object(json.investment);
    case 'rent': return object(json.rental);
    case 'hotel': return object(json.hotel);
  }
}

/** Part des critères de la catégorie qui sont renseignés, de 0 à 1 (ProjectCriteria.completion(for:)). */
export function projectCompletion(kind: SearchMode, criteria: unknown): number {
  const c = criteriaFor(kind, criteria);
  const place = location(c.location).place !== '';
  let filled: boolean[];
  switch (kind) {
    case 'buy': {
      const types = setOf(c.propertyTypes, PROPERTY_TYPES);
      filled = [number(c.maxBudget) !== null, number(c.downPayment) !== null, oneOf(c.financing, FINANCING) !== null, types.length > 0,
        number(c.minArea) !== null || number(c.minLandArea) !== null, integer(c.minRooms) !== null || (types.length === 1 && types[0] === 'land'),
        place];
      break;
    }
    case 'invest':
      filled = [number(c.maxPrice) !== null, number(c.downPayment) !== null, oneOf(c.financing, FINANCING) !== null,
        setOf(c.assetTypes, INVESTMENT_ASSET_TYPES).length > 0, number(c.minGrossYield) !== null || number(c.minNetYield) !== null,
        number(c.minMonthlyCashFlow) !== null, place];
      break;
    case 'rent':
      filled = [number(c.maxRent) !== null, setOf(c.propertyTypes, PROPERTY_TYPES).length > 0, number(c.minArea) !== null,
        integer(c.minRooms) !== null, optionalFlag(c.furnished) !== null, localDay(c.moveInBy) !== null, place];
      break;
    case 'hotel':
      filled = [oneOf(c.scope, HOTEL_SCOPES) !== null, number(c.maxBudget) !== null, number(c.downPayment) !== null, integer(c.minRooms) !== null,
        number(c.minAnnualRevenue) !== null || number(c.minEBITDA) !== null || number(c.minOperatingIncome) !== null || number(c.minOccupancyRate) !== null,
        place];
      break;
  }
  return filled.filter(Boolean).length / filled.length;
}

/** Recherche réglée par le projet (SearchDraft(project:)) : lieu et rayon, puis les critères de sa catégorie. */
export function draftFromProject(kind: SearchMode, criteria: unknown): SearchDraft {
  const c = criteriaFor(kind, criteria);
  const draft = defaultDraft(kind);
  const where = location(c.location);
  draft.place = where.place;
  draft.radiusKm = where.radiusKm;
  // Commune choisie dans les suggestions : le rayon s'applique autour de son centre (sauf grande ville connue).
  if (where.center && knownCityCenter(where.place) === null) {
    draft.chosen = { kind: 'municipality', name: where.place, coordinate: where.center };
  }
  switch (kind) {
    case 'buy':
      draft.priceMax = number(c.maxBudget);
      draft.types = setOf(c.propertyTypes, PROPERTY_TYPES);
      draft.roomsMin = integer(c.minRooms);
      draft.bedroomsMin = integer(c.minBedrooms);
      draft.livingAreaMin = number(c.minArea);
      draft.excludesGroundFloor = flag(c.excludesGroundFloor);
      draft.requiresElevator = flag(c.requiresElevator);
      draft.outdoorSpaces = setOf(c.outdoorSpaces, OUTDOOR_SPACES);
      draft.requiresParking = flag(c.requiresParking);
      draft.worstEnergyClass = oneOf(c.worstEnergyClass, ENERGY_CLASSES);
      draft.isNewBuild = optionalFlag(c.isNewBuild);
      draft.floorMin = integer(c.minFloor);
      draft.floorMax = integer(c.maxFloor);
      draft.yearBuiltMin = integer(c.minYearBuilt);
      draft.requiresDocumentedBuildability = flag(c.requiresDocumentedBuildability);
      draft.requiresServiced = flag(c.requiresServiced);
      break;
    case 'invest':
      draft.priceMax = number(c.maxPrice);
      draft.downPayment = number(c.downPayment);
      draft.maxWorksAmount = number(c.worksBudget);
      // Un projet enregistré avec l'hôtel parmi les actifs : l'hôtel est ignoré (catégorie Hôtel à part).
      draft.types = setOf(c.assetTypes, INVESTMENT_ASSET_TYPES);
      draft.minGrossYieldPercent = percent(c.minGrossYield);
      draft.minNetYieldPercent = percent(c.minNetYield);
      draft.minMonthlyCashFlow = number(c.minMonthlyCashFlow);
      draft.minCurrentMonthlyRent = number(c.minCurrentMonthlyRent);
      draft.leasedOnly = flag(c.leasedOnly);
      draft.mixedBuilding = flag(c.includesMixedBuildings);
      draft.minUnits = integer(c.minUnits);
      draft.maxAnnualPropertyTax = number(c.maxAnnualPropertyTax);
      draft.worstEnergyClass = oneOf(c.worstEnergyClass, ENERGY_CLASSES);
      break;
    case 'rent':
      draft.priceMax = number(c.maxRent);
      draft.maxMonthlyCharges = number(c.maxMonthlyCharges);
      draft.types = setOf(c.propertyTypes, PROPERTY_TYPES);
      draft.roomsMin = integer(c.minRooms);
      draft.bedroomsMin = integer(c.minBedrooms);
      draft.livingAreaMin = number(c.minArea);
      draft.furnished = optionalFlag(c.furnished);
      draft.availableBy = localDay(c.moveInBy);
      draft.requiresElevator = flag(c.requiresElevator);
      draft.requiresParking = flag(c.requiresParking);
      draft.outdoorSpaces = setOf(c.outdoorSpaces, OUTDOOR_SPACES);
      draft.worstEnergyClass = oneOf(c.worstEnergyClass, ENERGY_CLASSES);
      break;
    case 'hotel':
      draft.types = ['hotel'];
      draft.priceMax = number(c.maxBudget);
      draft.roomsMin = integer(c.minRooms);
      draft.minHotelStars = integer(c.minStars);
      draft.livingAreaMin = number(c.minArea);
      draft.minAnnualRevenue = number(c.minAnnualRevenue);
      draft.minEbitda = number(c.minEBITDA);
      draft.minOperatingIncome = number(c.minOperatingIncome);
      draft.minOccupancyRatePercent = percent(c.minOccupancyRate);
      draft.hotelScope = oneOf(c.scope, HOTEL_SCOPES);
      break;
  }
  return draft;
}
