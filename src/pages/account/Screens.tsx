import { useState } from 'react';
import { ContentUnavailable } from '../../components/ContentUnavailable';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { GroupCard, MenuGroup, SectionLabel } from '../../components/MenuRows';
import { usesApple } from '../../lib/account/auth';
import { deleteMyAccount } from '../../lib/account/deleteAccount';
import { saveAccountType, saveFindableByPhone, type Account } from '../../lib/account/profile';
import { useSession } from '../../lib/account/session';
import { CONTACT_EMAIL } from '../../lib/config';
import { useDesktop } from '../../lib/desktop';
import { accountPath, AGENCY_FORM_PATH, PATHS } from '../../lib/paths';
import { AlertDialog } from '../listing/Dialogs';
import { LEGAL_TEXTS, LEGAL_TITLES } from './LegalText';
import { ScreenHeader } from './parts';

// Écrans simples de Mon compte : « bientôt sur le site », informations légales, connexion et sécurité,
// confidentialité et données, type de compte, aide et assistance, suppression du compte.

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
      <ScreenHeader title={title} />
      <ContentUnavailable icon="hammer" title={title} className="soon-state"
        text="Cet écran arrive bientôt sur le site. En attendant, il est dans l’app Nidalo, avec le même compte." />
    </div>
  );
}

/** « Informations légales » (LegalInfoView) : libellé « Textes », puis les trois textes en lignes de menu ; chacun s'ouvre dans Mon compte. */
export function LegalScreen() {
  return (
    <div className="space">
      <ScreenHeader title="Informations légales" />
      <MenuGroup title="Textes" rows={LEGAL_TEXTS.map((text) => ({
        icon: 'fileText' as const, title: LEGAL_TITLES[text], href: accountPath('legal', { texte: text }),
      }))} />
    </div>
  );
}

/** « Connexion et sécurité » : la page « en construction » de l'app (ProfilePlaceholderView), avec son texte. */
export function SecurityScreen() {
  return (
    <div className="space">
      <ScreenHeader title="Connexion et sécurité" />
      <div className="placeholder-state">
        <h2><Icon name="hammer" />Connexion et sécurité</h2>
        <p>
          Compte créé avec une adresse e-mail : pour changer de mot de passe, déconnectez-vous, puis touchez « Mot de passe
          oublié » sur l&apos;écran de connexion. Compte Apple ou Google : votre mot de passe se gère chez Apple ou Google.
        </p>
      </div>
    </div>
  );
}

/**
 * « Confidentialité et données » (PrivacyDataView) : « Aucun suivi publicitaire », puis le réglage « Me retrouver par
 * mon numéro » (profiles.findable_by_phone). Les autorisations de l'iPhone et l'export du fichier de l'iPhone restent
 * dans l'app.
 */
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
    <div className="space privacy-screen">
      <ScreenHeader title="Confidentialité et données" />
      <InfoCard icon="shieldCheck" title="Aucun suivi publicitaire"
        text="Nidalo n'affiche aucune publicité et n'utilise aucun outil de mesure d'audience ni aucun traceur. Nidalo ne vend ni ne loue vos données." />
      <div className="toggle-card app-card">
        <label className="toggle-row">
          <span>Me retrouver par mon numéro</span>
          <input type="checkbox" role="switch" className="switch" checked={value} disabled={busy} onChange={(event) => void toggle(event.target.checked)} />
        </label>
        <p>Les personnes qui ont déjà votre numéro peuvent vous retrouver dans « Nouveau contact ». Votre numéro ne leur est jamais montré.</p>
        {error && <p className="field-error">{error}</p>}
      </div>
    </div>
  );
}

/** Carte d'information de Mon compte (InfoCard) : icône dans un carré bleu de 40, titre de 16 gras, texte de 13,5 gris. */
function InfoCard({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <section className="info-tile-card app-card">
      <h2><span className="info-tile" aria-hidden="true"><Icon name={icon} /></span>{title}</h2>
      <p>{text}</p>
    </section>
  );
}

/**
 * « Type de compte » (AccountTypePage) : libellé « Votre compte », la ligne du type actuel avec sa coche, puis
 * « Passer en… » ; la même confirmation qu'avant, et le formulaire de l'agence d'abord pour un compte sans fiche.
 */
