import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';

// Fenêtres de la fiche, en <dialog> ouvert avec showModal (comme FiltersDialog) : Échap, un clic à l'extérieur ou
// « Fermer » referment. Une alerte de la fiche (`dismissible={false}`, n° 45) ne se ferme que par un de ses boutons,
// comme une alerte d'iOS : ni Échap ni un clic à l'extérieur ; les fenêtres de choix (l'itinéraire) restent comme
// avant. Le contenu est dans un bloc intérieur, pour qu'un clic sur le fond vise bien la fenêtre.
// La fenêtre s'ouvre avant d'être peinte (son contenu peut se mesurer tout de suite). React fait remonter
// l'événement « close » d'une fenêtre aux fenêtres qui la contiennent (l'itinéraire est dans la carte) : chaque
// fenêtre ne réagit qu'à sa propre fermeture.

export function Modal({ open, onClose, className, labelledBy, describedBy, label, dismissible = true, children }: {
  open: boolean;
  onClose: () => void;
  className?: string;
  labelledBy?: string;
  describedBy?: string;
  label?: string;
  /** Faux : seuls les boutons de la fenêtre la ferment (alerte). */
  dismissible?: boolean;
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
      onKeyDown={(event) => { if (!dismissible && event.key === 'Escape') event.preventDefault(); }}
      onCancel={(event) => { if (!dismissible && event.target === ref.current) event.preventDefault(); }}
      onClose={(event) => { if (event.target === ref.current) onClose(); }}
      onClick={(event) => { if (dismissible && event.target === ref.current) onClose(); }}
    >
      {open && children}
    </dialog>
  );
}

export type AlertTone = 'primary' | 'light' | 'quiet';
export type AlertAction =
  | { label: string; onClick: () => void; tone?: AlertTone }
  | { label: string; href: string; tone?: AlertTone; external?: boolean };

/**
 * Alerte comme `domiaAlert` de l'app : titre, message, puis les boutons l'un sous l'autre. `dismissible={false}` : une
 * alerte de la fiche, que seuls ses boutons ferment (n° 45) ; les autres pages gardent Échap et le clic à l'extérieur.
 */
export function AlertDialog({ open, onClose, title, message, actions, dismissible = true, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: ReactNode;
  actions: AlertAction[];
  dismissible?: boolean;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <Modal open={open} onClose={onClose} className="alert-dialog" labelledBy={`${id}-titre`} describedBy={`${id}-texte`} dismissible={dismissible}>
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

/**
 * « Appeler » sans numéro publié (toujours le cas sans compte : le serveur ne donne pas le numéro) ; « Envoyer un
 * message » ouvre la conversation, comme sur ordinateur. Location : « Ce propriétaire » (n° 74).
 */
export function NoPhoneDialog({ open, onClose, onMessage, isRental }: { open: boolean; onClose: () => void; onMessage: () => void; isRental: boolean }) {
  return (
    <AlertDialog
      open={open}
      onClose={onClose}
      dismissible={false}
      title="Numéro non disponible"
      message={`Ce ${isRental ? 'propriétaire' : 'vendeur'} ne communique pas son numéro. Écrivez-lui sur Nidalo.`}
      actions={[
        { label: 'Envoyer un message', onClick: onMessage, tone: 'primary' },
        { label: 'Fermer', onClick: onClose, tone: 'quiet' },
      ]}
    />
  );
}
