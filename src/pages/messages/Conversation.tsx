import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { LoadErrorState, OfflineState } from '../../components/OfflineState';
import { useStore } from '../../lib/account/session';
import { useDesktop } from '../../lib/desktop';
import { formatArea, formatPrice } from '../../lib/format';
import { answerOffer, canMakeOffer, offerErrorMessage, offersIn, type OfferAction, type OfferRow } from '../../lib/listing/offers';
import { profitabilityFor } from '../../lib/listing/profitability';
import {
  areValidSlots, dayString, INVALID_SLOTS_MESSAGE, slotHourLabel, slotStart, SLOT_TIMES, suggestedSlot, visitErrorMessage, type SlotDraft,
} from '../../lib/listing/visits';
import type { Message } from '../../lib/messages/api';
import { keepNumbersTogether } from '../../lib/messages/format';
import { groupSummary, isDeletedAccount, sameId, type Conversation, type ListingSnapshot } from '../../lib/messages/inbox';
import { isOnline } from '../../lib/messages/presence';
import {
  loadOffers, loadOlderMessages, refreshAfterOffer, refreshAfterVisit, reloadThread, unblock, type Loadable, type ThreadState,
} from '../../lib/messages/store';
import { callState, canOpenDetails, visibleMessages } from '../../lib/messages/thread';
import {
  acceptLabel, acceptVisitRequest, answerableRequest, openSlots, proposeVisitSlots, requestsIn, type ConversationVisitRequest,
} from '../../lib/messages/visitRequests';
import { listingPath } from '../../lib/paths';
import { hotelPerformanceOf } from '../listing/data';
import { OfferScreen } from '../listing/OfferScreen';
import { BlockDialog, CallDialog, directMenuItems, groupMenuItems, ReportSheet } from './actions';
import { Composer, type Suggestion } from './Composer';
import { ForwardSheet } from './MessageInteractions';
import { listingStore, loadListingRow } from './listingRow';
import { AddGroupMembersSheet } from './GroupInfo';
import { ActionMenu, ConfirmDialog, ConversationAvatar, PlainSheet, PublisherBadge, Sheet, showNotice } from './parts';
import { navigate, openOnClick, routePath } from './route';
import { Thread, ThreadLoading } from './Thread';

// Conversation ouverte, comme l'app (ConversationView.swift) : une ligne blanche qui s'efface vers le bas, avec le
// retour rond, l'avatar de 38 (point vert « en ligne »), le nom et sa pastille PRO ou Particulier, « En ligne » en vert
// ou le sous-titre, puis la capsule Appeler | « … » (le téléphone reste, en gris sans numéro partagé) ; la carte de
// l'annonce flotte dessous (photo de 40, « Lyon 2e · 62 m² », prix et « Voir › »). Puis les messages, les réponses
// proposées selon le contexte et la barre d'écriture. Le même écran à toutes les largeurs : la demande de visite passe
// par « Détails » et la fiche, comme dans l'app. À partir de 1024 px (messages-ordinateur.css), à côté de la liste :
// pas de flèche retour, avatar de 46, « Voir l'annonce », et « Faire une offre » titré en h2 (le h1 est « Messages »).

type Screen = { kind: 'offer'; parent: OfferRow | null };

