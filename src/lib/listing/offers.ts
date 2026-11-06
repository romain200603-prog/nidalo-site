import { D } from '../investment/decimal';
import { supabase } from '../supabase';
import type { ListingConversation } from './conversation';

// Offres d'achat, comme l'app : ImmoDomain/Messaging/Offer.swift et OfferServer.swift, Data/OfferStore.swift,
// Data/Supabase/SupabaseOfferRepository.swift et la feuille « Faire une offre » (Features/Messages/OfferViews.swift).
// Le serveur applique les règles et écrit la bulle d'offre dans la conversation ; le site appelle make_offer et
// relit my_offers, comme l'app.

/** Colonnes de my_offers lues par la fiche (OfferServerRow). */
export type OfferRow = {
  id: string;
  conversation_id: string;
  listing_id: string | null;
  amount: number | string;
  status: string;
  created_at: string;
  expires_at: string | null;
};

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'countered' | 'expired';

const STATUSES: readonly OfferStatus[] = ['pending', 'accepted', 'rejected', 'withdrawn', 'countered', 'expired'];

/** Durées de validité proposées, en jours (Offer.validityOptions) ; 7 par défaut. */
export const OFFER_VALIDITY_OPTIONS = [3, 7, 14, 30] as const;
export const DEFAULT_OFFER_VALIDITY = 7;
/** Condition proposée en un toucher sous le champ des conditions. */
export const LOAN_CONDITION = 'Sous réserve d\'obtention du prêt';
/** Chiffres du montant au plus (GroupedNumberInput, maxIntegerDigits: 10). */
export const OFFER_AMOUNT_DIGITS = 10;

/** Statut enregistré ; un statut inconnu se lit « expirée » (OfferStatus(rawValue:) ?? .expired). */
export function offerStatus(raw: string): OfferStatus {
  return (STATUSES as readonly string[]).includes(raw) ? (raw as OfferStatus) : 'expired';
}

/** Une offre en attente dont la date limite est passée est expirée (effectiveStatus). */
export function effectiveStatus(offer: Pick<OfferRow, 'status' | 'expires_at'>, now: Date): OfferStatus {
  const status = offerStatus(offer.status);
  if (status === 'pending' && offer.expires_at) {
    const limit = new Date(offer.expires_at).getTime();
    if (!Number.isNaN(limit) && limit <= now.getTime()) return 'expired';
  }
  return status;
}

const sameId = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function offersIn(offers: OfferRow[], conversationId: string): OfferRow[] {
  return offers.filter((offer) => sameId(offer.conversation_id, conversationId));
}

/** « Offre acceptée » ou « Offre en attente » à la place du bouton (offerStateLabel, ListingDetailView.swift:389). */
export function offerStateLabel(offers: OfferRow[], conversation: ListingConversation | null, now: Date): string | null {
  if (!conversation) return null;
  const mine = offersIn(offers, conversation.id);
  if (mine.some((offer) => effectiveStatus(offer, now) === 'accepted')) return 'Offre acceptée';
  if (mine.some((offer) => effectiveStatus(offer, now) === 'pending')) return 'Offre en attente';
  return null;
}

/**
 * L'acheteur peut faire une offre dans cette conversation (OfferStore.canMakeOffer) : à deux, autour d'une vente,
 * côté acheteur, sans offre acceptée ni offre encore en attente.
 */
export function canMakeOffer(conversation: ListingConversation, offers: OfferRow[], now: Date): boolean {
  const negotiable = !conversation.isGroup && conversation.listingId !== null && conversation.transaction === 'sale';
  if (!negotiable || conversation.isSellerSide) return false;
  const mine = offersIn(offers, conversation.id);
  if (mine.some((offer) => offerStatus(offer.status) === 'accepted')) return false;
  return !mine.some((offer) => effectiveStatus(offer, now) === 'pending');
}

/** Date au format de l'app (`Date.ISO8601Format()`) : « 2026-11-13T09:00:00Z », sans millisecondes. */
export function isoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Date limite envoyée : rien pour 7 jours (le choix par défaut du serveur), sinon maintenant + la durée (expiry). */
export function offerExpiry(validityDays: number, now: Date): string | null {
  if (validityDays === DEFAULT_OFFER_VALIDITY) return null;
  return isoSeconds(new Date(now.getTime() + validityDays * 86_400_000));
}

/** Texte nettoyé : espaces retirés, `null` s'il est vide (OfferStore.clean). */
export function cleanText(text: string | null | undefined): string | null {
  const trimmed = (text ?? '').trim();
  return trimmed ? trimmed : null;
}

/** Arguments de make_offer, tels que l'app les envoie : les champs vides sont omis (Encodable de Swift). */
export type MakeOfferParams = {
  p_id: string;
  p_conversation_id: string;
  p_amount: number;
  p_conditions?: string;
  p_expires_at?: string;
};

