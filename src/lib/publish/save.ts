import { GENERIC_MESSAGE, isNetworkError, NETWORK_MESSAGE } from '../account/auth';
import { REFUSED_MESSAGE } from '../account/errors';
import { loadMyListings } from '../account/myListings';
import { currentUserId } from '../account/session';
import { PHOTO_BUCKET } from '../config';
import { LISTING_COLUMNS, sortedPhotos, type ListingRow, type PhotoRow } from '../listings';
import { supabase } from '../supabase';
import { missingRequiredFields, type DraftPhoto, type PublishDraft } from './draft';
import { appDecodingProblems, draftFromRow, listingWrite, type ExactLocation } from './serialize';

// Écriture d'une annonce, dans l'ordre de l'app (SupabaseListingRepository.publish) : la ligne en brouillon, l'adresse
// exacte, les photos, puis la mise en ligne. Si une étape échoue, l'annonce reste en brouillon sur le serveur (Mes
// annonces la montre, à reprendre). Le serveur refuse une annonce incomplète avec un message en français (P0001),
// montré tel quel.

export const ONLINE_STATUSES = ['active', 'underOffer'];

export type Loaded =
  | { status: 'ready'; draft: PublishDraft; listingStatus: string }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

/** Annonce du compte à reprendre ou à modifier : la ligne et son adresse exacte (lisibles par l'auteur seulement). */
export async function loadListingForEdit(id: string): Promise<Loaded> {
  const userId = currentUserId();
  if (!userId) return { status: 'notFound' };
  try {
    const { data, error } = await supabase.from('listings').select(LISTING_COLUMNS).eq('id', id).eq('owner_id', userId).limit(1);
    if (error) throw error;
    const row = (data as unknown as ListingRow[] | null)?.[0];
    if (!row) return { status: 'notFound' };
    const located = await supabase.from('listing_locations').select('street, latitude, longitude').eq('listing_id', id).limit(1);
    if (located.error) throw located.error;
    const location = ((located.data ?? []) as ExactLocation[])[0] ?? null;
    return { status: 'ready', draft: draftFromRow(row, location), listingStatus: row.status };
  } catch (error) {
    return { status: 'error', message: isNetworkError(error) ? NETWORK_MESSAGE : GENERIC_MESSAGE };
  }
}

export type SaveResult =
  | { ok: true; draft: PublishDraft; listingStatus: string }
  /** `refusal` : message du serveur (P0001), affiché dans « Publication refusée ». */
  | { ok: false; message: string; refusal: boolean };

class Refused extends Error {}

function failure(error: unknown, fallback: string): SaveResult {
  if (error instanceof Refused) return { ok: false, message: error.message, refusal: true };
  if (isNetworkError(error)) return { ok: false, message: NETWORK_MESSAGE, refusal: false };
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  if (code === 'P0001' && message) return { ok: false, message, refusal: true };
  if (code && ['23514', '23502', '22001', '22P02', '22003'].includes(code)) return { ok: false, message: REFUSED_MESSAGE, refusal: false };
  return { ok: false, message: fallback, refusal: false };
}

const PUBLISH_FAILED = 'L\'annonce n\'a pas pu être publiée. Vérifiez les champs signalés puis réessayez.';
const EDIT_FAILED = 'Les modifications n\'ont pas pu être enregistrées. Vérifiez les champs signalés puis réessayez.';
const DRAFT_FAILED = 'Le brouillon n\'a pas pu être enregistré. Réessayez dans un instant.';

/**
 * Enregistre l'annonce : `draft` (brouillon, jamais mis en ligne), `publish` (nouvelle annonce ou brouillon : en
 * ligne à la fin) ou `edit` (annonce déjà publiée : mêmes statut et date de publication, le serveur les garde).
 * `onProgress` reçoit le nombre de photos envoyées.
 */
