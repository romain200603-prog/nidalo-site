import { fetchOffers } from '../listing/offers';
import { parisDay } from '../listing/views';
import { fetchVisitRequests } from '../listing/visits';
import type { ListingRow } from '../listings';
import { fetchInboxRows } from '../messages/api';
import { sameId, type ServerInboxRow } from '../messages/inbox';
import { supabase } from '../supabase';
import { GENERIC_MESSAGE, isNetworkError, NETWORK_MESSAGE } from './auth';
import type { ContactOfferRow, ContactVisitRow } from './contacts';
import { ONLINE_STATUSES } from './myListings';

// « Statistiques » de l'espace professionnel, sur 7 ou 30 jours, par annonce et au total : vues et mises en favori
// (fonction my_listing_stats : des nombres, jamais qui), nouvelles conversations, demandes de visite et offres (lues
// avec les fonctions de la messagerie, des visites et des offres, comme « Mes contacts »).

export type StatsPeriod = 7 | 30;

export const STATS_PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
];

/** Jour où les vues ont commencé à être comptées (mise en ligne des statistiques). */
export const VIEWS_COUNTED_SINCE = '2026-11-08';

/** Premier jour de la période (jour de Paris) : aujourd'hui et les jours d'avant, `period` jours en tout. */
export function periodStartDay(period: StatsPeriod, now: Date): string {
  const [year, month, day] = parisDay(now).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - (period - 1))).toISOString().slice(0, 10);
}

/** Ligne de my_listing_stats. */
export type ServerStatsRow = {
  listing_id: string;
  views: number | string | null;
  favorites_total: number | string | null;
  favorites_new: number | string | null;
};

export type StatCounts = { views: number; favorites: number; messages: number; visits: number; offers: number };

export type ListingStats = {
  row: ListingRow;
  counts: StatCounts;
  /** Personnes qui ont l'annonce en favori aujourd'hui. */
  favoritesTotal: number;
};

const ZERO: StatCounts = { views: 0, favorites: 0, messages: 0, visits: 0, offers: 0 };
const number = (value: number | string | null | undefined): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const inPeriod = (iso: string | null | undefined, startDay: string): boolean => {
  if (!iso) return false;
  const date = new Date(iso);
  return !Number.isNaN(date.getTime()) && parisDay(date) >= startDay;
};

export const STATUS_LABELS: Record<string, string> = {
  active: 'En ligne', underOffer: 'Sous offre', archived: 'Suspendue', sold: 'Vendue', rented: 'Louée',
};

/**
 * Statistiques des annonces publiées (pas les brouillons), celles en ligne d'abord, puis les plus vues : pour chacune,
 * ce qui s'est passé depuis `startDay`. Une conversation compte si elle a commencé dans la période et a un message ;
 * une demande de visite, si c'est une nouvelle demande (pas un nouveau créneau) ; une offre, si c'est la première
 * offre de l'acheteur (pas une contre-offre).
 */
export function buildStats({ me, listings, server, conversations, visits, offers, startDay }: {
  me: string;
  listings: ListingRow[];
  server: ServerStatsRow[];
  conversations: ServerInboxRow[];
  visits: ContactVisitRow[];
  offers: ContactOfferRow[];
  startDay: string;
}): { totals: StatCounts; items: ListingStats[] } {
  const published = listings.filter((row) => row.status !== 'draft');
  const byId = new Map(published.map((row) => [row.id.toLowerCase(), { row, counts: { ...ZERO }, favoritesTotal: 0 }]));
  const entry = (id: string | null | undefined) => (id ? byId.get(id.toLowerCase()) : undefined);

  for (const stat of server) {
    const item = entry(stat.listing_id);
    if (!item) continue;
    item.counts.views = number(stat.views);
    item.counts.favorites = number(stat.favorites_new);
    item.favoritesTotal = number(stat.favorites_total);
  }
  for (const row of conversations) {
    if (row.kind !== 'listing' || !sameId(row.seller_id, me) || sameId(row.buyer_id, me) || !row.last_message_at) continue;
    if (!inPeriod(row.created_at, startDay)) continue;
    const item = entry(row.listing_snapshot?.listingId ?? row.listing_id);
    if (item) item.counts.messages += 1;
  }
  for (const visit of visits) {
    if (sameId(visit.requester?.userId, me) || (!sameId(visit.recipient?.userId, me) && !sameId(visit.agent_user_id, me))) continue;
    if ((visit as { previous_request_id?: string | null }).previous_request_id || !inPeriod(visit.created_at, startDay)) continue;
    const item = entry(visit.listing_snapshot?.listingId ?? visit.listing_id);
    if (item) item.counts.visits += 1;
  }
  for (const offer of offers) {
    if (!sameId(offer.seller_id, me) || sameId(offer.buyer_id, me) || offer.parent_offer_id) continue;
    if ((offer.author_id && !sameId(offer.author_id, offer.buyer_id)) || !inPeriod(offer.created_at, startDay)) continue;
    const item = entry(offer.listing_id);
    if (item) item.counts.offers += 1;
  }

  const items = [...byId.values()].sort((a, b) => (
    Number(ONLINE_STATUSES.includes(b.row.status)) - Number(ONLINE_STATUSES.includes(a.row.status))
    || b.counts.views - a.counts.views
    || a.row.title.localeCompare(b.row.title, 'fr')
  ));
  const totals = items.reduce<StatCounts>((sum, item) => ({
    views: sum.views + item.counts.views,
    favorites: sum.favorites + item.counts.favorites,
    messages: sum.messages + item.counts.messages,
    visits: sum.visits + item.counts.visits,
    offers: sum.offers + item.counts.offers,
  }), { ...ZERO });
  return { totals, items };
}

/** « 8 personnes l'ont en favori » ; rien à 0. */
export function favoritesTotalLine(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? '1 personne l\'a en favori' : `${new Intl.NumberFormat('fr-FR').format(count)} personnes l'ont en favori`;
}

// MARK: - Serveur

export type StatsData = { server: ServerStatsRow[]; conversations: ServerInboxRow[]; visits: ContactVisitRow[]; offers: ContactOfferRow[] };

export const statsFailure = (error: unknown): string => (isNetworkError(error) ? NETWORK_MESSAGE : GENERIC_MESSAGE);

/** Vues et favoris depuis `startDay` (my_listing_stats), puis les échanges, lus comme Mes contacts. */
export async function fetchStatsData(startDay: string): Promise<StatsData> {
  const [stats, conversations, visits, offers] = await Promise.all([
    supabase.rpc('my_listing_stats', { p_since: startDay }),
    fetchInboxRows(), fetchVisitRequests() as Promise<ContactVisitRow[]>, fetchOffers() as Promise<ContactOfferRow[]>,
  ]);
  if (stats.error) throw stats.error;
  return { server: (stats.data ?? []) as ServerStatsRow[], conversations, visits, offers };
}
