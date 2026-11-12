import { describe, expect, it } from 'vitest';
import {
  buildingOfDraft, coOwnershipLotsIssue, coOwnershipNeedsProcedure, emptyBuilding, emptyHotel, emptyRental, energyCostHint, flatRateWarning, hotelOfDraft, inventoryFeeIssue, missingRequiredFields,
  energyPriceYearIssue, newDraft, rentalBanMessage, rentalChargesLabel, saleChargesLabel, selectCategory, selectSubtype, showsCoOwnership, showsEnergyCosts, showsInventoryFee,
  showsRentControl, stepIsComplete, stepIssues, subtypes, tenantShareWarning, PUBLISH_CATEGORIES, PUBLISH_STEPS,
  type PropertyType, type PublishDraft,
} from './draft';
import {
  canSaveDraft, firstIssue, furthestAtStart, guideForRequired, hasChanges, initialStep, previewRow, recapRows, sameDraft, stepOfIssue,
} from './flow';
import { appDecodingProblems, assetJson, dayToDate, draftFromRow, listingWrite } from './serialize';
import { proposedDescription, proposedTitle } from './writing';

// Publier sur ordinateur : mêmes règles et même écriture que l'app (ListingDraft, PublishWriting,
// SupabaseListingRepository). Données inventées.

const NOW = new Date('2026-11-07T12:00:00Z');
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
const photo = { kind: 'stored', id: 'p1', storagePath: 'u/l/p1.jpg', width: 1200, height: 900 } as const;

/** Appartement à vendre, complet. */
function flat(): PublishDraft {
  const base = selectSubtype(selectCategory(newDraft('a0000000-0000-4000-8000-000000000001'), 'residential'), subtypes('residential')[0]);
  return {
    ...base,
    address: { street: '12 rue Mercière', postalCode: '69002', city: 'Lyon', inseeCode: '69382' },
    coordinate: { latitude: 45.7616, longitude: 4.8321 },
    price: 320_000, livingArea: 62, rooms: 3, bedrooms: 2, floor: 2, hasElevator: true, outdoorSpaces: ['balcony'],
    energy: { ...base.energy, energyClass: 'C', climateClass: 'B' },
    photos: [photo], title: 'Appartement 3 pièces – Lyon', description: 'Bel appartement traversant.',
  };
}

describe('catégorie et champs obligatoires', () => {
  it('la catégorie fixe la transaction ; un hôtel est choisi d’office avec ses détails', () => {
    const rental = selectCategory(newDraft('x'), 'rental');
    expect([rental.transaction, rental.propertyType]).toEqual(['rent', null]);
    const hotel = selectCategory(newDraft('x'), 'hotel');
    expect([hotel.transaction, hotel.propertyType, hotel.assetDetails?.kind]).toEqual(['sale', 'hotel', 'hotel']);
    const mixed = selectSubtype(selectCategory(newDraft('x'), 'investment'), subtypes('investment')[3]);
    expect([mixed.propertyType, mixed.isMixedBuilding, mixed.assetDetails?.kind]).toEqual(['building', true, 'building']);
  });

  it('manquants au départ, aucun une fois tout rempli', () => {
    const empty = selectSubtype(selectCategory(newDraft('x'), 'residential'), subtypes('residential')[0]);
    expect(missingRequiredFields(empty, NOW)).toEqual(['photos', 'address', 'price', 'livingArea', 'rooms', 'energyClass', 'description', 'title']);
    expect(missingRequiredFields(flat(), NOW)).toEqual([]);
    expect(stepIsComplete(flat(), 'features', NOW)).toBe(true);
  });

  it('un logement classé G ne se loue plus', () => {
    const rent = { ...selectCategory(flat(), 'rental'), energy: { ...flat().energy, energyClass: 'G' as const } };
    expect(rentalBanMessage(rent, NOW)).toBe('Un logement classé G ne peut plus être mis en location depuis 2025.');
    expect(missingRequiredFields(rent, NOW)).toContain('rentalEnergyClass');
    expect(stepIsComplete(rent, 'features', NOW)).toBe(false);
  });
});

