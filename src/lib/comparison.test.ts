import { describe, expect, it } from 'vitest';
import {
  compareListings, comparisonItem, criterionValue, deltaText, estimatedMonthlyPayment, noteText, valueText,
} from './comparison';
import { testRow } from './testRows';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const apartment = testRow({ id: id(1), price: 250000, living_area: 62, monthly_charges: 120, energy_class: 'D' });
const larger = testRow({ id: id(2), price: 240000, living_area: 70, rooms: 4, monthly_charges: 300, energy_class: 'C', annual_property_tax: null });
const rental = testRow({
  id: id(3), transaction: 'rent', price: 850, living_area: 40, monthly_charges: 60, energy_class: 'G',
  rental_info: { isLeased: false, isFurnished: true, availableFrom: '2026-12-05T00:00:00Z' },
});
const leased = testRow({
  id: id(4), price: 180000, living_area: 45, energy_class: 'F', works_amount: 8000,
  rental_info: { isLeased: true, currentMonthlyRent: 700 },
});

describe('Comparaison des biens (ListingComparison)', () => {
  it('deux achats : critères de l\'achat, lignes sans donnée omises, écarts au bien de référence', () => {
    const comparison = compareListings([comparisonItem(apartment, null), comparisonItem(larger, null)], 0);
    expect(comparison.kind).toBe('purchase');
    expect(comparison.isMixed).toBe(false);
    expect(comparison.rows.map((row) => row.criterion)).toEqual([
      'price', 'livingArea', 'pricePerSquareMeter', 'rooms', 'bedrooms', 'energyClass', 'annualPropertyTax', 'monthlyCharges', 'estimatedMonthlyPayment',
    ]);
    const price = comparison.rows[0];
    expect(price.deltas).toEqual([null, { difference: -10000, assessment: 'favorable' }]);
    const area = comparison.rows[1];
    expect(area.deltas[1]).toEqual({ difference: 8, assessment: 'neutral' });
    const energy = comparison.rows.find((row) => row.criterion === 'energyClass')!;
    expect(energy.deltas[1]).toEqual({ difference: -1, assessment: 'favorable' });
    const tax = comparison.rows.find((row) => row.criterion === 'annualPropertyTax')!;
    expect(tax.values[1]).toBeNull();
    expect(tax.deltas[1]).toBeNull();
    expect(criterionValue('pricePerSquareMeter', comparison.items[0])).toEqual({ kind: 'amount', value: 4032 });
  });

  it('analyse : seul en tête, au moins deux valeurs, et charges élevées au-delà de 3,5 €/m²', () => {
    const comparison = compareListings([comparisonItem(apartment, null), comparisonItem(larger, null)]);
    expect(comparison.analyses[0]).toEqual({ strengths: [], warnings: [] });
    expect(comparison.analyses[1].strengths.map((note) => note.kind)).toEqual(['lowestPrice', 'lowestPricePerSquareMeter', 'largestArea', 'bestEnergyClass']);
    expect(comparison.analyses[1].warnings).toEqual([{ kind: 'highCharges', value: 300 }]);
  });

  it('vente et location : biens de natures différentes, critères communs seulement', () => {
    const comparison = compareListings([comparisonItem(apartment, null), comparisonItem(rental, null)]);
    expect(comparison.isMixed).toBe(true);
    expect(comparison.rows.map((row) => row.criterion)).toEqual(['price', 'livingArea', 'pricePerSquareMeter', 'rooms', 'energyClass']);
    expect(comparison.rows[0].values[1]).toBeNull();
  });

  it('achat et investissement se comparent en investissement', () => {
    const comparison = compareListings([comparisonItem(apartment, null), comparisonItem(leased, null)]);
    expect(comparison.isMixed).toBe(false);
    expect(comparison.kind).toBe('investment');
    const criteria = comparison.rows.map((row) => row.criterion);
    expect(criteria).toContain('currentMonthlyRent');
    expect(criteria).toContain('grossYield');
    expect(criteria).not.toContain('potentialMonthlyRent');
    expect(comparison.rows.find((row) => row.criterion === 'annualRent')!.values[1]).toEqual({ kind: 'amount', value: 8400 });
    expect(comparison.analyses[0].warnings).toEqual([{ kind: 'missingRent' }]);
    const leasedWarnings = comparison.analyses[1].warnings.map((note) => note.kind);
    expect(leasedWarnings).toContain('worksPlanned');
    expect(leasedWarnings).toContain('rentalBan');
    expect(leasedWarnings).toContain('rentFreeze');
  });

  it('location : DPE G, location interdite et loyer gelé', () => {
    const other = testRow({ id: id(5), transaction: 'rent', price: 900, living_area: 38, monthly_charges: 40, energy_class: 'C', rental_info: { isLeased: false } });
    const comparison = compareListings([comparisonItem(rental, null), comparisonItem(other, null)]);
    expect(comparison.kind).toBe('rental');
    expect(comparison.rows.map((row) => row.criterion)).toEqual(['monthlyRent', 'monthlyCharges', 'livingArea', 'rooms', 'energyClass', 'furnished', 'availableFrom']);
    expect(comparison.analyses[0].strengths.map((note) => note.kind)).toEqual(['lowestPrice', 'largestArea']);
    expect(comparison.analyses[0].warnings).toEqual([{ kind: 'rentalBan', letter: 'G', year: 2025 }, { kind: 'rentFreeze', letter: 'G' }]);
  });

  it('mensualité estimée : 10 % d\'apport, 25 ans, assurance comprise, à l\'euro', () => {
    expect(estimatedMonthlyPayment(250000)).toBe(1183);
    expect(comparisonItem(testRow({ property_type: 'hotel' }), null).estimatedMonthlyPayment).toBeNull();
    expect(comparisonItem(rental, null).estimatedMonthlyPayment).toBeNull();
  });
});

