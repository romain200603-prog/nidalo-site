import { MessagesPage } from '../pages/messages/MessagesPage';
import { mount } from './mount';
import '../styles/account.css';
// Messagerie à toutes les largeurs (demande du 14 novembre 2026), avec les styles des écrans d'offre et de visite de la fiche.
import '../styles/messages.css';

// Messages : /messages/(?c=…) ; deux colonnes à partir de 1024 px, une seule en dessous (comme l'app).
mount(<MessagesPage />);
