import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { CompareButton } from './CompareButton';
import { ContentUnavailable } from './ContentUnavailable';
import { Icon } from './Icon';
import { OfflineState } from './OfflineState';
import { ListingPhoto } from './PhotoPager';
import { HeartButton } from './account/HeartButton';
import { badgeText, cardContent, cardLocation, formatCardPrice, formatFact, leasedLotsOf, type FormattedFact } from '../lib/cardContent';
import type { SearchMode } from '../lib/labels';
import { sortedPhotos } from '../lib/listings';
import {
  MAP_PANEL_HEIGHTS, MAP_SORT_LABELS, mapPanelTitle, mapSortOptions, panelHeight, rubberBanded, snapTarget, type MapPanelHeight,
  type MapSort,
} from '../lib/mapPanel';
import { listingPath } from '../lib/paths';
import type { Result } from '../lib/search';
import '../styles/carte-panneau.css';

// Panneau du bas de la carte (MapBottomPanel et MapResultsPanel de l'app, Features/Map/MapResultsPanel.swift) :
// poignée, « 42 biens sur la carte », le lieu et le tri, puis le carrousel des fiches (hauteurs compacte et moyenne) ou
// leur liste (grande hauteur). La fiche au centre du carrousel est le bien sélectionné sur la carte ; un marqueur touché
// fait défiler le carrousel jusqu'à sa fiche. Le panneau se tire au doigt (ou à la souris) entre ses trois hauteurs.

/** « Réduire les animations » : le panneau change de hauteur sans glisser. */
function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const HEIGHT_NAMES: Record<MapPanelHeight, string> = { compact: 'réduite', medium: 'moyenne', large: 'agrandie' };
/** Poignée : 8 au-dessus, 5 de haut, 10 dessous. */
const GRABBER = 23;
/** Poignée et en-tête : la zone qui déplace toujours le panneau. */
const HEADER = 86;

/** Une ligne de fait de la fiche : icône de 13, texte de 12,5, « estimation » s'il y a lieu. */
function FactLine({ fact }: { fact: FormattedFact }) {
  return (
    <span className={`map-card-fact tone-${fact.tone}`}>
      <Icon name={fact.icon} />
      <span className="map-card-fact-text">{fact.text}</span>
      {fact.isEstimate && <span className="map-card-estimate">estimation</span>}
    </span>
  );
}

/**
 * Fiche d'un bien dans le panneau (MapResultCard) : photo (96 de haut, 160 dans la liste), badge, cœur et Comparer,
 * titre, lieu, prix, puis 3 faits (4 dans la liste). 270 de large dans le carrousel. Toute la fiche ouvre l'annonce.
 */
export function MapResultCard({ result, mode, selected, wide = false }: { result: Result; mode: SearchMode; selected: boolean; wide?: boolean }) {
  const { row, highlights } = result;
  const content = cardContent(row, mode, highlights);
  const price = formatCardPrice(content.price);
  const badge = content.badge ? badgeText(content.badge) : null;
  const href = listingPath(row.id, content.kind === 'investment' ? 'invest' : null);
  return (
    <article className={`map-card${wide ? ' is-wide' : ''}${selected ? ' is-selected' : ''}`} data-id={row.id}>
      <div className="map-card-photo">
        <ListingPhoto photo={sortedPhotos(row)[0]} />
        {badge && <span className={`listing-badge-pill map-card-badge${badge.tone === 'positive' ? ' is-positive' : ''}`}>{badge.text}</span>}
        <HeartButton listingId={row.id} className="heart-button heart-photo map-card-heart" />
        <CompareButton listingId={row.id} mode={content.kind === 'investment' ? 'invest' : null} />
      </div>
      <div className="map-card-body">
        <h3 className="map-card-title"><a className="stretched" href={href}>{row.title}</a></h3>
        <p className="map-card-place">{cardLocation(row.city, content)}</p>
        <p className="map-card-price">
          <strong>{price.amount}</strong>
          {price.suffix && <span>{price.suffix}</span>}
        </p>
        <div className="map-card-facts">
          {content.facts.slice(0, wide ? 4 : 3).map((fact, index) => <FactLine key={index} fact={formatFact(fact, undefined, leasedLotsOf(content.facts))} />)}
        </div>
      </div>
    </article>
  );
}

