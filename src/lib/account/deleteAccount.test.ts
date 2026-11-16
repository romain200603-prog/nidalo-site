import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config';
import { AUTH_STORAGE_KEY, supabase } from '../supabase';

describe('Suppression du compte : déconnexion sans appel au serveur', () => {
  it('la clé effacée est celle où supabase-js garde la session, la même qu’avant : personne n’est déconnecté', () => {
    // Un client sans clé choisie montre la clé que supabase-js prenait de lui-même avant ce changement.
    const byDefault = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const keyOf = (client: unknown) => (client as { auth: { storageKey: string } }).auth.storageKey;
    expect(keyOf(byDefault)).toBe('sb-izzsoitqtzzswkpvdozd-auth-token');
    expect(AUTH_STORAGE_KEY).toBe(keyOf(byDefault));
    expect(keyOf(supabase)).toBe(AUTH_STORAGE_KEY);
  });
});
