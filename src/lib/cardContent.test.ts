import { describe, expect, it } from 'vitest';
import { cardContent, compactAmount, formatFacts, formatShortFact, homeTypeLine, shortDay, shortFacts } from './cardContent';
import type { ListingRow } from './listings';
import type { SearchMode } from './labels';
import type { Highlights } from './search';
import { testRow } from './testRows';

// Mêmes scénarios que l'app (Packages/ImmoKit/Tests/ImmoDomainTests/ListingCardContentTests.swift).
const now = new Date(1_793_000_000 * 1000);
const highlights: Highlights = { grossYield: 0.078, netYield: 0.052, monthlyCashFlow: -62, isRentEstimated: false };
const row = (o: Partial<ListingRow> = {}, daysAgo = 30) =>
  testRow({ price: 238000, living_area: 62, rooms: 3, energy_class: 'C', city: 'Lyon 2e', postal_code: '69002', monthly_charges: null,
    published_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(), ...o });
const card = (r: ListingRow, mode: SearchMode | null, h: Highlights | null = null) => cardContent(r, mode, h, now);

describe('fiches', () => {
  it('achat : pièces, prix au m², DPE, jamais de rendement', () => {
    const c = card(row(), 'buy', highlights);
    expect(c.kind).toBe('purchase');
    expect(c.price).toEqual({ kind: 'sale', value: 238000 });
    expect(c.facts).toEqual([{ kind: 'rooms', value: 3 }, { kind: 'pricePerSquareMeter', value: 3839 }, { kind: 'energyClass', value: 'C' }]);
  });

  it('location : charges, ameublement, disponibilité ; loyer CC ou HC', () => {
    const available = new Date(now.getTime() + 10 * 86_400_000);
    const c = card(row({ transaction: 'rent', price: 850, living_area: 45, rooms: 2, monthly_charges: 60,
      rental_info: { isFurnished: false, availableFrom: available.toISOString() } }), 'rent');
    expect(c.kind).toBe('rental');
    expect(c.price).toEqual({ kind: 'rentIncludingCharges', value: 910 });
    expect(c.facts.slice(0, 3)).toEqual([{ kind: 'monthlyCharges', value: 60 }, { kind: 'furnished', value: false }, { kind: 'availableFrom', value: available }]);
    expect(card(row({ transaction: 'rent', price: 850 }), 'rent').price).toEqual({ kind: 'rentExcludingCharges', value: 850 });
  });

  it('investissement : loyer actuel ou potentiel, jamais mélangés ; « à calculer » sans loyer', () => {
    const c = card(row({ rental_info: { currentMonthlyRent: 1547, isLeased: true } }), 'invest', highlights);
    expect(c.kind).toBe('investment');
    expect(c.facts).toEqual([{ kind: 'grossYield', value: 0.078 }, { kind: 'currentRent', value: 1547 }, { kind: 'estimatedCashFlow', value: -62 }]);
    const potential = card(row({ rental_info: { potentialMonthlyRent: 1500 } }), 'invest', highlights);
    expect(potential.facts).toContainEqual({ kind: 'potentialRent', value: 1500 });
    expect(card(row(), 'invest').facts).toEqual([{ kind: 'yieldToCompute' }]);
    expect(card(row({ rental_info: { isLeased: true } }), 'buy', highlights).kind).toBe('investment');
  });

  it('hôtel avec et sans chiffre d’affaires', () => {
    const c = card(row({ property_type: 'hotel', price: 2_400_000, living_area: 820, rooms: 28,
      asset_details: { hotel: { _0: { rooms: 28, annualRevenue: { value: 680000, origin: 'seller' }, ebitda: { value: 125000, origin: 'seller' }, scope: 'wallsAndBusiness' } } } }), 'hotel');
    expect(c.kind).toBe('hotel');
    expect(c.facts).toEqual([
      { kind: 'hotelRooms', value: 28 }, { kind: 'annualRevenue', value: { value: 680000, origin: 'seller' } },
      { kind: 'ebitda', value: { value: 125000, origin: 'seller' } }, { kind: 'hotelScope', value: 'wallsAndBusiness' },
    ]);
    const bare = card(row({ property_type: 'hotel', rooms: 9, asset_details: { hotel: { _0: { rooms: 9 } } } }), null);
    expect(bare.facts).toEqual([{ kind: 'hotelRooms', value: 9 }, { kind: 'revenueNotDisclosed' }]);
  });

  it('local loué ou libre, bureaux', () => {
    const leased = card(row({ property_type: 'commercial', price: 199000, living_area: 85, rental_info: { currentMonthlyRent: 725, isLeased: true } }), null,
      { grossYield: 0.044, netYield: 0, monthlyCashFlow: 0, isRentEstimated: false });
    expect(leased.facts.slice(0, 2)).toEqual([{ kind: 'leased', annualRent: 8700 }, { kind: 'grossYield', value: 0.044 }]);
    expect(card(row({ property_type: 'commercial', rental_info: { isLeased: false } }), null).facts).toEqual([{ kind: 'vacant' }]);
    const office = card(row({ property_type: 'office', price: 540000, living_area: 210, rooms: null, rental_info: { isLeased: false },
      asset_details: { office: { _0: { workstations: 24, parkingSpaces: 6 } } } }), null);
    expect(office.facts).toEqual([{ kind: 'vacant' }, { kind: 'workstations', value: 24 }, { kind: 'parkingSpaces', value: 6 }]);
  });

  it('terrain : seulement l’urbanisme documenté', () => {
    const c = card(row({ property_type: 'land', price: 185000, living_area: 0, rooms: null, energy_class: null, land_area: 740,
      asset_details: { land: { _0: { zoning: 'UB', buildability: { floorArea: 320, documentReference: 'CU 069 123 25 00012' }, isServiced: true } } } }), null);
    expect(c.kind).toBe('land');
    expect(c.area).toBe(740);
    expect(c.facts.slice(0, 3)).toEqual([{ kind: 'zoning', value: 'UB' }, { kind: 'buildability', floorArea: 320 }, { kind: 'serviced', value: true }]);
    const bare = card(row({ property_type: 'land', living_area: 0, land_area: 500, asset_details: { land: { _0: {} } } }), null);
    expect(bare.facts).toEqual([{ kind: 'pricePerSquareMeter', value: 476 }]);
  });

  it('immeuble mixte : lots, loyers, rendement', () => {
    const c = card(row({ property_type: 'building', price: 399000, living_area: 200, rental_info: { currentMonthlyRent: 2700, isLeased: true },
      asset_details: { building: { _0: { residentialUnits: 3, commercialUnits: 1, vacantUnits: 0 } } } }), null,
      { grossYield: 0.081, netYield: 0, monthlyCashFlow: 0, isRentEstimated: false });
    expect(c.facts).toEqual([{ kind: 'units', residential: 3, commercial: 1 }, { kind: 'annualRent', value: 32400 }, { kind: 'grossYield', value: 0.081 }]);
  });

  it('pastilles Nouveau et Baisse de prix', () => {
    expect(card(row({}, 2), null).badge).toEqual({ kind: 'new' });
    expect(card(row({ previous_price: 259000 }, 2), null).badge).toEqual({ kind: 'priceDrop', previous: 259000 });
    expect(card(row({ previous_price: 200000 }), null).badge).toBeNull();
    expect(card(row({}, 30), null).badge).toBeNull();
  });

  it('panneau investissement : net et loyers annuels, sans mélanger les loyers', () => {
    const withRent = card(row({ rental_info: { currentMonthlyRent: 1060 } }), 'invest', highlights);
    expect(withRent.panelFacts).toEqual([
      { kind: 'grossYield', value: 0.078 }, { kind: 'netYield', value: 0.052 }, { kind: 'estimatedCashFlow', value: -62 }, { kind: 'annualRent', value: 12720 },
    ]);
    const end = new Date(now.getTime() + 200 * 86_400_000);
    const leased = card(row({ rental_info: { currentMonthlyRent: 1025, isLeased: true, leaseEndDate: end.toISOString(), isFurnished: true } }), null, highlights);
    expect(leased.panelFacts).toEqual([
      { kind: 'grossYield', value: 0.078 }, { kind: 'currentRent', value: 1025 }, { kind: 'leaseEnd', value: end }, { kind: 'furnished', value: true },
    ]);
    const purchase = card(row(), 'buy');
    expect(purchase.panelFacts).toEqual(purchase.facts);
  });

  it('textes et couleurs des faits, comme l’app', () => {
    const texts = formatFacts([{ kind: 'grossYield', value: 0.078 }, { kind: 'netYield', value: 0.052 }, { kind: 'estimatedCashFlow', value: -62.4 }], now)
      .map((f) => [f.text.replace(/[  ]/g, ' '), f.tone, f.isEstimate]);
    expect(texts).toEqual([
      ['Rendement brut : 7,8 %', 'positive', false],
      ['Rendement net (est.) : 5,2 %', 'positive', true],
      ['Cash-flow estimé : −62 €/mois', 'negative', true],
    ]);
  });
});

