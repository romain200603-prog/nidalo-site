import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { cardTag, ListingCard } from '../components/ListingCard';
import { ModeTabs } from '../components/ModeTabs';
import { PlaceField } from '../components/PlaceField';
import { ListingPhoto } from '../components/PhotoPager';
import { HeartButton } from '../components/account/HeartButton';
import { SaveSearchButton } from '../components/account/SaveSearchButton';
import type { MapFrame } from '../components/ResultsMap';

// Le moteur de carte est lourd : chargé à part, la liste s'affiche sans l'attendre.
const ResultsMap = lazy(() => import('../components/ResultsMap').then((m) => ({ default: m.ResultsMap })));
import { FiltersDialog } from './FiltersDialog';
import { cardContent, formatCardPrice } from '../lib/cardContent';
import { formatArea } from '../lib/format';
import { highlightsFor } from '../lib/highlights';
import type { SearchMode } from '../lib/labels';
import { sortedPhotos } from '../lib/listings';
import { listingPath } from '../lib/paths';
import { placeShortName, type PlaceSuggestion } from '../lib/places';
import {
  activeFilterCount, boxAround, defaultDraft, draftFromParams, effectiveSort, filterChips, locationFor, paramsFromDraft,
  placeLabel, search, SORT_LABELS, sortOptions, type Result, type SearchDraft, type SortOrder,
  switchMode,
} from '../lib/search';
import { GOOD_YIELD, grossYieldText } from '../lib/cardContent';

type Status = { kind: 'loading' } | { kind: 'ready'; results: Result[] } | { kind: 'error' };

function readDraft(): SearchDraft {
  return draftFromParams(new URLSearchParams(window.location.search));
}

/** « vue=carte » : la carte plein écran du téléphone est ouverte (gardée au retour d'une annonce). */
function readMapOpen(): boolean {
  return new URLSearchParams(window.location.search).get('vue') === 'carte';
}

