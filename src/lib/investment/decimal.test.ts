import { describe, expect, it } from 'vitest';
import { D, Decimal } from './decimal';

// Comportements de Foundation.Decimal (swift-foundation 6.2) dont dépendent les centimes de l'app.

const s = (value: Decimal) => value.toString();

describe('Decimal : lecture et écriture', () => {
  it('compacte la mantisse comme Swift : "275000.00" vaut 275 × 10^3', () => {
    const price = D('275000.00');
    expect([price.mantissa, price.exponent, price.negative]).toEqual([275n, 3, false]);
    expect(s(price)).toBe('275000');
    expect(s(D('1043.930'))).toBe('1043.93');
    expect(s(D('-420.43'))).toBe('-420.43');
    expect(s(D('0.0567'))).toBe('0.0567');
    expect(s(D('-0'))).toBe('0');
  });

  it('lit un nombre JSON comme JSONDecoder (texte du nombre, 15 chiffres au plus)', () => {
    for (const text of ['275000.00', '1234.56', '0.035', '180.10', '999999999999.99', '1e21', '1.5e-7']) {
      expect(D(JSON.parse(text) as number).eq(Decimal.parse(text)!)).toBe(true);
    }
    // Le double de 0,1 + 0,2 n'est pas celui de 0,3 ; en décimal, la somme est exacte.
    expect(0.1 + 0.2 === 0.3).toBe(false);
    expect(s(D(0.1).plus(D(0.2)))).toBe('0.3');
  });

  it('suit Decimal(string:) : exposant, signes, texte invalide, débordement de la mantisse', () => {
    expect(s(Decimal.parse('1e3')!)).toBe('1000');
    expect(s(Decimal.parse('+12.5E-2')!)).toBe('0.125');
    expect(Decimal.parse('abc')).toBeNull();
    expect(Decimal.parse('')).toBeNull();
    expect(Decimal.parse('12abc')).toBeNull();
    expect(s(Decimal.parse('12abc', false)!)).toBe('12');
    expect(Decimal.parse('1e300')).toBeNull();
    // Au-delà de 2^128, les chiffres suivants ne comptent que dans l'exposant.
    expect(s(Decimal.parse('1234567890123456789012345678901234567891')!)).toBe('1234567890123456789012345678901234567890');
  });
});

describe('Decimal : opérations tronquées à 38 chiffres', () => {
  it('tronque les divisions au lieu de les arrondir', () => {
    expect(s(D(1).dividedBy(3))).toBe('0.33333333333333333333333333333333333333');
    expect(s(D(2).dividedBy(3))).toBe('0.66666666666666666666666666666666666666');
    expect(s(D(1).dividedBy(7))).toBe('0.14285714285714285714285714285714285714');
    // Jusqu'à 39 chiffres quand la mantisse reste sous 2^128.
    expect(s(D('0.035').dividedBy(12))).toBe('0.00291666666666666666666666666666666666666');
  });

  it('tronque les produits trop longs', () => {
    const third = D(1).dividedBy(3);
    expect(s(third.times(third))).toBe('0.111111111111111111111111111111111111108');
  });

  it("tronque le petit terme d'une addition aux exposants éloignés (1 + taux mensuel)", () => {
    // 1 × 10^41 ne tient pas sur 128 bits : 1 garde 33 décimales, le taux est coupé à 33 décimales.
    expect(s(D(1).plus(D('0.035').dividedBy(12)))).toBe('1.002916666666666666666666666666666');
    // Trop loin : le petit terme disparaît.
    expect(s(D('1e30').plus(D('1e-10')))).toBe('1000000000000000000000000000000');
  });

  it('calcule pow par carrés successifs', () => {
    expect(s(D(2).pow(10))).toBe('1024');
    expect(s(D('1.1').pow(2))).toBe('1.21');
    expect(s(D(5).pow(0))).toBe('1');
    expect(s(D(0).pow(3))).toBe('0');
    expect(D(0).pow(-1).isNaN).toBe(true);
    expect(s(D(2).pow(-2))).toBe('0.25');
  });

  it('donne NaN en cas d’erreur, comme les opérateurs Swift', () => {
    expect(D(1).dividedBy(0).isNaN).toBe(true);
    expect(Decimal.nan.plus(1).isNaN).toBe(true);
    expect(Decimal.greatestFiniteMagnitude.times(10).isNaN).toBe(true);
    expect(s(D(5).minus(5))).toBe('0');
  });
});

