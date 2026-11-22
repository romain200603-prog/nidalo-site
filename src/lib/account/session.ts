import { useSyncExternalStore } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { clearCompare } from '../compare';
import { AUTH_STORAGE_KEY, supabase } from '../supabase';

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
 * Session que supabase-js garde dans ce navigateur, même expirée ; `null` sans session lisible. supabase-js la garde
 * quand son rafraîchissement échoue faute de connexion, et l'efface quand le serveur la refuse.
 */
export function storedSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Session> | null;
    const ok = typeof value?.access_token === 'string' && typeof value.refresh_token === 'string'
      && typeof value.user?.id === 'string' && value.user.id.length > 0;
    return ok ? (value as Session) : null;
  } catch {
    return null;
  }
}

/** Ce que fait le compte à une annonce de supabase-js (AuthSessionPolicy de l'app, n° 29). */
export type SessionDecision = 'keep' | 'signOut' | 'wait';

/**
 * Une session enregistrée, même expirée, garde le compte au chargement : supabase-js la rafraîchit ensuite. Seule une
 * vraie déconnexion déconnecte ; une autre annonce sans session valable ne change rien (AuthSessionPolicy.decision).
 */
export function sessionDecision(event: AuthChangeEvent, hasSession: boolean, isExpired: boolean): SessionDecision {
  if (event === 'SIGNED_OUT') return 'signOut';
  if (event === 'INITIAL_SESSION') return hasSession ? 'keep' : 'signOut';
  return hasSession && !isExpired ? 'keep' : 'wait';
}

/** Un compte connecté s'en va (déconnexion, ou un autre compte) ; jamais au premier chargement de la page (n° 1 B). */
export function accountLeaves(current: SessionState, next: SessionState): boolean {
  return current.status === 'signedIn' && (next.status !== 'signedIn' || next.userId !== current.userId);
}

const isExpired = (session: Session) => typeof session.expires_at === 'number' && session.expires_at * 1000 <= Date.now();

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
      // Session expirée au chargement dont le rafraîchissement a échoué (hors connexion) : supabase-js annonce
      // « aucune session » mais la garde dans ce navigateur et la rafraîchira ; le compte reste connecté (n° 29).
      const shown = event === 'INITIAL_SESSION' && !session ? storedSession() : session;
      const decision = sessionDecision(event, shown !== null, shown ? isExpired(shown) : false);
      if (decision === 'wait') return;
      const next = stateFor(decision === 'keep' ? shown : null);
      const current = sessionStore.get();
      // Un rafraîchissement du jeton garde le même compte : on ne recharge rien.
      if (next.status === 'signedIn' && current.status === 'signedIn' && current.userId === next.userId) {
        current.session = next.session;
        return;
      }
      // Le compte qui s'en va laisse sa comparaison ; ses biens consultés ne sont plus lus (n° 1 B, n° 114).
      if (accountLeaves(current, next)) clearCompare();
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
