import { isOfflineFailure } from '../loadFailure';
import { supabase } from '../supabase';
import { savePreferences, type Message } from './api';
import { contentPreview } from './content';
import { uploadGroupPhoto } from './files';
import { daysBetween, matchesWords } from './format';
import { sameId, upper, type Contact, type Conversation, type Member } from './inbox';
import { visibleMessages } from './thread';

// Groupes de la messagerie, comme l'app : rôles et droits (GroupConversation.swift), saisie de « Nouveau groupe »
// (GroupDraft), appels du serveur avec exactement les paramètres de l'app (SupabaseMessagingRepository.swift,
// « MARK: - Groupes »), messages éphémères (EphemeralDuration), export de la discussion (ConversationMessages) et
// messages d'échec des formulaires (SubmissionState). Les identifiants partent en majuscules, comme Swift les écrit ;
// une clé facultative vide ne part pas (encodage synthétisé de Swift).

// MARK: - Rôles

export type GroupRole = 'owner' | 'admin' | 'member';

export const ROLE_LABELS: Record<GroupRole, string> = { owner: 'Créateur', admin: 'Administrateur', member: 'Membre' };

/** Rôle lu du serveur ; inconnu : « Membre » (GroupRole(rawValue:) ?? .member). */
export const roleOf = (value: string | null | undefined): GroupRole => (value === 'owner' || value === 'admin' ? value : 'member');

/** Créateur et administrateurs gèrent les membres et les réglages (canManageMembers, canEditSettings). */
export const canManage = (role: GroupRole | null): boolean => role === 'owner' || role === 'admin';

/** Mon rôle parmi les membres, `null` si je n'en fais plus partie. */
export function roleIn(members: Member[], me: string | null): GroupRole | null {
  const member = members.find((item) => sameId(item.userId, me));
  return member ? roleOf(member.role) : null;
}

/**
 * Ce qu'un membre peut faire d'un autre dans un groupe (memberRow de GroupInfoView) : nommer ou retirer un
 * administrateur et transférer la propriété (créateur seulement), retirer un membre (créateur, ou administrateur pour un
 * simple membre). Le créateur ne peut pas être retiré.
 */
export function groupMemberActions(myRole: GroupRole | null, target: Member): { canPromote: boolean; canRemove: boolean } {
  const role = roleOf(target.role);
  return {
    canPromote: myRole === 'owner' && role !== 'owner',
    canRemove: canManage(myRole) && role !== 'owner' && (myRole === 'owner' || role === 'member'),
  };
}

// MARK: - Liste des membres

/**
 * Membres de la liste repliée (collapsedMembers) : les `limit` premiers dans l'ordre, le créateur toujours inclus
 * (s'il est plus bas, il prend la dernière place visible).
 */
export function collapsedMembers(members: Member[], createdBy: string | null, limit = 4): Member[] {
  if (members.length <= limit) return members;
  const first = members.slice(0, limit);
  const creator = members.find((member) => sameId(member.userId, createdBy));
  if (first.some((member) => sameId(member.userId, createdBy)) || !creator) return first;
  return [...first.slice(0, limit - 1), creator];
}

/** « Voir les 4 autres membres », « Voir l'autre membre » ; `null` si tout tient dans la liste repliée. */
export function moreMembersLabel(members: Member[], createdBy: string | null, limit = 4): string | null {
  const hidden = members.length - collapsedMembers(members, createdBy, limit).length;
  if (hidden <= 0) return null;
  return hidden === 1 ? 'Voir l\'autre membre' : `Voir les ${hidden} autres membres`;
}

/** Recherche dans les membres (MessagingDirectory.matches(memberName:)) : saisie vide, tous ; sinon chaque mot. */
export function memberMatches(name: string, query: string): boolean {
  const trimmed = query.trim();
  return !trimmed || matchesWords(trimmed, [name]);
}

/** « 1 membre », « 3 membres ». */
export const countLabel = (count: number, word: string): string => `${count} ${word}${count > 1 ? 's' : ''}`;

