import { beforeEach, describe, expect, it, vi } from 'vitest';

// Modération (15 novembre 2026) : la page « Signalements » (comptes modérateurs) et le message du filtre de mots
// interdits. Le client Supabase est simulé : chaque appel est noté, et chaque réponse est prévue par le test.

const server = vi.hoisted(() => ({
  calls: [] as { name: string; params?: unknown }[],
  rpc: {} as Record<string, { data: unknown; error: unknown }>,
  insertError: null as unknown,
}));

vi.mock('../supabase', () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {
      insert: (payload: unknown) => { server.calls.push({ name: `${table}.insert`, params: payload }); return chain; },
      select: () => chain,
      eq: () => chain,
      single: () => Promise.resolve(server.insertError
        ? { data: null, error: server.insertError }
        : { data: null, error: { code: '42501', message: 'refusé' } }),
    };
    return chain;
  };
  const rpc = (name: string, params?: unknown) => {
    server.calls.push({ name, params });
    return Promise.resolve(server.rpc[name] ?? { data: null, error: null });
  };
  return { supabase: { from, rpc } };
});
vi.mock('./session', async (original) => ({
  ...(await original<typeof import('./session')>()),
  currentUserId: () => 'a0000000-0000-4000-8000-0000000000c1',
}));

import { formatPrice } from '../format';
import { usesApple } from './auth';
import { bannedWordMessage, databaseMessage, REFUSED_MESSAGE } from './errors';
import {
  ACTION_FAILURE, actionLine, confirmation, fetchReports, groupMembers, isLate, isReserved, loadModerator, moderationFailure,
  moderatorStore, reportActions, reportContent, reportDate, resolveReport, type ReportRow,
} from './moderation';
import { sendAttachments, sendText } from '../messages/store';

const BANNED = { code: 'P0001', message: 'Ce texte contient un mot interdit. Modifiez-le pour continuer.', hint: 'contenu_interdit' };
const PAUL = 'ad111111-1111-1111-1111-111111111111';
const LINA = 'ad222222-2222-2222-2222-222222222222';

function row(patch: Partial<ReportRow>): ReportRow {
  return {
    id: 'r1', created_at: '2026-11-15T11:04:00Z', status: 'open', target_type: 'listing', target_id: 'l1', reason: 'scam',
    details: null, target_snapshot: null, reporter_name: 'Lina R.', person_id: PAUL, person_name: 'Paul M.',
    person_suspended: false, listing_status: 'active', listing_locked: false, message_exists: false, names: {},
    last_action: null, last_action_at: null, ...patch,
  };
}

beforeEach(() => {
  server.calls.length = 0;
  server.rpc = {};
  server.insertError = null;
});

