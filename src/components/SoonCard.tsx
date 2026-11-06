import { Icon } from './Icon';
import type { IconName } from './iconPaths';
import { PATHS } from '../lib/paths';

/**
 * Message « bientôt sur le site » des écrans qui ne sont pas encore sur le site (Messages, Publier), et sur
 * téléphone des écrans faits pour l'ordinateur (demande de visite, offre, comparaison) : le téléphone ne change pas.
 */
export function SoonCard({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <div className="wrap wrap-narrow">
      <div className="card state">
        <Icon name={icon} />
        <h1>{title}</h1>
        <p>{text}</p>
        <a className="btn btn-primary" href={PATHS.search}>
          <Icon name="search" />
          Chercher un bien
        </a>
      </div>
    </div>
  );
}
