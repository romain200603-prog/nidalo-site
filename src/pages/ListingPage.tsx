import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { cardKind } from '../lib/cardContent';
import { useDesktop } from '../lib/desktop';
import { formatArea, formatPrice } from '../lib/format';
import { fetchListing, ListingNotFound, placeLine, sortedPhotos, UUID_PATTERN, type ListingRow } from '../lib/listings';
import { listingConversation } from '../lib/listing/conversation';
import { hotelOf } from '../lib/listing/fields';
import { offerStateLabel } from '../lib/listing/offers';
import { FINANCING_OPTIONS, profitabilityFor, profitabilityView, STANDARD_CHOICE } from '../lib/listing/profitability';
import { fetchActiveCount, fetchPublisher, type Publisher } from '../lib/listing/publisher';
import {
  CATEGORY_LABELS, energyLetter, energyLines, featureRows, feesLabel, footnote, headerFacts, hotelActivity, priceFeesNote, priceSecondary,
  rentalRows, saleCondition,
} from '../lib/listing/rows';
import { shareListing } from '../lib/listing/share';
import { nextVisit, openRequest } from '../lib/listing/visits';
import { countListingView } from '../lib/listing/views';
import { telHref } from '../lib/messages/format';
import { conversationPath, listingModeFromParams, PATHS } from '../lib/paths';
import { recordView } from '../lib/recentlyViewed';
import type { SearchMode } from '../lib/labels';
import { ActionBar } from './listing/ActionBar';
import { HotelSection, ProfitabilityCard, RentalCostCard } from './listing/CategoryCards';
import { backTarget, coordinateOf, hotelPerformanceOf, rentalCostOf } from './listing/data';
import { DesktopListing } from './listing/DesktopListing';
import { AlertDialog, NoPhoneDialog } from './listing/Dialogs';
import { Gallery } from './listing/Gallery';
import { LocationSection } from './listing/Location';
import { Description, Energy, Features, Footnote, HotelActivity, PracticalInfo, PublisherCard, RiskNote } from './listing/Sections';
import { HeaderCard, VisitCard } from './listing/TopCards';
import { useListingScreens } from './listing/useListingScreens';

// Fiche d'une annonce (ListingDetailView.swift). Téléphone : mêmes sections, dans le même ordre ; écrire au vendeur,
// demander une visite et faire une offre comme sur ordinateur (useListingScreens), les deux écrans à leur propre
// adresse (&vue=visite, &vue=offre) ; en bas, la barre de contact « Duo » (ou la barre blanche de sa propre annonce),
// et la visite se demande sur la carte « Aucune visite prévue ». Ordinateur (≥ 1024 px) : DesktopListing.

type State = { status: 'loading' } | { status: 'notFound' } | { status: 'error' } | { status: 'ready'; row: ListingRow };

type Notice = 'noPhone' | 'requests' | 'manage' | null;