describe('écriture relisible par l’app', () => {
  it('colonnes de l’annonce et jours à midi UTC', () => {
    const write = listingWrite(flat(), { insert: true });
    expect(write).toMatchObject({
      transaction: 'sale', property_type: 'apartment', publish_category: 'residential', price: 320000, living_area: 62, rooms: 3,
      postal_code: '69002', city: 'Lyon', insee_code: '69382', energy_class: 'C', status: 'draft', country_code: 'FR',
    });
    expect(appDecodingProblems(write)).toEqual([]);
    expect(dayToDate('2026-12-01')).toBe('2026-12-01T12:00:00.000Z');
  });

  it('location : isLeased toujours présent ; hôtel : énumération Swift et valeurs déclarées', () => {
    const rent = { ...selectCategory(flat(), 'rental'), rentalInfo: { ...selectCategory(flat(), 'rental').rentalInfo!, isFurnished: true } };
    const rentWrite = listingWrite({ ...rent, rentalInfo: rent.rentalInfo ?? null }, { insert: false });
    if (rentWrite.rental_info !== null) expect(rentWrite.rental_info.isLeased).toBe(false);
    expect(appDecodingProblems(rentWrite)).toEqual([]);
    const hotel = selectCategory(newDraft('h'), 'hotel');
    const details = hotel.assetDetails;
    if (details?.kind !== 'hotel') throw new Error('détails d’hôtel absents');
    const json = assetJson({ kind: 'hotel', hotel: { ...details.hotel, rooms: 24, stars: 3, annualRevenue: { value: 1_200_000, origin: 'seller' } } });
    expect(json).toEqual({ hotel: { _0: { rooms: 24, stars: 3, annualRevenue: { value: 1200000, origin: 'seller' } } } });
  });

  it('une annonce relue redonne le même brouillon', () => {
    const write = listingWrite(flat(), { insert: false });
    const row = {
      ...write, owner_id: 'u', status: 'active', previous_price: null, public_latitude: null, public_longitude: null, public_street: null,
      rental_info: null, asset_details: null, published_at: null, created_at: null, updated_at: null,
      listing_photos: [{ id: 'p1', storage_path: 'u/l/p1.jpg', position: 0, width: 1200, height: 900 }],
    };
    const back = draftFromRow(row as unknown as Parameters<typeof draftFromRow>[0], { street: '12 rue Mercière', latitude: 45.7616, longitude: 4.8321 });
    expect(sameDraft(back, flat())).toBe(true);
  });
});

describe('titre et description proposés', () => {
  it('reprennent seulement ce qui a été saisi', () => {
    expect(proposedTitle(flat())).toBe('Appartement 3 pièces – Lyon');
    expect(plain(proposedDescription(flat()))).toBe(
      'À vendre : appartement de 62 m² à Lyon. 3 pièces dont 2 chambres. 2e étage avec ascenseur. Balcon. DPE C, GES B.',
    );
    const rent = selectCategory(flat(), 'rental');
    const rentDraft = { ...rent, price: 950, monthlyCharges: 80, rentalInfo: { ...rent.rentalInfo!, isFurnished: false, availableFrom: '2026-12-01' } };
    expect(plain(proposedDescription(rentDraft))).toContain('Loyer : 950 € hors charges par mois, plus 80 € de provisions sur charges.');
    expect(proposedDescription(rentDraft)).toContain('Logement non meublé. Disponible le 1 décembre 2026.');
  });
});

