import { describe, expect, it } from 'vitest';
import {
  allowedActions, canProposeAnotherDate, changedMeanwhile, confirmedRanges, conflicts, eventText, openSlotsTitle, referenceSlot, requestActionMessage,
  REQUEST_ACTION_FAILURE, requestExplanation, requestHistory, requestRole, requestsInTab, requestTab, slotDuration, type DetailRequestRow,
} from './requestDetail';
import { requestDisplayStatus } from './visits';

// Mêmes règles que VisitRequestTests (ImmoDomainTests) : rôle, actions permises, onglets, historique et textes de
// VisitRequestDetailView.

const now = new Date('2026-11-06T10:00:00Z');
const requester = 'a0000000-0000-4000-8000-0000000000c1';
const recipient = 'b0000000-0000-4000-8000-0000000000d2';
const agent = 'b0000000-0000-4000-8000-0000000000d3';
const slot = (id: string, start: string, durationMinutes = 45) => ({ id, start, durationMinutes });

function request(overrides: Partial<DetailRequestRow> = {}): DetailRequestRow {
  return {
    id: 'r1', listing_id: 'l1', listing_snapshot: { listingId: 'l1', title: 'Maison familiale 5 pièces', city: 'Écully' },
    requester: { userId: requester, name: 'Julie B.', kind: 'individual' },
    recipient: { userId: recipient, name: 'Agence du Parc', kind: 'agency' },
    agent_user_id: agent,
    slots: [slot('S1', '2026-11-10T09:00:00Z'), slot('S2', '2026-11-08T14:00:00Z')],
    mode: 'onSite', status: 'pending', accepted_slot: null, proposed_slots: null, created_at: '2026-11-05T10:00:00Z',
    ...overrides,
  };
}

const sorted = (actions: Set<string>) => [...actions].sort();

describe('Demande de visite : rôle et actions permises (VisitRequest.allowedActions)', () => {
  it('rôle : demandeur, destinataire ou agent chargé de la visite, sans casse ; personne d’autre', () => {
    expect([requestRole(request(), requester.toUpperCase()), requestRole(request(), recipient), requestRole(request(), agent), requestRole(request(), 'x')])
      .toEqual(['requester', 'recipient', 'recipient', null]);
  });

  it('en attente : le destinataire accepte, refuse ou propose ; le demandeur annule', () => {
    expect(sorted(allowedActions(request(), recipient, now))).toEqual(['accept', 'decline', 'propose']);
    expect(sorted(allowedActions(request(), requester, now))).toEqual(['cancel']);
    expect(sorted(allowedActions(request(), 'x', now))).toEqual([]);
  });

  it('autres créneaux proposés : l’autre accepte ou refuse ; celui qui propose peut encore proposer ou annuler', () => {
    const counter = request({ status: 'counterProposed', proposed_by: 'recipient', proposed_slots: [slot('P1', '2026-11-12T09:00:00Z')] });
    expect(sorted(allowedActions(counter, requester, now))).toEqual(['accept', 'cancel', 'decline']);
    expect(sorted(allowedActions(counter, recipient, now))).toEqual(['propose']);
    // Changement d'une visite confirmée : elle reste sur son créneau ; les deux peuvent l'annuler.
    const moving = { ...counter, accepted_slot: slot('S1', '2026-11-10T09:00:00Z') };
    expect(sorted(allowedActions(moving, recipient, now))).toEqual(['cancel']);
    expect(sorted(allowedActions(moving, requester, now))).toEqual(['accept', 'cancel', 'decline']);
  });

  it('acceptée : proposer un autre créneau ou annuler ; passée, refusée ou annulée : rien', () => {
    const accepted = request({ status: 'accepted', accepted_slot: slot('S1', '2026-11-10T09:00:00Z') });
    expect(sorted(allowedActions(accepted, requester, now))).toEqual(['cancel', 'propose']);
    expect(sorted(allowedActions({ ...accepted, accepted_slot: slot('S1', '2026-11-05T09:00:00Z') }, requester, now))).toEqual([]);
    expect(sorted(allowedActions(request({ status: 'declined' }), requester, now))).toEqual([]);
    expect(sorted(allowedActions(request({ status: 'cancelled' }), recipient, now))).toEqual([]);
    expect([canProposeAnotherDate(request({ status: 'declined' }), requester), canProposeAnotherDate(request({ status: 'declined' }), recipient)]).toEqual([true, false]);
  });

  it('créneau de référence : le retenu, sinon le plus proche encore ouvert', () => {
    expect(referenceSlot(request())?.id).toBe('S2');
    expect(referenceSlot(request({ status: 'accepted', accepted_slot: slot('S1', '2026-11-10T09:00:00Z') }))?.id).toBe('S1');
    expect(referenceSlot(request({ status: 'declined' }))?.id).toBe('S1');
  });
});

