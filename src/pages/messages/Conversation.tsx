import { useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useStore } from '../../lib/account/session';
import { formatPerMonth, formatPrice } from '../../lib/format';
import { highlightsFor } from '../../lib/highlights';
import { answerOffer, canMakeOffer, offerErrorMessage, offersIn, type OfferAction, type OfferRow } from '../../lib/listing/offers';
import { profitabilityFor } from '../../lib/listing/profitability';
import {
  areValidSlots, dayString, hourLabel, INVALID_SLOTS_MESSAGE, slotStart, SLOT_TIMES, suggestedSlot, visitErrorMessage, type SlotDraft,
} from '../../lib/listing/visits';
import { sortedPhotos } from '../../lib/listings';
import { keepNumbersTogether, lastSeenLabel } from '../../lib/messages/format';
import { groupSummary, sameId, type Conversation, type ListingSnapshot } from '../../lib/messages/inbox';
import { lotsLabel } from '../../lib/messages/listingBar';
import { isOnline } from '../../lib/messages/presence';
import {
  loadOffers, loadVisitRequests, refreshAfterOffer, refreshAfterVisit, unblock, type Loadable, type ThreadState,
} from '../../lib/messages/store';
import { callState, canOpenDetails, visibleMessages } from '../../lib/messages/thread';
import {
  acceptLabel, acceptVisitRequest, answerableRequest, openSlots, proposeVisitSlots, requestsIn, type ConversationVisitRequest,
} from '../../lib/messages/visitRequests';
import { listingPath } from '../../lib/paths';
import { hotelPerformanceOf } from '../listing/data';
import { OfferScreen } from '../listing/OfferScreen';
import { VisitRequestScreen } from '../listing/VisitRequestScreen';
import { BlockDialog, CallDialog, DELETED_ACCOUNT, groupMenuItems, headerMenuItems, ReportSheet } from './actions';
import { Composer, type Suggestion } from './Composer';
import { listingStore, loadListingRow, loadLots, lotsStore } from './listingRow';
import { ActionMenu, ConfirmDialog, ConversationAvatar, Dialog, showIphoneOnly, showNotice } from './parts';
import { navigate, openOnClick, routePath } from './route';
import { Thread, ThreadSkeleton } from './Thread';

// Conversation ouverte, à droite (demande de Romain du 14 novembre 2026) : en-tête blanc de 72 px (avatar, nom, « En
// ligne » ou « Vu il y a … » ; « Proposer une visite », Appeler si le numéro est partagé, « … »), barre de l'annonce,
// messages, puis les réponses rapides selon le contexte et la barre d'écriture. Sur téléphone, une flèche ramène à la
// liste.

type Screen = { kind: 'offer'; parent: OfferRow | null } | { kind: 'visit' };

/** Retour à la liste (téléphone) : la conversation se ferme. */
function BackToList() {
  return (
    <button type="button" className="dm-back" onClick={() => navigate({ conversationId: null })} aria-label="Retour aux conversations" title="Retour aux conversations">
      <Icon name="chevronLeft" />
    </button>
  );
}

