import { photoUrl } from '../listings';
import { searchNormalized } from '../places';
import { contentPreview, decodeContent, type MessageContent } from './content';
import { matchesWords, normalizedPhoneNumber } from './format';

// Boîte de réception, comme l'app : lignes de my_conversations (SupabaseMessagingRepository.inbox et
// conversation(from:), SupabaseMessagingRepository.swift:139-228), communautés de my_communities
// (CompositeMessagingRepository.asCommunity, :64-71), filtres et cartes de MessagesView.swift, carnet de contacts
// et recherche de MessagingDirectory.swift.

/** Ligne de my_conversations (toutes ses colonnes, InboxRow de l'app). */
export type ServerInboxRow = {
  conversation_id: string;
  kind: string;
  listing_id: string | null;
  listing_snapshot: {
    listingId?: string | null; title?: string | null; price?: number | string | null; transaction?: string | null;
    city?: string | null; coverPath?: string | null;
  } | null;
  buyer_id: string | null;
  seller_id: string | null;
  group_name?: string | null;
  group_details?: string | null;
  group_image_path?: string | null;
  group_purpose?: string | null;
  ephemeral_seconds?: number | null;
  created_by?: string | null;
  created_at: string;
  my_role?: string | null;
  joined_at?: string | null;
  left_at?: string | null;
  last_read_at?: string | null;
  is_archived?: boolean | null;
  is_favorite?: boolean | null;
  muted_until?: string | null;
  saves_photos?: boolean | null;
  cleared_at?: string | null;
  other_user_id?: string | null;
  other_last_read_at?: string | null;
  member_count?: number | null;
  unread_count?: number | null;
  last_message_id?: string | null;
  last_message_sender_id?: string | null;
  last_message_kind?: string | null;
  last_message_content?: unknown;
  last_message_preview?: string | null;
  last_message_at?: string | null;
};

/** Ligne de conversation_participants (« conversation_id, user_id, role, left_at, last_read_at »). */
export type ParticipantRow = { conversation_id: string; user_id: string; role: string; left_at: string | null; last_read_at: string | null };

/** Ligne de public_profiles (colonnes lues par la messagerie). */
export type ProfileRow = {
  user_id: string;
  public_name: string | null;
  avatar_path: string | null;
  account_type: string | null;
  member_since?: string | null;
  agency_id?: string | null;
  agency_name: string | null;
  agency_logo_path?: string | null;
  agency_postal_code?: string | null;
  agency_city?: string | null;
  agency_phone: string | null;
};

/** Ligne de my_communities (CommunityServerRow). */
export type CommunityRow = {
  id: string;
  main_conversation_id: string;
  name: string;
  image_path?: string | null;
  members: { user_id: string; role: string; joined_at?: string | null }[];
};

export type CounterpartKind = 'individual' | 'agency' | 'group' | 'community';

export type Counterpart = {
  name: string;
  subtitle: string;
  kind: CounterpartKind;
  /** Numéro publié d'une agence (jamais celui d'un particulier). */
  phone: string | null;
  /** Photo d'un groupe ou d'une communauté (bucket privé message-attachments). */
  imagePath: string | null;
};

export type ListingSnapshot = {
  listingId: string;
  title: string;
  price: number;
  transaction: 'sale' | 'rent';
  city: string;
  coverUrl: string | null;
};

export type Member = { userId: string; name: string; kind: 'individual' | 'agency'; role: string };

export type LastMessage = {
  id: string;
  senderId: string | null;
  content: MessageContent;
  createdAt: Date;
  /** Coches : « vu » quand l'autre personne a lu après ce message. */
  isRead: boolean;
};

export type Conversation = {
  id: string;
  isGroup: boolean;
  communityId: string | null;
  listing: ListingSnapshot | null;
  counterpart: Counterpart;
  otherUserId: string | null;
  members: Member[];
  createdAt: Date;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  lastMessage: LastMessage | null;
  unreadCount: number;
  isArchived: boolean;
  isFavorite: boolean;
  mutedUntil: Date | null;
  savesPhotos: boolean;
  clearedAt: Date | null;
  hasLeft: boolean;
  isSellerSide: boolean;
  buyerId: string | null;
  sellerId: string | null;
};

export const sameId = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Identifiant tel que Swift l'écrit (`uuidString`, en majuscules). */
export const upper = (id: string): string => id.toUpperCase();

