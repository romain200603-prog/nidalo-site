import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';

// État du compte partagé par toute la page (comme AuthStore dans l'app) : chargement, déconnecté ou connecté.

/** Petite boîte à valeur observable, lue par les composants avec `useStore`. */
export type Store<T> = { get: () => T; set: (value: T) => void; subscribe: (listener: () => void) => () => void };

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; session: Session; userId: string; email: string };

export const sessionStore = createStore<SessionState>({ status: 'loading' });

/** Lien « Mot de passe oublié » ouvert : la page doit d'abord demander le nouveau mot de passe. */
export const recoveryStore = createStore(false);

let started = false;

function stateFor(session: Session | null): SessionState {
  if (!session) return { status: 'signedOut' };
  return { status: 'signedIn', session, userId: session.user.id, email: session.user.email ?? '' };
}

/**
 * Écoute la session une seule fois par page. supabase-js lit la session gardée, la rafraîchit si besoin, puis
 * annonce « INITIAL_SESSION ». Les autres demandes au serveur partent après coup (setTimeout), comme le conseille
 * supabase-js, pour ne pas les lancer pendant son annonce.
 */
export function startSession() {
  if (started) return;
  started = true;
  supabase.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') recoveryStore.set(true);
      const next = stateFor(session);
      const current = sessionStore.get();
      // Un rafraîchissement du jeton garde le même compte : on ne recharge rien.
      if (next.status === 'signedIn' && current.status === 'signedIn' && current.userId === next.userId) {
        current.session = next.session;
        return;
      }
      if (next.status !== current.status || next.status === 'signedIn') sessionStore.set(next);
    }, 0);
  });
}

export function useSession(): SessionState {
  startSession();
  return useStore(sessionStore);
}

/** Identifiant du compte connecté, ou `null`. */
export function currentUserId(): string | null {
  const state = sessionStore.get();
  return state.status === 'signedIn' ? state.userId : null;
}

/** Attend la première réponse de supabase-js (connecté ou non). */
export function sessionReady(): Promise<SessionState> {
  startSession();
  const state = sessionStore.get();
  if (state.status !== 'loading') return Promise.resolve(state);
  return new Promise((resolve) => {
    const stop = sessionStore.subscribe(() => {
      const next = sessionStore.get();
      if (next.status === 'loading') return;
      stop();
      resolve(next);
    });
  });
}
