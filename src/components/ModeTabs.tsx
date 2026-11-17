import { useId } from 'react';
import { Icon } from './Icon';
import { SEARCH_MODES, type SearchMode } from '../lib/labels';
import '../styles/pieces-app.css';

/** Carte des catégories de l'accueil du téléphone : toucher une catégorie ouvre ses filtres, la toucher encore les referme. */
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
 * `accordion` (accueil du téléphone) : aucune catégorie ouverte au départ, chaque pavé ouvre ou referme ses filtres.
 */
export function ModeTabs({ mode, onChange, className, accordion }: {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
  className?: string;
  accordion?: ModeAccordion;
}) {
  const hintId = useId();
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
  return (
    <div className={`mode-tabs ${className ?? ''}`} role="radiogroup" aria-label="Type de recherche">
      {SEARCH_MODES.map((item) => (
        <button
          key={item.mode}
          type="button"
          role="radio"
          aria-checked={item.mode === mode}
          className={`mode-tab mode-tab-${item.mode}`}
          onClick={() => { if (item.mode !== mode) onChange(item.mode); }}
          onKeyDown={(event) => {
            const index = SEARCH_MODES.findIndex((m) => m.mode === mode);
            const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            const next = SEARCH_MODES[(index + step + SEARCH_MODES.length) % SEARCH_MODES.length];
            onChange(next.mode);
            const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
            buttons?.[SEARCH_MODES.indexOf(next)]?.focus();
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
