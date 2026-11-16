import { PHOTO_BUCKET } from '../config';
import { AUTH_STORAGE_KEY, supabase } from '../supabase';
import { isNetworkError, NETWORK_MESSAGE, setNewAccount, setPendingLink } from './auth';
import { MANDATE_BUCKET } from './mandates';
import { listFiles, removeFiles } from './myListings';
import { currentUserId } from './session';

// « Supprimer mon compte » (SupabaseAccountRepositories.swift 432–448) : les fichiers du compte, puis le compte
// lui-même (fonction delete_my_account : tout le reste suit). Renvoie le message d'erreur, ou `null`.

const USER_FOLDERS = [PHOTO_BUCKET, 'avatars', 'visit-reports', 'private-documents', 'shared-documents', MANDATE_BUCKET];

export async function deleteMyAccount(): Promise<string | null> {
  const userId = currentUserId();
  if (!userId) return 'Vous n\'êtes pas connecté à un compte NIDALO.';
  try {
    for (const bucket of USER_FOLDERS) {
      const files = await listFiles(bucket, userId, 4);
      await removeFiles(bucket, files);
    }
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw error;
    setPendingLink(null);
    setNewAccount(false);
    await signOutDeletedAccount();
    return null;
  } catch (error) {
    return isNetworkError(error) ? NETWORK_MESSAGE : 'La suppression n\'a pas abouti. Réessayez dans un instant.';
  }
}

/**
 * Déconnexion de ce navigateur juste après la suppression, sans rien demander au serveur. Même avec
 * signOut({ scope: 'local' }), supabase-js envoie la session au serveur pour la fermer ; le compte n'existant plus, le
 * serveur répondait 403 (journaux du 15 novembre). La session est donc d'abord retirée du stockage : supabase-js la
 * relit à chaque demande, n'a plus rien à envoyer, et signOut({ scope: 'local' }) ne fait plus que le ménage local
 * (codes de connexion, avis « déconnecté » aux autres onglets).
 */
export async function signOutDeletedAccount(): Promise<void> {
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Stockage indisponible : signOut fait le ménage seul.
  }
  await supabase.auth.signOut({ scope: 'local' });
}
