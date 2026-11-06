import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

// Serveur simulé : on garde chaque demande pour vérifier qu'elle est celle de l'app.
const server = vi.hoisted(() => ({
  rows: [] as unknown[],
  queries: [] as { table: string; columns?: string; order?: [string, unknown]; limit?: number }[],
  rpcs: [] as { name: string; args: unknown }[],
}));

vi.mock('./supabase', () => ({
  supabase: {
    from(table: string) {
      const query: (typeof server.queries)[number] = { table };
      server.queries.push(query);
      const builder = {
        select(columns: string) { query.columns = columns; return builder; },
        order(column: string, options: unknown) { query.order = [column, options]; return builder; },
        limit(count: number) { query.limit = count; return Promise.resolve({ data: server.rows, error: null }); },
      };
      return builder;
    },
    rpc(name: string, args: unknown) {
      server.rpcs.push({ name, args });
      return Promise.resolve({ data: null, error: null });
    },
  },
}));

import { sessionStore } from './account/session';
import {
  loadNotifications, markAllNotificationsRead, markNotificationRead, NOTIFICATION_COLUMNS, notificationsFromRows, notificationsStore,
  notificationTarget, relativeDate, unreadNotificationCount, type NotificationRow,
} from './notifications';

function row(overrides: Partial<NotificationRow>): NotificationRow {
  return {
    id: 'd0000000-0000-4000-8000-000000000001', kind: 'accepted', request_id: null, listing_id: null, conversation_id: null,
    offer_id: null, title: 'T2 lumineux', body: 'Votre demande de visite est acceptée.', created_at: '2026-11-06T10:00:00Z', read_at: null,
    ...overrides,
  };
}

describe('notifications : lecture des lignes du serveur, comme l’app', () => {
  it('ignore les sortes inconnues, lit read_at, trie les plus récentes d’abord', () => {
    const items = notificationsFromRows([
      row({ id: 'D0000000-0000-4000-8000-0000000000AA', created_at: '2026-11-05T10:00:00Z', read_at: '2026-11-05T11:00:00Z' }),
      row({ id: 'd0000000-0000-4000-8000-000000000002', kind: 'kindeInconnu' }),
      row({ id: 'd0000000-0000-4000-8000-000000000003', kind: 'offerReceived', created_at: '2026-11-06T12:00:00Z', conversation_id: 'c1' }),
    ]);
    expect(items.map((item) => item.id)).toEqual(['d0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-0000000000aa']);
    expect(items.map((item) => item.isRead)).toEqual([false, true]);
    expect(items[0]).toMatchObject({ kind: 'offerReceived', conversationId: 'c1', title: 'T2 lumineux' });
    expect(unreadNotificationCount(items)).toBe(1);
  });

  it('ouvre la conversation, sinon l’annonce, sinon la demande de visite (NotificationsView.open)', () => {
    expect(notificationTarget({ conversationId: 'c 1', listingId: 'l1', requestId: 'r1' })).toBe('/messages/?c=c%201');
    expect(notificationTarget({ conversationId: null, listingId: 'l1', requestId: 'r1' })).toBe('/annonce/?id=l1');
    expect(notificationTarget({ conversationId: null, listingId: null, requestId: 'r1' })).toBe('/compte/?vue=demande-visite&id=r1');
    expect(notificationTarget({ conversationId: null, listingId: null, requestId: null })).toBeNull();
  });

  it('écrit la date comme .relative(presentation: .named)', () => {
    const now = Date.parse('2026-11-06T12:00:00Z');
    expect(relativeDate('2026-11-06T12:00:00Z', now)).toBe('maintenant');
    expect(relativeDate('2026-11-06T11:55:00Z', now)).toBe('il y a 5 minutes');
    expect(relativeDate('2026-11-06T09:30:00Z', now)).toBe('il y a 2 heures');
    expect(relativeDate('2026-11-05T10:00:00Z', now)).toBe('hier');
    expect(relativeDate('2026-11-03T10:00:00Z', now)).toBe('il y a 3 jours');
    expect(relativeDate('2026-10-28T10:00:00Z', now)).toBe('la semaine dernière');
    expect(relativeDate('2026-08-30T10:00:00Z', now)).toBe('il y a 2 mois');
    expect(relativeDate('2026-11-06T14:30:00Z', now)).toBe('dans 2 heures');
  });
});

describe('notifications du compte : mêmes demandes au serveur que l’app', () => {
  beforeEach(() => {
    server.queries.length = 0;
    server.rpcs.length = 0;
    sessionStore.set({ status: 'signedIn', session: {} as Session, userId: 'a0000000-0000-4000-8000-0000000000c1', email: 'claire.martin@exemple.fr' });
  });

  it('lit la table notifications : ces colonnes, les plus récentes d’abord, 200 au plus', async () => {
    server.rows = [row({}), row({ id: 'd0000000-0000-4000-8000-000000000004', read_at: '2026-11-06T11:00:00Z' })];
    await loadNotifications();
    expect(server.queries).toEqual([{ table: 'notifications', columns: NOTIFICATION_COLUMNS, order: ['created_at', { ascending: false }], limit: 200 }]);
    expect(NOTIFICATION_COLUMNS).toBe('id, kind, request_id, listing_id, conversation_id, offer_id, title, body, created_at, read_at');
    expect(notificationsStore.get().status).toBe('ready');
    expect(unreadNotificationCount(notificationsStore.get().items)).toBe(1);
  });

  it('un clic marque cette notification lue (p_ids : son id), une seule fois', async () => {
    server.rows = [row({}), row({ id: 'd0000000-0000-4000-8000-000000000005' })];
    await loadNotifications();
    await markNotificationRead('d0000000-0000-4000-8000-000000000005');
    await markNotificationRead('d0000000-0000-4000-8000-000000000005');
    expect(server.rpcs).toEqual([{ name: 'mark_notifications_read', args: { p_ids: ['d0000000-0000-4000-8000-000000000005'] } }]);
    expect(unreadNotificationCount(notificationsStore.get().items)).toBe(1);
  });

  it('« Tout lire » envoie p_ids null, et rien quand tout est déjà lu', async () => {
    server.rows = [row({}), row({ id: 'd0000000-0000-4000-8000-000000000006' })];
    await loadNotifications();
    await markAllNotificationsRead();
    expect(server.rpcs).toEqual([{ name: 'mark_notifications_read', args: { p_ids: null } }]);
    expect(unreadNotificationCount(notificationsStore.get().items)).toBe(0);
    await markAllNotificationsRead();
    expect(server.rpcs).toHaveLength(1);
  });

  it('sans compte : rien n’est demandé au serveur', async () => {
    sessionStore.set({ status: 'signedOut' });
    await loadNotifications();
    expect(server.queries).toEqual([]);
    expect(notificationsStore.get()).toEqual({ status: 'none', items: [] });
  });
});
