import { describe, expect, it } from 'vitest';
import { testRow } from '../testRows';
import { HotelPerformance, RentalCost } from '../investment';
import { readAsset, rentalDetails } from './fields';
import { capacity, cardEuros, cardEuros1, cardPercent, signedCents } from './money';
import { initials, memberSince, publicName, publisherFrom } from './publisher';
import {
  feesLabel, featureRows, floorLabel, footnote, headerFacts, hotelActivity, leaseDuration, priceSecondary, rentalRows, saleCondition,
} from './rows';
import { shareText } from './share';

// Mêmes cas que les tests de l'app (ImmoKit/Tests) quand ils existent ; données inventées.
const s = ' ';
const nb = ' ';

describe('Coût de la location (RentalAndHotelFiguresTests)', () => {
  const flat = new RentalCost({ rentExcludingCharges: 1_150, charges: 110, area: 70, isFurnished: false, declaredDeposit: null, agencyFees: 840 });

  it('écrit les chiffres de la location comme la carte de l’app', () => {
    expect(cardEuros(flat.rentIncludingCharges)).toBe(`1${nb}260${nb}€`);
    expect(cardEuros1(flat.rentPerSquareMeter!)).toBe(`16,4${nb}€`);
    expect(cardEuros(flat.requiredIncome)).toBe(`3${nb}780${nb}€`);
    expect(cardEuros(flat.deposit!)).toBe(`1${nb}150${nb}€`);
    expect(flat.isDepositDeclared).toBe(false);
    expect(cardEuros(flat.entryTotal)).toBe(`3${nb}250${nb}€`);
    expect(flat.incomeOptions.map((v) => v.toNumber())).toEqual([3_000, 3_800, 4_500]);
    expect(cardPercent(flat.share(3_800)!, 0)).toBe(`33${nb}%`);
    expect(flat.verdict(3_800, false)).toBe('solid');
    expect(cardPercent(flat.share(3_000)!, 0)).toBe(`42${nb}%`);
    expect(flat.verdict(3_000, false)).toBe('guarantorAdvised');
    expect(flat.verdict(3_000, true)).toBe('solidWithGuarantor');
    expect(cardPercent(flat.share(4_500)!, 0)).toBe(`28${nb}%`);
    const furnished = new RentalCost({ rentExcludingCharges: 600, charges: null, area: null, isFurnished: true, declaredDeposit: null, agencyFees: null });
    expect(furnished.deposit?.toNumber()).toBe(1_200);
    expect(furnished.rentPerSquareMeter).toBeNull();
  });

  it('écrit les montants comme les cartes de l’app', () => {
    expect(cardEuros(1_260)).toBe(`1${nb}260${nb}€`);
    expect(cardEuros(98_333.33, true)).toBe(`+98${nb}333${nb}€`);
    expect(cardEuros(-78_666.67, true)).toBe(`−78${nb}667${nb}€`);
    expect(cardEuros1(16.428)).toBe(`16,4${nb}€`);
    expect(signedCents(-62.184)).toBe(`−62,18${nb}€`);
  });

  it('arrondit comme l’app : euros loin de zéro, centimes et pourcentages au pair (ICU)', () => {
    expect(cardEuros('-420.5', true)).toBe(`−421${nb}€`);
    expect(cardEuros('1400.5')).toBe(`1${nb}401${nb}€`);
    expect(signedCents('-62.185')).toBe(`−62,18${nb}€`);
    expect(signedCents('62.175')).toBe(`+62,18${nb}€`);
    // 650 € CC pour 2 000 € de revenus : 32,5 % s'écrit « 32 % » dans l'app (Intl seul donnerait « 33 % »).
    expect(cardPercent(new RentalCost({ rentExcludingCharges: 600, charges: 50, area: null, isFurnished: null, declaredDeposit: null, agencyFees: null }).share(2_000)!, 0)).toBe(`32${nb}%`);
    expect(cardPercent('0.0565', 1)).toBe(`5,6${nb}%`);
  });
});

describe('Rentabilité hôtelière (RentalAndHotelFiguresTests)', () => {
  const hotel = new HotelPerformance({ annualRevenue: 1_180_000, ebitda: 236_000, rooms: 24, occupancyRate: 0.78 });

  it('écrit les indicateurs comme la carte de l’app', () => {
    expect(cardPercent(hotel.margin!, 1)).toBe(`20,0${nb}%`);
    expect(cardEuros(hotel.monthlyRevenue, true)).toBe(`+98${nb}333${nb}€`);
    expect(cardEuros(hotel.monthlyCharges.negated(), true)).toBe(`−78${nb}667${nb}€`);
    expect(cardEuros(hotel.monthlyEbitda, true)).toBe(`+19${nb}667${nb}€`);
    expect(cardEuros(hotel.revPAR!)).toBe(`135${nb}€`);
    expect(cardEuros(hotel.averageRoomRate!)).toBe(`173${nb}€`);
    expect(cardEuros(hotel.maximumMonthlyPayment)).toBe(`15${nb}128${nb}€`);
    expect(capacity(hotel.borrowingCapacity(20, '0.035'))).toBe(`≈${nb}2,61${nb}M€`);
    expect(capacity(hotel.borrowingCapacity(15, '0.03'))).toBe(`≈${nb}2,19${nb}M€`);
    expect(capacity(hotel.borrowingCapacity(25, '0.04'))).toBe(`≈${nb}2,87${nb}M€`);
    expect(capacity(663_212)).toBe(`≈${nb}663${nb}000${nb}€`);
  });
});

