import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { Icon } from '../../components/Icon';
import { ListingPhoto } from '../../components/PhotoPager';
import type { PhotoRow } from '../../lib/listings';
import { Modal } from './Dialogs';
import { ExtraIcon } from './icons';

// Galerie de la fiche (ListingDetailView.swift 206–287) et visionneuse plein écran (ListingPhotoViewer.swift,
// MediaPager.swift). Téléphone : photos à faire défiler, points et compteur « 2/8 ». Ordinateur : une grande photo
// et deux petites, et « Voir les N photos ». Toucher une photo l'ouvre en grand ; en fermant, la galerie montre la
// dernière photo vue.

function scrollToPage(el: HTMLElement | null, index: number, smooth: boolean) {
  if (!el) return;
  el.scrollTo({ left: index * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
}

function PhotoViewer({ photos, start, onClose }: { photos: PhotoRow[]; start: number | null; onClose: (last: number) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start ?? 0);
  // À chaque ouverture, le compteur part de la photo touchée (et non de la dernière vue à l'ouverture précédente).
  const [openedAt, setOpenedAt] = useState(start);
  if (start !== openedAt) {
    setOpenedAt(start);
    if (start !== null) setIndex(start);
  }
  const indexRef = useRef(index);
  indexRef.current = index;
  const count = photos.length;

  // La fenêtre est ouverte (Modal l'ouvre avant), la bande a sa largeur : on se place sur la photo touchée avant
  // l'affichage.
  useLayoutEffect(() => {
    if (start !== null) scrollToPage(strip.current, start, false);
  }, [start]);

  const go = (next: number) => {
    const target = Math.max(0, Math.min(count - 1, next));
    scrollToPage(strip.current, target, !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    setIndex(target);
  };

  return (
    <Modal open={start !== null} onClose={() => onClose(indexRef.current)} className="viewer-dialog" label="Photos de l’annonce">
      <div
        className="viewer"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') { event.preventDefault(); go(indexRef.current + 1); }
          if (event.key === 'ArrowLeft') { event.preventDefault(); go(indexRef.current - 1); }
        }}
      >
        <div
          className="viewer-strip"
          ref={strip}
          onScroll={(event) => {
            const el = event.currentTarget;
            const page = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
            if (page !== indexRef.current) setIndex(page);
          }}
        >
          {photos.map((photo, i) => (
            <div key={photo.id} className="viewer-page" aria-hidden={i !== index}>
              <ListingPhoto photo={photo} alt={count > 1 ? `Photo ${i + 1} sur ${count}` : 'Photo du bien'} eager={Math.abs(i - index) <= 1} />
            </div>
          ))}
        </div>
        <div className="viewer-top">
          {count > 1 ? <span className="viewer-counter" aria-live="polite">{index + 1}/{count}</span> : <span />}
          <button type="button" className="viewer-close" aria-label="Fermer" title="Fermer" onClick={() => onClose(indexRef.current)} autoFocus>
            <Icon name="x" />
          </button>
        </div>
        {count > 1 && (
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

export function Gallery({ photos, onShare, onFavorite, back }: {
  photos: PhotoRow[];
  onShare: () => void;
  onFavorite: () => void;
  /** Retour à la recherche, posé sur la photo (téléphone). */
  back: { href: string; label: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void };
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const count = photos.length;
  const size = count === 0 ? 'empty' : count === 1 ? 'one' : count === 2 ? 'two' : 'many';

  return (
    <div className={`gallery gallery-${size}`}>
      <div
        className="gallery-strip"
        ref={strip}
        onScroll={(event) => {
          const el = event.currentTarget;
          setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {count === 0 ? (
          <div className="gallery-page">
            <ListingPhoto photo={undefined} alt="Photo du bien" />
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
          <button type="button" className="gallery-all" onClick={() => setViewer(0)}>
            <Icon name="image" />
            Voir les {count} photos
          </button>
        </>
      )}
      <a className="gallery-back" href={back.href} onClick={back.onClick} aria-label={back.label} title={back.label}>
        <Icon name="chevronLeft" />
      </a>
      <div className="gallery-actions">
        <button type="button" className="gallery-action" onClick={onShare} aria-label="Partager l'annonce" title="Partager l'annonce">
          <ExtraIcon name="shareUp" />
        </button>
        <button type="button" className="gallery-action" onClick={onFavorite} aria-label="Ajouter aux favoris" title="Ajouter aux favoris">
          <Icon name="heart" />
        </button>
      </div>
      <PhotoViewer
        photos={photos}
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
