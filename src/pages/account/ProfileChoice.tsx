import { useState } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { setNewAccount, signOut } from '../../lib/account/auth';
import { saveAccountType, type Account, type AccountType } from '../../lib/account/profile';

// « Quel est votre profil ? » (Features/Account/AccountTypeView.swift), à la première connexion d'un compte neuf.

const TYPES: { value: AccountType; icon: IconName; title: string; text: string; tags: string[] }[] = [
  { value: 'individual', icon: 'user', title: 'Particulier', text: 'Je recherche un bien, je loue, je vends ou je souhaite investir.', tags: ['Projet', 'Visites', 'Contrats'] },
  { value: 'professional', icon: 'briefcase', title: 'Professionnel', text: 'Agence, promoteur, mandataire ou gestionnaire immobilier.', tags: ['Annonces', 'Contacts', 'Ventes'] },
];

export function ProfileChoice({ account, onDone }: { account: Account; onDone: () => void }) {
  const [choice, setChoice] = useState<AccountType>(account.profile.account_type);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space profile-choice">
      <div className="profile-choice-top">
        <button type="button" className="plain-back" onClick={() => void signOut()} aria-label="Retour"><Icon name="arrowLeft" /></button>
        <span>Étape 2 sur 2</span>
      </div>
      <h1>Quel est votre profil ?</h1>
      <p className="profile-choice-subtitle">Choisissez le type de compte qui correspond à votre situation.</p>
      <div className="type-cards" role="radiogroup" aria-label="Type de compte">
        {TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            role="radio"
            aria-checked={choice === type.value}
            className={`type-card${choice === type.value ? ' is-selected' : ''}`}
            onClick={() => setChoice(type.value)}
          >
            <span className="type-icon"><Icon name={type.icon} /></span>
            <span className="type-text">
              <span className="type-title">{type.title}</span>
              <span className="type-description">{type.text}</span>
              <span className="type-tags">{type.tags.map((tag) => <span key={tag}>{tag}</span>)}</span>
            </span>
            <span className="type-check" aria-hidden="true">{choice === type.value && <Icon name="check" />}</span>
          </button>
        ))}
      </div>
      <p className="profile-choice-info"><Icon name="shieldCheck" />Vous pourrez changer de type de compte à tout moment depuis Mon compte.</p>
      {error && <p className="signin-error" role="alert">{error}</p>}
      <button type="button" className="signin-primary" onClick={proceed} disabled={busy}>
        {busy ? <span className="spinner spinner-white" aria-label="Patientez" /> : <>Continuer <Icon name="arrowRight" /></>}
      </button>
    </div>
  );
}
