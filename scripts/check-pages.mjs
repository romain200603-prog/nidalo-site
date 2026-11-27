// Vérification du site construit (docs/) dans Chromium, sans réseau : le serveur Supabase, les services de lieux
// et la carte sont simulés avec des données inventées. Lancer : node scripts/check-pages.mjs [dossier des captures]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const root = resolve(fileURLToPath(import.meta.url), '../..');
// Dossier du site construit : docs/ par défaut, ou NIDALO_DOCS (construction à part, sans toucher docs/).
const docs = resolve(process.env.NIDALO_DOCS ?? join(root, 'docs'));
const out = resolve(process.argv[2] ?? join(root, 'scripts', 'captures'));
await mkdir(out, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(docs, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await readFile(join(docs, '404.html')));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const listings = JSON.parse(await readFile(join(root, 'scripts/fixtures/listings.json'), 'utf8'));
const photos = {};
for (const name of ['photo0.jpg', 'photo1.jpg', 'photo2.jpg']) photos[name] = await readFile(join(root, 'scripts/fixtures', name));
const tile = await readFile(join(root, 'scripts/fixtures/tile.png'));

// Accueil sur ordinateur : annonces inventées qui remplissent chaque section (Opportunités : loyer déclaré ou
// potentiel ; Biens similaires : appartements de Lyon jusqu'à 300 000 € ; Nouveautés ; Baisses de prix).
const homeId = (n) => `6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1b0${n}`;
const homePhoto = (n, file) => [{ id: `pb${n}`, storage_path: `test/${file}`, position: 0, width: 1400, height: 800 }];
const homeRow = (n, fields) => ({
  ...listings[0], id: homeId(n), owner_id: '00000000-0000-4000-8000-0000000000b0', publish_category: 'residential', previous_price: null,
  rental_info: null, location_precision: 'approximate', public_street: null, listing_photos: [], ...fields,
});
const HOME_LISTINGS = [
  homeRow(1, { title: 'Appartement 3 pièces', city: 'Lyon 2e', postal_code: '69002', insee_code: '69382', public_latitude: 45.7486, public_longitude: 4.8275,
    living_area: 62, rooms: 3, price: 238000, rental_info: { isLeased: false, potentialMonthlyRent: 1550 }, publish_category: 'investment',
    published_at: '2026-11-06T09:00:00Z', listing_photos: homePhoto(1, 'photo0.jpg') }),
  homeRow(2, { title: 'Appartement 2 pièces vue dégagée', city: 'Lyon 7e', postal_code: '69007', insee_code: '69387', public_latitude: 45.7451, public_longitude: 4.8423,
    living_area: 48, rooms: 2, bedrooms: 1, price: 349000, rental_info: { isLeased: true, currentMonthlyRent: 1149 }, publish_category: 'investment',
    published_at: '2026-11-06T08:00:00Z' }),
  homeRow(3, { property_type: 'house', title: 'Maison 4 pièces avec jardin', city: 'Caluire-et-Cuire', postal_code: '69300', insee_code: '69034',
    public_latitude: 45.7953, public_longitude: 4.8466, living_area: 95, rooms: 4, bedrooms: 3, floor: null, price: 420000, previous_price: 435000,
    rental_info: { isLeased: false, potentialMonthlyRent: 1900 }, publish_category: 'investment', published_at: '2026-11-05T18:00:00Z', listing_photos: homePhoto(3, 'photo1.jpg') }),
  homeRow(4, { title: 'Studio rénové', city: 'Lyon 8e', postal_code: '69008', insee_code: '69388', public_latitude: 45.7352, public_longitude: 4.8691,
    living_area: 22, rooms: 1, bedrooms: 0, price: 98000, previous_price: 105000, rental_info: { isLeased: false, potentialMonthlyRent: 690 },
    publish_category: 'investment', published_at: '2026-11-05T12:00:00Z', listing_photos: homePhoto(4, 'photo2.jpg') }),
  homeRow(5, { property_type: 'house', title: 'Maison familiale 5 pièces', city: 'Écully', postal_code: '69130', insee_code: '69081',
    public_latitude: 45.7746, public_longitude: 4.7771, living_area: 128, rooms: 5, bedrooms: 4, floor: null, price: 545000,
    published_at: '2026-11-06T10:00:00Z', listing_photos: homePhoto(5, 'photo1.jpg') }),
  homeRow(6, { title: 'Appartement 3 pièces lumineux', city: 'Lyon 3e', postal_code: '69003', insee_code: '69383', public_latitude: 45.7597, public_longitude: 4.8492,
    living_area: 68, rooms: 3, price: 255000, previous_price: 265000, published_at: '2026-11-04T09:00:00Z', listing_photos: homePhoto(6, 'photo2.jpg') }),
  homeRow(7, { title: 'Appartement 2 pièces', city: 'Lyon 6e', postal_code: '69006', insee_code: '69386', public_latitude: 45.7700, public_longitude: 4.8520,
    living_area: 45, rooms: 2, bedrooms: 1, price: 265000, published_at: '2026-11-03T09:00:00Z', listing_photos: homePhoto(7, 'photo0.jpg') }),
  // Une de plus que la ligne affichée dans Opportunités, Biens similaires et Baisses de prix.
  homeRow(8, { title: 'Appartement 2 pièces avec balcon', city: 'Villeurbanne', postal_code: '69100', insee_code: '69266', public_latitude: 45.7720, public_longitude: 4.8903,
    living_area: 41, rooms: 2, bedrooms: 1, price: 172000, previous_price: 179000, rental_info: { isLeased: false, potentialMonthlyRent: 920 },
    publish_category: 'investment', published_at: '2026-11-02T09:00:00Z', listing_photos: homePhoto(8, 'photo1.jpg') }),
];
const communes = [
  { nom: 'Lyon', code: '69123', codesPostaux: ['69001', '69002', '69003'], population: 520000, centre: { type: 'Point', coordinates: [4.835, 45.758] }, departement: { nom: 'Rhône' } },
  { nom: 'Lyons-la-Forêt', code: '27377', codesPostaux: ['27480'], population: 750, centre: { type: 'Point', coordinates: [1.47, 49.4] }, departement: { nom: 'Eure' } },
];

// MARK: - Compte de test (étape 2) : données inventées, numéro dans la plage réservée à la fiction (06 39 98).

const USER_ID = 'a0000000-0000-4000-8000-0000000000c1';
const USER_EMAIL = 'claire.martin@exemple.fr';
const GONE_ID = '6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1aff';
const ACCOUNT = {
  profiles: [{
    id: USER_ID, display_name: 'Claire Martin', avatar_path: null, account_type: 'individual', professional_profile_id: null,
    created_at: '2026-10-01T08:00:00Z', shows_full_name: false, findable_by_phone: false,
  }],
  profile_details: [{
    user_id: USER_ID, first_name: 'Claire', last_name: 'Martin', birth_date: null, phone: '0639981234', street: null,
    postal_code: '69003', city: 'Lyon', insee_code: '69383', country_code: 'FR', professional_situation: 'employee',
  }],
  favorites: [
    { listing_id: '6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1a02', created_at: '2026-11-02T09:00:00Z' },
    { listing_id: '6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1a01', created_at: '2026-11-04T09:00:00Z' },
    // Annonce retirée depuis : le site doit afficher « Annonce plus disponible ».
    { listing_id: GONE_ID, created_at: '2026-11-05T09:00:00Z' },
  ],
  saved_searches: [
    {
      id: 'b0000000-0000-4000-8000-000000000051', user_id: USER_ID, name: 'Lyon · Appartement · Jusqu\'à 300 000 €',
      query: { floor: {}, price: { max: 300000 }, rooms: {}, bedrooms: {}, location: { around: { center: { latitude: 45.764, longitude: 4.8357 }, radiusMeters: 10000 } }, livingArea: {}, transaction: 'sale', outdoorSpaces: [], propertyTypes: ['apartment'], requiresParking: false, requiresElevator: false, requiresOutdoorSpace: false },
      alerts_enabled: true, created_at: '2026-11-03T18:00:00Z', last_notified_at: null, last_viewed_at: '2026-11-03T18:00:00Z',
    },
    {
      id: 'b0000000-0000-4000-8000-000000000052', user_id: USER_ID, name: 'Investir · Appartement · Jusqu\'à 250 000 €',
      query: { floor: {}, price: { max: 250000 }, rooms: {}, bedrooms: {}, location: { anywhere: {} }, investment: { leasedOnly: false, downPayment: 50000, minGrossYield: 0.05, requiresDeclaredRent: false }, livingArea: {}, transaction: 'sale', outdoorSpaces: [], propertyTypes: ['apartment'], requiresParking: false, requiresElevator: false, requiresOutdoorSpace: false },
      alerts_enabled: false, created_at: '2026-11-02T18:00:00Z', last_notified_at: null, last_viewed_at: null,
    },
  ],
  real_estate_projects: [{ id: 'c0000000-0000-4000-8000-000000000001', user_id: USER_ID, kind: 'buy', city: 'Lyon', purpose: 'Résidence principale', completed_steps: ['search', 'visits'] }],
  professional_profiles: [],
  professional_profile_details: [],
  // Espace pro : contacts ajoutés, ventes suivies, mandats et opportunités (vides ici ; vérifiés par scripts/check-espace-pro.mjs).
  pro_contacts: [],
  pro_sales: [],
  pro_mandates: [],
  pro_opportunities: [],
};

/** Jeton de session factice (le serveur est simulé : la signature n'est jamais vérifiée). */
function fakeSession() {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: USER_ID, aud: 'authenticated', role: 'authenticated', email: USER_EMAIL, email_confirmed_at: '2026-10-01T08:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-10-01T08:00:00Z',
  };
  const access = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, email: USER_EMAIL, role: 'authenticated', aud: 'authenticated', exp: now + 7200, iat: now })}.c2lnbmF0dXJl`;
  return { access_token: access, token_type: 'bearer', expires_in: 7200, expires_at: now + 7200, refresh_token: 'jeton-de-test', user };
}

/** Filtres PostgREST utiles ici : `col=eq.x` et `col=in.(a,b)` ; les autres (lte, or…) sont ignorés. */
function filtered(rows, params) {
  let result = rows;
  for (const [column, value] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(column)) continue;
    if (value.startsWith('eq.')) result = result.filter((row) => String(row[column]) === value.slice(3));
    else if (value.startsWith('in.(') && value.endsWith(')')) {
      const allowed = value.slice(4, -1).split(',').map((v) => v.replace(/^"|"$/g, ''));
      result = result.filter((row) => allowed.includes(String(row[column])));
    }
  }
  return result;
}

/** Demandes envoyées au serveur simulé par le compte de test (enregistrements). */
const writes = [];

// MARK: - Favoris sur ordinateur (maquette 4) : annonces inventées de chaque sorte, mises en favoris par le compte de test.

const favId = (n) => `6b0f6c1e-1d1a-4c55-9a51-0d5f0000000${n}`;
const favPhotos = (n, files) => files.map((file, index) => ({ id: `pf${n}${index}`, storage_path: `test/${file}`, position: index, width: 1400, height: 800 }));
const favRow = (n, fields) => ({
  ...listings[0], id: favId(n), owner_id: '00000000-0000-4000-8000-0000000000b0', previous_price: null, rental_info: null, monthly_charges: null,
  location_precision: 'approximate', public_street: null, asset_details: null, listing_photos: [], ...fields,
});
const hotelFixture = JSON.parse(await readFile(join(root, 'scripts/fixtures/listing-extra.json'), 'utf8')).listings.find((row) => row.property_type === 'hotel');
/** Une vente, une location, un investissement (rendement de 8,2 %), un hôtel (murs loués, 5,7 %) ; plus une annonce retirée (GONE_ID). */
const FAV_LISTINGS = [
  favRow(1, { title: 'Appartement 3 pièces lumineux', city: 'Lyon 3e', postal_code: '69003', insee_code: '69383', living_area: 68, rooms: 3, floor: 2,
    price: 255000, energy_class: 'C', publish_category: 'residential', published_at: '2026-11-05T09:00:00Z', listing_photos: favPhotos(1, ['photo0.jpg', 'photo1.jpg', 'photo2.jpg']) }),
  favRow(2, { transaction: 'rent', title: 'Studio meublé', city: 'Lyon 7e', postal_code: '69007', insee_code: '69387', living_area: 24, rooms: 1, floor: 2,
    price: 640, monthly_charges: 40, energy_class: 'E', publish_category: 'rental', rental_info: { isFurnished: true }, published_at: '2026-11-04T08:00:00Z',
    listing_photos: favPhotos(2, ['photo1.jpg']) }),
  favRow(3, { title: 'T2 loué près du métro', city: 'Villeurbanne', postal_code: '69100', insee_code: '69266', living_area: 45, rooms: 2, floor: 1, price: 175000,
    energy_class: 'D', publish_category: 'investment', rental_info: { isLeased: true, currentMonthlyRent: 1195 }, published_at: '2026-11-06T08:00:00Z',
    listing_photos: favPhotos(3, ['photo2.jpg']) }),
  { ...hotelFixture, id: favId(4), title: 'Hôtel 3 étoiles, murs loués', rental_info: { isLeased: true, currentMonthlyRent: 9000 }, published_at: '2026-11-02T10:00:00Z', listing_photos: [] },
];
/** Favoris du compte, du plus ancien au plus récent (ordre de lecture de l'app). */
const FAV_ACCOUNT = {
  favorites: [
    { listing_id: favId(1), created_at: '2026-11-01T09:00:00Z' },
    { listing_id: favId(3), created_at: '2026-11-03T09:00:00Z' },
    { listing_id: GONE_ID, created_at: '2026-11-04T09:00:00Z' },
    { listing_id: favId(4), created_at: '2026-11-05T09:00:00Z' },
    { listing_id: favId(2), created_at: '2026-11-06T09:00:00Z' },
  ],
};
/** Captures pour Romain, au plus près de la maquette : un investissement loué (8,2 %), une vente d'une pièce, une annonce retirée. */
const MOCKUP_LISTINGS = [
  favRow(5, { title: 'Appartement 2 pièces – Annemasse', city: 'Annemasse', postal_code: '74100', insee_code: '74012', living_area: 55, rooms: 2, floor: null,
    price: 205000, energy_class: null, publish_category: 'investment', rental_info: { isLeased: true, currentMonthlyRent: 1400 }, published_at: '2026-11-06T07:00:00Z',
    listing_photos: favPhotos(5, ['photo0.jpg']) }),
  favRow(6, { title: 'Studio avec vue dégagée', city: 'Lyon', postal_code: '69002', insee_code: '69382', living_area: 30, rooms: 1, floor: null, price: 100000,
    energy_class: 'D', publish_category: 'residential', published_at: '2026-11-05T07:00:00Z', listing_photos: favPhotos(6, ['photo1.jpg']) }),
];
const MOCKUP_ACCOUNT = {
  favorites: [
    { listing_id: favId(6), created_at: '2026-11-02T09:00:00Z' },
    { listing_id: favId(5), created_at: '2026-11-03T09:00:00Z' },
    { listing_id: GONE_ID, created_at: '2026-11-04T09:00:00Z' },
  ],
};

// MARK: - Pastilles : conversations et notifications inventées (barre d'onglets, cloches, écran Notifications).

const HOUR = 3600 * 1000;
const OTHER_ID = 'a0000000-0000-4000-8000-0000000000d2';
const conversationId = (n) => `c0000000-0000-4000-8000-00000000000${n}`;
/** Non-lus par conversation (calculés par le serveur dans my_conversations). */
const CONVERSATIONS = [
  { conversation_id: conversationId(1), listing_id: listings[1].id, unread_count: 2 },
  { conversation_id: conversationId(2), listing_id: listings[0].id, unread_count: 1 },
  // Archivée dans conversation_preferences : ses 4 non-lus ne comptent pas dans la pastille.
  { conversation_id: conversationId(3), listing_id: listings[2].id, unread_count: 4 },
  { conversation_id: conversationId(4), listing_id: listings[0].id, unread_count: 0 },
];
const CONVERSATION_PREFERENCES = [
  { user_id: USER_ID, conversation_id: conversationId(3), is_archived: true, is_favorite: false, muted_until: null, saves_photos: false, cleared_at: null },
  { user_id: USER_ID, conversation_id: conversationId(2), is_archived: false, is_favorite: true, muted_until: null, saves_photos: false, cleared_at: null },
];
/** Sortes de notification connues de l'app (NidaloNotification.Kind) : les autres sont ignorées. */
const NOTIFICATION_KINDS = ['newRequest', 'accepted', 'declined', 'proposed', 'rescheduleProposed', 'rescheduled', 'rescheduleDeclined', 'cancelled',
  'reminder', 'searchMatch', 'offerReceived', 'offerCountered', 'offerAccepted', 'offerDeclined', 'offerWithdrawn', 'visitSlotsOpened'];
const notificationId = (n) => `d0000000-0000-4000-8000-00000000000${n}`;
/** Table notifications, écrite par le serveur avec les textes de ses fonctions (visites, offres). */
function notificationRows(now) {
  const at = (hours) => new Date(now - hours * HOUR).toISOString();
  const row = (fields) => ({ request_id: null, listing_id: null, conversation_id: null, offer_id: null, read_at: null, ...fields });
  return [
    row({ id: notificationId(1), kind: 'offerReceived', listing_id: listings[1].id, conversation_id: conversationId(1), offer_id: 'f0000000-0000-4000-8000-000000000001',
      title: listings[1].title, body: 'Julien Moreau vous fait une offre de 172 000 €.', created_at: at(2) }),
    row({ id: notificationId(2), kind: 'accepted', request_id: 'e0000000-0000-4000-8000-000000000001', listing_id: listings[0].id,
      title: listings[0].title, body: 'Camille Roux a accepté : la visite est confirmée.', created_at: at(26) }),
    // Sorte que cette version de l'app ne connaît pas : ignorée, comme dans l'app.
    row({ id: notificationId(3), kind: 'sorteFuture', title: 'Nouveauté', body: 'Une sorte de notification inconnue.', created_at: at(30) }),
    row({ id: notificationId(4), kind: 'proposed', request_id: 'e0000000-0000-4000-8000-000000000002', listing_id: listings[2].id,
      title: listings[2].title, body: 'Marc Petit propose un autre créneau.', created_at: at(75), read_at: at(70) }),
    // Annonce supprimée depuis (listing_id remis à null) : la notification ouvre la demande de visite.
    row({ id: notificationId(5), kind: 'cancelled', request_id: 'e0000000-0000-4000-8000-000000000003',
      title: 'Maison', body: 'Marc Petit a annulé la demande.', created_at: at(220), read_at: at(200) }),
  ];
}
function messagingState() {
  return {
    conversations: CONVERSATIONS.map((row) => ({ ...row })),
    preferences: CONVERSATION_PREFERENCES.map((row) => ({ ...row })),
    notifications: notificationRows(Date.now()),
  };
}
/** Réponse de my_conversations : is_archived vient de conversation_preferences, comme dans la fonction du serveur. */
function myConversations(state) {
  return state.conversations.map((row) => {
    const preference = state.preferences.find((item) => item.conversation_id === row.conversation_id);
    return {
      conversation_id: row.conversation_id, kind: 'listing', listing_id: row.listing_id, listing_snapshot: null, buyer_id: USER_ID, seller_id: OTHER_ID,
      group_name: null, group_details: null, group_image_path: null, group_purpose: null, ephemeral_seconds: null, created_by: USER_ID,
      created_at: '2026-11-01T09:00:00Z', my_role: 'member', joined_at: '2026-11-01T09:00:00Z', left_at: null, last_read_at: null,
      is_archived: preference?.is_archived ?? false, is_favorite: preference?.is_favorite ?? false, muted_until: preference?.muted_until ?? null,
      saves_photos: preference?.saves_photos ?? false, cleared_at: preference?.cleared_at ?? null, other_user_id: OTHER_ID, other_last_read_at: null,
      member_count: 2, unread_count: row.unread_count, last_message_id: null, last_message_sender_id: OTHER_ID, last_message_kind: 'text',
      last_message_content: null, last_message_preview: 'Bonjour, le bien est-il toujours disponible ?', last_message_at: '2026-11-06T08:00:00Z',
    };
  });
}
/** Pastilles attendues d'après les données simulées : règles de l'app (archivées exclues ; « 9+ » pour la cloche, « 99+ » pour Messages). */
function expectedBadges(state) {
  const messages = myConversations(state).filter((row) => !row.is_archived).reduce((sum, row) => sum + row.unread_count, 0);
  const notifications = state.notifications.filter((row) => NOTIFICATION_KINDS.includes(row.kind) && row.read_at === null).length;
  return {
    messages, notifications, messagesText: messages > 99 ? '99+' : String(messages), notificationsText: notifications > 9 ? '9+' : String(notifications),
  };
}
/** Demandes des pastilles et des notifications (my_conversations, notifications, mark_notifications_read), avec la largeur de la page. */
const badgeRequests = [];
function pageWidth(request) {
  try {
    return request.frame().page().viewportSize()?.width ?? null;
  } catch {
    return null;
  }
}

/** Page qui a envoyé une demande au serveur simulé (chemin de son adresse), ou null. */
function pagePath(request) {
  try { return new URL(request.frame().url()).pathname; } catch { return null; }
}

/** Écran de Mon compte qui a envoyé une demande (paramètre « vue » de son adresse), ou null. */
function pageView(request) {
  try { return new URL(request.frame().url()).searchParams.get('vue'); } catch { return null; }
}

/**
 * Pastille Messages de la barre d'onglets du téléphone (AppTabBar de l'app, n° 44) : avec un compte, my_conversations
 * sans paramètre, lu à l'ouverture d'une page qui montre la barre (sous 1024 px) ; jamais sur la fiche d'une annonce,
 * qui la masque.
 */
function tabBarBadgeRead(request, table, body, width, signedIn) {
  return signedIn && table === 'rpc/my_conversations' && request.method() === 'POST' && width !== null && width < 1024
    && pagePath(request) !== '/annonce/' && (body === null || body === '' || (typeof body === 'object' && Object.keys(body).length === 0));
}

/**
 * `listingRows` : annonces renvoyées par la table listings (par défaut les trois de fixtures/listings.json) ;
 * `account` : tables du compte de test à remplacer (projet avec critères, autre nom affiché…).
 */
async function mock(context, { signedIn = false, listingRows = listings, account = {}, refuse = [], slow = {} } = {}) {
  const tables = { ...ACCOUNT, ...account };
  // Mon espace d'un compte professionnel, sur téléphone aussi : la ligne « Mes contacts » lit les conversations, les
  // demandes de visite et les offres pour son nombre de contacts et sa pastille (scripts/check-espace-pro.mjs).
  const pro = tables.profiles?.[0]?.account_type === 'professional';
  const contactsRead = (request, table) => pro && pagePath(request) === '/compte/' && request.method() === 'POST'
    && ['rpc/my_conversations', 'rpc/my_visit_requests', 'rpc/my_offers'].includes(table);
  // La page Messages marche aussi sur téléphone avec un compte (demande de Romain du 14 novembre 2026).
  const messagesPage = (request) => signedIn && pagePath(request) === '/messages/';
  // L'écran Notifications aussi (même jour) : sur téléphone, il lit et marque les notifications, sans les conversations
  // (pas de pastilles sur téléphone).
  const notificationsScreen = (request, table) => signedIn && pagePath(request) === '/compte/' && pageView(request) === 'notifications'
    && ['notifications', 'rpc/mark_notifications_read'].includes(table);
  // Accueil du téléphone (celui de l'app, novembre 2026) : la cloche de sa barre du haut lit les notifications pour son
  // point rouge, sans temps réel ni « lu ».
  const homeBell = (request, table) => signedIn && pagePath(request) === '/' && table === 'notifications' && request.method() === 'GET';
  // Mon compte du téléphone (celui de l'app, étape 3) : la cloche de son grand titre lit les notifications pour son
  // point rouge, sans temps réel ni « lu » ; la ligne « Mon agenda » lit l'agenda pour son sous-titre.
  const accountBell = (request, table) => signedIn && pagePath(request) === '/compte/' && pageView(request) === null && table === 'notifications'
    && request.method() === 'GET';
  const accountAgenda = (request, table) => signedIn && pagePath(request) === '/compte/' && pageView(request) === null
    && ['agenda_visits', 'rpc/my_visit_requests'].includes(table);
  const requests = [];
  const json = (route, status, body) =>
    route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: body === undefined ? '' : JSON.stringify(body) });
  const state = messagingState();
  await context.route('https://izzsoitqtzzswkpvdozd.supabase.co/rest/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.replace('/rest/v1/', '');
    const single = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    requests.push({ table, method: request.method(), search: decodeURIComponent(url.search), width: pageWidth(request), path: pagePath(request) });
    if (['rpc/my_conversations', 'rpc/mark_notifications_read', 'notifications'].includes(table)) {
      let body = null;
      try { body = request.postDataJSON(); } catch { body = request.postData(); }
      const width = pageWidth(request);
      badgeRequests.push({ table, method: request.method(), search: url.search, body, width, signedIn });
      if (width !== null && width < 1024 && !contactsRead(request, table) && !messagesPage(request) && !notificationsScreen(request, table)
        && !homeBell(request, table) && !accountBell(request, table) && !tabBarBadgeRead(request, table, body, width, signedIn)) {
        problems.push(`téléphone : ${table} demandé (rien ne doit changer sous 1024 px)`);
      }
      if (!signedIn) {
        problems.push(`sans compte : ${table} demandé`);
        return json(route, 200, []);
      }
      if (table === 'rpc/my_conversations') return json(route, 200, myConversations(state));
      if (table === 'notifications') {
        const rows = [...state.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, Number(url.searchParams.get('limit') ?? 1000));
        return json(route, 200, rows);
      }
      // mark_notifications_read(p_ids uuid[] default null) : comme la fonction du serveur, sans liste = toutes.
      writes.push({ method: request.method(), table, search: url.search, body });
      const now = new Date().toISOString();
      for (const row of state.notifications) {
        if (row.read_at === null && (body?.p_ids == null || body.p_ids.includes(row.id))) row.read_at = now;
      }
      return json(route, 204);
    }
    if (['rpc/my_offers', 'rpc/my_visit_requests', 'agenda_visits', 'rpc/start_listing_conversation', 'rpc/make_offer', 'rpc/create_visit_request'].includes(table)) {
      // Fiche d'une annonce sur ordinateur : offres, demandes de visite et agenda du compte (vides ici ; les actions
      // sont vérifiées par scripts/check-listing.mjs). Rien de cela sans compte, ni sous 1024 px.
      const width = pageWidth(request);
      if (width !== null && width < 1024 && !contactsRead(request, table) && !messagesPage(request) && !accountAgenda(request, table)) {
        problems.push(`téléphone : ${table} demandé (rien ne doit changer sous 1024 px)`);
      }
      if (!signedIn) problems.push(`sans compte : ${table} demandé`);
      else if (!['rpc/my_offers', 'rpc/my_visit_requests', 'agenda_visits'].includes(table)) problems.push(`${table} appelé sans action de la personne`);
      return json(route, 200, []);
    }
    if (table === 'rpc/my_visit_sessions') {
      // Créneaux ouverts de Mon agenda : aucune séance ici (voir mockSpace). Rien sans compte.
      if (!signedIn) problems.push(`sans compte : ${table} demandé`);
      return json(route, 200, []);
    }
    if (/^rpc\/(my_team_agency|my_agency_team|agency_invites|agency_invite_preview)$/.test(table)) {
      // Gestion des équipes (Mon compte d'un professionnel, Profil agence) : aucune équipe ici ; les écrans des équipes
      // sont vérifiés par scripts/check-espace-pro.mjs. Rien de cela sans compte.
      if (!signedIn) problems.push(`sans compte : ${table} demandé`);
      return json(route, 200, []);
    }
    if (/^rpc\/(create_agency_invite|revoke_agency_invite|set_agency_member_role|remove_agency_member|leave_agency|accept_agency_invite)$/.test(table)) {
      problems.push(`${table} appelé sans action de la personne`);
      return json(route, 400, { message: 'non simulé' });
    }
    if (signedIn && table in tables) {
      if (request.method() !== 'GET' && request.method() !== 'HEAD') {
        let body = null;
        try { body = request.postDataJSON(); } catch { body = request.postData(); }
        writes.push({ method: request.method(), table, search: url.search, body });
        // La marque interne « keepalive » du site (lib/supabase.ts) ne doit jamais partir.
        if (Object.keys(request.headers()).some((name) => name.toLowerCase() === 'x-nidalo-keepalive')) problems.push(`${table} : marque keepalive envoyée au serveur`);
        // Écriture refusée par le serveur (droits) : `refuse` liste « MÉTHODE table ».
        if (refuse.includes(`${request.method()} ${table}`)) return json(route, 403, { code: '42501', message: 'permission denied' });
        // Une recherche enregistrée revient telle qu'envoyée ; les autres écritures ne renvoient rien.
        if (table === 'saved_searches' && request.method() === 'POST') {
          return json(route, 201, { user_id: USER_ID, created_at: new Date().toISOString(), last_notified_at: null, last_viewed_at: null, alerts_enabled: true, ...body });
        }
        // Mise à jour d'une recherche (saveSearch) : la ligne modifiée revient, comme du serveur ; aucune pour une
        // recherche nouvelle (le site la crée ensuite, comme l'app).
        if (table === 'saved_searches' && request.method() === 'PATCH' && (request.headers().prefer ?? '').includes('return=representation')) {
          const row = filtered(tables.saved_searches, url.searchParams)[0];
          return json(route, 200, row ? [{ ...row, ...body }] : []);
        }
        return json(route, request.method() === 'POST' ? 201 : 204);
      }
      const rows = filtered(tables[table], url.searchParams);
      const respond = () => (single
        ? (rows.length === 1 ? json(route, 200, rows[0]) : json(route, 406, { code: 'PGRST116', message: 'no rows' }))
        : json(route, 200, rows));
      // Réponse lente (`slow` : table → millisecondes), pour voir ce que la page montre pendant le chargement.
      if (slow[table]) {
        setTimeout(respond, slow[table]);
        return undefined;
      }
      return respond();
    }
    let rows = listingRows;
    if (signedIn && table === 'listings' && url.searchParams.get('owner_id') === `eq.${USER_ID}`) {
      // « Mes annonces » : une annonce en ligne et un brouillon.
      rows = [{ ...listings[2], owner_id: USER_ID }, { ...listings[0], id: '6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1a0d', owner_id: USER_ID, status: 'draft', published_at: null }];
      return json(route, 200, rows);
    }
    const transaction = url.searchParams.get('transaction');
    if (transaction?.startsWith('eq.')) rows = rows.filter((r) => r.transaction === transaction.slice(3));
    const id = url.searchParams.get('id');
    if (id?.startsWith('eq.')) rows = rows.filter((r) => r.id === id.slice(3));
    if (id?.startsWith('in.(')) rows = filtered(rows, [['id', id]]);
    // Annonces lentes (`slow.listings`), pour voir ce que la page montre pendant leur lecture.
    if (slow.listings) {
      setTimeout(() => json(route, 200, rows), slow.listings);
      return undefined;
    }
    json(route, 200, rows);
  });
  await context.route('https://izzsoitqtzzswkpvdozd.supabase.co/auth/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!signedIn) return json(route, 401, { code: 'no_authorization', message: 'Pas de session' });
    if (path.endsWith('/logout')) return json(route, 204);
    if (path.endsWith('/user')) return json(route, 200, fakeSession().user);
    return json(route, 200, fakeSession());
  });
  if (signedIn) {
    const session = JSON.stringify(fakeSession());
    await context.addInitScript((value) => {
      try { localStorage.setItem('sb-izzsoitqtzzswkpvdozd-auth-token', value); } catch { /* stockage indisponible */ }
    }, session);
  }
  await context.route('https://izzsoitqtzzswkpvdozd.supabase.co/storage/**', (route) => {
    const name = route.request().url().split('/').pop();
    route.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' }, body: photos[name] ?? photos['photo0.jpg'] });
  });
  await context.route('https://geo.api.gouv.fr/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(communes) }));
  await context.route('https://data.geopf.fr/**', (route) => {
    // Photo aérienne de l'IGN : une tuile unie ; recherche de lieux : aucun résultat.
    if (route.request().url().includes('/wmts?')) {
      return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: tile });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ type: 'FeatureCollection', features: [] }) });
  });
  await context.route('https://tiles.openfreemap.org/planet', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14, vector_layers: [], attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap' }) }));
  await context.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' }));
  // Temps réel (Supabase Realtime, protocole Phoenix 2.0.0) : on accepte les abonnements postgres_changes et
  // on peut envoyer un changement de table, comme le serveur quand une ligne change, ou dire qui est « en ligne » sur
  // le canal de présence d'une conversation (page Messages).
  const sockets = [];
  await context.routeWebSocket(/^wss:\/\/izzsoitqtzzswkpvdozd\.supabase\.co\/realtime\//, (ws) => {
    const socket = { ws, topics: new Map(), joins: new Map(), presence: [] };
    sockets.push(socket);
    ws.onMessage((message) => {
      let frame;
      try { frame = JSON.parse(String(message)); } catch { return; }
      if (!Array.isArray(frame)) return;
      const [joinRef, ref, topic, event, payload] = frame;
      let response = {};
      if (event === 'phx_join') {
        const changes = (payload?.config?.postgres_changes ?? []).map((filter, index) => ({ ...filter, id: sockets.length * 1000 + socket.topics.size * 10 + index }));
        socket.topics.set(topic, changes);
        socket.joins.set(topic, joinRef);
        response = { postgres_changes: changes };
      }
      if (event === 'phx_leave') {
        socket.topics.delete(topic);
        socket.joins.delete(topic);
      }
      if (event === 'presence') socket.presence.push({ topic, payload });
      ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]));
    });
  });
  const followed = () => sockets.flatMap((socket) => [...socket.topics.values()].flat().map((change) => change.table));
  const pushChange = (table) => {
    for (const { ws, topics } of sockets) {
      for (const [topic, changes] of topics) {
        const ids = changes.filter((change) => change.table === table).map((change) => change.id);
        if (!ids.length) continue;
        ws.send(JSON.stringify([null, null, topic, 'postgres_changes', {
          ids, data: { type: 'UPDATE', schema: 'public', table, commit_timestamp: new Date().toISOString(), columns: [], record: {}, old_record: {}, errors: null },
        }]));
      }
    }
  };
  /** Personnes « en ligne » (présence) sur le canal d'une conversation, à toutes les pages qui l'ont rejoint. */
  const pushPresence = (conversationId, userIds) => {
    const topic = `realtime:presence-${conversationId.toLowerCase()}`;
    for (const { ws, joins } of sockets) {
      if (!joins.has(topic)) continue;
      const state = Object.fromEntries(userIds.map((id) => [id.toLowerCase(), { metas: [{ phx_ref: `presence-${id}`, online: true }] }]));
      ws.send(JSON.stringify([joins.get(topic), null, topic, 'presence_state', state]));
    }
  };
  /** Canaux de présence rejoints, et annonces envoyées par les pages (track). */
  const presence = () => ({
    joined: [...new Set(sockets.flatMap((socket) => [...socket.joins.keys()].filter((topic) => topic.startsWith('realtime:presence-'))))],
    tracked: sockets.flatMap((socket) => socket.presence),
  });
  return { state, followed, pushChange, pushPresence, presence, requests };
}

const problems = [];

// MARK: - Ordinateur : vérifications du cadre de l'app (barre d'onglets, pied de page) et de la pastille Messages.

/** Attend une condition du côté du script (données du serveur simulé). */
async function waitFor(condition, what, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  problems.push(`${what} : délai dépassé`);
  return false;
}

/** Largeur du contenu d'un élément, sans ses marges intérieures. */
function contentWidth(page, selector) {
  return page.$eval(selector, (element) => {
    const style = getComputedStyle(element);
    return Math.round(element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
  });
}

/** Liens attendus de l'en-tête de l'ordinateur (version ordinateur, étape 0), dans l'ordre : [adresse, nom]. */
const HEADER_LINKS = [['/', 'Nidalo'], ['/', 'Accueil'], ['/favoris/', 'Favoris'], ['/messages/', 'Messages'], ['/compte/?vue=notifications', 'Notifications'],
  ['/publier/', 'Publier une annonce'], ['/compte/', 'Mon compte']];
/** Pages d'information du pied de page de l'ordinateur (les deux pieds de page). */
const FOOTER_INFORMATION = [['Conditions générales d’utilisation', '/conditions/'], ['Mentions légales', '/mentions-legales/'],
  ['Politique de confidentialité', '/confidentialite/'], ['Aide', '/aide/'], ['Contact', 'mailto:']];
/** Colonnes du grand pied de page (accueil) : [titre, liens]. */
const FOOTER_COLUMNS = [
  ['Annonces', [['Résidentiel', '/recherche/?mode=buy'], ['Location', '/recherche/?mode=rent'], ['Investir', '/recherche/?mode=invest'], ['Hôtels', '/recherche/?mode=hotel']]],
  ['Mon espace', [['Favoris', '/favoris/'], ['Messages', '/messages/'], ['Publier une annonce', '/publier/'], ['Mon compte', '/compte/']]],
  ['Informations', FOOTER_INFORMATION],
];

/**
 * Cadre de l'ordinateur (version ordinateur, étape 0 ; maquettes 01-accueil.html et 08-favoris.html) : ni barre
 * d'onglets ni pied de page du téléphone, rien de l'ancien ordinateur ; l'en-tête blanc collé en haut de la fenêtre, sur
 * toute sa largeur (72 px et son filet), qui y reste quand la page défile ; son contenu sur une ligne, dans le conteneur
 * commun (1200 px au plus, 32 px de marge de chaque côté) : le logo (accueil), Accueil, Favoris et Messages, puis la
 * cloche (Notifications), « Publier une annonce » et « Mon compte » ; l'élément de la page en bleu (aria-current,
 * `current`) ; le pied de page de l'ordinateur au bas de la page, dans le même conteneur (`footer` : 'large' sur
 * l'accueil, 'slim' ailleurs, null sans pied) ; la place de la barre d'onglets rendue ; police Inter, fond de l'app.
 */
async function checkChrome(page, name, { signedIn, current = null, footer = 'slim' }) {
  await page.evaluate(() => document.fonts.ready);
  const info = await page.evaluate(() => {
    const box = (element) => element?.getBoundingClientRect();
    // Bords du contenu d'un conteneur, sans ses marges intérieures.
    const inner = (element) => {
      const style = getComputedStyle(element);
      return [Math.round(box(element).left + parseFloat(style.paddingLeft)), Math.round(box(element).right - parseFloat(style.paddingRight))];
    };
    // Nom d'un lien : son texte à lui (sans pastille ni rond), sinon son aria-label, jusqu'à la virgule.
    const named = (link) => ([...link.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join('').trim()
      || link.getAttribute('aria-label') || '').split(',')[0].trim();
    const header = document.querySelector('header.site-header');
    const row = header?.querySelector('.site-container');
    const links = header ? [...header.querySelectorAll('a')] : [];
    const foot = document.querySelector('footer.site-footer');
    const footRow = foot?.querySelector('.site-container');
    return {
      oldChrome: ['.tabbar', 'footer.footer', '.topbar', '.dtop', '.dfoot'].filter((selector) => document.querySelector(selector)),
      header: header ? [Math.round(box(header).left), Math.round(box(header).width) === document.documentElement.clientWidth, Math.round(box(header).top),
        Math.round(box(header).height), getComputedStyle(header).position, getComputedStyle(header).backgroundColor] : null,
      row: row ? inner(row) : null,
      // Le logo au bord gauche du conteneur, « Mon compte » au bord droit.
      ends: links.length ? [Math.round(box(links[0]).left), Math.round(box(links.at(-1)).right)] : null,
      links: links.map((link) => [link.getAttribute('href'), named(link)]),
      current: links.filter((link) => link.getAttribute('aria-current') === 'page').map((link) => link.getAttribute('href')),
      badges: document.querySelectorAll('.site-header-badge').length,
      font: getComputedStyle(header?.querySelector('.site-header-nav a') ?? document.body).fontFamily,
      interLoaded: document.fonts.check('600 15px "Nidalo Inter"') && [...document.fonts].some((face) => face.family.includes('Nidalo Inter') && face.status === 'loaded'),
      footer: foot && foot.getClientRects().length > 0 ? {
        kind: foot.classList.contains('is-slim') ? 'slim' : 'large', row: footRow ? inner(footRow) : null,
        columns: [...foot.querySelectorAll('.site-footer-column')].map((column) => [column.querySelector('h2')?.textContent ?? null,
          [...column.querySelectorAll('a')].map((link) => [link.textContent.trim(), link.getAttribute('href')])]),
        links: [...foot.querySelectorAll('a')].map((link) => [link.textContent.trim(), link.getAttribute('href')]), text: foot.textContent.replace(/\s+/g, ' '),
        // Au bas de la page, sans place gardée dessous pour une barre d'onglets (mesures exactes : la page peut finir à un
        // demi-pixel).
        atBottom: Math.abs(document.documentElement.getBoundingClientRect().bottom - box(foot).bottom) < 0.5,
      } : null,
      bodyPadding: getComputedStyle(document.body).paddingBottom,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      overflowX: document.documentElement.scrollWidth - innerWidth,
    };
  });
  // L'en-tête reste en haut de la fenêtre quand la page défile (puis la page revient où elle était).
  const sticky = await page.evaluate(async () => {
    const before = window.scrollY;
    const room = document.documentElement.scrollHeight - innerHeight;
    if (room < 50) return 'pas de défilement';
    window.scrollTo({ top: Math.min(400, room), behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const top = document.querySelector('header.site-header')?.getBoundingClientRect().top ?? null;
    window.scrollTo({ top: before, behavior: 'instant' });
    return top;
  });
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  const container = Math.min(width, 1200);
  const edges = [Math.round((width - container) / 2 + 32), Math.round((width + container) / 2 - 32)];
  if (info.oldChrome.length) problems.push(`${name} : ${info.oldChrome.join(', ')} affiché sur ordinateur`);
  expectSame(name, 'en-tête [gauche, pleine largeur, haut, hauteur, position, fond]', info.header, [0, true, 0, 73, 'sticky', 'rgb(255, 255, 255)']);
  if (sticky !== 'pas de défilement' && sticky !== 0) problems.push(`${name} : après défilement, l'en-tête est à ${sticky} px du haut`);
  expectSame(name, 'conteneur de l\'en-tête [gauche, droite] et ses bords [logo, Mon compte]', [info.row, info.ends], [edges, edges]);
  expectSame(name, 'liens de l\'en-tête [adresse, nom]', info.links, HEADER_LINKS);
  expectSame(name, 'élément de la page', info.current, current ? [current] : []);
  if (!signedIn && info.badges) problems.push(`${name} : sans compte, ${info.badges} pastille(s)`);
  if (!info.font.startsWith('"Nidalo Inter"') || !info.interLoaded) problems.push(`${name} : police ${info.font} (Inter chargée : ${info.interLoaded})`);
  if (info.bodyBackground !== 'rgb(250, 249, 246)') problems.push(`${name} : fond ${info.bodyBackground} au lieu de #FAF9F6`);
  if (info.bodyPadding !== '0px') problems.push(`${name} : ${info.bodyPadding} gardés sous la page pour la barre d'onglets`);
  if (info.overflowX > 0) problems.push(`${name} : la page déborde en largeur de ${info.overflowX} px`);
  if (footer === null) {
    if (info.footer) problems.push(`${name} : pied de page affiché`);
    return;
  }
  if (!info.footer) {
    problems.push(`${name} : pas de pied de page`);
    return;
  }
  expectSame(name, 'pied de page [sorte, conteneur, au bas de la page]', [info.footer.kind, info.footer.row, info.footer.atBottom], [footer, edges, true]);
  const links = info.footer.links.map(([text, href]) => [text, href.startsWith('mailto:') ? 'mailto:' : href]);
  if (footer === 'large') {
    expectSame(name, 'colonnes du pied de page', info.footer.columns.map(([title, list]) => [title, list.map(([text, href]) => [text, href.startsWith('mailto:') ? 'mailto:' : href])]), FOOTER_COLUMNS);
    if (!info.footer.text.includes('Les rendements affichés sont des estimations')) problems.push(`${name} : avertissement sur les rendements absent du pied de page`);
  } else expectSame(name, 'liens du pied de page', links, FOOTER_INFORMATION);
  if (!info.footer.text.includes('© 2026 Nidalo')) problems.push(`${name} : « © 2026 Nidalo » absent du pied de page`);
  // Uniquement des liens vers des pages qui existent déjà.
  for (const [, href] of [...info.links.map(([href]) => [null, href]), ...info.footer.links]) {
    if (href.startsWith('mailto:')) continue;
    const path = href.split('?')[0];
    if (!existsSync(join(docs, path, 'index.html'))) problems.push(`${name} : un lien du cadre mène à ${href}, page absente`);
  }
}

/**
 * Écran de connexion de la page (Mon compte, Favoris, Messages, Publier sans compte), comme l'app sur toutes les
 * largeurs : plein écran, sans barre d'onglets, pied de page ni retour du site (ni l'en-tête ni le pied de page de
 * l'ordinateur) ; à partir de 1024 px (maquette 13), l'écran de l'app dans une colonne de 440 px, centrée, le lancement
 * en boucle sur toute sa largeur, la croix ronde de 48 en haut à droite de la fenêtre (28 du haut, 32 du bord).
 */
async function checkSignInScreen(page, name) {
  await page.waitForSelector('.signin-card.is-page .auth-welcome');
  const info = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const shown = (selector) => [...document.querySelectorAll(selector)].some((element) => element.getClientRects().length > 0);
    const screen = box('.signin-card.is-page');
    const column = box('.signin-card.is-page .auth-column');
    return {
      screen: [screen.left, screen.top, screen.width === innerWidth, screen.height === innerHeight, getComputedStyle(document.querySelector('.signin-card.is-page')).position],
      column: [Math.round(column.width), Math.abs(column.left + column.width / 2 - innerWidth / 2) <= 1],
      loop: Math.round(box('.signin-card.is-page .auth-loop-zone').width),
      close: ((el) => (el && el.getClientRects().length > 0 ? ((r) => [Math.round(r.width), Math.round(r.height), Math.round(r.top), Math.round(innerWidth - r.right)])(el.getBoundingClientRect()) : null))(
        document.querySelector('.signin-card.is-page .auth-round.is-close')),
      around: ['.tabbar', 'footer.footer', '.phone-page-head', '.topbar', '.dtop', '.dfoot', '.site-header', 'footer.site-footer'].filter(shown),
      title: document.querySelector('.signin-card.is-page h1')?.textContent ?? null,
    };
  });
  expectSame(name, 'écran de connexion', info, {
    screen: [0, 0, true, true, 'fixed'], column: [440, true], loop: 440, close: [48, 48, 28, 32], around: [], title: 'Votre prochain bien commence ici.',
  });
}

/**
 * Pastille Messages de la barre d'onglets (AppTabBar, n° 44), sous 1024 px = non-lus du serveur simulé (archivées
 * exclues), « 99+ » au-delà de 99, et le libellé de l'app pour les lecteurs d'écran ; à partir de 1024 px, la même dans
 * l'en-tête de l'ordinateur (checkHeaderBadge).
 */
async function checkTabBarBadge(page, state, name) {
  if (await page.evaluate(() => innerWidth >= 1024)) {
    await checkHeaderBadge(page, state, name);
    return;
  }
  const { messages, messagesText } = expectedBadges(state);
  const want = messages ? messagesText : '';
  try {
    await page.waitForFunction((target) => (document.querySelector('.tabbar a[href="/messages/"] .tabbar-badge')?.textContent ?? '') === target, want, { timeout: 8000 });
  } catch {
    const shown = await page.evaluate(() => document.querySelector('.tabbar a[href="/messages/"] .tabbar-badge')?.textContent ?? '');
    problems.push(`${name} : pastille Messages de la barre d'onglets « ${shown} » au lieu de « ${want} »`);
    return;
  }
  const label = await page.getAttribute('.tabbar a[href="/messages/"]', 'aria-label');
  if (label !== (messages ? `Messages, ${messages} non lus` : null)) problems.push(`${name} : libellé de l'onglet Messages « ${label} »`);
  if (!messages) return;
  // Capsule rouge (#E5383B) de 12 à liseré blanc, en haut à droite de l'icône : dans la largeur de l'onglet, sous le haut de
  // la barre (elle dépasse le lien, centré dans la barre, comme la pastille de l'app dépasse l'icône).
  const look = await page.evaluate(() => {
    const badge = document.querySelector('.tabbar a[href="/messages/"] .tabbar-badge');
    const icon = document.querySelector('.tabbar a[href="/messages/"] .icon').getBoundingClientRect();
    const tab = document.querySelector('.tabbar a[href="/messages/"]').getBoundingClientRect();
    const bar = document.querySelector('.tabbar').getBoundingClientRect();
    const box = badge.getBoundingClientRect();
    return {
      color: getComputedStyle(badge).backgroundColor, height: Math.round(box.height),
      rightOfCenter: box.left + box.width / 2 > icon.left + icon.width / 2, aboveCenter: box.top + box.height / 2 < icon.top + icon.height / 2,
      inside: box.left >= tab.left && box.right <= tab.right && box.top >= bar.top,
    };
  });
  expectSame(name, 'pastille de la barre d\'onglets', look, { color: 'rgb(229, 56, 59)', height: 12, rightOfCenter: true, aboveCenter: true, inside: true });
}

/**
 * Pastille Messages de l'en-tête de l'ordinateur (version ordinateur, étape 0) : les non-lus du serveur simulé, comme la
 * barre d'onglets (archivées exclues, « 99+ » au-delà de 99, même libellé pour les lecteurs d'écran) ; capsule rouge de
 * 20 px au chiffre blanc, après « Messages », dans le lien ; pas de barre d'onglets.
 */
async function checkHeaderBadge(page, state, name) {
  const { messages, messagesText } = expectedBadges(state);
  const want = messages ? messagesText : '';
  const link = '.site-header-nav a[href="/messages/"]';
  try {
    await page.waitForFunction(([selector, target]) => (document.querySelector(`${selector} .site-header-badge`)?.textContent ?? '') === target, [link, want], { timeout: 8000 });
  } catch {
    const shown = await page.evaluate((selector) => document.querySelector(`${selector} .site-header-badge`)?.textContent ?? '', link);
    problems.push(`${name} : pastille Messages de l'en-tête « ${shown} » au lieu de « ${want} »`);
    return;
  }
  const label = await page.getAttribute(link, 'aria-label');
  if (label !== (messages ? `Messages, ${messages} non lus` : null)) problems.push(`${name} : libellé du lien Messages de l'en-tête « ${label} »`);
  if (await page.locator('.tabbar').count()) problems.push(`${name} : barre d'onglets sur ordinateur`);
  if (!messages) return;
  const look = await page.evaluate((selector) => {
    const area = document.querySelector(selector);
    const badge = area.querySelector('.site-header-badge');
    const box = badge.getBoundingClientRect();
    const frame = area.getBoundingClientRect();
    const label = [...area.childNodes].find((node) => node.nodeType === 3 && node.textContent.trim());
    const range = document.createRange();
    range.selectNodeContents(label);
    return {
      color: getComputedStyle(badge).backgroundColor, text: getComputedStyle(badge).color, height: Math.round(box.height), hidden: badge.getAttribute('aria-hidden'),
      afterLabel: box.left >= range.getBoundingClientRect().right, inside: box.left >= frame.left && box.right <= frame.right && box.top >= frame.top && box.bottom <= frame.bottom,
    };
  }, link);
  expectSame(name, 'pastille de l\'en-tête', look, { color: 'rgb(192, 57, 43)', text: 'rgb(255, 255, 255)', height: 20, hidden: 'true', afterLabel: true, inside: true });
}

/** Le bouton des filtres finit par donner le nombre d'annonces (« Afficher 2 annonces », « Aucune annonce »). */
async function checkApplyButton(page, name) {
  try {
    await page.waitForFunction(() => /^(Afficher \d[\d\s]* annonces?|Afficher 1 annonce|Aucune annonce)$/
      .test(document.querySelector('dialog[open] .filters-apply .btn')?.textContent?.trim() ?? ''), null, { timeout: 8000 });
  } catch {
    problems.push(`${name} : bouton « ${await page.textContent('dialog[open] .filters-apply .btn')} »`);
  }
}
/** Messages de console attendus pendant une coupure simulée (une demande abandonnée exprès) : pas un problème du site. */
const expectedConsole = new Set();

async function open(context, path, name) {
  const page = await context.newPage();
  page.on('console', (msg) => {
    const text = msg.text();
    // La page 404 répond exprès avec le code 404 : Chrome le signale dans la console, ce n'est pas une erreur du site.
    if (name.startsWith('404') && /status of 404/.test(text)) return;
    if ([...expectedConsole].some((pattern) => pattern.test(text))) return;
    // Écriture refusée exprès par le serveur simulé (`refuse`, ou le trigger des réponses : 400) : Chrome signale aussi
    // le refus dans la console.
    if (/refusé/.test(name) && /status of 40[03]/.test(text)) return;
    if (msg.type() === 'error' || /Content Security Policy/i.test(text)) problems.push(`${name}: ${msg.type()} ${text}`);
  });
  page.on('pageerror', (error) => problems.push(`${name}: erreur ${error.message}`));
  const isPhone = () => (page.viewportSize()?.width ?? 0) < 1024;
  // Sur téléphone, seule la page Messages ouvre le temps réel (demande de Romain du 14 novembre 2026).
  const onMessages = () => { try { return new URL(page.url()).pathname === '/messages/'; } catch { return false; } };
  page.on('websocket', (socket) => { if (isPhone() && !onMessages()) problems.push(`${name}: temps réel ouvert sur téléphone (${socket.url()})`); });
  // Polices : seulement Inter, la police de l'app (400, 500, 600 et 700, Nidalo Inter), sur toutes les largeurs.
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/fonts/') && !/\/fonts\/inter-latin(-ext)?-(400|500|600|700)-normal\.woff2$/.test(url)) problems.push(`${name}: police inattendue (${url})`);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP bloque ${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto(base + path, { waitUntil: 'networkidle' });
  return page;
}

// MARK: - Messages sur ordinateur (maquette 3) : la messagerie de l'app, avec des personnes et des échanges inventés.

/** Heure des pages de la messagerie : vendredi 6 novembre 2026, 10 h 50 à Paris (horloge du navigateur figée). */
const CHAT_NOW = new Date('2026-11-06T09:50:00Z');
const chatId = (n) => `c1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const offerId = (n) => `f1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const messageId = (n) => `d1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGENT_ID = 'a0000000-0000-4000-8000-0000000000e1';
const MARC_ID = 'a0000000-0000-4000-8000-0000000000e2';
const CAMILLE_ID = 'a0000000-0000-4000-8000-0000000000e3';
const LUCAS_ID = 'a0000000-0000-4000-8000-0000000000e4';
const PRO_ID = 'a0000000-0000-4000-8000-0000000000e5';
const NINA_ID = 'a0000000-0000-4000-8000-0000000000e6';
/** Numéro du compte trouvé par « Nouveau contact » (plage de la fiction). */
const NINA_PHONE = '0639985678';
/** Identifiant écrit comme Swift l'envoie (`uuidString`). */
const UPPER_UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/;
const sameChatId = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
/** Tables et fonctions de la messagerie : jamais demandées sans compte ; sur téléphone, seulement par la page Messages. */
const CHAT_TABLES = [
  'rpc/my_conversations', 'conversation_participants', 'rpc/public_profiles', 'rpc/my_communities', 'rpc/professional_contacts', 'user_blocks',
  'messages', 'rpc/mark_conversation_read', 'message_reactions', 'conversation_preferences', 'reports', 'rpc/find_account_by_phone',
  'rpc/start_phone_conversation', 'rpc/start_direct_conversation', 'rpc/my_offers', 'rpc/make_offer', 'rpc/accept_offer', 'rpc/decline_offer',
  'rpc/withdraw_offer', 'rpc/counter_offer', 'agenda_visits', 'rpc/my_visit_requests', 'rpc/start_listing_conversation',
  'rpc/accept_visit_request', 'rpc/propose_visit_slots', 'listing_lots',
  // Groupes et communautés (étape 4b) : les fonctions que l'app appelle, avec ses paramètres.
  'rpc/create_group', 'rpc/update_group_info', 'rpc/add_group_members', 'rpc/remove_group_member', 'rpc/set_group_role',
  'rpc/transfer_group_ownership', 'rpc/leave_conversation', 'rpc/set_ephemeral', 'rpc/create_community', 'rpc/add_community_members',
  'rpc/remove_community_member', 'rpc/set_community_role', 'rpc/update_community_info', 'rpc/leave_community', 'rpc/my_community_invites',
  'rpc/create_community_invite', 'rpc/revoke_community_invite', 'rpc/pending_community_join_requests', 'rpc/decide_community_join_request',
];
const chatProfile = (userId, publicName, fields = {}) => ({
  user_id: userId, public_name: publicName, avatar_path: null, account_type: 'individual', member_since: '2026-01-15', agency_id: null,
  agency_name: null, agency_logo_path: null, agency_postal_code: null, agency_city: null, agency_phone: null, ...fields,
});
/** Profils publics (public_profiles) : une agence avec son numéro publié, des particuliers sans numéro. */
const CHAT_PROFILES = [
  chatProfile(AGENT_ID, 'Sophie D.', {
    account_type: 'professional', member_since: '2025-03-01', agency_id: 'b1000000-0000-4000-8000-000000000001', agency_name: 'Agence Démo Lyon',
    agency_postal_code: '69002', agency_city: 'Lyon 2e', agency_phone: '06 39 98 12 00',
  }),
  chatProfile(OTHER_ID, 'Julien M.'), chatProfile(MARC_ID, 'Marc P.'), chatProfile(CAMILLE_ID, 'Camille R.'), chatProfile(LUCAS_ID, 'Lucas G.'),
  chatProfile(NINA_ID, 'Nina L.'), chatProfile(USER_ID, 'Claire M.', { member_since: '2026-10-01' }),
  chatProfile(PRO_ID, 'Paul D.', {
    account_type: 'professional', member_since: '2024-06-01', agency_id: 'b1000000-0000-4000-8000-000000000002', agency_name: 'Immo Démo Croix-Rousse',
    agency_postal_code: '69004', agency_city: 'Lyon 4e', agency_phone: '06 39 98 77 00',
  }),
];
/** Agence qui publie, pas encore contactée (professional_contacts). */
const PRO_CONTACTS = [{
  user_id: PRO_ID, agency_id: 'b1000000-0000-4000-8000-000000000002', agency_name: 'Immo Démo Croix-Rousse', agency_logo_path: null,
  agency_postal_code: '69004', agency_city: 'Lyon 4e', agency_is_verified: true,
}];
/** Photos envoyées par l'agence et document envoyé par le compte (bucket message-attachments). */
const AGENT_PHOTOS = [`${chatId(1)}/7A1C2E3F-4B5D-4E6F-8A9B-0C1D2E3F4A51.jpg`, `${chatId(1)}/7A1C2E3F-4B5D-4E6F-8A9B-0C1D2E3F4A52.jpg`];
const LOAN_PDF = `${chatId(1)}/7A1C2E3F-4B5D-4E6F-8A9B-0C1D2E3F4A53.pdf`;
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const chatText = (value) => ({ text: { _0: value } });

/** Ce que le serveur sait du compte de test : six conversations (annonce, groupe, archivée, sans message, compte supprimé). */
function chatState() {
  const conversation = (n, fields) => ({ id: chatId(n), kind: 'listing', listing: null, buyer: USER_ID, seller: null, other: null, name: null, unread: 0, ...fields });
  const participant = (conversationId, userId, role, lastReadAt) => ({ conversation_id: conversationId, user_id: userId, role, left_at: null, last_read_at: lastReadAt });
  const message = (n, conversationId, senderId, createdAt, content, preview) => ({
    id: messageId(n), conversation_id: conversationId, sender_id: senderId, kind: Object.keys(content)[0], client_id: messageId(n), content,
    created_at: createdAt, expires_at: null, message_reactions: [], preview: preview ?? content.text?._0 ?? content.system?._0 ?? '',
  });
  const photo = (end, path) => ({ id: `0B6D1F2A-3C4E-4F5A-9B6C-7D8E9F0A1B${end}`, kind: 'photo', fileName: 'Photo.jpg', storagePath: path, byteCount: 182000 });
  return {
    conversations: [
      // A : l'agence, sur un appartement à vendre ; visite confirmée jeudi, offre en attente.
      conversation(1, { listing: homeId(1), seller: AGENT_ID, other: AGENT_ID, created_at: '2026-11-05T16:55:00Z', unread: 1 }),
      // B : le compte vend, un acheteur fait une offre (favori).
      conversation(2, { listing: homeId(7), buyer: OTHER_ID, seller: USER_ID, other: OTHER_ID, created_at: '2026-11-04T18:00:00Z', unread: 2 }),
      // C : archivée, avec des non-lus (hors de la pastille).
      conversation(3, { listing: homeId(3), seller: MARC_ID, other: MARC_ID, created_at: '2026-11-01T09:00:00Z', unread: 2 }),
      // D : groupe en sourdine.
      conversation(4, { kind: 'group', buyer: null, name: 'Visite groupée Lyon 2e', created_at: '2026-11-05T16:30:00Z', unread: 3 }),
      // E : ouverte depuis une annonce, aucun message encore.
      conversation(5, { listing: homeId(5), seller: LUCAS_ID, other: LUCAS_ID, created_at: '2026-11-03T15:00:00Z' }),
      // F : l'autre compte a été supprimé.
      conversation(6, { listing: homeId(4), created_at: '2026-10-27T12:55:00Z' }),
    ],
    messages: [
      message(1, chatId(1), AGENT_ID, '2026-11-05T17:02:00Z', chatText('Bonjour Claire, merci pour votre intérêt. Voici quelques photos du séjour et de la salle à manger.')),
      message(2, chatId(1), AGENT_ID, '2026-11-05T17:03:00Z', { attachments: { _0: [photo('01', AGENT_PHOTOS[0]), photo('02', AGENT_PHOTOS[1])] } }, '📷 2 photos'),
      message(3, chatId(1), USER_ID, '2026-11-05T17:20:00Z', chatText('Bonjour, oui avec plaisir ! Je suis disponible jeudi en fin de journée.')),
      message(4, chatId(1), AGENT_ID, '2026-11-06T08:58:00Z', chatText('Parfait, je vous confirme la visite pour jeudi à 18h.')),
      message(5, chatId(1), USER_ID, '2026-11-06T09:30:00Z', {
        attachments: { _0: [{ id: '0B6D1F2A-3C4E-4F5A-9B6C-7D8E9F0A1B03', kind: 'document', fileName: 'Simulation_pret.pdf', storagePath: LOAN_PDF, byteCount: 245000, category: 'incomeProof' }] },
      }, '📎 Simulation_pret.pdf'),
      message(6, chatId(1), USER_ID, '2026-11-06T09:38:00Z', { offer: { offerId: offerId(1) } }, '💶 Offre'),
      message(7, chatId(1), AGENT_ID, '2026-11-06T09:45:00Z', chatText('Bien reçu, je transmets votre offre au propriétaire.')),
      message(11, chatId(2), OTHER_ID, '2026-11-04T18:05:00Z', chatText('Bonjour, l\'appartement est-il toujours disponible ?')),
      message(12, chatId(2), USER_ID, '2026-11-04T18:40:00Z', chatText('Bonjour Julien, oui, il est toujours disponible.')),
      message(13, chatId(2), OTHER_ID, '2026-11-05T19:10:00Z', { offer: { offerId: offerId(2) } }, '💶 Offre'),
      message(14, chatId(2), OTHER_ID, '2026-11-05T19:15:00Z', chatText('Je peux signer rapidement si l\'offre vous convient.')),
      message(21, chatId(3), MARC_ID, '2026-11-02T09:58:00Z', chatText('Bonjour, la maison est toujours en vente.')),
      message(22, chatId(3), MARC_ID, '2026-11-02T10:00:00Z', chatText('Les diagnostics sont disponibles sur demande.')),
      message(31, chatId(4), null, '2026-11-05T16:30:00Z', { system: { _0: 'Claire M. a créé le groupe « Visite groupée Lyon 2e »' } }),
      message(32, chatId(4), CAMILLE_ID, '2026-11-06T07:40:00Z', chatText('Bonjour à tous ! Je serai là samedi à 10h.')),
      message(33, chatId(4), AGENT_ID, '2026-11-06T07:55:00Z', chatText('Parfait, rendez-vous devant l\'immeuble.')),
      message(34, chatId(4), CAMILLE_ID, '2026-11-06T08:12:00Z', chatText('Merci, à samedi !')),
      message(51, chatId(6), null, '2026-10-27T13:00:00Z', chatText('Bonjour, le studio est toujours disponible.')),
      message(52, chatId(6), USER_ID, '2026-10-27T13:20:00Z', chatText('Merci, je reviens vers vous rapidement.')),
    ],
    participants: [
      participant(chatId(1), USER_ID, 'member', '2026-11-06T09:38:00Z'), participant(chatId(1), AGENT_ID, 'member', '2026-11-06T09:45:00Z'),
      participant(chatId(2), USER_ID, 'member', '2026-11-04T18:40:00Z'), participant(chatId(2), OTHER_ID, 'member', '2026-11-04T18:45:00Z'),
      participant(chatId(3), USER_ID, 'member', '2026-11-01T09:00:00Z'), participant(chatId(3), MARC_ID, 'member', '2026-11-02T10:00:00Z'),
      participant(chatId(4), USER_ID, 'owner', '2026-11-05T16:30:00Z'), participant(chatId(4), CAMILLE_ID, 'member', '2026-11-06T08:12:00Z'),
      participant(chatId(4), AGENT_ID, 'admin', '2026-11-06T07:55:00Z'),
      participant(chatId(5), USER_ID, 'member', null), participant(chatId(5), LUCAS_ID, 'member', null),
      participant(chatId(6), USER_ID, 'member', '2026-10-27T13:20:00Z'),
    ],
    offers: [
      {
        id: offerId(1), conversation_id: chatId(1), listing_id: homeId(1), buyer_id: USER_ID, seller_id: AGENT_ID, author_id: USER_ID, parent_offer_id: null,
        amount: 228000, conditions: 'Sous réserve d\'obtention du prêt', status: 'pending', created_at: '2026-11-06T09:38:00Z', expires_at: '2026-11-13T09:38:00Z',
        responded_at: null, decline_reason: null,
      },
      {
        id: offerId(2), conversation_id: chatId(2), listing_id: homeId(7), buyer_id: OTHER_ID, seller_id: USER_ID, author_id: OTHER_ID, parent_offer_id: null,
        amount: 255000, conditions: null, status: 'pending', created_at: '2026-11-05T19:10:00Z', expires_at: '2026-11-12T19:10:00Z', responded_at: null, decline_reason: null,
      },
    ],
    agenda: [{
      id: 'e1000000-0000-4000-8000-000000000001', start_at: '2026-11-12T17:00:00Z', status: 'confirmed', request_id: 'e2000000-0000-4000-8000-000000000001',
      listing_id: homeId(1), visit: {
        id: 'e1000000-0000-4000-8000-000000000001', conversationId: chatId(1),
        listing: { listingId: homeId(1), title: 'Appartement 3 pièces', price: 238000, transaction: 'sale', city: 'Lyon 2e' },
        start: '2026-11-12T17:00:00Z', durationMinutes: 60, status: 'confirmed', contactName: 'Agence Démo Lyon', address: '12 rue de l\'Exemple, 69002 Lyon',
      },
    }],
    // Demandes de visite (my_visit_requests) : A, la visite confirmée de jeudi (demandée par le compte) ; B, Julien
    // demande samedi 10 h ou dimanche 14 h (le compte peut accepter un créneau ou en proposer un autre).
    visitRequests: [
      chatVisitRow(1, {
        listing: homeId(1), title: 'Appartement 3 pièces', requester: { userId: USER_ID, name: 'Claire M.', kind: 'individual' },
        recipient: { userId: AGENT_ID, name: 'Agence Démo Lyon', kind: 'agency', agencyId: 'b1000000-0000-4000-8000-000000000001' },
        slots: [visitSlot(1, '2026-11-12T17:00:00Z')], status: 'accepted', acceptedSlot: visitSlot(1, '2026-11-12T17:00:00Z'), createdAt: '2026-11-05T17:25:00Z',
      }),
      chatVisitRow(2, {
        listing: homeId(7), title: 'Appartement 2 pièces', requester: { userId: OTHER_ID, name: 'Julien M.', kind: 'individual' },
        recipient: { userId: USER_ID, name: 'Claire M.', kind: 'individual' },
        slots: [visitSlot(2, '2026-11-07T09:00:00Z'), visitSlot(3, '2026-11-08T13:00:00Z')], status: 'pending', createdAt: '2026-11-05T19:20:00Z',
      }),
    ],
    /** Lots des annonces (listing_lots) : l'appartement de B en a trois, dont deux loués. */
    lots: { [homeId(7)]: ['leased', 'leased', 'vacant'] },
    /** Réponses retardées (ms) par table, pour voir les états de chargement. */
    slow: {},
    preferences: { [chatId(2)]: { is_favorite: true }, [chatId(3)]: { is_archived: true }, [chatId(4)]: { muted_until: '4001-01-01T00:00:00+00:00' } },
    blocks: [],
    reports: [],
    /** Communautés du compte (my_communities), liens d'invitation et demandes pour entrer (étape 4b). */
    communities: [],
    invites: [],
    joinRequests: [],
    files: new Map([[AGENT_PHOTOS[0], { type: 'image/jpeg', body: photos['photo1.jpg'] }], [AGENT_PHOTOS[1], { type: 'image/jpeg', body: photos['photo2.jpg'] }],
      [LOAN_PDF, { type: 'application/pdf', body: PDF_BYTES }]]),
    /** Demandes reçues (tables et fonctions), URL signées demandées et fichiers envoyés. */
    calls: [],
    signs: [],
    uploads: [],
    /** Fichiers effacés du bucket (remove de supabase-js). */
    removed: [],
    tick: 0,
  };
}

/** Discussion principale d'une communauté : son identifiant, dernier octet inversé avec 0x5A (Community.mainConversationId). */
function chatMainConversationId(communityId) {
  const hex = communityId.replace(/-/g, '').toLowerCase();
  const bytes = `${hex.slice(0, 30)}${(parseInt(hex.slice(30), 16) ^ 0x5a).toString(16).padStart(2, '0')}`;
  return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-${bytes.slice(12, 16)}-${bytes.slice(16, 20)}-${bytes.slice(20)}`;
}
const COMMUNITY_ID = 'c4000000-0000-4000-8000-000000000001';
const COMMUNITY_CHAT = chatMainConversationId(COMMUNITY_ID);

/**
 * Étape 4b : une communauté de quartier créée par Camille, dont le compte est administrateur (my_communities), sa
 * discussion principale et une demande pour entrer (Nina L.) ; le groupe D reçoit une description et un type.
 */
function addChatCommunity(chat) {
  const created = '2026-10-12T09:00:00Z';
  chat.conversations.push({ id: COMMUNITY_CHAT, kind: 'group', listing: null, buyer: null, seller: null, other: null, name: 'Voisins de la Croix-Rousse', unread: 0, created_at: created, createdBy: CAMILLE_ID });
  const members = [[CAMILLE_ID, 'owner'], [USER_ID, 'admin'], [MARC_ID, 'member'], [LUCAS_ID, 'member']];
  for (const [userId, role] of members) chat.participants.push({ conversation_id: COMMUNITY_CHAT, user_id: userId, role, left_at: null, last_read_at: '2026-11-04T18:00:00Z' });
  chat.messages.push(
    { id: messageId(61), conversation_id: COMMUNITY_CHAT, sender_id: null, kind: 'system', client_id: messageId(61), content: { system: { _0: 'Camille R. a créé la communauté « Voisins de la Croix-Rousse »' } }, created_at: created, expires_at: null, message_reactions: [], preview: 'Camille R. a créé la communauté « Voisins de la Croix-Rousse »' },
    { id: messageId(62), conversation_id: COMMUNITY_CHAT, sender_id: CAMILLE_ID, kind: 'text', client_id: messageId(62), content: chatText('Bienvenue à tous ! Présentez-vous en quelques mots.'), created_at: '2026-11-04T17:40:00Z', expires_at: null, message_reactions: [], preview: 'Bienvenue à tous ! Présentez-vous en quelques mots.' },
  );
  chat.communities.push({
    id: COMMUNITY_ID, main_conversation_id: COMMUNITY_CHAT, name: 'Voisins de la Croix-Rousse',
    details: 'Entraide entre propriétaires et locataires du quartier : travaux, copropriété et bonnes adresses.', category: 'residential', area: 'Lyon 4e',
    visibility: 'private', cover: 'sky', image_path: null, created_by: CAMILLE_ID, created_at: created,
    members: members.map(([user_id, role]) => ({ user_id, role, joined_at: created })),
  });
  chat.joinRequests.push({ id: 'e5000000-0000-4000-8000-000000000001', community_id: COMMUNITY_ID, user_id: NINA_ID, status: 'pending', created_at: '2026-11-05T20:00:00Z' });
  Object.assign(chat.conversations.find((item) => item.id === chatId(4)), { details: 'Visite de l\'appartement 3 pièces samedi à 10 h, puis point sur nos dossiers.', purpose: 'project' });
}

const visitRequestId = (n) => `e2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const visitSlotId = (n) => `f3000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const visitSlot = (n, start) => ({ id: visitSlotId(n), start, durationMinutes: 60 });

/** Demande de visite telle que le serveur la garde (colonnes de my_visit_requests, sans le rôle du compte). */
function chatVisitRow(n, { listing, title, requester, recipient, slots, status, acceptedSlot = null, createdAt }) {
  return {
    id: visitRequestId(n), listing_id: listing, listing_snapshot: { listingId: listing, title }, requester, recipient, slots, mode: 'onSite',
    meeting_place: null, status, accepted_slot: acceptedSlot, proposed_slots: null, proposed_by: null, created_at: createdAt, updated_at: createdAt,
  };
}

/** Actions permises au compte sur une demande (private.visit_allowed_actions du serveur). */
function visitActions(request, role) {
  switch (request.status) {
    case 'pending': return role === 'recipient' ? ['accept', 'decline', 'propose'] : ['cancel'];
    case 'counterProposed': {
      const actions = request.proposed_by !== role ? ['accept', 'decline'] : [];
      if (role === 'recipient' && !request.accepted_slot && request.proposed_by === 'recipient') actions.push('propose');
      if (role === 'requester' || request.accepted_slot) actions.push('cancel');
      return actions;
    }
    case 'accepted': return ['propose', 'cancel'];
    default: return [];
  }
}

/** Ligne de my_visit_requests : la demande, le rôle du compte et ce qu'il peut faire. */
function chatVisitRequest(request) {
  const role = sameChatId(request.requester.userId, USER_ID) ? 'requester' : 'recipient';
  return { ...request, my_role: role, allowed_actions: visitActions(request, role) };
}

/** Heure du serveur simulé : une seconde de plus à chaque écriture, après l'heure figée des pages. */
function chatClock(chat) {
  chat.tick += 1;
  return new Date(CHAT_NOW.getTime() + chat.tick * 1000).toISOString();
}

const MESSAGE_KEYS = ['id', 'conversation_id', 'sender_id', 'kind', 'client_id', 'content', 'created_at', 'expires_at', 'reply_to_id', 'forwarded', 'message_reactions'];
/** Colonnes rendues d'un message ; reply_to_id et forwarded valent null et false par défaut, comme la table. */
const messageColumns = (row) => Object.fromEntries(MESSAGE_KEYS.map((key) => [key, key === 'reply_to_id' ? row[key] ?? null : key === 'forwarded' ? row[key] ?? false : row[key]]));
/** Contenus qu'un transfert accepte (trigger messages_reply_forward_check). */
const FORWARDABLE_KEYS = ['text', 'image', 'photos', 'file', 'attachments'];

/** Lignes de my_conversations, comme la fonction du serveur : dernier message, non-lus, réglages, lectures ; la plus récente d'abord. */
function chatRows(chat) {
  const rows = chat.conversations.map((conversation) => {
    const settings = { is_archived: false, is_favorite: false, muted_until: null, saves_photos: false, cleared_at: null, ...chat.preferences[conversation.id] };
    const messages = chat.messages.filter((item) => sameChatId(item.conversation_id, conversation.id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const last = messages.at(-1) ?? null;
    const members = chat.participants.filter((item) => sameChatId(item.conversation_id, conversation.id) && item.left_at === null);
    // Ma ligne, même une fois le groupe quitté (left_at : « Vous avez quitté le groupe »).
    const mine = chat.participants.find((item) => sameChatId(item.conversation_id, conversation.id) && sameChatId(item.user_id, USER_ID));
    const other = conversation.other ? members.find((item) => sameChatId(item.user_id, conversation.other)) : null;
    // Annonces de l'accueil, ou des annonces de test (une location, pour « Discussions liées aux annonces »).
    const listing = [...HOME_LISTINGS, ...listings].find((row) => row.id === conversation.listing) ?? null;
    return {
      conversation_id: conversation.id, kind: conversation.kind, listing_id: listing?.id ?? null,
      listing_snapshot: listing ? {
        listingId: listing.id, title: listing.title, price: listing.price, transaction: listing.transaction, city: listing.city,
        coverPath: listing.listing_photos[0]?.storage_path ?? null,
      } : null,
      buyer_id: conversation.buyer, seller_id: conversation.seller, group_name: conversation.name, group_details: conversation.details ?? null,
      group_image_path: conversation.image ?? null, group_purpose: conversation.purpose ?? null, ephemeral_seconds: conversation.ephemeral ?? null,
      created_by: conversation.createdBy ?? USER_ID, created_at: conversation.created_at, my_role: mine?.role ?? 'member',
      joined_at: conversation.created_at, left_at: mine?.left_at ?? null, last_read_at: mine?.last_read_at ?? null, ...settings, other_user_id: conversation.other,
      other_last_read_at: other?.last_read_at ?? null, member_count: members.length, unread_count: conversation.unread,
      last_message_id: last?.id ?? null, last_message_sender_id: last?.sender_id ?? null, last_message_kind: last?.kind ?? null,
      last_message_content: last?.content ?? null, last_message_preview: last?.preview ?? null, last_message_at: last?.created_at ?? null,
    };
  });
  // Masquée (hidden_at, « Supprimer le groupe ») : absente de la liste jusqu'à un nouveau message.
  return rows.filter((row) => !row.hidden_at || (row.last_message_at ?? '') > row.hidden_at)
    .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at));
}

/** Offre telle que my_offers la rend (OfferServerRow) : rôle, auteur et actions permises selon le compte. */
function chatOffer(offer) {
  const listing = HOME_LISTINGS.find((row) => row.id === offer.listing_id);
  const mine = sameChatId(offer.author_id, USER_ID);
  return {
    ...offer,
    listing_snapshot: listing ? { listingId: listing.id, title: listing.title, price: listing.price, transaction: listing.transaction, city: listing.city } : null,
    my_role: sameChatId(offer.buyer_id, USER_ID) ? 'buyer' : 'seller', is_mine: mine,
    allowed_actions: offer.status !== 'pending' ? [] : mine ? ['withdraw'] : ['accept', 'decline', 'counter'],
  };
}

/** Filtres PostgREST de la messagerie (`eq.`, `in.(…)`), sans tenir compte de la casse des identifiants, comme le serveur. */
function chatFiltered(rows, params) {
  let result = rows;
  for (const [column, value] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(column)) continue;
    if (value.startsWith('eq.')) result = result.filter((row) => sameChatId(row[column], value.slice(3)));
    // Page plus ancienne (n° 19) : created_at=lt.<date>, comparée comme une date, comme PostgreSQL.
    else if (value.startsWith('lt.')) result = result.filter((row) => Date.parse(row[column]) < Date.parse(value.slice(3)));
    else if (value.startsWith('in.(') && value.endsWith(')')) {
      const allowed = value.slice(4, -1).split(',').map((item) => item.replace(/^"|"$/g, '').toLowerCase());
      result = result.filter((row) => allowed.includes(String(row[column]).toLowerCase()));
    }
  }
  return result;
}

/** Parties d'un corps multipart/form-data : nom, nom de fichier, type et octets. */
function multipartParts(buffer, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType ?? '');
  if (!buffer || !boundary) return [];
  const marker = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  const parts = [];
  let start = buffer.indexOf(marker);
  while (start !== -1) {
    const next = buffer.indexOf(marker, start + marker.length);
    if (next === -1) break;
    const chunk = buffer.subarray(start + marker.length + 2, next - 2);
    const split = chunk.indexOf('\r\n\r\n');
    if (split !== -1) {
      const head = chunk.subarray(0, split).toString('utf8');
      parts.push({
        name: /name="([^"]*)"/.exec(head)?.[1] ?? null, filename: /filename="([^"]*)"/.exec(head)?.[1] ?? null,
        type: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? null, body: chunk.subarray(split + 4),
      });
    }
    start = next;
  }
  return parts;
}

/** Réponses du serveur simulé pour la messagerie, comme ses tables et ses fonctions. */
function chatRespond(chat, reply, { table, method, params, body, single }) {
  const refuse = (message) => reply(400, { code: 'P0001', message, details: null, hint: null });
  const findConversation = (id) => chat.conversations.find((item) => sameChatId(item.id, id));
  const addMessage = (conversationId, senderId, content, preview) => {
    const id = crypto.randomUUID();
    const row = {
      id, conversation_id: conversationId, sender_id: senderId, kind: Object.keys(content)[0], client_id: id, content, created_at: chatClock(chat),
      expires_at: null, message_reactions: [], preview,
    };
    chat.messages.push(row);
    return row;
  };
  const answer = (offer, change) => {
    if (!offer) return refuse('Cette offre n\'existe plus.');
    Object.assign(offer, { responded_at: chatClock(chat), ...change });
    return reply(200, [chatOffer(offer)]);
  };
  const participantOf = (conversationId, userId) => chat.participants.find((item) => sameChatId(item.conversation_id, conversationId) && sameChatId(item.user_id, userId));
  /** Membre ajouté, ou de retour (left_at effacé). */
  const join = (conversationId, userId, role) => {
    const found = participantOf(conversationId, userId);
    if (found) Object.assign(found, { role, left_at: null });
    else chat.participants.push({ conversation_id: String(conversationId).toLowerCase(), user_id: String(userId).toLowerCase(), role, left_at: null, last_read_at: null });
  };
  /** Créateur et administrateurs encore membres. */
  const manages = (conversationId) => {
    const mine = participantOf(conversationId, USER_ID);
    return !!mine && mine.left_at === null && ['owner', 'admin'].includes(mine.role);
  };
  const direct = (otherId, n) => {
    let conversation = chat.conversations.find((item) => item.kind === 'direct' && sameChatId(item.other, otherId));
    if (!conversation) {
      conversation = { id: chatId(n), kind: 'direct', listing: null, buyer: USER_ID, seller: otherId, other: otherId, name: null, unread: 0, created_at: chatClock(chat) };
      chat.conversations.push(conversation);
      for (const userId of [USER_ID, otherId]) chat.participants.push({ conversation_id: conversation.id, user_id: userId, role: 'member', left_at: null, last_read_at: null });
    }
    return reply(200, conversation.id);
  };
  switch (table) {
    case 'rpc/my_conversations': {
      const rows = chatRows(chat);
      return reply(200, body?.p_conversation_id ? rows.filter((row) => sameChatId(row.conversation_id, body.p_conversation_id)) : rows);
    }
    case 'conversation_participants':
      return reply(200, chatFiltered(chat.participants, params));
    case 'rpc/public_profiles': {
      const ids = (body?.user_ids ?? []).map((id) => String(id).toLowerCase());
      return reply(200, CHAT_PROFILES.filter((row) => ids.includes(row.user_id)));
    }
    case 'rpc/professional_contacts':
      return reply(200, PRO_CONTACTS);
    case 'user_blocks':
      if (method === 'POST') {
        if (!chat.blocks.some((id) => sameChatId(id, body?.blocked_id))) chat.blocks.push(String(body?.blocked_id).toLowerCase());
        return reply(201);
      }
      if (method === 'DELETE') {
        const blocked = params.get('blocked_id')?.slice(3);
        chat.blocks = chat.blocks.filter((id) => !sameChatId(id, blocked));
        return reply(204);
      }
      return reply(200, chat.blocks.map((id) => ({ blocked_id: id })));
    case 'messages': {
      if (method === 'POST') {
        // Trigger messages_reply_forward_check : l'original d'une réponse doit être un message de membre de la même
        // conversation, pas expiré ; un transfert n'accepte que le texte, les photos, les documents et les vocaux.
        if (body.reply_to_id != null) {
          const original = chat.messages.find((item) => sameChatId(item.id, body.reply_to_id));
          const usable = original && sameChatId(original.conversation_id, body.conversation_id) && original.kind !== 'system'
            && (!original.expires_at || new Date(original.expires_at) > new Date(chatClock(chat)));
          if (!usable) return reply(400, { code: 'P0001', message: 'Le message auquel vous répondez n\'est plus disponible.', details: null, hint: 'message_reply_unavailable' });
        }
        if (body.forwarded === true && !FORWARDABLE_KEYS.includes(Object.keys(body.content ?? {})[0])) {
          return reply(400, { code: 'P0001', message: 'Ce message ne peut pas être transféré.', details: null, hint: 'message_forward_invalid' });
        }
        // Même identifiant qu'un message déjà enregistré (renvoi d'un envoi dont la réponse s'est perdue, n° 99) : la clé
        // primaire refuse (23505), le site relit le message déjà là.
        if (chat.messages.some((item) => sameChatId(item.id, body.id))) {
          return reply(409, { code: '23505', message: 'duplicate key value violates unique constraint "messages_pkey"', details: null, hint: null });
        }
        // L'expéditeur et l'heure viennent du serveur ; les identifiants reviennent en minuscules (type uuid).
        const row = {
          id: String(body.id).toLowerCase(), conversation_id: String(body.conversation_id).toLowerCase(), sender_id: USER_ID,
          kind: Object.keys(body.content ?? {})[0] ?? 'text', client_id: String(body.client_id).toLowerCase(), content: body.content,
          created_at: chatClock(chat), expires_at: null, message_reactions: [], preview: body.preview,
          reply_to_id: body.reply_to_id != null ? String(body.reply_to_id).toLowerCase() : null, forwarded: body.forwarded === true,
        };
        chat.messages.push(row);
        return reply(201, single ? messageColumns(row) : [messageColumns(row)]);
      }
      if (method === 'DELETE') {
        // Règle du serveur : seul l'expéditeur supprime son message ; les lignes supprimées reviennent (select=id).
        const gone = chatFiltered(chat.messages, params).filter((item) => sameChatId(item.sender_id, USER_ID));
        chat.messages = chat.messages.filter((item) => !gone.includes(item));
        return reply(200, gone.map((item) => ({ id: item.id })));
      }
      const rows = chatFiltered(chat.messages, params).sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, Number(params.get('limit') ?? 1000)).map(messageColumns);
      if (single) return rows.length === 1 ? reply(200, rows[0]) : reply(406, { code: 'PGRST116', message: 'no rows' });
      return reply(200, rows);
    }
    case 'rpc/mark_conversation_read': {
      const conversation = findConversation(body?.p_conversation_id);
      if (conversation) {
        conversation.unread = 0;
        const mine = chat.participants.find((item) => sameChatId(item.conversation_id, conversation.id) && sameChatId(item.user_id, USER_ID));
        if (mine) mine.last_read_at = chatClock(chat);
      }
      return reply(204);
    }
    case 'message_reactions': {
      const message = chat.messages.find((item) => sameChatId(item.id, method === 'POST' ? body?.message_id : params.get('message_id')?.slice(3)));
      if (method === 'POST') {
        if (message) message.message_reactions = [...message.message_reactions.filter((item) => !sameChatId(item.user_id, USER_ID)), { user_id: USER_ID, emoji: body.emoji, created_at: chatClock(chat) }];
        return reply(201);
      }
      if (method === 'DELETE') {
        if (message) message.message_reactions = message.message_reactions.filter((item) => !sameChatId(item.user_id, params.get('user_id')?.slice(3)));
        return reply(204);
      }
      return reply(200, []);
    }
    case 'conversation_preferences': {
      if (method !== 'POST') return reply(200, []);
      const { conversation_id: id, ...settings } = body ?? {};
      const key = String(id).toLowerCase();
      chat.preferences[key] = { ...chat.preferences[key], ...settings };
      return reply(201);
    }
    case 'reports':
      chat.reports.push(body);
      return reply(201);
    case 'rpc/find_account_by_phone':
      return reply(200, body?.p_phone === NINA_PHONE
        ? [{ user_id: NINA_ID, public_name: 'Nina L.', avatar_path: null, account_type: 'individual', agency_name: null, agency_city: null }] : []);
    case 'rpc/start_phone_conversation':
      return body?.p_phone === NINA_PHONE ? direct(NINA_ID, 7) : refuse('Aucun compte NIDALO avec ce numéro.');
    case 'rpc/start_direct_conversation':
      return sameChatId(body?.p_user_id, PRO_ID) ? direct(PRO_ID, 8) : refuse('Ce compte ne peut pas être contacté.');
    case 'rpc/my_offers':
      return reply(200, chat.offers.map(chatOffer));
    case 'rpc/make_offer': {
      // Comme la fonction du serveur : l'offre est enregistrée et sa bulle écrite dans la conversation.
      const conversation = findConversation(body?.p_conversation_id);
      if (!conversation) return refuse('Conversation introuvable.');
      const offer = {
        id: String(body.p_id).toLowerCase(), conversation_id: conversation.id, listing_id: conversation.listing, buyer_id: USER_ID, seller_id: conversation.seller,
        author_id: USER_ID, parent_offer_id: null, amount: body.p_amount, conditions: body.p_conditions ?? null, status: 'pending', created_at: chatClock(chat),
        expires_at: body.p_expires_at ?? new Date(CHAT_NOW.getTime() + 7 * 86_400_000).toISOString(), responded_at: null, decline_reason: null,
      };
      chat.offers.push(offer);
      addMessage(conversation.id, USER_ID, { offer: { offerId: offer.id } }, '💶 Offre');
      return reply(200, [chatOffer(offer)]);
    }
    case 'rpc/counter_offer': {
      const parent = chat.offers.find((item) => sameChatId(item.id, body?.p_parent_offer_id));
      if (!parent) return refuse('Cette offre n\'existe plus.');
      Object.assign(parent, { status: 'countered', responded_at: chatClock(chat) });
      const offer = {
        ...parent, id: String(body.p_id).toLowerCase(), author_id: USER_ID, parent_offer_id: parent.id, amount: body.p_amount, conditions: body.p_conditions ?? null,
        status: 'pending', created_at: chatClock(chat), expires_at: body.p_expires_at ?? new Date(CHAT_NOW.getTime() + 7 * 86_400_000).toISOString(),
        responded_at: null, decline_reason: null,
      };
      chat.offers.push(offer);
      addMessage(parent.conversation_id, USER_ID, { offer: { offerId: offer.id } }, '💶 Offre');
      return reply(200, [chatOffer(offer)]);
    }
    case 'rpc/accept_offer':
      return answer(chat.offers.find((item) => sameChatId(item.id, body?.p_offer_id)), { status: 'accepted' });
    case 'rpc/decline_offer':
      return answer(chat.offers.find((item) => sameChatId(item.id, body?.p_offer_id)), { status: 'rejected', decline_reason: body?.p_reason ?? null });
    case 'rpc/withdraw_offer':
      return answer(chat.offers.find((item) => sameChatId(item.id, body?.p_offer_id)), { status: 'withdrawn' });
    case 'agenda_visits':
      return reply(200, chat.agenda);
    case 'rpc/my_visit_requests':
      return reply(200, chat.visitRequests.map(chatVisitRequest));
    case 'rpc/accept_visit_request': {
      // Comme la fonction du serveur : le créneau choisi (de la demande ou de la dernière proposition) est confirmé.
      const request = chat.visitRequests.find((item) => sameChatId(item.id, body?.p_request_id));
      if (!request || !chatVisitRequest(request).allowed_actions.includes('accept')) return refuse('Cette demande ne peut plus être acceptée.');
      const slot = [...(request.status === 'counterProposed' ? request.proposed_slots ?? [] : request.slots)].find((item) => sameChatId(item.id, body?.p_slot_id));
      if (!slot) return refuse('Ce créneau n\'est plus proposé.');
      Object.assign(request, { status: 'accepted', accepted_slot: slot, updated_at: chatClock(chat) });
      return reply(204);
    }
    case 'rpc/propose_visit_slots': {
      const request = chat.visitRequests.find((item) => sameChatId(item.id, body?.p_request_id));
      const row = request ? chatVisitRequest(request) : null;
      if (!row || !row.allowed_actions.includes('propose')) return refuse('Impossible de proposer un autre créneau.');
      Object.assign(request, { status: 'counterProposed', proposed_slots: body.p_slots, proposed_by: row.my_role, updated_at: chatClock(chat) });
      return reply(204);
    }
    case 'listing_lots': {
      const id = (params.get('listing_id') ?? '').replace(/^eq\./, '').toLowerCase();
      return reply(200, (chat.lots[id] ?? []).map((status) => ({ status })));
    }
    case 'rpc/start_listing_conversation': {
      const conversation = chat.conversations.find((item) => item.listing === body?.p_listing_id);
      return conversation ? reply(200, conversation.id) : refuse('Annonce introuvable.');
    }
    // Groupes (étape 4b) : comme les fonctions du serveur, sans réponse (204) ; les droits du créateur et des
    // administrateurs sont vérifiés.
    case 'rpc/create_group': {
      const id = String(body?.p_id).toLowerCase();
      if (!findConversation(id)) {
        chat.conversations.push({ id, kind: 'group', listing: null, buyer: null, seller: null, other: null, name: body.p_name, details: body.p_details ?? null, purpose: body.p_purpose ?? null, unread: 0, created_at: chatClock(chat), createdBy: USER_ID });
        join(id, USER_ID, 'owner');
        for (const userId of body.p_member_ids ?? []) join(id, userId, 'member');
        addMessage(id, null, { system: { _0: `Claire M. a créé le groupe « ${body.p_name} »` } }, `Claire M. a créé le groupe « ${body.p_name} »`);
      }
      return reply(204);
    }
    case 'rpc/update_group_info': {
      const conversation = findConversation(body?.p_conversation_id);
      if (!conversation || !manages(conversation.id)) return refuse('Seuls le créateur et les administrateurs peuvent modifier le groupe.');
      Object.assign(conversation, { name: body.p_name, details: body.p_details ?? null, image: body.p_image_path ?? null });
      const community = chat.communities.find((item) => sameChatId(item.main_conversation_id, conversation.id));
      if (community) Object.assign(community, { name: body.p_name, image_path: body.p_image_path ?? null });
      return reply(204);
    }
    case 'rpc/add_group_members':
      if (!manages(body?.p_conversation_id)) return refuse('Seuls le créateur et les administrateurs peuvent ajouter des membres.');
      for (const userId of body.p_member_ids ?? []) join(String(body.p_conversation_id).toLowerCase(), userId, 'member');
      return reply(204);
    case 'rpc/remove_group_member': {
      const member = participantOf(body?.p_conversation_id, body?.p_member_id);
      if (!member || !manages(body.p_conversation_id) || member.role === 'owner') return refuse('Ce membre ne peut pas être retiré.');
      member.left_at = chatClock(chat);
      return reply(204);
    }
    case 'rpc/set_group_role': {
      const member = participantOf(body?.p_conversation_id, body?.p_member_id);
      if (!member || participantOf(body.p_conversation_id, USER_ID)?.role !== 'owner') return refuse('Seul le créateur peut nommer les administrateurs.');
      member.role = body.p_role;
      return reply(204);
    }
    case 'rpc/transfer_group_ownership': {
      const member = participantOf(body?.p_conversation_id, body?.p_member_id);
      const mine = participantOf(body?.p_conversation_id, USER_ID);
      if (!member || mine?.role !== 'owner') return refuse('Seul le créateur peut transférer la propriété.');
      member.role = 'owner';
      mine.role = 'admin';
      return reply(204);
    }
    case 'rpc/leave_conversation': {
      const mine = participantOf(body?.p_conversation_id, USER_ID);
      if (mine) mine.left_at = chatClock(chat);
      return reply(204);
    }
    case 'rpc/set_ephemeral': {
      const conversation = findConversation(body?.p_conversation_id);
      if (!conversation || !manages(conversation.id)) return refuse('Seuls le créateur et les administrateurs peuvent changer ce réglage.');
      conversation.ephemeral = Number(body.p_seconds) || null;
      return reply(204);
    }
    // Communautés : la communauté à jour revient (une ligne de my_communities).
    case 'rpc/my_communities':
      return reply(200, chat.communities.filter((item) => item.members.some((member) => sameChatId(member.user_id, USER_ID))));
    case 'rpc/create_community': {
      const id = String(body?.p_id).toLowerCase();
      let community = chat.communities.find((item) => sameChatId(item.id, id));
      if (!community) {
        const created = chatClock(chat);
        const main = String(body.p_conversation_id).toLowerCase();
        const members = [[USER_ID, 'owner'], ...(body.p_member_ids ?? []).map((userId) => [String(userId).toLowerCase(), 'member'])];
        community = {
          id, main_conversation_id: main, name: body.p_name, details: body.p_details, category: body.p_category, area: body.p_area ?? null,
          visibility: 'private', cover: body.p_cover ?? null, image_path: null, created_by: USER_ID, created_at: created,
          members: members.map(([user_id, role]) => ({ user_id, role, joined_at: created })),
        };
        chat.communities.push(community);
        chat.conversations.push({ id: main, kind: 'group', listing: null, buyer: null, seller: null, other: null, name: body.p_name, unread: 0, created_at: created, createdBy: USER_ID });
        for (const [userId, role] of members) join(main, userId, role);
      }
      return reply(200, [community]);
    }
    case 'rpc/add_community_members':
    case 'rpc/remove_community_member':
    case 'rpc/set_community_role':
    case 'rpc/update_community_info': {
      const community = chat.communities.find((item) => sameChatId(item.id, body?.p_community_id));
      const mine = community?.members.find((member) => sameChatId(member.user_id, USER_ID));
      if (!community || !['owner', 'admin'].includes(mine?.role)) return refuse('Seuls le créateur et les administrateurs gèrent la communauté.');
      const target = community.members.find((member) => sameChatId(member.user_id, body.p_member_id));
      if (table === 'rpc/add_community_members') {
        for (const userId of body.p_member_ids ?? []) {
          if (!community.members.some((member) => sameChatId(member.user_id, userId))) community.members.push({ user_id: String(userId).toLowerCase(), role: 'member', joined_at: chatClock(chat) });
          join(community.main_conversation_id, userId, 'member');
        }
      } else if (table === 'rpc/remove_community_member') {
        if (!target || target.role === 'owner') return refuse('Ce membre ne peut pas être retiré.');
        community.members = community.members.filter((member) => member !== target);
        const participant = participantOf(community.main_conversation_id, target.user_id);
        if (participant) participant.left_at = chatClock(chat);
      } else if (table === 'rpc/set_community_role') {
        if (!target || mine.role !== 'owner') return refuse('Seul le créateur nomme les administrateurs.');
        target.role = body.p_role;
      } else {
        Object.assign(community, { name: body.p_name, image_path: body.p_image_path });
        Object.assign(findConversation(community.main_conversation_id) ?? {}, { name: body.p_name, image: body.p_image_path });
      }
      return reply(200, [community]);
    }
    case 'rpc/leave_community': {
      const community = chat.communities.find((item) => sameChatId(item.id, body?.p_community_id));
      if (community) {
        community.members = community.members.filter((member) => !sameChatId(member.user_id, USER_ID));
        const mine = participantOf(community.main_conversation_id, USER_ID);
        if (mine) mine.left_at = chatClock(chat);
      }
      return reply(204);
    }
    // Invitations : lien actif (plus récent d'abord), nouveau lien, lien annulé ; demandes pour entrer.
    case 'rpc/my_community_invites':
      return reply(200, chat.invites.filter((item) => sameChatId(item.community_id, body?.p_community_id) && !item.revoked).sort((a, b) => b.created_at.localeCompare(a.created_at)));
    case 'rpc/create_community_invite': {
      const created = chatClock(chat);
      const invite = {
        id: crypto.randomUUID(), community_id: String(body?.p_community_id).toLowerCase(), token: `jeton-invitation-${chat.invites.length + 1}`,
        requires_approval: body?.p_requires_approval ?? true, created_at: created, expires_at: new Date(Date.parse(created) + (body?.p_days ?? 7) * 86_400_000).toISOString(),
      };
      chat.invites.push(invite);
      return reply(200, [invite]);
    }
    case 'rpc/revoke_community_invite': {
      const invite = chat.invites.find((item) => sameChatId(item.id, body?.p_invite_id));
      if (invite) invite.revoked = true;
      return reply(204);
    }
    case 'rpc/pending_community_join_requests':
      return reply(200, chat.joinRequests.filter((item) => sameChatId(item.community_id, body?.p_community_id) && item.status === 'pending')
        .map(({ id, user_id, created_at }) => ({ id, user_id, created_at })));
    case 'rpc/decide_community_join_request': {
      const request = chat.joinRequests.find((item) => sameChatId(item.id, body?.p_request_id));
      if (!request || request.status !== 'pending') return refuse('Cette demande a déjà été traitée.');
      request.status = body.p_accept ? 'accepted' : 'declined';
      const community = chat.communities.find((item) => sameChatId(item.id, request.community_id));
      if (body.p_accept && community) {
        community.members.push({ user_id: request.user_id, role: 'member', joined_at: chatClock(chat) });
        join(community.main_conversation_id, request.user_id, 'member');
      }
      return reply(204);
    }
    default:
      return reply(200, []);
  }
}

/**
 * Messagerie du serveur simulé, avec l'état `chat` ; à appeler après mock(…) : Playwright essaie d'abord la route la
 * plus récente. Les fichiers du bucket privé message-attachments : URL signées, lecture et envoi (multipart).
 */
async function mockMessaging(context, chat, { signedIn = true } = {}) {
  const cors = { 'access-control-allow-origin': '*' };
  await context.route('https://izzsoitqtzzswkpvdozd.supabase.co/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.replace('/rest/v1/', '');
    if (!CHAT_TABLES.includes(table)) return route.fallback();
    let body = null;
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
    const headers = await request.allHeaders();
    const width = pageWidth(request);
    chat.calls.push({ table, method: request.method(), search: decodeURIComponent(url.search), body, prefer: headers.prefer ?? '', width, path: pagePath(request), writesBefore: writes.length });
    // Sur téléphone, seule la page Messages lit la messagerie ; ailleurs, la pastille de la barre d'onglets lit ses non-lus.
    if (width !== null && width < 1024 && pagePath(request) !== '/messages/' && !tabBarBadgeRead(request, table, body, width, signedIn)) {
      problems.push(`téléphone : ${table} demandé hors de la page Messages`);
    }
    if (chat.slow[table]) await new Promise((resolve) => setTimeout(resolve, chat.slow[table]));
    const reply = (status, value) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: value === undefined ? '' : JSON.stringify(value) });
    if (!signedIn) {
      problems.push(`sans compte : ${table} demandé`);
      return reply(200, []);
    }
    const asked = { table, method: request.method(), params: url.searchParams, body, single: (headers.accept ?? '').includes('vnd.pgrst.object') };
    // Panne simulée par une vérification (chat.fail) : la réponse d'erreur ; `stored`, le serveur a fait le travail mais
    // sa réponse ne revient pas (coupure pendant l'envoi).
    const failure = chat.fail?.(asked) ?? null;
    if (failure) {
      if (failure.stored) await chatRespond(chat, () => undefined, asked);
      return reply(failure.status, failure.body ?? { message: 'Service Unavailable' });
    }
    return chatRespond(chat, reply, asked);
  });
  await context.route(/^https:\/\/izzsoitqtzzswkpvdozd\.supabase\.co\/storage\/v1\/object\/(sign\/)?message-attachments\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const signing = url.pathname.startsWith('/storage/v1/object/sign/');
    const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\/(sign\/)?message-attachments\//, ''));
    const width = pageWidth(request);
    if (width !== null && width < 1024 && pagePath(request) !== '/messages/') problems.push(`téléphone : fichier ${path} demandé hors de la page Messages`);
    if (!signedIn) problems.push(`sans compte : fichier ${path} demandé`);
    const reply = (status, value) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(value) });
    if (signing && request.method() === 'POST') {
      // createSignedUrl : { expiresIn } → { signedURL } (chemin relatif à /storage/v1).
      let body = null;
      try { body = request.postDataJSON(); } catch { body = request.postData(); }
      chat.signs.push({ path, body });
      if (!chat.files.has(path)) return reply(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      return reply(200, { signedURL: `/object/sign/message-attachments/${path}?token=jeton-de-test` });
    }
    if (signing) {
      const file = chat.files.get(path);
      if (!file || url.searchParams.get('token') !== 'jeton-de-test') return reply(400, { statusCode: '400', error: 'InvalidJWT', message: 'invalid signature' });
      return route.fulfill({ status: 200, contentType: file.type, headers: cors, body: file.body });
    }
    if (request.method() !== 'POST') return reply(400, { statusCode: '400', error: 'invalid', message: 'lecture directe refusée (bucket privé)' });
    const headers = await request.allHeaders();
    const parts = multipartParts(request.postDataBuffer(), headers['content-type']);
    chat.uploads.push({ path, headers, parts });
    const file = parts.find((part) => part.filename !== null);
    if (file) chat.files.set(path, { type: file.type ?? 'application/octet-stream', body: Buffer.from(file.body) });
    return reply(200, { Id: crypto.randomUUID(), Key: `message-attachments/${path}` });
  });
  // remove() de supabase-js : DELETE sur le bucket avec { prefixes } ; les fichiers effacés reviennent.
  await context.route('https://izzsoitqtzzswkpvdozd.supabase.co/storage/v1/object/message-attachments', async (route) => {
    const request = route.request();
    if (request.method() !== 'DELETE') return route.fallback();
    let body = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    const paths = Array.isArray(body?.prefixes) ? body.prefixes : [];
    chat.removed.push(...paths);
    for (const path of paths) chat.files.delete(path);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(paths.map((name) => ({ name }))) });
  });
}

// MARK: - Messages : aides des vérifications

/** Demandes de la messagerie reçues depuis `mark`, pour une table ou une fonction. */
const chatCalls = (chat, table, mark = 0) => chat.calls.slice(mark).filter((call) => call.table === table);

/** Valeur aux clés triées, pour comparer un envoi sans dépendre de l'ordre de ses champs. */
function sortedValue(value) {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedValue(value[key])]));
  return value;
}

function expectSame(name, what, actual, wanted) {
  if (JSON.stringify(sortedValue(actual)) !== JSON.stringify(sortedValue(wanted))) {
    problems.push(`${name} : ${what} ${JSON.stringify(actual)} au lieu de ${JSON.stringify(wanted)}`);
  }
}

/** La seule demande `table` arrivée depuis `mark` (attendue, puis comptée après un court délai). */
async function oneCall(chat, table, mark, what, filter = () => true) {
  await waitFor(() => chatCalls(chat, table, mark).some(filter), `${what} : ${table}`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const calls = chatCalls(chat, table, mark).filter(filter);
  if (calls.length !== 1) problems.push(`${what} : ${calls.length} appel(s) à ${table} au lieu d'un (${JSON.stringify(calls.map((call) => call.body))})`);
  return calls[0] ?? null;
}

/** Texte affiché d'un élément (innerText), espaces et retours à la ligne (insécables compris) ramenés à un seul. */
async function textOf(page, selector) {
  const text = await page.locator(selector).first().innerText({ timeout: 8000 }).catch(() => null);
  return text?.replace(/\s+/g, ' ').trim() ?? null;
}

/** Pastille Messages : celle de la barre d'onglets (téléphone) ou de l'en-tête (ordinateur, étape 0) ; une seule existe. */
const MESSAGES_BADGE = '.tabbar a[href="/messages/"] .tabbar-badge, .site-header-nav a[href="/messages/"] .site-header-badge';

async function messagesBadge(page) {
  return page.evaluate((selector) => document.querySelector(selector)?.textContent ?? '', MESSAGES_BADGE);
}

/** Pastille Messages de la barre d'onglets ou de l'en-tête (« » : aucune). */
async function waitForMessagesBadge(page, want, name) {
  try {
    await page.waitForFunction(([selector, target]) => (document.querySelector(selector)?.textContent ?? '') === target, [MESSAGES_BADGE, want], { timeout: 8000 });
  } catch {
    problems.push(`${name} : pastille Messages « ${await messagesBadge(page)} » au lieu de « ${want} »`);
  }
}

/** Lignes de la boîte de réception, telles qu'affichées. */
function inboxRows(page) {
  return page.$$eval('.dm-list .dm-row', (rows) => rows.map((row) => ({
    name: row.querySelector('.dm-row-name')?.textContent ?? null,
    time: row.querySelector('.dm-row-time')?.textContent ?? null,
    // La petite maison devant le bien (demande du 17/11) : seulement le texte.
    listing: row.querySelector('.dm-row-listing')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    preview: row.querySelector('.dm-row-preview')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    unread: row.querySelector('.dm-unread')?.textContent ?? null,
    greyPill: Boolean(row.querySelector('.dm-unread.is-muted')),
  })));
}
const rowNames = async (page) => (await inboxRows(page)).map((row) => row.name);

/** Attend les noms des lignes affichées (filtre, recherche, temps réel). */
async function waitForRows(page, names, name) {
  try {
    await page.waitForFunction((wanted) => JSON.stringify([...document.querySelectorAll('.dm-list .dm-row .dm-row-name')].map((el) => el.textContent)) === JSON.stringify(wanted), names, { timeout: 8000 });
  } catch {
    problems.push(`${name} : conversations ${JSON.stringify(await rowNames(page))} au lieu de ${JSON.stringify(names)}`);
  }
}

/** Titre de la fenêtre ouverte : alerte, confirmation ou avis (`alert`), sinon feuille. */
async function dialogTitle(page, kind = 'alert') {
  const selector = kind === 'alert' ? 'dialog.alert-dialog[open] h2' : 'dialog.dm-sheet[open] h2';
  await page.waitForSelector(selector, { timeout: 8000 }).catch(() => undefined);
  return (await page.locator(selector).first().textContent().catch(() => null))?.replace(/\s+/g, ' ').trim() ?? null;
}

/** Bouton d'une alerte ouverte, par son texte. */
async function alertButton(page, label) {
  await page.locator('dialog.alert-dialog[open]').last().getByRole('button', { name: label, exact: true }).click();
}

/** Alerte « OK » de l'app (domiaAlert) : son texte, puis on la referme. */
async function noticeText(page, name) {
  const text = await dialogTitle(page);
  if (text === null) problems.push(`${name} : aucun avis affiché`);
  else await alertButton(page, 'OK');
  await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${name} : l'avis reste ouvert`));
  return text;
}

/** Une alerte ne se ferme que par ses boutons (n° 45) : ni Échap, ni un clic à côté de la fenêtre. */
async function alertStaysOpen(page, name) {
  await page.waitForSelector('dialog.alert-dialog[open]', { timeout: 8000 }).catch(() => undefined);
  await page.keyboard.press('Escape');
  await page.mouse.click(4, 4);
  await page.waitForTimeout(300);
  if (!(await page.locator('dialog.alert-dialog[open]').count())) problems.push(`${name} : l'alerte se ferme sans ses boutons`);
}

/** « Dans l'app iPhone pour l'instant » : titre de l'action, message, puis « Fermer ». */
async function iphoneOnly(page, name, title) {
  const shown = await dialogTitle(page);
  const message = await textOf(page, 'dialog.alert-dialog[open] .alert-body p');
  expectSame(name, `« ${title} »`, [shown, message], [title, 'Dans l’app iPhone pour l’instant.']);
  await alertButton(page, 'Fermer').catch(() => problems.push(`${name} : « Fermer » absent pour « ${title} »`));
  await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached', timeout: 8000 }).catch(() => undefined);
}

/** Menu ⋮ de l'en-tête : ses actions, ou l'action choisie. */
async function headerMenu(page, choose = null) {
  await page.click('.dm-head button[aria-label="Plus d\'options"]');
  await page.waitForSelector('.dm-head .dm-menu-list');
  const items = await page.$$eval('.dm-head .dm-menu-list [role="menuitem"]', (els) => els.map((el) => el.textContent.trim()));
  if (choose) await page.locator('.dm-head .dm-menu-list').getByRole('menuitem', { name: choose, exact: true }).click();
  else await page.keyboard.press('Escape');
  return items;
}

/** Images chargées dans la page (photos des messages, bandeau, prochaine visite). */
async function imagesLoaded(page, selector, count, name) {
  try {
    await page.waitForFunction(([sel, wanted]) => {
      const images = [...document.querySelectorAll(sel)];
      return images.length >= wanted && images.every((image) => image.complete && image.naturalWidth > 0);
    }, [selector, count], { timeout: 10000 });
  } catch {
    problems.push(`${name} : images ${selector} non chargées (${await page.locator(selector).count()} sur ${count})`);
  }
}

/** Capture d'écran sans survol ni curseur dans un champ. */
async function chatShot(page, file) {
  await page.mouse.move(430, 400);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, file) });
}

// MARK: - Favoris sur ordinateur : aides des vérifications

const FAV_T2 = 'T2 loué près du métro';
const FAV_FLAT = 'Appartement 3 pièces lumineux';
const FAV_STUDIO = 'Studio meublé';
const FAV_HOTEL = 'Hôtel 3 étoiles, murs loués';
/** Ordre « Pertinence » de l'app : publiées le plus récemment d'abord. */
const FAV_ALL = [FAV_T2, FAV_FLAT, FAV_STUDIO, FAV_HOTEL];
const FAV_BUTTONS = [['Retirer des favoris', null], ['Ajouter à la comparaison', 'false']];
/** Cartes attendues (FavoriteListingCard de l'app) : prix charges comprises pour la location, prix au m² des ventes, DPE, rendement brut. */
const FAV_CARDS = [
  { title: FAV_T2, href: `/annonce/?id=${favId(3)}&mode=invest`, details: 'Villeurbanne · 45 m² · 2 pièces · 1er étage', price: '175 000 €', perMeter: '3 889 €/m²', dpe: 'D',
    yield: 'Rendement brut 8,2 %', tone: 'vert', counter: null, noPhoto: null, buttons: FAV_BUTTONS },
  { title: FAV_FLAT, href: `/annonce/?id=${favId(1)}`, details: 'Lyon 3e · 68 m² · 3 pièces · 2e étage', price: '255 000 €', perMeter: '3 750 €/m²', dpe: 'C',
    yield: null, tone: null, counter: '1/3', noPhoto: null, buttons: FAV_BUTTONS },
  { title: FAV_STUDIO, href: `/annonce/?id=${favId(2)}`, details: 'Lyon 7e · 24 m² · 1 pièce · 2e étage', price: '680 €/mois CC', perMeter: null, dpe: 'E',
    yield: null, tone: null, counter: null, noPhoto: null, buttons: FAV_BUTTONS },
  { title: FAV_HOTEL, href: `/annonce/?id=${favId(4)}`, details: 'Annecy · 980 m²', price: '1 890 000 €', perMeter: '1 929 €/m²', dpe: 'D',
    yield: 'Rendement brut 5,7 %', tone: 'orange', counter: null, noPhoto: 'Pas encore de photo', buttons: FAV_BUTTONS },
];
/** Colonnes relues par saveSearch (SupabaseAccountRepositories.swift:314). */
const SAVED_SELECT = 'id,user_id,name,query,alerts_enabled,created_at,last_notified_at,last_viewed_at';
/** Favoris sur ordinateur (étape 4) : nouveautés des recherches du compte de test, sur leurs cartes (le point de l'onglet
 * Recherches du téléphone). */
const FAV_NEWS = ['1 nouvelle annonce', '1 nouvelle annonce'];
/** Favoris sur ordinateur (étape 4) : tailles de la maquette 08-favoris.html, police Inter partout ; pas d'onglets.
 * Catégorie : la première, « Tous », est la choisie (demi-gras, comme la capsule de la recherche). */
const FAV_DESK_FONTS = {
  titre: '34px 800', 'sous-titre': '16px 400', onglet: null, champ: '15px 400', catégorie: '15px 600', nombre: '15px 600', tri: '15px 600',
  'titre de carte': '15px 600', infos: '14px 400', prix: '22px 800', 'prix au m²': '14px 400', rendement: '13px 700', 'plus disponible': '15px 700', Retirer: '13.5px 700',
};

/** Cartes de la grille des favoris, telles qu'affichées. */
function favoriteCardsShown(page) {
  return page.$$eval('.favorites-list .favorite-card', (cards) => cards.map((card) => {
    const text = (selector) => card.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() ?? null;
    const pill = card.querySelector('.favorite-yield');
    return {
      title: text('.favorite-title'), href: card.querySelector('.favorite-title a')?.getAttribute('href') ?? null, details: text('.favorite-details'), price: text('.favorite-price'),
      perMeter: text('.favorite-per-meter'), dpe: text('.favorite-dpe-letter'), yield: text('.favorite-yield'), tone: pill ? (pill.classList.contains('tone-positive') ? 'vert' : 'orange') : null,
      counter: text('.favorite-counter'), noPhoto: text('.favorite-no-photo'),
      buttons: [...card.querySelectorAll('.favorite-heart, .favorite-compare')].map((button) => [button.getAttribute('aria-label'), button.getAttribute('aria-pressed')]),
    };
  }));
}
const favoriteTitles = (page) => page.$$eval('.favorites-list .favorite-card .favorite-title', (els) => els.map((el) => el.textContent));

/** Attend les cartes affichées (titres, dans l'ordre) et le nombre « N biens sauvegardés ». */
async function waitForFavorites(page, titles, total, name) {
  try {
    await page.waitForFunction(([wanted, count]) => JSON.stringify([...document.querySelectorAll('.favorites-list .favorite-card .favorite-title')].map((el) => el.textContent)) === JSON.stringify(wanted)
      && (document.querySelector('.favorites-total')?.textContent ?? null) === count, [titles, total], { timeout: 8000 });
  } catch {
    const shown = await page.evaluate(() => document.querySelector('.favorites-total')?.textContent ?? null);
    problems.push(`${name} : cartes ${JSON.stringify(await favoriteTitles(page))} et « ${shown} » au lieu de ${JSON.stringify(titles)} et « ${total} »`);
  }
}

/** Première photo de chaque carte chargée (les autres photos d'une carte se chargent en la faisant défiler). */
async function favoritePhotosLoaded(page, count, name) {
  try {
    await page.waitForFunction((wanted) => {
      const images = [...document.querySelectorAll('.favorite-photo')].map((photo) => photo.querySelector('img')).filter(Boolean);
      return images.length === wanted && images.every((image) => image.complete && image.naturalWidth > 0);
    }, count, { timeout: 10000 });
  } catch {
    problems.push(`${name} : photos des cartes non chargées`);
  }
}

/** Message du bas de la comparaison (CompareToast, le même que « Retiré des favoris ») : son texte et « Voir » ou « Gérer ». */
async function waitForCompareNotice(page, want, name) {
  try {
    await page.waitForFunction((target) => {
      const box = document.querySelector('.app-toast:not(.is-leaving)');
      return box?.querySelector('.app-toast-text')?.textContent === target.text && (box.querySelector('.app-toast-action')?.textContent ?? null) === target.action;
    }, want, { timeout: 4000 });
  } catch {
    const shown = await page.evaluate(() => {
      const box = document.querySelector('.app-toast');
      return box ? { text: box.querySelector('.app-toast-text')?.textContent ?? null, action: box.querySelector('.app-toast-action')?.textContent ?? null } : null;
    });
    problems.push(`${name} : toast ${JSON.stringify(shown)} au lieu de ${JSON.stringify(want)}`);
  }
}

/** Message du bas « Retiré des favoris » avec « Annuler » (FavoritesView.showUndo de l'app). */
async function waitForRemovalNotice(page, name) {
  try {
    await page.waitForFunction(() => {
      const box = document.querySelector('.app-toast:not(.is-leaving)');
      const action = box?.querySelector('.app-toast-action');
      return box?.querySelector('.app-toast-text')?.textContent === 'Retiré des favoris' && action?.textContent === 'Annuler'
        && action.getAttribute('aria-label') === 'Annuler le retrait';
    }, null, { timeout: 4000 });
  } catch {
    problems.push(`${name} : message « Retiré des favoris · Annuler » absent (${await page.evaluate(() => document.querySelector('.app-toast')?.textContent ?? 'aucun')})`);
  }
}

/**
 * Vos favoris sur téléphone, comme l'app (FavoritesView.swift, FavoritesEmptyState.swift ; demande du 17/11) : au
 * premier chargement la roue, jamais « Aucun favori » ; onglets à pastille glissante ; pavés des catégories avec
 * « Tous » dans la carte blanche ; retrait annulable ; états vides illustrés (Favoris, Recherches, Mon espace ›
 * Mes recherches). Captures : favoris-*-telephone.png.
 */
async function phoneFavorites() {
  const P = 'favoris téléphone';
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  await mock(context, { signedIn: true, listingRows: FAV_LISTINGS, account: FAV_ACCOUNT, slow: { favorites: 1200 } });
  await context.addInitScript(() => {
    window.nidaloSeen = { spinner: false, empty: false };
    new MutationObserver(() => {
      if (document.querySelector('.favorites-wrap .account-spinner')) window.nidaloSeen.spinner = true;
      if (document.querySelector('.fav-empty') || document.body?.textContent?.includes('Aucun favori pour')) window.nidaloSeen.empty = true;
    }).observe(document, { subtree: true, childList: true });
  });
  let page = await open(context, '/favoris/', P);
  await page.waitForSelector('.favorite-card');
  expectSame(P, 'premier chargement', await page.evaluate(() => window.nidaloSeen), { spinner: true, empty: false });
  expectSame(P, 'onglets', await page.$$eval('.favorites-wrap .fav-tab', (els) => els.map((el) => [el.querySelector('.fav-tab-title')?.textContent ?? null,
    el.querySelector('.fav-tab-count')?.textContent ?? null, el.getAttribute('aria-label'), el.getAttribute('aria-pressed')])),
  [['Favoris', null, null, 'true'], ['Recherches', '(2)', 'Recherches, 2, nouveautés', 'false']]);
  expectSame(P, 'catégories', [await page.$$eval('.favorites-categories .mode-tab', (els) => els.map((el) => [el.textContent.trim(), el.getAttribute('aria-checked')])),
    await page.evaluate(() => { const card = document.querySelector('.favorites-categories'); const style = getComputedStyle(card); return [style.borderTopLeftRadius, style.backgroundColor, Math.round(card.getBoundingClientRect().width)]; })],
  [[['Tous', 'true'], ['Résidentiel', 'false'], ['Location', 'false'], ['Investir', 'false'], ['Hôtels', 'false']], ['26px', 'rgb(255, 255, 255)', 358]]);
  const tabsBox = await page.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width), Math.round(r.height)]; };
    return { piste: box(document.querySelector('.favorites-wrap .fav-tabs')), pastille: box(document.querySelector('.favorites-wrap .fav-tabs-pill')),
      onglet: box(document.querySelector('.favorites-wrap .fav-tab')) };
  });
  expectSame(P, 'onglets, mesures', tabsBox, { piste: [16, 358, 48], pastille: [20, 175, 40], onglet: [20, 175, 40] });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'favoris-onglet-favoris-telephone.png'), fullPage: true });
  const phoneTitles = () => page.$$eval('.favorite-card .favorite-title', (els) => els.map((el) => el.textContent));
  // Catégorie Location, puis Tous.
  await page.locator('.favorites-categories .mode-tab', { hasText: 'Location' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.favorite-card').length === 1, null, { timeout: 4000 }).catch(() => problems.push(`${P} : Location ne garde pas une seule carte`));
  expectSame(P, 'Location', [await phoneTitles(), await textOf(page, '.favorites-total')], [[FAV_STUDIO], '1 sur 4 biens']);
  await page.locator('.favorites-categories .mode-tab', { hasText: 'Tous' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.favorite-card').length === 4, null, { timeout: 4000 }).catch(() => problems.push(`${P} : Tous ne remet pas les 4 cartes`));
  // Cœur : la carte part, « Retiré des favoris · Annuler » ; « Annuler » la remet à sa place, rien n'est envoyé.
  let mark = writes.length;
  await page.locator('.favorite-card', { has: page.locator('.favorite-title', { hasText: FAV_FLAT }) }).locator('.favorite-heart').click();
  await page.waitForFunction(() => document.querySelectorAll('.favorite-card').length === 3, null, { timeout: 4000 }).catch(() => problems.push(`${P} : le cœur laisse la carte`));
  await waitForRemovalNotice(page, `${P} : cœur`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, 'favoris-retrait-telephone.png') });
  await page.click('.app-toast-action');
  await page.waitForFunction(() => document.querySelectorAll('.favorite-card').length === 4, null, { timeout: 4000 }).catch(() => problems.push(`${P} : « Annuler » ne remet pas la carte`));
  expectSame(P, '« Annuler »', await phoneTitles(), FAV_ALL);
  await page.waitForTimeout(4500);
  expectSame(P, '« Annuler » : rien d\'envoyé', writes.slice(mark), []);
  // Retrait laissé à son terme : il part à la fin du message.
  await page.locator('.favorite-card', { has: page.locator('.favorite-title', { hasText: FAV_HOTEL }) }).locator('.favorite-heart').click();
  await waitForRemovalNotice(page, `${P} : cœur de l'hôtel`);
  await expectWrites(mark, [['DELETE', 'favorites', { listing_id: `eq.${favId(4)}` }, null]], `${P} : fin du message`);
  // Comparer (CompareButton de l'app) : le rond de l'en-tête, « Comparer vos favoris » sans pastille, et un bouton
  // Comparer par carte ; celui de la première carte ajoute son bien (« Comparer, 1 bien », pastille 1), sans rien
  // envoyer au serveur.
  mark = writes.length;
  const compareHead = () => page.evaluate(() => [document.querySelector('.favorites-head .compare-button')?.getAttribute('aria-label'),
    document.querySelector('.favorites-head .compare-button-count')?.textContent ?? null]);
  expectSame(P, 'Comparer [en-tête, boutons des cartes]', [await compareHead(), await page.locator('.favorite-card .favorite-compare').count()], [['Comparer vos favoris', null], 3]);
  const firstCompared = await page.$eval('.favorite-card a.stretched', (link) => new URL(link.href).searchParams.get('id'));
  await page.locator('.favorite-card .favorite-compare').first().click();
  await page.waitForSelector('.favorites-head .compare-button-count', { timeout: 4000 }).catch(() => undefined);
  expectSame(P, 'un bien comparé [en-tête, comparaison, envois]', [await compareHead(), await page.evaluate(() => JSON.parse(sessionStorage.getItem('nidalo.comparer') ?? 'null')),
    writes.slice(mark)], [['Comparer, 1 bien', '1'], { ids: [firstCompared], referenceId: firstCompared }, []]);
  // Onglet Recherches : la pastille glisse sous l'onglet, le contenu change.
  await page.click('.favorites-wrap .fav-tab >> nth=1');
  await page.waitForSelector('.favorites-searches .saved-search');
  await page.waitForTimeout(700);
  expectSame(P, 'onglet Recherches', [await page.$$eval('.favorites-wrap .fav-tab', (els) => els.map((el) => el.getAttribute('aria-pressed'))),
    await page.evaluate(() => Math.round(document.querySelector('.favorites-wrap .fav-tabs-pill').getBoundingClientRect().left)), await page.locator('.favorites-search, .favorites-categories').count()],
  [['false', 'true'], 195, 0]);
  await waitForSearchCountsIn(page, '.favorites-searches', P);
  await page.screenshot({ path: join(out, 'favoris-onglet-recherches-telephone.png'), fullPage: true });
  // Le rond de l'en-tête ouvre Comparer (l'écran de l'app sur téléphone), avec le bien ajouté.
  await Promise.all([page.waitForURL(`${base}/comparer/`, { timeout: 8000 }).catch(() => problems.push(`${P} : le rond de l'en-tête n'ouvre pas Comparer (${page.url()})`)),
    page.click('.favorites-head .compare-button')]);
  await page.waitForSelector('.cmpm-column', { timeout: 8000 }).catch(() => undefined);
  expectSame(P, 'Comparer ouvert depuis les favoris', [await textOf(page, '.cmpm h1'), await page.locator('.cmpm-column').count()], ['Comparer', 1]);
  await page.close();
  await context.close();

  // Aucun favori, aucune recherche : les deux états vides illustrés ; ni recherche, ni filtres, ni pavés.
  const empty = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  await mock(empty, { signedIn: true, listingRows: FAV_LISTINGS, account: { favorites: [], saved_searches: [] } });
  page = await open(empty, '/favoris/', `${P} vide`);
  await page.waitForSelector('.favorites-wrap .fav-empty');
  expectSame(`${P} vide`, 'Favoris', [await textOf(page, '.fav-empty h2'), await textOf(page, '.fav-empty p'), await textOf(page, '.fav-empty a'), await page.getAttribute('.fav-empty a', 'href'),
    await page.locator('.favorites-search, .favorites-categories, .favorites-toolbar').count(), await page.locator('.fav-empty .fav-ghost').count(),
    await page.evaluate(() => Math.round(document.querySelector('.fav-empty a').getBoundingClientRect().width)), await page.getAttribute('.favorites-wrap .fav-tab >> nth=1', 'aria-label'),
    await page.locator('.favorites-wrap .fav-tab-count').count()],
  ['Aucun favori pour l\'instant', 'Touchez le cœur d\'une annonce pour la retrouver ici et la comparer.', 'Rechercher un bien', '/recherche/', 0, 2, 358, 'Recherches, 0', 0]);
  await phoneFits(page, `${P} vide`);
  await page.screenshot({ path: join(out, 'favoris-vide-telephone.png') });
  await page.click('.favorites-wrap .fav-tab >> nth=1');
  await page.waitForSelector('.favorites-searches .fav-empty');
  expectSame(`${P} vide`, 'Recherches', [await textOf(page, '.favorites-searches .fav-empty h2'), await textOf(page, '.favorites-searches .fav-empty p'),
    await textOf(page, '.fav-empty-search-count'), await textOf(page, '.fav-empty-search-sort'), await textOf(page, '.fav-empty-save'), await page.getAttribute('.favorites-searches .fav-empty a', 'href')],
  ['Aucune recherche enregistrée', 'Touchez Enregistrer sur une recherche pour la retrouver ici, avec ses nouveautés.', '6 annonces', 'Triées par pertinence', 'Enregistrer', '/recherche/']);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'favoris-recherches-vide-telephone.png') });
  // Mon espace › Mes recherches : le même état vide, centré.
  page = await open(empty, '/compte/?vue=recherches', `${P} Mes recherches vide`);
  await page.waitForSelector('.fav-empty');
  expectSame(`${P} Mes recherches vide`, 'texte', [await textOf(page, '.fav-empty h2'), await textOf(page, '.fav-empty a')], ['Aucune recherche enregistrée', 'Rechercher un bien']);
  await page.screenshot({ path: join(out, 'mes-recherches-vide-telephone.png') });
  await page.close();
  await empty.close();
}

/** Nombres de résultats des recherches affichés, dans un conteneur donné. */
async function waitForSearchCountsIn(page, container, name) {
  try {
    await page.waitForFunction((selector) => {
      const buttons = [...document.querySelectorAll(`${selector} .run-button`)];
      return buttons.length > 0 && buttons.every((button) => !button.textContent.includes('Relancer la recherche'));
    }, container, { timeout: 8000 });
  } catch {
    problems.push(`${name} : nombre de résultats des recherches non affiché`);
  }
}

/** Les recherches de l'onglet Recherches ont leur nombre de résultats (plus de « Relancer la recherche »). */
async function waitForSearchCounts(page, name) {
  try {
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll('.favorites-searches .run-button')];
      return buttons.length > 0 && buttons.every((button) => !button.textContent.includes('Relancer la recherche'));
    }, null, { timeout: 8000 });
  } catch {
    problems.push(`${name} : nombre de résultats des recherches non affiché`);
  }
}

/** Écritures reçues depuis `mark` : méthode, table, paramètres de l'adresse, contenu. */
async function expectWrites(mark, wanted, name) {
  await waitFor(() => writes.length - mark >= wanted.length, name);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expectSame(name, 'envoi', writes.slice(mark).map((write) => [write.method, write.table, Object.fromEntries(new URLSearchParams(write.search)), write.body]), wanted);
}

/** Capture pleine page, sans survol ni champ actif, polices chargées. */
async function favShot(page, file) {
  await page.mouse.move(2, 2);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, file), fullPage: true });
}

/**
 * Téléphone : rien ne dépasse de l'écran (pas de défilement de côté ; boutons, liens, onglets et feuilles dans
 * l'écran) ni de sa carte (cartes de visite, cartes du formulaire, lignes de notification, feuilles).
 */
async function phoneFits(page, name) {
  const outside = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const label = (element) => `${element.className || element.tagName} « ${element.textContent.replace(/\s+/g, ' ').trim().slice(0, 30)} »`;
    const found = [];
    if (document.documentElement.scrollWidth > width) found.push(`page de ${document.documentElement.scrollWidth} px pour ${width}`);
    for (const element of document.querySelectorAll('main button, main a, main input, main select, main textarea, dialog[open], dialog[open] button, dialog[open] input, .dsc-menu-list')) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (box.left < -0.5 || box.right > width + 0.5) found.push(`${label(element)} de ${Math.round(box.left)} à ${Math.round(box.right)} px`);
    }
    for (const card of document.querySelectorAll('.app-visit, .dsc-card, .notification-row, dialog[open], .dsc-menu-list')) {
      if (card.scrollWidth > card.clientWidth + 1) found.push(`${label(card)} : contenu de ${card.scrollWidth} px pour ${card.clientWidth}`);
    }
    return found;
  });
  if (outside.length) problems.push(`${name} : dépasse : ${outside.slice(0, 6).join(' ; ')}`);
}

// MARK: - Mon espace sur ordinateur (maquette 5) : projet, agenda, visites et biens consultés, avec des données inventées.

const SPACE_STORAGE = 'https://izzsoitqtzzswkpvdozd.supabase.co/storage/v1/object/public/listing-photos/';
/** Vendeur de l'appartement de Lyon 3e : une agence, avec son numéro publié (plage de la fiction). */
const SPACE_OWNER_ID = listings[0].owner_id;
const SPACE_PROFILES = [{
  user_id: SPACE_OWNER_ID, public_name: 'Agence du Parc', avatar_path: null, account_type: 'professional', member_since: '2025-03-01T00:00:00Z',
  agency_id: 'b1000000-0000-4000-8000-000000000001', agency_name: 'Agence du Parc', agency_logo_path: null, agency_postal_code: '69003',
  agency_city: 'Lyon', agency_phone: '06 39 98 00 11',
}];
const SPACE_CONVERSATION_ID = 'c2000000-0000-4000-8000-000000000001';
/** Conversation à deux avec l'agence, à propos de l'appartement de Lyon 3e (my_conversations). */
const SPACE_CONVERSATIONS = [{
  conversation_id: SPACE_CONVERSATION_ID, kind: 'listing', listing_id: listings[0].id,
  listing_snapshot: { listingId: listings[0].id.toUpperCase(), title: listings[0].title, price: listings[0].price, transaction: 'sale', city: listings[0].city, coverPath: 'test/photo0.jpg' },
  buyer_id: USER_ID, seller_id: SPACE_OWNER_ID, group_name: null, group_details: null, group_image_path: null, group_purpose: null, ephemeral_seconds: null,
  created_by: USER_ID, created_at: '2026-11-01T09:00:00Z', my_role: 'member', joined_at: '2026-11-01T09:00:00Z', left_at: null, last_read_at: null,
  is_archived: false, is_favorite: false, muted_until: null, saves_photos: false, cleared_at: null, other_user_id: SPACE_OWNER_ID, other_last_read_at: null,
  member_count: 2, unread_count: 0, last_message_id: null, last_message_sender_id: SPACE_OWNER_ID, last_message_kind: 'text', last_message_content: null,
  last_message_preview: 'Bonjour, la visite est confirmée.', last_message_at: '2026-11-05T17:00:00Z',
}];
/** Bien d'une visite tel que l'app l'écrit (ListingSnapshot : identifiant en majuscules, photo en adresse publique). */
const spaceSnapshot = (row, cover) => ({
  listingId: row.id.toUpperCase(), title: row.title, price: row.price, transaction: row.transaction, city: row.city, ...(cover ? { coverImageURL: `${SPACE_STORAGE}${cover}` } : {}),
});
const SPACE_L1 = spaceSnapshot(listings[0], 'test/photo0.jpg');
const SPACE_L2 = spaceSnapshot(listings[1], 'test/photo2.jpg');
const SPACE_L3 = spaceSnapshot(listings[2], null);
const spaceVisitId = (n) => `D0000000-0000-4000-8000-00000000000${n}`;
/** Ligne de agenda_visits écrite par l'app : la visite entière en JSON, dates en UTC sans fuseau. */
function spaceVisit(n, start, status, visit) {
  return { id: spaceVisitId(n), start_at: start, status, request_id: null, listing_id: visit.listing?.listingId ?? null,
    visit: { id: spaceVisitId(n), start, status, createdAt: '2026-11-01T09:00:00.000', ...visit } };
}
/** Agenda au vendredi 6 novembre 2026, 10 h 50 à Paris : aujourd'hui, lundi, une visite passée avec compte rendu, une annulée. */
const SPACE_VISITS = [
  spaceVisit(1, '2026-11-06T13:30:00.000', 'confirmed', { listing: SPACE_L1, durationMinutes: 45, contactName: 'Agence du Parc', address: 'Lyon 3e (69003)',
    linkedConversationId: 'E0000000-0000-4000-8000-000000000001' }),
  spaceVisit(2, '2026-11-09T08:00:00.000', 'awaitingOther', { listing: SPACE_L3, durationMinutes: 30, contactName: 'Julien Moreau', address: '12 Rue de test, 69007 Lyon 7e' }),
  spaceVisit(3, '2026-11-02T14:00:00.000', 'confirmed', { listing: SPACE_L2, durationMinutes: 60, contactName: 'Camille Roux', address: 'Villeurbanne (69100)',
    report: { opinion: 'interesting', decision: 'reviewAgain' } }),
  spaceVisit(4, '2026-11-04T16:00:00.000', 'cancelled', { listing: SPACE_L2, durationMinutes: 45, contactName: 'Camille Roux' }),
];
const SPACE_REQUEST_ID = 'F0000000-0000-4000-8000-000000000001';
/** Demande de visite envoyée, trois créneaux proposés, pas encore acceptée (my_visit_requests). */
const SPACE_REQUESTS = [{
  id: SPACE_REQUEST_ID, listing_id: SPACE_L2.listingId,
  listing_snapshot: { listingId: SPACE_L2.listingId, title: SPACE_L2.title, price: SPACE_L2.price, transaction: 'sale', city: SPACE_L2.city, coverPath: 'test/photo2.jpg' },
  requester: { userId: USER_ID, name: 'Claire M.', kind: 'individual' },
  recipient: { userId: listings[1].owner_id, name: 'Marc Petit', kind: 'individual' },
  slots: [
    { id: 'S1', start: '2026-11-10T09:00:00.000', durationMinutes: 45 },
    { id: 'S2', start: '2026-11-10T16:00:00.000', durationMinutes: 45 },
    { id: 'S3', start: '2026-11-11T09:30:00.000', durationMinutes: 45 },
  ],
  mode: 'onSite', message: null, status: 'pending', accepted_slot: null, proposed_slots: null, created_at: '2026-11-05T18:00:00',
}];
/** Maison de Claire à Écully (inventée), sur laquelle elle ouvre des créneaux et reçoit une demande de visite. */
const SPACE_HOUSE = { listingId: 'A2000000-0000-4000-8000-000000000001', title: 'Maison familiale 5 pièces', price: 520000, transaction: 'sale', city: 'Écully', coverPath: null };
/**
 * Créneaux ouverts par Claire (my_visit_sessions) : deux séances à venir (l'une au format brut de Postgres), une
 * annulée et une finie, qui ne s'affichent pas.
 */
const SPACE_SESSIONS = [
  { id: 'A3000000-0000-4000-8000-000000000001', listing_id: SPACE_HOUSE.listingId, listing_snapshot: SPACE_HOUSE, starts_at: '2026-11-12T09:00:00+00:00',
    ends_at: '2026-11-12T11:00:00+00:00', status: 'open', booked_count: 3, total_places: 8 },
  { id: 'A3000000-0000-4000-8000-000000000002', listing_id: SPACE_HOUSE.listingId, listing_snapshot: SPACE_HOUSE, starts_at: '2026-11-07 13:00:00+00',
    ends_at: '2026-11-07 14:00:00.123456+00', status: 'open', booked_count: 0, total_places: 4 },
  { id: 'A3000000-0000-4000-8000-000000000003', listing_id: SPACE_HOUSE.listingId, listing_snapshot: SPACE_HOUSE, starts_at: '2026-11-14T09:00:00+00:00',
    ends_at: '2026-11-14T10:00:00+00:00', status: 'cancelled', booked_count: 0, total_places: 4 },
  { id: 'A3000000-0000-4000-8000-000000000004', listing_id: SPACE_HOUSE.listingId, listing_snapshot: SPACE_HOUSE, starts_at: '2026-11-05T09:00:00+00:00',
    ends_at: '2026-11-05T10:00:00+00:00', status: 'open', booked_count: 2, total_places: 4 },
];
const SPACE_REQUESTER_ID = 'a1000000-0000-4000-8000-0000000000e5';
/** Demande de visite reçue par Claire pour sa maison, un seul créneau proposé (my_visit_requests). */
const SPACE_RECEIVED_REQUEST = {
  id: 'F0000000-0000-4000-8000-000000000002', listing_id: SPACE_HOUSE.listingId, listing_snapshot: SPACE_HOUSE,
  requester: { userId: SPACE_REQUESTER_ID.toUpperCase(), name: 'Julie B.', kind: 'individual' },
  recipient: { userId: USER_ID.toUpperCase(), name: 'Claire M.', kind: 'individual' },
  slots: [{ id: 'S1', start: '2026-11-13T09:00:00.000', durationMinutes: 45 }],
  mode: 'onSite', message: null, status: 'pending', accepted_slot: null, proposed_slots: null, created_at: '2026-11-05T19:00:00',
};
/** Conversations de la maison dans my_conversations : deux avec Julie (la plus récente l'emporte), une avec une autre personne. */
const spaceHouseConversation = (n, buyer, createdAt, lastMessageAt) => ({
  conversation_id: `c2000000-0000-4000-8000-00000000000${n}`, kind: 'listing', listing_id: SPACE_HOUSE.listingId.toLowerCase(), listing_snapshot: SPACE_HOUSE,
  buyer_id: buyer, seller_id: USER_ID, created_by: buyer, created_at: createdAt, joined_at: createdAt, other_user_id: buyer, last_message_sender_id: buyer,
  last_message_preview: 'Bonjour, la maison est-elle toujours disponible ?', last_message_at: lastMessageAt, my_role: 'member', left_at: null, last_read_at: null,
  is_archived: false, is_favorite: false, muted_until: null, saves_photos: false, cleared_at: null, other_last_read_at: null, member_count: 2, unread_count: 0,
  last_message_id: null, last_message_kind: 'text', last_message_content: null, group_name: null, group_details: null, group_image_path: null,
  group_purpose: null, ephemeral_seconds: null,
});
const SPACE_HOUSE_CONVERSATIONS = [
  spaceHouseConversation(7, SPACE_REQUESTER_ID, '2026-10-20T09:00:00Z', null),
  spaceHouseConversation(8, SPACE_REQUESTER_ID, '2026-10-21T09:00:00Z', '2026-11-04T18:00:00Z'),
  spaceHouseConversation(9, 'a1000000-0000-4000-8000-0000000000e6', '2026-10-22T09:00:00Z', '2026-11-05T18:00:00Z'),
];
const SPACE_PROJECT_ID = 'C0000000-0000-4000-8000-000000000001';
/** Projet du compte de chaque sorte (ProjectServerRow), critères tels que l'app les écrit. */
const spaceProject = (fields) => ({ user_id: USER_ID, id: SPACE_PROJECT_ID, city: '', purpose: null, completed_steps: [], shared_with_contacts: false, ...fields });
const SPACE_PROJECTS = {
  buy: spaceProject({ kind: 'buy', city: 'Lyon', purpose: 'Résidence principale', completed_steps: ['search', 'visits'],
    criteria: { residential: { maxBudget: 300000, propertyTypes: ['apartment'], location: { place: 'Lyon' } } } }),
  // Celui de la maquette : Investissement, 4 critères sur 7 (57 %), trois étapes franchies.
  invest: spaceProject({ kind: 'invest', completed_steps: ['analysis', 'search', 'visits'],
    criteria: { investment: { maxPrice: 250000, downPayment: 50000, assetTypes: ['apartment'], minGrossYield: 0.05, location: { place: '' } } } }),
  rent: spaceProject({ kind: 'rent', city: 'Villeurbanne', completed_steps: ['application', 'search', 'visits'], shared_with_contacts: true,
    criteria: { rental: { maxRent: 900, propertyTypes: ['apartment'], minArea: 40, minRooms: 2, furnished: true, moveInBy: '2026-12-01T00:00:00.000',
      location: { place: 'Villeurbanne' } } } }),
  hotel: spaceProject({ kind: 'hotel', city: 'Annecy', criteria: { hotel: { maxBudget: 1500000, location: { place: 'Annecy' } } } }),
};
/** Carte du projet attendue (ProjectCard de l'app) : sous-titre, anneau des critères, étapes [libellé, franchie]. */
const SPACE_PROJECT_CARDS = {
  buy: ['Résidence principale · Lyon', '43 %', [['Recherche', true], ['Visites', true], ['Sélection', false], ['Offre', false], ['Signature', false]]],
  invest: ['Investissement', '57 %', [['Recherche', true], ['Analyse', true], ['Visites', true], ['Offre', false], ['Financement', false], ['Signature', false]]],
  rent: ['Location · Villeurbanne', '100 %', [['Recherche', true], ['Visites', true], ['Dossier', true], ['Bail', false], ['Emménagement', false]]],
  hotel: ['Hôtel · Annecy', '33 %', [['Recherche', false], ['Analyse', false], ['Visites', false], ['Audit', false], ['Offre', false], ['Signature', false]]],
  // Sans projet enregistré : le projet par défaut de l'app (Résidentiel, sans ville).
  none: ['Résidentiel', '0 %', [['Recherche', false], ['Visites', false], ['Sélection', false], ['Offre', false], ['Signature', false]]],
};
/** Biens consultés (sessionStorage), du plus récent au plus ancien : une maison vendue depuis, puis trois annonces. */
const SPACE_SOLD = { ...HOME_LISTINGS[2], status: 'sold' };
const SPACE_VIEWED = [SPACE_SOLD.id, listings[0].id, listings[2].id, listings[1].id];
const SPACE_LISTING_ROWS = [...listings, SPACE_SOLD];
/** Demandes servies par mockSpace ; les autres vont au serveur simulé général. */
const SPACE_TABLES = ['real_estate_projects', 'agenda_visits', 'rpc/my_visit_requests', 'rpc/my_visit_sessions', 'rpc/public_profiles', 'rpc/my_conversations',
  'listing_locations'];

function spaceState(fields = {}) {
  return {
    project: structuredClone(SPACE_PROJECTS.buy), visits: structuredClone(SPACE_VISITS), requests: structuredClone(SPACE_REQUESTS), sessions: [],
    conversations: null, myListings: null, calls: [], logouts: [], ...fields,
  };
}

/**
 * Serveur de Mon espace, par-dessus mock() : projet (lecture, upsert), agenda (lecture, ajout), demandes de visite,
 * profils publics, conversations et « Mes annonces » quand l'état les fournit ; déconnexions notées. Sous 1024 px,
 * seulement pour Mon agenda et Ajouter une visite, qui y marchent comme sur ordinateur (demande de Romain du
 * 14 novembre 2026) ; ailleurs, mock() signale la demande.
 */
async function mockSpace(context, space) {
  const cors = { 'access-control-allow-origin': '*' };
  const reply = (route, status, value) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: value === undefined ? '' : JSON.stringify(value) });
  await context.route('https://izzsoitqtzzswkpvdozd.supabase.co/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.replace('/rest/v1/', '');
    const width = pageWidth(request);
    const myListings = table === 'listings' && url.searchParams.get('owner_id') === `eq.${USER_ID}` && space.myListings !== null;
    // Fiche lue par son identifiant : comme Postgres, majuscules ou minuscules (l'app écrit les identifiants en majuscules).
    const detail = table === 'listings' && url.searchParams.get('id')?.startsWith('eq.') ? url.searchParams.get('id').slice(3).toLowerCase() : null;
    const served = SPACE_TABLES.includes(table) && (table !== 'rpc/my_conversations' || space.conversations !== null);
    const phoneAgenda = pagePath(request) === '/compte/' && ['agenda', 'ajouter-visite'].includes(pageView(request));
    if ((!served && !myListings && !detail) || (width !== null && width < 1024 && !phoneAgenda)) return route.fallback();
    let body = null;
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
    const headers = await request.allHeaders();
    space.calls.push({ table, method: request.method(), search: decodeURIComponent(url.search), body, prefer: headers.prefer ?? '', path: pagePath(request) });
    if (myListings) return reply(route, 200, space.myListings);
    if (detail) return reply(route, 200, SPACE_LISTING_ROWS.filter((row) => row.id.toLowerCase() === detail));
    switch (table) {
      case 'real_estate_projects':
        if (request.method() === 'GET') return reply(route, 200, space.project ? [space.project] : []);
        // Upsert sur user_id : la ligne envoyée devient le projet du compte.
        space.project = body;
        return reply(route, 201);
      case 'agenda_visits': {
        if (request.method() === 'GET') return reply(route, 200, space.visits);
        // Annuler (PATCH) et supprimer (DELETE) : la ligne de l'identifiant demandé, majuscules ou minuscules (Postgres).
        const target = url.searchParams.get('id')?.replace(/^eq\./, '').toLowerCase() ?? null;
        if (request.method() === 'PATCH') {
          space.visits = space.visits.map((row) => (row.id.toLowerCase() === target ? { ...row, ...body } : row));
          return reply(route, 204);
        }
        if (request.method() === 'DELETE') {
          space.visits = space.visits.filter((row) => row.id.toLowerCase() !== target);
          return reply(route, 204);
        }
        space.visits.push(body);
        return reply(route, 201);
      }
      case 'rpc/my_visit_requests':
        return reply(route, 200, space.requests);
      case 'rpc/my_visit_sessions':
        return reply(route, 200, space.sessions);
      case 'rpc/public_profiles': {
        const wanted = (body?.user_ids ?? []).map((id) => String(id).toLowerCase());
        return reply(route, 200, SPACE_PROFILES.filter((profile) => wanted.includes(profile.user_id.toLowerCase())));
      }
      case 'rpc/my_conversations':
        return reply(route, 200, space.conversations);
      default:
        return reply(route, 200, []);
    }
  });
  await context.route(/^https:\/\/izzsoitqtzzswkpvdozd\.supabase\.co\/auth\/v1\/logout/, (route) => {
    space.logouts.push({ method: route.request().method(), search: new URL(route.request().url()).search });
    return route.fallback();
  });
  // Photos du compte rendu d'une visite (visit-reports) : la liste de son dossier (space.reportFiles) et leur suppression.
  await context.route(/^https:\/\/izzsoitqtzzswkpvdozd\.supabase\.co\/storage\/v1\/object\/(list\/)?visit-reports(\/|$)/, (route) => {
    const request = route.request();
    let body = null;
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
    const table = `storage ${new URL(request.url()).pathname.replace('/storage/v1/object/', '')}`;
    space.calls.push({ table, method: request.method(), search: '', body, prefer: '', path: pagePath(request) });
    return reply(route, 200, table === 'storage list/visit-reports' ? (space.reportFiles ?? []) : []);
  });
}

/** Demandes `table` (et `method`) reçues par mockSpace depuis `mark`. */
const spaceCalls = (space, table, method, mark = 0) => space.calls.slice(mark).filter((call) => call.table === table && call.method === method);

/** La seule demande `table`/`method` arrivée depuis `mark` (attendue, puis comptée après un court délai). */
async function oneSpaceCall(space, table, method, mark, what) {
  await waitFor(() => spaceCalls(space, table, method, mark).length > 0, `${what} : ${method} ${table}`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const calls = spaceCalls(space, table, method, mark);
  if (calls.length !== 1) problems.push(`${what} : ${calls.length} appel(s) ${method} ${table} au lieu d'un (${JSON.stringify(calls.map((call) => call.body))})`);
  return calls[0] ?? null;
}

/** Ligne « Mon projet » de Mon espace, telle qu'affichée : titre, sous-titre (usage ou catégorie, puis ville), lien. */
async function spaceProjectRow(page) {
  return (await spaceRows(page, 'Mon espace')).find((row) => row[0] === 'Mon projet') ?? null;
}

/** Textes de `selector` (les espaces des icônes retirés), ou de `inner` dans chacun. */
function textsOf(page, selector, inner = null) {
  return page.$$eval(selector, (elements, sub) => elements.map((element) => {
    const target = sub ? element.querySelector(sub) : element;
    return target ? target.textContent.replace(/\s+/g, ' ').trim() : null;
  }), inner);
}

/** Groupe de Mon compte (Mon espace, Contrats et location, Compte et sécurité…), trouvé par son petit titre. */
function spaceGroup(page, title) {
  return page.locator('.app-space .app-menu-group').filter({ has: page.locator('.app-section-label', { hasText: new RegExp(`^${title}$`) }) });
}

/** Lignes d'un groupe de Mon compte (Mon espace, Compte et sécurité, Paramètres…), celles de l'app : titre, sous-titre, lien. */
function spaceRows(page, title) {
  return spaceGroup(page, title).locator('.app-row').evaluateAll((rows) => rows.map((row) => [row.querySelector('.app-row-title')?.textContent.trim() ?? null,
    row.querySelector('.app-row-subtitle')?.textContent.trim() ?? null, row.getAttribute('href')]));
}

/**
 * Cartes de visite de l'onglet affiché, par période (VisitsAgendaView, VisitCard) : bloc date (texte et libellé lu),
 * horaire (barré si annulée), état, teintes [bloc date, état], bien, personne et compte rendu, liens et boutons.
 */
function agendaCards(page) {
  return page.$$eval('.app-visit-group', (groups) => groups.map((group) => {
    const text = (element) => (element ? element.textContent.replace(/\s+/g, ' ').trim() : null);
    const tone = (element) => [...(element?.classList ?? [])].find((name) => name.startsWith('app-tone-'))?.slice(9) ?? null;
    return [text(group.querySelector('.app-section-label')), [...group.querySelectorAll('.app-visit')].map((card) => ({
      block: [...card.querySelectorAll('.app-visit-date > span')].map(text).join(' '),
      date: card.querySelector('.app-visit-date')?.getAttribute('aria-label') ?? null,
      time: text(card.querySelector('.app-visit-time')),
      cancelled: Boolean(card.querySelector('.app-visit-time.is-cancelled')),
      status: text(card.querySelector('.app-visit-pill')),
      tones: [tone(card.querySelector('.app-visit-date')), tone(card.querySelector('.app-visit-pill'))],
      title: text(card.querySelector('.app-visit-title')),
      lines: [...card.querySelectorAll('.app-visit-person, .app-visit-report')].map(text),
      route: card.querySelector('a.app-visit-route')?.getAttribute('href') ?? null,
      request: card.querySelector('a.app-visit-open')?.getAttribute('href') ?? null,
      slots: [...card.querySelectorAll('a.app-visit-button')].find((link) => text(link) === 'Voir les créneaux')?.getAttribute('href') ?? null,
      contact: [...card.querySelectorAll('.app-visit-button')].find((action) => text(action) === 'Message')?.disabled === false,
      menu: Boolean(card.querySelector('.dsc-menu-button')),
    }))];
  }));
}

/**
 * Centre de notifications affiché (NotificationsView) : [petit titre du jour, [[teinte du carré d'icône, photo du bien
 * (« photo », « cadre » sans photo, null sans annonce), heure]]].
 */
function notificationLayout(page) {
  return page.$$eval('.notification-group', (groups) => groups.map((group) => [group.querySelector('.app-section-label')?.textContent ?? null,
    [...group.querySelectorAll('.notification-row')].map((row) => [
      [...(row.querySelector('.notification-icon')?.classList ?? [])].find((name) => name.startsWith('app-tone-'))?.slice(9) ?? null,
      row.querySelector('.notification-photo img') ? 'photo' : row.querySelector('.notification-photo') ? 'cadre' : null,
      row.querySelector('.notification-date')?.textContent ?? '',
    ])]));
}

/** Teinte de chaque sorte de notification (NotificationCenterLayout.tone). */
const NOTIFICATION_TONES = {
  searchMatch: 'blue', accepted: 'blue', rescheduled: 'blue', reminder: 'blue', visitSlotsOpened: 'blue', offerReceived: 'green', offerCountered: 'green',
  offerAccepted: 'green', newRequest: 'amber', proposed: 'amber', rescheduleProposed: 'amber', declined: 'red', rescheduleDeclined: 'red', cancelled: 'red',
  offerDeclined: 'red', offerWithdrawn: 'red',
};
/** Forme de l'heure de chaque jour : « 11:02 », « Hier », « Lun. », « 3 nov. ». */
const NOTIFICATION_TIMES = { 'Aujourd\'hui': /^\d\d:\d\d$/, Hier: /^Hier$/, 'Cette semaine': /^[A-Z][a-zé]+\.$/, 'Plus anciennes': /^\d{1,2} [a-zéû]+\.?$/ };

/**
 * Vérifie le centre de notifications contre les lignes du serveur (`known`, les plus récentes d'abord) : jours dans
 * l'ordre de l'app (selon l'heure de la machine, celle du navigateur), teinte de la sorte, photo du bien, forme de l'heure.
 */
async function checkNotificationLayout(page, name, known) {
  const photos = known.filter((row) => (listings.find((listing) => listing.id === row.listing_id)?.listing_photos?.length ?? 0) > 0).length;
  await page.waitForFunction((count) => document.querySelectorAll('.notification-photo img').length === count, photos, { timeout: 8000 }).catch(() => undefined);
  const start = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const wanted = [];
  for (const row of known) {
    const days = Math.round((start(new Date()) - start(new Date(row.created_at))) / (24 * HOUR));
    const day = days <= 0 ? 'Aujourd\'hui' : days === 1 ? 'Hier' : days < 7 ? 'Cette semaine' : 'Plus anciennes';
    const listing = listings.find((item) => item.id === row.listing_id);
    const photo = row.listing_id === null ? null : listing?.listing_photos?.length ? 'photo' : 'cadre';
    if (wanted.at(-1)?.[0] !== day) wanted.push([day, []]);
    wanted.at(-1)[1].push([NOTIFICATION_TONES[row.kind], photo]);
  }
  const shown = await notificationLayout(page);
  expectSame(name, 'jours, teintes et photos', shown.map(([day, rows]) => [day, rows.map(([tone, photo]) => [tone, photo])]), wanted);
  const times = shown.flatMap(([day, rows]) => rows.filter(([, , time]) => !NOTIFICATION_TIMES[day]?.test(time)).map(([, , time]) => `${day} « ${time} »`));
  if (times.length) problems.push(`${name} : heures ${times.join(', ')}`);
}

/** Biens consultés affichés (lignes de l'app) : titre (celui du lien), ville et surface, prix, statut, lien. */
function viewedRows(page) {
  return page.$$eval('.viewed-row', (rows) => rows.map((row) => [row.querySelector('.viewed-link')?.getAttribute('aria-label') ?? null,
    row.querySelector('.app-listing-location')?.textContent.replace(/\s+/g, ' ') ?? null, row.querySelector('.app-listing-price')?.textContent.replace(/\s+/g, ' ') ?? null,
    row.querySelector('.app-listing-pills')?.textContent ?? null, row.querySelector('.viewed-link')?.getAttribute('href') ?? null]));
}

/** Liste des biens consultés du compte de test, gardée dans ce navigateur (une liste par compte, n° 114). */
const viewedStorage = (page) => page.evaluate((owner) => localStorage.getItem(`nidalo.consultes.${owner}`), USER_ID);

/**
 * Capture d'un écran à barre d'actions collante (Mon projet) : la fenêtre prend la hauteur de la page, sinon la
 * capture de toute la page dessine la barre au milieu.
 */
async function tallShot(page, file) {
  const viewport = page.viewportSize();
  await page.mouse.move(2, 2);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.evaluate(() => document.fonts.ready);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: viewport.width, height });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, file) });
  await page.setViewportSize(viewport);
}

const browser = await chromium.launch();
try {
  // Ordinateur
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
  await mock(desktop);
  // Accueil (étape 7b : celui du téléphone, élargi) : sections, Résidentiel ouvert dans la carte des catégories, menu
  // d'un critère, montant saisi, puis la recherche.
  let page = await open(desktop, '/', 'accueil-ordinateur');
  await page.waitForSelector('.home-category');
  await page.waitForSelector('.home-app-section');
  const yieldChip = await page.locator('.opportunity-card .hlc-yield').first().textContent().catch(() => null);
  if (yieldChip?.replace(/\s/g, ' ') !== '5,5 % brut') problems.push(`accueil : rendement de l'opportunité « ${yieldChip} » au lieu de « 5,5 % brut »`);
  await page.screenshot({ path: join(out, 'accueil-ordinateur.png'), fullPage: true });
  await page.click('.home-category .mode-tab >> nth=0');
  await page.waitForSelector('.home-category-filters');
  await page.waitForTimeout(600);
  await page.click('.criterion-tile >> nth=0');
  await page.waitForSelector('dialog.selection-dialog[open]');
  await page.screenshot({ path: join(out, 'accueil-menu-ordinateur.png') });
  await page.click('dialog[open] .selection-row >> nth=4');
  await page.click('dialog[open] .selection-foot .btn');
  const budget = (await page.textContent('.criterion-tile >> nth=0 >> .criterion-value'))?.replace(/\s/g, ' ');
  if (budget !== '300 000 €') problems.push(`accueil : budget affiché « ${budget} » au lieu de « 300 000 € »`);
  // « Nombre de pièces » : « 1 pièce », « 2 pièces »… sans « et + » (demande du 7 novembre 2026).
  await page.click('.criterion-tile >> nth=3');
  await page.waitForSelector('dialog.selection-dialog[open]');
  const roomTitles = await page.locator('dialog[open] .selection-title').allTextContents();
  if (roomTitles.join(' | ') !== 'Indifférent | 1 pièce | 2 pièces | 3 pièces | 4 pièces | 5 pièces') problems.push(`accueil : pièces « ${roomTitles.join(' | ')} »`);
  await page.screenshot({ path: join(out, 'accueil-pieces-ordinateur.png') });
  await page.click('dialog[open] .selection-row >> nth=2');
  await page.click('dialog[open] .selection-foot .btn');
  const roomsValue = await page.textContent('.criterion-tile >> nth=3 >> .criterion-value');
  if (roomsValue !== '2 pièces') problems.push(`accueil : pièces affichées « ${roomsValue} » au lieu de « 2 pièces »`);
  await page.click('.mode-tab >> nth=1');
  const rent = await page.textContent('.criterion-tile >> nth=0 >> .criterion-value');
  if (rent !== 'Indifférent') problems.push(`accueil : le loyer de Location reprend « ${rent} »`);
  await page.click('.criterion-tile >> nth=0');
  await page.fill('dialog[open] .selection-custom input', '850');
  await page.click('dialog[open] .selection-foot .btn');
  await page.click('.home-search-button');
  await page.waitForURL(/\/recherche\/\?mode=rent&prixMax=850/);
  await page.waitForSelector('.listing-card, .state');
  await page.close();

  // Votre recherche (version ordinateur, étape 2 : la liste et la carte côte à côte) ; la carte est affichée à côté de
  // la liste dès le départ, sans capsule « Carte » ; un clic sur une vignette choisit le bien (sa carte encadrée dans la
  // liste).
  page = await open(desktop, '/recherche/?mode=buy', 'recherche-ordinateur');
  await page.waitForSelector('.listing-card');
  await page.screenshot({ path: join(out, 'recherche-ordinateur-liste.png') });
  await page.waitForSelector('.map-column .map-marker', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'recherche-ordinateur.png') });
  await page.click('.map-marker .map-marker-button');
  await page.waitForSelector('.map-marker.is-selected');
  await page.waitForSelector('.search-results .listing-card.is-selected', { timeout: 4000 }).catch(() => problems.push('carte ordinateur : la carte du bien choisi n\'est pas encadrée dans la liste'));
  await page.screenshot({ path: join(out, 'recherche-ordinateur-apercu.png') });
  await page.waitForSelector('.map-column:not(.is-open)', { state: 'attached' });
  await page.fill('.search-app-top .place-field input', 'lyo');
  await page.waitForSelector('.place-list li');
  await page.screenshot({ path: join(out, 'recherche-suggestions.png'), clip: { x: 0, y: 0, width: 720, height: 520 } });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.search.includes('lieu=Lyon'));
  const beforeFilters = page.url();
  await page.click('.filters-button');
  await page.waitForSelector('dialog.filters-dialog[open]');
  await checkApplyButton(page, 'filtres ordinateur');
  // Plein écran comme la feuille de l'app (étape 7b), le contenu sur la colonne de 720 au milieu (16 dedans) ; mesuré
  // une fois la feuille montée du bas.
  await page.waitForFunction(() => document.querySelector('dialog.filters-dialog')?.getAnimations().every((animation) => animation.playState !== 'running'), null, { timeout: 4000 }).catch(() => undefined);
  expectSame('filtres ordinateur', 'plein écran (x, y, largeur, hauteur)', await page.$eval('dialog.filters-dialog', (dialog) => {
    const box = dialog.getBoundingClientRect();
    return [box.x, box.y, box.width, box.height];
  }), [0, 0, 1440, 900]);
  expectSame('filtres ordinateur', 'en-tête et « Afficher » sur la colonne (x, largeur)', await page.$$eval('dialog[open] :is(.filters-header, .filters-apply .btn)',
    (items) => items.map((item) => [Math.round(item.getBoundingClientRect().x), Math.round(item.getBoundingClientRect().width)])), [[376, 688], [376, 688]]);
  // Ordre de l'app : en-tête, pavés des catégories, localisation, pastilles, critères.
  expectSame('filtres ordinateur', 'ordre', await page.$eval('dialog[open] .filters-scroll', (scroll) => [...scroll.querySelectorAll('.filters-header, .filters-modes, .filter-card')]
    .slice(0, 3).map((el) => el.querySelector('h3')?.textContent ?? el.classList[el.classList.length - 1])), ['filters-header', 'filters-modes', 'Localisation']);
  // Pièces et chambres sur une seule ligne chacune, comme l'app : 3 puis 4 allument 3 et 4 (« De 3 à 4 ») ; chambres 1
  // puis 2. Un critère choisi apparaît en pastille retirable ; le DPE affiche sa fourchette.
  const roomsRow = (name) => page.getByRole('group', { name: `${name} minimum et maximum` });
  const rowState = (name) => roomsRow(name).evaluate((group) => [group.querySelector('.field-value')?.textContent,
    [...group.querySelectorAll('.choice-chip')].map((chip) => `${chip.textContent}${chip.getAttribute('aria-pressed') === 'true' ? ' allumé' : ''}`)]);
  expectSame('filtres', 'lignes Pièces et Chambres', [await rowState('Pièces'), await rowState('Chambres'), await page.locator('dialog[open] [role="group"][aria-labelledby]', { hasText: /maximum$/ }).count()],
    [['Indifférent', ['Studio', '2', '3', '4', '5+']], ['Indifférent', ['1', '2', '3', '4', '5+']], 0]);
  await roomsRow('Pièces').getByRole('button', { name: '3', exact: true }).click();
  expectSame('filtres', 'pièces : un seul appui', await rowState('Pièces'), ['Exactement 3', ['Studio', '2', '3 allumé', '4', '5+']]);
  await roomsRow('Pièces').getByRole('button', { name: '4', exact: true }).click();
  await roomsRow('Chambres').getByRole('button', { name: '1', exact: true }).click();
  await roomsRow('Chambres').getByRole('button', { name: '2', exact: true }).click();
  expectSame('filtres', 'pièces 3 puis 4, chambres 1 puis 2', [await rowState('Pièces'), await rowState('Chambres')],
    [['De 3 à 4', ['Studio', '2', '3 allumé', '4 allumé', '5+']], ['De 1 à 2', ['1 allumé', '2 allumé', '3', '4', '5+']]]);
  await page.getByRole('button', { name: 'DPE C', exact: true }).click();
  const dpe = await page.getByRole('group', { name: 'DPE maximum accepté' }).locator('.field-value').textContent();
  if (dpe !== 'DPE A à C') problems.push(`filtres : DPE affiché « ${dpe} » au lieu de « DPE A à C »`);
  const chips = await page.locator('dialog[open] .criterion-chip:not(.is-leaving)').allTextContents();
  if (!chips.some((c) => c.includes('3 à 4 pièces')) || !chips.some((c) => c.includes('1 à 2 chambres')) || !chips.some((c) => /DPE/.test(c))) {
    problems.push(`filtres : pastilles « ${chips.join(' | ')} »`);
  }
  // Pastilles blanches de l'app : ici, seule la croix agit (le libellé n'est pas un bouton).
  expectSame('filtres', 'pastilles : seule la croix agit', await page.$$eval('dialog[open] .criterion-chip:not(.is-leaving)', (items) => [...new Set(items.map((item) =>
    `${[...item.querySelectorAll('button')].map((button) => button.className).join(',')} | ${item.querySelector('.criterion-chip-label').tagName}`))]), ['criterion-chip-remove | SPAN']);
  await page.getByRole('heading', { name: 'Surface et pièces' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, 'filtres-ordinateur.png') });
  // Un troisième appui recommence la ligne ; « 5+ » ferme la fourchette sans maximum ; retoucher le seul choix l'efface.
  await roomsRow('Pièces').getByRole('button', { name: '2', exact: true }).click();
  await roomsRow('Pièces').getByRole('button', { name: '5+', exact: true }).click();
  expectSame('filtres', 'pièces 2 puis 5+', [await rowState('Pièces'), (await page.locator('dialog[open] .criterion-chip:not(.is-leaving)').allTextContents()).filter((c) => /pièce/.test(c))],
    [['2 ou plus', ['Studio', '2 allumé', '3 allumé', '4 allumé', '5+ allumé']], ['2 pièces min ']]);
  await roomsRow('Pièces').getByRole('button', { name: '4', exact: true }).click();
  await roomsRow('Pièces').getByRole('button', { name: '4', exact: true }).click();
  expectSame('filtres', 'pièces effacées', [await rowState('Pièces'), (await page.locator('dialog[open] .criterion-chip:not(.is-leaving)').allTextContents()).filter((c) => /pièce/.test(c))],
    [['Indifférent', ['Studio', '2', '3', '4', '5+']], []]);
  await roomsRow('Pièces').getByRole('button', { name: '3', exact: true }).click();
  await roomsRow('Pièces').getByRole('button', { name: '4', exact: true }).click();
  // Investir : rentabilité, situation locative ; puis Hôtels.
  await page.click('dialog[open] .filters-modes .mode-tab >> nth=2');
  await page.getByRole('heading', { name: 'Rentabilité' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, 'filtres-investir-ordinateur.png') });
  await page.click('dialog[open] .filters-modes .mode-tab >> nth=3');
  await page.getByRole('heading', { name: 'Établissement et exploitation' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, 'filtres-hotels-ordinateur.png') });
  await page.click('dialog[open] .filters-modes .mode-tab >> nth=2');
  await page.getByLabel('Rendement brut minimum').fill('5');
  await checkApplyButton(page, 'filtres Investir');
  await page.click('dialog[open] .filters-apply .btn');
  await page.waitForFunction(() => location.search.includes('mode=invest') && location.search.includes('brutMin=5'));
  if (await page.locator('dialog.filters-dialog[open]').count()) problems.push('filtres : la fenêtre reste ouverte après « Afficher »');
  // Retour (navigateur) après « Afficher » : la recherche d'avant, sans repasser par la page des critères.
  await page.goBack();
  await page.waitForFunction((url) => location.href === url, beforeFilters, { timeout: 4000 })
    .catch(() => problems.push(`filtres : Retour après « Afficher » mène à ${page.url()} au lieu de ${beforeFilters}`));
  if (await page.locator('dialog.filters-dialog[open]').count()) problems.push('filtres : Retour après « Afficher » rouvre la page des critères');
  await page.close();

  // Investir : chiffres du moteur de l'app sur la fiche du bien loué (850 €/mois pour 185 000 €).
  page = await open(desktop, '/recherche/?mode=invest', 'investir-ordinateur');
  await page.waitForSelector('.listing-card');
  const investCard = (await page.textContent('.listing-card'))?.replace(/\s/g, ' ') ?? '';
  for (const expected of [/Rendement brut\s*5,5 %/, /Loyer encaissé\s*850 €\/mois/, /Cash-flow estimé\s*−474 €\/mois/]) {
    if (!expected.test(investCard)) problems.push(`investir : ${expected} absent de la fiche (« ${investCard.slice(0, 200)} »)`);
  }
  await page.screenshot({ path: join(out, 'investir-ordinateur.png') });
  for (const [path, name] of [['/aide/', 'aide'], ['/favoris/', 'favoris'], ['/page-inexistante/', '404']]) {
    const p = await open(desktop, path, name);
    await p.screenshot({ path: join(out, `${name}-ordinateur.png`) });
    await p.close();
  }

  // Étape 2, sans compte : carte de connexion, fenêtre ouverte par un cœur, conditions d'utilisation.
  page = await open(desktop, '/compte/', 'compte-connexion');
  await page.waitForSelector('.signin-card');
  await page.screenshot({ path: join(out, 'compte-connexion-ordinateur.png') });
  await page.close();
  page = await open(desktop, '/recherche/?mode=buy', 'coeur-sans-compte');
  await page.waitForSelector('.listing-card .heart-button');
  await page.click('.listing-card .heart-button >> nth=0');
  await page.waitForSelector('dialog.signin-sheet[open]');
  if (page.url().includes('/annonce/')) problems.push('cœur sans compte : le clic a ouvert l\'annonce');
  await page.screenshot({ path: join(out, 'connexion-fenetre-ordinateur.png') });
  await page.close();
  page = await open(desktop, '/conditions/', 'conditions');
  await page.waitForSelector('main h1');
  if ((await page.content()).includes('{{EDITEUR}}')) problems.push('conditions : {{EDITEUR}} non remplacé');
  await page.screenshot({ path: join(out, 'conditions-ordinateur.png') });
  await page.close();
  await desktop.close();

  // Étape 2, avec le compte de test (serveur simulé).
  const signed = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
  const signedServer = await mock(signed, { signedIn: true });
  // Accueil sur ordinateur : plus de « Bonjour Claire » ; la cloche de l'en-tête (version ordinateur, étape 1 : la barre
  // du haut de l'accueil n'y est plus) dit les non lues du compte.
  page = await open(signed, '/', 'accueil-connecte');
  const homeUnread = expectedBadges(signedServer.state).notifications;
  const homeBell = homeUnread > 0 ? `Notifications, ${homeUnread} non lues` : 'Notifications';
  await page.waitForFunction((label) => document.querySelector('.site-header-bell')?.getAttribute('aria-label') === label, homeBell, { timeout: 8000 })
    .catch(async () => problems.push(`accueil connecté : cloche « ${await page.getAttribute('.site-header-bell', 'aria-label')} » au lieu de « ${homeBell} »`));
  await page.close();
  // Sur ordinateur, Mon compte du téléphone dans la colonne (voir « Mon compte sur ordinateur » plus bas).
  page = await open(signed, '/compte/', 'compte-espace');
  await page.waitForSelector('.app-space .space-profile');
  await page.waitForSelector('.app-space .app-row');
  await page.waitForFunction(() => /1 en ligne/.test(document.querySelector('.app-space')?.innerText ?? ''), null, { timeout: 8000 }).catch(() => undefined);
  const space = (await textOf(page, '.app-space')) ?? '';
  for (const expected of ['Claire Martin', USER_EMAIL, 'Particulier', 'Mon projet', 'Résidence principale · Lyon', '2 recherches enregistrées', '1 en ligne']) {
    if (!space.includes(expected)) problems.push(`Mon compte : « ${expected} » absent`);
  }
  await page.screenshot({ path: join(out, 'compte-espace-ordinateur.png'), fullPage: true });
  await page.close();
  page = await open(signed, '/compte/?vue=informations', 'mes-informations');
  await page.waitForSelector('input[autocomplete="tel"]');
  const phoneValue = await page.inputValue('input[autocomplete="tel"]');
  if (phoneValue !== '06 39 98 12 34') problems.push(`Mes informations : téléphone « ${phoneValue} »`);
  await page.screenshot({ path: join(out, 'mes-informations-ordinateur.png'), fullPage: true });
  await page.close();
  page = await open(signed, '/compte/?vue=recherches', 'mes-recherches');
  await page.waitForSelector('.saved-search');
  const searches = await page.locator('.saved-search').count();
  if (searches !== 2) problems.push(`Mes recherches : ${searches} cartes au lieu de 2`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, 'mes-recherches-ordinateur.png'), fullPage: true });
  await page.close();
  page = await open(signed, '/compte/?vue=annonces', 'mes-annonces');
  await page.waitForSelector('.my-listing');
  await page.screenshot({ path: join(out, 'mes-annonces-ordinateur.png'), fullPage: true });
  await page.close();
  // Mes annonces : « Publiée le » donne la date de publication, sinon « Mise à jour le » (n° 223) ; l'onglet vidé par
  // « Republier » disparaît et la page revient sur « Toutes » (n° 120).
  {
    const L = 'Mes annonces';
    const owned = [
      { ...listings[2], owner_id: USER_ID, status: 'active', published_at: '2026-11-04T08:00:00Z', updated_at: '2026-11-05T17:00:00Z' },
      { ...listings[1], owner_id: USER_ID, status: 'archived', published_at: '2026-10-20T08:00:00Z', updated_at: '2026-11-02T09:00:00Z' },
      { ...listings[0], owner_id: USER_ID, status: 'active', published_at: null, updated_at: '2026-11-01T09:00:00Z' },
    ];
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    await mock(context, { signedIn: true });
    const patches = [];
    await context.route(/^https:\/\/izzsoitqtzzswkpvdozd\.supabase\.co\/rest\/v1\/listings\?/, (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const reply = (body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (request.method() === 'GET' && url.searchParams.get('owner_id') === `eq.${USER_ID}`) return reply(owned);
      if (request.method() === 'PATCH') {
        const row = owned.find((item) => `eq.${item.id}` === url.searchParams.get('id'));
        patches.push([url.searchParams.get('id'), request.postDataJSON()]);
        if (row) Object.assign(row, request.postDataJSON());
        return reply(row ? [{ id: row.id }] : []);
      }
      return route.fallback();
    });
    page = await open(context, '/compte/?vue=annonces', 'mes-annonces-onglets');
    await page.waitForSelector('.my-listing');
    const tabsShown = () => page.$$eval('.my-listings-tabs .select-chip', (chips) => chips.map((chip) => [chip.textContent.trim(), chip.getAttribute('aria-selected')]));
    expectSame(L, 'dates', await page.$$eval('.my-listing-date', (lines) => lines.map((line) => line.textContent)),
      ['Publiée le 4 novembre', 'Mise à jour le 2 novembre', 'Mise à jour le 1 novembre']);
    await page.click('.my-listings-tabs .select-chip:has-text("Suspendues")');
    expectSame(L, 'onglet Suspendues', [await tabsShown(), await page.locator('.my-listing').count()],
      [[['Toutes 3', 'false'], ['En ligne 2', 'false'], ['Suspendues 1', 'true']], 1]);
    await page.getByRole('button', { name: 'Republier' }).click();
    await page.waitForFunction(() => document.querySelector('.my-listings-tabs .select-chip.is-selected')?.textContent.trim() === 'Toutes 3', null, { timeout: 8000 })
      .catch(() => problems.push(`${L} : après « Republier », la page ne revient pas sur « Toutes »`));
    expectSame(L, 'après « Republier »', [patches, await tabsShown(), await page.locator('.my-listing').count(), await page.locator('.account-empty').count()],
      [[[`eq.${listings[1].id}`, { status: 'active' }]], [['Toutes 3', 'true'], ['En ligne 3', 'false']], 3, 0]);
    await page.close();
    await context.close();
  }

  // Favoris : deux annonces chargées, une retirée, la recherche dans les favoris, les recherches enregistrées.
  // À 1440 px, la page de l'ordinateur (version ordinateur, étape 4) ; voir aussi « Favoris sur ordinateur » plus bas.
  page = await open(signed, '/favoris/', 'favoris-connecte');
  await page.waitForSelector('.favorite-card');
  await page.waitForSelector('.missing-card');
  const favoriteCount = await page.locator('.favorite-card').count();
  if (favoriteCount !== 2) problems.push(`Favoris : ${favoriteCount} cartes au lieu de 2`);
  const total = (await page.textContent('.favorites-total'))?.trim();
  if (total !== '2 biens sauvegardés') problems.push(`Favoris : compteur « ${total} »`);
  await page.screenshot({ path: join(out, 'favoris-connecte-ordinateur.png'), fullPage: true });
  await page.fill('.favorites-field input', 'villeur');
  await page.waitForFunction(() => document.querySelector('.favorites-total')?.textContent?.trim() === '1 sur 2 biens', null, { timeout: 4000 })
    .catch(async () => problems.push(`Favoris : recherche « villeur », compteur « ${await page.textContent('.favorites-total')} »`));
  await page.screenshot({ path: join(out, 'favoris-recherche-ordinateur.png') });
  // Ordinateur (étape 4, maquette 08-favoris.html) : pas d'onglets, les recherches dans la colonne de droite, à côté des
  // favoris ; l'adresse ne change pas.
  await page.waitForSelector('.favorites-column.is-searches .favorites-searches .saved-search');
  if (page.url() !== `${base}/favoris/`) problems.push(`Favoris : adresse ${page.url()}`);
  if (await page.locator('.fav-tab').count()) problems.push('Favoris : onglets affichés sur ordinateur');
  await page.screenshot({ path: join(out, 'favoris-recherches-ordinateur.png'), fullPage: true });
  await page.close();

  // Recherche : cœur déjà rempli pour un favori ; « Enregistrer cette recherche » écrit le format de l'app.
  page = await open(signed, '/recherche/?mode=buy&lieu=Lyon', 'recherche-connecte');
  await page.waitForSelector('.listing-card');
  // Les deux annonces à vendre sont en favoris : chaque carte affichée a son cœur rempli.
  await page.waitForFunction(() => {
    const hearts = [...document.querySelectorAll('.listing-card .heart-button')];
    return hearts.length > 0 && hearts.every((heart) => heart.getAttribute('aria-pressed') === 'true');
  }, null, { timeout: 8000 })
    .catch(async () => problems.push(`recherche connectée : ${await page.locator('.listing-card .heart-button[aria-pressed="true"]').count()} cœurs remplis sur ${await page.locator('.listing-card').count()} cartes`));
  // « Enregistrer » compact (SearchView de l'app) : la feuille (nom proposé, alerte activée), puis le message du bas
  // « Recherche enregistrée · Voir » et le bouton « Enregistrée ».
  expectSame('enregistrer', 'bouton', await page.textContent('.save-search-button'), 'Enregistrer');
  await page.click('.save-search-button');
  await page.waitForSelector('dialog.save-search-sheet[open] .save-search-name');
  const proposed = await page.inputValue('dialog[open] .save-search-name');
  expectSame('enregistrer', 'feuille', [await page.textContent('dialog[open] h2'), await page.textContent('dialog[open] .save-search-titles p'),
    await page.textContent('dialog[open] .save-search-alert-title'), await page.textContent('dialog[open] .save-search-alert-sub'),
    await page.isChecked('dialog[open] .save-search-alert .switch'), await page.textContent('dialog[open] .save-search-submit')],
  ['Enregistrer cette recherche', 'Vous la retrouverez dans Favoris, onglet Recherches.', "M'alerter des nouveautés", "Dès qu'une annonce correspond", true, 'Enregistrer']);
  await page.screenshot({ path: join(out, 'enregistrer-recherche-ordinateur.png') });
  await page.click('dialog[open] .save-search-submit');
  await page.waitForSelector('.save-search-button.is-saved');
  await page.waitForSelector('.app-toast');
  expectSame('enregistrer', 'message et bouton', [await page.textContent('.app-toast-text'), await page.textContent('.app-toast-action'),
    await page.textContent('.save-search-button'), await page.locator('dialog.save-search-sheet[open]').count()],
  ['Recherche enregistrée', 'Voir', 'Enregistrée', 0]);
  await page.screenshot({ path: join(out, 'enregistrer-recherche-message-ordinateur.png') });
  const saved = writes.find((w) => w.table === 'saved_searches' && w.method === 'POST');
  if (!saved) problems.push('enregistrer : aucune recherche envoyée au serveur');
  else {
    const query = saved.body?.query ?? {};
    if (saved.body?.name !== proposed) problems.push(`enregistrer : nom « ${saved.body?.name} » au lieu de « ${proposed} »`);
    if (saved.body?.alerts_enabled !== true) problems.push(`enregistrer : alerte ${saved.body?.alerts_enabled} au lieu de true`);
    if (query.transaction !== 'sale' || !query.location?.around || query.location.around.radiusMeters !== 10000) {
      problems.push(`enregistrer : requête ${JSON.stringify(query)}`);
    }
    if (JSON.stringify(query).includes('null')) problems.push('enregistrer : valeur null dans la requête (l\'iPhone ne la lirait pas)');
  }
  await page.close();
  page = await open(signed, `/annonce/?id=${listings[0].id}`, 'annonce-connecte');
  // Sur ordinateur, « Favori » est en haut de la fiche, à côté de « Partager » et « Comparer » (version ordinateur,
  // maquette 05) ; sur téléphone, le cœur est posé sur la photo.
  await page.waitForSelector('.listing-tool-heart[aria-pressed]');
  if ((await page.getAttribute('.listing-tool-heart[aria-pressed]', 'aria-pressed')) !== 'true') problems.push('annonce : le cœur d\'un favori n\'est pas rempli');
  await page.close();
  await signed.close();

  // Ordinateur (≥ 1024 px) : le cadre de l'ordinateur (version ordinateur, étape 0) : l'en-tête, sa pastille Messages,
  // le pied de page de l'ordinateur, colonne de 720 px des pages que l'app n'a pas, écran de connexion (colonne de
  // 440 px, maquette 13) et Notifications, à 1440 × 900 et 1024 × 768, sans compte puis avec le compte de test.
  // Captures à ×2, comme les maquettes de Romain.
  for (const [width, height] of [[1440, 900], [1024, 768]]) {
    const margin = width >= 1280 ? 48 : 32;
    const guest = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR' });
    await mock(guest);
    page = await open(guest, '/', `barre-${width}-sans-compte`);
    await page.waitForSelector('.site-header');
    await page.waitForSelector('.home-app-section');
    await checkChrome(page, `accueil ${width} sans compte`, { signedIn: false, current: '/', footer: 'large' });
    await page.locator('.site-header').screenshot({ path: join(out, `en-tete-${width}-sans-compte.png`) });
    await page.locator('footer.site-footer').screenshot({ path: join(out, `pied-de-page-${width}.png`) });
    await page.screenshot({ path: join(out, `accueil-${width}-sans-compte.png`), fullPage: true });
    await page.close();
    // Recherche (version ordinateur, étape 2 : maquette 04) : les catégories changent la recherche ; sous l'en-tête, le
    // bandeau blanc (retour, catégories, lieu, filtres), puis la liste à gauche (58 % de la largeur ; 2 colonnes de cartes à
    // 1440, 1 à 1024 où deux cartes n'auraient plus 280 px) et la carte à droite, toutes deux jusqu'au bas de la fenêtre,
    // sans capsule « Carte », ni ligne du haut ou panneau de la carte du téléphone, ni pied de page ; la page ne défile
    // pas (la liste défile dans sa colonne) : l'en-tête et le bandeau restent en haut ; « vue=carte » ouvre la même page.
    page = await open(guest, '/recherche/?mode=invest', `recherche-${width}`);
    await page.waitForSelector('.listing-card');
    await checkChrome(page, `recherche ${width}`, { signedIn: false, current: '/', footer: null });
    await page.click('.mode-tabs-search .mode-tab >> nth=1');
    await page.waitForURL(/\/recherche\/\?mode=rent$/);
    await page.waitForSelector('.listing-card');
    const start = await page.evaluate(() => ({
      map: getComputedStyle(document.querySelector('.map-column')).display,
      pill: document.querySelectorAll('.map-open').length > 0,
      columns: getComputedStyle(document.querySelector('.results-list')).gridTemplateColumns.split(' ').length,
      column: Math.round(document.querySelector('.search-results').getBoundingClientRect().width),
      lefts: ['.search-app-top', '.search-app-top .mode-tabs-search', '.results-head', '.results-list'].map((selector) => Math.round(document.querySelector(selector).getBoundingClientRect().left)),
    }));
    // Le bandeau au bord de la fenêtre avec ses 24 dedans (les catégories après le retour de 48 et 12 d'écart), titre et
    // cartes à 24 du bord.
    expectSame(`recherche ${width}`, 'au départ', start, { map: 'block', pill: false, columns: width === 1440 ? 2 : 1, column: Math.round(width * 0.58), lefts: [0, 84, 24, 24] });
    await page.mouse.move(Math.round(width * 0.3), height - 100);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    const scrolled = await page.evaluate(() => [window.scrollY, document.querySelector('.site-header').getBoundingClientRect().top,
      document.querySelector('.search-app-top').getBoundingClientRect().top - document.querySelector('.site-header').getBoundingClientRect().bottom]);
    if (scrolled[0] !== 0 || scrolled[1] !== 0 || scrolled[2] !== 0) {
      problems.push(`recherche ${width} : après la molette, page défilée de ${scrolled[0]} px, en-tête à ${scrolled[1]} px du haut, bandeau à ${scrolled[2]} px sous l'en-tête`);
    }
    await page.waitForSelector('.map-column .map-marker', { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, `recherche-${width}.png`) });
    const split = await page.evaluate(() => {
      const box = document.querySelector('.map-column').getBoundingClientRect();
      return [Math.round(box.top) === Math.round(document.querySelector('.search-head').getBoundingClientRect().bottom), Math.round(box.bottom), Math.round(box.left),
        Math.round(box.right) === document.documentElement.clientWidth, location.search.includes('vue=carte'), document.querySelectorAll('.map-app-top, .map-panel, .map-open').length];
    });
    expectSame(`recherche ${width}`, 'carte à côté de la liste [sous le bandeau, bas, gauche, jusqu\'au bord, adresse, éléments de la carte du téléphone]', split,
      [true, height, Math.round(width * 0.58), true, false, 0]);
    // « vue=carte » (adresse gardée d'une visite sur téléphone) : la même page, la liste et la carte ; Échap n'y change rien.
    await page.goto(`${base}/recherche/?mode=rent&vue=carte`);
    await page.waitForSelector('.map-column .map-marker', { timeout: 15000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expectSame(`recherche ${width}`, 'vue=carte [liste, carte, carte du téléphone, adresse après Échap]', await page.evaluate(() => [
      document.querySelectorAll('.search-results .listing-card').length > 0, getComputedStyle(document.querySelector('.map-column')).display,
      document.querySelectorAll('.map-column.is-open, .map-app-top, .map-panel').length, location.search.includes('vue=carte')]), [true, 'block', 0, true]);
    await page.screenshot({ path: join(out, `recherche-carte-${width}.png`) });
    await page.close();
    // Beaucoup de biens : la liste défile seule dans sa colonne (molette au-dessus d'elle), la page et la carte restent.
    const many = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'fr-FR' });
    await mock(many, { listingRows: [...listings, ...HOME_LISTINGS] });
    page = await open(many, '/recherche/?mode=buy', `recherche-liste-${width}`);
    await page.waitForSelector('.listing-card');
    await page.waitForSelector('.map-column .map-marker', { timeout: 15000 });
    const mapTop = await page.evaluate(() => document.querySelector('.map-column').getBoundingClientRect().top);
    await page.mouse.move(Math.round(width * 0.3), height - 100);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(400);
    expectSame(`recherche ${width}`, 'liste défilée [colonne, page, carte]', await page.evaluate((top) => [document.querySelector('.search-results').scrollTop > 0,
      window.scrollY, document.querySelector('.map-column').getBoundingClientRect().top === top], mapTop), [true, 0, true]);
    await page.close();
    await many.close();
    // Pages que l'app n'a pas : l'écran du téléphone dans la colonne de 720 px (16 de marge de chaque côté), avec son
    // retour et son titre en haut, le h1 lu par les lecteurs d'écran.
    for (const [path, name, selector, title] of [['/aide/', 'aide', 'article.doc', 'Aide'], ['/mentions-legales/', 'mentions-legales', 'article.doc', 'Mentions légales'],
      ['/page-inexistante/', '404', 'main .wrap-narrow', 'Page introuvable']]) {
      const p = await open(guest, path, `${name}-${width}`);
      await p.waitForSelector(`${selector} h1`);
      const column = await contentWidth(p, selector);
      if (column !== 688) problems.push(`${name} ${width} : colonne de ${column} px au lieu de 688`);
      expectSame(`${name} ${width}`, 'retour et titre [largeur, centré, titre, retour, h1 masqué]', await p.evaluate(() => {
        const head = document.querySelector('.phone-page-head');
        const box = head?.getBoundingClientRect();
        return box && box.width > 0 ? [Math.round(box.width), Math.abs(box.left + box.width / 2 - innerWidth / 2) <= 1, head.querySelector('.app-page-header-title')?.textContent ?? null,
          head.querySelector('.app-round')?.getAttribute('aria-label') ?? null, Math.round(document.querySelector('main h1').getBoundingClientRect().width) <= 1] : null;
      }), [720, true, title, 'Retour', true]);
      await checkChrome(p, `${name} ${width}`, { signedIn: false });
      if (name === 'mentions-legales' && !(await p.textContent('article.doc'))?.includes('Inter (SIL Open Font License 1.1)')) problems.push('mentions légales : crédit de la police Inter absent');
      await p.screenshot({ path: join(out, `${name}-${width}.png`), fullPage: true });
      await p.close();
    }
    // Publier et Mon compte sans compte : l'écran de connexion de l'app, plein écran, dans la colonne (la publication
    // elle-même est vérifiée par check-publish.mjs).
    for (const [path, name] of [['/publier/', 'publier'], ['/compte/', 'connexion']]) {
      const p = await open(guest, path, `${name}-${width}`);
      await checkSignInScreen(p, `${name} ${width}`);
      await p.screenshot({ path: join(out, `${name}-${width}.png`) });
      await p.close();
    }
    // Notifications sans compte : l'écran de l'app, avec son message (la cloche de l'app s'ouvre aussi sans compte).
    page = await open(guest, '/compte/?vue=notifications', `notifications-${width}-sans-compte`);
    await page.waitForSelector('.notifications-screen .app-unavailable');
    const guestText = (await page.textContent('.notifications-screen'))?.replace(/\s+/g, ' ') ?? '';
    for (const text of ['Notifications', 'Aucune notification pour l’instant', 'Connectez-vous pour recevoir les réponses à vos demandes de visite et les rappels.']) {
      if (!guestText.includes(text)) problems.push(`notifications sans compte ${width} : « ${text} » absent`);
    }
    if (await page.locator('.notifications-read-all').count()) problems.push(`notifications sans compte ${width} : « Tout lire » affiché`);
    await page.screenshot({ path: join(out, `notifications-${width}-sans-compte.png`), fullPage: true });
    await page.close();
    if (badgeRequests.some((request) => !request.signedIn)) problems.push('sans compte : pastilles ou notifications demandées au serveur');
    await guest.close();

    // Avec le compte de test : la pastille Messages de l'en-tête (celle de la barre d'onglets, n° 44, comme sur
    // téléphone) : lue à l'ouverture de la page et au retour sur l'onglet, sans temps réel hors de la page Messages et de
    // l'écran Notifications ; la cloche de l'en-tête ne lit rien elle-même (son point suit les notifications que la page
    // lit déjà : l'accueil et Mon compte, qui lisent les notifications non lues).
    const member = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR' });
    const live = await mock(member, { signedIn: true });
    let asked = badgeRequests.length;
    page = await open(member, '/', `accueil-${width}-connecte`);
    await page.waitForSelector('.home-app-section');
    await page.waitForFunction(() => /non lues/.test(document.querySelector('.site-header-bell')?.getAttribute('aria-label') ?? ''), null, { timeout: 8000 }).catch(() => undefined);
    await checkTabBarBadge(page, live.state, `accueil ${width} connecté`);
    await checkChrome(page, `accueil ${width} connecté`, { signedIn: true, current: '/', footer: 'large' });
    const conversationsCall = badgeRequests.slice(asked).find((request) => request.table === 'rpc/my_conversations');
    if (!conversationsCall || conversationsCall.method !== 'POST' || JSON.stringify(conversationsCall.body) !== '{}') {
      problems.push(`pastille Messages : my_conversations appelée ${JSON.stringify(conversationsCall)} au lieu d'un POST sans paramètre`);
    }
    expectSame(`accueil ${width} connecté`, 'lectures des pastilles et temps réel', [[...new Set(badgeRequests.slice(asked).map((request) => request.table))].sort(), live.followed()],
      [['notifications', 'rpc/my_conversations'], []]);
    await page.locator('.site-header').screenshot({ path: join(out, `en-tete-${width}-connecte.png`) });
    await page.screenshot({ path: join(out, `accueil-${width}-connecte.png`), fullPage: true });
    // Retour sur l'onglet : les non-lus sont relus, comme l'app au retour au premier plan (message reçu, conversation lue
    // ailleurs).
    live.state.conversations[1].unread_count += 2;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await checkTabBarBadge(page, live.state, `retour sur l'onglet ${width} : nouveau message`);
    live.state.conversations[0].unread_count = 0;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await checkTabBarBadge(page, live.state, `retour sur l'onglet ${width} : conversation lue`);
    // Plus de 99 messages non lus : « 99+ », comme l'app (n° 44).
    live.state.conversations[0].unread_count = 120;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await checkTabBarBadge(page, live.state, `plus de 99 non lus ${width}`);
    if (width === 1440) await page.locator('.site-header').screenshot({ path: join(out, `en-tete-${width}-99-plus.png`) });
    live.state.conversations[0].unread_count = 1;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await checkTabBarBadge(page, live.state, `retour à 1 non lu ${width}`);
    await page.close();

    asked = badgeRequests.length;
    page = await open(member, '/compte/?vue=notifications', `notifications-${width}`);
    await page.waitForSelector('.notification-row');
    // Lecture des notifications : celle de l'app.
    const notificationsCall = badgeRequests.slice(asked).find((request) => request.table === 'notifications');
    const query = new URLSearchParams(notificationsCall?.search ?? '');
    if (query.get('select') !== 'id,kind,request_id,listing_id,conversation_id,offer_id,title,body,created_at,read_at' || query.get('order') !== 'created_at.desc' || query.get('limit') !== '200') {
      problems.push(`notifications : lecture ${notificationsCall?.search} au lieu de celle de l'app`);
    }
    const rows = await page.$$eval('.notification-row', (links) => links.map((link) => [link.querySelector('.notification-title')?.textContent, link.getAttribute('href'), Boolean(link.querySelector('.notification-dot'))]));
    const known = live.state.notifications.filter((row) => NOTIFICATION_KINDS.includes(row.kind)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (rows.length !== known.length) problems.push(`notifications ${width} : ${rows.length} lignes au lieu de ${known.length} (sorte inconnue comprise ?)`);
    const unreadRows = rows.filter((row) => row[2]).length;
    if (unreadRows !== expectedBadges(live.state).notifications) problems.push(`notifications ${width} : ${unreadRows} non lues affichées au lieu de ${expectedBadges(live.state).notifications}`);
    const hrefs = rows.map((row) => row[1]);
    for (const href of [`/messages/?c=${conversationId(1)}`, `/annonce/?id=${listings[0].id}`, '/compte/?vue=demande-visite&id=e0000000-0000-4000-8000-000000000003']) {
      if (!hrefs.includes(href)) problems.push(`notifications ${width} : aucun lien vers ${href} (${JSON.stringify(hrefs)})`);
    }
    await checkNotificationLayout(page, `notifications ${width}`, known);
    await checkChrome(page, `notifications ${width}`, { signedIn: true, current: '/compte/' });
    // L'écran du téléphone dans la colonne de 720 px (688 de contenu, étape 7e) ; comme sur téléphone, seules les
    // notifications sont suivies en direct, et la pastille Messages est lue sans temps réel.
    if ((await contentWidth(page, '.account-wrap')) !== 688) problems.push(`notifications ${width} : colonne de ${await contentWidth(page, '.account-wrap')} px au lieu de 688`);
    expectSame(`notifications ${width}`, 'en-tête', [await page.getAttribute('.app-page-header .app-round', 'href'), await textOf(page, '.app-page-header-title'),
      await textOf(page, '.app-page-header-trailing')], ['/compte/', 'Notifications', 'Tout lire']);
    await waitFor(() => live.followed().includes('notifications'), `notifications ${width} : temps réel`);
    expectSame(`notifications ${width}`, 'tables suivies en direct', [...new Set(live.followed())].sort(), ['notifications']);
    expectSame(`notifications ${width}`, 'lectures', [...new Set(badgeRequests.slice(asked).map((request) => request.table))].sort(), ['notifications', 'rpc/my_conversations']);
    await page.screenshot({ path: join(out, `notifications-${width}.png`), fullPage: true });
    // Un clic : cette notification est marquée lue (p_ids : son id), puis son écran s'ouvre (ici l'annonce).
    let before = writes.length;
    await page.click(`.notification-row[href="/annonce/?id=${listings[0].id}"] >> nth=0`);
    await page.waitForURL(/\/annonce\/\?id=/, { timeout: 8000 }).catch(() => problems.push(`notifications ${width} : le clic n'a pas ouvert l'annonce (${page.url()})`));
    const clicked = writes.slice(before).filter((write) => write.table === 'rpc/mark_notifications_read');
    const clickedId = known.find((row) => row.listing_id === listings[0].id && !row.conversation_id)?.id;
    if (clicked.length !== 1 || JSON.stringify(clicked[0].body) !== JSON.stringify({ p_ids: [clickedId] })) {
      problems.push(`notifications ${width} : clic → ${JSON.stringify(clicked)} au lieu de mark_notifications_read { p_ids: ["${clickedId}"] }`);
    }
    await page.close();
    // « Tout lire » : mark_notifications_read avec p_ids null, puis plus aucune non lue.
    page = await open(member, '/compte/?vue=notifications', `tout-lire-${width}`);
    await page.waitForSelector('.notifications-read-all');
    before = writes.length;
    await page.click('.notifications-read-all');
    await page.waitForFunction(() => !document.querySelector('.notification-dot') && !document.querySelector('.notifications-read-all'), null, { timeout: 8000 })
      .catch(() => problems.push(`tout lire ${width} : non-lues encore affichées`));
    await waitFor(() => writes.length > before, `tout lire ${width} : appel au serveur`);
    const all = writes.slice(before).filter((write) => write.table === 'rpc/mark_notifications_read');
    if (all.length !== 1 || all[0].method !== 'POST' || !all[0].body || !('p_ids' in all[0].body) || all[0].body.p_ids !== null) {
      problems.push(`tout lire ${width} : ${JSON.stringify(all)} au lieu de mark_notifications_read { p_ids: null }`);
    }
    await checkTabBarBadge(page, live.state, `tout lire ${width}`);
    await page.close();
    // Mon compte : « Mon compte » en bleu dans l'en-tête ; Mes informations dans la colonne de 720 px (688 de contenu).
    page = await open(member, '/compte/?vue=informations', `mes-informations-${width}`);
    await page.waitForSelector('input[autocomplete="tel"]');
    if ((await contentWidth(page, '.account-wrap')) !== 688) problems.push(`Mes informations ${width} : colonne de ${await contentWidth(page, '.account-wrap')} px au lieu de 688`);
    if ((await page.getAttribute('.site-header-account', 'aria-current')) !== 'page') problems.push(`Mes informations ${width} : « Mon compte » n'est pas en bleu dans l'en-tête`);
    await page.screenshot({ path: join(out, `mes-informations-${width}.png`), fullPage: true });
    await page.close();
    // Mon compte (étape 6, maquette 11) : le grand titre et les deux colonnes dans le conteneur commun (1136 px de
    // contenu à 1440, 960 à 1024), sans l'ancien espace de l'ordinateur ; « Mon compte » en bleu dans l'en-tête. La cloche
    // ronde du titre est masquée : celle de l'en-tête mène à la même page, avec le même libellé, et ouvre Notifications.
    page = await open(member, '/compte/', `compte-espace-${width}`);
    await page.waitForSelector('.app-space .app-row');
    expectSame(`Mon compte ${width}`, 'titre, cloches et onglet actif', await page.evaluate(() => [document.querySelector('.app-space-header h1')?.textContent ?? null,
      document.querySelector('.app-space-header .app-round')?.getAttribute('href') ?? null, document.querySelectorAll('.dsp, .dsp-aside').length,
      document.querySelector('.site-header-account')?.getAttribute('aria-current') ?? null, document.querySelector('.app-space-header .app-round')?.checkVisibility() ?? null,
      document.querySelector('.site-header-bell')?.getAttribute('href') ?? null,
      document.querySelector('.site-header-bell')?.getAttribute('aria-label') === document.querySelector('.app-space-header .app-round')?.getAttribute('aria-label')]),
    ['Mon espace', '/compte/?vue=notifications', 0, 'page', false, '/compte/?vue=notifications', true]);
    const hubWidth = width === 1440 ? 1136 : 960;
    if ((await contentWidth(page, '.account-wrap')) !== hubWidth) problems.push(`Mon compte ${width} : contenu de ${await contentWidth(page, '.account-wrap')} px au lieu de ${hubWidth}`);
    await checkChrome(page, `Mon compte ${width}`, { signedIn: true, current: '/compte/' });
    await page.click('.site-header-bell');
    await page.waitForURL(`${base}/compte/?vue=notifications`, { timeout: 8000 }).catch(() => problems.push(`Mon compte ${width} : la cloche ouvre ${page.url()}`));
    await page.waitForSelector('.notification-row', { timeout: 8000 }).catch(() => problems.push(`Mon compte ${width} : Notifications ne s'affiche pas après la cloche`));
    await page.close();
    await member.close();
  }

  // Accueil sur ordinateur (version ordinateur, étape 1 ; maquettes 01 et 03), à 1440 × 900 et 1024 × 768, avec les
  // annonces inventées. Sur le fond de la page, sans bandeau bleu ; titres des sections, Opportunités du moment, première
  // carte de chaque rangée et blocs du bas au bord gauche du contenu (conteneur commun de 1200 px, 32 px de marge) ;
  // la carte des catégories au milieu (980 px au plus) ; les Opportunités en grille de trois colonnes, les autres
  // rangées sur une ligne, trois cartes entières de la largeur d'une colonne, qui défilent à la molette et à la souris
  // sans ouvrir l'annonce ; une catégorie ouverte prend toute la largeur, ses critères sur une ligne (le lieu à gauche à
  // partir de 1200 px, au-dessus en dessous), puis « Plus de critères », « Réduire » et la recherche ; « Plus de
  // critères » ouvre les filtres plein écran, Échap les referme ; une fiche ouverte puis le retour la met en tête de
  // « Vus récemment ». Sections, cartes et haut de page : vérifiés avec ceux du téléphone, plus bas. Captures :
  // 1-accueil-*.png.
  const HOME_PROJECT = {
    real_estate_projects: [{ ...ACCOUNT.real_estate_projects[0], criteria: { residential: { maxBudget: 300000, propertyTypes: ['apartment'], location: { place: 'Lyon' } } } }],
  };
  const railState = (p, id) => p.evaluate((sectionId) => {
    const rail = document.getElementById(sectionId)?.closest('section')?.querySelector('.home-app-carousel');
    return rail ? { left: Math.round(rail.scrollLeft), page: Math.round(window.scrollY) } : null;
  }, id);
  for (const [width, height] of [[1440, 900], [1024, 768]]) {
    const A = `accueil ${width}`;
    const edge = (width - Math.min(width, 1200)) / 2 + 32;
    const content = Math.min(width, 1200) - 64;
    const guest = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR' });
    await mock(guest, { listingRows: HOME_LISTINGS });
    page = await open(guest, '/', `accueil-${width}-elargi`);
    await page.waitForSelector('.opportunity-card');
    await page.waitForSelector('#similaires');
    await page.waitForTimeout(400);
    const layout = await page.evaluate(() => {
      const box = (element) => element.getBoundingClientRect();
      const home = document.querySelector('.home-app');
      const grid = document.querySelector('section:has(#opportunites) .home-app-carousel');
      const gridCards = [...grid.querySelectorAll('article')].map(box);
      const rails = [...document.querySelectorAll('.home-app-section .home-app-carousel')].filter((rail) => rail !== grid && rail.querySelector('article'));
      const category = box(document.querySelector('.home-category'));
      return {
        band: [Math.round(box(home).left), Math.round(box(home).width) === document.documentElement.clientWidth, getComputedStyle(home).backgroundImage === 'none'],
        lefts: [...new Set([grid.querySelector('article'), ...rails.map((rail) => rail.querySelector('article')),
          ...document.querySelectorAll('.home-app-section .home-section-header, .home-cities, .home-hotels, .home-tools, .home-sell')]
          .map((element) => Math.round(box(element).left)))],
        category: [Math.round(category.left + category.width / 2 - innerWidth / 2), Math.round(category.width)],
        grid: [new Set(gridCards.map((card) => Math.round(card.left))).size, new Set(gridCards.map((card) => Math.round(card.top))).size === Math.ceil(gridCards.length / 3)],
        widths: [...new Set([...document.querySelectorAll('.home-app-section article')].map((card) => Math.round(box(card).width)))],
        rows: [...new Set(rails.map((rail) => new Set([...rail.querySelectorAll('article')].map((card) => Math.round(box(card).top))).size))],
        shown: Math.min(...rails.filter((rail) => rail.querySelectorAll('article').length >= 4).map((rail) => {
          const right = box(rail).right - parseFloat(getComputedStyle(rail).paddingRight);
          return [...rail.querySelectorAll('article')].filter((card) => box(card).right <= right + 0.5).length;
        })),
        overflowX: document.documentElement.scrollWidth - innerWidth,
      };
    });
    expectSame(A, 'accueil [pleine largeur sans bandeau, bords gauches, catégories (écart au milieu, largeur), grille des Opportunités (colonnes, lignes), largeur des cartes, lignes par rangée, cartes entières, débord]', layout,
      { band: [0, true, true], lefts: [edge], category: [0, Math.min(980, content)], grid: [3, true], widths: [Math.round((content - 48) / 3)], rows: [1], shown: 3, overflowX: 0 });
    const noPhoto = await page.locator('section:has(#opportunites) .home-no-photo').count();
    if (noPhoto < 1 || await page.getByText('Photos à venir').count()) problems.push(`${A} : annonce sans photo mal affichée`);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `1-accueil-${width}-sans-compte.png`), fullPage: true });
    // Molette sur une rangée : elle défile de côté, pas la page ; la souris la fait glisser sans ouvrir l'annonce (la
    // rangée qui déborde le plus, ramenée au début avant chaque essai).
    const railId = await page.evaluate(() => ['opportunites', 'similaires', 'nouveautes', 'baisses'].map((id) => {
      const strip = document.getElementById(id)?.closest('section')?.querySelector('.home-app-carousel');
      return [id, strip ? strip.scrollWidth - strip.clientWidth : 0];
    }).sort((a, b) => b[1] - a[1])[0][0]);
    const rail = page.locator(`section:has(#${railId}) .home-app-carousel`);
    const railStart = async () => {
      await rail.evaluate((strip) => { strip.scrollLeft = 0; });
      await rail.scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      return [await railState(page, railId), await rail.boundingBox()];
    };
    let [before, railBox] = await railStart();
    await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + railBox.height / 2);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(700);
    const wheeled = await railState(page, railId);
    if (!(wheeled.left > before.left) || wheeled.page !== before.page) problems.push(`${A} : molette sur la rangée ${railId} ${JSON.stringify(before)} → ${JSON.stringify(wheeled)}`);
    [before, railBox] = await railStart();
    await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + 80);
    await page.mouse.down();
    await page.mouse.move(railBox.x + railBox.width / 2 - 150, railBox.y + 80, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const dragged = await railState(page, railId);
    if (!(dragged.left > before.left) || new URL(page.url()).pathname !== '/') problems.push(`${A} : glissé à la souris sur ${railId} ${JSON.stringify(before)} → ${JSON.stringify(dragged)}, ${page.url()}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    // Les 4 catégories : la carte prend toute la largeur du contenu ; le lieu et les champs de la catégorie sur une
    // ligne (le lieu à gauche à partir de 1200 px, sur sa ligne au-dessus en dessous), « Type d'investissement »
    // (Investir) sur sa ligne, de toute la largeur ; puis « Plus de critères », « Réduire » et la recherche sur une
    // ligne ; tout dans la carte, sans texte coupé. « Plus de critères » ouvre les filtres plein écran sur la catégorie,
    // Échap les referme sur l'accueil.
    for (const [index, name] of [[0, 'Résidentiel'], [1, 'Location'], [2, 'Investir'], [3, 'Hôtels']]) {
      await page.click(`.home-category .mode-tab >> nth=${index}`);
      await page.waitForSelector('.home-category-fields');
      await page.waitForTimeout(600);
      const fields = await page.evaluate(() => {
        const box = (element) => element.getBoundingClientRect();
        const place = box(document.querySelector('.home-category-place'));
        const card = box(document.querySelector('.home-category'));
        const all = [...document.querySelectorAll('.home-category-fields .criterion-tile')];
        const tiles = all.filter((tile) => !tile.classList.contains('is-full')).map(box);
        const full = all.filter((tile) => tile.classList.contains('is-full')).map(box);
        const actions = [...document.querySelectorAll('.home-category-actions > *')];
        const right = Math.max(...tiles.map((tile) => tile.right));
        return {
          card: Math.round(card.width),
          place: tiles.every((tile) => Math.round(tile.top) === Math.round(place.top) && tile.left >= place.right) ? 'à gauche'
            : tiles.every((tile) => tile.top >= place.bottom) && place.right >= right - 1 ? 'au-dessus' : 'ailleurs',
          rows: new Set(tiles.map((tile) => Math.round(tile.top))).size,
          columns: new Set(tiles.map((tile) => Math.round(tile.left))).size,
          full: full.map((tile) => tile.top >= Math.max(...tiles.map((t) => t.bottom)) && Math.abs(tile.left - place.left) < 1 && Math.abs(tile.right - right) < 1),
          actions: [actions.map((button) => button.classList[0]), new Set(actions.map((button) => Math.round(box(button).top))).size],
          inCard: [place, ...tiles, ...full, ...actions.map(box)].every((b) => b.left >= card.left && b.right <= card.right),
          clipped: [...document.querySelectorAll('.home-category-fields .criterion-label, .home-category-fields .criterion-value')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent),
        };
      });
      expectSame(`${A} ${name}`, 'critères de la catégorie [carte, lieu, lignes, colonnes, pleine largeur, boutons, dans la carte, texte coupé]', fields, {
        card: content, place: width >= 1200 ? 'à gauche' : 'au-dessus', rows: 1, columns: 4, full: name === 'Investir' ? [true] : [],
        actions: [['home-more', 'home-collapse', 'home-search-button'], 1], inCard: true, clipped: [],
      });
      if (name === 'Investir') await page.locator('.home-category').screenshot({ path: join(out, `1-accueil-${width}-investir.png`) });
    }
    const hotelButton = (await page.textContent('.home-search-button'))?.trim();
    if (hotelButton !== 'Rechercher un hôtel') problems.push(`${A} : bouton « ${hotelButton} » en Hôtels`);
    await page.click('.home-more');
    await page.waitForSelector('dialog.filters-dialog[open]');
    await page.waitForTimeout(600);
    expectSame(A, '« Plus de critères » plein écran [x, y, largeur, hauteur, catégorie]', await page.$eval('dialog.filters-dialog', (dialog) => {
      const box = dialog.getBoundingClientRect();
      return [box.x, box.y, box.width, box.height, dialog.querySelector('.mode-tab[aria-checked="true"] .mode-name')?.textContent ?? null];
    }), [0, 0, width, height, 'Hôtels']);
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog.filters-dialog[open]', { state: 'detached', timeout: 4000 }).catch(() => problems.push(`${A} : Échap ne referme pas « Plus de critères »`));
    expectSame(A, 'après Échap', new URL(page.url()).pathname, '/');
    await page.close();
    await guest.close();

    // Avec le compte de test : une fiche ouverte dans l'onglet, puis le retour : elle passe en tête de « Vus récemment ».
    const member = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR' });
    await mock(member, { signedIn: true, listingRows: HOME_LISTINGS, account: HOME_PROJECT });
    page = await open(member, '/', `accueil-${width}-connecte-consultes`);
    await page.waitForSelector('.opportunity-card');
    const opened = await page.$eval('.opportunity-card a.stretched', (link) => new URL(link.href).searchParams.get('id'));
    await Promise.all([page.waitForURL(/\/annonce\/\?id=/), page.click('.opportunity-card a.stretched >> nth=0')]);
    await page.waitForLoadState('networkidle');
    await page.goBack({ waitUntil: 'networkidle' });
    await page.waitForSelector('#consultes', { timeout: 8000 }).catch(() => undefined);
    const viewedFirst = await page.locator('section:has(#consultes) article a.stretched').evaluateAll((links) => links.map((link) => new URL(link.href).searchParams.get('id')));
    if (viewedFirst[0] !== opened) problems.push(`${A} : consultés ${JSON.stringify(viewedFirst)} après la fiche « ${opened} »`);
    await page.close();
    await member.close();
  }

  // « Rechercher des biens » ouvre la même adresse /recherche/ que l'accueil du téléphone, pour les mêmes choix.
  const searchUrl = async (context, name) => {
    const p = await open(context, '/', name);
    await p.waitForSelector('.mode-tab');
    await p.click('.mode-tab >> nth=2');
    for (const [tileIndex, row] of [[0, 4], [1, 3]]) {
      await p.click(`.criterion-tile >> nth=${tileIndex}`);
      await p.waitForSelector('dialog.selection-dialog[open]');
      await p.click(`dialog[open] .selection-row >> nth=${row}`);
      await p.click('dialog[open] .selection-foot .btn');
    }
    await Promise.all([p.waitForURL(/\/recherche\/\?/), p.click('.home-search-button')]);
    const url = new URL(p.url());
    await p.close();
    return url.pathname + url.search;
  };
  const sameDesktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
  await mock(sameDesktop);
  const desktopSearch = await searchUrl(sameDesktop, 'accueil-recherche-ordinateur');
  await sameDesktop.close();
  const samePhone = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  await mock(samePhone);
  const phoneSearch = await searchUrl(samePhone, 'accueil-recherche-telephone');
  await samePhone.close();
  if (desktopSearch !== phoneSearch || !desktopSearch.includes('mode=invest')) problems.push(`accueil : recherche ${desktopSearch} sur ordinateur, ${phoneSearch} sur téléphone`);

  // Téléphone : l'accueil de l'app (version 1.0.1, HomeView.swift). Ses sections dans l'ordre de l'app, toutes avec la
  // même carte de 248 (photo de 248 × 186) et la pastille et le cœur de leur section : rendement brut et cœur pour
  // Opportunités du moment et Selon votre recherche (le rendement si l'annonce a ses chiffres), rien pour Vus
  // récemment, « Nouveau » et cœur pour Nouvelles annonces, baisse et ancien prix barré sans cœur pour Baisses de prix.
  // Avec les lectures de l'ordinateur (projet du compte, fiches consultées, biens similaires) ; avec le compte, la
  // cloche (point rouge des non lues) et « Reprendre ma recherche ». Pas d'en-tête bleu sous 1024 px. Les mêmes
  // vérifications sur ordinateur, à 1440 × 900 et 1024 × 768 (version ordinateur, étape 1) : les mêmes sections dans le
  // même ordre, avec « Que recherchez-vous ? » au-dessus et les trois blocs du bas ; la même carte, à la largeur d'une
  // colonne des Opportunités (photo de 220) ; plus de barre du haut : le titre (h1) du haut de page et la cloche de
  // l'en-tête. Captures : accueil-telephone-app-*.png, 1-accueil-1440.png et 1-accueil-1024.png.
  for (const [screen, signedIn] of [['téléphone', false], ['téléphone', true], [1440, false], [1440, true], [1024, false], [1024, true]]) {
    const H = `accueil ${screen} ${signedIn ? 'connecté' : 'sans compte'}`;
    const phoneHome = await browser.newContext(screen === 'téléphone' ? { ...devices['iPhone 13'], locale: 'fr-FR' }
      : { viewport: { width: screen, height: screen === 1440 ? 900 : 768 }, deviceScaleFactor: 2, locale: 'fr-FR' });
    const phoneServer = await mock(phoneHome, { signedIn, listingRows: HOME_LISTINGS, account: HOME_PROJECT });
    // Biens consultés du compte, gardés dans ce navigateur (une liste par compte, n° 114) : lus seulement avec ce compte
    // connecté. L'ancienne liste de l'onglet (sessionStorage) n'est plus lue.
    await phoneHome.addInitScript(([id, owner]) => {
      try {
        localStorage.setItem(`nidalo.consultes.${owner}`, JSON.stringify([id]));
        sessionStorage.setItem('nidalo.consultes', JSON.stringify([id]));
      } catch { /* indisponible */ }
    }, [homeId(7), USER_ID]);
    page = await open(phoneHome, '/', `accueil-${screen === 'téléphone' ? 'telephone' : screen}-lectures-${signedIn ? 'connecte' : 'sans-compte'}`);
    if (signedIn) await page.waitForSelector('#consultes', { timeout: 8000 }).catch(() => undefined);
    await page.waitForSelector('#similaires', { timeout: 8000 }).catch(() => undefined);
    if (signedIn) await page.waitForSelector('.home-resume', { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    const computer = screen !== 'téléphone';
    expectSame(H, 'sections', await page.locator('.home-app h2').allTextContents(), [...(computer ? ['Que recherchez-vous ?'] : []),
      'Opportunités du moment', 'Explorer par ville', ...(signedIn ? ['Vus récemment'] : []), 'Selon votre recherche', 'Nouvelles annonces', 'Baisses de prix',
      ...(computer ? ['Reprenez un hôtel, chiffres à l’appui', 'Tout pour décider, au même endroit', 'Vous vendez ou louez un bien ?'] : [])]);
    // Par section, les cartes telles qu'affichées : [classe, largeur, photo, pastille, cœurs, ancien prix barré] (le
    // rendement brut est vérifié plus bas, annonce par annonce).
    const sectionKinds = await page.evaluate(() => Object.fromEntries(['opportunites', 'consultes', 'similaires', 'nouveautes', 'baisses'].map((id) => {
      const size = (el) => {
        const box = el?.getBoundingClientRect();
        return box ? `${Math.round(box.width)}×${Math.round(box.height)}` : '-';
      };
      const articles = [...(document.getElementById(id)?.closest('section')?.querySelectorAll('article') ?? [])];
      return [id, [...new Set(articles.map((article) => [
        article.classList[0], Math.round(article.getBoundingClientRect().width), size(article.querySelector('.hlc-photo')),
        article.querySelector('.hlc-new, .hlc-drop')?.className ?? '-',
        article.querySelectorAll('.heart-button').length, article.querySelector('.hlc-price s') ? 'barré' : '-',
      ].join(' ')))]];
    })));
    // Ordinateur : la largeur d'une colonne des Opportunités (contenu de 1136 px à 1440, de 960 px à 1024 ; 24 entre
    // les colonnes), photo de 220.
    const cardSize = screen === 'téléphone' ? '248 248×186' : screen === 1440 ? '363 363×220' : '304 304×220';
    expectSame(H, 'cartes des sections', sectionKinds, {
      opportunites: [`home-listing-card ${cardSize} - 1 -`],
      consultes: signedIn ? [`home-listing-card ${cardSize} - 0 -`] : [],
      similaires: [`home-listing-card ${cardSize} - 1 -`],
      nouveautes: [`home-listing-card ${cardSize} hlc-new 1 -`],
      baisses: [`home-listing-card ${cardSize} hlc-drop 0 barré`],
    });
    // Carte : la photo en haut, sur toute la largeur ; les quatre lignes (prix, petits faits, type, ville) sous la
    // photo, à 16 des bords, dans la carte.
    const cardLayout = await page.$$eval('.home-app .home-listing-card', (articles) => [...new Set(articles.map((article) => {
      const card = article.getBoundingClientRect();
      const photo = article.querySelector('.hlc-photo').getBoundingClientRect();
      const lines = [...article.querySelector('.hlc-body').children].map((line) => line.getBoundingClientRect());
      return [Math.round(photo.left - card.left), Math.round(photo.top - card.top), lines.length,
        lines.every((line) => line.top >= photo.bottom && line.bottom <= card.bottom - 8 && line.left >= card.left + 16 && line.right <= card.right - 16)].join(' ');
    }))]);
    expectSame(H, 'carte [photo à gauche, en haut, lignes, lignes dans la carte]', cardLayout, ['0 0 4 true']);
    // Rendement brut : sur toutes les Opportunités du moment, nulle part dans Vus récemment, Nouvelles annonces et
    // Baisses de prix.
    expectSame(H, 'rendement des sections', await page.evaluate(() => ['opportunites', 'consultes', 'nouveautes', 'baisses'].map((id) => {
      const articles = [...(document.getElementById(id)?.closest('section')?.querySelectorAll('article') ?? [])];
      return articles.filter((article) => article.querySelector('.hlc-yield')).length === (id === 'opportunites' ? articles.length : 0);
    })), [true, true, true, true]);
    const viewedIds = await page.locator('section:has(#consultes) article a.stretched').evaluateAll((links) => links.map((link) => new URL(link.href).searchParams.get('id')));
    expectSame(H, 'consultés', viewedIds, signedIn ? [homeId(7)] : []);
    if (signedIn) {
      expectSame(H, 'consultés [type, ville, prix]', await page.$eval('section:has(#consultes) article', (article) => ['.hlc-type', '.hlc-city', '.hlc-price']
        .map((selector) => article.querySelector(selector)?.textContent?.replace(/\s/g, ' ').trim())), ['Appartement 2 pièces · 45 m²', 'Lyon 6e', '265 000 €']);
    }
    expectSame(H, 'ancienne liste de l\'onglet effacée', await page.evaluate(() => sessionStorage.getItem('nidalo.consultes')), null);
    // Baisses de prix : la baisse et l'ancien prix de l'annonce. Selon votre recherche : le rendement brut seulement sur
    // les annonces qui ont un loyer (les seules à avoir leurs chiffres).
    const euros = (value) => `${new Intl.NumberFormat('fr-FR').format(value)} €`.replace(/\s/g, ' ');
    for (const [id, drop, previous] of await page.locator('section:has(#baisses) article').evaluateAll((articles) => articles.map((article) => [
      new URL(article.querySelector('a.stretched').href).searchParams.get('id'), article.querySelector('.hlc-drop')?.textContent?.replace(/\s/g, ' '),
      article.querySelector('.hlc-price s')?.getAttribute('aria-label')?.replace(/\s/g, ' '),
    ]))) {
      const row = HOME_LISTINGS.find((listing) => listing.id === id);
      expectSame(H, `baisse de prix ${id}`, [drop, previous], [`${Math.round(((row.price - row.previous_price) / row.previous_price) * 100)} %`, `Ancien prix ${euros(row.previous_price)}`]);
    }
    const withRent = HOME_LISTINGS.filter((row) => row.rental_info?.potentialMonthlyRent || row.rental_info?.currentMonthlyRent).map((row) => row.id);
    const similarYields = await page.locator('section:has(#similaires) article').evaluateAll((articles) => articles.map((article) => [
      new URL(article.querySelector('a.stretched').href).searchParams.get('id'), article.querySelector('.hlc-yield') !== null,
    ]));
    expectSame(H, 'rendement des biens similaires', similarYields, similarYields.map(([id]) => [id, withRent.includes(id)]));
    const projectRead = phoneServer.requests.some((request) => request.path === '/' && request.table === 'real_estate_projects');
    if (projectRead !== signedIn) problems.push(`${H} : projet du compte ${projectRead ? 'lu' : 'non lu'}`);
    const unread = signedIn ? expectedBadges(phoneServer.state).notifications : 0;
    // Titre : la marque de l'app en texte (« NIDΛLO », cachée aux lecteurs d'écran) et « Nidalo » pour eux.
    if (!computer) {
      expectSame(H, 'barre du haut [marque, titre lu, cloche, point rouge, en-tête bleu, accueil de l\'ordinateur]', [
        await page.textContent('h1 .home-app-word'), await page.getAttribute('h1 .home-app-word', 'aria-hidden'), await page.textContent('h1 .visually-hidden'),
        await page.getAttribute('.home-app-bell', 'aria-label'), await page.locator('.home-app-dot').count(),
        await page.locator('.topbar').isVisible(), await page.locator('.dhome').count(),
      ], ['NIDΛLO', 'true', 'Nidalo', unread > 0 ? `Notifications, ${unread} non lues` : 'Notifications', unread > 0 ? 1 : 0, false, 0]);
    } else {
      // Ordinateur : l'en-tête du site porte le logo et la cloche (même libellé, même point rouge) ; le seul h1 est le
      // titre du haut de page.
      expectSame(H, 'haut de page [h1, barre du haut, cloche de l\'en-tête, point rouge, en-tête bleu, accueil de l\'ordinateur]', [
        await page.locator('h1').allTextContents(), await page.locator('.home-app-top').count(),
        await page.getAttribute('.site-header-bell', 'aria-label'), await page.locator('.site-header-dot').count(),
        await page.locator('.topbar').isVisible(), await page.locator('.dhome').count(),
      ], [['L’immobilier mérite mieux qu’une liste d’annonces.'], 0, unread > 0 ? `Notifications, ${unread} non lues` : 'Notifications', unread > 0 ? 1 : 0, false, 0]);
    }
    if (signedIn) {
      expectSame(H, '« Reprendre ma recherche »', [
        await page.textContent('.home-resume-title'), (await page.textContent('.home-resume-summary'))?.replace(/\s/g, ' '),
      ], ['Reprendre ma recherche', 'Lyon · Appartement · ≤ 300 k€']);
    } else if (await page.locator('.home-resume').count()) problems.push(`${H} : « Reprendre ma recherche » sans compte`);
    if (screen === 'téléphone') await page.screenshot({ path: join(out, `accueil-telephone-app-${signedIn ? 'connecte' : 'sans-compte'}.png`), fullPage: true });
    else if (signedIn) {
      await checkChrome(page, H, { signedIn: true, current: '/', footer: 'large' });
      await page.screenshot({ path: join(out, `1-accueil-${screen}.png`), fullPage: true });
    }
    await phoneHome.close();
  }

  // Largeurs limites : dès 1024 px, l'en-tête de l'ordinateur sur une ligne, dans le conteneur commun (1200 px au plus,
  // 32 px de marge), « Publier une annonce » et « Mon compte » en toutes lettres ; rien ne déborde (version ordinateur,
  // étape 0). La recherche n'a pas de pied de page (étape 2) : son bandeau tient sur une ligne (74 de haut), ses cartes
  // sur 2 colonnes tant que chacune garde 280 px, sinon 1, la carte à côté garde 360 px au moins.
  for (const width of [1024, 1179, 1180, 1279, 1280, 1365, 1366]) {
    const edge = await browser.newContext({ viewport: { width, height: 800 }, locale: 'fr-FR' });
    await mock(edge);
    const p = await open(edge, '/recherche/?mode=buy', `recherche-${width}`);
    await p.waitForSelector('.listing-card');
    await checkChrome(p, `recherche ${width}`, { signedIn: false, current: '/', footer: null });
    const names = await p.evaluate(() => [document.querySelector('.site-header-publish').textContent.trim(), document.querySelector('.site-header-account').textContent.trim()]);
    if (JSON.stringify(names) !== JSON.stringify(['Publier une annonce', 'Mon compte'])) problems.push(`en-tête ${width} : noms des liens ${JSON.stringify(names)}`);
    const split = await p.evaluate(() => {
      const columns = getComputedStyle(document.querySelector('.results-list')).gridTemplateColumns.split(' ').map((track) => parseFloat(track));
      return [Math.round(document.querySelector('.search-app-top').getBoundingClientRect().height), columns.length === 2 ? Math.min(...columns) >= 280 : columns[0] < 576,
        document.querySelector('.map-column').getBoundingClientRect().width >= 360];
    });
    expectSame(`recherche ${width}`, '[bandeau, colonnes de cartes, largeur de la carte]', split, [74, true, true]);
    await p.close();
    await edge.close();
  }

  // Messages : une vraie messagerie, avec les écrans de l'app à toutes les largeurs (à partir de 1024 px, dans la colonne
  // de 720 px : la liste, puis la conversation par-dessus, avec la flèche retour) ; actions envoyées au serveur simulé
  // comme l'app les envoie, temps réel, « En ligne », demandes de visite, à 1440 × 960 puis 1024 × 768 ; horloge figée au
  // vendredi 6 novembre 2026, 10 h 50 à Paris. Captures : 3-messages-*.png.
  const chatContext = async ({ width = 1440, height = 960, account = {}, signedIn = true, phone = false, reducedMotion = 'no-preference', slow = {} } = {}) => {
    const context = await browser.newContext(phone ? { ...devices['iPhone 13'], locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion }
      : { viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion });
    await context.clock.setFixedTime(CHAT_NOW);
    const server = await mock(context, { signedIn, listingRows: [...listings, ...HOME_LISTINGS], account, slow });
    const chat = chatState();
    await mockMessaging(context, chat, { signedIn });
    return { context, server, chat };
  };
  const A = chatId(1).toUpperCase();
  const rowLink = (n) => `.dm-list .dm-row[href="/messages/?c=${chatId(n)}"]`;
  /**
   * Retour à la liste par les flèches des écrans (sous 1024 px, la liste est sous la conversation, comme dans l'app).
   * À partir de 1024 px (version ordinateur, étape 5), la liste reste à côté de la conversation, sans flèche : les écrans
   * poussés se referment par leur « Retour », puis la ligne suivante se choisit directement dans la liste.
   */
  const backToList = async (page, name) => {
    const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
    for (let step = 0; step < 3 && !(await page.locator('.dm.is-list').count()); step += 1) {
      const pushed = page.locator(':is(.dmg-bar, .dm-details-bar) button[aria-label="Retour"]');
      if (desktop && !(await pushed.count())) break;
      const from = page.url();
      await (await pushed.count() ? pushed.first() : page.locator(':is(.dm-pane-top, .dm-missing-top) .dm-back')).click();
      await page.waitForFunction((url) => window.location.href !== url, from, { timeout: 8000 }).catch(() => undefined);
    }
    await page.waitForSelector(desktop ? '.dm-side .dm-list .dm-row' : '.dm.is-list .dm-list .dm-row', { timeout: 8000 })
      .catch(() => problems.push(`${name} : ${desktop ? 'la liste n\'est plus à côté de la conversation' : 'la flèche ne ramène pas à la liste'}`));
  };
  // Deuxième ligne, comme l'app (demande du 17/11) : la petite maison et le sous-titre de l'interlocuteur (bien et
  // ville, ou nombre de membres d'un groupe).
  const INITIAL_ROWS = [
    { name: 'Agence Démo Lyon', time: '10:45', listing: 'Appartement 3 pièces · Lyon 2e', preview: 'Bien reçu, je transmets votre offre au propriétaire.', unread: '1', greyPill: false },
    { name: 'Visite groupée Lyon 2e', time: '09:12', listing: '3 membres', preview: 'Merci, à samedi !', unread: '3', greyPill: true },
    // Le dernier message, comme la ligne de l'app (la demande de visite de Julien n'en tient plus lieu).
    { name: 'Julien M.', time: 'Hier', listing: 'Appartement 2 pièces · Lyon 6e', preview: 'Je peux signer rapidement si l\'offre vous convient.', unread: '2', greyPill: false },
    { name: 'Lucas G.', time: 'Mar.', listing: 'Maison familiale 5 pièces · Écully', preview: 'Nouvelle conversation', unread: null, greyPill: false },
    { name: 'Compte supprimé', time: '27 octobre', listing: 'Studio rénové', preview: 'Vous : Merci, je reviens vers vous rapidement.', unread: null, greyPill: false },
  ];
  const ALL_NAMES = INITIAL_ROWS.map((row) => row.name);
  const flat = (text) => text?.replace(/\s+/g, ' ').trim() ?? null;
  const texts = (page, selector) => page.$$eval(selector, (els) => els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()));
  /** Carte de la demande de visite d'une conversation : titre, date, lieu, créneaux, boutons, issue. */
  const visitCard = (page) => page.evaluate(() => {
    const card = document.querySelector('.dm-visit');
    const text = (selector) => card?.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() ?? null;
    return card ? {
      kind: text('.dm-visit-kind'), when: text('.dm-visit-when'), where: text('.dm-visit-where'),
      slots: [...card.querySelectorAll('.dm-visit-slot')].map((el) => [el.textContent.replace(/\s+/g, ' ').trim(), el.getAttribute('aria-pressed')]),
      state: text('.dm-visit-state'), actions: [...card.querySelectorAll('.dm-visit-actions button')].map((el) => [el.textContent, Math.round(el.getBoundingClientRect().height)]),
      outcome: text('.dm-visit-outcome'), confirmed: Boolean(card.querySelector('.dm-visit-outcome.is-confirmed')), width: Math.round(card.getBoundingClientRect().width),
    } : null;
  });
  /** Réponses rapides au-dessus du champ. */
  const quickReplies = (page) => texts(page, '.dm-quick button');
  /** Tous les boutons et liens visibles de la page ont un nom (texte, aria-label ou title). */
  const unnamedControls = (page) => page.$$eval('.dm button, .dm a[href], .dm textarea, .dm input', (els) => els
    .filter((el) => el.getClientRects().length > 0 && !(el.getAttribute('aria-label') || el.textContent.trim() || (el.labels?.length ?? 0) > 0))
    .map((el) => el.outerHTML.slice(0, 120)));

  for (const [width, height] of [[1440, 960], [1024, 768]]) {
    const M = `messages ${width}`;
    const { context: chatDesk, server: chatServer, chat } = await chatContext({ width, height });
    page = await open(chatDesk, '/messages/', `messages-${width}`);
    await page.waitForSelector('.dm-list .dm-row');
    // Pastille : 1 + 2 + 3 non-lus ; l'archivée n'y compte pas.
    await waitForMessagesBadge(page, '6', M);
    // Sans ?c= : la liste seule, rien n'est ouvert ni lu.
    expectSame(M, 'liste seule sans ?c=', [await page.locator('.dm.is-list').count(), await page.locator('.dm-main').count()], [1, 0]);
    if (chatCalls(chat, 'messages').length || chatCalls(chat, 'rpc/mark_conversation_read').length) problems.push(`${M} : sans ?c=, une conversation est lue ou marquée lue`);
    // La carte de la maquette 10 (version ordinateur, étape 5) : 1280 px au plus, 32 px de chaque côté, 24 px sous
    // l'en-tête de l'ordinateur et au-dessus du bas de la fenêtre (pas de barre d'onglets ni de pied de page) ; la liste
    // à gauche sur 400 px (360 sous 1280 px), recherche de 46 px et filtres de 34.
    const card = [Math.max(32, (width - 1280) / 2), Math.min(1280, width - 64)];
    const sideWidth = width >= 1280 ? 400 : 360;
    const layout = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
      return {
        column: [box('.dm')?.left, box('.dm')?.width], side: Math.round(box('.dm-side')?.width ?? 0), top: box('.dm')?.top, bottom: box('.dm')?.bottom,
        pageScroll: document.documentElement.scrollHeight - innerHeight, overflowX: document.documentElement.scrollWidth - innerWidth,
        footer: Boolean(document.querySelector('footer.footer, footer.site-footer, .tabbar')),
        active: document.querySelector('.site-header-nav a[href="/messages/"]')?.getAttribute('aria-current') ?? null,
        search: Math.round(box('.dm-search')?.height ?? 0), tabs: [...document.querySelectorAll('.dm-tab')].map((tab) => Math.round(tab.getBoundingClientRect().height)),
        font: getComputedStyle(document.querySelector('.dm')).fontFamily.split(',')[0].replace(/["']/g, ''),
        rowAvatar: Math.round(document.querySelector('.dm-row .dm-avatar')?.getBoundingClientRect().width ?? 0),
      };
    });
    expectSame(M, 'mise en page', layout, {
      column: card, side: sideWidth, top: 73 + 24, bottom: height - 24, pageScroll: 0, overflowX: 0, footer: false, active: 'page', search: 46, tabs: [34, 34, 34, 34, 34],
      font: 'Nidalo Inter', rowAvatar: 46,
    });
    expectSame(M, 'en-tête de la liste', [await textOf(page, '.dm-side-head h1'), await page.getAttribute('.dm-compose', 'aria-label'),
      await page.getAttribute('.dm-search-open', 'aria-label'), await textOf(page, '.dm-search-open')],
    ['Messages', 'Nouveau message', 'Rechercher un contact ou une annonce', 'Rechercher un contact ou un bien']);
    expectSame(M, 'conversations', await inboxRows(page), INITIAL_ROWS);
    expectSame(M, 'filtres', await page.$$eval('.dm-tab', (els) => els.map((el) => [el.getAttribute('aria-label'), el.getAttribute('aria-pressed')])),
      [['Tous, 5', 'true'], ['Non lus, 3', 'false'], ['Favoris, 1', 'false'], ['Visites, 1', 'false'], ['Archivés, 1', 'false']]);
    await chatShot(page, `3-messages-liste-${width}.png`);

    if (width === 1440) {
      // Filtres (capsules de l'app) : non lus, favoris, visites à venir (sans les archivées), archivés, tous.
      for (const [label, names] of [['Non lus, 3', ['Agence Démo Lyon', 'Visite groupée Lyon 2e', 'Julien M.']], ['Favoris, 1', ['Julien M.']],
        ['Visites, 1', ['Agence Démo Lyon']], ['Archivés, 1', ['Marc P.']], ['Tous, 5', ALL_NAMES]]) {
        await page.click(`.dm-tab[aria-label="${label}"]`);
        await waitForRows(page, names, `${M} : filtre ${label}`);
        if ((await page.getAttribute(`.dm-tab[aria-label="${label}"]`, 'aria-pressed')) !== 'true') problems.push(`${M} : filtre ${label} non enfoncé`);
      }
      // Recherche (MessagingSearchView de l'app) : la ligne ouvre l'écran de recherche, avec son champ et « Annuler » ; les
      // résultats sont rangés par sorte (conversations par nom ou par titre d'annonce) ; la croix vide le champ.
      await page.click('.dm-search-open');
      await page.waitForSelector('.dm-msearch-field input', { timeout: 8000 });
      expectSame(M, 'écran de recherche', [await page.getAttribute('.dm-msearch-field input', 'placeholder'), await textOf(page, '.dm-msearch-cancel')],
        ['Rechercher un contact ou une annonce…', 'Annuler']);
      const found = () => page.$$eval('.dm-found-conversation .dm-contact-name', (els) => els.map((el) => el.textContent));
      await page.fill('.dm-msearch-field input', 'lyon');
      await page.waitForSelector('.dm-found-conversation', { timeout: 8000 }).catch(() => problems.push(`${M} : recherche « lyon » sans conversation`));
      // Par le nom, le bien ou sa ville (MessagingSearchView) : Julien et le compte supprimé ont un bien à Lyon.
      expectSame(M, 'recherche « lyon »', await found(), ['Agence Démo Lyon', 'Visite groupée Lyon 2e', 'Julien M.', 'Compte supprimé']);
      await page.fill('.dm-msearch-field input', 'maison');
      await page.waitForFunction(() => [...document.querySelectorAll('.dm-found-conversation .dm-contact-name')].map((el) => el.textContent).join() === 'Lucas G.,Marc P.', null, { timeout: 8000 })
        .catch(() => undefined);
      expectSame(M, 'recherche « maison »', await found(), ['Lucas G.', 'Marc P.']);
      await page.click('.dm-msearch-clear');
      expectSame(M, 'recherche effacée', await page.inputValue('.dm-msearch-field input'), '');
      await page.fill('.dm-msearch-field input', 'zzz');
      await page.waitForSelector('.dm-results-empty h3', { timeout: 8000 }).catch(() => problems.push(`${M} : recherche sans résultat sans message`));
      expectSame(M, 'recherche sans résultat', await textOf(page, '.dm-results-empty h3'), 'Aucun résultat pour « zzz »');
      await page.click('.dm-msearch-cancel');
      await waitForRows(page, ALL_NAMES, `${M} : recherche refermée par « Annuler »`);
      // Clavier : de la ligne de recherche, Tab va aux filtres, avec un contour bleu visible.
      await page.focus('.dm-search-open');
      await page.keyboard.press('Tab');
      expectSame(M, 'focus au clavier', await page.evaluate(() => {
        const el = document.activeElement;
        const style = getComputedStyle(el);
        return [el.getAttribute('aria-label'), style.outlineStyle, style.outlineWidth, style.outlineColor];
      }), ['Tous, 5', 'solid', '3px', 'rgb(60, 92, 176)']);
    }

    // Ouvrir la conversation de l'agence : sur ordinateur, elle s'ouvre à côté de la liste (étape 5) sans recharger la
    // page, sans barre d'onglets, est lue puis marquée lue une fois.
    let mark = chat.calls.length;
    await page.evaluate(() => { window.nidaloMarker = 'même page'; });
    await page.click(rowLink(1));
    await page.waitForURL(`${base}/messages/?c=${chatId(1)}`);
    await page.waitForSelector('.dm-thread-inner .dm-day');
    await page.waitForSelector('.dm-offer .dm-offer-amount');
    await page.waitForSelector('.dm-visit');
    await page.waitForSelector('.dm-banner-link');
    const read = await oneCall(chat, 'rpc/mark_conversation_read', mark, `${M} : ouverture`);
    if (read) expectSame(M, 'conversation marquée lue', read.body, { p_conversation_id: A });
    await waitForMessagesBadge(page, '5', `${M} : après l'ouverture`);
    if ((await page.evaluate(() => window.nidaloMarker)) !== 'même page') problems.push(`${M} : la page s'est rechargée à l'ouverture`);
    expectSame(M, 'lecture des messages', chatCalls(chat, 'messages', mark).map((call) => `${call.method} ${call.search}`),
      [`GET ?select=id,conversation_id,sender_id,kind,client_id,content,created_at,expires_at,reply_to_id,forwarded,message_reactions(user_id,emoji,created_at)&conversation_id=eq.${A}&order=created_at.desc&limit=200`]);
    const opened = await page.evaluate((id) => {
      const row = document.querySelector(`.dm-row[href="/messages/?c=${id}"]`);
      const shown = (selector) => Boolean(document.querySelector(selector)?.getClientRects().length);
      const pane = document.querySelector('.dm-main').getBoundingClientRect();
      const inner = document.querySelector('.dm-thread-inner').getBoundingClientRect();
      const sent = [...document.querySelectorAll('.dm-bubble.is-out')];
      const received = [...document.querySelectorAll('.dm-bubble:not(.is-out)')];
      const style = (el) => (el ? [getComputedStyle(el).backgroundColor, getComputedStyle(el).color, getComputedStyle(el).borderRadius] : null);
      const msgs = [...document.querySelectorAll('.dm-msg')];
      return {
        row: row?.querySelector('.dm-row-name')?.textContent ?? null, list: shown('.dm-side'), tabbar: shown('.tabbar'), bodyPadding: getComputedStyle(document.body).paddingBottom,
        pane: [pane.left, pane.width, pane.top, pane.bottom - innerHeight],
        unread: row?.querySelector('.dm-unread')?.textContent ?? null, sent: style(sent[0]), received: style(received[0]),
        receivedLeft: [...new Set(received.map((el) => Math.round(el.getBoundingClientRect().left - inner.left)))],
        sentRight: [...new Set(sent.map((el) => Math.round(inner.right - el.getBoundingClientRect().right)))],
        gaps: [...new Set(msgs.slice(1).map((el) => getComputedStyle(el).marginTop))].sort(),
        avatars: [...document.querySelectorAll('.dm-msg-avatar:not(.is-empty)')].map((el) => Math.round(el.getBoundingClientRect().width)),
        fresh: document.querySelectorAll('.is-new').length,
      };
    }, chatId(1));
    // La conversation à droite de la liste, qui reste visible (version ordinateur, étape 5), dans la carte (filet de
    // 1 px) ; pas de barre d'onglets ni de marge du bas. Le fil de la maquette : 24 px de marge, reçus beiges et envoyés
    // bleus (rayon 18, coin de 6), 4 px entre deux messages d'une série et 12 entre deux séries ; pas d'avatar à côté des
    // messages reçus d'une conversation à deux.
    expectSame(M, 'conversation ouverte', opened, {
      row: 'Agence Démo Lyon', list: true, tabbar: false, bodyPadding: '0px', pane: [card[0] + 1 + sideWidth, card[1] - 2 - sideWidth, 73 + 24 + 1, -(24 + 1)], unread: null,
      sent: ['rgb(60, 92, 176)', 'rgb(255, 255, 255)', '18px 18px 6px'], received: ['rgb(242, 240, 236)', 'rgb(36, 45, 56)', '18px 18px 18px 6px'],
      receivedLeft: [24], sentRight: [24], gaps: ['12px', '4px'], avatars: opened.avatars.map(() => 0), fresh: 0,
    });
    // En-tête de l'app : le nom et le bien ; à droite Appeler et « … » (pas de « Proposer une visite » : la visite passe
    // par « Détails » et la fiche). Sur ordinateur (étape 5), pas de flèche retour : la liste est à côté.
    expectSame(M, 'en-tête', [await page.locator('.dm-head .dm-back').isVisible(), await textOf(page, '.dm-head-title'), await textOf(page, '.dm-head-sub'),
      await page.getAttribute('.dm-head-who', 'href'), await page.$$eval('.dm-head-tools button', (els) => els.map((el) => el.getAttribute('aria-label')))],
    [false, 'Agence Démo Lyon', 'Appartement 3 pièces · Lyon 2e', `/messages/?c=${chatId(1)}&vue=details`, ['Appeler', 'Plus d\'options']]);
    // Carte de l'annonce : la ville et la surface, le prix à droite et « Voir l'annonce › » (maquette 10 ; « Voir › » sur
    // téléphone).
    expectSame(M, 'barre de l\'annonce', [await textOf(page, '.dm-banner-title'), await textOf(page, '.dm-banner-line'), await textOf(page, '.dm-banner-price'),
      await textOf(page, '.dm-banner-link'), await page.getAttribute('a.dm-banner', 'href')],
    ['Appartement 3 pièces', 'Lyon 2e · 62 m²', '238 000 €', 'Voir l’annonce', `/annonce/?id=${homeId(1)}`]);
    // Séparateurs de l'app : le jour et l'heure du premier message (« Aujourd'hui · 09:58 »).
    expectSame(M, 'jours', await page.$$eval('.dm-day-label', (els) => els.map((el) => el.textContent)), ['Hier · 18:02', 'Aujourd\'hui · 09:58']);
    // Coches dans les bulles : l'agence a tout lu jusqu'à 10:45.
    expectSame(M, 'coches', await page.$$eval('.dm-msg.is-out .dm-status .dm-check', (els) => els.map((el) => el.getAttribute('aria-label'))), ['Lu', 'Lu', 'Lu']);
    expectSame(M, 'demande de visite confirmée', await visitCard(page), {
      kind: 'Demande de visite', when: 'Jeudi 12 novembre · 18:00', where: 'Appartement 3 pièces · sur place', slots: [], state: null, actions: [],
      outcome: 'Visite confirmée', confirmed: true, width: 340,
    });
    expectSame(M, 'carte d\'offre', [await textOf(page, '.dm-offer-head'), await textOf(page, '.dm-offer-amount'), await textOf(page, '.dm-offer-gap'),
      await textOf(page, '.dm-offer-conditions'), await textOf(page, '.dm-offer-expiry'), await page.$$eval('.dm-offer-actions button', (els) => els.map((el) => el.textContent))],
    ['OFFRE En attente', '228 000 €', '4,2 % sous le prix affiché', 'Sous réserve d\'obtention du prêt', 'Valable jusqu\'au 13 novembre', ['Retirer']]);
    // Les photos plus haut dans le fil se chargent à l'approche (loading="lazy") : on y va, puis on revient en bas.
    await page.locator('.dm-media-tile img').first().scrollIntoViewIfNeeded();
    await imagesLoaded(page, '.dm-media-tile img', 2, `${M} : photos`);
    await page.$eval('.dm-thread', (el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForSelector('a.dm-file');
    const signedPhotos = await page.$$eval('.dm-media-tile img', (els) => els.map((el) => el.getAttribute('src')));
    expectSame(M, 'photos (URL signées)', signedPhotos, AGENT_PHOTOS.map((path) => `https://izzsoitqtzzswkpvdozd.supabase.co/storage/v1/object/sign/message-attachments/${path}?token=jeton-de-test`));
    expectSame(M, 'URL signées demandées', [...new Map(chat.signs.map((sign) => [sign.path, sign.body])).entries()].sort(),
      [[AGENT_PHOTOS[0], { expiresIn: 600 }], [AGENT_PHOTOS[1], { expiresIn: 600 }], [LOAN_PDF, { expiresIn: 600 }]]);
    expectSame(M, 'fichier', [await textOf(page, '.dm-file-name'), await textOf(page, '.dm-file-line'), await textOf(page, '.dm-file-badge'),
      await page.$eval('.dm-file-badge', (el) => getComputedStyle(el).color), await page.getAttribute('a.dm-file', 'href'), await page.getAttribute('a.dm-file', 'target')],
    ['Simulation_pret.pdf', 'PDF · 245 Ko', 'PDF', 'rgb(192, 57, 43)', `https://izzsoitqtzzswkpvdozd.supabase.co/storage/v1/object/sign/message-attachments/${LOAN_PDF}?token=jeton-de-test`, '_blank']);
    // Barre d'écriture de la maquette 10 (étape 5) : bande blanche sans filet (8 / 24 / 20 px), « + », champ, appareil
    // photo et envoi de 44 px, l'envoi pâle tant que le champ est vide ; une conversation sur une annonce propose
    // « Envoyer le dossier complet » (capsule de 36).
    expectSame(M, 'réponses rapides', await quickReplies(page), ['Envoyer le dossier complet']);
    const composer = async () => page.evaluate(() => {
      const size = (selector) => { const box = document.querySelector(selector).getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)]; };
      const bottom = getComputedStyle(document.querySelector('.dm-bottom'));
      return {
        band: [bottom.paddingTop, bottom.paddingLeft, bottom.paddingBottom, bottom.borderTopWidth, bottom.backgroundColor],
        plus: size('.dm-plus'), field: size('.dm-field')[1], camera: size('.dm-camera'), send: size('.dm-send'),
        sendColor: [getComputedStyle(document.querySelector('.dm-send')).backgroundColor, getComputedStyle(document.querySelector('.dm-send')).opacity],
        disabled: document.querySelector('.dm-send').disabled, placeholder: document.querySelector('.dm-field textarea').placeholder,
        labels: ['.dm-plus', '.dm-camera', '.dm-send'].map((selector) => document.querySelector(selector).getAttribute('aria-label')),
        width: Math.round(document.querySelector('.dm-bottom').getBoundingClientRect().width),
        chip: Math.round(document.querySelector('.dm-quick button')?.getBoundingClientRect().height ?? 0),
      };
    });
    expectSame(M, 'zone de saisie', await composer(), {
      band: ['8px', '24px', '20px', '0px', 'rgb(255, 255, 255)'], plus: [44, 44], field: 44, camera: [44, 44], send: [44, 44],
      sendColor: ['rgb(60, 92, 176)', '0.45'], disabled: true, placeholder: 'Votre message...', labels: ['Ajouter une pièce jointe', 'Prendre une photo', 'Envoyer'],
      width: card[1] - 2 - sideWidth, chip: 36,
    });
    const atBottom = await page.evaluate(() => { const el = document.querySelector('.dm-thread'); return el.scrollHeight - el.scrollTop - el.clientHeight; });
    if (atBottom > 2) problems.push(`${M} : la conversation ne s'ouvre pas en bas (${atBottom} px plus bas)`);
    expectSame(M, 'boutons et champs sans nom', await unnamedControls(page), []);
    await chatShot(page, `3-messages-${width}.png`);

    if (width === 1440) {
      // « En ligne » : l'agence a la page Messages ouverte (présence sur le canal de la conversation).
      const joined = chatServer.presence().joined;
      if (!joined.includes(`realtime:presence-${chatId(1)}`)) problems.push(`${M} : canal de présence de A non rejoint (${JSON.stringify(joined)})`);
      if (!chatServer.presence().tracked.some((item) => item.topic === `realtime:presence-${chatId(1)}` && item.payload?.event === 'track')) problems.push(`${M} : le compte ne s'annonce pas en ligne`);
      chatServer.pushPresence(chatId(1), [AGENT_ID]);
      await page.waitForFunction(() => document.querySelector('.dm-head-sub')?.textContent === 'En ligne', null, { timeout: 8000 })
        .catch(async () => problems.push(`${M} : « En ligne » non affiché (${await textOf(page, '.dm-head-sub')})`));
      // « En ligne » en vert demi-gras et le point vert sur l'avatar, comme l'en-tête de l'app.
      expectSame(M, 'point vert', await page.evaluate(() => [getComputedStyle(document.querySelector('.dm-head-sub.is-online')).color,
        getComputedStyle(document.querySelector('.dm-head .dm-presence')).backgroundColor]).catch(() => null), ['rgb(87, 121, 101)', 'rgb(87, 121, 101)']);

      // Cœur (message_reactions, comme setReaction) : un double clic sur la bulle (le double toucher de l'app) le pose,
      // ❤️ comme l'app ; un autre double clic le retire (demande du 17/11).
      const lastReceived = page.locator('.dm-msg:not(.is-out)').last();
      mark = chat.calls.length;
      await lastReceived.locator('.dm-bubble').dblclick();
      await lastReceived.locator('.dm-reaction-pill').waitFor({ timeout: 8000 }).catch(() => problems.push(`${M} : cœur non affiché`));
      const liked = await oneCall(chat, 'message_reactions', mark, `${M} : cœur`);
      if (liked) {
        expectSame(M, 'cœur posé', [liked.method, liked.search, liked.body], ['POST', '?on_conflict=message_id,user_id', { message_id: messageId(7).toUpperCase(), emoji: '❤️' }]);
        if (!liked.prefer.includes('resolution=merge-duplicates')) problems.push(`${M} : cœur sans fusion (Prefer « ${liked.prefer} »)`);
      }
      expectSame(M, 'pastille du cœur', [await lastReceived.locator('.dm-reaction-pill').getAttribute('aria-label').catch(() => null),
        await page.evaluate(() => window.getSelection()?.toString() ?? '')], ['Réactions : ❤️, 1', '']);
      mark = chat.calls.length;
      await lastReceived.locator('.dm-bubble').dblclick();
      await lastReceived.locator('.dm-reaction-pill').waitFor({ state: 'detached', timeout: 8000 }).catch(() => problems.push(`${M} : cœur non retiré`));
      const unliked = await oneCall(chat, 'message_reactions', mark, `${M} : cœur retiré`);
      if (unliked) expectSame(M, 'cœur retiré', [unliked.method, unliked.search], ['DELETE', `?message_id=eq.${messageId(7).toUpperCase()}&user_id=eq.${USER_ID.toUpperCase()}`]);

      // Écrire : le champ grandit jusqu'à 4 lignes (lineLimit(1...4) de l'app ; lignes de 22 px et 11 px en haut et en bas
      // sur ordinateur) ; un émoji tapé au clavier se place au curseur ; Maj + Entrée
      // va à la ligne ; Entrée envoie, avec exactement les colonnes de l'app (MessageInsert) ; le message arrive en fondu.
      const checkInsert = (call, what, content, preview) => {
        if (!call) return;
        const body = call.body ?? {};
        if (!UPPER_UUID.test(body.id ?? '') || body.client_id !== body.id) problems.push(`${M} : ${what} : identifiants ${body.id} / ${body.client_id}`);
        expectSame(M, what, [call.method, call.search, body], ['POST', '?select=id,conversation_id,sender_id,kind,client_id,content,created_at,expires_at,reply_to_id,forwarded,message_reactions(user_id,emoji,created_at)',
          { id: body.id, conversation_id: A, client_id: body.id, content, preview }]);
        if (!call.prefer.includes('return=representation')) problems.push(`${M} : ${what} : Prefer « ${call.prefer} »`);
      };
      const fieldHeight = () => page.$eval('.dm-field textarea', (el) => Math.round(el.getBoundingClientRect().height));
      await page.fill('.dm-composer textarea', 'Une\ndeux');
      expectSame(M, 'champ de 2 lignes', await fieldHeight(), 66);
      await page.fill('.dm-composer textarea', 'Un\ndeux\ntrois\nquatre\ncinq\nsix\nsept');
      expectSame(M, 'champ de 7 lignes (4 affichées)', await fieldHeight(), 110);
      await page.fill('.dm-composer textarea', '');
      expectSame(M, 'champ vide', await fieldHeight(), 44);
      mark = chat.calls.length;
      await page.fill('.dm-composer textarea', 'Merci, à jeudi ');
      expectSame(M, 'envoi possible', [await page.isDisabled('.dm-send'), await page.$eval('.dm-send', (el) => getComputedStyle(el).backgroundColor)], [false, 'rgb(60, 92, 176)']);
      // Pas de panneau d'émojis : comme dans l'app, c'est le clavier qui les donne.
      await page.focus('.dm-composer textarea');
      await page.keyboard.press('End');
      await page.keyboard.insertText('🙂');
      expectSame(M, 'émoji ajouté', [await page.inputValue('.dm-composer textarea'), await page.locator('.dm-emoji, .dm-emoji-panel').count(),
        await page.evaluate(() => document.activeElement?.matches('.dm-composer textarea') ?? false)], ['Merci, à jeudi 🙂', 0, true]);
      await page.keyboard.press('Shift+Enter');
      expectSame(M, 'Maj + Entrée', await page.inputValue('.dm-composer textarea'), 'Merci, à jeudi 🙂\n');
      await page.keyboard.press('Backspace');
      if (chatCalls(chat, 'messages', mark).some((call) => call.method === 'POST')) problems.push(`${M} : Maj + Entrée envoie le message`);
      await page.keyboard.press('Enter');
      checkInsert(await oneCall(chat, 'messages', mark, `${M} : texte`, (call) => call.method === 'POST'), 'texte envoyé', chatText('Merci, à jeudi 🙂'), 'Merci, à jeudi 🙂');
      await page.waitForFunction(() => [...document.querySelectorAll('.dm-bubble.is-out .dm-text')].at(-1)?.textContent === 'Merci, à jeudi 🙂', null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : le texte envoyé n'apparaît pas`));
      expectSame(M, 'après l\'envoi', [await page.inputValue('.dm-composer textarea'), await page.isDisabled('.dm-send'),
        await page.$$eval('.dm-msg.is-out .dm-status .dm-check', (els) => els.at(-1)?.getAttribute('aria-label')),
        await page.evaluate(() => [...document.querySelectorAll('.dm-msg')].map((el) => el.classList.contains('is-new')).join('')), (await inboxRows(page))[0]],
      ['', true, 'Envoyé', `${'false'.repeat(await page.locator('.dm-msg').count() - 1)}true`, { ...INITIAL_ROWS[0], preview: 'Vous : Merci, à jeudi 🙂', unread: null, time: '10:50' }]);
      if (await page.locator('dialog.alert-dialog[open]').count()) problems.push(`${M} : une fenêtre (prénom ?) s'ouvre alors que le compte a un prénom`);

      // Appareil photo de la barre d'écriture, à toutes les largeurs comme dans l'app : le choix d'une photo (l'appareil
      // photo du téléphone ; un fichier sur ordinateur).
      const [cameraChooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), page.click('.dm-camera')]);
      expectSame(M, 'appareil photo', [cameraChooser.isMultiple(), await page.getAttribute('[data-testid="dm-camera-input"]', 'capture')], [false, 'environment']);

      // « Envoyer le dossier complet » : le choix des documents immobiliers, comme dans le « + ».
      await page.click('.dm-quick button:text-is("Envoyer le dossier complet")');
      expectSame(M, 'dossier complet', await dialogTitle(page, 'sheet'), 'Documents immobiliers');
      await page.click('dialog.dm-sheet[open] .dm-sheet-close');
      await page.waitForSelector('dialog.dm-sheet[open]', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${M} : « Documents immobiliers » reste ouvert`));

      // « + » : sources de l'app (Photos et vidéos, Documents depuis l'ordinateur), pas d'offre tant qu'une offre attend.
      await page.click('.dm-plus');
      expectSame(M, 'menu « + »', [await dialogTitle(page, 'sheet'), await page.$$eval('dialog[open] .dm-sources button', (els) => els.map((el) => el.querySelector('.dm-source-title').textContent)),
        await page.$$eval('dialog[open] .dm-wide-title', (els) => els.map((el) => el.textContent))],
      ['Joindre', ['Appareil photo', 'Photos et vidéos', 'Documents', 'Caméra vidéo', 'Localisation', 'Contacts', 'Mon dossier'], ['Documents immobiliers']]);
      // Une photo de l'ordinateur : envoyée dans message-attachments au chemin de l'app, puis le message qui la cite.
      mark = chat.calls.length;
      let uploads = chat.uploads.length;
      const [photoChooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('dialog[open] .dm-sources button[aria-label="Photos et vidéos"]')]);
      await photoChooser.setFiles({ name: 'sejour.jpg', mimeType: 'image/jpeg', buffer: photos['photo1.jpg'] });
      await page.waitForSelector('dialog.dm-preview-sheet[open] .dm-tile img');
      expectSame(M, 'aperçu de la photo', await dialogTitle(page, 'sheet'), 'Aperçu');
      await page.click('dialog.dm-preview-sheet[open] .dm-pill');
      const photoMessage = await oneCall(chat, 'messages', mark, `${M} : photo`, (call) => call.method === 'POST');
      const photoUpload = chat.uploads[uploads] ?? null;
      if (chat.uploads.length !== uploads + 1 || !photoUpload) problems.push(`${M} : ${chat.uploads.length - uploads} fichier(s) envoyé(s) pour une photo`);
      else {
        const file = photoUpload.parts.find((part) => part.filename !== null);
        if (!new RegExp(`^${chatId(1)}/[0-9A-F-]{36}\\.jpg$`).test(photoUpload.path) || !UPPER_UUID.test(photoUpload.path.split('/')[1].slice(0, -4))) problems.push(`${M} : chemin de la photo ${photoUpload.path}`);
        expectSame(M, 'envoi de la photo', [photoUpload.headers['x-upsert'], photoUpload.parts.map((part) => [part.name, part.type]), photoUpload.parts.find((part) => part.name === 'cacheControl')?.body.toString(),
          file?.body.subarray(0, 3).toString('hex')], ['false', [['cacheControl', null], ['', 'image/jpeg']], '3600', 'ffd8ff']);
        if (photoMessage) {
          const items = photoMessage.body?.content?.attachments?._0 ?? [];
          const item = items[0] ?? {};
          if (!UPPER_UUID.test(item.id ?? '')) problems.push(`${M} : identifiant de la photo ${item.id}`);
          expectSame(M, 'message de la photo', [photoMessage.body?.content, photoMessage.body?.preview],
            [{ attachments: { _0: [{ id: item.id, kind: 'photo', fileName: 'Photo.jpg', storagePath: photoUpload.path, byteCount: file?.body.length }] } }, '📷 Photo']);
        }
        await imagesLoaded(page, '.dm-media-tile img', 3, `${M} : photo envoyée`);
      }
      // Un document « DPE » (Documents immobiliers) : même chemin, type de l'app, catégorie dans le message.
      mark = chat.calls.length;
      uploads = chat.uploads.length;
      await page.click('.dm-plus');
      await page.click('dialog[open] .dm-wide-row:has-text("Documents immobiliers")');
      expectSame(M, 'documents immobiliers', await dialogTitle(page, 'sheet'), 'Documents immobiliers');
      const [documentChooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('dialog[open] .dm-action-row:has-text("DPE")')]);
      await documentChooser.setFiles({ name: 'dpe.pdf', mimeType: 'application/pdf', buffer: PDF_BYTES });
      await page.waitForSelector('dialog.dm-preview-sheet[open] .dm-tile-doc');
      expectSame(M, 'aperçu du document', await textOf(page, 'dialog.dm-preview-sheet[open] .dm-tile-doc'), 'dpe.pdf DPE · PDF · 1 Ko');
      await page.click('dialog.dm-preview-sheet[open] .dm-pill');
      const documentMessage = await oneCall(chat, 'messages', mark, `${M} : document`, (call) => call.method === 'POST');
      const documentUpload = chat.uploads[uploads] ?? null;
      if (!documentUpload || !new RegExp(`^${chatId(1)}/[0-9A-F-]{36}\\.pdf$`).test(documentUpload.path)) problems.push(`${M} : envoi du document ${documentUpload?.path}`);
      else {
        expectSame(M, 'envoi du document', documentUpload.parts.map((part) => [part.name, part.type, part.name === 'cacheControl' ? part.body.toString() : part.body.length]),
          [['cacheControl', null, '3600'], ['', 'application/pdf', PDF_BYTES.length]]);
        const item = documentMessage?.body?.content?.attachments?._0?.[0] ?? {};
        expectSame(M, 'message du document', [documentMessage?.body?.content, documentMessage?.body?.preview],
          [{ attachments: { _0: [{ id: item.id, kind: 'document', fileName: 'dpe.pdf', storagePath: documentUpload.path, byteCount: PDF_BYTES.length, category: 'energyDiagnostic' }] } }, '📎 dpe.pdf']);
      }
      await page.waitForFunction(() => [...document.querySelectorAll('.dm-file-name')].some((el) => el.textContent === 'dpe.pdf'), null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : le document envoyé n'apparaît pas`));
      // Localisation (LocationShareSheet de l'app) : l'adresse choisie parmi les suggestions de la Géoplateforme, puis
      // « Joindre cette adresse » ; le message porte l'adresse et sa position, sans fichier, comme celui de l'app.
      await page.context().route('https://data.geopf.fr/geocodage/search**', (route) => route.fulfill({ status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature',
          geometry: { type: 'Point', coordinates: [4.8325, 45.7552] }, properties: { id: '69382_0000_00012', type: 'housenumber', name: '12 Rue de l\'Exemple',
            label: '12 Rue de l\'Exemple 69002 Lyon', postcode: '69002', city: 'Lyon', citycode: '69382', context: '69, Rhône, Auvergne-Rhône-Alpes' } }] }) }));
      mark = chat.calls.length;
      uploads = chat.uploads.length;
      await page.click('.dm-plus');
      await page.click('dialog[open] .dm-sources button[aria-label="Localisation"]');
      await page.waitForSelector('dialog.dm-location-sheet[open]', { timeout: 8000 }).catch(() => problems.push(`${M} : « Localisation » ne s'ouvre pas`));
      expectSame(M, 'localisation', [await dialogTitle(page, 'sheet'), await textOf(page, 'dialog[open] .dm-location-current'),
        await page.getAttribute('dialog[open] .dm-location-place input', 'placeholder'), await page.isDisabled('dialog[open] .dm-location-share')],
      ['Localisation', 'Position actuelle', 'Adresse du bien', true]);
      await page.fill('dialog[open] .dm-location-place input', '12 rue de l\'Exemple');
      await page.click('dialog[open] .place-list [role="option"]');
      await page.waitForFunction(() => document.querySelector('dialog[open] .dm-location-share')?.disabled === false, null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : « Joindre cette adresse » reste grisé`));
      await page.click('dialog[open] .dm-location-share');
      await page.waitForSelector('dialog.dm-preview-sheet[open] .dm-tile-doc', { timeout: 8000 }).catch(() => problems.push(`${M} : la localisation n'est pas dans l'aperçu`));
      await page.click('dialog.dm-preview-sheet[open] .dm-pill');
      const placeMessage = await oneCall(chat, 'messages', mark, `${M} : localisation`, (call) => call.method === 'POST');
      if (chat.uploads.length !== uploads) problems.push(`${M} : fichier envoyé pour une localisation`);
      if (placeMessage) {
        const item = placeMessage.body?.content?.attachments?._0?.[0] ?? {};
        if (!UPPER_UUID.test(item.id ?? '')) problems.push(`${M} : identifiant de la localisation ${item.id}`);
        expectSame(M, 'message de la localisation', [placeMessage.body?.content, placeMessage.body?.preview],
          [{ attachments: { _0: [{ id: item.id, kind: 'location', fileName: '12 Rue de l\'Exemple, 69002 Lyon', byteCount: 0, latitude: 45.7552, longitude: 4.8325 }] } }, '📍 Localisation']);
      }

      // Temps réel : l'agence lit (coches « Lu »), puis écrit ; tout arrive sans recharger, le nouveau message en fondu,
      // et la conversation est relue puis marquée lue une fois de plus.
      chat.participants.find((item) => item.conversation_id === chatId(1) && item.user_id === AGENT_ID).last_read_at = new Date(CHAT_NOW.getTime() + 60_000).toISOString();
      chatServer.pushChange('conversation_participants');
      await page.waitForFunction(() => [...document.querySelectorAll('.dm-msg.is-out .dm-status .dm-check')].every((el) => el.getAttribute('aria-label') === 'Lu'), null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : coches non mises à jour après la lecture de l'agence`));
      mark = chat.calls.length;
      chat.messages.push({
        id: messageId(8), conversation_id: chatId(1), sender_id: AGENT_ID, kind: 'text', client_id: messageId(8), content: chatText('Je vous appelle demain matin pour organiser la suite.'),
        created_at: new Date(CHAT_NOW.getTime() + 120_000).toISOString(), expires_at: null, message_reactions: [], preview: 'Je vous appelle demain matin pour organiser la suite.',
      });
      chat.conversations[0].unread += 1;
      chatServer.pushChange('messages');
      await page.waitForFunction(() => [...document.querySelectorAll('.dm-bubble .dm-text')].at(-1)?.textContent === 'Je vous appelle demain matin pour organiser la suite.', null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : le message reçu en temps réel n'apparaît pas`));
      if (!(await page.evaluate(() => [...document.querySelectorAll('.dm-msg')].at(-1)?.classList.contains('is-new')))) problems.push(`${M} : le message reçu n'arrive pas en fondu`);
      const liveRead = await oneCall(chat, 'rpc/mark_conversation_read', mark, `${M} : message reçu`);
      if (liveRead) expectSame(M, 'message reçu marqué lu', liveRead.body, { p_conversation_id: A });
      await waitForMessagesBadge(page, '5', `${M} : après le message reçu`);
      if ((await page.evaluate(() => window.nidaloMarker)) !== 'même page') problems.push(`${M} : la page s'est rechargée`);
      expectSame(M, 'temps réel suivi', ['messages', 'conversation_participants', 'message_reactions', 'offers', 'visit_requests'].filter((table) => !chatServer.followed().includes(table)), []);

      // Menu « … » de l'app (DirectConversationMenuItems) : Archiver, Mettre en sourdine, Ajouter aux favoris, Bloquer,
      // Signaler. Chaque réglage relit la conversation puis enregistre tous ses réglages.
      expectSame(M, 'menu « … »', await headerMenu(page), ['Archiver', 'Mettre en sourdine', 'Ajouter aux favoris', 'Bloquer', 'Signaler']);
      const settings = { is_archived: false, is_favorite: false, muted_until: null, saves_photos: false, cleared_at: null };
      const setting = async (label, change) => {
        const before = chat.calls.length;
        await headerMenu(page, label);
        const write = await oneCall(chat, 'conversation_preferences', before, `${M} : ${label}`);
        const reread = chatCalls(chat, 'rpc/my_conversations', before).filter((call) => call.body?.p_conversation_id);
        expectSame(M, `« ${label} » : relecture`, reread.map((call) => call.body), [{ p_conversation_id: A }]);
        Object.assign(settings, change);
        if (write) {
          expectSame(M, `« ${label} »`, [write.method, write.search, write.body], ['POST', '?on_conflict=conversation_id,user_id', { conversation_id: A, ...settings }]);
          if (!write.prefer.includes('resolution=merge-duplicates')) problems.push(`${M} : « ${label} » sans fusion (Prefer « ${write.prefer} »)`);
        }
      };
      await setting('Archiver', { is_archived: true });
      await waitForRows(page, ALL_NAMES.slice(1), `${M} : après « Archiver »`);
      await setting('Désarchiver', { is_archived: false });
      await waitForRows(page, ALL_NAMES, `${M} : après « Désarchiver »`);
      // Sourdine « toujours » (la date lointaine de l'app), puis réactivée.
      await setting('Mettre en sourdine', { muted_until: '4001-01-01T00:00:00.000Z' });
      await setting('Réactiver les notifications', { muted_until: null });
      // Favori : l'avis de l'app seulement après l'enregistrement.
      await setting('Ajouter aux favoris', { is_favorite: true });
      expectSame(M, 'avis du favori', await noticeText(page, M), 'Conversation ajoutée aux favoris.');
      await setting('Retirer des favoris', { is_favorite: false });
      expectSame(M, 'avis du favori retiré', await noticeText(page, M), 'Conversation retirée des favoris.');
      // Bloquer (user_blocks), puis débloquer depuis la barre qui remplace la saisie.
      mark = chat.calls.length;
      await headerMenu(page, 'Bloquer');
      expectSame(M, 'confirmation du blocage', await dialogTitle(page), 'Bloquer ce compte ?');
      await alertButton(page, 'Bloquer');
      expectSame(M, 'avis du blocage', await noticeText(page, M), 'Compte bloqué.');
      const blocked = await oneCall(chat, 'user_blocks', mark, `${M} : bloquer`, (call) => call.method !== 'GET');
      if (blocked) expectSame(M, 'blocage', [blocked.method, blocked.body], ['POST', { blocked_id: AGENT_ID.toUpperCase() }]);
      expectSame(M, 'compte bloqué', [await textOf(page, '.dm-bottom-line'), await page.locator('.dm-composer').count(), (await headerMenu(page))[3]],
        ['Vous avez bloqué ce compte Débloquer', 0, 'Débloquer']);
      mark = chat.calls.length;
      await page.click('.dm-bottom-line .dm-link-button');
      await page.waitForSelector('.dm-composer');
      const unblocked = await oneCall(chat, 'user_blocks', mark, `${M} : débloquer`, (call) => call.method !== 'GET');
      if (unblocked) expectSame(M, 'déblocage', [unblocked.method, unblocked.search], ['DELETE', `?blocker_id=eq.${USER_ID.toUpperCase()}&blocked_id=eq.${AGENT_ID.toUpperCase()}`]);
      // Signaler (reports) : motif, description, puis l'avis de l'app.
      mark = chat.calls.length;
      await headerMenu(page, 'Signaler');
      expectSame(M, 'signalement', await dialogTitle(page, 'sheet'), 'Signaler la conversation');
      expectSame(M, 'motifs', await page.$$eval('dialog[open] .dm-choice', (els) => els.map((el) => el.textContent)),
        ['Spam', 'Fraude immobilière ou arnaque', 'Contenu inapproprié', 'Harcèlement', 'Usurpation d\'identité', 'Autre']);
      await page.click('dialog[open] .dm-choice:has-text("Fraude immobilière ou arnaque")');
      await page.fill('#dm-report-details', '  Demande de virement avant la visite.  ');
      await page.click('dialog[open] button:text-is("Enregistrer le signalement")');
      await alertStaysOpen(page, `${M} : avis du signalement`);
      expectSame(M, 'avis du signalement', await noticeText(page, M), 'Signalement envoyé à l\'équipe Nidalo.');
      const report = await oneCall(chat, 'reports', mark, `${M} : signaler`);
      if (report) {
        if (!UPPER_UUID.test(report.body?.id ?? '')) problems.push(`${M} : identifiant du signalement ${report.body?.id}`);
        expectSame(M, 'signalement envoyé', [report.method, report.body], ['POST', { id: report.body?.id, target_type: 'conversation', target_id: A, reason: 'scam', details: 'Demande de virement avant la visite.' }]);
      }
      // Appeler (l'agence a publié son numéro) : « Appeler X ? » puis le numéro (lien tel:) ; ici, « Annuler ».
      await page.click('.dm-head button[aria-label="Appeler"]');
      expectSame(M, 'appel', [await dialogTitle(page), await page.locator('dialog.alert-dialog[open] .alert-actions button').first().textContent()],
        ['Appeler Agence Démo Lyon ?', 'Appeler le 06 39 98 12 00']);
      await alertButton(page, 'Annuler');

      // Offres de A : retirer (withdraw_offer), puis « Faire une offre » revient dans le « + » (make_offer).
      mark = chat.calls.length;
      await page.click('.dm-offer-actions button:text-is("Retirer")');
      expectSame(M, 'retirer l\'offre', await dialogTitle(page), 'Retirer votre offre de 228 000 € ?');
      await alertButton(page, 'Retirer');
      const withdrawn = await oneCall(chat, 'rpc/withdraw_offer', mark, `${M} : retirer`);
      if (withdrawn) expectSame(M, 'offre retirée', withdrawn.body, { p_offer_id: offerId(1).toUpperCase() });
      await page.waitForFunction(() => document.querySelector('.dm-offer .dm-offer-status')?.textContent === 'Retirée', null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : l'offre retirée n'est pas « Retirée »`));
      if (!chatCalls(chat, 'rpc/my_offers', mark).length) problems.push(`${M} : offres non relues après « Retirer »`);
      await page.click('.dm-plus');
      await page.click('dialog[open] .dm-wide-row:has-text("Faire une offre")');
      // Sur ordinateur, l'écran est à côté de la liste : son titre est un h2 (le h1 de la page est « Messages »).
      await page.waitForSelector('.dm-pane .dl-offer-screen .dl-screen-titles h2');
      expectSame(M, 'écran de l\'offre', [await textOf(page, '.dl-offer-screen .dl-screen-titles h2'), await textOf(page, '.dl-offer-screen .dl-screen-head p'),
        await page.$$eval('h1', (els) => els.map((el) => el.textContent))],
      ['Faire une offre', 'Appartement 3 pièces · prix affiché 238 000 €', ['Messages']]);
      mark = chat.calls.length;
      // Montant saisi d'un coup : l'horloge figée de Playwright remplace requestAnimationFrame, dont le champ se sert
      // pour replacer le curseur après chaque chiffre (la saisie chiffre par chiffre est vérifiée par check-listing).
      await page.fill('#offre-montant', '230000');
      expectSame(M, 'montant de l\'offre', (await page.inputValue('#offre-montant')).replace(/\s/g, ' '), '230 000');
      await page.click('.dl-offer-screen .dl-submit');
      await page.waitForSelector('.dm-thread .dm-offer');
      const made = await oneCall(chat, 'rpc/make_offer', mark, `${M} : faire une offre`);
      if (made) expectSame(M, 'offre faite', made.body, { p_id: made.body?.p_id, p_conversation_id: chatId(1), p_amount: 230000 });
      await page.waitForFunction(() => {
        const cards = [...document.querySelectorAll('.dm-offer')];
        return cards.length === 2 && cards[1].querySelector('.dm-offer-amount')?.textContent.replace(/\s/g, ' ') === '230 000 €'
          && cards[1].querySelector('.dm-offer-status')?.textContent === 'En attente';
      }, null, { timeout: 8000 }).catch(() => problems.push(`${M} : la nouvelle offre n'apparaît pas dans la conversation`));

      // B : le compte vend ; Julien demande une visite (samedi 10 h ou dimanche 14 h) et fait une offre. Retour à la
      // liste par la flèche, puis la ligne de B.
      await backToList(page, `${M} : avant B`);
      mark = chat.calls.length;
      await page.click(rowLink(2));
      await page.waitForURL(`${base}/messages/?c=${chatId(2)}`);
      await page.waitForSelector('.dm-offer-actions');
      await page.waitForSelector('.dm-visit-actions');
      const readB = await oneCall(chat, 'rpc/mark_conversation_read', mark, `${M} : ouverture de B`);
      if (readB) expectSame(M, 'B marquée lue', readB.body, { p_conversation_id: chatId(2).toUpperCase() });
      await waitForMessagesBadge(page, '3', `${M} : après l'ouverture de B`);
      // Numéro non partagé : le téléphone reste, en gris, et l'avis de l'app l'explique.
      expectSame(M, 'en-tête de B (numéro non partagé)', [await textOf(page, '.dm-head-sub'), await page.$$eval('.dm-head-tools button', (els) => els.map((el) => el.getAttribute('aria-label'))),
        await textOf(page, '.dm-banner-line')], ['Appartement 2 pièces · Lyon 6e', ['Appeler, numéro non partagé', 'Plus d\'options'], 'Lyon 6e · 45 m²']);
      await page.click('.dm-head button[aria-label="Appeler, numéro non partagé"]');
      expectSame(M, 'appel sans numéro', await noticeText(page, M), 'Julien M. n\'a pas partagé son numéro. Vous pouvez lui écrire ici.');
      expectSame(M, 'offre reçue', [await textOf(page, '.dm-offer-head'), await textOf(page, '.dm-offer-gap'), await page.$$eval('.dm-offer-actions button', (els) => els.map((el) => el.textContent))],
        ['OFFRE En attente', '3,8 % sous le prix affiché', ['Accepter', 'Contre-offre', 'Refuser']]);
      const pendingVisit = {
        kind: 'Demande de visite', when: 'Samedi 7 novembre · 10:00', where: 'Appartement 2 pièces · sur place',
        slots: [['sam. 7 nov. à 10:00', 'true'], ['dim. 8 nov. à 14:00', 'false']], state: null, actions: [['Accepter', 38], ['Autre créneau', 38]],
        outcome: null, confirmed: false, width: 340,
      };
      expectSame(M, 'demande de visite reçue', await visitCard(page), pendingVisit);
      expectSame(M, 'réponses rapides après une demande', await quickReplies(page), ['Oui, samedi 10 h', 'Proposer un autre créneau', 'Envoyer le dossier complet']);
      await chatShot(page, '3-messages-visite-1440.png');
      // « Faire une offre » n'est pas proposé au vendeur.
      await page.click('.dm-plus');
      expectSame(M, '« + » du vendeur', await page.$$eval('dialog[open] .dm-wide-title', (els) => els.map((el) => el.textContent)), ['Documents immobiliers']);
      await page.click('dialog.dm-sheet[open] .dm-sheet-close');

      // Demande de visite : « Autre créneau » (propose_visit_slots), puis, remise en attente (temps réel), « Oui,
      // samedi 10 h » accepte le premier créneau et l'autre créneau choisi sur la carte (accept_visit_request).
      const visitAgain = async () => {
        Object.assign(chat.visitRequests[1], { status: 'pending', accepted_slot: null, proposed_slots: null, proposed_by: null });
        chatServer.pushChange('visit_requests');
        await page.waitForFunction(() => document.querySelectorAll('.dm-visit-actions button').length === 2 && document.querySelectorAll('.dm-visit-slot').length === 2, null, { timeout: 8000 })
          .catch(() => problems.push(`${M} : la demande remise en attente (temps réel) n'est pas relue`));
      };
      mark = chat.calls.length;
      await page.click('.dm-visit-actions button:text-is("Autre créneau")');
      // Feuille de l'app (ProposeSlotsSheet) : « Proposer d'autres créneaux » pour une demande en attente.
      expectSame(M, 'autre créneau', await textOf(page, 'dialog.dm-slots-sheet[open] h2'), 'Proposer d\'autres créneaux');
      expectSame(M, 'créneau proposé par défaut', [await page.inputValue('dialog.dm-slots-sheet[open] input[aria-label="Jour du créneau 1"]'),
        await page.inputValue('dialog.dm-slots-sheet[open] select[aria-label="Heure du créneau 1"]')], ['2026-11-07', '600']);
      await page.selectOption('dialog.dm-slots-sheet[open] select[aria-label="Heure du créneau 1"]', '900');
      await page.click('dialog.dm-slots-sheet[open] button[type="submit"]');
      const proposed = await oneCall(chat, 'rpc/propose_visit_slots', mark, `${M} : autre créneau`);
      if (proposed) {
        const slot = proposed.body?.p_slots?.[0] ?? {};
        if (!UPPER_UUID.test(slot.id ?? '')) problems.push(`${M} : identifiant du créneau proposé ${slot.id}`);
        expectSame(M, 'créneau proposé', proposed.body, { p_request_id: visitRequestId(2), p_slots: [{ id: slot.id, start: '2026-11-07T14:00:00Z', durationMinutes: 60 }] });
      }
      await page.waitForFunction(() => document.querySelector('.dm-visit-kind')?.textContent === 'Autre créneau proposé', null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : la carte ne montre pas l'autre créneau`));
      expectSame(M, 'après « Autre créneau »', [await visitCard(page), await quickReplies(page)], [{
        kind: 'Autre créneau proposé', when: 'Samedi 7 novembre · 15:00', where: 'Appartement 2 pièces · sur place', slots: [], state: 'En attente de réponse',
        actions: [['Autre créneau', 38]], outcome: null, confirmed: false, width: 340,
      }, ['Proposer un autre créneau', 'Envoyer le dossier complet']]);
      await visitAgain();
      mark = chat.calls.length;
      await page.click('.dm-quick button:has-text("Oui, samedi")');
      const acceptedFirst = await oneCall(chat, 'rpc/accept_visit_request', mark, `${M} : « Oui, samedi 10 h »`);
      if (acceptedFirst) expectSame(M, '« Oui, samedi 10 h »', acceptedFirst.body, { p_request_id: visitRequestId(2), p_slot_id: visitSlotId(2) });
      await page.waitForSelector('.dm-visit-outcome.is-confirmed', { timeout: 8000 }).catch(() => problems.push(`${M} : « Visite confirmée » absent après « Oui, samedi 10 h »`));
      expectSame(M, 'visite confirmée', [await visitCard(page), await quickReplies(page),
        await page.$eval('.dm-visit-outcome', (el) => getComputedStyle(el).color).catch(() => null)], [{
        ...pendingVisit, slots: [], actions: [], outcome: 'Visite confirmée', confirmed: true,
      }, ['Envoyer le dossier complet'], 'rgb(47, 122, 78)']);
      if (chatCalls(chat, 'messages', mark).some((call) => call.method === 'POST')) problems.push(`${M} : « Oui, samedi 10 h » envoie aussi un message`);
      await visitAgain();
      mark = chat.calls.length;
      await page.click('.dm-visit-slot:has-text("dim. 8 nov.")');
      expectSame(M, 'créneau choisi', [(await visitCard(page))?.when, (await visitCard(page))?.slots], ['Dimanche 8 novembre · 14:00', [['sam. 7 nov. à 10:00', 'false'], ['dim. 8 nov. à 14:00', 'true']]]);
      await page.click('.dm-visit-actions button:text-is("Accepter")');
      const acceptedSecond = await oneCall(chat, 'rpc/accept_visit_request', mark, `${M} : accepter dimanche`);
      if (acceptedSecond) expectSame(M, 'accepter dimanche', acceptedSecond.body, { p_request_id: visitRequestId(2), p_slot_id: visitSlotId(3) });
      await page.waitForSelector('.dm-visit-outcome.is-confirmed', { timeout: 8000 }).catch(() => problems.push(`${M} : « Visite confirmée » absent après « Accepter »`));
      expectSame(M, 'dimanche confirmé', (await visitCard(page))?.when, 'Dimanche 8 novembre · 14:00');
      await chatShot(page, '3-messages-visite-confirmee-1440.png');

      // Offre de B : refuser (motif), accepter, contre-offre (decline_offer, accept_offer, counter_offer).
      const pendingAgain = async () => {
        Object.assign(chat.offers[1], { status: 'pending', decline_reason: null, responded_at: null });
        chatServer.pushChange('offers');
        await page.waitForFunction(() => document.querySelectorAll('.dm-offer-actions button').length === 3, null, { timeout: 8000 })
          .catch(() => problems.push(`${M} : l'offre remise en attente (temps réel) n'est pas relue`));
      };
      mark = chat.calls.length;
      await page.click('.dm-offer-actions button:text-is("Refuser")');
      expectSame(M, 'refuser l\'offre', await textOf(page, 'dialog.dm-decline[open] h2'), 'Refuser l\'offre de 255 000 € ?');
      await page.fill('dialog.dm-decline[open] textarea', ' Prix trop bas pour le moment. ');
      await page.click('dialog.dm-decline[open] button[type="submit"]');
      const declined = await oneCall(chat, 'rpc/decline_offer', mark, `${M} : refuser`);
      if (declined) expectSame(M, 'offre refusée', declined.body, { p_offer_id: offerId(2).toUpperCase(), p_reason: 'Prix trop bas pour le moment.' });
      await page.waitForFunction(() => document.querySelector('.dm-offer .dm-offer-status')?.textContent === 'Refusée', null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : l'offre refusée n'est pas « Refusée »`));
      expectSame(M, 'motif affiché', await textOf(page, '.dm-offer-reason'), 'Motif : Prix trop bas pour le moment.');
      await pendingAgain();
      mark = chat.calls.length;
      await page.click('.dm-offer-actions button:text-is("Accepter")');
      expectSame(M, 'accepter l\'offre', await dialogTitle(page), 'Accepter l\'offre de 255 000 € ?');
      await alertButton(page, 'Accepter');
      const accepted = await oneCall(chat, 'rpc/accept_offer', mark, `${M} : accepter`);
      if (accepted) expectSame(M, 'offre acceptée', accepted.body, { p_offer_id: offerId(2).toUpperCase() });
      await page.waitForFunction(() => document.querySelector('.dm-offer .dm-offer-status')?.textContent === 'Acceptée', null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : l'offre acceptée n'est pas « Acceptée »`));
      await pendingAgain();
      mark = chat.calls.length;
      await page.click('.dm-offer-actions button:text-is("Contre-offre")');
      await page.waitForSelector('.dm-pane .dl-offer-screen .dl-screen-titles h2');
      expectSame(M, 'contre-offre', [await textOf(page, '.dl-offer-screen .dl-screen-titles h2'), (await page.inputValue('#offre-montant')).replace(/\s/g, ' '), await textOf(page, '.dl-offer-screen .dl-submit')],
        ['Faire une contre-offre', '255 000', 'Envoyer la contre-offre']);
      await page.fill('#offre-montant', '260000');
      expectSame(M, 'montant de la contre-offre', (await page.inputValue('#offre-montant')).replace(/\s/g, ' '), '260 000');
      await page.click('.dl-offer-screen .dl-submit');
      await page.waitForSelector('.dm-thread .dm-offer');
      const countered = await oneCall(chat, 'rpc/counter_offer', mark, `${M} : contre-offre`);
      if (countered) {
        if (!UPPER_UUID.test(countered.body?.p_id ?? '')) problems.push(`${M} : identifiant de la contre-offre ${countered.body?.p_id}`);
        expectSame(M, 'contre-offre envoyée', countered.body, { p_id: countered.body?.p_id, p_parent_offer_id: offerId(2).toUpperCase(), p_amount: 260000 });
      }
      await page.waitForFunction(() => {
        const cards = [...document.querySelectorAll('.dm-offer')].map((card) => card.textContent.replace(/\s+/g, ' ').trim());
        return cards.length === 2 && cards[0].includes('Contre-offre envoyée') && cards[1].startsWith('Contre-offre') && cards[1].includes('260 000 €') && cards[1].includes('Retirer');
      }, null, { timeout: 8000 }).catch(async () => problems.push(`${M} : cartes après la contre-offre ${JSON.stringify(await page.$$eval('.dm-offer', (els) => els.map((el) => el.textContent)))}`));
    }

    // D : groupe en sourdine, marqué lu à l'ouverture ; l'en-tête ouvre « Infos du groupe » (&vue=groupe), le + la feuille
    // « Ajouter des membres » (étape 4b : vérifiés en détail plus bas, « messages groupes »).
    await backToList(page, `${M} : avant le groupe`);
    mark = chat.calls.length;
    await page.click(rowLink(4));
    await page.waitForURL(`${base}/messages/?c=${chatId(4)}`);
    await page.waitForSelector('.dm-thread-inner .dm-day');
    const readD = await oneCall(chat, 'rpc/mark_conversation_read', mark, `${M} : ouverture du groupe`);
    if (readD) expectSame(M, 'groupe marqué lu', readD.body, { p_conversation_id: chatId(4).toUpperCase() });
    await waitForMessagesBadge(page, width === 1440 ? '' : '2', `${M} : après le groupe`);
    expectSame(M, 'groupe', [await textOf(page, '.dm-head-title'), await textOf(page, '.dm-head-sub'), await page.locator('.dm-head button[aria-label="Appeler"]').count(),
      await page.locator('.dm-head button[aria-label="Ajouter des membres"]').count(), await page.$$eval('.dm-sender', (els) => [...new Set(els.map((el) => el.textContent))]),
      await textOf(page, '.dm-system'), await page.locator('.dm-quick, .dm-banner').count()],
    ['Visite groupée Lyon 2e', 'Vous, Camille R., Agence Démo Lyon', 0, 1, ['Camille R.', 'Agence Démo Lyon'], 'Claire M. a créé le groupe « Visite groupée Lyon 2e »', 0]);
    await chatShot(page, `3-messages-groupe-${width}.png`);
    if (width === 1440) {
      await page.click('.dm-head-who');
      await page.waitForURL(`${base}/messages/?c=${chatId(4)}&vue=groupe`);
      await page.waitForSelector('.dmg-hero');
      expectSame(M, 'infos du groupe', [await textOf(page, '.dmg-bar h2'), await textOf(page, '.dmg-hero-name'), await textOf(page, '.dmg-hero-sub')],
        ['Infos du groupe', 'Visite groupée Lyon 2e', 'Groupe · 3 membres']);
      await page.click('.dmg-bar button[aria-label="Retour"]');
      await page.waitForURL(`${base}/messages/?c=${chatId(4)}`);
      await page.waitForSelector('.dm-thread-inner .dm-day');
      await page.click('.dm-head button[aria-label="Ajouter des membres"]');
      // Les contacts qui ne sont pas déjà membres, par ordre alphabétique (pas le compte supprimé : aucun compte).
      await page.waitForSelector('dialog[open] .dmg-picker-row');
      expectSame(M, 'ajouter des membres', [await dialogTitle(page, 'sheet'), await texts(page, 'dialog[open] .dmg-picker-name'), await textOf(page, 'dialog[open] .dmg-step-button')],
        ['Ajouter des membres', ['Immo Démo Croix-Rousse', 'Julien M.', 'Lucas G.', 'Marc P.'], 'Ajouter au groupe']);
      await page.click('dialog[open] .dm-sheet-close');
      await page.waitForSelector('dialog.dm-sheet[open]', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${M} : « Ajouter des membres » reste ouverte`));
      expectSame(M, 'menu « … » du groupe', await headerMenu(page), ['Infos du groupe', 'Ajouter aux favoris', 'Réactiver les notifications', 'Archiver', 'Signaler le groupe']);
      mark = chat.calls.length;
      await headerMenu(page, 'Réactiver les notifications');
      const unmuted = await oneCall(chat, 'conversation_preferences', mark, `${M} : groupe réactivé`);
      if (unmuted) expectSame(M, 'groupe réactivé', unmuted.body, { conversation_id: chatId(4).toUpperCase(), is_archived: false, is_favorite: false, muted_until: null, saves_photos: false, cleared_at: null });
    }

    // « Détails » : ouvert par l'en-tête de la conversation à deux, à sa propre adresse ; « Retour » revient.
    await backToList(page, `${M} : avant les détails`);
    await page.click(rowLink(1));
    await page.waitForSelector('.dm-head-who[href]');
    await page.click('.dm-head-who');
    await page.waitForURL(`${base}/messages/?c=${chatId(1)}&vue=details`);
    await page.waitForSelector('section.dm-details');
    expectSame(M, 'détails', [await textOf(page, '.dm-details-bar h2'), await textOf(page, '.dm-details-who h3'), await textOf(page, '.dm-details-badges')],
      ['Détails', 'Agence Démo Lyon', 'PRO Sur Nidalo depuis mars 2025']);
    // « Voir l'agenda » de la prochaine visite ouvre Mon agenda (Mon espace sur ordinateur).
    expectSame(M, 'lien de l’agenda des détails', await page.$$eval('.dm-details-section', (els) => els
      .filter((el) => el.querySelector('.dm-section-head h3')?.textContent === 'Prochaine visite')
      .map((el) => [el.querySelector('.dm-section-head a')?.textContent ?? null, el.querySelector('.dm-section-head a')?.getAttribute('href') ?? null])),
    [['Voir l\'agenda', '/compte/?vue=agenda']]);
    await page.waitForTimeout(300);
    await chatShot(page, `3-messages-details-${width}.png`);
    await page.click('.dm-details-bar button[aria-label="Retour"]');
    await page.waitForURL(`${base}/messages/?c=${chatId(1)}`);
    await page.waitForSelector('.dm-thread-inner');
    // « Vidéo » des Détails : le formulaire de visite de la fiche, sur « En visio » (initialMode de l'app) ; dans un
    // onglet à part, pour ne rien changer à la suite.
    {
      const extra = await chatDesk.newPage();
      await extra.goto(`${base}/messages/?c=${chatId(1)}&vue=details`);
      await extra.waitForSelector('.dm-detail-actions .dm-detail-action:not(.is-dim):has-text("Vidéo")');
      await extra.click('.dm-detail-actions .dm-detail-action:has-text("Vidéo")');
      await extra.waitForURL(`${base}/annonce/?id=${homeId(1)}&vue=visite&type=visio`);
      await extra.close();
    }

    // « Nouvelle discussion » (le crayon de la liste) : actions rapides, contacts ; « Nouveau groupe », « Nouvelle
    // communauté » et « Nouvelle diffusion » poussent leur écran dans la feuille (étape 4b), « Retour » revient. Plein
    // écran comme l'app (fullScreenCover), son contenu dans la colonne de 720 px.
    await backToList(page, `${M} : avant « Nouvelle discussion »`);
    await page.click('.dm-compose');
    expectSame(M, 'nouvelle discussion', [await dialogTitle(page, 'sheet'), await page.$$eval('dialog[open] .dm-quick-actions .dm-action-text', (els) => els.map((el) => el.textContent)),
      await page.$$eval('dialog[open] .dm-results-title', (els) => els.map((el) => el.textContent))],
    ['Nouvelle discussion', ['Nouveau groupe', 'Nouvelle communauté', 'Nouveau contact', 'Nouvelle diffusion'], ['Contacts fréquents', 'A', 'C', 'I', 'J', 'L', 'M']]);
    await page.waitForFunction(() => document.querySelector('dialog.dm-new[open]')?.getAnimations().length === 0, null, { timeout: 8000 }).catch(() => undefined);
    expectSame(M, 'nouvelle discussion en plein écran', await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      const [dialog, body, head] = [box('dialog.dm-new[open]'), box('dialog.dm-new[open] .dm-sheet-body'), box('dialog.dm-new[open] .dm-sheet-head')];
      return [dialog.left, dialog.top, dialog.width, dialog.height, body.left, body.width, Math.round(head.height)];
    }), [0, 0, width, height, (width - 720) / 2, 720, 45]);
    await page.waitForTimeout(300);
    await chatShot(page, `3-messages-nouvelle-${width}.png`);
    if (width === 1440) {
      for (const title of ['Nouveau groupe', 'Nouvelle communauté', 'Nouvelle diffusion']) {
        await page.click(`dialog[open] .dm-quick-actions .dm-action-row:has-text("${title}")`);
        await page.waitForFunction((wanted) => document.querySelector('dialog.dm-sheet[open] h2')?.textContent === wanted, title, { timeout: 8000 })
          .catch(() => problems.push(`${M} : « ${title} » ne s'ouvre pas`));
        expectSame(M, `écran « ${title} »`, [await page.locator('dialog.alert-dialog[open]').count(), await page.locator('dialog[open] .dm-sheet-back').count(),
          await page.locator('dialog[open] .dm-sheet-close').count(), await page.locator('dialog[open] .dmg-step-button').count()], [0, 1, 0, 1]);
        await page.click('dialog[open] .dm-sheet-back');
        await page.waitForSelector('dialog[open] .dm-quick-actions');
      }
      // « Nouveau contact » : le compte Nidalo d'un numéro (find_account_by_phone), puis « Écrire » (start_phone_conversation).
      await page.click('dialog[open] .dm-quick-actions .dm-action-row:has-text("Nouveau contact")');
      expectSame(M, 'nouveau contact', await dialogTitle(page, 'sheet'), 'Nouveau contact');
      mark = chat.calls.length;
      await page.fill('dialog[open] input[aria-label="Numéro de téléphone"]', '0639985678');
      await page.waitForSelector('dialog[open] .dm-phone-account');
      expectSame(M, 'compte trouvé', [await page.inputValue('dialog[open] input[aria-label="Numéro de téléphone"]'), await textOf(page, 'dialog[open] .dm-phone-card')],
        ['06 39 98 56 78', '06 39 98 56 78 Compte Nidalo trouvé NL Nina L. Particulier Ajouter aux contacts Écrire']);
      const lookup = await oneCall(chat, 'rpc/find_account_by_phone', mark, `${M} : nouveau contact`);
      if (lookup) expectSame(M, 'recherche du numéro', lookup.body, { p_phone: NINA_PHONE });
      await page.click('dialog[open] .dm-phone-actions button:text-is("Ajouter aux contacts")');
      await iphoneOnly(page, `${M} : nouveau contact`, 'Ajouter aux contacts');
      mark = chat.calls.length;
      await page.click('dialog[open] .dm-phone-actions button:text-is("Écrire")');
      await page.waitForURL(`${base}/messages/?c=${chatId(7)}`);
      await page.waitForSelector('section.dm-pane[aria-label="Conversation avec Nina L."]');
      const started = await oneCall(chat, 'rpc/start_phone_conversation', mark, `${M} : écrire`);
      if (started) expectSame(M, 'conversation par numéro', started.body, { p_phone: NINA_PHONE });
      if (await page.locator('dialog.dm-sheet[open]').count()) problems.push(`${M} : « Nouvelle discussion » reste ouverte`);
      // Une conversation sans annonce : ni barre de l'annonce, ni réponse rapide.
      expectSame(M, 'conversation sans annonce', await page.locator('.dm-banner, .dm-quick').count(), 0);
      // Une agence qui publie, pas encore contactée : start_direct_conversation.
      await backToList(page, `${M} : avant l'agence`);
      await page.click('.dm-compose');
      await page.fill('dialog[open] input[aria-label="Nom, numéro ou nom de profil"]', 'Immo');
      mark = chat.calls.length;
      await page.click('dialog[open] button.dm-contact:has-text("Immo Démo Croix-Rousse")');
      await page.waitForURL(`${base}/messages/?c=${chatId(8)}`);
      await page.waitForSelector('section.dm-pane[aria-label="Conversation avec Immo Démo Croix-Rousse"]');
      const direct = await oneCall(chat, 'rpc/start_direct_conversation', mark, `${M} : agence`);
      if (direct) expectSame(M, 'conversation avec l\'agence', direct.body, { p_user_id: PRO_ID.toUpperCase() });
    }
    await page.close();
    await chatDesk.close();
  }

  // Chargement : la roue de l'app (ProgressView) dans la conversation de l'adresse, avec sa flèche retour, pendant la
  // lecture (la liste, cachée dessous, a la sienne) ; plus de formes grises.
  {
    const M = 'messages chargement';
    const { context: slowDesk, chat } = await chatContext({ width: 1440, height: 960 });
    // La liste arrive au bout de 1,5 s, les messages au bout de 3 s : d'abord deux roues, puis celle du fil seule. Sur
    // ordinateur (étape 5), la liste reste à côté de la conversation : sa roue se voit, et pas de flèche retour.
    chat.slow = { 'rpc/my_conversations': 1500, messages: 3000 };
    page = await slowDesk.newPage();
    page.on('pageerror', (error) => problems.push(`${M}: erreur ${error.message}`));
    await page.goto(`${base}/messages/?c=${chatId(1)}`);
    await page.waitForSelector('.dm-main .dm-thread.is-loading .spinner[role="status"]', { timeout: 8000 }).catch(() => problems.push(`${M} : pas de roue dans la conversation`));
    expectSame(M, 'roues', [await page.$$eval('.dm-side .spinner[role="status"]', (els) => els.map((el) => [el.getAttribute('aria-label'), el.getClientRects().length > 0])),
      await page.$$eval('.dm-main .dm-thread.is-loading .spinner[role="status"]', (els) => els.map((el) => el.getAttribute('aria-label'))),
      await page.locator('.dm-main .dm-back:visible').count(), await page.locator('[class*="dm-skel"]').count()],
    [[['Chargement des conversations', true]], ['Chargement des messages'], 0, 0]);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, '3-messages-chargement-1440.png') });
    await page.waitForSelector('.dm-head-title', { timeout: 8000 });
    expectSame(M, 'fil en cours de lecture', [await page.locator('.dm-main .dm-thread.is-loading .spinner').count(), await page.locator('.dm-side .spinner').count()], [1, 0]);
    await page.waitForSelector('.dm-thread-inner .dm-day', { timeout: 8000 }).catch(() => problems.push(`${M} : le fil ne remplace pas la roue`));
    if (await page.locator('.dm-thread.is-loading').count()) problems.push(`${M} : la roue reste affichée`);
    await page.close();
    await slowDesk.close();
  }

  // Longue conversation avec un PDF et une demande de visite, à 1280, 1440 et 390 px de large (point 9 de la
  // demande) : la fin du fil s'affiche, rien ne dépasse, la carte et le fichier gardent leur taille.
  {
    const longChat = (chat) => {
      const lines = [
        'Bonjour, l\'appartement est-il toujours disponible ?', 'Oui, toujours disponible. Souhaitez-vous des photos supplémentaires ?',
        'Avec plaisir, surtout la cuisine.', 'Je vous les envoie ce soir.', 'Merci ! Les charges de copropriété sont de combien ?',
        '180 € par mois, eau froide et chauffage compris.', 'D\'accord. Et la taxe foncière ?', '1 150 € pour 2025.',
        'Le syndic est-il professionnel ?', 'Oui, un cabinet de Lyon 6e, très réactif.', 'Y a-t-il des travaux votés ?',
        'Le ravalement est voté pour 2027, la quote-part est à la charge du vendeur.', 'Parfait, c\'est noté.',
        'Je peux vous transmettre les trois derniers procès-verbaux d\'assemblée générale.', 'Oui, merci beaucoup.',
        'Le bien est-il loué actuellement ?', 'Deux lots sur trois sont loués, le troisième est libre depuis septembre.',
        'Quel est le loyer des lots loués ?', '640 € et 710 € hors charges, baux de 2023.', 'Merci pour toutes ces précisions !',
        'Avec plaisir. N\'hésitez pas si vous avez d\'autres questions.', 'Je vais réfléchir et je reviens vers vous rapidement.',
      ];
      lines.forEach((text, index) => {
        const sender = index % 2 === 0 ? OTHER_ID : USER_ID;
        const at = new Date(Date.parse('2026-11-01T08:00:00Z') + index * 3 * 3_600_000).toISOString();
        chat.messages.push({
          id: messageId(100 + index), conversation_id: chatId(2), sender_id: sender, kind: 'text', client_id: messageId(100 + index), content: chatText(text),
          created_at: at, expires_at: null, message_reactions: [], preview: text,
        });
      });
      const path = `${chatId(2)}/7A1C2E3F-4B5D-4E6F-8A9B-0C1D2E3F4A70.pdf`;
      chat.files.set(path, { type: 'application/pdf', body: PDF_BYTES });
      chat.messages.push({
        id: messageId(140), conversation_id: chatId(2), sender_id: USER_ID, kind: 'attachments', client_id: messageId(140),
        content: { attachments: { _0: [{ id: '0B6D1F2A-3C4E-4F5A-9B6C-7D8E9F0A1B70', kind: 'document', fileName: 'Diagnostics_appartement.pdf', storagePath: path, byteCount: 1_240_000 }] } },
        created_at: '2026-11-05T19:16:00Z', expires_at: null, message_reactions: [], preview: '📎 Diagnostics_appartement.pdf',
      });
    };
    for (const [label, size] of [['1280', { width: 1280, height: 800 }], ['1440', { width: 1440, height: 960 }], ['390', { phone: true }]]) {
      const M = `messages longue conversation ${label}`;
      const { context: longContext, chat } = await chatContext(size);
      longChat(chat);
      page = await open(longContext, `/messages/?c=${chatId(2)}`, `messages-longue-${label}`);
      await page.waitForSelector('.dm-visit-actions');
      await page.waitForSelector('a.dm-file', { timeout: 8000 }).catch(() => problems.push(`${M} : le PDF n'apparaît pas`));
      await page.waitForTimeout(400);
      const shape = await page.evaluate(() => {
        const thread = document.querySelector('.dm-thread');
        const box = (selector) => { const el = [...document.querySelectorAll(selector)].at(-1); const rect = el?.getBoundingClientRect(); return rect ? Math.round(rect.width) : null; };
        return {
          days: [...document.querySelectorAll('.dm-day-label')].map((el) => el.textContent), bottom: Math.round(thread.scrollHeight - thread.scrollTop - thread.clientHeight),
          overflowX: document.documentElement.scrollWidth - innerWidth, pageScroll: document.documentElement.scrollHeight - innerHeight,
          visit: box('.dm-visit'), file: document.querySelector('.dm-file-name')?.textContent ?? null, fileLine: document.querySelector('.dm-file-line')?.textContent ?? null,
          scrolls: thread.scrollHeight > thread.clientHeight,
        };
      });
      expectSame(M, 'fil', shape, {
        // Séparateurs de l'app : le jour en toutes lettres et l'heure du premier message du jour.
        days: ['Dimanche 1 novembre · 09:00', 'Lundi 2 novembre · 00:00', 'Mardi 3 novembre · 00:00', 'Mercredi 4 novembre · 00:00', 'Hier · 20:10'],
        bottom: 0, overflowX: 0, pageScroll: 0,
        visit: label === '390' ? shape.visit : 340, file: 'Diagnostics_appartement.pdf', fileLine: 'PDF · 1,2 Mo', scrolls: true,
      });
      if (label === '390' && !(shape.visit > 260 && shape.visit <= 340)) problems.push(`${M} : carte de visite de ${shape.visit} px sur téléphone`);
      expectSame(M, 'boutons et champs sans nom', await unnamedControls(page), []);
      await chatShot(page, `3-messages-longue-${label}.png`);
      await page.close();
      await longContext.close();
    }
  }

  // Messages vocaux et GIF envoyés depuis l'app (MessageAttachment .audio et .gif), dans la conversation archivée avec
  // Marc P. : le site les lit (lecture au premier appui par une URL signée, barres et durée ; GIF de KLIPY sans son, en
  // boucle, image fixe et lecture à l'appui avec « Réduire les animations »), il n'en envoie pas. Une sorte inconnue
  // affiche la ligne neutre de l'app. Captures : 3-messages-vocal-gif-1440.png et 3-messages-gif-reduit-1440.png.
  {
    const V = 'messages vocal et GIF';
    const VOICE_PATH = `${chatId(3)}/6F1C2E3F-4B5D-4E6F-8A9B-0C1D2E3F4A61.m4a`;
    const KLIPY = 'https://static.klipy.com/ii/935d7ab9d8c6202580a668421940ec81/14/af/';
    const voiceFile = await readFile(join(root, 'scripts/fixtures/vocal.m4a'));
    const gifFiles = { 'V6da8Awi.mp4': ['video/mp4', await readFile(join(root, 'scripts/fixtures/gif.mp4'))], 'uvntdY4w.jpg': ['image/jpeg', await readFile(join(root, 'scripts/fixtures/gif-fixe.jpg'))] };
    const row = (n, sender, createdAt, item, preview) => ({
      id: messageId(n), conversation_id: chatId(3), sender_id: sender, kind: 'attachments', client_id: messageId(n), content: { attachments: { _0: [item] } },
      created_at: createdAt, expires_at: null, message_reactions: [], preview,
    });
    const WAVEFORM = Array.from({ length: 48 }, (_, index) => Math.round(50 + 45 * Math.sin(index / 2.3)));
    for (const reduced of [false, true]) {
      const { context: voiceDesk, chat } = await chatContext({ width: 1440, height: 960, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      chat.messages.push(
        row(26, USER_ID, '2026-11-02T09:59:00Z', {
          id: '6F1C2E3F-4B5D-4E6F-8A9B-0C1D2E3F4A62', kind: 'gif', fileName: 'Bonjour', byteCount: 0, remoteURL: `${KLIPY}V6da8Awi.mp4`,
          previewURL: `${KLIPY}uvntdY4w.jpg`, width: 480, height: 270, provider: 'klipy', providerId: 'bonjour-662',
        }, '🎞️ GIF'),
        row(27, MARC_ID, '2026-11-02T09:59:30Z', { id: '6F1C2E3F-4B5D-4E6F-8A9B-0C1D2E3F4A63', kind: 'sticker', fileName: 'Autocollant', byteCount: 0 }, '✨ Autocollant'),
        row(28, MARC_ID, '2026-11-02T10:05:00Z', {
          id: '6F1C2E3F-4B5D-4E6F-8A9B-0C1D2E3F4A61', kind: 'audio', fileName: 'Message vocal', storagePath: VOICE_PATH, byteCount: voiceFile.length,
          durationSeconds: 3.2, waveform: WAVEFORM,
        }, '🎤 Message vocal (0:03)'),
      );
      // Avec « Réduire les animations », le fichier du vocal est illisible : la bulle doit le dire.
      chat.files.set(VOICE_PATH, { type: 'audio/mp4', body: reduced ? Buffer.from('pas un fichier son') : voiceFile });
      const klipy = [];
      await voiceDesk.route(/^https:\/\/static\.klipy\.com\//, (route) => {
        const url = route.request().url();
        klipy.push(url);
        const file = gifFiles[url.split('/').pop()];
        return file ? route.fulfill({ status: 200, contentType: file[0], headers: { 'access-control-allow-origin': '*' }, body: file[1] }) : route.fulfill({ status: 404, body: '' });
      });
      const voicePage = await open(voiceDesk, '/messages/', `${V}${reduced ? ' (animations réduites)' : ''}`);
      const voiceReads = [];
      voicePage.on('request', (request) => { if (request.method() === 'GET' && request.url().includes(`/object/sign/message-attachments/${VOICE_PATH}`)) voiceReads.push(request.url()); });
      await voicePage.waitForSelector('.dm-list .dm-row');
      await voicePage.click('.dm-tab[aria-label="Archivés, 1"]');
      await waitForRows(voicePage, ['Marc P.'], `${V} : archivées`);
      expectSame(V, 'aperçu du vocal dans la liste', (await inboxRows(voicePage))[0]?.preview, '🎤 Message vocal (0:03)');
      await voicePage.click(rowLink(3));
      await voicePage.waitForURL(`${base}/messages/?c=${chatId(3)}`);
      await voicePage.waitForSelector('.dm-voice');
      const voiceShape = await voicePage.evaluate(() => {
        const bubble = document.querySelector('.dm-voice');
        const gif = document.querySelector('.dm-gif');
        const box = gif?.getBoundingClientRect();
        return {
          received: !bubble.classList.contains('is-out') && !bubble.closest('.dm-msg')?.classList.contains('is-out'), bars: bubble.querySelectorAll('.dm-voice-bars > span').length,
          time: bubble.querySelector('.dm-voice-time')?.textContent, button: bubble.querySelector('.dm-voice-play')?.getAttribute('aria-label'),
          label: bubble.getAttribute('aria-label'), width: Math.round(bubble.getBoundingClientRect().width),
          gifMine: Boolean(gif?.closest('.dm-msg.is-out')), gifSize: box ? [Math.round(box.width), Math.round(box.height)] : null,
          gifStatus: gif?.querySelectorAll('.dm-status.is-on-image').length ?? 0, gifOuterStatus: gif?.closest('.dm-msg')?.querySelectorAll(':scope > .dm-msg-status').length ?? null,
          unsupported: [...document.querySelectorAll('.dm-caption.is-unsupported')].map((el) => el.textContent),
        };
      });
      // Bulle vocale de l'app (VoiceBubble) : 236 de large.
      expectSame(V, 'bulle vocale et GIF', voiceShape, {
        received: true, bars: 28, time: '0:03', button: 'Écouter le message vocal', label: 'Message vocal, 0:03', width: 236,
        gifMine: true, gifSize: [240, 135], gifStatus: 1, gifOuterStatus: 0, unsupported: ['Ce contenu n\'est pas pris en charge par cette version de Nidalo.'],
      });
      if (!reduced) {
        // GIF : vidéo de KLIPY, sans son, en boucle, qui joue seule.
        await voicePage.waitForFunction(() => { const video = document.querySelector('.dm-gif video'); return video && video.currentTime > 0.2; }, null, { timeout: 8000 })
          .catch(async () => problems.push(`${V} : le GIF ne joue pas (${await voicePage.$eval('.dm-gif', (el) => el.outerHTML.slice(0, 400))})`));
        expectSame(V, 'vidéo du GIF', await voicePage.evaluate(() => {
          const video = document.querySelector('.dm-gif video');
          return video ? [video.getAttribute('src'), video.muted, video.loop, video.closest('.dm-gif').querySelectorAll('img').length] : null;
        }), [`${KLIPY}V6da8Awi.mp4`, true, true, 0]);
        // Vocal : le lien signé est prêt dès l'affichage (comme les documents), mais le fichier ne se charge qu'à
        // l'appui ; lecture, barres écoutées, puis pause.
        await voicePage.waitForTimeout(800);
        if (voiceReads.length) problems.push(`${V} : fichier du vocal chargé avant l'appui`);
        await voicePage.click('.dm-voice-play');
        await voicePage.waitForSelector('.dm-voice-play[aria-label="Mettre en pause"]', { timeout: 8000 }).catch(() => problems.push(`${V} : le vocal ne joue pas`));
        expectSame(V, 'URL signée du vocal, demandée une fois', chat.signs.filter((sign) => sign.path === VOICE_PATH).map((sign) => sign.body), [{ expiresIn: 600 }]);
        if (!voiceReads.length) problems.push(`${V} : fichier du vocal non lu à l'appui`);
        await voicePage.waitForFunction(() => document.querySelectorAll('.dm-voice-bars > span.is-played').length >= 8, null, { timeout: 8000 })
          .catch(() => problems.push(`${V} : barres écoutées absentes`));
        await voicePage.click('.dm-voice-play');
        await voicePage.waitForSelector('.dm-voice-play[aria-label="Écouter le message vocal"]', { timeout: 8000 }).catch(() => problems.push(`${V} : pause sans effet`));
        const paused = await voicePage.$eval('.dm-voice', (bubble) => [bubble.querySelectorAll('.dm-voice-bars > span.is-played').length, bubble.querySelector('.dm-voice-time').textContent]);
        if (!(paused[0] >= 8 && paused[0] < 28) || !/^0:0[1-3]$/.test(paused[1])) problems.push(`${V} : vocal en pause ${JSON.stringify(paused)}`);
        await chatShot(voicePage, '3-messages-vocal-gif-1440.png');
        // Jusqu'au bout : la bulle revient au début, avec la durée totale.
        await voicePage.click('.dm-voice-play');
        await voicePage.waitForFunction(() => document.querySelector('.dm-voice-play')?.getAttribute('aria-label') === 'Écouter le message vocal'
          && document.querySelectorAll('.dm-voice-bars > span.is-played').length === 0, null, { timeout: 10000 }).catch(() => problems.push(`${V} : fin du vocal`));
        expectSame(V, 'vocal fini', await textOf(voicePage, '.dm-voice-time'), '0:03');
      } else {
        // « Réduire les animations » : image fixe et bouton lecture ; le GIF joue à l'appui.
        await imagesLoaded(voicePage, '.dm-gif img', 1, `${V} : image fixe`);
        expectSame(V, 'GIF fixe', [await voicePage.getAttribute('.dm-gif img', 'src'), await voicePage.locator('.dm-gif video').count(), await voicePage.getAttribute('.dm-gif-play', 'aria-label')],
          [`${KLIPY}uvntdY4w.jpg`, 0, 'Lire le GIF']);
        await chatShot(voicePage, '3-messages-gif-reduit-1440.png');
        await voicePage.click('.dm-gif-play');
        await voicePage.waitForSelector('.dm-gif video', { timeout: 8000 }).catch(() => problems.push(`${V} : le GIF ne joue pas à l'appui`));
        expectSame(V, 'GIF lancé', await voicePage.getAttribute('.dm-gif-play', 'aria-label'), 'Arrêter le GIF');
        // Fichier du vocal illisible : le message d'erreur de l'app, et un nouvel essai possible.
        await voicePage.click('.dm-voice-play');
        await voicePage.waitForSelector('.dm-voice-error', { timeout: 8000 }).catch(() => problems.push(`${V} : erreur de lecture non affichée`));
        expectSame(V, 'erreur de lecture', [await textOf(voicePage, '.dm-voice-error'), await voicePage.isDisabled('.dm-voice-play')], ['Lecture impossible. Réessayez.', false]);
      }
      const outside = klipy.filter((url) => !url.startsWith(KLIPY));
      if (outside.length) problems.push(`${V} : adresses inattendues ${outside.join(', ')}`);
      await voicePage.close();
      await voiceDesk.close();
    }
  }

  // Premier message sans prénom : « Votre prénom » (comme l'app), enregistré comme updateUser, puis le message part.
  // Aussi « Faire une offre » proposé à l'acheteur, et les sources du « + » qui restent dans l'app iPhone (le dossier ;
  // les contacts sans sélecteur de contacts).
  {
    const M = 'messages prénom';
    const { context: nameDesk, chat } = await chatContext({ account: { profile_details: [{ ...ACCOUNT.profile_details[0], first_name: null }] } });
    page = await open(nameDesk, `/messages/?c=${chatId(5)}`, 'messages-prenom');
    await page.waitForSelector('.dm-thread-empty');
    if (chatCalls(chat, 'rpc/mark_conversation_read').length) problems.push(`${M} : conversation sans non-lus marquée lue`);
    expectSame(M, 'réponses rapides', await quickReplies(page), ['Envoyer le dossier complet']);
    await page.click('.dm-plus');
    expectSame(M, '« + » de l\'acheteur', await page.$$eval('dialog[open] .dm-wide-title', (els) => els.map((el) => el.textContent)), ['Documents immobiliers', 'Faire une offre']);
    // Le dossier reste dans l'app iPhone, comme les contacts sans sélecteur de contacts dans ce navigateur.
    await page.click('dialog[open] .dm-sources button[aria-label="Depuis mon dossier"]');
    await iphoneOnly(page, M, 'Mon dossier');
    await page.click('.dm-plus');
    await page.click('dialog[open] .dm-sources button[aria-label="Contacts"]');
    await iphoneOnly(page, M, 'Contacts');
    const writesMark = writes.length;
    let mark = chat.calls.length;
    await page.fill('.dm-composer textarea', 'Bonjour, la maison est-elle toujours disponible ?');
    await page.keyboard.press('Enter');
    expectSame(M, 'fenêtre du prénom', [await dialogTitle(page), await textOf(page, 'dialog.alert-dialog[open] .alert-body p')], ['Votre prénom', 'Affiché à votre interlocuteur : Prénom M..']);
    if (chatCalls(chat, 'messages', mark).some((call) => call.method === 'POST')) problems.push(`${M} : message envoyé avant le prénom`);
    await page.fill('dialog.alert-dialog[open] input[aria-label="Prénom"]', 'Claire');
    expectSame(M, 'nom affiché', await textOf(page, 'dialog.alert-dialog[open] .alert-body p'), 'Affiché à votre interlocuteur : Claire M..');
    await alertButton(page, 'Envoyer');
    const first = await oneCall(chat, 'messages', mark, `${M} : premier message`, (call) => call.method === 'POST');
    expectSame(M, 'prénom enregistré', writes.slice(writesMark).map((write) => [write.method, write.table, write.search, write.body]), [
      ['PATCH', 'profiles', `?id=eq.${USER_ID}`, { display_name: 'Claire Martin', avatar_path: null, account_type: 'individual', shows_full_name: false }],
      ['PATCH', 'profile_details', `?user_id=eq.${USER_ID}`, {
        first_name: 'Claire', last_name: 'Martin', birth_date: null, phone: '0639981234', street: null, postal_code: '69003', city: 'Lyon', insee_code: '69383',
        country_code: 'FR', professional_situation: 'employee',
      }],
    ]);
    if (first) {
      if (first.writesBefore < writesMark + 2) problems.push(`${M} : le message part avant l'enregistrement du prénom`);
      expectSame(M, 'premier message', [first.body?.content, first.body?.preview], [chatText('Bonjour, la maison est-elle toujours disponible ?'), 'Bonjour, la maison est-elle toujours disponible ?']);
    }
    await page.waitForSelector('.dm-bubble.is-out');
    // Une conversation qui a déjà des messages : pas de prénom demandé.
    await backToList(page, M);
    await page.click(rowLink(1));
    await page.waitForSelector('.dm-thread-inner .dm-day');
    mark = chat.calls.length;
    await page.fill('.dm-composer textarea', 'Bonjour');
    await page.keyboard.press('Enter');
    await oneCall(chat, 'messages', mark, `${M} : conversation avec messages`, (call) => call.method === 'POST');
    if (await page.locator('dialog.alert-dialog[open]').count()) problems.push(`${M} : prénom demandé dans une conversation qui a des messages`);
    await page.close();
    await nameDesk.close();
  }

  // Réponses, transferts et réactions, comme l'app (demande du 17/11) : dans A, l'agence a transféré un message
  // (« Transféré »), le compte a répondu à son dernier message (la citation, recouverte de 10 px par la bulle) et
  // l'agence y a mis un cœur ; un ancien « ♥ » compte comme ❤️ ; dans le groupe, Camille répond à un message supprimé
  // depuis. Le double clic (le double toucher de l'app) pose ou retire ❤️ ; le clic droit, le bouton « … » ou l'appui
  // long ouvrent la barre d'emojis et le menu (Répondre, Transférer, Copier). Colonnes de l'app : reply_to_id (réponse)
  // et forwarded (transfert), refusées par le trigger du serveur quand il le faut. Captures : 3-messages-reponses-*.png.
  const chatLine = (n, conversationId, senderId, createdAt, text, fields = {}) => ({
    id: messageId(n), conversation_id: conversationId, sender_id: senderId, kind: 'text', client_id: messageId(n), content: chatText(text),
    created_at: createdAt, expires_at: null, message_reactions: [], preview: text, ...fields,
  });
  const FORWARDED_TEXT = 'Les charges de copropriété sont de 180 € par mois, eau froide comprise.';
  const replyChat = (chat) => {
    chat.messages.find((item) => item.id === messageId(3)).message_reactions = [{ user_id: AGENT_ID, emoji: '♥', created_at: '2026-11-05T17:30:00Z' }];
    chat.messages.push(
      chatLine(9, chatId(1), AGENT_ID, '2026-11-06T09:47:00Z', FORWARDED_TEXT, { forwarded: true }),
      chatLine(10, chatId(1), USER_ID, '2026-11-06T09:48:00Z', 'Merci beaucoup, j\'attends son retour.', {
        reply_to_id: messageId(7), message_reactions: [{ user_id: AGENT_ID, emoji: '❤️', created_at: '2026-11-06T09:49:00Z' }],
      }),
      chatLine(35, chatId(4), CAMILLE_ID, '2026-11-06T08:20:00Z', 'Oui, je confirme pour samedi.', { reply_to_id: messageId(30) }),
    );
  };
  const REPLY_SHOWN = { forwarded: null, header: 'Vous avez répondu à Agence', quote: 'Bien reçu, je transmets votre offre au propriétaire.', deleted: false, pill: 'Réactions : ❤️, 1' };
  /** Ligne d'un message du fil. */
  const msgRow = (page, n) => page.locator(`.dm-msg[data-message-id="${messageId(n)}"]`);
  /** Autour d'une bulle : « Transféré », en-tête et citation d'une réponse, pastille des réactions. */
  const messageAround = (page, n) => page.evaluate((id) => {
    const row = document.querySelector(`.dm-msg[data-message-id="${id}"]`);
    const text = (selector) => row?.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() ?? null;
    return row ? {
      forwarded: text('.dm-forwarded'), header: text('.dm-reply-head'), quote: text('.dm-quote'), deleted: Boolean(row.querySelector('.dm-quote.is-deleted')),
      pill: row.querySelector('.dm-reaction-pill')?.getAttribute('aria-label') ?? null,
    } : null;
  }, messageId(n));
  /** Barre d'emojis et menu d'un message (clic droit, ou « … » au survol) : emojis, emoji enfoncé, actions. */
  const messageMenu = async (page, n, how = 'clic droit') => {
    const body = msgRow(page, n).locator('.dm-interactive-body');
    if (how === 'clic droit') await body.click({ button: 'right' });
    else {
      await body.hover();
      await msgRow(page, n).locator('.dm-more-button').click();
    }
    await page.waitForSelector('dialog.dm-focus[open] .dm-focus-menu', { timeout: 8000 }).catch(() => problems.push(`menu du message ${n} (${how}) non ouvert`));
    return page.evaluate(() => ({
      emojis: [...document.querySelectorAll('dialog.dm-focus[open] .dm-focus-emoji')].map((el) => el.textContent),
      pressed: [...document.querySelectorAll('dialog.dm-focus[open] .dm-focus-emoji[aria-pressed="true"]')].map((el) => el.getAttribute('aria-label')),
      items: [...document.querySelectorAll('dialog.dm-focus[open] [role="menuitem"]')].map((el) => el.textContent.trim()),
    }));
  };
  const menuClosed = (page, name) => page.waitForSelector('dialog.dm-focus[open]', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${name} : le menu du message reste ouvert`));
  const menuChoice = async (page, label, name) => {
    await page.locator('dialog.dm-focus[open] .dm-focus-menu').getByRole('menuitem', { name: label, exact: true }).click();
    await menuClosed(page, name);
  };
  const menuEmoji = async (page, selector, name) => {
    await page.click(`dialog.dm-focus[open] .dm-focus-emoji${selector}`);
    await menuClosed(page, name);
  };
  /** Pastille d'un message, attendue (`null` : aucune). */
  const waitForPill = (page, n, want, name) => page.waitForFunction(([id, wanted]) => {
    const pill = document.querySelector(`.dm-msg[data-message-id="${id}"] .dm-reaction-pill`);
    return (pill?.getAttribute('aria-label') ?? null) === wanted;
  }, [messageId(n), want], { timeout: 8000 }).catch(async () => problems.push(`${name} : pastille ${JSON.stringify((await messageAround(page, n))?.pill)} au lieu de ${JSON.stringify(want)}`));
  /** Feuille « Réactions » : chaque personne, son emoji et « Retirer » pour la mienne ; ou son état vide. */
  const reactionRows = (page) => page.evaluate(() => {
    const sheet = document.querySelector('dialog.dm-reactions-sheet[open]');
    if (!sheet) return null;
    const rows = [...sheet.querySelectorAll('.dm-reaction-row')].map((el) => [el.querySelector('.dm-reaction-name')?.textContent ?? null,
      el.querySelector('.dm-reaction-emoji')?.textContent ?? null, el.querySelector('button')?.textContent.trim() ?? null]);
    return rows.length ? rows : sheet.querySelector('.dm-forward-empty')?.textContent ?? null;
  });
  /** Feuille « Transférer » : le message, les titres, les conversations (nom, sous-titre, cochée, grisée), l'envoi. */
  const forwardSheet = (page) => page.evaluate(() => {
    const sheet = document.querySelector('dialog.dm-forward-sheet[open]');
    const send = sheet?.querySelector('.dm-forward-send');
    return sheet ? {
      preview: sheet.querySelector('.dm-forward-bubble')?.textContent.replace(/\s+/g, ' ') ?? null, labels: [...sheet.querySelectorAll('.dm-forward-label')].map((el) => el.textContent),
      targets: [...sheet.querySelectorAll('.dm-forward-target')].map((el) => [el.querySelector('.dm-forward-name')?.textContent ?? null,
        el.querySelector('.dm-forward-sub')?.textContent ?? null, el.getAttribute('aria-pressed'), el.disabled]),
      empty: sheet.querySelector('.dm-forward-empty')?.textContent ?? null, send: [send?.textContent.trim() ?? null, send?.disabled ?? null],
      max: sheet.querySelector('.dm-forward-max')?.textContent ?? null,
    } : null;
  });
  const FORWARD_TARGETS = [
    ['Visite groupée Lyon 2e', 'Groupe · 3 membres', 'false', false], ['Julien M.', 'Appartement 2 pièces · Lyon 6e', 'false', false],
    ['Lucas G.', 'Maison familiale 5 pièces · Écully', 'false', false], ['Marc P.', 'Maison 4 pièces avec jardin · Caluire-et-Cuire', 'false', false],
    ['Compte supprimé', 'Studio rénové · Lyon 8e', 'false', false],
  ];
  /** Un envoi de messages, sans ses identifiants (vérifiés à part : en majuscules, client_id = id). */
  const sentWithoutIds = (call) => {
    const { id, client_id: clientId, ...rest } = call.body ?? {};
    return { ...rest, ids: UPPER_UUID.test(id ?? '') && clientId === id };
  };
  {
    const M = 'messages réponses 1440';
    const { context: replyDesk, chat } = await chatContext({ width: 1440, height: 960 });
    replyChat(chat);
    page = await open(replyDesk, `/messages/?c=${chatId(1)}`, 'messages-reponses-1440');
    await page.waitForSelector('.dm-thread-inner .dm-day');
    await msgRow(page, 10).locator('.dm-quote').waitFor({ timeout: 8000 }).catch(() => problems.push(`${M} : citation absente`));
    expectSame(M, 'message transféré', await messageAround(page, 9), { forwarded: 'Transféré', header: null, quote: null, deleted: false, pill: null });
    expectSame(M, 'réponse avec un cœur', await messageAround(page, 10), REPLY_SHOWN);
    expectSame(M, 'ancien « ♥ »', (await messageAround(page, 3))?.pill, 'Réactions : ❤️, 1');
    // Citation grise de 250 px au plus, recouverte de 10 px par la bulle ; pastille de 24 px, 10 px dans la bulle.
    expectSame(M, 'citation et pastille', await page.evaluate((id) => {
      const row = document.querySelector(`.dm-msg[data-message-id="${id}"]`);
      const quote = row.querySelector('.dm-quote').getBoundingClientRect();
      const bubble = row.querySelector('.dm-bubble').getBoundingClientRect();
      const pill = row.querySelector('.dm-reaction-pill').getBoundingClientRect();
      return {
        quoteColor: getComputedStyle(row.querySelector('.dm-quote')).backgroundColor, quoteWidth: Math.round(quote.width), overlap: Math.round(quote.bottom - bubble.top),
        pill: [Math.round(pill.left - bubble.left), Math.round(pill.top - bubble.bottom), Math.round(pill.height)],
      };
    }, messageId(10)), { quoteColor: 'rgb(237, 239, 243)', quoteWidth: 250, overlap: 10, pill: [10, -10, 24] });
    // L'original cité est dans les messages lus : il n'est pas relu.
    if (chatCalls(chat, 'messages').some((call) => call.search.includes('&id=eq.'))) problems.push(`${M} : original relu alors qu'il est affiché`);
    expectSame(M, 'boutons et champs sans nom', await unnamedControls(page), []);
    await chatShot(page, '3-messages-reponses-1440.png');
    // La citation mène à l'original, qui s'éclaire un instant (scrollRequest de l'app).
    await msgRow(page, 10).locator('.dm-quote').click();
    await page.waitForFunction((id) => document.querySelector(`.dm-msg[data-message-id="${id}"] .dm-interactive.is-flashing`), messageId(7), { timeout: 4000 })
      .catch(() => problems.push(`${M} : l'original cité ne s'éclaire pas`));
    await page.waitForFunction((id) => !document.querySelector(`.dm-msg[data-message-id="${id}"] .dm-interactive.is-flashing`), messageId(7), { timeout: 4000 })
      .catch(() => problems.push(`${M} : l'original cité reste éclairé`));

    // Clic droit : la barre d'emojis et le menu ; Échap referme ; « … » au survol ouvre le même.
    expectSame(M, 'menu du clic droit', await messageMenu(page, 4), { emojis: ['❤️', '👍', '😂', '😮', '😢', '🙏'], pressed: [], items: ['Répondre', 'Transférer', 'Copier', 'Signaler'] });
    await chatShot(page, '3-messages-menu-1440.png');
    await page.keyboard.press('Escape');
    await menuClosed(page, `${M} : Échap`);
    expectSame(M, 'menu du bouton « … »', (await messageMenu(page, 4, '« … »')).items, ['Répondre', 'Transférer', 'Copier', 'Signaler']);
    // 👍 posé (message_reactions, comme setReaction), puis retiré depuis la barre, où il est enfoncé.
    let mark = chat.calls.length;
    await menuEmoji(page, '[aria-label="👍"]', `${M} : 👍`);
    const thumbs = await oneCall(chat, 'message_reactions', mark, `${M} : 👍`);
    if (thumbs) {
      expectSame(M, '👍 posé', [thumbs.method, thumbs.search, thumbs.body], ['POST', '?on_conflict=message_id,user_id', { message_id: messageId(4).toUpperCase(), emoji: '👍' }]);
      if (!thumbs.prefer.includes('resolution=merge-duplicates')) problems.push(`${M} : 👍 sans fusion (Prefer « ${thumbs.prefer} »)`);
    }
    await waitForPill(page, 4, 'Réactions : 👍, 1', `${M} : 👍`);
    expectSame(M, 'barre avec 👍', (await messageMenu(page, 4)).pressed, ['👍, votre réaction : la retirer']);
    mark = chat.calls.length;
    await menuEmoji(page, '[aria-pressed="true"]', `${M} : 👍 retiré`);
    const unthumbs = await oneCall(chat, 'message_reactions', mark, `${M} : 👍 retiré`);
    if (unthumbs) expectSame(M, '👍 retiré', [unthumbs.method, unthumbs.search], ['DELETE', `?message_id=eq.${messageId(4).toUpperCase()}&user_id=eq.${USER_ID.toUpperCase()}`]);
    await waitForPill(page, 4, null, `${M} : 👍 retiré`);

    // « Réactions » (la pastille) : chaque personne et son emoji, la mienne en premier avec « Retirer » ; vide ensuite.
    await msgRow(page, 10).locator('.dm-reaction-pill').click();
    expectSame(M, 'feuille des réactions', [await dialogTitle(page, 'sheet'), await reactionRows(page)], ['Réactions', [['Agence Démo Lyon', '❤️', null]]]);
    await page.click('dialog.dm-sheet[open] .dm-sheet-close');
    await messageMenu(page, 10);
    await menuEmoji(page, '[aria-label="😂"]', `${M} : 😂`);
    await waitForPill(page, 10, 'Réactions : 😂 ❤️, 2', `${M} : 😂`);
    expectSame(M, 'nombre de réactions', await msgRow(page, 10).locator('.dm-reaction-count').textContent().catch(() => null), '2');
    await msgRow(page, 10).locator('.dm-reaction-pill').click();
    expectSame(M, 'réactions avec la mienne', await reactionRows(page), [['Vous', '😂', 'Retirer'], ['Agence Démo Lyon', '❤️', null]]);
    mark = chat.calls.length;
    await page.click('dialog.dm-reactions-sheet[open] button[aria-label="Retirer ma réaction"]');
    const removed = await oneCall(chat, 'message_reactions', mark, `${M} : « Retirer »`);
    if (removed) expectSame(M, '« Retirer »', [removed.method, removed.search], ['DELETE', `?message_id=eq.${messageId(10).toUpperCase()}&user_id=eq.${USER_ID.toUpperCase()}`]);
    await page.waitForFunction(() => document.querySelectorAll('dialog.dm-reactions-sheet[open] .dm-reaction-row').length === 1, null, { timeout: 8000 })
      .catch(() => problems.push(`${M} : ma réaction reste dans la feuille`));
    await page.click('dialog.dm-sheet[open] .dm-sheet-close');
    await msgRow(page, 4).locator('.dm-bubble').dblclick();
    await waitForPill(page, 4, 'Réactions : ❤️, 1', `${M} : cœur sur 4`);
    await msgRow(page, 4).locator('.dm-reaction-pill').click();
    expectSame(M, 'ma seule réaction', await reactionRows(page), [['Vous', '❤️', 'Retirer']]);
    await page.click('dialog.dm-reactions-sheet[open] button[aria-label="Retirer ma réaction"]');
    await page.waitForFunction(() => document.querySelector('dialog.dm-reactions-sheet[open] .dm-forward-empty')?.textContent === 'Aucune réaction', null, { timeout: 8000 })
      .catch(async () => problems.push(`${M} : « Aucune réaction » absent (${JSON.stringify(await reactionRows(page))})`));
    await page.click('dialog.dm-sheet[open] .dm-sheet-close');

    // « Copier » : le texte du message dans le presse-papiers (un texte seulement).
    await page.evaluate(() => {
      window.nidaloCopied = null;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.nidaloCopied = text; } } });
    });
    await messageMenu(page, 4);
    await menuChoice(page, 'Copier', `${M} : copier`);
    expectSame(M, 'texte copié', await page.evaluate(() => window.nidaloCopied), 'Parfait, je vous confirme la visite pour jeudi à 18h.');

    // « Répondre » : « Réponse à … » au-dessus du champ, qui prend le curseur ; l'envoi part avec reply_to_id
    // (MessageInsert de l'app), puis la réponse cite son original.
    await messageMenu(page, 4);
    await menuChoice(page, 'Répondre', `${M} : répondre`);
    await page.waitForSelector('.dm-reply-bar', { timeout: 8000 }).catch(() => problems.push(`${M} : barre de réponse absente`));
    expectSame(M, 'barre de réponse', [await textOf(page, '.dm-reply-bar-title'), await textOf(page, '.dm-reply-bar-preview'),
      await page.evaluate(() => document.activeElement?.matches('.dm-composer textarea') ?? false)], ['Réponse à Agence Démo Lyon', 'Parfait, je vous confirme la visite pour jeudi à 18h.', true]);
    await chatShot(page, '3-messages-reponse-en-cours-1440.png');
    mark = chat.calls.length;
    await page.fill('.dm-composer textarea', 'Très bien, à jeudi.');
    await page.keyboard.press('Enter');
    const replied = await oneCall(chat, 'messages', mark, `${M} : réponse`, (call) => call.method === 'POST');
    if (replied) {
      expectSame(M, 'réponse envoyée', [replied.search, sentWithoutIds(replied)], ['?select=id,conversation_id,sender_id,kind,client_id,content,created_at,expires_at,reply_to_id,forwarded,message_reactions(user_id,emoji,created_at)',
        { conversation_id: A, content: chatText('Très bien, à jeudi.'), preview: 'Très bien, à jeudi.', reply_to_id: messageId(4).toUpperCase(), ids: true }]);
    }
    await page.waitForFunction(() => [...document.querySelectorAll('.dm-bubble.is-out .dm-text')].at(-1)?.textContent === 'Très bien, à jeudi.', null, { timeout: 8000 })
      .catch(() => problems.push(`${M} : la réponse n'apparaît pas`));
    expectSame(M, 'réponse affichée', [await page.evaluate(() => {
      const row = [...document.querySelectorAll('.dm-msg.is-out')].at(-1);
      return [row?.querySelector('.dm-reply-head')?.textContent.trim() ?? null, row?.querySelector('.dm-quote')?.textContent.trim() ?? null];
    }), await page.locator('.dm-reply-bar').count(), await page.inputValue('.dm-composer textarea')],
    [['Vous avez répondu à Agence', 'Parfait, je vous confirme la visite pour jeudi à 18h.'], 0, '']);
    // ✕ annule une réponse commencée.
    await messageMenu(page, 9);
    await menuChoice(page, 'Répondre', `${M} : répondre au transfert`);
    expectSame(M, 'réponse au message transféré', await textOf(page, '.dm-reply-bar-preview'), FORWARDED_TEXT);
    await page.click('.dm-reply-bar-cancel');
    await page.waitForSelector('.dm-reply-bar', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${M} : « Annuler la réponse » sans effet`));

    // « Transférer » : les conversations récentes, sans celle d'origine ; recherche ; le message part dans chacune avec
    // forwarded = true (sans reply_to_id), puis « Message transféré ».
    await messageMenu(page, 9);
    await menuChoice(page, 'Transférer', `${M} : transférer`);
    expectSame(M, 'transfert', [await dialogTitle(page, 'sheet'), await forwardSheet(page)], ['Transférer', {
      preview: FORWARDED_TEXT, labels: ['Message', 'Récentes'], targets: FORWARD_TARGETS, empty: null, send: ['Envoyer à 1 conversation', true], max: '5 conversations au plus',
    }]);
    await page.fill('dialog.dm-forward-sheet[open] input[aria-label="Rechercher une conversation"]', 'bonjour');
    expectSame(M, 'transfert : aucune conversation', [(await forwardSheet(page))?.targets, (await forwardSheet(page))?.empty], [[], 'Aucune conversation']);
    await page.fill('dialog.dm-forward-sheet[open] input[aria-label="Rechercher une conversation"]', 'julien');
    expectSame(M, 'transfert : recherche', (await forwardSheet(page))?.targets.map((target) => target[0]), ['Julien M.']);
    await page.fill('dialog.dm-forward-sheet[open] input[aria-label="Rechercher une conversation"]', '');
    await page.click('dialog.dm-forward-sheet[open] .dm-forward-target:has-text("Visite groupée Lyon 2e")');
    await page.click('dialog.dm-forward-sheet[open] .dm-forward-target:has-text("Julien M.")');
    const chosen = await forwardSheet(page);
    expectSame(M, 'deux conversations cochées', [chosen?.targets.map((target) => target[2]), chosen?.send], [['true', 'true', 'false', 'false', 'false'], ['Envoyer à 2 conversations', false]]);
    await chatShot(page, '3-messages-transfert-1440.png');
    mark = chat.calls.length;
    await page.click('dialog.dm-forward-sheet[open] .dm-forward-send');
    await waitForCompareNotice(page, { text: 'Message transféré', action: null }, `${M} : transfert`);
    await page.waitForSelector('dialog.dm-forward-sheet[open]', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${M} : « Transférer » reste ouvert`));
    expectSame(M, 'messages transférés', chatCalls(chat, 'messages', mark).filter((call) => call.method === 'POST').map(sentWithoutIds),
      [chatId(4), chatId(2)].map((id) => ({ conversation_id: id.toUpperCase(), content: chatText(FORWARDED_TEXT), preview: FORWARDED_TEXT, forwarded: true, ids: true })));
    expectSame(M, 'liste après le transfert', (await inboxRows(page)).slice(0, 2).map((row) => [row.name, row.preview]),
      [['Julien M.', `Vous : ${FORWARDED_TEXT}`], ['Visite groupée Lyon 2e', `Vous : ${FORWARDED_TEXT}`]]);
    // Des photos : recopiées dans le dossier de la conversation d'arrivée (même nom, en JPEG, comme l'app), puis le
    // message qui les cite, transféré.
    await messageMenu(page, 2).then((menu) => expectSame(M, 'menu des photos', menu.items, ['Répondre', 'Transférer', 'Signaler']));
    await menuChoice(page, 'Transférer', `${M} : transférer les photos`);
    await page.click('dialog.dm-forward-sheet[open] .dm-forward-target:has-text("Lucas G.")');
    mark = chat.calls.length;
    const uploads = chat.uploads.length;
    await page.click('dialog.dm-forward-sheet[open] .dm-forward-send');
    await waitForCompareNotice(page, { text: 'Message transféré', action: null }, `${M} : photos transférées`);
    const photosForwarded = await oneCall(chat, 'messages', mark, `${M} : photos transférées`, (call) => call.method === 'POST');
    const copies = chat.uploads.slice(uploads);
    expectSame(M, 'photos recopiées', copies.map((upload) => {
      const file = upload.parts.find((part) => part.filename !== null);
      return [upload.path, upload.headers['x-upsert'], file?.type ?? null, file?.body.subarray(0, 3).toString('hex') ?? null];
    }), AGENT_PHOTOS.map((path) => [`${chatId(5)}/${path.split('/')[1]}`, 'false', 'image/jpeg', 'ffd8ff']));
    if (photosForwarded) {
      expectSame(M, 'message des photos transférées', sentWithoutIds(photosForwarded), {
        conversation_id: chatId(5).toUpperCase(), forwarded: true, preview: '📷 2 photos', ids: true, content: { attachments: { _0: AGENT_PHOTOS.map((path, index) => ({
          id: `0B6D1F2A-3C4E-4F5A-9B6C-7D8E9F0A1B0${index + 1}`, kind: 'photo', fileName: 'Photo.jpg', storagePath: `${chatId(5)}/${path.split('/')[1]}`, byteCount: 182000,
        })) } },
      });
    }

    // « + » de la barre : la page d'émojis de l'app (Immobilier, Visages, Gestes, Cœurs) ; 🏠 posé sur le message.
    await messageMenu(page, 7);
    await page.click('dialog.dm-focus[open] .dm-focus-more');
    await page.waitForSelector('dialog.dm-emoji-sheet[open] .dm-emoji-choice', { timeout: 8000 }).catch(() => problems.push(`${M} : « Plus d'emojis » ne s'ouvre pas`));
    expectSame(M, 'plus d\'emojis', [await dialogTitle(page, 'sheet'), await page.$$eval('dialog.dm-emoji-sheet[open] .dm-emoji-title', (els) => els.map((el) => el.textContent))],
      ['Plus d\'emojis', ['Immobilier', 'Visages', 'Gestes', 'Cœurs']]);
    mark = chat.calls.length;
    await page.click('dialog.dm-emoji-sheet[open] .dm-emoji-choice[aria-label="🏠"]');
    const house = await oneCall(chat, 'message_reactions', mark, `${M} : 🏠`);
    if (house) expectSame(M, '🏠 posé', [house.method, house.body], ['POST', { message_id: messageId(7).toUpperCase(), emoji: '🏠' }]);
    await waitForPill(page, 7, 'Réactions : 🏠, 1', `${M} : 🏠`);
    // « Signaler » (message reçu) : la feuille de l'app, puis le signalement du message lui-même (target_type message).
    await messageMenu(page, 7);
    await menuChoice(page, 'Signaler', `${M} : signaler le message`);
    expectSame(M, 'signaler le message', await dialogTitle(page, 'sheet'), 'Signaler le message');
    await page.click('dialog[open] .dm-choice:has-text("Spam")');
    mark = chat.calls.length;
    await page.click('dialog[open] button:text-is("Enregistrer le signalement")');
    expectSame(M, 'avis du signalement du message', await noticeText(page, M), 'Signalement envoyé à l\'équipe Nidalo.');
    const messageReport = await oneCall(chat, 'reports', mark, `${M} : signaler le message`);
    if (messageReport) {
      expectSame(M, 'message signalé', [messageReport.method, messageReport.body],
        ['POST', { id: messageReport.body?.id, target_type: 'message', target_id: messageId(7).toUpperCase(), reason: 'spam' }]);
    }
    // « Supprimer » (message envoyé, avec un fichier) : « Supprimer ce message ? », pour tout le monde avec ses fichiers ;
    // la ligne est supprimée (demandée en retour), puis son fichier dans message-attachments, comme l'app.
    expectSame(M, 'menu d\'un document envoyé', (await messageMenu(page, 5)).items, ['Répondre', 'Transférer', 'Supprimer']);
    await menuChoice(page, 'Supprimer', `${M} : supprimer`);
    expectSame(M, 'confirmation de la suppression', [await dialogTitle(page), await textOf(page, 'dialog.alert-dialog[open] .alert-body p')],
      ['Supprimer ce message ?', 'Ce message sera supprimé pour tout le monde, avec ses fichiers.']);
    mark = chat.calls.length;
    await alertButton(page, 'Supprimer');
    await msgRow(page, 5).waitFor({ state: 'detached', timeout: 8000 }).catch(() => problems.push(`${M} : le message supprimé reste dans le fil`));
    expectSame(M, 'suppression', chatCalls(chat, 'messages', mark).filter((call) => call.method === 'DELETE' || call.search.startsWith('?select=content'))
      .map((call) => `${call.method} ${call.search}`), [`GET ?select=content&id=eq.${messageId(5).toUpperCase()}`, `DELETE ?id=eq.${messageId(5).toUpperCase()}&select=id`]);
    await waitFor(() => chat.removed.length > 0, `${M} : fichier du message supprimé`);
    expectSame(M, 'fichier supprimé', chat.removed, [LOAN_PDF]);
    // Refus du serveur : l'avis de l'app, et le message reste ; un texte se supprime sans parler de fichiers. Chrome note
    // le refus simulé (503) dans la console.
    const deleteRefusal = /status of 503/;
    expectedConsole.add(deleteRefusal);
    chat.fail = ({ table, method }) => (table === 'messages' && method === 'DELETE' ? { status: 503 } : null);
    expectSame(M, 'menu d\'un texte envoyé', (await messageMenu(page, 3)).items, ['Répondre', 'Transférer', 'Copier', 'Supprimer']);
    await menuChoice(page, 'Supprimer', `${M} : suppression refusée`);
    expectSame(M, 'confirmation sans fichier', [await dialogTitle(page), await page.locator('dialog.alert-dialog[open] .alert-body p').count()], ['Supprimer ce message ?', 0]);
    await alertButton(page, 'Supprimer');
    expectSame(M, 'suppression refusée', await noticeText(page, M), 'Ce message n\'a pas pu être supprimé.');
    chat.fail = null;
    expectedConsole.delete(deleteRefusal);
    if (!(await msgRow(page, 3).count())) problems.push(`${M} : le message dont la suppression est refusée a disparu`);
    // Visionneuse : « Télécharger » pour une photo reçue ; « Supprimer » est réservé à l'auteur.
    await msgRow(page, 2).locator('.dm-media-tile').first().click();
    await page.waitForSelector('dialog.dm-viewer[open]', { timeout: 8000 }).catch(() => problems.push(`${M} : la visionneuse ne s'ouvre pas`));
    await page.click('dialog.dm-viewer[open] button[aria-label="Plus d\'actions"]');
    expectSame(M, 'actions de la visionneuse', await page.$$eval('dialog.dm-viewer[open] .dm-menu-list [role="menuitem"]', (els) => els.map((el) => el.textContent.trim())), ['Télécharger']);
    await page.click('dialog.dm-viewer[open] button[aria-label="Fermer"]');
    await page.waitForSelector('dialog.dm-viewer[open]', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${M} : la visionneuse reste ouverte`));

    // Dans le groupe : la réponse de Camille cite un message supprimé depuis ; l'original est relu une fois par son
    // identifiant (comme message(id:) de l'app), puis « Message supprimé », qui ne mène nulle part.
    await backToList(page, M);
    mark = chat.calls.length;
    await page.click(rowLink(4));
    await page.waitForURL(`${base}/messages/?c=${chatId(4)}`);
    await msgRow(page, 35).locator('.dm-quote.is-deleted').waitFor({ timeout: 8000 }).catch(() => problems.push(`${M} : « Message supprimé » absent`));
    expectSame(M, 'original supprimé', [await messageAround(page, 35), await msgRow(page, 35).locator('.dm-quote').isDisabled().catch(() => null)],
      [{ forwarded: null, header: 'Camille a répondu', quote: 'Message supprimé', deleted: true, pill: null }, true]);
    expectSame(M, 'original relu', chatCalls(chat, 'messages', mark).filter((call) => call.search.includes('&id=eq.')).map((call) => `${call.method} ${call.search}`),
      [`GET ?select=id,conversation_id,sender_id,kind,client_id,content,created_at,expires_at,reply_to_id,forwarded,message_reactions(user_id,emoji,created_at)&id=eq.${messageId(30).toUpperCase()}&limit=1`]);
    await page.close();

    // Une réponse dont l'original a disparu avant l'envoi (supprimé depuis l'iPhone) : le trigger refuse
    // (message_reply_unavailable) ; l'avis de l'app, puis le brouillon et la réponse reviennent.
    page = await open(replyDesk, `/messages/?c=${chatId(1)}`, 'messages-reponse-refusée');
    await page.waitForSelector('.dm-thread-inner .dm-day');
    await messageMenu(page, 1);
    await menuChoice(page, 'Répondre', `${M} : répondre au premier message`);
    chat.messages = chat.messages.filter((item) => item.id !== messageId(1));
    mark = chat.calls.length;
    await page.fill('.dm-composer textarea', 'Pouvez-vous m\'envoyer le plan ?');
    await page.keyboard.press('Enter');
    expectSame(M, 'réponse refusée', await noticeText(page, M), 'Le message auquel vous répondez n\'est plus disponible.');
    const refused = await oneCall(chat, 'messages', mark, `${M} : réponse refusée`, (call) => call.method === 'POST');
    if (refused) expectSame(M, 'réponse refusée envoyée', refused.body?.reply_to_id, messageId(1).toUpperCase());
    expectSame(M, 'après le refus', [await page.inputValue('.dm-composer textarea'), await textOf(page, '.dm-reply-bar-preview')],
      ['Pouvez-vous m\'envoyer le plan ?', 'Bonjour Claire, merci pour votre intérêt. Voici quelques photos du séjour et de la salle à manger.']);
    await page.close();
    await replyDesk.close();
  }

  // Sur téléphone : la même conversation ; double toucher pour ❤️, appui long (0,35 s) pour la barre et le menu.
  {
    const M = 'messages réponses téléphone';
    const { context: replyPhone, chat } = await chatContext({ phone: true });
    replyChat(chat);
    page = await open(replyPhone, `/messages/?c=${chatId(1)}`, 'messages-reponses-telephone');
    await page.waitForSelector('.dm-thread-inner .dm-day');
    await msgRow(page, 10).locator('.dm-quote').waitFor({ timeout: 8000 }).catch(() => problems.push(`${M} : citation absente`));
    expectSame(M, 'réponse avec un cœur', await messageAround(page, 10), REPLY_SHOWN);
    expectSame(M, 'message transféré', (await messageAround(page, 9))?.forwarded, 'Transféré');
    expectSame(M, 'boutons et champs sans nom', await unnamedControls(page), []);
    await chatShot(page, '3-messages-reponses-telephone.png');
    let mark = chat.calls.length;
    const box = await msgRow(page, 7).locator('.dm-bubble').boundingBox();
    await page.touchscreen.tap(box.x + 24, box.y + 16);
    await page.touchscreen.tap(box.x + 24, box.y + 16);
    const liked = await oneCall(chat, 'message_reactions', mark, `${M} : double toucher`);
    if (liked) expectSame(M, 'double toucher', [liked.method, liked.body], ['POST', { message_id: messageId(7).toUpperCase(), emoji: '❤️' }]);
    await waitForPill(page, 7, 'Réactions : ❤️, 1', `${M} : double toucher`);
    const body = msgRow(page, 4).locator('.dm-interactive-body');
    const at = await body.boundingBox();
    const touch = { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: at.x + 20, clientY: at.y + 12 };
    await body.dispatchEvent('pointerdown', touch);
    await page.waitForSelector('dialog.dm-focus[open] .dm-focus-menu', { timeout: 4000 }).catch(() => problems.push(`${M} : l'appui long n'ouvre pas le menu`));
    await body.dispatchEvent('pointerup', touch).catch(() => undefined);
    expectSame(M, 'menu de l\'appui long', await page.$$eval('dialog.dm-focus[open] [role="menuitem"]', (els) => els.map((el) => el.textContent.trim())), ['Répondre', 'Transférer', 'Copier', 'Signaler']);
    await chatShot(page, '3-messages-menu-telephone.png');
    await menuChoice(page, 'Répondre', `${M} : répondre`);
    expectSame(M, 'barre de réponse', await textOf(page, '.dm-reply-bar-title'), 'Réponse à Agence Démo Lyon');
    await chatShot(page, '3-messages-reponse-en-cours-telephone.png');
    await page.close();
    await replyPhone.close();
  }

  // Recherche ouverte, comme l'app (MessagingSearchView ; demande du 17/11) : « Votre activité immobilière » tant que
  // rien n'est saisi, puis « Discussions liées aux annonces » : les conversations sur un bien, chaque fiche lue une
  // fois, en même temps ; pendant leur lecture, le montant d'une vente et rien pour une location ; ensuite le prix des
  // cartes. Une conversation de plus, sur la location de test (Studio meublé). Captures : 3-messages-recherche-1440.png
  // et 3-messages-discussions-1440.png.
  {
    const M = 'messages recherche';
    const RENT = listings[2];
    const { context: searchDesk, server: searchServer, chat } = await chatContext({ width: 1440, height: 960, slow: { listings: 1500 } });
    chat.conversations.push({ id: chatId(9), kind: 'listing', listing: RENT.id, buyer: USER_ID, seller: PRO_ID, other: PRO_ID, name: null, unread: 1, created_at: '2026-11-04T10:00:00Z' });
    chat.participants.push({ conversation_id: chatId(9), user_id: USER_ID, role: 'member', left_at: null, last_read_at: '2026-11-04T10:00:00Z' },
      { conversation_id: chatId(9), user_id: PRO_ID, role: 'member', left_at: null, last_read_at: '2026-11-04T10:05:00Z' });
    chat.messages.push(chatLine(91, chatId(9), PRO_ID, '2026-11-04T10:05:00Z', 'Le studio est libre à partir du 1er décembre.'));
    page = await open(searchDesk, '/messages/', 'messages-recherche');
    await page.waitForSelector('.dm-list .dm-row');
    if (await page.locator('.dm-activity, .dm-msearch-cancel').count()) problems.push(`${M} : recherche ouverte d'elle-même`);
    await page.click('.dm-search-open');
    await page.waitForSelector('.dm-activity', { timeout: 8000 }).catch(() => problems.push(`${M} : « Votre activité immobilière » absente`));
    const activity = () => page.$$eval('.dm-activity-row', (els) => els.map((el) => [el.querySelector('.dm-activity-title')?.textContent ?? null,
      el.querySelector('.dm-activity-count')?.textContent ?? null, el.getAttribute('href')]));
    await page.waitForFunction(() => document.querySelectorAll('.dm-activity-count').length >= 3, null, { timeout: 8000 }).catch(() => undefined);
    // La recherche ouverte prend toute la colonne, à la place de la liste (MessagingSearchView plein écran).
    expectSame(M, 'activité immobilière', [await textOf(page, '.dm-activity h2'), await activity(), await textOf(page, '.dm-msearch-cancel'),
      await page.locator('.dm-list').count()], ['Votre activité immobilière', [['Annonces consultées récemment', null, '/compte/?vue=consultes'],
      ['Biens favoris', '3', '/favoris/'], ['Mes recherches immobilières', '2', '/compte/?vue=recherches'], ['Discussions liées aux annonces', '6', null]], 'Annuler', 0]);
    await chatShot(page, '3-messages-recherche-1440.png');
    // Une recherche saisie remplace l'activité (conversations trouvées par le bien ou le dernier message) ; vidée,
    // l'activité revient.
    await page.fill('.dm-msearch-field input', 'studio');
    await page.waitForSelector('.dm-found-conversation', { timeout: 8000 }).catch(() => problems.push(`${M} : recherche « studio » sans conversation`));
    expectSame(M, 'recherche « studio »', await page.$$eval('.dm-found-conversation .dm-contact-name', (els) => els.map((el) => el.textContent)),
      ['Immo Démo Croix-Rousse', 'Compte supprimé']);
    if (await page.locator('.dm-activity').count()) problems.push(`${M} : l'activité reste affichée pendant une recherche`);
    await page.fill('.dm-msearch-field input', '');
    await page.waitForSelector('.dm-activity', { timeout: 8000 }).catch(() => problems.push(`${M} : l'activité ne revient pas`));
    const listingMark = searchServer.requests.length;
    await page.click('.dm-activity-row:has-text("Discussions liées aux annonces")');
    await page.waitForSelector('.dm-linked-row', { timeout: 8000 }).catch(() => problems.push(`${M} : discussions liées absentes`));
    const linkedRows = () => page.$$eval('.dm-linked-row', (els) => els.map((el) => [el.querySelector('.dm-linked-title')?.textContent ?? null,
      el.querySelector('.dm-linked-line')?.textContent ?? null, el.querySelector('.dm-linked-price')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      el.querySelector('.dm-linked-unread')?.textContent ?? null, el.getAttribute('href')]));
    const LINKED = [
      ['Appartement 3 pièces', 'Lyon 2e · Agence Démo Lyon', '238 000 €', '1', `/messages/?c=${chatId(1)}`],
      ['Appartement 2 pièces', 'Lyon 6e · Julien M.', '265 000 €', '2', `/messages/?c=${chatId(2)}`],
      ['Studio meublé', 'Lyon 7e · Immo Démo Croix-Rousse', null, '1', `/messages/?c=${chatId(9)}`],
      ['Maison familiale 5 pièces', 'Écully · Lucas G.', '545 000 €', null, `/messages/?c=${chatId(5)}`],
      ['Maison 4 pièces avec jardin', 'Caluire-et-Cuire · Marc P.', '420 000 €', '2', `/messages/?c=${chatId(3)}`],
      ['Studio rénové', 'Lyon 8e · Compte supprimé', '98 000 €', null, `/messages/?c=${chatId(6)}`],
    ];
    expectSame(M, 'discussions pendant la lecture des fiches', [await textOf(page, '.dm-linked .app-page-header-title'), await linkedRows()], ['Discussions liées aux annonces', LINKED]);
    await page.waitForFunction(() => document.querySelectorAll('.dm-linked-price').length === 6, null, { timeout: 8000 })
      .catch(() => problems.push(`${M} : prix de la location absent après la lecture`));
    // La location : loyer charges comprises (640 € + 50 € de charges), comme les cartes de l'app.
    expectSame(M, 'discussions', await linkedRows(), LINKED.map((row) => (row[0] === 'Studio meublé' ? [...row.slice(0, 2), '690 €/mois CC', ...row.slice(3)] : row)));
    expectSame(M, 'fiches lues une fois chacune', searchServer.requests.slice(listingMark).filter((request) => request.table === 'listings')
      .map((request) => /[?&]id=eq\.([^&]+)/.exec(request.search)?.[1] ?? request.search).sort(), [homeId(1), homeId(7), RENT.id, homeId(5), homeId(3), homeId(4)].sort());
    await chatShot(page, '3-messages-discussions-1440.png');
    // Retour à l'activité, puis « Annuler » referme la recherche.
    await page.click('.dm-linked .app-page-header button[aria-label="Retour"]');
    await page.waitForSelector('.dm-activity', { timeout: 8000 }).catch(() => problems.push(`${M} : « Retour » ne revient pas à l'activité`));
    await page.click('.dm-msearch-cancel');
    await page.waitForSelector('.dm-activity', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${M} : « Annuler » ne referme pas la recherche`));
    expectSame(M, 'recherche refermée', [await page.locator('.dm-msearch-cancel').count(), await page.locator('.dm-list .dm-row').count() > 0], [0, true]);
    // Une discussion liée ouvre sa conversation.
    await page.click('.dm-search-open');
    await page.click('.dm-activity-row:has-text("Discussions liées aux annonces")');
    await page.click(`.dm-linked-row[href="/messages/?c=${chatId(9)}"]`);
    await page.waitForURL(`${base}/messages/?c=${chatId(9)}`);
    await page.waitForSelector('section.dm-pane[aria-label="Conversation avec Immo Démo Croix-Rousse"]', { timeout: 8000 })
      .catch(() => problems.push(`${M} : la discussion liée n'ouvre pas sa conversation`));
    await page.close();
    await searchDesk.close();

    // Aucune conversation sur un bien : l'état vide de l'app.
    const { context: emptyDesk, chat: emptyChat } = await chatContext({ width: 1440, height: 960 });
    emptyChat.conversations = emptyChat.conversations.filter((conversation) => conversation.kind === 'group');
    page = await open(emptyDesk, '/messages/', 'messages-recherche-vide');
    await page.waitForSelector('.dm-list .dm-row');
    await page.click('.dm-search-open');
    await page.waitForSelector('.dm-activity');
    expectSame(M, 'aucune discussion liée : compte', (await activity()).at(-1), ['Discussions liées aux annonces', null, null]);
    await page.click('.dm-activity-row:has-text("Discussions liées aux annonces")');
    expectSame(M, 'aucune discussion liée', await textOf(page, '.dm-linked .dm-list-empty'),
      'Aucune discussion liée à un bien Touchez « Message » sur une annonce pour poser vos questions à l\'annonceur.');
    await chatShot(page, '3-messages-discussions-vide-1440.png');
    await page.close();
    await emptyDesk.close();
  }

  // Étape 6, Messages comme l'app : plus de 200 messages (n° 19) ; les 200 derniers à l'ouverture, puis 200 de plus en
  // remontant, bornés à la seconde qui suit le plus ancien affiché (lt., comme l'app), sans doublon, et ce que l'on voyait
  // reste à sa place ; une fois tout lu, plus rien n'est demandé. Pendant la lecture plus haut, un message reçu ne fait
  // pas descendre la liste ; le sien, si (n° 104). À 1440 px et sur téléphone. Captures : 3-messages-anciens-*.png.
  {
    const OLD_COUNT = 450;
    const oldStart = Date.parse('2026-10-20T08:00:00Z');
    const oldText = (index) => `Message ${index + 1} de l'historique`;
    const oldAt = (index) => new Date(oldStart + index * 1_200_000).toISOString();
    const pageCalls = (chat, from) => chatCalls(chat, 'messages', from)
      .filter((call) => call.method === 'GET' && call.search.includes(`conversation_id=eq.${chatId(2).toUpperCase()}`) && call.search.includes('limit=200'));
    const threadTexts = (page) => page.$$eval('.dm-thread .dm-text', (els) => els.map((el) => el.textContent));
    for (const [label, size] of [['1440', { width: 1440, height: 960 }], ['390', { phone: true }]]) {
      const M = `messages anciens ${label}`;
      const { context: oldContext, server: oldServer, chat } = await chatContext(size);
      for (let index = 0; index < OLD_COUNT; index += 1) {
        chat.messages.push(chatLine(1000 + index, chatId(2), index % 2 === 0 ? OTHER_ID : USER_ID, oldAt(index), oldText(index)));
      }
      let mark = chat.calls.length;
      page = await open(oldContext, `/messages/?c=${chatId(2)}`, `messages-anciens-${label}`);
      await page.waitForSelector('.dm-visit-actions');
      const opening = pageCalls(chat, mark);
      expectSame(M, 'ouverture', [opening.length, opening.some((call) => call.search.includes('created_at=lt.')), (await threadTexts(page))[0]], [1, false, oldText(254)]);
      // En haut du fil : la page d'avant ; la bulle du haut ne bouge pas.
      for (const [step, oldest, first] of [[1, 254, 55], [2, 55, 0]]) {
        mark = chat.calls.length;
        const before = await page.evaluate(() => {
          const thread = document.querySelector('.dm-thread');
          thread.scrollTop = 0;
          const bubble = thread.querySelector('[data-message-id]');
          return { id: bubble.dataset.messageId, top: bubble.getBoundingClientRect().top };
        });
        await page.waitForFunction((text) => document.querySelector('.dm-thread .dm-text')?.textContent === text, oldText(first), { timeout: 8000 })
          .catch(() => problems.push(`${M} : page ${step} : les messages plus anciens n'arrivent pas`));
        const bound = new Date(Date.parse(oldAt(oldest)) + 1000).toISOString().replace(/\.\d+Z$/, 'Z');
        expectSame(M, `page ${step}`, pageCalls(chat, mark).map((call) => new URLSearchParams(call.search).get('created_at')), [`lt.${bound}`]);
        await page.waitForTimeout(200);
        const after = await page.evaluate((id) => document.querySelector(`.dm-thread [data-message-id="${id}"]`)?.getBoundingClientRect().top ?? null, before.id);
        if (after === null || Math.abs(after - before.top) > 2) problems.push(`${M} : page ${step} : la bulle du haut passe de ${Math.round(before.top)} à ${after === null ? 'rien' : Math.round(after)}`);
      }
      const ids = await page.$$eval('.dm-thread [data-message-id]', (els) => els.map((el) => el.dataset.messageId));
      const texts = await threadTexts(page);
      expectSame(M, 'tout l\'historique, sans doublon', [ids.length === new Set(ids).size, texts.filter((text) => text.endsWith('de l\'historique')).length], [true, OLD_COUNT]);
      mark = chat.calls.length;
      await page.evaluate(() => { document.querySelector('.dm-thread').scrollTop = 0; });
      await page.waitForTimeout(500);
      expectSame(M, 'tout est lu : plus rien de demandé en haut', pageCalls(chat, mark).length, 0);
      // Lecture plus haut : un message de Julien arrive ; la liste ne bouge pas, et les pages lues restent.
      await page.evaluate(() => { const thread = document.querySelector('.dm-thread'); thread.scrollTop = Math.round(thread.scrollHeight / 2); });
      await page.waitForTimeout(300);
      const reading = await page.evaluate(() => document.querySelector('.dm-thread').scrollTop);
      chat.messages.push(chatLine(1600, chatId(2), OTHER_ID, chatClock(chat), 'Je passe demain matin, si cela vous convient.'));
      chat.conversations[1].unread += 1;
      oldServer.pushChange('messages');
      await page.waitForFunction(() => [...document.querySelectorAll('.dm-thread .dm-text')].at(-1)?.textContent === 'Je passe demain matin, si cela vous convient.', null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : le message reçu n'apparaît pas`));
      await page.waitForTimeout(700);
      const kept = await page.evaluate(() => document.querySelector('.dm-thread').scrollTop);
      if (Math.abs(kept - reading) > 2) problems.push(`${M} : la liste passe de ${reading} à ${kept} quand un message arrive pendant la lecture`);
      expectSame(M, 'pages gardées après le message reçu', (await threadTexts(page))[0], oldText(0));
      await chatShot(page, `3-messages-anciens-${label}.png`);
      // Son propre message : la liste descend jusqu'à lui.
      await page.fill('.dm-composer textarea', 'Très bien, à demain matin.');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => {
        const thread = document.querySelector('.dm-thread');
        return [...thread.querySelectorAll('.dm-text')].at(-1)?.textContent === 'Très bien, à demain matin.' && thread.scrollHeight - thread.scrollTop - thread.clientHeight < 4;
      }, null, { timeout: 8000 }).catch(() => problems.push(`${M} : son propre message ne fait pas descendre la liste`));
      await page.close();
      await oldContext.close();
    }
  }

  // Étape 6 : les échecs dits comme l'app, et rien en double. Envoi dont la réponse se perd : le texte revient, le
  // renvoi reprend le même identifiant et le message n'apparaît qu'une fois (n° 99) ; envoi raté pendant que l'on écrit
  // la suite : le texte raté passe devant (n° 208) ; transfert en partie (n° 211) ; blocage et déblocage refusés
  // (n° 28) ; archive refusée, remise comme avant (n° 210) ; pièces jointes renvoyées sans être renvoyées au dossier ;
  // vidéo de plus de 50 Mo (n° 94) ; contenu illisible (n° 30) ; fil vide du vendeur (n° 98).
  {
    const M = 'messages échecs';
    const threadTexts = (page) => page.$$eval('.dm-thread .dm-text', (els) => els.map((el) => el.textContent));
    const { context: failDesk, chat } = await chatContext({ width: 1440, height: 960 });
    const unavailable = { status: 503, body: { message: 'Service Unavailable' } };
    // Chrome note dans la console les refus simulés (503) et le doublon reconnu par le serveur au renvoi (409).
    const refusals = /status of (409|503)/;
    expectedConsole.add(refusals);
    const posts = (from, filter = () => true) => chatCalls(chat, 'messages', from).filter((call) => call.method === 'POST' && filter(call));
    // Un message écrit par une version plus récente de l'app, que cette version ne sait pas lire (n° 30).
    chat.messages.push({ ...chatLine(29, chatId(3), MARC_ID, '2026-11-02T10:10:00Z', ''), content: { text: { _0: 42 } }, preview: 'Nouveauté' });
    page = await open(failDesk, `/messages/?c=${chatId(1)}`, 'messages-echecs');
    await page.waitForSelector('.dm-thread-inner .dm-day');

    // Réponse perdue : le serveur a enregistré le message, le site ne le sait pas.
    chat.fail = ({ table, method }) => (table === 'messages' && method === 'POST' ? { ...unavailable, stored: true } : null);
    let mark = chat.calls.length;
    await page.fill('.dm-composer textarea', 'Je confirme ma venue jeudi.');
    await page.keyboard.press('Enter');
    expectSame(M, 'envoi sans réponse', await noticeText(page, M), 'Le message n\'a pas pu être envoyé. Réessayez.');
    expectSame(M, 'texte rendu', await page.inputValue('.dm-composer textarea'), 'Je confirme ma venue jeudi.');
    chat.fail = null;
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('.dm-thread .dm-text')].at(-1)?.textContent === 'Je confirme ma venue jeudi.', null, { timeout: 8000 })
      .catch(() => problems.push(`${M} : le message renvoyé n'apparaît pas`));
    await page.waitForTimeout(300);
    const sent = posts(mark);
    expectSame(M, 'renvoi : même identifiant', [sent.length, new Set(sent.map((call) => call.body?.client_id)).size, new Set(sent.map((call) => call.body?.id)).size], [2, 1, 1]);
    expectSame(M, 'renvoi : un seul message', [
      chat.messages.filter((item) => item.content?.text?._0 === 'Je confirme ma venue jeudi.').length,
      (await threadTexts(page)).filter((text) => text === 'Je confirme ma venue jeudi.').length,
    ], [1, 1]);

    // Envoi raté pendant que l'on écrit la suite.
    chat.fail = ({ table, method }) => (table === 'messages' && method === 'POST' ? unavailable : null);
    chat.slow = { messages: 1200 };
    await page.fill('.dm-composer textarea', 'Le parking est-il compris ?');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.dm-composer textarea')?.value === '', null, { timeout: 4000 }).catch(() => undefined);
    await page.type('.dm-composer textarea', 'Et la cave ?');
    expectSame(M, 'envoi raté pendant la saisie', await noticeText(page, M), 'Le message n\'a pas pu être envoyé. Réessayez.');
    expectSame(M, 'texte raté devant la suite', await page.inputValue('.dm-composer textarea'), 'Le parking est-il compris ? Et la cave ?');
    chat.slow = {};
    await page.fill('.dm-composer textarea', '');

    // Transfert vers deux conversations, l'une ne répond pas : la fenêtre reste, seule l'autre reste cochée.
    chat.fail = ({ table, method, body }) => (table === 'messages' && method === 'POST' && sameChatId(body?.conversation_id, chatId(2)) ? unavailable : null);
    await messageMenu(page, 7);
    await menuChoice(page, 'Transférer', `${M} : transférer`);
    await page.click('dialog.dm-forward-sheet[open] .dm-forward-target:has-text("Visite groupée Lyon 2e")');
    await page.click('dialog.dm-forward-sheet[open] .dm-forward-target:has-text("Julien M.")');
    mark = chat.calls.length;
    await page.click('dialog.dm-forward-sheet[open] .dm-forward-send');
    await page.waitForSelector('dialog.alert-dialog[open]', { timeout: 8000 }).catch(() => undefined);
    await chatShot(page, '3-messages-transfert-en-partie-1440.png');
    expectSame(M, 'transfert en partie', await noticeText(page, M), 'Message transféré dans 1 conversation sur 2. Réessayez pour les autres.');
    const left = await forwardSheet(page);
    expectSame(M, 'transfert : celle qui n\'a rien reçu reste cochée', [left?.targets.filter((target) => target[2] === 'true').map((target) => target[0]), left?.send],
      [['Julien M.'], ['Envoyer à 1 conversation', false]]);
    chat.fail = null;
    await page.click('dialog.dm-forward-sheet[open] .dm-forward-send');
    await waitForCompareNotice(page, { text: 'Message transféré', action: null }, `${M} : transfert repris`);
    expectSame(M, 'transferts', posts(mark).map((call) => [call.body?.conversation_id, call.body?.forwarded]),
      [[chatId(4).toUpperCase(), true], [chatId(2).toUpperCase(), true], [chatId(2).toUpperCase(), true]]);

    // Blocage, puis déblocage, sans réponse du serveur : le message de l'app, et rien ne change.
    chat.fail = ({ table, method }) => (table === 'user_blocks' && method !== 'GET' ? unavailable : null);
    await headerMenu(page, 'Bloquer');
    await alertButton(page, 'Bloquer');
    expectSame(M, 'blocage refusé', await noticeText(page, M), 'Le blocage n\'a pas pu être enregistré. Vérifiez votre connexion.');
    expectSame(M, 'menu après le blocage refusé', await headerMenu(page), ['Archiver', 'Mettre en sourdine', 'Ajouter aux favoris', 'Bloquer', 'Signaler']);
    chat.fail = null;
    await headerMenu(page, 'Bloquer');
    await alertButton(page, 'Bloquer');
    expectSame(M, 'blocage', await noticeText(page, M), 'Compte bloqué.');
    chat.fail = ({ table, method }) => (table === 'user_blocks' && method !== 'GET' ? unavailable : null);
    await headerMenu(page, 'Débloquer');
    expectSame(M, 'déblocage refusé', await noticeText(page, M), 'Le déblocage n\'a pas pu être enregistré. Vérifiez votre connexion.');
    expectSame(M, 'menu après le déblocage refusé', await headerMenu(page), ['Archiver', 'Mettre en sourdine', 'Ajouter aux favoris', 'Débloquer', 'Signaler']);
    chat.fail = null;
    await headerMenu(page, 'Débloquer');
    expectSame(M, 'déblocage', await noticeText(page, M), 'Compte débloqué.');

    // Archive refusée : la conversation revient où elle était, et l'avis de l'app.
    chat.fail = ({ table, method }) => (table === 'conversation_preferences' && method === 'POST' ? unavailable : null);
    await headerMenu(page, 'Archiver');
    expectSame(M, 'archive refusée', await noticeText(page, M), 'La modification n\'a pas pu être enregistrée.');
    expectSame(M, 'après l\'archive refusée', [await headerMenu(page), (await rowNames(page)).includes('Agence Démo Lyon')], [['Archiver', 'Mettre en sourdine', 'Ajouter aux favoris', 'Bloquer', 'Signaler'], true]);
    chat.fail = null;

    // Une photo envoyée au dossier, puis le message qui ne part pas : « Réessayer » ne renvoie pas la photo, et le
    // message refait est le même (même identifiant).
    chat.fail = ({ table, method }) => (table === 'messages' && method === 'POST' ? unavailable : null);
    mark = chat.calls.length;
    const uploads = chat.uploads.length;
    await page.click('.dm-plus');
    const [photoChooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('dialog[open] .dm-sources button[aria-label="Photos et vidéos"]')]);
    await photoChooser.setFiles({ name: 'cuisine.jpg', mimeType: 'image/jpeg', buffer: photos['photo2.jpg'] });
    await page.waitForSelector('dialog.dm-preview-sheet[open] .dm-tile img');
    await page.click('dialog.dm-preview-sheet[open] .dm-pill');
    await page.waitForSelector('dialog.dm-preview-sheet[open] .dm-error', { timeout: 8000 }).catch(() => problems.push(`${M} : pièce jointe : pas d'erreur affichée`));
    expectSame(M, 'pièce jointe : message refusé', [await textOf(page, 'dialog.dm-preview-sheet[open] .dm-error'), await textOf(page, 'dialog.dm-preview-sheet[open] .dm-pill')],
      ['La pièce jointe n\'a pas pu être envoyée. Vérifiez votre connexion et réessayez.', 'Réessayer']);
    chat.fail = null;
    await page.click('dialog.dm-preview-sheet[open] .dm-pill');
    await page.waitForSelector('dialog.dm-preview-sheet[open]', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${M} : pièce jointe : la feuille reste ouverte`));
    const attachmentPosts = posts(mark);
    expectSame(M, 'pièce jointe renvoyée', [chat.uploads.length - uploads, attachmentPosts.length, new Set(attachmentPosts.map((call) => call.body?.client_id)).size,
      new Set(attachmentPosts.map((call) => JSON.stringify(call.body?.content))).size], [1, 2, 1, 1]);

    // Vidéo de plus de 50 Mo : refusée dès le choix, avec le texte de l'app (le site ne la recompresse pas).
    await page.click('.dm-plus');
    const [videoChooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('dialog[open] .dm-sources button[aria-label="Photos et vidéos"]')]);
    // Fichier fabriqué dans la page : 50 Mo et un octet, sans passer par le disque.
    await videoChooser.element().evaluate((element) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(52_428_801)], 'visite.mp4', { type: 'video/mp4' }));
      element.files = transfer.files;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForSelector('dialog.dm-preview-sheet[open] .dm-tile-error', { timeout: 15000 }).catch(() => problems.push(`${M} : vidéo trop lourde : pas d'erreur`));
    expectSame(M, 'vidéo trop lourde', [await textOf(page, 'dialog.dm-preview-sheet[open] .dm-tile-error'), await page.isDisabled('dialog.dm-preview-sheet[open] .dm-pill')],
      ['Vidéo trop volumineuse : 50 Mo au maximum après compression. Essayez une vidéo plus courte.', true]);
    await chatShot(page, '3-messages-video-trop-lourde-1440.png');
    await page.click('dialog.dm-preview-sheet[open] .dm-sheet-close').catch(() => page.keyboard.press('Escape'));
    await page.waitForSelector('dialog.dm-preview-sheet[open]', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${M} : vidéo trop lourde : la feuille reste ouverte`));

    // Contenu illisible : « Message non pris en charge », les autres messages restent.
    await page.goto(`${base}/messages/?c=${chatId(3)}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.dm-thread-inner .dm-day');
    expectSame(M, 'contenu illisible', [await page.$$eval('.dm-thread .dm-system', (els) => els.map((el) => el.textContent)), (await threadTexts(page)).length],
      [['Message non pris en charge'], 2]);
    await chatShot(page, '3-messages-non-pris-en-charge-1440.png');
    await page.close();
    await failDesk.close();
    expectedConsole.delete(refusals);
  }

  // Étape 6 : la boîte de réception sans réseau (n° 95) : l'écran « Pas de connexion Internet » de l'app, puis
  // « Réessayer » relit les conversations. Fil vide du côté de la personne qui vend (n° 98). À 1440 px et sur téléphone.
  for (const [label, size] of [['1440', { width: 1440, height: 960 }], ['390', { phone: true }]]) {
    const M = `messages hors ligne ${label}`;
    const { context: offlineContext, chat } = await chatContext(size);
    chat.fail = ({ table, body }) => (table === 'rpc/my_conversations' && !body?.p_conversation_id ? { status: 503 } : null);
    // La lecture refusée exprès (503) et la coupure simulée sont notées par Chrome dans la console.
    const refusal = /status of 503|ERR_INTERNET_DISCONNECTED/;
    expectedConsole.add(refusal);
    const offlineScreen = async () => [await textOf(page, '.dm-side .app-offline h2'), await textOf(page, '.dm-side .app-offline p'), await textOf(page, '.dm-side .app-offline button')];
    page = await open(offlineContext, '/messages/', `messages-hors-ligne-${label}`);
    // Refus du serveur : « Conversations indisponibles » (LoadErrorState de l'app).
    await page.waitForSelector('.dm-side .app-offline', { timeout: 8000 }).catch(() => problems.push(`${M} : l'écran d'erreur n'apparaît pas`));
    expectSame(M, 'écran d\'erreur', await offlineScreen(),
      ['Conversations indisponibles', 'Vos conversations n\'ont pas pu être chargées. Vérifiez votre connexion, puis réessayez.', 'Réessayer']);
    // Coupure du réseau, puis « Réessayer » : « Pas de connexion Internet » (OfflineState de l'app).
    chat.fail = null;
    const conversationsUrl = 'https://izzsoitqtzzswkpvdozd.supabase.co/rest/v1/rpc/my_conversations';
    await offlineContext.route(conversationsUrl, (route) => route.abort('internetdisconnected'));
    await page.click('.dm-side .app-offline button');
    await page.waitForFunction(() => document.querySelector('.dm-side .app-offline h2')?.textContent === 'Pas de connexion Internet', null, { timeout: 8000 })
      .catch(() => problems.push(`${M} : la coupure ne montre pas « Pas de connexion Internet »`));
    expectSame(M, 'écran hors ligne', await offlineScreen(), ['Pas de connexion Internet', 'Vérifiez votre connexion, puis réessayez.', 'Réessayer']);
    await chatShot(page, `3-messages-hors-ligne-${label}.png`);
    await offlineContext.unroute(conversationsUrl);
    await page.click('.dm-side .app-offline button');
    await page.waitForSelector('.dm-list .dm-row', { timeout: 8000 }).catch(() => problems.push(`${M} : « Réessayer » ne relit pas les conversations`));
    if (label === '1440') {
      // Fil vide de la personne qui vend : « Écrivez votre premier message. », pas le texte pour l'acheteur.
      chat.conversations.push({ id: chatId(10), kind: 'listing', listing: homeId(7), buyer: CAMILLE_ID, seller: USER_ID, other: CAMILLE_ID, name: null, unread: 0, created_at: '2026-11-06T09:00:00Z' });
      chat.participants.push({ conversation_id: chatId(10), user_id: USER_ID, role: 'member', left_at: null, last_read_at: null },
        { conversation_id: chatId(10), user_id: CAMILLE_ID, role: 'member', left_at: null, last_read_at: null });
      await page.goto(`${base}/messages/?c=${chatId(10)}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.dm-thread-empty', { timeout: 8000 }).catch(() => problems.push(`${M} : fil vide du vendeur absent`));
      expectSame(M, 'fil vide du vendeur', await textOf(page, '.dm-thread-empty'), 'Écrivez votre premier message.');
    }
    await page.close();
    await offlineContext.close();
    expectedConsole.delete(refusal);
  }

  // Sous 1024 px (iPhone 13, 390 px) : une seule colonne, comme dans l'app, avec sa police (Inter). La liste
  // au-dessus de la barre du bas, puis la conversation en plein écran (barre cachée, saisie tout en bas) ; le retour
  // rond de l'en-tête revient à la liste. Captures : 3-messages-telephone-*.png.
  {
    const M = 'messages téléphone';
    const { context: chatPhone, chat } = await chatContext({ phone: true });
    page = await open(chatPhone, '/messages/', 'messages-telephone');
    await page.waitForSelector('.dm-list .dm-row');
    const phoneShape = () => page.evaluate(() => {
      const shown = (selector) => Boolean(document.querySelector(selector)?.getClientRects().length);
      const bottom = document.querySelector('.dm-bottom')?.getBoundingClientRect();
      return {
        list: shown('.dm-side'), pane: shown('.dm-main'), tabbar: shown('.tabbar'), overflowX: document.documentElement.scrollWidth - innerWidth,
        pageScroll: document.documentElement.scrollHeight - innerHeight,
        font: getComputedStyle(document.querySelector('.dm')).fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        composerGap: bottom ? Math.round(innerHeight - bottom.bottom) : null,
      };
    });
    expectSame(M, 'liste', await phoneShape(), { list: true, pane: false, tabbar: true, overflowX: 0, pageScroll: 0, font: 'Nidalo Inter', composerGap: null });
    expectSame(M, 'conversations', await inboxRows(page), INITIAL_ROWS);
    await chatShot(page, '3-messages-telephone-liste.png');
    const mark = chat.calls.length;
    await page.click(rowLink(2));
    await page.waitForURL(`${base}/messages/?c=${chatId(2)}`);
    await page.waitForSelector('.dm-visit-actions');
    const readB = await oneCall(chat, 'rpc/mark_conversation_read', mark, `${M} : ouverture de B`);
    if (readB) expectSame(M, 'B marquée lue', readB.body, { p_conversation_id: chatId(2).toUpperCase() });
    expectSame(M, 'conversation', await phoneShape(), { list: false, pane: true, tabbar: false, overflowX: 0, pageScroll: 0, font: 'Nidalo Inter', composerGap: 0 });
    // En-tête de l'app : retour, puis la capsule (téléphone, gris sans numéro partagé, et « … ») ; « Proposer une visite »
    // passe par « Détails » et la fiche, comme dans l'app.
    expectSame(M, 'boutons de l\'en-tête', await page.$$eval('.dm-head button', (els) => els.filter((el) => el.getClientRects().length).map((el) => el.getAttribute('aria-label'))),
      ['Retour', 'Appeler, numéro non partagé', 'Plus d\'options']);
    expectSame(M, 'réponses rapides', await quickReplies(page), ['Oui, samedi 10 h', 'Proposer un autre créneau', 'Envoyer le dossier complet']);
    expectSame(M, 'boutons et champs sans nom', await unnamedControls(page), []);
    await chatShot(page, '3-messages-telephone-conversation.png');
    await page.click('.dm-back');
    await page.waitForURL(`${base}/messages/`);
    await page.waitForSelector('.dm-list .dm-row');
    expectSame(M, 'retour à la liste', [(await phoneShape()).tabbar, (await phoneShape()).pane], [true, false]);
    await page.close();
    await chatPhone.close();
  }
  // Groupes et communautés (étape 4b), comme l'app (GroupInfoView, NewGroupView, CommunityViews, CommunityInviteViews,
  // BroadcastView) : chaque action envoie au serveur simulé la fonction et les paramètres de l'app ; une communauté de
  // quartier (le compte en est administrateur, une demande pour entrer) s'ajoute aux conversations de test.
  {
    const M = 'messages groupes';
    const { context: chatDesk, chat } = await chatContext({ width: 1440, height: 960 });
    addChatCommunity(chat);
    await chatDesk.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    page = await open(chatDesk, `/messages/?c=${chatId(4)}`, M);
    await page.waitForSelector('.dm-thread-inner .dm-day');
    const D = chatId(4).toUpperCase();
    /** Bandeau bleu du bas (2 s). */
    const toast = async (wanted, what) => {
      await page.waitForFunction((text) => [...document.querySelectorAll('.dmg-toast')].some((el) => el.textContent === text), wanted, { timeout: 8000 })
        .catch(async () => problems.push(`${M} : ${what} : bandeau ${JSON.stringify(await texts(page, '.dmg-toast'))} au lieu de « ${wanted} »`));
    };
    const members = () => page.$$eval('.dmg-members > li', (els) => els.map((el) => [el.querySelector('.dmg-member-name')?.textContent ?? null, el.querySelector('.dmg-role')?.textContent ?? null]));
    const waitForMembers = async (wanted, what) => {
      await page.waitForFunction((list) => JSON.stringify([...document.querySelectorAll('.dmg-members > li')]
        .map((el) => [el.querySelector('.dmg-member-name')?.textContent ?? null, el.querySelector('.dmg-role')?.textContent ?? null])) === JSON.stringify(list), wanted, { timeout: 8000 })
        .catch(async () => problems.push(`${M} : ${what} : membres ${JSON.stringify(await members())} au lieu de ${JSON.stringify(wanted)}`));
    };
    /** Menu d'un membre : ses actions, ou l'action choisie. */
    const memberMenu = async (name, choose = null) => {
      await page.click(`.dmg-members button.dmg-member-line[aria-label="${name}"]`);
      await page.waitForSelector('.dmg-members .dm-menu-list');
      const items = await texts(page, '.dmg-members .dm-menu-list [role="menuitem"]');
      if (choose) await page.locator('.dmg-members .dm-menu-list').getByRole('menuitem', { name: choose, exact: true }).click();
      else await page.keyboard.press('Escape');
      return items;
    };
    const sheetTitle = (wanted) => page.waitForFunction((text) => document.querySelector('dialog.dm-sheet[open] h2')?.textContent === text, wanted, { timeout: 8000 })
      .catch(async () => problems.push(`${M} : feuille « ${await dialogTitle(page, 'sheet')} » au lieu de « ${wanted} »`));

    // « Infos du groupe » : en-tête, À propos, Médias, réglages, actions, membres et date de création.
    await page.click('.dm-head-who');
    await page.waitForURL(`${base}/messages/?c=${chatId(4)}&vue=groupe`);
    await page.waitForSelector('.dmg-hero');
    expectSame(M, 'infos du groupe', {
      bar: [await textOf(page, '.dmg-bar h2'), await textOf(page, '.dmg-bar-action')],
      hero: [await textOf(page, '.dmg-hero-name'), await textOf(page, '.dmg-hero-sub'), await page.textContent('.dmg-tag')],
      tiles: await texts(page, '.dmg-tile'), sections: await texts(page, '.dmg-section-title'),
      about: [await textOf(page, '.dmg-about'), await textOf(page, '.dmg-about-by')], media: await textOf(page, '.dmg-media-empty'),
      settings: await page.$$eval('.dmg-section-card .dm-action-row', (els) => els.map((el) => el.innerText.replace(/\s+/g, ' ').trim())),
      foot: await textOf(page, '.dmg-foot'), leave: await textOf(page, '.dmg-destructive:has-text("Quitter")'),
    }, {
      bar: ['Infos du groupe', 'Modifier'], hero: ['Visite groupée Lyon 2e', 'Groupe · 3 membres', 'Projet immobilier'], tiles: ['Ajouter', 'Rechercher'],
      sections: ['À propos', 'Médias', 'Paramètres de la conversation', 'Actions du groupe', '3 membres'],
      about: ['Visite de l\'appartement 3 pièces samedi à 10 h, puis point sur nos dossiers.', 'Créé par vous · hier'],
      media: 'Les photos et documents partagés dans ce groupe apparaîtront ici.',
      settings: ['Notifications En sourdine', 'Messages éphémères Désactivés', 'Ajouter aux favoris Retrouvez ce groupe avec le filtre Favoris de Messages',
        'Exporter la discussion', 'Effacer la discussion Seulement pour vous'],
      foot: 'Groupe créé le 5 novembre 2026', leave: 'Quitter le groupe',
    });
    await waitForMembers([['Vous', 'Créateur'], ['Camille R.', null], ['Agence Démo Lyon', 'Administrateur']], 'liste');
    expectSame(M, 'boutons et champs sans nom (infos)', await unnamedControls(page), []);
    await chatShot(page, '3-messages-infos-groupe-1440.png');

    // Favori : tous les réglages relus puis enregistrés (conversation_preferences), et le bandeau.
    let mark = chat.calls.length;
    await page.click('.dm-action-row:has-text("Ajouter aux favoris")');
    const favorite = await oneCall(chat, 'conversation_preferences', mark, `${M} : favori`, (call) => call.method === 'POST');
    if (favorite) expectSame(M, 'favori', [favorite.body.conversation_id, favorite.body.is_favorite, favorite.body.is_archived, 'hidden_at' in favorite.body], [D, true, false, false]);
    await toast('Ajouté aux favoris', 'favori');

    // Messages éphémères : 24 heures, après confirmation (set_ephemeral, la durée en texte).
    await page.click('.dm-action-row:has-text("Messages éphémères")');
    await page.waitForURL(`${base}/messages/?c=${chatId(4)}&vue=ephemeres`);
    await page.click('.dmg-radio-row:has-text("24 heures")');
    expectSame(M, 'confirmation des messages éphémères', [await dialogTitle(page), await textOf(page, 'dialog.alert-dialog[open] .alert-body p')],
      ['Activer les messages éphémères ?', 'Les nouveaux messages de ce groupe disparaîtront de la conversation, pour tous les membres, 24 heures après leur envoi.']);
    mark = chat.calls.length;
    await alertButton(page, 'Activer : 24 heures');
    const ephemeral = await oneCall(chat, 'rpc/set_ephemeral', mark, `${M} : messages éphémères`);
    if (ephemeral) expectSame(M, 'messages éphémères envoyés', ephemeral.body, { p_conversation_id: D, p_seconds: '86400' });
    await page.waitForSelector('.dmg-radio-row[aria-checked="true"]:has-text("24 heures")', { timeout: 8000 }).catch(() => problems.push(`${M} : « 24 heures » n'est pas cochée`));
    await page.click('.dmg-bar button[aria-label="Retour"]');
    await page.waitForURL(`${base}/messages/?c=${chatId(4)}&vue=groupe`);
    expectSame(M, 'durée affichée', await textOf(page, '.dm-action-row:has-text("Messages éphémères") .dmg-value'), '24 heures');

    // Membres : le créateur nomme un administrateur (set_group_role), retire un membre après confirmation (remove_group_member).
    expectSame(M, 'actions sur un membre', await memberMenu('Camille R.'), ['Envoyer un message', 'Nommer administrateur', 'Transférer la propriété', 'Retirer du groupe']);
    mark = chat.calls.length;
    await memberMenu('Camille R.', 'Nommer administrateur');
    const promoted = await oneCall(chat, 'rpc/set_group_role', mark, `${M} : administrateur`);
    if (promoted) expectSame(M, 'administrateur nommé', promoted.body, { p_conversation_id: D, p_member_id: CAMILLE_ID.toUpperCase(), p_role: 'admin' });
    await toast('Camille R. est administrateur', 'administrateur');
    await waitForMembers([['Vous', 'Créateur'], ['Camille R.', 'Administrateur'], ['Agence Démo Lyon', 'Administrateur']], 'administrateur');
    await memberMenu('Agence Démo Lyon', 'Retirer du groupe');
    expectSame(M, 'confirmation du retrait', await dialogTitle(page), 'Retirer Agence Démo Lyon ?');
    mark = chat.calls.length;
    await alertButton(page, 'Retirer du groupe');
    const removed = await oneCall(chat, 'rpc/remove_group_member', mark, `${M} : retrait`);
    if (removed) expectSame(M, 'membre retiré', removed.body, { p_conversation_id: D, p_member_id: AGENT_ID.toUpperCase() });
    await toast('Agence Démo Lyon retiré du groupe', 'retrait');
    await waitForMembers([['Vous', 'Créateur'], ['Camille R.', 'Administrateur']], 'retrait');

    // « Modifier le groupe » : le nom et la description tels que saisis, sans photo (la clé ne part pas).
    await page.click('.dmg-bar-action');
    await sheetTitle('Modifier le groupe');
    await page.fill('dialog[open] input.dmg-input', 'Visite groupée Lyon 2e et 3e');
    mark = chat.calls.length;
    await page.click('dialog[open] .dmg-step-button');
    const edited = await oneCall(chat, 'rpc/update_group_info', mark, `${M} : modifier`);
    if (edited) {
      expectSame(M, 'infos modifiées', edited.body, {
        p_conversation_id: D, p_name: 'Visite groupée Lyon 2e et 3e', p_details: 'Visite de l\'appartement 3 pièces samedi à 10 h, puis point sur nos dossiers.',
      });
    }
    await toast('Infos du groupe mises à jour', 'modifier');
    await page.waitForFunction(() => document.querySelector('.dmg-hero-name')?.textContent === 'Visite groupée Lyon 2e et 3e', null, { timeout: 8000 })
      .catch(() => problems.push(`${M} : le nouveau nom n'est pas affiché`));

    // « Exporter la discussion » : un fichier texte de ce que l'on voit, une ligne par message.
    await page.click('.dm-action-row:has-text("Exporter la discussion")');
    await sheetTitle('Exporter la discussion');
    expectSame(M, 'export', [await textOf(page, 'dialog[open] .dmg-export-count'), await texts(page, 'dialog[open] .choice-chip')],
      ['4 messages · fichier texte (.txt)', ['Toute la discussion', '30 derniers jours', '7 derniers jours']]);
    // Le nom que le site donne au fichier (sans langue UTF-8 dans l'environnement, Chromium sous Linux le remplace par
    // « download » dès qu'il a un accent).
    await page.evaluate(() => {
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { if (this.download) window.savedFileName = this.download; return click.call(this); };
    });
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('dialog[open] button:has-text("Exporter")')]);
    const exported = (await readFile(await download.path(), 'utf8')).split('\n');
    expectSame(M, 'fichier exporté', [await page.evaluate(() => window.savedFileName), exported.slice(0, 3), exported.at(-1), exported.length],
      ['Discussion-Visite-groupée-Lyon-2e-et-3e.txt', ['Discussion « Visite groupée Lyon 2e et 3e » exportée depuis Nidalo', '', '05/11/2026 17:30 · Claire M. a créé le groupe « Visite groupée Lyon 2e »'],
        '06/11/2026 09:12 · Camille R. : Merci, à samedi !', 6]);
    await page.click('dialog[open] .dm-sheet-close');

    // « Signaler le groupe » (reports), « Quitter aussi le groupe » laissé désactivé : l'avis dans le bandeau.
    mark = chat.calls.length;
    await page.click('.dmg-destructive:has-text("Signaler le groupe")');
    await sheetTitle('Signaler le groupe');
    expectSame(M, 'quitter aussi le groupe', [await textOf(page, 'dialog[open] .dm-report-leave'), await page.isChecked('dialog[open] .dm-report-leave input')], ['Quitter aussi le groupe', false]);
    await page.click('dialog[open] .dm-choice:has-text("Spam")');
    await page.click('dialog[open] button:text-is("Enregistrer le signalement")');
    await toast('Signalement envoyé à l\'équipe Nidalo.', 'signalement');
    const groupReport = await oneCall(chat, 'reports', mark, `${M} : signaler le groupe`);
    if (groupReport) expectSame(M, 'signalement du groupe', [groupReport.method, groupReport.body?.target_type, groupReport.body?.target_id, groupReport.body?.reason], ['POST', 'conversation', D, 'spam']);
    if (chatCalls(chat, 'rpc/leave_conversation', mark).length) problems.push(`${M} : le signalement seul quitte le groupe`);

    // « Quitter le groupe » (leave_conversation), puis « Supprimer le groupe » : il quitte la liste (hidden_at).
    await page.click('.dmg-destructive:has-text("Quitter le groupe")');
    expectSame(M, 'confirmation du départ', await dialogTitle(page), 'Quitter le groupe ?');
    mark = chat.calls.length;
    await alertButton(page, 'Quitter le groupe');
    const left = await oneCall(chat, 'rpc/leave_conversation', mark, `${M} : quitter`);
    if (left) expectSame(M, 'groupe quitté', left.body, { p_conversation_id: D });
    await page.waitForURL(`${base}/messages/`);
    await page.goto(`${base}/messages/?c=${chatId(4)}&vue=groupe`);
    await page.waitForSelector('.dmg-destructive:has-text("Supprimer le groupe")');
    expectSame(M, 'après le départ', [await page.locator('.dmg-bar-action').count(), await page.locator('.dmg-tile:has-text("Ajouter")').isDisabled()], [0, true]);
    await page.click('.dmg-destructive:has-text("Supprimer le groupe")');
    expectSame(M, 'confirmation de la suppression', await dialogTitle(page), 'Supprimer le groupe ?');
    mark = chat.calls.length;
    await alertButton(page, 'Supprimer le groupe');
    const hidden = await oneCall(chat, 'conversation_preferences', mark, `${M} : supprimer`, (call) => call.method === 'POST');
    if (hidden) expectSame(M, 'groupe masqué', [hidden.body.conversation_id, typeof hidden.body.hidden_at, hidden.body.is_favorite], [D, 'string', true]);
    await page.waitForURL(`${base}/messages/`);
    await page.waitForFunction((id) => !document.querySelector(`.dm-list .dm-row[href="/messages/?c=${id}"]`), chatId(4), { timeout: 8000 })
      .catch(() => problems.push(`${M} : le groupe supprimé reste dans la liste`));

    // « Nouveau groupe » : au moins deux personnes, puis le nom ; create_group, puis le groupe s'ouvre.
    await page.click('.dm-compose');
    await page.click('dialog[open] .dm-quick-actions .dm-action-row:has-text("Nouveau groupe")');
    await sheetTitle('Nouveau groupe');
    await page.click('dialog[open] .dmg-step-button');
    expectSame(M, 'participants manquants', await textOf(page, 'dialog[open] .dmg-step-error'), 'Choisissez au moins 2 personnes.');
    await page.click('dialog[open] .dmg-picker-row:has-text("Julien M.")');
    await page.click('dialog[open] .dmg-picker-row:has-text("Lucas G.")');
    expectSame(M, 'participants choisis', [await page.$$eval('dialog[open] .dmg-chip', (els) => els.map((el) => el.getAttribute('aria-label'))),
      await textOf(page, 'dialog[open] .dmg-picker-count strong')], [['Retirer Julien M.', 'Retirer Lucas G.'], '2 personnes choisies']);
    await page.click('dialog[open] .dmg-step-button');
    await sheetTitle('Infos du groupe');
    await page.click('dialog[open] .dmg-step-button');
    expectSame(M, 'nom manquant', await textOf(page, 'dialog[open] .dmg-error'), 'Donnez un nom au groupe.');
    await page.fill('dialog[open] input.dmg-input', '  Achat à plusieurs  ');
    await page.click('dialog[open] .choice-chip:has-text("Achat entre particuliers")');
    expectSame(M, 'participants du groupe', [await textOf(page, 'dialog[open] .dmg-card-head .dmg-label'), await texts(page, 'dialog[open] .dmg-member-name')],
      ['Participants · 3 avec vous', ['Vous', 'Julien M.', 'Lucas G.']]);
    mark = chat.calls.length;
    await page.click('dialog[open] .dmg-step-button');
    const createdGroup = await oneCall(chat, 'rpc/create_group', mark, `${M} : nouveau groupe`);
    if (createdGroup) {
      if (!UPPER_UUID.test(createdGroup.body?.p_id ?? '')) problems.push(`${M} : identifiant du groupe ${createdGroup.body?.p_id}`);
      expectSame(M, 'groupe créé', createdGroup.body, {
        p_id: createdGroup.body?.p_id, p_name: 'Achat à plusieurs', p_member_ids: [OTHER_ID.toUpperCase(), LUCAS_ID.toUpperCase()], p_purpose: 'privateSale',
      });
      await page.waitForURL(`${base}/messages/?c=${String(createdGroup.body?.p_id).toLowerCase()}`).catch(() => problems.push(`${M} : le nouveau groupe ne s'ouvre pas (${page.url()})`));
      await page.waitForFunction(() => document.querySelector('.dm-head-title')?.textContent === 'Achat à plusieurs', null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : en-tête du nouveau groupe`));
      if (await page.locator('dialog.dm-sheet[open]').count()) problems.push(`${M} : « Nouveau groupe » reste ouverte`);
    }

    // « Nouvelle communauté » : nom, description, catégorie et couverture, puis « Passer » (sans premiers membres) ;
    // create_community, puis la discussion principale s'ouvre.
    await backToList(page, M);
    await page.click('.dm-compose');
    await page.click('dialog[open] .dm-quick-actions .dm-action-row:has-text("Nouvelle communauté")');
    await sheetTitle('Nouvelle communauté');
    expectSame(M, 'étape 1', [await textOf(page, 'dialog[open] .dmg-steps-title'), await page.locator('dialog[open] .dmg-category.is-on').innerText()],
      ['Étape 1 sur 2 · Informations', 'Communauté immobilière générale']);
    await page.click('dialog[open] .dmg-step-button');
    expectSame(M, 'champs manquants', await texts(page, 'dialog[open] .dmg-error'), ['Donnez un nom à la communauté.', 'Expliquez en quelques mots le but de la communauté.']);
    await page.fill('dialog[open] input.dmg-input >> nth=0', 'Locataires Lyon 7e');
    await page.fill('dialog[open] textarea.dmg-editor', 'Entraide entre locataires : dossiers, visites et bons plans.');
    await page.click('dialog[open] .dmg-category:has-text("Location")');
    await page.click('dialog[open] .dmg-cover-choice[aria-label="Couverture Ciel"]');
    expectSame(M, 'aperçu', await textOf(page, 'dialog[open] .dmg-preview-text'), 'Locataires Lyon 7e Location · Privée');
    await page.click('dialog[open] .dmg-step-button');
    await sheetTitle('Premiers membres');
    expectSame(M, 'étape 2', [await textOf(page, 'dialog[open] .dmg-steps-title'), await textOf(page, 'dialog[open] .dm-sheet-trailing')], ['Étape 2 sur 2 · Membres', 'Passer']);
    mark = chat.calls.length;
    await page.click('dialog[open] .dm-sheet-trailing');
    const createdCommunity = await oneCall(chat, 'rpc/create_community', mark, `${M} : nouvelle communauté`);
    if (createdCommunity) {
      const id = createdCommunity.body?.p_id ?? '';
      if (!UPPER_UUID.test(id)) problems.push(`${M} : identifiant de la communauté ${id}`);
      expectSame(M, 'communauté créée', createdCommunity.body, {
        p_id: id, p_conversation_id: chatMainConversationId(id).toUpperCase(), p_name: 'Locataires Lyon 7e', p_details: 'Entraide entre locataires : dossiers, visites et bons plans.',
        p_category: 'rental', p_cover: 'sky', p_member_ids: [],
      });
      await page.waitForURL(`${base}/messages/?c=${chatMainConversationId(id)}`).catch(() => problems.push(`${M} : la communauté ne s'ouvre pas (${page.url()})`));
      await page.waitForFunction(() => document.querySelector('.dm-head-title')?.textContent === 'Locataires Lyon 7e', null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : en-tête de la nouvelle communauté`));
      await page.click('.dm-head-who');
      await page.waitForSelector('.dmg-hero.is-community');
      expectSame(M, 'nouvelle communauté', [await textOf(page, '.dmg-hero-name'), await textOf(page, '.dmg-hero-sub'), await textOf(page, '.dmg-hero-line'), await members()],
        ['Locataires Lyon 7e', 'Communauté · 1 membre', 'Privée · Location', [['Vous', 'Créateur']]]);
    }

    // La communauté de quartier : page, invitation (lien, QR code, copie, annulation), demandes, membres, départ.
    const C = COMMUNITY_ID.toUpperCase();
    await backToList(page, M);
    await page.click(rowLink(9).replace(chatId(9), COMMUNITY_CHAT));
    await page.waitForURL(`${base}/messages/?c=${COMMUNITY_CHAT}`);
    await page.click('.dm-head-who');
    await page.waitForURL(`${base}/messages/?c=${COMMUNITY_CHAT}&vue=communaute`);
    await page.waitForSelector('.dm-action-row:has-text("Demandes")');
    expectSame(M, 'communauté', {
      bar: [await textOf(page, '.dmg-bar h2'), await textOf(page, '.dmg-bar-action')],
      hero: [await textOf(page, '.dmg-hero-name'), await textOf(page, '.dmg-hero-sub'), await textOf(page, '.dmg-hero-line')],
      tiles: await texts(page, '.dmg-tile'), sections: await texts(page, '.dmg-section-title'), by: await textOf(page, '.dmg-about-button'),
      requests: await textOf(page, '.dm-action-row:has-text("Demandes") .dmg-badge'), main: await textOf(page, '.dm-action-row:has-text("Discussion principale")'),
      foot: await textOf(page, '.dmg-foot'),
    }, {
      bar: ['Communauté', 'Modifier'], hero: ['Voisins de la Croix-Rousse', 'Communauté · 4 membres', 'Privée · Résidentiel · Lyon 4e'],
      tiles: ['Ajouter', 'Rechercher', 'Inviter'], sections: ['À propos', 'Demandes', 'Discussions', '4 membres'], by: 'Créée par Camille R. · 12 octobre',
      requests: '1', main: 'Discussion principale Bienvenue à tous ! Présentez-vous en quelques mots. Mer.', foot: 'Communauté privée · créée le 12 octobre 2026',
    });
    await waitForMembers([['Camille R.', 'Créateur'], ['Vous', 'Administrateur'], ['Marc P.', null], ['Lucas G.', null]], 'communauté');
    expectSame(M, 'boutons et champs sans nom (communauté)', await unnamedControls(page), []);
    await chatShot(page, '3-messages-communaute-1440.png');
    mark = chat.calls.length;
    await page.click('.dmg-tile:has-text("Inviter")');
    await sheetTitle('Inviter');
    await page.waitForSelector('dialog[open] .dmg-invite-qr svg');
    const listed = await oneCall(chat, 'rpc/my_community_invites', mark, `${M} : liens actifs`);
    if (listed) expectSame(M, 'liens actifs', listed.body, { p_community_id: C });
    const invited = await oneCall(chat, 'rpc/create_community_invite', mark, `${M} : nouveau lien`);
    if (invited) expectSame(M, 'nouveau lien', invited.body, { p_community_id: C, p_days: 7, p_requires_approval: true });
    expectSame(M, 'invitation', [await textOf(page, 'dialog[open] .dmg-invite h3'), await textOf(page, 'dialog[open] .dmg-invite-link'), await textOf(page, 'dialog[open] .dmg-invite-validity'),
      await page.getAttribute('dialog[open] .dmg-invite-qr svg', 'aria-label')],
    ['Voisins de la Croix-Rousse', 'nidalo://invite/jeton-invitation-1', 'Valable jusqu\'au 13/11/2026', 'QR code d\'invitation']);
    await page.click('dialog[open] button:has-text("Copier le lien")');
    await page.waitForSelector('dialog[open] button:has-text("Lien copié")', { timeout: 8000 }).catch(() => problems.push(`${M} : « Lien copié » absent`));
    expectSame(M, 'lien copié', await page.evaluate(() => navigator.clipboard.readText()), 'nidalo://invite/jeton-invitation-1');
    await page.click('dialog[open] .dmg-text-danger');
    expectSame(M, 'annuler le lien', [await dialogTitle(page), await texts(page, 'dialog.alert-dialog[open] .alert-actions button')], ['Annuler ce lien ?', ['Annuler ce lien', 'Garder le lien']]);
    mark = chat.calls.length;
    await alertButton(page, 'Annuler ce lien');
    const revoked = await oneCall(chat, 'rpc/revoke_community_invite', mark, `${M} : lien annulé`);
    if (revoked) expectSame(M, 'lien annulé', revoked.body, { p_invite_id: String(chat.invites[0]?.id).toUpperCase() });
    await page.waitForSelector('dialog[open] button:has-text("Créer un nouveau lien")', { timeout: 8000 }).catch(() => problems.push(`${M} : « Créer un nouveau lien » absent`));
    await page.click('dialog[open] .dm-sheet-close');
    // Demandes : « Accepter » (decide_community_join_request), la personne rejoint les membres.
    mark = chat.calls.length;
    await page.click('.dm-action-row:has-text("Demandes")');
    await page.waitForURL(`${base}/messages/?c=${COMMUNITY_CHAT}&vue=demandes`);
    await page.waitForSelector('.dmg-request');
    expectSame(M, 'demandes', [await textOf(page, '.dmg-section-title'), await texts(page, '.dmg-request-name'), await texts(page, '.dmg-request button')],
      ['1 demande', ['Nina L.'], ['Refuser', 'Accepter']]);
    await page.click('.dmg-accept');
    const decided = await oneCall(chat, 'rpc/decide_community_join_request', mark, `${M} : demande acceptée`);
    if (decided) expectSame(M, 'demande acceptée', decided.body, { p_request_id: 'E5000000-0000-4000-8000-000000000001', p_accept: true });
    await page.waitForFunction(() => !document.querySelector('.dmg-request') && document.querySelector('.dmg-section-title')?.textContent === '0 demande', null, { timeout: 8000 })
      .catch(() => problems.push(`${M} : la demande acceptée reste affichée`));
    await page.click('.dmg-bar button[aria-label="Retour"]');
    await page.waitForURL(`${base}/messages/?c=${COMMUNITY_CHAT}&vue=communaute`);
    await waitForMembers([['Camille R.', 'Créateur'], ['Vous', 'Administrateur'], ['Marc P.', null], ['Lucas G.', null], ['Nina L.', null]], 'demande acceptée');
    expectSame(M, 'section « Demandes » après la réponse', await page.locator('.dm-action-row:has-text("Demandes")').count(), 0);
    // Un administrateur retire un simple membre ; ni le créateur ni lui-même n'ont de menu.
    expectSame(M, 'menus des membres', [await page.locator('.dmg-members button.dmg-member-line').count(), await memberMenu('Marc P.')], [3, ['Retirer de la communauté']]);
    mark = chat.calls.length;
    await memberMenu('Marc P.', 'Retirer de la communauté');
    const kicked = await oneCall(chat, 'rpc/remove_community_member', mark, `${M} : retrait de la communauté`);
    if (kicked) expectSame(M, 'retiré de la communauté', kicked.body, { p_community_id: C, p_member_id: MARC_ID.toUpperCase() });
    await waitForMembers([['Camille R.', 'Créateur'], ['Vous', 'Administrateur'], ['Lucas G.', null], ['Nina L.', null]], 'retrait de la communauté');
    await page.click('.dmg-destructive:has-text("Quitter la communauté")');
    expectSame(M, 'quitter la communauté', await dialogTitle(page), 'Quitter la communauté ?');
    mark = chat.calls.length;
    await alertButton(page, 'Quitter la communauté');
    const leftCommunity = await oneCall(chat, 'rpc/leave_community', mark, `${M} : départ de la communauté`);
    if (leftCommunity) expectSame(M, 'communauté quittée', leftCommunity.body, { p_community_id: C });
    await page.waitForURL(`${base}/messages/`);

    // « Nouvelle diffusion » : un message, deux destinataires (dont une agence pas encore contactée : sa conversation
    // est créée), envoyé dans chaque conversation à deux ; « OK » referme l'écran.
    await page.click('.dm-compose');
    await page.click('dialog[open] .dm-quick-actions .dm-action-row:has-text("Nouvelle diffusion")');
    await sheetTitle('Nouvelle diffusion');
    expectSame(M, 'diffusion vide', [await textOf(page, 'dialog[open] .dmg-step-button'), await page.locator('dialog[open] .dmg-step-button').isDisabled()],
      ['Choisissez des destinataires', true]);
    await page.fill('dialog[open] textarea.dmg-broadcast-text', 'Bonjour, je serai absente la semaine prochaine.');
    await page.click('dialog[open] .dmg-picker-row:has-text("Julien M.")');
    await page.click('dialog[open] .dmg-picker-row:has-text("Immo Démo Croix-Rousse")');
    expectSame(M, 'diffusion prête', [await textOf(page, 'dialog[open] .dm-results-title >> nth=1'), await textOf(page, 'dialog[open] .dmg-step-button')],
      ['Destinataires · 2', 'Envoyer à 2 destinataires']);
    mark = chat.calls.length;
    await page.click('dialog[open] .dmg-step-button');
    expectSame(M, 'diffusion envoyée', await dialogTitle(page), 'Message envoyé dans 2 conversations.');
    const started = await oneCall(chat, 'rpc/start_direct_conversation', mark, `${M} : diffusion à l'agence`);
    if (started) expectSame(M, 'conversation avec l\'agence', started.body, { p_user_id: PRO_ID.toUpperCase() });
    const sent = chatCalls(chat, 'messages', mark).filter((call) => call.method === 'POST')
      .map((call) => [String(call.body?.conversation_id).toLowerCase(), call.body?.content?.text?._0 ?? null]);
    expectSame(M, 'messages diffusés', sent, [[chatId(8), 'Bonjour, je serai absente la semaine prochaine.'], [chatId(2), 'Bonjour, je serai absente la semaine prochaine.']]);
    await alertButton(page, 'OK');
    await page.waitForSelector('dialog.dm-sheet[open]', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${M} : « Nouvelle diffusion » reste ouverte`));
    await page.close();
    await chatDesk.close();
  }

  // Sur téléphone : les mêmes écrans en plein écran, sans défilement de côté ; « Passer » dans la barre du titre.
  {
    const M = 'messages groupes téléphone';
    const { context: chatPhone, chat } = await chatContext({ phone: true });
    addChatCommunity(chat);
    page = await open(chatPhone, `/messages/?c=${chatId(4)}`, M);
    await page.waitForSelector('.dm-thread-inner .dm-day');
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expectSame(M, 'en-tête du groupe', await page.$$eval('.dm-head button', (els) => els.filter((el) => el.getClientRects().length).map((el) => el.getAttribute('aria-label'))),
      ['Retour', 'Infos du groupe', 'Ajouter des membres', 'Plus d\'options']);
    await page.click('.dm-head-who');
    await page.waitForSelector('.dmg-hero');
    expectSame(M, 'infos du groupe', [await overflow(), await page.locator('.dm-side').isVisible(), await unnamedControls(page)], [0, false, []]);
    await chatShot(page, '3-messages-telephone-infos-groupe.png');
    // « Signaler le groupe » avec « Quitter aussi le groupe » : le signalement, puis leave_conversation et son avis.
    const mark = chat.calls.length;
    await page.click('.dmg-destructive:has-text("Signaler le groupe")');
    await page.click('dialog[open] .dm-choice:has-text("Spam")');
    await page.click('dialog[open] .dm-report-leave input');
    await page.click('dialog[open] button:text-is("Enregistrer le signalement")');
    await page.waitForSelector('.dmg-destructive:has-text("Supprimer le groupe")', { timeout: 8000 }).catch(() => problems.push(`${M} : signaler et quitter : « Supprimer le groupe » absent`));
    await page.waitForFunction(() => document.querySelector('.dmg-toast')?.textContent === 'Vous avez quitté le groupe', null, { timeout: 8000 })
      .catch(() => problems.push(`${M} : signaler et quitter : pas d'avis « Vous avez quitté le groupe »`));
    expectSame(M, 'signaler et quitter', [chatCalls(chat, 'reports', mark).length, chatCalls(chat, 'rpc/leave_conversation', mark).map((call) => call.body)],
      [1, [{ p_conversation_id: chatId(4).toUpperCase() }]]);
    await page.click('.dmg-bar button[aria-label="Retour"]');
    await page.waitForURL(`${base}/messages/?c=${chatId(4)}`);
    await page.goto(`${base}/messages/?c=${COMMUNITY_CHAT}&vue=communaute`);
    await page.waitForSelector('.dmg-hero.is-community');
    expectSame(M, 'communauté', [await overflow(), await unnamedControls(page)], [0, []]);
    await page.goto(`${base}/messages/`);
    await page.waitForSelector('.dm-list .dm-row');
    await page.click('.dm-compose');
    await page.click('dialog[open] .dm-quick-actions .dm-action-row:has-text("Nouvelle communauté")');
    await page.fill('dialog[open] input.dmg-input >> nth=0', 'Voisins');
    await page.fill('dialog[open] textarea.dmg-editor', 'Entraide.');
    await page.click('dialog[open] .dmg-step-button');
    await page.waitForSelector('dialog[open] .dm-sheet-trailing');
    const bar = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
      const title = box('dialog[open] .dm-sheet-head h2');
      const skip = box('dialog[open] .dm-sheet-trailing');
      return { sameLine: !!title && !!skip && Math.abs((title.top + title.bottom) / 2 - (skip.top + skip.bottom) / 2) < 4, right: skip ? Math.round(innerWidth - skip.right) : null };
    });
    expectSame(M, '« Passer »', [bar.sameLine, bar.right <= 16, await overflow()], [true, true, 0]);
    await page.close();
    await chatPhone.close();
  }
  // Sans compte, sur ordinateur : l'invitation à se connecter ; rien de la messagerie n'est demandé.
  {
    const { context: chatGuest, chat } = await chatContext({ signedIn: false });
    for (const path of ['/messages/', `/messages/?c=${chatId(1)}`]) {
      page = await open(chatGuest, path, `messages-sans-compte ${path}`);
      await page.waitForSelector('.signin-card');
      if (await page.locator('.dm').count()) problems.push(`messages sans compte : la messagerie est affichée (${path})`);
      await page.close();
    }
    if (chat.calls.length) problems.push(`messages sans compte : ${chat.calls.map((call) => call.table).join(', ')} demandé(s)`);
    await chatGuest.close();
  }

  // Favoris sur ordinateur (version ordinateur, étape 4 ; maquette 08-favoris.html : dans le conteneur commun de 1200, sans
  // onglets, les biens favoris en grille de deux colonnes à gauche, les recherches enregistrées dans une colonne à droite,
  // « Comparer vos favoris » écrit en haut à droite), à 1440 × 900 et 1024 × 768, avec le compte de test et des annonces
  // inventées : une vente, une
  // location, un investissement loué (rendement), un hôtel et une annonce retirée. Contenu et actions de l'app
  // (FavoritesView.swift, SavedSearchesView.swift). Captures : 4-favoris-*.png.
  const favContext = async (width, height, listingRows, account, signedIn = true, refuse = []) => {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR' });
    const mocked = await mock(context, { signedIn, listingRows, account, refuse });
    return { context, server: mocked };
  };
  /** Taille, graisse et police des textes de la page des favoris. */
  const favoriteFonts = (p) => p.evaluate(() => {
    const font = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      // Inter du site sans rien de plus ; la police du système (pavés des catégories de l'app) : « système ».
      if (style.fontFamily.startsWith('-apple-system')) return `${style.fontSize} ${style.fontWeight} système`;
      return `${style.fontSize} ${style.fontWeight}${style.fontFamily.startsWith('"Nidalo Inter"') ? '' : ` ${style.fontFamily}`}`;
    };
    return {
      titre: font('.favorites-head h1'), 'sous-titre': font('.favorites-subtitle'), onglet: font('.favorites-wrap .fav-tab'), champ: font('.favorites-field input'),
      catégorie: font('.favorites-categories .mode-name'), nombre: font('.favorites-total'), tri: font('.favorites-sort'), 'titre de carte': font('.favorite-title'),
      infos: font('.favorite-details'), prix: font('.favorite-price'), 'prix au m²': font('.favorite-per-meter'), rendement: font('.favorite-yield'),
      'plus disponible': font('.missing-title'), Retirer: font('.missing-remove'),
    };
  });
  let phoneFavFonts;
  {
    const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
    await mock(context, { signedIn: true, listingRows: FAV_LISTINGS, account: FAV_ACCOUNT });
    page = await open(context, '/favoris/', 'favoris téléphone, polices');
    await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', 'favoris téléphone, polices');
    await page.waitForSelector('.missing-card');
    phoneFavFonts = await favoriteFonts(page);
    await page.close();
    await context.close();
  }
  for (const [width, height] of [[1440, 900], [1024, 768]]) {
    const F = `favoris ${width}`;
    // Au plus près de la maquette : un investissement loué, un studio, une annonce retirée ; comparaison vide.
    {
      const { context, server: mockupServer } = await favContext(width, height, MOCKUP_LISTINGS, MOCKUP_ACCOUNT);
      page = await open(context, '/favoris/', `${F} maquette`);
      await waitForFavorites(page, ['Appartement 2 pièces – Annemasse', 'Studio avec vue dégagée'], '2 biens sauvegardés', `${F} maquette`);
      await page.waitForSelector('.missing-card');
      // Étape 4 : les nouveautés sur les cartes de la colonne des recherches (plus d'onglet ni de point).
      await page.waitForSelector('.favorites-searches .news-badge');
      await favoritePhotosLoaded(page, 2, `${F} maquette`);
      await checkTabBarBadge(page, mockupServer.state, `${F} maquette`);
      await favShot(page, `4-favoris-${width}.png`);
      if (width === 1440) {
        // Les recherches sont déjà dans leur colonne : la même page, une fois leurs nombres de résultats affichés.
        await page.waitForSelector('.favorites-searches .saved-search');
        await waitForSearchCounts(page, `${F} maquette`);
        await favShot(page, '4-favoris-recherches-1440.png');
      }
      await page.close();
      await context.close();
    }

    const { context: favDesk, server: favServer } = await favContext(width, height, FAV_LISTINGS, FAV_ACCOUNT);
    page = await open(favDesk, '/favoris/', F);
    await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', F);
    await page.waitForSelector('.favorites-searches .news-badge');
    await favoritePhotosLoaded(page, 3, F);
    await checkChrome(page, F, { signedIn: true, current: '/favoris/', footer: 'slim' });
    await checkTabBarBadge(page, favServer.state, F);
    // « Comparer vos favoris » écrit sur le bouton (son nom), sans pastille (étape 4).
    expectSame(F, 'en-tête', [await textOf(page, '.favorites-head h1'), await textOf(page, '.favorites-subtitle'), await textOf(page, '.favorites-head .compare-button'),
      await page.isDisabled('.favorites-head .compare-button'), await page.locator('.favorites-head .compare-button-count').count(), await page.getAttribute('.site-header-nav a[href="/favoris/"]', 'aria-current')],
    ['Vos favoris', 'Retrouvez vos biens favoris et vos recherches.', 'Comparer vos favoris', false, 0, 'page']);
    // Étape 4 : pas d'onglets ; deux sections, chacune sous son titre et son nombre (5 favoris, annonce retirée comprise ;
    // 2 recherches) ; les nouveautés sur les cartes des recherches.
    expectSame(F, 'colonnes', [await page.locator('.fav-tab').count(), await page.$$eval('.favorites-column-title', (els) => els.map((el) => [el.closest('section')?.getAttribute('aria-labelledby') === el.id,
      el.textContent.replace(/\s+/g, ' ').trim()])), await page.$$eval('.favorites-searches .news-badge', (els) => els.map((el) => el.textContent))],
    [0, [[true, 'Biens favoris 5'], [true, 'Recherches enregistrées 2']], FAV_NEWS]);
    expectSame(F, 'recherche, filtres et tri', [await page.getAttribute('.favorites-field input', 'placeholder'), await page.getAttribute('.favorites-field input', 'aria-label'),
      await page.getAttribute('.favorites-filters', 'aria-label'), await page.getAttribute('.favorites-sort select', 'aria-label'), await page.textContent('.favorites-sort > span'),
      await page.$$eval('.favorites-sort option', (els) => els.map((el) => [el.value, el.textContent]))],
    ['Ville, code postal, type de bien', 'Rechercher dans vos favoris', 'Filtres', 'Trier par', 'Pertinence',
      [['relevance', 'Pertinence'], ['priceAscending', 'Prix croissant'], ['priceDescending', 'Prix décroissant'], ['recentlyAdded', 'Ajout le plus récent']]]);
    // Catégories : les pavés de l'app avec « Tous » en premier (ModeSegmentedControl(selectionOrAll:)).
    expectSame(F, 'catégories', await page.$$eval('.favorites-categories .mode-tab', (els) => els.map((el) => [el.textContent.trim(), el.getAttribute('aria-checked')])),
      [['Tous', 'true'], ['Résidentiel', 'false'], ['Location', 'false'], ['Investir', 'false'], ['Hôtels', 'false']]);
    expectSame(F, 'cartes', await favoriteCardsShown(page), FAV_CARDS);
    // L'annonce retirée vient après les cartes, comme dans l'app.
    expectSame(F, 'grille', await page.$$eval('.favorites-list > *', (els) => els.map((el) => el.className)), ['favorite-card', 'favorite-card', 'favorite-card', 'favorite-card', 'missing-cards']);
    expectSame(F, 'annonce plus disponible', [await textOf(page, '.missing-title'), await textOf(page, '.missing-subtitle'), await textOf(page, '.missing-remove')],
      ['Annonce plus disponible', 'Le vendeur l\'a retirée, vendue ou louée.', 'Retirer']);
    // Étape 4 : le conteneur commun (1200 px au plus, marges de 32) ; titres, champ, catégories et cartes au même bord
    // gauche ; 2 cartes par ligne à 1440 comme à 1024 (280 px au moins chacune), de la même hauteur sur une ligne, photos
    // comprises (à 1024, cartes de 306 : les infos de l'investissement passent sur deux lignes, sa ligne est plus haute
    // que la suivante) ; la colonne des recherches à droite (300 px) ; le pied de page dans le même conteneur.
    const favLayout = await page.evaluate(() => {
      const box = (element) => element.getBoundingClientRect();
      const cards = [...document.querySelectorAll('.favorites-list > .favorite-card')].map(box);
      const lefts = ['.favorites-head h1', '.favorites-subtitle', '.favorites-column-title', '.favorites-field', '.favorites-categories', '.favorites-toolbar', '.favorites-list']
        .map((selector) => Math.round(box(document.querySelector(selector)).left));
      return {
        list: [Math.round(box(document.querySelector('.favorites-list')).left), Math.round(box(document.querySelector('.favorites-list')).width)],
        columns: getComputedStyle(document.querySelector('.favorites-list')).gridTemplateColumns.split(' ').length, lefts: [...new Set(lefts)],
        widths: [...new Set(cards.map((rect) => Math.round(rect.width)))], heights: new Set(cards.map((rect) => Math.round(rect.height))).size,
        photos: new Set([...document.querySelectorAll('.favorite-photo')].map((photo) => Math.round(box(photo).height))).size,
        overflowX: document.documentElement.scrollWidth - innerWidth, footer: Math.round(box(document.querySelector('footer.site-footer .site-container')).width),
        searches: [Math.round(box(document.querySelector('.favorites-column.is-searches')).left), Math.round(box(document.querySelector('.favorites-column.is-searches')).width)],
      };
    });
    expectSame(F, 'mise en page', favLayout, width === 1440
      ? { list: [152, 808], columns: 2, lefts: [152], widths: [394], heights: 1, photos: 1, overflowX: 0, footer: 1200, searches: [988, 300] }
      : { list: [32, 632], columns: 2, lefts: [32], widths: [306], heights: 2, photos: 1, overflowX: 0, footer: 1024, searches: [692, 300] });
    // Tailles de la maquette 08-favoris.html (étape 4) : titre 34/800, sous-titre 16, titres de carte 15/600, prix 22/800,
    // textes gris de 14 ; police Inter partout (pas d'onglets).
    expectSame(F, 'polices (maquette)', await favoriteFonts(page), FAV_DESK_FONTS);
    await favShot(page, `favoris-${width}.png`);
    // Étape 4 : les recherches enregistrées sont déjà là, dans leur colonne, avec les favoris (rien à toucher, l'adresse
    // ne change pas) ; l'une sous l'autre, à 300 px de large.
    await page.waitForSelector('.favorites-searches .saved-search');
    await waitForSearchCounts(page, F);
    if (page.url() !== `${base}/favoris/`) problems.push(`${F} : adresse ${page.url()}`);
    expectSame(F, 'recherches à côté des favoris', [await page.locator('.fav-tab').count(), await page.locator('.favorites-search, .favorites-list').count()], [0, 2]);
    const searchLeft = favLayout.searches[0];
    expectSame(F, 'recherches', await page.$$eval('.favorites-searches .saved-search', (cards) => cards.map((card) => [card.querySelector('h3')?.textContent ?? null,
      card.querySelector('.saved-search-text p')?.textContent.replace(/\s+/g, ' ') ?? null, card.querySelector('.alerts-on, .alerts-off')?.textContent.trim() ?? null,
      Math.round(card.getBoundingClientRect().width), Math.round(card.getBoundingClientRect().left)])),
    [[ACCOUNT.saved_searches[0].name, 'Résidentiel · Lyon et alentours · Jusqu\'à 300 000 €', 'Alertes actives', 300, searchLeft],
      [ACCOUNT.saved_searches[1].name, 'Investir · Jusqu\'à 250 000 €', 'Alertes désactivées', 300, searchLeft]]);
    await favShot(page, `favoris-recherches-${width}.png`);
    await page.close();

    if (width === 1440) {
      const B = F;
      // Recherche dans les favoris (avec ses suggestions), catégories, tris et filtres : les cartes, leur ordre et le nombre.
      page = await open(favDesk, '/favoris/', `${B} recherche`);
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : recherche`);
      await page.fill('.favorites-field input', 'villeur');
      await waitForFavorites(page, [FAV_T2], '1 sur 4 biens', `${B} : « villeur »`);
      expectSame(B, 'suggestions de « villeur »', await page.$$eval('.favorites-suggestions button', (els) => els.map((el) => [...el.querySelectorAll('.favorites-suggestion-text > span')]
        .map((span) => span.textContent))), [['Villeurbanne', '69100 · Ville']]);
      await page.click('.favorites-suggestions button');
      expectSame(B, 'suggestion choisie', [await page.inputValue('.favorites-field input'), await page.locator('.favorites-suggestions').count()], ['Villeurbanne', 0]);
      await waitForFavorites(page, [FAV_T2], '1 sur 4 biens', `${B} : « Villeurbanne »`);
      await page.click('.favorites-clear');
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : recherche effacée`);
      for (const text of ['hôtel', 'HOTEL', '69007']) {
        await page.fill('.favorites-field input', text);
        await waitForFavorites(page, [text === '69007' ? FAV_STUDIO : FAV_HOTEL], '1 sur 4 biens', `${B} : « ${text} »`);
      }
      await page.fill('.favorites-field input', 'zzz');
      await page.waitForSelector('.favorites-wrap .account-empty');
      expectSame(B, 'aucun favori ne correspond', [await textOf(page, '.favorites-wrap .account-empty h2'), await textOf(page, '.favorites-wrap .account-empty p'), await textOf(page, '.favorites-wrap .account-empty button'),
        await textOf(page, '.favorites-total'), await page.locator('.missing-card').count()], ['Aucun favori ne correspond', 'Modifiez la recherche, la catégorie ou les filtres.', 'Tout afficher', '0 sur 4 biens', 0]);
      await page.click('.favorites-wrap .account-empty button');
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : « Tout afficher »`);
      if (await page.inputValue('.favorites-field input')) problems.push(`${B} : « Tout afficher » garde la recherche`);
      for (const [chip, titles] of [['Résidentiel', [FAV_FLAT]], ['Location', [FAV_STUDIO]], ['Investir', [FAV_T2]], ['Hôtels', [FAV_HOTEL]], ['Tous', FAV_ALL]]) {
        await page.locator('.favorites-categories .mode-tab', { hasText: chip }).click();
        await waitForFavorites(page, titles, titles.length === 4 ? '4 biens sauvegardés' : `${titles.length} sur 4 biens`, `${B} : catégorie ${chip}`);
        expectSame(B, `catégorie ${chip}`, await page.$$eval('.favorites-categories .mode-tab[aria-checked="true"]', (els) => els.map((el) => el.textContent.trim())), [chip]);
      }
      for (const [sort, short, titles] of [['priceAscending', 'Prix ↑', [FAV_STUDIO, FAV_T2, FAV_FLAT, FAV_HOTEL]], ['priceDescending', 'Prix ↓', [FAV_HOTEL, FAV_FLAT, FAV_T2, FAV_STUDIO]],
        ['recentlyAdded', 'Récents', [FAV_STUDIO, FAV_HOTEL, FAV_T2, FAV_FLAT]], ['relevance', 'Pertinence', FAV_ALL]]) {
        await page.selectOption('.favorites-sort select', sort);
        await waitForFavorites(page, titles, '4 biens sauvegardés', `${B} : tri ${sort}`);
        expectSame(B, `tri ${sort}`, await page.textContent('.favorites-sort > span'), short);
      }
      // Recherche, catégorie et tri ensemble : les favoris qui correspondent, dans l'ordre du tri.
      await page.selectOption('.favorites-sort select', 'priceDescending');
      await page.fill('.favorites-field input', 'lyon');
      await waitForFavorites(page, [FAV_FLAT, FAV_STUDIO], '2 sur 4 biens', `${B} : « lyon », prix décroissant`);
      // Les suggestions du champ couvrent les pavés, juste dessous : on quitte le champ avant de choisir la catégorie.
      await page.locator('.favorites-field input').blur();
      await page.waitForSelector('.favorites-suggestions', { state: 'detached', timeout: 4000 }).catch(() => problems.push(`${B} : les suggestions restent après avoir quitté le champ`));
      await page.locator('.favorites-categories .mode-tab', { hasText: 'Location' }).click();
      await waitForFavorites(page, [FAV_STUDIO], '1 sur 4 biens', `${B} : « lyon », Location`);
      await page.fill('.favorites-field input', '');
      await page.locator('.favorites-categories .mode-tab', { hasText: 'Tous' }).click();
      await page.selectOption('.favorites-sort select', 'relevance');
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : tout affiché`);
      // Filtres : ouverts sur la catégorie de la pastille (« Tous » : Résidentiel) ; appliqués aux favoris chargés.
      await page.click('.favorites-filters');
      await page.waitForSelector('dialog.filters-dialog[open]');
      expectSame(B, 'filtres : catégorie', await textOf(page, 'dialog[open] .mode-tab[aria-checked="true"]'), 'Résidentiel');
      await page.locator('dialog[open]').getByRole('group', { name: 'Pièces minimum et maximum' }).getByRole('button', { name: '3', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('dialog[open] .filters-apply .btn')?.textContent?.trim() === 'Afficher 1 bien', null, { timeout: 8000 })
        .catch(async () => problems.push(`${B} : filtres, bouton « ${await textOf(page, 'dialog[open] .filters-apply .btn')} » au lieu de « Afficher 1 bien »`));
      await page.click('dialog[open] .filters-apply .btn');
      await page.waitForSelector('dialog.filters-dialog', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${B} : les filtres restent ouverts`));
      await waitForFavorites(page, [FAV_FLAT], '1 sur 4 biens', `${B} : filtre « 3 pièces »`);
      expectSame(B, 'filtres appliqués', [await page.getAttribute('.favorites-filters', 'aria-label'), await textOf(page, '.favorites-filters-count'),
        await page.$$eval('.favorites-categories .mode-tab[aria-checked="true"]', (els) => els.map((el) => el.textContent.trim()))], ['Filtres, 1 actifs', '1', ['Résidentiel']]);
      await page.locator('.favorites-categories .mode-tab', { hasText: 'Tous' }).click();
      // « Tous » garde les filtres posés (FavoritesView : filteredIDs) : seuls les favoris qui y correspondent restent.
      await waitForFavorites(page, [FAV_FLAT], '1 sur 4 biens', `${B} : filtre gardé sur « Tous »`);
      await page.close();

      // Comparer : le bouton de chaque carte (CompareButton) ajoute ou retire, 3 biens au plus, avec le toast de l'app ;
      // le bouton rond remplit une comparaison vide avec les 3 premiers favoris dans l'ordre du tri (fillIfEmpty), puis
      // ouvre Comparer. Rien n'est envoyé au serveur.
      page = await open(favDesk, '/favoris/', `${B} comparer`);
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : comparer`);
      const compareWrites = writes.length;
      const favCard = (title) => page.locator('.favorite-card', { has: page.locator('.favorite-title', { hasText: title }) });
      const comparedIds = () => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('nidalo.comparer') ?? 'null'); } catch { return 'illisible'; } });
      // Étape 4 : sur ordinateur, le nombre de biens comparés est écrit sur le bouton (son nom), sans pastille.
      const roundButton = () => page.evaluate(() => [document.querySelector('.favorites-head .compare-button')?.textContent.trim() ?? null, document.querySelector('.favorites-head .compare-button-count')?.textContent ?? null]);
      const pressedCards = () => page.$$eval('.favorite-card', (cards) => cards.filter((card) => card.querySelector('.favorite-compare')?.getAttribute('aria-pressed') === 'true')
        .map((card) => card.querySelector('.favorite-title')?.textContent ?? null));
      await favCard(FAV_FLAT).locator('.favorite-compare').click();
      await waitForCompareNotice(page, { text: 'Ajouté à la comparaison', action: 'Voir' }, `${B} : ajout`);
      expectSame(B, 'après un ajout', [await comparedIds(), await roundButton(), await pressedCards(), await favCard(FAV_FLAT).locator('.favorite-compare').getAttribute('aria-label'),
        await page.getAttribute('.app-toast-action', 'aria-label'), page.url()],
      [{ ids: [favId(1)], referenceId: favId(1) }, ['Comparer, 1 bien', null], [FAV_FLAT], 'Retirer de la comparaison', 'Voir', `${base}/favoris/`]);
      await favCard(FAV_FLAT).locator('.favorite-compare').click();
      await waitForCompareNotice(page, { text: 'Retiré de la comparaison', action: null }, `${B} : retrait`);
      expectSame(B, 'après un retrait', [await comparedIds(), await roundButton(), await pressedCards()], [{ ids: [], referenceId: null }, ['Comparer vos favoris', null], []]);
      // Tous les favoris comptent, pas seulement la catégorie affichée (FavoritesView : sorted(listings)).
      await page.selectOption('.favorites-sort select', 'priceAscending');
      await page.locator('.favorites-categories .mode-tab', { hasText: 'Hôtels' }).click();
      await waitForFavorites(page, [FAV_HOTEL], '1 sur 4 biens', `${B} : Hôtels, prix croissant`);
      await page.click('.favorites-head .compare-button');
      await page.waitForURL(`${base}/comparer/`).catch(() => problems.push(`${B} : le bouton rond n'ouvre pas /comparer/ (${page.url()})`));
      expectSame(B, 'bouton rond, comparaison vide', await comparedIds(), { ids: [favId(2), favId(3), favId(1)], referenceId: favId(2) });
      await page.goto(`${base}/favoris/`, { waitUntil: 'networkidle' });
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : retour aux favoris`);
      expectSame(B, 'trois biens comparés', [await roundButton(), await pressedCards()], [['Comparer, 3 biens', null], [FAV_T2, FAV_FLAT, FAV_STUDIO]]);
      // Un quatrième : refusé, « 3 biens maximum, retirez-en un » avec « Gérer » ; la comparaison ne change pas.
      await favCard(FAV_HOTEL).locator('.favorite-compare').click();
      await waitForCompareNotice(page, { text: '3 biens maximum, retirez-en un', action: 'Gérer' }, `${B} : quatrième bien`);
      expectSame(B, 'quatrième bien', [await comparedIds(), await pressedCards(), await page.getAttribute('.app-toast-action', 'aria-label')],
        [{ ids: [favId(2), favId(3), favId(1)], referenceId: favId(2) }, [FAV_T2, FAV_FLAT, FAV_STUDIO], 'Gérer']);
      // « Gérer » ouvre Comparer, comme « Voir ».
      await page.click('.app-toast-action');
      await page.waitForURL(`${base}/comparer/`).catch(() => problems.push(`${B} : « Gérer » n'ouvre pas /comparer/ (${page.url()})`));
      await page.goto(`${base}/favoris/`, { waitUntil: 'networkidle' });
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : retour après « Gérer »`);
      // Retirer la référence la passe au premier qui reste ; l'hôtel a ensuite sa place.
      await favCard(FAV_STUDIO).locator('.favorite-compare').click();
      await waitForCompareNotice(page, { text: 'Retiré de la comparaison', action: null }, `${B} : retrait du studio`);
      await favCard(FAV_HOTEL).locator('.favorite-compare').click();
      await waitForCompareNotice(page, { text: 'Ajouté à la comparaison (3 biens)', action: 'Voir' }, `${B} : ajout de l'hôtel`);
      expectSame(B, 'comparaison changée', [await comparedIds(), await roundButton(), await pressedCards()],
        [{ ids: [favId(3), favId(1), favId(4)], referenceId: favId(3) }, ['Comparer, 3 biens', null], [FAV_T2, FAV_FLAT, FAV_HOTEL]]);
      // Comparaison commencée : le bouton rond l'ouvre telle quelle.
      await page.click('.favorites-head .compare-button');
      await page.waitForURL(`${base}/comparer/`).catch(() => problems.push(`${B} : le bouton rond n'ouvre pas /comparer/ (${page.url()})`));
      expectSame(B, 'bouton rond, comparaison commencée', await comparedIds(), { ids: [favId(3), favId(1), favId(4)], referenceId: favId(3) });
      if (writes.length !== compareWrites) problems.push(`${B} : la comparaison a écrit au serveur ${JSON.stringify(writes.slice(compareWrites))}`);
      await page.close();

      // Cœur et « Retirer » : retrait annulable (FavoritesStore.removeUndoably, demande du 17/11). La carte part tout de
      // suite, puis « Retiré des favoris » et « Annuler » (4 s) ; DELETE favorites?listing_id=eq.<id> ne part qu'à la fin
      // du message, au retrait suivant (le premier devient définitif) ou quand la page est cachée ; « Annuler » remet la
      // carte à sa place sans rien envoyer.
      page = await open(favDesk, '/favoris/', `${B} cœur`);
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : cœur`);
      let mark = writes.length;
      await favCard(FAV_FLAT).locator('.favorite-heart').click();
      await waitForFavorites(page, [FAV_T2, FAV_STUDIO, FAV_HOTEL], '3 biens sauvegardés', `${B} : après le cœur`);
      await waitForRemovalNotice(page, `${B} : cœur`);
      await page.waitForTimeout(2500);
      expectSame(B, 'cœur : rien d\'envoyé pendant le message', writes.slice(mark), []);
      await expectWrites(mark, [['DELETE', 'favorites', { listing_id: `eq.${favId(1)}` }, null]], `${B} : cœur, fin du message`);
      if (page.url() !== `${base}/favoris/`) problems.push(`${B} : le cœur a ouvert ${page.url()}`);
      // « Annuler » : le favori revient à sa place, rien ne part.
      mark = writes.length;
      await favCard(FAV_STUDIO).locator('.favorite-heart').click();
      await waitForFavorites(page, [FAV_T2, FAV_HOTEL], '2 biens sauvegardés', `${B} : retrait du studio`);
      await waitForRemovalNotice(page, `${B} : retrait du studio`);
      await page.click('.app-toast-action');
      await waitForFavorites(page, [FAV_T2, FAV_STUDIO, FAV_HOTEL], '3 biens sauvegardés', `${B} : « Annuler »`);
      await page.waitForSelector('.app-toast', { state: 'detached', timeout: 4000 }).catch(() => problems.push(`${B} : le message reste après « Annuler »`));
      expectSame(B, '« Annuler » : ordre « Ajout le plus récent »', await (async () => {
        await page.selectOption('.favorites-sort select', 'recentlyAdded');
        await page.waitForTimeout(200);
        const titles = await favoriteTitles(page);
        await page.selectOption('.favorites-sort select', 'relevance');
        return titles;
      })(), [FAV_STUDIO, FAV_HOTEL, FAV_T2]);
      await page.waitForTimeout(4500);
      expectSame(B, '« Annuler » : rien d\'envoyé', writes.slice(mark), []);
      // Deux retraits de suite : le premier part au second ; « Annuler » ne remet que le dernier.
      mark = writes.length;
      await favCard(FAV_STUDIO).locator('.favorite-heart').click();
      await waitForRemovalNotice(page, `${B} : premier de deux retraits`);
      await favCard(FAV_HOTEL).locator('.favorite-heart').click();
      await expectWrites(mark, [['DELETE', 'favorites', { listing_id: `eq.${favId(2)}` }, null]], `${B} : second retrait`);
      await waitForFavorites(page, [FAV_T2], '1 bien sauvegardé', `${B} : deux retraits`);
      await page.click('.app-toast-action');
      await waitForFavorites(page, [FAV_T2, FAV_HOTEL], '2 biens sauvegardés', `${B} : « Annuler » après deux retraits`);
      // « Retirer » d'une annonce plus disponible : même message ; page cachée : le retrait part tout de suite.
      mark = writes.length;
      await page.click('.missing-remove');
      await page.waitForSelector('.missing-card', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${B} : « Retirer » laisse l'annonce plus disponible`));
      await waitForRemovalNotice(page, `${B} : « Retirer »`);
      expectSame(B, '« Retirer » : rien d\'envoyé tout de suite', writes.slice(mark), []);
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expectWrites(mark, [['DELETE', 'favorites', { listing_id: `eq.${GONE_ID}` }, null]], `${B} : « Retirer », page cachée`);
      await page.waitForSelector('.app-toast', { state: 'detached', timeout: 4000 }).catch(() => problems.push(`${B} : le message reste quand la page est cachée`));
      expectSame(B, 'après les retraits', [await favoriteTitles(page), await textOf(page, '.favorites-total')], [[FAV_T2, FAV_HOTEL], '2 biens sauvegardés']);
      await page.close();
      {
        // Le serveur refuse le retrait : le favori revient à sa place (FavoritesStore.send → restore).
        const { context: refusing } = await favContext(width, height, FAV_LISTINGS, FAV_ACCOUNT, true, ['DELETE favorites']);
        page = await open(refusing, '/favoris/', `${B} retrait refusé`);
        await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : retrait refusé`);
        mark = writes.length;
        await page.locator('.favorite-card', { has: page.locator('.favorite-title', { hasText: FAV_FLAT }) }).locator('.favorite-heart').click();
        await waitForFavorites(page, [FAV_T2, FAV_STUDIO, FAV_HOTEL], '3 biens sauvegardés', `${B} : retrait refusé, carte partie`);
        await expectWrites(mark, [['DELETE', 'favorites', { listing_id: `eq.${favId(1)}` }, null]], `${B} : retrait refusé`);
        await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : retrait refusé, carte revenue`);
        await page.close();
        await refusing.close();
      }

      // Recherches enregistrées (la colonne de droite ; l'adresse de l'onglet du téléphone l'ouvre aussi) : les actions de
      // SavedSearchesView, envoyées comme l'app (AccountStore.save, deleteSearch, markSearchViewed) : nom, critères et
      // alertes ensemble, mise à jour par l'id.
      page = await open(favDesk, '/favoris/?onglet=recherches', `${B} recherches`);
      await page.waitForSelector('.favorites-searches .saved-search');
      await waitForSearchCounts(page, `${B} : recherches`);
      const [lyon, invest] = ACCOUNT.saved_searches;
      const searchCard = (n) => page.locator('.favorites-searches .saved-search').nth(n);
      const openMenu = async (n) => {
        await searchCard(n).locator('.round-menu').click();
        await searchCard(n).locator('.menu-popover').waitFor({ timeout: 8000 });
        return searchCard(n).locator('[role="menuitem"]').allTextContents();
      };
      const choose = (n, label) => searchCard(n).getByRole('menuitem', { name: label, exact: true }).click();
      const saved = (fields) => [['PATCH', 'saved_searches', { id: `eq.${lyon.id}`, select: SAVED_SELECT }, fields]];
      expectSame(B, 'menu d\'une recherche', await openMenu(0), ['Modifier les critères', 'Renommer', 'Désactiver les alertes', 'Supprimer']);
      mark = writes.length;
      await choose(0, 'Renommer');
      expectSame(B, 'renommer', [await dialogTitle(page), await page.inputValue('dialog[open] .dialog-field')], ['Renommer la recherche', lyon.name]);
      await page.fill('dialog[open] .dialog-field', 'Lyon centre');
      await page.locator('dialog[open]').getByRole('button', { name: 'Renommer', exact: true }).click();
      await expectWrites(mark, saved({ name: 'Lyon centre', query: lyon.query, alerts_enabled: true }), `${B} : renommer`);
      await page.waitForFunction(() => document.querySelector('.favorites-searches .saved-search h3')?.textContent === 'Lyon centre', null, { timeout: 8000 })
        .catch(() => problems.push(`${B} : le nouveau nom n'est pas affiché`));
      mark = writes.length;
      await openMenu(0);
      await choose(0, 'Désactiver les alertes');
      await expectWrites(mark, saved({ name: 'Lyon centre', query: lyon.query, alerts_enabled: false }), `${B} : désactiver les alertes`);
      await searchCard(0).locator('.alerts-off').waitFor({ timeout: 8000 }).catch(() => problems.push(`${B} : « Alertes désactivées » absent`));
      mark = writes.length;
      expectSame(B, 'menu, alertes désactivées', await openMenu(0), ['Modifier les critères', 'Renommer', 'Activer les alertes', 'Supprimer']);
      await choose(0, 'Activer les alertes');
      await expectWrites(mark, saved({ name: 'Lyon centre', query: lyon.query, alerts_enabled: true }), `${B} : activer les alertes`);
      await searchCard(0).locator('.alerts-on').waitFor({ timeout: 8000 }).catch(() => problems.push(`${B} : « Alertes actives » absent`));
      // Modifier les critères : la catégorie de la recherche est gardée ; la requête de l'app (SearchDraft.query(for:)).
      mark = writes.length;
      await openMenu(0);
      await choose(0, 'Modifier les critères');
      await page.waitForSelector('dialog.filters-dialog[open]');
      if (await page.locator('dialog[open] .mode-tab').count()) problems.push(`${B} : modifier les critères propose de changer de catégorie`);
      // Un seul appui sur la ligne des pièces : 3 pièces exactement (comme l'app), donc minimum et maximum à 3.
      await page.locator('dialog[open]').getByRole('group', { name: 'Pièces minimum et maximum' }).getByRole('button', { name: '3', exact: true }).click();
      await checkApplyButton(page, `${B} : modifier les critères`);
      await page.click('dialog[open] .filters-apply .btn');
      await expectWrites(mark, saved({ name: 'Lyon centre', query: { ...lyon.query, rooms: { min: 3, max: 3 }, excludesLeased: true }, alerts_enabled: true }), `${B} : modifier les critères`);
      // Supprimer, après confirmation : DELETE saved_searches?id=eq.<id>.
      expectSame(B, 'menu de la deuxième recherche', await openMenu(1), ['Modifier les critères', 'Renommer', 'Activer les alertes', 'Supprimer']);
      mark = writes.length;
      await choose(1, 'Supprimer');
      expectSame(B, 'supprimer', await dialogTitle(page), 'Supprimer cette recherche ?');
      await alertButton(page, `Supprimer « ${invest.name} »`);
      await expectWrites(mark, [['DELETE', 'saved_searches', { id: `eq.${invest.id}` }, null]], `${B} : supprimer`);
      await page.waitForFunction(() => document.querySelectorAll('.favorites-searches .saved-search').length === 1, null, { timeout: 8000 })
        .catch(() => problems.push(`${B} : la recherche supprimée reste affichée`));
      expectSame(B, 'après la suppression', [await textOf(page, '.favorites-column.is-searches .favorites-column-count'), await textOf(page, '.favorites-searches .saved-search h3')], ['1', 'Lyon centre']);
      // Voir les résultats : la recherche est vue (last_viewed_at), puis ses résultats s'ouvrent.
      mark = writes.length;
      await searchCard(0).locator('.run-button').click();
      await page.waitForURL((url) => url.pathname === '/recherche/', { timeout: 8000 }).catch(() => problems.push(`${B} : « Voir » n'ouvre pas la recherche (${page.url()})`));
      const viewed = writes.slice(mark);
      expectSame(B, 'recherche vue', viewed.map((write) => [write.method, write.table, Object.fromEntries(new URLSearchParams(write.search)), Object.keys(write.body ?? {})]),
        [['PATCH', 'saved_searches', { id: `eq.${lyon.id}` }, ['last_viewed_at']]]);
      if (Number.isNaN(Date.parse(viewed[0]?.body?.last_viewed_at ?? ''))) problems.push(`${B} : date de consultation « ${viewed[0]?.body?.last_viewed_at} »`);
      expectSame(B, 'résultats de la recherche', new URL(page.url()).searchParams.get('mode'), 'buy');
      await page.close();
    }
    await favDesk.close();
  }
  {
    // Aucun favori : l'état vide illustré de l'app (FavoritesEmptyState, demande du 17/11), sans recherche, filtres ni
    // catégories ; rien à comparer. Aucune recherche enregistrée : le même état, avec sa carte « 6 annonces ».
    const { context } = await favContext(1440, 900, FAV_LISTINGS, { favorites: [], saved_searches: [] });
    page = await open(context, '/favoris/', 'favoris vide');
    await page.waitForSelector('.favorites-wrap .fav-empty');
    expectSame('favoris vide', 'texte', [await textOf(page, '.favorites-wrap .fav-empty h2'), await textOf(page, '.favorites-wrap .fav-empty p'), await textOf(page, '.favorites-wrap .fav-empty a'),
      await page.getAttribute('.favorites-wrap .fav-empty a', 'href'), await page.isDisabled('.favorites-head .compare-button'), await page.locator('.favorites-toolbar, .favorites-search, .favorites-categories').count(),
      await page.locator('.favorites-wrap .fav-empty .fav-ghost').count(), await page.getAttribute('.favorites-wrap .fav-empty-drawing', 'aria-hidden')],
    ['Aucun favori pour l\'instant', 'Touchez le cœur d\'une annonce pour la retrouver ici et la comparer.', 'Rechercher un bien', '/recherche/', true, 0, 2, 'true']);
    // Étape 4 : pas d'onglets ; les deux titres de colonne, sans nombre quand il n'y a rien.
    expectSame('favoris vide', 'colonnes', [await page.locator('.fav-tab').count(), await page.$$eval('.favorites-column-title', (els) => els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()))],
      [0, ['Biens favoris', 'Recherches enregistrées']]);
    await favShot(page, 'favoris-vide-1440.png');
    await page.waitForSelector('.favorites-searches .fav-empty');
    expectSame('recherches vides', 'texte', [await textOf(page, '.favorites-searches .fav-empty h2'), await textOf(page, '.favorites-searches .fav-empty p'),
      await textOf(page, '.favorites-searches .fav-empty-search-count'), await textOf(page, '.favorites-searches .fav-empty-save'), await page.getAttribute('.favorites-searches .fav-empty a', 'href')],
    ['Aucune recherche enregistrée', 'Touchez Enregistrer sur une recherche pour la retrouver ici, avec ses nouveautés.', '6 annonces', 'Enregistrer', '/recherche/']);
    await favShot(page, 'favoris-recherches-vides-1440.png');
    await page.close();
    await context.close();
  }
  {
    // Sans compte : l'invitation à se connecter, sans rien demander des favoris ni des recherches.
    const { context, server: guestServer } = await favContext(1440, 900, FAV_LISTINGS, FAV_ACCOUNT, false);
    page = await open(context, '/favoris/', 'favoris sans compte');
    await page.waitForSelector('.signin-card');
    await checkSignInScreen(page, 'favoris sans compte');
    expectSame('favoris sans compte', 'page', [await page.locator('.favorites-list, .favorites-searches').count(), guestServer.requests.filter((request) => ['favorites', 'saved_searches'].includes(request.table)).length], [0, 0]);
    await page.close();
    await context.close();
  }
  {
    // À 1023 px : la page du téléphone, inchangée.
    const context = await browser.newContext({ viewport: { width: 1023, height: 768 }, locale: 'fr-FR' });
    await mock(context, { signedIn: true, listingRows: FAV_LISTINGS, account: FAV_ACCOUNT });
    page = await open(context, '/favoris/', 'favoris 1023');
    await page.waitForSelector('.favorite-card');
    expectSame('favoris 1023', 'page du téléphone', [await page.locator('.favorite-card').count(),
      await page.$eval('.favorites-list', (list) => getComputedStyle(list).gridTemplateColumns.split(' ').length)], [4, 2]);
    await page.close();
    await context.close();
  }

  // Mon compte sur ordinateur (étape 7e), à 1440 × 900 et 1024 × 768, avec le compte de test : l'écran du téléphone
  // (ProfileView.swift, MySpaceComponents.swift) dans la colonne de 720 px, avec son contenu et ses actions ; Mon agenda,
  // Ajouter une visite, Mon projet et Biens consultés, les écrans du téléphone dans la même colonne, avec ce qu'ils
  // envoient au serveur simulé, comparé à ce que l'app envoie. Horloge figée au vendredi 6 novembre 2026, 10 h 50 à
  // Paris ; champs de date et d'heure en français. Captures : 5-mon-espace-*.png.
  const spaceBrowser = await chromium.launch({ env: { ...process.env, LANG: 'fr_FR.UTF-8', LANGUAGE: 'fr_FR:fr', LC_ALL: 'fr_FR.UTF-8' } });
  try {
    const spaceContext = async (width, height, space, viewed = SPACE_VIEWED) => {
      const context = await spaceBrowser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
      await context.clock.setFixedTime(CHAT_NOW);
      const server = await mock(context, { signedIn: true, listingRows: SPACE_LISTING_ROWS });
      await mockSpace(context, space);
      // Biens consultés du compte (gardés dans ce navigateur, n° 114), posés une seule fois par onglet : « Retirer » et
      // « Vider » tiennent après un rechargement, chaque nouvel onglet repart de la même liste.
      await context.addInitScript(([ids, owner]) => {
        try {
          if (sessionStorage.getItem('verification.consultes') === null) {
            sessionStorage.setItem('verification.consultes', '1');
            localStorage.setItem(`nidalo.consultes.${owner}`, JSON.stringify(ids));
          }
        } catch { /* stockage indisponible */ }
      }, [viewed, USER_ID]);
      return { context, server };
    };
    /** Cartes « À venir » de Mon agenda sur ordinateur : le téléphone doit montrer les mêmes. */
    let desktopAgenda = null;

    // Projet Investissement, agenda libre, 2 recherches, 4 biens consultés, aucune annonce. Étape 6 (maquette 11) : le
    // conteneur commun centré (1136 px de contenu à 1440, 960 à 1024), sans l'ancien espace de l'ordinateur ; à gauche
    // la carte du profil (300 px) et « Mon dossier immobilier » dessous, 28 px avant les groupes ; les lignes de « Mon
    // espace » de l'app, sans sous-titre à zéro comme dans l'app, en cartes (3 par rangée à 1440, 2 à 1024) ; les mesures
    // et les tailles de la maquette.
    for (const [width, height] of [[1440, 900], [1024, 768]]) {
      const E = `Mon espace ${width}`;
      const space = spaceState({ project: structuredClone(SPACE_PROJECTS.invest), visits: [], requests: [], myListings: [] });
      const { context } = await spaceContext(width, height, space);
      page = await open(context, '/compte/', E);
      await page.waitForFunction(() => /Investissement/.test(document.querySelector('.app-space')?.innerText ?? '')
        && /2 recherches enregistrées/.test(document.querySelector('.app-space')?.innerText ?? ''), null, { timeout: 8000 })
        .catch(() => problems.push(`${E} : page incomplète`));
      expectSame(E, 'projet', await spaceProjectRow(page), ['Mon projet', SPACE_PROJECT_CARDS.invest[0], '/compte/?vue=projet']);
      expectSame(E, 'lignes de Mon espace (agenda libre, aucune annonce)', await spaceRows(page, 'Mon espace'),
        [['Mon agenda', null, '/compte/?vue=agenda'], ['Mes recherches', '2 recherches enregistrées', '/compte/?vue=recherches'],
          ['Biens consultés', '4 biens', '/compte/?vue=consultes'], ['Mon projet', 'Investissement', '/compte/?vue=projet'], ['Mes annonces', null, '/compte/?vue=annonces']]);
      const spaceLayout = await page.evaluate(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect();
        const wrap = box('.account-wrap');
        return {
          colonne: Math.round(wrap.width), centree: Math.abs(wrap.left + wrap.width / 2 - document.documentElement.clientWidth / 2) <= 1,
          contenu: Math.round(box('.app-space').width), ordinateur: document.querySelectorAll('.dsp, .dsp-aside, .dsp-nav').length,
          hauteurs: [...document.querySelector('.app-space .app-menu-group').querySelectorAll('.app-row')].map((row) => Math.round(row.getBoundingClientRect().height)),
          tuile: Math.round(box('.app-space-groups .app-row-tile').width), profil: Math.round(box('.space-profile').height), cloche: Math.round(box('.app-space-header .app-round').width),
          gauche: Math.round(box('.space-profile').width), ecart: Math.round(box('.app-space-groups').left - box('.space-profile').right),
          dossier: box('.space-dossier').left === box('.space-profile').left && box('.space-dossier').top > box('.space-profile').bottom,
          parRangee: (() => { const tops = [...document.querySelector('.app-space-groups .app-group').children].map((li) => Math.round(li.getBoundingClientRect().top)); return tops.filter((top) => top === tops[0]).length; })(),
          'Se déconnecter': Math.round(box('.logout-button').height), overflowX: document.documentElement.scrollWidth - innerWidth,
          // Le cadre de l'ordinateur (étape 0) : le pied de page fin, « Mon compte » en bleu dans l'en-tête.
          footer: Boolean(document.querySelector('footer.site-footer.is-slim')), current: document.querySelector('.site-header-account')?.getAttribute('aria-current') ?? null,
        };
      });
      // La cloche ronde du titre est masquée (0) : celle de l'en-tête y mène.
      expectSame(E, 'mise en page', spaceLayout, { colonne: width === 1440 ? 1200 : 1024, centree: true, contenu: width === 1440 ? 1136 : 960, ordinateur: 0,
        hauteurs: width === 1440 ? [100, 100, 100, 79, 79] : [79, 79, 79, 79, 78], tuile: 44, profil: 184, cloche: 0, 'Se déconnecter': 46, overflowX: 0, footer: true,
        current: 'page', gauche: 300, ecart: 28, dossier: true, parRangee: width === 1440 ? 3 : 2 });
      // Tailles de la maquette (titre 34/800, nom 18/700, petits titres 13/700, cartes : titre 16/600, sous-titre 14/400,
      // « Se déconnecter » 15/600, « Supprimer mon compte » 14/400) ; police Inter partout, boutons compris.
      const spaceFonts = await page.evaluate(() => {
        const font = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const style = getComputedStyle(element);
          return `${style.fontSize} ${style.fontWeight}${style.fontFamily.startsWith('"Nidalo Inter"') ? '' : ` ${style.fontFamily}`}`;
        };
        return {
          titre: font('.app-space-header h1'), nom: font('.space-profile-name'), section: font('.app-space .app-section-label'), ligne: font('.app-space-groups .app-row-title'),
          'sous-titre': font('.app-row-subtitle'), 'Se déconnecter': font('.logout-button'), 'Supprimer mon compte': font('.delete-account-link'),
        };
      });
      expectSame(E, 'polices', spaceFonts, {
        titre: '34px 800', nom: '18px 700', section: '13px 700', ligne: '16px 600', 'sous-titre': '14px 400', 'Se déconnecter': '15px 600',
        'Supprimer mon compte': '14px 400',
      });
      await favShot(page, `5-mon-espace-${width}.png`);
      await page.close();
      await context.close();
    }

    // Contenu et actions de l'app, à 1440 px, comme sur téléphone : projet Résidentiel, agenda de quatre visites et d'une
    // demande, conversation avec l'agence, une annonce en ligne et un brouillon.
    {
      const E = 'Mon espace';
      const space = spaceState({ conversations: SPACE_CONVERSATIONS });
      const { context } = await spaceContext(1440, 900, space);
      page = await open(context, '/compte/', E);
      await page.waitForFunction(() => /3 visites à venir/.test(document.querySelector('.app-space')?.innerText ?? '')
        && /1 en ligne/.test(document.querySelector('.app-space')?.innerText ?? '')
        && /Résidence principale · Lyon/.test(document.querySelector('.app-space')?.innerText ?? ''), null, { timeout: 8000 })
        .catch(() => problems.push(`${E} : page incomplète`));
      // Grand titre et cloche, carte du profil (initiale sans photo), puis les groupes dans l'ordre de l'app.
      expectSame(E, 'en-tête et profil', [await textOf(page, '.app-space-header h1'), await page.getAttribute('.app-space-header .app-round', 'href'),
        await textOf(page, '.space-profile-name'), await textOf(page, '.space-profile-line'), await page.getAttribute('.space-profile', 'href'),
        await textOf(page, '.space-profile-badge'), await textOf(page, '.space-profile-photo')],
      ['Mon espace', '/compte/?vue=notifications', 'Claire Martin', USER_EMAIL, '/compte/?vue=informations', 'Particulier', 'C']);
      expectSame(E, 'groupes', await textsOf(page, '.app-space .app-menu-group .app-section-label'),
        ['Mon espace', 'Contrats et location', 'Compte et sécurité', 'Paramètres et assistance']);
      expectSame(E, 'projet', await spaceProjectRow(page), ['Mon projet', SPACE_PROJECT_CARDS.buy[0], '/compte/?vue=projet']);
      // Mon espace, les lignes de l'app : trois visites à venir (la demande comprise), une annonce en ligne (le brouillon
      // n'est pas compté, comme dans l'app).
      expectSame(E, 'lignes de Mon espace', await spaceRows(page, 'Mon espace'),
        [['Mon agenda', '3 visites à venir', '/compte/?vue=agenda'], ['Mes recherches', '2 recherches enregistrées', '/compte/?vue=recherches'],
          ['Biens consultés', '4 biens', '/compte/?vue=consultes'], ['Mon projet', 'Résidence principale · Lyon', '/compte/?vue=projet'],
          ['Mes annonces', '1 en ligne', '/compte/?vue=annonces']]);
      expectSame(E, 'icônes et teintes', await spaceGroup(page, 'Mon espace').locator('.app-row-tile').evaluateAll((tiles) => tiles.map((tile) => tile.className)),
        ['app-row-tile is-blue', 'app-row-tile is-blue', 'app-row-tile is-blue', 'app-row-tile is-green', 'app-row-tile is-blue']);
      // Contrats et location : les lignes de l'app (le titre seul), chacune vers l'écran « bientôt » du site ; les
      // documents restent dans l'app.
      const soon = (key) => `/compte/?vue=bientot&ecran=${key}`;
      const contracts = [['Mon bail de location', 'bail'], ['Quittances de loyer', 'quittances'], ['États des lieux', 'etats'], ['Offres et compromis', 'offres'],
        ['Documents à signer', 'signature'], ['Mon dossier immobilier', 'dossier']];
      // Sur ordinateur (étape 6, maquette 11), « Mon dossier immobilier » est la carte de la colonne de gauche, sous le
      // profil : la même ligne (titre, icône, teinte) et le même lien, une seule fois dans la page.
      expectSame(E, 'contrats et location', await spaceRows(page, 'Contrats et location'), contracts.slice(0, -1).map(([title, key]) => [title, null, soon(key)]));
      expectSame(E, 'carte du dossier', await page.$$eval('.app-space a.app-row', (rows) => rows.filter((row) => row.textContent.includes('Mon dossier immobilier'))
        .map((row) => [row.closest('.space-dossier') !== null, row.querySelector('.app-row-title')?.textContent ?? null, row.getAttribute('href'), row.querySelector('.app-row-tile')?.className ?? null])),
      [[true, 'Mon dossier immobilier', soon('dossier'), 'app-row-tile is-teal']]);
      expectSame(E, 'compte et sécurité', await spaceRows(page, 'Compte et sécurité'),
        [['Connexion et sécurité', null, '/compte/?vue=securite'], ['Confidentialité et données', null, '/compte/?vue=confidentialite'],
          ['Type de compte', 'Particulier', '/compte/?vue=type']]);
      // Dans l'ordre de l'app : la cloche de l'en-tête remplace la ligne « Notifications », « Alertes sur cet iPhone »
      // reste dans l'app.
      expectSame(E, 'paramètres et assistance', await spaceRows(page, 'Paramètres et assistance'),
        [['Préférences', null, '/compte/?vue=preferences'], ['Aide et assistance', null, '/compte/?vue=aide'], ['Informations légales', null, '/compte/?vue=legal']]);
      expectSame(E, 'bas de la page', [await textOf(page, '.logout-button'), await textOf(page, '.delete-account-link'), await page.getAttribute('.delete-account-link', 'href')],
        ['Se déconnecter', 'Supprimer mon compte', '/compte/?vue=supprimer']);
      // Ce que l'app garde : l'écran « bientôt » de chaque ligne, sans rien envoyer.
      let mark = writes.length;
      const spaceMark = space.calls.length;
      for (const [title, key] of contracts) {
        await (key === 'dossier' ? page.locator('.space-dossier .app-row') : spaceGroup(page, 'Contrats et location').locator('.app-row', { hasText: title })).click();
        await page.waitForURL(`${base}${soon(key)}`, { timeout: 8000 }).catch(() => problems.push(`${E} : « ${title} » ouvre ${page.url()}`));
        await page.waitForSelector('.soon-state', { timeout: 8000 }).catch(() => undefined);
        expectSame(E, `écran « bientôt » de ${title}`, [await textOf(page, '.screen-header h1'), await textOf(page, '.soon-state h2')], [title, title]);
        await page.goBack({ waitUntil: 'networkidle' });
        await page.waitForSelector('.app-space .app-row');
      }
      // Type de compte : sa page, puis la confirmation de l'app (sans fiche agence, « Passer en professionnel » mène au
      // formulaire de l'agence) ; « Annuler » ne change rien.
      await spaceGroup(page, 'Compte et sécurité').locator('.app-row', { hasText: 'Type de compte' }).click();
      await page.waitForURL(`${base}/compte/?vue=type`, { timeout: 8000 }).catch(() => problems.push(`${E} : « Type de compte » ouvre ${page.url()}`));
      await page.click('.menu-page-button');
      expectSame(E, 'type de compte', [await dialogTitle(page), await textOf(page, 'dialog.alert-dialog[open] .alert-body p'),
        await page.$$eval('dialog.alert-dialog[open] .alert-actions > *', (actions) => actions.map((action) => [action.textContent, action.getAttribute('href')]))],
      ['Passer en professionnel ?', 'Vous pourrez revenir en arrière à tout moment depuis Type de compte.',
        [['Passer en professionnel', '/compte/?vue=agence&ecran=modifier'], ['Annuler', null]]]);
      await alertButton(page, 'Annuler');
      await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${E} : la fenêtre du type de compte reste ouverte`));
      if (writes.length !== mark || space.calls.slice(spaceMark).some((call) => call.method !== 'GET' && !call.table.startsWith('rpc/'))) {
        problems.push(`${E} : écriture envoyée par un écran « bientôt » ou Type de compte (${JSON.stringify(writes.slice(mark))})`);
      }
      await page.goto(`${base}/compte/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.app-space .app-row');

      // Projet de chaque sorte : le sous-titre de la ligne « Mon projet » (usage ou catégorie, puis ville) ; sans projet,
      // celui par défaut de l'app.
      for (const kind of ['invest', 'rent', 'hotel', 'none', 'buy']) {
        space.project = kind === 'none' ? null : structuredClone(SPACE_PROJECTS[kind]);
        await page.reload({ waitUntil: 'networkidle' });
        const [subtitle] = SPACE_PROJECT_CARDS[kind];
        await page.waitForFunction((wanted) => [...document.querySelectorAll('.app-space .app-row-subtitle')].some((line) => line.textContent === wanted), subtitle,
          { timeout: 8000 }).catch(() => undefined);
        await page.waitForTimeout(200);
        expectSame(E, `projet ${kind}`, await spaceProjectRow(page), ['Mon projet', subtitle, '/compte/?vue=projet']);
      }

      // « Mon agenda » ouvre Mon agenda.
      await page.click('.app-space a.app-row[href="/compte/?vue=agenda"]');
      await page.waitForURL(`${base}/compte/?vue=agenda`, { timeout: 8000 }).catch(() => problems.push(`${E} : « Mon agenda » ouvre ${page.url()}`));
      await page.waitForSelector('.app-agenda .app-visit', { timeout: 8000 }).catch(() => problems.push(`${E} : Mon agenda ne s'affiche pas`));

      // Mon agenda, l'écran du téléphone dans la colonne (688 de contenu) : retour rond, « + », grand titre, onglets de
      // l'app dans l'ordre de l'app avec leur nombre, cartes de l'app groupées par période, Itinéraire vers Plans ; les
      // mesures du téléphone.
      const A = 'Mon agenda';
      const addVisitPath = '/compte/?vue=ajouter-visite&depuis=agenda';
      expectSame(A, 'en-tête', [await page.getAttribute('.app-agenda-top .app-round', 'href'), await page.getAttribute('.app-agenda-top .app-round', 'aria-label'),
        await textOf(page, '.app-agenda-header h1'), await textOf(page, '.app-agenda-header p'), await page.getAttribute('.app-agenda-top .app-agenda-plus', 'href'),
        await page.getAttribute('.app-agenda-top .app-agenda-plus', 'aria-label'), await textOf(page, '.app-agenda-add-link'), await page.getAttribute('.app-agenda-add-link', 'href')],
      ['/compte/', 'Retour', 'Agenda des visites', 'Toutes vos visites à venir et passées.', addVisitPath, 'Ajouter une visite', 'Ajouter une visite manuellement', addVisitPath]);
      expectSame(A, 'colonne et mesures', await page.evaluate(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect();
        const style = (selector) => getComputedStyle(document.querySelector(selector));
        const cards = [...document.querySelectorAll('.app-visit')].map((card) => card.getBoundingClientRect());
        return [Math.round(box('.app-agenda').width), Math.round(box('.app-agenda-top .app-round').width), Math.round(box('.app-agenda-plus-circle').width),
          style('.app-agenda-header h1').fontSize, Math.round(box('.app-agenda-tabs').height), Math.round(box('.app-agenda-tab').height),
          [Math.round(box('.app-visit-date').width), Math.round(box('.app-visit-date').height)], style('.app-visit').borderRadius, Math.round(box('.app-visit-button').height),
          Math.round(cards[1].top - cards[0].bottom)];
      }), [688, 44, 42, '30px', 46, 38, [52, 60], '22px', 38, 12]);
      const agendaTabs = () => page.$$eval('.app-agenda-tab', (tabs) => tabs.map((tab) => [tab.querySelector('.app-agenda-tab-title')?.textContent ?? null,
        tab.querySelector('.app-agenda-tab-count')?.textContent ?? null, tab.getAttribute('aria-selected'), tab.getAttribute('aria-label')]));
      expectSame(A, 'onglets', await agendaTabs(), [['À venir', '3', 'true', 'À venir, 3'], ['Passées', '1', 'false', 'Passées, 1'], ['Annulées', '1', 'false', 'Annulées, 1']]);
      const plans = (address) => `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`;
      const card = (fields) => ({ cancelled: false, route: null, request: null, slots: null, contact: true, menu: true, ...fields });
      const requestPath = `/compte/?vue=demande-visite&id=${SPACE_REQUEST_ID}`;
      expectSame(A, 'À venir', await agendaCards(page), [
        ['Cette semaine', [
          card({ block: 'VEN 6 NOV', date: 'Vendredi 6 novembre · 14h30', time: '14 h 30 – 15 h 15', status: 'Confirmée', tones: ['blue', 'green'],
            title: 'Appartement lumineux avec balcon · Lyon 3e', lines: ['Avec Agence du Parc'], route: plans('Lyon 3e (69003)') }),
          card({ block: 'LUN 9 NOV', date: 'Lundi 9 novembre · 9h00', time: '9 h 00 – 9 h 30', status: 'En attente', tones: ['amber', 'amber'],
            title: 'Studio meublé · Lyon 7e', lines: ['Avec Julien Moreau'], route: plans('12 Rue de test, 69007 Lyon 7e') }),
          // Demande envoyée à trois créneaux, pas encore acceptée : « Voir les créneaux » et la carte ouvrent l'écran « Demande
          // de visite », qui réunit ses actions (pas de menu « … »).
          card({ block: 'MAR 10 NOV', date: 'Mardi 10 novembre · 10h00', time: '3 créneaux proposés', status: 'En attente', tones: ['amber', 'amber'],
            title: 'T2 vendu loué près du métro · Villeurbanne', lines: ['Avec Marc Petit · en attente de sa réponse'], request: requestPath, slots: requestPath,
            menu: false }),
        ]],
      ]);
      desktopAgenda = await agendaCards(page);
      expectSame(A, 'lien Itinéraire', await page.$eval('.app-visit a.app-visit-route', (link) => [link.textContent, link.getAttribute('target'), link.getAttribute('rel')]),
        ['Itinéraire', '_blank', 'noopener noreferrer']);
      // Menu « … » d'une visite à venir : les actions de l'app, toutes dans l'app iPhone.
      const visitMenu = async (index) => {
        await page.locator('.app-visit').nth(index).locator('.dsc-menu-button').click();
        await page.waitForSelector('.dsc-menu-list');
        return textsOf(page, '.dsc-menu-list [role="menuitem"]');
      };
      expectSame(A, 'menu d\'une visite à venir', await visitMenu(0),
        ['Modifier la visite', 'Reprogrammer', 'Ajouter une note', 'Ajouter à mon calendrier', 'Annuler la visite', 'Supprimer']);
      // Comme sur téléphone : le menu entier dans la fenêtre (la page défile juste assez), sous l'en-tête de l'ordinateur et
      // sans barre d'onglets dessous (version ordinateur, étape 0).
      await page.waitForTimeout(300);
      expectSame(A, 'menu « … » entier dans la fenêtre, sous l\'en-tête', await page.evaluate(() => {
        const menu = document.querySelector('.dsc-menu-list').getBoundingClientRect();
        return menu.top >= document.querySelector('.site-header').getBoundingClientRect().bottom && menu.bottom <= innerHeight && !document.querySelector('.tabbar');
      }), true);
      // « Ajouter à mon calendrier » : sur le site, le fichier .ics de la visite (événement de l'app : « Visite : <bien> »,
      // début et fin, adresse), que le calendrier de l'appareil ouvre.
      const calendarDownload = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
      await page.locator('.dsc-menu-list').getByRole('menuitem', { name: 'Ajouter à mon calendrier', exact: true }).click();
      const calendarFile = await calendarDownload;
      const calendarLines = calendarFile
        ? (await readFile(await calendarFile.path(), 'utf8')).split('\r\n').filter((line) => /^(BEGIN|UID|DTSTART|DTEND|SUMMARY|LOCATION|END):/.test(line))
        : null;
      expectSame(A, 'fichier du calendrier', [calendarFile?.suggestedFilename() ?? null, calendarLines], ['visite.ics', ['BEGIN:VCALENDAR', 'BEGIN:VEVENT',
        `UID:${spaceVisitId(1).toLowerCase()}@nidalo.fr`, 'DTSTART:20261106T133000Z', 'DTEND:20261106T141500Z', 'SUMMARY:Visite : Appartement lumineux avec balcon',
        'LOCATION:Lyon 3e (69003)', 'END:VEVENT', 'END:VCALENDAR']]);
      // Message : la conversation liée à la visite.
      await page.route(new RegExp(`^${base}/messages/`), (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Messages</title>' }));
      await page.locator('.app-visit').nth(0).getByRole('button', { name: 'Message' }).click();
      await page.waitForURL(`${base}/messages/?c=E0000000-0000-4000-8000-000000000001`, { timeout: 8000 })
        .catch(() => problems.push(`${A} : « Message » ouvre ${page.url()} au lieu de la conversation liée`));
      await page.goBack({ waitUntil: 'networkidle' });
      await page.waitForSelector('.app-visit');
      await favShot(page, '5-mon-espace-agenda-1440.png');
      await page.click('.app-agenda-tab >> nth=1');
      expectSame(A, 'Passées', await agendaCards(page), [
        ['Ce mois-ci', [card({ block: 'LUN 2 NOV', date: 'Lundi 2 novembre · 15h00', time: '15 h 00 – 16 h 00', status: 'Terminée', tones: ['blue', 'gray'],
          title: 'T2 vendu loué près du métro · Villeurbanne', lines: ['Avec Camille Roux', 'Intéressant · À revoir'], route: plans('Villeurbanne (69100)') })]],
      ]);
      expectSame(A, 'menu d\'une visite terminée', await visitMenu(0), ['Ajouter une note', 'Ajouter à mon calendrier', 'Supprimer']);
      await page.keyboard.press('Escape');
      await page.click('.app-agenda-tab >> nth=2');
      expectSame(A, 'Annulées', await agendaCards(page), [
        ['Ce mois-ci', [card({ block: 'MER 4 NOV', date: 'Mercredi 4 novembre · 17h00', time: '17 h 00 – 17 h 45', cancelled: true, status: 'Annulée',
          tones: ['gray', 'red'], title: 'T2 vendu loué près du métro · Villeurbanne', lines: ['Avec Camille Roux'] })]],
      ]);
      expectSame(A, 'onglet choisi', (await agendaTabs()).map((tab) => tab.slice(0, 3)), [['À venir', '3', 'false'], ['Passées', '1', 'false'], ['Annulées', '1', 'true']]);
      expectSame(A, 'menu d\'une visite annulée', await visitMenu(0), ['Reprogrammer', 'Ajouter une note', 'Ajouter à mon calendrier', 'Supprimer']);
      await page.keyboard.press('Escape');
      // Sans adresse : l'avis de l'app au lieu de l'itinéraire.
      await page.locator('.app-visit').nth(0).getByRole('button', { name: 'Itinéraire' }).click();
      expectSame(A, 'itinéraire sans adresse', await noticeText(page, A), 'Adresse non renseignée : l\'itinéraire sera disponible quand le vendeur l\'aura communiquée.');
      const agendaReads = space.calls.filter((call) => call.path === '/compte/' && ['agenda_visits', 'rpc/my_visit_requests'].includes(call.table));
      expectSame(A, 'lectures de l\'agenda', [...new Set(agendaReads.map((call) => `${call.method} ${call.table} ${call.search}`))].sort(),
        ['GET agenda_visits ?select=id,start_at,status,request_id,listing_id,visit', 'POST rpc/my_visit_requests ']);
      // Agence de chaque bien visité (retouche de l'app 7452fd9) : la fiche de chaque annonce, lue une fois, puis les
      // profils publics de leurs auteurs, comme « Ajouter une visite ».
      const agencyReads = space.calls.filter((call) => call.path === '/compte/' && (call.table === 'rpc/public_profiles' || (call.table === 'listings' && call.search.includes('id=eq.'))));
      expectSame(A, 'lectures des agences', [...new Set(agencyReads.map((call) => `${call.method} ${call.table} ${call.table === 'listings' ? call.search : JSON.stringify(call.body)}`))].sort(),
        [...[0, 1, 2].map((n) => `GET listings ?select=id,owner_id,city,postal_code,location_precision,public_street&id=eq.${listings[n].id}&limit=1`),
          `POST rpc/public_profiles ${JSON.stringify({ user_ids: [0, 1, 2].map((n) => listings[n].owner_id.toUpperCase()) })}`].sort());
      // « Avec <personne> · <agence> » : une personne de l'agence qui publie le bien ; le nom de l'agence seul quand c'est
      // aussi le contact (plus haut).
      space.visits[0].visit.contactName = 'Camille Roux';
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.querySelector('.app-visit .app-visit-person')?.textContent.includes('Agence du Parc'), null, { timeout: 8000 }).catch(() => undefined);
      expectSame(A, 'personne et agence', (await agendaCards(page))[0]?.[1][0]?.lines ?? null, ['Avec Camille Roux · Agence du Parc']);
      space.visits[0].visit.contactName = 'Agence du Parc';
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.app-visit');

      // Détail d'une visite (VisitDetailView, étape 3) : toute la carte d'une visite enregistrée l'ouvre (&visite=…), pas
      // celle d'une demande ; photo, état, titre, ville et prix, informations, puis les actions de l'app. « Partager la
      // visite » donne le texte de l'app ; Modifier reste dans l'app iPhone ; Annuler réécrit la ligne avec le statut
      // « cancelled » (VisitStore.cancel) ; Supprimer retire les photos du compte rendu puis la ligne (VisitStore.delete)
      // et ramène à l'agenda. Une visite absente : « Visite supprimée ».
      {
        const D = 'Détail de la visite';
        const detailPath = (n) => `/compte/?vue=agenda&visite=${spaceVisitId(n)}`;
        expectSame(D, 'liens des cartes À venir', await page.$$eval('.app-visit', (cards) => cards.map((card) => card.querySelector('a.app-visit-detail')?.getAttribute('href') ?? null)),
          [detailPath(1), detailPath(2), null]);
        const detail = () => page.evaluate(() => {
          const text = (element) => (element ? element.textContent.replace(/\s+/g, ' ').trim() : null);
          return [text(document.querySelector('.app-page-header-title')), text(document.querySelector('.app-detail-badge')), text(document.querySelector('.app-detail-title')),
            text(document.querySelector('.app-detail-place')),
            [...document.querySelectorAll('.app-detail-row')].map((row) => `${text(row.querySelector('.app-detail-row-title'))} : ${text(row.querySelector('.app-detail-row-value'))}`),
            [...document.querySelectorAll('.app-detail-button')].map(text)];
        });
        const dialogTexts = async () => [await dialogTitle(page), await textOf(page, 'dialog.alert-dialog[open] .alert-body p'),
          await page.$$eval('dialog.alert-dialog[open] button', (buttons) => buttons.map((button) => button.textContent.trim()).filter(Boolean))];
        await page.locator('.app-visit').nth(0).locator('a.app-visit-detail').click();
        await page.waitForURL(`${base}${detailPath(1)}`, { timeout: 8000 }).catch(() => problems.push(`${D} : la carte ouvre ${page.url()}`));
        await page.waitForSelector('.app-detail-title', { timeout: 8000 }).catch(() => problems.push(`${D} : le détail ne s'affiche pas`));
        expectSame(D, 'visite à venir', await detail(), ['Détail de la visite', 'Visite confirmée', 'Appartement lumineux avec balcon', 'Lyon 3e · 238 000 €',
          ['Date : Vendredi 6 novembre · 14h30 · 45 min', 'Adresse : Lyon 3e (69003)', 'Contact : Agence du Parc'],
          ['Itinéraire', 'Contacter', 'Partager la visite', 'Ajouter à mon calendrier', 'Modifier ou reprogrammer', 'Annuler la visite', 'Supprimer']]);
        await favShot(page, '5-mon-espace-visite-1440.png');
        await page.evaluate(() => {
          window.sharedVisits = [];
          Object.defineProperty(navigator, 'share', { configurable: true, value: async (data) => { window.sharedVisits.push(data); } });
        });
        await page.getByRole('button', { name: 'Partager la visite', exact: true }).click();
        await page.waitForFunction(() => window.sharedVisits.length > 0, null, { timeout: 4000 }).catch(() => undefined);
        expectSame(D, 'texte partagé', await page.evaluate(() => window.sharedVisits), [{
          text: 'Visite : Appartement lumineux avec balcon\nVendredi 6 novembre · 14h30 (45 min)\nAdresse : Lyon 3e (69003)\nContact : Agence du Parc' }]);
        await page.getByRole('button', { name: 'Modifier ou reprogrammer', exact: true }).click();
        await iphoneOnly(page, D, 'Modifier ou reprogrammer');
        const cancelMark = space.calls.length;
        await page.getByRole('button', { name: 'Annuler la visite', exact: true }).click();
        expectSame(D, 'confirmation de l\'annulation', await dialogTexts(),
          ['Annuler cette visite ?', 'Vendredi 6 novembre · 14h30 avec Agence du Parc.', ['Annuler la visite', 'Garder la visite']]);
        await alertButton(page, 'Annuler la visite');
        const cancelled = await oneSpaceCall(space, 'agenda_visits', 'PATCH', cancelMark, `${D} : annulation`);
        expectSame(D, 'ligne annulée [filtre, début, statut, demande envoyée, annonce, statut de la visite, sa date]', [cancelled?.search ?? null,
          cancelled?.body?.start_at ?? null, cancelled?.body?.status ?? null, Boolean(cancelled?.body && 'request_id' in cancelled.body), cancelled?.body?.listing_id ?? null,
          cancelled?.body?.visit?.status ?? null, cancelled?.body?.visit?.start ?? null],
        [`?id=eq.${spaceVisitId(1).toLowerCase()}`, '2026-11-06T13:30:00.000', 'cancelled', false, SPACE_L1.listingId, 'cancelled', '2026-11-06T13:30:00.000']);
        await page.waitForFunction(() => document.querySelector('.app-detail-badge')?.textContent.includes('Annulée'), null, { timeout: 8000 }).catch(() => undefined);
        expectSame(D, 'après l\'annulation [état, boutons]', (await detail()).filter((_, index) => index === 1 || index === 5),
          ['Annulée', ['Itinéraire', 'Contacter', 'Partager la visite', 'Ajouter à mon calendrier', 'Reprogrammer', 'Supprimer']]);
        space.reportFiles = [{ name: 'photo-1.jpg' }];
        const deleteMark = space.calls.length;
        await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
        expectSame(D, 'confirmation de la suppression', await dialogTexts(), ['Supprimer cette visite ?', 'Elle disparaîtra définitivement de votre agenda.', ['Supprimer', 'Garder']]);
        await alertButton(page, 'Supprimer');
        const removed = await oneSpaceCall(space, 'agenda_visits', 'DELETE', deleteMark, `${D} : suppression`);
        const folder = `${USER_ID.toLowerCase()}/${spaceVisitId(1).toLowerCase()}`;
        expectSame(D, 'suppression [photos du compte rendu, ligne]', [space.calls.slice(deleteMark).filter((call) => call.table.startsWith('storage '))
          .map((call) => `${call.method} ${call.table} ${JSON.stringify(call.body?.prefix ?? call.body?.prefixes ?? null)}`), removed?.search ?? null],
        [[`POST storage list/visit-reports "${folder}"`, `DELETE storage visit-reports ["${folder}/photo-1.jpg"]`], `?id=eq.${spaceVisitId(1).toLowerCase()}`]);
        await page.waitForURL(`${base}/compte/?vue=agenda`, { timeout: 8000 }).catch(() => problems.push(`${D} : après la suppression, ${page.url()} au lieu de Mon agenda`));
        await page.goto(`${base}/compte/?vue=agenda&visite=D0000000-0000-4000-8000-000000000009`, { waitUntil: 'networkidle' });
        await page.waitForSelector('.app-detail .app-unavailable', { timeout: 8000 }).catch(() => undefined);
        expectSame(D, 'visite absente', [await textOf(page, '.app-detail .app-unavailable h2'), await textOf(page, '.app-detail .app-unavailable p')],
          ['Visite supprimée', 'Cette visite n\'est plus dans votre agenda.']);
        space.visits = structuredClone(SPACE_VISITS);
        space.reportFiles = null;
        await page.goto(`${base}/compte/?vue=agenda`, { waitUntil: 'networkidle' });
        await page.waitForSelector('.app-visit');
      }

      // Créneaux ouverts (VisitSessionStore.upcoming, n° 13) : les séances ouvertes et pas finies du compte, la plus proche
      // d'abord, en tête des visites à venir (my_visit_sessions sans paramètre, comme l'app) ; leur page reste dans l'app
      // iPhone. Demande reçue (n° 11) : « Message » ouvre la conversation déjà ouverte sur l'annonce avec le demandeur,
      // la plus récente, sans en créer ; aucune : l'avis de l'app.
      {
        const saved = { requests: space.requests, conversations: space.conversations };
        space.sessions = structuredClone(SPACE_SESSIONS);
        space.requests = [...structuredClone(SPACE_REQUESTS), structuredClone(SPACE_RECEIVED_REQUEST)];
        space.conversations = [...SPACE_CONVERSATIONS, ...SPACE_HOUSE_CONVERSATIONS];
        const before = space.calls.length;
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForSelector('.app-session', { timeout: 8000 }).catch(() => problems.push(`${A} : « Créneaux ouverts » ne s'affiche pas`));
        expectSame(A, 'lecture des créneaux ouverts', spaceCalls(space, 'rpc/my_visit_sessions', 'POST', before).map((call) => call.body), [{}]);
        expectSame(A, 'créneaux ouverts', [
          await page.$$eval('.app-agenda-list > section', (sections) => sections.map((section) => section.getAttribute('aria-label')).slice(0, 1)),
          await page.$$eval('.app-session-group .app-section-label', (labels) => labels.map((label) => label.textContent)),
          await page.$$eval('.app-session', (cards) => cards.map((card) => [card.querySelector('.app-session-title')?.textContent ?? null,
            card.querySelector('.app-session-line')?.textContent ?? null, card.querySelector('.app-visit-pill')?.textContent ?? null,
            [...(card.querySelector('.app-visit-pill')?.classList ?? [])].find((name) => name.startsWith('app-tone-')) ?? null])),
          (await agendaTabs()).map((tab) => tab.slice(0, 2)),
        ], [['Créneaux ouverts'], ['Créneaux ouverts'], [
          ['Samedi 7 novembre · 14 h 00 – 15 h 00', 'Maison familiale 5 pièces · Écully', '0 inscrit sur 4', 'app-tone-blue'],
          ['Jeudi 12 novembre · 10 h 00 – 12 h 00', 'Maison familiale 5 pièces · Écully', '3 inscrits sur 8', 'app-tone-green'],
        ], [['À venir', '4'], ['Passées', '1'], ['Annulées', '1']]]);
        await favShot(page, '5-mon-espace-agenda-creneaux-1440.png');
        await page.locator('.app-session').nth(0).click();
        await iphoneOnly(page, A, 'Séance de visites');
        // Demande reçue de Julie : sa conversation la plus récente sur la maison.
        const received = page.locator('.app-visit', { hasText: 'Maison familiale 5 pièces' });
        expectSame(A, 'demande reçue', [await received.count(), await received.getByRole('button', { name: 'Message' }).isEnabled()], [1, true]);
        const started = space.calls.length;
        await received.getByRole('button', { name: 'Message' }).click();
        await page.waitForURL(`${base}/messages/?c=c2000000-0000-4000-8000-000000000008`, { timeout: 8000 })
          .catch(() => problems.push(`${A} : « Message » de la demande reçue ouvre ${page.url()}`));
        expectSame(A, 'demande reçue : aucune conversation créée', [...writes, ...space.calls.slice(started)].filter((call) => /start_listing_conversation/.test(call.table)).length, 0);
        await page.goBack({ waitUntil: 'networkidle' });
        await page.waitForSelector('.app-session');
        space.conversations = [...SPACE_CONVERSATIONS, SPACE_HOUSE_CONVERSATIONS[2]];
        await page.locator('.app-visit', { hasText: 'Maison familiale 5 pièces' }).getByRole('button', { name: 'Message' }).click();
        expectSame(A, 'demande reçue sans conversation', await noticeText(page, A), 'Aucune conversation avec cette personne n\'a été trouvée pour cette annonce.');
        // Les autres onglets n'ont pas de créneaux ; sans séance à venir, plus de section.
        await page.click('.app-agenda-tab >> nth=1');
        expectSame(A, 'Passées sans créneaux', await page.locator('.app-session-group').count(), 0);
        await page.click('.app-agenda-tab >> nth=0');
        space.sessions = [];
        space.requests = saved.requests;
        space.conversations = saved.conversations;
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForSelector('.app-visit');
        expectSame(A, 'sans séance à venir', await page.locator('.app-session-group').count(), 0);
      }

      // Ajouter une visite (depuis l'agenda) : le bien d'une conversation, la date, la durée, le contact, deux participants,
      // les rappels et « Confirmée » ; « Enregistrer » insère dans agenda_visits la ligne que l'app insère.
      const V = 'Ajouter une visite';
      await page.click('.app-agenda-add-link');
      await page.waitForURL(`${base}/compte/?vue=ajouter-visite&depuis=agenda`, { timeout: 8000 }).catch(() => problems.push(`${V} : ouvert à ${page.url()}`));
      await page.waitForSelector('.dsc-form-screen .dsc-choose');
      const dateField = page.getByLabel('Date', { exact: true });
      const timeField = page.getByLabel('Heure de début', { exact: true });
      expectSame(V, 'formulaire vide', [await textOf(page, '.app-page-header-title'), await page.isDisabled('.app-page-header .app-visit-save'), await dateField.inputValue(),
        await timeField.inputValue(), await page.$$eval('.dsc-grid-3 .choice-chip', (chips) => chips.map((chip) => [chip.textContent, chip.getAttribute('aria-pressed')])),
        await textOf(page, '.dsc-end'), await page.$$eval('.dsc-form-screen .dsc-card-title', (titles) => titles.map((title) => title.textContent))],
      ['Nouvelle visite', true, '2026-11-07', '10:00', [['15 min', 'false'], ['30 min', 'false'], ['45 min', 'true'], ['1 h', 'false'], ['90 min', 'false'], ['2 h', 'false']],
        'Fin : 10:45', ['Bien concerné', 'Date et heure', 'Rendez-vous', 'Rappels et suivi']]);
      expectSame(V, 'rappels par défaut', await page.$$eval('.dsc-toggle', (toggles) => toggles.map((toggle) => [toggle.querySelector('.dsc-toggle-title')?.textContent ?? null,
        toggle.querySelector('input')?.checked ?? null, toggle.querySelector('.dsc-toggle-note')?.textContent ?? null])),
      [['La veille, à 18 h', true, null], ['2 heures avant', true, null], ['Rappel personnalisé', false, null], ['Confirmée par le contact', false, null],
        ['Ajouter à mon calendrier', false, null]]);
      await page.click('.dsc-prepare');
      await iphoneOnly(page, V, 'Préparer ma visite');
      // Bien concerné : Mes annonces, Mes favoris, Biens de mes conversations ; le bien de la conversation avec l'agence.
      await page.click('.dsc-choose');
      await page.waitForSelector('dialog.dsc-picker[open] .dsc-picker-section', { timeout: 8000 });
      expectSame(V, 'feuille Bien concerné', [await textOf(page, 'dialog.dsc-picker[open] h2'), await page.getAttribute('dialog.dsc-picker[open] input[type="search"]', 'placeholder'),
        await textOf(page, 'dialog.dsc-picker[open] .dsc-picker-manual'), await page.$$eval('dialog.dsc-picker[open] .dsc-picker-section h3', (titles) => titles.map((title) => title.textContent)),
        await textsOf(page, 'dialog.dsc-picker[open] .dsc-picker-section[aria-label="Biens de mes conversations"] .dsc-picker-row')],
      ['Bien concerné', 'Rechercher un bien, une ville…', 'Ajouter une adresse manuellement Pour un bien qui n\'est pas dans Nidalo', ['Mes annonces', 'Mes favoris', 'Biens de mes conversations'],
        ['Appartement lumineux avec balconLyon 3e · avec Agence du Parc']]);
      await page.click('dialog.dsc-picker[open] .dsc-picker-section[aria-label="Biens de mes conversations"] .dsc-picker-row');
      await page.waitForFunction(() => document.querySelector('.dsc-place input')?.value === 'Lyon 3e (69003)', null, { timeout: 8000 })
        .catch(async () => problems.push(`${V} : adresse proposée « ${await page.inputValue('.dsc-place input')} »`));
      // Adresse cachée par le vendeur : la commune seulement ; contact et numéro publiés de l'agence ; visite déjà prévue.
      expectSame(V, 'bien choisi', [await textOf(page, '.dsc-chosen-title'), await textOf(page, '.dsc-chosen-city'), await page.getByLabel('Contact ou agence').inputValue(),
        await page.getByLabel('Téléphone du contact (facultatif)').inputValue(), await page.inputValue('.dsc-place input'),
        (await textOf(page, '.dsc-form-screen'))?.includes('Adresse exacte à demander au vendeur : l\'annonce n\'indique que la commune.') ?? false,
        await textOf(page, '.dsc-duplicate p'), await page.$$eval('.dsc-duplicate .dsc-small', (actions) => actions.map((action) => [action.textContent.trim(), action.getAttribute('href')]))],
      ['Appartement lumineux avec balcon', 'Lyon 3e', 'Agence du Parc', '06 39 98 00 11', 'Lyon 3e (69003)', true,
        'Vous avez déjà une visite pour ce bien le vendredi 6 novembre · 14h30.', [['Voir la visite', '/compte/?vue=agenda'], ['Programmer quand même', null]]]);
      await page.getByRole('button', { name: 'Programmer quand même' }).click();
      await page.waitForSelector('.dsc-duplicate', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${V} : l'avertissement de doublon reste affiché`));
      await dateField.fill('2026-11-10');
      await timeField.fill('14:30');
      await page.getByRole('button', { name: '1 h', exact: true }).click();
      expectSame(V, 'fin de la visite', await textOf(page, '.dsc-end'), 'Fin : 15:30');
      await page.getByRole('button', { name: 'Ajouter un participant' }).click();
      await page.getByLabel('Nom', { exact: true }).fill('Camille Roux');
      await page.getByLabel('Téléphone (facultatif)', { exact: true }).fill('0639981122');
      await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
      await page.getByRole('button', { name: 'Contact Nidalo' }).click();
      expectSame(V, 'contacts Nidalo', await textsOf(page, '.dsc-menu-list [role="menuitem"]'), ['Agence du Parc']);
      await page.locator('.dsc-menu-list').getByRole('menuitem', { name: 'Agence du Parc' }).click();
      expectSame(V, 'participants', await page.$$eval('.dsc-participant', (rows) => rows.map((row) => row.querySelector('.dsc-participant-text')?.textContent ?? null)),
        ['Camille Roux06 39 98 11 22', 'Agence du Parc']);
      await page.getByRole('switch', { name: '2 heures avant' }).uncheck();
      await page.getByRole('switch', { name: 'Rappel personnalisé' }).check();
      await page.selectOption('.dsc-select select', '60');
      await page.getByRole('switch', { name: 'Confirmée par le contact' }).check();
      // « Ajouter à mon calendrier » : une fois la visite enregistrée, son fichier .ics (VisitActions.addToCalendar).
      await page.getByRole('switch', { name: 'Ajouter à mon calendrier' }).check();
      await page.waitForTimeout(200);
      await favShot(page, '5-mon-espace-ajouter-visite-1440.png');
      mark = space.calls.length;
      const formCalendar = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
      await page.click('.app-page-header .app-visit-save');
      const inserted = await oneSpaceCall(space, 'agenda_visits', 'POST', mark, V);
      const formCalendarFile = await formCalendar;
      expectSame(V, 'fichier du calendrier', formCalendarFile
        ? [formCalendarFile.suggestedFilename(), (await readFile(await formCalendarFile.path(), 'utf8')).split('\r\n').filter((line) => /^(UID|DTSTART|DTEND|SUMMARY|LOCATION):/.test(line))]
        : null,
      ['visite.ics', [`UID:${String(inserted?.body?.id ?? '').toLowerCase()}@nidalo.fr`, 'DTSTART:20261110T133000Z', 'DTEND:20261110T143000Z',
        'SUMMARY:Visite : Appartement lumineux avec balcon', 'LOCATION:Lyon 3e (69003)']]);
      if (inserted) {
        const row = inserted.body ?? {};
        const visitId = row.id;
        const participants = row.visit?.participants ?? [];
        if (!UPPER_UUID.test(visitId ?? '') || !participants.every((participant) => UPPER_UUID.test(participant.id ?? ''))) {
          problems.push(`${V} : identifiants ${JSON.stringify([visitId, participants.map((participant) => participant.id)])} au lieu d'UUID en majuscules`);
        }
        expectSame(V, 'ligne insérée dans agenda_visits', row, {
          id: visitId, start_at: '2026-11-10T13:30:00.000', status: 'confirmed', listing_id: listings[0].id.toUpperCase(),
          visit: {
            id: visitId, listing: SPACE_L1, start: '2026-11-10T13:30:00.000', durationMinutes: 60, contactName: 'Agence du Parc', address: 'Lyon 3e (69003)',
            status: 'confirmed', createdAt: '2026-11-06T09:50:00.000', contactPhone: '0639980011',
            participants: [{ id: participants[0]?.id, name: 'Camille Roux', phone: '0639981122' }, { id: participants[1]?.id, name: 'Agence du Parc' }],
            reminders: { eveningBefore: true, twoHoursBefore: false, customMinutesBefore: 60 }, linkedConversationId: SPACE_CONVERSATION_ID.toUpperCase(),
          },
        });
        // Une insertion simple (pas d'upsert), comme table.insert(Row(visit)) dans l'app.
        expectSame(V, 'insertion', [inserted.search, inserted.prefer.includes('resolution=')], ['', false]);
      }
      await page.waitForSelector('.dsc-saved', { timeout: 8000 }).catch(() => undefined);
      expectSame(V, 'message', await textOf(page, '.dsc-saved'), 'Visite enregistrée · rappels la veille et 1 h avant');
      // Retour à l'agenda, où la visite s'ajoute à « Cette semaine ».
      await page.waitForURL(`${base}/compte/?vue=agenda`, { timeout: 8000 }).catch(() => problems.push(`${V} : après l'enregistrement, ${page.url()} au lieu de Mon agenda`));
      await page.waitForFunction(() => document.querySelector('.app-agenda-tab .app-agenda-tab-count')?.textContent === '4', null, { timeout: 8000 })
        .catch(() => problems.push(`${V} : la visite enregistrée n'apparaît pas dans Mon agenda`));
      const added = (await agendaCards(page)).flatMap(([group, cards]) => cards.map((item) => ({ group, ...item })))
        .find((item) => item.date === 'Mardi 10 novembre · 14h30' && item.time !== '3 créneaux proposés');
      expectSame(V, 'visite dans l\'agenda', added, { group: 'Cette semaine', ...card({ block: 'MAR 10 NOV', date: 'Mardi 10 novembre · 14h30', time: '14 h 30 – 15 h 30',
        status: 'Confirmée', tones: ['blue', 'green'], title: 'Appartement lumineux avec balcon · Lyon 3e', lines: ['Avec Agence du Parc'],
        route: plans('Lyon 3e (69003)') }) });

      // Mon projet : la sorte (sur ordinateur, les quatre sans leur sous-titre), le résumé et l'anneau ; une étape cochée
      // et le partage, puis « Enregistrer mon projet » envoie l'upsert de l'app (ProjectServerRow, sur user_id).
      const P = 'Mon projet';
      space.project = structuredClone(SPACE_PROJECTS.buy);
      await page.goto(`${base}/compte/`, { waitUntil: 'networkidle' });
      await page.click('.app-space a.app-row[href="/compte/?vue=projet"]');
      await page.waitForURL(`${base}/compte/?vue=projet`, { timeout: 8000 }).catch(() => problems.push(`${P} : « Mon projet » ouvre ${page.url()}`));
      await page.waitForSelector('.dsc-project-screen .dsc-kinds', { timeout: 8000 });
      expectSame(P, 'en-tête et sortes', [await textOf(page, '.screen-header h1'), await textOf(page, '.project-intro p'), await textOf(page, '.dsc-active'),
        await page.$$eval('.dsc-kind', (kinds) => kinds.map((kind) => [kind.querySelector('.dsc-kind-title')?.textContent ?? null, kind.querySelector('.dsc-kind-subtitle')?.textContent ?? null,
          kind.getAttribute('aria-pressed')]))],
      ['Mon projet immobilier', 'Définissez vos critères pour trouver les biens qui vous correspondent', 'Projet actif',
        [['Résidentiel', null, 'true'], ['Investissement', null, 'false'], ['Location', null, 'false'], ['Hôtel', null, 'false']]]);
      expectSame(P, 'résumé', [await page.$$eval('.dsc-summary-row', (rows) => rows.map((row) => [row.querySelector('dt')?.textContent ?? null,
        row.querySelector('dd')?.textContent.replace(/\s+/g, ' ') ?? null])), await textOf(page, '.dsc-summary-ring .dsp-ring-label'), await textOf(page, '.dsc-steps-count')],
      [[['Type de bien', 'Appartement'], ['Budget maximum', '300 000 €'], ['Surface et pièces', 'Non renseigné'], ['Localisation', 'Lyon']], '43 %', '2 étapes sur 5']);
      await page.locator('.dsc-card-toggle', { hasText: 'Avancement du projet' }).click();
      await page.waitForSelector('.dsc-steps');
      expectSame(P, 'étapes', await page.$$eval('.dsc-step', (steps) => steps.map((step) => [step.querySelector('.dsc-step-title')?.textContent ?? null, step.getAttribute('aria-pressed')])),
        [['Recherche', 'true'], ['Visites', 'true'], ['Sélection', 'false'], ['Offre', 'false'], ['Signature', 'false']]);
      await page.locator('.dsc-step', { hasText: 'Sélection' }).click();
      expectSame(P, 'étape cochée', [await page.getAttribute('.dsc-step >> nth=2', 'aria-pressed'), await textOf(page, '.dsc-steps-count')], ['true', '3 étapes sur 5']);
      await page.getByRole('switch', { name: 'Montrer mon projet à mes contacts' }).check();
      mark = space.calls.length;
      const before = writes.length;
      await page.getByRole('button', { name: 'Enregistrer mon projet' }).click();
      const upsert = await oneSpaceCall(space, 'real_estate_projects', 'POST', mark, P);
      if (upsert) {
        expectSame(P, 'upsert', [upsert.search, upsert.prefer.split(',').includes('resolution=merge-duplicates')], ['?on_conflict=user_id', true]);
        expectSame(P, 'ligne envoyée à real_estate_projects', upsert.body, {
          user_id: USER_ID.toUpperCase(), id: SPACE_PROJECT_ID, kind: 'buy', city: 'Lyon', purpose: 'Résidence principale', completed_steps: ['search', 'selection', 'visits'],
          criteria: {
            residential: { maxBudget: 300000, propertyTypes: ['apartment'], excludesGroundFloor: false, requiresElevator: false, outdoorSpaces: [], requiresParking: false,
              requiresDocumentedBuildability: false, requiresServiced: false, location: { place: 'Lyon' } },
            investment: { assetTypes: [], leasedOnly: false, includesMixedBuildings: false, location: { place: '' } },
            rental: { propertyTypes: [], requiresElevator: false, requiresParking: false, outdoorSpaces: [], location: { place: '' } },
            hotel: { location: { place: '' } },
          },
          shared_with_contacts: true,
        });
      }
      if (writes.length !== before) problems.push(`${P} : écritures en plus de l'upsert (${JSON.stringify(writes.slice(before))})`);
      await page.waitForURL(`${base}/compte/`, { timeout: 8000 }).catch(() => problems.push(`${P} : après l'enregistrement, ${page.url()} au lieu de Mon espace`));
      await page.waitForSelector('.app-space .app-row', { timeout: 8000 }).catch(() => problems.push(`${P} : Mon espace ne s'affiche pas après l'enregistrement`));
      expectSame(P, 'ligne après l\'enregistrement', await spaceProjectRow(page), ['Mon projet', 'Résidence principale · Lyon', '/compte/?vue=projet']);
      // L'étape cochée est gardée : Mon projet, rouvert depuis sa ligne, la compte.
      await page.click('.app-space a.app-row[href="/compte/?vue=projet"]');
      await page.waitForSelector('.dsc-project-screen .dsc-steps-count', { timeout: 8000 }).catch(() => undefined);
      await page.waitForFunction(() => document.querySelector('.dsc-steps-count')?.textContent === '3 étapes sur 5', null, { timeout: 8000 })
        .catch(() => problems.push(`${P} : l'étape cochée n'apparaît pas en rouvrant Mon projet`));
      expectSame(P, 'projet rouvert après l\'enregistrement', [await textOf(page, '.dsc-summary-ring .dsp-ring-label'), await textOf(page, '.dsc-steps-count')],
        ['43 %', '3 étapes sur 5']);
      await page.goto(`${base}/compte/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.app-space .app-row');

      // Biens consultés : du plus récent au plus ancien, « Retirer » puis « Vider l'historique » (rien n'est envoyé au serveur).
      const C = 'Biens consultés';
      // Lecture ratée (réseau) : « Pas de connexion Internet » et « Réessayer », la liste gardée ; relue, un bien que le
      // serveur ne rend plus est retiré de l'historique (n° 225).
      await page.evaluate(([owner, ids]) => localStorage.setItem(`nidalo.consultes.${owner}`, JSON.stringify(ids)), [USER_ID, [...SPACE_VIEWED, GONE_ID]]);
      const viewedRead = /^https:\/\/izzsoitqtzzswkpvdozd\.supabase\.co\/rest\/v1\/listings\?/;
      const failViewed = (route) => (new URL(route.request().url()).searchParams.get('id')?.startsWith('in.(') ? route.abort('internetdisconnected') : route.fallback());
      const disconnected = /net::ERR_INTERNET_DISCONNECTED/;
      expectedConsole.add(disconnected);
      await page.route(viewedRead, failViewed);
      await page.click('.app-space a.app-row[href="/compte/?vue=consultes"]');
      await page.waitForSelector('.viewed-screen .app-offline', { timeout: 8000 }).catch(() => problems.push(`${C} : lecture ratée sans « Pas de connexion Internet »`));
      expectSame(C, 'lecture ratée', [await textOf(page, '.app-offline h2'), await textOf(page, '.app-offline-retry'), await page.locator('.viewed-row').count(),
        JSON.parse(await viewedStorage(page) ?? 'null')], ['Pas de connexion Internet', 'Réessayer', 0, [...SPACE_VIEWED, GONE_ID]]);
      await page.unroute(viewedRead, failViewed);
      await page.click('.app-offline-retry');
      await page.waitForSelector('.viewed-row', { timeout: 8000 });
      expectedConsole.delete(disconnected);
      expectSame(C, 'bien introuvable retiré', JSON.parse(await viewedStorage(page) ?? 'null'), SPACE_VIEWED);
      expectSame(C, 'liste', [await textOf(page, '.screen-header h1'), await textOf(page, '.viewed-clear'), await viewedRows(page),
        await page.$$eval('.viewed-remove', (buttons) => buttons.map((button) => [button.textContent.trim(), button.getAttribute('aria-label')]))],
      ['Biens consultés', 'Vider', [
        ['Maison 4 pièces avec jardin', 'Caluire-et-Cuire · 95 m²', '420 000 €', 'Vendu', `/annonce/?id=${SPACE_SOLD.id}`],
        ['Appartement lumineux avec balcon', 'Lyon 3e · 62 m²', '238 000 €', 'En ligne', `/annonce/?id=${listings[0].id}`],
        ['Studio meublé', 'Lyon 7e · 24 m²', '690 €/mois CC', 'En ligne', `/annonce/?id=${listings[2].id}`],
        ['T2 vendu loué près du métro', 'Villeurbanne · 45 m²', '185 000 €', 'En ligne', `/annonce/?id=${listings[1].id}`],
      ], Array(4).fill(['', 'Retirer de l\'historique'])]);
      await imagesLoaded(page, '.viewed-row img', 3, C);
      await favShot(page, '5-mon-espace-consultes-1440.png');
      mark = writes.length;
      const viewedMark = space.calls.length;
      await page.locator('.viewed-row', { has: page.locator('.viewed-link[aria-label="Studio meublé"]') }).getByRole('button', { name: 'Retirer de l\'historique' }).click();
      await page.waitForFunction(() => document.querySelectorAll('.viewed-row').length === 3, null, { timeout: 8000 }).catch(() => problems.push(`${C} : « Retirer » n'a rien retiré`));
      expectSame(C, 'après « Retirer »', [(await viewedRows(page)).map((row) => row[0]), JSON.parse(await viewedStorage(page) ?? 'null')],
        [['Maison 4 pièces avec jardin', 'Appartement lumineux avec balcon', 'T2 vendu loué près du métro'], [SPACE_SOLD.id, listings[0].id, listings[1].id]]);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.viewed-row');
      expectSame(C, 'après un rechargement', (await viewedRows(page)).map((row) => row[0]), ['Maison 4 pièces avec jardin', 'Appartement lumineux avec balcon', 'T2 vendu loué près du métro']);
      await page.click('.viewed-clear');
      expectSame(C, 'confirmation', [await dialogTitle(page), await textOf(page, 'dialog.alert-dialog[open] .alert-body p'),
        await page.$$eval('dialog.alert-dialog[open] .alert-actions button', (buttons) => buttons.map((button) => button.textContent))],
      ['Vider l\'historique ?', 'Les 3 biens consultés seront retirés de cette liste.', ['Vider l\'historique', 'Annuler']]);
      await alertButton(page, 'Vider l\'historique');
      await page.waitForSelector('.viewed-screen .app-unavailable', { timeout: 8000 }).catch(() => problems.push(`${C} : la liste n'est pas vidée`));
      expectSame(C, 'historique vidé', [await textOf(page, '.viewed-screen .app-unavailable h2'), await textOf(page, '.viewed-screen .app-unavailable p'),
        await page.locator('.viewed-clear').count(), await viewedStorage(page)],
        ['Aucun bien consulté', 'Les annonces que vous ouvrez apparaîtront ici.', 0, '[]']);
      if (writes.length !== mark || space.calls.slice(viewedMark).some((call) => call.method !== 'GET' && !call.table.startsWith('rpc/'))) {
        problems.push(`${C} : écriture envoyée au serveur (${JSON.stringify(space.calls.slice(viewedMark).filter((call) => call.method !== 'GET'))})`);
      }
      await page.goto(`${base}/compte/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.app-space .app-row');
      // Historique vide : la ligne n'a plus de sous-titre, comme dans l'app (rien à zéro).
      expectSame(C, 'ligne de Mon espace', (await spaceRows(page, 'Mon espace')).find((row) => row[0] === 'Biens consultés'),
        ['Biens consultés', null, '/compte/?vue=consultes']);

      // Supprimer mon compte : l'écran existant (rien n'est supprimé sans « Supprimer définitivement »).
      await page.click('.delete-account-link');
      await page.waitForURL(`${base}/compte/?vue=supprimer`, { timeout: 8000 }).catch(() => problems.push(`Supprimer mon compte : ouvre ${page.url()}`));
      await page.waitForSelector('.delete-card');
      expectSame('Supprimer mon compte', 'écran', [await textOf(page, '.delete-card h2'), await textOf(page, '.delete-card .app-button-danger')],
        ['Supprimer mon compte ?', 'Supprimer définitivement']);
      // Les textes de l'app (n° 31, 125, 32), les fichiers de l'iPhone devenus ce que ce navigateur garde.
      expectSame('Supprimer mon compte', 'textes', [await textOf(page, '.delete-card p:not(.delete-note)'), await textsOf(page, '.delete-card .delete-note')], [
        'Votre compte, vos annonces et leurs photos, vos demandes de visite, vos données de professionnel et vos documents privés en ligne seront effacés. '
          + 'Les biens consultés et les derniers lieux cherchés gardés dans ce navigateur le seront aussi. Les messages déjà envoyés restent visibles par vos '
          + 'interlocuteurs, sans votre nom.',
        ['Cette action est irréversible.'],
      ]);
      // Connexion et sécurité, Confidentialité et données : les textes de l'app (n° 33, 123, et la carte de l'app).
      await page.goto(`${base}/compte/?vue=securite`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.placeholder-state');
      expectSame('Connexion et sécurité', 'texte', await textOf(page, '.placeholder-state p'), 'Compte créé avec une adresse e-mail : pour changer de mot de passe, '
        + 'déconnectez-vous, puis touchez « Mot de passe oublié » sur l\'écran de connexion. Compte Apple ou Google : votre mot de passe se gère chez Apple ou Google.');
      await page.goto(`${base}/compte/?vue=confidentialite`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.info-tile-card');
      expectSame('Confidentialité et données', 'carte', [await textOf(page, '.info-tile-card h2'), await textOf(page, '.info-tile-card p')], ['Aucun suivi publicitaire',
        'Nidalo n\'affiche aucune publicité et n\'utilise aucun outil de mesure d\'audience ni aucun traceur. Nidalo ne vend ni ne loue vos données.']);

      // Se déconnecter : la confirmation de l'app ; « Annuler » ne fait rien, « Se déconnecter » ferme la session.
      const D = 'Se déconnecter';
      await page.goto(`${base}/compte/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.logout-button');
      await page.click('.logout-button');
      expectSame(D, 'confirmation', [await dialogTitle(page), await textOf(page, 'dialog.alert-dialog[open] .alert-body p'),
        await page.$$eval('dialog.alert-dialog[open] .alert-actions button', (buttons) => buttons.map((button) => [button.textContent, button.className]))],
      ['Se déconnecter ?', 'Vous pourrez vous reconnecter à tout moment. Les données de ce navigateur restent enregistrées.', [['Se déconnecter', 'btn btn-danger'], ['Annuler', 'btn btn-light']]]);
      await alertButton(page, 'Annuler');
      await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${D} : la confirmation reste ouverte`));
      await page.waitForTimeout(300);
      if (space.logouts.length) problems.push(`${D} : session fermée après « Annuler »`);
      // Comparaison de l'onglet : vidée quand le compte s'en va (n° 1 B) ; ses biens consultés restent à lui dans ce
      // navigateur.
      await page.evaluate((ids) => sessionStorage.setItem('nidalo.comparer', JSON.stringify({ ids, referenceId: ids[0] })), [listings[0].id, listings[1].id]);
      await page.click('.logout-button');
      await dialogTitle(page);
      await alertButton(page, 'Se déconnecter');
      await waitFor(() => space.logouts.length > 0, `${D} : appel au serveur`);
      // Comme l'app (n° 122) : seulement ce navigateur ; les autres appareils restent connectés.
      expectSame(D, 'appel', space.logouts, [{ method: 'POST', search: '?scope=local' }]);
      await page.waitForSelector('.signin-card', { timeout: 8000 }).catch(() => problems.push(`${D} : la carte de connexion ne s'affiche pas`));
      expectSame(D, 'page après la déconnexion', [await page.locator('.app-space').count(), await page.evaluate(() => {
        try { return Object.keys(localStorage).filter((key) => key.startsWith('sb-')).length; } catch { return null; }
      })], [0, 0]);
      expectSame(D, 'comparaison et biens consultés après la déconnexion', await page.evaluate((owner) => [
        JSON.parse(sessionStorage.getItem('nidalo.comparer') ?? 'null')?.ids ?? [], localStorage.getItem(`nidalo.consultes.${owner}`) !== null,
      ], USER_ID), [[], true]);
      await page.close();
      await context.close();
    }

    // Mon projet (Investissement, 57 %), l'écran du téléphone dans la colonne (688 de contenu), la sorte nommée par son
    // seul titre (sans sous-titre sur ordinateur) : capture de l'écran entier.
    {
      const space = spaceState({ project: structuredClone(SPACE_PROJECTS.invest) });
      const { context } = await spaceContext(1440, 900, space);
      page = await open(context, '/compte/?vue=projet', 'Mon projet 1440');
      await page.waitForSelector('.dsc-project-screen .dsc-kinds');
      expectSame('Mon projet 1440', 'résumé', [await textOf(page, '.dsc-summary-ring .dsp-ring-label'), await textOf(page, '.dsc-steps-count'),
        await page.getAttribute('.dsc-kind[aria-pressed="true"]', 'aria-label'), (await contentWidth(page, '.account-wrap'))], ['57 %', '3 étapes sur 6',
        'Investissement', 688]);
      await tallShot(page, '5-mon-espace-projet-1440.png');
      await page.close();
      await context.close();
    }

    // Compte professionnel : son espace garde son écran ; « Agenda des visites » ouvre Mon agenda, sur ordinateur et
    // sur téléphone.
    for (const [width, href] of [[1440, '/compte/?vue=agenda'], [1023, '/compte/?vue=agenda']]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'fr-FR' });
      await mock(context, { signedIn: true, account: { profiles: [{ ...ACCOUNT.profiles[0], account_type: 'professional', professional_profile_id: 'b2000000-0000-4000-8000-000000000001' }] } });
      page = await open(context, '/compte/', `espace pro ${width}`);
      await page.waitForSelector('.app-row-title');
      expectSame(`espace pro ${width}`, 'Agenda des visites', [await page.locator('.dsp').count(),
        await page.$$eval('a.app-row', (rows) => rows.filter((row) => row.querySelector('.app-row-title')?.textContent === 'Agenda des visites').map((row) => row.getAttribute('href')))], [0, [href]]);
      await page.close();
      await context.close();
    }

    // À 1023 px : la page du téléphone ; Mon projet et Biens consultés y ont la page de l'app (étape 5), comme Mon agenda
    // et Ajouter une visite (vérifiés plus bas, sur téléphone).
    {
      const context = await browser.newContext({ viewport: { width: 1023, height: 768 }, locale: 'fr-FR' });
      await mock(context, { signedIn: true });
      page = await open(context, '/compte/', 'Mon espace 1023');
      await page.waitForSelector('.app-space .app-row');
      expectSame('Mon espace 1023', 'page du téléphone', [await page.locator('.dsp, .dsc').count(), await page.locator('.space-profile').count()], [0, 1]);
      expectSame('Mon espace 1023', 'lien Mon agenda', await page.$$eval('a.app-row', (rows) => rows.filter((row) => row.querySelector('.app-row-title')?.textContent === 'Mon agenda')
        .map((row) => row.getAttribute('href'))), ['/compte/?vue=agenda']);
      await page.close();
      // Mon projet masque la barre d'onglets, comme dans l'app (hidesTabBar) ; Biens consultés la garde. L'en-tête de
      // l'app, sans celui de l'ordinateur ; plus d'écran « bientôt ».
      for (const [view, title, tabBar, selector] of [['projet', 'Mon projet immobilier', false, '.dsc-project-screen.is-phone .project-intro'],
        ['consultes', 'Biens consultés', true, '.viewed-screen .app-unavailable']]) {
        page = await open(context, `/compte/?vue=${view}`, `${view} 1023`);
        await page.waitForSelector(selector, { timeout: 8000 }).catch(() => problems.push(`${view} 1023 : page de l'app absente`));
        expectSame(`${view} 1023`, 'page de l\'app', [await textOf(page, '.screen-header h1'), await page.locator('.soon-state').count(), await page.locator('.dsc-head').count(),
          await page.locator('.tabbar').isVisible()], [title, 0, 0, tabBar]);
        await page.close();
      }
      await context.close();
    }

    // Sans compte, sur ordinateur : l'invitation à se connecter sur Mon espace et ses écrans ; rien n'est demandé.
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
      const guestServer = await mock(context);
      for (const view of [null, 'agenda', 'ajouter-visite', 'projet', 'consultes']) {
        const path = view ? `/compte/?vue=${view}` : '/compte/';
        page = await open(context, path, `${path} sans compte`);
        await page.waitForSelector('.signin-card');
        expectSame(`${path} sans compte`, 'page', [await page.locator('.dsp, .dsc').count(), await textOf(page, '.signin-card h1')], [0, 'Votre prochain bien commence ici.']);
        await page.close();
      }
      const asked = guestServer.requests.filter((request) => ['real_estate_projects', 'agenda_visits', 'rpc/my_visit_requests', 'profiles'].includes(request.table));
      if (asked.length) problems.push(`Mon espace sans compte : ${asked.map((request) => request.table).join(', ')} demandé`);
      await context.close();
    }

    // Téléphone : Mon agenda, l'écran de l'app (retour rond, « + », grand titre, onglets sur la piste grise, mêmes cartes
    // que l'ordinateur, mesures de l'app), et Ajouter une visite, à 390 px (iPhone 13) et 320 px (iPhone SE), ouverts
    // depuis Mon compte : rien ne dépasse, la feuille « Bien concerné » tient dans l'écran et « Enregistrer » insère la
    // visite. Captures : agenda-telephone*.png, ajouter-visite-telephone*.png, ajouter-visite-feuille-telephone*.png.
    for (const device of ['iPhone 13', 'iPhone SE']) {
      const A = `Mon agenda ${device}`;
      const V = `Ajouter une visite ${device}`;
      const suffix = device === 'iPhone SE' ? '-320' : '';
      const screenWidth = devices[device].viewport.width;
      const space = spaceState({ conversations: SPACE_CONVERSATIONS });
      const context = await spaceBrowser.newContext({ ...devices[device], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
      await context.clock.setFixedTime(CHAT_NOW);
      await mock(context, { signedIn: true, listingRows: SPACE_LISTING_ROWS });
      await mockSpace(context, space);
      page = await open(context, '/compte/', A);
      await page.waitForSelector('.app-space .app-row');
      await page.click('a.app-row[href="/compte/?vue=agenda"]');
      await page.waitForURL(`${base}/compte/?vue=agenda`, { timeout: 8000 }).catch(() => problems.push(`${A} : « Mon agenda » ouvre ${page.url()}`));
      await page.waitForSelector('.app-agenda .app-visit', { timeout: 8000 }).catch(() => problems.push(`${A} : Mon agenda ne s'affiche pas`));
      expectSame(A, 'en-tête', [await page.getAttribute('.app-agenda-top .app-round', 'href'), await page.getAttribute('.app-agenda-top .app-round', 'aria-label'),
        await page.getAttribute('.app-agenda-top .app-agenda-plus', 'href'), await page.getAttribute('.app-agenda-top .app-agenda-plus', 'aria-label'),
        await textOf(page, '.app-agenda-header h1'), await textOf(page, '.app-agenda-header p'), await textOf(page, '.app-agenda-add-link'),
        await page.$$eval('.app-agenda-tab', (tabs) => tabs.map((tab) => [tab.querySelector('.app-agenda-tab-title')?.textContent ?? null,
          tab.querySelector('.app-agenda-tab-count')?.textContent ?? null]))],
      ['/compte/', 'Retour', '/compte/?vue=ajouter-visite&depuis=agenda', 'Ajouter une visite', 'Agenda des visites', 'Toutes vos visites à venir et passées.',
        'Ajouter une visite manuellement', [['À venir', '3'], ['Passées', '1'], ['Annulées', '1']]]);
      expectSame(A, 'cartes À venir, celles de l\'ordinateur', await agendaCards(page), desktopAgenda);
      // Mesures de l'app : retour et « + » de 44 (ronds de 42), titre de 30, piste de 46 et onglets de 38 (coins 16 et
      // 12), bloc date de 52 × 60, carte aux coins de 22, boutons de 38 ; 12 entre les cartes.
      expectSame(A, 'mesures', await page.evaluate(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect();
        const style = (selector) => getComputedStyle(document.querySelector(selector));
        const cards = [...document.querySelectorAll('.app-visit')].map((card) => card.getBoundingClientRect());
        return [Math.round(box('.app-agenda-top .app-round').width), Math.round(box('.app-agenda-plus-circle').width), style('.app-agenda-header h1').fontSize,
          Math.round(box('.app-agenda-tabs').height), style('.app-agenda-tabs').borderRadius, Math.round(box('.app-agenda-tab').height),
          style('.app-agenda-tab[aria-selected="true"]').borderRadius, [Math.round(box('.app-visit-date').width), Math.round(box('.app-visit-date').height)],
          style('.app-visit').borderRadius, Math.round(box('.app-visit-button').height), Math.round(cards[1].top - cards[0].bottom)];
      }), [44, 42, '30px', 46, '16px', 38, '12px', [52, 60], '22px', 38, 12]);
      await phoneFits(page, A);
      await tallShot(page, `agenda-telephone${suffix}.png`);
      // Menu « … » d'une visite : entier dans l'écran, au-dessus de la barre du bas (la page défile juste assez).
      await page.locator('.app-visit').nth(0).locator('.dsc-menu-button').click();
      await page.waitForSelector('.dsc-menu-list');
      await page.waitForTimeout(300);
      expectSame(A, 'menu « … » entier au-dessus de la barre du bas', await page.evaluate(() => {
        const menu = document.querySelector('.dsc-menu-list').getBoundingClientRect();
        return menu.top >= 0 && menu.bottom <= document.querySelector('.tabbar').getBoundingClientRect().top;
      }), true);
      await phoneFits(page, `${A}, menu « … »`);
      await page.screenshot({ path: join(out, `agenda-menu-telephone${suffix}.png`) });
      await page.keyboard.press('Escape');
      await page.waitForSelector('.dsc-menu-list', { state: 'detached', timeout: 4000 }).catch(() => problems.push(`${A} : Échap ne referme pas le menu « … »`));
      // Passées et Annulées : leurs cartes, dans l'écran.
      for (const [index, tab] of [[1, 'Passées'], [2, 'Annulées']]) {
        await page.click(`.app-agenda-tab >> nth=${index}`);
        await page.waitForFunction((i) => document.querySelectorAll('.app-agenda-tab')[i]?.getAttribute('aria-selected') === 'true', index, { timeout: 4000 }).catch(() => undefined);
        expectSame(A, `onglet ${tab}`, (await agendaCards(page)).map(([group, cards]) => [group, cards.length]), [['Ce mois-ci', 1]]);
        await phoneFits(page, `${A}, ${tab}`);
      }
      await page.click('.app-agenda-tab >> nth=0');
      // Détail d'une visite : l'écran de l'app (retour rond, titre centré, « Note »), dans l'écran.
      await page.locator('.app-visit').nth(0).locator('a.app-visit-detail').click();
      await page.waitForSelector('.app-detail-title', { timeout: 8000 }).catch(() => problems.push(`${A} : le détail d'une visite ne s'affiche pas`));
      expectSame(A, 'détail d\'une visite [titre, « Note », boutons]', [await textOf(page, '.app-page-header-title'), await textOf(page, '.app-page-header .app-detail-note'),
        await textsOf(page, '.app-detail-button')],
      ['Détail de la visite', 'Note', ['Itinéraire', 'Contacter', 'Partager la visite', 'Ajouter à mon calendrier', 'Modifier ou reprogrammer', 'Annuler la visite', 'Supprimer']]);
      await phoneFits(page, `${A}, détail d'une visite`);
      await tallShot(page, `visite-telephone${suffix}.png`);
      await page.goBack({ waitUntil: 'networkidle' });
      await page.waitForSelector('.app-agenda .app-visit');

      // Ajouter une visite, depuis l'agenda.
      await page.click('.app-agenda-add-link');
      await page.waitForURL(`${base}/compte/?vue=ajouter-visite&depuis=agenda`, { timeout: 8000 }).catch(() => problems.push(`${V} : ouvert à ${page.url()}`));
      await page.waitForSelector('.dsc-form-screen .dsc-choose');
      // En-tête de l'app sur téléphone (VisitFormView) : retour rond, titre centré, « Enregistrer » en capsule bleue.
      expectSame(V, 'formulaire vide', [await textOf(page, '.app-page-header-title'), await page.isDisabled('.app-page-header .app-visit-save'),
        await page.$$eval('.dsc-form-screen .dsc-card-title', (titles) => titles.map((title) => title.textContent))],
      ['Nouvelle visite', true, ['Bien concerné', 'Date et heure', 'Rendez-vous', 'Rappels et suivi']]);
      await phoneFits(page, V);
      await tallShot(page, `ajouter-visite-telephone${suffix}.png`);
      await page.click('.dsc-choose');
      await page.waitForSelector('dialog.dsc-picker[open] .dsc-picker-section', { timeout: 8000 });
      // Feuille de l'app (domiaSheet, étape 5) : posée en bas sur toute la largeur, une fois montée.
      await page.waitForFunction(() => document.querySelector('dialog.dsc-picker[open]')?.getAnimations().every((animation) => animation.playState === 'finished'),
        null, { timeout: 8000 }).catch(() => undefined);
      expectSame(V, 'feuille Bien concerné [gauche, droite, dans la hauteur, collée en bas, sections]', await page.evaluate(() => {
        const box = document.querySelector('dialog.dsc-picker[open]').getBoundingClientRect();
        return [Math.round(box.left), Math.round(box.right), box.top >= 0 && box.bottom <= window.innerHeight + 0.5, Math.abs(box.bottom - window.innerHeight) < 1,
          [...document.querySelectorAll('dialog.dsc-picker[open] .dsc-picker-section h3')].map((title) => title.textContent)];
      }), [0, screenWidth, true, true, ['Mes annonces', 'Mes favoris', 'Biens de mes conversations']]);
      await phoneFits(page, `${V}, feuille Bien concerné`);
      await page.screenshot({ path: join(out, `ajouter-visite-feuille-telephone${suffix}.png`) });
      await page.click('dialog.dsc-picker[open] .dsc-picker-section[aria-label="Biens de mes conversations"] .dsc-picker-row');
      await page.waitForFunction(() => document.querySelector('.dsc-place input')?.value === 'Lyon 3e (69003)', null, { timeout: 8000 })
        .catch(async () => problems.push(`${V} : adresse proposée « ${await page.inputValue('.dsc-place input')} »`));
      expectSame(V, 'bien choisi', [await textOf(page, '.dsc-chosen-title'), await page.getByLabel('Contact ou agence').inputValue()],
        ['Appartement lumineux avec balcon', 'Agence du Parc']);
      await phoneFits(page, `${V}, bien choisi`);
      await page.getByRole('button', { name: 'Programmer quand même' }).click();
      await page.getByLabel('Date', { exact: true }).fill('2026-11-10');
      await page.getByLabel('Heure de début', { exact: true }).fill('14:30');
      const phoneMark = space.calls.length;
      await page.click('.app-page-header .app-visit-save');
      const inserted = await oneSpaceCall(space, 'agenda_visits', 'POST', phoneMark, V);
      expectSame(V, 'visite insérée [début, annonce, adresse, contact]', [inserted?.body?.start_at ?? null, inserted?.body?.listing_id ?? null,
        inserted?.body?.visit?.address ?? null, inserted?.body?.visit?.contactName ?? null],
      ['2026-11-10T13:30:00.000', listings[0].id.toUpperCase(), 'Lyon 3e (69003)', 'Agence du Parc']);
      await page.waitForURL(`${base}/compte/?vue=agenda`, { timeout: 8000 }).catch(() => problems.push(`${V} : après l'enregistrement, ${page.url()} au lieu de Mon agenda`));
      await page.waitForFunction(() => document.querySelector('.app-agenda-tab .app-agenda-tab-count')?.textContent === '4', null, { timeout: 8000 })
        .catch(() => problems.push(`${V} : la visite enregistrée n'apparaît pas dans Mon agenda`));
      await page.close();
      await context.close();
    }

    // Sans compte, sur téléphone : l'invitation à se connecter ; rien de l'agenda n'est demandé.
    {
      const context = await spaceBrowser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
      const guestServer = await mock(context);
      for (const view of ['agenda', 'ajouter-visite']) {
        page = await open(context, `/compte/?vue=${view}`, `${view} téléphone sans compte`);
        await page.waitForSelector('.signin-card');
        expectSame(`${view} téléphone sans compte`, 'page', [await page.locator('.dsc').count(), await textOf(page, '.signin-card h1')], [0, 'Votre prochain bien commence ici.']);
        await page.close();
      }
      const asked = guestServer.requests.filter((request) => ['agenda_visits', 'rpc/my_visit_requests', 'rpc/my_conversations'].includes(request.table));
      if (asked.length) problems.push(`Mon agenda téléphone sans compte : ${asked.map((request) => request.table).join(', ')} demandé`);
      await context.close();
    }
  } finally {
    await spaceBrowser.close();
  }

  // Téléphone
  const phone = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  await mock(phone);
  page = await open(phone, '/', 'accueil-telephone');
  await page.waitForSelector('#opportunites');
  await page.screenshot({ path: join(out, 'accueil-telephone.png') });
  await page.screenshot({ path: join(out, 'accueil-telephone-long.png'), fullPage: true });
  // Carte des catégories (HomeCategoryCard) : aucune ouverte au départ ; Investir ouvre ses filtres dans la carte,
  // « Réduire » les referme, puis Résidentiel.
  expectSame('accueil téléphone', 'catégories fermées', [await page.locator('.home-category-filters').count(), await page.locator('.mode-tab[aria-expanded="true"]').count()], [0, 0]);
  await page.click('.mode-tab >> nth=2');
  await page.waitForSelector('.home-category-filters');
  await page.waitForTimeout(600);
  expectSame('accueil téléphone', 'Investir ouvert', [
    await page.textContent('.mode-tab[aria-expanded="true"] .mode-name'),
    (await page.textContent('.home-category .place-field-caption'))?.replace(/\s/g, ' '),
    await page.locator('.home-category .criterion-label').allTextContents(),
    await page.textContent('.home-more-hint'),
    await page.textContent('.home-search-title'),
  ], ['Investir', 'Où investir ?', ['Budget maximum', 'Rentabilité min.', 'Cash-flow min.', 'Travaux acceptés', 'Type d’investissement'],
    "Type d'actif, lots, fiscalité, vacance, charges...", 'Rechercher des opportunités']);
  await page.screenshot({ path: join(out, 'accueil-telephone-investir.png') });
  await page.click('.home-collapse');
  await page.waitForSelector('.home-category-filters', { state: 'detached', timeout: 4000 })
    .catch(() => problems.push('accueil téléphone : « Réduire » ne referme pas les filtres'));
  await page.click('.mode-tab >> nth=0');
  await page.waitForSelector('.home-category-filters');
  await page.waitForTimeout(600);
  await page.click('.criterion-tile >> nth=1');
  await page.waitForSelector('dialog.selection-dialog[open]');
  await page.click('dialog[open] .selection-row >> nth=1');
  await page.click('dialog[open] .selection-row >> nth=2');
  await page.screenshot({ path: join(out, 'accueil-menu-telephone.png') });
  await page.click('dialog[open] .selection-foot .btn');
  const types = await page.textContent('.criterion-tile >> nth=1 >> .criterion-value');
  if (types !== '2 types de bien') problems.push(`accueil : types affichés « ${types} »`);
  await page.close();
  page = await open(phone, '/recherche/?mode=buy', 'recherche-telephone');
  await page.waitForSelector('.listing-card');
  await page.screenshot({ path: join(out, 'recherche-telephone.png') });
  await page.screenshot({ path: join(out, 'recherche-telephone-long.png'), fullPage: true });
  // Votre recherche de l'app (SearchView) : une seule ligne en haut (retour de 44, lieu de 48, filtres de 48, 8 entre
  // eux), les pavés à 27 des bords, l'en-tête des résultats (nombre, tri, « Enregistrer » de 40), « Carte » 14 au-dessus
  // de la barre d'onglets ; ni en-tête bleu ni « + Filtres ».
  const searchTop = await page.evaluate(() => {
    const box = (selector) => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null;
    };
    const tiles = document.querySelector('.mode-tabs-search').getBoundingClientRect();
    const map = document.querySelector('.map-open');
    return {
      back: box('.search-back'), field: box('.search-app-top .place-field-app input'), filters: box('.search-app-top .filters-button'),
      tiles: [Math.round(tiles.left), Math.round(innerWidth - tiles.right)],
      head: [document.querySelector('.results-head h2')?.textContent, document.querySelector('.sort-select > span')?.textContent,
        document.querySelector('.save-search-button')?.textContent, box('.save-search-button')?.[3]],
      blueBar: document.querySelector('.topbar') ? getComputedStyle(document.querySelector('.topbar')).display : 'none',
      plusFilters: [...document.querySelectorAll('button')].filter((button) => button.textContent.includes('+ Filtres')).length,
      map: [map.className, getComputedStyle(map).opacity, Math.round(document.querySelector('.tabbar').getBoundingClientRect().top - map.getBoundingClientRect().bottom)],
    };
  });
  expectSame('recherche téléphone', 'ligne du haut, pavés, en-tête, Carte', searchTop, {
    back: [16, 10, 44, 44], field: [68, 8, 250, 48], filters: [326, 8, 48, 48], tiles: [27, 27],
    head: ['1 annonce', 'Triées par pertinence', 'Enregistrer', 40], blueBar: 'none', plusFilters: 0, map: ['map-open', '1', 14],
  });
  // Pendant la saisie du lieu, « Carte » s'efface ; sans compte, « Enregistrer » demande la connexion.
  await page.click('.search-app-top .place-field-app input');
  await page.waitForTimeout(300);
  expectSame('recherche téléphone', 'Carte pendant la saisie', await page.$eval('.map-open', (el) => [el.className, el.getAttribute('aria-hidden')]), ['map-open is-hidden', 'true']);
  await page.click('.results-head h2');
  await page.click('.save-search-button');
  await page.waitForSelector('dialog.signin-sheet[open]', { timeout: 4000 })
    .catch(() => problems.push('recherche téléphone : « Enregistrer » sans compte n\'ouvre pas la connexion'));
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.signin-sheet[open]', { state: 'detached', timeout: 4000 }).catch(() => undefined);
  // Carte de l'app (MapTabView) : une ligne en haut, retour, lieu et filtres (48 chacun, 10 entre eux, 14 des bords, 6
  // sous le haut de l'écran) ; ni pavés, ni pastilles, ni « Liste » ; les commandes 10 dessous ; zoom au doigt. Sur une
  // page neuve, ouverte par l'adresse (vue=carte) : après une capture pleine page, Chrome oublie l'écran tactile simulé
  // (survol, pointeur) pour le reste de la page.
  const mapPage = await open(phone, '/recherche/?mode=buy&vue=carte', 'carte-telephone');
  await mapPage.waitForSelector('.map-column.is-open .map-marker', { timeout: 15000 });
  await mapPage.waitForTimeout(400);
  await mapPage.screenshot({ path: join(out, 'carte-telephone.png') });
  expectSame('carte téléphone', 'ligne du haut, commandes', await mapPage.evaluate(() => {
    const box = (selector) => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null;
    };
    return {
      back: box('.map-back'), field: box('.map-app-top .place-field-app input'), filters: box('.map-app-top .filters-button'),
      tools: box('.map-column .map-round'), others: document.querySelectorAll('.map-column .mode-tabs, .map-column .criterion-chip, .map-close').length,
      zoom: getComputedStyle(document.querySelector('.map-column .maplibregl-ctrl-top-right')).display,
    };
  }), { back: [14, 6, 48, 48], field: [72, 6, 246, 48], filters: [328, 6, 48, 48], tools: [328, 64, 48, 48], others: 0, zoom: 'none' });
  await mapPage.close();
  await page.click('.map-open');
  await page.waitForSelector('.map-marker', { timeout: 15000 });
  await page.waitForTimeout(400);
  // Panneau du bas de l'app (MapResultsPanel) en hauteur moyenne, la vignette au-dessus (cadrage de l'app : entre la
  // ligne du haut et le panneau). Premier toucher de la vignette (MapTabView.tap) : le bien est choisi, sa carte au
  // centre du panneau ; plus d'aperçu flottant. Toucher le fond de la carte le désélectionne.
  const markerAbovePanel = await page.evaluate(() => document.querySelector('.map-marker-button').getBoundingClientRect().bottom
    <= document.querySelector('.map-panel').getBoundingClientRect().top);
  await page.tap('.map-marker-button');
  await page.waitForSelector('.map-marker.is-selected', { timeout: 4000 }).catch(() => problems.push('carte téléphone : le toucher ne choisit pas le bien'));
  // La carte se centre sur le bien (0,35 s).
  await page.waitForTimeout(600);
  expectSame('carte téléphone', 'premier toucher d\'une vignette [au-dessus du panneau, panneau, titre, carte choisie, encore au-dessus du panneau, aperçu]', [markerAbovePanel,
    await page.$eval('.map-panel', (panel) => panel.classList.contains('is-medium')), (await page.textContent('.map-panel-titles h2'))?.replace(/\s/g, ' '),
    await page.locator('.map-panel .map-card.is-selected').count(),
    await page.evaluate(() => document.querySelector('.map-marker.is-selected .map-marker-button').getBoundingClientRect().bottom
      <= document.querySelector('.map-panel').getBoundingClientRect().top),
    await page.locator('.map-preview').count()], [true, true, '1 bien sur la carte', 1, true, 0]);
  await page.screenshot({ path: join(out, 'carte-telephone-apercu.png') });
  // À gauche, loin du zoom : après la capture pleine page, Chrome remontre le zoom (en haut à droite) sur cette page.
  await page.tap('.map-canvas', { position: { x: 40, y: 200 } });
  await page.waitForSelector('.map-marker.is-selected', { state: 'detached', timeout: 4000 })
    .catch(() => problems.push('carte téléphone : toucher le fond ne désélectionne pas le bien'));
  // Les filtres s'ouvrent depuis la carte, sans « Voir sur la carte » ; Échap les referme sans fermer la carte ;
  // « Retour » rend la liste.
  await page.click('.map-app-top .filters-button');
  await page.waitForSelector('dialog.filters-dialog[open]');
  expectSame('carte téléphone', 'filtres ouverts depuis la carte : « Voir sur la carte »', await page.locator('dialog[open] .filters-map-link').count(), 0);
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.filters-dialog[open]', { state: 'detached', timeout: 4000 })
    .catch(() => problems.push('carte téléphone : Échap ne referme pas les filtres'));
  expectSame('carte téléphone', 'carte encore ouverte après Échap des filtres', await page.locator('.map-column.is-open').count(), 1);
  await page.click('.map-back');
  await page.waitForSelector('.map-column:not(.is-open)', { state: 'attached', timeout: 4000 })
    .catch(() => problems.push('carte téléphone : « Retour » ne referme pas la carte'));
  await page.click('.filters-button');
  await page.waitForSelector('dialog.filters-dialog[open]');
  await checkApplyButton(page, 'filtres téléphone');
  // Ordre de l'app : en-tête, pavés des catégories (à 27 des bords de l'écran), localisation, pastilles, critères.
  expectSame('filtres téléphone', 'ordre, pavés', await page.evaluate(() => {
    const scroll = document.querySelector('dialog[open] .filters-scroll');
    const order = [...scroll.querySelectorAll('.filters-header, .filters-modes, .filter-card')].slice(0, 3)
      .map((el) => el.querySelector('h3')?.textContent ?? el.classList[el.classList.length - 1]);
    const tiles = scroll.querySelector('.filters-modes').getBoundingClientRect();
    return [order, Math.round(tiles.left), Math.round(innerWidth - tiles.right)];
  }), [['filters-header', 'filters-modes', 'Localisation'], 27, 27]);
  await page.screenshot({ path: join(out, 'filtres-telephone.png') });
  await page.evaluate(() => document.querySelector('dialog[open] .filters-scroll')?.scrollTo(0, 1e6));
  await page.screenshot({ path: join(out, 'filtres-telephone-bas.png') });
  // « Voir sur la carte » : applique les filtres et ouvre la carte, gardée dans l'adresse.
  await page.evaluate(() => document.querySelector('dialog[open] .filters-scroll')?.scrollTo(0, 0));
  await page.click('dialog[open] .filters-map-link');
  await page.waitForSelector('.map-column.is-open');
  if (!page.url().includes('vue=carte')) problems.push(`carte : adresse sans « vue=carte » (${page.url()})`);
  await page.click('.map-back');
  if (page.url().includes('vue=carte')) problems.push(`carte : « vue=carte » reste après fermeture (${page.url()})`);
  // Échap referme aussi la carte plein écran (vérifié avant à 1440 et 1024 ; sur ordinateur, depuis l'étape 2, la carte
  // est toujours à côté de la liste et Échap n'y change rien).
  await page.click('.map-open');
  await page.waitForSelector('.map-column.is-open');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.map-column.is-open') && !location.search.includes('vue=carte'), null, { timeout: 4000 })
    .catch(() => problems.push('carte téléphone : Échap ne referme pas la carte'));
  page = await open(phone, '/recherche/?mode=rent', 'location-telephone');
  await page.waitForSelector('.listing-card');
  await page.screenshot({ path: join(out, 'location-telephone.png'), fullPage: true });
  // Location : charges et date de disponibilité (interrupteur, puis calendrier dans un mois).
  await page.click('.filters-button');
  await page.waitForSelector('dialog.filters-dialog[open]');
  await page.getByRole('switch', { name: 'Disponible au plus tard le' }).check();
  const day = await page.inputValue('dialog[open] .date-input');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) problems.push(`location : date de disponibilité « ${day} »`);
  await page.getByRole('heading', { name: 'Charges et disponibilité' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, 'filtres-location-telephone.png') });
  const rentChips = await page.locator('dialog[open] .criterion-chip:not(.is-leaving)').allTextContents();
  if (!rentChips.some((c) => /^Dispo\. avant le /.test(c))) problems.push(`location : pastilles « ${rentChips.join(' | ')} »`);
  // Liste de la recherche : « Baisse de prix · avant 195 000 € » sous le rendement (ListingBadgePill), « Déjà vue » sur
  // une fiche déjà ouverte dans l'onglet (AlreadySeenTag).
  // Les fiches ouvertes sont celles du compte connecté (une liste par compte, n° 114) : sans compte, aucune n'est
  // « Déjà vue », même avec la liste du compte dans ce navigateur.
  page = await open(phone, '/recherche/?mode=invest', 'recherche-badges-telephone-sans-compte');
  await page.waitForSelector('.listing-card');
  await page.evaluate(([id, owner]) => localStorage.setItem(`nidalo.consultes.${owner}`, JSON.stringify([id])), [listings[1].id, USER_ID]);
  await page.reload();
  await page.waitForSelector('.listing-card');
  await page.waitForTimeout(400);
  expectSame('recherche téléphone sans compte', '« Déjà vue »', await page.locator('.already-seen-tag').count(), 0);
  await page.evaluate((owner) => localStorage.removeItem(`nidalo.consultes.${owner}`), USER_ID);
  {
    const seenPhone = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
    await mock(seenPhone, { signedIn: true });
    await seenPhone.addInitScript(([id, owner]) => {
      try { localStorage.setItem(`nidalo.consultes.${owner}`, JSON.stringify([id])); } catch { /* indisponible */ }
    }, [listings[1].id, USER_ID]);
    const seenPage = await open(seenPhone, '/recherche/?mode=invest', 'recherche-badges-telephone');
    await seenPage.waitForSelector('.listing-card .already-seen-tag', { timeout: 8000 }).catch(() => undefined);
    expectSame('recherche téléphone', 'pastilles des cartes', await seenPage.$$eval('.listing-card', (cards) => cards.map((card) => [
      [...card.querySelectorAll('.listing-card-badges > *')].map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
      card.querySelector('.already-seen-tag')?.textContent.trim() ?? null])),
    [[['5,5 % de rendement brut', 'Baisse de prix · avant 195 000 €'], 'Déjà vue']]);
    await seenPage.screenshot({ path: join(out, 'recherche-badges-telephone.png') });
    await seenPhone.close();
  }
  // Aucune annonce (SearchNoResults) : les pistes comptées par de vraies recherches, l'alerte, « Effacer tous les
  // critères » ; ni en-tête des résultats ni « Carte ». Une piste applique la recherche qu'elle a comptée.
  page = await open(phone, '/recherche/?mode=buy&lieu=Lyon&prixMax=50000&piecesMin=2', 'recherche-vide-telephone');
  await page.waitForSelector('.no-results-hints', { timeout: 8000 }).catch(() => undefined);
  expectSame('recherche téléphone', 'aucune annonce', [await textOf(page, '.no-results-title'), await textOf(page, '.no-results-text'),
    await page.$$eval('.no-results-hint', (rows) => rows.map((row) => [row.querySelector('.no-results-hint-label').textContent.replace(/\s+/g, ' '),
      row.querySelector('.no-results-hint-count').textContent.replace(/\s+/g, ' ')])),
    await textOf(page, '.no-results-alert'), await textOf(page, '.no-results-clear'), await page.locator('.results-head').count(),
    await page.$eval('.map-open', (el) => el.className)],
  ['Aucune annonce trouvée', 'Voici ce qui en ferait apparaître :', [['Sans « Budget : 50 k€ »', '1 annonce']],
    "M'alerter dès qu'une annonce arrive", 'Effacer tous les critères', 0, 'map-open is-hidden']);
  await page.screenshot({ path: join(out, 'recherche-vide-telephone.png'), fullPage: true });
  await page.click('.no-results-hint');
  await page.waitForSelector('.listing-card');
  if (page.url().includes('prixMax') || !page.url().includes('piecesMin=2')) problems.push(`recherche téléphone : piste appliquée ${page.url()}`);
  // « Retour » de la ligne du haut : la page d'avant la recherche (l'accueil ici), même après des critères changés.
  page = await open(phone, '/', 'retour-recherche-telephone');
  await page.waitForSelector('#villes');
  await page.click('.home-city >> nth=0');
  await page.waitForSelector('.search-app-top');
  await page.click('.mode-tabs-search .mode-tab >> nth=1');
  await page.waitForFunction(() => location.search.includes('mode=rent'));
  await page.click('.search-back');
  await page.waitForFunction(() => location.pathname === '/', null, { timeout: 4000 })
    .catch(() => problems.push(`recherche téléphone : « Retour » mène à ${page.url()} au lieu de l'accueil`));
  page = await open(phone, '/compte/', 'compte-connexion-telephone');
  await page.waitForSelector('.signin-card');
  await page.screenshot({ path: join(out, 'compte-connexion-telephone.png') });
  // Conditions d'utilisation (LegalPageView de l'app, en feuille ; étape 2 du site comme l'app) : un clic ouvre la
  // feuille par-dessus la connexion, 24 sous le haut de l'écran, avec l'en-tête « Conditions » et le texte de la page
  // /conditions/ ; l'adresse ne change pas ; Échap la referme.
  await page.click('.signin-card .auth-mentions a[href="/conditions/"]');
  await page.waitForSelector('dialog.legal-sheet[open] .legal-sheet-doc h1', { timeout: 8000 })
    .catch(() => problems.push('connexion téléphone : la feuille des conditions ne s\'ouvre pas'));
  await page.waitForTimeout(600);
  expectSame('connexion téléphone', 'feuille des conditions [adresse, en-tête, titre du texte, haut, bas]', await page.evaluate(() => {
    const sheet = document.querySelector('dialog.legal-sheet[open]');
    const box = sheet?.getBoundingClientRect();
    return [location.pathname, sheet?.querySelector('.app-page-header-title')?.textContent ?? null, sheet?.querySelector('.legal-sheet-doc h1')?.textContent ?? null,
      box ? Math.round(box.top) : null, box ? Math.round(innerHeight - box.bottom) : null];
  }), ['/compte/', 'Conditions', 'Conditions d’utilisation', 24, 0]);
  await page.screenshot({ path: join(out, 'connexion-conditions-telephone.png') });
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.legal-sheet[open]', { state: 'detached', timeout: 4000 })
    .catch(() => problems.push('connexion téléphone : Échap ne referme pas la feuille des conditions'));
  await phone.close();

  // Téléphone, avec le compte de test.
  const signedPhone = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  const signedPhoneServer = await mock(signedPhone, { signedIn: true });
  page = await open(signedPhone, '/compte/', 'compte-espace-telephone');
  await page.waitForSelector('.app-space .app-row');
  // Mon compte comme l'app (étape 3) : grand titre et cloche (point rouge des non-lues), carte du profil, puis les groupes
  // de l'app avec leurs lignes, leurs teintes et leurs sous-titres (rien à zéro) ; chaque ligne mène à l'écran du site.
  {
    const M = 'Mon compte téléphone';
    const unread = expectedBadges(signedPhoneServer.state).notifications;
    await page.waitForFunction(() => /1 en ligne/.test(document.querySelector('.app-space')?.innerText ?? '')
      && Boolean(document.querySelector('.app-space-header .app-round-dot')), null, { timeout: 8000 }).catch(() => undefined);
    expectSame(M, 'en-tête et profil', [await textOf(page, '.app-space-header h1'), await page.getAttribute('.app-space-header .app-round', 'href'),
      await page.getAttribute('.app-space-header .app-round', 'aria-label'), await page.locator('.app-space-header .app-round-dot').count(),
      await textOf(page, '.space-profile-name'), await textOf(page, '.space-profile-line'), await textOf(page, '.space-profile-badge'),
      await textOf(page, '.space-profile-action'), await textOf(page, '.space-profile-photo'), await page.getAttribute('.space-profile', 'href')],
    ['Mon espace', '/compte/?vue=notifications', `Notifications, ${unread} non lues`, 1, 'Claire Martin', USER_EMAIL, 'Particulier', 'Modifier', 'C',
      '/compte/?vue=informations']);
    const soon = (key) => `/compte/?vue=bientot&ecran=${key}`;
    expectSame(M, 'groupes et lignes', await page.$$eval('.app-menu-group', (groups) => groups.map((group) => [group.querySelector('.app-section-label')?.textContent ?? null,
      [...group.querySelectorAll('.app-row')].map((row) => [row.querySelector('.app-row-title')?.textContent ?? null, row.querySelector('.app-row-subtitle')?.textContent ?? null,
        row.getAttribute('href'), row.querySelector('.app-row-tile')?.className.replace('app-row-tile is-', '') ?? null])])), [
      ['Mon espace', [['Mon agenda', null, '/compte/?vue=agenda', 'blue'], ['Mes recherches', '2 recherches enregistrées', '/compte/?vue=recherches', 'blue'],
        ['Biens consultés', null, '/compte/?vue=consultes', 'blue'], ['Mon projet', 'Résidence principale · Lyon', '/compte/?vue=projet', 'green'],
        ['Mes annonces', '1 en ligne', '/compte/?vue=annonces', 'blue']]],
      ['Contrats et location', [['Mon bail de location', null, soon('bail'), 'teal'], ['Quittances de loyer', null, soon('quittances'), 'teal'],
        ['États des lieux', null, soon('etats'), 'teal'], ['Offres et compromis', null, soon('offres'), 'amber'], ['Documents à signer', null, soon('signature'), 'amber'],
        ['Mon dossier immobilier', null, soon('dossier'), 'teal']]],
      ['Compte et sécurité', [['Connexion et sécurité', null, '/compte/?vue=securite', 'gray'], ['Confidentialité et données', null, '/compte/?vue=confidentialite', 'gray'],
        ['Type de compte', 'Particulier', '/compte/?vue=type', 'gray']]],
      // Comme l'app : la cloche de l'en-tête remplace la ligne « Notifications » ; « Alertes sur cet iPhone » reste dans
      // l'app ; Préférences, Aide et assistance et les textes légaux s'ouvrent dans Mon compte.
      ['Paramètres et assistance', [['Préférences', null, '/compte/?vue=preferences', 'gray'],
        ['Aide et assistance', null, '/compte/?vue=aide', 'gray'], ['Informations légales', null, '/compte/?vue=legal', 'gray']]],
    ]);
    // Mesures de l'app : lignes de 64 px au moins, carré d'icône de 40, carte du profil de 105 (nom, e-mail et pastille,
    // plus hauts que la photo de 64, marges de 16 et bord), « Se déconnecter » de 52, rien ne dépasse de l'écran.
    expectSame(M, 'mesures', await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      return [Math.round(box('.app-row').height), Math.round(box('.app-row-tile').width), Math.round(box('.space-profile').height), Math.round(box('.logout-button').height),
        Math.round(box('.app-space-header .app-round').width), document.documentElement.scrollWidth - innerWidth];
    }), [64, 40, 105, 52, 44, 0]);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'compte-espace-telephone.png') });
  await page.screenshot({ path: join(out, 'compte-espace-telephone-long.png'), fullPage: true });
  page = await open(signedPhone, '/favoris/', 'favoris-telephone');
  await page.waitForSelector('.favorite-card');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'favoris-telephone.png') });
  await page.screenshot({ path: join(out, 'favoris-telephone-long.png'), fullPage: true });
  page = await open(signedPhone, '/compte/?vue=informations', 'mes-informations-telephone');
  await phoneFavorites();
  await page.waitForSelector('input[autocomplete="tel"]');
  await page.screenshot({ path: join(out, 'mes-informations-telephone-long.png'), fullPage: true });
  // « Enregistrer » sur téléphone (feuille de l'app à mi-hauteur, étape 2 du site comme l'app) : de toute la largeur,
  // posée en bas, la moitié de l'écran au moins, coins de 32 en haut, poignée de 36 × 5, le contenu au milieu (autant
  // de place au-dessus du titre que sous « Enregistrer ») ; Échap la referme.
  page = await open(signedPhone, '/recherche/?mode=buy&lieu=Lyon', 'enregistrer-telephone');
  await page.waitForSelector('.save-search-button');
  await page.click('.save-search-button');
  await page.waitForSelector('dialog.save-search-sheet[open] .save-search-name');
  await page.waitForTimeout(700);
  expectSame('enregistrer téléphone', 'feuille [gauche, largeur, bas, moitié de l\'écran, coins, poignée, contenu au milieu]', await page.evaluate(() => {
    const sheet = document.querySelector('dialog.save-search-sheet[open]');
    const box = sheet.getBoundingClientRect();
    const grabber = sheet.querySelector('.save-search-grabber')?.getBoundingClientRect();
    const above = sheet.querySelector('.save-search-titles').getBoundingClientRect().top - box.top;
    const below = box.bottom - sheet.querySelector('.save-search-submit').getBoundingClientRect().bottom;
    return [Math.round(box.left), Math.round(box.width) === innerWidth, Math.round(innerHeight - box.bottom), box.height >= innerHeight / 2 - 1,
      getComputedStyle(sheet).borderTopLeftRadius, grabber ? `${Math.round(grabber.width)}×${Math.round(grabber.height)}` : null,
      above > 20 && Math.abs(above - below) <= 2];
  }), [0, true, 0, true, '32px', '36×5', true]);
  await page.screenshot({ path: join(out, 'enregistrer-recherche-telephone.png') });
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.save-search-sheet[open]', { state: 'detached', timeout: 4000 })
    .catch(() => problems.push('enregistrer téléphone : Échap ne referme pas la feuille'));
  await signedPhone.close();

  // « Quel est votre profil ? » comme l'app (étape 3), pour un compte tout neuf : « Étape 2 sur 2 » et sa barre, les deux
  // cartes de choix, « Avec ce compte » (trois lignes du type choisi), les justificatifs, la réassurance et « Continuer en
  // tant que… » ; sur téléphone, sans barre du bas et le bouton toujours en bas de l'écran. « Continuer » enregistre le
  // type comme avant (profiles.account_type) ; le retour déconnecte. À 390 et 320 px, et à 1440 px.
  for (const [device, size] of [['iPhone 13', null], ['iPhone SE', null], [null, [1440, 900]]]) {
    const P = `profil ${device ?? `${size[0]} px`}`;
    const suffix = device === 'iPhone SE' ? '-320' : device === null ? `-${size[0]}` : '';
    const context = await browser.newContext(device ? { ...devices[device], locale: 'fr-FR' } : { viewport: { width: size[0], height: size[1] }, locale: 'fr-FR' });
    await context.addInitScript(() => { try { localStorage.setItem('nidalo.newAccount', '1'); } catch { /* stockage indisponible */ } });
    await mock(context, { signedIn: true });
    const profileAsked = badgeRequests.length;
    page = await open(context, '/compte/', P);
    await page.getByRole('heading', { name: 'Quel est votre profil ?' }).waitFor({ timeout: 8000 }).catch(() => problems.push(`${P} : écran absent`));
    const screen = async () => page.evaluate(() => {
      const text = (element) => element?.textContent.replace(/\s+/g, ' ').trim() ?? null;
      return {
        top: [text(document.querySelector('.app-profile-top .app-round')) === '' ? document.querySelector('.app-profile-top .app-round').getAttribute('aria-label') : null,
          text(document.querySelector('.app-profile-step-text')),
          [...document.querySelectorAll('.app-step-bar > span')].map((segment) => segment.classList.contains('is-done'))],
        titles: [text(document.querySelector('.app-profile-title')), text(document.querySelector('.app-profile-subtitle'))],
        cards: [...document.querySelectorAll('.app-type-cards [role="radio"]')].map((card) => [text(card.querySelector('.app-type-title')),
          text(card.querySelector('.app-type-detail')), card.getAttribute('aria-checked')]),
        rows: [text(document.querySelector('.app-profile-label')), [...document.querySelectorAll('.app-profile-benefits-list:not(.is-leaving) .app-row')]
          .map((row) => [text(row.querySelector('.app-row-title')), text(row.querySelector('.app-row-subtitle')), row.querySelector('.app-row-tile').className.replace('app-row-tile is-', ''),
            row.tagName, row.querySelector('.app-row-chevron') !== null])],
        bottom: [text(document.querySelector('.app-profile-papers')), text(document.querySelector('.app-profile-note')), text(document.querySelector('.app-profile-continue'))],
      };
    });
    const wanted = (type) => ({
      top: ['Retour', 'Étape 2 sur 2', [true, true]],
      titles: ['Quel est votre profil ?', 'Choisissez le type de compte qui correspond à votre situation.'],
      cards: [['Particulier', 'Je recherche un bien, je loue, je vends ou je souhaite investir.', String(type === 'individual')],
        ['Professionnel', 'Agence, promoteur, mandataire ou gestionnaire immobilier.', String(type === 'professional')]],
      rows: ['Avec ce compte', type === 'individual'
        ? [['Mon projet immobilier', 'Critères, budget et dossier', 'green', 'DIV', false], ['Mon agenda de visites', 'Demandes, rappels et comptes rendus', 'blue', 'DIV', false],
          ['Contrats et location', 'Bail, quittances, états des lieux, offres', 'teal', 'DIV', false]]
        : [['Annonces et mandats', 'Diffusion, suivi et statistiques', 'blue', 'DIV', false], ['Contacts et ventes', 'Acquéreurs, vendeurs, compromis signés', 'blue', 'DIV', false],
          ['Équipe et profil agence', 'Collaborateurs et page de l\'agence', 'blue', 'DIV', false]]],
      bottom: [type === 'individual' ? 'Aucun justificatif à fournir' : 'À fournir ensuite : Kbis, carte professionnelle, RCP', 'Modifiable à tout moment depuis Mon compte',
        type === 'individual' ? 'Continuer en tant que particulier' : 'Continuer en tant que professionnel'],
    });
    expectSame(P, 'particulier', await screen(), wanted('individual'));
    // Comme l'app, sur toutes les largeurs : pas de barre du bas, le bouton collé en bas de la fenêtre pendant que la
    // page défile ; sur ordinateur, la page (colonne de 720 px, 688 de contenu) tient dans la fenêtre de 900 px : le
    // bouton suit le contenu, entier dans la fenêtre.
    const place = () => page.evaluate(() => [getComputedStyle(document.querySelector('.tabbar')).display,
      Math.round(document.querySelector('.app-profile-bottom').getBoundingClientRect().bottom) - innerHeight, getComputedStyle(document.querySelector('.app-profile-bottom')).position]);
    if (device) {
      expectSame(P, 'bas de l\'écran', await place(), ['none', 0, 'sticky']);
      await phoneFits(page, P);
    } else {
      // Ordinateur : pas de barre d'onglets, et l'en-tête de l'ordinateur s'efface comme elle (version ordinateur, étape 0).
      const [bar, gap, position] = await page.evaluate(() => [document.querySelector('.tabbar') ? 'barre d\'onglets' : getComputedStyle(document.querySelector('.site-header')).display,
        Math.round(document.querySelector('.app-profile-bottom').getBoundingClientRect().bottom) - innerHeight, getComputedStyle(document.querySelector('.app-profile-bottom')).position]);
      expectSame(P, 'bas de la page [en-tête de l\'ordinateur, bouton dans la fenêtre, position]', [bar, gap <= 0, position], ['none', true, 'sticky']);
      if ((await contentWidth(page, '.account-wrap')) !== 688) problems.push(`${P} : colonne de ${await contentWidth(page, '.account-wrap')} px au lieu de 688`);
    }
    if (device === 'iPhone 13') {
      // Mesures de l'app : retour de 44, barre de 4, cartes aux coins de 22, carré d'icône de 42, rond coché de 24, bouton de 52 (coins 12).
      expectSame(P, 'mesures', await page.evaluate(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect();
        const style = (selector) => getComputedStyle(document.querySelector(selector));
        return [Math.round(box('.app-profile-top .app-round').width), Math.round(box('.app-step-bar > span').height), style('.app-type-card').borderRadius,
          Math.round(box('.app-type-icon').width), Math.round(box('.app-type-card.is-selected .app-type-check').width), Math.round(box('.app-profile-continue').height),
          style('.app-profile-continue').borderRadius];
      }), [44, 4, '22px', 42, 24, 52, '12px']);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, `profil-particulier${suffix}.png`) });
    await page.getByRole('radio', { name: /Professionnel/ }).click();
    await page.waitForFunction(() => !document.querySelector('.app-profile-benefits-list.is-leaving'), null, { timeout: 4000 }).catch(() => problems.push(`${P} : liste quittée restée`));
    expectSame(P, 'professionnel', await screen(), wanted('professional'));
    if (device) {
      // Tout en bas de la page : le bas de l'écran reste visible en entier, posé au-dessus du pied de page du site.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
      expectSame(P, 'bas de l\'écran, page défilée', await page.evaluate(() => {
        const bar = document.querySelector('.app-profile-bottom').getBoundingClientRect();
        return [getComputedStyle(document.querySelector('.tabbar')).display, bar.top >= 0 && bar.bottom <= innerHeight,
          bar.bottom <= document.querySelector('footer.footer').getBoundingClientRect().top];
      }), ['none', true, true]);
      await phoneFits(page, `${P} (professionnel)`);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, `profil-professionnel${suffix}.png`) });
    // Compte tout neuf : pas de pastille Messages tant que le profil n'est pas choisi (showsUnreadBadge, n° 44).
    if (badgeRequests.slice(profileAsked).some((request) => request.table === 'rpc/my_conversations')) problems.push(`${P} : non-lus lus pour un compte tout neuf`);
    // « Continuer en tant que professionnel » : le type enregistré, comme avant, puis Mon compte.
    const before = writes.length;
    await page.getByRole('button', { name: /Continuer/ }).click();
    await page.getByRole('heading', { name: 'Quel est votre profil ?' }).waitFor({ state: 'detached', timeout: 8000 }).catch(() => problems.push(`${P} : l'écran ne se ferme pas`));
    expectSame(P, 'type enregistré', writes.slice(before).map((write) => [write.method, write.table, write.search, write.body]),
      [['PATCH', 'profiles', `?id=eq.${USER_ID}`, { account_type: 'professional' }]]);
    expectSame(P, 'compte tout neuf', await page.evaluate(() => localStorage.getItem('nidalo.newAccount')), null);
    await page.close();
    // Retour : déconnexion, comme l'app ; l'écran de connexion revient.
    if (device === 'iPhone 13') {
      page = await open(context, '/compte/', `${P} retour`);
      await page.getByRole('heading', { name: 'Quel est votre profil ?' }).waitFor({ timeout: 8000 }).catch(() => problems.push(`${P} : écran absent au retour`));
      await page.getByRole('button', { name: 'Retour', exact: true }).click();
      await page.waitForSelector('.signin-card', { timeout: 8000 }).catch(() => problems.push(`${P} : le retour ne déconnecte pas`));
      expectSame(P, 'retour', [await page.locator('.app-profile-step').count(), await page.evaluate(() => localStorage.getItem('nidalo.newAccount'))], [0, null]);
      await page.close();
    }
    await context.close();
  }

  // Haut des pages du téléphone (étape 3) : plus d'en-tête bleu sous 1024 px. Chaque page commence comme son écran de
  // l'app : grand titre d'un onglet (Favoris, Messages, Mon compte), retour et titre d'un écran poussé ; les pages que
  // l'app n'a pas (aide, pages légales, 404, « bientôt », annonce introuvable) ont le retour rond et le titre, leur h1
  // restant pour les lecteurs d'écran ; le retour ramène à la page précédente du site, sinon à sa page. Une conversation
  // ouverte garde sa barre et toute la hauteur. Fond de page et barre du navigateur aux couleurs de l'app. Entre 761 et
  // 1023 px (l'iPhone couché), c'est aussi la page du téléphone, avec la barre d'onglets en bas. Captures :
  // haut-telephone-*.png.
  {
    const T = 'haut du téléphone';
    const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
    await mock(context, { signedIn: true });
    const topOf = (p) => p.evaluate(() => {
      const header = document.querySelector('.phone-page-head .app-page-header');
      const title = header?.querySelector('.app-page-header-title');
      return {
        band: [...document.querySelectorAll('.topbar')].every((bar) => getComputedStyle(bar).display === 'none'),
        background: getComputedStyle(document.body).backgroundColor,
        header: header ? [Math.round(header.getBoundingClientRect().top), header.querySelector('.app-round')?.getAttribute('href') ?? null,
          header.querySelector('.app-round')?.getAttribute('aria-label') ?? null, title?.textContent ?? null, title?.tagName ?? null, title?.getAttribute('aria-hidden') ?? null] : null,
        // h1 de la page : son texte, et masqué à l'écran (1 px), lu par les lecteurs d'écran.
        h1: [...document.querySelectorAll('main h1')].map((heading) => [heading.textContent.trim(), Math.round(heading.getBoundingClientRect().width) <= 1]),
      };
    });
    page = await open(context, '/aide/', `${T} aide`);
    // Sur toutes les largeurs (plus de barre blanche en haut sur ordinateur) : le fond de page de l'app.
    expectSame(T, 'couleur de la barre du navigateur', await page.$$eval('meta[name="theme-color"]', (metas) => metas.map((meta) => [meta.getAttribute('content'), meta.getAttribute('media')])),
      [['#FAF9F6', null]]);
    await page.close();
    const unknownListing = '6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1aff';
    for (const [path, title, back, file] of [['/aide/', 'Aide', '/', 'aide'], ['/conditions/', 'Conditions d’utilisation', '/', 'conditions'],
      ['/confidentialite/', 'Politique de confidentialité', '/', 'confidentialite'], ['/mentions-legales/', 'Mentions légales', '/', 'mentions-legales'],
      ['/page-inexistante/', 'Page introuvable', '/', '404'],
      [`/annonce/?id=${unknownListing}`, 'Annonce introuvable', '/recherche/', 'annonce-introuvable']]) {
      // La page 404 répond avec le code 404 (signalé par Chrome, voir open()).
      const name = file === '404' ? `404 ${T}` : `${T} ${file}`;
      page = await open(context, path, name);
      await page.waitForSelector('.phone-page-head .app-page-header', { timeout: 8000 }).catch(() => problems.push(`${name} : ni retour ni titre`));
      expectSame(name, 'haut de la page', await topOf(page), { band: true, background: 'rgb(250, 249, 246)', header: [6, back, 'Retour', title, 'P', 'true'], h1: [[title, true]] });
      await phoneFits(page, name);
      await page.screenshot({ path: join(out, `haut-telephone-${file}.png`) });
      await page.close();
    }
    // Publier (étape 6) : l'assistant plein écran de l'app (PublishFlowView), son propre en-tête en haut (le rond qui
    // ferme, « Publier une annonce » visible), sans en-tête bleu, sans retour du site ni barre d'onglets.
    page = await open(context, '/publier/', `${T} publier`);
    await page.waitForSelector('.ppub-head h1', { timeout: 8000 }).catch(() => problems.push(`${T} publier : en-tête de l'assistant absent`));
    expectSame(`${T} publier`, 'haut de la page', [await topOf(page), await page.evaluate(() => [Math.round(document.querySelector('.ppub-head').getBoundingClientRect().top),
      document.querySelector('.ppub-back')?.getAttribute('aria-label') ?? null, [...document.querySelectorAll('.tabbar')].every((bar) => getComputedStyle(bar).display === 'none')])],
    [{ band: true, background: 'rgb(250, 249, 246)', header: null, h1: [['Publier une annonce', false]] }, [0, 'Fermer la publication', true]]);
    await phoneFits(page, `${T} publier`);
    await page.screenshot({ path: join(out, 'haut-telephone-publier.png') });
    await page.close();
    // Comparer (CompareView de l'app, en plein écran, étape 2 du site comme l'app) : grand titre et « Fermer » en haut,
    // sans retour rond ni barre d'onglets ; ouvert seul, « Fermer » mène à la recherche.
    page = await open(context, '/comparer/', `${T} comparer`);
    await page.waitForSelector('.cmpm h1', { timeout: 8000 }).catch(() => problems.push(`${T} comparer : grand titre absent`));
    expectSame(`${T} comparer`, '[sans en-tête bleu, fond, titre, titre en haut, Fermer, retour rond, barre d\'onglets]', await page.evaluate(() => [
      [...document.querySelectorAll('.topbar')].every((bar) => getComputedStyle(bar).display === 'none'), getComputedStyle(document.body).backgroundColor,
      document.querySelector('.cmpm h1').textContent, Math.round(document.querySelector('.cmpm h1').getBoundingClientRect().top) <= 24,
      document.querySelector('.cmpm-close')?.textContent.trim(), document.querySelectorAll('.phone-page-head').length, getComputedStyle(document.querySelector('.tabbar')).display]),
    [true, 'rgb(250, 249, 246)', 'Comparer', true, 'Fermer', 0, 'none']);
    await phoneFits(page, `${T} comparer`);
    await page.screenshot({ path: join(out, 'haut-telephone-comparer.png') });
    await Promise.all([page.waitForURL(`${base}/recherche/`, { timeout: 8000 }).catch(() => problems.push(`${T} : « Fermer » de Comparer ouvert seul mène à ${page.url()}`)),
      page.click('.cmpm-close')]);
    await page.close();
    // Onglets : leur grand titre en haut, sans en-tête bleu ; conversation ouverte : sa barre en haut, toute la hauteur.
    // Messages avec ses conversations simulées (chatContext).
    const { context: chatPhone } = await chatContext({ phone: true });
    for (const [tabContext, path, selector, file] of [[context, '/favoris/', '.favorites-head h1', 'favoris'], [chatPhone, '/messages/', '.dm-side-title h1', 'messages'],
      [context, '/compte/', '.app-space-header h1', 'compte']]) {
      page = await open(tabContext, path, `${T} ${file}`);
      await page.waitForSelector(selector, { timeout: 8000 }).catch(() => problems.push(`${T} ${file} : grand titre absent`));
      const facts = await page.evaluate((sel) => [[...document.querySelectorAll('.topbar')].every((bar) => getComputedStyle(bar).display === 'none'),
        getComputedStyle(document.body).backgroundColor, Math.round(document.querySelector(sel).getBoundingClientRect().top) <= 16, document.querySelectorAll('.phone-page-head').length], selector);
      expectSame(`${T} ${file}`, '[sans en-tête bleu, fond, grand titre en haut, sans retour]', facts, [true, 'rgb(250, 249, 246)', true, 0]);
      await page.screenshot({ path: join(out, `haut-telephone-${file}.png`) });
      await page.close();
    }
    {
      page = await open(chatPhone, `/messages/?c=${chatId(1)}`, `${T} conversation`);
      await page.waitForSelector('.dm.is-thread .dm-composer', { timeout: 8000 }).catch(() => problems.push(`${T} : conversation absente`));
      expectSame(`${T} conversation`, '[haut, hauteur, barre du bas, en-tête bleu]', await page.evaluate(() => {
        const box = document.querySelector('.dm.is-thread').getBoundingClientRect();
        return [Math.round(box.top), Math.round(box.height) === innerHeight, getComputedStyle(document.querySelector('.tabbar')).display,
          document.querySelector('.topbar') ? getComputedStyle(document.querySelector('.topbar')).display : 'none'];
      }), [0, true, 'none', 'none']);
      await page.screenshot({ path: join(out, 'haut-telephone-conversation.png') });
      await chatPhone.close();
    }
    // Informations légales (étape 5) : les textes s'ouvrent dans Mon compte, comme dans l'app, avec le retour vers la liste.
    page = await open(context, '/compte/?vue=legal', `${T} retour`);
    expectSame(`${T} textes légaux`, 'liste', await page.$$eval('.app-menu-group', (groups) => groups.map((group) => [group.querySelector('.app-section-label')?.textContent ?? null,
      [...group.querySelectorAll('.app-row')].map((row) => [row.querySelector('.app-row-title')?.textContent ?? null, row.getAttribute('href')])])),
    [['Textes', [['Conditions d’utilisation', '/compte/?vue=legal&texte=conditions'], ['Politique de confidentialité', '/compte/?vue=legal&texte=confidentialite'],
      ['Mentions légales', '/compte/?vue=legal&texte=mentions']]]]);
    await page.click('a.app-row[href="/compte/?vue=legal&texte=conditions"]');
    await page.waitForSelector('.legal-text-screen .legal-section', { timeout: 8000 }).catch(() => problems.push(`${T} : le texte des conditions ne s'ouvre pas`));
    expectSame(`${T} textes légaux`, 'texte ouvert', [await textOf(page, '.screen-header h1'), await page.getAttribute('.screen-header > .app-round', 'href'),
      await textOf(page, '.legal-text-head h2'), await textOf(page, '.legal-toc .legal-card-title'), (await textOf(page, '.legal-section h3'))?.startsWith('1. ') ?? false,
      await textOf(page, '.legal-contact .app-button-primary'), await page.locator('.legal-others a').count()],
    ['Conditions', '/compte/?vue=legal', 'Conditions d’utilisation', 'Sommaire', true, 'Écrire à l\'éditeur', 2]);
    // Retour d'une page que l'app n'a pas : la page précédente du site (Informations légales), sinon l'accueil.
    await page.goto(`${base}/compte/?vue=legal`, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.location.assign('/conditions/'));
    await page.waitForURL(`${base}/conditions/`, { timeout: 8000 }).catch(() => problems.push(`${T} : « Conditions » ne s'ouvre pas`));
    await page.click('.phone-page-head .app-round');
    await page.waitForURL(`${base}/compte/?vue=legal`, { timeout: 8000 }).catch(() => problems.push(`${T} : le retour des conditions mène à ${page.url()}`));
    await page.close();
    page = await open(context, '/aide/', `${T} retour sans page précédente`);
    await page.click('.phone-page-head .app-round');
    await page.waitForURL(`${base}/`, { timeout: 8000 }).catch(() => problems.push(`${T} : le retour de l'aide ouverte seule mène à ${page.url()}`));
    await page.close();
    await context.close();
    // Entre 761 et 1023 px : la page du téléphone (retour et titre en haut, h1 lu par les lecteurs d'écran), sans en-tête
    // bleu ; la barre d'onglets de l'app en bas (42 de haut, au-dessus de la zone du bas de 4 au moins), ses cinq onglets.
    // Publier (étape 6) : l'assistant de l'app, sans retour du site ; son titre (ou celui de la connexion) reste visible.
    const tablet = await browser.newContext({ viewport: { width: 800, height: 1000 }, locale: 'fr-FR' });
    await mock(tablet);
    for (const path of ['/aide/', '/publier/', '/page-inexistante/']) {
      const name = path === '/page-inexistante/' ? `404 ${T} 800 px` : `${T} 800 px ${path}`;
      page = await open(tablet, path, name);
      await page.waitForSelector('main h1');
      expectSame(name, '[en-tête bleu, retour du téléphone, h1 visible]', [await page.locator('.topbar').isVisible(), await page.locator('.phone-page-head').isVisible(),
        await page.locator('main h1').first().evaluate((heading) => heading.getBoundingClientRect().width > 1)], path === '/publier/' ? [false, false, true] : [false, true, false]);
      if (path === '/aide/') {
        expectSame(name, 'barre d\'onglets [haut, hauteur, onglets]', await page.evaluate(() => {
          const bar = document.querySelector('.tabbar');
          const box = bar.getBoundingClientRect();
          return [Math.round(innerHeight - box.top), Math.round(box.height), [...bar.querySelectorAll('.tabbar-label')].map((label) => label.textContent)];
        }), [46, 46, ['Accueil', 'Favoris', 'Publier', 'Messages', 'Mon compte']]);
      }
      await page.close();
    }
    await tablet.close();
  }

  // Notifications sur téléphone (demande de Romain du 14 novembre) : l'écran de l'ordinateur, ouvert depuis Mon compte,
  // à 390 px (iPhone 13) et 320 px (iPhone SE). Sans compte, son message et aucune demande ; avec le compte, les lignes
  // et leurs liens, un clic marque la notification lue, « Tout lire » toutes, et une nouvelle notification arrive en
  // direct ; seules les notifications sont lues et suivies (pas de pastilles sur téléphone). Captures :
  // notifications-telephone*.png.
  {
    const guestPhone = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
    await mock(guestPhone);
    const asked = badgeRequests.length;
    page = await open(guestPhone, '/compte/?vue=notifications', 'notifications-telephone-sans-compte');
    await page.waitForSelector('.notifications-screen .app-unavailable');
    const guestText = (await page.textContent('.notifications-screen'))?.replace(/\s+/g, ' ') ?? '';
    for (const text of ['Notifications', 'Aucune notification pour l’instant', 'Connectez-vous pour recevoir les réponses à vos demandes de visite et les rappels.']) {
      if (!guestText.includes(text)) problems.push(`notifications téléphone sans compte : « ${text} » absent`);
    }
    if (await page.locator('.notifications-read-all').count()) problems.push('notifications téléphone sans compte : « Tout lire » affiché');
    await phoneFits(page, 'notifications téléphone sans compte');
    await page.screenshot({ path: join(out, 'notifications-telephone-sans-compte.png') });
    await page.close();
    if (badgeRequests.length > asked) problems.push('notifications téléphone sans compte : demandes au serveur');
    await guestPhone.close();
  }
  for (const device of ['iPhone 13', 'iPhone SE']) {
    const N = `notifications ${device}`;
    const suffix = device === 'iPhone SE' ? '-320' : '';
    const member = await browser.newContext({ ...devices[device], locale: 'fr-FR' });
    const live = await mock(member, { signedIn: true });
    // Sur l'iPhone SE, plus de 99 messages non lus : « 99+ » sur la barre d'onglets (n° 44).
    if (device === 'iPhone SE') live.state.conversations[0].unread_count = 120;
    const asked = badgeRequests.length;
    page = await open(member, '/compte/', N);
    await page.waitForSelector('.app-space .app-row');
    await checkTabBarBadge(page, live.state, N);
    // La cloche de l'en-tête (la ligne « Notifications » de l'app est remplacée par elle).
    await page.click('.app-space-header .app-round[href="/compte/?vue=notifications"]');
    await page.waitForURL(`${base}/compte/?vue=notifications`, { timeout: 8000 }).catch(() => problems.push(`${N} : la cloche ouvre ${page.url()}`));
    await page.waitForSelector('.notification-row');
    const rowsOf = () => page.$$eval('.notification-row', (links) => links.map((link) => [link.getAttribute('href'), Boolean(link.querySelector('.notification-dot'))]));
    const rows = await rowsOf();
    const known = live.state.notifications.filter((row) => NOTIFICATION_KINDS.includes(row.kind)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    expectSame(N, 'lignes [nombre, non lues, « Tout lire »]', [rows.length, rows.filter((row) => row[1]).length, await page.locator('.notifications-read-all').count()],
      [known.length, expectedBadges(live.state).notifications, 1]);
    expectSame(N, 'liens', rows.map((row) => row[0]), [`/messages/?c=${conversationId(1)}`, `/annonce/?id=${listings[0].id}`, `/annonce/?id=${listings[2].id}`,
      '/compte/?vue=demande-visite&id=e0000000-0000-4000-8000-000000000003']);
    // Écran de l'app : en-tête de page poussée (retour rond, titre centré, « Tout lire »), jours, teintes, photos, heures.
    expectSame(N, 'en-tête', [await page.getAttribute('.app-page-header .app-round', 'href'), await textOf(page, '.app-page-header-title'),
      await textOf(page, '.app-page-header-trailing')], ['/compte/', 'Notifications', 'Tout lire']);
    await checkNotificationLayout(page, N, known);
    // Mesures de l'app : carré de 40 (coins 13), point de 7, photo de 46 (coins 12), traits retirés de 76.
    expectSame(N, 'mesures', await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      const style = (selector) => getComputedStyle(document.querySelector(selector));
      return [Math.round(box('.notification-icon').width), style('.notification-icon').borderRadius, Math.round(box('.notification-dot').width),
        Math.round(box('.notification-photo').width), style('.notification-photo').borderRadius,
        getComputedStyle(document.querySelector('.notification-group .app-group')).getPropertyValue('--app-separator-inset').trim()];
    }), [40, '13px', 7, 46, '12px', '76px']);
    await waitFor(() => live.followed().includes('notifications'), `${N} : temps réel`);
    expectSame(N, 'tables suivies en direct', [...new Set(live.followed())].sort(), ['notifications']);
    // Les notifications, et les non-lus de la pastille Messages de la barre d'onglets (n° 44), lus sans temps réel.
    expectSame(N, 'lectures', [...new Set(badgeRequests.slice(asked).map((request) => request.table))].sort(), ['notifications', 'rpc/my_conversations']);
    expectSame(N, 'lectures de la pastille Messages', badgeRequests.slice(asked).filter((request) => request.table === 'rpc/my_conversations')
      .map((request) => [request.method, JSON.stringify(request.body ?? {}), request.width]).slice(0, 1), [['POST', '{}', devices[device].viewport.width]]);
    await phoneFits(page, N);
    await tallShot(page, `notifications-telephone${suffix}.png`);
    // Un clic : cette notification est marquée lue (p_ids : son id), puis son écran s'ouvre (ici l'annonce, simulée).
    await page.route(new RegExp(`^${base}/annonce/`), (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Annonce</title>' }));
    let before = writes.length;
    await page.click(`.notification-row[href="/annonce/?id=${listings[0].id}"]`);
    await page.waitForURL(/\/annonce\/\?id=/, { timeout: 8000 }).catch(() => problems.push(`${N} : le clic n'a pas ouvert l'annonce (${page.url()})`));
    expectSame(N, 'clic', writes.slice(before).filter((write) => write.table === 'rpc/mark_notifications_read').map((write) => write.body), [{ p_ids: [notificationId(2)] }]);
    await page.close();
    // « Tout lire » : mark_notifications_read avec p_ids null, puis plus aucune non lue.
    page = await open(member, '/compte/?vue=notifications', `${N}, tout lire`);
    await page.waitForSelector('.notifications-read-all');
    before = writes.length;
    await page.click('.notifications-read-all');
    await page.waitForFunction(() => !document.querySelector('.notification-dot') && !document.querySelector('.notifications-read-all'), null, { timeout: 8000 })
      .catch(() => problems.push(`${N} : après « Tout lire », non-lues encore affichées`));
    expectSame(N, 'tout lire', writes.slice(before).filter((write) => write.table === 'rpc/mark_notifications_read').map((write) => write.body), [{ p_ids: null }]);
    // En direct : une nouvelle notification s'ajoute en haut, non lue, et « Tout lire » revient.
    await waitFor(() => live.followed().includes('notifications'), `${N} : temps réel après « Tout lire »`);
    live.state.notifications.push({ id: notificationId(6), kind: 'newRequest', request_id: 'e0000000-0000-4000-8000-000000000004', listing_id: listings[0].id, conversation_id: null,
      offer_id: null, title: listings[0].title, body: 'Julien Moreau souhaite visiter ce bien.', created_at: new Date().toISOString(), read_at: null });
    live.pushChange('notifications');
    await page.waitForFunction((count) => document.querySelectorAll('.notification-row').length === count && document.querySelectorAll('.notification-dot').length === 1
      && Boolean(document.querySelector('.notifications-read-all')), known.length + 1, { timeout: 8000 }).catch(() => problems.push(`${N} : la nouvelle notification n'arrive pas en direct`));
    await page.close();
    await member.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.log('Problèmes :\n' + problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Aucun problème. Captures : ${out}`);
}
