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

/** Ligne de my_conversations : la page Messages lit toutes ses colonnes, la pastille seulement ses non-lus. */
export type ConversationRow = ConversationUnreadRow & { conversation_id: string } & Record<string, unknown>;

/**
 * Dernières lignes de my_conversations du compte, partagées par la pastille et la page Messages (une seule lecture
 * pour les deux). `failed` : la première lecture a échoué ; `local` : lignes changées sur place (conversation lue).
 */
export type ConversationRows = { userId: string | null; rows: ConversationRow[] | null; failed: boolean; local: boolean };

export const conversationRowsStore = createStore<ConversationRows>({ userId: null, rows: null, failed: false, local: false });

function setRows(next: ConversationRows) {
  conversationRowsStore.set(next);
  // Un abonné a pu changer les lignes entre-temps (conversation ouverte marquée lue) : la pastille suit les dernières.
  const { rows } = conversationRowsStore.get();
  unreadMessagesStore.set(rows ? unreadMessagesTotal(rows) : 0);
}

let messagesOwner: string | null = null;

/** Relit les conversations du compte (RPC my_conversations, sans paramètre, comme SupabaseMessagingRepository). */
export const loadUnreadMessages = coalesced(async () => {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    messagesOwner = null;
    setRows({ userId: null, rows: null, failed: false, local: false });
    return;
  }
  if (messagesOwner !== session.userId) {
    messagesOwner = session.userId;
    setRows({ userId: session.userId, rows: null, failed: false, local: false });
  }
  const { data, error } = await supabase.rpc('my_conversations');
  if (currentUserId() !== session.userId) return;
  // Comme refreshFromServer (`try?`) : une lecture qui échoue garde le dernier nombre connu.
  if (error || !Array.isArray(data)) {
    const current = conversationRowsStore.get();
    if (!current.rows) setRows({ ...current, failed: true });
    return;
  }
  setRows({ userId: session.userId, rows: data as ConversationRow[], failed: false, local: false });
});

const sameConversation = (row: ConversationRow, id: string) => String(row.conversation_id).toLowerCase() === id.toLowerCase();

/**
 * Change une conversation sur place, sans relire le serveur (conversation lue, archivée…) : la pastille suit tout de
 * suite, comme dans l'app (MessagingStore modifie sa liste avant d'appeler le serveur).
 */
export function patchConversationRow(id: string, patch: Record<string, unknown>, { toTop = false }: { toTop?: boolean } = {}) {
  const current = conversationRowsStore.get();
  if (!current.rows?.some((row) => sameConversation(row, id))) return;
  const rows = current.rows.map((row) => (sameConversation(row, id) ? { ...row, ...patch } : row));
  // Message envoyé : la conversation remonte en tête de liste, comme dans l'app (MessagingStore.send).
  if (toTop) rows.sort((a, b) => Number(sameConversation(b, id)) - Number(sameConversation(a, id)));
  setRows({ ...current, local: true, rows });
}

const messagingListeners = new Set<() => void>();

/**
 * Chaque changement reçu en temps réel (ou au retour sur l'onglet) : après la relecture des conversations, la page
 * Messages relit aussi la conversation ouverte et les offres (refreshFromServer puis offers.refreshRemote).
 */
export function onMessagingChange(listener: () => void): () => void {
  messagingListeners.add(listener);
  return () => messagingListeners.delete(listener);
}

let notifyPending = false;

/** Relecture déclenchée par le temps réel : conversations, puis la page Messages si elle écoute. */
export function liveReload(): Promise<void> {
  const run = loadUnreadMessages();
  if (!notifyPending) {
    notifyPending = true;
    void run.then(() => {
      notifyPending = false;
      for (const listener of [...messagingListeners]) listener();
    });
  }
  return run;
}

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
export function follow(tables: readonly string[], onChange: () => void): RealtimeChannel {
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
  void loadUnreadMessages();
  void loadNotifications();
  const channels = [
    follow(MESSAGE_TABLES, () => void liveReload()),
    follow(NOTIFICATION_TABLES, () => void loadNotifications()),
  ];
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    void liveReload();
    void loadNotifications();
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
