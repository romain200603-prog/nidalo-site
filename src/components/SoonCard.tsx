import { ContentUnavailable } from './ContentUnavailable';
import { Icon } from './Icon';
import type { IconName } from './iconPaths';
import { PATHS } from '../lib/paths';

/**
 * Message « bientôt sur le site » des écrans qui ne sont pas encore sur le site (Publier), et sur téléphone des écrans
 * faits pour l'ordinateur (comparaison) : l'écran sans carte de l'app (ContentUnavailable), avec « Chercher un bien ».
 */
export function SoonCard({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <div className="wrap wrap-narrow">
      <ContentUnavailable icon={icon} title={title} text={text} heading="h1" className="soon-page">
        <a className="btn btn-light" href={PATHS.search}>
          <Icon name="search" />
          Chercher un bien
        </a>
      </ContentUnavailable>
    </div>
  );
}
