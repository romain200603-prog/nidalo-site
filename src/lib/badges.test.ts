import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const server = vi.hoisted(() => ({
  conversations: [] as unknown[],
  error: null as unknown,
  rpcs: [] as { name: string; args: unknown[] }[],
}));

vi.mock('./supabase', () => ({
  supabase: {
    rpc(name: string, ...args: unknown[]) {
      server.rpcs.push({ name, args });
      return Promise.resolve(server.error ? { data: null, error: server.error } : { data: server.conversations, error: null });
    },
  },
}));

import { sessionStore } from './account/session';
import {
  badgeText, coalesced, conversationRowsStore, loadUnreadMessages, messagesLabel, notificationsLabel, patchConversationRow, unreadMessagesStore,
  unreadMessagesTotal,
} from './badges';

describe('pastilles : mêmes nombres que l’app', () => {
  it('Messages : somme des non-lus, sans les conversations archivées (MessagingStore.unreadTotal)', () => {
    expect(unreadMessagesTotal([
      { unread_count: 2, is_archived: false },
      { unread_count: 5, is_archived: true },
      { unread_count: 1, is_archived: null },
      { unread_count: null, is_archived: false },
      {},
    ])).toBe(3);
    expect(unreadMessagesTotal([])).toBe(0);
  });

  it('la cloche passe à « 9+ » au-delà de 9 ; Messages affiche le nombre', () => {
    expect(badgeText(9, true)).toBe('9');
    expect(badgeText(10, true)).toBe('9+');
    expect(badgeText(12, false)).toBe('12');
  });

  it('libellés de l’app pour les lecteurs d’écran', () => {
    expect(messagesLabel(0)).toBe('Messages');
    expect(messagesLabel(3)).toBe('Messages, 3 non lus');
    expect(notificationsLabel(0)).toBe('Notifications');
    expect(notificationsLabel(2)).toBe('Notifications, 2 non lues');
  });

  it('une seule lecture à la fois, et une seule relecture après', async () => {
    let runs = 0;
    let release: () => void = () => undefined;
    const reload = coalesced(() => {
      runs += 1;
      return new Promise<void>((resolve) => { release = resolve; });
    });
    const first = reload();
    void reload();
    void reload();
    expect(runs).toBe(1);
    release();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runs).toBe(2);
    release();
    await first;
    expect(runs).toBe(2);
  });
});

describe('pastille Messages : RPC my_conversations, comme l’app', () => {
  beforeEach(() => {
    server.rpcs.length = 0;
    server.error = null;
    sessionStore.set({ status: 'signedIn', session: {} as Session, userId: 'a0000000-0000-4000-8000-0000000000c1', email: 'claire.martin@exemple.fr' });
  });

  it('appelle my_conversations sans paramètre et compte les non-lus', async () => {
    server.conversations = [{ conversation_id: 'c1', unread_count: 2, is_archived: false }, { conversation_id: 'c2', unread_count: 4, is_archived: true }];
    await loadUnreadMessages();
    expect(server.rpcs).toEqual([{ name: 'my_conversations', args: [] }]);
    expect(unreadMessagesStore.get()).toBe(2);
  });

  it('une lecture qui échoue garde le dernier nombre connu (refreshFromServer)', async () => {
    server.conversations = [{ conversation_id: 'c1', unread_count: 3, is_archived: false }];
    await loadUnreadMessages();
    server.error = { message: 'réseau coupé' };
    await loadUnreadMessages();
    expect(unreadMessagesStore.get()).toBe(3);
  });

  it('conversation ouverte marquée lue à l’arrivée des lignes : la pastille suit les lignes changées', async () => {
    server.conversations = [{ conversation_id: 'c1', unread_count: 2, is_archived: false }, { conversation_id: 'c2', unread_count: 1, is_archived: false }];
    // Comme la page Messages : la conversation ouverte passe à 0 dès que les lignes arrivent.
    const stop = conversationRowsStore.subscribe(() => {
      const row = conversationRowsStore.get().rows?.find((item) => item.conversation_id === 'c1');
      if (row && (row.unread_count ?? 0) > 0) patchConversationRow('c1', { unread_count: 0 });
    });
    await loadUnreadMessages();
    stop();
    expect(conversationRowsStore.get().rows?.map((row) => row.unread_count)).toEqual([0, 1]);
    expect(unreadMessagesStore.get()).toBe(1);
  });

  it('sans compte : 0, sans rien demander', async () => {
    sessionStore.set({ status: 'signedOut' });
    await loadUnreadMessages();
    expect(server.rpcs).toEqual([]);
    expect(unreadMessagesStore.get()).toBe(0);
  });
});
