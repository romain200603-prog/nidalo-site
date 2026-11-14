import { supabase } from '../supabase';
import { fetchVisitRequests, type VisitMode, type VisitRequestRow, type VisitRequestStatus, type VisitSlot } from '../listing/visits';
import { isoSeconds } from '../listing/offers';
import { clock } from './format';
import { sameId, type Conversation } from './inbox';

// Demandes de visite dans la messagerie du site (demande de Romain du 14 novembre 2026) : les demandes du compte
// (my_visit_requests, bloc 4 du serveur) rattachées à leur conversation (même annonce, mêmes deux personnes), montrées
// comme une carte dans le fil et en aperçu dans la liste. Les réponses passent par les fonctions du serveur que l'app
// appelle déjà (accept_visit_request, propose_visit_slots) : rien de nouveau côté serveur.

export type VisitAction = 'accept' | 'decline' | 'propose' | 'cancel';
type Party = { userId: string; name: string; kind: 'individual' | 'agency' };

export type ConversationVisitRequest = {
  id: string;
  listingId: string | null;
  listingTitle: string;
  requester: Party;
  recipient: Party;
  slots: VisitSlot[];
  mode: VisitMode;
  meetingPlace: string | null;
  status: VisitRequestStatus;
  acceptedSlot: VisitSlot | null;
  proposedSlots: VisitSlot[];
  proposedBy: 'requester' | 'recipient' | null;
  myRole: 'requester' | 'recipient' | null;
  allowedActions: VisitAction[];
  createdAt: Date;
  updatedAt: Date;
};

/** Ligne de my_visit_requests avec les colonnes que la messagerie lit en plus de celles de la fiche. */
type ServerRow = VisitRequestRow & {
  listing_snapshot: { listingId?: string | null; title?: string | null } | null;
  meeting_place?: string | null;
  proposed_by?: string | null;
  my_role?: string | null;
  allowed_actions?: string[] | null;
  updated_at?: string | null;
};

const ACTIONS: readonly VisitAction[] = ['accept', 'decline', 'propose', 'cancel'];
const STATUSES: readonly VisitRequestStatus[] = ['pending', 'accepted', 'declined', 'counterProposed', 'cancelled'];

const date = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? null : value;
};

/** Demande lue comme la messagerie l'affiche ; `null` si la ligne est illisible (l'app l'écarterait aussi). */
export function visitRequestFrom(row: ServerRow): ConversationVisitRequest | null {
  const createdAt = date(row.created_at);
  if (!row.id || !createdAt || !STATUSES.includes(row.status) || !row.requester?.userId || !row.recipient?.userId) return null;
  const role = row.my_role === 'requester' || row.my_role === 'recipient' ? row.my_role : null;
  return {
    id: row.id,
    listingId: row.listing_snapshot?.listingId ?? row.listing_id ?? null,
    listingTitle: row.listing_snapshot?.title ?? 'Annonce',
    requester: row.requester,
    recipient: row.recipient,
    slots: Array.isArray(row.slots) ? row.slots : [],
    mode: row.mode === 'video' ? 'video' : 'onSite',
    meetingPlace: row.meeting_place ?? null,
    status: row.status,
    acceptedSlot: row.accepted_slot ?? null,
    proposedSlots: Array.isArray(row.proposed_slots) ? row.proposed_slots : [],
    proposedBy: row.proposed_by === 'requester' || row.proposed_by === 'recipient' ? row.proposed_by : null,
    myRole: role,
    allowedActions: (row.allowed_actions ?? []).filter((action): action is VisitAction => (ACTIONS as readonly string[]).includes(action)),
    createdAt,
    updatedAt: date(row.updated_at) ?? createdAt,
  };
}

export async function fetchConversationVisitRequests(): Promise<ConversationVisitRequest[]> {
  const rows = (await fetchVisitRequests()) as ServerRow[];
  return rows.map(visitRequestFrom).filter((request): request is ConversationVisitRequest => request !== null);
}

/** Demandes d'une conversation à deux sur une annonce : même bien, et ses deux personnes. Les plus anciennes d'abord. */
export function requestsIn(requests: ConversationVisitRequest[], conversation: Conversation): ConversationVisitRequest[] {
  const listingId = conversation.listing?.listingId ?? null;
  if (conversation.isGroup || !listingId || !conversation.buyerId || !conversation.sellerId) return [];
  const people = [conversation.buyerId, conversation.sellerId];
  return requests
    .filter((request) => sameId(request.listingId, listingId)
      && people.some((id) => sameId(id, request.requester.userId))
      && people.some((id) => sameId(id, request.recipient.userId)))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** Créneaux qu'on peut encore accepter : ceux de la demande, ou ceux de la dernière proposition (openSlots de l'app). */
export function openSlots(request: ConversationVisitRequest): VisitSlot[] {
  if (request.status === 'pending') return request.slots;
  if (request.status === 'counterProposed') return request.proposedSlots;
  return [];
}

