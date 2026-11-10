import { availability, type CardKind } from '../cardContent';
import { formatAmount, formatArea, formatFraction, formatNumber, formatPrice } from '../format';
import { propertyTypeLabel } from '../labels';
import type { ListingRow } from '../listings';
import { hotelOf, readAsset, rentalDetails, type Origin, type Sourced } from './fields';

// Textes de la fiche d'une annonce, comme l'app (Features/ListingDetail/ListingDetailView.swift,
// Core/Presentation/DomainLabels.swift, Features/Publish/PublishFlowView.swift et PublishFinanceStep.swift).

export type Row = [title: string, value: string];

const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
const dayMonthYear = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

export const formatMonthYear = (d: Date): string => monthYear.format(d);
export const formatLongDate = (d: Date): string => dayMonthYear.format(d);

// MARK: - Libellés

export const CATEGORY_LABELS: Record<CardKind, string> = {
  purchase: 'VENTE',
  rental: 'LOCATION',
  investment: 'INVESTISSEMENT LOCATIF',
  hotel: 'HÔTEL',
  commercial: 'LOCAL COMMERCIAL',
  office: 'BUREAUX',
  land: 'TERRAIN',
  building: 'IMMEUBLE',
};

const CONDITION_LABELS: Record<string, string> = { new: 'Neuf', good: 'Bon état', toRefresh: 'À rafraîchir', toRenovate: 'À rénover' };
const PARKING_LABELS: Record<string, string> = {
  none: 'Aucun', outdoorSpace: 'Place extérieure', indoorSpace: 'Place en sous-sol', garage: 'Garage',
};
/** Dans l'ordre de l'app (OutdoorSpace.allCases). */
const OUTDOOR_LABELS: [string, string][] = [['balcony', 'Balcon'], ['terrace', 'Terrasse'], ['garden', 'Jardin']];
const LEASE_LABELS: Record<string, string> = { commercial: 'Commercial 3-6-9', professional: 'Professionnel', shortTerm: 'Dérogatoire' };
const OPERATING_LABELS: Record<string, string> = { operating: 'En activité', seasonal: 'Saisonnier', closed: 'Fermé' };
const AMENITY_LABELS: [string, string][] = [
  ['restaurant', 'Restaurant'], ['bar', 'Bar'], ['meetingRooms', 'Salles de réunion'], ['spa', 'Spa'], ['pool', 'Piscine'], ['parking', 'Parking'],
];
const EQUIPMENT_LABELS: [string, string][] = [['airConditioning', 'Climatisation'], ['fiber', 'Fibre'], ['accessControl', 'Contrôle d\'accès']];
export const ORIGIN_LABELS: Record<Origin, string> = { seller: 'Vendeur', estimated: 'Estimé', user: 'Vos hypothèses', partner: 'Partenaire' };

const ordered = (values: string[] | null, labels: [string, string][]): string =>
  labels.filter(([key]) => values?.includes(key)).map(([, label]) => label).join(', ');

const yesNo = (value: boolean): string => (value ? 'Oui' : 'Non');

/** « Rez-de-chaussée », « 1er étage », « 3e étage », avec « sur 5 » si le nombre d'étages est connu. */
export function floorLabel(floor: number, total: number | null): string {
  const label = floor === 0 ? 'Rez-de-chaussée' : floor === 1 ? '1er étage' : `${floor}e étage`;
  return total === null ? label : `${label} sur ${total}`;
}

/** « 3 ans », « 1 an » ou « 18 mois ». */
export function leaseDuration(months: number): string {
  if (months % 12 !== 0) return `${months} mois`;
  const years = months / 12;
  return years > 1 ? `${years} ans` : '1 an';
}

/** Pourcentage au centième près : « 5,26 % », « 5 % ». */
const feePercent = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
/** Montant au mètre carré, toujours avec les centimes : « 25,30 € ». */
const perSquareMeterEuros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

type FeesRow = Pick<ListingRow, 'agency_fees_amount' | 'agency_fees_paid_by' | 'transaction' | 'price' | 'rental_info'>;

/**
 * Vente d'un professionnel dont l'acquéreur paie les honoraires (arrêté du 10 janvier 2017) : le prix affiché les
 * inclut ; prix hors honoraires et honoraires en pourcentage de ce prix. `null` ailleurs ou si les montants sont incohérents.
 */
