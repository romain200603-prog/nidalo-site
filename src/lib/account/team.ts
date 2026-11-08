import { useEffect, useMemo } from 'react';
import { appDate } from '../appDates';
import { plural } from '../format';
import { parisDay } from '../listing/views';
import { accountPath } from '../paths';
import { supabase } from '../supabase';
import type { AgencyRecord } from './agency';
import { GENERIC_MESSAGE, isNetworkError, NETWORK_MESSAGE } from './auth';
import { listDay } from './opportunities';
import { isValidProfileEmail } from './profile';
import { createStore, currentUserId, sessionStore, useStore } from './session';

// « Gestion des équipes » de l'espace professionnel : l'équipe de l'agence (le gérant, qui a créé la fiche agence,
// puis les responsables et les agents), les liens d'invitation et l'invitation reçue. Tout passe par les fonctions du
// serveur (my_team_agency, my_agency_team, agency_invites, create_agency_invite…) : les tables restent cachées.

export type TeamRole = 'owner' | 'manager' | 'agent';
export type InviteRole = Exclude<TeamRole, 'owner'>;

/** Mon agence et mon rôle (rien si le compte n'a ni fiche agence ni équipe). */
export type TeamAgency = {
  agency_id: string;
  role: TeamRole;
  agency_name: string;
  logo_path: string | null;
  postal_code: string | null;
  city: string | null;
};

export type TeamMember = {
  user_id: string;
  role: TeamRole;
  public_name: string | null;
  avatar_path: string | null;
  joined_at: string;
};

export type TeamInvite = {
  id: string;
  token: string;
  role: InviteRole;
  email: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  expires_at: string;
};

/** Ce qui empêche (ou non) la personne connectée de rejoindre l'équipe d'un lien. */
export type PreviewStatus = 'ok' | 'owner' | 'own_agency' | 'member' | 'other_team' | 'other_email' | 'full';

export type InvitePreview = {
  agency_name: string;
  agency_logo_path: string | null;
  agency_city: string | null;
  role: InviteRole;
  invited_by_name: string | null;
  status: PreviewStatus;
};

export const ROLE_LABELS: Record<TeamRole, string> = { owner: 'Gérant', manager: 'Responsable', agent: 'Agent' };

/** Ce que fait chaque rôle (les mêmes mots sur la page de l'équipe, l'invitation et le formulaire). */
export const ROLE_TEXTS: Record<TeamRole, string> = {
  owner: 'A créé l\'agence : modifie sa fiche, gère l\'équipe et tout ce qui est à l\'agence.',
  manager: 'Gère l\'équipe et modifie les annonces, contacts et mandats de l\'agence.',
  agent: 'Voit les annonces, contacts et mandats de l\'agence ; ne modifie que ce qu\'il a ajouté.',
};

const ROLES: TeamRole[] = ['owner', 'manager', 'agent'];
const isRole = (value: unknown): value is TeamRole => ROLES.includes(value as TeamRole);

export const canManage = (role: TeamRole | null | undefined): boolean => role === 'owner' || role === 'manager';

export const memberName = (member: Pick<TeamMember, 'public_name'>): string => member.public_name?.trim() || 'Membre sans nom';

/** Jour (Paris) d'un horodatage du serveur, court cette année : « 6 novembre ». */
function shortDay(value: string | null | undefined, now: Date): string | null {
  const date = appDate(value);
  return date ? listDay(parisDay(date), parisDay(now)) : null;
}

/** « Responsable · depuis le 6 novembre » ; le gérant : « Gérant · a créé l'agence ». */
export function memberLine(member: TeamMember, now = new Date()): string {
  if (member.role === 'owner') return `${ROLE_LABELS.owner} · a créé l'agence`;
  const since = shortDay(member.joined_at, now);
  return since ? `${ROLE_LABELS[member.role]} · depuis le ${since}` : ROLE_LABELS[member.role];
}

/** Invitation en cours : « Agent · expire le 15 novembre ». */
export function inviteLine(invite: TeamInvite, now = new Date()): string {
  const until = shortDay(invite.expires_at, now);
  return until ? `${ROLE_LABELS[invite.role]} · expire le ${until}` : ROLE_LABELS[invite.role];
}

export const inviteTitle = (invite: Pick<TeamInvite, 'email'>): string => invite.email?.trim() || 'Lien pour une personne';

/** Ligne « Gestion des équipes » de Mon compte : « 3 membres », sinon l'invitation à inviter. */
export function teamSubtitle(state: TeamState): string {
  if (state.status !== 'ready' || !state.agency || state.members.length < 2) return 'Inviter des collaborateurs';
  return plural(state.members.length, 'membre', 'membres');
}

