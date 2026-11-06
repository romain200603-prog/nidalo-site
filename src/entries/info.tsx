import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteFooter, SiteHeader, TabBar } from '../components/Layout';
import '../styles/app.css';

// Pages d'information : le texte est déjà dans la page HTML, on ajoute seulement l'en-tête et le bas de page.
const header = document.getElementById('header');
const footer = document.getElementById('footer');
if (header) {
  createRoot(header).render(
    <StrictMode>
      <a className="skip-link" href="#contenu">Aller au contenu</a>
      <SiteHeader section="other" />
    </StrictMode>,
  );
}
if (footer) {
  createRoot(footer).render(
    <StrictMode>
      <SiteFooter />
      <TabBar section="other" />
    </StrictMode>,
  );
}
