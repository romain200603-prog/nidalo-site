import { useEffect, useState } from 'react';
import { Page } from '../components/Layout';
import { SignInCard } from '../components/account/SignInCard';
import { authMessage, isNetworkError, isNewAccount, linkErrorMessage, openLink, providerMessage, takeProviderReturn } from '../lib/account/auth';
import { PATHS } from '../lib/paths';
import { accountStore, loadAccount } from '../lib/account/profile';
import { cleanToken, invitationPath, pendingInvitation, rememberInvitation } from '../lib/account/team';
import { recoveryStore, useSession, useStore } from '../lib/account/session';
import { useDesktop } from '../lib/desktop';
import { AddVisit } from './account/AddVisit';
import { AgencyProfile } from './account/AgencyProfile';
import { AgendaScreen } from './account/Agenda';
import { Contacts } from './account/Contacts';
import { DesktopSpace } from './account/DesktopSpace';
import { Diffusion } from './account/Diffusion';
import { Hub } from './account/Hub';
import { Mandates } from './account/Mandates';
import { Opportunities } from './account/Opportunities';
import { MyInfo } from './account/MyInfo';
import { MyListings } from './account/MyListings';
import { NotificationsScreen } from './account/Notifications';
import { Poster } from './account/Poster';
import { ProfileChoice } from './account/ProfileChoice';
import { ProjectEditor } from './account/ProjectEditor';
import { Reports } from './account/Reports';
import { Sales } from './account/Sales';
import { SavedSearchesList } from './account/SavedSearchesList';
import { ScreenHeader, Spinner } from './account/parts';
import { DeleteAccountScreen, LegalScreen, PrivacyScreen, SecurityScreen, SoonScreen } from './account/Screens';
import { Statistics } from './account/Statistics';
import { InvitationIntro, Team } from './account/Team';
import { ViewedListings } from './account/ViewedListings';
import '../styles/account.css';

// Mon compte (Features/Profile/ProfileView.swift) : la carte de connexion, le choix du profil d'un compte neuf,
// puis l'espace du compte et ses écrans (`?vue=…`). Les liens des e-mails et la connexion avec Google ou Apple
// reviennent ici (`?code=…`).

/**
 * Lien d'un e-mail ou retour de Google ou d'Apple : échange du code, ou erreur rapportée dans l'adresse. L'adresse est
 * ensuite nettoyée. Après Google ou Apple, on retrouve la page d'où l'on était parti, sauf un compte tout neuf : il
 * choisit d'abord son profil ici, comme après la confirmation d'un e-mail.
 */
function useEmailLink(): { checked: boolean; error: string | null } {
  const [state, setState] = useState<{ checked: boolean; error: string | null }>({ checked: false, error: null });
  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const fromProvider = takeProviderReturn();
    const linkError = linkErrorMessage(url.searchParams) ?? linkErrorMessage(hash);
    const code = url.searchParams.get('code');
    const clean = () => {
      for (const key of ['code', 'error', 'error_code', 'error_description', 'type']) url.searchParams.delete(key);
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    };
    if (linkError) {
      clean();
      setState({ checked: true, error: fromProvider !== null ? providerMessage(fromProvider.provider) : linkError });
      return;
    }
    if (!code) {
      setState({ checked: true, error: null });
      return;
    }
    openLink(code)
      .then((purpose) => {
        if (purpose === 'recovery') recoveryStore.set(true);
        if (fromProvider !== null && fromProvider.to !== PATHS.account && !isNewAccount()) {
          // La page d'avant s'ouvre à la place de Mon compte : l'attente reste affichée jusque-là.
          window.location.replace(fromProvider.to);
          return;
        }
        setState({ checked: true, error: null });
      })
      .catch((error: unknown) => setState({
        checked: true,
        error: fromProvider !== null && !isNetworkError(error) ? providerMessage(fromProvider.provider) : authMessage(error),
      }))
      .finally(clean);
  }, []);
  return state;
}

