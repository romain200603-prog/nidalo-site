import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { formatPrice } from '../../lib/format';
import { allowedActions, effectiveStatus, offerGapLabel, offerStatusLabel, type OfferAction, type OfferRow } from '../../lib/listing/offers';
import { visitErrorMessage } from '../../lib/listing/visits';
import type { Message } from '../../lib/messages/api';
import { fileExtension, isMedia, UNSUPPORTED_ATTACHMENT, type Attachment } from '../../lib/messages/content';
import { signedUrl } from '../../lib/messages/files';
import { clock, durationLabel, floatingDayLabel, keepNumbersTogether, sizeLabel } from '../../lib/messages/format';
import { sameId, type Conversation } from '../../lib/messages/inbox';
import { canForward, canReply, DELETED_QUOTE, firstName, quoteText, replyHeader } from '../../lib/messages/interactions';
import { contactCardFile, safeFileName, saveFile } from '../../lib/messages/exportFiles';
import {
  deleteMessage, loadQuotedOriginal, profileOf, quotedOriginal, quotedStore, react, refreshAfterVisit, toggleHeart,
} from '../../lib/messages/store';
import { bubbleText, groupSender, mediaEntries, senderName, siteThreadDays, type SiteThreadRow } from '../../lib/messages/thread';
import {
  acceptVisitRequest, openSlots, requestCardTitle, requestDateShort, requestDateWide, requestOutcome, requestPlaceLine, shownSlot,
  type ConversationVisitRequest,
} from '../../lib/messages/visitRequests';
import { avatarUrl } from '../../lib/account/profile';
import { useStore } from '../../lib/account/session';
import { Spinner } from '../account/parts';
import { ReportSheet } from './actions';
import {
  EmojiPickerSheet, ForwardedLabel, InteractiveMessage, MessageMenu, myEmojiOn, ReactionsSheet, ReplyContext, type FocusedMessage,
  type FocusMenuItem,
} from './MessageInteractions';
import { ActionMenu, ConfirmDialog, ConversationAvatar, CounterpartAvatar, Dialog, PlainSheet, showNotice, useSignedUrl, type MenuItem } from './parts';
import { VisitEventCard } from './VisitEventCard';
import { GifBubble, VoiceBubble } from './VoiceGif';

// Fil de la conversation ouverte, comme l'app (ConversationView.swift) : reçus à gauche et miens à droite, 18,5 px de
// marge ; séparateur de jour en texte gris (« Aujourd'hui · 10:42 ») et pastille du jour en haut pendant le
// défilement ; bulles de 289 px au plus, serrées dans une série (2 px, 8 px quand l'expéditeur change) ; l'avatar de
// 23 px à côté de la dernière bulle reçue d'une série. L'heure et les coches restent dans la bulle (demande de Romain du
// 14 novembre 2026). Messages enrichis : photos, fichiers, offres, visite confirmée, demandes de visite.

const dayMonthWide = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

/** Heure et coches d'un message : ✓ envoyé, ✓✓ lu. */
export function StatusLabel({ time, outgoing, read, className = '' }: { time: Date; outgoing: boolean; read: boolean; className?: string }) {
  return (
    <span className={`dm-status ${className}`}>
      <time dateTime={time.toISOString()}>{clock(time)}</time>
      {outgoing && <DeliveryIcon read={read} />}
    </span>
  );
}

export function DeliveryIcon({ read }: { read: boolean }) {
  return (
    <span className={`dm-check${read ? ' is-read' : ''}`} role="img" aria-label={read ? 'Lu' : 'Envoyé'}>
      <Icon name={read ? 'checkCheck' : 'check'} />
    </span>
  );
}

/** Heure dans la bulle, en bas à droite, avec la place gardée en fin de dernière ligne (copie invisible). */
function Meta({ time, outgoing, read }: { time: Date; outgoing: boolean; read: boolean }) {
  return (
    <>
      <span className="dm-meta-space" aria-hidden="true">
        {clock(time)}
        {outgoing && <span className="dm-check"><Icon name="checkCheck" /></span>}
      </span>
      <StatusLabel time={time} outgoing={outgoing} read={read} className="dm-meta" />
    </>
  );
}

// MARK: - Liste

type ThreadProps = {
  conversation: Conversation;
  /** Messages visibles (visibleMessages). */
  messages: Message[];
  /** Offres de la conversation ; `null` tant qu'elles ne sont pas lues. */
  offers: OfferRow[] | null;
  /** Demandes de visite de la conversation (même annonce, mêmes deux personnes). */
  requests: ConversationVisitRequest[];
  me: string | null;
  /** On peut écrire dans la conversation (pas bloquée, ni quittée, ni avec un compte supprimé) : « Répondre ». */
  canWrite: boolean;
  /** Messages plus anciens à lire en remontant (n° 19). */
  hasOlder: boolean;
  onLoadOlder: () => Promise<boolean>;
  onOfferAction: (offer: OfferRow, action: OfferAction) => void;
  onProposeSlots: (request: ConversationVisitRequest) => void;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
};

/** « En bas » : à moins de 120 px du bas, comme l'app (n° 104). */
const NEAR_BOTTOM = 120;
/** Haut de la liste : la page d'avant est demandée à moins de 400 px du haut (n° 19). */
const NEAR_TOP = 400;

/** Ce que les bulles d'un fil savent faire : gestes, menu, citations (demande du 17/11). */
type Interactions = {
  me: string | null;
  canWrite: boolean;
  messages: Message[];
  flashed: string | null;
  onMenu: (message: Message, outgoing: boolean, rect: DOMRect, preview: ReactNode) => void;
  onShowReactions: (message: Message) => void;
  /** Glisser pour répondre (quand « Répondre » est permis). */
  onReply: (message: Message) => void;
  onOpenQuote: (id: string) => void;
};

