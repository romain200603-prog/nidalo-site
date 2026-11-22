import { describe, expect, it } from 'vitest';
import { RetryClientIds } from './retry';

// Renvoi après un échec (RetryClientIds de l'app, n° 99) : le même contenu dans la même conversation reprend
// l'identifiant de l'envoi raté ; un autre contenu, une autre conversation ou un envoi réussi en prennent un nouveau.

const CONVERSATION = 'c1000000-0000-4000-8000-000000000001';
const OTHER_CONVERSATION = 'c2000000-0000-4000-8000-000000000002';

describe('identifiants des envois ratés', () => {
  it('repris pour le même contenu dans la même conversation, oubliés après un envoi réussi', () => {
    let counter = 0;
    const next = () => `id-${++counter}`;
    const ids = new RetryClientIds();
    const content = { text: { _0: 'Bonjour' } };
    const first = ids.id(CONVERSATION, content, next);
    expect(first).toBe('id-1');
    ids.failed(first, CONVERSATION, content);
    expect(ids.id(CONVERSATION.toUpperCase(), { text: { _0: 'Bonjour' } }, next)).toBe('id-1');
    expect(ids.id(OTHER_CONVERSATION, content, next)).toBe('id-2');
    expect(ids.id(CONVERSATION, { text: { _0: 'Bonjour !' } }, next)).toBe('id-3');
    ids.succeeded(CONVERSATION, content);
    expect(ids.id(CONVERSATION, content, next)).toBe('id-4');
  });
});
