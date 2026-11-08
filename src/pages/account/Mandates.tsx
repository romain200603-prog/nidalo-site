import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Icon } from '../../components/Icon';
import { AlertDialog } from '../listing/Dialogs';
import {
  deleteMandate, documentName, EXCLUSIVITY_LABELS, isOwnMandate, KIND_LABELS, loadMandates, MANDATE_FILTERS, MANDATE_NAME_MAX, MANDATE_NOTE_MAX,
  MANDATE_NUMBER_MAX, MANDATE_TITLE_MAX, mandateAmount, mandateErrors, mandateFileIssue, mandateFileUrl, mandateFormFor, mandatesIn,
  mandatesStore, mandateStage, mandateState, saveMandate, setMandateEnded,
  type MandateDocumentChange, type MandateExclusivity, type MandateForm, type MandateKind, type MandateRow,
  type MandateState,
} from '../../lib/account/mandates';
import { agencyListingsStore, loadAgencyListings, loadMyListings, myListingsStore } from '../../lib/account/myListings';
import { dayLabel, groupedPrice } from '../../lib/account/sales';
import { currentUserId, useStore } from '../../lib/account/session';
import { authorOf, canEditOf, savedTeamView, saveTeamView, teamIds, useTeamScope, type TeamScope, type TeamView } from '../../lib/account/team';
import { formatPrice } from '../../lib/format';
import { parisDay } from '../../lib/listing/views';
import { photoUrl, sortedPhotos, type ListingRow } from '../../lib/listings';
import { accountPath, listingPath, MANDATES_PATH, mandatePath, NEW_MANDATE_PATH } from '../../lib/paths';
import { AuthorLine, EmptyState, ScreenHeader, Spinner, TeamViewSwitch, Toast } from './parts';

// « Mes mandats » de l'espace professionnel : le registre des mandats (en cours, terminés), la fiche d'un mandat
// (ses informations, le PDF signé, la note) et son formulaire. Mêmes styles que Mes ventes (classes sale-*). Avec une
// équipe : « Les miens » ou « L'agence » (le registre de toute l'agence ; un agent ne modifie que les siens).

const SAVED_TOASTS: Record<string, string> = {
  ajoute: 'Mandat ajouté',
  modifie: 'Modifications enregistrées',
  supprime: 'Mandat supprimé',
  termine: 'Mandat terminé',
  repris: 'Mandat repris',
};