export function ConversationPane({ conversation, thread, offers, visitRequests, presence, blocked, me }: {
  conversation: Conversation;
  thread: ThreadState;
  offers: Loadable<OfferRow[]>;
  visitRequests: ConversationVisitRequest[];
  presence: ReadonlyMap<string, ReadonlySet<string>>;
  blocked: Set<string>;
  me: string | null;
}) {
  const [screen, setScreen] = useState<Screen | null>(null);
  const [declined, setDeclined] = useState<OfferRow | null>(null);
  const [confirmation, setConfirmation] = useState<{ offer: OfferRow; action: 'accept' | 'withdraw' } | null>(null);
  const [proposing, setProposing] = useState<ConversationVisitRequest | null>(null);
  const [calling, setCalling] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const now = new Date();
  const messages = visibleMessages(thread.messages, conversation.clearedAt, now);
  const conversationOffers = offers.status === 'ready' || offers.status === 'error' ? offersIn(offers.value, conversation.id) : null;
  const requests = requestsIn(visitRequests, conversation);
  const other = conversation.otherUserId;
  const isBlocked = !conversation.isGroup && !!other && blocked.has(other.toLowerCase());
  const listing = conversation.listing;
  // Fiche du bien lue pour la barre de l'annonce : rendement, formulaire de visite, carte « Rentabilité » de l'offre.
  const rows = useStore(listingStore);
  const listingRow = listing ? rows.get(listing.listingId.toLowerCase()) : undefined;
  useEffect(() => { if (listing) loadListingRow(listing.listingId); }, [listing]);
  const profitability = useMemo(
    () => (listingRow?.status === 'ready' && !hotelPerformanceOf(listingRow.row) ? profitabilityFor(listingRow.row) : null),
    [listingRow],
  );
  const offerPossible = !!listing && canMakeOffer({
    id: conversation.id, isGroup: conversation.isGroup, listingId: listing.listingId, transaction: listing.transaction,
    isSellerSide: conversation.isSellerSide, title: listing.title, price: listing.price,
  }, offers.value, now);
  // « Proposer une visite » : l'acheteur ouvre le formulaire de visite de la fiche ; le vendeur propose un autre créneau
  // pour la demande en cours (seulement quand le serveur le permet).
  const openRequest = [...requests].reverse().find((request) => request.allowedActions.includes('propose')
    && (request.status === 'pending' || request.status === 'counterProposed')) ?? null;
  const visitAction: (() => void) | null = conversation.isGroup || isBlocked || !listing ? null
    : conversation.isSellerSide ? (openRequest ? () => setProposing(openRequest) : null)
      : listingRow?.status === 'ready' && !sameId(listingRow.row.owner_id, me) ? () => setScreen({ kind: 'visit' }) : null;

  // Réponses rapides : après une demande de visite à laquelle on peut répondre, « Oui, samedi 10 h » (accepte ce
  // créneau) et « Proposer un autre créneau » ; dans une conversation sur une annonce, « Envoyer le dossier complet »
  // (choix des documents à envoyer, comme « Documents immobiliers » du « + »).
  const answerable = answerableRequest(requests);
  const acceptSlot = (request: ConversationVisitRequest, slotId: string) => {
    if (accepting) return;
    setAccepting(true);
    void acceptVisitRequest(request.id, slotId)
      .then(() => refreshAfterVisit())
      .catch(async (failure: unknown) => {
        showNotice(visitErrorMessage(failure));
        await refreshAfterVisit();
      })
      .finally(() => setAccepting(false));
  };
  const suggestions: Suggestion[] = [];
  if (answerable && !isBlocked) {
    const slot = answerable.allowedActions.includes('accept') ? openSlots(answerable)[0] : undefined;
    if (slot) {
      suggestions.push({
        key: 'accept', label: acceptLabel(new Date(slot.start), now), icon: 'check', disabled: accepting, onSelect: () => acceptSlot(answerable, slot.id),
      });
    }
    if (answerable.allowedActions.includes('propose')) {
      suggestions.push({ key: 'propose', label: 'Proposer un autre créneau', onSelect: () => setProposing(answerable) });
    }
  }
  if (!conversation.isGroup && listing) suggestions.push({ key: 'dossier', label: 'Envoyer le dossier complet', onSelect: 'documents' });

  const onOfferAction = (offer: OfferRow, action: OfferAction) => {
    if (action === 'counter') setScreen({ kind: 'offer', parent: offer });
    else if (action === 'decline') setDeclined(offer);
    else setConfirmation({ offer, action });
  };

  if (screen?.kind === 'offer' && listing) {
    return (
      <div className="dm-pane dm-pane-screen">
        <div className="dl dm-offer-host">
          <OfferScreen
            conversationId={conversation.id}
            title={listing.title}
            price={listing.price}
            parent={screen.parent ? { id: screen.parent.id, amount: Number(screen.parent.amount) } : null}
            profitability={profitability}
            onClose={() => setScreen(null)}
            onSent={async () => {
              // Comme OfferStore.make : offres puis conversations relues, et la feuille se referme.
              await refreshAfterOffer();
              setScreen(null);
            }}
          />
        </div>
      </div>
    );
  }
  if (screen?.kind === 'visit' && listingRow?.status === 'ready') {
    return (
      <div className="dm-pane dm-pane-screen">
        <div className="dl dm-offer-host">
          <VisitRequestScreen
            row={listingRow.row}
            photo={sortedPhotos(listingRow.row)[0]}
            recipientName={conversation.counterpart.name}
            onClose={() => setScreen(null)}
            onSent={() => void loadVisitRequests()}
          />
        </div>
      </div>
    );
  }

  return (
    <section className="dm-pane" aria-label={`Conversation avec ${conversation.counterpart.name}`}>
      <div className="dm-pane-top">
        {conversation.isGroup ? (
          <GroupHeader conversation={conversation} me={me} onReport={() => setReporting(true)} />
        ) : (
          <DirectHeader
            conversation={conversation}
            online={isOnline(presence, conversation.id, other)}
            isBlocked={isBlocked}
            onVisit={visitAction}
            onCall={() => {
              const state = callState(conversation.counterpart.name, conversation.counterpart.phone);
              if (state.enabled) setCalling(true);
              else showNotice(state.message);
            }}
            onBlock={() => setBlocking(true)}
            onReport={() => setReporting(true)}
          />
        )}
        {listing && <ListingBanner listing={listing} />}
      </div>

      {thread.status === 'error' ? (
        <div className="dm-thread dm-thread-state" role="alert">
          <p>Impossible de charger les messages. Réessayez dans un instant.</p>
        </div>
      ) : thread.status !== 'ready' || !sameId(thread.conversationId, conversation.id) ? (
        <ThreadSkeleton />
      ) : (
        <Thread
          conversation={conversation}
          messages={messages}
          offers={conversationOffers}
          requests={requests}
          me={me}
          onOfferAction={onOfferAction}
          onProposeSlots={setProposing}
        />
      )}

      <BottomBar
        conversation={conversation}
        isBlocked={isBlocked}
        messages={thread.status === 'ready' && sameId(thread.conversationId, conversation.id) ? thread.messages : null}
        suggestions={suggestions}
        onMakeOffer={offerPossible ? () => setScreen({ kind: 'offer', parent: null }) : null}
      />

      <CallDialog open={calling} name={conversation.counterpart.name} phone={conversation.counterpart.phone} onClose={() => setCalling(false)} />
      <BlockDialog open={blocking} userId={other} onClose={() => setBlocking(false)} />
      <ReportSheet
        open={reporting}
        title={conversation.isGroup ? 'Signaler le groupe' : 'Signaler la conversation'}
        conversationId={conversation.id}
        onClose={() => setReporting(false)}
      />
      <OfferConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
      <DeclineOfferDialog offer={declined} onClose={() => setDeclined(null)} />
      <ProposeSlotsDialog request={proposing} onClose={() => setProposing(null)} />
    </section>
  );
}

