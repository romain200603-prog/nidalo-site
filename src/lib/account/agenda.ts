import { appDate, appDateString } from '../appDates';
import { requestDisplayStatus, type AgendaRow, type VisitRequestRow, type VisitSlot } from '../listing/visits';
import { photoUrl } from '../listings';
import { normalizedPhoneNumber } from '../messages/format';
import { sameId } from '../messages/inbox';
import type { PlaceSuggestion } from '../places';
import { supabase } from '../supabase';
import { createStore, currentUserId, sessionStore } from './session';

// « Mon agenda » (Features/Visits/VisitsAgendaView.swift), comme l'app : les visites de agenda_visits (VisitStore,
// SupabaseAgendaRepository) et les demandes de visite pas encore acceptées (my_visit_requests), montrées comme des
// visites calculées (AgendaRequests, ImmoDomain/Messaging/VisitAgenda.swift), par onglet puis par date.
// « Ajouter une visite » (VisitFormView.swift) écrit la même ligne que l'app (SupabaseAgendaRepository.create).

export type VisitStatus = 'confirmed' | 'awaitingOther' | 'toConfirm' | 'cancelled';
export type VisitDisplayStatus = VisitStatus | 'done';
export type VisitTab = 'upcoming' | 'past' | 'cancelled';
export type VisitGroupKind = 'today' | 'tomorrow' | 'yesterday' | 'thisWeek' | 'later' | 'earlier';

/** Bien d'une visite, figé au moment du rendez-vous (ListingSnapshot). */
export type VisitListing = { listingId: string; title: string; price: number; transaction: 'sale' | 'rent'; city: string; coverImageURL: string | null };

/** Visite de l'agenda : une ligne de agenda_visits, ou une demande de visite (id == requestId). */
export type AgendaItem = {
  id: string;
  conversationId: string | null;
  linkedConversationId: string | null;
  requestId: string | null;
  listing: VisitListing | null;
  start: Date;
  durationMinutes: number | null;
  contactName: string | null;
  address: string | null;
  status: VisitStatus;
  /** Avis et décision du compte rendu (VisitReport.summary). */
  reportSummary: string | null;
};

/** Demande de visite telle que my_visit_requests la rend (Row de SupabaseVisitRequestRepository.swift). */
export type AgendaRequestRow = VisitRequestRow & {
  listing_snapshot: { listingId?: string | null; title?: string | null; price?: number | string | null; transaction?: string | null;
    city?: string | null; coverPath?: string | null } | null;
  agent_user_id?: string | null;
  meeting_place?: string | null;
  proposed_by?: 'requester' | 'recipient' | null;
};

const VISIT_STATUSES: readonly VisitStatus[] = ['confirmed', 'awaitingOther', 'toConfirm', 'cancelled'];

