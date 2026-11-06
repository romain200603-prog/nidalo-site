import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { photoUrl, type PhotoRow } from '../lib/listings';

/** Photo d'annonce. `crossOrigin` : la photo est chargée sans cookie. */
export function ListingPhoto({ photo, alt = '', eager = false }: { photo: PhotoRow | undefined; alt?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!photo || failed) {
    return (
      <div className="photo-empty" role={alt ? 'img' : undefined} aria-label={alt || undefined}>
        <Icon name="home" />
      </div>
    );
  }
  return (
    <img
      className="photo"
      src={photoUrl(photo.storage_path)}
      alt={alt}
      width={photo.width ?? undefined}
      height={photo.height ?? undefined}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

/** Photos à faire défiler d'un balayage, avec les points de position (comme `PhotoPager` de l'app). */
export function PhotoPager({ photos, label, showsDots = true, onPageChange }: {
  photos: PhotoRow[];
  label: string;
  showsDots?: boolean;
  /** Photo affichée (compteur « 2/5 » des favoris). */
  onPageChange?: (page: number) => void;
}) {
  const [page, setPage] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  if (photos.length <= 1) return <ListingPhoto photo={photos[0]} alt={label} />;
  const go = (index: number) => {
    const el = strip.current;
    if (!el) return;
    const next = Math.max(0, Math.min(photos.length - 1, index));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  };
  return (
    <div className="pager" aria-roledescription="carrousel" aria-label={label}>
      <div
        className="pager-strip"
        ref={strip}
        onScroll={(event) => {
          const el = event.currentTarget;
          const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (next !== page) {
            setPage(next);
            onPageChange?.(next);
          }
        }}
      >
        {photos.map((photo, index) => (
          <div className="pager-page" key={photo.id} aria-hidden={index !== page}>
            <ListingPhoto photo={photo} alt={`${label}, photo ${index + 1} sur ${photos.length}`} />
          </div>
        ))}
      </div>
      <button type="button" className="pager-arrow pager-prev" aria-label="Photo précédente" hidden={page === 0}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); go(page - 1); }}>
        <Icon name="chevronLeft" />
      </button>
      <button type="button" className="pager-arrow pager-next" aria-label="Photo suivante" hidden={page >= photos.length - 1}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); go(page + 1); }}>
        <Icon name="chevronRight" />
      </button>
      {showsDots && (
        <div className="pager-dots" aria-hidden="true">
          {photos.map((photo, index) => <span key={photo.id} className={index === page ? 'on' : undefined} />)}
        </div>
      )}
      <span className="visually-hidden" aria-live="polite">Photo {page + 1} sur {photos.length}</span>
    </div>
  );
}
