import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { ListingPhoto } from './PhotoPager';
import { HeartButton } from './account/HeartButton';
import {
  cardContent, formatCardPrice, formatShortFact, GOOD_YIELD, grossYieldText, homeTypeLine, shortFacts, type CardContent, type ShortFactText,
} from '../lib/cardContent';
import { formatFraction, formatPrice } from '../lib/format';
import { priceDrop } from '../lib/homeFeed';
import { DPE_COLORS } from '../lib/labels';
import { sortedPhotos, type ListingRow } from '../lib/listings';
import type { Highlights } from '../lib/search';
import '../styles/accueil-app.css';

// Carte d'annonce de l'accueil de l'app (HomeListingCard, Features/Home/HomeSections.swift) : depuis la version 1.0.1,
// la même grande carte dans toutes les rangées de l'accueil (HomeView.swift), avec la pastille et le cœur de chaque
// section.

/** Pastille en haut à gauche de la photo. */
export type HomeCardBadge = 'yield' | 'new' | 'priceDrop' | 'none';

/** Teinte du fond sans photo, selon le type de bien (DesignSystem/Components/ListingPhoto.swift). */
function placeholderTint(type: string): string {
  switch (type) {
    case 'apartment': return 'apartment';
    case 'house': return 'house';
    case 'building': case 'commercial': case 'office': case 'hotel': return 'business';
    default: return 'other';
  }
}

/** Première photo ; sans photo, le fond teinté et l'icône photo de l'app (jamais « Photos à venir »). */
export function HomeCardPhoto({ row }: { row: ListingRow }) {
  const photo = sortedPhotos(row)[0];
  if (photo) return <ListingPhoto photo={photo} />;
  return (
    <div className={`home-no-photo tint-${placeholderTint(row.property_type)}`} aria-hidden="true">
      <Icon name="image" />
    </div>
  );
}

/** Rendement brut (« 7,8 % brut », vert dès 7 %, orange en dessous), « Nouveau », ou baisse de prix (« −6 % »). */
export function HomeBadge({ row, highlights, badge }: { row: ListingRow; highlights: Highlights | null; badge: HomeCardBadge }) {
  if (badge === 'yield') {
    if (!highlights) return null;
    const text = grossYieldText(highlights);
    return (
      <span className={`hlc-yield home-yield ${highlights.grossYield >= GOOD_YIELD ? 'is-good' : 'is-low'}`} aria-label={`Rentabilité brute ${text}`}>
        {text} brut
      </span>
    );
  }
  if (badge === 'new') return <span className="hlc-new">Nouveau</span>;
  if (badge === 'priceDrop') {
    const drop = priceDrop(row);
    return drop === null ? null : <span className="hlc-drop">{formatFraction(drop, 0)}</span>;
  }
  return null;
}

/** Prix en 19 très gras (« /mois CC » plus petit) ; baisse de prix : l'ancien prix barré à gauche. */
export function HomePrice({ row, highlights, badge }: { row: ListingRow; highlights: Highlights | null; badge: HomeCardBadge }) {
  const price = formatCardPrice(cardContent(row, null, highlights).price);
  const previous = badge === 'priceDrop' && row.previous_price !== null && Number(row.previous_price) > 0 ? Number(row.previous_price) : null;
  return (
    <p className="hlc-price">
      {previous !== null && <s aria-label={`Ancien prix ${formatPrice(previous)}`}>{formatPrice(previous)}</s>}
      <span className="hlc-amount">{price.amount}</span>
      {price.suffix && <span className="hlc-suffix">{price.suffix}</span>}
    </p>
  );
}

function Fact({ fact, short }: { fact: ShortFactText; short: boolean }) {
  const label = short ? fact.shortLabel ?? fact.label : fact.label;
  const energy = fact.energy;
  return (
    <span className="hlc-fact">
      {label && <span className="hlc-fact-label">{label}</span>}
      {energy ? (
        <span className="hlc-dpe" style={{ background: DPE_COLORS[energy] ?? '#9AA2AA', color: energy === 'D' || energy === 'E' ? '#000000' : '#FFFFFF' }}>
          {fact.value}
        </span>
      ) : (
        <span className={fact.isMuted ? 'hlc-fact-label' : 'hlc-fact-value'}>{fact.value}</span>
      )}
    </span>
  );
}

