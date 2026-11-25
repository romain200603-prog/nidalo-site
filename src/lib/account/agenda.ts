import { appDate, appDateString } from '../appDates';
import { conversationFrom, fetchConversations, type InboxRow } from '../listing/conversation';
import { requestDisplayStatus, type AgendaRow, type VisitRequestRow, type VisitSlot } from '../listing/visits';
import { photoUrl } from '../listings';
import { isOfflineFailure } from '../loadFailure';
import { fetchProfiles } from '../messages/api';
import { formattedPhoneNumber, normalizedPhoneNumber } from '../messages/format';
import { sameId, type ProfileRow } from '../messages/inbox';
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
  /** Ligne telle que le serveur la garde (visite enregistrée) : la réécrire garde tout ce que l'app y a mis. */
  stored?: StoredVisit;
};

/** Visite enregistrée dans agenda_visits : la visite entière en JSON (Visit encodé par l'app) et ses colonnes. */
export type StoredVisit = { visit: Record<string, unknown>; startAt: string; requestId: string | null; listingId: string | null };

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
    stored: { visit, startAt: row.start_at, requestId: row.request_id ?? null, listingId: row.listing_id ?? null },
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

/** Visite en visio : pas d'itinéraire (Visit.isVideo, n° 178). */
export const isVideoVisit = (item: Pick<AgendaItem, 'address'>): boolean => item.address?.trim() === 'En visio';

/** « vendeur », ou « propriétaire » pour une location (n° 74). */
const sellerWord = (item: Pick<AgendaItem, 'listing'>): string => (item.listing?.transaction === 'rent' ? 'propriétaire' : 'vendeur');

/** Itinéraire sans adresse (openDirections). */
export const noAddressNotice = (item: Pick<AgendaItem, 'listing'>): string =>
  `Adresse non renseignée : l'itinéraire sera disponible quand le ${sellerWord(item)} l'aura communiquée.`;

/** « Message » sans conversation possible avec le vendeur (contact). */
export const noSellerNotice = (item: Pick<AgendaItem, 'listing'>): string => `Impossible de joindre le ${sellerWord(item)} de ce bien pour l'instant.`;

/** « Message » d'une demande reçue sans conversation avec le demandeur (VisitRequestLinks.conversationNotFound, n° 11). */
export const CONVERSATION_NOT_FOUND = 'Aucune conversation avec cette personne n\'a été trouvée pour cette annonce.';

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

/** Demande de visite reçue par ce compte (vendeur ou agent) dont vient la visite ; `null` sinon. */
export function receivedRequest(item: Pick<AgendaItem, 'requestId'>, requests: AgendaRequestRow[], me: string | null): AgendaRequestRow | null {
  if (!item.requestId || !me) return null;
  const request = requests.find((other) => sameId(other.id, item.requestId));
  return request && requestRole(request, me) === 'recipient' ? request : null;
}

/** Ce que l'on lit d'une ligne de my_conversations pour retrouver une conversation (InboxRow, avec ses dates). */
export type AgendaInboxRow = InboxRow & { created_at?: string | null; last_message_at?: string | null };

/**
 * Conversation à deux déjà ouverte sur cette annonce avec cette personne, la plus récente, sans en créer
 * (Conversation.existing(in:listingId:with:), n° 11) ; `null` s'il n'y en a pas.
 */
export function existingConversationId(rows: AgendaInboxRow[], listingId: string, person: string): string | null {
  let best: { id: string; at: number } | null = null;
  for (const row of rows) {
    const conversation = conversationFrom(row, null);
    if (conversation.isGroup || !sameId(conversation.listingId, listingId)) continue;
    if (!sameId(row.buyer_id, person) && !sameId(row.seller_id, person)) continue;
    const at = (appDate(row.last_message_at) ?? appDate(row.created_at))?.getTime() ?? 0;
    if (!best || at > best.at) best = { id: row.conversation_id, at };
  }
  return best?.id ?? null;
}

