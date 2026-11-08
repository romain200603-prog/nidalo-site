import { appDate } from '../appDates';
import { formatPerMonth, formatPrice, plural } from '../format';
import { parisDay } from '../listing/views';
import { supabase } from '../supabase';
import { GENERIC_MESSAGE, isNetworkError, NETWORK_MESSAGE } from './auth';
import { isValidProfileEmail, normalizedPhone, phonePairs } from './profile';
import { dayLabel, groupedPrice } from './sales';
import { createStore, currentUserId, sessionStore } from './session';

// « Mes opportunités » de l'espace professionnel : les pistes à suivre du compte (acheteurs, vendeurs, locataires),
// avec une étape (nouvelle, en cours, gagnée, perdue), un budget, le projet, l'annonce liée, un jour où relancer et
// une note privée (table pro_opportunities, lue et écrite par son seul propriétaire).

export type OpportunityKind = 'buyer' | 'seller' | 'tenant';
export type OpportunityStage = 'new' | 'active' | 'won' | 'lost';

/** Ligne de pro_opportunities. Les dates sont des jours (« 2026-11-08 »). */
export type OpportunityRow = {
  id: string;
  listing_id: string | null;
  kind: OpportunityKind;
  stage: OpportunityStage;
  name: string;
  phone: string | null;
  email: string | null;
  budget: number | string | null;
  project: string | null;
  follow_up_on: string | null;
  note: string | null;
  closed_on: string | null;
  created_at: string;
  updated_at: string;
};

export const OPPORTUNITY_COLUMNS = 'id, listing_id, kind, stage, name, phone, email, budget, project, follow_up_on, note, closed_on, '
  + 'created_at, updated_at';

export const KIND_LABELS: Record<OpportunityKind, string> = { buyer: 'Acheteur', seller: 'Vendeur', tenant: 'Locataire' };
export const STAGE_LABELS: Record<OpportunityStage, string> = { new: 'Nouvelle', active: 'En cours', won: 'Gagnée', lost: 'Perdue' };
/** Le montant suivi : ce qu'un acheteur peut payer, le prix voulu par un vendeur, le loyer visé par un locataire. */
export const BUDGET_LABELS: Record<OpportunityKind, string> = { buyer: 'Budget', seller: 'Prix souhaité', tenant: 'Loyer maximum' };

/** Nouvelle ou en cours : encore à suivre. */
export const isOpen = (stage: OpportunityStage): boolean => stage === 'new' || stage === 'active';

export const opportunityBudget = (value: number | string | null): number | null => {
  const amount = Number(value);
  return value !== null && Number.isFinite(amount) && amount > 0 ? amount : null;
};

/** « 300 000 € », ou « 900 €/mois » pour un locataire ; `null` sans montant. */
export function budgetText(row: Pick<OpportunityRow, 'kind' | 'budget'>): string | null {
  const amount = opportunityBudget(row.budget);
  if (amount === null) return null;
  return row.kind === 'tenant' ? formatPerMonth(amount) : formatPrice(amount);
}

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Jour court pour la liste : « 6 novembre » cette année, « 5 janvier 2027 » sinon ; `null` si le jour est invalide. */
export function listDay(day: string | null, today: string): string | null {
  const label = dayLabel(day);
  if (!day || !label) return null;
  return day.slice(0, 4) === today.slice(0, 4) ? dayMonth.format(new Date(`${day}T00:00:00Z`)) : label;
}

// MARK: - Liste

export type OpportunityFilter = 'open' | 'won' | 'lost';

export const OPPORTUNITY_FILTERS: { value: OpportunityFilter; label: string }[] = [
  { value: 'open', label: 'À suivre' },
  { value: 'won', label: 'Gagnées' },
  { value: 'lost', label: 'Perdues' },
];

const filterOf = (row: OpportunityRow): OpportunityFilter => (isOpen(row.stage) ? 'open' : row.stage as 'won' | 'lost');

/**
 * Opportunités d'un filtre, dans l'ordre de la liste : à suivre, la relance la plus proche d'abord (les retards en
 * tête, sans relance à la suite), puis les plus récemment ajoutées ; gagnées ou perdues, les plus récentes d'abord.
 */
