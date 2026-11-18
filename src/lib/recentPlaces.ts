import { createStore, sessionStore, useSession, useStore } from './account/session';
import { isNearby } from './nearby';
import { placeShortName, type PlaceKind, type PlaceSuggestion } from './places';

// Lieux récents des champs de lieu des recherches, comme l'app (ImmoDomain/Search/NearbySearch.swift, RecentPlaces, et
// Data/RecentPlaceStore.swift) : les 5 derniers lieux choisis, du plus récent au plus ancien. L'app les garde sur
// l'iPhone, un fichier par compte et un à part sans compte ; le site les garde dans ce navigateur (localStorage), une
// liste par compte et une à part sans compte, jamais mélangées. Rien ne part au serveur.

export const RECENT_CAPACITY = 5;
const PREFIX = 'nidalo.lieux-recents.';
const KINDS: PlaceKind[] = ['municipality', 'district', 'locality', 'street', 'address'];

/** Le lieu passe en tête (une seule fois). « Autour de moi » n'est jamais gardé : il a sa propre ligne. */
export function recordPlace(items: readonly PlaceSuggestion[], place: PlaceSuggestion): PlaceSuggestion[] {
  if (isNearby(place)) return [...items];
  const sameName = (other: PlaceSuggestion) =>
    other.kind === place.kind && placeShortName(other) === placeShortName(place) && other.postalCode === place.postalCode;
  const kept = items.filter((other) => other.id !== place.id && !sameName(other));
  return [place, ...kept].slice(0, RECENT_CAPACITY);
}

/** Clé de la liste d'un compte (identifiant en minuscules, comme l'app), ou de la liste sans compte. */
export function recentPlacesKey(owner: string | null): string {
  return `${PREFIX}${owner ? owner.toLowerCase() : 'sans-compte'}`;
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

function parsePlace(value: unknown): PlaceSuggestion | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id);
  const name = text(raw.name);
  const kind = text(raw.kind) as PlaceKind | undefined;
  if (!id || !name || !kind || !KINDS.includes(kind)) return null;
  const place: PlaceSuggestion = { id, kind, name };
  for (const field of ['postalCode', 'city', 'inseeCode', 'department'] as const) {
    const fieldText = text(raw[field]);
    if (fieldText !== undefined) place[field] = fieldText;
  }
  const coordinate = raw.coordinate as Record<string, unknown> | undefined;
  if (coordinate && typeof coordinate.latitude === 'number' && typeof coordinate.longitude === 'number'
    && Number.isFinite(coordinate.latitude) && Number.isFinite(coordinate.longitude)) {
    place.coordinate = { latitude: coordinate.latitude, longitude: coordinate.longitude };
  }
  return place;
}

/** Lieux récents d'un compte (ou sans compte) ; liste vide si le stockage est indisponible ou illisible. */
export function readRecentPlaces(owner: string | null): PlaceSuggestion[] {
  try {
    const raw = window.localStorage.getItem(recentPlacesKey(owner));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: unknown } | null;
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return items.map(parsePlace).filter((place): place is PlaceSuggestion => place !== null).slice(0, RECENT_CAPACITY);
  } catch {
    return [];
  }
}

const version = createStore(0);
const changed = () => version.set(version.get() + 1);

function write(owner: string | null, items: PlaceSuggestion[]): void {
  try {
    // Même forme que le fichier de l'app (RecentPlaces) : { "items": [ … ] }.
    window.localStorage.setItem(recentPlacesKey(owner), JSON.stringify({ items }));
  } catch {
    // Stockage indisponible (navigation privée, quota) : rien n'est gardé.
  }
  changed();
}

export function recordRecentPlace(place: PlaceSuggestion, owner: string | null): void {
  if (isNearby(place)) return;
  write(owner, recordPlace(readRecentPlaces(owner), place));
}

/** « Effacer ». */
export function clearRecentPlaces(owner: string | null): void {
  write(owner, []);
}

/** Compte supprimé : ses lieux récents partent avec lui. */
export function removeRecentPlaces(owner: string): void {
  try {
    window.localStorage.removeItem(recentPlacesKey(owner));
  } catch {
    // Stockage indisponible : il n'y avait rien.
  }
  changed();
}

let listening = false;

/** Lieux récents du compte connecté (ou sans compte) ; `owner` est `undefined` tant que la session n'est pas connue. */
export function useRecentPlaces(): { owner: string | null | undefined; items: PlaceSuggestion[] } {
  const session = useSession();
  useStore(version);
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    // Un autre onglet a changé la liste : elle suit.
    window.addEventListener('storage', (event) => { if (!event.key || event.key.startsWith(PREFIX)) changed(); });
  }
  const owner = session.status === 'loading' ? undefined : session.status === 'signedIn' ? session.userId : null;
  return { owner, items: owner === undefined ? [] : readRecentPlaces(owner) };
}

/** Compte de la page en ce moment (`undefined` tant que la session n'est pas connue). */
export function currentOwner(): string | null | undefined {
  const session = sessionStore.get();
  return session.status === 'loading' ? undefined : session.status === 'signedIn' ? session.userId : null;
}
