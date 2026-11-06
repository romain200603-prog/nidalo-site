import type { IconName } from '../components/iconPaths';
import { cardKind } from './cardContent';
import { formatArea, formatFraction, formatPrice, formatSignedAmount } from './format';
import { D, Decimal } from './investment/decimal';
import { rentalBanYear, STANDARD_ASSUMPTIONS } from './investment/domain';
import { LoanMath } from './investment/loanMath';
import { investmentForRow } from './investment/row';
import type { SearchMode } from './labels';
import { readAsset, rentalDetails, type RentalDetails } from './listing/fields';
import type { ListingRow, PhotoRow } from './listings';
import { sortedPhotos } from './listings';

// Comparaison de 2 ou 3 biens, comme l'app : ImmoDomain/Listing/ListingComparison.swift (critères, écarts au bien de
// référence, analyse) et Features/Compare/CompareView.swift (libellés, formats et mensualité estimée). Aucun bien
// n'est désigné gagnant.

export type ComparisonKind = 'purchase' | 'rental' | 'investment' | 'professional';

export type Criterion =
  | 'price' | 'monthlyRent' | 'livingArea' | 'landArea' | 'pricePerSquareMeter' | 'rooms' | 'bedrooms' | 'energyClass'
  | 'monthlyCharges' | 'annualPropertyTax' | 'estimatedMonthlyPayment' | 'furnished' | 'availableFrom'
  | 'currentMonthlyRent' | 'potentialMonthlyRent' | 'annualRent' | 'grossYield' | 'estimatedNetYield'
  | 'estimatedCashFlow' | 'worksAmount' | 'hotelRooms' | 'units' | 'annualRevenue' | 'ebitda' | 'tenancy';

type Direction = 'lowerIsBetter' | 'higherIsBetter' | 'betterClassIsBetter' | 'neutral';

const ENERGY = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export type EnergyLetter = (typeof ENERGY)[number];

/** Valeur d'un critère pour un bien ; `null` quand la donnée n'est pas renseignée (jamais 0). */
export type ComparisonValue =
  | { kind: 'amount'; value: number }
  | { kind: 'ratio'; value: number }
  | { kind: 'area'; value: number }
  | { kind: 'count'; value: number }
  | { kind: 'energy'; letter: EnergyLetter }
  | { kind: 'flag'; value: boolean }
  | { kind: 'date'; value: Date }
  | { kind: 'tenancy'; isLeased: boolean };

export type Assessment = 'favorable' | 'unfavorable' | 'neutral';
export type ComparisonDelta = { difference: number; assessment: Assessment };
export type ComparisonRow = { criterion: Criterion; values: (ComparisonValue | null)[]; deltas: (ComparisonDelta | null)[] };

export type ComparisonNote =
  | { kind: 'lowestPrice' } | { kind: 'lowestPricePerSquareMeter' } | { kind: 'largestArea' } | { kind: 'highestGrossYield' }
  | { kind: 'bestCashFlow' } | { kind: 'bestEnergyClass' } | { kind: 'lowestCharges' }
  | { kind: 'negativeCashFlow'; value: number } | { kind: 'highCharges'; value: number }
  | { kind: 'rentalBan'; letter: EnergyLetter; year: number } | { kind: 'rentFreeze'; letter: EnergyLetter }
  | { kind: 'worksPlanned'; value: number } | { kind: 'missingRent' };

export type ComparisonAnalysis = { strengths: ComparisonNote[]; warnings: ComparisonNote[] };

/** Bien comparé : son résumé (ListingSummary) et les montants de la fiche complète. */
export type ComparisonItem = {
  id: string;
  title: string;
  city: string;
  photo: PhotoRow | undefined;
  /** Nature du bien pour la comparaison (ListingComparison.kind(for:intent:)). */
  kind: ComparisonKind;
  transaction: 'sale' | 'rent';
  propertyType: string;
  price: number;
  livingArea: number;
  landArea: number | null;
  rooms: number | null;
  bedrooms: number | null;
  energyClass: EnergyLetter | null;
  monthlyCharges: number | null;
  rental: RentalDetails | null;
  /** Indicateurs calculés avec les hypothèses standard, si les données le permettent. */
  investment: { grossYield: number; netYield: number; monthlyCashFlow: number } | null;
  hotel: { rooms: number | null; annualRevenue: number | null; ebitda: number | null } | null;
  totalUnits: number | null;
  annualPropertyTax: number | null;
  worksAmount: number | null;
  estimatedMonthlyPayment: number | null;
};

