import { describe, expect, it } from 'vitest';
import {
  C2, curveValue, LIT_TIMES, letterAt, logoAt, loopLayout, loopScale, loopTime, tileAt, WORDMARK_WIDTH,
} from './launchLoop';

// Mêmes cas que l'app (ImmoDomainTests/LaunchLoopTests.swift).
describe('lancement en boucle de la connexion (LaunchLoop de l’app)', () => {
  it('une seule horloge, sans décalage après plusieurs tours', () => {
    expect(loopTime(0)).toBe(0);
    expect(Math.abs(loopTime(9 * 50 + 1.45) - 1.45)).toBeLessThan(1e-9);
    expect(loopTime(-3)).toBe(0);
  });

  it('commence et finit vide', () => {
    expect(logoAt(0).opacity).toBe(0);
    expect(logoAt(8.8).opacity).toBe(0);
    for (let index = 0; index < 6; index += 1) {
      expect(letterAt(index, 0.5).opacity).toBe(0);
      expect(letterAt(index, 8.8).opacity).toBe(0);
    }
    for (let index = 0; index < 4; index += 1) {
      expect(tileAt(index, 0.5).opacity).toBe(0);
      expect(tileAt(index, 8.8).opacity).toBe(0);
    }
  });

  it('le lancement s’installe dans la ligne, puis le logo revient au centre et rétrécit à 87 %', () => {
    const logo = logoAt(1.3);
    expect(logo.opacity).toBe(1);
    expect(logo.toLine).toBe(1);
    expect(Math.abs(logo.scale - 1)).toBeLessThan(1e-9);
    expect(letterAt(5, 1.3).opacity).toBe(1);
    expect(Math.abs(letterAt(5, 1.3).offsetX)).toBe(0);
    const tile = tileAt(3, 1.42);
    expect(tile.opacity).toBe(1);
    expect(Math.abs(tile.side - 36)).toBeLessThan(0.01);
    expect(tile.lit).toBe(0);
    expect(logoAt(8.3).toLine).toBe(0);
    expect(Math.abs(logoAt(8.65).scale - 0.87)).toBeLessThan(1e-9);
  });

  it('les catégories s’allument une par une', () => {
    LIT_TIMES.forEach((on, index) => {
      const lit = tileAt(index, on + 0.9);
      expect(lit.lit).toBe(1);
      expect(Math.abs(lit.litScale - 1.1)).toBeLessThan(1e-9);
      expect(lit.nameOpacity).toBe(1);
      expect(lit.nameOffsetY).toBe(0);
      for (let other = 0; other < 4; other += 1) {
        if (other !== index) expect(tileAt(other, on + 0.9).lit).toBe(0);
      }
    });
    const off = tileAt(3, 7.2);
    expect(off.lit).toBe(0);
    expect(off.litScale).toBe(1);
    expect(off.nameOpacity).toBe(0);
  });

  it('C2 dépasse légèrement 1', () => {
    const values = Array.from({ length: 101 }, (_, step) => curveValue(C2, step / 100));
    expect(Math.max(...values)).toBeGreaterThan(1.01);
    expect(values[values.length - 1]).toBe(1);
  });

  it('une zone trop basse rétrécit le groupe', () => {
    expect(loopScale(300)).toBe(1);
    expect(loopScale(176)).toBe(1);
    expect(Math.abs(loopScale(104) - 0.5)).toBeLessThan(1e-9);
    expect(loopScale(20)).toBe(0);
  });

  it('place la ligne logo + nom au centre de la zone, les pavés à 50 l’un de l’autre', () => {
    const layout = loopLayout(390);
    const lineWidth = 32 * 1.7 + 10 * 1.7 + WORDMARK_WIDTH * 1.7;
    expect(layout.inLine.x - layout.lineLogo.width / 2).toBeCloseTo(195 - lineWidth / 2, 6);
    expect(layout.word.x + layout.wordSize.width / 2).toBeCloseTo(195 + lineWidth / 2, 6);
    expect(layout.alone).toEqual({ x: 195, y: 57 });
    expect(layout.tiles.map((tile) => tile.x)).toEqual([120, 170, 220, 270]);
    expect(layout.tiles[0].y).toBe(99);
    expect(layout.nameY).toBe(99 + 18 + 9 + 8);
  });
});
