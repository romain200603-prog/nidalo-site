import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { createStore, useStore } from '../../lib/account/session';
import { knownSignedUrl, signedUrl } from '../../lib/messages/files';
import { avatarUrl } from '../../lib/account/profile';
import { avatarPalette, counterpartInitials, type Conversation, type Counterpart } from '../../lib/messages/inbox';
import { profileOf } from '../../lib/messages/store';
import { useSheetDrag } from '../../components/useSheetDrag';
import { AlertDialog, DialogContent, Modal } from '../listing/Dialogs';

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
 * Avatar rond (InitialsAvatar de l'app) : la photo (photo de profil, logo de l'agence ou photo du groupe), sinon les
 * initiales en demi-gras sur la couleur de l'interlocuteur (agence en vert, particulier en beige, groupe en bleu
 * clair) ; un groupe a l'icône « users », une communauté un carré arrondi et l'icône « users-round ». `online` : le
 * point vert « en ligne » en bas à droite (17 % de l'avatar, cerclé de blanc).
 */
export function CounterpartAvatar({ counterpart, size, className = '', photo = null, fontSize, online }: {
  counterpart: Pick<Counterpart, 'name' | 'kind' | 'imagePath'>;
  size: number;
  className?: string;
  /** Photo publique (bucket avatars), si la personne en a une. */
  photo?: string | null;
  /** Taille des initiales (celle de l'app à chaque endroit) ; un tiers de l'avatar sinon. */
  fontSize?: number;
  /** Point vert « en ligne » ; `undefined` : pas de point à cet endroit. */
  online?: boolean;
}) {
  const image = useSignedUrl(counterpart.imagePath);
  const [failed, setFailed] = useState<string | null>(null);
  const isGroup = counterpart.kind === 'group' || counterpart.kind === 'community';
  const source = image ?? photo;
  const colors = avatarPalette(counterpart.kind);
  const avatar = (
    <span
      className={`dm-avatar is-${counterpart.kind} ${online === undefined ? className : ''}`}
      style={{
        width: size, height: size, fontSize: fontSize ?? Math.round(size * 0.33), borderRadius: counterpart.kind === 'community' ? size * 0.28 : '50%',
        background: colors.background, color: colors.color,
      }}
      aria-hidden="true"
    >
      {source && failed !== source ? <img src={source} alt="" onError={() => setFailed(source)} /> : isGroup ? (
        <Icon name={counterpart.kind === 'group' ? 'users' : 'usersRound'} />
      ) : counterpartInitials(counterpart.name)}
    </span>
  );
  if (online === undefined) return avatar;
  const dot = size * 0.17;
  return (
    <span className={`dm-avatar-wrap ${className}`} style={{ width: size, height: size }}>
      {avatar}
      {online && <span className="dm-presence" style={{ width: dot, height: dot, right: size * 0.04, bottom: size * 0.04 }} aria-hidden="true" />}
    </span>
  );
}

/** Photo publique de l'interlocuteur d'une conversation à deux : sa photo de profil, ou le logo de son agence. */
export function counterpartPhoto(conversation: Pick<Conversation, 'isGroup' | 'otherUserId' | 'counterpart'>): string | null {
  if (conversation.isGroup) return null;
  const profile = profileOf(conversation.otherUserId);
  if (!profile) return null;
  return avatarUrl(conversation.counterpart.kind === 'agency' ? profile.agency_logo_path ?? null : profile.avatar_path);
}

/** Avatar d'une conversation : photo de l'interlocuteur (ou du groupe), sinon ses initiales. */
export function ConversationAvatar({ conversation, size, className, fontSize, online }: {
  conversation: Conversation;
  size: number;
  className?: string;
  fontSize?: number;
  online?: boolean;
}) {
  return (
    <CounterpartAvatar
      counterpart={conversation.counterpart}
      size={size}
      className={className}
      photo={counterpartPhoto(conversation)}
      fontSize={fontSize}
      online={online}
    />
  );
}

/**
 * « PRO » sur fond bleu, ou « Particulier » cerclé (PublisherBadge de l'app) ; `compact` : la version de l'en-tête de la
 * conversation (10 au lieu de 11). Rien pour un groupe ou une communauté.
 */
export function PublisherBadge({ kind, compact = false }: { kind: Counterpart['kind']; compact?: boolean }) {
  if (kind === 'group' || kind === 'community') return null;
  const pro = kind === 'agency';
  return (
    <span className={`dm-badge${pro ? ' is-pro' : ''}${compact ? ' is-compact' : ''}`} aria-label={pro ? 'Professionnel' : 'Particulier'}>
      {pro ? 'PRO' : 'Particulier'}
    </span>
  );
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

/**
 * Avis (domiaAlert de l'app) et « Dans l'app iPhone pour l'instant » : des alertes, que seul leur bouton ferme, ni
 * Échap ni un clic à l'extérieur (n° 45). Les confirmations et les feuilles de choix gardent leur fermeture.
 */
export function NoticeDialogs() {
  const notice = useStore(noticeStore);
  const close = () => noticeStore.set(null);
  const closeIphone = useCloseWhileOpen(notice?.kind === 'iphone', close);
  const id = useId();
  return (
    <>
      <Dialog open={notice?.kind === 'notice'} onClose={close} className="alert-dialog dm-dialog" labelledBy={`${id}-avis`} dismissible={false}>
        <DialogContent titleId={`${id}-avis`} title={notice?.kind === 'notice' ? notice.text : ''} alert onDismiss={close}
          actions={[{ label: 'OK', onClick: close, role: 'cancel' }]} />
      </Dialog>
      <AlertDialog
        open={notice?.kind === 'iphone'}
        onClose={closeIphone}
        title={notice?.kind === 'iphone' ? notice.title : ''}
        message={IPHONE_ONLY}
        actions={[{ label: 'Fermer', onClick: close, role: 'cancel' }]}
        dismissible={false}
      />
    </>
  );
}

/** Confirmation de l'app (domiaConfirmationDialog) : titre, message facultatif, l'action puis « Annuler » (ou `cancel`). */
export function ConfirmDialog({ open, title, message, confirm, destructive = false, cancel = 'Annuler', onConfirm, onClose }: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirm: string;
  destructive?: boolean;
  /** Bouton qui referme sans rien faire (« Garder le lien »). */
  cancel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} className="alert-dialog dm-dialog" labelledBy={`${id}-titre`} describedBy={message ? `${id}-texte` : undefined}>
      <DialogContent titleId={`${id}-titre`} textId={`${id}-texte`} title={title} message={message} onDismiss={onClose}
        actions={[
          { label: confirm, onClick: () => { onClose(); onConfirm(); }, role: destructive ? 'destructive' : undefined },
          { label: cancel, onClick: onClose, role: 'cancel' },
        ]} />
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

/**
 * Feuille de l'app (presentationDragIndicator, coins de 32) : sous 1024 px, posée en bas avec sa poignée, elle monte
 * comme une feuille de l'iPhone et se referme en la tirant vers le bas par son en-tête (useSheetDrag) ; sur ordinateur,
 * la même au centre. En-tête : « Retour » éventuel, titre de 20 en gras, croix ronde bleu pâle de 34 (« Fermer »).
 */
export function Sheet({ open, title, onClose, onBack, className = '', children, closeLabel = 'Fermer', trailing, hideClose = false }: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Écran poussé dans la feuille : « Retour » revient au premier. */
  onBack?: () => void;
  className?: string;
  children: ReactNode;
  closeLabel?: string;
  /** Bouton de la barre à droite du titre (« Passer »). */
  trailing?: ReactNode;
  /** Écran poussé de l'app : le retour et le titre, sans la croix (Échap ferme toujours la feuille). */
  hideClose?: boolean;
}) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} className={`dm-dialog dm-sheet ${className}`} labelledBy={`${id}-titre`}>
      <SheetBody titleId={`${id}-titre`} title={title} onClose={onClose} onBack={onBack} closeLabel={closeLabel} trailing={trailing} hideClose={hideClose}>
        {children}
      </SheetBody>
    </Dialog>
  );
}

