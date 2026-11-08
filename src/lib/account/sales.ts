import { plural } from '../format';
import { fetchOffers, type OfferRow } from '../listing/offers';
import { parisDay } from '../listing/views';
import { fetchProfiles } from '../messages/api';
import { sameId, type ProfileRow } from '../messages/inbox';
import { supabase } from '../supabase';
import { GENERIC_MESSAGE, isNetworkError, NETWORK_MESSAGE } from './auth';
import { createStore, currentUserId, sessionStore } from './session';

// « Mes ventes » de l'espace professionnel : le suivi de chaque vente, de l'offre acceptée à l'acte signé chez le
// notaire (table pro_sales, lue et écrite par son seul propriétaire), et les offres acceptées sur ses annonces qui ne
// sont pas encore suivies (lues avec my_offers, comme Mes contacts).

/** Ligne de pro_sales. Les dates sont des jours (« 2026-11-08 »). */
export type SaleRow = {
  id: string;
  listing_id: string | null;
  offer_id: string | null;
  title: string;
  city: string | null;
  buyer_name: string | null;
  price: number | string | null;
  accepted_on: string | null;
  compromise_on: string | null;
  loan_deadline: string | null;
  conditions_on: string | null;
  deed_planned_on: string | null;
  deed_signed_on: string | null;
  cancelled_on: string | null;
  notary: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export const SALE_COLUMNS = 'id, listing_id, offer_id, title, city, buyer_name, price, accepted_on, compromise_on, loan_deadline, '
  + 'conditions_on, deed_planned_on, deed_signed_on, cancelled_on, notary, note, created_at, updated_at';

/** Offre telle que my_offers la rend, avec le titre et la ville du bien. */
export type SaleOfferRow = OfferRow & { listing_snapshot?: { title?: string | null; city?: string | null } | null };

export type SaleState = 'active' | 'signed' | 'cancelled';

export function saleState(row: Pick<SaleRow, 'cancelled_on' | 'deed_signed_on'>): SaleState {
  if (row.cancelled_on) return 'cancelled';
  return row.deed_signed_on ? 'signed' : 'active';
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** « 8 novembre 2026 » pour le jour « 2026-11-08 » ; rien pour une valeur vide ou fausse. */
export function dayLabel(day: string | null | undefined): string | null {
  if (!day || !DAY_PATTERN.test(day)) return null;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : dayFormat.format(date);
}

const on = (prefix: string, day: string | null): string => {
  const label = dayLabel(day);
  return label ? `${prefix} ${label}` : prefix;
};

export const salePrice = (row: Pick<SaleRow, 'price'>): number | null => {
  const value = Number(row.price);
  return row.price !== null && Number.isFinite(value) && value > 0 ? value : null;
};

/** Où en est la vente, en une ligne (liste). */
export function saleStage(row: SaleRow): string {
  const state = saleState(row);
  if (state === 'cancelled') return on('Annulée le', row.cancelled_on);
  if (state === 'signed') return on('Acte signé le', row.deed_signed_on);
  if (!row.compromise_on) return 'Compromis à signer';
  if (!row.conditions_on) return row.loan_deadline ? on('Prêt attendu avant le', row.loan_deadline) : 'Conditions suspensives en cours';
  return row.deed_planned_on ? on('Acte prévu le', row.deed_planned_on) : 'Acte à planifier';
}

export type SaleStepKey = 'offer' | 'compromise' | 'conditions' | 'deed';
export type SaleStep = { key: SaleStepKey; title: string; detail: string; done: boolean };

/** Les quatre étapes de la fiche, de l'offre acceptée à l'acte signé. */
export function saleSteps(row: SaleRow): SaleStep[] {
  return [
    { key: 'offer', title: 'Offre acceptée', detail: row.accepted_on ? on('Le', row.accepted_on) : 'Date non indiquée', done: true },
    { key: 'compromise', title: 'Compromis signé', detail: row.compromise_on ? on('Le', row.compromise_on) : 'À venir', done: !!row.compromise_on },
    {
      key: 'conditions',
      title: 'Conditions suspensives levées',
      detail: row.conditions_on ? on('Le', row.conditions_on) : row.loan_deadline ? on('Prêt attendu avant le', row.loan_deadline) : 'À venir',
      done: !!row.conditions_on,
    },
    {
      key: 'deed',
      title: 'Acte authentique signé',
      detail: row.deed_signed_on ? on('Le', row.deed_signed_on) : row.deed_planned_on ? on('Prévu le', row.deed_planned_on) : 'À venir',
      done: !!row.deed_signed_on,
    },
  ];
}

/** Date à surveiller d'une vente en cours : la limite du prêt, puis le jour de l'acte. */
function watchedDay(row: SaleRow): string | null {
  if (!row.compromise_on) return null;
  return row.conditions_on ? row.deed_planned_on : row.loan_deadline;
}

/**
 * Ventes d'un état, dans l'ordre de la liste : en cours, la date à surveiller la plus proche d'abord, puis les plus
 * récentes ; signées et annulées, les plus récentes d'abord.
 */
export function salesIn(rows: SaleRow[], state: SaleState): SaleRow[] {
  const latest = (row: SaleRow) => (state === 'signed' ? row.deed_signed_on : state === 'cancelled' ? row.cancelled_on : null) ?? '';
  return rows.filter((row) => saleState(row) === state).sort((a, b) => {
    if (state === 'active') {
      const [dayA, dayB] = [watchedDay(a), watchedDay(b)];
      if (dayA && dayB && dayA !== dayB) return dayA < dayB ? -1 : 1;
      if (!!dayA !== !!dayB) return dayA ? -1 : 1;
    } else if (latest(a) !== latest(b)) {
      return latest(a) > latest(b) ? -1 : 1;
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

export const SALE_FILTERS: { value: SaleState; label: string }[] = [
  { value: 'active', label: 'En cours' },
  { value: 'signed', label: 'Signées' },
  { value: 'cancelled', label: 'Annulées' },
];

/** Ligne de Mon compte, comme l'app : « 2 en cours · 1 compromis signé ». */
export function salesSubtitle(rows: SaleRow[]): string {
  const active = rows.filter((row) => saleState(row) === 'active');
  const signed = active.filter((row) => row.compromise_on).length;
  return `${active.length} en cours · ${plural(signed, 'compromis signé', 'compromis signés')}`;
}

export const activeSalesCount = (rows: SaleRow[]): number => rows.filter((row) => saleState(row) === 'active').length;

// MARK: - Offres acceptées à suivre

export type SaleSuggestion = {
  offerId: string;
  listingId: string | null;
  title: string;
  city: string | null;
  buyerName: string;
  price: number;
  /** Jour de Paris où l'offre a été acceptée. */
  acceptedOn: string | null;
  conversationId: string;
};

/** Acquéreur : le nom de l'agence d'un professionnel, sinon le nom public (comme Messages). */
function buyerName(profile: ProfileRow | undefined): string {
  if (profile?.account_type === 'professional' && profile.agency_name?.trim()) return profile.agency_name.trim();
  return profile?.public_name?.trim() || 'Membre Nidalo';
}

const isAcceptedSale = (offer: SaleOfferRow, me: string): boolean => (
  offer.status === 'accepted' && sameId(offer.seller_id, me) && !sameId(offer.buyer_id, me)
);

/** Offres acceptées sur les annonces de `me` que ses ventes ne suivent pas encore, les plus récentes d'abord. */
export function saleSuggestions({ me, offers, profiles, rows }: {
  me: string;
  offers: SaleOfferRow[];
  profiles: Map<string, ProfileRow>;
  rows: SaleRow[];
}): SaleSuggestion[] {
  const followed = new Set(rows.map((row) => row.offer_id?.toLowerCase()).filter(Boolean));
  return offers
    .filter((offer) => isAcceptedSale(offer, me) && !followed.has(offer.id.toLowerCase()))
    .map((offer) => {
      const accepted = offer.responded_at ? new Date(offer.responded_at) : null;
      return {
        offerId: offer.id,
        listingId: offer.listing_id,
        title: offer.listing_snapshot?.title?.trim() || 'Bien sans titre',
        city: offer.listing_snapshot?.city?.trim() || null,
        buyerName: buyerName(offer.buyer_id ? profiles.get(offer.buyer_id.toLowerCase()) : undefined),
        price: Number(offer.amount),
        acceptedOn: accepted && !Number.isNaN(accepted.getTime()) ? parisDay(accepted) : null,
        conversationId: offer.conversation_id,
      };
    })
    .sort((a, b) => (b.acceptedOn ?? '').localeCompare(a.acceptedOn ?? ''));
}

// MARK: - Formulaire

export type SaleForm = {
  title: string;
  city: string;
  buyerName: string;
  /** Chiffres groupés, comme saisis (« 230 000 »). */
  price: string;
  acceptedOn: string;
  compromiseOn: string;
  loanDeadline: string;
  conditionsOn: string;
  deedPlannedOn: string;
  deedSignedOn: string;
  notary: string;
  note: string;
};
export type SaleField = keyof SaleForm;

export const SALE_TITLE_MAX = 160;
export const SALE_NAME_MAX = 120;
export const SALE_NOTE_MAX = 2000;

const grouped = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
/** « 230 000 » pour 230000, espaces fines insécables comme les champs de nombres. */
export const groupedPrice = (value: number): string => grouped.format(value).replace(/\s/g, '\u202f');

export function saleFormFor(row: SaleRow | null): SaleForm {
  const price = row ? salePrice(row) : null;
  return {
    title: row?.title ?? '',
    city: row?.city ?? '',
    buyerName: row?.buyer_name ?? '',
    price: price === null ? '' : groupedPrice(price),
    acceptedOn: row?.accepted_on ?? '',
    compromiseOn: row?.compromise_on ?? '',
    loanDeadline: row?.loan_deadline ?? '',
    conditionsOn: row?.conditions_on ?? '',
    deedPlannedOn: row?.deed_planned_on ?? '',
    deedSignedOn: row?.deed_signed_on ?? '',
    notary: row?.notary ?? '',
    note: row?.note ?? '',
  };
}

const priceValue = (text: string): number | null => {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : null;
};

/** Champs à corriger ; `today` est le jour de Paris (« 2026-11-08 »). */
export function saleErrors(form: SaleForm, today: string): Partial<Record<SaleField, string>> {
  const errors: Partial<Record<SaleField, string>> = {};
  if (!form.title.trim()) errors.title = 'Indiquez le bien.';
  else if (form.title.trim().length > SALE_TITLE_MAX) errors.title = `${SALE_TITLE_MAX} caractères au plus.`;
  for (const field of ['city', 'buyerName', 'notary'] as const) {
    if (form[field].trim().length > SALE_NAME_MAX) errors[field] = `${SALE_NAME_MAX} caractères au plus.`;
  }
  if (form.note.trim().length > SALE_NOTE_MAX) errors.note = '2 000 caractères au plus.';
  if (form.price.trim()) {
    const price = priceValue(form.price);
    if (price === null || price <= 0 || price >= 10_000_000_000 || /[^\d\s]/.test(form.price)) errors.price = 'Prix invalide.';
  }
  const days = ['acceptedOn', 'compromiseOn', 'loanDeadline', 'conditionsOn', 'deedPlannedOn', 'deedSignedOn'] as const;
  for (const field of days) {
    if (form[field] && !dayLabel(form[field])) errors[field] = 'Date invalide.';
  }
  // Ce qui est déjà fait ne peut pas être daté après aujourd'hui.
  for (const field of ['acceptedOn', 'compromiseOn', 'conditionsOn', 'deedSignedOn'] as const) {
    if (!errors[field] && form[field] && form[field] > today) errors[field] = 'Cette date est après aujourd\'hui.';
  }
  const before = (field: (typeof days)[number], limit: string, message: string) => {
    if (!errors[field] && form[field] && limit && dayLabel(limit) && form[field] < limit) errors[field] = message;
  };
  before('compromiseOn', form.acceptedOn, 'Cette date est avant l\'offre acceptée.');
  before('loanDeadline', form.compromiseOn, 'Cette date est avant le compromis.');
  before('conditionsOn', form.compromiseOn, 'Cette date est avant le compromis.');
  before('deedPlannedOn', form.compromiseOn, 'Cette date est avant le compromis.');
  before('deedSignedOn', form.compromiseOn, 'Cette date est avant le compromis.');
  before('deedSignedOn', form.acceptedOn, 'Cette date est avant l\'offre acceptée.');
  if (!errors.conditionsOn && form.conditionsOn && !form.compromiseOn) errors.conditionsOn = 'Indiquez d\'abord la date du compromis.';
  return errors;
}

const clean = (text: string): string | null => text.trim() || null;

/** Valeurs écrites dans pro_sales (sans l'annonce, l'offre ni l'annulation). */
export function saleWrite(form: SaleForm) {
  return {
    title: form.title.trim(),
    city: clean(form.city),
    buyer_name: clean(form.buyerName),
    price: priceValue(form.price),
    accepted_on: form.acceptedOn || null,
    compromise_on: form.compromiseOn || null,
    loan_deadline: form.loanDeadline || null,
    conditions_on: form.conditionsOn || null,
    deed_planned_on: form.deedPlannedOn || null,
    deed_signed_on: form.deedSignedOn || null,
    notary: clean(form.notary),
    note: clean(form.note),
  };
}

// MARK: - Serveur

export type SalesState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
    status: 'ready';
    rows: SaleRow[];
    suggestions: SaleSuggestion[];
    /** Conversation de chaque offre acceptée suivie (identifiant de l'offre en minuscules). */
    conversations: Record<string, string>;
  };

export const salesStore = createStore<SalesState>({ status: 'none' });

/** Plafond du serveur (2 000 ventes par compte) : `hint` « sales_full ». */
export const SALES_FULL_MESSAGE = 'Vous suivez déjà 2 000 ventes. Supprimez-en pour en ajouter.';
export const SALE_GONE_MESSAGE = 'Cette offre ou cette annonce n\'est plus disponible. Rechargez la page.';
export const SALE_FOLLOWED_MESSAGE = 'Cette vente est déjà suivie.';

function failure(error: unknown): string {
  const hint = (error as { hint?: string } | null)?.hint;
  if (hint === 'sales_full') return SALES_FULL_MESSAGE;
  if (hint === 'sale_offer' || hint === 'sale_listing') return SALE_GONE_MESSAGE;
  return isNetworkError(error) ? NETWORK_MESSAGE : GENERIC_MESSAGE;
}

export async function fetchSaleRows(): Promise<SaleRow[]> {
  const { data, error } = await supabase.from('pro_sales').select(SALE_COLUMNS).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SaleRow[];
}

/** Lit les ventes suivies et les offres du compte, puis les noms des acquéreurs des offres acceptées à suivre. */
export async function loadSales(): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    salesStore.set({ status: 'none' });
    return;
  }
  if (salesStore.get().status !== 'ready') salesStore.set({ status: 'loading' });
  try {
    const [rows, offers] = await Promise.all([fetchSaleRows(), fetchOffers() as Promise<SaleOfferRow[]>]);
    const waiting = saleSuggestions({ me: session.userId, offers, profiles: new Map(), rows });
    const profiles = await fetchProfiles(waiting.map((item) => offers.find((offer) => offer.id === item.offerId)?.buyer_id ?? '').filter(Boolean));
    if (currentUserId() !== session.userId) return;
    const conversations: Record<string, string> = {};
    for (const offer of offers) conversations[offer.id.toLowerCase()] = offer.conversation_id;
    salesStore.set({ status: 'ready', rows, suggestions: saleSuggestions({ me: session.userId, offers, profiles, rows }), conversations });
  } catch (error) {
    if (currentUserId() !== session.userId) return;
    salesStore.set({ status: 'error', message: failure(error) });
  }
}

type Saved = { id: string } | { error: string };

/** Ajoute ou modifie une vente ; rend son identifiant, ou le message d'erreur. */
export async function saveSale(id: string | null, form: SaleForm): Promise<Saved> {
  const values = saleWrite(form);
  const { data, error } = id
    ? await supabase.from('pro_sales').update(values).eq('id', id).select('id').single()
    : await supabase.from('pro_sales').insert(values).select('id').single();
  if (error || !data) return { error: failure(error) };
  return { id: (data as { id: string }).id };
}

/** Suit la vente d'une offre acceptée : le bien, l'acquéreur, le prix et le jour de l'offre sont repris. */
export async function followOffer(suggestion: SaleSuggestion): Promise<Saved> {
  const { data, error } = await supabase.from('pro_sales').insert({
    listing_id: suggestion.listingId,
    offer_id: suggestion.offerId,
    title: suggestion.title.slice(0, SALE_TITLE_MAX),
    city: suggestion.city?.slice(0, SALE_NAME_MAX) ?? null,
    buyer_name: suggestion.buyerName.slice(0, SALE_NAME_MAX),
    price: suggestion.price > 0 ? suggestion.price : null,
    accepted_on: suggestion.acceptedOn,
  }).select('id').single();
  if (error?.code === '23505') return { error: SALE_FOLLOWED_MESSAGE };
  if (error || !data) return { error: failure(error) };
  return { id: (data as { id: string }).id };
}

/** Annule la vente ce jour (Paris), ou la reprend (`cancelled` à false). */
export async function setSaleCancelled(id: string, cancelled: boolean): Promise<string | null> {
  const { error } = await supabase.from('pro_sales').update({ cancelled_on: cancelled ? parisDay(new Date()) : null }).eq('id', id);
  return error ? failure(error) : null;
}

export async function deleteSale(id: string): Promise<string | null> {
  const { error } = await supabase.from('pro_sales').delete().eq('id', id);
  return error ? failure(error) : null;
}
