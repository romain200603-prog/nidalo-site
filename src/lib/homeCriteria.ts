import type { CustomAmount, SelectionOption } from '../components/SelectionDialog';
import type { IconName } from '../components/iconPaths';
import { scopeLabel, type HotelScope } from './listingJson';
import { formatArea, formatPrice } from './format';
import { PROPERTY_TYPE_LABELS, type PropertyType, type SearchMode } from './labels';
import {
  investmentKind, LIGHT_WORKS_LIMIT, MODE_PROPERTY_TYPES, withInvestmentKind, type InvestmentKind, type SearchDraft,
} from './search';

// Tuiles de critères de l'accueil, comme l'app : HomeView.swift (HomeSearchCard.tiles) et
// Features/Home/SearchCriterionOptions.swift (valeurs proposées et libellés). Ce sont exactement les seuils que la
// recherche applique.

export const SALE_PRICES = [150_000, 200_000, 250_000, 300_000, 350_000, 400_000, 500_000, 750_000, 1_000_000];
export const INVESTMENT_PRICES = [...SALE_PRICES, 1_500_000, 2_000_000];
/** Paliers de 250 000 € jusqu'à 5 M€. */
export const HOTEL_PRICES = Array.from({ length: 20 }, (_, i) => (i + 1) * 250_000);
export const RENTS = [500, 700, 900, 1_000, 1_200, 1_500, 2_000];
export const SALE_AREAS = [20, 30, 40, 50, 60, 80, 100, 150];
export const RENT_AREAS = [15, 20, 30, 40, 50, 60, 80, 100];
export const HOTEL_AREAS = [200, 400, 600, 800, 1_000, 1_500];
export const ROOMS = [1, 2, 3, 4, 5];
export const HOTEL_ROOMS = [5, 10, 15, 20, 30, 50];
/** Rendements en % (l'app les garde en fractions). */
export const YIELDS = [3, 4, 5, 6, 7, 8, 10];
export const CASH_FLOWS = [-200, -100, 0, 50, 100, 200, 300];

// MARK: - Libellés

export function priceLabel(value: number | null, perMonth: boolean): string {
  if (value === null) return 'Indifférent';
  return perMonth ? `${formatPrice(value)}/mois` : formatPrice(value);
}

export const areaLabel = (value: number | null): string => (value === null ? 'Indifférent' : formatArea(value));

export function roomsLabel(value: number | null): string {
  if (value === null) return 'Indifférent';
  return value > 1 ? `${value} pièces et +` : '1 pièce et +';
}

export const bedroomsLabel = (value: number | null): string => (value === null ? 'Indifférent' : `${value} chambres et +`);

export function furnishedLabel(value: boolean | null): string {
  return value === null ? 'Indifférent' : value ? 'Meublée' : 'Non meublée';
}

/** « 7 % », ou « 6,5 % » pour un rendement saisi avec une décimale. */
export function yieldLabel(percent: number | null): string {
  if (percent === null) return 'Indifférent';
  const digits = Number.isInteger(percent) ? 0 : 1;
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(percent)} %`;
}

/** « + 100 €/mois », « − 200 €/mois », comme sur la maquette. */
export function cashFlowLabel(value: number | null): string {
  if (value === null) return 'Indifférent';
  return `${value < 0 ? '−' : '+'} ${formatPrice(Math.abs(value))}/mois`;
}

export function worksLabel(value: number | null): string {
  if (value === null) return 'Tous travaux';
  if (value === 0) return 'Aucun';
  if (value === LIGHT_WORKS_LIMIT) return 'Légers uniquement';
  return `Jusqu'à ${formatPrice(value)}`;
}

export const hotelScopeLabel = (value: HotelScope | null): string => (value === null ? 'Toutes les ventes' : scopeLabel(value));

export function propertyTypesLabel(types: PropertyType[], allowed: PropertyType[]): string {
  const chosen = allowed.filter((type) => types.includes(type));
  if (chosen.length === 0) return 'Tous les biens';
  if (chosen.length === 1) return PROPERTY_TYPE_LABELS[chosen[0]];
  return `${chosen.length} types de bien`;
}

/** Libellé d'un type dans Investir : « Maison locative », « Immeuble de rapport ». */
export function investmentTypeLabel(type: PropertyType): string {
  if (type === 'house') return 'Maison locative';
  if (type === 'building') return 'Immeuble de rapport';
  return PROPERTY_TYPE_LABELS[type];
}

export const INVESTMENT_KIND_LABELS: Record<InvestmentKind, string> = {
  classic: 'Locatif classique',
  building: 'Immeuble de rapport',
  mixedBuilding: 'Immeuble mixte',
  commercial: 'Local commercial',
  office: 'Bureaux',
};

// MARK: - Options

/** « Indifférent » en tête, avec sa précision, puis les valeurs. */
function options<T>(values: T[], anySubtitle: string, title: (value: T | null) => string): SelectionOption<T | null>[] {
  return [
    { value: null, title: title(null), subtitle: anySubtitle, isAny: true },
    ...values.map((value) => ({ value, title: title(value) })),
  ];
}

