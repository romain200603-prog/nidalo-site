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
  | 'notifications' | 'demande-visite' | 'agenda' | 'ajouter-visite' | 'projet' | 'consultes';

/** « Publier une annonce » ; avec une annonce, reprend son brouillon ou la modifie (`etape=photos` : ses photos). */
export function publishPath(listingId: string | null = null, step: 'photos' | null = null): string {
  if (!listingId) return PATHS.publish;
  return `${PATHS.publish}?annonce=${encodeURIComponent(listingId)}${step ? `&etape=${step}` : ''}`;
}

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
export function listingPath(id: string, mode: SearchMode | null = null, view: ListingScreen | null = null): string {
  return `/annonce/?id=${encodeURIComponent(id)}${mode === 'invest' ? '&mode=invest' : ''}${view ? `&vue=${view}` : ''}`;
}

/**
 * « Vidéo » des Détails d'une conversation : le formulaire de visite de la fiche, ouvert sur « En visio » (comme
 * l'app, VisitRequestFormView initialMode .video).
 */
export function videoVisitPath(id: string): string {
  return `${listingPath(id, null, 'visite')}&type=visio`;
}

/** Visite en visio demandée par l'adresse du formulaire (&type=visio). */
export function wantsVideoVisit(params: URLSearchParams): boolean {
  return params.get('type') === 'visio';
}

/** Écrans de la fiche sur ordinateur, chacun à son adresse : « Demander une visite » et « Faire une offre ». */
export type ListingScreen = 'visite' | 'offre';

/** Écran ouvert d'après l'adresse de la fiche (`null` : la fiche elle-même). */
export function listingScreenFromParams(params: URLSearchParams): ListingScreen | null {
  const view = params.get('vue');
  return view === 'visite' || view === 'offre' ? view : null;
}

/** Comparaison des biens (CompareView), avec la catégorie Investir si la fiche venait de là. */
export function comparePath(mode: SearchMode | null = null): string {
  return mode === 'invest' ? '/comparer/?mode=invest' : '/comparer/';
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
