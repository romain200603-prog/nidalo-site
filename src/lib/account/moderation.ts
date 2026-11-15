import { formatPrice, toNumber } from '../format';
import { contentPreview, decodeContent } from '../messages/content';
import { supabase } from '../supabase';
import { isNetworkError, NETWORK_MESSAGE } from './auth';
import { createStore } from './session';

// Modération (serveur : migration « modération » du 15 novembre 2026). La ligne « Signalements » de Mon compte, pour
// les comptes modérateurs seulement (is_moderator), et la page qui liste les signalements (moderation_reports) et
// applique les gestes (moderation_resolve). Le serveur vérifie lui-même que le compte est modérateur.

export type ReportTarget = 'listing' | 'message' | 'user' | 'conversation';
export type ReportReason = 'scam' | 'spam' | 'inappropriate' | 'harassment' | 'misleadingListing' | 'impersonation' | 'other';
export type ModerationAction = 'remove_listing' | 'delete_message' | 'suspend_user' | 'unsuspend_user' | 'dismiss';

/** Une ligne de moderation_reports. */
export type ReportRow = {
  id: string;
  created_at: string;
  status: 'open' | 'reviewed' | 'dismissed';
  target_type: ReportTarget;
  target_id: string;
  reason: ReportReason;
  details: string | null;
  /** Copie faite par le serveur au moment du signalement : annonce, message, ou 30 derniers messages d'une conversation. */
  target_snapshot: unknown;
  reporter_name: string | null;
  person_id: string | null;
  person_name: string | null;
  person_suspended: boolean;
  listing_status: string | null;
  listing_locked: boolean;
  message_exists: boolean;
  /** Noms des auteurs des messages copiés d'une conversation. */
  names: Record<string, string> | null;
  last_action: ModerationAction | null;
  last_action_at: string | null;
};

export const TARGET_LABELS: Record<ReportTarget, string> = {
  listing: 'Annonce',
  message: 'Message',
  user: 'Compte',
  conversation: 'Conversation',
};

/** Les motifs de l'app (ReportReason.label). */
export const REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam',
  scam: 'Fraude immobilière ou arnaque',
  inappropriate: 'Contenu inapproprié',
  harassment: 'Harcèlement',
  impersonation: 'Usurpation d\'identité',
  misleadingListing: 'Annonce trompeuse',
  other: 'Autre',
};

export const ACTION_LABELS: Record<ModerationAction, string> = {
  remove_listing: 'Retirer l\'annonce',
  delete_message: 'Supprimer le message',
  suspend_user: 'Suspendre le compte',
  unsuspend_user: 'Lever la suspension',
  dismiss: 'Classer sans suite',
};

/** Message bref après un geste, et ligne « Traité » d'un signalement. */
export const ACTION_DONE: Record<ModerationAction, string> = {
  remove_listing: 'Annonce retirée',
  delete_message: 'Message supprimé',
  suspend_user: 'Compte suspendu',
  unsuspend_user: 'Suspension levée',
  dismiss: 'Classé sans suite',
};

const LISTING_STATES: Record<string, string> = {
  draft: 'Brouillon',
  active: 'En ligne',
  underOffer: 'En ligne, sous offre',
  sold: 'Vendue',
  rented: 'Louée',
  archived: 'Archivée',
};

// MARK: - Le compte est-il modérateur ?

/** `null` tant que la réponse n'est pas là ; `false` aussi quand le serveur ne répond pas (la ligne reste cachée). */
export const moderatorStore = createStore<boolean | null>(null);
let moderatorFor: string | null = null;

export async function loadModerator(userId: string | null): Promise<void> {
  if (!userId) {
    moderatorFor = null;
    moderatorStore.set(false);
    return;
  }
  if (moderatorFor === userId && moderatorStore.get() !== null) return;
  // Autre compte : la ligne se cache jusqu'à la réponse.
  if (moderatorFor !== userId) moderatorStore.set(null);
  moderatorFor = userId;
  try {
    const { data, error } = await supabase.rpc('is_moderator');
    if (moderatorFor === userId) moderatorStore.set(!error && data === true);
  } catch {
    if (moderatorFor === userId) moderatorStore.set(false);
  }
}

