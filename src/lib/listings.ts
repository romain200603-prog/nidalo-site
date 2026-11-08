import { PHOTO_BUCKET, SUPABASE_URL } from './config';
import { supabase } from './supabase';

// Colonnes lues, les mêmes que l'app (Data/Supabase/SupabaseListingRepository.swift). Les règles du serveur ne
// laissent lire que les annonces publiées (active, underOffer) ; l'adresse exacte reste dans une table privée.
export const LISTING_COLUMNS = [
  'id', 'owner_id', 'status', 'transaction', 'property_type', 'publish_category', 'title', 'description', 'price',
  'monthly_charges', 'annual_property_tax', 'works_amount', 'agency_fees_amount', 'agency_fees_paid_by', 'previous_price',
  'co_ownership_lots', 'co_ownership_has_procedure',
  'country_code', 'postal_code', 'city', 'insee_code', 'location_precision', 'public_latitude', 'public_longitude',
  'public_street', 'living_area', 'land_area', 'rooms', 'bedrooms', 'floor', 'total_floors', 'has_elevator',
  'outdoor_spaces', 'parking', 'year_built', 'is_new_build', 'has_cellar', 'condition', 'accepts_video_visits',
  'energy_class', 'climate_class', 'primary_energy_consumption', 'annual_energy_cost_min', 'annual_energy_cost_max',
  'diagnostic_date', 'rental_info', 'asset_details', 'published_at', 'created_at', 'updated_at',
  'listing_photos(id,storage_path,position,width,height)',
].join(',');

export const PUBLIC_STATUSES = ['active', 'underOffer'] as const;

export type PhotoRow = { id: string; storage_path: string; position: number; width: number | null; height: number | null };

export type RentalInfo = {
  isLeased?: boolean;
  isFurnished?: boolean;
  currentMonthlyRent?: number;
  potentialMonthlyRent?: number;
  availableFrom?: string;
  [key: string]: unknown;
};

export type ListingRow = {
  id: string;
  owner_id: string;
  status: string;
  transaction: 'sale' | 'rent';
  property_type: string;
  publish_category: string | null;
  title: string;
  description: string;
  price: number;
  monthly_charges: number | null;
  annual_property_tax: number | null;
  works_amount: number | null;
  agency_fees_amount: number | null;
  agency_fees_paid_by: string | null;
  previous_price: number | null;
  /** Copropriété (vente) : nombre de lots et procédure en cours, mentions obligatoires de l'annonce. */
  co_ownership_lots: number | null;
  co_ownership_has_procedure: boolean | null;
  country_code: string;
  postal_code: string;
  city: string;
  insee_code: string | null;
  location_precision: 'exact' | 'approximate';
  public_latitude: number | null;
  public_longitude: number | null;
  public_street: string | null;
  living_area: number;
  land_area: number | null;
  rooms: number | null;
  bedrooms: number | null;
  floor: number | null;
  total_floors: number | null;
  has_elevator: boolean | null;
  outdoor_spaces: string[] | null;
  parking: string;
  year_built: number | null;
  is_new_build: boolean | null;
  has_cellar: boolean | null;
  condition: string | null;
  accepts_video_visits: boolean | null;
  energy_class: string | null;
  climate_class: string | null;
  primary_energy_consumption: number | null;
  annual_energy_cost_min: number | null;
  annual_energy_cost_max: number | null;
  diagnostic_date: string | null;
  rental_info: RentalInfo | null;
  asset_details: Record<string, unknown> | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  listing_photos: PhotoRow[] | null;
};

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function photoUrl(path: string): string {
  // Aperçu de la publication : une photo choisie sur l'ordinateur, pas encore envoyée.
  if (path.startsWith('blob:')) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Photos dans l'ordre choisi par l'auteur. */
export function sortedPhotos(row: Pick<ListingRow, 'listing_photos'>): PhotoRow[] {
  return [...(row.listing_photos ?? [])].sort((a, b) => a.position - b.position);
}

/** Ville et code postal ; la rue seulement si l'auteur a choisi de montrer l'adresse exacte (comme l'app). */
export function placeLine(row: Pick<ListingRow, 'city' | 'postal_code'>): string {
  const city = row.city.trim();
  const postal = row.postal_code.trim();
  return postal ? `${city} (${postal})` : city;
}

export class ListingNotFound extends Error {}

export async function fetchListing(id: string): Promise<ListingRow> {
  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_COLUMNS)
    .eq('id', id)
    .in('status', [...PUBLIC_STATUSES])
    .limit(1);
  if (error) throw error;
  const row = (data as unknown as ListingRow[] | null)?.[0];
  if (!row) throw new ListingNotFound(id);
  return row;
}