describe('Decimal : NSDecimalRound', () => {
  const round = (text: string, scale: number, mode?: 'plain' | 'down' | 'up' | 'bankers') => s(D(text).rounded(scale, mode));

  it('arrondit .plain au plus proche, égalité loin de zéro', () => {
    expect(round('2.5', 0)).toBe('3');
    expect(round('-2.5', 0)).toBe('-3');
    expect(round('-420.5', 0)).toBe('-421');
    expect(round('-83.335', 2)).toBe('-83.34');
    expect(round('14999.925', 2)).toBe('14999.93');
    expect(round('0.05625', 4)).toBe('0.0563');
    expect(round('1.2349', 2)).toBe('1.23');
    expect(round('1043.92749236956806974133124667389693112', 2)).toBe('1043.93');
  });

  it('arrondit .bankers au chiffre pair, sauf si des chiffres suivent', () => {
    expect(round('2.5', 0, 'bankers')).toBe('2');
    expect(round('3.5', 0, 'bankers')).toBe('4');
    expect(round('-2.5', 0, 'bankers')).toBe('-2');
    expect(round('0.0565', 3, 'bankers')).toBe('0.056');
    expect(round('0.05650001', 3, 'bankers')).toBe('0.057');
  });

  it('arrondit .up vers +∞ et .down vers −∞', () => {
    expect(round('2.1', 0, 'up')).toBe('3');
    expect(round('-2.9', 0, 'up')).toBe('-2');
    expect(round('2.9', 0, 'down')).toBe('2');
    expect(round('-2.1', 0, 'down')).toBe('-3');
    expect(round('37.8', -2, 'up')).toBe('100');
  });

  it('rend un zéro positif et laisse intacte une valeur déjà assez courte', () => {
    const zero = D('-0.004').rounded(2);
    expect(zero.isZero).toBe(true);
    expect(zero.negative).toBe(false);
    expect(round('12.3', 2)).toBe('12.3');
    expect(D('1043.93').roundedToCents.eq(D('1043.93'))).toBe(true);
  });
});

describe('Decimal : comparaisons', () => {
  it('compare comme Swift, NaN sous tout le reste', () => {
    expect(D('1.50').eq('1.5')).toBe(true);
    expect(D(-1).lt(0)).toBe(true);
    expect(D(0).lt(D('1e-30'))).toBe(true);
    expect(D(-5).compare(-3)).toBe(-1);
    expect(D(-3).compare(-3)).toBe(0);
    expect(Decimal.nan.lt(D('-1e30'))).toBe(true);
    expect(Decimal.nan.eq(Decimal.nan)).toBe(true);
    expect(D(245000).lt(Decimal.greatestFiniteMagnitude)).toBe(true);
  });

  it('reprend min et max de Swift (à égalité : x pour min, y pour max)', () => {
    const a = D('2.0');
    const b = Decimal.raw(false, 20n, -1); // même valeur, autre représentation
    expect(Decimal.min(a, b)).toBe(a);
    expect(Decimal.max(a, b)).toBe(b);
    expect(s(Decimal.max(0, D(-3)))).toBe('0');
    expect(s(Decimal.min(Decimal.greatestFiniteMagnitude, 193500))).toBe('193500');
  });
});

describe('Decimal : doubles', () => {
  it('reprend Decimal(Double) et doubleValue de Foundation', () => {
    expect(s(Decimal.fromDouble(0.1))).toBe('0.1');
    expect(s(Decimal.fromDouble(-2.5))).toBe('-2.5');
    expect(Decimal.fromDouble(Number.NaN).isNaN).toBe(true);
    expect(D('0.1').doubleValue()).toBe(0.1);
    expect(D('-1043.93').doubleValue()).toBeCloseTo(-1043.93, 12);
    expect(D('0.0567').toNumber()).toBe(0.0567);
  });
});