export function makeOfferParams({ id, conversationId, amount, conditions, validityDays, now }: {
  id: string;
  conversationId: string;
  amount: number;
  conditions: string;
  validityDays: number;
  now: Date;
}): MakeOfferParams {
  const params: MakeOfferParams = { p_id: id, p_conversation_id: conversationId, p_amount: amount };
  const cleaned = cleanText(conditions);
  if (cleaned !== null) params.p_conditions = cleaned;
  const expiry = offerExpiry(validityDays, now);
  if (expiry !== null) params.p_expires_at = expiry;
  return params;
}

/** Chiffres saisis dans le montant (10 au plus), sans espaces ni lettres. */
export function amountDigits(text: string): string {
  return text.replace(/\D/g, '').slice(0, OFFER_AMOUNT_DIGITS);
}

/** « 228 000 » : chiffres groupés par milliers, espaces fines insécables (OfferComposerSheet.grouped). */
export function groupedAmount(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value);
}

const percent1 = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** « 4,2 % sous le prix affiché », « Au prix affiché », « 1,0 % au-dessus du prix affiché » (OfferFormatting.gapLabel). */
export function offerGapLabel(amount: number, price: number): string {
  const gap = D(amount).dividedBy(D(price)).minus(1).rounded(3);
  if (gap.eq(0)) return 'Au prix affiché';
  const text = percent1.format(gap.abs().toNumber());
  return gap.lt(0) ? `${text} sous le prix affiché` : `${text} au-dessus du prix affiché`;
}

/** Première lettre en minuscule (lowercasedFirst) : « Au prix affiché » devient « au prix affiché ». */
export function lowercasedFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Message de secours d'un refus du serveur sans message (OfferServerRow.message(forHint:)). */
export function offerHintMessage(hint: string | null | undefined): string {
  switch (hint) {
    case 'offer_not_found': return 'Cette offre n\'existe plus.';
    case 'offer_not_allowed': return 'Vous ne pouvez pas faire cette action sur cette offre.';
    case 'offer_listing_unavailable': return 'Cette annonce n\'est plus en vente.';
    case 'offer_already_accepted': return 'Une offre a déjà été acceptée dans cette conversation.';
    case 'offer_pending_exists': return 'Une offre attend déjà une réponse dans cette conversation.';
    case 'offer_expired': return 'Cette offre a expiré.';
    case 'offer_blocked': return 'Impossible : l\'un de vous a bloqué l\'autre.';
    case 'offer_rate_limited': return 'Trop d\'offres dans cette conversation.';
    case 'offer_id_conflict': return 'Cette offre existe déjà.';
    case 'offer_invalid_amount': return 'Indiquez un montant entre 1 000 € et 1 000 000 000 €.';
    case 'offer_invalid_expiry': return 'Date de validité invalide.';
    case 'offer_conditions_too_long': return 'Les conditions sont trop longues (1 000 caractères au plus).';
    case 'offer_invalid': return 'Offre invalide.';
    case 'offer_reason_too_long': return 'Le motif est trop long (300 caractères au plus).';
    default: return 'L\'offre n\'a pas pu être enregistrée. Réessayez dans un instant.';
  }
}

type ServerError = { code?: string; message?: string; hint?: string | null };

/**
 * Message affiché quand make_offer échoue (SupabaseOfferRepository.error, puis OfferStore.message(for:)) : session
 * expirée, refus du serveur (son message en français, sinon selon le hint), données refusées, sinon la connexion.
 */
export function offerErrorMessage(error: unknown): string {
  const { code, message, hint } = (error ?? {}) as ServerError;
  if (code === '28000') return 'Votre session a expiré : reconnectez-vous.';
  if (code === 'P0001') {
    const text = (message ?? '').trim();
    return text || offerHintMessage(hint);
  }
  if (code && ['23514', '23502', '22001', '22P02'].includes(code)) return 'Certaines informations n\'ont pas été acceptées. Vérifiez-les, puis réessayez.';
  return 'L\'offre n\'a pas pu être enregistrée. Vérifiez votre connexion et réessayez.';
}

/** Offres du compte (my_offers sans paramètre, refreshRemote). */
export async function fetchOffers(): Promise<OfferRow[]> {
  const { data, error } = await supabase.rpc('my_offers', {});
  if (error) throw error;
  return (data as OfferRow[] | null) ?? [];
}

/** Envoie l'offre (make_offer) ; le serveur rend l'offre enregistrée. Lève l'erreur du serveur telle quelle. */
export async function sendOffer(params: MakeOfferParams): Promise<OfferRow> {
  const { data, error } = await supabase.rpc('make_offer', params);
  if (error) throw error;
  const row = (data as OfferRow[] | null)?.[0];
  if (!row) throw new Error('make_offer: aucune offre rendue');
  return row;
}
