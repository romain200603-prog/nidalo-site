import { useEffect, useState } from 'react';
import { Page } from '../components/Layout';
import { SignInCard } from '../components/account/SignInCard';
import { authMessage, GOOGLE_MESSAGE, isNetworkError, isNewAccount, linkErrorMessage, openLink, takeGoogleReturn } from '../lib/account/auth';
import { PATHS } from '../lib/paths';
import { accountStore, loadAccount } from '../lib/account/profile';
import { recoveryStore, useSession, useStore } from '../lib/account/session';
import { useDesktop } from '../lib/desktop';
import { AddVisit } from './account/AddVisit';
import { AgencyProfile } from './account/AgencyProfile';
import { AgendaScreen } from './account/Agenda';
import { Contacts } from './account/Contacts';
import { DesktopSpace } from './account/DesktopSpace';
import { Diffusion } from './account/Diffusion';
import { Hub } from './account/Hub';
import { MyInfo } from './account/MyInfo';
import { MyListings } from './account/MyListings';
import { NotificationsScreen } from './account/Notifications';
import { Poster } from './account/Poster';
import { ProfileChoice } from './account/ProfileChoice';
import { ProjectEditor } from './account/ProjectEditor';
import { SavedSearchesList } from './account/SavedSearchesList';
import { ScreenHeader, Spinner } from './account/parts';
import { DeleteAccountScreen, LegalScreen, PrivacyScreen, SecurityScreen, SoonScreen } from './account/Screens';
import { ViewedListings } from './account/ViewedListings';
import '../styles/account.css';

// Mon compte (Features/Profile/ProfileView.swift) : la carte de connexion, le choix du profil d'un compte neuf,
// puis l'espace du compte et ses écrans (`?vue=…`). Les liens des e-mails et la connexion avec Google reviennent ici
// (`?code=…`).

/**
 * Lien d'un e-mail ou retour de Google : échange du code, ou erreur rapportée dans l'adresse. L'adresse est ensuite
 * nettoyée. Après Google, on retrouve la page d'où l'on était parti, sauf un compte tout neuf : il choisit d'abord
 * son profil ici, comme après la confirmation d'un e-mail.
 */
function useEmailLink(): { checked: boolean; error: string | null } {
  const [state, setState] = useState<{ checked: boolean; error: string | null }>({ checked: false, error: null });
  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const fromGoogle = takeGoogleReturn();
    const linkError = linkErrorMessage(url.searchParams) ?? linkErrorMessage(hash);
    const code = url.searchParams.get('code');
    const clean = () => {
      for (const key of ['code', 'error', 'error_code', 'error_description', 'type']) url.searchParams.delete(key);
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    };
    if (linkError) {
      clean();
      setState({ checked: true, error: fromGoogle !== null ? GOOGLE_MESSAGE : linkError });
      return;
    }
    if (!code) {
      setState({ checked: true, error: null });
      return;
    }
    openLink(code)
      .then((purpose) => {
        if (purpose === 'recovery') recoveryStore.set(true);
        if (fromGoogle !== null && fromGoogle !== PATHS.account && !isNewAccount()) {
          // La page d'avant s'ouvre à la place de Mon compte : l'attente reste affichée jusque-là.
          window.location.replace(fromGoogle);
          return;
        }
        setState({ checked: true, error: null });
      })
      .catch((error: unknown) => setState({
        checked: true,
        error: fromGoogle !== null && !isNetworkError(error) ? GOOGLE_MESSAGE : authMessage(error),
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

  useEffect(() => {
    if (session.status !== 'loading') void loadAccount();
  }, [session.status, session.status === 'signedIn' ? session.userId : null]);

  // Rien tant que la session n'est pas connue : la carte ne clignote pas.
  if (session.status === 'loading' || !link.checked) return <Spinner />;
  // Ordinateur : comme la cloche de l'app, l'écran Notifications s'ouvre aussi sans compte, avec son message.
  if (desktop && view === 'notifications' && session.status === 'signedOut' && !link.error) return <NotificationsScreen signedIn={false} />;
  if (session.status === 'signedOut') return <SignInCard linkError={link.error} />;
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
  if (isNewAccount()) return <ProfileChoice account={current} onDone={() => refresh((n) => n + 1)} />;
  switch (view) {
    case 'informations': return <MyInfo account={current} />;
    case 'annonces': return <MyListings />;
    case 'recherches': return <div className="space"><ScreenHeader title="Mes recherches" /><SavedSearchesList /></div>;
    case 'confidentialite': return <PrivacyScreen account={current} />;
    case 'legal': return <LegalScreen />;
    case 'securite': return <SecurityScreen />;
    case 'supprimer': return <DeleteAccountScreen />;
    // Notifications : l'écran de l'app sur ordinateur ; sur téléphone, « bientôt » comme avant.
    case 'notifications': return desktop ? <NotificationsScreen signedIn /> : <SoonScreen screen="notifications" />;
    // Ordinateur : Mon agenda, Ajouter une visite, Mon projet et Biens consultés ; sur téléphone, « bientôt ».
    case 'agenda': return desktop ? <AgendaScreen /> : <SoonScreen screen="agenda" />;
    case 'ajouter-visite': return desktop ? <AddVisit fromAgenda={params.get('depuis') === 'agenda'} /> : <SoonScreen screen="agenda" />;
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
