import { normalizedPhone } from '../account/profile';
import { SUPABASE_URL } from '../config';
import { LISTING_COLUMNS, PUBLIC_STATUSES, type ListingRow } from '../listings';
import { supabase } from '../supabase';

// « Votre interlocuteur » : profil public du vendeur (fonction `public_profiles` du serveur), comme l'app
// (Features/ListingDetail/PublisherViews.swift et Data/Supabase/SupabaseListingRepository.swift). Sans compte, le
// serveur ne donne ni téléphone ni e-mail.

export type PublicProfileRow = {
  user_id: string;
  public_name: string | null;
  avatar_path: string | null;
  account_type: string | null;
  member_since: string | null;
  agency_id: string | null;
  agency_name: string | null;
  agency_logo_path: string | null;
  agency_postal_code: string | null;
  agency_city: string | null;
  agency_phone: string | null;
  // Fiche publique de l'agence (profil « Agence » de l'app), envoyée par la même fonction du serveur.
  agency_is_verified?: boolean | null;
  agency_email?: string | null;
  agency_website?: string | null;
  agency_about?: string | null;
  agency_siren?: string | null;
  agency_professional_card_number?: string | null;
  agency_professional_card_cci?: string | null;
  agency_financial_guarantee?: string | null;
  agency_rcp_insurer?: string | null;
  agency_rcp_policy_number?: string | null;
};

/** Fiche publique d'une agence (AgencyProfileView de l'app) : seulement ce que l'agence a renseigné. */
export type AgencyDetails = {
  isVerified: boolean;
  /** « Lyon (69002) ». */
  cityLine: string | null;
  about: string | null;
  /** « Votre interlocuteur » : le nom complet de l'agent qui publie. */
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  /** SIREN, carte professionnelle, garantie, assurance : libellé et valeur. */
  professionalRows: [string, string][];
};

export type Publisher = {
  isProfessional: boolean;
  /** Nom public : « Claire M. » pour un particulier, le nom de l'agence pour un professionnel. */
  name: string;
  /** Lignes grises sous le nom (sans le nombre d'annonces, ajouté à part). */
  lines: string[];
  avatarUrl: string | null;
  /** Numéro publié (jamais pour un visiteur sans compte). */
  phone: string | null;
  /** Agence : lien vers son barème d'honoraires, obligatoire depuis chaque annonce (fonction `agency_fee_schedule_url`). */
  feeScheduleUrl: string | null;
  /** Compte qui publie (ses annonces : profil d'un particulier). */
  userId: string | null;
  /** « Sur Nidalo depuis mars 2025 » (profil d'un particulier). */
  memberSince: string | null;
  /** Fiche de l'agence (profil « Agence ») ; `null` pour un particulier. */
  agency: AgencyDetails | null;
};

const filled = (value: string | null | undefined): string | null => {
  const text = value?.trim();
  return text ? text : null;
};

function agencyDetails(profile: PublicProfileRow, contactName: string): AgencyDetails {
  const postal = (profile.agency_postal_code ?? '').trim();
  const city = filled(profile.agency_city);
  const website = filled(profile.agency_website);
  const rows: [string, string | null][] = [
    ['SIREN', filled(profile.agency_siren)],
    ['Carte professionnelle', filled(profile.agency_professional_card_number)],
    ['CCI de délivrance', filled(profile.agency_professional_card_cci)],
    ['Garantie financière', filled(profile.agency_financial_guarantee)],
    ['Assurance RCP', filled(profile.agency_rcp_insurer)],
    ['Contrat RCP', filled(profile.agency_rcp_policy_number)],
  ];
  const phone = filled(profile.agency_phone);
  return {
    isVerified: profile.agency_is_verified === true,
    cityLine: city ? (postal ? `${city} (${postal})` : city) : null,
    about: filled(profile.agency_about),
    contactName,
    phone: phone ? (normalizedPhone(phone) ?? phone) : null,
    email: filled(profile.agency_email),
    website: website && /^https?:\/\//i.test(website) ? website : null,
    professionalRows: rows.filter((row): row is [string, string] => row[1] !== null),
  };
}

