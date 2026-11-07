import { supabase } from '../supabase';
import { decodeContent, type MessageContent } from './content';
import type { CommunityRow, Counterpart, ParticipantRow, ProfessionalContactRow, ProfileRow, ServerInboxRow } from './inbox';
import { sameId, upper } from './inbox';

// Appels de la messagerie au serveur, avec les mêmes tables, fonctions, colonnes et formats que l'app
// (Data/Supabase/SupabaseMessagingRepository.swift). Les identifiants partent comme Swift les écrit (`uuidString`,
// en majuscules) ; le serveur les lit sans tenir compte de la casse.

/** Colonnes lues d'un message, avec ses réactions (messageColumns). */
export const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, kind, client_id, content, created_at, expires_at, message_reactions(user_id, emoji, created_at)';
/** Colonnes lues des membres d'une conversation (ParticipantRow). */
export const PARTICIPANT_COLUMNS = 'conversation_id, user_id, role, left_at, last_read_at';
/** Messages lus à l'ouverture d'une conversation : les 200 derniers (MessagingStore.loadMessages). */
export const MESSAGE_PAGE = 200;

export type ReactionRow = { user_id: string; emoji: string; created_at: string };

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: string;
  client_id: string | null;
  content: unknown;
  created_at: string;
  expires_at: string | null;
  message_reactions: ReactionRow[] | null;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string | null;
  clientId: string;
  content: MessageContent;
  createdAt: Date;
  expiresAt: Date | null;
  /** Ma réaction, sinon la plus récente (message(from:)). */
  reaction: string | null;
  /** Coches : « vu » quand tous les autres membres ont lu après ce message. */
  isRead: boolean;
};

class MessagingError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

/** Erreur du serveur à afficher : son message en français (P0001), sinon `null` (connexion, droits…). */
export function serverMessage(error: unknown): string | null {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  if (error instanceof MessagingError) return error.message;
  if (code === 'P0001' && message?.trim()) return message.trim();
  return null;
}

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

/** Dernière lecture des autres membres actifs : aucune si l'un d'eux n'a jamais lu (otherReadAt). */
export function otherReadAt(rows: ParticipantRow[], me: string | null): Date | null {
  const others = rows.filter((row) => !sameId(row.user_id, me) && row.left_at === null);
  if (!others.length || others.some((row) => !row.last_read_at)) return null;
  return new Date(Math.min(...others.map((row) => time(row.last_read_at))));
}

export function messageFrom(row: MessageRow, me: string | null, readAt: Date | null): Message {
  const reactions = row.message_reactions ?? [];
  const mine = reactions.find((reaction) => sameId(reaction.user_id, me));
  const latest = [...reactions].sort((a, b) => time(b.created_at) - time(a.created_at))[0];
  const createdAt = new Date(row.created_at);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    clientId: row.client_id ?? row.id,
    content: decodeContent(row.content),
    createdAt,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    reaction: (mine ?? latest)?.emoji ?? null,
    isRead: sameId(row.sender_id, me) && readAt !== null && readAt.getTime() >= createdAt.getTime(),
  };
}

// MARK: - Boîte de réception

/** Une conversation, ou toutes (my_conversations, avec p_conversation_id pour une seule). */
export async function fetchInboxRows(conversationId?: string): Promise<ServerInboxRow[]> {
  const { data, error } = await supabase.rpc('my_conversations', conversationId ? { p_conversation_id: upper(conversationId) } : {});
  if (error) throw error;
  return (data as ServerInboxRow[] | null) ?? [];
}

/** Membres des groupes (pour leurs noms et les coches). */
export async function fetchParticipants(conversationIds: string[]): Promise<ParticipantRow[]> {
  if (!conversationIds.length) return [];
  const { data, error } = await supabase.from('conversation_participants').select(PARTICIPANT_COLUMNS)
    .in('conversation_id', conversationIds.map(upper));
  if (error) throw error;
  return (data as ParticipantRow[] | null) ?? [];
}

