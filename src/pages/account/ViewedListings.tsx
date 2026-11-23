import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { OfflineState } from '../../components/OfflineState';
import { formatArea, formatPrice } from '../../lib/format';
import { LISTING_COLUMNS, PUBLIC_STATUSES, photoUrl, sortedPhotos, UUID_PATTERN, type ListingRow } from '../../lib/listings';
import { listingPath } from '../../lib/paths';
import { clearHistory, clearHistoryMessage, recentlyViewedIds, removeFromHistory } from '../../lib/recentlyViewed';
import { supabase } from '../../lib/supabase';
import { ChoiceDialog, ScreenHead, Thumb } from './DesktopParts';
import { Spinner } from './parts';

// « Biens consultés » sur ordinateur (Features/Profile/ViewedListingsView.swift), dans la colonne de 640 px : les
// fiches ouvertes par le compte (gardées dans ce navigateur, lib/recentlyViewed), de la plus récente à la plus
// ancienne. Ouvrir un bien, le retirer de l'historique, ou tout vider après confirmation. Comme l'app, chaque bien est
// relu tel que le serveur le rend (une de mes annonces en brouillon aussi) ; un bien que le serveur ne rend plus est
// retiré de l'historique, et une lecture ratée montre « Pas de connexion Internet » (n° 225).

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

  return (
    <div className="dsc dsc-viewed-screen">
      <ScreenHead
        title="Biens consultés"
        action={ids.length > 0 && <button type="button" className="dsc-button dsc-button-light" onClick={() => setConfirming(true)}>Vider</button>}
      />
      {ids.length === 0 ? (
        <div className="dsc-empty">
          <Icon name="clock" />
          <h2>Aucun bien consulté</h2>
          <p>Les annonces que vous ouvrez apparaîtront ici.</p>
        </div>
      ) : loading && rows.size === 0 ? (
        <Spinner />
      ) : loadFailed && rows.size === 0 ? (
        <OfflineState onRetry={retry} />
      ) : (
        <ul className="dsc-viewed-list">
          {shown.map((row) => {
            const photo = sortedPhotos(row)[0];
            const visible = isPublic(row.status);
            return (
              <li key={row.id} className="dsc-viewed">
                <a className="dsc-viewed-link" href={listingPath(row.id)}>
                  <Thumb url={photo ? photoUrl(photo.storage_path) : null} className={`dsc-viewed-photo${visible ? '' : ' is-faded'}`} />
                  <span className="dsc-viewed-text">
                    <span className="dsc-viewed-title">{row.title}</span>
                    <span className="dsc-viewed-line">{row.city} · {formatArea(row.living_area)}</span>
                    <span className="dsc-viewed-price">
                      <strong>{formatPrice(row.price)}</strong>
                      {row.transaction === 'rent' && <span className="dsc-viewed-month">/mois</span>}
                      {!visible && <span className="dsc-viewed-status">{AVAILABILITY[row.status] ?? row.status}</span>}
                    </span>
                  </span>
                </a>
                <button type="button" className="dsc-viewed-remove" aria-label="Retirer de l'historique" onClick={() => remove(row.id)}>
                  <Icon name="x" />Retirer
                </button>
              </li>
            );
          })}
        </ul>
      )}
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
    </div>
  );
}