const FURNISHED_OPTIONS: SelectionOption<boolean | null>[] = [
  { value: null, title: 'Indifférent', subtitle: 'Meublée ou non meublée', isAny: true },
  { value: false, title: 'Non meublée' },
  { value: true, title: 'Meublée' },
];

const INVESTMENT_KIND_OPTIONS: SelectionOption<InvestmentKind>[] = [
  { value: 'classic', title: INVESTMENT_KIND_LABELS.classic, subtitle: 'Location nue ou meublée' },
  { value: 'building', title: INVESTMENT_KIND_LABELS.building, subtitle: 'Immeuble entier à plusieurs lots' },
  { value: 'mixedBuilding', title: INVESTMENT_KIND_LABELS.mixedBuilding, subtitle: 'Logements et commerces' },
  { value: 'commercial', title: INVESTMENT_KIND_LABELS.commercial, subtitle: "Murs d'un commerce" },
  { value: 'office', title: INVESTMENT_KIND_LABELS.office, subtitle: 'Locaux professionnels' },
];

const WORKS_OPTIONS: SelectionOption<number | null>[] = [
  { value: null, title: worksLabel(null), subtitle: 'Avec ou sans travaux', isAny: true },
  { value: LIGHT_WORKS_LIMIT, title: worksLabel(LIGHT_WORKS_LIMIT), subtitle: `Jusqu'à ${formatPrice(LIGHT_WORKS_LIMIT)} de travaux` },
  { value: 0, title: worksLabel(0), subtitle: 'Bien prêt à louer' },
];

const HOTEL_SCOPE_OPTIONS: SelectionOption<HotelScope | null>[] = [
  { value: null, title: hotelScopeLabel(null), subtitle: 'Murs et fonds, murs seuls ou fonds seul', isAny: true },
  ...(['wallsAndBusiness', 'wallsOnly', 'businessOnly'] as HotelScope[]).map((scope) => ({ value: scope, title: scopeLabel(scope) })),
];

// MARK: - Tuiles

type SingleTile<T> = {
  kind: 'single';
  id: string;
  icon: IconName;
  label: string;
  /** Titre du menu, s'il diffère du libellé de la tuile. */
  sheetTitle?: string;
  subtitle: string;
  options: SelectionOption<T>[];
  value: T;
  format: (value: T) => string;
  custom?: CustomAmount<T>;
  apply: (draft: SearchDraft, value: T) => SearchDraft;
};

type MultipleTile = {
  kind: 'multiple';
  id: string;
  icon: IconName;
  label: string;
  sheetTitle: string;
  subtitle: string;
  options: SelectionOption<PropertyType>[];
  values: PropertyType[];
  valueLabel: string;
  anyTitle: string;
  anySubtitle: string;
  apply: (draft: SearchDraft, values: PropertyType[]) => SearchDraft;
};

// Chaque tuile garde son type de valeur ; la liste les mélange.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CriterionTileSpec = SingleTile<any> | MultipleTile;

function single<T>(tile: Omit<SingleTile<T>, 'kind'>): SingleTile<T> {
  return { kind: 'single', ...tile };
}

function budgetTile(draft: SearchDraft, label: string, subtitle: string, values: number[], perMonth = false): SingleTile<number | null> {
  const format = (value: number | null) => priceLabel(value, perMonth);
  return single<number | null>({
    id: 'budget', icon: 'wallet', label, subtitle, value: draft.priceMax, format,
    options: options(values, perMonth ? 'Aucun plafond de loyer' : 'Aucun plafond de budget', format),
    custom: { placeholder: 'Saisir un montant', unit: perMonth ? '€/mois' : '€', makeValue: (amount) => amount },
    apply: (d, value) => ({ ...d, priceMax: value }),
  });
}

function propertyTypeTile(draft: SearchDraft, icon: IconName, sheetTitle = 'Type de bien'): MultipleTile {
  const allowed = MODE_PROPERTY_TYPES[draft.mode];
  return {
    kind: 'multiple', id: 'types', icon, label: 'Type de bien', sheetTitle, subtitle: 'Choisissez un ou plusieurs types.',
    options: allowed.map((type) => ({ value: type, title: draft.mode === 'invest' ? investmentTypeLabel(type) : PROPERTY_TYPE_LABELS[type] })),
    values: draft.types.filter((type) => allowed.includes(type)),
    valueLabel: propertyTypesLabel(draft.types, allowed),
    anyTitle: 'Tous les biens', anySubtitle: 'Aucun type imposé',
    apply: (d, values) => ({ ...d, types: values }),
  };
}

function areaTile(draft: SearchDraft, values: number[], subtitle: string, allowsCustomArea: boolean): SingleTile<number | null> {
  return single<number | null>({
    id: 'area', icon: 'building2', label: 'Surface minimum', subtitle, value: draft.livingAreaMin, format: areaLabel,
    options: options(values, 'Toutes les surfaces', areaLabel),
    custom: allowsCustomArea ? { placeholder: 'Saisir une surface', unit: 'm²', makeValue: (amount) => amount } : undefined,
    apply: (d, value) => ({ ...d, livingAreaMin: value }),
  });
}

