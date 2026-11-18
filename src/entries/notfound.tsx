import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { PATHS } from '../lib/paths';
import { mount } from './mount';

mount(
  <Page section="other" phoneHeader={{ title: 'Page introuvable', back: PATHS.home }}>
    <div className="wrap wrap-narrow">
      <div className="card state">
        <Icon name="home" />
        <h1>Page introuvable</h1>
        <p>Cette adresse ne mène à aucune page de Nidalo.</p>
        <a className="btn btn-light" href={PATHS.home}>Aller à l’accueil</a>
      </div>
    </div>
  </Page>,
);
