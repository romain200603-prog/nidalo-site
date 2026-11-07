import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { liveReload } from '../../lib/badges';
import { formatPrice } from '../../lib/format';
import { slotLabel, visitDateInline } from '../../lib/listing/visits';
import { upcomingVisits, type ConversationVisit } from '../../lib/messages/api';
import { listLabel } from '../../lib/messages/format';
import {
  EMPTY_STATES, filterIncludes, INBOX_FILTERS, isMuted, lastActivity, rowPreview, sameId, unreadConversationCount,
  type Conversation, type InboxFilter,
} from '../../lib/messages/inbox';
import type { InboxState } from '../../lib/messages/store';
import { accountPath } from '../../lib/paths';
import { Spinner } from '../account/parts';
import { CounterpartAvatar, PublisherBadge } from './parts';
import { openOnClick, routePath } from './route';
import { SearchResults } from './SearchResults';

// Colonne de gauche (420 px) : la boîte de réception de l'app (MessagesView.swift) — titre et « Nouveau message »,
// recherche, filtres, prochaine visite, puis toutes les conversations. La conversation ouverte est surlignée.

export function Inbox({ inbox, visits, me, selectedId, onCompose }: {
  inbox: InboxState;
  visits: ConversationVisit[];
  me: string | null;
  selectedId: string | null;
  onCompose: () => void;
}) {
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const conversations = inbox.status === 'ready' ? inbox.conversations : [];
  const now = new Date();
  const upcoming = upcomingVisits(visits, now);
  const withVisit = new Set(upcoming.map((visit) => visit.conversationId?.toLowerCase()).filter((id): id is string => !!id));
  const hasVisit = (conversation: Conversation) => withVisit.has(conversation.id.toLowerCase());
  const shown = conversations.filter((conversation) => filterIncludes(filter, conversation, hasVisit(conversation)));
  const unread = unreadConversationCount(conversations);
  // Prochaine visite liée à une conversation de la messagerie.
  const nextVisit = upcoming.find((visit) => conversations.some((item) => sameId(item.id, visit.conversationId)));
  const nextConversation = nextVisit ? conversations.find((item) => sameId(item.id, nextVisit.conversationId)) ?? null : null;
  const isSearching = searching || query !== '';

  const closeSearch = () => {
    setQuery('');
    setSearching(false);
  };

  return (
    <aside className="dm-side" aria-label="Conversations">
      <header className="dm-side-head">
        <div>
          <h1>Messages</h1>
          <p>Vos échanges, votre futur chez-vous.</p>
        </div>
        <button type="button" className="dm-compose" onClick={onCompose} aria-label="Nouveau message" title="Nouveau message">
          <Icon name="squarePen" />
        </button>
      </header>

      <div className="dm-search-row">
        <label className="dm-search">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            placeholder="Rechercher un contact ou un bien"
            aria-label="Rechercher un contact ou une annonce"
            autoComplete="off"
            onFocus={() => setSearching(true)}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                closeSearch();
                event.currentTarget.blur();
              }
            }}
          />
          {query && (
            <button type="button" className="dm-search-clear" onClick={() => setQuery('')} aria-label="Effacer la saisie" title="Effacer la saisie">
              <Icon name="x" />
            </button>
          )}
        </label>
        {isSearching && <button type="button" className="dm-search-cancel" onClick={closeSearch}>Annuler</button>}
      </div>

      {isSearching ? (
        <SearchResults query={query} conversations={conversations} onCompose={onCompose} />
      ) : (
        <>
          <div className="dm-chips" role="group" aria-label="Filtres">
            {INBOX_FILTERS.map((option) => {
              const count = option.value === 'unread' ? unread : 0;
              return (
                <button
                  key={option.value}
                  type="button"
                  className="dm-chip"
                  aria-pressed={filter === option.value}
                  aria-label={count > 0 ? `${option.title}, ${count}` : option.title}
                  onClick={() => setFilter(option.value)}
                >
                  {option.title}
                  {count > 0 && <span className="dm-chip-count">{count}</span>}
                </button>
              );
            })}
          </div>

          {nextVisit && nextConversation && filter !== 'archived' && (
            <section className="dm-next" aria-labelledby="dm-next-title">
              <div className="dm-section-head">
                <h2 id="dm-next-title">Prochaine visite</h2>
                <a href={accountPath('agenda')}>Voir l’agenda</a>
              </div>
              <NextVisitCard visit={nextVisit} conversation={nextConversation} />
            </section>
          )}

          <InboxList inbox={inbox} shown={shown} filter={filter} me={me} selectedId={selectedId} hasVisit={hasVisit} />
        </>
      )}
    </aside>
  );
}

