import type { SearchMode } from './labels';

// Adresses du site. Le site est servi à la racine de nidalo.fr : les liens sont absolus.
export const PATHS = {
  home: '/',
  search: '/recherche/',
  favorites: '/favoris/',
  publish: '/publier/',
  messages: '/messages/',
  account: '/compte/',
  help: '/aide/',
  privacy: '/confidentialite/',
  legal: '/mentions-legales/',
} as const;

/**
 * Page d'une annonce. Comme dans l'app, la catégorie affichée dépend du mode de recherche : un appartement à vendre
 * ouvert depuis Investir est un « INVESTISSEMENT LOCATIF », depuis Résidentiel une « VENTE ». Seul Investir change
 * la catégorie, donc seul ce mode est gardé dans l'adresse.
 */
export function listingPath(id: string, mode: SearchMode | null = null): string {
  return `/annonce/?id=${encodeURIComponent(id)}${mode === 'invest' ? '&mode=invest' : ''}`;
}

/** Mode lu dans l'adresse d'une annonce (`null` : la catégorie suit l'annonce seule). */
export function listingModeFromParams(params: URLSearchParams): SearchMode | null {
  return params.get('mode') === 'invest' ? 'invest' : null;
}
