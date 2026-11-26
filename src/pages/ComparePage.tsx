import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HidesTabBar } from '../components/HidesTabBar';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { OfflineState } from '../components/OfflineState';
import { ListingPhoto } from '../components/PhotoPager';
import { useRailScroll } from '../components/useRailScroll';
import { editableProjectStore, loadEditableProject } from '../lib/account/projectEditor';
import { useSession, useStore } from '../lib/account/session';
import { clearCompare, COMPARE_MAX, removeFromCompare, setCompareReference, useCompare } from '../lib/compare';
import {
  compareListings, comparisonItem, CRITERION_LABELS, deltaText, isEstimate, noteText, projectDownPayment, valueText, type Comparison,
  type ComparisonAnalysis, type ComparisonRow, type ComparisonValue,
} from '../lib/comparison';
import type { SearchMode } from '../lib/labels';
import { DPE_COLORS } from '../lib/labels';
import { fetchListing, ListingNotFound, UUID_PATTERN, type ListingRow } from '../lib/listings';
import { listingModeFromParams, listingPath, PATHS, searchModePath } from '../lib/paths';
import { AlertDialog } from './listing/Dialogs';
import '../styles/comparer-app.css';

// « Comparer » (/comparer/), comme l'écran Comparer de l'app (Features/Compare/CompareView.swift) : les biens choisis
// en colonnes (trois au plus, gardés dans l'onglet), les critères de leur nature, les écarts au bien de référence et
// « Notre analyse ». L'écran plein écran de l'app (sans barre d'onglets) : colonne des critères figée de 96 et colonnes
// de 128 qui défilent de côté ; à partir de 1024 px, dans le grand conteneur (1180 px).

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

/**
 * Apport du projet du compte pour « Mensualité (est.) » (container.account.project dans l'app, n° 65) : `undefined`
 * tant que la session ou le projet se lisent ; `null` sans compte, sans apport, ou si le projet n'a pas pu être lu.
 */
function useProjectDownPayment() {
  const session = useSession();
  const project = useStore(editableProjectStore);
  const userId = session.status === 'signedIn' ? session.userId : null;
  useEffect(() => {
    if (userId) void loadEditableProject();
  }, [userId]);
  return useMemo(() => {
    if (session.status === 'loading') return undefined;
    if (!userId || project.status === 'error') return null;
    return project.status === 'ready' ? projectDownPayment(project.project) : undefined;
  }, [session.status, userId, project]);
}

/** État de l'écran : la comparaison des biens lus, et ce qu'il faut montrer. */
function useComparisonScreen(mode: SearchMode | null) {
  const compare = useCompare();
  const { rows, loading, retry } = useComparedListings(compare.ids);
  const downPayment = useProjectDownPayment();

  const comparison = useMemo(() => {
    const items = compare.ids
      .map((id) => rows.get(id))
      .filter((row): row is ListingRow => !!row && row !== 'error')
      .map((row) => comparisonItem(row, mode, downPayment ?? null));
    const index = items.findIndex((item) => item.id === compare.referenceId);
    return compareListings(items, index >= 0 ? index : 0);
  }, [compare.ids, compare.referenceId, rows, mode, downPayment]);

  const failed = compare.ids.some((id) => rows.get(id) === 'error');
  const nothing = !loading && comparison.items.length === 0;
  // Vide aussi quand aucun des biens n'existe plus (ils quittent la comparaison).
  const empty = compare.ids.length === 0 || (nothing && !failed);
  const unavailable = !empty && nothing && failed;
  // Le tableau attend aussi l'apport du projet : la mensualité ne change pas sous les yeux.
  const waiting = !empty && !unavailable && ((loading && comparison.items.length === 0) || downPayment === undefined);
  return { comparison, retry, empty, unavailable, waiting };
}

/** « Vider la comparaison ? » (domiaConfirmationDialog de l'app) : les biens restent dans les favoris et les recherches. */
function ClearDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AlertDialog
      open={open}
      onClose={onClose}
      title="Vider la comparaison ?"
      message="Les biens restent dans vos favoris et vos recherches."
      actions={[
        { label: 'Vider', onClick: () => { clearCompare(); onClose(); }, role: 'destructive' },
        { label: 'Annuler', onClick: onClose, role: 'cancel' },
      ]}
    />
  );
}

