import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { ListingCard } from '../../components/ListingCard';
import type { IconName } from '../../components/iconPaths';
import { AlertDialog } from '../listing/Dialogs';
import {
  agencyErrors, agencyFormFor, agencyPlace, loadAgency, professionalRows, saveAgency, websiteLabel,
  type AgencyField, type AgencyForm, type AgencyRecord,
} from '../../lib/account/agency';
import { loadMyListings, myListingsStore, ONLINE_STATUSES } from '../../lib/account/myListings';
import { avatarUrl, initials, phonePairs, preparedPhoto, type Account } from '../../lib/account/profile';
import { useStore } from '../../lib/account/session';
import { loadMemberAgency } from '../../lib/account/team';
import { cardContent } from '../../lib/cardContent';
import { accountPath, AGENCY_FORM_PATH, AGENCY_PATH, TEAM_PATH } from '../../lib/paths';
import { ScreenHeader, Spinner, Toast } from './parts';

// « Profil agence » de Mon compte : la page de l'agence telle que les autres la voient
// (Features/ListingDetail/PublisherViews.swift, AgencyProfileView) avec « Modifier », et son formulaire
// (Features/Profile/ProfessionalOnboardingView.swift). Sans fiche agence, le formulaire s'ouvre directement : c'est
// aussi « Passer en professionnel » sur le site. Un membre de l'équipe d'une agence (responsable ou agent) voit la page de
// cette agence, sans « Modifier » : seul son gérant la modifie.

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; agency: AgencyRecord | null; member: boolean };

