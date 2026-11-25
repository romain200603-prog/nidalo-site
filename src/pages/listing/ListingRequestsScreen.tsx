import { useCallback, useEffect, useState } from 'react';
import { ContentUnavailable } from '../../components/ContentUnavailable';
import { Icon } from '../../components/Icon';
import { OfflineState } from '../../components/OfflineState';
import { PageHeader } from '../../components/PageHeader';
import { CONVERSATION_NOT_FOUND, findExistingConversation } from '../../lib/account/agenda';
import { useDesktop } from '../../lib/desktop';
import { openListingConversation } from '../../lib/listing/conversation';
import {
  otherParty, referenceSlot, REQUEST_TAB_EMPTY, REQUEST_TAB_TITLES, requestOpenSlots, requestRole, requestsInTab, isRescheduling,
  type DetailRequestRow, type RequestTab,
} from '../../lib/listing/requestDetail';
import { fetchVisitRequests, requestDisplayStatus, requestSlotLabel } from '../../lib/listing/visits';
import { isOfflineFailure } from '../../lib/loadFailure';
import { photoUrl } from '../../lib/listings';
import { conversationPath, visitRequestPath } from '../../lib/paths';
import { RequestStatusBadge } from '../account/VisitRequestDetail';
import { Spinner } from '../account/parts';
import { AlertDialog } from './Dialogs';
import '../../styles/agenda-app.css';

// « Demandes de visite » d'une annonce (« Voir les demandes » de sa propre annonce, &vue=demandes), comme l'app
// (Features/Visits/MyVisitsView.swift avec listingId) : les demandes du compte pour ce bien (my_visit_requests), en trois
// onglets (À traiter, À venir, Historique ; À venir d'emblée quand rien n'attend de réponse). Chaque ligne ouvre la
// demande ; « Message » ouvre la conversation déjà ouverte avec le demandeur, « Voir le bien » revient à la fiche.

const TABS: RequestTab[] = ['toHandle', 'upcoming', 'history'];
const sameId = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

type Load = { status: 'loading' } | { status: 'offline' } | { status: 'ready'; requests: DetailRequestRow[] };

export function ListingRequestsScreen({ listingId, me, onClose }: { listingId: string; me: string | null; onClose: () => void }) {
  const desktop = useDesktop();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [tab, setTab] = useState<RequestTab | null>(null);
  const [missing, setMissing] = useState(false);

  const read = useCallback(async () => {
    setLoad({ status: 'loading' });
    try {
      const rows = (await fetchVisitRequests()) as DetailRequestRow[];
      setLoad({ status: 'ready', requests: rows.filter((row) => sameId(row.listing_snapshot?.listingId ?? row.listing_id, listingId)) });
    } catch (error) {
      // Demandes non lues : la coupure et « Réessayer », pas « aucune demande » (n° 75).
      setLoad(isOfflineFailure(error) ? { status: 'offline' } : { status: 'ready', requests: [] });
    }
  }, [listingId]);

  useEffect(() => { void read(); }, [read]);

  const now = new Date();
  const requests = load.status === 'ready' ? load.requests : [];
  // Rien à traiter : l'onglet À venir s'ouvre directement (une seule fois).
  const shownTab: RequestTab = tab ?? (requestsInTab(requests, 'toHandle', me, now).length ? 'toHandle' : 'upcoming');
  const shown = requestsInTab(requests, shownTab, me, now);

  async function message(request: DetailRequestRow) {
    const listing = request.listing_snapshot?.listingId ?? request.listing_id;
    if (!listing) return;
    if (requestRole(request, me) === 'recipient') {
      const found = await findExistingConversation(listing, request.requester.userId);
      if (found) window.location.assign(conversationPath(found));
      else setMissing(true);
      return;
    }
    const conversation = await openListingConversation(listing, me);
    if (conversation) window.location.assign(conversationPath(conversation.id));
    else setMissing(true);
  }

  let content;
  if (load.status === 'loading') content = <Spinner label="Chargement des demandes…" />;
  else if (load.status === 'offline') content = <OfflineState onRetry={() => void read()} />;
  else if (shown.length === 0) {
    content = <ContentUnavailable icon="calendar" title={REQUEST_TAB_EMPTY[shownTab].title} text={REQUEST_TAB_EMPTY[shownTab].text} />;
  } else {
    content = (
      <div className="app-request-list">
        {shown.map((request) => {
          const other = otherParty(request, me);
          const status = requestDisplayStatus(request, now);
          const slot = referenceSlot(request);
          const open = requestOpenSlots(request);
          const more = request.accepted_slot === null && open.length > 1 ? ` · ${open.length} créneaux` : '';
          const cover = request.listing_snapshot?.coverPath;
          return (
            <article key={request.id} className="app-request-row">
              <a className="app-request-row-main" href={visitRequestPath(request.id)}>
                <span className="app-request-thumb" aria-hidden="true">{cover ? <img src={photoUrl(cover)} alt="" /> : <Icon name="home" />}</span>
                <span className="app-request-row-text">
                  <span className="app-request-row-title">
                    <span>{request.listing_snapshot?.title ?? 'Annonce'}</span>
                    <Icon name="chevronRight" className="icon app-row-chevron" />
                  </span>
                  <span className="app-request-row-person">
                    <span>{other.name}</span>
                    <span className={`app-request-kind${other.kind === 'agency' ? ' is-pro' : ''}`}>{other.kind === 'agency' ? 'Pro' : 'Particulier'}</span>
                    <span className="app-request-row-side">{requestRole(request, me) === 'requester' ? '· envoyée' : '· reçue'}</span>
                  </span>
                  {slot && <span className="app-request-row-slot"><Icon name="calendar" />{requestSlotLabel(new Date(slot.start)) + more}</span>}
                  <span className="app-request-row-status">
                    <RequestStatusBadge status={status} rescheduling={isRescheduling(request) && status !== 'past'} />
                    {request.mode === 'video' && <span className="app-request-row-video"><Icon name="video" />Visio</span>}
                  </span>
                </span>
              </a>
              <div className="app-request-row-buttons">
                <button type="button" onClick={() => void message(request)}><Icon name="messageCircle" />Message</button>
                <button type="button" onClick={onClose}><Icon name="house" />Voir le bien</button>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`app-request app-requests dl-screen${desktop ? ' is-desktop wrap wrap-narrow' : ''}`}>
      {desktop ? (
        <header className="dl-screen-head">
          <div className="dl-screen-titles"><h1 tabIndex={-1}>Demandes de visite</h1></div>
          <button type="button" className="dl-screen-close" onClick={onClose} aria-label="Fermer" title="Fermer"><Icon name="x" /></button>
        </header>
      ) : (
        <PageHeader title="Demandes de visite" onBack={onClose} />
      )}
      <div className="app-request-tabs" role="tablist" aria-label="Demandes">
        {TABS.map((option) => {
          const count = requestsInTab(requests, option, me, now).length;
          return (
            <button key={option} type="button" role="tab" aria-selected={shownTab === option} className="app-request-tab" onClick={() => setTab(option)}>
              <span>{REQUEST_TAB_TITLES[option]}</span>
              {option !== 'history' && count > 0 && <span className="app-request-tab-count">{count}</span>}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" aria-label={REQUEST_TAB_TITLES[shownTab]}>{content}</div>
      <AlertDialog open={missing} onClose={() => setMissing(false)} dismissible={false} title="Conversation introuvable"
        message={CONVERSATION_NOT_FOUND} actions={[{ label: 'OK', role: 'cancel', onClick: () => setMissing(false) }]} />
    </div>
  );
}
