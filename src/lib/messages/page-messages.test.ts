import { describe, expect, it } from 'vitest';
import type { Message } from './api';
import { daySeparatorLabel, floatingDayLabel, keepNumbersTogether, lastSeenLabel, rowTimeLabel, visitCardDate, visitLongDate, visitRowDate } from './format';
import { avatarPalette, conversationFrom, matchesListSearch, type ProfileRow, type ServerInboxRow } from './inbox';
import { lotsLabel } from './listingBar';
import { siteThreadDays } from './thread';
import {
  acceptLabel, answerableRequest, latestRequestAfter, requestCardTitle, requestDateShort, requestDateWide, requestOutcome, requestPreview,
  requestsIn, visitRequestFrom, type ConversationVisitRequest,
} from './visitRequests';

// Page Messages du site (demande de Romain du 14 novembre 2026) : libellés de la liste et du fil, avatars, recherche,
// barre de l'annonce et demandes de visite (données inventées).

const ME = 'a0000000-0000-4000-8000-0000000000c1';
const AGENT = 'a0000000-0000-4000-8000-0000000000e1';
const LISTING = 'b0000000-0000-4000-8000-000000000001';
const NOW = new Date(2026, 10, 13, 15, 0); // vendredi 13 novembre 2026, 15:00

const PROFILES = new Map<string, ProfileRow>([
  [AGENT, { user_id: AGENT, public_name: 'Sophie D.', avatar_path: null, account_type: 'professional', agency_name: 'Agence Démo Lyon', agency_city: 'Lyon', agency_phone: null }],
]);

function conversation(overrides: Partial<ServerInboxRow> = {}) {
  const row: ServerInboxRow = {
    conversation_id: 'c1000000-0000-4000-8000-000000000001', kind: 'listing', listing_id: LISTING,
    listing_snapshot: { listingId: LISTING, title: 'Immeuble – Vulbens', price: 690000, transaction: 'sale', city: 'Vulbens', coverPath: null },
    buyer_id: ME, seller_id: AGENT, created_at: '2026-11-01T09:00:00Z', other_user_id: AGENT, member_count: 2, unread_count: 0,
    ...overrides,
  };
  return conversationFrom(row, { me: ME, profiles: PROFILES, participants: [], communities: [] });
}

type Row = Parameters<typeof visitRequestFrom>[0];

function requestRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'e1000000-0000-4000-8000-000000000001', listing_id: LISTING, listing_snapshot: { listingId: LISTING, title: 'Immeuble – Vulbens' },
    requester: { userId: AGENT.toUpperCase(), name: 'Lucas G.', kind: 'individual' },
    recipient: { userId: ME, name: 'Claire M.', kind: 'individual' },
    slots: [
      { id: 'f1', start: new Date(2026, 10, 14, 10, 0).toISOString(), durationMinutes: 30 },
      { id: 'f2', start: new Date(2026, 10, 17, 18, 30).toISOString(), durationMinutes: 30 },
    ],
    mode: 'onSite', status: 'pending', accepted_slot: null, proposed_slots: null, created_at: new Date(2026, 10, 13, 14, 10).toISOString(),
    my_role: 'recipient', allowed_actions: ['accept', 'decline', 'propose'],
    ...overrides,
  };
}

const request = (overrides: Partial<Row> = {}) => visitRequestFrom(requestRow(overrides)) as ConversationVisitRequest;

function message(id: string, createdAt: Date, senderId: string | null = AGENT, kind: 'text' | 'system' = 'text'): Message {
  const content = kind === 'system' ? { kind: 'system' as const, text: 'Groupe créé' } : { kind: 'text' as const, text: 'Bonjour' };
  return {
    id, conversationId: 'c1', senderId, clientId: id, content, createdAt, expiresAt: null, reaction: null, reactions: [], isRead: false,
    replyToId: null, isForwarded: false, raw: null,
  };
}

