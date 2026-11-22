import { Icon } from './Icon';
import '../styles/pieces-app.css';
import '../styles/hors-ligne.css';

// « Pas de connexion Internet » de l'app (DomiaEmptyState.offline, textes de LoadFailure) : le même état sur tous les
// écrans qui lisent des données et n'ont rien à montrer (Favoris, Comparer ; Messages ensuite). Icône du wifi barré,
// titre de 16 gras bleu marine, texte de 13 gris, puis « Réessayer », bouton secondaire de l'app (200 au plus).

/** Textes de l'état, les mêmes partout (LoadFailure.offlineTitle, offlineDescription, retryTitle). */
export const OFFLINE_TITLE = 'Pas de connexion Internet';
export const OFFLINE_TEXT = 'Vérifiez votre connexion, puis réessayez.';
export const RETRY_TITLE = 'Réessayer';

export function OfflineState({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <div className={`app-unavailable app-offline${className ? ` ${className}` : ''}`} role="alert">
      <Icon name="wifiOff" className="icon app-unavailable-icon" />
      <h2>{OFFLINE_TITLE}</h2>
      <p>{OFFLINE_TEXT}</p>
      <button type="button" className="app-offline-retry" onClick={onRetry}>{RETRY_TITLE}</button>
    </div>
  );
}
