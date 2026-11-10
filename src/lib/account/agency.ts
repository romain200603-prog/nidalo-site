import { supabase } from '../supabase';
import { isNetworkError, NETWORK_MESSAGE } from './auth';
import { isValidProfileEmail, loadAccount, normalizedPhone, phonePairs } from './profile';
import { loadProfessional } from './professional';
import { currentUserId } from './session';

// « Profil agence » : la fiche agence du compte professionnel, telle que les autres la voient
// (Features/ListingDetail/PublisherViews.swift, AgencyProfileView), et son formulaire
// (Features/Profile/ProfessionalOnboardingView.swift, ImmoDomain ProfessionalApplication). Lue et enregistrée dans
// professional_profiles et professional_profile_details, avec les mêmes règles que l'app
// (Data/ProfessionalStore.swift, ProfessionalRemote). La raison sociale, le secteur couvert et les justificatifs
// restent sur l'iPhone dans l'app : le serveur n'a pas de place pour eux, le site ne les demande donc pas.

export type AgencyField = 'agencyName' | 'postalCode' | 'city' | 'phone' | 'email' | 'website' | 'feeSchedule' | 'siren' | 'siret' | 'cardNumber';

export type AgencyForm = {
  agencyName: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  /** Lien vers le barème d'honoraires, visible depuis chaque annonce de l'agence. */
  feeSchedule: string;
  about: string;
  siren: string;
  siret: string;
  /** Carte professionnelle (carte T, G…) et CCI qui l'a délivrée. */
  cardNumber: string;
  cardIssuer: string;
  /** Garantie financière : organisme garant. */
  financialGuarantor: string;
  /** Responsabilité civile professionnelle : assureur et numéro de contrat. */
  liabilityInsurer: string;
  liabilityPolicy: string;
};

export type AgencyDetails = {
  siren: string | null;
  siret: string | null;
  professional_card_number: string | null;
  professional_card_cci: string | null;
  financial_guarantee: string | null;
  rcp_insurer: string | null;
  rcp_policy_number: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  fee_schedule_url: string | null;
  about: string | null;
};

export type AgencyRecord = {
  id: string;
  agency_name: string;
  logo_path: string | null;
  postal_code: string | null;
  city: string | null;
  is_verified: boolean;
  details: AgencyDetails | null;
};

const PROFILE_COLUMNS = 'id, agency_name, logo_path, postal_code, city, is_verified';
const DETAIL_COLUMNS = 'siren, siret, professional_card_number, professional_card_cci, financial_guarantee, rcp_insurer, '
  + 'rcp_policy_number, phone, email, website, fee_schedule_url, about';
const LOGO_BUCKET = 'avatars';

export const AGENCY_SAVE_MESSAGE = 'La fiche agence n\'a pas pu être enregistrée. Réessayez dans un instant.';
export const AGENCY_LOGO_MESSAGE = 'La fiche agence est enregistrée, mais le logo n\'a pas pu être envoyé. Réessayez dans un instant.';

// MARK: - Règles du formulaire (ProfessionalApplication.errors, CompanyIdentifierValidator)

/** Retire espaces et tirets, comme CompanyIdentifierValidator.normalized. */
function compact(text: string): string {
  return text.replace(/[\s-]/g, '');
}

function passesLuhn(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  [...digits].reverse().forEach((character, index) => {
    let digit = Number(character);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  });
  return sum % 10 === 0;
}

/** SIREN : 9 chiffres qui passent la clé de Luhn. */
export function isValidSiren(text: string): boolean {
  const digits = compact(text);
  return digits.length === 9 && passesLuhn(digits);
}

/** SIRET : 14 chiffres qui passent la clé de Luhn ; La Poste (SIREN 356000000) suit « somme multiple de 5 ». */
export function isValidSiret(text: string): boolean {
  const digits = compact(text);
  if (!/^\d{14}$/.test(digits)) return false;
  if (passesLuhn(digits)) return true;
  return digits.startsWith('356000000') && [...digits].reduce((sum, digit) => sum + Number(digit), 0) % 5 === 0;
}

/** « www.agence.fr » devient « https://www.agence.fr » ; `null` si l'adresse n'est pas celle d'un site. */
export function websiteUrl(text: string): string | null {
  const value = text.trim();
  if (!value || /\s/.test(value)) return null;
  const full = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(full);
    return url.hostname.includes('.') && full.length <= 300 ? full : null;
  } catch {
    return null;
  }
}

const length = (text: string) => [...text].length;

