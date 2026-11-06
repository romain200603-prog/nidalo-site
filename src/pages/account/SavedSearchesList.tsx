import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { AlertDialog, Modal } from '../listing/Dialogs';
import { FiltersDialog } from '../FiltersDialog';
import {
  budgetLabelOf, criteriaLabelsOf, deleteSearch, draftFromQuery, loadSavedSearches, markViewed, MODE_TITLES, modeOf,
  placeLabelOf, queryFromDraft, savedSearchesStore, saveSearch, type SavedSearch,
} from '../../lib/account/savedSearches';
import { useStore } from '../../lib/account/session';
import { highlightsFor } from '../../lib/highlights';
import { SEARCH_MODES } from '../../lib/labels';
import { PATHS } from '../../lib/paths';
import { paramsFromDraft, search, type SearchDraft } from '../../lib/search';
import { EmptyState, Spinner } from './parts';

// « Mes recherches » (Features/Profile/SavedSearchesView.swift), dans Mon compte et dans l'onglet Recherches des Favoris.

export type SearchCount = { total: number; news: number };
type Count = SearchCount;

const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

/** « hier », « il y a 3 jours », « aujourd'hui ». */
export function relativeDay(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOf(then) - startOf(now)) / 86_400_000);
  if (days === 0) return 'aujourd’hui';
  if (Math.abs(days) < 30) return relative.format(days, 'day');
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return relative.format(months, 'month');
  return relative.format(Math.round(days / 365), 'year');
}

/** Dernière consultation, ou à défaut la date d'enregistrement : les annonces publiées après sont « nouvelles ». */
function lastSeen(item: SavedSearch): number {
  return Math.max(new Date(item.created_at).getTime(), item.last_viewed_at ? new Date(item.last_viewed_at).getTime() : 0);
}

function highlightsForDraft(draft: SearchDraft) {
  return (row: Parameters<typeof highlightsFor>[0]) => highlightsFor(row, draft.mode === 'invest' ? draft.downPayment : null);
}

/** Nombre de résultats et de nouveautés d'une recherche (comme l'app : la même recherche, relancée). */
export async function countFor(item: SavedSearch): Promise<Count> {
  const draft = draftFromQuery(item.query);
  const results = await search(draft, highlightsForDraft(draft));
  const since = lastSeen(item);
  const newest = results
    .map((result) => result.row)
    .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
    .slice(0, 100);
  const news = newest.filter((row) => row.published_at && new Date(row.published_at).getTime() > since).length;
  return { total: results.length, news };
}

/** Ouvre les résultats de la recherche, dans sa catégorie. */
export function runPath(item: SavedSearch): string {
  return `${PATHS.search}?${paramsFromDraft(draftFromQuery(item.query))}`;
}

