import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { Decimal } from '../../lib/investment';
import { cardEuros } from '../../lib/listing/money';
import { MONTH_COLORS, MONTH_REMAINDER_COLOR, type MonthBar } from '../../lib/listing/monthBar';
import { SPEC_COLORS } from './Spec';

/**
 * Barre de « Votre mois type » (MonthTypeBar de l'app, ListingTopCards.swift) : 14 de haut, bouts arrondis, un segment
 * par dépense puis le reste en vert ; reste négatif, un trait marque où s'arrêtent les loyers. Dessous, le libellé
 * de la ligne de loyer à gauche et « Reste » (ou « Effort d'épargne ») à droite. Un seul élément pour les lecteurs
 * d'écran, qui lisent toute la barre.
 */
export function MonthTypeBar({ bar, cashFlow, rentCaption }: { bar: MonthBar; cashFlow: Decimal; rentCaption: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = track.current;
    if (!element) return undefined;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const segments = width > 0 ? bar.segments(width) : [];
  const marker = width > 0 ? bar.incomeMarker(width) : null;
  const radius = 7;
  return (
    <div className="month-bar" role="img" aria-label={bar.spokenText(cashFlow)}>
      <div className="month-bar-track" ref={track} aria-hidden="true">
        {width > 0 && segments.length === 0 && <span className="month-bar-empty" />}
        {segments.map((segment, index) => {
          const left = index === 0 ? Math.min(radius, segment.width) : 0;
          const right = index === segments.length - 1 ? Math.min(radius, segment.width) : 0;
          return (
            <span
              key={segment.id}
              className="month-bar-segment"
              data-segment={segment.id}
              style={{
                left: `${segment.x}px`, width: `${segment.width}px`, borderRadius: `${left}px ${right}px ${right}px ${left}px`,
                background: segment.role === 'remainder' ? MONTH_REMAINDER_COLOR : MONTH_COLORS[segment.role.expense],
              }}
            />
          );
        })}
        {marker !== null && <span className="month-bar-marker" style={{ left: `${marker - 1}px` }} />}
      </div>
      <div className="month-bar-captions" aria-hidden="true">
        <span className="month-bar-rent">{rentCaption}</span>
        {cashFlow.lt(0) ? (
          <span className="month-bar-flow" style={{ color: SPEC_COLORS.red }}>
            <Icon name="arrowDownRight" />Effort d’épargne {cardEuros(cashFlow, true)}
          </span>
        ) : (
          <span className="month-bar-flow" style={{ color: SPEC_COLORS.green }}>Reste {cardEuros(cashFlow, true)}</span>
        )}
      </div>
    </div>
  );
}
