import { describe, expect, it } from 'vitest';
import {
  amountText, changeKind, completionOf, decodeCriteria, emptyCriteria, encodeCriteria, isEmptyCriteria, newProject, projectFromRow, projectIssues,
  projectRow, projectSubtitle, projectToSave, resetCategory, sameProject, summaryRows, toggleStep, type Project,
  groupedInput, inputAmount,
} from './projectEditor';

const USER = 'a0000000-0000-4000-8000-0000000000c1';

function project(change: Partial<Project> = {}): Project {
  return { ...newProject('C0000000-0000-4000-8000-000000000001'), ...change };
}

describe('Mon projet : ligne de real_estate_projects (ProjectServerRow)', () => {
  it('écrit les colonnes de l’app, identifiants en majuscules, étapes triées, purpose toujours présent', () => {
    const row = projectRow(USER, project({ city: 'Lyon', purpose: '  ', completedSteps: ['visits', 'search'] }));
    expect(Object.keys(row)).toEqual(['user_id', 'id', 'kind', 'city', 'purpose', 'completed_steps', 'criteria', 'shared_with_contacts']);
    expect(row.user_id).toBe('A0000000-0000-4000-8000-0000000000C1');
    expect(row.id).toBe('C0000000-0000-4000-8000-000000000001');
    expect(row.purpose).toBeNull();
    expect(row.completed_steps).toEqual(['search', 'visits']);
    expect(row.shared_with_contacts).toBe(false);
  });

  it('critères vides : les quatre parcours, booléens, listes et lieu toujours écrits, valeurs vides omises', () => {
    const criteria = encodeCriteria(emptyCriteria());
    expect(criteria).toEqual({
      residential: {
        propertyTypes: [], excludesGroundFloor: false, requiresElevator: false, outdoorSpaces: [], requiresParking: false,
        requiresDocumentedBuildability: false, requiresServiced: false, location: { place: '' },
      },
      investment: { assetTypes: [], leasedOnly: false, includesMixedBuildings: false, location: { place: '' } },
      rental: { propertyTypes: [], requiresElevator: false, requiresParking: false, outdoorSpaces: [], location: { place: '' } },
      hotel: { location: { place: '' } },
    });
    expect(isEmptyCriteria(emptyCriteria())).toBe(true);
  });

  it('relit ce qu’il écrit (dates en UTC sans fuseau, ensembles dans l’ordre des cas)', () => {
    const criteria = emptyCriteria();
    criteria.residential = { ...criteria.residential, maxBudget: 300000, propertyTypes: ['land', 'apartment'], minRooms: 3,
      location: { place: 'Lyon', radiusKilometers: 20, center: { latitude: 45.764, longitude: 4.8357 } } };
    criteria.rental = { ...criteria.rental, moveInBy: new Date(Date.UTC(2026, 11, 7, 9, 0)), furnished: false };
    const encoded = encodeCriteria(criteria);
    expect((encoded.residential as Record<string, unknown>).propertyTypes).toEqual(['apartment', 'land']);
    expect((encoded.rental as Record<string, unknown>).moveInBy).toBe('2026-12-07T09:00:00.000');
    expect((encoded.rental as Record<string, unknown>).furnished).toBe(false);
    const decoded = decodeCriteria(JSON.parse(JSON.stringify(encoded)));
    expect(encodeCriteria(decoded)).toEqual(encoded);
  });

  it('ligne lue : catégorie inconnue écartée, étapes inconnues ignorées, partage absent = faux', () => {
    expect(projectFromRow({ id: 'x', kind: 'castle' })).toBeNull();
    const read = projectFromRow({ id: 'c1', kind: 'rent', city: 'Lyon', purpose: null, completed_steps: ['moveIn', 'flying', 'search'] });
    expect(read?.completedSteps).toEqual(['search', 'moveIn']);
    expect(read?.sharesWithContacts).toBe(false);
    expect(read?.criteria).toEqual(emptyCriteria());
  });

  it('même projet malgré l’ordre des étapes cochées', () => {
    expect(sameProject(project({ completedSteps: ['search', 'visits'] }), project({ completedSteps: ['visits', 'search'] }))).toBe(true);
    expect(sameProject(project(), project({ sharesWithContacts: true }))).toBe(false);
  });
});

