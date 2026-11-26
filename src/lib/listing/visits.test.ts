import { describe, expect, it } from 'vitest';
import {
  agendaVisit, areValidSlots, bookSlotParams, createVisitRequestParams, hourLabel, isSlotPast, nextVisit, openRequest, openSlotsFromRows,
  previousRequestNotice, requestDisplayStatus, requestSlotLabel, sessionDay, sessionRange, slotHourLabel, slotLabel, slotStart, SLOT_TIMES,
  suggestedSlot, visitDateInline, visitDateLong, visitErrorMessage, visitSessionErrorMessage, VISIT_FAILURE_MESSAGE, type VisitRequestRow,
} from './visits';

const now = new Date('2026-11-06T10:00:00Z');
const me = 'a0000000-0000-4000-8000-0000000000c1';

function request(overrides: Partial<VisitRequestRow> = {}): VisitRequestRow {
  return {
    id: 'r1', listing_id: 'l1', listing_snapshot: { listingId: 'l1' },
    requester: { userId: me, name: 'Claire Martin', kind: 'individual' },
    recipient: { userId: 'b0000000-0000-4000-8000-0000000000d2', name: 'Agence Démo', kind: 'agency' },
    slots: [{ id: 's1', start: '2026-11-08T09:00:00Z', durationMinutes: 60 }],
    mode: 'onSite', status: 'pending', accepted_slot: null, proposed_slots: null, created_at: '2026-11-05T10:00:00Z',
    ...overrides,
  };
}

describe('Demandes de visite (VisitRequestStore)', () => {
  it('statut affiché : « Passée » quand l\'heure est dépassée', () => {
    expect(requestDisplayStatus(request(), now)).toBe('pending');
    expect(requestDisplayStatus(request({ slots: [{ id: 's1', start: '2026-11-05T09:00:00Z', durationMinutes: 60 }] }), now)).toBe('past');
    expect(requestDisplayStatus(request({ status: 'accepted', accepted_slot: { id: 's1', start: '2026-11-08T09:00:00Z', durationMinutes: 60 } }), now)).toBe('accepted');
    expect(requestDisplayStatus(request({ status: 'accepted' }), now)).toBe('past');
    expect(requestDisplayStatus(request({ status: 'declined' }), now)).toBe('declined');
  });

  it('demande ouverte : la plus récente de ce compte pour ce bien', () => {
    const older = request({ id: 'r0', created_at: '2026-11-01T10:00:00Z' });
    const newer = request({ id: 'r2', created_at: '2026-11-05T12:00:00Z' });
    expect(openRequest([older, newer], 'l1', me, now)?.id).toBe('r2');
    expect(openRequest([request({ status: 'cancelled' })], 'l1', me, now)).toBeNull();
    expect(openRequest([request()], 'l2', me, now)).toBeNull();
    expect(openRequest([request()], 'l1', 'quelqu-un-d-autre', now)).toBeNull();
    expect(openRequest([request()], 'l1', me.toUpperCase(), now)?.id).toBe('r1');
  });
});

describe('Agenda (VisitAgenda.nextVisit)', () => {
  const row = (id: string, start: string, status = 'confirmed', listingId = 'l1') => agendaVisit({
    id, start_at: start, status, request_id: null, listing_id: listingId,
    visit: { listing: { listingId }, start, durationMinutes: 60, status },
  });

  it('prochaine visite non annulée, pas encore terminée, du même bien', () => {
    const visits = [
      row('v1', '2026-11-06T08:00:00Z'),
      row('v2', '2026-11-09T16:00:00Z'),
      row('v3', '2026-11-07T16:00:00Z', 'cancelled'),
      row('v4', '2026-11-07T17:00:00Z', 'awaitingOther', 'l2'),
      row('v5', '2026-11-10T16:00:00Z', 'toConfirm'),
    ].filter((visit) => visit !== null);
    expect(nextVisit(visits, 'l1', now)?.id).toBe('v2');
    expect(nextVisit(visits, 'l2', now)?.id).toBe('v4');
    expect(nextVisit(visits, 'l3', now)).toBeNull();
  });

  it('date de la visite écrite par l’app : UTC sans fuseau', () => {
    const visit = agendaVisit({
      id: 'v1', start_at: '2026-11-08T09:00:00+00:00', status: 'confirmed', request_id: null, listing_id: null,
      visit: { start: '2026-11-08T09:00:00.000', status: 'confirmed' },
    });
    expect(visit?.start.toISOString()).toBe('2026-11-08T09:00:00.000Z');
  });

  it('ligne illisible écartée', () => {
    expect(agendaVisit({ id: 'x', start_at: 'pas une date', status: 'confirmed', request_id: null, listing_id: null, visit: null })).toBeNull();
    expect(agendaVisit({ id: 'x', start_at: '2026-11-08T09:00:00Z', status: 'bizarre', request_id: null, listing_id: null, visit: null })).toBeNull();
  });
});

