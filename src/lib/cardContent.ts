import type { IconName } from '../components/iconPaths';
import { formatArea, formatFraction, formatNumber, formatPrice, formatSignedAmount } from './format';
import type { ListingRow } from './listings';
import type { SearchMode } from './labels';
import { pricePerSquareMeter, type Highlights } from './search';
import {
  assetDetails, bool, date, hotelScope, int, num, rentalInfo, scopeLabel, sourced,
  type HotelScope, type Json, type Rental, type Sourced,
} from './listingJson';

// Lecteurs gardés ici aussi : d'autres pages les importent depuis ce module.
export { assetDetails, rentalInfo, scopeLabel, type HotelScope, type Rental, type Sourced };

// Contenu d'une fiche d'annonce, comme l'app : ImmoDomain/Listing/ListingCardContent.swift (quels faits, dans
// quel ordre) et Features/Listings/ListingCardFormatting.swift (texte, icône, couleur).

export type CardKind = 'purchase' | 'rental' | 'investment' | 'hotel' | 'commercial' | 'office' | 'land' | 'building';
export type CardPrice = { kind: 'sale' | 'rentIncludingCharges' | 'rentExcludingCharges'; value: number };

export type KeyFact =
  | { kind: 'rooms'; value: number }
  | { kind: 'pricePerSquareMeter'; value: number }
  | { kind: 'energyClass'; value: string }
  | { kind: 'landArea'; value: number }
  | { kind: 'monthlyCharges'; value: number }
  | { kind: 'furnished'; value: boolean }
  | { kind: 'availableFrom'; value: Date }
  | { kind: 'grossYield'; value: number; text?: string }
  | { kind: 'netYield'; value: number; text?: string }
  | { kind: 'currentRent'; value: number }
  | { kind: 'leaseEnd'; value: Date }
  | { kind: 'potentialRent'; value: number }
  | { kind: 'estimatedCashFlow'; value: number; text?: string }
  | { kind: 'yieldToCompute' }
  | { kind: 'hotelRooms'; value: number }
  | { kind: 'hotelStars'; value: number }
  | { kind: 'annualRevenue'; value: Sourced }
  | { kind: 'ebitda'; value: Sourced }
  | { kind: 'occupancyRate'; value: Sourced }
  | { kind: 'revenueNotDisclosed' }
  | { kind: 'hotelScope'; value: HotelScope }
  | { kind: 'leased'; annualRent: number | null }
  | { kind: 'vacant' }
  | { kind: 'workstations'; value: number }
  | { kind: 'parkingSpaces'; value: number }
  | { kind: 'frontage'; value: number }
  | { kind: 'zoning'; value: string }
  | { kind: 'buildability'; floorArea: number }
  | { kind: 'serviced'; value: boolean }
  | { kind: 'units'; residential: number | null; commercial: number | null }
  | { kind: 'vacantUnits'; value: number }
  | { kind: 'annualRent'; value: number };

export type CardBadge = { kind: 'new' } | { kind: 'priceDrop'; previous: number };

export type CardContent = {
  kind: CardKind;
  price: CardPrice;
  /** Surface de la ligne de lieu : habitable, ou terrain pour un terrain. */
  area: number | null;
  facts: KeyFact[];
  panelFacts: KeyFact[];
  badge: CardBadge | null;
};

// MARK: - Gabarit et faits

export function cardKind(row: ListingRow, mode: SearchMode | null): CardKind {
  if (row.transaction === 'rent') return 'rental';
  switch (row.property_type) {
    case 'hotel': return 'hotel';
    case 'commercial': return 'commercial';
    case 'office': return 'office';
    case 'land': return 'land';
    case 'building': return 'building';
    default:
      // Un bien vendu loué est un investissement, quel que soit le mode.
      return mode === 'invest' || rentalInfo(row)?.isLeased === true ? 'investment' : 'purchase';
  }
}

function cardPrice(row: ListingRow): CardPrice {
  const price = Number(row.price);
  if (row.transaction !== 'rent') return { kind: 'sale', value: price };
  const charges = num(row.monthly_charges);
  return charges !== null ? { kind: 'rentIncludingCharges', value: price + charges } : { kind: 'rentExcludingCharges', value: price };
}