describe('Libellés et formats (CompareFormatting)', () => {
  const now = new Date('2026-11-06T10:00:00Z');

  it('valeurs', () => {
    expect(valueText({ kind: 'amount', value: 850 }, 'monthlyRent', now)).toBe('850 €/mois');
    expect(valueText({ kind: 'amount', value: -629.4 }, 'estimatedCashFlow', now)).toBe('−629 €/mois');
    expect(valueText({ kind: 'amount', value: 900 }, 'annualPropertyTax', now)).toBe('900 €/an');
    expect(valueText({ kind: 'amount', value: 4032 }, 'pricePerSquareMeter', now)).toBe('4 032 €/m²');
    expect(valueText({ kind: 'ratio', value: 0.0467 }, 'grossYield', now)).toBe('4,7 %');
    expect(valueText({ kind: 'area', value: 62 }, 'livingArea', now)).toBe('62 m²');
    expect(valueText({ kind: 'flag', value: true }, 'furnished', now)).toBe('Oui');
    expect(valueText({ kind: 'date', value: new Date('2026-11-01T00:00:00Z') }, 'availableFrom', now)).toBe('Immédiate');
    expect(valueText({ kind: 'date', value: new Date('2026-12-05T12:00:00Z') }, 'availableFrom', now)).toBe('5 déc.');
    expect(valueText({ kind: 'tenancy', isLeased: true }, 'tenancy', now)).toBe('Loué');
  });

  it('écarts', () => {
    expect(deltaText(-10000, 'price')).toBe('− 10 000 €');
    expect(deltaText(0.007, 'grossYield')).toBe('+ 0,7 % pt');
    expect(deltaText(8, 'livingArea')).toBe('+ 8 m²');
    expect(deltaText(-2, 'energyClass')).toBe('− 2 classes');
    expect(deltaText(1, 'energyClass')).toBe('+ 1 classe');
    expect(deltaText(0, 'rooms')).toBe('0');
    expect(deltaText(120.6, 'estimatedCashFlow')).toBe('+ 121 €/mois');
    expect(deltaText(50, 'monthlyCharges')).toBe('+ 50 €/mois');
  });

  it('notes', () => {
    expect(noteText({ kind: 'rentalBan', letter: 'G', year: 2025 }, 2026)).toBe('DPE G : location interdite pour un nouveau bail depuis 2025');
    expect(noteText({ kind: 'rentalBan', letter: 'F', year: 2028 }, 2026)).toBe('DPE F : location interdite pour un nouveau bail en 2028');
    expect(noteText({ kind: 'negativeCashFlow', value: -85.5 }, 2026)).toBe('Cash-flow estimé négatif (−86 €/mois)');
    expect(noteText({ kind: 'highCharges', value: 300 }, 2026)).toBe('Charges élevées (300 €/mois)');
    expect(noteText({ kind: 'worksPlanned', value: 8000 }, 2026)).toBe('Travaux à prévoir (8 000 €)');
  });
});
