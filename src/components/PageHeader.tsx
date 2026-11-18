import type { ReactNode } from 'react';
import { RoundButton } from './RoundButton';
import '../styles/pieces-app.css';

/**
 * En-tête d'une page poussée de l'app (NidaloPageHeader, DesignSystem/Components/NidaloMenuComponents.swift) : retour
 * rond à gauche, titre de 17 gras centré sur la page (56 de marge de chaque côté), élément facultatif à droite.
 */
export function PageHeader({ title, back, onBack, trailing, className }: {
  title: string;
  /** Page du retour (lien) ; sans elle, `onBack`. */
  back?: string;
  onBack?: () => void;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `app-page-header ${className}` : 'app-page-header'}>
      <RoundButton icon="arrowLeft" label="Retour" href={onBack ? undefined : back} onClick={onBack} />
      <h1 className="app-page-header-title">{title}</h1>
      {trailing && <div className="app-page-header-trailing">{trailing}</div>}
    </div>
  );
}
