import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { MenuRows } from '../../components/MenuRows';
import { agendaItems, agendaStore, itemsIn, loadAgenda } from '../../lib/account/agenda';
import { signOut } from '../../lib/account/auth';
import { loadModerator, moderatorStore } from '../../lib/account/moderation';
import { loadMyListings, myListingsStore, ONLINE_STATUSES } from '../../lib/account/myListings';
import { saveAccountType, type Account } from '../../lib/account/profile';
import { editableProjectStore, loadEditableProject, projectSubtitle } from '../../lib/account/projectEditor';
import { loadSavedSearches, savedSearchesStore } from '../../lib/account/savedSearches';
import { currentUserId, useStore } from '../../lib/account/session';
import { agendaSubtitle, onlineSubtitle, savedSearchesSubtitle, viewedSubtitle } from '../../lib/account/spaceSubtitles';
import { accountPath, AGENCY_FORM_PATH, PATHS } from '../../lib/paths';
import { recentlyViewedIds } from '../../lib/recentlyViewed';
import { ChoiceDialog, IPHONE_ONLY, IphoneOnlyDialog } from './DesktopParts';
import { Avatar } from './parts';

// « Mon espace » sur ordinateur (maquette 5 de Romain), pour un compte particulier. À gauche, la colonne de 280 px :
// profil, sections de la page, « Se déconnecter » et « Supprimer mon compte ». À droite, les groupes de Mon compte de
// l'app dans son ordre, avec ses lignes (Features/Profile/ProfileView.swift) : Mon espace sous le titre, Contrats et
// location (avec la carte du dossier du site), Compte et sécurité, Paramètres et assistance. Les documents de
// « Contrats et location », les alertes de l'iPhone et les préférences restent dans l'app iPhone. Sous 1024 px,
// AccountPage garde l'écran du téléphone.

type SectionId = 'mon-espace' | 'contrats-et-location' | 'compte-et-securite' | 'parametres-et-assistance';

/** Sections de la page, dans l'ordre de l'app, avec les icônes de la maquette. */
const SECTIONS: { id: SectionId; title: string; icon: IconName }[] = [
  { id: 'mon-espace', title: 'Mon espace', icon: 'house' },
  { id: 'contrats-et-location', title: 'Contrats et location', icon: 'fileText' },
  { id: 'compte-et-securite', title: 'Compte et sécurité', icon: 'lock' },
  { id: 'parametres-et-assistance', title: 'Paramètres et assistance', icon: 'gear' },
];

/** Une section compte dès que son haut passe à 96 px du haut de la fenêtre (un lien du menu l'amène à 24 px). */
const SECTION_LINE = 96;

/**
 * Section affichée : la dernière dont le haut a passé la ligne ; en bas de page, la dernière. Une section choisie
 * dans le menu reste marquée tant qu'elle est là où le lien l'a amenée, même en bas de page (la page ne peut pas
 * toujours la monter jusqu'en haut).
 */
function useCurrentSection(): [SectionId, (id: SectionId) => void] {
  const [current, setCurrent] = useState<SectionId>('mon-espace');
  const chosen = useRef<SectionId | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = (id: SectionId) => document.getElementById(id)?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      const atBottom = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const picked = chosen.current;
      if (picked !== null) {
        const pickedTop = top(picked);
        if (pickedTop >= 0 && (pickedTop <= SECTION_LINE || (atBottom && pickedTop < window.innerHeight))) {
          setCurrent(picked);
          return;
        }
        chosen.current = null;
      }
      let found: SectionId = 'mon-espace';
      for (const section of SECTIONS) {
        if (top(section.id) <= SECTION_LINE) found = section.id;
      }
      setCurrent(atBottom ? SECTIONS[SECTIONS.length - 1].id : found);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  const choose = useCallback((id: SectionId) => {
    chosen.current = id;
    setCurrent(id);
  }, []);
  return [current, choose];
}

type Dialog = 'logout' | 'type' | null;

