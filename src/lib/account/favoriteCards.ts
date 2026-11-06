import type { IconName } from '../../components/iconPaths';
import { cardContent, type CardContent, type CardKind } from '../cardContent';
import { formatArea } from '../format';
import { highlightsFor } from '../highlights';
import { propertyTypeLabel, type SearchMode } from '../labels';
import { readAsset } from '../listing/fields';
import type { ListingRow } from '../listings';
import { normalized } from '../places';

// « Vos favoris » (Features/Favorites/FavoritesView.swift et ImmoDomain/Listing/FavoriteCardText.swift) :
// catégories, recherche dans les favoris, suggestions, tri et textes des cartes.

export type FavoriteCategory = 'all' | 'residential' | 'rental' | 'investment' | 'hotel';

/** « Tous » puis les quatre catégories de l'app. */
export const FAVORITE_CATEGORIES: { category: FavoriteCategory; title: string; icon: IconName; mode: SearchMode | null }[] = [
  { category: 'all', title: 'Tous', icon: 'layoutGrid', mode: null },
  { category: 'residential', title: 'Résidentiel', icon: 'house', mode: 'buy' },
  { category: 'rental', title: 'Location', icon: 'key', mode: 'rent' },
  { category: 'investment', title: 'Investir', icon: 'bars', mode: 'invest' },
  { category: 'hotel', title: 'Hôtels', icon: 'bed', mode: 'hotel' },
];

export function categoryOfMode(mode: SearchMode): FavoriteCategory {
  return FAVORITE_CATEGORIES.find((entry) => entry.mode === mode)?.category ?? 'all';
}

export function modeOfCategory(category: FavoriteCategory): SearchMode | null {
  return FAVORITE_CATEGORIES.find((entry) => entry.category === category)?.mode ?? null;
}

/** Résidentiel : achat pour y vivre et terrains ; Investir : rentabilité connue, locaux, bureaux et immeubles. */
export function categoryIncludes(category: FavoriteCategory, kind: CardKind): boolean {
  switch (category) {
    case 'all': return true;
    case 'residential': return kind === 'purchase' || kind === 'land';
    case 'rental': return kind === 'rental';
    case 'investment': return kind === 'investment' || kind === 'commercial' || kind === 'office' || kind === 'building';
    case 'hotel': return kind === 'hotel';
  }
}

export type FavoriteCard = {
  row: ListingRow;
  content: CardContent;
  /** Rendement brut affiché sur la photo (Investissement et Hôtel, loyer connu) ; null sinon. */
  grossYield: number | null;
};

const YIELD_KINDS: CardKind[] = ['investment', 'commercial', 'office', 'building', 'hotel'];

/** Fiche d'un favori : une vente dont le loyer est connu est présentée en investissement. */
export function favoriteCard(row: ListingRow): FavoriteCard {
  const highlights = highlightsFor(row, null);
  const content = cardContent(row, row.transaction === 'sale' && highlights ? 'invest' : null, highlights);
  const gross = highlights?.grossYield ?? null;
  return { row, content, grossYield: YIELD_KINDS.includes(content.kind) && gross !== null && gross > 0 ? gross : null };
}

/** « Rez-de-chaussée », « 1er étage », « 3e étage ». */
export function floorLabel(floor: number): string {
  if (floor < 1) return 'Rez-de-chaussée';
  if (floor === 1) return '1er étage';
  return `${floor}e étage`;
}

const isDwelling = (type: string) => type === 'apartment' || type === 'house';

/**
 * Logement : ville · surface · pièces · étage ; terrain : ville · surface du terrain · surface constructible
 * (seulement si un document la justifie) ; autres biens : ville · surface. Seulement ce que l'annonce contient.
 */
export function favoriteDetails(row: ListingRow, kind: CardKind): string {
  const parts = [row.city];
  const living = Number(row.living_area);
  if (kind === 'land') {
    const land = row.land_area !== null && row.land_area !== undefined ? Number(row.land_area) : living > 0 ? living : null;
    if (land !== null && Number.isFinite(land)) parts.push(formatArea(land));
    const asset = readAsset(row);
    if (asset?.kind === 'land' && asset.land.buildability) parts.push(`Constructible ${formatArea(asset.land.buildability.floorArea)}`);
    return parts.join(' · ');
  }
  if (living > 0) parts.push(formatArea(living));
  if (isDwelling(row.property_type)) {
    if (row.rooms !== null && row.rooms > 0) parts.push(row.rooms > 1 ? `${row.rooms} pièces` : '1 pièce');
    if (row.floor !== null && row.floor !== undefined) parts.push(floorLabel(row.floor));
  }
  return parts.join(' · ');
}