export type Comparison = {
  items: ComparisonItem[];
  kind: ComparisonKind;
  referenceIndex: number;
  rows: ComparisonRow[];
  analyses: ComparisonAnalysis[];
  /** Biens de natures différentes (vente et location…) : seuls les critères communs sont comparés. */
  isMixed: boolean;
};

const DIRECTIONS: Record<Criterion, Direction> = {
  price: 'lowerIsBetter', monthlyRent: 'lowerIsBetter', pricePerSquareMeter: 'lowerIsBetter', monthlyCharges: 'lowerIsBetter',
  annualPropertyTax: 'lowerIsBetter', estimatedMonthlyPayment: 'lowerIsBetter', worksAmount: 'lowerIsBetter',
  currentMonthlyRent: 'higherIsBetter', potentialMonthlyRent: 'higherIsBetter', annualRent: 'higherIsBetter',
  grossYield: 'higherIsBetter', estimatedNetYield: 'higherIsBetter', estimatedCashFlow: 'higherIsBetter',
  annualRevenue: 'higherIsBetter', ebitda: 'higherIsBetter',
  energyClass: 'betterClassIsBetter',
  livingArea: 'neutral', landArea: 'neutral', rooms: 'neutral', bedrooms: 'neutral', hotelRooms: 'neutral', units: 'neutral',
  furnished: 'neutral', availableFrom: 'neutral', tenancy: 'neutral',
};

/** Valeur calculée par l'application avec les hypothèses standard (« est. »). */
export const isEstimate = (criterion: Criterion): boolean =>
  criterion === 'estimatedMonthlyPayment' || criterion === 'estimatedNetYield' || criterion === 'estimatedCashFlow';

const COMMON_CRITERIA: Criterion[] = ['price', 'livingArea', 'pricePerSquareMeter', 'rooms', 'energyClass'];

export function criteriaFor(kind: ComparisonKind): Criterion[] {
  switch (kind) {
    case 'purchase':
      return ['price', 'livingArea', 'pricePerSquareMeter', 'rooms', 'bedrooms', 'energyClass', 'annualPropertyTax', 'monthlyCharges', 'estimatedMonthlyPayment'];
    case 'rental':
      return ['monthlyRent', 'monthlyCharges', 'livingArea', 'rooms', 'energyClass', 'furnished', 'availableFrom'];
    case 'investment':
      return ['price', 'currentMonthlyRent', 'potentialMonthlyRent', 'annualRent', 'grossYield', 'estimatedNetYield', 'estimatedCashFlow',
        'livingArea', 'pricePerSquareMeter', 'annualPropertyTax', 'monthlyCharges', 'worksAmount', 'energyClass'];
    default:
      return ['price', 'livingArea', 'landArea', 'hotelRooms', 'units', 'tenancy', 'annualRent', 'grossYield', 'annualRevenue', 'ebitda', 'annualPropertyTax'];
  }
}

