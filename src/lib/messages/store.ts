import { useEffect } from 'react';
import { bannedWordMessage } from '../account/errors';
import { createStore, currentUserId, useStore } from '../account/session';
import {
  conversationRowsStore, follow, liveReload, onMessagingChange, patchConversationRow, startLiveBadges, type ConversationRows,
} from '../badges';
import { supabase } from '../supabase';
import { fetchOffers, type OfferRow } from '../listing/offers';
import {
  blockUser, fetchBlockedIds, fetchCommunities, fetchConversationVisits, fetchMessage, fetchMessages, fetchParticipants,
  fetchProfessionalContacts, fetchProfiles, insertMessage, markConversationRead, MESSAGE_PAGE, messageInsert, savePreferences, setReaction,
  unblockUser, type ConversationVisit, type Message, type Preferences,
} from './api';
import { attachmentsContent, attachmentsPreview, contentPreview, decodeContent, textContent, type Attachment } from './content';
import { copyAttachments } from './files';
import { canForward, HEART, interactionRefusal, MAX_FORWARD_TARGETS, myReaction, toggledReactions } from './interactions';
import {
  conversationFrom, sameId, upper, type CommunityRow, type Conversation, type ParticipantRow, type ProfessionalContactRow,
  type ProfileRow, type ServerInboxRow,
} from './inbox';
import { RetryClientIds } from './retry';
import { fetchConversationVisitRequests, type ConversationVisitRequest } from './visitRequests';

// État de la page Messages, comme MessagingStore de l'app (Data/MessagingStore.swift) : la boîte de réception vient
// des lignes de my_conversations déjà lues pour la pastille (lib/badges.ts), complétées par les membres des groupes,
// les profils publics et les communautés ; la conversation ouverte lit ses 200 derniers messages, puis 200 de plus à
// chaque fois que l'on remonte en haut (n° 19). Le temps réel relit tout (refreshFromServer), puis les offres ; la
// conversation ouverte est marquée lue dès qu'elle a des non-lus.

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
  /** Tout l'historique est lu (la dernière page lue était incomplète) : rien de plus ancien à chercher (n° 19). */
  complete: boolean;
};

export const threadStore = createStore<ThreadState>({ conversationId: null, status: 'idle', messages: [], complete: false });

let threadToken = 0;
let loadingOlder = false;

/**
 * Les 200 derniers messages (loadMessages). Une relecture garde sous eux les pages plus anciennes déjà lues, sans
 * doublon (n° 19) ; une page incomplète veut dire que tout l'historique est là.
 */
async function loadThread(conversationId: string, quiet: boolean) {
  const token = ++threadToken;
  if (!quiet) threadStore.set({ conversationId, status: 'loading', messages: [], complete: false });
  try {
    const latest = await fetchMessages(conversationId, currentUserId());
    if (token !== threadToken) return;
    const current = threadStore.get();
    let messages = latest;
    let complete = latest.length < MESSAGE_PAGE;
    if (!complete && sameId(current.conversationId, conversationId) && current.status === 'ready') {
      const ids = new Set(latest.map((message) => message.id.toLowerCase()));
      const start = latest[0]?.createdAt.getTime() ?? -Infinity;
      const older = current.messages.filter((message) => message.createdAt.getTime() < start && !ids.has(message.id.toLowerCase()));
      messages = [...older, ...latest];
      complete = older.length > 0 && current.complete;
    }
    threadStore.set({ conversationId, status: 'ready', messages, complete });
  } catch {
    if (token !== threadToken) return;
    const current = threadStore.get();
    // Une relecture qui échoue garde les messages déjà affichés (refreshFromServer, `try?`).
    if (!quiet || current.status !== 'ready') threadStore.set({ conversationId, status: 'error', messages: [], complete: false });
  }
}

/**
 * Haut de la conversation atteint (loadOlderMessages, n° 19) : les 200 messages d'avant le plus ancien affiché,
 * ajoutés au-dessus sans doublon. Rien quand tout est lu ou qu'une page est déjà demandée ; un échec est ignoré (on
 * réessaiera en remontant). Rend `true` si des messages ont été ajoutés.
 */
