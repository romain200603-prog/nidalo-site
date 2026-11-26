import { useId, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { ShortFactsLine } from '../../components/HomeListingCard';
import { OfflineState } from '../../components/OfflineState';
import { NETWORK_MESSAGE } from '../../lib/account/auth';
import type { IconName } from '../../components/iconPaths';
import { avatarUrl, initials } from '../../lib/account/profile';
import { cardContent, formatCardPrice } from '../../lib/cardContent';
import { formatArea } from '../../lib/format';
import { propertyTypeLabel } from '../../lib/labels';
import { photoUrl, sortedPhotos, type ListingRow } from '../../lib/listings';
import { PATHS } from '../../lib/paths';

// Briques des écrans de Mon compte (Features/Profile/MySpaceComponents.swift).

/**
 * En-tête d'un écran poussé de Mon compte : l'en-tête de page de l'app (PageHeader, NidaloPageHeader) avec le retour à
 * Mon compte (ou `back`, ou `onBack`) et l'action à droite.
 */
export function ScreenHeader({ title, back = PATHS.account, onBack, action }: {
  title: string;
  back?: string;
  onBack?: () => void;
  action?: ReactNode;
}) {
  return <PageHeader title={title} back={onBack ? undefined : back} onBack={onBack} trailing={action} className="screen-header" />;
}

/**
 * Section d'une page de Mon compte (NidaloSection) : petit titre gris en capitales au-dessus (avec un élément à droite
 * facultatif), puis une carte blanche à part, coins 22, bordure et ombre très légère, marges 16, 14 entre ses éléments.
 */
export function AppSection({ title, accessory, className, children }: {
  title: string;
  accessory?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={className ? `app-section ${className}` : 'app-section'} aria-labelledby={`${id}-titre`}>
      <div className="app-section-head">
        <h2 id={`${id}-titre`} className="app-section-label">{title}</h2>
        {accessory}
      </div>
      <div className="app-section-card">{children}</div>
    </section>
  );
}

export function SpaceSection({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="space-section">
      <h2 className="section-title"><Icon name={icon} />{title}</h2>
      {children}
    </section>
  );
}

export type RowItem = {
  icon: IconName;
  title: string;
  subtitle?: string;
  badge?: number;
  href?: string;
  onClick?: () => void;
  external?: boolean;
};

/** Liste de lignes d'une carte (RowGroup) : icône, titre, sous-titre, pastille, chevron. */
export function RowGroup({ rows }: { rows: RowItem[] }) {
  return (
    <ul className="row-group space-card">
      {rows.map((row) => {
        const content = (
          <>
            <span className="row-icon"><Icon name={row.icon} /></span>
            <span className="row-text">
              <span className="row-title">{row.title}</span>
              {row.subtitle && <span className="row-subtitle">{row.subtitle}</span>}
            </span>
            {row.badge ? <span className="row-badge">{row.badge}</span> : null}
            <Icon name="chevronRight" className="icon row-chevron" />
          </>
        );
        return (
          <li key={row.title}>
            {row.href ? (
              <a className="row" href={row.href} {...(row.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{content}</a>
            ) : (
              <button type="button" className="row" onClick={row.onClick}>{content}</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Avatar({ name, path, size = 58 }: { name: string; path: string | null; size?: number }) {
  const url = avatarUrl(path);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }} aria-hidden="true">
      {url ? <img src={url} alt="" width={size} height={size} /> : initials(name) || <Icon name="user" />}
    </span>
  );
}

/**
 * Carte du profil en haut de Mon compte (SpaceProfileCard de l'app) : photo ronde de 64 px, sinon l'initiale sur le
 * dégradé bleu de Nidalo ; nom, deuxième ligne, pastille du type de compte, et le bouton « Modifier » (ou « Voir »).
 */
export function SpaceProfileCard({ name, line, badge, photo, href, action = 'Modifier' }: {
  name: string;
  line: string;
  badge: string;
  photo: string | null;
  href: string;
  action?: string;
}) {
  const url = avatarUrl(photo);
  const [failed, setFailed] = useState<string | null>(null);
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '';
  return (
    <a className="space-profile" href={href}>
      <span className="space-profile-photo" aria-hidden="true">
        {url && failed !== url ? <img src={url} alt="" width={64} height={64} onError={() => setFailed(url)} /> : initial}
      </span>
      <span className="space-profile-text">
        <span className="space-profile-name">{name}</span>
        {line && <span className="space-profile-line">{line}</span>}
        <span className="space-profile-badge">{badge}</span>
      </span>
      <span className="space-profile-action">{action}</span>
    </a>
  );
}

export function Spinner({ label = 'Chargement' }: { label?: string }) {
  return <div className="account-spinner"><span className="spinner" role="status" aria-label={label} /></div>;
}

/** État vide d'un écran : icône, titre, texte, bouton. */
export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="account-empty">
      <Icon name={icon} />
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

/**
 * Message bref en haut de l'écran (« Modifications enregistrées » d'EditProfileView) : capsule verte de 44, coche
 * pleine et texte de 14 gras en blanc, 8 sous le haut ; elle glisse du haut en apparaissant (fondu seul avec
 * « Réduire les animations »).
 */
export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="account-toast" role="status">
      <svg className="account-toast-check" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="currentColor" />
        <path d="m6 10.2 2.7 2.7L14 7.6" fill="none" stroke="#577965" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {text}
    </div>
  );
}

/**
 * « Les miens » ou « L'agence » (annonces, contacts, mandats) : seulement pour une personne qui a une équipe. Même
 * contrôle à deux choix que les filtres (« segmented »).
 */
export function TeamViewSwitch({ value, onChange, mine }: { value: 'mine' | 'agency'; onChange: (view: 'mine' | 'agency') => void; mine: string }) {
  return (
    <div className="segmented team-view" role="radiogroup" aria-label="Afficher">
      <button type="button" role="radio" aria-checked={value === 'mine'} onClick={() => onChange('mine')}>{mine}</button>
      <button type="button" role="radio" aria-checked={value === 'agency'} onClick={() => onChange('agency')}>L&apos;agence</button>
    </div>
  );
}

/** « Ajouté par Julien B. » sur une chose de l'agence ; rien pour les miennes. */
export function AuthorLine({ author, verb = 'Ajouté par' }: { author: string | null; verb?: string }) {
  if (!author) return null;
  return <span className="team-author"><Icon name="user" />{verb} {author}</span>;
}

/**
 * Ligne d'annonce des pages de Mon compte (NidaloListingRow) : photo de 84 aux coins de 16 (à moitié effacée pour un
 * bien qui n'est plus proposé), prix de 16 gras, type de bien de 13,5 semibold, lieu de 12,5 gris (ville · surface),
 * petite ligne des cartes de l'accueil si demandée, puis les pastilles ; 12 entre la photo et le texte, 3 entre les
 * lignes.
 */
export function AppListingRow({ row, dimmed = false, showsShortFacts = false, pills, trailing }: {
  row: ListingRow;
  dimmed?: boolean;
  showsShortFacts?: boolean;
  pills?: ReactNode;
  trailing?: ReactNode;
}) {
  const content = cardContent(row, null, null);
  const price = formatCardPrice(content.price);
  const photo = sortedPhotos(row)[0];
  const area = content.area;
  const location = [row.city, area ? (content.kind === 'land' ? `${formatArea(area)} de terrain` : formatArea(area)) : null].filter(Boolean).join(' · ');
  return (
    <div className="app-listing-row">
      <span className={`app-listing-photo${dimmed ? ' is-dimmed' : ''}`} aria-hidden="true">
        {photo ? <img src={photoUrl(photo.storage_path)} alt="" width={84} height={84} loading="lazy" /> : <Icon name="image" />}
      </span>
      <span className="app-listing-text">
        <span className="app-listing-price"><strong>{price.amount}</strong>{price.suffix && <span>{price.suffix}</span>}</span>
        <span className="app-listing-type">{propertyTypeLabel(row.property_type)}</span>
        {location && <span className="app-listing-location">{location}</span>}
        {showsShortFacts && <ShortFactsLine row={row} highlights={null} content={content} />}
        {pills && <span className="app-listing-pills">{pills}</span>}
      </span>
      {trailing}
    </div>
  );
}

/**
 * Liste non lue (ProErrorState, DomiaEmptyState.offline de l'app) : sans réseau, « Pas de connexion Internet » et
 * « Réessayer » ; sinon le message en rouge (14, centré) et « Réessayer » (bouton secondaire de 200 au plus), 70 plus bas.
 */
export function LoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  if (message === NETWORK_MESSAGE || navigator.onLine === false) return <OfflineState onRetry={onRetry} />;
  return (
    <div className="load-failure" role="alert">
      <p>{message}</p>
      <button type="button" className="btn btn-light" onClick={onRetry}>Réessayer</button>
    </div>
  );
}
