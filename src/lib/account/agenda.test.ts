import { describe, expect, it } from 'vitest';
import {
  agendaErrorMessage, agendaSummary, CONVERSATION_NOT_FOUND, countIn, DEFAULT_REMINDERS, defaultVisitStart, directionsUrl,
  existingConversationId, groupKind, groupsIn, groupTitle, isDuplicate, isVideoVisit, itemsIn, newVisitRow, noAddressNotice, noSellerNotice,
  PERIOD_TITLES, periodGroupsIn, periodOf, receivedRequest, reminderLabel, remindersSummary, requestEntries, sessionBookedLabel,
  sessionFromRow, sessionTitle, upcomingSessions, upcomingSessionsOf, upcomingVisitForListing, visitAddressFor, visitCardTitle,
  visitContactFor, visitDateBlock, visitFromRow, visitPersonLine, visitSlotCount, visitTimeRange, type AgendaInboxRow, type AgendaItem,
  type AgendaRequestRow, type NewVisit, type VisitListing, type VisitSessionRow,
} from './agenda';

const ME = 'a0000000-0000-4000-8000-0000000000c1';
const OTHER = 'b0000000-0000-4000-8000-0000000000d2';
const NOW = new Date(2026, 10, 7, 9, 0); // samedi 7 novembre 2026, 9 h (heure locale)

function item(id: string, start: Date, change: Partial<AgendaItem> = {}): AgendaItem {
  return {
    id, conversationId: null, linkedConversationId: null, requestId: null, listing: null, start, durationMinutes: 60, contactName: null,
    address: null, status: 'confirmed', reportSummary: null, ...change,
  };
}

const at = (days: number, hours: number) => new Date(2026, 10, 7 + days, hours, 0);

// Mêmes cas que VisitAgendaTests (ImmoDomainTests) : mercredi 22 octobre 2026, 10 h, durée inconnue (une heure).
describe('Mon agenda : périodes de l’app (VisitAgenda.periodGroups)', () => {
  const now = new Date(2026, 9, 22, 10, 0);
  const on = (day: number, hour: number) => new Date(2026, 9, day, hour, 0);
  const sample = [
    item('aujourdhui', on(22, 18), { durationMinutes: null }),
    item('demain', on(23, 9), { status: 'awaitingOther', durationMinutes: null }),
    item('semaine', on(25, 10), { status: 'toConfirm', durationMinutes: null }),
    item('plus-tard', on(30, 14), { durationMinutes: null }),
    item('ce-matin', on(22, 9), { durationMinutes: 30 }),
    item('hier', on(21, 17), { durationMinutes: null }),
    item('plus-tot', on(10, 11), { durationMinutes: null }),
    item('annulee', on(24, 15), { status: 'cancelled', durationMinutes: null }),
  ];

  it('à venir : « Cette semaine » (aujourd’hui compris), puis « Plus tard »', () => {
    expect(periodGroupsIn(sample, 'upcoming', now).map((g) => [g.period, g.items.map((v) => v.id)])).toEqual([
      ['thisWeek', ['aujourdhui', 'demain', 'semaine']], ['later', ['plus-tard']],
    ]);
  });

  it('passées : « Ce mois-ci », puis « Plus anciennes »', () => {
    const visits = [...sample, item('premier', on(1, 10), { durationMinutes: null }), item('septembre', new Date(2026, 8, 28, 10), { durationMinutes: null })];
    const groups = periodGroupsIn(visits, 'past', now);
    expect(groups.map((g) => g.period)).toEqual(['thisMonth', 'older']);
    expect(groups[1].items.map((v) => v.id)).toEqual(['septembre']);
  });

  it('limites des périodes, et leurs titres', () => {
    expect(periodOf(on(22, 8), now)).toBe('thisWeek');
    expect(periodOf(on(28, 23), now)).toBe('thisWeek');
    expect(periodOf(on(29, 0), now)).toBe('later');
    expect(periodOf(on(21, 23), now)).toBe('thisMonth');
    expect(periodOf(new Date(2025, 9, 22, 9), now)).toBe('older');
    expect(periodOf(on(22, 9), now, 'past')).toBe('thisMonth');
    // Annulée, à venir : rangée comme les visites à venir.
    expect(periodGroupsIn(sample, 'cancelled', now).map((g) => g.period)).toEqual(['thisWeek']);
    expect(Object.values(PERIOD_TITLES)).toEqual(['Cette semaine', 'Plus tard', 'Ce mois-ci', 'Plus anciennes']);
  });
});

