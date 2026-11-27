import { HomeCardPhoto } from '../../components/HomeListingCard';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { formatArea, formatFraction, formatPrice } from '../../lib/format';
import { propertyTypeLabel } from '../../lib/labels';
import { hotelOf } from '../../lib/listing/fields';
import { cardEuros } from '../../lib/listing/money';
import { scopeLabel } from '../../lib/listingJson';
import type { ListingRow } from '../../lib/listings';
import { listingPath, PATHS, searchModePath } from '../../lib/paths';
import { hotelPerformanceOf } from '../listing/data';

// Accueil sur ordinateur (≥ 1024 px ; maquettes 01-accueil.html et 03-accueil-categorie-choisie.html) : le haut de la
// page (accroche, titre, sous-titre, « Que recherchez-vous ? ») et les trois blocs du bas (hôtels, outils, publier).
// HomePage.tsx ne les affiche qu'à partir de 1024 px ; en dessous, rien ne change. Les textes sont ceux de la maquette,
// gardés seulement quand ils sont vrais pour le site (raccourcis sinon) ; les chiffres de l'hôtel sont ceux de son
// annonce, et seulement ceux qu'elle donne.

/** Haut de l'accueil : accroche, titre (deuxième ligne en bleu), sous-titre, puis la question des catégories. */
export function HomeHero() {
  return (
    <div className="home-hero">
      <p className="home-hero-pill">Vente immobilière, investissement et hôtels</p>
      <h1 className="home-hero-title">L’immobilier mérite mieux <span>qu’une liste d’annonces.</span></h1>
      <p className="home-hero-text">
        Achetez, louez ou investissez entre particuliers et professionnels, avec le rendement locatif calculé pour vous.
      </p>
      <h2 className="home-hero-question">Que recherchez-vous ?</h2>
    </div>
  );
}

type HotelFigure = { label: string; value: string };

/**
 * Chiffres clés de l'hôtel, comme sa fiche : chiffre d'affaires et EBITDA par an, taux d'occupation, RevPAR estimé
 * (chiffre d'affaires ÷ (chambres × 365), seulement avec le chiffre d'affaires, l'EBITDA et le nombre de chambres).
 * Un chiffre absent de l'annonce n'est pas montré ; un chiffre estimé le dit.
 */
function hotelFigures(row: ListingRow): HotelFigure[] {
  const hotel = hotelOf(row);
  if (!hotel) return [];
  const estimate = (origin: string) => (origin === 'estimated' ? ' (est.)' : '');
  const figures: HotelFigure[] = [];
  const { annualRevenue: revenue, occupancyRate: occupancy, ebitda } = hotel;
  if (revenue && revenue.value > 0) figures.push({ label: `Chiffre d’affaires${estimate(revenue.origin)}`, value: `${formatPrice(revenue.value)}/an` });
  if (occupancy) figures.push({ label: `Taux d’occupation${estimate(occupancy.origin)}`, value: formatFraction(occupancy.value, 0) });
  if (ebitda) figures.push({ label: `EBITDA${estimate(ebitda.origin)}`, value: `${formatPrice(ebitda.value)}/an` });
  const revPAR = hotelPerformanceOf(row)?.revPAR ?? null;
  if (revPAR !== null) figures.push({ label: 'RevPAR (est.)', value: cardEuros(revPAR) });
  return figures;
}

/** Un hôtel à vendre que l'accueil a déjà lu : photo, titre de l'annonce (lien vers sa fiche), lieu, prix, chiffres. */
function HotelCard({ row }: { row: ListingRow }) {
  const hotel = hotelOf(row);
  const area = Number(row.living_area);
  const price = Number(row.price);
  const place = [row.city, area > 0 ? formatArea(area) : null, hotel?.scope ? scopeLabel(hotel.scope) : null].filter(Boolean).join(' · ');
  const figures = hotelFigures(row);
  return (
    <article className="home-hotel-card">
      <div className="home-hotel-photo"><HomeCardPhoto row={row} /></div>
      <div className="home-hotel-body">
        <p className="home-hotel-kind">{propertyTypeLabel(row.property_type)}</p>
        <h3><a className="stretched" href={listingPath(row.id)}>{row.title || propertyTypeLabel(row.property_type)}</a></h3>
        {place && <p className="home-hotel-place">{place}</p>}
        {price > 0 && <p className="home-hotel-price">{formatPrice(price)}</p>}
        {figures.length > 0 && (
          <dl className="home-hotel-figures">
            {figures.map((figure) => (
              <div key={figure.label}>
                <dt>{figure.label}</dt>
                <dd>{figure.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}

const TOOLS: { icon: IconName; tint: string; title: string; text: string }[] = [
  { icon: 'map', tint: 'cities', title: 'Recherche sur carte', text: 'Dessinez votre zone : Nidalo affiche les biens qui s’y trouvent.' },
  { icon: 'bars', tint: 'opportunities', title: 'Rendement calculé', text: 'Rendement brut et net, cash-flow et mois type.' },
  { icon: 'columns', tint: 'similar', title: 'Comparateur', text: 'Comparez facilement les biens pour faire le meilleur choix.' },
  { icon: 'messageSquareText', tint: 'hotel', title: 'Échanges directs', text: 'Messagerie avec le vendeur, propositions de visite et offres.' },
];

/**
 * Les trois blocs fixes du bas de l'accueil : « Hôtels à vendre » (avec un hôtel déjà lu par l'accueil, s'il y en a
 * un), « Tout pour décider, au même endroit », « Vous vendez ou louez un bien ? ».
 */
export function HomeComputerBlocks({ hotel }: { hotel: ListingRow | null }) {
  return (
    <>
      <section className="home-hotels" aria-labelledby="hotels-titre">
        <div className="home-hotels-text">
          <span className="home-hotels-icon" aria-hidden="true"><Icon name="bed" /></span>
          <p className="home-hotels-eyebrow">Hôtels à vendre</p>
          <h2 id="hotels-titre">Reprenez un hôtel, chiffres à l’appui</h2>
          <p>Une rubrique dédiée aux hôtels, avec le type de vente et les chiffres clés : chiffre d’affaires, EBITDA, taux d’occupation et RevPAR.</p>
          <a className="home-hotels-link" href={searchModePath('hotel')}>Voir les hôtels<Icon name="arrowRight" /></a>
        </div>
        {hotel && <HotelCard row={hotel} />}
      </section>

      <section className="home-tools" aria-labelledby="outils-titre">
        <h2 id="outils-titre">Tout pour décider, au même endroit</h2>
        <p>Les outils que vous retrouvez dans Nidalo.</p>
        <ul className="home-tools-list">
          {TOOLS.map((tool) => (
            <li key={tool.title} className="home-tool">
              <span className={`home-tool-icon tint-${tool.tint}`} aria-hidden="true"><Icon name={tool.icon} /></span>
              <h3>{tool.title}</h3>
              <p>{tool.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-sell" aria-labelledby="vendre-titre">
        <div className="home-sell-text">
          <h2 id="vendre-titre">Vous vendez ou louez un bien ?</h2>
          <p>Publiez votre annonce en quelques étapes guidées, que vous soyez particulier ou professionnel.</p>
          <p className="home-sell-note"><Icon name="lock" />L’adresse exacte de votre bien peut rester masquée.</p>
        </div>
        <a className="home-sell-link" href={PATHS.publish}><Icon name="plus" />Publier une annonce</a>
      </section>
    </>
  );
}
