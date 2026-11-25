import { useEffect, useRef, useState } from 'react';
import { showToast } from '../../components/AppToast';
import { ContentUnavailable } from '../../components/ContentUnavailable';
import { Icon } from '../../components/Icon';
import { LargeHeader } from '../../components/LargeHeader';
import { OfflineState } from '../../components/OfflineState';
import { SectionLabel } from '../../components/MenuRows';
import { RoundButton } from '../../components/RoundButton';
import {
  acceptsReport, agendaItems, agendaStore, AGENDA_LOAD_ERROR, canContact, cancelVisit, contactConversationId, CONVERSATION_NOT_FOUND, countIn,
  deleteVisit, directionsUrl, displayStatus, downloadVisitCalendar, EMPTY_TABS, fetchAgencyNames, findExistingConversation, isRequestEntry, isVideoVisit, loadAgenda,
  loadVisitSessions, noAddressNotice, noSellerNotice, PERIOD_TITLES, periodGroupsIn, receivedRequest, routableAddress, sessionBookedLabel,
  sessionTitle, shortStatusLabel, TAB_TITLES, upcomingSessionsOf, visitCardTitle, visitDateBlock, visitPersonLine, visitSessionsStore,
  visitShareText, visitSlotCount, visitTimeRange, type AgendaItem, type VisitDisplayStatus, type VisitSession, type VisitTab,
} from '../../lib/account/agenda';
import { useSession, useStore } from '../../lib/account/session';
import { useDesktop } from '../../lib/desktop';
import { openListingConversation } from '../../lib/listing/conversation';
import { visitDateLong } from '../../lib/listing/visits';
import { accountPath, conversationPath, PATHS, visitRequestPath } from '../../lib/paths';
import { useFitTexts } from '../listing/fitText';
import { ActionMenu, ChoiceDialog, IphoneOnlyDialog, ScreenHead, type MenuItem } from './DesktopParts';
import { Spinner } from './parts';
import { VisitDetail } from './VisitDetail';
import '../../styles/agenda-app.css';

// « Mon agenda », comme l'app (Features/Visits/VisitsAgendaView.swift) : sur téléphone, son écran (retour rond, « + »,
// grand titre, onglets sur la piste grise, visites groupées par période, cartes avec le bloc date) ; sur ordinateur, la
// mise en page du site (en-tête, onglets et « + » sur une ligne) avec ces pièces. Itinéraire (Plans, sauf en visio),
// Message (la conversation liée ; pour une demande reçue, celle déjà ouverte avec le demandeur ; sinon une conversation
// avec le vendeur) et le menu « … ». Les visites viennent de agenda_visits, les demandes de visite pas encore acceptées
// de my_visit_requests, les créneaux ouverts de my_visit_sessions (lib/account/agenda). Toucher une visite ouvre son
// détail (&visite=…), une demande l'écran « Demande de visite ». « Ajouter à mon calendrier » donne un fichier .ics ;
// Annuler et Supprimer écrivent dans agenda_visits comme l'app. Modifier, reprogrammer, la note et la page d'une séance
// de créneaux restent dans l'app iPhone.

const TABS: VisitTab[] = ['upcoming', 'past', 'cancelled'];

/** Teinte du bloc date : gris annulée, ambre à confirmer ou en attente, bleu sinon (dateBlock). */
function dateTone(status: VisitDisplayStatus): string {
  if (status === 'cancelled') return 'gray';
  return status === 'toConfirm' || status === 'awaitingOther' ? 'amber' : 'blue';
}

/** Teinte de la pastille d'état : « Confirmée » vert, « À confirmer » et « En attente » ambre, « Annulée » rouge, « Terminée » gris. */
const PILL_TONES: Record<VisitDisplayStatus, string> = { confirmed: 'green', toConfirm: 'amber', awaitingOther: 'amber', cancelled: 'red', done: 'gray' };

/** Ce que le menu « … » et le détail d'une visite font : iPhone seulement, calendrier, annuler, supprimer. */
type VisitHandlers = { iphone: (title: string) => void; calendar: (item: AgendaItem) => void; cancel: (item: AgendaItem) => void; remove: (item: AgendaItem) => void };