// MARK: - En-têtes

/** « En ligne » (point vert) quand l'autre personne a la page Messages ouverte ; sinon « Vu il y a … ». */
function StatusLine({ conversation, online }: { conversation: Conversation; online: boolean }) {
  if (online) {
    return <span className="dm-head-sub"><span className="dm-online-dot" aria-hidden="true" /><span>En ligne</span></span>;
  }
  const seen = conversation.otherLastReadAt;
  return <span className="dm-head-sub"><span>{seen ? lastSeenLabel(seen) : conversation.counterpart.subtitle}</span></span>;
}

function DirectHeader({ conversation, online, isBlocked, onVisit, onCall, onBlock, onReport }: {
  conversation: Conversation;
  online: boolean;
  isBlocked: boolean;
  onVisit: (() => void) | null;
  onCall: () => void;
  onBlock: () => void;
  onReport: () => void;
}) {
  const counterpart = conversation.counterpart;
  const hasPhone = !!counterpart.phone?.trim();
  const who = (
    <>
      <ConversationAvatar conversation={conversation} size={44} />
      <span className="dm-head-text">
        <span className="dm-head-name"><span className="dm-head-title">{counterpart.name}</span></span>
        <StatusLine conversation={conversation} online={online} />
      </span>
    </>
  );
  return (
    <header className="dm-head">
      <BackToList />
      {canOpenDetails(conversation) ? (
        <a
          className="dm-head-who"
          href={routePath({ conversationId: conversation.id, view: 'details' })}
          onClick={openOnClick(conversation.id, { view: 'details' })}
          title="Ouvre les détails de la conversation"
        >
          {who}
        </a>
      ) : <div className="dm-head-who">{who}</div>}
      <div className="dm-head-tools">
        {onVisit && (
          <button type="button" className="dm-outline" onClick={onVisit} aria-label="Proposer une visite" title="Proposer une visite">
            <Icon name="calendar" />
            <span className="dm-outline-label">Proposer une visite</span>
          </button>
        )}
        {hasPhone && (
          <button type="button" className="dm-round" onClick={onCall} aria-label="Appeler" title="Appeler">
            <Icon name="phone" />
          </button>
        )}
        <ActionMenu label="Plus d'options" className="dm-round" items={headerMenuItems({ conversation, isBlocked, onBlock, onReport })}>
          <Icon name="ellipsis" />
        </ActionMenu>
      </div>
    </header>
  );
}

