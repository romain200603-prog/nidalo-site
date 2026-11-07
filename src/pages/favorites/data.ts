import { useEffect, useMemo, useRef, useState } from 'react';
import { databaseMessage } from '../../lib/account/errors';
import { categoryIncludes, categoryOfMode, favoriteCard, relevanceOrder, type FavoriteCard } from '../../lib/account/favoriteCards';
import type { Favorite } from '../../lib/account/favorites';
import { highlightsFor } from '../../lib/highlights';
import { LISTING_COLUMNS, type ListingRow } from '../../lib/listings';
import { activeFilterCount, matches, type SearchDraft } from '../../lib/search';
import { supabase } from '../../lib/supabase';

// Données de « Vos favoris » partagées par le téléphone et l'ordinateur (sorties de FavoritesPage.tsx telles quelles) :
// fiches des favoris, annonces plus disponibles, filtres appliqués aux favoris chargés.

export type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; cards: FavoriteCard[]; missing: string[] };

/** Fiches des favoris, par paquets ; une annonce que le serveur ne renvoie pas (retirée, vendue) est « plus disponible ». */
async function loadCards(items: Favorite[]): Promise<{ cards: FavoriteCard[]; missing: string[] }> {
  const ids = items.map((item) => item.listing_id);
  const rows: ListingRow[] = [];
  for (let start = 0; start < ids.length; start += 100) {
    const { data, error } = await supabase.from('listings').select(LISTING_COLUMNS).in('id', ids.slice(start, start + 100));
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as ListingRow[]));
  }
  const found = new Set(rows.map((row) => row.id));
  return { cards: relevanceOrder(rows.map(favoriteCard)), missing: ids.filter((id) => !found.has(id)) };
}

export function useFavoriteCards(items: Favorite[]): [Loaded, () => void] {
  const [state, setState] = useState<Loaded>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const loadedIds = useRef<Set<string>>(new Set());
  const ids = items.map((item) => item.listing_id);
  const key = [...ids].sort().join(',');
  useEffect(() => {
    // Un favori retiré disparaît sans recharger ; un favori ajouté ailleurs (autre onglet) recharge les fiches.
    if (state.status === 'ready' && ids.every((id) => loadedIds.current.has(id))) return;
    let cancelled = false;
    loadCards(items)
      .then((result) => {
        if (cancelled) return;
        loadedIds.current = new Set(ids);
        setState({ status: 'ready', ...result });
      })
      .catch((error: unknown) => { if (!cancelled) setState({ status: 'error', message: databaseMessage(error) }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  const shown = useMemo<Loaded>(() => {
    if (state.status !== 'ready') return state;
    const current = new Set(ids);
    return { status: 'ready', cards: state.cards.filter((card) => current.has(card.row.id)), missing: state.missing.filter((id) => current.has(id)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, key]);
  return [shown, () => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }];
}

function highlightsForDraft(draft: SearchDraft) {
  return (row: ListingRow) => highlightsFor(row, draft.mode === 'invest' ? draft.downPayment : null);
}

/** Favoris de la catégorie de ces filtres qui y correspondent (FavoriteFilterMatcher, appliqué aux favoris). */
export function matchingIds(cards: FavoriteCard[], draft: SearchDraft): Set<string> {
  const highlights = highlightsForDraft(draft);
  const category = categoryOfMode(draft.mode);
  return new Set(cards
    .filter((card) => categoryIncludes(category, card.content.kind) && matches(card.row, draft, highlights(card.row)))
    .map((card) => card.row.id));
}

/** Filtres posés sur une catégorie, lieu compris (pastille du bouton). */
export function filterCount(draft: SearchDraft | undefined): number {
  if (!draft) return 0;
  return activeFilterCount(draft) + (draft.place.trim() ? 1 : 0);
}
