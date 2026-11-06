import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addToCompare, clearCompare, compareState, compareToast, removeFromCompare, setCompareReference, toggleCompare,
} from './compare';

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

describe('Comparaison (ComparisonStore)', () => {
  it('trois biens au plus, sans doublon, le premier en référence', () => {
    vi.stubGlobal('sessionStorage', fakeStorage());
    expect(addToCompare(id(1))).toBe('added');
    expect(addToCompare(id(1))).toBe('alreadyIn');
    expect(addToCompare(id(2))).toBe('added');
    expect(addToCompare(id(3))).toBe('added');
    expect(addToCompare(id(4))).toBe('full');
    expect(compareState()).toEqual({ ids: [id(1), id(2), id(3)], referenceId: id(1) });
  });

  it('retirer la référence la passe au premier qui reste ; toggle ajoute puis retire', () => {
    vi.stubGlobal('sessionStorage', fakeStorage());
    addToCompare(id(1));
    addToCompare(id(2));
    setCompareReference(id(2));
    expect(compareState().referenceId).toBe(id(2));
    removeFromCompare(id(2));
    expect(compareState()).toEqual({ ids: [id(1)], referenceId: id(1) });
    expect(toggleCompare(id(1))).toBeNull();
    expect(compareState()).toEqual({ ids: [], referenceId: null });
    expect(toggleCompare(id(5))).toBe('added');
    clearCompare();
    expect(compareState().ids).toEqual([]);
  });

  it('stockage indisponible ou abîmé : comparaison vide, sans erreur', () => {
    expect(compareState()).toEqual({ ids: [], referenceId: null });
    expect(() => addToCompare(id(1))).not.toThrow();
    const broken = fakeStorage();
    broken.setItem('nidalo.comparer', '{pas du json');
    vi.stubGlobal('sessionStorage', broken);
    expect(compareState().ids).toEqual([]);
    broken.setItem('nidalo.comparer', JSON.stringify({ ids: [id(1), id(1), 3, id(2), id(3), id(4)], referenceId: 'autre' }));
    expect(compareState()).toEqual({ ids: [id(1), id(2), id(3)], referenceId: id(1) });
  });

  it('textes du toast (CompareToast)', () => {
    expect(compareToast('added', 1)).toEqual({ text: 'Ajouté à la comparaison', action: 'Voir' });
    expect(compareToast('added', 2)).toEqual({ text: 'Ajouté à la comparaison (2 biens)', action: 'Voir' });
    expect(compareToast('full', 3)).toEqual({ text: '3 biens maximum, retirez-en un', action: 'Gérer' });
    expect(compareToast('alreadyIn', 2)).toBeNull();
    expect(compareToast(null, 0)).toEqual({ text: 'Retiré de la comparaison', action: null });
  });
});
