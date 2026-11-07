import { describe, expect, it } from 'vitest';
import {
  activeFilterCount, defaultDraft, draftFromParams, filterChips, matches, paramsFromDraft, resetFilters,
  type Highlights, type SearchDraft,
} from './search';
import { testRow } from './testRows';

// Filtres complets de l'app (SearchFiltersSheet.swift, SearchMatching.swift, SearchFilterChips.swift) : données
// inventées.

const plain = (s: string) => s.replace(/[  ]/g, ' ');
const labels = (draft: SearchDraft) => filterChips(draft).map((chip) => plain(chip.label));
const figures: Highlights = { grossYield: 0.08, netYield: 0.05, monthlyCashFlow: 40, isRentEstimated: false };

describe('critères communs', () => {
  it('chambres, étage, ascenseur, extérieur et parking', () => {
    const row = testRow({ bedrooms: 2, floor: 0, has_elevator: null, outdoor_spaces: ['garden'], parking: 'garage' });
    const buy = defaultDraft('buy');
    expect(matches(row, { ...buy, bedroomsMin: 2 }, null)).toBe(true);
    expect(matches(row, { ...buy, bedroomsMin: 3 }, null)).toBe(false);
    // Hors rez-de-chaussée relève l'étage minimum à 1 ; un étage inconnu est écarté.
    expect(matches(row, { ...buy, excludesGroundFloor: true }, null)).toBe(false);
    expect(matches({ ...row, floor: null }, { ...buy, floorMax: 3 }, null)).toBe(false);
    expect(matches({ ...row, floor: 2 }, { ...buy, floorMin: 1, floorMax: 3 }, null)).toBe(true);
    // Un minimum au-dessus du maximum n'est pas appliqué.
    expect(matches(row, { ...buy, floorMin: 5, floorMax: 2 }, null)).toBe(true);
    expect(matches(row, { ...buy, requiresElevator: true }, null)).toBe(false);
    expect(matches(row, { ...buy, outdoorSpaces: ['balcony', 'garden'] }, null)).toBe(true);
    expect(matches(row, { ...buy, outdoorSpaces: ['terrace'] }, null)).toBe(false);
    expect(matches(row, { ...buy, requiresParking: true }, null)).toBe(true);
    expect(matches({ ...row, parking: 'none' }, { ...buy, requiresParking: true }, null)).toBe(false);
  });

  it('DPE et année de construction', () => {
    const buy = defaultDraft('buy');
    const row = testRow({ energy_class: 'D', year_built: 1975 });
    expect(matches(row, { ...buy, worstEnergyClass: 'D' }, null)).toBe(true);
    expect(matches(row, { ...buy, worstEnergyClass: 'C' }, null)).toBe(false);
    expect(matches({ ...row, energy_class: null }, { ...buy, worstEnergyClass: 'G' }, null)).toBe(false);
    // En vente, le DPE vaut pour tous les biens ; en location, pas pour un parking.
    const parking = testRow({ transaction: 'rent', property_type: 'parking', energy_class: null, price: 90 });
    expect(matches(parking, { ...defaultDraft('rent'), worstEnergyClass: 'C' }, null)).toBe(true);
    expect(matches(row, { ...buy, yearBuiltMin: 1970, yearBuiltMax: 1980 }, null)).toBe(true);
    expect(matches(row, { ...buy, yearBuiltMin: 1990 }, null)).toBe(false);
    expect(matches({ ...row, year_built: null }, { ...buy, yearBuiltMax: 2000 }, null)).toBe(false);
  });
});

