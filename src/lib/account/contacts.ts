import { appDate } from '../appDates';
import { plural } from '../format';
import { effectiveStatus, fetchOffers, groupedAmount, offerStatusLabel, type OfferRow } from '../listing/offers';
import { fetchVisitRequests, requestDisplayStatus, REQUEST_STATUS_LABELS, slotLabel, type VisitRequestRow } from '../listing/visits';
import { fetchInboxRows, fetchProfiles } from '../messages/api';
import { matchesWords } from '../messages/format';
import { sameId, type ProfileRow, type ServerInboxRow } from '../messages/inbox';
import { conversationPath, visitRequestPath } from '../paths';
import { supabase } from '../supabase';
import { GENERIC_MESSAGE, isNetworkError, NETWORK_MESSAGE } from './auth';
import { isValidProfileEmail, normalizedPhone, phonePairs } from './profile';
import { createStore, currentUserId, sessionStore } from './session';

// « Mes contacts » de l'espace professionnel : les personnes qui ont écrit, demandé une visite ou fait une offre sur
// les annonces du compte (lues avec les fonctions de la messagerie, des visites et des offres, rien de nouveau), et
// les contacts ajoutés à la main, avec une note privée (table pro_contacts, lue et écrite par son seul propriétaire).

/** Ligne de pro_contacts : un contact ajouté à la main (contact_user_id vide), ou la note sur une personne de Nidalo. */
export type ContactRow = {
  id: string;
  contact_user_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export const CONTACT_COLUMNS = 'id, contact_user_id, name, phone, email, note, created_at, updated_at';

/** Demande de visite telle que my_visit_requests la rend, avec le titre du bien et l'agent. */
export type ContactVisitRow = Omit<VisitRequestRow, 'listing_snapshot'> & {
  listing_snapshot: { listingId?: string | null; title?: string | null } | null;
  agent_user_id?: string | null;
};

/** Offre telle que my_offers la rend, avec le titre du bien. */
export type ContactOfferRow = OfferRow & { listing_snapshot?: { title?: string | null } | null };

export type ActivityKind = 'message' | 'visit' | 'offer';

/** Un échange avec la personne : la conversation d'une annonce, une demande de visite ou une offre. */
export type ContactActivity = {
  kind: ActivityKind;
  id: string;
  at: Date;
  /** « Message », « Demande de visite », « Offre de 230 000 € »… */
  title: string;
  /** Dernier message, ou statut de la visite ou de l'offre. */
  detail: string | null;
  listingTitle: string | null;
  href: string;
};

export type Contact = {
  /** `u-<compte>` pour une personne de Nidalo, `m-<ligne>` pour un contact ajouté à la main. */
  key: string;
  userId: string | null;
  /** Ligne de pro_contacts : le contact ajouté à la main, ou la note sur une personne de Nidalo. */
  rowId: string | null;
  name: string;
  avatarPath: string | null;
  isAgency: boolean;
  /** Contact ajouté à la main seulement : Nidalo ne montre jamais le numéro ni l'e-mail des autres comptes. */
  phone: string | null;
  email: string | null;
  note: string;
  lastAt: Date;
  /** Premier échange il y a moins de 7 jours. */
  isNew: boolean;
  /** Les plus récents d'abord. */
  activities: ContactActivity[];
  /** Titres des biens concernés, sans doublon, les plus récents d'abord. */
  listingTitles: string[];
  /** Conversation la plus récente avec la personne, pour « Envoyer un message ». */
  conversationId: string | null;
};

export const NEW_CONTACT_DAYS = 7;
const DAY = 86_400_000;

/** Nom d'une personne de Nidalo : le nom de l'agence d'un professionnel, sinon le nom public (comme Messages). */
function personName(profile: ProfileRow | undefined, fallback: string | null): { name: string; avatarPath: string | null; isAgency: boolean } {
  const isAgency = profile?.account_type === 'professional' && !!profile.agency_name?.trim();
  if (isAgency) return { name: profile!.agency_name!.trim(), avatarPath: profile!.agency_logo_path ?? null, isAgency };
  return { name: profile?.public_name?.trim() || fallback?.trim() || 'Membre Nidalo', avatarPath: profile?.avatar_path ?? null, isAgency: false };
}

const titleOf = (snapshot: { title?: string | null } | null | undefined): string | null => snapshot?.title?.trim() || null;

/**
 * Contacts du compte `me`, les plus récents d'abord : chaque personne qui a écrit sur l'une de ses annonces (une
 * conversation avec au moins un message), demandé une visite ou fait une offre, puis les contacts ajoutés à la main.
 */
export function buildContacts({ me, conversations, visits, offers, profiles, rows, now }: {
  me: string;
  conversations: ServerInboxRow[];
  visits: ContactVisitRow[];
  offers: ContactOfferRow[];
  profiles: Map<string, ProfileRow>;
  rows: ContactRow[];
  now: Date;
}): Contact[] {
  type Draft = { userId: string; fallbackName: string | null; activities: ContactActivity[]; conversation: { id: string; at: Date } | null };
  const people = new Map<string, Draft>();

  function add(userId: string, activity: ContactActivity, conversationId: string | null, fallbackName: string | null = null) {
    const key = userId.toLowerCase();
    const draft = people.get(key) ?? { userId, fallbackName: null, activities: [], conversation: null };
    people.set(key, draft);
    draft.activities.push(activity);
    if (fallbackName && !draft.fallbackName) draft.fallbackName = fallbackName;
    if (conversationId && (!draft.conversation || draft.conversation.at < activity.at)) draft.conversation = { id: conversationId, at: activity.at };
  }

  for (const row of conversations) {
    if (row.kind !== 'listing' || !sameId(row.seller_id, me) || !row.buyer_id || sameId(row.buyer_id, me)) continue;
    const at = appDate(row.last_message_at);
    if (!at) continue;
    add(row.buyer_id, {
      kind: 'message', id: row.conversation_id, at, title: 'Message', detail: row.last_message_preview?.trim() || null,
      listingTitle: titleOf(row.listing_snapshot), href: conversationPath(row.conversation_id),
    }, row.conversation_id);
  }

  for (const visit of visits) {
    const requester = visit.requester?.userId;
    if (!requester || sameId(requester, me)) continue;
    if (!sameId(visit.recipient?.userId, me) && !sameId(visit.agent_user_id, me)) continue;
    const at = appDate(visit.created_at);
    if (!at) continue;
    const status = REQUEST_STATUS_LABELS[requestDisplayStatus(visit as VisitRequestRow, now)];
    const slot = visit.status === 'accepted' && visit.accepted_slot ? appDate(visit.accepted_slot.start) : null;
    add(requester, {
      kind: 'visit', id: visit.id, at, title: visit.mode === 'video' ? 'Demande de visite vidéo' : 'Demande de visite',
      detail: slot ? `${status} · ${slotLabel(slot)}` : status, listingTitle: titleOf(visit.listing_snapshot), href: visitRequestPath(visit.id),
    }, null, visit.requester.name);
  }

  for (const offer of offers) {
    if (!sameId(offer.seller_id, me) || !offer.buyer_id || sameId(offer.buyer_id, me)) continue;
    const at = appDate(offer.created_at);
    if (!at) continue;
    const amount = `${groupedAmount(Number(offer.amount))} €`;
    const fromBuyer = !offer.author_id || sameId(offer.author_id, offer.buyer_id);
    add(offer.buyer_id, {
      kind: 'offer', id: offer.id, at, title: fromBuyer ? `Offre de ${amount}` : `Votre contre-offre de ${amount}`,
      detail: offerStatusLabel(effectiveStatus(offer, now), !fromBuyer), listingTitle: titleOf(offer.listing_snapshot),
      href: conversationPath(offer.conversation_id),
    }, offer.conversation_id);
  }

  const notes = new Map<string, ContactRow>();
  const manual: ContactRow[] = [];
  for (const row of rows) {
    if (row.contact_user_id) notes.set(row.contact_user_id.toLowerCase(), row);
    else manual.push(row);
  }
  // Une note sur une personne dont les échanges ont disparu reste visible.
  for (const [key, row] of notes) {
    if (!people.has(key)) people.set(key, { userId: row.contact_user_id!, fallbackName: null, activities: [], conversation: null });
  }

  const contacts: Contact[] = [];
  for (const [key, draft] of people) {
    const activities = [...draft.activities].sort((a, b) => b.at.getTime() - a.at.getTime());
    const note = notes.get(key) ?? null;
    const first = activities.length ? activities[activities.length - 1].at : null;
    contacts.push({
      key: `u-${key}`,
      userId: draft.userId,
      rowId: note?.id ?? null,
      ...personName(profiles.get(key), draft.fallbackName),
      phone: null,
      email: null,
      note: note?.note ?? '',
      lastAt: activities[0]?.at ?? appDate(note?.updated_at) ?? now,
      isNew: !!first && now.getTime() - first.getTime() < NEW_CONTACT_DAYS * DAY,
      activities,
      listingTitles: [...new Set(activities.map((activity) => activity.listingTitle).filter((title): title is string => !!title))],
      conversationId: draft.conversation?.id ?? null,
    });
  }
  for (const row of manual) {
    contacts.push({
      key: `m-${row.id.toLowerCase()}`,
      userId: null,
      rowId: row.id,
      name: row.name?.trim() || 'Contact',
      avatarPath: null,
      isAgency: false,
      phone: row.phone,
      email: row.email,
      note: row.note ?? '',
      lastAt: appDate(row.updated_at) ?? appDate(row.created_at) ?? now,
      isNew: false,
      activities: [],
      listingTitles: [],
      conversationId: null,
    });
  }
  return contacts.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime() || a.name.localeCompare(b.name, 'fr'));
}

