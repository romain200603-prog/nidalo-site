import { describe, expect, it } from 'vitest';
import type { ListingRow } from '../listings';
import type { ServerInboxRow } from '../messages/inbox';
import { parisDay, shouldCountView } from '../listing/views';
import type { ContactOfferRow, ContactVisitRow } from './contacts';
import { buildStats, favoritesTotalLine, periodStartDay } from './stats';

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const BUYER = 'bbbbbbbb-0000-4000-8000-000000000002';
const FLAT = '11111111-0000-4000-8000-000000000001';
const HOUSE = '22222222-0000-4000-8000-000000000002';
const DRAFT = '33333333-0000-4000-8000-000000000003';

const listing = (id: string, title: string, status: string) => ({ id, title, status }) as unknown as ListingRow;
const conversation = (over: Partial<ServerInboxRow>): ServerInboxRow => ({
  conversation_id: 'c1', kind: 'listing', listing_id: FLAT, listing_snapshot: { listingId: FLAT }, buyer_id: BUYER, seller_id: ME,
  created_at: '2026-11-05T09:00:00Z', last_message_at: '2026-11-05T09:01:00Z', ...over,
});
const visit = (over: Partial<ContactVisitRow> & { previous_request_id?: string | null }): ContactVisitRow => ({
  id: 'v1', listing_id: FLAT, listing_snapshot: { listingId: FLAT }, requester: { userId: BUYER, name: 'Paul D.', kind: 'individual' },
  recipient: { userId: ME, name: 'Agence', kind: 'agency' }, slots: [], mode: 'onSite', status: 'pending', accepted_slot: null,
  proposed_slots: null, created_at: '2026-11-06T09:00:00Z', ...over,
});
const offer = (over: Partial<ContactOfferRow>): ContactOfferRow => ({
  id: 'o1', conversation_id: 'c1', listing_id: FLAT, amount: 230000, status: 'pending', created_at: '2026-11-07T09:00:00Z',
  expires_at: null, buyer_id: BUYER, seller_id: ME, author_id: BUYER, parent_offer_id: null, ...over,
});

describe('Statistiques', () => {
  it('commence la période au bon jour de Paris', () => {
    const now = new Date('2026-11-08T23:30:00Z'); // déjà le 9 novembre à Paris
    expect(parisDay(now)).toBe('2026-11-09');
    expect(periodStartDay(7, now)).toBe('2026-11-03');
    expect(periodStartDay(30, now)).toBe('2026-10-11');
  });

  it('compte, par annonce publiée, les vues, favoris, conversations, visites et offres de la période', () => {
    const { totals, items } = buildStats({
      me: ME,
      listings: [listing(HOUSE, 'Maison', 'sold'), listing(FLAT, 'Appartement', 'active'), listing(DRAFT, 'Brouillon', 'draft')],
      server: [
        { listing_id: FLAT, views: '120', favorites_total: 8, favorites_new: 2 },
        { listing_id: HOUSE, views: 300, favorites_total: 1, favorites_new: 0 },
        { listing_id: DRAFT, views: 5, favorites_total: 0, favorites_new: 0 },
      ],
      conversations: [
        conversation({}),
        conversation({ conversation_id: 'c2', created_at: '2026-10-01T09:00:00Z' }), // avant la période
        conversation({ conversation_id: 'c3', last_message_at: null }), // aucun message
        conversation({ conversation_id: 'c4', buyer_id: ME, seller_id: BUYER }), // mon message à quelqu'un d'autre
        conversation({ conversation_id: 'c5', kind: 'direct' }),
      ],
      visits: [
        visit({}),
        visit({ id: 'v2', previous_request_id: 'v1' }), // nouveau créneau, pas une nouvelle demande
        visit({ id: 'v3', listing_id: HOUSE, listing_snapshot: { listingId: HOUSE } }),
        visit({ id: 'v4', requester: { userId: ME, name: 'Moi', kind: 'agency' }, recipient: { userId: BUYER, name: 'Paul D.', kind: 'individual' } }),
      ],
      offers: [
        offer({}),
        offer({ id: 'o2', author_id: ME, parent_offer_id: 'o1' }), // ma contre-offre
        offer({ id: 'o3', created_at: '2026-10-01T09:00:00Z' }), // avant la période
      ],
      startDay: '2026-11-02',
    });
    expect(items.map((item) => [item.row.title, item.counts, item.favoritesTotal])).toEqual([
      ['Appartement', { views: 120, favorites: 2, messages: 1, visits: 1, offers: 1 }, 8],
      ['Maison', { views: 300, favorites: 0, messages: 0, visits: 1, offers: 0 }, 1],
    ]);
    expect(totals).toEqual({ views: 420, favorites: 2, messages: 1, visits: 2, offers: 1 });
  });

  it('écrit le nombre de favoris en tout', () => {
    expect([favoritesTotalLine(0), favoritesTotalLine(1), favoritesTotalLine(1200)])
      .toEqual([null, '1 personne l\'a en favori', '1 200 personnes l\'ont en favori']);
  });

  it('compte une vue par annonce et par jour dans ce navigateur', () => {
    const store = new Map<string, string>();
    Object.assign(globalThis, {
      localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } },
    });
    const morning = new Date('2026-11-08T08:00:00Z');
    expect([shouldCountView(FLAT, morning), shouldCountView(FLAT.toUpperCase(), morning), shouldCountView(HOUSE, morning)]).toEqual([true, false, true]);
    // Le lendemain, la liste de la veille est oubliée.
    expect(shouldCountView(FLAT, new Date('2026-11-09T08:00:00Z'))).toBe(true);
    expect(Object.keys(JSON.parse(store.get('nidalo.vues') ?? '{}'))).toEqual([FLAT]);
  });
});
