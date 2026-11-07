import { useEffect, useId, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useStore } from '../../lib/account/session';
import { formatPerMonth, formatPrice } from '../../lib/format';
import { answerOffer, canMakeOffer, offerErrorMessage, offersIn, type OfferAction, type OfferRow } from '../../lib/listing/offers';
import { upcomingVisits, type ConversationVisit, type Message } from '../../lib/messages/api';
import { groupSummary, sameId, type Conversation, type ListingSnapshot } from '../../lib/messages/inbox';
import { loadOffers, refreshAfterOffer, unblock, type Loadable, type ThreadState } from '../../lib/messages/store';
import { bannerLocation, callState, canOpenDetails, visibleMessages } from '../../lib/messages/thread';
import { listingPath } from '../../lib/paths';
import { OfferScreen } from '../listing/OfferScreen';
import { BlockDialog, CallDialog, DELETED_ACCOUNT, directMenuItems, groupMenuItems, ReportSheet } from './actions';
import { Composer } from './Composer';
import { listingStore, loadListingRow } from './listingRow';
import { ActionMenu, ConfirmDialog, CounterpartAvatar, Dialog, PublisherBadge, showIphoneOnly, showNotice } from './parts';
import { openOnClick, routePath } from './route';
import { Thread } from './Thread';

// Conversation ouverte, à droite (ConversationView.swift) : en-tête (à deux ou de groupe), bandeau du bien, messages,
// puis la barre d'écriture, ou la ligne qui la remplace (compte bloqué, compte supprimé, groupe quitté). Les offres
// se font et se répondent ici, avec les mêmes écrans et confirmations que l'app.

type Screen = { parent: OfferRow | null };

