import { describe, expect, it } from 'vitest';
import { draftFromProject, projectCompletion } from './projectSearch';
import { defaultDraft, paramsFromDraft } from './search';

// Critères tels que l'app les enregistre (JSON de ProjectCriteria : montants en nombres, rendements en fractions).
const criteria = {
  residential: {
    maxBudget: 300000, downPayment: 40000, financing: 'bankLoan', propertyTypes: ['apartment'], minRooms: 3, minArea: 60,
    excludesGroundFloor: true, requiresElevator: false, outdoorSpaces: ['balcony'], requiresParking: false, worstEnergyClass: 'D',
    requiresDocumentedBuildability: false, requiresServiced: false, location: { place: 'Lyon' },
  },
  investment: {
    maxPrice: 250000, downPayment: 50000, worksBudget: 20000, assetTypes: ['apartment', 'hotel'], minGrossYield: 0.07, minNetYield: 0.045,
    minMonthlyCashFlow: 100, leasedOnly: true, includesMixedBuildings: true, minUnits: 2,
    location: { place: 'Annecy', radiusKilometers: 20, center: { latitude: 45.8992, longitude: 6.1294 } },
  },
  rental: { maxRent: 900, propertyTypes: ['apartment'], minArea: 30, furnished: true, moveInBy: '2026-12-15T12:00:00Z', location: { place: '' } },
  hotel: { scope: 'wallsOnly', maxBudget: 1500000, minRooms: 15, minStars: 3, minOccupancyRate: 0.65, location: { place: 'Nice' } },
};

describe('recherche réglée par le projet (SearchDraft(project:))', () => {
  it('part renseignée de la catégorie, comme ProjectCriteria.completion(for:)', () => {
    expect(projectCompletion('buy', criteria)).toBe(1);
    expect(projectCompletion('invest', criteria)).toBeCloseTo(6 / 7);
    expect(projectCompletion('rent', criteria)).toBeCloseTo(5 / 7);
    expect(projectCompletion('hotel', criteria)).toBeCloseTo(5 / 6);
    expect(projectCompletion('buy', null)).toBe(0);
    expect(projectCompletion('buy', { residential: { propertyTypes: ['land'] } })).toBeCloseTo(2 / 7);
    expect(projectCompletion('rent', { residential: { maxBudget: 1 } })).toBe(0);
  });

  it('Résidentiel : budget, types, pièces, surface et options ; grande ville sans commune choisie', () => {
    const draft = draftFromProject('buy', criteria);
    expect(draft).toEqual({
      ...defaultDraft('buy'), place: 'Lyon', priceMax: 300000, types: ['apartment'], roomsMin: 3, livingAreaMin: 60,
      excludesGroundFloor: true, outdoorSpaces: ['balcony'], worstEnergyClass: 'D',
    });
  });

  it('Investir : rendements en pourcentage, travaux, hôtel ignoré, commune choisie avec son centre', () => {
    const draft = draftFromProject('invest', criteria);
    expect(draft.types).toEqual(['apartment']);
    expect([draft.priceMax, draft.downPayment, draft.maxWorksAmount, draft.minGrossYieldPercent, draft.minNetYieldPercent]).toEqual([250000, 50000, 20000, 7, 4.5]);
    expect([draft.minMonthlyCashFlow, draft.leasedOnly, draft.mixedBuilding, draft.minUnits]).toEqual([100, true, true, 2]);
    expect([draft.place, draft.radiusKm]).toEqual(['Annecy', 20]);
    expect(draft.chosen).toEqual({ kind: 'municipality', name: 'Annecy', coordinate: { latitude: 45.8992, longitude: 6.1294 } });
    expect(paramsFromDraft(draft).get('mode')).toBe('invest');
  });

  it('Location et Hôtel', () => {
    const rent = draftFromProject('rent', criteria);
    expect([rent.priceMax, rent.types, rent.livingAreaMin, rent.furnished, rent.availableBy]).toEqual([900, ['apartment'], 30, true, '2026-12-15']);
    const hotel = draftFromProject('hotel', criteria);
    expect([hotel.types, hotel.priceMax, hotel.roomsMin, hotel.minHotelStars, hotel.minOccupancyRatePercent, hotel.hotelScope]).toEqual([['hotel'], 1500000, 15, 3, 65, 'wallsOnly']);
  });

  it('critères absents ou illisibles : la recherche par défaut de la catégorie', () => {
    expect(draftFromProject('buy', undefined)).toEqual(defaultDraft('buy'));
    expect(draftFromProject('rent', { rental: { maxRent: 'cher', propertyTypes: 'apartment', furnished: 1 } })).toEqual(defaultDraft('rent'));
  });
});
