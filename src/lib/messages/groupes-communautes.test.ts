import { beforeEach, describe, expect, it, vi } from 'vitest';

// Groupes et communautés : mêmes paramètres, règles et textes que l'app (SupabaseMessagingRepository.swift,
// CommunityServer.swift, GroupConversation.swift, ConversationSettings.swift, GroupInfoView.swift). Le client Supabase
// est simulé : chaque appel est noté, chaque réponse est donnée par le test (données inventées).

type Call = { name: string; params: unknown };

const server = vi.hoisted(() => ({
  calls: [] as { name: string; params: unknown }[],
  rpc: {} as Record<string, unknown>,
  uploads: [] as { bucket: string; path: string; type: string }[],
  uploadError: null as unknown,
}));

vi.mock('../supabase', () => {
  const from = (table: string) => {
    const call = { name: `from/${table}`, params: [] as unknown[] };
    server.calls.push(call);
    const proxy: object = new Proxy({}, {
      get(_target, key) {
        if (key === 'then') return (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve);
        return (...args: unknown[]) => {
          call.params.push([String(key), ...args]);
          return proxy;
        };
      },
    });
    return proxy;
  };
  const rpc = (name: string, params?: unknown) => {
    server.calls.push({ name, params });
    const answer = server.rpc[name];
    return Promise.resolve(typeof answer === 'function' ? answer(params) : answer ?? { data: [], error: null });
  };
  const storage = {
    from: (bucket: string) => ({
      upload: (path: string, body: Blob) => {
        server.uploads.push({ bucket, path, type: body.type });
        return Promise.resolve({ error: server.uploadError });
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://images.example.test/${bucket}/${path}` } }),
    }),
  };
  return { supabase: { from, rpc, storage } };
});

import {
  communityInvites, communityIssues, communityMemberActions, createCommunity, createCommunityInvite, createCommunityParams, inviteLink,
  inviteMessage, inviteShareText, joinRequests, mainConversationId, newCommunityDraft, updateCommunityInfo, updateCommunityInfoParams,
  validityLabel, type CommunityDraft,
} from './communities';
import {
  collapsedMembers, createGroup, createGroupParams, creationLabel, creatorName, ephemeralOf, EPHEMERAL_DURATIONS, exportedMessages,
  exportFileName, exportText, groupMemberActions, groupStepIssues, hideConversation, memberMatches, moreMembersLabel, newGroupDraft,
  purposeLabel, roleIn, setEphemeralParams, submissionMessage, suggestedContacts, updateGroupInfo, updateGroupInfoParams, type GroupDraft,
} from './groups';
import type { Message } from './api';
import type { MessageContent } from './content';
import type { Contact, Conversation, Member } from './inbox';

const ME = 'a0000000-0000-4000-8000-0000000000c1';
const CLAIRE = 'a0000000-0000-4000-8000-0000000000e1';
const KARIM = 'a0000000-0000-4000-8000-0000000000e2';
const LEA = 'a0000000-0000-4000-8000-0000000000e3';
const AGENCY = 'a0000000-0000-4000-8000-0000000000e4';
const GROUP = 'c2000000-0000-4000-8000-000000000001';
const COMMUNITY = 'c3000000-0000-4000-8000-000000000001';

const member = (userId: string, name: string, role = 'member'): Member => ({ userId, name, kind: 'individual', role });
const callsTo = (name: string): Call[] => server.calls.filter((call) => call.name === name);

beforeEach(() => {
  server.calls = [];
  server.rpc = {};
  server.uploads = [];
  server.uploadError = null;
});

describe('Nouveau groupe (create_group, update_group_info)', () => {
  const draft = (patch: Partial<GroupDraft> = {}): GroupDraft => ({
    id: GROUP, name: '  Visite groupée Lyon 2e ', details: '', purpose: null, photo: null,
    participants: [member(CLAIRE, 'Claire Martin'), member(KARIM, 'Karim B.')], ...patch,
  });

  it('envoie le nom sans espaces autour et les identifiants en majuscules ; description et type seulement s\'ils sont renseignés', () => {
    expect(createGroupParams(draft())).toEqual({ p_id: GROUP.toUpperCase(), p_name: 'Visite groupée Lyon 2e', p_member_ids: [CLAIRE.toUpperCase(), KARIM.toUpperCase()] });
    expect(createGroupParams(draft({ details: ' Projet commun \n', purpose: 'project' }))).toEqual({
      p_id: GROUP.toUpperCase(), p_name: 'Visite groupée Lyon 2e', p_member_ids: [CLAIRE.toUpperCase(), KARIM.toUpperCase()],
      p_details: 'Projet commun', p_purpose: 'project',
    });
  });

  it('update_group_info : description et photo absentes ne partent pas', () => {
    expect(updateGroupInfoParams(GROUP, 'Lyon', null, null)).toEqual({ p_conversation_id: GROUP.toUpperCase(), p_name: 'Lyon' });
    expect(updateGroupInfoParams(GROUP, 'Lyon', '', 'c2/group/x.jpg')).toEqual({ p_conversation_id: GROUP.toUpperCase(), p_name: 'Lyon', p_details: '', p_image_path: 'c2/group/x.jpg' });
  });

  it('une photo part dans « <groupe>/group/<UUID>.jpg » (message-attachments), puis update_group_info', async () => {
    await createGroup(draft({ photo: new Blob(['jpeg'], { type: 'image/jpeg' }) }));
    expect(server.calls.map((call) => call.name)).toEqual(['create_group', 'update_group_info']);
    expect(server.uploads).toHaveLength(1);
    expect(server.uploads[0].bucket).toBe('message-attachments');
    expect(server.uploads[0].type).toBe('image/jpeg');
    expect(server.uploads[0].path).toMatch(new RegExp(`^${GROUP}/group/[0-9a-f-]{36}\\.jpg$`));
    expect(callsTo('update_group_info')[0].params).toEqual({ p_conversation_id: GROUP.toUpperCase(), p_name: 'Visite groupée Lyon 2e', p_image_path: server.uploads[0].path });
  });

  it('sans photo enregistrée, le groupe est quand même créé ; un refus de create_group est rendu', async () => {
    server.uploadError = { statusCode: '500', message: 'boom' };
    await expect(createGroup(draft({ photo: new Blob(['jpeg'], { type: 'image/jpeg' }) }))).resolves.toBeUndefined();
    expect(callsTo('update_group_info')).toHaveLength(0);
    server.rpc.create_group = { data: null, error: { code: 'P0001', message: 'Un groupe compte 50 membres au plus.' } };
    await expect(createGroup(draft())).rejects.toMatchObject({ code: 'P0001' });
  });

  it('« Modifier le groupe » : photo gardée (même chemin), nouvelle (envoyée d\'abord) ou retirée (clé absente)', async () => {
    await updateGroupInfo(GROUP, 'Lyon', 'Texte', { kind: 'saved', path: 'old/group/a.jpg' });
    await updateGroupInfo(GROUP, 'Lyon', 'Texte', null);
    await updateGroupInfo(GROUP, 'Lyon', 'Texte', { kind: 'new', blob: new Blob(['jpeg'], { type: 'image/jpeg' }) });
    const params = callsTo('update_group_info').map((call) => call.params as Record<string, unknown>);
    expect(params[0].p_image_path).toBe('old/group/a.jpg');
    expect('p_image_path' in params[1]).toBe(false);
    expect(params[2].p_image_path).toBe(server.uploads[0].path);
  });

  it('étapes : d\'abord au moins deux participants, puis un nom de 50 caractères au plus', () => {
    const empty = newGroupDraft();
    expect(empty.id).toMatch(/^[0-9A-F-]{36}$/);
    expect(groupStepIssues({ name: '', participants: [member(CLAIRE, 'Claire Martin')] }, 0)).toEqual(['notEnoughParticipants']);
    expect(groupStepIssues({ name: '', participants: [] }, 1)).toEqual(['missingName']);
    expect(groupStepIssues({ name: 'a'.repeat(51), participants: [] }, 1)).toEqual(['nameTooLong']);
    expect(groupStepIssues({ name: '🏠'.repeat(50), participants: [] }, 1)).toEqual([]);
  });

  it('type de groupe lu du serveur ; inconnu : aucun', () => {
    expect(purposeLabel('privateSale')).toBe('Achat entre particuliers');
    expect(purposeLabel('autre-chose')).toBeNull();
  });
});

describe('Infos du groupe', () => {
  const members = [
    member(KARIM, 'Karim B.', 'admin'), member(ME, 'Vous'), member(LEA, 'Léa'), member('a0000000-0000-4000-8000-0000000000e5', 'Hugo'),
    member('a0000000-0000-4000-8000-0000000000e6', 'Inès'), member(CLAIRE, 'Claire Martin', 'owner'),
  ];

  it('liste repliée : quatre membres, le créateur toujours visible ; « Voir les 2 autres membres »', () => {
    expect(collapsedMembers(members, CLAIRE).map((item) => item.name)).toEqual(['Karim B.', 'Vous', 'Léa', 'Claire Martin']);
    expect(moreMembersLabel(members, CLAIRE)).toBe('Voir les 2 autres membres');
    expect(moreMembersLabel(members.slice(1), CLAIRE)).toBe('Voir l\'autre membre');
    expect(moreMembersLabel(members.slice(2), CLAIRE)).toBeNull();
  });

  it('droits : le créateur nomme et retire, un administrateur retire les simples membres', () => {
    const owner = member(CLAIRE, 'Claire Martin', 'owner');
    const admin = member(KARIM, 'Karim B.', 'admin');
    const simple = member(LEA, 'Léa');
    expect(groupMemberActions('owner', admin)).toEqual({ canPromote: true, canRemove: true });
    expect(groupMemberActions('owner', owner)).toEqual({ canPromote: false, canRemove: false });
    expect(groupMemberActions('admin', simple)).toEqual({ canPromote: false, canRemove: true });
    expect(groupMemberActions('admin', admin)).toEqual({ canPromote: false, canRemove: false });
    expect(groupMemberActions('member', simple)).toEqual({ canPromote: false, canRemove: false });
    expect(roleIn(members, ME.toUpperCase())).toBe('member');
    expect(roleIn(members, 'a0000000-0000-4000-8000-0000000000ff')).toBeNull();
  });

  it('« Créé par vous · aujourd\'hui », « hier », « le 29 octobre », l\'année si ce n\'est pas l\'année en cours', () => {
    const now = new Date(2026, 10, 6, 12, 0);
    expect(creationLabel(new Date(2026, 10, 6, 8, 0), now)).toBe('aujourd\'hui');
    expect(creationLabel(new Date(2026, 10, 5, 23, 0), now)).toBe('hier');
    expect(creationLabel(new Date(2026, 9, 29, 9, 0), now)).toBe('le 29 octobre');
    expect(creationLabel(new Date(2025, 9, 29, 9, 0), now)).toBe('le 29 octobre 2025');
    expect(creatorName(ME, members, ME)).toBe('vous');
    expect(creatorName(CLAIRE, members, ME)).toBe('Claire Martin');
    expect(creatorName(null, members, ME)).toBe('un membre');
  });

  it('recherche dans les membres : chaque mot, sans accents ni majuscules', () => {
    expect(memberMatches('Claire Martin', '')).toBe(true);
    expect(memberMatches('Léa Dupont', 'lea')).toBe(true);
    expect(memberMatches('Claire Martin', 'mart cl')).toBe(true);
    expect(memberMatches('Claire Martin', 'karim')).toBe(false);
  });

  it('messages éphémères : la durée exacte, sinon « Désactivés » ; set_ephemeral reçoit les secondes en texte', () => {
    expect(ephemeralOf(86_400).label).toBe('24 heures');
    expect(ephemeralOf(null).label).toBe('Désactivés');
    expect(ephemeralOf(3_600).label).toBe('Désactivés');
    expect(setEphemeralParams(GROUP, EPHEMERAL_DURATIONS[0])).toEqual({ p_conversation_id: GROUP.toUpperCase(), p_seconds: '0' });
    expect(setEphemeralParams(GROUP, EPHEMERAL_DURATIONS[1])).toEqual({ p_conversation_id: GROUP.toUpperCase(), p_seconds: '86400' });
    expect(setEphemeralParams(GROUP, EPHEMERAL_DURATIONS[3]).p_seconds).toBe('7776000');
  });

  it('« Supprimer le groupe » une fois quitté : tous les réglages relus, réenregistrés avec hidden_at', async () => {
    server.rpc.my_conversations = { data: [{ conversation_id: GROUP.toUpperCase(), is_archived: false, is_favorite: true, muted_until: null, saves_photos: false, cleared_at: null }], error: null };
    await hideConversation(GROUP);
    expect(callsTo('my_conversations')[0].params).toEqual({ p_conversation_id: GROUP.toUpperCase() });
    const [[method, write, options]] = callsTo('from/conversation_preferences')[0].params as [string, Record<string, unknown>, unknown][];
    expect(method).toBe('upsert');
    expect(options).toEqual({ onConflict: 'conversation_id,user_id' });
    expect(write).toMatchObject({ conversation_id: GROUP.toUpperCase(), is_archived: false, is_favorite: true, muted_until: null, cleared_at: null });
    expect(typeof write.hidden_at).toBe('string');
    expect(Number.isNaN(Date.parse(String(write.hidden_at)))).toBe(false);
  });
});

describe('Exporter la discussion', () => {
  const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute);
  const message = (id: string, senderId: string | null, content: MessageContent, createdAt: Date): Message => ({
    id, conversationId: GROUP, senderId, clientId: id, content, createdAt, expiresAt: null, reaction: null, reactions: [], isRead: false,
    replyToId: null, isForwarded: false, raw: null,
  });
  const messages = [
    message('m1', ME, { kind: 'text', text: 'Bonjour à tous' }, at(29, 21, 33)),
    message('m2', CLAIRE, { kind: 'attachments', items: [{ id: 'f1', kind: 'document', fileName: 'Plan.pdf', byteCount: 10 }, { id: 'f2', kind: 'photo', fileName: 'Salon.jpg', byteCount: 10 }], caption: 'Voici le plan' }, at(30, 8, 5)),
    message('m3', CLAIRE, { kind: 'attachments', items: [{ id: 'f3', kind: 'document', fileName: 'Bail.pdf', byteCount: 10 }], caption: null }, at(30, 8, 6)),
    message('m4', null, { kind: 'system', text: 'Karim B. a rejoint le groupe' }, at(31, 9, 0)),
  ];

  it('une ligne par message, « 29/10/2026 21:33 · Vous : Bonjour » ; pièces jointes par leur nom', () => {
    const name = (id: string | null) => (id === ME ? 'Vous' : 'Claire Martin');
    expect(exportText('Visite groupée', messages, name)).toBe([
      'Discussion « Visite groupée » exportée depuis Nidalo',
      '',
      '29/10/2026 21:33 · Vous : Bonjour à tous',
      '30/10/2026 08:05 · Claire Martin : [Plan.pdf] [Salon.jpg] Voici le plan',
      '30/10/2026 08:06 · Claire Martin : [Bail.pdf]',
      '31/10/2026 09:00 · Karim B. a rejoint le groupe',
    ].join('\n'));
  });

  it('période : les 7 derniers jours ; ce qui a été effacé n\'est pas exporté (sauf les messages du groupe)', () => {
    const now = new Date(2026, 10, 5, 12, 0);
    expect(exportedMessages(messages, null, 'lastWeek', now).map((item) => item.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(exportedMessages(messages, null, 'lastWeek', new Date(2026, 10, 7, 9, 0)).map((item) => item.id)).toEqual(['m4']);
    expect(exportedMessages(messages, at(30, 8, 5), 'all', now).map((item) => item.id)).toEqual(['m3', 'm4']);
  });

  it('nom du fichier : lettres et chiffres du titre reliés par des tirets, sinon « NIDALO »', () => {
    expect(exportFileName('Visite groupée · Lyon 2e')).toBe('Discussion-Visite-groupée-Lyon-2e.txt');
    expect(exportFileName(' « » ')).toBe('Discussion-NIDALO.txt');
  });
});

describe('Suggestions et échecs', () => {
  const conversation = (otherUserId: string, lastMessageAt: Date): Conversation => ({
    id: `conv-${otherUserId}`, isGroup: false, communityId: null, listing: null,
    counterpart: { name: '', subtitle: '', kind: 'individual', phone: null, imagePath: null }, otherUserId, members: [],
    createdAt: lastMessageAt, lastMessageAt, lastMessagePreview: null, lastMessage: null, unreadCount: 0, isArchived: false, isFavorite: false,
    mutedUntil: null, savesPhotos: false, clearedAt: null, hasLeft: false, isSellerSide: false, buyerId: null, sellerId: null,
    otherLastReadAt: null, group: null, community: null,
  });
  const contact = (name: string, userId: string, lastMessageAt: Date | null): Contact => ({
    id: name, counterpart: { name, subtitle: 'Particulier', kind: 'individual', phone: null, imagePath: null },
    conversations: lastMessageAt ? [conversation(userId, lastMessageAt)] : [],
    professional: lastMessageAt ? null : { user_id: userId, agency_id: `agency-${userId}`, agency_name: name },
  });

  it('d\'abord les contacts avec qui l\'on a échangé, du plus récent au plus ancien, puis ceux des groupes ; cinq au plus', () => {
    const contacts = [
      contact('Claire Martin', CLAIRE, new Date(2026, 10, 1)), contact('Karim B.', KARIM, new Date(2026, 10, 4)),
      contact('Zoé Agence', AGENCY, null), contact('Agence du Parc', 'a0000000-0000-4000-8000-0000000000e7', null),
      contact('Agence Lumière', 'a0000000-0000-4000-8000-0000000000e8', null),
    ];
    const inGroups = new Set([AGENCY, 'a0000000-0000-4000-8000-0000000000e7']);
    expect(suggestedContacts(contacts, inGroups).map((item) => item.counterpart.name)).toEqual(['Karim B.', 'Claire Martin', 'Agence du Parc', 'Zoé Agence']);
    expect(suggestedContacts(contacts, inGroups, 1).map((item) => item.counterpart.name)).toEqual(['Karim B.']);
  });

  it('message d\'échec : le refus du serveur tel quel, la connexion, les droits, les informations refusées, sinon « n\'a pas abouti »', () => {
    expect(submissionMessage({ code: 'P0001', message: ' Un groupe compte 50 membres au plus. ' })).toBe('Un groupe compte 50 membres au plus.');
    expect(submissionMessage(new TypeError('Failed to fetch'))).toBe('La modification n\'a pas abouti : vérifiez votre connexion, puis réessayez.');
    expect(submissionMessage(new TypeError('Failed to fetch'), true)).toBe('La création n\'a pas abouti : vérifiez votre connexion, puis réessayez. Vos informations sont conservées.');
    expect(submissionMessage({ code: '42501', message: 'permission denied' })).toBe('Vous n\'avez pas le droit de faire cette modification.');
    expect(submissionMessage({ code: '23514', message: 'check' })).toBe('Certaines informations n\'ont pas été acceptées. Vérifiez-les, puis réessayez.');
    expect(submissionMessage({ code: 'XX000' })).toBe('La modification n\'a pas abouti. Réessayez.');
    expect(submissionMessage(null, true)).toBe('La création n\'a pas abouti. Réessayez : vos informations sont conservées.');
  });
});

describe('Communautés', () => {
  const draft = (patch: Partial<CommunityDraft> = {}): CommunityDraft => ({
    ...newCommunityDraft(), id: COMMUNITY, name: ' Voisins du 2e ', details: ' Entraide entre voisins. ', area: '  ', cover: 'sky',
    members: [member(CLAIRE, 'Claire Martin')], ...patch,
  });

  it('discussion principale : l\'identifiant de la communauté, dernier octet inversé avec 0x5A', () => {
    expect(mainConversationId(COMMUNITY)).toBe('C3000000-0000-4000-8000-00000000005B');
    expect(mainConversationId('c3000000-0000-4000-8000-0000000000ff')).toBe('C3000000-0000-4000-8000-0000000000A5');
    expect(mainConversationId(mainConversationId(COMMUNITY))).toBe(COMMUNITY.toUpperCase());
  });

  it('nouvelle saisie : catégorie « générale » déjà choisie ; nom, présentation et catégorie obligatoires', () => {
    expect(newCommunityDraft().category).toBe('general');
    expect(communityIssues({ name: ' ', details: '', category: null })).toEqual(['missingName', 'missingDetails', 'missingCategory']);
    expect(communityIssues({ name: 'a'.repeat(51), details: 'x', category: 'rental' })).toEqual(['nameTooLong']);
  });

  it('create_community : textes sans espaces autour, zone seulement si renseignée, couverture seulement sans photo', () => {
    const params = createCommunityParams(draft());
    expect(params).toEqual({
      p_id: COMMUNITY.toUpperCase(), p_conversation_id: 'C3000000-0000-4000-8000-00000000005B', p_name: 'Voisins du 2e', p_details: 'Entraide entre voisins.',
      p_category: 'general', p_cover: 'sky', p_member_ids: [CLAIRE.toUpperCase()],
    });
    const withPhoto = createCommunityParams(draft({ area: ' Lyon 2e ', photo: new Blob(['jpeg']) }));
    expect(withPhoto.p_area).toBe('Lyon 2e');
    expect('p_cover' in withPhoto).toBe(false);
    expect(createCommunityParams(draft({ members: [] })).p_member_ids).toEqual([]);
  });

  it('une photo part dans « <discussion principale>/group/ », puis update_group_info (nom et photo) ; la discussion s\'ouvre', async () => {
    server.rpc.create_community = { data: [{ id: COMMUNITY.toUpperCase(), image_path: null }], error: null };
    const opened = await createCommunity(draft({ photo: new Blob(['jpeg'], { type: 'image/jpeg' }) }));
    expect(opened).toBe('C3000000-0000-4000-8000-00000000005B');
    expect(server.uploads[0].path).toMatch(/^c3000000-0000-4000-8000-00000000005b\/group\/[0-9a-f-]{36}\.jpg$/);
    expect(callsTo('update_group_info')[0].params).toEqual({ p_conversation_id: opened, p_name: 'Voisins du 2e', p_image_path: server.uploads[0].path });
  });

  it('une communauté introuvable après la création est un échec', async () => {
    server.rpc.create_community = { data: [], error: null };
    await expect(createCommunity(draft())).rejects.toMatchObject({ code: 'notFound' });
  });

  it('update_community_info : la photo part toujours, `null` la retire', async () => {
    expect(updateCommunityInfoParams(COMMUNITY, ' Voisins ', null)).toEqual({ p_community_id: COMMUNITY.toUpperCase(), p_name: 'Voisins', p_image_path: null });
    server.rpc.update_community_info = { data: [{ id: COMMUNITY }], error: null };
    await updateCommunityInfo({ id: COMMUNITY, mainConversationId: mainConversationId(COMMUNITY) }, 'Voisins', { kind: 'new', blob: new Blob(['jpeg'], { type: 'image/jpeg' }) });
    expect(server.uploads[0].path.startsWith('c3000000-0000-4000-8000-00000000005b/group/')).toBe(true);
    expect(callsTo('update_community_info')[0].params).toEqual({ p_community_id: COMMUNITY.toUpperCase(), p_name: 'Voisins', p_image_path: server.uploads[0].path });
  });

  it('droits : jamais soi-même ni le créateur ; un administrateur retire les simples membres', () => {
    expect(communityMemberActions('owner', member(ME, 'Vous', 'owner'), ME)).toEqual({ canPromote: false, canRemove: false });
    expect(communityMemberActions('owner', member(KARIM, 'Karim B.', 'admin'), ME)).toEqual({ canPromote: true, canRemove: true });
    expect(communityMemberActions('admin', member(LEA, 'Léa'), ME)).toEqual({ canPromote: false, canRemove: true });
    expect(communityMemberActions('admin', member(KARIM, 'Karim B.', 'admin'), ME)).toEqual({ canPromote: false, canRemove: false });
    expect(communityMemberActions('member', member(LEA, 'Léa'), ME)).toEqual({ canPromote: false, canRemove: false });
  });

  it('invitation : lien de 7 jours avec accord, « nidalo://invite/<jeton> », valable jusqu\'au jour de Paris', async () => {
    server.rpc.create_community_invite = { data: [{ id: 'i1', token: 'tok-abc', requires_approval: true, created_at: '2026-11-04T10:00:00Z', expires_at: '2026-11-10T23:30:00Z' }], error: null };
    const invite = await createCommunityInvite(COMMUNITY);
    expect(callsTo('create_community_invite')[0].params).toEqual({ p_community_id: COMMUNITY.toUpperCase(), p_days: 7, p_requires_approval: true });
    expect(inviteLink(invite.token)).toBe('nidalo://invite/tok-abc');
    expect(validityLabel(invite.expiresAt)).toBe('Valable jusqu\'au 11/11/2026');
    expect(inviteShareText('Voisins du 2e', inviteLink(invite.token))).toBe('Rejoignez ma communauté « Voisins du 2e » sur Nidalo : nidalo://invite/tok-abc');
    await communityInvites(COMMUNITY);
    expect(callsTo('my_community_invites')[0].params).toEqual({ p_community_id: COMMUNITY.toUpperCase() });
  });

  it('échec d\'une invitation : le refus du serveur tel quel, sinon le message général', () => {
    expect(inviteMessage({ code: 'P0001', message: 'Ce lien a expiré.' })).toBe('Ce lien a expiré.');
    expect(inviteMessage(new TypeError('Failed to fetch'))).toBe('La demande n\'a pas abouti. Vérifiez votre connexion, puis réessayez.');
  });

  it('demandes pour entrer : noms publics (l\'agence pour un professionnel) ; une lecture qui échoue rend `null`', async () => {
    server.rpc.pending_community_join_requests = { data: [{ id: 'r1', user_id: LEA.toUpperCase() }, { id: 'r2', user_id: AGENCY }], error: null };
    server.rpc.public_profiles = { data: [
      { user_id: LEA.toUpperCase(), public_name: 'Léa', account_type: 'individual', avatar_path: null },
      { user_id: AGENCY, public_name: 'Paul', account_type: 'professional', agency_name: 'Agence du Parc', avatar_path: 'p/a.jpg' },
    ], error: null };
    const requests = await joinRequests(COMMUNITY);
    expect(requests?.map((request) => request.name)).toEqual(['Léa', 'Agence du Parc']);
    expect(requests?.[1].avatarUrl).toBe('https://images.example.test/avatars/p/a.jpg');
    server.rpc.pending_community_join_requests = { data: null, error: { code: '42501', message: 'denied' } };
    expect(await joinRequests(COMMUNITY)).toBeNull();
  });
});