function ListingView({ row, mode }: { row: ListingRow; mode: SearchMode | null }) {
  // Écrire, visiter, faire une offre : communs avec l'ordinateur (useListingScreens).
  const { session, me, isOwn, account, opening, renderScreen, requestVisit, makeOffer, contactSeller, conversationAlert } = useListingScreens(row, mode);
  const [notice, setNotice] = useState<Notice>(null);
  const [publisher, setPublisher] = useState<Publisher | null>(null);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [choice, setChoice] = useState(STANDARD_CHOICE);
  const [toast, setToast] = useState<string | null>(null);
  const [copyLink, setCopyLink] = useState<string | null>(null);
  const back = useMemo(backTarget, []);
  /** L'arrivée de la barre Duo est jouée : une fois par ouverture de la fiche, pas au retour d'un de ses écrans. */
  const arrived = useRef(false);
  const isRental = row.transaction === 'rent';

  const kind = cardKind(row, mode);
  const photos = useMemo(() => sortedPhotos(row), [row]);
  const rentalCost = useMemo(() => (kind === 'rental' ? rentalCostOf(row) : null), [row, kind]);
  const hotel = useMemo(() => (rentalCost ? null : hotelPerformanceOf(row)), [row, rentalCost]);
  const profitability = useMemo(() => (kind !== 'rental' && !hotel ? profitabilityFor(row) : null), [row, kind, hotel]);
  const profitabilityCard = useMemo(() => (profitability ? profitabilityView(profitability, choice) : null), [profitability, choice]);
  const activity = useMemo(() => (hotelOf(row) && !hotel ? hotelActivity(row) : null), [row, hotel]);
  const place = placeLine(row);
  const isApproximate = row.location_precision !== 'exact';
  const price = Number(row.price);
  const livingArea = Number(row.living_area);

  // « Consultés récemment » de l'accueil : la fiche ouverte est notée dans l'onglet (recordView de l'app). Et une vue
  // pour les statistiques de son auteur, une fois par jour.
  useEffect(() => {
    recordView(row.id);
    countListingView(row.id);
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
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /** Partage du navigateur (texte de l'app et lien de la page) ; sinon le lien est copié. */
  const share = useCallback(async () => {
    const outcome = await shareListing(row, mode);
    if (outcome === 'copied') setToast('Lien de l’annonce copié');
    else if (typeof outcome === 'object') setCopyLink(outcome.link);
  }, [row, mode]);

  const onBack = (event: MouseEvent<HTMLAnchorElement>) => {
    if (back.fromSearch && window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  };

  // « Appeler » : le numéro du vendeur s'il le communique (connecté), sinon la fenêtre « Numéro non disponible ».
  const phone = publisher?.phone?.trim();

  const fees = feesLabel(row);

  // ——— État de l'offre et des visites (lus avec le compte), comme sur ordinateur ———
  const now = new Date();
  const conversation = listingConversation(account.conversations, row.id, me);
  const offerLabel = offerStateLabel(account.offers, conversation, now);
  const upcoming = isOwn ? null : nextVisit(account.visits, row.id, now);
  const request = isOwn || upcoming ? null : openRequest(account.requests, row.id, me, now);

  // « Demander une visite » ou « Faire une offre » ouvert : l'écran seul, à la place de la fiche.
  const opened = renderScreen({ photo: photos[0], recipientName: publisher?.name ?? (isRental ? 'Le propriétaire' : 'Le vendeur'), profitability });
  if (opened) return <div className="listing listing-screen">{opened}</div>;

  return (
    <div className="listing">
      <div className="wrap listing-top">
        <a className="listing-back-link" href={back.href} onClick={onBack}>
          <Icon name="chevronLeft" />
          {back.label}
        </a>
      </div>
      <div className="listing-gallery-wrap">
        <Gallery photos={photos} onShare={share} listingId={row.id} back={{ href: back.href, label: back.label, onClick: onBack }} />
      </div>
      <div className="wrap listing-body">
        <div className="listing-aside">
          <div className="listing-aside-inner">
            <HeaderCard
              category={CATEGORY_LABELS[kind]}
              price={formatPrice(price)}
              priceSecondary={priceSecondary(row)}
              priceNote={priceFeesNote(row)}
              condition={saleCondition(row)}
              title={row.title}
              location={place}
              facts={headerFacts(row, kind)}
              onOffer={!isOwn && row.transaction === 'sale' ? makeOffer : null}
              offerState={offerLabel && conversation ? { label: offerLabel, href: conversationPath(conversation.id) } : null}
              offerBusy={opening}
            />
            <ActionBar
              onMessage={contactSeller}
              onCall={() => setNotice('noPhone')}
              callHref={phone ? telHref(phone) : null}
              busy={opening}
              isRental={isRental}
              playsArrival={!arrived.current}
              onArrived={() => { arrived.current = true; }}
              owner={isOwn ? { onRequests: () => setNotice('requests'), onManage: () => setNotice('manage') } : null}
            />
            {!isOwn && <VisitCard upcoming={upcoming} request={request} now={now} isRental={isRental} onRequest={requestVisit} />}
          </div>
        </div>
        <div className="listing-main">
          {(rentalCost || hotel || profitabilityCard) && (
            <div className="listing-category">
              {rentalCost && <RentalCostCard cost={rentalCost} />}
              {hotel && <HotelSection figures={hotel} />}
              {profitabilityCard && <ProfitabilityCard view={profitabilityCard} choice={choice} options={FINANCING_OPTIONS} onChange={setChoice} />}
            </div>
          )}
          {kind === 'rental' && <PracticalInfo rows={rentalRows(row, true)} />}
          {activity && <HotelActivity rows={activity.rows} showsNote={activity.showsNote} />}
          {row.description?.trim() && <Description text={row.description.trim()} />}
          <Features rows={featureRows(row)} />
          {publisher && <PublisherCard publisher={publisher} fees={fees} activeCount={activeCount} onContact={isOwn ? undefined : contactSeller} isRental={isRental} />}
          <Energy energyClass={energyLetter(row.energy_class)} climateClass={energyLetter(row.climate_class)} lines={energyLines(row)} />
          <LocationSection
            coordinate={coordinateOf(row)}
            isApproximate={isApproximate}
            place={place}
            card={{
              photo: photos[0],
              price: formatPrice(price) + (row.transaction === 'rent' ? '/mois' : ''),
              title: row.title,
              subtitle: [row.city, livingArea > 0 ? formatArea(livingArea) : null].filter(Boolean).join(' · '),
            }}
            isRental={isRental}
          />
          <RiskNote />
          <Footnote text={footnote(row)} />
        </div>
      </div>

      <NoPhoneDialog open={notice === 'noPhone'} onClose={() => setNotice(null)} onMessage={() => { setNotice(null); contactSeller(); }} isRental={isRental} />
      {conversationAlert}
      <AlertDialog
        open={notice === 'requests' || notice === 'manage'}
        onClose={() => setNotice(null)}
        dismissible={false}
        title={notice === 'manage' ? 'Gérer l\'annonce' : 'Voir les demandes'}
        message="Dans l’app iPhone pour l’instant."
        actions={[{ label: 'Fermer', onClick: () => setNotice(null), tone: 'primary' }]}
      />
      <AlertDialog
        open={copyLink !== null}
        onClose={() => setCopyLink(null)}
        dismissible={false}
        title="Partager l’annonce"
        message="Copiez ce lien pour partager l’annonce."
        actions={[{ label: 'Fermer', onClick: () => setCopyLink(null), tone: 'primary' }]}
      >
        <input className="copy-link" type="url" readOnly value={copyLink ?? ''} aria-label="Lien de l’annonce" onFocus={(event) => event.currentTarget.select()} autoFocus />
      </AlertDialog>
      <p className={`listing-toast${toast ? ' is-shown' : ''}`} role="status" aria-live="polite">
        {toast && <><Icon name="check" />{toast}</>}
      </p>
    </div>
  );
}

function Loading() {
  return (
    <div className="listing listing-loading" aria-busy="true">
      <div className="listing-gallery-wrap">
        <div className="gallery gallery-skeleton skeleton" />
      </div>
      <div className="wrap listing-body">
        <div className="listing-aside">
          <div className="listing-aside-inner">
            <div className="top-card header-card skeleton-card-block">
              <span className="skeleton line short" />
              <span className="skeleton line wide" />
              <span className="skeleton line" />
              <span className="skeleton line short" />
            </div>
          </div>
        </div>
        <div className="listing-main" />
      </div>
      <p className="visually-hidden" role="status">Chargement de l’annonce…</p>
    </div>
  );
}

export function ListingPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const id = params.get('id') ?? '';
  const mode = listingModeFromParams(params);
  const desktop = useDesktop();
  const [state, setState] = useState<State>(() => (UUID_PATTERN.test(id) ? { status: 'loading' } : { status: 'notFound' }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!UUID_PATTERN.test(id)) return;
    let cancelled = false;
    setState({ status: 'loading' });
    fetchListing(id)
      .then((row) => { if (!cancelled) setState({ status: 'ready', row }); })
      .catch((error) => { if (!cancelled) setState({ status: error instanceof ListingNotFound ? 'notFound' : 'error' }); });
    return () => { cancelled = true; };
  }, [id, attempt]);

  useEffect(() => {
    if (state.status === 'notFound') document.title = 'Annonce introuvable · Nidalo';
    if (state.status === 'error') document.title = 'Annonce indisponible · Nidalo';
  }, [state.status]);

  // Fiche ouverte (ou un de ses écrans) : la barre du bas de l'app est masquée (hidesTabBar), place à la barre d'actions.
  const ready = state.status === 'ready';
  useEffect(() => {
    document.body.classList.toggle('page-listing-ready', ready);
  }, [ready]);

  // Annonce introuvable ou indisponible, sur téléphone : retour et titre en haut, comme un écran poussé.
  const stateTitle = state.status === 'notFound' ? 'Annonce introuvable' : state.status === 'error' ? 'Annonce indisponible' : null;
  return (
    <Page section="search" phoneHeader={stateTitle ? { title: stateTitle, back: PATHS.search } : undefined}>
      {state.status === 'ready' && (desktop ? <DesktopListing row={state.row} mode={mode} /> : <ListingView row={state.row} mode={mode} />)}
      {state.status === 'loading' && <Loading />}
      {state.status === 'notFound' && (
        <div className="wrap">
          <div className="card state listing-state">
            <Icon name="search" />
            <h1>Annonce introuvable</h1>
            <p>Cette annonce n’existe pas ou n’est plus en ligne.</p>
            <a className="btn btn-primary" href={PATHS.search}>Chercher un bien</a>
          </div>
        </div>
      )}
      {state.status === 'error' && (
        <div className="wrap">
          <div className="card state listing-state">
            <Icon name="triangleAlert" />
            <h1>Annonce indisponible</h1>
            <p>Impossible de charger cette annonce. Réessayez dans un instant.</p>
            <button type="button" className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>Réessayer</button>
          </div>
        </div>
      )}
    </Page>
  );
}
