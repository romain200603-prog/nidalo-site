import { describe, expect, it } from 'vitest';
import { MONTH_BAR_GAP, MONTH_BAR_MINIMUM_WIDTH, MONTH_COLORS, MONTH_REMAINDER_COLOR, MonthBar } from './monthBar';

// Mêmes cas que MonthBarTests.swift de l'app.
describe('Barre du mois type', () => {
  /** Exemple de la maquette : 1 550 € de loyers, reste 131 €. */
  const mockup = new MonthBar(1550, [
    { id: 'loan', kind: 'loan', amount: 1267 },
    { id: 'nonRecoverableCharges', kind: 'nonRecoverableCharges', amount: 45 },
    { id: 'propertyTax', kind: 'propertyTax', amount: 70 },
    { id: 'landlordInsurance', kind: 'landlordInsurance', amount: 12 },
    { id: 'managementFees', kind: 'managementFees', amount: 25 },
  ]);
  const plain = (text: string) => text.replace(/[  ]/g, ' ');

  it('suit les lignes, puis le reste', () => {
    const segments = mockup.segments(300);
    expect(segments.map((segment) => segment.id)).toEqual(['loan', 'nonRecoverableCharges', 'propertyTax', 'landlordInsurance', 'managementFees', 'reste']);
    expect(segments.map((segment) => segment.role)).toEqual([{ expense: 'loan' }, { expense: 'nonRecoverableCharges' }, { expense: 'propertyTax' },
      { expense: 'landlordInsurance' }, { expense: 'managementFees' }, 'remainder']);
    expect(mockup.remainder.toNumber()).toBe(131);
    expect(mockup.isNegative).toBe(false);
  });

  it('largeurs proportionnelles qui remplissent la barre, 2 px entre les segments', () => {
    const segments = mockup.segments(1000);
    const available = 1000 - 5 * MONTH_BAR_GAP;
    expect(segments[0].width).toBeCloseTo((available * 1267) / 1550, 3);
    expect(segments[5].width).toBeCloseTo((available * 131) / 1550, 3);
    expect(segments[5].x + segments[5].width).toBeCloseTo(1000, 3);
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index].x).toBeCloseTo(segments[index - 1].x + segments[index - 1].width + MONTH_BAR_GAP, 3);
    }
  });

  it('une petite dépense garde 3 px', () => {
    const bar = new MonthBar(2000, [{ id: 'loan', kind: 'loan', amount: 1500 }, { id: 'landlordInsurance', kind: 'landlordInsurance', amount: 1 }]);
    const segments = bar.segments(200);
    expect(segments[1].width).toBe(MONTH_BAR_MINIMUM_WIDTH);
    expect(segments.every((segment) => segment.width >= MONTH_BAR_MINIMUM_WIDTH)).toBe(true);
    const total = segments.reduce((sum, segment) => sum + segment.width, 0) + MONTH_BAR_GAP * (segments.length - 1);
    expect(total).toBeCloseTo(200, 3);
    // Les autres se partagent le reste, toujours en proportion.
    expect(segments[0].width / segments[2].width).toBeCloseTo(1500 / 499, 3);
  });

  it('largeurs minimales quand la barre est trop courte', () => {
    expect(MonthBar.widths([10, 1, 1], 6, 3)).toEqual([2, 2, 2]);
    expect(MonthBar.widths([], 100, 3)).toEqual([]);
  });

  it('la taxe foncière refacturée n\'a pas de segment', () => {
    const bar = new MonthBar(800, [
      { id: 'loan', kind: 'loan', amount: 500 },
      { id: 'propertyTax', kind: 'propertyTax', amount: 0 },
      { id: 'maintenance', kind: 'maintenance', amount: 20 },
    ]);
    expect(bar.segments(100).map((segment) => segment.id)).toEqual(['loan', 'maintenance', 'reste']);
    expect(bar.segmentKind('maintenance')).toBe('maintenance');
    expect(bar.segmentKind('propertyTax')).toBeNull();
  });

  it('reste négatif : les dépenses, et le trait où s\'arrêtent les loyers', () => {
    const bar = new MonthBar(1000, [{ id: 'loan', kind: 'loan', amount: 1100 }, { id: 'propertyTax', kind: 'propertyTax', amount: 100 }]);
    expect(bar.isNegative).toBe(true);
    expect(bar.remainder.toNumber()).toBe(-200);
    const segments = bar.segments(302);
    expect(segments.map((segment) => segment.id)).toEqual(['loan', 'propertyTax']);
    expect(segments[1].x + segments[1].width).toBeCloseTo(302, 3);
    // 1 000 € tombent dans le crédit : 1 000 / 1 100 de sa largeur.
    expect(bar.incomeMarker(302)).toBeCloseTo((segments[0].width * 1000) / 1100, 3);
    expect(mockup.incomeMarker(300)).toBeNull();
  });

  it('trait dans un segment plus loin', () => {
    const bar = new MonthBar(150, [{ id: 'loan', kind: 'loan', amount: 100 }, { id: 'maintenance', kind: 'maintenance', amount: 100 }]);
    const segments = bar.segments(202);
    expect(bar.incomeMarker(202)).toBeCloseTo(segments[1].x + segments[1].width / 2, 3);
  });

  it('pas de segment de reste à zéro', () => {
    const bar = new MonthBar(100, [{ id: 'loan', kind: 'loan', amount: 100 }]);
    expect(bar.segments(50).map((segment) => segment.id)).toEqual(['loan']);
    expect(bar.isNegative).toBe(false);
    expect(bar.incomeMarker(50)).toBeNull();
  });

  it('texte lu', () => {
    expect(plain(mockup.spokenText(131))).toBe('Sur 1 550 € de loyers : crédit 1 267 €, charges 45 €, taxe foncière 70 €, assurance 12 €, gestion 25 €, reste 131 €');
    expect(plain(new MonthBar(1000, [{ id: 'loan', kind: 'loan', amount: 1200 }]).spokenText(-200))).toBe('Sur 1 000 € de loyers : crédit 1 200 €, effort d’épargne 200 €');
  });

  it('une couleur par sorte de ligne, quelle que soit sa place', () => {
    expect(MONTH_COLORS).toEqual({
      collectedRent: '#2F7A4E', loan: '#3C5CB0', nonRecoverableCharges: '#EB6834', propertyTax: '#1BAF7A',
      landlordInsurance: '#EDA100', managementFees: '#E87BA4', maintenance: '#6250D6',
    });
    expect(MONTH_REMAINDER_COLOR).toBe('#2F7A4E');
    expect(new Set(Object.values(MONTH_COLORS)).size).toBe(7);
    // Sans crédit (achat comptant), la taxe foncière garde sa couleur, même en premier segment.
    expect(new MonthBar(900, [{ id: 'propertyTax', kind: 'propertyTax', amount: 70 }]).segments(200)[0].role).toEqual({ expense: 'propertyTax' });
  });
});
