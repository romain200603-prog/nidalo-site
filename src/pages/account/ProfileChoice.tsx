import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { MenuRows, SectionLabel, type MenuRowItem } from '../../components/MenuRows';
import { RoundButton } from '../../components/RoundButton';
import { StepProgressBar } from '../../components/StepProgressBar';
import { setNewAccount, signOut } from '../../lib/account/auth';
import { saveAccountType, type Account, type AccountType } from '../../lib/account/profile';
import '../../styles/profil-app.css';

// « Quel est votre profil ? » (Features/Account/AccountTypeView.swift), à la première connexion d'un compte neuf :
// « Étape 2 sur 2 » et sa barre, les deux cartes de choix, « Avec ce compte » (trois lignes pour le type choisi), les
// justificatifs, puis, en bas de l'écran, « Modifiable à tout moment depuis Mon compte » et « Continuer en tant
// que… ». Le retour déconnecte, comme l'app ; « Continuer » enregistre le type comme avant (profiles.account_type).

const TYPES: { value: AccountType; icon: IconName; title: string; text: string }[] = [
  { value: 'individual', icon: 'person', title: 'Particulier', text: 'Je recherche un bien, je loue, je vends ou je souhaite investir.' },
  { value: 'professional', icon: 'briefcase', title: 'Professionnel', text: 'Agence, promoteur, mandataire ou gestionnaire immobilier.' },
];

/** Ce que le compte apporte : trois lignes d'information, sans action ni chevron (benefits(for:) de l'app). */
const BENEFITS: Record<AccountType, MenuRowItem[]> = {
  individual: [
    { icon: 'target', title: 'Mon projet immobilier', subtitle: 'Critères, budget et dossier', tint: 'green', info: true },
    { icon: 'calendarBlank', title: 'Mon agenda de visites', subtitle: 'Demandes, rappels et comptes rendus', tint: 'blue', info: true },
    { icon: 'fileText', title: 'Contrats et location', subtitle: 'Bail, quittances, états des lieux, offres', tint: 'teal', info: true },
  ],
  professional: [
    { icon: 'home', title: 'Annonces et mandats', subtitle: 'Diffusion, suivi et statistiques', tint: 'blue', info: true },
    { icon: 'users', title: 'Contacts et ventes', subtitle: 'Acquéreurs, vendeurs, compromis signés', tint: 'blue', info: true },
    { icon: 'building2', title: 'Équipe et profil agence', subtitle: 'Collaborateurs et page de l\'agence', tint: 'blue', info: true },
  ],
};

const PAPERS: Record<AccountType, string> = {
  individual: 'Aucun justificatif à fournir',
  professional: 'À fournir ensuite : Kbis, carte professionnelle, RCP',
};

const CONTINUE: Record<AccountType, string> = {
  individual: 'Continuer en tant que particulier',
  professional: 'Continuer en tant que professionnel',
};

/**
 * Carte de choix (AccountTypeCard) : blanche, coins 22, icône de 22 dans un carré bleu pâle de 42, titre et
 * description ; choisie : bordure bleue de 2, ombre bleue et rond coché en haut à droite.
 */
function AccountTypeCard({ type, selected, onSelect }: { type: (typeof TYPES)[number]; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} className={`app-type-card${selected ? ' is-selected' : ''}`} onClick={onSelect}>
      <span className="app-type-icon" aria-hidden="true"><Icon name={type.icon} /></span>
      <span className="app-type-text">
        <span className="app-type-title">{type.title}</span>
        <span className="app-type-detail">{type.text}</span>
      </span>
      <span className="app-type-check" aria-hidden="true"><Icon name="check" /></span>
    </button>
  );
}

export function ProfileChoice({ account, onDone }: { account: Account; onDone: () => void }) {
  const [choice, setChoice] = useState<AccountType>(account.profile.account_type);
  // Liste du type quitté, qui s'efface pendant que l'autre arrive (le ZStack de l'app) ; aucun mouvement à l'ouverture.
  const [leaving, setLeaving] = useState<AccountType | null>(null);
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (leaving === null) return undefined;
    const timer = window.setTimeout(() => setLeaving(null), 160);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  function select(type: AccountType) {
    if (type === choice) return;
    setLeaving(choice);
    setChoice(type);
    setChanged(true);
  }

  async function proceed() {
    setBusy(true);
    setError(null);
    if (choice !== account.profile.account_type) {
      const failure = await saveAccountType(choice);
      if (failure) {
        setBusy(false);
        setError(failure);
        return;
      }
    }
    setNewAccount(false);
    setBusy(false);
    onDone();
  }

  const fade = changed ? ' is-changed' : '';
  return (
    <div className="app-profile-step">
      <div className="app-profile-content">
        <div className="app-profile-top">
          <RoundButton icon="arrowLeft" label="Retour" onClick={() => void signOut()} />
          <span className="app-profile-step-text">Étape 2 sur 2</span>
        </div>
        <StepProgressBar current={1} total={2} className="app-profile-bar" />
        <h1 className="app-profile-title">Quel est votre profil ?</h1>
        <p className="app-profile-subtitle">Choisissez le type de compte qui correspond à votre situation.</p>
        <div className="app-type-cards" role="radiogroup" aria-label="Type de compte">
          {TYPES.map((type) => <AccountTypeCard key={type.value} type={type} selected={choice === type.value} onSelect={() => select(type.value)} />)}
        </div>
        <div className="app-profile-label"><SectionLabel title="Avec ce compte" /></div>
        <div className="app-profile-benefits">
          {leaving !== null && leaving !== choice && (
            <div key={`sortie-${leaving}`} className="app-profile-benefits-list is-leaving" aria-hidden="true"><MenuRows rows={BENEFITS[leaving]} /></div>
          )}
          <div key={choice} className={`app-profile-benefits-list${fade}`}><MenuRows rows={BENEFITS[choice]} /></div>
        </div>
        <p className="app-profile-papers">
          <Icon name="fileText" />
          <span key={choice} className={`app-profile-fading${fade}`}>{PAPERS[choice]}</span>
        </p>
      </div>
      {/* Bas de l'écran, fixe sur téléphone : réassurance et bouton. */}
      <div className="app-profile-bottom">
        <p className="app-profile-note"><Icon name="shieldCheck" />Modifiable à tout moment depuis Mon compte</p>
        {error && <p className="signin-error app-profile-error" role="alert">{error}</p>}
        <button type="button" className="app-profile-continue" onClick={() => void proceed()} disabled={busy}>
          {busy ? <span className="spinner spinner-white" aria-label="Patientez" /> : (
            <><span key={choice} className={`app-profile-continue-text app-profile-fading${fade}`}>{CONTINUE[choice]}</span><Icon name="arrowRight" /></>
          )}
        </button>
      </div>
    </div>
  );
}
