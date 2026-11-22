import { describe, expect, it } from 'vitest';
import {
  budgetLabelOf, criteriaLabelsOf, draftFromQuery, modeOf, placeLabelOf, proposedName, queryFromDraft, resumeSummaryOf, sameQuery,
  writesPropertyTypes, type SearchQueryJson,
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

  it('résume la recherche de « Reprendre ma recherche » comme l’app', () => {
    const plain = (text: string) => text.replace(/[\u00A0\u202F]/g, ' ');
    expect(plain(resumeSummaryOf(RESIDENTIAL))).toBe('Appartement · ≤ 350 k€');
    expect(plain(resumeSummaryOf(HOTEL))).toBe('1 300 k€ – 9 900 k€');
    const lyon = { ...RESIDENTIAL, location: { around: { center: { latitude: 45.764, longitude: 4.8357 }, radiusMeters: 10000 } } } as SearchQueryJson;
    expect(plain(resumeSummaryOf(lyon))).toBe('Lyon · Appartement · ≤ 350 k€');
    const rent = { ...RESIDENTIAL, transaction: 'rent', price: { min: 600, max: 1250 }, propertyTypes: ['house', 'apartment'] } as unknown as SearchQueryJson;
    expect(plain(resumeSummaryOf(rent))).toBe('Appartement, Maison · 600 € – 1 250 €/mois');
    const bare = { ...RESIDENTIAL, price: {}, propertyTypes: [] } as unknown as SearchQueryJson;
    expect(resumeSummaryOf(bare)).toBe('Résidentiel');
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

describe('relance d’une recherche enregistrée (n° 10, 59, 62, 161, 162)', () => {
  const plain = (text: string) => text.replace(/[\u00A0\u202F]/g, ' ');

  it('un arrondissement garde son nom, et ses codes dans le lieu choisi', () => {
    const query = { ...RESIDENTIAL, location: { city: { name: 'Lyon 3e', postalCode: '69003', inseeCode: '69383' } } } as SearchQueryJson;
    const draft = draftFromQuery(query);
    expect(draft.place).toBe('Lyon 3e');
    expect(draft.chosen).toEqual({ kind: 'district', name: 'Lyon 3e', postalCode: '69003', inseeCode: '69383' });
    expect(queryFromDraft(draft)).toEqual(query);
    expect(draftFromQuery({ ...query, location: { city: { name: 'Paris 1er', postalCode: '75001' } } } as SearchQueryJson).chosen?.kind).toBe('district');
    expect(draftFromQuery({ ...query, location: { city: { name: 'Villeurbanne', postalCode: '69100', inseeCode: '69266' } } } as SearchQueryJson).chosen?.kind)
      .toBe('municipality');
    // Une commune saisie sans code reste du texte.
    const typed = draftFromQuery({ ...query, location: { city: { name: 'Lyon 3e' } } } as SearchQueryJson);
    expect(typed.place).toBe('Lyon 3e');
    expect(typed.chosen).toBeNull();
  });

  it('« Immeuble mixte » relancé garde « mixte seulement »', () => {
    const query = queryFromDraft({ ...defaultDraft('invest'), mixedBuilding: true });
    expect(query.propertyTypes).toEqual(['building']);
    expect(query.building).toEqual({ mixedOnly: true });
    const draft = draftFromQuery(query);
    expect(draft.mixedBuilding).toBe(true);
    expect(draft.types).toEqual([]);
    expect(queryFromDraft(draft)).toEqual(query);
  });

  it('seuls les types de la catégorie de la recherche valent « aucun choix »', () => {
    const rent = (propertyTypes: string[]) => ({ ...RESIDENTIAL, transaction: 'rent', propertyTypes } as unknown as SearchQueryJson);
    // Location avec Appartement, Maison, Terrain (les types de Résidentiel) : un vrai choix.
    expect(draftFromQuery(rent(['apartment', 'house', 'land'])).types).toEqual(['apartment', 'house', 'land']);
    expect(draftFromQuery(rent(['apartment', 'house', 'parking', 'land', 'commercial', 'office'])).types).toEqual([]);
    expect(draftFromQuery({ ...RESIDENTIAL, propertyTypes: ['land', 'house', 'apartment'] } as unknown as SearchQueryJson).types).toEqual([]);
    expect(writesPropertyTypes(rent(['apartment', 'house', 'land']))).toBe(true);
    expect(writesPropertyTypes({ ...RESIDENTIAL, propertyTypes: ['apartment', 'house', 'land'] } as unknown as SearchQueryJson)).toBe(false);
    expect(writesPropertyTypes(HOTEL)).toBe(false);
    expect(writesPropertyTypes(INVEST)).toBe(true);
    expect(writesPropertyTypes({ ...RESIDENTIAL, propertyTypes: [] } as unknown as SearchQueryJson)).toBe(false);
  });

  it('les types de la catégorie ne s’écrivent ni dans le nom, ni dans le résumé, ni dans les critères', () => {
    const all = { ...RESIDENTIAL, propertyTypes: ['apartment', 'house', 'land'] } as unknown as SearchQueryJson;
    expect(plain(proposedName(all, 'buy'))).toBe('Résidentiel · 50 m² et + · Jusqu\'à 350 000 €');
    expect(plain(resumeSummaryOf(all))).toBe('≤ 350 k€');
    expect(criteriaLabelsOf(all)).toEqual(['50 m² et +', '3 pièces min']);
  });

  it('« Rentabilité ≥ 7,5 % » : une décimale quand il y en a une', () => {
    const yieldOf = (minGrossYield: number) =>
      criteriaLabelsOf({ ...INVEST, investment: { ...INVEST.investment, minGrossYield } } as SearchQueryJson).map(plain);
    expect(yieldOf(0.075)).toContain('Rentabilité ≥ 7,5 %');
    expect(yieldOf(0.07)).toContain('Rentabilité ≥ 7 %');
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
    {
      label: 'Zone dessinée (tracé arrondi au mètre, comme sur le site)',
      draft: {
        ...base('buy'), priceMax: 400000, types: ['apartment'],
        drawnZone: [
          { latitude: 45.77412, longitude: 4.82061 }, { latitude: 45.7781, longitude: 4.84433 }, { latitude: 45.76902, longitude: 4.86725 },
          { latitude: 45.75218, longitude: 4.86194 }, { latitude: 45.74587, longitude: 4.83912 }, { latitude: 45.75633, longitude: 4.8215 },
        ],
      },
    },
    {
      label: 'Location « Autour de moi » près de Lyon (point arrondi à 3 décimales, comme sur le site)',
      draft: {
        ...base('rent'), place: 'Autour de moi', radiusKm: 20, priceMax: 1100, types: ['apartment'],
        chosen: { kind: 'municipality', name: 'Autour de moi', coordinate: { latitude: 45.758, longitude: 4.832 }, nearby: true, commune: 'Lyon' },
      },
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
      // Comme l'app (AppRouter, SearchDraft(query:)), un arrondissement se relit sous son nom, avec ses codes (n° 62).
      expect(queryFromDraft(draftFromQuery(entry.query)), entry.label).toEqual(entry.query);
      expect(modeOf(entry.query), entry.label).toBe(entry.mode);
    }
  });

  it('garde le fichier de contrôle à jour', async () => {
    await expect(`${JSON.stringify(entries, null, 2)}\n`).toMatchFileSnapshot('../../../scripts/fixtures/recherches-du-site.json');
  });
});

// Zone dessinée et « Autour de moi » (DrawnZoneTests.swift, NearbySearchTests.swift) : JSON écrit comme le Codable
// synthétisé de Swift (clés facultatives absentes, `area` en `{"_0": …}`), relu et réécrit à l'identique dans les deux sens.
describe('zone dessinée et « Autour de moi » : même JSON que l’app', () => {
  const triangle = [{ latitude: 45.74, longitude: 4.82 }, { latitude: 45.78, longitude: 4.84 }, { latitude: 45.74, longitude: 4.88 }];
  const BASE = {
    transaction: 'sale', propertyTypes: ['apartment', 'house', 'land'], price: { max: 400000 }, livingArea: {}, rooms: {}, bedrooms: {},
    floor: {}, requiresElevator: false, requiresOutdoorSpace: false, outdoorSpaces: [], requiresParking: false, excludesLeased: true,
  };
  /** Recherche par zone dessinée, telle que l'app l'enregistre : le rectangle de la zone, puis ses sommets. */
  const APP_ZONE = {
    ...BASE,
    location: { area: { _0: { southWest: { latitude: 45.74, longitude: 4.82 }, northEast: { latitude: 45.78, longitude: 4.88 } } } },
    drawnZone: triangle,
  } as unknown as SearchQueryJson;
  /** « Autour de moi » près de Lyon, enregistrée par l'app : « Autour de Lyon ». */
  const APP_NEARBY = {
    ...BASE,
    location: { around: { center: { latitude: 45.7578, longitude: 4.832 }, radiusMeters: 10000 } },
    locationLabel: 'Autour de Lyon',
  } as unknown as SearchQueryJson;

  it('relit une zone de l’app et la réécrit à l’identique', () => {
    const draft = draftFromQuery(APP_ZONE);
    expect(draft.drawnZone).toEqual(triangle);
    expect(draft.area).toBeNull();
    expect(draft.place).toBe('');
    expect(queryFromDraft(draft)).toEqual(APP_ZONE);
    expect(placeLabelOf(APP_ZONE)).toBe('Zone dessinée');
    // Les types de la catégorie de la recherche ne s'écrivent pas (SearchQuery.writesPropertyTypes, n° 59).
    expect(proposedName(APP_ZONE, 'buy').replace(/[\u00A0\u202F]/g, ' ')).toBe('Résidentiel · Zone dessinée · Jusqu\'à 400 000 €');
  });

  it('écrit une zone tracée sur le site comme l’app', () => {
    const query = queryFromDraft({ ...defaultDraft('buy'), drawnZone: triangle, priceMax: 400000 });
    expect(query).toEqual(APP_ZONE);
    expect(JSON.stringify(query.drawnZone)).toBe('[{"latitude":45.74,"longitude":4.82},{"latitude":45.78,"longitude":4.84},{"latitude":45.74,"longitude":4.88}]');
    // Un lieu saisi remplace la zone (l'app la vide dès qu'un lieu est saisi).
    expect(queryFromDraft({ ...defaultDraft('buy'), drawnZone: triangle, place: 'Lyon' }).drawnZone).toBeUndefined();
  });

  it('relit une recherche enregistrée avant la zone, ou avec une zone inutilisable, sans zone', () => {
    const old = { ...APP_ZONE } as Record<string, unknown>;
    delete old.drawnZone;
    const draft = draftFromQuery(old as unknown as SearchQueryJson);
    expect(draft.drawnZone).toBeNull();
    expect(draft.area).toEqual([4.82, 45.74, 4.88, 45.78]);
    expect(placeLabelOf(old as unknown as SearchQueryJson)).toBe('Zone de la carte');
    const unusable = { ...APP_ZONE, drawnZone: triangle.slice(0, 2) } as SearchQueryJson;
    expect(draftFromQuery(unusable).drawnZone).toBeNull();
    expect(placeLabelOf(unusable)).toBe('Zone de la carte');
  });

  it('distingue deux zones aux mêmes sommets dans un autre ordre', () => {
    const reversed = { ...APP_ZONE, drawnZone: [...triangle].reverse() } as SearchQueryJson;
    expect(sameQuery(APP_ZONE, { ...APP_ZONE })).toBe(true);
    expect(sameQuery(APP_ZONE, reversed)).toBe(false);
  });

  it('relit « Autour de Lyon » de l’app et la réécrit à l’identique', () => {
    const draft = draftFromQuery(APP_NEARBY);
    expect(draft.place).toBe('Autour de Lyon');
    expect(queryFromDraft(draft)).toEqual(APP_NEARBY);
    expect(placeLabelOf(APP_NEARBY)).toBe('Autour de Lyon');
    expect(resumeSummaryOf(APP_NEARBY).replace(/[\u00A0\u202F]/g, ' ')).toBe('Autour de Lyon · ≤ 400 k€');
  });

  it('écrit « Autour de moi » comme l’app : le point, 10 km, « Autour de <commune> »', () => {
    const nearby = {
      ...defaultDraft('buy'), place: 'Autour de moi', priceMax: 400000,
      chosen: { kind: 'municipality' as const, name: 'Autour de moi', coordinate: { latitude: 45.7578, longitude: 4.832 }, nearby: true as const, commune: 'Lyon' },
    };
    expect(queryFromDraft(nearby)).toEqual(APP_NEARBY);
    // Commune inconnue : « Autour de moi ».
    expect(queryFromDraft({ ...nearby, chosen: { ...nearby.chosen, commune: undefined } }).locationLabel).toBe('Autour de moi');
    expect(queryFromDraft({ ...nearby, radiusKm: 20 }).location).toEqual({ around: { center: { latitude: 45.7578, longitude: 4.832 }, radiusMeters: 20000 } });
  });
});
