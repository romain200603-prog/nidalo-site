import { PublishPage } from '../pages/publish/PublishPage';
import { mount } from './mount';
import '../styles/account.css';
// Les cartes, champs et choix des écrans de Mon compte (ecrans-compte.css, dans le même ordre
// qu'avant), puis ceux propres à la publication.
import '../styles/ecrans-compte.css';
// L'assistant plein écran de l'app, sur toutes les largeurs (à partir de 1024 px, élargi dans la colonne de 720 px),
// mis en dernier pour l'emporter sur les mesures des cartes et des champs de Mon compte (.dsc).
import '../styles/publier-telephone.css';

// Publier : /publier/(?annonce=…), sur ordinateur comme sur téléphone.
mount(<PublishPage />);
