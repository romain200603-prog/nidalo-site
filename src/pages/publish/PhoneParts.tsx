import type { ReactNode } from 'react';
import { BrandMark } from '../../components/BrandMark';
import { Icon } from '../../components/Icon';
import { useDesktop } from '../../lib/desktop';
import { useFitTexts } from '../listing/fitText';

// Publier sur toutes les largeurs, comme l'assistant plein écran de l'app (PublishFlowView.header) : l'en-tête fixe en
// haut, avec ses deux ronds gris de 36, son titre et la barre d'étapes touchable. Le reste de l'écran (étapes, barre du
// bas, confirmation) reprend les éléments des écrans de Mon compte (.dsc), aux mesures de l'app (publier-telephone.css).
// À partir de 1024 px (maquette 12-publier-etape-1.html, publier-ordinateur.css) : l'en-tête simple de la maquette, avec
// le logo de l'app (sans lien), le titre, « Étape N sur 7 · … », la pastille et « Quitter », puis la barre d'étapes.

/**
 * Logo de l'app dans l'en-tête de l'ordinateur. Pas un lien : on ne quitte la publication que par « Quitter » (et sa
 * question s'il y a des changements).
 */
export function PublishBrand() {
  return <p className="ppub-brand"><BrandMark prefix="site-brand" /><span className="visually-hidden">Nidalo</span></p>;
}

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
 * Ordinateur : le logo avant le titre, et la croix devient le bouton « Quitter » de la maquette (même action ;
 * `quitLabel`, « Quitter la publication », est son nom complet). La flèche n'y est pas affichée (publier-ordinateur.css) :
 * « Quitter » ferme, et « Retour », en bas, revient à l'étape d'avant.
 */
export function PhoneHeader({ title, subtitle, backLabel, onBack, action, closeLabel, quitLabel, onClose, progress }: {
  title: string;
  subtitle: string;
  backLabel: string;
  onBack: () => void;
  action: ReactNode;
  closeLabel: string;
  quitLabel: string;
  onClose: () => void;
  progress: ReactNode;
}) {
  const ref = useFitTexts<HTMLDivElement>();
  const desktop = useDesktop();
  return (
    <div className="ppub-head">
      <div ref={ref} className="ppub-head-row">
        <button type="button" className="ppub-round ppub-back" onClick={onBack} aria-label={backLabel}><Icon name="arrowLeft" /></button>
        {desktop && <PublishBrand />}
        <div className="ppub-titles">
          <h1 data-fit="0.8">{title}</h1>
          <p>{subtitle}</p>
        </div>
        {action}
        <button type="button" className="ppub-round dpub-close" onClick={onClose} aria-label={desktop ? quitLabel : closeLabel}>
          <Icon name="x" />{desktop && 'Quitter'}
        </button>
      </div>
      {progress}
    </div>
  );
}