/** Retour à la liste : rond « en verre » de 40, la conversation se ferme. */
function BackToList() {
  return (
    <button type="button" className="dm-back" onClick={() => navigate({ conversationId: null })} aria-label="Retour" title="Retour">
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
  const desktop = useDesktop();
  const [declined, setDeclined] = useState<OfferRow | null>(null);
  const [confirmation, setConfirmation] = useState<{ offer: OfferRow; action: 'accept' | 'withdraw' } | null>(null);
  const [proposing, setProposing] = useState<ConversationVisitRequest | null>(null);
  const [calling, setCalling] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  // Réponse en cours (au-dessus du champ) et message à transférer (demande du 17/11).
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const now = new Date();
  const messages = visibleMessages(thread.messages, conversation.clearedAt, now);
  const conversationOffers = offers.status === 'ready' || offers.status === 'error' ? offersIn(offers.value, conversation.id) : null;
  const requests = requestsIn(visitRequests, conversation);
  const other = conversation.otherUserId;
  const isBlocked = !conversation.isGroup && !!other && blocked.has(other.toLowerCase());
  const canWrite = !isBlocked && !conversation.hasLeft && !isDeletedAccount(conversation);
  const listing = conversation.listing;
  // Fiche du bien lue pour la carte de l'annonce (surface, « Voir ») et pour la carte « Rentabilité » de l'offre.
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
            heading={desktop ? 'h2' : 'h1'}
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
        <div className="dm-thread dm-thread-state">
          {thread.offline ? <OfflineState onRetry={reloadThread} />
            : <LoadErrorState title="Erreur" message="Impossible de charger les messages. Réessayez dans un instant." onRetry={reloadThread} />}
        </div>
      ) : thread.status !== 'ready' || !sameId(thread.conversationId, conversation.id) ? (
        <ThreadLoading />
      ) : (
        <Thread
          conversation={conversation}
          messages={messages}
          offers={conversationOffers}
          requests={requests}
          me={me}
          canWrite={canWrite}
          hasOlder={!thread.complete}
          onLoadOlder={() => loadOlderMessages(conversation.id)}
          onOfferAction={onOfferAction}
          onProposeSlots={setProposing}
          onReply={setReplyingTo}
          onForward={setForwarding}
        />
      )}

      <BottomBar
        conversation={conversation}
        isBlocked={isBlocked}
        messages={thread.status === 'ready' && sameId(thread.conversationId, conversation.id) ? thread.messages : null}
        suggestions={suggestions}
        onMakeOffer={offerPossible ? () => setScreen({ kind: 'offer', parent: null }) : null}
        replyingTo={canWrite ? replyingTo : null}
        onReplyChange={setReplyingTo}
        me={me}
      />
      <ForwardSheet message={forwarding} originId={conversation.id} me={me} onClose={() => setForwarding(null)} />

      <CallDialog open={calling} name={conversation.counterpart.name} phone={conversation.counterpart.phone} onClose={() => setCalling(false)} />
      <BlockDialog open={blocking} userId={other} onClose={() => setBlocking(false)} />
      <ReportSheet
        open={reporting}
        title={!conversation.isGroup ? 'Signaler la conversation' : conversation.communityId ? 'Signaler la communauté' : 'Signaler le groupe'}
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

/**
 * Sous le nom (ConversationView.header) : « En ligne » en vert demi-gras quand l'autre personne a la page Messages
 * ouverte, sinon le sous-titre de la conversation (le bien, ou le rôle) en gris clair.
 */
function StatusLine({ conversation, online }: { conversation: Conversation; online: boolean }) {
  if (online) return <span className="dm-head-sub is-online"><span>En ligne</span></span>;
  return <span className="dm-head-sub"><span>{conversation.counterpart.subtitle}</span></span>;
}

/**
 * Capsule « en verre » de l'en-tête : Appeler (bleu ; en gris sans numéro partagé, et l'avis le dit au clic), un trait,
 * puis « … ».
 */
function HeaderCapsule({ hasPhone, onCall, children }: { hasPhone: boolean; onCall: () => void; children: ReactNode }) {
  return (
    <div className="dm-capsule">
      <button
        type="button"
        className={`dm-capsule-button${hasPhone ? ' is-call' : ' is-off'}`}
        onClick={onCall}
        aria-label={hasPhone ? 'Appeler' : 'Appeler, numéro non partagé'}
        title={hasPhone ? 'Appeler' : 'Appeler, numéro non partagé'}
      >
        <Icon name="phone" />
      </button>
      <span className="dm-capsule-line" aria-hidden="true" />
      {children}
    </div>
  );
}

