import type {
  ChargesMode, HotelAmenity, HotelOperatingStatus, LeaseType, OfficeEquipment, ParkingType, PropertyCondition, PublishCategory,
} from './draft';

// Libellés de Publier, comme l'app (PublishFlowView.swift, PublishFinanceStep.swift, DomainLabels.swift).

export const CATEGORY_TITLES: Record<PublishCategory, string> = {
  residential: 'Résidentiel',
  investment: 'Investissement',
  rental: 'Location',
  hotel: 'Hôtels',
};

/** Sous-titres des cartes de l'étape 1, courts pour tenir sur une ligne (PublishCategory.subtitle). */
export const CATEGORY_SUBTITLES: Record<PublishCategory, string> = {
  residential: 'Logement ou terrain',
  investment: 'Bien loué, immeuble',
  rental: 'Bien à louer',
  hotel: 'Hôtel à vendre',
};

/**
 * Ordre d'affichage des catégories, le même que dans l'app : Résidentiel, Location, Investissement, Hôtels
 * (PublishCategory.displayOrder ; les valeurs enregistrées ne changent pas).
 */
export const CATEGORY_DISPLAY_ORDER: PublishCategory[] = ['residential', 'rental', 'investment', 'hotel'];

export const PARKING_LABELS: Record<ParkingType, string> = {
  none: 'Aucun',
  outdoorSpace: 'Place extérieure',
  indoorSpace: 'Place en sous-sol',
  garage: 'Garage',
};

export const CONDITION_LABELS: Record<PropertyCondition, string> = {
  new: 'Neuf',
  good: 'Bon état',
  toRefresh: 'À rafraîchir',
  toRenovate: 'À rénover',
};

export const LEASE_LABELS: Record<LeaseType, string> = {
  commercial: 'Commercial 3-6-9',
  professional: 'Professionnel',
  shortTerm: 'Dérogatoire',
};

export const CHARGES_MODE_LABELS: Record<ChargesMode, string> = {
  provision: 'Provisions',
  flatRate: 'Forfait',
};

export const HOTEL_STATUS_LABELS: Record<HotelOperatingStatus, string> = {
  operating: 'En activité',
  seasonal: 'Saisonnier',
  closed: 'Fermé',
};

export const HOTEL_AMENITY_LABELS: Record<HotelAmenity, string> = {
  restaurant: 'Restaurant',
  bar: 'Bar',
  meetingRooms: 'Salles de réunion',
  spa: 'Spa',
  pool: 'Piscine',
  parking: 'Parking',
};

export const OFFICE_EQUIPMENT_LABELS: Record<OfficeEquipment, string> = {
  airConditioning: 'Climatisation',
  fiber: 'Fibre',
  accessControl: 'Contrôle d\'accès',
};

/** Grandes familles de zones des plans locaux d'urbanisme (LocalSuggestions.zoning, code de l'urbanisme R151-17). */
export const PLU_ZONES: { value: string; detail: string }[] = [
  { value: 'U', detail: 'Zone urbaine' },
  { value: 'AU', detail: 'Zone à urbaniser' },
  { value: 'A', detail: 'Zone agricole' },
  { value: 'N', detail: 'Zone naturelle et forestière' },
];