/** La même, lue sur le serveur (my_conversations sans paramètre) ; `null` si elle est introuvable ou illisible. */
export async function findExistingConversation(listingId: string, person: string): Promise<string | null> {
  try {
    return existingConversationId(await fetchConversations() as AgendaInboxRow[], listingId, person);
  } catch {
    return null;
  }
}

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

// MARK: - Périodes de l'agenda (VisitPeriod, VisitAgenda.periodGroups)

/** « Cette semaine » (les 7 prochains jours, aujourd'hui compris) puis « Plus tard » ; avant, « Ce mois-ci » puis « Plus anciennes ». */
export type VisitPeriod = 'thisWeek' | 'later' | 'thisMonth' | 'older';

export const PERIOD_TITLES: Record<VisitPeriod, string> = {
  thisWeek: 'Cette semaine', later: 'Plus tard', thisMonth: 'Ce mois-ci', older: 'Plus anciennes',
};

/**
 * Période d'une date (period(for:in:)) : à partir d'aujourd'hui, la semaine qui vient ou plus tard ; avant, ce mois-ci
 * ou avant. L'onglet « Passées » range toujours par mois (une visite terminée ce matin est de ce mois-ci).
 */
export function periodOf(date: Date, now: Date, tab: VisitTab | null = null): VisitPeriod {
  const today = startOfDay(now);
  if (tab !== 'past' && (tab === 'upcoming' || date.getTime() >= today)) {
    const days = Math.round((startOfDay(date) - today) / 86_400_000);
    return days < 7 ? 'thisWeek' : 'later';
  }
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() ? 'thisMonth' : 'older';
}

/** Visites de l'onglet, dans leur ordre, réunies par période (periodGroups(in:)). */
export function periodGroupsIn(items: AgendaItem[], tab: VisitTab, now: Date): { period: VisitPeriod; items: AgendaItem[] }[] {
  const groups: { period: VisitPeriod; items: AgendaItem[] }[] = [];
  for (const item of itemsIn(items, tab, now)) {
    const period = periodOf(item.start, now, tab);
    const group = groups.find((other) => other.period === period);
    if (group) group.items.push(item);
    else groups.push({ period, items: [item] });
  }
  return groups;
}

// MARK: - Carte d'une visite (VisitCard, VisitsAgendaView.swift)

/** « 14 h 30 » : l'heure sans zéro devant, les minutes sur deux chiffres. */
const cardHour = (date: Date): string => `${date.getHours()} h ${String(date.getMinutes()).padStart(2, '0')}`;

/** « 18 h 00 – 18 h 45 » ; l'heure de début seule sans durée (VisitCard.timeRange). */
export function visitTimeRange(item: Pick<AgendaItem, 'start' | 'durationMinutes'>): string {
  const start = cardHour(item.start);
  return item.durationMinutes === null ? start : `${start} – ${cardHour(new Date(visitEnd(item)))}`;
}

/** Bloc date de la carte : jour abrégé, numéro, mois abrégé, sans point et en capitales (« VEN », « 6 », « NOV »). */
export function visitDateBlock(date: Date): { weekday: string; day: string; month: string } {
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('fr-FR', options).format(date).replace(/\./g, '').toLocaleUpperCase('fr-FR');
  return { weekday: part({ weekday: 'short' }), day: String(date.getDate()), month: part({ month: 'short' }) };
}

/** Bien de la carte : « Appartement lumineux · Lyon 3e » (« Visite » sans bien). */
export function visitCardTitle(item: Pick<AgendaItem, 'listing'>): string {
  return [item.listing?.title ?? 'Visite', item.listing?.city].filter((part): part is string => !!part).join(' · ');
}

/**
 * Personne de la carte (VisitCard.personLine) : « Avec <personne> », le nom de l'agence s'il diffère
 * (« Avec <personne> · <agence> »), et « en attente de sa réponse » pour une demande envoyée.
 */
