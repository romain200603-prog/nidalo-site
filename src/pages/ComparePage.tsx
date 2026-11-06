import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { ListingPhoto } from '../components/PhotoPager';
import { SoonCard } from '../components/SoonCard';
import { clearCompare, COMPARE_MAX, removeFromCompare, setCompareReference, useCompare } from '../lib/compare';
import {
  compareListings, comparisonItem, CRITERION_LABELS, deltaText, isEstimate, noteText, valueText, type Comparison,
  type ComparisonAnalysis, type ComparisonRow, type ComparisonValue,
} from '../lib/comparison';
import { useDesktop } from '../lib/desktop';
import type { SearchMode } from '../lib/labels';
import { DPE_COLORS } from '../lib/labels';
import { fetchListing, ListingNotFound, UUID_PATTERN, type ListingRow } from '../lib/listings';
import { listingModeFromParams, listingPath, PATHS, searchModePath } from '../lib/paths';
import { AlertDialog } from './listing/Dialogs';

// « Comparer » (/comparer/), comme l'écran Comparer de l'app (Features/Compare/CompareView.swift) : les biens choisis
// en colonnes (trois au plus, gardés dans l'onglet), les critères de leur nature, les écarts au bien de référence et
// « Notre analyse ». Sur ordinateur, dans une colonne de 640 px ; en dessous de 1024 px, l'écran « bientôt ».

/** Texte des écrans pas encore sur le site (SoonScreen de Mon compte). */
const SOON_TEXT = 'Cet écran arrive bientôt sur le site. En attendant, il est dans l’app Nidalo, avec le même compte.';

/** Biens lus sur le serveur, par identifiant ; `null` : annonce introuvable ; `'error'` : lecture ratée. */
type Loaded = Map<string, ListingRow | null | 'error'>;

function useComparedListings(ids: string[]): { rows: Loaded; loading: boolean; retry: () => void } {
  const [rows, setRows] = useState<Loaded>(() => new Map());
  const missing = ids.filter((id) => !rows.has(id));
  const key = missing.join(',');
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const wanted = key.split(',');
    void Promise.all(wanted.map(async (id) => {
      if (!UUID_PATTERN.test(id)) return [id, null] as const;
      try {
        return [id, await fetchListing(id)] as const;
      } catch (error) {
        return [id, error instanceof ListingNotFound ? null : 'error' as const] as const;
      }
    })).then((entries) => {
      if (cancelled) return;
      setRows((previous) => {
        const next = new Map(previous);
        for (const [id, row] of entries) next.set(id, row);
        return next;
      });
      // Annonce retirée ou introuvable : elle quitte la comparaison, sinon elle y prendrait une des trois places.
      for (const [id, row] of entries) if (row === null) removeFromCompare(id);
    });
    return () => { cancelled = true; };
  }, [key]);
  /** « Réessayer » : les lectures ratées repartent. */
  const retry = () => setRows((previous) => new Map([...previous].filter(([, row]) => row !== 'error')));
  return { rows, loading: missing.length > 0, retry };
}

/** « Fermer » : retour à la page d'avant sur le site, sinon la recherche. */
function closeCompare(mode: SearchMode | null) {
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer && referrer.origin === window.location.origin && window.history.length > 1) {
      window.history.back();
      return;
    }
  } catch {
    // Adresse précédente illisible : la recherche.
  }
  window.location.assign(mode ? searchModePath(mode) : PATHS.search);
}

function EnergyValue({ letter }: { letter: string }) {
  return (
    <span className="cmp-energy" style={{ background: DPE_COLORS[letter], color: letter <= 'C' ? '#FFFFFF' : 'var(--d-text)' }}>
      {letter}
    </span>
  );
}

function Cell({ row, index, now }: { row: ComparisonRow; index: number; now: Date }) {
  const value: ComparisonValue | null = row.values[index];
  const delta = row.deltas[index];
  return (
    <>
      {value ? (
        <span className="cmp-value">
          {value.kind === 'energy' ? <EnergyValue letter={value.letter} /> : <span className="cmp-value-text">{valueText(value, row.criterion, now)}</span>}
          {isEstimate(row.criterion) && <span className="cmp-estimate">est.</span>}
        </span>
      ) : (
        <span className="cmp-missing">Non renseigné</span>
      )}
      {delta && <span className={`cmp-delta is-${delta.assessment}`}>{deltaText(delta.difference, row.criterion)}</span>}
    </>
  );
}

function Analysis({ analysis, year }: { analysis: ComparisonAnalysis; year: number }) {
  if (!analysis.strengths.length && !analysis.warnings.length) return <p className="cmp-no-gap">Pas d'écart marquant.</p>;
  return (
    <ul className="cmp-notes">
      {analysis.strengths.map((note, index) => (
        <li key={`s${index}`} className="is-strength"><Icon name="check" />{noteText(note, year)}</li>
      ))}
      {analysis.warnings.map((note, index) => (
        <li key={`w${index}`} className="is-warning"><Icon name="triangleAlert" />{noteText(note, year)}</li>
      ))}
    </ul>
  );
}

