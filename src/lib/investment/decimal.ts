// Decimal de Foundation, recopié de swift-foundation 6.2 (iOS 26 ; identique de 6.1 à 6.3.1) :
// FoundationEssentials/Decimal/Decimal+Math.swift, Decimal.swift, Decimal+Conformances.swift.
//
// Valeur = (−1)^négatif × mantisse × 10^exposant, mantisse entière sur 8 mots de 16 bits (< 2^128, 38 à 39
// chiffres), exposant de −128 à 127. Les calculs sont en base 10 : 0,1 + 0,2 vaut exactement 0,3.
//
// Ce qui compte pour retrouver les centimes de l'app :
// - un résultat trop long pour la mantisse est TRONQUÉ (_fitMantissa calcule l'arrondi mais renvoie la valeur
//   tronquée), et une addition d'exposants très différents tronque le plus petit terme (_normalize) ;
// - les opérateurs + − × ÷ et pow() utilisent ces règles ; seul rounded(scale:mode:) (NSDecimalRound) arrondit ;
// - une erreur (dépassement, division par zéro) donne NaN, comme les opérateurs Swift.
// Les entiers de la mantisse sont des BigInt : les opérations sur les mots de 16 bits de Swift donnent les mêmes
// entiers (multiplication, addition, soustraction et division euclidienne exactes).

/** Modes de NSDecimalNumber.RoundingMode. */
export type RoundingMode = 'plain' | 'down' | 'up' | 'bankers';

/** Valeurs acceptées là où Swift écrit un littéral : 12, "0.035", 12n, ou un Decimal. */
export type DecimalLike = Decimal | number | bigint | string;

const MAX_SIZE = 8;
const MAX_EXPONENT = 127;
const MIN_EXPONENT = -128;

// 2^(16 i) : nombre de mots de 16 bits d'une mantisse.
const WORD_LIMITS: bigint[] = Array.from({ length: 20 }, (_, i) => 1n << BigInt(16 * i));

function wordCount(m: bigint): number {
  let n = 0;
  while (n < WORD_LIMITS.length && m >= WORD_LIMITS[n]) n++;
  return n;
}

const powers: bigint[] = [1n];
function pow10(n: number): bigint {
  for (let i = powers.length; i <= n; i++) powers.push(powers[i - 1] * 10n);
  return powers[n];
}

const MANTISSA_LIMIT = 1n << 128n;

class DecimalOverflow extends Error {}

export class Decimal {
  /** Construction brute (mantisse, exposant, signe), sans compactage : `Decimal(_exponent:_length:_isNegative:…)`. */
  private constructor(
    /** Bit de signe. Mantisse nulle et signe négatif : NaN (comme `_length == 0 && _isNegative == 1`). */
    readonly negative: boolean,
    readonly mantissa: bigint,
    readonly exponent: number,
  ) {}

  static readonly zero = new Decimal(false, 0n, 0);
  static readonly one = new Decimal(false, 1n, 0);
  static readonly nan = new Decimal(true, 0n, 0);
  /** `Decimal.greatestFiniteMagnitude` : mantisse 2^128 − 1, exposant 127. */
  static readonly greatestFiniteMagnitude = new Decimal(false, MANTISSA_LIMIT - 1n, MAX_EXPONENT);

  /** Valeur brute, pour les tests de représentation. */
  static raw(negative: boolean, mantissa: bigint, exponent: number): Decimal {
    return new Decimal(negative, mantissa, exponent);
  }

