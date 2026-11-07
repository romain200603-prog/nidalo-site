import { useEffect } from 'react';
import { createStore, currentUserId, useStore } from '../account/session';
import {
  conversationRowsStore, follow, liveReload, onMessagingChange, patchConversationRow, startLiveBadges, type ConversationRows,
} from '../badges';
import { supabase } from '../supabase';
import { fetchOffers, type OfferRow } from '../listing/offers';
import {
  blockUser, fetchBlockedIds, fetchCommunities, fetchConversationVisits, fetchMessages, fetchParticipants, fetchProfessionalContacts,
  fetchProfiles, insertMessage, markConversationRead, messageInsert, savePreferences, setReaction, unblockUser,
  type ConversationVisit, type Message, type Preferences,
} from './api';
import { attachmentsContent, attachmentsPreview, contentPreview, decodeContent, textContent, type Attachment } from './content';
import { DISTANT_FUTURE } from './format';
import {
  conversationFrom, sameId, upper, type CommunityRow, type Conversation, type ParticipantRow, type ProfessionalContactRow,
  type ProfileRow, type ServerInboxRow,
} from './inbox';

// État de la page Messages, comme MessagingStore de l'app (Data/MessagingStore.swift) : la boîte de réception vient
// des lignes de my_conversations déjà lues pour la pastille (lib/badges.ts), complétées par les membres des groupes,
// les profils publics et les communautés ; la conversation ouverte garde ses 200 derniers messages. Le temps réel
// relit tout (refreshFromServer), puis les offres ; la conversation ouverte est marquée lue dès qu'elle a des non-lus.

export type InboxState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; conversations: Conversation[] };

export const inboxStore = createStore<InboxState>({ status: 'loading' });

type Extras = { participants: ParticipantRow[]; profiles: Map<string, ProfileRow>; communities: CommunityRow[] };

let extras: Extras = { participants: [], profiles: new Map(), communities: [] };
let lastRows: ServerInboxRow[] | null = null;
let build = 0;

function publish(rows: ServerInboxRow[]) {
  const me = currentUserId();
  inboxStore.set({ status: 'ready', conversations: rows.map((row) => conversationFrom(row, { me, ...extras })) });
}

/** Membres des groupes, profils publics et communautés des lignes (inbox(…) et communities() de l'app). */
async function loadExtras(rows: ServerInboxRow[]): Promise<Extras> {
  const groups = rows.filter((row) => row.kind === 'group').map((row) => row.conversation_id);
  const participants = await fetchParticipants(groups).catch(() => extras.participants);
  const others = rows.map((row) => row.other_user_id).filter((id): id is string => !!id);
  const [profiles, communities] = await Promise.all([
    fetchProfiles([...others, ...participants.map((member) => member.user_id)]),
    groups.length ? fetchCommunities().catch(() => extras.communities) : Promise.resolve<CommunityRow[]>([]),
  ]);
  return { participants, profiles, communities };
}

function onRows(value: ConversationRows) {
  if (!value.rows) {
    lastRows = null;
    inboxStore.set(value.failed ? { status: 'error' } : { status: 'loading' });
    return;
  }
  const rows = value.rows as unknown as ServerInboxRow[];
  lastRows = rows;
  if (value.local) {
    publish(rows);
  } else {
    const token = ++build;
    void loadExtras(rows).then((next) => {
      if (token !== build) return;
      extras = next;
      if (lastRows) publish(lastRows);
    });
  }
  markOpenConversationRead();
}

conversationRowsStore.subscribe(() => onRows(conversationRowsStore.get()));
onRows(conversationRowsStore.get());

export function conversationById(id: string | null): Conversation | null {
  const state = inboxStore.get();
  if (!id || state.status !== 'ready') return null;
  return state.conversations.find((conversation) => sameId(conversation.id, id)) ?? null;
}

/** Profil public déjà lu d'un interlocuteur ou d'un membre (photo, ancienneté de « Détails »). */
export function profileOf(userId: string | null): ProfileRow | null {
  return userId ? extras.profiles.get(userId.toLowerCase()) ?? null : null;
}

// MARK: - Conversation ouverte

export type ThreadState = {
  conversationId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  messages: Message[];
};

export const threadStore = createStore<ThreadState>({ conversationId: null, status: 'idle', messages: [] });

let threadToken = 0;

async function loadThread(conversationId: string, quiet: boolean) {
  const token = ++threadToken;
  if (!quiet) threadStore.set({ conversationId, status: 'loading', messages: [] });
  try {
    const messages = await fetchMessages(conversationId, currentUserId());
    if (token !== threadToken) return;
    threadStore.set({ conversationId, status: 'ready', messages });
  } catch {
    if (token !== threadToken) return;
    const current = threadStore.get();
    // Une relecture qui échoue garde les messages déjà affichés (refreshFromServer, `try?`).
    if (!quiet || current.status !== 'ready') threadStore.set({ conversationId, status: 'error', messages: [] });
  }
}