/** Profils publics (public_profiles), par identifiant en minuscules ; vide si la lecture échoue (`try?`). */
export async function fetchProfiles(userIds: string[]): Promise<Map<string, ProfileRow>> {
  const unique = [...new Set(userIds.map((id) => id.toLowerCase()))];
  const profiles = new Map<string, ProfileRow>();
  if (!unique.length) return profiles;
  const { data, error } = await supabase.rpc('public_profiles', { user_ids: unique.map(upper) });
  if (error || !Array.isArray(data)) return profiles;
  for (const row of data as ProfileRow[]) {
    const key = row.user_id.toLowerCase();
    if (!profiles.has(key)) profiles.set(key, row);
  }
  return profiles;
}

/** Communautés du compte (my_communities). */
export async function fetchCommunities(): Promise<CommunityRow[]> {
  const { data, error } = await supabase.rpc('my_communities', {});
  if (error) throw error;
  return (data as CommunityRow[] | null) ?? [];
}

/** Agences qui publient (professional_contacts) ; vide si la lecture échoue, comme l'app. */
export async function fetchProfessionalContacts(): Promise<ProfessionalContactRow[]> {
  const { data, error } = await supabase.rpc('professional_contacts');
  if (error || !Array.isArray(data)) return [];
  return data as ProfessionalContactRow[];
}

/** Comptes bloqués par moi (user_blocks) ; vide si la lecture échoue. */
export async function fetchBlockedIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('user_blocks').select('blocked_id');
  if (error || !Array.isArray(data)) return new Set();
  return new Set((data as { blocked_id: string }[]).map((row) => row.blocked_id.toLowerCase()));
}

// MARK: - Messages

/** Les 200 derniers messages, du plus ancien au plus récent, et la dernière lecture des autres (messages(…)). */
export async function fetchMessages(conversationId: string, me: string | null): Promise<Message[]> {
  const { data, error } = await supabase.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id', upper(conversationId))
    .order('created_at', { ascending: false }).limit(MESSAGE_PAGE);
  if (error) throw error;
  const members = await supabase.from('conversation_participants').select(PARTICIPANT_COLUMNS).eq('conversation_id', upper(conversationId));
  if (members.error) throw members.error;
  const readAt = otherReadAt((members.data as ParticipantRow[] | null) ?? [], me);
  return ((data as MessageRow[] | null) ?? []).reverse().map((row) => messageFrom(row, me, readAt));
}

/** Nouveau message (insert dans messages), avec exactement les colonnes de l'app (MessageInsert). */
export type MessageInsert = { id: string; conversation_id: string; client_id: string; content: unknown; preview: string };

export function messageInsert(conversationId: string, clientId: string, content: unknown, preview: string): MessageInsert {
  return { id: upper(clientId), conversation_id: upper(conversationId), client_id: upper(clientId), content, preview: [...preview].slice(0, 300).join('') };
}

/** Envoie un message ; un envoi rejoué (23505) relit le message déjà enregistré (send(…)). */
export async function insertMessage(insert: MessageInsert, me: string): Promise<Message> {
  const { data, error } = await supabase.from('messages').insert(insert).select(MESSAGE_COLUMNS).single();
  if (!error) return messageFrom(data as MessageRow, me, null);
  if (error.code === '23505') {
    const again = await supabase.from('messages').select(MESSAGE_COLUMNS).eq('sender_id', upper(me)).eq('client_id', insert.client_id).single();
    if (again.error) throw again.error;
    return messageFrom(again.data as MessageRow, me, null);
  }
  if (error.code === '42501') throw new MessagingError('Impossible d\'envoyer ce message.', error.code);
  throw error;
}

/** Conversation lue (mark_conversation_read) ; un échec est ignoré, comme dans l'app (`try?`). */
export async function markConversationRead(conversationId: string): Promise<void> {
  try {
    await supabase.rpc('mark_conversation_read', { p_conversation_id: upper(conversationId) });
  } catch {
    // Rien à faire : la prochaine ouverture relira.
  }
}

/** Cœur posé (upsert sur message_id,user_id) ou retiré (delete de ma réaction) (setReaction). */
export async function setReaction(messageId: string, emoji: string | null, me: string): Promise<void> {
  const request = emoji
    ? supabase.from('message_reactions').upsert({ message_id: upper(messageId), emoji }, { onConflict: 'message_id,user_id' })
    : supabase.from('message_reactions').delete().eq('message_id', upper(messageId)).eq('user_id', upper(me));
  const { error } = await request;
  if (error) throw error;
}

// MARK: - Préférences, blocage, signalement