export function DesktopSpace({ account }: { account: Account }) {
  const listings = useStore(myListingsStore);
  const searches = useStore(savedSearchesStore);
  const project = useStore(editableProjectStore);
  const agenda = useStore(agendaStore);
  const moderator = useStore(moderatorStore);
  const [current, chooseSection] = useCurrentSection();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [iphoneOnly, setIphoneOnly] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);

  useEffect(() => {
    // Comme l'app à chaque ouverture : annonces, recherches, projet et agenda relus pour des compteurs à jour.
    void loadMyListings();
    void loadSavedSearches();
    void loadEditableProject();
    void loadAgenda();
    void loadModerator(currentUserId());
  }, []);

  const now = new Date();
  const upcoming = itemsIn(agendaItems(agenda, currentUserId(), now), 'upcoming', now);
  const online = listings.status === 'ready' ? listings.items.filter((row) => ONLINE_STATUSES.includes(row.status)).length : 0;
  const iphone = (title: string) => () => setIphoneOnly(title);

  async function switchType() {
    setDialog(null);
    setTypeError(null);
    const error = await saveAccountType('professional');
    if (error) setTypeError(error);
  }

  return (
    <div className="dsp">
      <aside className="dsp-aside" aria-label="Mon compte">
        <a className="dsp-profile" href={accountPath('informations')}>
          <Avatar name={account.profile.display_name} path={account.profile.avatar_path} size={56} />
          <span className="dsp-profile-text">
            <span className="dsp-profile-name">{account.profile.display_name}</span>
            <span className="dsp-profile-email">{account.email}</span>
          </span>
        </a>
        <span className="dsp-badge">Particulier</span>
        <nav className="dsp-nav" aria-label="Sections de Mon espace">
          <ul>
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className={current === section.id ? 'is-current' : undefined}
                  aria-current={current === section.id ? 'location' : undefined} onClick={() => chooseSection(section.id)}>
                  <Icon name={section.icon} />
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="dsp-aside-end">
          <button type="button" className="dsp-logout" onClick={() => setDialog('logout')}>
            <Icon name="logOut" />
            Se déconnecter
          </button>
          <a className="dsp-delete" href={accountPath('supprimer')}>Supprimer mon compte</a>
        </div>
      </aside>

      <div className="dsp-main">
        <h1 id="mon-espace" className="dsp-title">Mon espace</h1>
        <div className="dsp-space-rows">
          <MenuRows label="Mon espace" rows={[
            { icon: 'calendarBlank', title: 'Mon agenda', tint: 'blue', href: accountPath('agenda'),
              subtitle: agendaSubtitle(upcoming.length, upcoming.filter((item) => item.status === 'toConfirm').length) },
            { icon: 'search', title: 'Mes recherches', tint: 'blue', href: accountPath('recherches'),
              subtitle: savedSearchesSubtitle(searches.status === 'ready' ? searches.items.length : 0) },
            { icon: 'eye', title: 'Biens consultés', tint: 'blue', href: accountPath('consultes'), subtitle: viewedSubtitle(recentlyViewedIds().length) },
            { icon: 'target', title: 'Mon projet', tint: 'green', href: accountPath('projet'),
              subtitle: project.status === 'ready' ? projectSubtitle(project.project) || null : null },
            { icon: 'home', title: 'Mes annonces', tint: 'blue', href: accountPath('annonces'), subtitle: onlineSubtitle(online) },
          ]} />
        </div>

        <section id="contrats-et-location" className="dsp-section" aria-labelledby="dsp-contrats">
          <h2 id="dsp-contrats" className="dsp-section-title">Contrats et location</h2>
          <div className="dsp-contracts">
            <article className="dsp-card dsp-dossier" aria-labelledby="dsp-dossier-title">
              <div className="dsp-dossier-head">
                <span className="dsp-dossier-icon" aria-hidden="true"><Icon name="folderCheck" /></span>
                <div className="dsp-dossier-titles">
                  <h3 id="dsp-dossier-title">Mon dossier immobilier</h3>
                  <p>{IPHONE_ONLY}</p>
                </div>
              </div>
              <button type="button" className="dsp-button dsp-button-light dsp-dossier-button" onClick={iphone('Mon dossier immobilier')}>
                Compléter mon dossier
              </button>
            </article>
            <MenuRows rows={[
              { icon: 'fileText', title: 'Mon bail de location', tint: 'teal', onClick: iphone('Mon bail de location') },
              { icon: 'euro', title: 'Quittances de loyer', tint: 'teal', onClick: iphone('Quittances de loyer') },
              { icon: 'clipboardCheck', title: 'États des lieux', tint: 'teal', onClick: iphone('États des lieux') },
              { icon: 'tag', title: 'Offres et compromis', tint: 'amber', onClick: iphone('Offres et compromis') },
              { icon: 'filePenLine', title: 'Documents à signer', tint: 'amber', onClick: iphone('Documents à signer') },
            ]} />
          </div>
        </section>

        <section id="compte-et-securite" className="dsp-section" aria-labelledby="dsp-compte">
          <h2 id="dsp-compte" className="dsp-section-title">Compte et sécurité</h2>
          <MenuRows rows={[
            { icon: 'lock', title: 'Connexion et sécurité', href: accountPath('securite') },
            { icon: 'shieldCheck', title: 'Confidentialité et données', href: accountPath('confidentialite') },
            { icon: 'user', title: 'Type de compte', subtitle: 'Particulier', onClick: () => setDialog('type') },
            // Modération : seulement pour un compte modérateur.
            ...(moderator === true ? [{ icon: 'flag' as const, title: 'Signalements', href: accountPath('signalements') }] : []),
          ]} />
          {typeError && <p className="field-error" role="alert">{typeError}</p>}
        </section>

        <section id="parametres-et-assistance" className="dsp-section" aria-labelledby="dsp-parametres">
          <h2 id="dsp-parametres" className="dsp-section-title">Paramètres et assistance</h2>
          {/* « Notifications » : la ligne du site, gardée (dans l'app, la cloche du grand titre mène au même écran). */}
          <MenuRows rows={[
            { icon: 'bell', title: 'Notifications', href: accountPath('notifications') },
            { icon: 'bell', title: 'Alertes sur cet iPhone', onClick: iphone('Alertes sur cet iPhone') },
            { icon: 'gear', title: 'Préférences', onClick: iphone('Préférences') },
            { icon: 'circleHelp', title: 'Aide et assistance', href: PATHS.help },
            { icon: 'info', title: 'Informations légales', href: accountPath('legal') },
          ]} />
        </section>
      </div>

      <ChoiceDialog
        open={dialog === 'logout'}
        onClose={() => setDialog(null)}
        title="Se déconnecter ?"
        message="Vous pourrez vous reconnecter à tout moment."
        actions={[
          { label: 'Se déconnecter', onClick: () => { setDialog(null); void signOut(); }, role: 'destructive' },
          { label: 'Annuler', onClick: () => setDialog(null), role: 'cancel' },
        ]}
      />
      <ChoiceDialog
        open={dialog === 'type'}
        onClose={() => setDialog(null)}
        title="Passer en professionnel ?"
        message="Vous pourrez revenir en arrière à tout moment depuis Type de compte."
        actions={[
          // Sans fiche agence, l'app ouvre d'abord le parcours professionnel : le site aussi (Profil agence, comme Hub).
          { label: 'Passer en professionnel', onClick: () => (account.profile.professional_profile_id ? void switchType() : window.location.assign(AGENCY_FORM_PATH)) },
          { label: 'Annuler', onClick: () => setDialog(null), role: 'cancel' },
        ]}
      />
      <IphoneOnlyDialog title={iphoneOnly} onClose={() => setIphoneOnly(null)} />
    </div>
  );
}