type Json = Record<string, unknown>;
const object = (value: unknown): Json => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {});
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const amount = (value: unknown): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
};
/** Photo : seulement une adresse https (jamais un fichier de l'iPhone). */
const httpsUrl = (value: unknown): string | null => (typeof value === 'string' && /^https:\/\//.test(value) ? value : null);

// MARK: - Lecture des visites

const OPINIONS: Record<string, string> = { loved: 'Coup de cœur', interesting: 'Intéressant', average: 'Moyen', disappointing: 'Décevant' };
const DECISIONS: Record<string, string> = { reviewAgain: 'À revoir', interested: 'Intéressé', makeOffer: 'Faire une offre', abandon: 'Abandonner' };

function listingOf(value: unknown): VisitListing | null {
  const json = object(value);
  const listingId = text(json.listingId);
  if (!listingId) return null;
  return {
    listingId,
    title: text(json.title) ?? 'Annonce',
    price: amount(json.price),
    transaction: json.transaction === 'rent' ? 'rent' : 'sale',
    city: text(json.city) ?? '',
    coverImageURL: httpsUrl(json.coverImageURL),
  };
}

/** Visite d'une ligne (le JSON de la visite fait foi, comme l'app) ; `null` si elle est illisible. */
export function visitFromRow(row: AgendaRow): AgendaItem | null {
  const visit = object(row.visit);
  const start = appDate(visit.start) ?? appDate(row.start_at);
  const status = (text(visit.status) ?? row.status) as VisitStatus;
  if (!start || !VISIT_STATUSES.includes(status)) return null;
  const report = object(visit.report);
  const summary = [OPINIONS[text(report.opinion) ?? ''], DECISIONS[text(report.decision) ?? '']].filter(Boolean).join(' · ');
  return {
    id: row.id,
    conversationId: text(visit.conversationId),
    linkedConversationId: text(visit.linkedConversationId),
    requestId: text(visit.requestId) ?? row.request_id ?? null,
    listing: listingOf(visit.listing),
    start,
    durationMinutes: typeof visit.durationMinutes === 'number' ? visit.durationMinutes : null,
    contactName: text(visit.contactName),
    address: text(visit.address),
    status,
    reportSummary: summary || null,
  };
}

// MARK: - Règles d'une visite (Visit.swift)

/** Fin prévue : une heure par défaut quand la durée n'est pas connue (Visit.end). */
export const visitEnd = (item: Pick<AgendaItem, 'start' | 'durationMinutes'>): number =>
  item.start.getTime() + (item.durationMinutes ?? 60) * 60_000;

/** « Terminée » : une visite confirmée déjà passée (Visit.displayStatus). */
export function displayStatus(item: Pick<AgendaItem, 'status' | 'start' | 'durationMinutes'>, now: Date): VisitDisplayStatus {
  if (item.status === 'confirmed' && visitEnd(item) <= now.getTime()) return 'done';
  return item.status;
}

export const STATUS_LABELS: Record<VisitDisplayStatus, string> = {
  confirmed: 'Visite confirmée',
  awaitingOther: 'En attente',
  toConfirm: 'À confirmer',
  done: 'Terminée',
  cancelled: 'Annulée',
};

/** Libellé court des cartes : « Confirmée » au lieu de « Visite confirmée » (shortLabel). */
export const shortStatusLabel = (status: VisitDisplayStatus): string => (status === 'confirmed' ? 'Confirmée' : STATUS_LABELS[status]);

/** Adresse exploitable pour un itinéraire (routableAddress). */
export function routableAddress(item: Pick<AgendaItem, 'address'>): string | null {
  const address = item.address?.trim();
  return address ? address : null;
}

/** Itinéraire dans Plans (VisitActions.directionsURL). */
export const directionsUrl = (address: string): string => `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`;

/** Itinéraire dans Google Maps, site web (openGoogleMaps). */
export const googleMapsUrl = (address: string): string => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

/** Compte rendu possible : visite terminée et non annulée (acceptsReport). */
export const acceptsReport = (item: AgendaItem, now: Date): boolean => item.status !== 'cancelled' && visitEnd(item) <= now.getTime();

/** Visite calculée à partir d'une demande (AgendaRequests.isRequestEntry). */
export const isRequestEntry = (item: Pick<AgendaItem, 'id' | 'requestId'>): boolean => sameId(item.requestId, item.id);

/** Conversation à ouvrir pour « Contacter » (contactConversationId). */
export const contactConversationId = (item: AgendaItem): string | null => item.conversationId ?? item.linkedConversationId;

/** « Contacter » possible : une conversation, ou un bien dont on peut joindre le vendeur (canContact). */
export const canContact = (item: AgendaItem): boolean => contactConversationId(item) !== null || item.listing !== null;

// MARK: - Demandes de visite dans l'agenda (AgendaRequests)

type Role = 'requester' | 'recipient';

export function requestRole(request: AgendaRequestRow, me: string): Role | null {
  if (sameId(request.requester?.userId, me)) return 'requester';
  if (sameId(request.recipient?.userId, me) || sameId(request.agent_user_id, me)) return 'recipient';
  return null;
}

function openSlots(request: AgendaRequestRow): VisitSlot[] {
  if (request.status === 'pending') return request.slots ?? [];
  if (request.status === 'counterProposed') return request.proposed_slots ?? [];
  return [];
}

/** « Accepter » fait partie des actions possibles de ce compte (allowedActions(for:now:)). */
function canAccept(request: AgendaRequestRow, me: string, now: Date): boolean {
  const role = requestRole(request, me);
  if (!role || requestDisplayStatus(request, now) === 'past') return false;
  if (request.status === 'pending') return role === 'recipient';
  if (request.status === 'counterProposed') return (request.proposed_by ?? null) !== role;
  return false;
}

/** Créneaux encore proposés par la demande (openSlotCount). */
export const openSlotCount = (request: AgendaRequestRow): number => openSlots(request).length;

/** Demandes pas encore acceptées, en visites calculées (AgendaRequests.visits(for:me:existing:now:)). */
export function requestEntries(requests: AgendaRequestRow[], me: string, existing: AgendaItem[], now: Date): AgendaItem[] {
  const synced = existing.map((item) => item.requestId).filter((id): id is string => !!id);
  return requests.flatMap((request): AgendaItem[] => {
    if (synced.some((id) => sameId(id, request.id)) || !requestRole(request, me)) return [];
    let status: VisitStatus;
    switch (requestDisplayStatus(request, now)) {
      case 'accepted':
        return [];
      case 'declined':
      case 'cancelled':
        status = 'cancelled';
        break;
      default:
        if (request.accepted_slot) return [];
        status = canAccept(request, me, now) ? 'toConfirm' : 'awaitingOther';
    }
    const dated = (slots: VisitSlot[]) => slots.flatMap((slot) => {
      const start = appDate(slot.start);
      return start ? [{ start, durationMinutes: slot.durationMinutes }] : [];
    });
    const open = dated(openSlots(request).length ? openSlots(request) : request.slots ?? []);
    const future = open.filter((slot) => slot.start.getTime() > now.getTime()).sort((a, b) => a.start.getTime() - b.start.getTime())[0];
    const latest = [...open].sort((a, b) => b.start.getTime() - a.start.getTime())[0];
    const slot = future ?? latest ?? dated(request.slots ?? [])[0];
    if (!slot) return [];
    const snapshot = request.listing_snapshot ?? {};
    const listing: VisitListing = {
      listingId: snapshot.listingId ?? request.listing_id ?? request.id,
      title: snapshot.title ?? 'Annonce',
      price: amount(snapshot.price),
      transaction: snapshot.transaction === 'rent' ? 'rent' : 'sale',
      city: snapshot.city ?? '',
      coverImageURL: snapshot.coverPath ? photoUrl(snapshot.coverPath) : null,
    };
    const other = requestRole(request, me) === 'requester' ? request.recipient : request.requester;
    return [{
      id: request.id,
      conversationId: null,
      linkedConversationId: null,
      requestId: request.id,
      listing,
      start: slot.start,
      durationMinutes: slot.durationMinutes,
      contactName: other?.name ?? null,
      address: request.mode === 'video' ? 'En visio' : (request.meeting_place ?? listing.city),
      status,
      reportSummary: null,
    }];
  });
}

// MARK: - Onglets et groupes (VisitAgenda)

export function tabOf(item: AgendaItem, now: Date): VisitTab {
  if (item.status === 'cancelled') return 'cancelled';
  return visitEnd(item) <= now.getTime() ? 'past' : 'upcoming';
}

/** Visites d'un onglet : les plus proches d'abord pour « À venir », les plus récentes d'abord sinon. */
export function itemsIn(items: AgendaItem[], tab: VisitTab, now: Date): AgendaItem[] {
  const selected = items.filter((item) => tabOf(item, now) === tab);
  return selected.sort((a, b) => (tab === 'upcoming' ? a.start.getTime() - b.start.getTime() : b.start.getTime() - a.start.getTime()));
}

export const countIn = (items: AgendaItem[], tab: VisitTab, now: Date): number => items.filter((item) => tabOf(item, now) === tab).length;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Groupe d'une date, selon le nombre de jours qui la séparent d'aujourd'hui (groupKind(for:)). */
export function groupKind(date: Date, now: Date): VisitGroupKind {
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if ((days >= 2 && days < 7) || (days >= -6 && days < -1)) return 'thisWeek';
  if (days >= 7) return 'later';
  return 'earlier';
}

export function groupTitle(kind: VisitGroupKind, tab: VisitTab): string {
  switch (kind) {
    case 'today': return 'Aujourd\'hui';
    case 'tomorrow': return 'Demain';
    case 'yesterday': return 'Hier';
    case 'thisWeek': return tab === 'upcoming' ? 'Cette semaine' : 'Ces 7 derniers jours';
    case 'later': return 'Plus tard';
    case 'earlier': return 'Plus tôt';
  }
}

/** Groupes non vides d'un onglet, dans l'ordre d'affichage (groups(in:)). */
export function groupsIn(items: AgendaItem[], tab: VisitTab, now: Date): { kind: VisitGroupKind; items: AgendaItem[] }[] {
  const groups: { kind: VisitGroupKind; items: AgendaItem[] }[] = [];
  for (const item of itemsIn(items, tab, now)) {
    const kind = groupKind(item.start, now);
    const group = groups.find((other) => other.kind === kind);
    if (group) group.items.push(item);
    else groups.push({ kind, items: [item] });
  }
  return groups;
}

export const TAB_TITLES: Record<VisitTab, string> = { upcoming: 'À venir', past: 'Passées', cancelled: 'Annulées' };

export const EMPTY_TABS: Record<VisitTab, { title: string; message: string }> = {
  upcoming: { title: 'Aucune visite prévue', message: 'Programmez une visite depuis la fiche d\'un bien ou ajoutez-la manuellement avec le bouton ci-dessous.' },
  past: { title: 'Aucune visite passée', message: 'Vos visites terminées apparaîtront ici.' },
  cancelled: { title: 'Aucune visite annulée', message: 'Les visites annulées apparaîtront ici.' },
};

/** Carte « Mon agenda » de Mon espace (AgendaCard) : résumé, demandes à confirmer, prochaine visite. */
export function agendaSummary(items: AgendaItem[], now: Date) {
  const upcoming = itemsIn(items, 'upcoming', now);
  const count = upcoming.length;
  const next = upcoming[0] ?? null;
  return {
    title: count === 0 ? 'Votre agenda est libre' : count === 1 ? '1 visite à venir' : `${count} visites à venir`,
    toConfirm: upcoming.filter((item) => item.status === 'toConfirm').length,
    next,
    /** Demande pas encore confirmée : « Prochaine : date · en attente ». */
    nextIsPending: next !== null && isRequestEntry(next) && next.status !== 'confirmed',
  };
}

// MARK: - Serveur : lecture

export const AGENDA_LOAD_ERROR = 'Impossible de charger vos visites. Réessayez dans un instant.';

export type AgendaState = {
  status: 'none' | 'loading' | 'ready' | 'error';
  /** Visites enregistrées (VisitStore.visits). */
  visits: AgendaItem[];
  /** Demandes de visite du compte (VisitRequestStore.requests). */
  requests: AgendaRequestRow[];
};

export const agendaStore = createStore<AgendaState>({ status: 'none', visits: [], requests: [] });

/** Visites et demandes du compte : une visite illisible est écartée ; sans demandes, l'agenda garde ses visites. */
export async function loadAgenda(): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    agendaStore.set({ status: 'none', visits: [], requests: [] });
    return;
  }
  const before = agendaStore.get();
  if (before.status !== 'ready') agendaStore.set({ ...before, status: 'loading' });
  const [visits, requests] = await Promise.all([
    supabase.from('agenda_visits').select('id, start_at, status, request_id, listing_id, visit'),
    supabase.rpc('my_visit_requests'),
  ]);
  if (currentUserId() !== session.userId) return;
  const loadedRequests = requests.error ? agendaStore.get().requests : ((requests.data as AgendaRequestRow[] | null) ?? []);
  if (visits.error) {
    agendaStore.set({ status: before.status === 'ready' ? 'ready' : 'error', visits: agendaStore.get().visits, requests: loadedRequests });
    return;
  }
  const items = ((visits.data as AgendaRow[] | null) ?? []).map(visitFromRow).filter((item): item is AgendaItem => item !== null);
  agendaStore.set({ status: 'ready', visits: items, requests: loadedRequests });
}