export function buyerFees(row: Omit<FeesRow, 'rental_info'>): { excluded: number; percent: number } | null {
  if (row.transaction !== 'sale' || row.agency_fees_paid_by !== 'buyer') return null;
  const amount = n(row.agency_fees_amount);
  const price = n(row.price);
  if (amount === null || price === null || !(amount > 0) || !(price > amount)) return null;
  const excluded = price - amount;
  return { excluded, percent: (amount / excluded) * 100 };
}

/** Sous le prix d'une vente dont l'acquéreur paie les honoraires : « Honoraires inclus · 285 714 € hors honoraires ». */
export function priceFeesNote(row: Omit<FeesRow, 'rental_info'>): string | null {
  const fees = buyerFees(row);
  return fees ? `Honoraires inclus · ${formatPrice(fees.excluded)} hors honoraires` : null;
}

/**
 * « 13 200 € à la charge du vendeur » ; pour une location, le « buyer » est le locataire, avec la part de l'état des
 * lieux si elle est connue. Vente payée par l'acquéreur : « 5,26 % TTC du prix hors honoraires, soit 15 000 €, à la
 * charge de l'acquéreur ».
 */
export function feesLabel(row: FeesRow): string | null {
  const amount = row.agency_fees_amount === null ? null : Number(row.agency_fees_amount);
  const paidBy = row.agency_fees_paid_by;
  if (amount === null || !Number.isFinite(amount) || (paidBy !== 'seller' && paidBy !== 'buyer')) return null;
  const sale = row.transaction === 'sale';
  const buyer = buyerFees(row);
  if (buyer) return `${feePercent.format(buyer.percent)}\u00a0% TTC du prix hors honoraires, soit ${formatPrice(amount)}, à la charge de l'acquéreur`;
  const payer = paidBy === 'seller' ? (sale ? 'du vendeur' : 'du propriétaire') : (sale ? 'de l\'acquéreur' : 'du locataire');
  const inventory = !sale && paidBy === 'buyer' ? rentalDetails(row)?.inventoryFee ?? null : null;
  const detail = inventory !== null && inventory <= amount ? `, dont ${formatPrice(inventory)} pour l'état des lieux` : '';
  return `${formatPrice(amount)} à la charge ${payer}${detail}`;
}

const perMonth = (value: number): string => `${formatPrice(value)}/mois`;
const n = (value: unknown): number | null => (value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null);

// MARK: - En-tête

export type HeaderFact = { value: string; caption: string };

/** Chiffres clés de l'en-tête, seulement ceux qui sont connus (keyFacts de l'app). */
export function headerFacts(row: ListingRow, kind: CardKind): HeaderFact[] {
  const facts: HeaderFact[] = [];
  if (kind === 'land') {
    const land = n(row.land_area);
    if (land !== null) facts.push({ value: formatArea(land), caption: 'Terrain' });
    return facts;
  }
  facts.push({ value: formatArea(Number(row.living_area)), caption: 'Surface' });
  const hotel = hotelOf(row);
  if (hotel) {
    if (hotel.rooms !== null) facts.push({ value: `${hotel.rooms}`, caption: hotel.rooms > 1 ? 'Chambres' : 'Chambre' });
    if (hotel.stars !== null) facts.push({ value: `${hotel.stars}`, caption: hotel.stars > 1 ? 'Étoiles' : 'Étoile' });
    return facts;
  }
  if (row.rooms !== null) facts.push({ value: `${row.rooms}`, caption: row.rooms > 1 ? 'Pièces' : 'Pièce' });
  if (row.bedrooms !== null) facts.push({ value: `${row.bedrooms}`, caption: row.bedrooms > 1 ? 'Chambres' : 'Chambre' });
  if (row.floor !== null) facts.push({ value: row.floor === 0 ? 'RDC' : row.floor === 1 ? '1er' : `${row.floor}e`, caption: 'Étage' });
  return facts;
}

/** Prix au m² (vente) ou « hors charges » (location). */
export function priceSecondary(row: ListingRow): string | null {
  if (row.transaction === 'rent') return '/mois hors charges';
  const area = Number(row.living_area);
  if (!(area > 0)) return null;
  return `${formatPrice(Math.round(Number(row.price) / area))}/m²`;
}

