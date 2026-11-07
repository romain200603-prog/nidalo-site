import { supabase } from '../supabase';
import { createStore, currentUserId, sessionStore } from './session';
import { databaseMessage } from './errors';

// Profil du compte (tables profiles et profile_details), comme Data/Supabase/SupabaseAccountRepositories.swift.

export type AccountType = 'individual' | 'professional';
export type ProfessionalSituation = 'employee' | 'civilServant' | 'selfEmployed' | 'retired' | 'student' | 'unemployed';

export const SITUATIONS: { value: ProfessionalSituation; label: string }[] = [
  { value: 'employee', label: 'Salarié' },
  { value: 'civilServant', label: 'Fonctionnaire' },
  { value: 'selfEmployed', label: 'Indépendant' },
  { value: 'retired', label: 'Retraité' },
  { value: 'student', label: 'Étudiant' },
  { value: 'unemployed', label: 'Sans activité' },
];

export type ProfileRow = {
  id: string;
  display_name: string;
  avatar_path: string | null;
  account_type: AccountType;
  professional_profile_id: string | null;
  created_at: string;
  shows_full_name: boolean | null;
  findable_by_phone: boolean | null;
};

export type DetailsRow = {
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  phone: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  insee_code: string | null;
  country_code: string | null;
  professional_situation: ProfessionalSituation | null;
};

export type Account = { profile: ProfileRow; details: DetailsRow | null; email: string };

export type AccountState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; account: Account };

const PROFILE_COLUMNS = 'id, display_name, avatar_path, account_type, professional_profile_id, created_at, shows_full_name, findable_by_phone';
const DETAIL_COLUMNS = 'first_name, last_name, birth_date, phone, street, postal_code, city, insee_code, country_code, professional_situation';

export const accountStore = createStore<AccountState>({ status: 'none' });

let loadedFor: string | null = null;

/** Charge le profil du compte connecté (une fois par page, ou de nouveau avec `force`). */
export async function loadAccount(force = false): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    loadedFor = null;
    accountStore.set({ status: 'none' });
    return;
  }
  if (!force && loadedFor === session.userId && accountStore.get().status !== 'error') return;
  loadedFor = session.userId;
  if (accountStore.get().status !== 'ready') accountStore.set({ status: 'loading' });
  try {
    const [profile, details] = await Promise.all([
      supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', session.userId).single(),
      supabase.from('profile_details').select(DETAIL_COLUMNS).eq('user_id', session.userId).limit(1),
    ]);
    if (profile.error) throw profile.error;
    if (details.error) throw details.error;
    if (currentUserId() !== session.userId) return;
    accountStore.set({
      status: 'ready',
      account: { profile: profile.data as ProfileRow, details: (details.data?.[0] as DetailsRow | undefined) ?? null, email: session.email },
    });
  } catch {
    loadedFor = null;
    accountStore.set({ status: 'error', message: 'Impossible de charger votre compte. Réessayez dans un instant.' });
  }
}

/** Adresse publique d'une photo du compte (bucket « avatars », public). */
export function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https:\/\//.test(path)) return path;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

/** Initiales : premières lettres des deux premiers mots, en majuscules (SpaceProfileCard). */
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0] ?? '').join('').toLocaleUpperCase('fr-FR');
}

/** « Bonjour Claire » : le premier mot du nom, sauf si le nom est encore le début de l'adresse e-mail (HomeView). */
export function greetingName(account: Account): string | null {
  const name = account.profile.display_name.trim();
  const prefix = account.email.split('@')[0] ?? '';
  // Nom encore tiré de l'e-mail : le prénom n'est pas connu, « Bonjour » seul (HomeView.swift).
  if (!name || name.toLocaleLowerCase('fr-FR') === prefix.toLocaleLowerCase('fr-FR') || name === 'Utilisateur') return null;
  const first = account.details?.first_name?.trim();
  if (first) return first;
  return name.split(/\s+/)[0] ?? null;
}

// MARK: - Formulaire « Mes informations » (ImmoDomain/User/ProfileValidation.swift)

export type ProfileField = 'firstName' | 'lastName' | 'birthDate' | 'email' | 'phone' | 'postalCode' | 'city';

export type ProfileForm = {
  firstName: string;
  lastName: string;
  /** AAAA-MM-JJ, ou vide. */
  birthDate: string;
  email: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  situation: ProfessionalSituation | null;
  showsFullName: boolean;
  accountType: AccountType;
};

