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
  terms: '/conditions/',
} as const;

/** Écrans de Mon compte : `/compte/?vue=informations`. */
export type AccountView =
  | 'informations' | 'annonces' | 'recherches' | 'confidentialite' | 'legal' | 'securite' | 'supprimer' | 'bientot'
  | 'notifications' | 'demande-visite';

export function accountPath(view: AccountView | null = null, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(view ? { vue: view, ...extra } : extra);
  const query = params.toString();
  return query ? `${PATHS.account}?${query}` : PATHS.account;
}

/**
 * Page d'une annonce. Comme dans l'app, la catégorie affichée dépend du mode de recherche : un appartement à vendre
 * ouvert depuis Investir est un « INVESTISSEMENT LOCATIF », depuis Résidentiel une « VENTE ». Seul Investir change
 * la catégorie, donc seul ce mode est gardé dans l'adresse.
 */
export function listingPath(id: string, mode: SearchMode | null = null): string {
  return `/annonce/?id=${encodeURIComponent(id)}${mode === 'invest' ? '&mode=invest' : ''}`;
}

/**
 * Recherche dans une catégorie, sans critère : la même adresse que `paramsFromDraft(defaultDraft(mode))` (lib/search),
 * écrite ici pour que la barre du haut ne charge pas tout le moteur de recherche (vérifié par paths.test.ts).
 */
export function searchModePath(mode: SearchMode): string {
  return `${PATHS.search}?mode=${mode}`;
}

/** Conversation ouverte dans Messages (`/messages/?c=…`). */
export function conversationPath(conversationId: string): string {
  return `${PATHS.messages}?c=${encodeURIComponent(conversationId)}`;
}

/** Écran « Demande de visite » d'une demande (ProfileRoute.visitRequest dans l'app). */
export function visitRequestPath(requestId: string): string {
  return accountPath('demande-visite', { id: requestId });
}

/** Mode lu dans l'adresse d'une annonce (`null` : la catégorie suit l'annonce seule). */
export function listingModeFromParams(params: URLSearchParams): SearchMode | null {
  return params.get('mode') === 'invest' ? 'invest' : null;
}
