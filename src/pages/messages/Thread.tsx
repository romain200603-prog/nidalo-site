import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { formatPrice } from '../../lib/format';
import { allowedActions, effectiveStatus, offerGapLabel, offerStatusLabel, type OfferAction, type OfferRow } from '../../lib/listing/offers';
import { visitErrorMessage } from '../../lib/listing/visits';
import type { Message } from '../../lib/messages/api';
import { fileExtension, isMedia, UNSUPPORTED_ATTACHMENT, type Attachment } from '../../lib/messages/content';
import { clock, durationLabel, keepNumbersTogether, sizeLabel } from '../../lib/messages/format';
import { sameId, type Conversation } from '../../lib/messages/inbox';
import { profileOf, refreshAfterVisit, toggleHeart } from '../../lib/messages/store';
import { bubbleText, groupSender, mediaEntries, senderName, siteThreadDays, type SiteThreadRow } from '../../lib/messages/thread';
import {
  acceptVisitRequest, openSlots, requestCardTitle, requestDateShort, requestDateWide, requestOutcome, requestPlaceLine, shownSlot,
  type ConversationVisitRequest,
} from '../../lib/messages/visitRequests';
import { avatarUrl } from '../../lib/account/profile';
import { ActionMenu, ConversationAvatar, CounterpartAvatar, Dialog, showIphoneOnly, useSignedUrl } from './parts';
import { GifBubble, VoiceBubble } from './VoiceGif';

// Fil de la conversation ouverte (demande de Romain du 14 novembre 2026) : toute la largeur, reçus collés à gauche et
// miens à droite ; séparateurs de date en pastille ; bulles serrées (4 px dans une série, 14 px quand l'expéditeur
// change), l'heure et les coches dans la bulle ; l'avatar de 28 px à côté de la dernière bulle reçue d'une série.
// Messages enrichis : photos dans la bulle, fichiers en carte, offres, demandes de visite (carte de 340 px).

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
  onOfferAction: (offer: OfferRow, action: OfferAction) => void;
  onProposeSlots: (request: ConversationVisitRequest) => void;
};

export function Thread({ conversation, messages, offers, requests, me, onOfferAction, onProposeSlots }: ThreadProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const shownCount = useRef(-1);
  const [viewer, setViewer] = useState<number | null>(null);
  const now = new Date();
  const days = siteThreadDays(messages, requests, now);
  // Ce qui est là à l'ouverture ne bouge pas ; ce qui arrive ensuite (reçu ou envoyé) apparaît en fondu.
  const known = useRef<Set<string> | null>(null);
  known.current ??= new Set(days.flatMap((day) => day.rows.map((row) => row.item.key)));
  const entries = mediaEntries(messages);
  const offersKey = (offers ?? []).map((offer) => `${offer.id}${offer.status}`).join(',');
  const requestsKey = requests.map((request) => `${request.id}${request.status}`).join(',');

  // À l'ouverture : directement en bas ; à chaque nouveau message (ou carte changée) : en bas, en douceur.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = shownCount.current < 0;
    shownCount.current = messages.length;
    stick.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: first ? 'auto' : 'smooth' });
  }, [messages.length, offersKey, requestsKey]);

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
        {days.length === 0 && (
          <p className="dm-thread-empty">Présentez-vous et posez vos questions sur le bien : votre message part directement au vendeur.</p>
        )}
        {days.map((day) => (
          <section key={day.key} className="dm-day" aria-label={day.label}>
            <p className="dm-day-label">{day.label}</p>
            {day.rows.map((row) => (
              <ThreadRowView
                key={row.item.key}
                row={row}
                fresh={!known.current?.has(row.item.key)}
                conversation={conversation}
                offers={offers}
                me={me}
                onOfferAction={onOfferAction}
                onProposeSlots={onProposeSlots}
                onOpenMedia={openMedia}
              />
            ))}
          </section>
        ))}
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

/** Fil en cours de lecture : quelques bulles grises, reçues à gauche et envoyées à droite. */
export function ThreadSkeleton() {
  const bubbles: { width: string; out?: boolean; tall?: boolean }[] = [
    { width: '42%' }, { width: '28%' }, { width: '50%', out: true, tall: true }, { width: '36%' }, { width: '24%', out: true },
  ];
  return (
    <div className="dm-thread is-skeleton" role="status" aria-label="Chargement des messages">
      <div className="dm-skel-thread" aria-hidden="true">
        {bubbles.map((bubble, index) => (
          <span
            key={index}
            className={`dm-skel dm-skel-bubble${bubble.out ? ' is-out' : ''}${bubble.tall ? ' is-tall' : ''}`}
            style={{ width: bubble.width }}
          />
        ))}
      </div>
    </div>
  );
}

