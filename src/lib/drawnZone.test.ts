import { describe, expect, it } from 'vitest';
import {
  boundingBox, canGrow, canShrink, centroid, circle, contains, decodeZone, distanceMeters, encodeZone, extentMeters, isUsable,
  largestLoop, radiusLabel, rounded, scaled, SCALE_STEP, signedArea, simplified, smoothed,
} from './drawnZone';
import type { Coordinate } from './places';

// Mêmes cas que l'app (Packages/ImmoKit/Tests/ImmoDomainTests/DrawnZoneTests.swift), puis ceux du site.
const at = (latitude: number, longitude: number): Coordinate => ({ latitude, longitude });
/** Triangle autour du centre de Lyon. */
const triangle = [at(45.74, 4.82), at(45.78, 4.84), at(45.74, 4.88)];
/** Point de la grille des tests du tracé : x vers l'est, y vers le nord, en centièmes de degré. */
const point = (x: number, y: number) => at(45 + y / 100, 4 + x / 100);
const includesPoint = (zone: Coordinate[], p: Coordinate) => zone.some((q) => q.latitude === p.latitude && q.longitude === p.longitude);

describe('zone dessinée : comme l’app', () => {
  it('garde les points dedans, écarte ceux dehors', () => {
    expect(contains(at(45.75, 4.85), triangle)).toBe(true);
    // Dans le rectangle mais hors du triangle.
    expect(contains(at(45.775, 4.825), triangle)).toBe(false);
    expect(contains(at(45.8, 4.85), triangle)).toBe(false);
    expect(contains(at(45.75, 4.85), triangle.slice(0, 2))).toBe(false);
  });

  it('calcule le rectangle et reconnaît une zone utilisable', () => {
    expect(boundingBox(triangle)).toEqual({ southWest: at(45.74, 4.82), northEast: at(45.78, 4.88) });
    expect(isUsable(triangle)).toBe(true);
    expect(isUsable([triangle[0], triangle[0], triangle[1]])).toBe(false);
    expect(isUsable(null)).toBe(false);
    expect(boundingBox([])).toBeNull();
  });

  it('simplifie un tracé à 60 points', () => {
    // Cercle tracé à la main : 500 points, répétitions et retour au départ.
    const trace: Coordinate[] = [];
    for (let i = 0; i < 500; i++) {
      const angle = (i / 500) * 2 * Math.PI;
      const p = at(45.76 + 0.02 * Math.sin(angle), 4.85 + 0.03 * Math.cos(angle));
      trace.push(p);
      if (i % 7 === 0) trace.push(p);
    }
    trace.push(trace[0]);
    const zone = simplified(trace);
    expect(zone.length).toBeLessThanOrEqual(60);
    expect(zone.length).toBeGreaterThanOrEqual(8);
    expect(zone[0]).not.toEqual(zone[zone.length - 1]);
    expect(contains(at(45.76, 4.85), zone)).toBe(true);
    expect(contains(at(45.79, 4.85), zone)).toBe(false);
    // Un petit tracé reste tel quel.
    expect(simplified(triangle)).toEqual(triangle);
    // La recherche enregistrée reste bien sous 32 Ko.
    expect(JSON.stringify({ drawnZone: zone }).length).toBeLessThan(32_000);
  });

  it('garde la plus grande boucle d’un 8', () => {
    // Petite boucle à gauche (1 × 1), grande boucle à droite (2 × 2), croisement en (1, 1).
    const eight = [point(0, 0), point(0, 2), point(2, 0), point(4, 0), point(4, 4), point(2, 4), point(0.5, 0.5)];
    const loop = largestLoop(eight);
    expect(Math.abs(signedArea(loop))).toBeGreaterThan(Math.abs(signedArea([point(0, 0), point(0, 2), point(1, 1)])));
    expect(includesPoint(loop, point(4, 4))).toBe(true);
    expect(includesPoint(loop, point(0, 0))).toBe(false);
  });

  it('coupe le bout d’un tracé qui dépasse son départ', () => {
    const trace = [point(0, 1), point(4, 1), point(4, 4), point(0, 4), point(1, 0), point(-1, 0.5)];
    const loop = largestLoop(trace);
    expect(includesPoint(loop, point(-1, 0.5))).toBe(false);
    expect(includesPoint(loop, point(4, 4))).toBe(true);
    // Le croisement, puis les trois coins du tour.
    expect(loop).toHaveLength(4);
    expect(includesPoint(loop, point(0, 1))).toBe(false);
  });

  it('garde la forme d’un tracé sans croisement et l’arrondit (Chaikin)', () => {
    const square = [point(0, 0), point(0, 3), point(3, 3), point(3, 0)];
    expect(largestLoop(square)).toEqual(square);
    const smooth = smoothed(square);
    expect(smooth).toHaveLength(16);
    const center = centroid(smooth);
    expect(Math.abs(center.latitude - 45.015)).toBeLessThan(1e-9);
    expect(Math.abs(center.longitude - 4.015)).toBeLessThan(1e-9);
    const larger = scaled(square, 1.001);
    expect(smooth.every((p) => contains(p, larger))).toBe(true);
  });

  it('trace un cercle, l’agrandit et respecte ses limites', () => {
    const center = at(45.76, 4.84);
    const ring = circle(center, 1_000);
    expect(ring).toHaveLength(48);
    expect(Math.abs(distanceMeters(center, ring[12]) - 1_000)).toBeLessThan(5);
    expect(Math.abs(extentMeters(ring) - 2_000)).toBeLessThan(20);
    const bigger = scaled(ring, SCALE_STEP);
    expect(Math.abs(extentMeters(bigger) - 2_300)).toBeLessThan(25);
    expect(canShrink(circle(center, 260))).toBe(false);
    expect(canShrink(ring)).toBe(true);
    expect(canGrow(circle(center, 140_000))).toBe(false);
  });

  it('écrit le rayon comme l’app', () => {
    expect(radiusLabel(640)).toBe('Rayon : 650 m');
    expect(radiusLabel(2_480)).toBe('Rayon : 2,5 km');
    expect(radiusLabel(3_000)).toBe('Rayon : 3 km');
    expect(radiusLabel(26_300)).toBe('Rayon : 26 km');
  });
});