describe('assistant : brouillon, changements, aperçu, récapitulatif', () => {
  it('ouverture, brouillon enregistrable et changements', () => {
    expect(initialStep(newDraft('x'), false)).toBe('category');
    expect(initialStep(flat(), true)).toBe('main');
    expect(canSaveDraft(flat())).toBe(true);
    expect(canSaveDraft({ ...flat(), address: { ...flat().address!, postalCode: '6' } })).toBe(false);
    expect(hasChanges(newDraft('x'), null)).toBe(false);
    expect(hasChanges(flat(), null)).toBe(true);
    expect(hasChanges(flat(), flat())).toBe(false);
    expect(hasChanges({ ...flat(), price: 310_000 }, flat())).toBe(true);
  });

  it('aperçu seulement quand tout est rempli, avec un titre provisoire', () => {
    expect(previewRow({ ...flat(), photos: [] }, 'u', NOW)).toBeNull();
    const row = previewRow({ ...flat(), title: '', locationPrecision: 'approximate' }, 'u', NOW);
    expect(row).toMatchObject({ title: 'Appartement 3 pièces – Lyon', status: 'active', public_latitude: null, owner_id: 'u' });
    expect(row?.listing_photos?.[0].storage_path).toBe('u/l/p1.jpg');
  });

  it('récapitulatif de la vérification', () => {
    expect(recapRows(flat()).map((r) => `${r.title}: ${plain(r.value)}`)).toEqual([
      'Catégorie: Résidentiel · Appartement', 'Adresse: 12 rue Mercière, 69002 Lyon', 'Prix: 320 000 €', 'Surface: 62 m²', 'DPE: C', 'Photos: 1',
    ]);
    expect(recapRows({ ...flat(), address: { ...flat().address!, street: ' ' } })[1].value).toBe('69002 Lyon');
  });
});

