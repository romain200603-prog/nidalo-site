import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Icon } from '../../components/Icon';
import { HeartIcon } from '../../components/account/HeartButton';
import { toggleFavorite, useFavorites } from '../../lib/account/favorites';
import { requireAccount } from '../../lib/account/gate';
import { currentUserId, useSession } from '../../lib/account/session';
import { cardKind } from '../../lib/cardContent';
import { compareState, compareToast, toggleCompare, useCompare } from '../../lib/compare';
import { formatArea, formatPrice } from '../../lib/format';
import type { SearchMode } from '../../lib/labels';
import { listingConversation, openListingConversation, type ListingConversation } from '../../lib/listing/conversation';
import { hotelOf } from '../../lib/listing/fields';
import { canMakeOffer, offerStateLabel } from '../../lib/listing/offers';
import { FINANCING_OPTIONS, profitabilityFor, profitabilityView, STANDARD_CHOICE } from '../../lib/listing/profitability';
import { fetchActiveCount, fetchPublisher, type Publisher } from '../../lib/listing/publisher';
import {
  CATEGORY_LABELS, energyLetter, energyLines, featureRows, feesLabel, footnote, headerFacts, hotelActivity, priceSecondary,
  rentalRows, saleCondition,
} from '../../lib/listing/rows';
import { shareListing } from '../../lib/listing/share';
import {
  nextVisit, openRequest, REQUEST_STATUS_LABELS, requestDisplayStatus, VISIT_STATUS_LABELS, visitDateInline, visitDateLong,
  visitDisplayStatus, type AgendaVisit, type VisitRequestRow,
} from '../../lib/listing/visits';
import { placeLine, sortedPhotos, type ListingRow } from '../../lib/listings';
import {
  accountPath, comparePath, conversationPath, listingPath, listingScreenFromParams, visitRequestPath, type ListingScreen,
} from '../../lib/paths';
import { recordView } from '../../lib/recentlyViewed';
import { HotelSection, ProfitabilityCard, RentalCostCard } from './CategoryCards';
import { backTarget, coordinateOf, hotelPerformanceOf, rentalCostOf } from './data';
import { AlertDialog } from './Dialogs';
import { Gallery } from './Gallery';
import { ExtraIcon } from './icons';
import { LocationSection } from './Location';
import { OfferScreen } from './OfferScreen';
import { Avatar, Description, Energy, Features, Footnote, HotelActivity, PracticalInfo, PublisherCard } from './Sections';
import { useListingAccount } from './useListingAccount';
import { VisitRequestScreen } from './VisitRequestScreen';

// Fiche d'une annonce sur ordinateur (maquette 2 de Romain), avec les actions de l'app (ListingDetailView.swift) :
// en haut la catégorie, le titre, la ville et Partager · Enregistrer · Comparer ; la galerie ; à gauche le prix, les
// chiffres clés et les sections de l'app dans son ordre ; à droite, une colonne fixe avec l'état de l'offre, le
// vendeur, Envoyer un message · Demander une visite · Appeler et l'état de la visite. « Demander une visite » et
// « Faire une offre » ont leur propre adresse (&vue=visite, &vue=offre), dans une colonne de 640 px.

const sameId = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Chiffres du numéro gardés pour l'appel (« tel: »), comme l'app : les chiffres et le « + ». */
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

type Toast = { id: number; icon: 'check' | 'columns'; text: string; action: { label: string; href: string } | null; duration: number };

/** Fenêtre ouverte : sans numéro, ou une action qui reste dans l'app iPhone (sa propre annonce). */
type Notice = 'noPhone' | 'requests' | 'manage' | null;

const NOTICE_TITLES: Record<'requests' | 'manage', string> = { requests: 'Voir les demandes', manage: 'Gérer l\'annonce' };

