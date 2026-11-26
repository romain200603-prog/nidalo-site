import type { ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { useFitTexts } from '../listing/fitText';

// Publier sur téléphone (moins de 1024 px), comme l'assistant plein écran de l'app (PublishFlowView.header) : l'en-tête
// fixe en haut, avec ses deux ronds gris de 36, son titre et la barre d'étapes touchable. Le reste de l'écran (étapes,
// barre du bas, confirmation) garde les éléments de l'ordinateur, aux mesures de l'app (publier-telephone.css).

/** Coche pleine dans un rond (checkmark.circle.fill) : « Brouillon enregistré » et la confirmation. */
export function CheckCircleFill({ className }: { className?: string }) {
  return (
    <svg className={className ? `ppub-check ${className}` : 'ppub-check'} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="11" />
      <path d="m7.4 12.3 3.1 3.1 6.1-6.3" />
    </svg>
  );
}

/**
 * En-tête de l'assistant : le retour (l'étape d'avant ; à la première étape, il ferme), le titre de 20 gras sur une
 * ligne (il rapetisse jusqu'à 80 %), « Étape 2 sur 7 · … », la pastille « Brouillon » ou « Enregistrer » (`action`),
 * la croix, puis la barre d'étapes (`progress`). Il reste en haut de l'écran pendant que l'étape défile.
 */
export function PhoneHeader({ title, subtitle, backLabel, onBack, action, closeLabel, onClose, progress }: {
  title: string;
  subtitle: string;
  backLabel: string;
  onBack: () => void;
  action: ReactNode;
  closeLabel: string;
  onClose: () => void;
  progress: ReactNode;
}) {
  const ref = useFitTexts<HTMLDivElement>();
  return (
    <div className="ppub-head">
      <div ref={ref} className="ppub-head-row">
        <button type="button" className="ppub-round ppub-back" onClick={onBack} aria-label={backLabel}><Icon name="arrowLeft" /></button>
        <div className="ppub-titles">
          <h1 data-fit="0.8">{title}</h1>
          <p>{subtitle}</p>
        </div>
        {action}
        <button type="button" className="ppub-round dpub-close" onClick={onClose} aria-label={closeLabel}><Icon name="x" /></button>
      </div>
      {progress}
    </div>
  );
}