// Carte d'une visite (VisitCard, VisitsAgendaView.swift).
describe('Mon agenda : carte d’une visite', () => {
  it('horaire : « 18 h 00 – 18 h 45 », l’heure de début seule sans durée', () => {
    expect(visitTimeRange(item('a', new Date(2026, 10, 6, 18, 0), { durationMinutes: 45 }))).toBe('18 h 00 – 18 h 45');
    expect(visitTimeRange(item('b', new Date(2026, 10, 9, 9, 5), { durationMinutes: 60 }))).toBe('9 h 05 – 10 h 05');
    expect(visitTimeRange(item('c', new Date(2026, 10, 9, 14, 30), { durationMinutes: null }))).toBe('14 h 30');
  });

  it('bloc date : jour et mois abrégés, sans point, en capitales', () => {
    expect(visitDateBlock(new Date(2026, 10, 6, 14, 30))).toEqual({ weekday: 'VEN', day: '6', month: 'NOV' });
    expect(visitDateBlock(new Date(2027, 1, 15, 9, 0))).toEqual({ weekday: 'LUN', day: '15', month: 'FÉVR' });
    expect(visitDateBlock(new Date(2026, 5, 3, 9, 0))).toEqual({ weekday: 'MER', day: '3', month: 'JUIN' });
  });

  it('bien : titre et ville ; « Visite » sans bien', () => {
    const listing = { listingId: 'l', title: 'Studio meublé', price: 0, transaction: 'rent' as const, city: 'Lyon 7e', coverImageURL: null };
    expect(visitCardTitle({ listing })).toBe('Studio meublé · Lyon 7e');
    expect(visitCardTitle({ listing: { ...listing, city: '' } })).toBe('Studio meublé');
    expect(visitCardTitle({ listing: null })).toBe('Visite');
  });

  it('personne : le contact, l’agence si elle diffère, « en attente de sa réponse » pour une demande envoyée', () => {
    const visit = item('v', new Date(2026, 10, 9, 9, 0), { contactName: 'Sophie Martin' });
    expect(visitPersonLine(visit, 'confirmed', null, null)).toBe('Avec Sophie Martin');
    expect(visitPersonLine(visit, 'confirmed', null, 'Agence Bellecour')).toBe('Avec Sophie Martin · Agence Bellecour');
    expect(visitPersonLine({ ...visit, contactName: 'Agence Bellecour' }, 'confirmed', null, 'Agence Bellecour')).toBe('Avec Agence Bellecour');
    expect(visitPersonLine({ ...visit, contactName: null }, 'confirmed', null, 'Agence Bellecour')).toBe('Avec Agence Bellecour');
    expect(visitPersonLine({ ...visit, contactName: null }, 'confirmed', null, null)).toBeNull();
    // Visite enregistrée en attente : pas de « en attente de sa réponse » (seulement une demande).
    expect(visitPersonLine(visit, 'awaitingOther', null, null)).toBe('Avec Sophie Martin');
    const request = { ...visit, requestId: 'v' };
    expect(visitPersonLine(request, 'awaitingOther', null, null)).toBe('Avec Sophie Martin · en attente de sa réponse');
    expect(visitPersonLine(request, 'toConfirm', 3, null)).toBe('Avec Sophie Martin · en attente de sa réponse');
    expect(visitPersonLine({ ...request, contactName: null }, 'toConfirm', 3, null)).toBe('en attente de sa réponse');
  });

  it('créneaux : seulement une demande pas annulée qui en propose plusieurs', () => {
    const slots = [1, 2, 3].map((n) => ({ id: `S${n}`, start: `2026-11-1${n}T09:00:00.000`, durationMinutes: 45 }));
    const request = { id: 'R', status: 'pending', slots, proposed_slots: null } as unknown as AgendaRequestRow;
    const entry = item('R', new Date(2026, 10, 11, 10, 0), { requestId: 'R', status: 'awaitingOther' });
    expect(visitSlotCount(entry, [request])).toBe(3);
    expect(visitSlotCount({ ...entry, status: 'cancelled' }, [request])).toBeNull();
    expect(visitSlotCount(entry, [{ ...request, slots: slots.slice(0, 1) } as AgendaRequestRow])).toBeNull();
    expect(visitSlotCount(item('V', new Date(2026, 10, 11, 10, 0)), [request])).toBeNull();
  });
});