type Variant = { facts: ShortFactText[]; short: boolean };

function Facts({ variant }: { variant: Variant }) {
  return (
    <>
      {variant.facts.map((fact, index) => (
        <span key={index} className="hlc-fact-group">
          {index > 0 && <span className="hlc-fact-dot" aria-hidden="true">·</span>}
          <Fact fact={fact} short={variant.short} />
        </span>
      ))}
    </>
  );
}

/**
 * Petite ligne sous le prix (HomeShortFactsLine) : les deux faits s'ils tiennent, sinon le premier, sinon le premier
 * avec un libellé plus court (« Encaissés 12 450 €/mois »). Rien à montrer : une ligne vide de même hauteur.
 * `content` : le contenu déjà calculé de la carte (celle d'un favori, dans la catégorie du bien).
 */
export function ShortFactsLine({ row, highlights, content }: { row: ListingRow; highlights: Highlights | null; content?: Pick<CardContent, 'facts'> }) {
  const facts = shortFacts(content ?? cardContent(row, null, highlights)).slice(0, 2).map((fact) => formatShortFact(fact));
  const variants: Variant[] = [];
  if (facts.length > 1) variants.push({ facts, short: false });
  if (facts.length) variants.push({ facts: [facts[0]], short: false });
  if (facts[0]?.shortLabel) variants.push({ facts: [facts[0]], short: true });
  const key = JSON.stringify(variants);
  const ref = useRef<HTMLParagraphElement>(null);
  const [chosen, setChosen] = useState(0);
  useLayoutEffect(() => {
    const line = ref.current;
    if (!line || variants.length < 2) return;
    const fit = () => {
      const room = line.clientWidth;
      const probes = [...line.querySelectorAll<HTMLElement>('.hlc-facts-probe')];
      const index = probes.findIndex((probe) => probe.scrollWidth <= room + 0.5);
      setChosen(index < 0 ? probes.length - 1 : index);
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(line);
    return () => observer.disconnect();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = variants[Math.min(chosen, variants.length - 1)];
  return (
    <p ref={ref} className="hlc-facts">
      {shown && <Facts variant={shown} />}
      {variants.length > 1 && variants.map((variant, index) => (
        <span key={index} className="hlc-facts-probe" aria-hidden="true"><Facts variant={variant} /></span>
      ))}
    </p>
  );
}

/**
 * Carte de 248 (photo de 186, rayon 22) de l'app. `heart` : cœur des favoris (rond blanc de 32 sur la photo). Sur
 * ordinateur, la carte prend la largeur de sa colonne, la photo garde ses proportions.
 */
export function HomeListingCard({ row, highlights, badge, heart, href, investment = true, className = '' }: {
  row: ListingRow;
  highlights: Highlights | null;
  badge: HomeCardBadge;
  heart: boolean;
  href: string;
  /**
   * Type de bien en mots d'Investir (« Maison locative », investmentLabel), comme toutes les cartes de l'accueil de
   * l'app ; `false` : les mots de la catégorie (« Maison »).
   */
  investment?: boolean;
  className?: string;
}) {
  return (
    <article className={`home-listing-card ${className}`.trim()}>
      <div className="hlc-photo">
        <HomeCardPhoto row={row} />
        <HomeBadge row={row} highlights={highlights} badge={badge} />
        {heart && <HeartButton listingId={row.id} className="heart-button hlc-heart" />}
      </div>
      <div className="hlc-body">
        <HomePrice row={row} highlights={highlights} badge={badge} />
        <ShortFactsLine row={row} highlights={highlights} />
        <h3 className="hlc-type"><a className="stretched" href={href}>{homeTypeLine(row, investment)}</a></h3>
        <p className="hlc-city"><Icon name="pin" />{row.city}</p>
      </div>
    </article>
  );
}
