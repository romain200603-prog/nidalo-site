import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { LargeHeader } from '../../components/LargeHeader';
import { MenuGroup, type MenuRowItem } from '../../components/MenuRows';
import { RoundButton } from '../../components/RoundButton';
import { AlertDialog } from '../listing/Dialogs';
import { agendaItems, agendaStore, itemsIn, loadAgenda } from '../../lib/account/agenda';
import { signOut } from '../../lib/account/auth';
import { listingsCountText, loadMyListings, myListingsStore, ONLINE_STATUSES } from '../../lib/account/myListings';
import { contactsStore, contactsSubtitle, isOwnContact, loadContacts } from '../../lib/account/contacts';
import { isOwnMandate, loadMandates, mandatesStore, mandatesSubtitle } from '../../lib/account/mandates';
import { loadModerator, moderatorStore } from '../../lib/account/moderation';
import { loadOpportunities, opportunitiesStore, opportunitiesSubtitle } from '../../lib/account/opportunities';
import { loadProfessional, professionalStore } from '../../lib/account/professional';
import { saveAccountType, type Account } from '../../lib/account/profile';
import { editableProjectStore, loadEditableProject, projectSubtitle } from '../../lib/account/projectEditor';
import { activeSalesCount, loadSales, salesStore, salesSubtitle } from '../../lib/account/sales';
import { loadSavedSearches, savedSearchesStore } from '../../lib/account/savedSearches';
import { agendaSubtitle, onlineSubtitle, savedSearchesSubtitle, viewedSubtitle } from '../../lib/account/spaceSubtitles';
import { loadTeam, memberAgency, ROLE_LABELS, teamStore, teamSubtitle } from '../../lib/account/team';
import { currentUserId, useStore } from '../../lib/account/session';
import { notificationsLabel } from '../../lib/badges';
import { useDesktop } from '../../lib/desktop';
import { parisDay } from '../../lib/listing/views';
import { loadNotifications, notificationsStore, unreadNotificationCount } from '../../lib/notifications';
import { accountPath, AGENCY_FORM_PATH, AGENCY_PATH, CONTACTS_PATH, MANDATES_PATH, OPPORTUNITIES_PATH, PATHS, SALES_PATH, TEAM_PATH } from '../../lib/paths';
import { recentlyViewedIds } from '../../lib/recentlyViewed';
import { SpaceProfileCard } from './parts';
import { soonPath } from './Screens';
import '../../styles/compte-app.css';

// Mon compte (Features/Profile/ProfileView.swift) : l'espace particulier ou l'espace professionnel, comme l'app.
// Grand titre et cloche, carte du profil, puis les groupes de l'app dans son ordre, avec ses lignes, ses icônes et
// ses textes ; chaque ligne mène à l'écran que le site a déjà. Ce qui reste sur l'iPhone n'est pas ajouté : la carte
// « Mon dossier immobilier » (documents), « Alertes sur cet iPhone ».

type Dialog = 'logout' | 'type' | null;

export function Hub({ account }: { account: Account }) {
  const desktop = useDesktop();
  const moderator = useStore(moderatorStore);
  const notifications = useStore(notificationsStore);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const isPro = account.profile.account_type === 'professional';

  useEffect(() => {
    // Comme l'app, les compteurs se relisent à chaque ouverture.
    void loadMyListings();
    void loadModerator(currentUserId());
    if (isPro) {
      void loadProfessional();
      void loadContacts();
      void loadSales();
      void loadMandates();
      void loadOpportunities();
      void loadTeam();
    } else {
      void loadSavedSearches();
      void loadEditableProject();
      void loadAgenda();
    }
  }, [isPro]);

  // Cloche du grand titre : les notifications non lues font le point rouge. Lues une fois, sans temps réel, sous
  // 1024 px ; au-dessus, la barre du haut du site a sa cloche et la page n'en montre pas d'autre.
  useEffect(() => {
    if (desktop) return undefined;
    void loadNotifications();
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) void loadNotifications(); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [desktop]);
  const unread = notifications.status === 'ready' ? unreadNotificationCount(notifications.items) : 0;

  async function switchType() {
    setDialog(null);
    setTypeError(null);
    const error = await saveAccountType(isPro ? 'individual' : 'professional');
    if (error) setTypeError(error);
  }

  /** Connexion et sécurité, Confidentialité et données, Type de compte et, pour un modérateur, Signalements. */
  const securityRows: MenuRowItem[] = [
    { icon: 'lock', title: 'Connexion et sécurité', href: accountPath('securite') },
    { icon: 'shieldCheck', title: 'Confidentialité et données', href: accountPath('confidentialite') },
    { icon: 'user', title: 'Type de compte', subtitle: isPro ? 'Professionnel' : 'Particulier', onClick: () => setDialog('type') },
    ...(moderator === true ? [{ icon: 'flag' as const, title: 'Signalements', href: accountPath('signalements') }] : []),
  ];
  // « Notifications » : la ligne du site, gardée à la place de « Alertes sur cet iPhone » (la cloche du titre mène au
  // même écran). « Préférences » : les réglages de l'iPhone, « bientôt » sur le site.
  const settingsRows: MenuRowItem[] = isPro ? [
    { icon: 'bell', title: 'Notifications', href: accountPath('notifications') },
    { icon: 'gear', title: 'Préférences', href: soonPath('preferences') },
    { icon: 'headphones', title: 'Aide et support Pro', href: PATHS.help },
    { icon: 'info', title: 'Informations légales', href: accountPath('legal') },
  ] : [
    { icon: 'bell', title: 'Notifications', href: accountPath('notifications') },
    { icon: 'gear', title: 'Préférences', href: soonPath('preferences') },
    { icon: 'circleHelp', title: 'Aide et assistance', href: PATHS.help },
    { icon: 'info', title: 'Informations légales', href: accountPath('legal') },
  ];
  const typeErrorText = typeError && <p className="field-error" role="alert">{typeError}</p>;

  return (
    <div className="app-space">
      <LargeHeader className="app-space-header" title={isPro ? 'Espace professionnel' : 'Mon espace'}
        trailing={desktop ? undefined : (
          <RoundButton icon="bell" label={notificationsLabel(unread)} href={accountPath('notifications')} dot={unread > 0} />
        )} />
      {isPro ? (
        <ProSpace securityRows={securityRows} settingsRows={settingsRows} typeError={typeErrorText} />
      ) : (
        <IndividualSpace account={account} securityRows={securityRows} settingsRows={settingsRows} typeError={typeErrorText} />
      )}
      <button type="button" className="logout-button" onClick={() => setDialog('logout')}>
        <Icon name="logOut" />
        Se déconnecter
      </button>
      <a className="delete-account-link" href={accountPath('supprimer')}>Supprimer mon compte</a>

      <AlertDialog
        open={dialog === 'logout'}
        onClose={() => setDialog(null)}
        title="Se déconnecter ?"
        message="Vous pourrez vous reconnecter à tout moment."
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
    </div>
  );
}