describe('Mon agenda : onglets, ordre et groupes (VisitAgenda)', () => {
  const visits = [
    item('a', at(3, 10)), item('b', at(0, 14), { status: 'awaitingOther' }), item('c', at(-2, 10)), item('d', at(9, 10), { status: 'toConfirm' }),
    item('e', at(1, 10), { status: 'cancelled' }), item('f', at(-12, 10)), item('g', at(0, 8), { durationMinutes: 90 }),
  ];

  it('à venir : non annulées pas encore terminées, les plus proches d’abord (une visite en cours reste à venir)', () => {
    expect(itemsIn(visits, 'upcoming', NOW).map((v) => v.id)).toEqual(['g', 'b', 'a', 'd']);
  });

  it('passées et annulées : les plus récentes d’abord', () => {
    expect(itemsIn(visits, 'past', NOW).map((v) => v.id)).toEqual(['c', 'f']);
    expect(itemsIn(visits, 'cancelled', NOW).map((v) => v.id)).toEqual(['e']);
    expect([countIn(visits, 'upcoming', NOW), countIn(visits, 'past', NOW), countIn(visits, 'cancelled', NOW)]).toEqual([4, 2, 1]);
  });

  it('groupes par jour, dans l’ordre d’affichage', () => {
    expect(groupsIn(visits, 'upcoming', NOW).map((g) => [g.kind, g.items.map((v) => v.id)])).toEqual([
      ['today', ['g', 'b']], ['thisWeek', ['a']], ['later', ['d']],
    ]);
    expect(groupsIn(visits, 'past', NOW).map((g) => g.kind)).toEqual(['thisWeek', 'earlier']);
    expect([groupKind(at(1, 23), NOW), groupKind(at(-1, 0), NOW), groupKind(at(6, 23), NOW), groupKind(at(7, 0), NOW), groupKind(at(-7, 12), NOW)])
      .toEqual(['tomorrow', 'yesterday', 'thisWeek', 'later', 'earlier']);
    expect([groupTitle('thisWeek', 'upcoming'), groupTitle('thisWeek', 'past'), groupTitle('today', 'upcoming')])
      .toEqual(['Cette semaine', 'Ces 7 derniers jours', 'Aujourd\'hui']);
  });

  it('carte « Mon agenda » : nombre à venir, à confirmer, prochaine visite', () => {
    expect(agendaSummary([], NOW).title).toBe('Votre agenda est libre');
    const summary = agendaSummary(visits, NOW);
    expect(summary.title).toBe('4 visites à venir');
    expect(summary.toConfirm).toBe(1);
    expect(summary.next?.id).toBe('g');
    expect(agendaSummary([item('a', at(3, 10))], NOW).title).toBe('1 visite à venir');
  });

  it('itinéraire : lien Plans de l’app', () => {
    expect(directionsUrl('12 rue de la Paix, 69002 Lyon')).toBe('https://maps.apple.com/?daddr=12%20rue%20de%20la%20Paix%2C%2069002%20Lyon');
  });
});

