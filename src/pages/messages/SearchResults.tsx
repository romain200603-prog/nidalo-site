import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import {
  draftFromQuery, loadSavedSearches, MODE_TITLES, modeOf, placeLabelOf, savedSearchesStore, type SavedSearch,
} from '../../lib/account/savedSearches';
import { useStore } from '../../lib/account/session';
import { formatPerMonth, formatPrice } from '../../lib/format';
import { highlightsFor } from '../../lib/highlights';
import type { SearchMode } from '../../lib/labels';
import { placeLine, photoUrl, sortedPhotos, type ListingRow } from '../../lib/listings';
import { looksLikePhoneNumber, matchesWords, normalizedPhoneNumber } from '../../lib/messages/format';
import { alphabetical, contactMatches, contactsFrom, matchesInboxQuery, type Conversation } from '../../lib/messages/inbox';
import { loadProfessionals, professionalsStore } from '../../lib/messages/store';
import { listingPath, PATHS } from '../../lib/paths';
import { defaultDraft, paramsFromDraft, search } from '../../lib/search';
import { ContactsList, PhoneHint, PhoneLookupCard } from './NewConversation';
import { CounterpartAvatar, IPHONE_ONLY } from './parts';
import { openOnClick, routePath } from './route';

// Recherche de la messagerie (MessagingSearchView.swift), dans la colonne de gauche : un numéro cherche le compte
// NIDALO de ce numéro ; sinon contacts, conversations, annonces (à partir de 2 lettres, dans les quatre
// catégories) et recherches enregistrées. Sans saisie : « Recherches récentes » (dans l'app iPhone) et contacts
// récents.

const MODES: SearchMode[] = ['buy', 'rent', 'invest', 'hotel'];

/** Mots qui désignent chaque type de bien, pour trouver « studio » ou « local » (MessagingSearchView). */
const TYPE_TERMS: Record<string, string[]> = {
  apartment: ['appartement', 'studio'],
  house: ['maison', 'villa'],
  building: ['immeuble'],
  land: ['terrain'],
  commercial: ['local commercial', 'commerce', 'boutique'],
  office: ['bureaux'],
  parking: ['parking', 'box', 'garage'],
  hotel: ['hôtel', 'hotel'],
};

/** Annonce trouvée : titre, ville, code postal ou type de bien (MessagingDirectory.matches(listing:)). */
export function listingMatches(row: Pick<ListingRow, 'title' | 'city' | 'postal_code' | 'property_type'>, text: string): boolean {
  return matchesWords(text, [row.title, row.city, row.postal_code, ...(TYPE_TERMS[row.property_type] ?? [])]);
}

/** Recherche enregistrée dont le nom, le lieu ou la catégorie contient chaque mot saisi. */
export function savedSearchMatches(item: SavedSearch, text: string): boolean {
  return matchesWords(text, [item.name, placeLabelOf(item.query) ?? '', MODE_TITLES[modeOf(item.query)]]);
}

// Annonces des quatre catégories, lues une fois par ouverture de la page puis filtrées à chaque saisie.
let candidates: Promise<ListingRow[][]> | null = null;

function listingCandidates(): Promise<ListingRow[][]> {
  if (!candidates) {
    candidates = Promise.all(MODES.map((mode) => search(defaultDraft(mode), (row) => highlightsFor(row, null))
      .then((results) => results.map((result) => result.row))
      .catch(() => null)))
      .then((lists) => {
        if (lists.every((list) => list === null)) {
          candidates = null;
          throw new Error('listings');
        }
        return lists.map((list) => list ?? []);
      });
  }
  return candidates;
}

/** 20 annonces par catégorie au plus, sans doublon, 12 en tout. */
export function pickListings(lists: ListingRow[][], text: string): ListingRow[] {
  const found: ListingRow[] = [];
  for (const list of lists) {
    for (const row of list.filter((item) => listingMatches(item, text)).slice(0, 20)) {
      if (!found.some((item) => item.id === row.id)) found.push(row);
    }
  }
  return found.slice(0, 12);
}

type ListingsState = { text: string; status: 'idle' | 'loading' | 'ready' | 'error'; rows: ListingRow[] };

