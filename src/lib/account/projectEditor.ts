import { appDate, appDateString } from '../appDates';
import { formatArea, formatFraction, formatPrice, formatSignedAmount } from '../format';
import { PROPERTY_TYPE_LABELS, type PropertyType } from '../labels';
import { scopeLabel, type HotelScope } from '../listingJson';
import type { Coordinate } from '../places';
import { projectCompletion } from '../projectSearch';
import type { EnergyClass, OutdoorSpace } from '../search';
import { supabase } from '../supabase';
import { PROJECT_KIND_LABELS, PROJECT_STEPS, type ProjectKind, type ProjectStep } from './project';
import { createStore, currentUserId, sessionStore } from './session';

// « Mon projet immobilier » (Features/Profile/ProjectEditorView.swift) : les critères des quatre parcours
// (ImmoDomain/Engagement/ProjectCriteria.swift), les étapes (RealEstateProject.swift) et la ligne de
// real_estate_projects que l'app lit et écrit (ProjectServer.swift, SupabaseProjectRepository) : même colonnes, mêmes
// clés JSON, mêmes valeurs. Comme l'encodeur de Swift, une valeur facultative vide est omise, un booléen, une liste
// et le lieu sont toujours écrits, les identifiants partent en majuscules et les dates en UTC sans fuseau.

export type Financing = 'bankLoan' | 'cash' | 'undecided';
export type ProjectLocation = { place: string; radiusKilometers: number | null; center: Coordinate | null };

export type ResidentialCriteria = {
  maxBudget: number | null;
  downPayment: number | null;
  financing: Financing | null;
  maxMonthlyPayment: number | null;
  propertyTypes: PropertyType[];
  minRooms: number | null;
  minBedrooms: number | null;
  minArea: number | null;
  minLandArea: number | null;
  excludesGroundFloor: boolean;
  requiresElevator: boolean;
  outdoorSpaces: OutdoorSpace[];
  requiresParking: boolean;
  worstEnergyClass: EnergyClass | null;
  isNewBuild: boolean | null;
  minFloor: number | null;
  maxFloor: number | null;
  minYearBuilt: number | null;
  requiresDocumentedBuildability: boolean;
  requiresServiced: boolean;
  location: ProjectLocation;
};

export type InvestmentCriteria = {
  maxPrice: number | null;
  downPayment: number | null;
  financing: Financing | null;
  maxMonthlyPayment: number | null;
  worksBudget: number | null;
  assetTypes: PropertyType[];
  /** Fractions (0,07 = 7 %). */
  minGrossYield: number | null;
  minNetYield: number | null;
  minMonthlyCashFlow: number | null;
  minCurrentMonthlyRent: number | null;
  leasedOnly: boolean;
  includesMixedBuildings: boolean;
  minUnits: number | null;
  maxAnnualPropertyTax: number | null;
  worstEnergyClass: EnergyClass | null;
  location: ProjectLocation;
};

export type RentalCriteria = {
  maxRent: number | null;
  maxMonthlyCharges: number | null;
  propertyTypes: PropertyType[];
  minRooms: number | null;
  minBedrooms: number | null;
  minArea: number | null;
  furnished: boolean | null;
  moveInBy: Date | null;
  requiresElevator: boolean;
  requiresParking: boolean;
  outdoorSpaces: OutdoorSpace[];
  worstEnergyClass: EnergyClass | null;
  hasGuarantor: boolean | null;
  isApplicationReady: boolean | null;
  location: ProjectLocation;
};

export type HotelCriteria = {
  scope: HotelScope | null;
  maxBudget: number | null;
  downPayment: number | null;
  financing: Financing | null;
  worksBudget: number | null;
  minRooms: number | null;
  minStars: number | null;
  minArea: number | null;
  minAnnualRevenue: number | null;
  minEBITDA: number | null;
  minOperatingIncome: number | null;
  /** Fraction (0,7 = 70 %). */
  minOccupancyRate: number | null;
  location: ProjectLocation;
};

export type ProjectCriteria = {
  residential: ResidentialCriteria;
  investment: InvestmentCriteria;
  rental: RentalCriteria;
  hotel: HotelCriteria;
};

/** Projet du compte (RealEstateProject). */
export type Project = {
  id: string;
  kind: ProjectKind;
  city: string;
  purpose: string | null;
  completedSteps: ProjectStep[];
  criteria: ProjectCriteria;
  sharesWithContacts: boolean;
};

// MARK: - Listes et libellés de l'app

