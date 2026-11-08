import type { HotelScope, Sourced } from '../listingJson';
import type { EnergyClass, OutdoorSpace } from '../search';

// Annonce en cours de création dans Publier, comme ImmoDomain/Listing/ListingDraft.swift : tous les champs sont
// facultatifs tant que l'annonce n'est pas publiée, et les mêmes règles décident de ce qui manque.

export type PublishCategory = 'residential' | 'investment' | 'rental' | 'hotel';
export type PropertyType = 'apartment' | 'house' | 'building' | 'land' | 'commercial' | 'office' | 'parking' | 'hotel' | 'other';
export type Transaction = 'sale' | 'rent';
export type ParkingType = 'none' | 'outdoorSpace' | 'indoorSpace' | 'garage';
export type PropertyCondition = 'new' | 'good' | 'toRefresh' | 'toRenovate';
export type HotelOperatingStatus = 'operating' | 'seasonal' | 'closed';
export type HotelAmenity = 'restaurant' | 'bar' | 'meetingRooms' | 'spa' | 'pool' | 'parking';
export type OfficeEquipment = 'airConditioning' | 'fiber' | 'accessControl';
export type LeaseType = 'commercial' | 'professional' | 'shortTerm';
/** Charges d'une location : provisions régularisées chaque année, ou forfait fixe. */
export type ChargesMode = 'provision' | 'flatRate';
/** Qui paie les honoraires : l'acquéreur ou le locataire (`buyer`), le vendeur ou le propriétaire (`seller`). */
export type FeePayer = 'buyer' | 'seller';

export const PUBLISH_CATEGORIES: PublishCategory[] = ['residential', 'investment', 'rental', 'hotel'];
export const PARKING_TYPES: ParkingType[] = ['none', 'outdoorSpace', 'indoorSpace', 'garage'];
export const CONDITIONS: PropertyCondition[] = ['new', 'good', 'toRefresh', 'toRenovate'];
export const HOTEL_SCOPES: HotelScope[] = ['wallsAndBusiness', 'wallsOnly', 'businessOnly'];
export const HOTEL_STATUSES: HotelOperatingStatus[] = ['operating', 'seasonal', 'closed'];
export const HOTEL_AMENITIES: HotelAmenity[] = ['restaurant', 'bar', 'meetingRooms', 'spa', 'pool', 'parking'];
export const OFFICE_EQUIPMENT: OfficeEquipment[] = ['airConditioning', 'fiber', 'accessControl'];
export const LEASE_TYPES: LeaseType[] = ['commercial', 'professional', 'shortTerm'];
export const CHARGES_MODES: ChargesMode[] = ['provision', 'flatRate'];
export const FEE_PAYERS: FeePayer[] = ['buyer', 'seller'];

/** Jour choisi dans un calendrier : « 2026-12-01 ». */
export type Day = string;

export type Address = { street: string | null; postalCode: string; city: string; inseeCode: string | null };
export type Coordinate = { latitude: number; longitude: number };

/** Informations locatives (RentalInfo) : `isLeased` existe toujours, comme dans l'app. */
export type RentalDraft = {
  currentMonthlyRent: number | null;
  potentialMonthlyRent: number | null;
  isLeased: boolean;
  leaseEndDate: Day | null;
  availableFrom: Day | null;
  recoverableMonthlyCharges: number | null;
  isFurnished: boolean | null;
  securityDeposit: number | null;
  leaseDurationMonths: number | null;
  /** Location : charges en provisions ou au forfait ; null = non précisé (affiché « Provisions sur charges »). */
  chargesMode: ChargesMode | null;
};

