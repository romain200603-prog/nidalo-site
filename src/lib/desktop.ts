import { useSyncExternalStore } from 'react';

// Mise en page « ordinateur » : à partir de 1024 px de large, comme les règles @media de styles/ordinateur.css.
// En dessous, les pages affichent leurs composants actuels, sans aucun changement.

export const DESKTOP_QUERY = '(min-width: 1024px)';

function desktopQuery(): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : null;
  } catch {
    return null;
  }
}

export function isDesktop(): boolean {
  return desktopQuery()?.matches ?? false;
}

function subscribe(listener: () => void): () => void {
  const query = desktopQuery();
  if (!query) return () => undefined;
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** Vrai sur un écran d'ordinateur (≥ 1024 px). Suit le redimensionnement de la fenêtre. */
export function useDesktop(): boolean {
  return useSyncExternalStore(subscribe, isDesktop, () => false);
}
