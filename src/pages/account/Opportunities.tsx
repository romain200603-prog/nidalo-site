import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { AlertDialog } from '../listing/Dialogs';
import { loadMyListings, myListingsStore } from '../../lib/account/myListings';
import {
  addedDay, BUDGET_LABELS, budgetText, deleteOpportunity, followUpText, isOpen, KIND_LABELS, loadOpportunities, OPPORTUNITY_FILTERS,
  OPPORTUNITY_NAME_MAX, OPPORTUNITY_NOTE_MAX, OPPORTUNITY_PROJECT_MAX, opportunitiesIn, opportunitiesStore, opportunityErrors,
  opportunityFormFor, opportunityLine, opportunityStatus, saveOpportunity, setOpportunityStage, STAGE_LABELS,
  type OpportunityFilter, type OpportunityForm, type OpportunityKind, type OpportunityRow, type OpportunityStage,
} from '../../lib/account/opportunities';
import { phonePairs } from '../../lib/account/profile';
import { dayLabel, groupedPrice } from '../../lib/account/sales';
import { useStore } from '../../lib/account/session';
import { parisDay } from '../../lib/listing/views';
import { photoUrl, sortedPhotos, type ListingRow } from '../../lib/listings';
import { telHref } from '../../lib/messages/format';
import { accountPath, listingPath, NEW_OPPORTUNITY_PATH, OPPORTUNITIES_PATH, opportunityPath } from '../../lib/paths';
import { EmptyState, ScreenHeader, Spinner, Toast } from './parts';

// « Mes opportunités » de l'espace professionnel : les pistes à suivre (acheteurs, vendeurs, locataires), la fiche
// d'une opportunité (son étape, changée d'un geste, la personne, le projet, la relance, la note) et son formulaire.
// Mêmes styles que Mes ventes et Mes mandats (classes sale-* et mandate-choices).

