import { describe, expect, it } from 'vitest';
import { conversationPath, PATHS, searchModePath, visitRequestPath } from './paths';
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
