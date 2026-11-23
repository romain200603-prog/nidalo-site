import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './iconPaths';
import '../styles/pieces-app.css';

/**
 * Écran vide ou indisponible de l'app (ContentUnavailableView) : grande icône grise, titre de 17 gras, texte de 14 gris,
 * centrés, puis l'action facultative (« Réessayer »). `heading` : h1 quand l'état est toute la page.
 */
export function ContentUnavailable({ icon, title, text, children, className, heading = 'h2' }: {
  icon: IconName;
  title: string;
  text?: string;
  children?: ReactNode;
  className?: string;
  heading?: 'h1' | 'h2';
}) {
  const Heading = heading;
  return (
    <div className={className ? `app-unavailable ${className}` : 'app-unavailable'}>
      <Icon name={icon} className="icon app-unavailable-icon" />
      <Heading>{title}</Heading>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}
