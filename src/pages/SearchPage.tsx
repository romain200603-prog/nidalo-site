import { lazy, Suspense, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { showToast, useToastShown } from '../components/AppToast';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { ListingCard } from '../components/ListingCard';
import { CriterionChipsRow, FiltersButton } from '../components/CriterionChips';
import { ModeTabs } from '../components/ModeTabs';
import { MapBottomPanel } from '../components/MapBottomPanel';
import { LoadErrorState, OfflineState } from '../components/OfflineState';
import { PlaceField } from '../components/PlaceField';
import { SearchNoResults } from '../components/SearchNoResults';
import { SearchSplit } from '../components/SearchSplit';
import { useRailScroll } from '../components/useRailScroll';
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
import { cardContent } from '../lib/cardContent';
import { highlightsFor } from '../lib/highlights';
import type { SearchMode } from '../lib/labels';
import { listingPath, PATHS } from '../lib/paths';
import { canGrow, circle, distanceMeters, isUsable as isUsableZone, largestLoop, rounded, scaled, SCALE_STEP, simplified, smoothed } from '../lib/drawnZone';
import { mapPanelSubtitle, sortedForMap, type MapPanelHeight, type MapSort } from '../lib/mapPanel';
import type { Coordinate, PlaceSuggestion } from '../lib/places';
import { isOfflineFailure, SEARCH_LOAD_ERROR } from '../lib/loadFailure';
import { recentlyViewedIds } from '../lib/recentlyViewed';
import { useDesktop } from '../lib/desktop';
import {
  activeFilterCount, boxAround, chosenFromSuggestion, defaultDraft, draftFromParams, drawnZoneOf, effectiveSort, filterChips,
  locationFor, paramsFromDraft, placeLabel, search, SORT_LABELS, sortOptions, type BoundingBox, type Result, type SearchDraft,
  type SortOrder, switchMode,
} from '../lib/search';
import '../styles/recherche-app.css';
import '../styles/recherche-ordinateur.css';

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

/** « vue=carte » : la carte plein écran est ouverte (gardée au retour d'une annonce). */
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
 * l'observateur repart et relance la suite si la fin est encore visible. `pane` (ordinateur) : la liste défile dans sa
 * colonne, à côté de la carte ; la fin est guettée dans cette colonne, avec la même avance.
 */
function ListEnd({ onReach, pane = null }: { onReach: () => void; pane?: string | null }) {
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
    }, { root: pane ? element.closest(pane) : null, rootMargin: '0px 0px 600px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [pane]);
  return <div ref={ref} className="results-end" aria-hidden="true" />;
}

/** « Réduire les animations » : la liste va au bien choisi sans défiler en douceur. */
function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function SearchPage() {
  useRailScroll();
  /**
   * Ordinateur (≥ 1024 px) : la liste et la carte côte à côte, toujours visibles (recherche-ordinateur.css). Les mêmes
   * critères, recherches et actions ; seuls changent la place des éléments et ce qui n'a de sens qu'avec la carte en
   * plein écran du téléphone (capsule « Carte », ligne du haut et panneau du bas de la carte).
   */
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
  /** Panneau du bas de la carte : sa hauteur et son tri (MapTabView de l'app, moyen au départ). */
  const [panelHeight, setPanelHeight] = useState<MapPanelHeight>('medium');
  const [mapSort, setMapSort] = useState<MapSort>('relevance');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(readMapOpen);
  const mapOpenRef = useRef(mapOpen);
  mapOpenRef.current = mapOpen;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  /** Saisie du lieu en cours : le bouton « Carte » s'efface. */
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

  // La carte en plein écran se ferme avec Échap (pas celui qui referme les suggestions de lieu ou les filtres). Sur
  // ordinateur, la carte est à côté de la liste : rien à fermer, l'adresse garde « vue=carte » si elle l'a.
  useEffect(() => {
    if (!mapOpen || desktop) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog[open]')) setMapOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('map-is-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('map-is-open');
    };
  }, [mapOpen, desktop]);

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

  // Carte fermée : le tracé ou l'ajustement en cours s'arrête (la zone d'avant reste). Sur ordinateur, la carte ne se
  // ferme pas.
  useEffect(() => {
    if (!mapOpen && !desktop) setZoneEditing(null);
  }, [mapOpen, desktop]);

  // Le bouton qui avait le focus a disparu (crayon qui change de forme, bandeau, carte de validation ou pastille
  // refermés) : le focus du clavier va au bouton « Voir les biens » pendant l'ajustement, au crayon sinon. La carte de
  // l'ordinateur est toujours affichée.
  const zonePosed = drawnZoneOf(draft) !== null;
  useEffect(() => {
    if ((!mapOpen && !desktop) || (document.activeElement && document.activeElement !== document.body)) return;
    const target = zoneEditing?.step === 'proposal' ? '.map-column .zone-commit' : '.map-column .zone-pencil';
    document.querySelector<HTMLElement>(target)?.focus({ preventScroll: true });
  }, [zoneEditing?.step, zonePosed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => window.clearTimeout(drawHintTimer.current), []);

  // Ordinateur : le bien choisi sur la carte est encadré dans la liste, qui défile jusqu'à lui s'il est hors de vue.
  useEffect(() => {
    if (!desktop || selectedId === null) return;
    document.querySelector('.search-results .listing-card.is-selected')
      ?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [selectedId, desktop]);

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
   * Toucher (ou clic) d'un marqueur (MapTabView.tap) : il sélectionne le bien, centre la carte sur lui et ramène le
   * panneau en hauteur moyenne sur sa fiche ; un second toucher sur le même marqueur ouvre l'annonce.
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
  /** « Agrandir la zone » du panneau de la carte (zone dessinée sans aucun bien) ; `null` quand il n'est pas proposé. */
  const growZone = loading || !postedZone || !canGrow(postedZone) ? null : () => proposeZone(scaled(postedZone, SCALE_STEP), 'Ajustez votre zone');
  /** Ordinateur : sous le nombre de biens, ce que dit le panneau de la carte (« Dans votre zone dessinée », le lieu). */
  const subtitle = mapPanelSubtitle(placeLabel(draft), postedZone !== null);

  const modeTabs = (
    <ModeTabs mode={draft.mode} onChange={(mode) => {
      if (mode === draft.mode) return;
      byMode.current[draft.mode] = draft;
      apply(switchMode(draft, mode, byMode.current[mode]));
    }} className="mode-tabs-search" />
  );

  // Tri : « Triées par pertinence » et son chevron sous le nombre (téléphone) ; sur ordinateur, « Pertinence » entre ses
  // flèches et son chevron, après « Enregistrer » (maquette 04). Le menu natif, transparent, les couvre.
  const sortSelect = (
    <label className="sort-select">
      {desktop && <Icon name="arrowUpDown" />}
      <span aria-hidden="true">{desktop ? SORT_LABELS[sort] : `Triées par ${SORT_LABELS[sort].toLowerCase()}`}</span>
      <Icon name="chevronDown" />
      <select aria-label="Tri" value={sort} onChange={(event) => apply({ ...draft, sort: event.target.value as SortOrder })}>
        {sortOptions(draft.mode).map((option) => <option key={option} value={option}>{SORT_LABELS[option]}</option>)}
      </select>
    </label>
  );

  const placeField = () => (
    <PlaceField
      variant="app"
      label="Lieu de la recherche"
      placeholder="Ville, quartier, code postal…"
      clearLabel="Effacer la localisation"
      // Une grande ville est cherchée avec ses alentours : le champ le dit hors saisie (« Lyon et alentours »), comme
      // « Zone dessinée » quand une zone remplace le lieu.
      idleText={placeText.trim() === draft.place.trim() ? placeLabel(draft) || undefined : undefined}
      onFocusChange={setEditingPlace}
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
    // Ordinateur : la page tient dans la fenêtre, sans pied de page (la liste défile dans sa colonne).
    <Page section="search" wide fill={desktop}>
      <div className="search-layout">
        <div className="search-column">
          {/* Une seule ligne en haut, qui ne défile pas : retour, lieu, filtres (SearchPlaceField). Sur ordinateur, le
              bandeau blanc de la maquette : retour, catégories, lieu, « Filtres ». */}
          <div className="search-app-top">
            <a className="search-back" href={PATHS.home} onClick={leaveSearch} aria-label="Retour">
              <span className="search-back-circle"><Icon name="arrowLeft" /></span>
            </a>
            {desktop && modeTabs}
            {placeField()}
            <FiltersButton count={filterCount} onClick={() => setFiltersOpen(true)} label={desktop ? 'Filtres' : undefined} />
          </div>
          <div className="search-head">
            <h1 className="visually-hidden">Votre recherche</h1>
            {!desktop && modeTabs}
            {/* Critères actifs : le libellé ouvre les filtres, la croix retire le critère. Sur ordinateur, la zone dessinée
                en tête de la rangée (sur le téléphone, elle est sur la carte). */}
            <div className="chips-row">
              {desktop && postedZone && <ZoneChip onOpen={() => setFiltersOpen(true)} onRemove={clearZone} withIcon />}
              <CriterionChipsRow chips={chips} onOpen={() => setFiltersOpen(true)}
                onRemove={(id) => {
                  const chip = chips.find((c) => c.id === id);
                  if (chip) apply(chip.remove(draft));
                }} />
            </div>
          </div>

          {/* Les résultats ; sur ordinateur, la colonne de gauche, qui défile seule. */}
          <div className="search-results" id={desktop ? 'search-list' : undefined}>
            <p className="visually-hidden" aria-live="polite">{statusText}</p>
            {showsHeader && (
              <div className="results-head">
                <div className="results-count">
                  <h2>{countText}</h2>
                  {desktop ? (subtitle ? <p className="results-subtitle">{subtitle}</p> : null) : sortSelect}
                </div>
                <SaveSearchButton saved={savedSearch !== null} onOpen={openSave} />
                {desktop && sortSelect}
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
                // Ordinateur : « Agrandir la zone » du panneau de la carte du téléphone, ici avec les pistes ; caché pendant le
                // tracé et l'ajustement, comme le panneau qui glisse alors hors de l'écran.
                onGrowZone={desktop && postedZone && !zoneEditing ? growZone : null}
              />
            )}
            {results.length > 0 && (
              <>
                <div className="results-list">
                  {results.slice(0, listCount).map(({ row, highlights }) => (
                    <ListingCard key={row.id} row={row} content={cardContent(row, draft.mode, highlights)}
                      selected={row.id === selectedId} headingLevel="h3" showsBadge alreadySeen={seen.has(row.id)} />
                  ))}
                </div>
                {results.length > listCount && (
                  <ListEnd key={listCount} onReach={() => setListCount((count) => count + LIST_PAGE)} pane={desktop ? '.search-results' : null} />
                )}
              </>
            )}
          </div>
        </div>

        {/* Ordinateur : la barre à faire glisser entre la liste et la carte, pour agrandir l'une ou l'autre. */}
        {desktop && <SearchSplit />}

        {/* La carte : plein écran sur le téléphone (« Carte »), toujours à droite de la liste sur ordinateur. */}
        <div className={`map-column${mapOpen && !desktop ? ' is-open' : ''}${zoneEditing ? ` is-editing-zone is-zone-${zoneEditing.step}` : postedZone ? ' has-zone' : ''}${panelHeight === 'large' && !zoneEditing && !desktop ? ' is-panel-large' : ''}${editingPlace && !desktop ? ' is-editing-place' : ''}`}
          aria-hidden={undefined}>
          {/* La ligne du haut de la carte de l'app (MapTabView), sans catégories ni critères : retour (vers la liste), lieu,
              filtres et leur nombre. Pendant le tracé ou l'ajustement, le bandeau de la zone la remplace. Sur ordinateur, le
              bandeau du haut de la page tient ce rôle. */}
          {!zoneEditing && !desktop && (
            <div className="map-app-top">
              <button type="button" className="map-back" aria-label="Retour" onClick={() => setMapOpen(false)}>
                <Icon name="arrowLeft" />
              </button>
              {placeField()}
              <FiltersButton count={filterCount} floating onClick={() => setFiltersOpen(true)} />
            </div>
          )}
          {!zoneEditing && postedZone && !desktop && <ZoneChip onOpen={() => setFiltersOpen(true)} onRemove={clearZone} />}
          <Suspense fallback={<div className="results-map" aria-busy="true" />}>
            <ResultsMap
              results={mapResults}
              showsYield={draft.mode === 'invest'}
              selectedId={selectedId}
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
              onMarkerTap={tapMarker}
              bottomPanel={!desktop}
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
          {/* Le panneau du bas de l'app (MapBottomPanel), qui glisse hors de l'écran pendant le tracé et l'ajustement
              d'une zone. Sur ordinateur, la liste est à côté de la carte : pas de panneau. */}
          {mapOpen && !desktop && (
            <MapBottomPanel
              results={sortedForMap(mapResults, mapSort)}
              mode={draft.mode}
              place={placeLabel(draft)}
              drawnZone={postedZone !== null}
              loading={loading}
              offline={failure?.offline === true}
              onRetry={() => setAttempt((a) => a + 1)}
              onGrowZone={growZone}
              sort={mapSort}
              onSortChange={setMapSort}
              selectedId={selectedId}
              onSelect={setSelectedId}
              height={panelHeight}
              onHeightChange={setPanelHeight}
              hidden={zoneEditing !== null}
            />
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

      {/* « Carte » : capsule bleu marine flottante, 14 au-dessus de la barre d'onglets ; pas sur ordinateur, où la carte
          est toujours affichée. */}
      {!desktop && (
        <button type="button" className={`map-open${showsMapButton ? '' : ' is-hidden'}`} onClick={() => setMapOpen(true)}
          aria-label="Afficher sur la carte" aria-hidden={showsMapButton ? undefined : true} tabIndex={showsMapButton ? undefined : -1}>
          <Icon name="map" />
          Carte
        </button>
      )}

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
        // Ouverts depuis la carte, pas de « Voir sur la carte » (comme l'app) ; sur ordinateur non plus : la carte est
        // déjà à côté de la liste.
        onShowMap={mapOpen || desktop ? undefined : (next, drafts) => {
          setFiltersOpen(false);
          Object.assign(byMode.current, drafts);
          apply(next);
          setMapOpen(true);
        }}
      />
    </Page>
  );
}