export function ConversationPane({ conversation, thread, offers, visits, blocked, me }: {
  conversation: Conversation;
  thread: ThreadState;
  offers: Loadable<OfferRow[]>;
  visits: ConversationVisit[];
  blocked: Set<string>;
  me: string | null;
}) {
  const [screen, setScreen] = useState<Screen | null>(null);
  const [declined, setDeclined] = useState<OfferRow | null>(null);
  const [confirmation, setConfirmation] = useState<{ offer: OfferRow; action: 'accept' | 'withdraw' } | null>(null);
  const [calling, setCalling] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const now = new Date();
  const messages = visibleMessages(thread.messages, conversation.clearedAt, now);
  const conversationOffers = offers.status === 'ready' || offers.status === 'error' ? offersIn(offers.value, conversation.id) : null;
  const nextVisit = upcomingVisits(visits, now).find((visit) => sameId(visit.conversationId, conversation.id)) ?? null;
  const other = conversation.otherUserId;
  const isBlocked = !conversation.isGroup && !!other && blocked.has(other.toLowerCase());
  const listing = conversation.listing;
  const offerPossible = !!listing && canMakeOffer({
    id: conversation.id, isGroup: conversation.isGroup, listingId: listing.listingId, transaction: listing.transaction,
    isSellerSide: conversation.isSellerSide, title: listing.title, price: listing.price,
  }, offers.value, now);

  const onOfferAction = (offer: OfferRow, action: OfferAction) => {
    if (action === 'counter') setScreen({ parent: offer });
    else if (action === 'decline') setDeclined(offer);
    else setConfirmation({ offer, action });
  };

  if (screen && listing) {
    return (
      <div className="dm-pane dm-pane-screen">
        <div className="dl dm-offer-host">
          <OfferScreen
            conversationId={conversation.id}
            title={listing.title}
            price={listing.price}
            parent={screen.parent ? { id: screen.parent.id, amount: Number(screen.parent.amount) } : null}
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
        {listing && <ListingBanner listing={listing} address={nextVisit?.address ?? null} />}
      </div>

      {thread.status === 'error' ? (
        <div className="dm-thread dm-thread-state" role="alert">
          <p>Impossible de charger les messages. Réessayez dans un instant.</p>
        </div>
      ) : thread.status !== 'ready' || !sameId(thread.conversationId, conversation.id) ? (
        <div className="dm-thread dm-thread-state"><span className="spinner" role="status" aria-label="Chargement des messages" /></div>
      ) : (
        <Thread conversation={conversation} messages={messages} offers={conversationOffers} me={me} onOfferAction={onOfferAction} />
      )}

      <BottomBar
        conversation={conversation}
        isBlocked={isBlocked}
        messages={thread.status === 'ready' && sameId(thread.conversationId, conversation.id) ? thread.messages : null}
        onMakeOffer={offerPossible ? () => setScreen({ parent: null }) : null}
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
    </section>
  );
}

// MARK: - En-têtes

function DirectHeader({ conversation, isBlocked, onCall, onBlock, onReport }: {
  conversation: Conversation;
  isBlocked: boolean;
  onCall: () => void;
  onBlock: () => void;
  onReport: () => void;
}) {
  const counterpart = conversation.counterpart;
  const hasPhone = !!counterpart.phone?.trim();
  const who = (
    <>
      <CounterpartAvatar counterpart={counterpart} size={46} />
      <span className="dm-head-text">
        <span className="dm-head-name">
          <span className="dm-head-title">{counterpart.name}</span>
          <PublisherBadge kind={counterpart.kind} />
        </span>
        <span className="dm-head-sub">{counterpart.subtitle}</span>
      </span>
    </>
  );
  return (
    <header className="dm-head">
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
        <button
          type="button"
          className={`dm-round${hasPhone ? '' : ' is-dim'}`}
          onClick={onCall}
          aria-label={hasPhone ? 'Appeler' : 'Numéro non partagé'}
          title={hasPhone ? 'Appeler' : 'Numéro non partagé'}
        >
          <Icon name="phone" />
        </button>
        <ActionMenu label="Plus d'options" className="dm-round" items={directMenuItems({ conversation, isBlocked, onBlock, onReport })}>
          <Icon name="ellipsisVertical" />
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
      <button type="button" className="dm-head-who" onClick={() => showIphoneOnly(info)} aria-label={info}>
        <CounterpartAvatar counterpart={conversation.counterpart} size={46} />
        <span className="dm-head-text">
          <span className="dm-head-name"><span className="dm-head-title">{conversation.counterpart.name}</span></span>
          <span className="dm-head-sub">{conversation.hasLeft ? 'Vous avez quitté le groupe' : groupSummary(conversation.members)}</span>
        </span>
      </button>
      <div className="dm-head-tools">
        {manages && (
          <button type="button" className="dm-round" onClick={() => showIphoneOnly(conversation.communityId ? info : 'Ajouter des membres')} aria-label="Ajouter des membres" title="Ajouter des membres">
            <Icon name="userPlus" />
          </button>
        )}
        <ActionMenu label="Plus d'options" className="dm-round" items={groupMenuItems({ conversation, onReport })}>
          <Icon name="ellipsisVertical" />
        </ActionMenu>
      </div>
    </header>
  );
}

// MARK: - Bandeau du bien

/** Photo, titre, « ville · rue » (adresse de la visite si elle est connue), prix ; « Voir l'annonce » si elle s'ouvre. */
function ListingBanner({ listing, address }: { listing: ListingSnapshot; address: string | null }) {
  const rows = useStore(listingStore);
  const state = rows.get(listing.listingId.toLowerCase());
  useEffect(() => { loadListingRow(listing.listingId); }, [listing.listingId]);
  const opens = state?.status === 'ready';
  const price = listing.transaction === 'rent' ? formatPerMonth(listing.price) : formatPrice(listing.price);
  const body = (
    <>
      <span className="dm-banner-photo">{listing.coverUrl ? <img src={listing.coverUrl} alt="" /> : <Icon name="image" />}</span>
      <span className="dm-banner-text">
        <span className="dm-banner-title">{listing.title}</span>
        <span className="dm-banner-line">{bannerLocation(listing, address)} · {price}</span>
      </span>
      {opens && <span className="dm-banner-link">Voir l'annonce<Icon name="chevronRight" /></span>}
    </>
  );
  return opens ? (
    <a className="dm-banner" href={listingPath(listing.listingId)} title="Ouvre la fiche du bien">{body}</a>
  ) : <div className="dm-banner">{body}</div>;
}

// MARK: - Bas de la conversation

function BottomBar({ conversation, isBlocked, messages, onMakeOffer }: {
  conversation: Conversation;
  isBlocked: boolean;
  messages: Message[] | null;
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
  return <Composer key={conversation.id} conversation={conversation} messages={messages} onMakeOffer={onMakeOffer} />;
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
      <Icon name="messages" />
      <h2>Conversation introuvable</h2>
      <p>Elle n'existe plus, ou elle appartient à un autre compte.</p>
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