function landPricePerSquareMeter(row: ListingRow): number | null {
  const land = num(row.land_area);
  if (row.transaction !== 'sale' || land === null || !(land > 0)) return null;
  return Math.round(Number(row.price) / land);
}

/** Indicateurs du moteur, avec les textes arrondis comme l'app. */
const grossFact = (h: Highlights): KeyFact => ({ kind: 'grossYield', value: h.grossYield, text: h.text?.grossYield });
const netFact = (h: Highlights): KeyFact => ({ kind: 'netYield', value: h.netYield, text: h.text?.netYield });
const cashFlowFact = (h: Highlights): KeyFact => ({ kind: 'estimatedCashFlow', value: h.monthlyCashFlow, text: h.text?.monthlyCashFlow });

function investmentFacts(row: ListingRow, highlights: Highlights | null): KeyFact[] {
  if (!highlights) return [{ kind: 'yieldToCompute' }];
  const facts: KeyFact[] = [grossFact(highlights)];
  const rental = rentalInfo(row);
  if (rental?.currentMonthlyRent != null) facts.push({ kind: 'currentRent', value: rental.currentMonthlyRent });
  else if (rental?.potentialMonthlyRent != null) facts.push({ kind: 'potentialRent', value: rental.potentialMonthlyRent });
  facts.push(cashFlowFact(highlights));
  return facts;
}

function tenancyFacts(row: ListingRow, highlights: Highlights | null): KeyFact[] {
  const rental = rentalInfo(row);
  if (!rental) return [];
  if (rental.isLeased && rental.currentMonthlyRent !== null) {
    const facts: KeyFact[] = [{ kind: 'leased', annualRent: rental.currentMonthlyRent * 12 }];
    if (highlights) facts.push(grossFact(highlights));
    return facts;
  }
  if (rental.isLeased) return [{ kind: 'leased', annualRent: null }];
  const facts: KeyFact[] = [{ kind: 'vacant' }];
  if (rental.potentialMonthlyRent !== null) facts.push({ kind: 'potentialRent', value: rental.potentialMonthlyRent });
  return facts;
}