  /**
   * Littéral ou nombre lu dans un JSON.
   * - number : PostgREST envoie `numeric` en nombre JSON ; `JSON.parse` en fait un double et `String(n)` redonne les
   *   chiffres du texte JSON tant qu'ils sont 15 au plus (le décimal le plus court qui redonne ce double). On obtient
   *   donc le même Decimal que le JSONDecoder de l'app, qui lit le texte. Au-delà de 15 chiffres, le double a déjà
   *   perdu l'information.
   * - string : `Decimal(string:)` sur le texte entier (null → NaN si le texte n'est pas un nombre).
   */
  static from(value: DecimalLike): Decimal {
    if (value instanceof Decimal) return value;
    if (typeof value === 'bigint') return Decimal.fromInteger(value);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return Decimal.nan;
      return Decimal.parse(String(value)) ?? Decimal.nan;
    }
    return Decimal.parse(value) ?? Decimal.nan;
  }

  /** `Decimal(Int)` : entier compacté (zéros de droite dans l'exposant). */
  static fromInteger(value: bigint | number): Decimal {
    const n = BigInt(value);
    if (n === 0n) return Decimal.zero;
    const negative = n < 0n;
    const magnitude = negative ? -n : n;
    if (magnitude >= MANTISSA_LIMIT) return Decimal.parse(n.toString()) ?? Decimal.nan;
    return compact(negative, magnitude, 0);
  }

  /**
   * `Decimal(string:)` (matchEntireString: false) ou lecture d'un nombre JSON par JSONDecoder (true, par défaut ici).
   * Même analyse que `Decimal._decimal(from:decimalSeparator:matchEntireString:)` : chiffres au-delà de 2^128 ignorés
   * (exposant augmenté), exposant `e±n`, « -0 » lu comme 0. `null` quand Swift renvoie nil.
   */
  static parse(text: string, matchEntireString = true): Decimal | null {
    const n = text.length;
    // Espaces ASCII seulement : Swift lit le texte octet par octet (UTF-8).
    const isSpace = (c: string) => c === ' ' || (c >= '\t' && c <= '\r');
    const digit = (c: string | undefined) => (c !== undefined && c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : null);
    let i = 0;
    while (i < n && isSpace(text[i])) i++;
    let negative = false;
    if (i < n && (text[i] === '+' || text[i] === '-')) {
      negative = text[i] === '-';
      i++;
    }
    let m = 0n;
    let e = 0;
    let tooBigToFit = false;
    for (let d = digit(text[i]); d !== null; d = digit(text[++i])) {
      if (!tooBigToFit) {
        const next = m * 10n + BigInt(d);
        if (next < MANTISSA_LIMIT) {
          m = next;
          continue;
        }
        tooBigToFit = true;
      }
      if (e === MAX_EXPONENT) return null;
      e += 1;
    }
    if (i < n && text[i] === '.') {
      i++;
      for (let d = digit(text[i]); d !== null; d = digit(text[++i])) {
        if (tooBigToFit) continue;
        const next = m * 10n + BigInt(d);
        if (next >= MANTISSA_LIMIT) {
          tooBigToFit = true;
          continue;
        }
        m = next;
        if (e === MIN_EXPONENT) return null;
        e -= 1;
      }
    }
    if (i < n && (text[i] === 'e' || text[i] === 'E')) {
      i++;
      // « 1234e » : accepté tel quel par NSDecimal (sans compactage).
      if (i === n) return new Decimal(negative, m, e);
      let exponentIsNegative = false;
      if (text[i] === '-' || text[i] === '+') {
        exponentIsNegative = text[i] === '-';
        i++;
      }
      let exponent = 0;
      for (let d = digit(text[i]); d !== null; d = digit(text[++i])) {
        exponent = 10 * exponent + d;
        if (exponent > 2 * MAX_EXPONENT) return null;
      }
      exponent = (exponentIsNegative ? -exponent : exponent) + e;
      if (exponent > MAX_EXPONENT || exponent < MIN_EXPONENT) return null;
      e = exponent;
    }
    if (matchEntireString) {
      while (i < n && isSpace(text[i])) i++;
      if (i !== n) return null;
    }
    if (i === 0) return null;
    const result = compact(negative, m, e);
    return result.isNaN ? Decimal.zero : result;
  }

  /**
   * `Decimal(Double)` : multiplie (ou divise) le double par 10 jusqu'à approcher 2^64, puis tronque. Ce n'est pas la
   * valeur exacte du double : les ×10 successifs arrondissent en binaire, comme sur l'iPhone (mêmes doubles IEEE 754).
   */
  static fromDouble(value: number): Decimal {
    if (Number.isNaN(value)) return Decimal.nan;
    if (!Number.isFinite(value)) throw new RangeError('Decimal does not yet fully adopt FloatingPoint');
    if (value === 0) return Decimal.zero;
    const negative = value < 0;
    let val = negative ? -1 * value : value;
    let exponent = 0;
    const twoTo64 = 18446744073709551616; // Double(UInt64.max - 1) == Double(UInt64.max) == 2^64
    while (val < twoTo64) {
      if (exponent <= MIN_EXPONENT) return Decimal.nan;
      val *= 10.0;
      exponent -= 1;
    }
    while (twoTo64 <= val) {
      if (exponent >= MAX_EXPONENT) return Decimal.nan;
      val /= 10.0;
      exponent += 1;
    }
    const maxMantissa = 18446744073709549568; // Double(UInt64.max).nextDown
    const mantissa = BigInt(val > maxMantissa ? maxMantissa : Math.trunc(val));
    return compact(negative, mantissa, exponent);
  }

  /** `Swift.min(x, y)` : `y < x ? y : x`. */
  static min(x: DecimalLike, y: DecimalLike): Decimal {
    const a = Decimal.from(x);
    const b = Decimal.from(y);
    return b.lt(a) ? b : a;
  }

  /** `Swift.max(x, y)` : `y >= x ? y : x` (à égalité, y). */
  static max(x: DecimalLike, y: DecimalLike): Decimal {
    const a = Decimal.from(x);
    const b = Decimal.from(y);
    return !b.lt(a) ? b : a;
  }

  get isNaN(): boolean {
    return this.mantissa === 0n && this.negative;
  }

  get isZero(): boolean {
    return this.mantissa === 0n && !this.negative;
  }

  // Opérateurs Swift (+, −, ×, ÷ en mode .plain ; NaN en cas d'erreur).

  plus(other: DecimalLike): Decimal {
    return attempt(() => add(this, Decimal.from(other)));
  }

  minus(other: DecimalLike): Decimal {
    return attempt(() => add(this, Decimal.from(other).negated()));
  }

  times(other: DecimalLike): Decimal {
    return attempt(() => multiply(this, Decimal.from(other)));
  }

  dividedBy(other: DecimalLike): Decimal {
    return attempt(() => divide(this, Decimal.from(other)));
  }

  /** `pow(Decimal, Int)` : multiplications successives (chacune tronquée à 38 chiffres). */
  pow(exponent: number): Decimal {
    return attempt(() => power(this, exponent));
  }

  /** `-x` (`negate()`) : zéro et NaN inchangés. */
  negated(): Decimal {
    return this.mantissa === 0n ? this : new Decimal(!this.negative, this.mantissa, this.exponent);
  }

  /** `abs(x)` (`magnitude`). */
  abs(): Decimal {
    return this.mantissa === 0n || !this.negative ? this : new Decimal(false, this.mantissa, this.exponent);
  }

  /**
   * `rounded(scale:mode:)` de l'app (ImmoDomain/Common/Decimal+Rounding.swift), c'est-à-dire NSDecimalRound :
   * arrondi exact à `scale` décimales. `.plain` : au plus proche, égalité loin de zéro (−420,5 → −421) ; `.bankers` :
   * égalité au chiffre pair ; `.up` / `.down` : vers +∞ / −∞. Une erreur laisse le résultat initial de l'app (0).
   */
  rounded(scale: number, mode: RoundingMode = 'plain'): Decimal {
    try {
      return round(this, scale, mode);
    } catch (error) {
      if (error instanceof DecimalOverflow) return Decimal.zero;
      throw error;
    }
  }

  /** Arrondi au centime (`roundedToCents`). */
  get roundedToCents(): Decimal {
    return this.rounded(2);
  }

  /** `Decimal._compare` : −1, 0 ou 1 ; NaN est plus petit que tout le reste. */
  compare(other: DecimalLike): -1 | 0 | 1 {
    return compare(this, Decimal.from(other));
  }

  /** `==` : mêmes bits, ou comparaison égale. */
  eq(other: DecimalLike): boolean {
    const o = Decimal.from(other);
    if (o.negative === this.negative && o.mantissa === this.mantissa && o.exponent === this.exponent) return true;
    return compare(this, o) === 0;
  }

  lt(other: DecimalLike): boolean {
    return compare(this, Decimal.from(other)) === -1;
  }

  lte(other: DecimalLike): boolean {
    return !Decimal.from(other).lt(this);
  }

  gt(other: DecimalLike): boolean {
    return Decimal.from(other).lt(this);
  }

  gte(other: DecimalLike): boolean {
    return !this.lt(other);
  }

  /** `description` : « 1043.93 », « -420.43 », « 0.0567 », « 275000 », « NaN ». */
  toString(): string {
    if (this.isNaN) return 'NaN';
    if (this.mantissa === 0n) return '0';
    const digits = this.mantissa.toString();
    let text: string;
    if (this.exponent >= 0) text = digits + '0'.repeat(this.exponent);
    else if (digits.length > -this.exponent) text = `${digits.slice(0, digits.length + this.exponent)}.${digits.slice(digits.length + this.exponent)}`;
    else text = `0.${'0'.repeat(-this.exponent - digits.length)}${digits}`;
    return this.negative ? `-${text}` : text;
  }

  toJSON(): string {
    return this.toString();
  }

  /**
   * Double le plus proche de la valeur exacte (via son texte). Sûr pour trier ou comparer à un seuil : deux décimaux
   * différents d'au plus 15 chiffres significatifs (montants au centime, rendements à 4 décimales) restent deux
   * doubles différents, dans le même ordre. Pour afficher, passer par display.ts, qui arrondit en décimal.
   */
  toNumber(): number {
    return Number(this.toString());
  }

  /**
   * `NSDecimalNumber(decimal:).doubleValue` (Decimal.doubleValue de swift-foundation) : mantisse convertie mot par mot,
   * puis divisée (ou multipliée) par 10 autant de fois que l'exposant. Peut différer de `toNumber()` au dernier bit.
   */
  doubleValue(): number {
    if (this.mantissa === 0n) return this.negative ? Number.NaN : 0;
    let d = 0;
    for (let index = Math.min(wordCount(this.mantissa), MAX_SIZE) - 1; index >= 0; index--) {
      d = d * 65536 + Number((this.mantissa >> BigInt(16 * index)) & 0xffffn);
    }
    if (this.exponent < 0) {
      for (let i = this.exponent; i < 0; i++) d /= 10.0;
    } else {
      for (let i = 0; i < this.exponent; i++) d *= 10.0;
    }
    return this.negative ? -d : d;
  }
}

