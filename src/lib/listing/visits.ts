import { appDate } from '../appDates';
import { supabase } from '../supabase';
import { isoSeconds } from './offers';

// Visites d'un bien, comme l'app : demandes de visite (ImmoDomain/Messaging/VisitRequest.swift,
// Data/VisitRequestStore.swift, Data/Supabase/SupabaseVisitRequestRepository.swift, Features/Visits/VisitRequestFormView.swift
// et VisitRequestComponents.swift) et agenda (Visit.swift, VisitAgenda.swift, Data/Supabase/SupabaseAgendaRepository.swift).
// Le site lit l'agenda et les demandes du compte, et envoie une nouvelle demande avec create_visit_request.

export type VisitSlot = { id: string; start: string; durationMinutes: number };
export type VisitMode = 'onSite' | 'video';
export type VisitRequestStatus = 'pending' | 'accepted' | 'declined' | 'counterProposed' | 'cancelled';
export type VisitRequestDisplayStatus = VisitRequestStatus | 'past';

type Party = { userId: string; name: string; kind: 'individual' | 'agency'; agencyId?: string | null };

/** Colonnes de my_visit_requests lues par la fiche (Row de SupabaseVisitRequestRepository.swift). */
export type VisitRequestRow = {
  id: string;
  listing_id: string | null;
  listing_snapshot: { listingId?: string | null } | null;
  requester: Party;
  recipient: Party;
  slots: VisitSlot[];
  mode: VisitMode;
  status: VisitRequestStatus;
  accepted_slot: VisitSlot | null;
  proposed_slots: VisitSlot[] | null;
  created_at: string;
};

/** Ligne de agenda_visits (« id, start_at, status, request_id, listing_id, visit »), la visite entière en JSON. */
export type AgendaRow = {
  id: string;
  start_at: string;
  status: string;
  request_id: string | null;
  listing_id: string | null;
  visit: { listing?: { listingId?: string | null } | null; start?: string; durationMinutes?: number | null; status?: string } | null;
};

export type VisitStatus = 'confirmed' | 'awaitingOther' | 'toConfirm' | 'cancelled';
export type VisitDisplayStatus = VisitStatus | 'done';

/** Une visite de l'agenda, lue comme l'app (Visit). */
export type AgendaVisit = { id: string; listingId: string | null; start: Date; durationMinutes: number | null; status: VisitStatus };

export const VISIT_STATUS_LABELS: Record<VisitDisplayStatus, string> = {
  confirmed: 'Visite confirmée',
  awaitingOther: 'En attente',
  toConfirm: 'À confirmer',
  done: 'Terminée',
  cancelled: 'Annulée',
};

export const REQUEST_STATUS_LABELS: Record<VisitRequestDisplayStatus, string> = {
  pending: 'En attente',
  accepted: 'Confirmée',
  declined: 'Refusée',
  counterProposed: 'Autre créneau proposé',
  cancelled: 'Annulée',
  past: 'Passée',
};

const sameId = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const time = (iso: string) => new Date(iso).getTime();
const slotEnd = (slot: VisitSlot) => time(slot.start) + slot.durationMinutes * 60_000;

// MARK: - Demandes

/** Créneaux qu'on peut encore accepter : ceux de la demande, ou ceux de la dernière proposition (openSlots). */
function openSlots(request: VisitRequestRow): VisitSlot[] {
  if (request.status === 'pending') return request.slots ?? [];
  if (request.status === 'counterProposed') return request.proposed_slots ?? [];
  return [];
}

/** Statut affiché : « Passée » quand l'heure est dépassée (displayStatus). */
export function requestDisplayStatus(request: VisitRequestRow, now: Date): VisitRequestDisplayStatus {
  const at = now.getTime();
  switch (request.status) {
    case 'declined':
    case 'cancelled':
      return request.status;
    case 'accepted':
      return request.accepted_slot && slotEnd(request.accepted_slot) > at ? 'accepted' : 'past';
    default: {
      if (request.accepted_slot && slotEnd(request.accepted_slot) <= at) return 'past';
      if (!request.accepted_slot && openSlots(request).every((slot) => time(slot.start) <= at)) return 'past';
      return request.status === 'pending' ? 'pending' : 'counterProposed';
    }
  }
}

/** Bien d'une demande : l'instantané, sinon listing_id, sinon l'identifiant de la demande (request(from:)). */
const requestListingId = (request: VisitRequestRow) => request.listing_snapshot?.listingId ?? request.listing_id ?? request.id;