function keyFacts(row: ListingRow, kind: CardKind, highlights: Highlights | null): KeyFact[] {
  const facts: KeyFact[] = [];
  const push = (fact: KeyFact | null) => { if (fact) facts.push(fact); };
  const rooms = row.rooms !== null && row.rooms > 0 ? ({ kind: 'rooms', value: row.rooms } as KeyFact) : null;
  const energy = row.energy_class ? ({ kind: 'energyClass', value: row.energy_class } as KeyFact) : null;
  const rental = rentalInfo(row);
  switch (kind) {
    case 'purchase': {
      push(rooms);
      const perSquare = pricePerSquareMeter(row);
      push(perSquare === null ? null : { kind: 'pricePerSquareMeter', value: perSquare });
      const land = num(row.land_area);
      if (row.property_type === 'house' && land !== null) push({ kind: 'landArea', value: land });
      push(energy);
      break;
    }
    case 'rental': {
      const charges = num(row.monthly_charges);
      push(charges === null ? null : { kind: 'monthlyCharges', value: charges });
      push(rental?.isFurnished == null ? null : { kind: 'furnished', value: rental.isFurnished });
      push(rental?.availableFrom ? { kind: 'availableFrom', value: rental.availableFrom } : null);
      push(rooms);
      push(energy);
      break;
    }
    case 'investment':
      facts.push(...investmentFacts(row, highlights));
      break;
    case 'hotel': {
      const hotel = assetDetails(row, 'hotel');
      const hotelRooms = int(hotel?.rooms) ?? row.rooms;
      push(hotelRooms === null ? null : { kind: 'hotelRooms', value: hotelRooms });
      const revenue = sourced(hotel?.annualRevenue);
      facts.push(revenue ? { kind: 'annualRevenue', value: revenue } : { kind: 'revenueNotDisclosed' });
      const ebitda = sourced(hotel?.ebitda);
      push(ebitda ? { kind: 'ebitda', value: ebitda } : null);
      const scope = hotelScope(hotel?.scope);
      push(scope ? { kind: 'hotelScope', value: scope } : null);
      // Murs loués à un exploitant : le rendement immobilier, s'il est calculable.
      if (scope === 'wallsOnly' && highlights) facts.push(grossFact(highlights));
      const stars = int(hotel?.stars);
      push(stars === null ? null : { kind: 'hotelStars', value: stars });
      break;
    }
    case 'commercial':
    case 'office': {
      facts.push(...tenancyFacts(row, highlights));
      const office = assetDetails(row, 'office');
      if (office) {
        const workstations = int(office.workstations);
        push(workstations === null ? null : { kind: 'workstations', value: workstations });
        const spaces = int(office.parkingSpaces);
        push(spaces === null ? null : { kind: 'parkingSpaces', value: spaces });
      }
      const commercial = assetDetails(row, 'commercial');
      const frontage = num(commercial?.frontageMeters);
      push(frontage === null ? null : { kind: 'frontage', value: frontage });
      break;
    }
    case 'land': {
      const land = assetDetails(row, 'land');
      if (land) {
        if (typeof land.zoning === 'string' && land.zoning) facts.push({ kind: 'zoning', value: land.zoning });
        const buildability = land.buildability as Json | undefined;
        const floorArea = num(buildability?.floorArea);
        push(floorArea === null ? null : { kind: 'buildability', floorArea });
        const serviced = bool(land.isServiced);
        push(serviced === null ? null : { kind: 'serviced', value: serviced });
      }
      const perSquare = landPricePerSquareMeter(row);
      push(perSquare === null ? null : { kind: 'pricePerSquareMeter', value: perSquare });
      break;
    }
    case 'building': {
      const building = assetDetails(row, 'building');
      const residential = int(building?.residentialUnits);
      const commercial = int(building?.commercialUnits);
      if (building && (residential !== null || commercial !== null)) {
        facts.push({ kind: 'units', residential, commercial });
        const vacant = int(building.vacantUnits);
        push(vacant !== null && vacant > 0 ? { kind: 'vacantUnits', value: vacant } : null);
      }
      if (rental?.currentMonthlyRent != null) facts.push({ kind: 'annualRent', value: rental.currentMonthlyRent * 12 });
      if (highlights) facts.push(grossFact(highlights));
      break;
    }
  }
  return facts;
}

function investmentPanelFacts(row: ListingRow, highlights: Highlights | null): KeyFact[] {
  if (!highlights) return [{ kind: 'yieldToCompute' }];
  const rental = rentalInfo(row);
  if (rental?.isLeased && rental.currentMonthlyRent !== null) {
    const facts: KeyFact[] = [grossFact(highlights), { kind: 'currentRent', value: rental.currentMonthlyRent }];
    if (rental.leaseEndDate) facts.push({ kind: 'leaseEnd', value: rental.leaseEndDate });
    if (rental.isFurnished !== null) facts.push({ kind: 'furnished', value: rental.isFurnished });
    facts.push(cashFlowFact(highlights));
    return facts;
  }
  const facts: KeyFact[] = [
    grossFact(highlights),
    netFact(highlights),
    cashFlowFact(highlights),
  ];
  if (rental?.currentMonthlyRent != null) facts.push({ kind: 'annualRent', value: rental.currentMonthlyRent * 12 });
  else if (rental?.potentialMonthlyRent != null) facts.push({ kind: 'potentialRent', value: rental.potentialMonthlyRent });
  return facts;
}

function hotelPanelFacts(row: ListingRow): KeyFact[] {
  const hotel = assetDetails(row, 'hotel');
  const revenue = sourced(hotel?.annualRevenue);
  const facts: KeyFact[] = [revenue ? { kind: 'annualRevenue', value: revenue } : { kind: 'revenueNotDisclosed' }];
  const ebitda = sourced(hotel?.ebitda);
  if (ebitda) facts.push({ kind: 'ebitda', value: ebitda });
  const occupancy = sourced(hotel?.occupancyRate);
  if (occupancy) facts.push({ kind: 'occupancyRate', value: occupancy });
  const rooms = int(hotel?.rooms) ?? row.rooms;
  if (rooms !== null) facts.push({ kind: 'hotelRooms', value: rooms });
  const stars = int(hotel?.stars);
  if (stars !== null) facts.push({ kind: 'hotelStars', value: stars });
  const scope = hotelScope(hotel?.scope);
  if (scope) facts.push({ kind: 'hotelScope', value: scope });
  return facts;
}