describe('zone dessinée : détails du site', () => {
  it('arrondit le rayon comme String(format: "%.1f") de l’app', () => {
    expect(radiusLabel(990)).toBe('Rayon : 1 km');
    expect(radiusLabel(1_000)).toBe('Rayon : 1 km');
    expect(radiusLabel(1_250)).toBe('Rayon : 1,2 km');
    expect(radiusLabel(1_750)).toBe('Rayon : 1,8 km');
    expect(radiusLabel(9_960)).toBe('Rayon : 10 km');
    expect(radiusLabel(200)).toBe('Rayon : 200 m');
  });

  it('garde la zone dans l’adresse sans perte, et refuse une zone illisible', () => {
    const zone = rounded(circle(at(45.7578, 4.8320), 1_500));
    expect(zone).toHaveLength(48);
    expect(zone.every((p) => Number(p.latitude.toFixed(5)) === p.latitude)).toBe(true);
    expect(decodeZone(encodeZone(zone))).toEqual(zone);
    // Zone de l'app, à pleine précision : relue telle quelle.
    const exact = [at(45.741234567891, 4.821234567891), at(45.78, 4.84), at(45.74, 4.880000000001)];
    expect(decodeZone(encodeZone(exact))).toEqual(exact);
    expect(decodeZone('45.74,4.82,45.78')).toBeNull();
    expect(decodeZone('45.74,4.82,45.74,4.82,45.74,4.82')).toBeNull();
    expect(decodeZone('45.74,4.82,,4.84,45.74,4.88')).toBeNull();
    expect(decodeZone('91,4.82,45.78,4.84,45.74,4.88')).toBeNull();
    expect(decodeZone('abc')).toBeNull();
    expect(decodeZone(null)).toBeNull();
  });
});
