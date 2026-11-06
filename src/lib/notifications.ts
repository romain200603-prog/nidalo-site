import { supabase } from './supabase';
import { createStore, currentUserId, sessionStore } from './account/session';
import { conversationPath, listingPath, visitRequestPath } from './paths';

// Centre de notifications du compte, comme Data/NotificationStore.swift : seulement les notifications écrites par
// le serveur (table notifications). Les rappels et les exemples gardés sur l'iPhone ne viennent pas sur le site.

/** Sortes connues de l'app (NidaloNotification.Kind, ImmoDomain/Messaging/VisitRequest.swift:302-308). */
export const NOTIFICATION_KINDS = [
  'newRequest', 'accepted', 'declined', 'proposed', 'rescheduleProposed', 'rescheduled', 'rescheduleDeclined', 'cancelled',
  'reminder', 'searchMatch', 'offerReceived', 'offerCountered', 'offerAccepted', 'offerDeclined', 'offerWithdrawn',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Une ligne de la table notifications, avec les colonnes que lit l'app. */
export type NotificationRow = {
  id: string;
  kind: string;
  request_id: string | null;
  listing_id: string | null;
  conversation_id: string | null;
  offer_id: string | null;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type NidaloNotification = {
  id: string;
  kind: NotificationKind;
  requestId: string | null;
  listingId: string | null;
  conversationId: string | null;
  offerId: string | null;
  title: string;
  body: string;
  /** Date ISO de created_at. */
  date: string;
  isRead: boolean;
};

/** Même lecture que l'app (SupabaseVisitRequestRepository.swift:184-187) : ces colonnes, les plus récentes d'abord, 200 au plus. */
export const NOTIFICATION_COLUMNS = 'id, kind, request_id, listing_id, conversation_id, offer_id, title, body, created_at, read_at';
export const NOTIFICATION_LIMIT = 200;

function isKind(kind: string): kind is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(kind);
}

/** Lignes du serveur → notifications : une sorte inconnue est ignorée, lue = read_at renseigné ; les plus récentes d'abord. */
export function notificationsFromRows(rows: NotificationRow[]): NidaloNotification[] {
  const items: NidaloNotification[] = [];
  for (const row of rows) {
    if (!isKind(row.kind)) continue;
    items.push({
      id: row.id.toLowerCase(),
      kind: row.kind,
      requestId: row.request_id,
      listingId: row.listing_id,
      conversationId: row.conversation_id,
      offerId: row.offer_id,
      title: row.title,
      body: row.body,
      date: row.created_at,
      isRead: row.read_at != null,
    });
  }
  return items.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

/** NotificationStore.unreadCount : les notifications pas encore lues. */
export function unreadNotificationCount(items: NidaloNotification[]): number {
  return items.filter((item) => !item.isRead).length;
}

/**
 * Écran ouvert par une notification, dans l'ordre de l'app (NotificationsView.open, HomeView.swift:409-427) :
 * la conversation (offres), sinon l'annonce (recherches), sinon la demande de visite. `null` : rien à ouvrir.
 */
export function notificationTarget(item: Pick<NidaloNotification, 'conversationId' | 'listingId' | 'requestId'>): string | null {
  if (item.conversationId) return conversationPath(item.conversationId);
  if (item.listingId) return listingPath(item.listingId);
  if (item.requestId) return visitRequestPath(item.requestId);
  return null;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86400],
  ['month', 30 * 86400],
  ['week', 7 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

/** Date relative nommée, comme `.relative(presentation: .named)` de l'app : « il y a 5 minutes », « hier »… */
export function relativeDate(iso: string, now: number = Date.now()): string {
  const format = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });
  const seconds = (Date.parse(iso) - now) / 1000;
  if (!Number.isFinite(seconds)) return '';
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.trunc(seconds / size), unit);
  }
  return format.format(Math.trunc(seconds), 'second');
}

// MARK: - Notifications du compte connecté

export type NotificationsState = { status: 'none' | 'loading' | 'ready'; items: NidaloNotification[] };

export const notificationsStore = createStore<NotificationsState>({ status: 'none', items: [] });

let owner: string | null = null;
/** Changements faits ici (lu, tout lu) : une lecture commencée avant ne doit pas les effacer. */
let changes = 0;
let reading: Promise<void> | null = null;
let readAgain = false;

async function readOnce(): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    owner = null;
    notificationsStore.set({ status: 'none', items: [] });
    return;
  }
  if (owner !== session.userId) {
    owner = session.userId;
    notificationsStore.set({ status: 'loading', items: [] });
  }
  const before = changes;
  const { data, error } = await supabase.from('notifications').select(NOTIFICATION_COLUMNS)
    .order('created_at', { ascending: false }).limit(NOTIFICATION_LIMIT);
  if (currentUserId() !== session.userId) return;
  if (changes !== before) {
    // Lue pendant « Tout lire » ou un clic : on relit après, pour ne pas faire revenir les pastilles.
    readAgain = true;
    return;
  }
  // Comme l'app (`try? … ?? []`) : une lecture refusée laisse la liste vide.
  notificationsStore.set({ status: 'ready', items: error ? [] : notificationsFromRows((data ?? []) as NotificationRow[]) });
}

/** Relit les notifications du serveur (ouverture, temps réel, retour sur l'onglet). Une seule lecture à la fois. */
export function loadNotifications(): Promise<void> {
  if (reading) {
    readAgain = true;
    return reading;
  }
  reading = (async () => {
    try {
      do {
        readAgain = false;
        try {
          await readOnce();
        } catch {
          // Réseau coupé : la liste reste comme elle est, la prochaine relecture la mettra à jour.
        }
      } while (readAgain);
    } finally {
      reading = null;
    }
  })();
  return reading;
}

async function markRemote(ids: string[] | null): Promise<void> {
  changes += 1;
  try {
    // SupabaseVisitRequestRepository.markNotificationsRead : erreur ignorée, comme dans l'app (`try?`).
    await supabase.rpc('mark_notifications_read', { p_ids: ids });
  } catch {
    // Rien : la notification reste lue à l'écran, comme dans l'app.
  } finally {
    changes += 1;
  }
}

/** Toucher une notification : marquée lue tout de suite, puis sur le serveur (NotificationStore.markRead). */
export function markNotificationRead(id: string): Promise<void> {
  const state = notificationsStore.get();
  const item = state.items.find((entry) => entry.id === id);
  if (!item || item.isRead) return Promise.resolve();
  notificationsStore.set({ ...state, items: state.items.map((entry) => (entry.id === id ? { ...entry, isRead: true } : entry)) });
  return markRemote([id]);
}

/** « Tout lire » : toutes marquées lues, puis la fonction du serveur sans liste, p_ids null (NotificationStore.markAllRead). */
export function markAllNotificationsRead(): Promise<void> {
  const state = notificationsStore.get();
  if (!state.items.some((entry) => !entry.isRead)) return Promise.resolve();
  notificationsStore.set({ ...state, items: state.items.map((entry) => (entry.isRead ? entry : { ...entry, isRead: true })) });
  return markRemote(null);
}
