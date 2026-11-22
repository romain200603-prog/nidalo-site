import { describe, expect, it } from 'vitest';
import { messageFrom, messageInsert, type Message } from './api';
import { textContent } from './content';
import { conversationFrom, type ServerInboxRow } from './inbox';
import {
  canForward, canReply, DELETED_QUOTE, FORWARD_INVALID, forwardSendTitle, forwardTargets, interactionRefusal, myReaction, quoteText,
  reactionSummary, replyComposerTitle, replyHeader, REPLY_UNAVAILABLE, toggledReactions, toggledTarget,
} from './interactions';

// Mêmes cas que MessageInteractionsTests.swift de l'app (réponses, réactions, transferts ; demande du 17/11).
const ME = 'a0000000-0000-4000-8000-0000000000c1';
const SOPHIE = 'a0000000-0000-4000-8000-0000000000c2';

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1', conversationId: 'c1', senderId: SOPHIE, clientId: 'm1', content: { kind: 'text', text: 'Parfait, je vous confirme la visite.' },
    createdAt: new Date(2026, 10, 16, 10, 0), expiresAt: null, reaction: null, reactions: [], isRead: false, replyToId: null, isForwarded: false,
    raw: null, ...overrides,
  };
}

describe('Réponse (MessageReply)', () => {
  it('citation et en-têtes', () => {
    expect(quoteText(message())).toBe('Parfait, je vous confirme la visite.');
    expect(quoteText(message({ content: { kind: 'image', storagePath: 'x' } }))).toBe('📷 Photo');
    expect(replyHeader({ replierIsMe: true, replierName: 'Vous', quotedIsMine: false, quotedName: 'Sophie' })).toBe('Vous avez répondu à Sophie');
    expect(replyHeader({ replierIsMe: false, replierName: 'Sophie', quotedIsMine: true, quotedName: 'Vous' })).toBe('Sophie vous a répondu');
    expect(replyHeader({ replierIsMe: false, replierName: 'Marc', quotedIsMine: false, quotedName: 'Sophie' })).toBe('Marc a répondu à Sophie');
    expect(replyHeader({ replierIsMe: true, replierName: 'Vous', quotedIsMine: true, quotedName: 'Vous' })).toBe('Vous vous êtes répondu');
    expect(replyHeader({ replierIsMe: false, replierName: 'Marc', quotedIsMine: false, quotedName: 'Marc', isSamePerson: true })).toBe('Marc s\'est répondu');
    // Deux personnes du même prénom : les identifiants décident, pas les noms (n° 241).
    expect(replyHeader({ replierIsMe: false, replierName: 'Marie', quotedIsMine: false, quotedName: 'Marie' })).toBe('Marie a répondu à Marie');
    expect(replyComposerTitle(false, 'Sophie Martin')).toBe('Réponse à Sophie Martin');
    expect(replyComposerTitle(true, 'Vous')).toBe('Réponse à vous-même');
    expect(canReply({ kind: 'system', text: 'Groupe créé' })).toBe(false);
    expect(canReply({ kind: 'file', name: 'DPE.pdf' })).toBe(true);
  });

  it('original supprimé ou expiré : « Message supprimé »', () => {
    expect(quoteText(null)).toBe(DELETED_QUOTE);
    const now = new Date(2026, 10, 16, 12, 0);
    expect(quoteText(message({ expiresAt: new Date(now.getTime() - 60_000) }), now)).toBe('Message supprimé');
  });

  it('colonnes : reply_to_id seulement pour une réponse, forwarded seulement pour un transfert', () => {
    const plain = messageInsert('c1000000-0000-4000-8000-000000000001', 'b2c3d4e5-0000-4000-8000-0000000000aa', textContent('Oui'), 'Oui');
    expect(Object.keys(plain).sort()).toEqual(['client_id', 'content', 'conversation_id', 'id', 'preview']);
    const reply = messageInsert('c1000000-0000-4000-8000-000000000001', 'b2c3d4e5-0000-4000-8000-0000000000aa', textContent('Oui'), 'Oui',
      { replyToId: 'd0000000-0000-4000-8000-00000000000a' });
    expect(reply.reply_to_id).toBe('D0000000-0000-4000-8000-00000000000A');
    expect('forwarded' in reply).toBe(false);
    const forward = messageInsert('c1000000-0000-4000-8000-000000000001', 'b2c3d4e5-0000-4000-8000-0000000000aa', textContent('Oui'), 'Oui', { forwarded: true });
    expect(forward.forwarded).toBe(true);
    expect('reply_to_id' in forward).toBe(false);
  });

  it('lignes du serveur : réponse, transfert, et anciennes lignes sans ces colonnes', () => {
    const base = { id: 'm2', conversation_id: 'c1', sender_id: SOPHIE, kind: 'user', client_id: null, content: textContent('Oui'), created_at: '2026-11-16T10:00:00Z', expires_at: null, message_reactions: [] };
    expect(messageFrom({ ...base, reply_to_id: 'm1', forwarded: true }, ME, null)).toMatchObject({ replyToId: 'm1', isForwarded: true });
    expect(messageFrom(base, ME, null)).toMatchObject({ replyToId: null, isForwarded: false, raw: textContent('Oui') });
  });

  it('refus du serveur reconnus à leur indice', () => {
    expect(interactionRefusal({ code: 'P0001', message: 'x', hint: 'message_reply_unavailable' })).toBe(REPLY_UNAVAILABLE);
    expect(REPLY_UNAVAILABLE).toBe('Le message auquel vous répondez n\'est plus disponible.');
    expect(interactionRefusal({ code: 'P0001', hint: 'message_forward_invalid' })).toBe(FORWARD_INVALID);
    expect(FORWARD_INVALID).toBe('Ce message ne peut pas être transféré.');
    expect(interactionRefusal({ code: '42501' })).toBeNull();
    expect(interactionRefusal(null)).toBeNull();
  });
});