const date = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? null : value;
};

function money(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Compte professionnel avec une agence : son nom d'agence est affiché (isPro de l'app). */
export function isProfessional(profile: ProfileRow | null | undefined): boolean {
  return profile?.account_type === 'professional' && profile.agency_name != null;
}

/** Nom d'un membre : « Vous », le nom de l'agence, ou le nom public (« Particulier » sans profil). */
function memberName(userId: string, me: string | null, profile: ProfileRow | undefined): string {
  if (sameId(userId, me)) return 'Vous';
  return (isProfessional(profile) ? profile?.agency_name : profile?.public_name) ?? 'Particulier';
}

export function isMuted(conversation: Pick<Conversation, 'mutedUntil'>, now: Date = new Date()): boolean {
  return !!conversation.mutedUntil && conversation.mutedUntil.getTime() > now.getTime();
}

/** Conversation telle que l'app la construit à partir de sa ligne (conversation(from:)). */
export function conversationFrom(row: ServerInboxRow, {
  me, profiles, participants, communities,
}: {
  me: string | null;
  profiles: Map<string, ProfileRow>;
  participants: ParticipantRow[];
  communities: CommunityRow[];
}): Conversation {
  const snapshot = row.listing_snapshot;
  const listingId = snapshot ? (snapshot.listingId ?? row.listing_id ?? null) : null;
  const listing: ListingSnapshot | null = snapshot && listingId ? {
    listingId,
    title: snapshot.title ?? 'Annonce',
    price: money(snapshot.price),
    transaction: snapshot.transaction === 'rent' ? 'rent' : 'sale',
    city: snapshot.city ?? '',
    coverUrl: snapshot.coverPath ? photoUrl(snapshot.coverPath) : null,
  } : null;
  const profileOf = (id: string | null | undefined) => (id ? profiles.get(id.toLowerCase()) : undefined);
  const isGroup = row.kind === 'group';
  let counterpart: Counterpart;
  let members: Member[] = [];
  let communityId: string | null = null;
  if (isGroup) {
    counterpart = {
      name: row.group_name ?? 'Groupe', subtitle: `${row.member_count ?? 0} membres`, kind: 'group', phone: null,
      imagePath: row.group_image_path ?? null,
    };
    members = participants
      .filter((member) => sameId(member.conversation_id, row.conversation_id) && member.left_at === null)
      .map((member) => {
        const profile = profileOf(member.user_id);
        return { userId: member.user_id, name: memberName(member.user_id, me, profile), kind: isProfessional(profile) ? 'agency' : 'individual', role: member.role };
      });
    const community = communities.find((item) => sameId(item.main_conversation_id, row.conversation_id));
    if (community) {
      communityId = community.id;
      const count = community.members.length;
      counterpart = { ...counterpart, kind: 'community', subtitle: `Communauté · ${count} membre${count > 1 ? 's' : ''}` };
    }
  } else if (row.other_user_id) {
    const profile = profileOf(row.other_user_id);
    const pro = isProfessional(profile);
    counterpart = {
      name: (pro ? profile?.agency_name : profile?.public_name) ?? 'Particulier',
      subtitle: listing ? `${listing.title} · ${listing.city}` : (pro ? 'Agence' : 'Particulier'),
      kind: pro ? 'agency' : 'individual',
      phone: pro ? (profile?.agency_phone ?? null) : null,
      imagePath: null,
    };
  } else {
    counterpart = { name: 'Compte supprimé', subtitle: listing?.title ?? '', kind: 'individual', phone: null, imagePath: null };
  }
  const lastAt = date(row.last_message_at);
  let lastMessage: LastMessage | null = null;
  if (row.last_message_id && row.last_message_content != null && lastAt) {
    const otherRead = date(row.other_last_read_at);
    lastMessage = {
      id: row.last_message_id,
      senderId: row.last_message_sender_id ?? null,
      content: decodeContent(row.last_message_content),
      createdAt: lastAt,
      isRead: sameId(row.last_message_sender_id, me) && !!otherRead && otherRead.getTime() >= lastAt.getTime(),
    };
  }
  return {
    id: row.conversation_id,
    isGroup,
    communityId,
    listing,
    counterpart,
    otherUserId: isGroup ? null : (row.other_user_id ?? null),
    members,
    createdAt: date(row.created_at) ?? new Date(0),
    lastMessageAt: lastAt,
    lastMessagePreview: row.last_message_preview ?? null,
    lastMessage,
    unreadCount: row.unread_count ?? 0,
    isArchived: row.is_archived ?? false,
    isFavorite: row.is_favorite ?? false,
    mutedUntil: date(row.muted_until),
    savesPhotos: row.saves_photos ?? false,
    clearedAt: date(row.cleared_at),
    hasLeft: !!row.left_at,
    isSellerSide: !isGroup && sameId(row.seller_id, me),
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
  };
}