describe('charges, énergie, honoraires et loyer des murs', () => {
  /** Brouillon relu depuis la ligne écrite, comme après un enregistrement. */
  const reread = (draft: PublishDraft) => {
    const write = listingWrite(draft, { insert: false });
    const row = {
      ...write, owner_id: 'u', status: 'active', previous_price: null, public_latitude: null, public_longitude: null, public_street: null,
      published_at: null, created_at: null, updated_at: null, listing_photos: [],
    };
    return draftFromRow(row as unknown as Parameters<typeof draftFromRow>[0], { street: '12 rue Mercière', latitude: 45.7616, longitude: 4.8321 });
  };
  const hotelDraft = (scope: 'wallsAndBusiness' | 'wallsOnly' | 'businessOnly'): PublishDraft => ({
    ...selectCategory(flat(), 'hotel'),
    assetDetails: { kind: 'hotel', hotel: { ...emptyHotel(), rooms: 14, scope, wallsAnnualRent: 72_000 } },
    rentalInfo: { ...emptyRental(), isLeased: true, currentMonthlyRent: 6_400 },
  });

  it('dépenses d’énergie : dans l’ordre, demandées pour un logement ou un immeuble', () => {
    const energy = { ...flat().energy, annualEnergyCostMin: 1_500, annualEnergyCostMax: 1_080 };
    expect(listingWrite({ ...flat(), energy }, { insert: false })).toMatchObject({ annual_energy_cost_min: 1080, annual_energy_cost_max: 1500 });
    expect(energyCostHint(energy)).toBeNull();
    expect(energyCostHint({ ...energy, annualEnergyCostMax: null })).toBe('Indiquez les deux montants du DPE.');
    const types: PropertyType[] = ['apartment', 'house', 'building', 'commercial', 'office', 'hotel'];
    expect(types.map(showsEnergyCosts)).toEqual([true, true, true, false, false, false]);
  });

  it('honoraires : écrits avec qui les paie, sinon à compléter à l’étape Prix et finances', () => {
    const fees: PublishDraft = { ...flat(), agencyFeesAmount: 13_200 };
    expect(missingRequiredFields(fees, NOW)).toEqual(['agencyFeesPayer']);
    expect(stepIsComplete(fees, 'finance', NOW)).toBe(false);
    expect(listingWrite(fees, { insert: false })).toMatchObject({ agency_fees_amount: null, agency_fees_paid_by: null });
    const paid: PublishDraft = { ...fees, agencyFeesPaidBy: 'buyer' };
    expect(missingRequiredFields(paid, NOW)).toEqual([]);
    expect(stepIsComplete(paid, 'finance', NOW)).toBe(true);
    expect(listingWrite(paid, { insert: false })).toMatchObject({ agency_fees_amount: 13200, agency_fees_paid_by: 'buyer' });
    expect(reread(paid)).toMatchObject({ agencyFeesAmount: 13200, agencyFeesPaidBy: 'buyer' });
  });

  it('investir : part des charges payée par le locataire ; un immeuble a des charges d’immeuble', () => {
    const invest = selectSubtype(selectCategory(flat(), 'investment'), subtypes('investment')[0]);
    const leased: PublishDraft = {
      ...invest, monthlyCharges: 180, rentalInfo: { ...emptyRental(), isLeased: true, currentMonthlyRent: 950, recoverableMonthlyCharges: 120 },
    };
    const write = listingWrite(leased, { insert: false });
    expect(write.rental_info).toEqual({ currentMonthlyRent: 950, isLeased: true, recoverableMonthlyCharges: 120 });
    expect(appDecodingProblems(write)).toEqual([]);
    expect(tenantShareWarning(leased)).toBeNull();
    expect(tenantShareWarning({ ...leased, monthlyCharges: 100 })).toBe('La part du locataire dépasse les charges : vérifiez les deux montants.');
    expect([saleChargesLabel('building'), saleChargesLabel('apartment')]).toEqual(["Charges de l'immeuble", 'Charges de copropriété']);
  });

  it('location : charges au forfait ou en provisions, gardées et relues', () => {
    const rent = selectCategory(flat(), 'rental');
    const draft: PublishDraft = { ...rent, price: 950, monthlyCharges: 80, rentalInfo: { ...emptyRental(), isFurnished: true, chargesMode: 'flatRate' } };
    const write = listingWrite(draft, { insert: false });
    expect(write.rental_info).toEqual({ isLeased: false, isFurnished: true, chargesMode: 'flatRate' });
    expect(appDecodingProblems(write)).toEqual([]);
    expect(appDecodingProblems({ ...write, rental_info: { isLeased: false, chargesMode: 'mensuel' } })).toEqual(['rental_info.chargesMode']);
    expect(reread(draft).rentalInfo?.chargesMode).toBe('flatRate');
    expect(plain(proposedDescription(draft))).toContain('Loyer : 950 € hors charges par mois, plus un forfait de charges de 80 €.');
    expect([rentalChargesLabel('flatRate'), rentalChargesLabel('provision'), rentalChargesLabel(null)])
      .toEqual(['Forfait de charges', 'Provisions sur charges', 'Provisions sur charges']);
    expect(flatRateWarning(draft)).toBeNull();
    expect(flatRateWarning({ ...draft, rentalInfo: { ...draft.rentalInfo!, isFurnished: false } }))
      .toBe("En location vide, le forfait de charges n'est permis qu'en colocation.");
  });

  it('hôtel : le loyer des murs suit ce qui est vendu', () => {
    const walls = listingWrite(hotelDraft('wallsOnly'), { insert: false });
    expect(walls.rental_info).toEqual({ currentMonthlyRent: 6400, isLeased: true });
    expect(walls.asset_details).toEqual({ hotel: { _0: { rooms: 14, scope: 'wallsOnly' } } });
    const business = listingWrite(hotelDraft('businessOnly'), { insert: false });
    expect(business.rental_info).toBeNull();
    expect(business.asset_details).toEqual({ hotel: { _0: { rooms: 14, scope: 'businessOnly', wallsAnnualRent: 72000 } } });
    expect(appDecodingProblems(business)).toEqual([]);
    const both = listingWrite(hotelDraft('wallsAndBusiness'), { insert: false });
    expect([both.rental_info, both.asset_details]).toEqual([null, { hotel: { _0: { rooms: 14, scope: 'wallsAndBusiness' } } }]);
    expect(hotelOfDraft(reread(hotelDraft('businessOnly')))?.wallsAnnualRent).toBe(72000);
  });
});

