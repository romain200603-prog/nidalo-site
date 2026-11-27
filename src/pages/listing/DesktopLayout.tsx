import { useEffect, useId, useState, type MouseEvent, type ReactNode } from 'react';
import { HeartButton } from '../../components/account/HeartButton';
import { Icon } from '../../components/Icon';
import type { CardKind } from '../../lib/cardContent';
import { useCompare } from '../../lib/compare';
import type { HeaderFact } from '../../lib/listing/rows';
import { useFitTexts } from './fitText';
import { ExtraIcon } from './icons';
import { HeaderFacts, OfferAction, PriceLine } from './TopCards';

// Fiche d'une annonce sur ordinateur (à partir de 1024 px ; maquettes 05-annonce-appartement.html et 06-annonce-hotel.html,
// styles dans fiche-ordinateur.css). Pièces d'affichage seulement : les données, les actions et leurs conditions sont
// celles de la fiche (ListingPage.tsx), les mêmes que sur téléphone. En haut, le retour, la catégorie, le titre, le lieu
// et « Partager », « Favori », « Comparer » (les boutons ronds de la photo sur téléphone) ; dans la colonne de droite, le
// prix et les actions de la barre du bas du téléphone (« Envoyer un message » et « Appeler », ou celles de sa propre
// annonce) ; à gauche, sous les photos, les chiffres clés.

/** Couleur de la pastille : celle de la catégorie de recherche du bien (Acheter, Louer, Investir, Hôtels ; bleu sinon). */
const TONES: Record<CardKind, 'buy' | 'rent' | 'invest' | 'hotel'> = {
  purchase: 'buy', rental: 'rent', investment: 'invest', hotel: 'hotel', commercial: 'buy', office: 'buy', land: 'buy', building: 'buy',
};

/** « Comparer » avec son libellé (CompareRound de la galerie sur téléphone) : même liste, même action. */
function CompareButton({ listingId, onClick }: { listingId: string; onClick: () => void }) {
  const active = useCompare().ids.includes(listingId);
  return (
    <button type="button" className={`listing-tool listing-tool-compare${active ? ' is-active' : ''}`} aria-pressed={active}
      title={active ? 'Retirer de la comparaison' : 'Ajouter à la comparaison'} onClick={onClick}>
      <Icon name="columns" />
      Comparer
    </button>
  );
}

/**
 * En-tête de la fiche : « Retour » (le retour rond de la photo, même adresse et même action), la catégorie en pastille
 * (et ce que comprend la vente d'un hôtel), le titre (le seul h1 de la page), le lieu ; à droite, « Partager »,
 * « Favori » (connexion d'abord, comme le cœur) et « Comparer ».
 */
export function TitleBar({ back, kind, category, condition, title, location, listingId, onShare, onCompare }: {
  back: { href: string; label: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void };
  kind: CardKind;
  category: string;
  condition: string | null;
  title: string;
  location: string;
  listingId: string;
  onShare: () => void;
  onCompare: () => void;
}) {
  return (
    <div className="listing-head">
      <a className="gallery-back listing-back" href={back.href} onClick={back.onClick} title={back.label}>
        <Icon name="chevronLeft" />
        Retour
      </a>
      <div className="listing-head-row">
        <div className="listing-head-text">
          <p className="listing-kicker">
            <span className={`hc-category listing-badge is-${TONES[kind]}`}>{category}</span>
            {condition && <span className="hc-condition">{condition}</span>}
          </p>
          <h1 id="annonce-titre" className="hc-title">{title}</h1>
          <p className="hc-location">
            <Icon name="pin" />
            {location}
          </p>
        </div>
        <div className="listing-tools">
          <button type="button" className="listing-tool" onClick={onShare} aria-label="Partager l'annonce" title="Partager l'annonce">
            <ExtraIcon name="shareUp" />
            Partager
          </button>
          <HeartButton listingId={listingId} className="listing-tool listing-tool-heart" text="Favori" />
          <CompareButton listingId={listingId} onClick={onCompare} />
        </div>
      </div>
    </div>
  );
}