export function visitPersonLine(item: Pick<AgendaItem, 'id' | 'requestId' | 'contactName'>, status: VisitDisplayStatus,
  slotCount: number | null, agencyName: string | null): string | null {
  const contact = item.contactName || null;
  const waiting = slotCount !== null || (isRequestEntry(item) && status === 'awaitingOther');
  const agency = agencyName && agencyName !== contact ? agencyName : null;
  const parts = [contact ? `Avec ${contact}` : agency ? `Avec ${agency}` : null, contact ? agency : null, waiting ? 'en attente de sa réponse' : null];
  const line = parts.filter((part): part is string => part !== null).join(' · ');
  return line || null;
}

/** Demande à plusieurs créneaux proposés : leur nombre ; `null` sinon (slotCount(for:)). */
export function visitSlotCount(item: AgendaItem, requests: AgendaRequestRow[]): number | null {
  if (!isRequestEntry(item) || item.status === 'cancelled') return null;
  const request = requests.find((other) => sameId(other.id, item.id));
  const count = request ? openSlotCount(request) : 0;
  return count > 1 ? count : null;
}

/**
 * Agence qui publie chaque annonce visitée (loadAgencyNames) : la fiche de chaque annonce, lue une fois, puis le profil
 * public de son auteur ; seulement un compte d'agence. Les clés sont les identifiants d'annonce en minuscules. Mêmes
 * lectures que « Ajouter une visite » (listings par identifiant, public_profiles) ; une lecture refusée ne montre rien.
 */
export async function fetchAgencyNames(listingIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(listingIds.map((id) => id.toLowerCase()))];
  if (!ids.length) return names;
  const rows = await Promise.all(ids.map(async (id) => {
    try {
      const { data, error } = await supabase.from('listings')
        .select('id, owner_id, city, postal_code, location_precision, public_street').eq('id', id).limit(1);
      const row = (data as { id: string; owner_id: string }[] | null)?.[0];
      return error || !row ? null : { id, owner: row.owner_id };
    } catch {
      return null;
    }
  }));
  const found = rows.filter((row): row is { id: string; owner: string } => row !== null);
  if (!found.length) return names;
  const profiles = await fetchProfiles(found.map((row) => row.owner)).catch(() => new Map<string, ProfileRow>());
  for (const { id, owner } of found) {
    const profile = profiles.get(owner.toLowerCase());
    if (profile?.account_type === 'professional' && profile.agency_id && profile.agency_name) names.set(id, profile.agency_name);
  }
  return names;
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
  /** Dernière lecture des visites empêchée par une coupure de connexion (VisitStore.loadState == .offline). */
  offline?: boolean;
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
    agendaStore.set({ status: before.status === 'ready' ? 'ready' : 'error', visits: agendaStore.get().visits, requests: loadedRequests,
      offline: isOfflineFailure(visits.error) });
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

// MARK: - Créneaux ouverts (VisitSession, VisitSessionStore)

/** Séance de créneaux ouverte par le vendeur ou le bailleur sur son annonce, telle que l'agenda la montre (VisitSession). */
export type VisitSession = {
  id: string;
  listing: VisitListing;
  start: Date;
  end: Date;
  status: 'open' | 'cancelled';
  bookedCount: number;
  totalPlaces: number;
};

/** Ligne de my_visit_sessions (SessionRow) : ce que l'agenda en lit. */
export type VisitSessionRow = {
  id: string;
  listing_id: string;
  listing_snapshot: { listingId?: string | null; title?: string | null; price?: number | string | null; transaction?: string | null;
    city?: string | null; coverPath?: string | null } | null;
  starts_at: string;
  ends_at: string;
  status: string;
  booked_count?: number | null;
  total_places?: number | null;
};

/** Date du serveur, aussi au format brut « 2026-11-20 13:00:00+00 » (lu comme l'app, et par Safari). */
function serverDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const iso = value.trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00');
  return appDate(iso);
}

