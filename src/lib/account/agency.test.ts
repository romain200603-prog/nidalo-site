import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Le serveur est simulé : chaque appel est noté, et chaque table répond ce que le test a prévu.
type Call = { table: string; action: string; payload?: unknown; filters: [string, unknown][]; options?: unknown };
const calls: Call[] = [];
const storageCalls: { action: string; path: unknown; options?: unknown }[] = [];
let answers: Record<string, unknown> = {};
let failing: Record<string, unknown> = {};

function builder(table: string) {
  const call: Call = { table, action: 'select', filters: [] };
  calls.push(call);
  const result = () => {
    const key = `${table}.${call.action}`;
    if (failing[key]) return { data: null, error: failing[key] };
    return { data: answers[key] ?? null, error: null };
  };
  const chain: Record<string, unknown> = {
    select: () => chain,
    insert: (payload: unknown) => { call.action = 'insert'; call.payload = payload; return chain; },
    update: (payload: unknown) => { call.action = 'update'; call.payload = payload; return chain; },
    upsert: (payload: unknown, options: unknown) => { call.action = 'upsert'; call.payload = payload; call.options = options; return chain; },
    eq: (column: string, value: unknown) => { call.filters.push([column, value]); return chain; },
    limit: () => chain,
    single: () => chain,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
  };
  return chain;
}

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => builder(table),
    storage: {
      from: () => ({
        upload: async (path: string, _blob: Blob, options: unknown) => {
          storageCalls.push({ action: 'upload', path, options });
          return failing['storage.upload'] ? { data: null, error: failing['storage.upload'] } : { data: { path }, error: null };
        },
        remove: async (paths: string[]) => { storageCalls.push({ action: 'remove', path: paths }); return { data: [], error: null }; },
      }),
    },
  },
}));
vi.mock('./session', async (original) => ({ ...(await original<typeof import('./session')>()), currentUserId: () => USER }));
vi.mock('./professional', () => ({ loadProfessional: vi.fn(async () => undefined) }));
vi.mock('./profile', async (original) => ({ ...(await original<typeof import('./profile')>()), loadAccount: vi.fn(async () => undefined) }));

const USER = 'a0000000-0000-4000-8000-0000000000c2';

import {
  AGENCY_LOGO_MESSAGE, AGENCY_SAVE_MESSAGE, agencyErrors, agencyFormFor, agencyPlace, agencyRows, isValidSiren, isValidSiret,
  professionalRows, saveAgency, websiteUrl, type AgencyForm,
} from './agency';
import { NETWORK_MESSAGE } from './auth';

const filled: AgencyForm = {
  agencyName: '  Agence du Parc ', postalCode: '69006', city: ' Lyon ', phone: '06 12 34 56 78', email: 'contact@agenceduparc.fr',
  website: 'www.agenceduparc.fr', feeSchedule: 'agenceduparc.fr/honoraires', about: '  Vente et gestion à Lyon 6e.  ', siren: '443 061 841', siret: '443 061 841 00005',
  cardNumber: ' CPI 6901 2026 000 000 001 ', cardIssuer: 'CCI Lyon Métropole', financialGuarantor: 'Galian',
  liabilityInsurer: 'MMA', liabilityPolicy: 'RCP-2026-118',
};

beforeEach(() => {
  calls.length = 0;
  storageCalls.length = 0;
  answers = {};
  failing = {};
});

afterEach(() => vi.clearAllMocks());

