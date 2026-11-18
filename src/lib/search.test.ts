import { describe, expect, it } from 'vitest';
import {
  boxAround, compactPrice, defaultDraft, distanceMeters, effectiveSort, filterChips, sortOptions, draftFromParams, locationFor, matches, paramsFromDraft, placeLabel,
  noResultsHints, propertyTypesFor, sortResults, type Highlights, type SearchDraft,
} from './search';
import { testRow } from './testRows';

const highlights = (grossYield: number, netYield = grossYield - 0.02, monthlyCashFlow = 50): Highlights =>
  ({ grossYield, netYield, monthlyCashFlow, isRentEstimated: false });

describe('recherche', () => {
  it('limite les types au mode, comme l’app', () => {
    expect(propertyTypesFor(defaultDraft('buy'))).toEqual(['apartment', 'house', 'land']);
    expect(propertyTypesFor({ ...defaultDraft('buy'), types: ['hotel'] })).toEqual(['apartment', 'house', 'land']);
    expect(propertyTypesFor({ ...defaultDraft('invest'), types: ['building'] })).toEqual(['building']);
    expect(propertyTypesFor(defaultDraft('hotel'))).toEqual(['hotel']);
  });

  it('cherche autour d’une grande ville et d’une commune choisie, par code postal pour un arrondissement', () => {
    const lyon = locationFor({ ...defaultDraft(), place: 'lyon' });
    expect(lyon.kind).toBe('around');
    expect(placeLabel({ ...defaultDraft(), place: 'lyon' })).toBe('Lyon et alentours');
    const peron: SearchDraft = {
      ...defaultDraft(), place: 'Péron',
      chosen: { kind: 'municipality', name: 'Péron', postalCode: '01630', coordinate: { latitude: 46.19, longitude: 5.92 } },
    };
    expect(locationFor(peron)).toEqual({ kind: 'around', center: { latitude: 46.19, longitude: 5.92 }, radiusMeters: 10_000 });
    expect(placeLabel(peron)).toBe('Péron et alentours');
    const lyon3: SearchDraft = { ...defaultDraft(), place: 'Lyon 3e', chosen: { kind: 'district', name: 'Lyon 3e', postalCode: '69003' } };
    expect(locationFor(lyon3)).toEqual({ kind: 'city', name: 'Lyon 3e', postalCode: '69003' });
    // Le texte du champ a changé depuis le choix : saisie libre.
    expect(locationFor({ ...lyon3, place: 'Lyon 3' })).toEqual({ kind: 'city', name: 'Lyon 3' });
  });

  it('applique la saisie libre sur la ville ou le début du code postal', () => {
    const row = testRow();
    expect(matches(row, { ...defaultDraft(), place: 'lyon 3' }, null)).toBe(false);
    expect(matches(row, { ...defaultDraft(), place: 'LYO' }, null)).toBe(true);
    expect(matches(row, { ...defaultDraft(), place: '690' }, null)).toBe(true);
    expect(matches(testRow({ city: 'Saint-Étienne', postal_code: '42000' }), { ...defaultDraft(), place: 'saint-etienne' }, null)).toBe(true);
  });

  it('vérifie la distance exacte autour d’un point', () => {
    const center = { latitude: 45.764, longitude: 4.8357 };
    const [west, south, east, north] = boxAround(center, 10_000);
    expect(distanceMeters(center, { latitude: north, longitude: center.longitude })).toBeCloseTo(10_000, -2);
    expect(west).toBeLessThan(center.longitude);
    expect(east).toBeGreaterThan(center.longitude);
    expect(south).toBeLessThan(center.latitude);
    const far = testRow({ public_latitude: 45.9, public_longitude: 4.99 });
    expect(matches(far, { ...defaultDraft(), place: 'Lyon' }, null)).toBe(false);
    expect(matches(testRow(), { ...defaultDraft(), place: 'Lyon' }, null)).toBe(true);
  });

  it('respecte les bornes incluses et ignore une fourchette inversée', () => {
    const row = testRow({ price: 250000, living_area: 62, rooms: 3 });
    expect(matches(row, { ...defaultDraft(), priceMin: 250000, priceMax: 250000 }, null)).toBe(true);
    expect(matches(row, { ...defaultDraft(), priceMax: 249999 }, null)).toBe(false);
    expect(matches(row, { ...defaultDraft(), priceMin: 300000, priceMax: 200000 }, null)).toBe(true);
    expect(matches(row, { ...defaultDraft(), roomsMin: 4 }, null)).toBe(false);
    expect(matches(testRow({ rooms: null }), { ...defaultDraft(), roomsMin: 1 }, null)).toBe(false);
    expect(matches(row, { ...defaultDraft(), livingAreaMax: 60 }, null)).toBe(false);
  });

  it('en location, les pièces ne comptent que pour les logements', () => {
    const parking = testRow({ transaction: 'rent', property_type: 'parking', rooms: null, price: 90 });
    expect(matches(parking, { ...defaultDraft('rent'), roomsMin: 2 }, null)).toBe(true);
  });

  it('Résidentiel écarte les biens vendus loués', () => {
    const leased = testRow({ rental_info: { isLeased: true, currentMonthlyRent: 900 } });
    expect(matches(leased, defaultDraft('buy'), null)).toBe(false);
  });

  it('Investir exige les indicateurs et applique les minimums', () => {
    const row = testRow();
    expect(matches(row, defaultDraft('invest'), null)).toBe(false);
    expect(matches(row, defaultDraft('invest'), highlights(0.06))).toBe(true);
    expect(matches(row, { ...defaultDraft('invest'), minGrossYieldPercent: 7 }, highlights(0.06))).toBe(false);
    expect(matches(row, { ...defaultDraft('invest'), minGrossYieldPercent: 6 }, highlights(0.06))).toBe(true);
    // Pourcentage impossible : ignoré.
    expect(matches(row, { ...defaultDraft('invest'), minGrossYieldPercent: 150 }, highlights(0.06))).toBe(true);
    expect(matches(row, { ...defaultDraft('invest'), minMonthlyCashFlow: 100 }, highlights(0.06, 0.04, 50))).toBe(false);
  });

  it('trie comme l’app, les annonces sans indicateur à la fin', () => {
    const a = { row: testRow({ id: 'a', price: 300000, published_at: '2026-11-02T00:00:00Z' }), highlights: highlights(0.05) };
    const b = { row: testRow({ id: 'b', price: 200000, published_at: '2026-11-03T00:00:00Z' }), highlights: null };
    const c = { row: testRow({ id: 'c', price: 250000, published_at: null }), highlights: highlights(0.08) };
    const ids = (sort: Parameters<typeof sortResults>[1]) => sortResults([a, b, c], sort).map((r) => r.row.id);
    expect(ids('newest')).toEqual(['b', 'a', 'c']);
    expect(ids('priceAscending')).toEqual(['b', 'c', 'a']);
    expect(ids('priceDescending')).toEqual(['a', 'c', 'b']);
    expect(ids('grossYieldDescending')).toEqual(['c', 'a', 'b']);
  });

  it('trie par pertinence par défaut, et seulement avec les tris du mode', () => {
    expect(defaultDraft('invest').sort).toBe('newest');
    expect(sortOptions('invest')).toEqual(['newest', 'netYieldDescending', 'grossYieldDescending', 'cashFlowDescending', 'priceAscending']);
    expect(effectiveSort({ ...defaultDraft('buy'), sort: 'cashFlowDescending' })).toBe('newest');
    expect(effectiveSort({ ...defaultDraft('invest'), sort: 'cashFlowDescending' })).toBe('cashFlowDescending');
  });

  it('garde la recherche dans l’adresse de la page', () => {
    const draft: SearchDraft = {
      ...defaultDraft('invest'), place: 'Péron',
      chosen: { kind: 'municipality', name: 'Péron', postalCode: '01630', inseeCode: '01288', coordinate: { latitude: 46.19240, longitude: 5.92425 } },
      radiusKm: 20, priceMax: 300000, roomsMin: 2, types: ['apartment', 'house'], minGrossYieldPercent: 7, downPayment: 30000, minMonthlyCashFlow: -50,
    };
    const again = draftFromParams(paramsFromDraft(draft));
    expect(again).toEqual(draft);
    expect(draftFromParams(new URLSearchParams('mode=pirate&prixMin=-5&tri=x&zone=1,2,3'))).toEqual(defaultDraft('buy'));
  });
});