describe('ce que la page montre', () => {
  it('annonce : titre, ville et prix, description coupée, état actuel', () => {
    const snapshot = { title: 'Appartement – Valleiry', city: 'Valleiry', price: 250000, description: 'x'.repeat(500), owner_id: PAUL };
    const shown = reportContent(row({ target_snapshot: snapshot }));
    expect(shown).toMatchObject({ kind: 'listing', title: 'Appartement – Valleiry', state: 'En ligne' });
    expect(shown.kind === 'listing' && shown.line).toBe(`Valleiry · ${formatPrice(250000)}`);
    expect(shown.kind === 'listing' && shown.description?.length).toBe(401);
    expect(reportContent(row({ target_snapshot: snapshot, listing_locked: true }))).toMatchObject({ state: 'Retirée par la modération' });
    expect(reportContent(row({ target_snapshot: snapshot, listing_status: null }))).toMatchObject({ state: 'Supprimée par son auteur' });
    expect(reportContent(row({ target_snapshot: null }))).toMatchObject({ title: 'Annonce sans titre', line: '', description: null });
  });

  it('message : le texte copié, même supprimé depuis ; une pièce jointe garde son aperçu', () => {
    const text = { sender_id: PAUL, kind: 'text', content: { text: { _0: 'Virement avant la visite svp' } } };
    expect(reportContent(row({ target_type: 'message', target_snapshot: text, message_exists: true })))
      .toEqual({ kind: 'message', text: 'Virement avant la visite svp', deleted: false });
    expect(reportContent(row({ target_type: 'message', target_snapshot: text }))).toMatchObject({ deleted: true });
    const photo = { content: { attachments: { _0: [{ id: 'p1', kind: 'photo', storagePath: 'a/b.jpg', fileName: 'b.jpg', byteCount: 10 }] } } };
    expect(reportContent(row({ target_type: 'message', target_snapshot: photo }))).toMatchObject({ text: '📷 Photo' });
    expect(reportContent(row({ target_type: 'message', target_snapshot: null }))).toMatchObject({ text: 'Message non copié' });
  });

  it('compte : son nom ; conversation : les messages copiés avec leurs auteurs', () => {
    expect(reportContent(row({ target_type: 'user' }))).toEqual({ kind: 'user', name: 'Paul M.' });
    expect(reportContent(row({ target_type: 'user', person_name: null }))).toEqual({ kind: 'user', name: 'Compte supprimé' });
    const thread = row({
      target_type: 'conversation',
      target_snapshot: [{ sender_id: PAUL, preview: 'Bonjour' }, { sender_id: 'inconnu', preview: '' }],
      names: { [PAUL]: 'Paul M.' },
    });
    expect(reportContent(thread)).toEqual({ kind: 'conversation', lines: [{ name: 'Paul M.', text: 'Bonjour' }, { name: 'Un membre', text: '…' }] });
  });

  it('gestes : ceux qui vont avec ce qui est signalé, jamais deux fois', () => {
    expect(reportActions(row({}))).toEqual(['remove_listing', 'suspend_user', 'dismiss']);
    expect(reportActions(row({ listing_locked: true }))).toEqual(['suspend_user', 'dismiss']);
    expect(reportActions(row({ listing_status: null, person_name: null }))).toEqual(['dismiss']);
    expect(reportActions(row({ target_type: 'message', message_exists: true }))).toEqual(['delete_message', 'suspend_user', 'dismiss']);
    expect(reportActions(row({ target_type: 'message', person_suspended: true }))).toEqual(['unsuspend_user', 'dismiss']);
    expect(reportActions(row({ target_type: 'user' }))).toEqual(['suspend_user', 'dismiss']);
    // Groupe : la personne se choisit parmi les auteurs des messages copiés.
    const group = row({ target_type: 'conversation', person_id: null, person_name: null, names: { [PAUL]: 'Paul M.', [LINA]: 'Lina R.' } });
    expect(reportActions(group)).toEqual(['suspend_user', 'dismiss']);
    expect(groupMembers(group)).toEqual([{ id: LINA, name: 'Lina R.' }, { id: PAUL, name: 'Paul M.' }]);
    expect(reportActions({ ...group, names: {} })).toEqual(['dismiss']);
    // Traité : seulement lever une suspension.
    expect(reportActions(row({ status: 'reviewed' }))).toEqual([]);
    expect(reportActions(row({ status: 'reviewed', person_suspended: true }))).toEqual(['unsuspend_user']);
    expect(groupMembers(row({ target_type: 'conversation', names: { [PAUL]: 'Paul M.' } }))).toEqual([]);
  });

  it('dates en heure de Paris, retard au-delà de 24 heures, dernier geste', () => {
    expect(reportDate('2026-11-15T11:04:00Z')).toBe('15 nov. à 12:04');
    expect(reportDate('pas une date')).toBe('');
    const now = new Date('2026-11-16T11:05:00Z');
    expect(isLate(row({}), now)).toBe(true);
    expect(isLate(row({}), new Date('2026-11-16T11:03:00Z'))).toBe(false);
    expect(isLate(row({ status: 'reviewed' }), now)).toBe(false);
    expect(actionLine(row({}))).toBeNull();
    expect(actionLine(row({ status: 'reviewed', last_action: 'remove_listing', last_action_at: '2026-11-15T12:30:00Z' })))
      .toBe('Annonce retirée le 15 nov. à 13:30');
    expect(actionLine(row({ status: 'reviewed' }))).toBe('Traité avec un autre signalement');
    expect(actionLine(row({ status: 'dismissed' }))).toBe('Classé sans suite');
  });

  it('confirmations : rouge quand on retire, supprime ou suspend', () => {
    expect(confirmation('suspend_user', 'Paul M.')).toMatchObject({ title: 'Suspendre le compte de Paul M. ?', danger: true });
    expect(confirmation('remove_listing', null).danger).toBe(true);
    expect(confirmation('delete_message', null).danger).toBe(true);
    expect(confirmation('unsuspend_user', null)).toMatchObject({ title: 'Lever la suspension ?', danger: false });
    expect(confirmation('dismiss', null).danger).toBe(false);
  });
});

