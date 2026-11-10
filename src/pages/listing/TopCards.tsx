import { Icon } from '../../components/Icon';
import type { HeaderFact } from '../../lib/listing/rows';
import { useFitTexts } from './fitText';
import { ExtraIcon } from './icons';

// Cartes du haut de la fiche, sous la galerie (ListingTopCards.swift) : Résumé et Visite.

/** Espaces fines comme la maquette (le prix et le prix au m² de l'app). */
const narrow = (text: string) => text.replace(/[  ]/g, ' ');

export function HeaderCard({ category, price, priceSecondary, priceNote, condition, title, location, facts, onOffer }: {
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
      {onOffer && (
        <button type="button" className="hc-offer" onClick={onOffer}>
          <Icon name="handshake" />
          Faire une offre
        </button>
      )}
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

/** Carte Visite : sans compte, toujours « Aucune visite prévue », sans bouton (la visite se demande en bas). */
export function VisitCard() {
  return (
    <section className="top-card visit-card" aria-label="Visites">
      <span className="visit-icon" aria-hidden="true"><ExtraIcon name="calendar" /></span>
      <span className="visit-text">
        <span className="visit-title">Aucune visite prévue</span>
        <span className="visit-subtitle">Demandez une visite au vendeur ou à l'agence.</span>
      </span>
    </section>
  );
}