export function DesktopListing({ row, mode }: { row: ListingRow; mode: SearchMode | null }) {
  const session = useSession();
  const me = session.status === 'signedIn' ? session.userId : null;
  // Sans compte, aucune annonce n'est « la mienne » (isOwnListing de l'app).
  const isOwn = sameId(row.owner_id, me);
  const { account, refreshOffers, refreshConversations, addRequest } = useListingAccount(isOwn ? null : me);
  const [publisher, setPublisher] = useState<Publisher | null>(null);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [choice, setChoice] = useState(STANDARD_CHOICE);
  const [toast, setToast] = useState<Toast | null>(null);
  const [copyLink, setCopyLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [opening, setOpening] = useState(false);
  const back = useMemo(backTarget, []);

  const kind = cardKind(row, mode);
  const photos = useMemo(() => sortedPhotos(row), [row]);
  const rentalCost = useMemo(() => (kind === 'rental' ? rentalCostOf(row) : null), [row, kind]);
  const hotel = useMemo(() => (rentalCost ? null : hotelPerformanceOf(row)), [row, rentalCost]);
  const profitability = useMemo(() => (kind !== 'rental' && !hotel ? profitabilityFor(row) : null), [row, kind, hotel]);
  const profitabilityCard = useMemo(() => (profitability ? profitabilityView(profitability, choice) : null), [profitability, choice]);
  const activity = useMemo(() => (hotelOf(row) && !hotel ? hotelActivity(row) : null), [row, hotel]);
  const place = placeLine(row);
  const price = Number(row.price);
  const livingArea = Number(row.living_area);
  const facts = headerFacts(row, kind);
  const secondary = priceSecondary(row);
  const condition = saleCondition(row);

  // ——— Écrans « Demander une visite » et « Faire une offre » (adresse de la fiche avec &vue=…) ———
  const [screen, setScreen] = useState<ListingScreen | null>(() => listingScreenFromParams(new URLSearchParams(window.location.search)));
  const [offerConversation, setOfferConversation] = useState<ListingConversation | null>(null);
  const screenRef = useRef(screen);
  /** L'écran a été ouvert depuis la fiche : « Fermer » revient en arrière dans l'historique. */
  const pushed = useRef(false);
  /** Position de la fiche quand un écran s'ouvre, retrouvée en le fermant. */
  const listingScroll = useRef(0);
  const resolving = useRef(false);
  const offersRef = useRef(account.offers);
  offersRef.current = account.offers;

  const setView = useCallback((next: ListingScreen | null) => {
    if (screenRef.current === null && next !== null) listingScroll.current = window.scrollY;
    screenRef.current = next;
    setScreen(next);
  }, []);

  const go = useCallback((next: ListingScreen | null, how: 'push' | 'replace') => {
    const url = listingPath(row.id, mode, next);
    if (how === 'push') {
      window.history.pushState(null, '', url);
      pushed.current = true;
    } else {
      window.history.replaceState(null, '', url);
    }
    setView(next);
  }, [row.id, mode, setView]);

  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
      return;
    }
    go(null, 'replace');
  }, [go]);

  useEffect(() => {
    const onPop = () => {
      pushed.current = false;
      const next = listingScreenFromParams(new URLSearchParams(window.location.search));
      // Revenir sur « Faire une offre » relit la conversation : une offre envoyée entre-temps l'interdit.
      if (next === 'offre') setOfferConversation(null);
      setView(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setView]);

  /**
   * « Faire une offre » (makeOffer de l'app) : la conversation de l'annonce (créée au besoin), puis la feuille d'offre ;
   * une offre déjà en attente ou acceptée ouvre la conversation, qui la montre.
   */
  const resolveOffer = useCallback(async (how: 'push' | 'replace') => {
    const userId = currentUserId();
    if (resolving.current) return;
    if (!userId || sameId(row.owner_id, userId) || row.transaction !== 'sale') {
      if (how === 'replace') go(null, 'replace');
      return;
    }
    resolving.current = true;
    setOpening(true);
    try {
      const conversation = await openListingConversation(row.id, userId);
      if (!conversation) {
        if (how === 'replace') go(null, 'replace');
        return;
      }
      // Les offres du compte, relues pour ne pas proposer une offre déjà en attente.
      const offers = (await refreshOffers()) ?? offersRef.current;
      if (canMakeOffer(conversation, offers, new Date())) {
        setOfferConversation(conversation);
        go('offre', how);
      } else {
        window.location.assign(conversationPath(conversation.id));
      }
    } finally {
      resolving.current = false;
      setOpening(false);
    }
  }, [row.id, row.owner_id, row.transaction, go, refreshOffers]);

  const showVisitForm = useCallback(() => {
    if (sameId(row.owner_id, currentUserId())) return;
    go('visite', 'push');
  }, [row.owner_id, go]);

  /** « Demander une visite » : connexion d'abord si besoin, puis le formulaire. */
  const requestVisit = () => void requireAccount(showVisitForm);
  const makeOffer = () => void requireAccount(() => void resolveOffer('push'));

  /** « Envoyer un message » : ouvre (ou crée) la conversation avec le vendeur, dans Messages. */
  const contactSeller = () => void requireAccount(() => {
    const userId = currentUserId();
    if (!userId || sameId(row.owner_id, userId)) return;
    setOpening(true);
    void openListingConversation(row.id, userId).then((conversation) => {
      if (conversation) window.location.assign(conversationPath(conversation.id));
      else setOpening(false);
    });
  });

  // Adresse d'un écran ouverte directement : sans compte, la connexion d'abord ; sa propre annonce (ou une location
  // pour l'offre) revient à la fiche ; « Faire une offre » retrouve d'abord la conversation.
  useEffect(() => {
    if (screen === null || session.status === 'loading') return;
    if (session.status === 'signedOut') {
      const wanted = screen;
      go(null, 'replace');
      void requireAccount(() => (wanted === 'visite' ? showVisitForm() : void resolveOffer('push')));
      return;
    }
    if (isOwn || (screen === 'offre' && row.transaction !== 'sale')) {
      go(null, 'replace');
      return;
    }
    if (screen === 'offre' && !offerConversation) void resolveOffer('replace');
  }, [screen, session.status, isOwn, offerConversation, row.transaction, go, resolveOffer, showVisitForm]);

  // Un autre compte : la feuille d'offre est relue pour lui.
  useEffect(() => { setOfferConversation(null); }, [me]);

  const shown: ListingScreen | null = me && !isOwn
    ? (screen === 'visite' ? 'visite' : screen === 'offre' && offerConversation ? 'offre' : null)
    : null;

  const firstLayout = useRef(true);
  useLayoutEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return;
    }
    window.scrollTo(0, shown ? 0 : listingScroll.current);
    // L'écran ouvert reçoit le focus sur son titre, sauf si un de ses champs l'a déjà (le montant de l'offre).
    const opened = shown ? document.querySelector<HTMLElement>('.dl-screen') : null;
    if (opened && !opened.contains(document.activeElement)) opened.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [shown]);

  useEffect(() => {
    document.title = shown === 'visite' ? `Demander une visite · ${row.title} · Nidalo`
      : shown === 'offre' ? `Faire une offre · ${row.title} · Nidalo`
        : `${row.title} à ${row.city} · Nidalo`;
  }, [row, shown]);

  // « Consultés récemment » de l'accueil : la fiche ouverte est notée dans l'onglet (recordView de l'app).
  useEffect(() => {
    recordView(row.id);
  }, [row.id]);

  // Le profil public est relu une fois la session connue : connecté, le serveur donne aussi le numéro de l'agence.
  const sessionKey = session.status === 'loading' ? null : (me ?? 'sans-compte');
  useEffect(() => {
    if (sessionKey === null) return;
    let cancelled = false;
    fetchPublisher(row.owner_id, row.created_at)
      .then((p) => { if (!cancelled) setPublisher(p); })
      .catch(() => { /* Sans profil lisible, la carte « Votre interlocuteur » ne s'affiche pas. */ });
    return () => { cancelled = true; };
  }, [row.owner_id, row.created_at, sessionKey]);

  useEffect(() => {
    let cancelled = false;
    fetchActiveCount(row.owner_id)
      .then((count) => { if (!cancelled) setActiveCount(count); })
      .catch(() => { /* Le nombre d'annonces est facultatif. */ });
    return () => { cancelled = true; };
  }, [row.owner_id]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.duration);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const share = useCallback(async () => {
    const outcome = await shareListing(row, mode);
    if (outcome === 'copied') setToast({ id: Date.now(), icon: 'check', text: 'Lien de l’annonce copié', action: null, duration: 2600 });
    else if (typeof outcome === 'object') setCopyLink(outcome.link);
  }, [row, mode]);

  /** « Comparer » (CompareButton de l'app) : ajoute ou retire le bien, puis le toast pendant 4 secondes. */
  const compare = () => {
    const message = compareToast(toggleCompare(row.id), compareState().ids.length);
    if (!message) return;
    setToast({
      id: Date.now(), icon: 'columns', text: message.text, duration: 4000,
      action: message.action ? { label: message.action, href: comparePath(mode) } : null,
    });
  };

  const onBack = (event: MouseEvent<HTMLAnchorElement>) => {
    if (back.fromSearch && window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  };

  // ——— État de l'offre et des visites (lus avec le compte) ———
  const now = new Date();
  const conversation = listingConversation(account.conversations, row.id, me);
  const offerLabel = offerStateLabel(account.offers, conversation, now);
  // « Faire une offre » : une vente d'un autre compte (canMakeOffer de la fiche).
  const offersPossible = !isOwn && row.transaction === 'sale';
  const upcoming = isOwn ? null : nextVisit(account.visits, row.id, now);
  const request = isOwn || upcoming ? null : openRequest(account.requests, row.id, me, now);
  const recipientName = publisher?.name ?? 'Le vendeur';

  if (shown === 'visite') {
    return (
      <div className="listing dl">
        <VisitRequestScreen row={row} photo={photos[0]} recipientName={recipientName} onClose={close} onSent={addRequest} />
      </div>
    );
  }
  if (shown === 'offre' && offerConversation) {
    return (
      <div className="listing dl">
        <OfferScreen
          conversationId={offerConversation.id}
          title={offerConversation.title ?? row.title}
          price={offerConversation.price ?? price}
          onClose={close}
          onSent={async () => {
            // Comme l'app (ListingDetailView.swift:165-176) : offres et conversations relues, puis la conversation de
            // l'offre s'ouvre dans Messages ; « Retour » ramène à la fiche, qui montre « Offre en attente ».
            await Promise.all([refreshOffers(), refreshConversations()]);
            window.location.replace(conversationPath(offerConversation.id));
          }}
        />
      </div>
    );
  }

  return (
    <div className="listing dl">
      <div className="dl-inner">
        <a className="listing-back-link dl-back" href={back.href} onClick={onBack}>
          <Icon name="chevronLeft" />
          {back.label}
        </a>
        <header className="dl-head">
          <div className="dl-head-text">
            <p className="dl-category">{CATEGORY_LABELS[kind]}</p>
            <h1 id="annonce-titre" className="dl-title">{row.title}</h1>
            <p className="dl-place"><Icon name="pin" />{place}</p>
          </div>
          <div className="dl-tools">
            <button type="button" className="dl-tool dl-share" onClick={() => void share()}>
              <ExtraIcon name="shareUp" />
              Partager
            </button>
            <SaveTool listingId={row.id} />
            <CompareTool listingId={row.id} onClick={compare} />
          </div>
        </header>
        <div className="dl-gallery">
          <Gallery photos={photos} onShare={() => void share()} listingId={row.id} back={{ href: back.href, label: back.label, onClick: onBack }} actions={false} />
        </div>

        <div className="dl-body">
          <div className="dl-main">
            <div className="dl-price">
              <p className="dl-price-line">
                <span className="dl-price-value">{formatPrice(price)}</span>
                {secondary && <span className="dl-price-secondary">{secondary}</span>}
              </p>
              {condition && <p className="dl-condition">{condition}</p>}
            </div>
            {facts.length > 0 && (
              <dl className="dl-facts" style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}>
                {facts.map((fact) => (
                  <div key={fact.caption} className="dl-fact">
                    <dt>{fact.caption}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {rentalCost && <RentalCostCard cost={rentalCost} />}
            {hotel && <HotelSection figures={hotel} />}
            {profitabilityCard && <ProfitabilityCard view={profitabilityCard} choice={choice} options={FINANCING_OPTIONS} onChange={setChoice} />}
            {!isOwn && <VisitCard upcoming={upcoming} request={request} now={now} />}
            {kind === 'rental' && <PracticalInfo rows={rentalRows(row, true)} />}
            {activity && <HotelActivity rows={activity.rows} showsNote={activity.showsNote} />}
            {row.description?.trim() && <Description text={row.description.trim()} />}
            <Features rows={featureRows(row)} />
            {publisher && <PublisherCard publisher={publisher} fees={feesLabel(row)} activeCount={activeCount} onContact={isOwn ? undefined : contactSeller} />}
            <Energy energyClass={energyLetter(row.energy_class)} climateClass={energyLetter(row.climate_class)} lines={energyLines(row)} />
            <LocationSection
              coordinate={coordinateOf(row)}
              isApproximate={row.location_precision !== 'exact'}
              place={place}
              card={{
                photo: photos[0],
                price: formatPrice(price) + (row.transaction === 'rent' ? '/mois' : ''),
                title: row.title,
                subtitle: [row.city, livingArea > 0 ? formatArea(livingArea) : null].filter(Boolean).join(' · '),
              }}
            />
            <Footnote text={footnote(row)} />
          </div>

          <aside className="dl-aside" aria-label="Contact et visite">
            <div className="dl-aside-card">
              {offersPossible && (offerLabel && conversation ? (
                <a className="dl-pill dl-offer" href={conversationPath(conversation.id)}>
                  <Icon name="handshake" />
                  {offerLabel}
                </a>
              ) : (
                <button type="button" className="dl-pill dl-offer" onClick={makeOffer} disabled={opening}>
                  <Icon name="handshake" />
                  Faire une offre
                </button>
              ))}
              {publisher && <SellerRow publisher={publisher} />}
              <div className="dl-actions">
                {isOwn ? (
                  <>
                    <button type="button" className="dl-button dl-button-light" onClick={() => setNotice('requests')}>
                      <Icon name="calendarCheck" />
                      Voir les demandes
                    </button>
                    <button type="button" className="dl-button dl-button-filled" onClick={() => setNotice('manage')}>
                      <Icon name="pen" />
                      Gérer l'annonce
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="dl-button dl-button-filled dl-message" onClick={contactSeller} disabled={opening}>
                      <Icon name="messageCircle" />
                      Envoyer un message
                    </button>
                    <button type="button" className="dl-button dl-button-light dl-visit" onClick={requestVisit}>
                      <Icon name="calendarPlus" />
                      Demander une visite
                    </button>
                    {publisher?.phone?.trim() ? (
                      <a className="dl-button dl-button-white dl-call" href={telHref(publisher.phone)} title={`Appeler le ${publisher.phone}`}>
                        <Icon name="phone" />
                        Appeler
                      </a>
                    ) : (
                      <button type="button" className="dl-button dl-button-white dl-call" onClick={() => setNotice('noPhone')}>
                        <Icon name="phone" />
                        Appeler
                      </button>
                    )}
                  </>
                )}
              </div>
              {upcoming && <VisitPill upcoming={upcoming} now={now} />}
              {request && (
                // Comme la confirmation de l'app : « Demande envoyée » et son statut (la carte de gauche donne le détail).
                <a className="dl-pill-wide" href={visitRequestPath(request.id)}>
                  <Icon name="clock" />
                  <span>Demande envoyée · {REQUEST_STATUS_LABELS[requestDisplayStatus(request, now)]}</span>
                </a>
              )}
            </div>
          </aside>
        </div>
      </div>

      <AlertDialog
        open={notice === 'noPhone'}
        onClose={() => setNotice(null)}
        title="Numéro non disponible"
        message="Ce vendeur ne communique pas son numéro. Écrivez-lui sur Nidalo."
        actions={[
          { label: 'Envoyer un message', onClick: () => { setNotice(null); contactSeller(); }, tone: 'primary' },
          { label: 'Fermer', onClick: () => setNotice(null), tone: 'quiet' },
        ]}
      />
      <AlertDialog
        open={notice === 'requests' || notice === 'manage'}
        onClose={() => setNotice(null)}
        title={notice === 'manage' ? NOTICE_TITLES.manage : NOTICE_TITLES.requests}
        message="Dans l’app iPhone pour l’instant."
        actions={[{ label: 'Fermer', onClick: () => setNotice(null), tone: 'primary' }]}
      />
      <AlertDialog
        open={copyLink !== null}
        onClose={() => setCopyLink(null)}
        title="Partager l’annonce"
        message="Copiez ce lien pour partager l’annonce."
        actions={[{ label: 'Fermer', onClick: () => setCopyLink(null), tone: 'primary' }]}
      >
        <input className="copy-link" type="url" readOnly value={copyLink ?? ''} aria-label="Lien de l’annonce" onFocus={(event) => event.currentTarget.select()} autoFocus />
      </AlertDialog>
      <div className={`dl-toast${toast ? ' is-shown' : ''}`} role="status" aria-live="polite">
        {toast && (
          <span key={toast.id} className="dl-toast-box">
            <Icon name={toast.icon} />
            <span className="dl-toast-text">{toast.text}</span>
            {toast.action && <a href={toast.action.href}>{toast.action.label}</a>}
          </span>
        )}
      </div>
    </div>
  );
}

/** « Enregistrer » : le favori de l'app (ajouter demande un compte, retirer jamais). */
function SaveTool({ listingId }: { listingId: string }) {
  const favorites = useFavorites();
  const active = favorites.items.some((item) => item.listing_id === listingId);
  return (
    <button
      type="button"
      className={`dl-tool dl-save${active ? ' is-active' : ''}`}
      aria-pressed={active}
      title={active ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      onClick={() => toggleFavorite(listingId)}
    >
      <HeartIcon filled={active} />
      Enregistrer
    </button>
  );
}

/** « Comparer » : dans la comparaison de l'onglet (trois biens au plus). */
function CompareTool({ listingId, onClick }: { listingId: string; onClick: () => void }) {
  const active = useCompare().ids.includes(listingId);
  return (
    <button
      type="button"
      className={`dl-tool dl-compare${active ? ' is-active' : ''}`}
      aria-pressed={active}
      title={active ? 'Retirer de la comparaison' : 'Ajouter à la comparaison'}
      onClick={onClick}
    >
      <Icon name="columns" />
      Comparer
    </button>
  );
}

/** Vendeur ou agence en tête de la colonne de droite : photo, nom, badge et sa première ligne (« Votre contact… »). */
function SellerRow({ publisher }: { publisher: Publisher }) {
  return (
    <div className="dl-seller">
      <Avatar publisher={publisher} />
      <span className="dl-seller-text">
        <span className="dl-seller-name">
          <span>{publisher.name}</span>
          <span className={`publisher-badge${publisher.isProfessional ? ' pro' : ''}`}>{publisher.isProfessional ? 'PRO' : 'Particulier'}</span>
        </span>
        {publisher.lines[0] && <span className="dl-seller-line">{publisher.lines[0]}</span>}
      </span>
    </div>
  );
}

/** Prochaine visite du bien, sous les boutons : « Visite confirmée · jeu. 19 juin, 18h00 ». */
function VisitPill({ upcoming, now }: { upcoming: AgendaVisit; now: Date }) {
  const status = visitDisplayStatus(upcoming, now);
  return (
    <a className={`dl-pill-wide${status === 'confirmed' ? ' is-confirmed' : ''}`} href={accountPath('bientot', { ecran: 'agenda' })}>
      <Icon name="calendarCheck" />
      <span>{VISIT_STATUS_LABELS[status]} · {visitDateInline(upcoming.start)}</span>
    </a>
  );
}

/**
 * Carte « Visite » de l'app (agendaCard) : le prochain rendez-vous du bien, sinon la demande en cours, sinon « Aucune
 * visite prévue ». L'agenda et le détail d'une demande ne sont pas encore sur le site (écran « bientôt »).
 */
function VisitCard({ upcoming, request, now }: { upcoming: AgendaVisit | null; request: VisitRequestRow | null; now: Date }) {
  const icon = <span className="dl-visit-icon" aria-hidden="true"><ExtraIcon name="calendar" /></span>;
  if (upcoming) {
    return (
      <section className="dl-visit-card" aria-label="Visites">
        {icon}
        <span className="dl-visit-text">
          <span className="dl-visit-title">{visitDateLong(upcoming.start)}</span>
          <span className="dl-visit-subtitle">Visite prévue · {VISIT_STATUS_LABELS[visitDisplayStatus(upcoming, now)]}</span>
        </span>
        <a className="dl-visit-agenda" href={accountPath('bientot', { ecran: 'agenda' })} aria-label="Ouvrir l'agenda des visites">Agenda</a>
      </section>
    );
  }
  if (request) {
    return (
      <a className="dl-visit-card is-link" href={visitRequestPath(request.id)} aria-label={`Demande de visite envoyée, ${REQUEST_STATUS_LABELS[requestDisplayStatus(request, now)]}. Ouvre votre demande`}>
        {icon}
        <span className="dl-visit-text">
          <span className="dl-visit-title">Demande de visite envoyée</span>
          <span className="dl-visit-subtitle">{REQUEST_STATUS_LABELS[requestDisplayStatus(request, now)]} · {request.recipient.name}</span>
        </span>
        <Icon name="chevronRight" className="icon dl-visit-chevron" />
      </a>
    );
  }
  return (
    <section className="dl-visit-card" aria-label="Visites">
      {icon}
      <span className="dl-visit-text">
        <span className="dl-visit-title">Aucune visite prévue</span>
        <span className="dl-visit-subtitle">Demandez une visite au vendeur ou à l'agence.</span>
      </span>
    </section>
  );
}
