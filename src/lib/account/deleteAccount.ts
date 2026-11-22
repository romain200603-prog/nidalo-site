import { PHOTO_BUCKET } from '../config';
import { AUTH_STORAGE_KEY, supabase } from '../supabase';
import { isNetworkError, NETWORK_MESSAGE, setNewAccount, setPendingLink } from './auth';
import { MANDATE_BUCKET } from './mandates';
import { listFiles, removeFiles } from './myListings';
import { currentUserId } from './session';
import { removeRecentPlaces } from '../recentPlaces';
import { removeViewedListings } from '../recentlyViewed';

// « Supprimer mon compte » (SupabaseAccountRepositories.swift 432–448) : les fichiers du compte, puis le compte
// lui-même (fonction delete_my_account : tout le reste suit). Renvoie le message d'erreur, ou `null`.

const USER_FOLDERS = [PHOTO_BUCKET, 'avatars', 'visit-reports', 'private-documents', 'shared-documents', MANDATE_BUCKET];

/** Échec après l'effacement d'une partie des fichiers : un nouvel essai termine (n° 154). */
export const PARTIAL_DELETION_MESSAGE =
  'La suppression n\'a pas abouti : une partie de vos photos et de vos documents est peut-être déjà effacée. Vérifiez votre connexion, puis réessayez pour terminer.';

export async function deleteMyAccount(): Promise<string | null> {
  const userId = currentUserId();
  if (!userId) return 'Vous n\'êtes pas connecté à un compte Nidalo.';
  // Échec après une première suppression réussie : le message le dit (n° 154). L'ordre ne change pas : la fonction du
  // serveur n'efface aucun fichier, et un nouvel essai repasse sur des listes vides.
  let removedFiles = false;
  try {
    for (const bucket of USER_FOLDERS) {
      const files = await listFiles(bucket, userId, 4);
      await removeFiles(bucket, files);
      removedFiles = true;
    }
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw error;
    // Comme l'app : les lieux récents et les biens consultés du compte (gardés dans ce navigateur) partent avec lui.
    removeRecentPlaces(userId);
    removeViewedListings(userId);
    setPendingLink(null);
    setNewAccount(false);
    await signOutDeletedAccount();
    return null;
  } catch (error) {
    if (removedFiles) return PARTIAL_DELETION_MESSAGE;
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
