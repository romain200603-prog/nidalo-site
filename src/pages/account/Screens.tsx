import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { deleteMyAccount } from '../../lib/account/deleteAccount';
import { saveFindableByPhone, type Account } from '../../lib/account/profile';
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
  abonnement: 'Abonnement NIDALO Pro',
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
      <ScreenHeader title={title} />
      <div className="soon-card space-card">
        <Icon name="hammer" />
        <h2>{title}</h2>
        <p>Cet écran arrive bientôt sur le site. En attendant, il est dans l’app Nidalo, avec le même compte.</p>
      </div>
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
          Vous vous connectez avec votre adresse e-mail et votre mot de passe. Pour en changer, utilisez « Mot de passe
          oublié ? » sur la page de connexion. La gestion de vos appareils connectés arrivera bientôt.
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
            NIDALO n&apos;utilise aucun traceur publicitaire ni outil de mesure d&apos;audience. Sur le site, seule votre
            session de connexion est gardée dans ce navigateur, pour que vous restiez connecté.
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

/** « Supprimer mon compte » (DeleteAccountSheet.swift), en écran sur le site. */
export function DeleteAccountScreen() {
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
      <ScreenHeader title="Supprimer mon compte" />
      <div className="delete-card space-card">
        <span className="icon-tile icon-tile-52 is-danger"><Icon name="trash" /></span>
        <h2>Supprimer mon compte ?</h2>
        <p>
          Votre compte NIDALO et tout ce qui y est enregistré en ligne seront effacés définitivement : profil, photo, Mes
          informations, projet, recherches enregistrées et favoris. Cette action est irréversible.
        </p>
        <p className="delete-note">Les documents gardés sur votre iPhone ne sont pas concernés.</p>
        {error && <p className="signin-error" role="alert">{error}</p>}
        <button type="button" className="danger-button" onClick={confirm} disabled={busy}>
          {busy ? <span className="spinner spinner-white" aria-label="Suppression en cours" /> : 'Supprimer définitivement'}
        </button>
        <a className="btn btn-light" href={accountPath()} aria-disabled={busy}>Annuler</a>
      </div>
    </div>
  );
}
