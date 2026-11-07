import { PublishPage } from '../pages/publish/PublishPage';
import { mount } from './mount';
import '../styles/account.css';
// Ordinateur (≥ 1024 px) : les cartes, champs et choix de « Mon espace », puis ceux propres à la publication.
import '../styles/ordinateur-mon-espace.css';
import '../styles/ordinateur-publier.css';

// Publier : /publier/(?annonce=…) ; sur téléphone, le message « bientôt » d'avant, inchangé.
mount(<PublishPage />);
