import type { Coordinate } from './places';

// « Dessiner une zone » sur la carte, comme l'app (ImmoDomain/Search/DrawnZone.swift, recopié tel quel) : le tracé
// devient un polygone de 60 points au plus (limite de 32 Ko de saved_searches.query). La recherche porte sur son
// rectangle (lieu `area`), puis un bien n'est gardé que s'il est dans le polygone (`drawnZone`).

export const MAX_POINTS = 60;
/** Libellé du lieu d'une recherche par zone dessinée. */
export const DRAWN_ZONE_LABEL = 'Zone dessinée';

/** Rectangle : sud-ouest et nord-est (GeoBoundingBox de l'app). */
export type GeoBox = { southWest: Coordinate; northEast: Coordinate };

const key = (point: Coordinate) => `${point.latitude} ${point.longitude}`;
const same = (a: Coordinate, b: Coordinate) => a.latitude === b.latitude && a.longitude === b.longitude;

/** Un polygone utilisable : au moins 3 sommets distincts. */
export function isUsable(zone: readonly Coordinate[] | null | undefined): zone is Coordinate[] {
  if (!zone) return false;
  return new Set(zone.map(key)).size >= 3;
}

/** Rectangle qui contient la zone. */
export function boundingBox(zone: readonly Coordinate[]): GeoBox | null {
  const first = zone[0];
  if (!first) return null;
  let south = first.latitude;
  let north = first.latitude;
  let west = first.longitude;
  let east = first.longitude;
  for (const point of zone) {
    south = Math.min(south, point.latitude);
    north = Math.max(north, point.latitude);
    west = Math.min(west, point.longitude);
    east = Math.max(east, point.longitude);
  }
  return { southWest: { latitude: south, longitude: west }, northEast: { latitude: north, longitude: east } };
}

/**
 * Le point est-il dans le polygone (fermé implicitement) ? Méthode du rayon : un point sur un bord peut tomber d'un côté
 * ou de l'autre, sans conséquence à l'échelle d'une zone dessinée.
 */
export function contains(point: Coordinate, zone: readonly Coordinate[]): boolean {
  if (zone.length < 3) return false;
  let inside = false;
  let j = zone.length - 1;
  for (let i = 0; i < zone.length; i++) {
    const a = zone[i];
    const b = zone[j];
    if ((a.latitude > point.latitude) !== (b.latitude > point.latitude)) {
      const crossing = ((b.longitude - a.longitude) * (point.latitude - a.latitude)) / (b.latitude - a.latitude) + a.longitude;
      if (point.longitude < crossing) inside = !inside;
    }
    j = i;
  }
  return inside;
}

/**
 * Tracé simplifié à `maxPoints` sommets au plus (Douglas-Peucker, tolérance augmentée jusqu'à tenir), sans points
 * répétés ni retour au premier point.
 */
export function simplified(points: readonly Coordinate[], maxPoints = MAX_POINTS): Coordinate[] {
  const cleaned: Coordinate[] = [];
  for (const point of points) {
    const last = cleaned[cleaned.length - 1];
    if (!last || !same(last, point)) cleaned.push(point);
  }
  if (cleaned.length > 1 && same(cleaned[0], cleaned[cleaned.length - 1])) cleaned.pop();
  if (cleaned.length <= maxPoints) return cleaned;
  let tolerance = 1e-7;
  let result = cleaned;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (result.length <= maxPoints) continue;
    result = douglasPeucker(cleaned, tolerance);
    tolerance *= 2;
  }
  if (result.length > maxPoints) {
    // Dernier recours : un point sur n.
    const stride = result.length / maxPoints;
    const every = result;
    result = Array.from({ length: maxPoints }, (_, index) => every[Math.trunc(index * stride)]);
  }
  return result;
}