/** Formulaire prérempli : prénom et nom séparés, ou déduits du nom affiché (premier mot, puis le reste). */
export function formFor(account: Account): ProfileForm {
  const d = account.details;
  let first = d?.first_name ?? '';
  let last = d?.last_name ?? '';
  if (d?.first_name == null && d?.last_name == null) {
    const name = account.profile.display_name;
    const space = name.indexOf(' ');
    first = space < 0 ? name : name.slice(0, space);
    last = space < 0 ? '' : name.slice(space + 1);
  }
  return {
    firstName: first,
    lastName: last,
    birthDate: d?.birth_date ?? '',
    email: account.email,
    phone: d?.phone ? phonePairs(d.phone) : '',
    street: d?.street ?? '',
    postalCode: d?.postal_code ?? '',
    city: d?.city ?? '',
    situation: d?.professional_situation ?? null,
    showsFullName: account.profile.shows_full_name === true,
    accountType: account.profile.account_type,
  };
}

const trimmed = (text: string) => text.trim();
const length = (text: string) => [...text].length;

function nameIssue(text: string, label: string): string | null {
  const value = trimmed(text);
  if (!value) return `Indiquez ${label}.`;
  if (length(value) > 50) return '50 caractères au plus.';
  return /^[\p{L} '’-]+$/u.test(value) ? null : 'Lettres, espaces, tirets et apostrophes seulement.';
}

export function isValidProfileEmail(text: string): boolean {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(text) && !text.includes('..');
}

function pairs(digits: string): string {
  return digits.match(/.{1,2}/g)?.join(' ') ?? '';
}

/** Numéro par paires (« 06 39 98 12 34 », « +44 20 79 46 00 00 ») ; `null` si le format n'est pas reconnu. */
export function normalizedPhone(text: string): string | null {
  const compact = text.replace(/[ .\-()]/g, '');
  if (compact.startsWith('+33') || compact.startsWith('0033')) {
    const national = `0${compact.slice(compact.startsWith('+33') ? 3 : 4)}`;
    return /^0[1-9]\d{8}$/.test(national) ? pairs(national) : null;
  }
  if (compact.startsWith('+')) {
    const digits = compact.slice(1);
    if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
    return `+${digits.slice(0, 2)} ${pairs(digits.slice(2))}`;
  }
  return /^0[1-9]\d{8}$/.test(compact) ? pairs(compact) : null;
}

/** Numéro enregistré (chiffres, avec + pour l'étranger) affiché par paires. */
export function phonePairs(stored: string): string {
  return normalizedPhone(stored) ?? stored;
}

function ageInYears(birth: Date, now: Date): number {
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

function parseDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getDate() === Number(match[3]) ? date : null;
}

/** Erreurs par champ ; vide si le formulaire peut être enregistré. */
export function profileErrors(form: ProfileForm, now = new Date()): Partial<Record<ProfileField, string>> {
  const errors: Partial<Record<ProfileField, string>> = {};
  const first = nameIssue(form.firstName, 'votre prénom');
  if (first) errors.firstName = first;
  const last = nameIssue(form.lastName, 'votre nom');
  if (last) errors.lastName = last;
  if (form.birthDate) {
    const birth = parseDay(form.birthDate);
    if (!birth) errors.birthDate = 'Vérifiez la date de naissance.';
    else if (birth > now) errors.birthDate = 'La date de naissance ne peut pas être dans le futur.';
    else if (ageInYears(birth, now) > 120) errors.birthDate = 'Vérifiez la date de naissance.';
  }
  const mail = trimmed(form.email);
  if (!mail) errors.email = 'Indiquez votre adresse e-mail.';
  else if (!isValidProfileEmail(mail)) errors.email = 'Adresse e-mail invalide (exemple : prenom.nom@domaine.fr).';
  if (trimmed(form.phone) && normalizedPhone(form.phone) === null) {
    errors.phone = 'Numéro invalide : 10 chiffres commençant par 0, ou + suivi de l\'indicatif du pays.';
  }
  const code = trimmed(form.postalCode);
  const town = trimmed(form.city);
  if (trimmed(form.street) || code || town) {
    if (!code) errors.postalCode = 'Indiquez le code postal.';
    else if (!/^\d{5}$/.test(code)) errors.postalCode = 'Le code postal compte 5 chiffres.';
    if (!town) errors.city = 'Indiquez la ville.';
  }
  return errors;
}

/** « Claire M. » par défaut ; nom complet seulement s'il est choisi (ImmoDomain/User/PublicIdentity.swift). */
export function publicName(first: string, last: string, showsFullName: boolean): string {
  const given = first.trim();
  const family = last.trim();
  if (showsFullName) return [given, family].filter(Boolean).join(' ');
  const initial = [...family][0];
  if (!initial) return given;
  return `${given} ${initial.toLocaleUpperCase('fr-FR')}.`;
}

// MARK: - Photo de profil

/** Photo réduite à 1024 px sur son plus grand côté, en JPEG qualité 0,85 (ProfilePhotoStore). */
export async function preparedPhoto(file: Blob, maxSide = 1024): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Cette photo n\'a pas pu être lue.');
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Cette photo n\'a pas pu être lue.');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Cette photo n\'a pas pu être lue.');
  return blob;
}

