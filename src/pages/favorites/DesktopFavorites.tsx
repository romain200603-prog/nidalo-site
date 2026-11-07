import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Page } from '../../components/Layout';
import { PhotoPager } from '../../components/PhotoPager';
import { HeartIcon } from '../../components/account/HeartButton';
import { SignInCard } from '../../components/account/SignInCard';
import { isNewAccount } from '../../lib/account/auth';
import {
  categoryIncludes, categoryOfMode, FAVORITE_CATEGORIES, FAVORITE_SORTS, favoriteDetails, favoriteSuggestions,
  matchesText, modeOfCategory, savedCountText, sortFavorites, type FavoriteCard, type FavoriteCategory, type FavoriteSort,
} from '../../lib/account/favoriteCards';
import { loadFavorites, removeFavorite, useFavorites, type Favorite } from '../../lib/account/favorites';
import { loadSavedSearches, savedSearchesStore } from '../../lib/account/savedSearches';
import { useSession, useStore } from '../../lib/account/session';
import { formatCardPrice, GOOD_YIELD } from '../../lib/cardContent';
import { compareState, compareToast, fillCompareIfEmpty, toggleCompare, useCompare } from '../../lib/compare';
import { formatFraction, formatPrice } from '../../lib/format';
import { DPE_COLORS } from '../../lib/labels';
import { sortedPhotos } from '../../lib/listings';
import { comparePath, listingPath, PATHS } from '../../lib/paths';
import { defaultDraft, pricePerSquareMeter, type SearchDraft } from '../../lib/search';
import { FiltersDialog, type DraftsByMode } from '../FiltersDialog';
import { SavedSearchesList, useSearchCounts } from '../account/SavedSearchesList';
import { EmptyState, Spinner } from '../account/parts';
import { filterCount, matchingIds, useFavoriteCards } from './data';

// « Vos favoris » sur ordinateur (maquette 4 de Romain), avec le contenu et les actions de l'app
// (Features/Favorites/FavoritesView.swift) : titre, bouton rond Comparer avec son nombre, onglets Favoris et
// Recherches ; recherche, filtres, catégories, nombre et tri, puis les favoris en grille de 3 (photo de 220 px).
// Mêmes données et mêmes fonctions que la page du téléphone (favorites/data.ts, lib/account) ; rien d'autre n'est
// envoyé au serveur.

type Tab = 'favorites' | 'searches';

/** Toast de la comparaison (CompareToast de l'app) : texte, et « Voir » ou « Gérer » qui ouvre Comparer. */
type CompareNotice = { id: number; text: string; action: string | null };

