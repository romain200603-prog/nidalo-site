import { describe, expect, it } from 'vitest';
import { floorLabel, headerFacts } from './rows';
import { testRow } from '../testRows';

// Fiche du bien : étage négatif (n° 238) et terrain à louer (n° 144), comme l'app.
describe('fiche : étage et surface', () => {
  const plain = (s: string) => s.replace(/[  ]/g, ' ');

  it('un étage négatif est « Sous-sol », sans « sur N »', () => {
    expect(floorLabel(-1, 5)).toBe('Sous-sol');
    expect(floorLabel(-2, null)).toBe('Sous-sol');
    expect(floorLabel(0, 5)).toBe('Rez-de-chaussée sur 5');
    const facts = headerFacts(testRow({ floor: -1 }), 'purchase').map((f) => `${f.value} ${f.caption}`);
    expect(facts).toContain('Sous-sol Étage');
  });

  it('terrain à louer : la surface du terrain, plus de « Surface 0 m² »', () => {
    const land = testRow({ transaction: 'rent', property_type: 'land', publish_category: 'rental', living_area: 0, land_area: 1200, rooms: null, bedrooms: null, floor: null });
    expect(headerFacts(land, 'rental').map((f) => plain(`${f.value} ${f.caption}`))).toEqual(['1 200 m² Terrain']);
  });
});
