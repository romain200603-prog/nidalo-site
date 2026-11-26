import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ContentUnavailable } from '../../components/ContentUnavailable';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { GroupCard, SectionLabel } from '../../components/MenuRows';
import { PageHeader } from '../../components/PageHeader';
import { startLiveNotifications } from '../../lib/badges';
import { useStore } from '../../lib/account/session';
import {
  markAllNotificationsRead, markNotificationRead, NOTIFICATION_DAY_TITLES, notificationGroups, notificationPhoto, notificationsStore,
  notificationTarget, notificationTimeLabel, notificationTone, unreadNotificationCount, type NidaloNotification, type NotificationKind,
} from '../../lib/notifications';
import { PATHS } from '../../lib/paths';
import { Spinner } from './parts';

// Centre de notifications, comme l'app (NotificationsView, Features/Home/HomeView.swift) : en-tête de page poussée avec
// « Tout lire », notifications réunies par jour (Aujourd'hui, Hier, Cette semaine, Plus anciennes) dans des cartes de
// groupe ; chaque ligne avec son point bleu si elle n'est pas lue, son carré d'icône teinté, l'heure, le texte et la
// photo du bien. Le même écran sur toutes les largeurs.

/** Icône de chaque sorte, celles de NotificationRow. */
const KIND_ICONS: Record<NotificationKind, IconName> = {
  newRequest: 'calendarPlus',
  visitSlotsOpened: 'calendarPlus',
  accepted: 'calendarCheck',
  rescheduled: 'calendarCheck',
  declined: 'x',
  rescheduleDeclined: 'x',
  cancelled: 'x',
  proposed: 'calendarBlank',
  rescheduleProposed: 'calendarBlank',
  reminder: 'bell',
  searchMatch: 'home',
  offerReceived: 'euro',
  offerCountered: 'euro',
  offerAccepted: 'euro',
  offerDeclined: 'euro',
  offerWithdrawn: 'euro',
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

/**
 * Ligne (NotificationRow) : point bleu de 7 si non lue, carré d'icône teinté de 40, titre en gras (2 lignes au plus),
 * heure à droite, texte gris, et la première photo du bien (46) quand la notification concerne une annonce.
 */
function NotificationItem({ item, time, photo }: { item: NidaloNotification; time: string; photo: string | null }) {
  const target = notificationTarget(item);
  const label = [item.isRead ? null : 'Non lue', item.title, item.body, time].filter(Boolean).join(', ');
  const content = (
    <>
      <span className={item.isRead ? 'notification-dot-space' : 'notification-dot'} aria-hidden="true" />
      <span className={`notification-icon app-tone-${notificationTone(item.kind)}`} aria-hidden="true"><Icon name={KIND_ICONS[item.kind]} /></span>
      <span className="notification-text">
        <span className="notification-head">
          <span className="notification-title">{item.title}</span>
          <time className="notification-date" dateTime={item.date}>{time}</time>
        </span>
        <span className="notification-body">{item.body}</span>
      </span>
      {item.listingId && (
        <span className="notification-photo" aria-hidden="true">{photo ? <img src={photo} alt="" loading="lazy" /> : <Icon name="image" />}</span>
      )}
    </>
  );
  if (!target) {
    return <button type="button" className="notification-row" aria-label={label} onClick={() => void markNotificationRead(item.id)}>{content}</button>;
  }
  return (
    <a
      className="notification-row"
      href={target}
      aria-label={label}
      onClick={(event) => void openNotification(event, item.id, target)}
      onAuxClick={(event) => { if (event.button === 1) void markNotificationRead(item.id); }}
    >
      {content}
    </a>
  );
}

export function NotificationsScreen({ signedIn }: { signedIn: boolean }) {
  const state = useStore(notificationsStore);
  const [photos, setPhotos] = useState<Map<string, string>>(() => new Map());
  const asked = useRef(new Set<string>());

  useEffect(() => {
    if (!signedIn) return undefined;
    // Les notifications seules, lues puis suivies en direct (pas de pastilles à tenir à jour).
    return startLiveNotifications();
  }, [signedIn]);

  // Première photo de chaque bien, lue une fois (la liste ne l'attend pas).
  const listingIds = signedIn ? [...new Set(state.items.flatMap((item) => (item.listingId ? [item.listingId.toLowerCase()] : [])))].join(',') : '';
  useEffect(() => {
    for (const id of listingIds.split(',')) {
      if (!id || asked.current.has(id)) continue;
      asked.current.add(id);
      void notificationPhoto(id).then((url) => {
        if (url) setPhotos((current) => new Map(current).set(id, url));
      });
    }
  }, [listingIds]);

  const unread = signedIn ? unreadNotificationCount(state.items) : 0;
  const readAll = unread > 0
    ? <button type="button" className="notifications-read-all" onClick={() => void markAllNotificationsRead()}>Tout lire</button>
    : null;

  let body;
  if (signedIn && state.status !== 'ready') body = <Spinner />;
  else if (!signedIn || state.items.length === 0) {
    body = (
      <ContentUnavailable
        icon="bell"
        title="Aucune notification pour l’instant"
        text={signedIn
          ? 'Les réponses à vos demandes de visite, les rappels et les nouvelles annonces de vos recherches apparaîtront ici.'
          : 'Connectez-vous pour recevoir les réponses à vos demandes de visite et les rappels.'}
      />
    );
  } else {
    const now = new Date();
    body = (
      <div className="notification-list">
        {notificationGroups(state.items, now).map((group) => (
          <section key={group.day} className={`notification-group${group.day === 'today' ? ' is-today' : ''}`} aria-label={NOTIFICATION_DAY_TITLES[group.day]}>
            <SectionLabel title={NOTIFICATION_DAY_TITLES[group.day]} />
            <GroupCard separatorInset={76}>
              {group.items.map((item) => (
                <li key={item.id}>
                  <NotificationItem item={item} time={notificationTimeLabel(item.date, now)}
                    photo={item.listingId ? photos.get(item.listingId.toLowerCase()) ?? null : null} />
                </li>
              ))}
            </GroupCard>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="notifications-screen">
      <PageHeader title="Notifications" back={PATHS.account} trailing={readAll} />
      {body}
    </div>
  );
}
