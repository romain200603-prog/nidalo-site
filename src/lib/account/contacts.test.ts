import { describe, expect, it } from 'vitest';
import type { ProfileRow, ServerInboxRow } from '../messages/inbox';
import {
  buildContacts, contactErrors, contactLine, contactsSubtitle, contactWrite, filterContacts,
  type ContactOfferRow, type ContactRow, type ContactVisitRow,
} from './contacts';

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const CLAIRE = 'bbbbbbbb-0000-4000-8000-000000000002';
const PAUL = 'cccccccc-0000-4000-8000-000000000003';
const AGENCE = 'dddddddd-0000-4000-8000-000000000004';
const NOW = new Date('2026-11-08T12:00:00Z');
const s = ' ';

const conversation = (over: Partial<ServerInboxRow>): ServerInboxRow => ({
  conversation_id: 'c1', kind: 'listing', listing_id: 'l1', listing_snapshot: { title: 'Appartement lumineux avec balcon' },
  buyer_id: CLAIRE, seller_id: ME, created_at: '2026-11-01T09:00:00Z', last_message_at: '2026-11-06T10:00:00Z',
  last_message_preview: 'Bonjour, est-il toujours disponible ?', ...over,
});

const visit = (over: Partial<ContactVisitRow>): ContactVisitRow => ({
  id: 'v1', listing_id: 'l1', listing_snapshot: { listingId: 'l1', title: 'Appartement lumineux avec balcon' },
  requester: { userId: PAUL, name: 'Paul D.', kind: 'individual' }, recipient: { userId: ME, name: 'Rhône Immobilier', kind: 'agency' },
  slots: [{ id: 's1', start: '2026-11-12T09:00:00Z', durationMinutes: 30 }], mode: 'onSite', status: 'accepted',
  accepted_slot: { id: 's1', start: '2026-11-12T09:00:00Z', durationMinutes: 30 }, proposed_slots: null,
  created_at: '2026-11-07T08:00:00Z', ...over,
});

const offer = (over: Partial<ContactOfferRow>): ContactOfferRow => ({
  id: 'o1', conversation_id: 'c1', listing_id: 'l1', listing_snapshot: { title: 'Appartement lumineux avec balcon' },
  amount: 230000, status: 'pending', created_at: '2026-10-20T09:00:00Z', expires_at: '2026-12-01T09:00:00Z',
  buyer_id: CLAIRE, seller_id: ME, author_id: CLAIRE, ...over,
});

const profile = (userId: string, over: Partial<ProfileRow> = {}): ProfileRow => ({
  user_id: userId, public_name: null, avatar_path: null, account_type: 'individual', agency_name: null, agency_phone: null, ...over,
});

const profiles = new Map([
  [CLAIRE, profile(CLAIRE, { public_name: 'Claire M.', avatar_path: `${CLAIRE}/avatar.jpg` })],
  [AGENCE, profile(AGENCE, { account_type: 'professional', public_name: 'Jean', agency_name: 'Saône Conseil', agency_logo_path: `${AGENCE}/logo.jpg` })],
]);

const manual = (over: Partial<ContactRow>): ContactRow => ({
  id: 'eeeeeeee-0000-4000-8000-000000000005', contact_user_id: null, name: 'Marc Petit', phone: '0612345678', email: 'marc@example.fr',
  note: 'Cherche un T3 à Lyon 6e', created_at: '2026-11-02T09:00:00Z', updated_at: '2026-11-03T09:00:00Z', ...over,
});

