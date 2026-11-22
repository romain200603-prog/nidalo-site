import { useEffect, useMemo, useState } from 'react';
import { CriterionChipsRow } from '../components/CriterionChips';
import { FavoritesEmptyState } from '../components/FavoritesEmptyState';
import { Icon } from '../components/Icon';
import { ModeTabs } from '../components/ModeTabs';
import { Page } from '../components/Layout';
import { OfflineState } from '../components/OfflineState';
import { PhotoPager } from '../components/PhotoPager';
import { SignInCard } from '../components/account/SignInCard';
import { HeartIcon } from '../components/account/HeartButton';
import { isNewAccount } from '../lib/account/auth';
import {
  categoryIncludes, categoryOfMode, FAVORITE_SORTS, favoriteDetails, favoriteSuggestions,
  matchesText, modeOfCategory, savedCountText, sortFavorites, type FavoriteCard, type FavoriteCategory, type FavoriteSort,
} from '../lib/account/favoriteCards';
import { loadFavorites, useFavorites, type Favorite } from '../lib/account/favorites';
import { loadSavedSearches, savedSearchesStore } from '../lib/account/savedSearches';
import { useSession, useStore } from '../lib/account/session';
import { formatCardPrice, yieldTone } from '../lib/cardContent';
import { formatFraction, formatPrice } from '../lib/format';
import { DPE_COLORS } from '../lib/labels';
import { useDesktop } from '../lib/desktop';
import { sortedPhotos } from '../lib/listings';
import { listingPath, PATHS } from '../lib/paths';
import { defaultDraft, filterChips, pricePerSquareMeter, type SearchDraft } from '../lib/search';
import { FiltersDialog, type DraftsByMode } from './FiltersDialog';
import { soonPath } from './account/Screens';
import { SavedSearchesList, useSearchCounts } from './account/SavedSearchesList';
import { EmptyState, Spinner } from './account/parts';
import { DesktopFavoritesPage } from './favorites/DesktopFavorites';
import { filterCount, matchingIds, removeWithUndo, useFavoriteCards } from './favorites/data';
import { FavoritesTabs } from './favorites/FavoritesTabs';
import '../styles/account.css';

// « Vos favoris » (Features/Favorites/FavoritesView.swift) : onglets Favoris et Recherches ; recherche, catégories,
// filtres et tri sur les biens mis en cœur. Les filtres s'appliquent directement aux favoris chargés (même moteur
// que la recherche), sans relancer une recherche complète. Ordinateur (≥ 1024 px) : DesktopFavoritesPage (maquette 4),
// avec les mêmes données (favorites/data.ts) ; en dessous, la page du téléphone ci-dessous, inchangée.

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
      <HeartIcon filled />
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
          <button type="button" className="missing-remove" onClick={() => removeWithUndo(id)}>Retirer</button>
        </div>
      ))}
    </div>
  );
}

/** `offline` : favoris du compte non lus (pas de connexion…) : « Pas de connexion Internet » à la place de l'état vide. */
function FavoritesContent({ items, offline = false }: { items: Favorite[]; offline?: boolean }) {
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
  const chips = activeDraft ? filterChips(activeDraft) : [];
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
        <div key="searches" className="favorites-searches fav-tab-panel">
          <SavedSearchesList embedded counts={counts} />
        </div>
      ) : items.length === 0 && offline ? (
        // Favoris du compte non lus : la coupure, pas « Aucun favori » (n° 54) ; « Réessayer » relit les favoris.
        <div key="offline" className="fav-tab-panel fav-empty-place-favorites">
          <OfflineState onRetry={() => void loadFavorites(true, true)} />
        </div>
      ) : items.length === 0 ? (
        // Aucun favori : ni recherche, ni filtres, ni catégories (ils reviennent avec le premier favori).
        <div key="empty" className="fav-tab-panel fav-empty-place-favorites">
          <FavoritesEmptyState kind="favorites" />
        </div>
      ) : (
        <div key="favorites" className="fav-tab-panel">
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

          {/* Une pastille (sauf « Tous ») choisit aussi la catégorie des filtres (n° 53). */}
          <ModeTabs includesAll mode={modeOfCategory(category)}
            onChange={(mode) => {
              setCategory(mode ? categoryOfMode(mode) : 'all');
              if (mode) setFilterMode(mode);
            }}
            className="mode-tabs-card favorites-categories" />

          {/* Filtres actifs (avec le lieu, que rien d'autre ne montre ici) : les retirer met à jour la liste. */}
          {chips.length > 0 && (
            <CriterionChipsRow chips={chips} className="favorites-criteria" onOpen={() => setFiltersOpen(true)}
              onRemove={(id) => {
                const chip = chips.find((entry) => entry.id === id);
                if (chip && activeDraft) setFilterDrafts({ ...filterDrafts, [filterMode]: chip.remove(activeDraft) });
              }} />
          )}

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
            {/* Fiches non lues : « Pas de connexion Internet » (n° 54) ; « Réessayer » les relit, avec la roue. */}
            {loaded.status === 'error' && <OfflineState onRetry={retry} />}
            {loaded.status === 'ready' && (
              cards.length === 0 && loaded.missing.length > 0 ? (
                <MissingCards ids={loaded.missing} />
              ) : cards.length === 0 ? (
                <FavoritesEmptyState kind="favorites" />
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
                    <FavoriteListingCard key={card.row.id} card={card} onRemove={() => removeWithUndo(card.row.id)} />
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
        </div>
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
  // Favoris du compte non lus : l'en-tête et les onglets restent, « Pas de connexion Internet » à la place de la liste.
  if (favorites.status === 'error') return <FavoritesContent items={[]} offline />;
  if (favorites.status !== 'ready') return <Spinner />;
  return <FavoritesContent items={favorites.items} />;
}

export function FavoritesPage() {
  const desktop = useDesktop();
  if (desktop) return <DesktopFavoritesPage />;
  return (
    <Page section="favorites">
      <div className="wrap favorites-wrap">
        <FavoritesBody />
      </div>
    </Page>
  );
}
