import { createStore } from '../../lib/account/session';
import { fetchListing, type ListingRow } from '../../lib/listings';

// Fiche du bien d'une conversation, lue une fois par page (ConversationView.loadListing et
// ConversationDetailsView.loadListing) : le bandeau ne s'ouvre que si elle a pu être lue, et « Détails » en déduit
// si la visite (et la visite en visio) peut être demandée.

export type ListingRowState = { status: 'loading' } | { status: 'ready'; row: ListingRow } | { status: 'unavailable' };

export const listingStore = createStore<Map<string, ListingRowState>>(new Map());

function set(id: string, state: ListingRowState) {
  const next = new Map(listingStore.get());
  next.set(id, state);
  listingStore.set(next);
}

export function loadListingRow(listingId: string) {
  const id = listingId.toLowerCase();
  const current = listingStore.get().get(id);
  if (current && current.status !== 'unavailable') return;
  set(id, { status: 'loading' });
  fetchListing(listingId)
    .then((row) => set(id, { status: 'ready', row }))
    .catch(() => set(id, { status: 'unavailable' }));
}