/** Raccourci pour les littéraux : `D(12)`, `D('0.035')`. */
export const D = (value: DecimalLike): Decimal => Decimal.from(value);

function attempt(operation: () => Decimal): Decimal {
  try {
    return operation();
  } catch (error) {
    if (error instanceof DecimalOverflow) return Decimal.nan;
    throw error;
  }
}

// MARK: - Opérations de Decimal+Math.swift

/** `compact()` : retire les zéros de droite de la mantisse (zéro et NaN inchangés). */
function compact(negative: boolean, m: bigint, e: number): Decimal {
  if (m === 0n) return negative ? Decimal.nan : Decimal.zero;
  while (m % 10n === 0n) {
    m /= 10n;
    e += 1;
  }
  while (e > MAX_EXPONENT) {
    m *= 10n;
    e -= 1;
  }
  return Decimal.raw(negative, m, e);
}

/** `_fitMantissa` : ramène l'entier sous 2^128 en le divisant par 10 (par 10 000 tant qu'il dépasse 9 mots). Tronque. */
function fitMantissa(value: bigint): [bigint, number] {
  if (wordCount(value) <= MAX_SIZE) return [value, 0];
  let result = value;
  let exponent = 0;
  while (wordCount(result) > MAX_SIZE + 1) {
    result /= 10000n;
    exponent += 4;
  }
  while (wordCount(result) > MAX_SIZE) {
    result /= 10n;
    exponent += 1;
  }
  return [result, exponent];
}