type SpaceProps = { securityRows: MenuRowItem[]; settingsRows: MenuRowItem[]; typeError: ReactNode };

/** 3a · Espace particulier : la carte du profil, puis Mon espace, Contrats et location, Compte et sécurité, Paramètres et assistance. */
function IndividualSpace({ account, securityRows, settingsRows, typeError }: SpaceProps & { account: Account }) {
  const listings = useStore(myListingsStore);
  const searches = useStore(savedSearchesStore);
  const project = useStore(editableProjectStore);
  const agenda = useStore(agendaStore);
  const now = new Date();
  const upcoming = itemsIn(agendaItems(agenda, currentUserId(), now), 'upcoming', now);
  const online = listings.status === 'ready' ? listings.items.filter((row) => ONLINE_STATUSES.includes(row.status)).length : 0;
  return (
    <>
      <SpaceProfileCard
        name={account.profile.display_name}
        line={account.email}
        badge="Particulier"
        photo={account.profile.avatar_path}
        href={accountPath('informations')}
      />
      <MenuGroup title="Mon espace" rows={[
        { icon: 'calendarBlank', title: 'Mon agenda', tint: 'blue', href: accountPath('agenda'),
          subtitle: agendaSubtitle(upcoming.length, upcoming.filter((item) => item.status === 'toConfirm').length) },
        { icon: 'search', title: 'Mes recherches', tint: 'blue', href: accountPath('recherches'),
          subtitle: savedSearchesSubtitle(searches.status === 'ready' ? searches.items.length : 0) },
        { icon: 'eye', title: 'Biens consultés', tint: 'blue', href: accountPath('consultes'), subtitle: viewedSubtitle(recentlyViewedIds().length) },
        { icon: 'target', title: 'Mon projet', tint: 'green', href: accountPath('projet'),
          subtitle: project.status === 'ready' ? projectSubtitle(project.project) || null : null },
        { icon: 'home', title: 'Mes annonces', tint: 'blue', href: accountPath('annonces'), subtitle: onlineSubtitle(online) },
      ]} />
      {/* « Mon dossier immobilier » : la ligne du site, gardée (l'app a une carte à la place, avec les documents de l'iPhone). */}
      <MenuGroup title="Contrats et location" rows={[
        { icon: 'fileText', title: 'Mon bail de location', tint: 'teal', href: soonPath('bail') },
        { icon: 'euro', title: 'Quittances de loyer', tint: 'teal', href: soonPath('quittances') },
        { icon: 'clipboardCheck', title: 'États des lieux', tint: 'teal', href: soonPath('etats') },
        { icon: 'tag', title: 'Offres et compromis', tint: 'amber', href: soonPath('offres') },
        { icon: 'filePenLine', title: 'Documents à signer', tint: 'amber', href: soonPath('signature') },
        { icon: 'folderCheck', title: 'Mon dossier immobilier', tint: 'teal', href: soonPath('dossier') },
      ]} />
      <MenuGroup title="Compte et sécurité" rows={securityRows}>{typeError}</MenuGroup>
      <MenuGroup title="Paramètres et assistance" rows={settingsRows} />
    </>
  );
}

