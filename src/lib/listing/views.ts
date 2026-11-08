import { supabase } from '../supabase';

// Vues des annonces, pour les « Statistiques » de l'espace pro. À l'ouverture d'une fiche, le site ajoute 1 au compteur
// du jour de l'annonce (fonction record_listing_view), une seule fois par jour et par navigateur. Rien n'est gardé sur
// la personne ; le serveur ne compte ni le propriétaire ni une annonce hors ligne.

const KEY = 'nidalo.vues';

/** Jour de Paris d'une date : « 2026-11-08 ». */
export function parisDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Annonces déjà comptées aujourd'hui dans ce navigateur ; celles des jours d'avant sont oubliées. */
function countedToday(day: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value === day)) as Record<string, string>;
  } catch {
    return {};
  }
}

/** `true` si la vue doit partir au serveur (pas encore comptée aujourd'hui), et la note dans le navigateur. */
export function shouldCountView(id: string, now: Date = new Date()): boolean {
  const day = parisDay(now);
  const seen = countedToday(day);
  const key = id.toLowerCase();
  if (seen[key] === day) return false;
  seen[key] = day;
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // Stockage indisponible (navigation privée) : la vue est comptée à chaque ouverture.
  }
  return true;
}

/** Compte la vue d'une fiche ouverte. Sans réponse attendue : une erreur ne change rien à la page. */
export function countListingView(id: string): void {
  if (!shouldCountView(id)) return;
  void supabase.rpc('record_listing_view', { p_listing_id: id }).then(() => undefined, () => undefined);
}