function pageQuery(draft: SearchDraft, mapOpen: boolean): string {
  const params = paramsFromDraft(draft);
  if (mapOpen) params.set('vue', 'carte');
  return params.toString();
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
  const [draft, setDraft] = useState<SearchDraft>(readDraft);
  const [placeText, setPlaceText] = useState(draft.place);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(readMapOpen);
  const mapOpenRef = useRef(mapOpen);
  mapOpenRef.current = mapOpen;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [frame, setFrame] = useState<MapFrame>({ token: 0, box: null, points: [] });
  const [attempt, setAttempt] = useState(0);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  /** Derniers critères de chaque mode, repris quand on y revient (comme l'app). */
  const byMode = useRef<Partial<Record<SearchMode, SearchDraft>>>({});
  const key = paramsFromDraft(draft).toString();

  /** Applique une recherche : adresse de la page (bouton Retour du navigateur), puis résultats. */
  const apply = useCallback((next: SearchDraft) => {
    setDraft(next);
    setPlaceText(next.place);
    const query = pageQuery(next, mapOpenRef.current);
    if (query !== window.location.search.slice(1)) window.history.pushState(null, '', `?${query}`);
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
    document.title = `${draft.place ? `${placeLabel(draft)} · ` : ''}Rechercher un bien · Nidalo`;
  }, [draft]);

  // L'adresse suit la carte du téléphone (sans nouvelle entrée d'historique), pour la retrouver au retour d'une annonce.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if ((params.get('vue') === 'carte') === mapOpen) return;
    if (mapOpen) params.set('vue', 'carte');
    else params.delete('vue');
    const query = params.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  }, [mapOpen]);

  // La carte en plein écran (téléphone) se ferme avec Échap.
  useEffect(() => {
    if (!mapOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMapOpen(false); };
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

  function choosePlace(place: PlaceSuggestion) {
    const name = placeShortName(place);
    apply({ ...draft, place: name, area: null, chosen: { kind: place.kind, name, postalCode: place.postalCode, inseeCode: place.inseeCode, coordinate: place.coordinate } });
  }

  function submitPlace() {
    const text = placeText.trim();
    apply({ ...draft, place: text, area: null, chosen: draft.chosen && draft.chosen.name === text ? draft.chosen : null });
  }

  return (
    <Page section="search" wide>
      <div className="search-layout">
        <div className="search-column">
          <div className="search-head">
            <h1>Votre recherche</h1>
            <p className="search-sub">Trouvez le bien adapté à votre projet</p>
            <ModeTabs mode={draft.mode} onChange={(mode) => {
              if (mode === draft.mode) return;
              byMode.current[draft.mode] = draft;
              apply(switchMode(draft, mode, byMode.current[mode]));
            }} className="mode-tabs-search" />
            <div className="search-place-row">
              <PlaceField
                label="Lieu de la recherche"
                value={placeText}
                onChange={(text) => {
                  setPlaceText(text);
                  if (!text.trim() && draft.place) apply({ ...draft, place: '', chosen: null, area: null });
                }}
                onChoose={choosePlace}
                onSubmit={submitPlace}
              />
              <button type="button" className="filters-button" onClick={() => setFiltersOpen(true)} aria-label={`Filtres${filterCount ? `, ${filterCount} actifs` : ''}`}>
                <Icon name="sliders" />
                {filterCount > 0 && <span className="filters-count" aria-hidden="true">{filterCount}</span>}
              </button>
            </div>
            {draft.place && <p className="search-place-label"><Icon name="pin" />{placeLabel(draft)}</p>}
            <div className="chips-row" aria-label="Critères">
              {chips.map((chip) => (
                <button key={chip.id} type="button" className="filter-chip" onClick={() => apply(chip.remove(draft))}
                  aria-label={`Retirer le critère ${chip.label}`}>
                  {chip.label}
                  <Icon name="x" />
                </button>
              ))}
              <button type="button" className="filter-chip accent" onClick={() => setFiltersOpen(true)}>+ Filtres</button>
            </div>
          </div>

          <div className="results-head">
            <div>
              <h2 ref={resultsHeading} aria-live="polite">
                {status.kind === 'loading' ? 'Recherche…' : status.kind === 'error' ? 'Recherche impossible' : countLabel(results.length, draft.mode)}
              </h2>
              <label className="sort-select">
                <span>Triées par</span>
                <select value={sort} onChange={(event) => apply({ ...draft, sort: event.target.value as SortOrder })}>
                  {sortOptions(draft.mode).map((option) => <option key={option} value={option}>{SORT_LABELS[option].toLowerCase()}</option>)}
                </select>
                <Icon name="chevronDown" />
              </label>
            </div>
          </div>
          <SaveSearchButton draft={draft} />

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
            <div className="card state">
              <Icon name="search" />
              <h3>Aucun bien ne correspond à vos critères</h3>
              <p>Élargissez la zone ou retirez un critère pour voir plus d’annonces.</p>
              {(chips.length > 0 || draft.place) && (
                <button type="button" className="btn btn-light" onClick={() => apply(defaultDraft(draft.mode))}>Effacer les critères</button>
              )}
            </div>
          )}
          {status.kind === 'ready' && results.length > 0 && (
            <div className="results-list">
              {results.slice(0, LIST_LIMIT).map(({ row, highlights }) => (
                <ListingCard key={row.id} row={row} content={cardContent(row, draft.mode, highlights)}
                  selected={row.id === selectedId} onHover={setHoveredId} headingLevel="h3" />
              ))}
            </div>
          )}
        </div>

        <div className={`map-column${mapOpen ? ' is-open' : ''}`} aria-hidden={undefined}>
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
          <button type="button" className="map-close btn btn-primary" onClick={() => setMapOpen(false)}>
            <Icon name="list" />
            Liste
          </button>
        </div>
      </div>

      <button type="button" className="map-open btn btn-primary" onClick={() => setMapOpen(true)}>
        <Icon name="map" />
        Carte
      </button>

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
        onShowMap={(next, drafts) => {
          setFiltersOpen(false);
          Object.assign(byMode.current, drafts);
          apply(next);
          setMapOpen(true);
        }}
      />
    </Page>
  );
}
