import { describe, expect, it } from 'vitest';
import { D, Decimal } from './decimal';
import { HotelPerformance, RentalCost } from './rentalAndHotelFigures';

// Tests/InvestmentEngineTests/RentalAndHotelFiguresTests.swift — « Coût de la location et rentabilité hôtelière »

const flat = new RentalCost({ rentExcludingCharges: 1_150, charges: 110, area: 70, isFurnished: false, declaredDeposit: null, agencyFees: 840 });

describe('RentalCost', () => {
  it('rentalFigures', () => {
    expect(flat.rentIncludingCharges.eq(1_260)).toBe(true);
    expect(flat.rentPerSquareMeter!.rounded(1).eq(D('16.4'))).toBe(true);
    expect(flat.requiredIncome.eq(3_780)).toBe(true);
    expect(flat.deposit!.eq(1_150) && !flat.isDepositDeclared).toBe(true);
    expect(flat.entryTotal.eq(3_250)).toBe(true);
    expect(flat.incomeOptions.map(String)).toEqual(['3000', '3800', '4500']);
    expect(flat.share(3_800)!.times(100).rounded(0).eq(33)).toBe(true);
    expect(flat.verdict(3_800, false)).toBe('solid');
    expect(flat.share(3_000)!.times(100).rounded(0).eq(42)).toBe(true);
    expect(flat.verdict(3_000, false)).toBe('guarantorAdvised');
    expect(flat.verdict(3_000, true)).toBe('solidWithGuarantor');
    expect(flat.share(4_500)!.times(100).rounded(0).eq(28)).toBe(true);
    const furnished = new RentalCost({ rentExcludingCharges: 600, charges: null, area: null, isFurnished: true, declaredDeposit: null, agencyFees: null });
    expect(furnished.deposit!.eq(1_200) && furnished.rentPerSquareMeter === null).toBe(true);
  });

  it('garde la règle des 3 × et le repère du tiers', () => {
    expect(RentalCost.incomeMultiple.eq(3)).toBe(true);
    expect(RentalCost.referenceShare.toString()).toBe('0.33333333333333333333333333333333333333');
    expect(flat.defaultIncome.eq(3_800)).toBe(true);
    expect(flat.share(0)).toBeNull();
  });
});

describe('HotelPerformance', () => {
  it('hotelFigures', () => {
    const hotel = new HotelPerformance({ annualRevenue: 1_180_000, ebitda: 236_000, rooms: 24, occupancyRate: D('0.78') });
    expect(hotel.margin!.times(1000).rounded(0).eq(200)).toBe(true);
    expect(hotel.monthlyRevenue.rounded(0).eq(98_333)).toBe(true);
    expect(hotel.monthlyCharges.rounded(0).eq(78_667)).toBe(true);
    expect(hotel.monthlyEbitda.rounded(0).eq(19_667)).toBe(true);
    expect(hotel.revPAR!.rounded(0).eq(135)).toBe(true);
    expect(hotel.averageRoomRate!.rounded(0).eq(173)).toBe(true);
    expect(hotel.maximumMonthlyPayment.rounded(0).eq(15_128)).toBe(true);
    const millions = (years: number, rate: string): Decimal => hotel.borrowingCapacity(years, D(rate)).dividedBy(10_000).rounded(0).dividedBy(100);
    expect(millions(20, '0.035').eq(D('2.61'))).toBe(true);
    expect(millions(15, '0.03').eq(D('2.19'))).toBe(true);
    expect(millions(25, '0.04').eq(D('2.87'))).toBe(true);
  });

  it('sans taux ni chambres', () => {
    const hotel = new HotelPerformance({ annualRevenue: 0, ebitda: 0, rooms: null, occupancyRate: null });
    expect(hotel.margin).toBeNull();
    expect(hotel.revPAR).toBeNull();
    expect(hotel.averageRoomRate).toBeNull();
    expect(hotel.borrowingCapacity(20, D('0.035')).eq(0)).toBe(true);
    const walls = new HotelPerformance({ annualRevenue: 1_180_000, ebitda: 236_000, rooms: 24, occupancyRate: D('0.78') });
    expect(walls.borrowingCapacity(20, D(0)).eq(walls.maximumMonthlyPayment.times(240))).toBe(true);
  });
});
