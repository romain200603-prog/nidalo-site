import { describe, expect, it } from 'vitest';
import type { ListingConversation } from './conversation';
import {
  amountDigits, canMakeOffer, effectiveStatus, groupedAmount, isoSeconds, makeOfferParams, offerErrorMessage, offerGapLabel,
  offerStateLabel, type OfferRow,
} from './offers';
import { offerYields, profitabilityFor, type OfferYields } from './profitability';
import { testRow } from '../testRows';

const now = new Date('2026-11-06T10:00:00Z');
const conversation: ListingConversation = { id: 'c1', isGroup: false, listingId: 'l1', transaction: 'sale', isSellerSide: false, title: null, price: null };

function offer(overrides: Partial<OfferRow> = {}): OfferRow {
  return {
    id: 'o1', conversation_id: 'c1', listing_id: 'l1', amount: 230000, status: 'pending',
    created_at: '2026-11-05T10:00:00Z', expires_at: '2026-11-12T10:00:00Z', ...overrides,
  };
}

describe('Offres (OfferStore, OfferServerRow)', () => {
  it('une offre en attente dont la date limite est passée est expirée', () => {
    expect(effectiveStatus(offer(), now)).toBe('pending');
    expect(effectiveStatus(offer({ expires_at: '2026-11-06T09:59:59Z' }), now)).toBe('expired');
    expect(effectiveStatus(offer({ status: 'inconnu' }), now)).toBe('expired');
  });

  it('« Offre acceptée » passe avant « Offre en attente », rien sans conversation', () => {
    expect(offerStateLabel([offer()], conversation, now)).toBe('Offre en attente');
    expect(offerStateLabel([offer(), offer({ id: 'o2', status: 'accepted' })], conversation, now)).toBe('Offre acceptée');
    expect(offerStateLabel([offer({ conversation_id: 'autre' })], conversation, now)).toBeNull();
    expect(offerStateLabel([offer()], null, now)).toBeNull();
  });

  it('peut faire une offre : vente, à deux, côté acheteur, sans offre acceptée ni en attente', () => {
    expect(canMakeOffer(conversation, [], now)).toBe(true);
    expect(canMakeOffer(conversation, [offer()], now)).toBe(false);
    expect(canMakeOffer(conversation, [offer({ expires_at: '2026-11-01T00:00:00Z' })], now)).toBe(true);
    expect(canMakeOffer(conversation, [offer({ status: 'rejected' })], now)).toBe(true);
    expect(canMakeOffer(conversation, [offer({ status: 'accepted' })], now)).toBe(false);
    expect(canMakeOffer({ ...conversation, transaction: 'rent' }, [], now)).toBe(false);
    expect(canMakeOffer({ ...conversation, isSellerSide: true }, [], now)).toBe(false);
    expect(canMakeOffer({ ...conversation, isGroup: true }, [], now)).toBe(false);
  });

  it('arguments de make_offer : champs vides omis, rien pour 7 jours, dates sans millisecondes', () => {
    expect(isoSeconds(new Date('2026-11-06T10:00:00.123Z'))).toBe('2026-11-06T10:00:00Z');
    expect(makeOfferParams({ id: 'o9', conversationId: 'c1', amount: 228000, conditions: '  ', validityDays: 7, now }))
      .toEqual({ p_id: 'o9', p_conversation_id: 'c1', p_amount: 228000 });
    expect(makeOfferParams({ id: 'o9', conversationId: 'c1', amount: 228000, conditions: ' Sous réserve d\'obtention du prêt ', validityDays: 14, now }))
      .toEqual({
        p_id: 'o9', p_conversation_id: 'c1', p_amount: 228000,
        p_conditions: 'Sous réserve d\'obtention du prêt', p_expires_at: '2026-11-20T10:00:00Z',
      });
  });

  it('montant saisi et écart au prix affiché', () => {
    expect(amountDigits('228 000 €abc')).toBe('228000');
    expect(amountDigits('12345678901234')).toBe('1234567890');
    expect(groupedAmount(228000)).toBe('228 000');
    expect(offerGapLabel(240000, 240000)).toBe('Au prix affiché');
    expect(offerGapLabel(230000, 240000)).toBe('4,2 % sous le prix affiché');
    expect(offerGapLabel(242400, 240000)).toBe('1,0 % au-dessus du prix affiché');
  });

  it('messages d\'erreur', () => {
    expect(offerErrorMessage({ code: '28000' })).toBe('Votre session a expiré : reconnectez-vous.');
    expect(offerErrorMessage({ code: 'P0001', message: 'Cette annonce n\'est plus en vente.' })).toBe('Cette annonce n\'est plus en vente.');
    expect(offerErrorMessage({ code: 'P0001', message: '', hint: 'offer_pending_exists' })).toBe('Une offre attend déjà une réponse dans cette conversation.');
    expect(offerErrorMessage({ code: '23514' })).toBe('Certaines informations n\'ont pas été acceptées. Vérifiez-les, puis réessayez.');
    expect(offerErrorMessage(new TypeError('Failed to fetch'))).toBe('L\'offre n\'a pas pu être enregistrée. Vérifiez votre connexion et réessayez.');
  });
});

