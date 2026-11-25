import { supabase } from '../supabase';
import {
  requestDisplayStatus, sessionHour, type VisitRequestDisplayStatus, type VisitRequestRow, type VisitSlot,
} from './visits';

// Une demande de visite vue par l'un des deux comptes, comme l'app : règles de VisitRequest (ImmoDomain/Messaging/
// VisitRequest.swift : rôle, actions permises, créneaux ouverts, changement d'une visite confirmée), textes de
// l'écran « Demande de visite » (Features/Visits/VisitRequestDetailView.swift), onglets de « Mes visites »
// (Data/VisitRequestStore.swift) et réponses au serveur (Data/Supabase/SupabaseVisitRequestRepository.swift :
// decline_visit_request et cancel_visit_request ici ; accept_visit_request et propose_visit_slots sont déjà dans
// lib/messages/visitRequests). Après chaque réponse, la demande est relue (my_visit_requests avec p_request_id).

export type RequestRole = 'requester' | 'recipient';
export type RequestAction = 'accept' | 'decline' | 'propose' | 'cancel';
export type RequestTab = 'toHandle' | 'upcoming' | 'history';

/** Demande telle que my_visit_requests la rend, avec les colonnes que l'écran de la demande lit en plus. */
export type DetailRequestRow = VisitRequestRow & {
  listing_snapshot: {
    listingId?: string | null; title?: string | null; price?: number | string | null; transaction?: string | null; city?: string | null;
    coverPath?: string | null;
  } | null;
  agent_user_id?: string | null;
  proposed_by?: string | null;
  previous_request_id?: string | null;
  history?: unknown;
  updated_at?: string | null;
};

/** Événement de l'historique (VisitRequestEvent) : `{id, date, actorId, action: {sent: {}} | {declined: {reason}} …}`. */
export type RequestEvent = {
  id: string;
  date: Date;
  actorId: string;
  action: { kind: 'sent' | 'accepted' | 'cancelled' } | { kind: 'declined'; reason: string | null } | { kind: 'proposed'; count: number };
};

const sameId = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const time = (iso: string) => new Date(iso).getTime();
const slotEnd = (slot: VisitSlot) => time(slot.start) + slot.durationMinutes * 60_000;

/** Côté du compte : le demandeur, ou le destinataire (et l'agent de l'agence chargé de la visite). */
export function requestRole(request: DetailRequestRow, me: string | null): RequestRole | null {
  if (sameId(me, request.requester?.userId)) return 'requester';
  if (sameId(me, request.recipient?.userId) || sameId(me, request.agent_user_id)) return 'recipient';
  return null;
}

/** L'autre personne de la demande. */
export const otherParty = (request: DetailRequestRow, me: string | null) =>
  requestRole(request, me) === 'requester' ? request.recipient : request.requester;

/** Créneaux qu'on peut accepter maintenant : ceux de la demande, ou ceux de la dernière proposition. */
export function requestOpenSlots(request: DetailRequestRow): VisitSlot[] {
  if (request.status === 'pending') return request.slots ?? [];
  if (request.status === 'counterProposed') return request.proposed_slots ?? [];
  return [];
}

/** Une visite confirmée dont le changement attend une réponse (elle reste sur l'ancien créneau). */
export const isRescheduling = (request: DetailRequestRow): boolean => request.status === 'counterProposed' && request.accepted_slot !== null;

const proposedBy = (request: DetailRequestRow): RequestRole | null =>
  request.proposed_by === 'requester' || request.proposed_by === 'recipient' ? request.proposed_by : null;

/** Ce que ce compte peut faire maintenant (VisitRequest.allowedActions). */
export function allowedActions(request: DetailRequestRow, me: string | null, now: Date): Set<RequestAction> {
  const role = requestRole(request, me);
  const actions = new Set<RequestAction>();
  if (!role || requestDisplayStatus(request, now) === 'past') return actions;
  const by = proposedBy(request);
  switch (request.status) {
    case 'pending':
      if (role === 'recipient') ['accept', 'decline', 'propose'].forEach((action) => actions.add(action as RequestAction));
      else actions.add('cancel');
      break;
    case 'counterProposed':
      if (by !== role) { actions.add('accept'); actions.add('decline'); }
      if (role === 'recipient' && request.accepted_slot === null && by === 'recipient') actions.add('propose');
      if (role === 'requester' || request.accepted_slot !== null) actions.add('cancel');
      break;
    case 'accepted':
      actions.add('propose');
      actions.add('cancel');
      break;
    default:
      break;
  }
  return actions;
}

/** Après un refus, seul le demandeur propose une autre date (une nouvelle demande, reliée à celle-ci). */
export const canProposeAnotherDate = (request: DetailRequestRow, me: string | null): boolean =>
  request.status === 'declined' && sameId(me, request.requester?.userId);

