import { Icon } from './Icon';
import { PhotoPager } from './PhotoPager';
import {
  cardLocation, formatCardPrice, formatFacts, yieldTone, type CardContent, type CardKind, type FormattedFact,
} from '../lib/cardContent';
import { formatFraction } from '../lib/format';
import { sortedPhotos, type ListingRow } from '../lib/listings';
import { listingPath } from '../lib/paths';

/** Étiquette de la fiche, par catégorie (ListingCardStyle.badge de l'app). */
export function cardTag(kind: CardKind, isLeased: boolean): string {
  switch (kind) {
    case 'purchase': return 'Résidentiel';
    case 'rental': return 'Location';
    case 'investment': return isLeased ? 'Locatif' : 'Investissement';
    case 'hotel': return 'Hôtel';
    case 'commercial': return 'Local commercial';
    case 'office': return 'Bureaux';
    case 'land': return 'Terrain';
    case 'building': return 'Immeuble';
  }
}

/** « Rendement brut : 7,8 % » : libellé au-dessus, valeur en dessous. */
export function FactItem({ fact }: { fact: FormattedFact }) {
  const [label, ...rest] = fact.text.split(' : ');
  const value = rest.length ? rest.join(' : ') : label;
  return (
    <div className={`fact tone-${fact.tone}`}>
      <Icon name={fact.icon} className="icon fact-icon" />
      <div>
        {rest.length > 0 && <div className="fact-label">{label}</div>}
        <div className="fact-value">{value}</div>
        {fact.isEstimate && <span className="estimate">Estimation</span>}
      </div>
    </div>
  );
}

/** Panneau d'indicateurs sur deux colonnes. */
export function FactsPanel({ facts }: { facts: FormattedFact[] }) {
  if (!facts.length) return null;
  const split = Math.ceil(facts.length / 2);
  return (
    <div className="facts-panel">
      <div className="facts-column">{facts.slice(0, split).map((fact) => <FactItem key={fact.text} fact={fact} />)}</div>
      {facts.length > 1 && <div className="facts-column">{facts.slice(split).map((fact) => <FactItem key={fact.text} fact={fact} />)}</div>}
    </div>
  );
}

type Props = {
  row: ListingRow;
  content: CardContent;
  selected?: boolean;
  onHover?: (id: string | null) => void;
  headingLevel?: 'h2' | 'h3';
};

/** Fiche d'une annonce dans les résultats : photo sur toute la largeur, puis étiquette, titre, lieu, prix, indicateurs. */
export function ListingCard({ row, content, selected = false, onHover, headingLevel = 'h2' }: Props) {
  const photos = sortedPhotos(row).slice(0, 10);
  const price = formatCardPrice(content.price);
  const facts = formatFacts(content.panelFacts);
  const gross = content.panelFacts.find((fact) => fact.kind === 'grossYield');
  const grossValue = gross && gross.kind === 'grossYield' ? gross.value : null;
  const Heading = headingLevel;
  const href = listingPath(row.id, content.kind === 'investment' ? 'invest' : null);
  const isLeased = (row.rental_info as { isLeased?: boolean } | null)?.isLeased === true;
  return (
    <article
      className={`listing-card card${selected ? ' is-selected' : ''}`}
      onMouseEnter={() => onHover?.(row.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* Un clic sur la photo ouvre l'annonce ; le balayage fait défiler les photos. Clavier : le lien du titre. */}
      <div className="listing-card-photo" onClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        window.location.assign(href);
      }}>
        <PhotoPager photos={photos} label={row.title} />
        {grossValue !== null && (
          <span className={`yield-chip tone-${yieldTone(grossValue)}`}>
            <Icon name="trend" />
            {formatFraction(grossValue)}
            <span className="visually-hidden"> de rendement brut</span>
          </span>
        )}
      </div>
      <div className="listing-card-body">
        <div className="listing-card-top">
          <span className="tag">{cardTag(content.kind, isLeased)}</span>
          <Icon name="chevronRight" className="icon chevron" />
        </div>
        <Heading className="listing-card-title">
          {/* Le lien couvre le texte de la fiche (classe stretched). */}
          <a href={href} className="stretched">{row.title}</a>
        </Heading>
        <p className="listing-card-place">
          <Icon name="pin" />
          {cardLocation(row.city, content)}
        </p>
        <p className="listing-card-price">
          <strong>{price.amount}</strong>
          {price.suffix && <span>{price.suffix}</span>}
        </p>
        <FactsPanel facts={facts} />
      </div>
    </article>
  );
}