export function useSearchCounts(items: SavedSearch[]): Record<string, Count | undefined> {
  const [counts, setCounts] = useState<Record<string, Count | undefined>>({});
  const key = items.map((item) => `${item.id}:${item.last_viewed_at ?? ''}:${JSON.stringify(item.query)}`).join('|');
  useEffect(() => {
    let cancelled = false;
    for (const item of items) {
      countFor(item).then((count) => {
        if (!cancelled) setCounts((current) => ({ ...current, [item.id]: count }));
      }).catch(() => undefined);
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return counts;
}

export function SavedSearchesList({ embedded = false, counts: provided }: {
  embedded?: boolean;
  /** Nombres déjà calculés par la page (onglet Recherches des Favoris) : pas de deuxième série de requêtes. */
  counts?: Record<string, Count | undefined>;
}) {
  const state = useStore(savedSearchesStore);
  const items = state.status === 'ready' ? state.items : [];
  const own = useSearchCounts(provided ? [] : items);
  const counts = provided ?? own;
  const [menu, setMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<SavedSearch | null>(null);
  const [renaming, setRenaming] = useState<SavedSearch | null>(null);
  const [newName, setNewName] = useState('');
  const [toDelete, setToDelete] = useState<SavedSearch | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void loadSavedSearches();
  }, []);

  async function run(item: SavedSearch) {
    await markViewed(item.id).catch(() => undefined);
    window.location.assign(runPath(item));
  }

  async function update(item: SavedSearch, changes: Partial<SavedSearch>) {
    const failure = await saveSearch({ ...item, ...changes });
    if (failure) setNotice(failure);
  }

  async function confirmRename() {
    const item = renaming;
    if (!item) return;
    const name = newName.trim();
    if (!name) {
      setNotice('Donnez un nom à la recherche.');
      return;
    }
    setRenaming(null);
    await update(item, { name });
  }

  async function confirmDelete() {
    const item = toDelete;
    setToDelete(null);
    if (!item) return;
    const failure = await deleteSearch(item.id);
    if (failure) setNotice(failure);
  }

  if (state.status === 'loading' || state.status === 'none') return <Spinner />;
  if (state.status === 'error') return <EmptyState icon="triangleAlert" title="Erreur" text={state.message} />;
  if (!items.length) {
    return (
      <EmptyState
        icon="search"
        title="Aucune recherche sauvegardée"
        text="Lancez une recherche depuis l'accueil pour la retrouver ici."
        action={<a className="btn btn-light" href={PATHS.search}>Rechercher un bien</a>}
      />
    );
  }

  return (
    <div className={`saved-searches${embedded ? ' is-embedded' : ''}`}>
      {items.map((item) => {
        const mode = modeOf(item.query);
        const icon = SEARCH_MODES.find((entry) => entry.mode === mode)?.icon ?? 'search';
        const line = [MODE_TITLES[mode], placeLabelOf(item.query), budgetLabelOf(item.query)].filter(Boolean).join(' · ');
        const criteria = criteriaLabelsOf(item.query).join(' · ');
        const count = counts[item.id];
        const seen = item.last_viewed_at ? `Vue ${relativeDay(item.last_viewed_at)}` : `Enregistrée ${relativeDay(item.created_at)}`;
        const button = count === undefined ? 'Relancer la recherche'
          : count.total === 0 ? 'Aucun résultat pour l\'instant'
            : count.total === 1 ? 'Voir le résultat' : `Voir les ${count.total} résultats`;
        return (
          <article key={item.id} className="saved-search space-card">
            <div className="saved-search-top">
              <span className="tinted-icon"><Icon name={icon} /></span>
              <div className="saved-search-text">
                <h3>{item.name}</h3>
                <p>{line}</p>
                {criteria && <p className="saved-search-criteria">{criteria}</p>}
              </div>
              <div className="menu-anchor">
                <button type="button" className="round-menu" aria-label="Actions sur la recherche" aria-expanded={menu === item.id} onClick={() => setMenu(menu === item.id ? null : item.id)}>
                  <Icon name="ellipsis" />
                </button>
                {menu === item.id && (
                  <div className="menu-popover" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); setEditing(item); }}>Modifier les critères</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); setNewName(item.name); setRenaming(item); }}>Renommer</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); void update(item, { alerts_enabled: !item.alerts_enabled }); }}>
                      {item.alerts_enabled ? 'Désactiver les alertes' : 'Activer les alertes'}
                    </button>
                    <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenu(null); setToDelete(item); }}>Supprimer</button>
                  </div>
                )}
              </div>
            </div>
            <div className="saved-search-meta">
              {count && count.news > 0 && <span className="news-badge">{count.news === 1 ? '1 nouvelle annonce' : `${count.news} nouvelles annonces`}</span>}
              {item.alerts_enabled
                ? <span className="alerts-on"><Icon name="bell" />Alertes actives</span>
                : <span className="alerts-off"><Icon name="bellOff" />Alertes désactivées</span>}
              <span className="seen">{seen}</span>
            </div>
            <button type="button" className="run-button" onClick={() => void run(item)}>
              <Icon name="search" />
              {button}
            </button>
          </article>
        );
      })}

      {editing && (
        <FiltersDialog
          open
          fixedMode
          draft={draftFromQuery(editing.query)}
          onClose={() => setEditing(null)}
          onApply={(draft) => {
            const item = editing;
            setEditing(null);
            void update(item, { query: queryFromDraft(draft) });
          }}
        />
      )}
      <Modal open={renaming !== null} onClose={() => setRenaming(null)} className="alert-dialog" label="Renommer la recherche">
        <form className="alert-body" onSubmit={(event) => { event.preventDefault(); void confirmRename(); }}>
          <h2>Renommer la recherche</h2>
          <input className="text-input" aria-label="Nom" placeholder="Nom" value={newName} maxLength={80} onChange={(event) => setNewName(event.target.value)} autoFocus />
          <div className="alert-actions">
            <button type="submit" className="btn btn-primary">Renommer</button>
            <button type="button" className="btn btn-light" onClick={() => setRenaming(null)}>Annuler</button>
          </div>
        </form>
      </Modal>
      <AlertDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Supprimer cette recherche ?"
        message=""
        actions={[
          { label: `Supprimer « ${toDelete?.name ?? ''} »`, onClick: () => void confirmDelete(), tone: 'primary' },
          { label: 'Annuler', onClick: () => setToDelete(null) },
        ]}
      />
      <AlertDialog
        open={notice !== null}
        onClose={() => setNotice(null)}
        title={notice ?? ''}
        message=""
        actions={[{ label: 'OK', onClick: () => setNotice(null), tone: 'primary' }]}
      />
    </div>
  );
}
