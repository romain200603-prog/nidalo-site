import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { AlertDialog } from '../listing/Dialogs';
import {
  agencyListingsStore, deleteListing, loadAgencyListings, loadMyListings, myListingsStore, ONLINE_STATUSES, setListingStatus,
} from '../../lib/account/myListings';
import { currentUserId, useStore } from '../../lib/account/session';
import { authorOf, canEditOf, savedTeamView, saveTeamView, teamIds, useTeamScope, type TeamView } from '../../lib/account/team';
import type { ListingRow } from '../../lib/listings';
import { useDesktop } from '../../lib/desktop';
import { listingPath, publishPath } from '../../lib/paths';
import { ActionMenu } from './DesktopParts';
import { AppListingRow, AuthorLine, EmptyState, LoadFailure, ScreenHeader, Spinner, TeamViewSwitch } from './parts';
import { soonPath } from './Screens';

// « Mes annonces » (Features/Profile/MyListingsView.swift). Avec une équipe : « Les miennes » ou « L'agence » (les
// annonces de toute l'agence, avec leur auteur ; un agent ne modifie que les siennes).

type Tab = 'all' | 'online' | 'draft' | 'archived' | 'done';

const TABS: { tab: Tab; title: string; matches: (status: string) => boolean }[] = [
  { tab: 'all', title: 'Toutes', matches: () => true },
  { tab: 'online', title: 'En ligne', matches: (status) => ONLINE_STATUSES.includes(status) },
  { tab: 'draft', title: 'Brouillons', matches: (status) => status === 'draft' },
  { tab: 'archived', title: 'Suspendues', matches: (status) => status === 'archived' },
  { tab: 'done', title: 'Vendues ou louées', matches: (status) => status === 'sold' || status === 'rented' },
];

/** Pastille d'état de l'app (statusLabel, statusTone) : En ligne vert, Sous offre et Brouillon ambre, Suspendue rouge, Vendu et Loué bleu. */
const STATUS_BADGES: Record<string, { text: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'gray' }> = {
  active: { text: 'En ligne', tone: 'green' },
  underOffer: { text: 'Sous offre', tone: 'amber' },
  archived: { text: 'Suspendue', tone: 'red' },
  draft: { text: 'Brouillon', tone: 'amber' },
  sold: { text: 'Vendu', tone: 'blue' },
  rented: { text: 'Loué', tone: 'blue' },
};

const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

function dateLine(row: ListingRow): string {
  const day = shortDate.format(new Date(row.updated_at));
  if (row.status === 'draft') return `Modifiée le ${day}`;
  // En ligne : la date de publication si la ligne la connaît, sinon celle de la dernière modification (n° 223).
  if (ONLINE_STATUSES.includes(row.status) && row.published_at) return `Publiée le ${shortDate.format(new Date(row.published_at))}`;
  return `Mise à jour le ${day}`;
}