/** Réglages d'une conversation relus avant chaque écriture (currentSettings). */
export type Preferences = {
  isArchived: boolean;
  isFavorite: boolean;
  mutedUntil: string | null;
  savesPhotos: boolean;
  clearedAt: string | null;
};

const isoDate = (value: string | null) => (value ? new Date(value).toISOString() : null);

/** Réglages enregistrés d'une ligne de my_conversations. */
export function preferencesOf(row: ServerInboxRow): Preferences {
  return {
    isArchived: row.is_archived ?? false,
    isFavorite: row.is_favorite ?? false,
    mutedUntil: isoDate(row.muted_until ?? null),
    savesPhotos: row.saves_photos ?? false,
    clearedAt: isoDate(row.cleared_at ?? null),
  };
}

/**
 * Ligne de conversation_preferences telle que l'app l'écrit (PreferencesWrite) : muted_until et cleared_at toujours
 * présents (null s'ils sont vides), hidden_at seulement pour masquer.
 */
export function preferencesWrite(conversationId: string, preferences: Preferences): Record<string, unknown> {
  return {
    conversation_id: upper(conversationId),
    is_archived: preferences.isArchived,
    is_favorite: preferences.isFavorite,
    muted_until: preferences.mutedUntil,
    saves_photos: preferences.savesPhotos,
    cleared_at: preferences.clearedAt,
  };
}

/**
 * Change un réglage comme l'app : relit la conversation (réglages actuels), puis enregistre tous ses réglages avec
 * le changement (setArchived, setMuted, updateSettings).
 */
export async function savePreferences(conversationId: string, change: (current: Preferences) => Preferences): Promise<void> {
  const [row] = await fetchInboxRows(conversationId);
  if (!row) throw new MessagingError('Conversation introuvable.');
  const write = preferencesWrite(conversationId, change(preferencesOf(row)));
  const { error } = await supabase.from('conversation_preferences').upsert(write, { onConflict: 'conversation_id,user_id' });
  if (error) throw error;
}

export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.from('user_blocks').insert({ blocked_id: upper(userId) });
  if (error && error.code !== '23505') throw error;
}

/** Débloque ; un échec est ignoré, comme dans l'app (`try?`). */
export async function unblockUser(userId: string, me: string): Promise<void> {
  await supabase.from('user_blocks').delete().eq('blocker_id', upper(me)).eq('blocked_id', upper(userId));
}

/** Motifs proposés, dans l'ordre de la feuille de signalement (ReportSheet.reasons, ReportReason.label). */
export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'scam', label: 'Fraude immobilière ou arnaque' },
  { value: 'inappropriate', label: 'Contenu inapproprié' },
  { value: 'harassment', label: 'Harcèlement' },
  { value: 'impersonation', label: 'Usurpation d\'identité' },
  { value: 'other', label: 'Autre' },
] as const;
/** Description facultative : 500 caractères dans la feuille (LimitedEditor). */
export const REPORT_DETAILS_LIMIT = 500;
export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

/** Signalement d'une conversation (reports) ; un signalement rejoué (23505) est déjà enregistré. */
export async function reportConversation(id: string, conversationId: string, reason: ReportReason, details: string | null): Promise<void> {
  const row: Record<string, unknown> = { id: upper(id), target_type: 'conversation', target_id: upper(conversationId), reason };
  if (details !== null) row.details = [...details].slice(0, 2000).join('');
  const { error } = await supabase.from('reports').insert(row);
  if (error && error.code !== '23505') throw error;
}

// MARK: - Nouvelle discussion

export type PhoneAccountRow = {
  user_id: string;
  public_name: string | null;
  avatar_path: string | null;
  account_type: string | null;
  agency_name: string | null;
  agency_city: string | null;
};

/**
 * Compte trouvé par son numéro, tel que l'app le montre (PhoneLookupRow.account) : le nom de l'agence d'un
 * professionnel, sinon le nom public (« Membre Nidalo » sans nom) ; jamais le numéro.
 */
export function phoneAccount(row: PhoneAccountRow): { userId: string; counterpart: Counterpart } {
  const isAgency = row.account_type === 'professional' && row.agency_name != null;
  const publicName = row.public_name?.trim();
  const name = isAgency ? (row.agency_name ?? 'Agence') : (publicName || 'Membre Nidalo');
  const role = isAgency ? 'Agence' : 'Particulier';
  const city = isAgency ? row.agency_city : null;
  return {
    userId: row.user_id,
    counterpart: { name, subtitle: city ? `${role} · ${city}` : role, kind: isAgency ? 'agency' : 'individual', phone: null, imagePath: null },
  };
}

