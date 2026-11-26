import { supabase } from '../supabase';

// « Signaler l'annonce » (ReportSheet de l'app, ouvert depuis le bas de la fiche) : la même table `reports` et la même
// ligne que l'app (SupabaseMessagingRepository.report : target_type « listing », identifiants en majuscules, détails
// coupés à 2 000 caractères). Un signalement rejoué (23505) est déjà enregistré.

/** Motifs d'une annonce, dans l'ordre de la feuille (ReportReason.listingReasons et leurs libellés). */
export const LISTING_REPORT_REASONS = [
  { value: 'scam', label: 'Fraude immobilière ou arnaque' },
  { value: 'misleadingListing', label: 'Annonce trompeuse' },
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Contenu inapproprié' },
  { value: 'other', label: 'Autre' },
] as const;

export type ListingReportReason = (typeof LISTING_REPORT_REASONS)[number]['value'];

/** Description facultative : 500 caractères dans la feuille (LimitedEditor). */
export const LISTING_REPORT_LIMIT = 500;

export function listingReportRow(id: string, listingId: string, reason: ListingReportReason, details: string | null): Record<string, unknown> {
  const row: Record<string, unknown> = { id: id.toUpperCase(), target_type: 'listing', target_id: listingId.toUpperCase(), reason };
  if (details !== null) row.details = [...details].slice(0, 2000).join('');
  return row;
}

export async function reportListing(id: string, listingId: string, reason: ListingReportReason, details: string | null): Promise<void> {
  const { error } = await supabase.from('reports').insert(listingReportRow(id, listingId, reason, details));
  if (error && error.code !== '23505') throw error;
}
