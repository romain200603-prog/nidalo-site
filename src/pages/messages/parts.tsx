import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { createStore, useStore } from '../../lib/account/session';
import { knownSignedUrl, signedUrl } from '../../lib/messages/files';
import { counterpartInitials, type Counterpart } from '../../lib/messages/inbox';
import { AlertDialog, Modal } from '../listing/Dialogs';

// Morceaux communs de la page Messages : avatars à initiales (InitialsAvatar), badge PRO / Particulier
// (PublisherBadge), images du bucket privé par URL signée, menus ⋮, avis « OK » (domiaAlert) et fenêtre
// « Dans l'app iPhone pour l'instant ».

export const IPHONE_ONLY = 'Dans l’app iPhone pour l’instant.';

/** Adresse signée d'un fichier de message-attachments (`null` tant qu'elle n'est pas là, ou s'il est indisponible). */
export function useSignedUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<{ path: string; url: string | null } | null>(() => (path ? { path, url: knownSignedUrl(path) } : null));
  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    void signedUrl(path).then((value) => { if (!cancelled) setUrl({ path, url: value }); });
    return () => { cancelled = true; };
  }, [path]);
  if (!path) return null;
  return url?.path === path ? url.url : knownSignedUrl(path);
}

/**
 * Avatar rond à initiales, couleur pastel selon l'interlocuteur ; un groupe a l'icône « users », une communauté un
 * carré arrondi et l'icône « users-round », ou leur photo (InitialsAvatar).
 */