/**
 * `_normalize` : met les deux nombres au même exposant. Celui qui a le plus grand exposant est multiplié par
 * 10^écart si sa mantisse le permet ; sinon il prend ce qu'il peut (⌊(8 − mots) × 4,81647993⌋ chiffres) et l'autre
 * est divisé, en tronquant (il peut tomber à zéro).
 */
function normalize(a: Decimal, b: Decimal): [Decimal, Decimal] {
  let diff = a.exponent - b.exponent;
  if (diff === 0) return [a, b];
  const swapped = diff < 0;
  let aa = swapped ? b : a;
  let bb = swapped ? a : b;
  if (swapped) diff = -diff;
  const scaled = aa.mantissa * pow10(diff);
  if (wordCount(scaled) <= MAX_SIZE) {
    aa = Decimal.raw(aa.negative, scaled, bb.exponent);
  } else {
    const maxPowerTen = Math.floor((MAX_SIZE - wordCount(aa.mantissa)) * 4.81647993);
    const divided = bb.mantissa / pow10(diff - maxPowerTen);
    bb = Decimal.raw(bb.negative, divided, bb.exponent + (diff - maxPowerTen));
    if (divided !== 0n) {
      aa = Decimal.raw(aa.negative, aa.mantissa * pow10(maxPowerTen), aa.exponent - maxPowerTen);
    } else {
      bb = Decimal.raw(bb.negative, 0n, aa.exponent);
    }
  }
  return swapped ? [bb, aa] : [aa, bb];
}

