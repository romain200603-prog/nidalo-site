import { describe, expect, it } from 'vitest';
import type { ProfileRow } from '../messages/inbox';
import {
  dayLabel, saleErrors, saleFormFor, saleStage, saleSteps, saleSuggestions, salesIn, salesSubtitle, saleWrite,
  type SaleForm, type SaleOfferRow, type SaleRow,
} from './sales';

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const SOPHIE = 'bbbbbbbb-0000-4000-8000-000000000002';
const AGENCY = 'cccccccc-0000-4000-8000-000000000003';

const sale = (over: Partial<SaleRow>): SaleRow => ({
  id: 's1', listing_id: null, offer_id: null, title: 'Appartement', city: 'Lyon', buyer_name: 'Sophie L.', price: '230000',
  accepted_on: '2026-11-02', compromise_on: null, loan_deadline: null, conditions_on: null, deed_planned_on: null,
  deed_signed_on: null, cancelled_on: null, notary: null, note: null, created_at: '2026-11-02T10:00:00Z', updated_at: '2026-11-02T10:00:00Z',
  ...over,
});

const offer = (over: Partial<SaleOfferRow>): SaleOfferRow => ({
  id: 'o1', conversation_id: 'c1', listing_id: 'l1', amount: 230000, status: 'accepted', created_at: '2026-11-01T09:00:00Z',
  expires_at: null, buyer_id: SOPHIE, seller_id: ME, author_id: SOPHIE, parent_offer_id: null, responded_at: '2026-11-03T23:30:00Z',
  listing_snapshot: { title: 'Appartement lumineux', city: 'Lyon 6e' }, ...over,
});

