import { D, Decimal, type DecimalLike } from './decimal';
import {
  ENERGY_CLASSES, inputsFromListing, investmentAssumptions, PROPERTY_TYPES, STANDARD_ASSUMPTIONS, type EnergyClass,
  type InvestmentAssumptions, type InvestmentHighlights, type InvestmentInputs, type InvestmentListing,
  type InvestmentProperty, type InvestmentResult, type PropertyType, type RentalInfo,
} from './domain';
import { cashFlowTone, formatCashFlow, formatMonthYear, formatPercent, formatPrice, yieldTone, type CashFlowTone, type YieldTone } from './display';
import { listingInvestment } from './investmentCalculator';

// Une ligne de la table `listings` (PostgREST) lue comme l'app : SupabaseListingRepository.Row (décodage JSON),
// details(from:), ListingSummary(details:calculator:) et highlights(_:downPayment:).

/** Colonnes de `listings` lues par `investmentForRow`, à ajouter au select (`INVESTMENT_COLUMNS.join(',')`). */
export const INVESTMENT_COLUMNS = [
  'transaction', 'property_type', 'price', 'monthly_charges', 'annual_property_tax', 'works_amount', 'is_new_build',
  'energy_class', 'rental_info',
] as const;

export type InvestmentColumn = (typeof INVESTMENT_COLUMNS)[number];

/** Une ligne telle que PostgREST la renvoie : numeric en nombres JSON, jsonb en objets. Les autres colonnes sont ignorées. */
export type InvestmentRow = { readonly [K in InvestmentColumn]?: unknown };

/** Hypothèses de calcul ; celles qui manquent prennent les valeurs de l'app. */
export type InvestmentOptions = {
  /** Apport en euros. null (par défaut) : l'apport paie les frais d'acquisition, le crédit finance le reste. */
  downPayment?: DecimalLike | null;
  /** Taux nominal annuel du crédit : 0,035 (3,5 %) par défaut. */
  loanAnnualRate?: DecimalLike;
  /** Durée du crédit en mois : 240 (20 ans) par défaut. */
  loanDurationMonths?: number;
  /** Taux annuel de l'assurance emprunteur : 0,003 (0,3 %) par défaut. */
  borrowerInsuranceAnnualRate?: DecimalLike;
  /** Fuseau de la date de fin de bail affichée ; celui du navigateur par défaut (l'app : celui de l'iPhone). */
  timeZone?: string;
};

/** Hypothèses standard (InvestmentAssumptions.standard) : cartes, favoris, carte, fiche. */
export const STANDARD_OPTIONS = Object.freeze({
  downPayment: null,
  loanAnnualRate: STANDARD_ASSUMPTIONS.loanAnnualRate.toNumber(),
  loanDurationMonths: STANDARD_ASSUMPTIONS.loanDurationMonths,
  borrowerInsuranceAnnualRate: STANDARD_ASSUMPTIONS.borrowerInsuranceAnnualRate.toNumber(),
}) satisfies InvestmentOptions;

/**
 * Recherche « Investir » de l'accueil : apport de 50 000 € (SearchDraft.demoDefaults, AppRouter.swift), tant que
 * l'utilisateur n'a pas choisi un autre apport. L'app recalcule alors les cartes avec cet apport.
 */
export const INVEST_SEARCH_OPTIONS = Object.freeze({ downPayment: 50_000 }) satisfies InvestmentOptions;

/** Indicateurs d'une carte d'annonce, comme l'app les affiche. */
export type CardInvestment = {
  /** Rendement brut, fraction à 4 décimales (0,0611 = 6,11 %). */
  grossYield: number;
  /** Rendement net, fraction à 4 décimales. */
  netYield: number;
  /** Cash-flow mensuel en euros, au centime (négatif = effort d'épargne). */
  monthlyCashFlow: number;
  /** Loyer estimé par l'app et non déclaré (jamais avec l'estimateur actuel : sans loyer, pas d'indicateurs). */
  isRentEstimated: boolean;
  /** Bien vendu loué (bail en cours) : badge « Locatif » et carte investissement même hors du mode Investir. */
  isLeased: boolean;
  /** Loyer actuel déclaré (« Loyer actuel : 1 400 €/mois »). */
  currentMonthlyRent: number | null;
  /** Loyer potentiel déclaré (« Loyer potentiel : … », si aucun loyer actuel). */
  potentialMonthlyRent: number | null;
  /** Loyer actuel × 12 (« Loyers actuels : 16 800 €/an »). */
  annualRent: number | null;
  /** Loyer mensuel tiré du rendement brut, à l'euro (cartes de l'accueil : prix × rendement / 12). */
  monthlyRentFromYield: number;
  /** Fin du bail en cours (« Bail en cours : jusqu'en juin 2027 »). */
  leaseEndDate: Date | null;
  /** Meublé, non meublé, ou non précisé. */
  isFurnished: boolean | null;
  /** Textes de l'app, arrondis comme elle (voir display.ts). */
  text: {
    /** « 6,1 % » */
    grossYield: string;
    /** « 4,2 % » */
    netYield: string;
    /** « −629 € » : « Cash-flow estimé : −629 €/mois ». */
    monthlyCashFlow: string;
    /** « 1 400 € » : « Loyer actuel : 1 400 €/mois ». */
    currentRent: string | null;
    /** « Loyer potentiel : … €/mois ». */
    potentialRent: string | null;
    /** « 16 800 € » : « Loyers actuels : 16 800 €/an ». */
    annualRent: string | null;
    /** « 1 400 € » : « 1 400 €/mois » sous le prix des cartes de l'accueil. */
    monthlyRentFromYield: string;
    /** « juin 2027 ». */
    leaseEnd: string | null;
  };
  /** Couleurs : rendements verts dès 7 % brut (orange sinon), cash-flow positif, négatif ou nul. */
  tone: { yield: YieldTone; cashFlow: CashFlowTone };
  /** Les mêmes indicateurs en décimal exact. */
  exact: InvestmentHighlights;
  /** Résultat complet du moteur (détail du calcul, lignes, avertissements). */
  result: InvestmentResult;
};