/** Photo choisie : `undefined` = inchangée, `null` = supprimée. */
export type PhotoChange = Blob | null | undefined;

/**
 * Enregistre « Mes informations » (SupabaseAccountRepositories.swift 169–228) : la photo d'abord, puis le profil et
 * ses détails. Si l'enregistrement échoue, la nouvelle photo est retirée ; s'il réussit, l'ancienne l'est.
 * `displayName` : nom gardé tel quel au lieu de « prénom nom » (prénom demandé avant un premier message, que l'app
 * enregistre sans toucher au nom du profil). Renvoie le message d'erreur, ou `null`.
 */
export async function saveProfile(account: Account, form: ProfileForm, photo: PhotoChange, { displayName: kept }: { displayName?: string } = {}): Promise<string | null> {
  const userId = currentUserId();
  if (!userId || userId !== account.profile.id) return 'Votre session a expiré. Reconnectez-vous.';
  const first = trimmed(form.firstName);
  const last = trimmed(form.lastName);
  const displayName = [...(kept ?? `${first} ${last}`).trim()].slice(0, 80).join('');
  if (!displayName) return 'Indiquez votre nom.';
  const normalized = trimmed(form.phone) ? normalizedPhone(form.phone) : null;
  const phone = normalized ? normalized.replace(/[^\d+]/g, '') : null;
  if (phone !== null && !/^\+?[0-9]{8,15}$/.test(phone)) return 'Numéro de téléphone invalide.';
  try {
    const current = await supabase.from('profiles').select('avatar_path').eq('id', userId).single();
    if (current.error) throw current.error;
    const oldPath = (current.data as { avatar_path: string | null }).avatar_path;
    let avatarPath = oldPath;
    let uploaded: string | null = null;
    if (photo instanceof Blob) {
      uploaded = `${userId}/${crypto.randomUUID()}.jpg`;
      const upload = await supabase.storage.from('avatars').upload(uploaded, photo, { contentType: 'image/jpeg', cacheControl: '3600' });
      if (upload.error) throw upload.error;
      avatarPath = uploaded;
    } else if (photo === null) {
      avatarPath = null;
    }
    const street = trimmed(form.street);
    const code = trimmed(form.postalCode);
    const city = trimmed(form.city);
    const hasAddress = Boolean(street || code || city);
    const insee = account.details?.insee_code;
    const result = await (async () => {
      const profileUpdate = await supabase.from('profiles')
        .update({ display_name: displayName, avatar_path: avatarPath, account_type: form.accountType, shows_full_name: form.showsFullName })
        .eq('id', userId);
      if (profileUpdate.error) return profileUpdate.error;
      const detailsUpdate = await supabase.from('profile_details').update({
        first_name: first || null,
        last_name: last || null,
        birth_date: form.birthDate || null,
        phone,
        street: hasAddress && street ? street : null,
        postal_code: hasAddress ? code || null : null,
        city: hasAddress ? city || null : null,
        insee_code: hasAddress && insee && insee.length === 5 ? insee : null,
        country_code: hasAddress ? (account.details?.country_code ?? 'FR').toUpperCase() : null,
        professional_situation: form.situation,
      }).eq('user_id', userId);
      return detailsUpdate.error;
    })();
    if (result) {
      if (uploaded) await supabase.storage.from('avatars').remove([uploaded]);
      throw result;
    }
    if (oldPath && oldPath !== avatarPath) await supabase.storage.from('avatars').remove([oldPath]).catch(() => undefined);
    await loadAccount(true);
    return null;
  } catch (error) {
    return databaseMessage(error);
  }
}

/** Type de compte seul (choix du profil, « Passer en particulier ») : `profiles.account_type`. */
export async function saveAccountType(type: AccountType): Promise<string | null> {
  const userId = currentUserId();
  if (!userId) return 'Votre session a expiré. Reconnectez-vous.';
  const { error } = await supabase.from('profiles').update({ account_type: type }).eq('id', userId);
  if (error) return databaseMessage(error);
  await loadAccount(true);
  return null;
}

/** « Me retrouver par mon numéro » (profiles.findable_by_phone). */
export async function saveFindableByPhone(value: boolean): Promise<string | null> {
  const userId = currentUserId();
  if (!userId) return 'Votre session a expiré. Reconnectez-vous.';
  const { error } = await supabase.from('profiles').update({ findable_by_phone: value }).eq('id', userId);
  if (error) return 'Le réglage n\'a pas pu être enregistré. Réessayez dans un instant.';
  await loadAccount(true);
  return null;
}
