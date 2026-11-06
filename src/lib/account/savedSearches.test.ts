import { describe, expect, it } from 'vitest';
import {
  budgetLabelOf, criteriaLabelsOf, draftFromQuery, modeOf, placeLabelOf, proposedName, queryFromDraft, sameQuery,
  type SearchQueryJson,
} from './savedSearches';
import { defaultDraft, type SearchDraft } from '../search';

// Les trois recherches enregistrées par l'app sur le serveur (lues le 6 novembre 2026), telles quelles : le site doit
// les relire et les réécrire à l'identique, sinon l'iPhone ne saurait plus les lire.
const RESIDENTIAL = {
  floor: {}, price: { max: 350000 }, rooms: { min: 3 }, bedrooms: {}, location: { anywhere: {} }, livingArea: { min: 50 },
  transaction: 'sale', outdoorSpaces: [], propertyTypes: ['apartment'], excludesLeased: true, requiresParking: false,
  requiresElevator: false, requiresOutdoorSpace: false,
} as unknown as SearchQueryJson;

const INVEST = {
  floor: {}, price: { max: 250000 }, rooms: {}, bedrooms: {}, location: { anywhere: {} },
  investment: { leasedOnly: false, downPayment: 50000, minGrossYield: 0.07, maxWorksAmount: 15000, minMonthlyCashFlow: 100, requiresDeclaredRent: false },
  livingArea: {}, transaction: 'sale', outdoorSpaces: [], propertyTypes: ['apartment'], requiresParking: false,
  requiresElevator: false, requiresOutdoorSpace: false,
} as unknown as SearchQueryJson;

const HOTEL = {
  floor: {}, hotel: { scope: 'businessOnly', minStars: 5, minAnnualRevenue: 1000000 }, price: { max: 9900000, min: 1300000 },
  rooms: {}, bedrooms: {}, location: { anywhere: {} }, livingArea: { min: 450 }, transaction: 'sale', outdoorSpaces: [],
  propertyTypes: ['hotel'], requiresParking: false, requiresElevator: false, requiresOutdoorSpace: false,
} as unknown as SearchQueryJson;

describe('recherches enregistrées : même format que l’app', () => {
  it.each([['Résidentiel', RESIDENTIAL], ['Investir', INVEST], ['Hôtels', HOTEL]])('relit et réécrit « %s » à l’identique', (_name, query) => {
    const again = queryFromDraft(draftFromQuery(query));
    expect(again).toEqual(query);
    expect(sameQuery(again, query)).toBe(true);
  });

  it('retrouve la catégorie de chaque recherche', () => {
    expect(modeOf(RESIDENTIAL)).toBe('buy');
    expect(modeOf(INVEST)).toBe('invest');
    expect(modeOf(HOTEL)).toBe('hotel');
  });

  it('propose le même nom que l’app', () => {
    // Noms enregistrés par l'iPhone (mêmes espaces fines que l'app).
    expect(proposedName(INVEST, 'invest')).toBe('Investir · Appartement · Jusqu\'à 250 000 €');
    expect(proposedName(HOTEL, 'hotel')).toBe('Hôtels · 450 m² et + · 1 300 000 € – 9 900 000 €');
  });

  it('écrit les libellés de la carte', () => {
    expect(placeLabelOf(RESIDENTIAL)).toBeNull();
    expect(budgetLabelOf(RESIDENTIAL)).toBe('Jusqu\'à 350 000 €');
    expect(criteriaLabelsOf(RESIDENTIAL)[0]).toBe('Appartement');
  });

  it('écrit une recherche faite sur le site comme l’app', () => {
    const draft = { ...defaultDraft('buy'), place: 'Lyon', types: ['apartment' as const], priceMax: 300000, roomsMin: 2 };
    const query = queryFromDraft(draft) as unknown as Record<string, unknown>;
    expect(query.transaction).toBe('sale');
    expect(query.propertyTypes).toEqual(['apartment']);
    expect(query.price).toEqual({ max: 300000 });
    expect(query.rooms).toEqual({ min: 2 });
    expect(query.excludesLeased).toBe(true);
    // « Lyon » est une grande ville connue : la recherche porte sur Lyon et ses alentours (10 km).
    expect(query.location).toMatchObject({ around: { radiusMeters: 10000 } });
    expect(query.locationLabel).toBeUndefined();
    // Jamais de valeur vide ou de texte à la place d'un nombre.
    expect(JSON.stringify(query)).not.toMatch(/null|"\d+"/);
  });

  it('distingue deux recherches différentes et ignore l’ordre des types', () => {
    const a = { ...RESIDENTIAL, propertyTypes: ['apartment', 'house'] } as unknown as SearchQueryJson;
    const b = { ...RESIDENTIAL, propertyTypes: ['house', 'apartment'] } as unknown as SearchQueryJson;
    expect(sameQuery(a, b)).toBe(true);
    expect(sameQuery(RESIDENTIAL, INVEST)).toBe(false);
  });
});

