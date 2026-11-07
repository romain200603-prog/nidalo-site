import { useSyncExternalStore, type MouseEvent } from 'react';
import { PATHS } from '../../lib/paths';

// Adresse de la page Messages sur ordinateur : la conversation ouverte (?c=…), puis l'écran poussé par-dessus,
// comme la pile de navigation de l'app : « Détails » (&vue=details) et « Médias » (&vue=medias&onglet=…).
// Rien n'est ouvert sans ?c= : la page n'ouvre jamais une conversation d'elle-même.

export type MediaTab = 'photos' | 'documents' | 'liens';
export type MessagesRoute = { conversationId: string | null; view: 'thread' | 'details' | 'medias'; tab: MediaTab };

const TABS: readonly MediaTab[] = ['photos', 'documents', 'liens'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readRoute(search: string): MessagesRoute {
  const params = new URLSearchParams(search);
  const id = params.get('c');
  const conversationId = id && UUID.test(id) ? id : null;
  const vue = params.get('vue');
  const view = conversationId && (vue === 'details' || vue === 'medias') ? vue : 'thread';
  const onglet = params.get('onglet') as MediaTab | null;
  return { conversationId, view, tab: onglet && TABS.includes(onglet) ? onglet : 'photos' };
}

export function routePath(route: Partial<MessagesRoute>): string {
  const params = new URLSearchParams();
  if (route.conversationId) {
    params.set('c', route.conversationId);
    if (route.view && route.view !== 'thread') params.set('vue', route.view);
    if (route.view === 'medias' && route.tab && route.tab !== 'photos') params.set('onglet', route.tab);
  }
  const query = params.toString();
  return query ? `${PATHS.messages}?${query}` : PATHS.messages;
}

const listeners = new Set<() => void>();
let cached: { search: string; route: MessagesRoute } | null = null;

function current(): MessagesRoute {
  const search = window.location.search;
  if (!cached || cached.search !== search) cached = { search, route: readRoute(search) };
  return cached.route;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

/** Ouvre un écran de la page sans la recharger ; « Retour » du navigateur revient à l'écran précédent. */
export function navigate(route: Partial<MessagesRoute>, { replace = false }: { replace?: boolean } = {}) {
  const path = routePath(route);
  if (`${window.location.pathname}${window.location.search}` === path) return;
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  for (const listener of [...listeners]) listener();
}

export function useRoute(): MessagesRoute {
  return useSyncExternalStore(subscribe, current, () => readRoute(''));
}

/** Clic simple sur un lien de conversation : elle s'ouvre à droite sans recharger la page. */
export function openOnClick(conversationId: string, route: Partial<MessagesRoute> = {}) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate({ conversationId, ...route });
  };
}
