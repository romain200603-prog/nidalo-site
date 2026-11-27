import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { LngLatBounds, Map as MapLibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../styles/carte-panneau.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Icon } from './Icon';
import { ListingPhoto } from './PhotoPager';
import { HeartButton } from './account/HeartButton';
import { MapAttribution } from '../pages/listing/Location';
import { clusters } from '../lib/clustering';
import { boundingBox as zoneBox, distanceMeters, encodeZone, radiusLabel } from '../lib/drawnZone';
import { formatPinPrice } from '../lib/format';
import { sortedPhotos } from '../lib/listings';
import type { Coordinate } from '../lib/places';
import type { BoundingBox, Result } from '../lib/search';
import { cardPrice, GOOD_YIELD, grossYieldText } from '../lib/cardContent';

// Moteur de carte servi par le site lui-même (pas de code téléchargé ailleurs).
setWorkerUrl(workerUrl);

/** France métropolitaine, quand il n'y a rien à cadrer. */
const FRANCE: BoundingBox = [-5.2, 41.3, 9.6, 51.1];

/** Couches du plan masquées sous la photo, et noms passés en blanc (comme l'app, ListingsMapView.swift). */
const PLAN_ONLY_LAYERS = ['parcs', 'bois', 'ilots', 'eau', 'cours-eau', 'batiments', 'voies-ferrees', 'rues-lisere', 'rues', 'axes-lisere', 'gares-points'];
const LABEL_LAYERS = ['noms-rues', 'noms-eau', 'noms-plans-eau', 'gares-noms', 'parcs-noms', 'quartiers', 'villes'];

/** Cadrage demandé par la page ; `zone` : `box` est le cadre de la zone dessinée, cadrée en entier (ses bords visibles). */
export type MapFrame = { token: number; box: BoundingBox | null; points: Coordinate[]; zone?: boolean };

/** Outil du tracé de la zone (MapDrawTool de l'app) : au doigt (ou à la souris), ou cercle (centre puis rayon). */
export type DrawTool = 'free' | 'circle';

// Zone dessinée (ListingsMapView.swift, showZone) : l'extérieur voilé de bleu nuit (un polygone qui couvre le globe, la
// zone en trou ; 50 % en satellite, 30 % en plan), puis un liseré blanc de 6,5 et le trait bleu de 3,5, jointures et
// bouts arrondis. Calques en haut du style ; les vignettes des biens (éléments de la page) restent par-dessus.
const ZONE_SOURCE = 'zone-dessinee';
const ZONE_VEIL_SOURCE = 'zone-dessinee-exterieur';
const ZONE_VEIL_LAYER = 'zone-dessinee-voile';
/** Bleu du contour et du tracé de l'app (UIColor 0x43 0x5B 0xAA de ListingsMapView), bleu nuit du voile (Color.navy). */
const ZONE_BLUE = '#435BAA';
const ZONE_VEIL = '#242D38';
const WORLD = [[-180, -85], [-180, 85], [180, 85], [180, -85], [-180, -85]];
type GeoData = Exclude<Parameters<GeoJSONSource['setData']>[0], string>;
const EMPTY: GeoData = { type: 'FeatureCollection', features: [] };

function zoneShapes(zone: Coordinate[] | null | undefined): { veil: GeoData; outline: GeoData } {
  if (!zone || zone.length < 3) return { veil: EMPTY, outline: EMPTY };
  const ring = zone.map((point) => [point.longitude, point.latitude]);
  ring.push(ring[0]);
  return {
    veil: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [WORLD, ring] } },
    outline: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring } },
  };
}