describe('Mes contacts', () => {
  it('réunit les échanges d\'une même personne, du plus récent au plus ancien', () => {
    const [claire, ...rest] = buildContacts({
      me: ME, conversations: [conversation({})], visits: [], offers: [offer({})], profiles, rows: [], now: NOW,
    });
    expect(rest).toEqual([]);
    expect(claire).toMatchObject({
      key: `u-${CLAIRE}`, userId: CLAIRE, name: 'Claire M.', avatarPath: `${CLAIRE}/avatar.jpg`, isAgency: false, conversationId: 'c1',
      listingTitles: ['Appartement lumineux avec balcon'], isNew: false, note: '', rowId: null,
    });
    expect(claire.activities.map((activity) => [activity.kind, activity.title, activity.detail, activity.href])).toEqual([
      ['message', 'Message', 'Bonjour, est-il toujours disponible ?', '/messages/?c=c1'],
      ['offer', `Offre de 230${s}000 €`, 'En attente', '/messages/?c=c1'],
    ]);
    expect(claire.lastAt.toISOString()).toBe('2026-11-06T10:00:00.000Z');
  });

  it('garde seulement les personnes intéressées par mes annonces', () => {
    const contacts = buildContacts({
      me: ME,
      conversations: [
        conversation({ seller_id: CLAIRE, buyer_id: ME }), // mon message sur l'annonce de quelqu'un d'autre
        conversation({ conversation_id: 'c2', kind: 'direct' }),
        conversation({ conversation_id: 'c3', last_message_at: null }), // conversation ouverte, aucun message
      ],
      visits: [visit({ requester: { userId: ME, name: 'Moi', kind: 'agency' }, recipient: { userId: PAUL, name: 'Paul D.', kind: 'individual' } })],
      offers: [offer({ buyer_id: ME, seller_id: CLAIRE, author_id: ME })],
      profiles, rows: [], now: NOW,
    });
    expect(contacts).toEqual([]);
  });

  it('montre les demandes de visite, reçues ou comme agent, avec le créneau confirmé', () => {
    const [paul, agence] = buildContacts({
      me: ME, conversations: [], offers: [], profiles, rows: [], now: NOW,
      visits: [
        visit({}),
        visit({
          id: 'v2', requester: { userId: AGENCE, name: 'Saône Conseil', kind: 'agency' }, recipient: { userId: CLAIRE, name: 'Claire M.', kind: 'individual' },
          agent_user_id: ME, mode: 'video', status: 'pending', accepted_slot: null, created_at: '2026-10-01T08:00:00Z',
          slots: [{ id: 's2', start: '2026-11-20T09:00:00Z', durationMinutes: 30 }],
        }),
      ],
    });
    expect(paul).toMatchObject({ name: 'Paul D.', isNew: true, conversationId: null });
    expect([paul.activities[0].title, paul.activities[0].href]).toEqual(['Demande de visite', '/compte/?vue=demande-visite&id=v1']);
    expect(paul.activities[0].detail).toMatch(/^Confirmée · Jeu\. 12 nov\. · \d{1,2}h00$/);
    expect(agence).toMatchObject({ name: 'Saône Conseil', avatarPath: `${AGENCE}/logo.jpg`, isAgency: true, isNew: false });
    expect([agence.activities[0].title, agence.activities[0].detail]).toEqual(['Demande de visite vidéo', 'En attente']);
  });

  it('écrit les contre-offres du point de vue du vendeur', () => {
    const [claire] = buildContacts({
      me: ME, conversations: [], visits: [], profiles, rows: [], now: NOW,
      offers: [
        offer({ status: 'countered' }),
        offer({ id: 'o2', parent_offer_id: 'o1', author_id: ME, amount: 235000, status: 'countered', created_at: '2026-10-21T09:00:00Z' }),
        offer({ id: 'o3', parent_offer_id: 'o2', amount: 233000, status: 'accepted', created_at: '2026-10-22T09:00:00Z' }),
      ],
    });
    expect(claire.activities.map((activity) => `${activity.title} · ${activity.detail}`)).toEqual([
      `Offre de 233${s}000 € · Acceptée`,
      `Votre contre-offre de 235${s}000 € · Contre-offre reçue`,
      `Offre de 230${s}000 € · Contre-offre envoyée`,
    ]);
  });

  it('ajoute les contacts saisis à la main et les notes, même sans échange', () => {
    const contacts = buildContacts({
      me: ME, conversations: [conversation({})], visits: [], offers: [], profiles, now: NOW,
      rows: [
        manual({}),
        manual({ id: 'n1', contact_user_id: CLAIRE, name: null, phone: null, email: null, note: 'Rappeler lundi' }),
        manual({ id: 'n2', contact_user_id: AGENCE, name: null, phone: null, email: null, note: 'Confrère', updated_at: '2026-10-01T09:00:00Z' }),
      ],
    });
    expect(contacts.map((contact) => [contact.name, contact.rowId, contact.note])).toEqual([
      ['Claire M.', 'n1', 'Rappeler lundi'],
      ['Marc Petit', 'eeeeeeee-0000-4000-8000-000000000005', 'Cherche un T3 à Lyon 6e'],
      ['Saône Conseil', 'n2', 'Confrère'],
    ]);
    const marc = contacts[1];
    expect(marc).toMatchObject({ key: 'm-eeeeeeee-0000-4000-8000-000000000005', userId: null, phone: '0612345678', isNew: false });
    expect(contactLine(marc)).toBe('06 12 34 56 78 · marc@example.fr');
    expect(contactLine(contacts[0])).toBe('Message');
    expect(contactLine(contacts[2])).toBe('Membre Nidalo');
    expect(contactLine({ ...marc, phone: null, email: null })).toBe('Ajouté à la main');
  });

  it('filtre et cherche par nom, bien, numéro ou e-mail', () => {
    const contacts = buildContacts({
      me: ME, conversations: [conversation({})], visits: [visit({})], offers: [offer({})], profiles, rows: [manual({})], now: NOW,
    });
    const names = (list: typeof contacts) => list.map((contact) => contact.name);
    expect(names(filterContacts(contacts, 'all', ''))).toEqual(['Paul D.', 'Claire M.', 'Marc Petit']);
    expect(names(filterContacts(contacts, 'new', ''))).toEqual(['Paul D.']);
    expect(names(filterContacts(contacts, 'visits', ''))).toEqual(['Paul D.']);
    expect(names(filterContacts(contacts, 'offers', ''))).toEqual(['Claire M.']);
    expect(names(filterContacts(contacts, 'manual', ''))).toEqual(['Marc Petit']);
    expect(names(filterContacts(contacts, 'all', 'appart lum'))).toEqual(['Paul D.', 'Claire M.']);
    expect(names(filterContacts(contacts, 'all', '06 12'))).toEqual(['Marc Petit']);
    expect(names(filterContacts(contacts, 'all', 'marc@'))).toEqual(['Marc Petit']);
    expect(contactsSubtitle(contacts)).toBe('3 contacts · 1 nouveau');
    expect(contactsSubtitle([])).toBe('0 contact · 0 nouveau');
  });

  it('vérifie et prépare le formulaire d\'un contact', () => {
    expect(contactErrors({ name: ' ', phone: '12', email: 'marc@', note: '' })).toEqual({
      name: 'Indiquez le nom du contact.', phone: 'Numéro de téléphone invalide.', email: 'Adresse e-mail invalide.',
    });
    expect(contactErrors({ name: 'Marc', phone: '', email: '', note: 'x'.repeat(2001) })).toEqual({ note: `2${s}000 caractères au plus.` });
    expect(contactWrite({ name: ' Marc Petit ', phone: '06 12 34 56 78', email: ' ', note: ' Cherche un T3 ' })).toEqual({
      name: 'Marc Petit', phone: '0612345678', email: null, note: 'Cherche un T3',
    });
  });
});
