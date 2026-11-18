import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useToastShown } from '../components/AppToast';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { cardTag, ListingCard } from '../components/ListingCard';
import { CriterionChipsRow, FiltersButton } from '../components/CriterionChips';
import { ModeTabs } from '../components/ModeTabs';
import { PlaceField } from '../components/PlaceField';
import { ListingPhoto } from '../components/PhotoPager';
import { SearchNoResults } from '../components/SearchNoResults';
import { HeartButton } from '../components/account/HeartButton';
import { SaveSearchButton, SaveSearchSheet, useSavedSearchFor } from '../components/account/SaveSearchButton';
import type { MapFrame } from '../components/ResultsMap';

// Le moteur de carte est lourd : chargé à part, la liste s'affiche sans l'attendre.
const ResultsMap = lazy(() => import('../components/ResultsMap').then((m) => ({ default: m.ResultsMap })));
import { FiltersDialog } from './FiltersDialog';
import { requireAccount } from '../lib/account/gate';
import { saveSearch } from '../lib/account/savedSearches';
import { cardContent, formatCardPrice } from '../lib/cardContent';
import { useDesktop } from '../lib/desktop';
import { formatArea } from '../lib/format';
import { highlightsFor } from '../lib/highlights';
import type { SearchMode } from '../lib/labels';
import { sortedPhotos } from '../lib/listings';
import { listingPath, PATHS } from '../lib/paths';
import type { PlaceSuggestion } from '../lib/places';
import { recentlyViewedIds } from '../lib/recentlyViewed';
import {
  activeFilterCount, boxAround, chosenFromSuggestion, defaultDraft, draftFromParams, effectiveSort, filterChips, locationFor,
  paramsFromDraft, placeLabel, search, SORT_LABELS, sortOptions, type Result, type SearchDraft, type SortOrder,
  switchMode,
} from '../lib/search';
import { GOOD_YIELD, grossYieldText } from '../lib/cardContent';
import '../styles/recherche-app.css';

type Status = { kind: 'loading' } | { kind: 'ready'; results: Result[] } | { kind: 'error' };

function readDraft(): SearchDraft {
  return draftFromParams(new URLSearchParams(window.location.search));
}

/** « vue=carte » : la carte plein écran est ouverte (gardée au retour d'une annonce), sur téléphone comme sur ordinateur. */
function readMapOpen(): boolean {
  return new URLSearchParams(window.location.search).get('vue') === 'carte';
}

function pageQuery(draft: SearchDraft, mapOpen: boolean): string {
  const params = paramsFromDraft(draft);
  if (mapOpen) params.set('vue', 'carte');
  return params.toString();
}

/** Entrées d'historique ajoutées par la page (critères appliqués) : « Retour » les saute toutes. */
function addedEntries(): number {
  const state = window.history.state as { searchDepth?: unknown } | null;
  return typeof state?.searchDepth === 'number' ? state.searchDepth : 0;
}

/**
 * « Retour » de la ligne du haut (BackButton de l'app, qui referme Votre recherche) : la page d'où l'on vient sur le
 * site, avant les critères changés ici ; arrivé d'ailleurs, le lien mène à l'accueil.
 */
function leaveSearch(event: MouseEvent<HTMLAnchorElement>) {
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    const steps = addedEntries() + 1;
    if (referrer && referrer.origin === window.location.origin && window.history.length > steps) {
      event.preventDefault();
      window.history.go(-steps);
    }
  } catch {
    // Adresse précédente illisible : l'accueil.
  }
}