/** Créneau mis en avant sur la carte : celui qui est accepté, sinon le premier encore proposé. */
export function shownSlot(request: ConversationVisitRequest): VisitSlot | null {
  return request.acceptedSlot ?? openSlots(request)[0] ?? request.slots[0] ?? null;
}

/** Moment de la demande : sa place dans le fil et dans la liste (un changement d'état la met à jour sur place). */
export const requestActivity = (request: ConversationVisitRequest): Date => request.createdAt;

/** Dernière demande d'une conversation, si elle est plus récente que son dernier message (aperçu de la liste). */
export function latestRequestAfter(requests: ConversationVisitRequest[], lastMessageAt: Date | null): ConversationVisitRequest | null {
  const latest = requests[requests.length - 1] ?? null;
  if (!latest) return null;
  return !lastMessageAt || requestActivity(latest).getTime() > lastMessageAt.getTime() ? latest : null;
}

const wideDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase('fr-FR') + text.slice(1);

/** « Samedi 15 novembre · 10:00 » (carte du fil). */
export function requestDateWide(start: Date): string {
  return `${capitalized(wideDate.format(start))} · ${clock(start)}`;
}

/** « sam. 15 nov. à 10:00 » (aperçu de la liste). */
export function requestDateShort(start: Date): string {
  return `${shortDate.format(start)} à ${clock(start)}`;
}

const weekdayName = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });

/**
 * Réponse rapide qui accepte un créneau : « Oui, samedi 10 h » (« aujourd'hui », le jour de la semaine dans les six
 * jours qui viennent, puis « sam. 21 nov. »), « Oui, lundi 18 h 30 ».
 */
export function acceptLabel(start: Date, now: Date = new Date()): string {
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((day(start) - day(now)) / 86_400_000);
  const when = days === 0 ? 'aujourd\'hui' : days > 0 && days < 7 ? weekdayName.format(start) : shortDate.format(start);
  const minutes = start.getMinutes();
  return `Oui, ${when} ${start.getHours()}\u00a0h${minutes ? `\u00a0${String(minutes).padStart(2, '0')}` : ''}`;
}

/** Demande à laquelle on peut encore répondre (la plus récente) : accepter un créneau ou en proposer un autre. */
export function answerableRequest(requests: ConversationVisitRequest[]): ConversationVisitRequest | null {
  return [...requests].reverse().find((request) => (request.status === 'pending' || request.status === 'counterProposed')
    && (request.allowedActions.includes('accept') || request.allowedActions.includes('propose'))) ?? null;
}

/** Titre de la carte selon l'état de la demande. */
export function requestTitle(request: ConversationVisitRequest): string {
  switch (request.status) {
    case 'accepted': return 'Visite confirmée';
    case 'declined': return 'Visite refusée';
    case 'cancelled': return 'Visite annulée';
    case 'counterProposed': return 'Autre créneau proposé';
    default: return 'Demande de visite';
  }
}

/** Titre de la carte dans le fil : « Demande de visite », ou « Autre créneau proposé » après une contre-proposition. */
export const requestCardTitle = (request: ConversationVisitRequest): string =>
  (request.status === 'counterProposed' ? 'Autre créneau proposé' : 'Demande de visite');

/** Issue montrée sur la carte à la place des boutons : « Visite confirmée » en vert, « Visite refusée » ou « annulée » en gris. */
export function requestOutcome(request: ConversationVisitRequest): { text: string; confirmed: boolean } | null {
  switch (request.status) {
    case 'accepted': return { text: 'Visite confirmée', confirmed: true };
    case 'declined': return { text: 'Visite refusée', confirmed: false };
    case 'cancelled': return { text: 'Visite annulée', confirmed: false };
    default: return null;
  }
}

/** Aperçu dans la liste : « Demande de visite · sam. 15 nov. à 10:00 ». */
export function requestPreview(request: ConversationVisitRequest): string {
  const slot = shownSlot(request);
  const start = slot ? date(slot.start) : null;
  return start ? `${requestTitle(request)} · ${requestDateShort(start)}` : requestTitle(request);
}

/** « Immeuble – Vulbens · sur place » ou « · en visio ». */
export function requestPlaceLine(request: ConversationVisitRequest): string {
  return `${request.listingTitle} · ${request.mode === 'video' ? 'en visio' : 'sur place'}`;
}

// MARK: - Réponses (mêmes fonctions et arguments que SupabaseVisitRequestRepository de l'app)

export async function acceptVisitRequest(requestId: string, slotId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_visit_request', { p_request_id: requestId, p_slot_id: slotId });
  if (error) throw error;
}

/** Autre créneau : un à trois créneaux d'une heure, identifiants écrits comme Swift (majuscules). */
export async function proposeVisitSlots(requestId: string, starts: Date[]): Promise<void> {
  const slots = starts.map((start) => ({ id: crypto.randomUUID().toUpperCase(), start: isoSeconds(start), durationMinutes: 60 }));
  const { error } = await supabase.rpc('propose_visit_slots', { p_request_id: requestId, p_slots: slots });
  if (error) throw error;
}
