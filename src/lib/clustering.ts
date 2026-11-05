// Regroupement des marqueurs qui se chevauchent à l'écran, comme l'app (ImmoDomain/Search/MarkerClustering.swift).

export type ScreenMarker = { id: string; x: number; y: number };
export type MarkerCluster = { ids: string[]; x: number; y: number };

/**
 * Glouton : chaque marqueur rejoint le premier groupe dont le centre est à moins de `minimumSpacing` en largeur
 * ET de `verticalSpacing` en hauteur, sinon il crée un groupe. Le marqueur `keepingSeparate` reste seul.
 */
export function clusters(markers: ScreenMarker[], minimumSpacing: number, verticalSpacing = minimumSpacing, keepingSeparate?: string | null): MarkerCluster[] {
  const groups: { ids: string[]; sumX: number; sumY: number }[] = [];
  const separate: MarkerCluster[] = [];
  for (const marker of markers) {
    if (marker.id === keepingSeparate) {
      separate.push({ ids: [marker.id], x: marker.x, y: marker.y });
      continue;
    }
    const group = groups.find((g) => {
      const count = g.ids.length;
      return Math.abs(g.sumX / count - marker.x) < minimumSpacing && Math.abs(g.sumY / count - marker.y) < verticalSpacing;
    });
    if (group) {
      group.ids.push(marker.id);
      group.sumX += marker.x;
      group.sumY += marker.y;
    } else {
      groups.push({ ids: [marker.id], sumX: marker.x, sumY: marker.y });
    }
  }
  return [...groups.map((g) => ({ ids: g.ids, x: g.sumX / g.ids.length, y: g.sumY / g.ids.length })), ...separate];
}