/** Erreurs par champ ; vide si la fiche peut être enregistrée. Obligatoires : nom de l'agence, ville et SIREN. */
export function agencyErrors(form: AgencyForm): Partial<Record<AgencyField, string>> {
  const errors: Partial<Record<AgencyField, string>> = {};
  const agency = form.agencyName.trim();
  if (!agency) errors.agencyName = 'Indiquez le nom de l\'agence.';
  else if (length(agency) > 120) errors.agencyName = '120 caractères au plus.';
  if (!form.siren.trim()) errors.siren = 'Indiquez le numéro SIREN.';
  else if (!isValidSiren(form.siren)) errors.siren = 'Le SIREN compte 9 chiffres valides.';
  if (form.siret.trim()) {
    if (!isValidSiret(form.siret)) errors.siret = 'Le SIRET compte 14 chiffres valides.';
    else if (!compact(form.siret).startsWith(compact(form.siren))) errors.siret = 'Le SIRET doit commencer par le SIREN.';
  }
  if (length(form.cardNumber.trim()) > 40) errors.cardNumber = '40 caractères au plus.';
  if (!form.city.trim()) errors.city = 'Indiquez la ville de l\'agence.';
  const code = form.postalCode.trim();
  if (code && !/^\d{5}$/.test(code)) errors.postalCode = 'Le code postal compte 5 chiffres.';
  const mail = form.email.trim();
  if (mail && !isValidProfileEmail(mail)) errors.email = 'Adresse e-mail invalide.';
  if (form.website.trim() && websiteUrl(form.website) === null) errors.website = 'Adresse du site invalide (https://…).';
  if (form.feeSchedule.trim() && websiteUrl(form.feeSchedule) === null) errors.feeSchedule = 'Adresse du barème invalide (https://…).';
  if (form.phone.trim() && normalizedPhone(form.phone) === null) errors.phone = 'Numéro de téléphone invalide.';
  return errors;
}

export function agencyFormFor(record: AgencyRecord | null, accountEmail = ''): AgencyForm {
  const details = record?.details ?? null;
  return {
    agencyName: record?.agency_name ?? '',
    postalCode: record?.postal_code ?? '',
    city: record?.city ?? '',
    phone: details?.phone ? phonePairs(details.phone) : '',
    // Première fiche : l'adresse du compte est proposée, comme dans l'app.
    email: record ? (details?.email ?? '') : accountEmail,
    website: details?.website ?? '',
    feeSchedule: details?.fee_schedule_url ?? '',
    about: details?.about ?? '',
    siren: details?.siren ?? '',
    siret: details?.siret ?? '',
    cardNumber: details?.professional_card_number ?? '',
    cardIssuer: details?.professional_card_cci ?? '',
    financialGuarantor: details?.financial_guarantee ?? '',
    liabilityInsurer: details?.rcp_insurer ?? '',
    liabilityPolicy: details?.rcp_policy_number ?? '',
  };
}

const clean = (text: string): string | null => text.trim() || null;
const cut = (text: string | null, max: number): string | null => (text === null ? null : [...text].slice(0, max).join(''));

/** Lignes enregistrées, comme ProfessionalRemote.save : textes nettoyés et coupés aux limites du serveur. */
export function agencyRows(form: AgencyForm): { profile: { agency_name: string; postal_code: string | null; city: string | null }; details: AgencyDetails } {
  const digits = (text: string) => clean(text.replace(/\D/g, ''));
  return {
    profile: {
      agency_name: cut(form.agencyName.trim(), 120) ?? '',
      postal_code: clean(form.postalCode),
      city: cut(clean(form.city), 100),
    },
    details: {
      siren: digits(form.siren),
      siret: digits(form.siret),
      professional_card_number: clean(form.cardNumber),
      phone: clean(form.phone)?.replace(/[^\d+]/g, '') || null,
      email: clean(form.email),
      website: form.website.trim() ? websiteUrl(form.website) : null,
      fee_schedule_url: form.feeSchedule.trim() ? websiteUrl(form.feeSchedule) : null,
      about: cut(clean(form.about), 2000),
      professional_card_cci: cut(clean(form.cardIssuer), 80),
      financial_guarantee: cut(clean(form.financialGuarantor), 200),
      rcp_insurer: cut(clean(form.liabilityInsurer), 120),
      rcp_policy_number: cut(clean(form.liabilityPolicy), 60),
    },
  };
}

// MARK: - Serveur

/** Fiche agence du compte connecté, ou `null` s'il n'en a pas encore. Lève une erreur si la lecture échoue. */
export async function loadAgency(): Promise<AgencyRecord | null> {
  const userId = currentUserId();
  if (!userId) return null;
  const profile = await supabase.from('professional_profiles').select(PROFILE_COLUMNS).eq('owner_user_id', userId).limit(1);
  if (profile.error) throw profile.error;
  const row = profile.data?.[0] as Omit<AgencyRecord, 'details'> | undefined;
  if (!row) return null;
  const details = await supabase.from('professional_profile_details').select(DETAIL_COLUMNS).eq('professional_profile_id', row.id).limit(1);
  if (details.error) throw details.error;
  return { ...row, details: (details.data?.[0] as unknown as AgencyDetails | undefined) ?? null };
}