function InboxList({ inbox, shown, filter, me, selectedId, hasVisit }: {
  inbox: InboxState;
  shown: Conversation[];
  filter: InboxFilter;
  me: string | null;
  selectedId: string | null;
  hasVisit: (conversation: Conversation) => boolean;
}) {
  if (inbox.status === 'loading') return <Spinner label="Chargement des conversations" />;
  if (inbox.status === 'error') {
    return (
      <div className="dm-inbox-empty" role="alert">
        <p>Impossible de charger vos messages. Réessayez dans un instant.</p>
        <button type="button" className="dm-link-button" onClick={() => void liveReload()}>Réessayer</button>
      </div>
    );
  }
  return (
    <section className="dm-list-section" aria-labelledby="dm-list-title">
      <div className="dm-list-head">
        <h2 id="dm-list-title">Toutes les conversations</h2>
        <span>{shown.length}</span>
      </div>
      {shown.length === 0 ? (
        <div className="dm-inbox-empty">
          <Icon name={filter === 'archived' ? 'archive' : 'messages'} />
          <h3>{EMPTY_STATES[filter].title}</h3>
          <p>{EMPTY_STATES[filter].message}</p>
        </div>
      ) : (
        <ul className="dm-list">
          {shown.map((conversation) => (
            <li key={conversation.id}>
              <ConversationRow
                conversation={conversation}
                me={me}
                selected={sameId(conversation.id, selectedId)}
                highlighted={conversation.unreadCount > 0 && hasVisit(conversation)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Ligne de conversation (ConversationRow) : avatar, nom et badge, heure, aperçu, non-lus ou sourdine, sujet. */
function ConversationRow({ conversation, me, selected, highlighted }: { conversation: Conversation; me: string | null; selected: boolean; highlighted: boolean }) {
  const unread = conversation.unreadCount > 0;
  const muted = isMuted(conversation);
  return (
    <a
      className={`dm-row${highlighted ? ' is-highlighted' : ''}`}
      href={routePath({ conversationId: conversation.id })}
      aria-current={selected ? 'true' : undefined}
      onClick={openOnClick(conversation.id)}
    >
      <CounterpartAvatar counterpart={conversation.counterpart} size={52} />
      <span className="dm-row-main">
        <span className="dm-row-top">
          <span className="dm-row-name">{conversation.counterpart.name}</span>
          <PublisherBadge kind={conversation.counterpart.kind} />
          <span className="dm-row-time">{listLabel(lastActivity(conversation))}</span>
        </span>
        <span className="dm-row-mid">
          <RowPreview conversation={conversation} me={me} unread={unread} />
          {unread ? (
            <span className={`dm-unread${muted ? ' is-muted' : ''}`} aria-label={`${conversation.unreadCount} non lus`}>{conversation.unreadCount}</span>
          ) : muted ? (
            <span className="dm-row-muted" role="img" aria-label="En sourdine"><Icon name="bellOff" /></span>
          ) : null}
        </span>
        <span className="dm-row-sub">{conversation.counterpart.subtitle}</span>
      </span>
    </a>
  );
}

/** Aperçu : visite confirmée, document, coches et « Vous : », ou « Nouvelle conversation » (preview). */
function RowPreview({ conversation, me, unread }: { conversation: Conversation; me: string | null; unread: boolean }) {
  const last = conversation.lastMessage;
  const weight = unread ? ' is-unread' : '';
  if (last?.content.kind === 'visitConfirmed') {
    const slot = new Date(last.content.slot);
    if (!Number.isNaN(slot.getTime())) {
      return (
        <span className="dm-row-preview is-visit">
          <Icon name="calendar" />
          <span>Visite confirmée · {visitDateInline(slot)}</span>
        </span>
      );
    }
  }
  if (last?.content.kind === 'file') {
    return (
      <span className={`dm-row-preview${weight}`}>
        <Icon name="fileText" />
        <span>{last.content.name}</span>
      </span>
    );
  }
  const preview = rowPreview(conversation, me);
  if (!last) return <span className="dm-row-preview is-empty"><span>{preview.text}</span></span>;
  return (
    <span className={`dm-row-preview${weight}`}>
      {preview.mine && (
        <span className={`dm-check${preview.read ? ' is-read' : ''}`} role="img" aria-label={preview.read ? 'Vu' : 'Envoyé'}>
          <Icon name={preview.read ? 'checkCheck' : 'check'} />
        </span>
      )}
      <span>{preview.text}</span>
    </span>
  );
}

/** Carte de la prochaine visite (NextVisitCard) : photo, statut, date, bien, prix et interlocuteur. */
function NextVisitCard({ visit, conversation }: { visit: ConversationVisit; conversation: Conversation }) {
  const cover = visit.listing?.coverUrl ?? conversation.listing?.coverUrl ?? null;
  const label = visit.status === 'confirmed' ? null : visit.status === 'toConfirm' ? 'VISITE À CONFIRMER' : 'VISITE EN ATTENTE';
  const listing = conversation.listing;
  const description = useMemo(() => (listing ? `${listing.title} · ${listing.city}` : null), [listing]);
  return (
    <a className="dm-next-card" href={routePath({ conversationId: conversation.id })} onClick={openOnClick(conversation.id)} title="Ouvre la conversation">
      <span className="dm-next-top">
        <span className="dm-next-photo">{cover ? <img src={cover} alt="" loading="lazy" /> : <Icon name="image" />}</span>
        <span className="dm-next-text">
          {label ? <span className="dm-next-status">{label}</span> : (
            <span className="dm-next-status is-confirmed"><Icon name="circleCheck" />VISITE CONFIRMÉE</span>
          )}
          <span className="dm-next-date">{slotLabel(visit.start)}</span>
          {listing && <span className="dm-next-place">{description}</span>}
          {listing && <span className="dm-next-price">{formatPrice(listing.price)}</span>}
        </span>
      </span>
      <span className="dm-next-with">
        <CounterpartAvatar counterpart={conversation.counterpart} size={22} />
        <span>Avec {conversation.counterpart.name}</span>
        <Icon name="arrowUpRight" />
      </span>
    </a>
  );
}
