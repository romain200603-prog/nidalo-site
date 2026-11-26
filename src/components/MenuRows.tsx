import { useId, type CSSProperties, type ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './iconPaths';
import '../styles/pieces-app.css';

// Pièces des pages de Mon compte de l'app (DesignSystem/Components/NidaloMenuComponents.swift) : petit titre de groupe
// (NidaloSectionLabel), carte de groupe (NidaloGroupCard) et ligne de menu (NidaloMenuRow), les mêmes sur téléphone et
// sur ordinateur.

/** Teinte d'une ligne (NidaloTint) : fond du carré d'icône et couleur de l'icône, celles des catégories de l'accueil. */
export type MenuTint = 'blue' | 'green' | 'teal' | 'amber' | 'gray';

export type MenuRowItem = {
  icon: IconName;
  title: string;
  /** Sous-titre gris : seulement de vraies données (rien à zéro, comme l'app). */
  subtitle?: string | null;
  /** Gris par défaut, comme l'app. */
  tint?: MenuTint;
  /** Pastille de compteur (aucune à 0) : rouge par défaut, bleue avec `badgeTone: 'brand'`. */
  badge?: number;
  badgeTone?: 'red' | 'brand';
  href?: string;
  onClick?: () => void;
  external?: boolean;
  /** Ligne d'information, sans action ni chevron (« Avec ce compte »). */
  info?: boolean;
  /** À droite à la place de la pastille et du chevron (la coche de « Type actuel »), comme `trailing` de l'app. */
  trailing?: ReactNode;
};

/** Petit titre gris en capitales au-dessus d'une carte de groupe (NidaloSectionLabel). */
export function SectionLabel({ title, id, as: Tag = 'h2' }: { title: string; id?: string; as?: 'h2' | 'h3' | 'p' }) {
  return <Tag className="app-section-label" id={id}>{title}</Tag>;
}

/** Carte blanche (coins 22) dont les lignes sont séparées par un trait fin, retiré de `separatorInset` (NidaloGroupCard). */
export function GroupCard({ children, separatorInset = 68, label, className }: {
  children: ReactNode;
  separatorInset?: number;
  label?: string;
  className?: string;
}) {
  return (
    <ul className={className ? `app-group ${className}` : 'app-group'} aria-label={label}
      style={{ '--app-separator-inset': `${separatorInset}px` } as CSSProperties}>
      {children}
    </ul>
  );
}

/** Ligne de menu (NidaloMenuRow) : carré d'icône teinté de 40 px, titre, sous-titre, pastille, chevron. */
export function MenuRow({ icon, title, subtitle, tint = 'gray', badge, badgeTone = 'red', href, onClick, external, info, trailing }: MenuRowItem) {
  const content = (
    <>
      <span className={`app-row-tile is-${tint}`} aria-hidden="true"><Icon name={icon} /></span>
      <span className="app-row-text">
        <span className="app-row-title">{title}</span>
        {subtitle ? <span className="app-row-subtitle">{subtitle}</span> : null}
      </span>
      {trailing ?? (
        <>
          {badge ? <span className={`app-row-badge is-${badgeTone}`}>{badge}</span> : null}
          {!info && <Icon name="chevronRight" className="icon app-row-chevron" />}
        </>
      )}
    </>
  );
  if (info) return <div className="app-row is-info">{content}</div>;
  if (href !== undefined) {
    return <a className="app-row" href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{content}</a>;
  }
  return <button type="button" className="app-row" onClick={onClick}>{content}</button>;
}

/** Lignes d'une carte de groupe. */
export function MenuRows({ rows, label }: { rows: MenuRowItem[]; label?: string }) {
  return (
    <GroupCard label={label}>
      {rows.map((row) => <li key={row.title}><MenuRow {...row} /></li>)}
    </GroupCard>
  );
}

/** Groupe de Mon compte : petit titre puis la carte de ses lignes (group() de ProfileView.swift). */
export function MenuGroup({ title, rows, children }: { title: string; rows: MenuRowItem[]; children?: ReactNode }) {
  const id = useId();
  return (
    <section className="app-menu-group" aria-labelledby={id}>
      <SectionLabel title={title} id={id} />
      <MenuRows rows={rows} />
      {children}
    </section>
  );
}
