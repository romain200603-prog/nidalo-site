import { useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { avatarUrl, initials } from '../../lib/account/profile';
import { PATHS } from '../../lib/paths';

// Briques des écrans de Mon compte (Features/Profile/MySpaceComponents.swift).

/** En-tête d'un écran : bouton retour, titre au centre, action à droite. */
export function ScreenHeader({ title, back = PATHS.account, onBack, action }: {
  title: string;
  back?: string;
  onBack?: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="screen-header">
      {onBack ? (
        <button type="button" className="round-back" onClick={onBack} aria-label="Retour"><Icon name="arrowLeft" /></button>
      ) : (
        <a className="round-back" href={back} aria-label="Retour"><Icon name="arrowLeft" /></a>
      )}
      <h1>{title}</h1>
      <div className="screen-header-action">{action}</div>
    </div>
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

/** Message bref en haut de l'écran (« Modifications enregistrées »). */
export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="account-toast" role="status"><Icon name="check" />{text}</div>;
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
