import '../styles/pieces-app.css';

/**
 * Barre d'étapes des assistants de l'app (StepProgressBar, DesignSystem/Components/StepProgressBar.swift), sans appui :
 * un segment arrondi de 4 par étape, 4 entre eux, bleu jusqu'à l'étape en cours (comptée à partir de 0), décorative
 * (le texte « Étape 2 sur 2 » est lu à côté).
 */
export function StepProgressBar({ current, total, className }: { current: number; total: number; className?: string }) {
  return (
    <div className={className ? `app-step-bar ${className}` : 'app-step-bar'} aria-hidden="true">
      {Array.from({ length: total }, (_, index) => <span key={index} className={index <= current ? 'is-done' : undefined} />)}
    </div>
  );
}
