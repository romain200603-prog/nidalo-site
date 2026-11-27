import { BrandMark } from './BrandMark';
import { Icon } from './Icon';
import { StrokeIcon } from './StrokeIcon';
import type { Section } from './Layout';
import { useSession, useStore } from '../lib/account/session';
import { badgeText, messagesLabel, notificationsLabel } from '../lib/badges';
import { CONTACT_EMAIL } from '../lib/config';
import { SEARCH_MODES } from '../lib/labels';
import { notificationsStore, unreadNotificationCount } from '../lib/notifications';
import { accountPath, PATHS, searchModePath } from '../lib/paths';
import '../styles/cadre-ordinateur.css';

// Cadre de l'ordinateur (à partir de 1024 px, maquettes 01-accueil.html et 08-favoris.html) : l'en-tête en haut de
// chaque page à la place de la barre d'onglets, et le pied de page (grand sur l'accueil, fin ailleurs). Affichés par
// Layout.tsx et entries/info.tsx seulement sur un écran d'ordinateur ; en dessous, la page garde sa barre d'onglets et
// son pied de page. Mêmes adresses et mêmes données que la barre d'onglets et la cloche de l'accueil.

function current(active: boolean) {
  return active ? ('page' as const) : undefined;
}

/**
 * En-tête de l'ordinateur : le logo (accueil) ; Accueil, Favoris et Messages, avec la pastille des messages non lus
 * (`unread`, lue une fois pour la page par Layout : mêmes règles que la barre d'onglets) ; à droite la cloche de l'accueil
 * (Notifications, point rouge des notifications non lues déjà lues par la page), « Publier une annonce » et « Mon compte ».
 * L'élément de la page en cours est mis en évidence (aria-current), comme l'onglet de la barre : Accueil aussi pour la
 * recherche et les annonces.
 */
export function SiteHeader({ section, unread }: { section: Section; unread: number }) {
  const session = useSession();
  const notifications = useStore(notificationsStore);
  // Comme la cloche de l'accueil : seulement avec un compte, une fois les notifications lues par la page.
  const bell = session.status === 'signedIn' && notifications.status === 'ready' ? unreadNotificationCount(notifications.items) : 0;
  return (
    <header className="site-header">
      <div className="site-container site-header-row">
        <a className="site-header-brand" href={PATHS.home} aria-label="Nidalo, accueil">
          <BrandMark prefix="site-brand" />
        </a>
        <nav className="site-header-nav" aria-label="Navigation principale">
          <a href={PATHS.home} aria-current={current(section === 'home' || section === 'search')}>
            <StrokeIcon glyph="house" inkWidth={16} lineWidth={1.6} className="icon site-header-house" />
            Accueil
          </a>
          <a href={PATHS.favorites} aria-current={current(section === 'favorites')}>
            <Icon name="heart" />
            Favoris
          </a>
          <a href={PATHS.messages} aria-current={current(section === 'messages')} aria-label={unread > 0 ? messagesLabel(unread) : undefined}>
            <Icon name="messageSquareText" />
            Messages
            {unread > 0 && <span className="site-header-badge" aria-hidden="true">{badgeText(unread, 99)}</span>}
          </a>
        </nav>
        <div className="site-header-actions">
          <a className="site-header-bell" href={accountPath('notifications')} aria-label={notificationsLabel(bell)}>
            <Icon name="bell" />
            {bell > 0 && <span className="site-header-dot" aria-hidden="true" />}
          </a>
          <a className="site-header-publish" href={PATHS.publish} aria-current={current(section === 'publish')}>
            <Icon name="plus" />
            Publier une annonce
          </a>
          <a className="site-header-account" href={PATHS.account} aria-current={current(section === 'account')}>
            <span className="site-header-avatar"><Icon name="userRound" /></span>
            Mon compte
          </a>
        </div>
      </div>
    </header>
  );
}

type FooterLink = [label: string, href: string];

/** Pages d'information du pied de page : les pages qui existent déjà, puis l'aide et le contact de l'ancien pied. */
const INFORMATION_LINKS: FooterLink[] = [
  ['Conditions générales d’utilisation', PATHS.terms],
  ['Mentions légales', PATHS.legal],
  ['Politique de confidentialité', PATHS.privacy],
  ['Aide', PATHS.help],
  ['Contact', `mailto:${CONTACT_EMAIL}`],
];

/** « Mon espace » : les pages du compte de la barre d'onglets. */
const SPACE_LINKS: FooterLink[] = [
  ['Favoris', PATHS.favorites],
  ['Messages', PATHS.messages],
  ['Publier une annonce', PATHS.publish],
  ['Mon compte', PATHS.account],
];

/** « Annonces » : la recherche de chaque catégorie, sans critère (la même adresse que ses pavés). */
const CATEGORY_LINKS: FooterLink[] = SEARCH_MODES.map(({ mode, label }) => [label, searchModePath(mode)]);

/** Une colonne de liens du grand pied de page, titrée. */
function FooterColumn({ id, title, wide = false, links }: { id: string; title: string; wide?: boolean; links: FooterLink[] }) {
  return (
    <nav className={wide ? 'site-footer-column is-wide' : 'site-footer-column'} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <ul>
        {links.map(([label, href]) => <li key={href}><a href={href}>{label}</a></li>)}
      </ul>
    </nav>
  );
}

/**
 * Pied de page de l'ordinateur. `large` (l'accueil, comme la maquette 01) : le logo et sa phrase, les colonnes Annonces
 * (la recherche de chaque catégorie), Mon espace et Informations, puis « © 2026 Nidalo » et l'avertissement sur les
 * rendements. Sinon (maquettes 05, 06, 08, 09 et 11) : une seule ligne, « © 2026 Nidalo » et les pages d'information.
 */
export function SiteFooter({ large }: { large: boolean }) {
  if (!large) {
    return (
      <footer className="site-footer is-slim">
        <div className="site-container site-footer-line">
          <p>© 2026 Nidalo</p>
          <nav aria-label="Informations">
            {INFORMATION_LINKS.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
          </nav>
        </div>
      </footer>
    );
  }
  return (
    <footer className="site-footer">
      <div className="site-container site-footer-inner">
        <div className="site-footer-top">
          <div className="site-footer-brand">
            <p className="site-footer-logo"><BrandMark prefix="site-brand" /><span className="visually-hidden">Nidalo</span></p>
            <p className="site-footer-tagline">Vente immobilière, investissement et hôtels, entre particuliers et professionnels.</p>
          </div>
          <FooterColumn id="pied-annonces" title="Annonces" links={CATEGORY_LINKS} />
          <FooterColumn id="pied-mon-espace" title="Mon espace" links={SPACE_LINKS} />
          <FooterColumn id="pied-informations" title="Informations" wide links={INFORMATION_LINKS} />
        </div>
        <div className="site-footer-bottom">
          <p>© 2026 Nidalo</p>
          <p>Les rendements affichés sont des estimations calculées à partir des informations communiquées par le vendeur. Ils ne constituent pas un conseil en investissement.</p>
        </div>
      </div>
    </footer>
  );
}
