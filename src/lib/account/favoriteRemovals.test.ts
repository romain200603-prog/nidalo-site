import { describe, expect, it } from 'vitest';
import { FavoriteRemovals, UNDO_DURATION } from './favoriteRemovals';

// Mêmes cas que FavoriteRemovalsTests.swift de l'app.
describe('Favoris : retrait annulable', () => {
  const a = 'a';
  const b = 'b';
  const t0 = 1_000_000;
  const added = '2026-11-01T10:00:00.000Z';

  it('« Annuler » remet le favori sans rien envoyer', () => {
    const removals = new FavoriteRemovals();
    expect(removals.remove(a, added, t0)).toBeNull();
    const restored = removals.undo();
    expect(restored?.id).toBe(a);
    expect(restored?.addedAt).toBe(added);
    // Plus rien en attente : rien ne part à la fin des 4 s.
    expect(removals.expire(t0 + 10_000)).toBeNull();
  });

  it('part à la fin des 4 s', () => {
    const removals = new FavoriteRemovals();
    removals.remove(a, added, t0);
    expect(UNDO_DURATION).toBe(4000);
    expect(removals.expire(t0 + 3900)).toBeNull();
    expect(removals.expire(t0 + 4000)?.id).toBe(a);
    expect(removals.undo()).toBeNull();
  });

  it('part tout de suite quand la page est quittée ou cachée', () => {
    const removals = new FavoriteRemovals();
    removals.remove(a, added, t0);
    expect(removals.flush()?.id).toBe(a);
    expect(removals.undo()).toBeNull();
  });

  it('un second retrait rend le premier définitif', () => {
    const removals = new FavoriteRemovals();
    removals.remove(a, added, t0);
    const final = removals.remove(b, added, t0 + 1000);
    expect(final?.id).toBe(a);
    // « Annuler » ne remet que le dernier ; le message repart pour 4 s.
    expect(removals.pending?.deadline).toBe(t0 + 5000);
    expect(removals.undo()?.id).toBe(b);
  });

  it('retirer deux fois le même favori ne l\'envoie pas deux fois', () => {
    const removals = new FavoriteRemovals();
    removals.remove(a, added, t0);
    expect(removals.remove(a, added, t0 + 1000)).toBeNull();
    expect(removals.flush()?.id).toBe(a);
  });

  it('le favori remis garde sa place', () => {
    const c = 'c';
    const dates = new Map([[a, '2026-11-01T10:00:00.000Z'], [c, '2026-11-03T10:00:00.000Z']]);
    // b, ajouté entre a et c, revient entre a et c (tri « Ajout le plus récent » inchangé) ; aussi après un refus du serveur.
    expect(FavoriteRemovals.restoring(b, '2026-11-02T10:00:00.000Z', [a, c], dates)).toEqual([a, b, c]);
    expect(FavoriteRemovals.restoring(b, '2026-11-04T10:00:00.000Z', [a, c], dates)).toEqual([a, c, b]);
  });
});
