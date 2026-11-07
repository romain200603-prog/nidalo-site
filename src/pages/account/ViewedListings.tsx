import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { formatArea, formatPrice } from '../../lib/format';
import { LISTING_COLUMNS, PUBLIC_STATUSES, photoUrl, sortedPhotos, UUID_PATTERN, type ListingRow } from '../../lib/listings';
import { listingPath } from '../../lib/paths';
import { clearHistory, recentlyViewedIds, removeFromHistory } from '../../lib/recentlyViewed';
import { supabase } from '../../lib/supabase';
import { ChoiceDialog, ScreenHead, Thumb } from './DesktopParts';
import { Spinner } from './parts';

// « Biens consultés » sur ordinateur (Features/Profile/ViewedListingsView.swift), dans la colonne de 640 px : les
// fiches ouvertes sur le site pendant la session (sessionStorage, lib/recentlyViewed), de la plus récente à la plus
// ancienne. Ouvrir un bien, le retirer de l'historique, ou tout vider après confirmation. Comme l'app, chaque bien est
// relu tel que le serveur le rend (une de mes annonces en brouillon aussi) ; un bien qu'il ne rend plus n'apparaît pas.

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

/** Fiches de l'historique, lues d'un coup (l'app les lit une à une) ; une lecture refusée n'en montre aucune. */
async function loadViewed(ids: string[]): Promise<Map<string, ListingRow>> {
  const wanted = ids.filter((id) => UUID_PATTERN.test(id));
  if (!wanted.length) return new Map();
  const { data, error } = await supabase.from('listings').select(LISTING_COLUMNS).in('id', wanted);
  if (error) return new Map();
  return new Map(((data ?? []) as unknown as ListingRow[]).map((row) => [row.id.toLowerCase(), row]));
}

export function ViewedListings() {
  const [ids, setIds] = useState<string[]>(recentlyViewedIds);
  const [rows, setRows] = useState<Map<string, ListingRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadViewed(recentlyViewedIds()).then((loaded) => {
      if (!alive) return;
      setRows(loaded);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

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
      ) : loading ? (
        <Spinner />
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
        message={`Les ${ids.length} biens consultés seront retirés de cette liste.`}
        onClose={() => setConfirming(false)}
        actions={[
          { label: 'Vider l\'historique', onClick: clear, tone: 'danger' },
          { label: 'Annuler', onClick: () => setConfirming(false) },
        ]}
      />
    </div>
  );
}
