import { ContentUnavailable } from '../components/ContentUnavailable';
import { Page } from '../components/Layout';
import { PATHS } from '../lib/paths';
import { mount } from './mount';

mount(
  <Page section="other" phoneHeader={{ title: 'Page introuvable', back: PATHS.home }}>
    <div className="wrap wrap-narrow">
      <ContentUnavailable icon="home" title="Page introuvable" text="Cette adresse ne mène à aucune page de Nidalo." heading="h1">
        <a className="btn btn-light" href={PATHS.home}>Aller à l’accueil</a>
      </ContentUnavailable>
    </div>
  </Page>,
);
