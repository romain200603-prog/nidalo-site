import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';

// Fenêtres de la fiche, en <dialog> ouvert avec showModal (comme FiltersDialog) : Échap, un clic à l'extérieur ou
// « Fermer » referment. Le contenu est dans un bloc intérieur, pour qu'un clic sur le fond vise bien la fenêtre.
// La fenêtre s'ouvre avant d'être peinte (son contenu peut se mesurer tout de suite). React fait remonter
// l'événement « close » d'une fenêtre aux fenêtres qui la contiennent (l'itinéraire est dans la carte) : chaque
// fenêtre ne réagit qu'à sa propre fermeture.

export function Modal({ open, onClose, className, labelledBy, describedBy, label, children }: {
  open: boolean;
  onClose: () => void;
  className?: string;
  labelledBy?: string;
  describedBy?: string;
  label?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`listing-dialog ${className ?? ''}`}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-label={label}
      onClose={(event) => { if (event.target === ref.current) onClose(); }}
      onClick={(event) => { if (event.target === ref.current) onClose(); }}
    >
      {open && children}
    </dialog>
  );
}

export type AlertTone = 'primary' | 'light' | 'quiet';
export type AlertAction =
  | { label: string; onClick: () => void; tone?: AlertTone }
  | { label: string; href: string; tone?: AlertTone; external?: boolean };

/** Alerte comme `domiaAlert` de l'app : titre, message, puis les boutons l'un sous l'autre. */
export function AlertDialog({ open, onClose, title, message, actions, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: ReactNode;
  actions: AlertAction[];
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <Modal open={open} onClose={onClose} className="alert-dialog" labelledBy={`${id}-titre`} describedBy={`${id}-texte`}>
      <div className="alert-body">
        <h2 id={`${id}-titre`}>{title}</h2>
        <p id={`${id}-texte`}>{message}</p>
        {children}
        <div className="alert-actions">
          {actions.map((action) => 'href' in action ? (
            <a key={action.label} className={`btn btn-${action.tone ?? 'light'}`} href={action.href}
              {...(action.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {action.label}
            </a>
          ) : (
            <button key={action.label} type="button" className={`btn btn-${action.tone ?? 'light'}`} onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/** Ce qui demande un compte et n'est pas encore sur le site (écrire, visiter, offre). */
export type AccountAction = 'message' | 'visit' | 'offer';

const ACCOUNT_TITLES: Record<AccountAction, string> = {
  message: 'Écrire au vendeur',
  visit: 'Demander une visite',
  offer: 'Faire une offre',
};

/** Ce que le téléphone dit d'une action qui demande un compte : elle arrive bientôt sur le site, l'app le fait déjà. */
export const ACCOUNT_SOON_MESSAGE = 'Bientôt sur le site, avec votre compte Nidalo. En attendant, c’est déjà possible dans l’app Nidalo, avec le même compte.';

/**
 * Sans compte sur le site (phase 1) : l'action arrive bientôt, et l'app le fait déjà. Pas de lien vers l'app :
 * elle n'ouvre pas encore une annonce depuis un lien (ImmoApp.swift ne gère que les invitations et la connexion).
 */
export function AccountDialog({ action, isAgency, onClose }: { action: AccountAction | null; isAgency: boolean; onClose: () => void }) {
  const title = action === 'message' && isAgency ? 'Écrire à l’agence' : action ? ACCOUNT_TITLES[action] : '';
  return (
    <AlertDialog
      open={action !== null}
      onClose={onClose}
      title={title}
      message={ACCOUNT_SOON_MESSAGE}
      actions={[{ label: 'Fermer', onClick: onClose, tone: 'primary' }]}
    />
  );
}

/** « Téléphone » sans numéro publié (toujours le cas sans compte : le serveur ne donne pas le numéro). */
export function NoPhoneDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AlertDialog
      open={open}
      onClose={onClose}
      title="Numéro non disponible"
      message="Ce vendeur ne communique pas son numéro. Écrivez-lui sur Nidalo."
      actions={[{ label: 'Fermer', onClick: onClose, tone: 'primary' }]}
    />
  );
}
