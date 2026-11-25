import { describe, expect, it } from 'vitest';
import { mapPanelTitle, mapSortOptions, panelHeight, rubberBanded, snapTarget, sortedForMap } from './mapPanel';
import type { ListingRow } from './listings';
import type { Result } from './search';

// Mêmes cas que PanelSnappingTests.swift de l'app.
describe('calage du panneau de la carte', () => {
  const heights = [84, 318, 700];

  it('un geste lent se cale sur la hauteur la plus proche', () => {
    expect(snapTarget(heights, 318, 300)).toBe(318);
    expect(snapTarget(heights, 318, 150)).toBe(84);
    expect(snapTarget(heights, 318, 560)).toBe(700);
  });

  it('un lancer franc avance d’un cran à la fois', () => {
    expect(snapTarget(heights, 84, 900)).toBe(318);
    expect(snapTarget(heights, 700, -200)).toBe(318);
  });

  it('un départ inconnu prend la hauteur la plus proche', () => {
    expect(snapTarget(heights, 500, 650)).toBe(700);
  });

  it('élastique au-delà des bornes', () => {
    expect(rubberBanded(200, 84, 700)).toBe(200);
    expect(rubberBanded(44, 84, 700)).toBe(74);
    expect(rubberBanded(780, 84, 700)).toBe(720);
  });

  it('hauteurs : 84, 362 et jusque sous la barre de recherche', () => {
    expect([panelHeight('compact', 760), panelHeight('medium', 760), panelHeight('large', 760)]).toEqual([84, 362, 690]);
    expect([panelHeight('medium', 380), panelHeight('large', 380)]).toEqual([318, 318]);
  });
});

describe('titre et tri du panneau', () => {
  it('titres de l’app', () => {
    expect(mapPanelTitle(0, true, false)).toBe('Recherche des biens…');
    expect(mapPanelTitle(0, false, false)).toBe('Aucun bien sur la carte');
    expect(mapPanelTitle(1, false, false)).toBe('1 bien sur la carte');
    expect(mapPanelTitle(42, true, false)).toBe('42 biens sur la carte');
    expect(mapPanelTitle(0, false, true)).toBe('Aucun bien');
    expect(mapPanelTitle(6, false, true)).toBe('6 biens');
  });

  it('la rentabilité seulement en mode Investir', () => {
    expect(mapSortOptions('buy')).toEqual(['relevance', 'priceAscending', 'priceDescending', 'area']);
    expect(mapSortOptions('invest')).toContain('grossYield');
  });

  it('trie les biens déjà lus', () => {
    const result = (id: string, price: number, area: number, grossYield: number | null): Result => ({
      row: { id, price, living_area: area, transaction: 'sale', rental_info: null } as unknown as ListingRow,
      highlights: grossYield === null ? null : ({ grossYield } as Result['highlights']),
    });
    const results = [result('a', 300000, 60, 0.05), result('b', 200000, 90, null), result('c', 250000, 40, 0.08)];
    expect(sortedForMap(results, 'relevance').map((r) => r.row.id)).toEqual(['a', 'b', 'c']);
    expect(sortedForMap(results, 'priceAscending').map((r) => r.row.id)).toEqual(['b', 'c', 'a']);
    expect(sortedForMap(results, 'priceDescending').map((r) => r.row.id)).toEqual(['a', 'c', 'b']);
    expect(sortedForMap(results, 'area').map((r) => r.row.id)).toEqual(['b', 'a', 'c']);
    expect(sortedForMap(results, 'grossYield').map((r) => r.row.id)).toEqual(['c', 'a', 'b']);
  });
});