/** Compte de ce numéro (find_account_by_phone, numéro normalisé « 0639981234 »). */
export async function findAccountByPhone(phone: string): Promise<PhoneAccountRow | null> {
  const { data, error } = await supabase.rpc('find_account_by_phone', { p_phone: phone });
  if (error) throw error;
  return ((data as PhoneAccountRow[] | null) ?? [])[0] ?? null;
}

/** Conversation directe avec le compte de ce numéro : l'existante, sinon une nouvelle (start_phone_conversation). */
export async function startPhoneConversation(phone: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_phone_conversation', { p_phone: phone });
  if (error) throw error;
  return String(data);
}

/** Conversation directe avec une agence qui publie (start_direct_conversation). */
export async function startDirectConversation(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_direct_conversation', { p_user_id: upper(userId) });
  if (error) throw error;
  return String(data);
}

// MARK: - Agenda (visites liées aux conversations)

export type AgendaListing = {
  listingId: string | null;
  title: string;
  price: number;
  transaction: 'sale' | 'rent';
  city: string;
  coverUrl: string | null;
};

/** Visite de l'agenda telle que la messagerie la lit (Visit) : conversation, bien, contact, adresse. */
export type ConversationVisit = {
  id: string;
  conversationId: string | null;
  listing: AgendaListing | null;
  start: Date;
  durationMinutes: number | null;
  status: 'confirmed' | 'awaitingOther' | 'toConfirm' | 'cancelled';
  contactName: string | null;
  address: string | null;
};

type AgendaJson = {
  conversationId?: string | null;
  listing?: { listingId?: string | null; title?: string | null; price?: number | string | null; transaction?: string | null;
    city?: string | null; coverImageURL?: string | null } | null;
  start?: string;
  durationMinutes?: number | null;
  status?: string;
  contactName?: string | null;
  address?: string | null;
};

const VISIT_STATUSES = ['confirmed', 'awaitingOther', 'toConfirm', 'cancelled'] as const;

export function conversationVisit(row: { id: string; start_at: string; status: string; listing_id: string | null; visit: AgendaJson | null }): ConversationVisit | null {
  const visit = row.visit ?? {};
  const start = new Date(visit.start ?? row.start_at);
  const status = (visit.status ?? row.status) as ConversationVisit['status'];
  if (Number.isNaN(start.getTime()) || !VISIT_STATUSES.includes(status)) return null;
  const listing = visit.listing ? {
    listingId: visit.listing.listingId ?? row.listing_id ?? null,
    title: visit.listing.title ?? 'Annonce',
    price: Number(visit.listing.price ?? 0) || 0,
    transaction: visit.listing.transaction === 'rent' ? 'rent' as const : 'sale' as const,
    city: visit.listing.city ?? '',
    coverUrl: visit.listing.coverImageURL && /^https:\/\//.test(visit.listing.coverImageURL) ? visit.listing.coverImageURL : null,
  } : null;
  const address = visit.address?.trim() ? visit.address.trim() : null;
  return {
    id: row.id, conversationId: visit.conversationId ?? null, listing, start,
    durationMinutes: typeof visit.durationMinutes === 'number' ? visit.durationMinutes : null, status,
    contactName: visit.contactName ?? null, address,
  };
}

/** Agenda du compte (agenda_visits, mêmes colonnes que l'app et que la fiche). */
export async function fetchConversationVisits(): Promise<ConversationVisit[]> {
  const { data, error } = await supabase.from('agenda_visits').select('id, start_at, status, request_id, listing_id, visit');
  if (error) throw error;
  return ((data as Parameters<typeof conversationVisit>[0][] | null) ?? [])
    .map(conversationVisit).filter((visit): visit is ConversationVisit => visit !== null);
}

/** Visites à venir : non annulées et pas encore terminées (une heure par défaut), les plus proches d'abord. */
export function upcomingVisits(visits: ConversationVisit[], now: Date): ConversationVisit[] {
  return visits
    .filter((visit) => visit.status !== 'cancelled' && visit.start.getTime() + (visit.durationMinutes ?? 60) * 60_000 > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
