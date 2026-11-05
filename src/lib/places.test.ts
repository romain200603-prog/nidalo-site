import { describe, expect, it } from 'vitest';
import {
  departmentCodes, highlightRanges, nameStartsWith, normalized, parseCommunes, parseGeoplateforme, placeQuery, placeShortName,
  placeSubtitle, refined, type PlaceSuggestion,
} from './places';
import * as fixtures from './placeFixtures.test-data';

// Mêmes cas que l'app (Packages/ImmoKit/Tests/ImmoDomainTests/PlaceSuggestionTests.swift).
describe('lieux', () => {
  it('analyse la saisie du champ de recherche', () => {
    expect(placeQuery('01630')).toEqual({ kind: 'postalCode', value: '01630' });
    expect(placeQuery('016')).toEqual({ kind: 'postalCodePrefix', value: '016' });
    expect(placeQuery('P')).toEqual({ kind: 'initial', value: 'P' });
    expect(placeQuery('  Peron  ')).toEqual({ kind: 'text', value: 'Peron' });
    expect(placeQuery('   ')).toEqual({ kind: 'none' });
    expect(placeQuery('7')).toEqual({ kind: 'none' });
  });

  it('trouve les départements d’un début de code postal', () => {
    expect(departmentCodes('01')).toEqual(['01']);
    expect(departmentCodes('016')).toEqual(['01']);
    expect(departmentCodes('20')).toEqual(['2A', '2B']);
    expect(departmentCodes('974')).toEqual(['974']);
    expect(departmentCodes('97')).toEqual([]);
  });

  it('tolère accents, tirets et articles', () => {
    expect(normalized('Saint-Genis-Pouilly')).toBe(normalized('saint genis  pouilly'));
    expect(normalized('Péron')).toBe('peron');
    expect(nameStartsWith('Péron', 'pe')).toBe(true);
    expect(nameStartsWith('Le Pecq', 'pe')).toBe(true);
    expect(nameStartsWith('Saint-Paul', 'p')).toBe(false);
  });

  it('lit les communes de la Géoplateforme', () => {
    const [peron] = parseGeoplateforme(fixtures.peron);
    expect(peron.kind).toBe('municipality');
    expect(peron.name).toBe('Péron');
    expect(peron.postalCode).toBe('01630');
    expect(peron.department).toBe('Ain');
    expect(peron.inseeCode).toBe('01288');
    expect(placeSubtitle(peron)).toBe('01630 · Ain · Commune');
    expect(peron.coordinate).toBeDefined();
  });

  it('lit les adresses', () => {
    const [address] = parseGeoplateforme(fixtures.imp);
    expect(address.kind).toBe('address');
    expect(address.name.startsWith('74 Impasse')).toBe(true);
    expect(placeSubtitle(address)).toBe('01630 · Péron · Adresse');
  });

  it('lit les arrondissements, sans proposer de rue', () => {
    const results = parseGeoplateforme(fixtures.lyon3);
    const district = results.find((place) => place.kind === 'district');
    expect(district && placeShortName(district)).toBe('Lyon 3e');
    expect(district?.city).toBe('Lyon');
    expect(district?.postalCode).toBe('69003');
    expect(refined(results, 6).every((place) => place.kind === 'district')).toBe(true);
  });

  it('lit les communes d’un code postal', () => {
    const communes = parseCommunes(fixtures.cp, '01630');
    expect(communes.length).toBe(5);
    expect(communes[0].name).toBe('Saint-Genis-Pouilly');
    expect(communes.some((c) => c.name === 'Péron' && placeSubtitle(c) === '01630 · Ain · Commune')).toBe(true);
  });

  it('garde les communes qui commencent par l’initiale', () => {
    const communes = parseCommunes(fixtures.pe).filter((c) => nameStartsWith(c.name, 'pe'));
    expect(communes.map((c) => c.name)).toEqual(['Perpignan', 'Pessac', 'Le Pecq', 'Péron']);
  });

  it('retire les doublons et respecte la limite', () => {
    const peron: PlaceSuggestion = { id: '1', kind: 'municipality', name: 'Péron', postalCode: '01630' };
    const copy: PlaceSuggestion = { id: '2', kind: 'municipality', name: 'Peron', postalCode: '01630' };
    const street: PlaceSuggestion = { id: '3', kind: 'street', name: 'Rue de Péron', postalCode: '01630' };
    expect(refined([peron, copy, street], 6)).toEqual([peron]);
  });
});

describe('surlignage', () => {
  it('surligne la partie tapée, en début de mot de préférence', () => {
    const text = '74 Impasse des Mésanges';
    const parts = (t: string, q: string) => highlightRanges(t, q).map(([s, e]) => t.slice(s, e));
    expect(parts(text, '74 imp')).toEqual(['74', 'Imp']);
    expect(parts('Péron', 'pe')).toEqual(['Pé']);
    expect(parts(text, 'mes')).toEqual(['Més']);
    expect(parts('Saint-Genis-Pouilly', 'genis')).toEqual(['Genis']);
  });
});
