import { isNetworkError } from './account/auth';

// Échec du chargement d'un écran, comme LoadFailure de l'app (ImmoKit) : une coupure de connexion montre « Pas de
// connexion Internet » et « Réessayer » (OfflineState), une autre erreur garde le texte de l'écran (LoadErrorState).

/**
 * Demande qui n'a pas pu partir (hors ligne, serveur injoignable) : LoadFailure.isOffline. PostgREST rend la coupure
 * sous forme d'objet simple (« TypeError: Failed to fetch »), pas d'erreur : son message est lu aussi (même règle que
 * l'enregistrement d'une annonce, lib/publish/save.ts).
 */
export function isOfflineFailure(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(message);
}

/** Texte de l'échec de la recherche (SearchViewModel.load de l'app). */
export const SEARCH_LOAD_ERROR = 'Impossible de charger les annonces. Réessayez dans un instant.';
