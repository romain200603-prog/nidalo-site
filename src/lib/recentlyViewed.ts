import { currentUserId, sessionReady, sessionStore, storedSession } from './account/session';

// Biens consultés (« Consultés récemment » de l'accueil, « Biens consultés » de Mon compte), comme l'app
// (Data/AccountStore.swift, recordView, n° 114) : la fiche ouverte passe en tête, sans doublon, 50 au plus. Une liste
// par compte connecté, gardée dans ce navigateur (localStorage « nidalo.consultes.<compte> », comme le fichier
// biens-consultes/<compte>.json de l'iPhone) et relue à chaque page ; rien ne part au serveur. Sans compte, rien n'est
// gardé. Quand le compte s'en va, sa liste n'est plus lue (n° 1 B) ; elle est effacée avec le compte.

const PREFIX = 'nidalo.consultes.';
/** Liste de l'onglet d'avant les listes par compte (sessionStorage) : effacée, plus jamais lue. */
const TAB_KEY = 'nidalo.consultes';
const LIMIT = 50;

/** Clé de la liste d'un compte (identifiant en minuscules, comme l'app). */
export function viewedListingsKey(owner: string): string {
  return `${PREFIX}${owner.toLowerCase()}`;
}

let tabListForgotten = false;

function forgetTabList(): void {
  if (tabListForgotten) return;
  tabListForgotten = true;
  try {
    sessionStorage.removeItem(TAB_KEY);
  } catch {
    // Stockage indisponible : il n'y avait rien.
  }
}

/** Compte dont la liste est lue : le compte connecté ; pendant le chargement de la session, celui que ce navigateur garde. */
function reader(): string | null {
  const state = sessionStore.get();
  if (state.status === 'signedIn') return state.userId;
  if (state.status === 'signedOut') return null;
  return storedSession()?.user.id ?? null;
}

function read(owner: string): string[] {
  try {
    const raw = localStorage.getItem(viewedListingsKey(owner));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === 'string'))].slice(0, LIMIT);
  } catch {
    return [];
  }
}

function write(owner: string, ids: string[]): void {
  try {
    localStorage.setItem(viewedListingsKey(owner), JSON.stringify(ids));
  } catch {
    // Stockage indisponible (navigation privée, quota) : la liste reste celle d'avant.
  }
}

/** Identifiants des fiches ouvertes par le compte, la plus récente d'abord ; liste vide sans compte. */
export function recentlyViewedIds(): string[] {
  forgetTabList();
  const owner = reader();
  return owner ? read(owner) : [];
}

/**
 * Note l'ouverture d'une fiche (recordView(of:)), une fois la session connue : seulement pour un compte connecté, dans
 * sa propre liste.
 */
export async function recordView(id: string): Promise<void> {
  forgetTabList();
  const state = await sessionReady();
  if (state.status !== 'signedIn') return;
  const owner = currentUserId();
  if (!owner) return;
  write(owner, [id, ...read(owner).filter((other) => other !== id)].slice(0, LIMIT));
}

/** « Retirer de l'historique » (removeFromHistory). */
export function removeFromHistory(id: string): void {
  const owner = currentUserId();
  if (owner) write(owner, read(owner).filter((other) => other !== id));
}

/** « Vider l'historique » (clearHistory). */
export function clearHistory(): void {
  const owner = currentUserId();
  if (owner) write(owner, []);
}

/** Question de « Vider l'historique » : « Les 3 biens consultés… », « Le bien consulté… » (ViewedListingsView, n° 130). */
export function clearHistoryMessage(count: number): string {
  return count > 1 ? `Les ${count} biens consultés seront retirés de cette liste.` : 'Le bien consulté sera retiré de cette liste.';
}

/** Compte supprimé : sa liste part avec lui (AccountStore.removeViewedListings). */
export function removeViewedListings(owner: string): void {
  try {
    localStorage.removeItem(viewedListingsKey(owner));
  } catch {
    // Stockage indisponible : il n'y avait rien.
  }
}
