import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChoiceChip } from '../../components/FilterControls';
import { Icon } from '../../components/Icon';
import { PlaceField } from '../../components/PlaceField';
import { useSheetDrag } from '../../components/useSheetDrag';
import { useDesktop } from '../../lib/desktop';
import { AlertDialog, Modal, type AlertAction } from '../listing/Dialogs';
import {
  avatarUrl, formFor, normalizedPhone, preparedPhoto, profileErrors, publicName, saveAccountType, saveFindableByPhone,
  saveProfile, SITUATIONS, type Account, type PhotoChange, type ProfileField, type ProfileForm,
} from '../../lib/account/profile';
import { streetSuggestions, type PlaceSuggestion } from '../../lib/places';
import { accountPath, AGENCY_FORM_PATH } from '../../lib/paths';
import { AppSection, Avatar, ScreenHeader, Toast } from './parts';

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
  const [dialog, setDialog] = useState<'leave' | 'phone' | 'type' | 'photo' | null>(null);
  const desktop = useDesktop();
  // Où mène « Quitter sans enregistrer » : Mon compte, ou le formulaire de l'agence (« Passer en professionnel »).
  const [leaveTo, setLeaveTo] = useState<string>(accountPath());
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
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

  function leave(path: string) {
    setLeaveTo(path);
    if (dirty) setDialog('leave');
    else window.location.assign(path);
  }

  function back() {
    leave(accountPath());
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

  const hasPhoto = currentPhoto !== null;
  // Comme l'appareil photo de l'app, « Prendre une photo » seulement sur un téléphone (l'appareil du navigateur).
  const choices: AlertAction[] = [
    { label: desktop ? 'Choisir une photo' : 'Choisir dans la photothèque', onClick: () => { setDialog(null); fileRef.current?.click(); } },
    ...(desktop ? [] : [{ label: 'Prendre une photo', onClick: () => { setDialog(null); cameraRef.current?.click(); } }]),
    ...(hasPhoto ? [{ label: 'Supprimer la photo', onClick: () => { setDialog(null); setPhoto(null); }, role: 'destructive' as const }] : []),
  ];

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
      {/* Refus à l'enregistrement (mots interdits, réseau…) : sous l'en-tête, visible sans faire défiler. */}
      {saveError && <p className="info-save-error" role="alert">{saveError}</p>}
      <form ref={formRef} className="info-form" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <AppSection title="Photo de profil">
          <div className="photo-row">
            <button type="button" className="photo-avatar" onClick={() => setDialog('photo')} aria-label="Modifier la photo de profil">
              {currentPhoto ? <img src={currentPhoto} alt="" width={84} height={84} /> : <Avatar name={account.profile.display_name} path={null} size={84} />}
              <span className="photo-badge" aria-hidden="true"><Icon name="camera" /></span>
            </button>
            <div className="photo-actions">
              <button type="button" className="app-button app-button-secondary" onClick={() => setDialog('photo')}>
                {hasPhoto ? 'Changer la photo' : 'Ajouter une photo'}
              </button>
              {hasPhoto && <button type="button" className="info-text-button is-danger" onClick={() => setPhoto(null)}>Supprimer la photo</button>}
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
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="user"
            hidden
            onChange={(event) => { void choosePhoto(event.target.files?.[0]); event.target.value = ''; }}
          />
        </AppSection>

        <AppSection title="Identité">
          <TextInput label="Prénom" field="firstName" errors={errors} value={form.firstName} onChange={(v) => update('firstName', v)} autoComplete="given-name" />
          <TextInput label="Nom" field="lastName" errors={errors} value={form.lastName} onChange={(v) => update('lastName', v)} autoComplete="family-name" />
          <Field label="Date de naissance (facultative)" error={errors.birthDate}>
            {form.birthDate ? (
              <div className="date-row">
                <input
                  type="date"
                  className="text-input"
                  aria-label="Date de naissance"
                  value={form.birthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  aria-invalid={errors.birthDate ? true : undefined}
                  onChange={(event) => update('birthDate', event.target.value)}
                />
                <button type="button" className="info-text-button" onClick={() => update('birthDate', '')}>Effacer</button>
              </div>
            ) : (
              // Comme l'app : la date proposée est celle d'il y a 30 ans, à régler ensuite.
              <button type="button" className="app-button app-button-secondary" onClick={() => update('birthDate', thirtyYearsAgo())}>
                <Icon name="plus" />Ajouter une date de naissance
              </button>
            )}
          </Field>
          <label className="info-toggle">
            <span className="info-toggle-text">
              <span className="info-toggle-title">Afficher mon nom complet sur mes annonces</span>
              <span className="info-toggle-detail">
                {form.showsFullName
                  ? 'Les autres voient votre prénom et votre nom.'
                  : `Sinon : ${sentence(publicName(form.firstName.trim() || 'Prénom', form.lastName.trim() || 'Nom', false))}`}
              </span>
            </span>
            <input type="checkbox" role="switch" className="switch" checked={form.showsFullName} onChange={(event) => update('showsFullName', event.target.checked)} />
          </label>
        </AppSection>

        <AppSection title="Coordonnées">
          <Field label="Adresse e-mail" error={errors.email}>
            <input type="email" className="text-input is-locked" value={form.email} disabled readOnly />
          </Field>
          <p className="info-hint">C&apos;est l&apos;adresse de connexion de votre compte. Elle ne peut pas encore être modifiée.</p>
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
        </AppSection>

        <AppSection title="Informations complémentaires">
          <Field label="Situation professionnelle (facultative)">
            <div className="info-choices">
              {SITUATIONS.map((situation) => (
                <ChoiceChip key={situation.value} title={situation.label} selected={form.situation === situation.value} expands
                  onClick={() => update('situation', form.situation === situation.value ? null : situation.value)} />
              ))}
            </div>
            <p className="info-hint">Elle sert aussi à préparer votre dossier immobilier. Touchez à nouveau un choix pour l&apos;effacer.</p>
          </Field>
          <Field label="Type de compte">
            <div className="type-row">
              <span className="type-value">{isPro ? 'Professionnel' : 'Particulier'}</span>
              <button type="button" className="info-text-button" onClick={() => setDialog('type')}>
                {isPro ? 'Passer en particulier' : 'Passer en professionnel'}
              </button>
            </div>
          </Field>
        </AppSection>
      </form>

      <AlertDialog
        open={dialog === 'photo'}
        onClose={() => setDialog((current) => (current === 'photo' ? null : current))}
        title="Photo de profil"
        actions={choices}
      />
      <AlertDialog
        open={dialog === 'leave'}
        onClose={() => setDialog(null)}
        title="Quitter sans enregistrer ?"
        message="Vos modifications ne sont pas encore enregistrées."
        actions={[
          { label: 'Enregistrer les modifications', onClick: () => { setDialog(null); void save().then((ok) => { if (ok) window.location.assign(leaveTo); }); } },
          { label: 'Quitter sans enregistrer', href: leaveTo, role: 'destructive' },
          { label: 'Continuer', onClick: () => setDialog(null) },
        ]}
      />
      <FindabilitySheet
        open={dialog === 'phone'}
        onAnswer={(accepted) => {
          setDialog(null);
          if (accepted) void saveFindableByPhone(true).then((failure) => { if (failure) setSaveError(failure); });
        }}
      />
      <AlertDialog
        open={dialog === 'type'}
        // Ne ferme qu'elle-même : « Passer en professionnel » peut ouvrir « Quitter sans enregistrer ? » à sa place, et
        // la fermeture de cette fenêtre-ci arrive après.
        onClose={() => setDialog((current) => (current === 'type' ? null : current))}
        title={isPro ? 'Passer en particulier ?' : 'Passer en professionnel ?'}
        message="Vous pourrez revenir en arrière à tout moment depuis Type de compte."
        actions={[
          {
            label: isPro ? 'Passer en particulier' : 'Passer en professionnel',
            // Sans fiche agence, l'app ouvre d'abord le formulaire professionnel : le site aussi (Profil agence).
            onClick: () => (!isPro && !account.profile.professional_profile_id ? leave(AGENCY_FORM_PATH) : void switchType()),
          },
          { label: 'Annuler', onClick: () => setDialog(null), role: 'cancel' },
        ]}
      />
    </div>
  );
}