/** En-tête d'un groupe : photo ou avatar, nom et membres ; pas de téléphone. Ses infos sont dans l'app iPhone. */
function GroupHeader({ conversation, me, onReport }: { conversation: Conversation; me: string | null; onReport: () => void }) {
  const info = conversation.communityId ? 'Communauté' : 'Infos du groupe';
  const role = conversation.members.find((member) => sameId(member.userId, me))?.role ?? null;
  const manages = !conversation.hasLeft && role !== null && role !== 'member';
  return (
    <header className="dm-head">
      <BackToList />
      <button type="button" className="dm-head-who" onClick={() => showIphoneOnly(info)} aria-label={info}>
        <ConversationAvatar conversation={conversation} size={44} />
        <span className="dm-head-text">
          <span className="dm-head-name"><span className="dm-head-title">{conversation.counterpart.name}</span></span>
          <span className="dm-head-sub"><span>{conversation.hasLeft ? 'Vous avez quitté le groupe' : groupSummary(conversation.members)}</span></span>
        </span>
      </button>
      <div className="dm-head-tools">
        {manages && (
          <button type="button" className="dm-round" onClick={() => showIphoneOnly(conversation.communityId ? info : 'Ajouter des membres')} aria-label="Ajouter des membres" title="Ajouter des membres">
            <Icon name="userPlus" />
          </button>
        )}
        <ActionMenu label="Plus d'options" className="dm-round" items={groupMenuItems({ conversation, onReport })}>
          <Icon name="ellipsis" />
        </ActionMenu>
      </div>
    </header>
  );
}

// MARK: - Barre de l'annonce

/**
 * Photo de 52 px, titre, « Ville · prix · rendement brut · nombre de lots » (rendement en vert, seulement pour une vente
 * qui a sa carte « Rentabilité » ; lots à partir de deux), et « Voir l'annonce › » quand la fiche a pu être lue.
 */