export function Thread({
  conversation, messages, offers, requests, me, canWrite, hasOlder, onLoadOlder, onOfferAction, onProposeSlots, onReply, onForward,
}: ThreadProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // Premier et dernier message affichés, et date du dernier : ce qui a changé depuis le dernier affichage.
  const edges = useRef<{ first: string | null; last: string | null; lastAt: number } | null>(null);
  // Page plus ancienne demandée (n° 19) : le premier message affiché, la première bulle et sa place sous le haut de la
  // liste, la hauteur et la position du défilement ; ce que l'on voit reste à sa place quand la page arrive.
  const anchor = useRef<{ first: string; bubble: string | null; offset: number; height: number; top: number } | null>(null);
  // Une page qui n'a rien apporté (hors ligne) n'est redemandée qu'en remontant de nouveau, comme l'app.
  const armed = useRef(true);
  const [viewer, setViewer] = useState<number | null>(null);
  const [focused, setFocused] = useState<FocusedMessage | null>(null);
  const [reactionsOf, setReactionsOf] = useState<string | null>(null);
  const [flashed, setFlashed] = useState<string | null>(null);
  const flashTimers = useRef<number[]>([]);
  useEffect(() => () => flashTimers.current.forEach((timer) => window.clearTimeout(timer)), []);
  // « + » de la barre d'emojis, « Signaler » (reçu) et « Supprimer » (envoyé) de l'appui long.
  const [emojiFor, setEmojiFor] = useState<Message | null>(null);
  const [reported, setReported] = useState<Message | null>(null);
  const [toDelete, setToDelete] = useState<Message | null>(null);
  // Pastille du jour (floatingDayLabel) : seulement pendant un défilement de la personne (molette, doigt, clavier,
  // barre de défilement), jamais à l'ouverture ni quand la liste descend seule ; elle part 1,2 s après.
  const [pill, setPill] = useState<{ label: string; shown: boolean } | null>(null);
  const pillTimer = useRef<number | undefined>(undefined);
  const userScroll = useRef(0);
  useEffect(() => () => window.clearTimeout(pillTimer.current), []);
  const markUserScroll = () => {
    userScroll.current = Date.now();
  };
  // Les originaux cités qui ne sont pas dans les messages lus : relus une fois, la citation suit.
  useStore(quotedStore);
  const replyKey = messages.map((message) => message.replyToId ?? '').join(',');
  useEffect(() => {
    for (const message of messages) if (message.replyToId) void loadQuotedOriginal(message.replyToId, messages);
  }, [replyKey]); // Seulement quand une réponse arrive : les messages sont relus à chaque changement.
  const now = new Date();
  const days = siteThreadDays(messages, requests, now);
  // Ce qui est là à l'ouverture ne bouge pas ; ce qui arrive ensuite (reçu ou envoyé) apparaît en fondu. Les pages
  // plus anciennes, lues en remontant, arrivent sans fondu.
  const known = useRef<{ keys: Set<string>; from: number } | null>(null);
  known.current ??= {
    keys: new Set(days.flatMap((day) => day.rows.map((row) => row.item.key))),
    from: days[0]?.rows[0]?.item.at.getTime() ?? -Infinity,
  };
  const isFresh = (item: SiteThreadRow['item']) => !!known.current && !known.current.keys.has(item.key) && item.at.getTime() >= known.current.from;
  const entries = mediaEntries(messages);
  const offersKey = (offers ?? []).map((offer) => `${offer.id}${offer.status}`).join(',');
  const requestsKey = requests.map((request) => `${request.id}${request.status}`).join(',');

  const firstMessage = messages[0] ?? null;
  const lastMessage = messages.length ? messages[messages.length - 1] : null;
  const smooth = (): ScrollBehavior => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

  /** Repère du haut de la liste : la première bulle et sa place sous le haut, la hauteur et la position du défilement. */
  const measure = (first: string) => {
    const el = scroller.current;
    if (!el) return null;
    const bubble = el.querySelector<HTMLElement>('[data-message-id]');
    return {
      first,
      bubble: bubble?.dataset.messageId ?? null,
      offset: bubble ? bubble.getBoundingClientRect().top - el.getBoundingClientRect().top : 0,
      height: el.scrollHeight,
      top: el.scrollTop,
    };
  };

  /** Près du haut : la page d'avant, une à la fois ; le haut de la liste est noté pour rester à sa place (n° 19). */
  const loadOlder = () => {
    if (!hasOlder || !firstMessage || anchor.current || !armed.current) return;
    const kept = measure(firstMessage.id);
    if (!kept) return;
    anchor.current = kept;
    void onLoadOlder().then((added) => {
      if (!added) armed.current = false;
      // La page arrivée est déjà affichée et remise en place ; si rien de visible n'est arrivé, le repère est libéré.
      requestAnimationFrame(() => {
        if (anchor.current === kept) anchor.current = null;
      });
    });
  };

  // À l'ouverture : directement en bas. Ensuite (n° 104), un nouveau message descend la liste seulement si elle était
  // déjà en bas ou s'il vient de moi ; une suppression ou un message éphémère qui disparaît ne la fait pas bouger. Une
  // page plus ancienne ajoutée au-dessus garde à sa place ce que l'on voyait (n° 19).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const before = edges.current;
    edges.current = { first: firstMessage?.id ?? null, last: lastMessage?.id ?? null, lastAt: lastMessage?.createdAt.getTime() ?? -Infinity };
    if (!before) {
      stick.current = true;
      el.scrollTop = el.scrollHeight;
    } else {
      const kept = anchor.current;
      if (kept && sameId(before.first, kept.first) && !sameId(kept.first, firstMessage?.id)) {
        anchor.current = null;
        const bubble = kept.bubble ? [...el.querySelectorAll<HTMLElement>('[data-message-id]')].find((item) => item.dataset.messageId === kept.bubble) : null;
        el.scrollTop = bubble
          ? el.scrollTop + bubble.getBoundingClientRect().top - el.getBoundingClientRect().top - kept.offset
          : kept.top + el.scrollHeight - kept.height;
      }
      if (lastMessage && !sameId(before.last, lastMessage.id) && lastMessage.createdAt.getTime() > before.lastAt
        && (stick.current || sameId(lastMessage.senderId, me))) {
        stick.current = true;
        el.scrollTo({ top: el.scrollHeight, behavior: smooth() });
      }
    }
    // Tout tient sans défiler : rien ne permettrait de remonter, la page d'avant est lue tout de suite.
    if (el.scrollHeight <= el.clientHeight) loadOlder();
  }, [firstMessage?.id, lastMessage?.id]);

  // Cartes d'offre ou de demande de visite qui arrivent ou changent : en bas seulement si la liste y était (n° 104).
  const cardsShown = useRef(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!cardsShown.current) {
      cardsShown.current = true;
      return;
    }
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: smooth() });
  }, [offersKey, requestsKey]);

  // Les images arrivent après les bulles : la liste reste collée en bas si on y était.
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  const openMedia = (attachment: Attachment) => {
    const index = entries.findIndex((entry) => entry.attachment.id === attachment.id);
    if (index >= 0) setViewer(index);
  };

  /** Clic sur une citation : l'original vient au centre, puis s'éclaire un instant (scrollRequest de l'app). */
  const openQuote = (id: string) => {
    const target = [...(scroller.current?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [])].find((el) => sameId(el.dataset.messageId, id));
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    flashTimers.current.forEach((timer) => window.clearTimeout(timer));
    flashTimers.current = [
      window.setTimeout(() => setFlashed(id), 350),
      window.setTimeout(() => setFlashed((current) => (current === id ? null : current)), 1250),
    ];
  };
  const interactions: Interactions = {
    me, canWrite, messages, flashed,
    onMenu: (message, outgoing, rect, preview) => setFocused({ message, rect, outgoing, preview }),
    onShowReactions: (message) => setReactionsOf(message.id),
    onReply,
    onOpenQuote: openQuote,
  };
  const closeMenu = useCallback(() => setFocused(null), []);
  /** Jour dont le séparateur est passé sous le haut de la liste (topVisibleDay), sinon le premier. */
  const showDayPill = (el: HTMLDivElement) => {
    if (Date.now() - userScroll.current > 1500) return;
    const top = el.getBoundingClientRect().top;
    let current = days[0] ?? null;
    for (const section of el.querySelectorAll<HTMLElement>('[data-day]')) {
      if (section.getBoundingClientRect().top - top > 10) break;
      current = days.find((day) => day.key === section.dataset.day) ?? current;
    }
    if (!current) return;
    setPill({ label: floatingDayLabel(current.date, new Date()), shown: true });
    window.clearTimeout(pillTimer.current);
    pillTimer.current = window.setTimeout(() => setPill((value) => (value ? { ...value, shown: false } : null)), 1200);
  };
  /** « Supprimer » confirmé : pour tout le monde ; un refus le dit sans rien retirer du fil. */
  const removeMessage = async (message: Message) => {
    if (!(await deleteMessage(message.id))) showNotice('Ce message n\'a pas pu être supprimé.');
  };
  const destructiveItem = (message: Message, outgoing: boolean): FocusMenuItem | null => {
    const close = () => setFocused(null);
    if (outgoing) return { label: 'Supprimer', icon: 'trash', onSelect: () => { close(); setToDelete(message); } };
    return { label: 'Signaler', icon: 'flag', onSelect: () => { close(); setReported(message); } };
  };
  const menuItems = (message: Message): FocusMenuItem[] => {
    const items: FocusMenuItem[] = [];
    const close = () => setFocused(null);
    if (canWrite && canReply(message.content)) items.push({ label: 'Répondre', icon: 'reply', onSelect: () => { close(); onReply(message); } });
    if (canForward(message.content)) items.push({ label: 'Transférer', icon: 'forward', onSelect: () => { close(); onForward(message); } });
    if (message.content.kind === 'text') {
      const text = message.content.text;
      items.push({ label: 'Copier', icon: 'copy', onSelect: () => { void navigator.clipboard?.writeText(text).catch(() => undefined); close(); } });
    }
    return items;
  };

  return (
    <div className="dm-thread-box">
    {pill && <p className={`dm-day-pill${pill.shown ? ' is-shown' : ''}`} aria-hidden="true"><span>{pill.label}</span></p>}
    <div
      className="dm-thread"
      ref={scroller}
      onWheel={markUserScroll}
      onTouchMove={markUserScroll}
      onPointerDown={markUserScroll}
      onKeyDown={markUserScroll}
      onScroll={(event) => {
        const el = event.currentTarget;
        showDayPill(el);
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
        if (el.scrollTop >= NEAR_TOP) armed.current = true;
        // Page demandée : le repère suit le défilement, pour que ce que l'on voit reste en place quand elle arrive.
        const kept = anchor.current;
        if (kept) Object.assign(kept, measure(kept.first));
        else if (el.scrollTop < NEAR_TOP) loadOlder();
      }}
    >
      <div className="dm-thread-inner" ref={content}>
        {days.length === 0 && (
          // Le texte sur le bien seulement pour la personne qui achète ou loue, dans une conversation d'annonce (n° 98).
          <p className="dm-thread-empty">
            {conversation.listing && !conversation.isGroup && !conversation.isSellerSide
              ? 'Présentez-vous et posez vos questions sur le bien : votre message part directement au vendeur.'
              : 'Écrivez votre premier message.'}
          </p>
        )}
        {days.map((day) => (
          <section key={day.key} className="dm-day" aria-label={day.label} data-day={day.key}>
            <p className="dm-day-label">{day.label}</p>
            {day.rows.map((row) => (
              <ThreadRowView
                key={row.item.key}
                row={row}
                fresh={isFresh(row.item)}
                conversation={conversation}
                offers={offers}
                me={me}
                onOfferAction={onOfferAction}
                onProposeSlots={onProposeSlots}
                onOpenMedia={openMedia}
                interactions={interactions}
              />
            ))}
          </section>
        ))}
      </div>
      <MessageMenu
        focused={focused}
        myEmoji={myEmojiOn(focused?.message ?? null, me)}
        items={focused ? menuItems(focused.message) : []}
        destructive={focused ? destructiveItem(focused.message, focused.outgoing) : null}
        onEmoji={(emoji) => {
          const message = focused?.message;
          setFocused(null);
          if (message) void react(message.id, emoji);
        }}
        onMore={() => {
          const message = focused?.message ?? null;
          setFocused(null);
          setEmojiFor(message);
        }}
        onClose={closeMenu}
      />
      <EmojiPickerSheet
        open={emojiFor !== null}
        myEmoji={myEmojiOn(emojiFor, me)}
        onPick={(emoji) => {
          if (emojiFor) void react(emojiFor.id, emoji);
        }}
        onClose={() => setEmojiFor(null)}
      />
      <ReportSheet
        open={reported !== null}
        title="Signaler le message"
        conversationId={conversation.id}
        messageId={reported?.id ?? null}
        onClose={() => setReported(null)}
      />
      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer ce message ?"
        message={toDelete?.content.kind === 'attachments' && toDelete.content.items.length > 0
          ? 'Ce message sera supprimé pour tout le monde, avec ses fichiers.'
          : undefined}
        confirm="Supprimer"
        destructive
        onConfirm={() => {
          if (toDelete) void removeMessage(toDelete);
        }}
        onClose={() => setToDelete(null)}
      />
      <ReactionsSheet messageId={reactionsOf} conversation={conversation} me={me} onClose={() => setReactionsOf(null)} />
      <MediaViewer
        entries={entries}
        index={viewer}
        conversation={conversation}
        me={me}
        onIndex={setViewer}
        onClose={() => setViewer(null)}
      />
    </div>
    </div>
  );
}

