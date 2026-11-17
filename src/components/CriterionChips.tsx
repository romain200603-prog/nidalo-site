import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import '../styles/pieces-app.css';

// Pastille de critère et bouton des filtres de l'app (DesignSystem/Components/CriterionChips.swift), les mêmes
// partout : Votre recherche, la page des filtres, la carte.

export type Criterion = { id: string; label: string };

/**
 * Critère actif : capsule blanche, libellé, croix dans un rond gris. Toucher le libellé ouvre les filtres (`onOpen`) ;
 * toucher la croix retire le critère. Sans `onOpen` (la page des filtres elle-même), seule la croix agit.
 */
export function CriterionChip({ label, onOpen, onRemove, hintId, className = '' }: {
  label: string;
  onOpen?: () => void;
  onRemove: () => void;
  /** Élément « Ouvre les filtres », lu après le libellé (accessibilityHint de l'app). */
  hintId?: string;
  className?: string;
}) {
  return (
    <li className={`criterion-chip ${className}`.trim()}>
      {onOpen ? (
        <button type="button" className="criterion-chip-label" onClick={onOpen} aria-label={`Critère ${label}`} aria-describedby={hintId}>
          {label}
        </button>
      ) : (
        <span className="criterion-chip-label" aria-hidden="true">{label}</span>
      )}
      <button type="button" className="criterion-chip-remove" onClick={onRemove} aria-label={`Retirer le critère ${label}`}>
        <span className="criterion-chip-cross"><Icon name="x" /></span>
      </button>
    </li>
  );
}

type Shown = Criterion & { state: 'shown' | 'new' | 'leaving' };

/**
 * Rangée des critères actifs qui défile à l'horizontale, 8 entre deux pastilles. Une pastille ajoutée apparaît en
 * grandissant, une pastille retirée part en fondu (transition de CriterionChipsRow).
 */
export function CriterionChipsRow({ chips, onOpen, onRemove, label = 'Critères', className = '' }: {
  chips: Criterion[];
  onOpen?: () => void;
  onRemove: (id: string) => void;
  label?: string;
  className?: string;
}) {
  const hintId = useId();
  const key = chips.map((chip) => `${chip.id}\u0000${chip.label}`).join('\u0001');
  const previous = useRef<Criterion[] | null>(null);
  const [leaving, setLeaving] = useState<{ chip: Criterion; index: number }[]>([]);
  const [fresh, setFresh] = useState<string[]>([]);

  // Avant l'affichage : la pastille retirée ne disparaît pas une image avant de partir en fondu.
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = chips;
    if (before === null) return;
    const removed = before.flatMap((chip, index) => (chips.some((c) => c.id === chip.id) ? [] : [{ chip, index }]));
    const added = chips.filter((chip) => !before.some((c) => c.id === chip.id)).map((chip) => chip.id);
    setLeaving(removed);
    setFresh(added);
    if (!removed.length && !added.length) return;
    const timer = window.setTimeout(() => { setLeaving([]); setFresh([]); }, 460);
    return () => window.clearTimeout(timer);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown: Shown[] = chips.map((chip) => ({ ...chip, state: fresh.includes(chip.id) ? 'new' : 'shown' }));
  for (const { chip, index } of leaving) {
    if (!shown.some((c) => c.id === chip.id)) shown.splice(Math.min(index, shown.length), 0, { ...chip, state: 'leaving' });
  }
  if (!shown.length) return null;
  return (
    <>
      <ul className={`criterion-chips ${className}`.trim()} aria-label={label}>
        {shown.map((chip) => (chip.state === 'leaving' ? (
          <li key={`retire-${chip.id}`} className="criterion-chip is-leaving" aria-hidden="true">
            <span className="criterion-chip-label">{chip.label}</span>
            <span className="criterion-chip-remove"><span className="criterion-chip-cross"><Icon name="x" /></span></span>
          </li>
        ) : (
          <CriterionChip key={chip.id} label={chip.label} onOpen={onOpen} onRemove={() => onRemove(chip.id)}
            hintId={onOpen ? hintId : undefined} className={chip.state === 'new' ? 'is-new' : ''} />
        )))}
      </ul>
      {onOpen && <span id={hintId} hidden>Ouvre les filtres</span>}
    </>
  );
}

/**
 * Bouton des filtres (FiltersButton) : carré gris de 48, icône réglages, pastille bleue du nombre de critères.
 * `floating` : sur la carte, fond blanc et ombre des boutons de la carte.
 */
export function FiltersButton({ count, onClick, floating = false, className = '' }: {
  count: number;
  onClick: () => void;
  floating?: boolean;
  className?: string;
}) {
  return (
    <button type="button" className={`filters-button app-filters-button${floating ? ' is-floating' : ''} ${className}`.trim()} onClick={onClick}
      aria-label={count > 0 ? `Filtres avancés, ${count} actifs` : 'Filtres avancés'}>
      <Icon name="sliders" />
      {count > 0 && <span className="filters-count" aria-hidden="true">{count}</span>}
    </button>
  );
}
