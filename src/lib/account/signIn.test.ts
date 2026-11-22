import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '@supabase/supabase-js';

// Le client Supabase est remplacé : on vérifie ce que le site lui demande, sans réseau.
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resend: vi.fn(async () => ({ data: {}, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  },
}));

import { supabase } from '../supabase';
import { isNewAccount, pendingLink, resendConfirmation, setNewAccount, setPendingLink, signIn, signOut, signUp } from './auth';

const auth = supabase.auth as unknown as {
  signInWithPassword: ReturnType<typeof vi.fn>;
  signUp: ReturnType<typeof vi.fn>;
  resend: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
};

function withStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
  });
  return values;
}

const session = { access_token: 'jeton-de-test', user: { id: 'u1' } };
const accepted = () => auth.signInWithPassword.mockResolvedValueOnce({ data: { session }, error: null });
const refused = () => auth.signInWithPassword.mockResolvedValueOnce({
  data: { session: null }, error: new AuthError('Invalid login credentials', 400, 'invalid_credentials'),
});

afterEach(() => {
  setPendingLink(null);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('connexion avec le mot de passe (n° 39 de l’app)', () => {
  it('un compte existant ne passe pas pour nouveau : les marques de l’inscription sont effacées', async () => {
    withStorage();
    setNewAccount(true);
    setPendingLink('signup');
    accepted();
    await signIn(' Claire@Exemple.fr ', 'motdepasse');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'claire@exemple.fr', password: 'motdepasse' });
    expect(isNewAccount()).toBe(false);
    expect(pendingLink()).toBeNull();
  });

  it('les marques reviennent si la connexion échoue', async () => {
    withStorage();
    setNewAccount(true);
    setPendingLink('signup');
    refused();
    await expect(signIn('claire@exemple.fr', 'mauvais')).rejects.toBeInstanceOf(AuthError);
    expect(isNewAccount()).toBe(true);
    expect(pendingLink()).toBe('signup');
  });

  it('la même adresse que l’inscription en cours garde « Quel est votre profil ? »', async () => {
    withStorage();
    auth.signUp.mockResolvedValueOnce({ data: { session: null, user: { identities: [{ id: 'i1' }] } }, error: null });
    expect(await signUp('Camille.Martin@exemple.fr', 'Fourvi3re!x', 'Camille', 'Martin')).toBe('checkEmail');
    accepted();
    await signIn('camille.martin@exemple.fr', 'Fourvi3re!x');
    expect(isNewAccount()).toBe(true);
    expect(pendingLink()).toBe('signup');
    // Une autre adresse : compte existant.
    accepted();
    await signIn('claire@exemple.fr', 'motdepasse');
    expect(isNewAccount()).toBe(false);
    expect(pendingLink()).toBeNull();
  });

  it('l’adresse de l’inscription est oubliée quand la demande est vidée, et après un nouvel envoi elle compte', async () => {
    withStorage();
    await resendConfirmation('camille.martin@exemple.fr');
    setPendingLink(null);
    setNewAccount(true);
    accepted();
    await signIn('camille.martin@exemple.fr', 'Fourvi3re!x');
    expect(isNewAccount()).toBe(false);
    await resendConfirmation('camille.martin@exemple.fr');
    accepted();
    await signIn('camille.martin@exemple.fr', 'Fourvi3re!x');
    expect(isNewAccount()).toBe(true);
  });
});

describe('création du compte', () => {
  it('envoie le prénom, le nom et le nom affiché, comme l’app', async () => {
    withStorage();
    auth.signUp.mockResolvedValueOnce({ data: { session: null, user: { identities: [{ id: 'i1' }] } }, error: null });
    await signUp('camille.martin@exemple.fr', 'Fourvi3re!x', ' Camille ', 'Martin');
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'camille.martin@exemple.fr',
      password: 'Fourvi3re!x',
      options: {
        emailRedirectTo: expect.stringMatching(/\/compte\/$/),
        data: { first_name: 'Camille', last_name: 'Martin', display_name: 'Camille Martin' },
      },
    });
  });

  it('adresse déjà inscrite : aucune marque de compte tout neuf', async () => {
    withStorage();
    auth.signUp.mockResolvedValueOnce({ data: { session: null, user: { identities: [] } }, error: null });
    expect(await signUp('claire@exemple.fr', 'Fourvi3re!x', 'Claire', 'Martin')).toBe('alreadyExists');
    expect(isNewAccount()).toBe(false);
    expect(pendingLink()).toBeNull();
  });
});

describe('déconnexion (n° 122 de l’app)', () => {
  it('ne ferme que la session de ce navigateur', async () => {
    withStorage();
    setNewAccount(true);
    await signOut();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(isNewAccount()).toBe(false);
  });

  it('hors ligne : un second essai, sans erreur affichée', async () => {
    withStorage();
    auth.signOut.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(signOut()).resolves.toBeUndefined();
    expect(auth.signOut).toHaveBeenCalledTimes(2);
    expect(auth.signOut.mock.calls.every(([options]) => options.scope === 'local')).toBe(true);
    auth.signOut.mockResolvedValueOnce({ error: new AuthError('Session from session_id claim in JWT does not exist', 500) });
    await signOut();
    expect(auth.signOut).toHaveBeenCalledTimes(4);
  });
});
