// Libellés de l'app (Core/Presentation/DomainLabels.swift).
export type PropertyType =
  | 'apartment' | 'house' | 'building' | 'land' | 'commercial' | 'office' | 'parking' | 'hotel' | 'other';

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: 'Appartement',
  house: 'Maison',
  building: 'Immeuble',
  land: 'Terrain',
  commercial: 'Local commercial',
  office: 'Bureaux',
  parking: 'Parking',
  hotel: 'Hôtel',
  other: 'Autre',
};

export function propertyTypeLabel(type: string): string {
  return PROPERTY_TYPE_LABELS[type as PropertyType] ?? 'Bien';
}

/** Les quatre façons de chercher, comme sur l'accueil de l'app. */
export type SearchMode = 'buy' | 'rent' | 'invest' | 'hotel';

export const SEARCH_MODES: { mode: SearchMode; label: string; icon: 'house' | 'key' | 'trend' | 'bed' }[] = [
  { mode: 'buy', label: 'Résidentiel', icon: 'house' },
  { mode: 'rent', label: 'Location', icon: 'key' },
  { mode: 'invest', label: 'Investir', icon: 'trend' },
  { mode: 'hotel', label: 'Hôtels', icon: 'bed' },
];

export const DPE_COLORS: Record<string, string> = {
  A: '#00A16E', B: '#52B054', C: '#78BD75', D: '#F5E80F', E: '#F0B50F', F: '#EB8236', G: '#D6211F',
};
