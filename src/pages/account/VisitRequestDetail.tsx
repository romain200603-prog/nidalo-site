import { useEffect, useState, type ReactNode } from 'react';
import { HidesTabBar } from '../../components/HidesTabBar';
import { Icon } from '../../components/Icon';
import { OfflineState } from '../../components/OfflineState';
import { PageHeader } from '../../components/PageHeader';
import {
  agendaStore, CONVERSATION_NOT_FOUND, findExistingConversation, loadAgenda, visitEnd, type AgendaRequestRow,
} from '../../lib/account/agenda';
import { useSession, useStore } from '../../lib/account/session';
import { formatPrice } from '../../lib/format';
import { openListingConversation } from '../../lib/listing/conversation';
import {
  allowedActions, cancelVisitRequest, canProposeAnotherDate, changedMeanwhile, confirmedRanges, conflicts, declineVisitRequest, eventDate,
  eventText, fetchRequest, isRescheduling, openSlotsTitle, otherParty, requestActionMessage, requestExplanation, requestHistory,
  requestOpenSlots, requestRole, slotDuration, type DetailRequestRow,
} from '../../lib/listing/requestDetail';
import {
  areValidSlots, dayString, INVALID_SLOTS_MESSAGE, isSlotPast, REQUEST_STATUS_LABELS, requestDisplayStatus, requestSlotLabel,
  slotHourLabel, SLOT_TIMES, slotStart, suggestedSlot, type SlotDraft, type VisitRequestDisplayStatus, type VisitSlot,
} from '../../lib/listing/visits';
import { photoUrl } from '../../lib/listings';
import { acceptVisitRequest, proposeVisitSlots } from '../../lib/messages/visitRequests';
import { accountPath, conversationPath, listingPath, visitRequestPath } from '../../lib/paths';
import { AlertDialog } from '../listing/Dialogs';
import { Spinner } from './parts';
import '../../styles/agenda-app.css';

// « Demande de visite » (/compte/?vue=demande-visite&id=…), comme l'app (Features/Visits/VisitRequestDetailView.swift) :
// le bien, l'état et l'autre personne, la visite confirmée, les créneaux ouverts avec « Accepter ce créneau »
// (chevauchement signalé), le message, les demandes liées, puis « Proposer une autre date » (après un refus, le
// formulaire de la fiche), « Proposer d'autres créneaux », « Refuser » (motif facultatif), « Annuler », « Écrire à … » et
// l'historique. Les réponses partent avec les fonctions de l'app (accept_visit_request, decline_visit_request,
// propose_visit_slots, cancel_visit_request), puis la demande est relue. L'écran de l'app (retour rond, titre centré)
// sur toutes les largeurs.

const TONES: Record<VisitRequestDisplayStatus, string> = {
  accepted: 'green', pending: 'amber', counterProposed: 'blue', declined: 'red', cancelled: 'red', past: 'gray',
};

const time = (iso: string) => new Date(iso).getTime();
const sameId = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Badge discret du statut (VisitRequestStatusBadge) : « Changement proposé » pendant un changement de créneau. */
export function RequestStatusBadge({ status, rescheduling }: { status: VisitRequestDisplayStatus; rescheduling: boolean }) {
  return <span className={`app-request-badge app-tone-${TONES[status]}`}>{rescheduling ? 'Changement proposé' : REQUEST_STATUS_LABELS[status]}</span>;
}

/** « Jeu. 5 nov. · 10 h 00 · 1 h » (slotLine), vert quand la visite est confirmée. */
function SlotLine({ slot, highlight }: { slot: VisitSlot; highlight: boolean }) {
  return (
    <p className={`app-request-slot${highlight ? ' is-confirmed' : ''}`}>
      <Icon name={highlight ? 'calendarCheck' : 'calendar'} />
      <strong>{requestSlotLabel(new Date(slot.start))}</strong>
      <span>{`· ${slotDuration(slot.durationMinutes)}`}</span>
    </p>
  );
}

/** Carte titrée de l'app (SectionCard) : icône bleue et titre, puis le contenu. */
function Section({ title, icon, children }: { title: string; icon: 'calendar' | 'calendarCheck' | 'messageCircle' | 'clock'; children: ReactNode }) {
  return (
    <section className="app-request-section">
      <h2><Icon name={icon} />{title}</h2>
      {children}
    </section>
  );
}