function useListingResults(text: string): ListingsState {
  const [state, setState] = useState<ListingsState>({ text: '', status: 'idle', rows: [] });
  const active = text.length >= 2 && !looksLikePhoneNumber(text);
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    // Courte pause : la recherche part quand la saisie se calme.
    const timer = window.setTimeout(() => {
      setState((current) => ({ text, status: 'loading', rows: current.rows }));
      listingCandidates()
        .then((lists) => { if (!cancelled) setState({ text, status: 'ready', rows: pickListings(lists, text) }); })
        .catch(() => { if (!cancelled) setState({ text, status: 'error', rows: [] }); });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [text, active]);
  return active ? state : { text, status: 'idle', rows: [] };
}

export function SearchResults({ query, conversations, onCompose }: {
  query: string;
  conversations: Conversation[];
  onCompose: () => void;
}) {
  const professionals = useStore(professionalsStore);
  const saved = useStore(savedSearchesStore);
  const text = query.trim();
  const listings = useListingResults(text);
  useEffect(() => {
    loadProfessionals();
    void loadSavedSearches();
  }, []);
  const contacts = contactsFrom(conversations, professionals.value);

  if (!text) {
    const recent = contacts.filter((contact) => contact.conversations.length > 0).slice(0, 10);
    return (
      <div className="dm-results">
        <div className="dm-results-head">
          <h2>Recherches récentes</h2>
        </div>
        <p className="dm-results-note">{IPHONE_ONLY}</p>
        <div className="dm-results-head">
          <h2>Contacts récents</h2>
          {recent.length > 0 && <button type="button" className="dm-link-button" onClick={onCompose}>Voir tout</button>}
        </div>
        {recent.length === 0 ? (
          <p className="dm-results-note">Les personnes avec qui vous échangez apparaîtront ici.</p>
        ) : (
          <ContactsList contacts={recent} showsLastMessage={false} />
        )}
      </div>
    );
  }

  if (looksLikePhoneNumber(text)) {
    const phone = normalizedPhoneNumber(text);
    return (
      <div className="dm-results">
        <h2 className="dm-results-title">Numéro de téléphone</h2>
        {phone ? <PhoneLookupCard phone={phone} contacts={contacts} /> : <PhoneHint text={text} />}
      </div>
    );
  }

  const foundContacts = alphabetical(contacts.filter((contact) => contactMatches(contact, text)));
  const foundConversations = conversations.filter((conversation) => matchesInboxQuery(conversation, text));
  const searches = text.length < 2 || saved.status !== 'ready' ? [] : saved.items.filter((item) => savedSearchMatches(item, text));
  const listingRows = listings.text === text || listings.status === 'loading' ? listings.rows : [];
  const showsListings = listings.status === 'loading' || listingRows.length > 0 || listings.status === 'error';
  const nothing = !foundContacts.length && !foundConversations.length && !searches.length && !listingRows.length
    && listings.status !== 'loading' && listings.status !== 'error';

  return (
    <div className="dm-results">
      {foundContacts.length > 0 && (
        <>
          <h2 className="dm-results-title">Contacts</h2>
          <ContactsList contacts={foundContacts} showsLastMessage={false} />
        </>
      )}
      {foundConversations.length > 0 && (
        <>
          <h2 className="dm-results-title">Conversations</h2>
          <ul className="dm-card-list">
            {foundConversations.map((conversation) => (
              <li key={conversation.id}>
                <SearchConversationRow conversation={conversation} />
              </li>
            ))}
          </ul>
        </>
      )}
      {showsListings && (
        <>
          <h2 className="dm-results-title">
            Annonces
            {listings.status === 'loading' && <span className="spinner dm-inline-spinner" role="status" aria-label="Chargement des annonces" />}
          </h2>
          {listings.status === 'error' && <p className="dm-results-note">Les annonces n'ont pas pu être chargées. Réessayez dans un instant.</p>}
          <ul className="dm-listing-results">
            {listingRows.map((row) => (
              <li key={row.id}><ListingResult row={row} /></li>
            ))}
          </ul>
        </>
      )}
      {searches.length > 0 && (
        <>
          <h2 className="dm-results-title">Recherches enregistrées</h2>
          <ul className="dm-card-list">
            {searches.map((item) => (
              <li key={item.id}>
                <a className="dm-action-row" href={`${PATHS.search}?${paramsFromDraft(draftFromQuery(item.query))}`}>
                  <Icon name="sliders" />
                  <span className="dm-action-text">
                    <span>{item.name}</span>
                    <small>{[MODE_TITLES[modeOf(item.query)], placeLabelOf(item.query)].filter(Boolean).join(' · ')}</small>
                  </span>
                  <Icon name="chevronRight" className="icon dm-chevron" />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {nothing && (
        <div className="dm-results-empty">
          <h3>Aucun résultat pour « {text} »</h3>
          <p>Essayez un nom, une agence, une ville ou un type de bien.</p>
        </div>
      )}
    </div>
  );
}

function SearchConversationRow({ conversation }: { conversation: Conversation }) {
  const preview = conversation.lastMessagePreview;
  return (
    <a className="dm-contact" href={routePath({ conversationId: conversation.id })} onClick={openOnClick(conversation.id)}>
      <CounterpartAvatar counterpart={conversation.counterpart} size={44} />
      <span className="dm-contact-text">
        <span className="dm-contact-name">{conversation.counterpart.name}</span>
        <span className="dm-contact-detail">{conversation.listing ? `${conversation.listing.title} · ${conversation.listing.city}` : conversation.counterpart.subtitle}</span>
        {preview && <span className="dm-contact-preview">{preview}</span>}
      </span>
    </a>
  );
}

function ListingResult({ row }: { row: ListingRow }) {
  const photo = sortedPhotos(row)[0];
  const price = Number(row.price);
  return (
    <a className="dm-listing-result" href={listingPath(row.id)}>
      <span className="dm-listing-photo">{photo ? <img src={photoUrl(photo.storage_path)} alt="" loading="lazy" /> : <Icon name="image" />}</span>
      <span className="dm-listing-text">
        <span className="dm-listing-title">{row.title}</span>
        <span className="dm-listing-place">{placeLine(row)}</span>
        <span className="dm-listing-price">{row.transaction === 'rent' ? formatPerMonth(price) : formatPrice(price)}</span>
      </span>
      <Icon name="chevronRight" className="icon dm-chevron" />
    </a>
  );
}
