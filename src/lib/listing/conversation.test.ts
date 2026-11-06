import { describe, expect, it } from 'vitest';
import { conversationFrom, listingConversation, type InboxRow } from './conversation';

const me = 'a0000000-0000-4000-8000-0000000000c1';

function row(overrides: Partial<InboxRow> = {}): InboxRow {
  return {
    conversation_id: 'c1', kind: 'direct', listing_id: 'l1', listing_snapshot: { listingId: 'l1', transaction: 'sale' },
    buyer_id: me, seller_id: 'b0000000-0000-4000-8000-0000000000d2', ...overrides,
  };
}

describe('Conversation d\'une annonce (SupabaseMessagingRepository)', () => {
  it('lue comme l\'app : bien de l\'instantané, vente par défaut, côté vendeur', () => {
    expect(conversationFrom(row(), me)).toEqual({ id: 'c1', isGroup: false, listingId: 'l1', transaction: 'sale', isSellerSide: false, title: null, price: null });
    expect(conversationFrom(row({ listing_snapshot: { listingId: 'l1', title: 'Appartement lumineux', price: 250000 } }), me))
      .toMatchObject({ title: 'Appartement lumineux', price: 250000 });
    expect(conversationFrom(row({ listing_snapshot: { listingId: 'l1', price: '238000' } }), me).price).toBe(238000);
    expect(conversationFrom(row({ listing_snapshot: { transaction: 'rent' } }), me).listingId).toBe('l1');
    expect(conversationFrom(row({ listing_snapshot: { transaction: 'rent' } }), me).transaction).toBe('rent');
    expect(conversationFrom(row({ listing_snapshot: null }), me).listingId).toBeNull();
    expect(conversationFrom(row({ listing_snapshot: { listingId: 'l1', transaction: null } }), me).transaction).toBe('sale');
    expect(conversationFrom(row({ seller_id: me.toUpperCase() }), me).isSellerSide).toBe(true);
    expect(conversationFrom(row({ kind: 'group', seller_id: me }), me)).toMatchObject({ isGroup: true, isSellerSide: false });
  });

  it('conversation déjà ouverte pour l\'annonce, sans les groupes', () => {
    const rows = [row({ conversation_id: 'g', kind: 'group' }), row({ conversation_id: 'c2', listing_snapshot: { listingId: 'l2' } }), row()];
    expect(listingConversation(rows, 'l1', me)?.id).toBe('c1');
    expect(listingConversation(rows, 'L2', me)?.id).toBe('c2');
    expect(listingConversation(rows, 'l3', me)).toBeNull();
  });
});
