import { useEffect, useState, type CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import { AlertDialog } from '../listing/Dialogs';
import { signOut } from '../../lib/account/auth';
import { listingsCountText, loadMyListings, myListingsStore, ONLINE_STATUSES } from '../../lib/account/myListings';
import { contactsStore, contactsSubtitle, loadContacts } from '../../lib/account/contacts';
import { loadMandates, mandatesStore, mandatesSubtitle } from '../../lib/account/mandates';
import { loadProfessional, professionalStore } from '../../lib/account/professional';
import { saveAccountType, type Account } from '../../lib/account/profile';
import { loadProject, PROJECT_KIND_LABELS, PROJECT_STEPS, projectStore, STEP_LABELS } from '../../lib/account/project';
import { activeSalesCount, loadSales, salesStore, salesSubtitle } from '../../lib/account/sales';
import { loadSavedSearches, savedSearchesStore } from '../../lib/account/savedSearches';
import { useStore } from '../../lib/account/session';
import { useDesktop } from '../../lib/desktop';
import { parisDay } from '../../lib/listing/views';
import { accountPath, AGENCY_FORM_PATH, AGENCY_PATH, CONTACTS_PATH, MANDATES_PATH, PATHS, SALES_PATH } from '../../lib/paths';
import { ActivityTile, RowGroup, SpaceProfileCard, SpaceSection, type RowItem } from './parts';
import { soonPath } from './Screens';

// Mon compte (Features/Profile/ProfileView.swift) : l'espace particulier ou l'espace professionnel.

export function Hub({ account }: { account: Account }) {
  const listings = useStore(myListingsStore);
  const searches = useStore(savedSearchesStore);
  const [dialog, setDialog] = useState<'logout' | 'type' | 'review' | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const isPro = account.profile.account_type === 'professional';

  useEffect(() => {
    // Comme l'app, les annonces se rechargent à chaque ouverture, pour des compteurs à jour.
    void loadMyListings();
    void loadSavedSearches();
    void loadProject();
    if (isPro) {
      void loadProfessional();
      void loadContacts();
      void loadSales();
      void loadMandates();
    }
  }, [isPro]);

  const myListings = listings.status === 'ready' ? listings.items : [];
  const searchCount = searches.status === 'ready' ? searches.items.length : 0;
  const searchesDetail = searchCount === 0 ? 'Aucune recherche' : searchCount === 1 ? '1 recherche active' : `${searchCount} recherches actives`;

  async function switchType() {
    setDialog(null);
    setTypeError(null);
    const error = await saveAccountType(isPro ? 'individual' : 'professional');
    if (error) setTypeError(error);
  }

  const typeRow: RowItem = {
    icon: 'userRound',
    title: 'Type de compte',
    subtitle: isPro ? 'Professionnel · passer en particulier' : 'Particulier · passer en professionnel',
    onClick: () => setDialog('type'),
  };
  const securityRow: RowItem = {
    icon: 'lock', title: 'Connexion et sécurité',
    subtitle: isPro ? 'Mot de passe, double authentification' : 'Mot de passe, Face ID, appareils',
    href: accountPath('securite'),
  };
  const privacyRow: RowItem = { icon: 'shieldCheck', title: 'Confidentialité et données', subtitle: 'Consentements, export de mes données', href: accountPath('confidentialite') };
  const legalRow: RowItem = { icon: 'scrollText', title: 'Informations légales', subtitle: 'CGU, confidentialité, mentions légales', href: accountPath('legal') };

  return (
    <div className="space">
      <h1 className={`space-title${isPro ? ' is-long' : ''}`}>{isPro ? 'Espace professionnel' : 'Mon espace'}</h1>
      {isPro ? <ProSpaceTop onlineCount={myListings.filter((row) => ONLINE_STATUSES.includes(row.status)).length} /> : (
        <>
          <SpaceProfileCard
            name={account.profile.display_name}
            line={account.email}
            badge="Particulier"
            photo={account.profile.avatar_path}
            href={accountPath('informations')}
          />
          <ProjectCard />
          <SpaceSection icon="calendar" title="Mon agenda">
            <RowGroup rows={[{ icon: 'calendarDays', title: 'Mon agenda', subtitle: 'Visites et rendez-vous', href: soonPath('agenda') }]} />
          </SpaceSection>
          <SpaceSection icon="layoutGrid" title="Mes activités">
            <div className="activity-tiles">
              <ActivityTile title="Mes recherches" detail={searchesDetail} href={accountPath('recherches')} />
              <ActivityTile title="Biens consultés" detail="Bientôt sur le site" href={soonPath('consultes')} />
              <ActivityTile title="Mes annonces" detail={listingsCountText(myListings)} href={accountPath('annonces')} />
            </div>
          </SpaceSection>
          <SpaceSection icon="fileText" title="Contrats et location">
            <RowGroup rows={[
              { icon: 'fileText', title: 'Mon dossier immobilier', subtitle: 'Dans l’app iPhone pour l’instant', href: soonPath('dossier') },
              { icon: 'key', title: 'Mon bail de location', subtitle: 'Dans l’app iPhone pour l’instant', href: soonPath('bail') },
              { icon: 'receipt', title: 'Quittances de loyer', subtitle: 'Dans l’app iPhone pour l’instant', href: soonPath('quittances') },
              { icon: 'camera', title: 'États des lieux', subtitle: 'Entrée et sortie, avec photos', href: soonPath('etats') },
              { icon: 'handshake', title: 'Offres et compromis', subtitle: 'Dans l’app iPhone pour l’instant', href: soonPath('offres') },
              { icon: 'pen', title: 'Documents à signer', subtitle: 'Dans l’app iPhone pour l’instant', href: soonPath('signature') },
            ]} />
          </SpaceSection>
        </>
      )}
      <SpaceSection icon="user" title="Compte et sécurité">
        <RowGroup rows={isPro
          ? [{ icon: 'badgeCheck', title: 'Informations de l\'agence', subtitle: 'SIREN, carte professionnelle, justificatifs', href: AGENCY_FORM_PATH }, securityRow, privacyRow, typeRow]
          : [securityRow, privacyRow, typeRow]} />
        {typeError && <p className="field-error">{typeError}</p>}
      </SpaceSection>
      <SpaceSection icon="gear" title="Paramètres et assistance">
        <RowGroup rows={isPro ? [
          { icon: 'bell', title: 'Notifications', subtitle: 'Nouveaux contacts, visites et messages', href: accountPath('notifications') },
          { icon: 'circleHelp', title: 'Aide et support Pro', subtitle: 'Conseiller dédié, centre d\'aide', href: PATHS.help },
          legalRow,
        ] : [
          { icon: 'bell', title: 'Notifications', subtitle: 'Alertes, visites et messages', href: accountPath('notifications') },
          { icon: 'circleHelp', title: 'Aide et assistance', subtitle: 'Questions fréquentes, nous contacter', href: PATHS.help },
          { icon: 'star', title: 'Donner mon avis', subtitle: 'Notez l\'application', onClick: () => setDialog('review') },
          legalRow,
        ]} />
      </SpaceSection>
      <button type="button" className="logout-button" onClick={() => setDialog('logout')}>
        <Icon name="logOut" />
        Se déconnecter
      </button>
      <a className="delete-account-link" href={accountPath('supprimer')}>Supprimer mon compte</a>

      <AlertDialog
        open={dialog === 'logout'}
        onClose={() => setDialog(null)}
        title="Se déconnecter ?"
        message="Vous pourrez vous reconnecter avec votre adresse e-mail et votre mot de passe."
        actions={[
          { label: 'Se déconnecter', onClick: () => { setDialog(null); void signOut(); }, tone: 'primary' },
          { label: 'Annuler', onClick: () => setDialog(null) },
        ]}
      />
      <AlertDialog
        open={dialog === 'type'}
        onClose={() => setDialog(null)}
        title={isPro ? 'Passer en particulier ?' : 'Passer en professionnel ?'}
        message="Vous pourrez revenir en arrière à tout moment depuis Type de compte."
        actions={[
          // Sans fiche agence, l'app ouvre d'abord le formulaire professionnel : le site aussi (Profil agence).
          !isPro && !account.profile.professional_profile_id
            ? { label: 'Passer en professionnel', href: AGENCY_FORM_PATH, tone: 'primary' }
            : { label: isPro ? 'Passer en particulier' : 'Passer en professionnel', onClick: () => void switchType(), tone: 'primary' },
          { label: 'Annuler', onClick: () => setDialog(null) },
        ]}
      />
      <AlertDialog
        open={dialog === 'review'}
        onClose={() => setDialog(null)}
        title="Donner mon avis"
        message="Vous pourrez noter NIDALO sur l'App Store dès sa sortie. Merci de votre soutien !"
        actions={[{ label: 'OK', onClick: () => setDialog(null), tone: 'primary' }]}
      />
    </div>
  );
}

/** Carte du projet immobilier : catégorie et ville, puis les étapes faites (ProjectCard). */
function ProjectCard() {
  const state = useStore(projectStore);
  const project = state.status === 'ready' ? state.project : null;
  const kind = project?.kind ?? 'buy';
  const steps = PROJECT_STEPS[kind];
  const done = new Set(project?.completed_steps ?? []);
  const subtitle = [project?.purpose?.trim() || PROJECT_KIND_LABELS[kind], project?.city?.trim()].filter(Boolean).join(' · ');
  const percent = Math.round((steps.filter((step) => done.has(step)).length / steps.length) * 100);
  return (
    <div className="project-card space-card">
      <div className="project-head">
        <div>
          <h2>Votre projet immobilier</h2>
          <p>{subtitle}</p>
        </div>
        <span className="project-ring" style={{ '--progress': `${percent}%` } as CSSProperties} role="img" aria-label={`Projet complété à ${percent} %`}>
          <span aria-hidden="true">{percent} %</span>
        </span>
      </div>
      <ol className="project-steps" aria-label="Étapes du projet">
        {steps.map((step) => (
          <li key={step} className={done.has(step) ? 'is-done' : undefined}>
            <span className="project-step-dot">{done.has(step) && <Icon name="check" />}</span>
            <span className="project-step-label">{STEP_LABELS[step]}</span>
          </li>
        ))}
      </ol>
      <a className="btn btn-primary project-button" href={soonPath('projet')}>
        Voir mon avancement
        <Icon name="arrowRight" />
      </a>
    </div>
  );
}

/** Haut de l'espace professionnel : la fiche agence et les chiffres. */
function ProSpaceTop({ onlineCount }: { onlineCount: number }) {
  const pro = useStore(professionalStore);
  const contacts = useStore(contactsStore);
  const sales = useStore(salesStore);
  const saleRows = sales.status === 'ready' ? sales.rows : [];
  const mandates = useStore(mandatesStore);
  const mandateRows = mandates.status === 'ready' ? mandates.rows : [];
  const contactItems = contacts.status === 'ready' ? contacts.items : [];
  const newContacts = contactItems.filter((contact) => contact.isNew).length;
  // Ordinateur : l'agenda des visites est sur le site (Mon agenda) ; sur téléphone, « bientôt » comme avant.
  const desktop = useDesktop();
  const agency = pro.status === 'ready' ? pro.agency : null;
  const name = agency?.agency_name?.trim() || 'Votre agence';
  const line = agency?.email?.trim() || agency?.city?.trim() || 'Fiche agence à compléter';
  return (
    <>
      <SpaceProfileCard name={name} line={line} badge="Professionnel" photo={agency?.logo_path ?? null} href={AGENCY_PATH} />
      <div className="pro-stats space-card">
        <div><strong>{onlineCount}</strong><span>Annonces</span></div>
        <div><strong>{contactItems.length}</strong><span>Contacts</span></div>
        <div><strong>{activeSalesCount(saleRows)}</strong><span>Ventes en cours</span></div>
      </div>
      <SpaceSection icon="briefcase" title="Mon activité professionnelle">
        <RowGroup rows={[
          { icon: 'house', title: 'Mes annonces', subtitle: listingsSubtitle(), href: accountPath('annonces') },
          { icon: 'fileText', title: 'Mes mandats', subtitle: mandatesSubtitle(mandateRows, parisDay(new Date())), href: MANDATES_PATH },
          { icon: 'handshake', title: 'Mes ventes', subtitle: salesSubtitle(saleRows), href: SALES_PATH },
          { icon: 'users', title: 'Mes contacts', subtitle: contactsSubtitle(contactItems), badge: newContacts, href: CONTACTS_PATH },
          { icon: 'calendarDays', title: 'Agenda des visites', subtitle: 'Visites et rendez-vous', href: desktop ? accountPath('agenda') : soonPath('agenda') },
          { icon: 'sparkles', title: 'Mes opportunités', subtitle: '0 opportunité active', href: soonPath('opportunites') },
        ]} />
      </SpaceSection>
      <SpaceSection icon="wrench" title="Outils professionnels">
        <RowGroup rows={[
          { icon: 'chart', title: 'Statistiques', subtitle: 'Vues, contacts et performances', href: accountPath('statistiques') },
          { icon: 'users', title: 'Gestion des équipes', subtitle: 'Inviter des collaborateurs', href: soonPath('equipes') },
          { icon: 'share', title: 'Outils de diffusion', subtitle: 'Partager mes annonces', href: accountPath('diffusion') },
          { icon: 'badgeCheck', title: 'Profil agence', subtitle: agency ? 'Fiche agence' : 'À compléter', href: AGENCY_PATH },
          { icon: 'receipt', title: 'Abonnement NIDALO Pro', subtitle: 'Options, factures et paiement', href: soonPath('abonnement') },
        ]} />
      </SpaceSection>
    </>
  );

  function listingsSubtitle() {
    const state = myListingsStore.get();
    return listingsCountText(state.status === 'ready' ? state.items : []);
  }
}
