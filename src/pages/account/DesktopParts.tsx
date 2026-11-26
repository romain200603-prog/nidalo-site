import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { PATHS } from '../../lib/paths';
import { AlertDialog, type AlertAction } from '../listing/Dialogs';

// Briques des écrans de Mon compte (aussi pour Publier et la carte) : fenêtres de confirmation de l'app (la fenêtre
// Nidalo commune, rouge pour une action destructive) et avis « Dans l'app iPhone pour l'instant ».

/** Ce que l'app garde sur l'iPhone (documents, alertes, préférences, calendrier). */
export const IPHONE_ONLY = 'Dans l’app iPhone pour l’instant';

export type DialogAction = AlertAction;

/**
 * Fenêtre de l'app (domiaConfirmationDialog) : la fenêtre Nidalo commune (AlertDialog), titre, message facultatif,
 * puis les boutons l'un sous l'autre. `dismissible={false}` : une alerte (domiaAlert), que seuls ses boutons ferment.
 */
export function ChoiceDialog({ open, title, message, actions, onClose, dismissible = true }: {
  open: boolean;
  title: string;
  message?: ReactNode;
  actions: DialogAction[];
  onClose: () => void;
  dismissible?: boolean;
}) {
  return <AlertDialog open={open} onClose={onClose} title={title} message={message} actions={actions} dismissible={dismissible} />;
}

/**
 * Ce que l'app fait sur l'iPhone et que le site ne fait pas : le nom, « Dans l'app iPhone pour l'instant. », puis
 * « Fermer » (comme la fiche et la messagerie).
 */
export function IphoneOnlyDialog({ title, onClose }: { title: string | null; onClose: () => void }) {
  return (
    <ChoiceDialog open={title !== null} title={title ?? ''} message={`${IPHONE_ONLY}.`} onClose={onClose} dismissible={false}
      actions={[{ label: 'Fermer', onClick: onClose, role: 'cancel' }]} />
  );
}

/**
 * Pourcentage arrondi comme l'app (`.percent.precision(.fractionLength(0))`, une moitié exacte va au pair le plus
 * proche) : 0,125 → « 12 % », 0,375 → « 38 % ».
 */
export function percentLabel(fraction: number): string {
  const value = Math.max(0, fraction) * 100;
  const floor = Math.floor(value);
  const rounded = value - floor === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(value);
  return new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 }).format(rounded / 100);
}

/** Anneau de progression bleu avec le pourcentage au centre (ProgressRing, 64 px, trait de 6). */
export function ProgressRing({ progress, size = 64 }: { progress: number; size?: number }) {
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(progress, 0), 1);
  const label = percentLabel(clamped);
  return (
    <span className="dsp-ring" style={{ width: size, height: size }} role="img" aria-label={`Projet complété à ${label}`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true" focusable="false">
        <circle className="dsp-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        {clamped > 0 && (
          <circle className="dsp-ring-value" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" strokeLinecap="round"
            strokeDasharray={`${clamped * circumference} ${circumference}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
      <span className="dsp-ring-label" aria-hidden="true">{label}</span>
    </span>
  );
}

// MARK: - Pièces des écrans (.dsc) : en-tête, photo d'un bien, menu « … »

/** En-tête d'un écran : retour (lien ou bouton), titre, sous-titre et contenu facultatifs, action à droite. */
export function ScreenHead({ title, subtitle, back = PATHS.account, onBack, action, children }: {
  title: string;
  subtitle?: string;
  back?: string;
  onBack?: () => void;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="dsc-head">
      {onBack ? (
        <button type="button" className="dsc-back" onClick={onBack} aria-label="Retour"><Icon name="arrowLeft" /></button>
      ) : (
        <a className="dsc-back" href={back} aria-label="Retour"><Icon name="arrowLeft" /></a>
      )}
      <div className="dsc-titles">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
      {action && <div className="dsc-head-action">{action}</div>}
    </div>
  );
}

/** Photo d'un bien (ListingPhoto) : l'image, sinon un cadre avec l'icône d'image. */
export function Thumb({ url, className }: { url: string | null; className?: string }) {
  return (
    <span className={`dsc-thumb ${className ?? ''}`} aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" /> : <Icon name="image" />}
    </span>
  );
}

export type MenuItem = { label: string; icon?: IconName; onClick: () => void; danger?: boolean; disabled?: boolean };

/**
 * Menu de l'app (Menu) : liste d'actions sous le bouton « … », ou sous un bouton à libellé (`trigger`) ; Échap ou
 * un clic ailleurs le referme. La page défile juste assez pour le montrer en entier, au-dessus de la barre du bas.
 * Au clavier : ouvert, le focus va à la première action ; les flèches (et Début, Fin) passent d'une
 * action à l'autre ; Échap rend le focus au bouton ; Tab referme. Une action inactive (`disabled`) reste affichée.
 */
export function ActionMenu({ label, items, trigger, triggerClassName = 'dsc-menu-button', icon = 'ellipsis', className }: {
  label: string;
  items: MenuItem[];
  trigger?: ReactNode;
  triggerClassName?: string;
  /** Icône du bouton sans libellé (« … » par défaut) ; son nom est `label`, aussi en infobulle. */
  icon?: IconName;
  /** Classe ajoutée au menu, pour sa place sur l'écran (crayon de la carte…). */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (open) listRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Échap ferme le menu seulement (pas la fenêtre ni la carte qui le contient).
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const onListKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: buttons.length - 1 }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      buttons[(next + buttons.length) % buttons.length].focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };
  return (
    <div className={className ? `dsc-menu ${className}` : 'dsc-menu'} ref={ref}>
      <button ref={buttonRef} type="button" className={triggerClassName} aria-label={trigger ? undefined : label}
        title={trigger || icon === 'ellipsis' ? undefined : label} aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
        {trigger ?? <Icon name={icon} />}
      </button>
      {open && (
        <div className="dsc-menu-list" role="menu" id={id} ref={listRef} onKeyDown={onListKey}>
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" className={item.danger ? 'is-danger' : undefined} disabled={item.disabled}
              onClick={() => { setOpen(false); buttonRef.current?.focus({ preventScroll: true }); item.onClick(); }}>
              {item.icon && <Icon name={item.icon} />}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
