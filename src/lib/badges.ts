import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { isNewAccount } from './account/auth';
import { createStore, currentUserId, sessionStore, useSession, useStore } from './account/session';
import { loadNotifications, notificationsStore, unreadNotificationCount } from './notifications';

// Pastilles rouges de la barre du haut sur ordinateur, comme l'app :
// - Messages : non-lus des conversations non archivées (MessagingStore.swift:36-38, RootTabView.swift:32) ;
// - Notifications : notifications non lues du serveur (NotificationStore.swift:23, cloche de HomeView.swift:303-324).
// Elles suivent le temps réel (MessagingRealtime.swift, AppContainer.swift:207-221) et se relisent quand l'onglet
// redevient visible, comme l'app au retour au premier plan (RootTabView.swift:59-67).

/** Ce que l'on lit d'une ligne de my_conversations (is_archived vient de conversation_preferences, joint par le serveur). */
export type ConversationUnreadRow = { unread_count?: number | null; is_archived?: boolean | null };

/** MessagingStore.unreadTotal : somme des non-lus, sans les conversations archivées. */
export function unreadMessagesTotal(rows: ConversationUnreadRow[]): number {
  return rows.filter((row) => !(row.is_archived ?? false)).reduce((sum, row) => sum + (row.unread_count ?? 0), 0);
}

/** Texte d'une pastille : la cloche passe à « 9+ » au-delà de 9 (HomeView.swift:311) ; Messages affiche le nombre (AppTabBar.swift:48). */
export function badgeText(count: number, capped: boolean): string {
  return capped && count > 9 ? '9+' : String(count);
}

/** Libellés lus par les lecteurs d'écran, ceux de l'app (AppTabBar.swift:91-95, HomeView.swift:323). */
export function messagesLabel(count: number): string {
  return count > 0 ? `Messages, ${count} non lus` : 'Messages';
}

export function notificationsLabel(count: number): string {
  return count > 0 ? `Notifications, ${count} non lues` : 'Notifications';
}

/** Une seule lecture à la fois ; une demande pendant une lecture en relance une seule après elle. */
export function coalesced(run: () => Promise<void>): () => Promise<void> {
  let current: Promise<void> | null = null;
  let again = false;
  return () => {
    if (current) {
      again = true;
      return current;
    }
    current = (async () => {
      try {
        do {
          again = false;
          try {
            await run();
          } catch {
            // Réseau coupé : la pastille garde son dernier nombre connu.
          }
        } while (again);
      } finally {
        current = null;
      }
    })();
    return current;
  };
}

export const unreadMessagesStore = createStore(0);

let messagesOwner: string | null = null;

/** Relit les conversations du compte (RPC my_conversations, sans paramètre, comme SupabaseMessagingRepository). */
export const loadUnreadMessages = coalesced(async () => {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    messagesOwner = null;
    unreadMessagesStore.set(0);
    return;
  }
  if (messagesOwner !== session.userId) {
    messagesOwner = session.userId;
    unreadMessagesStore.set(0);
  }
  const { data, error } = await supabase.rpc('my_conversations');
  if (currentUserId() !== session.userId) return;
  // Comme refreshFromServer (`try?`) : une lecture qui échoue garde le dernier nombre connu.
  if (error || !Array.isArray(data)) return;
  unreadMessagesStore.set(unreadMessagesTotal(data as ConversationUnreadRow[]));
});

/** Tables suivies : celles de l'app qui changent ces nombres (MessagingRealtime.messagingTables et visitTables). */
export const MESSAGE_TABLES = ['messages', 'conversation_participants'] as const;
export const NOTIFICATION_TABLES = ['notifications'] as const;

function channelName(table: string): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${table}-${suffix}`;
}

/** Un canal par groupe de tables : chaque changement relit ; une reconnexion après une coupure relit aussi. */
function follow(tables: readonly string[], onChange: () => void): RealtimeChannel {
  const channel = supabase.channel(channelName(tables[0]));
  for (const table of tables) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange());
  }
  let wasSubscribed = false;
  channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return;
    if (wasSubscribed) onChange();
    wasSubscribed = true;
  });
  return channel;
}

function startLive(): () => void {
  const reloadAll = () => {
    void loadUnreadMessages();
    void loadNotifications();
  };
  reloadAll();
  const channels = [
    follow(MESSAGE_TABLES, () => void loadUnreadMessages()),
    follow(NOTIFICATION_TABLES, () => void loadNotifications()),
  ];
  const onVisible = () => {
    if (document.visibilityState === 'visible') reloadAll();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    for (const channel of channels) void supabase.removeChannel(channel);
  };
}

let users = 0;
let stopLive: (() => void) | null = null;

/** Branche le temps réel des pastilles (une seule fois, même si plusieurs écrans le demandent). */
export function startLiveBadges(): () => void {
  users += 1;
  if (users === 1) stopLive = startLive();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    users -= 1;
    if (users === 0) {
      stopLive?.();
      stopLive = null;
    }
  };
}

export type Badges = { shown: boolean; messages: number; notifications: number };

/**
 * Pastilles de la barre du haut : seulement avec un compte, et pas pendant le choix du profil d'un compte neuf
 * (showsUnreadBadge dans l'app). À appeler seulement sur ordinateur.
 */
export function useBadges(): Badges {
  const session = useSession();
  const userId = session.status === 'signedIn' ? session.userId : null;
  const shown = userId !== null && !isNewAccount();
  useEffect(() => {
    if (!shown) return undefined;
    return startLiveBadges();
  }, [shown, userId]);
  const messages = useStore(unreadMessagesStore);
  const notifications = useStore(notificationsStore);
  return {
    shown,
    messages: shown ? messages : 0,
    notifications: shown && notifications.status === 'ready' ? unreadNotificationCount(notifications.items) : 0,
  };
}
