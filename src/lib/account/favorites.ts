import { useEffect } from 'react';
import { KEEPALIVE_HEADER, supabase } from '../supabase';
import { FavoriteRemovals, UNDO_DURATION, type PendingRemoval } from './favoriteRemovals';
import { requireAccount } from './gate';
import { createStore, currentUserId, sessionStore, useSession, useStore } from './session';

// Favoris (table favorites), comme Data/FavoritesStore.swift : ajouter demande un compte, retirer jamais.
// Le cœur change tout de suite ; si le serveur refuse, il revient comme avant, sans message.

export type Favorite = { listing_id: string; created_at: string };

export type FavoritesState = { status: 'none' | 'loading' | 'ready' | 'error'; items: Favorite[] };

export const favoritesStore = createStore<FavoritesState>({ status: 'none', items: [] });

let loadedFor: string | null = null;

export async function loadFavorites(force = false): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    loadedFor = null;
    favoritesStore.set({ status: 'none', items: [] });
    return;
  }
  if (!force && loadedFor === session.userId && favoritesStore.get().status !== 'error') return;
  loadedFor = session.userId;
  if (favoritesStore.get().status !== 'ready') favoritesStore.set({ status: 'loading', items: [] });
  const { data, error } = await supabase.from('favorites').select('listing_id, created_at').order('created_at', { ascending: true });
  if (currentUserId() !== session.userId) return;
  if (error) {
    loadedFor = null;
    favoritesStore.set({ status: 'error', items: [] });
    return;
  }
  // Un retrait encore annulable n'est pas encore parti : le favori reste retiré de la liste.
  const pendingId = removals.pending?.id;
  favoritesStore.set({ status: 'ready', items: ((data ?? []) as Favorite[]).filter((item) => item.listing_id !== pendingId) });
}

export function isFavorite(listingId: string): boolean {
  return favoritesStore.get().items.some((item) => item.listing_id === listingId);
}

function setItems(items: Favorite[]) {
  favoritesStore.set({ status: 'ready', items });
}

async function add(listingId: string) {
  await loadFavorites();
  if (isFavorite(listingId)) return;
  // Retiré dans Vos favoris il y a moins de 4 s : rien n'est encore parti, il revient avec sa date d'ajout.
  if (removals.pending?.id === listingId) {
    undoRemoval();
    return;
  }
  const before = favoritesStore.get().items;
  setItems([...before, { listing_id: listingId, created_at: new Date().toISOString() }]);
  const { error } = await supabase.from('favorites').upsert({ listing_id: listingId }, { onConflict: 'user_id,listing_id', ignoreDuplicates: true });
  if (error) setItems(favoritesStore.get().items.filter((item) => item.listing_id !== listingId));
}

export async function removeFavorite(listingId: string) {
  const removed = favoritesStore.get().items.find((item) => item.listing_id === listingId);
  if (!removed) return;
  setItems(favoritesStore.get().items.filter((item) => item.listing_id !== listingId));
  const { error } = await supabase.from('favorites').delete().eq('listing_id', listingId);
  if (error && !isFavorite(listingId)) setItems([...favoritesStore.get().items, removed]);
}

// Retrait annulable de l'onglet Favoris (FavoritesStore.removeUndoably de l'app, demande du 17/11) : la carte part
// tout de suite ; le serveur n'apprend le retrait qu'à la fin du message « Retiré des favoris » (4 s), quand la page
// est quittée ou cachée (flushPendingRemoval), ou au retrait suivant. Refusé par le serveur : le favori revient.

const removals = new FavoriteRemovals();
let removalTimer: number | undefined;

/** Retire le favori de la liste, sans rien envoyer encore. Faux si l'annonce n'était pas en favori. */
export function removeUndoably(listingId: string): boolean {
  const removed = favoritesStore.get().items.find((item) => item.listing_id === listingId);
  if (!removed) return false;
  const previous = removals.remove(listingId, removed.created_at, Date.now());
  if (previous) send(previous);
  setItems(favoritesStore.get().items.filter((item) => item.listing_id !== listingId));
  window.clearTimeout(removalTimer);
  const deadline = removals.pending?.deadline ?? Date.now();
  removalTimer = window.setTimeout(() => {
    const due = removals.expire(Math.max(Date.now(), deadline));
    if (due) send(due);
  }, UNDO_DURATION);
  return true;
}

/** « Annuler » : le dernier favori retiré revient à sa place, avec sa date d'ajout d'origine ; rien n'est envoyé. */
export function undoRemoval() {
  window.clearTimeout(removalTimer);
  const restored = removals.undo();
  if (restored) restore(restored);
}

/** Page quittée ou cachée : le retrait en attente part tout de suite. Vrai s'il y en avait un. */
export function flushPendingRemoval(): boolean {
  window.clearTimeout(removalTimer);
  const pending = removals.flush();
  if (pending) send(pending, true);
  return pending !== null;
}

function send(removal: PendingRemoval, keepalive = false) {
  if (!currentUserId()) return;
  const request = supabase.from('favorites').delete().eq('listing_id', removal.id);
  void (keepalive ? request.setHeader(KEEPALIVE_HEADER, '1') : request).then(({ error }) => {
    // Le serveur a refusé : le favori revient, comme pour un retrait direct.
    if (error) restore(removal);
  });
}

function restore(removal: PendingRemoval) {
  const items = favoritesStore.get().items;
  if (items.some((item) => item.listing_id === removal.id)) return;
  const byId = new Map(items.map((item) => [item.listing_id, item]));
  byId.set(removal.id, { listing_id: removal.id, created_at: removal.addedAt });
  const order = FavoriteRemovals.restoring(removal.id, removal.addedAt, items.map((item) => item.listing_id),
    new Map(items.map((item) => [item.listing_id, item.created_at])));
  setItems(order.map((id) => byId.get(id)!));
}

/** Toucher un cœur : retire le favori, ou l'ajoute (après connexion si besoin). */
export function toggleFavorite(listingId: string) {
  if (currentUserId() && isFavorite(listingId)) {
    void removeFavorite(listingId);
    return;
  }
  void requireAccount(() => void add(listingId));
}

/** Favoris du compte, chargés dès que la session est connue. */
export function useFavorites(): FavoritesState {
  const session = useSession();
  useEffect(() => {
    if (session.status !== 'loading') void loadFavorites();
  }, [session.status, session.status === 'signedIn' ? session.userId : null]);
  return useStore(favoritesStore);
}