/** 3b · Espace professionnel : la fiche de l'agence, les chiffres, puis les groupes de l'activité professionnelle. */
function ProSpace({ securityRows, settingsRows, typeError }: SpaceProps) {
  const listings = useStore(myListingsStore);
  const pro = useStore(professionalStore);
  const team = useStore(teamStore);
  const contacts = useStore(contactsStore);
  const sales = useStore(salesStore);
  const mandates = useStore(mandatesStore);
  const opportunities = useStore(opportunitiesStore);
  const myListings = listings.status === 'ready' ? listings.items : [];
  const saleRows = sales.status === 'ready' ? sales.rows : [];
  // Les miens : avec une équipe, les pages montrent aussi ceux de l'agence, pas les chiffres de Mon compte.
  const me = currentUserId();
  const mandateRows = mandates.status === 'ready' ? mandates.rows.filter((row) => isOwnMandate(row, me)) : [];
  const opportunityRows = opportunities.status === 'ready' ? opportunities.rows : [];
  const contactItems = contacts.status === 'ready' ? contacts.items.filter((contact) => isOwnContact(contact, me)) : [];
  const newContacts = contactItems.filter((contact) => contact.isNew).length;
  const agency = pro.status === 'ready' ? pro.agency : null;
  // Membre de l'équipe d'une agence (responsable ou agent) : la carte montre l'agence et son rôle, et mène à l'équipe.
  const member = agency ? null : memberAgency(team);
  const name = (member?.agency_name ?? agency?.agency_name)?.trim() || 'Votre agence';
  const line = member ? `${ROLE_LABELS[member.role]} de l'équipe` : agency?.email?.trim() || agency?.city?.trim() || 'Fiche agence à compléter';
  const online = myListings.filter((row) => ONLINE_STATUSES.includes(row.status)).length;
  return (
    <>
      {/* « Modifier » tant que la fiche de l'agence n'est pas en ligne, « Voir » ensuite ou pour un membre de l'équipe. */}
      <SpaceProfileCard
        name={name}
        line={line}
        badge="Professionnel"
        photo={(member ? member.logo_path : agency?.logo_path) ?? null}
        href={member ? TEAM_PATH : AGENCY_PATH}
        action={member || agency ? 'Voir' : 'Modifier'}
      />
      <div className="pro-stats">
        <div><strong>{online}</strong><span>Annonces</span></div>
        <div><strong>{contactItems.length}</strong><span>Contacts</span></div>
        <div><strong>{activeSalesCount(saleRows)}</strong><span>Ventes en cours</span></div>
      </div>
      <MenuGroup title="Mon activité professionnelle" rows={[
        { icon: 'home', title: 'Mes annonces', tint: 'blue', subtitle: listingsCountText(myListings), href: accountPath('annonces') },
        { icon: 'scrollText', title: 'Mes mandats', tint: 'blue', subtitle: mandatesSubtitle(mandateRows, parisDay(new Date())), href: MANDATES_PATH },
        { icon: 'handshake', title: 'Mes ventes', tint: 'blue', subtitle: salesSubtitle(saleRows), href: SALES_PATH },
        { icon: 'users', title: 'Mes contacts', tint: 'blue', subtitle: contactsSubtitle(contactItems), badge: newContacts, badgeTone: 'brand', href: CONTACTS_PATH },
        { icon: 'calendarBlank', title: 'Agenda des visites', tint: 'blue', href: accountPath('agenda') },
        { icon: 'trend', title: 'Mes opportunités', tint: 'blue', subtitle: opportunitiesSubtitle(opportunityRows), href: OPPORTUNITIES_PATH },
      ]} />
      <MenuGroup title="Outils professionnels" rows={[
        { icon: 'chartColumn', title: 'Statistiques', tint: 'blue', href: accountPath('statistiques') },
        { icon: 'userPlus', title: 'Gestion des équipes', tint: 'blue', subtitle: teamSubtitle(team), href: TEAM_PATH },
        { icon: 'megaphone', title: 'Outils de diffusion', tint: 'blue', href: accountPath('diffusion') },
        { icon: 'building2', title: 'Profil agence', tint: 'blue', subtitle: agency || member ? null : 'À compléter', href: AGENCY_PATH },
        { icon: 'creditCard', title: 'Abonnement Nidalo Pro', tint: 'blue', href: soonPath('abonnement') },
      ]} />
      <MenuGroup title="Compte et sécurité" rows={[
        // Seul le gérant modifie la fiche de l'agence : un membre de l'équipe n'a pas cette ligne.
        ...(member ? [] : [{ icon: 'badgeCheck' as const, title: 'Informations de l\'agence', href: AGENCY_FORM_PATH }]),
        // Seul chemin de l'espace professionnel vers « Mes informations », membres de l'équipe compris (n° 117).
        { icon: 'user', title: 'Mes informations', href: accountPath('informations') },
        ...securityRows,
      ]}>
        {typeError}
      </MenuGroup>
      <MenuGroup title="Paramètres et assistance" rows={settingsRows} />
    </>
  );
}
