import type { MouseEvent } from 'react';
import { Icon } from './Icon';
import type { IconName } from './iconPaths';
import '../styles/pieces-app.css';

/**
 * Bouton rond de l'app (NidaloRoundButton, DesignSystem/Components/NidaloMenuComponents.swift) : rond blanc de 42 px
 * bordé, icône de 19 px, zone d'appui de 44 px ; point rouge facultatif (non-lus). Lien avec `href`, bouton sinon.
 */
export function RoundButton({ icon, label, href, onClick, dot = false, className }: {
  icon: IconName;
  /** Libellé lu par les lecteurs d'écran (accessibilityLabel de l'app). */
  label: string;
  href?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  dot?: boolean;
  className?: string;
}) {
  const classes = className ? `app-round ${className}` : 'app-round';
  const content = (
    <span className="app-round-circle">
      <Icon name={icon} />
      {dot && <span className="app-round-dot" aria-hidden="true" />}
    </span>
  );
  if (href !== undefined) {
    return <a className={classes} href={href} aria-label={label} onClick={onClick}>{content}</a>;
  }
  return <button type="button" className={classes} aria-label={label} onClick={onClick}>{content}</button>;
}