describe('Partage (ListingShareTests)', () => {
  it('appartement à vendre, comme l’exemple de Romain', () => {
    const share = shareText(testRow({ title: 'Appartement 3 pièces', city: 'Lyon 2e', postal_code: '69002', price: 238_000, living_area: 62, rooms: 3 }));
    expect(share.text).toBe(`Appartement 3 pièces · Lyon 2e (69002)\n238${s}000${nb}€ · 62 m² · 3 pièces\nÀ voir sur Nidalo`);
    expect(share.subject.startsWith(`Appartement 3 pièces à Lyon 2e · 238${s}000`)).toBe(true);
    expect(share.previewTitle.startsWith(`Appartement 3 pièces · 238${s}000`)).toBe(true);
  });

  it('location : le loyer par mois, charges comprises', () => {
    const share = shareText(testRow({ transaction: 'rent', title: 'Studio', price: 650, living_area: 24, rooms: 1, monthly_charges: 40 }));
    const lines = share.text.split('\n');
    expect(lines[1].startsWith('690')).toBe(true);
    expect(lines[1]).toContain('€/mois · 24 m² · 1 pièce');
  });

  it('terrain et jardin de la maison', () => {
    const land = shareText(testRow({ property_type: 'land', title: 'Terrain constructible', price: 95_000, living_area: 0, rooms: null, land_area: 820 }));
    expect(land.text.split('\n')[1].endsWith('820 m² de terrain')).toBe(true);
    const house = shareText(testRow({ property_type: 'house', title: 'Maison', living_area: 110, rooms: 5, land_area: 400 }));
    expect(house.text.split('\n')[1].endsWith('110 m² · 5 pièces · 400 m² de terrain')).toBe(true);
  });

  it('jamais l’adresse', () => {
    const share = shareText(testRow({ public_street: '12 rue Secrète', title: 'Appartement 3 pièces', city: 'Lyon 2e', postal_code: '69002' }));
    expect(share.text).not.toContain('Secrète');
    expect(share.text.split('\n')[0]).toBe('Appartement 3 pièces · Lyon 2e (69002)');
  });
});

describe('Identité publique (PublicIdentityTests)', () => {
  it('prénom et initiale, nom complet seulement si choisi', () => {
    expect(publicName('Claire Martin')).toBe('Claire M.');
    expect(publicName('Jean-Pierre de la Tour')).toBe('Jean-Pierre D.');
    expect(publicName('Claire Martin', true)).toBe('Claire Martin');
    expect(publicName('Claire')).toBe('Claire');
    expect(publicName('')).toBe('');
    expect(initials('Claire M.')).toBe('CM');
  });

  it('ancienneté en mois et année', () => {
    expect(memberSince('2025-03-01')).toBe('Sur Nidalo depuis mars 2025');
  });

  it('particulier sans profil, agence avec son contact', () => {
    expect(publisherFrom(null, '2026-11-01T09:00:00Z')).toMatchObject({ isProfessional: false, name: 'Particulier', lines: ['Sur Nidalo depuis novembre 2026'] });
    const agency = publisherFrom({
      user_id: 'u', public_name: 'Paul Durand', avatar_path: null, account_type: 'professional', member_since: '2026-01-01',
      agency_id: 'a', agency_name: 'Agence du Parc', agency_logo_path: null, agency_postal_code: '69006', agency_city: 'Lyon', agency_phone: null,
    }, '2026-11-01T09:00:00Z');
    expect(agency).toMatchObject({ isProfessional: true, name: 'Agence du Parc', lines: ['Votre contact : Paul Durand', 'Lyon (69006)'] });
  });
});