const SAVED_TOASTS: Record<string, string> = {
  ajoute: 'Opportunité ajoutée',
  modifie: 'Modifications enregistrées',
  supprime: 'Opportunité supprimée',
  etape: 'Étape enregistrée',
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

const goTo = (id: string, ok: string) => window.location.assign(accountPath('opportunites', { opportunite: id.toLowerCase(), ok }));

const STAGES: OpportunityStage[] = ['new', 'active', 'won', 'lost'];

export function Opportunities({ opportunityId, screen }: { opportunityId: string | null; screen: string | null }) {
  const state = useStore(opportunitiesStore);
  const listings = useStore(myListingsStore);

  useEffect(() => {
    void loadOpportunities();
    void loadMyListings();
  }, []);

  if (state.status === 'error') {
    return (
      <div className="space">
        <ScreenHeader title="Mes opportunités" />
        <p className="signin-error" role="alert">{state.message}</p>
        <button type="button" className="btn btn-light" onClick={() => void loadOpportunities()}>Réessayer</button>
      </div>
    );
  }
  if (state.status !== 'ready') return <Spinner />;
  const myListings = listings.status === 'ready' ? listings.items : [];
  if (screen === 'ajouter') return <OpportunityEditor row={null} listings={myListings} />;
  if (!opportunityId) return <OpportunityList rows={state.rows} listings={myListings} />;
  const row = state.rows.find((item) => item.id.toLowerCase() === opportunityId.toLowerCase()) ?? null;
  if (!row) {
    return (
      <div className="space">
        <ScreenHeader title="Opportunité" back={OPPORTUNITIES_PATH} />
        <EmptyState
          icon="sparkles"
          title="Opportunité introuvable"
          text="Cette opportunité n'est plus dans votre liste."
          action={<a className="btn btn-light" href={OPPORTUNITIES_PATH}>Mes opportunités</a>}
        />
      </div>
    );
  }
  if (screen === 'modifier') return <OpportunityEditor row={row} listings={myListings} />;
  return <OpportunityDetail row={row} listing={listingOf(row, myListings)} />;
}

const listingOf = (row: OpportunityRow, listings: ListingRow[]): ListingRow | null => (
  row.listing_id ? listings.find((item) => item.id.toLowerCase() === row.listing_id!.toLowerCase()) ?? null : null
);

/** Pictogramme de la personne : un acheteur cherche, un vendeur met en vente, un locataire attend ses clés. */
const KIND_ICONS: Record<OpportunityKind, IconName> = { buyer: 'search', seller: 'tag', tenant: 'key' };

/** Photo de l'annonce liée, sinon le pictogramme de la personne. */
function OpportunityThumb({ listing, kind, size }: { listing: ListingRow | null; kind: OpportunityKind; size: 'small' | 'large' }) {
  const photo = listing ? sortedPhotos(listing)[0] : undefined;
  return (
    <span className={`sale-thumb is-${size}`} aria-hidden="true">
      {photo ? <img src={photoUrl(photo.storage_path)} alt="" loading="lazy" /> : <Icon name={KIND_ICONS[kind]} />}
    </span>
  );
}

// MARK: - Liste

const NONE: Record<OpportunityFilter, string> = {
  open: 'Aucune opportunité à suivre.',
  won: 'Aucune opportunité gagnée.',
  lost: 'Aucune opportunité perdue.',
};

function OpportunityList({ rows, listings }: { rows: OpportunityRow[]; listings: ListingRow[] }) {
  const toast = useSavedToast();
  const [filter, setFilter] = useState<OpportunityFilter>('open');
  const today = parisDay(new Date());
  const shown = opportunitiesIn(rows, filter);

  return (
    <div className="space sales">
      <Toast text={toast} />
      <ScreenHeader title="Mes opportunités" action={<a className="save-capsule" href={NEW_OPPORTUNITY_PATH}>Ajouter</a>} />
      {rows.length === 0 ? (
        <EmptyState
          icon="sparkles"
          title="Aucune opportunité"
          text="Notez ici les acheteurs, vendeurs et locataires à suivre, avec leur projet et le jour où les relancer."
          action={<a className="btn btn-primary" href={NEW_OPPORTUNITY_PATH}>Ajouter une opportunité</a>}
        />
      ) : (
        <>
          <div className="sales-filters" role="group" aria-label="Filtrer les opportunités">
            {OPPORTUNITY_FILTERS.map((item) => (
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
              {shown.map((row) => {
                const status = opportunityStatus(row, today);
                const tone = !isOpen(row.stage) ? 'is-ended' : status.due ? 'is-active' : 'is-open';
                return (
                  <li key={row.id}>
                    <a className="sale-row" href={opportunityPath(row.id)}>
                      <OpportunityThumb listing={listingOf(row, listings)} kind={row.kind} size="small" />
                      <span className="sale-row-text">
                        <span className="sale-row-title">{row.name}</span>
                        <span className="sale-row-line">{opportunityLine(row)}</span>
                        <span className={`sale-row-stage ${tone}`}>{status.text}</span>
                      </span>
                      <Icon name="chevronRight" className="icon row-chevron" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// MARK: - Fiche

const STATE_CLASSES: Record<OpportunityStage, string> = { new: 'is-active', active: 'is-active', won: 'is-signed', lost: 'is-lost' };

function OpportunityDetail({ row, listing }: { row: OpportunityRow; listing: ListingRow | null }) {
  const toast = useSavedToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stageId = useId();
  const today = parisDay(new Date());
  const budget = budgetText(row);
  const added = addedDay(row);

  async function changeStage(stage: OpportunityStage) {
    if (stage === row.stage || busy) return;
    setBusy(true);
    setError(null);
    const failure = await setOpportunityStage(row, stage);
    if (failure) {
      setBusy(false);
      setError(failure);
      return;
    }
    goTo(row.id, 'etape');
  }

  return (
    <div className="space sales sale-page">
      <Toast text={toast} />
      <ScreenHeader title="Opportunité" back={OPPORTUNITIES_PATH} action={<a className="save-capsule" href={opportunityPath(row.id, true)}>Modifier</a>} />
      <section className="sale-head space-card">
        <OpportunityThumb listing={listing} kind={row.kind} size="large" />
        <div className="sale-head-text">
          <h2 className="sale-title">{row.name}</h2>
          <p className="sale-city">{[KIND_LABELS[row.kind], budget].filter(Boolean).join(' · ')}</p>
          <p className={`sale-state ${STATE_CLASSES[row.stage]}`}>{STAGE_LABELS[row.stage]}</p>
        </div>
      </section>
      {(row.phone || row.email) && (
        <div className="contact-actions opportunity-actions">
          {row.phone && <a className="btn btn-light" href={telHref(row.phone)}><Icon name="phone" />Appeler</a>}
          {row.email && <a className="btn btn-light" href={`mailto:${row.email}`}><Icon name="mail" />E-mail</a>}
        </div>
      )}

      <section className="sale-card space-card">
        <h2 className="sale-card-title" id={stageId}><Icon name="flag" />Étape</h2>
        <div className="mandate-choices opportunity-stages" role="radiogroup" aria-labelledby={stageId}>
          {STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              role="radio"
              aria-checked={row.stage === stage}
              className={`select-chip${row.stage === stage ? ' is-selected' : ''}`}
              disabled={busy}
              onClick={() => void changeStage(stage)}
            >
              {STAGE_LABELS[stage]}
            </button>
          ))}
        </div>
        {error && <p className="signin-error" role="alert">{error}</p>}
      </section>

      <section className="sale-card space-card">
        <h2 className="sale-card-title"><Icon name="target" />L&apos;opportunité</h2>
        <dl className="sale-rows">
          <div><dt>Type</dt><dd>{KIND_LABELS[row.kind]}</dd></div>
          <div><dt>{BUDGET_LABELS[row.kind]}</dt><dd>{budget ?? 'Non indiqué'}</dd></div>
          <div><dt>Projet</dt><dd>{row.project?.trim() || 'Non indiqué'}</dd></div>
          {row.phone && <div><dt>Téléphone</dt><dd><a href={telHref(row.phone)}>{phonePairs(row.phone)}</a></dd></div>}
          {row.email && <div><dt>E-mail</dt><dd><a href={`mailto:${row.email}`}>{row.email}</a></dd></div>}
          {isOpen(row.stage) && <div><dt>À relancer</dt><dd>{followUpText(row.follow_up_on, today)}</dd></div>}
          {added && <div><dt>Ajoutée le</dt><dd>{added}</dd></div>}
          {!isOpen(row.stage) && (
            <div><dt>{row.stage === 'won' ? 'Gagnée le' : 'Perdue le'}</dt><dd>{dayLabel(row.closed_on) ?? 'Non indiqué'}</dd></div>
          )}
        </dl>
        {row.listing_id && (
          <div className="sale-links">
            <a className="btn btn-light" href={listingPath(row.listing_id)}><Icon name="house" />Voir l&apos;annonce</a>
          </div>
        )}
      </section>

      {row.note?.trim() && (
        <section className="sale-card space-card">
          <h2 className="sale-card-title"><Icon name="squarePen" />Note privée</h2>
          <p className="sale-note">{row.note.trim()}</p>
          <p className="sale-caption">Seul vous voyez cette note.</p>
        </section>
      )}
    </div>
  );
}

// MARK: - Formulaire

const BUDGET_FIELDS: Record<OpportunityKind, string> = {
  buyer: 'Budget (facultatif)',
  seller: 'Prix souhaité (facultatif)',
  tenant: 'Loyer maximum par mois (facultatif)',
};

const PROJECT_PLACEHOLDERS: Record<OpportunityKind, string> = {
  buyer: 'Ex. T3 avec balcon, Lyon 6e',
  seller: 'Ex. maison 5 pièces à estimer',
  tenant: 'Ex. studio meublé près du métro',
};

function OpportunityEditor({ row, listings }: { row: OpportunityRow | null; listings: ListingRow[] }) {
  const initial = useMemo(() => opportunityFormFor(row), [row]);
  const [form, setForm] = useState<OpportunityForm>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'leave' | 'delete' | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const kindId = useId();
  const stageId = useId();

  const errors = submitted ? opportunityErrors(form) : {};
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const backPath = row ? opportunityPath(row.id) : OPPORTUNITIES_PATH;
  const listingKnown = !form.listingId || listings.some((item) => item.id.toLowerCase() === form.listingId);

  function update<K extends keyof OpportunityForm>(key: K, value: OpportunityForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSubmitted(true);
    setSaveError(null);
    if (Object.keys(opportunityErrors(form)).length) {
      window.setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
      return;
    }
    setSaving(true);
    const result = await saveOpportunity(row, form);
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
    const failure = await deleteOpportunity(row.id);
    if (failure) {
      setSaving(false);
      setSaveError(failure);
      return;
    }
    window.location.assign(accountPath('opportunites', { ok: 'supprime' }));
  }

  const choice = <T extends string>(id: string, label: string, value: T, options: [T, string][], onChoose: (value: T) => void, grid = false) => (
    <div className="form-field">
      <span className="field-label" id={id}>{label}</span>
      <div className={grid ? 'mandate-choices opportunity-stages' : 'mandate-choices'} role="radiogroup" aria-labelledby={id}>
        {options.map(([option, text]) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            className={`select-chip${value === option ? ' is-selected' : ''}`}
            onClick={() => onChoose(option)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space sales sale-form-screen">
      <ScreenHeader title={row ? 'Modifier l\'opportunité' : 'Nouvelle opportunité'} onBack={() => (dirty ? setDialog('leave') : window.location.assign(backPath))} />
      <form ref={formRef} className="info-form" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <section className="info-card space-card">
          <h2 className="field-group-title">La personne</h2>
          {choice<OpportunityKind>(kindId, 'Type', form.kind, Object.entries(KIND_LABELS) as [OpportunityKind, string][], (value) => update('kind', value))}
          <TextInput label="Nom" value={form.name} error={errors.name} onChange={(value) => update('name', value)} maxLength={OPPORTUNITY_NAME_MAX} />
          <TextInput label="Téléphone (facultatif)" value={form.phone} error={errors.phone} onChange={(value) => update('phone', value)} inputMode="tel" maxLength={24} />
          <TextInput label="E-mail (facultatif)" value={form.email} error={errors.email} onChange={(value) => update('email', value)} inputMode="email" maxLength={254} />
        </section>
        <section className="info-card space-card">
          <h2 className="field-group-title">Le projet</h2>
          {choice<OpportunityStage>(stageId, 'Étape', form.stage, STAGES.map((stage) => [stage, STAGE_LABELS[stage]]), (value) => update('stage', value), true)}
          <AmountInput label={BUDGET_FIELDS[form.kind]} value={form.budget} error={errors.budget} onChange={(value) => update('budget', value)} />
          <TextInput label="Projet (facultatif)" value={form.project} error={errors.project} onChange={(value) => update('project', value)} maxLength={OPPORTUNITY_PROJECT_MAX} placeholder={PROJECT_PLACEHOLDERS[form.kind]} />
          <label className="form-field">
            <span className="field-label">Annonce liée (facultative)</span>
            <span className="mandate-select">
              <select className="text-input" value={form.listingId} onChange={(event) => update('listingId', event.target.value)}>
                <option value="">Aucune</option>
                {listings.map((item) => (
                  <option key={item.id} value={item.id.toLowerCase()}>
                    {(item.title?.trim() || 'Annonce sans titre') + (item.status === 'draft' ? ' (brouillon)' : '')}
                  </option>
                ))}
                {!listingKnown && <option value={form.listingId}>Annonce liée</option>}
              </select>
              <Icon name="chevronDown" className="icon mandate-select-chevron" />
            </span>
          </label>
          <DateInput label="À relancer le (facultatif)" value={form.followUpOn} error={errors.followUpOn} hint="Les relances les plus proches sont en tête de la liste." onChange={(value) => update('followUpOn', value)} />
        </section>
        <section className="info-card space-card">
          <h2 className="field-group-title">Note</h2>
          <label className="form-field">
            <span className="field-label">Note (facultative)</span>
            <textarea
              className="text-input sale-note-input"
              rows={4}
              maxLength={OPPORTUNITY_NOTE_MAX}
              placeholder="Disponibilités, financement, critères…"
              value={form.note}
              aria-invalid={errors.note ? true : undefined}
              onChange={(event) => update('note', event.target.value)}
            />
            {errors.note && <span className="field-error">{errors.note}</span>}
          </label>
          <p className="field-hint">Seul vous voyez cette opportunité et sa note.</p>
        </section>
        {hasErrors && <p className="field-error" role="alert">Vérifiez les champs en rouge.</p>}
        {saveError && <p className="signin-error" role="alert">{saveError}</p>}
        <button type="submit" className="btn btn-primary sale-save" disabled={saving}>
          {saving ? <span className="spinner spinner-white" aria-label="Enregistrement" /> : row ? 'Enregistrer les modifications' : 'Ajouter l\'opportunité'}
        </button>
        {row && (
          <button type="button" className="link-button is-danger sale-delete" disabled={saving} onClick={() => setDialog('delete')}>
            Supprimer cette opportunité
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
        title="Supprimer cette opportunité ?"
        message="La personne, son projet et votre note seront effacés. L'annonce ne change pas."
        actions={[
          { label: 'Supprimer', onClick: () => void remove(), tone: 'primary' },
          { label: 'Annuler', onClick: () => setDialog(null), tone: 'quiet' },
        ]}
      />
    </div>
  );
}

function TextInput({ label, value, error, onChange, maxLength, inputMode, placeholder }: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  maxLength?: number;
  inputMode?: 'tel' | 'email';
  placeholder?: string;
}) {
  return (
    <label className="form-field">
      <span className="field-label">{label}</span>
      <input
        className="text-input"
        type={inputMode === 'email' ? 'email' : inputMode === 'tel' ? 'tel' : 'text'}
        value={value}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete="off"
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

function DateInput({ label, value, error, hint, onChange }: {
  label: string;
  value: string;
  error?: string;
  hint?: string;
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
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {value && <button type="button" className="link-button" onClick={() => onChange('')} aria-label={`Effacer : ${label}`}>Effacer</button>}
      </div>
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
