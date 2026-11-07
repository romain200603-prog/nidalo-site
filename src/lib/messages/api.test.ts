import { beforeEach, describe, expect, it, vi } from 'vitest';

// Appels au serveur de la messagerie : mêmes tables, fonctions, colonnes et arguments que l'app
// (SupabaseMessagingRepository.swift, MessageAttachmentFiles.swift, OfferStore). Le client Supabase est simulé :
// chaque appel est noté tel quel.

type Chain = [string, ...unknown[]][];
type Call = { table: string; chain: Chain } | { rpc: string; params: unknown } | { bucket: string; method: string; args: unknown[] };

const server = vi.hoisted(() => ({ calls: [] as Call[], results: {} as Record<string, unknown> }));

vi.mock('../supabase', () => {
  const from = (table: string) => {
    const call = { table, chain: [] as Chain };
    server.calls.push(call);
    const proxy: object = new Proxy({}, {
      get(_target, key) {
        if (key === 'then') {
          return (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
            Promise.resolve(server.results[table] ?? { data: [], error: null }).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          call.chain.push([String(key), ...args]);
          return proxy;
        };
      },
    });
    return proxy;
  };
  const rpc = (name: string, params?: unknown) => {
    server.calls.push({ rpc: name, params });
    return Promise.resolve(server.results[`rpc/${name}`] ?? { data: [], error: null });
  };
  const storage = {
    from: (bucket: string) => ({
      upload: (...args: unknown[]) => {
        server.calls.push({ bucket, method: 'upload', args });
        return Promise.resolve({ data: { path: args[0] }, error: null });
      },
      createSignedUrl: (...args: unknown[]) => {
        server.calls.push({ bucket, method: 'createSignedUrl', args });
        return Promise.resolve({ data: { signedUrl: 'https://exemple.test/fichier-signe' }, error: null });
      },
    }),
  };
  return { supabase: { from, rpc, storage } };
});

import { answerOffer, sendCounterOffer } from '../listing/offers';
import {
  blockUser, fetchConversationVisits, fetchInboxRows, fetchMessages, findAccountByPhone, insertMessage, markConversationRead, MESSAGE_COLUMNS,
  messageInsert, PARTICIPANT_COLUMNS, reportConversation, savePreferences, setReaction, startDirectConversation, startPhoneConversation, unblockUser,
} from './api';
import { textContent } from './content';
import { signedUrl, uploadPending } from './files';

const ME = 'a0000000-0000-4000-8000-0000000000c1';
const OTHER = 'a0000000-0000-4000-8000-0000000000e1';
const CONVERSATION = 'c1000000-0000-4000-8000-000000000001';
const UPPER = CONVERSATION.toUpperCase();

beforeEach(() => {
  server.calls.length = 0;
  server.results = {};
});

describe('Lectures (inbox, messages, agenda)', () => {
  it('my_conversations sans paramètre, ou avec p_conversation_id en majuscules', async () => {
    await fetchInboxRows();
    await fetchInboxRows(CONVERSATION);
    expect(server.calls).toEqual([{ rpc: 'my_conversations', params: {} }, { rpc: 'my_conversations', params: { p_conversation_id: UPPER } }]);
  });

  it('les 200 derniers messages avec leurs réactions, puis les membres pour les coches', async () => {
    server.results.messages = { data: [], error: null };
    await fetchMessages(CONVERSATION, ME);
    expect(server.calls).toEqual([
      { table: 'messages', chain: [['select', MESSAGE_COLUMNS], ['eq', 'conversation_id', UPPER], ['order', 'created_at', { ascending: false }], ['limit', 200]] },
      { table: 'conversation_participants', chain: [['select', PARTICIPANT_COLUMNS], ['eq', 'conversation_id', UPPER]] },
    ]);
    expect(MESSAGE_COLUMNS).toBe('id, conversation_id, sender_id, kind, client_id, content, created_at, expires_at, message_reactions(user_id, emoji, created_at)');
  });

  it('agenda : les colonnes de l’app', async () => {
    await fetchConversationVisits();
    expect(server.calls).toEqual([{ table: 'agenda_visits', chain: [['select', 'id, start_at, status, request_id, listing_id, visit']] }]);
  });
});

describe('Écritures', () => {
  it('envoi : insert des colonnes de l’app, puis la ligne enregistrée', async () => {
    const insert = messageInsert(CONVERSATION, 'b2c3d4e5-0000-4000-8000-0000000000aa', textContent('Bonjour'), 'Bonjour');
    server.results.messages = {
      data: { id: insert.id.toLowerCase(), conversation_id: CONVERSATION, sender_id: ME, kind: 'text', client_id: insert.client_id, content: insert.content, created_at: '2026-11-06T09:45:00Z', expires_at: null, message_reactions: [] },
      error: null,
    };
    const sent = await insertMessage(insert, ME);
    expect(server.calls).toEqual([{ table: 'messages', chain: [['insert', insert], ['select', MESSAGE_COLUMNS], ['single']] }]);
    expect(insert).toEqual({ id: 'B2C3D4E5-0000-4000-8000-0000000000AA', conversation_id: UPPER, client_id: 'B2C3D4E5-0000-4000-8000-0000000000AA', content: { text: { _0: 'Bonjour' } }, preview: 'Bonjour' });
    expect(sent).toMatchObject({ senderId: ME, content: { kind: 'text', text: 'Bonjour' }, isRead: false });
  });

  it('conversation lue : mark_conversation_read ; un échec est ignoré', async () => {
    server.results['rpc/mark_conversation_read'] = Promise.reject(new Error('hors ligne'));
    await markConversationRead(CONVERSATION);
    expect(server.calls).toEqual([{ rpc: 'mark_conversation_read', params: { p_conversation_id: UPPER } }]);
  });

  it('cœur : upsert sur message_id,user_id, ou suppression de ma réaction', async () => {
    await setReaction('d0000000-0000-4000-8000-00000000000a', '♥', ME);
    await setReaction('d0000000-0000-4000-8000-00000000000a', null, ME);
    expect(server.calls).toEqual([
      { table: 'message_reactions', chain: [['upsert', { message_id: 'D0000000-0000-4000-8000-00000000000A', emoji: '♥' }, { onConflict: 'message_id,user_id' }]] },
      { table: 'message_reactions', chain: [['delete'], ['eq', 'message_id', 'D0000000-0000-4000-8000-00000000000A'], ['eq', 'user_id', ME.toUpperCase()]] },
    ]);
  });

  it('réglages : relus (my_conversations), puis tous réécrits dans conversation_preferences', async () => {
    server.results['rpc/my_conversations'] = {
      data: [{ conversation_id: CONVERSATION, is_archived: false, is_favorite: true, muted_until: null, saves_photos: true, cleared_at: '2026-11-01T08:00:00+00:00' }],
      error: null,
    };
    await savePreferences(CONVERSATION, (current) => ({ ...current, isArchived: true }));
    expect(server.calls).toEqual([
      { rpc: 'my_conversations', params: { p_conversation_id: UPPER } },
      {
        table: 'conversation_preferences',
        chain: [['upsert', { conversation_id: UPPER, is_archived: true, is_favorite: true, muted_until: null, saves_photos: true, cleared_at: '2026-11-01T08:00:00.000Z' }, { onConflict: 'conversation_id,user_id' }]],
      },
    ]);
  });

  it('blocage, déblocage, signalement', async () => {
    await blockUser(OTHER);
    await unblockUser(OTHER, ME);
    await reportConversation('e1000000-0000-4000-8000-000000000001', CONVERSATION, 'scam', null);
    await reportConversation('e1000000-0000-4000-8000-000000000002', CONVERSATION, 'other', 'Demande un virement avant la visite.');
    expect(server.calls).toEqual([
      { table: 'user_blocks', chain: [['insert', { blocked_id: OTHER.toUpperCase() }]] },
      { table: 'user_blocks', chain: [['delete'], ['eq', 'blocker_id', ME.toUpperCase()], ['eq', 'blocked_id', OTHER.toUpperCase()]] },
      { table: 'reports', chain: [['insert', { id: 'E1000000-0000-4000-8000-000000000001', target_type: 'conversation', target_id: UPPER, reason: 'scam' }]] },
      { table: 'reports', chain: [['insert', { id: 'E1000000-0000-4000-8000-000000000002', target_type: 'conversation', target_id: UPPER, reason: 'other', details: 'Demande un virement avant la visite.' }]] },
    ]);
  });

  it('nouvelle discussion : par numéro, ou avec une agence', async () => {
    server.results['rpc/start_phone_conversation'] = { data: CONVERSATION, error: null };
    server.results['rpc/start_direct_conversation'] = { data: CONVERSATION, error: null };
    expect(await findAccountByPhone('0639985678')).toBeNull();
    expect(await startPhoneConversation('0639985678')).toBe(CONVERSATION);
    expect(await startDirectConversation(OTHER)).toBe(CONVERSATION);
    expect(server.calls).toEqual([
      { rpc: 'find_account_by_phone', params: { p_phone: '0639985678' } },
      { rpc: 'start_phone_conversation', params: { p_phone: '0639985678' } },
      { rpc: 'start_direct_conversation', params: { p_user_id: OTHER.toUpperCase() } },
    ]);
  });

  it('offres : accept_offer, decline_offer (motif omis s’il est vide), withdraw_offer, counter_offer', async () => {
    const row = { data: [{ id: 'f1' }], error: null };
    for (const name of ['accept_offer', 'decline_offer', 'withdraw_offer', 'counter_offer']) server.results[`rpc/${name}`] = row;
    await answerOffer('f1000000-0000-4000-8000-00000000000a', 'accept');
    await answerOffer('f1000000-0000-4000-8000-00000000000a', 'decline', '  ');
    await answerOffer('f1000000-0000-4000-8000-00000000000a', 'decline', ' Prix trop bas ');
    await answerOffer('f1000000-0000-4000-8000-00000000000a', 'withdraw');
    await sendCounterOffer({ p_id: 'AB', p_parent_offer_id: 'CD', p_amount: 232000 });
    const id = 'F1000000-0000-4000-8000-00000000000A';
    expect(server.calls).toEqual([
      { rpc: 'accept_offer', params: { p_offer_id: id } },
      { rpc: 'decline_offer', params: { p_offer_id: id } },
      { rpc: 'decline_offer', params: { p_offer_id: id, p_reason: 'Prix trop bas' } },
      { rpc: 'withdraw_offer', params: { p_offer_id: id } },
      { rpc: 'counter_offer', params: { p_id: 'AB', p_parent_offer_id: 'CD', p_amount: 232000 } },
    ]);
  });
});

describe('Fichiers (bucket message-attachments)', () => {
  it('document envoyé tel quel, au chemin de l’app, avec le type de l’app', async () => {
    const file = new File(['%PDF-1.4 essai'], 'Compromis.pdf');
    const attachment = await uploadPending({
      id: 'A1', kind: 'document', fileName: 'Compromis.pdf', file, byteCount: file.size, category: 'saleAgreement', previewUrl: null, durationSeconds: null, error: null,
    }, UPPER);
    const [upload] = server.calls as { bucket: string; method: string; args: [string, Blob, unknown] }[];
    expect(upload.bucket).toBe('message-attachments');
    expect(upload.method).toBe('upload');
    expect(upload.args[0]).toMatch(/^c1000000-0000-4000-8000-000000000001\/[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\.pdf$/);
    expect(upload.args[1].type).toBe('application/pdf');
    expect(await upload.args[1].text()).toBe('%PDF-1.4 essai');
    expect(upload.args[2]).toEqual({ cacheControl: '3600', contentType: 'application/pdf' });
    expect(attachment).toEqual({ id: 'A1', kind: 'document', fileName: 'Compromis.pdf', storagePath: upload.args[0], byteCount: file.size, category: 'saleAgreement' });
  });

  it('un fichier qui ne correspond pas à son extension n’est pas envoyé', async () => {
    const file = new File(['MZ exécutable'], 'Plan.pdf');
    await expect(uploadPending({
      id: 'A2', kind: 'document', fileName: 'Plan.pdf', file, byteCount: file.size, category: null, previewUrl: null, durationSeconds: null, error: null,
    }, UPPER)).rejects.toThrow('Le contenu de ce fichier ne correspond pas à son format : il n\'a pas été envoyé.');
    expect(server.calls).toEqual([]);
  });

  it('lecture par URL signée de 10 minutes, demandée une fois par fichier', async () => {
    expect(await signedUrl('c1000000-0000-4000-8000-000000000001/P.jpg')).toBe('https://exemple.test/fichier-signe');
    expect(await signedUrl('c1000000-0000-4000-8000-000000000001/P.jpg')).toBe('https://exemple.test/fichier-signe');
    expect(server.calls).toEqual([{ bucket: 'message-attachments', method: 'createSignedUrl', args: ['c1000000-0000-4000-8000-000000000001/P.jpg', 600] }]);
  });
});
