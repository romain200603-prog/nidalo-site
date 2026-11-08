import { plural } from '../format';
import { parisDay } from '../listing/views';
import { supabase } from '../supabase';
import { GENERIC_MESSAGE, isNetworkError, NETWORK_MESSAGE } from './auth';
import { dayLabel, groupedPrice } from './sales';
import { createStore, currentUserId, sessionStore } from './session';

// « Mes mandats » de l'espace professionnel : le registre des mandats du compte (vente ou location, exclusif ou
// simple, numéro, mandant, bien, prix, honoraires, dates, note) et le mandat signé en PDF, dans un dossier privé
// (table pro_mandates et bucket mandate-documents). Avec une équipe, le registre est celui de l'agence : chacun voit
// les mandats de l'équipe, chaque mandat garde son auteur et son PDF reste dans le dossier de celui-ci.

export type MandateKind = 'sale' | 'rental';
export type MandateExclusivity = 'exclusive' | 'simple';

/** Ligne de pro_mandates. Les dates sont des jours (« 2026-11-08 »). */
export type MandateRow = {
  id: string;
  /** Auteur : moi, ou une personne de l'équipe. */
  owner_id: string;
  listing_id: string | null;
  kind: MandateKind;
  exclusivity: MandateExclusivity;
  number: string;
  client_name: string;
  title: string;
  city: string | null;
  price: number | string | null;
  fees: number | string | null;
  signed_on: string;
  ends_on: string | null;
  ended_on: string | null;
  document_path: string | null;
  document_name: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export const MANDATE_COLUMNS = 'id, owner_id, listing_id, kind, exclusivity, number, client_name, title, city, price, fees, signed_on, ends_on, '
  + 'ended_on, document_path, document_name, note, created_at, updated_at';

export const MANDATE_BUCKET = 'mandate-documents';

export const KIND_LABELS: Record<MandateKind, string> = { sale: 'Vente', rental: 'Location' };
export const EXCLUSIVITY_LABELS: Record<MandateExclusivity, string> = { exclusive: 'Exclusif', simple: 'Simple' };

export type MandateState = 'active' | 'ended';

/** En cours tant qu'il n'est ni terminé ni échu ; `today` est le jour de Paris. */
export function mandateState(row: Pick<MandateRow, 'ended_on' | 'ends_on'>, today: string): MandateState {
  if (row.ended_on) return 'ended';
  return row.ends_on && row.ends_on < today ? 'ended' : 'active';
}

const on = (prefix: string, day: string | null): string => {
  const label = dayLabel(day);
  return label ? `${prefix} ${label}` : prefix;
};

/** Où en est le mandat, en une ligne (liste). */
export function mandateStage(row: MandateRow, today: string): string {
  if (row.ended_on) return on('Terminé le', row.ended_on);
  if (!row.ends_on) return 'Sans date de fin';
  return row.ends_on < today ? on('Échu le', row.ends_on) : on('Jusqu\'au', row.ends_on);
}

export const mandateAmount = (value: number | string | null): number | null => {
  const amount = Number(value);
  return value !== null && Number.isFinite(amount) && amount > 0 ? amount : null;
};

/** Jour de fin d'un mandat terminé ou échu (pour ranger les plus récents d'abord). */
const endDay = (row: MandateRow): string => row.ended_on ?? row.ends_on ?? '';

/**
 * Mandats d'un état, dans l'ordre de la liste : en cours, la fin la plus proche d'abord (sans date de fin à la
 * suite), puis les plus récemment signés ; terminés, les plus récemment finis d'abord.
 */
export function mandatesIn(rows: MandateRow[], state: MandateState, today: string): MandateRow[] {
  return rows.filter((row) => mandateState(row, today) === state).sort((a, b) => {
    if (state === 'active') {
      if (a.ends_on && b.ends_on && a.ends_on !== b.ends_on) return a.ends_on < b.ends_on ? -1 : 1;
      if (!!a.ends_on !== !!b.ends_on) return a.ends_on ? -1 : 1;
    } else if (endDay(a) !== endDay(b)) {
      return endDay(a) > endDay(b) ? -1 : 1;
    }
    if (a.signed_on !== b.signed_on) return a.signed_on > b.signed_on ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

export const MANDATE_FILTERS: { value: MandateState; label: string }[] = [
  { value: 'active', label: 'En cours' },
  { value: 'ended', label: 'Terminés' },
];

export const activeMandatesCount = (rows: MandateRow[], today: string): number => (
  rows.filter((row) => mandateState(row, today) === 'active').length
);

/** Les miens, pas ceux de l'équipe. */
export const isOwnMandate = (row: Pick<MandateRow, 'owner_id'>, me: string | null): boolean => (
  !row.owner_id || (!!me && row.owner_id.toLowerCase() === me.toLowerCase())
);

/** Ligne de Mon compte, comme l'app : « 2 mandats actifs, vente et location ». */
export const mandatesSubtitle = (rows: MandateRow[], today: string): string => (
  `${plural(activeMandatesCount(rows, today), 'mandat actif', 'mandats actifs')}, vente et location`
);

// MARK: - Formulaire

export type MandateForm = {
  kind: MandateKind;
  exclusivity: MandateExclusivity;
  number: string;
  signedOn: string;
  endsOn: string;
  listingId: string;
  title: string;
  city: string;
  clientName: string;
  /** Chiffres groupés, comme saisis (« 320 000 »). */
  price: string;
  fees: string;
  note: string;
};
export type MandateField = keyof MandateForm | 'document';

export const MANDATE_NUMBER_MAX = 40;
export const MANDATE_TITLE_MAX = 160;
export const MANDATE_NAME_MAX = 120;
export const MANDATE_NOTE_MAX = 2000;
/** PDF du mandat signé : 10 Mo au plus (limite du bucket). */
export const MANDATE_FILE_MAX = 10 * 1024 * 1024;

export function mandateFormFor(row: MandateRow | null): MandateForm {
  const amount = (value: number | string | null) => {
    const number = mandateAmount(value);
    return number === null ? '' : groupedPrice(number);
  };
  return {
    kind: row?.kind ?? 'sale',
    exclusivity: row?.exclusivity ?? 'exclusive',
    number: row?.number ?? '',
    signedOn: row?.signed_on ?? '',
    endsOn: row?.ends_on ?? '',
    listingId: row?.listing_id?.toLowerCase() ?? '',
    title: row?.title ?? '',
    city: row?.city ?? '',
    clientName: row?.client_name ?? '',
    price: row ? amount(row.price) : '',
    fees: row ? amount(row.fees) : '',
    note: row?.note ?? '',
  };
}

const amountValue = (text: string): number | null => {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : null;
};

/** PDF choisi : son nom et sa taille suffisent pour vérifier (le contenu est vérifié à l'envoi). */
export type MandateFile = { name: string; size: number; type: string };

/** Fichier refusé avant l'envoi : rien, ou le message. */
export function mandateFileIssue(file: MandateFile): string | null {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return 'Choisissez un fichier PDF.';
  if (file.size > MANDATE_FILE_MAX) return 'Le PDF dépasse 10 Mo.';
  if (file.size === 0) return 'Ce fichier est vide.';
  return null;
}

/** Champs à corriger ; `today` est le jour de Paris (« 2026-11-08 »). */
export function mandateErrors(form: MandateForm, today: string): Partial<Record<MandateField, string>> {
  const errors: Partial<Record<MandateField, string>> = {};
  const number = form.number.trim();
  if (!number) errors.number = 'Indiquez le numéro du registre.';
  else if (number.length > MANDATE_NUMBER_MAX) errors.number = `${MANDATE_NUMBER_MAX} caractères au plus.`;
  if (!form.signedOn) errors.signedOn = 'Indiquez la date de signature.';
  else if (!dayLabel(form.signedOn)) errors.signedOn = 'Date invalide.';
  else if (form.signedOn > today) errors.signedOn = 'Cette date est après aujourd\'hui.';
  if (form.endsOn && !dayLabel(form.endsOn)) errors.endsOn = 'Date invalide.';
  else if (form.endsOn && !errors.signedOn && form.endsOn < form.signedOn) errors.endsOn = 'Cette date est avant la signature.';
  if (!form.title.trim()) errors.title = 'Indiquez le bien.';
  else if (form.title.trim().length > MANDATE_TITLE_MAX) errors.title = `${MANDATE_TITLE_MAX} caractères au plus.`;
  if (form.city.trim().length > MANDATE_NAME_MAX) errors.city = `${MANDATE_NAME_MAX} caractères au plus.`;
  if (!form.clientName.trim()) errors.clientName = 'Indiquez le mandant.';
  else if (form.clientName.trim().length > MANDATE_NAME_MAX) errors.clientName = `${MANDATE_NAME_MAX} caractères au plus.`;
  for (const [field, max] of [['price', 10_000_000_000], ['fees', 1_000_000_000]] as const) {
    if (!form[field].trim()) continue;
    const value = amountValue(form[field]);
    if (value === null || value <= 0 || value >= max || /[^\d\s]/.test(form[field])) errors[field] = 'Montant invalide.';
  }
  if (form.note.trim().length > MANDATE_NOTE_MAX) errors.note = '2 000 caractères au plus.';
  return errors;
}

const clean = (text: string): string | null => text.trim() || null;

/** Valeurs écrites dans pro_mandates (sans le PDF ni la fin anticipée). */
export function mandateWrite(form: MandateForm) {
  return {
    listing_id: form.listingId || null,
    kind: form.kind,
    exclusivity: form.exclusivity,
    number: form.number.trim(),
    client_name: form.clientName.trim(),
    title: form.title.trim(),
    city: clean(form.city),
    price: amountValue(form.price),
    fees: amountValue(form.fees),
    signed_on: form.signedOn,
    ends_on: form.endsOn || null,
    note: clean(form.note),
  };
}

/** Nom d'origine du PDF, gardé lisible et court (200 caractères au plus, « .pdf » compris). */
export function documentName(name: string): string {
  const base = name.replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim() || 'Mandat.pdf';
  const withExt = /\.pdf$/i.test(base) ? base : `${base}.pdf`;
  return withExt.length <= 200 ? withExt : `${withExt.slice(0, 196).trim()}.pdf`;
}

// MARK: - Serveur

export type MandatesState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: MandateRow[] };

export const mandatesStore = createStore<MandatesState>({ status: 'none' });

export const MANDATES_FULL_MESSAGE = 'Votre registre compte déjà 5 000 mandats. Supprimez-en pour en ajouter.';
export const MANDATE_LISTING_MESSAGE = 'Cette annonce n\'est plus disponible. Choisissez-en une autre.';
export const MANDATE_NUMBER_TAKEN = 'Ce numéro est déjà dans votre registre.';
export const MANDATE_NUMBER_AGENCY = 'Ce numéro est déjà dans le registre de l\'agence.';
export const MANDATE_FILE_FAILURE = 'Le PDF n\'a pas pu être envoyé. Vérifiez votre connexion et réessayez.';
export const MANDATE_FILE_INVALID = 'Ce fichier n\'est pas un PDF valide.';

function failure(error: unknown): string {
  const { hint, code } = (error ?? {}) as { hint?: string; code?: string };
  if (hint === 'mandates_full') return MANDATES_FULL_MESSAGE;
  if (hint === 'mandate_listing') return MANDATE_LISTING_MESSAGE;
  if (hint === 'mandate_number_agency') return MANDATE_NUMBER_AGENCY;
  if (code === '23505') return MANDATE_NUMBER_TAKEN;
  return isNetworkError(error) ? NETWORK_MESSAGE : GENERIC_MESSAGE;
}

export async function loadMandates(): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    mandatesStore.set({ status: 'none' });
    return;
  }
  if (mandatesStore.get().status !== 'ready') mandatesStore.set({ status: 'loading' });
  const { data, error } = await supabase.from('pro_mandates').select(MANDATE_COLUMNS)
    .order('signed_on', { ascending: false }).order('created_at', { ascending: false });
  if (currentUserId() !== session.userId) return;
  if (error) {
    mandatesStore.set({ status: 'error', message: failure(error) });
    return;
  }
  mandatesStore.set({ status: 'ready', rows: (data ?? []) as unknown as MandateRow[] });
}

/** Les cinq premiers octets d'un PDF : « %PDF- ». */
async function looksLikePdf(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return [0x25, 0x50, 0x44, 0x46, 0x2d].every((byte, index) => head[index] === byte);
}

const removeFile = async (path: string | null): Promise<void> => {
  if (!path) return;
  await supabase.storage.from(MANDATE_BUCKET).remove([path]).then(() => undefined, () => undefined);
};

/** PDF du formulaire : un nouveau fichier, le retrait de l'actuel, ou rien (`keep`). */
export type MandateDocumentChange = { file: File } | 'remove' | 'keep';

type Saved = { id: string } | { error: string };

/**
 * Ajoute ou modifie un mandat. Un nouveau PDF est envoyé d'abord (« <auteur>/<uuid>.pdf », dans le dossier de
 * l'auteur du mandat, même quand un responsable le modifie), puis la ligne est écrite ; si elle ne l'est pas, le
 * fichier envoyé est retiré. L'ancien PDF, remplacé ou retiré, est effacé ensuite.
 */
export async function saveMandate(row: MandateRow | null, form: MandateForm, document: MandateDocumentChange): Promise<Saved> {
  const userId = currentUserId();
  if (!userId) return { error: GENERIC_MESSAGE };
  let uploaded: string | null = null;
  let documentValues: { document_path: string | null; document_name: string | null } | null = null;
  if (typeof document === 'object') {
    const issue = mandateFileIssue(document.file);
    if (issue) return { error: issue };
    if (!await looksLikePdf(document.file)) return { error: MANDATE_FILE_INVALID };
    uploaded = `${(row?.owner_id ?? userId).toLowerCase()}/${crypto.randomUUID().toLowerCase()}.pdf`;
    const body = document.file.type === 'application/pdf' ? document.file : new Blob([document.file], { type: 'application/pdf' });
    const upload = await supabase.storage.from(MANDATE_BUCKET).upload(uploaded, body, { contentType: 'application/pdf', cacheControl: '3600' })
      .catch((error: unknown) => ({ error }));
    if (upload.error) return { error: isNetworkError(upload.error) ? NETWORK_MESSAGE : MANDATE_FILE_FAILURE };
    documentValues = { document_path: uploaded, document_name: documentName(document.file.name) };
  } else if (document === 'remove') {
    documentValues = { document_path: null, document_name: null };
  }
  const values = { ...mandateWrite(form), ...(documentValues ?? {}) };
  const { data, error } = row
    ? await supabase.from('pro_mandates').update(values).eq('id', row.id).select('id').single()
    : await supabase.from('pro_mandates').insert(values).select('id').single();
  if (error || !data) {
    await removeFile(uploaded);
    return { error: failure(error) };
  }
  if (documentValues && row?.document_path && row.document_path !== documentValues.document_path) await removeFile(row.document_path);
  return { id: (data as { id: string }).id };
}

/** Termine le mandat ce jour (Paris), ou le reprend (`ended` à false). */
export async function setMandateEnded(id: string, ended: boolean): Promise<string | null> {
  const { error } = await supabase.from('pro_mandates').update({ ended_on: ended ? parisDay(new Date()) : null }).eq('id', id);
  return error ? failure(error) : null;
}

/** Supprime le mandat, puis son PDF. */
export async function deleteMandate(row: MandateRow): Promise<string | null> {
  const { error } = await supabase.from('pro_mandates').delete().eq('id', row.id);
  if (error) return failure(error);
  await removeFile(row.document_path);
  return null;
}

/** Adresse signée du PDF (valable 10 minutes), ou `null`. */
export async function mandateFileUrl(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(MANDATE_BUCKET).createSignedUrl(path, 600);
    return error || !data?.signedUrl ? null : data.signedUrl;
  } catch {
    return null;
  }
}
