import { supabase } from '../supabase';
import { createStore, currentUserId, sessionStore } from './session';

// Fiche agence d'un compte professionnel (professional_profiles et professional_profile_details), lue pour l'en-tête
// de l'espace professionnel. Sur l'iPhone, une partie du formulaire reste sur le téléphone ; le site lit le serveur.

export type Agency = {
  id: string;
  agency_name: string | null;
  logo_path: string | null;
  postal_code: string | null;
  city: string | null;
  email: string | null;
};

export type ProfessionalState = { status: 'none' | 'loading' | 'error' } | { status: 'ready'; agency: Agency | null };

export const professionalStore = createStore<ProfessionalState>({ status: 'none' });

export async function loadProfessional(): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    professionalStore.set({ status: 'none' });
    return;
  }
  if (professionalStore.get().status === 'none') professionalStore.set({ status: 'loading' });
  const { data, error } = await supabase
    .from('professional_profiles')
    .select('id, agency_name, logo_path, postal_code, city')
    .eq('owner_user_id', session.userId)
    .limit(1);
  if (currentUserId() !== session.userId) return;
  if (error) {
    professionalStore.set({ status: 'error' });
    return;
  }
  const row = data?.[0] as Omit<Agency, 'email'> | undefined;
  if (!row) {
    professionalStore.set({ status: 'ready', agency: null });
    return;
  }
  const details = await supabase.from('professional_profile_details').select('email').eq('professional_profile_id', row.id).limit(1);
  const email = (details.data?.[0] as { email: string | null } | undefined)?.email ?? null;
  professionalStore.set({ status: 'ready', agency: { ...row, email } });
}
