import { useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { InfoLine } from '../../components/FilterControls';
import { PlaceField } from '../../components/PlaceField';
import {
  agendaStore, createVisit, CUSTOM_REMINDER_CHOICES, defaultVisitStart, DEFAULT_REMINDERS, directionsUrl, durationLabel, fullLabel,
  googleMapsUrl, loadAgenda, reminderLabel, remindersSummary, upcomingVisitForListing, VISIT_DURATIONS, visitAddressFor,
  visitContactFor, visitPhoneFor, type VisitListing, type VisitParticipant, type VisitReminders,
} from '../../lib/account/agenda';
import { favoritesStore, loadFavorites } from '../../lib/account/favorites';
import { loadMyListings, myListingsStore } from '../../lib/account/myListings';
import { newUUID } from '../../lib/account/projectEditor';
import { currentUserId, useStore } from '../../lib/account/session';
import { dayString, visitDateLong } from '../../lib/listing/visits';
import { LISTING_COLUMNS, photoUrl, sortedPhotos, UUID_PATTERN, type ListingRow } from '../../lib/listings';
import { fetchInboxRows, fetchProfiles } from '../../lib/messages/api';
import { clock, formattedPhoneNumber, normalizedPhoneNumber, telHref, typingPhoneNumber } from '../../lib/messages/format';
import { conversationFrom, type Conversation } from '../../lib/messages/inbox';
import { accountPath } from '../../lib/paths';
import { addressSuggestions, normalized } from '../../lib/places';
import { supabase } from '../../lib/supabase';
import { Modal } from '../listing/Dialogs';
import { ActionMenu, ChoiceDialog, IPHONE_ONLY, IphoneOnlyDialog, ScreenHead, Thumb } from './DesktopParts';
import { Spinner } from './parts';

// « Ajouter une visite » sur ordinateur (Features/Visits/VisitFormView.swift, création), dans la colonne de 640 px :
// bien concerné (une de mes annonces, un favori ou le bien d'une conversation, VisitListingPicker.swift), date et
// heure, rendez-vous, participants, rappels et suivi. « Enregistrer » écrit dans agenda_visits la même ligne que
// l'app (lib/account/agenda, newVisitRow). « Préparer ma visite » et « Ajouter à mon calendrier » restent dans l'app
// iPhone ; les rappels choisis sont enregistrés avec la visite et envoyés par l'app iPhone, comme pour une visite
// créée sur l'iPhone.

/** Bien proposé pour une visite (VisitListingChoice). */
type Choice = {
  snapshot: VisitListing;
  source: 'mine' | 'favorite' | 'conversation';
  conversationId: string | null;
  counterpartName: string | null;
};

const choiceKey = (choice: Choice) => `${choice.source}-${choice.snapshot.listingId}-${choice.conversationId ?? ''}`;

/** Instantané d'une annonce (VisitListingPicker.snapshot) : sa première photo en adresse publique. */
function snapshotOf(row: ListingRow): VisitListing {
  const photo = sortedPhotos(row)[0];
  return {
    listingId: row.id, title: row.title, price: row.price, transaction: row.transaction, city: row.city,
    coverImageURL: photo ? photoUrl(photo.storage_path) : null,
  };
}

/** Annonces de mes favoris, dans l'ordre des favoris ; celles que le serveur ne rend plus sont passées. */
async function favoriteChoices(ids: string[]): Promise<Choice[]> {
  const wanted = ids.filter((id) => UUID_PATTERN.test(id));
  if (!wanted.length) return [];
  const { data, error } = await supabase.from('listings').select(LISTING_COLUMNS).in('id', wanted);
  if (error) return [];
  const byId = new Map(((data ?? []) as unknown as ListingRow[]).map((row) => [row.id.toLowerCase(), row]));
  return wanted.flatMap((id) => {
    const row = byId.get(id.toLowerCase());
    return row ? [{ snapshot: snapshotOf(row), source: 'favorite' as const, conversationId: null, counterpartName: null }] : [];
  });
}

/** Conversations du compte (my_conversations), avec les noms des interlocuteurs. */
async function loadConversations(me: string | null): Promise<Conversation[]> {
  try {
    const rows = await fetchInboxRows();
    const others = rows.map((row) => row.other_user_id).filter((id): id is string => !!id);
    const profiles = await fetchProfiles(others);
    return rows.map((row) => conversationFrom(row, { me, profiles, participants: [], communities: [] }));
  } catch {
    return [];
  }
}

/** Feuille « Bien concerné » : recherche, Mes annonces, Mes favoris, Biens de mes conversations, ou une adresse. */
function ListingPicker({ open, conversations, onChoose, onManualAddress, onClose }: {
  open: boolean;
  conversations: Conversation[];
  onChoose: (choice: Choice) => void;
  onManualAddress: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const mineState = useStore(myListingsStore);
  const favoritesState = useStore(favoritesStore);
  const [favorites, setFavorites] = useState<Choice[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    void loadMyListings();
    void loadFavorites();
  }, [open]);

  const favoriteIds = favoritesState.items.map((item) => item.listing_id).join(',');
  useEffect(() => {
    if (!open || favoritesState.status === 'loading' || favoritesState.status === 'none') return;
    let alive = true;
    void favoriteChoices(favoriteIds ? favoriteIds.split(',') : []).then((loaded) => {
      if (!alive) return;
      setFavorites(loaded);
      setFavoritesLoaded(true);
    });
    return () => { alive = false; };
  }, [open, favoritesState.status, favoriteIds]);

  const mine: Choice[] = mineState.status === 'ready'
    ? mineState.items.map((row) => ({ snapshot: snapshotOf(row), source: 'mine', conversationId: null, counterpartName: null }))
    : [];
  const fromConversations: Choice[] = conversations
    .filter((conversation) => !conversation.isGroup && conversation.listing)
    .map((conversation) => ({
      snapshot: {
        listingId: conversation.listing!.listingId, title: conversation.listing!.title, price: conversation.listing!.price,
        transaction: conversation.listing!.transaction, city: conversation.listing!.city, coverImageURL: conversation.listing!.coverUrl,
      },
      source: 'conversation',
      conversationId: conversation.id,
      counterpartName: conversation.counterpart.name,
    }));
  const loading = mineState.status === 'loading' || mineState.status === 'none' || !favoritesLoaded;

  const text = normalized(query);
  const filtered = (choices: Choice[]) => (text
    ? choices.filter((choice) => normalized(`${choice.snapshot.title} ${choice.snapshot.city} ${choice.counterpartName ?? ''}`).includes(text))
    : choices);

  const section = (title: string, choices: Choice[], empty: string) => (
    <section className="dsc-picker-section" aria-label={title}>
      <h3>{title}</h3>
      {choices.length === 0 ? (
        <p className="dsc-picker-empty">{query ? 'Aucun résultat.' : empty}</p>
      ) : (
        <ul className="dsc-picker-list">
          {choices.map((choice) => (
            <li key={choiceKey(choice)}>
              <button type="button" className="dsc-picker-row" onClick={() => onChoose(choice)}>
                <Thumb url={choice.snapshot.coverImageURL} className="dsc-picker-photo" />
                <span className="dsc-picker-text">
                  <span className="dsc-picker-title">{choice.snapshot.title}</span>
                  <span className="dsc-picker-line">
                    {[choice.snapshot.city, choice.counterpartName !== null ? `avec ${choice.counterpartName}` : null].filter((part) => part !== null).join(' · ')}
                  </span>
                </span>
                <Icon name="chevronRight" className="icon dsc-chevron" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <Modal open={open} onClose={onClose} className="dsc-picker" labelledBy={titleId}>
      <div className="dsc-picker-body">
        <div className="dsc-picker-head">
          <h2 id={titleId}>Bien concerné</h2>
          <button type="button" className="dsc-button dsc-button-quiet" onClick={onClose}>Fermer</button>
        </div>
        <div className="dsc-picker-search">
          <Icon name="search" />
          <input type="search" aria-label="Rechercher un bien, une ville…" placeholder="Rechercher un bien, une ville…" value={query}
            autoComplete="off" spellCheck={false} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <button type="button" className="dsc-picker-manual" onClick={onManualAddress}>
          <Icon name="pin" />
          <span className="dsc-picker-text">
            <span className="dsc-picker-title">Ajouter une adresse manuellement</span>
            <span className="dsc-picker-line">Pour un bien qui n'est pas dans NIDALO</span>
          </span>
          <Icon name="chevronRight" className="icon dsc-chevron" />
        </button>
        {loading ? <Spinner /> : (
          <>
            {section('Mes annonces', filtered(mine), 'Vous n\'avez pas encore d\'annonce.')}
            {section('Mes favoris', filtered(favorites), 'Aucun favori pour l\'instant : touchez le cœur d\'une annonce pour la retrouver ici.')}
            {section('Biens de mes conversations', filtered(fromConversations), 'Aucune conversation à propos d\'un bien.')}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Interrupteur avec icône (FeatureToggle). */
function Toggle({ icon, title, checked, onChange }: { icon: IconName; title: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="dsc-toggle">
      <Icon name={icon} />
      <span className="dsc-toggle-title">{title}</span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

/** Champ texte de l'app (TextInput) : libellé, « Non renseigné », erreur sous le champ. */
function TextField({ label, value, onChange, error, type = 'text', autoComplete, id: givenId }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  type?: 'text' | 'tel';
  autoComplete?: string;
  id?: string;
}) {
  const ownId = useId();
  const id = givenId ?? ownId;
  return (
    <div className={`dsc-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} className="dsc-input" type={type} inputMode={type === 'tel' ? 'tel' : undefined} placeholder="Non renseigné"
        value={value} autoComplete={autoComplete} maxLength={type === 'tel' ? 24 : 120}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-erreur` : undefined}
        onChange={(event) => onChange(type === 'tel' ? typingPhoneNumber(event.target.value) : event.target.value)} />
      {error && <p id={`${id}-erreur`} className="field-error">{error}</p>}
    </div>
  );
}

const visitAddressFetcher = (raw: string, _limit?: number, signal?: AbortSignal) => addressSuggestions(raw, 5, signal);

export function AddVisit({ fromAgenda }: { fromAgenda: boolean }) {
  const agenda = useStore(agendaStore);
  const back = fromAgenda ? accountPath('agenda') : accountPath();
  const [initialStart] = useState(() => defaultVisitStart(new Date()));
  const [listing, setListing] = useState<VisitListing | null>(null);
  const [linkedConversationId, setLinkedConversationId] = useState<string | null>(null);
  const [day, setDay] = useState(() => dayString(initialStart));
  const [time, setTime] = useState('10:00');
  const [durationMinutes, setDurationMinutes] = useState<number | null>(45);
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isAddressHidden, setIsAddressHidden] = useState(false);
  const [participants, setParticipants] = useState<VisitParticipant[]>([]);
  const [adding, setAdding] = useState(false);
  const [participantName, setParticipantName] = useState('');
  const [participantPhone, setParticipantPhone] = useState('');
  const [reminders, setReminders] = useState<VisitReminders>(DEFAULT_REMINDERS);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [acceptsDuplicate, setAcceptsDuplicate] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [iphoneOnly, setIphoneOnly] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const addressId = useId();

  useEffect(() => {
    void loadAgenda();
    void loadConversations(currentUserId()).then(setConversations);
  }, []);

  const start = useMemo(() => {
    const [year, month, date] = day.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    const value = new Date(year, (month || 1) - 1, date || 1, hours || 0, minutes || 0, 0, 0);
    return Number.isNaN(value.getTime()) || !year ? initialStart : value;
  }, [day, time, initialStart]);

  const trimmedAddress = address.trim();
  const normalizedPhone = normalizedPhoneNumber(phone);
  const isPhoneInvalid = phone.trim() !== '' && normalizedPhone === null;
  const canSave = (listing !== null || trimmedAddress !== '') && !isPhoneInvalid && !saving && saved === null;
  const existing = upcomingVisitForListing(listing?.listingId ?? null, agenda.visits, new Date());
  const participantPhoneInvalid = participantPhone !== '' && normalizedPhoneNumber(participantPhone) === null;

  const snapshot = JSON.stringify([listing?.listingId ?? null, start.getTime(), durationMinutes, contactName, phone, address, participants, reminders, isConfirmed]);
  const [initialSnapshot] = useState(snapshot);
  const hasChanges = snapshot !== initialSnapshot;

  /** Interlocuteurs des conversations à deux, pas encore ajoutés (domiaContacts). */
  const contactNames = [...new Set(conversations.filter((conversation) => !conversation.isGroup).map((conversation) => conversation.counterpart.name))]
    .filter((name) => !participants.some((participant) => participant.name === name))
    .sort();

  /** Bien choisi : contact (agence ou vendeur, numéro publié) et adresse, exacte seulement si l'annonce la publie. */
  async function choose(choice: Choice) {
    setPickerOpen(false);
    setListing(choice.snapshot);
    setLinkedConversationId(choice.conversationId);
    setAcceptsDuplicate(false);
    const counterpart = choice.counterpartName;
    if (counterpart) setContactName((current) => (current === '' ? counterpart : current));
    const { data, error: readError } = await supabase.from('listings')
      .select('id, owner_id, city, postal_code, location_precision, public_street').eq('id', choice.snapshot.listingId).limit(1);
    const row = (data as { id: string; owner_id: string; city: string; postal_code: string; location_precision: string; public_street: string | null }[] | null)?.[0];
    if (readError || !row) return;
    const isMine = row.owner_id.toLowerCase() === (currentUserId() ?? '').toLowerCase();
    const [profiles, location] = await Promise.all([
      fetchProfiles([row.owner_id]),
      isMine
        ? supabase.from('listing_locations').select('listing_id, street, latitude, longitude').eq('listing_id', row.id)
        : Promise.resolve({ data: null, error: null }),
    ]);
    // Comme l'app (listingRepository.details) : une lecture refusée de mon adresse laisse le formulaire tel quel.
    if (location.error) return;
    const profile = profiles.get(row.owner_id.toLowerCase()) ?? null;
    const owner = profile ? { ...profile, agency_id: profile.agency_id ?? null } : null;
    setContactName((current) => (current === '' ? visitContactFor(owner) : current));
    const published = visitPhoneFor(owner);
    if (published) setPhone((current) => (current === '' ? formattedPhoneNumber(published) : current));
    const privateStreet = ((location.data as { street: string | null }[] | null)?.[0]?.street) ?? null;
    const proposed = visitAddressFor(row, isMine, privateStreet);
    setAddress(proposed.address);
    setIsAddressHidden(proposed.isHidden);
  }

  function removeListing() {
    setListing(null);
    setLinkedConversationId(null);
    setIsAddressHidden(false);
    setAcceptsDuplicate(false);
  }

  function addParticipant() {
    const name = participantName.trim();
    if (!name) return;
    setParticipants([...participants, { id: newUUID(), name, phone: normalizedPhoneNumber(participantPhone) }]);
    resetParticipant();
  }

  function resetParticipant() {
    setParticipantName('');
    setParticipantPhone('');
    setAdding(false);
  }

  async function save() {
    if (!canSave) return;
    setError(null);
    setSaving(true);
    const failure = await createVisit({
      id: newUUID(), listing, linkedConversationId, start, durationMinutes, contactName, phone, address, participants, reminders,
      isConfirmed, createdAt: new Date(),
    });
    setSaving(false);
    if (failure) {
      // Le formulaire reste ouvert, avec la saisie.
      setError(failure);
      return;
    }
    setSaved(['Visite enregistrée', remindersSummary(reminders)].filter(Boolean).join(' · '));
    window.setTimeout(() => window.location.assign(back), 1300);
  }

  function leave() {
    if (hasChanges && saved === null) setLeaving(true);
    else window.location.assign(back);
  }

  const existingDate = existing ? visitDateLong(existing.start) : '';

  return (
    <div className="dsc dsc-form-screen">
      <ScreenHead
        title="Nouvelle visite"
        onBack={leave}
        action={(
          <button type="button" className="dsc-button dsc-button-primary" onClick={() => void save()} disabled={!canSave}
            aria-describedby={!canSave && !saving ? `${addressId}-aide` : undefined}>
            {saving ? <span className="spinner dsc-button-spinner" role="status" aria-label="Enregistrement" /> : 'Enregistrer'}
          </button>
        )}
      />
      <p id={`${addressId}-aide`} className="visually-hidden">Choisissez un bien ou indiquez une adresse</p>
      {saved && <div className="dsc-saved" role="status"><Icon name="check" />{saved}</div>}

      <section className="dsc-card" aria-labelledby={`${addressId}-bien`}>
        <h2 id={`${addressId}-bien`} className="dsc-card-title">Bien concerné</h2>
        {listing ? (
          <>
            <div className="dsc-chosen">
              <Thumb url={listing.coverImageURL} className="dsc-chosen-photo" />
              <span className="dsc-chosen-text">
                <span className="dsc-chosen-title">{listing.title}</span>
                <span className="dsc-chosen-city">{listing.city}</span>
              </span>
            </div>
            <div className="dsc-small-row">
              <button type="button" className="dsc-small" onClick={() => setPickerOpen(true)}><Icon name="arrowLeftRight" />Changer</button>
              <button type="button" className="dsc-small" onClick={removeListing}><Icon name="x" />Retirer</button>
            </div>
          </>
        ) : (
          <>
            <button type="button" className="dsc-choose" onClick={() => setPickerOpen(true)}>
              <Icon name="search" />
              <span>Choisir un bien</span>
              <Icon name="chevronRight" className="icon dsc-chevron" />
            </button>
            <InfoLine>Une de vos annonces, un favori ou le bien d'une conversation ; sinon, indiquez simplement l'adresse plus bas.</InfoLine>
          </>
        )}
      </section>

      {existing && !acceptsDuplicate && (
        <div className="dsc-duplicate" role="status">
          <p><Icon name="triangleAlert" />{`Vous avez déjà une visite pour ce bien le ${existingDate.charAt(0).toLowerCase()}${existingDate.slice(1)}.`}</p>
          <div className="dsc-small-row">
            <a className="dsc-small" href={accountPath('agenda')}><Icon name="calendar" />Voir la visite</a>
            <button type="button" className="dsc-small" onClick={() => setAcceptsDuplicate(true)}><Icon name="calendarPlus" />Programmer quand même</button>
          </div>
        </div>
      )}

      <section className="dsc-card" aria-labelledby={`${addressId}-date`}>
        <h2 id={`${addressId}-date`} className="dsc-card-title">Date et heure</h2>
        <div className="dsc-inline-field">
          <label htmlFor={`${addressId}-jour`}>Date</label>
          <input id={`${addressId}-jour`} className="dsc-input dsc-input-auto" type="date" value={day} required
            onChange={(event) => { if (event.target.value) setDay(event.target.value); }} />
        </div>
        <div className="dsc-inline-field">
          <label htmlFor={`${addressId}-heure`}>Heure de début</label>
          <input id={`${addressId}-heure`} className="dsc-input dsc-input-auto" type="time" value={time} required
            onChange={(event) => { if (event.target.value) setTime(event.target.value); }} />
        </div>
        <div className="dsc-field" role="group" aria-labelledby={`${addressId}-duree`}>
          <span id={`${addressId}-duree`} className="dsc-label">Durée</span>
          <div className="dsc-grid-3">
            {VISIT_DURATIONS.map((minutes) => (
              <button key={minutes} type="button" className="choice-chip expands" aria-pressed={durationMinutes === minutes}
                onClick={() => setDurationMinutes(durationMinutes === minutes ? null : minutes)}>
                {durationLabel(minutes)}
              </button>
            ))}
          </div>
        </div>
        <p className="dsc-end">
          <Icon name="clock" />
          {durationMinutes !== null ? `Fin : ${clock(new Date(start.getTime() + durationMinutes * 60_000))}` : 'Durée non précisée'}
        </p>
        {start.getTime() < Date.now() && (
          <InfoLine>Cette date est passée : la visite ira dans « Passées », où vous pourrez remplir son compte rendu.</InfoLine>
        )}
      </section>

      <section className="dsc-card" aria-labelledby={`${addressId}-rdv`}>
        <h2 id={`${addressId}-rdv`} className="dsc-card-title">Rendez-vous</h2>
        <TextField label="Contact ou agence" value={contactName} onChange={setContactName} autoComplete="name" />
        <div className="dsc-field-block">
          <TextField label="Téléphone du contact (facultatif)" type="tel" value={phone} onChange={setPhone} autoComplete="tel"
            error={isPhoneInvalid ? 'Numéro incomplet : 10 chiffres, par exemple 06 12 34 56 78.' : null} />
          {normalizedPhone && (
            <a className="dsc-small" href={telHref(normalizedPhone)}><Icon name="phone" />Appeler {formattedPhoneNumber(normalizedPhone)}</a>
          )}
        </div>
        <div className="dsc-field-block">
          <span className="dsc-label" aria-hidden="true">Adresse du rendez-vous</span>
          <PlaceField value={address} label="Adresse du rendez-vous" placeholder="Numéro, rue, ville" className="dsc-place dsc-place-plain"
            fetcher={visitAddressFetcher}
            onChange={(text) => setAddress(text)}
            onChoose={(place) => { setAddress(fullLabel(place)); setIsAddressHidden(false); }} />
          {isAddressHidden && <InfoLine>Adresse exacte à demander au vendeur : l'annonce n'indique que la commune.</InfoLine>}
          {trimmedAddress && (
            <div className="dsc-small-row">
              <a className="dsc-small" href={directionsUrl(trimmedAddress)} target="_blank" rel="noopener noreferrer"><Icon name="map" />Plans</a>
              <a className="dsc-small" href={googleMapsUrl(trimmedAddress)} target="_blank" rel="noopener noreferrer"><Icon name="navigation" />Google Maps</a>
            </div>
          )}
        </div>
        <div className="dsc-field-block" role="group" aria-labelledby={`${addressId}-participants`}>
          <span id={`${addressId}-participants`} className="dsc-label">Participants</span>
          {participants.map((participant) => (
            <div key={participant.id} className="dsc-participant">
              <Icon name="user" />
              <span className="dsc-participant-text">
                <span className="dsc-participant-name">{participant.name}</span>
                {participant.phone && <span className="dsc-participant-phone">{formattedPhoneNumber(participant.phone)}</span>}
              </span>
              <button type="button" className="dsc-participant-remove" aria-label={`Retirer ${participant.name}`}
                onClick={() => setParticipants(participants.filter((other) => other.id !== participant.id))}>
                <Icon name="x" />
              </button>
            </div>
          ))}
          {adding ? (
            <div className="dsc-field-block">
              <TextField label="Nom" value={participantName} onChange={setParticipantName} autoComplete="name" />
              <TextField label="Téléphone (facultatif)" type="tel" value={participantPhone} onChange={setParticipantPhone}
                error={participantPhoneInvalid ? 'Numéro incomplet.' : null} />
              <div className="dsc-small-row">
                <button type="button" className="dsc-small" onClick={resetParticipant}><Icon name="x" />Annuler</button>
                <button type="button" className="dsc-small" onClick={addParticipant} disabled={!participantName.trim() || participantPhoneInvalid}>
                  <Icon name="check" />Ajouter
                </button>
              </div>
            </div>
          ) : (
            <div className="dsc-small-row">
              <button type="button" className="dsc-small" onClick={() => setAdding(true)}><Icon name="userPlus" />Ajouter un participant</button>
              {contactNames.length > 0 && (
                <ActionMenu label="Contact NIDALO" triggerClassName="dsc-small" trigger={<><Icon name="users" />Contact NIDALO</>}
                  items={contactNames.map((name) => ({
                    label: name,
                    onClick: () => setParticipants((current) => [...current, { id: newUUID(), name, phone: null }]),
                  }))} />
              )}
            </div>
          )}
          <InfoLine>Les participants ne sont pas prévenus automatiquement tant que la messagerie en ligne n'existe pas : partagez la visite depuis son détail.</InfoLine>
        </div>
      </section>

      <button type="button" className="dsc-card dsc-prepare" onClick={() => setIphoneOnly('Préparer ma visite')}>
        <span className="dsc-prepare-icon"><Icon name="clipboardCheck" /></span>
        <span className="dsc-prepare-text">
          <span className="dsc-prepare-title">Préparer ma visite</span>
          <span className="dsc-prepare-subtitle">Questions à poser, points à vérifier, travaux, notes…</span>
          <span className="dsc-iphone-note">{IPHONE_ONLY}</span>
        </span>
        <Icon name="chevronRight" className="icon dsc-chevron" />
      </button>

      <section className="dsc-card" aria-labelledby={`${addressId}-rappels`}>
        <h2 id={`${addressId}-rappels`} className="dsc-card-title">Rappels et suivi</h2>
        <Toggle icon="calendar" title="La veille, à 18 h" checked={reminders.eveningBefore} onChange={(value) => setReminders({ ...reminders, eveningBefore: value })} />
        <Toggle icon="clock" title="2 heures avant" checked={reminders.twoHoursBefore} onChange={(value) => setReminders({ ...reminders, twoHoursBefore: value })} />
        <Toggle icon="bell" title="Rappel personnalisé" checked={reminders.customMinutesBefore !== null}
          onChange={(value) => setReminders({ ...reminders, customMinutesBefore: value ? (reminders.customMinutesBefore ?? 30) : null })} />
        {reminders.customMinutesBefore !== null && (
          <label className="dsc-select">
            <span className="visually-hidden">Rappel personnalisé</span>
            <select value={reminders.customMinutesBefore} onChange={(event) => setReminders({ ...reminders, customMinutesBefore: Number(event.target.value) })}>
              {CUSTOM_REMINDER_CHOICES.map((choice) => <option key={choice} value={choice}>{reminderLabel(choice)} avant</option>)}
            </select>
            <Icon name="chevronDown" />
          </label>
        )}
        <Toggle icon="badgeCheck" title="Confirmée par le contact" checked={isConfirmed} onChange={setIsConfirmed} />
        <InfoLine>
          {isConfirmed
            ? 'La visite apparaît « Confirmée » dans votre agenda.'
            : 'La visite apparaît « En attente » jusqu\'à ce que vous l\'indiquiez confirmée.'}
        </InfoLine>
        <div className="dsc-toggle is-iphone">
          <Icon name="calendarPlus" />
          <span className="dsc-toggle-title">Ajouter à mon calendrier</span>
          <span className="dsc-toggle-note">{IPHONE_ONLY}</span>
        </div>
      </section>

      {error && <p className="field-error dsc-form-error" role="alert">{error}</p>}

      <ListingPicker open={pickerOpen} conversations={conversations} onClose={() => setPickerOpen(false)}
        onChoose={(choice) => void choose(choice)}
        onManualAddress={() => {
          setPickerOpen(false);
          window.setTimeout(() => document.querySelector<HTMLInputElement>('.dsc-place input')?.focus(), 50);
        }} />
      <ChoiceDialog
        open={leaving}
        title="Quitter sans enregistrer ?"
        message="Les modifications de cette visite seront perdues."
        onClose={() => setLeaving(false)}
        actions={[
          { label: 'Quitter sans enregistrer', onClick: () => window.location.assign(back), tone: 'danger' },
          { label: 'Continuer la saisie', onClick: () => setLeaving(false) },
        ]}
      />
      <IphoneOnlyDialog title={iphoneOnly} onClose={() => setIphoneOnly(null)} />
    </div>
  );
}
