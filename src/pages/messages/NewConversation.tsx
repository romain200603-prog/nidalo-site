import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { useStore } from '../../lib/account/session';
import { liveReload } from '../../lib/badges';
import {
  findAccountByPhone, phoneAccount, serverMessage, startDirectConversation, startPhoneConversation, type PhoneAccountRow,
} from '../../lib/messages/api';
import { formattedPhoneNumber, looksLikePhoneNumber, normalizedPhoneNumber, typingPhoneNumber } from '../../lib/messages/format';
import {
  alphabetical, contactDetail, contactKey, contactMatches, contactsFrom, sectionLetter, type Contact, type Conversation,
} from '../../lib/messages/inbox';
import { loadProfessionals, professionalsStore } from '../../lib/messages/store';
import { PATHS } from '../../lib/paths';
import { CounterpartAvatar, Sheet, showIphoneOnly } from './parts';
import { navigate } from './route';

// « Nouvelle discussion » (NewConversationView.swift) : recherche, actions rapides, contacts fréquents puis tous les
// contacts par lettre ; « Nouveau contact » cherche un compte NIDALO par son numéro (AddContactView.swift). Les
// coordonnées des contacts ne sont jamais affichées. Groupes, communautés et diffusions : dans l'app iPhone.

/**
 * Conversation d'un contact : sa plus récente, sinon une conversation directe avec l'agence, créée une seule fois
 * par le serveur (start_direct_conversation) ; rien si elle n'a pas pu être ouverte, comme l'app.
 */
export async function openContact(contact: Contact): Promise<boolean> {
  const latest = contact.conversations[0];
  if (latest) {
    navigate({ conversationId: latest.id });
    return true;
  }
  if (!contact.professional) return false;
  try {
    const id = await startDirectConversation(contact.professional.user_id);
    await liveReload();
    navigate({ conversationId: id });
    return true;
  } catch {
    return false;
  }
}