describe('Mon agenda : lignes de agenda_visits', () => {
  it('le JSON de la visite fait foi ; date en UTC sans fuseau ; ligne illisible écartée', () => {
    const read = visitFromRow({
      id: 'v1', start_at: '2026-11-13T09:00:00', status: 'confirmed', request_id: null, listing_id: null,
      visit: { start: '2026-11-13T09:00:00.000', status: 'awaitingOther', contactName: 'Agence du Parc', report: { opinion: 'loved', decision: 'makeOffer' },
        listing: { listingId: 'L1', title: 'Appartement 3 pièces', price: 320000, transaction: 'sale', city: 'Lyon', coverImageURL: 'file:///photo.jpg' } },
    } as never);
    expect(read?.start.toISOString()).toBe('2026-11-13T09:00:00.000Z');
    expect(read?.status).toBe('awaitingOther');
    expect(read?.reportSummary).toBe('Coup de cœur · Faire une offre');
    expect(read?.listing?.coverImageURL).toBeNull();
    expect(visitFromRow({ id: 'v2', start_at: 'demain', status: 'confirmed', request_id: null, listing_id: null, visit: {} } as never)).toBeNull();
  });
});

describe('Mon agenda : demandes de visite (AgendaRequests)', () => {
  const base: AgendaRequestRow = {
    id: 'r1', listing_id: 'L1', listing_snapshot: { listingId: 'L1', title: 'Maison 5 pièces', price: 450000, transaction: 'sale', city: 'Gex' },
    requester: { userId: ME, name: 'Claire M.', kind: 'individual' }, recipient: { userId: OTHER, name: 'Agence du Lac', kind: 'agency' },
    slots: [
      { id: 's1', start: at(4, 10).toISOString(), durationMinutes: 60 },
      { id: 's2', start: at(2, 15).toISOString(), durationMinutes: 45 },
    ],
    mode: 'onSite', status: 'pending', accepted_slot: null, proposed_slots: [], created_at: at(-1, 9).toISOString(), meeting_place: null,
  };

  it('demande envoyée : « En attente », au premier créneau à venir, avec l’autre personne', () => {
    const [entry] = requestEntries([base], ME, [], NOW);
    expect(entry.status).toBe('awaitingOther');
    expect(entry.start.getTime()).toBe(at(2, 15).getTime());
    expect(entry.durationMinutes).toBe(45);
    expect(entry.contactName).toBe('Agence du Lac');
    expect(entry.address).toBe('Gex');
    expect(entry.requestId).toBe('r1');
  });

  it('demande reçue : « À confirmer » ; contre-proposition de l’autre : « À confirmer » ; la sienne : « En attente »', () => {
    expect(requestEntries([base], OTHER, [], NOW)[0].status).toBe('toConfirm');
    const counter = { ...base, status: 'counterProposed' as const, proposed_slots: [{ id: 's3', start: at(5, 9).toISOString(), durationMinutes: 30 }] };
    expect(requestEntries([{ ...counter, proposed_by: 'recipient' }], ME, [], NOW)[0].status).toBe('toConfirm');
    expect(requestEntries([{ ...counter, proposed_by: 'requester' }], ME, [], NOW)[0].status).toBe('awaitingOther');
    expect(requestEntries([{ ...counter, proposed_by: 'recipient' }], ME, [], NOW)[0].start.getTime()).toBe(at(5, 9).getTime());
  });

  it('refusée ou annulée : « Annulée » ; acceptée, déjà dans l’agenda ou d’un autre compte : absente ; visio', () => {
    expect(requestEntries([{ ...base, status: 'declined' }], ME, [], NOW)[0].status).toBe('cancelled');
    expect(requestEntries([{ ...base, status: 'accepted', accepted_slot: base.slots[0] }], ME, [], NOW)).toEqual([]);
    expect(requestEntries([base], ME, [item('v', at(2, 15), { requestId: 'R1' })], NOW)).toEqual([]);
    expect(requestEntries([base], 'c0000000-0000-4000-8000-000000000099', [], NOW)).toEqual([]);
    expect(requestEntries([{ ...base, mode: 'video' }], ME, [], NOW)[0].address).toBe('En visio');
  });

  it('carte « Mon agenda » : prochaine visite d’une demande « en attente »', () => {
    const summary = agendaSummary(requestEntries([base], ME, [], NOW), NOW);
    expect(summary.nextIsPending).toBe(true);
  });
});