const findOffer = (offers: OfferRow[], id: string) => offers.find((offer) => sameId(offer.id, id)) ?? null;

/** Avatar de 28 px de l'expéditeur, à côté de la dernière bulle reçue d'une série ; sinon un espace de 28 px. */
function SenderAvatar({ conversation, senderId, shown }: { conversation: Conversation; senderId: string | null; shown: boolean }) {
  if (!shown) return <span className="dm-msg-avatar is-empty" aria-hidden="true" />;
  const member = groupSender(conversation, senderId);
  if (!member) return <ConversationAvatar conversation={conversation} size={28} className="dm-msg-avatar" />;
  const profile = profileOf(member.userId);
  const photo = profile ? avatarUrl(member.kind === 'agency' ? profile.agency_logo_path ?? null : profile.avatar_path) : null;
  return (
    <CounterpartAvatar
      counterpart={{ name: member.name, kind: member.kind, imagePath: null }}
      size={28}
      className="dm-msg-avatar"
      photo={photo}
      colorKey={member.userId}
    />
  );
}

function ThreadRowView({ row, fresh, conversation, offers, me, onOfferAction, onProposeSlots, onOpenMedia }: {
  row: SiteThreadRow;
  /** Arrivé après l'ouverture : en fondu. */
  fresh: boolean;
  conversation: Conversation;
  offers: OfferRow[] | null;
  me: string | null;
  onOfferAction: (offer: OfferRow, action: OfferAction) => void;
  onProposeSlots: (request: ConversationVisitRequest) => void;
  onOpenMedia: (attachment: Attachment) => void;
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

  if (content.kind === 'offer') {
    const offer = offers ? findOffer(offers, content.offerId) : null;
    if (!offer && offers === null) return <div className={`dm-msg${outgoing ? ' is-out' : ''}${spacing}`} aria-busy="true" />;
    if (!offer) return <p className={`dm-system is-plain${spacing}`}><span>Offre indisponible</span></p>;
    return (
      <div className={`dm-msg${outgoing ? ' is-out' : ''}${spacing}`}>
        {name}
        <div className="dm-msg-line">
          {avatar}
          <OfferCard
            offer={offer}
            listingPrice={conversation.listing?.price ?? null}
            isMine={outgoing}
            time={<StatusLabel time={message.createdAt} outgoing={outgoing} read={message.isRead} className="dm-card-time" />}
            onAction={(action) => onOfferAction(offer, action)}
          />
        </div>
      </div>
    );
  }

  if (content.kind === 'attachments') {
    // Photos et documents portent l'heure ; vocal, lieu et contact l'ont juste en dessous.
    const statusBelow = content.items.some((item) => item.kind === 'audio' || item.kind === 'location' || item.kind === 'contact');
    return (
      <div className={`dm-msg${outgoing ? ' is-out' : ''}${spacing}`}>
        {name}
        <div className="dm-msg-line">
          {avatar}
          <AttachmentBubble items={content.items} caption={content.caption} outgoing={outgoing} message={message} onOpenMedia={onOpenMedia} />
        </div>
        {statusBelow && <StatusLabel time={message.createdAt} outgoing={outgoing} read={message.isRead} className="dm-msg-status" />}
      </div>
    );
  }

  return (
    <div className={`dm-msg${outgoing ? ' is-out' : ''}${spacing}${message.reaction ? ' has-reaction' : ''}`}>
      {name}
      <div className="dm-msg-line">
        {avatar}
        <Bubble message={message} outgoing={outgoing} />
      </div>
    </div>
  );
}

/** Bulle de texte : appui long (0,35 s) ou bouton cœur pour aimer ; le cœur posé en pastille ; l'heure dedans. */
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
      >
        <span className="dm-text">{keepNumbersTogether(bubbleText(message.content))}</span>
        <Meta time={message.createdAt} outgoing={outgoing} read={message.isRead} />
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

export function OfferCard({ offer, listingPrice, isMine, time, onAction }: {
  offer: OfferRow;
  listingPrice: number | null;
  isMine: boolean;
  /** Heure (et coches) en bas à droite de la carte. */
  time?: ReactNode;
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
        <span className="dm-offer-icon" aria-hidden="true"><Icon name="handshake" /></span>
        <span>{offer.parent_offer_id ? 'Contre-offre' : 'Offre'}</span>
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
      {time}
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