// MARK: - Dates

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** « 6 novembre » (sans l'année). */
export const dayMonthLabel = (date: Date): string => dayMonth.format(date);
/** « 6 novembre 2026 ». */
export const dayMonthYearLabel = (date: Date): string => dayMonthYear.format(date);

/** « aujourd'hui », « hier », sinon « le 29 octobre » (avec l'année si ce n'est pas l'année en cours) (creationLabel). */
export function creationLabel(date: Date, now: Date = new Date()): string {
  const days = daysBetween(date, now);
  if (days === 0) return 'aujourd\'hui';
  if (days === 1) return 'hier';
  return `le ${date.getFullYear() === now.getFullYear() ? dayMonthLabel(date) : dayMonthYearLabel(date)}`;
}

/** « vous », le nom du créateur parmi les membres, sinon « un membre ». */
export function creatorName(createdBy: string | null, members: Member[], me: string | null): string {
  if (sameId(createdBy, me)) return 'vous';
  return members.find((member) => sameId(member.userId, createdBy))?.name ?? 'un membre';
}

// MARK: - Nouveau groupe (GroupDraft)

export const GROUP_PURPOSES = [
  { value: 'project', label: 'Projet immobilier' },
  { value: 'privateSale', label: 'Achat entre particuliers' },
  { value: 'rentalSearch', label: 'Recherche de location' },
  { value: 'investment', label: 'Investissement immobilier' },
  { value: 'sale', label: 'Vente d\'un bien' },
  { value: 'other', label: 'Autre' },
] as const;
export type GroupPurpose = (typeof GROUP_PURPOSES)[number]['value'];

/** Libellé d'un type de groupe lu du serveur ; inconnu : aucun (GroupPurpose(rawValue:)). */
export function purposeLabel(value: string | null | undefined): string | null {
  return GROUP_PURPOSES.find((item) => item.value === value)?.label ?? null;
}

export const GROUP_NAME_LIMIT = 50;
export const GROUP_DETAILS_LIMIT = 300;
/** Au moins deux autres personnes : à deux, c'est une conversation individuelle. */
export const MIN_GROUP_PARTICIPANTS = 2;
export const MAX_GROUP_PARTICIPANTS = 50;

/** Saisie de « Nouveau groupe » : l'identifiant est fixé à l'ouverture, une création rejouée ne fait pas de doublon. */
export type GroupDraft = {
  id: string;
  name: string;
  details: string;
  purpose: GroupPurpose | null;
  /** Photo choisie, déjà préparée en JPEG (512 px au plus, sans métadonnées). */
  photo: Blob | null;
  /** Personnes choisies (le créateur n'en fait pas partie). */
  participants: Member[];
};

export function newGroupDraft(): GroupDraft {
  return { id: crypto.randomUUID().toUpperCase(), name: '', details: '', purpose: null, photo: null, participants: [] };
}

export type GroupIssue = 'missingName' | 'nameTooLong' | 'notEnoughParticipants' | 'tooManyParticipants';

/** Problèmes de la saisie, dans l'ordre de l'app (issues). */
export function groupIssues(draft: Pick<GroupDraft, 'name' | 'participants'>): GroupIssue[] {
  const name = draft.name.trim();
  const issues: GroupIssue[] = [];
  if (!name) issues.push('missingName');
  if ([...name].length > GROUP_NAME_LIMIT) issues.push('nameTooLong');
  if (draft.participants.length < MIN_GROUP_PARTICIPANTS) issues.push('notEnoughParticipants');
  if (draft.participants.length > MAX_GROUP_PARTICIPANTS) issues.push('tooManyParticipants');
  return issues;
}

/** Problèmes d'une étape : 0 les participants, 1 le nom (issues(step:)). */
export function groupStepIssues(draft: Pick<GroupDraft, 'name' | 'participants'>, step: 0 | 1): GroupIssue[] {
  const issues = groupIssues(draft);
  return step === 0
    ? issues.filter((issue) => issue === 'notEnoughParticipants' || issue === 'tooManyParticipants')
    : issues.filter((issue) => issue === 'missingName' || issue === 'nameTooLong');
}

export const hasEnoughParticipants = (count: number): boolean => count >= MIN_GROUP_PARTICIPANTS && count <= MAX_GROUP_PARTICIPANTS;

// MARK: - Paramètres des fonctions du serveur

/** create_group : nom sans espaces autour, description et type seulement s'ils sont renseignés. */
export function createGroupParams(draft: Pick<GroupDraft, 'id' | 'name' | 'details' | 'purpose' | 'participants'>): Record<string, unknown> {
  const details = draft.details.trim();
  const params: Record<string, unknown> = {
    p_id: upper(draft.id), p_name: draft.name.trim(), p_member_ids: draft.participants.map((member) => upper(member.userId)),
  };
  if (details) params.p_details = details;
  if (draft.purpose) params.p_purpose = draft.purpose;
  return params;
}

/** update_group_info : description et photo seulement si elles sont données (`null` : la clé ne part pas). */
export function updateGroupInfoParams(conversationId: string, name: string, details: string | null, imagePath: string | null): Record<string, unknown> {
  const params: Record<string, unknown> = { p_conversation_id: upper(conversationId), p_name: name };
  if (details !== null) params.p_details = details;
  if (imagePath !== null) params.p_image_path = imagePath;
  return params;
}

async function call(name: string, params: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc(name, params);
  if (error) throw error;
}

/**
 * Crée le groupe (create_group). Une photo choisie part ensuite dans « <groupe>/group/ » puis update_group_info ; si
 * elle n'a pas pu être enregistrée, le groupe existe quand même (la photo s'ajoute ensuite dans Infos, `try?`).
 */
export async function createGroup(draft: GroupDraft): Promise<void> {
  await call('create_group', createGroupParams(draft));
  if (!draft.photo) return;
  const details = draft.details.trim();
  try {
    const path = await uploadGroupPhoto(draft.id, draft.photo);
    await call('update_group_info', updateGroupInfoParams(draft.id, draft.name.trim(), details || null, path));
  } catch {
    // Sans photo enregistrée, le groupe existe quand même.
  }
}

export function addGroupMembers(conversationId: string, members: Member[]): Promise<void> {
  return call('add_group_members', { p_conversation_id: upper(conversationId), p_member_ids: members.map((member) => upper(member.userId)) });
}

export function removeGroupMember(conversationId: string, memberId: string): Promise<void> {
  return call('remove_group_member', { p_conversation_id: upper(conversationId), p_member_id: upper(memberId) });
}

export function setGroupRole(conversationId: string, memberId: string, role: 'admin' | 'member'): Promise<void> {
  return call('set_group_role', { p_conversation_id: upper(conversationId), p_member_id: upper(memberId), p_role: role });
}

export function transferGroupOwnership(conversationId: string, memberId: string): Promise<void> {
  return call('transfer_group_ownership', { p_conversation_id: upper(conversationId), p_member_id: upper(memberId) });
}

export function leaveConversation(conversationId: string): Promise<void> {
  return call('leave_conversation', { p_conversation_id: upper(conversationId) });
}

/** Photo de la feuille « Modifier » : celle déjà enregistrée (son chemin), une nouvelle (préparée), ou aucune. */
export type PhotoChoice = { kind: 'saved'; path: string } | { kind: 'new'; blob: Blob; url: string } | null;

/** Chemin à envoyer (groupImagePath) : le même pour une photo gardée, celui de la nouvelle une fois envoyée, sinon `null`. */
export async function photoPath(choice: PhotoChoice, conversationId: string): Promise<string | null> {
  if (!choice) return null;
  if (choice.kind === 'saved') return choice.path;
  return uploadGroupPhoto(conversationId, choice.blob);
}

/**
 * « Modifier le groupe » (updateGroupInfo) : le nom et la description tels que saisis ; la photo gardée, nouvelle
 * (envoyée d'abord) ou retirée (la clé ne part pas).
 */
export async function updateGroupInfo(conversationId: string, name: string, details: string, photo: PhotoChoice): Promise<void> {
  const path = await photoPath(photo, conversationId);
  await call('update_group_info', updateGroupInfoParams(conversationId, name, details, path));
}

/** « Supprimer le groupe » une fois quitté (deleteConversation) : réglages relus, puis enregistrés avec hidden_at. */
export function hideConversation(conversationId: string): Promise<void> {
  return savePreferences(conversationId, (current) => current, { hidden: true });
}

// MARK: - Messages éphémères (EphemeralDuration)

export const EPHEMERAL_DURATIONS = [
  { value: 'off', seconds: null, label: 'Désactivés' },
  { value: 'day', seconds: 86_400, label: '24 heures' },
  { value: 'week', seconds: 604_800, label: '7 jours' },
  { value: 'quarter', seconds: 7_776_000, label: '90 jours' },
] as const;
export type EphemeralDuration = (typeof EPHEMERAL_DURATIONS)[number];

/** Durée d'une conversation : celle dont la durée est exactement ephemeral_seconds, sinon « Désactivés ». */
export function ephemeralOf(seconds: number | null | undefined): EphemeralDuration {
  return EPHEMERAL_DURATIONS.find((item) => item.seconds === (seconds ?? null)) ?? EPHEMERAL_DURATIONS[0];
}

/** set_ephemeral : la durée en secondes, écrite en texte (« 0 » pour désactiver). */
export function setEphemeralParams(conversationId: string, duration: EphemeralDuration): Record<string, unknown> {
  return { p_conversation_id: upper(conversationId), p_seconds: String(duration.seconds ?? 0) };
}

export function setEphemeral(conversationId: string, duration: EphemeralDuration): Promise<void> {
  return call('set_ephemeral', setEphemeralParams(conversationId, duration));
}

// MARK: - Exporter la discussion (ConversationMessages.exportText)

export const EXPORT_PERIODS = [
  { value: 'all', label: 'Toute la discussion', days: null },
  { value: 'lastMonth', label: '30 derniers jours', days: 30 },
  { value: 'lastWeek', label: '7 derniers jours', days: 7 },
] as const;
export type ExportPeriod = (typeof EXPORT_PERIODS)[number]['value'];

/** Messages exportés : ceux que l'on voit (sans ce que l'on a effacé), sur la période choisie (exported). */
export function exportedMessages(messages: Message[], clearedAt: Date | null, period: ExportPeriod, now: Date = new Date()): Message[] {
  const days = EXPORT_PERIODS.find((item) => item.value === period)?.days ?? null;
  return visibleMessages(messages, clearedAt, now)
    .filter((message) => days === null || message.createdAt.getTime() >= now.getTime() - days * 86_400_000);
}

const pad = (value: number) => String(value).padStart(2, '0');
const exportDate = (date: Date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** Une ligne par message, « 29/10/2026 21:33 · Vous : Bonjour » ; les pièces jointes par leur nom, puis le texte. */
export function exportText(title: string, messages: Message[], senderName: (senderId: string | null) => string): string {
  const lines = [`Discussion « ${title} » exportée depuis Nidalo`, ''];
  for (const message of messages) {
    const date = exportDate(message.createdAt);
    const content = message.content;
    if (content.kind === 'system') {
      lines.push(`${date} · ${contentPreview(content)}`);
    } else if (content.kind === 'attachments') {
      const names = content.items.map((item) => `[${item.fileName}]`).join(' ');
      lines.push(`${date} · ${senderName(message.senderId)} : ${names}${content.caption !== null ? ` ${content.caption}` : ''}`);
    } else {
      lines.push(`${date} · ${senderName(message.senderId)} : ${contentPreview(content)}`);
    }
  }
  return lines.join('\n');
}

/** Expéditeur d'une ligne exportée : « Vous », le membre, sinon le nom de la conversation. */
export function exportSender(conversation: Conversation, me: string | null) {
  return (senderId: string | null): string => {
    if (sameId(senderId, me)) return 'Vous';
    return conversation.members.find((member) => sameId(member.userId, senderId))?.name ?? conversation.counterpart.name;
  };
}

/** « Discussion-Visite-groupée-Lyon-2e.txt » : lettres et chiffres du titre, sinon « NIDALO ». */
export function exportFileName(title: string): string {
  const safe = title.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean).join('-');
  return `Discussion-${safe || 'NIDALO'}.txt`;
}

// MARK: - Contacts

/** Compte d'un contact (MessagingContact.userId) : l'autre personne de sa dernière conversation, sinon l'agence. */
export function contactUserId(contact: Contact): string | null {
  const latest = contact.conversations[0];
  return latest ? latest.otherUserId : contact.professional?.user_id ?? null;
}

/** Membre de groupe d'un contact (asMember, rôle « Membre »). */
export function contactMember(contact: Contact): Member | null {
  const userId = contactUserId(contact);
  if (!userId) return null;
  return { userId, name: contact.counterpart.name, kind: contact.counterpart.kind === 'agency' ? 'agency' : 'individual', role: 'member' };
}

/**
 * Suggestions pour inviter des membres (suggestedMembers) : contacts avec qui l'on a échangé, du plus récent au plus
 * ancien, puis contacts déjà membres de ses groupes, par ordre alphabétique ; cinq au plus.
 */
export function suggestedContacts(contacts: Contact[], groupMemberIds: Set<string>, limit = 5): Contact[] {
  const eligible = contacts.filter((contact) => {
    const userId = contactUserId(contact);
    return !!userId && (contact.conversations.length > 0 || groupMemberIds.has(userId.toLowerCase()));
  });
  const recent = eligible.filter((contact) => contact.conversations.length > 0);
  const fromGroups = eligible.filter((contact) => contact.conversations.length === 0);
  return [...recent, ...fromGroups].slice(0, limit);
}

// MARK: - Échecs (SubmissionState)

const INVALID = ['23514', '23502', '22001', '22P02'];

/**
 * Message d'un échec, comme l'app : le refus du serveur tel quel (P0001), la connexion, les droits, les informations
 * refusées, sinon « n'a pas abouti » ; `creation` : écrans de création (« Vos informations sont conservées »).
 */
export function submissionMessage(error: unknown, creation = false): string {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  if (code === 'P0001' && message?.trim()) return message.trim();
  if (isOfflineFailure(error)) {
    return creation
      ? 'La création n\'a pas abouti : vérifiez votre connexion, puis réessayez. Vos informations sont conservées.'
      : 'La modification n\'a pas abouti : vérifiez votre connexion, puis réessayez.';
  }
  if (code === '42501' || code === 'PGRST301') return 'Vous n\'avez pas le droit de faire cette modification.';
  if (code && INVALID.includes(code)) return 'Certaines informations n\'ont pas été acceptées. Vérifiez-les, puis réessayez.';
  return creation ? 'La création n\'a pas abouti. Réessayez : vos informations sont conservées.' : 'La modification n\'a pas abouti. Réessayez.';
}
