import { SUPABASE_URL } from '../config';
import { PUBLIC_STATUSES } from '../listings';
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
};

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
export function publisherFrom(profile: PublicProfileRow | null, listingCreatedAt: string): Publisher {
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
    };
  }
  const since = memberSince(profile?.member_since ?? listingCreatedAt);
  return {
    isProfessional: false, name: publicName(displayName), lines: since ? [since] : [],
    avatarUrl: avatarUrl(profile?.avatar_path ?? null), phone: null,
  };
}

export async function fetchPublisher(ownerId: string, listingCreatedAt: string): Promise<Publisher> {
  const { data, error } = await supabase.rpc('public_profiles', { user_ids: [ownerId] });
  if (error) throw error;
  const rows = (data as PublicProfileRow[] | null) ?? [];
  return publisherFrom(rows.find((r) => r.user_id === ownerId) ?? null, listingCreatedAt);
}

/** Nombre d'annonces en ligne du même vendeur (« 3 annonces en ligne »). */
export async function fetchActiveCount(ownerId: string): Promise<number> {
  const { data, error } = await supabase.from('listings').select('id').eq('owner_id', ownerId).in('status', [...PUBLIC_STATUSES]);
  if (error) throw error;
  return (data ?? []).length;
}

export const activeCountLine = (count: number): string => (count === 1 ? '1 annonce en ligne' : `${count} annonces en ligne`);
