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

/**
 * Marque interne d'une demande qui doit partir même si la page se ferme (retrait d'un favori envoyé quand la page est
 * quittée) : retirée avant l'envoi, elle n'arrive jamais au serveur ; la demande part avec `keepalive`.
 */
export const KEEPALIVE_HEADER = 'x-nidalo-keepalive';

function keepaliveInit(init?: RequestInit): RequestInit | undefined {
  if (!init?.headers) return undefined;
  const headers = new Headers(init.headers);
  if (!headers.has(KEEPALIVE_HEADER)) return undefined;
  headers.delete(KEEPALIVE_HEADER);
  return { ...init, headers, keepalive: true };
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce', storageKey: AUTH_STORAGE_KEY },
  global: {
    fetch: (input, init) => fetch(input, { ...(keepaliveInit(init) ?? init), credentials: 'omit', referrerPolicy: 'no-referrer' }),
  },
});