describe('Libellés de temps de la page Messages', () => {
  it('heure de la liste : l’heure aujourd’hui, « Hier », le jour dans la semaine, puis la date', () => {
    expect(rowTimeLabel(new Date(2026, 10, 13, 14, 10), NOW)).toBe('14:10');
    expect(rowTimeLabel(new Date(2026, 10, 12, 23, 0), NOW)).toBe('Hier');
    expect(rowTimeLabel(new Date(2026, 10, 11, 8, 0), NOW)).toBe('Mer.');
    expect(rowTimeLabel(new Date(2026, 10, 3, 8, 0), NOW)).toBe('3 novembre');
    expect(rowTimeLabel(new Date(2025, 11, 24, 8, 0), NOW)).toBe('24 décembre 2025');
  });

  it('séparateurs du fil : « Aujourd’hui », « Hier », puis « Mer. 12 nov. »', () => {
    expect(daySeparatorLabel(new Date(2026, 10, 13, 1, 0), NOW)).toBe('Aujourd\'hui');
    expect(daySeparatorLabel(new Date(2026, 10, 12, 18, 0), NOW)).toBe('Hier');
    expect(daySeparatorLabel(new Date(2026, 10, 11, 18, 0), NOW)).toBe('Mercredi 11 novembre');
    expect(daySeparatorLabel(new Date(2025, 10, 12, 18, 0), NOW)).toBe('Mercredi 12 novembre');
    // Pastille flottante : le jour de la semaine jusqu'à une semaine, puis la date (et l'année d'une autre année).
    expect(floatingDayLabel(new Date(2026, 10, 13, 9, 0), NOW)).toBe('Aujourd\'hui');
    expect(floatingDayLabel(new Date(2026, 10, 11, 9, 0), NOW)).toBe('Mercredi');
    expect(floatingDayLabel(new Date(2026, 10, 2, 9, 0), NOW)).toBe('Lundi 2 novembre');
    expect(floatingDayLabel(new Date(2025, 10, 12, 9, 0), NOW)).toBe('Mercredi 12 novembre 2025');
  });

  it('dates de visite de l’app (VisitDate)', () => {
    const start = new Date(2026, 10, 21, 10, 0);
    expect(visitCardDate(start)).toBe('Sam. 21 nov. · 10\u00a0h\u00a000');
    expect(visitRowDate(start)).toBe('sam. 21 nov. à 10\u00a0h');
    expect(visitRowDate(new Date(2026, 10, 21, 10, 30))).toBe('sam. 21 nov. à 10\u00a0h\u00a030');
    expect(visitLongDate(new Date(2026, 10, 19, 18, 0))).toBe('Jeudi 19 novembre · 18\u00a0h\u00a000');
  });

  it('« Vu il y a … » sous le nom', () => {
    expect(lastSeenLabel(new Date(2026, 10, 13, 14, 59, 30), NOW)).toBe('Vu à l\'instant');
    expect(lastSeenLabel(new Date(2026, 10, 13, 14, 55), NOW)).toBe('Vu il y a 5 min');
    expect(lastSeenLabel(new Date(2026, 10, 13, 12, 40), NOW)).toBe('Vu il y a 2 h');
    expect(lastSeenLabel(new Date(2026, 10, 12, 18, 42), NOW)).toBe('Vu hier à 18:42');
    expect(lastSeenLabel(new Date(2026, 10, 10, 9, 0), NOW)).toBe('Vu le 10 nov.');
  });

  it('montants sans coupure : espaces insécables dans les nombres', () => {
    expect(keepNumbersTogether('61 800 € de loyers')).toBe('61\u00a0800\u00a0€ de loyers');
    expect(keepNumbersTogether('1 250 000 € et 24,7 %')).toBe('1\u00a0250\u00a0000\u00a0€ et 24,7\u00a0%');
    expect(keepNumbersTogether('les 3 lots')).toBe('les 3 lots');
  });
});

describe('Liste des conversations', () => {
  it('avatar sans photo : la couleur de l’interlocuteur, comme l’app (agence, particulier, groupe)', () => {
    expect(avatarPalette('agency')).toEqual({ background: 'var(--green-soft)', color: 'var(--green)' });
    expect(avatarPalette('individual')).toEqual({ background: '#F9E7DD', color: '#9A6A3C' });
    expect(avatarPalette('group')).toEqual(avatarPalette('community'));
  });

  it('recherche : nom de l’interlocuteur ou titre de l’annonce, pas le texte des messages', () => {
    const item = conversation({ last_message_preview: 'Bonjour Claire' });
    expect(matchesListSearch(item, '')).toBe(true);
    expect(matchesListSearch(item, 'agence')).toBe(true);
    expect(matchesListSearch(item, 'vulbens')).toBe(true);
    expect(matchesListSearch(item, 'bonjour')).toBe(false);
  });

  it('barre de l’annonce : lots seulement à partir de deux', () => {
    expect(lotsLabel(['leased'])).toBeNull();
    expect(lotsLabel(['leased', 'leased', 'leased'])).toBe('3 lots loués');
    expect(lotsLabel(['leased', 'vacant'])).toBe('2 lots dont 1 loué');
    expect(lotsLabel(['leased', 'leased', 'vacant'])).toBe('3 lots dont 2 loués');
    expect(lotsLabel(['vacant', 'vacant'])).toBe('2 lots');
  });
});

