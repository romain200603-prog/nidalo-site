import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNearby, isNearbyLabel, keptCenter, nearbyPlace, savedLabel } from './nearby';
import { communeAt, reverseCommune, swiftNumber, type PlaceSuggestion } from './places';
import {
  clearRecentPlaces, readRecentPlaces, recentPlacesKey, recordPlace, recordRecentPlace, removeRecentPlaces,
} from './recentPlaces';

// Mêmes cas que l'app (Packages/ImmoKit/Tests/ImmoDomainTests/NearbySearchTests.swift), puis le stockage du site.
const lyon = { latitude: 45.764, longitude: 4.8357 };
const place = (name: string, id?: string, postalCode?: string): PlaceSuggestion =>
  ({ id: id ?? `id-${name}`, kind: 'municipality', name, ...(postalCode ? { postalCode } : {}) });

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('« Autour de moi » : comme l’app', () => {
  it('crée le lieu et ses libellés', () => {
    const nearby = nearbyPlace(lyon, ' Lyon ');
    expect(nearby.name).toBe('Autour de moi');
    expect(nearby.city).toBe('Lyon');
    expect(nearby.coordinate).toEqual(lyon);
    expect(isNearby(nearby)).toBe(true);
    expect(isNearby(place('Lyon'))).toBe(false);
    expect(isNearby(null)).toBe(false);
    expect(savedLabel('Annecy')).toBe('Autour de Annecy');
    expect(savedLabel('  ')).toBe('Autour de moi');
    expect(savedLabel(null)).toBe('Autour de moi');
    expect(isNearbyLabel('Autour de Lyon')).toBe(true);
    expect(isNearbyLabel('Lyon')).toBe(false);
    expect(isNearbyLabel(null)).toBe(false);
    expect(nearbyPlace(lyon, null).city).toBeUndefined();
  });

  it('garde les 5 derniers lieux, sans doublon, jamais « Autour de moi »', () => {
    let recents: PlaceSuggestion[] = [];
    for (const name of ['Lyon', 'Annecy', 'Annemasse', 'Thonon-les-Bains', 'Péron', 'Gex']) recents = recordPlace(recents, place(name));
    expect(recents.map((p) => p.name)).toEqual(['Gex', 'Péron', 'Thonon-les-Bains', 'Annemasse', 'Annecy']);
    // Choisi de nouveau : remonte en tête, une seule fois.
    recents = recordPlace(recents, place('Annemasse'));
    expect(recents.map((p) => p.name)).toEqual(['Annemasse', 'Gex', 'Péron', 'Thonon-les-Bains', 'Annecy']);
    // Même lieu sous un autre identifiant : pas de doublon.
    recents = recordPlace(recents, place('Gex', 'autre-gex'));
    expect(recents.map((p) => p.name)).toEqual(['Gex', 'Annemasse', 'Péron', 'Thonon-les-Bains', 'Annecy']);
    expect(recents[0].id).toBe('autre-gex');
    // « Autour de moi » n'est jamais gardé.
    recents = recordPlace(recents, nearbyPlace(lyon, 'Lyon'));
    expect(recents).toHaveLength(5);
    expect(recents[0].name).toBe('Gex');
    // Même nom mais autre code postal, ou arrondissement du même nom court : deux lieux.
    recents = recordPlace(recents, place('Gex', 'gex-2', '01170'));
    expect(recents.filter((p) => p.name === 'Gex')).toHaveLength(2);
    const district: PlaceSuggestion = { id: '69383', kind: 'district', name: 'Lyon 3e Arrondissement', postalCode: '69003' };
    const again: PlaceSuggestion = { id: 'autre', kind: 'district', name: 'Lyon 3e Arrondissement', postalCode: '69003' };
    expect(recordPlace(recordPlace([], district), again)).toEqual([again]);
  });

  it('lit la commune du géocodage inverse', () => {
    const json = {
      type: 'FeatureCollection', features: [{
        type: 'Feature', geometry: { type: 'Point', coordinates: [4.8357, 45.764] },
        properties: {
          label: '12 Rue de la République 69002 Lyon', name: '12 Rue de la République', type: 'housenumber', postcode: '69002',
          city: 'Lyon', citycode: '69382', context: '69, Rhône, Auvergne-Rhône-Alpes', id: '69382_1',
        },
      }],
    };
    expect(reverseCommune(json)).toBe('Lyon');
    expect(reverseCommune({ type: 'FeatureCollection', features: [] })).toBeNull();
  });
});

