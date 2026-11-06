import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { PlaceField } from '../../components/PlaceField';
import { AlertDialog } from '../listing/Dialogs';
import {
  avatarUrl, formFor, normalizedPhone, preparedPhoto, profileErrors, publicName, saveAccountType, saveFindableByPhone,
  saveProfile, SITUATIONS, type Account, type PhotoChange, type ProfileField, type ProfileForm,
} from '../../lib/account/profile';
import { streetSuggestions, type PlaceSuggestion } from '../../lib/places';
import { accountPath } from '../../lib/paths';
import { Avatar, ScreenHeader, Toast } from './parts';

/** Point final, sans le doubler après une initiale (« Claire M. », pas « Claire M.. »). */
function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

// « Mes informations » (Features/Profile/EditProfileView.swift).

const PHONE_PROMPT_KEY = (userId: string) => `proposition-numero-${userId}`;

function promptAlreadyShown(userId: string): boolean {
  try {
    return window.localStorage.getItem(PHONE_PROMPT_KEY(userId)) === '1';
  } catch {
    return true;
  }
}

function rememberPrompt(userId: string) {
  try {
    window.localStorage.setItem(PHONE_PROMPT_KEY(userId), '1');
  } catch {
    // Sans stockage, la question reviendra : rien de grave.
  }
}

