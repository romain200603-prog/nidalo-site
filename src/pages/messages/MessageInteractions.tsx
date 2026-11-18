import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { showToast } from '../../components/AppToast';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { avatarUrl } from '../../lib/account/profile';
import { useStore } from '../../lib/account/session';
import type { Message } from '../../lib/messages/api';
import { contentPreview } from '../../lib/messages/content';
import { keepNumbersTogether } from '../../lib/messages/format';
import { matchesListSearch, sameId, type Conversation } from '../../lib/messages/inbox';
import {
  forwardSendTitle, forwardTargets, MAX_FORWARD_TARGETS, myReaction, QUICK_REACTIONS, reactionSummary, toggledTarget,
} from '../../lib/messages/interactions';
import { blockedStore, forwardMessage, inboxStore, profileOf, removeMyReaction, threadStore } from '../../lib/messages/store';
import { senderName } from '../../lib/messages/thread';
import { DELETED_ACCOUNT } from './actions';
import { ConversationAvatar, CounterpartAvatar, Dialog, Sheet, showNotice } from './parts';

// Répondre, réagir, transférer, comme l'app (Features/Messages/MessageInteractionViews.swift ; demande du 17/11) :
// la bulle garde ses gestes (le double toucher de l'app devient un double clic ou un double toucher ; l'appui long,
// un clic droit ou le bouton « … » ouvrent la barre d'emojis et le menu), sa pastille de réactions, la citation au-dessus
// d'une réponse et « Transféré » au-dessus d'un message transféré.

/** Appui long (toucher) et double toucher, comme l'app. */
const LONG_PRESS_MS = 350;
const DOUBLE_TAP_MS = 300;
/** Le cœur rejoint la pastille : la réaction change à ce moment-là (InteractiveMessage.doubleTap). */
const HEART_DELAY_MS = 420;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Bulle avec ses gestes : double clic ou double toucher pour ❤️ (un cœur grossit puis rejoint la pastille) ; appui long
 * (0,35 s), clic droit ou « … » pour la barre d'emojis et le menu ; pastille des réactions dessous, à gauche.
 */