export type HotelDraft = {
  rooms: number | null;
  stars: number | null;
  annualRevenue: Sourced | null;
  ebitda: Sourced | null;
  operatingIncome: Sourced | null;
  scope: HotelScope | null;
  /** 0,74 = 74 %. */
  occupancyRate: Sourced | null;
  financialYear: number | null;
  averageDailyRate: Sourced | null;
  operatingStatus: HotelOperatingStatus | null;
  amenities: HotelAmenity[] | null;
  /** Fonds seul : loyer annuel que l'exploitant paie au propriétaire des murs. */
  wallsAnnualRent: number | null;
};

export type CommercialDraft = { frontageMeters: number | null; salesArea: number | null; leaseType: LeaseType | null; leaseEndDate: Day | null };
export type OfficeDraft = {
  workstations: number | null;
  parkingSpaces: number | null;
  isAccessible: boolean | null;
  equipment: OfficeEquipment[] | null;
  leaseType: LeaseType | null;
  leaseEndDate: Day | null;
};
export type LandDraft = {
  zoning: string | null;
  buildability: { floorArea: number; documentReference: string } | null;
  isServiced: boolean | null;
  hasBuildings: boolean | null;
};
export type BuildingDraft = {
  residentialUnits: number | null;
  commercialUnits: number | null;
  vacantUnits: number | null;
  residentialArea: number | null;
  commercialArea: number | null;
  residentialAnnualRent: number | null;
  commercialAnnualRent: number | null;
};

/** Détails propres au type d'actif (AssetDetails). */
export type AssetDraft =
  | { kind: 'hotel'; hotel: HotelDraft }
  | { kind: 'commercial'; commercial: CommercialDraft }
  | { kind: 'office'; office: OfficeDraft }
  | { kind: 'land'; land: LandDraft }
  | { kind: 'building'; building: BuildingDraft };

export type EnergyDraft = {
  energyClass: EnergyClass | null;
  climateClass: EnergyClass | null;
  primaryEnergyConsumption: number | null;
  /** Estimation des dépenses annuelles d'énergie du DPE, en euros par an (logement ou immeuble). */
  annualEnergyCostMin: number | null;
  annualEnergyCostMax: number | null;
  // Pas de champ dans Publier : gardée telle quelle quand une annonce est modifiée.
  diagnosticDate: string | null;
};

/** Photo déjà en ligne (ligne de listing_photos) ou choisie sur l'ordinateur, pas encore envoyée. */
export type DraftPhoto =
  | { kind: 'stored'; id: string; storagePath: string; width: number | null; height: number | null }
  | { kind: 'new'; key: string; blob: Blob; url: string; width: number; height: number };

export type PublishDraft = {
  id: string;
  category: PublishCategory | null;
  transaction: Transaction | null;
  propertyType: PropertyType | null;
  /** Investir : « Immeuble mixte (logements et commerces) » choisi plutôt qu'« Immeuble de rapport ». */
  isMixedBuilding: boolean;
  photos: DraftPhoto[];
  address: Address | null;
  coordinate: Coordinate | null;
  locationPrecision: 'exact' | 'approximate';
  price: number | null;
  monthlyCharges: number | null;
  annualPropertyTax: number | null;
  livingArea: number | null;
  landArea: number | null;
  rooms: number | null;
  bedrooms: number | null;
  floor: number | null;
  totalFloors: number | null;
  hasElevator: boolean | null;
  outdoorSpaces: OutdoorSpace[];
  parking: ParkingType;
  yearBuilt: number | null;
  isNewBuild: boolean;
  energy: EnergyDraft;
  title: string;
  description: string;
  rentalInfo: RentalDraft | null;
  assetDetails: AssetDraft | null;
  worksAmount: number | null;
  hasCellar: boolean | null;
  condition: PropertyCondition | null;
  acceptsVideoVisits: boolean | null;
  /** Honoraires d'agence TTC (comptes professionnels) et qui les paie : le serveur les garde ensemble ou pas du tout. */
  agencyFeesAmount: number | null;
  agencyFeesPaidBy: FeePayer | null;
};

