import { CONTACT_EMAIL } from '../lib/config';
import { SEARCH_MODES } from '../lib/labels';
import { PATHS, searchModePath } from '../lib/paths';

// Pied de page sur ordinateur (≥ 1024 px) : bleu (celui du bandeau de l'app), quatre colonnes, puis « © 2026 Nidalo » et les liens légaux.
// Seulement des liens vers des pages qui existent déjà sur le site. Libellés de la maquette, qui sont ceux de l'app
// (« Vos favoris », « Aide et assistance », « CGU ») ; « Donner mon avis » et « Informations légales » ne sont pas des pages.

export function DesktopFooter() {
  return (
    <footer className="dfoot">
      <div className="dfoot-inner">
        <div className="dfoot-grid">
          <div className="dfoot-brand">
            <a className="dfoot-logo" href={PATHS.home} aria-label="Nidalo, accueil">
              <img className="dfoot-tile" src="/assets/logo-tile.svg" width={36} height={36} alt="" />
              <img className="dfoot-word" src="/assets/wordmark-white.svg" width={81} height={13} alt="" />
            </a>
            <p>Vos échanges, votre futur chez-vous.</p>
          </div>
          <nav className="dfoot-column" aria-labelledby="dfoot-rechercher">
            <h2 id="dfoot-rechercher">Rechercher</h2>
            <ul>
              {SEARCH_MODES.map((item) => <li key={item.mode}><a href={searchModePath(item.mode)}>{item.label}</a></li>)}
            </ul>
          </nav>
          <nav className="dfoot-column" aria-labelledby="dfoot-compte">
            <h2 id="dfoot-compte">Mon compte</h2>
            <ul>
              <li><a href={PATHS.account}>Mon espace</a></li>
              <li><a href={PATHS.favorites}>Vos favoris</a></li>
              <li><a href={PATHS.messages}>Messages</a></li>
              <li><a href={PATHS.publish}>Publier une annonce</a></li>
            </ul>
          </nav>
          <nav className="dfoot-column" aria-labelledby="dfoot-aide">
            <h2 id="dfoot-aide">Aide</h2>
            <ul>
              <li><a href={PATHS.help}>Aide et assistance</a></li>
              <li><a href={`mailto:${CONTACT_EMAIL}`}>Contact</a></li>
            </ul>
          </nav>
        </div>
        <div className="dfoot-bottom">
          <p>© 2026 Nidalo</p>
          <nav className="dfoot-legal" aria-label="Informations légales">
            <a href={PATHS.terms}>CGU</a>
            <span aria-hidden="true"> · </span>
            <a href={PATHS.privacy}>Confidentialité</a>
            <span aria-hidden="true"> · </span>
            <a href={PATHS.legal}>Mentions légales</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