describe('Formulaire de demande (VisitRequestFormView)', () => {
  it('heures de 8 h 00 à 20 h 00 par demi-heure, demain à 10 h 00 par défaut', () => {
    expect(SLOT_TIMES).toHaveLength(25);
    expect(hourLabel(SLOT_TIMES[0])).toBe('8h00');
    expect(hourLabel(SLOT_TIMES.at(-1)!)).toBe('20h00');
    // Le choix d'un créneau s'écrit comme les séances (n° 177).
    expect(slotHourLabel(SLOT_TIMES[0])).toBe('8 h 00');
    expect(slotHourLabel(SLOT_TIMES[5])).toBe('10 h 30');
    expect(slotHourLabel(SLOT_TIMES.at(-1)!)).toBe('20 h 00');
    const local = new Date(2026, 10, 6, 15, 30);
    expect(suggestedSlot(local)).toEqual({ day: '2026-11-07', minutes: 600 });
    expect(suggestedSlot(local, new Date(2026, 10, 30, 10))).toEqual({ day: '2026-12-01', minutes: 600 });
    expect(slotStart({ day: '2026-11-07', minutes: 630 })?.getTime()).toBe(new Date(2026, 10, 7, 10, 30).getTime());
    expect(isSlotPast({ day: '', minutes: 600 }, local)).toBe(true);
    expect(isSlotPast({ day: '2026-11-06', minutes: 900 }, local)).toBe(true);
    expect(isSlotPast({ day: '2026-11-06', minutes: 960 }, local)).toBe(false);
  });

  it('créneaux en « 10 h 00 », dates d’une visite en « 18h00 » (n° 177)', () => {
    const slot = new Date(2026, 10, 5, 10, 0);
    expect(requestSlotLabel(slot)).toBe('Jeu. 5 nov. · 10 h 00');
    // Les contacts de l'espace pro (ProContacts.slotLabel) et les dates d'une visite (VisitDate) ne changent pas.
    expect(slotLabel(slot)).toBe('Jeu. 5 nov. · 10h00');
    expect(visitDateLong(new Date(2026, 9, 8, 18, 0))).toBe('Jeudi 8 octobre · 18h00');
    expect(visitDateInline(new Date(2026, 9, 8, 18, 0))).toBe('jeu. 8 oct., 18h00');
  });

  it('1 à 3 créneaux à venir, qui ne se chevauchent pas', () => {
    const at = (iso: string) => ({ start: new Date(iso), durationMinutes: 60 });
    expect(areValidSlots([], now)).toBe(false);
    expect(areValidSlots([at('2026-11-07T09:00:00Z')], now)).toBe(true);
    expect(areValidSlots([at('2026-11-07T09:00:00Z'), at('2026-11-07T09:30:00Z')], now)).toBe(false);
    expect(areValidSlots([at('2026-11-07T09:00:00Z'), at('2026-11-07T10:00:00Z')], now)).toBe(true);
    expect(areValidSlots([at('2026-11-06T09:00:00Z')], now)).toBe(false);
    expect(areValidSlots([at('2026-11-07T09:00:00Z'), at('2026-11-08T09:00:00Z'), at('2026-11-09T09:00:00Z'), at('2026-11-10T09:00:00Z')], now)).toBe(false);
  });

  it('arguments de create_visit_request, comme l\'app les envoie', () => {
    const params = createVisitRequestParams({
      id: 'r9', listingId: 'l1', mode: 'video', message: '  ',
      slots: [{ id: 's1', start: new Date('2026-11-07T09:00:00.000Z') }, { id: 's2', start: new Date('2026-11-08T13:30:00Z') }],
    });
    expect(params).toEqual({
      p_id: 'r9', p_listing_id: 'l1', p_mode: 'video',
      p_slots: [{ id: 's1', start: '2026-11-07T09:00:00Z', durationMinutes: 60 }, { id: 's2', start: '2026-11-08T13:30:00Z', durationMinutes: 60 }],
    });
    expect(createVisitRequestParams({ id: 'r9', listingId: 'l1', mode: 'onSite', message: ` ${'a'.repeat(1200)} `, slots: [] }).p_message)
      .toHaveLength(1000);
  });

  it('message d\'erreur : celui du serveur pour un refus, sinon celui de l\'app', () => {
    expect(visitErrorMessage({ code: 'P0001', message: 'Ce créneau n\'est plus disponible.' })).toBe('Ce créneau n\'est plus disponible.');
    expect(visitErrorMessage({ code: '08006', message: 'réseau' })).toBe(VISIT_FAILURE_MESSAGE);
  });
});

