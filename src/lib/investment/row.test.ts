import { describe, expect, it } from 'vitest';
import type { ListingRow } from '../listings';
import { hasWarning } from './domain';
import { FinancingSimulation } from './financingSimulation';
import {
  INVEST_SEARCH_OPTIONS, inputsFromRow, INVESTMENT_COLUMNS, investmentForRow, STANDARD_OPTIONS, type CardInvestment,
} from './row';

// Lignes de la table listings telles que PostgREST les renvoie. Valeurs attendues recalculées à la main (et avec le
// module decimal de Python) selon les formules de l'app.

/** Espaces insécables d'Intl remplacées par des espaces simples, pour lire les attentes. */
const plain = (text: string | null | undefined) => text?.replace(/[  ]/g, ' ') ?? null;

/** L'exemple : T2 de 48 m² vendu loué 1 400 €/mois, 180 € de charges, DPE D, autres colonnes nulles. */
function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '00000000-0000-4000-8000-000000000001', status: 'active', transaction: 'sale', property_type: 'apartment',
    price: 275000, monthly_charges: 180, annual_property_tax: null, works_amount: null, agency_fees_amount: null,
    previous_price: null, living_area: 48, land_area: null, rooms: 2, bedrooms: null, is_new_build: null,
    energy_class: 'D', climate_class: null, rental_info: { isLeased: true, currentMonthlyRent: 1400 }, asset_details: null,
    ...overrides,
  };
}

describe('investmentForRow : exemple du T2 vendu loué', () => {
  it('donne les indicateurs des cartes avec les hypothèses standard', () => {
    const investment = investmentForRow(row())!;
    expect(investment).not.toBeNull();
    // Rendement brut : 16 800 / 275 000 = 0,061090… → 0,0611 ; net : 12 418 / 295 625 = 0,042006… → 0,0420.
    // Cash-flow : 12 418 / 12 − 1 594,89 − 68,75 = −628,8066… → −628,81 €.
    expect(investment).toMatchObject({
      grossYield: 0.0611, netYield: 0.042, monthlyCashFlow: -628.81, isRentEstimated: false, isLeased: true,
      currentMonthlyRent: 1400, potentialMonthlyRent: null, annualRent: 16800, monthlyRentFromYield: 1400,
      leaseEndDate: null, isFurnished: null, tone: { yield: 'caution', cashFlow: 'negative' },
    });
    expect(Object.fromEntries(Object.entries(investment.text).map(([key, value]) => [key, plain(value)]))).toEqual({
      grossYield: '6,1 %', netYield: '4,2 %', monthlyCashFlow: '−629 €', currentRent: '1 400 €', potentialRent: null,
      annualRent: '16 800 €', monthlyRentFromYield: '1 400 €', leaseEnd: null,
    });
  });

  it('détaille le calcul comme le moteur de l’app', () => {
    const { result } = investmentForRow(row())!;
    const money = Object.fromEntries((['notaryFees', 'totalProjectCost', 'downPayment', 'loanAmount', 'monthlyLoanPayment',
      'monthlyLoanInsurance', 'annualGrossRent', 'annualCollectedRent', 'annualOperatingExpenses'] as const)
      .map((key) => [key, result[key].toString()]));
    expect(money).toEqual({
      notaryFees: '20625', totalProjectCost: '295625', downPayment: '20625', loanAmount: '275000', monthlyLoanPayment: '1594.89',
      monthlyLoanInsurance: '68.75', annualGrossRent: '16800', annualCollectedRent: '16128', annualOperatingExpenses: '3710',
    });
    // Taxe foncière absente : un mois de loyer ; part récupérable des charges inconnue : rien n'est refacturé.
    expect(result.warnings).toEqual([{ kind: 'propertyTaxEstimated' }, { kind: 'recoverableChargesUnknown' }]);
    expect(result.line('propertyTax')).toMatchObject({ origin: 'estimated' });
    expect(result.line('propertyTax')!.amount.eq(1400)).toBe(true);
  });

  it('recalcule avec l’apport de 50 000 € de la recherche Investir', () => {
    const investment = investmentForRow(row(), INVEST_SEARCH_OPTIONS)!;
    // Prêt 295 625 − 50 000 = 245 625 € : 1 424,53 € + 61,41 € d'assurance ; 1 034,83 − 1 485,94 = −451,11 €.
    expect(investment).toMatchObject({ grossYield: 0.0611, netYield: 0.042, monthlyCashFlow: -451.11 });
    expect(plain(investment.text.monthlyCashFlow)).toBe('−451 €');
    expect(investment.result.loanAmount.toString()).toBe('245625');
    expect(investment.result.monthlyLoanPayment.toString()).toBe('1424.53');
    expect(investment.result.monthlyLoanInsurance.toString()).toBe('61.41');
    expect(investmentForRow(row(), { downPayment: null })).toEqual(investmentForRow(row()));
    expect(investmentForRow(row(), STANDARD_OPTIONS)).toEqual(investmentForRow(row()));
  });

  it('applique la durée et le taux choisis comme la simulation de financement', () => {
    const investment = investmentForRow(row(), { loanAnnualRate: 0.03, loanDurationMonths: 300 })!;
    const simulated = new FinancingSimulation(0, 25, '0.03').result(inputsFromRow(row())!);
    expect(investment.result).toEqual(simulated);
    expect(investment.monthlyCashFlow).toBe(simulated.monthlyCashFlow.toNumber());
  });
});