/** Dernière activité : dernier message, sinon création (Conversation.lastActivity). */
export const lastActivity = (conversation: Conversation): Date => conversation.lastMessageAt ?? conversation.createdAt;

/** « Vous, Claire M., Agence Démo » ; au-delà de 46 caractères, « 4 membres » (GroupNames.summary). */
export function groupSummary(members: Member[]): string {
  const joined = members.map((member) => member.name).join(', ');
  return joined.length <= 46 ? joined : `${members.length} membres`;
}

// MARK: - Filtres (InboxFilter)

export type InboxFilter = 'all' | 'unread' | 'favorites' | 'visits' | 'archived';

export const INBOX_FILTERS: { value: InboxFilter; title: string }[] = [
  { value: 'all', title: 'Tous' },
  { value: 'unread', title: 'Non lus' },
  { value: 'favorites', title: 'Favoris' },
  { value: 'visits', title: 'Visites' },
  { value: 'archived', title: 'Archivés' },
];

export function filterIncludes(filter: InboxFilter, conversation: Conversation, hasVisit: boolean): boolean {
  switch (filter) {
    case 'all': return !conversation.isArchived;
    case 'unread': return !conversation.isArchived && conversation.unreadCount > 0;
    case 'favorites': return !conversation.isArchived && conversation.isFavorite;
    case 'visits': return !conversation.isArchived && hasVisit;
    case 'archived': return conversation.isArchived;
  }
}

/** Conversations non archivées avec des non-lus (MessagingStore.unreadConversationCount). */
export function unreadConversationCount(conversations: Conversation[]): number {
  return conversations.filter((conversation) => !conversation.isArchived && conversation.unreadCount > 0).length;
}

export const EMPTY_STATES: Record<InboxFilter, { title: string; message: string }> = {
  all: { title: 'Aucune conversation', message: 'Contactez un vendeur depuis une annonce : la conversation apparaîtra ici.' },
  unread: { title: 'Tout est lu', message: 'Vous avez lu tous vos messages.' },
  favorites: { title: 'Aucun favori', message: 'Ajoutez une conversation ou un groupe aux favoris pour le retrouver ici.' },
  visits: { title: 'Aucune visite prévue', message: 'Les conversations avec une visite confirmée apparaîtront ici.' },
  archived: { title: 'Aucune conversation archivée', message: 'Les conversations archivées apparaîtront ici.' },
};

/** Aperçu d'une ligne : coches et « Vous : » devant mes messages (ConversationRow.preview). */
export function rowPreview(conversation: Conversation, me: string | null): { text: string; mine: boolean; read: boolean; muted: boolean } {
  const last = conversation.lastMessage;
  if (!last) return { text: conversation.lastMessagePreview ?? 'Nouvelle conversation', mine: false, read: false, muted: true };
  const mine = sameId(last.senderId, me) && last.content.kind !== 'system';
  return { text: `${mine ? 'Vous : ' : ''}${contentPreview(last.content)}`, mine, read: last.isRead, muted: false };
}

/** Recherche dans la boîte : interlocuteur, sujet, bien, ville, dernier message et membres (matchesInboxQuery). */
export function matchesInboxQuery(conversation: Conversation, query: string): boolean {
  if (!searchNormalized(query)) return true;
  return matchesWords(query, [
    conversation.counterpart.name, conversation.counterpart.subtitle, conversation.listing?.title ?? '',
    conversation.listing?.city ?? '', conversation.lastMessagePreview ?? '', ...conversation.members.map((member) => member.name),
  ]);
}

/** Conversation trouvée par la recherche de la messagerie (MessagingDirectory.matches(conversation:)). */
export function conversationMatches(conversation: Conversation, query: string): boolean {
  return matchesWords(query, [
    conversation.counterpart.name, conversation.counterpart.subtitle, conversation.listing?.title ?? '',
    conversation.listing?.city ?? '', conversation.lastMessagePreview ?? '',
  ]);
}

