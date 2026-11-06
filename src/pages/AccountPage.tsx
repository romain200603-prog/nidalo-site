import { useEffect, useState } from 'react';
import { Page } from '../components/Layout';
import { SignInCard } from '../components/account/SignInCard';
import { authMessage, isNewAccount, linkErrorMessage, openLink } from '../lib/account/auth';
import { accountStore, loadAccount } from '../lib/account/profile';
import { recoveryStore, useSession, useStore } from '../lib/account/session';
import { useDesktop } from '../lib/desktop';
import { Hub } from './account/Hub';
import { MyInfo } from './account/MyInfo';
import { MyListings } from './account/MyListings';
import { NotificationsScreen } from './account/Notifications';
import { ProfileChoice } from './account/ProfileChoice';
import { SavedSearchesList } from './account/SavedSearchesList';
import { ScreenHeader, Spinner } from './account/parts';
import { DeleteAccountScreen, LegalScreen, PrivacyScreen, SecurityScreen, SoonScreen } from './account/Screens';
import '../styles/account.css';

// Mon compte (Features/Profile/ProfileView.swift) : la carte de connexion, le choix du profil d'un compte neuf,
// puis l'espace du compte et ses écrans (`?vue=…`). Les liens des e-mails reviennent ici (`?code=…`).

/** Lien d'un e-mail : échange du code, ou erreur rapportée dans l'adresse. L'adresse est ensuite nettoyée. */
function useEmailLink(): { checked: boolean; error: string | null } {
  const [state, setState] = useState<{ checked: boolean; error: string | null }>({ checked: false, error: null });
  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const linkError = linkErrorMessage(url.searchParams) ?? linkErrorMessage(hash);
    const code = url.searchParams.get('code');
    const clean = () => {
      for (const key of ['code', 'error', 'error_code', 'error_description', 'type']) url.searchParams.delete(key);
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    };
    if (linkError) {
      clean();
      setState({ checked: true, error: linkError });
      return;
    }
    if (!code) {
      setState({ checked: true, error: null });
      return;
    }
    openLink(code)
      .then((purpose) => {
        if (purpose === 'recovery') recoveryStore.set(true);
        setState({ checked: true, error: null });
      })
      .catch((error: unknown) => setState({ checked: true, error: authMessage(error) }))
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
    case 'demande-visite': return <SoonScreen screen="demande-visite" />;
    case 'bientot': return <SoonScreen screen={params.get('ecran')} />;
    default: return <Hub account={current} />;
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
