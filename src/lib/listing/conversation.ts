import { supabase } from '../supabase';

// Conversation d'une annonce avec son vendeur, comme l'app (Data/Supabase/SupabaseMessagingRepository.swift) :
// start_listing_conversation crée la conversation ou rend celle qui existe déjà, puis my_conversations la relit.

/** Colonnes de my_conversations utiles à la fiche (InboxRow). */
export type InboxRow = {
  conversation_id: string;
  kind: string;
  listing_id: string | null;
  listing_snapshot: { listingId?: string | null; transaction?: string | null; title?: string | null; price?: number | string | null } | null;
  buyer_id: string | null;
  seller_id: string | null;
};

/** Conversation d'une annonce, vue par le compte connecté. */
export type ListingConversation = {
  id: string;
  /** Conversation de groupe (jamais négociable). */
  isGroup: boolean;
  /** Bien de la conversation (`listing_snapshot`), ou `null` sans bien. */
  listingId: string | null;
  /** Vente ou location du bien (vente si le serveur ne la donne pas, comme l'app). */
  transaction: 'sale' | 'rent';
  /** Le compte connecté est le vendeur (isSellerSide). */
  isSellerSide: boolean;
  /** Titre et prix du bien enregistrés avec la conversation (ListingSnapshot), repris par la feuille d'offre. */
  title: string | null;
  price: number | null;
};

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Conversation telle que l'app la lit (conversation(from:)) : le bien vient de l'instantané, sinon de listing_id. */
export function conversationFrom(row: InboxRow, me: string | null): ListingConversation {
  const snapshot = row.listing_snapshot;
  const listingId = snapshot ? (snapshot.listingId ?? row.listing_id ?? null) : null;
  return {
    id: row.conversation_id,
    isGroup: row.kind === 'group',
    listingId,
    transaction: snapshot?.transaction === 'rent' ? 'rent' : 'sale',
    isSellerSide: row.kind !== 'group' && same(row.seller_id, me),
    title: typeof snapshot?.title === 'string' ? snapshot.title : null,
    price: price(snapshot?.price),
  };
}

function price(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Conversation déjà ouverte pour cette annonce, sans en créer (listingConversation, ListingDetailView.swift:384). */
export function listingConversation(rows: InboxRow[], listingId: string, me: string | null): ListingConversation | null {
  for (const row of rows) {
    const conversation = conversationFrom(row, me);
    if (!conversation.isGroup && same(conversation.listingId, listingId)) return conversation;
  }
  return null;
}

/** Conversations du compte (my_conversations sans paramètre, comme la barre du haut). */
export async function fetchConversations(): Promise<InboxRow[]> {
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) throw error;
  return (data as InboxRow[] | null) ?? [];
}

/**
 * Ouvre ou crée la conversation avec le vendeur (conversation(forListingId:)) : start_listing_conversation, puis
 * my_conversations pour cette seule conversation. `null` si l'une des deux échoue : l'app ne montre alors rien.
 */
export async function openListingConversation(listingId: string, me: string | null): Promise<ListingConversation | null> {
  const started = await supabase.rpc('start_listing_conversation', { p_listing_id: listingId });
  if (started.error || typeof started.data !== 'string') return null;
  const read = await supabase.rpc('my_conversations', { p_conversation_id: started.data });
  const row = (read.data as InboxRow[] | null)?.[0];
  if (read.error || !row) return null;
  return conversationFrom(row, me);
}