describe('aucune annonce : pistes', () => {
  const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
  it('propose le rayon suivant autour d’une ville, puis chaque critère en moins (SearchNoResults de l’app)', () => {
    const lyon: SearchDraft = { ...defaultDraft('buy'), place: 'Lyon', priceMax: 50000, roomsMin: 2 };
    const hints = noResultsHints(lyon);
    expect(hints.map((hint) => [hint.id, plain(hint.label)])).toEqual([
      ['radius-20', 'Élargir à 20 km'], ['budget', 'Sans « Budget : 50 k€ »'], ['rooms', 'Sans « 2 pièces min »'],
    ]);
    expect(hints[0].draft.radiusKm).toBe(20);
    expect(hints[1].draft).toMatchObject({ priceMax: null, roomsMin: 2, place: 'Lyon' });
    expect(hints[2].draft).toMatchObject({ priceMax: 50000, roomsMin: null });
  });

  it('autour d’un centre, le rayon n’est pas une piste « Sans » ; à 100 km, plus de rayon plus large', () => {
    const wide: SearchDraft = { ...defaultDraft('buy'), place: 'Lyon', radiusKm: 100, priceMax: 50000 };
    expect(noResultsHints(wide).map((hint) => hint.id)).toEqual(['budget']);
    const five: SearchDraft = { ...defaultDraft('buy'), place: 'Lyon', radiusKm: 5 };
    expect(noResultsHints(five).map((hint) => plain(hint.label))).toEqual(['Élargir à 10 km']);
  });

  it('sans centre (commune saisie, partout) : seulement les critères', () => {
    expect(noResultsHints({ ...defaultDraft('rent'), place: 'Lyon 3e', priceMax: 900 }).map((hint) => plain(hint.label))).toEqual(['Sans « Loyer : 900 € »']);
    expect(noResultsHints(defaultDraft('invest'))).toEqual([]);
  });
});

