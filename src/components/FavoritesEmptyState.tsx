import { Icon } from './Icon';
import { PATHS } from '../lib/paths';
import '../styles/favoris-app.css';

// État vide illustré de Vos favoris (FavoritesEmptyState.swift de l'app, demande du 17/11) : un dessin, un titre, un
// texte et « Rechercher un bien » sur toute la largeur. Deux sortes, un seul composant : aucun favori (onglet Favoris)
// et aucune recherche enregistrée (onglet Recherches, Mon espace › Mes recherches). Les dessins ne se touchent pas.

export type FavoritesEmptyKind = 'favorites' | 'searches';

const TEXTS: Record<FavoritesEmptyKind, { title: string; message: string }> = {
  favorites: {
    title: 'Aucun favori pour l\'instant',
    message: 'Touchez le cœur d\'une annonce pour la retrouver ici et la comparer.',
  },
  searches: {
    title: 'Aucune recherche enregistrée',
    message: 'Touchez Enregistrer sur une recherche pour la retrouver ici, avec ses nouveautés.',
  },
};

/** Deux cartes d'annonce dessinées (248 × 124) : celle de devant porte un cœur plein, entouré d'un anneau qui grandit. */
function FavoriteCardsDrawing() {
  return (
    <div className="fav-empty-cards">
      <span className="fav-ghost is-back">
        <span className="fav-ghost-photo" />
        <span className="fav-ghost-lines"><span /><span /></span>
      </span>
      <span className="fav-ghost is-front">
        <span className="fav-ghost-photo"><Icon name="house" /></span>
        <span className="fav-ghost-lines"><span /><span /></span>
        <span className="fav-ghost-heart">
          <span className="fav-pulse" />
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </span>
      </span>
    </div>
  );
}

/** Une carte « 6 annonces · Triées par pertinence » avec un petit « Enregistrer » dessiné, entouré d'un anneau. */
function SaveSearchDrawing() {
  return (
    <div className="fav-empty-search">
      <span className="fav-empty-search-text">
        <span className="fav-empty-search-count">6 annonces</span>
        <span className="fav-empty-search-sort">Triées par pertinence</span>
      </span>
      <span className="fav-empty-save">
        <span className="fav-pulse" />
        <Icon name="bookmark" />Enregistrer
      </span>
    </div>
  );
}

export function FavoritesEmptyState({ kind, className }: { kind: FavoritesEmptyKind; className?: string }) {
  const text = TEXTS[kind];
  return (
    <div className={`fav-empty is-${kind}${className ? ` ${className}` : ''}`}>
      <div className="fav-empty-drawing" aria-hidden="true">
        {kind === 'favorites' ? <FavoriteCardsDrawing /> : <SaveSearchDrawing />}
      </div>
      <h2 className="fav-empty-title">{text.title}</h2>
      <p className="fav-empty-message">{text.message}</p>
      <a className="fav-empty-button" href={PATHS.search}>
        <Icon name="search" />Rechercher un bien
      </a>
    </div>
  );
}