function DirectHeader({ conversation, online, isBlocked, onCall, onBlock, onReport }: {
  conversation: Conversation;
  online: boolean;
  isBlocked: boolean;
  onCall: () => void;
  onBlock: () => void;
  onReport: () => void;
}) {
  const counterpart = conversation.counterpart;
  const hasPhone = !!counterpart.phone?.trim();
  const desktop = useDesktop();
  const who = (
    <>
      <ConversationAvatar conversation={conversation} size={desktop ? 46 : 38} fontSize={desktop ? 15 : 13} online={online} />
      <span className="dm-head-text">
        <span className="dm-head-name">
          <span className="dm-head-title">{counterpart.name}</span>
          {!isDeletedAccount(conversation) && <PublisherBadge kind={counterpart.kind} compact />}
        </span>
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
          aria-description="Ouvre les détails de la conversation"
          title="Ouvre les détails de la conversation"
        >
          {who}
        </a>
      ) : <div className="dm-head-who">{who}</div>}
      <div className="dm-head-tools">
        <HeaderCapsule hasPhone={hasPhone} onCall={onCall}>
          <ActionMenu label="Plus d'options" className="dm-capsule-button" items={directMenuItems({ conversation, isBlocked, onBlock, onReport })}>
            <Icon name="ellipsis" />
          </ActionMenu>
        </HeaderCapsule>
      </div>
    </header>
  );
}

/**
 * En-tête d'un groupe (groupHeader) : retour, photo ou avatar de 36, nom et membres ; pas de téléphone. Un clic ouvre
 * « Infos du groupe », ou la page de la communauté pour sa discussion principale ; « Ajouter des membres » (créateur
 * et administrateurs) ouvre sa feuille, ou la page de la communauté ; puis ⋮.
 */
function GroupHeader({ conversation, me, onReport }: { conversation: Conversation; me: string | null; onReport: () => void }) {
  const [adding, setAdding] = useState(false);
  const info = conversation.communityId ? 'Communauté' : 'Infos du groupe';
  const role = conversation.members.find((member) => sameId(member.userId, me))?.role ?? null;
  const manages = !conversation.hasLeft && role !== null && role !== 'member';
  const openInfo = () => navigate({ conversationId: conversation.id, view: conversation.communityId ? 'communaute' : 'groupe' });
  const count = conversation.members.length;
  const desktop = useDesktop();
  return (
    <header className="dm-head is-group">
      <BackToList />
      <button
        type="button"
        className="dm-head-who"
        onClick={openInfo}
        aria-label={info}
        aria-description={`${conversation.counterpart.name}, ${count} ${count > 1 ? 'membres' : 'membre'}`}
      >
        <ConversationAvatar conversation={conversation} size={desktop ? 46 : 36} fontSize={desktop ? 15 : 12.5} />
        <span className="dm-head-text">
          <span className="dm-head-name"><span className="dm-head-title">{conversation.counterpart.name}</span></span>
          <span className="dm-head-sub"><span>{conversation.hasLeft ? 'Vous avez quitté le groupe' : groupSummary(conversation.members)}</span></span>
        </span>
      </button>
      <div className="dm-head-tools">
        {manages && (
          <button
            type="button"
            className="dm-round dm-head-add"
            onClick={() => (conversation.communityId ? openInfo() : setAdding(true))}
            aria-label="Ajouter des membres"
            title="Ajouter des membres"
          >
            <Icon name="userPlus" />
          </button>
        )}
        <ActionMenu label="Plus d'options" className="dm-round dm-head-more" items={groupMenuItems({ conversation, onReport })}>
          <Icon name="ellipsisVertical" />
        </ActionMenu>
      </div>
      {!conversation.communityId && <AddGroupMembersSheet open={adding} conversation={conversation} onClose={() => setAdding(false)} />}
    </header>
  );
}

// MARK: - Carte de l'annonce

/**
 * Carte flottante de l'annonce (ConversationView.banner) : photo de 40, titre, « Lyon 2e · 62 m² », à droite le prix
 * (« /mois » pour une location) et « Voir › » quand la fiche a pu être lue ; elle ouvre l'annonce.
 */
