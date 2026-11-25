import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { SectionLabel } from '../../components/MenuRows';
import { PageHeader } from '../../components/PageHeader';
import { ListingPhoto } from '../../components/PhotoPager';
import { useDesktop } from '../../lib/desktop';
import { formatPrice } from '../../lib/format';
import {
  areValidSlots, bookOpenSlot, createVisitRequestParams, dayString, fetchOpenSlots, INVALID_SLOTS_MESSAGE, isSlotPast,
  previousRequestNotice, REQUEST_STATUS_LABELS, requestSlotLabel, sendVisitRequest, sessionDay, sessionHour, sessionRange,
  slotHourLabel, SLOT_TIMES, slotStart, suggestedSlot, visitErrorMessage, visitSessionErrorMessage, type OpenVisitSlot,
  type SlotDraft, type VisitMode, type VisitRequestRow,
} from '../../lib/listing/visits';
import { isOfflineFailure } from '../../lib/loadFailure';
import type { ListingRow, PhotoRow } from '../../lib/listings';
import { accountPath } from '../../lib/paths';
import { useFitTexts } from './fitText';
import { ExtraIcon } from './icons';

// « Demander une visite » (/annonce/?id=…&vue=visite), et dans une conversation de Messages : le formulaire de l'app
// (Features/Visits/VisitRequestFormView.swift, VisitRequestComponents.swift, OpenSlotsSection de VisitSessionViews.swift),
// mêmes champs, textes et règles. Sur téléphone, son écran : retour rond et titre centré (RentalHeader), vignette du bien,
// mention, créneaux ouverts par le vendeur (visites groupées, « Réserver »), cartes titrées, et la barre blanche du bas
// avec « Envoyer la demande », puis « Voir mon agenda » et « Fermer ». Sur ordinateur, la colonne de 640 px du site
// (titre et croix en haut, boutons à la fin) avec ces pièces. La demande part avec create_visit_request et les
// arguments de l'app (avec la demande refusée pour « Proposer une autre date ») ; un créneau ouvert se réserve avec
// book_visit_slot, et la visite est confirmée tout de suite.

const MODES: { value: VisitMode; label: string }[] = [{ value: 'onSite', label: 'Sur place' }, { value: 'video', label: 'En visio' }];

/** Photo de 64 (coins 12), titre, ville et prix du bien (VisitListingHeader), dans une carte (padding 12). */
function ListingHeader({ row, photo }: { row: ListingRow; photo: PhotoRow | undefined }) {
  return (
    <div className="dl-form-card dl-visit-listing">
      <span className="dl-visit-thumb" aria-hidden="true"><ListingPhoto photo={photo} /></span>
      <span className="dl-visit-listing-text">
        <span className="dl-visit-listing-title">{row.title}</span>
        <span className="dl-visit-listing-city">{row.city}</span>
        <span className="dl-visit-listing-price">{formatPrice(Number(row.price)) + (row.transaction === 'rent' ? '/mois' : '')}</span>
      </span>
    </div>
  );
}

/** Jour (calendrier du navigateur, à partir d'aujourd'hui) et heure (de 8 h 00 à 20 h 00) d'un créneau (SlotPickerRow). */
function SlotPicker({ id, title, draft, onChange, today }: {
  id: string;
  title: string;
  draft: SlotDraft;
  onChange: (draft: SlotDraft) => void;
  today: string;
}) {
  return (
    <div className="dl-slot">
      <span className="dl-label" id={`${id}-titre`}>{title}</span>
      <div className="dl-slot-row">
        <input
          className="dl-date"
          type="date"
          min={today}
          value={draft.day}
          aria-labelledby={`${id}-titre`}
          onChange={(event) => onChange({ ...draft, day: event.currentTarget.value })}
        />
        <span className="dl-time">
          <Icon name="clock" />
          <select
            value={draft.minutes}
            aria-label={`Heure : ${slotHourLabel(draft.minutes)}`}
            onChange={(event) => onChange({ ...draft, minutes: Number(event.currentTarget.value) })}
          >
            {SLOT_TIMES.map((minutes) => <option key={minutes} value={minutes}>{slotHourLabel(minutes)}</option>)}
          </select>
          <Icon name="chevronDown" className="icon dl-time-chevron" />
        </span>
      </div>
      {isSlotPast(draft, new Date()) && <p className="dl-error">Ce créneau est déjà passé.</p>}
    </div>
  );
}

