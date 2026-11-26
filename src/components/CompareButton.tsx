import { showToast } from './AppToast';
import { Icon } from './Icon';
import { compareState, compareToast, toggleCompare, useCompare } from '../lib/compare';
import type { SearchMode } from '../lib/labels';
import { comparePath } from '../lib/paths';
import '../styles/comparer-app.css';

// Bouton « Comparer » d'une fiche (CompareButton de l'app, Features/Compare/CompareButton.swift) : ajoute ou retire le
// bien de la comparaison de l'onglet (trois biens au plus) et l'annonce par le message du bas (CompareToast) : « Ajouté
// à la comparaison (2 biens) · Voir », « Retiré de la comparaison », « 3 biens maximum, retirez-en un · Gérer ». « Voir »,
// « Gérer » ou un toucher sur le message ouvrent Comparer.

/** `badge` : pastille ronde de 28 posée sur une photo (cartes de la recherche et de la carte) ; `favoriteCard` : carré
 *  blanc de 36 de la photo d'une carte des favoris. */
export type CompareButtonStyle = 'badge' | 'favoriteCard';

/** Ajoute ou retire le bien, puis le message de l'app ; `mode` : la catégorie de Comparer ouverte par « Voir ». */
export function toggleCompareWithToast(listingId: string, mode: SearchMode | null = null) {
  const message = compareToast(toggleCompare(listingId), compareState().ids.length);
  if (!message) return;
  const action = message.action;
  showToast({
    icon: 'columns',
    text: message.text,
    action: action ? { label: action, accessibilityLabel: action, run: () => window.location.assign(comparePath(mode)) } : undefined,
    wholeToast: true,
  });
}

export function CompareButton({ listingId, style = 'badge', mode = null, className = '' }: {
  listingId: string;
  style?: CompareButtonStyle;
  mode?: SearchMode | null;
  className?: string;
}) {
  const active = useCompare().ids.includes(listingId);
  const label = active ? 'Retirer de la comparaison' : 'Ajouter à la comparaison';
  return (
    <button
      type="button"
      className={`compare-toggle compare-toggle-${style}${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleCompareWithToast(listingId, mode);
      }}
    >
      <Icon name="columns" />
    </button>
  );
}