/** Ce que comprend la vente d'un hôtel : « Vente : murs et fonds ». */
export function saleCondition(row: ListingRow): string | null {
  const scope = hotelOf(row)?.scope;
  if (!scope) return null;
  const label = scope === 'wallsAndBusiness' ? 'Murs et fonds' : scope === 'wallsOnly' ? 'Murs seuls' : 'Fonds de commerce seul';
  return `Vente : ${label.toLowerCase()}`;
}

// MARK: - Informations pratiques (location)

export function rentalRows(row: ListingRow, showsCosts: boolean, now = new Date()): Row[] {
  const rental = rentalDetails(row);
  const price = Number(row.price);
  const rows: Row[] = showsCosts ? [['Loyer hors charges', perMonth(price)]] : [];
  const charges = n(row.monthly_charges);
  if (showsCosts && charges !== null) {
    rows.push([rental?.chargesMode === 'flatRate' ? 'Forfait de charges' : 'Provisions sur charges', perMonth(charges)]);
    rows.push(['Loyer charges comprises', perMonth(price + charges)]);
  }
  // Loyers encadrés (Paris, Lille, Lyon…) : montants que l'annonce doit donner.
  if (showsCosts && rental?.isRentControlled === true) {
    if (rental.referenceRent !== null) rows.push(['Loyer de référence', `${perSquareMeterEuros.format(rental.referenceRent)}/m²/mois`]);
    if (rental.maxReferenceRent !== null) rows.push(['Loyer de référence majoré', `${perSquareMeterEuros.format(rental.maxReferenceRent)}/m²/mois`]);
    if (rental.rentSupplement !== null) rows.push(['Complément de loyer', rental.rentSupplement > 0 ? perMonth(rental.rentSupplement) : 'Aucun']);
  }
  if (rental?.availableFrom) rows.push(['Disponibilité', availability(rental.availableFrom, now)]);
  if (rental?.isFurnished !== null && rental?.isFurnished !== undefined) rows.push(['Ameublement', rental.isFurnished ? 'Meublé' : 'Non meublé']);
  if (showsCosts && rental?.securityDeposit !== null && rental?.securityDeposit !== undefined) {
    rows.push(['Dépôt de garantie', formatPrice(rental.securityDeposit)]);
  }
  if (rental?.leaseDurationMonths !== null && rental?.leaseDurationMonths !== undefined) {
    rows.push(['Durée du bail', leaseDuration(rental.leaseDurationMonths)]);
  }
  const fees = feesLabel(row);
  if (showsCosts && fees) rows.push(['Honoraires', fees]);
  return rows;
}

// MARK: - Activité (hôtel)

export type OriginRow = { title: string; amount: string; origin: Origin };

/** Lignes de « Activité » et la note, ou `null` si l'hôtel ne donne aucun chiffre. */
export function hotelActivity(row: ListingRow): { rows: OriginRow[]; showsNote: boolean } | null {
  const hotel = hotelOf(row);
  if (!hotel) return null;
  const amounts: [string, Sourced | null][] = [
    [hotel.financialYear !== null ? `Chiffre d'affaires ${hotel.financialYear}` : 'Chiffre d\'affaires annuel', hotel.annualRevenue],
    ['EBITDA', hotel.ebitda],
    ['Résultat d\'exploitation', hotel.operatingIncome],
    ['Prix moyen par chambre (ADR)', hotel.averageDailyRate],
  ];
  const rows: OriginRow[] = amounts.flatMap(([title, value]) => (value ? [{ title, amount: formatPrice(value.value), origin: value.origin }] : []));
  if (hotel.occupancyRate) {
    rows.push({ title: 'Taux d\'occupation', amount: formatFraction(hotel.occupancyRate.value, 0), origin: hotel.occupancyRate.origin });
  }
  if (!rows.length) return null;
  return { rows, showsNote: rows.some((r) => r.origin !== 'partner') };
}

// MARK: - Caractéristiques