// MARK: - Lecture et gestes

/** Signalements à traiter (du plus ancien au plus récent), ou les 100 derniers traités. Lève l'erreur du serveur. */
export async function fetchReports(closed: boolean): Promise<ReportRow[]> {
  const { data, error } = await supabase.rpc('moderation_reports', { p_closed: closed });
  if (error) throw error;
  return Array.isArray(data) ? (data as ReportRow[]) : [];
}

type ServerError = { code?: string; message?: string; hint?: string | null };

/** Refus du serveur (page réservée, geste impossible…) : son message en français ; sinon la connexion. */
export function moderationFailure(error: unknown, fallback: string): string {
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  const { code, message } = (error ?? {}) as ServerError;
  return code === 'P0001' && message?.trim() ? message.trim() : fallback;
}

/** Le compte connecté n'est pas modérateur : le serveur refuse la page (« Cette page est réservée… »). */
export function isReserved(error: unknown): boolean {
  return ((error ?? {}) as ServerError).hint === 'moderation_reservee';
}

export const REPORTS_FAILURE = 'Les signalements n\'ont pas pu être chargés. Réessayez dans un instant.';
export const ACTION_FAILURE = 'Le geste n\'a pas pu être enregistré. Réessayez dans un instant.';

/** Applique un geste ; renvoie le message d'erreur, ou `null`. `userId` : la personne choisie dans un groupe. */
export async function resolveReport(id: string, action: ModerationAction, userId: string | null = null): Promise<string | null> {
  try {
    const { error } = await supabase.rpc('moderation_resolve', { p_report_id: id, p_action: action, p_user_id: userId });
    return error ? moderationFailure(error, ACTION_FAILURE) : null;
  } catch (error) {
    return moderationFailure(error, ACTION_FAILURE);
  }
}

// MARK: - Ce que la page montre

export type ReportContent =
  | { kind: 'listing'; title: string; line: string; description: string | null; state: string }
  | { kind: 'message'; text: string; deleted: boolean }
  | { kind: 'user'; name: string }
  | { kind: 'conversation'; lines: { name: string; text: string }[] };

const record = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const DESCRIPTION_MAX = 400;

/** Ce qui a été signalé, tel que copié par le serveur, avec son état actuel. */
export function reportContent(row: ReportRow): ReportContent {
  const snapshot = record(row.target_snapshot);
  switch (row.target_type) {
    case 'listing': {
      const price = toNumber(snapshot.price);
      const description = text(snapshot.description);
      const state = row.listing_locked ? 'Retirée par la modération'
        : row.listing_status === null ? 'Supprimée par son auteur'
          : LISTING_STATES[row.listing_status] ?? row.listing_status;
      return {
        kind: 'listing',
        title: text(snapshot.title) || 'Annonce sans titre',
        line: [text(snapshot.city), price !== null && price > 0 ? formatPrice(price) : ''].filter(Boolean).join(' · '),
        description: description ? ([...description].length > DESCRIPTION_MAX ? `${[...description].slice(0, DESCRIPTION_MAX).join('')}…` : description) : null,
        state,
      };
    }
    case 'message': {
      const copied = 'content' in snapshot ? contentPreview(decodeContent(snapshot.content)) : '';
      return { kind: 'message', text: copied.trim() || 'Message non copié', deleted: !row.message_exists };
    }
    case 'user':
      return { kind: 'user', name: row.person_name ?? 'Compte supprimé' };
    case 'conversation': {
      const items = Array.isArray(row.target_snapshot) ? row.target_snapshot.map(record) : [];
      const names = row.names ?? {};
      return {
        kind: 'conversation',
        lines: items.map((item) => ({
          name: names[text(item.sender_id)] ?? 'Un membre',
          text: text(item.preview) || '…',
        })),
      };
    }
  }
}

