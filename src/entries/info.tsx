import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PhonePageHeader, SiteFooter, SiteHeader, TabBar } from '../components/Layout';
import { PATHS } from '../lib/paths';
import '../styles/app.css';

// Pages d'information : le texte est déjà dans la page HTML, on ajoute seulement l'en-tête et le bas de page. Sur
// téléphone, pages que l'app n'a pas : le retour et le titre (celui du h1 de la page) en haut.
const header = document.getElementById('header');
const footer = document.getElementById('footer');
const title = document.querySelector('main h1')?.textContent?.trim();
if (header) {
  createRoot(header).render(
    <StrictMode>
      <a className="skip-link" href="#contenu">Aller au contenu</a>
      <SiteHeader section="other" />
      {title && <PhonePageHeader title={title} back={PATHS.home} />}
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