/** Fil en cours de lecture : la roue, 40 px sous le haut (ProgressView de l'app). */
export function ThreadLoading() {
  return (
    <div className="dm-thread is-loading">
      <Spinner label="Chargement des messages" />
    </div>
  );
}

const findOffer = (offers: OfferRow[], id: string) => offers.find((offer) => sameId(offer.id, id)) ?? null;

/** Avatar de 23 px de l'expéditeur, à côté de la dernière bulle reçue d'une série ; sinon un espace de 23 px. */
function SenderAvatar({ conversation, senderId, shown }: { conversation: Conversation; senderId: string | null; shown: boolean }) {
  if (!shown) return <span className="dm-msg-avatar is-empty" aria-hidden="true" />;
  const member = groupSender(conversation, senderId);
  if (!member) return <ConversationAvatar conversation={conversation} size={23} fontSize={8.5} className="dm-msg-avatar" />;
  const profile = profileOf(member.userId);
  const photo = profile ? avatarUrl(member.kind === 'agency' ? profile.agency_logo_path ?? null : profile.avatar_path) : null;
  return (
    <CounterpartAvatar
      counterpart={{ name: member.name, kind: member.kind, imagePath: null }}
      size={23}
      fontSize={8.5}
      className="dm-msg-avatar"
      photo={photo}
    />
  );
}

