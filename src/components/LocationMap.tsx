import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Icon } from './Icon';

// Carte de la localisation d'une annonce : mini carte fixe de la fiche, ou carte plein écran (« Voir sur la carte »,
// ListingLocationMapView.swift). Seule la position publique est montrée : un cercle de 400 m quand le vendeur
// n'indique que le quartier, un repère sinon. Chargée seulement quand la fiche l'affiche (import différé).

// Moteur de carte servi par le site lui-même (pas de code téléchargé ailleurs).
setWorkerUrl(workerUrl);

/** Couches du plan masquées sous la photo, et noms passés en blanc (mêmes listes que ResultsMap). */
const PLAN_ONLY_LAYERS = ['parcs', 'bois', 'ilots', 'eau', 'cours-eau', 'batiments', 'voies-ferrees', 'rues-lisere', 'rues', 'axes-lisere', 'gares-points'];
const LABEL_LAYERS = ['noms-rues', 'noms-eau', 'noms-plans-eau', 'gares-noms', 'parcs-noms', 'quartiers', 'villes'];

/** Rayon du cercle approximatif (PublicLocation.circleRadiusMeters). */
export const CIRCLE_RADIUS_METERS = 400;
const EARTH_CIRCUMFERENCE = 40_075_016.686;

/** Mètres par pixel au zoom donné (tuiles de 512 px du moteur). */
export function metersPerPixel(latitude: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** Zoom qui montre `meters` sur le plus petit côté de la carte, comme une région MapKit de N mètres. */
export function zoomFor(latitude: number, meters: number, side: number): number {
  return Math.log2((EARTH_CIRCUMFERENCE * Math.cos((latitude * Math.PI) / 180) * Math.max(side, 1)) / (512 * meters));
}

type Point = { x: number; y: number; diameter: number };

type Props = {
  latitude: number;
  longitude: number;
  isApproximate: boolean;
  /** Étendue montrée, en mètres : 1 500 (mini carte), 2 400 ou 1 200 (plein écran). */
  meters: number;
  /** Mini carte : ni déplacement ni zoom. */
  interactive: boolean;
  satellite?: boolean;
  /** Chaque nouvelle valeur recentre la carte sur le bien. */
  recenterToken?: number;
  /** Plein écran : cercle gardé entre 60 et 600 px de large. */
  clampsCircle?: boolean;
  label: string;
  className?: string;
};

export function LocationMap({ latitude, longitude, isApproximate, meters, interactive, satellite = false, recenterToken = 0, clampsCircle = false, label, className }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [point, setPoint] = useState<Point | null>(null);
  const planColors = useRef<Record<string, { text: unknown; halo: unknown }>>({});

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const side = () => Math.min(el.clientWidth, el.clientHeight);
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: el,
        style: '/map/immo-carte.json',
        center: [longitude, latitude],
        zoom: zoomFor(latitude, meters, side()),
        interactive,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxZoom: 18,
        locale: {
          'Map.Title': 'Carte',
          'NavigationControl.ZoomIn': 'Zoomer',
          'NavigationControl.ZoomOut': 'Dézoomer',
        },
      });
    } catch {
      setFailed(true);
      return;
    }
    if (interactive) {
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
    }
    const update = () => {
      const p = map.project([longitude, latitude]);
      const raw = (2 * CIRCLE_RADIUS_METERS) / metersPerPixel(latitude, map.getZoom());
      setPoint({ x: p.x, y: p.y, diameter: clampsCircle ? Math.max(60, Math.min(600, raw)) : raw });
    };
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    update();
    map.on('move', schedule);
    map.on('resize', schedule);
    map.on('load', () => {
      setReady(true);
      update();
    });
    map.on('error', (event) => {
      // Une tuile manquante n'empêche pas la carte de marcher ; seul le style est indispensable.
      if (!map.isStyleLoaded() && !map.loaded() && String(event.error?.message ?? '').includes('immo-carte')) setFailed(true);
      // MapLibre n'annonce « load » qu'en dessinant : si la description des tuiles du plan échoue après le dernier
      // dessin, la carte est complète mais rien ne la redessine et « load » n'arrive jamais. Un dessin de plus suffit.
      else map.triggerRepaint();
    });
    mapRef.current = map;
    return () => {
      cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude, meters, interactive, clampsCircle]);

  // « Recentrer sur le bien ».
  useEffect(() => {
    const map = mapRef.current;
    const el = container.current;
    if (!map || !el || !recenterToken) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    map.easeTo({ center: [longitude, latitude], zoom: zoomFor(latitude, meters, Math.min(el.clientWidth, el.clientHeight)), duration: reduced ? 0 : 350 });
  }, [recenterToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Plan ou photo aérienne (comme ResultsMap).
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

  if (failed) {
    return (
      <div className={`location-map map-failed ${className ?? ''}`}>
        <p>La carte ne peut pas s’afficher sur ce navigateur.</p>
      </div>
    );
  }

  return (
    <div className={`location-map ${className ?? ''}`}>
      <div ref={container} className="location-map-canvas" role={interactive ? 'region' : 'img'} aria-label={label} data-ready={ready ? 'oui' : 'non'} />
      {point && (isApproximate ? (
        <span className="map-circle" aria-hidden="true"
          style={{ width: point.diameter, height: point.diameter, transform: `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)` }} />
      ) : (
        <span className="map-house" aria-hidden="true" style={{ transform: `translate(${point.x}px, ${point.y - 22}px) translate(-50%, -50%)` }}>
          <Icon name="home" />
        </span>
      ))}
    </div>
  );
}

export default LocationMap;
