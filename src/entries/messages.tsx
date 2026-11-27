import { MessagesPage } from '../pages/messages/MessagesPage';
import { mount } from './mount';
import '../styles/account.css';
// Messagerie à toutes les largeurs (demande du 14 novembre 2026), avec les styles des écrans d'offre et de visite de la fiche.
import '../styles/messages.css';
// Morceaux de l'app : réponses, transferts, réactions, liste (demande du 17/11).
import '../styles/messages-app.css';
// Ordinateur (à partir de 1024 px) : la liste et la conversation côte à côte (version ordinateur, étape 5).
import '../styles/messages-ordinateur.css';

// Messages : /messages/(?c=…) ; la liste, puis la conversation par-dessus, comme l'app ; côte à côte à partir de 1024 px.
mount(<MessagesPage />);