describe('Profil agence : règles du formulaire, comme l\'app', () => {
  it('reconnaît un SIREN et un SIRET valides, avec ou sans espaces, et l\'exception de La Poste', () => {
    expect(isValidSiren('443061841')).toBe(true);
    expect(isValidSiren('443 061 841')).toBe(true);
    expect(isValidSiren('443-061-842')).toBe(false);
    expect(isValidSiren('12345678')).toBe(false);
    expect(isValidSiret('44306184100005')).toBe(true);
    expect(isValidSiret('443 061 841 00006')).toBe(false);
    expect(isValidSiret('35600000000001')).toBe(true);
    expect(isValidSiret('4430618410000')).toBe(false);
  });

  it('complète l\'adresse du site, refuse ce qui n\'en est pas une', () => {
    expect(websiteUrl('www.agence.fr')).toBe('https://www.agence.fr');
    expect(websiteUrl(' http://agence.fr/contact ')).toBe('http://agence.fr/contact');
    expect(websiteUrl('agence')).toBeNull();
    expect(websiteUrl('mon agence.fr')).toBeNull();
    expect(websiteUrl('')).toBeNull();
  });

  it('demande le nom, la ville et le SIREN ; vérifie les autres numéros seulement s\'ils sont saisis', () => {
    const empty = agencyFormFor(null);
    expect(agencyErrors(empty)).toEqual({
      agencyName: 'Indiquez le nom de l\'agence.',
      siren: 'Indiquez le numéro SIREN.',
      city: 'Indiquez la ville de l\'agence.',
    });
    expect(agencyErrors(filled)).toEqual({});
    expect(agencyErrors({ ...filled, siret: '54205118000066' })).toEqual({ siret: 'Le SIRET doit commencer par le SIREN.' });
    expect(agencyErrors({
      ...filled, siren: '443061842', siret: '44306184100006', postalCode: '6900', email: 'contact@', website: 'agence',
      phone: '12', cardNumber: 'x'.repeat(41), agencyName: 'A'.repeat(121),
    })).toEqual({
      agencyName: '120 caractères au plus.',
      siren: 'Le SIREN compte 9 chiffres valides.',
      siret: 'Le SIRET compte 14 chiffres valides.',
      cardNumber: '40 caractères au plus.',
      postalCode: 'Le code postal compte 5 chiffres.',
      email: 'Adresse e-mail invalide.',
      website: 'Adresse du site invalide (https://…).',
      phone: 'Numéro de téléphone invalide.',
    });
  });

  it('enregistre des valeurs propres, coupées aux limites du serveur', () => {
    const rows = agencyRows({ ...filled, about: 'é'.repeat(2100), cardIssuer: '', phone: '+33 6 12 34 56 78' });
    expect(rows.profile).toEqual({ agency_name: 'Agence du Parc', postal_code: '69006', city: 'Lyon' });
    expect(rows.details).toMatchObject({
      siren: '443061841', siret: '44306184100005', professional_card_number: 'CPI 6901 2026 000 000 001', phone: '+33612345678',
      email: 'contact@agenceduparc.fr', website: 'https://www.agenceduparc.fr', professional_card_cci: null,
      financial_guarantee: 'Galian', rcp_insurer: 'MMA', rcp_policy_number: 'RCP-2026-118',
    });
    expect([...(rows.details.about ?? '')].length).toBe(2000);
    expect(agencyRows(agencyFormFor(null)).details).toMatchObject({ siren: null, phone: null, website: null, fee_schedule_url: null, about: null });
  });

  it('barème d\'honoraires : un lien complété comme le site, refusé s\'il n\'en est pas un', () => {
    expect(agencyRows(filled).details.fee_schedule_url).toBe('https://agenceduparc.fr/honoraires');
    expect(agencyErrors({ ...filled, feeSchedule: 'mon barème' }).feeSchedule).toBe('Adresse du barème invalide (https://…).');
    expect(agencyErrors(filled).feeSchedule).toBeUndefined();
  });

  it('propose l\'adresse du compte pour une première fiche, et montre le numéro par paires', () => {
    expect(agencyFormFor(null, 'claire@exemple.fr').email).toBe('claire@exemple.fr');
    const record = {
      id: 'p1', agency_name: 'Agence du Parc', logo_path: null, postal_code: '69006', city: 'Lyon', is_verified: false,
      details: { ...agencyRows(filled).details, email: null },
    };
    const form = agencyFormFor(record, 'claire@exemple.fr');
    expect(form.email).toBe('');
    expect(form.phone).toBe('06 12 34 56 78');
    expect(agencyPlace(record)).toBe('Lyon (69006)');
    expect(professionalRows(record.details).map((row) => row.label)).toEqual([
      'SIREN', 'SIRET', 'Carte professionnelle', 'CCI de délivrance', 'Garantie financière', 'Assurance RCP', 'Contrat RCP',
    ]);
  });
});

describe('Profil agence : enregistrement', () => {
  it('crée la fiche, ses détails, puis passe le compte en professionnel relié à la fiche', async () => {
    answers = { 'professional_profiles.select': [], 'professional_profiles.insert': { id: 'nouvelle' } };
    expect(await saveAgency(filled, null)).toBeNull();
    const writes = calls.filter((call) => call.action !== 'select');
    expect(writes.map((call) => `${call.table}.${call.action}`)).toEqual([
      'professional_profiles.insert', 'professional_profile_details.upsert', 'profiles.update',
    ]);
    expect(writes[0].payload).toEqual({ agency_name: 'Agence du Parc', postal_code: '69006', city: 'Lyon' });
    expect(writes[1].payload).toMatchObject({ professional_profile_id: 'nouvelle', siren: '443061841' });
    expect(writes[1].options).toEqual({ onConflict: 'professional_profile_id' });
    expect(writes[2].payload).toEqual({ professional_profile_id: 'nouvelle', account_type: 'professional' });
    expect(writes[2].filters).toEqual([['id', USER]]);
    expect(storageCalls).toEqual([]);
  });

  it('modifie la fiche existante, envoie le logo sous un nom neuf, puis retire l\'ancien', async () => {
    answers = { 'professional_profiles.select': [{ id: 'p1', logo_path: `${USER}/agency-logo.jpg` }] };
    expect(await saveAgency(filled, new Blob(['jpeg'], { type: 'image/jpeg' }))).toBeNull();
    const writes = calls.filter((call) => call.action !== 'select');
    expect(writes.map((call) => `${call.table}.${call.action}`)).toEqual([
      'professional_profiles.update', 'professional_profile_details.upsert', 'profiles.update', 'professional_profiles.update',
    ]);
    expect(writes[0].filters).toEqual([['id', 'p1']]);
    const upload = storageCalls[0];
    expect(upload.action).toBe('upload');
    expect(String(upload.path)).toMatch(new RegExp(`^${USER}/agency-logo-[0-9a-f-]{36}\\.jpg$`));
    expect(upload.options).toEqual({ contentType: 'image/jpeg', cacheControl: '3600' });
    expect(writes[3].payload).toEqual({ logo_path: upload.path });
    expect(storageCalls[1]).toEqual({ action: 'remove', path: [`${USER}/agency-logo.jpg`] });
  });

  it('dit clairement ce qui n\'a pas marché : connexion, serveur, ou seulement le logo', async () => {
    failing = { 'professional_profiles.select': new TypeError('Failed to fetch') };
    expect(await saveAgency(filled, null)).toBe(NETWORK_MESSAGE);
    failing = { 'professional_profile_details.upsert': { code: '23514', message: 'check' } };
    answers = { 'professional_profiles.select': [{ id: 'p1', logo_path: null }] };
    expect(await saveAgency(filled, null)).toBe(AGENCY_SAVE_MESSAGE);
    failing = { 'storage.upload': { message: 'refusé' } };
    expect(await saveAgency(filled, new Blob(['jpeg']))).toBe(AGENCY_LOGO_MESSAGE);
  });
});
