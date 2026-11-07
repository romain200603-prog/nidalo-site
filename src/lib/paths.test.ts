import { describe, expect, it } from 'vitest';
import {
  comparePath, conversationPath, listingPath, listingScreenFromParams, PATHS, searchModePath, videoVisitPath, visitRequestPath, wantsVideoVisit,
} from './paths';
import { defaultDraft, paramsFromDraft } from './search';
import type { SearchMode } from './labels';

describe('adresses de la barre du haut et des notifications', () => {
  it.each<SearchMode>(['buy', 'rent', 'invest', 'hotel'])('la catégorie « %s » ouvre la même recherche que le site', (mode) => {
    expect(searchModePath(mode)).toBe(`${PATHS.search}?${paramsFromDraft(defaultDraft(mode)).toString()}`);
  });

  it('conversation et demande de visite', () => {
    expect(conversationPath('c0000000-0000-4000-8000-000000000001')).toBe('/messages/?c=c0000000-0000-4000-8000-000000000001');
    expect(visitRequestPath('e0000000-0000-4000-8000-000000000001')).toBe('/compte/?vue=demande-visite&id=e0000000-0000-4000-8000-000000000001');
  });
});

describe('fiche d\'un bien sur ordinateur', () => {
  const id = '6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1a01';

  it('écrans de la fiche et comparaison', () => {
    expect(listingPath(id)).toBe(`/annonce/?id=${id}`);
    expect(listingPath(id, 'invest', 'offre')).toBe(`/annonce/?id=${id}&mode=invest&vue=offre`);
    expect(listingPath(id, 'buy', 'visite')).toBe(`/annonce/?id=${id}&vue=visite`);
    expect(listingScreenFromParams(new URLSearchParams('id=x&vue=visite'))).toBe('visite');
    expect(listingScreenFromParams(new URLSearchParams('id=x&vue=offre'))).toBe('offre');
    expect(listingScreenFromParams(new URLSearchParams('id=x&vue=autre'))).toBeNull();
    // « Vidéo » des Détails d'une conversation : le formulaire de visite sur « En visio ».
    expect(videoVisitPath(id)).toBe(`/annonce/?id=${id}&vue=visite&type=visio`);
    expect(listingScreenFromParams(new URL(videoVisitPath(id), 'https://nidalo.fr').searchParams)).toBe('visite');
    expect(wantsVideoVisit(new URL(videoVisitPath(id), 'https://nidalo.fr').searchParams)).toBe(true);
    expect(wantsVideoVisit(new URLSearchParams(`id=${id}&vue=visite`))).toBe(false);
    expect(comparePath()).toBe('/comparer/');
    expect(comparePath('invest')).toBe('/comparer/?mode=invest');
    expect(comparePath('rent')).toBe('/comparer/');
  });
});