describe('Mes ventes', () => {
  it('écrit où en est chaque vente', () => {
    expect(dayLabel('2026-11-08')).toBe('8 novembre 2026');
    expect(dayLabel('8/11/2026')).toBeNull();
    expect([
      saleStage(sale({})),
      saleStage(sale({ compromise_on: '2026-11-05' })),
      saleStage(sale({ compromise_on: '2026-11-05', loan_deadline: '2026-12-20' })),
      saleStage(sale({ compromise_on: '2026-11-05', conditions_on: '2026-12-15' })),
      saleStage(sale({ compromise_on: '2026-11-05', conditions_on: '2026-12-15', deed_planned_on: '2027-01-20' })),
      saleStage(sale({ deed_signed_on: '2027-01-20' })),
      saleStage(sale({ deed_signed_on: '2027-01-20', cancelled_on: '2026-11-10' })),
    ]).toEqual([
      'Compromis à signer',
      'Conditions suspensives en cours',
      'Prêt attendu avant le 20 décembre 2026',
      'Acte à planifier',
      'Acte prévu le 20 janvier 2027',
      'Acte signé le 20 janvier 2027',
      'Annulée le 10 novembre 2026',
    ]);
    expect(saleSteps(sale({ compromise_on: '2026-11-05', loan_deadline: '2026-12-20', deed_planned_on: '2027-01-20' }))
      .map((step) => [step.title, step.detail, step.done])).toEqual([
      ['Offre acceptée', 'Le 2 novembre 2026', true],
      ['Compromis signé', 'Le 5 novembre 2026', true],
      ['Conditions suspensives levées', 'Prêt attendu avant le 20 décembre 2026', false],
      ['Acte authentique signé', 'Prévu le 20 janvier 2027', false],
    ]);
  });

  it('range les ventes : la date à surveiller la plus proche d\'abord', () => {
    const rows = [
      sale({ id: 'nouvelle', created_at: '2026-11-07T10:00:00Z' }),
      sale({ id: 'acte', compromise_on: '2026-10-01', conditions_on: '2026-11-01', deed_planned_on: '2026-12-01' }),
      sale({ id: 'pret', compromise_on: '2026-10-15', loan_deadline: '2026-11-20' }),
      sale({ id: 'ancienne', created_at: '2026-10-01T10:00:00Z' }),
      sale({ id: 'signee', deed_signed_on: '2026-10-30' }),
      sale({ id: 'signee-avant', deed_signed_on: '2026-09-30' }),
      sale({ id: 'annulee', cancelled_on: '2026-11-04' }),
    ];
    expect(salesIn(rows, 'active').map((row) => row.id)).toEqual(['pret', 'acte', 'nouvelle', 'ancienne']);
    expect(salesIn(rows, 'signed').map((row) => row.id)).toEqual(['signee', 'signee-avant']);
    expect(salesIn(rows, 'cancelled').map((row) => row.id)).toEqual(['annulee']);
    expect(salesSubtitle(rows)).toBe('4 en cours · 2 compromis signés');
    expect(salesSubtitle([])).toBe('0 en cours · 0 compromis signé');
  });

  it('propose de suivre les offres acceptées sur mes annonces, une seule fois', () => {
    const profiles = new Map<string, ProfileRow>([
      [SOPHIE, { user_id: SOPHIE, public_name: 'Sophie L.', avatar_path: null, account_type: 'individual', agency_name: null, agency_phone: null }],
      [AGENCY, { user_id: AGENCY, public_name: 'Jean R.', avatar_path: null, account_type: 'professional', agency_name: 'Saône Conseil', agency_phone: null }],
    ]);
    const suggestions = saleSuggestions({
      me: ME,
      profiles,
      rows: [sale({ offer_id: 'O-SUIVIE' })],
      offers: [
        offer({}),
        offer({ id: 'o-suivie' }), // déjà suivie (identifiant en majuscules côté vente)
        offer({ id: 'o2', status: 'pending' }),
        offer({ id: 'o3', buyer_id: ME, seller_id: AGENCY }), // mon achat
        offer({ id: 'o4', buyer_id: AGENCY, author_id: ME, amount: '410000', responded_at: '2026-11-06T08:00:00Z', listing_snapshot: { title: 'Maison' } }),
      ],
    });
    expect(suggestions).toEqual([
      { offerId: 'o4', listingId: 'l1', title: 'Maison', city: null, buyerName: 'Saône Conseil', price: 410000, acceptedOn: '2026-11-06', conversationId: 'c1' },
      { offerId: 'o1', listingId: 'l1', title: 'Appartement lumineux', city: 'Lyon 6e', buyerName: 'Sophie L.', price: 230000, acceptedOn: '2026-11-04', conversationId: 'c1' },
    ]);
  });

  it('vérifie le formulaire et écrit les valeurs', () => {
    const today = '2026-11-08';
    const form = (over: Partial<SaleForm>): SaleForm => ({ ...saleFormFor(null), title: 'Maison', ...over });
    expect(saleFormFor(sale({})).price).toBe('230 000');
    expect(saleErrors(form({ title: '  ' }), today)).toEqual({ title: 'Indiquez le bien.' });
    expect(saleErrors(form({ price: '0' }), today)).toEqual({ price: 'Prix invalide.' });
    expect(saleErrors(form({ acceptedOn: '2026-11-09', deedPlannedOn: '2027-01-20' }), today)).toEqual({ acceptedOn: 'Cette date est après aujourd\'hui.' });
    expect(saleErrors(form({ acceptedOn: '2026-11-05', compromiseOn: '2026-11-04', loanDeadline: '2026-11-01' }), today)).toEqual({
      compromiseOn: 'Cette date est avant l\'offre acceptée.', loanDeadline: 'Cette date est avant le compromis.',
    });
    expect(saleErrors(form({ conditionsOn: '2026-11-07' }), today)).toEqual({ conditionsOn: 'Indiquez d\'abord la date du compromis.' });
    expect(saleErrors(form({ deedSignedOn: '2026-11-08', acceptedOn: '2026-11-01' }), today)).toEqual({});
    expect(saleWrite(form({ city: ' ', buyerName: ' Paul D. ', price: '1 250 000', compromiseOn: '2026-11-05', note: '' }))).toEqual({
      title: 'Maison', city: null, buyer_name: 'Paul D.', price: 1250000, accepted_on: null, compromise_on: '2026-11-05', loan_deadline: null,
      conditions_on: null, deed_planned_on: null, deed_signed_on: null, notary: null, note: null,
    });
  });
});
