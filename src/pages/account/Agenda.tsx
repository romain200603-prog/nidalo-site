import { useEffect, useRef, useState } from 'react';
import { ContentUnavailable } from '../../components/ContentUnavailable';
import { Icon } from '../../components/Icon';
import { LargeHeader } from '../../components/LargeHeader';
import { SectionLabel } from '../../components/MenuRows';
import { RoundButton } from '../../components/RoundButton';
import {
  acceptsReport, agendaItems, agendaStore, AGENDA_LOAD_ERROR, canContact, contactConversationId, countIn, directionsUrl, displayStatus,
  EMPTY_TABS, fetchAgencyNames, isRequestEntry, loadAgenda, PERIOD_TITLES, periodGroupsIn, routableAddress, shortStatusLabel, TAB_TITLES,
  visitCardTitle, visitDateBlock, visitPersonLine, visitSlotCount, visitTimeRange, type AgendaItem, type VisitDisplayStatus, type VisitTab,
} from '../../lib/account/agenda';
import { useSession, useStore } from '../../lib/account/session';
import { useDesktop } from '../../lib/desktop';
import { openListingConversation } from '../../lib/listing/conversation';
import { visitDateLong } from '../../lib/listing/visits';
import { accountPath, conversationPath, PATHS, visitRequestPath } from '../../lib/paths';
import { ActionMenu, ChoiceDialog, IphoneOnlyDialog, ScreenHead, type MenuItem } from './DesktopParts';
import { Spinner } from './parts';
import '../../styles/agenda-app.css';

// « Mon agenda », comme l'app (Features/Visits/VisitsAgendaView.swift) : sur téléphone, son écran (retour rond, « + »,
// grand titre, onglets sur la piste grise, visites groupées par période, cartes avec le bloc date) ; sur ordinateur, la
// mise en page du site (en-tête, onglets et « + » sur une ligne) avec ces pièces. Itinéraire (Plans), Message (la
// conversation liée, sinon une conversation avec le vendeur) et le menu « … ». Les visites viennent de agenda_visits,
// les demandes de visite pas encore acceptées de my_visit_requests (lib/account/agenda). Le détail d'une visite, ses
// modifications et le calendrier restent dans l'app iPhone ; une demande ouvre l'écran « Demande de visite ».

const TABS: VisitTab[] = ['upcoming', 'past', 'cancelled'];

const NO_ADDRESS = 'Adresse non renseignée : l\'itinéraire sera disponible quand le vendeur l\'aura communiquée.';
const NO_SELLER = 'Impossible de joindre le vendeur de ce bien pour l\'instant.';

/** Teinte du bloc date : gris annulée, ambre à confirmer ou en attente, bleu sinon (dateBlock). */
function dateTone(status: VisitDisplayStatus): string {
  if (status === 'cancelled') return 'gray';
  return status === 'toConfirm' || status === 'awaitingOther' ? 'amber' : 'blue';
}

/** Teinte de la pastille d'état : « Confirmée » vert, « À confirmer » et « En attente » ambre, « Annulée » rouge, « Terminée » gris. */
const PILL_TONES: Record<VisitDisplayStatus, string> = { confirmed: 'green', toConfirm: 'amber', awaitingOther: 'amber', cancelled: 'red', done: 'gray' };

/** Actions du menu « … » d'une visite enregistrée, dans l'ordre et aux conditions de l'app (VisitCard.menu). */
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
function VisitCard({ item, now, slotCount, agencyName, onNotice, onIphone, onContact }: {
  item: AgendaItem;
  now: Date;
  slotCount: number | null;
  agencyName: string | null;
  onNotice: (text: string) => void;
  onIphone: (title: string) => void;
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
        ) : address ? (
          <a className="app-visit-button is-soft app-visit-route" href={directionsUrl(address)} target="_blank" rel="noopener noreferrer">
            <Icon name="navigation" />Itinéraire
          </a>
        ) : (
          <button type="button" className="app-visit-button is-soft" onClick={() => onNotice(NO_ADDRESS)}>
            <Icon name="navigation" />Itinéraire
          </button>
        )}
        <button type="button" className="app-visit-button is-outline" disabled={!contactable} onClick={() => onContact(item)}>
          <Icon name="messageCircle" />Message
        </button>
        {!request && <ActionMenu label="Autres actions" items={menuItems(item, status, onIphone)} triggerClassName="dsc-menu-button app-visit-more" />}
      </div>
    </article>
  );
}

export function AgendaScreen() {
  const state = useStore(agendaStore);
  const session = useSession();
  const desktop = useDesktop();
  const me = session.status === 'signedIn' ? session.userId : null;
  const [tab, setTab] = useState<VisitTab>('upcoming');
  const [notice, setNotice] = useState<string | null>(null);
  const [iphoneOnly, setIphoneOnly] = useState<string | null>(null);
  const [agencies, setAgencies] = useState<Map<string, string>>(() => new Map());
  const asked = useRef(new Set<string>());

  useEffect(() => {
    void loadAgenda();
  }, []);

  // Agence qui publie chaque annonce visitée, lue une fois par annonce (VisitsAgendaView.loadAgencyNames).
  const listingIds = [...new Set(state.visits.flatMap((visit) => (visit.listing ? [visit.listing.listingId.toLowerCase()] : [])))].sort().join(',');
  useEffect(() => {
    const wanted = listingIds.split(',').filter((id) => id && !asked.current.has(id));
    if (!wanted.length) return;
    for (const id of wanted) asked.current.add(id);
    void fetchAgencyNames(wanted).then((found) => {
      if (found.size) setAgencies((current) => new Map([...current, ...found]));
    });
  }, [listingIds]);

  const now = new Date();
  const items = agendaItems(state, me, now);
  const groups = periodGroupsIn(items, tab, now);
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
    const conversation = await openListingConversation(item.listing.listingId, me);
    if (conversation) window.location.assign(conversationPath(conversation.id));
    else setNotice(NO_SELLER);
  }

  let content;
  if (state.status === 'loading' && state.visits.length === 0) {
    content = <Spinner label="Chargement des visites…" />;
  } else if (state.status === 'error' && state.visits.length === 0) {
    content = (
      <ContentUnavailable icon="triangleAlert" title="Visites indisponibles" text={AGENDA_LOAD_ERROR}>
        <button type="button" className="app-agenda-retry" onClick={() => void loadAgenda()}>Réessayer</button>
      </ContentUnavailable>
    );
  } else if (groups.length === 0) {
    content = (
      <>
        <ContentUnavailable icon="calendarBlank" title={EMPTY_TABS[tab].title} text={EMPTY_TABS[tab].message} />
        {addLink}
      </>
    );
  } else {
    content = (
      <div className="app-agenda-list">
        {groups.map((group) => (
          <section key={group.period} className="app-visit-group" aria-label={PERIOD_TITLES[group.period]}>
            <SectionLabel title={PERIOD_TITLES[group.period]} />
            {group.items.map((item) => (
              <VisitCard key={item.id} item={item} now={now} slotCount={visitSlotCount(item, state.requests)}
                agencyName={item.listing ? agencies.get(item.listing.listingId.toLowerCase()) ?? null : null}
                onNotice={setNotice} onIphone={setIphoneOnly} onContact={(visit) => void contact(visit)} />
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
      <ChoiceDialog open={notice !== null} title={notice ?? ''} onClose={() => setNotice(null)}
        actions={[{ label: 'OK', onClick: () => setNotice(null), tone: 'primary' }]} />
      <IphoneOnlyDialog title={iphoneOnly} onClose={() => setIphoneOnly(null)} />
    </div>
  );
}