describe('Demandes de visite dans la conversation', () => {
  it('ligne du serveur lue telle quelle, illisible écartée', () => {
    const item = request();
    expect(item.allowedActions).toEqual(['accept', 'decline', 'propose']);
    expect(item.myRole).toBe('recipient');
    expect(item.listingTitle).toBe('Immeuble – Vulbens');
    expect(visitRequestFrom(requestRow({ status: 'unknown' as never }))).toBeNull();
    expect(visitRequestFrom(requestRow({ created_at: 'pas une date' }))).toBeNull();
  });

  it('rattachée à la conversation de la même annonce et des deux mêmes personnes', () => {
    const item = request();
    expect(requestsIn([item], conversation())).toHaveLength(1);
    expect(requestsIn([item], conversation({ listing_id: 'autre', listing_snapshot: { listingId: 'autre', title: 'Autre' } }))).toHaveLength(0);
    expect(requestsIn([item], conversation({ seller_id: 'a0000000-0000-4000-8000-0000000000e9', other_user_id: 'a0000000-0000-4000-8000-0000000000e9' }))).toHaveLength(0);
  });

  it('carte : titre, date, issue à la place des boutons', () => {
    const start = new Date(2026, 10, 14, 10, 0);
    expect(requestDateWide(start)).toBe('Samedi 14 novembre · 10:00');
    expect(requestDateShort(start)).toBe('sam. 14 nov. à 10:00');
    expect(requestCardTitle(request())).toBe('Demande de visite');
    expect(requestCardTitle(request({ status: 'counterProposed' }))).toBe('Autre créneau proposé');
    expect(requestOutcome(request())).toBeNull();
    expect(requestOutcome(request({ status: 'accepted' }))).toEqual({ text: 'Visite confirmée', confirmed: true });
    expect(requestOutcome(request({ status: 'declined' }))).toEqual({ text: 'Visite refusée', confirmed: false });
    expect(requestOutcome(request({ status: 'cancelled' }))).toEqual({ text: 'Visite annulée', confirmed: false });
    expect(requestPreview(request())).toBe('Demande de visite · sam. 14 nov. à 10:00');
  });

  it('aperçu de la liste : seulement si la demande est plus récente que le dernier message', () => {
    const item = request();
    expect(latestRequestAfter([item], null)).toBe(item);
    expect(latestRequestAfter([item], new Date(2026, 10, 13, 14, 0))).toBe(item);
    expect(latestRequestAfter([item], new Date(2026, 10, 13, 14, 30))).toBeNull();
  });

  it('réponse rapide : « Oui, samedi 10 h », sur la dernière demande à laquelle je peux répondre', () => {
    expect(acceptLabel(new Date(2026, 10, 14, 10, 0), NOW)).toBe('Oui, samedi 10\u00a0h');
    expect(acceptLabel(new Date(2026, 10, 13, 18, 30), NOW)).toBe('Oui, aujourd\'hui 18\u00a0h\u00a030');
    expect(acceptLabel(new Date(2026, 10, 24, 9, 0), NOW)).toBe('Oui, mar. 24 nov. 9\u00a0h');
    const mine = request({ my_role: 'requester', allowed_actions: ['cancel'] });
    const theirs = request({ id: 'e1000000-0000-4000-8000-000000000002' });
    expect(answerableRequest([theirs, mine])).toBe(theirs);
    expect(answerableRequest([mine])).toBeNull();
    expect(answerableRequest([request({ status: 'accepted', allowed_actions: ['propose', 'cancel'] })])).toBeNull();
  });

  it('fil : messages et demandes dans l’ordre du temps, séries par expéditeur', () => {
    const days = siteThreadDays([
      message('a', new Date(2026, 10, 12, 18, 50), ME),
      message('b', new Date(2026, 10, 12, 18, 53)),
      message('c', new Date(2026, 10, 13, 14, 9)),
      message('d', new Date(2026, 10, 13, 14, 20), ME),
    ], [request()], NOW);
    expect(days.map((day) => day.label)).toEqual(['Hier', 'Aujourd\'hui']);
    expect(days[1].rows.map((row) => `${row.item.key}${row.startsGroup ? '<' : ''}${row.endsGroup ? '>' : ''}`))
      .toEqual(['c<', 'visite-e1000000-0000-4000-8000-000000000001>', 'd<>']);
    const withSystem = siteThreadDays([message('s', new Date(2026, 10, 13, 9, 0), AGENT, 'system'), message('t', new Date(2026, 10, 13, 9, 1))], [], NOW);
    expect(withSystem[0].rows.map((row) => `${row.startsGroup}${row.endsGroup}`)).toEqual(['truetrue', 'truetrue']);
  });
});
