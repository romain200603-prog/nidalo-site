import { PublishPage } from '../pages/publish/PublishPage';
import { mount } from './mount';
import '../styles/account.css';
// Ordinateur (≥ 1024 px) : les cartes, champs et choix des écrans de Mon compte (ecrans-compte.css, dans le même ordre
// qu'avant), puis ceux propres à la publication.
import '../styles/ordinateur-mon-espace.css';
import '../styles/ecrans-compte.css';
import '../styles/ordinateur-publier.css';
// Téléphone (< 1024 px) : l'assistant plein écran de l'app, mis en dernier pour l'emporter sur les mesures d'ordinateur
// des cartes et des champs (.dsc).
import '../styles/publier-telephone.css';

// Publier : /publier/(?annonce=…), sur ordinateur comme sur téléphone.
mount(<PublishPage />);
