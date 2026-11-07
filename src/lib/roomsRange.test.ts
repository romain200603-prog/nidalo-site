import { describe, expect, it } from 'vitest';
import { criteriaLabelsOf, draftFromQuery, queryFromDraft, type SearchQueryJson } from './account/savedSearches';
import { bedroomsLabel, homeTiles, roomsLabel } from './homeCriteria';
import {
  BEDROOM_NOUNS, countRangeLabel, defaultDraft, draftFromParams, filterChips, matches, paramsFromDraft, ROOM_NOUNS, type SearchDraft,
} from './search';
import { testRow } from './testRows';

// Pièces et chambres : minimum et maximum (« 2 à 4 pièces »), et plus de « et + » dans les libellés (demande du
// 7 novembre 2026, faite aussi dans l'app). Données inventées.

const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
const labels = (draft: SearchDraft) => filterChips(draft).map((chip) => plain(chip.label));
const buy = defaultDraft('buy');

describe('pièces et chambres : minimum et maximum', () => {
  it('garde les biens dans la fourchette, bornes incluses', () => {
    const range = { ...buy, roomsMin: 2, roomsMax: 4 };
    expect([1, 2, 3, 4, 5].map((rooms) => matches(testRow({ rooms }), range, null))).toEqual([false, true, true, true, false]);
    expect(matches(testRow({ rooms: null }), range, null)).toBe(false);
    expect(matches(testRow({ rooms: 6 }), { ...buy, roomsMax: 5 }, null)).toBe(false);
    expect(matches(testRow({ rooms: 2 }), { ...buy, roomsMax: 2 }, null)).toBe(true);
    // Chambres : 1 à 2.
    const bedrooms = { ...buy, bedroomsMin: 1, bedroomsMax: 2 };
    expect([0, 1, 2, 3].map((count) => matches(testRow({ bedrooms: count }), bedrooms, null))).toEqual([false, true, true, false]);
  });

  it('un minimum au-dessus du maximum n’est pas appliqué, et ne donne pas de pastille', () => {
    expect(matches(testRow({ rooms: 5 }), { ...buy, roomsMin: 4, roomsMax: 2 }, null)).toBe(true);
    expect(matches(testRow({ bedrooms: 5 }), { ...buy, bedroomsMin: 3, bedroomsMax: 1 }, null)).toBe(true);
    expect(labels({ ...buy, roomsMin: 4, roomsMax: 2, bedroomsMin: 3, bedroomsMax: 1 })).toEqual([]);
  });

  it('libellés : fourchette, nombre exact, minimum seul, maximum seul', () => {
    expect(countRangeLabel(2, 4, ROOM_NOUNS)).toBe('2 à 4 pièces');
    expect(countRangeLabel(3, 3, ROOM_NOUNS)).toBe('3 pièces');
    expect(countRangeLabel(1, 1, ROOM_NOUNS)).toBe('1 pièce');
    expect(countRangeLabel(2, null, ROOM_NOUNS)).toBe('2 pièces min');
    expect(countRangeLabel(null, 4, ROOM_NOUNS)).toBe('4 pièces max');
    expect(countRangeLabel(undefined, 1, BEDROOM_NOUNS)).toBe('1 chambre max');
    expect(countRangeLabel(4, 2, ROOM_NOUNS)).toBeNull();
    expect(countRangeLabel(null, undefined, ROOM_NOUNS)).toBeNull();
  });

  it('pastilles : une par critère, qui retire le minimum et le maximum', () => {
    const draft = { ...buy, roomsMin: 2, roomsMax: 4, bedroomsMin: 1, bedroomsMax: 2 };
    expect(labels(draft)).toEqual(['2 à 4 pièces', '1 à 2 chambres']);
    const chips = filterChips(draft);
    const withoutRooms = chips.find((chip) => chip.id === 'rooms')!.remove(draft);
    expect([withoutRooms.roomsMin, withoutRooms.roomsMax, withoutRooms.bedroomsMin]).toEqual([null, null, 1]);
    const withoutBedrooms = chips.find((chip) => chip.id === 'bedrooms')!.remove(draft);
    expect([withoutBedrooms.bedroomsMin, withoutBedrooms.bedroomsMax, withoutBedrooms.roomsMax]).toEqual([null, null, 4]);
    expect(labels({ ...buy, roomsMax: 3 })).toEqual(['3 pièces max']);
  });

  it('hôtels : seulement un minimum de chambres', () => {
    const hotel = { ...defaultDraft('hotel'), roomsMin: 10, roomsMax: 12 };
    expect(labels(hotel)).toEqual(['10 chambres min']);
    const big = testRow({ property_type: 'hotel', rooms: 30 });
    expect(matches(big, hotel, null)).toBe(true);
  });

  it('adresse de la page : piecesMax et chambresMax, jamais pour un hôtel', () => {
    const draft = { ...buy, roomsMin: 2, roomsMax: 4, bedroomsMax: 3 };
    const params = paramsFromDraft(draft);
    expect([params.get('piecesMin'), params.get('piecesMax'), params.get('chambresMax')]).toEqual(['2', '4', '3']);
    expect(draftFromParams(params)).toEqual(draft);
    expect(draftFromParams(new URLSearchParams('mode=hotel&piecesMin=10&piecesMax=20&chambresMax=3')))
      .toEqual({ ...defaultDraft('hotel'), roomsMin: 10 });
  });

  it('recherches enregistrées : minimum et maximum, relus à l’identique', () => {
    const draft = { ...buy, roomsMin: 2, roomsMax: 4, bedroomsMax: 3 };
    const query = queryFromDraft(draft);
    expect([query.rooms, query.bedrooms]).toEqual([{ min: 2, max: 4 }, { max: 3 }]);
    expect(draftFromQuery(query)).toMatchObject({ roomsMin: 2, roomsMax: 4, bedroomsMin: null, bedroomsMax: 3 });
    expect(criteriaLabelsOf(query)).toContain('2 à 4 pièces');
    // Une fourchette incohérente n'est pas enregistrée (comme le prix).
    expect(queryFromDraft({ ...buy, roomsMin: 4, roomsMax: 2 }).rooms).toEqual({});
    // Hôtel : des chambres, et pas de maximum.
    const hotel = queryFromDraft({ ...defaultDraft('hotel'), roomsMin: 15 });
    expect(hotel.rooms).toEqual({ min: 15 });
    expect(criteriaLabelsOf(hotel)).toEqual(['15 chambres min']);
    expect(draftFromQuery({ ...hotel, rooms: { min: 15, max: 30 } } as SearchQueryJson).roomsMax).toBeNull();
  });
});