/** Carte titrée de l'app (SectionCard) : titre de 18 gras, sans icône, puis le contenu. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dl-form-card dl-form-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** « Créneaux ouverts par le vendeur » (OpenSlotsSection) : chaque créneau à venir, ses places et « Réserver ». */
function OpenSlots({ slots, bookingId, seller, onBook }: {
  slots: OpenVisitSlot[];
  bookingId: string | null;
  seller: string;
  onBook: (slot: OpenVisitSlot) => void;
}) {
  const ref = useFitTexts<HTMLDivElement>();
  return (
    <section className="visit-open-slots" aria-labelledby="creneaux-ouverts">
      <SectionLabel id="creneaux-ouverts" title={`Créneaux ouverts par le ${seller}`} />
      <div className="visit-open-card" ref={ref}>
        {slots.map((slot) => (
          <div key={slot.id} className="visit-open-slot">
            <span className="visit-open-text">
              <span className="visit-open-time" data-fit="0.8">{`${sessionDay(slot.start, false)} · ${sessionRange(slot.start, slot.end)}`}</span>
              <span className="visit-open-places">{slot.placesLeft > 1 ? `${slot.placesLeft} places` : slot.placesLeft === 1 ? '1 place' : 'Complet'}</span>
            </span>
            {slot.bookedByMe ? (
              <span className="dl-status-badge is-pill app-tone-green">Réservé</span>
            ) : slot.bookable ? (
              <button type="button" className="visit-book" disabled={bookingId !== null} aria-busy={bookingId === slot.id}
                aria-label={`Réserver le créneau ${sessionDay(slot.start)} à ${sessionHour(slot.start)}`} onClick={() => onBook(slot)}>
                {bookingId === slot.id ? <span className="dl-spinner" aria-hidden="true" /> : 'Réserver'}
              </button>
            ) : (
              <span className="dl-status-badge is-pill app-tone-gray">Complet</span>
            )}
          </div>
        ))}
        <p className="visit-open-note">Réserver confirme la visite tout de suite : c'est le {seller} qui a ouvert ces créneaux.</p>
      </div>
    </section>
  );
}