function ListingBanner({ listing }: { listing: ListingSnapshot }) {
  const rows = useStore(listingStore);
  const lots = useStore(lotsStore);
  const state = rows.get(listing.listingId.toLowerCase());
  const lotState = lots.get(listing.listingId.toLowerCase());
  useEffect(() => { loadLots(listing.listingId); }, [listing.listingId]);
  const opens = state?.status === 'ready';
  const price = listing.transaction === 'rent' ? formatPerMonth(listing.price) : formatPrice(listing.price);
  const grossYield = useMemo(() => {
    if (state?.status !== 'ready' || hotelPerformanceOf(state.row) || !profitabilityFor(state.row)) return null;
    return highlightsFor(state.row, null)?.text?.grossYield ?? null;
  }, [state]);
  const lotText = lotState?.status === 'ready' ? lotsLabel(lotState.statuses) : null;
  const body = (
    <>
      <span className="dm-banner-photo">{listing.coverUrl ? <img src={listing.coverUrl} alt="" /> : <Icon name="image" />}</span>
      <span className="dm-banner-text">
        <span className="dm-banner-title">{listing.title}</span>
        <span className="dm-banner-line">
          {keepNumbersTogether([listing.city, price].filter(Boolean).join(' · '))}
          {grossYield && <> · <span className="dm-banner-yield">{keepNumbersTogether(`${grossYield} brut`)}</span></>}
          {lotText && ` · ${lotText}`}
        </span>
      </span>
      {opens && <span className="dm-banner-link"><span className="dm-banner-link-label">Voir l'annonce</span><Icon name="chevronRight" /></span>}
    </>
  );
  return opens ? (
    <a className="dm-banner" href={listingPath(listing.listingId)} title="Ouvre l'annonce">{body}</a>
  ) : <div className="dm-banner">{body}</div>;
}

// MARK: - Bas de la conversation

function BottomBar({ conversation, isBlocked, messages, suggestions, onMakeOffer }: {
  conversation: Conversation;
  isBlocked: boolean;
  messages: Parameters<typeof Composer>[0]['messages'];
  suggestions: Suggestion[];
  onMakeOffer: (() => void) | null;
}) {
  if (isBlocked && conversation.otherUserId) {
    const other = conversation.otherUserId;
    return (
      <div className="dm-bottom-line">
        <span>Vous avez bloqué ce compte</span>
        <button type="button" className="dm-link-button" onClick={() => void unblock(other)}>Débloquer</button>
      </div>
    );
  }
  if (!conversation.isGroup && conversation.counterpart.name === DELETED_ACCOUNT) {
    return <div className="dm-bottom-line"><span>Compte supprimé : cette conversation est en lecture seule.</span></div>;
  }
  if (conversation.hasLeft) return <div className="dm-bottom-line"><span>Vous avez quitté le groupe</span></div>;
  return (
    <div className="dm-bottom">
      <Composer key={conversation.id} conversation={conversation} messages={messages} suggestions={suggestions} onMakeOffer={onMakeOffer} />
    </div>
  );
}

// MARK: - Autre créneau

/** « Autre créneau » : un à trois créneaux d'une heure, envoyés par propose_visit_slots (comme l'app). */
function ProposeSlotsDialog({ request, onClose }: { request: ConversationVisitRequest | null; onClose: () => void }) {
  const id = useId();
  return (
    <Dialog open={request !== null} onClose={onClose} className="alert-dialog dm-dialog dm-decline" labelledBy={`${id}-titre`}>
      {request && <ProposeSlotsForm key={request.id} id={id} request={request} onClose={onClose} />}
    </Dialog>
  );
}

function ProposeSlotsForm({ id, request, onClose }: { id: string; request: ConversationVisitRequest; onClose: () => void }) {
  const [drafts, setDrafts] = useState<SlotDraft[]>(() => [suggestedSlot(new Date())]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = dayString(new Date());
  const change = (index: number, draft: SlotDraft) => setDrafts((current) => current.map((item, at) => (at === index ? draft : item)));
  return (
    <form
      className="alert-body dm-decline-body"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        const starts = drafts.map(slotStart);
        if (starts.some((start) => start === null) || !areValidSlots(starts.map((start) => ({ start: start as Date, durationMinutes: 60 })), new Date())) {
          setError(INVALID_SLOTS_MESSAGE);
          return;
        }
        setBusy(true);
        setError(null);
        void proposeVisitSlots(request.id, starts as Date[])
          .then(async () => {
            await refreshAfterVisit();
            onClose();
          })
          .catch((failure: unknown) => setError(visitErrorMessage(failure)))
          .finally(() => setBusy(false));
      }}
    >
      <h2 id={`${id}-titre`}>Proposer un autre créneau</h2>
      <p className="dm-sheet-note">{request.listingTitle} · chaque créneau dure environ une heure.</p>
      <div className="dm-slots">
        {drafts.map((draft, index) => (
          <div key={index} className="dm-slot-row">
            <input
              type="date"
              min={today}
              value={draft.day}
              aria-label={`Jour du créneau ${index + 1}`}
              onChange={(event) => change(index, { ...draft, day: event.currentTarget.value })}
            />
            <select
              value={draft.minutes}
              aria-label={`Heure du créneau ${index + 1}`}
              onChange={(event) => change(index, { ...draft, minutes: Number(event.currentTarget.value) })}
            >
              {SLOT_TIMES.map((minutes) => <option key={minutes} value={minutes}>{hourLabel(minutes)}</option>)}
            </select>
          </div>
        ))}
      </div>
      {drafts.length < 3 && (
        <button
          type="button"
          className="dm-link-button"
          onClick={() => setDrafts((current) => [...current, suggestedSlot(new Date(), current.length ? slotStart(current[current.length - 1]!) : null)])}
        >
          Ajouter un créneau
        </button>
      )}
      {error && <p className="dm-error" role="alert">{error}</p>}
      <div className="dm-decline-actions">
        <button type="button" className="btn btn-light" onClick={onClose}>Annuler</button>
        <button type="submit" className="btn btn-primary" aria-busy={busy} disabled={busy}>Envoyer</button>
      </div>
    </form>
  );
}

// MARK: - Réponses aux offres