export function MyInfo({ account }: { account: Account }) {
  const initial = useMemo(() => formFor(account), [account]);
  const [form, setForm] = useState<ProfileForm>(initial);
  const [photo, setPhoto] = useState<PhotoChange>(undefined);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'leave' | 'phone' | 'type' | 'proForm' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Après un enregistrement, le compte est relu : le formulaire repart des valeurs enregistrées.
  useEffect(() => setForm(initial), [initial]);

  const preview = useMemo(() => (photo instanceof Blob ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const errors = submitted ? profileErrors(form) : {};
  const dirty = photo !== undefined || JSON.stringify(form) !== JSON.stringify(initial);
  const currentPhoto = photo === null ? null : preview ?? avatarUrl(account.profile.avatar_path);
  const isPro = form.accountType === 'professional';

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function choosePhoto(file: File | undefined) {
    setPhotoError(null);
    if (!file) return;
    try {
      setPhoto(await preparedPhoto(file));
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Cette photo n\'a pas pu être lue.');
    }
  }

  async function save(): Promise<boolean> {
    setSubmitted(true);
    setSaveError(null);
    const found = profileErrors(form);
    if (Object.keys(found).length) {
      // Défile jusqu'au premier champ en erreur.
      window.setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
      return false;
    }
    setSaving(true);
    const failure = await saveProfile(account, form, photo);
    setSaving(false);
    if (failure) {
      setSaveError(failure);
      return false;
    }
    setPhoto(undefined);
    setSubmitted(false);
    setToast('Modifications enregistrées');
    window.setTimeout(() => setToast(null), 2500);
    const hasPhone = form.phone.trim() !== '' && normalizedPhone(form.phone) !== null;
    if (!isPro && hasPhone && account.profile.findable_by_phone !== true && !promptAlreadyShown(account.profile.id)) {
      rememberPrompt(account.profile.id);
      setDialog('phone');
    }
    return true;
  }

  function back() {
    if (dirty) setDialog('leave');
    else window.location.assign(accountPath());
  }

  async function switchType() {
    setDialog(null);
    const failure = await saveAccountType(isPro ? 'individual' : 'professional');
    if (failure) setSaveError(failure);
  }

  function chooseStreet(place: PlaceSuggestion) {
    setForm((current) => ({
      ...current,
      street: place.name,
      postalCode: place.postalCode ?? current.postalCode,
      city: place.city ?? current.city,
    }));
  }

  return (
    <div className="space my-info">
      <Toast text={toast} />
      <ScreenHeader
        title="Mes informations"
        onBack={back}
        action={(
          <button type="button" className="save-capsule" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? <span className="spinner spinner-white" aria-label="Enregistrement" /> : 'Enregistrer'}
          </button>
        )}
      />
      <form ref={formRef} className="info-form" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <section className="info-card space-card photo-card">
          <h2 className="field-group-title">Photo de profil</h2>
          <div className="photo-row">
            <span className="photo-avatar">
              {currentPhoto ? <img src={currentPhoto} alt="" width={84} height={84} /> : <Avatar name={account.profile.display_name} path={null} size={84} />}
              <button type="button" className="photo-badge" onClick={() => fileRef.current?.click()} aria-label="Modifier la photo de profil">
                <Icon name="camera" />
              </button>
            </span>
            <div className="photo-actions">
              <button type="button" className="small-button" onClick={() => fileRef.current?.click()}>
                {currentPhoto ? 'Changer la photo' : 'Ajouter une photo'}
              </button>
              {currentPhoto && (
                <button type="button" className="link-button is-danger" onClick={() => setPhoto(null)}>Supprimer la photo</button>
              )}
            </div>
          </div>
          {photoError && <p className="field-error">{photoError}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/webp"
            hidden
            onChange={(event) => { void choosePhoto(event.target.files?.[0]); event.target.value = ''; }}
          />
        </section>

        <section className="info-card space-card">
          <h2 className="field-group-title">Identité</h2>
          <TextInput label="Prénom" field="firstName" errors={errors} value={form.firstName} onChange={(v) => update('firstName', v)} autoComplete="given-name" />
          <TextInput label="Nom" field="lastName" errors={errors} value={form.lastName} onChange={(v) => update('lastName', v)} autoComplete="family-name" />
          <Field label="Date de naissance (facultative)" error={errors.birthDate}>
            <div className="date-row">
              <input
                type="date"
                className="text-input"
                value={form.birthDate}
                max={new Date().toISOString().slice(0, 10)}
                aria-invalid={errors.birthDate ? true : undefined}
                onChange={(event) => update('birthDate', event.target.value)}
              />
              {form.birthDate && <button type="button" className="link-button" onClick={() => update('birthDate', '')}>Effacer</button>}
            </div>
          </Field>
          <label className="toggle-row">
            <span>Afficher mon nom complet sur mes annonces</span>
            <input type="checkbox" role="switch" className="switch" checked={form.showsFullName} onChange={(event) => update('showsFullName', event.target.checked)} />
          </label>
          <p className="field-hint">
            {form.showsFullName
              ? 'Les autres voient votre prénom et votre nom.'
              : `Sinon : ${sentence(publicName(form.firstName.trim() || 'Prénom', form.lastName.trim() || 'Nom', false))}`}
          </p>
        </section>

        <section className="info-card space-card">
          <h2 className="field-group-title">Coordonnées</h2>
          <Field label="Adresse e-mail" error={errors.email}>
            <input type="email" className="text-input" value={form.email} disabled readOnly />
          </Field>
          <p className="field-hint">C&apos;est l&apos;adresse de connexion de votre compte. Elle ne peut pas encore être modifiée.</p>
          <TextInput label="Téléphone (facultatif)" field="phone" errors={errors} value={form.phone} onChange={(v) => update('phone', v)} inputMode="tel" autoComplete="tel" />
          <Field label="Adresse postale (facultative)">
            <PlaceField
              className="form-place"
              label="Adresse postale (facultative)"
              placeholder="Numéro et rue"
              value={form.street}
              onChange={(text) => update('street', text)}
              onChoose={chooseStreet}
              fetcher={(text, limit, signal) => streetSuggestions(text, limit, signal, form.postalCode)}
            />
          </Field>
          <div className="field-pair postal-pair">
            <TextInput label="Code postal" field="postalCode" errors={errors} value={form.postalCode} onChange={(v) => update('postalCode', v)} inputMode="numeric" autoComplete="postal-code" />
            <Field label="Ville" error={errors.city}>
              <PlaceField
                className="form-place"
                label="Ville"
                placeholder="Ville"
                value={form.city}
                onChange={(text) => update('city', text)}
                onChoose={(place) => setForm((current) => ({ ...current, city: place.city ?? place.name, postalCode: place.postalCode ?? current.postalCode }))}
              />
            </Field>
          </div>
        </section>

        <section className="info-card space-card">
          <h2 className="field-group-title">Informations complémentaires</h2>
          <Field label="Situation professionnelle (facultative)">
            <div className="chips-wrap">
              {SITUATIONS.map((situation) => (
                <button
                  key={situation.value}
                  type="button"
                  className="chip"
                  aria-pressed={form.situation === situation.value}
                  onClick={() => update('situation', form.situation === situation.value ? null : situation.value)}
                >
                  {situation.label}
                </button>
              ))}
            </div>
          </Field>
          <p className="field-hint">Elle sert aussi à préparer votre dossier immobilier. Touchez à nouveau un choix pour l&apos;effacer.</p>
          <div className="type-row">
            <div>
              <span className="field-label">Type de compte</span>
              <span className="type-value">{isPro ? 'Professionnel' : 'Particulier'}</span>
            </div>
            <button type="button" className="small-button" onClick={() => setDialog('type')}>
              {isPro ? 'Passer en particulier' : 'Passer en professionnel'}
            </button>
          </div>
        </section>
        {saveError && <p className="signin-error" role="alert">{saveError}</p>}
      </form>

      <AlertDialog
        open={dialog === 'leave'}
        onClose={() => setDialog(null)}
        title="Quitter sans enregistrer ?"
        message="Vos modifications ne sont pas encore enregistrées."
        actions={[
          { label: 'Enregistrer les modifications', onClick: () => { setDialog(null); void save().then((ok) => { if (ok) window.location.assign(accountPath()); }); }, tone: 'primary' },
          { label: 'Quitter sans enregistrer', href: accountPath() },
          { label: 'Continuer', onClick: () => setDialog(null), tone: 'quiet' },
        ]}
      />
      <AlertDialog
        open={dialog === 'phone'}
        onClose={() => setDialog(null)}
        title="Permettre aux personnes qui ont votre numéro de vous retrouver ?"
        message="Elles vous trouvent dans « Nouveau contact ». Votre numéro ne leur est jamais montré. Modifiable dans Confidentialité et données."
        actions={[
          { label: 'Oui', onClick: () => { setDialog(null); void saveFindableByPhone(true); }, tone: 'primary' },
          { label: 'Plus tard', onClick: () => setDialog(null) },
        ]}
      />
      <AlertDialog
        open={dialog === 'type'}
        onClose={() => setDialog(null)}
        title={isPro ? 'Passer en particulier ?' : 'Passer en professionnel ?'}
        message="Vous pourrez revenir en arrière à tout moment depuis Type de compte."
        actions={[
          {
            label: isPro ? 'Passer en particulier' : 'Passer en professionnel',
            onClick: () => (!isPro && !account.profile.professional_profile_id ? setDialog('proForm') : void switchType()),
            tone: 'primary',
          },
          { label: 'Annuler', onClick: () => setDialog(null) },
        ]}
      />
      <AlertDialog
        open={dialog === 'proForm'}
        onClose={() => setDialog(null)}
        title="Compte professionnel"
        message="Pour passer en professionnel, renseignez d’abord votre entreprise et votre agence dans l’app Nidalo (Mon compte › Type de compte). Ce formulaire arrive bientôt sur le site."
        actions={[{ label: 'J\'ai compris', onClick: () => setDialog(null), tone: 'primary' }]}
      />
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="form-field">
      <span className="field-label">{label}</span>
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

function TextInput({ label, field, errors, value, onChange, inputMode, autoComplete }: {
  label: string;
  field: ProfileField;
  errors: Partial<Record<ProfileField, string>>;
  value: string;
  onChange: (value: string) => void;
  inputMode?: 'tel' | 'numeric' | 'text';
  autoComplete?: string;
}) {
  const error = errors[field];
  return (
    <label className="form-field">
      <span className="field-label">{label}</span>
      <input
        className="text-input"
        value={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