/** Membre de l'équipe d'une autre personne (responsable ou agent), pas le gérant. */
export function memberAgency(state: TeamState): TeamAgency | null {
  return state.status === 'ready' && state.agency && state.agency.role !== 'owner' ? state.agency : null;
}

// MARK: - Partage dans l'agence

// Les annonces, les contacts ajoutés à la main et les mandats de l'équipe sont partagés (règle choisie par Romain,
// « Le sien seulement ») : chacun voit tout ce qui est à l'agence ; un agent ne modifie que ce qu'il a ajouté, le
// gérant et les responsables modifient tout. Chaque chose garde son auteur (owner_id).

/** Mon équipe pour les pages partagées : le nom de chacun et si je la gère. `null` sans équipe, ou seul dedans. */
export type TeamScope = { me: string; names: Map<string, string>; manages: boolean };

const sameUser = (a: string | null | undefined, b: string | null | undefined): boolean => (
  !!a && !!b && a.toLowerCase() === b.toLowerCase()
);

export function teamScope(state: TeamState, me: string | null): TeamScope | null {
  if (!me || state.status !== 'ready' || !state.agency) return null;
  if (!state.members.some((member) => !sameUser(member.user_id, me))) return null;
  return {
    me,
    names: new Map(state.members.map((member) => [member.user_id.toLowerCase(), memberName(member)])),
    manages: canManage(state.agency.role),
  };
}

/** Comptes de l'équipe (moi compris), pour lire ce qui est à l'agence. */
export const teamIds = (scope: TeamScope): string[] => [...scope.names.keys()];

/** Auteur d'une chose de l'agence ajoutée par quelqu'un d'autre que moi ; `null` si c'est la mienne. */
export function authorOf(scope: TeamScope | null, ownerId: string | null | undefined): string | null {
  if (!scope || !ownerId || sameUser(ownerId, scope.me)) return null;
  return scope.names.get(ownerId.toLowerCase()) ?? 'Un ancien membre';
}

/** La mienne, ou celle d'une personne de l'équipe que je gère (gérant ou responsable). */
export function canEditOf(scope: TeamScope | null, ownerId: string | null | undefined, me: string | null): boolean {
  if (!ownerId || sameUser(ownerId, me)) return !!me;
  return !!scope && scope.manages && scope.names.has(ownerId.toLowerCase());
}

/** Lit l'équipe si aucune page ne l'a encore fait, puis la rend telle que les pages partagées s'en servent. */
export function useTeamScope(): TeamScope | null {
  const team = useStore(teamStore);
  const session = useStore(sessionStore);
  const me = session.status === 'signedIn' ? session.userId : null;
  useEffect(() => {
    if (me && teamStore.get().status === 'none') void loadTeam();
  }, [me]);
  return useMemo(() => teamScope(team, me), [team, me]);
}

/** « Les miens » ou « L'agence », gardé dans ce navigateur pour chaque page. */
export type TeamView = 'mine' | 'agency';

const VIEW_KEY = (page: string) => `nidalo.vueEquipe.${page}`;

export function savedTeamView(page: string): TeamView {
  return readStorage(VIEW_KEY(page)) === 'agency' ? 'agency' : 'mine';
}

export function saveTeamView(page: string, view: TeamView) {
  writeStorage(VIEW_KEY(page), view === 'agency' ? 'agency' : null);
}

// MARK: - Liens d'invitation

const TOKEN = /^[0-9a-f]{32}$/;

/** Jeton d'invitation lu dans l'adresse (32 caractères hexadécimaux), ou `null`. */
export function cleanToken(raw: string | null | undefined): string | null {
  const token = raw?.trim().toLowerCase() ?? '';
  return TOKEN.test(token) ? token : null;
}

export const invitationPath = (token: string): string => accountPath('equipes', { invitation: token });

/** Adresse complète du lien, à copier ou à envoyer. */
export const invitationUrl = (token: string, origin = window.location.origin): string => `${origin}${invitationPath(token)}`;

