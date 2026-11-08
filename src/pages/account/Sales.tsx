import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Icon } from '../../components/Icon';
import { AlertDialog } from '../listing/Dialogs';
import { loadMyListings, myListingsStore } from '../../lib/account/myListings';
import {
  dayLabel, deleteSale, followOffer, groupedPrice, loadSales, SALE_FILTERS, SALE_FOLLOWED_MESSAGE, SALE_NAME_MAX, SALE_NOTE_MAX,
  SALE_TITLE_MAX, saleErrors, saleFormFor, salePrice, salesIn, salesStore, saleStage, saleState, saleSteps, saveSale, setSaleCancelled,
  type SaleField, type SaleForm, type SaleRow, type SaleState, type SaleSuggestion,
} from '../../lib/account/sales';
import { useStore } from '../../lib/account/session';
import { formatPrice } from '../../lib/format';
import { parisDay } from '../../lib/listing/views';
import { photoUrl, sortedPhotos, type ListingRow } from '../../lib/listings';
import { accountPath, conversationPath, listingPath, NEW_SALE_PATH, salePath, SALES_PATH } from '../../lib/paths';
import { EmptyState, ScreenHeader, Spinner, Toast } from './parts';

// « Mes ventes » de l'espace professionnel : les offres acceptées à suivre, la liste des ventes (en cours, signées,
// annulées), la fiche d'une vente (ses étapes jusqu'à l'acte) et son formulaire.