export function emptyRental(): RentalDraft {
  return {
    currentMonthlyRent: null, potentialMonthlyRent: null, isLeased: false, leaseEndDate: null, availableFrom: null,
    recoverableMonthlyCharges: null, isFurnished: null, securityDeposit: null, leaseDurationMonths: null, chargesMode: null,
  };
}

export function emptyHotel(): HotelDraft {
  return {
    rooms: null, stars: null, annualRevenue: null, ebitda: null, operatingIncome: null, scope: null, occupancyRate: null,
    financialYear: null, averageDailyRate: null, operatingStatus: null, amenities: null, wallsAnnualRent: null,
  };
}

export function emptyBuilding(): BuildingDraft {
  return {
    residentialUnits: null, commercialUnits: null, vacantUnits: null, residentialArea: null, commercialArea: null,
    residentialAnnualRent: null, commercialAnnualRent: null,
  };
}

export function newDraft(id: string): PublishDraft {
  return {
    id, category: null, transaction: null, propertyType: null, isMixedBuilding: false, photos: [], address: null, coordinate: null,
    locationPrecision: 'approximate', price: null, monthlyCharges: null, annualPropertyTax: null, livingArea: null, landArea: null,
    rooms: null, bedrooms: null, floor: null, totalFloors: null, hasElevator: null, outdoorSpaces: [], parking: 'none',
    yearBuilt: null, isNewBuild: false,
    energy: { energyClass: null, climateClass: null, primaryEnergyConsumption: null, annualEnergyCostMin: null, annualEnergyCostMax: null, diagnosticDate: null },
    title: '', description: '', rentalInfo: null, assetDetails: null, worksAmount: null, hasCellar: null, condition: null,
    acceptsVideoVisits: null, agencyFeesAmount: null, agencyFeesPaidBy: null,
  };
}

// MARK: - Types de bien (PropertyType)

export const isDwelling = (type: PropertyType | null): boolean => type === 'apartment' || type === 'house';
export const requiresEnergyDiagnostic = (type: PropertyType | null): boolean => type !== null && type !== 'land' && type !== 'parking';
export const hasRooms = (type: PropertyType | null): boolean => type !== null && type !== 'land' && type !== 'parking';
/** Dépenses d'énergie du DPE demandées pour un logement ou un immeuble (mention obligatoire des annonces de logement). */
export const showsEnergyCosts = (type: PropertyType | null): boolean => isDwelling(type) || type === 'building';

export function categoryTransaction(category: PublishCategory): Transaction {
  return category === 'rental' ? 'rent' : 'sale';
}

export function categoryTypes(category: PublishCategory): PropertyType[] {
  switch (category) {
    case 'residential': return ['apartment', 'house', 'land'];
    case 'investment': return ['apartment', 'house', 'building', 'commercial', 'office'];
    case 'rental': return ['apartment', 'house', 'parking', 'land', 'commercial', 'office'];
    case 'hotel': return ['hotel'];
  }
}

/** Sous-types proposés à l'étape « Catégorie » (PublishFlowView.subtypes). */
export type Subtype = { title: string; type: PropertyType; isMixed: boolean };

export function subtypes(category: PublishCategory): Subtype[] {
  const s = (title: string, type: PropertyType, isMixed = false): Subtype => ({ title, type, isMixed });
  switch (category) {
    case 'residential': return [s('Appartement', 'apartment'), s('Maison', 'house'), s('Terrain', 'land')];
    case 'investment': return [
      s('Appartement loué', 'apartment'), s('Maison locative', 'house'), s('Immeuble de rapport', 'building'),
      s('Immeuble mixte (logements et commerces)', 'building', true), s('Local commercial', 'commercial'), s('Bureaux', 'office'),
    ];
    case 'rental': return [
      s('Appartement', 'apartment'), s('Maison', 'house'), s('Parking ou box', 'parking'), s('Terrain', 'land'),
      s('Local commercial', 'commercial'), s('Bureaux', 'office'),
    ];
    case 'hotel': return [s('Hôtel', 'hotel')];
  }
}