type PanelProps = {
  /** Biens de la carte, déjà triés par le tri du panneau. */
  results: Result[];
  mode: SearchMode;
  /** Lieu de la recherche (« Lyon et alentours »). */
  place: string;
  /** Recherche dans une zone dessinée : « 6 biens », « Dans votre zone dessinée ». */
  drawnZone: boolean;
  loading: boolean;
  /** La dernière lecture a échoué faute de connexion (LoadFailure.offline). */
  offline: boolean;
  onRetry: () => void;
  /** Zone dessinée sans aucun bien : « Agrandir la zone » à la place du tri ; `null` pendant le chargement. */
  onGrowZone: (() => void) | null;
  sort: MapSort;
  onSortChange: (sort: MapSort) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  height: MapPanelHeight;
  onHeightChange: (height: MapPanelHeight) => void;
  /** Tracé ou ajustement d'une zone : le panneau glisse hors de l'écran, puis revient à sa hauteur d'avant. */
  hidden: boolean;
};

type Drag = {
  pointerId: number;
  startX: number;
  startY: number;
  axis: 'vertical' | 'horizontal' | null;
  onHeader: boolean;
  offset: number;
  samples: { y: number; t: number }[];
};

export function MapBottomPanel({
  results, mode, place, drawnZone, loading, offline, onRetry, onGrowZone, sort, onSortChange, selectedId, onSelect, height,
  onHeightChange, hidden,
}: PanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const carousel = useRef<HTMLUListElement>(null);
  const list = useRef<HTMLUListElement>(null);
  /** Hauteur de l'écran sans ses zones du haut et du bas (sonde en CSS : env(safe-area-inset-*)). */
  const [available, setAvailable] = useState(() => (typeof window === 'undefined' ? 760 : window.innerHeight));
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  /** Un glissement vient de finir : le clic qui suit sur la poignée ne change pas la hauteur. */
  const justDragged = useRef(false);
  const [listAtTop, setListAtTop] = useState(true);
  /** Le carrousel défile sous le doigt (ou la molette, le clavier) : sa fiche du centre devient la sélection. */
  const userScroll = useRef(false);
  /** Fiche au centre du carrousel (scrolledID de l'app). */
  const [centeredId, setCenteredId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const element = probe.current;
    if (!element) return;
    const measure = () => setAvailable(element.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Mention des sources de la carte : 10 au-dessus du panneau au repos (hauteur compacte ou moyenne).
  useLayoutEffect(() => {
    const column = panel.current?.parentElement;
    if (!column) return;
    column.style.setProperty('--map-attribution-bottom', `${panelHeight(height === 'compact' ? 'compact' : 'medium', available) + 10}px`);
    return () => { column.style.removeProperty('--map-attribution-bottom'); };
  }, [height, available]);

  const heights = MAP_PANEL_HEIGHTS.map((h) => panelHeight(h, available));
  const full = panelHeight('large', available);
  const target = panelHeight(height, available);
  const visible = rubberBanded(target - dragOffset, heights[0], full);

  const step = (direction: 1 | -1) => {
    const index = MAP_PANEL_HEIGHTS.indexOf(height);
    onHeightChange(MAP_PANEL_HEIGHTS[Math.min(Math.max(index + direction, 0), MAP_PANEL_HEIGHTS.length - 1)]);
  };

  // MARK: Geste (MapBottomPanel.drag) : direction choisie après 10 px ; verticale, le panneau suit le doigt, puis se
  // cale avec l'élan, un cran à la fois ; horizontale, le carrousel défile. En grand, seuls la poignée et l'en-tête le
  // déplacent, ou la liste tout en haut tirée vers le bas.

  function movesPanel(translation: number, onHeader: boolean) {
    if (height !== 'large') return true;
    return onHeader || (listAtTop && translation > 0);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (hidden || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if ((event.target as HTMLElement).closest('select, input')) return;
    const top = panel.current?.getBoundingClientRect().top ?? 0;
    drag.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, axis: null,
      onHeader: event.clientY - top <= HEADER, offset: 0, samples: [{ y: event.clientY, t: event.timeStamp }],
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (current.axis === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
      current.axis = Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
      if (current.axis === 'vertical' && movesPanel(dy, current.onHeader)) {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }
    }
    if (current.axis !== 'vertical' || !movesPanel(dy, current.onHeader)) return;
    current.offset = dy;
    current.samples = [...current.samples.filter((sample) => event.timeStamp - sample.t < 100), { y: event.clientY, t: event.timeStamp }];
    setDragOffset(dy);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    drag.current = null;
    if (current.axis !== 'vertical' || !dragging) {
      setDragging(false);
      setDragOffset(0);
      return;
    }
    justDragged.current = true;
    window.setTimeout(() => { justDragged.current = false; }, 0);
    // Élan : la vitesse des 100 dernières millisecondes, prolongée (predictedEndTranslation).
    const first = current.samples[0];
    const elapsed = Math.max(1, event.timeStamp - first.t);
    const velocity = cancelled ? 0 : (event.clientY - first.y) / elapsed;
    const projected = target - (current.offset + velocity * 300);
    const snapped = snapTarget(heights, target, projected);
    const next = MAP_PANEL_HEIGHTS[heights.indexOf(snapped)] ?? height;
    setDragging(false);
    setDragOffset(0);
    if (next !== height) onHeightChange(next);
  }

  // Liste en grand, tout en haut : tirer vers le bas fait descendre le panneau au lieu de faire rebondir la liste (le
  // navigateur la ferait défiler au doigt : le geste est repris avant qu'il ne commence).
  useEffect(() => {
    const element = list.current;
    if (!element || height !== 'large') return;
    let startY: number | null = null;
    const onStart = (event: TouchEvent) => { startY = event.touches.length === 1 && element.scrollTop <= 0 ? event.touches[0].clientY : null; };
    const onMove = (event: TouchEvent) => {
      if (startY === null) return;
      const dy = event.touches[0].clientY - startY;
      if (dy > 0 && element.scrollTop <= 0 && event.cancelable) event.preventDefault();
      else startY = null;
    };
    element.addEventListener('touchstart', onStart, { passive: true });
    element.addEventListener('touchmove', onMove, { passive: false });
    return () => {
      element.removeEventListener('touchstart', onStart);
      element.removeEventListener('touchmove', onMove);
    };
  }, [height, results.length]);

  // MARK: Carrousel ↔ carte

  // Carrousel → carte : la fiche calée au centre devient le bien sélectionné.
  useEffect(() => {
    const strip = carousel.current;
    if (!strip) return;
    let timer: number | undefined;
    const settle = () => {
      const box = strip.getBoundingClientRect();
      const middle = box.left + box.width / 2;
      let best: { id: string; distance: number } | null = null;
      for (const card of strip.querySelectorAll<HTMLElement>('.map-card')) {
        const r = card.getBoundingClientRect();
        const distance = Math.abs(r.left + r.width / 2 - middle);
        if (!best || distance < best.distance) best = { id: card.dataset.id ?? '', distance };
      }
      if (!best?.id) return;
      setCenteredId(best.id);
      if (userScroll.current && best.id !== selectedRef.current) onSelectRef.current(best.id);
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 120);
    };
    const touched = () => { userScroll.current = true; };
    const events = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;
    userScroll.current = false;
    strip.addEventListener('scroll', onScroll, { passive: true });
    for (const name of events) strip.addEventListener(name, touched, { passive: true });
    return () => {
      window.clearTimeout(timer);
      strip.removeEventListener('scroll', onScroll);
      for (const name of events) strip.removeEventListener(name, touched);
    };
  }, [results.length, height === 'large']); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Carte → carrousel : un marqueur touché fait défiler jusqu'à sa fiche.
  useEffect(() => {
    const strip = carousel.current;
    if (!strip || !selectedId || selectedId === centeredId) return;
    const card = strip.querySelector<HTMLElement>(`.map-card[data-id="${CSS.escape(selectedId)}"]`);
    if (!card) return;
    const left = card.offsetLeft - (strip.clientWidth - card.offsetWidth) / 2;
    userScroll.current = false;
    strip.scrollTo({ left: Math.max(0, left), behavior: reducedMotion() ? 'auto' : 'smooth' });
    setCenteredId(selectedId);
  }, [selectedId, results.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Grande hauteur : la liste s'ouvre sur le bien sélectionné.
  useLayoutEffect(() => {
    const element = list.current;
    if (!element || height !== 'large') return;
    const card = selectedId ? element.querySelector<HTMLElement>(`.map-card[data-id="${CSS.escape(selectedId)}"]`) : null;
    element.scrollTop = card ? card.offsetTop - 14 : 0;
    setListAtTop(element.scrollTop <= 1);
  }, [height]); // eslint-disable-line react-hooks/exhaustive-deps

  const index = Math.max(0, results.findIndex((r) => r.row.id === (centeredId ?? selectedId)));
  const title = mapPanelTitle(results.length, loading, drawnZone);
  const subtitle = drawnZone ? 'Dans votre zone dessinée' : place;
  const showsGrow = drawnZone && results.length === 0 && !loading && !offline && onGrowZone !== null;
  const collapsed = height === 'compact';

  function grabberKey(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      step(-1);
    }
  }

  let body;
  if (results.length === 0 && offline) {
    body = <div className="map-panel-state" inert={collapsed ? true : undefined}><OfflineState onRetry={onRetry} /></div>;
  } else if (results.length === 0 && loading) {
    body = <div className="map-panel-state" aria-hidden="true"><span className="spinner" /></div>;
  } else if (results.length === 0) {
    body = (
      <div className="map-panel-state">
        <ContentUnavailable icon="map" title="Aucun bien ici" text="Changez de lieu, dessinez une zone ou élargissez vos critères." className="app-offline" />
      </div>
    );
  } else if (height === 'large') {
    body = (
      <ul ref={list} className="map-panel-list" onScroll={(event) => setListAtTop(event.currentTarget.scrollTop <= 1)}>
        {results.map((result) => (
          <li key={result.row.id}><MapResultCard result={result} mode={mode} selected={result.row.id === selectedId} wide /></li>
        ))}
      </ul>
    );
  } else {
    // Même mise en page en compact et en moyen ; replié, le carrousel s'efface (aucun bout de fiche ne dépasse).
    body = (
      <div className="map-panel-carousel" inert={collapsed ? true : undefined}>
        <ul ref={carousel} className="map-panel-strip">
          {results.map((result) => (
            <li key={result.row.id}><MapResultCard result={result} mode={mode} selected={result.row.id === selectedId} /></li>
          ))}
        </ul>
        {/* Au-delà de 8 biens : « 3 / 42 » à la place des points, qui débordaient de l'écran (n° 165). */}
        <div className="map-panel-pages" role="img" aria-label={`Bien ${index + 1} sur ${results.length}`}>
          {results.length > 8
            ? <span className="map-panel-count">{index + 1} / {results.length}</span>
            : results.map((result, i) => <span key={result.row.id} className={`map-panel-dot${i === index ? ' is-current' : ''}`} />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={probe} className="map-panel-probe" aria-hidden="true" />
      <div
        ref={panel}
        className={`map-panel is-${height}${dragging ? ' is-dragging' : ''}${hidden ? ' is-hidden' : ''}${listAtTop ? ' is-list-top' : ''}`}
        style={{ height: `calc(${full}px + env(safe-area-inset-bottom))`, transform: hidden ? undefined : `translateY(${full - visible}px)` }}
        inert={hidden ? true : undefined}
        aria-label="Biens sur la carte"
        role="region"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endDrag(event, false)}
        onPointerCancel={(event) => endDrag(event, true)}
      >
        <button type="button" className="map-panel-grabber" aria-label={`Liste des biens, ${HEIGHT_NAMES[height]}`}
          aria-keyshortcuts="ArrowUp ArrowDown" onKeyDown={grabberKey}
          onClick={() => { if (!justDragged.current) onHeightChange(height === 'compact' ? 'medium' : 'compact'); }}>
          <span aria-hidden="true" />
        </button>
        <div className="map-panel-content" style={{ height: `${target - GRABBER}px` }}>
          <div className="map-panel-head">
            <div className="map-panel-titles">
              <h2>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {showsGrow ? (
              <button type="button" className="map-panel-grow" onClick={() => onGrowZone?.()}>
                <Icon name="maximize" />
                Agrandir la zone
              </button>
            ) : (
              // « Pertinence » et son chevron ; le menu natif, transparent, les couvre.
              <label className="map-panel-sort">
                <Icon name="arrowUpDown" />
                <span aria-hidden="true">{MAP_SORT_LABELS[sort]}</span>
                <Icon name="chevronDown" />
                <select aria-label={`Trier par ${MAP_SORT_LABELS[sort]}`} value={sort} onChange={(event) => onSortChange(event.target.value as MapSort)}>
                  {mapSortOptions(mode).map((option) => <option key={option} value={option}>{MAP_SORT_LABELS[option]}</option>)}
                </select>
              </label>
            )}
          </div>
          {body}
        </div>
      </div>
    </>
  );
}
