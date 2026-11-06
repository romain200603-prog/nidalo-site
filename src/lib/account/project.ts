import { supabase } from '../supabase';
import { createStore, currentUserId, sessionStore } from './session';

// « Mon projet » (table real_estate_projects, une ligne par compte). Le site ne fait que le lire pour la carte de
// Mon compte : son éditeur arrive plus tard (ses critères gardent la forme exacte de l'app).

export type ProjectKind = 'buy' | 'rent' | 'invest' | 'hotel';
export type ProjectStep =
  | 'search' | 'analysis' | 'visits' | 'selection' | 'application' | 'audit' | 'offer' | 'financing' | 'lease' | 'signature' | 'moveIn';

export type ProjectRow = { id: string; kind: ProjectKind; city: string | null; purpose: string | null; completed_steps: ProjectStep[] | null };

/** Étapes de chaque parcours (ImmoDomain/Engagement/RealEstateProject.swift 11–18). */
export const PROJECT_STEPS: Record<ProjectKind, ProjectStep[]> = {
  buy: ['search', 'visits', 'selection', 'offer', 'signature'],
  rent: ['search', 'visits', 'application', 'lease', 'moveIn'],
  invest: ['search', 'analysis', 'visits', 'offer', 'financing', 'signature'],
  hotel: ['search', 'analysis', 'visits', 'audit', 'offer', 'signature'],
};

export const STEP_LABELS: Record<ProjectStep, string> = {
  search: 'Recherche',
  analysis: 'Analyse',
  visits: 'Visites',
  selection: 'Sélection',
  application: 'Dossier',
  audit: 'Audit',
  offer: 'Offre',
  financing: 'Financement',
  lease: 'Bail',
  signature: 'Signature',
  moveIn: 'Emménagement',
};

export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  buy: 'Résidentiel',
  rent: 'Location',
  invest: 'Investissement',
  hotel: 'Hôtel',
};

export type ProjectState = { status: 'none' | 'loading' | 'error' } | { status: 'ready'; project: ProjectRow | null };

export const projectStore = createStore<ProjectState>({ status: 'none' });

export async function loadProject(): Promise<void> {
  const session = sessionStore.get();
  if (session.status !== 'signedIn') {
    projectStore.set({ status: 'none' });
    return;
  }
  if (projectStore.get().status === 'none') projectStore.set({ status: 'loading' });
  const { data, error } = await supabase
    .from('real_estate_projects')
    .select('id, kind, city, purpose, completed_steps')
    .eq('user_id', session.userId)
    .limit(1);
  if (currentUserId() !== session.userId) return;
  if (error) {
    projectStore.set({ status: 'error' });
    return;
  }
  const row = (data?.[0] as ProjectRow | undefined) ?? null;
  const known = row && row.kind in PROJECT_STEPS ? row : null;
  projectStore.set({ status: 'ready', project: known });
}
