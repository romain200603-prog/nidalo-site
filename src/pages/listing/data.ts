import { showToast } from '../../components/AppToast';
import { compareState, compareToast, toggleCompare } from '../../lib/compare';
import type { ListingRow } from '../../lib/listings';
import { HotelPerformance, RentalCost } from '../../lib/investment';
import type { SearchMode } from '../../lib/labels';
import { hotelOf, num, rentalDetails } from '../../lib/listing/fields';
import { comparePath, PATHS } from '../../lib/paths';

// Données de la fiche (sorties de ListingPage.tsx telles quelles).

/** Retour : la recherche d'où l'on vient (même site), sinon la recherche. */
export function backTarget(): { href: string; label: string; fromSearch: boolean } {
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer && referrer.origin === window.location.origin && referrer.pathname.startsWith(PATHS.search)) {
      return { href: referrer.pathname + referrer.search, label: 'Retour à la recherche', fromSearch: true };
    }
  } catch {
    // Adresse illisible : la recherche par défaut.
  }
  return { href: PATHS.search, label: 'Chercher un bien', fromSearch: false };
}

/** Coût de la location, à partir du loyer hors charges (ListingDetailView.swift 502–509). */
export function rentalCostOf(row: ListingRow): RentalCost | null {
  const price = Number(row.price);
  if (row.transaction !== 'rent' || !(price > 0)) return null;
  const rental = rentalDetails(row);
  const area = Number(row.living_area);
  const fees = num(row.agency_fees_amount);
  return new RentalCost({
    rentExcludingCharges: price,
    charges: num(row.monthly_charges),
    area: area > 0 ? area : null,
    isFurnished: rental?.isFurnished ?? null,
    declaredDeposit: rental?.securityDeposit ?? null,
    agencyFees: row.agency_fees_paid_by === 'buyer' && fees !== null && fees > 0 ? fees : null,
    chargesAreFlatRate: rental?.chargesMode === 'flatRate',
  });
}

/** Rentabilité hôtelière : seulement avec le chiffre d'affaires et l'EBITDA du vendeur (512–516). */
export function hotelPerformanceOf(row: ListingRow): HotelPerformance | null {
  const hotel = hotelOf(row);
  const revenue = hotel?.annualRevenue?.value;
  const ebitda = hotel?.ebitda?.value;
  if (!hotel || revenue == null || ebitda == null || !(revenue > 0)) return null;
  return new HotelPerformance({ annualRevenue: revenue, ebitda, rooms: hotel.rooms, occupancyRate: hotel.occupancyRate?.value ?? null });
}

export function coordinateOf(row: ListingRow) {
  const latitude = num(row.public_latitude);
  const longitude = num(row.public_longitude);
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

/**
 * Fond d'une annonce sans photo (ListingPhoto.placeholder de l'app) : une teinte selon le type de bien, l'icône photo
 * par-dessus. Une page sur deux d'une galerie est un peu plus claire (`variant`).
 */
export function photoTint(propertyType: string | null | undefined): string {
  switch (propertyType) {
    case 'apartment': return '#DDE6F0';
    case 'house': return '#DDEADF';
    case 'building': case 'commercial': case 'office': case 'hotel': return '#EFE6DA';
    default: return '#EADFE8';
  }
}

/**
 * « Comparer » de la fiche (CompareButton de l'app) : ajoute ou retire le bien, puis le message du bas (4 s) ; « Voir »
 * ou « Gérer » ouvre la comparaison, comme toucher le message.
 */
export function toggleListingCompare(listingId: string, mode: SearchMode | null) {
  const message = compareToast(toggleCompare(listingId), compareState().ids.length);
  if (!message) return;
  showToast({
    icon: 'columns',
    text: message.text,
    action: message.action
      ? { label: message.action, accessibilityLabel: message.action, run: () => window.location.assign(comparePath(mode)) }
      : undefined,
    wholeToast: true,
  });
}