/**
 * Petite feuille du bas sans en-tête (refus d'une offre : presentationDetents de l'app) : la poignée, puis le contenu,
 * qu'on tire vers le bas pour la fermer ; au centre sur ordinateur.
 */
export function PlainSheet({ open, onClose, className = '', labelledBy, children }: {
  open: boolean;
  onClose: () => void;
  className?: string;
  labelledBy?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} className={`dm-dialog dm-sheet is-plain ${className}`} labelledBy={labelledBy}>
      <PlainSheetBody onClose={onClose}>{children}</PlainSheetBody>
    </Dialog>
  );
}

function PlainSheetBody({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useSheetDrag(root, onClose, true);
  return (
    <div className="dm-sheet-body" ref={root} data-sheet-grab="">
      <span className="dm-sheet-grabber" aria-hidden="true" />
      {children}
    </div>
  );
}

/** Contenu d'une feuille ouverte : la poignée et le glissement vers le bas ne vivent que pendant qu'elle est ouverte. */
function SheetBody({ titleId, title, onClose, onBack, closeLabel, trailing, hideClose, children }: {
  titleId: string;
  title: string;
  onClose: () => void;
  onBack?: () => void;
  closeLabel: string;
  trailing?: ReactNode;
  hideClose: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useSheetDrag(root, onClose, true);
  return (
    <div className="dm-sheet-body" ref={root}>
      <header className="dm-sheet-head" data-sheet-grab="">
        <span className="dm-sheet-grabber" aria-hidden="true" />
        {onBack && (
          <button type="button" className="dm-sheet-back" onClick={onBack} aria-label="Retour" title="Retour">
            <Icon name="chevronLeft" />
          </button>
        )}
        <h2 id={titleId} tabIndex={-1}>{title}</h2>
        {trailing}
        {!hideClose && (
          <button type="button" className="dm-sheet-close" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
            <Icon name="x" />
          </button>
        )}
      </header>
      {children}
    </div>
  );
}