// MARK: - Écran (CompareView.swift)

/** Case d'un bien (CompareView.cell) : valeur en 13 gras et « est. », ou « Non renseigné » ; écart en pastille. */
function PhoneCell({ row, index, now }: { row: ComparisonRow; index: number; now: Date }) {
  const value: ComparisonValue | null = row.values[index];
  const delta = row.deltas[index];
  return (
    <>
      {value ? (
        <span className="cmpm-value">
          {value.kind === 'energy' ? (
            <span className="cmpm-energy" style={{ background: DPE_COLORS[value.letter], color: value.letter <= 'C' ? '#FFFFFF' : 'var(--app-navy)' }}>{value.letter}</span>
          ) : (
            <span className="cmpm-value-text">{valueText(value, row.criterion, now)}</span>
          )}
          {isEstimate(row.criterion) && <span className="cmpm-estimate">est.</span>}
        </span>
      ) : (
        <span className="cmpm-missing">Non renseigné</span>
      )}
      {delta && <span className={`cmpm-delta is-${delta.assessment}`}>{deltaText(delta.difference, row.criterion)}</span>}
    </>
  );
}

function PhoneAnalysis({ analysis, year }: { analysis: ComparisonAnalysis; year: number }) {
  if (!analysis.strengths.length && !analysis.warnings.length) return <p className="cmpm-no-gap">Pas d'écart marquant.</p>;
  return (
    <ul className="cmpm-notes">
      {analysis.strengths.map((note, index) => (
        <li key={`s${index}`} className="is-strength"><Icon name="circleCheck" /><span>{noteText(note, year)}</span></li>
      ))}
      {analysis.warnings.map((note, index) => (
        <li key={`w${index}`} className="is-warning"><Icon name="triangleAlert" /><span>{noteText(note, year)}</span></li>
      ))}
    </ul>
  );
}

/**
 * Tableau de l'app : la colonne des critères (96) reste à gauche ; les biens, en colonnes de 128 espacées de 8,
 * défilent de côté (deux colonnes visibles sur un iPhone). En-tête de 186, lignes de 50, « Notre analyse » de 58 par
 * note (une au moins) plus 24. Le bien de référence : colonne bleu pâle cerclée de bleu. Lecteur d'écran : chaque
 * colonne se lit d'un bloc (titre du bien, puis chaque critère et sa valeur), comme VoiceOver dans l'app.
 */