/** Chiffres clés sous les photos (ceux du résumé sur téléphone) ; rien s'il n'y en a pas. */
export function FactsCard({ facts }: { facts: HeaderFact[] }) {
  const ref = useFitTexts<HTMLDivElement>();
  if (facts.length === 0) return null;
  return (
    <div ref={ref} className="facts-card">
      <HeaderFacts facts={facts} />
    </div>
  );
}

/**
 * Prix de la colonne de droite (résumé du téléphone) : le prix, le prix au m² ou « /mois hors charges », le rendement
 * brut de la carte « Rentabilité » quand elle est affichée, la note des honoraires, puis « Faire une offre » (ou l'état de
 * l'offre) et les actions (`children`).
 */
export function PriceCard({ price, priceSecondary, isRental, grossYield, priceNote, onOffer, offerState, offerBusy, children }: {
  price: string;
  priceSecondary: string | null;
  /** Location : « /mois hors charges » reste sur la ligne du prix. */
  isRental: boolean;
  grossYield: string | null;
  priceNote: string | null;
  onOffer: (() => void) | null;
  offerState: { label: string; href: string } | null;
  offerBusy: boolean;
  children: ReactNode;
}) {
  const yieldText = grossYield ? (
    <>
      {priceSecondary && <span className="price-card-dot" aria-hidden="true">·</span>}
      <span className="price-card-yield">{grossYield} brut</span>
    </>
  ) : null;
  return (
    <section className={`top-card header-card price-card${isRental ? ' price-card-rent' : ''}`} aria-label="Prix">
      <PriceLine price={price} priceSecondary={priceSecondary} extra={yieldText} />
      {priceNote && <p className="hc-price-note">{priceNote}</p>}
      <OfferAction onOffer={onOffer} offerState={offerState} offerBusy={offerBusy} />
      {children}
    </section>
  );
}

/**
 * « Envoyer un message » et « Appeler » de la barre Duo du téléphone, mêmes actions : la conversation avec le vendeur
 * (connexion d'abord), et le numéro s'il est communiqué, sinon la fenêtre « Numéro non disponible ».
 */
export function ContactButtons({ onMessage, onCall, callHref, busy, isRental }: {
  onMessage: () => void;
  onCall: () => void;
  callHref: string | null;
  /** La conversation s'ouvre. */
  busy: boolean;
  isRental: boolean;
}) {
  const hintId = `${useId()}-indice`;
  // Comme la bulle de la barre Duo : les trois points si la conversation tarde plus de 0,15 s.
  const [showsDots, setShowsDots] = useState(false);
  useEffect(() => {
    if (!busy) {
      setShowsDots(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setShowsDots(true), 150);
    return () => window.clearTimeout(timer);
  }, [busy]);
  const call = (
    <>
      <Icon name="phone" />
      Appeler
    </>
  );
  return (
    <div className="price-card-actions">
      <button type="button" className="price-card-message" onClick={onMessage} aria-describedby={hintId} aria-busy={busy || undefined}>
        {showsDots ? <span className="price-card-dots" aria-hidden="true"><i /><i /><i /></span> : <ExtraIcon name="messageCircle" />}
        Envoyer un message
      </button>
      {callHref ? <a className="price-card-call" href={callHref}>{call}</a> : <button type="button" className="price-card-call" onClick={onCall}>{call}</button>}
      <span id={hintId} className="visually-hidden">Ouvre la conversation avec le {isRental ? 'propriétaire' : 'vendeur'}</span>
    </div>
  );
}

/** Sa propre annonce : « Voir les demandes » et « Gérer l'annonce » de la barre blanche du téléphone, mêmes actions. */
export function OwnerButtons({ onRequests, onManage }: { onRequests: () => void; onManage: () => void }) {
  return (
    <div className="price-card-actions">
      <button type="button" className="owner-bar-button owner-bar-requests" onClick={onRequests}>
        <Icon name="calendarCheck" />
        <span>Voir les demandes</span>
      </button>
      <button type="button" className="owner-bar-button owner-bar-manage" onClick={onManage}>
        <Icon name="squarePen" />
        <span>Gérer l'annonce</span>
      </button>
    </div>
  );
}
