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
import { SiteFooter, SiteHeader } from './SiteFrame';
import { StrokeIcon } from './StrokeIcon';
import { badgeText, messagesLabel, useTabBarBadge } from '../lib/badges';
import { CONTACT_EMAIL } from '../lib/config';
import { useDesktop } from '../lib/desktop';
import { PATHS } from '../lib/paths';

// Le cadre de toutes les pages. Sous 1024 px, comme l'app : pas de barre en haut (chaque page commence comme son écran
// de l'app), la barre d'onglets en bas, et le pied de page du web (mentions légales) au bas de chaque page. À partir de
// 1024 px (ordinateur) : l'en-tête en haut à la place de la barre d'onglets, et le pied de page de l'ordinateur
// (SiteFrame.tsx).

export type Section = 'home' | 'search' | 'favorites' | 'publish' | 'messages' | 'account' | 'other';

function current(active: boolean) {
  return active ? ('page' as const) : undefined;
}

/** Fiche d'une annonce : la barre du bas y est masquée (hidesTabBar de l'app), sa pastille n'est pas lue. */
function isListingPage(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/annonce/');
}

/**
 * Pastille Messages du cadre, lue une fois pour la page avec les règles de la barre d'onglets (pas sur la page Messages,
 * qui lit déjà ses non-lus en direct, ni sur la fiche d'une annonce) : la même valeur pour la barre d'onglets
 * (téléphone) et l'en-tête (ordinateur).
 */
export function useShellBadge(section: Section): number {
  return useTabBarBadge(section !== 'messages' && !isListingPage());
}

/**
 * Barre d'onglets de l'app (AppTabBar.swift), sous 1024 px : Accueil · Favoris · « + » Publier · Messages · Mon compte,
 * chacun avec son libellé dessous, et la pastille des messages non lus sur Messages (`unread`, de useShellBadge ;
 * « 99+ » au-delà de 99, n° 44). Icônes de l'app : maison redessinée (encre de 18, trait de 1,6), cœur Lucide de 24,
 * carré bleu de 28 au « + » de 18, bulle message-square-text de 19,56, circle-user de 22.
 */
export function TabBar({ section, unread }: { section: Section; unread: number }) {
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

type PageProps = {
  section: Section;
  children: ReactNode;
  wide?: boolean;
  fill?: boolean;
  phoneHeader?: { title: string; back: string };
};

/**
 * `wide` : page dont le corps est une collection d'annonces (accueil, recherche, favoris, comparer) : le pied de page du
 * web de la recherche collé aux résultats (app.css).
 * `fill` : la page occupe la fenêtre sous l'en-tête ou au-dessus de la barre d'onglets, sans pied de page (Messages).
 * `phoneHeader` : page que l'app n'a pas, avec son retour et son titre (PhonePageHeader).
 */
export function Page(props: PageProps) {
  if (isFramed()) return <Framed />;
  return <PageFrame {...props} />;
}

/**
 * Le cadre d'une page. Ordinateur (≥ 1024 px) : l'en-tête, sauf dans l'assistant « Publier une annonce » (sa maquette
 * lui donne son propre en-tête simple : plus tard) ; le grand pied de page sur l'accueil, le fin ailleurs. Sous 1024 px,
 * rien ne change : le pied de page du web et la barre d'onglets. La pastille Messages est lue une seule fois, ici.
 */
function PageFrame({ section, children, wide = false, fill = false, phoneHeader }: PageProps) {
  const desktop = useDesktop();
  const unread = useShellBadge(section);
  return (
    <div className={fill ? 'page page-fill' : wide ? 'page page-wide' : 'page'}>
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      {desktop && section !== 'publish' && <SiteHeader section={section} unread={unread} />}
      <main id="contenu" tabIndex={-1}>
        {phoneHeader && <PhonePageHeader title={phoneHeader.title} back={phoneHeader.back} />}
        {children}
      </main>
      {!fill && (desktop ? <SiteFooter large={section === 'home'} /> : <Footer />)}
      {!desktop && <TabBar section={section} unread={unread} />}
      <ToastHost />
      <SignInSheet />
    </div>
  );
}
