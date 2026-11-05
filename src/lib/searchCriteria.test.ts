import { describe, expect, it } from 'vitest';
import {
  activeFilterCount, defaultDraft, draftFromParams, filterChips, hotelRoomCount, investmentKind, matches, paramsFromDraft,
  propertyTypesFor, withInvestmentKind, LIGHT_WORKS_LIMIT, type Highlights,
} from './search';
import { testRow } from './testRows';

const highlights: Highlights = { grossYield: 0.08, netYield: 0.06, monthlyCashFlow: 50, isRentEstimated: false };
const rental = (isFurnished?: boolean) =>
  testRow({ transaction: 'rent', price: 690, rental_info: isFurnished === undefined ? {} : { isFurnished } });
const hotel = (details: Record<string, unknown>, rooms: number | null = null) =>
  testRow({ property_type: 'hotel', rooms, asset_details: { hotel: { _0: details } } });

describe('critères de l’accueil (SearchMatching.swift)', () => {
  it('location : meublée ou non ; une annonce qui ne le dit pas est écartée, un parking jamais', () => {
    const furnished = { ...defaultDraft('rent'), furnished: true };
    expect(matches(rental(true), furnished, null)).toBe(true);
    expect(matches(rental(false), furnished, null)).toBe(false);
    expect(matches(rental(), furnished, null)).toBe(false);
    expect(matches({ ...rental(), property_type: 'parking' }, furnished, null)).toBe(true);
    expect(matches(rental(), defaultDraft('rent'), null)).toBe(true);
  });

  it('Investir : travaux maximum, sans exclure une annonce qui ne les indique pas', () => {
    const light = { ...defaultDraft('invest'), maxWorksAmount: LIGHT_WORKS_LIMIT };
    expect(matches(testRow({ works_amount: 10_000 }), light, highlights)).toBe(true);
    expect(matches(testRow({ works_amount: 20_000 }), light, highlights)).toBe(false);
    expect(matches(testRow({ works_amount: null }), light, highlights)).toBe(true);
    const none = { ...defaultDraft('invest'), maxWorksAmount: 0 };
    expect(matches(testRow({ works_amount: 1 }), none, highlights)).toBe(false);
    expect(matches(testRow({ works_amount: 0 }), none, highlights)).toBe(true);
  });

  it('Investir : type d’investissement, vue des types et de l’immeuble mixte', () => {
    const draft = defaultDraft('invest');
    expect(investmentKind(draft)).toBe('classic');
    const offices = withInvestmentKind(draft, 'office');
    expect(offices.types).toEqual(['office']);
    expect(investmentKind(offices)).toBe('office');
    const mixed = withInvestmentKind(offices, 'mixedBuilding');
    expect(mixed).toMatchObject({ types: [], mixedBuilding: true });
    expect(investmentKind(mixed)).toBe('mixedBuilding');
    expect(propertyTypesFor(mixed)).toEqual(['building']);
    expect(withInvestmentKind({ ...draft, types: ['apartment', 'house'] }, 'classic').types).toEqual(['apartment', 'house']);
    const building = (residentialUnits: number, commercialUnits: number) =>
      testRow({ property_type: 'building', asset_details: { building: { _0: { residentialUnits, commercialUnits } } } });
    expect(matches(building(4, 1), mixed, highlights)).toBe(true);
    expect(matches(building(4, 0), mixed, highlights)).toBe(false);
    expect(matches(testRow(), mixed, highlights)).toBe(false);
  });

  it('Hôtels : nature de la vente, et chambres lues dans les détails de l’hôtel', () => {
    const walls = { ...defaultDraft('hotel'), hotelScope: 'wallsOnly' as const };
    expect(matches(hotel({ scope: 'wallsOnly' }), walls, null)).toBe(true);
    expect(matches(hotel({ scope: 'wallsAndBusiness' }), walls, null)).toBe(false);
    expect(matches(hotel({}), walls, null)).toBe(false);
    expect(hotelRoomCount(hotel({ rooms: 24 }))).toBe(24);
    expect(hotelRoomCount(hotel({}, 12))).toBe(12);
    const tenRooms = { ...defaultDraft('hotel'), roomsMin: 10 };
    expect(matches(hotel({ rooms: 24 }), tenRooms, null)).toBe(true);
    expect(matches(hotel({ rooms: 8 }), tenRooms, null)).toBe(false);
  });

  it('garde les nouveaux critères dans l’adresse, seulement dans leur mode', () => {
    const invest = { ...defaultDraft('invest'), maxWorksAmount: 0, mixedBuilding: true };
    expect(draftFromParams(paramsFromDraft(invest))).toMatchObject({ maxWorksAmount: 0, mixedBuilding: true });
    const rent = { ...defaultDraft('rent'), furnished: false };
    expect(paramsFromDraft(rent).get('meuble')).toBe('0');
    expect(draftFromParams(paramsFromDraft(rent)).furnished).toBe(false);
    const hotelDraft = { ...defaultDraft('hotel'), hotelScope: 'businessOnly' as const };
    expect(draftFromParams(paramsFromDraft(hotelDraft)).hotelScope).toBe('businessOnly');
    expect(draftFromParams(new URLSearchParams('mode=buy&meuble=1&vente=wallsOnly&mixte=1')))
      .toMatchObject({ furnished: null, hotelScope: null, mixedBuilding: false });
  });

  it('montre ces critères en pastilles et les compte sur le bouton Filtres', () => {
    const invest = { ...defaultDraft('invest'), maxWorksAmount: 0, mixedBuilding: true };
    expect(filterChips(invest).map((c) => c.label)).toEqual(['Sans travaux', 'Immeuble mixte']);
    expect(activeFilterCount(invest)).toBe(2);
    expect(filterChips({ ...defaultDraft('invest'), maxWorksAmount: 15_000 }).map((c) => c.label)).toEqual(['Travaux : 15\u00a0k€ max']);
    expect(filterChips({ ...defaultDraft('rent'), furnished: true }).map((c) => c.label)).toEqual(['Meublée']);
    expect(filterChips({ ...defaultDraft('hotel'), hotelScope: 'wallsAndBusiness' }).map((c) => c.label)).toEqual(['Murs et fonds']);
  });
});