/** Ouvre une conversation (ou aucune) : lit ses messages et la marque lue si elle a des non-lus. */
export function openConversation(conversationId: string | null) {
  const current = threadStore.get();
  if (sameId(current.conversationId, conversationId) && current.status !== 'error') return;
  if (!conversationId) {
    threadToken += 1;
    threadStore.set({ conversationId: null, status: 'idle', messages: [] });
    return;
  }
  void loadThread(conversationId, false);
  markOpenConversationRead();
}

export function reloadThread() {
  const { conversationId } = threadStore.get();
  if (conversationId) void loadThread(conversationId, true);
}

/** Ajoute un message envoyé à la conversation ouverte (send : la liste prend la ligne renvoyée par le serveur). */
export function appendMessage(message: Message) {
  const current = threadStore.get();
  if (!sameId(current.conversationId, message.conversationId)) return;
  if (current.messages.some((item) => sameId(item.id, message.id))) return;
  threadStore.set({ ...current, messages: [...current.messages, message] });
}

export function updateMessage(id: string, change: (message: Message) => Message) {
  const current = threadStore.get();
  threadStore.set({ ...current, messages: current.messages.map((message) => (sameId(message.id, id) ? change(message) : message)) });
}

/**
 * Conversation ouverte avec des non-lus : 0 tout de suite (la pastille suit), puis mark_conversation_read (à
 * l'ouverture et à chaque changement reçu, comme refreshFromServer). Pas quand l'onglet est caché : le retour sur
 * l'onglet relit tout et la marque alors.
 */
function markOpenConversationRead() {
  const { conversationId } = threadStore.get();
  const { rows } = conversationRowsStore.get();
  if (!conversationId || !rows) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  const row = rows.find((item) => sameId(String(item.conversation_id), conversationId));
  if (!row || !((row.unread_count ?? 0) > 0)) return;
  patchConversationRow(conversationId, { unread_count: 0 });
  void markConversationRead(conversationId);
}

// MARK: - Envoi (MessagingStore.send)

/**
 * Envoie un contenu, comme l'app : insert dans messages, puis le message rejoint la conversation ouverte, qui remonte
 * en tête de liste et sort des archives (sur place ; le serveur garde son réglage). Lève l'erreur du serveur.
 */
async function sendContent(conversationId: string, content: Record<string, unknown>): Promise<Message> {
  const me = currentUserId();
  if (!me) throw new Error('Votre session a expiré. Reconnectez-vous.');
  const clientId = crypto.randomUUID();
  const preview = contentPreview(decodeContent(content));
  const message = await insertMessage(messageInsert(conversationId, clientId, content, preview), me);
  appendMessage(message);
  patchConversationRow(conversationId, {
    last_message_id: message.id,
    last_message_sender_id: message.senderId ?? upper(me),
    last_message_kind: Object.keys(content)[0],
    last_message_content: content,
    last_message_preview: [...preview].slice(0, 300).join(''),
    last_message_at: message.createdAt.toISOString(),
    is_archived: false,
  }, { toTop: true });
  return message;
}

/** Texte envoyé (sans espaces autour) ; `false` s'il est vide ou n'a pas pu partir. */
export async function sendText(conversationId: string, text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    await sendContent(conversationId, textContent(trimmed));
    return true;
  } catch {
    return false;
  }
}

/** Pièces jointes déjà envoyées dans le dossier, et leur message d'accompagnement facultatif. */
export async function sendAttachments(conversationId: string, items: Attachment[], caption: string): Promise<boolean> {
  if (!items.length) return false;
  const text = caption.trim();
  try {
    await sendContent(conversationId, attachmentsContent(items, text ? text : null));
    return true;
  } catch {
    return false;
  }
}

/** Aperçu écrit avec un message de pièces jointes (colonne preview), pour les tests. */
export const attachmentsPreviewText = attachmentsPreview;

/** Appui long : pose ou retire le cœur, d'abord sur place, puis sur le serveur (`try?`). */
export async function toggleHeart(messageId: string) {
  const me = currentUserId();
  const message = threadStore.get().messages.find((item) => sameId(item.id, messageId));
  if (!me || !message) return;
  const reaction = message.reaction === null ? '♥' : null;
  updateMessage(messageId, (item) => ({ ...item, reaction }));
  try {
    await setReaction(messageId, reaction, me);
  } catch {
    // Comme l'app : le cœur reste affiché ; la prochaine relecture donne l'état du serveur.
  }
}

