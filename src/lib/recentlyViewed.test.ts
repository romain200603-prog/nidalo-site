import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// La session vient d'un faux client : aucun appel au serveur.
vi.mock('./supabase', () => ({ AUTH_STORAGE_KEY: 'sb-test-auth-token', supabase: { auth: { onAuthStateChange: () => undefined } } }));

const { sessionStore } = await import('./account/session');
const { clearHistory, recentlyViewedIds, recordView, removeFromHistory, removeViewedListings, viewedListingsKey } = await import('./recentlyViewed');

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const id = (n: number) => `6b0f6c1e-1d1a-4c55-9a51-${String(n).padStart(12, '0')}`;
const CLAIRE = 'A0000000-0000-4000-8000-0000000000C1';
const OTHER = 'b0000000-0000-4000-8000-0000000000d2';

function signIn(userId: string) {
  sessionStore.set({ status: 'signedIn', session: { user: { id: userId } } as Session, userId, email: 'claire@exemple.fr' });
}

let local: ReturnType<typeof fakeStorage>;
let tab: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  local = fakeStorage();
  tab = fakeStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', tab);
  signIn(CLAIRE);
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('Biens consultés d’un compte (AccountStore.recordView, n° 114)', () => {
  it('la dernière fiche ouverte passe en tête, sans doublon, dans la liste du compte gardée dans ce navigateur', async () => {
    await recordView(id(1));
    await recordView(id(2));
    await recordView(id(1));
    expect(recentlyViewedIds()).toEqual([id(1), id(2)]);
    expect(viewedListingsKey(CLAIRE)).toBe('nidalo.consultes.a0000000-0000-4000-8000-0000000000c1');
    expect(JSON.parse(local.values.get(viewedListingsKey(CLAIRE))!)).toEqual([id(1), id(2)]);
  });

  it('50 fiches au plus', async () => {
    for (let n = 1; n <= 60; n += 1) await recordView(id(n));
    const ids = recentlyViewedIds();
    expect(ids).toHaveLength(50);
    expect(ids[0]).toBe(id(60));
    expect(ids.at(-1)).toBe(id(11));
  });

  it('sans compte, rien n’est gardé ni montré', async () => {
    sessionStore.set({ status: 'signedOut' });
    await recordView(id(1));
    expect(recentlyViewedIds()).toEqual([]);
    expect(local.values.size).toBe(0);
  });

  it('une liste par compte : le compte qui s’en va n’est plus lu, et retrouve la sienne en revenant', async () => {
    await recordView(id(1));
    signIn(OTHER);
    expect(recentlyViewedIds()).toEqual([]);
    await recordView(id(2));
    expect(recentlyViewedIds()).toEqual([id(2)]);
    sessionStore.set({ status: 'signedOut' });
    expect(recentlyViewedIds()).toEqual([]);
    signIn(CLAIRE);
    expect(recentlyViewedIds()).toEqual([id(1)]);
  });

  it('page qui s’ouvre : la liste du compte gardé dans ce navigateur, et la fiche notée une fois la session connue', async () => {
    await recordView(id(1));
    sessionStore.set({ status: 'loading' });
    local.setItem('sb-test-auth-token', JSON.stringify({ access_token: 'a', refresh_token: 'r', user: { id: CLAIRE } }));
    expect(recentlyViewedIds()).toEqual([id(1)]);
    const pending = recordView(id(2));
    signIn(CLAIRE);
    await pending;
    expect(recentlyViewedIds()).toEqual([id(2), id(1)]);
    // Session refusée au chargement : déconnecté, rien n'est écrit.
    sessionStore.set({ status: 'loading' });
    const refused = recordView(id(3));
    sessionStore.set({ status: 'signedOut' });
    await refused;
    signIn(CLAIRE);
    expect(recentlyViewedIds()).toEqual([id(2), id(1)]);
  });

  it('« Retirer de l’historique », « Vider l’historique », puis la suppression du compte', async () => {
    await recordView(id(1));
    await recordView(id(2));
    await recordView(id(3));
    removeFromHistory(id(2));
    expect(recentlyViewedIds()).toEqual([id(3), id(1)]);
    removeFromHistory(id(9));
    expect(recentlyViewedIds()).toEqual([id(3), id(1)]);
    clearHistory();
    expect(recentlyViewedIds()).toEqual([]);
    await recordView(id(4));
    expect(recentlyViewedIds()).toEqual([id(4)]);
    removeViewedListings(CLAIRE);
    expect(local.values.has(viewedListingsKey(CLAIRE))).toBe(false);
    expect(recentlyViewedIds()).toEqual([]);
  });

  it('l’ancienne liste de l’onglet (sessionStorage) est effacée, jamais lue', () => {
    vi.resetModules();
    tab.setItem('nidalo.consultes', JSON.stringify([id(7)]));
    return import('./recentlyViewed').then(({ recentlyViewedIds: fresh }) => {
      expect(fresh()).toEqual([]);
      expect(tab.values.has('nidalo.consultes')).toBe(false);
    });
  });

  it('stockage indisponible ou abîmé : liste vide, sans erreur', async () => {
    local.setItem(viewedListingsKey(CLAIRE), '{pas du json');
    expect(recentlyViewedIds()).toEqual([]);
    local.setItem(viewedListingsKey(CLAIRE), JSON.stringify([id(1), 3, id(1), null]));
    expect(recentlyViewedIds()).toEqual([id(1)]);
    const blocked = { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); }, removeItem: () => { throw new Error('bloqué'); } };
    vi.stubGlobal('localStorage', blocked);
    vi.stubGlobal('sessionStorage', blocked);
    expect(recentlyViewedIds()).toEqual([]);
    await expect(recordView(id(2))).resolves.toBeUndefined();
    expect(() => removeFromHistory(id(2))).not.toThrow();
    expect(() => clearHistory()).not.toThrow();
    expect(() => removeViewedListings(CLAIRE)).not.toThrow();
  });
});