function add(lhs: Decimal, rhs: Decimal): Decimal {
  if (lhs.isNaN || rhs.isNaN) throw new DecimalOverflow();
  if (lhs.mantissa === 0n) return rhs;
  if (rhs.mantissa === 0n) return lhs;
  const [a, b] = normalize(lhs, rhs);
  if (a.mantissa === 0n) return b;
  if (b.mantissa === 0n) return a;
  if (a.negative === b.negative) {
    let m = a.mantissa + b.mantissa;
    let e = a.exponent;
    if (wordCount(m) > MAX_SIZE) {
      const [fitted, k] = fitMantissa(m);
      if (e + k > MAX_EXPONENT) throw new DecimalOverflow();
      m = fitted;
      e += k;
    }
    return compact(a.negative, m, e);
  }
  if (a.mantissa === b.mantissa) return Decimal.zero;
  return a.mantissa < b.mantissa
    ? compact(b.negative, b.mantissa - a.mantissa, a.exponent)
    : compact(a.negative, a.mantissa - b.mantissa, a.exponent);
}

function multiply(lhs: Decimal, rhs: Decimal): Decimal {
  if (lhs.isNaN || rhs.isNaN) throw new DecimalOverflow();
  if (lhs.mantissa === 0n || rhs.mantissa === 0n) return Decimal.zero;
  let m = lhs.mantissa * rhs.mantissa;
  let e = lhs.exponent + rhs.exponent;
  if (wordCount(m) > MAX_SIZE) {
    const [fitted, k] = fitMantissa(m);
    m = fitted;
    e += k;
  }
  // Swift ne contrôle que le dépassement par le haut ; en dessous de −128, l'iPhone s'arrêterait (Int8).
  if (e > MAX_EXPONENT || e < MIN_EXPONENT) throw new DecimalOverflow();
  return compact(lhs.negative !== rhs.negative, m, e);
}

