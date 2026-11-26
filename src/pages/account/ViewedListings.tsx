import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { OfflineState } from '../../components/OfflineState';
import { LISTING_COLUMNS, PUBLIC_STATUSES, UUID_PATTERN, type ListingRow } from '../../lib/listings';
import { listingPath } from '../../lib/paths';
import { clearHistory, clearHistoryMessage, recentlyViewedIds, removeFromHistory } from '../../lib/recentlyViewed';
import { supabase } from '../../lib/supabase';
import { ContentUnavailable } from '../../components/ContentUnavailable';
import { ChoiceDialog } from './DesktopParts';
import { AppListingRow, ScreenHeader, Spinner } from './parts';

// « Biens consultés » (Features/Profile/ViewedListingsView.swift) : les fiches ouvertes par le compte (gardées dans ce
// navigateur, lib/recentlyViewed), de la plus récente à la plus ancienne. Ouvrir un bien, le retirer de l'historique,
// ou tout vider après confirmation. Comme l'app, chaque bien est relu tel que le serveur le rend (une de mes annonces
// en brouillon aussi) ; un bien que le serveur ne rend plus est retiré de l'historique, et une lecture ratée montre
// « Pas de connexion Internet » (n° 225).
// La page de l'app sur toutes les largeurs : en-tête et « Vider » (15 gras bleu), une carte à l'ombre par bien (marges
// 10) avec la ligne d'annonce de l'app (photo 84, prix, type, lieu, petite ligne, pastille d'état ; photo pâlie si le
// bien n'est plus en ligne) et la croix « Retirer de l'historique » à droite. Le glissement « Retirer » de l'iPhone n'a
// pas d'équivalent : la croix fait la même chose.

/** Teinte de la pastille d'état (ViewedListingsView.row) : En ligne vert, Sous offre ambre, sinon rouge. */
const pillTone = (status: string) => (status === 'active' ? 'green' : status === 'underOffer' ? 'amber' : 'red');

/** « Vendu », « Loué »… pour un bien qui n'est plus proposé (ListingStatus.availabilityLabel). */
const AVAILABILITY: Record<string, string> = {
  draft: 'Brouillon',
  active: 'En ligne',
  underOffer: 'Sous offre',
  sold: 'Vendu',
  rented: 'Loué',
  archived: 'Retiré',
};

const isPublic = (status: string) => (PUBLIC_STATUSES as readonly string[]).includes(status);

/** Lecture des fiches de l'historique : les fiches lues et celles que le serveur ne rend plus, ou un échec (réseau). */
type Loaded = { rows: Map<string, ListingRow>; notFound: string[] } | 'failed';

/** Fiches de l'historique, lues d'un coup (l'app les lit une à une). */
async function loadViewed(ids: string[]): Promise<Loaded> {
  const wanted = ids.filter((id) => UUID_PATTERN.test(id));
  const invalid = ids.filter((id) => !UUID_PATTERN.test(id));
  if (!wanted.length) return { rows: new Map(), notFound: invalid };
  try {
    const { data, error } = await supabase.from('listings').select(LISTING_COLUMNS).in('id', wanted);
    if (error) return 'failed';
    const rows = new Map(((data ?? []) as unknown as ListingRow[]).map((row) => [row.id.toLowerCase(), row]));
    return { rows, notFound: [...invalid, ...wanted.filter((id) => !rows.has(id.toLowerCase()))] };
  } catch {
    return 'failed';
  }
}

export function ViewedListings() {
  const [ids, setIds] = useState<string[]>(recentlyViewedIds);
  const [rows, setRows] = useState<Map<string, ListingRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadViewed(recentlyViewedIds()).then((loaded) => {
      if (!alive) return;
      if (loaded === 'failed') {
        // Rien n'a pu être lu faute de réseau : la liste reste, « Réessayer » la relit (n° 225).
        setLoadFailed(true);
      } else {
        // Bien que le serveur ne rend plus (introuvable) : retiré de l'historique, seulement sur cette réponse.
        loaded.notFound.forEach(removeFromHistory);
        setRows(loaded.rows);
        setIds(recentlyViewedIds());
      }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [attempt]);

  function retry() {
    setLoadFailed(false);
    setLoading(true);
    setAttempt((value) => value + 1);
  }

  function remove(id: string) {
    removeFromHistory(id);
    setIds(recentlyViewedIds());
  }

  function clear() {
    clearHistory();
    setIds(recentlyViewedIds());
    setConfirming(false);
  }

  const shown = ids.flatMap((id) => rows.get(id.toLowerCase()) ?? []);

  const dialog = (
    <ChoiceDialog
      open={confirming}
      title="Vider l'historique ?"
      message={clearHistoryMessage(ids.length)}
      onClose={() => setConfirming(false)}
      actions={[
        { label: 'Vider l\'historique', onClick: clear, role: 'destructive' },
        { label: 'Annuler', onClick: () => setConfirming(false), role: 'cancel' },
      ]}
    />
  );

  return (
    <div className="space viewed-screen">
      <ScreenHeader
        title="Biens consultés"
        action={ids.length > 0 && <button type="button" className="viewed-clear" onClick={() => setConfirming(true)}>Vider</button>}
      />
      {ids.length === 0 ? (
        <ContentUnavailable icon="clock" title="Aucun bien consulté" text="Les annonces que vous ouvrez apparaîtront ici." />
      ) : loading && rows.size === 0 ? (
        <Spinner />
      ) : loadFailed && rows.size === 0 ? (
        <OfflineState onRetry={retry} />
      ) : (
        <ul className="viewed-list">
          {shown.map((row) => (
            <li key={row.id} className="viewed-row app-card">
              <a className="viewed-link" href={listingPath(row.id)} aria-label={row.title || undefined}>
                <AppListingRow
                  row={row}
                  dimmed={!isPublic(row.status)}
                  showsShortFacts
                  pills={<span className={`app-pill app-tone-${pillTone(row.status)}`}>{AVAILABILITY[row.status] ?? row.status}</span>}
                />
              </a>
              <button type="button" className="viewed-remove" aria-label="Retirer de l'historique" onClick={() => remove(row.id)}>
                <Icon name="x" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </div>
  );
}
