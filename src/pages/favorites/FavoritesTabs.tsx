import { Icon } from '../../components/Icon';
import '../../styles/favoris-app.css';

// Onglets « Favoris » et « Recherches » (FavoritesTabs de FavoritesView.swift, demande du 17/11), les mêmes sur
// téléphone et sur ordinateur : un seul sélecteur, piste grise de 48 (coins 14), pastille bleue à 4 des bords
// (coins 10) qui glisse d'un onglet à l'autre avec le ressort de l'app ; « Réduire les animations » : fondu seul.
// Le nombre de recherches n'apparaît entre parenthèses que s'il y en a au moins une ; le point dit les nouveautés.

export type FavoritesTab = 'favorites' | 'searches';

export function FavoritesTabs({ tab, onChange, searchCount, hasNews }: {
  tab: FavoritesTab;
  onChange: (tab: FavoritesTab) => void;
  searchCount: number;
  hasNews: boolean;
}) {
  return (
    <div className={`fav-tabs is-${tab}`} role="group" aria-label="Favoris ou recherches">
      <span className="fav-tabs-pill" aria-hidden="true" />
      <button type="button" className="fav-tab" aria-pressed={tab === 'favorites'} onClick={() => onChange('favorites')}>
        <Icon name="heart" /><span className="fav-tab-title">Favoris</span>
      </button>
      <button
        type="button"
        className="fav-tab"
        aria-pressed={tab === 'searches'}
        aria-label={`Recherches, ${searchCount}${hasNews ? ', nouveautés' : ''}`}
        onClick={() => onChange('searches')}
      >
        <Icon name="search" /><span className="fav-tab-title">Recherches</span>
        {searchCount > 0 && (
          <span className="fav-tab-count">({searchCount}){hasNews && <span className="fav-tab-dot" aria-hidden="true" />}</span>
        )}
      </button>
    </div>
  );
}