export function isSubtypeSelected(draft: PublishDraft, option: Subtype): boolean {
  return draft.propertyType === option.type && (option.type !== 'building' || option.isMixed === draft.isMixedBuilding);
}

/** Les détails d'actif suivent le type : un hôtel a des détails d'hôtel, un local des détails de local… */
function alignAssetDetails(draft: PublishDraft): PublishDraft {
  const type = draft.propertyType;
  const current = draft.assetDetails;
  if (type !== null && current !== null && current.kind === type) return draft;
  let assetDetails: AssetDraft | null = null;
  switch (type) {
    case 'hotel': assetDetails = { kind: 'hotel', hotel: emptyHotel() }; break;
    case 'commercial': assetDetails = { kind: 'commercial', commercial: { frontageMeters: null, salesArea: null, leaseType: null, leaseEndDate: null } }; break;
    case 'office': assetDetails = { kind: 'office', office: { workstations: null, parkingSpaces: null, isAccessible: null, equipment: null, leaseType: null, leaseEndDate: null } }; break;
    case 'land': assetDetails = { kind: 'land', land: { zoning: null, buildability: null, isServiced: null, hasBuildings: null } }; break;
    case 'building': assetDetails = { kind: 'building', building: emptyBuilding() }; break;
    default: assetDetails = null;
  }
  return { ...draft, assetDetails };
}

/** Choisit la catégorie : transaction et type de bien suivent, les détails d'un autre type sont retirés. */
export function selectCategory(draft: PublishDraft, category: PublishCategory): PublishDraft {
  const types = categoryTypes(category);
  let next: PublishDraft = { ...draft, category, transaction: categoryTransaction(category), isMixedBuilding: false };
  if (next.propertyType !== null && !types.includes(next.propertyType)) next.propertyType = null;
  if (types.length === 1) next.propertyType = types[0];
  if (next.transaction === 'rent' && next.rentalInfo) {
    next.rentalInfo = { ...next.rentalInfo, currentMonthlyRent: null, potentialMonthlyRent: null };
  }
  next = alignAssetDetails(next);
  return next;
}

/** Choisit le sous-type : le type de bien, et « immeuble mixte » pour l'immeuble de logements et commerces. */
export function selectSubtype(draft: PublishDraft, option: Subtype): PublishDraft {
  return alignAssetDetails({ ...draft, propertyType: option.type, isMixedBuilding: option.isMixed });
}

// MARK: - Règles (ListingDraft.missingRequiredFields)

export type RequiredField =
  | 'transaction' | 'propertyType' | 'photos' | 'address' | 'price' | 'livingArea' | 'rooms' | 'energyClass' | 'description'
  | 'title' | 'landArea' | 'rentalEnergyClass' | 'agencyFeesPayer';

export type PublishStep = 'category' | 'main' | 'features' | 'finance' | 'media' | 'description' | 'review';
export const PUBLISH_STEPS: PublishStep[] = ['category', 'main', 'features', 'finance', 'media', 'description', 'review'];

export const STEP_TITLES: Record<PublishStep, string> = {
  category: 'Catégorie',
  main: 'Informations principales',
  features: 'Caractéristiques',
  finance: 'Prix et finances',
  // Sur le site, l'étape n'a que les photos : les documents de l'app restent sur l'iPhone.
  media: 'Photos',
  description: 'Description et aperçu',
  review: 'Vérification',
};

const RENTAL_BAN_YEARS: Partial<Record<EnergyClass, number>> = { G: 2025, F: 2028, E: 2034 };

/** Année en cours à Paris (le calendrier de l'app est réglé sur Europe/Paris). */
function parisYear(now: Date): number {
  return Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric' }).format(now));
}