/** Actions du menu « … » d'une visite enregistrée, dans l'ordre et aux conditions de l'app (VisitCard.menu). */
function menuItems(item: AgendaItem, status: VisitDisplayStatus, { iphone, calendar, cancel, remove }: VisitHandlers): MenuItem[] {
  const fromRequest = item.requestId !== null;
  const isActive = item.status !== 'cancelled' && status !== 'done' && !fromRequest;
  const items: MenuItem[] = [];
  if (isActive) items.push({ label: 'Modifier la visite', icon: 'squarePen', onClick: () => iphone('Modifier la visite') });
  if (status !== 'done' && !fromRequest) items.push({ label: 'Reprogrammer', icon: 'calendarDays', onClick: () => iphone('Reprogrammer') });
  items.push({ label: 'Ajouter une note', icon: 'fileText', onClick: () => iphone('Ajouter une note') });
  items.push({ label: 'Ajouter à mon calendrier', icon: 'calendarPlus', onClick: () => calendar(item) });
  if (isActive) items.push({ label: 'Annuler la visite', icon: 'x', onClick: () => cancel(item), danger: true });
  if (item.conversationId === null && !fromRequest) items.push({ label: 'Supprimer', icon: 'trash', onClick: () => remove(item), danger: true });
  return items;
}

/** Onglets À venir, Passées, Annulées sur la piste grise ; le nombre dans une pastille, seulement à partir de 1. */
function AgendaTabs({ tab, counts, onChange }: { tab: VisitTab; counts: Record<VisitTab, number>; onChange: (tab: VisitTab) => void }) {
  return (
    <div className="app-agenda-tabs" role="tablist" aria-label="Visites">
      {TABS.map((option) => (
        <button key={option} type="button" role="tab" aria-selected={tab === option} aria-label={`${TAB_TITLES[option]}, ${counts[option]}`}
          className="app-agenda-tab" onClick={() => onChange(option)}>
          <span className="app-agenda-tab-title">{TAB_TITLES[option]}</span>
          {counts[option] > 0 && <span className="app-agenda-tab-count">{counts[option]}</span>}
        </button>
      ))}
    </div>
  );
}

/** « + » rond bleu clair : Ajouter une visite. */
function AddVisitButton({ href }: { href: string }) {
  return (
    <a className="app-agenda-plus" href={href} aria-label="Ajouter une visite">
      <span className="app-agenda-plus-circle"><Icon name="plus" /></span>
    </a>
  );
}

/**
 * Carte d'une visite (VisitCard) : bloc date à gauche ; horaire, état, bien et personne à droite ; sous un trait fin,
 * Itinéraire (ou « Voir les créneaux » d'une demande à plusieurs créneaux), Message et « … ». Une demande s'ouvre en
 * touchant la carte ; les boutons gardent la priorité.
 */