/** Toutes les visites de l'agenda : enregistrées, puis demandes en attente (AppContainer.agenda()). */
export function agendaItems(state: AgendaState, me: string | null, now: Date): AgendaItem[] {
  if (!me) return state.visits;
  return [...state.visits, ...requestEntries(state.requests, me, state.visits, now)];
}

// MARK: - « Ajouter une visite » (VisitFormView)

export const VISIT_DURATIONS = [15, 30, 45, 60, 90, 120];
/** Rappel personnalisé : choix proposés, en minutes (VisitReminders.customChoices). */
export const CUSTOM_REMINDER_CHOICES = [15, 30, 60, 180, 360, 720, 1_440, 2_880];

/** « 45 min », « 1 h », « 90 min », « 2 h » (puces de durée). */
export const durationLabel = (minutes: number): string => (minutes < 60 || minutes % 60 !== 0 ? `${minutes} min` : `${minutes / 60} h`);

/** « 15 min », « 2 h », « 1 jour », « 2 jours » (VisitReminders.label(minutes:)). */
export function reminderLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)} h`;
  const days = Math.floor(minutes / 1_440);
  return days === 1 ? '1 jour' : `${days} jours`;
}

export type VisitReminders = { eveningBefore: boolean; twoHoursBefore: boolean; customMinutesBefore: number | null };

/** Rappels d'une nouvelle visite : la veille et 2 h avant (VisitReminders()). */
export const DEFAULT_REMINDERS: VisitReminders = { eveningBefore: true, twoHoursBefore: true, customMinutesBefore: null };

export const remindersEmpty = (r: VisitReminders): boolean => !r.eveningBefore && !r.twoHoursBefore && r.customMinutesBefore === null;

/** « rappels la veille et 2 h avant » ; `null` sans rappel (VisitReminders.summary). */
export function remindersSummary(r: VisitReminders): string | null {
  const parts: string[] = [];
  if (r.eveningBefore) parts.push('la veille');
  if (r.twoHoursBefore) parts.push('2 h avant');
  if (r.customMinutesBefore !== null) parts.push(`${reminderLabel(r.customMinutesBefore)} avant`);
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
  return (parts.length === 1 ? 'rappel ' : 'rappels ') + list;
}

/** Demain à 10 h (VisitFormView.defaultStart). */
export function defaultVisitStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0, 0);
}

export type VisitParticipant = { id: string; name: string; phone: string | null };

export type NewVisit = {
  id: string;
  listing: VisitListing | null;
  linkedConversationId: string | null;
  start: Date;
  durationMinutes: number | null;
  contactName: string;
  phone: string;
  address: string;
  participants: VisitParticipant[];
  reminders: VisitReminders;
  isConfirmed: boolean;
  createdAt: Date;
};

const clean = (value: string): string | null => value.trim() || null;
const upper = (id: string) => id.toUpperCase();

/**
 * Ligne insérée dans agenda_visits, comme l'app (SupabaseAgendaRepository.Row(visit)) : la visite entière en JSON
 * (Visit encodé par Swift : valeurs vides omises, identifiants en majuscules, dates en UTC sans fuseau).
 */
export function newVisitRow(visit: NewVisit) {
  const status: VisitStatus = visit.isConfirmed ? 'confirmed' : 'awaitingOther';
  const json: Json = { id: upper(visit.id) };
  if (visit.listing) {
    const listing: Json = {
      listingId: upper(visit.listing.listingId), title: visit.listing.title, price: visit.listing.price,
      transaction: visit.listing.transaction, city: visit.listing.city,
    };
    if (visit.listing.coverImageURL) listing.coverImageURL = visit.listing.coverImageURL;
    json.listing = listing;
  }
  json.start = appDateString(visit.start);
  if (visit.durationMinutes !== null) json.durationMinutes = visit.durationMinutes;
  const contact = clean(visit.contactName);
  if (contact) json.contactName = contact;
  const address = clean(visit.address);
  if (address) json.address = address;
  json.status = status;
  json.createdAt = appDateString(visit.createdAt);
  const phone = normalizedPhoneNumber(visit.phone);
  if (phone) json.contactPhone = phone;
  if (visit.participants.length) {
    json.participants = visit.participants.map((participant) => {
      const entry: Json = { id: upper(participant.id), name: participant.name };
      if (participant.phone) entry.phone = participant.phone;
      return entry;
    });
  }
  if (!remindersEmpty(visit.reminders)) {
    const reminders: Json = { eveningBefore: visit.reminders.eveningBefore, twoHoursBefore: visit.reminders.twoHoursBefore };
    if (visit.reminders.customMinutesBefore !== null) reminders.customMinutesBefore = visit.reminders.customMinutesBefore;
    json.reminders = reminders;
  }
  if (visit.linkedConversationId) json.linkedConversationId = upper(visit.linkedConversationId);
  const row: Json = { id: upper(visit.id), start_at: appDateString(visit.start), status };
  if (visit.listing) row.listing_id = upper(visit.listing.listingId);
  row.visit = json;
  return row;
}

/** Visite enregistrée, telle que l'agenda la relit. */
export function itemFromNewVisit(visit: NewVisit): AgendaItem {
  const row = newVisitRow(visit);
  return visitFromRow(row as unknown as AgendaRow) as AgendaItem;
}

/** Même bien et même heure de début qu'une autre visite active : un doublon (Visit.isDuplicate(of:)). */
export function isDuplicate(visit: { id: string; listingId: string | null; start: Date; status: VisitStatus }, other: AgendaItem): boolean {
  return !sameId(visit.id, other.id) && other.status !== 'cancelled' && visit.status !== 'cancelled'
    && visit.listingId !== null && sameId(visit.listingId, other.listing?.listingId)
    && Math.abs(visit.start.getTime() - other.start.getTime()) < 60_000;
}

/** Visite active à venir déjà prévue pour ce bien (Visit.upcomingVisit(forListing:in:excluding:now:)). */
export function upcomingVisitForListing(listingId: string | null, visits: AgendaItem[], now: Date): AgendaItem | null {
  if (!listingId) return null;
  return visits
    .filter((item) => sameId(item.listing?.listingId, listingId) && item.status !== 'cancelled' && visitEnd(item) > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null;
}

export const DUPLICATE_MESSAGE = 'Une visite de ce bien est déjà prévue à cette heure.';
export const VISIT_SAVE_ERROR = 'L\'opération n\'a pas abouti. Réessayez dans un instant.';

/** Message d'un refus (SupabaseAgendaRepository.failure, puis VisitStore.message(for:)). */
export function agendaErrorMessage(error: unknown): string {
  const { code, message, hint } = object(error) as { code?: string; message?: string; hint?: string };
  if (code === 'P0001' && hint === 'agenda_full' && message) return message;
  if (typeof message === 'string' && message.includes('agenda_visits_visit_size')) {
    return 'Cette visite contient trop d\'informations pour être enregistrée. Raccourcissez les notes.';
  }
  if (code && ['23514', '23502', '22001', '22P02'].includes(code)) return 'Certaines informations n\'ont pas été acceptées. Vérifiez-les, puis réessayez.';
  if (code && ['42501', 'PGRST301'].includes(code)) return 'Cette visite a été organisée dans une conversation : elle peut être annulée, pas supprimée.';
  return VISIT_SAVE_ERROR;
}

/** Enregistre la visite (VisitStore.create) : doublon refusé, puis insert ; message d'erreur ou null. */
export async function createVisit(visit: NewVisit): Promise<string | null> {
  const state = agendaStore.get();
  const candidate = { id: visit.id, listingId: visit.listing?.listingId ?? null, start: visit.start, status: (visit.isConfirmed ? 'confirmed' : 'awaitingOther') as VisitStatus };
  if (state.visits.some((other) => isDuplicate(candidate, other))) return DUPLICATE_MESSAGE;
  const { error } = await supabase.from('agenda_visits').insert(newVisitRow(visit));
  if (error) return agendaErrorMessage(error);
  const current = agendaStore.get();
  agendaStore.set({ ...current, status: 'ready', visits: [...current.visits, itemFromNewVisit(visit)] });
  return null;
}

// MARK: - Bien choisi (VisitFormView.choose)

/** Adresse d'une suggestion choisie (PlaceSuggestion.fullLabel) : « 12 Rue X, 69002 Lyon ». */
export function fullLabel(place: PlaceSuggestion): string {
  if (place.kind === 'municipality' || place.kind === 'district') {
    const short = place.kind === 'district' ? place.name.replace(' Arrondissement', '') : place.name;
    return place.postalCode ? `${short} (${place.postalCode})` : short;
  }
  const town = [place.postalCode, place.city].filter(Boolean).join(' ');
  return !town || place.city === place.name ? place.name : `${place.name}, ${town}`;
}

/**
 * Adresse proposée pour le bien choisi : la rue seulement si c'est mon annonce ou si l'annonce la publie ;
 * sinon la commune et son code postal (jamais l'adresse cachée d'une annonce approximative).
 */
export function visitAddressFor(listing: { city: string; postal_code: string; location_precision: string; public_street: string | null },
  isMine: boolean, privateStreet: string | null): { address: string; isHidden: boolean } {
  // Comme l'app : la rue privée de mon annonce, sinon la rue publiée (location?.street ?? row.public_street).
  const street = isMine ? privateStreet ?? listing.public_street : listing.public_street;
  if ((isMine || listing.location_precision === 'exact') && street !== null) {
    return { address: `${street}, ${listing.postal_code} ${listing.city}`, isHidden: false };
  }
  const postal = listing.postal_code.trim();
  return { address: postal ? `${listing.city} (${postal})` : listing.city, isHidden: true };
}

/** Contact proposé : l'agence, sinon le nom public du vendeur (details.agency?.agencyName ?? seller.displayName). */
export function visitContactFor(profile: { public_name: string | null; account_type: string | null; agency_id: string | null; agency_name: string | null } | null): string {
  const isPro = profile?.account_type === 'professional' && !!profile.agency_id;
  if (isPro) return profile?.agency_name ?? 'Agence';
  return profile?.public_name ?? 'Particulier';
}

/** Numéro publié (agence), normalisé (publishedPhone, puis PhoneNumber.normalized). */
export function visitPhoneFor(profile: { account_type: string | null; agency_id: string | null; agency_phone: string | null } | null): string | null {
  const isPro = profile?.account_type === 'professional' && !!profile.agency_id;
  const phone = isPro ? profile?.agency_phone?.trim() : null;
  return phone ? normalizedPhoneNumber(phone) : null;
}