/** « Un logement classé G ne peut plus être mis en location depuis 2025. » ; `null` si la location est permise. */
export function rentalBanMessage(draft: PublishDraft, now = new Date()): string | null {
  const energy = draft.energy.energyClass;
  if (draft.transaction !== 'rent' || !isDwelling(draft.propertyType) || energy === null) return null;
  const year = RENTAL_BAN_YEARS[energy];
  if (year === undefined || parisYear(now) < year) return null;
  return `Un logement classé ${energy} ne peut plus être mis en location depuis ${year}.`;
}

/** Année d'interdiction de louer un logement de cette classe (G 2025, F 2028, E 2034). */
export function rentalBanYear(energy: EnergyClass | null): number | null {
  return energy === null ? null : RENTAL_BAN_YEARS[energy] ?? null;
}

const blank = (text: string): boolean => text.trim() === '';

/** Champs obligatoires encore manquants. Les informations de rentabilité ne sont jamais exigées. */
export function missingRequiredFields(draft: PublishDraft, now = new Date()): RequiredField[] {
  const missing: RequiredField[] = [];
  const type = draft.propertyType;
  if (draft.transaction === null) missing.push('transaction');
  if (type === null) missing.push('propertyType');
  if (draft.photos.length === 0) missing.push('photos');
  if (draft.address === null || draft.coordinate === null) missing.push('address');
  if ((draft.price ?? 0) <= 0) missing.push('price');
  if ((draft.livingArea ?? 0) <= 0 && type !== 'land') missing.push('livingArea');
  if (type === 'land' && (draft.landArea ?? 0) <= 0) missing.push('landArea');
  // Pièces exigées pour un logement seulement : local, bureaux, immeuble ou hôtel se décrivent autrement.
  if (isDwelling(type) && (draft.rooms ?? 0) <= 0) missing.push('rooms');
  if (requiresEnergyDiagnostic(type) && draft.energy.energyClass === null) missing.push('energyClass');
  if (rentalBanMessage(draft, now) !== null) missing.push('rentalEnergyClass');
  if (feesNeedPayer(draft)) missing.push('agencyFeesPayer');
  if (blank(draft.description)) missing.push('description');
  // Le titre n'est exigé que dans le parcours par catégorie (il le propose à l'étape « Description »).
  if (draft.category !== null && blank(draft.title)) missing.push('title');
  return missing;
}

export const REQUIRED_FIELD_LABELS: Record<RequiredField, string> = {
  transaction: 'Catégorie',
  propertyType: 'Type de bien',
  photos: 'Au moins une photo',
  address: 'Adresse',
  price: 'Prix ou loyer',
  livingArea: 'Surface',
  rooms: 'Nombre de pièces',
  energyClass: 'DPE',
  rentalEnergyClass: 'DPE interdit à la location',
  description: 'Description',
  title: 'Titre',
  landArea: 'Surface du terrain',
  agencyFeesPayer: 'Qui paie les honoraires',
};

export function stepOf(field: RequiredField): PublishStep {
  switch (field) {
    case 'transaction': case 'propertyType': return 'category';
    // Le prix se saisit d'abord avec l'adresse : son erreur s'affiche à cette étape.
    case 'address': case 'price': return 'main';
    case 'livingArea': case 'rooms': case 'energyClass': case 'landArea': case 'rentalEnergyClass': return 'features';
    case 'agencyFeesPayer': return 'finance';
    case 'photos': return 'media';
    case 'description': case 'title': return 'description';
  }
}

export function hotelOfDraft(draft: PublishDraft): HotelDraft | null {
  return draft.assetDetails?.kind === 'hotel' ? draft.assetDetails.hotel : null;
}

export function buildingOfDraft(draft: PublishDraft): BuildingDraft | null {
  return draft.assetDetails?.kind === 'building' ? draft.assetDetails.building : null;
}

/** Immeuble mixte : au moins un logement et un commerce. */
export function mixedBuildingIncomplete(draft: PublishDraft): boolean {
  const building = buildingOfDraft(draft);
  return draft.isMixedBuilding && ((building?.residentialUnits ?? 0) === 0 || (building?.commercialUnits ?? 0) === 0);
}