/** Carte d'un favori : photo (rendement, cœur, Comparer, compteur), titre, infos clés, prix, prix au m², DPE. */
function FavoriteCardView({ card, compared, onRemove, onCompare }: {
  card: FavoriteCard;
  compared: boolean;
  onRemove: () => void;
  onCompare: () => void;
}) {
  const { row, content, grossYield } = card;
  const photos = sortedPhotos(row).slice(0, 10);
  const [page, setPage] = useState(0);
  const price = formatCardPrice(content.price);
  const perMeter = row.transaction === 'sale' ? pricePerSquareMeter(row) : null;
  const energy = row.energy_class && DPE_COLORS[row.energy_class] ? row.energy_class : null;
  const href = listingPath(row.id, content.kind === 'investment' ? 'invest' : null);
  const compareLabel = compared ? 'Retirer de la comparaison' : 'Ajouter à la comparaison';
  return (
    <article className="dfav-card">
      <div className="dfav-photo">
        {photos.length === 0 ? (
          <div className="dfav-no-photo">
            <Icon name="image" />
            <span>Pas encore de photo</span>
          </div>
        ) : (
          <PhotoPager photos={photos} label={row.title} showsDots={false} onPageChange={setPage} />
        )}
        {grossYield !== null && (
          // Couleur de l'app : verte à partir de 7 %, orange en dessous (pastille blanche des cartes de l'accueil).
          <span className={`dfav-yield ${grossYield >= GOOD_YIELD ? 'is-good' : 'is-low'}`}>
            <Icon name="trend" />
            <span className="visually-hidden">Rendement brut </span>
            {formatFraction(grossYield)}
          </span>
        )}
        <div className="dfav-actions">
          <button type="button" className="dfav-round dfav-heart" aria-label="Retirer des favoris" title="Retirer des favoris" onClick={onRemove}>
            <HeartIcon filled />
          </button>
          <button
            type="button"
            className={`dfav-round dfav-card-compare${compared ? ' is-active' : ''}`}
            aria-pressed={compared}
            aria-label={compareLabel}
            title={compareLabel}
            onClick={onCompare}
          >
            <Icon name="columns" />
          </button>
        </div>
        {photos.length > 1 && (
          <span className="dfav-counter" aria-hidden="true">
            <Icon name="camera" />
            {page + 1}/{photos.length}
          </span>
        )}
      </div>
      <div className="dfav-body">
        <h2 className="dfav-title"><a className="stretched" href={href}>{row.title}</a></h2>
        <p className="dfav-details">
          <Icon name="pin" />
          <span>{favoriteDetails(row, content.kind)}</span>
        </p>
        <div className="dfav-price-row">
          <p className="dfav-price">
            <strong>{price.amount}</strong>
            {price.suffix && <span>{price.suffix}</span>}
          </p>
          {perMeter !== null && <span className="dfav-per-meter">{formatPrice(perMeter)}/m²</span>}
          {energy && (
            <span className="dfav-dpe">
              <span aria-hidden="true">DPE</span>
              <span className="dfav-dpe-letter" style={{ background: DPE_COLORS[energy] }} aria-hidden="true">{energy}</span>
              <span className="visually-hidden">DPE {energy}</span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/** Annonce retirée par son vendeur : elle ne s'ouvre plus, on peut retirer le favori. */
function MissingCard({ id }: { id: string }) {
  return (
    <div className="dfav-missing">
      <span className="dfav-missing-icon"><Icon name="house" /></span>
      <span className="dfav-missing-title">Annonce plus disponible</span>
      <span className="dfav-missing-text">Le vendeur l&apos;a retirée, vendue ou louée.</span>
      <button type="button" className="dfav-missing-remove" onClick={() => void removeFavorite(id)}>Retirer</button>
    </div>
  );
}

function DesktopFavorites({ items }: { items: Favorite[] }) {
  const [loaded, retry] = useFavoriteCards(items);
  const searches = useStore(savedSearchesStore);
  const searchItems = searches.status === 'ready' ? searches.items : [];
  const counts = useSearchCounts(searchItems);
  const hasNews = searchItems.some((item) => (counts[item.id]?.news ?? 0) > 0);
  const compare = useCompare();
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get('onglet') === 'recherches' ? 'searches' : 'favorites'));
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [category, setCategory] = useState<FavoriteCategory>('all');
  const [sort, setSort] = useState<FavoriteSort>('relevance');
  const [filterDrafts, setFilterDrafts] = useState<DraftsByMode>({});
  const [filterMode, setFilterMode] = useState<SearchDraft['mode']>('buy');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notice, setNotice] = useState<CompareNotice | null>(null);

  useEffect(() => {
    void loadSavedSearches();
  }, []);

  // Le toast reste 4 secondes, comme dans l'app.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function changeTab(next: Tab) {
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
  const compareCount = compare.ids.length;
  const compareLabel = compareCount > 0 ? `Comparer, ${compareCount} bien${compareCount > 1 ? 's' : ''}` : 'Comparer vos favoris';

  function showAll() {
    setQuery('');
    setCategory('all');
    setFilterDrafts({});
  }

  /** Bouton rond : une comparaison vide reprend les trois premiers favoris (dans l'ordre du tri), puis Comparer s'ouvre. */
  function openCompare() {
    fillCompareIfEmpty(sortFavorites(cards, sort, addedAt).map((card) => card.row.id));
    window.location.assign(comparePath());
  }

  /** Bouton Comparer d'une carte (CompareButton de l'app) : ajoute ou retire, puis le toast. */
  function toggleCompared(id: string) {
    const message = compareToast(toggleCompare(id), compareState().ids.length);
    if (message) setNotice({ id: Date.now(), ...message });
  }

  let list;
  if (loaded.status === 'loading') {
    list = <Spinner />;
  } else if (loaded.status === 'error') {
    list = (
      <EmptyState
        icon="triangleAlert"
        title="Vos favoris n'ont pas pu être chargés"
        text={loaded.message}
        action={<button type="button" className="btn btn-light" onClick={retry}>Réessayer</button>}
      />
    );
  } else if (cards.length === 0 && loaded.missing.length > 0) {
    list = <div className="dfav-grid">{loaded.missing.map((id) => <MissingCard key={id} id={id} />)}</div>;
  } else if (cards.length === 0) {
    list = (
      <EmptyState
        icon="heart"
        title="Aucun favori pour l'instant"
        text="Touchez le cœur d'une annonce pour la retrouver ici et la comparer."
        action={<a className="btn btn-primary dfav-empty-button" href={PATHS.search}>Rechercher un bien</a>}
      />
    );
  } else if (shown.length === 0) {
    list = (
      <EmptyState
        icon="search"
        title="Aucun favori ne correspond"
        text="Modifiez la recherche, la catégorie ou les filtres."
        action={<button type="button" className="link-button" onClick={showAll}>Tout afficher</button>}
      />
    );
  } else {
    list = (
      <div className="dfav-grid">
        {shown.map((card) => (
          <FavoriteCardView
            key={card.row.id}
            card={card}
            compared={compare.ids.includes(card.row.id)}
            onRemove={() => void removeFavorite(card.row.id)}
            onCompare={() => toggleCompared(card.row.id)}
          />
        ))}
        {loaded.missing.map((id) => <MissingCard key={id} id={id} />)}
      </div>
    );
  }

  return (
    <div className="dfav">
      <div className="dfav-inner">
        <div className="dfav-head">
          <div className="dfav-titles">
            <h1>Vos favoris</h1>
            <p>Retrouvez vos biens favoris et vos recherches</p>
          </div>
          <button
            type="button"
            className="dfav-compare"
            aria-label={compareLabel}
            title={compareLabel}
            disabled={cards.length === 0 && compareCount === 0}
            onClick={openCompare}
          >
            <Icon name="columns" />
            {compareCount > 0 && <span className="dfav-compare-count" aria-hidden="true">{compareCount}</span>}
          </button>
        </div>

        <div className="dfav-tabs" role="group" aria-label="Favoris ou recherches">
          <button type="button" aria-pressed={tab === 'favorites'} className={`dfav-tab${tab === 'favorites' ? ' is-active' : ''}`} onClick={() => changeTab('favorites')}>
            <Icon name="heart" />Favoris
          </button>
          <button
            type="button"
            aria-pressed={tab === 'searches'}
            aria-label={`Recherches, ${searchItems.length}${hasNews ? ', nouveautés' : ''}`}
            className={`dfav-tab${tab === 'searches' ? ' is-active' : ''}`}
            onClick={() => changeTab('searches')}
          >
            <Icon name="search" />Recherches
            <span className="dfav-tab-count">({searchItems.length}){hasNews && <span className="dfav-dot" aria-hidden="true" />}</span>
          </button>
        </div>

        {tab === 'searches' ? (
          <div className="dfav-searches">
            <SavedSearchesList embedded counts={counts} />
          </div>
        ) : (
          <>
            <div className="dfav-tools">
              <div className="dfav-search">
                <div className="dfav-field">
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
                    <button type="button" className="dfav-clear" aria-label="Effacer la recherche" onClick={() => setQuery('')}>
                      <Icon name="x" />
                    </button>
                  )}
                </div>
                {suggestions.length > 0 && (
                  <ul className="dfav-suggestions" aria-label="Suggestions">
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
                          <span className="dfav-suggestion-text">
                            <span>{suggestion.value}</span>
                            <span className="dfav-suggestion-detail">{suggestion.detail}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                className={`dfav-filters${activeFilters > 0 ? ' is-active' : ''}`}
                aria-label={activeFilters > 0 ? `Filtres, ${activeFilters} actifs` : 'Filtres'}
                onClick={() => {
                  // Les filtres s'ouvrent sur la catégorie de la pastille active (« Tous » : Résidentiel).
                  setFilterMode(modeOfCategory(category) ?? 'buy');
                  setFiltersOpen(true);
                }}
              >
                <Icon name="sliders" />
                {activeFilters > 0 && <span className="dfav-filters-count" aria-hidden="true">{activeFilters}</span>}
              </button>
              <span className="dfav-divider" aria-hidden="true" />
              <div className="dfav-chips" role="group" aria-label="Catégories">
                {FAVORITE_CATEGORIES.map((entry) => (
                  <button
                    key={entry.category}
                    type="button"
                    aria-pressed={category === entry.category}
                    className={`dfav-chip${category === entry.category ? ' is-selected' : ''}`}
                    onClick={() => setCategory(entry.category)}
                  >
                    <Icon name={entry.icon} />{entry.title}
                  </button>
                ))}
              </div>
            </div>

            {cards.length > 0 && (
              <div className="dfav-toolbar">
                <Icon name="heart" />
                <span className="dfav-total" aria-live="polite">{savedCountText(shown.length, cards.length)}</span>
                <label className="dfav-sort">
                  <Icon name="arrowUpDown" />
                  <span aria-hidden="true">{sortTitle.short}</span>
                  <Icon name="chevronDown" />
                  <select aria-label="Trier par" value={sort} onChange={(event) => setSort(event.target.value as FavoriteSort)}>
                    {FAVORITE_SORTS.map((entry) => <option key={entry.sort} value={entry.sort}>{entry.title}</option>)}
                  </select>
                </label>
              </div>
            )}

            <div className="dfav-list">{list}</div>

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
      </div>

      <div className={`dfav-toast${notice ? ' is-shown' : ''}`} role="status" aria-live="polite">
        {notice && (
          <span key={notice.id} className="dfav-toast-box">
            <Icon name="columns" />
            <span className="dfav-toast-text">{notice.text}</span>
            {notice.action && <a href={comparePath()}>{notice.action}</a>}
          </span>
        )}
      </div>
    </div>
  );
}

function DesktopFavoritesBody() {
  const session = useSession();
  const favorites = useFavorites();
  if (session.status === 'signedOut') {
    // Sans compte : l'invitation à se connecter, la même qu'avant.
    return (
      <div className="wrap favorites-wrap">
        <div className="favorites-signin">
          <SignInCard onSignedIn={() => { if (isNewAccount()) window.location.assign(PATHS.account); }} />
        </div>
      </div>
    );
  }
  if (session.status === 'loading') return <div className="dfav"><div className="dfav-inner"><Spinner /></div></div>;
  if (favorites.status === 'error') {
    return (
      <div className="dfav">
        <div className="dfav-inner">
          <EmptyState
            icon="triangleAlert"
            title="Vos favoris n'ont pas pu être chargés"
            text="Vérifiez votre connexion, puis réessayez."
            action={<button type="button" className="btn btn-light" onClick={() => void loadFavorites(true)}>Réessayer</button>}
          />
        </div>
      </div>
    );
  }
  if (favorites.status !== 'ready') return <div className="dfav"><div className="dfav-inner"><Spinner /></div></div>;
  return <DesktopFavorites items={favorites.items} />;
}

export function DesktopFavoritesPage() {
  return (
    <Page section="favorites">
      <DesktopFavoritesBody />
    </Page>
  );
}
