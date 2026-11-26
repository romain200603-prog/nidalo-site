import { useEffect } from 'react';
import { ContentUnavailable } from '../../components/ContentUnavailable';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import type { IconName } from '../../components/iconPaths';
import { favoritesStore, loadFavorites } from '../../lib/account/favorites';
import { loadSavedSearches, savedSearchesStore } from '../../lib/account/savedSearches';
import { useStore } from '../../lib/account/session';
import { cardPrice, formatCardPrice } from '../../lib/cardContent';
import { formatPrice } from '../../lib/format';
import { keepNumbersTogether } from '../../lib/messages/format';
import { lastActivity, type Conversation, type ListingSnapshot } from '../../lib/messages/inbox';
import { accountPath, PATHS } from '../../lib/paths';
import { recentlyViewedIds } from '../../lib/recentlyViewed';
import { listingStore, loadListingRow, type ListingRowState } from './listingRow';
import { openOnClick, routePath } from './route';

// « Votre activité immobilière » de la recherche de la messagerie (MessagingSearchView.swift) ; « Discussions liées aux
// annonces » ouvre les conversations sur un bien, avec leur prix comme sur les cartes (ListingConversationsList).

type ActivityRow = { icon: IconName; title: string; subtitle: string; count: number; href?: string; onSelect?: () => void };

/** « Votre activité immobilière » : quatre lignes, le nombre en pastille bleue, puis le chevron. */
export function SearchActivity({ linkedCount, onLinked }: { linkedCount: number; onLinked: () => void }) {
  const favorites = useStore(favoritesStore);
  const searches = useStore(savedSearchesStore);
  useEffect(() => {
    void loadFavorites();
    void loadSavedSearches();
  }, []);
  const rows: ActivityRow[] = [
    { icon: 'clock', title: 'Annonces consultées récemment', subtitle: 'Retrouvez les biens que vous avez ouverts', count: recentlyViewedIds().length, href: accountPath('consultes') },
    {
      icon: 'heart', title: 'Biens favoris', subtitle: 'Vos annonces enregistrées, dans les 4 catégories',
      count: favorites.status === 'ready' ? favorites.items.length : 0, href: PATHS.favorites,
    },
    {
      icon: 'sliders', title: 'Mes recherches immobilières', subtitle: 'Relancez une recherche enregistrée',
      count: searches.status === 'ready' ? searches.items.length : 0, href: accountPath('recherches'),
    },
    { icon: 'messagesSquare', title: 'Discussions liées aux annonces', subtitle: 'Vos échanges autour d\'un bien', count: linkedCount, onSelect: onLinked },
  ];
  return (
    <section className="dm-activity" aria-labelledby="dm-activite">
      <h2 id="dm-activite">Votre activité immobilière</h2>
      <ul className="dm-activity-card">
        {rows.map((row) => {
          const body = (
            <>
              <span className="dm-activity-icon" aria-hidden="true"><Icon name={row.icon} /></span>
              <span className="dm-activity-title">{row.title}</span>
              <span className="dm-visually-hidden">{row.subtitle}</span>
              {row.count > 0 && <span className="dm-activity-count">{row.count}</span>}
              <Icon name="chevronRight" className="icon dm-chevron" />
            </>
          );
          return (
            <li key={row.title}>
              {row.href
                ? <a className="dm-activity-row" href={row.href}>{body}</a>
                : <button type="button" className="dm-activity-row" onClick={row.onSelect}>{body}</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Prix comme sur toutes les cartes (« 1 260 €/mois CC ») dès que la fiche est lue ; avant, une vente garde son montant,
 * une location attend (son « CC » ou « HC » n'est connu que par la fiche).
 */
export function LinkedPrice({ listing, state }: { listing: ListingSnapshot; state: ListingRowState | undefined }) {
  if (state?.status === 'ready') {
    const { amount, suffix } = formatCardPrice(cardPrice(state.row));
    return (
      <span className="dm-linked-price">
        <strong>{keepNumbersTogether(amount)}</strong>
        {suffix && <span>{suffix}</span>}
      </span>
    );
  }
  if (listing.transaction === 'sale') return <span className="dm-linked-price"><strong>{keepNumbersTogether(formatPrice(listing.price))}</strong></span>;
  return null;
}

/** Conversations liées à un bien : miniature, titre, ville et interlocuteur, prix, non-lus. Les fiches sont lues une fois chacune, en même temps. */
export function ListingConversations({ conversations, onBack }: { conversations: Conversation[]; onBack: () => void }) {
  const rows = useStore(listingStore);
  const linked = conversations
    .filter((conversation): conversation is Conversation & { listing: ListingSnapshot } => conversation.listing !== null)
    .sort((a, b) => lastActivity(b).getTime() - lastActivity(a).getTime());
  const ids = [...new Set(linked.map((conversation) => conversation.listing.listingId.toLowerCase()))];
  const key = ids.join(',');
  useEffect(() => {
    for (const id of key ? key.split(',') : []) loadListingRow(id);
  }, [key]);
  return (
    <div className="dm-linked">
      <PageHeader title="Discussions liées aux annonces" onBack={onBack} className="dm-page-header" />
      <div className="dm-list-scroll dm-linked-scroll">
        {linked.length === 0 ? (
          <ContentUnavailable className="dm-list-empty" icon="messagesSquare" title="Aucune discussion liée à un bien"
            text="Touchez « Message » sur une annonce pour poser vos questions à l'annonceur." />
        ) : (
          <ul className="dm-linked-list">
            {linked.map((conversation) => {
              const { listing } = conversation;
              return (
                <li key={conversation.id}>
                  <a className="dm-linked-row" href={routePath({ conversationId: conversation.id })} onClick={openOnClick(conversation.id)}>
                    <span className="dm-linked-photo" aria-hidden="true">
                      {listing.coverUrl ? <img src={listing.coverUrl} alt="" loading="lazy" /> : <Icon name="house" />}
                    </span>
                    <span className="dm-linked-text">
                      <span className="dm-linked-title">{listing.title}</span>
                      <span className="dm-linked-line">{[listing.city, conversation.counterpart.name].filter((part) => part !== '').join(' · ')}</span>
                      <LinkedPrice listing={listing} state={rows.get(listing.listingId.toLowerCase())} />
                    </span>
                    {conversation.unreadCount > 0 && (
                      <span className="dm-linked-unread" aria-label={`${conversation.unreadCount} non lus`}>{conversation.unreadCount}</span>
                    )}
                    <Icon name="chevronRight" className="icon dm-chevron" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
