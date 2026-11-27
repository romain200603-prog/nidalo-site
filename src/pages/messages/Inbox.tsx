import { useState } from 'react';
import { ContentUnavailable } from '../../components/ContentUnavailable';
import { Icon } from '../../components/Icon';
import { LoadErrorState, OfflineState } from '../../components/OfflineState';
import { appDate } from '../../lib/appDates';
import { liveReload } from '../../lib/badges';
import { useDesktop } from '../../lib/desktop';
import { upcomingVisits, type ConversationVisit } from '../../lib/messages/api';
import { keepNumbersTogether, rowTimeLabel, visitCardDate, visitRowDate } from '../../lib/messages/format';
import {
  EMPTY_STATES, filterIncludes, INBOX_FILTERS, isMuted, lastActivity, rowPreview, sameId, type Conversation, type InboxFilter,
} from '../../lib/messages/inbox';
import { isOnline } from '../../lib/messages/presence';
import type { InboxState } from '../../lib/messages/store';
import { accountPath } from '../../lib/paths';
import { Spinner } from '../account/parts';
import { AccountPill } from './MessageInteractions';
import { MessagingSearch } from './MessagingSearch';
import { ConversationAvatar } from './parts';
import { openOnClick, routePath, useRoute } from './route';

// Liste des conversations, comme l'app (MessagesView.swift) : grand titre « Messages » et crayon « Nouveau message »,
// champ « Rechercher un contact ou un bien » qui ouvre la recherche, les cinq filtres en capsules qui défilent sur une
// ligne, la carte « Prochaine visite », puis « Toutes les conversations » dans une carte blanche ; la recherche s'ouvre
// à sa place. Une conversation ouverte passe par-dessus : la liste reste dessous, avec son filtre et sa recherche. À
// partir de 1024 px, la liste reste à côté de la conversation, dont la ligne est marquée (aria-current, fond bleu clair).

/** Texte de l'échec de lecture des conversations (MessagingStore.load, DomiaEmptyState.failed). */
export const INBOX_FAILED = { title: 'Conversations indisponibles', message: 'Vos conversations n\'ont pas pu être chargées. Vérifiez votre connexion, puis réessayez.' };

type Presence = ReadonlyMap<string, ReadonlySet<string>>;

export function Inbox({ inbox, visits, presence, me, onCompose }: {
  inbox: InboxState;
  visits: ConversationVisit[];
  presence: Presence;
  me: string | null;
  onCompose: () => void;
}) {
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [searching, setSearching] = useState(false);
  // Ordinateur : la conversation ouverte à côté de la liste.
  const route = useRoute();
  const current = useDesktop() ? route.conversationId : null;
  const conversations = inbox.status === 'ready' ? inbox.conversations : [];
  // Visites à venir liées à une conversation : filtre « Visites » et carte « Prochaine visite ».
  const upcoming = upcomingVisits(visits, new Date());
  const withVisit = new Set(upcoming.map((visit) => visit.conversationId?.toLowerCase()).filter((id): id is string => !!id));
  const hasVisit = (conversation: Conversation) => withVisit.has(conversation.id.toLowerCase());
  const nextVisit = upcoming.find((visit) => conversations.some((conversation) => sameId(conversation.id, visit.conversationId))) ?? null;
  const nextConversation = nextVisit ? conversations.find((conversation) => sameId(conversation.id, nextVisit.conversationId)) ?? null : null;
  /** Nombre de conversations de chaque filtre (« Tous 5 », « Non lus 2 », « Visites 1 »), comme les capsules de l'app. */
  const countOf = (value: InboxFilter) => conversations.filter((conversation) => filterIncludes(value, conversation, hasVisit(conversation))).length;
  const shown = conversations
    .filter((conversation) => filterIncludes(filter, conversation, hasVisit(conversation)))
    .sort((a, b) => lastActivity(b).getTime() - lastActivity(a).getTime());

  if (searching) {
    return (
      <aside className="dm-side is-searching" aria-label="Recherche">
        <MessagingSearch conversations={conversations} me={me} onCancel={() => setSearching(false)} />
      </aside>
    );
  }

  return (
    <aside className="dm-side" aria-label="Conversations">
      <div className="dm-list-scroll">
        <div className="dm-side-top">
          <header className="dm-side-head">
            <div className="dm-side-title">
              <h1>Messages</h1>
              <p className="dm-side-sub">Vos échanges, votre futur chez-vous.</p>
            </div>
            <button type="button" className="dm-compose" onClick={onCompose} aria-label="Nouveau message" title="Nouveau message">
              <Icon name="pencil" />
            </button>
          </header>

          <button type="button" className="dm-search dm-search-open" onClick={() => setSearching(true)} aria-label="Rechercher un contact ou une annonce">
            <Icon name="search" />
            <span>Rechercher un contact ou un bien</span>
          </button>

          <div className="dm-tabs" role="group" aria-label="Filtres">
            {INBOX_FILTERS.map((option) => {
              const count = countOf(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className="dm-tab"
                  aria-pressed={filter === option.value}
                  aria-label={count > 0 ? `${option.title}, ${count}` : option.title}
                  onClick={() => setFilter(option.value)}
                >
                  {option.title}
                  {count > 0 && <span className="dm-tab-count" aria-hidden="true">{count}</span>}
                </button>
              );
            })}
          </div>

          {nextVisit && nextConversation && filter !== 'archived' && (
            <section className="dm-next-visit" aria-labelledby="dm-prochaine-visite">
              <div className="dm-section-head">
                <h2 id="dm-prochaine-visite">Prochaine visite</h2>
                <a className="dm-section-link" href={accountPath('agenda')}>Voir l'agenda<Icon name="chevronRight" /></a>
              </div>
              <NextVisitCard visit={nextVisit} conversation={nextConversation} />
            </section>
          )}
        </div>

        <h2 className="dm-list-title">Toutes les conversations</h2>
        <InboxList inbox={inbox} shown={shown} filter={filter} presence={presence} me={me} current={current} />
      </div>
    </aside>
  );
}