// MARK: - Liste

export type ContactFilter = 'all' | 'new' | 'visits' | 'offers' | 'manual';

export const CONTACT_FILTERS: { value: ContactFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'new', label: 'Nouveaux' },
  { value: 'visits', label: 'Visites' },
  { value: 'offers', label: 'Offres' },
  { value: 'manual', label: 'Ajoutés' },
];

function inFilter(contact: Contact, filter: ContactFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'new': return contact.isNew;
    case 'visits': return contact.activities.some((activity) => activity.kind === 'visit');
    case 'offers': return contact.activities.some((activity) => activity.kind === 'offer');
    case 'manual': return contact.userId === null;
  }
}

/** Contacts du filtre dont le nom, un bien, le numéro ou l'e-mail commence par les mots cherchés. */
export function filterContacts(contacts: Contact[], filter: ContactFilter, query: string): Contact[] {
  const searching = query.trim().length > 0;
  return contacts.filter((contact) => inFilter(contact, filter) && (!searching || matchesWords(query, [
    contact.name, ...contact.listingTitles, contact.email ?? '', contact.phone ? `${contact.phone} ${phonePairs(contact.phone)}` : '',
  ])));
}

/** « 3 contacts · 1 nouveau » (ligne « Mes contacts » de l'espace pro, comme l'app). */
export function contactsSubtitle(contacts: Contact[]): string {
  return `${plural(contacts.length, 'contact', 'contacts')} · ${plural(contacts.filter((contact) => contact.isNew).length, 'nouveau', 'nouveaux')}`;
}