const ALL_PROPERTY_TYPES: PropertyType[] = ['apartment', 'house', 'building', 'land', 'commercial', 'office', 'parking', 'hotel', 'other'];
const ALL_STEPS: ProjectStep[] = ['search', 'analysis', 'visits', 'selection', 'application', 'audit', 'offer', 'financing', 'lease', 'signature', 'moveIn'];
const KINDS: ProjectKind[] = ['buy', 'rent', 'invest', 'hotel'];
const ENERGY: EnergyClass[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const OUTDOOR: OutdoorSpace[] = ['balcony', 'terrace', 'garden'];
const SCOPES: HotelScope[] = ['wallsAndBusiness', 'wallsOnly', 'businessOnly'];
const FINANCINGS: Financing[] = ['bankLoan', 'cash', 'undecided'];

/** Types d'un projet résidentiel (ResidentialCriteria.propertyTypes). */
export const RESIDENTIAL_TYPES: PropertyType[] = ['apartment', 'house', 'land'];
/** Actifs d'investissement (InvestmentProjectCriteria.assetTypes) : l'hôtel a sa propre catégorie. */
export const INVESTMENT_ASSET_TYPES: PropertyType[] = ['apartment', 'house', 'building', 'commercial', 'office'];
/** Types de la catégorie Location de la publication (PublishCategory.rental.propertyTypes). */
export const RENTAL_TYPES: PropertyType[] = ['apartment', 'house', 'parking', 'land', 'commercial', 'office'];

/** Ordre des tuiles de catégorie (ProjectKind.displayOrder). */
export const KIND_DISPLAY_ORDER: ProjectKind[] = ['buy', 'invest', 'rent', 'hotel'];

export const KIND_SUBTITLES: Record<ProjectKind, string> = {
  buy: 'Acheter pour habiter',
  rent: 'Trouver mon futur logement',
  invest: 'Générer des revenus immobiliers',
  hotel: 'Acquérir ou reprendre un hôtel',
};

/** Aide de chaque étape (ProjectStep.hint, MySpaceComponents.swift). */
export const STEP_HINTS: Record<ProjectStep, string> = {
  search: 'Définir les critères et repérer des biens.',
  analysis: 'Étudier la rentabilité, les charges et le marché.',
  visits: 'Visiter les biens retenus.',
  selection: 'Choisir le bien qui vous correspond.',
  application: 'Constituer et envoyer votre dossier.',
  audit: 'Vérifier les comptes, les murs et le fonds.',
  offer: 'Faire une offre d\'achat écrite.',
  financing: 'Obtenir l\'accord de prêt.',
  lease: 'Signer le bail et l\'état des lieux.',
  signature: 'Signer le compromis puis l\'acte authentique.',
  moveIn: 'Récupérer les clés et emménager.',
};

/** Libellé d'un actif dans Investir (PropertyType.investmentLabel). */
export function investmentLabel(type: PropertyType): string {
  if (type === 'house') return 'Maison locative';
  if (type === 'building') return 'Immeuble de rapport';
  return PROPERTY_TYPE_LABELS[type];
}

/** Frais de notaire de l'ancien et du neuf (InvestmentAssumptions.standard). */
export const NOTARY_FEE_RATE_EXISTING = 0.075;
export const NOTARY_FEE_RATE_NEW_BUILD = 0.025;

// MARK: - Valeurs vides

export const emptyLocation = (): ProjectLocation => ({ place: '', radiusKilometers: null, center: null });

export const emptyResidential = (): ResidentialCriteria => ({
  maxBudget: null, downPayment: null, financing: null, maxMonthlyPayment: null, propertyTypes: [], minRooms: null, minBedrooms: null,
  minArea: null, minLandArea: null, excludesGroundFloor: false, requiresElevator: false, outdoorSpaces: [], requiresParking: false,
  worstEnergyClass: null, isNewBuild: null, minFloor: null, maxFloor: null, minYearBuilt: null, requiresDocumentedBuildability: false,
  requiresServiced: false, location: emptyLocation(),
});

export const emptyInvestment = (): InvestmentCriteria => ({
  maxPrice: null, downPayment: null, financing: null, maxMonthlyPayment: null, worksBudget: null, assetTypes: [], minGrossYield: null,
  minNetYield: null, minMonthlyCashFlow: null, minCurrentMonthlyRent: null, leasedOnly: false, includesMixedBuildings: false,
  minUnits: null, maxAnnualPropertyTax: null, worstEnergyClass: null, location: emptyLocation(),
});

export const emptyRental = (): RentalCriteria => ({
  maxRent: null, maxMonthlyCharges: null, propertyTypes: [], minRooms: null, minBedrooms: null, minArea: null, furnished: null,
  moveInBy: null, requiresElevator: false, requiresParking: false, outdoorSpaces: [], worstEnergyClass: null, hasGuarantor: null,
  isApplicationReady: null, location: emptyLocation(),
});

export const emptyHotel = (): HotelCriteria => ({
  scope: null, maxBudget: null, downPayment: null, financing: null, worksBudget: null, minRooms: null, minStars: null, minArea: null,
  minAnnualRevenue: null, minEBITDA: null, minOperatingIncome: null, minOccupancyRate: null, location: emptyLocation(),
});

export const emptyCriteria = (): ProjectCriteria => ({
  residential: emptyResidential(), investment: emptyInvestment(), rental: emptyRental(), hotel: emptyHotel(),
});

/** Identifiant comme Swift l'écrit (`uuidString`, en majuscules). */
export const newUUID = (): string => crypto.randomUUID().toUpperCase();

/** Projet de départ d'un compte qui n'en a pas : Résidentiel, sans ville (RealEstateProject(kind: .buy, city: "")). */
export function newProject(id = newUUID()): Project {
  return { id, kind: 'buy', city: '', purpose: null, completedSteps: [], criteria: emptyCriteria(), sharesWithContacts: false };
}

// MARK: - Lecture (décodage tolérant de l'app)

type Json = Record<string, unknown>;

function object(value: unknown): Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function int(value: unknown): number | null {
  const n = num(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

const bool = (value: unknown): boolean => value === true;
const optionalBool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Ensemble de l'app (Set) : sans doublon, dans l'ordre de ses cas. */
function setOf<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return allowed.filter((item) => value.includes(item));
}

function decodeLocation(value: unknown): ProjectLocation {
  const json = object(value);
  const center = object(json.center);
  const latitude = num(center.latitude);
  const longitude = num(center.longitude);
  return {
    place: typeof json.place === 'string' ? json.place : '',
    radiusKilometers: int(json.radiusKilometers),
    center: latitude !== null && longitude !== null ? { latitude, longitude } : null,
  };
}

export function decodeCriteria(value: unknown): ProjectCriteria {
  const json = object(value);
  const r = object(json.residential);
  const i = object(json.investment);
  const l = object(json.rental);
  const h = object(json.hotel);
  return {
    residential: {
      maxBudget: num(r.maxBudget), downPayment: num(r.downPayment), financing: oneOf(r.financing, FINANCINGS),
      maxMonthlyPayment: num(r.maxMonthlyPayment), propertyTypes: setOf(r.propertyTypes, ALL_PROPERTY_TYPES), minRooms: int(r.minRooms),
      minBedrooms: int(r.minBedrooms), minArea: num(r.minArea), minLandArea: num(r.minLandArea), excludesGroundFloor: bool(r.excludesGroundFloor),
      requiresElevator: bool(r.requiresElevator), outdoorSpaces: setOf(r.outdoorSpaces, OUTDOOR), requiresParking: bool(r.requiresParking),
      worstEnergyClass: oneOf(r.worstEnergyClass, ENERGY), isNewBuild: optionalBool(r.isNewBuild), minFloor: int(r.minFloor),
      maxFloor: int(r.maxFloor), minYearBuilt: int(r.minYearBuilt), requiresDocumentedBuildability: bool(r.requiresDocumentedBuildability),
      requiresServiced: bool(r.requiresServiced), location: decodeLocation(r.location),
    },
    investment: {
      maxPrice: num(i.maxPrice), downPayment: num(i.downPayment), financing: oneOf(i.financing, FINANCINGS),
      maxMonthlyPayment: num(i.maxMonthlyPayment), worksBudget: num(i.worksBudget),
      // L'hôtel ne fait plus partie des actifs d'investissement (intersection avec assetTypes).
      assetTypes: setOf(i.assetTypes, INVESTMENT_ASSET_TYPES), minGrossYield: num(i.minGrossYield), minNetYield: num(i.minNetYield),
      minMonthlyCashFlow: num(i.minMonthlyCashFlow), minCurrentMonthlyRent: num(i.minCurrentMonthlyRent), leasedOnly: bool(i.leasedOnly),
      includesMixedBuildings: bool(i.includesMixedBuildings), minUnits: int(i.minUnits), maxAnnualPropertyTax: num(i.maxAnnualPropertyTax),
      worstEnergyClass: oneOf(i.worstEnergyClass, ENERGY), location: decodeLocation(i.location),
    },
    rental: {
      maxRent: num(l.maxRent), maxMonthlyCharges: num(l.maxMonthlyCharges), propertyTypes: setOf(l.propertyTypes, ALL_PROPERTY_TYPES),
      minRooms: int(l.minRooms), minBedrooms: int(l.minBedrooms), minArea: num(l.minArea), furnished: optionalBool(l.furnished),
      moveInBy: appDate(l.moveInBy), requiresElevator: bool(l.requiresElevator), requiresParking: bool(l.requiresParking),
      outdoorSpaces: setOf(l.outdoorSpaces, OUTDOOR), worstEnergyClass: oneOf(l.worstEnergyClass, ENERGY),
      hasGuarantor: optionalBool(l.hasGuarantor), isApplicationReady: optionalBool(l.isApplicationReady), location: decodeLocation(l.location),
    },
    hotel: {
      scope: oneOf(h.scope, SCOPES), maxBudget: num(h.maxBudget), downPayment: num(h.downPayment), financing: oneOf(h.financing, FINANCINGS),
      worksBudget: num(h.worksBudget), minRooms: int(h.minRooms), minStars: int(h.minStars), minArea: num(h.minArea),
      minAnnualRevenue: num(h.minAnnualRevenue), minEBITDA: num(h.minEBITDA), minOperatingIncome: num(h.minOperatingIncome),
      minOccupancyRate: num(h.minOccupancyRate), location: decodeLocation(h.location),
    },
  };
}

/** Ligne lue (ProjectServerRow.project) ; `null` pour une catégorie inconnue, comme l'app. */
export function projectFromRow(row: unknown): Project | null {
  const json = object(row);
  const kind = oneOf(json.kind, KINDS);
  if (!kind || typeof json.id !== 'string') return null;
  const steps = Array.isArray(json.completed_steps) ? json.completed_steps : [];
  return {
    id: json.id,
    kind,
    city: typeof json.city === 'string' ? json.city : '',
    purpose: typeof json.purpose === 'string' ? json.purpose : null,
    completedSteps: ALL_STEPS.filter((step) => steps.includes(step)),
    criteria: decodeCriteria(json.criteria),
    sharesWithContacts: json.shared_with_contacts === true,
  };
}

// MARK: - Écriture (Encodable de Swift)

/** Ajoute la clé seulement si la valeur existe (encodeIfPresent). */
function put(target: Json, key: string, value: unknown) {
  if (value !== null && value !== undefined) target[key] = value;
}

/** Ensemble écrit dans l'ordre des cas (l'app écrit un Set, dont l'ordre ne compte pas). */
const typesOf = (types: PropertyType[]) => ALL_PROPERTY_TYPES.filter((type) => types.includes(type));
const outdoorOf = (spaces: OutdoorSpace[]) => OUTDOOR.filter((space) => spaces.includes(space));

function encodeLocation(location: ProjectLocation): Json {
  const json: Json = { place: location.place };
  put(json, 'radiusKilometers', location.radiusKilometers);
  if (location.center) json.center = { latitude: location.center.latitude, longitude: location.center.longitude };
  return json;
}

function encodeResidential(c: ResidentialCriteria): Json {
  const json: Json = {};
  put(json, 'maxBudget', c.maxBudget);
  put(json, 'downPayment', c.downPayment);
  put(json, 'financing', c.financing);
  put(json, 'maxMonthlyPayment', c.maxMonthlyPayment);
  json.propertyTypes = typesOf(c.propertyTypes);
  put(json, 'minRooms', c.minRooms);
  put(json, 'minBedrooms', c.minBedrooms);
  put(json, 'minArea', c.minArea);
  put(json, 'minLandArea', c.minLandArea);
  json.excludesGroundFloor = c.excludesGroundFloor;
  json.requiresElevator = c.requiresElevator;
  json.outdoorSpaces = outdoorOf(c.outdoorSpaces);
  json.requiresParking = c.requiresParking;
  put(json, 'worstEnergyClass', c.worstEnergyClass);
  put(json, 'isNewBuild', c.isNewBuild);
  put(json, 'minFloor', c.minFloor);
  put(json, 'maxFloor', c.maxFloor);
  put(json, 'minYearBuilt', c.minYearBuilt);
  json.requiresDocumentedBuildability = c.requiresDocumentedBuildability;
  json.requiresServiced = c.requiresServiced;
  json.location = encodeLocation(c.location);
  return json;
}

function encodeInvestment(c: InvestmentCriteria): Json {
  const json: Json = {};
  put(json, 'maxPrice', c.maxPrice);
  put(json, 'downPayment', c.downPayment);
  put(json, 'financing', c.financing);
  put(json, 'maxMonthlyPayment', c.maxMonthlyPayment);
  put(json, 'worksBudget', c.worksBudget);
  json.assetTypes = typesOf(c.assetTypes);
  put(json, 'minGrossYield', c.minGrossYield);
  put(json, 'minNetYield', c.minNetYield);
  put(json, 'minMonthlyCashFlow', c.minMonthlyCashFlow);
  put(json, 'minCurrentMonthlyRent', c.minCurrentMonthlyRent);
  json.leasedOnly = c.leasedOnly;
  json.includesMixedBuildings = c.includesMixedBuildings;
  put(json, 'minUnits', c.minUnits);
  put(json, 'maxAnnualPropertyTax', c.maxAnnualPropertyTax);
  put(json, 'worstEnergyClass', c.worstEnergyClass);
  json.location = encodeLocation(c.location);
  return json;
}

function encodeRental(c: RentalCriteria): Json {
  const json: Json = {};
  put(json, 'maxRent', c.maxRent);
  put(json, 'maxMonthlyCharges', c.maxMonthlyCharges);
  json.propertyTypes = typesOf(c.propertyTypes);
  put(json, 'minRooms', c.minRooms);
  put(json, 'minBedrooms', c.minBedrooms);
  put(json, 'minArea', c.minArea);
  put(json, 'furnished', c.furnished);
  put(json, 'moveInBy', c.moveInBy ? appDateString(c.moveInBy) : null);
  json.requiresElevator = c.requiresElevator;
  json.requiresParking = c.requiresParking;
  json.outdoorSpaces = outdoorOf(c.outdoorSpaces);
  put(json, 'worstEnergyClass', c.worstEnergyClass);
  put(json, 'hasGuarantor', c.hasGuarantor);
  put(json, 'isApplicationReady', c.isApplicationReady);
  json.location = encodeLocation(c.location);
  return json;
}

function encodeHotel(c: HotelCriteria): Json {
  const json: Json = {};
  put(json, 'scope', c.scope);
  put(json, 'maxBudget', c.maxBudget);
  put(json, 'downPayment', c.downPayment);
  put(json, 'financing', c.financing);
  put(json, 'worksBudget', c.worksBudget);
  put(json, 'minRooms', c.minRooms);
  put(json, 'minStars', c.minStars);
  put(json, 'minArea', c.minArea);
  put(json, 'minAnnualRevenue', c.minAnnualRevenue);
  put(json, 'minEBITDA', c.minEBITDA);
  put(json, 'minOperatingIncome', c.minOperatingIncome);
  put(json, 'minOccupancyRate', c.minOccupancyRate);
  json.location = encodeLocation(c.location);
  return json;
}

/** Les quatre parcours, toujours écrits (ProjectCriteria encodé par l'app). */
export function encodeCriteria(criteria: ProjectCriteria): Json {
  return {
    residential: encodeResidential(criteria.residential),
    investment: encodeInvestment(criteria.investment),
    rental: encodeRental(criteria.rental),
    hotel: encodeHotel(criteria.hotel),
  };
}

/** Les 100 premiers caractères, comptés comme Swift (`prefix(100)` : un emoji ou une lettre accentuée compte pour un). */
function prefix100(text: string): string {
  const segments = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(text), (part) => part.segment)
    : Array.from(text);
  return segments.slice(0, 100).join('');
}

/** Ligne écrite par « Enregistrer mon projet » (ProjectServerRow(userId:project:)) ; `purpose` toujours présent. */
export function projectRow(userId: string, project: Project) {
  const purpose = project.purpose?.trim() || null;
  return {
    user_id: userId.toUpperCase(),
    id: project.id.toUpperCase(),
    kind: project.kind,
    city: prefix100(project.city),
    purpose,
    completed_steps: [...project.completedSteps].sort(),
    criteria: encodeCriteria(project.criteria),
    shared_with_contacts: project.sharesWithContacts,
  };
}

/** Même projet (les étapes comptent comme un ensemble) : « modifications non enregistrées ». */
export function sameProject(a: Project, b: Project): boolean {
  return JSON.stringify(projectRow('', a)) === JSON.stringify(projectRow('', b));
}

/** Critères tous vides (ProjectCriteria()) : la pastille « Projet actif » ne s'affiche pas. */
export function isEmptyCriteria(criteria: ProjectCriteria): boolean {
  return JSON.stringify(encodeCriteria(criteria)) === JSON.stringify(encodeCriteria(emptyCriteria()));
}

// MARK: - Règles du projet

/** Part des critères pertinents renseignés, de 0 à 1 (RealEstateProject.completion). */
export function completionOf(project: Pick<Project, 'kind' | 'criteria'>): number {
  return projectCompletion(project.kind, encodeCriteria(project.criteria));
}

export function isStepCompleted(project: Pick<Project, 'kind' | 'completedSteps'>, step: ProjectStep): boolean {
  return PROJECT_STEPS[project.kind].includes(step) && project.completedSteps.includes(step);
}

/** Coche ou décoche une étape du parcours (toggle). */
export function toggleStep(project: Project, step: ProjectStep): Project {
  if (!PROJECT_STEPS[project.kind].includes(step)) return project;
  const done = project.completedSteps.includes(step);
  return { ...project, completedSteps: done ? project.completedSteps.filter((other) => other !== step) : [...project.completedSteps, step] };
}

/** Change de parcours en gardant les étapes communes déjà franchies (change(to:)). */
export function changeKind(project: Project, kind: ProjectKind): Project {
  return { ...project, kind, completedSteps: project.completedSteps.filter((step) => PROJECT_STEPS[kind].includes(step)) };
}

/** « Réinitialiser » : vide seulement les critères du parcours affiché (reset()). */
export function resetCategory(project: Project): Project {
  const criteria = { ...project.criteria };
  switch (project.kind) {
    case 'buy': criteria.residential = emptyResidential(); break;
    case 'invest': criteria.investment = emptyInvestment(); break;
    case 'rent': criteria.rental = emptyRental(); break;
    case 'hotel': criteria.hotel = emptyHotel(); break;
  }
  return { ...project, criteria };
}

export function locationOf(criteria: ProjectCriteria, kind: ProjectKind): ProjectLocation {
  switch (kind) {
    case 'buy': return criteria.residential.location;
    case 'invest': return criteria.investment.location;
    case 'rent': return criteria.rental.location;
    case 'hotel': return criteria.hotel.location;
  }
}

export const DOWN_PAYMENT_ISSUE = 'L\'apport dépasse le budget.';
export const PERCENTAGE_ISSUE = 'Saisissez un pourcentage entre 0 et 100.';

/** Problèmes de saisie du parcours, par champ (ProjectCriteria.issues(for:)). */
export function projectIssues(criteria: ProjectCriteria, kind: ProjectKind): Record<string, string> {
  const issues: Record<string, string> = {};
  const percentage = (value: number | null, key: string) => {
    if (value !== null && (value < 0 || value > 1)) issues[key] = PERCENTAGE_ISSUE;
  };
  const downPayment = (down: number | null, budget: number | null) => {
    if (down !== null && budget !== null && down > budget) issues.downPayment = DOWN_PAYMENT_ISSUE;
  };
  switch (kind) {
    case 'buy':
      downPayment(criteria.residential.downPayment, criteria.residential.maxBudget);
      break;
    case 'invest':
      downPayment(criteria.investment.downPayment, criteria.investment.maxPrice);
      percentage(criteria.investment.minGrossYield, 'minGrossYield');
      percentage(criteria.investment.minNetYield, 'minNetYield');
      break;
    case 'rent':
      break;
    case 'hotel':
      downPayment(criteria.hotel.downPayment, criteria.hotel.maxBudget);
      percentage(criteria.hotel.minOccupancyRate, 'minOccupancyRate');
      break;
  }
  return issues;
}

/** Projet enregistré : la ville du projet suit le lieu de la catégorie (save()). */
export function projectToSave(project: Project): Project {
  const place = locationOf(project.criteria, project.kind).place;
  return place ? { ...project, city: place } : project;
}

/** Sous-titre de la carte du projet : usage ou catégorie, puis la ville (ProjectCard). */
export function projectSubtitle(project: Pick<Project, 'kind' | 'city' | 'purpose'>): string {
  return [project.purpose ?? PROJECT_KIND_LABELS[project.kind], project.city].filter((part) => part !== '').join(' · ');
}

// MARK: - Résumé (ProjectSummaryRows)

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

function typesLabel(types: PropertyType[]): string | null {
  const chosen = ALL_PROPERTY_TYPES.filter((type) => types.includes(type));
  return chosen.length ? chosen.map((type) => PROPERTY_TYPE_LABELS[type]).join(', ') : null;
}

function areaRooms(area: number | null, rooms: number | null): string | null {
  const parts = [area !== null ? `≥ ${formatArea(area)}` : null, rooms !== null ? `${rooms} p. et +` : null].filter((part): part is string => part !== null);
  return parts.length ? parts.join(' · ') : null;
}

/** Ligne du budget (ProjectBudgetLine.row). */
function budgetLine(title: string, budget: number | null, downPayment: number | null, appendsDownPayment: boolean): [string, string | null] {
  if (budget !== null) {
    const down = appendsDownPayment && downPayment !== null ? ` · apport ${formatPrice(downPayment)}` : '';
    return [title, formatPrice(budget) + down];
  }
  if (downPayment !== null && downPayment > 0) return ['Apport', formatPrice(downPayment)];
  return [title, null];
}

export function summaryRows(project: Pick<Project, 'kind' | 'criteria'>): [string, string | null][] {
  const c = project.criteria;
  const where = locationOf(c, project.kind);
  const zone = where.place ? where.place + (where.radiusKilometers !== null ? ` · ${where.radiusKilometers} km` : '') : null;
  switch (project.kind) {
    case 'buy': {
      const r = c.residential;
      return [['Type de bien', typesLabel(r.propertyTypes)], budgetLine('Budget maximum', r.maxBudget, r.downPayment, false),
        ['Surface et pièces', areaRooms(r.minArea, r.minRooms)], ['Localisation', zone]];
    }
    case 'invest': {
      const i = c.investment;
      const target = i.minGrossYield !== null ? `brut ≥ ${formatFraction(i.minGrossYield)}`
        : i.minNetYield !== null ? `net ≥ ${formatFraction(i.minNetYield)}` : null;
      return [['Type d\'actif', typesLabel(i.assetTypes)], budgetLine('Budget et apport', i.maxPrice, i.downPayment, true),
        ['Rendement cible', target], ['Cash-flow cible', i.minMonthlyCashFlow !== null ? `≥ ${formatSignedAmount(i.minMonthlyCashFlow)}/mois` : null],
        ['Localisation', zone]];
    }
    case 'rent': {
      const r = c.rental;
      const total = r.maxRent !== null && r.maxMonthlyCharges !== null ? r.maxRent + r.maxMonthlyCharges : null;
      const budget = total !== null ? `${formatPrice(total)} CC` : r.maxRent !== null ? `${formatPrice(r.maxRent)} HC` : null;
      return [['Type de bien', typesLabel(r.propertyTypes)], ['Budget mensuel', budget], ['Surface et pièces', areaRooms(r.minArea, r.minRooms)],
        ['Date d\'entrée', r.moveInBy ? `avant le ${dayMonth.format(r.moveInBy)}` : null], ['Localisation', zone]];
    }
    case 'hotel': {
      const h = c.hotel;
      const targets = [
        h.minAnnualRevenue !== null ? `CA ≥ ${formatPrice(h.minAnnualRevenue)}` : null,
        h.minEBITDA !== null ? `EBITDA ≥ ${formatPrice(h.minEBITDA)}` : null,
        h.minOperatingIncome !== null ? `résultat ≥ ${formatPrice(h.minOperatingIncome)}` : null,
        h.minOccupancyRate !== null ? `occupation ≥ ${formatFraction(h.minOccupancyRate, 0)}` : null,
      ].filter((part): part is string => part !== null);
      return [['Opération', h.scope ? scopeLabel(h.scope) : 'À définir'], budgetLine('Budget global', h.maxBudget, h.downPayment, false),
        ['Chambres', h.minRooms !== null ? `${h.minRooms} et +` : null], ['Indicateurs ciblés', targets.length ? targets.join(', ') : null],
        ['Zone recherchée', zone]];
    }
  }
}

// MARK: - Champs de montant (AmountField, GroupedNumberInput)

/** Espace des milliers de l'app (espace fine insécable). */
const THOUSANDS = '\u202F';

function groupThousands(digits: string): string {
  if (digits.length <= 3) return digits;
  let result = '';
  for (let index = 0; index < digits.length; index++) {
    if (index > 0 && (digits.length - index) % 3 === 0) result += THOUSANDS;
    result += digits[index];
  }
  return result;
}

/**
 * Texte tapé → texte affiché (GroupedNumberInput.format) : chiffres groupés par trois (sauf `groups` à false),
 * une seule virgule, 12 chiffres avant la virgule au plus, un « - » en tête si permis ; le reste est ignoré.
 */
export function groupedInput(text: string, allowsNegative = false, groups = true): string {
  const trimmed = text.trim();
  const negative = allowsNegative && (trimmed.startsWith('-') || trimmed.startsWith('−'));
  let integer = '';
  let fraction = '';
  let comma = false;
  for (const character of text) {
    if (character >= '0' && character <= '9') {
      if (comma) fraction += character;
      else if (integer.length < 12) integer += character;
    } else if ((character === ',' || character === '.') && !comma) {
      comma = true;
    }
  }
  let result = negative ? '-' : '';
  result += groups ? groupThousands(integer) : integer;
  if (comma) result += `${integer ? '' : '0'},${fraction}`;
  return result;
}

/** Virgule décimale déplacée dans le texte (÷ 10^places, × si négatif) : pas de bruit de calcul (0,071 et non 0,0709999…). */
function shiftPoint(plain: string, places: number): string {
  const negative = plain.startsWith('-');
  const body = negative ? plain.slice(1) : plain;
  let [integer, fraction = ''] = body.split('.');
  if (places > 0) {
    integer = integer.padStart(places + 1, '0');
    fraction = integer.slice(integer.length - places) + fraction;
    integer = integer.slice(0, integer.length - places);
  } else if (places < 0) {
    const count = -places;
    fraction = fraction.padEnd(count, '0');
    integer += fraction.slice(0, count);
    fraction = fraction.slice(count);
  }
  integer = integer.replace(/^0+(?=\d)/, '');
  fraction = fraction.replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

function plainNumber(value: number): string {
  const text = String(value);
  return /e/i.test(text) ? value.toFixed(12).replace(/\.?0+$/, '') : text;
}

/** Valeur d'un champ (GroupedNumberInput.value, puis ÷ 100 pour un pourcentage) ; null sans chiffre. */
export function inputAmount(text: string, allowsNegative = false, percent = false): number | null {
  if (!/[0-9]/.test(text)) return null;
  const cleaned = groupedInput(text, allowsNegative, false).replace(',', '.');
  const plain = cleaned.endsWith('.') ? cleaned.slice(0, -1) : cleaned;
  const value = Number(percent ? shiftPoint(plain, 2) : plain);
  return Number.isFinite(value) ? value : null;
}

/** Texte d'une valeur enregistrée (AmountField.format) : 0,065 en pourcentage → « 6,5 », 250000 → « 250 000 ». */
export function amountText(value: number | null, percent = false, groups = true): string {
  if (value === null) return '';
  const plain = percent ? shiftPoint(plainNumber(value), -2) : plainNumber(value);
  return groupedInput(plain, true, groups);
}

/** Texte non vide sans nombre (« - » seul) : « Saisissez un nombre, par exemple 250000 ou 6,5. ». */
export const AMOUNT_INVALID = 'Saisissez un nombre, par exemple 250000 ou 6,5.';

// MARK: - Serveur

export const PROJECT_SAVE_ERROR = 'Impossible d\'enregistrer votre projet. Réessayez dans un instant.';

export type EditableProjectState =
  | { status: 'none' | 'loading' | 'error' }
  | { status: 'ready'; project: Project };

/** Projet du compte, lu en entier (critères et partage compris) pour Mon espace sur ordinateur. */
export const editableProjectStore = createStore<EditableProjectState>({ status: 'none' });

/** Lecture de l'app : `select(user_id, id, kind, city, purpose, completed_steps, criteria, shared_with_contacts)`. */
export async function loadEditableProject(): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    editableProjectStore.set({ status: 'none' });
    return;
  }
  if (editableProjectStore.get().status !== 'ready') editableProjectStore.set({ status: 'loading' });
  const { data, error } = await supabase
    .from('real_estate_projects')
    .select('user_id, id, kind, city, purpose, completed_steps, criteria, shared_with_contacts')
    .eq('user_id', session.userId)
    .limit(1);
  if (currentUserId() !== session.userId) return;
  if (error) {
    editableProjectStore.set({ status: 'error' });
    return;
  }
  const row = (data ?? [])[0];
  editableProjectStore.set({ status: 'ready', project: (row && projectFromRow(row)) || newProject() });
}

/** « Enregistrer mon projet » : un seul upsert sur user_id (SupabaseProjectRepository.save). Message d'erreur ou null. */
export async function saveProject(project: Project): Promise<string | null> {
  const userId = currentUserId();
  if (!userId) return PROJECT_SAVE_ERROR;
  const { error } = await supabase.from('real_estate_projects').upsert(projectRow(userId, project), { onConflict: 'user_id' });
  if (error) return PROJECT_SAVE_ERROR;
  if (currentUserId() === userId) editableProjectStore.set({ status: 'ready', project });
  return null;
}