/**
 * Carte de la prochaine visite (NextVisitCard) : photo de 64, pastille d'état, date et heure en gras, « bien · ville ·
 * avec X », chevron ; elle ouvre la conversation.
 */
function NextVisitCard({ visit, conversation }: { visit: ConversationVisit; conversation: Conversation }) {
  const photo = visit.listing?.coverUrl ?? conversation.listing?.coverUrl ?? null;
  const [failed, setFailed] = useState(false);
  const pill = visit.status === 'confirmed' ? { text: 'Visite confirmée', tone: 'green' }
    : { text: visit.status === 'toConfirm' ? 'Visite à confirmer' : 'Visite en attente', tone: 'amber' };
  const meta = [conversation.listing?.title, conversation.listing?.city, `avec ${conversation.counterpart.name}`].filter((part) => !!part).join(' · ');
  return (
    <a className="dm-next-card" href={routePath({ conversationId: conversation.id })} onClick={openOnClick(conversation.id)}
      aria-description="Ouvre la conversation">
      <span className="dm-next-photo" aria-hidden="true">
        {photo && !failed ? <img src={photo} alt="" onError={() => setFailed(true)} /> : <Icon name="building" />}
      </span>
      <span className="dm-next-text">
        <span className={`dm-pill is-${pill.tone}`}>{pill.text}</span>
        <span className="dm-next-date">{visitCardDate(visit.start)}</span>
        <span className="dm-next-meta">{meta}</span>
      </span>
      <Icon name="chevronRight" className="icon dm-chevron" />
    </a>
  );
}

function InboxList({ inbox, shown, filter, presence, me, current }: {
  inbox: InboxState;
  shown: Conversation[];
  filter: InboxFilter;
  presence: Presence;
  me: string | null;
  /** Ordinateur : la conversation ouverte à côté de la liste. */
  current: string | null;
}) {
  // Premier chargement : la roue de l'app, pas « Aucune conversation » (n° 209).
  if (inbox.status === 'loading') return <ListSkeleton />;
  // Conversations jamais lues : « Pas de connexion Internet » faute de connexion, sinon « Conversations indisponibles »
  // (n° 95) ; « Réessayer » les relit.
  if (inbox.status === 'error') {
    return inbox.offline ? <OfflineState onRetry={() => void liveReload()} />
      : <LoadErrorState title={INBOX_FAILED.title} message={INBOX_FAILED.message} onRetry={() => void liveReload()} />;
  }
  if (shown.length === 0) {
    const empty = EMPTY_STATES[filter];
    return <ContentUnavailable className="dm-list-empty" icon={filter === 'archived' ? 'archive' : 'messages'} title={empty.title} text={empty.message} />;
  }
  return (
    <ul className="dm-list" aria-label="Conversations">
      {shown.map((conversation) => (
        <li key={conversation.id}>
          <ConversationRow
            conversation={conversation}
            online={!conversation.isGroup && isOnline(presence, conversation.id, conversation.otherUserId)}
            me={me}
            current={sameId(conversation.id, current)}
          />
        </li>
      ))}
    </ul>
  );
}

