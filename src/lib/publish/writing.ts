import { formatArea, formatPrice } from '../format';
import { PROPERTY_TYPE_LABELS } from '../labels';
import { scopeLabel } from '../listingJson';
import { OUTDOOR_LABELS, type OutdoorSpace } from '../search';
import { HOTEL_AMENITIES, isDwelling, coOwnershipLots, currentAnnualRent, hotelOfDraft, type PublishDraft } from './draft';
import { CONDITION_LABELS, HOTEL_AMENITY_LABELS, PARKING_LABELS } from './labels';

// Titre et description proposés à partir des seuls champs remplis : rien n'est inventé (PublishWriting de l'app).

const OUTDOOR_ORDER: OutdoorSpace[] = ['balcony', 'terrace', 'garden'];
const longDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const typeLabel = (draft: PublishDraft): string | null => (draft.propertyType ? PROPERTY_TYPE_LABELS[draft.propertyType] : null);
const plural = (count: number, word: string): string => `${count} ${word}${count > 1 ? 's' : ''}`;

/** « Appartement 3 pièces – Lyon », « Hôtel 24 chambres – Annecy », « Terrain – Rodez ». */
export function proposedTitle(draft: PublishDraft): string {
  const type = typeLabel(draft) ?? 'Bien';
  const parts = [type];
  if (draft.rooms !== null && isDwelling(draft.propertyType)) parts[0] = `${type} ${plural(draft.rooms, 'pièce')}`;
  const hotel = hotelOfDraft(draft);
  if (hotel?.rooms != null) parts[0] = `Hôtel ${hotel.rooms} chambres`;
  const city = draft.address?.city ?? '';
  if (city !== '') parts.push(city);
  return parts.join(' – ');
}

/** Description en phrases courtes, reprenant uniquement ce qui a été saisi. */
export function proposedDescription(draft: PublishDraft): string {
  const sentences: string[] = [];
  const type = typeLabel(draft)?.toLowerCase() ?? 'bien';
  let first = draft.transaction === 'rent' ? `À louer : ${type}` : `À vendre : ${type}`;
  const area = draft.propertyType === 'land' ? draft.landArea : draft.livingArea;
  if (area !== null) first += ` de ${formatArea(area)}`;
  const city = draft.address?.city ?? '';
  if (city !== '') first += ` à ${city}`;
  sentences.push(`${first}.`);
  if (draft.rooms !== null && isDwelling(draft.propertyType)) {
    let text = plural(draft.rooms, 'pièce');
    if (draft.bedrooms !== null) text += ` dont ${plural(draft.bedrooms, 'chambre')}`;
    sentences.push(`${text}.`);
  }
  if (draft.floor !== null) {
    let text = draft.floor === 0 ? 'Rez-de-chaussée' : `${draft.floor}${draft.floor === 1 ? 'er' : 'e'} étage`;
    if (draft.hasElevator === true) text += ' avec ascenseur';
    sentences.push(`${text}.`);
  }
  if (draft.outdoorSpaces.length > 0) {
    sentences.push(`${OUTDOOR_ORDER.filter((space) => draft.outdoorSpaces.includes(space)).map((space) => OUTDOOR_LABELS[space]).join(', ')}.`);
  }
  if (draft.parking !== 'none') sentences.push(`Stationnement : ${PARKING_LABELS[draft.parking].toLowerCase()}.`);
  if (draft.hasCellar === true) sentences.push('Cave.');
  if (draft.condition !== null) sentences.push(`État : ${CONDITION_LABELS[draft.condition].toLowerCase()}.`);
  const hotel = hotelOfDraft(draft);
  if (hotel) {
    if (hotel.scope !== null) sentences.push(`Vente : ${scopeLabel(hotel.scope).toLowerCase()}.`);
    if (hotel.stars !== null) sentences.push(`Classement ${plural(hotel.stars, 'étoile')}.`);
    if (hotel.amenities && hotel.amenities.length > 0) {
      const amenities = HOTEL_AMENITIES.filter((amenity) => hotel.amenities?.includes(amenity));
      sentences.push(`Équipements : ${amenities.map((amenity) => HOTEL_AMENITY_LABELS[amenity].toLowerCase()).join(', ')}.`);
    }
  }
  const lots = coOwnershipLots(draft);
  if (lots !== null) {
    const procedure = draft.coOwnershipHasProcedure;
    const detail = procedure === false ? ', sans procédure en cours' : procedure === true ? ', procédure en cours' : '';
    sentences.push(`Copropriété de ${plural(lots, 'lot')}${detail}.`);
  }
  const annualRent = currentAnnualRent(draft);
  if (draft.transaction === 'sale' && draft.rentalInfo?.isLeased === true && annualRent !== null) {
    sentences.push(`Vendu loué : ${formatPrice(annualRent)} de loyers annuels actuels hors charges.`);
  }
  if (draft.transaction === 'rent') {
    if (draft.price !== null) {
      let text = `Loyer : ${formatPrice(draft.price)} hors charges par mois`;
      if (draft.monthlyCharges !== null && draft.monthlyCharges > 0) {
        text += draft.rentalInfo?.chargesMode === 'flatRate'
          ? `, plus un forfait de charges de ${formatPrice(draft.monthlyCharges)}`
          : `, plus ${formatPrice(draft.monthlyCharges)} de provisions sur charges`;
      }
      sentences.push(`${text}.`);
    }
    const furnished = draft.rentalInfo?.isFurnished ?? null;
    if (isDwelling(draft.propertyType) && furnished !== null) sentences.push(furnished ? 'Logement meublé.' : 'Logement non meublé.');
    const available = draft.rentalInfo?.availableFrom ?? null;
    if (available !== null) sentences.push(`Disponible le ${longDay.format(new Date(`${available}T12:00:00Z`))}.`);
  }
  if (draft.energy.energyClass !== null) {
    let text = `DPE ${draft.energy.energyClass}`;
    if (draft.energy.climateClass !== null) text += `, GES ${draft.energy.climateClass}`;
    sentences.push(`${text}.`);
  }
  return sentences.join(' ');
}
