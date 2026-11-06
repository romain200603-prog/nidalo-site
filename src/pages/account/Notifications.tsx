import { useEffect, type MouseEvent } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { startLiveBadges } from '../../lib/badges';
import { useStore } from '../../lib/account/session';
import {
  markAllNotificationsRead, markNotificationRead, notificationsStore, notificationTarget, relativeDate, unreadNotificationCount,
  type NidaloNotification, type NotificationKind,
} from '../../lib/notifications';
import { EmptyState, ScreenHeader, Spinner } from './parts';

// Centre de notifications sur ordinateur, comme NotificationsView de l'app (HomeView.swift:360-433). Sur téléphone,
// cet écran reste « bientôt » (AccountPage).

/** Icône de chaque sorte, celles de NotificationRow (HomeView.swift:463-472). */
const KIND_ICONS: Record<NotificationKind, IconName> = {
  newRequest: 'calendarPlus',
  accepted: 'calendarCheck',
  rescheduled: 'calendarCheck',
  declined: 'x',
  rescheduleDeclined: 'x',
  cancelled: 'x',
  proposed: 'calendarBlank',
  rescheduleProposed: 'calendarBlank',
  reminder: 'bell',
  searchMatch: 'search',
  offerReceived: 'handshake',
  offerCountered: 'handshake',
  offerAccepted: 'handshake',
  offerDeclined: 'handshake',
  offerWithdrawn: 'handshake',
};

/** Ouvrir une notification : marquée lue, puis son écran (NotificationsView.open). */
async function openNotification(event: MouseEvent<HTMLAnchorElement>, id: string, href: string) {
  // Ouverte dans un autre onglet (Ctrl, ⌘, Maj) : marquée lue, et cette page reste affichée.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    void markNotificationRead(id);
    return;
  }
  event.preventDefault();
  // L'adresse change seulement après la réponse du serveur (1,5 s au plus), pour que la demande parte en entier.
  await Promise.race([markNotificationRead(id), new Promise((resolve) => setTimeout(resolve, 1500))]);
  window.location.assign(href);
}

function NotificationItem({ item }: { item: NidaloNotification }) {
  const target = notificationTarget(item);
  const content = (
    <>
      <span className="notification-icon"><Icon name={KIND_ICONS[item.kind]} /></span>
      <span className="notification-text">
        <span className="notification-head">
          <span className="notification-title">{item.title}</span>
          <time className="notification-date" dateTime={item.date}>{relativeDate(item.date)}</time>
        </span>
        <span className="notification-body">{item.body}</span>
      </span>
      {!item.isRead && <span className="notification-dot" role="img" aria-label="Non lue" />}
    </>
  );
  if (!target) {
    return <button type="button" className="notification-row" onClick={() => void markNotificationRead(item.id)}>{content}</button>;
  }
  return (
    <a
      className="notification-row"
      href={target}
      onClick={(event) => void openNotification(event, item.id, target)}
      onAuxClick={(event) => { if (event.button === 1) void markNotificationRead(item.id); }}
    >
      {content}
    </a>
  );
}

export function NotificationsScreen({ signedIn }: { signedIn: boolean }) {
  const state = useStore(notificationsStore);

  useEffect(() => {
    // Lecture et temps réel partagés avec les pastilles de la barre du haut.
    if (!signedIn) return undefined;
    return startLiveBadges();
  }, [signedIn]);

  const unread = signedIn ? unreadNotificationCount(state.items) : 0;
  const action = unread > 0
    ? <button type="button" className="notifications-read-all" onClick={() => void markAllNotificationsRead()}>Tout lire</button>
    : null;

  let body;
  if (signedIn && state.status !== 'ready') body = <Spinner />;
  else if (!signedIn || state.items.length === 0) {
    body = (
      <EmptyState
        icon="bell"
        title="Aucune notification pour l’instant"
        text={signedIn
          ? 'Les réponses à vos demandes de visite, les rappels et les nouvelles annonces de vos recherches apparaîtront ici.'
          : 'Connectez-vous pour recevoir les réponses à vos demandes de visite et les rappels.'}
      />
    );
  } else {
    body = (
      <ul className="notification-list">
        {state.items.map((item) => <li key={item.id}><NotificationItem item={item} /></li>)}
      </ul>
    );
  }

  return (
    <div className="space notifications-screen">
      <ScreenHeader title="Notifications" action={action} />
      {body}
    </div>
  );
}