/** Demande encore ouverte de ce compte pour ce bien, la plus récente d'abord (VisitRequestStore.openRequest). */
export function openRequest(requests: VisitRequestRow[], listingId: string, me: string | null, now: Date): VisitRequestRow | null {
  const forListing = requests
    .filter((request) => sameId(requestListingId(request), listingId))
    .sort((a, b) => time(b.created_at) - time(a.created_at));
  return forListing.find((request) => sameId(request.requester?.userId, me)
    && ['pending', 'counterProposed', 'accepted'].includes(requestDisplayStatus(request, now))) ?? null;
}

// MARK: - Agenda

const VISIT_STATUSES: readonly VisitStatus[] = ['confirmed', 'awaitingOther', 'toConfirm', 'cancelled'];

/** Visite d'une ligne de l'agenda ; `null` si la ligne est illisible (l'app l'écarterait). */
export function agendaVisit(row: AgendaRow): AgendaVisit | null {
  const visit = row.visit ?? {};
  // La date de la visite est écrite par l'app en UTC sans fuseau (appDate).
  const start = appDate(visit.start) ?? appDate(row.start_at);
  const status = (visit.status ?? row.status) as VisitStatus;
  if (!start || !VISIT_STATUSES.includes(status)) return null;
  const duration = typeof visit.durationMinutes === 'number' ? visit.durationMinutes : null;
  return { id: row.id, listingId: visit.listing?.listingId ?? row.listing_id ?? null, start, durationMinutes: duration, status };
}

/** Fin prévue : une heure par défaut quand la durée n'est pas connue (Visit.end). */
const visitEnd = (visit: AgendaVisit) => visit.start.getTime() + (visit.durationMinutes ?? 60) * 60_000;

export function visitDisplayStatus(visit: AgendaVisit, now: Date): VisitDisplayStatus {
  if (visit.status === 'confirmed' && visitEnd(visit) <= now.getTime()) return 'done';
  return visit.status;
}

/** Prochaine visite à venir de ce bien : non annulée, pas encore terminée, la plus proche (VisitAgenda.nextVisit). */
export function nextVisit(visits: AgendaVisit[], listingId: string, now: Date): AgendaVisit | null {
  const upcoming = visits
    .filter((visit) => visit.status !== 'cancelled' && visitEnd(visit) > now.getTime() && sameId(visit.listingId, listingId))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  return upcoming[0] ?? null;
}

// MARK: - Dates (VisitDate et VisitRequestFormatting, à l'heure de l'appareil)

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const wideDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/** « 18h00 » (VisitDate.hour, SlotDraft.label). */
export function hourLabel(minutes: number): string {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();

/** « Jeudi 8 octobre · 18h00 » (VisitDate.long). */
export function visitDateLong(date: Date): string {
  return `${capitalized(wideDay.format(date))} · ${hourLabel(minutesOf(date))}`;
}

/** « jeu. 8 oct., 18h00 » (VisitDate.inline). */
export function visitDateInline(date: Date): string {
  return `${shortDay.format(date)}, ${hourLabel(minutesOf(date))}`;
}

/** « Jeu. 5 nov. · 10h00 » (VisitRequestFormatting.slot). */
export function slotLabel(date: Date): string {
  return `${capitalized(shortDay.format(date))} · ${hourLabel(minutesOf(date))}`;
}

// MARK: - Formulaire (SlotDraft)

/** Créneau en cours de saisie : un jour (« 2026-11-07 ») et une heure en minutes, par pas d'une demi-heure. */
export type SlotDraft = { day: string; minutes: number };

/** Heures proposées : de 8h00 à 20h00, toutes les demi-heures (SlotDraft.times). */
export const SLOT_TIMES: readonly number[] = Array.from({ length: 25 }, (_, index) => 8 * 60 + index * 30);

/** Jour local « AAAA-MM-JJ » d'une date (champ de date du navigateur). */
export function dayString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Début d'un jour « AAAA-MM-JJ », à l'heure de l'appareil. */
function startOfDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Demain à 10 h, ou le lendemain d'un jour donné pour le deuxième choix (SlotDraft.suggested). */
export function suggestedSlot(now: Date, after: Date | null = null): SlotDraft {
  const base = after ?? now;
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  return { day: dayString(next), minutes: 10 * 60 };
}

/** Heure de début d'un créneau saisi ; `null` si le jour est vide ou invalide. */
export function slotStart(draft: SlotDraft): Date | null {
  const day = startOfDay(draft.day);
  if (!day) return null;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(draft.minutes / 60), draft.minutes % 60);
}