const priceOf = (offer: OfferRow) => formatPrice(Number(offer.amount));

/** Résultat d'une réponse : offres puis conversations relues ; un refus relit les offres et rend le message. */
async function answer(offer: OfferRow, action: 'accept' | 'decline' | 'withdraw', reason: string | null = null): Promise<string | null> {
  try {
    await answerOffer(offer.id, action, reason);
    await refreshAfterOffer();
    return null;
  } catch (error) {
    await loadOffers();
    return offerErrorMessage(error);
  }
}

/** Accepter ou retirer : confirmation d'abord (OfferConfirmation). */
function OfferConfirmDialog({ confirmation, onClose }: { confirmation: { offer: OfferRow; action: 'accept' | 'withdraw' } | null; onClose: () => void }) {
  const accept = confirmation?.action === 'accept';
  const amount = confirmation ? priceOf(confirmation.offer) : '';
  return (
    <ConfirmDialog
      open={confirmation !== null}
      title={accept ? `Accepter l'offre de ${amount} ?` : `Retirer votre offre de ${amount} ?`}
      message={accept
        ? 'L\'accord n\'est pas encore définitif : il se formalise ensuite par écrit (offre signée, puis compromis chez le notaire).'
        : 'Elle ne pourra plus être acceptée. Vous pourrez en faire une nouvelle.'}
      confirm={accept ? 'Accepter' : 'Retirer'}
      destructive={!accept}
      onConfirm={() => {
        if (!confirmation) return;
        void answer(confirmation.offer, confirmation.action).then((failure) => { if (failure) showNotice(failure); });
      }}
      onClose={onClose}
    />
  );
}

/** Refus d'une offre, motif facultatif (DeclineOfferSheet). */
function DeclineOfferDialog({ offer, onClose }: { offer: OfferRow | null; onClose: () => void }) {
  const id = useId();
  return (
    <Dialog open={offer !== null} onClose={onClose} className="alert-dialog dm-dialog dm-decline" labelledBy={`${id}-titre`}>
      {offer && <DeclineForm id={id} offer={offer} onClose={onClose} />}
    </Dialog>
  );
}

function DeclineForm({ id, offer, onClose }: { id: string; offer: OfferRow; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="alert-body dm-decline-body"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        void answer(offer, 'decline', reason).then((failure) => {
          setBusy(false);
          if (failure) setError(failure);
          else onClose();
        });
      }}
    >
      <h2 id={`${id}-titre`}>Refuser l'offre de {priceOf(offer)} ?</h2>
      <textarea className="dm-textarea" rows={2} value={reason} onChange={(event) => setReason(event.currentTarget.value)} placeholder="Motif (facultatif)" aria-label="Motif (facultatif)" />
      {error && <p className="dm-error" role="alert">{error}</p>}
      <div className="dm-decline-actions">
        <button type="button" className="btn btn-light" onClick={onClose}>Annuler</button>
        <button type="submit" className="btn dm-btn-danger" aria-busy={busy}>Refuser</button>
      </div>
    </form>
  );
}

/** Conversation demandée par l'adresse mais absente de la boîte (supprimée, ou d'un autre compte). */
export function MissingConversation() {
  return (
    <div className="dm-pane dm-pane-empty">
      <button type="button" className="dm-link-button dm-back-link" onClick={() => navigate({ conversationId: null })}>Retour aux conversations</button>
      <Icon name="messages" />
      <h2>Conversation introuvable</h2>
      <p>Elle n'existe plus, ou elle appartient à un autre compte.</p>
    </div>
  );
}

/** Conversation de l'adresse pendant la lecture de la liste : un en-tête et un fil en gris. */
export function PaneSkeleton() {
  return (
    <div className="dm-pane">
      <div className="dm-skel-head" aria-hidden="true">
        <span className="dm-skel dm-skel-avatar" />
        <span className="dm-skel-lines">
          <span className="dm-skel dm-skel-line" style={{ width: '70%' }} />
          <span className="dm-skel dm-skel-line is-thin" style={{ width: '45%' }} />
        </span>
      </div>
      <ThreadSkeleton />
    </div>
  );
}

/** Rien n'est ouvert : la page n'ouvre jamais une conversation d'elle-même. */
export function NoConversation() {
  return (
    <div className="dm-pane dm-pane-empty">
      <h2>Sélectionnez une conversation</h2>
    </div>
  );
}
