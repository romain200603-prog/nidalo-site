import { clock, daysBetween, daySeparatorLabel, DISTANT_FUTURE } from './format';
import type { Message } from './api';
import { contentPreview, type Attachment, type MessageContent } from './content';
import { isDeletedAccount, sameId, type Conversation, type ListingSnapshot } from './inbox';
import type { ConversationVisitRequest } from './visitRequests';

// Conversation ouverte, comme l'app : messages visibles (ConversationMessages.visible), jours et séries de bulles
// (ConversationView.messagesList), bandeau du bien (bannerLocation), « Détails »
// (ImmoDomain/Messaging/ConversationDetails.swift) et médias partagés (SharedMedia).

export const isSystem = (content: MessageContent) => content.kind === 'system';

/** Ce que l'utilisateur voit : sans les messages expirés ni ceux d'avant son effacement ; les lignes système restent. */
export function visibleMessages(messages: Message[], clearedAt: Date | null, now: Date = new Date()): Message[] {
  return messages.filter((message) => {
    if (isSystem(message.content)) return true;
    if (message.expiresAt && message.expiresAt.getTime() <= now.getTime()) return false;
    return !clearedAt || message.createdAt.getTime() > clearedAt.getTime();
  });
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

/** « Lyon 2e · Rue Victor Hugo » quand l'adresse de la visite est connue, sinon la ville (bannerLocation). */
export function bannerLocation(listing: Pick<ListingSnapshot, 'city'>, address: string | null): string {
  const first = address?.split(',')[0];
  if (first === undefined || address === null) return listing.city;
  const street = first.replace(/^[\d ]+/, '');
  if (!street) return listing.city;
  return `${listing.city} · ${street.charAt(0).toLocaleUpperCase('fr-FR')}${street.slice(1)}`;
}

/** « Vous », le nom du membre d'un groupe (« Un membre » sinon), ou l'interlocuteur (ConversationDetails.senderName). */
export function senderName(senderId: string | null, conversation: Conversation | null, me: string | null): string {
  if (sameId(senderId, me)) return 'Vous';
  if (!conversation) return 'Un membre';
  if (conversation.isGroup) return conversation.members.find((member) => sameId(member.userId, senderId))?.name ?? 'Un membre';
  return conversation.counterpart.name;
}

/** Membre d'un groupe qui a écrit ce message (pour son nom et son avatar au-dessus des bulles reçues). */
export function groupSender(conversation: Conversation, senderId: string | null) {
  return conversation.isGroup ? conversation.members.find((member) => sameId(member.userId, senderId)) ?? null : null;
}

/** Premier message d'une conversation à deux sans prénom renseigné : l'app demande « Votre prénom ». */
export function needsFirstName({ conversation, messages, firstName }: { conversation: Conversation; messages: Message[]; firstName: string }): boolean {
  return !conversation.isGroup && messages.length === 0 && !firstName.trim();
}

/** L'en-tête ouvre « Détails » : conversation à deux, avec un compte qui existe (canOpenContactProfile, n° 113). */
export function canOpenDetails(conversation: Conversation): boolean {
  return !conversation.isGroup && !isDeletedAccount(conversation) && !!conversation.otherUserId;
}

// MARK: - Médias et fichiers (SharedMedia)

export type SharedItem = {
  id: string;
  kind: 'photo' | 'video' | 'document' | 'link';
  senderId: string | null;
  date: Date;
  attachment: Attachment | null;
  url: string | null;
  messageId: string;
};

const LINK = /\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)»]/gi;

/** Photos et vidéos, documents et liens écrits, du plus récent au plus ancien. */
export function sharedItems(messages: Message[]): { media: SharedItem[]; documents: SharedItem[]; links: SharedItem[] } {
  const media: SharedItem[] = [];
  const documents: SharedItem[] = [];
  const links: SharedItem[] = [];
  const sorted = [...messages].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const message of sorted) {
    const base = { senderId: message.senderId, date: message.createdAt, messageId: message.id };
    if (message.content.kind === 'attachments') {
      for (const item of message.content.items) {
        const id = `${message.id}-${item.id}`;
        if ((item.kind === 'photo' || item.kind === 'video') && item.storagePath) media.push({ ...base, id, kind: item.kind, attachment: item, url: null });
        if (item.kind === 'document') documents.push({ ...base, id, kind: 'document', attachment: item, url: null });
      }
    } else if (message.content.kind === 'text') {
      [...message.content.text.matchAll(LINK)].forEach((match, index) => {
        links.push({ ...base, id: `${message.id}-${index}`, kind: 'link', attachment: null, url: match[0] });
      });
    }
  }
  return { media, documents, links };
}