/**
 * Au-dessus d'une bulle : « Transféré », puis pour une réponse « Vous avez répondu à Sophie » et la citation (« … »
 * pendant la lecture de l'original, « Message supprimé » s'il n'existe plus).
 */
function MessageContext({ message, outgoing, conversation, interactions }: {
  message: Message;
  outgoing: boolean;
  conversation: Conversation;
  interactions: Interactions;
}) {
  const replyId = message.replyToId;
  if (!message.isForwarded && !replyId) return null;
  const personName = (id: string | null) => groupSender(conversation, id)?.name ?? conversation.counterpart.name;
  let reply: ReactNode = null;
  if (replyId) {
    const original = quotedOriginal(replyId, interactions.messages);
    const quoted = original.status === 'found' ? original.message : null;
    const replier = firstName(personName(message.senderId));
    const header = quoted
      ? replyHeader({
        replierIsMe: outgoing, replierName: replier, quotedIsMine: sameId(quoted.senderId, interactions.me), quotedName: firstName(personName(quoted.senderId)),
        isSamePerson: sameId(message.senderId, quoted.senderId),
      })
      : outgoing ? 'Vous avez répondu' : `${replier} a répondu`;
    const text = original.status === 'loading' ? '…' : quoteText(quoted);
    const deleted = original.status !== 'loading' && text === DELETED_QUOTE;
    reply = (
      <ReplyContext
        header={header}
        text={text}
        deleted={deleted}
        onOpen={() => {
          if (quoted && interactions.messages.some((item) => sameId(item.id, replyId))) interactions.onOpenQuote(replyId);
        }}
      />
    );
  }
  return (
    <div className="dm-msg-context">
      {message.isForwarded && <ForwardedLabel />}
      {reply}
    </div>
  );
}

