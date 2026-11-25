import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { showToast } from '../../components/AppToast';
import { Icon } from '../../components/Icon';
import { HeartIcon } from '../../components/account/HeartButton';
import { toggleFavorite, useFavorites } from '../../lib/account/favorites';
import { requireAccount } from '../../lib/account/gate';
import { cardKind } from '../../lib/cardContent';
import { useCompare } from '../../lib/compare';
import { formatArea, formatPrice } from '../../lib/format';
import type { SearchMode } from '../../lib/labels';
import { listingConversation } from '../../lib/listing/conversation';
import { hotelOf } from '../../lib/listing/fields';
import { offerStateLabel } from '../../lib/listing/offers';
import { FINANCING_OPTIONS, profitabilityFor, profitabilityView, STANDARD_CHOICE } from '../../lib/listing/profitability';
import { fetchActiveCount, fetchPublisher, type Publisher } from '../../lib/listing/publisher';
import {
  CATEGORY_LABELS, energyLetter, energyLines, featureRows, feesLabel, footnote, headerFacts, hotelActivity, priceFeesNote, priceSecondary,
  rentalRows, saleCondition,
} from '../../lib/listing/rows';
import { shareListing } from '../../lib/listing/share';
import {
  nextVisit, openRequest, REQUEST_STATUS_LABELS, requestDisplayStatus, VISIT_STATUS_LABELS, visitDateInline, visitDateLong,
  visitDisplayStatus, type AgendaVisit, type VisitRequestRow,
} from '../../lib/listing/visits';
import { countListingView } from '../../lib/listing/views';
import { placeLine, sortedPhotos, type ListingRow } from '../../lib/listings';
import { accountPath, conversationPath, publishPath, visitRequestPath } from '../../lib/paths';
import { recordView } from '../../lib/recentlyViewed';
import { HotelSection, ProfitabilityCard, RentalCostCard } from './CategoryCards';
import { ContactCapsules } from './ContactBar';
import { backTarget, coordinateOf, hotelPerformanceOf, rentalCostOf, toggleListingCompare } from './data';
import { AlertDialog } from './Dialogs';
import { Gallery } from './Gallery';
import { ExtraIcon } from './icons';
import { LocationSection } from './Location';
import { ReportListingSheet } from './ReportSheet';
import { Avatar, Description, Energy, Features, Footnote, HotelActivity, PracticalInfo, PublisherCard, ReportRow } from './Sections';
import { useListingScreens } from './useListingScreens';

// Fiche d'une annonce sur ordinateur (maquette 2 de Romain), avec les actions de l'app (ListingDetailView.swift) :
// en haut la catégorie, le titre, la ville et Partager · Enregistrer · Comparer ; la galerie ; à gauche le prix, les
// chiffres clés et les sections de l'app dans son ordre ; à droite, une colonne fixe avec l'état de l'offre, le
// vendeur, les capsules « Appeler » et « Envoyer un message » de la barre Duo de l'app, côte à côte, et l'état de la
// visite. La visite se demande avec « Demander » sur la carte « Aucune visite prévue », comme dans l'app. « Demander
// une visite » et « Faire une offre » ont leur propre adresse (&vue=visite, &vue=offre), dans une colonne de 640 px.

/** Chiffres du numéro gardés pour l'appel (« tel: »), comme l'app : les chiffres et le « + ». */
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** Fenêtre ouverte : sans numéro, ou une action qui reste dans l'app iPhone (sa propre annonce). */
type Notice = 'noPhone' | 'requests' | null;

