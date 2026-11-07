import { formatArea, formatFraction, formatPrice } from '../format';
import { PROPERTY_TYPE_LABELS, type PropertyType, type SearchMode } from '../labels';
import type { HotelScope } from '../listingJson';
import type { Coordinate } from '../places';
import {
  BEDROOM_NOUNS, chosenPlace, countRangeLabel, DEFAULT_RADIUS_METERS, defaultDraft, floorRange, knownCityCenter, MODE_PROPERTY_TYPES,
  ROOM_NOUNS, searchCenter, type EnergyClass, type OutdoorSpace, type SearchDraft,
} from '../search';
import { supabase } from '../supabase';
import { databaseMessage } from './errors';
import { createStore, currentUserId, sessionStore } from './session';

// Recherches enregistrées (table saved_searches). La colonne `query` garde la forme exacte de `SearchQuery` de
// l'app (ImmoDomain/Search/SearchQuery.swift, encodage Swift) : l'iPhone la relit strictement, et une seule
// recherche illisible vide toute sa liste. Les conversions copient App/AppRouter.swift (`query(for:)` et
// `SearchDraft(query:)`).

export type ValueRange = { min?: number; max?: number };

export type JsonLocation =
  | { anywhere: Record<string, never> }
  | { city: { name: string; postalCode?: string; inseeCode?: string } }
  | { around: { center: Coordinate; radiusMeters: number } }
  | { area: { _0: { southWest: Coordinate; northEast: Coordinate } } };

export type InvestmentJson = {
  minGrossYield?: number;
  minNetYield?: number;
  minMonthlyCashFlow?: number;
  downPayment?: number;
  maxWorksAmount?: number;
  maxAnnualPropertyTax?: number;
  requiresDeclaredRent: boolean;
  leasedOnly: boolean;
  vacantOnly?: boolean;
  minCurrentMonthlyRent?: number;
  maxAnnualCharges?: number;
};

export type HotelJson = {
  minStars?: number;
  minAnnualRevenue?: number;
  minEBITDA?: number;
  minOperatingIncome?: number;
  minOccupancyRate?: number;
  scope?: HotelScope;
};

export type BuildingJson = { minUnits?: number; maxVacantUnits?: number; mixedOnly?: boolean };

export type SearchQueryJson = {
  transaction: 'sale' | 'rent';
  propertyTypes: PropertyType[];
  location: JsonLocation;
  price: ValueRange;
  livingArea: ValueRange;
  rooms: ValueRange;
  bedrooms: ValueRange;
  worstEnergyClass?: EnergyClass;
  floor: ValueRange;
  requiresElevator: boolean;
  requiresOutdoorSpace: boolean;
  outdoorSpaces: OutdoorSpace[];
  requiresParking: boolean;
  furnished?: boolean;
  isNewBuild?: boolean;
  excludesLeased?: boolean;
  pricePerSquareMeter?: ValueRange;
  yearBuilt?: ValueRange;
  requiresDocumentedBuildability?: boolean;
  requiresServiced?: boolean;
  zoning?: string;
  maxMonthlyCharges?: number;
  availableBy?: string;
  investment?: InvestmentJson;
  hotel?: HotelJson;
  building?: BuildingJson;
  text?: string;
  locationLabel?: string;
};

export type SavedSearch = {
  id: string;
  user_id: string;
  name: string;
  query: SearchQueryJson;
  alerts_enabled: boolean;
  created_at: string;
  last_notified_at: string | null;
  last_viewed_at: string | null;
};

const COLUMNS = 'id, user_id, name, query, alerts_enabled, created_at, last_notified_at, last_viewed_at';

// MARK: - Critères → requête (AppRouter.swift, query(for:))

/** Intervalle saisi ; vide s'il est incohérent (min > max). Les bornes absentes ne sont pas écrites. */
function range(min: number | null, max: number | null): ValueRange {
  if (min !== null && max !== null && min > max) return {};
  return valueRange(min, max);
}

function valueRange(min: number | null | undefined, max: number | null | undefined): ValueRange {
  const out: ValueRange = {};
  if (min !== null && min !== undefined) out.min = min;
  if (max !== null && max !== undefined) out.max = max;
  return out;
}

/** Pourcentage saisi (7) en fraction (0,07), sans bruit de calcul ; `undefined` s'il est hors 0–100 %. */
function fraction(percent: number | null): number | undefined {
  if (percent === null || !(percent >= 0 && percent <= 100)) return undefined;
  return Number((percent / 100).toPrecision(12));
}