describe('investmentForRow : quand l’app n’affiche rien', () => {
  it.each([
    ['une location', { transaction: 'rent', price: 850 }],
    ['une vente sans informations locatives', { rental_info: null }],
    ['une vente sans loyer déclaré', { rental_info: { isLeased: false } }],
    ['un prix nul', { price: 0 }],
    ['un type de bien inconnu', { property_type: 'castle' }],
    ['une transaction inconnue', { transaction: 'auction' }],
    // Lignes que le JSONDecoder de l'app refuse :
    ['un prix absent', { price: null }],
    ['un prix illisible', { price: 'abc' }],
    ['rental_info sans isLeased', { rental_info: { currentMonthlyRent: 1400 } }],
    ['un loyer en texte', { rental_info: { isLeased: true, currentMonthlyRent: '1400' } }],
    ['isLeased en texte', { rental_info: { isLeased: 'true', currentMonthlyRent: 1400 } }],
    ['rental_info qui n’est pas un objet', { rental_info: [1400] }],
    ['is_new_build en texte', { is_new_build: 'yes' }],
    ['une classe énergie qui n’est pas un texte', { energy_class: 4 }],
  ])('%s', (_label, overrides) => {
    expect(investmentForRow(row(overrides))).toBeNull();
  });
});

describe('investmentForRow : lecture des colonnes', () => {
  it('prend un loyer potentiel quand le bien n’est pas loué', () => {
    const investment = investmentForRow(row({ rental_info: { isLeased: false, potentialMonthlyRent: 1100 } }))!;
    expect(investment).toMatchObject({ grossYield: 0.048, isLeased: false, currentMonthlyRent: null, potentialMonthlyRent: 1100, annualRent: null });
    expect(plain(investment.text.potentialRent)).toBe('1 100 €');
    expect(investment.text.currentRent).toBeNull();
    expect(hasWarning(investment.result, 'rentIsPotential')).toBe(true);
  });

  it('lit les montants envoyés en texte comme les nombres JSON', () => {
    const fromText = investmentForRow(row({ price: '275000.00', monthly_charges: '180.00' }));
    expect(fromText).toEqual(investmentForRow(row()));
  });

  it('applique les frais de notaire du neuf et les charges récupérables', () => {
    const newBuild = investmentForRow(row({ is_new_build: true }))!;
    expect(newBuild.result.notaryFees.toString()).toBe('6875');
    expect(newBuild.netYield).toBe(0.0441); // 12 418 / 281 875
    const recoverable = investmentForRow(row({ rental_info: { isLeased: true, currentMonthlyRent: 1400, recoverableMonthlyCharges: 60 } }))!;
    expect(recoverable.result.annualOperatingExpenses.toString()).toBe('2990'); // (180 − 60) × 12 + 1 400 + 150
    expect(hasWarning(recoverable.result, 'recoverableChargesUnknown')).toBe(false);
  });

  it('lit la classe énergie comme EnergyClass(rawValue:)', () => {
    const banned = investmentForRow(row({ energy_class: 'G' }))!;
    expect(hasWarning(banned.result, { kind: 'energyRentalRestriction', energyClass: 'G', year: 2025 })).toBe(true);
    const lowercase = investmentForRow(row({ energy_class: 'g' }))!;
    expect(hasWarning(lowercase.result, 'energyRentalRestriction')).toBe(false);
    expect(lowercase.grossYield).toBe(banned.grossYield);
  });

  it('lit la fin de bail écrite par l’app (UTC sans fuseau) et l’affiche dans le fuseau choisi', () => {
    const rental = { isLeased: true, currentMonthlyRent: 1400, leaseEndDate: '2027-06-30T22:00:00.000', isFurnished: true };
    const paris = investmentForRow(row({ rental_info: rental }), { timeZone: 'Europe/Paris' })!;
    expect(paris.leaseEndDate?.toISOString()).toBe('2027-06-30T22:00:00.000Z');
    expect(paris.text.leaseEnd).toBe('juillet 2027');
    expect(paris.isFurnished).toBe(true);
    expect(investmentForRow(row({ rental_info: rental }), { timeZone: 'UTC' })!.text.leaseEnd).toBe('juin 2027');
    // Date illisible : ignorée, les montants restent.
    const unreadable = investmentForRow(row({ rental_info: { ...rental, leaseEndDate: 'bientôt' } }))!;
    expect(unreadable.leaseEndDate).toBeNull();
    expect(unreadable.monthlyCashFlow).toBe(-628.81);
  });

  it('liste les colonnes à ajouter au select', () => {
    expect(INVESTMENT_COLUMNS.join(',')).toBe(
      'transaction,property_type,price,monthly_charges,annual_property_tax,works_amount,is_new_build,energy_class,rental_info');
  });

  it('accepte une ligne du site (ListingRow) telle quelle', () => {
    const forListing: (listing: ListingRow) => CardInvestment | null = investmentForRow;
    expect(forListing).toBe(investmentForRow);
  });
});