/** Message bref après un enregistrement (`ok=` dans l'adresse), retiré de l'adresse aussitôt lu. */
function useSavedToast(): string | null {
  const [toast, setToast] = useState<string | null>(() => SAVED_TOASTS[new URLSearchParams(window.location.search).get('ok') ?? ''] ?? null);
  useEffect(() => {
    if (!toast) return undefined;
    const params = new URLSearchParams(window.location.search);
    params.delete('ok');
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return toast;
}

const goTo = (id: string, ok: string) => window.location.assign(accountPath('mandats', { mandat: id.toLowerCase(), ok }));

export function Mandates({ mandateId, screen }: { mandateId: string | null; screen: string | null }) {
  const state = useStore(mandatesStore);
  const scope = useTeamScope();
  const mine = useStore(myListingsStore);
  const agency = useStore(agencyListingsStore);
  // Avec une équipe, l'annonce liée peut être celle de n'importe qui dans l'agence (les miennes en attendant).
  const listings = scope && agency.status === 'ready' ? agency : mine;
  const ids = scope ? teamIds(scope).join(',') : '';

  useEffect(() => {
    void loadMandates();
    void loadMyListings();
  }, []);

  useEffect(() => {
    if (ids) void loadAgencyListings(ids.split(','));
  }, [ids]);

  if (state.status === 'error') {
    return (
      <div className="space">
        <ScreenHeader title="Mes mandats" />
        <p className="signin-error" role="alert">{state.message}</p>
        <button type="button" className="btn btn-light" onClick={() => void loadMandates()}>Réessayer</button>
      </div>
    );
  }
  if (state.status !== 'ready') return <Spinner />;
  const myListings = listings.status === 'ready' ? listings.items : [];
  if (screen === 'ajouter') return <MandateEditor row={null} listings={myListings} scope={scope} />;
  if (!mandateId) return <MandateList rows={state.rows} listings={myListings} scope={scope} />;
  const row = state.rows.find((item) => item.id.toLowerCase() === mandateId.toLowerCase()) ?? null;
  if (!row) {
    return (
      <div className="space">
        <ScreenHeader title="Mandat" back={MANDATES_PATH} />
        <EmptyState icon="scrollText" title="Mandat introuvable" text="Ce mandat n'est plus dans votre registre." action={<a className="btn btn-light" href={MANDATES_PATH}>Mes mandats</a>} />
      </div>
    );
  }
  if (screen === 'modifier' && canEditOf(scope, row.owner_id, currentUserId())) return <MandateEditor row={row} listings={myListings} scope={scope} />;
  return <MandateDetail row={row} listing={listingOf(row, myListings)} scope={scope} />;
}

const listingOf = (row: MandateRow, listings: ListingRow[]): ListingRow | null => (
  row.listing_id ? listings.find((item) => item.id.toLowerCase() === row.listing_id!.toLowerCase()) ?? null : null
);

/** Photo de l'annonce liée, sinon un pictogramme. */
function MandateThumb({ listing, size }: { listing: ListingRow | null; size: 'small' | 'large' }) {
  const photo = listing ? sortedPhotos(listing)[0] : undefined;
  return (
    <span className={`sale-thumb is-${size}`} aria-hidden="true">
      {photo ? <img src={photoUrl(photo.storage_path)} alt="" loading="lazy" /> : <Icon name="scrollText" />}
    </span>
  );
}

const mandateLine = (row: MandateRow): string => `N° ${row.number} · ${KIND_LABELS[row.kind]} · ${EXCLUSIVITY_LABELS[row.exclusivity]}`;

// MARK: - Liste

const NONE: Record<MandateState, string> = {
  active: 'Aucun mandat en cours.',
  ended: 'Aucun mandat terminé.',
};

function MandateList({ rows: all, listings, scope }: { rows: MandateRow[]; listings: ListingRow[]; scope: TeamScope | null }) {
  const toast = useSavedToast();
  const [filter, setFilter] = useState<MandateState>('active');
  const [view, setView] = useState<TeamView>(() => savedTeamView('mandats'));
  const me = currentUserId();
  const showsAgency = scope !== null && view === 'agency';
  const rows = showsAgency ? all : all.filter((row) => isOwnMandate(row, me));
  const today = parisDay(new Date());
  const shown = mandatesIn(rows, filter, today);

  function chooseView(next: TeamView) {
    setView(next);
    saveTeamView('mandats', next);
  }

  return (
    <div className="space sales">
      <Toast text={toast} />
      <ScreenHeader title="Mes mandats" action={<a className="save-capsule" href={NEW_MANDATE_PATH}>Ajouter</a>} />
      {scope && <TeamViewSwitch value={view} onChange={chooseView} mine="Les miens" />}
      {rows.length === 0 ? (
        <EmptyState
          icon="scrollText"
          title="Aucun mandat"
          text={showsAgency
            ? 'Le registre de l\'agence réunit les mandats de toute l\'équipe, avec chaque mandat signé en PDF.'
            : 'Tenez ici votre registre des mandats de vente et de location, avec chaque mandat signé en PDF.'}
          action={<a className="btn btn-primary" href={NEW_MANDATE_PATH}>Ajouter un mandat</a>}
        />
      ) : (
        <>
          <div className="sales-filters" role="group" aria-label="Filtrer les mandats">
            {MANDATE_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`select-chip${filter === item.value ? ' is-selected' : ''}`}
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="sales-none">{NONE[filter]}</p>
          ) : (
            <ul className="sales-list space-card">
              {shown.map((row) => (
                <li key={row.id}>
                  <a className="sale-row" href={mandatePath(row.id)}>
                    <MandateThumb listing={listingOf(row, listings)} size="small" />
                    <span className="sale-row-text">
                      <span className="sale-row-title">{row.title}</span>
                      <span className="sale-row-line">{mandateLine(row)}</span>
                      <span className={`sale-row-stage is-${mandateState(row, today)}`}>{mandateStage(row, today)}</span>
                      <AuthorLine author={authorOf(scope, row.owner_id)} />
                    </span>
                    <Icon name="chevronRight" className="icon row-chevron" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// MARK: - Fiche

function MandateDetail({ row, listing, scope }: { row: MandateRow; listing: ListingRow | null; scope: TeamScope | null }) {
  const toast = useSavedToast();
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const today = parisDay(new Date());
  const state = mandateState(row, today);
  const expired = state === 'ended' && !row.ended_on;
  const price = mandateAmount(row.price);
  const fees = mandateAmount(row.fees);
  const author = authorOf(scope, row.owner_id);
  const editable = canEditOf(scope, row.owner_id, currentUserId());

  async function changeEnded(ended: boolean) {
    setDialog(false);
    setBusy(true);
    setError(null);
    const failure = await setMandateEnded(row.id, ended);
    if (failure) {
      setBusy(false);
      setError(failure);
      return;
    }
    goTo(row.id, ended ? 'termine' : 'repris');
  }

  /** Ouvre le PDF dans un nouvel onglet (ouvert tout de suite, pour ne pas être bloqué), à son adresse signée. */
  async function openFile() {
    if (!row.document_path) return;
    setFileError(null);
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    const url = await mandateFileUrl(row.document_path);
    if (url && tab) {
      tab.location.href = url;
      return;
    }
    tab?.close();
    if (url) window.location.assign(url);
    else setFileError('Le PDF n\'a pas pu être ouvert. Réessayez dans un instant.');
  }

  return (
    <div className="space sales sale-page">
      <Toast text={toast} />
      <ScreenHeader title="Mandat" back={MANDATES_PATH} action={editable ? <a className="save-capsule" href={mandatePath(row.id, true)}>Modifier</a> : undefined} />
      <section className="sale-head space-card">
        <MandateThumb listing={listing} size="large" />
        <div className="sale-head-text">
          <h2 className="sale-title">{row.title}</h2>
          {row.city && <p className="sale-city">{row.city}</p>}
          <p className={`sale-state is-${state}`}>{state === 'active' ? 'En cours' : expired ? 'Échu' : 'Terminé'}</p>
          <AuthorLine author={author} />
        </div>
      </section>

      <section className="sale-card space-card">
        <h2 className="sale-card-title"><Icon name="scrollText" />Le mandat</h2>
        <dl className="sale-rows">
          <div><dt>N° au registre</dt><dd>{row.number}</dd></div>
          <div><dt>Type</dt><dd>{KIND_LABELS[row.kind]}</dd></div>
          <div><dt>Exclusivité</dt><dd>{EXCLUSIVITY_LABELS[row.exclusivity]}</dd></div>
          <div><dt>Mandant</dt><dd>{row.client_name}</dd></div>
          <div><dt>{row.kind === 'rental' ? 'Loyer mensuel' : 'Prix de vente'}</dt><dd>{price ? formatPrice(price) : 'Non indiqué'}</dd></div>
          <div><dt>Honoraires</dt><dd>{fees ? formatPrice(fees) : 'Non indiqués'}</dd></div>
          <div><dt>Signé le</dt><dd>{dayLabel(row.signed_on) ?? row.signed_on}</dd></div>
          <div><dt>Fin du mandat</dt><dd>{dayLabel(row.ends_on) ?? 'Sans date de fin'}</dd></div>
          {row.ended_on && <div><dt>Terminé le</dt><dd>{dayLabel(row.ended_on) ?? row.ended_on}</dd></div>}
        </dl>
        {row.listing_id && (
          <div className="sale-links">
            <a className="btn btn-light" href={listingPath(row.listing_id)}><Icon name="house" />Voir l&apos;annonce</a>
          </div>
        )}
      </section>

      <section className="sale-card space-card">
        <h2 className="sale-card-title"><Icon name="fileText" />Mandat signé</h2>
        {row.document_path ? (
          <div className="mandate-file">
            <span className="mandate-file-icon" aria-hidden="true"><Icon name="fileText" /></span>
            <span className="mandate-file-text"><span className="mandate-file-name">{row.document_name ?? 'Mandat.pdf'}</span></span>
            <button type="button" className="small-button mandate-file-open" onClick={() => void openFile()}>Ouvrir</button>
          </div>
        ) : (
          <p className="sale-caption">{editable ? 'Aucun PDF pour ce mandat. Ajoutez-le avec « Modifier ».' : 'Aucun PDF pour ce mandat.'}</p>
        )}
        {fileError && <p className="signin-error" role="alert">{fileError}</p>}
      </section>

      {row.note?.trim() && (
        <section className="sale-card space-card">
          <h2 className="sale-card-title"><Icon name="squarePen" />{scope ? 'Note' : 'Note privée'}</h2>
          <p className="sale-note">{row.note.trim()}</p>
          <p className="sale-caption">{scope ? 'L\'équipe de l\'agence voit cette note.' : 'Seul vous voyez cette note.'}</p>
        </section>
      )}

      {expired && editable && <p className="sale-caption mandate-expired">Ce mandat est échu. Pour le prolonger, changez sa date de fin avec « Modifier ».</p>}
      {!editable && <p className="sale-caption mandate-readonly">Seuls son auteur, le gérant et les responsables de l&apos;agence peuvent modifier ce mandat.</p>}
      {error && <p className="signin-error" role="alert">{error}</p>}
      {editable && row.ended_on && (
        <button type="button" className="btn btn-light sale-resume" disabled={busy} onClick={() => void changeEnded(false)}>
          {busy ? <span className="spinner" aria-label="Enregistrement" /> : 'Reprendre le mandat'}
        </button>
      )}
      {editable && state === 'active' && (
        <button type="button" className="link-button sale-cancel mandate-end" disabled={busy} onClick={() => setDialog(true)}>Terminer le mandat</button>
      )}
      <AlertDialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Terminer ce mandat ?"
        message="Il passera dans « Terminés », daté d'aujourd'hui. Vous pourrez le reprendre."
        actions={[
          { label: 'Terminer le mandat', onClick: () => void changeEnded(true), tone: 'primary' },
          { label: 'Garder le mandat', onClick: () => setDialog(false), tone: 'quiet' },
        ]}
      />
    </div>
  );
}

// MARK: - Formulaire

function MandateEditor({ row, listings, scope }: { row: MandateRow | null; listings: ListingRow[]; scope: TeamScope | null }) {
  const initial = useMemo(() => mandateFormFor(row), [row]);
  const [form, setForm] = useState<MandateForm>(initial);
  const [pdf, setPdf] = useState<MandateDocumentChange>('keep');
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'leave' | 'delete' | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const kindId = useId();
  const exclusivityId = useId();
  const today = parisDay(new Date());

  const errors = submitted ? mandateErrors(form, today) : {};
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || pdf !== 'keep';
  const backPath = row ? mandatePath(row.id) : MANDATES_PATH;
  const fileName = typeof pdf === 'object' ? documentName(pdf.file.name) : pdf === 'remove' ? null : row?.document_name ?? null;
  const listingKnown = !form.listingId || listings.some((item) => item.id.toLowerCase() === form.listingId);

  function update<K extends keyof MandateForm>(key: K, value: MandateForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /** Annonce liée : reprend son titre et sa ville si le bien n'est pas encore écrit. */
  function chooseListing(id: string) {
    const listing = listings.find((item) => item.id.toLowerCase() === id);
    setForm((current) => ({
      ...current,
      listingId: id,
      title: current.title.trim() || !listing ? current.title : (listing.title ?? '').slice(0, MANDATE_TITLE_MAX),
      city: current.city.trim() || !listing ? current.city : (listing.city ?? '').slice(0, MANDATE_NAME_MAX),
    }));
  }

  function chooseFile(file: File | undefined) {
    if (!file) return;
    const issue = mandateFileIssue(file);
    setFileError(issue);
    if (!issue) setPdf({ file });
  }

  async function save() {
    setSubmitted(true);
    setSaveError(null);
    if (Object.keys(mandateErrors(form, today)).length) {
      window.setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
      return;
    }
    setSaving(true);
    const result = await saveMandate(row, form, pdf);
    if ('error' in result) {
      setSaving(false);
      setSaveError(result.error);
      return;
    }
    goTo(result.id, row ? 'modifie' : 'ajoute');
  }

  async function remove() {
    if (!row) return;
    setDialog(null);
    setSaving(true);
    setSaveError(null);
    const failure = await deleteMandate(row);
    if (failure) {
      setSaving(false);
      setSaveError(failure);
      return;
    }
    window.location.assign(accountPath('mandats', { ok: 'supprime' }));
  }

  const choice = <T extends string>(id: string, label: string, value: T, options: Record<T, string>, onChoose: (value: T) => void) => (
    <div className="form-field">
      <span className="field-label" id={id}>{label}</span>
      <div className="mandate-choices" role="radiogroup" aria-labelledby={id}>
        {(Object.keys(options) as T[]).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            className={`select-chip${value === option ? ' is-selected' : ''}`}
            onClick={() => onChoose(option)}
          >
            {options[option]}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space sales sale-form-screen">
      <ScreenHeader title={row ? 'Modifier le mandat' : 'Nouveau mandat'} onBack={() => (dirty ? setDialog('leave') : window.location.assign(backPath))} />
      <form ref={formRef} className="info-form" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <section className="info-card space-card">
          <h2 className="field-group-title">Le mandat</h2>
          {choice<MandateKind>(kindId, 'Type de mandat', form.kind, KIND_LABELS, (value) => update('kind', value))}
          {choice<MandateExclusivity>(exclusivityId, 'Exclusivité', form.exclusivity, EXCLUSIVITY_LABELS, (value) => update('exclusivity', value))}
          <TextInput label="N° au registre des mandats" value={form.number} error={errors.number} onChange={(value) => update('number', value)} maxLength={MANDATE_NUMBER_MAX} placeholder="Ex. 2026-014" />
          <DateInput label="Signé le" value={form.signedOn} error={errors.signedOn} max={today} onChange={(value) => update('signedOn', value)} />
          <DateInput label="Fin du mandat (facultative)" value={form.endsOn} error={errors.endsOn} hint="Le mandat passe alors dans « Terminés »." onChange={(value) => update('endsOn', value)} />
        </section>
        <section className="info-card space-card">
          <h2 className="field-group-title">Le bien et le mandant</h2>
          <label className="form-field">
            <span className="field-label">Annonce liée (facultative)</span>
            <span className="mandate-select">
              <select className="text-input" value={form.listingId} onChange={(event) => chooseListing(event.target.value)}>
                <option value="">Aucune</option>
                {listings.map((item) => (
                  <option key={item.id} value={item.id.toLowerCase()}>
                    {(item.title?.trim() || 'Annonce sans titre') + (item.status === 'draft' ? ' (brouillon)' : '')
                      + (authorOf(scope, item.owner_id) ? ` · ${authorOf(scope, item.owner_id)}` : '')}
                  </option>
                ))}
                {!listingKnown && <option value={form.listingId}>Annonce liée</option>}
              </select>
              <Icon name="chevronDown" className="icon mandate-select-chevron" />
            </span>
          </label>
          <TextInput label="Bien" value={form.title} error={errors.title} onChange={(value) => update('title', value)} maxLength={MANDATE_TITLE_MAX} placeholder="Appartement 3 pièces, rue…" />
          <TextInput label="Ville (facultative)" value={form.city} error={errors.city} onChange={(value) => update('city', value)} maxLength={MANDATE_NAME_MAX} autoComplete="address-level2" />
          <TextInput label="Mandant (propriétaire)" value={form.clientName} error={errors.clientName} onChange={(value) => update('clientName', value)} maxLength={MANDATE_NAME_MAX} />
          <AmountInput label={form.kind === 'rental' ? 'Loyer mensuel (facultatif)' : 'Prix de vente (facultatif)'} value={form.price} error={errors.price} onChange={(value) => update('price', value)} />
          <AmountInput label="Honoraires (facultatif)" value={form.fees} error={errors.fees} onChange={(value) => update('fees', value)} />
        </section>
        <section className="info-card space-card">
          <h2 className="field-group-title">Mandat signé (PDF)</h2>
          <div className="mandate-file">
            <span className="mandate-file-icon" aria-hidden="true"><Icon name="fileText" /></span>
            <span className="mandate-file-text">
              <span className="mandate-file-name">{fileName ?? 'Aucun PDF'}</span>
              <span className="field-hint">{typeof pdf === 'object' ? 'Envoyé à l’enregistrement' : 'Facultatif · PDF, 10 Mo au plus'}</span>
            </span>
            <button type="button" className="small-button" onClick={() => fileRef.current?.click()}>{fileName ? 'Changer' : 'Ajouter'}</button>
          </div>
          {fileError && <p className="field-error">{fileError}</p>}
          {fileName && (
            <button type="button" className="link-button mandate-file-remove" onClick={() => { setFileError(null); setPdf(row?.document_path ? 'remove' : 'keep'); }}>
              Retirer le PDF
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            aria-label="PDF du mandat signé"
            onChange={(event: ChangeEvent<HTMLInputElement>) => { chooseFile(event.target.files?.[0]); event.target.value = ''; }}
          />
        </section>
        <section className="info-card space-card">
          <h2 className="field-group-title">Note</h2>
          <label className="form-field">
            <span className="field-label">Note (facultative)</span>
            <textarea
              className="text-input sale-note-input"
              rows={4}
              maxLength={MANDATE_NOTE_MAX}
              placeholder="Visites prévues, pièces à fournir, points à suivre…"
              value={form.note}
              aria-invalid={errors.note ? true : undefined}
              onChange={(event) => update('note', event.target.value)}
            />
            {errors.note && <span className="field-error">{errors.note}</span>}
          </label>
          <p className="field-hint">{scope ? 'L\'équipe de l\'agence voit ce mandat, son PDF et sa note.' : 'Seul vous voyez ce mandat, son PDF et sa note.'}</p>
        </section>
        {hasErrors && <p className="field-error" role="alert">Vérifiez les champs en rouge.</p>}
        {saveError && <p className="signin-error" role="alert">{saveError}</p>}
        <button type="submit" className="btn btn-primary sale-save" disabled={saving}>
          {saving ? <span className="spinner spinner-white" aria-label="Enregistrement" /> : row ? 'Enregistrer les modifications' : 'Ajouter le mandat'}
        </button>
        {row && (
          <button type="button" className="link-button is-danger sale-delete" disabled={saving} onClick={() => setDialog('delete')}>
            Supprimer ce mandat
          </button>
        )}
      </form>

      <AlertDialog
        open={dialog === 'leave'}
        onClose={() => setDialog((current) => (current === 'leave' ? null : current))}
        title="Quitter sans enregistrer ?"
        message="Vos modifications ne sont pas encore enregistrées."
        actions={[
          { label: 'Enregistrer', onClick: () => { setDialog(null); void save(); }, tone: 'primary' },
          { label: 'Quitter sans enregistrer', href: backPath },
          { label: 'Continuer', onClick: () => setDialog(null), tone: 'quiet' },
        ]}
      />
      <AlertDialog
        open={dialog === 'delete'}
        onClose={() => setDialog((current) => (current === 'delete' ? null : current))}
        title="Supprimer ce mandat du registre ?"
        message={authorOf(scope, row?.owner_id)
          ? 'Ses informations, son PDF et sa note seront effacés pour toute l\'agence. L\'annonce ne change pas.'
          : 'Ses informations, son PDF et votre note seront effacés. L\'annonce ne change pas.'}
        actions={[
          { label: 'Supprimer', onClick: () => void remove(), tone: 'primary' },
          { label: 'Annuler', onClick: () => setDialog(null), tone: 'quiet' },
        ]}
      />
    </div>
  );
}

function TextInput({ label, value, error, onChange, maxLength, autoComplete, placeholder }: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  maxLength?: number;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="form-field">
      <span className="field-label">{label}</span>
      <input
        className="text-input"
        value={value}
        maxLength={maxLength}
        autoComplete={autoComplete ?? 'off'}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

/** Montant en euros, milliers espacés pendant la saisie, curseur gardé après le même chiffre (comme Mes ventes). */
function AmountInput({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (value: string) => void }) {
  const onAmount = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const caret = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, caret).replace(/\D/g, '').length;
    const digits = input.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 10);
    const text = digits ? groupedPrice(Number(digits)) : '';
    onChange(text);
    window.requestAnimationFrame(() => {
      let position = 0;
      for (let seen = 0; position < text.length && seen < before; position += 1) {
        if (/\d/.test(text[position])) seen += 1;
      }
      if (document.activeElement === input) input.setSelectionRange(position, position);
    });
  };
  return (
    <label className="form-field">
      <span className="field-label">{label}</span>
      <span className="sale-price-input">
        <input
          className="text-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={onAmount}
        />
        <span aria-hidden="true">€</span>
      </span>
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

function DateInput({ label, value, error, hint, max, onChange }: {
  label: string;
  value: string;
  error?: string;
  hint?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="form-field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="date-row">
        <input
          id={id}
          type="date"
          className="text-input"
          value={value}
          max={max}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {value && <button type="button" className="link-button" onClick={() => onChange('')} aria-label={`Effacer : ${label}`}>Effacer</button>}
      </div>
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