export async function saveListing(
  source: PublishDraft,
  mode: 'draft' | 'publish' | 'edit',
  onProgress?: (sent: number, total: number) => void,
): Promise<SaveResult> {
  const userId = currentUserId();
  if (!userId) return { ok: false, message: 'Votre session a expiré. Reconnectez-vous.', refusal: false };
  const fallback = mode === 'draft' ? DRAFT_FAILED : mode === 'edit' ? EDIT_FAILED : PUBLISH_FAILED;
  if (mode !== 'draft' && missingRequiredFields(source).length > 0) return { ok: false, message: fallback, refusal: false };
  try {
    const existing = await supabase.from('listings').select('id, status').eq('id', source.id).limit(1);
    if (existing.error) throw existing.error;
    const current = ((existing.data ?? []) as { id: string; status: string }[])[0] ?? null;
    const write = listingWrite(source, { insert: current === null });
    const problems = appDecodingProblems(write);
    // Jamais une ligne que l'app ne saurait pas relire (elle ferait échouer toute sa liste d'annonces).
    if (problems.length > 0) throw new Error(`Annonce illisible par l'app : ${problems.join(', ')}`);
    if (current === null) {
      const inserted = await supabase.from('listings').insert(write);
      if (inserted.error) throw inserted.error;
    } else {
      const updated = await supabase.from('listings').update(write).eq('id', source.id);
      if (updated.error) throw updated.error;
    }
    if (source.coordinate) {
      const street = source.address?.street?.trim() ? [...source.address.street.trim()].slice(0, 200).join('') : null;
      const located = await supabase.from('listing_locations').upsert(
        { listing_id: source.id, street, latitude: source.coordinate.latitude, longitude: source.coordinate.longitude },
        { onConflict: 'listing_id' },
      );
      if (located.error) throw located.error;
    }
    await syncPhotos(source.photos, source.id, userId, onProgress);
    // Nouvelle annonce, ou brouillon resté sur le serveur : elle passe en ligne (le serveur revérifie tout).
    const goesOnline = mode === 'publish' && (current === null || current.status === 'draft');
    if (goesOnline) {
      const online = await supabase.from('listings').update({ status: 'active' }).eq('id', source.id);
      if (online.error) throw online.error;
    }
    const reloaded = await loadListingForEdit(source.id);
    if (reloaded.status !== 'ready') throw new Error('Annonce introuvable après l\'enregistrement.');
    void loadMyListings();
    // Les champs saisis restent ceux de l'écran ; seules les photos deviennent celles du serveur.
    return { ok: true, draft: { ...source, photos: reloaded.draft.photos }, listingStatus: reloaded.listingStatus };
  } catch (error) {
    return failure(error, fallback);
  }
}

/**
 * Photos dans l'ordre du brouillon : les nouvelles envoyées (déjà réencodées, sans métadonnées), puis les retirées
 * supprimées (ligne et fichier), puis les positions mises à jour (SupabaseListingRepository.syncPhotos).
 */
async function syncPhotos(photos: DraftPhoto[], listingId: string, userId: string, onProgress?: (sent: number, total: number) => void) {
  const folder = `${userId}/${listingId}`;
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  const rows = await supabase.from('listing_photos').select('id, storage_path, position, width, height').eq('listing_id', listingId);
  if (rows.error) throw rows.error;
  const current = (rows.data ?? []) as PhotoRow[];
  const kept: { row: PhotoRow; position: number }[] = [];
  const fresh = photos.filter((photo) => photo.kind === 'new').length;
  let sent = 0;
  onProgress?.(0, fresh);
  for (const [position, photo] of photos.entries()) {
    if (photo.kind === 'stored') {
      const row = current.find((item) => item.id === photo.id);
      if (row) kept.push({ row, position });
      continue;
    }
    const path = `${folder}/${crypto.randomUUID()}.jpg`;
    const upload = await bucket.upload(path, photo.blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (upload.error) throw upload.error;
    const inserted = await supabase.from('listing_photos').insert({ listing_id: listingId, storage_path: path, position, width: photo.width, height: photo.height });
    if (inserted.error) {
      await bucket.remove([path]);
      throw inserted.error;
    }
    sent += 1;
    onProgress?.(sent, fresh);
  }
  const keptIds = new Set(kept.map(({ row }) => row.id));
  const removed = current.filter((row) => !keptIds.has(row.id));
  if (removed.length > 0) {
    const deleted = await supabase.from('listing_photos').delete().in('id', removed.map((row) => row.id));
    if (deleted.error) throw deleted.error;
    await bucket.remove(removed.map((row) => row.storage_path));
  }
  for (const { row, position } of kept) {
    if (row.position === position) continue;
    const moved = await supabase.from('listing_photos').update({ position }).eq('id', row.id);
    if (moved.error) throw moved.error;
  }
}

/** Photos d'une ligne relue, dans l'ordre (utilisé par l'aperçu des photos déjà en ligne). */
export function storedPhotos(row: ListingRow): DraftPhoto[] {
  return sortedPhotos(row).map((photo) => ({ kind: 'stored', id: photo.id, storagePath: photo.storage_path, width: photo.width, height: photo.height }));
}

/** Annonce en ligne (ou sous offre) : la modifier ne change ni son statut ni sa date de publication. */
export function isOnline(status: string | null): boolean {
  return status !== null && ONLINE_STATUSES.includes(status);
}
