import type { ListingRow } from '../../lib/listings';
import { HotelPerformance, RentalCost } from '../../lib/investment';
import { hotelOf, num, rentalDetails } from '../../lib/listing/fields';
import { PATHS } from '../../lib/paths';

// Données de la fiche partagées par le téléphone et l'ordinateur (sorties de ListingPage.tsx telles quelles).

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
