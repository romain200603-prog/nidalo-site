import { useEffect } from 'react';
import { supabase } from '../supabase';
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
  favoritesStore.set({ status: 'ready', items: (data ?? []) as Favorite[] });
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
