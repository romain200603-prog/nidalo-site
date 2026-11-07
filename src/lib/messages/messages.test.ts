import { describe, expect, it } from 'vitest';
import { readRoute, routePath } from '../../pages/messages/route';
import { allowedActions, counterOfferParams, offerStatusLabel, type OfferRow } from '../listing/offers';
import { conversationVisit, messageFrom, messageInsert, otherReadAt, phoneAccount, preferencesOf, preferencesWrite, serverMessage, upcomingVisits, type Message } from './api';
import {
  attachmentIssue, attachmentsContent, attachmentsPreview, contentMatches, contentPreview, decodeContent, documentIcon, documentLine,
  fileExtension, photoExtension, storageContentType, textContent, type Attachment,
} from './content';
import { reducedSize, storagePath, videoWithoutMetadata } from './files';
import {
  clock, DISTANT_FUTURE, dayLabel, durationLabel, formattedPhoneNumber, listLabel, looksLikePhoneNumber, matchesWords, muteLabel,
  normalizedPhoneNumber, sizeLabel, telHref, typingPhoneNumber,
} from './format';
import {
  contactMatches, contactsFrom, conversationFrom, counterpartInitials, filterIncludes, groupSummary, matchesInboxQuery, rowPreview,
  sectionLetter, unreadConversationCount, type ProfileRow, type ServerInboxRow,
} from './inbox';
import {
  bannerLocation, callState, canOpenDetails, linkTitle, mediaPreview, mutedUntil, muteNotice, needsFirstName, sharedItems, showsQuickReplies,
  threadDays, videoState, visibleMessages, visitState,
} from './thread';

// Messagerie : mêmes formats, textes et règles que l'app (données inventées).

const ME = 'a0000000-0000-4000-8000-0000000000c1';
const AGENT = 'a0000000-0000-4000-8000-0000000000e1';
const CAMILLE = 'a0000000-0000-4000-8000-0000000000e3';
const NOW = new Date(2026, 10, 6, 12, 0);

const PROFILES = new Map<string, ProfileRow>([
  [AGENT, { user_id: AGENT, public_name: 'Sophie D.', avatar_path: null, account_type: 'professional', agency_name: 'Agence Démo Lyon', agency_city: 'Lyon', agency_phone: '06 39 98 12 00' }],
  [CAMILLE, { user_id: CAMILLE, public_name: 'Camille R.', avatar_path: null, account_type: 'individual', agency_name: null, agency_phone: null }],
]);

function row(overrides: Partial<ServerInboxRow> = {}): ServerInboxRow {
  return {
    conversation_id: 'c1000000-0000-4000-8000-000000000001', kind: 'listing', listing_id: 'l1',
    listing_snapshot: { listingId: 'l1', title: 'Appartement 3 pièces', price: 238000, transaction: 'sale', city: 'Lyon 2e', coverPath: null },
    buyer_id: ME, seller_id: AGENT, created_at: '2026-11-01T09:00:00Z', other_user_id: AGENT, member_count: 2, unread_count: 0,
    ...overrides,
  };
}

const conversation = (overrides: Partial<ServerInboxRow> = {}, participants = [] as Parameters<typeof conversationFrom>[1]['participants']) =>
  conversationFrom(row(overrides), { me: ME, profiles: PROFILES, participants, communities: [] });

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1', conversationId: 'c1', senderId: AGENT, clientId: 'm1', content: { kind: 'text', text: 'Bonjour' },
    createdAt: new Date(2026, 10, 6, 10, 0), expiresAt: null, reaction: null, isRead: false, ...overrides,
  };
}