function ThreadRowView({ row, fresh, conversation, offers, me, onOfferAction, onProposeSlots, onOpenMedia, interactions }: {
  row: SiteThreadRow;
  /** Arrivé après l'ouverture : en fondu. */
  fresh: boolean;
  conversation: Conversation;
  offers: OfferRow[] | null;
  me: string | null;
  onOfferAction: (offer: OfferRow, action: OfferAction) => void;
  onProposeSlots: (request: ConversationVisitRequest) => void;
  onOpenMedia: (attachment: Attachment) => void;
  interactions: Interactions;
}) {
  const { item, startsGroup, endsGroup } = row;
  const outgoing = sameId(item.senderId, me);
  const spacing = `${startsGroup ? ' starts-group' : ''}${fresh ? ' is-new' : ''}`;
  const avatar = !outgoing && <SenderAvatar conversation={conversation} senderId={item.senderId} shown={endsGroup} />;
  const sender = groupSender(conversation, item.senderId);
  const name = sender && !outgoing && startsGroup ? <p className="dm-sender">{sender.name}</p> : null;

  if (item.kind === 'visit') {
    return (
      <div className={`dm-msg${outgoing ? ' is-out' : ''}${spacing}`}>
        {name}
        <div className="dm-msg-line">
          {avatar}
          <VisitCard request={item.request} onPropose={() => onProposeSlots(item.request)} />
        </div>
      </div>
    );
  }

  const message = item.message;
  const content = message.content;
  if (content.kind === 'system') {
    return <p className={`dm-system${spacing}`}><span>{content.text}</span></p>;
  }
  // Contenu que le site ne sait pas lire : rien (l'app ne lit pas non plus ces lignes).
  if (content.kind === 'unknown') return null;

  // Visite confirmée : la carte, puis l'avatar et l'heure sous la dernière d'une série (comme l'app).
  if (content.kind === 'visitConfirmed') {
    const slot = new Date(content.slot);
    if (!Number.isNaN(slot.getTime())) {
      return (
        <div className={`dm-msg is-card${spacing}`} data-message-id={message.id}>
          <VisitEventCard id={message.id} slot={slot} address={content.address} className="dm-card-in-thread" />
          {endsGroup && (
            <p className="dm-card-foot">
              <ConversationAvatar conversation={conversation} size={23} fontSize={8.5} className="dm-msg-avatar" />
              <time dateTime={message.createdAt.toISOString()}>{clock(message.createdAt)}</time>
            </p>
          )}
        </div>
      );
    }
  }

  if (content.kind === 'offer') {
    const offer = offers ? findOffer(offers, content.offerId) : null;
    if (!offer && offers === null) return <div className={`dm-msg${outgoing ? ' is-out' : ''}${spacing}`} aria-busy="true" />;
    if (!offer) return <p className={`dm-system is-plain${spacing}`}><span>Offre indisponible</span></p>;
    // Carte de 300 px au plus, décalée de 31 px (reçue) ou 40 px (envoyée) ; l'heure dessous comme un message.
    return (
      <div className={`dm-msg is-card${outgoing ? ' is-out' : ''}${spacing}`} data-message-id={message.id}>
        <OfferCard
          offer={offer}
          listingPrice={conversation.listing?.price ?? null}
          isMine={outgoing}
          onAction={(action) => onOfferAction(offer, action)}
        />
        <StatusLabel time={message.createdAt} outgoing={outgoing} read={message.isRead} className="dm-msg-status" />
      </div>
    );
  }

  // Bulle avec ses gestes (double clic, menu) et sa pastille ; le menu en montre une copie à sa place.
  const interactive = (bubble: () => ReactNode) => (
    <InteractiveMessage
      message={message}
      flashing={sameId(interactions.flashed, message.id)}
      onHeart={() => void toggleHeart(message.id)}
      onMenu={(rect) => interactions.onMenu(message, outgoing, rect, bubble())}
      onShowReactions={() => interactions.onShowReactions(message)}
      onReply={interactions.canWrite && canReply(message.content) ? () => interactions.onReply(message) : null}
    >
      {bubble()}
    </InteractiveMessage>
  );
  const context = <MessageContext message={message} outgoing={outgoing} conversation={conversation} interactions={interactions} />;
  const reacted = message.reactions.length > 0 ? ' has-reaction' : '';

  if (content.kind === 'attachments') {
    // Photos et documents portent l'heure ; vocal, lieu et contact l'ont juste en dessous.
    const statusBelow = content.items.some((item) => item.kind === 'audio' || item.kind === 'location' || item.kind === 'contact');
    return (
      <div className={`dm-msg${outgoing ? ' is-out' : ''}${spacing}${reacted}`} data-message-id={message.id}>
        {name}
        {context}
        <div className="dm-msg-line">
          {avatar}
          {interactive(() => (
            <AttachmentBubble items={content.items} caption={content.caption} outgoing={outgoing} message={message} onOpenMedia={onOpenMedia} />
          ))}
        </div>
        {statusBelow && <StatusLabel time={message.createdAt} outgoing={outgoing} read={message.isRead} className="dm-msg-status" />}
      </div>
    );
  }

  return (
    <div className={`dm-msg${outgoing ? ' is-out' : ''}${spacing}${reacted}`} data-message-id={message.id}>
      {name}
      {context}
      <div className="dm-msg-line">
        {avatar}
        {interactive(() => <Bubble message={message} outgoing={outgoing} />)}
      </div>
    </div>
  );
}

/** Bulle de texte : blanche à gauche, bleue à droite ; l'heure (et les coches) dedans, en bas à droite. */
function Bubble({ message, outgoing }: { message: Message; outgoing: boolean }) {
  return (
    <div className="dm-bubble-wrap">
      <div className={`dm-bubble${outgoing ? ' is-out' : ''}`}>
        <span className="dm-text">{keepNumbersTogether(bubbleText(message.content))}</span>
        <Meta time={message.createdAt} outgoing={outgoing} read={message.isRead} />
      </div>
    </div>
  );
}

// MARK: - Demande de visite

/**
 * Carte d'une demande de visite : « Demande de visite », la date (« Samedi 15 novembre · 10:00 »), « Bien · sur place »,
 * puis « Accepter » et « Autre créneau » quand le serveur permet ces réponses ; plusieurs créneaux se choisissent.
 */