export function DesktopListing({ row, mode }: { row: ListingRow; mode: SearchMode | null }) {
  // Écrire, visiter, faire une offre : communs avec le téléphone (useListingScreens).
  const { session, me, isOwn, account, opening, renderScreen, requestVisit, makeOffer, contactSeller, openProfile, conversationAlert } = useListingScreens(row, mode);
  const [publisher, setPublisher] = useState<Publisher | null>(null);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [choice, setChoice] = useState(STANDARD_CHOICE);
  const [copyLink, setCopyLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [reporting, setReporting] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
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
  const priceNote = priceFeesNote(row);
  const condition = saleCondition(row);

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

  const share = useCallback(async () => {
    const outcome = await shareListing(row, mode);
    if (outcome === 'copied') showToast({ icon: 'check', text: 'Lien de l’annonce copié' });
    else if (typeof outcome === 'object') setCopyLink(outcome.link);
  }, [row, mode]);

  /** « Comparer » (CompareButton de l'app) : ajoute ou retire le bien, puis le message du bas pendant 4 secondes. */
  const compare = () => toggleListingCompare(row.id, mode);

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
  const isRental = row.transaction === 'rent';
  const recipientName = publisher?.name ?? (isRental ? 'Le propriétaire' : 'Le vendeur');
  const phone = publisher?.phone?.trim();

  const opened = renderScreen({ photo: photos[0], recipientName, profitability, publisher });
  if (opened) return <div className="listing dl">{opened}</div>;

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
          <Gallery photos={photos} propertyType={row.property_type} onShare={() => void share()} listingId={row.id}
            back={{ href: back.href, label: back.label, onClick: onBack }} actions={false} />
        </div>

        <div className="dl-body">
          <div className="dl-main">
            <div className="dl-price">
              <p className="dl-price-line">
                <span className="dl-price-value">{formatPrice(price)}</span>
                {secondary && <span className="dl-price-secondary">{secondary}</span>}
              </p>
              {priceNote && <p className="dl-price-note">{priceNote}</p>}
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
            {!isOwn && <VisitCard upcoming={upcoming} request={request} now={now} isRental={isRental} onRequest={requestVisit} />}
            {kind === 'rental' && <PracticalInfo rows={rentalRows(row, true)} />}
            {activity && <HotelActivity rows={activity.rows} showsNote={activity.showsNote} />}
            {row.description?.trim() && <Description text={row.description.trim()} />}
            <Features rows={featureRows(row)} />
            {publisher && (
              <PublisherCard publisher={publisher} fees={feesLabel(row)} activeCount={activeCount} onOpenProfile={openProfile}
                onContact={isOwn ? undefined : contactSeller} isRental={isRental} />
            )}
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
              isRental={isRental}
            />
            <Footnote text={footnote(row)} />
            {!isOwn && <ReportRow onClick={() => void requireAccount(() => setReporting(true))} />}
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
              {isOwn ? (
                <div className="dl-actions">
                  <button type="button" className="dl-button dl-button-light" onClick={() => setNotice('requests')}>
                    <Icon name="calendarCheck" />
                    Voir les demandes
                  </button>
                  <a className="dl-button dl-button-filled" href={publishPath(row.id)}>
                    <Icon name="pen" />
                    Gérer l'annonce
                  </a>
                </div>
              ) : (
                // Les capsules de la barre Duo, sans l'arrivée ni le repli au défilement (la colonne ne flotte pas).
                <div className="dl-actions dl-contact" aria-label="Contacter" role="group">
                  <ContactCapsules
                    floating={false}
                    onCall={() => setNotice('noPhone')}
                    callHref={phone ? telHref(phone) : null}
                    callTitle={phone ? `Appeler le ${phone}` : undefined}
                    onMessage={contactSeller}
                    opening={opening}
                    isRental={isRental}
                  />
                </div>
              )}
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
        dismissible={false}
        title="Numéro non disponible"
        message={`Ce ${isRental ? 'propriétaire' : 'vendeur'} ne communique pas son numéro. Écrivez-lui sur Nidalo.`}
        actions={[
          { label: 'Envoyer un message', onClick: () => { setNotice(null); contactSeller(); } },
          { label: 'Fermer', onClick: () => setNotice(null), role: 'cancel' },
        ]}
      />
      {conversationAlert}
      <AlertDialog
        open={notice === 'requests'}
        onClose={() => setNotice(null)}
        dismissible={false}
        title="Voir les demandes"
        message="Dans l’app iPhone pour l’instant."
        actions={[{ label: 'Fermer', onClick: () => setNotice(null), role: 'cancel' }]}
      />
      <ReportListingSheet open={reporting} listingId={row.id} onClose={() => setReporting(false)}
        onSent={(text) => { setReporting(false); setReportNotice(text); }} />
      <AlertDialog
        open={reportNotice !== null}
        onClose={() => setReportNotice(null)}
        dismissible={false}
        title={reportNotice ?? ''}
        actions={[{ label: 'OK', onClick: () => setReportNotice(null), role: 'cancel' }]}
      />
      <AlertDialog
        open={copyLink !== null}
        onClose={() => setCopyLink(null)}
        dismissible={false}
        title="Partager l’annonce"
        message="Copiez ce lien pour partager l’annonce."
        actions={[{ label: 'Fermer', onClick: () => setCopyLink(null), role: 'cancel' }]}
      >
        <input className="copy-link" type="url" readOnly value={copyLink ?? ''} aria-label="Lien de l’annonce" onFocus={(event) => event.currentTarget.select()} autoFocus />
      </AlertDialog>
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
      <HeartIcon filled={active} ready={favorites.status === 'ready'} />
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
    <a className={`dl-pill-wide${status === 'confirmed' ? ' is-confirmed' : ''}`} href={accountPath('agenda')}>
      <Icon name="calendarCheck" />
      <span>{VISIT_STATUS_LABELS[status]} · {visitDateInline(upcoming.start)}</span>
    </a>
  );
}

/**
 * Carte « Visite » de l'app (agendaCard) : le prochain rendez-vous du bien, sinon la demande en cours, sinon « Aucune
 * visite prévue » avec la pastille « Demander » (la demande de visite, connexion d'abord si besoin). « Agenda » ouvre
 * Mon agenda ; le détail d'une demande n'est pas encore sur le site (écran « bientôt »).
 */
function VisitCard({ upcoming, request, now, isRental, onRequest }: {
  upcoming: AgendaVisit | null;
  request: VisitRequestRow | null;
  now: Date;
  isRental: boolean;
  onRequest: () => void;
}) {
  const icon = <span className="dl-visit-icon" aria-hidden="true"><ExtraIcon name="calendar" /></span>;
  if (upcoming) {
    return (
      <section className="dl-visit-card" aria-label="Visites">
        {icon}
        <span className="dl-visit-text">
          <span className="dl-visit-title">{visitDateLong(upcoming.start)}</span>
          <span className="dl-visit-subtitle">Visite prévue · {VISIT_STATUS_LABELS[visitDisplayStatus(upcoming, now)]}</span>
        </span>
        <a className="dl-visit-agenda" href={accountPath('agenda')} aria-label="Ouvrir l'agenda des visites">Agenda</a>
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
        <span className="dl-visit-subtitle">Demandez une visite au {isRental ? 'propriétaire' : 'vendeur'} ou à l'agence.</span>
      </span>
      <button type="button" className="dl-visit-agenda dl-visit-request" onClick={onRequest} aria-label="Demander une visite">Demander</button>
    </section>
  );
}
