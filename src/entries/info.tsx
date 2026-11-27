import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Footer, PhonePageHeader, TabBar } from '../components/Layout';
import { SiteFooter, SiteHeader } from '../components/SiteFrame';
import { useTabBarBadge } from '../lib/badges';
import { useDesktop } from '../lib/desktop';
import { PATHS } from '../lib/paths';
import '../styles/app.css';

// Pages d'information : le texte est déjà dans la page HTML, on ajoute seulement l'en-tête et le bas de page. Pages que
// l'app n'a pas : le retour et le titre (celui du h1 de la page) en haut, sur toutes les largeurs. À partir de 1024 px,
// l'en-tête et le pied de page de l'ordinateur à la place de la barre d'onglets et du pied de page du web.
const header = document.getElementById('header');
const footer = document.getElementById('footer');
const title = document.querySelector('main h1')?.textContent?.trim();

/** Haut de la page : lien d'évitement, en-tête de l'ordinateur, retour et titre. */
function InfoTop() {
  const desktop = useDesktop();
  // Pastille Messages de l'en-tête : la valeur lue par le bas de la page (InfoBottom), sans seconde lecture.
  const unread = useTabBarBadge(false);
  return (
    <>
      <a className="skip-link" href="#contenu">Aller au contenu</a>
      {desktop && <SiteHeader section="other" unread={unread} />}
      {title && <PhonePageHeader title={title} back={PATHS.home} />}
    </>
  );
}

/** Bas de la page : pied de page et barre d'onglets (téléphone), ou pied de page de l'ordinateur. */
function InfoBottom() {
  const desktop = useDesktop();
  // Les non-lus sont lus ici, une fois pour la page, comme la barre d'onglets ; l'en-tête suit la même valeur.
  const unread = useTabBarBadge(true);
  return desktop ? <SiteFooter large={false} /> : (
    <>
      <Footer />
      <TabBar section="other" unread={unread} />
    </>
  );
}

if (header) {
  createRoot(header).render(
    <StrictMode>
      <InfoTop />
    </StrictMode>,
  );
}
if (footer) {
  createRoot(footer).render(
    <StrictMode>
      <InfoBottom />
    </StrictMode>,
  );
}