/** « Ce créneau est déjà passé. » sous le choix (SlotPickerRow) ; un jour vide compte comme passé. */
export function isSlotPast(draft: SlotDraft, now: Date): boolean {
  const start = slotStart(draft);
  return !start || start.getTime() <= now.getTime();
}

/** 1 à 3 créneaux, tous à venir, qui ne se chevauchent pas (VisitRequest.areValid). */
export function areValidSlots(slots: { start: Date; durationMinutes: number }[], now: Date): boolean {
  if (slots.length < 1 || slots.length > 3) return false;
  if (!slots.every((slot) => slot.start.getTime() > now.getTime() && slot.durationMinutes > 0)) return false;
  return slots.every((slot, index) => slots.slice(index + 1).every((other) => {
    const start = slot.start.getTime();
    const end = start + slot.durationMinutes * 60_000;
    const otherStart = other.start.getTime();
    const otherEnd = otherStart + other.durationMinutes * 60_000;
    return !(start < otherEnd && otherStart < end);
  }));
}

export const VISIT_MESSAGE_MAX = 1000;
export const INVALID_SLOTS_MESSAGE = 'Choisissez 1 à 3 créneaux à venir, qui ne se chevauchent pas.';
export const VISIT_FAILURE_MESSAGE = 'La demande n\'a pas pu être enregistrée. Réessayez dans un instant.';

/** Arguments de create_visit_request, tels que l'app les envoie : les champs vides sont omis (Encodable de Swift). */
export type CreateVisitRequestParams = {
  p_id: string;
  p_listing_id: string;
  p_slots: VisitSlot[];
  p_message?: string;
  p_mode: VisitMode;
};

/** Message nettoyé (espaces retirés, 1 000 caractères au plus), `null` s'il est vide (VisitRequest.init). */
export function visitMessage(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, VISIT_MESSAGE_MAX) : null;
}

export function createVisitRequestParams({ id, listingId, slots, message, mode }: {
  id: string;
  listingId: string;
  slots: { id: string; start: Date }[];
  message: string;
  mode: VisitMode;
}): CreateVisitRequestParams {
  const params: CreateVisitRequestParams = {
    p_id: id,
    p_listing_id: listingId,
    p_slots: slots.map((slot) => ({ id: slot.id, start: isoSeconds(slot.start), durationMinutes: 60 })),
    p_mode: mode,
  };
  const text = visitMessage(message);
  if (text !== null) params.p_message = text;
  return params;
}

/** Refus du serveur : son message (P0001) ; sinon le message de l'app (VisitRequestStore.send). */
export function visitErrorMessage(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  return code === 'P0001' && message ? message : VISIT_FAILURE_MESSAGE;
}

// MARK: - Serveur

/** Demandes de visite du compte (my_visit_requests, sans paramètre). */
export async function fetchVisitRequests(): Promise<VisitRequestRow[]> {
  const { data, error } = await supabase.rpc('my_visit_requests');
  if (error) throw error;
  return (data as VisitRequestRow[] | null) ?? [];
}

/** Agenda du compte (agenda_visits, mêmes colonnes que l'app). */
export async function fetchAgenda(): Promise<AgendaVisit[]> {
  const { data, error } = await supabase.from('agenda_visits').select('id, start_at, status, request_id, listing_id, visit');
  if (error) throw error;
  return ((data as AgendaRow[] | null) ?? []).map(agendaVisit).filter((visit): visit is AgendaVisit => visit !== null);
}

/**
 * Envoie la demande (create_visit_request), puis la relit (my_visit_requests avec p_request_id), comme l'app. Une
 * relecture vide est un échec, comme dans l'app (RepositoryError.notFound).
 */
export async function sendVisitRequest(params: CreateVisitRequestParams): Promise<VisitRequestRow> {
  const { data, error } = await supabase.rpc('create_visit_request', params);
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('create_visit_request: identifiant illisible');
  const read = await supabase.rpc('my_visit_requests', { p_request_id: data });
  if (read.error) throw read.error;
  const row = (read.data as VisitRequestRow[] | null)?.[0];
  if (!row) throw new Error('my_visit_requests: demande introuvable');
  return row;
}
