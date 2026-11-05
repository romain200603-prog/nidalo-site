// Suggestions de lieux pendant la saisie, comme l'app (ImmoDomain/Common/PlaceSuggestion.swift et
// Data/Places/FrenchPlaceProvider.swift) : données publiques françaises, sans clé.
// - Géoplateforme de l'IGN (data.geopf.fr/geocodage) : arrondissements et quartiers ;
// - geo.api.gouv.fr : communes d'un code postal, d'un début de code postal ou d'un nom.

export type PlaceKind = 'municipality' | 'district' | 'locality' | 'street' | 'address';

export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  municipality: 'Commune',
  district: 'Arrondissement',
  locality: 'Quartier',
  street: 'Rue',
  address: 'Adresse',
};

export type Coordinate = { latitude: number; longitude: number };

export type PlaceSuggestion = {
  id: string;
  kind: PlaceKind;
  /** « Péron », « Lyon 3e Arrondissement ». */
  name: string;
  postalCode?: string;
  /** Commune du lieu (« Lyon » pour « Lyon 3e Arrondissement »). */
  city?: string;
  inseeCode?: string;
  /** Département (« Ain »). */
  department?: string;
  coordinate?: Coordinate;
};

/** « 01630 · Ain · Commune ». */
export function placeSubtitle(place: PlaceSuggestion): string {
  const where =
    place.kind === 'municipality' ? place.department
      : place.kind === 'district' ? (place.city ?? place.department)
        : place.city === place.name ? place.department : place.city;
  return [place.postalCode, where, PLACE_KIND_LABELS[place.kind]].filter((part) => part && part.length > 0).join(' · ');
}

/** Texte repris dans le champ : « Péron », « Lyon 3e ». */
export function placeShortName(place: PlaceSuggestion): string {
  return place.kind === 'district' ? place.name.replace(' Arrondissement', '') : place.name;
}

// MARK: - Texte

/** Espaces superflus retirés. */
export function collapsed(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(' ');
}