/** Initiales sur un rond (PublisherAvatar sans photo) : le site ne lit pas la photo de l'autre personne. */
function Avatar({ name, agency }: { name: string; agency: boolean }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toLocaleUpperCase('fr-FR')).join('');
  return <span className={`app-request-avatar${agency ? ' is-agency' : ''}`} aria-hidden="true">{letters || '?'}</span>;
}

/** Jour et heure d'un créneau proposé (SlotPickerRow). */
function SlotPickerRow({ title, draft, onChange, conflict }: { title: string; draft: SlotDraft; onChange: (draft: SlotDraft) => void; conflict: boolean }) {
  const id = `creneau-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="app-request-picker">
      <span className="app-request-picker-title" id={id}>{title}</span>
      <div className="app-request-picker-row">
        <input type="date" className="app-request-date" min={dayString(new Date())} value={draft.day} aria-labelledby={id}
          onChange={(event) => onChange({ ...draft, day: event.currentTarget.value })} />
        <span className="app-request-time">
          <Icon name="clock" />
          <select value={draft.minutes} aria-label={`Heure : ${slotHourLabel(draft.minutes)}`}
            onChange={(event) => onChange({ ...draft, minutes: Number(event.currentTarget.value) })}>
            {SLOT_TIMES.map((minutes) => <option key={minutes} value={minutes}>{slotHourLabel(minutes)}</option>)}
          </select>
          <Icon name="chevronDown" />
        </span>
      </div>
      {isSlotPast(draft, new Date()) ? <p className="app-request-error">Ce créneau est déjà passé.</p>
        : conflict ? <p className="app-request-conflict"><Icon name="triangleAlert" />Une visite déjà confirmée chevauche ce créneau.</p> : null}
    </div>
  );
}

const CHOICES = ['Premier choix', 'Deuxième choix', 'Troisième choix'];

/** « Proposer d'autres créneaux » (ProposeSlotsSheet) : 1 à 3 créneaux, avec l'avertissement de chevauchement. */
function ProposeSlots({ request, busy, sending, onClose, onSend }: {
  request: DetailRequestRow;
  busy: { start: number; end: number }[];
  sending: boolean;
  onClose: () => void;
  onSend: (starts: Date[]) => void;
}) {
  const [drafts, setDrafts] = useState<SlotDraft[]>(() => [suggestedSlot(new Date())]);
  const [error, setError] = useState<string | null>(null);
  const title = request.status === 'accepted' ? 'Proposer un autre créneau' : 'Proposer d\'autres créneaux';
  const send = () => {
    const starts = drafts.map(slotStart);
    if (starts.some((start) => start === null) || !areValidSlots(starts.map((start) => ({ start: start as Date, durationMinutes: 60 })), new Date())) {
      setError(INVALID_SLOTS_MESSAGE);
      return;
    }
    setError(null);
    onSend(starts as Date[]);
  };
  return (
    <div className="app-request">
      <PageHeader title={title} onBack={onClose} />
      <div className="app-request-body">
        {request.status === 'accepted' && (
          <p className="app-request-note">La visite reste confirmée sur son créneau actuel tant que l'autre personne n'a pas accepté le nouveau.</p>
        )}
        <Section title="Créneaux" icon="calendar">
          {drafts.map((draft, index) => {
            const start = slotStart(draft);
            const conflict = start !== null && conflicts({ start: start.getTime(), end: start.getTime() + 3_600_000 }, busy);
            return (
              <SlotPickerRow key={CHOICES[index]} title={CHOICES[index]} draft={draft} conflict={conflict}
                onChange={(next) => setDrafts((current) => current.map((item, at) => (at === index ? next : item)))} />
            );
          })}
          <div className="app-request-picker-actions">
            {drafts.length < 3 && (
              <button type="button" onClick={() => setDrafts((current) => {
                const last = slotStart(current[current.length - 1]);
                return [...current, suggestedSlot(new Date(), last)];
              })}>Ajouter un créneau</button>
            )}
            {drafts.length > 1 && <button type="button" onClick={() => setDrafts((current) => current.slice(0, -1))}>Retirer le dernier</button>}
          </div>
        </Section>
        {error && <p className="app-request-error" role="alert">{error}</p>}
      </div>
      <div className="app-request-bar">
        <button type="button" className="app-request-primary" disabled={sending} aria-busy={sending} onClick={send}>Envoyer la proposition</button>
      </div>
    </div>
  );
}

export function VisitRequestDetail({ requestId }: { requestId: string | null }) {
  const state = useStore(agendaStore);
  const session = useSession();
  const me = session.status === 'signedIn' ? session.userId : null;
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAccept, setPendingAccept] = useState<VisitSlot | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [missingConversation, setMissingConversation] = useState(false);

  useEffect(() => {
    if (agendaStore.get().status !== 'ready') void loadAgenda();
  }, []);

  const request = (state.requests.find((item) => sameId(item.id, requestId)) ?? null) as DetailRequestRow | null;
  const now = new Date();
  const back = accountPath('agenda');

  /** Remplace la demande relue dans l'agenda (les autres écrans la voient aussi). */
  const replace = (fresh: DetailRequestRow | null) => {
    if (!fresh) return;
    const current = agendaStore.get();
    agendaStore.set({ ...current, requests: current.requests.map((item) => (sameId(item.id, fresh.id) ? fresh as AgendaRequestRow : item)) });
  };

  /** Réponse au serveur, puis la demande relue ; un refus montre son message (et la demande relue si elle a changé). */
  async function run(action: () => Promise<void>) {
    if (!request || working) return;
    setWorking(true);
    setPendingAccept(null);
    try {
      await action();
      replace(await fetchRequest(request.id));
      setError(null);
    } catch (failure) {
      setError(requestActionMessage(failure));
      if (changedMeanwhile(failure)) replace(await fetchRequest(request.id).catch(() => null));
    } finally {
      setWorking(false);
    }
  }

  /** « Écrire à … » : demande envoyée, la conversation avec le vendeur ; reçue, celle déjà ouverte avec le demandeur. */
  async function write(target: DetailRequestRow) {
    const listingId = target.listing_snapshot?.listingId ?? target.listing_id;
    if (!listingId) return;
    if (requestRole(target, me) === 'recipient') {
      const found = await findExistingConversation(listingId, target.requester.userId);
      if (found) window.location.assign(conversationPath(found));
      else setMissingConversation(true);
      return;
    }
    const conversation = await openListingConversation(listingId, me);
    if (conversation) window.location.assign(conversationPath(conversation.id));
    else setMissingConversation(true);
  }

  const header = <PageHeader title="Demande de visite" back={back} history />;

  let content;
  if (!request && (state.status === 'loading' || state.status === 'none')) {
    content = <Spinner label="Chargement de la demande…" />;
  } else if (!request && state.status === 'error' && state.offline) {
    content = <OfflineState onRetry={() => void loadAgenda()} />;
  } else if (!request) {
    content = <p className="app-request-missing">Cette demande n'existe plus.</p>;
  } else {
    content = detailContent(request);
  }

  function detailContent(target: DetailRequestRow) {
    const allowed = allowedActions(target, me, now);
    const other = otherParty(target, me);
    const status = requestDisplayStatus(target, now);
    const rescheduling = isRescheduling(target) && status !== 'past';
    const open = requestOpenSlots(target);
    const snapshot = target.listing_snapshot ?? {};
    const listingId = snapshot.listingId ?? target.listing_id;
    const busy = confirmedRanges(state.requests as DetailRequestRow[], target.id,
      state.visits.filter((visit) => visit.status === 'confirmed').map((visit) => ({ start: visit.start, end: visitEnd(visit), requestId: visit.requestId })), now);
    const previous = target.previous_request_id ? state.requests.find((item) => sameId(item.id, target.previous_request_id)) : null;
    const next = (state.requests as DetailRequestRow[]).find((item) => sameId(item.previous_request_id, target.id)) ?? null;
    const price = Number(snapshot.price ?? 0);
    const history = [...requestHistory(target)].reverse();
    return (
      <div className="app-request-body">
        <a className="app-request-listing" href={listingId ? listingPath(listingId) : undefined}>
          <span className="app-request-thumb" aria-hidden="true">
            {snapshot.coverPath ? <img src={photoUrl(snapshot.coverPath)} alt="" /> : <Icon name="home" />}
          </span>
          <span className="app-request-listing-text">
            <span className="app-request-listing-title">{snapshot.title ?? 'Annonce'}</span>
            {snapshot.city && <span className="app-request-listing-city">{snapshot.city}</span>}
            {price > 0 && <span className="app-request-listing-price">{formatPrice(price) + (snapshot.transaction === 'rent' ? '/mois' : '')}</span>}
          </span>
          <Icon name="chevronRight" className="icon app-row-chevron" />
        </a>

        <div className="app-request-card">
          <div className="app-request-card-top">
            <RequestStatusBadge status={status} rescheduling={rescheduling} />
            <span className="app-request-mode"><Icon name={target.mode === 'video' ? 'video' : 'pin'} />{target.mode === 'video' ? 'En visio' : 'Sur place'}</span>
          </div>
          <div className="app-request-person">
            <Avatar name={other.name} agency={other.kind === 'agency'} />
            <span>
              <span className="app-request-person-name">
                {other.name}
                <span className={`app-request-kind${other.kind === 'agency' ? ' is-pro' : ''}`}>{other.kind === 'agency' ? 'Pro' : 'Particulier'}</span>
              </span>
              <span className="app-request-person-role">{requestRole(target, me) === 'requester' ? 'Demande envoyée' : 'Demande reçue'}</span>
            </span>
          </div>
          <p className="app-request-explanation">{requestExplanation(target, me, status)}</p>
        </div>

        {target.accepted_slot && (
          <Section title={isRescheduling(target) ? 'Visite confirmée (créneau actuel)' : 'Visite confirmée'} icon="calendarCheck">
            <SlotLine slot={target.accepted_slot} highlight />
          </Section>
        )}

        {open.length > 0 && (
          <Section title={openSlotsTitle(target, me)} icon="calendar">
            {open.map((slot) => {
              const start = time(slot.start);
              const conflict = conflicts({ start, end: start + slot.durationMinutes * 60_000 }, busy);
              return (
                <div key={slot.id} className="app-request-open">
                  <SlotLine slot={slot} highlight={false} />
                  {allowed.has('accept') && (
                    <>
                      {conflict && <p className="app-request-conflict"><Icon name="triangleAlert" />Une visite déjà confirmée chevauche ce créneau.</p>}
                      <button type="button" className="app-request-primary" disabled={working || start <= now.getTime()}
                        onClick={() => (conflict ? setPendingAccept(slot) : void run(() => acceptVisitRequest(target.id, slot.id)))}>
                        Accepter ce créneau
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </Section>
        )}

        {target.message && (
          <Section title="Message" icon="messageCircle">
            <p className="app-request-message">{target.message}</p>
          </Section>
        )}

        {error && <p className="app-request-error" role="alert">{error}</p>}

        {previous && (
          <a className="app-request-link" href={visitRequestPath(previous.id)}>
            <Icon name="clock" /><span>Suite d'une demande refusée</span><Icon name="chevronRight" className="icon app-row-chevron" />
          </a>
        )}
        {next && (
          <a className="app-request-link" href={visitRequestPath(next.id)}>
            <Icon name="calendar" /><span>{`Nouvelle demande envoyée : ${REQUEST_STATUS_LABELS[requestDisplayStatus(next, now)]}`}</span>
            <Icon name="chevronRight" className="icon app-row-chevron" />
          </a>
        )}

        <div className="app-request-actions">
          {canProposeAnotherDate(target, me) && !next && listingId && (
            // Après un refus : le formulaire de la fiche, avec la demande refusée (mode et message repris).
            <a className={`app-request-primary${working ? ' is-disabled' : ''}`} href={`${listingPath(listingId, null, 'visite')}&precedente=${encodeURIComponent(target.id)}`}>
              <Icon name="calendarPlus" />Proposer une autre date
            </a>
          )}
          {allowed.has('propose') && (
            <button type="button" className="app-request-secondary" disabled={working} onClick={() => setProposing(true)}>
              {target.status === 'accepted' ? 'Proposer un autre créneau' : 'Proposer d\'autres créneaux'}
            </button>
          )}
          {allowed.has('decline') && (
            <button type="button" className="app-request-secondary" disabled={working} onClick={() => { setReason(''); setDeclining(true); }}>
              {isRescheduling(target) ? 'Refuser le changement' : 'Refuser'}
            </button>
          )}
          {allowed.has('cancel') && (
            <button type="button" className="app-request-cancel" disabled={working} onClick={() => setCancelling(true)}>
              {target.status === 'accepted' || isRescheduling(target) ? 'Annuler la visite' : 'Annuler la demande'}
            </button>
          )}
          <button type="button" className="app-request-secondary" disabled={working} onClick={() => void write(target)}>
            <Icon name="messageCircle" />{`Écrire à ${other.name}`}
          </button>
        </div>

        {history.length > 0 && (
          <Section title="Historique" icon="clock">
            <ol className="app-request-history">
              {history.map((event) => (
                <li key={event.id}>
                  <span className="app-request-dot" aria-hidden="true" />
                  <span>
                    <span className="app-request-event">{eventText(event, target, me)}</span>
                    <span className="app-request-event-date">{eventDate(event.date)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        )}
      </div>
    );
  }

  if (proposing && request) {
    const busy = confirmedRanges(state.requests as DetailRequestRow[], request.id,
      state.visits.filter((visit) => visit.status === 'confirmed').map((visit) => ({ start: visit.start, end: visitEnd(visit), requestId: visit.requestId })), now);
    return (
      <>
        <HidesTabBar />
        <ProposeSlots request={request} busy={busy} sending={working} onClose={() => setProposing(false)}
          onSend={(starts) => { setProposing(false); void run(() => proposeVisitSlots(request.id, starts)); }} />
      </>
    );
  }

  const confirmed = request?.accepted_slot != null;
  return (
    <div className="app-request">
      {/* Comme l'app (hidesTabBar) : l'écran d'une demande masque la barre d'onglets. */}
      <HidesTabBar />
      {header}
      {content}
      <AlertDialog open={pendingAccept !== null} onClose={() => setPendingAccept(null)} title="Accepter ce créneau ?"
        message="Une visite déjà confirmée chevauche ce créneau."
        actions={[
          { label: 'Accepter quand même', onClick: () => { const slot = pendingAccept; if (slot && request) void run(() => acceptVisitRequest(request.id, slot.id)); } },
          { label: 'Annuler', role: 'cancel', onClick: () => setPendingAccept(null) },
        ]} />
      <AlertDialog open={declining} onClose={() => setDeclining(false)} dismissible={false} title="Refuser la demande ?"
        message={request && isRescheduling(request) ? 'La visite reste confirmée sur son créneau actuel.' : 'La personne verra que sa demande est refusée.'}
        actions={[
          { label: 'Refuser', role: 'destructive', onClick: () => { setDeclining(false); if (request) void run(() => declineVisitRequest(request.id, reason)); } },
          { label: 'Annuler', role: 'cancel', onClick: () => setDeclining(false) },
        ]}>
        <input className="app-request-reason" type="text" placeholder="Motif (facultatif)" aria-label="Motif (facultatif)" maxLength={500}
          value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
      </AlertDialog>
      <AlertDialog open={cancelling} onClose={() => setCancelling(false)} title={confirmed ? 'Annuler la visite ?' : 'Annuler la demande ?'}
        message={confirmed ? 'L\'autre personne verra que la visite est annulée, et elle sera retirée de votre agenda.' : 'L\'autre personne verra que la demande est annulée.'}
        actions={[
          { label: confirmed ? 'Annuler la visite' : 'Annuler la demande', role: 'destructive',
            onClick: () => { setCancelling(false); if (request) void run(() => cancelVisitRequest(request.id)); } },
          { label: 'Garder', role: 'cancel', onClick: () => setCancelling(false) },
        ]} />
      <AlertDialog open={missingConversation} onClose={() => setMissingConversation(false)} dismissible={false} title="Conversation introuvable"
        message={CONVERSATION_NOT_FOUND} actions={[{ label: 'OK', role: 'cancel', onClick: () => setMissingConversation(false) }]} />
    </div>
  );
}
