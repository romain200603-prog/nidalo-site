import { createStore } from '../account/session';
import { searchNormalized } from '../places';

// Recherches récentes de la messagerie (RecentMessagingSearches de l'app, MessagingDirectory.swift) : la plus récente
// en tête, sans doublon, 12 au plus. L'app les garde sur l'iPhone ; le site, dans ce navigateur (localStorage
// « nidalo.recherches-messagerie.<compte> »), une liste par compte. Une lecture ou une écriture impossible (navigation
// privée) laisse simplement la liste vide.

export type RecentSearchKind =
  | { type: 'text'; text: string }
  | { type: 'contact'; id: string; name: string }
  | { type: 'conversation'; id: string; title: string }
  | { type: 'savedSearch'; id: string; name: string };

export type RecentSearch = { id: string; kind: RecentSearchKind; date: string };

export const RECENT_SEARCHES_LIMIT = 12;

const keyFor = (owner: string) => `nidalo.recherches-messagerie.${owner.toLowerCase()}`;

/** Liste affichée, relue à chaque changement de compte. */
export const recentSearchesStore = createStore<{ owner: string | null; items: RecentSearch[] }>({ owner: null, items: [] });

function isKind(value: unknown): value is RecentSearchKind {
  const kind = value as Partial<Record<string, unknown>> | null;
  if (!kind || typeof kind !== 'object') return false;
  switch (kind.type) {
    case 'text': return typeof kind.text === 'string';
    case 'contact': return typeof kind.id === 'string' && typeof kind.name === 'string';
    case 'conversation': return typeof kind.id === 'string' && typeof kind.title === 'string';
    case 'savedSearch': return typeof kind.id === 'string' && typeof kind.name === 'string';
    default: return false;
  }
}

function read(owner: string): RecentSearch[] {
  try {
    const raw = window.localStorage.getItem(keyFor(owner));
    const items = raw ? (JSON.parse(raw) as { items?: unknown }).items : [];
    if (!Array.isArray(items)) return [];
    return items.filter((item): item is RecentSearch => !!item && typeof item.id === 'string' && typeof item.date === 'string' && isKind(item.kind))
      .slice(0, RECENT_SEARCHES_LIMIT);
  } catch {
    return [];
  }
}

function write(owner: string, items: RecentSearch[]) {
  recentSearchesStore.set({ owner, items });
  try {
    window.localStorage.setItem(keyFor(owner), JSON.stringify({ items }));
  } catch {
    // Stockage indisponible : la liste reste celle de la page.
  }
}

/** Liste du compte (lue une fois par compte). */
export function loadRecentSearches(owner: string): RecentSearch[] {
  const current = recentSearchesStore.get();
  if (current.owner === owner) return current.items;
  const items = read(owner);
  recentSearchesStore.set({ owner, items });
  return items;
}

/** Titre d'une recherche récente (RecentMessagingSearch.title). */
export function recentTitle(item: RecentSearch): string {
  switch (item.kind.type) {
    case 'text': return item.kind.text;
    case 'contact': return item.kind.name;
    case 'conversation': return item.kind.title;
    case 'savedSearch': return item.kind.name;
  }
}

function isSame(a: RecentSearchKind, b: RecentSearchKind): boolean {
  if (a.type === 'text' && b.type === 'text') return searchNormalized(a.text) === searchNormalized(b.text);
  if (a.type === 'text' || b.type === 'text' || a.type !== b.type) return false;
  return a.id.toLowerCase() === b.id.toLowerCase();
}

/** Ajoute une recherche ; un texte déjà présent (sans accents ni majuscules) ou le même contact remonte en tête. */
export function recordRecentSearch(owner: string, kind: RecentSearchKind, now: Date = new Date()) {
  const trimmed: RecentSearchKind = kind.type === 'text' ? { type: 'text', text: kind.text.trim() } : kind;
  if (trimmed.type === 'text' && trimmed.text === '') return;
  const items = loadRecentSearches(owner).filter((item) => !isSame(item.kind, trimmed));
  write(owner, [{ id: crypto.randomUUID(), kind: trimmed, date: now.toISOString() }, ...items].slice(0, RECENT_SEARCHES_LIMIT));
}

export function removeRecentSearch(owner: string, id: string) {
  write(owner, loadRecentSearches(owner).filter((item) => item.id !== id));
}

export function clearRecentSearches(owner: string) {
  write(owner, []);
}