function ListingBanner({ listing }: { listing: ListingSnapshot }) {
  const rows = useStore(listingStore);
  const desktop = useDesktop();
  const state = rows.get(listing.listingId.toLowerCase());
  const opens = state?.status === 'ready';
  const price = `${formatPrice(listing.price)}${listing.transaction === 'rent' ? '/mois' : ''}`;
  const area = state?.status === 'ready' && state.row.living_area > 0 ? formatArea(state.row.living_area) : null;
  const body = (
    <>
      <span className="dm-banner-photo">{listing.coverUrl ? <img src={listing.coverUrl} alt="" /> : <Icon name="image" />}</span>
      <span className="dm-banner-text">
        <span className="dm-banner-title">{listing.title}</span>
        <span className="dm-banner-line">{keepNumbersTogether([listing.city, area].filter(Boolean).join(' · '))}</span>
      </span>
      <span className="dm-banner-end">
        <span className="dm-banner-price">{keepNumbersTogether(price)}</span>
        {opens && <span className="dm-banner-link"><span>{desktop ? 'Voir l’annonce' : 'Voir'}</span><Icon name="chevronRight" /></span>}
      </span>
    </>
  );
  return (
    <div className="dm-banner-wrap">
      {opens ? (
        <a className="dm-banner" href={listingPath(listing.listingId)} aria-description="Ouvre l'annonce" title="Ouvre l'annonce">{body}</a>
      ) : <div className="dm-banner">{body}</div>}
    </div>
  );
}

// MARK: - Bas de la conversation

