import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Faux client : l'écoute de la session est captée pour y jouer les annonces de supabase-js, sans serveur.
type Listener = (event: AuthChangeEvent, session: Session | null) => void;
const auth = vi.hoisted(() => ({ listener: null as ((event: string, session: unknown) => void) | null }));
vi.mock('../supabase', () => ({
  AUTH_STORAGE_KEY: 'sb-test-auth-token',
  supabase: { auth: { onAuthStateChange: (listener: (event: string, session: unknown) => void) => { auth.listener = listener; } } },
}));

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const CLAIRE = 'a0000000-0000-4000-8000-0000000000c1';
const OTHER = 'b0000000-0000-4000-8000-0000000000d2';
const listing = (n: number) => `6b0f6c1e-1d1a-4c55-9a51-${String(n).padStart(12, '0')}`;

function session(userId: string, expiresInSeconds = 3600): Session {
  return {
    access_token: 'jeton', refresh_token: 'renouvellement', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds, user: { id: userId, email: 'claire@exemple.fr' },
  } as unknown as Session;
}

let local: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  vi.resetModules();
  auth.listener = null;
  local = fakeStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', fakeStorage());
});

afterEach(() => { vi.unstubAllGlobals(); });

/** Session de la page, écoutée, et une annonce de supabase-js jouée puis appliquée (après le setTimeout). */
async function page() {
  const module = await import('./session');
  const compare = await import('../compare');
  module.startSession();
  const announce = async (event: AuthChangeEvent, value: Session | null) => {
    (auth.listener as Listener)(event, value);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { ...module, ...compare, announce };
}

describe('Session : ce que fait chaque annonce (AuthSessionPolicy, n° 29)', () => {
  it('au chargement, une session enregistrée garde le compte, même expirée ; sans session, déconnecté', async () => {
    const { sessionDecision } = await import('./session');
    expect(sessionDecision('INITIAL_SESSION', true, false)).toBe('keep');
    expect(sessionDecision('INITIAL_SESSION', true, true)).toBe('keep');
    expect(sessionDecision('INITIAL_SESSION', false, false)).toBe('signOut');
  });

  it('seule une vraie déconnexion déconnecte ; une autre annonce sans session valable ne change rien', async () => {
    const { sessionDecision } = await import('./session');
    for (const expired of [false, true]) expect(sessionDecision('SIGNED_OUT', false, expired)).toBe('signOut');
    for (const event of ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'] as AuthChangeEvent[]) {
      expect(sessionDecision(event, true, false)).toBe('keep');
      expect(sessionDecision(event, true, true)).toBe('wait');
      expect(sessionDecision(event, false, false)).toBe('wait');
    }
  });

  it('session gardée dans ce navigateur : lue telle que supabase-js l’écrit, sinon rien', async () => {
    const { storedSession } = await import('./session');
    expect(storedSession()).toBeNull();
    local.setItem('sb-test-auth-token', JSON.stringify(session(CLAIRE, -600)));
    expect(storedSession()?.user.id).toBe(CLAIRE);
    local.setItem('sb-test-auth-token', JSON.stringify({ access_token: 'jeton', user: { id: CLAIRE } }));
    expect(storedSession()).toBeNull();
    local.setItem('sb-test-auth-token', '{abîmé');
    expect(storedSession()).toBeNull();
  });

  it('expirée au chargement, hors connexion : le compte reste connecté, puis le jeton rafraîchi le garde', async () => {
    const { announce, sessionStore } = await page();
    local.setItem('sb-test-auth-token', JSON.stringify(session(CLAIRE, -600)));
    await announce('INITIAL_SESSION', null);
    expect(sessionStore.get()).toMatchObject({ status: 'signedIn', userId: CLAIRE });
    await announce('TOKEN_REFRESHED', session(CLAIRE));
    expect(sessionStore.get()).toMatchObject({ status: 'signedIn', userId: CLAIRE });
    // Rafraîchissement refusé par le serveur : supabase-js efface la session et annonce la déconnexion.
    local.removeItem('sb-test-auth-token');
    await announce('SIGNED_OUT', null);
    expect(sessionStore.get().status).toBe('signedOut');
  });

  it('sans session enregistrée au chargement : déconnecté', async () => {
    const { announce, sessionStore } = await page();
    await announce('INITIAL_SESSION', null);
    expect(sessionStore.get().status).toBe('signedOut');
  });
});

describe('Session : le compte qui s’en va laisse sa comparaison (n° 1 B)', () => {
  it('jamais au chargement, avec ou sans compte', async () => {
    const { accountLeaves } = await import('./session');
    expect(accountLeaves({ status: 'loading' }, { status: 'signedOut' })).toBe(false);
    expect(accountLeaves({ status: 'loading' }, { status: 'signedIn', session: session(CLAIRE), userId: CLAIRE, email: '' })).toBe(false);
    expect(accountLeaves({ status: 'signedOut' }, { status: 'signedIn', session: session(CLAIRE), userId: CLAIRE, email: '' })).toBe(false);
    const claire = { status: 'signedIn' as const, session: session(CLAIRE), userId: CLAIRE, email: '' };
    expect(accountLeaves(claire, { status: 'signedOut' })).toBe(true);
    expect(accountLeaves(claire, { ...claire, userId: OTHER })).toBe(true);
    expect(accountLeaves(claire, { ...claire })).toBe(false);

    for (const start of [null, session(CLAIRE)]) {
      vi.resetModules();
      const { addToCompare, announce, compareState } = await page();
      addToCompare(listing(1));
      await announce('INITIAL_SESSION', start);
      expect(compareState().ids).toEqual([listing(1)]);
    }
  });

  it('déconnexion : la comparaison est vidée et les biens consultés du compte ne sont plus lus (ils restent pour lui)', async () => {
    const { addToCompare, announce, compareState, sessionStore } = await page();
    const viewed = await import('../recentlyViewed');
    await announce('INITIAL_SESSION', session(CLAIRE));
    addToCompare(listing(1));
    await viewed.recordView(listing(2));
    expect(viewed.recentlyViewedIds()).toEqual([listing(2)]);
    await announce('SIGNED_OUT', null);
    expect(sessionStore.get().status).toBe('signedOut');
    expect(compareState().ids).toEqual([]);
    expect(viewed.recentlyViewedIds()).toEqual([]);
    await announce('SIGNED_IN', session(CLAIRE));
    expect(viewed.recentlyViewedIds()).toEqual([listing(2)]);
  });

  it('autre compte : la comparaison est vidée ; même compte (jeton rafraîchi) : rien ne change ; connexion sans compte avant : gardée', async () => {
    const { addToCompare, announce, compareState } = await page();
    await announce('INITIAL_SESSION', null);
    addToCompare(listing(1));
    await announce('SIGNED_IN', session(CLAIRE));
    expect(compareState().ids).toEqual([listing(1)]);
    await announce('TOKEN_REFRESHED', session(CLAIRE));
    expect(compareState().ids).toEqual([listing(1)]);
    await announce('SIGNED_IN', session(OTHER));
    expect(compareState().ids).toEqual([]);
  });
});