function countLabel(count: number, mode: SearchMode): string {
  const noun = mode === 'invest' ? 'opportunité' : 'annonce';
  if (count === 0) return `Aucune ${noun}`;
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

/** La liste montre les 100 premiers biens, comme l'app ; la carte les montre tous. */
const LIST_LIMIT = 100;

/** Aperçu du bien choisi sur la carte (MapPropertyPreviewCard de l'app). */
function MapPreview({ result, mode, onClose }: { result: Result; mode: SearchMode; onClose: () => void }) {
  const { row, highlights } = result;
  const content = cardContent(row, mode, highlights);
  const price = formatCardPrice(content.price);
  const isLeased = (row.rental_info as { isLeased?: boolean } | null)?.isLeased === true;
  return (
    <div className="map-preview">
      <a className="map-preview-link" href={listingPath(row.id, mode)}>
        <span className="map-preview-photo"><ListingPhoto photo={sortedPhotos(row)[0]} /></span>
        <span className="map-preview-text">
          {highlights ? (
            <span className={`map-preview-chip yield ${highlights.grossYield >= GOOD_YIELD ? 'tone-positive' : 'tone-caution'}`}>
              {grossYieldText(highlights)}
            </span>
          ) : (
            <span className="map-preview-chip">{cardTag(content.kind, isLeased)}</span>
          )}
          <span className="map-preview-title">{row.title}</span>
          <span className="map-preview-place">{row.city} · {formatArea(Number(row.living_area))}</span>
          <span className="map-preview-price">{price.amount}{price.suffix && <small>{price.suffix}</small>}</span>
        </span>
      </a>
      <HeartButton listingId={row.id} className="heart-inline" />
      <button type="button" className="map-preview-close" aria-label="Fermer l’aperçu" onClick={onClose}>
        <Icon name="x" />
      </button>
    </div>
  );
}

export function SearchPage() {
  const desktop = useDesktop();
  const [draft, setDraft] = useState<SearchDraft>(readDraft);
  const [placeText, setPlaceText] = useState(draft.place);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(readMapOpen);
  const mapOpenRef = useRef(mapOpen);
  mapOpenRef.current = mapOpen;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  /** Saisie du lieu en cours (téléphone) : le bouton « Carte » s'efface. */
  const [editingPlace, setEditingPlace] = useState(false);
  /** Fiches déjà ouvertes (« Déjà vue »), relues au retour sur la page. */
  const [seen, setSeen] = useState<Set<string>>(() => new Set(recentlyViewedIds()));
  const [frame, setFrame] = useState<MapFrame>({ token: 0, box: null, points: [] });
  const [attempt, setAttempt] = useState(0);
  const toastShown = useToastShown();
  const savedSearch = useSavedSearchFor(draft);
  /** Derniers critères de chaque mode, repris quand on y revient (comme l'app). */
  const byMode = useRef<Partial<Record<SearchMode, SearchDraft>>>({});
  const key = paramsFromDraft(draft).toString();

  /** Applique une recherche : adresse de la page (bouton Retour du navigateur), puis résultats. */
  const apply = useCallback((next: SearchDraft) => {
    setDraft(next);
    setPlaceText(next.place);
    const query = pageQuery(next, mapOpenRef.current);
    if (query !== window.location.search.slice(1)) window.history.pushState({ searchDepth: addedEntries() + 1 }, '', `?${query}`);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const next = readDraft();
      setDraft(next);
      setPlaceText(next.place);
      setMapOpen(readMapOpen());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Retour d'une fiche par « Précédent » (page gardée par le navigateur) : « Déjà vue » sur la fiche qu'on vient d'ouvrir.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) setSeen(new Set(recentlyViewedIds())); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: 'loading' });
    setSelectedId(null);
    search(draft, (row) => highlightsFor(row, draft.mode === 'invest' ? draft.downPayment : null))
      .then((results) => {
        if (cancelled) return;
        setStatus({ kind: 'ready', results });
        const location = locationFor(draft);
        const box = location.kind === 'area' ? location.box
          : location.kind === 'around' ? boxAround(location.center, location.radiusMeters) : null;
        const points = results.flatMap(({ row }) => (row.public_latitude === null || row.public_longitude === null ? []
          : [{ latitude: Number(row.public_latitude), longitude: Number(row.public_longitude) }]));
        setFrame((f) => ({ token: f.token + 1, box: points.length || box ? box : null, points }));
      })
      .catch(() => { if (!cancelled) setStatus({ kind: 'error' }); });
    return () => { cancelled = true; };
  }, [key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const label = placeLabel(draft);
    document.title = `${label ? `${label} · ` : ''}Rechercher un bien · Nidalo`;
  }, [draft]);

  // L'adresse suit la carte ouverte (sans nouvelle entrée d'historique), pour la retrouver au retour d'une annonce.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if ((params.get('vue') === 'carte') === mapOpen) return;
    if (mapOpen) params.set('vue', 'carte');
    else params.delete('vue');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', query ? `?${query}` : window.location.pathname);
  }, [mapOpen]);

  // La carte en plein écran se ferme avec Échap (pas celui qui referme les suggestions de lieu ou les filtres).
  useEffect(() => {
    if (!mapOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog[open]')) setMapOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('map-is-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('map-is-open');
    };
  }, [mapOpen]);

  const results = status.kind === 'ready' ? status.results : [];
  const selected = useMemo(() => results.find((r) => r.row.id === selectedId) ?? null, [results, selectedId]);
  const chips = filterChips(draft);
  const filterCount = activeFilterCount(draft);
  const sort = effectiveSort(draft);
  /** En-tête des résultats (nombre, tri, « Enregistrer ») : pendant la recherche et avec des annonces, comme l'app. */
  const showsHeader = status.kind === 'loading' || results.length > 0;
  const statusText = status.kind === 'loading' ? 'Recherche…' : status.kind === 'error' ? 'Recherche impossible' : countLabel(results.length, draft.mode);
  /** Bouton « Carte » : avec des annonces, hors saisie du lieu et sans message en bas de l'écran. */
  const showsMapButton = results.length > 0 && !editingPlace && !toastShown;

  // Un lieu choisi ou saisi remplace la zone dessinée (comme l'app) ; un champ vidé la garde.
  function choosePlace(place: PlaceSuggestion) {
    const chosen = chosenFromSuggestion(place);
    apply({ ...draft, place: chosen.name, area: null, drawnZone: null, chosen });
  }

  function submitPlace() {
    const text = placeText.trim();
    apply({
      ...draft, place: text, area: null, drawnZone: text ? null : draft.drawnZone,
      chosen: draft.chosen && draft.chosen.name === text ? draft.chosen : null,
    });
  }

  const openSave = () => void requireAccount(() => setSaveOpen(true));

  const placeField = (app: boolean) => (
    <PlaceField
      variant={app ? 'app' : 'search'}
      label="Lieu de la recherche"
      placeholder={app ? 'Ville, quartier, code postal…' : undefined}
      clearLabel={app ? 'Effacer la localisation' : undefined}
      // Une grande ville est cherchée avec ses alentours : le champ le dit hors saisie (« Lyon et alentours »), comme
      // « Zone dessinée » quand une zone remplace le lieu.
      idleText={app && placeText.trim() === draft.place.trim() ? placeLabel(draft) || undefined : undefined}
      onFocusChange={app ? setEditingPlace : undefined}
      shortcuts
      value={placeText}
      onChange={(text) => {
        setPlaceText(text);
        if (!text.trim() && draft.place) apply({ ...draft, place: '', chosen: null, area: null });
      }}
      onChoose={choosePlace}
      onSubmit={submitPlace}
    />
  );

  return (
    <Page section="search" wide>
      <div className="search-layout">
        <div className="search-column">
          {/* Téléphone : une seule ligne en haut, qui ne défile pas : retour, lieu, filtres (SearchPlaceField). */}
          {!desktop && (
            <div className="search-app-top">
              <a className="search-back" href={PATHS.home} onClick={leaveSearch} aria-label="Retour">
                <span className="search-back-circle"><Icon name="arrowLeft" /></span>
              </a>
              {placeField(true)}
              <FiltersButton count={filterCount} onClick={() => setFiltersOpen(true)} />
            </div>
          )}
          <div className="search-head">
            <h1 className={desktop ? undefined : 'visually-hidden'}>Votre recherche</h1>
            {desktop && <p className="search-sub">Trouvez le bien adapté à votre projet</p>}
            <ModeTabs mode={draft.mode} onChange={(mode) => {
              if (mode === draft.mode) return;
              byMode.current[draft.mode] = draft;
              apply(switchMode(draft, mode, byMode.current[mode]));
            }} className="mode-tabs-search" />
            {desktop && (
              <>
                <div className="search-place-row">
                  {placeField(false)}
                  <button type="button" className="filters-button" onClick={() => setFiltersOpen(true)} aria-label={`Filtres${filterCount ? `, ${filterCount} actifs` : ''}`}>
                    <Icon name="sliders" />
                    {filterCount > 0 && <span className="filters-count" aria-hidden="true">{filterCount}</span>}
                  </button>
                </div>
                {placeLabel(draft) && <p className="search-place-label"><Icon name="pin" />{placeLabel(draft)}</p>}
              </>
            )}
            {/* Critères actifs : le libellé ouvre les filtres, la croix retire le critère. */}
            <div className="chips-row">
              <CriterionChipsRow chips={chips} onOpen={() => setFiltersOpen(true)}
                onRemove={(id) => {
                  const chip = chips.find((c) => c.id === id);
                  if (chip) apply(chip.remove(draft));
                }} />
            </div>
          </div>

          <p className="visually-hidden" aria-live="polite">{statusText}</p>
          {showsHeader && (
            <div className="results-head">
              <div className="results-count">
                <h2>{statusText}</h2>
                {/* « Triées par pertinence » et son chevron ; le menu natif, transparent, les couvre. */}
                <label className="sort-select">
                  <span aria-hidden="true">Triées par {SORT_LABELS[sort].toLowerCase()}</span>
                  <Icon name="chevronDown" />
                  <select aria-label="Tri" value={sort} onChange={(event) => apply({ ...draft, sort: event.target.value as SortOrder })}>
                    {sortOptions(draft.mode).map((option) => <option key={option} value={option}>{SORT_LABELS[option]}</option>)}
                  </select>
                </label>
              </div>
              <SaveSearchButton saved={savedSearch !== null} onOpen={openSave} />
              {/* Ordinateur : la bascule « liste / carte » de l'app (ViewModeToggle de SearchView) ; la carte s'ouvre en
                  plein écran, comme le bouton « Carte » du téléphone (masquée sur téléphone). */}
              <div className="view-toggle" role="group" aria-label="Affichage des résultats">
                <span className="view-toggle-item is-current">
                  <Icon name="layoutGrid" title="Liste, sélectionnée" />
                </span>
                <button type="button" className="view-toggle-item" onClick={() => setMapOpen(true)} aria-label="Afficher sur la carte" title="Afficher sur la carte">
                  <Icon name="map" />
                </button>
              </div>
            </div>
          )}

          {status.kind === 'loading' && (
            <div className="results-list" aria-hidden="true">
              {[0, 1].map((i) => <div key={i} className="card listing-card skeleton-card"><div className="skeleton photo-skeleton" /><div className="skeleton line" /><div className="skeleton line short" /></div>)}
            </div>
          )}
          {status.kind === 'error' && (
            <div className="card state">
              <Icon name="triangleAlert" />
              <h3>La recherche n’a pas pu se faire</h3>
              <p>Vérifiez votre connexion à internet, puis réessayez.</p>
              <button type="button" className="btn btn-primary" onClick={() => setAttempt((a) => a + 1)}>Réessayer</button>
            </div>
          )}
          {status.kind === 'ready' && results.length === 0 && (
            <SearchNoResults
              draft={draft}
              savedSearch={savedSearch}
              onApply={apply}
              onAlert={openSave}
              onEnableAlert={(item) => { void saveSearch({ ...item, alerts_enabled: true }); }}
              onClear={() => apply(defaultDraft(draft.mode))}
            />
          )}
          {status.kind === 'ready' && results.length > 0 && (
            <div className="results-list">
              {results.slice(0, LIST_LIMIT).map(({ row, highlights }) => (
                <ListingCard key={row.id} row={row} content={cardContent(row, draft.mode, highlights)}
                  selected={row.id === selectedId} onHover={setHoveredId} headingLevel="h3" showsBadge alreadySeen={seen.has(row.id)} />
              ))}
            </div>
          )}
        </div>

        <div className={`map-column${mapOpen ? ' is-open' : ''}`} aria-hidden={undefined}>
          {/* Téléphone : la ligne du haut de la carte de l'app (MapTabView), sans catégories ni critères : retour (vers la
              liste), lieu, filtres et leur nombre. */}
          {!desktop && (
            <div className="map-app-top">
              <button type="button" className="map-back" aria-label="Retour" onClick={() => setMapOpen(false)}>
                <Icon name="arrowLeft" />
              </button>
              {placeField(true)}
              <FiltersButton count={filterCount} floating onClick={() => setFiltersOpen(true)} />
            </div>
          )}
          <Suspense fallback={<div className="results-map" aria-busy="true" />}>
            <ResultsMap
              results={results}
              showsYield={draft.mode === 'invest'}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={setSelectedId}
              frame={frame}
            />
          </Suspense>
          {selected && <MapPreview result={selected} mode={draft.mode} onClose={() => setSelectedId(null)} />}
          {desktop && (
            <button type="button" className="map-close btn btn-primary" onClick={() => setMapOpen(false)}>
              <Icon name="list" />
              Liste
            </button>
          )}
        </div>
      </div>

      {/* Téléphone : capsule bleu marine flottante, 14 au-dessus de la barre d'onglets. */}
      <button type="button" className={`map-open${showsMapButton ? '' : ' is-hidden'}`} onClick={() => setMapOpen(true)}
        aria-label="Afficher sur la carte" aria-hidden={showsMapButton ? undefined : true} tabIndex={showsMapButton ? undefined : -1}>
        <Icon name="map" />
        Carte
      </button>

      <SaveSearchSheet open={saveOpen} draft={draft} onClose={() => setSaveOpen(false)} />

      <FiltersDialog
        open={filtersOpen}
        draft={draft}
        remembered={byMode.current}
        onClose={() => setFiltersOpen(false)}
        onApply={(next, drafts) => {
          setFiltersOpen(false);
          Object.assign(byMode.current, drafts);
          apply(next);
        }}
        // Ouverts depuis la carte, pas de « Voir sur la carte » (comme l'app).
        onShowMap={mapOpen ? undefined : (next, drafts) => {
          setFiltersOpen(false);
          Object.assign(byMode.current, drafts);
          apply(next);
          setMapOpen(true);
        }}
      />
    </Page>
  );
}