export function AccountTypeScreen({ account }: { account: Account }) {
  const isPro = account.profile.account_type === 'professional';
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function switchType() {
    setAsking(false);
    setError(null);
    const failure = await saveAccountType(isPro ? 'individual' : 'professional');
    if (failure) setError(failure);
  }
  return (
    <div className="space menu-page">
      <ScreenHeader title="Type de compte" />
      <MenuGroup title="Votre compte" rows={[{
        icon: isPro ? 'briefcaseBusiness' : 'userRound', title: isPro ? 'Professionnel' : 'Particulier', tint: 'blue', info: true,
        trailing: <span className="menu-page-check" role="img" aria-label="Type actuel"><Icon name="check" /></span>,
      }]} />
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="button" className="btn btn-primary menu-page-button" onClick={() => setAsking(true)}>
        {isPro ? 'Passer en particulier' : 'Passer en professionnel'}
      </button>
      <AlertDialog
        open={asking}
        onClose={() => setAsking(false)}
        title={isPro ? 'Passer en particulier ?' : 'Passer en professionnel ?'}
        message="Vous pourrez revenir en arrière à tout moment depuis Type de compte."
        actions={[
          // Sans fiche agence, l'app ouvre d'abord le formulaire professionnel : le site aussi (Profil agence).
          !isPro && !account.profile.professional_profile_id
            ? { label: 'Passer en professionnel', href: AGENCY_FORM_PATH }
            : { label: isPro ? 'Passer en particulier' : 'Passer en professionnel', onClick: () => void switchType() },
          { label: 'Annuler', onClick: () => setAsking(false), role: 'cancel' },
        ]}
      />
    </div>
  );
}

/** Questions de l'aide (HelpView), mot pour mot ; « ce navigateur » à la place de « cet iPhone ». */
const HELP_QUESTIONS: [string, string][] = [
  ['Comment programmer une visite ?',
    'Depuis la fiche d\'un bien, touchez « Demander » sur la carte « Aucune visite prévue », ou ajoutez-la dans votre agenda (Mon compte). Vous retrouvez toutes vos visites dans l\'agenda.'],
  ['Comment est calculée la rentabilité ?',
    'La rentabilité brute rapporte les loyers annuels au prix d\'achat. La rentabilité nette et le cash-flow tiennent compte des charges, de la taxe foncière et du crédit.'],
  ['Comment déposer une annonce ?',
    'Touchez le bouton « + » au centre de la barre du bas : photos, adresse, prix, surface, DPE, puis publication.'],
  ['Mes favoris sont-ils sauvegardés ?',
    'Oui : une fois connecté, ils sont liés à votre compte et vous les retrouvez sur vos autres appareils.'],
  ['Comment supprimer mon compte ?',
    'Dans Mon compte, « Supprimer mon compte » : votre compte, vos annonces et leurs photos, vos demandes de visite, vos données de professionnel, vos documents privés en ligne et les données gardées dans ce navigateur sont effacés ; les messages déjà envoyés restent visibles par vos interlocuteurs, sans votre nom.'],
];

/** « Aide et assistance » (HelpView) : « Questions fréquentes » repliables, puis « Écrire à l'équipe » (e-mail). */
export function HelpScreen() {
  const desktop = useDesktop();
  return (
    <div className="space help-screen">
      <ScreenHeader title="Aide et assistance" />
      <section className="help-section" aria-labelledby="aide-questions">
        <SectionLabel id="aide-questions" title="Questions fréquentes" />
        <GroupCard separatorInset={16}>
          {HELP_QUESTIONS.map(([question, answer], index) => (
            <li key={question}>
              <details className="help-question">
                <summary>
                  <span>{question}</span>
                  <Icon name="chevronRight" className="icon help-chevron" />
                </summary>
                {/* Sur ordinateur, le bouton « Publier une annonce » de la barre du haut remplace le « + » de la barre du bas. */}
                <p>{index === 2 && desktop ? 'Cliquez sur « Publier une annonce » dans la barre du haut : photos, adresse, prix, surface, DPE, puis publication.' : answer}</p>
              </details>
            </li>
          ))}
        </GroupCard>
        <a className="app-button app-button-secondary help-contact" href={`mailto:${CONTACT_EMAIL}`}>Écrire à l&apos;équipe</a>
      </section>
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
      <div className="delete-card app-card">
        <span className="delete-tile" aria-hidden="true"><Icon name="trash2" /></span>
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
        <div className="delete-buttons">
          <button type="button" className="app-button app-button-danger" onClick={confirm} disabled={busy} aria-busy={busy || undefined}>
            {busy && <span className="spinner spinner-white" aria-hidden="true" />}
            Supprimer définitivement
          </button>
          <a
            className="app-button app-button-secondary"
            href={busy ? undefined : accountPath()}
            aria-disabled={busy || undefined}
            role={busy ? 'link' : undefined}
            onClick={(event) => { if (busy) event.preventDefault(); }}
          >
            Annuler
          </a>
        </div>
      </div>
    </div>
  );
}