describe('Résidentiel', () => {
  it('neuf ou ancien, prix au m²', () => {
    const buy = defaultDraft('buy');
    const row = testRow({ is_new_build: null, price: 250_000, living_area: 50 });
    // Sans précision, le bien compte comme ancien (comme l'app).
    expect(matches(row, { ...buy, isNewBuild: false }, null)).toBe(true);
    expect(matches(row, { ...buy, isNewBuild: true }, null)).toBe(false);
    expect(matches(row, { ...buy, pricePerSquareMeterMax: 5_000 }, null)).toBe(true);
    expect(matches(row, { ...buy, pricePerSquareMeterMax: 4_999 }, null)).toBe(false);
    const land = testRow({ property_type: 'land', price: 60_000, living_area: 0, land_area: 600, rooms: null });
    expect(matches(land, { ...buy, pricePerSquareMeterMin: 100, pricePerSquareMeterMax: 100 }, null)).toBe(true);
    expect(matches({ ...land, land_area: null }, { ...buy, pricePerSquareMeterMax: 1_000 }, null)).toBe(false);
  });

  it('critères de terrain, seulement pour les terrains', () => {
    const buy = { ...defaultDraft('buy'), requiresServiced: true, zoning: 'au' };
    const land = testRow({
      property_type: 'land', rooms: null,
      asset_details: { land: { _0: { zoning: 'AUc', isServiced: true } } },
    });
    expect(matches(land, buy, null)).toBe(true);
    expect(matches(land, { ...buy, zoning: 'UB' }, null)).toBe(false);
    expect(matches(land, { ...buy, requiresDocumentedBuildability: true }, null)).toBe(false);
    expect(matches({ ...land, asset_details: null }, buy, null)).toBe(false);
    // Un appartement n'est pas concerné.
    expect(matches(testRow(), buy, null)).toBe(true);
  });
});

describe('Location', () => {
  const rent = defaultDraft('rent');
  const row = testRow({ transaction: 'rent', price: 800, monthly_charges: 60, rental_info: { availableFrom: '2026-12-01T00:00:00Z' } });

  it('charges maximum : une annonce sans charges est écartée', () => {
    expect(matches(row, { ...rent, maxMonthlyCharges: 60 }, null)).toBe(true);
    expect(matches(row, { ...rent, maxMonthlyCharges: 59 }, null)).toBe(false);
    expect(matches({ ...row, monthly_charges: null }, { ...rent, maxMonthlyCharges: 100 }, null)).toBe(false);
  });

  it('disponible au plus tard le jour choisi, ce jour compris', () => {
    expect(matches(row, { ...rent, availableBy: '2026-12-01' }, null)).toBe(true);
    expect(matches(row, { ...rent, availableBy: '2026-11-15' }, null)).toBe(false);
    expect(matches({ ...row, rental_info: {} }, { ...rent, availableBy: '2027-01-01' }, null)).toBe(false);
  });
});

describe('Investir', () => {
  const invest = defaultDraft('invest');
  const leased = testRow({ annual_property_tax: 900, monthly_charges: 100, rental_info: { isLeased: true, currentMonthlyRent: 900 } });

  it('taxe foncière, loyer déclaré, situation, loyer actuel et charges annuelles', () => {
    expect(matches(leased, { ...invest, maxAnnualPropertyTax: 900 }, figures)).toBe(true);
    expect(matches(leased, { ...invest, maxAnnualPropertyTax: 800 }, figures)).toBe(false);
    // Taxe non renseignée : l'annonce reste.
    expect(matches({ ...leased, annual_property_tax: null }, { ...invest, maxAnnualPropertyTax: 1 }, figures)).toBe(true);
    expect(matches(leased, { ...invest, requiresDeclaredRent: true }, { ...figures, isRentEstimated: true })).toBe(false);
    expect(matches(leased, { ...invest, leasedOnly: true }, figures)).toBe(true);
    expect(matches(leased, { ...invest, vacantOnly: true }, figures)).toBe(false);
    expect(matches(leased, { ...invest, minCurrentMonthlyRent: 900 }, figures)).toBe(true);
    expect(matches(leased, { ...invest, minCurrentMonthlyRent: 901 }, figures)).toBe(false);
    expect(matches(leased, { ...invest, maxAnnualCharges: 1_200 }, figures)).toBe(true);
    expect(matches(leased, { ...invest, maxAnnualCharges: 1_199 }, figures)).toBe(false);
    expect(matches({ ...leased, monthly_charges: null }, { ...invest, maxAnnualCharges: 5_000 }, figures)).toBe(false);
  });

  it('lots d’un immeuble : seulement pour les immeubles, détail absent = écarté', () => {
    const building = testRow({
      property_type: 'building',
      asset_details: { building: { _0: { residentialUnits: 4, commercialUnits: 1, vacantUnits: 1 } } },
    });
    expect(matches(building, { ...invest, minUnits: 5, maxVacantUnits: 1 }, figures)).toBe(true);
    expect(matches(building, { ...invest, minUnits: 6 }, figures)).toBe(false);
    expect(matches(building, { ...invest, maxVacantUnits: 0 }, figures)).toBe(false);
    expect(matches({ ...building, asset_details: null }, { ...invest, minUnits: 1 }, figures)).toBe(false);
    expect(matches(testRow(), { ...invest, minUnits: 10 }, figures)).toBe(true);
  });
});