describe('Textes de la fiche', () => {
  it('étage et durée du bail', () => {
    expect(floorLabel(0, null)).toBe('Rez-de-chaussée');
    expect(floorLabel(1, 5)).toBe('1er étage sur 5');
    expect(floorLabel(3, null)).toBe('3e étage');
    expect(leaseDuration(36)).toBe('3 ans');
    expect(leaseDuration(12)).toBe('1 an');
    expect(leaseDuration(18)).toBe('18 mois');
  });

  it('honoraires selon qui paie', () => {
    expect(feesLabel(testRow({ agency_fees_amount: 13_200, agency_fees_paid_by: 'seller' }))).toBe(`13${s}200${nb}€ à la charge du vendeur`);
    expect(feesLabel(testRow({ transaction: 'rent', agency_fees_amount: 840, agency_fees_paid_by: 'buyer' }))).toBe(`840${nb}€ à la charge du locataire`);
    expect(feesLabel(testRow())).toBeNull();
  });

  it('en-tête : chiffres clés et prix au m²', () => {
    const row = testRow({ rooms: 3, bedrooms: 2, floor: 0 });
    expect(headerFacts(row, 'purchase').map((f) => `${f.value} ${f.caption}`)).toEqual(['62 m² Surface', '3 Pièces', '2 Chambres', 'RDC Étage']);
    expect(priceSecondary(testRow({ price: 238_000, living_area: 62 }))).toBe(`3${s}839${nb}€/m²`);
    expect(priceSecondary(testRow({ transaction: 'rent' }))).toBe('/mois hors charges');
    const hotel = testRow({ property_type: 'hotel', asset_details: { hotel: { _0: { rooms: 24, stars: 3, scope: 'wallsAndBusiness' } } } });
    expect(headerFacts(hotel, 'hotel').map((f) => f.caption)).toEqual(['Surface', 'Chambres', 'Étoiles']);
    expect(saleCondition(hotel)).toBe('Vente : murs et fonds');
    expect(headerFacts(testRow({ property_type: 'land', land_area: 820 }), 'land')).toEqual([{ value: '820 m²', caption: 'Terrain' }]);
  });

  it('caractéristiques d’un appartement loué, dans l’ordre de l’app', () => {
    const row = testRow({ rental_info: { isLeased: true, currentMonthlyRent: 1400, leaseEndDate: '2027-12-01T00:00:00Z' }, monthly_charges: 180, annual_property_tax: 900 });
    const rows = featureRows(row);
    expect(rows.map(([t]) => t)).toEqual([
      'Type de bien', 'Surface habitable', 'Pièces', 'Chambres', 'Étage', 'Ascenseur', 'Extérieur', 'Stationnement', 'Construction', 'Cave', 'État',
      'Situation locative', 'Loyer actuel', 'Fin du bail', 'Charges', 'Taxe foncière',
    ]);
    expect(Object.fromEntries(rows)).toMatchObject({
      'Étage': '2e étage sur 5', 'Extérieur': 'Balcon', 'Stationnement': 'Aucun', 'Situation locative': 'Loué', 'Fin du bail': 'décembre 2027',
      'Loyer actuel': `1${s}400${nb}€/mois`, 'Taxe foncière': `900${nb}€/an`,
    });
  });

  it('informations pratiques d’une location', () => {
    const row = testRow({
      transaction: 'rent', price: 650, monthly_charges: 40, agency_fees_amount: 300, agency_fees_paid_by: 'buyer',
      rental_info: { isFurnished: true, securityDeposit: 1300, leaseDurationMonths: 12, availableFrom: '2026-12-01T00:00:00Z' },
    });
    expect(rentalRows(row, true, new Date('2026-11-05T12:00:00Z'))).toEqual([
      ['Loyer hors charges', `650${nb}€/mois`],
      ['Provisions sur charges', `40${nb}€/mois`],
      ['Loyer charges comprises', `690${nb}€/mois`],
      ['Disponibilité', 'Disponible le 1 décembre'],
      ['Ameublement', 'Meublé'],
      ['Dépôt de garantie', `1${s}300${nb}€`],
      ['Durée du bail', '1 an'],
      ['Honoraires', `300${nb}€ à la charge du locataire`],
    ]);
  });

  it('activité d’un hôtel et lecture des détails', () => {
    const row = testRow({
      property_type: 'hotel',
      asset_details: { hotel: { _0: { annualRevenue: { value: 1_180_000, origin: 'seller' }, occupancyRate: { value: 0.78, origin: 'estimated' }, financialYear: 2025 } } },
    });
    const activity = hotelActivity(row)!;
    expect(activity.rows.map((r) => r.title)).toEqual(['Chiffre d\'affaires 2025', 'Taux d\'occupation']);
    expect(activity.rows[1]).toMatchObject({ amount: `78${nb}%`, origin: 'estimated' });
    expect(activity.showsNote).toBe(true);
    expect(readAsset(testRow({ asset_details: { land: { _0: { zoning: 'UB', buildability: { floorArea: 300, documentReference: 'PLU 2024' } } } } }))).toMatchObject({
      kind: 'land', land: { zoning: 'UB', buildability: { floorArea: 300, documentReference: 'PLU 2024' } },
    });
    expect(rentalDetails(testRow({ rental_info: { isLeased: true, currentMonthlyRent: '1400' as unknown as number } }))?.currentMonthlyRent).toBe(1400);
  });

  it('date de publication', () => {
    expect(footnote(testRow({ published_at: '2026-11-03 10:02:35.451121+00' }))).toBe('Publiée le 3 novembre 2026');
  });
});