describe('pastilles des critères', () => {
  it('écrit les critères comme l’app', () => {
    const plain = (s: string) => s.replace(/[  ]/g, ' ');
    const labels = (d: Parameters<typeof filterChips>[0]) => filterChips(d).map((c) => plain(c.label));
    expect(labels({ ...defaultDraft('buy'), priceMin: 150000, priceMax: 250000, livingAreaMin: 40, roomsMin: 3, types: ['house'] }))
      .toEqual(['Budget : 150 k€ – 250 k€', 'Maison', 'Surface : min 40 m²', '3 pièces min']);
    expect(labels({ ...defaultDraft('rent'), priceMax: 900 })).toEqual(['Loyer : 900 €']);
    expect(labels({ ...defaultDraft('buy'), priceMin: 300000, priceMax: 100000 })).toEqual([]);
    expect(labels({ ...defaultDraft('invest'), minGrossYieldPercent: 7, minMonthlyCashFlow: -50, downPayment: 30000 }))
      .toEqual(['Rendement : 7 %', 'Cash-flow : −50 €', 'Apport : 30 k€']);
    expect(labels({ ...defaultDraft('hotel'), roomsMin: 1 })).toEqual(['1 chambre min']);
    expect(plain(compactPrice(1250))).toBe('1 250 €');
  });
});