function VisitCard({ request, onPropose }: { request: ConversationVisitRequest; onPropose: () => void }) {
  const choices = openSlots(request);
  const canAccept = request.allowedActions.includes('accept') && choices.length > 0;
  const canPropose = request.allowedActions.includes('propose') && (request.status === 'pending' || request.status === 'counterProposed');
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = (chosen ? choices.find((slot) => sameId(slot.id, chosen)) : null) ?? (canAccept ? choices[0] : null) ?? shownSlot(request);
  const start = selected ? new Date(selected.start) : null;
  const outcome = requestOutcome(request);
  const waiting = !canAccept && (request.status === 'pending' || request.status === 'counterProposed');

  const accept = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await acceptVisitRequest(request.id, selected.id);
      await refreshAfterVisit();
    } catch (failure) {
      setError(visitErrorMessage(failure));
      await refreshAfterVisit();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dm-visit">
      <div className="dm-visit-head">
        <span className="dm-visit-icon" aria-hidden="true"><Icon name="calendarBlank" /></span>
        <span className="dm-visit-kind">{requestCardTitle(request)}</span>
      </div>
      {start && !Number.isNaN(start.getTime()) && <p className="dm-visit-when">{requestDateWide(start)}</p>}
      <p className="dm-visit-where">{requestPlaceLine(request)}</p>
      {canAccept && choices.length > 1 && (
        <div className="dm-visit-slots" role="group" aria-label="Créneaux proposés">
          {choices.map((slot) => {
            const date = new Date(slot.start);
            return (
              <button
                key={slot.id}
                type="button"
                className="dm-visit-slot"
                aria-pressed={sameId(slot.id, selected?.id)}
                onClick={() => setChosen(slot.id)}
              >
                {requestDateShort(date)}
              </button>
            );
          })}
        </div>
      )}
      {outcome && (
        <p className={`dm-visit-outcome${outcome.confirmed ? ' is-confirmed' : ''}`}>
          {outcome.confirmed && <Icon name="check" />}
          {outcome.text}
        </p>
      )}
      {waiting && <p className="dm-visit-state">En attente de réponse</p>}
      {(canAccept || canPropose) && (
        <div className="dm-visit-actions">
          {canAccept && (
            <button type="button" className="is-filled" onClick={() => void accept()} disabled={busy} aria-busy={busy}>Accepter</button>
          )}
          {canPropose && <button type="button" onClick={onPropose} disabled={busy}>Autre créneau</button>}
        </div>
      )}
      {error && <p className="dm-error" role="alert">{error}</p>}
      <StatusLabel time={request.createdAt} outgoing={false} read={false} className="dm-card-time" />
    </div>
  );
}

// MARK: - Offre (OfferCard)

const STATUS_CLASSES: Record<string, string> = {
  pending: 'is-pending', accepted: 'is-accepted', rejected: 'is-closed', expired: 'is-closed', withdrawn: 'is-closed', countered: 'is-countered',
};

/**
 * Carte d'offre (OfferCard de l'app) : « OFFRE » ou « CONTRE-OFFRE » en bleu avec la poignée de main, l'état en
 * pastille à droite, le montant, l'écart avec le prix, les conditions, le motif d'un refus, la validité, puis les
 * boutons de 36 px (« Accepter » plein, les autres bleu clair).
 */
export function OfferCard({ offer, listingPrice, isMine, onAction }: {
  offer: OfferRow;
  listingPrice: number | null;
  isMine: boolean;
  onAction: (action: OfferAction) => void;
}) {
  const now = new Date();
  const status = effectiveStatus(offer, now);
  const actions = allowedActions(offer, now);
  const amount = Number(offer.amount);
  const expires = offer.expires_at ? new Date(offer.expires_at) : null;
  return (
    <div className="dm-offer">
      <div className="dm-offer-head">
        <Icon name="handshake" />
        <span className="dm-offer-kind">{offer.parent_offer_id ? 'Contre-offre' : 'Offre'}</span>
        <span className={`dm-offer-status ${STATUS_CLASSES[status]}`}>{offerStatusLabel(status, isMine)}</span>
      </div>
      <p className="dm-offer-amount">{keepNumbersTogether(formatPrice(amount))}</p>
      {listingPrice !== null && listingPrice > 0 && <p className="dm-offer-gap">{keepNumbersTogether(offerGapLabel(amount, listingPrice))}</p>}
      {offer.conditions && <p className="dm-offer-conditions">{offer.conditions}</p>}
      {offer.decline_reason && status === 'rejected' && <p className="dm-offer-reason">Motif : {offer.decline_reason}</p>}
      {expires && !Number.isNaN(expires.getTime()) && status === 'pending' && (
        <p className="dm-offer-expiry">Valable jusqu'au {dayMonthWide.format(expires)}</p>
      )}
      {actions.size > 0 && (
        <div className="dm-offer-actions">
          {actions.has('accept') && <button type="button" className="is-filled" onClick={() => onAction('accept')}>Accepter</button>}
          {actions.has('counter') && <button type="button" onClick={() => onAction('counter')}>Contre-offre</button>}
          {actions.has('decline') && <button type="button" onClick={() => onAction('decline')}>Refuser</button>}
          {actions.has('withdraw') && <button type="button" onClick={() => onAction('withdraw')}>Retirer</button>}
        </div>
      )}
    </div>
  );
}

// MARK: - Pièces jointes (AttachmentBubble)

function AttachmentBubble({ items, caption, outgoing, message, onOpenMedia }: {
  items: Attachment[];
  caption: string | null;
  outgoing: boolean;
  message: Message;
  onOpenMedia: (attachment: Attachment) => void;
}) {
  const media = items.filter(isMedia);
  const others = items.filter((item) => !isMedia(item));
  const text = caption ? keepNumbersTogether(caption) : null;
  return (
    <div className={`dm-attachments${outgoing ? ' is-out' : ''}`}>
      {media.length > 0 && (
        <div className="dm-media-block">
          <MediaGrid media={media} onOpen={onOpenMedia} />
          {text ? (
            <div className={`dm-media-caption${outgoing ? ' is-out' : ''}`}>
              <p>{text}<Meta time={message.createdAt} outgoing={outgoing} read={message.isRead} /></p>
            </div>
          ) : (
            <StatusLabel time={message.createdAt} outgoing={outgoing} read={message.isRead} className="is-on-image" />
          )}
        </div>
      )}
      {others.map((item) => {
        switch (item.kind) {
          case 'document': return <FileCard key={item.id} item={item} outgoing={outgoing} message={message} />;
          case 'location': return <LocationCard key={item.id} item={item} outgoing={outgoing} />;
          case 'contact': return <ContactCard key={item.id} item={item} outgoing={outgoing} />;
          case 'audio': return <VoiceBubble key={item.id} item={item} outgoing={outgoing} />;
          case 'gif': return (
            <GifBubble key={item.id} item={item} status={<StatusLabel time={message.createdAt} outgoing={outgoing} read={message.isRead} className="is-on-image" />} />
          );
          // Sorte venue d'une version plus récente de l'app (n° 30) : le message neutre de l'app.
          case 'unsupported': return <p key={item.id} className={`dm-caption is-unsupported${outgoing ? ' is-out' : ''}`}>{UNSUPPORTED_ATTACHMENT}</p>;
          default: return null;
        }
      })}
      {items.length === 0 && !text && <p className={`dm-caption is-unsupported${outgoing ? ' is-out' : ''}`}>{UNSUPPORTED_ATTACHMENT}</p>}
      {media.length === 0 && text && (
        <p className={`dm-caption${outgoing ? ' is-out' : ''}`}>{text}<Meta time={message.createdAt} outgoing={outgoing} read={message.isRead} /></p>
      )}
    </div>
  );
}

