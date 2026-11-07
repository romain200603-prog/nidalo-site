import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { agendaItems, agendaStore, agendaSummary, loadAgenda } from '../../lib/account/agenda';
import { signOut } from '../../lib/account/auth';
import { listingsCountText, loadMyListings, myListingsStore } from '../../lib/account/myListings';
import { saveAccountType, type Account } from '../../lib/account/profile';
import { PROJECT_STEPS, STEP_LABELS } from '../../lib/account/project';
import {
  completionOf, editableProjectStore, isStepCompleted, loadEditableProject, newProject, projectSubtitle,
} from '../../lib/account/projectEditor';
import { loadSavedSearches, savedSearchesStore } from '../../lib/account/savedSearches';
import { currentUserId, useStore } from '../../lib/account/session';
import { slotLabel } from '../../lib/listing/visits';
import { accountPath, PATHS } from '../../lib/paths';
import { recentlyViewedIds } from '../../lib/recentlyViewed';
import { ChoiceDialog, DesktopRows, IPHONE_ONLY, IphoneOnlyDialog, ProgressRing } from './DesktopParts';
import { Avatar } from './parts';

// « Mon espace » sur ordinateur (maquette 5 de Romain), pour un compte particulier. À gauche, la colonne de 280 px :
// profil, sections de la page, « Se déconnecter » et « Supprimer mon compte ». À droite, l'espace de l'app dans son
// ordre (Features/Profile/ProfileView.swift:136-217, MySpaceComponents.swift) : projet et agenda, Mes activités,
// Contrats et location, Compte et sécurité, Paramètres et assistance. Les documents de « Contrats et location », les
// alertes de l'iPhone et les préférences restent dans l'app iPhone. Sous 1024 px, AccountPage garde l'écran du téléphone.

type SectionId = 'mon-espace' | 'mon-agenda' | 'mes-activites' | 'contrats-et-location' | 'compte-et-securite' | 'parametres-et-assistance';