// MARK: - Biens

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Arrondi à l'unité comme l'app (`rounded(scale: 0)`, mode .plain : la moitié s'éloigne de zéro). */
const roundPlain = (value: number) => Math.sign(value) * Math.round(Math.abs(value));

/** Mensualité estimée : 10 % d'apport, 25 ans, taux et assurance des hypothèses standard (CompareView). */
export function estimatedMonthlyPayment(price: number): number {
  const principal = D(price).times(D('0.9'));
  const payment = LoanMath.monthlyPayment(principal, STANDARD_ASSUMPTIONS.loanAnnualRate, 300)
    .plus(LoanMath.monthlyInsurance(principal, STANDARD_ASSUMPTIONS.borrowerInsuranceAnnualRate));
  return payment.rounded(0).toNumber();
}

/** Bien comparé, lu comme l'app le lit (ListingSummary(details:calculator:) puis CompareView.load). */
export function comparisonItem(row: ListingRow, mode: SearchMode | null): ComparisonItem {
  const card = cardKind(row, mode);
  const kind: ComparisonKind = card === 'rental' || card === 'purchase' || card === 'investment' ? card : 'professional';
  const asset = readAsset(row);
  const hotel = asset?.kind === 'hotel' ? asset.hotel : null;
  const building = asset?.kind === 'building' ? asset.building : null;
  const investment = investmentForRow(row);
  const energy = typeof row.energy_class === 'string' && (ENERGY as readonly string[]).includes(row.energy_class) ? (row.energy_class as EnergyLetter) : null;
  const price = Number(row.price);
  return {
    id: row.id,
    title: row.title,
    city: row.city,
    photo: sortedPhotos(row)[0],
    kind,
    transaction: row.transaction,
    propertyType: row.property_type,
    price,
    livingArea: Number(row.living_area) || 0,
    landArea: num(row.land_area),
    rooms: num(row.rooms),
    bedrooms: num(row.bedrooms),
    energyClass: energy,
    monthlyCharges: num(row.monthly_charges),
    rental: rentalDetails(row),
    investment: investment ? { grossYield: investment.grossYield, netYield: investment.netYield, monthlyCashFlow: investment.monthlyCashFlow } : null,
    hotel: hotel ? { rooms: hotel.rooms, annualRevenue: hotel.annualRevenue?.value ?? null, ebitda: hotel.ebitda?.value ?? null } : null,
    totalUnits: building && (building.residentialUnits !== null || building.commercialUnits !== null)
      ? (building.residentialUnits ?? 0) + (building.commercialUnits ?? 0) : null,
    annualPropertyTax: num(row.annual_property_tax),
    worksAmount: num(row.works_amount),
    estimatedMonthlyPayment: row.transaction === 'sale' && row.property_type !== 'hotel' ? estimatedMonthlyPayment(price) : null,
  };
}

// MARK: - Valeurs et écarts

const amount = (value: number | null): ComparisonValue | null => (value === null ? null : { kind: 'amount', value });

export function criterionValue(criterion: Criterion, item: ComparisonItem): ComparisonValue | null {
  const rental = item.rental;
  switch (criterion) {
    case 'price': return item.transaction === 'sale' ? amount(item.price) : null;
    case 'monthlyRent': return item.transaction === 'rent' ? amount(item.price) : null;
    case 'livingArea': return item.livingArea > 0 ? { kind: 'area', value: item.livingArea } : null;
    case 'landArea': return item.landArea === null ? null : { kind: 'area', value: item.landArea };
    case 'pricePerSquareMeter':
      return item.transaction === 'sale' && item.livingArea > 0 ? amount(D(item.price).dividedBy(D(item.livingArea)).rounded(0).toNumber()) : null;
    case 'rooms': return item.rooms !== null && item.rooms > 0 ? { kind: 'count', value: item.rooms } : null;
    case 'bedrooms': return item.bedrooms !== null && item.bedrooms > 0 ? { kind: 'count', value: item.bedrooms } : null;
    case 'energyClass': return item.energyClass ? { kind: 'energy', letter: item.energyClass } : null;
    case 'monthlyCharges': return amount(item.monthlyCharges);
    case 'annualPropertyTax': return amount(item.annualPropertyTax);
    case 'estimatedMonthlyPayment': return amount(item.estimatedMonthlyPayment);
    case 'furnished': return rental?.isFurnished == null ? null : { kind: 'flag', value: rental.isFurnished };
    case 'availableFrom': return rental?.availableFrom ? { kind: 'date', value: rental.availableFrom } : null;
    case 'currentMonthlyRent': return amount(rental?.currentMonthlyRent ?? null);
    case 'potentialMonthlyRent': return rental?.currentMonthlyRent == null ? amount(rental?.potentialMonthlyRent ?? null) : null;
    case 'annualRent': return rental?.currentMonthlyRent == null ? null : amount(D(rental.currentMonthlyRent).times(12).toNumber());
    case 'grossYield': return item.investment ? { kind: 'ratio', value: item.investment.grossYield } : null;
    case 'estimatedNetYield': return item.investment ? { kind: 'ratio', value: item.investment.netYield } : null;
    case 'estimatedCashFlow': return item.investment ? amount(item.investment.monthlyCashFlow) : null;
    case 'worksAmount': return item.worksAmount !== null && item.worksAmount > 0 ? amount(item.worksAmount) : null;
    case 'hotelRooms': return item.hotel?.rooms == null ? null : { kind: 'count', value: item.hotel.rooms };
    case 'units': return item.totalUnits === null ? null : { kind: 'count', value: item.totalUnits };
    case 'annualRevenue': return amount(item.hotel?.annualRevenue ?? null);
    case 'ebitda': return amount(item.hotel?.ebitda ?? null);
    case 'tenancy':
      if (!rental || item.transaction !== 'sale' || item.propertyType === 'apartment' || item.propertyType === 'house') return null;
      return { kind: 'tenancy', isLeased: rental.isLeased };
  }
}

/** Valeur numérique d'un écart (classe énergie : A = 0 … G = 6). */
function numberOf(value: ComparisonValue | null): number | null {
  if (!value) return null;
  switch (value.kind) {
    case 'amount': case 'ratio': case 'area': case 'count': return value.value;
    case 'energy': return ENERGY.indexOf(value.letter);
    default: return null;
  }
}

function assess(difference: Decimal, direction: Direction): Assessment {
  if (difference.eq(0)) return 'neutral';
  switch (direction) {
    case 'lowerIsBetter': case 'betterClassIsBetter': return difference.lt(0) ? 'favorable' : 'unfavorable';
    case 'higherIsBetter': return difference.gt(0) ? 'favorable' : 'unfavorable';
    default: return 'neutral';
  }
}

/** Ligne d'un critère ; omise si aucun bien n'a la donnée. */
function rowFor(criterion: Criterion, items: ComparisonItem[], reference: number): ComparisonRow | null {
  const values = items.map((item) => criterionValue(criterion, item));
  if (!values.some((value) => value !== null)) return null;
  const referenceNumber = numberOf(values[reference]);
  const deltas = values.map((value, index) => {
    const mine = numberOf(value);
    if (index === reference || referenceNumber === null || mine === null) return null;
    const difference = D(mine).minus(D(referenceNumber));
    return { difference: difference.toNumber(), assessment: assess(difference, DIRECTIONS[criterion]) };
  });
  return { criterion, values, deltas };
}

// MARK: - Analyse

const HIGH_CHARGES_PER_SQUARE_METER = 3.5;

function analysisFor(index: number, items: ComparisonItem[], kind: ComparisonKind): ComparisonAnalysis {
  const strengths: ComparisonNote[] = [];
  const warnings: ComparisonNote[] = [];
  const item = items[index];

  /** Meilleur de tous, seul en tête (pas d'ex æquo), et au moins deux valeurs connues. */
  const isBest = (criterion: Criterion) => {
    const numbers = items.map((other) => numberOf(criterionValue(criterion, other)));
    const mine = numbers[index];
    if (mine === null || numbers.filter((n) => n !== null).length < 2) return false;
    const others = numbers.filter((n, i): n is number => i !== index && n !== null);
    const direction = DIRECTIONS[criterion];
    return direction === 'lowerIsBetter' || direction === 'betterClassIsBetter' ? others.every((n) => mine < n) : others.every((n) => mine > n);
  };

  switch (kind) {
    case 'rental':
      if (isBest('monthlyRent')) strengths.push({ kind: 'lowestPrice' });
      if (isBest('livingArea')) strengths.push({ kind: 'largestArea' });
      if (isBest('monthlyCharges')) strengths.push({ kind: 'lowestCharges' });
      break;
    case 'purchase':
    case 'professional':
      if (isBest('price')) strengths.push({ kind: 'lowestPrice' });
      if (isBest('pricePerSquareMeter')) strengths.push({ kind: 'lowestPricePerSquareMeter' });
      if (isBest('livingArea')) strengths.push({ kind: 'largestArea' });
      if (kind === 'professional' && isBest('grossYield')) strengths.push({ kind: 'highestGrossYield' });
      break;
    case 'investment':
      if (isBest('grossYield')) strengths.push({ kind: 'highestGrossYield' });
      if (isBest('estimatedCashFlow')) strengths.push({ kind: 'bestCashFlow' });
      if (isBest('price')) strengths.push({ kind: 'lowestPrice' });
      if (isBest('pricePerSquareMeter')) strengths.push({ kind: 'lowestPricePerSquareMeter' });
      if (item.investment && item.investment.monthlyCashFlow < 0) warnings.push({ kind: 'negativeCashFlow', value: item.investment.monthlyCashFlow });
      if (!item.investment) warnings.push({ kind: 'missingRent' });
      if (item.worksAmount !== null && item.worksAmount > 0) warnings.push({ kind: 'worksPlanned', value: item.worksAmount });
      break;
  }
  if (isBest('energyClass')) strengths.push({ kind: 'bestEnergyClass' });

  if (item.monthlyCharges !== null && item.livingArea > 0 && item.monthlyCharges / item.livingArea > HIGH_CHARGES_PER_SQUARE_METER) {
    warnings.push({ kind: 'highCharges', value: item.monthlyCharges });
  }
  // Règles de location du DPE : utiles pour un investissement ou une location.
  if ((kind === 'investment' || kind === 'rental') && item.energyClass) {
    const year = rentalBanYear(item.energyClass);
    if (year !== null) warnings.push({ kind: 'rentalBan', letter: item.energyClass, year });
    if (item.energyClass === 'F' || item.energyClass === 'G') warnings.push({ kind: 'rentFreeze', letter: item.energyClass });
  }
  return { strengths, warnings };
}

/** Comparaison des biens, avec le bien de référence des écarts (le premier si l'index est hors liste). */
export function compareListings(items: ComparisonItem[], referenceIndex = 0): Comparison {
  const reference = referenceIndex >= 0 && referenceIndex < items.length ? referenceIndex : 0;
  const kinds = items.map((item) => item.kind);
  const unique = new Set(kinds);
  // Achat et investissement se comparent sur les mêmes critères : ce n'est pas un mélange.
  const purchaseAndInvestment = unique.size === 2 && unique.has('purchase') && unique.has('investment');
  const isMixed = unique.size > 1 && !purchaseAndInvestment;
  const kind: ComparisonKind = unique.size === 1 ? kinds[0] : purchaseAndInvestment ? 'investment' : 'purchase';
  const criteria = isMixed ? COMMON_CRITERIA : criteriaFor(kind);
  const rows = criteria.map((criterion) => rowFor(criterion, items, reference)).filter((row): row is ComparisonRow => row !== null);
  return { items, kind, referenceIndex: reference, rows, analyses: items.map((_, index) => analysisFor(index, items, kind)), isMixed };
}

// MARK: - Libellés et formats (CompareFormatting)

export const CRITERION_LABELS: Record<Criterion, { icon: IconName; text: string }> = {
  price: { icon: 'tag', text: 'Prix' },
  monthlyRent: { icon: 'euro', text: 'Loyer mensuel' },
  livingArea: { icon: 'scan', text: 'Surface' },
  landArea: { icon: 'trees', text: 'Terrain' },
  pricePerSquareMeter: { icon: 'ruler', text: 'Prix au m²' },
  rooms: { icon: 'layers', text: 'Pièces' },
  bedrooms: { icon: 'bed', text: 'Chambres' },
  energyClass: { icon: 'zap', text: 'DPE' },
  monthlyCharges: { icon: 'building', text: 'Charges (mois)' },
  annualPropertyTax: { icon: 'fileText', text: 'Taxe foncière (an)' },
  estimatedMonthlyPayment: { icon: 'wallet', text: 'Mensualité (est.)' },
  furnished: { icon: 'bedDouble', text: 'Meublé' },
  availableFrom: { icon: 'calendarBlank', text: 'Disponibilité' },
  currentMonthlyRent: { icon: 'euro', text: 'Loyer actuel' },
  potentialMonthlyRent: { icon: 'euro', text: 'Loyer potentiel' },
  annualRent: { icon: 'euro', text: 'Loyers annuels' },
  grossYield: { icon: 'chart', text: 'Rentabilité brute' },
  estimatedNetYield: { icon: 'percent', text: 'Rentabilité nette (est.)' },
  estimatedCashFlow: { icon: 'wallet', text: 'Cash-flow (est.)' },
  worksAmount: { icon: 'gear', text: 'Travaux' },
  hotelRooms: { icon: 'bedDouble', text: 'Chambres' },
  units: { icon: 'building2', text: 'Lots' },
  annualRevenue: { icon: 'trend', text: 'Chiffre d\'affaires' },
  ebitda: { icon: 'chart', text: 'EBITDA' },
  tenancy: { icon: 'keyRound', text: 'Situation' },
};

const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** Texte d'une valeur (CompareFormatting.text). */
export function valueText(value: ComparisonValue, criterion: Criterion, now: Date = new Date()): string {
  switch (value.kind) {
    case 'amount':
      switch (criterion) {
        case 'monthlyRent': case 'monthlyCharges': case 'estimatedMonthlyPayment': case 'currentMonthlyRent': case 'potentialMonthlyRent':
          return `${formatPrice(value.value)}/mois`;
        case 'estimatedCashFlow': return `${formatSignedAmount(roundPlain(value.value))}/mois`;
        case 'annualPropertyTax': case 'annualRent': case 'annualRevenue': case 'ebitda': return `${formatPrice(value.value)}/an`;
        case 'pricePerSquareMeter': return `${formatPrice(value.value)}/m²`;
        default: return formatPrice(value.value);
      }
    case 'ratio': return formatFraction(value.value);
    case 'area': return formatArea(value.value);
    case 'count': return `${value.value}`;
    case 'energy': return value.letter;
    case 'flag': return value.value ? 'Oui' : 'Non';
    case 'date': return value.value.getTime() <= now.getTime() ? 'Immédiate' : shortDate.format(value.value);
    case 'tenancy': return value.isLeased ? 'Loué' : 'Libre';
  }
}

/** Écart affiché sous la valeur : « + 12 000 € », « − 0,7 % pt », « + 2 classes » (CompareFormatting.deltaText). */
export function deltaText(difference: number, criterion: Criterion): string {
  const sign = difference > 0 ? '+' : difference < 0 ? '−' : '';
  const magnitude = Math.abs(difference);
  let body: string;
  switch (criterion) {
    case 'grossYield': case 'estimatedNetYield': body = `${formatFraction(magnitude)} pt`; break;
    case 'livingArea': case 'landArea': body = formatArea(magnitude); break;
    case 'rooms': case 'bedrooms': case 'hotelRooms': case 'units': body = `${Math.trunc(magnitude)}`; break;
    case 'energyClass': body = `${Math.trunc(magnitude)} classe${magnitude > 1 ? 's' : ''}`; break;
    case 'estimatedCashFlow': body = `${formatPrice(roundPlain(magnitude))}/mois`; break;
    default: body = valueText({ kind: 'amount', value: magnitude }, criterion);
  }
  return `${sign} ${body}`.trim();
}

/** Point fort ou point de vigilance (CompareFormatting.note). */
export function noteText(note: ComparisonNote, currentYear: number): string {
  switch (note.kind) {
    case 'lowestPrice': return 'Le moins cher de la sélection';
    case 'lowestPricePerSquareMeter': return 'Meilleur prix au m²';
    case 'largestArea': return 'Le plus spacieux';
    case 'highestGrossYield': return 'Meilleure rentabilité brute';
    case 'bestCashFlow': return 'Meilleur cash-flow estimé';
    case 'bestEnergyClass': return 'Meilleur DPE';
    case 'lowestCharges': return 'Charges les plus faibles';
    case 'negativeCashFlow': return `Cash-flow estimé négatif (${formatSignedAmount(roundPlain(note.value))}/mois)`;
    case 'highCharges': return `Charges élevées (${formatPrice(note.value)}/mois)`;
    case 'rentalBan':
      return note.year <= currentYear
        ? `DPE ${note.letter} : location interdite pour un nouveau bail depuis ${note.year}`
        : `DPE ${note.letter} : location interdite pour un nouveau bail en ${note.year}`;
    case 'rentFreeze': return `DPE ${note.letter} : loyer gelé (pas de hausse)`;
    case 'worksPlanned': return `Travaux à prévoir (${formatPrice(note.value)})`;
    case 'missingRent': return 'Loyer non renseigné : rentabilité à calculer';
  }
}