describe('copropriété : nombre de lots et procédure en cours', () => {
  /** Brouillon relu depuis la ligne écrite, comme après un enregistrement. */
  const reread = (draft: PublishDraft) => {
    const write = listingWrite(draft, { insert: false });
    const row = {
      ...write, owner_id: 'u', status: 'active', previous_price: null, public_latitude: null, public_longitude: null, public_street: null,
      published_at: null, created_at: null, updated_at: null, listing_photos: [],
    };
    return draftFromRow(row as unknown as Parameters<typeof draftFromRow>[0], { street: '12 rue Mercière', latitude: 45.7616, longitude: 4.8321 });
  };
  const ISSUE = 'Saisissez un nombre de lots entre 1 et 100 000.';

  it('demandés pour un appartement à vendre et en investissement, sauf l’immeuble entier', () => {
    const invest = (index: number) => selectSubtype(selectCategory(flat(), 'investment'), subtypes('investment')[index]);
    expect(showsCoOwnership(flat())).toBe(true);
    expect(showsCoOwnership(selectSubtype(flat(), subtypes('residential')[1]))).toBe(false);
    expect([0, 1, 2, 3, 4, 5].map((index) => showsCoOwnership(invest(index)))).toEqual([true, true, false, false, true, true]);
    expect(showsCoOwnership(selectCategory(flat(), 'rental'))).toBe(false);
    expect(showsCoOwnership(selectCategory(flat(), 'hotel'))).toBe(false);
  });

  it('des lots sans réponse sur la procédure bloquent l’étape Prix et finances', () => {
    const lots: PublishDraft = { ...flat(), coOwnershipLots: 24 };
    expect(coOwnershipNeedsProcedure(lots)).toBe(true);
    expect(missingRequiredFields(lots, NOW)).toEqual(['coOwnershipProcedure']);
    expect(stepIsComplete(lots, 'finance', NOW)).toBe(false);
    const answered: PublishDraft = { ...lots, coOwnershipHasProcedure: false };
    expect(missingRequiredFields(answered, NOW)).toEqual([]);
    expect(stepIsComplete(answered, 'finance', NOW)).toBe(true);
    const write = listingWrite(answered, { insert: false });
    expect(write).toMatchObject({ co_ownership_lots: 24, co_ownership_has_procedure: false });
    expect(appDecodingProblems(write)).toEqual([]);
    expect(reread(answered)).toMatchObject({ coOwnershipLots: 24, coOwnershipHasProcedure: false });
    expect(plain(proposedDescription(answered))).toContain('Copropriété de 24 lots, sans procédure en cours.');
    expect(plain(proposedDescription({ ...answered, coOwnershipHasProcedure: true }))).toContain('Copropriété de 24 lots, procédure en cours.');
  });

  it('un nombre de lots hors limites ou une location ne sont pas enregistrés', () => {
    expect([coOwnershipLotsIssue(null), coOwnershipLotsIssue(24), coOwnershipLotsIssue(0), coOwnershipLotsIssue(100_001)])
      .toEqual([null, null, ISSUE, ISSUE]);
    const zero: PublishDraft = { ...flat(), coOwnershipLots: 0 };
    expect(missingRequiredFields(zero, NOW)).toEqual([]);
    expect(listingWrite(zero, { insert: false })).toMatchObject({ co_ownership_lots: null });
    const rent: PublishDraft = { ...selectCategory(flat(), 'rental'), coOwnershipLots: 24, coOwnershipHasProcedure: false };
    expect(listingWrite(rent, { insert: false })).toMatchObject({ co_ownership_lots: null, co_ownership_has_procedure: null });
    expect(missingRequiredFields({ ...rent, coOwnershipHasProcedure: null }, NOW)).not.toContain('coOwnershipProcedure');
  });
});

