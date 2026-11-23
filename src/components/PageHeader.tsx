import type { MouseEvent, ReactNode } from 'react';
import { useFitTexts } from '../pages/listing/fitText';
import { RoundButton } from './RoundButton';
import '../styles/pieces-app.css';

/** Arrivée depuis une autre page du site : le retour y ramène, comme le retour d'un écran poussé de l'app. */
export function cameFromSite(): boolean {
  try {
    return window.history.length > 1 && document.referrer !== '' && new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Retour à la page précédente du site s'il y en a une ; sinon le lien (`back`) s'ouvre. Ctrl, ⌘, Maj : le lien. */
function backInHistory(event: MouseEvent<HTMLElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !cameFromSite()) return;
  event.preventDefault();
  window.history.back();
}

/**
 * En-tête d'une page poussée de l'app (NidaloPageHeader, DesignSystem/Components/NidaloMenuComponents.swift) : retour
 * rond à gauche, titre de 17 gras centré sur la page (56 de marge de chaque côté), élément facultatif à droite. Comme
 * `minimumScaleFactor(0.8)`, un titre trop long rapetisse jusqu'à 80 % de sa taille avant d'être coupé par « … ».
 */
export function PageHeader({ title, back, onBack, trailing, className, history = false, decorative = false }: {
  title: string;
  /** Page du retour (lien) ; sans elle, `onBack`. */
  back?: string;
  onBack?: () => void;
  trailing?: ReactNode;
  className?: string;
  /** Pages que l'app n'a pas : le retour ramène à la page précédente du site, `back` sinon. */
  history?: boolean;
  /** Le titre de la page est déjà dans la page (son h1, masqué à l'écran) : ce titre-ci est seulement affiché. */
  decorative?: boolean;
}) {
  const Title = decorative ? 'p' : 'h1';
  const ref = useFitTexts<HTMLDivElement>();
  return (
    <div ref={ref} className={className ? `app-page-header ${className}` : 'app-page-header'}>
      <RoundButton icon="arrowLeft" label="Retour" href={onBack ? undefined : back} onClick={onBack ?? (history ? backInHistory : undefined)} />
      <Title className="app-page-header-title" data-fit="0.8" aria-hidden={decorative || undefined}>{title}</Title>
      {trailing && <div className="app-page-header-trailing">{trailing}</div>}
    </div>
  );
}