describe('Mon agenda : itinéraire, message et propriétaire (n° 178, 11, 74)', () => {
  const rental: VisitListing = { listingId: 'L2', title: 'T2 meublé', price: 850, transaction: 'rent', city: 'Annecy', coverImageURL: null };
  const sale: VisitListing = { ...rental, listingId: 'L3', transaction: 'sale', price: 320000 };
  const request: AgendaRequestRow = {
    id: 'r9', listing_id: 'L2', listing_snapshot: { listingId: 'L2', title: 'T2 meublé', price: 850, transaction: 'rent', city: 'Annecy' },
    requester: { userId: OTHER, name: 'Claire M.', kind: 'individual' }, recipient: { userId: ME, name: 'Moi', kind: 'individual' },
    slots: [{ id: 's1', start: at(3, 11).toISOString(), durationMinutes: 30 }], mode: 'video', status: 'pending', accepted_slot: null,
    proposed_slots: [], created_at: at(-1, 9).toISOString(), meeting_place: null,
  };

  it('visite en visio : pas d’itinéraire (« En visio », espaces compris)', () => {
    expect(isVideoVisit({ address: 'En visio' })).toBe(true);
    expect(isVideoVisit({ address: '  En visio ' })).toBe(true);
    expect(isVideoVisit({ address: '3 rue Royale, Annecy' })).toBe(false);
    expect(isVideoVisit({ address: null })).toBe(false);
    expect(isVideoVisit(requestEntries([request], ME, [], NOW)[0])).toBe(true);
  });

  it('location : « le propriétaire » ; vente ou sans bien : « le vendeur »', () => {
    expect(noAddressNotice({ listing: rental })).toBe('Adresse non renseignée : l\'itinéraire sera disponible quand le propriétaire l\'aura communiquée.');
    expect(noAddressNotice({ listing: sale })).toBe('Adresse non renseignée : l\'itinéraire sera disponible quand le vendeur l\'aura communiquée.');
    expect(noSellerNotice({ listing: rental })).toBe('Impossible de joindre le propriétaire de ce bien pour l\'instant.');
    expect(noSellerNotice({ listing: null })).toBe('Impossible de joindre le vendeur de ce bien pour l\'instant.');
    expect(CONVERSATION_NOT_FOUND).toBe('Aucune conversation avec cette personne n\'a été trouvée pour cette annonce.');
  });

  it('demande reçue : seulement pour son destinataire (ou l’agent), pas pour le demandeur', () => {
    const [entry] = requestEntries([request], ME, [], NOW);
    expect(receivedRequest(entry, [request], ME)?.id).toBe('r9');
    expect(receivedRequest(entry, [request], OTHER)).toBeNull();
    expect(receivedRequest({ requestId: 'R9' }, [request], ME)?.id).toBe('r9');
    expect(receivedRequest({ requestId: null }, [request], ME)).toBeNull();
    expect(receivedRequest(entry, [request], null)).toBeNull();
    const agent = { ...request, recipient: { userId: 'c0000000-0000-4000-8000-000000000003', name: 'Agence', kind: 'agency' as const }, agent_user_id: ME };
    expect(receivedRequest(entry, [agent], ME)?.id).toBe('r9');
  });

  it('conversation déjà ouverte sur cette annonce avec cette personne, la plus récente (Conversation.existing)', () => {
    const row = (id: string, change: Partial<AgendaInboxRow>): AgendaInboxRow => ({
      conversation_id: id, kind: 'listing', listing_id: 'L2', listing_snapshot: { listingId: 'L2' }, buyer_id: OTHER, seller_id: ME,
      created_at: '2026-10-01T09:00:00Z', last_message_at: null, ...change,
    });
    const old = row('c-ancienne', {});
    const recent = row('c-recente', { last_message_at: '2026-11-05T10:00:00Z' });
    const otherPerson = row('c-autre', { buyer_id: 'c0000000-0000-4000-8000-000000000004', last_message_at: '2026-11-06T10:00:00Z' });
    const otherListing = row('c-autre-bien', { listing_id: 'L3', listing_snapshot: { listingId: 'L3' }, last_message_at: '2026-11-06T10:00:00Z' });
    const group = row('c-groupe', { kind: 'group', last_message_at: '2026-11-06T11:00:00Z' });
    expect(existingConversationId([otherPerson, old, otherListing, recent, group], 'l2', OTHER.toUpperCase())).toBe('c-recente');
    expect(existingConversationId([otherPerson, otherListing, group], 'L2', OTHER)).toBeNull();
    // Le demandeur peut aussi être le vendeur de la conversation (agence qui demande).
    expect(existingConversationId([row('c-vendeur', { buyer_id: ME, seller_id: OTHER })], 'L2', OTHER)).toBe('c-vendeur');
  });
});