function CompareTable({ comparison, mode }: { comparison: Comparison; mode: SearchMode | null }) {
  const now = new Date();
  const year = now.getFullYear();
  const reference = comparison.referenceIndex;
  const refClass = (index: number) => (index === reference ? ' is-reference' : '');
  return (
    <div className="cmp-card">
      <table className="cmp-table">
        <colgroup>
          <col className="cmp-col-criterion" />
          {comparison.items.map((item) => <col key={item.id} />)}
        </colgroup>
        <thead>
          <tr>
            <td className="cmp-corner" />
            {comparison.items.map((item, index) => (
              <th key={item.id} scope="col" className={`cmp-head${refClass(index)}`}>
                <span className="cmp-photo">
                  <ListingPhoto photo={item.photo} />
                  {index === reference && (
                    <span className="cmp-star" role="img" aria-label="Bien de référence"><Icon name="star" /></span>
                  )}
                  <button type="button" className="cmp-remove" onClick={() => removeFromCompare(item.id)} aria-label="Retirer de la comparaison" title="Retirer de la comparaison">
                    <Icon name="x" />
                  </button>
                </span>
                <a className="cmp-title" href={listingPath(item.id, mode)}>{item.title}</a>
                <span className="cmp-city">{item.city}</span>
                {index === reference ? (
                  <span className="cmp-reference">Référence</span>
                ) : (
                  <button type="button" className="cmp-make-reference" onClick={() => setCompareReference(item.id)}>Prendre en référence</button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => {
            const label = CRITERION_LABELS[row.criterion];
            return (
              <tr key={row.criterion}>
                <th scope="row" className="cmp-criterion"><Icon name={label.icon} />{label.text}</th>
                {comparison.items.map((item, index) => (
                  <td key={item.id} className={`cmp-cell${refClass(index)}`}><Cell row={row} index={index} now={now} /></td>
                ))}
              </tr>
            );
          })}
          <tr className="cmp-analysis-row">
            <th scope="row" className="cmp-criterion"><Icon name="thumbsUp" />Notre analyse</th>
            {comparison.items.map((item, index) => (
              <td key={item.id} className={`cmp-cell${refClass(index)}`}><Analysis analysis={comparison.analyses[index]} year={year} /></td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function DesktopCompare({ mode }: { mode: SearchMode | null }) {
  const compare = useCompare();
  const { rows, loading, retry } = useComparedListings(compare.ids);
  const [confirmClear, setConfirmClear] = useState(false);

  const comparison = useMemo(() => {
    const items = compare.ids
      .map((id) => rows.get(id))
      .filter((row): row is ListingRow => !!row && row !== 'error')
      .map((row) => comparisonItem(row, mode));
    const index = items.findIndex((item) => item.id === compare.referenceId);
    return compareListings(items, index >= 0 ? index : 0);
  }, [compare.ids, compare.referenceId, rows, mode]);

  const failed = compare.ids.some((id) => rows.get(id) === 'error');
  const nothing = !loading && comparison.items.length === 0;
  // Vide aussi quand aucun des biens n'existe plus (ils quittent la comparaison).
  const empty = compare.ids.length === 0 || (nothing && !failed);
  const unavailable = !empty && nothing && failed;
  const waiting = !empty && loading && comparison.items.length === 0;

  return (
    <div className="wrap wrap-narrow cmp">
      <header className="cmp-head-row">
        <div className="cmp-titles">
          <h1>Comparer</h1>
          <p>Comparez facilement les biens pour faire le meilleur choix.</p>
        </div>
        <button type="button" className="cmp-close" onClick={() => closeCompare(mode)}>
          <Icon name="x" />
          Fermer
        </button>
      </header>

      {empty && (
        <div className="cmp-empty">
          <span className="cmp-empty-icon" aria-hidden="true"><Icon name="columns" /></span>
          <h2>Comparez vos biens préférés</h2>
          <p>Ajoutez des biens depuis vos recherches pour comparer leurs caractéristiques en un coup d'œil.</p>
          <a className="cmp-discover" href={mode ? searchModePath(mode) : PATHS.search}>Découvrir les biens</a>
        </div>
      )}
      {waiting && <div className="cmp-loading" role="status" aria-busy="true"><span className="cmp-spinner" aria-hidden="true" />Chargement…</div>}
      {unavailable && (
        // Comme la fiche quand le serveur ne répond pas : le message et « Réessayer ».
        <div className="cmp-empty cmp-error" role="alert">
          <span className="cmp-empty-icon" aria-hidden="true"><Icon name="triangleAlert" /></span>
          <h2>Comparaison indisponible</h2>
          <p>Impossible de charger les biens. Réessayez dans un instant.</p>
          <button type="button" className="cmp-discover" onClick={retry}>Réessayer</button>
        </div>
      )}
      {!empty && !waiting && !unavailable && (
        <div className="cmp-content">
          {comparison.isMixed && (
            <p className="cmp-mixed"><Icon name="info" />Biens de natures différentes : seuls les critères communs sont comparés.</p>
          )}
          <CompareTable comparison={comparison} mode={mode} />
          {comparison.items.length < COMPARE_MAX && (
            <a className="cmp-add" href={mode ? searchModePath(mode) : PATHS.search}>
              <Icon name="plus" />
              Ajouter un bien depuis la recherche
            </a>
          )}
          <button type="button" className="cmp-clear" onClick={() => setConfirmClear(true)}>Vider la comparaison</button>
        </div>
      )}

      <AlertDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Vider la comparaison ?"
        message="Les biens restent dans vos favoris et vos recherches."
        actions={[
          { label: 'Vider', onClick: () => { clearCompare(); setConfirmClear(false); }, tone: 'primary' },
          { label: 'Annuler', onClick: () => setConfirmClear(false), tone: 'quiet' },
        ]}
      />
    </div>
  );
}

export function ComparePage() {
  const desktop = useDesktop();
  const mode = useMemo(() => listingModeFromParams(new URLSearchParams(window.location.search)), []);
  return (
    <Page section="search" mode={mode}>
      {desktop ? <DesktopCompare mode={mode} /> : <SoonCard icon="columns" title="Comparer" text={SOON_TEXT} />}
    </Page>
  );
}
