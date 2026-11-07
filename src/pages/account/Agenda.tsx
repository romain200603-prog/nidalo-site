import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import {
  acceptsReport, agendaItems, agendaStore, AGENDA_LOAD_ERROR, canContact, contactConversationId, countIn, directionsUrl, displayStatus,
  EMPTY_TABS, groupsIn, groupTitle, isRequestEntry, loadAgenda, openSlotCount, routableAddress, shortStatusLabel, TAB_TITLES,
  type AgendaItem, type VisitDisplayStatus, type VisitTab,
} from '../../lib/account/agenda';
import { useSession, useStore } from '../../lib/account/session';
import { openListingConversation } from '../../lib/listing/conversation';
import { slotLabel, visitDateLong } from '../../lib/listing/visits';
import { accountPath, conversationPath, visitRequestPath } from '../../lib/paths';
import { ActionMenu, ChoiceDialog, IphoneOnlyDialog, ScreenHead, Thumb, type MenuItem } from './DesktopParts';
import { Spinner } from './parts';

// « Mon agenda » sur ordinateur (Features/Visits/VisitsAgendaView.swift), dans la colonne de 640 px : onglets
// À venir, Passées, Annulées avec leur nombre ; visites groupées par date ; Itinéraire (Plans), Contacter (la
// conversation liée, sinon une conversation avec le vendeur) et le menu « … ». Les visites viennent de
// agenda_visits, les demandes de visite pas encore acceptées de my_visit_requests (lib/account/agenda). Le détail d'une
// visite, ses modifications et le calendrier restent dans l'app iPhone ; une demande ouvre l'écran « Demande de visite ».

const TABS: VisitTab[] = ['upcoming', 'past', 'cancelled'];

const NO_ADDRESS = 'Adresse non renseignée : l\'itinéraire sera disponible quand le vendeur l\'aura communiquée.';
const NO_SELLER = 'Impossible de joindre le vendeur de ce bien pour l\'instant.';

const STATUS_ICONS: Record<VisitDisplayStatus, IconName | null> = {
  confirmed: null,
  awaitingOther: 'clock',
  toConfirm: 'calendar',
  done: 'check',
  cancelled: 'x',
};

/** Badge de statut (VisitStatusBadge, libellé court des cartes). */
function StatusBadge({ status }: { status: VisitDisplayStatus }) {
  const icon = STATUS_ICONS[status];
  return (
    <span className={`dsc-status is-${status}`}>
      {icon ? <Icon name={icon} /> : <span className="dsc-status-dot" aria-hidden="true" />}
      {shortStatusLabel(status)}
    </span>
  );
}

/** Actions du menu « … » d'une visite enregistrée, dans l'ordre et aux conditions de l'app (VisitCard). */
function menuItems(item: AgendaItem, status: VisitDisplayStatus, iphone: (title: string) => void): MenuItem[] {
  const fromRequest = item.requestId !== null;
  const isActive = item.status !== 'cancelled' && status !== 'done' && !fromRequest;
  const items: MenuItem[] = [];
  if (isActive) items.push({ label: 'Modifier la visite', icon: 'squarePen', onClick: () => iphone('Modifier la visite') });
  if (status !== 'done' && !fromRequest) items.push({ label: 'Reprogrammer', icon: 'calendarDays', onClick: () => iphone('Reprogrammer') });
  items.push({ label: 'Ajouter une note', icon: 'fileText', onClick: () => iphone('Ajouter une note') });
  items.push({ label: 'Ajouter à mon calendrier', icon: 'calendarPlus', onClick: () => iphone('Ajouter à mon calendrier') });
  if (isActive) items.push({ label: 'Annuler la visite', icon: 'x', onClick: () => iphone('Annuler la visite'), danger: true });
  if (item.conversationId === null && !fromRequest) items.push({ label: 'Supprimer', icon: 'trash', onClick: () => iphone('Supprimer'), danger: true });
  return items;
}

function VisitCard({ item, now, slotNote, onNotice, onIphone, onContact }: {
  item: AgendaItem;
  now: Date;
  slotNote: string | null;
  onNotice: (text: string) => void;
  onIphone: (title: string) => void;
  onContact: (item: AgendaItem) => void;
}) {
  const status = displayStatus(item, now);
  const address = routableAddress(item);
  const request = isRequestEntry(item);
  const contactable = canContact(item);
  const lines = (
    <span className="dsc-visit-lines">
      <span>{address ?? 'Adresse non renseignée'}</span>
      {item.contactName && <span>Avec {item.contactName}</span>}
      {slotNote && <span className="dsc-visit-note">{slotNote}</span>}
      {acceptsReport(item, now) && item.reportSummary && (
        <span className="dsc-visit-report"><Icon name="clipboardCheck" />{item.reportSummary}</span>
      )}
    </span>
  );
  return (
    <article className="dsc-visit">
      <Thumb url={item.listing?.coverImageURL ?? null} className="dsc-visit-photo" />
      <div className="dsc-visit-body">
        <div className="dsc-visit-top">
          <span className={`dsc-visit-date${status === 'cancelled' ? ' is-cancelled' : ''}`}>
            <span aria-hidden="true">{slotLabel(item.start)}</span>
            <span className="visually-hidden">{visitDateLong(item.start)}</span>
          </span>
          <StatusBadge status={status} />
        </div>
        <p className="dsc-visit-title">{item.listing?.title ?? 'Visite'}</p>
        {request ? (
          // Demande pas encore acceptée : son écran (« Demande de visite ») réunit ses actions.
          <a className="dsc-visit-open" href={visitRequestPath(item.id)} aria-label={`Voir la demande : ${item.listing?.title ?? 'Visite'}`}>
            {lines}
            <Icon name="chevronRight" className="icon dsc-visit-chevron" />
          </a>
        ) : (
          <div className="dsc-visit-open">{lines}</div>
        )}
        <div className="dsc-visit-actions">
          {address ? (
            <a className="dsc-visit-action" href={directionsUrl(address)} target="_blank" rel="noopener noreferrer">
              <Icon name="navigation" />Itinéraire
            </a>
          ) : (
            <button type="button" className="dsc-visit-action" onClick={() => onNotice(NO_ADDRESS)}>
              <Icon name="navigation" />Itinéraire
            </button>
          )}
          <button type="button" className="dsc-visit-action" disabled={!contactable} onClick={() => onContact(item)}>
            <Icon name="messageCircle" />Contacter
          </button>
          {!request && <ActionMenu label="Autres actions" items={menuItems(item, status, onIphone)} />}
        </div>
      </div>
    </article>
  );
}