describe('Demande de visite : textes de l’écran (VisitRequestDetailView)', () => {
  it('explication selon l’état et le côté', () => {
    const text = (row: DetailRequestRow, me: string) => requestExplanation(row, me, requestDisplayStatus(row, now));
    expect(text(request(), requester)).toBe('En attente de réponse : ce n\'est pas encore une visite confirmée.');
    expect(text(request(), recipient)).toBe('Julie B. souhaite visiter ce bien. Acceptez l\'un des créneaux, proposez-en un autre ou refusez.');
    const counter = request({ status: 'counterProposed', proposed_by: 'recipient', proposed_slots: [slot('P1', '2026-11-12T09:00:00Z')] });
    expect(text(counter, recipient)).toBe('Vous avez proposé d\'autres créneaux, en attente de réponse.');
    expect(text(counter, requester)).toBe('Agence du Parc propose d\'autres créneaux. Acceptez celui qui vous convient ou refusez.');
    expect(text({ ...counter, accepted_slot: slot('S1', '2026-11-10T09:00:00Z') }, requester))
      .toBe('Agence du Parc propose de déplacer la visite. Elle reste confirmée sur son créneau actuel tant que vous n\'avez pas accepté.');
    expect(text(request({ status: 'declined', decline_reason: 'Bien déjà loué' }), requester)).toBe('Demande refusée. Motif : Bien déjà loué');
    expect(text(request({ status: 'cancelled' }), requester)).toBe('Demande annulée.');
    expect(text(request({ slots: [slot('S1', '2026-11-05T09:00:00Z')] }), requester)).toBe('Les créneaux sont passés sans réponse.');
    expect([openSlotsTitle(request(), recipient), openSlotsTitle(counter, requester), openSlotsTitle(counter, recipient)])
      .toEqual(['Créneaux demandés', 'Créneaux proposés par Agence du Parc', 'Créneaux proposés par vous']);
    expect([slotDuration(45), slotDuration(60), slotDuration(90), slotDuration(120)]).toEqual(['45 min', '1 h', '90 min', '2 h']);
  });

  it('historique : événements lisibles seulement, avec qui et quoi', () => {
    const row = request({
      history: [
        { id: 'e1', date: '2026-11-05T10:00:00Z', actorId: requester.toUpperCase(), action: { sent: {} } },
        { id: 'e2', date: '2026-11-05T11:00:00Z', actorId: recipient, action: { proposed: { slots: [slot('P1', '2026-11-12T09:00:00Z'), slot('P2', '2026-11-12T10:00:00Z')] } } },
        { id: 'e3', date: '2026-11-05T12:00:00Z', actorId: requester, action: { declined: { reason: 'Trop tard' } } },
        { id: 'e4', date: 'hier', actorId: requester, action: { sent: {} } },
        { id: 'e5', date: '2026-11-05T13:00:00Z', actorId: recipient, action: { inconnu: {} } },
      ],
    });
    const events = requestHistory(row);
    expect(events.map((event) => eventText(event, row, requester))).toEqual(['Vous : demande envoyée', 'Agence du Parc : 2 créneaux proposés', 'Vous : refus (Trop tard)']);
    expect(eventText(events[0], row, recipient)).toBe('Julie B. : demande envoyée');
    expect(requestHistory(request({ history: null }))).toEqual([]);
  });
});

describe('Demande de visite : onglets, chevauchements et réponses du serveur', () => {
  it('À traiter (une réponse attendue), À venir, Historique ; les plus proches d’abord, l’historique le plus récent d’abord', () => {
    const received = request({ id: 'a' });
    const sent = request({ id: 'b', slots: [slot('S1', '2026-11-07T09:00:00Z')] });
    const declined = request({ id: 'c', status: 'declined', slots: [slot('S1', '2026-11-04T09:00:00Z')] });
    const cancelled = request({ id: 'd', status: 'cancelled', slots: [slot('S1', '2026-11-09T09:00:00Z')] });
    expect([requestTab(received, recipient, now), requestTab(sent, requester, now), requestTab(declined, requester, now)]).toEqual(['toHandle', 'upcoming', 'history']);
    expect(requestsInTab([received, sent], 'upcoming', requester, now).map((row) => row.id)).toEqual(['b', 'a']);
    expect(requestsInTab([declined, cancelled], 'history', requester, now).map((row) => row.id)).toEqual(['d', 'c']);
  });

  it('chevauchement : autres visites confirmées et visites de l’agenda encore à venir, sans la demande elle-même', () => {
    const accepted = request({ id: 'x', status: 'accepted', accepted_slot: slot('A1', '2026-11-08T14:30:00Z', 60) });
    const busy = confirmedRanges([request(), accepted], 'r1', [
      { start: new Date('2026-11-10T08:00:00Z'), end: Date.parse('2026-11-10T09:15:00Z'), requestId: null },
      { start: new Date('2026-11-01T08:00:00Z'), end: Date.parse('2026-11-01T09:00:00Z'), requestId: null },
      { start: new Date('2026-11-10T09:00:00Z'), end: Date.parse('2026-11-10T09:45:00Z'), requestId: 'R1' },
    ], now);
    expect(busy).toEqual([{ start: Date.parse('2026-11-08T14:30:00Z'), end: Date.parse('2026-11-08T15:30:00Z') },
      { start: Date.parse('2026-11-10T08:00:00Z'), end: Date.parse('2026-11-10T09:15:00Z') }]);
    expect(conflicts({ start: Date.parse('2026-11-08T14:00:00Z'), end: Date.parse('2026-11-08T14:45:00Z') }, busy)).toBe(true);
    expect(conflicts({ start: Date.parse('2026-11-08T13:45:00Z'), end: Date.parse('2026-11-08T14:30:00Z') }, busy)).toBe(false);
  });

  it('refus du serveur : son message (P0001), sinon celui de l’app ; demande changée entre-temps relue', () => {
    expect(requestActionMessage({ code: 'P0001', message: 'Ce créneau vient d\'être pris.', hint: 'visit_slot_taken' })).toBe('Ce créneau vient d\'être pris.');
    expect(requestActionMessage(new TypeError('Failed to fetch'))).toBe(REQUEST_ACTION_FAILURE);
    expect([changedMeanwhile({ code: 'P0001', hint: 'visit_slot_taken' }), changedMeanwhile({ code: 'P0001', hint: 'autre' }), changedMeanwhile(null)])
      .toEqual([true, false, false]);
  });
});
