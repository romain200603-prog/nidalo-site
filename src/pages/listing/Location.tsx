import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { ListingPhoto } from '../../components/PhotoPager';
import type { PhotoRow } from '../../lib/listings';
import { AlertDialog, Modal } from './Dialogs';
import { ExtraIcon } from './icons';
import { SectionCard } from './Sections';

// « Localisation » (ListingDetailView.swift 722–765) et la carte plein écran (ListingLocationMapView.swift). La
// position est toujours la position publique de l'annonce (décalée par le serveur quand l'adresse est masquée).

const LocationMap = lazy(() => import('../../components/LocationMap'));

export type Coordinate = { latitude: number; longitude: number };

export type MapCardInfo = { photo: PhotoRow | undefined; price: string; title: string; subtitle: string };

/** Mentions des fonds de carte, comme MapConfiguration.attributionLinks de l'app. */
export function MapAttribution({ satellite, className }: { satellite: boolean; className?: string }) {
  const link = (href: string, text: string) => <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>;
  return (
    <p className={`map-attribution ${className ?? ''}`}>
      {satellite ? link('https://cartes.gouv.fr', '© IGN – Géoplateforme') : link('https://openmaptiles.org', '© OpenMapTiles')}{' '}
      {link('https://www.openstreetmap.org/copyright', '© OpenStreetMap')}
    </p>
  );
}

/** Liens d'itinéraire vers le point public (jamais l'adresse masquée). */
export function directionsLinks({ latitude, longitude }: Coordinate): { label: string; href: string }[] {
  const point = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  return [
    { label: 'Google Maps', href: `https://www.google.com/maps/dir/?api=1&destination=${point}` },
    { label: 'Plans d’Apple', href: `https://maps.apple.com/?daddr=${point}` },
    { label: 'Waze', href: `https://waze.com/ul?ll=${point}&navigate=yes` },
  ];
}

function ItineraryDialog({ open, onClose, coordinate, isApproximate }: { open: boolean; onClose: () => void; coordinate: Coordinate; isApproximate: boolean }) {
  return (
    <AlertDialog
      open={open}
      onClose={onClose}
      title="Itinéraire"
      message={isApproximate
        ? 'Le vendeur n\'indique que le quartier : l\'itinéraire mène au centre de la zone.'
        : 'L\'itinéraire mène au point indiqué sur l\'annonce.'}
      actions={[
        ...directionsLinks(coordinate).map((link) => ({ ...link, external: true })),
        { label: 'Annuler', onClick: onClose, tone: 'quiet' as const },
      ]}
    />
  );
}

function FullMap({ coordinate, isApproximate, card, onClose }: { coordinate: Coordinate; isApproximate: boolean; card: MapCardInfo; onClose: () => void }) {
  const [satellite, setSatellite] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [directions, setDirections] = useState(false);
  return (
    <div className="full-map">
      <Suspense fallback={<div className="location-map full-map-canvas" aria-busy="true" />}>
        <LocationMap className="full-map-canvas" latitude={coordinate.latitude} longitude={coordinate.longitude} isApproximate={isApproximate}
          meters={isApproximate ? 2_400 : 1_200} interactive satellite={satellite} recenterToken={recenter} clampsCircle label="Carte de l’annonce" />
      </Suspense>
      <div className="full-map-top">
        <button type="button" className="map-button" aria-label="Retour" title="Retour" onClick={onClose}>
          <Icon name="arrowLeft" />
        </button>
        <div className="full-map-tools">
          <button type="button" className={`map-button${satellite ? ' is-active' : ''}`} aria-pressed={satellite}
            aria-label={satellite ? 'Vue plan' : 'Vue satellite'} title={satellite ? 'Vue plan' : 'Vue satellite'} onClick={() => setSatellite((s) => !s)}>
            <Icon name="layers" />
          </button>
          <button type="button" className="map-button" aria-label="Recentrer sur le bien" title="Recentrer sur le bien" onClick={() => setRecenter((t) => t + 1)}>
            <ExtraIcon name="locateFixed" />
          </button>
        </div>
      </div>
      <div className="full-map-bottom">
        <MapAttribution satellite={satellite} />
        <div className="full-map-card">
          <button type="button" className="full-map-listing" onClick={onClose} aria-label={`${card.price}, ${card.title}, revenir à l'annonce`}>
            <span className="full-map-photo"><ListingPhoto photo={card.photo} /></span>
            <span className="full-map-text">
              <span className="full-map-price">{card.price}</span>
              <span className="full-map-title">{card.title}</span>
              <span className="full-map-sub">{card.subtitle}</span>
            </span>
            <Icon name="chevronRight" className="icon full-map-chevron" />
          </button>
          <button type="button" className="btn btn-primary btn-block" onClick={() => setDirections(true)}>
            <ExtraIcon name="navigation" />
            Itinéraire
          </button>
        </div>
      </div>
      <ItineraryDialog open={directions} onClose={() => setDirections(false)} coordinate={coordinate} isApproximate={isApproximate} />
    </div>
  );
}

/** Mini carte fixe (créée en arrivant près d'elle, comme la LazyVStack de l'app), « Voir sur la carte » et la légende. */
export function LocationSection({ coordinate, isApproximate, place, card }: {
  coordinate: Coordinate | null;
  isApproximate: boolean;
  place: string;
  card: MapCardInfo;
}) {
  const [fullScreen, setFullScreen] = useState(false);
  const [near, setNear] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || near) return;
    if (!('IntersectionObserver' in window)) {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setNear(true);
    }, { rootMargin: '400px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, coordinate]);

  const caption = isApproximate ? 'Localisation approximative : le vendeur n\'indique que le quartier.' : place;
  return (
    <SectionCard id="localisation" title="Localisation">
      <div className="location">
        {coordinate && (
          <>
            <div className="mini-map" ref={box}>
              {near && (
                <Suspense fallback={<div className="location-map" aria-busy="true" />}>
                  <LocationMap latitude={coordinate.latitude} longitude={coordinate.longitude} isApproximate={isApproximate}
                    meters={1_500} interactive={false} label={`Carte : ${place}`} />
                </Suspense>
              )}
              <button type="button" className="mini-map-open" onClick={() => setFullScreen(true)} aria-label={`Carte : ${place}. Ouvrir la carte en plein écran`} />
              <MapAttribution satellite={false} className="mini-map-attribution" />
            </div>
            <button type="button" className="btn btn-light btn-block" onClick={() => setFullScreen(true)}>
              <Icon name="map" />
              Voir sur la carte
            </button>
          </>
        )}
        <p className="location-caption">{caption}</p>
      </div>
      {coordinate && (
        <Modal open={fullScreen} onClose={() => setFullScreen(false)} className="map-dialog" label="Carte de l’annonce">
          <FullMap coordinate={coordinate} isApproximate={isApproximate} card={card} onClose={() => setFullScreen(false)} />
        </Modal>
      )}
    </SectionCard>
  );
}