export async function loadOlderMessages(conversationId: string): Promise<boolean> {
  const current = threadStore.get();
  const oldest = current.messages[0];
  if (!oldest || loadingOlder || current.complete || current.status !== 'ready' || !sameId(current.conversationId, conversationId)) return false;
  loadingOlder = true;
  try {
    const page = await fetchMessages(conversationId, currentUserId(), oldest.createdAt);
    const latest = threadStore.get();
    // Conversation fermée, rouverte ou changée entre-temps : la page ne va plus avec ce qui est affiché.
    if (latest.status !== 'ready' || !sameId(latest.conversationId, conversationId) || !sameId(latest.messages[0]?.id, oldest.id)) return false;
    const known = new Set(latest.messages.map((message) => message.id.toLowerCase()));
    const added = page.filter((message) => !known.has(message.id.toLowerCase()));
    const complete = latest.complete || page.length < MESSAGE_PAGE;
    if (!added.length) {
      if (complete !== latest.complete) threadStore.set({ ...latest, complete });
      return false;
    }
    threadStore.set({ ...latest, messages: [...added, ...latest.messages], complete });
    return true;
  } catch {
    return false;
  } finally {
    loadingOlder = false;
  }
}

/** Ouvre une conversation (ou aucune) : lit ses messages et la marque lue si elle a des non-lus. */
export function openConversation(conversationId: string | null) {
  const current = threadStore.get();
  if (sameId(current.conversationId, conversationId) && current.status !== 'error') return;
  if (!conversationId) {
    threadToken += 1;
    threadStore.set({ conversationId: null, status: 'idle', messages: [], complete: false });
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

/** Identifiants des envois ratés, repris au renvoi du même contenu dans la même conversation (n° 99). */
const retryClientIds = new RetryClientIds();

/**
 * Envoie un contenu, comme l'app : insert dans messages (avec le message cité d'une réponse, ou la marque d'un
 * transfert), puis le message rejoint la conversation ouverte, qui remonte en tête de liste et sort des archives (sur
 * place ; le serveur garde son réglage). Un renvoi après un échec garde l'identifiant de l'envoi raté : si le message
 * était arrivé malgré tout, le serveur le reconnaît et il n'est pas enregistré deux fois (n° 99). Lève l'erreur du
 * serveur.
 */
async function sendContent(conversationId: string, content: Record<string, unknown>,
  options: { replyToId?: string | null; forwarded?: boolean } = {}): Promise<Message> {
  const me = currentUserId();
  if (!me) throw new Error('Votre session a expiré. Reconnectez-vous.');
  const clientId = retryClientIds.id(conversationId, content);
  const preview = contentPreview(decodeContent(content));
  let message: Message;
  try {
    message = await insertMessage(messageInsert(conversationId, clientId, content, preview, options), me);
  } catch (error) {
    retryClientIds.failed(clientId, conversationId, content);
    throw error;
  }
  retryClientIds.succeeded(conversationId, content);
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

/**
 * Résultat d'un envoi : `refusal` est le message du serveur à montrer tel quel (mot interdit, message cité qui n'est
 * plus disponible, contenu qui ne se transfère pas) ; `null` pour un autre échec (« n'a pas pu être envoyé »).
 */
export type SendOutcome = { sent: true } | { sent: false; refusal: string | null };

const refusalOf = (error: unknown): string | null => interactionRefusal(error) ?? bannedWordMessage(error);
const notSent = (error: unknown): SendOutcome => ({ sent: false, refusal: refusalOf(error) });

/** Texte envoyé (sans espaces autour), en réponse à `replyToId` s'il y en a un ; pas envoyé s'il est vide ou n'a pas pu partir. */
export async function sendText(conversationId: string, text: string, replyToId: string | null = null): Promise<SendOutcome> {
  const trimmed = text.trim();
  if (!trimmed) return { sent: false, refusal: null };
  try {
    await sendContent(conversationId, textContent(trimmed), { replyToId });
    return { sent: true };
  } catch (error) {
    return notSent(error);
  }
}

/** Pièces jointes déjà envoyées dans le dossier, et leur message d'accompagnement facultatif. */
export async function sendAttachments(conversationId: string, items: Attachment[], caption: string, replyToId: string | null = null): Promise<SendOutcome> {
  if (!items.length) return { sent: false, refusal: null };
  const text = caption.trim();
  try {
    await sendContent(conversationId, attachmentsContent(items, text ? text : null), { replyToId });
    return { sent: true };
  } catch (error) {
    return notSent(error);
  }
}

/** Résultat d'un transfert : conversations où il est parti, celles où il n'est pas parti, refus du serveur à montrer. */
export type ForwardOutcome = { sent: number; failed: string[]; refusal: string | null };

/**
 * Transfère un message vers 5 conversations au plus (MessagingStore.forward, une conversation après l'autre comme
 * l'écran de l'app, n° 211) : le même contenu, marqué « transféré », avec ses fichiers recopiés dans chaque
 * conversation. Rend le nombre de conversations où il est parti, celles où il n'est pas parti, et le refus du serveur
 * de la dernière qui a échoué (sendRefusal).
 */
export async function forwardMessage(message: Message, targets: string[]): Promise<ForwardOutcome> {
  const chosen = targets.slice(0, MAX_FORWARD_TARGETS);
  if (!canForward(message.content)) return { sent: 0, failed: chosen, refusal: null };
  let sent = 0;
  const failed: string[] = [];
  let refusal: string | null = null;
  for (const target of chosen) {
    try {
      const content = message.content.kind === 'attachments'
        ? attachmentsContent(await copyAttachments(message.content.items, target), message.content.caption)
        : message.raw as Record<string, unknown>;
      await sendContent(target, content, { forwarded: true });
      sent += 1;
      refusal = null;
    } catch (error) {
      failed.push(target);
      refusal = refusalOf(error);
    }
  }
  return { sent, failed, refusal };
}

/** Aperçu écrit avec un message de pièces jointes (colonne preview), pour les tests. */
export const attachmentsPreviewText = attachmentsPreview;

/**
 * Réaction (MessagingStore.react) : le même emoji retire la mienne, un autre la remplace, sinon il s'ajoute ; affichée
 * tout de suite, puis enregistrée (upsert ou suppression dans message_reactions). Refusée : la pastille revient à ce
 * qu'elle était.
 */
export async function react(messageId: string, emoji: string) {
  const me = currentUserId();
  const message = threadStore.get().messages.find((item) => sameId(item.id, messageId));
  if (!me || !message) return;
  const before = { reactions: message.reactions, reaction: message.reaction };
  const change = toggledReactions(message.reactions, emoji, me);
  const reactionOf = (reactions: Message['reactions']) => myReaction(reactions, me)
    ?? [...reactions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.emoji ?? null;
  updateMessage(messageId, (item) => ({ ...item, reactions: change.reactions, reaction: reactionOf(change.reactions) }));
  try {
    await setReaction(messageId, change.written, me);
  } catch {
    updateMessage(messageId, (item) => ({ ...item, ...before }));
  }
}

/** Double clic ou double toucher sur une bulle : pose ou retire ❤️ (toggleHeart). */
export function toggleHeart(messageId: string) {
  return react(messageId, HEART);
}

/** Retire ma réaction (fenêtre « Réactions »). */
export async function removeMyReaction(messageId: string) {
  const me = currentUserId();
  const message = threadStore.get().messages.find((item) => sameId(item.id, messageId));
  const mine = message ? myReaction(message.reactions, me) : null;
  if (mine) await react(messageId, mine);
}

// MARK: - Messages cités (MessagingStore.quotedOriginal)

/** Original d'une citation : en cours de lecture, trouvé, ou supprimé (« Message supprimé »). */
export type QuotedOriginal = { status: 'loading' } | { status: 'found'; message: Message } | { status: 'deleted' };

/** Originaux lus hors des messages chargés, par identifiant en minuscules. */
export const quotedStore = createStore<Map<string, QuotedOriginal>>(new Map());

/** Message cité : d'abord dans les messages chargés, sinon déjà lu ; en cours de lecture tant qu'il n'a pas été cherché. */
export function quotedOriginal(id: string, messages: Message[], now = new Date()): QuotedOriginal {
  const loaded = messages.find((message) => sameId(message.id, id));
  const found = loaded ?? null;
  if (found) return { status: 'found', message: found };
  const known = quotedStore.get().get(id.toLowerCase());
  if (known?.status === 'found' && known.message.expiresAt !== null && known.message.expiresAt.getTime() <= now.getTime()) return { status: 'deleted' };
  return known ?? { status: 'loading' };
}

/** Lit l'original d'une citation qui n'est pas dans les messages chargés ; rien en retour : « Message supprimé ». */
export async function loadQuotedOriginal(id: string, messages: Message[]) {
  const key = id.toLowerCase();
  if (quotedOriginal(id, messages).status !== 'loading' || quotedStore.get().has(key)) return;
  const pending = new Map(quotedStore.get());
  pending.set(key, { status: 'loading' });
  quotedStore.set(pending);
  try {
    const message = await fetchMessage(id, currentUserId());
    const next = new Map(quotedStore.get());
    next.set(key, message ? { status: 'found', message } : { status: 'deleted' });
    quotedStore.set(next);
  } catch {
    // Lecture impossible (hors ligne) : on réessaiera à la prochaine ouverture.
    const next = new Map(quotedStore.get());
    next.delete(key);
    quotedStore.set(next);
  }
}

// MARK: - Réglages (conversation_preferences), blocage

/**
 * Archive ou désarchive (setArchived, n° 210) : sur place, puis enregistré ; refusé ou sans réponse, l'ancienne valeur
 * revient et `false` est rendu (l'écran dit « La modification n'a pas pu être enregistrée. »).
 */
export async function setArchived(conversationId: string, isArchived: boolean): Promise<boolean> {
  const before = conversationRowsStore.get().rows?.find((row) => sameId(String(row.conversation_id), conversationId));
  const previous = before ? (before.is_archived ?? false) : !isArchived;
  patchConversationRow(conversationId, { is_archived: isArchived });
  try {
    await savePreferences(conversationId, (current) => ({ ...current, isArchived }));
    return true;
  } catch {
    patchConversationRow(conversationId, { is_archived: previous });
    return false;
  }
}

/**
 * Change un réglage puis relit la conversation (updateSettings) : favori ou sourdine (mutedUntil, aussi pour la
 * sourdine rapide). Rien ne change avant la réponse du serveur ; lève l'erreur, que l'écran montre (n° 210).
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
/** Demandes de visite du compte, montrées en carte dans le fil et en aperçu dans la liste (page du 14 novembre 2026). */
export const visitRequestsStore = createStore<Loadable<ConversationVisitRequest[]>>({ status: 'idle', value: [] });

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

/** Demandes de visite (my_visit_requests), relues après chaque réponse et chaque changement reçu. */
export async function loadVisitRequests(): Promise<void> {
  if (visitRequestsStore.get().status === 'idle') visitRequestsStore.set({ status: 'loading', value: [] });
  try {
    visitRequestsStore.set({ status: 'ready', value: await fetchConversationVisitRequests() });
  } catch {
    const current = visitRequestsStore.get();
    if (current.status !== 'ready') visitRequestsStore.set({ status: 'error', value: [] });
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
  void loadVisitRequests();
}

/** Après une réponse à une demande de visite : demandes et agenda relus. */
export async function refreshAfterVisit() {
  await Promise.all([loadVisitRequests(), loadVisits()]);
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
    const channel = follow(['message_reactions', 'offers', 'visit_requests'], () => void liveReload());
    void loadOffers();
    void loadVisits();
    void loadVisitRequests();
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
    visitRequests: useStore(visitRequestsStore),
    blocked: useStore(blockedStore),
  };
}
