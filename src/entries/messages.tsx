import { MessagesPage } from '../pages/messages/MessagesPage';
import { mount } from './mount';
import '../styles/account.css';
// Ordinateur (≥ 1024 px) : la messagerie de la maquette 3, avec les styles de la feuille d'offre de la fiche.
import '../styles/ordinateur-messages.css';

// Messages : /messages/(?c=…) ; sur téléphone, le message « bientôt » de soon.tsx, inchangé.
mount(<MessagesPage />);
