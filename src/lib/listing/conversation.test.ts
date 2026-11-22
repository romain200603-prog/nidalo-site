import { describe, expect, it } from 'vitest';
import { REFUSED_MESSAGE } from '../account/errors';
import { CONVERSATION_FALLBACK, conversationErrorMessage, conversationFrom, listingConversation, type InboxRow } from './conversation';

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

describe('Conversation qui ne s\'ouvre pas (conversationErrorMessage, n° 68)', () => {
  const postgrest = (code: string, message: string) => ({ code, message, details: null, hint: null });

  it('le message du serveur quand il en donne un', () => {
    expect(conversationErrorMessage(postgrest('P0001', 'Cette annonce n\'est plus en ligne.'))).toBe('Cette annonce n\'est plus en ligne.');
    // Autre erreur du serveur : son message, comme RepositoryError.unknown dans l'app.
    expect(conversationErrorMessage(postgrest('PGRST116', 'JSON object requested, multiple (or no) rows returned')))
      .toBe('JSON object requested, multiple (or no) rows returned');
    // Données refusées : le message de l'app.
    for (const code of ['23514', '23502', '22001', '22P02']) expect(conversationErrorMessage(postgrest(code, 'violates check constraint'))).toBe(REFUSED_MESSAGE);
  });

  it('sinon le message de la connexion', () => {
    expect(CONVERSATION_FALLBACK).toBe('La conversation n\'a pas pu s\'ouvrir. Vérifiez votre connexion.');
    // Réseau coupé : postgrest-js rend un code vide.
    expect(conversationErrorMessage({ code: '', message: 'TypeError: Failed to fetch', details: '', hint: '' })).toBe(CONVERSATION_FALLBACK);
    // Droits : aucun texte du serveur.
    expect(conversationErrorMessage(postgrest('42501', 'permission denied for function start_listing_conversation'))).toBe(CONVERSATION_FALLBACK);
    expect(conversationErrorMessage(postgrest('PGRST301', 'JWT expired'))).toBe(CONVERSATION_FALLBACK);
    // Un mot seul n'est pas une phrase.
    expect(conversationErrorMessage(postgrest('P0001', 'refus'))).toBe(CONVERSATION_FALLBACK);
    // Conversation introuvable à la relecture, réponse inattendue, rien.
    expect(conversationErrorMessage(new Error('conversation introuvable à la relecture'))).toBe(CONVERSATION_FALLBACK);
    expect(conversationErrorMessage(null)).toBe(CONVERSATION_FALLBACK);
    expect(conversationErrorMessage(undefined)).toBe(CONVERSATION_FALLBACK);
  });
});