// MARK: - Réglages (conversation_preferences), blocage

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/** Archive ou désarchive : sur place, puis enregistré (setArchived, `try?`). */
export async function setArchived(conversationId: string, isArchived: boolean) {
  patchConversationRow(conversationId, { is_archived: isArchived });
  await savePreferences(conversationId, (current) => ({ ...current, isArchived })).catch(() => undefined);
}

/** Sourdine « toujours » ou rien (setMuted, `try?`). */
export async function setMuted(conversationId: string, muted: boolean) {
  const mutedUntil = muted ? iso(DISTANT_FUTURE) : null;
  patchConversationRow(conversationId, { muted_until: mutedUntil });
  await savePreferences(conversationId, (current) => ({ ...current, mutedUntil })).catch(() => undefined);
}

/**
 * Change un réglage puis relit la conversation (updateSettings) : favori ou durée de sourdine. Lève l'erreur, que
 * l'écran montre ou non selon l'app.
 */
export async function updateSettings(conversationId: string, change: (current: Preferences) => Preferences) {
  let saved: Preferences | null = null;
  await savePreferences(conversationId, (current) => {
    saved = change(current);
    return saved;
  });
  const next = saved as Preferences | null;
  if (next) {
    patchConversationRow(conversationId, {
      is_favorite: next.isFavorite, muted_until: next.mutedUntil, is_archived: next.isArchived,
    });
  }
}

export async function block(userId: string): Promise<boolean> {
  try {
    await blockUser(userId);
    setBlocked(userId, true);
    return true;
  } catch {
    return false;
  }
}

export async function unblock(userId: string): Promise<boolean> {
  const me = currentUserId();
  if (!me) return false;
  try {
    await unblockUser(userId, me);
    setBlocked(userId, false);
    return true;
  } catch {
    return false;
  }
}

// MARK: - Offres, visites, blocages, agences

export type Loadable<T> = { status: 'idle' | 'loading' | 'ready' | 'error'; value: T };

export const offersStore = createStore<Loadable<OfferRow[]>>({ status: 'idle', value: [] });
export const visitsStore = createStore<Loadable<ConversationVisit[]>>({ status: 'idle', value: [] });
export const blockedStore = createStore<Set<string>>(new Set());
export const professionalsStore = createStore<Loadable<ProfessionalContactRow[]>>({ status: 'idle', value: [] });

/** Offres du compte (my_offers), relues après chaque action et chaque changement reçu (refreshRemote). */
export async function loadOffers(): Promise<void> {
  if (offersStore.get().status === 'idle') offersStore.set({ status: 'loading', value: [] });
  try {
    offersStore.set({ status: 'ready', value: await fetchOffers() });
  } catch {
    const current = offersStore.get();
    if (current.status !== 'ready') offersStore.set({ status: 'error', value: [] });
  }
}

async function loadVisits() {
  visitsStore.set({ status: 'loading', value: visitsStore.get().value });
  try {
    visitsStore.set({ status: 'ready', value: await fetchConversationVisits() });
  } catch {
    visitsStore.set({ status: 'error', value: [] });
  }
}

/** Agences qui publient, pour les contacts (une fois par page, comme le carnet de l'app). */
export function loadProfessionals() {
  if (professionalsStore.get().status !== 'idle') return;
  professionalsStore.set({ status: 'loading', value: [] });
  void fetchProfessionalContacts().then((value) => professionalsStore.set({ status: 'ready', value }));
}

export function setBlocked(userId: string, blocked: boolean) {
  const next = new Set(blockedStore.get());
  if (blocked) next.add(userId.toLowerCase());
  else next.delete(userId.toLowerCase());
  blockedStore.set(next);
}

/** Après une action sur une offre : offres et conversations relues (refreshRemote puis refreshFromServer). */
export async function refreshAfterOffer() {
  await loadOffers();
  await liveReload();
}

/** Changement reçu en temps réel : la conversation ouverte et les offres sont relues, après les conversations. */
function onLiveChange() {
  reloadThread();
  void loadOffers();
}

/**
 * Branche la page Messages : pastilles et temps réel partagés (messages, conversation_participants), plus un canal
 * pour message_reactions et offers ; lectures de départ des offres, de l'agenda et des comptes bloqués.
 */
export function useMessaging(userId: string | null) {
  useEffect(() => {
    if (!userId) return undefined;
    const stopBadges = startLiveBadges();
    const stopListening = onMessagingChange(onLiveChange);
    const channel = follow(['message_reactions', 'offers'], () => void liveReload());
    void loadOffers();
    void loadVisits();
    void fetchBlockedIds().then((ids) => blockedStore.set(ids));
    return () => {
      stopListening();
      stopBadges();
      void supabase.removeChannel(channel);
    };
  }, [userId]);
  return {
    inbox: useStore(inboxStore),
    thread: useStore(threadStore),
    offers: useStore(offersStore),
    visits: useStore(visitsStore),
    blocked: useStore(blockedStore),
  };
}