/** Séance d'une ligne ; `null` si elle est illisible. */
export function sessionFromRow(row: VisitSessionRow): VisitSession | null {
  const start = serverDate(row.starts_at);
  const end = serverDate(row.ends_at);
  if (!row.id || !start || !end) return null;
  const snapshot = row.listing_snapshot ?? {};
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  return {
    id: row.id,
    listing: {
      listingId: snapshot.listingId ?? row.listing_id,
      title: snapshot.title ?? 'Annonce',
      price: amount(snapshot.price),
      transaction: snapshot.transaction === 'rent' ? 'rent' : 'sale',
      city: snapshot.city ?? '',
      coverImageURL: snapshot.coverPath ? photoUrl(snapshot.coverPath) : null,
    },
    start,
    end,
    status: row.status === 'cancelled' ? 'cancelled' : 'open',
    bookedCount: count(row.booked_count),
    totalPlaces: count(row.total_places),
  };
}

/** Séances ouvertes et pas finies, la plus proche d'abord (VisitSessionStore.upcoming, isActive). */
export function upcomingSessions(sessions: VisitSession[], now: Date): VisitSession[] {
  return sessions.filter((session) => session.status === 'open' && session.end.getTime() > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** « 5 inscrits sur 8 », « 1 inscrit sur 4 » (bookedLabel). */
export const sessionBookedLabel = (session: Pick<VisitSession, 'bookedCount' | 'totalPlaces'>): string =>
  `${session.bookedCount} inscrit${session.bookedCount > 1 ? 's' : ''} sur ${session.totalPlaces}`;

/** « Jeudi 5 novembre · 10 h 00 – 12 h 00 » (VisitSessionFormat.session). */
export function sessionTitle(session: Pick<VisitSession, 'start' | 'end'>): string {
  const day = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(session.start);
  return `${day.charAt(0).toLocaleUpperCase('fr-FR')}${day.slice(1)} · ${cardHour(session.start)} – ${cardHour(session.end)}`;
}

/** Mes séances de créneaux (vendeur ou bailleur) ; la liste reste pendant une relecture et après un échec. */
export const visitSessionsStore = createStore<{ owner: string | null; sessions: VisitSession[] }>({ owner: null, sessions: [] });

/** Relit mes séances (my_visit_sessions, sans paramètre, comme l'app pour toutes ses séances). */
export async function loadVisitSessions(): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    visitSessionsStore.set({ owner: null, sessions: [] });
    return;
  }
  try {
    const { data, error } = await supabase.rpc('my_visit_sessions');
    if (currentUserId() !== session.userId || error) return;
    const sessions = ((data as VisitSessionRow[] | null) ?? []).map(sessionFromRow).filter((item): item is VisitSession => item !== null);
    visitSessionsStore.set({ owner: session.userId, sessions });
  } catch {
    // Réseau coupé : la liste reste comme elle est.
  }
}

