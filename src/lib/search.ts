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
};

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
/** Apport par défaut d'Investir (comme l'accueil de l'app). */
export const DEFAULT_DOWN_PAYMENT = 50_000;

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
  };
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
  return chosen.length ? chosen : allowed;
}

export function transactionFor(mode: SearchMode): 'sale' | 'rent' {
  return mode === 'rent' ? 'rent' : 'sale';
}

/** Une borne min > max n'est pas appliquée (comme l'app). */
function range(min: number | null, max: number | null): [number | null, number | null] {
  if (min !== null && max !== null && min > max) return [null, null];
  return [min, max];
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
  if (!propertyTypesFor(draft).includes(row.property_type as PropertyType)) return false;
  if (!options.ignoreLocation && !locationContains(locationFor(draft), row)) return false;
  const price = Number(row.price);
  const [priceMin, priceMax] = range(draft.priceMin, draft.priceMax);
  if (priceMin !== null && price < priceMin) return false;
  if (priceMax !== null && price > priceMax) return false;
  const livingArea = Number(row.living_area);
  const [areaMin, areaMax] = range(draft.livingAreaMin, draft.livingAreaMax);
  if (areaMin !== null && livingArea < areaMin) return false;
  if (areaMax !== null && livingArea > areaMax) return false;
  // En location, le nombre de pièces ne concerne que les logements.
  const appliesHousingCriteria = draft.mode !== 'rent' || isDwelling(row.property_type);
  if (appliesHousingCriteria && draft.roomsMin !== null && !(row.rooms !== null && row.rooms >= draft.roomsMin)) return false;
  // Résidentiel écarte les biens vendus loués (ils sont dans Investir).
  if (draft.mode === 'buy' && row.rental_info?.isLeased === true) return false;
  if (draft.mode === 'invest') {
    if (!highlights) return false;
    if (draft.minGrossYieldPercent !== null && validPercent(draft.minGrossYieldPercent) && highlights.grossYield < draft.minGrossYieldPercent / 100) return false;
    if (draft.minNetYieldPercent !== null && validPercent(draft.minNetYieldPercent) && highlights.netYield < draft.minNetYieldPercent / 100) return false;
    if (draft.minMonthlyCashFlow !== null && highlights.monthlyCashFlow < draft.minMonthlyCashFlow) return false;
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
  if (draft.roomsMin !== null) request = request.gte('rooms', draft.roomsMin);
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
  if (draft.mode === 'invest') {
    draft.downPayment = amount(params.get('apport'));
    draft.minGrossYieldPercent = amount(params.get('brutMin'));
    draft.minNetYieldPercent = amount(params.get('netMin'));
    draft.minMonthlyCashFlow = signedAmount(params.get('cashflowMin'));
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
  if (draft.mode === 'invest') {
    if (draft.downPayment !== null) params.set('apport', String(draft.downPayment));
    if (draft.minGrossYieldPercent !== null) params.set('brutMin', String(draft.minGrossYieldPercent));
    if (draft.minNetYieldPercent !== null) params.set('netMin', String(draft.minNetYieldPercent));
    if (draft.minMonthlyCashFlow !== null) params.set('cashflowMin', String(draft.minMonthlyCashFlow));
  }
  return params;
}

/** Nombre de filtres posés (pastille du bouton Filtres). */
export function activeFilterCount(draft: SearchDraft): number {
  return [
    draft.priceMin, draft.priceMax, draft.livingAreaMin, draft.livingAreaMax, draft.roomsMin,
    draft.mode === 'invest' ? draft.minGrossYieldPercent : null,
    draft.mode === 'invest' ? draft.minNetYieldPercent : null,
    draft.mode === 'invest' ? draft.minMonthlyCashFlow : null,
  ].filter((v) => v !== null).length + (draft.types.length ? 1 : 0);
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

const percentLabel = (value: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)} %`;

/** Pastilles des critères appliqués, du plus important au plus fin (le lieu est dans le champ). */
export function filterChips(draft: SearchDraft): FilterChip[] {
  const chips: FilterChip[] = [];
  const add = (id: string, label: string | null, remove: (d: SearchDraft) => SearchDraft) => { if (label) chips.push({ id, label, remove }); };
  const invest = draft.mode === 'invest';
  if (draft.radiusKm !== null) add('radius', `Rayon : ${draft.radiusKm} km`, (d) => ({ ...d, radiusKm: null }));
  const perMonth = draft.mode === 'rent';
  const budget = rangeLabel(draft.priceMin, draft.priceMax, perMonth ? (n) => euroFormat.format(n) : compactPrice);
  add('budget', budget && `${perMonth ? 'Loyer' : 'Budget'} : ${budget}`, (d) => ({ ...d, priceMin: null, priceMax: null }));
  if (invest && draft.minGrossYieldPercent !== null && validPercent(draft.minGrossYieldPercent)) {
    add('gross', `Rendement : ${percentLabel(draft.minGrossYieldPercent)}`, (d) => ({ ...d, minGrossYieldPercent: null }));
  }
  const types = MODE_PROPERTY_TYPES[draft.mode].filter((t) => draft.types.includes(t));
  if (draft.mode !== 'hotel' && types.length) add('types', types.map((t) => TYPE_NAMES[t]).join(', '), (d) => ({ ...d, types: [] }));
  const area = rangeLabel(draft.livingAreaMin, draft.livingAreaMax, (n) => `${areaFormat.format(n)} m²`);
  add('area', area && `Surface : ${area}`, (d) => ({ ...d, livingAreaMin: null, livingAreaMax: null }));
  if (draft.roomsMin !== null) {
    const [one, many] = draft.mode === 'hotel' ? ['chambre', 'chambres'] : ['pièce', 'pièces'];
    add('rooms', draft.roomsMin > 1 ? `${draft.roomsMin} ${many} et +` : `1 ${one} et +`, (d) => ({ ...d, roomsMin: null }));
  }
  if (invest) {
    if (draft.minNetYieldPercent !== null && validPercent(draft.minNetYieldPercent)) {
      add('net', `Net : ${percentLabel(draft.minNetYieldPercent)}`, (d) => ({ ...d, minNetYieldPercent: null }));
    }
    if (draft.minMonthlyCashFlow !== null) {
      const v = draft.minMonthlyCashFlow;
      const sign = v > 0 ? '+' : v < 0 ? '−' : '';
      add('cashflow', `Cash-flow : ${sign}${euroFormat.format(Math.abs(v))}`, (d) => ({ ...d, minMonthlyCashFlow: null }));
    }
    if (draft.downPayment !== null) add('downPayment', `Apport : ${compactPrice(draft.downPayment)}`, (d) => ({ ...d, downPayment: null }));
  }
  return chips;
}
