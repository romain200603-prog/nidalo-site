import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { PhotoPager } from '../components/PhotoPager';
import { SignInCard } from '../components/account/SignInCard';
import { isNewAccount } from '../lib/account/auth';
import { databaseMessage } from '../lib/account/errors';
import {
  categoryIncludes, categoryOfMode, FAVORITE_CATEGORIES, FAVORITE_SORTS, favoriteCard, favoriteDetails, favoriteSuggestions,
  matchesText, modeOfCategory, relevanceOrder, savedCountText, sortFavorites, type FavoriteCard, type FavoriteCategory, type FavoriteSort,
} from '../lib/account/favoriteCards';
import { loadFavorites, removeFavorite, useFavorites, type Favorite } from '../lib/account/favorites';
import { loadSavedSearches, savedSearchesStore } from '../lib/account/savedSearches';
import { useSession, useStore } from '../lib/account/session';
import { formatCardPrice, yieldTone } from '../lib/cardContent';
import { formatFraction, formatPrice } from '../lib/format';
import { highlightsFor } from '../lib/highlights';
import { DPE_COLORS } from '../lib/labels';
import { LISTING_COLUMNS, sortedPhotos, type ListingRow } from '../lib/listings';
import { listingPath, PATHS } from '../lib/paths';
import { activeFilterCount, defaultDraft, matches, pricePerSquareMeter, type SearchDraft } from '../lib/search';
import { supabase } from '../lib/supabase';
import { FiltersDialog, type DraftsByMode } from './FiltersDialog';
import { soonPath } from './account/Screens';
import { SavedSearchesList, useSearchCounts } from './account/SavedSearchesList';
import { EmptyState, Spinner } from './account/parts';
import '../styles/account.css';

// « Vos favoris » (Features/Favorites/FavoritesView.swift) : onglets Favoris et Recherches ; recherche, catégories,
// filtres et tri sur les biens mis en cœur. Les filtres s'appliquent directement aux favoris chargés (même moteur
// que la recherche), sans relancer une recherche complète.

type Loaded =
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