describe('mentions obligatoires d’une location : état des lieux et loyers encadrés', () => {
  const reread = (draft: PublishDraft) => {
    const write = listingWrite(draft, { insert: false });
    const row = {
      ...write, owner_id: 'u', status: 'active', previous_price: null, public_latitude: null, public_longitude: null, public_street: null,
      published_at: null, created_at: null, updated_at: null, listing_photos: [],
    };
    return draftFromRow(row as unknown as Parameters<typeof draftFromRow>[0], { street: '12 rue Mercière', latitude: 45.7616, longitude: 4.8321 });
  };
  const rent = (): PublishDraft => ({ ...selectCategory(flat(), 'rental'), price: 1_150, monthlyCharges: 80 });
  const info = (draft: PublishDraft) => draft.rentalInfo ?? emptyRental();

  it('part de l’état des lieux : demandée si le locataire paie des honoraires, jamais plus grande qu’eux', () => {
    const fees: PublishDraft = { ...rent(), agencyFeesAmount: 840, agencyFeesPaidBy: 'buyer' };
    expect([showsInventoryFee(rent()), showsInventoryFee(fees), showsInventoryFee({ ...fees, agencyFeesPaidBy: 'seller' })]).toEqual([false, true, false]);
    expect(showsInventoryFee({ ...flat(), agencyFeesAmount: 9_000, agencyFeesPaidBy: 'buyer' })).toBe(false);
    const withFee: PublishDraft = { ...fees, rentalInfo: { ...info(fees), inventoryFee: 111 } };
    const write = listingWrite(withFee, { insert: false });
    expect(write.rental_info).toMatchObject({ inventoryFee: 111 });
    expect(appDecodingProblems(write)).toEqual([]);
    expect(reread(withFee).rentalInfo?.inventoryFee).toBe(111);
    const tooMuch: PublishDraft = { ...fees, rentalInfo: { ...info(fees), inventoryFee: 900 } };
    expect(inventoryFeeIssue(tooMuch)).toBe("La part de l'état des lieux ne peut pas dépasser les honoraires.");
    expect(listingWrite(tooMuch, { insert: false }).rental_info).not.toHaveProperty('inventoryFee');
    const owner: PublishDraft = { ...withFee, agencyFeesPaidBy: 'seller' };
    expect(listingWrite(owner, { insert: false }).rental_info).not.toHaveProperty('inventoryFee');
  });

  it('loyers encadrés : pour un logement, montants écrits seulement si le loyer est encadré', () => {
    const office = selectSubtype(selectCategory(flat(), 'rental'), subtypes('rental')[5]);
    expect([showsRentControl(rent()), showsRentControl(office), showsRentControl(flat())]).toEqual([true, false, false]);
    const controlled: PublishDraft = {
      ...rent(), rentalInfo: { ...info(rent()), isRentControlled: true, referenceRent: 25.3, maxReferenceRent: 30.36, rentSupplement: 150 },
    };
    const write = listingWrite(controlled, { insert: false });
    expect(write.rental_info).toMatchObject({ isRentControlled: true, referenceRent: 25.3, maxReferenceRent: 30.36, rentSupplement: 150 });
    expect(appDecodingProblems(write)).toEqual([]);
    expect(reread(controlled).rentalInfo).toMatchObject({ isRentControlled: true, referenceRent: 25.3, maxReferenceRent: 30.36, rentSupplement: 150 });
    const free: PublishDraft = { ...controlled, rentalInfo: { ...info(controlled), isRentControlled: false } };
    const freeInfo = listingWrite(free, { insert: false }).rental_info;
    expect(freeInfo).toMatchObject({ isRentControlled: false });
    expect(freeInfo).not.toHaveProperty('referenceRent');
    const unknown = listingWrite({ ...controlled, rentalInfo: { ...info(controlled), isRentControlled: null } }, { insert: false }).rental_info;
    expect(unknown).not.toHaveProperty('isRentControlled');
    expect(unknown).not.toHaveProperty('rentSupplement');
    const officeWrite = listingWrite({ ...office, price: 2_000, rentalInfo: { ...info(controlled) } }, { insert: false }).rental_info;
    expect(officeWrite).not.toHaveProperty('isRentControlled');
  });
});

