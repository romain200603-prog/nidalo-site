import { toggleFavorite, useFavorites } from '../../lib/account/favorites';

/**
 * Cœur d'une annonce (FavoriteButton de l'app) : contour sombre, plein en bleu quand l'annonce est en favori.
 * Ajouter demande un compte (la fenêtre de connexion s'ouvre) ; retirer, jamais.
 * Styles : `heart-photo` (rond blanc sur une photo), `heart-plain` (sans fond), ou la classe d'un autre bouton.
 */
export function HeartButton({ listingId, className = 'heart-button heart-photo' }: { listingId: string; className?: string }) {
  const favorites = useFavorites();
  const active = favorites.items.some((item) => item.listing_id === listingId);
  const label = active ? 'Retirer des favoris' : 'Ajouter aux favoris';
  return (
    <button
      type="button"
      className={`${className}${active ? ' is-active' : ''}`}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(listingId);
      }}
    >
      <HeartIcon filled={active} />
    </button>
  );
}

/** Cœur Lucide de l'app, plein quand l'annonce est en favori (aussi « Enregistrer » de la fiche sur ordinateur). */
export function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