function useFavoriteCards(items: Favorite[]): [Loaded, () => void] {
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
function matchingIds(cards: FavoriteCard[], draft: SearchDraft): Set<string> {
  const highlights = highlightsForDraft(draft);
  const category = categoryOfMode(draft.mode);
  return new Set(cards
    .filter((card) => categoryIncludes(category, card.content.kind) && matches(card.row, draft, highlights(card.row)))
    .map((card) => card.row.id));
}

/** Filtres posés sur une catégorie, lieu compris (pastille du bouton). */
function filterCount(draft: SearchDraft | undefined): number {
  if (!draft) return 0;
  return activeFilterCount(draft) + (draft.place.trim() ? 1 : 0);
}

function FavoriteHeart({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      className="favorite-heart"
      aria-label="Retirer des favoris"
      title="Retirer des favoris"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onRemove();
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/** Carte d'un favori : grande photo (rendement, cœur, compteur), puis prix, prix au m², DPE, titre, infos clés. */
function FavoriteListingCard({ card, onRemove }: { card: FavoriteCard; onRemove: () => void }) {
  const { row, content, grossYield } = card;
  const photos = sortedPhotos(row).slice(0, 10);
  const [page, setPage] = useState(0);
  const price = formatCardPrice(content.price);
  const perMeter = row.transaction === 'sale' ? pricePerSquareMeter(row) : null;
  const energy = row.energy_class && DPE_COLORS[row.energy_class] ? row.energy_class : null;
  const href = listingPath(row.id, content.kind === 'investment' ? 'invest' : null);
  return (
    <article className="favorite-card">
      <div className="favorite-photo" onClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        window.location.assign(href);
      }}>
        {photos.length === 0 ? (
          <div className="favorite-no-photo">
            <Icon name="image" />
            <span>Pas encore de photo</span>
          </div>
        ) : (
          <PhotoPager photos={photos} label={row.title} showsDots={false} onPageChange={setPage} />
        )}
        {grossYield !== null && (
          <span className={`favorite-yield tone-${yieldTone(grossYield)}`}>
            <span className="visually-hidden">Rendement brut </span>
            {formatFraction(grossYield)}
          </span>
        )}
        <FavoriteHeart onRemove={onRemove} />
        {photos.length > 1 && (
          <span className="favorite-counter" aria-hidden="true">
            <Icon name="camera" />
            {page + 1}/{photos.length}
          </span>
        )}
      </div>
      <div className="favorite-body">
        <div className="favorite-price-row">
          <p className="favorite-price">
            <strong>{price.amount}</strong>
            {price.suffix && <span>{price.suffix}</span>}
          </p>
          {perMeter !== null && <span className="favorite-per-meter">{formatPrice(perMeter)}/m²</span>}
          {energy && (
            <span className="favorite-dpe">
              <span aria-hidden="true">DPE</span>
              <span className="favorite-dpe-letter" style={{ background: DPE_COLORS[energy] }} aria-hidden="true">{energy}</span>
              <span className="visually-hidden">DPE {energy}</span>
            </span>
          )}
        </div>
        <h2 className="favorite-title"><a className="stretched" href={href}>{row.title}</a></h2>
        <p className="favorite-details">{favoriteDetails(row, content.kind)}</p>
      </div>
    </article>
  );
}

/** Annonce retirée par son vendeur : elle ne s'ouvre plus, on peut retirer le favori. */
function MissingCards({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <div className="missing-cards">
      {ids.map((id) => (
        <div key={id} className="missing-card">
          <span className="missing-icon"><Icon name="house" /></span>
          <span className="missing-text">
            <span className="missing-title">Annonce plus disponible</span>
            <span className="missing-subtitle">Le vendeur l&apos;a retirée, vendue ou louée.</span>
          </span>
          <button type="button" className="missing-remove" onClick={() => void removeFavorite(id)}>Retirer</button>
        </div>
      ))}
    </div>
  );
}

function FavoritesTabs({ tab, onChange, searchCount, hasNews }: {
  tab: 'favorites' | 'searches';
  onChange: (tab: 'favorites' | 'searches') => void;
  searchCount: number;
  hasNews: boolean;
}) {
  return (
    <div className="favorites-tabs" role="group" aria-label="Favoris ou recherches">
      <button type="button" aria-pressed={tab === 'favorites'} className={tab === 'favorites' ? 'is-active' : undefined} onClick={() => onChange('favorites')}>
        <Icon name="heart" />Favoris
      </button>
      <button
        type="button"
        aria-pressed={tab === 'searches'}
        aria-label={`Recherches, ${searchCount}${hasNews ? ', nouveautés' : ''}`}
        className={tab === 'searches' ? 'is-active' : undefined}
        onClick={() => onChange('searches')}
      >
        <Icon name="search" />Recherches
        <span className="favorites-tab-count">({searchCount}){hasNews && <span className="news-dot" aria-hidden="true" />}</span>
      </button>
    </div>
  );
}

function FavoritesContent({ items }: { items: Favorite[] }) {
  const [loaded, retry] = useFavoriteCards(items);
  const searches = useStore(savedSearchesStore);
  const searchItems = searches.status === 'ready' ? searches.items : [];
  const counts = useSearchCounts(searchItems);
  const hasNews = searchItems.some((item) => (counts[item.id]?.news ?? 0) > 0);
  const [tab, setTab] = useState<'favorites' | 'searches'>(() => (new URLSearchParams(window.location.search).get('onglet') === 'recherches' ? 'searches' : 'favorites'));
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [category, setCategory] = useState<FavoriteCategory>('all');
  const [sort, setSort] = useState<FavoriteSort>('relevance');
  const [filterDrafts, setFilterDrafts] = useState<DraftsByMode>({});
  const [filterMode, setFilterMode] = useState<SearchDraft['mode']>('buy');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    void loadSavedSearches();
  }, []);

  function changeTab(next: 'favorites' | 'searches') {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'searches') url.searchParams.set('onglet', 'recherches');
    else url.searchParams.delete('onglet');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }

  const cards = loaded.status === 'ready' ? loaded.cards : [];
  const addedAt = useMemo(() => new Map(items.map((item) => [item.listing_id, item.created_at])), [items]);
  const activeDraft = filterDrafts[filterMode];
  const activeFilters = filterCount(activeDraft);
  const filteredIds = useMemo(
    () => (activeDraft && activeFilters > 0 ? matchingIds(cards, activeDraft) : null),
    [cards, activeDraft, activeFilters],
  );
  const shown = sortFavorites(
    cards.filter((card) => matchesText(card.row, query)
      && categoryIncludes(category, card.content.kind)
      && (filteredIds?.has(card.row.id) ?? true)),
    sort,
    addedAt,
  );
  const suggestions = focused ? favoriteSuggestions(query, cards.map((card) => card.row)) : [];
  const sortTitle = FAVORITE_SORTS.find((entry) => entry.sort === sort)!;

  function showAll() {
    setQuery('');
    setCategory('all');
    setFilterDrafts({});
  }

  return (
    <>
      <div className="favorites-head">
        <h1>Vos favoris</h1>
        <a className="compare-button" href={soonPath('comparer')} aria-label="Comparer vos favoris" title="Comparer vos favoris">
          <Icon name="columns" />
        </a>
      </div>
      <p className="favorites-subtitle">Retrouvez vos biens favoris et vos recherches</p>
      <FavoritesTabs tab={tab} onChange={changeTab} searchCount={searchItems.length} hasNews={hasNews} />

      {tab === 'searches' ? (
        <div className="favorites-searches">
          <SavedSearchesList embedded counts={counts} />
        </div>
      ) : (
        <>
          <div className="favorites-search">
            <div className="favorites-field">
              <Icon name="search" />
              <input
                type="text"
                aria-label="Rechercher dans vos favoris"
                placeholder="Ville, code postal, type de bien"
                value={query}
                autoComplete="off"
                enterKeyHint="search"
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => window.setTimeout(() => setFocused(false), 150)}
              />
              {query && (
                <button type="button" className="favorites-clear" aria-label="Effacer la recherche" onClick={() => setQuery('')}>
                  <Icon name="x" />
                </button>
              )}
            </div>
            <button
              type="button"
              className={`favorites-filters${activeFilters > 0 ? ' is-active' : ''}`}
              aria-label={activeFilters > 0 ? `Filtres, ${activeFilters} actifs` : 'Filtres'}
              onClick={() => {
                // Les filtres s'ouvrent sur la catégorie de la pastille active (« Tous » : Résidentiel).
                setFilterMode(modeOfCategory(category) ?? 'buy');
                setFiltersOpen(true);
              }}
            >
              <Icon name="sliders" />
              {activeFilters > 0 && <span className="favorites-filters-count" aria-hidden="true">{activeFilters}</span>}
            </button>
          </div>
          {suggestions.length > 0 && (
            <ul className="favorites-suggestions" aria-label="Suggestions">
              {suggestions.map((suggestion) => (
                <li key={`${suggestion.kind}-${suggestion.value}`}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setQuery(suggestion.value);
                      setFocused(false);
                    }}
                  >
                    <Icon name={suggestion.kind === 'city' ? 'pin' : 'house'} />
                    <span className="favorites-suggestion-text">
                      <span>{suggestion.value}</span>
                      <span className="favorites-suggestion-detail">{suggestion.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="chips-row favorites-categories" role="group" aria-label="Catégories">
            {FAVORITE_CATEGORIES.map((entry) => (
              <button
                key={entry.category}
                type="button"
                aria-pressed={category === entry.category}
                className={`category-chip${category === entry.category ? ' is-selected' : ''}`}
                onClick={() => setCategory(entry.category)}
              >
                <Icon name={entry.icon} />{entry.title}
              </button>
            ))}
          </div>

          {cards.length > 0 && (
            <div className="favorites-toolbar">
              <Icon name="heart" />
              <span className="favorites-total" aria-live="polite">{savedCountText(shown.length, cards.length)}</span>
              <label className="favorites-sort">
                <Icon name="arrowUpDown" />
                <span aria-hidden="true">{sortTitle.short}</span>
                <Icon name="chevronDown" />
                <select aria-label="Trier par" value={sort} onChange={(event) => setSort(event.target.value as FavoriteSort)}>
                  {FAVORITE_SORTS.map((entry) => <option key={entry.sort} value={entry.sort}>{entry.title}</option>)}
                </select>
              </label>
            </div>
          )}

          <div className="favorites-list">
            {loaded.status === 'loading' && <Spinner />}
            {loaded.status === 'error' && (
              <EmptyState
                icon="triangleAlert"
                title="Vos favoris n'ont pas pu être chargés"
                text={loaded.message}
                action={<button type="button" className="btn btn-light" onClick={retry}>Réessayer</button>}
              />
            )}
            {loaded.status === 'ready' && (
              cards.length === 0 && loaded.missing.length > 0 ? (
                <MissingCards ids={loaded.missing} />
              ) : cards.length === 0 ? (
                <EmptyState
                  icon="heart"
                  title="Aucun favori pour l'instant"
                  text="Touchez le cœur d'une annonce pour la retrouver ici."
                  action={<a className="btn btn-primary favorites-empty-button" href={PATHS.search}>Rechercher un bien</a>}
                />
              ) : shown.length === 0 ? (
                <EmptyState
                  icon="search"
                  title="Aucun favori ne correspond"
                  text="Modifiez la recherche, la catégorie ou les filtres."
                  action={<button type="button" className="link-button" onClick={showAll}>Tout afficher</button>}
                />
              ) : (
                <>
                  {shown.map((card) => (
                    <FavoriteListingCard key={card.row.id} card={card} onRemove={() => void removeFavorite(card.row.id)} />
                  ))}
                  <MissingCards ids={loaded.missing} />
                </>
              )
            )}
          </div>

          {filtersOpen && (
            <FiltersDialog
              open
              draft={filterDrafts[filterMode] ?? defaultDraft(filterMode)}
              remembered={filterDrafts}
              countAmong={(draft) => matchingIds(cards, draft).size}
              onClose={() => setFiltersOpen(false)}
              onApply={(draft, drafts) => {
                setFiltersOpen(false);
                setFilterDrafts({ ...drafts, [draft.mode]: draft });
                setFilterMode(draft.mode);
                // La catégorie choisie dans les filtres devient la pastille active.
                setCategory(categoryOfMode(draft.mode));
              }}
            />
          )}
        </>
      )}
    </>
  );
}

function FavoritesBody() {
  const session = useSession();
  const favorites = useFavorites();
  if (session.status === 'loading') return <Spinner />;
  if (session.status === 'signedOut') {
    return (
      <div className="favorites-signin">
        <SignInCard onSignedIn={() => { if (isNewAccount()) window.location.assign(PATHS.account); }} />
      </div>
    );
  }
  if (favorites.status === 'error') {
    return (
      <EmptyState
        icon="triangleAlert"
        title="Vos favoris n'ont pas pu être chargés"
        text="Vérifiez votre connexion, puis réessayez."
        action={<button type="button" className="btn btn-light" onClick={() => void loadFavorites(true)}>Réessayer</button>}
      />
    );
  }
  if (favorites.status !== 'ready') return <Spinner />;
  return <FavoritesContent items={favorites.items} />;
}

export function FavoritesPage() {
  return (
    <Page section="favorites">
      <div className="wrap favorites-wrap">
        <FavoritesBody />
      </div>
    </Page>
  );
}