/** Deuxième ligne d'un contact de la liste : le dernier échange, ou les coordonnées d'un contact ajouté à la main. */
export function contactLine(contact: Contact): string {
  const last = contact.activities[0];
  if (last) return [last.title, last.detail && last.kind !== 'message' ? last.detail : null].filter(Boolean).join(' · ');
  if (contact.userId) return 'Membre Nidalo';
  return [contact.phone ? phonePairs(contact.phone) : null, contact.email].filter(Boolean).join(' · ') || 'Ajouté à la main';
}

// MARK: - Formulaire

export type ContactForm = { name: string; phone: string; email: string; note: string };
export type ContactField = keyof ContactForm;

export const CONTACT_NAME_MAX = 120;
export const CONTACT_NOTE_MAX = 2000;

export function contactFormFor(contact: Contact | null): ContactForm {
  return {
    name: contact?.name ?? '',
    phone: contact?.phone ? phonePairs(contact.phone) : '',
    email: contact?.email ?? '',
    note: contact?.note ?? '',
  };
}

/** Erreurs par champ ; vide si le contact peut être enregistré. */
export function contactErrors(form: ContactForm): Partial<Record<ContactField, string>> {
  const errors: Partial<Record<ContactField, string>> = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Indiquez le nom du contact.';
  else if (name.length > CONTACT_NAME_MAX) errors.name = `${CONTACT_NAME_MAX} caractères au plus.`;
  if (form.phone.trim() && normalizedPhone(form.phone) === null) errors.phone = 'Numéro de téléphone invalide.';
  const mail = form.email.trim();
  if (mail && !isValidProfileEmail(mail)) errors.email = 'Adresse e-mail invalide.';
  if (form.note.trim().length > CONTACT_NOTE_MAX) errors.note = `${plural(CONTACT_NOTE_MAX, 'caractère', 'caractères')} au plus.`;
  return errors;
}