/** Titre d'un lien : son domaine (url.host). */
export function linkTitle(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** Photos et vidéos de la visionneuse, dans l'ordre de la conversation (MediaViewerEntry.entries). */
export function mediaEntries(messages: Message[]): { attachment: Attachment; senderId: string | null; date: Date; messageId: string }[] {
  return messages.flatMap((message) => (message.content.kind === 'attachments'
    ? message.content.items.filter((item) => (item.kind === 'photo' || item.kind === 'video') && item.storagePath)
      .map((attachment) => ({ attachment, senderId: message.senderId, date: message.createdAt, messageId: message.id }))
    : []));
}

/** Vignettes de « Médias et fichiers » : 3 au plus, « +N » sur la troisième (mediaPreview). */
export function mediaPreview(count: number): { shown: number; more: number } {
  return { shown: Math.min(Math.max(count, 0), 3), more: Math.max(count - 3, 0) };
}

export const EMPTY_MEDIA_TEXT = 'Les photos et documents partagés dans cette conversation apparaîtront ici.';

// MARK: - Boutons de « Détails »

export type ActionState = { enabled: true } | { enabled: false; message: string };
export type ListingAvailability = 'none' | 'loading' | 'unavailable' | 'own' | 'available' | 'availableWithVideo';

export function callState(name: string, phone: string | null): ActionState {
  return phone?.trim() ? { enabled: true } : { enabled: false, message: `${name} n'a pas partagé son numéro. Vous pouvez lui écrire ici.` };
}

export function visitState(listing: ListingAvailability): ActionState {
  switch (listing) {
    case 'none': return { enabled: false, message: 'Cette conversation ne concerne aucune annonce : il n\'y a pas de visite à demander.' };
    case 'loading': return { enabled: false, message: 'L\'annonce est en cours de chargement. Réessayez dans un instant.' };
    case 'unavailable': return { enabled: false, message: 'Cette annonce n\'est plus disponible : impossible de demander une visite.' };
    case 'own': return { enabled: false, message: 'C\'est votre annonce : vous ne pouvez pas y demander de visite.' };
    default: return { enabled: true };
  }
}

export function videoState(listing: ListingAvailability): ActionState {
  switch (listing) {
    case 'none': return { enabled: false, message: 'Cette conversation ne concerne aucune annonce : il n\'y a pas de visite en visio à demander.' };
    case 'loading': return { enabled: false, message: 'L\'annonce est en cours de chargement. Réessayez dans un instant.' };
    case 'unavailable': return { enabled: false, message: 'Cette annonce n\'est plus disponible : impossible de demander une visite en visio.' };
    case 'own': return { enabled: false, message: 'C\'est votre annonce : vous ne pouvez pas y demander de visite en visio.' };
    case 'available': return { enabled: false, message: 'Cette annonce n\'accepte pas les visites en visio.' };
    default: return { enabled: true };
  }
}

// MARK: - Sourdine (MuteOption)

export const MUTE_OPTIONS = [
  { value: 'off', label: 'Activées' },
  { value: 'eightHours', label: 'Sourdine 8 heures' },
  { value: 'oneWeek', label: 'Sourdine 1 semaine' },
  { value: 'always', label: 'Sourdine toujours' },
] as const;
export type MuteOption = (typeof MUTE_OPTIONS)[number]['value'];

export function mutedUntil(option: MuteOption, now: Date = new Date()): Date | null {
  switch (option) {
    case 'off': return null;
    case 'eightHours': return new Date(now.getTime() + 8 * 3_600_000);
    case 'oneWeek': return new Date(now.getTime() + 7 * 86_400_000);
    case 'always': return DISTANT_FUTURE;
  }
}

/** Avis après le choix : « Notifications activées » ou le libellé choisi. */
export function muteNotice(option: MuteOption): string {
  return option === 'off' ? 'Notifications activées' : MUTE_OPTIONS.find((item) => item.value === option)?.label ?? '';
}

/** Texte de la bulle d'un contenu sans bulle à lui (texte, lignes de démonstration de l'app). */
export const bubbleText = contentPreview;

/** Jours entre un message et maintenant, pour l'en-tête de la visionneuse. */
export const ageInDays = daysBetween;

// MARK: - Fil de la page Messages du site (demande de Romain du 14 novembre 2026)

/** Un élément du fil : un message, ou une demande de visite (carte), placés dans l'ordre du temps. */
export type SiteThreadItem =
  | { kind: 'message'; key: string; at: Date; senderId: string | null; message: Message }
  | { kind: 'visit'; key: string; at: Date; senderId: string | null; request: ConversationVisitRequest };

export type SiteThreadRow = { item: SiteThreadItem; startsGroup: boolean; endsGroup: boolean };
/** Un jour du fil : « Aujourd'hui · 10:42 » (le jour et l'heure de son premier message), sa date, ses lignes. */
export type SiteThreadDay = { key: string; label: string; date: Date; rows: SiteThreadRow[] };

/** Expéditeur pour les séries : une ligne système est seule dans sa série. */
const seriesKey = (item: SiteThreadItem) =>
  (item.kind === 'message' && isSystem(item.message.content) ? `system:${item.key}` : (item.senderId ?? '').toLowerCase());

/**
 * Jours (« Aujourd'hui · 10:42 », « Hier · 18:03 », « Lundi 28 septembre · 09:12 », comme l'app) et séries : messages
 * et demandes de visite qui se suivent du même expéditeur forment une série (l'avatar à côté du dernier).
 */
export function siteThreadDays(messages: Message[], requests: ConversationVisitRequest[], now: Date = new Date()): SiteThreadDay[] {
  const items: SiteThreadItem[] = [
    ...messages.map((message): SiteThreadItem => ({ kind: 'message', key: message.id, at: message.createdAt, senderId: message.senderId, message })),
    ...requests.map((request): SiteThreadItem => ({
      kind: 'visit', key: `visite-${request.id}`, at: request.createdAt, senderId: request.requester.userId, request,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const days: SiteThreadDay[] = [];
  for (const item of items) {
    const key = dayKey(item.at);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, label: `${daySeparatorLabel(item.at, now)} · ${clock(item.at)}`, date: item.at, rows: [] };
      days.push(day);
    }
    day.rows.push({ item, startsGroup: true, endsGroup: true });
  }
  for (const day of days) {
    day.rows.forEach((row, index) => {
      const previous = day.rows[index - 1];
      const next = day.rows[index + 1];
      row.startsGroup = !previous || seriesKey(previous.item) !== seriesKey(row.item);
      row.endsGroup = !next || seriesKey(next.item) !== seriesKey(row.item);
    });
  }
  return days;
}