describe('Heures, tailles et numéros (MessageTime, AttachmentPolicy, PhoneNumber)', () => {
  it('heure de la liste : l’heure, « Hier », le jour de la semaine, puis la date', () => {
    expect(clock(new Date(2026, 10, 6, 9, 5))).toBe('09:05');
    expect(listLabel(new Date(2026, 10, 6, 10, 42), NOW)).toBe('10:42');
    expect(listLabel(new Date(2026, 10, 5, 23, 0), NOW)).toBe('Hier');
    expect(listLabel(new Date(2026, 10, 3, 8, 0), NOW)).toBe('Mar.');
    expect(listLabel(new Date(2026, 9, 27, 8, 0), NOW)).toBe('27 octobre');
    expect(dayLabel(new Date(2026, 10, 6, 1, 0), NOW)).toBe('Aujourd\'hui');
    expect(dayLabel(new Date(2026, 10, 5, 1, 0), NOW)).toBe('Hier');
    expect(dayLabel(new Date(2026, 10, 2, 1, 0), NOW)).toBe('Lundi 2 novembre');
  });

  it('tailles en Ko, Mo, Go (1 000 octets par Ko) et durées', () => {
    expect(sizeLabel(0)).toBe('0 Ko');
    expect(sizeLabel(400)).toBe('1 Ko');
    expect(sizeLabel(245_000)).toBe('245 Ko');
    expect(sizeLabel(1_234_567)).toBe('1,2 Mo');
    expect(sizeLabel(2_500_000_000)).toBe('2,5 Go');
    expect(durationLabel(42)).toBe('0:42');
    expect(durationLabel(725.4)).toBe('12:05');
  });

  it('sourdine : activées, toujours, ou jusqu’à une date', () => {
    expect(muteLabel(null, NOW)).toBe('Activées');
    expect(muteLabel(new Date(2026, 10, 6, 11, 0), NOW)).toBe('Activées');
    expect(muteLabel(DISTANT_FUTURE, NOW)).toBe('En sourdine');
    expect(muteLabel(new Date(2026, 10, 6, 18, 30), NOW)).toBe('Jusqu\'à 6 nov. à 18:30');
    expect(DISTANT_FUTURE.toISOString()).toBe('4001-01-01T00:00:00.000Z');
  });

  it('numéros français : reconnus, normalisés, écrits par paires', () => {
    expect(looksLikePhoneNumber('06 39 98')).toBe(true);
    expect(looksLikePhoneNumber('+33 6')).toBe(true);
    expect(looksLikePhoneNumber('69002')).toBe(false);
    expect(looksLikePhoneNumber('Julien')).toBe(false);
    expect(normalizedPhoneNumber('06 39 98 12 34')).toBe('0639981234');
    expect(normalizedPhoneNumber('+33 6 39 98 12 34')).toBe('0639981234');
    expect(normalizedPhoneNumber('0033639981234')).toBe('0639981234');
    expect(normalizedPhoneNumber('06 39 98')).toBeNull();
    expect(normalizedPhoneNumber('00 39 98 12 34')).toBeNull();
    expect(formattedPhoneNumber('0639981234')).toBe('06 39 98 12 34');
    expect(typingPhoneNumber('063998')).toBe('06 39 98');
    expect(typingPhoneNumber('+33639')).toBe('+33 6 39');
    expect(telHref('06 39 98 12 34')).toBe('tel:0639981234');
  });

  it('recherche : chaque mot saisi commence un mot, sans accents ni majuscules', () => {
    expect(matchesWords('ap ly', ['Appartement · Lyon 2e'])).toBe(true);
    expect(matchesWords('ap ma', ['Appartement · Lyon 2e'])).toBe(false);
    expect(matchesWords('ecu', ['Écully'])).toBe(true);
    expect(matchesWords('  ', ['Écully'])).toBe(false);
  });
});

