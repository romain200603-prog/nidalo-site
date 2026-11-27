import { cardPrice } from './cardContent';
import type { SearchMode } from './labels';
import type { Result } from './search';

// Panneau du bas de la carte (MapResultsPanel.swift et ImmoDomain/Common/PanelSnapping.swift de l'app) : son tri, ses
// trois hauteurs, son titre et le calage en fin de geste. Rien ici ne lit ni n'écrit sur le serveur.

/** Tri des biens de la carte, fait sur les biens déjà lus (MapSort) ; la rentabilité seulement en mode Investir. */
export type MapSort = 'relevance' | 'priceAscending' | 'priceDescending' | 'area' | 'grossYield';

export const MAP_SORT_LABELS: Record<MapSort, string> = {
  relevance: 'Pertinence',
  priceAscending: 'Prix croissant',
  priceDescending: 'Prix décroissant',
  area: 'Surface',
  grossYield: 'Rentabilité',
};

export function mapSortOptions(mode: SearchMode): MapSort[] {
  const all: MapSort[] = ['relevance', 'priceAscending', 'priceDescending', 'area', 'grossYield'];
  return mode === 'invest' ? all : all.filter((sort) => sort !== 'grossYield');
}

/** Location : le loyer charges comprises quand il est connu, comme les cartes et les marqueurs (MapPricePin, n° 173). */
const shownPrice = (result: Result) => cardPrice(result.row).value;

export function sortedForMap(results: Result[], sort: MapSort): Result[] {
  switch (sort) {
    case 'relevance': return results;
    case 'priceAscending': return [...results].sort((a, b) => shownPrice(a) - shownPrice(b));
    case 'priceDescending': return [...results].sort((a, b) => shownPrice(b) - shownPrice(a));
    case 'area': return [...results].sort((a, b) => Number(b.row.living_area ?? 0) - Number(a.row.living_area ?? 0));
    case 'grossYield': return [...results].sort((a, b) => (b.highlights?.grossYield ?? -1) - (a.highlights?.grossYield ?? -1));
  }
}

/** Hauteurs du panneau : compacte (en-tête), moyenne (carrousel), grande (liste). */
export type MapPanelHeight = 'compact' | 'medium' | 'large';
export const MAP_PANEL_HEIGHTS: MapPanelHeight[] = ['compact', 'medium', 'large'];

/** Hauteur visible, sans la zone du bas de l'écran ; `available` : la hauteur de l'écran sans ses zones du haut et du bas. */
export function panelHeight(height: MapPanelHeight, available: number): number {
  const large = Math.max(318, available - 70);
  switch (height) {
    case 'compact': return 84;
    case 'medium': return Math.min(362, large);
    case 'large': return large;
  }
}

/**
 * Hauteur où le panneau se cale en fin de geste : la plus proche de la position projetée (position prolongée par
 * l'élan), sans jamais sauter plus d'un cran à la fois (PanelSnapping.target).
 */
export function snapTarget(heights: number[], start: number, projected: number): number {
  const nearestOf = (indices: number[]) => indices.reduce((best, index) => (Math.abs(heights[index] - projected) < Math.abs(heights[best] - projected) ? index : best), indices[0]);
  const all = heights.map((_, index) => index);
  if (!heights.length) return start;
  const startIndex = heights.indexOf(start);
  if (startIndex < 0) return heights[nearestOf(all)];
  const nearest = nearestOf(all);
  return heights[Math.min(Math.max(nearest, startIndex - 1), startIndex + 1)];
}

/** Hauteur pendant le geste : elle suit le doigt entre la plus petite et la plus grande, et résiste au-delà (au quart). */
export function rubberBanded(value: number, minimum: number, maximum: number, resistance = 0.25): number {
  if (value < minimum) return minimum - (minimum - value) * resistance;
  if (value > maximum) return maximum + (value - maximum) * resistance;
  return value;
}

/**
 * Sous le titre du panneau (et, sur ordinateur, sous le nombre de biens de la liste) : « Dans votre zone dessinée », sinon
 * le lieu de la recherche (« Lyon et alentours »), rien sans lieu.
 */
export function mapPanelSubtitle(place: string, drawnZone: boolean): string {
  return drawnZone ? 'Dans votre zone dessinée' : place;
}

/** Titre du panneau : pas de « 0 bien » pendant le premier chargement (n° 51) ; zone dessinée : « 6 biens ». */
export function mapPanelTitle(count: number, loading: boolean, drawnZone: boolean): string {
  if (count === 0 && loading) return 'Recherche des biens…';
  if (drawnZone) return count === 0 ? 'Aucun bien' : count === 1 ? '1 bien' : `${count} biens`;
  return count === 0 ? 'Aucun bien sur la carte' : count === 1 ? '1 bien sur la carte' : `${count} biens sur la carte`;
}
