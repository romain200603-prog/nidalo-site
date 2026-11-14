import { afterEach, describe, expect, it, vi } from 'vitest';

// Le client Supabase est remplacé : on vérifie ce que le site lui demande, sans réseau.
vi.mock('../supabase', () => ({
  supabase: { auth: { signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })), exchangeCodeForSession: vi.fn() } },
}));

import { supabase } from '../supabase';
import {
  isFreshProviderAccount, isNewAccount, openLink, pendingLink, providerMessage, setProviderReturn, signInWithProvider,
  takeProviderReturn,
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

describe('connexion avec Google ou Apple', () => {
  it('reconnaît un compte tout neuf comme l’app : créé par Google ou Apple il y a moins de 2 minutes', () => {
    const created = '2026-11-08T09:00:00Z';
    for (const provider of ['google', 'apple']) {
      const metadata = { provider };
      expect(isFreshProviderAccount({ app_metadata: metadata, created_at: created, last_sign_in_at: '2026-11-08T09:00:30Z' })).toBe(true);
      expect(isFreshProviderAccount({ app_metadata: metadata, created_at: created, last_sign_in_at: '2026-11-08T09:10:00Z' })).toBe(false);
      expect(isFreshProviderAccount({ app_metadata: metadata, created_at: created, last_sign_in_at: null })).toBe(false);
    }
    expect(isFreshProviderAccount({ app_metadata: { provider: 'email' }, created_at: created, last_sign_in_at: '2026-11-08T09:00:30Z' })).toBe(false);
    expect(isFreshProviderAccount(null)).toBe(false);
  });

  it('retrouve le service et la page d’avant une seule fois, pendant un quart d’heure', () => {
    const storage = withStorage();
    const start = Date.parse('2026-11-08T09:00:00Z');
    setProviderReturn('google', '/favoris/', start);
    expect(takeProviderReturn(start + 5_000)).toEqual({ provider: 'google', to: '/favoris/' });
    expect(takeProviderReturn(start + 6_000)).toBeNull();
    setProviderReturn('apple', '/annonce/?id=abc', start);
    expect(takeProviderReturn(start + 5_000)).toEqual({ provider: 'apple', to: '/annonce/?id=abc' });
    setProviderReturn('apple', '/annonce/?id=abc', start);
    expect(takeProviderReturn(start + 16 * 60_000)).toBeNull();
    expect(storage.values.size).toBe(0);
  });

  it('ne ramène jamais vers une autre adresse que les pages du site, ni pour un service inconnu', () => {
    const storage = withStorage();
    for (const bad of ['https://exemple.fr/', '//exemple.fr/', '/\\exemple.fr', 'favoris/']) {
      setProviderReturn('apple', bad);
      expect(takeProviderReturn()).toBeNull();
    }
    storage.setItem('nidalo.providerReturn', JSON.stringify({ provider: 'google', to: '//exemple.fr', at: Date.now() }));
    expect(takeProviderReturn()).toBeNull();
    storage.setItem('nidalo.providerReturn', JSON.stringify({ provider: 'facebook', to: '/favoris/', at: Date.now() }));
    expect(takeProviderReturn()).toBeNull();
    storage.setItem('nidalo.providerReturn', 'pas du JSON');
    expect(takeProviderReturn()).toBeNull();
  });

  it('part vers Google ou Apple avec l’adresse de retour déclarée dans Supabase, sans les marques d’un e-mail en attente', async () => {
    for (const provider of ['google', 'apple'] as const) {
      const storage = withStorage();
      storage.setItem('nidalo.authPendingLink', 'recovery');
      storage.setItem('nidalo.newAccount', '1');
      await signInWithProvider(provider, '/favoris/');
      expect(supabase.auth.signInWithOAuth).toHaveBeenLastCalledWith({ provider, options: { redirectTo: 'https://nidalo.fr/compte/' } });
      expect(pendingLink()).toBeNull();
      expect(isNewAccount()).toBe(false);
      expect(takeProviderReturn()).toEqual({ provider, to: '/favoris/' });
    }
  });

  it('oublie le départ quand Supabase refuse de partir', async () => {
    const storage = withStorage();
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValueOnce({ data: { provider: 'apple', url: null }, error: new Error('refusé') } as never);
    await expect(signInWithProvider('apple', '/favoris/')).rejects.toThrow('refusé');
    expect(storage.values.has('nidalo.providerReturn')).toBe(false);
  });

  it('donne le message du service choisi, comme l’app', () => {
    expect(providerMessage('google')).toBe('La connexion avec Google n\'a pas abouti. Réessayez, ou connectez-vous avec votre adresse e-mail.');
    expect(providerMessage('apple')).toBe('La connexion avec Apple n\'a pas abouti. Réessayez, ou connectez-vous avec votre adresse e-mail.');
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
    exchange.mockResolvedValueOnce(answer('apple', now - 3_000));
    await openLink('code-apple');
    expect(isNewAccount()).toBe(true);

    withStorage();
    exchange.mockResolvedValueOnce(answer('email', Date.parse('2026-10-01T08:00:00Z')));
    await openLink('code-ancien');
    expect(isNewAccount()).toBe(false);
  });
});