describe('Rentabilité au montant proposé (offerYields)', () => {
  // 1 600 €/mois de loyer : 19 200 €/an, soit 8 % brut à 240 000 €.
  const profitability = profitabilityFor(testRow({ price: 240000, rental_info: { isLeased: true, currentMonthlyRent: 1600 } }));
  const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');
  const shown = (yields: OfferYields | null) => yields && {
    title: plain(yields.title),
    rows: yields.rows.map((row) => [row.label, plain(row.value), row.listed && plain(row.listed)]),
  };

  it('sans montant, la rentabilité du prix affiché', () => {
    expect(profitability).not.toBeNull();
    expect(shown(offerYields(profitability!, 240000, null))).toEqual({
      title: 'Rentabilité au prix affiché',
      rows: [['Rendement brut', '8,0 %', null], ['Rendement net', '6,2 %', null]],
    });
  });

  it('192 000 € au lieu de 240 000 € : le brut passe de 8 % à 10 %, le net suit (frais de notaire compris)', () => {
    expect(shown(offerYields(profitability!, 240000, 192000))).toEqual({
      title: 'Rentabilité à 192 000 €',
      rows: [['Rendement brut', '10,0 %', '8,0 % au prix affiché'], ['Rendement net', '7,7 %', '6,2 % au prix affiché']],
    });
  });

  it('au-dessus du prix affiché, la rentabilité baisse', () => {
    expect(shown(offerYields(profitability!, 240000, 300000))?.rows).toEqual([
      ['Rendement brut', '6,4 %', '8,0 % au prix affiché'], ['Rendement net', '4,9 %', '6,2 % au prix affiché'],
    ]);
  });

  it('le montant compte dès la moitié du prix affiché ; au prix affiché, rien à comparer', () => {
    expect(shown(offerYields(profitability!, 240000, 119999))?.title).toBe('Rentabilité au prix affiché');
    expect(shown(offerYields(profitability!, 240000, 24))?.rows[0]).toEqual(['Rendement brut', '8,0 %', null]);
    expect(shown(offerYields(profitability!, 240000, 120000))).toEqual({
      title: 'Rentabilité à 120 000 €',
      rows: [['Rendement brut', '16,0 %', '8,0 % au prix affiché'], ['Rendement net', '12,4 %', '6,2 % au prix affiché']],
    });
    expect(shown(offerYields(profitability!, 240000, 240000))).toEqual({
      title: 'Rentabilité au prix affiché',
      rows: [['Rendement brut', '8,0 %', null], ['Rendement net', '6,2 %', null]],
    });
  });

  it('le prix affiché est celui de la conversation (prix du bien au premier contact)', () => {
    expect(shown(offerYields(profitability!, 250000, null))?.rows).toEqual([['Rendement brut', '7,7 %', null], ['Rendement net', '5,9 %', null]]);
  });

  it('sans loyer, pas de rentabilité', () => {
    expect(profitabilityFor(testRow())).toBeNull();
    expect(offerYields(profitability!, 0, 192000)).toBeNull();
  });
});
