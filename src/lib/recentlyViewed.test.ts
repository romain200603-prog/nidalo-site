import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearHistory, recentlyViewedIds, recordView, removeFromHistory } from './recentlyViewed';

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const id = (n: number) => `6b0f6c1e-1d1a-4c55-9a51-${String(n).padStart(12, '0')}`;

afterEach(() => { vi.unstubAllGlobals(); });

describe('Consultés récemment (AccountStore.recordView)', () => {
  it('la dernière fiche ouverte passe en tête, sans doublon', () => {
    vi.stubGlobal('sessionStorage', fakeStorage());
    recordView(id(1));
    recordView(id(2));
    recordView(id(1));
    expect(recentlyViewedIds()).toEqual([id(1), id(2)]);
  });

  it('50 fiches au plus', () => {
    vi.stubGlobal('sessionStorage', fakeStorage());
    for (let n = 1; n <= 60; n += 1) recordView(id(n));
    const ids = recentlyViewedIds();
    expect(ids).toHaveLength(50);
    expect(ids[0]).toBe(id(60));
    expect(ids.at(-1)).toBe(id(11));
  });

  it('« Retirer de l’historique » et « Vider l’historique » (removeFromHistory, clearHistory)', () => {
    vi.stubGlobal('sessionStorage', fakeStorage());
    recordView(id(1));
    recordView(id(2));
    recordView(id(3));
    removeFromHistory(id(2));
    expect(recentlyViewedIds()).toEqual([id(3), id(1)]);
    removeFromHistory(id(9));
    expect(recentlyViewedIds()).toEqual([id(3), id(1)]);
    clearHistory();
    expect(recentlyViewedIds()).toEqual([]);
    recordView(id(4));
    expect(recentlyViewedIds()).toEqual([id(4)]);
  });

  it('stockage indisponible ou abîmé : liste vide, sans erreur', () => {
    expect(recentlyViewedIds()).toEqual([]);
    expect(() => recordView(id(1))).not.toThrow();
    const broken = fakeStorage();
    broken.setItem('nidalo.consultes', '{pas du json');
    vi.stubGlobal('sessionStorage', broken);
    expect(recentlyViewedIds()).toEqual([]);
    broken.setItem('nidalo.consultes', JSON.stringify([id(1), 3, id(1), null]));
    expect(recentlyViewedIds()).toEqual([id(1)]);
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); } });
    expect(recentlyViewedIds()).toEqual([]);
    expect(() => recordView(id(2))).not.toThrow();
    expect(() => removeFromHistory(id(2))).not.toThrow();
    expect(() => clearHistory()).not.toThrow();
  });
});