function divide(dividend: Decimal, divisor: Decimal): Decimal {
  if (dividend.isNaN || divisor.isNaN) throw new DecimalOverflow();
  if (divisor.mantissa === 0n) throw new DecimalOverflow(); // divideByZero : NaN aussi
  if (dividend.mantissa === 0n) return Decimal.zero;
  let a = dividend;
  let b = divisor;
  // Écart d'exposants d'au moins 19 : normalisation d'abord (sauf si elle annule l'un des deux).
  if (a.exponent - b.exponent >= 19) {
    [a, b] = normalize(a, b);
    if (a.mantissa === 0n || b.mantissa === 0n) {
      a = dividend;
      b = divisor;
    }
  }
  const quotient = (a.mantissa * pow10(38)) / b.mantissa;
  const [m, k] = fitMantissa(quotient);
  const e = a.exponent - b.exponent - 38 + k;
  if (e < MIN_EXPONENT || e > MAX_EXPONENT) throw new DecimalOverflow();
  return compact(a.negative !== b.negative, m, e);
}

function power(x: Decimal, exponent: number): Decimal {
  if (x.isNaN) throw new DecimalOverflow();
  if (exponent === 0) return Decimal.one;
  if (x.eq(Decimal.zero)) return exponent > 0 ? Decimal.zero : Decimal.nan;
  let p = Math.abs(exponent);
  let result = x;
  let temporary = Decimal.one;
  while (p > 1) {
    if ((p & 1) === 1) {
      temporary = multiply(temporary, result);
      p -= 1;
    }
    if (p !== 0) {
      result = multiply(result, result);
      p = Math.trunc(p / 2);
    }
  }
  result = multiply(temporary, result);
  return exponent < 0 ? divide(Decimal.one, result) : result;
}

function compare(lhs: Decimal, rhs: Decimal): -1 | 0 | 1 {
  if (lhs.isNaN) return rhs.isNaN ? 0 : -1;
  if (rhs.isNaN) return 1;
  if (lhs.negative && !rhs.negative) return -1;
  if (!lhs.negative && rhs.negative) return 1;
  if (lhs.mantissa === 0n) return rhs.mantissa !== 0n ? -1 : 0;
  if (rhs.mantissa === 0n) return 1;
  const [a, b] = normalize(lhs, rhs);
  const order = a.mantissa === b.mantissa ? 0 : a.mantissa < b.mantissa ? -1 : 1;
  return a.negative && order !== 0 ? (order === 1 ? -1 : 1) : order;
}

/** Faut-il ajouter 1 à la mantisse tronquée ? `digit` : premier chiffre retiré (déjà corrigé par les suivants). */
function roundsAway(negative: boolean, mode: RoundingMode, digit: number, quotientIsEven: boolean): boolean {
  if (mode === 'bankers' && digit === 5 && quotientIsEven) digit = 4;
  if (negative) {
    // Vers +∞ (up) : on garde la troncature ; vers −∞ (down) : on s'éloigne de zéro.
    if (mode === 'up') return false;
    if (mode === 'down') return true;
    return digit >= 5;
  }
  if (mode === 'down') return false;
  if (mode === 'up') return true;
  return digit >= 5;
}

/** `_round(scale:roundingMode:)` (NSDecimalRound). */
function round(x: Decimal, scale: number, mode: RoundingMode): Decimal {
  let s = scale + x.exponent;
  if (scale === 32767 || s >= 0) return x;
  s = -s;
  let exponent = x.exponent + s;
  const divisor = pow10(s);
  let q = x.mantissa / divisor;
  const dropped = x.mantissa % divisor;
  const lead = pow10(s - 1);
  let digit = Number(dropped / lead);
  // 0,50001 vaut 0,6 : les chiffres suivants départagent une égalité apparente.
  if (dropped % lead !== 0n && (digit === 0 || digit === 5)) digit += 1;
  let negative = x.negative;
  if (digit !== 0) {
    if (roundsAway(negative, mode, digit, (q & 1n) === 0n)) {
      q += 1n;
      if (q >= MANTISSA_LIMIT) throw new DecimalOverflow();
    }
    if (negative && q === 0n) negative = false;
  }
  while (exponent > MAX_EXPONENT) {
    exponent -= 1;
    q *= 10n;
    if (q >= MANTISSA_LIMIT) throw new DecimalOverflow();
  }
  return compact(negative, q, exponent);
}