/** Minuscules, sans accents, tirets et apostrophes comme des espaces : « Saint-Genis » == « saint genis ». */
export function normalized(text: string): string {
  const folded = text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');
  return collapsed(folded.replace(/[-'’]/g, ' '));
}

/** Le nom commence-t-il par la saisie (en ignorant l'article : « Le Pecq » pour « pe ») ? */
export function nameStartsWith(name: string, query: string): boolean {
  const n = normalized(name);
  const q = normalized(query);
  if (!q) return true;
  if (n.startsWith(q)) return true;
  for (const article of ['le ', 'la ', 'les ', 'l ']) {
    if (n.startsWith(article)) return n.slice(article.length).startsWith(q);
  }
  return false;
}

/** Minuscules sans accents ni espaces au bord (comme `searchNormalized` de l'app). */
export function searchNormalized(text: string): string {
  return text.trim().normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');
}

// MARK: - Analyse de la saisie (champ de recherche de biens : communes, arrondissements, quartiers)

export type PlaceQuery =
  | { kind: 'none' }
  | { kind: 'postalCode'; value: string }
  | { kind: 'postalCodePrefix'; value: string }
  | { kind: 'initial'; value: string }
  | { kind: 'text'; value: string };

export function placeQuery(raw: string): PlaceQuery {
  const text = collapsed(raw);
  if (!text) return { kind: 'none' };
  if (/^\d+$/.test(text)) {
    if (text.length === 5) return { kind: 'postalCode', value: text };
    if (text.length >= 2 && text.length <= 4) return { kind: 'postalCodePrefix', value: text };
    return text.length >= 3 ? { kind: 'text', value: text } : { kind: 'none' };
  }
  return [...text].length < 3 ? { kind: 'initial', value: text } : { kind: 'text', value: text };
}

/** Départements d'un début de code postal (« 01 » → 01, « 20 » → 2A et 2B, « 974 » → 974). */
export function departmentCodes(prefix: string): string[] {
  if (prefix.length < 2) return [];
  const two = prefix.slice(0, 2);
  if (two === '20') return ['2A', '2B'];
  if (two === '97') return prefix.length >= 3 ? [`97${prefix[2]}`] : [];
  return [two];
}

const AREA_KINDS: PlaceKind[] = ['municipality', 'district', 'locality'];

/** Lieux du champ de recherche, sans doublon, dans l'ordre reçu ; `limit` premiers. */
export function refined(suggestions: PlaceSuggestion[], limit: number, kinds: PlaceKind[] = AREA_KINDS): PlaceSuggestion[] {
  const seen = new Set<string>();
  const result: PlaceSuggestion[] = [];
  for (const suggestion of suggestions) {
    if (!kinds.includes(suggestion.kind)) continue;
    const key = `${suggestion.kind}|${normalized(suggestion.name)}|${suggestion.inseeCode ?? suggestion.postalCode ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(suggestion);
    if (result.length === limit) break;
  }
  return result;
}

// MARK: - Lecture des réponses

type GeoFeature = {
  geometry?: { coordinates?: number[] } | null;
  properties: {
    id?: string; label: string; name: string; type: string;
    postcode?: string; citycode?: string; city?: string; context?: string;
  };
};

/** Réponse GeoJSON de la Géoplateforme (`/geocodage/search`). */
export function parseGeoplateforme(json: unknown): PlaceSuggestion[] {
  const features = (json as { features?: GeoFeature[] } | null)?.features ?? [];
  const result: PlaceSuggestion[] = [];
  for (const feature of features) {
    const p = feature?.properties;
    if (!p || typeof p.name !== 'string' || typeof p.type !== 'string') continue;
    let kind: PlaceKind;
    switch (p.type) {
      case 'municipality': kind = p.name.endsWith('Arrondissement') ? 'district' : 'municipality'; break;
      case 'street': kind = 'street'; break;
      case 'housenumber': kind = 'address'; break;
      case 'locality': kind = 'locality'; break;
      default: continue;
    }
    const coordinates = feature.geometry?.coordinates ?? [];
    const parts = p.context?.split(',').map((part) => part.trim()) ?? [];
    result.push({
      id: p.id ?? `${p.type}-${p.label}`,
      kind,
      name: p.name,
      postalCode: p.postcode,
      city: kind === 'district' ? p.name.split(' ')[0] : p.city,
      inseeCode: p.citycode,
      department: parts.length >= 2 ? parts[1] : undefined,
      coordinate: coordinates.length === 2 ? { latitude: coordinates[1], longitude: coordinates[0] } : undefined,
    });
  }
  return result;
}

type Commune = {
  nom: string; code: string; codesPostaux?: string[]; population?: number;
  centre?: { coordinates?: number[] }; departement?: { nom: string };
};

/** Réponse de geo.api.gouv.fr (`/communes`), les plus peuplées d'abord. */
export function parseCommunes(json: unknown, postalPrefix?: string): PlaceSuggestion[] {
  const communes = Array.isArray(json) ? (json as Commune[]) : [];
  return [...communes]
    .filter((c) => c && typeof c.nom === 'string' && typeof c.code === 'string')
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .flatMap((commune): PlaceSuggestion[] => {
      const codes = commune.codesPostaux ?? [];
      if (postalPrefix && !codes.some((code) => code.startsWith(postalPrefix))) return [];
      const postalCode = (postalPrefix ? codes.find((code) => code.startsWith(postalPrefix)) : undefined) ?? codes[0];
      const coordinates = commune.centre?.coordinates ?? [];
      return [{
        id: commune.code,
        kind: 'municipality',
        name: commune.nom,
        postalCode,
        city: commune.nom,
        inseeCode: commune.code,
        department: commune.departement?.nom,
        coordinate: coordinates.length === 2 ? { latitude: coordinates[1], longitude: coordinates[0] } : undefined,
      }];
    });
}

// MARK: - Fournisseur

const GEOCODING = 'https://data.geopf.fr/geocodage/search';
const COMMUNES_API = 'https://geo.api.gouv.fr';
const COMMUNE_FIELDS = 'nom,code,codesPostaux,departement,centre,population';

export class PlaceSearchError extends Error {
  constructor(readonly reason: 'offline' | 'rateLimited' | 'unavailable') {
    super(reason);
  }
  get userMessage(): string {
    switch (this.reason) {
      case 'offline': return 'Pas de connexion : les suggestions reviendront avec le réseau. Vous pouvez continuer à saisir.';
      case 'rateLimited': return 'Trop de recherches d’un coup. Patientez une seconde, puis continuez à saisir.';
      default: return 'Les suggestions ne sont pas disponibles pour le moment. Vous pouvez continuer à saisir.';
    }
  }
}

async function get(url: string, params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const query = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
  let response: Response;
  try {
    response = await fetch(`${url}?${query}`, {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PlaceSearchError('offline');
  }
  if (response.status === 429) throw new PlaceSearchError('rateLimited');
  if (!response.ok) throw new PlaceSearchError('unavailable');
  return response.json();
}

/** Suggestions pour le champ de recherche de biens (communes, arrondissements, quartiers). */
export async function placeSuggestions(raw: string, limit = 6, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const query = placeQuery(raw);
  let found: PlaceSuggestion[] = [];
  switch (query.kind) {
    case 'none':
      return [];
    case 'postalCode':
      found = parseCommunes(await get(`${COMMUNES_API}/communes`, { codePostal: query.value, fields: COMMUNE_FIELDS }, signal), query.value);
      break;
    case 'postalCodePrefix':
      for (const department of departmentCodes(query.value)) {
        const data = await get(`${COMMUNES_API}/departements/${department}/communes`, { fields: COMMUNE_FIELDS }, signal);
        found = found.concat(parseCommunes(data, query.value));
      }
      break;
    case 'initial':
      found = parseCommunes(await get(`${COMMUNES_API}/communes`,
        { nom: query.value, boost: 'population', limit: '40', fields: COMMUNE_FIELDS }, signal))
        .filter((place) => nameStartsWith(place.name, query.value));
      break;
    case 'text': {
      const base = { q: query.value, autocomplete: '1', limit: String(limit + 4) };
      const [communes, districts, localities] = await Promise.all([
        get(`${COMMUNES_API}/communes`, { nom: query.value, boost: 'population', limit: String(limit + 3), fields: COMMUNE_FIELDS }, signal),
        get(GEOCODING, { ...base, type: 'municipality' }, signal),
        get(GEOCODING, { ...base, type: 'locality', limit: '3' }, signal),
      ]);
      const all = [...parseCommunes(communes), ...parseGeoplateforme(districts), ...parseGeoplateforme(localities)];
      const starting = all.filter((place) => nameStartsWith(place.name, query.value));
      found = [...starting, ...all.filter((place) => !nameStartsWith(place.name, query.value))];
      break;
    }
  }
  return refined(found, limit);
}

// MARK: - Surlignage

/** Morceaux du texte correspondant à la saisie, mot par mot, sans tenir compte des accents ni de la casse. */
export function highlightRanges(text: string, query: string): [number, number][] {
  // Texte replié caractère par caractère, avec la position d'origine de chaque caractère replié.
  const folded: string[] = [];
  const origin: number[] = [];
  let index = 0;
  for (const char of text) {
    const simple = char.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');
    for (const f of simple) {
      folded.push(f);
      origin.push(index);
    }
    index += char.length;
  }
  const haystack = folded.join('');
  const words = normalized(query).split(' ').filter(Boolean);
  const ranges: [number, number][] = [];
  const isLetter = (c: string | undefined) => !!c && /\p{L}/u.test(c);
  for (const word of words) {
    let from = 0;
    let best: number | null = null;
    while (from < haystack.length) {
      const found = haystack.indexOf(word, from);
      if (found < 0) break;
      if (best === null) best = found;
      // Début de mot de préférence (« mes » surligne « Mésanges », pas « des »).
      if (found === 0 || !isLetter(haystack[found - 1])) { best = found; break; }
      from = found + 1;
    }
    if (best === null) continue;
    const start = origin[best];
    const lastFolded = best + word.length - 1;
    const lastOrigin = origin[lastFolded];
    const end = lastOrigin + ([...text.slice(lastOrigin)][0]?.length ?? 1);
    if (!ranges.some(([s, e]) => start < e && s < end)) ranges.push([start, end]);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}
