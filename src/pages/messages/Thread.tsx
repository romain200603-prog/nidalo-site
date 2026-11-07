import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { formatPrice } from '../../lib/format';
import { allowedActions, effectiveStatus, offerGapLabel, offerStatusLabel, type OfferAction, type OfferRow } from '../../lib/listing/offers';
import type { Message } from '../../lib/messages/api';
import { documentIcon, documentLine, isMedia, type Attachment } from '../../lib/messages/content';
import { clock, durationLabel, sizeLabel } from '../../lib/messages/format';
import { sameId, type Conversation } from '../../lib/messages/inbox';
import { sendText, toggleHeart } from '../../lib/messages/store';
import {
  bubbleText, groupSender, mediaEntries, QUICK_REPLIES, senderName, showsQuickReplies, threadDays, type ThreadRow,
} from '../../lib/messages/thread';
import { ActionMenu, CounterpartAvatar, Dialog, showIphoneOnly, useSignedUrl } from './parts';

// Messages de la conversation ouverte (ConversationView.messagesList) : jours, séries de bulles, bulles blanches
// reçues et bleues envoyées, cœur, pièces jointes (AttachmentBubble), cartes d'offre (OfferCard), lignes système,
// réponses rapides ; la visionneuse des photos et vidéos (MediaViewer).

const dayMonthWide = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

/** Heure et coches d'un message (MessageStatusLabel, DeliveryStatusIcon). */
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
    <span className={`dm-check${read ? ' is-read' : ''}`} role="img" aria-label={read ? 'Vu' : 'Envoyé'}>
      <Icon name={read ? 'checkCheck' : 'check'} />
    </span>
  );
}

// MARK: - Liste

type ThreadProps = {
  conversation: Conversation;
  /** Messages visibles (visibleMessages). */
  messages: Message[];
  /** Offres de la conversation ; `null` tant qu'elles ne sont pas lues. */
  offers: OfferRow[] | null;
  me: string | null;
  onOfferAction: (offer: OfferRow, action: OfferAction) => void;
};