describe('« Proposer une autre date » (VisitRequestFormView, previous)', () => {
  it('cite la demande refusée et son motif', () => {
    const params = createVisitRequestParams({
      id: 'r9', listingId: 'l1', mode: 'onSite', message: '', previousRequestId: 'r1',
      slots: [{ id: 's1', start: new Date('2026-11-07T09:00:00Z') }],
    });
    expect(params.p_previous_request_id).toBe('r1');
    expect(createVisitRequestParams({ id: 'r9', listingId: 'l1', mode: 'onSite', message: '', slots: [] })).not.toHaveProperty('p_previous_request_id');
    expect(previousRequestNotice({ decline_reason: ' Bien déjà loué ' }))
      .toBe('Votre demande précédente a été refusée (Bien déjà loué). Proposez d\'autres créneaux : une nouvelle demande sera envoyée.');
    expect(previousRequestNotice({ decline_reason: null }))
      .toBe('Votre demande précédente a été refusée. Proposez d\'autres créneaux : une nouvelle demande sera envoyée.');
  });
});

describe('Créneaux ouverts par le vendeur (VisitSessionStore.openSlots et book)', () => {
  const row = (start: string, end: string, fields: Partial<Parameters<typeof openSlotsFromRows>[0][number]> = {}) => ({
    session_id: 'c1', slot_start: start, slot_end: end, duration_minutes: 30, places_left: 2, booked_by_me: false, bookable: true, ...fields,
  });

  it('lit les créneaux du plus proche au plus lointain, écarte une ligne illisible', () => {
    const slots = openSlotsFromRows([
      row('2026-11-20T10:00:00Z', '2026-11-20T10:30:00Z'), row('2026-11-20 09:00:00+00', '2026-11-20 09:30:00.123456+00'),
      row('pas une date', '2026-11-20T10:30:00Z'), row('2026-11-21T10:00:00Z', '2026-11-21T10:30:00Z', { session_id: '' }),
    ]);
    expect(slots.map((slot) => slot.start.toISOString())).toEqual(['2026-11-20T09:00:00.000Z', '2026-11-20T10:00:00.000Z']);
    expect(slots[0]).toMatchObject({ sessionId: 'c1', durationMinutes: 30, placesLeft: 2, bookedByMe: false, bookable: true });
    expect(slots[0].end.toISOString()).toBe('2026-11-20T09:30:00.123Z');
  });

  it('arguments de book_visit_slot : début à la seconde, message nettoyé, absent s\'il est vide', () => {
    const slot = { sessionId: 'c1', start: new Date('2026-11-20T09:00:00.000Z') };
    expect(bookSlotParams('r9', slot, '  Bonjour  ')).toEqual({ p_id: 'r9', p_session_id: 'c1', p_slot_start: '2026-11-20T09:00:00Z', p_message: 'Bonjour' });
    expect(bookSlotParams('r9', slot, '   ')).toEqual({ p_id: 'r9', p_session_id: 'c1', p_slot_start: '2026-11-20T09:00:00Z' });
  });

  it('refus : le message du serveur, sinon la connexion, sinon le message de l\'app', () => {
    expect(visitSessionErrorMessage({ code: 'P0001', message: 'Ce créneau est complet.' }, false)).toBe('Ce créneau est complet.');
    expect(visitSessionErrorMessage(new TypeError('Failed to fetch'), true)).toBe('Connexion impossible. Vérifiez votre accès à Internet, puis réessayez.');
    expect(visitSessionErrorMessage({ code: '42501' }, false)).toBe('Cette action n\'a pas abouti. Réessayez dans un instant.');
  });

  it('écrit le jour et l\'horaire comme l\'app (VisitSessionFormat)', () => {
    const start = new Date(2026, 10, 18, 10, 0);
    expect(sessionDay(start)).toBe('Mercredi 18 novembre');
    expect(sessionDay(start, false)).toBe('Mer. 18 nov.');
    expect(sessionRange(start, new Date(2026, 10, 18, 10, 30))).toBe('10 h 00 – 10 h 30');
  });
});
