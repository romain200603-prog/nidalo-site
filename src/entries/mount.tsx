import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/app.css';

/** Affiche une page React dans l'élément #root de la page HTML. */
export function mount(node: ReactNode) {
  const root = document.getElementById('root');
  if (!root) throw new Error('Élément #root absent');
  createRoot(root).render(<StrictMode>{node}</StrictMode>);
}