const SAVED_TOASTS: Record<string, string> = {
  ajoutee: 'Vente ajoutée',
  suivie: 'Vente suivie',
  modifiee: 'Modifications enregistrées',
  supprimee: 'Suivi supprimé',
  annulee: 'Vente annulée',
  reprise: 'Vente reprise',
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

const goTo = (id: string, ok: string) => window.location.assign(accountPath('ventes', { vente: id.toLowerCase(), ok }));

export function Sales({ saleId, screen }: { saleId: string | null; screen: string | null }) {
  const state = useStore(salesStore);
  const listings = useStore(myListingsStore);

  useEffect(() => {
    void loadSales();
    void loadMyListings();
  }, []);

  if (state.status === 'error') {
    return (
      <div className="space">
        <ScreenHeader title="Mes ventes" />
        <p className="signin-error" role="alert">{state.message}</p>
        <button type="button" className="btn btn-light" onClick={() => void loadSales()}>Réessayer</button>
      </div>
    );
  }
  if (state.status !== 'ready') return <Spinner />;
  const myListings = listings.status === 'ready' ? listings.items : [];
  if (screen === 'ajouter') return <SaleEditor row={null} />;
  if (!saleId) return <SaleList rows={state.rows} suggestions={state.suggestions} listings={myListings} />;
  const row = state.rows.find((item) => item.id.toLowerCase() === saleId.toLowerCase()) ?? null;
  if (!row) {
    return (
      <div className="space">
        <ScreenHeader title="Vente" back={SALES_PATH} />
        <EmptyState icon="handshake" title="Vente introuvable" text="Cette vente n'est plus suivie." action={<a className="btn btn-light" href={SALES_PATH}>Mes ventes</a>} />
      </div>
    );
  }
  if (screen === 'modifier') return <SaleEditor row={row} />;
  const conversationId = row.offer_id ? state.conversations[row.offer_id.toLowerCase()] ?? null : null;
  return <SaleDetail row={row} conversationId={conversationId} listing={listingOf(row, myListings)} />;
}

const listingOf = (row: SaleRow, listings: ListingRow[]): ListingRow | null => (
  row.listing_id ? listings.find((item) => item.id.toLowerCase() === row.listing_id!.toLowerCase()) ?? null : null
);

/** Photo de l'annonce de la vente, sinon un pictogramme. */
function SaleThumb({ listing, size }: { listing: ListingRow | null; size: 'small' | 'large' }) {
  const photo = listing ? sortedPhotos(listing)[0] : undefined;
  return (
    <span className={`sale-thumb is-${size}`} aria-hidden="true">
      {photo ? <img src={photoUrl(photo.storage_path)} alt="" loading="lazy" /> : <Icon name="house" />}
    </span>
  );
}

const saleLine = (row: SaleRow): string => {
  const price = salePrice(row);
  return [price ? formatPrice(price) : null, row.buyer_name?.trim() || null].filter(Boolean).join(' · ');
};

// MARK: - Liste

const NONE: Record<SaleState, string> = {
  active: 'Aucune vente en cours.',
  signed: 'Aucune vente signée pour le moment.',
  cancelled: 'Aucune vente annulée.',
};

function SaleList({ rows, suggestions, listings }: { rows: SaleRow[]; suggestions: SaleSuggestion[]; listings: ListingRow[] }) {
  const toast = useSavedToast();
  const [filter, setFilter] = useState<SaleState>('active');
  const [following, setFollowing] = useState<string | null>(null);
  const [followError, setFollowError] = useState<string | null>(null);
  const shown = salesIn(rows, filter);

  async function follow(suggestion: SaleSuggestion) {
    setFollowing(suggestion.offerId);
    setFollowError(null);
    const result = await followOffer(suggestion);
    if ('error' in result) {
      setFollowing(null);
      setFollowError(result.error);
      if (result.error === SALE_FOLLOWED_MESSAGE) void loadSales();
      return;
    }
    goTo(result.id, 'suivie');
  }

  return (
    <div className="space sales">
      <Toast text={toast} />
      <ScreenHeader title="Mes ventes" action={<a className="save-capsule" href={NEW_SALE_PATH}>Ajouter</a>} />
      {suggestions.length > 0 && (
        <section className="sale-card sales-suggestions space-card">
          <h2 className="sale-card-title"><Icon name="handshake" />Offres acceptées à suivre</h2>
          <ul className="sales-suggestion-list">
            {suggestions.map((suggestion) => (
              <li key={suggestion.offerId} className="sales-suggestion">
                <span className="sales-suggestion-text">
                  <span className="sales-suggestion-title">{suggestion.title}</span>
                  <span className="sales-suggestion-line">
                    Offre de {formatPrice(suggestion.price)} de {suggestion.buyerName}
                    {suggestion.acceptedOn ? `, acceptée le ${dayLabel(suggestion.acceptedOn)}` : ''}
                  </span>
                </span>
                <button type="button" className="btn btn-light sales-follow" disabled={following !== null} onClick={() => void follow(suggestion)}>
                  {following === suggestion.offerId ? <span className="spinner" aria-label="Enregistrement" /> : 'Suivre la vente'}
                </button>
              </li>
            ))}
          </ul>
          {followError && <p className="signin-error" role="alert">{followError}</p>}
        </section>
      )}
      {rows.length === 0 ? (
        <EmptyState
          icon="handshake"
          title="Aucune vente suivie"
          text="Suivez ici chaque vente, de l'offre acceptée à la signature de l'acte chez le notaire."
          action={<a className="btn btn-primary" href={NEW_SALE_PATH}>Ajouter une vente</a>}
        />
      ) : (
        <>
          <div className="sales-filters" role="group" aria-label="Filtrer les ventes">
            {SALE_FILTERS.map((item) => (
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
                  <a className="sale-row" href={salePath(row.id)}>
                    <SaleThumb listing={listingOf(row, listings)} size="small" />
                    <span className="sale-row-text">
                      <span className="sale-row-title">{row.title}</span>
                      {saleLine(row) && <span className="sale-row-line">{saleLine(row)}</span>}
                      <span className={`sale-row-stage is-${saleState(row)}`}>{saleStage(row)}</span>
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

const STATE_LABELS: Record<SaleState, string> = { active: 'En cours', signed: 'Vendue', cancelled: 'Annulée' };

function SaleDetail({ row, conversationId, listing }: { row: SaleRow; conversationId: string | null; listing: ListingRow | null }) {
  const toast = useSavedToast();
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = saleState(row);
  const steps = saleSteps(row);
  const next = state === 'active' ? steps.find((step) => !step.done)?.key : undefined;
  const price = salePrice(row);

  async function changeCancelled(cancelled: boolean) {
    setDialog(false);
    setBusy(true);
    setError(null);
    const failure = await setSaleCancelled(row.id, cancelled);
    if (failure) {
      setBusy(false);
      setError(failure);
      return;
    }
    goTo(row.id, cancelled ? 'annulee' : 'reprise');
  }

  return (
    <div className="space sales sale-page">
      <Toast text={toast} />
      <ScreenHeader title="Vente" back={SALES_PATH} action={<a className="save-capsule" href={salePath(row.id, true)}>Modifier</a>} />
      <section className="sale-head space-card">
        <SaleThumb listing={listing} size="large" />
        <div className="sale-head-text">
          <h2 className="sale-title">{row.title}</h2>
          {row.city && <p className="sale-city">{row.city}</p>}
          <p className={`sale-state is-${state}`}>{STATE_LABELS[state]}</p>
        </div>
      </section>

      <section className="sale-card space-card">
        <h2 className="sale-card-title"><Icon name="handshake" />La vente</h2>
        <dl className="sale-rows">
          <div><dt>Acquéreur</dt><dd>{row.buyer_name?.trim() || 'Non indiqué'}</dd></div>
          <div><dt>Prix de vente</dt><dd>{price ? formatPrice(price) : 'Non indiqué'}</dd></div>
          <div><dt>Notaire</dt><dd>{row.notary?.trim() || 'Non indiqué'}</dd></div>
        </dl>
        {(conversationId || row.listing_id) && (
          <div className="sale-links">
            {conversationId && <a className="btn btn-light" href={conversationPath(conversationId)}><Icon name="messageCircle" />Écrire à l&apos;acquéreur</a>}
            {row.listing_id && <a className="btn btn-light" href={listingPath(row.listing_id)}><Icon name="house" />Voir l&apos;annonce</a>}
          </div>
        )}
      </section>

      <section className="sale-card space-card">
        <h2 className="sale-card-title"><Icon name="clipboardCheck" />Étapes</h2>
        <ol className="sale-steps">
          {steps.map((step) => (
            <li key={step.key} className={`sale-step${step.done ? ' is-done' : ''}${step.key === next ? ' is-next' : ''}`}>
              <span className="sale-step-mark" aria-hidden="true">{step.done && <Icon name="check" />}</span>
              <span className="sale-step-text">
                <span className="sale-step-title">{step.title}</span>
                <span className="sale-step-detail">{step.detail}</span>
              </span>
            </li>
          ))}
        </ol>
        {state === 'active' && <p className="sale-caption">Ajoutez les dates au fil de la vente avec « Modifier ».</p>}
        {state === 'cancelled' && <p className="sale-caption">{saleStage(row)}.</p>}
      </section>

      {row.note?.trim() && (
        <section className="sale-card space-card">
          <h2 className="sale-card-title"><Icon name="squarePen" />Note privée</h2>
          <p className="sale-note">{row.note.trim()}</p>
          <p className="sale-caption">Seul vous voyez cette note.</p>
        </section>
      )}

      {error && <p className="signin-error" role="alert">{error}</p>}
      {state === 'cancelled' && (
        <button type="button" className="btn btn-light sale-resume" disabled={busy} onClick={() => void changeCancelled(false)}>
          {busy ? <span className="spinner" aria-label="Enregistrement" /> : 'Reprendre la vente'}
        </button>
      )}
      {state === 'active' && (
        <button type="button" className="link-button is-danger sale-cancel" disabled={busy} onClick={() => setDialog(true)}>Annuler la vente</button>
      )}
      <AlertDialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Annuler cette vente ?"
        message="Elle passera dans « Annulées ». Vous pourrez la reprendre."
        actions={[
          { label: 'Annuler la vente', onClick: () => void changeCancelled(true), tone: 'primary' },
          { label: 'Garder la vente', onClick: () => setDialog(false), tone: 'quiet' },
        ]}
      />
    </div>
  );
}

// MARK: - Formulaire

function SaleEditor({ row }: { row: SaleRow | null }) {
  const initial = useMemo(() => saleFormFor(row), [row]);
  const [form, setForm] = useState<SaleForm>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'leave' | 'delete' | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const today = parisDay(new Date());

  const errors = submitted ? saleErrors(form, today) : {};
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const backPath = row ? salePath(row.id) : SALES_PATH;

  function update(key: SaleField, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSubmitted(true);
    setSaveError(null);
    if (Object.keys(saleErrors(form, today)).length) {
      window.setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
      return;
    }
    setSaving(true);
    const result = await saveSale(row?.id ?? null, form);
    if ('error' in result) {
      setSaving(false);
      setSaveError(result.error);
      return;
    }
    goTo(result.id, row ? 'modifiee' : 'ajoutee');
  }

  async function remove() {
    if (!row) return;
    setDialog(null);
    setSaving(true);
    setSaveError(null);
    const failure = await deleteSale(row.id);
    if (failure) {
      setSaving(false);
      setSaveError(failure);
      return;
    }
    window.location.assign(accountPath('ventes', { ok: 'supprimee' }));
  }

  const date = (field: SaleField, label: string, hint?: string, future = false) => (
    <DateInput label={label} value={form[field]} error={errors[field]} hint={hint} max={future ? undefined : today} onChange={(value) => update(field, value)} />
  );

  return (
    <div className="space sales sale-form-screen">
      <ScreenHeader title={row ? 'Modifier la vente' : 'Nouvelle vente'} onBack={() => (dirty ? setDialog('leave') : window.location.assign(backPath))} />
      <form ref={formRef} className="info-form" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <section className="info-card space-card">
          <h2 className="field-group-title">Le bien et l&apos;acquéreur</h2>
          <TextInput label="Bien" value={form.title} error={errors.title} onChange={(value) => update('title', value)} maxLength={SALE_TITLE_MAX} placeholder="Appartement 3 pièces, rue…" />
          <TextInput label="Ville (facultative)" value={form.city} error={errors.city} onChange={(value) => update('city', value)} maxLength={SALE_NAME_MAX} autoComplete="address-level2" />
          <TextInput label="Acquéreur (facultatif)" value={form.buyerName} error={errors.buyerName} onChange={(value) => update('buyerName', value)} maxLength={SALE_NAME_MAX} />
          <PriceInput value={form.price} error={errors.price} onChange={(value) => update('price', value)} />
        </section>
        <section className="info-card space-card">
          <h2 className="field-group-title">Les dates</h2>
          {date('acceptedOn', 'Offre acceptée le')}
          {date('compromiseOn', 'Compromis signé le')}
          {date('loanDeadline', 'Date limite du prêt (facultative)', 'Pour un acquéreur qui emprunte.', true)}
          {date('conditionsOn', 'Conditions suspensives levées le')}
          {date('deedPlannedOn', 'Acte prévu le', undefined, true)}
          {date('deedSignedOn', 'Acte signé le', 'La vente passe alors dans « Signées ».')}
        </section>
        <section className="info-card space-card">
          <h2 className="field-group-title">Notaire et note</h2>
          <TextInput label="Notaire (facultatif)" value={form.notary} error={errors.notary} onChange={(value) => update('notary', value)} maxLength={SALE_NAME_MAX} />
          <label className="form-field">
            <span className="field-label">Note (facultative)</span>
            <textarea
              className="text-input sale-note-input"
              rows={4}
              maxLength={SALE_NOTE_MAX}
              placeholder="Pièces à fournir, rendez-vous, points à suivre…"
              value={form.note}
              aria-invalid={errors.note ? true : undefined}
              onChange={(event) => update('note', event.target.value)}
            />
            {errors.note && <span className="field-error">{errors.note}</span>}
          </label>
          <p className="field-hint">Seul vous voyez cette vente et sa note.</p>
        </section>
        {hasErrors && <p className="field-error" role="alert">Vérifiez les champs en rouge.</p>}
        {saveError && <p className="signin-error" role="alert">{saveError}</p>}
        <button type="submit" className="btn btn-primary sale-save" disabled={saving}>
          {saving ? <span className="spinner spinner-white" aria-label="Enregistrement" /> : row ? 'Enregistrer les modifications' : 'Ajouter la vente'}
        </button>
        {row && (
          <button type="button" className="link-button is-danger sale-delete" disabled={saving} onClick={() => setDialog('delete')}>
            Supprimer ce suivi
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
        title="Supprimer le suivi de cette vente ?"
        message="Ses dates et votre note seront effacées. L'annonce et les offres ne changent pas."
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

/** Prix en euros, milliers espacés pendant la saisie, curseur gardé après le même chiffre (comme l'offre). */
function PriceInput({ value, error, onChange }: { value: string; error?: string; onChange: (value: string) => void }) {
  const onPrice = (event: ChangeEvent<HTMLInputElement>) => {
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
      <span className="field-label">Prix de vente (facultatif)</span>
      <span className="sale-price-input">
        <input
          className="text-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={onPrice}
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
