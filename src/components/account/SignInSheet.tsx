import { useLayoutEffect, useRef } from 'react';
import { SignInCard } from './SignInCard';
import { accountDidConnect, cancelAccountRequirement, signInSheetStore } from '../../lib/account/gate';
import { useStore } from '../../lib/account/session';
// Styles de la connexion et des cœurs : la fenêtre peut s'ouvrir depuis n'importe quelle page.
import '../../styles/account.css';

/** Fenêtre de connexion d'une action qui demande un compte (favori, recherche enregistrée…), comme la feuille de l'app. */
export function SignInSheet() {
  const open = useStore(signInSheetStore);
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="signin-sheet"
      aria-label="Connexion"
      onClose={(event) => { if (event.target === ref.current && signInSheetStore.get()) cancelAccountRequirement(); }}
      onClick={(event) => { if (event.target === ref.current) cancelAccountRequirement(); }}
    >
      {open && <SignInCard onClose={cancelAccountRequirement} onSignedIn={accountDidConnect} />}
    </dialog>
  );
}