describe('année des prix de l’énergie du DPE', () => {
  const costs = (year: number | null, min: number | null = 1_200) =>
    ({ ...flat(), energy: { ...flat().energy, annualEnergyCostMin: min, annualEnergyCostMax: 1_700, energyPriceYear: year } });

  it('écrite avec les deux montants des dépenses, relue d’une annonce', () => {
    const write = listingWrite(costs(2021), { insert: false });
    expect(write).toMatchObject({ annual_energy_cost_min: 1_200, annual_energy_cost_max: 1_700, energy_price_year: 2021 });
    expect(appDecodingProblems(write)).toEqual([]);
    const row = {
      ...write, owner_id: 'u', status: 'active', previous_price: null, public_latitude: null, public_longitude: null, public_street: null,
      published_at: null, created_at: null, updated_at: null, listing_photos: [],
    };
    expect(draftFromRow(row as unknown as Parameters<typeof draftFromRow>[0], { street: '12 rue Mercière', latitude: 45.7616, longitude: 4.8321 })
      .energy.energyPriceYear).toBe(2021);
  });

  it('pas sans les montants, pas hors limites', () => {
    expect(listingWrite(costs(2021, null), { insert: false }).energy_price_year).toBeNull();
    expect([energyPriceYearIssue(null), energyPriceYearIssue(2024), energyPriceYearIssue(1999), energyPriceYearIssue(20210)])
      .toEqual([null, null, 'Saisissez une année entre 2000 et 2100.', 'Saisissez une année entre 2000 et 2100.']);
    expect(listingWrite(costs(1999), { insert: false }).energy_price_year).toBeNull();
  });
});

