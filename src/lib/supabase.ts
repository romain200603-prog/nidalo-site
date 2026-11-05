import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

// Un seul client pour tout le site. Aucun cookie : les demandes partent sans cookie et n'en gardent aucun.
// Étape 1 : aucune connexion, rien n'est gardé dans le navigateur. La session du compte arrivera à l'étape 2.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce' },
  global: {
    fetch: (input, init) => fetch(input, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' }),
  },
});