describe('Mon agenda : créneaux ouverts (VisitSession, n° 13)', () => {
  const row = (change: Partial<VisitSessionRow> = {}): VisitSessionRow => ({
    id: 'v1', listing_id: 'L1', listing_snapshot: { listingId: 'L1', title: 'Maison 5 pièces', price: 450000, transaction: 'sale', city: 'Gex' },
    starts_at: '2026-11-12T09:00:00+00:00', ends_at: '2026-11-12T11:00:00+00:00', status: 'open', booked_count: 0, total_places: 8, ...change,
  });

  it('ligne de my_visit_sessions : bien de l’instantané, dates (aussi au format brut), séance illisible écartée', () => {
    const session = sessionFromRow(row({ starts_at: '2026-11-12 09:00:00+00', ends_at: '2026-11-12 11:00:00.123456+00' }))!;
    expect(session.start.toISOString()).toBe('2026-11-12T09:00:00.000Z');
    expect(session.end.toISOString()).toBe('2026-11-12T11:00:00.123Z');
    expect(session.listing).toEqual({ listingId: 'L1', title: 'Maison 5 pièces', price: 450000, transaction: 'sale', city: 'Gex', coverImageURL: null });
    expect(sessionFromRow(row({ listing_snapshot: null }))!.listing.title).toBe('Annonce');
    expect(sessionFromRow(row({ booked_count: null, total_places: undefined }))).toMatchObject({ bookedCount: 0, totalPlaces: 0 });
    expect(sessionFromRow(row({ starts_at: 'pas une date' }))).toBeNull();
  });

  it('à venir : ouvertes et pas finies, la plus proche d’abord ; seulement celles du compte', () => {
    const later = sessionFromRow(row({ id: 'v2', starts_at: '2026-11-20T09:00:00Z', ends_at: '2026-11-20T10:00:00Z' }))!;
    const soon = sessionFromRow(row({ id: 'v3', starts_at: '2026-11-07T07:00:00Z', ends_at: '2026-11-07T23:00:00Z' }))!;
    const finished = sessionFromRow(row({ id: 'v4', starts_at: '2026-11-01T09:00:00Z', ends_at: '2026-11-01T10:00:00Z' }))!;
    const cancelled = sessionFromRow(row({ id: 'v5', status: 'cancelled' }))!;
    const now = new Date('2026-11-07T08:00:00Z');
    expect(upcomingSessions([later, finished, cancelled, soon], now).map((session) => session.id)).toEqual(['v3', 'v2']);
    expect(upcomingSessionsOf({ owner: ME.toUpperCase(), sessions: [later] }, ME, now).map((session) => session.id)).toEqual(['v2']);
    expect(upcomingSessionsOf({ owner: OTHER, sessions: [later] }, ME, now)).toEqual([]);
    expect(upcomingSessionsOf({ owner: ME, sessions: [later] }, null, now)).toEqual([]);
  });

  it('textes de la carte : « Jeudi 12 novembre · 10 h 00 – 12 h 00 », « 0 inscrit sur 8 », « 1 inscrit », « 5 inscrits »', () => {
    expect(sessionTitle({ start: new Date(2026, 10, 12, 10, 0), end: new Date(2026, 10, 12, 12, 0) })).toBe('Jeudi 12 novembre · 10 h 00 – 12 h 00');
    expect(sessionTitle({ start: new Date(2026, 10, 9, 9, 30), end: new Date(2026, 10, 9, 10, 15) })).toBe('Lundi 9 novembre · 9 h 30 – 10 h 15');
    expect(sessionBookedLabel({ bookedCount: 0, totalPlaces: 8 })).toBe('0 inscrit sur 8');
    expect(sessionBookedLabel({ bookedCount: 1, totalPlaces: 4 })).toBe('1 inscrit sur 4');
    expect(sessionBookedLabel({ bookedCount: 5, totalPlaces: 8 })).toBe('5 inscrits sur 8');
  });
});