function douglasPeucker(points: Coordinate[], tolerance: number): Coordinate[] {
  if (points.length <= 2) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    if (end <= start + 1) continue;
    let farthest = start;
    let distance = 0;
    for (let index = start + 1; index < end; index++) {
      const d = segmentDistance(points[index], points[start], points[end]);
      if (d > distance) {
        distance = d;
        farthest = index;
      }
    }
    if (distance > tolerance) {
      keep[farthest] = true;
      stack.push([start, farthest]);
      stack.push([farthest, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function segmentDistance(p: Coordinate, a: Coordinate, b: Coordinate): number {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  const length = dx * dx + dy * dy;
  if (!(length > 0)) return Math.hypot(p.longitude - a.longitude, p.latitude - a.latitude);
  const t = Math.max(0, Math.min(1, ((p.longitude - a.longitude) * dx + (p.latitude - a.latitude) * dy) / length));
  return Math.hypot(p.longitude - (a.longitude + t * dx), p.latitude - (a.latitude + t * dy));
}

// MARK: - Tracé à la main (avant la simplification)

/**
 * Tracé qui se recoupe (un 8, un doigt qui dépasse son départ) : la plus grande boucle fermée, sans les bouts qui
 * dépassent. Sans croisement : le tracé tel quel.
 */
export function largestLoop(points: readonly Coordinate[]): Coordinate[] {
  if (points.length < 4) return [...points];
  let best: Coordinate[] | null = null;
  let bestArea = 0;
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 2; j < points.length - 1; j++) {
      const crossing = intersection(points[i], points[i + 1], points[j], points[j + 1]);
      if (!crossing) continue;
      const loop = [crossing, ...points.slice(i + 1, j + 1)];
      const area = Math.abs(signedArea(loop));
      if (area > bestArea) {
        bestArea = area;
        best = loop;
      }
    }
  }
  return best ?? [...points];
}

/** Contour lissé : `passes` passes de Chaikin sur le polygone fermé (chaque côté remplacé par ses points à 1/4 et 3/4). */
export function smoothed(points: readonly Coordinate[], passes = 2): Coordinate[] {
  if (points.length < 3) return [...points];
  let result = [...points];
  for (let pass = 0; pass < passes; pass++) {
    const next: Coordinate[] = [];
    for (let index = 0; index < result.length; index++) {
      const a = result[index];
      const b = result[(index + 1) % result.length];
      next.push({ latitude: 0.75 * a.latitude + 0.25 * b.latitude, longitude: 0.75 * a.longitude + 0.25 * b.longitude });
      next.push({ latitude: 0.25 * a.latitude + 0.75 * b.latitude, longitude: 0.25 * a.longitude + 0.75 * b.longitude });
    }
    result = next;
  }
  return result;
}

// MARK: - Cercle, taille

const METERS_PER_DEGREE_LATITUDE = 111_320;

/** Cercle de `radiusMeters` (mesuré sur le terrain) autour de `center`, en `points` sommets. */
export function circle(center: Coordinate, radiusMeters: number, points = 48): Coordinate[] {
  const metersPerDegreeLongitude = METERS_PER_DEGREE_LATITUDE * Math.cos((center.latitude * Math.PI) / 180);
  return Array.from({ length: points }, (_, index) => {
    const angle = (index / points) * 2 * Math.PI;
    return {
      latitude: center.latitude + (radiusMeters * Math.cos(angle)) / METERS_PER_DEGREE_LATITUDE,
      longitude: center.longitude + (radiusMeters * Math.sin(angle)) / metersPerDegreeLongitude,
    };
  });
}

/** Distance sur le terrain entre deux points (approximation locale, suffisante à l'échelle d'une zone). */
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const latitude = (((a.latitude + b.latitude) / 2) * Math.PI) / 180;
  const dy = (b.latitude - a.latitude) * METERS_PER_DEGREE_LATITUDE;
  const dx = (b.longitude - a.longitude) * METERS_PER_DEGREE_LATITUDE * Math.cos(latitude);
  return Math.hypot(dx, dy);
}

/** Plus grande dimension de la zone sur le terrain (largeur ou hauteur de son rectangle), en mètres. */
export function extentMeters(zone: readonly Coordinate[]): number {
  const box = boundingBox(zone);
  if (!box) return 0;
  const middle = (box.southWest.latitude + box.northEast.latitude) / 2;
  const width = distanceMeters({ latitude: middle, longitude: box.southWest.longitude }, { latitude: middle, longitude: box.northEast.longitude });
  const height = (box.northEast.latitude - box.southWest.latitude) * METERS_PER_DEGREE_LATITUDE;
  return Math.max(width, height);
}

/** Centre de gravité des sommets. */
export function centroid(zone: readonly Coordinate[]): Coordinate {
  const count = Math.max(zone.length, 1);
  return {
    latitude: zone.reduce((sum, point) => sum + point.latitude, 0) / count,
    longitude: zone.reduce((sum, point) => sum + point.longitude, 0) / count,
  };
}

/** Zone agrandie (facteur > 1) ou réduite autour de son centre de gravité, même forme (un cercle reste un cercle). */
export function scaled(zone: readonly Coordinate[], factor: number): Coordinate[] {
  const center = centroid(zone);
  return zone.map((point) => ({
    latitude: center.latitude + (point.latitude - center.latitude) * factor,
    longitude: center.longitude + (point.longitude - center.longitude) * factor,
  }));
}

/** − et + : pas d'un cran, et limites de la zone (500 m à 300 km dans sa plus grande dimension). */
export const SCALE_STEP = 1.15;
export const MINIMUM_EXTENT_METERS = 500;
export const MAXIMUM_EXTENT_METERS = 300_000;
/** Cercle trop petit pour une recherche. */
export const MINIMUM_CIRCLE_RADIUS_METERS = 200;

export function canShrink(zone: readonly Coordinate[]): boolean {
  return extentMeters(zone) / SCALE_STEP >= MINIMUM_EXTENT_METERS;
}

export function canGrow(zone: readonly Coordinate[]): boolean {
  return extentMeters(zone) * SCALE_STEP <= MAXIMUM_EXTENT_METERS;
}

/**
 * Une décimale comme `String(format: "%.1f")` de l'app : arrondi exact, et une moitié exacte (1,25) va au chiffre pair
 * (« 1,2 »), là où `toFixed` monterait (« 1,3 »).
 */
function oneDecimal(value: number): string {
  const quarters = value * 4;
  if (Number.isInteger(quarters) && Math.abs(quarters) % 2 === 1) {
    const low = Math.floor(value * 10);
    return ((low % 2 === 0 ? low : low + 1) / 10).toFixed(1);
  }
  return value.toFixed(1);
}

/** « Rayon : 650 m » sous 1 km (arrondi à 50 m), « Rayon : 2,5 km » de 1 à 10 km, « Rayon : 26 km » au-delà. */
export function radiusLabel(meters: number): string {
  if (meters < 1_000) {
    const rounded = Math.round(meters / 50) * 50;
    return rounded >= 1_000 ? 'Rayon : 1 km' : `Rayon : ${rounded} m`;
  }
  const kilometers = meters / 1_000;
  if (kilometers < 10) {
    const text = oneDecimal(kilometers).replace('.', ',');
    return `Rayon : ${text.endsWith(',0') ? text.slice(0, -2) : text} km`;
  }
  return `Rayon : ${Math.round(kilometers)} km`;
}

// MARK: - Géométrie

export function signedArea(polygon: readonly Coordinate[]): number {
  if (polygon.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    area += a.longitude * b.latitude - b.longitude * a.latitude;
  }
  return area / 2;
}

function intersection(p1: Coordinate, p2: Coordinate, p3: Coordinate, p4: Coordinate): Coordinate | null {
  const d1x = p2.longitude - p1.longitude;
  const d1y = p2.latitude - p1.latitude;
  const d2x = p4.longitude - p3.longitude;
  const d2y = p4.latitude - p3.latitude;
  const denominator = d1x * d2y - d1y * d2x;
  if (!(Math.abs(denominator) > 1e-15)) return null;
  const t = ((p3.longitude - p1.longitude) * d2y - (p3.latitude - p1.latitude) * d2x) / denominator;
  const u = ((p3.longitude - p1.longitude) * d1y - (p3.latitude - p1.latitude) * d1x) / denominator;
  if (!(t > 0 && t < 1 && u > 0 && u < 1)) return null;
  return { latitude: p1.latitude + t * d1y, longitude: p1.longitude + t * d1x };
}

// MARK: - Site : adresse de la page

/** Arrondi à 5 décimales (environ 1 m) : une zone tracée sur le site reste courte dans l'adresse de la page. */
export function rounded(zone: readonly Coordinate[]): Coordinate[] {
  const round = (value: number) => Number(value.toFixed(5));
  return simplified(zone.map((point) => ({ latitude: round(point.latitude), longitude: round(point.longitude) })));
}

/** « 45.76123,4.83456,45.77,4.85,… » : latitude puis longitude de chaque sommet, sans perte. */
export function encodeZone(zone: readonly Coordinate[]): string {
  return zone.map((point) => `${point.latitude},${point.longitude}`).join(',');
}

/** Zone lue dans l'adresse de la page ; `null` si elle est illisible ou inutilisable. */
export function decodeZone(text: string | null | undefined): Coordinate[] | null {
  if (!text) return null;
  const parts = text.split(',');
  if (parts.length % 2 !== 0 || parts.length > MAX_POINTS * 2 * 4) return null;
  const numbers = parts.map((part) => (part.trim() ? Number(part) : Number.NaN));
  if (!numbers.every(Number.isFinite)) return null;
  const zone: Coordinate[] = [];
  for (let index = 0; index < numbers.length; index += 2) {
    const [latitude, longitude] = [numbers[index], numbers[index + 1]];
    if (Math.abs(latitude) > 85 || Math.abs(longitude) > 180) return null;
    zone.push({ latitude, longitude });
  }
  const simple = simplified(zone);
  return isUsable(simple) ? simple : null;
}
