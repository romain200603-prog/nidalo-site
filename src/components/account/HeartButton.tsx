import { useLayoutEffect, useRef } from 'react';
import { toggleFavorite, useFavorites } from '../../lib/account/favorites';
import '../../styles/pieces-app.css';

/**
 * Cœur d'une annonce (FavoriteButton de l'app) : contour sombre, plein en bleu quand l'annonce est en favori.
 * Ajouter demande un compte (la fenêtre de connexion s'ouvre) ; retirer, jamais.
 * Styles : `heart-photo` (rond blanc sur une photo), `heart-plain` (sans fond), ou la classe d'un autre bouton.
 */
export function HeartButton({ listingId, className = 'heart-button heart-photo', text }: {
  listingId: string;
  className?: string;
  /** Libellé visible (« Favori » de la fiche sur ordinateur) : il nomme le bouton, l'état est dans aria-pressed. */
  text?: string;
}) {
  const favorites = useFavorites();
  const active = favorites.items.some((item) => item.listing_id === listingId);
  const label = active ? 'Retirer des favoris' : 'Ajouter aux favoris';
  return (
    <button
      type="button"
      className={`${className}${active ? ' is-active' : ''}`}
      aria-pressed={active}
      aria-label={text ? undefined : label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(listingId);
      }}
    >
      <HeartIcon filled={active} ready={favorites.status === 'ready'} />
      {text && <span>{text}</span>}
    </button>
  );
}

const HEART = 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5';

/**
 * Cœur Lucide de l'app, plein quand l'annonce est en favori (aussi « Enregistrer » de la fiche sur ordinateur), avec
 * le mouvement de FavoriteHeartIcon : à l'ajout, il se remplit et fait un petit rebond (rétrécit à 82 %, dépasse à
 * 114 %, revient : 0,36 s) ; au retrait, il se vide en fondu, sans rebond. « Réduire les animations » : fondu seul.
 * `ready` : faux tant que les favoris se chargent (le cœur se remplit alors sans rebond, ce n'est pas un ajout).
 */
export function HeartIcon({ filled, ready = true }: { filled: boolean; ready?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const before = useRef({ filled, ready });
  useLayoutEffect(() => {
    const last = before.current;
    before.current = { filled, ready };
    const svg = ref.current;
    if (!filled || last.filled || !last.ready || !svg || typeof svg.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    svg.animate([
      { transform: 'scale(1)', easing: 'ease-in-out' },
      { transform: 'scale(0.82)', offset: 0.09 / 0.36, easing: 'ease-in-out' },
      { transform: 'scale(1.14)', offset: 0.22 / 0.36, easing: 'ease-in-out' },
      { transform: 'scale(1)' },
    ], { duration: 360 });
  }, [filled, ready]);
  return (
    <svg ref={ref} className={`icon heart-icon${filled ? ' is-filled' : ''}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className="heart-icon-empty" d={HEART} />
      <path className="heart-icon-full" d={HEART} />
    </svg>
  );
}
