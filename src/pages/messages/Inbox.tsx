import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { liveReload } from '../../lib/badges';
import { formatPrice } from '../../lib/format';
import type { OfferRow } from '../../lib/listing/offers';
import { keepNumbersTogether, rowTimeLabel } from '../../lib/messages/format';
import {
  EMPTY_STATES, filterIncludes, isMuted, lastActivity, matchesListSearch, rowPreview, sameId, SITE_INBOX_FILTERS, unreadConversationCount,
  type Conversation, type InboxFilter,
} from '../../lib/messages/inbox';
import type { InboxState } from '../../lib/messages/store';
import {
  latestRequestAfter, requestActivity, requestPreview, requestsIn, type ConversationVisitRequest,
} from '../../lib/messages/visitRequests';
import { ConversationAvatar } from './parts';
import { openOnClick, routePath } from './route';

// Colonne de gauche (360 px sur ordinateur, tout l'écran sur téléphone) : « Messages » et « Nouveau message »,
// recherche par nom ou par titre d'annonce, filtres Toutes / Non lues / Archivées, puis les conversations, la plus
// récente en haut. La conversation ouverte est surlignée.

type Row = { conversation: Conversation; request: ConversationVisitRequest | null; activity: Date };

export function Inbox({ inbox, offers, visitRequests, me, selectedId, onCompose }: {
  inbox: InboxState;
  offers: OfferRow[];
  visitRequests: ConversationVisitRequest[];
  me: string | null;
  selectedId: string | null;
  onCompose: () => void;
}) {
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [query, setQuery] = useState('');
  const conversations = inbox.status === 'ready' ? inbox.conversations : [];
  const unread = unreadConversationCount(conversations);
  // Une demande de visite plus récente que le dernier message tient lieu de dernier message (aperçu, heure, rang).
  const rows: Row[] = conversations
    .filter((conversation) => filterIncludes(filter, conversation, false) && matchesListSearch(conversation, query))
    .map((conversation) => {
      const request = latestRequestAfter(requestsIn(visitRequests, conversation), conversation.lastMessageAt);
      return { conversation, request, activity: request ? requestActivity(request) : lastActivity(conversation) };
    })
    .sort((a, b) => b.activity.getTime() - a.activity.getTime());

  return (
    <aside className="dm-side" aria-label="Conversations">
      <div className="dm-side-top">
        <header className="dm-side-head">
          <h1>Messages</h1>
          <button type="button" className="dm-compose" onClick={onCompose} aria-label="Nouveau message" title="Nouveau message">
            <Icon name="squarePen" />
          </button>
        </header>

        <label className="dm-search">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            placeholder="Rechercher une conversation"
            aria-label="Rechercher une conversation (nom ou annonce)"
            autoComplete="off"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('');
            }}
          />
          {query && (
            <button type="button" className="dm-search-clear" onClick={() => setQuery('')} aria-label="Effacer la recherche" title="Effacer la recherche">
              <Icon name="x" />
            </button>
          )}
        </label>

        <div className="dm-tabs" role="group" aria-label="Filtres">
          {SITE_INBOX_FILTERS.map((option) => {
            const count = option.value === 'unread' ? unread : 0;
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
      </div>

      <div className="dm-list-scroll">
        <InboxList inbox={inbox} rows={rows} filter={filter} searching={query.trim() !== ''} offers={offers} me={me} selectedId={selectedId} />
      </div>
    </aside>
  );
}

function InboxList({ inbox, rows, filter, searching, offers, me, selectedId }: {
  inbox: InboxState;
  rows: Row[];
  filter: InboxFilter;
  searching: boolean;
  offers: OfferRow[];
  me: string | null;
  selectedId: string | null;
}) {
  if (inbox.status === 'loading') return <ListSkeleton />;
  if (inbox.status === 'error') {
    return (
      <div className="dm-inbox-empty" role="alert">
        <p>Impossible de charger vos messages. Réessayez dans un instant.</p>
        <button type="button" className="dm-link-button" onClick={() => void liveReload()}>Réessayer</button>
      </div>
    );
  }
  if (rows.length === 0) {
    const empty = searching
      ? { title: 'Aucune conversation trouvée', message: 'Essayez un autre nom ou un autre titre d\'annonce.' }
      : EMPTY_STATES[filter];
    return (
      <div className="dm-inbox-empty">
        <Icon name={searching ? 'search' : filter === 'archived' ? 'archive' : 'messages'} />
        <h3>{empty.title}</h3>
        <p>{empty.message}</p>
      </div>
    );
  }
  return (
    <ul className="dm-list" aria-label="Conversations">
      {rows.map((row) => (
        <li key={row.conversation.id}>
          <ConversationRow row={row} offers={offers} me={me} selected={sameId(row.conversation.id, selectedId)} />
        </li>
      ))}
    </ul>
  );
}

/** Liste en cours de lecture : six lignes grises (avatar, nom, aperçu). */
export function ListSkeleton() {
  const widths = [[62, 80], [48, 66], [70, 58], [55, 74], [40, 62], [66, 50]];
  return (
    <div className="dm-skel-list" role="status" aria-label="Chargement des conversations">
      {widths.map(([name, preview], index) => (
        <div key={index} className="dm-skel-row" aria-hidden="true">
          <span className="dm-skel dm-skel-avatar" />
          <span className="dm-skel-lines">
            <span className="dm-skel dm-skel-line" style={{ width: `${name}%` }} />
            <span className="dm-skel dm-skel-line is-thin" style={{ width: `${preview}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Ligne : avatar de 48 px, nom et heure, titre de l'annonce, dernier message, pastille des non-lus. */
function ConversationRow({ row, offers, me, selected }: { row: Row; offers: OfferRow[]; me: string | null; selected: boolean }) {
  const { conversation, request, activity } = row;
  const unread = conversation.unreadCount > 0;
  return (
    <a
      className="dm-row"
      href={routePath({ conversationId: conversation.id })}
      aria-current={selected ? 'true' : undefined}
      onClick={openOnClick(conversation.id)}
    >
      <ConversationAvatar conversation={conversation} size={48} />
      <span className="dm-row-main">
        <span className="dm-row-top">
          <span className="dm-row-name">{conversation.counterpart.name}</span>
          <time className={`dm-row-time${unread ? ' is-unread' : ''}`} dateTime={activity.toISOString()}>{rowTimeLabel(activity)}</time>
        </span>
        {conversation.listing && <span className="dm-row-listing">{conversation.listing.title}</span>}
        <span className="dm-row-bottom">
          <RowPreview conversation={conversation} request={request} offers={offers} me={me} unread={unread} />
          {unread && (
            <span className={`dm-unread${isMuted(conversation) ? ' is-muted' : ''}`} aria-label={`${conversation.unreadCount} non lus`}>
              {conversation.unreadCount}
            </span>
          )}
        </span>
      </span>
    </a>
  );
}

/**
 * Dernier message : « Vous : » devant les miens ; une offre en tag vert « Offre » puis le montant ; une demande de
 * visite plus récente que le dernier message en « Demande de visite · sam. 15 nov. à 10:00 ».
 */
function RowPreview({ conversation, request, offers, me, unread }: {
  conversation: Conversation;
  request: ConversationVisitRequest | null;
  offers: OfferRow[];
  me: string | null;
  unread: boolean;
}) {
  const weight = unread ? ' is-unread' : '';
  if (request) {
    const mine = sameId(request.requester.userId, me);
    return <span className={`dm-row-preview${weight}`}><span>{`${mine ? 'Vous : ' : ''}${requestPreview(request)}`}</span></span>;
  }
  const last = conversation.lastMessage;
  if (!last) return <span className="dm-row-preview is-empty"><span>{rowPreview(conversation, me).text}</span></span>;
  const mine = sameId(last.senderId, me) && last.content.kind !== 'system';
  if (last.content.kind === 'offer') {
    const offerId = last.content.offerId;
    const offer = offers.find((item) => sameId(item.id, offerId)) ?? null;
    return (
      <span className={`dm-row-preview${weight}`}>
        {mine && <>{<span>Vous :</span>}{' '}</>}
        <span className="dm-tag">Offre</span>{' '}
        <span>{offer ? keepNumbersTogether(`${formatPrice(Number(offer.amount))} proposés`) : ''}</span>
      </span>
    );
  }
  return <span className={`dm-row-preview${weight}`}><span>{keepNumbersTogether(rowPreview(conversation, me).text)}</span></span>;
}
