import { afterEach, describe, expect, it, vi } from 'vitest';

// Le client Supabase est remplacé : on vérifie ce que le site lui demande, sans réseau.
vi.mock('../supabase', () => ({
  supabase: { auth: { signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })), exchangeCodeForSession: vi.fn() } },
}));

import { supabase } from '../supabase';
import {
  isFreshGoogleAccount, isNewAccount, openLink, pendingLink, setGoogleReturn, signInWithGoogle, takeGoogleReturn,
} from './auth';

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function withStorage() {
  const storage = fakeStorage();
  vi.stubGlobal('window', { localStorage: storage });
  return storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('connexion avec Google', () => {
  it('reconnaît un compte tout neuf comme l’app : créé par Google il y a moins de 2 minutes', () => {
    const created = '2026-11-08T09:00:00Z';
    const google = { provider: 'google' };
    expect(isFreshGoogleAccount({ app_metadata: google, created_at: created, last_sign_in_at: '2026-11-08T09:00:30Z' })).toBe(true);
    expect(isFreshGoogleAccount({ app_metadata: google, created_at: created, last_sign_in_at: '2026-11-08T09:10:00Z' })).toBe(false);
    expect(isFreshGoogleAccount({ app_metadata: { provider: 'email' }, created_at: created, last_sign_in_at: '2026-11-08T09:00:30Z' })).toBe(false);
    expect(isFreshGoogleAccount({ app_metadata: google, created_at: created, last_sign_in_at: null })).toBe(false);
    expect(isFreshGoogleAccount(null)).toBe(false);
  });

  it('retrouve la page d’avant une seule fois, pendant un quart d’heure', () => {
    const storage = withStorage();
    const start = Date.parse('2026-11-08T09:00:00Z');
    setGoogleReturn('/favoris/', start);
    expect(takeGoogleReturn(start + 5_000)).toBe('/favoris/');
    expect(takeGoogleReturn(start + 6_000)).toBeNull();
    setGoogleReturn('/annonce/?id=abc', start);
    expect(takeGoogleReturn(start + 16 * 60_000)).toBeNull();
    expect(storage.values.size).toBe(0);
  });

  it('ne ramène jamais vers une autre adresse que les pages du site', () => {
    const storage = withStorage();
    for (const bad of ['https://exemple.fr/', '//exemple.fr/', '/\\exemple.fr', 'favoris/']) {
      setGoogleReturn(bad);
      expect(takeGoogleReturn()).toBeNull();
    }
    storage.setItem('nidalo.googleReturn', JSON.stringify({ to: '//exemple.fr', at: Date.now() }));
    expect(takeGoogleReturn()).toBeNull();
    storage.setItem('nidalo.googleReturn', 'pas du JSON');
    expect(takeGoogleReturn()).toBeNull();
  });

  it('part vers Google avec l’adresse de retour déclarée dans Supabase, sans les marques d’un e-mail en attente', async () => {
    const storage = withStorage();
    storage.setItem('nidalo.authPendingLink', 'recovery');
    storage.setItem('nidalo.newAccount', '1');
    await signInWithGoogle('/favoris/');
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://nidalo.fr/compte/' } });
    expect(pendingLink()).toBeNull();
    expect(isNewAccount()).toBe(false);
    expect(takeGoogleReturn()).toBe('/favoris/');
  });

  it('au retour, un compte tout neuf choisira son profil ; un compte existant non', async () => {
    withStorage();
    const now = Date.now();
    const exchange = vi.mocked(supabase.auth.exchangeCodeForSession);
    const answer = (provider: string, createdAt: number) => ({
      data: {
        user: { app_metadata: { provider }, created_at: new Date(createdAt).toISOString(), last_sign_in_at: new Date(now).toISOString() },
        session: {},
      },
      error: null,
    }) as never;
    exchange.mockResolvedValueOnce(answer('google', now - 3_000));
    expect(await openLink('code-neuf')).toBeNull();
    expect(isNewAccount()).toBe(true);

    withStorage();
    exchange.mockResolvedValueOnce(answer('email', Date.parse('2026-10-01T08:00:00Z')));
    await openLink('code-ancien');
    expect(isNewAccount()).toBe(false);
  });
});
