import type { ReactNode } from 'react';
// Styles communs d'abord : les styles des écrans (compte, favoris, annonce) viennent après et les précisent.
import '../styles/app.css';
import { Icon } from './Icon';
import type { IconName } from './iconPaths';
import { SignInSheet } from './account/SignInSheet';
import { CONTACT_EMAIL } from '../lib/config';
import { PATHS } from '../lib/paths';

export type Section = 'home' | 'search' | 'favorites' | 'publish' | 'messages' | 'account' | 'other';

function current(active: boolean) {
  return active ? ('page' as const) : undefined;
}

export function Brand() {
  return (
    <a className="brand" href={PATHS.home} aria-label="Nidalo, accueil">
      <img className="brand-tile" src="/assets/logo-tile.svg" width={36} height={36} alt="" />
      <img className="brand-word" src="/assets/wordmark-white.svg" width={85} height={13} alt="" />
    </a>
  );
}

const TOP_LINKS: { section: Section; href: string; label: string; icon: IconName }[] = [
  { section: 'search', href: PATHS.search, label: 'Rechercher', icon: 'search' },
  { section: 'favorites', href: PATHS.favorites, label: 'Favoris', icon: 'heart' },
  { section: 'messages', href: PATHS.messages, label: 'Messages', icon: 'messages' },
  { section: 'account', href: PATHS.account, label: 'Mon compte', icon: 'user' },
];

export function Header({ section }: { section: Section }) {
  return (
    <header className="topbar">
      <div className="wrap">
        <Brand />
        <nav className="topnav" aria-label="Menu principal">
          {TOP_LINKS.map((link) => (
            <a key={link.section} href={link.href} aria-current={current(section === link.section)}>
              <Icon name={link.icon} />
              {link.label}
            </a>
          ))}
          <a className="publish" href={PATHS.publish} aria-current={current(section === 'publish')}>
            <Icon name="plus" />
            Publier
          </a>
        </nav>
      </div>
    </header>
  );
}

/** Barre du bas sur téléphone, comme l'app : Accueil · Favoris · + · Messages · Mon compte. */
export function TabBar({ section }: { section: Section }) {
  return (
    <nav className="tabbar" aria-label="Menu">
      <a href={PATHS.home} aria-current={current(section === 'home' || section === 'search')}>
        <Icon name="house" />
        Accueil
      </a>
      <a href={PATHS.favorites} aria-current={current(section === 'favorites')}>
        <Icon name="heart" />
        Favoris
      </a>
      <a href={PATHS.publish} aria-current={current(section === 'publish')} aria-label="Publier une annonce">
        <span className="plus">
          <Icon name="plus" />
        </span>
      </a>
      <a href={PATHS.messages} aria-current={current(section === 'messages')}>
        <Icon name="messages" />
        Messages
      </a>
      <a href={PATHS.account} aria-current={current(section === 'account')}>
        <Icon name="user" />
        Mon compte
      </a>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <nav aria-label="Informations">
          <a href={PATHS.help}>Aide</a>
          <a href={PATHS.privacy}>Confidentialité</a>
          <a href={PATHS.legal}>Mentions légales</a>
          <a href={PATHS.terms}>Conditions</a>
          <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
        </nav>
        <p>© 2026 Nidalo</p>
      </div>
    </footer>
  );
}

/** Le site refuse de s'afficher dans le cadre d'un autre site (protection contre les clics piégés). */
export function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function Framed() {
  return (
    <main className="wrap wrap-narrow">
      <div className="card state">
        <h1>Ouvrez Nidalo dans son propre onglet</h1>
        <p>Pour votre sécurité, Nidalo ne s’affiche pas à l’intérieur d’un autre site.</p>
        <a className="btn btn-primary" href="https://nidalo.fr/" target="_top" rel="noopener">
          Aller sur nidalo.fr
        </a>
      </div>
    </main>
  );
}

export function Page({ section, children, wide = false }: { section: Section; children: ReactNode; wide?: boolean }) {
  if (isFramed()) return <Framed />;
  return (
    <div className={wide ? 'page page-wide' : 'page'}>
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <Header section={section} />
      <main id="contenu" tabIndex={-1}>
        {children}
      </main>
      <Footer />
      <TabBar section={section} />
      <SignInSheet />
    </div>
  );
}
