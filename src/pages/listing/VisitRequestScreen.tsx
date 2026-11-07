import { useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { ListingPhoto } from '../../components/PhotoPager';
import { formatPrice } from '../../lib/format';
import {
  areValidSlots, createVisitRequestParams, dayString, hourLabel, INVALID_SLOTS_MESSAGE, isSlotPast, REQUEST_STATUS_LABELS,
  sendVisitRequest, SLOT_TIMES, slotLabel, slotStart, suggestedSlot, visitErrorMessage, type SlotDraft, type VisitMode,
  type VisitRequestRow,
} from '../../lib/listing/visits';
import type { ListingRow, PhotoRow } from '../../lib/listings';
import { accountPath } from '../../lib/paths';
import { ExtraIcon } from './icons';

// « Demander une visite » sur ordinateur, dans une colonne de 640 px (/annonce/?id=…&vue=visite) : le formulaire de
// l'app (Features/Visits/VisitRequestFormView.swift et VisitRequestComponents.swift), mêmes champs, textes et règles.
// La demande part avec create_visit_request et les arguments de l'app, puis la confirmation « Demande envoyée ».

const MODES: { value: VisitMode; label: string }[] = [{ value: 'onSite', label: 'Sur place' }, { value: 'video', label: 'En visio' }];

/** Photo, titre, ville et prix du bien (VisitListingHeader). */
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

/** Jour (calendrier du navigateur, à partir d'aujourd'hui) et heure (de 8h00 à 20h00) d'un créneau (SlotPickerRow). */
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
            aria-label={`Heure : ${hourLabel(draft.minutes)}`}
            onChange={(event) => onChange({ ...draft, minutes: Number(event.currentTarget.value) })}
          >
            {SLOT_TIMES.map((minutes) => <option key={minutes} value={minutes}>{hourLabel(minutes)}</option>)}
          </select>
          <Icon name="chevronDown" className="icon dl-time-chevron" />
        </span>
      </div>
      {isSlotPast(draft, new Date()) && <p className="dl-error">Ce créneau est déjà passé.</p>}
    </div>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="dl-form-card dl-form-section">
      <h2>{icon}{title}</h2>
      {children}
    </section>
  );
}

export function VisitRequestScreen({ row, photo, recipientName, initialMode = 'onSite', onClose, onSent }: {
  row: ListingRow;
  photo: PhotoRow | undefined;
  /** Particulier ou agence qui reçoit la demande, nommé dans la confirmation (« Claire M. », l'agence). */
  recipientName: string;
  /** « En visio » d'emblée quand l'annonce la propose (« Vidéo » des Détails d'une conversation, initialMode de l'app). */
  initialMode?: VisitMode;
  onClose: () => void;
  /** Demande enregistrée (relue sur le serveur) : la fiche l'ajoute aux demandes du compte. */
  onSent: (request: VisitRequestRow) => void;
}) {
  const [opened] = useState(() => new Date());
  const [first, setFirst] = useState<SlotDraft>(() => suggestedSlot(opened));
  const [second, setSecond] = useState<SlotDraft>(() => suggestedSlot(opened, new Date(opened.getFullYear(), opened.getMonth(), opened.getDate() + 1)));
  const [hasSecond, setHasSecond] = useState(false);
  const offersVideo = row.accepts_video_visits === true;
  const [mode, setMode] = useState<VisitMode>(() => (initialMode === 'video' && offersVideo ? 'video' : 'onSite'));
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Date[] | null>(null);
  const busy = useRef(false);
  const today = dayString(new Date());

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

  return (
    <div className="wrap wrap-narrow dl-screen dl-visit-screen">
      <header className="dl-screen-head">
        <div className="dl-screen-titles">
          <h1 tabIndex={-1}>{sent ? 'Demande envoyée' : 'Demander une visite'}</h1>
        </div>
        <button type="button" className="dl-screen-close" onClick={onClose} aria-label="Fermer" title="Fermer">
          <Icon name="x" />
        </button>
      </header>

      <ListingHeader row={row} photo={photo} />

      {sent ? (
        <>
          <div className="dl-form-card dl-sent">
            <div className="dl-sent-head">
              <span className="dl-sent-icon" aria-hidden="true"><Icon name="clock" /></span>
              <span className="dl-sent-titles">
                <span className="dl-sent-title">Demande envoyée</span>
                <span className="dl-status-badge is-pending">{REQUEST_STATUS_LABELS.pending}</span>
              </span>
            </div>
            <p className="dl-sent-text">
              Ce n'est pas encore une visite confirmée : {recipientName} doit choisir un créneau, ou en proposer un autre. Vous la retrouvez dans Mon compte › Mon agenda.
            </p>
            <ul className="dl-sent-slots">
              {sent.map((start) => (
                <li key={start.toISOString()}><ExtraIcon name="calendar" />{slotLabel(start)}</li>
              ))}
            </ul>
          </div>
          <div className="dl-screen-actions">
            <a className="dl-submit" href={accountPath('agenda')}>Voir mon agenda</a>
            <button type="button" className="dl-secondary" onClick={onClose}>Fermer</button>
          </div>
        </>
      ) : (
        <form
          className="dl-form-stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <p className="dl-notice">
            <Icon name="info" />
            <span>Votre demande part chez le vendeur : il accepte un créneau ou en propose un autre, et vous êtes prévenu dans la cloche. Vous pouvez aussi lui écrire.</span>
          </p>

          <Section icon={<ExtraIcon name="calendar" />} title="Créneau souhaité">
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
            <p className="dl-help">Chaque créneau dure environ une heure. Le vendeur ou l'agence choisit l'un d'eux, ou en propose un autre.</p>
          </Section>

          {offersVideo && (
            <Section icon={<Icon name="video" />} title="Type de visite">
              <div className="dl-options">
                {MODES.map((option) => (
                  <button key={option.value} type="button" className="dl-option" aria-pressed={mode === option.value} onClick={() => setMode(option.value)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section icon={<Icon name="messageCircle" />} title="Message (facultatif)">
            <textarea
              className="dl-textarea"
              rows={4}
              aria-label="Message (facultatif)"
              placeholder="Présentez-vous, précisez vos disponibilités…"
              value={message}
              onChange={(event) => setMessage(event.currentTarget.value)}
            />
          </Section>

          {error && <p className="dl-error" role="alert">{error}</p>}
          <button type="submit" className="dl-submit" disabled={sending} aria-busy={sending}>
            {sending ? <span className="dl-spinner" aria-hidden="true" /> : <Icon name="send" />}
            Envoyer la demande
          </button>
        </form>
      )}
    </div>
  );
}
