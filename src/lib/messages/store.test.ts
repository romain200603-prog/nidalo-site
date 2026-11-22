import { beforeEach, describe, expect, it, vi } from 'vitest';

// Conversation ouverte et envois, comme MessagingStore de l'app : pages plus anciennes en remontant (n° 19), renvoi
// sans doublon (n° 99), transfert partiel (n° 211), archive annulée quand l'enregistrement échoue (n° 210). Le client
// Supabase est simulé : chaque appel est noté, chaque réponse est calculée par le test (données inventées).

type Chain = [string, ...unknown[]][];
type Call = { table: string; chain: Chain };

const server = vi.hoisted(() => ({
  calls: [] as { table: string; chain: [string, ...unknown[]][] }[],
  respond: (() => ({ data: [], error: null })) as (table: string, chain: [string, ...unknown[]][]) => unknown,
  rpc: {} as Record<string, unknown>,
}));

vi.mock('../supabase', () => {
  const from = (table: string) => {
    const call = { table, chain: [] as [string, ...unknown[]][] };
    server.calls.push(call);
    const proxy: object = new Proxy({}, {
      get(_target, key) {
        if (key === 'then') {
          return (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
            Promise.resolve().then(() => server.respond(table, call.chain)).then(resolve, reject);
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
    server.calls.push({ table: `rpc/${name}`, chain: [['rpc', params]] });
    return Promise.resolve(server.rpc[name] ?? { data: [], error: null });
  };
  return { supabase: { from, rpc } };
});
vi.mock('../account/session', async (original) => ({
  ...(await original<typeof import('../account/session')>()),
  currentUserId: () => 'a0000000-0000-4000-8000-0000000000c1',
}));

import { conversationRowsStore } from '../badges';
import { MESSAGE_PAGE, type MessageRow } from './api';
import { forwardMessage, loadOlderMessages, openConversation, reloadThread, sendText, setArchived, threadStore } from './store';

const ME = 'a0000000-0000-4000-8000-0000000000c1';
const OTHER = 'a0000000-0000-4000-8000-0000000000e1';
const CONVERSATION = 'c1000000-0000-4000-8000-000000000001';
const START = Date.parse('2026-11-01T08:00:00Z');

/** `count` messages de l'interlocuteur, un par minute. */
function history(count: number): MessageRow[] {
  return Array.from({ length: count }, (_, index) => {
    const id = `d0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    return {
      id, conversation_id: CONVERSATION.toUpperCase(), sender_id: OTHER.toUpperCase(), kind: 'text', client_id: id,
      content: { text: { _0: `Message ${index}` } }, created_at: new Date(START + index * 60_000).toISOString(), expires_at: null,
      message_reactions: [],
    } as unknown as MessageRow;
  });
}

const option = (chain: Chain, name: string) => chain.find(([key]) => key === name);

/** Réponse du serveur pour `messages` : tri du plus récent, borne `lt`, limite, comme PostgREST. */
function messagesServer(rows: MessageRow[]) {
  return (table: string, chain: Chain) => {
    if (table === 'conversation_participants') return { data: [], error: null };
    if (table !== 'messages') return { data: [], error: null };
    const before = option(chain, 'lt')?.[2] as string | undefined;
    const limit = (option(chain, 'limit')?.[1] as number | undefined) ?? 1000;
    const data = rows
      .filter((row) => !before || Date.parse(row.created_at) < Date.parse(before))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit);
    return { data, error: null };
  };
}

async function settled(check: () => boolean) {
  for (let attempt = 0; attempt < 50 && !check(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  server.calls.length = 0;
  server.respond = () => ({ data: [], error: null });
  server.rpc = {};
  openConversation(null);
});

describe('pages plus anciennes (loadOlderMessages, n° 19)', () => {
  it('les 200 derniers à l’ouverture, puis 200 de plus en remontant, sans doublon, jusqu’au premier', async () => {
    const rows = history(450);
    server.respond = messagesServer(rows);
    openConversation(CONVERSATION);
    await settled(() => threadStore.get().status === 'ready');
    expect(threadStore.get().messages).toHaveLength(MESSAGE_PAGE);
    expect(threadStore.get().complete).toBe(false);
    expect(threadStore.get().messages[0].id).toBe(rows[250].id);

    server.calls.length = 0;
    expect(await loadOlderMessages(CONVERSATION)).toBe(true);
    const [page] = server.calls as Call[];
    // Borne « +1 s » sans fractions, comme l'app : le plus ancien affiché revient, il est écarté par son identifiant.
    expect(option(page.chain, 'lt')).toEqual(['lt', 'created_at', '2026-11-01T12:10:01Z']);
    expect(threadStore.get().messages).toHaveLength(399);
    expect(new Set(threadStore.get().messages.map((message) => message.id)).size).toBe(399);
    expect(threadStore.get().messages[0].id).toBe(rows[51].id);
    expect(threadStore.get().complete).toBe(false);

    expect(await loadOlderMessages(CONVERSATION)).toBe(true);
    expect(threadStore.get().messages).toHaveLength(450);
    expect(threadStore.get().messages[0].id).toBe(rows[0].id);
    expect(threadStore.get().complete).toBe(true);
    const ordered = threadStore.get().messages.map((message) => message.createdAt.getTime());
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));

    // Tout est lu : plus rien n'est demandé.
    server.calls.length = 0;
    expect(await loadOlderMessages(CONVERSATION)).toBe(false);
    expect(server.calls).toEqual([]);
  });

  it('une relecture (temps réel) garde les pages plus anciennes déjà lues', async () => {
    const rows = history(450);
    server.respond = messagesServer(rows);
    openConversation(CONVERSATION);
    await settled(() => threadStore.get().status === 'ready');
    await loadOlderMessages(CONVERSATION);
    expect(threadStore.get().messages).toHaveLength(399);

    rows.push(...history(452).slice(450));
    reloadThread();
    await settled(() => threadStore.get().messages.length === 401);
    expect(threadStore.get().messages).toHaveLength(401);
    expect(threadStore.get().messages[0].id).toBe(rows[51].id);
    expect(threadStore.get().messages.at(-1)?.id).toBe(rows[451].id);
    expect(threadStore.get().complete).toBe(false);
  });

  it('conversation courte : tout est lu dès l’ouverture, rien n’est demandé en remontant', async () => {
    server.respond = messagesServer(history(12));
    openConversation(CONVERSATION);
    await settled(() => threadStore.get().status === 'ready');
    expect(threadStore.get()).toMatchObject({ status: 'ready', complete: true });
    server.calls.length = 0;
    expect(await loadOlderMessages(CONVERSATION)).toBe(false);
    expect(server.calls).toEqual([]);
  });
});

describe('envois (MessagingStore.send, forward)', () => {
  const inserts = () => (server.calls as Call[])
    .filter((call) => call.table === 'messages' && option(call.chain, 'insert'))
    .map((call) => option(call.chain, 'insert')?.[1] as { client_id: string; conversation_id: string; forwarded?: boolean });

  it('un renvoi après un échec reprend l’identifiant de l’envoi raté (n° 99)', async () => {
    let fail = true;
    server.respond = (table, chain) => {
      const insert = option(chain, 'insert')?.[1] as { id: string; client_id: string; content: unknown } | undefined;
      if (table !== 'messages' || !insert) return { data: [], error: null };
      if (fail) return { data: null, error: { code: '08006', message: 'hors ligne' } };
      return {
        data: { id: insert.id, conversation_id: CONVERSATION, sender_id: ME, kind: 'text', client_id: insert.client_id, content: insert.content, created_at: '2026-11-06T09:45:00Z', expires_at: null, message_reactions: [] },
        error: null,
      };
    };
    expect(await sendText(CONVERSATION, 'Bonjour, le bien est-il disponible ?')).toEqual({ sent: false, refusal: null });
    fail = false;
    expect(await sendText(CONVERSATION, ' Bonjour, le bien est-il disponible ? ')).toEqual({ sent: true });
    expect(await sendText(CONVERSATION, 'Bonjour, le bien est-il disponible ?')).toEqual({ sent: true });
    const [failed, retried, next] = inserts();
    expect(retried.client_id).toBe(failed.client_id);
    expect(next.client_id).not.toBe(failed.client_id);
  });

  it('transfert vers trois conversations : celles qui ont échoué sont rendues (n° 211)', async () => {
    const targets = ['c2000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000003', 'c4000000-0000-4000-8000-000000000004'];
    server.respond = (table, chain) => {
      const insert = option(chain, 'insert')?.[1] as { id: string; client_id: string; content: unknown; conversation_id: string } | undefined;
      if (table !== 'messages' || !insert) return { data: [], error: null };
      if (insert.conversation_id === targets[1].toUpperCase()) return { data: null, error: { code: '08006', message: 'hors ligne' } };
      return {
        data: { id: insert.id, conversation_id: insert.conversation_id, sender_id: ME, kind: 'text', client_id: insert.client_id, content: insert.content, created_at: '2026-11-06T09:45:00Z', expires_at: null, forwarded: true, message_reactions: [] },
        error: null,
      };
    };
    const message = {
      id: 'm1', conversationId: CONVERSATION, senderId: OTHER, clientId: 'm1', content: { kind: 'text' as const, text: 'Visite samedi 10 h' },
      createdAt: new Date(START), expiresAt: null, reaction: null, reactions: [], isRead: false, replyToId: null, isForwarded: false,
      raw: { text: { _0: 'Visite samedi 10 h' } },
    };
    expect(await forwardMessage(message, targets)).toEqual({ sent: 2, failed: [targets[1]], refusal: null });
    expect(inserts().map((insert) => insert.forwarded)).toEqual([true, true, true]);
    const banned = { code: 'P0001', message: 'Ce texte contient un mot interdit. Modifiez-le pour continuer.', hint: 'contenu_interdit' };
    server.respond = (table, chain) => (table === 'messages' && option(chain, 'insert') ? { data: null, error: banned } : { data: [], error: null });
    expect(await forwardMessage(message, targets.slice(0, 1))).toEqual({ sent: 0, failed: [targets[0]], refusal: banned.message });
  });
});

describe('réglages (setArchived, n° 210)', () => {
  it('archivée sur place, puis remise comme avant si l’enregistrement échoue', async () => {
    conversationRowsStore.set({ userId: ME, rows: [{ conversation_id: CONVERSATION, is_archived: false, unread_count: 0 }], failed: false, local: false });
    server.rpc.my_conversations = { data: [{ conversation_id: CONVERSATION, is_archived: false, is_favorite: false, muted_until: null }], error: null };
    let seen: unknown = null;
    server.respond = (table) => {
      if (table !== 'conversation_preferences') return { data: [], error: null };
      seen = conversationRowsStore.get().rows?.[0].is_archived;
      return { data: null, error: { code: '08006', message: 'hors ligne' } };
    };
    expect(await setArchived(CONVERSATION, true)).toBe(false);
    expect(seen).toBe(true);
    expect(conversationRowsStore.get().rows?.[0].is_archived).toBe(false);
    server.respond = (table) => (table === 'conversation_preferences' ? { data: null, error: null } : { data: [], error: null });
    expect(await setArchived(CONVERSATION, true)).toBe(true);
    expect(conversationRowsStore.get().rows?.[0].is_archived).toBe(true);
  });
});