/** Date d'il y a 30 ans (AAAA-MM-JJ), proposée par « Ajouter une date de naissance ». */
function thirtyYearsAgo(now = new Date()): string {
  const date = new Date(now.getFullYear() - 30, now.getMonth(), now.getDate());
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Feuille proposée une fois après l'enregistrement d'un numéro (PhoneFindabilityPrompt) : téléphone de 22 dans un rond
 * bleu pâle de 46, question de 18 gras, texte de 13 gris, puis « Plus tard » et « Oui » côte à côte ; marges 20.
 * Refermée sans réponse (tirée vers le bas, Échap, à côté) : comme « Plus tard ».
 */
function FindabilitySheet({ open, onAnswer }: { open: boolean; onAnswer: (accepted: boolean) => void }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  useSheetDrag(root, () => onAnswer(false), true);
  return (
    <Modal open={open} onClose={() => onAnswer(false)} className="alert-dialog findability-sheet" labelledBy={`${id}-titre`} describedBy={`${id}-texte`}>
      <div ref={root} className="findability-body">
        <div className="findability-top" data-sheet-grab="">
          <span className="alert-grabber" aria-hidden="true" />
          <span className="findability-icon" aria-hidden="true"><Icon name="phone" /></span>
        </div>
        <h2 id={`${id}-titre`}>Permettre aux personnes qui ont votre numéro de vous retrouver ?</h2>
        <p id={`${id}-texte`}>Elles vous trouvent dans « Nouveau contact ». Votre numéro ne leur est jamais montré. Modifiable dans Confidentialité et données.</p>
        <div className="findability-actions">
          <button type="button" className="btn btn-light" onClick={() => onAnswer(false)}>Plus tard</button>
          <button type="button" className="btn btn-primary" onClick={() => onAnswer(true)}>Oui</button>
        </div>
      </div>
    </Modal>
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