describe('appels au serveur', () => {
  it('la ligne « Signalements » : seulement si le serveur dit oui', async () => {
    server.rpc.is_moderator = { data: true, error: null };
    await loadModerator('u1');
    expect(moderatorStore.get()).toBe(true);
    await loadModerator('u1');
    expect(server.calls.filter((call) => call.name === 'is_moderator')).toHaveLength(1);
    server.rpc.is_moderator = { data: null, error: { message: 'boom' } };
    await loadModerator('u2');
    expect(moderatorStore.get()).toBe(false);
    await loadModerator(null);
    expect(moderatorStore.get()).toBe(false);
  });

  it('liste et gestes : les bons arguments, les refus du serveur en français', async () => {
    server.rpc.moderation_reports = { data: [row({})], error: null };
    expect(await fetchReports(true)).toHaveLength(1);
    expect(server.calls.at(-1)).toEqual({ name: 'moderation_reports', params: { p_closed: true } });
    const reserved = { code: 'P0001', message: 'Cette page est réservée à la modération de Nidalo.', hint: 'moderation_reservee' };
    server.rpc.moderation_reports = { data: null, error: reserved };
    await expect(fetchReports(false)).rejects.toBe(reserved);
    expect(isReserved(reserved)).toBe(true);
    expect(isReserved({ code: 'P0001' })).toBe(false);

    expect(await resolveReport('r1', 'suspend_user', PAUL)).toBeNull();
    expect(server.calls.at(-1)).toEqual({ name: 'moderation_resolve', params: { p_report_id: 'r1', p_action: 'suspend_user', p_user_id: PAUL } });
    server.rpc.moderation_resolve = { data: null, error: { code: 'P0001', message: 'Ce compte ne peut pas être suspendu.', hint: 'moderation_geste_invalide' } };
    expect(await resolveReport('r1', 'suspend_user')).toBe('Ce compte ne peut pas être suspendu.');
    server.rpc.moderation_resolve = { data: null, error: { code: '42501', message: 'permission denied' } };
    expect(await resolveReport('r1', 'dismiss')).toBe(ACTION_FAILURE);
    expect(moderationFailure(new TypeError('Failed to fetch'), ACTION_FAILURE)).toMatch(/^Connexion impossible/);
  });
});

describe('message du filtre de mots interdits', () => {
  it('montré tel quel, seulement pour ce refus', () => {
    expect(bannedWordMessage(BANNED)).toBe(BANNED.message);
    expect(bannedWordMessage({ code: 'P0001', message: 'Autre refus' })).toBeNull();
    expect(databaseMessage(BANNED)).toBe(BANNED.message);
    expect(databaseMessage({ code: '23514' })).toBe(REFUSED_MESSAGE);
  });

  it('messagerie : le texte refusé revient avec le message du serveur', async () => {
    server.insertError = BANNED;
    expect(await sendText('c1000000-0000-4000-8000-000000000001', 'Texte refusé')).toEqual({ sent: false, refusal: BANNED.message });
    const photo = [{ id: 'p1', kind: 'photo' as const, storagePath: 'a/b.jpg', fileName: 'b.jpg', byteCount: 10 }];
    expect(await sendAttachments('c1000000-0000-4000-8000-000000000001', photo, 'Légende refusée')).toEqual({ sent: false, refusal: BANNED.message });
    server.insertError = { code: '500', message: 'panne' };
    expect(await sendText('c1000000-0000-4000-8000-000000000001', 'Bonjour')).toEqual({ sent: false, refusal: null });
    expect(await sendText('c1000000-0000-4000-8000-000000000001', '   ')).toEqual({ sent: false, refusal: null });
  });
});

describe('compte relié à Apple', () => {
  it('lu dans app_metadata, comme Supabase l\'écrit', () => {
    expect(usesApple({ app_metadata: { provider: 'apple' } })).toBe(true);
    expect(usesApple({ app_metadata: { provider: 'email', providers: ['email', 'apple'] } })).toBe(true);
    expect(usesApple({ app_metadata: { provider: 'google', providers: ['google'] } })).toBe(false);
    expect(usesApple(null)).toBe(false);
  });
});
