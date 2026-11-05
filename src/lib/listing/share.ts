import type { ListingRow } from '../listings';
import { hotelOf } from './fields';

// Texte du bouton « Partager », comme l'app (ImmoDomain/Listing/ListingShare.swift) : titre et lieu (ville et code
// postal, jamais l'adresse), puis prix et caractéristiques selon le type, et « À voir sur Nidalo ». Sur le site,
// le lien de la page est ajouté à part (l'app n'en publie pas).

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const areaNumber = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const area = (value: number) => `${areaNumber.format(value)} m²`;

export type ShareText = { text: string; subject: string; previewTitle: string };

type ShareRow = Pick<ListingRow, 'title' | 'city' | 'postal_code' | 'transaction' | 'price' | 'monthly_charges' | 'property_type'
  | 'living_area' | 'land_area' | 'rooms' | 'asset_details'>;

/** Prix de vente, ou loyer par mois (charges comprises s'il est connu). */
export function sharePrice(row: ShareRow): string {
  const price = Number(row.price);
  if (row.transaction !== 'rent') return euros.format(price);
  const charges = row.monthly_charges === null ? null : Number(row.monthly_charges);
  return `${euros.format(charges !== null && Number.isFinite(charges) ? price + charges : price)}/mois`;
}

export function shareFacts(row: ShareRow): string[] {
  const facts: string[] = [];
  const livingArea = Number(row.living_area);
  const living = livingArea > 0 ? area(livingArea) : null;
  const land = row.land_area === null ? null : Number(row.land_area);
  switch (row.property_type) {
    case 'land': {
      const value = land ?? (livingArea > 0 ? livingArea : null);
      if (value !== null) facts.push(`${area(value)} de terrain`);
      break;
    }
    case 'apartment':
    case 'house':
      if (living) facts.push(living);
      if (row.rooms !== null && row.rooms > 0) facts.push(row.rooms > 1 ? `${row.rooms} pièces` : '1 pièce');
      if (row.property_type === 'house' && land !== null && land > 0) facts.push(`${area(land)} de terrain`);
      break;
    case 'hotel': {
      const rooms = hotelOf(row)?.rooms ?? row.rooms;
      if (rooms !== null && rooms > 0) facts.push(rooms > 1 ? `${rooms} chambres` : '1 chambre');
      if (living) facts.push(living);
      break;
    }
    default:
      if (living) facts.push(living);
  }
  return facts;
}

export function shareText(row: ShareRow): ShareText {
  const price = sharePrice(row);
  const city = row.city.trim();
  const postal = row.postal_code.trim();
  const place = postal ? `${city} (${postal})` : city;
  const details = [price, ...shareFacts(row)];
  return {
    text: [`${row.title} · ${place}`, details.join(' · '), 'À voir sur Nidalo'].join('\n'),
    subject: `${row.title} à ${city} · ${price}`,
    previewTitle: `${row.title} · ${price}`,
  };
}
