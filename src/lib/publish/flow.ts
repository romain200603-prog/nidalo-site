import { formatArea, formatPrice } from '../format';
import { PROPERTY_TYPE_LABELS } from '../labels';
import type { ListingRow, RentalInfo } from '../listings';
import {
  cityOf, missingRequiredFields, newDraft, postalCodeOf, rentalBanMessage, REQUIRED_FIELD_LABELS, syncBuildingRent,
  type PublishDraft, type PublishStep, type RequiredField,
} from './draft';
import { CATEGORY_TITLES } from './labels';
import { listingWrite } from './serialize';
import { proposedTitle } from './writing';

// Règles de l'assistant Publier qui ne tiennent pas dans l'écran (PublishFlowView, PublishPreview, PublishReviewStep).

/** Étape d'ouverture : la catégorie pour une nouvelle annonce, sinon « Informations principales » (comme l'app). */
export function initialStep(draft: PublishDraft, editing: boolean): PublishStep {
  return draft.category === null && !editing ? 'category' : 'main';
}

/**
 * Brouillon enregistrable sur le serveur : un type de bien, un code postal et une ville, colonnes obligatoires de
 * l'annonce (le serveur refuse une ligne sans eux).
 */
export function canSaveDraft(draft: PublishDraft): boolean {
  const city = cityOf(draft);
  return draft.propertyType !== null && draft.transaction !== null && /^[0-9A-Za-z -]{2,10}$/.test(postalCodeOf(draft))
    && city !== '' && [...city].length <= 100;
}

export const DRAFT_NEEDS = 'Pour enregistrer le brouillon, indiquez d’abord le type de bien, le code postal et la ville.';

/** Valeur comparable : clés triées, photos réduites à leur identité (une photo choisie ou déjà en ligne). */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object' && !(value instanceof Blob)) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonical(record[key])]));
  }
  return value;
}

export function sameDraft(a: PublishDraft, b: PublishDraft): boolean {
  const comparable = (draft: PublishDraft) => canonical({
    ...draft,
    photos: draft.photos.map((photo) => (photo.kind === 'stored' ? `enregistrée:${photo.id}` : `nouvelle:${photo.key}`)),
  });
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}

/** Saisie à enregistrer avant de quitter (PublishFlowView.hasChanges) : rien tant qu'aucune catégorie n'est choisie. */
export function hasChanges(draft: PublishDraft, saved: PublishDraft | null): boolean {
  return draft.category !== null && !sameDraft(draft, saved ?? newDraft(draft.id));
}

/**
 * Annonce construite à partir du brouillon pour l'aperçu dans les résultats (PublishPreview.make) : titre et
 * description provisoires si absents ; rien tant qu'une information obligatoire manque.
 */
export function previewRow(source: PublishDraft, ownerId: string, now = new Date()): ListingRow | null {
  const draft: PublishDraft = {
    ...syncBuildingRent(source),
    title: source.title.trim() === '' ? proposedTitle(source) : source.title,
    description: source.description.trim() === '' ? 'Description à rédiger.' : source.description,
  };
  const coordinate = draft.coordinate;
  if (missingRequiredFields(draft, now).length > 0 || coordinate === null) return null;
  const write = listingWrite(draft, { insert: false });
  const stamp = now.toISOString();
  const exact = draft.locationPrecision === 'exact';
  return {
    ...write,
    owner_id: ownerId,
    status: 'active',
    previous_price: null,
    public_latitude: exact ? coordinate.latitude : null,
    public_longitude: exact ? coordinate.longitude : null,
    public_street: exact ? draft.address?.street?.trim() || null : null,
    rental_info: write.rental_info as RentalInfo | null,
    asset_details: write.asset_details as Record<string, unknown> | null,
    published_at: stamp,
    created_at: stamp,
    updated_at: stamp,
    listing_photos: draft.photos.map((photo, position) => ({
      id: photo.kind === 'stored' ? photo.id : photo.key,
      storage_path: photo.kind === 'stored' ? photo.storagePath : photo.url,
      position,
      width: photo.width,
      height: photo.height,
    })),
  };
}

/** Ligne « À compléter » : le message d'interdiction de louer pour un DPE interdit, sinon le libellé du champ. */
export function missingLabel(draft: PublishDraft, field: RequiredField, now = new Date()): string {
  return field === 'rentalEnergyClass' ? rentalBanMessage(draft, now) ?? REQUIRED_FIELD_LABELS[field] : REQUIRED_FIELD_LABELS[field];
}

export type RecapRow = { title: string; value: string; step: PublishStep };

/** « Récapitulatif » de l'étape Vérification (les documents restent dans l'app iPhone). */
export function recapRows(draft: PublishDraft): RecapRow[] {
  const rows: RecapRow[] = [];
  const category = [draft.category ? CATEGORY_TITLES[draft.category] : null, draft.propertyType ? PROPERTY_TYPE_LABELS[draft.propertyType] : null];
  rows.push({ title: 'Catégorie', value: category.filter(Boolean).join(' · '), step: 'category' });
  const address = draft.address;
  if (address) {
    const street = address.street?.trim() ?? '';
    rows.push({ title: 'Adresse', value: [street, `${address.postalCode} ${address.city}`].filter((part) => part !== '').join(', '), step: 'main' });
  }
  if (draft.price !== null) {
    const rent = draft.transaction === 'rent';
    rows.push({ title: rent ? 'Loyer' : 'Prix', value: rent ? `${formatPrice(draft.price)}/mois HC` : formatPrice(draft.price), step: 'finance' });
  }
  const area = draft.propertyType === 'land' ? draft.landArea : draft.livingArea;
  if (area !== null) rows.push({ title: 'Surface', value: formatArea(area), step: 'features' });
  if (draft.energy.energyClass !== null) rows.push({ title: 'DPE', value: draft.energy.energyClass, step: 'features' });
  rows.push({ title: 'Photos', value: String(draft.photos.length), step: 'media' });
  return rows;
}