describe('Hôtels', () => {
  const hotel = defaultDraft('hotel');
  const row = testRow({
    property_type: 'hotel', price: 2_000_000,
    asset_details: {
      hotel: {
        _0: {
          rooms: 20, stars: 3, scope: 'wallsAndBusiness',
          annualRevenue: { value: 900_000, origin: 'seller' }, ebitda: { value: 250_000, origin: 'seller' },
          occupancyRate: { value: 0.72, origin: 'seller' },
        },
      },
    },
  });

  it('classement, chiffre d’affaires, EBITDA, résultat et occupation', () => {
    expect(matches(row, { ...hotel, minHotelStars: 3, minAnnualRevenue: 900_000, minEbitda: 250_000, minOccupancyRatePercent: 72 }, null)).toBe(true);
    expect(matches(row, { ...hotel, minHotelStars: 4 }, null)).toBe(false);
    expect(matches(row, { ...hotel, minOccupancyRatePercent: 73 }, null)).toBe(false);
    // Résultat d'exploitation non communiqué : écarté dès qu'un minimum est fixé.
    expect(matches(row, { ...hotel, minOperatingIncome: 1 }, null)).toBe(false);
    // Un pourcentage hors 0–100 % n'est pas appliqué.
    expect(matches({ ...row, asset_details: null }, { ...hotel, minOccupancyRatePercent: 150 }, null)).toBe(true);
    expect(matches({ ...row, asset_details: null }, { ...hotel, minHotelStars: 1 }, null)).toBe(false);
  });
});

