import { afterEach, describe, expect, it, vi } from 'vitest';

// Le client Supabase est remplacé : ces tests ne touchent pas au réseau.
vi.mock('../supabase', () => ({ supabase: {} }));

import {
  cleanToken, forgetInvitation, inviteEmailError, inviteLine, inviteMailHref, invitationUrl, inviteTitle, memberAgency, memberLine,
  memberName, pendingInvitation, rememberInvitation, teamSubtitle, type TeamAgency, type TeamInvite, type TeamMember, type TeamState,
} from './team';

const NOW = new Date('2026-11-08T15:00:00Z');
const TOKEN = '0123456789abcdef0123456789abcdef';

const member = (over: Partial<TeamMember>): TeamMember => ({
  user_id: 'u1', role: 'agent', public_name: 'Hugo T.', avatar_path: null, joined_at: '2026-11-06T09:30:00Z', ...over,
});

const invite = (over: Partial<TeamInvite>): TeamInvite => ({
  id: 'i1', token: TOKEN, role: 'agent', email: null, created_by: 'g', created_by_name: 'Gérard G.',
  created_at: '2026-11-08T14:00:00Z', expires_at: '2026-11-15T14:00:00Z', ...over,
});

const agency = (role: TeamAgency['role']): TeamAgency => ({
  agency_id: 'a1', role, agency_name: 'Agence du Parc', logo_path: null, postal_code: '69006', city: 'Lyon',
});

const ready = (role: TeamAgency['role'] | null, members: TeamMember[] = []): TeamState => ({
  status: 'ready', agency: role ? agency(role) : null, members, invites: [],
});

function withStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
    location: { origin: 'https://nidalo.fr' },
  });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Gestion des équipes', () => {
  it('écrit les membres et les invitations en cours', () => {
    expect(memberLine(member({}), NOW)).toBe('Agent · depuis le 6 novembre');
    // 31 décembre, 23 h 30 en heure universelle : déjà le 1er janvier à Paris (cette année, donc sans l'année).
    expect(memberLine(member({ role: 'manager', joined_at: '2025-12-31T23:30:00Z' }), NOW)).toBe('Responsable · depuis le 1 janvier');
    expect(memberLine(member({ joined_at: '2025-06-01T10:00:00Z' }), NOW)).toBe('Agent · depuis le 1 juin 2025');
    expect(memberLine(member({ role: 'owner' }), NOW)).toBe('Gérant · a créé l\'agence');
    expect(memberName(member({ public_name: '  ' }))).toBe('Membre sans nom');
    expect(inviteLine(invite({}), NOW)).toBe('Agent · expire le 15 novembre');
    expect(inviteLine(invite({ role: 'manager', expires_at: '2027-01-02T10:00:00Z' }), NOW)).toBe('Responsable · expire le 2 janvier 2027');
    expect([inviteTitle(invite({})), inviteTitle(invite({ email: 'julie@exemple.fr' }))]).toEqual(['Lien pour une personne', 'julie@exemple.fr']);
  });

  it('résume l\'équipe pour Mon compte et reconnaît un membre', () => {
    expect(teamSubtitle({ status: 'loading' })).toBe('Inviter des collaborateurs');
    expect(teamSubtitle(ready(null))).toBe('Inviter des collaborateurs');
    expect(teamSubtitle(ready('owner', [member({ role: 'owner' })]))).toBe('Inviter des collaborateurs');
    expect(teamSubtitle(ready('owner', [member({ role: 'owner' }), member({}), member({ role: 'manager' })]))).toBe('3 membres');
    expect(memberAgency(ready('owner'))).toBeNull();
    expect(memberAgency(ready('agent'))?.agency_name).toBe('Agence du Parc');
    expect(memberAgency({ status: 'error', message: 'x' })).toBeNull();
  });

  it('lit le jeton du lien et prépare le lien et l\'e-mail', () => {
    expect([cleanToken(` ${TOKEN.toUpperCase()} `), cleanToken('abc'), cleanToken(null), cleanToken(`${TOKEN}0`)]).toEqual([TOKEN, null, null, null]);
    withStorage();
    const url = invitationUrl(TOKEN);
    expect(url).toBe(`https://nidalo.fr/compte/?vue=equipes&invitation=${TOKEN}`);
    const href = inviteMailHref('julie@exemple.fr', 'manager', 'Agence du Parc', url);
    expect(href.startsWith('mailto:julie@exemple.fr?subject=')).toBe(true);
    const params = new URLSearchParams(href.slice(href.indexOf('?') + 1));
    expect(params.get('subject')).toBe('Rejoignez l\'équipe Agence du Parc sur Nidalo');
    expect(params.get('body')).toContain('comme responsable');
    expect(params.get('body')).toContain(url);
    expect(inviteMailHref(null, 'agent', 'A', url).startsWith('mailto:?subject=')).toBe(true);
    expect([inviteEmailError(''), inviteEmailError(' julie@exemple.fr '), inviteEmailError('julie@'), inviteEmailError(`${'a'.repeat(250)}@x.fr`)])
      .toEqual([null, null, 'Adresse e-mail invalide.', 'Adresse e-mail invalide.']);
  });

  it('garde une invitation ouverte avant la connexion, 7 jours au plus', () => {
    const values = withStorage();
    const at = Date.UTC(2026, 10, 8, 15);
    rememberInvitation(TOKEN, at);
    expect(pendingInvitation(at + 6 * 24 * 3600 * 1000)).toBe(TOKEN);
    expect(pendingInvitation(at + 7 * 24 * 3600 * 1000)).toBeNull();
    expect(values.size).toBe(0);
    rememberInvitation(TOKEN, at);
    forgetInvitation();
    expect(pendingInvitation(at)).toBeNull();
    values.set('nidalo.teamInvitation', '{abîmé');
    expect(pendingInvitation(at)).toBeNull();
    expect(values.size).toBe(0);
  });
});
