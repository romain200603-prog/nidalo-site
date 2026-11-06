import { useSyncExternalStore } from 'react';

// Biens choisis pour la comparaison, comme l'app (Data/ComparisonStore.swift) : ordonnés, sans doublon, trois au
// maximum, et le bien de référence des écarts (le premier ajouté par défaut). L'app les garde en mémoire ; le site
// les garde dans sessionStorage, jusqu'à la fermeture de l'onglet, et rien ne part au serveur.

const KEY = 'nidalo.comparer';
export const COMPARE_MAX = 3;

export type CompareState = { ids: string[]; referenceId: string | null };

/** Résultat d'un ajout (ComparisonStore.AddResult) ; `null` après un retrait (toggle). */
export type CompareResult = 'added' | 'alreadyIn' | 'full';

const EMPTY: CompareState = { ids: [], referenceId: null };

/** Dernière lecture, gardée tant que le texte stocké ne change pas (React compare les objets). */
let cache: { raw: string | null; state: CompareState } = { raw: null, state: EMPTY };
const listeners = new Set<() => void>();

function parse(raw: string | null): CompareState {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return EMPTY;
    const list = (value as { ids?: unknown }).ids;
    const ids = Array.isArray(list) ? [...new Set(list.filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, COMPARE_MAX) : [];
    const reference = (value as { referenceId?: unknown }).referenceId;
    return { ids, referenceId: typeof reference === 'string' && ids.includes(reference) ? reference : (ids[0] ?? null) };
  } catch {
    return EMPTY;
  }
}

/** Comparaison en cours ; vide si le stockage est indisponible ou abîmé. */
export function compareState(): CompareState {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, state: parse(raw) };
  return cache.state;
}

function save(state: CompareState) {
  const raw = JSON.stringify(state);
  try {
    sessionStorage.setItem(KEY, raw);
    cache = { raw, state };
  } catch {
    // Stockage indisponible (navigation privée, quota) : la comparaison reste celle d'avant.
  }
  listeners.forEach((listener) => listener());
}

export function isCompared(id: string): boolean {
  return compareState().ids.includes(id);
}

/** Ajoute un bien ; refuse un doublon et un quatrième bien (add). */
export function addToCompare(id: string): CompareResult {
  const state = compareState();
  if (state.ids.includes(id)) return 'alreadyIn';
  if (state.ids.length >= COMPARE_MAX) return 'full';
  const ids = [...state.ids, id];
  save({ ids, referenceId: state.referenceId ?? id });
  return 'added';
}

/** Retire un bien ; la référence passe au premier qui reste (remove). */
export function removeFromCompare(id: string): void {
  const state = compareState();
  if (!state.ids.includes(id)) return;
  const ids = state.ids.filter((other) => other !== id);
  save({ ids, referenceId: state.referenceId === id ? (ids[0] ?? null) : state.referenceId });
}

/** Bouton « Comparer » d'une fiche : ajoute ou retire (toggle) ; `null` quand le bien a été retiré. */
export function toggleCompare(id: string): CompareResult | null {
  if (isCompared(id)) {
    removeFromCompare(id);
    return null;
  }
  return addToCompare(id);
}

/** « Prendre en référence » (setReference). */
export function setCompareReference(id: string): void {
  const state = compareState();
  if (!state.ids.includes(id)) return;
  save({ ids: state.ids, referenceId: id });
}

/** « Vider la comparaison » (removeAll). */
export function clearCompare(): void {
  save(EMPTY);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCompare(): CompareState {
  return useSyncExternalStore(subscribe, compareState, () => EMPTY);
}

/** Texte et bouton du toast après « Comparer » (CompareToast de CompareButton.swift) ; rien pour un doublon. */
export function compareToast(result: CompareResult | null, count: number): { text: string; action: string | null } | null {
  switch (result) {
    case 'added': return { text: count > 1 ? `Ajouté à la comparaison (${count} biens)` : 'Ajouté à la comparaison', action: 'Voir' };
    case 'full': return { text: `${COMPARE_MAX} biens maximum, retirez-en un`, action: 'Gérer' };
    case 'alreadyIn': return null;
    default: return { text: 'Retiré de la comparaison', action: null };
  }
}
