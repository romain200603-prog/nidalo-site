import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Serveur simulé : espaces de stockage, fonction delete_my_account et table listings, sans réseau. Chaque demande est
// notée, pour vérifier l'ordre de l'app (fichiers, puis ligne ou compte).
type Failure = 'network' | 'refused' | null;
const server = vi.hoisted(() => ({
  files: new Map<string, string[]>(),
  failList: new Map<string, 'network' | 'refused'>(),
  rpc: null as 'network' | 'refused' | null,
  rowDelete: null as 'network' | 'refused' | null,
  deletedRows: [] as unknown[],
  calls: [] as string[],
}));

function outcome(failure: Failure, data: unknown) {
  if (failure === 'network') return Promise.reject(new TypeError('Failed to fetch'));
  return Promise.resolve(failure === 'refused' ? { data: null, error: { message: 'refusé', code: '42501' } } : { data, error: null });
}

vi.mock('../supabase', () => ({
  AUTH_STORAGE_KEY: 'sb-test-auth-token',
  supabase: {
    storage: {
      from(bucket: string) {
        return {
          list(folder: string, options: { limit: number; offset: number }) {
            server.calls.push(`list ${bucket}/${folder}`);
            const children = new Map<string, string | null>();
            for (const path of server.files.get(bucket) ?? []) {
              if (!path.startsWith(`${folder}/`)) continue;
              const [name, ...rest] = path.slice(folder.length + 1).split('/');
              children.set(name, rest.length ? null : `fichier-${name}`);
            }
            const entries = [...children].map(([name, id]) => ({ name, id })).slice(options.offset, options.offset + options.limit);
            return outcome(server.failList.get(bucket) ?? null, entries);
          },
          remove(paths: string[]) {
            server.calls.push(`remove ${bucket} ${paths.length}`);
            server.files.set(bucket, (server.files.get(bucket) ?? []).filter((path) => !paths.includes(path)));
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    },
    rpc(name: string) {
      server.calls.push(`rpc ${name}`);
      return outcome(server.rpc, null);
    },
    from(table: string) {
      let action = 'select';
      const builder = {
        delete() { action = 'delete'; return builder; },
        select() { return builder; },
        eq() { return builder; },
        in() { return builder; },
        order() { return builder; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          server.calls.push(`${action} ${table}`);
          return (action === 'delete' ? outcome(server.rowDelete, server.deletedRows) : outcome(null, [])).then(resolve, reject);
        },
      };
      return builder;
    },
    auth: {
      onAuthStateChange: () => undefined,
      signOut: (options: { scope: string }) => {
        server.calls.push(`signOut ${options.scope}`);
        return Promise.resolve({ error: null });
      },
    },
  },
}));

const { sessionStore } = await import('./session');
const { deleteMyAccount, PARTIAL_DELETION_MESSAGE } = await import('./deleteAccount');
const { deleteListing, NOT_ALLOWED_MESSAGE, PHOTOS_GONE_MESSAGE } = await import('./myListings');
const { NETWORK_MESSAGE } = await import('./auth');
const { viewedListingsKey } = await import('../recentlyViewed');
const { recentPlacesKey } = await import('../recentPlaces');

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const CLAIRE = 'a0000000-0000-4000-8000-0000000000c1';
const LISTING = '6b0f6c1e-1d1a-4c55-9a51-000000000001';
let local: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  local = fakeStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', fakeStorage());
  vi.stubGlobal('window', { localStorage: local, addEventListener: () => undefined });
  server.files = new Map([
    ['listing-photos', [`${CLAIRE}/${LISTING}/1.jpg`, `${CLAIRE}/${LISTING}/2.jpg`]],
    ['avatars', [`${CLAIRE}/photo.jpg`]],
  ]);
  server.failList = new Map();
  server.rpc = null;
  server.rowDelete = null;
  server.deletedRows = [{ id: LISTING }];
  server.calls = [];
  sessionStore.set({ status: 'signedIn', session: { user: { id: CLAIRE } } as Session, userId: CLAIRE, email: 'claire@exemple.fr' });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('Supprimer mon compte : échec après l’effacement d’une partie des fichiers (n° 154)', () => {
  it('le texte de l’app', () => {
    expect(PARTIAL_DELETION_MESSAGE).toBe(
      'La suppression n\'a pas abouti : une partie de vos photos et de vos documents est peut-être déjà effacée. Vérifiez votre connexion, puis réessayez pour terminer.',
    );
  });

  it('rien d’effacé encore (photos d’annonces illisibles) : le message d’avant', async () => {
    server.failList.set('listing-photos', 'network');
    expect(await deleteMyAccount()).toBe(NETWORK_MESSAGE);
    server.failList.set('listing-photos', 'refused');
    expect(await deleteMyAccount()).toBe('La suppression n\'a pas abouti. Réessayez dans un instant.');
    expect(server.calls.some((call) => call.startsWith('remove') || call.startsWith('rpc'))).toBe(false);
  });

  it('photos d’annonces effacées puis un autre espace en échec, ou le compte refusé : le message le dit', async () => {
    server.failList.set('avatars', 'network');
    expect(await deleteMyAccount()).toBe(PARTIAL_DELETION_MESSAGE);
    expect(server.files.get('listing-photos')).toEqual([]);
    server.failList.clear();
    server.rpc = 'refused';
    expect(await deleteMyAccount()).toBe(PARTIAL_DELETION_MESSAGE);
    server.rpc = 'network';
    expect(await deleteMyAccount()).toBe(PARTIAL_DELETION_MESSAGE);
    expect(sessionStore.get().status).toBe('signedIn');
  });

  it('un nouvel essai termine : les fichiers d’abord, puis le compte, et ce navigateur oublie ses biens consultés et ses lieux (n° 114)', async () => {
    local.setItem(viewedListingsKey(CLAIRE), JSON.stringify([LISTING]));
    local.setItem(recentPlacesKey(CLAIRE), JSON.stringify({ items: [] }));
    local.setItem(viewedListingsKey('b0000000-0000-4000-8000-0000000000d2'), JSON.stringify([LISTING]));
    server.rpc = 'network';
    expect(await deleteMyAccount()).toBe(PARTIAL_DELETION_MESSAGE);
    expect(local.values.has(viewedListingsKey(CLAIRE))).toBe(true);
    server.rpc = null;
    server.calls = [];
    expect(await deleteMyAccount()).toBeNull();
    expect(server.calls.indexOf('rpc delete_my_account')).toBe(server.calls.length - 2);
    expect(server.calls.at(-1)).toBe('signOut local');
    expect(local.values.has(viewedListingsKey(CLAIRE))).toBe(false);
    expect(local.values.has(recentPlacesKey(CLAIRE))).toBe(false);
    expect(local.values.has(viewedListingsKey('b0000000-0000-4000-8000-0000000000d2'))).toBe(true);
  });
});

describe('Supprimer une annonce : échec après l’effacement de ses photos (n° 235)', () => {
  it('le texte de l’app', () => {
    expect(PHOTOS_GONE_MESSAGE).toBe(
      'La suppression n\'a pas abouti : les photos de l\'annonce sont déjà effacées. Vérifiez votre connexion, puis réessayez pour terminer.',
    );
  });

  it('photos illisibles : le message d’avant, l’annonce n’est pas touchée', async () => {
    server.failList.set('listing-photos', 'network');
    expect(await deleteListing(LISTING)).toBe(NETWORK_MESSAGE);
    server.failList.set('listing-photos', 'refused');
    expect(await deleteListing(LISTING)).toBe('L\'annonce n\'a pas pu être supprimée.');
    expect(server.calls).not.toContain('delete listings');
  });

  it('photos effacées, puis la ligne en échec (réseau ou refus) : le message le dit ; un nouvel essai termine', async () => {
    server.rowDelete = 'network';
    expect(await deleteListing(LISTING)).toBe(PHOTOS_GONE_MESSAGE);
    expect(server.files.get('listing-photos')).toEqual([]);
    server.rowDelete = 'refused';
    expect(await deleteListing(LISTING)).toBe(PHOTOS_GONE_MESSAGE);
    server.rowDelete = null;
    server.calls = [];
    expect(await deleteListing(LISTING)).toBeNull();
    expect(server.calls).toEqual([`list listing-photos/${CLAIRE}/${LISTING}`, 'delete listings', 'select listings']);
  });

  it('aucune ligne touchée (annonce d’un collègue) : le refus de l’équipe, comme avant', async () => {
    server.deletedRows = [];
    expect(await deleteListing(LISTING)).toBe(NOT_ALLOWED_MESSAGE);
  });
});
