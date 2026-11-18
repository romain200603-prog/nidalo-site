import type { Coordinate, PlaceSuggestion } from './places';

// « Autour de moi » dans les champs de lieu des recherches, comme l'app (ImmoDomain/Search/NearbySearch.swift) : la
// position devient le centre d'une recherche « autour d'une ville » (point, rayon, libellé), comme une commune choisie
// dans les suggestions.

/** Identifiant du lieu « Autour de moi » (pour le reconnaître). */
export const NEARBY_ID = 'autour-de-moi';
/** Texte du champ. */
export const NEARBY_LABEL = 'Autour de moi';
const SAVED_PREFIX = 'Autour de ';

const trimmedNonEmpty = (text: string | null | undefined) => {
  const value = text?.trim();
  return value ? value : undefined;
};

/** Lieu choisi : le point et sa commune (pour le libellé enregistré). */
export function nearbyPlace(center: Coordinate, commune: string | null | undefined): PlaceSuggestion {
  const place: PlaceSuggestion = { id: NEARBY_ID, kind: 'municipality', name: NEARBY_LABEL, coordinate: center };
  const city = trimmedNonEmpty(commune);
  if (city) place.city = city;
  return place;
}

export function isNearby(place: Pick<PlaceSuggestion, 'id'> | null | undefined): boolean {
  return place?.id === NEARBY_ID;
}

/** Libellé d'une recherche enregistrée : « Autour de Lyon », ou « Autour de moi » sans commune connue. */
export function savedLabel(commune: string | null | undefined): string {
  const city = trimmedNonEmpty(commune);
  return city ? SAVED_PREFIX + city : NEARBY_LABEL;
}

/** Libellé déjà formulé « Autour de … » : affiché tel quel, sans « et alentours ». */
export function isNearbyLabel(text: string | null | undefined): boolean {
  return typeof text === 'string' && text.startsWith(SAVED_PREFIX);
}

/**
 * Point gardé par le site pour « Autour de moi » : la position arrondie à 3 décimales (une centaine de mètres). Il voyage
 * dans l'adresse de la page, qu'on peut copier ou partager ; pour une recherche dans un rayon de 10 km, c'est assez.
 */
export function keptCenter(position: Coordinate): Coordinate {
  return { latitude: Number(position.latitude.toFixed(3)), longitude: Number(position.longitude.toFixed(3)) };
}
