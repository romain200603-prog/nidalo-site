import { useRef, useState } from 'react';
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
import { AccountPill } from './MessageInteractions';
import { ConversationAvatar } from './parts';
import { openOnClick, routePath } from './route';
import { ListingConversations, SearchActivity } from './SearchActivity';

// Colonne de gauche (360 px sur ordinateur, tout l'écran sur téléphone) : « Messages » et « Nouveau message »,
// recherche par nom ou par titre d'annonce, filtres Toutes / Non lues / Archivées, puis les conversations, la plus
// récente en haut. La conversation ouverte est surlignée. Les morceaux sont ceux de l'app (MessagesView.swift ;
// demande du 17/11) : sous-titre, crayon, champ blanc, filtres en capsules avec leur nombre, lignes avec « Pro » ou
// « Particulier » et la petite maison ; la recherche ouverte montre « Votre activité immobilière ».

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
  // Recherche ouverte (« Annuler » la referme) et « Discussions liées aux annonces ».
  const [searching, setSearching] = useState(false);
  const [linked, setLinked] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const conversations = inbox.status === 'ready' ? inbox.conversations : [];
  const unread = unreadConversationCount(conversations);
  /** Nombre de conversations de chaque filtre (« Toutes 5 », « Non lues 2 »), comme les capsules de l'app. */
  const countOf = (value: InboxFilter) => (value === 'unread' ? unread : conversations.filter((conversation) => filterIncludes(value, conversation, false)).length);
  const cancelSearch = () => {
    setQuery('');
    setSearching(false);
    field.current?.blur();
  };
  // Une demande de visite plus récente que le dernier message tient lieu de dernier message (aperçu, heure, rang).
  const rows: Row[] = conversations
    .filter((conversation) => filterIncludes(filter, conversation, false) && matchesListSearch(conversation, query))
    .map((conversation) => {
      const request = latestRequestAfter(requestsIn(visitRequests, conversation), conversation.lastMessageAt);
      return { conversation, request, activity: request ? requestActivity(request) : lastActivity(conversation) };
    })
    .sort((a, b) => b.activity.getTime() - a.activity.getTime());

  if (linked) {
    return (
      <aside className="dm-side" aria-label="Conversations">
        <ListingConversations conversations={conversations} onBack={() => setLinked(false)} />
      </aside>
    );
  }

  return (
    <aside className="dm-side" aria-label="Conversations">
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

        <div className={`dm-search-line${searching ? ' is-searching' : ''}`}>
          <label className="dm-search">
            <Icon name="search" />
            <input
              ref={field}
              type="search"
              value={query}
              placeholder="Rechercher une conversation"
              aria-label="Rechercher une conversation (nom ou annonce)"
              autoComplete="off"
              onFocus={() => setSearching(true)}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') cancelSearch();
              }}
            />
            {query && (
              <button type="button" className="dm-search-clear" onClick={() => setQuery('')} aria-label="Effacer la recherche" title="Effacer la recherche">
                <Icon name="x" />
              </button>
            )}
          </label>
          {searching && <button type="button" className="dm-search-cancel" onClick={cancelSearch}>Annuler</button>}
        </div>

        <div className="dm-tabs" role="group" aria-label="Filtres">
          {SITE_INBOX_FILTERS.map((option) => {
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
      </div>

      <div className="dm-list-scroll">
        {searching && query.trim() === '' && (
          <SearchActivity linkedCount={conversations.filter((conversation) => conversation.listing !== null).length} onLinked={() => setLinked(true)} />
        )}
        <h2 className="dm-list-title">Toutes les conversations</h2>
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

/**
 * Ligne (ConversationRow de l'app) : avatar de 46 px, nom en gras et « Pro » ou « Particulier », heure (bleue s'il y a
 * des non-lus), la petite maison et le bien (ou le rôle), puis le dernier message et la pastille des non-lus (grise en
 * sourdine), ou la cloche barrée d'une conversation en sourdine.
 */
function ConversationRow({ row, offers, me, selected }: { row: Row; offers: OfferRow[]; me: string | null; selected: boolean }) {
  const { conversation, request, activity } = row;
  const unread = conversation.unreadCount > 0;
  const subtitle = conversation.counterpart.subtitle;
  return (
    <a
      className="dm-row"
      href={routePath({ conversationId: conversation.id })}
      aria-current={selected ? 'true' : undefined}
      onClick={openOnClick(conversation.id)}
    >
      <ConversationAvatar conversation={conversation} size={46} />
      <span className="dm-row-main">
        <span className="dm-row-top">
          <span className="dm-row-name">{conversation.counterpart.name}</span>
          <AccountPill conversation={conversation} />
          <time className={`dm-row-time${unread ? ' is-unread' : ''}`} dateTime={activity.toISOString()}>{rowTimeLabel(activity)}</time>
        </span>
        {subtitle && <span className="dm-row-listing"><Icon name="house" /><span>{subtitle}</span></span>}
        <span className="dm-row-bottom">
          <RowPreview conversation={conversation} request={request} offers={offers} me={me} unread={unread} />
          {unread ? (
            <span className={`dm-unread${isMuted(conversation) ? ' is-muted' : ''}`} aria-label={`${conversation.unreadCount} non lus`}>
              {conversation.unreadCount}
            </span>
          ) : isMuted(conversation) && <span className="dm-row-muted" role="img" aria-label="En sourdine"><Icon name="bellOff" /></span>}
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
  // Coches devant « Vous : » (conversation à deux) : grise pour envoyé, deux coches bleues pour vu.
  const seen = !conversation.isGroup && conversation.otherLastReadAt !== null && conversation.lastMessageAt !== null
    && conversation.otherLastReadAt.getTime() >= conversation.lastMessageAt.getTime();
  const check = mine && !conversation.isGroup && (
    <span className={`dm-row-check${seen ? ' is-read' : ''}`} role="img" aria-label={seen ? 'Vu' : 'Envoyé'}><Icon name={seen ? 'checkCheck' : 'check'} /></span>
  );
  if (last.content.kind === 'offer') {
    const offerId = last.content.offerId;
    const offer = offers.find((item) => sameId(item.id, offerId)) ?? null;
    return (
      <span className={`dm-row-preview${weight}`}>
        {check}
        {mine && <>{<span>Vous :</span>}{' '}</>}
        <span className="dm-tag">Offre</span>{' '}
        <span>{offer ? keepNumbersTogether(`${formatPrice(Number(offer.amount))} proposés`) : ''}</span>
      </span>
    );
  }
  return <span className={`dm-row-preview${weight}`}>{check}<span>{keepNumbersTogether(rowPreview(conversation, me).text)}</span></span>;
}