const clean = (text: string): string | null => text.trim() || null;

/** Colonnes écrites d'un contact ajouté à la main (téléphone : chiffres, avec + pour l'étranger, comme le profil). */
export function contactWrite(form: ContactForm): { name: string; phone: string | null; email: string | null; note: string | null } {
  return {
    name: form.name.trim(),
    phone: clean(form.phone)?.replace(/[^\d+]/g, '') || null,
    email: clean(form.email),
    note: clean(form.note),
  };
}

// MARK: - Serveur

export type ContactsState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: Contact[] };

export const contactsStore = createStore<ContactsState>({ status: 'none' });

/** Plafond du serveur (5 000 lignes par compte, comme l'agenda) : `hint` « contacts_full ». */
export const CONTACTS_FULL_MESSAGE = 'Vous avez déjà 5 000 contacts et notes. Supprimez-en pour en ajouter.';

function failure(error: unknown): string {
  if ((error as { hint?: string } | null)?.hint === 'contacts_full') return CONTACTS_FULL_MESSAGE;
  return isNetworkError(error) ? NETWORK_MESSAGE : GENERIC_MESSAGE;
}

export async function fetchContactRows(): Promise<ContactRow[]> {
  const { data, error } = await supabase.from('pro_contacts').select(CONTACT_COLUMNS).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ContactRow[];
}

/** Lit les échanges, les contacts ajoutés et les profils publics, puis recompose la liste. */
export async function loadContacts(): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    contactsStore.set({ status: 'none' });
    return;
  }
  if (contactsStore.get().status !== 'ready') contactsStore.set({ status: 'loading' });
  try {
    const [conversations, visits, offers, rows] = await Promise.all([
      fetchInboxRows(), fetchVisitRequests() as Promise<ContactVisitRow[]>, fetchOffers() as Promise<ContactOfferRow[]>, fetchContactRows(),
    ]);
    const ids = [
      ...conversations.map((row) => row.buyer_id), ...offers.map((row) => row.buyer_id),
      ...visits.map((row) => row.requester?.userId), ...rows.map((row) => row.contact_user_id),
    ].filter((id): id is string => !!id && !sameId(id, session.userId));
    const profiles = await fetchProfiles(ids);
    if (currentUserId() !== session.userId) return;
    contactsStore.set({
      status: 'ready',
      items: buildContacts({ me: session.userId, conversations, visits, offers, profiles, rows, now: new Date() }),
    });
  } catch (error) {
    if (currentUserId() !== session.userId) return;
    contactsStore.set({ status: 'error', message: failure(error) });
  }
}

/** Ajoute ou modifie un contact ajouté à la main ; rend son identifiant, ou le message d'erreur. */
export async function saveManualContact(rowId: string | null, form: ContactForm): Promise<{ id: string } | { error: string }> {
  const values = contactWrite(form);
  const { data, error } = rowId
    ? await supabase.from('pro_contacts').update(values).eq('id', rowId).select('id').single()
    : await supabase.from('pro_contacts').insert(values).select('id').single();
  if (error || !data) return { error: failure(error) };
  return { id: (data as { id: string }).id };
}

export async function deleteManualContact(rowId: string): Promise<string | null> {
  const { error } = await supabase.from('pro_contacts').delete().eq('id', rowId);
  return error ? failure(error) : null;
}

/** Note privée sur une personne de Nidalo : la ligne existe déjà, ou elle est créée. */
export async function saveContactNote(contact: Contact, note: string): Promise<string | null> {
  const value = clean(note);
  if (contact.rowId) {
    const { error } = await supabase.from('pro_contacts').update({ note: value }).eq('id', contact.rowId);
    return error ? failure(error) : null;
  }
  if (!contact.userId) return GENERIC_MESSAGE;
  const { error } = await supabase.from('pro_contacts').insert({ contact_user_id: contact.userId, note: value });
  if (!error) return null;
  // Créée entre-temps ailleurs (l'app ou un autre onglet) : la note la remplace.
  if (error.code === '23505') {
    const retry = await supabase.from('pro_contacts').update({ note: value }).eq('contact_user_id', contact.userId);
    return retry.error ? failure(retry.error) : null;
  }
  return failure(error);
}
