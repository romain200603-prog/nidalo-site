import type { Message } from './api';
import { contentPreview, type MessageContent } from './content';
import { sameId, type Conversation } from './inbox';

// Réponses, réactions et transferts, comme l'app (ImmoDomain/Messaging/MessageInteractions.swift ; demande du 17/11) :
// un emoji par personne, ajouté, remplacé ou retiré ; la réponse cite son original ; un transfert part vers 5
// conversations au plus. Le geste de l'app (double toucher) devient un double clic ou un double toucher sur le site.

export type Reaction = { userId: string; emoji: string; createdAt: Date };

/** Barre du menu d'un message (MessageReactions.quick). */
export const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'] as const;

/** « Plus d'emojis » (MessageReactions.more) : par section, dans l'ordre de l'app. */
export const MORE_REACTIONS: { title: string; emojis: string[] }[] = [
  { title: 'Immobilier', emojis: ['🏠', '🔑', '📅', '✅', '📄', '💶'] },
  {
    title: 'Visages',
    emojis: ['😀', '😃', '😄', '😁', '😅', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '🤩', '🤔', '🤨',
      '😐', '😶', '🙄', '😏', '😌', '😴', '😎', '🤓', '😕', '🙁', '😮', '😲', '😳', '🥺', '😢', '😭',
      '😤', '😡', '🤯', '😱', '🥳', '🤗'],
  },
  { title: 'Gestes', emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤝', '👏', '🙌', '👋', '🙏', '💪', '👀'] },
  { title: 'Cœurs', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '🖤', '💔', '❣️', '💕', '💯'] },
];
/** Double clic (double toucher) : le cœur rouge, qui s'écrit désormais. */
export const HEART = '❤️';

/** « ♥ » d'avant (écrit par le site jusqu'ici) → ❤️. */
export function normalizedEmoji(emoji: string): string {
  return emoji === '♥' || emoji === '♥️' ? HEART : emoji;
}

/** Mon emoji actuel. */
export function myReaction(reactions: Reaction[], me: string | null): string | null {
  return reactions.find((reaction) => sameId(reaction.userId, me))?.emoji ?? null;
}

/**
 * Toucher un emoji : le même retire ma réaction, un autre la remplace, sinon il s'ajoute. Rend la nouvelle liste et
 * l'emoji à écrire (`null` : retrait).
 */
export function toggledReactions(reactions: Reaction[], emoji: string, me: string, now = new Date()): { reactions: Reaction[]; written: string | null } {
  const chosen = normalizedEmoji(emoji);
  const current = myReaction(reactions, me);
  const others = reactions.filter((reaction) => !sameId(reaction.userId, me));
  if (current !== null && normalizedEmoji(current) === chosen) return { reactions: others, written: null };
  return { reactions: [...others, { userId: me, emoji: chosen, createdAt: now }], written: chosen };
}

/** Pastille : emojis différents (3 au plus, les plus fréquents d'abord, puis les plus récents) et nombre total. */
export function reactionSummary(reactions: Reaction[]): { emojis: string[]; count: number } {
  const counts = new Map<string, { count: number; latest: number }>();
  for (const reaction of reactions) {
    const emoji = normalizedEmoji(reaction.emoji);
    const previous = counts.get(emoji);
    counts.set(emoji, { count: (previous?.count ?? 0) + 1, latest: Math.max(previous?.latest ?? -Infinity, reaction.createdAt.getTime()) });
  }
  const ordered = [...counts.entries()].sort(([, a], [, b]) => (a.count !== b.count ? b.count - a.count : b.latest - a.latest));
  return { emojis: ordered.slice(0, 3).map(([emoji]) => emoji), count: reactions.length };
}

// MARK: - Réponse

export const DELETED_QUOTE = 'Message supprimé';

/**
 * « Vous avez répondu à Sophie », « Sophie vous a répondu », « Marc a répondu à Sophie », « Vous vous êtes répondu ».
 * « s'est répondu » seulement pour la même personne (`isSamePerson` : mêmes identifiants) ; deux personnes du même
 * prénom : « Marie a répondu à Marie » (n° 241).
 */
