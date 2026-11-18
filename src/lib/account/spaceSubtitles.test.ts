import { describe, expect, it } from 'vitest';
import { agendaSubtitle, onlineSubtitle, savedSearchesSubtitle, viewedSubtitle } from './spaceSubtitles';

// Mêmes textes que ProfileSubtitles de l'app (Features/Profile/ProfileView.swift).
describe('sous-titres de Mon compte', () => {
  it('Mon agenda : les visites à venir, puis celles à confirmer ; rien sans visite', () => {
    expect(agendaSubtitle(0, 0)).toBeNull();
    expect(agendaSubtitle(0, 2)).toBeNull();
    expect(agendaSubtitle(1, 0)).toBe('1 visite à venir');
    expect(agendaSubtitle(3, 0)).toBe('3 visites à venir');
    expect(agendaSubtitle(3, 1)).toBe('3 visites à venir · 1 à confirmer');
  });

  it('Mes recherches, Biens consultés et Mes annonces : rien à zéro', () => {
    expect(savedSearchesSubtitle(0)).toBeNull();
    expect(savedSearchesSubtitle(1)).toBe('1 recherche enregistrée');
    expect(savedSearchesSubtitle(2)).toBe('2 recherches enregistrées');
    expect(viewedSubtitle(0)).toBeNull();
    expect(viewedSubtitle(1)).toBe('1 bien');
    expect(viewedSubtitle(12)).toBe('12 biens');
    expect(onlineSubtitle(0)).toBeNull();
    expect(onlineSubtitle(2)).toBe('2 en ligne');
  });
});
