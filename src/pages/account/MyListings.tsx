import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { AlertDialog } from '../listing/Dialogs';
import {
  agencyListingsStore, deleteListing, loadAgencyListings, loadMyListings, myListingsStore, ONLINE_STATUSES, setListingStatus,
} from '../../lib/account/myListings';
import { currentUserId, useStore } from '../../lib/account/session';
import { authorOf, canEditOf, savedTeamView, saveTeamView, teamIds, useTeamScope, type TeamView } from '../../lib/account/team';
import { formatCardPrice, cardContent } from '../../lib/cardContent';
import { photoUrl, sortedPhotos, type ListingRow } from '../../lib/listings';
import { useDesktop } from '../../lib/desktop';
import { listingPath, publishPath } from '../../lib/paths';
import { AuthorLine, EmptyState, ScreenHeader, Spinner, TeamViewSwitch } from './parts';
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

const STATUS_BADGES: Record<string, { text: string; tone: string }> = {
  active: { text: 'En ligne', tone: 'positive' },
  underOffer: { text: 'Sous offre', tone: 'positive' },
  archived: { text: 'Suspendue', tone: 'estimated' },
  draft: { text: 'Brouillon', tone: 'muted' },
  sold: { text: 'Vendu', tone: 'brand' },
  rented: { text: 'Loué', tone: 'brand' },
};

const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

function dateLine(row: ListingRow): string {
  const day = shortDate.format(new Date(row.updated_at));
  if (row.status === 'draft') return `Modifiée le ${day}`;
  if (ONLINE_STATUSES.includes(row.status)) return `Publiée le ${day}`;
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
  const [menu, setMenu] = useState<string | null>(null);
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
    setMenu(null);
  }

  const items = state.status === 'ready' ? state.items : [];
  const shown = items.filter((row) => TABS.find((t) => t.tab === tab)!.matches(row.status));

  async function changeStatus(row: ListingRow, status: 'active' | 'archived') {
    setMenu(null);
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
    <div className="space">
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
      {state.status === 'error' && <EmptyState icon="triangleAlert" title="Erreur" text={state.message} />}
      {state.status === 'ready' && shown.length === 0 && (
        <EmptyState
          icon="house"
          title="Aucune annonce ici"
          text={showsAgency ? 'Les annonces de l\'agence apparaîtront ici dès que l\'équipe en déposera.' : 'Vos annonces apparaîtront ici dès que vous en déposerez une.'}
        />
      )}
      <div className="my-listings">
        {shown.map((row) => {
          const badge = STATUS_BADGES[row.status] ?? { text: row.status, tone: 'muted' };
          const photo = sortedPhotos(row)[0];
          const price = formatCardPrice(cardContent(row, null, null).price);
          const isOnline = ONLINE_STATUSES.includes(row.status);
          const author = authorOf(scope, row.owner_id);
          const editable = canEditOf(scope, row.owner_id, me);
          return (
            <article key={row.id} className="my-listing space-card" aria-busy={busy === row.id}>
              <div className="my-listing-top">
                <span className="my-listing-photo">
                  {photo ? <img src={photoUrl(photo.storage_path)} alt="" width={92} height={80} loading="lazy" /> : <Icon name="image" />}
                </span>
                <div className="my-listing-text">
                  <div className="my-listing-title-row">
                    <h2>{row.title || 'Annonce sans titre'}</h2>
                    <span className={`status-badge tone-${badge.tone}`}>{badge.text}</span>
                  </div>
                  <p className="my-listing-line">{row.transaction === 'rent' ? 'Location' : 'Vente'} · {row.city}</p>
                  <p className="my-listing-price"><strong>{price.amount}</strong>{price.suffix && <span>{price.suffix}</span>}</p>
                  <p className="my-listing-date">{dateLine(row)}</p>
                  <AuthorLine author={author} verb="Ajoutée par" />
                </div>
              </div>
              <div className="my-listing-actions">
                {isOnline && <a className="action-button" href={listingPath(row.id)}><Icon name="eye" />Voir</a>}
                {!editable ? (
                  !isOnline && <span className="my-listing-readonly">Lecture seule</span>
                ) : row.status === 'archived' ? (
                  <button type="button" className="action-button is-filled" onClick={() => void changeStatus(row, 'active')} disabled={busy === row.id}>
                    <Icon name="rotateCcw" />Republier
                  </button>
                ) : row.status === 'draft' ? (
                  <a className="action-button is-filled" href={editPath(row.id)}><Icon name="pen" />Reprendre</a>
                ) : (
                  <a className="action-button" href={editPath(row.id)}><Icon name="pen" />Modifier</a>
                )}
                {editable && <div className="menu-anchor">
                  <button
                    type="button"
                    className="round-menu"
                    aria-label="Actions sur l'annonce"
                    aria-expanded={menu === row.id}
                    onClick={() => setMenu(menu === row.id ? null : row.id)}
                  >
                    <Icon name="ellipsis" />
                  </button>
                  {menu === row.id && (
                    <div className="menu-popover" role="menu">
                      <a role="menuitem" href={editPath(row.id)}>Modifier l&apos;annonce</a>
                      <a role="menuitem" href={editPath(row.id, 'photos')}>Mettre à jour les photos</a>
                      {isOnline && <button type="button" role="menuitem" onClick={() => void changeStatus(row, 'archived')}>Suspendre</button>}
                      <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenu(null); setToDelete(row); }}>Supprimer</button>
                    </div>
                  )}
                </div>}
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
          { label: 'Supprimer définitivement', onClick: () => void confirmDelete(), tone: 'primary' },
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