describe('« Autour de moi » : détails du site', () => {
  it('demande la commune à la Géoplateforme comme l’app, et reste sans commune si elle ne répond pas', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ type: 'FeatureCollection', features: [{ geometry: { coordinates: [4.84, 45.76] },
        properties: { label: 'Lyon 3e Arrondissement', name: 'Lyon 3e Arrondissement', type: 'municipality', id: '69383' } }] }), { status: 200 });
    });
    expect(await communeAt({ latitude: 45.7612345, longitude: 4.85 })).toBe('Lyon');
    expect(urls).toEqual(['https://data.geopf.fr/geocodage/reverse?index=address&lat=45.7612345&limit=1&lon=4.85']);
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 503 }));
    expect(await communeAt(lyon)).toBeNull();
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    expect(await communeAt(lyon)).toBeNull();
  });

  it('écrit les nombres comme Swift', () => {
    expect(swiftNumber(45.764)).toBe('45.764');
    expect(swiftNumber(45)).toBe('45.0');
    expect(swiftNumber(-0.5792)).toBe('-0.5792');
    expect(swiftNumber(0.000012)).toBe('1.2e-05');
    expect(swiftNumber(0)).toBe('0.0');
  });

  it('garde le point à une centaine de mètres', () => {
    expect(keptCenter({ latitude: 45.7612345, longitude: -0.5792345 })).toEqual({ latitude: 45.761, longitude: -0.579 });
  });

  it('garde une liste par compte et une sans compte, jamais mélangées, et l’efface avec le compte', () => {
    const storage = fakeStorage();
    vi.stubGlobal('window', { localStorage: storage, addEventListener: () => undefined });
    const account = 'A0000000-0000-4000-8000-0000000000C1';
    recordRecentPlace(place('Lyon'), account);
    recordRecentPlace(place('Annecy'), null);
    recordRecentPlace(nearbyPlace(lyon, 'Lyon'), null);
    expect(readRecentPlaces(account).map((p) => p.name)).toEqual(['Lyon']);
    expect(readRecentPlaces(null).map((p) => p.name)).toEqual(['Annecy']);
    expect([...storage.values.keys()].sort()).toEqual(['nidalo.lieux-recents.a0000000-0000-4000-8000-0000000000c1', 'nidalo.lieux-recents.sans-compte']);
    // Même forme que le fichier de l'app.
    expect(JSON.parse(storage.values.get(recentPlacesKey(null))!)).toEqual({ items: [{ id: 'id-Annecy', kind: 'municipality', name: 'Annecy' }] });
    clearRecentPlaces(null);
    expect(readRecentPlaces(null)).toEqual([]);
    removeRecentPlaces(account);
    expect(storage.values.has(recentPlacesKey(account))).toBe(false);
    // Données illisibles : liste vide, et les lignes illisibles sont écartées.
    storage.values.set(recentPlacesKey(null), '{"items":[{"id":"x","kind":"planete","name":"Mars"},{"id":"y","kind":"locality","name":"Croix-Rousse","coordinate":{"latitude":45.77,"longitude":4.83}}]}');
    expect(readRecentPlaces(null)).toEqual([{ id: 'y', kind: 'locality', name: 'Croix-Rousse', coordinate: { latitude: 45.77, longitude: 4.83 } }]);
    storage.values.set(recentPlacesKey(null), 'pas du JSON');
    expect(readRecentPlaces(null)).toEqual([]);
  });

  it('reste utilisable sans stockage', () => {
    const broken = {
      getItem: () => { throw new Error('bloqué'); },
      setItem: () => { throw new Error('bloqué'); },
      removeItem: () => { throw new Error('bloqué'); },
    };
    vi.stubGlobal('window', { localStorage: broken, addEventListener: () => undefined });
    expect(() => recordRecentPlace(place('Lyon'), null)).not.toThrow();
    expect(readRecentPlaces(null)).toEqual([]);
    expect(() => clearRecentPlaces(null)).not.toThrow();
    expect(() => removeRecentPlaces('a0000000-0000-4000-8000-0000000000c1')).not.toThrow();
  });
});