export function opportunitiesIn(rows: OpportunityRow[], filter: OpportunityFilter): OpportunityRow[] {
  return rows.filter((row) => filterOf(row) === filter).sort((a, b) => {
    if (filter === 'open') {
      if (a.follow_up_on && b.follow_up_on && a.follow_up_on !== b.follow_up_on) return a.follow_up_on < b.follow_up_on ? -1 : 1;
      if (!!a.follow_up_on !== !!b.follow_up_on) return a.follow_up_on ? -1 : 1;
    } else if ((a.closed_on ?? '') !== (b.closed_on ?? '')) {
      return (a.closed_on ?? '') > (b.closed_on ?? '') ? -1 : 1;
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

/** Deuxième ligne de la liste : « Acheteur · Nouvelle · 300 000 € » (l'étape seulement tant qu'elle est à suivre). */
export function opportunityLine(row: OpportunityRow): string {
  return [KIND_LABELS[row.kind], isOpen(row.stage) ? STAGE_LABELS[row.stage] : null, budgetText(row)].filter(Boolean).join(' · ');
}

/**
 * Troisième ligne : la relance d'une opportunité à suivre (`due` le jour venu ou passé), ou le jour où elle a été
 * gagnée ou perdue (jours courts, sans l'année en cours) ; `today` est le jour de Paris.
 */
export function opportunityStatus(row: OpportunityRow, today: string): { text: string; due: boolean } {
  if (!isOpen(row.stage)) {
    const closed = listDay(row.closed_on, today);
    const label = STAGE_LABELS[row.stage];
    return { text: closed ? `${label} le ${closed}` : label, due: false };
  }
  const day = row.follow_up_on;
  const label = listDay(day, today);
  if (!day || !label) return { text: 'Aucune relance prévue', due: false };
  if (day === today) return { text: 'À relancer aujourd\'hui', due: true };
  return day < today ? { text: `À relancer depuis le ${label}`, due: true } : { text: `À relancer le ${label}`, due: false };
}

/** Relance dans la fiche : « Aujourd'hui », « 5 novembre 2026 (en retard) », « 12 novembre 2026 » ou « Non prévue ». */
export function followUpText(day: string | null, today: string): string {
  const label = dayLabel(day);
  if (!day || !label) return 'Non prévue';
  if (day === today) return 'Aujourd\'hui';
  return day < today ? `${label} (en retard)` : label;
}

/** Jour d'ajout (Paris), pour la fiche. */
export function addedDay(row: Pick<OpportunityRow, 'created_at'>): string | null {
  const date = appDate(row.created_at);
  return date ? dayLabel(parisDay(date)) : null;
}

export const activeOpportunitiesCount = (rows: OpportunityRow[]): number => rows.filter((row) => isOpen(row.stage)).length;

/** Ligne de Mon compte, comme l'app : « 3 opportunités actives ». */
export const opportunitiesSubtitle = (rows: OpportunityRow[]): string => (
  plural(activeOpportunitiesCount(rows), 'opportunité active', 'opportunités actives')
);

// MARK: - Formulaire

export type OpportunityForm = {
  kind: OpportunityKind;
  stage: OpportunityStage;
  name: string;
  phone: string;
  email: string;
  /** Chiffres groupés, comme saisis (« 300 000 »). */
  budget: string;
  project: string;
  listingId: string;
  followUpOn: string;
  note: string;
};
export type OpportunityField = keyof OpportunityForm;

export const OPPORTUNITY_NAME_MAX = 120;
export const OPPORTUNITY_PROJECT_MAX = 200;
export const OPPORTUNITY_NOTE_MAX = 2000;

export function opportunityFormFor(row: OpportunityRow | null): OpportunityForm {
  const budget = opportunityBudget(row?.budget ?? null);
  return {
    kind: row?.kind ?? 'buyer',
    stage: row?.stage ?? 'new',
    name: row?.name ?? '',
    phone: row?.phone ? phonePairs(row.phone) : '',
    email: row?.email ?? '',
    budget: budget === null ? '' : groupedPrice(budget),
    project: row?.project ?? '',
    listingId: row?.listing_id?.toLowerCase() ?? '',
    followUpOn: row?.follow_up_on ?? '',
    note: row?.note ?? '',
  };
}

const amountValue = (text: string): number | null => {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : null;
};

/** Champs à corriger ; vide si l'opportunité peut être enregistrée. */
export function opportunityErrors(form: OpportunityForm): Partial<Record<OpportunityField, string>> {
  const errors: Partial<Record<OpportunityField, string>> = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Indiquez le nom de la personne.';
  else if (name.length > OPPORTUNITY_NAME_MAX) errors.name = `${OPPORTUNITY_NAME_MAX} caractères au plus.`;
  if (form.phone.trim() && normalizedPhone(form.phone) === null) errors.phone = 'Numéro de téléphone invalide.';
  const mail = form.email.trim();
  if (mail && (!isValidProfileEmail(mail) || mail.length > 254)) errors.email = 'Adresse e-mail invalide.';
  if (form.budget.trim()) {
    const value = amountValue(form.budget);
    if (value === null || value <= 0 || value >= 10_000_000_000 || /[^\d\s]/.test(form.budget)) errors.budget = 'Montant invalide.';
  }
  if (form.project.trim().length > OPPORTUNITY_PROJECT_MAX) errors.project = `${OPPORTUNITY_PROJECT_MAX} caractères au plus.`;
  if (form.followUpOn && !dayLabel(form.followUpOn)) errors.followUpOn = 'Date invalide.';
  if (form.note.trim().length > OPPORTUNITY_NOTE_MAX) errors.note = '2 000 caractères au plus.';
  return errors;
}

/**
 * Jour où l'opportunité a été gagnée ou perdue : gardé si elle reste à la même étape, aujourd'hui si elle vient d'y
 * passer, vide tant qu'elle est à suivre.
 */
export function closedOn(stage: OpportunityStage, row: Pick<OpportunityRow, 'stage' | 'closed_on'> | null, today: string): string | null {
  if (isOpen(stage)) return null;
  return row && row.stage === stage && row.closed_on ? row.closed_on : today;
}

const clean = (text: string): string | null => text.trim() || null;

/** Valeurs écrites dans pro_opportunities (téléphone : chiffres, avec + pour l'étranger, comme Mes contacts). */
export function opportunityWrite(form: OpportunityForm, row: OpportunityRow | null, today: string) {
  return {
    listing_id: form.listingId || null,
    kind: form.kind,
    stage: form.stage,
    name: form.name.trim(),
    phone: clean(form.phone)?.replace(/[^\d+]/g, '') || null,
    email: clean(form.email),
    budget: amountValue(form.budget),
    project: clean(form.project),
    follow_up_on: form.followUpOn || null,
    note: clean(form.note),
    closed_on: closedOn(form.stage, row, today),
  };
}

// MARK: - Serveur

export type OpportunitiesState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: OpportunityRow[] };

export const opportunitiesStore = createStore<OpportunitiesState>({ status: 'none' });

export const OPPORTUNITIES_FULL_MESSAGE = 'Vous suivez déjà 5 000 opportunités. Supprimez-en pour en ajouter.';
export const OPPORTUNITY_LISTING_MESSAGE = 'Cette annonce n\'est plus disponible. Choisissez-en une autre.';

function failure(error: unknown): string {
  const { hint } = (error ?? {}) as { hint?: string };
  if (hint === 'opportunities_full') return OPPORTUNITIES_FULL_MESSAGE;
  if (hint === 'opportunity_listing') return OPPORTUNITY_LISTING_MESSAGE;
  return isNetworkError(error) ? NETWORK_MESSAGE : GENERIC_MESSAGE;
}

export async function loadOpportunities(): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    opportunitiesStore.set({ status: 'none' });
    return;
  }
  if (opportunitiesStore.get().status !== 'ready') opportunitiesStore.set({ status: 'loading' });
  const { data, error } = await supabase.from('pro_opportunities').select(OPPORTUNITY_COLUMNS).order('created_at', { ascending: false });
  if (currentUserId() !== session.userId) return;
  if (error) {
    opportunitiesStore.set({ status: 'error', message: failure(error) });
    return;
  }
  opportunitiesStore.set({ status: 'ready', rows: (data ?? []) as unknown as OpportunityRow[] });
}

/** Ajoute ou modifie une opportunité ; rend son identifiant, ou le message d'erreur. */
export async function saveOpportunity(row: OpportunityRow | null, form: OpportunityForm): Promise<{ id: string } | { error: string }> {
  const values = opportunityWrite(form, row, parisDay(new Date()));
  const { data, error } = row
    ? await supabase.from('pro_opportunities').update(values).eq('id', row.id).select('id').single()
    : await supabase.from('pro_opportunities').insert(values).select('id').single();
  if (error || !data) return { error: failure(error) };
  return { id: (data as { id: string }).id };
}

/** Change l'étape depuis la fiche (gagnée ou perdue : datée d'aujourd'hui, à Paris). */
export async function setOpportunityStage(row: OpportunityRow, stage: OpportunityStage): Promise<string | null> {
  const { error } = await supabase.from('pro_opportunities')
    .update({ stage, closed_on: closedOn(stage, row, parisDay(new Date())) }).eq('id', row.id);
  return error ? failure(error) : null;
}

export async function deleteOpportunity(id: string): Promise<string | null> {
  const { error } = await supabase.from('pro_opportunities').delete().eq('id', id);
  return error ? failure(error) : null;
}