function cardBadge(row: ListingRow, now: Date): CardBadge | null {
  const previous = num(row.previous_price);
  if (previous !== null && previous > Number(row.price)) return { kind: 'priceDrop', previous };
  const published = date(row.published_at);
  if (published && now.getTime() - published.getTime() < 7 * 86_400_000 && published <= now) return { kind: 'new' };
  return null;
}

export function cardContent(row: ListingRow, mode: SearchMode | null, highlights: Highlights | null, now = new Date()): CardContent {
  const kind = cardKind(row, mode);
  const living = Number(row.living_area);
  const facts = keyFacts(row, kind, highlights).slice(0, 4);
  return {
    kind,
    price: cardPrice(row),
    area: kind === 'land' ? num(row.land_area) : living > 0 ? living : null,
    facts,
    panelFacts: kind === 'investment' ? investmentPanelFacts(row, highlights).slice(0, 4)
      : kind === 'hotel' ? hotelPanelFacts(row).slice(0, 4) : facts,
    badge: cardBadge(row, now),
  };
}

// MARK: - Mise en forme

export type Tone = 'neutral' | 'positive' | 'negative' | 'muted' | 'caution';
export type FormattedFact = { icon: IconName; text: string; tone: Tone; isEstimate: boolean };

/** Seuil du bon rendement brut : vert à partir de 7 %, orange en dessous. */
export const GOOD_YIELD = 0.07;
export const yieldTone = (grossYield: number): Tone => (grossYield >= GOOD_YIELD ? 'positive' : 'caution');
/** « 6,2 % », arrondi comme l'app quand le moteur l'a calculé. */
export const grossYieldText = (h: Highlights): string => h.text?.grossYield ?? formatFraction(h.grossYield);

const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const s = (n: number) => (n > 1 ? 's' : '');

export function formatCardPrice(price: CardPrice): { amount: string; suffix: string | null } {
  switch (price.kind) {
    case 'sale': return { amount: formatPrice(price.value), suffix: null };
    case 'rentIncludingCharges': return { amount: formatPrice(price.value), suffix: '/mois CC' };
    default: return { amount: formatPrice(price.value), suffix: '/mois HC' };
  }
}

/** « Lyon 2e · 62 m² », « Saint-Priest · 740 m² de terrain ». */
export function cardLocation(city: string, content: CardContent): string {
  const parts = [city];
  if (content.area !== null) parts.push(content.kind === 'land' ? `${formatArea(content.area)} de terrain` : formatArea(content.area));
  return parts.join(' · ');
}

export function availability(date: Date, now = new Date()): string {
  return date > now ? `Disponible le ${dayMonth.format(date)}` : 'Disponible immédiatement';
}


