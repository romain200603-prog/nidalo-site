import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import type { SavedSearch } from '../lib/account/savedSearches';
import { highlightsFor } from '../lib/highlights';
import { noResultsHints, paramsFromDraft, search, type NoResultsHint, type SearchDraft } from '../lib/search';
import '../styles/recherche-app.css';

// Aucune annonce (SearchNoResults.swift) : des pistes qui en feraient apparaître (un critère en moins, un rayon plus
// large), comptées par de vraies recherches (aucun nombre inventé), puis l'alerte et « Effacer tous les critères ».

type Counted = NoResultsHint & { count: number };

function countText(count: number, invest: boolean): string {
  const noun = invest ? 'opportunité' : 'annonce';
  return count > 1 ? `${count} ${noun}s` : `${count} ${noun}`;
}

/** Carte d'annonce vide et, sur son coin haut droit, un rond bleu avec une loupe. */
function Drawing() {
  return (
    <div className="no-results-drawing" aria-hidden="true">
      <div className="no-results-card">
        <div className="no-results-photo"><Icon name="house" /></div>
        <div className="no-results-lines"><span /><span /></div>
      </div>
      <span className="no-results-loupe"><Icon name="search" /></span>
    </div>
  );
}

export function SearchNoResults({ draft, savedSearch, onApply, onAlert, onEnableAlert, onClear, onGrowZone = null }: {
  draft: SearchDraft;
  /** Recherche déjà enregistrée avec ces critères : son alerte décide du bouton. */
  savedSearch: SavedSearch | null;
  onApply: (draft: SearchDraft) => void;
  /** « M'alerter dès qu'une annonce arrive » sans recherche enregistrée : la feuille « Enregistrer ». */
  onAlert: () => void;
  /** Recherche enregistrée sans alerte : l'alerte s'active. */
  onEnableAlert: (search: SavedSearch) => void;
  onClear: () => void;
  /** Ordinateur, zone dessinée : « Agrandir la zone » du panneau de la carte du téléphone, après les pistes. */
  onGrowZone?: (() => void) | null;
}) {
  /** `null` pendant le calcul. */
  const [hints, setHints] = useState<Counted[] | null>(null);
  const key = paramsFromDraft(draft).toString();
  const invest = draft.mode === 'invest';

  // Recalculées quand les critères changent ; un calcul dépassé est ignoré.
  useEffect(() => {
    let cancelled = false;
    setHints(null);
    const candidates = noResultsHints(draft);
    void Promise.all(candidates.map((candidate) => {
      const next = candidate.draft;
      return search(next, (row) => highlightsFor(row, next.mode === 'invest' ? next.downPayment : null))
        .then((results) => results.length, () => null);
    })).then((counts) => {
      if (cancelled) return;
      const found = candidates.flatMap((candidate, index) => {
        const count = counts[index];
        return count ? [{ ...candidate, count }] : [];
      });
      setHints(found.sort((a, b) => b.count - a.count).slice(0, 3));
    });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="no-results">
      <Drawing />
      <h2 className="no-results-title">Aucune annonce trouvée</h2>
      {hints && (hints.length === 0 ? (
        <p className="no-results-text">Aucune annonce ne correspond à vos critères. Essayez une autre ville ou retirez un critère.</p>
      ) : (
        <>
          <p className="no-results-text">Voici ce qui en ferait apparaître :</p>
          <ul className="no-results-hints">
            {hints.map((hint) => (
              <li key={hint.id}>
                <button type="button" className="no-results-hint" onClick={() => onApply(hint.draft)}>
                  <span className="no-results-hint-label">{hint.label}</span>
                  <span className="no-results-hint-count">{countText(hint.count, invest)}</span>
                  <Icon name="chevronRight" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ))}
      {onGrowZone && (
        <button type="button" className="no-results-grow" onClick={onGrowZone}>
          <Icon name="maximize" />
          Agrandir la zone
        </button>
      )}
      {savedSearch?.alerts_enabled ? (
        <p className="no-results-alert-on"><Icon name="bell" />Alerte active pour cette recherche</p>
      ) : (
        <button type="button" className="no-results-alert" onClick={() => (savedSearch ? onEnableAlert(savedSearch) : onAlert())}>
          <Icon name="bell" />
          M'alerter dès qu'une annonce arrive
        </button>
      )}
      <button type="button" className="no-results-clear" onClick={onClear}>Effacer tous les critères</button>
    </div>
  );
}