export function AgencyProfile({ account, editing }: { account: Account; editing: boolean }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [mode, setMode] = useState<'view' | 'edit'>(editing ? 'edit' : 'view');
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setState({ status: 'loading' });
    try {
      const agency = await loadAgency();
      const team = agency ? null : await loadMemberAgency();
      setState({ status: 'ready', agency: agency ?? team?.agency ?? null, member: team !== null });
    } catch {
      setState({ status: 'error' });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  /** Après l'enregistrement : la fiche relue, à son adresse, avec un message bref. */
  async function saved(created: boolean) {
    let agency: AgencyRecord | null;
    try {
      agency = await loadAgency();
    } catch {
      window.location.assign(AGENCY_PATH);
      return;
    }
    window.history.replaceState(null, '', AGENCY_PATH);
    setState({ status: 'ready', agency, member: false });
    setMode('view');
    window.scrollTo(0, 0);
    setToast(created ? 'Fiche agence enregistrée' : 'Modifications enregistrées');
    window.setTimeout(() => setToast(null), 2500);
  }

  if (state.status === 'loading') return <Spinner />;
  if (state.status === 'error') {
    return (
      <div className="space">
        <ScreenHeader title="Profil agence" />
        <p className="signin-error" role="alert">Impossible de charger votre fiche agence. Réessayez dans un instant.</p>
        <button type="button" className="btn btn-light" onClick={() => void load()}>Réessayer</button>
      </div>
    );
  }
  if (state.member && state.agency) return <AgencyView agency={state.agency} toast={null} member />;
  if (mode === 'edit' || !state.agency) return <AgencyEditor account={account} agency={state.agency} onSaved={saved} />;
  return <AgencyView agency={state.agency} toast={toast} />;
}

// MARK: - Page de l'agence

function AgencyLogo({ name, url, size }: { name: string; url: string | null; size: number }) {
  return (
    <span className="agency-logo" style={{ width: size, height: size, fontSize: Math.round(size * 0.32) }} aria-hidden="true">
      {url ? <img src={url} alt="" width={size} height={size} /> : initials(name) || <Icon name="store" />}
    </span>
  );
}

function AgencyCard({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="agency-card space-card">
      <h2 className="agency-card-title"><Icon name={icon} />{title}</h2>
      {children}
    </section>
  );
}

function InfoRows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="agency-rows">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AgencyView({ agency, toast, member = false }: { agency: AgencyRecord; toast: string | null; member?: boolean }) {
  const details = agency.details;
  const place = agencyPlace(agency);
  const about = details?.about?.trim() || null;
  const contact = [
    ...(details?.phone ? [{ label: 'Téléphone', value: phonePairs(details.phone) }] : []),
    ...(details?.email?.trim() ? [{ label: 'E-mail', value: details.email.trim() }] : []),
  ];
  const website = details?.website?.trim() || null;
  const feeSchedule = details?.fee_schedule_url?.trim() || null;
  const professional = professionalRows(details);

  return (
    <div className="space agency-page">
      <Toast text={toast} />
      <ScreenHeader title="Profil agence" action={member ? undefined : <a className="save-capsule" href={AGENCY_FORM_PATH}>Modifier</a>} />
      <section className="agency-head space-card">
        <AgencyLogo name={agency.agency_name} url={avatarUrl(agency.logo_path)} size={88} />
        <h2 className="agency-name">{agency.agency_name}</h2>
        <div className="agency-badges">
          <span className="agency-pro-badge">PRO</span>
          {agency.is_verified && <span className="agency-verified"><Icon name="badgeCheck" />Vérifiée</span>}
        </div>
        {place && <p className="agency-place">{place}</p>}
      </section>
      {member && (
        <AgencyCard icon="users" title="L'équipe de l'agence">
          <p className="agency-note">Vous faites partie de l&apos;équipe de cette agence. Seul son gérant modifie cette fiche.</p>
          <a className="btn btn-light agency-site" href={TEAM_PATH}><Icon name="users" />Gestion des équipes</a>
        </AgencyCard>
      )}
      {about && (
        <AgencyCard icon="fileText" title="Présentation">
          <p className="agency-about">{about}</p>
        </AgencyCard>
      )}
      {(contact.length > 0 || website) && (
        <AgencyCard icon="phone" title="Contact">
          {contact.length > 0 && <InfoRows rows={contact} />}
          {website && (
            <a className="btn btn-light agency-site" href={website} target="_blank" rel="noopener noreferrer">
              <Icon name="link" />{websiteLabel(website)}
            </a>
          )}
        </AgencyCard>
      )}
      {feeSchedule && (
        <AgencyCard icon="fileText" title="Barème d'honoraires">
          <a className="btn btn-light agency-site" href={feeSchedule} target="_blank" rel="noopener noreferrer">
            <Icon name="link" />{websiteLabel(feeSchedule)}
          </a>
        </AgencyCard>
      )}
      <AgencyCard icon="badgeCheck" title="Informations professionnelles">
        {professional.length > 0
          ? <InfoRows rows={professional} />
          : <p className="agency-note">L&apos;agence n&apos;a pas encore renseigné ses informations professionnelles.</p>}
        {!agency.is_verified && (
          <p className="agency-caption">Ces informations sont déclarées par l&apos;agence et n&apos;ont pas encore été vérifiées par Nidalo.</p>
        )}
      </AgencyCard>
      {!member && <AgencyListings />}
    </div>
  );
}

/** « Ses biens » : les annonces en ligne du compte, en fiches comme les résultats (PublisherListingsSection). */
function AgencyListings() {
  const state = useStore(myListingsStore);
  useEffect(() => {
    void loadMyListings();
  }, []);
  const online = state.status === 'ready' ? state.items.filter((row) => ONLINE_STATUSES.includes(row.status)) : [];
  return (
    <section className="agency-listings">
      <h2 className="agency-listings-title">{online.length > 0 ? `Ses biens · ${online.length}` : 'Ses biens'}</h2>
      {state.status === 'error' ? (
        <p className="field-error">{state.message}</p>
      ) : state.status !== 'ready' ? (
        <Spinner />
      ) : online.length === 0 ? (
        <p className="agency-note">Aucune annonce en ligne pour le moment.</p>
      ) : (
        online.map((row) => <ListingCard key={row.id} row={row} content={cardContent(row, null, null)} headingLevel="h3" />)
      )}
    </section>
  );
}

// MARK: - Formulaire

function AgencyEditor({ account, agency, onSaved }: { account: Account; agency: AgencyRecord | null; onSaved: (created: boolean) => Promise<void> }) {
  const initial = useMemo(() => agencyFormFor(agency, account.email), [agency, account.email]);
  const [form, setForm] = useState<AgencyForm>(initial);
  const [logo, setLogo] = useState<Blob | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const preview = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const errors = submitted ? agencyErrors(form) : {};
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = logo !== null || JSON.stringify(form) !== JSON.stringify(initial);
  const backPath = agency ? AGENCY_PATH : accountPath();
  const currentLogo = preview ?? avatarUrl(agency?.logo_path ?? null);
  const isPro = account.profile.account_type === 'professional';
  const saveLabel = agency ? 'Enregistrer les modifications' : isPro ? 'Enregistrer ma fiche agence' : 'Passer en professionnel';

  function update<K extends keyof AgencyForm>(key: K, value: AgencyForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /** Logo réduit à 512 px au plus et converti en JPEG, comme l'app. */
  async function chooseLogo(file: File | undefined) {
    setLogoError(null);
    if (!file) return;
    try {
      setLogo(await preparedPhoto(file, 512));
    } catch {
      setLogoError('Ce logo n\'a pas pu être ouvert. Choisissez une autre image.');
    }
  }

  async function save(): Promise<boolean> {
    setSubmitted(true);
    setSaveError(null);
    if (Object.keys(agencyErrors(form)).length) {
      window.setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
      return false;
    }
    setSaving(true);
    const failure = await saveAgency(form, logo);
    setSaving(false);
    if (failure) {
      setSaveError(failure);
      return false;
    }
    await onSaved(agency === null);
    return true;
  }

  const field = (label: string, key: AgencyField, options: InputOptions = {}) => (
    <TextInput label={label} value={form[key]} error={errors[key]} onChange={(value) => update(key, value)} {...options} />
  );

  return (
    <div className="space agency-form-screen">
      <ScreenHeader title="Compte professionnel" onBack={() => (dirty ? setLeaving(true) : window.location.assign(backPath))} />
      <form ref={formRef} className="info-form" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <section className="agency-status space-card">
          <span className="agency-status-icon"><Icon name="badgeCheck" /></span>
          <div>
            <h2>{agency ? 'Vérification en attente' : 'Votre activité professionnelle'}</h2>
            <p>
              {agency
                ? 'Votre dossier est enregistré. La vérification de votre entreprise et de vos justificatifs par Nidalo arrivera bientôt : d’ici là, votre agence apparaît sans badge « Vérifiée ».'
                : 'Renseignez votre entreprise et votre agence. Elles apparaîtront sur vos annonces et votre page agence, sans badge « Vérifiée » tant que Nidalo n’a pas vérifié votre dossier.'}
            </p>
          </div>
        </section>

        <section className="info-card space-card">
          <h2 className="field-group-title">Entreprise</h2>
          {field('SIREN (9 chiffres)', 'siren', { inputMode: 'numeric' })}
          {field('SIRET (facultatif, 14 chiffres)', 'siret', { inputMode: 'numeric' })}
          {field('N° de carte professionnelle (facultatif)', 'cardNumber')}
          <TextInput label="CCI qui a délivré la carte (facultatif)" value={form.cardIssuer} onChange={(value) => update('cardIssuer', value)} maxLength={80} />
          <TextInput label="Garantie financière : organisme garant (facultatif)" value={form.financialGuarantor} onChange={(value) => update('financialGuarantor', value)} maxLength={200} />
          <TextInput label="RCP : assureur (facultatif)" value={form.liabilityInsurer} onChange={(value) => update('liabilityInsurer', value)} maxLength={120} />
          <TextInput label="RCP : n° de contrat (facultatif)" value={form.liabilityPolicy} onChange={(value) => update('liabilityPolicy', value)} maxLength={60} />
        </section>

        <section className="info-card space-card">
          <h2 className="field-group-title">Agence</h2>
          <div className="agency-logo-row">
            <span className="agency-logo-preview" aria-hidden="true">
              {currentLogo ? <img src={currentLogo} alt="" width={56} height={56} /> : <Icon name="store" />}
            </span>
            <span className="agency-logo-text">
              <span className="agency-logo-title">Logo de l&apos;agence</span>
              <span className="field-hint">{logo ? 'Envoyé à l’enregistrement' : 'Facultatif · JPEG, PNG, HEIC ou WebP'}</span>
            </span>
            <button type="button" className="small-button" onClick={() => fileRef.current?.click()}>{currentLogo ? 'Changer' : 'Ajouter'}</button>
          </div>
          {logoError && <p className="field-error">{logoError}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/webp"
            hidden
            onChange={(event) => { void chooseLogo(event.target.files?.[0]); event.target.value = ''; }}
          />
          {field('Nom de l\'agence', 'agencyName', { autoComplete: 'organization' })}
          <div className="field-pair postal-pair">
            {field('Code postal', 'postalCode', { inputMode: 'numeric', autoComplete: 'postal-code' })}
            {field('Ville', 'city', { autoComplete: 'address-level2' })}
          </div>
          {field('Téléphone (facultatif)', 'phone', { inputMode: 'tel', autoComplete: 'tel' })}
          {field('E-mail de l\'agence (facultatif)', 'email', { inputMode: 'email', autoComplete: 'email' })}
          {field('Site internet (facultatif)', 'website', { inputMode: 'url', autoComplete: 'url' })}
          {field('Barème d\'honoraires, lien (facultatif)', 'feeSchedule', { inputMode: 'url' })}
          <p className="agency-caption">Obligatoire pour une agence : il s&apos;affiche sur chacune de vos annonces.</p>
          <label className="form-field">
            <span className="field-label">Présentation (facultative)</span>
            <textarea
              className="text-input agency-about-input"
              rows={5}
              maxLength={2000}
              placeholder="Votre agence, votre équipe, vos spécialités…"
              value={form.about}
              onChange={(event) => update('about', event.target.value)}
            />
          </label>
        </section>

        <p className="field-hint agency-app-hint">
          La raison sociale, le secteur couvert et les justificatifs (Kbis, carte professionnelle, attestation RCP) se renseignent dans l&apos;app iPhone.
        </p>
        {hasErrors && <p className="field-error" role="alert">Vérifiez les champs en rouge.</p>}
        {saveError && <p className="signin-error" role="alert">{saveError}</p>}
        <button type="submit" className="btn btn-primary agency-save" disabled={saving}>
          {saving ? <span className="spinner spinner-white" aria-label="Enregistrement" /> : saveLabel}
        </button>
      </form>

      <AlertDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        title="Quitter sans enregistrer ?"
        message="Vos modifications ne sont pas encore enregistrées."
        actions={[
          { label: 'Enregistrer les modifications', onClick: () => { setLeaving(false); void save(); }, tone: 'primary' },
          { label: 'Quitter sans enregistrer', href: backPath },
          { label: 'Continuer', onClick: () => setLeaving(false), tone: 'quiet' },
        ]}
      />
    </div>
  );
}

type InputOptions = { inputMode?: 'numeric' | 'tel' | 'email' | 'url' | 'text'; autoComplete?: string; maxLength?: number };

function TextInput({ label, value, error, onChange, inputMode, autoComplete, maxLength }: InputOptions & {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="form-field">
      <span className="field-label">{label}</span>
      <input
        className="text-input"
        value={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