/** Gestes proposés : sur un signalement à traiter, ceux qui vont avec ; sur un signalement traité, lever une suspension. */
export function reportActions(row: ReportRow): ModerationAction[] {
  const suspend: ModerationAction[] = row.person_suspended ? ['unsuspend_user']
    : row.person_id && row.person_name ? ['suspend_user'] : [];
  if (row.status !== 'open') return row.person_suspended ? ['unsuspend_user'] : [];
  switch (row.target_type) {
    case 'listing':
      return [...(row.listing_status !== null && !row.listing_locked ? ['remove_listing' as const] : []), ...suspend, 'dismiss'];
    case 'message':
      return [...(row.message_exists ? ['delete_message' as const] : []), ...suspend, 'dismiss'];
    case 'user':
      return [...suspend, 'dismiss'];
    case 'conversation':
      // Groupe : la personne se choisit parmi les auteurs des messages copiés (groupMembers).
      return [...(row.person_id ? suspend : groupMembers(row).length ? ['suspend_user' as const] : []), 'dismiss'];
  }
}

/** Auteurs des messages copiés d'un groupe, par ordre alphabétique : ceux qu'on peut choisir de suspendre. */
export function groupMembers(row: ReportRow): { id: string; name: string }[] {
  if (row.target_type !== 'conversation' || row.person_id) return [];
  return Object.entries(row.names ?? {})
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Fenêtre de confirmation de chaque geste ; `name` : la personne visée. `danger` : bouton rouge. */
export function confirmation(action: ModerationAction, name: string | null): { title: string; message: string; danger: boolean } {
  switch (action) {
    case 'remove_listing':
      return { title: 'Retirer cette annonce ?', message: 'Elle disparaît de Nidalo et son auteur ne pourra pas la remettre en ligne.', danger: true };
    case 'delete_message':
      return { title: 'Supprimer ce message ?', message: 'Il disparaît de la conversation pour tous ses membres.', danger: true };
    case 'suspend_user':
      return {
        title: name ? `Suspendre le compte de ${name} ?` : 'Suspendre ce compte ?',
        message: 'Ce compte ne pourra plus se connecter et ses annonces en ligne seront retirées. Vous pourrez lever la suspension plus tard.',
        danger: true,
      };
    case 'unsuspend_user':
      return {
        title: name ? `Lever la suspension de ${name} ?` : 'Lever la suspension ?',
        message: 'Ce compte pourra de nouveau se connecter. Ses annonces restent retirées, mais il pourra les remettre en ligne.',
        danger: false,
      };
    case 'dismiss':
      return { title: 'Classer sans suite ?', message: 'Le signalement passe dans « Traités », sans rien changer.', danger: false };
  }
}

/** Dernier geste noté sur un signalement, ou ce qui l'a clos (« Annonce retirée le 15 nov. à 12:04 »). */
export function actionLine(row: ReportRow): string | null {
  if (row.last_action && row.last_action_at && ACTION_DONE[row.last_action]) {
    return `${ACTION_DONE[row.last_action]} le ${reportDate(row.last_action_at)}`;
  }
  if (row.status === 'open') return null;
  return row.status === 'dismissed' ? 'Classé sans suite' : 'Traité avec un autre signalement';
}

// Heure de Paris, comme les 24 heures des conditions d'utilisation.
const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

/** « 15 nov. à 12:04 » (heure de Paris). */
export function reportDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `${dayFormat.format(date)} à ${timeFormat.format(date)}`;
}

/** Signalement à traiter depuis plus de 24 heures (la promesse des conditions d'utilisation). */
export function isLate(row: ReportRow, now: Date = new Date()): boolean {
  const since = Date.parse(row.created_at);
  return row.status === 'open' && Number.isFinite(since) && now.getTime() - since > 24 * 60 * 60 * 1000;
}
