import { describe, expect, it } from 'vitest';
import {
  categoryIncludes, favoriteCard, favoriteDetails, favoriteSuggestions, floorLabel, matchesText, relevanceOrder,
  savedCountText, sortFavorites,
} from './favoriteCards';
import { testRow } from '../testRows';

describe('cartes des favoris (FavoriteCardText de l’app)', () => {
  it('écrit l’étage comme l’app', () => {
    expect(floorLabel(0)).toBe('Rez-de-chaussée');
    expect(floorLabel(-1)).toBe('Rez-de-chaussée');
    expect(floorLabel(1)).toBe('1er étage');
    expect(floorLabel(3)).toBe('3e étage');
  });

  it('logement : ville, surface, pièces et étage', () => {
    const row = testRow({ city: 'Lyon', living_area: 62, rooms: 3, floor: 2 });
    expect(favoriteDetails(row, 'purchase')).toBe('Lyon · 62 m² · 3 pièces · 2e étage');
    expect(favoriteDetails(testRow({ rooms: 1, floor: 0 }), 'purchase')).toBe('Lyon · 62 m² · 1 pièce · Rez-de-chaussée');
  });

  it('autres biens : ville et surface seulement', () => {
    const row = testRow({ property_type: 'commercial', living_area: 85.5, rooms: 2, floor: 1 });
    expect(favoriteDetails(row, 'commercial')).toBe('Lyon · 85,5 m²');
  });

  it('terrain : surface du terrain, puis surface constructible justifiée', () => {
    const row = testRow({
      property_type: 'land', living_area: 0, land_area: 740,
      asset_details: { land: { _0: { zoning: 'UB', buildability: { floorArea: 300, documentReference: 'PLU 2024' } } } },
    });
    expect(favoriteDetails(row, 'land')).toBe('Lyon · 740 m² · Constructible 300 m²');
  });

  it('range chaque fiche dans sa catégorie', () => {
    expect(categoryIncludes('residential', 'purchase')).toBe(true);
    expect(categoryIncludes('residential', 'land')).toBe(true);
    expect(categoryIncludes('investment', 'building')).toBe(true);
    expect(categoryIncludes('investment', 'purchase')).toBe(false);
    expect(categoryIncludes('rental', 'rental')).toBe(true);
    expect(categoryIncludes('hotel', 'hotel')).toBe(true);
    expect(categoryIncludes('all', 'office')).toBe(true);
  });

  it('une vente dont le loyer est connu est un investissement, avec son rendement brut', () => {
    const leased = favoriteCard(testRow({ price: 200000, rental_info: { isLeased: true, currentMonthlyRent: 1000 } }));
    expect(leased.content.kind).toBe('investment');
    expect(leased.grossYield).toBeCloseTo(0.06, 5);
    const home = favoriteCard(testRow({ rental_info: null }));
    expect(home.content.kind).toBe('purchase');
    expect(home.grossYield).toBeNull();
    const rental = favoriteCard(testRow({ transaction: 'rent', price: 900, rental_info: null }));
    expect(rental.content.kind).toBe('rental');
    expect(rental.grossYield).toBeNull();
  });

  it('cherche chaque mot dans le titre, la ville, le code postal ou le type', () => {
    const row = testRow({ title: 'Studio rénové', city: 'Saint-Étienne', postal_code: '42000', property_type: 'apartment' });
    expect(matchesText(row, 'etienne')).toBe(true);
    expect(matchesText(row, 'appartement 42')).toBe(true);
    expect(matchesText(row, 'RENOVE')).toBe(true);
    expect(matchesText(row, 'maison')).toBe(false);
    expect(matchesText(row, '   ')).toBe(true);
  });

  it('propose les types puis les villes des favoris, dès 2 lettres', () => {
    const rows = [
      testRow({ id: 'a', city: 'Lyon', postal_code: '69003', property_type: 'apartment' }),
      testRow({ id: 'b', city: 'Lyon', postal_code: '69007', property_type: 'house' }),
      testRow({ id: 'c', city: 'Limonest', postal_code: '69760', property_type: 'land' }),
    ];
    expect(favoriteSuggestions('l', rows)).toEqual([]);
    expect(favoriteSuggestions('ly', rows)).toEqual([{ kind: 'city', value: 'Lyon', detail: '69003 · Ville' }]);
    expect(favoriteSuggestions('69', rows).map((s) => s.value)).toEqual(['Lyon', 'Limonest']);
    expect(favoriteSuggestions('ma', rows)).toEqual([{ kind: 'propertyType', value: 'Maison', detail: 'Type de bien' }]);
    // Saisie déjà complète : plus rien à proposer.
    expect(favoriteSuggestions('Lyon', rows)).toEqual([]);
  });

  it('trie comme l’app', () => {
    const cards = [
      { row: testRow({ id: 'a', price: 300000, published_at: '2026-11-01T10:00:00Z' }) },
      { row: testRow({ id: 'b', price: 200000, published_at: '2026-11-03T10:00:00Z' }) },
      { row: testRow({ id: 'c', price: 100000, published_at: '2026-11-01T10:00:00Z' }) },
    ];
    expect(relevanceOrder(cards).map((c) => c.row.id)).toEqual(['b', 'c', 'a']);
    const added = new Map([['a', '2026-11-05T08:00:00Z'], ['b', '2026-11-02T08:00:00Z'], ['c', '2026-11-04T08:00:00Z']]);
    expect(sortFavorites(cards, 'priceAscending', added).map((c) => c.row.id)).toEqual(['c', 'b', 'a']);
    expect(sortFavorites(cards, 'priceDescending', added).map((c) => c.row.id)).toEqual(['a', 'b', 'c']);
    expect(sortFavorites(cards, 'recentlyAdded', added).map((c) => c.row.id)).toEqual(['a', 'c', 'b']);
  });

  it('compte les biens sauvegardés', () => {
    expect(savedCountText(1, 1)).toBe('1 bien sauvegardé');
    expect(savedCountText(3, 3)).toBe('3 biens sauvegardés');
    expect(savedCountText(2, 3)).toBe('2 sur 3 biens');
  });
});
