import {
  D, FinancingSimulation, formatPercent, inputsFromRow, InvestmentCalculator, listingFromRow, listingInvestment, MonthlyBreakdown,
  sourced, STANDARD_ASSUMPTIONS, type Decimal, type InvestmentInputs, type InvestmentResult, type InvestmentWarning,
  type MonthlyBreakdownKind, type ValueOrigin,
} from '../investment';
import { formatPrice } from '../format';
import type { ListingRow } from '../listings';
import { cardEuros, euros, signedCents, thin } from './money';

// Carte « Rentabilité » d'une vente avec un loyer, comme l'app (ListingProfitabilityCard, ListingTopCards.swift
// 250–373) : le moteur de rentabilité (lib/investment) avec les trois choix de « Ajuster le financement ». Les textes
// sont ceux de l'app, arrondis comme elle (Formatters.percent : formatPercent du moteur ; montants : money.ts).

export type ProfitabilityBadge = 'simulation' | 'estimated';

/** Ce qu'affiche la carte, déjà mis en forme (ProfitabilityDisplay). */
export type ProfitabilityView = {
  source: string;
  grossYield: string;
  grossDetail: string;
  netYield: string;
  /** Cash-flow mensuel exact (négatif : effort d'épargne). */
  cashFlow: Decimal;
  /** « −474,01 € » : au centime, espaces insécables (comme la carte de l'app). */
  cashFlowText: string;
  financing: string;
  /** Montants mensuels signés et exacts (+ entrée, − sortie), arrondis seulement à l'affichage. */
  rows: { id: MonthlyBreakdownKind; label: string; badge: ProfitabilityBadge | null; info: string | null; amount: Decimal }[];
  /** Plus grand montant, en valeur absolue : la barre la plus longue. */
  largestAmount: Decimal;
  notes: string[];
  monthlyPayment: Decimal;
};

/** Choix de « Ajuster le financement ». */
export type FinancingChoice = { downPaymentShare: number; years: number; annualRate: number };
export type FinancingOptions = { downPaymentShares: readonly number[]; years: readonly number[]; annualRates: readonly number[] };

export const FINANCING_OPTIONS: FinancingOptions = {
  downPaymentShares: FinancingSimulation.downPaymentOptions.map((d) => d.toNumber()),
  years: [...FinancingSimulation.durationOptions],
  annualRates: FinancingSimulation.rateOptions.map((r) => r.toNumber()),
};

/** Choix par défaut : les hypothèses standard (sans compte, pas d'apport de projet). */
export const STANDARD_CHOICE: FinancingChoice = {
  downPaymentShare: FinancingSimulation.standard.downPaymentShare.toNumber(),
  years: FinancingSimulation.standard.years,
  annualRate: FinancingSimulation.standard.annualRate.toNumber(),
};

export type Profitability = { inputs: InvestmentInputs; isRentCurrent: boolean };

/**
 * Entrées du simulateur, seulement quand l'app montre la carte : vente avec un loyer déclaré (actuel ou potentiel)
 * dont l'analyse standard aboutit (ListingDetailViewModel.load, puis ListingDetailView 72–76).
 */
export function profitabilityFor(row: ListingRow): Profitability | null {
  try {
    const decoded = listingFromRow(row);
    if (!decoded || !listingInvestment(decoded.listing, decoded.property)) return null;
    const inputs = inputsFromRow(row);
    if (!inputs) return null;
    return { inputs, isRentCurrent: decoded.listing.rentalInfo?.currentMonthlyRent != null };
  } catch {
    // Comme `try?` dans l'app : sans analyse, pas de carte.
    return null;
  }
}

/** Valeur exacte du moteur pour un choix affiché (pas de reste binaire : 0,035 et non 0,035000000000000003). */
function option(options: readonly Decimal[], value: number): Decimal {
  return options.find((o) => o.toNumber() === value) ?? D(String(value));
}

const LABELS: Record<MonthlyBreakdownKind, string> = {
  collectedRent: 'Loyer encaissé',
  loan: 'Crédit et assurance',
  nonRecoverableCharges: 'Charges non récupérables',
  propertyTax: 'Taxe foncière',
  landlordInsurance: 'Assurance propriétaire',
  managementFees: 'Gestion locative',
  maintenance: 'Entretien',
};

/** Points d'attention (DomainLabels.swift 95–112). */
function warningMessage(warning: InvestmentWarning): string {
  switch (warning.kind) {
    case 'rentIsPotential': return 'Loyer potentiel indiqué par le vendeur : le bien n\'est pas loué actuellement.';
    case 'rentEstimated': return 'Loyer estimé par l\'application, à vérifier.';
    case 'propertyTaxEstimated': return 'Taxe foncière non renseignée : estimation utilisée.';
    case 'coOwnershipChargesMissing': return 'Charges de copropriété non renseignées.';
    case 'recoverableChargesUnknown': return 'Part des charges récupérable sur le locataire inconnue : calcul prudent.';
    case 'energyRentalRestriction':
      return `DPE ${warning.energyClass} : location interdite pour les nouveaux baux à partir de ${warning.year}, sauf travaux.`;
  }
}