/** Champs obligatoires de l'étape remplis (PublishFlowView.stepIsComplete) ; l'adresse se vérifie en continuant. */
export function stepIsComplete(draft: PublishDraft, step: PublishStep, now = new Date()): boolean {
  const type = draft.propertyType;
  switch (step) {
    case 'category':
      return type !== null;
    case 'main':
      return postalCodeOf(draft) !== '' && cityOf(draft) !== '' && (draft.price ?? 0) > 0;
    case 'finance':
      return (draft.price ?? 0) > 0 && !feesNeedPayer(draft);
    case 'media':
      return draft.photos.length > 0;
    case 'description':
      return !blank(draft.title) && !blank(draft.description);
    case 'features':
      if (type === 'land') return (draft.landArea ?? 0) > 0;
      if ((draft.livingArea ?? 0) <= 0) return false;
      if (isDwelling(type) && (draft.rooms ?? 0) <= 0) return false;
      if (type === 'hotel' && (hotelOfDraft(draft)?.rooms ?? 0) <= 0) return false;
      if (requiresEnergyDiagnostic(type) && draft.energy.energyClass === null) return false;
      if (rentalBanMessage(draft, now) !== null) return false;
      if (mixedBuildingIncomplete(draft)) return false;
      return true;
    default:
      return true;
  }
}

export function postalCodeOf(draft: PublishDraft): string {
  return draft.address?.postalCode.trim() ?? '';
}

export function cityOf(draft: PublishDraft): string {
  return draft.address?.city.trim() ?? '';
}

// MARK: - Indicateurs calculés pendant la saisie

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function totalAnnualRent(building: BuildingDraft): number | null {
  if (building.residentialAnnualRent === null && building.commercialAnnualRent === null) return null;
  return (building.residentialAnnualRent ?? 0) + (building.commercialAnnualRent ?? 0);
}

export function totalUnits(building: BuildingDraft): number | null {
  if (building.residentialUnits === null && building.commercialUnits === null) return null;
  return (building.residentialUnits ?? 0) + (building.commercialUnits ?? 0);
}

/** Prix au m² d'une vente : prix ÷ surface habitable, ou ÷ surface du terrain pour un terrain. */
export function pricePerSquareMeter(draft: PublishDraft): number | null {
  if (draft.transaction !== 'sale' || draft.price === null || draft.price <= 0) return null;
  const area = draft.propertyType === 'land' ? draft.landArea : draft.livingArea;
  if (area === null || area <= 0) return null;
  return Math.round(draft.price / area);
}

/** Loyer charges comprises d'une location, seulement si le loyer et les charges sont saisis. */
export function rentIncludingCharges(draft: PublishDraft): number | null {
  if (draft.transaction !== 'rent' || draft.price === null || draft.monthlyCharges === null) return null;
  return draft.price + draft.monthlyCharges;
}

/** Loyers annuels actuels hors charges ; jamais le loyer potentiel. Immeuble : somme des loyers par usage. */
export function currentAnnualRent(draft: PublishDraft): number | null {
  const building = buildingOfDraft(draft);
  const total = building ? totalAnnualRent(building) : null;
  if (total !== null) return total;
  const monthly = draft.rentalInfo?.currentMonthlyRent ?? null;
  return monthly === null ? null : monthly * 12;
}

/** Rendement brut = loyers annuels actuels hors charges ÷ prix de vente (fraction). */
export function grossYield(draft: PublishDraft): number | null {
  const rent = currentAnnualRent(draft);
  if (draft.transaction !== 'sale' || rent === null || draft.price === null || draft.price <= 0) return null;
  return round(rent / draft.price, 4);
}

