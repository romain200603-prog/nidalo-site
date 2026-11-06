import type { SearchMode } from './labels';
import { LISTING_COLUMNS, PUBLIC_STATUSES, UUID_PATTERN, type ListingRow } from './listings';
import { draftFromProject, projectCompletion } from './projectSearch';
import type { SearchDraft } from './search';
import { supabase } from './supabase';

// Lectures propres à l'accueil sur ordinateur (≥ 1024 px) : les sections « Consultés récemment » et « Biens
// similaires à vos recherches » de l'app (Features/Home/HomeView.swift 136–157). Le téléphone ne les fait jamais.

/** Nombre de fiches consultées affichées (HomeView.swift 136 : prefix(8)). */
export const VIEWED_LIMIT = 8;
/** Nombre de biens similaires (HomeView.loadFeed : limit 10). */
export const SIMILAR_LIMIT = 10;

/** Fiches consultées encore en ligne, dans l'ordre de consultation (la plus récente d'abord). */
export async function loadViewedListings(ids: string[]): Promise<ListingRow[]> {
  const wanted = ids.filter((id) => UUID_PATTERN.test(id));
  if (!wanted.length) return [];
  const { data, error } = await supabase.from('listings').select(LISTING_COLUMNS).in('id', wanted).in('status', [...PUBLIC_STATUSES]);
  if (error) throw error;
  const byId = new Map(((data ?? []) as unknown as ListingRow[]).map((row) => [row.id, row]));
  return wanted.flatMap((id) => byId.get(id) ?? []).slice(0, VIEWED_LIMIT);
}

const KINDS: SearchMode[] = ['buy', 'rent', 'invest', 'hotel'];

/**
 * Recherche réglée par le projet du compte, quand il a des critères (AppRouter.applyProject : completion > 0) ;
 * null sinon. Même table, même filtre et colonnes prises parmi celles que lit l'app (SupabaseAccountRepositories).
 */
export async function loadProjectSearch(userId: string): Promise<{ mode: SearchMode; draft: SearchDraft } | null> {
  const { data, error } = await supabase.from('real_estate_projects').select('kind, criteria').eq('user_id', userId).limit(1);
  if (error) throw error;
  const row = ((data ?? []) as { kind: unknown; criteria: unknown }[])[0];
  const mode = KINDS.find((kind) => kind === row?.kind);
  if (!row || !mode || projectCompletion(mode, row.criteria) <= 0) return null;
  return { mode, draft: draftFromProject(mode, row.criteria) };
}
