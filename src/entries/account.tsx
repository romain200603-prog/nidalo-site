import { AccountPage } from '../pages/AccountPage';
import { mount } from './mount';
// Ordinateur (≥ 1024 px) : « Mon espace » de la maquette 5 ; puis ses écrans (agenda, visite, projet, biens consultés)
// et Notifications, communs avec le téléphone.
import '../styles/ordinateur-mon-espace.css';
import '../styles/ecrans-compte.css';

mount(<AccountPage />);
