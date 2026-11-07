// Biens consultés récemment (« Consultés récemment » de l'accueil), comme l'app (Data/AccountStore.swift 168–180,
// recordView) : la fiche ouverte passe en tête, sans doublon, 50 au plus. L'app les garde en mémoire ; le site les
// garde dans sessionStorage, jusqu'à la fermeture de l'onglet, et rien ne part au serveur.

const KEY = 'nidalo.consultes';
const LIMIT = 50;

/** Identifiants des fiches ouvertes, la plus récente d'abord ; liste vide si le stockage est indisponible. */
export function recentlyViewedIds(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === 'string'))].slice(0, LIMIT);
  } catch {
    return [];
  }
}

/** Note l'ouverture d'une fiche (recordView(of:)). */
export function recordView(id: string): void {
  store([id, ...recentlyViewedIds().filter((other) => other !== id)].slice(0, LIMIT));
}

/** « Retirer de l'historique » (removeFromHistory). */
export function removeFromHistory(id: string): void {
  store(recentlyViewedIds().filter((other) => other !== id));
}

/** « Vider l'historique » (clearHistory). */
export function clearHistory(): void {
  store([]);
}

function store(ids: string[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Stockage indisponible (navigation privée, quota) : la liste reste celle d'avant.
  }
}
