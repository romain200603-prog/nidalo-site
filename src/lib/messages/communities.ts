import { avatarUrl } from '../account/profile';
import { supabase } from '../supabase';
import { fetchProfiles } from './api';
import { uploadGroupPhoto } from './files';
import { isProfessional, sameId, upper, type CommunityInfo, type Member } from './inbox';
import { photoPath, roleOf, type GroupRole, type PhotoChoice } from './groups';

// Communautés de la messagerie, comme l'app : catégories et couvertures (GroupConversation.swift,
// CommunityCover+Style), saisie de « Nouvelle communauté » (CommunityDraft), appels du serveur avec exactement les
// paramètres de l'app (SupabaseMessagingRepository.swift, « MARK: - Communautés », et CommunityServer.swift),
// invitations par lien et QR code et demandes pour entrer (CommunityInviteStore, CommunityInviteServer).

// MARK: - Discussion principale

/** Discussion principale : l'identifiant de la communauté, octet 15 inversé avec 0x5A (Community.mainConversationId). */
export function mainConversationId(communityId: string): string {
  const hex = communityId.replace(/-/g, '');
  const last = (parseInt(hex.slice(30, 32), 16) ^ 0x5a).toString(16).padStart(2, '0');
  const bytes = `${hex.slice(0, 30)}${last}`.toUpperCase();
  return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-${bytes.slice(12, 16)}-${bytes.slice(16, 20)}-${bytes.slice(20)}`;
}

// MARK: - Catégories et couvertures

export const COMMUNITY_CATEGORIES = [
  { value: 'residential', label: 'Résidentiel', icon: 'house' },
  { value: 'rental', label: 'Location', icon: 'keyRound' },
  { value: 'investment', label: 'Investissement immobilier', icon: 'trend' },
  { value: 'hotels', label: 'Hôtels', icon: 'hotel' },
  { value: 'commercial', label: 'Immobilier commercial', icon: 'store' },
  { value: 'renovation', label: 'Travaux et rénovation', icon: 'ruler' },
  { value: 'general', label: 'Communauté immobilière générale', icon: 'usersRound' },
] as const;
export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number]['value'];

/** Catégorie lue du serveur ; inconnue : « Communauté immobilière générale ». */
export function categoryOf(value: string | null | undefined): (typeof COMMUNITY_CATEGORIES)[number] {
  return COMMUNITY_CATEGORIES.find((item) => item.value === value) ?? COMMUNITY_CATEGORIES[6];
}

/** Couvertures dessinées par l'app (aucune image téléchargée) : dégradé du haut à gauche vers le bas à droite. */
export const COMMUNITY_COVERS = [
  { value: 'brand', label: 'Bleu Nidalo', from: '#3C5CB0', to: '#3C5CB0', icon: 'usersRound' },
  { value: 'sky', label: 'Ciel', from: '#6AA8FF', to: '#396CDF', icon: 'building2' },
  { value: 'night', label: 'Nuit', from: '#0B1650', to: '#1C3557', icon: 'house' },
  { value: 'emerald', label: 'Émeraude', from: '#02714F', to: '#1FA37A', icon: 'trees' },
] as const;
export type CommunityCover = (typeof COMMUNITY_COVERS)[number]['value'];

/** Couverture affichée : celle choisie, sinon le bleu Nidalo (style). */
export function coverOf(value: string | null | undefined): (typeof COMMUNITY_COVERS)[number] {
  return COMMUNITY_COVERS.find((item) => item.value === value) ?? COMMUNITY_COVERS[0];
}

// MARK: - Nouvelle communauté (CommunityDraft)

export const COMMUNITY_NAME_LIMIT = 50;
export const COMMUNITY_DETAILS_LIMIT = 500;
export const COMMUNITY_AREA_LIMIT = 60;

export type CommunityDraft = {
  id: string;
  name: string;
  details: string;
  category: CommunityCategory | null;
  area: string;
  /** Photo choisie, déjà préparée en JPEG ; elle passe avant la couverture. */
  photo: Blob | null;
  cover: CommunityCover | null;
  /** Premiers membres, facultatifs. */
  members: Member[];
};

/** Nouvelle saisie : catégorie « générale » déjà choisie, comme l'app. */
export function newCommunityDraft(): CommunityDraft {
  return { id: crypto.randomUUID().toUpperCase(), name: '', details: '', category: 'general', area: '', photo: null, cover: null, members: [] };
}

export type CommunityIssue = 'missingName' | 'nameTooLong' | 'missingDetails' | 'missingCategory';

export function communityIssues(draft: Pick<CommunityDraft, 'name' | 'details' | 'category'>): CommunityIssue[] {
  const name = draft.name.trim();
  const issues: CommunityIssue[] = [];
  if (!name) issues.push('missingName');
  if ([...name].length > COMMUNITY_NAME_LIMIT) issues.push('nameTooLong');
  if (!draft.details.trim()) issues.push('missingDetails');
  if (!draft.category) issues.push('missingCategory');
  return issues;
}

/** create_community : zone seulement si elle est renseignée, couverture seulement sans photo. */
export function createCommunityParams(draft: Omit<CommunityDraft, 'photo'> & { photo: unknown }): Record<string, unknown> {
  const area = draft.area.trim();
  const params: Record<string, unknown> = {
    p_id: upper(draft.id), p_conversation_id: mainConversationId(draft.id), p_name: draft.name.trim(), p_details: draft.details.trim(),
    p_category: draft.category ?? 'general',
  };
  if (area) params.p_area = area;
  if (!draft.photo && draft.cover) params.p_cover = draft.cover;
  params.p_member_ids = draft.members.map((member) => upper(member.userId));
  return params;
}

/** update_community_info : nom sans espaces autour ; la photo est toujours envoyée, `null` la retire. */
export function updateCommunityInfoParams(communityId: string, name: string, imagePath: string | null): Record<string, unknown> {
  return { p_community_id: upper(communityId), p_name: name.trim(), p_image_path: imagePath };
}

async function rows<T>(name: string, params: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return Array.isArray(data) ? (data as T[]) : [];
}

/** Communauté renvoyée par une fonction du serveur : une ligne de my_communities, sinon « introuvable ». */
async function communityCall(name: string, params: Record<string, unknown>): Promise<void> {
  const found = await rows<{ id: string }>(name, params);
  if (!found.length) throw Object.assign(new Error('Communauté introuvable'), { code: 'notFound' });
}

/**
 * Crée la communauté (create_community). Une photo choisie part ensuite dans « <discussion principale>/group/ » puis
 * update_group_info (nom, photo) si le serveur n'en a pas déjà ; sans photo enregistrée, la communauté existe quand même.
 */
export async function createCommunity(draft: CommunityDraft): Promise<string> {
  const created = await rows<{ id: string; image_path?: string | null }>('create_community', createCommunityParams(draft));
  const community = created[0];
  if (!community) throw Object.assign(new Error('Communauté introuvable'), { code: 'notFound' });
  const conversationId = mainConversationId(draft.id);
  if (draft.photo && !community.image_path) {
    try {
      const path = await uploadGroupPhoto(conversationId, draft.photo);
      // La liste relue ensuite (reloadConversations) porte la photo enregistrée.
      await supabase.rpc('update_group_info', { p_conversation_id: conversationId, p_name: draft.name.trim(), p_image_path: path });
    } catch {
      // Sans photo enregistrée, la communauté existe quand même.
    }
  }
  return conversationId;
}

export function addCommunityMembers(communityId: string, members: Member[]): Promise<void> {
  return communityCall('add_community_members', { p_community_id: upper(communityId), p_member_ids: members.map((member) => upper(member.userId)) });
}

export function removeCommunityMember(communityId: string, memberId: string): Promise<void> {
  return communityCall('remove_community_member', { p_community_id: upper(communityId), p_member_id: upper(memberId) });
}

export function setCommunityRole(communityId: string, memberId: string, role: 'admin' | 'member'): Promise<void> {
  return communityCall('set_community_role', { p_community_id: upper(communityId), p_member_id: upper(memberId), p_role: role });
}

/** « Modifier la communauté » : une nouvelle photo part d'abord dans « <discussion principale>/group/ ». */
export async function updateCommunityInfo(community: Pick<CommunityInfo, 'id' | 'mainConversationId'>, name: string, photo: PhotoChoice): Promise<void> {
  const path = await photoPath(photo, community.mainConversationId);
  await communityCall('update_community_info', updateCommunityInfoParams(community.id, name, path));
}

export async function leaveCommunity(communityId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_community', { p_community_id: upper(communityId) });
  if (error) throw error;
}

// MARK: - Droits (CommunityView)

/** Retirer : jamais soi-même ni le créateur ; le créateur retire tout le monde, un administrateur les membres. */
export function communityMemberActions(myRole: GroupRole | null, target: Member, me: string | null): { canPromote: boolean; canRemove: boolean } {
  const role = roleOf(target.role);
  const isMe = sameId(target.userId, me);
  return {
    canPromote: myRole === 'owner' && !isMe && role !== 'owner',
    canRemove: !isMe && role !== 'owner' && (myRole === 'owner' || (myRole === 'admin' && role === 'member')),
  };
}

// MARK: - Invitations (CommunityInviteStore)

/** Lien actif (my_community_invites, create_community_invite). */
export type CommunityInvite = { id: string; token: string; requiresApproval: boolean; createdAt: Date; expiresAt: Date };

type InviteRow = { id: string; token: string; requires_approval?: boolean | null; created_at: string; expires_at: string };

const inviteFrom = (row: InviteRow): CommunityInvite => ({
  id: row.id, token: row.token, requiresApproval: row.requires_approval ?? true, createdAt: new Date(row.created_at), expiresAt: new Date(row.expires_at),
});

export const INVITE_GENERIC_MESSAGE = 'La demande n\'a pas abouti. Vérifiez votre connexion, puis réessayez.';

/** Message d'une invitation qui échoue : le refus du serveur tel quel, sinon le message général. */
export function inviteMessage(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  return code === 'P0001' && message?.trim() ? message.trim() : INVITE_GENERIC_MESSAGE;
}

/** Liens actifs, plus récents d'abord. */
export async function communityInvites(communityId: string): Promise<CommunityInvite[]> {
  return (await rows<InviteRow>('my_community_invites', { p_community_id: upper(communityId) })).map(inviteFrom);
}

/** Nouveau lien de 7 jours, toujours avec accord avant d'entrer. */
export async function createCommunityInvite(communityId: string): Promise<CommunityInvite> {
  const created = await rows<InviteRow>('create_community_invite', { p_community_id: upper(communityId), p_days: 7, p_requires_approval: true });
  if (!created[0]) throw new Error(INVITE_GENERIC_MESSAGE);
  return inviteFrom(created[0]);
}

export async function revokeCommunityInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_community_invite', { p_invite_id: upper(inviteId) });
  if (error) throw error;
}

/** « nidalo://invite/<jeton> » : le QR code contient exactement ce lien. */
export const inviteLink = (token: string): string => `nidalo://invite/${token}`;

/** Texte du bouton « Partager ». */
export const inviteShareText = (communityName: string, link: string): string => `Rejoignez ma communauté « ${communityName} » sur Nidalo : ${link}`;

const parisDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });

/** « Valable jusqu'au 11/11/2026 », à l'heure de Paris. */
export const validityLabel = (expiresAt: Date): string => `Valable jusqu'au ${parisDay.format(expiresAt)}`;

// MARK: - Demandes pour entrer

/** Personne qui demande à entrer : nom et photo publics. */
export type JoinRequest = { id: string; userId: string; name: string; avatarUrl: string | null };

/** Demandes en attente (pending_community_join_requests), avec les noms publics ; `null` si la lecture échoue. */
export async function joinRequests(communityId: string): Promise<JoinRequest[] | null> {
  let found: { id: string; user_id: string }[];
  try {
    found = await rows('pending_community_join_requests', { p_community_id: upper(communityId) });
  } catch {
    return null;
  }
  const profiles = await fetchProfiles(found.map((request) => request.user_id)).catch(() => new Map());
  return found.map((request) => {
    const profile = profiles.get(request.user_id.toLowerCase());
    const name = (isProfessional(profile) ? profile?.agency_name : profile?.public_name) ?? 'Particulier';
    return { id: request.id, userId: request.user_id, name, avatarUrl: avatarUrl(profile?.avatar_path ?? null) };
  });
}

export async function decideJoinRequest(requestId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('decide_community_join_request', { p_request_id: upper(requestId), p_accept: accept });
  if (error) throw error;
}
