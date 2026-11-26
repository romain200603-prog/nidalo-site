import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../../components/Icon';
import { ListingPhoto } from '../../components/PhotoPager';
import { HeartButton } from '../../components/account/HeartButton';
import { useCompare } from '../../lib/compare';
import type { PhotoRow } from '../../lib/listings';
import { photoTint } from './data';
import { Modal } from './Dialogs';
import { ExtraIcon } from './icons';

// Galerie de la fiche (ListingDetailView.swift 270–365) et visionneuse plein écran (ListingPhotoViewer.swift,
// MediaPager.swift) : photo de 325 de haut sous la barre d'état (sur ordinateur, la largeur de la colonne et la même
// proportion), photos à faire défiler, points et compteur « 2/8 » ; Retour, Partager, Favori et Comparer en ronds
// blancs de 44 posés dessus. Toucher (ou cliquer) une photo l'ouvre en grand, avec ses flèches et celles du clavier ;
// en fermant, la galerie montre la dernière photo vue.

function scrollToPage(el: HTMLElement | null, index: number, smooth: boolean) {
  if (!el) return;
  el.scrollTo({ left: index * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Annonce sans photo : la teinte du type de bien et l'icône photo (ListingPhoto.placeholder de l'app). */
export function PhotoPlaceholder({ propertyType, className }: { propertyType: string; className?: string }) {
  return (
    <div className={`photo-placeholder${className ? ` ${className}` : ''}`} style={{ background: photoTint(propertyType) }} aria-hidden="true">
      <Icon name="image" />
    </div>
  );
}

type Zoom = { scale: number; x: number; y: number };
const NO_ZOOM: Zoom = { scale: 1, x: 0, y: 0 };

type Gesture =
  | { kind: 'pending'; x: number; y: number; zoom: Zoom }
  | { kind: 'swipe'; x: number }
  | { kind: 'close'; y: number }
  | { kind: 'pan'; x: number; y: number; zoom: Zoom }
  | { kind: 'pinch'; distance: number; zoom: Zoom }
  | { kind: 'none' };

/**
 * Visionneuse (ListingPhotoViewer + MediaPager + ZoomableContent de l'app) : balayer d'une photo à l'autre, pincer
 * (de 1 à 5 fois) ou toucher deux fois (2,5 fois) pour agrandir, glisser une photo agrandie pour la déplacer ; vers le
 * bas de plus de 120, elle se ferme (la photo suit le doigt, sans fondu). Les flèches disparaissent quand la photo est
 * agrandie. Au clavier : flèches gauche et droite, Échap.
 */
function PhotoViewer({ photos, propertyType, start, onClose }: { photos: PhotoRow[]; propertyType: string; start: number | null; onClose: (last: number) => void }) {
  const [index, setIndex] = useState(start ?? 0);
  // À chaque ouverture, le compteur part de la photo touchée (et non de la dernière vue à l'ouverture précédente).
  const [openedAt, setOpenedAt] = useState(start);
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  /** Glissement en cours : x pour passer d'une photo à l'autre, y pour fermer. */
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [moving, setMoving] = useState(false);
  if (start !== openedAt) {
    setOpenedAt(start);
    if (start !== null) {
      setIndex(start);
      setZoom(NO_ZOOM);
      setDrag(null);
    }
  }
  const indexRef = useRef(index);
  indexRef.current = index;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>({ kind: 'none' });
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const count = photos.length;
  const zoomed = zoom.scale > 1;

  const go = (next: number) => {
    const target = Math.max(0, Math.min(count - 1, next));
    if (target !== indexRef.current) setZoom(NO_ZOOM);
    setIndex(target);
  };

  const close = () => onClose(indexRef.current);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button') || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setMoving(true);
    if (pointers.current.size === 2) {
      setDrag(null);
      gesture.current = { kind: 'pinch', distance: distance(), zoom: zoomRef.current };
    } else if (pointers.current.size === 1) {
      gesture.current = { kind: 'pending', x: event.clientX, y: event.clientY, zoom: zoomRef.current };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointers.current.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const current = gesture.current;
    if (current.kind === 'pinch') {
      if (current.distance <= 0) return;
      const scale = Math.max(1, Math.min(5, current.zoom.scale * (distance() / current.distance)));
      setZoom({ scale, x: current.zoom.x, y: current.zoom.y });
      return;
    }
    if (current.kind === 'pending') {
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (current.zoom.scale > 1) {
        if (Math.hypot(dx, dy) > 4) gesture.current = { kind: 'pan', x: current.x, y: current.y, zoom: current.zoom };
      } else if (Math.abs(dx) > 10 && Math.abs(dx) >= Math.abs(dy)) {
        gesture.current = { kind: 'swipe', x: current.x };
      } else if (dy > 20 && dy > Math.abs(dx)) {
        // Glisser vers le bas : la photo suit le doigt (DragGesture de 20 au moins, MediaPager).
        gesture.current = { kind: 'close', y: current.y };
      } else if (Math.abs(dy) > 20) {
        gesture.current = { kind: 'none' };
      }
    }
    const next = gesture.current;
    if (next.kind === 'swipe') {
      let dx = event.clientX - next.x;
      // Au bout de la série, la photo résiste (comme le balayage de l'iPhone).
      if ((indexRef.current === 0 && dx > 0) || (indexRef.current === count - 1 && dx < 0)) dx /= 3;
      setDrag({ x: dx, y: 0 });
    } else if (next.kind === 'close') {
      setDrag({ x: 0, y: Math.max(0, event.clientY - next.y) });
    } else if (next.kind === 'pan') {
      setZoom({ scale: next.zoom.scale, x: next.zoom.x + event.clientX - next.x, y: next.zoom.y + event.clientY - next.y });
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointers.current.get(event.pointerId);
    if (!pointer) return;
    pointers.current.delete(event.pointerId);
    const current = gesture.current;
    if (current.kind === 'pinch') {
      if (pointers.current.size === 0) {
        gesture.current = { kind: 'none' };
        setMoving(false);
        // Revenue à sa taille : la photo se recentre.
        if (zoomRef.current.scale <= 1) setZoom(NO_ZOOM);
      }
      return;
    }
    setMoving(false);
    gesture.current = { kind: 'none' };
    if (event.type === 'pointercancel') {
      setDrag(null);
      return;
    }
    if (current.kind === 'swipe') {
      const dx = event.clientX - current.x;
      const width = event.currentTarget.clientWidth || 1;
      if (dx < -Math.min(60, width / 4)) go(indexRef.current + 1);
      else if (dx > Math.min(60, width / 4)) go(indexRef.current - 1);
      setDrag(null);
    } else if (current.kind === 'close') {
      const dy = event.clientY - current.y;
      if (dy > 120) close();
      else setDrag(null);
    } else if (current.kind === 'pending') {
      // Toucher deux fois : 2,5 fois, ou la taille d'origine.
      const now = event.timeStamp;
      const previous = lastTap.current;
      if (previous && now - previous.time < 320 && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 30) {
        lastTap.current = null;
        setZoom(zoomRef.current.scale > 1 ? NO_ZOOM : { scale: 2.5, x: 0, y: 0 });
      } else {
        lastTap.current = { time: now, x: event.clientX, y: event.clientY };
      }
    }
  };

  const animate = !moving && !reducedMotion();
  const trackStyle: CSSProperties = {
    transform: `translate3d(calc(${-index * 100}% + ${drag?.x ?? 0}px), 0, 0)`,
    transition: animate ? 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
  };
  const photoStyle: CSSProperties = {
    transform: `translate3d(${zoom.x}px, ${zoom.y + (drag?.y ?? 0)}px, 0) scale(${zoom.scale})`,
    transition: animate ? 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
  };

  return (
    <Modal open={start !== null} onClose={close} className="viewer-dialog" label="Photos de l’annonce">
      <div
        className={`viewer${zoomed ? ' is-zoomed' : ''}`}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') { event.preventDefault(); go(indexRef.current + 1); }
          if (event.key === 'ArrowLeft') { event.preventDefault(); go(indexRef.current - 1); }
        }}
      >
        <div
          className="viewer-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div className="viewer-track" style={trackStyle}>
            {count === 0 ? (
              <div className="viewer-page">
                <PhotoPlaceholder propertyType={propertyType} className="viewer-placeholder" />
              </div>
            ) : photos.map((photo, i) => (
              <div key={photo.id} className="viewer-page" aria-hidden={i !== index}>
                <div className="viewer-photo" style={i === index ? photoStyle : undefined}>
                  <ListingPhoto photo={photo} alt={count > 1 ? `Photo ${i + 1} sur ${count}` : 'Photo du bien'} eager={Math.abs(i - index) <= 1} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="viewer-top">
          {count > 1 ? <span className="viewer-counter" aria-live="polite" aria-label={`Photo ${index + 1} sur ${count}`}>{index + 1}/{count}</span> : <span />}
          <button type="button" className="viewer-close" aria-label="Fermer" title="Fermer" onClick={close} autoFocus>
            <Icon name="x" />
          </button>
        </div>
        {count > 1 && !zoomed && (
          <div className="viewer-arrows">
            <button type="button" className="viewer-arrow" aria-label="Photo précédente" disabled={index === 0} onClick={() => go(index - 1)}>
              <Icon name="chevronLeft" />
            </button>
            <button type="button" className="viewer-arrow" aria-label="Photo suivante" disabled={index >= count - 1} onClick={() => go(index + 1)}>
              <Icon name="chevronRight" />
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** « Comparer » posé sur la photo (CompareButton, style .photo) : rond blanc, bleu plein quand le bien est comparé. */
function CompareRound({ listingId, onClick }: { listingId: string; onClick: () => void }) {
  const active = useCompare().ids.includes(listingId);
  const label = active ? 'Retirer de la comparaison' : 'Ajouter à la comparaison';
  return (
    <button type="button" className={`gallery-action gallery-compare${active ? ' is-active' : ''}`} aria-pressed={active} aria-label={label} title={label} onClick={onClick}>
      <Icon name="columns" />
    </button>
  );
}

export function Gallery({ photos, propertyType, onShare, onCompare, listingId, back }: {
  photos: PhotoRow[];
  /** Type du bien : la teinte d'une annonce sans photo. */
  propertyType: string;
  onShare: () => void;
  /** « Comparer » posé sur la photo. */
  onCompare?: () => void;
  /** Annonce du cœur (ajouter demande un compte). */
  listingId: string;
  /** Retour, posé sur la photo. */
  back: { href: string; label: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void };
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const count = photos.length;
  const size = count === 0 ? 'empty' : count === 1 ? 'one' : count === 2 ? 'two' : 'many';

  return (
    <div className={`gallery gallery-${size}`} style={{ '--photo-tint': photoTint(propertyType) } as CSSProperties}>
      <div
        className="gallery-strip"
        ref={strip}
        onScroll={(event) => {
          const el = event.currentTarget;
          setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {count === 0 ? (
          <div className="gallery-page" role="img" aria-label="Photo du bien">
            <PhotoPlaceholder propertyType={propertyType} />
          </div>
        ) : photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            className="gallery-page"
            onClick={() => setViewer(index)}
            aria-label={count > 1 ? `Photo ${index + 1} sur ${count}, ouvrir en grand` : 'Photo du bien, ouvrir en grand'}
          >
            <ListingPhoto photo={photo} eager={index === 0} />
          </button>
        ))}
      </div>
      {count > 1 && (
        <>
          <div className="gallery-dots" aria-hidden="true">
            {photos.map((photo, index) => <span key={photo.id} className={index === page ? 'on' : undefined} />)}
          </div>
          <span className="gallery-counter" aria-hidden="true">{page + 1}/{count}</span>
        </>
      )}
      <div className="gallery-bar">
        <a className="gallery-back" href={back.href} onClick={back.onClick} aria-label="Retour" title={back.label}>
          <Icon name="chevronLeft" />
        </a>
        <div className="gallery-actions">
          <button type="button" className="gallery-action" onClick={onShare} aria-label="Partager l'annonce" title="Partager l'annonce">
            <ExtraIcon name="shareUp" />
          </button>
          <HeartButton listingId={listingId} className="gallery-action gallery-heart" />
          {onCompare && <CompareRound listingId={listingId} onClick={onCompare} />}
        </div>
      </div>
      <PhotoViewer
        photos={photos}
        propertyType={propertyType}
        start={viewer}
        onClose={(last) => {
          setViewer(null);
          setPage(last);
          scrollToPage(strip.current, last, false);
        }}
      />
    </div>
  );
}
