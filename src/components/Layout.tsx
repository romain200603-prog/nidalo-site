import type { ReactNode } from 'react';
// Styles communs d'abord : les styles des écrans (compte, favoris, annonce) viennent après et les précisent.
import '../styles/app.css';
// Police Inter (toutes les largeurs) et valeurs --d-* des pages de l'ordinateur pas encore refaites (≥ 1024 px).
import '../styles/ordinateur.css';
import { ToastHost } from './AppToast';
import { ContentUnavailable } from './ContentUnavailable';
import { Icon } from './Icon';
import { PageHeader } from './PageHeader';
import { SignInSheet } from './account/SignInSheet';
import { StrokeIcon } from './StrokeIcon';
import { badgeText, messagesLabel, useTabBarBadge } from '../lib/badges';
import { CONTACT_EMAIL } from '../lib/config';
import { PATHS } from '../lib/paths';

// Le cadre de toutes les pages, comme l'app sur toutes les largeurs : pas de barre en haut (chaque page commence comme
// son écran de l'app), la barre d'onglets en bas, et le pied de page du web (mentions légales) au bas de chaque page.

export type Section = 'home' | 'search' | 'favorites' | 'publish' | 'messages' | 'account' | 'other';

function current(active: boolean) {
  return active ? ('page' as const) : undefined;
}

/** Fiche d'une annonce : la barre du bas y est masquée (hidesTabBar de l'app), sa pastille n'est pas lue. */
function isListingPage(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/annonce/');
}

/**
 * Barre d'onglets de l'app (AppTabBar.swift), sur toutes les largeurs : Accueil · Favoris · « + » Publier · Messages ·
 * Mon compte, chacun avec son libellé dessous, et la pastille des messages non lus sur Messages (« 99+ » au-delà de 99,
 * n° 44). La page Messages lit déjà ses non-lus en direct. Icônes de l'app : maison redessinée (encre de 18, trait de
 * 1,6), cœur Lucide de 24, carré bleu de 28 au « + » de 18, bulle message-square-text de 19,56, circle-user de 22. À
 * partir de 1024 px, son fond blanc couvre toute la fenêtre, ses cinq boutons dans la colonne de 720 px au centre.
 */
export function TabBar({ section }: { section: Section }) {
  const unread = useTabBarBadge(section !== 'messages' && !isListingPage());
  return (
    <nav className="tabbar" aria-label="Menu">
      <a href={PATHS.home} aria-current={current(section === 'home' || section === 'search')}>
        <span className="tabbar-icon"><StrokeIcon glyph="house" inkWidth={18} lineWidth={1.6} className="icon tabbar-house" /></span>
        <span className="tabbar-label">Accueil</span>
      </a>
      <a href={PATHS.favorites} aria-current={current(section === 'favorites')}>
        <span className="tabbar-icon"><Icon name="heart" className="icon tabbar-heart" /></span>
        <span className="tabbar-label">Favoris</span>
      </a>
      {/* Un bouton, pas un onglet, dans l'app : jamais en bleu ; son libellé pour les lecteurs d'écran. */}
      <a className="tabbar-publish" href={PATHS.publish} aria-current={current(section === 'publish')} aria-label="Publier une annonce">
        <span className="tabbar-icon"><span className="plus"><Icon name="plus" /></span></span>
        <span className="tabbar-label">Publier</span>
      </a>
      <a href={PATHS.messages} aria-current={current(section === 'messages')} aria-label={unread > 0 ? messagesLabel(unread) : undefined}>
        <span className="tabbar-icon">
          <Icon name="messageSquareText" className="icon tabbar-messages" />
          {unread > 0 && <span className={`tabbar-badge${unread > 9 ? ' is-wide' : ''}`} aria-hidden="true">{badgeText(unread, 99)}</span>}
        </span>
        <span className="tabbar-label">Messages</span>
      </a>
      <a href={PATHS.account} aria-current={current(section === 'account')}>
        <span className="tabbar-icon"><Icon name="user" className="icon tabbar-account" /></span>
        <span className="tabbar-label">Mon compte</span>
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
      <ContentUnavailable icon="lock" title="Ouvrez Nidalo dans son propre onglet" heading="h1"
        text="Pour votre sécurité, Nidalo ne s’affiche pas à l’intérieur d’un autre site.">
        <a className="btn btn-light" href="https://nidalo.fr/" target="_top" rel="noopener">
          Aller sur nidalo.fr
        </a>
      </ContentUnavailable>
    </main>
  );
}

/**
 * Retour et titre d'une page que l'app n'a pas (aide, pages légales, 404, annonce introuvable), en haut de la page sur
 * toutes les largeurs (dans la colonne de 720 px à partir de 1024 px) : le retour ramène à la page précédente du site,
 * sinon à `back`. Le titre de la page reste son h1 (masqué à l'écran, lu par les lecteurs d'écran).
 */
export function PhonePageHeader({ title, back }: { title: string; back: string }) {
  return (
    <div className="wrap phone-page-head">
      <PageHeader title={title} back={back} history decorative />
    </div>
  );
}

/**
 * `wide` : page dont le corps est une collection d'annonces (recherche) : à partir de 1024 px, son pied de page à la
 * largeur du grand conteneur (1180 px) au lieu de la colonne (720 px).
 * `fill` : la page occupe la fenêtre au-dessus de la barre d'onglets, sans pied de page (Messages).
 * `phoneHeader` : page que l'app n'a pas, avec son retour et son titre (PhonePageHeader).
 */
export function Page({ section, children, wide = false, fill = false, phoneHeader }: {
  section: Section;
  children: ReactNode;
  wide?: boolean;
  fill?: boolean;
  phoneHeader?: { title: string; back: string };
}) {
  if (isFramed()) return <Framed />;
  return (
    <div className={fill ? 'page page-fill' : wide ? 'page page-wide' : 'page'}>
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <main id="contenu" tabIndex={-1}>
        {phoneHeader && <PhonePageHeader title={phoneHeader.title} back={phoneHeader.back} />}
        {children}
      </main>
      {!fill && <Footer />}
      <TabBar section={section} />
      <ToastHost />
      <SignInSheet />
    </div>
  );
}