/** Liste en cours de lecture : la roue de l'app (ProgressView). */
export function ListSkeleton() {
  return <Spinner label="Chargement des conversations" />;
}

/**
 * Ligne (ConversationRow de l'app) : avatar de 46 px avec le point vert « en ligne », nom en gras et « Pro » ou
 * « Particulier », heure (bleue s'il y a des non-lus), la petite maison et le bien (ou le rôle), puis le dernier message
 * et la pastille des non-lus (grise en sourdine), ou la cloche barrée d'une conversation en sourdine.
 */
function ConversationRow({ conversation, online, me, current }: { conversation: Conversation; online: boolean; me: string | null; current: boolean }) {
  const unread = conversation.unreadCount > 0;
  const subtitle = conversation.counterpart.subtitle;
  const activity = lastActivity(conversation);
  return (
    <a
      className="dm-row"
      href={routePath({ conversationId: conversation.id })}
      onClick={openOnClick(conversation.id)}
      aria-current={current ? 'true' : undefined}
    >
      <ConversationAvatar conversation={conversation} size={46} fontSize={15} online={online} />
      <span className="dm-row-main">
        <span className="dm-row-top">
          <span className="dm-row-name">{conversation.counterpart.name}</span>
          <AccountPill conversation={conversation} />
          <time className={`dm-row-time${unread ? ' is-unread' : ''}`} dateTime={activity.toISOString()}>{rowTimeLabel(activity)}</time>
        </span>
        {subtitle && <span className="dm-row-listing"><Icon name="house" /><span>{subtitle}</span></span>}
        <span className="dm-row-bottom">
          <RowPreview conversation={conversation} me={me} unread={unread} />
          {unread ? (
            <span
              className={`dm-unread${isMuted(conversation) ? ' is-muted' : ''}`}
              aria-label={conversation.unreadCount > 1 ? `${conversation.unreadCount} messages non lus` : '1 message non lu'}
            >
              {conversation.unreadCount}
            </span>
          ) : isMuted(conversation) && <span className="dm-row-muted" role="img" aria-label="En sourdine"><Icon name="bellOff" /></span>}
        </span>
      </span>
    </a>
  );
}

/**
 * Dernier message (ConversationRow.preview) : une visite confirmée en vert avec le calendrier, un fichier avec son
 * icône, sinon « Vous : » et les coches devant mes messages (grise pour envoyé, deux coches bleues pour vu).
 */
function RowPreview({ conversation, me, unread }: { conversation: Conversation; me: string | null; unread: boolean }) {
  const weight = unread ? ' is-unread' : '';
  const last = conversation.lastMessage;
  if (!last) return <span className="dm-row-preview is-empty"><span>{rowPreview(conversation, me).text}</span></span>;
  const { content } = last;
  if (content.kind === 'visitConfirmed') {
    const slot = appDate(content.slot);
    return (
      <span className="dm-row-preview is-visit">
        <Icon name="calendar" />
        <span>{slot ? `Visite confirmée · ${visitRowDate(slot)}` : 'Visite confirmée'}</span>
      </span>
    );
  }
  if (content.kind === 'file') {
    return <span className={`dm-row-preview is-file${weight}`}><Icon name="fileText" /><span>{content.name}</span></span>;
  }
  const { text, mine } = rowPreview(conversation, me);
  const check = mine && (
    <span className={`dm-row-check${last.isRead ? ' is-read' : ''}`} role="img" aria-label={last.isRead ? 'Vu' : 'Envoyé'}>
      <Icon name={last.isRead ? 'checkCheck' : 'check'} />
    </span>
  );
  return <span className={`dm-row-preview${weight}`}>{check}<span>{keepNumbersTogether(text)}</span></span>;
}
