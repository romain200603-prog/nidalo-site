import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { PATHS } from '../../lib/paths';
import { Modal } from '../listing/Dialogs';

// Briques de Mon espace sur ordinateur (≥ 1024 px) : lignes de réglages, fenêtres de confirmation de l'app
// (domiaConfirmationDialog, rouge pour une action destructive) et avis « Dans l'app iPhone pour l'instant ».

/** Ce que l'app garde sur l'iPhone (documents, alertes, préférences, calendrier). */
export const IPHONE_ONLY = 'Dans l’app iPhone pour l’instant';

export type DialogAction = { label: string; onClick: () => void; tone?: 'primary' | 'danger' | 'quiet' };

/** Fenêtre de l'app : titre, message facultatif, puis les boutons l'un sous l'autre. */
export function ChoiceDialog({ open, title, message, actions, onClose }: {
  open: boolean;
  title: string;
  message?: ReactNode;
  actions: DialogAction[];
  onClose: () => void;
}) {
  const id = useId();
  return (
    <Modal open={open} onClose={onClose} className="alert-dialog dsc-dialog" labelledBy={`${id}-titre`} describedBy={message ? `${id}-texte` : undefined}>
      <div className="alert-body">
        <h2 id={`${id}-titre`}>{title}</h2>
        {message && <p id={`${id}-texte`}>{message}</p>}
        <div className="alert-actions">
          {actions.map((action) => (
            <button key={action.label} type="button" className={`btn dsc-btn-${action.tone ?? 'quiet'}`} onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Ce que l'app fait sur l'iPhone et que le site ne fait pas : le nom, « Dans l'app iPhone pour l'instant. », puis
 * « Fermer » (comme la fiche et la messagerie).
 */
export function IphoneOnlyDialog({ title, onClose }: { title: string | null; onClose: () => void }) {
  return (
    <ChoiceDialog open={title !== null} title={title ?? ''} message={`${IPHONE_ONLY}.`} onClose={onClose}
      actions={[{ label: 'Fermer', onClick: onClose, tone: 'primary' }]} />
  );
}

export type DesktopRow = {
  icon: IconName;
  title: string;
  subtitle?: string;
  href?: string;
  onClick?: () => void;
};

/** Carte de lignes (RowGroup) : icône, titre, sous-titre et chevron ; un lien ou un bouton. */
export function DesktopRows({ rows }: { rows: DesktopRow[] }) {
  return (
    <ul className="dsp-rows">
      {rows.map((row) => {
        const content = (
          <>
            <span className="dsp-row-icon"><Icon name={row.icon} /></span>
            <span className="dsp-row-text">
              <span className="dsp-row-title">{row.title}</span>
              {row.subtitle && <span className="dsp-row-subtitle">{row.subtitle}</span>}
            </span>
            <Icon name="chevronRight" className="icon dsp-row-chevron" />
          </>
        );
        return (
          <li key={row.title}>
            {row.href
              ? <a className="dsp-row" href={row.href}>{content}</a>
              : <button type="button" className="dsp-row" onClick={row.onClick}>{content}</button>}
          </li>
        );
      })}
    </ul>
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

// MARK: - Écrans de la colonne de 640 px (Mon agenda, Ajouter une visite, Mon projet, Biens consultés)

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

export type MenuItem = { label: string; icon?: IconName; onClick: () => void; danger?: boolean };

/**
 * Menu de l'app (Menu) : liste d'actions sous le bouton « … », ou sous un bouton à libellé (`trigger`) ; Échap ou
 * un clic ailleurs le referme.
 */
export function ActionMenu({ label, items, trigger, triggerClassName = 'dsc-menu-button' }: {
  label: string;
  items: MenuItem[];
  trigger?: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="dsc-menu" ref={ref}>
      <button type="button" className={triggerClassName} aria-label={trigger ? undefined : label} aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
        {trigger ?? <Icon name="ellipsis" />}
      </button>
      {open && (
        <div className="dsc-menu-list" role="menu" id={id}>
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" className={item.danger ? 'is-danger' : undefined}
              onClick={() => { setOpen(false); item.onClick(); }}>
              {item.icon && <Icon name={item.icon} />}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