function AccountContent() {
  const session = useSession();
  const recovery = useStore(recoveryStore);
  const account = useStore(accountStore);
  const link = useEmailLink();
  const desktop = useDesktop();
  const [, refresh] = useState(0);
  const params = new URLSearchParams(window.location.search);
  const view = params.get('vue');
  // Lien d'invitation d'une équipe (`?vue=equipes&invitation=<jeton>`) : gardé dans le navigateur, il s'ouvre aussi
  // après la connexion ou la création du compte.
  const invitation = view === 'equipes' ? params.get('invitation') : null;

  useEffect(() => {
    if (session.status !== 'loading') void loadAccount();
  }, [session.status, session.status === 'signedIn' ? session.userId : null]);

  useEffect(() => {
    const token = cleanToken(invitation);
    if (token) rememberInvitation(token);
  }, [invitation]);

  // Rien tant que la session n'est pas connue : la carte ne clignote pas.
  if (session.status === 'loading' || !link.checked) return <Spinner />;
  // Comme la cloche de l'app, l'écran Notifications s'ouvre aussi sans compte, avec son message.
  if (view === 'notifications' && session.status === 'signedOut' && !link.error) return <NotificationsScreen signedIn={false} />;
  if (session.status === 'signedOut') return <SignInCard linkError={link.error} notice={invitation !== null ? <InvitationIntro /> : undefined} />;
  if (recovery) return <SignInCard recovery onPasswordSaved={() => refresh((n) => n + 1)} />;
  if (account.status === 'error') {
    return (
      <div className="space">
        <ScreenHeader title="Mon compte" back="/" />
        <p className="signin-error" role="alert">{account.message}</p>
        <button type="button" className="btn btn-light" onClick={() => void loadAccount(true)}>Réessayer</button>
      </div>
    );
  }
  if (account.status !== 'ready') return <Spinner />;
  const current = account.account;
  // Invitation ouverte avant de se connecter (ou de créer son compte) : elle s'ouvre maintenant, à son adresse, avant
  // « Quel est votre profil ? » pour un compte tout neuf.
  const pending = invitation === null && (view === null || isNewAccount()) ? pendingInvitation() : null;
  if (pending) {
    window.history.replaceState(null, '', invitationPath(pending));
    return <Team screen={null} invitation={pending} />;
  }
  if (invitation !== null) return <Team screen={null} invitation={invitation} />;
  if (isNewAccount()) return <ProfileChoice account={current} onDone={() => refresh((n) => n + 1)} />;
  switch (view) {
    case 'informations': return <MyInfo account={current} />;
    case 'annonces': return <MyListings />;
    case 'recherches': return <div className="space"><ScreenHeader title="Mes recherches" /><SavedSearchesList /></div>;
    case 'confidentialite': return <PrivacyScreen account={current} />;
    case 'legal': return <LegalScreen />;
    case 'securite': return <SecurityScreen />;
    case 'supprimer': return <DeleteAccountScreen />;
    // Notifications, Mon agenda et Ajouter une visite : les écrans de l'app, sur ordinateur et sur téléphone.
    case 'notifications': return <NotificationsScreen signedIn />;
    case 'agenda': return <AgendaScreen />;
    case 'ajouter-visite': return <AddVisit fromAgenda={params.get('depuis') === 'agenda'} />;
    // Mon projet et Biens consultés : sur ordinateur ; sur téléphone, « bientôt ».
    case 'projet': return desktop ? <ProjectEditor /> : <SoonScreen screen="projet" />;
    case 'consultes': return desktop ? <ViewedListings /> : <SoonScreen screen="consultes" />;
    case 'demande-visite': return <SoonScreen screen="demande-visite" />;
    case 'bientot': return <SoonScreen screen={params.get('ecran')} />;
    // Profil agence : la page de l'agence et son formulaire, sur téléphone et sur ordinateur.
    case 'agence': return <AgencyProfile account={current} editing={params.get('ecran') === 'modifier'} />;
    // Outils de diffusion : lien, QR code, texte et affiche de vitrine (format A4) de chaque annonce en ligne.
    case 'diffusion': return <Diffusion />;
    case 'affiche': return <Poster listingId={params.get('annonce')} />;
    case 'contacts': return <Contacts contactKey={params.get('contact')} screen={params.get('ecran')} />;
    // Mes ventes : de l'offre acceptée à l'acte signé, avec les offres acceptées à suivre.
    case 'ventes': return <Sales saleId={params.get('vente')} screen={params.get('ecran')} />;
    // Mes mandats : le registre des mandats de vente et de location, avec le PDF signé de chacun.
    case 'mandats': return <Mandates mandateId={params.get('mandat')} screen={params.get('ecran')} />;
    // Mes opportunités : les acheteurs, vendeurs et locataires à suivre, avec leur étape et le jour où les relancer.
    case 'opportunites': return <Opportunities opportunityId={params.get('opportunite')} screen={params.get('ecran')} />;
    // Statistiques : vues, favoris, messages, visites et offres de chaque annonce publiée, sur 7 ou 30 jours.
    case 'statistiques': return <Statistics />;
    // Gestion des équipes : l'équipe de l'agence, les invitations en cours et « Inviter un collaborateur ».
    case 'equipes': return <Team screen={params.get('ecran')} invitation={null} />;
    // Signalements : la modération de Nidalo (le serveur réserve la page aux comptes modérateurs).
    case 'signalements': return <Reports />;
    // Ordinateur : Mon espace de la maquette 5 pour un compte particulier ; l'espace professionnel garde son écran.
    default: return desktop && current.profile.account_type !== 'professional' ? <DesktopSpace account={current} /> : <Hub account={current} />;
  }
}

export function AccountPage() {
  return (
    <Page section="account">
      <div className="wrap account-wrap">
        <AccountContent />
      </div>
    </Page>
  );
}