describe('accueil : nombre de pièces sans « et + »', () => {
  it('libellés du menu', () => {
    expect([roomsLabel(null), roomsLabel(1), roomsLabel(2), roomsLabel(5)]).toEqual(['Indifférent', '1 pièce', '2 pièces', '5 pièces']);
    expect([bedroomsLabel(null), bedroomsLabel(10)]).toEqual(['Indifférent', '10 chambres']);
  });

  it('la tuile montre la fourchette des filtres, et un nouveau minimum la garde cohérente', () => {
    const tileOf = (draft: SearchDraft) => {
      const tile = homeTiles(draft).find((spec) => spec.id === 'rooms');
      if (!tile || tile.kind !== 'single') throw new Error('tuile « Nombre de pièces » absente');
      return tile;
    };
    const draft = { ...buy, roomsMin: 2, roomsMax: 3 };
    const tile = tileOf(draft);
    expect(tile.options.map((option) => option.title)).toEqual(['Indifférent', '1 pièce', '2 pièces', '3 pièces', '4 pièces', '5 pièces']);
    expect(tile.format(tile.value)).toBe('2 à 3 pièces');
    expect(tileOf({ ...buy, roomsMin: 2 }).format(2)).toBe('2 pièces');
    // Un minimum au-dessus du maximum retire le maximum ; « Toutes les tailles » retire les deux.
    expect([tile.apply(draft, 4).roomsMin, tile.apply(draft, 4).roomsMax]).toEqual([4, null]);
    expect([tile.apply(draft, 1).roomsMin, tile.apply(draft, 1).roomsMax]).toEqual([1, 3]);
    expect([tile.apply(draft, null).roomsMin, tile.apply(draft, null).roomsMax]).toEqual([null, null]);
  });
});