/**
 * Indicateurs de rentabilité d'une annonce, ceux des cartes de l'app ; null quand l'app n'en affiche pas : location,
 * pas de loyer déclaré (actuel ou potentiel), prix nul, ou ligne que l'app ne sait pas lire.
 *
 * Par défaut, les hypothèses standard (20 ans à 3,5 %, apport = frais d'acquisition). Dans la recherche Investir,
 * passer l'apport choisi (`INVEST_SEARCH_OPTIONS` : 50 000 €), comme l'app.
 */
export function investmentForRow(row: InvestmentRow, options: InvestmentOptions = {}): CardInvestment | null {
  const decoded = listingFromRow(row);
  if (!decoded) return null;
  const result = listingInvestment(decoded.listing, decoded.property, assumptionsFor(options));
  return result ? cardInvestment(result, decoded.listing, options.timeZone) : null;
}

/** Hypothèses du moteur pour ces options. */
export function assumptionsFor(options: InvestmentOptions = {}): InvestmentAssumptions {
  const overrides: Partial<InvestmentAssumptions> = { downPayment: options.downPayment == null ? null : D(options.downPayment) };
  if (options.loanAnnualRate !== undefined) overrides.loanAnnualRate = D(options.loanAnnualRate);
  if (options.loanDurationMonths !== undefined) overrides.loanDurationMonths = options.loanDurationMonths;
  if (options.borrowerInsuranceAnnualRate !== undefined) overrides.borrowerInsuranceAnnualRate = D(options.borrowerInsuranceAnnualRate);
  return investmentAssumptions(overrides);
}

/** Entrées du moteur pour une ligne (simulateur de la fiche) ; null pour une location ou une ligne illisible. */
export function inputsFromRow(row: InvestmentRow): InvestmentInputs | null {
  const decoded = listingFromRow(row);
  return decoded ? inputsFromListing(decoded.listing, decoded.property) : null;
}

/**
 * Annonce et bien lus comme l'app. null si l'app écarterait la ligne : décodage JSON impossible (prix absent, loyer en
 * texte, `isLeased` absent de rental_info…) ou transaction / type de bien inconnus (details(from:) échoue).
 */
export function listingFromRow(row: InvestmentRow): { listing: InvestmentListing; property: InvestmentProperty } | null {
  try {
    const transaction = row.transaction;
    const type = row.property_type;
    if (transaction !== 'sale' && transaction !== 'rent') return null;
    if (typeof type !== 'string' || !(PROPERTY_TYPES as readonly string[]).includes(type)) return null;
    const price = columnDecimal(row.price);
    if (price === null) return null;
    const energy = jsonString(row.energy_class);
    return {
      listing: {
        transaction,
        price,
        monthlyCharges: columnDecimal(row.monthly_charges),
        annualPropertyTax: columnDecimal(row.annual_property_tax),
        worksAmount: columnDecimal(row.works_amount),
        rentalInfo: decodeRentalInfo(row.rental_info),
      },
      property: {
        type: type as PropertyType,
        isNewBuild: jsonBool(row.is_new_build) ?? false,
        // Lettre inconnue : pas de classe énergie (EnergyClass(rawValue:)), la ligne reste lisible.
        energyClass: energy !== null && (ENERGY_CLASSES as readonly string[]).includes(energy) ? (energy as EnergyClass) : null,
      },
    };
  } catch (error) {
    if (error instanceof Undecodable) return null;
    throw error;
  }
}