/** Sections de la page, dans l'ordre de l'app, avec les icônes de la maquette. */
const SECTIONS: { id: SectionId; title: string; icon: IconName }[] = [
  { id: 'mon-espace', title: 'Mon espace', icon: 'house' },
  { id: 'mon-agenda', title: 'Mon agenda', icon: 'calendar' },
  { id: 'mes-activites', title: 'Mes activités', icon: 'layoutGrid' },
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

/** « 1 recherche active » → « 1 » et « recherche active » ; « Aucun historique » → tout le texte (ActivityTile.split). */
function splitDetail(detail: string): { number: string | null; rest: string } {
  const space = detail.indexOf(' ');
  const first = space < 0 ? detail : detail.slice(0, space);
  return /^\d+$/.test(first) ? { number: first, rest: space < 0 ? '' : detail.slice(space + 1) } : { number: null, rest: detail };
}

/** « Aucune recherche », « 1 recherche active », « 2 recherches actives » (ProfileView.count). */
function count(value: number, one: string, many: string, none: string): string {
  if (value === 0) return none;
  return value === 1 ? `1 ${one}` : `${value} ${many}`;
}

/** Projet immobilier : usage ou catégorie et ville, anneau des critères renseignés, étapes du parcours (ProjectCard). */
function ProjectCard() {
  const state = useStore(editableProjectStore);
  // Avant la lecture, l'app montre son projet par défaut (Résidentiel, sans ville).
  const project = state.status === 'ready' ? state.project : newProject('');
  const steps = PROJECT_STEPS[project.kind];
  return (
    <article className="dsp-card dsp-project" aria-labelledby="dsp-project-title">
      <div className="dsp-project-head">
        <div className="dsp-project-titles">
          <h2 id="dsp-project-title" className="dsp-card-title">Votre projet immobilier</h2>
          <p className="dsp-project-subtitle">{projectSubtitle(project)}</p>
        </div>
        <ProgressRing progress={completionOf(project)} size={60} />
      </div>
      <ol className="dsp-steps" aria-label="Étapes du projet">
        {steps.map((step, index) => {
          const done = isStepCompleted(project, step);
          // Trait vers l'étape voisine, bleu si les deux sont franchies (ProjectStepsBar).
          const before = index > 0 && done && isStepCompleted(project, steps[index - 1]);
          const after = index < steps.length - 1 && done && isStepCompleted(project, steps[index + 1]);
          return (
            <li key={step} className={done ? 'is-done' : undefined} aria-label={`${STEP_LABELS[step]}, ${done ? 'terminée' : 'à venir'}`}>
              <span className="dsp-step-track" aria-hidden="true">
                <span className={`dsp-step-line${index === 0 ? ' is-hidden' : before ? ' is-done' : ''}`} />
                <span className="dsp-step-dot">{done && <Icon name="check" />}</span>
                <span className={`dsp-step-line${index === steps.length - 1 ? ' is-hidden' : after ? ' is-done' : ''}`} />
              </span>
              <span className="dsp-step-label" aria-hidden="true">{STEP_LABELS[step]}</span>
            </li>
          );
        })}
      </ol>
      <a className="dsp-button dsp-button-primary dsp-project-button" href={accountPath('projet')}>
        Voir mon avancement
        <Icon name="arrowRight" />
      </a>
    </article>
  );
}

/** Visites à venir (demandes en attente comprises), prochaine date, « Voir mon agenda », « Ajouter une visite » (AgendaCard). */
function AgendaCard() {
  const state = useStore(agendaStore);
  const now = new Date();
  const summary = agendaSummary(agendaItems(state, currentUserId(), now), now);
  const next = summary.next;
  return (
    <section id="mon-agenda" className="dsp-card dsp-agenda" aria-labelledby="dsp-agenda-title">
      <h2 id="dsp-agenda-title" className="dsp-card-title">Mon agenda</h2>
      <div className="dsp-agenda-summary">
        <span className="dsp-agenda-icon" aria-hidden="true"><Icon name="calendar" /></span>
        <div className="dsp-agenda-text">
          <p className="dsp-agenda-title">
            <span>{summary.title}</span>
            {summary.toConfirm > 0 && <span className="dsp-pill">{summary.toConfirm} à confirmer</span>}
          </p>
          {next ? (
            <>
              <p>Prochaine : {slotLabel(next.start)}{summary.nextIsPending ? ' · en attente' : ''}</p>
              {next.listing && <p className="dsp-agenda-listing">{next.listing.title} · {next.listing.city}</p>}
            </>
          ) : (
            <p>Aucune visite prévue pour l&apos;instant.</p>
          )}
        </div>
      </div>
      <div className="dsp-agenda-actions">
        <a className="dsp-button dsp-button-primary" href={accountPath('agenda')}><Icon name="calendarDays" />Voir mon agenda</a>
        <a className="dsp-button dsp-button-light" href={accountPath('ajouter-visite')}><Icon name="calendarPlus" />Ajouter une visite</a>
      </div>
    </section>
  );
}

/** Tuile de « Mes activités » : titre, premier nombre du détail en grand, puis la suite (ActivityTile). */
function ActivityTile({ title, detail, href }: { title: string; detail: string; href: string }) {
  const { number, rest } = splitDetail(detail);
  return (
    <a className="dsp-card dsp-tile" href={href}>
      <span className="dsp-tile-title">{title}</span>
      {number && <span className="dsp-tile-number">{number}</span>}
      <span className="dsp-tile-rest">{rest}</span>
    </a>
  );
}

type Dialog = 'logout' | 'type' | 'proForm' | 'review' | null;

export function DesktopSpace({ account }: { account: Account }) {
  const listings = useStore(myListingsStore);
  const searches = useStore(savedSearchesStore);
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
  }, []);

  const myListings = listings.status === 'ready' ? listings.items : [];
  const searchCount = searches.status === 'ready' ? searches.items.length : 0;
  const viewedCount = recentlyViewedIds().length;
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
        <div className="dsp-top">
          <ProjectCard />
          <AgendaCard />
        </div>

        <section id="mes-activites" className="dsp-section" aria-labelledby="dsp-activites">
          <h2 id="dsp-activites" className="dsp-section-title">Mes activités</h2>
          <div className="dsp-tiles">
            <ActivityTile title="Mes recherches" detail={count(searchCount, 'recherche active', 'recherches actives', 'Aucune recherche')} href={accountPath('recherches')} />
            <ActivityTile title="Biens consultés" detail={count(viewedCount, 'annonce', 'annonces', 'Aucun historique')} href={accountPath('consultes')} />
            <ActivityTile title="Mes annonces" detail={listingsCountText(myListings)} href={accountPath('annonces')} />
          </div>
        </section>

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
            <DesktopRows rows={[
              { icon: 'keyRound', title: 'Mon bail de location', subtitle: IPHONE_ONLY, onClick: iphone('Mon bail de location') },
              { icon: 'receipt', title: 'Quittances de loyer', subtitle: IPHONE_ONLY, onClick: iphone('Quittances de loyer') },
              { icon: 'clipboardCheck', title: 'États des lieux', subtitle: IPHONE_ONLY, onClick: iphone('États des lieux') },
              { icon: 'handshake', title: 'Offres et compromis', subtitle: IPHONE_ONLY, onClick: iphone('Offres et compromis') },
              { icon: 'filePenLine', title: 'Documents à signer', subtitle: IPHONE_ONLY, onClick: iphone('Documents à signer') },
            ]} />
          </div>
        </section>

        <section id="compte-et-securite" className="dsp-section" aria-labelledby="dsp-compte">
          <h2 id="dsp-compte" className="dsp-section-title">Compte et sécurité</h2>
          <DesktopRows rows={[
            { icon: 'lock', title: 'Connexion et sécurité', subtitle: 'Mot de passe, Face ID, appareils', href: accountPath('securite') },
            { icon: 'shield', title: 'Confidentialité et données', subtitle: 'Consentements, export de mes données', href: accountPath('confidentialite') },
            { icon: 'arrowLeftRight', title: 'Type de compte', subtitle: 'Particulier · passer en professionnel', onClick: () => setDialog('type') },
          ]} />
          {typeError && <p className="field-error" role="alert">{typeError}</p>}
        </section>

        <section id="parametres-et-assistance" className="dsp-section" aria-labelledby="dsp-parametres">
          <h2 id="dsp-parametres" className="dsp-section-title">Paramètres et assistance</h2>
          <DesktopRows rows={[
            { icon: 'bell', title: 'Notifications', subtitle: 'Alertes, visites et messages', href: accountPath('notifications') },
            { icon: 'bell', title: 'Alertes sur cet iPhone', subtitle: IPHONE_ONLY, onClick: iphone('Alertes sur cet iPhone') },
            { icon: 'gear', title: 'Préférences', subtitle: IPHONE_ONLY, onClick: iphone('Préférences') },
            { icon: 'circleHelp', title: 'Aide et assistance', subtitle: 'Questions fréquentes, nous contacter', href: PATHS.help },
            { icon: 'star', title: 'Donner mon avis', subtitle: 'Notez l\'application', onClick: () => setDialog('review') },
            { icon: 'fileText', title: 'Informations légales', subtitle: 'CGU, confidentialité, mentions légales', href: accountPath('legal') },
          ]} />
        </section>
      </div>

      <ChoiceDialog
        open={dialog === 'logout'}
        onClose={() => setDialog(null)}
        title="Se déconnecter ?"
        message="Vous pourrez vous reconnecter avec votre adresse e-mail et votre mot de passe."
        actions={[
          { label: 'Se déconnecter', onClick: () => { setDialog(null); void signOut(); }, tone: 'danger' },
          { label: 'Annuler', onClick: () => setDialog(null) },
        ]}
      />
      <ChoiceDialog
        open={dialog === 'type'}
        onClose={() => setDialog(null)}
        title="Passer en professionnel ?"
        message="Vous pourrez revenir en arrière à tout moment depuis Type de compte."
        actions={[
          // Sans fiche agence, l'app ouvre d'abord le parcours professionnel : il n'est pas encore sur le site (comme Hub).
          { label: 'Passer en professionnel', onClick: () => (account.profile.professional_profile_id ? void switchType() : setDialog('proForm')), tone: 'primary' },
          { label: 'Annuler', onClick: () => setDialog(null) },
        ]}
      />
      <ChoiceDialog
        open={dialog === 'proForm'}
        onClose={() => setDialog(null)}
        title="Compte professionnel"
        message="Pour passer en professionnel, renseignez d’abord votre entreprise et votre agence dans l’app Nidalo (Mon compte › Type de compte). Ce formulaire arrive bientôt sur le site."
        actions={[{ label: 'J\'ai compris', onClick: () => setDialog(null), tone: 'primary' }]}
      />
      <ChoiceDialog
        open={dialog === 'review'}
        onClose={() => setDialog(null)}
        title="Donner mon avis"
        message="Vous pourrez noter NIDALO sur l'App Store dès sa sortie. Merci de votre soutien !"
        actions={[{ label: 'OK', onClick: () => setDialog(null), tone: 'primary' }]}
      />
      <IphoneOnlyDialog title={iphoneOnly} onClose={() => setIphoneOnly(null)} />
    </div>
  );
}