// Recherches écrites par le site, gardées dans scripts/fixtures/recherches-du-site.json : l'app iPhone doit savoir
// les décoder (test à faire tourner sur le Mac avant la mise en ligne de l'étape 2). Le fichier est réécrit si
// l'encodage change : toute différence se voit dans le dépôt.
describe('recherches enregistrées depuis le site : fichier de contrôle pour l’app', () => {
  const base = defaultDraft;
  const drafts: { label: string; draft: SearchDraft }[] = [
    {
      label: 'Résidentiel, Lyon et alentours, critères des filtres',
      draft: {
        ...base('buy'), place: 'Lyon', types: ['apartment', 'house'], priceMax: 300000, roomsMin: 3, livingAreaMin: 50,
        bedroomsMin: 2, worstEnergyClass: 'D', excludesGroundFloor: true, requiresElevator: true,
        outdoorSpaces: ['balcony', 'terrace'], requiresParking: true, isNewBuild: false, yearBuiltMin: 1950,
      },
    },
    {
      label: 'Résidentiel, terrain autour d’une commune choisie',
      draft: {
        ...base('buy'), place: 'Péron',
        chosen: { kind: 'municipality', name: 'Péron', postalCode: '01630', inseeCode: '01288', coordinate: { latitude: 46.19, longitude: 5.93 } },
        types: ['land'], priceMax: 180000, requiresDocumentedBuildability: true, requiresServiced: true, zoning: 'UB',
      },
    },
    {
      label: 'Résidentiel, un arrondissement (par son code postal)',
      draft: {
        ...base('buy'), place: 'Lyon 3e', chosen: { kind: 'district', name: 'Lyon 3e', postalCode: '69003', inseeCode: '69383' },
        priceMin: 150000, priceMax: 400000, livingAreaMax: 90, floorMin: 1, floorMax: 5, yearBuiltMax: 2000,
      },
    },
    {
      label: 'Location meublée à Paris',
      draft: { ...base('rent'), place: 'Paris', radiusKm: 5, priceMax: 1200, furnished: true, maxMonthlyCharges: 150, availableBy: '2027-01-01' },
    },
    {
      label: 'Investir, appartement loué',
      draft: {
        ...base('invest'), types: ['apartment'], priceMax: 250000, downPayment: 50000, minGrossYieldPercent: 7, minNetYieldPercent: 5,
        minMonthlyCashFlow: 100, maxWorksAmount: 15000, leasedOnly: true, requiresDeclaredRent: true, maxAnnualPropertyTax: 1500,
        minCurrentMonthlyRent: 600,
      },
    },
    {
      label: 'Investir, immeuble mixte',
      draft: { ...base('invest'), types: ['building'], mixedBuilding: true, minUnits: 4, maxVacantUnits: 1, maxAnnualCharges: 5000 },
    },
    {
      label: 'Hôtels, murs et fonds',
      draft: {
        ...base('hotel'), types: ['hotel'], hotelScope: 'wallsAndBusiness', minHotelStars: 3, minAnnualRevenue: 1000000, minEbitda: 200000,
        minOperatingIncome: 100000, minOccupancyRatePercent: 60, livingAreaMin: 450, priceMin: 1300000, priceMax: 9900000,
      },
    },
    {
      label: 'Zone de la carte',
      draft: { ...base('buy'), area: [4.8, 45.73, 4.9, 45.79], priceMax: 400000 },
    },
  ];
  const entries = drafts.map(({ label, draft }) => {
    const query = queryFromDraft(draft);
    return { label, mode: draft.mode, name: proposedName(query, draft.mode), query };
  });

  it('écrit des requêtes sans valeur vide, relues à l’identique', () => {
    for (const entry of entries) {
      // Les codes postaux et INSEE restent du texte (« 01630 »), comme dans l'app ; les montants, des nombres.
      const numbers = JSON.stringify(entry.query, (key, value) => (key === 'postalCode' || key === 'inseeCode' ? undefined : value));
      expect(numbers, entry.label).not.toMatch(/null|"\d+"/);
      // Comme l'app (AppRouter, SearchDraft(query:)), un arrondissement se relit par son code postal : même résultat.
      const location = entry.query.location;
      const expected = 'city' in location && location.city.postalCode
        ? { ...entry.query, location: { city: { name: location.city.postalCode } } }
        : entry.query;
      expect(queryFromDraft(draftFromQuery(entry.query)), entry.label).toEqual(expected);
      expect(modeOf(entry.query), entry.label).toBe(entry.mode);
    }
  });

  it('garde le fichier de contrôle à jour', async () => {
    await expect(`${JSON.stringify(entries, null, 2)}\n`).toMatchFileSnapshot('../../../scripts/fixtures/recherches-du-site.json');
  });
});
