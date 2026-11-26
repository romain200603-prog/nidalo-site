import { useId } from 'react';
import { Icon } from './Icon';
import type { IconName } from './iconPaths';
import { SEARCH_MODES, type SearchMode } from '../lib/labels';
import '../styles/pieces-app.css';

/** Carte des catégories de l'accueil : toucher une catégorie ouvre ses filtres, la toucher encore les referme. */
export type ModeAccordion = {
  open: boolean;
  /** Identifiant des filtres ouverts sous les pavés. */
  controls: string;
  onToggle: (mode: SearchMode) => void;
};

/**
 * Choix Résidentiel · Location · Investir · Hôtels : les pavés des catégories de l'app (CategoryTileRow et
 * HomeCategoryButtonStyle, Features/Home/HomeCategoryCard.swift), les mêmes partout (accueil, recherche, filtres).
 * Pavé de 60 au pictogramme de 28, nom dessous, petit trait sous la catégorie choisie ; choisie, le pavé passe en
 * pleine couleur avec le ressort de l'app. Une catégorie est toujours choisie : toucher celle qui l'est ne fait rien.
 * Les flèches du clavier passent d'une catégorie à l'autre.
 * `accordion` (accueil) : aucune catégorie ouverte au départ, chaque pavé ouvre ou referme ses filtres.
 */
export function ModeTabs(props: {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
  className?: string;
  accordion?: ModeAccordion;
  includesAll?: false;
} | {
  /** Vos favoris : « Tous » (`null`) en premier, puis les quatre catégories, dans la carte blanche de l'accueil. */
  mode: SearchMode | null;
  onChange: (mode: SearchMode | null) => void;
  className?: string;
  accordion?: undefined;
  includesAll: true;
}) {
  const { mode, className, accordion } = props;
  const hintId = useId();
  const onChange = props.onChange as (mode: SearchMode | null) => void;
  if (accordion) {
    return (
      <div className={`mode-tabs ${className ?? ''}`} role="group" aria-label="Catégories">
        {SEARCH_MODES.map((item) => {
          const open = accordion.open && item.mode === mode;
          return (
            <button
              key={item.mode}
              type="button"
              aria-expanded={open}
              aria-controls={accordion.controls}
              aria-describedby={`${hintId}-${open ? 'fermer' : 'ouvrir'}`}
              className={`mode-tab mode-tab-${item.mode}${open ? ' is-open' : ''}`}
              onClick={() => accordion.onToggle(item.mode)}
            >
              <span className="mode-tile" aria-hidden="true"><Icon name={item.icon} /></span>
              <span className="mode-name">{item.label}</span>
              <span className="mode-underline" aria-hidden="true" />
            </button>
          );
        })}
        <span id={`${hintId}-ouvrir`} hidden>Affiche les filtres</span>
        <span id={`${hintId}-fermer`} hidden>Referme les filtres</span>
      </div>
    );
  }
  // « Tous » : même pavé, gris neutre, icône des quatre carrés (HomeCategoryButtonStyle, segment sans catégorie).
  const items: { mode: SearchMode | null; label: string; icon: IconName }[] = props.includesAll
    ? [{ mode: null, label: 'Tous', icon: 'layoutGrid' }, ...SEARCH_MODES]
    : SEARCH_MODES;
  return (
    <div className={`mode-tabs${props.includesAll ? ' mode-tabs-all' : ''} ${className ?? ''}`} role="radiogroup"
      aria-label={props.includesAll ? 'Catégories' : 'Type de recherche'}>
      {items.map((item) => (
        <button
          key={item.mode ?? 'all'}
          type="button"
          role="radio"
          aria-checked={item.mode === mode}
          className={`mode-tab mode-tab-${item.mode ?? 'all'}`}
          onClick={() => { if (item.mode !== mode) onChange(item.mode); }}
          onKeyDown={(event) => {
            const index = items.findIndex((m) => m.mode === mode);
            const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            const next = items[(index + step + items.length) % items.length];
            onChange(next.mode);
            const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
            buttons?.[items.indexOf(next)]?.focus();
          }}
          tabIndex={item.mode === mode ? 0 : -1}
        >
          <span className="mode-tile" aria-hidden="true"><Icon name={item.icon} /></span>
          <span className="mode-name">{item.label}</span>
          <span className="mode-underline" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