describe('Contenu des messages (MessageContent, MessageAttachment)', () => {
  const photo: Attachment = { id: 'A1', kind: 'photo', fileName: 'Photo.jpg', storagePath: 'c1/p.jpg', byteCount: 1200 };
  const document: Attachment = { id: 'A2', kind: 'document', fileName: 'Bail.pdf', storagePath: 'c1/b.pdf', byteCount: 1_200_000, category: 'energyDiagnostic' };

  it('lit le JSON de l’app ; une sorte inconnue n’est pas lue', () => {
    expect(decodeContent({ text: { _0: 'Bonjour' } })).toEqual({ kind: 'text', text: 'Bonjour' });
    expect(decodeContent({ system: { _0: 'Claire M. a créé le groupe' } })).toEqual({ kind: 'system', text: 'Claire M. a créé le groupe' });
    expect(decodeContent({ offer: { offerId: 'F1' } })).toEqual({ kind: 'offer', offerId: 'F1' });
    expect(decodeContent({ offer: {} })).toEqual({ kind: 'unknown' });
    expect(decodeContent({ attachments: { _0: [photo, { id: 'X', kind: 'inconnu', fileName: 'x' }], caption: 'Voici' } }))
      .toEqual({ kind: 'attachments', items: [photo], caption: 'Voici' });
    expect(decodeContent({ visitConfirmed: { slot: '2026-11-12T17:00:00Z', address: '12 rue de l\'Exemple' } }))
      .toEqual({ kind: 'visitConfirmed', slot: '2026-11-12T17:00:00Z', address: '12 rue de l\'Exemple' });
    expect(decodeContent({ nouveau: {} })).toEqual({ kind: 'unknown' });
    expect(decodeContent(null)).toEqual({ kind: 'unknown' });
  });

  it('écrit le texte et les pièces jointes comme l’encodage de Swift (légende omise sans texte)', () => {
    expect(textContent('Salut')).toEqual({ text: { _0: 'Salut' } });
    expect(attachmentsContent([photo], null)).toEqual({ attachments: { _0: [photo] } });
    expect(attachmentsContent([photo], 'Voici')).toEqual({ attachments: { _0: [photo], caption: 'Voici' } });
  });

  it('aperçus de la liste (AttachmentPolicy.preview, MessageContent.preview)', () => {
    expect(attachmentsPreview([photo], null)).toBe('📷 Photo');
    expect(attachmentsPreview([photo, { ...photo, id: 'A3' }], null)).toBe('📷 2 photos');
    expect(attachmentsPreview([document], null)).toBe('📎 Bail.pdf');
    expect(attachmentsPreview([photo, document], null)).toBe('📎 2 pièces jointes');
    expect(attachmentsPreview([photo], 'Les photos')).toBe('Les photos');
    expect(contentPreview({ kind: 'offer', offerId: 'F1' })).toBe('💶 Offre');
    expect(contentPreview({ kind: 'visitConfirmed', slot: '', address: '' })).toBe('✅ Visite confirmée');
    expect(contentPreview({ kind: 'unknown' })).toBe('');
  });

  it('documents : extension, icône et ligne « DPE · PDF · 1,2 Mo »', () => {
    expect(fileExtension('Bail.signé.pdf')).toBe('PDF');
    expect(fileExtension('LISEZMOI')).toBe('');
    expect(documentIcon('a.xlsx')).toBe('fileSpreadsheet');
    expect(documentIcon('a.docx')).toBe('fileType');
    expect(documentIcon('a.pdf')).toBe('fileText');
    expect(documentIcon('a.png')).toBe('image');
    expect(documentLine(document, sizeLabel)).toBe('DPE · PDF · 1,2 Mo');
    expect(documentLine({ ...document, category: undefined, fileName: 'notes' }, sizeLabel)).toBe('1,2 Mo');
  });

  it('règles d’envoi : formats, taille, contenu qui correspond à l’extension', () => {
    expect(attachmentIssue('document', 'outil.exe', 100, sizeLabel)).toBe('Format non accepté (EXE). Envoyez une photo, une vidéo ou un document (PDF, Word, Excel…).');
    expect(attachmentIssue('photo', 'Photo.jpg', 0, sizeLabel)).toBe('Ce fichier est vide.');
    expect(attachmentIssue('photo', 'Photo.jpg', 30 * 1024 * 1024, sizeLabel)).toBe('Fichier trop volumineux : 26,2 Mo au maximum.');
    expect(attachmentIssue('video', 'Vidéo.mp4', 1000, sizeLabel)).toBeNull();
    const bytes = (text: string) => new TextEncoder().encode(text);
    expect(contentMatches('a.pdf', bytes('%PDF-1.4'))).toBe(true);
    expect(contentMatches('a.pdf', new Uint8Array([0x4d, 0x5a, 0, 0]))).toBe(false);
    expect(contentMatches('a.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(contentMatches('a.txt', bytes('Bonjour'))).toBe(true);
    expect(contentMatches('a.txt', new Uint8Array([0x42, 0x00]))).toBe(false);
    expect(contentMatches('a.docx', new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(storageContentType('photo', 'png')).toBe('image/jpeg');
    expect(storageContentType('video', 'mov')).toBe('video/quicktime');
    expect(storageContentType('document', 'pdf')).toBe('application/pdf');
    expect(storageContentType('document', 'zzz')).toBe('text/plain');
    expect(photoExtension(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('png');
    expect(photoExtension(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('jpg');
    expect(photoExtension(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68]))).toBe('heic');
  });
});

describe('Fichiers envoyés (MessageAttachmentFiles, LocalAttachmentStorage)', () => {
  it('photo réduite à 2 048 px et chemin « <conversation en minuscules>/<nom> »', () => {
    expect(reducedSize(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(reducedSize(1000, 800, 2048)).toEqual({ width: 1000, height: 800 });
    expect(storagePath('C1000000-0000-4000-8000-00000000000A', 'F00D.jpg')).toBe('c1000000-0000-4000-8000-00000000000a/F00D.jpg');
  });

  it('vidéo sans lieu ni appareil : « udta » et « meta » deviennent « free », le reste ne change pas', () => {
    const box = (type: string, payload: number[]) => {
      const size = 8 + payload.length;
      return [size >>> 24, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, ...[...type].map((c) => c.charCodeAt(0)), ...payload];
    };
    const text = (value: string) => [...value].map((c) => c.charCodeAt(0));
    const meta = box('meta', [1, 2, 3, 4]);
    const trak = box('trak', meta);
    const udta = box('udta', text('lieu+48'));
    const bytes = [...box('ftyp', text('isom')), ...box('moov', [...udta, ...trak]), ...box('mdat', text('udta'))];
    const input = new Uint8Array(bytes).buffer;
    const output = new Uint8Array(videoWithoutMetadata(input));
    const types = (data: Uint8Array) => {
      const found: string[] = [];
      for (let i = 0; i + 4 <= data.length; i += 1) {
        const word = String.fromCharCode(...data.slice(i, i + 4));
        if (['udta', 'meta', 'free', 'mdat', 'moov', 'trak'].includes(word)) found.push(word);
      }
      return found;
    };
    expect(types(new Uint8Array(input))).toEqual(['moov', 'udta', 'trak', 'meta', 'mdat', 'udta']);
    expect(types(output)).toEqual(['moov', 'free', 'trak', 'free', 'mdat', 'udta']);
    expect(output.length).toBe(bytes.length);
  });
});

describe('Lignes du serveur (SupabaseMessagingRepository)', () => {
  it('nouveau message : exactement les colonnes de l’app, identifiants en majuscules, aperçu de 300 caractères', () => {
    const content = textContent('x');
    const insert = messageInsert('c1000000-0000-4000-8000-000000000001', 'b2c3d4e5-0000-4000-8000-0000000000aa', content, 'é'.repeat(400));
    expect(Object.keys(insert).sort()).toEqual(['client_id', 'content', 'conversation_id', 'id', 'preview']);
    expect(insert.id).toBe('B2C3D4E5-0000-4000-8000-0000000000AA');
    expect(insert.client_id).toBe(insert.id);
    expect(insert.conversation_id).toBe('C1000000-0000-4000-8000-000000000001');
    expect([...insert.preview].length).toBe(300);
  });

  it('réglages : tous relus puis réécrits ; sourdine « toujours » au format de Swift', () => {
    const preferences = preferencesOf(row({ is_favorite: true, muted_until: '4001-01-01T00:00:00+00:00' }));
    expect(preferences).toEqual({ isArchived: false, isFavorite: true, mutedUntil: '4001-01-01T00:00:00.000Z', savesPhotos: false, clearedAt: null });
    expect(preferencesWrite('c1000000-0000-4000-8000-000000000001', { ...preferences, isArchived: true })).toEqual({
      conversation_id: 'C1000000-0000-4000-8000-000000000001', is_archived: true, is_favorite: true,
      muted_until: '4001-01-01T00:00:00.000Z', saves_photos: false, cleared_at: null,
    });
  });

  it('coches : vu quand tous les autres membres ont lu après le message', () => {
    const member = (user: string, read: string | null, left: string | null = null) => ({ conversation_id: 'c1', user_id: user, role: 'member', left_at: left, last_read_at: read });
    const read = otherReadAt([member(ME, null), member(AGENT, '2026-11-06T09:35:00Z')], ME);
    expect(read?.toISOString()).toBe('2026-11-06T09:35:00.000Z');
    expect(otherReadAt([member(AGENT, '2026-11-06T09:35:00Z'), member(CAMILLE, null)], ME)).toBeNull();
    expect(otherReadAt([member(AGENT, '2026-11-06T09:35:00Z'), member(CAMILLE, null, '2026-11-01T00:00:00Z')], ME)?.toISOString()).toBe('2026-11-06T09:35:00.000Z');
    const base = { id: 'm1', conversation_id: 'c1', sender_id: ME.toUpperCase(), kind: 'text', client_id: null, content: textContent('Ok'), expires_at: null };
    expect(messageFrom({ ...base, created_at: '2026-11-06T09:30:00Z', message_reactions: [] }, ME, read).isRead).toBe(true);
    expect(messageFrom({ ...base, created_at: '2026-11-06T09:38:00Z', message_reactions: null }, ME, read).isRead).toBe(false);
    const reactions = [
      { user_id: AGENT, emoji: '👍', created_at: '2026-11-06T10:00:00Z' },
      { user_id: ME, emoji: '♥', created_at: '2026-11-06T09:00:00Z' },
    ];
    expect(messageFrom({ ...base, created_at: '2026-11-06T09:30:00Z', message_reactions: reactions }, ME, null).reaction).toBe('♥');
    expect(messageFrom({ ...base, created_at: '2026-11-06T09:30:00Z', message_reactions: reactions.slice(0, 1) }, ME, null)).toMatchObject({ reaction: '👍', clientId: 'm1' });
  });

  it('compte trouvé par son numéro : le nom de l’agence, sinon le nom public, jamais le numéro', () => {
    expect(phoneAccount({ user_id: AGENT, public_name: 'Sophie D.', avatar_path: null, account_type: 'professional', agency_name: 'Agence Démo Lyon', agency_city: 'Lyon' }).counterpart)
      .toEqual({ name: 'Agence Démo Lyon', subtitle: 'Agence · Lyon', kind: 'agency', phone: null, imagePath: null });
    expect(phoneAccount({ user_id: CAMILLE, public_name: '  ', avatar_path: null, account_type: 'individual', agency_name: null, agency_city: null }).counterpart)
      .toEqual({ name: 'Membre Nidalo', subtitle: 'Particulier', kind: 'individual', phone: null, imagePath: null });
  });

  it('erreurs du serveur : seul le message en français (P0001) est montré', () => {
    expect(serverMessage({ code: 'P0001', message: ' Offre expirée. ' })).toBe('Offre expirée.');
    expect(serverMessage({ code: '42501', message: 'permission denied' })).toBeNull();
  });

  it('agenda : visites liées aux conversations, à venir et non annulées', () => {
    const visit = conversationVisit({
      id: 'v1', start_at: '2026-11-12T17:00:00Z', status: 'confirmed', listing_id: 'l1',
      visit: { conversationId: 'c1', listing: { title: 'Appartement 3 pièces', price: '238000', city: 'Lyon 2e', coverImageURL: 'http://exemple.fr/a.jpg' }, address: ' 12 rue de l\'Exemple ' },
    });
    expect(visit).toMatchObject({ conversationId: 'c1', status: 'confirmed', address: '12 rue de l\'Exemple', durationMinutes: null });
    expect(visit?.listing).toEqual({ listingId: 'l1', title: 'Appartement 3 pièces', price: 238000, transaction: 'sale', city: 'Lyon 2e', coverUrl: null });
    expect(conversationVisit({ id: 'v2', start_at: '2026-11-12T17:00:00Z', status: 'autre', listing_id: null, visit: null })).toBeNull();
    const at = (iso: string, status: 'confirmed' | 'cancelled' = 'confirmed') => conversationVisit({ id: iso, start_at: iso, status, listing_id: null, visit: null })!;
    const now = new Date('2026-11-06T12:00:00Z');
    expect(upcomingVisits([at('2026-11-09T10:00:00Z'), at('2026-11-06T11:30:00Z'), at('2026-11-06T10:00:00Z'), at('2026-11-07T10:00:00Z', 'cancelled')], now)
      .map((item) => item.id)).toEqual(['2026-11-06T11:30:00Z', '2026-11-09T10:00:00Z']);
  });
});

describe('Boîte de réception (conversation(from:), MessagesView)', () => {
  it('conversation d’annonce avec une agence : son nom, « titre · ville », son numéro publié', () => {
    const item = conversation();
    expect(item.counterpart).toEqual({ name: 'Agence Démo Lyon', subtitle: 'Appartement 3 pièces · Lyon 2e', kind: 'agency', phone: '06 39 98 12 00', imagePath: null });
    expect(item).toMatchObject({ isGroup: false, isSellerSide: false, otherUserId: AGENT, listing: { listingId: 'l1', price: 238000, transaction: 'sale' } });
    expect(conversation({ seller_id: ME.toUpperCase(), buyer_id: AGENT }).isSellerSide).toBe(true);
    expect(conversation({ other_user_id: null }).counterpart.name).toBe('Compte supprimé');
    expect(conversation({ other_user_id: 'a0000000-0000-4000-8000-0000000000ff', listing_snapshot: null }).counterpart).toMatchObject({ name: 'Particulier', subtitle: 'Particulier' });
  });

  it('groupe : nom, membres actifs avec « Vous », « 3 membres »', () => {
    const member = (user: string, role: string, left: string | null = null) => ({ conversation_id: 'g1', user_id: user, role, left_at: left, last_read_at: null });
    const group = conversation({ conversation_id: 'g1', kind: 'group', group_name: 'Visite groupée', member_count: 3, other_user_id: null, listing_snapshot: null },
      [member(ME, 'owner'), member(CAMILLE, 'member'), member(AGENT, 'admin'), member('a0000000-0000-4000-8000-0000000000ff', 'member', '2026-11-02T00:00:00Z')]);
    expect(group.counterpart).toMatchObject({ name: 'Visite groupée', subtitle: '3 membres', kind: 'group' });
    expect(group.members.map((item) => `${item.name}:${item.kind}:${item.role}`)).toEqual(['Vous:individual:owner', 'Camille R.:individual:member', 'Agence Démo Lyon:agency:admin']);
    expect(groupSummary(group.members)).toBe('Vous, Camille R., Agence Démo Lyon');
    expect(groupSummary([...group.members, ...group.members, ...group.members])).toBe('9 membres');
    expect(canOpenDetails(group)).toBe(false);
  });

  it('filtres : Tous, Non lus, Favoris, Visites, Archivés', () => {
    const unread = conversation({ unread_count: 2 });
    const archived = conversation({ unread_count: 4, is_archived: true });
    const favorite = conversation({ is_favorite: true });
    expect([unread, archived, favorite].map((item) => filterIncludes('all', item, false))).toEqual([true, false, true]);
    expect([unread, archived, favorite].map((item) => filterIncludes('unread', item, false))).toEqual([true, false, false]);
    expect([unread, archived, favorite].map((item) => filterIncludes('favorites', item, false))).toEqual([false, false, true]);
    expect([unread, archived, favorite].map((item) => filterIncludes('visits', item, true))).toEqual([true, false, true]);
    expect([unread, archived, favorite].map((item) => filterIncludes('archived', item, false))).toEqual([false, true, false]);
    expect(unreadConversationCount([unread, archived, favorite])).toBe(1);
  });

  it('aperçu : « Vous : » et coches pour mes messages, « Nouvelle conversation » sans message', () => {
    const at = '2026-11-06T09:45:00Z';
    const mine = conversation({ last_message_id: 'm1', last_message_sender_id: ME.toUpperCase(), last_message_content: textContent('Okok'), last_message_at: at, other_last_read_at: '2026-11-06T09:50:00Z' });
    expect(rowPreview(mine, ME)).toEqual({ text: 'Vous : Okok', mine: true, read: true, muted: false });
    const system = conversation({ last_message_id: 'm2', last_message_sender_id: ME, last_message_content: { system: { _0: 'Claire M. a créé le groupe' } }, last_message_at: at });
    expect(rowPreview(system, ME).text).toBe('Claire M. a créé le groupe');
    expect(rowPreview(conversation(), ME).text).toBe('Nouvelle conversation');
  });

  it('recherche et contacts (MessagingDirectory)', () => {
    const lyon = conversation({ last_message_preview: 'Bonjour Claire' });
    expect(matchesInboxQuery(lyon, 'agence lyon')).toBe(true);
    expect(matchesInboxQuery(lyon, 'appart')).toBe(true);
    expect(matchesInboxQuery(lyon, 'bordeaux')).toBe(false);
    const second = conversation({ conversation_id: 'c2', created_at: '2026-11-04T09:00:00Z' });
    const contacts = contactsFrom([lyon, second], [
      { user_id: 'p1', agency_id: 'ag1', agency_name: 'Immo Démo Croix-Rousse', agency_city: 'Lyon' },
      { user_id: AGENT, agency_id: 'ag0', agency_name: 'Agence Démo Lyon', agency_city: 'Lyon' },
    ]);
    expect(contacts.map((item) => `${item.counterpart.name}:${item.conversations.length}`)).toEqual(['Agence Démo Lyon:2', 'Immo Démo Croix-Rousse:0']);
    expect(contacts[0].professional?.agency_id).toBe('ag0');
    expect(contactMatches(contacts[0], 'agen')).toBe(true);
    expect(contactMatches(contacts[0], '06 39 98 12 00')).toBe(true);
    expect(contactMatches(contacts[1], 'lyon')).toBe(true);
    expect(contactMatches(contacts[1], 'ly')).toBe(false);
    expect(sectionLetter(contacts[0])).toBe('A');
    expect(counterpartInitials('Agence Démo Lyon')).toBe('AD');
    expect(counterpartInitials('julien m.')).toBe('JM');
  });
});

describe('Conversation ouverte (ConversationView, ConversationDetails)', () => {
  const direct = conversation();

  it('messages visibles : sans les expirés ni ceux d’avant l’effacement ; les lignes système restent', () => {
    const old = message({ id: 'old', createdAt: new Date(2026, 10, 1) });
    const expired = message({ id: 'exp', expiresAt: new Date(2026, 10, 6, 11, 0) });
    const system = message({ id: 'sys', createdAt: new Date(2026, 10, 1), content: { kind: 'system', text: 'Groupe créé' } });
    const fresh = message({ id: 'new' });
    expect(visibleMessages([old, expired, system, fresh], new Date(2026, 10, 2), NOW).map((item) => item.id)).toEqual(['sys', 'new']);
  });

  it('jours et séries de bulles du même expéditeur', () => {
    const days = threadDays([
      message({ id: 'a', createdAt: new Date(2026, 10, 5, 18, 2) }),
      message({ id: 'b', createdAt: new Date(2026, 10, 6, 9, 58) }),
      message({ id: 'c', createdAt: new Date(2026, 10, 6, 10, 0) }),
      message({ id: 'd', senderId: ME, createdAt: new Date(2026, 10, 6, 10, 5) }),
    ], NOW);
    expect(days.map((day) => day.label)).toEqual(['Hier · 18:02', 'Aujourd\'hui · 09:58']);
    expect(days[1].rows.map((item) => `${item.message.id}${item.startsGroup ? '<' : ''}${item.endsGroup ? '>' : ''}`)).toEqual(['b<', 'c>', 'd<>']);
  });

  it('réponses rapides, bandeau, prénom demandé, « Détails »', () => {
    expect(showsQuickReplies(direct, [message()], ME)).toBe(true);
    expect(showsQuickReplies(direct, [message({ senderId: ME.toUpperCase() })], ME)).toBe(false);
    expect(showsQuickReplies(direct, [], ME)).toBe(false);
    expect(bannerLocation({ city: 'Lyon 2e' }, '12 rue de l\'Exemple, 69002 Lyon')).toBe('Lyon 2e · Rue de l\'Exemple');
    expect(bannerLocation({ city: 'Lyon 2e' }, null)).toBe('Lyon 2e');
    expect(needsFirstName({ conversation: direct, messages: [], firstName: ' ' })).toBe(true);
    expect(needsFirstName({ conversation: direct, messages: [message()], firstName: '' })).toBe(false);
    expect(needsFirstName({ conversation: direct, messages: [], firstName: 'Claire' })).toBe(false);
    expect(canOpenDetails(direct)).toBe(true);
    expect(canOpenDetails(conversation({ other_user_id: null }))).toBe(false);
  });

  it('médias et fichiers partagés, du plus récent au plus ancien', () => {
    const photo: Attachment = { id: 'P1', kind: 'photo', fileName: 'Photo.jpg', storagePath: 'c1/p.jpg', byteCount: 10 };
    const pdf: Attachment = { id: 'D1', kind: 'document', fileName: 'Bail.pdf', storagePath: 'c1/b.pdf', byteCount: 10 };
    const shared = sharedItems([
      message({ id: 'm1', createdAt: new Date(2026, 10, 5), content: { kind: 'attachments', items: [photo, pdf], caption: null } }),
      message({ id: 'm2', createdAt: new Date(2026, 10, 6), content: { kind: 'text', text: 'Le plan : https://www.exemple.fr/plan.pdf, et voilà.' } }),
    ]);
    expect(shared.media.map((item) => item.id)).toEqual(['m1-P1']);
    expect(shared.documents.map((item) => item.attachment?.fileName)).toEqual(['Bail.pdf']);
    expect(shared.links.map((item) => item.url)).toEqual(['https://www.exemple.fr/plan.pdf']);
    expect(linkTitle('https://www.exemple.fr/plan.pdf')).toBe('www.exemple.fr');
    expect(mediaPreview(5)).toEqual({ shown: 3, more: 2 });
    expect(mediaPreview(2)).toEqual({ shown: 2, more: 0 });
  });

  it('boutons de « Détails » : appel, visite, visio ; sourdine', () => {
    expect(callState('Julien M.', null)).toEqual({ enabled: false, message: 'Julien M. n\'a pas partagé son numéro. Vous pouvez lui écrire ici.' });
    expect(callState('Agence Démo Lyon', '06 39 98 12 00')).toEqual({ enabled: true });
    expect(visitState('own')).toEqual({ enabled: false, message: 'C\'est votre annonce : vous ne pouvez pas y demander de visite.' });
    expect(visitState('available')).toEqual({ enabled: true });
    expect(videoState('available')).toEqual({ enabled: false, message: 'Cette annonce n\'accepte pas les visites en visio.' });
    expect(videoState('availableWithVideo')).toEqual({ enabled: true });
    expect(mutedUntil('eightHours', NOW)?.getTime()).toBe(NOW.getTime() + 8 * 3_600_000);
    expect(mutedUntil('always', NOW)).toBe(DISTANT_FUTURE);
    expect(mutedUntil('off', NOW)).toBeNull();
    expect(muteNotice('off')).toBe('Notifications activées');
    expect(muteNotice('oneWeek')).toBe('Sourdine 1 semaine');
  });
});

describe('Offres dans la conversation (OfferCard, OfferStore)', () => {
  const offer = (overrides: Partial<OfferRow> = {}): OfferRow => ({
    id: 'f1', conversation_id: 'c1', listing_id: 'l1', amount: 228000, status: 'pending', created_at: '2026-11-05T10:00:00Z',
    expires_at: '2026-11-12T10:00:00Z', allowed_actions: ['accept', 'counter', 'decline', 'inconnue'], ...overrides,
  });
  const now = new Date('2026-11-06T10:00:00Z');

  it('boutons : les actions permises par le serveur, tant que l’offre est en attente et valable', () => {
    expect([...allowedActions(offer(), now)]).toEqual(['accept', 'counter', 'decline']);
    expect(allowedActions(offer({ expires_at: '2026-11-06T09:00:00Z' }), now).size).toBe(0);
    expect(allowedActions(offer({ status: 'accepted' }), now).size).toBe(0);
    expect(allowedActions(offer({ allowed_actions: null }), now).size).toBe(0);
  });

  it('libellés de l’état ; une contre-offre faite à mon offre est « reçue »', () => {
    expect(offerStatusLabel('pending', false)).toBe('En attente');
    expect(offerStatusLabel('rejected', false)).toBe('Refusée');
    expect(offerStatusLabel('countered', true)).toBe('Contre-offre reçue');
    expect(offerStatusLabel('countered', false)).toBe('Contre-offre envoyée');
  });

  it('arguments de counter_offer : identifiants en majuscules, champs vides omis, rien pour 7 jours', () => {
    expect(counterOfferParams({ id: 'ab12', parentId: 'cd34', amount: 232000, conditions: ' ', validityDays: 7, now }))
      .toEqual({ p_id: 'AB12', p_parent_offer_id: 'CD34', p_amount: 232000 });
    expect(counterOfferParams({ id: 'ab12', parentId: 'cd34', amount: 232000, conditions: ' Signature avant fin janvier ', validityDays: 3, now }))
      .toEqual({ p_id: 'AB12', p_parent_offer_id: 'CD34', p_amount: 232000, p_conditions: 'Signature avant fin janvier', p_expires_at: '2026-11-09T10:00:00Z' });
  });
});

describe('Adresse de la page Messages (?c=…&vue=…&onglet=…)', () => {
  const id = 'C1000000-0000-4000-8000-000000000001';

  it('lit la conversation et l’écran ; rien sans ?c= valable', () => {
    expect(readRoute(`?c=${id}&vue=details`)).toEqual({ conversationId: id, view: 'details', tab: 'photos' });
    expect(readRoute(`?c=${id}&vue=medias&onglet=documents`)).toEqual({ conversationId: id, view: 'medias', tab: 'documents' });
    expect(readRoute(`?c=${id}&vue=medias&onglet=autre`).tab).toBe('photos');
    expect(readRoute('?vue=details')).toEqual({ conversationId: null, view: 'thread', tab: 'photos' });
    expect(readRoute('?c=pas-un-identifiant').conversationId).toBeNull();
  });

  it('écrit l’adresse de chaque écran', () => {
    expect(routePath({})).toBe('/messages/');
    expect(routePath({ conversationId: id })).toBe(`/messages/?c=${id}`);
    expect(routePath({ conversationId: id, view: 'details' })).toBe(`/messages/?c=${id}&vue=details`);
    expect(routePath({ conversationId: id, view: 'medias', tab: 'liens' })).toBe(`/messages/?c=${id}&vue=medias&onglet=liens`);
    expect(routePath({ conversationId: id, view: 'medias', tab: 'photos' })).toBe(`/messages/?c=${id}&vue=medias`);
  });
});