function notes(result: InvestmentResult): string[] {
  return result.warnings.flatMap((warning) => {
    switch (warning.kind) {
      case 'rentIsPotential': {
        const rent = result.line('monthlyRent');
        return [`Le bien n'est pas loué actuellement : le loyer de ${rent ? cardEuros(rent.amount) : ''}/\u200Bmois est indiqué par le vendeur.`];
      }
      case 'rentEstimated':
      case 'propertyTaxEstimated':
        return [];
      default:
        return [warningMessage(warning)];
    }
  });
}

/** Carte pour ce choix de financement ; `null` si le moteur refuse le calcul (la carte ne s'affiche pas). */
export function profitabilityView({ inputs, isRentCurrent }: Profitability, choice: FinancingChoice): ProfitabilityView | null {
  const simulation = new FinancingSimulation(
    option(FinancingSimulation.downPaymentOptions, choice.downPaymentShare),
    choice.years,
    option(FinancingSimulation.rateOptions, choice.annualRate),
  );
  let result: InvestmentResult;
  try {
    result = simulation.result(inputs);
  } catch {
    return null;
  }
  const breakdown = new MonthlyBreakdown(result);
  const perYear = (kind: 'propertyTax' | 'landlordInsurance') => {
    const line = result.line(kind);
    return line ? `${euros(line.amount)}/an` : null;
  };
  const info = (kind: MonthlyBreakdownKind): string | null => {
    switch (kind) {
      case 'collectedRent': return `${formatPercent(STANDARD_ASSUMPTIONS.vacancyRate, 0)} de vacance`;
      case 'propertyTax': return perYear('propertyTax');
      case 'landlordInsurance': return perYear('landlordInsurance');
      default: return null;
    }
  };
  const source = result.line('monthlyRent')?.origin === 'estimated'
    ? 'Estimée à partir d\'un loyer estimé par Nidalo'
    : isRentCurrent ? 'Estimée à partir du loyer actuel indiqué par le vendeur' : 'Estimée à partir du loyer indiqué par le vendeur';
  const rows = breakdown.entries.map((entry) => ({
    id: entry.kind,
    label: entry.kind === 'collectedRent' && !isRentCurrent ? 'Loyer potentiel encaissé' : LABELS[entry.kind],
    badge: entry.kind === 'loan' ? 'simulation' as const : entry.origin === 'estimated' ? 'estimated' as const : null,
    info: info(entry.kind),
    amount: entry.amount,
  }));
  return {
    source,
    grossYield: formatPercent(result.grossYield),
    grossDetail: `${euros(result.annualGrossRent)} / ${euros(result.purchasePrice)}`,
    netYield: formatPercent(result.netYield),
    cashFlow: result.monthlyCashFlow,
    cashFlowText: thin(signedCents(result.monthlyCashFlow)),
    financing: `Financement ${formatPercent(D(1).minus(simulation.downPaymentShare), 0)} · ${simulation.years} ans · ${formatPercent(simulation.annualRate)}`,
    rows,
    largestAmount: rows.reduce((max, row) => (row.amount.abs().gt(max) ? row.amount.abs() : max), D(0)),
    notes: notes(result),
    monthlyPayment: breakdown.monthlyPayment,
  };
}

// MARK: « Faire une offre »

/** Rentabilité sous « Montant proposé » : le rendement brut et le rendement net de la carte « Rentabilité ». */
export type OfferYields = {
  /** « Rentabilité à 192 000 € », ou « Rentabilité au prix affiché ». */
  title: string;
  /** `listed` : la même valeur au prix affiché, pour comparer (« 8,0 % au prix affiché ») ; null au prix affiché. */
  rows: { label: 'Rendement brut' | 'Rendement net'; value: string; listed: string | null }[];
};

const offerCalculator = new InvestmentCalculator();

/**
 * Rentabilité au montant proposé : le montant remplace le prix d'achat dans le moteur de la carte, avec les hypothèses
 * standard (le brut et le net ne dépendent pas du financement ; les frais de notaire suivent le prix). Le montant compte
 * dès la moitié du prix affiché : en dessous, pendant la frappe par exemple, la rentabilité reste celle du prix affiché.
 * `null` si le moteur refuse le calcul (pas de bloc).
 */
export function offerYields({ inputs }: Profitability, listedPrice: number, amount: number | null): OfferYields | null {
  const at = (price: number, origin: ValueOrigin) =>
    offerCalculator.calculate({ ...inputs, purchasePrice: sourced(D(price), origin) }, STANDARD_ASSUMPTIONS);
  const offered = amount !== null && amount !== listedPrice && amount * 2 >= listedPrice ? amount : null;
  let listed: InvestmentResult;
  let result: InvestmentResult;
  try {
    listed = at(listedPrice, inputs.purchasePrice.origin);
    result = offered === null ? listed : at(offered, 'user');
  } catch {
    return null;
  }
  const row = (label: 'Rendement brut' | 'Rendement net', value: (r: InvestmentResult) => Decimal) => ({
    label,
    value: formatPercent(value(result)),
    listed: offered === null ? null : `${formatPercent(value(listed))} au prix affiché`,
  });
  return {
    title: offered === null ? 'Rentabilité au prix affiché' : `Rentabilité à ${formatPrice(offered)}`,
    rows: [row('Rendement brut', (r) => r.grossYield), row('Rendement net', (r) => r.netYield)],
  };
}
