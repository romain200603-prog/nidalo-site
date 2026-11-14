import { Icon } from '../../components/Icon';
import type { HeaderFact } from '../../lib/listing/rows';
import {
  REQUEST_STATUS_LABELS, requestDisplayStatus, VISIT_STATUS_LABELS, visitDateLong, visitDisplayStatus, type AgendaVisit, type VisitRequestRow,
} from '../../lib/listing/visits';
import { accountPath, visitRequestPath } from '../../lib/paths';
import { useFitTexts } from './fitText';
import { ExtraIcon } from './icons';

// Cartes du haut de la fiche, sous la galerie (ListingTopCards.swift) : Résumé et Visite.

/** Espaces fines comme la maquette (le prix et le prix au m² de l'app). */
const narrow = (text: string) => text.replace(/[  ]/g, ' ');

export function HeaderCard({ category, price, priceSecondary, priceNote, condition, title, location, facts, onOffer, offerState = null, offerBusy = false }: {
  category: string;
  price: string;
  priceSecondary: string | null;
  /** Vente dont l'acquéreur paie les honoraires : « Honoraires inclus · 285 714 € hors honoraires ». */
  priceNote: string | null;
  condition: string | null;
  title: string;
  location: string;
  facts: HeaderFact[];
  /** « Faire une offre » : vente d'un autre compte (demande un compte). */
  onOffer: (() => void) | null;
  /** Offre en attente ou acceptée (offerStateLabel de l'app) : son état à la place du bouton, qui ouvre la conversation. */
  offerState?: { label: string; href: string } | null;
  /** La conversation de l'annonce s'ouvre : le bouton attend. */
  offerBusy?: boolean;
}) {
  const ref = useFitTexts<HTMLElement>();
  return (
    <section ref={ref} className="top-card header-card" aria-labelledby="annonce-titre">
      <p className="hc-category">{category}</p>
      <p className="hc-price">
        <span className="hc-price-value">{narrow(price)}</span>
        {priceSecondary && <span className="hc-price-secondary">{priceSecondary.replace(/ /g, ' ')}</span>}
      </p>
      {priceNote && <p className="hc-price-note">{priceNote}</p>}
      {onOffer && (offerState ? (
        <a className="hc-offer" href={offerState.href}>
          <Icon name="handshake" />
          {offerState.label}
        </a>
      ) : (
        <button type="button" className="hc-offer" onClick={onOffer} disabled={offerBusy}>
          <Icon name="handshake" />
          Faire une offre
        </button>
      ))}
      {condition && <p className="hc-condition">{condition}</p>}
      <h1 id="annonce-titre" className="hc-title">{title}</h1>
      <p className="hc-location">
        <Icon name="pin" />
        {location}
      </p>
      {facts.length > 0 ? (
        <dl className="hc-facts">
          {facts.map((fact) => (
            <div key={fact.caption} className="hc-fact">
              <dt>{fact.caption}</dt>
              <dd data-fit="0.8">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="hc-end" />
      )}
    </section>
  );
}

/**
 * Carte Visite (agendaCard de l'app) : le prochain rendez-vous du bien, avec « Agenda » qui ouvre Mon agenda ; sinon la
 * demande envoyée, dont toute la carte ouvre la demande (son écran est encore « bientôt » sur le site, comme sur
 * ordinateur) ; sinon « Aucune visite prévue », sans lien. La visite se demande avec « Visiter » dans la barre du bas.
 */
export function VisitCard({ upcoming = null, request = null, now }: { upcoming?: AgendaVisit | null; request?: VisitRequestRow | null; now: Date }) {
  const icon = <span className="visit-icon" aria-hidden="true"><ExtraIcon name="calendar" /></span>;
  const text = (title: string, subtitle: string) => (
    <span className="visit-text">
      <span className="visit-title">{title}</span>
      <span className="visit-subtitle">{subtitle}</span>
    </span>
  );
  if (upcoming) {
    return (
      <section className="top-card visit-card" aria-label="Visites">
        {icon}
        {text(visitDateLong(upcoming.start), `Visite prévue · ${VISIT_STATUS_LABELS[visitDisplayStatus(upcoming, now)]}`)}
        <a className="visit-agenda" href={accountPath('agenda')} aria-label="Ouvrir l'agenda des visites">Agenda</a>
      </section>
    );
  }
  if (request) {
    const status = REQUEST_STATUS_LABELS[requestDisplayStatus(request, now)];
    return (
      <a className="top-card visit-card is-link" href={visitRequestPath(request.id)} aria-label={`Demande de visite envoyée, ${status}. Ouvre votre demande`}>
        {icon}
        {text('Demande de visite envoyée', `${status} · ${request.recipient.name}`)}
        <Icon name="chevronRight" className="icon visit-chevron" />
      </a>
    );
  }
  return (
    <section className="top-card visit-card" aria-label="Visites">
      {icon}
      {text('Aucune visite prévue', 'Demandez une visite au vendeur ou à l\'agence.')}
    </section>
  );
}