function PhoneCompareTable({ comparison, mode }: { comparison: Comparison; mode: SearchMode | null }) {
  const now = new Date();
  const year = now.getFullYear();
  const reference = comparison.referenceIndex;
  const notes = Math.max(1, ...comparison.analyses.map((analysis) => analysis.strengths.length + analysis.warnings.length));
  const analysisHeight = notes * 58 + 24;
  const criteria = useRef<HTMLDivElement>(null);
  // Nom de critère sur deux lignes au plus ; trop long, il rapetisse jusqu'à 85 % avant « … » (minimumScaleFactor 0,85).
  useLayoutEffect(() => {
    for (const label of criteria.current?.querySelectorAll<HTMLElement>('.cmpm-criterion span') ?? []) {
      label.style.removeProperty('font-size');
      for (let scale = 0.95; label.scrollHeight > label.clientHeight + 0.5 && scale > 0.84; scale -= 0.05) label.style.fontSize = `${(11.5 * scale).toFixed(2)}px`;
    }
  });
  return (
    <div className="cmpm-card">
      <div ref={criteria} className="cmpm-criteria" aria-hidden="true">
        <div className="cmpm-criteria-head" />
        {comparison.rows.map((row) => {
          const label = CRITERION_LABELS[row.criterion];
          return <div key={row.criterion} className="cmpm-criterion"><Icon name={label.icon} /><span>{label.text}</span></div>;
        })}
        <div className="cmpm-criterion is-analysis" style={{ height: analysisHeight }}><Icon name="thumbsUp" /><span>Notre analyse</span></div>
      </div>
      <div className="cmpm-scroll">
        <ul className="cmpm-columns" aria-label="Biens comparés">
          {comparison.items.map((item, index) => (
            <li key={item.id} className={`cmpm-column${index === reference ? ' is-reference' : ''}`}>
              <div className="cmpm-head">
                <span className="cmpm-photo">
                  <ListingPhoto photo={item.photo} />
                  {index === reference && <span className="cmpm-star" role="img" aria-label="Bien de référence"><Icon name="star" /></span>}
                  <button type="button" className="cmpm-remove" onClick={() => removeFromCompare(item.id)} aria-label="Retirer de la comparaison" title="Retirer de la comparaison">
                    <Icon name="x" />
                  </button>
                </span>
                <h2 className="cmpm-title"><a className="stretched" href={listingPath(item.id, mode)}>{item.title}</a></h2>
                <span className="cmpm-city">{item.city}</span>
                {index === reference ? (
                  <span className="cmpm-reference">Référence</span>
                ) : (
                  <button type="button" className="cmpm-make-reference" onClick={() => setCompareReference(item.id)}>Prendre en référence</button>
                )}
              </div>
              <dl className="cmpm-values">
                {comparison.rows.map((row) => (
                  <div key={row.criterion} className="cmpm-cell">
                    <dt className="visually-hidden">{CRITERION_LABELS[row.criterion].text}</dt>
                    <dd><PhoneCell row={row} index={index} now={now} /></dd>
                  </div>
                ))}
                <div className="cmpm-analysis" style={{ height: analysisHeight }}>
                  <dt className="visually-hidden">Notre analyse</dt>
                  <dd><PhoneAnalysis analysis={comparison.analyses[index]} year={year} /></dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Écran Comparer : plein écran comme dans l'app (domiaFullScreenCover), la barre d'onglets masquée. */
function PhoneCompare({ mode }: { mode: SearchMode | null }) {
  const { comparison, retry, empty, unavailable, waiting } = useComparisonScreen(mode);
  const [confirmClear, setConfirmClear] = useState(false);
  const discover = mode ? searchModePath(mode) : PATHS.search;

  return (
    <div className="cmpm">
      <HidesTabBar />
      <header className="cmpm-header">
        <div className="cmpm-titles">
          <h1>Comparer</h1>
          <p>Comparez facilement les biens pour faire le meilleur choix.</p>
        </div>
        <button type="button" className="cmpm-close" onClick={() => closeCompare(mode)}>
          <Icon name="x" />
          Fermer
        </button>
      </header>

      {empty && (
        <div className="cmpm-center cmpm-empty">
          <span className="cmpm-empty-icon" aria-hidden="true"><Icon name="columns" /></span>
          <h2>Comparez vos biens préférés</h2>
          <p>Ajoutez des biens depuis vos recherches pour comparer leurs caractéristiques en un coup d'œil.</p>
          <a className="cmpm-discover" href={discover}>Découvrir les biens</a>
        </div>
      )}
      {waiting && <div className="cmpm-center"><span className="spinner" role="status" aria-label="Chargement" /></div>}
      {/* Aucun bien lu (pas de connexion, serveur qui ne répond pas) : « Pas de connexion Internet » (n° 64). */}
      {unavailable && <div className="cmpm-center"><OfflineState onRetry={retry} /></div>}
      {!empty && !waiting && !unavailable && (
        <div className="cmpm-content">
          {comparison.isMixed && (
            <p className="cmpm-mixed"><Icon name="info" />Biens de natures différentes : seuls les critères communs sont comparés.</p>
          )}
          <PhoneCompareTable comparison={comparison} mode={mode} />
          {comparison.items.length < COMPARE_MAX && (
            <a className="cmpm-add" href={discover}>
              <Icon name="plus" />
              Ajouter un bien depuis la recherche
            </a>
          )}
          <button type="button" className="cmpm-clear" onClick={() => setConfirmClear(true)}>Vider la comparaison</button>
        </div>
      )}

      <ClearDialog open={confirmClear} onClose={() => setConfirmClear(false)} />
    </div>
  );
}

export function ComparePage() {
  useRailScroll();
  const mode = useMemo(() => listingModeFromParams(new URLSearchParams(window.location.search)), []);
  return (
    <Page section="search" wide>
      <PhoneCompare mode={mode} />
    </Page>
  );
}