describe('étapes : revenir librement et mener aux champs à compléter', () => {
  const kind = (category: (typeof PUBLISH_CATEGORIES)[number], index: number) => selectSubtype(selectCategory(newDraft('x'), category), subtypes(category)[index]);
  const flatInvest = (index: number) => selectSubtype(selectCategory(flat(), 'investment'), subtypes('investment')[index]);
  /** Brouillons variés : vides et complets de chaque type, puis l'appartement complet avec un champ retiré à la fois. */
  function samples(): PublishDraft[] {
    const list: PublishDraft[] = [newDraft('x'), flat()];
    for (const category of PUBLISH_CATEGORIES) {
      subtypes(category).forEach((_, index) => {
        list.push(kind(category, index));
        list.push(selectSubtype(selectCategory(flat(), category), subtypes(category)[index]));
      });
    }
    const full = flat();
    list.push(
      { ...full, address: null, coordinate: null }, { ...full, address: { ...full.address!, postalCode: '' } }, { ...full, address: { ...full.address!, city: ' ' } },
      { ...full, price: null }, { ...full, price: 0 }, { ...full, livingArea: null }, { ...full, rooms: null }, { ...full, photos: [] },
      { ...full, energy: { ...full.energy, energyClass: null } }, { ...full, title: ' ' }, { ...full, description: '' },
      { ...full, agencyFeesAmount: 9_000 }, { ...full, coOwnershipLots: 12 }, { ...full, coOwnershipLots: 12, agencyFeesAmount: 9_000, price: null },
      { ...selectCategory(full, 'rental'), energy: { ...full.energy, energyClass: 'G' } },
      { ...flatInvest(3), assetDetails: { kind: 'building', building: { ...(buildingOfDraft(flatInvest(3)) ?? emptyBuilding()), residentialUnits: 4, commercialUnits: 0 } } },
      { ...flatInvest(3), assetDetails: { kind: 'building', building: { ...(buildingOfDraft(flatInvest(3)) ?? emptyBuilding()), residentialUnits: 4, commercialUnits: 1 } } },
    );
    return list;
  }

  it('les champs signalés suivent exactement les règles de chaque étape', () => {
    for (const draft of samples()) {
      for (const step of PUBLISH_STEPS) {
        expect(stepIssues(draft, step, NOW).length === 0, `${draft.propertyType} · ${step}`).toBe(stepIsComplete(draft, step, NOW));
      }
    }
  });

  it('dans l’ordre de l’écran, sans les champs cachés ou sans objet', () => {
    const empty = kind('residential', 0);
    expect(stepIssues(empty, 'main', NOW)).toEqual(['postalCode', 'city', 'price']);
    expect(stepIssues(empty, 'features', NOW)).toEqual(['livingArea', 'rooms', 'energyClass']);
    expect(stepIssues(empty, 'description', NOW)).toEqual(['title', 'description']);
    // Un local et des bureaux n'ont pas de pièces ; un terrain et un parking pas de DPE.
    expect(stepIssues(kind('investment', 4), 'features', NOW)).toEqual(['livingArea', 'energyClass']);
    expect(stepIssues(kind('residential', 2), 'features', NOW)).toEqual(['landArea']);
    expect(stepIssues(kind('rental', 2), 'features', NOW)).toEqual(['livingArea']);
    expect(stepIssues(kind('hotel', 0), 'features', NOW)).toEqual(['livingArea', 'hotelRooms', 'energyClass']);
    expect(stepIssues(kind('investment', 3), 'features', NOW)).toEqual(['livingArea', 'mixedBuilding', 'energyClass']);
    // Les pièces d'un appartement ne comptent plus une fois le type changé pour un local.
    const changed = selectSubtype(selectCategory({ ...flat(), rooms: null }, 'investment'), subtypes('investment')[4]);
    expect(stepIssues(changed, 'features', NOW)).toEqual([]);
    // Prix et finances : la copropriété avant les honoraires (ordre de l'écran).
    expect(stepIssues({ ...flat(), coOwnershipLots: 12, agencyFeesAmount: 9_000 }, 'finance', NOW)).toEqual(['coOwnershipProcedure', 'agencyFeesPayer']);
    expect(stepIssues({ ...selectCategory(flat(), 'rental'), energy: { ...flat().energy, energyClass: 'G' } }, 'features', NOW)).toEqual(['rentalEnergyClass']);
  });

  it('la première étape à corriger, puis le premier champ de l’écran', () => {
    const several: PublishDraft = { ...flat(), price: null, photos: [], description: '' };
    expect(firstIssue(several, 'review', NOW)).toEqual({ step: 'main', field: 'price' });
    expect(firstIssue(several, 'description', NOW)).toEqual({ step: 'main', field: 'price' });
    const later: PublishDraft = { ...flat(), photos: [], description: '' };
    // « Continuer » à l'étape 4 ne regarde pas encore les photos ; à l'étape 6, si.
    expect(firstIssue(later, 'finance', NOW)).toBeNull();
    expect(firstIssue(later, 'description', NOW)).toEqual({ step: 'media', field: 'photos' });
    expect(firstIssue(flat(), 'review', NOW)).toBeNull();
    // Le prix, demandé aussi à l'étape « Prix et finances », se corrige avec l'adresse.
    expect(stepOfIssue('price')).toBe('main');
    expect(guideForRequired('transaction')).toEqual({ step: 'category', field: 'propertyType' });
    expect(guideForRequired('address')).toEqual({ step: 'main', field: 'address' });
    expect(guideForRequired('rentalEnergyClass')).toEqual({ step: 'features', field: 'rentalEnergyClass' });
  });

  it('étape la plus loin atteinte : nouvelle annonce, brouillon repris, modification', () => {
    expect(furthestAtStart(newDraft('x'), null, 'category', NOW)).toBe(0);
    const resumed: PublishDraft = { ...flat(), livingArea: null };
    expect(furthestAtStart(resumed, 'draft', 'main', NOW)).toBe(PUBLISH_STEPS.indexOf('features'));
    expect(furthestAtStart(flat(), 'draft', 'main', NOW)).toBe(PUBLISH_STEPS.length - 1);
    expect(furthestAtStart({ ...flat(), price: null }, 'draft', 'media', NOW)).toBe(PUBLISH_STEPS.indexOf('media'));
    expect(furthestAtStart({ ...flat(), price: null }, 'active', 'main', NOW)).toBe(PUBLISH_STEPS.length - 1);
  });
});