function VisitCard({ item, now, slotCount, agencyName, onNotice, handlers, onContact }: {
  item: AgendaItem;
  now: Date;
  slotCount: number | null;
  agencyName: string | null;
  onNotice: (text: string) => void;
  handlers: VisitHandlers;
  onContact: (item: AgendaItem) => void;
}) {
  const status = displayStatus(item, now);
  const address = routableAddress(item);
  const request = isRequestEntry(item);
  const contactable = canContact(item);
  const date = visitDateBlock(item.start);
  const title = visitCardTitle(item);
  const person = visitPersonLine(item, status, slotCount, agencyName);
  const report = acceptsReport(item, now) ? item.reportSummary : null;
  return (
    <article className="app-visit">
      {request && <a className="app-visit-open" href={visitRequestPath(item.id)} aria-label={`Voir la demande : ${item.listing?.title ?? 'Visite'}`} />}
      {/* Une visite enregistrée : la carte entière ouvre son détail (VisitDetailView). */}
      {!request && <a className="app-visit-detail" href={accountPath('agenda', { visite: item.id })} aria-label={`Voir la visite : ${item.listing?.title ?? 'Visite'}`} />}
      <div className="app-visit-main">
        <span className={`app-visit-date app-tone-${dateTone(status)}`} role="img" aria-label={visitDateLong(item.start)}>
          <span className="app-visit-weekday" aria-hidden="true">{date.weekday}</span>
          <span className="app-visit-day" aria-hidden="true">{date.day}</span>
          <span className="app-visit-month" aria-hidden="true">{date.month}</span>
        </span>
        <div className="app-visit-text">
          <div className="app-visit-top">
            <span className={`app-visit-time${status === 'cancelled' ? ' is-cancelled' : ''}`}>
              {slotCount !== null ? `${slotCount} créneaux proposés` : visitTimeRange(item)}
            </span>
            <span className={`app-visit-pill app-tone-${PILL_TONES[status]}`}>
              {status === 'confirmed' && <Icon name="check" />}{shortStatusLabel(status)}
            </span>
          </div>
          <p className="app-visit-title">{title}</p>
          {person && <p className="app-visit-person">{person}</p>}
          {report && <p className="app-visit-report"><Icon name="clipboardCheck" />{report}</p>}
        </div>
      </div>
      <div className="app-visit-line" aria-hidden="true" />
      <div className="app-visit-actions">
        {slotCount !== null ? (
          <a className="app-visit-button is-outline" href={visitRequestPath(item.id)}><Icon name="calendarBlank" />Voir les créneaux</a>
        ) : isVideoVisit(item) ? null : address ? (
          // Visite en visio : pas d'itinéraire (n° 178).
          <a className="app-visit-button is-soft app-visit-route" href={directionsUrl(address)} target="_blank" rel="noopener noreferrer">
            <Icon name="navigation" />Itinéraire
          </a>
        ) : (
          <button type="button" className="app-visit-button is-soft" onClick={() => onNotice(noAddressNotice(item))}>
            <Icon name="navigation" />Itinéraire
          </button>
        )}
        <button type="button" className="app-visit-button is-outline" disabled={!contactable} onClick={() => onContact(item)}>
          <Icon name="messageCircle" />Message
        </button>
        {!request && <ActionMenu label="Autres actions" items={menuItems(item, status, handlers)} triggerClassName="dsc-menu-button app-visit-more" />}
      </div>
    </article>
  );
}

/**
 * Séance de créneaux ouverte (VisitSessionCard) : calendrier sur fond bleu clair, jour et horaire, bien, inscrits sur
 * places (vert dès un inscrit), chevron. Sa page (« Séance de visites ») reste dans l'app iPhone.
 */
function SessionCard({ session, onOpen }: { session: VisitSession; onOpen: () => void }) {
  // Titre trop long : il rapetisse jusqu'à 80 % avant « … » (minimumScaleFactor(0.8) de l'app).
  const ref = useFitTexts<HTMLButtonElement>();
  const line = [session.listing.title, session.listing.city].filter(Boolean).join(' · ');
  return (
    <button ref={ref} type="button" className="app-session" onClick={onOpen}>
      <span className="app-session-icon" aria-hidden="true"><Icon name="calendarDays" /></span>
      <span className="app-session-text">
        <span className="app-session-title" data-fit="0.8">{sessionTitle(session)}</span>
        <span className="app-session-line">{line}</span>
        <span className={`app-visit-pill app-tone-${session.bookedCount > 0 ? 'green' : 'blue'}`}>{sessionBookedLabel(session)}</span>
      </span>
      <Icon name="chevronRight" className="icon app-row-chevron" />
    </button>
  );
}

