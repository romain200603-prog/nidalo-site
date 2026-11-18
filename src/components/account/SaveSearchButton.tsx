import { useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { showToast } from '../AppToast';
import { Modal } from '../../pages/listing/Dialogs';
import {
  loadSavedSearches, markViewed, newSavedSearch, proposedName, queryFromDraft, sameQuery, savedSearchesStore, saveSearch,
  type SavedSearch,
} from '../../lib/account/savedSearches';
import { useSession, useStore } from '../../lib/account/session';
import { accountPath } from '../../lib/paths';
import type { SearchDraft } from '../../lib/search';
import '../../styles/recherche-app.css';

// « Enregistrer » de Votre recherche (SearchView.swift, saveSearchButton) et sa feuille (SaveSearchSheet.swift) : nom
// proposé, « M'alerter des nouveautés » (activée à l'ouverture), « Enregistrer », puis le message du bas « Recherche
// enregistrée » et « Voir » (Mes recherches). Le site ne demande jamais les notifications du navigateur : une alerte
// enregistrée ici arrive sur l'iPhone.

/** Nom de la recherche : 80 caractères au plus, comme l'app. */
const MAX_NAME_LENGTH = 80;

/** La recherche enregistrée qui a exactement ces critères (avec le compte), sinon `null`. */
export function useSavedSearchFor(draft: SearchDraft): SavedSearch | null {
  const session = useSession();
  const saved = useStore(savedSearchesStore);
  const query = useMemo(() => queryFromDraft(draft), [draft]);
  const userId = session.status === 'signedIn' ? session.userId : null;

  useEffect(() => {
    if (userId) void loadSavedSearches();
  }, [userId]);

  if (!userId || saved.status !== 'ready') return null;
  return saved.items.find((item) => sameQuery(item.query, query)) ?? null;
}

/**
 * « Enregistrer » compact, à droite du nombre d'annonces : signet, 14 semibold bleu, 40 de haut, rayon 12, fond bleu
 * pâle ; « Enregistrée » (signet plein, inactif) quand la recherche l'est déjà. `onOpen` ouvre la feuille (après
 * connexion si besoin, par la page).
 */
export function SaveSearchButton({ saved, onOpen }: { saved: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`save-search-button${saved ? ' is-saved' : ''}`} disabled={saved} onClick={onOpen}>
      <Icon name="bookmark" />
      {saved ? 'Enregistrée' : 'Enregistrer'}
    </button>
  );
}

/**
 * Feuille « Enregistrer cette recherche » : titre 19 gras, précision 13, champ du nom de 48, interrupteur « M'alerter
 * des nouveautés », « Enregistrer ». Posée en bas sur téléphone, fenêtre au centre sur ordinateur.
 */
export function SaveSearchSheet({ open, draft, onClose }: { open: boolean; draft: SearchDraft; onClose: () => void }) {
  const id = useId();
  const query = useMemo(() => queryFromDraft(draft), [draft]);
  const proposed = [...proposedName(query, draft.mode)].slice(0, MAX_NAME_LENGTH).join('');
  const [name, setName] = useState('');
  const [alerts, setAlerts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // À chaque ouverture : le nom proposé et l'alerte activée.
  useEffect(() => {
    if (!open) return;
    setName(proposed);
    setAlerts(true);
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true);
    setError(null);
    const search = { ...newSavedSearch(name.trim() || proposed, query), alerts_enabled: alerts };
    const failure = await saveSearch(search);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    void markViewed(search.id).catch(() => undefined);
    onClose();
    showToast({
      icon: 'check',
      text: 'Recherche enregistrée',
      action: { label: 'Voir', accessibilityLabel: 'Voir mes recherches', run: () => window.location.assign(accountPath('recherches')) },
    });
  }

  return (
    <Modal open={open} onClose={onClose} className="save-search-sheet" labelledBy={`${id}-titre`} describedBy={`${id}-texte`}>
      <form className="save-search-form" onSubmit={(event) => { event.preventDefault(); if (!busy) void save(); }}>
        <div className="save-search-titles">
          <h2 id={`${id}-titre`}>Enregistrer cette recherche</h2>
          <p id={`${id}-texte`}>Vous la retrouverez dans Favoris, onglet Recherches.</p>
        </div>
        <input
          className="save-search-name"
          aria-label="Nom de la recherche"
          placeholder="Nom de la recherche"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(event) => setName([...event.target.value].slice(0, MAX_NAME_LENGTH).join(''))}
        />
        <label className="save-search-alert">
          <Icon name="bell" />
          <span className="save-search-alert-text">
            <span className="save-search-alert-title">M'alerter des nouveautés</span>
            <span className="save-search-alert-sub">{alerts ? 'Dès qu\'une annonce correspond' : 'Nouveautés à retrouver dans Favoris'}</span>
          </span>
          <input type="checkbox" role="switch" className="switch" checked={alerts} onChange={(event) => setAlerts(event.target.checked)} />
        </label>
        {error && <p className="save-search-error" role="alert">{error}</p>}
        <button type="submit" className="save-search-submit" disabled={busy} aria-busy={busy || undefined}>
          {busy ? <><span className="spinner spinner-white" aria-hidden="true" /><span className="visually-hidden">Enregistrement…</span></> : 'Enregistrer'}
        </button>
      </form>
    </Modal>
  );
}