export function formatFact(fact: KeyFact, now = new Date()): FormattedFact {
  const f = (icon: IconName, text: string, tone: Tone = 'neutral', isEstimate = false): FormattedFact => ({ icon, text, tone, isEstimate });
  switch (fact.kind) {
    case 'rooms': return f('layers', fact.value > 1 ? `${fact.value} pièces` : '1 pièce');
    case 'pricePerSquareMeter': return f('ruler', `${formatPrice(fact.value)}/m²`);
    case 'energyClass': return f('zap', `DPE ${fact.value}`);
    case 'landArea': return f('trees', `Terrain ${formatArea(fact.value)}`);
    case 'monthlyCharges': return f('euro', `Charges : ${formatPrice(fact.value)}/mois`);
    case 'furnished': return f('bedDouble', fact.value ? 'Meublé' : 'Non meublé');
    case 'availableFrom': return f('calendar', availability(fact.value, now));
    case 'grossYield': return f('percent', `Rendement brut : ${fact.text ?? formatFraction(fact.value)}`, yieldTone(fact.value));
    case 'netYield': return f('percent', `Rendement net (est.) : ${fact.text ?? formatFraction(fact.value)}`, yieldTone(fact.value), true);
    case 'leaseEnd': return f('fileText', `Bail en cours : jusqu’en ${monthYear.format(fact.value)}`);
    case 'occupancyRate':
      return f('percent', `Taux d’occupation : ${formatFraction(fact.value.value, 0)}`, 'neutral', fact.value.origin === 'estimated');
    case 'currentRent': return f('home', `Loyer actuel : ${formatPrice(fact.value)}/mois`);
    case 'potentialRent': return f('home', `Loyer potentiel : ${formatPrice(fact.value)}/mois`, 'muted', true);
    case 'estimatedCashFlow': {
      const amount = fact.text ?? formatSignedAmount(Math.round(fact.value));
      return f('wallet', `Cash-flow estimé : ${amount}/mois`, fact.value > 0 ? 'positive' : fact.value < 0 ? 'negative' : 'neutral', true);
    }
    case 'yieldToCompute': return f('percent', 'Rendement : à calculer (loyer non renseigné)', 'muted');
    case 'hotelRooms': return f('bedDouble', `${fact.value} chambres`);
    case 'hotelStars': return f('star', `${fact.value} étoile${s(fact.value)}`);
    case 'annualRevenue':
      return f('trend', `Chiffre d’affaires : ${formatPrice(fact.value.value)}/an`, 'neutral', fact.value.origin === 'estimated');
    case 'ebitda': return f('chart', `EBITDA : ${formatPrice(fact.value.value)}/an`, 'neutral', fact.value.origin === 'estimated');
    case 'revenueNotDisclosed': return f('trend', 'Chiffre d’affaires : non communiqué', 'muted');
    case 'hotelScope': return f('building2', scopeLabel(fact.value));
    case 'leased': return f('key', fact.annualRent !== null ? `Loué : ${formatPrice(fact.annualRent)}/an HC` : 'Loué');
    case 'vacant': return f('door', 'Libre de toute occupation');
    case 'workstations': return f('users', `${fact.value} postes`);
    case 'parkingSpaces': return f('car', `${fact.value} place${s(fact.value)} de parking`);
    case 'frontage': return f('store', `Vitrine ${formatNumber(fact.value)} m`);
    case 'zoning': return f('map', `Zone PLU ${fact.value}`);
    case 'buildability': return f('fileText', `Constructible ${formatArea(fact.floorArea)} (CU)`);
    case 'serviced': return f('plug', fact.value ? 'Viabilisé' : 'Non viabilisé');
    case 'units': {
      const parts: string[] = [];
      if (fact.residential && fact.residential > 0) parts.push(`${fact.residential} logement${s(fact.residential)}`);
      if (fact.commercial && fact.commercial > 0) parts.push(`${fact.commercial} commerce${s(fact.commercial)}`);
      return f('building2', parts.length ? parts.join(' + ') : 'Lots non détaillés');
    }
    case 'vacantUnits': return f('door', `${fact.value} lot${s(fact.value)} vacant${s(fact.value)}`, 'muted');
    case 'annualRent': return f('euro', `Loyers actuels : ${formatPrice(fact.value)}/an`);
  }
}

/** Faits d'une fiche mis en forme : le rendement net prend la couleur décidée par le rendement brut. */
export function formatFacts(facts: KeyFact[], now = new Date()): FormattedFact[] {
  const gross = facts.find((fact) => fact.kind === 'grossYield') as { kind: 'grossYield'; value: number } | undefined;
  return facts.map((fact) => {
    const formatted = formatFact(fact, now);
    if (fact.kind === 'netYield' && gross) formatted.tone = yieldTone(gross.value);
    return formatted;
  });
}

export function badgeText(badge: CardBadge): { text: string; tone: Tone } {
  return badge.kind === 'new' ? { text: 'Nouveau', tone: 'neutral' } : { text: `Baisse de prix · avant ${formatPrice(badge.previous)}`, tone: 'positive' };
}