/** Pose (ou retire) la zone ; crée ses sources et calques s'ils manquent (style rechargé). */
function showZone(map: MapLibreMap, zone: Coordinate[] | null | undefined, satellite: boolean) {
  const { veil, outline } = zoneShapes(zone);
  const veilSource = map.getSource(ZONE_VEIL_SOURCE) as GeoJSONSource | undefined;
  const lineSource = map.getSource(ZONE_SOURCE) as GeoJSONSource | undefined;
  if (veilSource && lineSource) {
    void veilSource.setData(veil);
    void lineSource.setData(outline);
    return;
  }
  const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
  map.addSource(ZONE_VEIL_SOURCE, { type: 'geojson', data: veil });
  map.addLayer({ id: ZONE_VEIL_LAYER, type: 'fill', source: ZONE_VEIL_SOURCE, paint: { 'fill-color': ZONE_VEIL, 'fill-opacity': satellite ? 0.5 : 0.3 } });
  map.addSource(ZONE_SOURCE, { type: 'geojson', data: outline });
  map.addLayer({ id: 'zone-dessinee-lisere', type: 'line', source: ZONE_SOURCE, layout: round, paint: { 'line-color': '#FFFFFF', 'line-width': 6.5 } });
  map.addLayer({ id: 'zone-dessinee-bord', type: 'line', source: ZONE_SOURCE, layout: round, paint: { 'line-color': ZONE_BLUE, 'line-width': 3.5 } });
}

/**
 * Marges du cadrage des biens, d'une zone ou de la France (MapTabView.searchedRegion de l'app) : sous la ligne du haut et
 * la hauteur d'une vignette, au-dessus du panneau du bas en hauteur moyenne (362 + 30, + 60 pour la France), à gauche
 * des commandes ; ramenées à la hauteur de la carte sur un écran bas. Sans panneau ni ligne du haut sur la carte
 * (`panel` faux, ordinateur) : la hauteur d'une vignette en haut, la mention des sources en bas.
 */
function framePadding(map: MapLibreMap, kind: 'results' | 'zone' | 'france', panel: boolean) {
  const { clientHeight: height } = map.getContainer();
  const [top, left, bottom, right] = !panel ? (kind === 'france' ? [40, 16, 40, 16] : [96, kind === 'zone' ? 40 : 50, 40, 80])
    : kind === 'zone' ? [124, 40, 392, 80] : kind === 'france' ? [66, 16, 452, 16] : [126, 50, 392, 80];
  const scale = Math.min(1, Math.max(0, height - 80) / (top + bottom));
  return { top: Math.round(top * scale), left, bottom: Math.round(bottom * scale), right };
}

type Point = { x: number; y: number };
/** Tracé en cours, en points de l'écran (relatifs à la carte). */
type Trace = { pointerId: number; tool: DrawTool; points: Point[]; begun: boolean };

/**
 * Comme dans l'app (MapSession), la carte s'ouvre en vue satellite et garde le dernier choix tant que la page est
 * ouverte. Rien n'est enregistré sur l'appareil.
 */
const mapSession = { isSatellite: true };

type Props = {
  results: Result[];
  showsYield: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  frame: MapFrame;
  /** Zone visible après un déplacement fait par la personne. */
  onUserMove?: (box: BoundingBox) => void;
  className?: string;
  /** Zone dessinée affichée : posée, ou proposée pendant l'ajustement ; aucune pendant le tracé. */
  zone?: Coordinate[] | null;
  /** Zone posée de la recherche : « Recadrer » montre toute la zone (searchedRegion de l'app). */
  searchedZone?: Coordinate[] | null;
  /** Tracé en cours et son outil : la carte ne bouge plus, le doigt ou la souris trace ; `null` hors du tracé. */
  drawTool?: DrawTool | null;
  /** Tracé libre terminé : ses points, dans l'ordre du tracé. */
  onDrawZone?: (trace: Coordinate[]) => void;
  /** Cercle terminé : centre et rayon sur le terrain. */
  onDrawCircle?: (center: Coordinate, radiusMeters: number) => void;
  /** Tracé trop petit (boîte de moins de 40 px ou moins de 800 px², cercle de moins de 200 m) : ignoré. */
  onDrawTooSmall?: () => void;
  /** Zone visible, à chaque arrêt de la carte. */
  onVisibleArea?: (box: BoundingBox) => void;
  /** Commandes ajoutées sous les deux de la carte (le crayon de la zone). */
  tools?: ReactNode;
  /**
   * Toucher (ou clic) d'un marqueur, à la place de `onSelect` (MapTabView.tap de l'app) : la page choisit entre
   * sélectionner le bien (et `center()` pour centrer la carte sur lui) et ouvrir son annonce.
   */
  onMarkerTap?: (id: string, center: () => void) => void;
  /**
   * Le panneau du bas de la carte couvre le bas de l'écran (téléphone, par défaut) : cadrages et bien centré au-dessus
   * de lui. Faux sur ordinateur, où la liste est à côté de la carte : toute la carte.
   */
  bottomPanel?: boolean;
};