/**
 * Enregistre la fiche (créée la première fois), ses détails, puis le compte en professionnel relié à cette fiche,
 * comme l'app. Le logo choisi (JPEG déjà réduit) part ensuite dans le dossier du compte. Renvoie le message
 * d'erreur, ou `null`.
 */
export async function saveAgency(form: AgencyForm, logo: Blob | null): Promise<string | null> {
  const userId = currentUserId();
  if (!userId) return 'Votre session a expiré. Reconnectez-vous.';
  const rows = agencyRows(form);
  let profileId: string;
  let oldLogo: string | null = null;
  try {
    const existing = await supabase.from('professional_profiles').select('id, logo_path').eq('owner_user_id', userId).limit(1);
    if (existing.error) throw existing.error;
    const current = existing.data?.[0] as { id: string; logo_path: string | null } | undefined;
    if (current) {
      const update = await supabase.from('professional_profiles').update(rows.profile).eq('id', current.id);
      if (update.error) throw update.error;
      profileId = current.id;
      oldLogo = current.logo_path;
    } else {
      const insert = await supabase.from('professional_profiles').insert(rows.profile).select('id').single();
      if (insert.error) throw insert.error;
      profileId = (insert.data as { id: string }).id;
    }
    const details = await supabase.from('professional_profile_details')
      .upsert({ professional_profile_id: profileId, ...rows.details }, { onConflict: 'professional_profile_id' });
    if (details.error) throw details.error;
    const account = await supabase.from('profiles').update({ professional_profile_id: profileId, account_type: 'professional' }).eq('id', userId);
    if (account.error) throw account.error;
  } catch (error) {
    return isNetworkError(error) ? NETWORK_MESSAGE : AGENCY_SAVE_MESSAGE;
  }
  const logoFailure = logo ? await saveLogo(logo, userId, profileId, oldLogo) : null;
  await Promise.all([loadProfessional(), loadAccount(true)]);
  return logoFailure;
}

/**
 * Logo dans le dossier du compte, sous un nom neuf à chaque envoi (aucun ancien logo gardé en cache ne s'affiche),
 * puis sur la fiche ; l'ancien fichier est retiré ensuite.
 */
async function saveLogo(logo: Blob, userId: string, profileId: string, oldPath: string | null): Promise<string | null> {
  const path = `${userId}/agency-logo-${crypto.randomUUID()}.jpg`;
  try {
    const upload = await supabase.storage.from(LOGO_BUCKET).upload(path, logo, { contentType: 'image/jpeg', cacheControl: '3600' });
    if (upload.error) throw upload.error;
    const update = await supabase.from('professional_profiles').update({ logo_path: path }).eq('id', profileId);
    if (update.error) {
      await supabase.storage.from(LOGO_BUCKET).remove([path]).catch(() => undefined);
      throw update.error;
    }
  } catch {
    return AGENCY_LOGO_MESSAGE;
  }
  if (oldPath && oldPath !== path && oldPath.startsWith(`${userId}/`)) {
    await supabase.storage.from(LOGO_BUCKET).remove([oldPath]).catch(() => undefined);
  }
  return null;
}

// MARK: - Affichage

/** « Lyon (69006) », comme Address.cityWithPostalCode. */
export function agencyPlace(record: Pick<AgencyRecord, 'city' | 'postal_code'>): string | null {
  const city = record.city?.trim();
  if (!city) return null;
  const code = record.postal_code?.trim();
  return code ? `${city} (${code})` : city;
}

/** Informations professionnelles renseignées, dans l'ordre de l'app ; les champs vides n'apparaissent pas. */
export function professionalRows(details: AgencyDetails | null): { label: string; value: string }[] {
  if (!details) return [];
  const rows: [string, string | null][] = [
    ['SIREN', details.siren],
    ['SIRET', details.siret],
    ['Carte professionnelle', details.professional_card_number],
    ['CCI de délivrance', details.professional_card_cci],
    ['Garantie financière', details.financial_guarantee],
    ['Assurance RCP', details.rcp_insurer],
    ['Contrat RCP', details.rcp_policy_number],
  ];
  return rows.flatMap(([label, value]) => (value && value.trim() ? [{ label, value: value.trim() }] : []));
}

/** Nom du site, sans « https:// » (website.host() dans l'app). */
export function websiteLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