export function VisitRequestScreen({ row, photo, recipientName, initialMode = 'onSite', previous = null, onClose, onSent }: {
  row: ListingRow;
  photo: PhotoRow | undefined;
  /** Particulier ou agence qui reçoit la demande, nommé dans la confirmation (« Claire M. », l'agence). */
  recipientName: string;
  /** « En visio » d'emblée quand l'annonce la propose (« Vidéo » des Détails d'une conversation, initialMode de l'app). */
  initialMode?: VisitMode;
  /** Demande refusée dont on propose une autre date : son mode et son message sont repris, la nouvelle demande la cite. */
  previous?: VisitRequestRow | null;
  onClose: () => void;
  /** Demande enregistrée (relue sur le serveur) : la fiche l'ajoute aux demandes du compte. */
  onSent: (request: VisitRequestRow) => void;
}) {
  const desktop = useDesktop();
  const [opened] = useState(() => new Date());
  const [first, setFirst] = useState<SlotDraft>(() => suggestedSlot(opened));
  const [second, setSecond] = useState<SlotDraft>(() => suggestedSlot(opened, new Date(opened.getFullYear(), opened.getMonth(), opened.getDate() + 1)));
  const [hasSecond, setHasSecond] = useState(false);
  const offersVideo = row.accepts_video_visits === true;
  /** « le propriétaire » pour une location (n° 74). */
  const seller = row.transaction === 'rent' ? 'propriétaire' : 'vendeur';
  const [mode, setMode] = useState<VisitMode>(() => (initialMode === 'video' && offersVideo && !previous ? 'video' : 'onSite'));
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Date[] | null>(null);
  const [openSlots, setOpenSlots] = useState<OpenVisitSlot[]>([]);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [booked, setBooked] = useState<OpenVisitSlot | null>(null);
  const busy = useRef(false);
  const today = dayString(new Date());

  // Visites groupées : les créneaux ouverts de l'annonce (list_open_slots), lus une fois (l'écran demande un compte).
  useEffect(() => {
    let cancelled = false;
    void fetchOpenSlots(row.id).then((slots) => { if (!cancelled) setOpenSlots(slots); });
    return () => { cancelled = true; };
  }, [row.id]);

  // « Proposer une autre date » : le mode (si l'annonce propose la visio) et le message de la demande refusée, repris
  // une fois, dès que la demande est lue (onAppear de l'app).
  const taken = useRef<string | null>(null);
  useEffect(() => {
    if (!previous || taken.current === previous.id) return;
    taken.current = previous.id;
    if (offersVideo) setMode(previous.mode);
    setMessage((current) => (current ? current : previous.message ?? ''));
  }, [previous, offersVideo]);

  const send = async () => {
    if (busy.current) return;
    const drafts = hasSecond ? [first, second] : [first];
    const slots = drafts.map((draft) => ({ id: crypto.randomUUID(), start: slotStart(draft) }));
    const starts = slots.map((slot) => slot.start).filter((start): start is Date => start !== null);
    // VisitRequest(…) de l'app : 1 à 3 créneaux à venir, sans chevauchement ; sinon rien ne part.
    if (starts.length !== slots.length || !areValidSlots(starts.map((start) => ({ start, durationMinutes: 60 })), new Date())) {
      setError(INVALID_SLOTS_MESSAGE);
      return;
    }
    busy.current = true;
    setSending(true);
    try {
      const request = await sendVisitRequest(createVisitRequestParams({
        id: crypto.randomUUID(),
        listingId: row.id,
        slots: slots.map((slot, index) => ({ id: slot.id, start: starts[index] })),
        message,
        mode: offersVideo ? mode : 'onSite',
        previousRequestId: previous?.id ?? null,
      }));
      setError(null);
      setSent(starts);
      onSent(request);
      window.scrollTo(0, 0);
    } catch (failure) {
      setError(visitErrorMessage(failure));
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  /** Réserve un créneau ouvert : la visite est confirmée ; un refus s'affiche et les créneaux sont relus. */
  const book = async (slot: OpenVisitSlot) => {
    if (busy.current) return;
    busy.current = true;
    setBookingId(slot.id);
    try {
      const request = await bookOpenSlot(slot, message);
      setError(null);
      setBooked(slot);
      if (request) onSent(request);
      window.scrollTo(0, 0);
    } catch (failure) {
      setError(visitSessionErrorMessage(failure, isOfflineFailure(failure)));
      setOpenSlots(await fetchOpenSlots(row.id));
    } finally {
      busy.current = false;
      setBookingId(null);
    }
  };

  const title = booked ? 'Visite confirmée' : sent ? 'Demande envoyée' : previous ? 'Proposer une autre date' : 'Demander une visite';
  const done = booked !== null || sent !== null;
  const actions = done ? (
    <div className="dl-screen-actions">
      <a className="dl-submit" href={accountPath('agenda')}>Voir mon agenda</a>
      <button type="button" className="dl-secondary" onClick={onClose}>Fermer</button>
    </div>
  ) : (
    <button type="submit" form="demande-visite" className="dl-submit" disabled={sending} aria-busy={sending}>
      {sending ? <span className="dl-spinner" aria-hidden="true" /> : <Icon name="send" />}
      Envoyer la demande
    </button>
  );

  return (
    <div className="wrap wrap-narrow dl-screen dl-visit-screen">
      {desktop ? (
        <header className="dl-screen-head">
          <div className="dl-screen-titles">
            <h1 tabIndex={-1}>{title}</h1>
          </div>
          <button type="button" className="dl-screen-close" onClick={onClose} aria-label="Fermer" title="Fermer">
            <Icon name="x" />
          </button>
        </header>
      ) : (
        <PageHeader title={title} onBack={onClose} className="visit-header" />
      )}

      <div className="visit-body">
        <ListingHeader row={row} photo={photo} />

        {booked ? (
          <div className="dl-form-card dl-sent">
            <div className="dl-sent-head">
              <span className="dl-sent-icon" aria-hidden="true"><Icon name="calendarCheck" /></span>
              <span className="dl-sent-titles">
                <span className="dl-sent-title">Visite confirmée</span>
                <span className="dl-status-badge is-pill app-tone-green">Confirmée</span>
              </span>
            </div>
            <ul className="dl-sent-slots">
              <li><ExtraIcon name="calendar" />{`${sessionDay(booked.start)} · ${sessionRange(booked.start, booked.end)}`}</li>
            </ul>
            <p className="dl-sent-text">Vous la retrouvez dans votre agenda (Mon compte), avec ses rappels.</p>
          </div>
        ) : sent ? (
          <div className="dl-form-card dl-sent">
            <div className="dl-sent-head">
              <span className="dl-sent-icon" aria-hidden="true"><Icon name="clock" /></span>
              <span className="dl-sent-titles">
                <span className="dl-sent-title">Demande envoyée</span>
                <span className="dl-status-badge is-pending">{REQUEST_STATUS_LABELS.pending}</span>
              </span>
            </div>
            <p className="dl-sent-text">
              Ce n'est pas encore une visite confirmée : {recipientName} doit choisir un créneau, ou en proposer un autre.
              {' Vous la retrouvez dans votre agenda (Mon compte).'}
            </p>
            <ul className="dl-sent-slots">
              {sent.map((start) => (
                <li key={start.toISOString()}><ExtraIcon name="calendar" />{requestSlotLabel(start)}</li>
              ))}
            </ul>
          </div>
        ) : (
          <form
            id="demande-visite"
            className="dl-form-stack"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <p className="dl-notice">
              <Icon name="info" />
              <span>Votre demande part chez le {seller} : il accepte un créneau ou en propose un autre, et vous êtes prévenu dans la cloche. Vous pouvez aussi lui écrire.</span>
            </p>

            {openSlots.length > 0 && !previous && (
              <OpenSlots slots={openSlots} bookingId={bookingId} seller={seller} onBook={(slot) => void book(slot)} />
            )}
            {previous && <p className="visit-previous">{previousRequestNotice(previous)}</p>}

            <Section title="Créneau souhaité">
              <SlotPicker id="premier-choix" title="Premier choix" draft={first} onChange={setFirst} today={today} />
              {hasSecond ? (
                <>
                  <SlotPicker id="deuxieme-choix" title="Deuxième choix" draft={second} onChange={setSecond} today={today} />
                  <button type="button" className="dl-link-button" onClick={() => setHasSecond(false)}>Retirer le deuxième choix</button>
                </>
              ) : (
                <button type="button" className="dl-link-button is-strong" onClick={() => setHasSecond(true)}>
                  <Icon name="calendarPlus" />
                  Ajouter un deuxième choix
                </button>
              )}
              <p className="dl-help">Chaque créneau dure environ une heure. Le {seller} ou l'agence choisit l'un d'eux, ou en propose un autre.</p>
            </Section>

            {offersVideo && (
              <Section title="Type de visite">
                <div className="dl-options">
                  {MODES.map((option) => (
                    <button key={option.value} type="button" className="dl-option" aria-pressed={mode === option.value} onClick={() => setMode(option.value)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Message (facultatif)">
              <textarea
                className="dl-textarea"
                rows={3}
                aria-label="Message (facultatif)"
                placeholder="Présentez-vous, précisez vos disponibilités…"
                value={message}
                onChange={(event) => setMessage(event.currentTarget.value)}
              />
            </Section>
          </form>
        )}
      </div>

      {/* Barre blanche du bas (safeAreaInset de l'app) sur téléphone ; à la fin de la colonne sur ordinateur. */}
      <div className="visit-bar">
        {error && <p className="dl-error visit-bar-error" role="alert">{error}</p>}
        {actions}
      </div>
    </div>
  );
}