/** Séances ouvertes à venir du compte `me` (agenda). */
export function upcomingSessionsOf(state: { owner: string | null; sessions: VisitSession[] }, me: string | null, now: Date): VisitSession[] {
  return me && sameId(state.owner, me) ? upcomingSessions(state.sessions, now) : [];
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

// MARK: - Annuler, supprimer, ajouter au calendrier (VisitStore, SupabaseAgendaRepository, VisitActions)

const VISIT_GONE = 'Cette visite n\'existe plus.';
const CONVERSATION_VISIT = 'Cette visite a été organisée dans une conversation : elle peut être annulée, pas supprimée.';

/**
 * Colonnes réécrites, comme SupabaseAgendaRepository.write : début et statut de la visite, sa demande et son annonce
 * (absentes, elles ne sont pas envoyées, comme une valeur absente de Swift), et la visite entière en JSON.
 */
export function visitChanges(stored: StoredVisit, visit: Record<string, unknown>): Record<string, unknown> {
  const changes: Record<string, unknown> = { start_at: text(visit.start) ?? stored.startAt, status: text(visit.status) ?? 'confirmed' };
  const requestId = text(visit.requestId) ?? stored.requestId;
  if (requestId) changes.request_id = requestId;
  const listingId = text(object(visit.listing).listingId) ?? stored.listingId;
  if (listingId) changes.listing_id = listingId;
  changes.visit = visit;
  return changes;
}

/** Visite relue après une modification, à sa place dans l'agenda. */
function replaceVisit(id: string, row: AgendaRow | null) {
  const current = agendaStore.get();
  const next = row ? visitFromRow(row) : null;
  agendaStore.set({
    ...current,
    visits: next ? current.visits.map((item) => (sameId(item.id, id) ? next : item)) : current.visits.filter((item) => !sameId(item.id, id)),
  });
}

/** « Annuler la visite » (VisitStore.cancel) : la ligne réécrite avec le statut « cancelled » ; message d'erreur ou null. */
export async function cancelVisit(item: AgendaItem): Promise<string | null> {
  if (!item.stored) return VISIT_GONE;
  const visit = { ...item.stored.visit, status: 'cancelled' };
  const changes = visitChanges(item.stored, visit);
  const { error } = await supabase.from('agenda_visits').update(changes).eq('id', item.id.toLowerCase());
  if (error) return agendaErrorMessage(error);
  replaceVisit(item.id, { id: item.id, start_at: String(changes.start_at), status: 'cancelled', request_id: item.stored.requestId,
    listing_id: item.stored.listingId, visit: visit as AgendaRow['visit'] });
  return null;
}

/** Dossier des photos du compte rendu d'une visite (AgendaSync.folder) : « <compte>/<visite> », en minuscules. */
export const reportFolder = (owner: string, visitId: string): string => `${owner.toLowerCase()}/${visitId.toLowerCase()}`;

/**
 * « Supprimer » (VisitStore.delete) : seulement une visite ajoutée à la main ; ses photos du compte rendu d'abord
 * (visit-reports), puis la ligne. Message d'erreur ou null.
 */
export async function deleteVisit(item: AgendaItem, owner: string): Promise<string | null> {
  if (!item.stored) return VISIT_GONE;
  if (item.conversationId !== null) return CONVERSATION_VISIT;
  const bucket = supabase.storage.from('visit-reports');
  const folder = reportFolder(owner, item.id);
  const listed = await bucket.list(folder);
  if (listed.error) return agendaErrorMessage(listed.error);
  const paths = (listed.data ?? []).map((file) => `${folder}/${file.name}`);
  if (paths.length) {
    const removed = await bucket.remove(paths);
    if (removed.error) return agendaErrorMessage(removed.error);
  }
  const { error } = await supabase.from('agenda_visits').delete().eq('id', item.id.toLowerCase());
  if (error) return agendaErrorMessage(error);
  replaceVisit(item.id, null);
  return null;
}

/** Texte d'une ligne de fichier .ics : barres obliques, virgules, points-virgules et retours échappés. */
const icsText = (value: string): string => value.replace(/\\/g, '\\\\').replace(/[,;]/g, (char) => `\\${char}`).replace(/\r?\n/g, '\\n');
const icsDate = (date: Date): string => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * « Ajouter à mon calendrier » (VisitActions.addToCalendar) : sur le site, un fichier .ics avec le même événement
 * (« Visite : <bien> », l'adresse, le début et la fin, les notes), que le calendrier de l'appareil ouvre.
 */
export function visitCalendarFile(item: AgendaItem, now: Date = new Date()): string {
  const notes = text(item.stored?.visit.notes);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nidalo//Agenda des visites//FR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${item.id.toLowerCase()}@nidalo.fr`, `DTSTAMP:${icsDate(now)}`, `DTSTART:${icsDate(item.start)}`, `DTEND:${icsDate(new Date(visitEnd(item)))}`,
    `SUMMARY:${icsText(`Visite : ${item.listing?.title ?? 'bien immobilier'}`)}`,
  ];
  const address = routableAddress(item);
  if (address) lines.push(`LOCATION:${icsText(address)}`);
  if (notes) lines.push(`DESCRIPTION:${icsText(notes)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

/** Le fichier .ics d'une visite, téléchargé (« visite.ics »). */
export function downloadVisitCalendar(item: AgendaItem) {
  const url = URL.createObjectURL(new Blob([visitCalendarFile(item)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'visite.ics';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Texte partagé d'une visite (VisitDetailView.shareText) : bien, date et durée, adresse et contact. */
export function visitShareText(item: AgendaItem, longDate: (date: Date) => string): string {
  const lines = [`Visite : ${item.listing?.title ?? 'bien immobilier'}`, longDate(item.start) + (item.durationMinutes ? ` (${item.durationMinutes} min)` : '')];
  const address = routableAddress(item);
  if (address) lines.push(`Adresse : ${address}`);
  const phone = visitDetails(item).contactPhone;
  if (item.contactName) lines.push(`Contact : ${item.contactName}${phone ? ` · ${formattedPhoneNumber(phone)}` : ''}`);
  return lines.join('\n');
}

/** Sections de « Préparer ma visite », dans l'ordre de l'app (VisitChecklistSection). */
const CHECKLIST_SECTIONS: [string, string][] = [
  ['questions', 'Questions à poser'], ['checks', 'Points à vérifier'], ['works', 'Travaux à prévoir'], ['info', 'Informations importantes'],
];
const CONDITION_LABELS: Record<string, string> = { veryGood: 'Très bon état', good: 'Bon état', refresh: 'À rafraîchir', renovate: 'Gros travaux' };

/** Ce que l'écran « Détail de la visite » lit de la visite enregistrée (VisitDetailView). */
export type VisitDetails = {
  contactPhone: string | null;
  participants: string[];
  /** « La veille et 2 h avant » ; `null` sans rappel (ou visite annulée). */
  reminders: string | null;
  notes: string | null;
  report: { summary: string | null; positives: string | null; negatives: string | null; personalNote: string | null; worksEstimate: number | null; photos: number } | null;
  /** « Ma préparation » : lignes retenues par section, puis l'état général ; `null` si rien n'est retenu. */
  preparation: { sections: { title: string; items: string[] }[]; condition: string | null } | null;
};

/** Préparation montrée par le détail (preparationCard) : seulement avec une ligne cochée, un état ou une note d'état. */
function preparationOf(raw: unknown): VisitDetails['preparation'] {
  if (!raw || typeof raw !== 'object') return null;
  const preparation = object(raw);
  const items = Array.isArray(preparation.items) ? preparation.items.map(object) : [];
  const sections = CHECKLIST_SECTIONS.map(([key, title]) => ({
    title, items: items.filter((entry) => entry.section === key && entry.isChecked === true).map((entry) => text(entry.text)).filter((line): line is string => !!line),
  })).filter((section) => section.items.length > 0);
  const condition = typeof preparation.condition === 'string' ? CONDITION_LABELS[preparation.condition] ?? null : null;
  const note = text(preparation.conditionNote);
  if (!sections.length && !condition && !note) return null;
  return { sections, condition: condition || note ? [condition, note].filter(Boolean).join(' · ') : null };
}

export function visitDetails(item: AgendaItem): VisitDetails {
  const visit = item.stored?.visit ?? {};
  const participants = Array.isArray(visit.participants) ? visit.participants.map((entry) => text(object(entry).name)).filter((name): name is string => !!name) : [];
  const rawReminders = object(visit.reminders);
  const summary = visit.reminders && item.status !== 'cancelled' ? remindersSummary({
    eveningBefore: rawReminders.eveningBefore === true, twoHoursBefore: rawReminders.twoHoursBefore === true,
    customMinutesBefore: typeof rawReminders.customMinutesBefore === 'number' ? rawReminders.customMinutesBefore : null,
  }) : null;
  const reminders = summary ? summary.replace('rappels ', '').replace('rappel ', '') : null;
  const report = visit.report ? object(visit.report) : null;
  const phone = text(visit.contactPhone);
  return {
    contactPhone: phone ? normalizedPhoneNumber(phone) ?? phone : null,
    participants,
    reminders: reminders ? reminders.charAt(0).toLocaleUpperCase('fr-FR') + reminders.slice(1) : null,
    notes: text(visit.notes),
    report: report ? {
      summary: item.reportSummary, positives: text(report.positives), negatives: text(report.negatives), personalNote: text(report.personalNote),
      worksEstimate: typeof report.worksEstimate === 'number' ? report.worksEstimate : null, photos: Array.isArray(report.photos) ? report.photos.length : 0,
    } : null,
    preparation: preparationOf(visit.preparation),
  };
}