export function featureRows(row: ListingRow): Row[] {
  const type = row.property_type;
  const isHome = type === 'apartment' || type === 'house';
  const rows: Row[] = [['Type de bien', propertyTypeLabel(type)]];
  const living = Number(row.living_area);
  if (living > 0) rows.push([isHome ? 'Surface habitable' : 'Surface', formatArea(living)]);
  const land = n(row.land_area);
  if (land !== null) rows.push(['Terrain', formatArea(land)]);
  if (row.rooms !== null) rows.push(['Pièces', `${row.rooms}`]);
  if (row.bedrooms !== null) rows.push(['Chambres', `${row.bedrooms}`]);
  if (row.floor !== null) rows.push(['Étage', floorLabel(row.floor, row.total_floors)]);
  if (row.has_elevator !== null) rows.push(['Ascenseur', yesNo(row.has_elevator)]);
  const outdoor = (row.outdoor_spaces ?? []).filter((key) => OUTDOOR_LABELS.some(([k]) => k === key));
  if (isHome || outdoor.length) rows.push(['Extérieur', outdoor.length ? ordered(outdoor, OUTDOOR_LABELS) : 'Aucun']);
  rows.push(['Stationnement', PARKING_LABELS[row.parking] ?? 'Aucun']);
  if (row.year_built !== null) rows.push([row.is_new_build ? 'Livraison' : 'Construction', `${row.year_built}`]);
  if (row.has_cellar !== null) rows.push(['Cave', yesNo(row.has_cellar)]);
  if (row.condition && CONDITION_LABELS[row.condition]) rows.push(['État', CONDITION_LABELS[row.condition]]);

  const lease = (leaseType: string | null, end: Date | null) => {
    if (leaseType && LEASE_LABELS[leaseType]) rows.push(['Bail', LEASE_LABELS[leaseType]]);
    if (end) rows.push(['Échéance du bail', formatMonthYear(end)]);
  };
  const asset = readAsset(row);
  switch (asset?.kind) {
    case 'commercial': {
      const c = asset.commercial;
      if (c.salesArea !== null) rows.push(['Surface de vente', formatArea(c.salesArea)]);
      if (c.frontageMeters !== null) rows.push(['Vitrine', `${formatAmount(c.frontageMeters).replace(/\s?€$/, '')} m`]);
      lease(c.leaseType, c.leaseEndDate);
      break;
    }
    case 'office': {
      const o = asset.office;
      if (o.workstations !== null) rows.push(['Postes de travail', `${o.workstations}`]);
      if (o.parkingSpaces !== null) rows.push(['Places de parking', `${o.parkingSpaces}`]);
      if (o.isAccessible !== null) rows.push(['Accès PMR', yesNo(o.isAccessible)]);
      if (o.equipment?.length) {
        const label = ordered(o.equipment, EQUIPMENT_LABELS);
        if (label) rows.push(['Équipements', label]);
      }
      lease(o.leaseType, o.leaseEndDate);
      break;
    }
    case 'land': {
      const l = asset.land;
      if (l.zoning) rows.push(['Zone PLU', l.zoning]);
      if (l.isServiced !== null) rows.push(['Viabilisé', yesNo(l.isServiced)]);
      if (l.hasBuildings !== null) rows.push(['Construction existante', yesNo(l.hasBuildings)]);
      if (l.buildability) {
        rows.push(['Surface constructible', formatArea(l.buildability.floorArea)]);
        if (l.buildability.documentReference) rows.push(['Document d\'urbanisme', l.buildability.documentReference]);
      }
      break;
    }
    case 'building': {
      const b = asset.building;
      if (b.residentialUnits !== null || b.commercialUnits !== null) rows.push(['Lots', `${(b.residentialUnits ?? 0) + (b.commercialUnits ?? 0)}`]);
      if (b.residentialUnits !== null) rows.push(['Logements', `${b.residentialUnits}`]);
      if (b.commercialUnits !== null) rows.push(['Commerces', `${b.commercialUnits}`]);
      if (b.residentialArea !== null) rows.push(['Surface logements', formatArea(b.residentialArea)]);
      if (b.commercialArea !== null) rows.push(['Surface commerces', formatArea(b.commercialArea)]);
      if (b.vacantUnits !== null) rows.push(['Lots vacants', `${b.vacantUnits}`]);
      if (b.residentialAnnualRent !== null) rows.push(['Loyers logements', `${formatPrice(b.residentialAnnualRent)}/an`]);
      if (b.commercialAnnualRent !== null) rows.push(['Loyers commerces', `${formatPrice(b.commercialAnnualRent)}/an`]);
      break;
    }
    case 'hotel': {
      const h = asset.hotel;
      if (h.operatingStatus) rows.push(['Exploitation', OPERATING_LABELS[h.operatingStatus]]);
      if (h.scope === 'businessOnly' && h.wallsAnnualRent !== null) rows.push(['Loyer des murs', `${formatPrice(h.wallsAnnualRent)}/an`]);
      if (h.amenities?.length) {
        const label = ordered(h.amenities, AMENITY_LABELS);
        if (label) rows.push(['Équipements', label]);
      }
      break;
    }
    default:
      break;
  }

  const sale = row.transaction === 'sale';
  const rental = rentalDetails(row);
  if (sale && rental) {
    rows.push(['Situation locative', rental.isLeased ? 'Loué' : 'Libre']);
    if (rental.isLeased && rental.currentMonthlyRent !== null) rows.push(['Loyer actuel', perMonth(rental.currentMonthlyRent)]);
    if (rental.isLeased && rental.leaseEndDate) rows.push(['Fin du bail', formatMonthYear(rental.leaseEndDate)]);
  }
  if (sale && rental?.potentialMonthlyRent !== null && rental?.potentialMonthlyRent !== undefined) {
    rows.push(['Loyer potentiel (hypothèse)', perMonth(rental.potentialMonthlyRent)]);
  }
  if (sale) {
    const charges = n(row.monthly_charges);
    const tax = n(row.annual_property_tax);
    const works = n(row.works_amount);
    // Aussi par an : une annonce de copropriété doit donner la quote-part moyenne annuelle des charges.
    if (charges !== null) rows.push(['Charges', `${perMonth(charges)}, soit ${formatPrice(charges * 12)}/an`]);
    // Copropriété : mentions obligatoires d'une vente en copropriété (nombre de lots, procédure en cours).
    const lots = n(row.co_ownership_lots);
    if (lots !== null) rows.push(['Copropriété', `${formatNumber(lots)} lot${lots > 1 ? 's' : ''}`]);
    if (typeof row.co_ownership_has_procedure === 'boolean') rows.push(['Procédure en cours', row.co_ownership_has_procedure ? 'Oui' : 'Non']);
    if (tax !== null) rows.push(['Taxe foncière', `${formatPrice(tax)}/an`]);
    if (works !== null) rows.push(['Travaux', formatPrice(works)]);
  }
  return rows;
}

