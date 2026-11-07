import { describe, expect, it } from 'vitest';
import {
  agendaErrorMessage, agendaSummary, countIn, DEFAULT_REMINDERS, defaultVisitStart, directionsUrl, groupKind, groupsIn, groupTitle,
  isDuplicate, itemsIn, newVisitRow, reminderLabel, remindersSummary, requestEntries, upcomingVisitForListing, visitAddressFor,
  visitContactFor, visitFromRow, type AgendaItem, type AgendaRequestRow, type NewVisit,
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