export function replyHeader({ replierIsMe, replierName, quotedIsMine, quotedName, isSamePerson = false }: {
  replierIsMe: boolean; replierName: string; quotedIsMine: boolean; quotedName: string; isSamePerson?: boolean;
}): string {
  if (replierIsMe) return quotedIsMine ? 'Vous vous êtes répondu' : `Vous avez répondu à ${quotedName}`;
  if (quotedIsMine) return `${replierName} vous a répondu`;
  return isSamePerson ? `${replierName} s'est répondu` : `${replierName} a répondu à ${quotedName}`;
}

/** Au-dessus du champ : « Réponse à Sophie Martin », « Réponse à vous-même ». */
export function replyComposerTitle(quotedIsMine: boolean, quotedName: string): string {
  return quotedIsMine ? 'Réponse à vous-même' : `Réponse à ${quotedName}`;
}

/** Extrait du message cité (« 📷 Photo » pour une photo) ; « Message supprimé » s'il n'existe plus ou a expiré. */
export function quoteText(original: Message | null, now = new Date()): string {
  if (!original || (original.expiresAt !== null && original.expiresAt.getTime() <= now.getTime())) return DELETED_QUOTE;
  return contentPreview(original.content);
}

/** On peut répondre à tout, sauf aux lignes système. */
export function canReply(content: MessageContent): boolean {
  return content.kind !== 'system' && content.kind !== 'unknown';
}

/** Prénom d'un nom (« Sophie Martin » → « Sophie »), pour l'en-tête d'une réponse. */
export function firstName(name: string): string {
  return name.split(' ').find((part) => part !== '') ?? name;
}

// MARK: - Transfert

export const MAX_FORWARD_TARGETS = 5;

/** Texte, photos, documents et vocaux se transfèrent ; ni les offres, ni les cartes de visite, ni les lignes système. */
export function canForward(content: MessageContent): boolean {
  return content.kind === 'text' || content.kind === 'image' || content.kind === 'photos' || content.kind === 'file' || content.kind === 'attachments';
}

/** Conversations proposées : sans celle d'origine, les groupes quittés et les comptes bloqués ; les plus récentes d'abord. */
export function forwardTargets(conversations: Conversation[], origin: string, blocked: Set<string>): Conversation[] {
  const activity = (conversation: Conversation) => (conversation.lastMessageAt ?? conversation.createdAt).getTime();
  return conversations
    .filter((conversation) => !sameId(conversation.id, origin) && !conversation.hasLeft)
    .filter((conversation) => conversation.isGroup || !conversation.otherUserId || !blocked.has(conversation.otherUserId.toLowerCase()))
    .sort((a, b) => activity(b) - activity(a));
}

/** Choix d'une conversation : 5 au plus. */
export function toggledTarget(id: string, selection: string[]): string[] {
  if (selection.some((item) => sameId(item, id))) return selection.filter((item) => !sameId(item, id));
  return selection.length < MAX_FORWARD_TARGETS ? [...selection, id] : selection;
}

/** « Envoyer à 2 conversations ». */
export function forwardSendTitle(count: number): string {
  return count <= 1 ? 'Envoyer à 1 conversation' : `Envoyer à ${count} conversations`;
}

// MARK: - Refus du serveur (trigger messages_reply_forward_check)

export const REPLY_UNAVAILABLE = 'Le message auquel vous répondez n\'est plus disponible.';
export const FORWARD_INVALID = 'Ce message ne peut pas être transféré.';

/** Réponse ou transfert refusé par le serveur, reconnu à son indice ; `null` pour une autre erreur. */
export function interactionRefusal(error: unknown): string | null {
  const { hint } = (error ?? {}) as { hint?: string | null };
  if (hint === 'message_reply_unavailable') return REPLY_UNAVAILABLE;
  if (hint === 'message_forward_invalid') return FORWARD_INVALID;
  return null;
}
