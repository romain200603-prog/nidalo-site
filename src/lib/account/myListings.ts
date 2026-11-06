import { PHOTO_BUCKET } from '../config';
import { LISTING_COLUMNS, type ListingRow } from '../listings';
import { supabase } from '../supabase';
import { GENERIC_MESSAGE, isNetworkError, NETWORK_MESSAGE } from './auth';
import { triggerMessage } from './errors';
import { createStore, currentUserId, sessionStore } from './session';

// « Mes annonces » (Features/Profile/MyListingsView.swift) : toutes les annonces du compte, quel que soit leur
// statut (les règles du serveur laissent l'auteur les lire), les plus récemment modifiées d'abord.

export type MyListingsState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: ListingRow[] };

export const myListingsStore = createStore<MyListingsState>({ status: 'none' });

export const ONLINE_STATUSES = ['active', 'underOffer'];

export async function loadMyListings(): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    myListingsStore.set({ status: 'none' });
    return;
  }
  if (myListingsStore.get().status !== 'ready') myListingsStore.set({ status: 'loading' });
  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_COLUMNS)
    .eq('owner_id', session.userId)
    .order('updated_at', { ascending: false });
  if (currentUserId() !== session.userId) return;
  if (error) {
    myListingsStore.set({ status: 'error', message: isNetworkError(error) ? NETWORK_MESSAGE : GENERIC_MESSAGE });
    return;
  }
  myListingsStore.set({ status: 'ready', items: (data ?? []) as unknown as ListingRow[] });
}

/** « 2 en ligne · 1 brouillon » (MyListingsCard.countText). */
export function listingsCountText(items: ListingRow[]): string {
  const online = items.filter((row) => ONLINE_STATUSES.includes(row.status)).length;
  const drafts = items.filter((row) => row.status === 'draft').length;
  const draftText = drafts === 0 ? '' : drafts === 1 ? ' · 1 brouillon' : ` · ${drafts} brouillons`;
  return `${online} en ligne${draftText}`;
}

/** Suspendre (`archived`) ou republier (`active`). Les contrôles du serveur expliquent un refus (P0001). */
export async function setListingStatus(id: string, status: 'active' | 'archived'): Promise<string | null> {
  const { error } = await supabase.from('listings').update({ status }).eq('id', id);
  if (error) return triggerMessage(error, 'Le statut de l\'annonce n\'a pas pu être modifié.');
  await loadMyListings();
  return null;
}

/** Tous les fichiers sous un dossier d'un espace de stockage, sous-dossiers compris. */
export async function listFiles(bucket: string, folder: string, depth = 3): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 100, offset });
    if (error) throw error;
    const entries = data ?? [];
    for (const entry of entries) {
      const path = `${folder}/${entry.name}`;
      // Un dossier n'a pas d'identifiant.
      if (entry.id === null) {
        if (depth > 0) paths.push(...await listFiles(bucket, path, depth - 1));
      } else {
        paths.push(path);
      }
    }
    if (entries.length < 100) break;
    offset += entries.length;
  }
  return paths;
}

/** Retire des fichiers par paquets de 100. */
export async function removeFiles(bucket: string, paths: string[]): Promise<void> {
  for (let start = 0; start < paths.length; start += 100) {
    const { error } = await supabase.storage.from(bucket).remove(paths.slice(start, start + 100));
    if (error) throw error;
  }
}

/** « Supprimer définitivement » : les photos d'abord, puis l'annonce (son adresse et ses photos partent avec). */
export async function deleteListing(id: string): Promise<string | null> {
  const userId = currentUserId();
  if (!userId) return 'L\'annonce n\'a pas pu être supprimée.';
  try {
    const files = await listFiles(PHOTO_BUCKET, `${userId}/${id}`, 1);
    await removeFiles(PHOTO_BUCKET, files);
    const { error } = await supabase.from('listings').delete().eq('id', id);
    if (error) throw error;
    await loadMyListings();
    return null;
  } catch (error) {
    return isNetworkError(error) ? NETWORK_MESSAGE : 'L\'annonce n\'a pas pu être supprimée.';
  }
}
