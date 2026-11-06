import { PATHS } from '../paths';
import { isNewAccount } from './auth';
import { createStore, currentUserId, sessionReady } from './session';

// « Il faut un compte » (router.requireAccount dans l'app) : connecté, l'action part tout de suite ; sinon la
// fenêtre de connexion s'ouvre et l'action attend. Une seule action attend : une plus récente la remplace.

export const signInSheetStore = createStore(false);

let pending: (() => void) | null = null;

export async function requireAccount(action: () => void) {
  if (!currentUserId()) await sessionReady();
  if (currentUserId()) {
    action();
    return;
  }
  pending = action;
  signInSheetStore.set(true);
}

/** Fermer la fenêtre abandonne l'action. */
export function cancelAccountRequirement() {
  pending = null;
  signInSheetStore.set(false);
}

/**
 * Connexion réussie dans la fenêtre : elle se ferme. Un compte tout neuf choisit d'abord son profil dans Mon compte ;
 * sinon l'action reprend un instant après (450 ms, comme l'app).
 */
export function accountDidConnect() {
  signInSheetStore.set(false);
  const action = pending;
  pending = null;
  if (isNewAccount()) {
    window.location.assign(PATHS.account);
    return;
  }
  if (action) window.setTimeout(action, 450);
}