export function CounterpartAvatar({ counterpart, size, className = '' }: { counterpart: Pick<Counterpart, 'name' | 'kind' | 'imagePath'>; size: number; className?: string }) {
  const image = useSignedUrl(counterpart.imagePath);
  const isGroup = counterpart.kind === 'group' || counterpart.kind === 'community';
  return (
    <span
      className={`dm-avatar is-${counterpart.kind} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34), borderRadius: counterpart.kind === 'community' ? size * 0.28 : '50%' }}
      aria-hidden="true"
    >
      {image ? <img src={image} alt="" /> : isGroup ? (
        <Icon name={counterpart.kind === 'group' ? 'users' : 'usersRound'} />
      ) : counterpartInitials(counterpart.name)}
    </span>
  );
}

/** « PRO » sur fond bleu, ou « Particulier » cerclé ; rien pour un groupe ou une communauté. */
export function PublisherBadge({ kind }: { kind: Counterpart['kind'] }) {
  if (kind === 'group' || kind === 'community') return null;
  const pro = kind === 'agency';
  return <span className={`dm-badge${pro ? ' is-pro' : ''}`} aria-label={pro ? 'Professionnel' : 'Particulier'}>{pro ? 'PRO' : 'Particulier'}</span>;
}

// MARK: - Fenêtres

/**
 * `onClose` d'une fenêtre, seulement tant que la page la veut ouverte : le navigateur signale une fermeture après
 * coup (événement « close ») ; quand la page l'a fermée elle-même pour en ouvrir une autre à la place (« Joindre »
 * puis « Documents immobiliers », une confirmation puis son avis), ce signal ne doit pas refermer la suivante.
 */
function useCloseWhileOpen(open: boolean, onClose: () => void) {
  const latest = useRef({ open, onClose });
  useLayoutEffect(() => { latest.current = { open, onClose }; });
  return useCallback(() => { if (latest.current.open) latest.current.onClose(); }, []);
}

/** Fenêtre de la page Messages : celle de la fiche (Modal), sans fermeture en retard. */
export function Dialog(props: ComponentProps<typeof Modal>) {
  const onClose = useCloseWhileOpen(props.open, props.onClose);
  return <Modal {...props} onClose={onClose} />;
}

// MARK: - Avis « OK » et « Dans l'app iPhone pour l'instant »

type Notice = { kind: 'notice'; text: string } | { kind: 'iphone'; title: string };

const noticeStore = createStore<Notice | null>(null);

/** Avis de l'app (domiaAlert) : le texte, puis « OK ». */
export function showNotice(text: string) {
  noticeStore.set({ kind: 'notice', text });
}

/** Ce que l'app fait et que le site ne fait pas encore : le nom de l'action, puis « Dans l'app iPhone pour l'instant. ». */
export function showIphoneOnly(title: string) {
  noticeStore.set({ kind: 'iphone', title });
}

export function NoticeDialogs() {
  const notice = useStore(noticeStore);
  const close = () => noticeStore.set(null);
  const closeIphone = useCloseWhileOpen(notice?.kind === 'iphone', close);
  const id = useId();
  return (
    <>
      <Dialog open={notice?.kind === 'notice'} onClose={close} className="alert-dialog dm-dialog" labelledBy={`${id}-avis`}>
        <div className="alert-body">
          <h2 id={`${id}-avis`}>{notice?.kind === 'notice' ? notice.text : ''}</h2>
          <div className="alert-actions">
            <button type="button" className="btn btn-primary" onClick={close} autoFocus>OK</button>
          </div>
        </div>
      </Dialog>
      <AlertDialog
        open={notice?.kind === 'iphone'}
        onClose={closeIphone}
        title={notice?.kind === 'iphone' ? notice.title : ''}
        message={IPHONE_ONLY}
        actions={[{ label: 'Fermer', onClick: close, tone: 'primary' }]}
      />
    </>
  );
}

/** Confirmation de l'app (domiaConfirmationDialog) : titre, message facultatif, l'action puis « Annuler ». */
export function ConfirmDialog({ open, title, message, confirm, destructive = false, onConfirm, onClose }: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirm: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} className="alert-dialog dm-dialog" labelledBy={`${id}-titre`} describedBy={message ? `${id}-texte` : undefined}>
      <div className="alert-body">
        <h2 id={`${id}-titre`}>{title}</h2>
        {message && <p id={`${id}-texte`}>{message}</p>}
        <div className="alert-actions">
          <button type="button" className={`btn ${destructive ? 'dm-btn-danger' : 'btn-primary'}`} onClick={() => { onClose(); onConfirm(); }}>
            {confirm}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </Dialog>
  );
}

// MARK: - Menu ⋮

export type MenuItem = { label: string; icon: IconName; onSelect: () => void; destructive?: boolean };

/**
 * Bouton qui ouvre une liste d'actions (Menu de SwiftUI) : Échap ou un clic ailleurs la referme ; les flèches
 * passent d'une action à l'autre.
 */
export function ActionMenu({ label, items, className, children }: { label: string; items: MenuItem[]; className: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  useLayoutEffect(() => {
    if (open) list.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="dm-menu" ref={root} onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={button}
        type="button"
        className={className}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {children}
      </button>
      {open && (
        <div className="dm-menu-list" role="menu" id={id} ref={list}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.destructive ? 'is-destructive' : undefined}
              onClick={() => {
                setOpen(false);
                button.current?.focus();
                item.onSelect();
              }}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Fenêtre de la page (feuille de l'app) : titre, bouton « Fermer », contenu. */
export function Sheet({ open, title, onClose, onBack, className = '', children, closeLabel = 'Fermer' }: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Écran poussé dans la feuille : « Retour » revient au premier. */
  onBack?: () => void;
  className?: string;
  children: ReactNode;
  closeLabel?: string;
}) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} className={`dm-dialog dm-sheet ${className}`} labelledBy={`${id}-titre`}>
      <div className="dm-sheet-body">
        <header className="dm-sheet-head">
          {onBack && (
            <button type="button" className="dm-sheet-back" onClick={onBack} aria-label="Retour" title="Retour">
              <Icon name="chevronLeft" />
            </button>
          )}
          <h2 id={`${id}-titre`} tabIndex={-1}>{title}</h2>
          <button type="button" className="dm-sheet-close" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
            <Icon name="x" />
          </button>
        </header>
        {children}
      </div>
    </Dialog>
  );
}