function cardInvestment(result: InvestmentResult, listing: InvestmentListing, timeZone: string | undefined): CardInvestment {
  const rental = listing.rentalInfo;
  const current = rental?.currentMonthlyRent ?? null;
  const potential = rental?.potentialMonthlyRent ?? null;
  const annualRent = current ? current.times(12) : null;
  // HomeSections.swift (MonthlyRentLine) : (listing.price * investment.grossYield / 12).rounded(scale: 0).
  const rentFromYield = listing.price.times(result.grossYield).dividedBy(12).rounded(0);
  const leaseEndDate = rental?.leaseEndDate ?? null;
  return {
    grossYield: result.grossYield.toNumber(),
    netYield: result.netYield.toNumber(),
    monthlyCashFlow: result.monthlyCashFlow.toNumber(),
    isRentEstimated: result.highlights.isRentEstimated,
    isLeased: rental?.isLeased === true,
    currentMonthlyRent: current?.toNumber() ?? null,
    potentialMonthlyRent: potential?.toNumber() ?? null,
    annualRent: annualRent?.toNumber() ?? null,
    monthlyRentFromYield: rentFromYield.toNumber(),
    leaseEndDate,
    isFurnished: rental?.isFurnished ?? null,
    text: {
      grossYield: formatPercent(result.grossYield),
      netYield: formatPercent(result.netYield),
      monthlyCashFlow: formatCashFlow(result.monthlyCashFlow),
      currentRent: current ? formatPrice(current) : null,
      potentialRent: potential ? formatPrice(potential) : null,
      annualRent: annualRent ? formatPrice(annualRent) : null,
      monthlyRentFromYield: formatPrice(rentFromYield),
      leaseEnd: leaseEndDate ? formatMonthYear(leaseEndDate, timeZone) : null,
    },
    tone: { yield: yieldTone(result.grossYield), cashFlow: cashFlowTone(result.monthlyCashFlow) },
    exact: result.highlights,
    result,
  };
}

// MARK: - Décodage, aussi strict que le JSONDecoder de l'app

/** Valeur que le JSONDecoder de l'app refuserait (toute la réponse échoue dans l'app ; ici, seule cette ligne). */
class Undecodable extends Error {}

/**
 * Nombre JSON lu en Decimal comme JSONDecoder, qui lit le texte du nombre : `String(n)` redonne ce texte (au plus
 * 15 chiffres significatifs, voir Decimal.from). Hors des bornes de Decimal (1e300) : illisible, comme dans l'app.
 */
function jsonNumber(value: number): Decimal {
  const parsed = Number.isFinite(value) ? Decimal.parse(String(value)) : null;
  if (!parsed || parsed.isNaN) throw new Undecodable();
  return parsed;
}

/** Colonne numeric : nombre JSON (ou son texte, si l'appelant l'a gardé en chaîne pour ne rien perdre). */
function columnDecimal(value: unknown): Decimal | null {
  if (value == null) return null;
  if (typeof value === 'number') return jsonNumber(value);
  const parsed = typeof value === 'string' ? Decimal.parse(value) : null;
  if (!parsed || parsed.isNaN) throw new Undecodable();
  return parsed;
}

/** Montant dans rental_info (jsonb écrit par l'app) : un nombre JSON, rien d'autre. */
function jsonDecimal(value: unknown): Decimal | null {
  if (value == null) return null;
  if (typeof value === 'number') return jsonNumber(value);
  throw new Undecodable();
}

function jsonString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  throw new Undecodable();
}

function jsonBool(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  throw new Undecodable();
}

function jsonInt(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  throw new Undecodable();
}

/**
 * Date de rental_info. L'app écrit « 2027-06-29T22:00:00.000 » (UTC, sans fuseau : supabase-swift) et ne lit que ce
 * format. Ici, une date illisible est ignorée (elle ne change aucun montant) au lieu de faire échouer la ligne.
 */
function jsonDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const text = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value) ? `${value}Z` : value;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `RentalInfo` (Codable synthétisé) : `isLeased` est obligatoire, les autres champs facultatifs. */
function decodeRentalInfo(value: unknown): RentalInfo | null {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Undecodable();
  const json = value as Record<string, unknown>;
  if (typeof json.isLeased !== 'boolean') throw new Undecodable();
  return {
    currentMonthlyRent: jsonDecimal(json.currentMonthlyRent),
    potentialMonthlyRent: jsonDecimal(json.potentialMonthlyRent),
    isLeased: json.isLeased,
    leaseEndDate: jsonDate(json.leaseEndDate),
    availableFrom: jsonDate(json.availableFrom),
    recoverableMonthlyCharges: jsonDecimal(json.recoverableMonthlyCharges),
    isFurnished: jsonBool(json.isFurnished),
    securityDeposit: jsonDecimal(json.securityDeposit),
    leaseDurationMonths: jsonInt(json.leaseDurationMonths),
  };
}