function percentOf(value: number | undefined): number | null {
  return value === undefined ? null : Number((value * 100).toPrecision(12));
}

/** Retire les clés sans valeur, comme l'encodage Swift des optionnels (`encodeIfPresent`). */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)) as T;
}

/** Date « au plus tard le » (AAAA-MM-JJ) en date ISO 8601, minuit à l'heure du navigateur. */
function isoDay(day: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function localDay(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function queryFromDraft(draft: SearchDraft): SearchQueryJson {
  const mode = draft.mode;
  const query: SearchQueryJson = {
    transaction: mode === 'rent' ? 'rent' : 'sale',
    propertyTypes: [],
    location: { anywhere: {} },
    price: {},
    livingArea: {},
    rooms: {},
    bedrooms: {},
    floor: {},
    requiresElevator: false,
    requiresOutdoorSpace: false,
    outdoorSpaces: [],
    requiresParking: false,
  };
  const place = draft.place.trim();
  if (draft.area) {
    // Cadre de la carte (« Rechercher dans cette zone ») : ouest, sud, est, nord.
    const [west, south, east, north] = draft.area;
    query.location = { area: { _0: { southWest: { latitude: south, longitude: west }, northEast: { latitude: north, longitude: east } } } };
  } else {
    const center = searchCenter(draft);
    const chosen = chosenPlace(draft);
    if (center) {
      query.location = { around: { center: { latitude: center.latitude, longitude: center.longitude }, radiusMeters: draft.radiusKm ? draft.radiusKm * 1000 : DEFAULT_RADIUS_METERS } };
      if (!knownCityCenter(place)) query.locationLabel = place;
    } else if (chosen) {
      query.location = { city: compact({ name: place, postalCode: chosen.postalCode, inseeCode: chosen.inseeCode }) };
    } else if (place) {
      query.location = { city: { name: place } };
    }
  }
  const allowed = MODE_PROPERTY_TYPES[mode];
  const chosenTypes = draft.types.filter((type) => allowed.includes(type));
  if (mode === 'invest' && draft.mixedBuilding && !chosenTypes.includes('building')) chosenTypes.push('building');
  query.propertyTypes = chosenTypes.length ? [...new Set(chosenTypes)] : [...allowed];
  query.price = range(draft.priceMin, draft.priceMax);
  query.livingArea = range(draft.livingAreaMin, draft.livingAreaMax);
  // Pièces et chambres : minimum et maximum (un hôtel n'a qu'un minimum de chambres).
  query.rooms = range(draft.roomsMin, mode === 'hotel' ? null : draft.roomsMax);
  query.bedrooms = range(draft.bedroomsMin, draft.bedroomsMax);
  const [floorMin, floorMax] = floorRange(draft);
  query.floor = valueRange(floorMin, floorMax);
  if (draft.yearBuiltMin !== null || draft.yearBuiltMax !== null) query.yearBuilt = range(draft.yearBuiltMin, draft.yearBuiltMax);
  if (draft.worstEnergyClass) query.worstEnergyClass = draft.worstEnergyClass;
  query.requiresElevator = draft.requiresElevator;
  query.outdoorSpaces = [...new Set(draft.outdoorSpaces)];
  query.requiresParking = draft.requiresParking;
  if (mode === 'rent') {
    if (draft.furnished !== null) query.furnished = draft.furnished;
    if (draft.maxMonthlyCharges !== null) query.maxMonthlyCharges = draft.maxMonthlyCharges;
    const available = draft.availableBy ? isoDay(draft.availableBy) : undefined;
    if (available) query.availableBy = available;
  }
  if (mode === 'buy') {
    if (draft.isNewBuild !== null) query.isNewBuild = draft.isNewBuild;
    query.excludesLeased = true;
    if (draft.requiresDocumentedBuildability) query.requiresDocumentedBuildability = true;
    if (draft.requiresServiced) query.requiresServiced = true;
    const zone = draft.zoning.trim();
    if (zone) query.zoning = zone;
    if (draft.pricePerSquareMeterMin !== null || draft.pricePerSquareMeterMax !== null) {
      query.pricePerSquareMeter = range(draft.pricePerSquareMeterMin, draft.pricePerSquareMeterMax);
    }
  }
  if (mode === 'hotel') {
    const hotel = compact<HotelJson>({
      minStars: draft.minHotelStars ?? undefined,
      minAnnualRevenue: draft.minAnnualRevenue ?? undefined,
      minEBITDA: draft.minEbitda ?? undefined,
      minOperatingIncome: draft.minOperatingIncome ?? undefined,
      minOccupancyRate: fraction(draft.minOccupancyRatePercent),
      scope: draft.hotelScope ?? undefined,
    });
    if (Object.keys(hotel).length) query.hotel = hotel;
  }
  if (mode === 'invest') {
    query.investment = compact<InvestmentJson>({
      minGrossYield: fraction(draft.minGrossYieldPercent),
      minNetYield: fraction(draft.minNetYieldPercent),
      minMonthlyCashFlow: draft.minMonthlyCashFlow ?? undefined,
      downPayment: draft.downPayment ?? undefined,
      maxWorksAmount: draft.maxWorksAmount ?? undefined,
      maxAnnualPropertyTax: draft.maxAnnualPropertyTax ?? undefined,
      requiresDeclaredRent: draft.requiresDeclaredRent,
      leasedOnly: draft.leasedOnly,
      vacantOnly: draft.vacantOnly ? true : undefined,
      minCurrentMonthlyRent: draft.minCurrentMonthlyRent ?? undefined,
      maxAnnualCharges: draft.maxAnnualCharges ?? undefined,
    });
    const building = compact<BuildingJson>({
      minUnits: draft.minUnits ?? undefined,
      maxVacantUnits: draft.maxVacantUnits ?? undefined,
      mixedOnly: draft.mixedBuilding && !draft.types.includes('building') ? true : undefined,
    });
    if (Object.keys(building).length) query.building = building;
  }
  return query;
}

// MARK: - Requête → critères (AppRouter.swift, SearchDraft(query:))

/** Catégorie de la recherche : Hôtels, Investir, Location ou Résidentiel (SavedSearchesView.swift 241–245). */
export function modeOf(query: SearchQueryJson): SearchMode {
  const types = new Set(query.propertyTypes);
  if (types.size === 1 && types.has('hotel')) return 'hotel';
  if (query.investment) return 'invest';
  return query.transaction === 'rent' ? 'rent' : 'buy';
}

export const MODE_TITLES: Record<SearchMode, string> = { buy: 'Résidentiel', rent: 'Location', invest: 'Investir', hotel: 'Hôtels' };

/** Grande ville dont le centre est exactement ce point (KnownCities.name(at:)) : « Lyon ». */
function knownCityAt(center: Coordinate): string | null {
  for (const name of ['paris', 'lyon', 'marseille', 'bordeaux', 'nantes', 'toulouse', 'lille', 'montpellier']) {
    const known = knownCityCenter(name);
    if (known && known.latitude === center.latitude && known.longitude === center.longitude) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return null;
}

function sameSet<T>(a: T[], b: T[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((item) => right.has(item));
}

export function draftFromQuery(query: SearchQueryJson): SearchDraft {
  const mode = modeOf(query);
  const draft = defaultDraft(mode);
  const location = query.location;
  if ('city' in location) {
    draft.place = location.city.postalCode ?? location.city.name;
  } else if ('around' in location) {
    const { center, radiusMeters } = location.around;
    const known = knownCityAt(center);
    if (known) {
      draft.place = known;
    } else if (query.locationLabel) {
      draft.place = query.locationLabel;
      draft.chosen = { kind: 'municipality', name: query.locationLabel, coordinate: center };
    }
    draft.radiusKm = radiusMeters === DEFAULT_RADIUS_METERS ? null : Math.round(radiusMeters / 1000);
  } else if ('area' in location) {
    // Zone de la carte, gardée pour relancer la même recherche (l'app la perd encore : SearchDraft(query:)).
    const { southWest, northEast } = location.area._0;
    draft.area = [southWest.longitude, southWest.latitude, northEast.longitude, northEast.latitude];
  }
  draft.maxMonthlyCharges = query.maxMonthlyCharges ?? null;
  draft.pricePerSquareMeterMin = query.pricePerSquareMeter?.min ?? null;
  draft.pricePerSquareMeterMax = query.pricePerSquareMeter?.max ?? null;
  draft.availableBy = localDay(query.availableBy);
  // Tous les types d'une catégorie = aucun type choisi.
  const isCategoryDefault = (Object.values(MODE_PROPERTY_TYPES) as PropertyType[][]).some((types) => sameSet(types, query.propertyTypes));
  const onlyHotel = sameSet(query.propertyTypes, ['hotel']);
  draft.types = isCategoryDefault && !onlyHotel ? [] : [...new Set(query.propertyTypes)];
  draft.isNewBuild = query.isNewBuild ?? null;
  draft.minHotelStars = query.hotel?.minStars ?? null;
  draft.minAnnualRevenue = query.hotel?.minAnnualRevenue ?? null;
  draft.minEbitda = query.hotel?.minEBITDA ?? null;
  draft.minOperatingIncome = query.hotel?.minOperatingIncome ?? null;
  draft.minOccupancyRatePercent = percentOf(query.hotel?.minOccupancyRate);
  draft.hotelScope = query.hotel?.scope ?? null;
  draft.priceMin = query.price.min ?? null;
  draft.priceMax = query.price.max ?? null;
  draft.livingAreaMin = query.livingArea.min ?? null;
  draft.livingAreaMax = query.livingArea.max ?? null;
  draft.roomsMin = query.rooms.min ?? null;
  draft.roomsMax = mode === 'hotel' ? null : query.rooms.max ?? null;
  draft.bedroomsMin = query.bedrooms.min ?? null;
  draft.bedroomsMax = query.bedrooms.max ?? null;
  draft.worstEnergyClass = query.worstEnergyClass ?? null;
  const lowest = query.floor.min ?? 0;
  draft.excludesGroundFloor = lowest >= 1;
  draft.floorMin = lowest > 1 ? lowest : null;
  draft.floorMax = query.floor.max ?? null;
  draft.yearBuiltMin = query.yearBuilt?.min ?? null;
  draft.yearBuiltMax = query.yearBuilt?.max ?? null;
  draft.requiresDocumentedBuildability = query.requiresDocumentedBuildability === true;
  draft.requiresServiced = query.requiresServiced === true;
  draft.zoning = query.zoning ?? '';
  draft.requiresElevator = query.requiresElevator;
  draft.outdoorSpaces = [...new Set(query.outdoorSpaces)];
  draft.requiresParking = query.requiresParking;
  draft.furnished = query.furnished ?? null;
  const investment = query.investment;
  if (investment) {
    draft.minGrossYieldPercent = percentOf(investment.minGrossYield);
    draft.minNetYieldPercent = percentOf(investment.minNetYield);
    draft.minMonthlyCashFlow = investment.minMonthlyCashFlow ?? null;
    draft.downPayment = investment.downPayment ?? null;
    draft.maxWorksAmount = investment.maxWorksAmount ?? null;
    draft.maxAnnualPropertyTax = investment.maxAnnualPropertyTax ?? null;
    draft.requiresDeclaredRent = investment.requiresDeclaredRent;
    draft.leasedOnly = investment.leasedOnly;
    draft.vacantOnly = investment.vacantOnly === true;
    draft.minCurrentMonthlyRent = investment.minCurrentMonthlyRent ?? null;
    draft.maxAnnualCharges = investment.maxAnnualCharges ?? null;
    draft.minUnits = query.building?.minUnits ?? null;
    draft.maxVacantUnits = query.building?.maxVacantUnits ?? null;
    draft.mixedBuilding = query.building?.mixedOnly === true;
  }
  return draft;
}

// MARK: - Textes (SavedSearchesView.swift 239–276)

export function placeLabelOf(query: SearchQueryJson): string | null {
  const location = query.location;
  if ('city' in location) return location.city.postalCode ? `${location.city.name} (${location.city.postalCode})` : location.city.name;
  if ('around' in location) {
    const name = knownCityAt(location.around.center) ?? query.locationLabel;
    return name ? `${name} et alentours` : 'Autour d\'un point';
  }
  if ('area' in location) return 'Zone de la carte';
  return null;
}

export function budgetLabelOf(query: SearchQueryJson): string | null {
  const suffix = query.transaction === 'rent' ? '/mois' : '';
  const { min, max } = query.price;
  if (min !== undefined && max !== undefined) return `${formatPrice(min)} – ${formatPrice(max)}${suffix}`;
  if (max !== undefined) return `Jusqu'à ${formatPrice(max)}${suffix}`;
  if (min !== undefined) return `Dès ${formatPrice(min)}${suffix}`;
  return null;
}

/** Critères principaux : types de bien, surface, pièces, rentabilité. */
export function criteriaLabelsOf(query: SearchQueryJson): string[] {
  const labels: string[] = [];
  const types = [...new Set(query.propertyTypes)];
  const onlyHotel = types.length === 1 && types[0] === 'hotel';
  if (types.length && !onlyHotel) {
    labels.push(types.map((type) => PROPERTY_TYPE_LABELS[type] ?? type).sort().join(', '));
  }
  if (query.livingArea.min !== undefined) labels.push(`${formatArea(query.livingArea.min)} et +`);
  const rooms = countRangeLabel(query.rooms.min, query.rooms.max, onlyHotel ? BEDROOM_NOUNS : ROOM_NOUNS);
  if (rooms) labels.push(rooms);
  if (query.investment?.minGrossYield !== undefined) labels.push(`Rentabilité ≥ ${formatFraction(query.investment.minGrossYield, 0)}`);
  return labels;
}

/** « Résidentiel · Lyon · Appartement · Jusqu'à 350 000 € », 80 caractères au plus (SearchView.proposedName). */
export function proposedName(query: SearchQueryJson, mode: SearchMode): string {
  const parts = [MODE_TITLES[mode], placeLabelOf(query), criteriaLabelsOf(query)[0], budgetLabelOf(query)].filter((part): part is string => Boolean(part));
  return [...parts.join(' · ')].slice(0, 80).join('');
}

/** Deux requêtes identiques (les ensembles de types et d'extérieurs sans ordre), comme `==` en Swift. */
export function sameQuery(a: SearchQueryJson, b: SearchQueryJson): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// MARK: - Serveur

export type SavedSearchesState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: SavedSearch[] };

export const savedSearchesStore = createStore<SavedSearchesState>({ status: 'none' });

let loadedFor: string | null = null;

export async function loadSavedSearches(force = false): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    loadedFor = null;
    savedSearchesStore.set({ status: 'none' });
    return;
  }
  if (!force && loadedFor === session.userId && savedSearchesStore.get().status !== 'error') return;
  loadedFor = session.userId;
  if (savedSearchesStore.get().status !== 'ready') savedSearchesStore.set({ status: 'loading' });
  const { data, error } = await supabase.from('saved_searches').select(COLUMNS).order('created_at', { ascending: false });
  if (currentUserId() !== session.userId) return;
  if (error) {
    loadedFor = null;
    savedSearchesStore.set({ status: 'error', message: databaseMessage(error) });
    return;
  }
  savedSearchesStore.set({ status: 'ready', items: (data ?? []) as SavedSearch[] });
}

function items(): SavedSearch[] {
  const state = savedSearchesStore.get();
  return state.status === 'ready' ? state.items : [];
}

function replaceItem(search: SavedSearch) {
  const list = items();
  const index = list.findIndex((item) => item.id === search.id);
  const next = index < 0 ? [search, ...list] : list.map((item) => (item.id === search.id ? search : item));
  savedSearchesStore.set({ status: 'ready', items: next });
}

/**
 * Enregistre une recherche comme l'app (SupabaseAccountRepositories.swift 326–341) : mise à jour par son id, puis
 * création si aucune ligne ne revient. Renvoie le message d'erreur, ou `null`.
 */
export async function saveSearch(search: Pick<SavedSearch, 'id' | 'name' | 'query' | 'alerts_enabled'>): Promise<string | null> {
  if (!currentUserId()) return 'Votre session a expiré. Reconnectez-vous.';
  const name = [...search.name.trim()].slice(0, 80).join('');
  if (!name) return 'Donnez un nom à la recherche.';
  const values = { name, query: search.query, alerts_enabled: search.alerts_enabled };
  try {
    const updated = await supabase.from('saved_searches').update(values).eq('id', search.id).select(COLUMNS);
    if (updated.error) throw updated.error;
    let row = (updated.data?.[0] as SavedSearch | undefined) ?? null;
    if (!row) {
      const inserted = await supabase.from('saved_searches').insert({ id: search.id, ...values }).select(COLUMNS).single();
      if (inserted.error) throw inserted.error;
      row = inserted.data as SavedSearch;
    }
    replaceItem(row);
    return null;
  } catch (error) {
    return databaseMessage(error);
  }
}

/** « Vue » : la date de la dernière consultation (les nouveautés repartent de là). */
export async function markViewed(id: string): Promise<void> {
  const now = new Date().toISOString();
  const search = items().find((item) => item.id === id);
  if (search) replaceItem({ ...search, last_viewed_at: now });
  await supabase.from('saved_searches').update({ last_viewed_at: now }).eq('id', id);
}

export async function deleteSearch(id: string): Promise<string | null> {
  const { error } = await supabase.from('saved_searches').delete().eq('id', id);
  if (error) return databaseMessage(error);
  savedSearchesStore.set({ status: 'ready', items: items().filter((item) => item.id !== id) });
  return null;
}

/** Nouvelle recherche, avec les alertes activées (SavedSearch de l'app). */
export function newSavedSearch(name: string, query: SearchQueryJson) {
  return { id: crypto.randomUUID(), name, query, alerts_enabled: true };
}
