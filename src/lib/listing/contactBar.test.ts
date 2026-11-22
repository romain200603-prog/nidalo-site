import { describe, expect, it } from 'vitest';
import {
  CONTACT_BAR_SCROLL, curveValue, dotHop, dotHopKeyframes, DUO_CURVES, duoLayout, nextContactBarScroll, scrollEdges,
} from './contactBar';

// Tests/ImmoDomainTests/ContactBarScrollTests.swift, puis les mesures et les points de ListingContactBar.swift.

function run(offsets: number[], top = 0, bottom = 10_000) {
  let state = CONTACT_BAR_SCROLL;
  for (const offset of offsets) state = nextContactBarScroll(state, offset, offset <= top, offset >= bottom);
  return state;
}

describe('Barre Duo : repli au défilement (ContactBarScroll)', () => {
  it('se replie après 12 px vers le bas', () => {
    expect(run([30, 35, 41]).isCollapsed).toBe(false);
    expect(run([30, 43]).isCollapsed).toBe(true);
  });

  it('ne bascule pas sur les petits mouvements', () => {
    // Repliée à 200, petits allers-retours de moins de 12 px : reste repliée.
    expect(run([0, 50, 200, 192, 199, 190, 195]).isCollapsed).toBe(true);
    // Remontée de 13 px depuis le point le plus bas : dépliée.
    expect(run([0, 50, 200, 210, 197]).isCollapsed).toBe(false);
  });

  it('dépliée en haut et tout en bas', () => {
    expect(run([0, 50, 200, 0]).isCollapsed).toBe(false);
    expect(run([0, 50, 200, 900], 0, 900).isCollapsed).toBe(false);
  });

  it('exactement 12 px ne suffisent pas', () => {
    expect(run([30, 42]).isCollapsed).toBe(false);
    expect(run([0, 50, 200, 188]).isCollapsed).toBe(true);
  });

  it('haut et bas de la page, à 1 px près', () => {
    expect(scrollEdges(0, 844, 3000)).toEqual({ atTop: true, atBottom: false });
    expect(scrollEdges(1, 844, 3000).atTop).toBe(true);
    expect(scrollEdges(2155, 844, 3000)).toEqual({ atTop: false, atBottom: true });
    expect(scrollEdges(2154, 844, 3000).atBottom).toBe(false);
    // Fiche plus courte que l'écran : toujours dépliée.
    expect(scrollEdges(0, 844, 600).atBottom).toBe(true);
  });
});

describe('Barre Duo : largeurs et titre', () => {
  it('« Appeler » 118 px, « Envoyer un message » le reste', () => {
    // iPhone 14 (390 px) : 350 px sans les marges de 20.
    expect(duoLayout(350, 88, 190)).toEqual({ callWidth: 118, messageWidth: 222, messageTitle: 'Envoyer un message' });
  });

  it('« Message » si le libellé n’a pas 14 px de chaque côté', () => {
    // iPhone SE (320 px) : 280 px.
    expect(duoLayout(280, 88, 190)).toEqual({ callWidth: 118, messageWidth: 152, messageTitle: 'Message' });
    expect(duoLayout(340, 88, 184).messageTitle).toBe('Envoyer un message');
    expect(duoLayout(340, 88, 184.5).messageTitle).toBe('Message');
  });

  it('« Appeler » s’élargit seulement si son libellé n’y tient pas', () => {
    expect(duoLayout(350, 95, 190).callWidth).toBe(123);
    expect(duoLayout(350, 90, 190).callWidth).toBe(118);
  });

  it('jamais plus étroit qu’un rond', () => {
    expect(duoLayout(100, 88, 190).messageWidth).toBe(56);
    expect(duoLayout(-5, 88, 190).messageWidth).toBe(56);
  });
});

describe('Barre Duo : courbes et points d’attente', () => {
  it('les courbes passent par leurs extrémités ; Balancier est symétrique', () => {
    for (const curve of Object.values(DUO_CURVES)) {
      expect(curveValue(curve, 0)).toBe(0);
      expect(curveValue(curve, 1)).toBe(1);
    }
    expect(curveValue(DUO_CURVES.swing, 0.5)).toBeCloseTo(0.5, 6);
    expect(curveValue(DUO_CURVES.swing, 0.25) + curveValue(DUO_CURVES.swing, 0.75)).toBeCloseTo(1, 6);
    // Ressort et Rebond dépassent un peu leur valeur finale.
    expect(curveValue(DUO_CURVES.bounce, 0.6)).toBeGreaterThan(1);
  });

  it('un saut de 2,2 px en 0,36 s, puis une pause jusqu’à 0,6 s', () => {
    expect(dotHop(0)).toBe(0);
    expect(dotHop(-0.1)).toBe(0);
    expect(dotHop(0.18)).toBeCloseTo(-2.2, 6);
    expect(dotHop(0.36)).toBe(0);
    expect(dotHop(0.5)).toBe(0);
    expect(dotHop(0.6 + 0.18)).toBeCloseTo(-2.2, 6);
    expect(dotHop(0.09)).toBeLessThan(0);
    expect(dotHop(0.09)).toBeGreaterThan(-2.2);
  });

  it('images clés du cycle : départ et fin au repos, sommet au milieu du saut', () => {
    const frames = dotHopKeyframes(18);
    expect(frames[0]).toEqual({ offset: 0, transform: 'translateY(0px)' });
    expect(frames[9]).toEqual({ offset: 0.3, transform: 'translateY(-2.2px)' });
    expect(frames[18]).toEqual({ offset: 0.6, transform: 'translateY(0px)' });
    expect(frames.at(-1)).toEqual({ offset: 1, transform: 'translateY(0px)' });
    expect(frames.every((frame, index) => index === 0 || frame.offset > frames[index - 1].offset)).toBe(true);
  });
});
