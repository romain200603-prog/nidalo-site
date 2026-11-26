import { useId } from 'react';
import '../styles/pieces-app.css';
import '../styles/hors-ligne.css';

// « Pas de connexion Internet » de l'app (DomiaEmptyState.offline, textes de LoadFailure) : le même état sur tous les
// écrans qui lisent des données et n'ont rien à montrer (Accueil, Recherche, Favoris, Comparer, Messages, Agenda…).
// Icône du wifi barré (wifi.slash), titre de 16 gras bleu marine, texte de 13 gris, puis « Réessayer », bouton
// secondaire de l'app (200 au plus). L'autre échec de chargement (DomiaEmptyState.failed) : LoadErrorState.

/** Textes de l'état, les mêmes partout (LoadFailure.offlineTitle, offlineDescription, retryTitle). */
export const OFFLINE_TITLE = 'Pas de connexion Internet';
export const OFFLINE_TEXT = 'Vérifiez votre connexion, puis réessayez.';
export const RETRY_TITLE = 'Réessayer';

// Le wifi des symboles de l'iPhone redessiné : trois arcs à bouts ronds de 96° autour d'un point plein. Les découpes
// (le trait de wifi.slash, le point d'exclamation de wifi.exclamationmark) sont des masques : leur identifiant est
// propre à chaque icône de la page.
const ARCS = (cx: number, radii: number[]) => radii.map((r) => {
  const dx = Math.round(r * Math.cos((42 * Math.PI) / 180) * 1000) / 1000;
  const dy = Math.round(r * Math.sin((42 * Math.PI) / 180) * 1000) / 1000;
  return `M${Math.round((cx - dx) * 1000) / 1000} ${Math.round((19.5 - dy) * 1000) / 1000} A${r} ${r} 0 0 1 ${Math.round((cx + dx) * 1000) / 1000} ${Math.round((19.5 - dy) * 1000) / 1000}`;
}).join(' ');

/** wifi.slash : le wifi barré d'un trait du haut à gauche au bas à droite, détaché des arcs. */
export function WifiSlashIcon({ className = 'icon' }: { className?: string }) {
  const mask = `wifi-slash-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" focusable="false">
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#FFFFFF" stroke="none" />
        <path d="M3 3 21 21" stroke="#000000" strokeWidth={4} />
      </mask>
      <g mask={`url(#${mask})`}>
        <path d={ARCS(12, [4.5, 9, 13.5])} />
        <circle cx="12" cy="19.5" r="1.6" fill="currentColor" stroke="none" />
      </g>
      <path d="M3 3 21 21" />
    </svg>
  );
}

/** wifi.exclamationmark : le wifi, décalé à gauche, et un point d'exclamation à sa droite. */
export function WifiExclamationIcon({ className = 'icon' }: { className?: string }) {
  const mask = `wifi-alert-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" focusable="false">
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#FFFFFF" stroke="none" />
        <rect x="18.1" y="0" width="5.9" height="24" fill="#000000" stroke="none" />
      </mask>
      <g mask={`url(#${mask})`}>
        <path d={ARCS(10, [4, 8, 12])} />
        <circle cx="10" cy="19.5" r="1.6" fill="currentColor" stroke="none" />
      </g>
      <path d="M21 11.5v4.5" />
      <circle cx="21" cy="19.6" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function OfflineState({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <div className={`app-unavailable app-offline${className ? ` ${className}` : ''}`} role="alert">
      <WifiSlashIcon className="icon app-unavailable-icon" />
      <h2>{OFFLINE_TITLE}</h2>
      <p>{OFFLINE_TEXT}</p>
      <button type="button" className="app-offline-retry" onClick={onRetry}>{RETRY_TITLE}</button>
    </div>
  );
}

/**
 * Autre échec de chargement (DomiaEmptyState.failed de l'app) : le titre et le texte de l'écran (« Erreur »,
 * « Impossible de charger les annonces. Réessayez dans un instant. » pour la recherche), avec « Réessayer ».
 */
export function LoadErrorState({ title, message, onRetry, className }: { title: string; message: string; onRetry: () => void; className?: string }) {
  return (
    <div className={`app-unavailable app-offline${className ? ` ${className}` : ''}`} role="alert">
      <WifiExclamationIcon className="icon app-unavailable-icon" />
      <h2>{title}</h2>
      <p>{message}</p>
      <button type="button" className="app-offline-retry" onClick={onRetry}>{RETRY_TITLE}</button>
    </div>
  );
}