/** Photos et vidéos par rangées de deux ; une seule garde ses proportions (entre 120 px et 4/3 de la largeur). */
function MediaGrid({ media, onOpen }: { media: Attachment[]; onOpen: (attachment: Attachment) => void }) {
  const shown = media.slice(0, 4);
  return (
    <div className={`dm-media-grid is-${shown.length}`}>
      {shown.map((item, index) => (
        <MediaTile
          key={item.id}
          item={item}
          single={shown.length === 1}
          wide={shown.length === 3 && index === 2}
          more={index === 3 && media.length > 4 ? media.length - 4 : 0}
          onOpen={() => onOpen(item)}
        />
      ))}
    </div>
  );
}

function MediaTile({ item, single, wide, more, onOpen }: { item: Attachment; single: boolean; wide: boolean; more: number; onOpen: () => void }) {
  const url = useSignedUrl(item.kind === 'video' ? item.thumbnailPath : item.storagePath);
  const [ratio, setRatio] = useState<number | null>(null);
  const style = single ? { aspectRatio: ratio ? String(Math.min(Math.max(ratio, 0.75), 320 / 120)) : '4 / 3' } : undefined;
  return (
    <button type="button" className={`dm-media-tile${wide ? ' is-wide' : ''}`} style={style} onClick={onOpen} aria-label={item.kind === 'video' ? 'Vidéo' : 'Photo'}>
      {url ? (
        <img src={url} alt="" loading="lazy" onLoad={(event) => {
          const image = event.currentTarget;
          if (image.naturalWidth && image.naturalHeight) setRatio(image.naturalWidth / image.naturalHeight);
        }} />
      ) : <Icon name="image" />}
      {item.kind === 'video' && (
        <>
          <span className="dm-play" aria-hidden="true"><Icon name="play" /></span>
          {item.durationSeconds !== undefined && <span className="dm-duration">{durationLabel(item.durationSeconds)}</span>}
        </>
      )}
      {more > 0 && <span className="dm-more">+{more}</span>}
    </button>
  );
}

/**
 * Fichier : carte dans la bulle, l'extension dans un carré blanc (« PDF » en rouge), le nom en gras, « PDF · 1,2 Mo » ;
 * un clic l'ouvre dans un nouvel onglet (URL signée de 10 minutes), d'où on peut le télécharger.
 */
export function FileCard({ item, outgoing, message }: { item: Attachment; outgoing: boolean; message: Message }) {
  const url = useSignedUrl(item.storagePath);
  const extension = fileExtension(item.fileName);
  const line = [extension || null, sizeLabel(item.byteCount)].filter((part): part is string => !!part).join(' · ');
  const body = (
    <>
      <span className="dm-file-card">
        <span className={`dm-file-badge${extension === 'PDF' ? ' is-pdf' : ''}`} aria-hidden="true">
          {extension && extension.length <= 4 ? extension : <Icon name="fileText" />}
        </span>
        <span className="dm-file-text">
          <span className="dm-file-name">{item.fileName}</span>
          <span className="dm-file-line">{line}</span>
        </span>
      </span>
      <StatusLabel time={message.createdAt} outgoing={outgoing} read={message.isRead} className="dm-meta" />
    </>
  );
  const className = `dm-file${outgoing ? ' is-out' : ''}`;
  return url ? (
    <a className={className} href={url} target="_blank" rel="noopener noreferrer" title="Ouvre le fichier">{body}</a>
  ) : (
    <span className={`${className} is-waiting`} aria-busy={!!item.storagePath}>{body}</span>
  );
}