describe('Réactions (MessageReactions)', () => {
  it('ajout, remplacement, retrait', () => {
    const added = toggledReactions([], '👍', ME);
    expect(added.written).toBe('👍');
    expect(myReaction(added.reactions, ME)).toBe('👍');
    const replaced = toggledReactions(added.reactions, '😂', ME);
    expect(replaced.written).toBe('😂');
    expect(replaced.reactions).toHaveLength(1);
    const removed = toggledReactions(replaced.reactions, '😂', ME);
    expect(removed.written).toBeNull();
    expect(removed.reactions).toEqual([]);
  });

  it('l’ancien cœur compte comme ❤️ : toucher ❤️ le retire', () => {
    const row = { id: 'm1', conversation_id: 'c1', sender_id: SOPHIE, kind: 'user', client_id: null, content: textContent('Bonjour'),
      created_at: '2026-11-06T09:30:00Z', expires_at: null, message_reactions: [{ user_id: ME, emoji: '♥', created_at: '2026-11-06T09:31:00Z' }] };
    const read = messageFrom(row, ME, null);
    expect(myReaction(read.reactions, ME)).toBe('❤️');
    expect(toggledReactions(read.reactions, '❤️', ME)).toEqual({ reactions: [], written: null });
    // Un « ♥ » pas encore relu compte aussi comme le cœur rouge.
    expect(toggledReactions([{ userId: ME, emoji: '♥', createdAt: new Date() }], '❤️', ME).written).toBeNull();
  });

  it('pastille : 3 emojis au plus, les plus fréquents puis les plus récents, et le nombre', () => {
    const t = new Date(2026, 10, 16, 10, 0).getTime();
    const at = (seconds: number) => new Date(t + seconds * 1000);
    const summary = reactionSummary([
      { userId: 'a', emoji: '❤️', createdAt: at(0) }, { userId: 'b', emoji: '♥', createdAt: at(0) },
      { userId: 'c', emoji: '😂', createdAt: at(10) }, { userId: 'd', emoji: '👍', createdAt: at(0) },
      { userId: 'e', emoji: '🙏', createdAt: at(-10) },
    ]);
    expect(summary).toEqual({ emojis: ['❤️', '😂', '👍'], count: 5 });
  });
});

describe('Transfert (MessageForwarding)', () => {
  it('5 conversations au plus', () => {
    let selection: string[] = [];
    const ids = ['1', '2', '3', '4', '5', '6'];
    for (const id of ids) selection = toggledTarget(id, selection);
    expect(selection).toEqual(ids.slice(0, 5));
    selection = toggledTarget('1', selection);
    expect(selection).toHaveLength(4);
    expect(forwardSendTitle(2)).toBe('Envoyer à 2 conversations');
    expect(forwardSendTitle(1)).toBe('Envoyer à 1 conversation');
  });

  it('contenus exclus : offres, cartes de visite, lignes système', () => {
    expect(canForward({ kind: 'text', text: 'Bonjour' })).toBe(true);
    expect(canForward({ kind: 'file', name: 'DPE.pdf' })).toBe(true);
    expect(canForward({ kind: 'attachments', items: [], caption: null })).toBe(true);
    expect(canForward({ kind: 'offer', offerId: 'o1' })).toBe(false);
    expect(canForward({ kind: 'visitConfirmed', slot: '', address: 'Lyon' })).toBe(false);
    expect(canForward({ kind: 'visitProposal' })).toBe(false);
    expect(canForward({ kind: 'system', text: 'Groupe créé' })).toBe(false);
  });

  it('conversations proposées : sans celle d’origine ni les comptes bloqués, les plus récentes d’abord', () => {
    const blocked = 'b0000000-0000-4000-8000-0000000000b1';
    const direct = (id: string, other: string, minutes: number) => conversationFrom({
      conversation_id: id, kind: 'direct', other_user_id: other, created_at: '2026-11-01T00:00:00Z',
      last_message_at: new Date(Date.UTC(2026, 10, 16, 10, minutes)).toISOString(),
    } as ServerInboxRow, { me: ME, profiles: new Map(), participants: [], communities: [] });
    const origin = direct('c-origin', SOPHIE, 3);
    const withBlocked = direct('c-blocked', blocked.toUpperCase(), 2);
    const older = direct('c-older', 'a0000000-0000-4000-8000-0000000000c3', 1);
    const newer = direct('c-newer', 'a0000000-0000-4000-8000-0000000000c4', 4);
    const targets = forwardTargets([older, origin, withBlocked, newer], 'c-origin', new Set([blocked]));
    expect(targets.map((conversation) => conversation.id)).toEqual(['c-newer', 'c-older']);
  });
});
