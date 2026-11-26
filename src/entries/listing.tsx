import { mount } from './mount';
import { ListingPage } from '../pages/ListingPage';
import '../styles/listing.css';
// Les écrans « Demander une visite » et « Faire une offre » (communs avec Messages).
import '../styles/ecrans-fiche-telephone.css';

// Page d'une annonce : /annonce/?id=…(&mode=invest), d'après la fiche de l'app.
document.body.classList.add('page-listing');
mount(<ListingPage />);