/** Carte blanche de contacts (ContactsCard) : avatar, nom, dernier message ou sujet. */
export function ContactsList({ contacts, showsLastMessage, onOpened }: {
  contacts: Contact[];
  showsLastMessage: boolean;
  onOpened?: () => void;
}) {
  const busy = useRef(false);
  return (
    <ul className="dm-card-list">
      {contacts.map((contact) => {
        const preview = contact.conversations[0]?.lastMessagePreview;
        const detail = showsLastMessage && preview ? preview : contactDetail(contact);
        return (
          <li key={contact.id}>
            <button
              type="button"
              className="dm-contact"
              title={contact.conversations.length ? 'Ouvre la conversation' : 'Commence une conversation'}
              onClick={async () => {
                if (busy.current) return;
                busy.current = true;
                const opened = await openContact(contact);
                busy.current = false;
                if (opened) onOpened?.();
              }}
            >
              <CounterpartAvatar counterpart={contact.counterpart} size={44} />
              <span className="dm-contact-text">
                <span className="dm-contact-name">{contact.counterpart.name}</span>
                <span className="dm-contact-detail">{detail}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Saisie d'un numéro incomplet ou étranger. */
export function PhoneHint({ text }: { text: string }) {
  return (
    <div className="dm-phone-card">
      <div className="dm-phone-head">
        <span className="dm-icon-tile"><Icon name="phone" /></span>
        <strong>{text.replace(/\D/g, '').length < 10 ? 'Continuez la saisie du numéro' : 'Ce numéro n\'est pas un numéro français valide.'}</strong>
      </div>
    </div>
  );
}

type Lookup = { status: 'searching' } | { status: 'found'; row: PhoneAccountRow } | { status: 'notFound' } | { status: 'failed'; message: string | null };

/**
 * Compte NIDALO d'un numéro complet (PhoneLookupCard) : find_account_by_phone, puis « Écrire » ouvre la conversation
 * directe, existante ou nouvelle (start_phone_conversation). Seul le nom du compte s'affiche.
 */
export function PhoneLookupCard({ phone, contacts, onOpened }: { phone: string; contacts: Contact[]; onOpened?: () => void }) {
  const [lookup, setLookup] = useState<Lookup>({ status: 'searching' });
  const [attempt, setAttempt] = useState(0);
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLookup({ status: 'searching' });
    findAccountByPhone(phone)
      .then((row) => { if (!cancelled) setLookup(row ? { status: 'found', row } : { status: 'notFound' }); })
      .catch((error: unknown) => { if (!cancelled) setLookup({ status: 'failed', message: serverMessage(error) }); });
    return () => { cancelled = true; };
  }, [phone, attempt]);

  const subtitle = lookup.status === 'searching' ? 'Recherche d\'un compte NIDALO…'
    : lookup.status === 'found' ? 'Compte NIDALO trouvé'
      : lookup.status === 'notFound' ? 'Aucun compte NIDALO avec ce numéro'
        : lookup.message ?? 'La recherche n\'a pas pu aboutir. Vérifiez votre connexion.';
  const account = lookup.status === 'found' ? phoneAccount(lookup.row) : null;
  const isContact = account ? contacts.some((contact) => contact.id === contactKey(account.counterpart)) : false;

  const write = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const id = await startPhoneConversation(phone);
      await liveReload();
      navigate({ conversationId: id });
      onOpened?.();
    } catch {
      // Comme l'app : la conversation ne s'ouvre pas.
    }
    setOpening(false);
  };

  return (
    <div className="dm-phone-card" aria-live="polite">
      <div className="dm-phone-head">
        <span className="dm-icon-tile"><Icon name="phone" /></span>
        <span className="dm-phone-text">
          <strong>{formattedPhoneNumber(phone)}</strong>
          <small>{subtitle}</small>
        </span>
        {lookup.status === 'searching' && <span className="spinner dm-inline-spinner" role="status" aria-label="Recherche" />}
      </div>
      {account && (
        <>
          <div className="dm-phone-account">
            <CounterpartAvatar counterpart={account.counterpart} size={40} />
            <span className="dm-phone-text">
              <strong>{account.counterpart.name}</strong>
              <small>{account.counterpart.subtitle}</small>
            </span>
          </div>
          <div className="dm-phone-actions">
            <button type="button" className="dm-button is-light" disabled={isContact} onClick={() => showIphoneOnly('Ajouter aux contacts')}>
              {isContact ? 'Dans vos contacts' : 'Ajouter aux contacts'}
            </button>
            <button type="button" className="dm-button" disabled={opening} onClick={() => void write()}>Écrire</button>
          </div>
        </>
      )}
      {lookup.status === 'failed' && (
        <button type="button" className="dm-button is-light dm-phone-retry" onClick={() => setAttempt((value) => value + 1)}>Réessayer</button>
      )}
    </div>
  );
}

const QUICK_ACTIONS: { key: 'group' | 'community' | 'contact' | 'broadcast'; icon: IconName; title: string; hint: string }[] = [
  { key: 'group', icon: 'users', title: 'Nouveau groupe', hint: 'Une conversation avec plusieurs personnes' },
  { key: 'community', icon: 'community', title: 'Nouvelle communauté', hint: 'Rassembler autour d\'un projet ou d\'un thème' },
  { key: 'contact', icon: 'userPlus', title: 'Nouveau contact', hint: 'Par son numéro, s\'il a un compte NIDALO' },
  { key: 'broadcast', icon: 'megaphone', title: 'Nouvelle diffusion', hint: 'Un même message, envoyé séparément à chacun' },
];

export function NewConversationSheet({ open, conversations, onClose }: { open: boolean; conversations: Conversation[]; onClose: () => void }) {
  const [screen, setScreen] = useState<'main' | 'contact'>('main');
  const [query, setQuery] = useState('');
  const professionals = useStore(professionalsStore);
  useEffect(() => {
    if (!open) return;
    setScreen('main');
    setQuery('');
    loadProfessionals();
  }, [open]);
  const contacts = contactsFrom(conversations, professionals.value);
  return (
    <Sheet
      open={open}
      title={screen === 'main' ? 'Nouvelle discussion' : 'Nouveau contact'}
      onClose={onClose}
      onBack={screen === 'contact' ? () => setScreen('main') : undefined}
      className="dm-new"
    >
      {screen === 'contact' ? <AddContact contacts={contacts} onOpened={onClose} /> : (
        <NewConversationMain contacts={contacts} query={query} setQuery={setQuery} onAddContact={() => setScreen('contact')} onOpened={onClose} />
      )}
    </Sheet>
  );
}

function NewConversationMain({ contacts, query, setQuery, onAddContact, onOpened }: {
  contacts: Contact[];
  query: string;
  setQuery: (value: string) => void;
  onAddContact: () => void;
  onOpened: () => void;
}) {
  const text = query.trim();
  const frequent = contacts.filter((contact) => contact.conversations.length > 0).slice(0, 5);
  const sorted = alphabetical(contacts);
  const letters = sorted.map(sectionLetter).filter((letter, index, all) => all.indexOf(letter) === index);
  return (
    <div className="dm-new-body">
      <label className="dm-search dm-new-search">
        <Icon name="search" />
        <input
          type="search"
          value={query}
          placeholder="Nom, numéro ou nom de profil"
          aria-label="Nom, numéro ou nom de profil"
          autoComplete="off"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {query && (
          <button type="button" className="dm-search-clear" onClick={() => setQuery('')} aria-label="Effacer la saisie" title="Effacer la saisie">
            <Icon name="x" />
          </button>
        )}
      </label>
      {text ? (
        looksLikePhoneNumber(text) ? (
          <>
            <h3 className="dm-results-title">Numéro de téléphone</h3>
            {normalizedPhoneNumber(text) ? <PhoneLookupCard phone={normalizedPhoneNumber(text) ?? ''} contacts={contacts} onOpened={onOpened} /> : <PhoneHint text={text} />}
          </>
        ) : (() => {
          const found = alphabetical(contacts.filter((contact) => contactMatches(contact, text)));
          return found.length === 0 ? (
            <div className="dm-results-empty">
              <h3>Aucun contact pour « {text} »</h3>
              <p>Vous pouvez aussi taper un numéro de téléphone complet.</p>
            </div>
          ) : (
            <>
              <h3 className="dm-results-title">Contacts</h3>
              <ContactsList contacts={found} showsLastMessage={false} onOpened={onOpened} />
            </>
          );
        })()
      ) : (
        <>
          <ul className="dm-card-list dm-quick-actions">
            {QUICK_ACTIONS.map((action) => (
              <li key={action.key}>
                <button
                  type="button"
                  className="dm-action-row"
                  title={action.hint}
                  onClick={() => (action.key === 'contact' ? onAddContact() : showIphoneOnly(action.title))}
                >
                  <Icon name={action.icon} />
                  <span className="dm-action-text"><span>{action.title}</span></span>
                  <Icon name="chevronRight" className="icon dm-chevron" />
                </button>
              </li>
            ))}
          </ul>
          {contacts.length === 0 ? (
            <div className="dm-empty-contacts">
              <span className="dm-icon-tile"><Icon name="messageCircle" /></span>
              <h3>Aucun contact pour l'instant</h3>
              <p>Vos contacts apparaissent dès votre premier échange. Pour écrire à un vendeur, une agence ou un bailleur, touchez « Message » sur son annonce.</p>
              <a className="dm-button is-light" href={PATHS.search}>Rechercher un bien</a>
            </div>
          ) : (
            <>
              {frequent.length > 0 && (
                <>
                  <h3 className="dm-results-title">Contacts fréquents</h3>
                  <ContactsList contacts={frequent} showsLastMessage onOpened={onOpened} />
                </>
              )}
              {letters.map((letter) => (
                <section key={letter} aria-label={letter}>
                  <h3 className="dm-results-title">{letter}</h3>
                  <ContactsList contacts={sorted.filter((contact) => sectionLetter(contact) === letter)} showsLastMessage={false} onOpened={onOpened} />
                </section>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

/** « Nouveau contact » : numéro saisi par paires ; un numéro complet cherche le compte NIDALO. */
function AddContact({ contacts, onOpened }: { contacts: Contact[]; onOpened: () => void }) {
  const [text, setText] = useState('');
  const phone = normalizedPhoneNumber(text);
  return (
    <div className="dm-new-body">
      <p className="dm-info-line">
        <Icon name="info" />
        Saisissez le numéro de téléphone de la personne. Si elle a un compte NIDALO, elle rejoint vos contacts. Son numéro n'est jamais affiché aux autres.
      </p>
      <label className="dm-search dm-new-search">
        <Icon name="phone" />
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={text}
          placeholder="06 12 34 56 78"
          aria-label="Numéro de téléphone"
          autoFocus
          onChange={(event) => setText(typingPhoneNumber(event.currentTarget.value))}
        />
      </label>
      {phone ? <PhoneLookupCard phone={phone} contacts={contacts} onOpened={onOpened} />
        : text.replace(/\D/g, '').length >= 10 ? <p className="dm-error">Ce numéro n'est pas un numéro français valide.</p> : null}
    </div>
  );
}
