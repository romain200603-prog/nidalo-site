import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { PageHeader } from '../../components/PageHeader';
import { loadSavedSearches, MODE_TITLES, modeOf, placeLabelOf, savedSearchesStore, type SavedSearch } from '../../lib/account/savedSearches';
import { useStore } from '../../lib/account/session';
import { looksLikePhoneNumber, matchesWords, normalizedPhoneNumber } from '../../lib/messages/format';
import { alphabetical, contactMatches, contactsFrom, sectionLetter, type Contact, type Conversation } from '../../lib/messages/inbox';
import {
  clearRecentSearches, loadRecentSearches, recentSearchesStore, recentTitle, recordRecentSearch, removeRecentSearch, type RecentSearch,
  type RecentSearchKind,
} from '../../lib/messages/recentSearches';
import { loadProfessionals, professionalsStore } from '../../lib/messages/store';
import { PATHS } from '../../lib/paths';
import { runPath } from '../account/SavedSearchesList';
import { ContactsList, OPEN_FAILED, openContact, PhoneHint, PhoneLookupCard } from './NewConversation';
import { ConversationAvatar, CounterpartAvatar, showNotice } from './parts';
import { navigate } from './route';
import { ListingConversations, SearchActivity } from './SearchActivity';

// Recherche ouverte de la messagerie (MessagingSearchView.swift) : la barre glisse en haut et le contenu apparaît en
// fondu. Rien de saisi : « Recherches récentes » (ou « Idées de recherche »), « Contacts récents » et « Votre activité
// immobilière ». Pendant la saisie : un numéro cherche le compte Nidalo de ce numéro ; sinon les contacts, les
// conversations et les recherches enregistrées qui correspondent. Les annonces trouvées par le moteur de recherche de
// l'app ne sont pas reprises : le site n'a pas de recherche d'annonces par texte libre.

const IDEAS = ['Lyon', 'Appartement 3 pièces', 'Maison avec jardin', 'Investissement locatif', 'Hôtel à vendre', 'Local commercial à Lyon'];

const RECENT_ICONS: Record<RecentSearchKind['type'], IconName> = {
  text: 'search', contact: 'userRound', conversation: 'messageSquareText', savedSearch: 'sliders',
};

/** Durée de l'ouverture et de la fermeture (0,3 s ; 0,2 s en fondu avec « Réduire les animations »). */
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function MessagingSearch({ conversations, me, onCancel }: { conversations: Conversation[]; me: string | null; onCancel: () => void }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<'search' | 'contacts' | 'linked'>('search');
  const [shown, setShown] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const professionals = useStore(professionalsStore);
  const recentState = useStore(recentSearchesStore);
  const owner = me ?? 'sans-compte';
  const recents = recentState.owner === owner ? recentState.items : loadRecentSearches(owner);
  const contacts = contactsFrom(conversations, professionals.value);
  const text = query.trim();

  useEffect(() => {
    loadProfessionals();
    void loadSavedSearches();
  }, []);
  useLayoutEffect(() => {
    field.current?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const cancel = () => {
    setShown(false);
    window.setTimeout(onCancel, reducedMotion() ? 200 : 300);
  };
  const record = (kind: RecentSearchKind) => recordRecentSearch(owner, kind);
  const forget = (item: RecentSearch) => {
    removeRecentSearch(owner, item.id);
    showNotice(`« ${recentTitle(item)} » n'est plus disponible.`);
  };
  const openConversation = (conversation: Conversation) => {
    record({ type: 'conversation', id: conversation.id, title: conversation.counterpart.name });
    navigate({ conversationId: conversation.id });
  };
  const openSavedSearch = (search: SavedSearch) => {
    record({ type: 'savedSearch', id: search.id, name: search.name });
    window.location.assign(runPath(search));
  };
  const reopen = (item: RecentSearch) => {
    const { kind } = item;
    switch (kind.type) {
      case 'text':
        setQuery(kind.text);
        break;
      case 'contact': {
        const contact = contacts.find((candidate) => candidate.id === kind.id);
        if (!contact) { forget(item); break; }
        record(kind);
        void openContact(contact).then((opened) => { if (!opened) showNotice(OPEN_FAILED); });
        break;
      }
      case 'conversation': {
        const conversation = conversations.find((candidate) => candidate.id.toLowerCase() === kind.id.toLowerCase());
        if (conversation) openConversation(conversation); else forget(item);
        break;
      }
      case 'savedSearch': {
        const searches = savedSearchesStore.get();
        const search = searches.status === 'ready' ? searches.items.find((candidate) => candidate.id === kind.id) : undefined;
        if (search) openSavedSearch(search); else if (searches.status === 'ready') forget(item);
        break;
      }
    }
  };

  if (page === 'contacts') {
    return (
      <div className="dm-msearch-page">
        <PageHeader title="Contacts" onBack={() => setPage('search')} className="dm-page-header" />
        <div className="dm-list-scroll dm-msearch-scroll">
          {contacts.length === 0 ? <EmptyContacts /> : <AlphabeticalContacts contacts={contacts} onOpen={(contact) => record({ type: 'contact', id: contact.id, name: contact.counterpart.name })} />}
        </div>
      </div>
    );
  }
  if (page === 'linked') return <ListingConversations conversations={conversations} onBack={() => setPage('search')} />;

  return (
    <div className={`dm-msearch${shown ? ' is-shown' : ''}`}>
      <div className="dm-msearch-bar">
        <label className="dm-msearch-field">
          <Icon name="search" />
          <input
            ref={field}
            type="search"
            enterKeyHint="search"
            value={query}
            placeholder="Rechercher un contact ou une annonce…"
            aria-label="Rechercher un contact ou une annonce"
            autoComplete="off"
            autoCorrect="off"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') record({ type: 'text', text: query });
              if (event.key === 'Escape') cancel();
            }}
          />
          {query && (
            <button type="button" className="dm-msearch-clear" onClick={() => { setQuery(''); field.current?.focus(); }} aria-label="Effacer la saisie">
              <Icon name="x" />
            </button>
          )}
        </label>
        <button type="button" className="dm-msearch-cancel" onClick={cancel}>Annuler</button>
      </div>
      <div className="dm-list-scroll dm-msearch-scroll">
        {text === '' ? (
          <>
            <RecentSearches recents={recents} onReopen={reopen} onIdea={setQuery} onClear={() => clearRecentSearches(owner)} />
            <RecentContacts contacts={contacts} onAll={() => setPage('contacts')}
              onOpen={(contact) => record({ type: 'contact', id: contact.id, name: contact.counterpart.name })} />
            <SearchActivity linkedCount={conversations.filter((conversation) => conversation.listing !== null).length} onLinked={() => setPage('linked')} />
          </>
        ) : (
          <SearchResults text={text} contacts={contacts} conversations={conversations}
            onContact={(contact) => record({ type: 'contact', id: contact.id, name: contact.counterpart.name })}
            onConversation={openConversation} onSavedSearch={openSavedSearch} />
        )}
      </div>
    </div>
  );
}

