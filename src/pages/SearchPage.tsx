import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { showToast, useToastShown } from '../components/AppToast';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { cardTag, ListingCard } from '../components/ListingCard';
import { CriterionChipsRow, FiltersButton } from '../components/CriterionChips';
import { ModeTabs } from '../components/ModeTabs';
import { MapBottomPanel } from '../components/MapBottomPanel';
import { LoadErrorState, OfflineState } from '../components/OfflineState';
import { PlaceField } from '../components/PlaceField';
import { ListingPhoto } from '../components/PhotoPager';
import { SearchNoResults } from '../components/SearchNoResults';
import { HeartButton } from '../components/account/HeartButton';
import { SaveSearchButton, SaveSearchSheet, useSavedSearchFor } from '../components/account/SaveSearchButton';
import {
  drawingInstruction, ZoneBanner, ZoneChip, zoneMenuItems, ZonePencil, zoneSession, ZoneToolPicker, ZoneValidationCard,
} from '../components/MapZone';
import type { DrawTool, MapFrame } from '../components/ResultsMap';

// Le moteur de carte est lourd : chargé à part, la liste s'affiche sans l'attendre.
const ResultsMap = lazy(() => import('../components/ResultsMap').then((m) => ({ default: m.ResultsMap })));
import { FiltersDialog } from './FiltersDialog';
import { requireAccount } from '../lib/account/gate';
import { saveSearch, type SavedSearch } from '../lib/account/savedSearches';
import { cardContent, cardLocation, formatCardPrice } from '../lib/cardContent';
import { useDesktop } from '../lib/desktop';
import { highlightsFor } from '../lib/highlights';
import type { SearchMode } from '../lib/labels';
import { sortedPhotos } from '../lib/listings';
import { listingPath, PATHS } from '../lib/paths';
import { canGrow, circle, distanceMeters, isUsable as isUsableZone, largestLoop, rounded, scaled, SCALE_STEP, simplified, smoothed } from '../lib/drawnZone';
import { sortedForMap, type MapPanelHeight, type MapSort } from '../lib/mapPanel';
import type { Coordinate, PlaceSuggestion } from '../lib/places';
import { isOfflineFailure, SEARCH_LOAD_ERROR } from '../lib/loadFailure';
import { recentlyViewedIds } from '../lib/recentlyViewed';
import {
  activeFilterCount, boxAround, chosenFromSuggestion, defaultDraft, draftFromParams, drawnZoneOf, effectiveSort, filterChips,
  locationFor, paramsFromDraft, placeLabel, search, SORT_LABELS, sortOptions, type BoundingBox, type Result, type SearchDraft,
  type SortOrder, switchMode,
} from '../lib/search';
import { GOOD_YIELD, grossYieldText } from '../lib/cardContent';
import '../styles/recherche-app.css';

/** `offline` : la demande n'a pas pu partir (LoadFailure.isOffline de l'app) : « Pas de connexion Internet ». */
type Failure = { offline: boolean };

/**
 * Zone dessinée en cours (MapTabView de l'app) : tracé, ou zone proposée à ajuster puis valider ; elle ne remplace le
 * lieu de la recherche qu'une fois validée.
 */
type ZoneEditing = { step: 'drawing' } | { step: 'proposal'; zone: Coordinate[]; title: string };

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

/**
 * La liste montre 100 biens, puis les 100 suivants quand sa fin approche (SearchView, dernière carte, n° 48) ; elle
 * repart des 100 premiers quand les critères ou le tri changent. La carte les montre tous, l'en-tête garde le total.
 */
const LIST_PAGE = 100;

/**
 * Fin de la liste : les biens suivants dès qu'elle approche de l'écran. Ils sont déjà lus (tous les résultats sont
 * en mémoire, pour la carte) : ils s'affichent aussitôt, sans la petite roue de l'app. Remonté à chaque page affichée,
 * l'observateur repart et relance la suite si la fin est encore visible.
 */
