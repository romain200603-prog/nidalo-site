import { mount } from './mount';
import { ListingPage } from '../pages/ListingPage';
import '../styles/listing.css';
// Les écrans « Demander une visite » et « Faire une offre » (communs avec Messages).
import '../styles/ecrans-fiche-telephone.css';
// Ordinateur (à partir de 1024 px) : la fiche en deux colonnes et la fenêtre « Faire une offre ».
import '../styles/fiche-ordinateur.css';

// Page d'une annonce : /annonce/?id=…(&mode=invest), d'après la fiche de l'app.
document.body.classList.add('page-listing');
mount(<ListingPage />);