export function MyListings() {
  const mine = useStore(myListingsStore);
  const agency = useStore(agencyListingsStore);
  const scope = useTeamScope();
  const [view, setView] = useState<TeamView>(() => savedTeamView('annonces'));
  const showsAgency = scope !== null && view === 'agency';
  const state = showsAgency ? agency : mine;
  const me = currentUserId();
  const [tab, setTab] = useState<Tab>('all');
  const [toDelete, setToDelete] = useState<ListingRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Sur ordinateur, « Reprendre », « Modifier » et « Déposer » ouvrent la page Publier ; sur téléphone, toujours
  // l'écran « bientôt ».
  const desktop = useDesktop();
  const editPath = (id: string, step: 'photos' | null = null) => (desktop ? publishPath(id, step) : soonPath('publier'));

  useEffect(() => {
    void loadMyListings();
  }, []);

  // L'agence : relue quand l'équipe change (un membre arrive ou part).
  const ids = scope ? teamIds(scope).join(',') : '';
  useEffect(() => {
    if (showsAgency && ids) void loadAgencyListings(ids.split(','));
  }, [showsAgency, ids]);

  function chooseView(next: TeamView) {
    setView(next);
    saveTeamView('annonces', next);
  }

  const items = state.status === 'ready' ? state.items : [];
  const shown = items.filter((row) => TABS.find((t) => t.tab === tab)!.matches(row.status));

  // Onglet vidé (« Republier », suppression) : il disparaît, la page revient sur « Toutes » (n° 120).
  const emptiedTab = state.status === 'ready' && tab !== 'all' && shown.length === 0;
  useEffect(() => {
    if (emptiedTab) setTab('all');
  }, [emptiedTab]);

  function retry() {
    if (showsAgency && ids) void loadAgencyListings(ids.split(','));
    else void loadMyListings();
  }

  async function changeStatus(row: ListingRow, status: 'active' | 'archived') {
    setBusy(row.id);
    const failure = await setListingStatus(row.id, status);
    setBusy(null);
    if (failure) setNotice(failure);
  }

  async function confirmDelete() {
    const row = toDelete;
    setToDelete(null);
    if (!row) return;
    setBusy(row.id);
    const failure = await deleteListing(row.id, row.owner_id);
    setBusy(null);
    if (failure) setNotice(failure);
  }

  return (
    <div className="space my-listings-screen">
      <ScreenHeader title="Mes annonces" />
      {scope && <TeamViewSwitch value={view} onChange={chooseView} mine="Les miennes" />}
      <div className="chips-row my-listings-tabs" role="tablist" aria-label="Statut des annonces">
        {TABS.map(({ tab: value, title, matches }) => {
          const count = items.filter((row) => matches(row.status)).length;
          if (value !== 'all' && count === 0) return null;
          return (
            <button key={value} type="button" role="tab" aria-selected={tab === value} className={`select-chip${tab === value ? ' is-selected' : ''}`} onClick={() => setTab(value)}>
              {title} {count}
            </button>
          );
        })}
      </div>
      <a className="btn btn-primary deposit-button" href={desktop ? publishPath() : soonPath('publier')}><Icon name="plus" />Déposer une annonce</a>
      {state.status === 'loading' && <Spinner />}
      {/* Annonces non lues : « Pas de connexion Internet » et « Réessayer » hors ligne, comme l'app ; sinon l'erreur. */}
      {state.status === 'error' && <LoadFailure message={state.message} onRetry={retry} />}
      {state.status === 'ready' && shown.length === 0 && (
        <EmptyState
          icon="house"
          title="Aucune annonce ici"
          text={showsAgency ? 'Les annonces de l\'agence apparaîtront ici dès que l\'équipe en déposera.' : 'Vos annonces apparaîtront ici dès que vous en déposerez une.'}
        />
      )}
      <div className="my-listings">
        {shown.map((row) => {
          const badge = STATUS_BADGES[row.status] ?? { text: row.status, tone: 'gray' };
          const isOnline = ONLINE_STATUSES.includes(row.status);
          const author = authorOf(scope, row.owner_id);
          const editable = canEditOf(scope, row.owner_id, me);
          return (
            <article key={row.id} className="my-listing app-card" aria-busy={busy === row.id}>
              <AppListingRow row={row} pills={<span className={`app-pill app-tone-${badge.tone}`}>{badge.text}</span>} />
              <div className="my-listing-titles">
                <h2>{row.title || 'Annonce sans titre'}</h2>
                <p className="my-listing-date">{dateLine(row)}</p>
                <AuthorLine author={author} verb="Ajoutée par" />
              </div>
              <div className="my-listing-actions">
                {isOnline && <a className="action-button" href={listingPath(row.id)}><Icon name="arrowUpRight" />Voir</a>}
                {!editable ? (
                  !isOnline && <span className="my-listing-readonly">Lecture seule</span>
                ) : row.status === 'archived' ? (
                  <button type="button" className="action-button is-filled" onClick={() => void changeStatus(row, 'active')} disabled={busy === row.id}>
                    <Icon name="arrowUp" />Republier
                  </button>
                ) : row.status === 'draft' ? (
                  <a className="action-button is-filled" href={editPath(row.id)}><Icon name="squarePen" />Reprendre</a>
                ) : (
                  <a className="action-button" href={editPath(row.id)}><Icon name="squarePen" />Modifier</a>
                )}
                {/* Le menu de l'app, avec ses icônes (« Messages (N) » et « Ouvrir des créneaux » restent dans l'app). */}
                {editable && (
                  <ActionMenu label="Actions sur l'annonce" className="my-listing-menu" items={[
                    { label: 'Modifier l\'annonce', icon: 'squarePen', onClick: () => window.location.assign(editPath(row.id)) },
                    { label: 'Mettre à jour les photos', icon: 'image', onClick: () => window.location.assign(editPath(row.id, 'photos')) },
                    ...(isOnline ? [{ label: 'Suspendre', icon: 'pause' as const, onClick: () => void changeStatus(row, 'archived') }] : []),
                    { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => setToDelete(row) },
                  ]} />
                )}
              </div>
            </article>
          );
        })}
      </div>

      <AlertDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Supprimer cette annonce ?"
        message={`« ${toDelete?.title ?? ''} » sera retirée de l'application. Pour la masquer temporairement, suspendez-la plutôt.`}
        actions={[
          { label: 'Supprimer définitivement', onClick: () => void confirmDelete(), role: 'destructive' },
          { label: 'Annuler', onClick: () => setToDelete(null), role: 'cancel' },
        ]}
      />
      <AlertDialog
        open={notice !== null}
        onClose={() => setNotice(null)}
        title={notice ?? ''}
        dismissible={false}
        actions={[{ label: 'OK', onClick: () => setNotice(null), role: 'cancel' }]}
      />
    </div>
  );
}
