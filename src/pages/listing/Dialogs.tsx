import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { useSheetDrag } from '../../components/useSheetDrag';

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

/** Rôle d'un bouton de fenêtre (ButtonRole de l'app) : « Annuler » bleu pâle, destructif rouge, sinon bleu. */
export type DialogRole = 'cancel' | 'destructive';
export type AlertAction =
  | { label: string; onClick: () => void; role?: DialogRole; disabled?: boolean }
  | { label: string; href: string; role?: DialogRole; external?: boolean }
  | { label: string; submit: true; role?: DialogRole; disabled?: boolean };

const ROLE_CLASS: Record<DialogRole | 'default', string> = {
  default: 'btn btn-primary',
  cancel: 'btn btn-light',
  destructive: 'btn btn-danger',
};

/**
 * Contenu d'une fenêtre de l'app (DomiaDialogSheet) : poignée, pastille d'icône (« i », ou le triangle d'alerte quand
 * un bouton est destructif), titre, message, champs éventuels, puis les boutons l'un sous l'autre. Comme l'app, une
 * fenêtre de choix sans « Annuler » en reçoit un, et une alerte sans bouton reçoit « OK ». `alert` : une alerte
 * (domiaAlert), que seuls ses boutons ferment ; sinon une fenêtre de choix (domiaConfirmationDialog), qu'on referme
 * aussi en la tirant vers le bas. `onSubmit` : le contenu est un formulaire (Entrée valide), pour une alerte à champ.
 */
export function DialogContent({ titleId, textId, title, message, actions, alert = false, onDismiss, onSubmit, className, children }: {
  titleId?: string;
  textId?: string;
  title: string;
  message?: ReactNode;
  actions: AlertAction[];
  alert?: boolean;
  /** Fermeture sans action : le « Annuler » ou le « OK » ajoutés, la feuille tirée vers le bas. */
  onDismiss: () => void;
  onSubmit?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  const root = useRef<HTMLElement | null>(null);
  useSheetDrag(root, onDismiss, !alert);
  const all: AlertAction[] = [...actions];
  if (!alert && !actions.some((action) => action.role === 'cancel')) all.push({ label: 'Annuler', role: 'cancel', onClick: onDismiss });
  else if (alert && actions.length === 0) all.push({ label: 'OK', role: 'cancel', onClick: onDismiss });
  const destructive = actions.some((action) => action.role === 'destructive');
  const content = (
    <>
      <div className="alert-top" data-sheet-grab="">
        <span className="alert-grabber" aria-hidden="true" />
        <span className="alert-icon" aria-hidden="true"><Icon name={destructive ? 'triangleAlert' : 'info'} /></span>
      </div>
      {title !== '' && <h2 id={titleId}>{title}</h2>}
      {message !== undefined && message !== null && message !== '' && <p id={textId}>{message}</p>}
      {children}
      <div className="alert-actions">
        {all.map((action) => {
          const look = ROLE_CLASS[action.role ?? 'default'];
          if ('href' in action) {
            return (
              <a key={action.label} className={look} href={action.href}
                {...(action.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {action.label}
              </a>
            );
          }
          if ('submit' in action) {
            return <button key={action.label} type="submit" className={look} disabled={action.disabled}>{action.label}</button>;
          }
          return (
            <button key={action.label} type="button" className={look} disabled={action.disabled} onClick={action.onClick}>
              {action.label}
            </button>
          );
        })}
      </div>
    </>
  );
  const classes = `alert-body${className ? ` ${className}` : ''}`;
  return onSubmit ? (
    <form ref={(node) => { root.current = node; }} className={classes} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      {content}
    </form>
  ) : (
    <div ref={(node) => { root.current = node; }} className={classes}>{content}</div>
  );
}

/**
 * Fenêtre de l'app (domiaAlert, domiaConfirmationDialog) : DialogContent dans une fenêtre. `dismissible={false}` : une
 * alerte, que seuls ses boutons ferment, ni Échap ni un clic à côté (n° 45) ; sinon une fenêtre de choix.
 */
export function AlertDialog({ open, onClose, title, message, actions, dismissible = true, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: ReactNode;
  actions: AlertAction[];
  dismissible?: boolean;
  children?: ReactNode;
}) {
  const id = useId();
  const hasMessage = message !== undefined && message !== null && message !== '';
  return (
    <Modal open={open} onClose={onClose} className="alert-dialog" labelledBy={title ? `${id}-titre` : undefined}
      describedBy={hasMessage ? `${id}-texte` : undefined} dismissible={dismissible}>
      <DialogContent titleId={`${id}-titre`} textId={`${id}-texte`} title={title} message={message} actions={actions}
        alert={!dismissible} onDismiss={onClose}>
        {children}
      </DialogContent>
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
        { label: 'Envoyer un message', onClick: onMessage },
        { label: 'Fermer', onClick: onClose, role: 'cancel' },
      ]}
    />
  );
}