/** Tuiles propres au mode, dans l'ordre de l'app (deux colonnes). */
export function homeTiles(draft: SearchDraft): CriterionTileSpec[] {
  switch (draft.mode) {
    case 'buy':
      return [
        budgetTile(draft, 'Budget maximum', 'Sélectionnez le montant maximum de votre budget.', SALE_PRICES),
        propertyTypeTile(draft, 'house'),
        areaTile(draft, SALE_AREAS, 'Surface habitable minimale du logement.', true),
        single<number | null>({
          id: 'rooms', icon: 'layers', label: 'Nombre de pièces', subtitle: 'Nombre minimal de pièces principales.',
          value: draft.roomsMin, format: roomsLabel, options: options(ROOMS, 'Toutes les tailles', roomsLabel),
          apply: (d, value) => ({ ...d, roomsMin: value }),
        }),
      ];
    case 'rent':
      return [
        budgetTile(draft, 'Loyer maximum', 'Loyer mensuel maximum, hors charges.', RENTS, true),
        propertyTypeTile(draft, 'house'),
        areaTile(draft, RENT_AREAS, 'Surface minimale du bien.', true),
        single<boolean | null>({
          id: 'furnished', icon: 'layers', label: 'Location', sheetTitle: 'Type de location', subtitle: 'Logement meublé ou vide.',
          value: draft.furnished, format: furnishedLabel, options: FURNISHED_OPTIONS,
          apply: (d, value) => ({ ...d, furnished: value }),
        }),
      ];
    case 'invest':
      return [
        budgetTile(draft, 'Budget maximum', "Prix d'acquisition maximum, frais d'agence inclus.", INVESTMENT_PRICES),
        single<number | null>({
          id: 'yield', icon: 'building2', label: 'Rentabilité minimum', subtitle: 'Rendement brut minimal : loyers annuels ÷ prix.',
          value: draft.minGrossYieldPercent, format: yieldLabel, options: options(YIELDS, 'Tous les rendements', yieldLabel),
          custom: { placeholder: 'Saisir un rendement', unit: '%', allowsDecimal: true, upperBound: 100, makeValue: (amount) => amount },
          apply: (d, value) => ({ ...d, minGrossYieldPercent: value }),
        }),
        single<number | null>({
          id: 'cashflow', icon: 'wallet', label: 'Cash-flow minimum', subtitle: 'Cash-flow mensuel minimal estimé après crédit et charges.',
          value: draft.minMonthlyCashFlow, format: cashFlowLabel, options: options(CASH_FLOWS, 'Tous les cash-flows', cashFlowLabel),
          custom: { placeholder: 'Saisir un montant', unit: '€/mois', allowsNegative: true, makeValue: (amount) => amount },
          apply: (d, value) => ({ ...d, minMonthlyCashFlow: value }),
        }),
        single<InvestmentKind>({
          id: 'investmentKind', icon: 'house', label: 'Type d’investissement', subtitle: "Stratégie d'exploitation recherchée.",
          value: investmentKind(draft), format: (kind) => INVESTMENT_KIND_LABELS[kind], options: INVESTMENT_KIND_OPTIONS,
          apply: (d, kind) => withInvestmentKind(d, kind),
        }),
        propertyTypeTile(draft, 'layers', "Type d'actif"),
        single<number | null>({
          id: 'works', icon: 'gear', label: 'Travaux acceptés', subtitle: 'Montant de travaux que vous acceptez.',
          value: draft.maxWorksAmount, format: worksLabel, options: WORKS_OPTIONS,
          apply: (d, value) => ({ ...d, maxWorksAmount: value }),
        }),
      ];
    case 'hotel':
      return [
        budgetTile(draft, 'Budget maximum', "Prix d'acquisition maximum de l'hôtel.", HOTEL_PRICES),
        single<HotelScope | null>({
          id: 'scope', icon: 'house', label: 'Type de vente', subtitle: 'Ce que comprend le prix de vente.',
          value: draft.hotelScope, format: hotelScopeLabel, options: HOTEL_SCOPE_OPTIONS,
          apply: (d, value) => ({ ...d, hotelScope: value }),
        }),
        areaTile(draft, HOTEL_AREAS, "Surface totale minimale de l'établissement.", false),
        single<number | null>({
          id: 'rooms', icon: 'layers', label: 'Nombre de chambres', subtitle: 'Nombre minimal de chambres.',
          value: draft.roomsMin, format: bedroomsLabel, options: options(HOTEL_ROOMS, 'Toutes les capacités', bedroomsLabel),
          apply: (d, value) => ({ ...d, roomsMin: value }),
        }),
      ];
  }
}

/** Indice de « Plus de critères », propre au mode. */
export function moreCriteriaHint(mode: SearchMode): string {
  switch (mode) {
    case 'buy': return 'Étage, extérieur, parking, DPE, charges...';
    case 'rent': return 'Étage, extérieur, parking, DPE...';
    case 'invest': return 'Fiscalité, vacance, charges...';
    case 'hotel': return 'Étage, DPE, charges, travaux...';
  }
}