export function Thread({ conversation, messages, offers, me, onOfferAction }: ThreadProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const shownCount = useRef(-1);
  const [viewer, setViewer] = useState<number | null>(null);
  const now = new Date();
  const days = threadDays(messages, now);
  const entries = mediaEntries(messages);
  const offersKey = (offers ?? []).map((offer) => `${offer.id}${offer.status}`).join(',');

  // À l'ouverture : directement en bas ; à chaque nouveau message (ou carte d'offre changée) : en bas, en douceur.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = shownCount.current < 0;
    shownCount.current = messages.length;
    stick.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: first ? 'auto' : 'smooth' });
  }, [messages.length, offersKey]);

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

  return (
    <div
      className="dm-thread"
      ref={scroller}
      onScroll={(event) => {
        const el = event.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      <div className="dm-thread-inner" ref={content}>
        {messages.length === 0 && (
          <p className="dm-thread-empty">Présentez-vous et posez vos questions sur le bien : votre message part directement au vendeur.</p>
        )}
        {days.map((day) => (
          <section key={day.key} className="dm-day" aria-label={day.label}>
            <p className="dm-day-label">{day.label}</p>
            {day.rows.map((row) => (
              <MessageRow
                key={row.message.id}
                row={row}
                conversation={conversation}
                offer={row.message.content.kind === 'offer' && offers ? findOffer(offers, row.message.content.offerId) : null}
                offersLoading={offers === null}
                me={me}
                onOfferAction={onOfferAction}
                onOpenMedia={openMedia}
              />
            ))}
          </section>
        ))}
        {showsQuickReplies(conversation, messages, me) && (
          <div className="dm-quick" role="group" aria-label="Réponses rapides">
            {QUICK_REPLIES.map((reply) => (
              <button key={reply} type="button" onClick={() => void sendText(conversation.id, reply)}>{reply}</button>
            ))}
          </div>
        )}
      </div>
      <MediaViewer
        entries={entries}
        index={viewer}
        conversation={conversation}
        me={me}
        onIndex={setViewer}
        onClose={() => setViewer(null)}
      />
    </div>
  );
}

const findOffer = (offers: OfferRow[], id: string) => offers.find((offer) => sameId(offer.id, id)) ?? null;

function MessageRow({ row, conversation, offer, offersLoading, me, onOfferAction, onOpenMedia }: {
  row: ThreadRow;
  conversation: Conversation;
  offer: OfferRow | null;
  offersLoading: boolean;
  me: string | null;
  onOfferAction: (offer: OfferRow, action: OfferAction) => void;
  onOpenMedia: (attachment: Attachment) => void;
}) {
  const { message, startsGroup, endsGroup } = row;
  const outgoing = sameId(message.senderId, me);
  const sender = groupSender(conversation, message.senderId);
  const spacing = startsGroup ? ' starts-group' : '';
  const content = message.content;

  if (content.kind === 'system') {
    return <p className={`dm-system${spacing}`}><span>{content.text}</span></p>;
  }

  const avatar = !outgoing && endsGroup ? (
    <CounterpartAvatar
      counterpart={sender ? { name: sender.name, kind: sender.kind, imagePath: null } : conversation.counterpart}
      size={30}
      className="dm-msg-avatar"
    />
  ) : <span className="dm-msg-avatar is-empty" aria-hidden="true" />;
  const name = sender && !outgoing ? <p className="dm-sender">{sender.name}</p> : null;

  // Contenu que le site ne sait pas lire : rien (l'app ne lit pas non plus ces lignes).
  if (content.kind === 'unknown') return null;

  if (content.kind === 'offer') {
    if (!offer && offersLoading) return <div className={`dm-msg${outgoing ? ' is-out' : ''}${spacing}`} aria-busy="true" />;
    if (!offer) return <p className={`dm-system is-plain${spacing}`}><span>Offre indisponible</span></p>;
    return (
      <div className={`dm-msg${outgoing ? ' is-out' : ''}${spacing}`}>
        <div className="dm-msg-line">
          {!outgoing && <span className="dm-msg-avatar is-empty" aria-hidden="true" />}
          <OfferCard offer={offer} listingPrice={conversation.listing?.price ?? null} isMine={outgoing} onAction={(action) => onOfferAction(offer, action)} />
        </div>
        <StatusLabel time={message.createdAt} outgoing={outgoing} read={message.isRead} className="dm-msg-status" />
      </div>
    );
  }

  if (content.kind === 'attachments') {
    const hasMedia = content.items.some(isMedia);
    return (
      <div className={`dm-msg${outgoing ? ' is-out' : ''}${spacing}`}>
        {name}
        <div className="dm-msg-line">
          {!outgoing && avatar}
          <AttachmentBubble items={content.items} caption={content.caption} outgoing={outgoing} message={message} onOpenMedia={onOpenMedia} />
        </div>
        {!hasMedia && <StatusLabel time={message.createdAt} outgoing={outgoing} read={message.isRead} className="dm-msg-status" />}
      </div>
    );
  }

  return (
    <div className={`dm-msg${outgoing ? ' is-out' : ''}${spacing}${message.reaction ? ' has-reaction' : ''}`}>
      {name}
      <div className="dm-msg-line">
        {!outgoing && avatar}
        <Bubble message={message} outgoing={outgoing} />
      </div>
      {outgoing && endsGroup && <StatusLabel time={message.createdAt} outgoing read={message.isRead} className="dm-msg-status" />}
    </div>
  );
}

/** Bulle de texte (MessageBubble) : appui long (0,35 s) ou bouton cœur pour aimer ; le cœur posé en pastille. */
function Bubble({ message, outgoing }: { message: Message; outgoing: boolean }) {
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const liked = message.reaction !== null;
  return (
    <div className="dm-bubble-wrap">
      <div
        className={`dm-bubble${outgoing ? ' is-out' : ''}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          stop();
          timer.current = window.setTimeout(() => {
            timer.current = null;
            void toggleHeart(message.id);
          }, 350);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        title="Appui long pour aimer"
      >
        {bubbleText(message.content)}
      </div>
      {liked && <span className="dm-heart" role="img" aria-label="Aimé"><Icon name="heart" /></span>}
      <button
        type="button"
        className={`dm-heart-button${liked ? ' is-on' : ''}`}
        aria-label={liked ? 'Retirer le cœur' : 'Aimer'}
        aria-pressed={liked}
        title={liked ? 'Retirer le cœur' : 'Aimer'}
        onClick={() => void toggleHeart(message.id)}
      >
        <Icon name="heart" />
      </button>
    </div>
  );
}

// MARK: - Offre (OfferCard)

const STATUS_CLASSES: Record<string, string> = {
  pending: 'is-pending', accepted: 'is-accepted', rejected: 'is-closed', expired: 'is-closed', withdrawn: 'is-closed', countered: 'is-countered',
};

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
        <span>{offer.parent_offer_id ? 'CONTRE-OFFRE' : 'OFFRE'}</span>
        <span className={`dm-offer-status ${STATUS_CLASSES[status]}`}>{offerStatusLabel(status, isMine)}</span>
      </div>
      <p className="dm-offer-amount">{formatPrice(amount)}</p>
      {listingPrice !== null && listingPrice > 0 && <p className="dm-offer-gap">{offerGapLabel(amount, listingPrice)}</p>}
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
  const text = caption ? caption : null;
  return (
    <div className={`dm-attachments${outgoing ? ' is-out' : ''}`}>
      {media.length > 0 && (
        <div className="dm-media-block">
          <MediaGrid media={media} onOpen={onOpenMedia} />
          {text ? (
            <div className={`dm-media-caption${outgoing ? ' is-out' : ''}`}>
              <p>{text}</p>
              <StatusLabel time={message.createdAt} outgoing={outgoing} read={message.isRead} />
            </div>
          ) : (
            <StatusLabel time={message.createdAt} outgoing={outgoing} read={message.isRead} className="is-on-image" />
          )}
        </div>
      )}
      {others.map((item) => {
        switch (item.kind) {
          case 'document': return <DocumentCard key={item.id} item={item} outgoing={outgoing} />;
          case 'location': return <LocationCard key={item.id} item={item} outgoing={outgoing} />;
          case 'contact': return <ContactCard key={item.id} item={item} outgoing={outgoing} />;
          default: return null;
        }
      })}
      {media.length === 0 && text && <p className={`dm-caption${outgoing ? ' is-out' : ''}`}>{text}</p>}
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

/** Document : icône, nom, « DPE · PDF · 1,2 Mo » ; il s'ouvre dans un nouvel onglet (URL signée de 10 minutes). */
export function DocumentCard({ item, outgoing }: { item: Attachment; outgoing: boolean }) {
  const url = useSignedUrl(item.storagePath);
  const body = (
    <>
      <span className="dm-doc-icon"><Icon name={documentIcon(item.fileName)} /></span>
      <span className="dm-doc-text">
        <span className="dm-doc-name">{item.fileName}</span>
        <span className="dm-doc-line">{documentLine(item, sizeLabel)}</span>
      </span>
    </>
  );
  const className = `dm-doc${outgoing ? ' is-out' : ''}`;
  return url ? (
    <a className={className} href={url} target="_blank" rel="noopener noreferrer" title="Ouvre le document">{body}</a>
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

/** Contact partagé : nom et numéros ; l'ajouter aux contacts se fait dans l'app iPhone. */
function ContactCard({ item, outgoing }: { item: Attachment; outgoing: boolean }) {
  return (
    <button type="button" className={`dm-contact-card${outgoing ? ' is-out' : ''}`} onClick={() => showIphoneOnly('Ajouter aux contacts')}>
      <CounterpartAvatar counterpart={{ name: item.fileName, kind: 'individual', imagePath: null }} size={40} />
      <span className="dm-contact-card-text">
        <span className="dm-contact-card-name">{item.fileName}</span>
        {item.detail && <span className="dm-contact-card-detail">{item.detail}</span>}
      </span>
      <Icon name="chevronRight" className="icon dm-chevron" />
    </button>
  );
}

// MARK: - Visionneuse (MediaViewer)

const viewerDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

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
  const go = (step: number) => {
    if (index === null || count < 2) return;
    onIndex((index + step + count) % count);
  };
  return (
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
              <ActionMenu
                label="Plus d'actions"
                className="dm-viewer-button"
                items={[{ label: 'Enregistrer dans Photos', icon: 'arrowDownRight', onSelect: () => showIphoneOnly('Enregistrer dans Photos') }]}
              >
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