/** Localisation : nom du lieu ; elle s'ouvre dans Plans d'Apple (même adresse que l'app). */
function LocationCard({ item, outgoing }: { item: Attachment; outgoing: boolean }) {
  const href = item.latitude !== undefined && item.longitude !== undefined
    ? `https://maps.apple.com/?ll=${item.latitude},${item.longitude}&q=${encodeURIComponent(item.fileName)}`
    : null;
  const body = (
    <>
      <Icon name="pin" />
      <span>{item.fileName}</span>
    </>
  );
  return href ? (
    <a className={`dm-place${outgoing ? ' is-out' : ''}`} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Localisation : ${item.fileName}`}>{body}</a>
  ) : <span className={`dm-place${outgoing ? ' is-out' : ''}`}>{body}</span>;
}

/** Numéros d'un contact partagé : un par ligne dans `detail`, comme l'app. */
const contactPhones = (item: Attachment) => (item.detail ?? '').split('\n').map((phone) => phone.trim()).filter(Boolean);

/** Contact partagé : nom et numéros ; un clic ouvre sa fiche (Appeler, Ajouter aux contacts). */
function ContactCard({ item, outgoing }: { item: Attachment; outgoing: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`dm-contact-card${outgoing ? ' is-out' : ''}`} onClick={() => setOpen(true)}>
        <CounterpartAvatar counterpart={{ name: item.fileName, kind: 'individual', imagePath: null }} size={40} />
        <span className="dm-contact-card-text">
          <span className="dm-contact-card-name">{item.fileName}</span>
          {item.detail && <span className="dm-contact-card-detail">{item.detail}</span>}
        </span>
        <Icon name="chevronRight" className="icon dm-chevron" />
      </button>
      <ContactSheet item={item} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Fiche d'un contact partagé (ContactCardScreen de l'app) : avatar, nom, chaque numéro avec « Appeler » (lien tel:),
 * « Ce contact n'a pas de numéro. » sinon, puis « Ajouter aux contacts » : une fiche .vcf que l'appareil ouvre avec
 * son carnet d'adresses, où rien n'est enregistré sans validation.
 */
function ContactSheet({ item, open, onClose }: { item: Attachment; open: boolean; onClose: () => void }) {
  const phones = contactPhones(item);
  const titleId = `dm-contact-${item.id}`;
  return (
    <PlainSheet open={open} onClose={onClose} className="dm-contact-sheet" labelledBy={titleId}>
      <div className="dm-contact-sheet-body">
        <button type="button" className="dm-contact-sheet-close" onClick={onClose}>Fermer</button>
        <CounterpartAvatar counterpart={{ name: item.fileName, kind: 'individual', imagePath: null }} size={72} fontSize={24} />
        <h2 id={titleId} className="dm-contact-sheet-name">{item.fileName}</h2>
        {phones.length > 0 ? (
          <div className="dm-contact-sheet-phones">
            {phones.map((phone, index) => (
              <a key={`${phone}-${index}`} className="dm-contact-sheet-row" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
                <span className="dm-contact-sheet-icon" aria-hidden="true"><Icon name="phone" /></span>
                <span className="dm-contact-sheet-text">
                  <span className="dm-contact-sheet-phone">{phone}</span>
                  <span className="dm-contact-sheet-call">Appeler</span>
                </span>
                <Icon name="chevronRight" className="icon dm-chevron" />
              </a>
            ))}
          </div>
        ) : <p className="dm-contact-sheet-empty">Ce contact n'a pas de numéro.</p>}
        <button
          type="button"
          className="btn btn-light dm-wide-button"
          onClick={() => saveFile(`${safeFileName(item.fileName, 'contact')}.vcf`, contactCardFile(item.fileName, phones), 'text/vcard;charset=utf-8')}
        >
          Ajouter aux contacts
        </button>
      </div>
    </PlainSheet>
  );
}

// MARK: - Visionneuse (MediaViewer)

const viewerDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** Télécharge un fichier reçu (« Enregistrer dans Photos » de l'app : ici, dans les téléchargements). */
async function downloadAttachment(attachment: Attachment) {
  const url = attachment.storagePath ? await signedUrl(attachment.storagePath) : null;
  try {
    if (!url) throw new Error('indisponible');
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = attachment.fileName || (attachment.kind === 'video' ? 'video.mp4' : 'photo.jpg');
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    showNotice('Le téléchargement n\'a pas abouti.');
  }
}

/**
 * Visionneuse des photos et vidéos : auteur, date et position ; « Télécharger », et « Supprimer » sur les miennes
 * (« Supprimer ce message ? », pour tout le monde, avec ses fichiers).
 */
export function MediaViewer({ entries, index, conversation, me, onIndex, onClose }: {
  entries: ReturnType<typeof mediaEntries>;
  index: number | null;
  conversation: Conversation;
  me: string | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const entry = index !== null ? entries[index] ?? null : null;
  const count = entries.length;
  const [confirming, setConfirming] = useState<string | null>(null);
  const mine = entry !== null && sameId(entry.senderId, me);
  const actions: MenuItem[] = entry ? [
    { label: 'Télécharger', icon: 'arrowDownRight', onSelect: () => void downloadAttachment(entry.attachment) },
    ...(mine ? [{ label: 'Supprimer', icon: 'trash' as const, destructive: true, onSelect: () => setConfirming(entry.messageId) }] : []),
  ] : [];
  const go = (step: number) => {
    if (index === null || count < 2) return;
    onIndex((index + step + count) % count);
  };
  return (
    <>
    <Dialog open={entry !== null} onClose={onClose} className="dm-viewer" label="Photos et vidéos">
      {entry && (
        <div
          className="dm-viewer-body"
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') go(1);
            if (event.key === 'ArrowLeft') go(-1);
          }}
        >
          <header className="dm-viewer-head">
            <div>
              <strong>{senderName(entry.senderId, conversation, me)}</strong>
              <span>{[`${viewerDate.format(entry.date)} à ${clock(entry.date)}`, count > 1 ? `${index! + 1} sur ${count}` : null].filter(Boolean).join(' · ')}</span>
            </div>
            <div className="dm-viewer-tools">
              <ActionMenu label="Plus d'actions" className="dm-viewer-button" items={actions}>
                <Icon name="ellipsisVertical" />
              </ActionMenu>
              <button type="button" className="dm-viewer-button" onClick={onClose} aria-label="Fermer" title="Fermer" autoFocus>
                <Icon name="x" />
              </button>
            </div>
          </header>
          <div className="dm-viewer-stage">
            {count > 1 && (
              <button type="button" className="dm-viewer-nav is-prev" onClick={() => go(-1)} aria-label="Précédent"><Icon name="chevronLeft" /></button>
            )}
            <ViewerMedia key={entry.attachment.id} attachment={entry.attachment} />
            {count > 1 && (
              <button type="button" className="dm-viewer-nav is-next" onClick={() => go(1)} aria-label="Suivant"><Icon name="chevronRight" /></button>
            )}
          </div>
        </div>
      )}
    </Dialog>
    <ConfirmDialog
        open={confirming !== null}
        title="Supprimer ce message ?"
        message="Ce message sera supprimé pour tout le monde, avec ses fichiers."
        confirm="Supprimer"
        destructive
        onConfirm={() => {
          const id = confirming;
          if (!id) return;
          void deleteMessage(id).then((deleted) => {
            if (deleted) onClose();
            else showNotice('Ce message n\'a pas pu être supprimé.');
          });
        }}
        onClose={() => setConfirming(null)}
      />
    </>
  );
}

function ViewerMedia({ attachment }: { attachment: Attachment }) {
  const url = useSignedUrl(attachment.storagePath);
  const poster = useSignedUrl(attachment.kind === 'video' ? attachment.thumbnailPath : null);
  if (!url) return <span className="spinner" role="status" aria-label="Chargement" />;
  if (attachment.kind === 'video') {
    return <video className="dm-viewer-media" src={url} poster={poster ?? undefined} controls playsInline aria-label="Lire la vidéo" />;
  }
  return <img className="dm-viewer-media" src={url} alt="Photo" />;
}
