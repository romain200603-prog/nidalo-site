import type { ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { useFitTexts } from './fitText';

// Éléments des cartes Rentabilité, Coût de la location et Rentabilité hôtelière, comme SpecCardComponents.swift :
// mesures de la maquette de 480 px ramenées à l'écran par --k (393/480), dans listing.css, et couleurs de `Spec`.

// Couleurs de l'app depuis la fiche refaite (Spec, SpecCardComponents.swift) : bleu marine, gris et bleu Nidalo, vert
// et rouge de l'app.
export const SPEC_COLORS = {
  navy: '#242D38',
  gray: '#75808B',
  blue: '#3C5CB0',
  valueBlue: '#3C5CB0',
  orange: '#BB8059',
  grayBlue: '#9AA2AA',
  green: '#577965',
  red: '#C0392B',
} as const;

export function SpecCard({ children, labelledBy, className }: { children: ReactNode; labelledBy?: string; className?: string }) {
  const ref = useFitTexts<HTMLElement>();
  return <section ref={ref} className={`spec-card ${className ?? ''}`} aria-labelledby={labelledBy}>{children}</section>;
}

/** Titre de carte 24/30 et sous-titre 14,5/20, sans pastille d'icône (titre de section de l'app). */
export function SpecCardHeader({ id, title, subtitle }: { id: string; title: string; subtitle: string }) {
  return (
    <div className="spec-header">
      <div className="spec-header-text">
        <h2 id={id}>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

export type BannerColumn = { label: string; value: string; unit?: string; detail?: string };

/** Bandeau bleu à deux colonnes ; montants 31/38 (Location, Investir) ou 27/34 (Hôtels). */
export function SpecBanner({ left, right, hotel = false }: { left: BannerColumn; right: BannerColumn; hotel?: boolean }) {
  const column = (c: BannerColumn, side: 'left' | 'right') => (
    <div className={`spec-banner-col spec-banner-${side}`}>
      <span className="spec-banner-label" data-fit="0.85">{c.label}</span>
      <span className={`spec-banner-value${c.unit ? ' has-unit' : ''}`} data-fit="0.7">
        <span className="spec-banner-amount">{c.value}</span>
        {c.unit && <span className="spec-banner-unit">{c.unit}</span>}
      </span>
      {c.detail && <span className="spec-banner-detail" data-fit="0.85">{c.detail}</span>}
    </div>
  );
  return (
    <div className={`spec-banner${hotel ? ' spec-banner-hotel' : ''}`}>
      {column(left, 'left')}
      {column(right, 'right')}
    </div>
  );
}

/** Encadré clair (fond de page, contour de l'app) : titre et sous-texte à gauche, valeur à droite. */
export function SpecValueBox({ title, subtitle, children }: {
  title: string;
  subtitle?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="spec-value-box">
      <div className="spec-value-text">
        <span className="spec-value-title">{title}</span>
        {subtitle && <span className="spec-value-subtitle">{subtitle}</span>}
      </div>
      <div className="spec-value-trailing">{children}</div>
    </div>
  );
}

export function SpecBoxValue({ text, color = SPEC_COLORS.valueBlue }: { text: string; color?: string }) {
  return <span className="spec-box-value" style={{ color }}>{text}</span>;
}

/** Ligne sous une grande valeur : icône 14 et texte 13,5 gras (« nets par mois », « Autofinancé »). */
export function SpecValueCaption({ icon, text, color }: { icon: ReactNode; text: string; color: string }) {
  return <span className="spec-value-caption" style={{ color }}>{icon}{text}</span>;
}

export function SpecBlockTitle({ title, legend = [], trailingText }: { title: string; legend?: [string, string][]; trailingText?: string }) {
  return (
    <div className="spec-block-title">
      <h3>{title}</h3>
      {trailingText && <span className="spec-block-trailing">{trailingText}</span>}
      {legend.length > 0 && (
        <span className="spec-legend" aria-hidden="true">
          {legend.map(([label, color]) => (
            <span key={label}><i style={{ background: color }} />{label}</span>
          ))}
        </span>
      )}
    </div>
  );
}

export type BadgeTone = 'listing' | 'legal' | 'simulation';
export type Badge = { title: string; tone: BadgeTone };

export const BADGES = {
  listing: { title: 'Annonce', tone: 'listing' } as Badge,
  simulation: { title: 'Simulation', tone: 'simulation' } as Badge,
  legal: (title: string): Badge => ({ title, tone: 'legal' }),
};

export function SpecBadge({ badge }: { badge: Badge }) {
  return <span className={`spec-badge spec-badge-${badge.tone}`}>{badge.title}</span>;
}

/**
 * Ligne avec barre : libellé, pastille ou précision, montant ; barre de 9 dessous. Mois type de la Rentabilité :
 * sans barre, avec le carré de couleur de son segment devant le libellé (`marker` : une couleur, ou `''` pour une
 * place vide qui garde les libellés alignés).
 */
export function SpecBarRow({ label, detail, badge, amount, ratio = 0, color = 'transparent', tight = false, marker = null, showsBar = true, amountColor }: {
  label: string;
  detail?: string | null;
  badge?: Badge | null;
  amount: string;
  ratio?: number;
  color?: string;
  /** Écart 6 et hauteur 26 (Hôtels) au lieu de 8 et 24. */
  tight?: boolean;
  marker?: string | null;
  showsBar?: boolean;
  amountColor?: string;
}) {
  const width = Math.min(Math.max(Number.isFinite(ratio) ? ratio : 0, 0), 1) * 100;
  return (
    <div className={`spec-bar-row${tight ? ' tight' : ''}`}>
      <div className="spec-bar-line">
        {marker !== null && <i className="spec-row-marker" style={{ background: marker || 'transparent' }} aria-hidden="true" />}
        <span className="spec-bar-label" data-fit="0.8">{label}</span>
        {badge && <SpecBadge badge={badge} />}
        {detail && <span className="spec-bar-detail" data-fit="0.8">{detail}</span>}
        <span className="spec-bar-amount" style={amountColor ? { color: amountColor } : undefined}>{amount}</span>
      </div>
      {showsBar && (
        <div className="spec-bar-track" aria-hidden="true">
          <span style={{ width: `max(calc(6px * var(--k)), ${width}%)`, background: color }} />
        </div>
      )}
    </div>
  );
}

/** Total : filet, puis libellé 17 et montant 20. */
export function SpecTotalRow({ label, detail, amount, unit, color = SPEC_COLORS.navy }: {
  label: string; detail?: string; amount: string; unit?: string; color?: string;
}) {
  return (
    <div className="spec-total">
      <span className="spec-total-label">{label}</span>
      {detail && <span className="spec-total-detail">{detail}</span>}
      <span className="spec-total-amount" style={{ color }}>
        {amount}
        {unit && <span className="spec-total-unit">{unit}</span>}
      </span>
    </div>
  );
}

/** Encadré jaune avec le triangle d'avertissement. */
export function SpecNote({ text }: { text: string }) {
  return (
    <div className="spec-note">
      <Icon name="triangleAlert" />
      <p>{text}</p>
    </div>
  );
}

/** Contrôle segmenté : libellé gris à largeur fixe (76 ou 64), puis les choix. */
export function SpecSegmentRow<T>({ title, labelWidth, options, selected, onSelect, label }: {
  title: string;
  labelWidth: 64 | 76;
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  label: (value: T) => string;
}) {
  return (
    <div className="spec-segment-row">
      <span className={`spec-segment-title w${labelWidth}`}>{title}</span>
      <div className="spec-segments" role="group" aria-label={title}>
        {options.map((option) => {
          const text = label(option);
          const isSelected = Object.is(option, selected) || text === label(selected);
          return (
            <button key={text} type="button" className="spec-segment" data-fit="0.85" aria-pressed={isSelected} onClick={() => onSelect(option)}>
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Encadré résultat : titre et valeur, contenu libre dessous. */
export function SpecResultBox({ title, value, valueColor = SPEC_COLORS.valueBlue, tone, children }: {
  title: string;
  value: string;
  valueColor?: string;
  tone?: 'ok' | 'warning';
  children?: ReactNode;
}) {
  return (
    <div className={`spec-result${tone ? ` spec-result-${tone}` : ''}`}>
      <div className="spec-result-head">
        <span className="spec-result-title">{title}</span>
        <span className="spec-result-value" style={{ color: valueColor }} aria-live="polite">{value}</span>
      </div>
      {children}
    </div>
  );
}

export function SpecFootnote({ text }: { text: string }) {
  return <p className="spec-footnote">{text}</p>;
}

/** Partie « Simuler mon dossier » / « Ajuster le financement » : filet au-dessus, à 22 du bloc précédent. */
export function SpecSimulator({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div className="spec-simulator" role="group" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {children}
    </div>
  );
}