describe('Mon projet : règles (RealEstateProject)', () => {
  it('cocher une étape du parcours, jamais une étape d’un autre parcours', () => {
    const p = toggleStep(project(), 'offer');
    expect(p.completedSteps).toEqual(['offer']);
    expect(toggleStep(p, 'offer').completedSteps).toEqual([]);
    expect(toggleStep(project(), 'moveIn').completedSteps).toEqual([]);
  });

  it('changer de parcours garde les étapes communes', () => {
    const p = changeKind(project({ completedSteps: ['search', 'selection', 'offer'] }), 'invest');
    expect(p.kind).toBe('invest');
    expect(p.completedSteps).toEqual(['search', 'offer']);
  });

  it('Réinitialiser ne vide que le parcours affiché', () => {
    const criteria = emptyCriteria();
    criteria.residential.maxBudget = 250000;
    criteria.rental.maxRent = 900;
    const p = resetCategory(project({ criteria }));
    expect(p.criteria.residential.maxBudget).toBeNull();
    expect(p.criteria.rental.maxRent).toBe(900);
  });

  it('enregistré : la ville suit le lieu de la catégorie', () => {
    const criteria = emptyCriteria();
    criteria.residential.location.place = 'Villeurbanne';
    expect(projectToSave(project({ city: 'Lyon', criteria })).city).toBe('Villeurbanne');
    expect(projectToSave(project({ city: 'Lyon' })).city).toBe('Lyon');
  });

  it('problèmes de saisie : apport au-dessus du budget, pourcentage hors de 0 à 100 %', () => {
    const criteria = emptyCriteria();
    criteria.investment = { ...criteria.investment, maxPrice: 100000, downPayment: 150000, minGrossYield: 1.5 };
    expect(projectIssues(criteria, 'invest')).toEqual({ downPayment: 'L\'apport dépasse le budget.', minGrossYield: 'Saisissez un pourcentage entre 0 et 100.' });
    expect(projectIssues(criteria, 'buy')).toEqual({});
  });

  it('sous-titre de la carte : usage, sinon la catégorie, puis la ville', () => {
    expect(projectSubtitle({ kind: 'invest', city: '', purpose: null })).toBe('Investissement');
    expect(projectSubtitle({ kind: 'buy', city: 'Lyon', purpose: 'Résidence principale' })).toBe('Résidence principale · Lyon');
  });

  it('anneau : part des critères pertinents renseignés', () => {
    expect(completionOf(project())).toBe(0);
    const criteria = emptyCriteria();
    criteria.residential = { ...criteria.residential, maxBudget: 300000, propertyTypes: ['apartment'], location: { ...criteria.residential.location, place: 'Lyon' } };
    expect(completionOf(project({ criteria }))).toBeGreaterThan(0);
  });

  it('résumé de l’app pour chaque parcours', () => {
    const plain = (rows: [string, string | null][]) => rows.map(([title, value]) => `${title}: ${value?.replace(/\s/g, ' ') ?? null}`);
    const criteria = emptyCriteria();
    criteria.residential = { ...criteria.residential, propertyTypes: ['apartment'], maxBudget: 300000, minArea: 45, minRooms: 3,
      location: { place: 'Lyon', radiusKilometers: 20, center: null } };
    expect(plain(summaryRows(project({ criteria })))).toEqual([
      'Type de bien: Appartement', 'Budget maximum: 300 000 €', 'Surface et pièces: ≥ 45 m² · 3 p. et +', 'Localisation: Lyon · 20 km',
    ]);
    criteria.investment = { ...criteria.investment, maxPrice: 200000, downPayment: 40000, minGrossYield: 0.07, minMonthlyCashFlow: 200 };
    expect(plain(summaryRows(project({ kind: 'invest', criteria })))).toEqual([
      'Type d\'actif: null', 'Budget et apport: 200 000 € · apport 40 000 €', 'Rendement cible: brut ≥ 7,0 %', 'Cash-flow cible: ≥ +200 €/mois',
      'Localisation: null',
    ]);
    criteria.hotel = { ...criteria.hotel, minOccupancyRate: 0.7, minRooms: 20 };
    expect(plain(summaryRows(project({ kind: 'hotel', criteria })))).toEqual([
      'Opération: À définir', 'Budget global: null', 'Chambres: 20 et +', 'Indicateurs ciblés: occupation ≥ 70 %', 'Zone recherchée: null',
    ]);
    criteria.rental = { ...criteria.rental, maxRent: 900, maxMonthlyCharges: 50 };
    expect(plain(summaryRows(project({ kind: 'rent', criteria })))[1]).toBe('Budget mensuel: 950 € CC');
  });
});

describe('Mon projet : champs de montant (AmountField, GroupedNumberInput)', () => {
  it('met en forme la saisie comme l’app : milliers, une virgule, signe seulement si permis', () => {
    expect(groupedInput('1000000')).toBe('1\u202F000\u202F000');
    expect(groupedInput('250 000 €')).toBe('250\u202F000');
    expect(groupedInput('6.5')).toBe('6,5');
    expect(groupedInput(',5')).toBe('0,5');
    expect(groupedInput('1,2,3')).toBe('1,23');
    expect(groupedInput('-200')).toBe('200');
    expect(groupedInput('-200', true)).toBe('-200');
    expect(groupedInput('2010', false, false)).toBe('2010');
    expect(groupedInput('abc')).toBe('');
  });

  it('valeur saisie : pourcentage en fraction sans bruit de calcul, rien sans chiffre', () => {
    expect(inputAmount('7,1', false, true)).toBe(0.071);
    expect(inputAmount('6,5', false, true)).toBe(0.065);
    expect(inputAmount('250\u202F000')).toBe(250000);
    expect(inputAmount('-150', true)).toBe(-150);
    expect(inputAmount('12,')).toBe(12);
    expect(inputAmount('-', true)).toBeNull();
    expect(inputAmount('')).toBeNull();
  });

  it('texte d’une valeur enregistrée', () => {
    expect(amountText(0.071, true)).toBe('7,1');
    expect(amountText(0.07, true)).toBe('7');
    expect(amountText(250000)).toBe('250\u202F000');
    expect(amountText(-200)).toBe('-200');
    expect(amountText(1985, false, false)).toBe('1985');
    expect(amountText(null)).toBe('');
  });
});