describe('adresse de la page et pastilles', () => {
  it('garde chaque critère dans l’adresse, mode par mode', () => {
    const drafts: SearchDraft[] = [
      {
        ...defaultDraft('buy'), bedroomsMin: 2, worstEnergyClass: 'D', excludesGroundFloor: true, floorMin: 1, floorMax: 4,
        yearBuiltMin: 1990, yearBuiltMax: 2010, requiresElevator: true, outdoorSpaces: ['balcony', 'garden'], requiresParking: true,
        isNewBuild: false, pricePerSquareMeterMin: 2_000, pricePerSquareMeterMax: 4_500, requiresDocumentedBuildability: true,
        requiresServiced: true, zoning: 'UB',
      },
      { ...defaultDraft('rent'), furnished: true, maxMonthlyCharges: 80, availableBy: '2026-12-15', floorMax: 3 },
      {
        ...defaultDraft('invest'), maxAnnualPropertyTax: 1_500, requiresDeclaredRent: true, vacantOnly: true,
        minCurrentMonthlyRent: 700, maxAnnualCharges: 2_400, minUnits: 3, maxVacantUnits: 1, yearBuiltMin: 1950,
      },
      {
        ...defaultDraft('hotel'), minHotelStars: 3, minAnnualRevenue: 500_000, minEbitda: 20_000, minOperatingIncome: 80_000,
        minOccupancyRatePercent: 65, hotelScope: 'wallsOnly', requiresParking: true,
      },
    ];
    for (const draft of drafts) expect(draftFromParams(paramsFromDraft(draft))).toEqual(draft);
    // Un critère que les filtres du mode ne proposent pas n'est pas lu.
    expect(draftFromParams(new URLSearchParams('mode=hotel&chambresMin=2&dpe=C&etageMin=2'))).toEqual(defaultDraft('hotel'));
    expect(draftFromParams(new URLSearchParams('mode=invest&etageMin=2&horsRdc=1&dispo=2026-02-31')).floorMin).toBeNull();
    expect(draftFromParams(new URLSearchParams('mode=rent&dispo=2026-02-31')).availableBy).toBeNull();
  });

  it('écrit les pastilles dans l’ordre de l’app', () => {
    expect(labels({
      ...defaultDraft('buy'), pricePerSquareMeterMax: 4_000, isNewBuild: true, bedroomsMin: 1, worstEnergyClass: 'C',
      floorMin: 2, yearBuiltMin: 2000, yearBuiltMax: 2020, zoning: 'UB', excludesGroundFloor: true, requiresElevator: true,
      outdoorSpaces: ['garden', 'balcony'], requiresParking: true,
    })).toEqual([
      'Prix au m² : 4 000 €/m²', 'Neuf', '1 chambre min', 'DPE A à C', 'Étage : min 2e', 'Construction : 2000 – 2020',
      'Zone UB', 'Hors rez-de-chaussée', 'Ascenseur', 'Balcon ou Jardin', 'Parking',
    ]);
    expect(labels({ ...defaultDraft('rent'), furnished: false, maxMonthlyCharges: 50, availableBy: '2026-12-05' }))
      .toEqual(['Non meublée', 'Charges : 50 € max', 'Dispo. avant le 5 déc.']);
    expect(labels({
      ...defaultDraft('invest'), minNetYieldPercent: 5, maxAnnualPropertyTax: 1_200, leasedOnly: true, requiresDeclaredRent: true,
      minCurrentMonthlyRent: 650, maxAnnualCharges: 20_000,
    })).toEqual(['Net : 5 %', 'Taxe foncière : 1 200 € max', 'Vendu loué', 'Loyer déclaré', 'Loyer actuel : 650 € min', 'Charges : 20 k€/an max']);
    expect(labels({
      ...defaultDraft('hotel'), roomsMin: 12, minHotelStars: 1, hotelScope: 'wallsOnly', minAnnualRevenue: 1_000_000,
      minEbitda: 150_000, minOperatingIncome: 90_000, minOccupancyRatePercent: 70,
    })).toEqual([
      '12 chambres min', '1 étoile et +', 'Murs seuls', 'CA : 1 000 k€ min', 'EBITDA : 150 k€ min',
      "Résultat d'exploitation : 90 k€ min", 'Occupation : 70 % min',
    ]);
  });

  it('compte une pastille par critère et réinitialise sans perdre le lieu', () => {
    const draft: SearchDraft = { ...defaultDraft('buy'), place: 'Lyon', radiusKm: 20, bedroomsMin: 2, requiresElevator: true };
    expect(activeFilterCount(draft)).toBe(3);
    const reset = resetFilters(draft);
    expect(reset).toEqual({ ...defaultDraft('buy'), place: 'Lyon', radiusKm: 20 });
    const chip = filterChips({ ...defaultDraft('invest'), types: ['building'], mixedBuilding: true }).find((c) => c.id === 'investmentKind');
    expect(chip?.remove({ ...defaultDraft('invest'), types: ['building'], mixedBuilding: true })).toEqual(defaultDraft('invest'));
  });
});