/** Créneau de référence : le créneau retenu, sinon le premier encore ouvert, sinon le premier de la demande. */
export function referenceSlot(request: DetailRequestRow): VisitSlot | null {
  const open = [...requestOpenSlots(request)].sort((a, b) => time(a.start) - time(b.start));
  return request.accepted_slot ?? open[0] ?? request.slots?.[0] ?? null;
}

/** Texte sous la personne (explanation de VisitRequestDetailView). */
export function requestExplanation(request: DetailRequestRow, me: string | null, status: VisitRequestDisplayStatus): string {
  const other = otherParty(request, me).name;
  const isRequester = requestRole(request, me) === 'requester';
  switch (status) {
    case 'pending':
      return isRequester ? 'En attente de réponse : ce n\'est pas encore une visite confirmée.'
        : `${other} souhaite visiter ce bien. Acceptez l'un des créneaux, proposez-en un autre ou refusez.`;
    case 'counterProposed':
      if (proposedBy(request) === requestRole(request, me)) {
        return `Vous avez proposé ${isRescheduling(request) ? 'un changement de créneau' : 'd\'autres créneaux'}, en attente de réponse.`;
      }
      return isRescheduling(request)
        ? `${other} propose de déplacer la visite. Elle reste confirmée sur son créneau actuel tant que vous n'avez pas accepté.`
        : `${other} propose d'autres créneaux. Acceptez celui qui vous convient ou refusez.`;
    case 'accepted':
      return 'La visite est confirmée et ajoutée à votre agenda.';
    case 'declined':
      return request.decline_reason ? `Demande refusée. Motif : ${request.decline_reason}` : 'Demande refusée.';
    case 'cancelled':
      return request.accepted_slot === null ? 'Demande annulée.' : 'Visite annulée.';
    default:
      return request.accepted_slot === null ? 'Les créneaux sont passés sans réponse.' : 'La visite est passée.';
  }
}

/** Titre de la carte des créneaux ouverts : « Créneaux demandés », ou « Créneaux proposés par vous / par Untel ». */
export function openSlotsTitle(request: DetailRequestRow, me: string | null): string {
  if (request.status !== 'counterProposed') return 'Créneaux demandés';
  return `Créneaux proposés par ${proposedBy(request) === requestRole(request, me) ? 'vous' : otherParty(request, me).name}`;
}

/** Durée d'un créneau écrite comme ailleurs : « 20 min », « 1 h » (n° 77). */
export const slotDuration = (minutes: number): string => (minutes < 60 || minutes % 60 !== 0 ? `${minutes} min` : `${minutes / 60} h`);

// MARK: - Historique

/** Historique lu comme l'app ; un événement illisible est écarté. */
export function requestHistory(request: DetailRequestRow): RequestEvent[] {
  if (!Array.isArray(request.history)) return [];
  const events: RequestEvent[] = [];
  for (const entry of request.history as Record<string, unknown>[]) {
    const date = typeof entry?.date === 'string' ? new Date(entry.date) : null;
    const action = entry?.action && typeof entry.action === 'object' ? entry.action as Record<string, Record<string, unknown> | null> : null;
    if (!date || Number.isNaN(date.getTime()) || typeof entry.actorId !== 'string' || !action) continue;
    const [kind] = Object.keys(action);
    const value = action[kind] ?? {};
    let parsed: RequestEvent['action'] | null = null;
    if (kind === 'sent' || kind === 'accepted' || kind === 'cancelled') parsed = { kind };
    else if (kind === 'declined') parsed = { kind, reason: typeof value.reason === 'string' ? value.reason : null };
    else if (kind === 'proposed') parsed = { kind, count: Array.isArray(value.slots) ? value.slots.length : 0 };
    if (parsed) events.push({ id: String(entry.id ?? events.length), date, actorId: entry.actorId, action: parsed });
  }
  return events;
}

/** « Vous : demande envoyée », « Agence : refus (motif) »… (eventText). */
export function eventText(event: RequestEvent, request: DetailRequestRow, me: string | null): string {
  const who = sameId(event.actorId, me) ? 'Vous'
    : sameId(event.actorId, request.requester?.userId) ? request.requester.name : request.recipient.name;
  switch (event.action.kind) {
    case 'sent': return `${who} : demande envoyée`;
    case 'accepted': return `${who} : créneau accepté`;
    case 'declined': return `${who} : refus${event.action.reason ? ` (${event.action.reason})` : ''}`;
    case 'proposed': return `${who} : ${event.action.count === 1 ? 'nouveau créneau proposé' : `${event.action.count} créneaux proposés`}`;
    default: return `${who} : annulation`;
  }
}

const eventDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** « 5 nov. à 10 h 00 ». */
export const eventDate = (date: Date): string => `${eventDay.format(date)} à ${sessionHour(date)}`;

// MARK: - Onglets de « Mes visites » (VisitRequestStore.Tab)

export const REQUEST_TAB_TITLES: Record<RequestTab, string> = { toHandle: 'À traiter', upcoming: 'À venir', history: 'Historique' };

export const REQUEST_TAB_EMPTY: Record<RequestTab, { title: string; text: string }> = {
  toHandle: { title: 'Rien à traiter', text: 'Les demandes qui attendent votre réponse apparaîtront ici.' },
  upcoming: { title: 'Aucune visite à venir', text: 'Demandez une visite depuis la fiche d\'une annonce : elle apparaîtra ici, en attente puis confirmée.' },
  history: { title: 'Aucun historique', text: 'Les visites passées, refusées ou annulées apparaîtront ici.' },
};

export function requestTab(request: DetailRequestRow, me: string | null, now: Date): RequestTab {
  const status = requestDisplayStatus(request, now);
  if (status === 'declined' || status === 'cancelled' || status === 'past') return 'history';
  return allowedActions(request, me, now).has('accept') ? 'toHandle' : 'upcoming';
}

/** À traiter et À venir : les plus proches d'abord ; Historique : les plus récentes d'abord. */
export function requestsInTab(requests: DetailRequestRow[], tab: RequestTab, me: string | null, now: Date): DetailRequestRow[] {
  const date = (request: DetailRequestRow) => time(referenceSlot(request)?.start ?? request.created_at);
  const selected = requests.filter((request) => requestTab(request, me, now) === tab);
  return selected.sort((a, b) => (tab === 'history' ? date(b) - date(a) : date(a) - date(b)));
}

// MARK: - Chevauchements (VisitRequestStore.confirmedSlots, VisitRequest.conflicts)

export type BusyRange = { start: number; end: number };

/** Visites confirmées qui gêneraient un créneau : autres demandes acceptées (ou en cours de changement), agenda. */
export function confirmedRanges(requests: DetailRequestRow[], excluding: string, agenda: { start: Date; end: number; requestId: string | null }[],
  now: Date): BusyRange[] {
  const accepted = requests.flatMap((request) => {
    if (sameId(request.id, excluding) || !request.accepted_slot) return [];
    if (requestDisplayStatus(request, now) !== 'accepted' && !isRescheduling(request)) return [];
    return [{ start: time(request.accepted_slot.start), end: slotEnd(request.accepted_slot) }];
  });
  const visits = agenda.filter((visit) => visit.end > now.getTime() && !sameId(visit.requestId, excluding))
    .map((visit) => ({ start: visit.start.getTime(), end: visit.end }));
  return [...accepted, ...visits];
}

export const conflicts = (slot: { start: number; end: number }, busy: BusyRange[]): boolean =>
  busy.some((range) => slot.start < range.end && range.start < slot.end);

// MARK: - Serveur

export const REQUEST_ACTION_FAILURE = 'L\'action n\'a pas pu être enregistrée. Réessayez dans un instant.';

/** Refus du serveur (P0001) : son message ; sinon celui de l'app (VisitRequestStore.perform). */
export function requestActionMessage(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  return code === 'P0001' && message ? message : REQUEST_ACTION_FAILURE;
}

/** Le refus dit que la demande a changé entre-temps : elle est relue pour montrer son état réel. */
export function changedMeanwhile(error: unknown): boolean {
  const { code, hint } = (error ?? {}) as { code?: string; hint?: string };
  return code === 'P0001' && ['visit_action_not_allowed', 'visit_slot_unknown', 'visit_slot_taken'].includes(hint ?? '');
}

/** Une demande du compte (my_visit_requests avec p_request_id) ; `null` si elle n'existe plus. */
export async function fetchRequest(requestId: string): Promise<DetailRequestRow | null> {
  const { data, error } = await supabase.rpc('my_visit_requests', { p_request_id: requestId });
  if (error) throw error;
  return ((data as DetailRequestRow[] | null) ?? [])[0] ?? null;
}

/** Refuser (decline_visit_request) : le motif tel que saisi, comme l'app. */
export async function declineVisitRequest(requestId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('decline_visit_request', { p_request_id: requestId, p_reason: reason });
  if (error) throw error;
}

/** Annuler (cancel_visit_request) : sans motif, la clé n'est pas envoyée (Swift n'encode pas une valeur absente). */
export async function cancelVisitRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_visit_request', { p_request_id: requestId });
  if (error) throw error;
}
