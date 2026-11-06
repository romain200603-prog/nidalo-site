import { describe, expect, it } from 'vitest';
import {
  agendaVisit, areValidSlots, createVisitRequestParams, hourLabel, isSlotPast, nextVisit, openRequest, requestDisplayStatus,
  slotStart, SLOT_TIMES, suggestedSlot, visitErrorMessage, VISIT_FAILURE_MESSAGE, type VisitRequestRow,
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

  it('ligne illisible écartée', () => {
    expect(agendaVisit({ id: 'x', start_at: 'pas une date', status: 'confirmed', request_id: null, listing_id: null, visit: null })).toBeNull();
    expect(agendaVisit({ id: 'x', start_at: '2026-11-08T09:00:00Z', status: 'bizarre', request_id: null, listing_id: null, visit: null })).toBeNull();
  });
});

describe('Formulaire de demande (VisitRequestFormView)', () => {
  it('heures de 8h00 à 20h00 par demi-heure, demain à 10h00 par défaut', () => {
    expect(SLOT_TIMES).toHaveLength(25);
    expect(hourLabel(SLOT_TIMES[0])).toBe('8h00');
    expect(hourLabel(SLOT_TIMES.at(-1)!)).toBe('20h00');
    const local = new Date(2026, 10, 6, 15, 30);
    expect(suggestedSlot(local)).toEqual({ day: '2026-11-07', minutes: 600 });
    expect(suggestedSlot(local, new Date(2026, 10, 30, 10))).toEqual({ day: '2026-12-01', minutes: 600 });
    expect(slotStart({ day: '2026-11-07', minutes: 630 })?.getTime()).toBe(new Date(2026, 10, 7, 10, 30).getTime());
    expect(isSlotPast({ day: '', minutes: 600 }, local)).toBe(true);
    expect(isSlotPast({ day: '2026-11-06', minutes: 900 }, local)).toBe(true);
    expect(isSlotPast({ day: '2026-11-06', minutes: 960 }, local)).toBe(false);
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