/** Minuscules, sans accents : « Hôtel » correspond à « hotel ». */
function folded(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');
}

/** Chaque mot saisi doit se trouver dans le titre, la ville, le code postal ou le type de bien. */
export function matchesText(row: ListingRow, query: string): boolean {
  const terms = folded(query).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const haystack = folded(`${row.title} ${row.city} ${row.postal_code} ${propertyTypeLabel(row.property_type)}`);
  return terms.every((term) => haystack.includes(term));
}

export type LocalSuggestion = { kind: 'propertyType' | 'city'; value: string; detail: string };

/**
 * Suggestions de la recherche des favoris, dès 2 lettres (LocalSuggestions.favorites) : types de biens puis villes
 * présents dans les favoris, dont un mot commence par la saisie (ou le code postal) ; rien quand la saisie est déjà
 * exactement une suggestion.
 */
export function favoriteSuggestions(text: string, rows: ListingRow[], limit = 5): LocalSuggestion[] {
  const typed = normalized(text);
  if (typed.length < 2) return [];
  const startsWord = (value: string) => {
    const words = normalized(value);
    return words.startsWith(typed) || words.split(' ').some((word) => word.startsWith(typed));
  };
  const result: LocalSuggestion[] = [];
  for (const type of [...new Set(rows.map((row) => propertyTypeLabel(row.property_type)))].sort()) {
    if (startsWord(type)) result.push({ kind: 'propertyType', value: type, detail: 'Type de bien' });
  }
  const seen = new Set<string>();
  for (const row of rows) {
    if (!(startsWord(row.city) || row.postal_code.startsWith(typed))) continue;
    const key = normalized(row.city);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ kind: 'city', value: row.city, detail: `${row.postal_code} · Ville` });
  }
  if (result.some((suggestion) => normalized(suggestion.value) === typed)) return [];
  return result.slice(0, limit);
}

export type FavoriteSort = 'relevance' | 'priceAscending' | 'priceDescending' | 'recentlyAdded';

export const FAVORITE_SORTS: { sort: FavoriteSort; title: string; short: string }[] = [
  { sort: 'relevance', title: 'Pertinence', short: 'Pertinence' },
  { sort: 'priceAscending', title: 'Prix croissant', short: 'Prix ↑' },
  { sort: 'priceDescending', title: 'Prix décroissant', short: 'Prix ↓' },
  { sort: 'recentlyAdded', title: 'Ajout le plus récent', short: 'Récents' },
];

/** Ordre « Pertinence » : publiées le plus récemment d'abord, puis les moins chères. */
export function relevanceOrder<T extends { row: Pick<ListingRow, 'published_at' | 'price'> }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const lhs = a.row.published_at ? Date.parse(a.row.published_at) : -Infinity;
    const rhs = b.row.published_at ? Date.parse(b.row.published_at) : -Infinity;
    if (lhs !== rhs) return rhs - lhs;
    return Number(a.row.price) - Number(b.row.price);
  });
}

/** Tri choisi ; « Pertinence » garde l'ordre de chargement. `addedAt` : date d'ajout de chaque favori. */
export function sortFavorites<T extends { row: Pick<ListingRow, 'id' | 'price'> }>(items: T[], sort: FavoriteSort, addedAt: Map<string, string>): T[] {
  switch (sort) {
    case 'relevance': return items;
    case 'priceAscending': return [...items].sort((a, b) => Number(a.row.price) - Number(b.row.price));
    case 'priceDescending': return [...items].sort((a, b) => Number(b.row.price) - Number(a.row.price));
    case 'recentlyAdded': {
      const time = (id: string) => {
        const added = addedAt.get(id);
        return added ? Date.parse(added) : -Infinity;
      };
      return [...items].sort((a, b) => time(b.row.id) - time(a.row.id));
    }
  }
}

/** « 3 biens sauvegardés », ou « 2 sur 3 biens » quand une recherche, une catégorie ou un filtre en écarte. */
export function savedCountText(shown: number, total: number): string {
  if (shown === total) return `${total} bien${total > 1 ? 's' : ''} sauvegardé${total > 1 ? 's' : ''}`;
  return `${shown} sur ${total} biens`;
}
