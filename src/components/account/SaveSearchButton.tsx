import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { AlertDialog, Modal } from '../../pages/listing/Dialogs';
import { requireAccount } from '../../lib/account/gate';
import {
  loadSavedSearches, markViewed, newSavedSearch, proposedName, queryFromDraft, sameQuery, savedSearchesStore, saveSearch,
} from '../../lib/account/savedSearches';
import { useSession, useStore } from '../../lib/account/session';
import type { SearchDraft } from '../../lib/search';

/**
 * « Enregistrer cette recherche » (SearchView.swift 93–130) : demande un compte, propose un nom, puis l'enregistre.
 * Le bouton devient « Recherche enregistrée » quand une recherche identique est déjà dans le compte.
 */
export function SaveSearchButton({ draft }: { draft: SearchDraft }) {
  const session = useSession();
  const saved = useStore(savedSearchesStore);
  const query = useMemo(() => queryFromDraft(draft), [draft]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const userId = session.status === 'signedIn' ? session.userId : null;

  useEffect(() => {
    if (userId) void loadSavedSearches();
  }, [userId]);

  const isSaved = userId !== null && saved.status === 'ready' && saved.items.some((item) => sameQuery(item.query, query));

  async function save() {
    setOpen(false);
    setBusy(true);
    const search = newSavedSearch(name.trim() || proposedName(query, draft.mode), query);
    const failure = await saveSearch(search);
    setBusy(false);
    if (failure) {
      setNotice(failure);
      return;
    }
    void markViewed(search.id).catch(() => undefined);
    setNotice('Recherche enregistrée. Retrouvez-la dans Favoris, onglet Recherches.');
  }

  return (
    <>
      <button
        type="button"
        className={`save-search-button${isSaved ? ' is-saved' : ''}`}
        disabled={isSaved || busy}
        onClick={() => void requireAccount(() => {
          setName(proposedName(query, draft.mode));
          setOpen(true);
        })}
      >
        <Icon name="bookmark" />
        {isSaved ? 'Recherche enregistrée' : 'Enregistrer cette recherche'}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} className="alert-dialog" labelledBy="enregistrer-titre" describedBy="enregistrer-texte">
        <form className="alert-body" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <h2 id="enregistrer-titre">Enregistrer cette recherche</h2>
          <p id="enregistrer-texte">Vous la retrouverez dans Favoris, onglet Recherches.</p>
          <input
            className="text-input"
            aria-label="Nom de la recherche"
            placeholder="Nom de la recherche"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          <div className="alert-actions">
            <button type="submit" className="btn btn-primary">Enregistrer</button>
            <button type="button" className="btn btn-light" onClick={() => setOpen(false)}>Annuler</button>
          </div>
        </form>
      </Modal>
      <AlertDialog
        open={notice !== null}
        onClose={() => setNotice(null)}
        title={notice ?? ''}
        message=""
        actions={[{ label: 'OK', onClick: () => setNotice(null), tone: 'primary' }]}
      />
    </>
  );
}