export function AgendaScreen() {
  const state = useStore(agendaStore);
  const session = useSession();
  const me = session.status === 'signedIn' ? session.userId : null;
  const [tab, setTab] = useState<VisitTab>('upcoming');
  const [notice, setNotice] = useState<string | null>(null);
  const [iphoneOnly, setIphoneOnly] = useState<string | null>(null);

  useEffect(() => {
    void loadAgenda();
  }, []);

  const now = new Date();
  const items = agendaItems(state, me, now);
  const groups = groupsIn(items, tab, now);
  const addPath = accountPath('ajouter-visite', { depuis: 'agenda' });

  /** Demande avec plusieurs créneaux proposés : « 3 créneaux proposés ». */
  function slotNote(item: AgendaItem): string | null {
    if (!isRequestEntry(item) || item.status === 'cancelled') return null;
    const request = state.requests.find((other) => other.id.toLowerCase() === item.id.toLowerCase());
    const count = request ? openSlotCount(request) : 0;
    return count > 1 ? `${count} créneaux proposés` : null;
  }

  /** Conversation liée, sinon nouvelle conversation avec le vendeur de l'annonce. */
  async function contact(item: AgendaItem) {
    const id = contactConversationId(item);
    if (id) {
      window.location.assign(conversationPath(id));
      return;
    }
    if (!item.listing) return;
    const conversation = await openListingConversation(item.listing.listingId, me);
    if (conversation) window.location.assign(conversationPath(conversation.id));
    else setNotice(NO_SELLER);
  }

  let content;
  if (state.status === 'loading' && state.visits.length === 0) {
    content = <Spinner label="Chargement des visites…" />;
  } else if (state.status === 'error' && state.visits.length === 0) {
    content = (
      <div className="dsc-empty">
        <Icon name="triangleAlert" />
        <h2>Visites indisponibles</h2>
        <p>{AGENDA_LOAD_ERROR}</p>
        <button type="button" className="dsc-button dsc-button-primary" onClick={() => void loadAgenda()}>Réessayer</button>
      </div>
    );
  } else if (groups.length === 0) {
    content = (
      <div className="dsc-empty">
        <Icon name="calendar" />
        <h2>{EMPTY_TABS[tab].title}</h2>
        <p>{EMPTY_TABS[tab].message}</p>
      </div>
    );
  } else {
    content = groups.map((group) => (
      <section key={group.kind} className="dsc-visit-group" aria-label={groupTitle(group.kind, tab)}>
        <h2 className="dsc-group-title">{groupTitle(group.kind, tab)}</h2>
        {group.items.map((item) => (
          <VisitCard key={item.id} item={item} now={now} slotNote={slotNote(item)} onNotice={setNotice} onIphone={setIphoneOnly}
            onContact={(visit) => void contact(visit)} />
        ))}
      </section>
    ));
  }

  return (
    <div className="dsc dsc-agenda-screen">
      <ScreenHead title="Agenda des visites" subtitle="Toutes vos visites à venir et passées." />
      <div className="dsc-agenda-bar">
        <div className="dsc-tabs" role="tablist" aria-label="Visites">
          {TABS.map((option) => {
            const count = countIn(items, option, now);
            return (
              <button key={option} type="button" role="tab" aria-selected={tab === option} className="dsc-tab" onClick={() => setTab(option)}>
                {TAB_TITLES[option]}
                <span className="dsc-tab-count">{count}</span>
              </button>
            );
          })}
        </div>
        <a className="dsc-square" href={addPath} aria-label="Programmer une visite"><Icon name="calendarPlus" /></a>
      </div>
      <div className="dsc-visits" role="tabpanel" aria-label={TAB_TITLES[tab]}>{content}</div>
      <a className="dsc-button dsc-button-light dsc-add-visit" href={addPath}><Icon name="calendarPlus" />Ajouter une visite manuellement</a>
      <ChoiceDialog open={notice !== null} title={notice ?? ''} onClose={() => setNotice(null)}
        actions={[{ label: 'OK', onClick: () => setNotice(null), tone: 'primary' }]} />
      <IphoneOnlyDialog title={iphoneOnly} onClose={() => setIphoneOnly(null)} />
    </div>
  );
}
