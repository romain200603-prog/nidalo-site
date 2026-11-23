import { useState } from 'react';
import { ContentUnavailable } from '../../components/ContentUnavailable';
import { HidesTabBar } from '../../components/HidesTabBar';
import { Icon } from '../../components/Icon';
import { usesApple } from '../../lib/account/auth';
import { deleteMyAccount } from '../../lib/account/deleteAccount';
import { saveFindableByPhone, type Account } from '../../lib/account/profile';
import { useSession } from '../../lib/account/session';
import { accountPath, PATHS } from '../../lib/paths';
import { ScreenHeader } from './parts';

// Écrans simples de Mon compte : « bientôt sur le site », informations légales, connexion et sécurité,
// confidentialité et données, suppression du compte.

const SOON_TITLES: Record<string, string> = {
  agenda: 'Mon agenda',
  consultes: 'Biens consultés',
  dossier: 'Mon dossier immobilier',
  bail: 'Mon bail de location',
  quittances: 'Quittances de loyer',
  etats: 'États des lieux',
  offres: 'Offres et compromis',
  signature: 'Documents à signer',
  notifications: 'Notifications',
  preferences: 'Préférences',
  'demande-visite': 'Demande de visite',
  projet: 'Mon projet immobilier',
  agence: 'Compte professionnel',
  mandats: 'Mes mandats',
  ventes: 'Mes ventes',
  contacts: 'Mes contacts',
  opportunites: 'Mes opportunités',
  statistiques: 'Statistiques',
  equipes: 'Gestion des équipes',
  diffusion: 'Outils de diffusion',
  abonnement: 'Abonnement Nidalo Pro',
  publier: 'Publier une annonce',
  comparer: 'Comparer vos favoris',
};

export function soonPath(key: keyof typeof SOON_TITLES | string): string {
  return accountPath('bientot', { ecran: key });
}

/** Écran pas encore sur le site (comme l'écran « prochaine version » de l'app). */
export function SoonScreen({ screen }: { screen: string | null }) {
  const title = (screen && SOON_TITLES[screen]) || 'Bientôt sur le site';
  return (
    <div className="space">
      {/* Mon projet et une demande de visite masquent la barre d'onglets dans l'app (hidesTabBar). */}
      {(screen === 'projet' || screen === 'demande-visite') && <HidesTabBar />}
      <ScreenHeader title={title} />
      <ContentUnavailable icon="hammer" title={title} className="soon-state"
        text="Cet écran arrive bientôt sur le site. En attendant, il est dans l’app Nidalo, avec le même compte." />
    </div>
  );
}

export function LegalScreen() {
  return (
    <div className="space">
      <ScreenHeader title="Informations légales" />
      <ul className="legal-rows space-card">
        <li><a href={PATHS.terms}>Conditions générales d&apos;utilisation<Icon name="chevronRight" className="icon row-chevron" /></a></li>
        <li><a href={PATHS.privacy}>Politique de confidentialité<Icon name="chevronRight" className="icon row-chevron" /></a></li>
        <li><a href={PATHS.legal}>Mentions légales<Icon name="chevronRight" className="icon row-chevron" /></a></li>
      </ul>
    </div>
  );
}

export function SecurityScreen() {
  return (
    <div className="space">
      <ScreenHeader title="Connexion et sécurité" />
      <div className="soon-card space-card">
        <Icon name="lock" />
        <h2>Connexion et sécurité</h2>
        <p>
          Compte créé avec une adresse e-mail : pour changer de mot de passe, déconnectez-vous, puis touchez « Mot de passe
          oublié » sur l&apos;écran de connexion. Compte Apple ou Google : votre mot de passe se gère chez Apple ou Google.
        </p>
      </div>
    </div>
  );
}

/** « Confidentialité et données » : le réglage « Me retrouver par mon numéro » (profiles.findable_by_phone). */
export function PrivacyScreen({ account }: { account: Account }) {
  const [value, setValue] = useState(account.profile.findable_by_phone === true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function toggle(next: boolean) {
    setValue(next);
    setBusy(true);
    setError(null);
    const failure = await saveFindableByPhone(next);
    setBusy(false);
    if (failure) {
      setValue(!next);
      setError(failure);
    }
  }
  return (
    <div className="space">
      <ScreenHeader title="Confidentialité et données" />
      <div className="privacy-card space-card">
        <Icon name="shieldCheck" />
        <div>
          <h2>Aucun suivi publicitaire</h2>
          <p>
            Nidalo n&apos;affiche aucune publicité et n&apos;utilise aucun outil de mesure d&apos;audience ni aucun traceur.
            Nidalo ne vend ni ne loue vos données.
          </p>
        </div>
      </div>
      <div className="toggle-card space-card">
        <label className="toggle-row">
          <span>Me retrouver par mon numéro</span>
          <input type="checkbox" role="switch" className="switch" checked={value} disabled={busy} onChange={(event) => void toggle(event.target.checked)} />
        </label>
        <p>Les personnes qui ont déjà votre numéro peuvent vous retrouver dans « Nouveau contact ». Votre numéro ne leur est jamais montré.</p>
        {error && <p className="field-error">{error}</p>}
      </div>
      <p className="screen-note">
        Pour en savoir plus, lisez la <a href={PATHS.privacy}>politique de confidentialité</a>.
      </p>
    </div>
  );
}

/**
 * « Supprimer mon compte » (DeleteAccountSheet.swift), en écran sur le site. Pendant la suppression, le retour et
 * « Annuler » ne font rien (n° 158).
 */
export function DeleteAccountScreen() {
  const session = useSession();
  // Compte « Continuer avec Apple » : l'app coupe elle-même le lien avec Apple ; sur le site, la personne le fait.
  const apple = session.status === 'signedIn' && usesApple(session.session.user);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    setError(null);
    const failure = await deleteMyAccount();
    setBusy(false);
    if (failure) setError(failure);
    else window.location.assign(PATHS.home);
  }
  return (
    <div className="space">
      <ScreenHeader title="Supprimer mon compte" onBack={busy ? () => undefined : undefined} />
      <div className="delete-card space-card">
        <span className="icon-tile icon-tile-52 is-danger"><Icon name="trash" /></span>
        <h2>Supprimer mon compte ?</h2>
        <p>
          Votre compte, vos annonces et leurs photos, vos demandes de visite, vos données de professionnel et vos documents
          privés en ligne seront effacés. Les biens consultés et les derniers lieux cherchés gardés dans ce navigateur le
          seront aussi. Les messages déjà envoyés restent visibles par vos interlocuteurs, sans votre nom.
        </p>
        <p className="delete-note">Cette action est irréversible.</p>
        {apple && (
          <p className="delete-note">
            Votre compte est relié à votre identifiant Apple. Pour couper aussi ce lien, ouvrez les réglages de votre
            identifiant Apple (sur l’iPhone, ou sur account.apple.com), rubrique « Se connecter avec Apple », puis retirez
            Nidalo.
          </p>
        )}
        {error && <p className="signin-error" role="alert">{error}</p>}
        <button type="button" className="danger-button" onClick={confirm} disabled={busy}>
          {busy ? <span className="spinner spinner-white" aria-label="Suppression en cours" /> : 'Supprimer définitivement'}
        </button>
        <a
          className="btn btn-light"
          href={busy ? undefined : accountPath()}
          aria-disabled={busy || undefined}
          role={busy ? 'link' : undefined}
          onClick={(event) => { if (busy) event.preventDefault(); }}
        >
          Annuler
        </a>
      </div>
    </div>
  );
}
