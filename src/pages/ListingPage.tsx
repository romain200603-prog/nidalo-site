import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { cardKind } from '../lib/cardContent';
import { formatArea, formatPrice } from '../lib/format';
import { fetchListing, ListingNotFound, placeLine, sortedPhotos, UUID_PATTERN, type ListingRow } from '../lib/listings';
import { HotelPerformance, RentalCost } from '../lib/investment';
import { hotelOf, num, rentalDetails } from '../lib/listing/fields';
import { FINANCING_OPTIONS, profitabilityFor, profitabilityView, STANDARD_CHOICE } from '../lib/listing/profitability';
import { fetchActiveCount, fetchPublisher, type Publisher } from '../lib/listing/publisher';
import {
  CATEGORY_LABELS, energyLetter, energyLines, featureRows, feesLabel, footnote, headerFacts, hotelActivity, priceSecondary,
  rentalRows, saleCondition,
} from '../lib/listing/rows';
import { shareText } from '../lib/listing/share';
import { listingModeFromParams, listingPath, PATHS } from '../lib/paths';
import { recordView } from '../lib/recentlyViewed';
import type { SearchMode } from '../lib/labels';
import { ActionBar } from './listing/ActionBar';
import { HotelSection, ProfitabilityCard, RentalCostCard } from './listing/CategoryCards';
import { AccountDialog, AlertDialog, NoPhoneDialog, type AccountAction } from './listing/Dialogs';
import { Gallery } from './listing/Gallery';
import { LocationSection } from './listing/Location';
import { Description, Energy, Features, Footnote, HotelActivity, PracticalInfo, PublisherCard } from './listing/Sections';
import { HeaderCard, VisitCard } from './listing/TopCards';

// Fiche d'une annonce (ListingDetailView.swift), sans compte : mêmes sections, dans le même ordre ; ce qui demande
// un compte (écrire, visiter, offre, favori) ouvre une fenêtre qui renvoie vers l'app.

type State = { status: 'loading' } | { status: 'notFound' } | { status: 'error' } | { status: 'ready'; row: ListingRow };

/** Retour : la recherche d'où l'on vient (même site), sinon la recherche. */
function backTarget(): { href: string; label: string; fromSearch: boolean } {
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer && referrer.origin === window.location.origin && referrer.pathname.startsWith(PATHS.search)) {
      return { href: referrer.pathname + referrer.search, label: 'Retour à la recherche', fromSearch: true };
    }
  } catch {
    // Adresse illisible : la recherche par défaut.
  }
  return { href: PATHS.search, label: 'Chercher un bien', fromSearch: false };
}

/** Coût de la location, à partir du loyer hors charges (ListingDetailView.swift 502–509). */
function rentalCostOf(row: ListingRow): RentalCost | null {
  const price = Number(row.price);
  if (row.transaction !== 'rent' || !(price > 0)) return null;
  const rental = rentalDetails(row);
  const area = Number(row.living_area);
  const fees = num(row.agency_fees_amount);
  return new RentalCost({
    rentExcludingCharges: price,
    charges: num(row.monthly_charges),
    area: area > 0 ? area : null,
    isFurnished: rental?.isFurnished ?? null,
    declaredDeposit: rental?.securityDeposit ?? null,
    agencyFees: row.agency_fees_paid_by === 'buyer' && fees !== null && fees > 0 ? fees : null,
  });
}

/** Rentabilité hôtelière : seulement avec le chiffre d'affaires et l'EBITDA du vendeur (512–516). */
function hotelPerformanceOf(row: ListingRow): HotelPerformance | null {
  const hotel = hotelOf(row);
  const revenue = hotel?.annualRevenue?.value;
  const ebitda = hotel?.ebitda?.value;
  if (!hotel || revenue == null || ebitda == null || !(revenue > 0)) return null;
  return new HotelPerformance({ annualRevenue: revenue, ebitda, rooms: hotel.rooms, occupancyRate: hotel.occupancyRate?.value ?? null });
}

function coordinateOf(row: ListingRow) {
  const latitude = num(row.public_latitude);
  const longitude = num(row.public_longitude);
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

function ListingView({ row, mode }: { row: ListingRow; mode: SearchMode | null }) {
  const [account, setAccount] = useState<AccountAction | null>(null);
  const [noPhone, setNoPhone] = useState(false);
  const [publisher, setPublisher] = useState<Publisher | null>(null);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [choice, setChoice] = useState(STANDARD_CHOICE);
  const [toast, setToast] = useState<string | null>(null);
  const [copyLink, setCopyLink] = useState<string | null>(null);
  const back = useMemo(backTarget, []);

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

  useEffect(() => {
    document.title = `${row.title} à ${row.city} · Nidalo`;
  }, [row]);

  // « Consultés récemment » de l'accueil : la fiche ouverte est notée dans l'onglet (recordView de l'app).
  useEffect(() => {
    recordView(row.id);
  }, [row.id]);

  useEffect(() => {
    let cancelled = false;
    fetchPublisher(row.owner_id, row.created_at)
      .then((p) => { if (!cancelled) setPublisher(p); })
      .catch(() => { /* Sans profil lisible, la carte « Votre interlocuteur » ne s'affiche pas. */ });
    fetchActiveCount(row.owner_id)
      .then((count) => { if (!cancelled) setActiveCount(count); })
      .catch(() => { /* Le nombre d'annonces est facultatif. */ });
    return () => { cancelled = true; };
  }, [row.owner_id, row.created_at]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /** Partage du navigateur (texte de l'app et lien de la page) ; sinon le lien est copié. */
  const share = useCallback(async () => {
    const { text, subject } = shareText(row);
    const url = new URL(listingPath(row.id, mode), window.location.origin).toString();
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: subject, text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setToast('Lien de l’annonce copié');
    } catch {
      setCopyLink(url);
    }
  }, [row, mode]);

  const onBack = (event: MouseEvent<HTMLAnchorElement>) => {
    if (back.fromSearch && window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  };

  const isAgency = publisher?.isProfessional ?? false;
  const fees = feesLabel(row);

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
              condition={saleCondition(row)}
              title={row.title}
              location={place}
              facts={headerFacts(row, kind)}
              onOffer={row.transaction === 'sale' ? () => setAccount('offer') : null}
            />
            <ActionBar onMessage={() => setAccount('message')} onVisit={() => setAccount('visit')} onCall={() => setNoPhone(true)} />
            <VisitCard />
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
          {publisher && <PublisherCard publisher={publisher} fees={fees} activeCount={activeCount} onContact={() => setAccount('message')} />}
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
          />
          <Footnote text={footnote(row)} />
        </div>
      </div>

      <AccountDialog action={account} isAgency={isAgency} onClose={() => setAccount(null)} />
      <NoPhoneDialog open={noPhone} onClose={() => setNoPhone(false)} />
      <AlertDialog
        open={copyLink !== null}
        onClose={() => setCopyLink(null)}
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

  // Fiche ouverte : la barre du bas de l'app est masquée (hidesTabBar), place à la barre d'actions.
  useEffect(() => {
    document.body.classList.toggle('page-listing-ready', state.status === 'ready');
  }, [state.status]);

  return (
    <Page section="search">
      {state.status === 'ready' && <ListingView row={state.row} mode={mode} />}
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