/** Recherches récentes en puces qui défilent ; sans historique, l'invitation et les idées de recherche. */
function RecentSearches({ recents, onReopen, onIdea, onClear }: {
  recents: RecentSearch[];
  onReopen: (item: RecentSearch) => void;
  onIdea: (idea: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="dm-msearch-section is-first" aria-labelledby="dm-recherches-recentes">
      <div className="dm-section-head">
        <h2 id="dm-recherches-recentes">Recherches récentes</h2>
        {recents.length > 0 && <button type="button" className="dm-clear-all" onClick={onClear}>Tout effacer</button>}
      </div>
      {recents.length === 0 ? (
        <>
          <p className="dm-msearch-note">Aucune recherche récente. Vos recherches et les résultats ouverts apparaîtront ici.</p>
          <h3 className="dm-msearch-ideas">Idées de recherche</h3>
          <div className="dm-chip-row">
            {IDEAS.map((idea) => (
              <button key={idea} type="button" className="dm-search-chip" onClick={() => onIdea(idea)}>
                <Icon name="sparkles" /><span>{idea}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="dm-chip-row is-recent">
          {recents.map((item) => (
            <button key={item.id} type="button" className="dm-search-chip" onClick={() => onReopen(item)}>
              <Icon name={RECENT_ICONS[item.kind.type]} /><span>{recentTitle(item)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Contacts récents : les dix derniers interlocuteurs, avatars de 62 qui défilent, et « Voir tout ». */
function RecentContacts({ contacts, onAll, onOpen }: { contacts: Contact[]; onAll: () => void; onOpen: (contact: Contact) => void }) {
  const recent = contacts.filter((contact) => contact.conversations.length > 0).slice(0, 10);
  const busy = useRef(false);
  return (
    <section className="dm-msearch-section is-contacts" aria-labelledby="dm-contacts-recents">
      <div className="dm-section-head">
        <h2 id="dm-contacts-recents">Contacts récents</h2>
        <button type="button" className="dm-see-all" onClick={onAll}>Voir tout</button>
      </div>
      {recent.length === 0 ? <p className="dm-msearch-note">Les personnes avec qui vous échangez apparaîtront ici.</p> : (
        <div className="dm-recent-contacts">
          {recent.map((contact) => (
            <button
              key={contact.id}
              type="button"
              className="dm-recent-contact"
              aria-label={`Ouvrir la conversation avec ${contact.counterpart.name}`}
              onClick={async () => {
                if (busy.current) return;
                busy.current = true;
                onOpen(contact);
                const opened = await openContact(contact);
                busy.current = false;
                if (!opened) showNotice(OPEN_FAILED);
              }}
            >
              <ContactAvatar contact={contact} size={62} fontSize={19} />
              <span>{contact.counterpart.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Avatar d'un contact : celui de sa dernière conversation (photo, couleur), sinon ses initiales. */
function ContactAvatar({ contact, size, fontSize }: { contact: Contact; size: number; fontSize: number }) {
  const latest = contact.conversations[0];
  return latest ? <ConversationAvatar conversation={latest} size={size} fontSize={fontSize} />
    : <CounterpartAvatar counterpart={contact.counterpart} size={size} fontSize={fontSize} />;
}

/** Tous les contacts, par ordre alphabétique, une carte par lettre (AlphabeticalContacts). */
function AlphabeticalContacts({ contacts, onOpen }: { contacts: Contact[]; onOpen: (contact: Contact) => void }) {
  const sorted = alphabetical(contacts);
  const letters = sorted.map(sectionLetter).filter((letter, index, all) => all.indexOf(letter) === index);
  return (
    <>
      {letters.map((letter) => (
        <section key={letter} aria-label={letter}>
          <h3 className="dm-results-title">{letter}</h3>
          <ContactsList contacts={sorted.filter((contact) => sectionLetter(contact) === letter)} showsLastMessage={false} onSelect={onOpen} />
        </section>
      ))}
    </>
  );
}

/** Aucun contact encore (EmptyContactsCard). */
export function EmptyContacts() {
  return (
    <div className="dm-empty-contacts">
      <span className="dm-icon-tile"><Icon name="messageCircle" /></span>
      <h3>Aucun contact pour l'instant</h3>
      <p>Vos contacts apparaissent dès votre premier échange. Pour écrire à un vendeur, une agence ou un bailleur, touchez « Message » sur son annonce.</p>
      <a className="dm-button is-light" href={PATHS.search}>Rechercher un bien</a>
    </div>
  );
}

/** Résultats pendant la saisie : numéro de téléphone, ou contacts, conversations et recherches enregistrées. */
function SearchResults({ text, contacts, conversations, onContact, onConversation, onSavedSearch }: {
  text: string;
  contacts: Contact[];
  conversations: Conversation[];
  onContact: (contact: Contact) => void;
  onConversation: (conversation: Conversation) => void;
  onSavedSearch: (search: SavedSearch) => void;
}) {
  const saved = useStore(savedSearchesStore);
  if (looksLikePhoneNumber(text)) {
    const phone = normalizedPhoneNumber(text);
    return (
      <>
        <h3 className="dm-results-title">Numéro de téléphone</h3>
        {phone ? <PhoneLookupCard phone={phone} contacts={contacts} /> : <PhoneHint text={text} />}
      </>
    );
  }
  const foundContacts = alphabetical(contacts.filter((contact) => contactMatches(contact, text)));
  const foundConversations = conversations.filter((conversation) => matchesWords(text, [
    conversation.counterpart.name, conversation.counterpart.subtitle, conversation.listing?.title ?? '', conversation.listing?.city ?? '',
    conversation.lastMessagePreview ?? '', ...conversation.members.map((member) => member.name),
  ]));
  // Recherches enregistrées à partir de 2 lettres : une seule lettre est trop large.
  const searches = text.length < 2 || saved.status !== 'ready' ? [] : saved.items.filter((search) => matchesWords(text, [
    search.name, placeLabelOf(search.query) ?? '', MODE_TITLES[modeOf(search.query)],
  ]));
  if (foundContacts.length === 0 && foundConversations.length === 0 && searches.length === 0) {
    return (
      <div className="dm-results-empty">
        <h3>Aucun résultat pour « {text} »</h3>
        <p>Essayez un nom, une agence, une ville ou un type de bien.</p>
      </div>
    );
  }
  return (
    <>
      {foundContacts.length > 0 && (
        <>
          <h3 className="dm-results-title">Contacts</h3>
          <ContactsList contacts={foundContacts} showsLastMessage={false} onSelect={onContact} />
        </>
      )}
      {foundConversations.length > 0 && (
        <>
          <h3 className="dm-results-title">Conversations</h3>
          <ul className="dm-card-list">
            {foundConversations.map((conversation) => (
              <li key={conversation.id}>
                <button type="button" className="dm-contact dm-found-conversation" onClick={() => onConversation(conversation)}>
                  <ConversationAvatar conversation={conversation} size={44} fontSize={14} />
                  <span className="dm-contact-text">
                    <span className="dm-contact-name">{conversation.counterpart.name}</span>
                    <span className="dm-contact-detail">
                      {conversation.listing ? `${conversation.listing.title} · ${conversation.listing.city}` : conversation.counterpart.subtitle}
                    </span>
                    {conversation.lastMessagePreview && <span className="dm-contact-preview">{conversation.lastMessagePreview}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {searches.length > 0 && (
        <>
          <h3 className="dm-results-title">Recherches enregistrées</h3>
          <ul className="dm-card-list">
            {searches.map((search) => (
              <li key={search.id}>
                <button type="button" className="dm-action-row" onClick={() => onSavedSearch(search)}>
                  <Icon name="sliders" />
                  <span className="dm-action-text">
                    <span>{search.name}</span>
                    <small>{[MODE_TITLES[modeOf(search.query)], placeLabelOf(search.query)].filter(Boolean).join(' · ')}</small>
                  </span>
                  <Icon name="chevronRight" className="icon dm-chevron" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
