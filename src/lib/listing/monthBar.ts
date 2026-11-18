import { D, Decimal, type DecimalLike } from '../investment/decimal';
import type { MonthlyBreakdownKind } from '../investment';
import { formatPrice } from '../format';

// Barre de « Votre mois type » (carte Rentabilité), comme InvestmentEngine/MonthBar.swift de l'app : une barre
// découpée dans l'ordre des lignes, un segment par dépense, puis le reste en vert. Reste positif : la barre représente
// les loyers encaissés ; reste négatif : elle représente les dépenses, et un trait marque l'endroit où s'arrêtent les
// loyers. Seulement la mise en page : les montants sont ceux du mois type, inchangés.

/** Blanc entre deux segments (px). */
export const MONTH_BAR_GAP = 2;
/** Largeur minimale d'un segment, pour qu'une petite dépense reste visible (px). */
export const MONTH_BAR_MINIMUM_WIDTH = 3;

/**
 * Couleur de chaque sorte de ligne (segment de la barre et carré devant la ligne), toujours la même quelles que soient
 * les lignes présentes ; les loyers et le reste en vert (MonthlyBreakdown.Kind.monthColorHex).
 */
export const MONTH_COLORS: Record<MonthlyBreakdownKind, string> = {
  collectedRent: '#2F7A4E',
  loan: '#3C5CB0',
  nonRecoverableCharges: '#EB6834',
  propertyTax: '#1BAF7A',
  landlordInsurance: '#EDA100',
  managementFees: '#E87BA4',
  maintenance: '#6250D6',
};
export const MONTH_REMAINDER_COLOR = MONTH_COLORS.collectedRent;

export type MonthBarExpense = { id: string; kind: MonthlyBreakdownKind; amount: Decimal };
export type MonthBarSegment = { id: string; role: { expense: MonthlyBreakdownKind } | 'remainder'; x: number; width: number };

const SPOKEN_NAMES: Record<MonthlyBreakdownKind, string> = {
  collectedRent: 'loyers',
  loan: 'crédit',
  nonRecoverableCharges: 'charges',
  propertyTax: 'taxe foncière',
  landlordInsurance: 'assurance',
  managementFees: 'gestion',
  maintenance: 'entretien',
};

/** « 1 550 € » : euros entiers (FicheText.wholeEuros). */
const wholeEuros = (value: Decimal) => formatPrice(value.rounded(0).toNumber());

export class MonthBar {
  /** Loyers encaissés du mois (somme des lignes de loyer). */
  readonly income: Decimal;
  /** Dépenses dans l'ordre des lignes, sans les lignes à 0 € (taxe foncière refacturée). */
  readonly expenses: MonthBarExpense[];

  constructor(income: DecimalLike, expenses: { id: string; kind: MonthlyBreakdownKind; amount: DecimalLike }[]) {
    this.income = Decimal.max(0, D(income));
    this.expenses = expenses.map((expense) => ({ ...expense, amount: D(expense.amount) })).filter((expense) => expense.amount.gt(0));
  }

  get totalExpenses(): Decimal {
    return this.expenses.reduce((sum, expense) => sum.plus(expense.amount), D(0));
  }

  /** Ce qui reste des loyers une fois les dépenses payées (négatif : effort d'épargne). */
  get remainder(): Decimal {
    return this.income.minus(this.totalExpenses);
  }

  get isNegative(): boolean {
    return this.remainder.lt(0);
  }

  /** Sorte de la dépense qui a un segment, par identifiant de ligne ; `null` sans segment (taxe refacturée). */
  segmentKind(id: string): MonthlyBreakdownKind | null {
    return this.expenses.find((expense) => expense.id === id)?.kind ?? null;
  }

  /** Segments sur une barre de `width` px : proportionnels à leur montant, 2 px entre eux, 3 px au moins chacun. */
  segments(width: number): MonthBarSegment[] {
    const parts: { id: string; role: MonthBarSegment['role']; amount: Decimal }[] = this.expenses.map((expense) => ({
      id: expense.id, role: { expense: expense.kind }, amount: expense.amount,
    }));
    if (this.remainder.gt(0)) parts.push({ id: 'reste', role: 'remainder', amount: this.remainder });
    const available = width - MONTH_BAR_GAP * Math.max(0, parts.length - 1);
    const widths = MonthBar.widths(parts.map((part) => part.amount.toNumber()), available, MONTH_BAR_MINIMUM_WIDTH);
    let x = 0;
    return parts.map((part, index) => {
      const segment = { id: part.id, role: part.role, x, width: widths[index] };
      x += widths[index] + MONTH_BAR_GAP;
      return segment;
    });
  }

  /** Reste négatif : position (px) où s'arrêtent les loyers sur la barre des dépenses ; `null` sinon. */
  incomeMarker(width: number): number | null {
    if (!this.isNegative || !this.income.gt(0)) return null;
    let reached = D(0);
    const segments = this.segments(width);
    for (let index = 0; index < this.expenses.length; index += 1) {
      const expense = this.expenses[index];
      const segment = segments[index];
      if (this.income.lte(reached.plus(expense.amount))) {
        return segment.x + segment.width * this.income.minus(reached).dividedBy(expense.amount).toNumber();
      }
      reached = reached.plus(expense.amount);
    }
    return null;
  }

  /**
   * Largeurs proportionnelles qui remplissent `available`, chacune d'au moins `minimum` : une part trop petite est
   * portée au minimum et les autres se partagent le reste, jusqu'à ce que plus aucune ne passe sous le minimum.
   */
  static widths(amounts: number[], available: number, minimum: number): number[] {
    if (!amounts.length || available <= 0) return amounts.map(() => 0);
    if (minimum * amounts.length >= available) return amounts.map(() => available / amounts.length);
    const atMinimum = new Set<number>();
    for (;;) {
      const free = available - minimum * atMinimum.size;
      const others = amounts.map((_, index) => index).filter((index) => !atMinimum.has(index));
      const total = others.reduce((sum, index) => sum + amounts[index], 0);
      const share = (index: number) => (total > 0 ? (free * amounts[index]) / total : free / others.length);
      const tooSmall = others.filter((index) => share(index) < minimum);
      if (!tooSmall.length) return amounts.map((_, index) => (atMinimum.has(index) ? minimum : share(index)));
      for (const index of tooSmall) atMinimum.add(index);
    }
  }

  /**
   * Lecteur d'écran : « Sur 1 550 € de loyers : crédit 1 267 €, charges 45 €, taxe foncière 70 €, reste 131 € ».
   * `cashFlow` : le cash-flow du moteur, affiché aussi à droite sous la barre.
   */
  spokenText(cashFlow: DecimalLike): string {
    const flow = D(cashFlow);
    const parts = this.expenses.map((expense) => `${SPOKEN_NAMES[expense.kind]} ${wholeEuros(expense.amount)}`);
    parts.push(flow.lt(0) ? `effort d’épargne ${wholeEuros(flow.negated())}` : `reste ${wholeEuros(flow)}`);
    return `Sur ${wholeEuros(this.income)} de loyers : ${parts.join(', ')}`;
  }
}
