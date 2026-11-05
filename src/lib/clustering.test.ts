import { describe, expect, it } from 'vitest';
import { clusters } from './clustering';

// Mêmes cas que l'app (Packages/ImmoKit/Tests/ImmoDomainTests/MarkerClusteringTests.swift).
const m = (id: number, x: number, y: number) => ({ id: String(id), x, y });

describe('regroupement des marqueurs', () => {
  it('garde séparés les marqueurs éloignés', () => {
    const result = clusters([m(1, 0, 0), m(2, 200, 0), m(3, 0, 200)], 90);
    expect(result.length).toBe(3);
    expect(result.every((c) => c.ids.length === 1)).toBe(true);
  });
  it('groupe les marqueurs proches à leur centre', () => {
    const result = clusters([m(1, 100, 100), m(2, 140, 100), m(3, 120, 130), m(4, 400, 400)], 90);
    expect(result.length).toBe(2);
    const group = result.find((c) => c.ids.length > 1);
    expect(group?.ids).toEqual(['1', '2', '3']);
    expect(group?.x).toBe(120);
    expect(group?.y).toBeCloseTo(110, 3);
  });
  it('ne groupe jamais le marqueur sélectionné', () => {
    const result = clusters([m(1, 100, 100), m(2, 110, 100), m(3, 120, 100)], 90, 90, '2');
    expect(result.length).toBe(2);
    expect(result.some((c) => c.ids.join() === '2')).toBe(true);
    expect(result.some((c) => c.ids.join() === '1,3')).toBe(true);
  });
  it('groupe seulement quand les boîtes se chevauchent', () => {
    expect(clusters([m(1, 0, 0), m(2, 40, 80)], 80, 75).length).toBe(2);
    expect(clusters([m(1, 0, 0), m(2, 40, 80)], 80, 85).length).toBe(1);
  });
  it('seuil exclusif', () => {
    expect(clusters([m(1, 0, 0), m(2, 90, 0)], 90).length).toBe(2);
    expect(clusters([m(1, 0, 0), m(2, 90, 0)], 91).length).toBe(1);
    expect(clusters([], 90)).toEqual([]);
  });
});
