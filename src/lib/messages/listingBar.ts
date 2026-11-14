import { supabase } from '../supabase';

// Barre de l'annonce d'une conversation (demande de Romain du 14 novembre 2026) : « Ville · prix · rendement brut ·
// nombre de lots ». Les lots viennent de listing_lots (lus quand l'annonce est publiée) ; un seul lot ne s'affiche pas.

/** État de chaque lot du bien (« leased » ou « vacant »). */
export async function fetchLotStatuses(listingId: string): Promise<string[]> {
  const { data, error } = await supabase.from('listing_lots').select('status').eq('listing_id', listingId);
  if (error) throw error;
  return ((data as { status: string | null }[] | null) ?? []).map((row) => row.status ?? '');
}

/** « 3 lots loués », « 3 lots dont 2 loués », « 3 lots » ; rien pour un seul lot. */
export function lotsLabel(statuses: readonly string[]): string | null {
  const total = statuses.length;
  if (total < 2) return null;
  const leased = statuses.filter((status) => status === 'leased').length;
  if (leased === total) return `${total} lots loués`;
  if (leased > 0) return `${total} lots dont ${leased} loué${leased > 1 ? 's' : ''}`;
  return `${total} lots`;
}
