import { useEffect, useRef, useState } from 'react';
import { AttributionControl, LngLatBounds, Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Icon } from './Icon';
import { ListingPhoto } from './PhotoPager';
import { clusters } from '../lib/clustering';
import { formatFraction, formatPinPrice } from '../lib/format';
import { sortedPhotos } from '../lib/listings';
import type { Coordinate } from '../lib/places';
import type { BoundingBox, Result } from '../lib/search';
import { GOOD_YIELD } from '../lib/cardContent';

// Moteur de carte servi par le site lui-même (pas de code téléchargé ailleurs).
setWorkerUrl(workerUrl);

/** France métropolitaine, quand il n'y a rien à cadrer. */
const FRANCE: BoundingBox = [-5.2, 41.3, 9.6, 51.1];

/** Couches du plan masquées sous la photo, et noms passés en blanc (comme l'app, ListingsMapView.swift). */
const PLAN_ONLY_LAYERS = ['parcs', 'bois', 'ilots', 'eau', 'cours-eau', 'batiments', 'voies-ferrees', 'rues-lisere', 'rues', 'axes-lisere', 'gares-points'];
const LABEL_LAYERS = ['noms-rues', 'noms-eau', 'noms-plans-eau', 'gares-noms', 'parcs-noms', 'quartiers', 'villes'];

export type MapFrame = { token: number; box: BoundingBox | null; points: Coordinate[] };

/**
 * Comme dans l'app (MapSession), la carte s'ouvre en vue satellite et garde le dernier choix tant que la page est
 * ouverte. Rien n'est enregistré sur l'appareil.
 */
const mapSession = { isSatellite: true };

type Props = {
  results: Result[];
  showsYield: boolean;
  selectedId: string | null;
  hoveredId?: string | null;
  onSelect: (id: string | null) => void;
  frame: MapFrame;
  /** Zone visible après un déplacement fait par la personne. */
  onUserMove?: (box: BoundingBox) => void;
  className?: string;
};

function coordinateOf(result: Result): Coordinate | null {
  const { public_latitude: lat, public_longitude: lng } = result.row;
  return lat === null || lng === null ? null : { latitude: Number(lat), longitude: Number(lng) };
}

function boundsOf(points: Coordinate[]): LngLatBounds | null {
  if (!points.length) return null;
  const bounds = new LngLatBounds([points[0].longitude, points[0].latitude], [points[0].longitude, points[0].latitude]);
  for (const p of points) bounds.extend([p.longitude, p.latitude]);
  return bounds;
}

export function ResultsMap({ results, showsYield, selectedId, hoveredId, onSelect, frame, onUserMove, className }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, setTick] = useState(0);
  const [satellite, setSatellite] = useState(() => mapSession.isSatellite);
  const planColors = useRef<Record<string, { text: unknown; halo: unknown }>>({});
  const onUserMoveRef = useRef(onUserMove);
  onUserMoveRef.current = onUserMove;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

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
    map.addControl(new AttributionControl({ compact: true }), 'bottom-left');
    let frameRequest = 0;
    const redraw = () => {
      if (frameRequest) return;
      frameRequest = requestAnimationFrame(() => {
        frameRequest = 0;
        setTick((t) => t + 1);
      });
    };
    map.on('move', redraw);
    map.on('resize', redraw);
    map.on('load', () => {
      setReady(true);
      redraw();
    });
    map.on('error', (event) => {
      // Une tuile manquante n'empêche pas la carte de marcher ; seul le style est indispensable.
      if (!map.isStyleLoaded() && !map.loaded() && String(event.error?.message ?? '').includes('immo-carte')) setFailed(true);
    });
    map.on('moveend', (event) => {
      if (!(event as { originalEvent?: unknown }).originalEvent) return;
      const b = map.getBounds();
      onUserMoveRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
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
    const padding = { top: 60, bottom: 60, left: 40, right: 40 };
    if (frame.box) {
      map.fitBounds(frame.box, { padding, duration: 0, maxZoom: 15 });
      return;
    }
    const bounds = boundsOf(frame.points);
    if (bounds) map.fitBounds(bounds, { padding, duration: 0, maxZoom: 14 });
    else map.fitBounds(FRANCE, { padding, duration: 0 });
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
    const bounds = boundsOf(results.flatMap((r) => { const c = coordinateOf(r); return c ? [c] : []; }));
    if (bounds && map) map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 350 });
  }

  if (failed) {
    return (
      <div className={`results-map map-failed ${className ?? ''}`}>
        <p>La carte ne peut pas s’afficher sur ce navigateur. La liste des biens reste disponible.</p>
      </div>
    );
  }

  return (
    <div className={`results-map ${className ?? ''}`}>
      <div ref={container} className="map-canvas" role="region" aria-label="Carte des biens" data-ready={ready ? "oui" : "non"} />
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
          const isHovered = row.id === hoveredId;
          const good = highlights ? highlights.grossYield >= GOOD_YIELD : false;
          const price = formatPinPrice(Number(row.price), row.transaction);
          return (
            <button
              key={row.id}
              type="button"
              className={`map-marker${isSelected ? ' is-selected' : ''}${isHovered ? ' is-hovered' : ''}`}
              style={{ transform: `translate(${group.x}px, ${group.y}px) translate(-50%, calc(-100% + 6px))` }}
              aria-label={`${price}, ${row.title}, ${row.city}`}
              aria-pressed={isSelected}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(row.id);
              }}
            >
              <span className="map-marker-inner">
                <span className="map-marker-card">
                  <span className="map-marker-photo"><ListingPhoto photo={sortedPhotos(row)[0]} /></span>
                  <span className="map-marker-price">
                    {price}
                    {isSelected && showsYield && highlights && <span className="map-marker-yield">{formatFraction(highlights.grossYield)}</span>}
                  </span>
                </span>
                <span className={`map-marker-dot${good ? ' good' : ''}`} />
              </span>
            </button>
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
          onClick={recenter} disabled={!results.length}>
          <Icon name="crosshair" />
        </button>
      </div>
    </div>
  );
}