function BottomBar({ conversation, isBlocked, messages, suggestions, onMakeOffer, replyingTo, onReplyChange, me }: {
  conversation: Conversation;
  isBlocked: boolean;
  messages: Parameters<typeof Composer>[0]['messages'];
  suggestions: Suggestion[];
  onMakeOffer: (() => void) | null;
  replyingTo: Message | null;
  onReplyChange: (message: Message | null) => void;
  me: string | null;
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
  if (isDeletedAccount(conversation)) {
    return <div className="dm-bottom-line"><span>Compte supprimé : cette conversation est en lecture seule.</span></div>;
  }
  if (conversation.hasLeft) return <div className="dm-bottom-line"><span>Vous avez quitté le groupe</span></div>;
  return (
    <div className="dm-bottom">
      <Composer
        key={conversation.id}
        conversation={conversation}
        messages={messages}
        suggestions={suggestions}
        onMakeOffer={onMakeOffer}
        replyingTo={replyingTo}
        onReplyChange={onReplyChange}
        me={me}
      />
    </div>
  );
}

// MARK: - Autre créneau

/**
 * « Proposer d'autres créneaux » (ProposeSlotsSheet de l'app) : feuille avec la carte « Créneaux » (premier, deuxième,
 * troisième choix, d'une heure chacun), « Ajouter un créneau » et « Retirer le dernier », puis « Envoyer la
 * proposition » en bas ; propose_visit_slots, comme l'app.
 */
function ProposeSlotsDialog({ request, onClose }: { request: ConversationVisitRequest | null; onClose: () => void }) {
  const title = request?.status === 'accepted' ? 'Proposer un autre créneau' : 'Proposer d\'autres créneaux';
  return (
    <Sheet open={request !== null} title={title} onClose={onClose} className="dm-slots-sheet">
      {request && <ProposeSlotsForm key={request.id} request={request} onClose={onClose} />}
    </Sheet>
  );
}

const CHOICE_TITLES = ['Premier choix', 'Deuxième choix', 'Troisième choix'];

function ProposeSlotsForm({ request, onClose }: { request: ConversationVisitRequest; onClose: () => void }) {
  const [drafts, setDrafts] = useState<SlotDraft[]>(() => [suggestedSlot(new Date())]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = dayString(new Date());
  const change = (index: number, draft: SlotDraft) => setDrafts((current) => current.map((item, at) => (at === index ? draft : item)));
  return (
    <form
      className="dm-sheet-form"
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
      <div className="dm-sheet-content">
        <p className="dm-sheet-note">{request.listingTitle} · chaque créneau dure environ une heure.</p>
        <section className="dm-card dm-slots-card" aria-labelledby="dm-creneaux">
          <h3 id="dm-creneaux" className="dm-card-title"><Icon name="calendar" />Créneaux</h3>
          {drafts.map((draft, index) => (
            <div key={index} className="dm-slot-row">
              <span className="dm-slot-title">{CHOICE_TITLES[index]}</span>
              <span className="dm-slot-fields">
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
                  {SLOT_TIMES.map((minutes) => <option key={minutes} value={minutes}>{slotHourLabel(minutes)}</option>)}
                </select>
              </span>
            </div>
          ))}
          <div className="dm-slot-links">
            {drafts.length < 3 && (
              <button
                type="button"
                className="dm-link-button"
                onClick={() => setDrafts((current) => [...current, suggestedSlot(new Date(), current.length ? slotStart(current[current.length - 1]!) : null)])}
              >
                Ajouter un créneau
              </button>
            )}
            {drafts.length > 1 && (
              <button type="button" className="dm-link-button" onClick={() => setDrafts((current) => current.slice(0, -1))}>Retirer le dernier</button>
            )}
          </div>
        </section>
        {error && <p className="dm-error" role="alert"><Icon name="triangleAlert" />{error}</p>}
      </div>
      <div className="dm-sheet-foot">
        <button type="submit" className="btn btn-primary" aria-busy={busy} disabled={busy}>Envoyer la proposition</button>
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

/**
 * Refus d'une offre, motif facultatif (DeclineOfferSheet) : petite feuille du bas (poignée, glisser pour fermer), le
 * titre de 19, le motif sur 2 à 4 lignes, puis « Annuler » (bleu pâle) et « Refuser » (rouge) côte à côte.
 */
function DeclineOfferDialog({ offer, onClose }: { offer: OfferRow | null; onClose: () => void }) {
  const id = useId();
  return (
    <PlainSheet open={offer !== null} onClose={onClose} className="dm-decline" labelledBy={`${id}-titre`}>
      {offer && <DeclineForm id={id} offer={offer} onClose={onClose} />}
    </PlainSheet>
  );
}

function DeclineForm({ id, offer, onClose }: { id: string; offer: OfferRow; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="dm-decline-body"
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
      <h2 id={`${id}-titre`}>Refuser l'offre de {keepNumbersTogether(priceOf(offer))} ?</h2>
      <textarea className="dm-textarea" rows={2} value={reason} onChange={(event) => setReason(event.currentTarget.value)} placeholder="Motif (facultatif)" aria-label="Motif (facultatif)" />
      {error && <p className="dm-error" role="alert">{error}</p>}
      <div className="dm-decline-actions">
        <button type="button" className="btn btn-light" onClick={onClose}>Annuler</button>
        <button type="submit" className="btn btn-danger" aria-busy={busy}>Refuser</button>
      </div>
    </form>
  );
}

/**
 * Conversation demandée par l'adresse mais absente de la boîte (supprimée, ou d'un autre compte) : comme l'app (n° 96),
 * seulement la flèche de retour en haut et « Conversation introuvable » en bas.
 */
export function MissingConversation() {
  return (
    <section className="dm-pane dm-pane-missing" aria-label="Conversation introuvable">
      <div className="dm-missing-top"><BackToList /></div>
      <div className="dm-thread" />
      <div className="dm-bottom-line"><span>Conversation introuvable</span></div>
    </section>
  );
}

/** Conversation de l'adresse pendant la lecture de la liste : la roue de l'app (ProgressView), 40 px sous le haut. */
export function PaneSkeleton() {
  return (
    <div className="dm-pane">
      <div className="dm-missing-top"><BackToList /></div>
      <ThreadLoading />
    </div>
  );
}