const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** « Claire M. » par défaut ; nom complet seulement avec `showsFullName` (PublicIdentity.name). */
export function publicName(displayName: string, showsFullName = false): string {
  const parts = displayName.split(' ').filter(Boolean);
  const given = parts[0] ?? '';
  const family = parts.slice(1).join(' ');
  if (showsFullName) return [given, family].filter(Boolean).join(' ');
  const initial = family.charAt(0);
  if (!initial) return given || displayName;
  return `${given} ${initial.toUpperCase()}.`;
}

/** « Sur Nidalo depuis mars 2025 » à partir d'un jour « 2025-03-01 » (ou d'une date ISO). */
export function memberSince(day: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!match) return null;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(d.getTime()) ? null : `Sur Nidalo depuis ${monthYear.format(d)}`;
}

/** Initiales de l'avatar : « CM ». */
export function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase();
}

function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Interlocuteur tel que l'app le montre, à partir du profil public (ou sans profil : « Particulier »). */
export function publisherFrom(profile: PublicProfileRow | null, listingCreatedAt: string, feeScheduleUrl: string | null = null): Publisher {
  const isPro = profile?.account_type === 'professional' && !!profile.agency_id;
  const displayName = profile?.public_name ?? (isPro ? (profile?.agency_name ?? 'Agence') : 'Particulier');
  if (isPro && profile) {
    const lines = [`Votre contact : ${publicName(displayName, true)}`];
    if (profile.agency_city) {
      const postal = (profile.agency_postal_code ?? '').trim();
      lines.push(postal ? `${profile.agency_city} (${postal})` : profile.agency_city);
    }
    return {
      isProfessional: true, name: profile.agency_name ?? 'Agence', lines,
      avatarUrl: avatarUrl(profile.agency_logo_path), phone: profile.agency_phone ?? null,
      feeScheduleUrl: feeScheduleUrl !== null && /^https?:\/\//i.test(feeScheduleUrl) ? feeScheduleUrl : null,
      userId: profile.user_id, memberSince: null, agency: agencyDetails(profile, publicName(displayName, true)),
    };
  }
  const since = memberSince(profile?.member_since ?? listingCreatedAt);
  // Le nom tel que le serveur l'envoie (déjà réglé selon « Afficher mon nom complet ») ; raccourci par le site
  // seulement s'il manque (PublisherKind.serverName, n° 24).
  return {
    isProfessional: false, name: displayName.trim() || publicName(displayName), lines: since ? [since] : [],
    avatarUrl: avatarUrl(profile?.avatar_path ?? null), phone: null, feeScheduleUrl: null,
    userId: profile?.user_id ?? null, memberSince: since, agency: null,
  };
}

export async function fetchPublisher(ownerId: string, listingCreatedAt: string): Promise<Publisher> {
  const { data, error } = await supabase.rpc('public_profiles', { user_ids: [ownerId] });
  if (error) throw error;
  const rows = (data as PublicProfileRow[] | null) ?? [];
  const profile = rows.find((r) => r.user_id === ownerId) ?? null;
  // Barème d'une agence : à part, et sans bloquer la fiche si le serveur ne répond pas.
  let feeSchedule: string | null = null;
  if (profile?.account_type === 'professional' && profile.agency_id) {
    const result = await supabase.rpc('agency_fee_schedule_url', { p_user_id: ownerId });
    feeSchedule = !result.error && typeof result.data === 'string' ? result.data : null;
  }
  return publisherFrom(profile, listingCreatedAt, feeSchedule);
}

/** Nombre d'annonces en ligne du même vendeur (« 3 annonces en ligne »). */
export async function fetchActiveCount(ownerId: string): Promise<number> {
  const { data, error } = await supabase.from('listings').select('id').eq('owner_id', ownerId).in('status', [...PUBLIC_STATUSES]);
  if (error) throw error;
  return (data ?? []).length;
}

export const activeCountLine = (count: number): string => (count === 1 ? '1 annonce en ligne' : `${count} annonces en ligne`);

/**
 * Annonces en ligne d'un particulier, les plus récentes d'abord (publicListings de l'app : la même requête). Le
 * profil d'une agence ne les lit pas : l'app demande ses biens sans agent (`agentUserId: nil`) et n'en reçoit aucun.
 */
export async function fetchPublicListings(ownerId: string): Promise<ListingRow[]> {
  const { data, error } = await supabase.from('listings').select(LISTING_COLUMNS).eq('owner_id', ownerId)
    .in('status', [...PUBLIC_STATUSES]).order('published_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as ListingRow[] | null) ?? [];
}