export function AgendaScreen() {
  const state = useStore(agendaStore);
  const sessionsState = useStore(visitSessionsStore);
  const session = useSession();
  const desktop = useDesktop();
  const me = session.status === 'signedIn' ? session.userId : null;
  const [tab, setTab] = useState<VisitTab>('upcoming');
  const [notice, setNotice] = useState<string | null>(null);
  const [iphoneOnly, setIphoneOnly] = useState<string | null>(null);
  const [agencies, setAgencies] = useState<Map<string, string>>(() => new Map());
  // Visite à annuler ou à supprimer, en attente de confirmation (visitToCancel, visitToDelete).
  const [confirm, setConfirm] = useState<{ kind: 'cancel' | 'delete'; item: AgendaItem } | null>(null);
  const busy = useRef(false);
  const asked = useRef(new Set<string>());
  // « Détail de la visite » : la visite ouverte depuis sa carte (&visite=…).
  const visitId = new URLSearchParams(window.location.search).get('visite');

  useEffect(() => {
    void loadAgenda();
    void loadVisitSessions();
  }, []);

  const now = new Date();
  const items = agendaItems(state, me, now);

  // Agence qui publie chaque annonce visitée, lue une fois par annonce (VisitsAgendaView.loadAgencyNames) : visites et
  // demandes en attente (n° 184).
  const listingIds = [...new Set(items.flatMap((visit) => (visit.listing ? [visit.listing.listingId.toLowerCase()] : [])))].sort().join(',');
  useEffect(() => {
    const wanted = listingIds.split(',').filter((id) => id && !asked.current.has(id));
    if (!wanted.length) return;
    for (const id of wanted) asked.current.add(id);
    void fetchAgencyNames(wanted).then((found) => {
      if (found.size) setAgencies((current) => new Map([...current, ...found]));
    });
  }, [listingIds]);

  const groups = periodGroupsIn(items, tab, now);
  // Séances de créneaux ouvertes (vendeur ou bailleur), en tête des visites à venir.
  const sessions = tab === 'upcoming' ? upcomingSessionsOf(sessionsState, me, now) : [];
  const counts = { upcoming: countIn(items, 'upcoming', now), past: countIn(items, 'past', now), cancelled: countIn(items, 'cancelled', now) };
  const addPath = accountPath('ajouter-visite', { depuis: 'agenda' });
  const addLink = (
    <a className="app-agenda-add-link" href={addPath}><Icon name="calendarPlus" />Ajouter une visite manuellement</a>
  );

  /** Conversation liée, sinon nouvelle conversation avec le vendeur de l'annonce. */
  async function contact(item: AgendaItem) {
    const id = contactConversationId(item);
    if (id) {
      window.location.assign(conversationPath(id));
      return;
    }
    if (!item.listing) return;
    // Visite d'une demande reçue : la conversation déjà ouverte avec le demandeur, jamais une nouvelle (n° 11).
    const request = receivedRequest(item, state.requests, me);
    if (request) {
      const found = await findExistingConversation(item.listing.listingId, request.requester.userId);
      if (found) window.location.assign(conversationPath(found));
      else setNotice(CONVERSATION_NOT_FOUND);
      return;
    }
    const conversation = await openListingConversation(item.listing.listingId, me);
    if (conversation) window.location.assign(conversationPath(conversation.id));
    else setNotice(noSellerNotice(item));
  }

  const handlers: VisitHandlers = {
    iphone: setIphoneOnly,
    calendar: downloadVisitCalendar,
    cancel: (item) => setConfirm({ kind: 'cancel', item }),
    remove: (item) => setConfirm({ kind: 'delete', item }),
  };

  /** Annulation ou suppression confirmée ; une visite supprimée depuis son détail ramène à l'agenda. */
  async function confirmed() {
    if (!confirm || !me || busy.current) return;
    const { kind, item } = confirm;
    setConfirm(null);
    busy.current = true;
    const error = kind === 'cancel' ? await cancelVisit(item) : await deleteVisit(item, me);
    busy.current = false;
    if (error) setNotice(error);
    else if (kind === 'delete' && visitId) window.location.replace(accountPath('agenda'));
  }

  /** « Partager la visite » : le partage du navigateur, sinon le texte copié (ou montré, à copier à la main). */
  async function share(item: AgendaItem) {
    const text = visitShareText(item, visitDateLong);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast({ icon: 'check', text: 'Texte copié' });
    } catch {
      setNotice(text);
    }
  }

  const dialogs = (
    <>
      <ChoiceDialog open={notice !== null} title={notice ?? ''} onClose={() => setNotice(null)} dismissible={false}
        actions={[{ label: 'OK', onClick: () => setNotice(null), role: 'cancel' }]} />
      <IphoneOnlyDialog title={iphoneOnly} onClose={() => setIphoneOnly(null)} />
      <ChoiceDialog open={confirm?.kind === 'cancel'} title="Annuler cette visite ?" onClose={() => setConfirm(null)}
        message={confirm ? `${visitDateLong(confirm.item.start)}${confirm.item.contactName ? ` avec ${confirm.item.contactName}` : ''}.` : undefined}
        actions={[
          { label: 'Annuler la visite', onClick: () => void confirmed(), role: 'destructive' },
          { label: 'Garder la visite', onClick: () => setConfirm(null), role: 'cancel' },
        ]} />
      <ChoiceDialog open={confirm?.kind === 'delete'} title="Supprimer cette visite ?" onClose={() => setConfirm(null)}
        message="Elle disparaîtra définitivement de votre agenda."
        actions={[
          { label: 'Supprimer', onClick: () => void confirmed(), role: 'destructive' },
          { label: 'Garder', onClick: () => setConfirm(null), role: 'cancel' },
        ]} />
    </>
  );

  if (visitId) {
    // Détail d'une visite : l'attente de la première lecture, la coupure, puis la visite (ou « Visite supprimée »).
    const item = state.visits.find((visit) => visit.id.toLowerCase() === visitId.toLowerCase()) ?? null;
    const load = state.status === 'loading' || state.status === 'none' ? 'loading' : state.status === 'error' && state.visits.length === 0 && state.offline ? 'offline' : 'ready';
    return (
      <>
        <VisitDetail item={item} load={load} onRetry={() => void loadAgenda()} now={now}
          actions={{ ...handlers, contact: (visit) => void contact(visit), notice: setNotice, share: (visit) => void share(visit) }} />
        {dialogs}
      </>
    );
  }

  let content;
  if (state.status === 'loading' && state.visits.length === 0) {
    content = <Spinner label="Chargement des visites…" />;
  } else if (state.status === 'error' && state.visits.length === 0 && state.offline) {
    // Coupure de connexion : « Pas de connexion Internet », comme l'app (VisitsAgendaView).
    content = <OfflineState onRetry={() => void loadAgenda()} />;
  } else if (state.status === 'error' && state.visits.length === 0) {
    content = (
      <ContentUnavailable icon="triangleAlert" title="Visites indisponibles" text={AGENDA_LOAD_ERROR}>
        <button type="button" className="app-agenda-retry" onClick={() => void loadAgenda()}>Réessayer</button>
      </ContentUnavailable>
    );
  } else if (groups.length === 0 && sessions.length === 0) {
    // État vide seulement sans visite ni créneau ouvert à venir.
    content = (
      <>
        <ContentUnavailable icon="calendarBlank" title={EMPTY_TABS[tab].title} text={EMPTY_TABS[tab].message} />
        {addLink}
      </>
    );
  } else {
    content = (
      <div className="app-agenda-list">
        {sessions.length > 0 && (
          <section className="app-session-group" aria-label="Créneaux ouverts">
            <SectionLabel title="Créneaux ouverts" />
            {sessions.map((item) => <SessionCard key={item.id} session={item} onOpen={() => setIphoneOnly('Séance de visites')} />)}
          </section>
        )}
        {groups.map((group) => (
          <section key={group.period} className="app-visit-group" aria-label={PERIOD_TITLES[group.period]}>
            <SectionLabel title={PERIOD_TITLES[group.period]} />
            {group.items.map((item) => (
              <VisitCard key={item.id} item={item} now={now} slotCount={visitSlotCount(item, state.requests)}
                agencyName={item.listing ? agencies.get(item.listing.listingId.toLowerCase()) ?? null : null}
                onNotice={setNotice} handlers={handlers} onContact={(visit) => void contact(visit)} />
            ))}
          </section>
        ))}
        {addLink}
      </div>
    );
  }

  const tabs = <AgendaTabs tab={tab} counts={counts} onChange={setTab} />;
  return (
    <div className={desktop ? 'dsc app-agenda is-desktop' : 'app-agenda'}>
      {desktop ? (
        <>
          <ScreenHead title="Agenda des visites" subtitle="Toutes vos visites à venir et passées." />
          <div className="app-agenda-bar">{tabs}<AddVisitButton href={addPath} /></div>
        </>
      ) : (
        <>
          <div className="app-agenda-top">
            <RoundButton icon="arrowLeft" label="Retour" href={PATHS.account} />
            <AddVisitButton href={addPath} />
          </div>
          <LargeHeader className="app-agenda-header" title="Agenda des visites" subtitle="Toutes vos visites à venir et passées." />
          {tabs}
        </>
      )}
      <div className="app-agenda-panel" role="tabpanel" aria-label={TAB_TITLES[tab]}>{content}</div>
      {dialogs}
    </div>
  );
}
