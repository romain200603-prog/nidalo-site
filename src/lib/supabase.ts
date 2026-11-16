import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

// Un seul client pour tout le site. Aucun cookie : les demandes partent sans cookie et n'en gardent aucun.
// Étape 2 : quand on se connecte, la session du compte est gardée dans ce navigateur (stockage local), pour
// rester connecté d'une page à l'autre. Rien n'y est écrit tant qu'on ne se connecte pas.
// Les liens des e-mails (code PKCE) sont échangés par la page Mon compte elle-même (lib/account/auth.ts).
/**
 * Clé de la session dans le stockage local : celle que supabase-js choisit de lui-même (« sb-<projet>-auth-token »),
 * écrite ici pour que la suppression du compte puisse effacer la session (deleteAccount.ts). Même valeur qu'avant :
 * personne n'est déconnecté.
 */
export const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce', storageKey: AUTH_STORAGE_KEY },
  global: {
    fetch: (input, init) => fetch(input, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' }),
  },
});