function ListEnd({ onReach }: { onReach: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const reach = useRef(onReach);
  reach.current = onReach;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      reach.current();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) reach.current();
    }, { rootMargin: '0px 0px 600px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="results-end" aria-hidden="true" />;
}

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
          <span className="map-preview-place">{cardLocation(row.city, content)}</span>
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
  /**
   * Biens de la dernière recherche réussie (SearchViewModel de l'app) : ils restent affichés pendant la recherche
   * suivante et ne changent qu'à son succès ; un échec les retire.
   */
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<Failure | null>(null);
  /** Panneau du bas de la carte du téléphone : sa hauteur et son tri (MapTabView de l'app, moyen au départ). */
  const [panelHeight, setPanelHeight] = useState<MapPanelHeight>('medium');
  const [mapSort, setMapSort] = useState<MapSort>('relevance');
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
  const [zoneEditing, setZoneEditing] = useState<ZoneEditing | null>(null);
  const [drawTool, setDrawTool] = useState<DrawTool>(() => zoneSession.drawTool);
  /** « Tracez une zone plus grande », 2 s, après un tracé trop petit. */
  const [drawHint, setDrawHint] = useState<string | null>(null);
  const drawHintTimer = useRef<number | undefined>(undefined);
  /** Biens de la zone proposée (le dernier calcul fini), pour la carte et « 6 biens dans cette zone ». */
  const [proposalFound, setProposalFound] = useState<{ zone: Coordinate[]; results: Result[] } | null>(null);
  /** Zone visible de la carte (« Zone autour du centre de la carte »). */
  const visibleArea = useRef<BoundingBox | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Biens montrés dans la liste (n° 48). */
  const [listCount, setListCount] = useState(LIST_PAGE);
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
      setZoneEditing(null);
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
    setLoading(true);
    search(draft, (row) => highlightsFor(row, draft.mode === 'invest' ? draft.downPayment : null))
      .then((found) => {
        if (cancelled) return;
        setResults(found);
        setFailure(null);
        setLoading(false);
        setListCount(LIST_PAGE);
        // Un bien sélectionné qui n'est plus dans les résultats ne l'est plus (MapTabView.load).
        setSelectedId((id) => (id !== null && found.some(({ row }) => row.id === id) ? id : null));
        const location = locationFor(draft);
        const box = location.kind === 'area' ? location.box
          : location.kind === 'around' ? boxAround(location.center, location.radiusMeters) : null;
        const points = found.flatMap(({ row }) => (row.public_latitude === null || row.public_longitude === null ? []
          : [{ latitude: Number(row.public_latitude), longitude: Number(row.public_longitude) }]));
        setFrame((f) => ({ token: f.token + 1, box: points.length || box ? box : null, points, zone: drawnZoneOf(draft) !== null }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResults([]);
        setSelectedId(null);
        setFailure({ offline: isOfflineFailure(error) });
        setLoading(false);
      });
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

  // Ajustement d'une zone : la même recherche avec la zone proposée à la place du lieu, 250 ms après le dernier − ou +
  // (le calcul en cours est abandonné) ; la carte n'est pas recadrée.
  const proposalZone = zoneEditing?.step === 'proposal' ? zoneEditing.zone : null;
  useEffect(() => {
    if (!proposalZone) {
      setProposalFound(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const next = { ...draft, place: '', chosen: null, area: null, drawnZone: proposalZone };
      search(next, (row) => highlightsFor(row, draft.mode === 'invest' ? draft.downPayment : null))
        .then((found) => { if (!cancelled) setProposalFound({ zone: proposalZone, results: found }); })
        .catch(() => { if (!cancelled) setProposalFound({ zone: proposalZone, results: [] }); });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [proposalZone, key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carte fermée : le tracé ou l'ajustement en cours s'arrête (la zone d'avant reste).
  useEffect(() => {
    if (!mapOpen) setZoneEditing(null);
  }, [mapOpen]);

  // Le bouton qui avait le focus a disparu (crayon qui change de forme, bandeau, carte de validation ou pastille
  // refermés) : le focus du clavier va au bouton « Voir les biens » pendant l'ajustement, au crayon sinon.
  const zonePosed = drawnZoneOf(draft) !== null;
  useEffect(() => {
    if (!mapOpen || (document.activeElement && document.activeElement !== document.body)) return;
    const target = zoneEditing?.step === 'proposal' ? '.map-column .zone-commit' : '.map-column .zone-pencil';
    document.querySelector<HTMLElement>(target)?.focus({ preventScroll: true });
  }, [zoneEditing?.step, zonePosed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => window.clearTimeout(drawHintTimer.current), []);

  const selected = useMemo(() => results.find((r) => r.row.id === selectedId) ?? null, [results, selectedId]);
  const chips = filterChips(draft);
  const filterCount = activeFilterCount(draft);
  const sort = effectiveSort(draft);
  /** En-tête des résultats (nombre, tri, « Enregistrer ») : pendant la recherche et avec des annonces, comme l'app. */
  // Comme l'app : l'en-tête des résultats (nombre, tri) seulement quand il y a des annonces.
  const showsHeader = results.length > 0;
  const countText = countLabel(results.length, draft.mode);
  const statusText = loading ? 'Recherche…' : failure ? 'Recherche impossible' : countText;
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

  // MARK: Zone dessinée (MapTabView de l'app)

  const postedZone = drawnZoneOf(draft);

  /** Crayon : le tracé ; pendant le tracé ou l'ajustement, il fait comme « Annuler ». */
  function startDrawing() {
    if (zoneEditing) {
      setZoneEditing(null);
      return;
    }
    setSelectedId(null);
    if (panelHeight === 'large') setPanelHeight('medium');
    setZoneEditing({ step: 'drawing' });
  }

  /** L'ajustement d'une zone : « Votre zone est tracée » après un tracé, « Ajustez votre zone » sinon. */
  function proposeZone(zone: Coordinate[], title: string) {
    setSelectedId(null);
    setZoneEditing({ step: 'proposal', zone: rounded(zone), title });
  }

  /** Tracé trop petit : on reste en mode tracé, le bandeau le dit pendant 2 s. */
  function showTooSmall() {
    setDrawHint('Tracez une zone plus grande');
    window.clearTimeout(drawHintTimer.current);
    drawHintTimer.current = window.setTimeout(() => setDrawHint(null), 2000);
  }

  /** Tracé fini : la plus grande boucle, lissée (deux passes de Chaikin), puis simplifiée (60 points au plus). */
  function finishDrawing(trace: Coordinate[]) {
    const zone = simplified(smoothed(largestLoop(trace)));
    if (!isUsableZone(zone) || !isUsableZone(rounded(zone))) {
      showTooSmall();
      return;
    }
    proposeZone(zone, 'Votre zone est tracée');
  }

  /** « Zone autour du centre de la carte » : un cercle au centre, de rayon le quart de la largeur visible. */
  function zoneAroundMapCenter() {
    const area = visibleArea.current;
    if (!area) return;
    const [west, south, east, north] = area;
    const center = { latitude: (south + north) / 2, longitude: (west + east) / 2 };
    const width = distanceMeters({ latitude: center.latitude, longitude: west }, { latitude: center.latitude, longitude: east });
    proposeZone(circle(center, width / 4), 'Votre zone est tracée');
  }

  /** « Voir les biens » : la zone remplace le lieu, la recherche se relance. */
  function commitZone(zone: Coordinate[]) {
    setZoneEditing(null);
    apply({ ...draft, place: '', chosen: null, area: null, drawnZone: zone });
  }

  function clearZone() {
    apply({ ...draft, drawnZone: null });
  }

  /**
   * Toucher d'un marqueur sur le téléphone (MapTabView.tap) : il sélectionne le bien, centre la carte sur lui et ramène
   * le panneau en hauteur moyenne sur sa fiche ; un second toucher sur le même marqueur ouvre l'annonce.
   */
  function tapMarker(id: string, center: () => void) {
    if (id === selectedId && panelHeight !== 'compact') {
      const result = results.find(({ row }) => row.id === id);
      if (result) window.location.assign(listingPath(id, cardContent(result.row, draft.mode, result.highlights).kind === 'investment' ? 'invest' : null));
      return;
    }
    setSelectedId(id);
    if (panelHeight !== 'medium') setPanelHeight('medium');
    center();
  }

  /** « Activer l'alerte » : un échec (pas de réseau…) donne son message en bas de l'écran (n° 167). */
  function enableAlert(item: SavedSearch) {
    void saveSearch({ ...item, alerts_enabled: true }).then((failure) => {
      if (failure) showToast({ icon: 'info', text: failure });
    });
  }

  const zoneMenu = postedZone ? zoneMenuItems({
    saved: savedSearch,
    onRedraw: startDrawing,
    onAdjust: () => proposeZone(postedZone, 'Ajustez votre zone'),
    onCreateAlert: openSave,
    onEnableAlert: (item) => void requireAccount(() => enableAlert(item)),
    onClear: clearZone,
  }) : null;
  const proposalLoading = proposalZone !== null && proposalFound?.zone !== proposalZone;
  /** Biens montrés sur la carte : pendant l'ajustement, ceux de la zone proposée (les précédents jusqu'au calcul fini). */
  const mapResults = proposalZone ? (proposalFound?.results ?? results) : results;

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
                <h2>{countText}</h2>
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

          {/* Chargement sans bien à montrer : la roue grise de l'app (ProgressView), 32 sous les critères ; avec des biens,
              ils restent jusqu'aux suivants. « Recherche… » pour les lecteurs d'écran (ligne cachée au-dessus). */}
          {loading && results.length === 0 && <div className="search-loading" aria-hidden="true"><span className="spinner" /></div>}
          {/* Échec : « Pas de connexion Internet » sans réseau, sinon « Erreur » et le texte de l'app (SearchViewModel). */}
          {!loading && failure && (failure.offline
            ? <OfflineState onRetry={() => setAttempt((a) => a + 1)} className="search-failure" />
            : <LoadErrorState title="Erreur" message={SEARCH_LOAD_ERROR} onRetry={() => setAttempt((a) => a + 1)} className="search-failure" />)}
          {!loading && !failure && results.length === 0 && (
            <SearchNoResults
              draft={draft}
              savedSearch={savedSearch}
              onApply={apply}
              onAlert={openSave}
              onEnableAlert={enableAlert}
              onClear={() => apply(defaultDraft(draft.mode))}
            />
          )}
          {results.length > 0 && (
            <>
              <div className="results-list">
                {results.slice(0, listCount).map(({ row, highlights }) => (
                  <ListingCard key={row.id} row={row} content={cardContent(row, draft.mode, highlights)}
                    selected={row.id === selectedId} onHover={setHoveredId} headingLevel="h3" showsBadge alreadySeen={seen.has(row.id)} />
                ))}
              </div>
              {results.length > listCount && <ListEnd key={listCount} onReach={() => setListCount((count) => count + LIST_PAGE)} />}
            </>
          )}
        </div>

        <div className={`map-column${mapOpen ? ' is-open' : ''}${zoneEditing ? ` is-editing-zone is-zone-${zoneEditing.step}` : postedZone ? ' has-zone' : ''}${!desktop && panelHeight === 'large' && !zoneEditing ? ' is-panel-large' : ''}${editingPlace ? ' is-editing-place' : ''}`}
          aria-hidden={undefined}>
          {/* Téléphone : la ligne du haut de la carte de l'app (MapTabView), sans catégories ni critères : retour (vers la
              liste), lieu, filtres et leur nombre. Pendant le tracé ou l'ajustement, le bandeau de la zone la remplace. */}
          {!desktop && !zoneEditing && (
            <div className="map-app-top">
              <button type="button" className="map-back" aria-label="Retour" onClick={() => setMapOpen(false)}>
                <Icon name="arrowLeft" />
              </button>
              {placeField(true)}
              <FiltersButton count={filterCount} floating onClick={() => setFiltersOpen(true)} />
            </div>
          )}
          {!zoneEditing && postedZone && <ZoneChip onOpen={() => setFiltersOpen(true)} onRemove={clearZone} />}
          <Suspense fallback={<div className="results-map" aria-busy="true" />}>
            <ResultsMap
              results={mapResults}
              showsYield={draft.mode === 'invest'}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={setSelectedId}
              frame={frame}
              // Pendant le tracé, l'ancienne zone n'est plus affichée ; pendant l'ajustement, la zone proposée.
              zone={zoneEditing ? proposalZone : postedZone}
              searchedZone={postedZone}
              drawTool={zoneEditing?.step === 'drawing' ? drawTool : null}
              onDrawZone={finishDrawing}
              onDrawCircle={(center, radius) => proposeZone(circle(center, radius), 'Votre zone est tracée')}
              onDrawTooSmall={showTooSmall}
              onVisibleArea={(box) => { visibleArea.current = box; }}
              tools={<ZonePencil menu={zoneMenu} editing={zoneEditing !== null} onStart={startDrawing} />}
              onMarkerTap={desktop ? undefined : tapMarker}
            />
          </Suspense>
          {/* Bandeau du tracé, en haut de l'écran mais après la carte dans la page : depuis le crayon, Tab mène à « Zone
              autour du centre de la carte » et à « Annuler », puis au choix de l'outil ou à la carte de validation. */}
          {zoneEditing && (
            <ZoneBanner
              text={drawHint && zoneEditing.step === 'drawing' ? drawHint
                : zoneEditing.step === 'proposal' ? zoneEditing.title : drawingInstruction(drawTool)}
              onCancel={() => setZoneEditing(null)}
              onZoneAroundCenter={zoneEditing.step === 'drawing' ? zoneAroundMapCenter : undefined}
            />
          )}
          {/* Téléphone : le panneau du bas de l'app (MapBottomPanel), qui glisse hors de l'écran pendant le tracé et
              l'ajustement d'une zone. Ordinateur : l'aperçu du bien choisi, ni aperçu ni « Liste » pendant le tracé. */}
          {!desktop && mapOpen && (
            <MapBottomPanel
              results={sortedForMap(mapResults, mapSort)}
              mode={draft.mode}
              place={placeLabel(draft)}
              drawnZone={postedZone !== null}
              loading={loading}
              offline={failure?.offline === true}
              onRetry={() => setAttempt((a) => a + 1)}
              onGrowZone={loading || !postedZone || !canGrow(postedZone) ? null : () => proposeZone(scaled(postedZone, SCALE_STEP), 'Ajustez votre zone')}
              sort={mapSort}
              onSortChange={setMapSort}
              selectedId={selectedId}
              onSelect={setSelectedId}
              height={panelHeight}
              onHeightChange={setPanelHeight}
              hidden={zoneEditing !== null}
            />
          )}
          {desktop && selected && !zoneEditing && <MapPreview result={selected} mode={draft.mode} onClose={() => setSelectedId(null)} />}
          {desktop && !zoneEditing && (
            <button type="button" className="map-close btn btn-primary" onClick={() => setMapOpen(false)}>
              <Icon name="list" />
              Liste
            </button>
          )}
          {zoneEditing?.step === 'drawing' && (
            <ZoneToolPicker tool={drawTool} onChange={(tool) => { zoneSession.drawTool = tool; setDrawTool(tool); }} />
          )}
          {zoneEditing?.step === 'proposal' && (
            <ZoneValidationCard
              zone={zoneEditing.zone}
              count={proposalFound?.results.length ?? 0}
              loading={proposalLoading}
              onShrink={() => proposeZone(scaled(zoneEditing.zone, 1 / SCALE_STEP), zoneEditing.title)}
              onGrow={() => proposeZone(scaled(zoneEditing.zone, SCALE_STEP), zoneEditing.title)}
              onRestart={() => setZoneEditing({ step: 'drawing' })}
              onCommit={() => commitZone(zoneEditing.zone)}
            />
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
