import { rentalInfo } from './listingJson';
import { LISTING_COLUMNS, PUBLIC_STATUSES, type ListingRow } from './listings';
import { defaultDraft, matches, sortResults, type Highlights, type Result } from './search';
import { supabase } from './supabase';

// Sections de l'accueil, lues sur le serveur comme dans l'app (HomeView.loadFeed), avec seulement des données
// réelles : l'app y mêle des annonces de démonstration (consultés récemment, coup de cœur, tendances, articles),
// qui n'existent pas sur le serveur et ne sont donc pas reprises.

export type HomeFeed = {
  /** « Opportunités du moment » : Investir, plus récentes d'abord, 8 au plus. */
  opportunities: Result[];
  /** « Nouveautés » : ventes les plus récentes, hors hôtels, 4 au plus. */
  newest: ListingRow[];
  /** « Baisses de prix » : prix inférieur au précédent, du moins cher au plus cher. */
  priceDrops: ListingRow[];
};

const FEED_LIMIT = 200;

export function homeFeedFrom(rows: ListingRow[], highlightsFor: (row: ListingRow) => Highlights | null): HomeFeed {
  const invest = defaultDraft('invest');
  const opportunities = sortResults(
    rows.map((row) => ({ row, highlights: highlightsFor(row) })).filter(({ row, highlights }) => matches(row, invest, highlights)),
    'newest',
  ).slice(0, 8);
  const sales = rows.filter((row) => row.transaction === 'sale');
  const newest = sortResults(sales.filter((row) => row.property_type !== 'hotel').map((row) => ({ row, highlights: null })), 'newest')
    .slice(0, 4)
    .map((r) => r.row);
  const priceDrops = rows
    .filter((row) => row.previous_price !== null && Number(row.previous_price) > Number(row.price) && Number(row.price) > 0)
    .sort((a, b) => Number(a.price) - Number(b.price))
    .slice(0, 8);
  return { opportunities, newest, priceDrops };
}

export async function loadHomeFeed(highlightsFor: (row: ListingRow) => Highlights | null): Promise<HomeFeed> {
  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_COLUMNS)
    .in('status', [...PUBLIC_STATUSES])
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(FEED_LIMIT);
  if (error) throw error;
  return homeFeedFrom((data as unknown as ListingRow[] | null) ?? [], highlightsFor);
}

/** Étiquette d'une carte de l'accueil : nature du projet (ListingSummary.tag dans l'app). */
export function homeTag(row: ListingRow, hasInvestment: boolean): string {
  if (row.transaction !== 'sale') return 'Location';
  const isLeased = rentalInfo(row)?.isLeased === true;
  if (row.property_type === 'hotel') return isLeased ? 'Murs loués' : 'Murs et fonds';
  if (!hasInvestment) return 'Résidence principale';
  return isLeased ? 'Locatif' : 'Investissement';
}

/** Baisse de prix en fraction (négative) : (prix − ancien prix) ÷ ancien prix. */
export function priceDrop(row: Pick<ListingRow, 'price' | 'previous_price'>): number | null {
  const previous = Number(row.previous_price);
  if (!(previous > 0)) return null;
  return (Number(row.price) - previous) / previous;
}