function coordinateOf(result: Result): Coordinate | null {
  const { public_latitude: lat, public_longitude: lng } = result.row;
  return lat === null || lng === null ? null : { latitude: Number(lat), longitude: Number(lng) };
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function boundsOf(points: Coordinate[]): LngLatBounds | null {
  if (!points.length) return null;
  const bounds = new LngLatBounds([points[0].longitude, points[0].latitude], [points[0].longitude, points[0].latitude]);
  for (const p of points) bounds.extend([p.longitude, p.latitude]);
  return bounds;
}

export function ResultsMap({
  results, showsYield, selectedId, onSelect, frame, onUserMove, className, zone, searchedZone, drawTool = null, onDrawZone,
  onDrawCircle, onDrawTooSmall, onVisibleArea, tools, onMarkerTap, bottomPanel = true,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  /**
   * Cadrage demandé pendant que la carte est cachée (liste, carte fermée) : sans taille, MapLibre ne peut
   * rien cadrer ; il se fait quand la carte prend la sienne (son « resize »), sauf si un autre l'a remplacé.
   */
  const pendingFrame = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);
  const [, setTick] = useState(0);
  const [satellite, setSatellite] = useState(() => mapSession.isSatellite);
  const planColors = useRef<Record<string, { text: unknown; halo: unknown }>>({});
  const onUserMoveRef = useRef(onUserMove);
  onUserMoveRef.current = onUserMove;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onVisibleAreaRef = useRef(onVisibleArea);
  onVisibleAreaRef.current = onVisibleArea;
  const zoneRef = useRef(zone);
  zoneRef.current = zone;
  const satelliteRef = useRef(satellite);
  satelliteRef.current = satellite;
  // Tracé en cours : gardé hors de l'état (plusieurs mouvements peuvent arriver entre deux affichages), puis affiché.
  const traceRef = useRef<Trace | null>(null);
  const [, setTraceVersion] = useState(0);
  const setTrace = (next: Trace | null) => {
    traceRef.current = next;
    setTraceVersion((version) => version + 1);
  };

  // Création de la carte, une fois.
  useEffect(() => {
    if (!container.current) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: container.current,
        style: '/map/immo-carte.json',
        bounds: FRANCE,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxZoom: 18,
        locale: {
          'NavigationControl.ZoomIn': 'Zoomer',
          'NavigationControl.ZoomOut': 'Dézoomer',
          'AttributionControl.ToggleAttribution': 'Sources de la carte',
        },
      });
    } catch {
      setFailed(true);
      return;
    }
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    // Mention des sources : celle de l'app (MapTabView.attribution), en bas à gauche, dessinée par la page.
    let frameRequest = 0;
    const redraw = () => {
      if (frameRequest) return;
      frameRequest = requestAnimationFrame(() => {
        frameRequest = 0;
        setTick((t) => t + 1);
      });
    };
    map.on('move', redraw);
    map.on('resize', () => {
      redraw();
      const pending = pendingFrame.current;
      if (pending && map.getContainer().clientWidth > 0 && map.getContainer().clientHeight > 0) {
        pendingFrame.current = null;
        pending();
      }
    });
    map.on('load', () => {
      setReady(true);
      redraw();
    });
    map.on('error', (event) => {
      // Une tuile manquante n'empêche pas la carte de marcher ; seul le style est indispensable.
      if (!map.isStyleLoaded() && !map.loaded() && String(event.error?.message ?? '').includes('immo-carte')) setFailed(true);
    });
    const visibleArea = (): BoundingBox => {
      const b = map.getBounds();
      return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    };
    map.on('moveend', (event) => {
      onVisibleAreaRef.current?.(visibleArea());
      if (!(event as { originalEvent?: unknown }).originalEvent) return;
      onUserMoveRef.current?.(visibleArea());
    });
    map.on('load', () => onVisibleAreaRef.current?.(visibleArea()));
    // Style rechargé : la zone dessinée revient (ses calques font partie du style).
    map.on('styledata', () => {
      if (map.isStyleLoaded() && !map.getSource(ZONE_SOURCE)) showZone(map, zoneRef.current, satelliteRef.current);
    });
    map.on('click', () => onSelectRef.current(null));
    mapRef.current = map;
    return () => {
      cancelAnimationFrame(frameRequest);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Cadrage : nouvelle recherche ou bouton « Recadrer ».
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const apply = () => {
      const padding = framePadding(map, frame.zone ? 'zone' : 'results', bottomPanel);
      if (frame.box) {
        map.fitBounds(frame.box, { padding, duration: 0, maxZoom: 15 });
        return;
      }
      const bounds = boundsOf(frame.points);
      if (bounds) map.fitBounds(bounds, { padding, duration: 0, maxZoom: 14 });
      else map.fitBounds(FRANCE, { padding: framePadding(map, 'france', bottomPanel), duration: 0 });
    };
    if (map.getContainer().clientWidth > 0 && map.getContainer().clientHeight > 0) {
      pendingFrame.current = null;
      // Carte tout juste ouverte (« Voir sur la carte ») : sa nouvelle taille d'abord, puis le cadrage.
      const canvas = map.getCanvas();
      if (canvas.clientWidth !== map.getContainer().clientWidth || canvas.clientHeight !== map.getContainer().clientHeight) map.resize();
      apply();
    } else {
      pendingFrame.current = apply;
    }
  }, [frame.token, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { mapSession.isSatellite = satellite; }, [satellite]);

  // Plan ou photo aérienne.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const layer = (id: string) => map.getLayer(id);
    if (layer('satellite')) map.setLayoutProperty('satellite', 'visibility', satellite ? 'visible' : 'none');
    for (const id of PLAN_ONLY_LAYERS) if (layer(id)) map.setLayoutProperty(id, 'visibility', satellite ? 'none' : 'visible');
    if (layer('axes')) map.setPaintProperty('axes', 'line-opacity', satellite ? 0.55 : 1);
    // Voile autour de la zone dessinée : plus marqué sur la photo.
    if (layer(ZONE_VEIL_LAYER)) map.setPaintProperty(ZONE_VEIL_LAYER, 'fill-opacity', satellite ? 0.5 : 0.3);
    for (const id of LABEL_LAYERS) {
      if (!layer(id)) continue;
      if (!planColors.current[id]) {
        planColors.current[id] = { text: map.getPaintProperty(id, 'text-color'), halo: map.getPaintProperty(id, 'text-halo-color') };
      }
      const original = planColors.current[id];
      map.setPaintProperty(id, 'text-color', satellite ? '#FFFFFF' : (original.text as string));
      map.setPaintProperty(id, 'text-halo-color', satellite ? 'rgba(0, 0, 0, 0.65)' : (original.halo as string));
    }
  }, [satellite, ready]);

  // Zone dessinée posée ou proposée (rien pendant le tracé).
  const zoneKey = zone ? encodeZone(zone) : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    showZone(map, zoneRef.current, satelliteRef.current);
  }, [zoneKey, ready]);

  // Tracé : la carte ne bouge plus (glisser, molette, double-clic, pincement, clavier), puis tout revient comme avant.
  const drawing = drawTool !== null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !drawing) return;
    map.stop();
    const handlers = [map.dragPan, map.scrollZoom, map.boxZoom, map.doubleClickZoom, map.touchZoomRotate, map.keyboard];
    const enabled = handlers.map((handler) => handler.isEnabled());
    for (const handler of handlers) handler.disable();
    return () => {
      handlers.forEach((handler, index) => { if (enabled[index]) handler.enable(); });
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      setTrace(null);
    };
  }, [drawing, ready]);

  const map = mapRef.current;
  const width = container.current?.clientWidth ?? 0;
  const height = container.current?.clientHeight ?? 0;
  const byId = new Map(results.map((r) => [r.row.id, r]));
  const screen = ready && map
    ? results.flatMap((r) => {
      const c = coordinateOf(r);
      if (!c) return [];
      const p = map.project([c.longitude, c.latitude]);
      return p.x >= -60 && p.y >= -60 && p.x <= width + 60 && p.y <= height + 60 ? [{ id: r.row.id, x: p.x, y: p.y }] : [];
    })
    : [];
  const groups = clusters(screen, 76, 70, selectedId);
  // Le bien sélectionné passe au premier plan.
  groups.sort((a, b) => Number(a.ids[0] === selectedId) - Number(b.ids[0] === selectedId));

  function zoomTo(ids: string[]) {
    const points = ids.map((id) => byId.get(id)).flatMap((r) => (r ? [coordinateOf(r)!] : [])).filter(Boolean);
    const bounds = boundsOf(points);
    if (bounds && map) map.fitBounds(bounds, { padding: 90, maxZoom: 17, duration: 350 });
  }

  function recenter() {
    // Zone dessinée : toute la zone, pour voir son contour (searchedRegion de l'app).
    const box = searchedZone ? zoneBox(searchedZone) : null;
    if (box && map) {
      map.fitBounds([box.southWest.longitude, box.southWest.latitude, box.northEast.longitude, box.northEast.latitude],
        { padding: framePadding(map, 'zone', bottomPanel), duration: 350 });
      return;
    }
    const bounds = boundsOf(results.flatMap((r) => { const c = coordinateOf(r); return c ? [c] : []; }));
    if (bounds && map) map.fitBounds(bounds, { padding: framePadding(map, 'results', bottomPanel), maxZoom: 14, duration: 350 });
  }

  // MARK: Tracé (handleDraw de l'app) : un seul pointeur, capturé ; le trait commence après un petit déplacement (un
  // simple appui ne trace rien), au point d'appui.

  function pointOf(event: ReactPointerEvent<HTMLDivElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onDrawDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drawTool || traceRef.current || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setTrace({ pointerId: event.pointerId, tool: drawTool, points: [pointOf(event)], begun: false });
  }

  function onDrawMove(event: ReactPointerEvent<HTMLDivElement>) {
    const trace = traceRef.current;
    if (!trace || event.pointerId !== trace.pointerId) return;
    const point = pointOf(event);
    const [first] = trace.points;
    if (!trace.begun && Math.hypot(point.x - first.x, point.y - first.y) < (event.pointerType === 'touch' ? 10 : 4)) return;
    setTrace({ ...trace, begun: true, points: trace.tool === 'free' ? [...trace.points, point] : [first, point] });
  }

  function onDrawUp(event: ReactPointerEvent<HTMLDivElement>) {
    const trace = traceRef.current;
    if (!trace || event.pointerId !== trace.pointerId) return;
    setTrace(null);
    if (!trace.begun || !map) return;
    const point = pointOf(event);
    const points = trace.tool === 'free' ? [...trace.points, point] : [trace.points[0], point];
    const geo = (p: Point): Coordinate => {
      const { lng, lat } = map.unproject([p.x, p.y]);
      return { latitude: lat, longitude: lng };
    };
    if (trace.tool === 'free') {
      // Une boîte d'au moins 40 px de côté, et une vraie surface (un trait droit n'est pas une zone).
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      let area = 0;
      points.forEach((a, index) => {
        const b = points[(index + 1) % points.length];
        area += a.x * b.y - b.x * a.y;
      });
      if (Math.max(...xs) - Math.min(...xs) < 40 || Math.max(...ys) - Math.min(...ys) < 40 || Math.abs(area) / 2 < 800) {
        onDrawTooSmall?.();
        return;
      }
      onDrawZone?.(points.map(geo));
      return;
    }
    const center = geo(points[0]);
    const radius = distanceMeters(center, geo(points[1]));
    if (radius < 200) {
      onDrawTooSmall?.();
      return;
    }
    onDrawCircle?.(center, radius);
  }

  function onDrawCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (traceRef.current && event.pointerId === traceRef.current.pointerId) setTrace(null);
  }

  /** Trait en cours : liseré blanc de 8 et trait bleu de 4,5, pointillés blancs jusqu'au départ, rond blanc et point bleu. */
  function traceDrawing(current: Trace) {
    const [first] = current.points;
    const last = current.points[current.points.length - 1];
    const radius = Math.hypot(last.x - first.x, last.y - first.y);
    const path = current.tool === 'free'
      ? current.points.map((p, index) => `${index ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
      : `M${(first.x + radius).toFixed(1)} ${first.y.toFixed(1)} A${radius.toFixed(1)} ${radius.toFixed(1)} 0 1 1 ${(first.x - radius).toFixed(1)} ${first.y.toFixed(1)} A${radius.toFixed(1)} ${radius.toFixed(1)} 0 1 1 ${(first.x + radius).toFixed(1)} ${first.y.toFixed(1)}`;
    return (
      <svg className="map-draw-trace" aria-hidden="true">
        <path d={path} stroke="#FFFFFF" strokeWidth={8} />
        <path d={path} stroke={ZONE_BLUE} strokeWidth={4.5} />
        <line x1={last.x} y1={last.y} x2={first.x} y2={first.y} stroke="#FFFFFF" strokeWidth={2.5} strokeDasharray="2 7" />
        <circle cx={first.x} cy={first.y} r={7} fill="#FFFFFF" stroke="none" />
        <circle cx={first.x} cy={first.y} r={4.5} fill={ZONE_BLUE} stroke="none" />
      </svg>
    );
  }

  /** Étiquette « Rayon : 2,5 km » près du milieu du rayon, décalée de côté : jamais sous le doigt. */
  function radiusTag(current: Trace) {
    if (current.tool !== 'circle' || current.points.length < 2 || !map) return null;
    const [first, last] = current.points;
    const radius = Math.hypot(last.x - first.x, last.y - first.y);
    if (radius <= 0) return null;
    const center = map.unproject([first.x, first.y]);
    const edge = map.unproject([last.x, last.y]);
    const meters = distanceMeters({ latitude: center.lat, longitude: center.lng }, { latitude: edge.lat, longitude: edge.lng });
    const normal = { x: -(last.y - first.y) / radius, y: (last.x - first.x) / radius };
    const side = normal.y > 0 ? -1 : 1;
    const x = (first.x + last.x) / 2 + normal.x * 30 * side;
    const y = (first.y + last.y) / 2 + normal.y * 30 * side;
    return <span className="map-draw-radius" style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%)` }}>{radiusLabel(meters)}</span>;
  }

  if (failed) {
    return (
      <div className={`results-map map-failed ${className ?? ''}`}>
        <p>La carte ne peut pas s’afficher sur ce navigateur. La liste des biens reste disponible.</p>
      </div>
    );
  }

  return (
    <div className={`results-map${drawing ? ' is-drawing' : ''} ${className ?? ''}`}>
      <div ref={container} className="map-canvas" role="region" aria-label="Carte des biens" data-ready={ready ? "oui" : "non"} />
      {/* Avant les vignettes et les commandes, comme la mention de MapLibre : Tab va du crayon au bandeau de la zone. */}
      <MapAttribution satellite={satellite} className="results-map-attribution" />
      {/* Tracé : surface au-dessus de la carte et sous les vignettes et les commandes (un trait ne commence jamais sur un
          bouton) ; elle seule bloque le défilement et le zoom de la page, et seulement pendant le tracé. */}
      {drawing && (
        <div className="map-draw" data-tool={drawTool} onPointerDown={onDrawDown} onPointerMove={onDrawMove} onPointerUp={onDrawUp}
          onPointerCancel={onDrawCancel} onLostPointerCapture={onDrawCancel}>
          {traceRef.current?.begun && traceDrawing(traceRef.current)}
        </div>
      )}
      <div className="map-markers">
        {groups.map((group) => {
          if (group.ids.length > 1) {
            return (
              <button
                key={group.ids.join('|')}
                type="button"
                className="map-cluster"
                style={{ transform: `translate(${group.x}px, ${group.y}px) translate(-50%, -50%)` }}
                aria-label={`${group.ids.length} biens regroupés, zoomer`}
                onClick={() => zoomTo(group.ids)}
              >
                <Icon name="house" />
                {group.ids.length} biens
              </button>
            );
          }
          const result = byId.get(group.ids[0]);
          if (!result) return null;
          const { row, highlights } = result;
          const isSelected = row.id === selectedId;
          const good = highlights ? highlights.grossYield >= GOOD_YIELD : false;
          // Location : le loyer charges comprises quand elles sont connues, comme les cartes (MapPricePin, n° 173).
          const price = formatPinPrice(cardPrice(row).value, row.transaction);
          const coordinate = coordinateOf(result);
          // Vignette (MapPhotoMarker) : photo, prix et cœur des favoris (rond blanc de 24 en haut à droite de la photo).
          return (
            <div
              key={row.id}
              className={`map-marker${isSelected ? ' is-selected' : ''}`}
              style={{ transform: `translate(${group.x}px, ${group.y}px) translate(-50%, calc(-100% + 6px))` }}
            >
              <span className="map-marker-inner">
                <button
                  type="button"
                  className="map-marker-button"
                  aria-label={`${price}, ${row.title}, ${row.city}`}
                  aria-pressed={isSelected}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!onMarkerTap) {
                      onSelect(row.id);
                      return;
                    }
                    onMarkerTap(row.id, () => {
                      if (!coordinate || !map) return;
                      // Au centre de la carte, comme l'app ; sur un écran plus bas que l'iPhone, le pied de la vignette
                      // reste 20 au-dessus du panneau en hauteur moyenne (362), sans passer sous la ligne du haut. Sans
                      // panneau (ordinateur) : au centre.
                      const height = map.getContainer().clientHeight;
                      const y = bottomPanel ? Math.max(124, Math.min(height / 2, height - 362 - 20)) : height / 2;
                      map.easeTo({ center: [coordinate.longitude, coordinate.latitude], offset: [0, Math.min(0, y - height / 2)], duration: reducedMotion() ? 0 : 350 });
                    });
                  }}
                >
                  <span className="map-marker-card">
                    <span className="map-marker-photo"><ListingPhoto photo={sortedPhotos(row)[0]} /></span>
                    <span className="map-marker-price">
                      {price}
                      {/* Verte à partir de 7 %, orange en dessous, comme les cartes (n° 166). */}
                      {isSelected && showsYield && highlights && <span className={`map-marker-yield${good ? '' : ' is-low'}`}>{grossYieldText(highlights)}</span>}
                    </span>
                  </span>
                  <span className={`map-marker-dot${good ? ' good' : ''}`} />
                </button>
                <HeartButton listingId={row.id} className="heart-button map-marker-heart" />
              </span>
            </div>
          );
        })}
      </div>
      <div className="map-tools">
        <button type="button" className={`map-round${satellite ? ' is-active' : ''}`} aria-pressed={satellite}
          aria-label={satellite ? 'Vue plan' : 'Vue satellite'} title={satellite ? 'Vue plan' : 'Vue satellite'}
          onClick={() => setSatellite((s) => !s)}>
          <Icon name="layers" />
        </button>
        <button type="button" className="map-round" aria-label="Recadrer sur les biens trouvés" title="Recadrer sur les biens trouvés"
          onClick={recenter} disabled={!results.length && !searchedZone}>
          <Icon name="locate" />
        </button>
        {tools}
      </div>
      {traceRef.current?.begun && radiusTag(traceRef.current)}
    </div>
  );
}