// MARK: - Énergie

export const ENERGY_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

export function energyLetter(value: string | null): string | null {
  return value && (ENERGY_LETTERS as readonly string[]).includes(value) ? value : null;
}

/** Lettre noire sur D et E, blanche sur les autres (AppColors.swift). */
export const energyInk = (letter: string): string => (letter === 'D' || letter === 'E' ? '#000000' : '#FFFFFF');

export function energyLines(row: ListingRow): string[] {
  const lines: string[] = [];
  if (row.primary_energy_consumption !== null) lines.push(`Consommation : ${Math.trunc(Number(row.primary_energy_consumption))} kWh/m²/an`);
  // Mention obligatoire d'un logement classé F ou G.
  const letter = energyLetter(row.energy_class);
  const home = row.property_type === 'apartment' || row.property_type === 'house';
  if (home && (letter === 'F' || letter === 'G')) lines.push(`Logement à consommation énergétique excessive : classe ${letter}`);
  const min = n(row.annual_energy_cost_min);
  const max = n(row.annual_energy_cost_max);
  if (min !== null && max !== null) {
    lines.push(`Montant estimé des dépenses annuelles d'énergie pour un usage standard : entre ${formatPrice(min)} et ${formatPrice(max)} par an.`);
  }
  return lines;
}

/** Mention de chaque annonce : où trouver les risques auxquels le bien est exposé. */
export const GEORISQUES = {
  text: 'Les informations sur les risques auxquels ce bien est exposé sont disponibles sur le site Géorisques :',
  url: 'https://www.georisques.gouv.fr',
  label: 'www.georisques.gouv.fr',
} as const;

// MARK: - Bas de fiche

export function footnote(row: ListingRow): string | null {
  if (!row.published_at) return null;
  const d = new Date(row.published_at);
  return Number.isNaN(d.getTime()) ? null : `Publiée le ${formatLongDate(d)}`;
}