describe('petite ligne de l’accueil', () => {
  const line = (c: ReturnType<typeof card>) => shortFacts(c).map((fact) => {
    const t = formatShortFact(fact, now);
    return [t.label, t.value.replace(/[\u00A0\u202F]/g, ' '), t.shortLabel, t.energy, t.isMuted];
  });

  it('achat : prix au m² puis DPE en pastille', () => {
    expect(line(card(row(), null))).toEqual([[null, '3 839 €/m²', null, null, false], ['DPE', 'C', null, 'C', false]]);
  });

  it('location : ameublement et disponibilité', () => {
    const later = new Date(now.getTime() + 10 * 86_400_000);
    expect(line(card(row({ transaction: 'rent', price: 850, monthly_charges: 60, rental_info: { isFurnished: true, availableFrom: later.toISOString() } }), null)))
      .toEqual([[null, 'Meublé', null, null, false], ['Disponible le', shortDay(later), null, null, false]]);
    const past = new Date(now.getTime() - 86_400_000);
    expect(line(card(row({ transaction: 'rent', price: 850, rental_info: { availableFrom: past.toISOString() } }), null))[0])
      .toEqual(['Disponible', 'de suite', null, null, false]);
  });

  it('investissement : loyer encaissé, ou potentiel en gris ; immeuble : loyers encaissés', () => {
    const leased = card(row({ rental_info: { currentMonthlyRent: 1547, isLeased: true } }), null, highlights);
    expect(line(leased)).toEqual([['Loyer encaissé', '1 547 €/mois', 'Encaissés', null, false]]);
    const potential = card(row({ rental_info: { potentialMonthlyRent: 1500 } }), 'invest', highlights);
    expect(line(potential)).toEqual([['Loyer potentiel', '1 500 €/mois', 'Potentiel', null, true]]);
    const building = card(row({ property_type: 'building', price: 399000, living_area: 200, rental_info: { currentMonthlyRent: 2700, isLeased: true },
      asset_details: { building: { _0: { residentialUnits: 3, commercialUnits: 1, vacantUnits: 1 } } } }), null, highlights);
    expect(line(building)).toEqual([['Loyers encaissés', '2 700 €/mois', 'Encaissés', null, false]]);
  });

  it('hôtel, terrain et local libre', () => {
    const hotel = card(row({ property_type: 'hotel', price: 2_400_000, rooms: 28,
      asset_details: { hotel: { _0: { rooms: 28, annualRevenue: { value: 1_240_000, origin: 'seller' }, scope: 'wallsOnly' } } } }), null);
    expect(line(hotel).map((fact) => [fact[0], fact[1]])).toEqual([['CA', '1,2 M€'], [null, 'Murs seuls']]);
    const land = card(row({ property_type: 'land', living_area: 0, land_area: 740, asset_details: { land: { _0: { zoning: 'UB', isServiced: false } } } }), null);
    expect(line(land).map((fact) => [fact[0], fact[1]])).toEqual([['Zone PLU', 'UB'], [null, 'Non viabilisé'], [null, '322 €/m²']]);
    expect(line(card(row({ property_type: 'commercial', rental_info: { isLeased: false } }), null))).toEqual([[null, 'Libre de toute occupation', null, null, false]]);
  });

  it('montants courts, jour court et ligne du type', () => {
    expect(compactAmount(680_000).replace(/[\u00A0\u202F]/g, ' ')).toBe('680 k€');
    expect(compactAmount(2_000_000).replace(/[\u00A0\u202F]/g, ' ')).toBe('2 M€');
    expect(shortDay(new Date(2026, 11, 1))).toBe('1er déc.');
    expect(shortDay(new Date(2026, 11, 4))).toBe('4 déc.');
    expect(homeTypeLine({ property_type: 'apartment', rooms: 3, living_area: 62 }).replace(/[\u00A0\u202F]/g, ' ')).toBe('Appartement 3 pièces · 62 m²');
    expect(homeTypeLine({ property_type: 'building', rooms: 8, living_area: 250 }).replace(/[\u00A0\u202F]/g, ' ')).toBe('Immeuble de rapport · 250 m²');
    expect(homeTypeLine({ property_type: 'house', rooms: 1, living_area: 0 })).toBe('Maison locative 1 pièce');
    // Hors Investir : le libellé courant du type.
    expect(homeTypeLine({ property_type: 'house', rooms: 5, living_area: 128 }, false).replace(/[\u00A0\u202F]/g, ' ')).toBe('Maison 5 pièces · 128 m²');
    expect(homeTypeLine({ property_type: 'building', rooms: 8, living_area: 0 }, false)).toBe('Immeuble');
  });
});