/** E-mail prêt à envoyer avec la messagerie de la personne (Nidalo n'écrit pas aux invités). */
export function inviteMailHref(email: string | null, role: InviteRole, agencyName: string, url: string): string {
  const subject = `Rejoignez l'équipe ${agencyName} sur Nidalo`;
  const body = [
    'Bonjour,',
    '',
    `Je vous invite à rejoindre l'équipe ${agencyName} sur Nidalo, comme ${ROLE_LABELS[role].toLowerCase()}.`,
    'Ouvrez ce lien pour accepter l\'invitation (valable 7 jours) :',
    url,
  ].join('\n');
  return `mailto:${email?.trim() ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function inviteEmailError(email: string): string | null {
  const text = email.trim();
  if (!text) return null;
  return text.length > 254 || !isValidProfileEmail(text) ? 'Adresse e-mail invalide.' : null;
}

// Invitation ouverte avant de se connecter ou de créer son compte : gardée dans ce navigateur, elle s'ouvre après la
// connexion (ou la confirmation de l'e-mail d'un compte neuf), puis s'oublie dès qu'on y a répondu.
const PENDING_KEY = 'nidalo.teamInvitation';
const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Stockage refusé : il faudra rouvrir le lien après la connexion.
  }
}

export function rememberInvitation(token: string, now = Date.now()) {
  writeStorage(PENDING_KEY, JSON.stringify({ token, at: now }));
}

export function forgetInvitation() {
  writeStorage(PENDING_KEY, null);
}

/** Invitation gardée de moins de 7 jours, ou `null`. */
export function pendingInvitation(now = Date.now()): string | null {
  const raw = readStorage(PENDING_KEY);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as { token?: unknown; at?: unknown };
    const token = typeof value.token === 'string' ? cleanToken(value.token) : null;
    if (token && typeof value.at === 'number' && now - value.at >= 0 && now - value.at < PENDING_TTL_MS) return token;
  } catch {
    // Valeur abîmée : oubliée ci-dessous.
  }
  forgetInvitation();
  return null;
}

// MARK: - Serveur

export type TeamState =
  | { status: 'none' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; agency: TeamAgency | null; members: TeamMember[]; invites: TeamInvite[] };

export const teamStore = createStore<TeamState>({ status: 'none' });

const MESSAGES: Record<string, string> = {
  team_forbidden: 'Seuls les responsables de l\'agence gèrent l\'équipe.',
  team_role: 'Choisissez un rôle : responsable ou agent.',
  team_email: 'Adresse e-mail invalide.',
  team_invites_full: 'Vous avez déjà 20 invitations en cours. Annulez-en pour en créer.',
  team_invite_invalid: 'Ce lien d\'invitation n\'est plus valable. Demandez-en un nouveau à l\'agence.',
  team_invite_email: 'Ce lien est réservé à une autre adresse e-mail. Connectez-vous avec l\'adresse qui a reçu l\'invitation.',
  team_own_agency: 'Votre compte a déjà sa propre agence : il ne peut pas rejoindre une autre équipe.',
  team_other_team: 'Vous faites déjà partie d\'une équipe. Quittez-la d\'abord pour rejoindre celle-ci.',
  team_full: 'Cette équipe compte déjà 50 membres.',
  team_signed_out: 'Votre session a expiré. Reconnectez-vous.',
  team_member: 'Cette personne ne fait plus partie de l\'équipe.',
  team_self: 'Pour partir, utilisez « Quitter l\'équipe ».',
  team_owner: 'Le gérant ne quitte pas son agence.',
};

function failure(error: unknown, overrides: Record<string, string> = {}): string {
  const { hint } = (error ?? {}) as { hint?: string };
  if (hint && (overrides[hint] ?? MESSAGES[hint])) return overrides[hint] ?? MESSAGES[hint];
  return isNetworkError(error) ? NETWORK_MESSAGE : GENERIC_MESSAGE;
}

/** Première ligne de my_team_agency, si elle a la forme attendue. */
function teamAgencyOf(data: unknown): TeamAgency | null {
  const row = (Array.isArray(data) ? data[0] : null) as Partial<TeamAgency> | null | undefined;
  return row && typeof row.agency_id === 'string' && isRole(row.role) ? (row as TeamAgency) : null;
}

/** Mon agence, mon équipe et, pour un responsable, les invitations en cours. */
export async function loadTeam(): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    teamStore.set({ status: 'none' });
    return;
  }
  if (teamStore.get().status !== 'ready') teamStore.set({ status: 'loading' });
  const [agency, members] = await Promise.all([supabase.rpc('my_team_agency'), supabase.rpc('my_agency_team')]);
  if (currentUserId() !== session.userId) return;
  const error = agency.error ?? members.error;
  if (error) {
    teamStore.set({ status: 'error', message: failure(error) });
    return;
  }
  const mine = teamAgencyOf(agency.data);
  let invites: TeamInvite[] = [];
  if (mine && canManage(mine.role)) {
    const result = await supabase.rpc('agency_invites');
    if (currentUserId() !== session.userId) return;
    if (result.error) {
      teamStore.set({ status: 'error', message: failure(result.error) });
      return;
    }
    invites = (result.data ?? []) as TeamInvite[];
  }
  const rows = mine ? ((members.data ?? []) as TeamMember[]).filter((member) => isRole(member.role)) : [];
  teamStore.set({ status: 'ready', agency: mine, members: rows, invites });
}

/** Crée un lien d'invitation ; rend son jeton, ou le message d'erreur. */
export async function createInvite(role: InviteRole, email: string): Promise<{ token: string } | { error: string }> {
  const { data, error } = await supabase.rpc('create_agency_invite', { p_role: role, p_email: email.trim() || null });
  const token = (Array.isArray(data) ? (data[0] as { token?: unknown } | undefined)?.token : null);
  if (error || typeof token !== 'string') return { error: failure(error) };
  return { token };
}

export async function revokeInvite(id: string): Promise<string | null> {
  const { error } = await supabase.rpc('revoke_agency_invite', { p_id: id });
  return error ? failure(error, { team_invite_invalid: 'Cette invitation n\'est plus en cours.' }) : null;
}

export async function setMemberRole(userId: string, role: InviteRole): Promise<string | null> {
  const { error } = await supabase.rpc('set_agency_member_role', { p_user: userId, p_role: role });
  return error ? failure(error) : null;
}

export async function removeMember(userId: string): Promise<string | null> {
  const { error } = await supabase.rpc('remove_agency_member', { p_user: userId });
  return error ? failure(error) : null;
}

export async function leaveTeam(): Promise<string | null> {
  const { error } = await supabase.rpc('leave_agency');
  return error ? failure(error, { team_member: 'Vous ne faites plus partie de cette équipe.' }) : null;
}

/** Aperçu d'une invitation : `null` si le lien ne vaut plus (expiré, déjà servi, annulé). */
export async function previewInvite(token: string): Promise<{ preview: InvitePreview | null } | { error: string }> {
  const { data, error } = await supabase.rpc('agency_invite_preview', { p_token: token });
  if (error) return { error: failure(error) };
  const row = (Array.isArray(data) ? data[0] : null) as InvitePreview | undefined;
  return { preview: row && typeof row.agency_name === 'string' ? row : null };
}

export async function acceptInvite(token: string): Promise<string | null> {
  const { error } = await supabase.rpc('accept_agency_invite', { p_token: token });
  return error ? failure(error) : null;
}

type PublicAgencyRow = {
  agency_id: string | null;
  agency_is_verified: boolean | null;
  agency_phone: string | null;
  agency_email: string | null;
  agency_website: string | null;
  agency_about: string | null;
  agency_siren: string | null;
  agency_professional_card_number: string | null;
  agency_professional_card_cci: string | null;
  agency_financial_guarantee: string | null;
  agency_rcp_insurer: string | null;
  agency_rcp_policy_number: string | null;
};

/**
 * Fiche de l'agence d'un membre de l'équipe (responsable ou agent), telle que les autres la voient (public_profiles) :
 * `null` pour le gérant ou un compte sans équipe. Seul le gérant la modifie. Lève une erreur si la lecture échoue.
 */
export async function loadMemberAgency(): Promise<{ agency: AgencyRecord; role: InviteRole } | null> {
  const userId = currentUserId();
  if (!userId) return null;
  const mine = await supabase.rpc('my_team_agency');
  // Serveur sans les équipes (fonction absente) : comme un compte sans équipe.
  if (mine.error && (mine.error as { code?: string }).code === 'PGRST202') return null;
  if (mine.error) throw mine.error;
  const team = teamAgencyOf(mine.data);
  if (!team || team.role === 'owner') return null;
  const profiles = await supabase.rpc('public_profiles', { user_ids: [userId] });
  if (profiles.error) throw profiles.error;
  const row = (profiles.data as PublicAgencyRow[] | null)?.[0];
  const same = Boolean(row?.agency_id && row.agency_id.toLowerCase() === team.agency_id.toLowerCase());
  return {
    role: team.role,
    agency: {
      id: team.agency_id,
      agency_name: team.agency_name,
      logo_path: team.logo_path,
      postal_code: team.postal_code,
      city: team.city,
      is_verified: same && row?.agency_is_verified === true,
      details: same && row ? {
        siren: row.agency_siren,
        siret: null,
        professional_card_number: row.agency_professional_card_number,
        professional_card_cci: row.agency_professional_card_cci,
        financial_guarantee: row.agency_financial_guarantee,
        rcp_insurer: row.agency_rcp_insurer,
        rcp_policy_number: row.agency_rcp_policy_number,
        phone: row.agency_phone,
        email: row.agency_email,
        website: row.agency_website,
        about: row.agency_about,
      } : null,
    },
  };
}