// MARK: - Carnet de contacts (MessagingDirectory.contacts)

/** Agence qui publie des annonces (professional_contacts). */
export type ProfessionalContactRow = {
  user_id: string;
  agency_id: string;
  agency_name: string;
  agency_logo_path?: string | null;
  agency_postal_code?: string | null;
  agency_city?: string | null;
  agency_is_verified?: boolean | null;
};

export type Contact = {
  id: string;
  counterpart: Counterpart;
  /** Ses conversations, de la plus récente à la plus ancienne (vide pour une agence pas encore contactée). */
  conversations: Conversation[];
  professional: ProfessionalContactRow | null;
};

export function contactKey(counterpart: Counterpart): string {
  return `${counterpart.kind}|${searchNormalized(counterpart.name)}`;
}

function professionalCounterpart(row: ProfessionalContactRow): Counterpart {
  return { name: row.agency_name, subtitle: row.agency_city ? `Agence · ${row.agency_city}` : 'Agence', kind: 'agency', phone: null, imagePath: null };
}

export const lastContactActivity = (contact: Contact): Date | null => (contact.conversations[0] ? lastActivity(contact.conversations[0]) : null);

const byName = (a: Contact, b: Contact) => {
  const left = searchNormalized(a.counterpart.name);
  const right = searchNormalized(b.counterpart.name);
  return left < right ? -1 : left > right ? 1 : 0;
};

/** Contacts : d'abord ceux avec qui l'on a échangé (archivés compris), puis les agences pas encore contactées. */
export function contactsFrom(conversations: Conversation[], professionals: ProfessionalContactRow[] = []): Contact[] {
  const groups = new Map<string, Conversation[]>();
  for (const conversation of conversations.filter((item) => !item.isGroup)) {
    const key = contactKey(conversation.counterpart);
    groups.set(key, [...(groups.get(key) ?? []), conversation]);
  }
  const byKey = new Map<string, ProfessionalContactRow>();
  for (const professional of professionals) {
    const key = contactKey(professionalCounterpart(professional));
    if (!byKey.has(key)) byKey.set(key, professional);
  }
  const withConversations = [...groups.entries()].map(([key, items]) => {
    const sorted = [...items].sort((a, b) => lastActivity(b).getTime() - lastActivity(a).getTime());
    return { id: key, counterpart: sorted[0].counterpart, conversations: sorted, professional: byKey.get(key) ?? null };
  }).sort((a, b) => lastActivity(b.conversations[0]).getTime() - lastActivity(a.conversations[0]).getTime());
  const others = [...byKey.entries()].filter(([key]) => !groups.has(key))
    .map(([key, professional]) => ({ id: key, counterpart: professionalCounterpart(professional), conversations: [], professional }));
  return [...withConversations, ...others.sort(byName)];
}

export function alphabetical(contacts: Contact[]): Contact[] {
  return [...contacts].sort(byName);
}

/** Lettre de la liste alphabétique (« # » hors A–Z). */
export function sectionLetter(contact: Contact): string {
  const first = searchNormalized(contact.counterpart.name).charAt(0);
  return /^[a-z]$/.test(first) ? first.toUpperCase() : '#';
}

/** Contact dont un mot du nom commence par la saisie ; à partir de 3 lettres, le sujet compte aussi. */
export function contactMatches(contact: Contact, query: string): boolean {
  const phone = normalizedPhoneNumber(query);
  if (phone) {
    return [contact.counterpart.phone].map((value) => (value ? normalizedPhoneNumber(value) : null)).includes(phone);
  }
  if (matchesWords(query, [contact.counterpart.name])) return true;
  return query.trim().length >= 3 && matchesWords(query, [contact.counterpart.subtitle]);
}

/** « Appartement 3 pièces · Lyon 2e · 2 conversations » (ContactsCard). */
export function contactDetail(contact: Contact): string {
  const count = contact.conversations.length;
  return count > 1 ? `${contact.counterpart.subtitle} · ${count} conversations` : contact.counterpart.subtitle;
}

/** Initiales de l'avatar : premières lettres des deux premiers mots (ConversationCounterpart.initials). */
export function counterpartInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((word) => [...word][0] ?? '').join('').toLocaleUpperCase('fr-FR');
}