/** Rendement d'un loyer potentiel saisi comme hypothèse, affiché à part. */
export function potentialGrossYield(draft: PublishDraft): number | null {
  const potential = draft.rentalInfo?.potentialMonthlyRent ?? null;
  if (draft.transaction !== 'sale' || potential === null || draft.price === null || draft.price <= 0) return null;
  return round((potential * 12) / draft.price, 4);
}

/** Reporte les loyers d'un immeuble dans les informations locatives (utilisées par le calcul de rentabilité). */
export function syncBuildingRent(draft: PublishDraft): PublishDraft {
  const building = buildingOfDraft(draft);
  const total = building ? totalAnnualRent(building) : null;
  if (total === null) return draft;
  const info = draft.rentalInfo ?? emptyRental();
  return { ...draft, rentalInfo: { ...info, currentMonthlyRent: total > 0 ? round(total / 12, 2) : null, isLeased: total > 0 } };
}

/** Plafond légal du dépôt : 1 mois de loyer hors charges (vide), 2 mois (meublé). Avertissement non bloquant. */
export function depositWarning(draft: PublishDraft, format: (value: number) => string): string | null {
  const deposit = draft.rentalInfo?.securityDeposit ?? null;
  const rent = draft.price;
  if (!isDwelling(draft.propertyType) || deposit === null || rent === null || rent <= 0) return null;
  const months = draft.rentalInfo?.isFurnished === true ? 2 : 1;
  if (deposit <= rent * months) return null;
  return `Le dépôt dépasse le plafond légal de ${months === 2 ? '2 mois' : '1 mois'} de loyer hors charges (${format(rent * months)}).`;
}

// MARK: - Charges, énergie et honoraires

/** Charges d'une vente : un immeuble entier n'a pas de copropriété. */
export function saleChargesLabel(type: PropertyType | null): string {
  return type === 'building' ? "Charges de l'immeuble" : 'Charges de copropriété';
}

/** Charges d'une location, selon leur mode : provisions quand rien n'est précisé. */
export function rentalChargesLabel(mode: ChargesMode | null): string {
  return mode === 'flatRate' ? 'Forfait de charges' : 'Provisions sur charges';
}

/** Forfait de charges d'un logement loué vide : permis seulement en colocation. Avertissement non bloquant. */
export function flatRateWarning(draft: PublishDraft): string | null {
  const rental = draft.rentalInfo;
  if (draft.transaction !== 'rent' || !isDwelling(draft.propertyType) || rental?.chargesMode !== 'flatRate' || rental.isFurnished !== false) return null;
  return "En location vide, le forfait de charges n'est permis qu'en colocation.";
}

/** Part des charges payée par le locataire plus grande que les charges : avertissement non bloquant. */
export function tenantShareWarning(draft: PublishDraft): string | null {
  const share = draft.rentalInfo?.recoverableMonthlyCharges ?? null;
  const charges = draft.monthlyCharges;
  if (draft.transaction !== 'sale' || share === null || charges === null || share <= charges) return null;
  return 'La part du locataire dépasse les charges : vérifiez les deux montants.';
}

/** Dépenses d'énergie dans l'ordre : le plus petit montant d'abord, quel que soit le champ où il a été saisi. */
export function energyCostRange(energy: EnergyDraft): { min: number | null; max: number | null } {
  const { annualEnergyCostMin: min, annualEnergyCostMax: max } = energy;
  return min !== null && max !== null && min > max ? { min: max, max: min } : { min, max };
}

/** Un seul des deux montants du DPE : la fiche n'affiche l'estimation qu'avec les deux. */
export function energyCostHint(energy: EnergyDraft): string | null {
  return (energy.annualEnergyCostMin === null) !== (energy.annualEnergyCostMax === null) ? 'Indiquez les deux montants du DPE.' : null;
}

/** Honoraires saisis sans dire qui les paie : à compléter avant de continuer ou de publier. */
export function feesNeedPayer(draft: PublishDraft): boolean {
  return draft.agencyFeesAmount !== null && draft.agencyFeesPaidBy === null;
}
