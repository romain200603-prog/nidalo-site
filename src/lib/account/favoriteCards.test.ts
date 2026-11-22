import { describe, expect, it } from 'vitest';
import {
  categoryIncludes, favoriteCard, favoriteDetails, favoriteSuggestions, floorLabel, listingCategoryMode, matchesText, relevanceOrder,
  savedCountText, sortFavorites,
} from './favoriteCards';
import { testRow } from '../testRows';

describe('cartes des favoris (FavoriteCardText de l’app)', () => {
  it('écrit l’étage comme l’app', () => {
    expect(floorLabel(0)).toBe('Rez-de-chaussée');
    // Étage négatif : « Sous-sol », comme partout dans l'app (n° 238).
    expect(floorLabel(-1)).toBe('Sous-sol');
    expect(floorLabel(-2)).toBe('Sous-sol');
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

  it('terrain à louer : la surface du terrain, comme un terrain (n° 144)', () => {
    const row = testRow({ transaction: 'rent', property_type: 'land', publish_category: 'rental', living_area: 0, land_area: 1200, rooms: null, floor: null });
    expect(favoriteDetails(row, 'rental').replace(/[\u00A0\u202F]/g, ' ')).toBe('Lyon · 1 200 m²');
  });

  it('la carte suit la catégorie de l’annonce (PublishCategory.of, n° 174)', () => {
    expect(listingCategoryMode(testRow({ transaction: 'rent', publish_category: 'rental' }))).toBe('rent');
    expect(listingCategoryMode(testRow({ publish_category: 'investment' }))).toBe('invest');
    expect(listingCategoryMode(testRow({ publish_category: 'residential', rental_info: { isLeased: true, currentMonthlyRent: 800 } }))).toBe('buy');
    // Catégorie absente ou qui ne propose pas ce type : celle de la transaction et du type.
    expect(listingCategoryMode(testRow({ publish_category: null, rental_info: { isLeased: true, currentMonthlyRent: 800 } }))).toBe('invest');
    expect(listingCategoryMode(testRow({ publish_category: 'residential', property_type: 'building' }))).toBe('invest');
    expect(listingCategoryMode(testRow({ publish_category: 'rental', property_type: 'hotel' }))).toBe('hotel');
    expect(listingCategoryMode(testRow({ publish_category: null, property_type: 'land' }))).toBe('buy');
    expect(listingCategoryMode(testRow({ publish_category: null, property_type: 'parking' }))).toBeNull();
    // Une vente Résidentiel au loyer potentiel reste une carte de vente (avant : présentée en investissement).
    const potential = favoriteCard(testRow({ price: 200000, rental_info: { isLeased: false, potentialMonthlyRent: 900 } }));
    expect(potential.content.kind).toBe('purchase');
    expect(potential.grossYield).toBeNull();
    const investment = favoriteCard(testRow({ price: 200000, publish_category: 'investment', rental_info: { isLeased: false, potentialMonthlyRent: 900 } }));
    expect(investment.content.kind).toBe('investment');
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
    expect(savedCountText(0, 1)).toBe('0 sur 1 bien');
  });
});