describe('Ajouter une visite (VisitFormView, SupabaseAgendaRepository.create)', () => {
  const visit: NewVisit = {
    id: 'f0000000-0000-4000-8000-000000000001',
    listing: { listingId: 'd0000000-0000-4000-8000-000000000002', title: 'Appartement 3 pièces', price: 320000, transaction: 'sale', city: 'Lyon',
      coverImageURL: 'https://exemple.supabase.co/storage/v1/object/public/listing-photos/a.jpg' },
    linkedConversationId: null,
    start: new Date(Date.UTC(2026, 10, 13, 9, 0)),
    durationMinutes: 45,
    contactName: '  Agence du Parc ',
    phone: '06 39 98 12 34',
    address: '12 rue de la République, 69002 Lyon',
    participants: [],
    reminders: DEFAULT_REMINDERS,
    isConfirmed: false,
    createdAt: new Date(Date.UTC(2026, 10, 7, 8, 30, 15, 120)),
  };

  it('la ligne de l’app : colonnes, visite entière en JSON, valeurs vides omises', () => {
    expect(newVisitRow(visit)).toEqual({
      id: 'F0000000-0000-4000-8000-000000000001',
      start_at: '2026-11-13T09:00:00.000',
      status: 'awaitingOther',
      listing_id: 'D0000000-0000-4000-8000-000000000002',
      visit: {
        id: 'F0000000-0000-4000-8000-000000000001',
        listing: { listingId: 'D0000000-0000-4000-8000-000000000002', title: 'Appartement 3 pièces', price: 320000, transaction: 'sale', city: 'Lyon',
          coverImageURL: 'https://exemple.supabase.co/storage/v1/object/public/listing-photos/a.jpg' },
        start: '2026-11-13T09:00:00.000',
        durationMinutes: 45,
        contactName: 'Agence du Parc',
        address: '12 rue de la République, 69002 Lyon',
        status: 'awaitingOther',
        createdAt: '2026-11-07T08:30:15.120',
        contactPhone: '0639981234',
        reminders: { eveningBefore: true, twoHoursBefore: true },
      },
    });
  });

  it('sans bien, sans durée ni rappel, confirmée : ni listing_id ni clés vides', () => {
    const row = newVisitRow({ ...visit, listing: null, durationMinutes: null, contactName: '', phone: '', isConfirmed: true,
      reminders: { eveningBefore: false, twoHoursBefore: false, customMinutesBefore: null },
      participants: [{ id: 'e0000000-0000-4000-8000-000000000003', name: 'Paul', phone: null }] });
    expect(row).toEqual({
      id: 'F0000000-0000-4000-8000-000000000001', start_at: '2026-11-13T09:00:00.000', status: 'confirmed',
      visit: {
        id: 'F0000000-0000-4000-8000-000000000001', start: '2026-11-13T09:00:00.000', address: '12 rue de la République, 69002 Lyon',
        status: 'confirmed', createdAt: '2026-11-07T08:30:15.120', participants: [{ id: 'E0000000-0000-4000-8000-000000000003', name: 'Paul' }],
      },
    });
  });

  it('doublon : même bien, même heure, visite active', () => {
    const existing = item('x', visit.start, { listing: visit.listing });
    expect(isDuplicate({ id: visit.id, listingId: visit.listing!.listingId.toUpperCase(), start: visit.start, status: 'awaitingOther' }, existing)).toBe(true);
    expect(isDuplicate({ id: visit.id, listingId: null, start: visit.start, status: 'awaitingOther' }, existing)).toBe(false);
    expect(isDuplicate({ id: visit.id, listingId: visit.listing!.listingId, start: visit.start, status: 'awaitingOther' }, { ...existing, status: 'cancelled' })).toBe(false);
    expect(upcomingVisitForListing(visit.listing!.listingId, [existing], NOW)?.id).toBe('x');
  });

  it('textes de l’app : rappels, demain à 10 h, erreurs', () => {
    expect(remindersSummary(DEFAULT_REMINDERS)).toBe('rappels la veille et 2 h avant');
    expect(remindersSummary({ eveningBefore: false, twoHoursBefore: true, customMinutesBefore: 1440 })).toBe('rappels 2 h avant et 1 jour avant');
    expect(remindersSummary({ eveningBefore: false, twoHoursBefore: false, customMinutesBefore: 30 })).toBe('rappel 30 min avant');
    expect(remindersSummary({ eveningBefore: false, twoHoursBefore: false, customMinutesBefore: null })).toBeNull();
    expect([reminderLabel(180), reminderLabel(2880)]).toEqual(['3 h', '2 jours']);
    expect(defaultVisitStart(NOW)).toEqual(new Date(2026, 10, 8, 10, 0));
    expect(agendaErrorMessage({ code: '23514', message: 'check' })).toBe('Certaines informations n\'ont pas été acceptées. Vérifiez-les, puis réessayez.');
    expect(agendaErrorMessage({ code: 'P0001', hint: 'agenda_full', message: 'Votre agenda est plein.' })).toBe('Votre agenda est plein.');
    expect(agendaErrorMessage({ message: 'violates agenda_visits_visit_size' })).toBe('Cette visite contient trop d\'informations pour être enregistrée. Raccourcissez les notes.');
    expect(agendaErrorMessage(new TypeError('Failed to fetch'))).toBe('L\'opération n\'a pas abouti. Réessayez dans un instant.');
  });

  it('bien choisi : adresse exacte seulement si elle est publiée ou si l’annonce est à moi ; contact de l’annonce', () => {
    const listing = { city: 'Lyon', postal_code: '69002', location_precision: 'approximate', public_street: null };
    expect(visitAddressFor(listing, false, null)).toEqual({ address: 'Lyon (69002)', isHidden: true });
    expect(visitAddressFor(listing, true, '12 rue de la République')).toEqual({ address: '12 rue de la République, 69002 Lyon', isHidden: false });
    expect(visitAddressFor({ ...listing, location_precision: 'exact', public_street: '3 quai Rambaud' }, false, null))
      .toEqual({ address: '3 quai Rambaud, 69002 Lyon', isHidden: false });
    expect(visitContactFor({ public_name: 'Claire M.', account_type: 'individual', agency_id: null, agency_name: null })).toBe('Claire M.');
    expect(visitContactFor({ public_name: 'Marc D.', account_type: 'professional', agency_id: 'g1', agency_name: 'Agence du Parc' })).toBe('Agence du Parc');
    expect(visitContactFor(null)).toBe('Particulier');
  });
});