describe('zone dessinée et « Autour de moi »', () => {
  const triangle = [{ latitude: 45.74, longitude: 4.82 }, { latitude: 45.78, longitude: 4.84 }, { latitude: 45.74, longitude: 4.88 }];
  const zoneDraft: SearchDraft = { ...defaultDraft(), drawnZone: triangle };
  const nearby: SearchDraft = {
    ...defaultDraft(), place: 'Autour de moi',
    chosen: { kind: 'municipality', name: 'Autour de moi', coordinate: { latitude: 45.758, longitude: 4.832 }, nearby: true, commune: 'Lyon' },
  };

  it('cherche dans le rectangle de la zone, puis garde les biens du polygone (comme SearchMatching)', () => {
    expect(locationFor(zoneDraft)).toEqual({ kind: 'area', box: [4.82, 45.74, 4.88, 45.78] });
    expect(placeLabel(zoneDraft)).toBe('Zone dessinée');
    expect(matches(testRow({ public_latitude: 45.75, public_longitude: 4.85 }), zoneDraft, null)).toBe(true);
    // Dans le rectangle mais hors du triangle.
    expect(matches(testRow({ public_latitude: 45.775, public_longitude: 4.825 }), zoneDraft, null)).toBe(false);
    expect(matches(testRow({ public_latitude: null, public_longitude: null }), zoneDraft, null)).toBe(false);
    // Sans zone utilisable, seul le rectangle compte… et sans rectangle non plus, partout.
    const twoPoints = { ...zoneDraft, drawnZone: triangle.slice(0, 2) };
    expect(locationFor(twoPoints)).toEqual({ kind: 'anywhere' });
    // Un lieu saisi passe avant la zone.
    expect(locationFor({ ...zoneDraft, place: 'Lyon' }).kind).toBe('around');
  });

  it('garde la zone et « Autour de moi » dans l’adresse de la page', () => {
    const params = paramsFromDraft(zoneDraft);
    expect(params.get('dessin')).toBe('45.74,4.82,45.78,4.84,45.74,4.88');
    expect(params.has('lieu')).toBe(false);
    expect(draftFromParams(params).drawnZone).toEqual(triangle);
    // Un lieu dans l'adresse : pas de zone.
    params.set('lieu', 'Lyon');
    expect(draftFromParams(params).drawnZone).toBeNull();
    const nearbyParams = paramsFromDraft(nearby);
    expect(Object.fromEntries(nearbyParams)).toEqual({ mode: 'buy', lieu: 'Autour de moi', choix: 'municipality', lat: '45.75800', lng: '4.83200', autour: 'Lyon' });
    expect(draftFromParams(nearbyParams)).toEqual(nearby);
    const withoutCommune = { ...nearby, chosen: { ...nearby.chosen!, commune: undefined } };
    const read = draftFromParams(paramsFromDraft(withoutCommune));
    expect(read.chosen?.nearby).toBe(true);
    expect(read.chosen?.commune).toBeUndefined();
  });

  it('cherche autour de la position, avec le rayon de 10 km par défaut, et l’affiche tel quel', () => {
    expect(locationFor(nearby)).toEqual({ kind: 'around', center: { latitude: 45.758, longitude: 4.832 }, radiusMeters: 10_000 });
    expect(locationFor({ ...nearby, radiusKm: 20 })).toMatchObject({ radiusMeters: 20_000 });
    expect(placeLabel(nearby)).toBe('Autour de moi');
    // Recherche enregistrée « Autour de Lyon », relue : telle quelle aussi.
    expect(placeLabel({ ...defaultDraft(), place: 'Autour de Lyon', chosen: { kind: 'municipality', name: 'Autour de Lyon', coordinate: { latitude: 45.758, longitude: 4.832 } } }))
      .toBe('Autour de Lyon');
  });
});