export function InteractiveMessage({ message, flashing, onHeart, onMenu, onShowReactions, children }: {
  message: Message;
  /** Original atteint depuis une citation : la bulle s'éclaire un instant. */
  flashing: boolean;
  onHeart: () => void;
  /** Ouvre la barre d'emojis et le menu autour de la bulle (son cadre à l'écran). */
  onMenu: (rect: DOMRect) => void;
  onShowReactions: () => void;
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const heartAt = useRef(-Infinity);
  const timers = useRef<number[]>([]);
  const [burst, setBurst] = useState(0);
  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    if (press.current) window.clearTimeout(press.current.timer);
  }, []);

  const rect = () => body.current?.getBoundingClientRect() ?? new DOMRect();
  const openMenu = () => onMenu(rect());
  const heart = () => {
    // Un double toucher peut aussi envoyer un double clic : un seul cœur. Horloge monotone : les gestes ne dépendent
    // pas de l'heure de l'appareil.
    const now = performance.now();
    if (now - heartAt.current < 500) return;
    heartAt.current = now;
    if (reducedMotion()) {
      onHeart();
      return;
    }
    setBurst((value) => value + 1);
    timers.current.push(window.setTimeout(onHeart, HEART_DELAY_MS));
  };
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    cancelPress();
    const { clientX: x, clientY: y } = event;
    press.current = {
      x, y,
      timer: window.setTimeout(() => {
        press.current = null;
        lastTap.current = null;
        openMenu();
      }, LONG_PRESS_MS),
    };
  };
  const onPointerMove = (event: PointerEvent) => {
    const current = press.current;
    if (current && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 10) cancelPress();
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return;
    const tapped = press.current !== null;
    cancelPress();
    if (!tapped) return;
    const now = performance.now();
    const last = lastTap.current;
    if (last && now - last.at < DOUBLE_TAP_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 30) {
      lastTap.current = null;
      heart();
    } else {
      lastTap.current = { at: now, x: event.clientX, y: event.clientY };
    }
  };
  const keepOwn = { onPointerDown: (event: PointerEvent) => event.stopPropagation(), onDoubleClick: (event: MouseEvent) => event.stopPropagation() };
  const summary = message.reactions.length > 0 ? reactionSummary(message.reactions) : null;

  return (
    <div
      className={`dm-interactive${summary ? ' has-reactions' : ''}${flashing ? ' is-flashing' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={cancelPress}
      onContextMenu={(event) => {
        event.preventDefault();
        cancelPress();
        openMenu();
      }}
      onDoubleClick={heart}
      // Pas de mot sélectionné par le double clic.
      onMouseDown={(event) => { if (event.detail > 1) event.preventDefault(); }}
    >
      <div className="dm-interactive-body" ref={body}>
        {children}
        {burst > 0 && <span key={burst} className="dm-burst" aria-hidden="true" onAnimationEnd={() => setBurst(0)}>❤️</span>}
      </div>
      {summary && (
        <button
          type="button"
          className="dm-reaction-pill"
          onClick={onShowReactions}
          aria-label={`Réactions : ${summary.emojis.join(' ')}, ${summary.count}`}
          title="Voir les réactions"
          {...keepOwn}
        >
          {summary.emojis.map((emoji) => <span key={emoji} aria-hidden="true">{emoji}</span>)}
          {summary.count > 1 && <span className="dm-reaction-count" aria-hidden="true">{summary.count}</span>}
        </button>
      )}
      <button type="button" className="dm-more-button" onClick={openMenu} aria-label="Réagir, répondre ou transférer" title="Réagir, répondre ou transférer" {...keepOwn}>
        <Icon name="ellipsis" />
      </button>
    </div>
  );
}

// MARK: - Réponse et transfert

/** « Transféré » : petite flèche, gris, au-dessus de la bulle (sans l'auteur d'origine). */
export function ForwardedLabel() {
  return <p className="dm-forwarded"><Icon name="forward" />Transféré</p>;
}

/**
 * Au-dessus d'une réponse : « Vous avez répondu à Sophie », puis la citation (petite bulle grise de 2 lignes au plus,
 * recouverte par la réponse) ; un clic montre l'original. « Message supprimé », en italique, quand il n'existe plus.
 */
export function ReplyContext({ header, text, deleted, onOpen }: { header: string; text: string; deleted: boolean; onOpen: () => void }) {
  return (
    <div className="dm-reply">
      <p className="dm-reply-head"><Icon name="reply" /><span>{header}</span></p>
      <button
        type="button"
        className={`dm-quote${deleted ? ' is-deleted' : ''}`}
        onClick={onOpen}
        disabled={deleted}
        aria-label={`Message cité : ${text}`}
        title={deleted ? undefined : 'Affiche le message d\'origine'}
      >
        <span>{keepNumbersTogether(text)}</span>
      </button>
    </div>
  );
}

/** Au-dessus du champ : « Réponse à Sophie Martin » (le nom en gras), l'aperçu sur une ligne et ✕. */
export function ReplyComposerBar({ title, preview, onCancel }: { title: string; preview: string; onCancel: () => void }) {
  const prefix = 'Réponse à ';
  const name = title.startsWith(prefix) ? title.slice(prefix.length) : null;
  return (
    <div className="dm-reply-bar" role="group" aria-label={title}>
      <Icon name="reply" />
      <span className="dm-reply-bar-text">
        <span className="dm-reply-bar-title">{name !== null ? <>{prefix}<strong>{name}</strong></> : title}</span>
        <span className="dm-reply-bar-preview">{preview}</span>
      </span>
      <button type="button" className="dm-reply-bar-cancel" onClick={onCancel} aria-label="Annuler la réponse" title="Annuler la réponse">
        <Icon name="x" />
      </button>
    </div>
  );
}

// MARK: - Barre d'emojis et menu (MessageFocusOverlay)

export type FocusedMessage = { message: Message; rect: DOMRect; outgoing: boolean; preview: ReactNode };
export type FocusMenuItem = { label: string; icon: IconName; onSelect: () => void };

const BAR_HEIGHT = 50;
const BAR_WIDTH = QUICK_REACTIONS.length * 40 + 12;
const ROW_HEIGHT = 46;
const MENU_WIDTH = 230;
const GAP = 8;
const MARGIN = 12;

/**
 * Barre au-dessus de la bulle et menu dessous ; si le menu ne tient pas dessous, il passe au-dessus de la barre ; si
 * l'ensemble dépasse en haut, tout descend (la bulle aussi). Alignés sur la bulle : à droite pour un message envoyé.
 */
export function focusLayout(bubble: { top: number; bottom: number; left: number; right: number; height: number }, rows: number, outgoing: boolean,
  screen: { width: number; height: number }) {
  const menuHeight = rows * ROW_HEIGHT;
  let bubbleY = bubble.top;
  const menuBelow = bubble.bottom + GAP + menuHeight <= screen.height - MARGIN;
  const above = BAR_HEIGHT + GAP + (menuBelow ? 0 : menuHeight + GAP);
  if (bubbleY - above < MARGIN) bubbleY = MARGIN + above;
  if (menuBelow && bubbleY + bubble.height + GAP + menuHeight > screen.height - MARGIN) {
    bubbleY = Math.max(MARGIN + above, screen.height - MARGIN - menuHeight - GAP - bubble.height);
  }
  const barY = bubbleY - GAP - BAR_HEIGHT;
  const menuY = menuBelow ? bubbleY + bubble.height + GAP : barY - GAP - menuHeight;
  const x = (width: number) => Math.max(MARGIN, Math.min(outgoing ? bubble.right - width : bubble.left, screen.width - MARGIN - width));
  return { bubbleY, barY, menuY, barX: x(BAR_WIDTH), menuX: x(MENU_WIDTH) };
}

/** La bulle mise en avant (sa copie, à sa place), la barre des 6 emojis et le menu ; un clic à côté ferme tout. */
export function MessageMenu({ focused, myEmoji, items, onEmoji, onClose }: {
  focused: FocusedMessage | null;
  myEmoji: string | null;
  items: FocusMenuItem[];
  onEmoji: (emoji: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!focused) return undefined;
    // La fenêtre change de taille : la bulle a bougé, on referme.
    window.addEventListener('resize', onClose);
    return () => window.removeEventListener('resize', onClose);
  }, [focused, onClose]);
  const layout = focused
    ? focusLayout(focused.rect, items.length, focused.outgoing, { width: window.innerWidth, height: window.innerHeight })
    : null;
  return (
    <Dialog open={focused !== null} onClose={onClose} className="dm-focus" label="Réagir, répondre ou transférer">
      {focused && layout && (
        <>
          <div
            className="dm-focus-copy"
            style={{ left: focused.rect.left, top: layout.bubbleY, width: focused.rect.width, height: focused.rect.height }}
            aria-hidden="true"
          >
            {focused.preview}
          </div>
          <div
            className={`dm-focus-bar${focused.outgoing ? ' is-out' : ''}`}
            style={{ left: layout.barX, top: layout.barY, width: BAR_WIDTH }}
            role="group"
            aria-label="Réagir"
          >
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="dm-focus-emoji"
                aria-label={myEmoji === emoji ? `${emoji}, votre réaction : la retirer` : emoji}
                aria-pressed={myEmoji === emoji}
                onClick={() => onEmoji(emoji)}
              >
                <span aria-hidden="true">{emoji}</span>
              </button>
            ))}
          </div>
          {items.length > 0 && (
            <div className="dm-focus-menu" role="menu" style={{ left: layout.menuX, top: layout.menuY, width: MENU_WIDTH }}>
              {items.map((item) => (
                <button key={item.label} type="button" role="menuitem" onClick={item.onSelect}>
                  <span>{item.label}</span>
                  <Icon name={item.icon} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}

// MARK: - Réactions (ReactionsPage)

/** Avatar d'une personne de la conversation : l'interlocuteur, un membre du groupe, ou moi. */
function PersonAvatar({ conversation, userId, me, size }: { conversation: Conversation; userId: string; me: string | null; size: number }) {
  if (!conversation.isGroup && sameId(userId, conversation.otherUserId)) return <ConversationAvatar conversation={conversation} size={size} />;
  const member = conversation.members.find((item) => sameId(item.userId, userId));
  const profile = profileOf(userId);
  const photo = profile ? avatarUrl(member?.kind === 'agency' ? profile.agency_logo_path ?? null : profile.avatar_path) : null;
  return (
    <CounterpartAvatar
      counterpart={{ name: member?.name ?? senderName(userId, conversation, me), kind: member?.kind ?? 'individual', imagePath: null }}
      size={size}
      photo={photo}
      colorKey={userId}
    />
  );
}

/** « Réactions » : chaque personne avec son emoji, la mienne en premier avec « Retirer » ; suit les réactions en direct. */
export function ReactionsSheet({ messageId, conversation, me, onClose }: {
  messageId: string | null;
  conversation: Conversation;
  me: string | null;
  onClose: () => void;
}) {
  const thread = useStore(threadStore);
  const message = messageId ? thread.messages.find((item) => sameId(item.id, messageId)) ?? null : null;
  const reactions = [...(message?.reactions ?? [])].sort((a, b) => {
    const aMine = sameId(a.userId, me);
    const bMine = sameId(b.userId, me);
    return aMine !== bMine ? (aMine ? -1 : 1) : b.createdAt.getTime() - a.createdAt.getTime();
  });
  return (
    <Sheet open={messageId !== null} title="Réactions" onClose={onClose} className="dm-reactions-sheet">
      <div className="dm-sheet-content">
        {reactions.length === 0 ? <p className="dm-forward-empty">Aucune réaction</p> : (
          <ul className="dm-card dm-rows dm-reactions">
            {reactions.map((reaction) => {
              const mine = sameId(reaction.userId, me);
              return (
                <li key={reaction.userId} className="dm-reaction-row">
                  <PersonAvatar conversation={conversation} userId={reaction.userId} me={me} size={42} />
                  <span className="dm-reaction-who">
                    <span className="dm-reaction-name">{mine ? 'Vous' : senderName(reaction.userId, conversation, me)}</span>
                    {mine && message && (
                      <button type="button" className="dm-link-button" onClick={() => void removeMyReaction(message.id)} aria-label="Retirer ma réaction">
                        Retirer
                      </button>
                    )}
                  </span>
                  <span className="dm-reaction-emoji">{reaction.emoji}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

// MARK: - Transférer (ForwardPage)

const FORWARD_FAILED = 'Le message n\'a pas pu être transféré. Réessayez.';

/** « Pro » (bleu clair) ou « Particulier » (gris clair) ; rien pour un groupe, une communauté ou un compte supprimé. */
export function AccountPill({ conversation, proOnly = false }: { conversation: Conversation; proOnly?: boolean }) {
  const { kind, name } = conversation.counterpart;
  if (conversation.isGroup || kind === 'group' || kind === 'community' || name === DELETED_ACCOUNT) return null;
  const pro = kind === 'agency';
  if (proOnly && !pro) return null;
  return <span className={`dm-account-pill${pro ? ' is-pro' : ''}`} aria-label={pro ? 'Professionnel' : 'Particulier'}>{pro ? 'Pro' : 'Particulier'}</span>;
}

/** Ligne d'une conversation proposée : « Groupe · 3 membres », sinon l'annonce et sa ville, sinon le rôle. */
function targetSubtitle(conversation: Conversation): string {
  if (conversation.isGroup) return `Groupe · ${conversation.members.length} membres`;
  if (conversation.listing) return [conversation.listing.title, conversation.listing.city].filter((part) => part !== '').join(' · ');
  return conversation.counterpart.subtitle;
}

/**
 * « Transférer » : le message, la recherche, les conversations récentes à cocher (5 au plus), puis « Envoyer à 2
 * conversations ». Parti : la fenêtre se ferme et « Message transféré » s'affiche en bas.
 */
export function ForwardSheet({ message, originId, me, onClose }: { message: Message | null; originId: string; me: string | null; onClose: () => void }) {
  return (
    <Sheet open={message !== null} title="Transférer" onClose={onClose} className="dm-forward-sheet" closeLabel="Annuler">
      {message && <ForwardForm key={message.id} message={message} originId={originId} me={me} onClose={onClose} />}
    </Sheet>
  );
}

function ForwardForm({ message, originId, me, onClose }: { message: Message; originId: string; me: string | null; onClose: () => void }) {
  const inbox = useStore(inboxStore);
  const blocked = useStore(blockedStore);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const conversations = inbox.status === 'ready' ? inbox.conversations : [];
  const targets = forwardTargets(conversations, originId, blocked).filter((conversation) => matchesListSearch(conversation, query));
  const mine = sameId(message.senderId, me);

  const send = async () => {
    if (!selection.length || sending) return;
    setSending(true);
    const outcome = await forwardMessage(message, selection);
    setSending(false);
    if (outcome.sent > 0) {
      onClose();
      showToast({ icon: 'check', text: 'Message transféré' });
    } else {
      showNotice(outcome.refusal ?? FORWARD_FAILED);
    }
  };

  return (
    <>
      <div className="dm-sheet-content dm-forward">
        <h3 className="dm-forward-label">Message</h3>
        <div className="dm-forward-preview">
          <p className={`dm-forward-bubble${mine ? ' is-out' : ''}`}>{keepNumbersTogether(contentPreview(message.content))}</p>
        </div>
        <label className="dm-search dm-forward-search">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            placeholder="Rechercher une conversation…"
            aria-label="Rechercher une conversation"
            autoComplete="off"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <h3 className="dm-forward-label">Récentes</h3>
        <ul className="dm-card dm-rows dm-forward-list">
          {targets.map((conversation) => {
            const selected = selection.some((id) => sameId(id, conversation.id));
            const full = !selected && selection.length >= MAX_FORWARD_TARGETS;
            const subtitle = targetSubtitle(conversation);
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  className="dm-forward-target"
                  aria-pressed={selected}
                  disabled={full || sending}
                  onClick={() => setSelection((current) => toggledTarget(conversation.id, current))}
                >
                  <ConversationAvatar conversation={conversation} size={44} />
                  <span className="dm-forward-text">
                    <span className="dm-forward-name">
                      <span>{conversation.counterpart.name}</span>
                      <AccountPill conversation={conversation} proOnly />
                    </span>
                    {subtitle && <span className="dm-forward-sub">{subtitle}</span>}
                  </span>
                  <span className={`dm-forward-check${selected ? ' is-on' : ''}`} aria-hidden="true">{selected && <Icon name="check" />}</span>
                </button>
              </li>
            );
          })}
          {targets.length === 0 && <li className="dm-forward-empty">Aucune conversation</li>}
        </ul>
      </div>
      <div className="dm-preview-foot dm-forward-foot">
        <button type="button" className="btn btn-primary dm-forward-send" onClick={() => void send()} disabled={!selection.length || sending} aria-busy={sending}>
          {sending ? <span className="spinner dm-inline-spinner" aria-hidden="true" /> : <Icon name="forward" />}
          {forwardSendTitle(Math.max(1, selection.length))}
        </button>
        <p className="dm-forward-max">{MAX_FORWARD_TARGETS} conversations au plus</p>
      </div>
    </>
  );
}

/** Mon emoji sur un message (barre d'emojis). */
export const myEmojiOn = (message: Message | null, me: string | null) => (message ? myReaction(message.reactions, me) : null);
