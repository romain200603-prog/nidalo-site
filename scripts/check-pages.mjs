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

// MARK: - Ordinateur, barre du haut : conversations et notifications inventées, pour les pastilles.

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
  'reminder', 'searchMatch', 'offerReceived', 'offerCountered', 'offerAccepted', 'offerDeclined', 'offerWithdrawn'];
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
/** Pastilles attendues d'après les données simulées : règles de l'app (archivées exclues ; « 9+ » pour la cloche). */
function expectedBadges(state) {
  const messages = myConversations(state).filter((row) => !row.is_archived).reduce((sum, row) => sum + row.unread_count, 0);
  const notifications = state.notifications.filter((row) => NOTIFICATION_KINDS.includes(row.kind) && row.read_at === null).length;
  return { messages, notifications, messagesText: String(messages), notificationsText: notifications > 9 ? '9+' : String(notifications) };
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

/**
 * `listingRows` : annonces renvoyées par la table listings (par défaut les trois de fixtures/listings.json) ;
 * `account` : tables du compte de test à remplacer (projet avec critères, autre nom affiché…).
 */
async function mock(context, { signedIn = false, listingRows = listings, account = {} } = {}) {
  const tables = { ...ACCOUNT, ...account };
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
      if (width !== null && width < 1024) problems.push(`téléphone : ${table} demandé (rien ne doit changer sous 1024 px)`);
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
      if (width !== null && width < 1024) problems.push(`téléphone : ${table} demandé (rien ne doit changer sous 1024 px)`);
      if (!signedIn) problems.push(`sans compte : ${table} demandé`);
      else if (!['rpc/my_offers', 'rpc/my_visit_requests', 'agenda_visits'].includes(table)) problems.push(`${table} appelé sans action de la personne`);
      return json(route, 200, []);
    }
    if (signedIn && table in tables) {
      if (request.method() !== 'GET' && request.method() !== 'HEAD') {
        let body = null;
        try { body = request.postDataJSON(); } catch { body = request.postData(); }
        writes.push({ method: request.method(), table, search: url.search, body });
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
      if (single) return rows.length === 1 ? json(route, 200, rows[0]) : json(route, 406, { code: 'PGRST116', message: 'no rows' });
      return json(route, 200, rows);
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
  // on peut envoyer un changement de table, comme le serveur quand une ligne change.
  const sockets = [];
  await context.routeWebSocket(/^wss:\/\/izzsoitqtzzswkpvdozd\.supabase\.co\/realtime\//, (ws) => {
    const socket = { ws, topics: new Map() };
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
        response = { postgres_changes: changes };
      }
      if (event === 'phx_leave') socket.topics.delete(topic);
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
  return { state, followed, pushChange, requests };
}

const problems = [];

// MARK: - Ordinateur : vérifications de la barre du haut, du pied de page et des pastilles.

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

/** Barre du haut et pied de page de l'ordinateur : mesures, liens, pas de catégories (demande de Romain du 7 novembre),
 *  libellés en entier, police. */
async function checkChrome(page, name, { signedIn, margin }) {
  await page.evaluate(() => document.fonts.ready);
  const info = await page.evaluate(() => {
    const bar = document.querySelector('.dtop-bar');
    const box = (element) => element?.getBoundingClientRect();
    const items = [...document.querySelectorAll('.dtop-bar > *')].map((element) => box(element));
    return {
      height: box(document.querySelector('.dtop'))?.height,
      overflow: bar ? bar.scrollWidth > bar.clientWidth : true,
      outside: items.filter((item) => item.top < 0 || item.bottom > 72 || item.right > window.innerWidth).length,
      left: box(document.querySelector('.dtop-brand'))?.left,
      right: window.innerWidth - (box(document.querySelector('.dtop-space'))?.right ?? 0),
      modes: [...document.querySelectorAll('.dtop a[href^="/recherche/"]')].map((link) => link.textContent.trim()),
      labels: [document.querySelector('.dtop-publish')?.textContent.trim(), getComputedStyle(document.querySelector('.dtop-space-label') ?? document.body).display !== 'none'],
      badges: document.querySelectorAll('.dtop-badge').length,
      avatar: document.querySelector('.dtop-avatar')?.textContent.trim() ?? null,
      avatarIcon: Boolean(document.querySelector('.dtop-avatar svg')),
      font: getComputedStyle(document.querySelector('.dtop-publish') ?? document.body).fontFamily,
      interLoaded: document.fonts.check('600 15px "Nidalo Inter"') && [...document.fonts].some((face) => face.family.includes('Nidalo Inter') && face.status === 'loaded'),
      oldHeader: Boolean(document.querySelector('.topbar, footer.footer')),
      footerColumns: [...document.querySelectorAll('.dfoot-column h2')].map((title) => title.textContent.trim()),
      footerLinks: [...document.querySelectorAll('.dfoot a')].map((link) => link.getAttribute('href')),
      footerText: document.querySelector('.dfoot')?.textContent.replace(/\s+/g, ' ') ?? '',
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    };
  });
  if (info.height !== 72) problems.push(`${name} : barre du haut de ${info.height} px au lieu de 72`);
  if (info.overflow || info.outside) problems.push(`${name} : la barre du haut déborde (${info.outside} élément(s) hors de la barre)`);
  if (Math.round(info.left) !== margin || Math.round(info.right) !== margin) problems.push(`${name} : marges ${info.left} / ${info.right} au lieu de ${margin}`);
  if (info.modes.length) problems.push(`${name} : catégories encore dans la barre du haut ${JSON.stringify(info.modes)}`);
  if (JSON.stringify(info.labels) !== JSON.stringify(['Publier une annonce', true])) problems.push(`${name} : libellés de la barre ${JSON.stringify(info.labels)}`);
  if (!signedIn && (info.badges || !info.avatarIcon)) problems.push(`${name} : sans compte, ${info.badges} pastille(s), icône du compte ${info.avatarIcon}`);
  if (signedIn && info.avatar !== 'CM') problems.push(`${name} : initiales « ${info.avatar} » au lieu de « CM »`);
  if (!info.font.startsWith('"Nidalo Inter"') || !info.interLoaded) problems.push(`${name} : police ${info.font} (Inter chargée : ${info.interLoaded})`);
  if (info.oldHeader) problems.push(`${name} : l'en-tête ou le pied du téléphone est affiché sur ordinateur`);
  if (info.bodyBackground !== 'rgb(250, 249, 246)') problems.push(`${name} : fond ${info.bodyBackground} au lieu de #FAF9F6`);
  if (JSON.stringify(info.footerColumns) !== JSON.stringify(['Rechercher', 'Mon compte', 'Aide'])) problems.push(`${name} : colonnes du pied ${JSON.stringify(info.footerColumns)}`);
  for (const text of ['Vos échanges, votre futur chez-vous.', 'Vos favoris', 'Aide et assistance', '© 2026 Nidalo', 'CGU', 'Confidentialité', 'Mentions légales']) {
    if (!info.footerText.includes(text)) problems.push(`${name} : « ${text} » absent du pied de page`);
  }
  // Uniquement des liens vers des pages qui existent déjà.
  for (const href of info.footerLinks) {
    if (href.startsWith('mailto:')) continue;
    const path = href.split('?')[0];
    if (!existsSync(join(docs, path, 'index.html'))) problems.push(`${name} : le pied de page mène à ${href}, page absente`);
  }
}

/** Pastilles de la barre du haut = données du serveur simulé (archivées exclues, sortes inconnues ignorées). */
async function checkBadges(page, state, name) {
  const expected = expectedBadges(state);
  const want = { messages: expected.messages ? expected.messagesText : '', notifications: expected.notifications ? expected.notificationsText : '' };
  const read = () => ({
    messages: document.querySelector('.dtop-round[href="/messages/"] .dtop-badge')?.textContent ?? '',
    notifications: document.querySelector('.dtop-round[href="/compte/?vue=notifications"] .dtop-badge')?.textContent ?? '',
  });
  try {
    // Fonction, pas texte : la CSP du site interdit d'évaluer du texte comme du code.
    await page.waitForFunction((target) => {
      const text = (selector) => document.querySelector(selector)?.textContent ?? '';
      return text('.dtop-round[href="/messages/"] .dtop-badge') === target.messages
        && text('.dtop-round[href="/compte/?vue=notifications"] .dtop-badge') === target.notifications;
    }, want, { timeout: 8000 });
  } catch {
    problems.push(`${name} : pastilles ${JSON.stringify(await page.evaluate(read))} au lieu de ${JSON.stringify(want)}`);
    return;
  }
  const labels = await page.evaluate(() => [
    document.querySelector('.dtop-round[href="/messages/"]')?.getAttribute('aria-label'),
    document.querySelector('.dtop-round[href="/compte/?vue=notifications"]')?.getAttribute('aria-label'),
  ]);
  const wantLabels = [
    expected.messages ? `Messages, ${expected.messages} non lus` : 'Messages',
    expected.notifications ? `Notifications, ${expected.notifications} non lues` : 'Notifications',
  ];
  if (JSON.stringify(labels) !== JSON.stringify(wantLabels)) problems.push(`${name} : libellés ${JSON.stringify(labels)} au lieu de ${JSON.stringify(wantLabels)}`);
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
async function open(context, path, name) {
  const page = await context.newPage();
  page.on('console', (msg) => {
    const text = msg.text();
    // La page 404 répond exprès avec le code 404 : Chrome le signale dans la console, ce n'est pas une erreur du site.
    if (name.startsWith('404') && /status of 404/.test(text)) return;
    if (msg.type() === 'error' || /Content Security Policy/i.test(text)) problems.push(`${name}: ${msg.type()} ${text}`);
  });
  page.on('pageerror', (error) => problems.push(`${name}: erreur ${error.message}`));
  const isPhone = () => (page.viewportSize()?.width ?? 0) < 1024;
  page.on('websocket', (socket) => { if (isPhone()) problems.push(`${name}: temps réel ouvert sur téléphone (${socket.url()})`); });
  page.on('request', (request) => { if (isPhone() && request.url().includes('/fonts/')) problems.push(`${name}: police chargée sur téléphone (${request.url()})`); });
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
/** Tables et fonctions de la messagerie : jamais demandées sans compte ni sous 1024 px. */
const CHAT_TABLES = [
  'rpc/my_conversations', 'conversation_participants', 'rpc/public_profiles', 'rpc/my_communities', 'rpc/professional_contacts', 'user_blocks',
  'messages', 'rpc/mark_conversation_read', 'message_reactions', 'conversation_preferences', 'reports', 'rpc/find_account_by_phone',
  'rpc/start_phone_conversation', 'rpc/start_direct_conversation', 'rpc/my_offers', 'rpc/make_offer', 'rpc/accept_offer', 'rpc/decline_offer',
  'rpc/withdraw_offer', 'rpc/counter_offer', 'agenda_visits', 'rpc/my_visit_requests', 'rpc/start_listing_conversation',
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
    preferences: { [chatId(2)]: { is_favorite: true }, [chatId(3)]: { is_archived: true }, [chatId(4)]: { muted_until: '4001-01-01T00:00:00+00:00' } },
    blocks: [],
    reports: [],
    files: new Map([[AGENT_PHOTOS[0], { type: 'image/jpeg', body: photos['photo1.jpg'] }], [AGENT_PHOTOS[1], { type: 'image/jpeg', body: photos['photo2.jpg'] }],
      [LOAN_PDF, { type: 'application/pdf', body: PDF_BYTES }]]),
    /** Demandes reçues (tables et fonctions), URL signées demandées et fichiers envoyés. */
    calls: [],
    signs: [],
    uploads: [],
    tick: 0,
  };
}

/** Heure du serveur simulé : une seconde de plus à chaque écriture, après l'heure figée des pages. */
function chatClock(chat) {
  chat.tick += 1;
  return new Date(CHAT_NOW.getTime() + chat.tick * 1000).toISOString();
}

const MESSAGE_KEYS = ['id', 'conversation_id', 'sender_id', 'kind', 'client_id', 'content', 'created_at', 'expires_at', 'message_reactions'];
const messageColumns = (row) => Object.fromEntries(MESSAGE_KEYS.map((key) => [key, row[key]]));

/** Lignes de my_conversations, comme la fonction du serveur : dernier message, non-lus, réglages, lectures ; la plus récente d'abord. */
function chatRows(chat) {
  const rows = chat.conversations.map((conversation) => {
    const settings = { is_archived: false, is_favorite: false, muted_until: null, saves_photos: false, cleared_at: null, ...chat.preferences[conversation.id] };
    const messages = chat.messages.filter((item) => sameChatId(item.conversation_id, conversation.id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const last = messages.at(-1) ?? null;
    const members = chat.participants.filter((item) => sameChatId(item.conversation_id, conversation.id) && item.left_at === null);
    const mine = members.find((item) => sameChatId(item.user_id, USER_ID));
    const other = conversation.other ? members.find((item) => sameChatId(item.user_id, conversation.other)) : null;
    const listing = HOME_LISTINGS.find((row) => row.id === conversation.listing) ?? null;
    return {
      conversation_id: conversation.id, kind: conversation.kind, listing_id: listing?.id ?? null,
      listing_snapshot: listing ? {
        listingId: listing.id, title: listing.title, price: listing.price, transaction: listing.transaction, city: listing.city,
        coverPath: listing.listing_photos[0]?.storage_path ?? null,
      } : null,
      buyer_id: conversation.buyer, seller_id: conversation.seller, group_name: conversation.name, group_details: null, group_image_path: null,
      group_purpose: null, ephemeral_seconds: null, created_by: USER_ID, created_at: conversation.created_at, my_role: mine?.role ?? 'member',
      joined_at: conversation.created_at, left_at: null, last_read_at: mine?.last_read_at ?? null, ...settings, other_user_id: conversation.other,
      other_last_read_at: other?.last_read_at ?? null, member_count: members.length, unread_count: conversation.unread,
      last_message_id: last?.id ?? null, last_message_sender_id: last?.sender_id ?? null, last_message_kind: last?.kind ?? null,
      last_message_content: last?.content ?? null, last_message_preview: last?.preview ?? null, last_message_at: last?.created_at ?? null,
    };
  });
  return rows.sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at));
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
    case 'rpc/my_communities':
      return reply(200, []);
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
        // L'expéditeur et l'heure viennent du serveur ; les identifiants reviennent en minuscules (type uuid).
        const row = {
          id: String(body.id).toLowerCase(), conversation_id: String(body.conversation_id).toLowerCase(), sender_id: USER_ID,
          kind: Object.keys(body.content ?? {})[0] ?? 'text', client_id: String(body.client_id).toLowerCase(), content: body.content,
          created_at: chatClock(chat), expires_at: null, message_reactions: [], preview: body.preview,
        };
        chat.messages.push(row);
        return reply(201, single ? messageColumns(row) : [messageColumns(row)]);
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
      return reply(200, []);
    case 'rpc/start_listing_conversation': {
      const conversation = chat.conversations.find((item) => item.listing === body?.p_listing_id);
      return conversation ? reply(200, conversation.id) : refuse('Annonce introuvable.');
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
    if (width !== null && width < 1024) problems.push(`téléphone : ${table} demandé (rien ne doit changer sous 1024 px)`);
    const reply = (status, value) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: value === undefined ? '' : JSON.stringify(value) });
    if (!signedIn) {
      problems.push(`sans compte : ${table} demandé`);
      return reply(200, []);
    }
    return chatRespond(chat, reply, { table, method: request.method(), params: url.searchParams, body, single: (headers.accept ?? '').includes('vnd.pgrst.object') });
  });
  await context.route(/^https:\/\/izzsoitqtzzswkpvdozd\.supabase\.co\/storage\/v1\/object\/(sign\/)?message-attachments\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const signing = url.pathname.startsWith('/storage/v1/object/sign/');
    const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\/(sign\/)?message-attachments\//, ''));
    const width = pageWidth(request);
    if (width !== null && width < 1024) problems.push(`téléphone : fichier ${path} demandé`);
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

async function messagesBadge(page) {
  return page.evaluate(() => document.querySelector('.dtop-round[href="/messages/"] .dtop-badge')?.textContent ?? '');
}

/** Pastille Messages de la barre du haut (« » : aucune). */
async function waitForMessagesBadge(page, want, name) {
  try {
    await page.waitForFunction((target) => (document.querySelector('.dtop-round[href="/messages/"] .dtop-badge')?.textContent ?? '') === target, want, { timeout: 8000 });
  } catch {
    problems.push(`${name} : pastille Messages « ${await messagesBadge(page)} » au lieu de « ${want} »`);
  }
}

/** Lignes de la boîte de réception, telles qu'affichées. */
function inboxRows(page) {
  return page.$$eval('.dm-list .dm-row', (rows) => rows.map((row) => ({
    name: row.querySelector('.dm-row-name')?.textContent ?? null,
    badge: row.querySelector('.dm-badge')?.textContent ?? null,
    time: row.querySelector('.dm-row-time')?.textContent ?? null,
    preview: row.querySelector('.dm-row-preview')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    check: row.querySelector('.dm-row-preview .dm-check')?.getAttribute('aria-label') ?? null,
    unread: row.querySelector('.dm-unread')?.textContent ?? null,
    greyPill: Boolean(row.querySelector('.dm-unread.is-muted')),
    bell: Boolean(row.querySelector('.dm-row-muted')),
    sub: row.querySelector('.dm-row-sub')?.textContent ?? null,
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

/** Cartes de la grille des favoris, telles qu'affichées. */
function favoriteCardsShown(page) {
  return page.$$eval('.dfav-grid .dfav-card', (cards) => cards.map((card) => {
    const text = (selector) => card.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() ?? null;
    const pill = card.querySelector('.dfav-yield');
    return {
      title: text('.dfav-title'), href: card.querySelector('.dfav-title a')?.getAttribute('href') ?? null, details: text('.dfav-details'), price: text('.dfav-price'),
      perMeter: text('.dfav-per-meter'), dpe: text('.dfav-dpe-letter'), yield: text('.dfav-yield'), tone: pill ? (pill.classList.contains('is-good') ? 'vert' : 'orange') : null,
      counter: text('.dfav-counter'), noPhoto: text('.dfav-no-photo'),
      buttons: [...card.querySelectorAll('.dfav-actions button')].map((button) => [button.getAttribute('aria-label'), button.getAttribute('aria-pressed')]),
    };
  }));
}
const favoriteTitles = (page) => page.$$eval('.dfav-grid .dfav-card .dfav-title', (els) => els.map((el) => el.textContent));

/** Attend les cartes affichées (titres, dans l'ordre) et le nombre « N biens sauvegardés ». */
async function waitForFavorites(page, titles, total, name) {
  try {
    await page.waitForFunction(([wanted, count]) => JSON.stringify([...document.querySelectorAll('.dfav-grid .dfav-card .dfav-title')].map((el) => el.textContent)) === JSON.stringify(wanted)
      && (document.querySelector('.dfav-total')?.textContent ?? null) === count, [titles, total], { timeout: 8000 });
  } catch {
    const shown = await page.evaluate(() => document.querySelector('.dfav-total')?.textContent ?? null);
    problems.push(`${name} : cartes ${JSON.stringify(await favoriteTitles(page))} et « ${shown} » au lieu de ${JSON.stringify(titles)} et « ${total} »`);
  }
}

/** Première photo de chaque carte chargée (les autres photos d'une carte se chargent en la faisant défiler). */
async function favoritePhotosLoaded(page, count, name) {
  try {
    await page.waitForFunction((wanted) => {
      const images = [...document.querySelectorAll('.dfav-photo')].map((photo) => photo.querySelector('img')).filter(Boolean);
      return images.length === wanted && images.every((image) => image.complete && image.naturalWidth > 0);
    }, count, { timeout: 10000 });
  } catch {
    problems.push(`${name} : photos des cartes non chargées`);
  }
}

/** Toast de la comparaison (CompareToast) : son texte et son lien « Voir » ou « Gérer ». */
async function waitForCompareNotice(page, want, name) {
  try {
    await page.waitForFunction((target) => {
      const box = document.querySelector('.dfav-toast-box');
      return box?.querySelector('.dfav-toast-text')?.textContent === target.text && (box.querySelector('a')?.textContent ?? null) === target.action;
    }, want, { timeout: 4000 });
  } catch {
    const shown = await page.evaluate(() => {
      const box = document.querySelector('.dfav-toast-box');
      return box ? { text: box.querySelector('.dfav-toast-text')?.textContent ?? null, action: box.querySelector('a')?.textContent ?? null } : null;
    });
    problems.push(`${name} : toast ${JSON.stringify(shown)} au lieu de ${JSON.stringify(want)}`);
  }
}

/** Les recherches de l'onglet Recherches ont leur nombre de résultats (plus de « Relancer la recherche »). */
async function waitForSearchCounts(page, name) {
  try {
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll('.dfav-searches .run-button')];
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
const SPACE_TABLES = ['real_estate_projects', 'agenda_visits', 'rpc/my_visit_requests', 'rpc/public_profiles', 'rpc/my_conversations', 'listing_locations'];

function spaceState(fields = {}) {
  return {
    project: structuredClone(SPACE_PROJECTS.buy), visits: structuredClone(SPACE_VISITS), requests: structuredClone(SPACE_REQUESTS),
    conversations: null, myListings: null, calls: [], logouts: [], ...fields,
  };
}

/**
 * Serveur de Mon espace, par-dessus mock() : projet (lecture, upsert), agenda (lecture, ajout), demandes de visite,
 * profils publics, conversations et « Mes annonces » quand l'état les fournit ; déconnexions notées. Sous 1024 px,
 * rien n'est servi ici : mock() signale la demande (rien ne doit changer sur téléphone).
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
    if ((!served && !myListings && !detail) || (width !== null && width < 1024)) return route.fallback();
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
      case 'agenda_visits':
        if (request.method() === 'GET') return reply(route, 200, space.visits);
        space.visits.push(body);
        return reply(route, 201);
      case 'rpc/my_visit_requests':
        return reply(route, 200, space.requests);
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

/** Carte du projet de Mon espace, telle qu'affichée : sous-titre, anneau, étapes [libellé, franchie]. */
async function spaceProjectCard(page) {
  return [await textOf(page, '.dsp-project-subtitle'), await textOf(page, '.dsp-project .dsp-ring-label'),
    await page.$$eval('.dsp-steps li', (items) => items.map((item) => [item.querySelector('.dsp-step-label')?.textContent.trim() ?? null, item.classList.contains('is-done')]))];
}

/** Textes de `selector` (les espaces des icônes retirés), ou de `inner` dans chacun. */
function textsOf(page, selector, inner = null) {
  return page.$$eval(selector, (elements, sub) => elements.map((element) => {
    const target = sub ? element.querySelector(sub) : element;
    return target ? target.textContent.replace(/\s+/g, ' ').trim() : null;
  }), inner);
}

/** Lignes d'une carte de lignes (Compte et sécurité, Paramètres…) : titre, sous-titre, lien. */
function spaceRows(page, selector) {
  return page.$$eval(`${selector} .dsp-row`, (rows) => rows.map((row) => [row.querySelector('.dsp-row-title')?.textContent.trim() ?? null,
    row.querySelector('.dsp-row-subtitle')?.textContent.trim() ?? null, row.getAttribute('href')]));
}

/** Cartes de visite de l'onglet affiché, par groupe de dates (VisitsAgendaView). */
function agendaCards(page) {
  return page.$$eval('.dsc-visit-group', (groups) => groups.map((group) => {
    const text = (element) => (element ? element.textContent.replace(/\s+/g, ' ').trim() : null);
    return [text(group.querySelector('.dsc-group-title')), [...group.querySelectorAll('.dsc-visit')].map((card) => ({
      date: text(card.querySelector('.dsc-visit-date > span[aria-hidden="true"]')),
      status: text(card.querySelector('.dsc-status')),
      title: text(card.querySelector('.dsc-visit-title')),
      lines: [...card.querySelectorAll('.dsc-visit-lines > span')].map(text),
      route: card.querySelector('a.dsc-visit-action')?.getAttribute('href') ?? null,
      request: card.querySelector('a.dsc-visit-open')?.getAttribute('href') ?? null,
      contact: [...card.querySelectorAll('.dsc-visit-action')].find((action) => text(action) === 'Contacter')?.disabled === false,
      menu: Boolean(card.querySelector('.dsc-menu-button')),
    }))];
  }));
}

/** Biens consultés affichés : titre, ville et surface, prix, statut. */
function viewedRows(page) {
  return page.$$eval('.dsc-viewed', (rows) => rows.map((row) => [row.querySelector('.dsc-viewed-title')?.textContent ?? null,
    row.querySelector('.dsc-viewed-line')?.textContent.replace(/\s+/g, ' ') ?? null, row.querySelector('.dsc-viewed-price')?.textContent.replace(/\s+/g, ' ') ?? null,
    row.querySelector('.dsc-viewed-link')?.getAttribute('href') ?? null]));
}

/** Liste des biens consultés gardée dans l'onglet (sessionStorage). */
const viewedStorage = (page) => page.evaluate(() => sessionStorage.getItem('nidalo.consultes'));

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
  // Accueil : sections, menu d'un critère, montant saisi, puis la recherche.
  let page = await open(desktop, '/', 'accueil-ordinateur');
  await page.waitForSelector('.home-search-card');
  await page.waitForSelector('.home-section');
  const yieldChip = await page.locator('.opportunity-card .home-yield').first().textContent().catch(() => null);
  if (yieldChip?.replace(/\s/g, ' ') !== '5,5 %') problems.push(`accueil : rendement de l'opportunité « ${yieldChip} » au lieu de « 5,5 % »`);
  await page.screenshot({ path: join(out, 'accueil-ordinateur.png'), fullPage: true });
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

  page = await open(desktop, '/recherche/?mode=buy', 'recherche-ordinateur');
  await page.waitForSelector('.listing-card');
  await page.screenshot({ path: join(out, 'recherche-ordinateur-liste.png') });
  await page.click('.view-toggle button[aria-label="Afficher sur la carte"]');
  await page.waitForSelector('.map-marker', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'recherche-ordinateur.png') });
  await page.click('.map-marker');
  await page.waitForSelector('.map-preview');
  await page.screenshot({ path: join(out, 'recherche-ordinateur-apercu.png') });
  await page.click('.map-close');
  await page.waitForSelector('.map-column:not(.is-open)', { state: 'attached' });
  await page.fill('.place-field input', 'lyo');
  await page.waitForSelector('.place-list li');
  await page.screenshot({ path: join(out, 'recherche-suggestions.png'), clip: { x: 0, y: 0, width: 720, height: 520 } });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.search.includes('lieu=Lyon'));
  const beforeFilters = page.url();
  await page.click('.filters-button');
  await page.waitForSelector('dialog.filters-dialog[open]');
  await checkApplyButton(page, 'filtres ordinateur');
  // Une page complète sur ordinateur (demande de Romain du 7 novembre), plus une fenêtre au milieu de l'écran.
  expectSame('filtres ordinateur', 'page complète (x, y, largeur, hauteur)', await page.$eval('dialog.filters-dialog', (dialog) => {
    const box = dialog.getBoundingClientRect();
    return [box.x, box.y, box.width, box.height];
  }), [0, 0, 1440, 900]);
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
  const chips = await page.locator('dialog[open] .active-chip').allTextContents();
  if (!chips.some((c) => c.includes('3 à 4 pièces')) || !chips.some((c) => c.includes('1 à 2 chambres')) || !chips.some((c) => /DPE/.test(c))) {
    problems.push(`filtres : pastilles « ${chips.join(' | ')} »`);
  }
  await page.getByRole('heading', { name: 'Surface et pièces' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, 'filtres-ordinateur.png') });
  // Un troisième appui recommence la ligne ; « 5+ » ferme la fourchette sans maximum ; retoucher le seul choix l'efface.
  await roomsRow('Pièces').getByRole('button', { name: '2', exact: true }).click();
  await roomsRow('Pièces').getByRole('button', { name: '5+', exact: true }).click();
  expectSame('filtres', 'pièces 2 puis 5+', [await rowState('Pièces'), (await page.locator('dialog[open] .active-chip').allTextContents()).filter((c) => /pièce/.test(c))],
    [['2 ou plus', ['Studio', '2 allumé', '3 allumé', '4 allumé', '5+ allumé']], ['2 pièces min ']]);
  await roomsRow('Pièces').getByRole('button', { name: '4', exact: true }).click();
  await roomsRow('Pièces').getByRole('button', { name: '4', exact: true }).click();
  expectSame('filtres', 'pièces effacées', [await rowState('Pièces'), (await page.locator('dialog[open] .active-chip').allTextContents()).filter((c) => /pièce/.test(c))],
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
  for (const expected of [/Rendement brut\s*5,5 %/, /Loyer actuel\s*850 €\/mois/, /Cash-flow estimé\s*−474 €\/mois/]) {
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
  await mock(signed, { signedIn: true });
  page = await open(signed, '/', 'accueil-connecte');
  await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('Bonjour Claire'), null, { timeout: 8000 })
    .catch(async () => problems.push(`accueil connecté : titre « ${await page.textContent('h1')} »`));
  await page.close();
  // Sur ordinateur, « Mon espace » de la maquette 5 (.dsp, voir « Mon espace sur ordinateur » plus bas).
  page = await open(signed, '/compte/', 'compte-espace');
  await page.waitForSelector('.dsp-profile');
  await page.waitForSelector('.dsp-project');
  await page.waitForFunction(() => /1\s+en ligne · 1 brouillon/.test(document.querySelector('.dsp-tiles')?.innerText ?? ''), null, { timeout: 8000 }).catch(() => undefined);
  const space = (await textOf(page, '.dsp')) ?? '';
  for (const expected of ['Claire Martin', USER_EMAIL, 'Particulier', 'Votre projet immobilier', '2 recherches actives', '1 en ligne · 1 brouillon']) {
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

  // Favoris : deux annonces chargées, une retirée, la recherche dans les favoris, l'onglet Recherches.
  // À 1440 px, la page de l'ordinateur (maquette 4, classes .dfav-*) ; voir aussi « Favoris sur ordinateur » plus bas.
  page = await open(signed, '/favoris/', 'favoris-connecte');
  await page.waitForSelector('.dfav-card');
  await page.waitForSelector('.dfav-missing');
  const favoriteCount = await page.locator('.dfav-card').count();
  if (favoriteCount !== 2) problems.push(`Favoris : ${favoriteCount} cartes au lieu de 2`);
  const total = (await page.textContent('.dfav-total'))?.trim();
  if (total !== '2 biens sauvegardés') problems.push(`Favoris : compteur « ${total} »`);
  await page.screenshot({ path: join(out, 'favoris-connecte-ordinateur.png'), fullPage: true });
  await page.fill('.dfav-field input', 'villeur');
  await page.waitForFunction(() => document.querySelector('.dfav-total')?.textContent?.trim() === '1 sur 2 biens', null, { timeout: 4000 })
    .catch(async () => problems.push(`Favoris : recherche « villeur », compteur « ${await page.textContent('.dfav-total')} »`));
  await page.screenshot({ path: join(out, 'favoris-recherche-ordinateur.png') });
  await page.click('.dfav-tab >> nth=1');
  await page.waitForSelector('.dfav-searches .saved-search');
  if (!page.url().includes('onglet=recherches')) problems.push(`Favoris : l'onglet Recherches n'est pas dans l'adresse (${page.url()})`);
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
  await page.click('.save-search-button');
  await page.waitForSelector('dialog[open] .alert-body .text-input');
  const proposed = await page.inputValue('dialog[open] .alert-body .text-input');
  await page.screenshot({ path: join(out, 'enregistrer-recherche-ordinateur.png') });
  await page.click('dialog[open] .alert-actions .btn-primary');
  await page.waitForSelector('.save-search-button.is-saved');
  const saved = writes.find((w) => w.table === 'saved_searches' && w.method === 'POST');
  if (!saved) problems.push('enregistrer : aucune recherche envoyée au serveur');
  else {
    const query = saved.body?.query ?? {};
    if (saved.body?.name !== proposed) problems.push(`enregistrer : nom « ${saved.body?.name} » au lieu de « ${proposed} »`);
    if (query.transaction !== 'sale' || !query.location?.around || query.location.around.radiusMeters !== 10000) {
      problems.push(`enregistrer : requête ${JSON.stringify(query)}`);
    }
    if (JSON.stringify(query).includes('null')) problems.push('enregistrer : valeur null dans la requête (l\'iPhone ne la lirait pas)');
  }
  await page.close();
  page = await open(signed, `/annonce/?id=${listings[0].id}`, 'annonce-connecte');
  // Sur ordinateur, le cœur des favoris est « Enregistrer », à côté du titre (fiche de l'étape 3).
  await page.waitForSelector('.dl-save[aria-pressed]');
  if ((await page.getAttribute('.dl-save[aria-pressed]', 'aria-pressed')) !== 'true') problems.push('annonce : le cœur d\'un favori n\'est pas rempli');
  await page.close();
  await signed.close();

  // Ordinateur (≥ 1024 px) : barre du haut, pastilles, pied de page, colonne de 640 px et Notifications, à 1440 × 900
  // et 1024 × 768, sans compte puis avec le compte de test. Captures à ×2, comme les maquettes de Romain.
  for (const [width, height] of [[1440, 900], [1024, 768]]) {
    const margin = width >= 1280 ? 48 : 32;
    const guest = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR' });
    await mock(guest);
    page = await open(guest, '/', `barre-${width}-sans-compte`);
    await page.waitForSelector('.dtop');
    await page.waitForSelector('.home-section');
    await checkChrome(page, `accueil ${width} sans compte`, { signedIn: false, margin });
    await page.screenshot({ path: join(out, `barre-haut-${width}-sans-compte.png`), clip: { x: 0, y: 0, width, height: 72 } });
    await page.locator('.dfoot').screenshot({ path: join(out, `pied-de-page-${width}.png`) });
    await page.screenshot({ path: join(out, `accueil-${width}-sans-compte.png`), fullPage: true });
    await page.close();
    // Recherche (demande de Romain du 7 novembre) : les catégories du milieu changent la recherche ; la liste sur toute
    // la largeur en 3 colonnes, la carte fermée au départ ; la bascule « liste / carte » de l'app ouvre la carte sous la
    // barre de 72 px, « Liste » ou Échap la referment ; la barre reste en haut quand la page défile.
    page = await open(guest, '/recherche/?mode=invest', `recherche-${width}`);
    await page.waitForSelector('.listing-card');
    await checkChrome(page, `recherche ${width}`, { signedIn: false, margin });
    await page.click('.mode-tabs-search .mode-tab >> nth=1');
    await page.waitForURL(/\/recherche\/\?mode=rent$/);
    await page.waitForSelector('.listing-card');
    const start = await page.evaluate(() => ({
      map: getComputedStyle(document.querySelector('.map-column')).display,
      pill: getComputedStyle(document.querySelector('.map-open')).display,
      toggle: getComputedStyle(document.querySelector('.view-toggle')).display,
      columns: getComputedStyle(document.querySelector('.results-list')).gridTemplateColumns.split(' ').length,
      column: Math.round(document.querySelector('.search-column').getBoundingClientRect().width),
    }));
    expectSame(`recherche ${width}`, 'au départ', start, { map: 'none', pill: 'none', toggle: 'flex', columns: 3, column: Math.min(width, 1200 + 2 * margin) });
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    const scrolled = await page.evaluate(() => [window.scrollY, document.querySelector('.dtop').getBoundingClientRect().top]);
    if (scrolled[0] <= 0 || scrolled[1] !== 0) problems.push(`recherche ${width} : après défilement de ${scrolled[0]} px, barre à ${scrolled[1]} px`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(out, `recherche-${width}.png`) });
    await page.click('.view-toggle button[aria-label="Afficher sur la carte"]');
    await page.waitForSelector('.map-column.is-open .map-marker', { timeout: 15000 });
    await page.waitForTimeout(400);
    const opened = await page.evaluate(() => {
      const box = document.querySelector('.map-column').getBoundingClientRect();
      return [box.top, box.bottom, box.left, box.right === document.documentElement.clientWidth, document.querySelector('.dtop').getBoundingClientRect().top, location.search.includes('vue=carte')];
    });
    expectSame(`recherche ${width}`, 'carte ouverte [haut, bas, gauche, largeur, barre, adresse]', opened, [72, height, 0, true, 0, true]);
    await page.screenshot({ path: join(out, `recherche-carte-${width}.png`) });
    await page.click('.map-close');
    await page.waitForFunction(() => !document.querySelector('.map-column.is-open') && !location.search.includes('vue=carte'), null, { timeout: 4000 })
      .catch(() => problems.push(`recherche ${width} : « Liste » ne referme pas la carte`));
    await page.click('.view-toggle button[aria-label="Afficher sur la carte"]');
    await page.waitForSelector('.map-column.is-open');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.map-column.is-open'), null, { timeout: 4000 })
      .catch(() => problems.push(`recherche ${width} : Échap ne referme pas la carte`));
    await page.close();
    // Écrans absents des maquettes : leur version actuelle, dans une colonne de 640 px.
    for (const [path, name, selector] of [['/aide/', 'aide', 'article.doc'], ['/mentions-legales/', 'mentions-legales', 'article.doc'], ['/page-inexistante/', '404', 'main .wrap-narrow'],
      ['/publier/', 'publier', 'main .wrap-narrow'], ['/compte/', 'connexion', '.account-wrap']]) {
      const p = await open(guest, path, `${name}-${width}`);
      await p.waitForSelector(`${selector} h1, ${selector} .signin-card`);
      const column = await contentWidth(p, selector);
      if (column !== 640) problems.push(`${name} ${width} : colonne de ${column} px au lieu de 640`);
      if (name === 'mentions-legales' && !(await p.textContent('article.doc'))?.includes('Inter (SIL Open Font License 1.1)')) problems.push('mentions légales : crédit de la police Inter absent');
      await p.screenshot({ path: join(out, `${name}-${width}.png`), fullPage: true });
      await p.close();
    }
    // Notifications sans compte : l'écran de l'app, avec son message (la cloche de l'app s'ouvre aussi sans compte).
    page = await open(guest, '/compte/?vue=notifications', `notifications-${width}-sans-compte`);
    await page.waitForSelector('.notifications-screen .account-empty');
    const guestText = (await page.textContent('.notifications-screen'))?.replace(/\s+/g, ' ') ?? '';
    for (const text of ['Notifications', 'Aucune notification pour l’instant', 'Connectez-vous pour recevoir les réponses à vos demandes de visite et les rappels.']) {
      if (!guestText.includes(text)) problems.push(`notifications sans compte ${width} : « ${text} » absent`);
    }
    if (await page.locator('.notifications-read-all').count()) problems.push(`notifications sans compte ${width} : « Tout lire » affiché`);
    await page.screenshot({ path: join(out, `notifications-${width}-sans-compte.png`), fullPage: true });
    await page.close();
    if (badgeRequests.some((request) => !request.signedIn)) problems.push('sans compte : pastilles ou notifications demandées au serveur');
    await guest.close();

    // Avec le compte de test : pastilles de l'app, mises à jour en direct, initiales du compte.
    const member = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR' });
    const live = await mock(member, { signedIn: true });
    page = await open(member, '/', `accueil-${width}-connecte`);
    await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('Bonjour Claire'), null, { timeout: 8000 }).catch(() => undefined);
    await page.waitForSelector('.home-section');
    await checkBadges(page, live.state, `accueil ${width} connecté`);
    await checkChrome(page, `accueil ${width} connecté`, { signedIn: true, margin });
    const conversationsCall = badgeRequests.find((request) => request.table === 'rpc/my_conversations');
    if (!conversationsCall || conversationsCall.method !== 'POST' || JSON.stringify(conversationsCall.body) !== '{}') {
      problems.push(`pastille Messages : my_conversations appelée ${JSON.stringify(conversationsCall)} au lieu d'un POST sans paramètre`);
    }
    const notificationsCall = badgeRequests.find((request) => request.table === 'notifications');
    const query = new URLSearchParams(notificationsCall?.search ?? '');
    if (query.get('select') !== 'id,kind,request_id,listing_id,conversation_id,offer_id,title,body,created_at,read_at' || query.get('order') !== 'created_at.desc' || query.get('limit') !== '200') {
      problems.push(`notifications : lecture ${notificationsCall?.search} au lieu de celle de l'app`);
    }
    await page.screenshot({ path: join(out, `barre-haut-${width}-connecte.png`), clip: { x: 0, y: 0, width, height: 72 } });
    await page.screenshot({ path: join(out, `accueil-${width}-connecte.png`), fullPage: true });
    // Temps réel : comme l'app, un changement sur messages, conversation_participants ou notifications relit la pastille.
    await waitFor(() => ['messages', 'conversation_participants', 'notifications'].every((table) => live.followed().includes(table)), `temps réel ${width} : abonnements`);
    live.state.notifications.push({ id: notificationId(6), kind: 'newRequest', request_id: 'e0000000-0000-4000-8000-000000000004', listing_id: listings[0].id, conversation_id: null,
      offer_id: null, title: listings[0].title, body: 'Julien Moreau souhaite visiter ce bien.', created_at: new Date().toISOString(), read_at: null });
    live.pushChange('notifications');
    await checkBadges(page, live.state, `temps réel ${width} : nouvelle notification`);
    live.state.conversations[1].unread_count += 2;
    live.pushChange('messages');
    await checkBadges(page, live.state, `temps réel ${width} : nouveau message`);
    live.state.conversations[0].unread_count = 0;
    live.pushChange('conversation_participants');
    await checkBadges(page, live.state, `temps réel ${width} : conversation lue`);
    // Retour sur l'onglet : tout est relu, comme l'app au retour au premier plan.
    live.state.conversations[0].unread_count = 1;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await checkBadges(page, live.state, `retour sur l'onglet ${width}`);
    await page.close();

    page = await open(member, '/compte/?vue=notifications', `notifications-${width}`);
    await page.waitForSelector('.notification-row');
    const rows = await page.$$eval('.notification-row', (links) => links.map((link) => [link.querySelector('.notification-title')?.textContent, link.getAttribute('href'), Boolean(link.querySelector('.notification-dot'))]));
    const known = live.state.notifications.filter((row) => NOTIFICATION_KINDS.includes(row.kind)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (rows.length !== known.length) problems.push(`notifications ${width} : ${rows.length} lignes au lieu de ${known.length} (sorte inconnue comprise ?)`);
    const unreadRows = rows.filter((row) => row[2]).length;
    if (unreadRows !== expectedBadges(live.state).notifications) problems.push(`notifications ${width} : ${unreadRows} non lues affichées au lieu de ${expectedBadges(live.state).notifications}`);
    const hrefs = rows.map((row) => row[1]);
    for (const href of [`/messages/?c=${conversationId(1)}`, `/annonce/?id=${listings[0].id}`, '/compte/?vue=demande-visite&id=e0000000-0000-4000-8000-000000000003']) {
      if (!hrefs.includes(href)) problems.push(`notifications ${width} : aucun lien vers ${href} (${JSON.stringify(hrefs)})`);
    }
    const current = await page.evaluate(() => [document.querySelector('.dtop-round[href="/compte/?vue=notifications"]')?.getAttribute('aria-current'), document.querySelector('.dtop-space')?.getAttribute('aria-current')]);
    if (current[0] !== 'page' || current[1] !== null) problems.push(`notifications ${width} : bouton actif ${JSON.stringify(current)}`);
    if ((await contentWidth(page, '.account-wrap')) !== 640) problems.push(`notifications ${width} : colonne de ${await contentWidth(page, '.account-wrap')} px au lieu de 640`);
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
    // « Tout lire » : mark_notifications_read avec p_ids null, puis plus aucune non lue ni pastille.
    page = await open(member, '/compte/?vue=notifications', `tout-lire-${width}`);
    await page.waitForSelector('.notifications-read-all');
    before = writes.length;
    await page.click('.notifications-read-all');
    await page.waitForFunction(() => !document.querySelector('.notification-dot') && !document.querySelector('.dtop-round[href="/compte/?vue=notifications"] .dtop-badge')
      && !document.querySelector('.notifications-read-all'), null, { timeout: 8000 }).catch(() => problems.push(`tout lire ${width} : non-lues ou pastille encore affichées`));
    await waitFor(() => writes.length > before, `tout lire ${width} : appel au serveur`);
    const all = writes.slice(before).filter((write) => write.table === 'rpc/mark_notifications_read');
    if (all.length !== 1 || all[0].method !== 'POST' || !all[0].body || !('p_ids' in all[0].body) || all[0].body.p_ids !== null) {
      problems.push(`tout lire ${width} : ${JSON.stringify(all)} au lieu de mark_notifications_read { p_ids: null }`);
    }
    await checkBadges(page, live.state, `tout lire ${width}`);
    await page.close();
    // Mon espace : « Mon espace » mis en avant ; Mes informations dans la colonne de 640 px, l'espace garde sa largeur.
    page = await open(member, '/compte/?vue=informations', `mes-informations-${width}`);
    await page.waitForSelector('input[autocomplete="tel"]');
    if ((await contentWidth(page, '.account-wrap')) !== 640) problems.push(`Mes informations ${width} : colonne de ${await contentWidth(page, '.account-wrap')} px au lieu de 640`);
    if ((await page.getAttribute('.dtop-space', 'aria-current')) !== 'page') problems.push(`Mes informations ${width} : « Mon espace » n'est pas mis en avant`);
    await page.screenshot({ path: join(out, `mes-informations-${width}.png`), fullPage: true });
    await page.close();
    // Mon espace (maquette 5) : contenu de 1200 px (960 à 1024 px), colonne de gauche de 280 px ; « Mon espace » mis en avant.
    page = await open(member, '/compte/', `compte-espace-${width}`);
    await page.waitForSelector('.dsp-project');
    expectSame(`Mon espace ${width}`, 'largeurs et bouton actif', await page.evaluate(() => [Math.round(document.querySelector('.dsp').getBoundingClientRect().width),
      Math.round(document.querySelector('.dsp-aside').getBoundingClientRect().width), document.querySelector('.dtop-space')?.getAttribute('aria-current') ?? null]),
    [width === 1440 ? 1200 : 960, 280, 'page']);
    await checkChrome(page, `Mon espace ${width}`, { signedIn: true, margin });
    await page.close();
    await member.close();
  }

  // Accueil sur ordinateur (maquette 1), à 1440 × 900 et 1024 × 768, avec les annonces inventées : bonjour, ordre
  // des sections de l'app (vide = absente), une seule ligne par section (4 grandes cartes, 3 sous 1280 px ; 3 petites)
  // alors que les annonces lues en remplissent davantage, projet du compte, fiche ouverte dans l'onglet puis
  // « Consultés récemment », « Plus de critères ». Captures pour Romain : 1-accueil-*.png.
  const HOME_PROJECT = {
    real_estate_projects: [{ ...ACCOUNT.real_estate_projects[0], criteria: { residential: { maxBudget: 300000, propertyTypes: ['apartment'], location: { place: 'Lyon' } } } }],
  };
  const homeSections = (p) => p.locator('.dhome-section h2').allTextContents();
  const sectionCards = (p, id) => p.locator(`section:has(> .dhome-inner #${id}) h3`).allTextContents();
  // Cartes d'une section : lues (dans la page), affichées, et nombre de lignes qu'elles occupent.
  const sectionRow = (p, id) => p.evaluate((sectionId) => {
    const section = document.getElementById(sectionId)?.closest('section');
    const cards = [...(section?.querySelectorAll('article') ?? [])];
    const shown = cards.filter((card) => card.getClientRects().length > 0);
    return { total: cards.length, shown: shown.length, rows: new Set(shown.map((card) => Math.round(card.getBoundingClientRect().top))).size };
  }, id);
  const checkOneRow = async (p, width, label, ids) => {
    for (const id of ids) {
      const { total, shown, rows } = await sectionRow(p, id);
      const wanted = ['opportunites', 'similaires'].includes(id) ? (width >= 1280 ? 4 : 3) : 3;
      if (rows !== 1 || shown !== wanted || total <= shown) {
        problems.push(`accueil ${width} ${label} : ${id} affiche ${shown} carte(s) sur ${rows} ligne(s), ${total} dans la page, au lieu d'une ligne de ${wanted} (et des biens en plus non affichés)`);
      }
    }
  };
  for (const [width, height] of [[1440, 900], [1024, 768]]) {
    const guest = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR' });
    await mock(guest, { listingRows: HOME_LISTINGS });
    page = await open(guest, '/', `accueil-${width}-maquette-sans-compte`);
    await page.waitForSelector('.dhome .opportunity-card');
    await page.waitForSelector('#similaires');
    const welcome = await page.textContent('h1');
    if (welcome !== 'Bienvenue sur Nidalo') problems.push(`accueil ${width} sans compte : « ${welcome} » au lieu de « Bienvenue sur Nidalo »`);
    const guestSections = await homeSections(page);
    const guestWanted = ['Opportunités du moment', 'Biens similaires à vos recherches', 'Nouveautés', 'Baisses de prix'];
    if (JSON.stringify(guestSections) !== JSON.stringify(guestWanted)) problems.push(`accueil ${width} sans compte : sections ${JSON.stringify(guestSections)} au lieu de ${JSON.stringify(guestWanted)}`);
    await checkOneRow(page, width, 'sans compte', ['opportunites', 'similaires', 'nouveautes', 'baisses']);
    const noPhoto = await page.locator('section:has(#opportunites) .dhome-no-photo').count();
    if (noPhoto < 1 || await page.getByText('Photos à venir').count()) problems.push(`accueil ${width} : annonce sans photo mal affichée`);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    if (width === 1440) await page.screenshot({ path: join(out, '1-accueil-1440-sans-compte.png'), fullPage: true });
    await page.screenshot({ path: join(out, `accueil-maquette-${width}-sans-compte.png`), fullPage: true });
    // « Plus de critères » ouvre les filtres du site, sur la catégorie choisie, en page complète (demande de Romain du
    // 7 novembre) ; Retour (navigateur) ou Échap la referment sans quitter l'accueil.
    for (const how of ['Retour', 'Échap']) {
      await page.click('.dhome-more');
      await page.waitForSelector('dialog.filters-dialog[open]');
      expectSame(`accueil ${width}`, `« Plus de critères » en page complète (${how})`, await page.$eval('dialog.filters-dialog', (dialog) => {
        const box = dialog.getBoundingClientRect();
        return [box.x, box.y, box.width, box.height, box.width === innerWidth && box.height === innerHeight];
      }), [0, 0, width, height, true]);
      if (how === 'Retour') await page.goBack();
      else await page.keyboard.press('Escape');
      await page.waitForSelector('dialog.filters-dialog[open]', { state: 'detached', timeout: 4000 })
        .catch(() => problems.push(`accueil ${width} : ${how} ne referme pas « Plus de critères »`));
      expectSame(`accueil ${width}`, `après ${how}`, [new URL(page.url()).pathname, await page.evaluate(() => Boolean(window.history.state?.nidaloCriteres))], ['/', false]);
    }
    // Les 4 catégories (demande de Romain du 7 novembre) : le lieu seul sur sa ligne, de toute la largeur, puis les
    // critères en blocs en dessous, deux par ligne comme dans l'app, sans texte coupé.
    for (const [index, name] of [[0, 'Résidentiel'], [1, 'Location'], [2, 'Investir'], [3, 'Hôtels']]) {
      await page.click(`.dhome-search .mode-tab >> nth=${index}`);
      const layout = await page.evaluate(() => {
        const place = document.querySelector('.dhome-place').getBoundingClientRect();
        const grid = document.querySelector('.dhome-tiles').getBoundingClientRect();
        const tiles = [...document.querySelectorAll('.dhome-tiles > .criterion-tile')].map((el) => el.getBoundingClientRect());
        return {
          placeAbove: tiles.every((tile) => tile.top >= place.bottom),
          placeFullWidth: Math.round(place.width) === Math.round(grid.width),
          enoughTiles: tiles.length >= 4,
          rowsOfTwo: new Set(tiles.map((tile) => Math.round(tile.top))).size === Math.ceil(tiles.length / 2),
          columns: new Set(tiles.map((tile) => Math.round(tile.left))).size,
          clipped: [...document.querySelectorAll('.dhome-tiles .criterion-label, .dhome-tiles .criterion-value')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent),
        };
      });
      expectSame(`accueil ${width} ${name}`, 'lieu puis critères en blocs', layout, { placeAbove: true, placeFullWidth: true, enoughTiles: true, rowsOfTwo: true, columns: 2, clipped: [] });
      if (name === 'Investir') await page.locator('.dhome-search').screenshot({ path: join(out, `accueil-maquette-${width}-investir.png`) });
    }
    const hotelButton = (await page.textContent('.home-search-button'))?.trim();
    if (hotelButton !== 'Rechercher des hôtels') problems.push(`accueil ${width} : bouton « ${hotelButton} » en Hôtels`);
    await page.close();
    await guest.close();

    // Avec le compte de test : prénom, projet (Lyon, appartement, 300 000 €), puis une fiche ouverte dans l'onglet.
    const member = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR' });
    const homeServer = await mock(member, { signedIn: true, listingRows: HOME_LISTINGS, account: HOME_PROJECT });
    page = await open(member, '/', `accueil-${width}-maquette-connecte`);
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Bonjour Claire', null, { timeout: 8000 }).catch(() => undefined);
    const hello = await page.textContent('h1');
    if (hello !== 'Bonjour Claire') problems.push(`accueil ${width} connecté : « ${hello} » au lieu de « Bonjour Claire »`);
    await page.waitForSelector('#similaires');
    const projectRead = homeServer.requests.find((request) => request.table === 'real_estate_projects' && request.search.includes('criteria'));
    if (!projectRead || !projectRead.search.includes(`user_id=eq.${USER_ID}`) || !projectRead.search.includes('limit=1')) problems.push(`accueil ${width} : projet lu ${projectRead?.search}`);
    const budget = (await page.textContent('.criterion-tile >> nth=0 >> .criterion-value'))?.replace(/\s/g, ' ');
    if (budget !== '300 000 €') problems.push(`accueil ${width} : budget du projet « ${budget} » au lieu de « 300 000 € »`);
    const similar = await sectionCards(page, 'similaires');
    const similarWanted = [HOME_LISTINGS[0], HOME_LISTINGS[3], HOME_LISTINGS[5], HOME_LISTINGS[6], HOME_LISTINGS[7]].map((row) => row.title);
    if (JSON.stringify(similar) !== JSON.stringify(similarWanted)) problems.push(`accueil ${width} : biens similaires ${JSON.stringify(similar)} au lieu de ${JSON.stringify(similarWanted)}`);
    if (await page.locator('#consultes').count()) problems.push(`accueil ${width} : « Consultés récemment » affiché sans fiche ouverte`);
    // Fiche ouverte dans le même onglet, puis retour : elle passe en tête de « Consultés récemment ».
    await Promise.all([page.waitForURL(/\/annonce\/\?id=/), page.click('.opportunity-card h3 a >> nth=0')]);
    await page.waitForLoadState('networkidle');
    await page.goBack({ waitUntil: 'networkidle' });
    await page.waitForSelector('#consultes', { timeout: 8000 }).catch(() => undefined);
    const viewedFirst = await sectionCards(page, 'consultes');
    if (viewedFirst[0] !== HOME_LISTINGS[0].title) problems.push(`accueil ${width} : consultés ${JSON.stringify(viewedFirst)} après la fiche « ${HOME_LISTINGS[0].title} »`);
    // Trois autres fiches (une de plus que la ligne affichée), puis l'accueil complet pour la capture.
    for (const row of [HOME_LISTINGS[6], HOME_LISTINGS[5], HOME_LISTINGS[2]]) {
      await page.goto(`${base}/annonce/?id=${row.id}`, { waitUntil: 'networkidle' });
    }
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#consultes');
    await page.waitForSelector('#similaires');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    const memberSections = await homeSections(page);
    if (JSON.stringify(memberSections) !== JSON.stringify(['Opportunités du moment', 'Consultés récemment', 'Biens similaires à vos recherches', 'Nouveautés', 'Baisses de prix'])) {
      problems.push(`accueil ${width} connecté : sections ${JSON.stringify(memberSections)}`);
    }
    const viewed = await sectionCards(page, 'consultes');
    const viewedWanted = [HOME_LISTINGS[2], HOME_LISTINGS[5], HOME_LISTINGS[6], HOME_LISTINGS[0]].map((row) => row.title);
    if (JSON.stringify(viewed) !== JSON.stringify(viewedWanted)) problems.push(`accueil ${width} : consultés ${JSON.stringify(viewed)} au lieu de ${JSON.stringify(viewedWanted)}`);
    await checkOneRow(page, width, 'connecté', ['opportunites', 'consultes', 'similaires', 'nouveautes', 'baisses']);
    await checkChrome(page, `accueil maquette ${width} connecté`, { signedIn: true, margin: width >= 1280 ? 48 : 32 });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `1-accueil-${width}.png`), fullPage: true });
    await page.close();
    await member.close();
  }

  // Nom du compte tiré de l'adresse e-mail : « Bonjour », sans prénom (greetingName, HomeView.swift:328).
  const mailName = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
  await mock(mailName, { signedIn: true, account: { profiles: [{ ...ACCOUNT.profiles[0], display_name: 'claire.martin' }] } });
  page = await open(mailName, '/', 'accueil-nom-e-mail');
  await page.waitForSelector('.dhome .home-section');
  await page.waitForTimeout(400);
  const plain = await page.textContent('h1');
  if (plain !== 'Bonjour') problems.push(`accueil, nom tiré de l'e-mail : « ${plain} » au lieu de « Bonjour »`);
  await mailName.close();

  // « Rechercher des biens » ouvre la même adresse /recherche/ que l'accueil du téléphone, pour les mêmes choix.
  const searchUrl = async (context, name) => {
    const p = await open(context, '/', name);
    await p.waitForSelector('.home-search-card');
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

  // Téléphone : l'accueil ne fait aucune des lectures de l'ordinateur (projet, fiches consultées, biens similaires).
  for (const signedIn of [false, true]) {
    const phoneHome = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
    const phoneServer = await mock(phoneHome, { signedIn, listingRows: HOME_LISTINGS, account: HOME_PROJECT });
    await phoneHome.addInitScript((id) => { try { sessionStorage.setItem('nidalo.consultes', JSON.stringify([id])); } catch { /* indisponible */ } }, homeId(7));
    page = await open(phoneHome, '/', `accueil-telephone-lectures-${signedIn ? 'connecte' : 'sans-compte'}`);
    await page.waitForSelector('.home-section');
    if (signedIn) await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Bonjour Claire', null, { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    const extra = phoneServer.requests.filter((request) => request.path === '/' && (request.table === 'real_estate_projects' || (request.table === 'listings' && !request.search.includes('limit=200'))));
    if (extra.length) problems.push(`téléphone : l'accueil lit ${extra.map((request) => `${request.table}${request.search}`).join(' ; ')}`);
    if (await page.locator('.dhome, #consultes, #similaires').count()) problems.push('téléphone : sections de l\'ordinateur affichées');
    await phoneHome.close();
  }

  // Largeurs limites : sans les catégories, la barre du haut tient sur une ligne avec « Publier une annonce » et
  // « Mon espace » en entier dès 1024 px, avec des marges de 32 px jusqu'à 1279 px puis de 48 px.
  for (const width of [1024, 1179, 1180, 1279, 1280, 1365, 1366]) {
    const edge = await browser.newContext({ viewport: { width, height: 800 }, locale: 'fr-FR' });
    await mock(edge);
    const p = await open(edge, '/recherche/?mode=buy', `recherche-${width}`);
    await p.waitForSelector('.listing-card');
    await checkChrome(p, `recherche ${width}`, { signedIn: false, margin: width >= 1280 ? 48 : 32 });
    const names = await p.evaluate(() => [document.querySelector('.dtop-publish').getAttribute('aria-label'), document.querySelector('.dtop-space').getAttribute('aria-label')]);
    if (JSON.stringify(names) !== JSON.stringify(['Publier une annonce', 'Mon espace'])) problems.push(`barre ${width} : noms des liens ${JSON.stringify(names)}`);
    await p.close();
    await edge.close();
  }

  // Messages sur ordinateur (maquette 3) : boîte de réception, conversation, actions envoyées au serveur simulé comme
  // l'app les envoie, temps réel, à 1440 × 960 puis 1024 × 768 ; horloge figée au vendredi 6 novembre 2026, 10 h 50
  // à Paris. Captures pour Romain : 3-messages-*.png.
  const chatContext = async ({ width = 1440, height = 960, account = {}, signedIn = true, phone = false } = {}) => {
    const context = await browser.newContext(phone ? { ...devices['iPhone 13'], locale: 'fr-FR', timezoneId: 'Europe/Paris' }
      : { viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    await context.clock.setFixedTime(CHAT_NOW);
    const server = await mock(context, { signedIn, listingRows: [...listings, ...HOME_LISTINGS], account });
    const chat = chatState();
    await mockMessaging(context, chat, { signedIn });
    return { context, server, chat };
  };
  const A = chatId(1).toUpperCase();
  const rowLink = (n) => `.dm-list .dm-row[href="/messages/?c=${chatId(n)}"]`;
  const INITIAL_ROWS = [
    { name: 'Agence Démo Lyon', badge: 'PRO', time: '10:45', preview: 'Bien reçu, je transmets votre offre au propriétaire.', check: null, unread: '1', greyPill: false, bell: false, sub: 'Appartement 3 pièces · Lyon 2e' },
    { name: 'Visite groupée Lyon 2e', badge: null, time: '09:12', preview: 'Merci, à samedi !', check: null, unread: '3', greyPill: true, bell: false, sub: '3 membres' },
    { name: 'Julien M.', badge: 'Particulier', time: 'Hier', preview: 'Je peux signer rapidement si l\'offre vous convient.', check: null, unread: '2', greyPill: false, bell: false, sub: 'Appartement 2 pièces · Lyon 6e' },
    { name: 'Lucas G.', badge: 'Particulier', time: 'Mar.', preview: 'Nouvelle conversation', check: null, unread: null, greyPill: false, bell: false, sub: 'Maison familiale 5 pièces · Écully' },
    { name: 'Compte supprimé', badge: 'Particulier', time: '27 octobre', preview: 'Vous : Merci, je reviens vers vous rapidement.', check: 'Envoyé', unread: null, greyPill: false, bell: false, sub: 'Studio rénové' },
  ];
  const ALL_NAMES = INITIAL_ROWS.map((row) => row.name);

  for (const [width, height] of [[1440, 960], [1024, 768]]) {
    const M = `messages ${width}`;
    const { context: chatDesk, server: chatServer, chat } = await chatContext({ width, height });
    page = await open(chatDesk, '/messages/', `messages-${width}`);
    await page.waitForSelector('.dm-list .dm-row');
    await page.waitForSelector('.dm-next-card');
    await imagesLoaded(page, '.dm-next-photo img', 1, M);
    // Pastille : 1 + 2 + 3 non-lus ; l'archivée n'y compte pas.
    await waitForMessagesBadge(page, '6', M);
    expectSame(M, 'volet de droite sans ?c=', await textOf(page, '.dm-main'), 'Sélectionnez une conversation');
    if (chatCalls(chat, 'messages').length || chatCalls(chat, 'rpc/mark_conversation_read').length) problems.push(`${M} : sans ?c=, une conversation est lue ou marquée lue`);
    const layout = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
      return {
        side: box('.dm-side')?.width, chips: [...document.querySelectorAll('.dm-chip')].map((chip) => Math.round(chip.getBoundingClientRect().height)), top: box('.dm')?.top, bottom: box('.dm')?.bottom, pageScroll: document.documentElement.scrollHeight - innerHeight,
        overflowX: document.documentElement.scrollWidth - innerWidth, footer: Boolean(document.querySelector('.dfoot, footer.footer')),
        active: document.querySelector('.dtop-round[href="/messages/"]')?.getAttribute('aria-current') ?? null,
      };
    });
    expectSame(M, 'mise en page', layout, { side: 420, chips: [34, 34, 34, 34, 34], top: 72, bottom: height, pageScroll: 0, overflowX: 0, footer: false, active: 'page' });
    expectSame(M, 'en-tête de la colonne', [await textOf(page, '.dm-side-head h1'), await textOf(page, '.dm-side-head p'), await page.getAttribute('.dm-compose', 'aria-label'),
      await page.getAttribute('.dm-search input', 'placeholder')], ['Messages', 'Vos échanges, votre futur chez-vous.', 'Nouveau message', 'Rechercher un contact ou un bien']);
    expectSame(M, 'conversations', await inboxRows(page), INITIAL_ROWS);
    expectSame(M, 'nombre de conversations', await textOf(page, '.dm-list-head'), `Toutes les conversations ${INITIAL_ROWS.length}`);
    expectSame(M, 'filtres', await page.$$eval('.dm-chip', (els) => els.map((el) => [el.getAttribute('aria-label'), el.getAttribute('aria-pressed')])),
      [['Tous', 'true'], ['Non lus, 3', 'false'], ['Favoris', 'false'], ['Visites', 'false'], ['Archivés', 'false']]);
    expectSame(M, 'prochaine visite', [await textOf(page, '.dm-next .dm-section-head'), await page.getAttribute('.dm-next .dm-section-head a', 'href'), await textOf(page, '.dm-next-card')],
      // « Voir l'agenda » ouvre Mon agenda (Mon espace sur ordinateur).
      ['Prochaine visite Voir l’agenda', '/compte/?vue=agenda', 'VISITE CONFIRMÉE Jeu. 12 nov. · 18h00 Appartement 3 pièces · Lyon 2e 238 000 € AD Avec Agence Démo Lyon']);
    // Aucune conversation n'est ouverte d'elle-même : aucune ligne n'est sélectionnée.
    if (await page.locator('.dm-row[aria-current="true"]').count()) problems.push(`${M} : une conversation est sélectionnée sans ?c=`);
    await chatShot(page, `3-messages-vide-${width}.png`);

    if (width === 1440) {
      // Filtres de l'app : non lus (sans les archivées), favoris, visite à venir, archivées.
      for (const [label, names] of [['Non lus, 3', ['Agence Démo Lyon', 'Visite groupée Lyon 2e', 'Julien M.']], ['Favoris', ['Julien M.']], ['Visites', ['Agence Démo Lyon']],
        ['Archivés', ['Marc P.']], ['Tous', ALL_NAMES]]) {
        await page.click(`.dm-chip[aria-label="${label}"]`);
        await waitForRows(page, names, `${M} : filtre ${label}`);
        if ((await page.getAttribute(`.dm-chip[aria-label="${label}"]`, 'aria-pressed')) !== 'true') problems.push(`${M} : filtre ${label} non enfoncé`);
        if (label === 'Archivés' && await page.locator('.dm-next').count()) problems.push(`${M} : prochaine visite affichée dans les archivées`);
      }
      // Recherche : contacts, conversations et annonces (une ville) ; puis un nom ; « Annuler » rend la liste.
      await page.fill('.dm-search input', 'Écully');
      await page.waitForSelector('.dm-listing-result');
      await page.waitForFunction(() => !document.querySelector('.dm-results .spinner'), null, { timeout: 8000 }).catch(() => undefined);
      const results = () => page.evaluate(() => ({
        titles: [...document.querySelectorAll('.dm-results-title')].map((el) => el.textContent.trim()),
        contacts: [...document.querySelectorAll('.dm-results button.dm-contact .dm-contact-name')].map((el) => el.textContent),
        conversations: [...document.querySelectorAll('.dm-results a.dm-contact .dm-contact-name')].map((el) => el.textContent),
        listings: [...document.querySelectorAll('.dm-listing-result .dm-listing-title')].map((el) => el.textContent),
      }));
      expectSame(M, 'recherche « Écully »', await results(), { titles: ['Contacts', 'Conversations', 'Annonces'], contacts: ['Lucas G.'], conversations: ['Lucas G.'], listings: ['Maison familiale 5 pièces'] });
      await page.fill('.dm-search input', 'Julien');
      await page.waitForFunction(() => document.querySelector('.dm-results a.dm-contact .dm-contact-name')?.textContent === 'Julien M.' && !document.querySelector('.dm-results .spinner'), null, { timeout: 8000 })
        .catch(() => undefined);
      await page.waitForTimeout(400);
      expectSame(M, 'recherche « Julien »', await results(), { titles: ['Contacts', 'Conversations'], contacts: ['Julien M.'], conversations: ['Julien M.'], listings: [] });
      await page.click('.dm-search-cancel');
      await waitForRows(page, ALL_NAMES, `${M} : après « Annuler »`);
    }

    // Ouvrir la conversation de l'agence : elle s'ouvre à droite sans recharger la page, est lue puis marquée lue une fois.
    let mark = chat.calls.length;
    await page.evaluate(() => { window.nidaloMarker = 'même page'; });
    await page.click(rowLink(1));
    await page.waitForURL(`${base}/messages/?c=${chatId(1)}`);
    await page.waitForSelector('.dm-thread-inner .dm-day');
    await page.waitForSelector('.dm-offer .dm-offer-amount');
    const read = await oneCall(chat, 'rpc/mark_conversation_read', mark, `${M} : ouverture`);
    if (read) expectSame(M, 'conversation marquée lue', read.body, { p_conversation_id: A });
    await waitForMessagesBadge(page, '5', `${M} : après l'ouverture`);
    if ((await page.evaluate(() => window.nidaloMarker)) !== 'même page') problems.push(`${M} : la page s'est rechargée à l'ouverture`);
    expectSame(M, 'lecture des messages', chatCalls(chat, 'messages', mark).map((call) => `${call.method} ${call.search}`),
      [`GET ?select=id,conversation_id,sender_id,kind,client_id,content,created_at,expires_at,message_reactions(user_id,emoji,created_at)&conversation_id=eq.${A}&order=created_at.desc&limit=200`]);
    const opened = await page.evaluate(() => {
      const row = document.querySelector('.dm-row[aria-current="true"]');
      const sent = document.querySelector('.dm-bubble.is-out');
      const received = document.querySelector('.dm-bubble:not(.is-out)');
      const style = (el) => (el ? [getComputedStyle(el).backgroundColor, getComputedStyle(el).color] : null);
      return {
        row: row?.querySelector('.dm-row-name')?.textContent ?? null, rowBackground: row ? getComputedStyle(row).backgroundColor : null,
        unread: row?.querySelector('.dm-unread')?.textContent ?? null, sent: style(sent), received: style(received),
        column: Math.round(document.querySelector('.dm-thread-inner')?.getBoundingClientRect().width ?? 0),
      };
    });
    expectSame(M, 'conversation ouverte', opened, {
      row: 'Agence Démo Lyon', rowBackground: 'rgb(238, 242, 250)', unread: null, sent: ['rgb(60, 92, 176)', 'rgb(255, 255, 255)'],
      received: ['rgb(255, 255, 255)', 'rgb(36, 45, 56)'], column: width === 1440 ? 760 : 556,
    });
    expectSame(M, 'en-tête', [await textOf(page, '.dm-head-title'), await textOf(page, '.dm-head .dm-badge'), await textOf(page, '.dm-head-sub'),
      await page.getAttribute('.dm-head-who', 'href')], ['Agence Démo Lyon', 'PRO', 'Appartement 3 pièces · Lyon 2e', `/messages/?c=${chatId(1)}&vue=details`]);
    await page.waitForSelector('.dm-banner-link');
    expectSame(M, 'bandeau du bien', [await textOf(page, '.dm-banner-title'), await textOf(page, '.dm-banner-line'), await textOf(page, '.dm-banner-link'),
      await page.getAttribute('a.dm-banner', 'href')], ['Appartement 3 pièces', 'Lyon 2e · Rue de l\'Exemple · 238 000 €', 'Voir l\'annonce', `/annonce/?id=${homeId(1)}`]);
    expectSame(M, 'jours', await page.$$eval('.dm-day-label', (els) => els.map((el) => el.textContent)), ['Hier · 18:02', 'Aujourd\'hui · 09:58']);
    // Coches : l'agence a tout lu jusqu'à 10:45 ; aucun « Lu », « En ligne » ni « écrit… » (absents de l'app).
    expectSame(M, 'coches', await page.$$eval('.dm-msg.is-out .dm-check', (els) => els.map((el) => el.getAttribute('aria-label'))), ['Vu', 'Vu', 'Vu']);
    const paneText = await textOf(page, '.dm-pane');
    if (/En ligne|écrit…|écrit\.\.\.|\bLu\b/.test(paneText ?? '')) problems.push(`${M} : « En ligne », « écrit… » ou « Lu » affiché`);
    expectSame(M, 'carte d\'offre', [await textOf(page, '.dm-offer-head'), await textOf(page, '.dm-offer-amount'), await textOf(page, '.dm-offer-gap'),
      await textOf(page, '.dm-offer-conditions'), await textOf(page, '.dm-offer-expiry'), await page.$$eval('.dm-offer-actions button', (els) => els.map((el) => el.textContent))],
      ['OFFRE En attente', '228 000 €', '4,2 % sous le prix affiché', 'Sous réserve d\'obtention du prêt', 'Valable jusqu\'au 13 novembre', ['Retirer']]);
    await imagesLoaded(page, '.dm-media-tile img', 2, `${M} : photos`);
    await page.waitForSelector('a.dm-doc');
    const signedPhotos = await page.$$eval('.dm-media-tile img', (els) => els.map((el) => el.getAttribute('src')));
    expectSame(M, 'photos (URL signées)', signedPhotos, AGENT_PHOTOS.map((path) => `https://izzsoitqtzzswkpvdozd.supabase.co/storage/v1/object/sign/message-attachments/${path}?token=jeton-de-test`));
    expectSame(M, 'URL signées demandées', [...new Map(chat.signs.map((sign) => [sign.path, sign.body])).entries()].sort(),
      [[AGENT_PHOTOS[0], { expiresIn: 600 }], [AGENT_PHOTOS[1], { expiresIn: 600 }], [LOAN_PDF, { expiresIn: 600 }]]);
    expectSame(M, 'document', [await textOf(page, '.dm-doc-name'), await textOf(page, '.dm-doc-line'), await page.getAttribute('a.dm-doc', 'href'), await page.getAttribute('a.dm-doc', 'target')],
      ['Simulation_pret.pdf', 'Justificatif de revenus · PDF · 245 Ko', `https://izzsoitqtzzswkpvdozd.supabase.co/storage/v1/object/sign/message-attachments/${LOAN_PDF}?token=jeton-de-test`, '_blank']);
    expectSame(M, 'réponses rapides', await page.$$eval('.dm-quick button', (els) => els.map((el) => el.textContent)), ['Parfait, merci\u00a0!', 'Décaler la visite', 'Questions']);
    expectSame(M, 'barre d\'écriture', [await page.getAttribute('.dm-composer textarea', 'placeholder'), await page.getAttribute('.dm-plus', 'aria-label'),
      await page.getAttribute('.dm-emoji', 'aria-label'), await page.isDisabled('.dm-send')], ['Votre message...', 'Ajouter une pièce jointe', 'Ajouter un émoji', true]);
    const atBottom = await page.evaluate(() => { const el = document.querySelector('.dm-thread'); return el.scrollHeight - el.scrollTop - el.clientHeight; });
    if (atBottom > 2) problems.push(`${M} : la conversation ne s'ouvre pas en bas (${atBottom} px plus bas)`);
    await chatShot(page, `3-messages-${width}.png`);

    if (width === 1440) {
      // Cœur (message_reactions, comme setReaction) : posé, puis retiré.
      const lastReceived = page.locator('.dm-msg:not(.is-out)').last();
      mark = chat.calls.length;
      await lastReceived.locator('.dm-bubble').hover();
      await lastReceived.locator('.dm-heart-button').click();
      await lastReceived.locator('.dm-heart').waitFor({ timeout: 8000 }).catch(() => problems.push(`${M} : cœur non affiché`));
      const liked = await oneCall(chat, 'message_reactions', mark, `${M} : cœur`);
      if (liked) {
        expectSame(M, 'cœur posé', [liked.method, liked.search, liked.body], ['POST', '?on_conflict=message_id,user_id', { message_id: messageId(7).toUpperCase(), emoji: '♥' }]);
        if (!liked.prefer.includes('resolution=merge-duplicates')) problems.push(`${M} : cœur sans fusion (Prefer « ${liked.prefer} »)`);
      }
      mark = chat.calls.length;
      await lastReceived.locator('.dm-heart-button').click();
      await lastReceived.locator('.dm-heart').waitFor({ state: 'detached', timeout: 8000 }).catch(() => problems.push(`${M} : cœur non retiré`));
      const unliked = await oneCall(chat, 'message_reactions', mark, `${M} : cœur retiré`);
      if (unliked) expectSame(M, 'cœur retiré', [unliked.method, unliked.search], ['DELETE', `?message_id=eq.${messageId(7).toUpperCase()}&user_id=eq.${USER_ID.toUpperCase()}`]);

      // Envois : une réponse rapide, puis un texte (émoji, Entrée), avec exactement les colonnes de l'app (MessageInsert).
      const checkInsert = (call, what, content, preview) => {
        if (!call) return;
        const body = call.body ?? {};
        if (!UPPER_UUID.test(body.id ?? '') || body.client_id !== body.id) problems.push(`${M} : ${what} : identifiants ${body.id} / ${body.client_id}`);
        expectSame(M, what, [call.method, call.search, body], ['POST', '?select=id,conversation_id,sender_id,kind,client_id,content,created_at,expires_at,message_reactions(user_id,emoji,created_at)',
          { id: body.id, conversation_id: A, client_id: body.id, content, preview }]);
        if (!call.prefer.includes('return=representation')) problems.push(`${M} : ${what} : Prefer « ${call.prefer} »`);
      };
      mark = chat.calls.length;
      await page.click('.dm-quick button:text-is("Parfait, merci !")');
      checkInsert(await oneCall(chat, 'messages', mark, `${M} : réponse rapide`, (call) => call.method === 'POST'), 'réponse rapide', chatText('Parfait, merci\u00a0!'), 'Parfait, merci\u00a0!');
      await page.waitForFunction(() => [...document.querySelectorAll('.dm-bubble.is-out')].at(-1)?.textContent === 'Parfait, merci\u00a0!', null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : la réponse rapide n'apparaît pas`));
      if (await page.locator('.dm-quick').count()) problems.push(`${M} : réponses rapides affichées après mon message`);
      mark = chat.calls.length;
      await page.fill('.dm-composer textarea', 'Merci, à jeudi ');
      await page.click('.dm-emoji');
      expectSame(M, 'émoji ajouté', await page.inputValue('.dm-composer textarea'), 'Merci, à jeudi 🙂');
      await page.focus('.dm-composer textarea');
      await page.keyboard.press('Enter');
      checkInsert(await oneCall(chat, 'messages', mark, `${M} : texte`, (call) => call.method === 'POST'), 'texte envoyé', chatText('Merci, à jeudi 🙂'), 'Merci, à jeudi 🙂');
      await page.waitForFunction(() => [...document.querySelectorAll('.dm-bubble.is-out')].at(-1)?.textContent === 'Merci, à jeudi 🙂', null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : le texte envoyé n'apparaît pas`));
      expectSame(M, 'après l\'envoi', [await page.inputValue('.dm-composer textarea'), await page.$$eval('.dm-msg.is-out .dm-check', (els) => els.at(-1)?.getAttribute('aria-label')),
        (await inboxRows(page))[0]], ['', 'Envoyé', { ...INITIAL_ROWS[0], preview: 'Vous : Merci, à jeudi 🙂', check: 'Envoyé', unread: null, time: '10:50' }]);
      if (await page.locator('dialog.alert-dialog[open]').count()) problems.push(`${M} : une fenêtre (prénom ?) s'ouvre alors que le compte a un prénom`);

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
      await page.waitForFunction(() => [...document.querySelectorAll('.dm-doc-name')].some((el) => el.textContent === 'dpe.pdf'), null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : le document envoyé n'apparaît pas`));

      // Temps réel : l'agence lit (coches « Vu »), puis écrit ; tout arrive sans recharger, et la conversation est relue
      // puis marquée lue une fois de plus.
      chat.participants.find((item) => item.conversation_id === chatId(1) && item.user_id === AGENT_ID).last_read_at = new Date(CHAT_NOW.getTime() + 60_000).toISOString();
      chatServer.pushChange('conversation_participants');
      await page.waitForFunction(() => [...document.querySelectorAll('.dm-msg.is-out .dm-check')].every((el) => el.getAttribute('aria-label') === 'Vu')
        && document.querySelector('.dm-row[aria-current="true"] .dm-row-preview .dm-check')?.getAttribute('aria-label') === 'Vu', null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : coches non mises à jour après la lecture de l'agence`));
      mark = chat.calls.length;
      chat.messages.push({
        id: messageId(8), conversation_id: chatId(1), sender_id: AGENT_ID, kind: 'text', client_id: messageId(8), content: chatText('Je vous appelle demain matin pour organiser la suite.'),
        created_at: new Date(CHAT_NOW.getTime() + 120_000).toISOString(), expires_at: null, message_reactions: [], preview: 'Je vous appelle demain matin pour organiser la suite.',
      });
      chat.conversations[0].unread += 1;
      chatServer.pushChange('messages');
      await page.waitForFunction(() => [...document.querySelectorAll('.dm-bubble')].at(-1)?.textContent === 'Je vous appelle demain matin pour organiser la suite.', null, { timeout: 8000 })
        .catch(() => problems.push(`${M} : le message reçu en temps réel n'apparaît pas`));
      const liveRead = await oneCall(chat, 'rpc/mark_conversation_read', mark, `${M} : message reçu`);
      if (liveRead) expectSame(M, 'message reçu marqué lu', liveRead.body, { p_conversation_id: A });
      await waitForMessagesBadge(page, '5', `${M} : après le message reçu`);
      if ((await page.evaluate(() => window.nidaloMarker)) !== 'même page') problems.push(`${M} : la page s'est rechargée`);
      expectSame(M, 'temps réel suivi', ['messages', 'conversation_participants', 'message_reactions', 'offers'].filter((table) => !chatServer.followed().includes(table)), []);

      // Menu ⋮ : les actions de l'app ; chaque réglage relit la conversation puis enregistre tous ses réglages.
      expectSame(M, 'menu ⋮', await headerMenu(page), ['Archiver', 'Mettre en sourdine', 'Ajouter aux favoris', 'Bloquer', 'Signaler']);
      const settings = { is_archived: false, is_favorite: false, muted_until: null, saves_photos: false, cleared_at: null };
      const setting = async (label, change, notice = null) => {
        const before = chat.calls.length;
        await headerMenu(page, label);
        if (notice) expectSame(M, `avis de « ${label} »`, await noticeText(page, M), notice);
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
      await setting('Mettre en sourdine', { muted_until: '4001-01-01T00:00:00.000Z' });
      await page.waitForSelector(`${rowLink(1)} .dm-row-muted`, { timeout: 8000 }).catch(() => problems.push(`${M} : cloche barrée absente après la sourdine`));
      await setting('Réactiver les notifications', { muted_until: null });
      await setting('Ajouter aux favoris', { is_favorite: true }, 'Conversation ajoutée aux favoris.');
      await setting('Retirer des favoris', { is_favorite: false }, 'Conversation retirée des favoris.');
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
      expectSame(M, 'avis du signalement', await noticeText(page, M), 'Signalement transmis à l’équipe NIDALO.');
      const report = await oneCall(chat, 'reports', mark, `${M} : signaler`);
      if (report) {
        if (!UPPER_UUID.test(report.body?.id ?? '')) problems.push(`${M} : identifiant du signalement ${report.body?.id}`);
        expectSame(M, 'signalement envoyé', [report.method, report.body], ['POST', { id: report.body?.id, target_type: 'conversation', target_id: A, reason: 'scam', details: 'Demande de virement avant la visite.' }]);
      }
      // Appeler : « Appeler X ? » puis le numéro publié de l'agence (lien tel:) ; ici, « Annuler ».
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
      await page.waitForSelector('.dm-pane .dl-offer-screen h1');
      expectSame(M, 'écran de l\'offre', [await textOf(page, '.dl-offer-screen h1'), await textOf(page, '.dl-offer-screen .dl-screen-head p')],
        ['Faire une offre', 'Appartement 3 pièces · prix affiché 238 000 €']);
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

      // B : le compte vend ; refuser (motif), accepter, contre-offre (decline_offer, accept_offer, counter_offer).
      mark = chat.calls.length;
      await page.click(rowLink(2));
      await page.waitForURL(`${base}/messages/?c=${chatId(2)}`);
      await page.waitForSelector('.dm-offer-actions');
      const readB = await oneCall(chat, 'rpc/mark_conversation_read', mark, `${M} : ouverture de B`);
      if (readB) expectSame(M, 'B marquée lue', readB.body, { p_conversation_id: chatId(2).toUpperCase() });
      await waitForMessagesBadge(page, '3', `${M} : après l'ouverture de B`);
      expectSame(M, 'offre reçue', [await textOf(page, '.dm-offer-head'), await textOf(page, '.dm-offer-gap'), await page.$$eval('.dm-offer-actions button', (els) => els.map((el) => el.textContent))],
        ['OFFRE En attente', '3,8 % sous le prix affiché', ['Accepter', 'Contre-offre', 'Refuser']]);
      // « Faire une offre » n'est pas proposé au vendeur.
      await page.click('.dm-plus');
      expectSame(M, '« + » du vendeur', await page.$$eval('dialog[open] .dm-wide-title', (els) => els.map((el) => el.textContent)), ['Documents immobiliers']);
      await page.click('dialog.dm-sheet[open] .dm-sheet-close');
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
      await page.waitForSelector('.dm-pane .dl-offer-screen h1');
      expectSame(M, 'contre-offre', [await textOf(page, '.dl-offer-screen h1'), (await page.inputValue('#offre-montant')).replace(/\s/g, ' '), await textOf(page, '.dl-offer-screen .dl-submit')],
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
        const cards = [...document.querySelectorAll('.dm-offer')].map((card) => card.textContent.replace(/\s/g, ' '));
        return cards.length === 2 && cards[0].includes('Contre-offre envoyée') && cards[1].includes('CONTRE-OFFRE') && cards[1].includes('260 000 €') && cards[1].includes('Retirer');
      }, null, { timeout: 8000 }).catch(async () => problems.push(`${M} : cartes après la contre-offre ${JSON.stringify(await page.$$eval('.dm-offer', (els) => els.map((el) => el.textContent)))}`));
      // Un numéro non publié : l'avis de l'app, pas d'appel.
      await page.click('.dm-head button[aria-label="Numéro non partagé"]');
      expectSame(M, 'appel sans numéro', await noticeText(page, M), 'Julien M. n\'a pas partagé son numéro. Vous pouvez lui écrire ici.');
    }

    // D : groupe en sourdine, marqué lu à l'ouverture ; ses infos et l'ajout de membres restent dans l'app iPhone.
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
      await iphoneOnly(page, `${M} : groupe`, 'Infos du groupe');
      await page.click('.dm-head button[aria-label="Ajouter des membres"]');
      await iphoneOnly(page, `${M} : groupe`, 'Ajouter des membres');
      expectSame(M, 'menu ⋮ du groupe', await headerMenu(page), ['Infos du groupe', 'Ajouter aux favoris', 'Réactiver les notifications', 'Archiver', 'Signaler le groupe']);
      mark = chat.calls.length;
      await headerMenu(page, 'Réactiver les notifications');
      const unmuted = await oneCall(chat, 'conversation_preferences', mark, `${M} : groupe réactivé`);
      if (unmuted) expectSame(M, 'groupe réactivé', unmuted.body, { conversation_id: chatId(4).toUpperCase(), is_archived: false, is_favorite: false, muted_until: null, saves_photos: false, cleared_at: null });
    }

    // « Détails » : ouvert par l'en-tête de la conversation à deux, à sa propre adresse ; « Retour » revient.
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

    // « Nouvelle discussion » : actions rapides, contacts ; groupes, communautés et diffusions dans l'app iPhone.
    await page.click('.dm-compose');
    expectSame(M, 'nouvelle discussion', [await dialogTitle(page, 'sheet'), await page.$$eval('dialog[open] .dm-quick-actions .dm-action-text', (els) => els.map((el) => el.textContent)),
      await page.$$eval('dialog[open] .dm-results-title', (els) => els.map((el) => el.textContent))],
      ['Nouvelle discussion', ['Nouveau groupe', 'Nouvelle communauté', 'Nouveau contact', 'Nouvelle diffusion'], ['Contacts fréquents', 'A', 'C', 'I', 'J', 'L', 'M']]);
    await page.waitForTimeout(300);
    await chatShot(page, `3-messages-nouvelle-${width}.png`);
    if (width === 1440) {
      for (const title of ['Nouveau groupe', 'Nouvelle communauté', 'Nouvelle diffusion']) {
        await page.click(`dialog[open] .dm-quick-actions .dm-action-row:has-text("${title}")`);
        await iphoneOnly(page, `${M} : nouvelle discussion`, title);
      }
      // « Nouveau contact » : le compte NIDALO d'un numéro (find_account_by_phone), puis « Écrire » (start_phone_conversation).
      await page.click('dialog[open] .dm-quick-actions .dm-action-row:has-text("Nouveau contact")');
      expectSame(M, 'nouveau contact', await dialogTitle(page, 'sheet'), 'Nouveau contact');
      mark = chat.calls.length;
      await page.fill('dialog[open] input[aria-label="Numéro de téléphone"]', '0639985678');
      await page.waitForSelector('dialog[open] .dm-phone-account');
      expectSame(M, 'compte trouvé', [await page.inputValue('dialog[open] input[aria-label="Numéro de téléphone"]'), await textOf(page, 'dialog[open] .dm-phone-card')],
        ['06 39 98 56 78', '06 39 98 56 78 Compte NIDALO trouvé NL Nina L. Particulier Ajouter aux contacts Écrire']);
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
      // Une agence qui publie, pas encore contactée : start_direct_conversation.
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

  // Premier message sans prénom : « Votre prénom » (comme l'app), enregistré comme updateUser, puis le message part.
  // Aussi « Faire une offre » proposé à l'acheteur, et les sources du « + » qui restent dans l'app iPhone.
  {
    const M = 'messages prénom';
    const { context: nameDesk, chat } = await chatContext({ account: { profile_details: [{ ...ACCOUNT.profile_details[0], first_name: null }] } });
    page = await open(nameDesk, `/messages/?c=${chatId(5)}`, 'messages-prenom');
    await page.waitForSelector('.dm-thread-empty');
    if (chatCalls(chat, 'rpc/mark_conversation_read').length) problems.push(`${M} : conversation sans non-lus marquée lue`);
    await page.click('.dm-plus');
    expectSame(M, '« + » de l\'acheteur', await page.$$eval('dialog[open] .dm-wide-title', (els) => els.map((el) => el.textContent)), ['Documents immobiliers', 'Faire une offre']);
    await page.click('dialog[open] .dm-sources button[aria-label="Localisation"]');
    await iphoneOnly(page, M, 'Localisation');
    await page.click('.dm-plus');
    await page.click('dialog[open] .dm-sources button[aria-label="Depuis mon dossier"]');
    await iphoneOnly(page, M, 'Mon dossier');
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

  // Sous 1024 px : la page « bientôt » du téléphone, même avec le compte et une adresse ?c= ; rien n'est demandé.
  {
    const { context: chatPhone, chat } = await chatContext({ phone: true });
    for (const path of ['/messages/', `/messages/?c=${chatId(1)}`]) {
      page = await open(chatPhone, path, `messages-telephone-connecte ${path}`);
      await page.waitForSelector('.card.state h1');
      expectSame('messages téléphone', `page ${path}`, [await textOf(page, '.card.state h1'), await page.locator('.dm').count()], ['Vos messages', 0]);
      await page.close();
    }
    if (chat.calls.length) problems.push(`messages téléphone : ${chat.calls.map((call) => call.table).join(', ')} demandé(s)`);
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

  // Favoris sur ordinateur (maquette 4), à 1440 × 900 et 1024 × 768, avec le compte de test et des annonces inventées :
  // une vente, une location, un investissement loué (rendement), un hôtel et une annonce retirée. Contenu et actions de
  // l'app (FavoritesView.swift, SavedSearchesView.swift). Captures pour Romain : 4-favoris-*.png.
  const favContext = async (width, height, listingRows, account, signedIn = true) => {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR' });
    const mocked = await mock(context, { signedIn, listingRows, account });
    return { context, server: mocked };
  };
  for (const [width, height] of [[1440, 900], [1024, 768]]) {
    const F = `favoris ${width}`;
    // Au plus près de la maquette : un investissement loué, un studio, une annonce retirée ; comparaison vide.
    {
      const { context, server: mockupServer } = await favContext(width, height, MOCKUP_LISTINGS, MOCKUP_ACCOUNT);
      page = await open(context, '/favoris/', `${F} maquette`);
      await waitForFavorites(page, ['Appartement 2 pièces – Annemasse', 'Studio avec vue dégagée'], '2 biens sauvegardés', `${F} maquette`);
      await page.waitForSelector('.dfav-missing');
      await page.waitForSelector('.dfav-dot');
      await favoritePhotosLoaded(page, 2, `${F} maquette`);
      await checkBadges(page, mockupServer.state, `${F} maquette`);
      await favShot(page, `4-favoris-${width}.png`);
      if (width === 1440) {
        await page.click('.dfav-tab >> nth=1');
        await page.waitForSelector('.dfav-searches .saved-search');
        await waitForSearchCounts(page, `${F} maquette`);
        await favShot(page, '4-favoris-recherches-1440.png');
      }
      await page.close();
      await context.close();
    }

    const { context: favDesk, server: favServer } = await favContext(width, height, FAV_LISTINGS, FAV_ACCOUNT);
    page = await open(favDesk, '/favoris/', F);
    await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', F);
    await page.waitForSelector('.dfav-dot');
    await favoritePhotosLoaded(page, 3, F);
    await checkChrome(page, F, { signedIn: true, margin: width >= 1280 ? 48 : 32 });
    await checkBadges(page, favServer.state, F);
    expectSame(F, 'en-tête', [await textOf(page, '.dfav-titles h1'), await textOf(page, '.dfav-titles p'), await page.getAttribute('.dfav-compare', 'aria-label'),
      await page.isDisabled('.dfav-compare'), await page.locator('.dfav-compare-count').count(), await page.getAttribute('.dtop-round[href="/favoris/"]', 'aria-current')],
    ['Vos favoris', 'Retrouvez vos biens favoris et vos recherches', 'Comparer vos favoris', false, 0, 'page']);
    expectSame(F, 'onglets', await page.$$eval('.dfav-tab', (els) => els.map((el) => [el.firstChild?.nextSibling?.textContent ?? null, el.querySelector('.dfav-tab-count')?.textContent ?? null,
      el.getAttribute('aria-label'), el.getAttribute('aria-pressed'), Boolean(el.querySelector('.dfav-dot'))])),
    [['Favoris', null, null, 'true', false], ['Recherches', '(2)', 'Recherches, 2, nouveautés', 'false', true]]);
    expectSame(F, 'recherche, filtres et tri', [await page.getAttribute('.dfav-field input', 'placeholder'), await page.getAttribute('.dfav-field input', 'aria-label'),
      await page.getAttribute('.dfav-filters', 'aria-label'), await page.getAttribute('.dfav-sort select', 'aria-label'), await page.textContent('.dfav-sort > span'),
      await page.$$eval('.dfav-sort option', (els) => els.map((el) => [el.value, el.textContent]))],
    ['Ville, code postal, type de bien', 'Rechercher dans vos favoris', 'Filtres', 'Trier par', 'Pertinence',
      [['relevance', 'Pertinence'], ['priceAscending', 'Prix croissant'], ['priceDescending', 'Prix décroissant'], ['recentlyAdded', 'Ajout le plus récent']]]);
    expectSame(F, 'catégories', await page.$$eval('.dfav-chip', (els) => els.map((el) => [el.textContent.trim(), el.getAttribute('aria-pressed')])),
      [['Tous', 'true'], ['Résidentiel', 'false'], ['Location', 'false'], ['Investir', 'false'], ['Hôtels', 'false']]);
    expectSame(F, 'cartes', await favoriteCardsShown(page), FAV_CARDS);
    // L'annonce retirée vient après les cartes, comme dans l'app.
    expectSame(F, 'grille', await page.$$eval('.dfav-grid > *', (els) => els.map((el) => el.className)), ['dfav-card', 'dfav-card', 'dfav-card', 'dfav-card', 'dfav-missing']);
    expectSame(F, 'annonce plus disponible', [await textOf(page, '.dfav-missing-title'), await textOf(page, '.dfav-missing-text'), await textOf(page, '.dfav-missing-remove')],
      ['Annonce plus disponible', 'Le vendeur l\'a retirée, vendue ou louée.', 'Retirer']);
    const favLayout = await page.evaluate(() => {
      const box = (element) => element.getBoundingClientRect();
      const items = [...document.querySelectorAll('.dfav-grid > *')].map(box);
      const field = box(document.querySelector('.dfav-field'));
      const middle = (rect) => Math.round(rect.top + rect.height / 2);
      return {
        content: Math.round(box(document.querySelector('.dfav-inner')).width), columns: getComputedStyle(document.querySelector('.dfav-grid')).gridTemplateColumns.split(' ').length,
        widths: [...new Set(items.map((rect) => Math.round(rect.width)))], heights: new Set(items.map((rect) => Math.round(rect.height))).size,
        photos: [...new Set([...document.querySelectorAll('.dfav-photo')].map((photo) => Math.round(box(photo).height)))], field: Math.round(field.width),
        chipsBesideField: [...document.querySelectorAll('.dfav-chip')].every((chip) => Math.abs(middle(box(chip)) - middle(field)) <= 2),
        overflowX: document.documentElement.scrollWidth - innerWidth, footer: Boolean(document.querySelector('.dfoot')),
      };
    });
    expectSame(F, 'mise en page', favLayout, {
      content: width === 1440 ? 1200 : 960, columns: 3, widths: [width === 1440 ? 384 : 307], heights: 1, photos: [220], field: 420, chipsBesideField: width === 1440, overflowX: 0, footer: true,
    });
    // Tailles de la maquette (titre 36/700, textes 15, titres de carte 17/700) et police Inter partout, boutons compris.
    const favFonts = await page.evaluate(() => {
      const font = (selector) => {
        const style = getComputedStyle(document.querySelector(selector));
        return `${style.fontSize} ${style.fontWeight}${style.fontFamily.startsWith('"Nidalo Inter"') ? '' : ` ${style.fontFamily}`}`;
      };
      return {
        titre: font('.dfav-titles h1'), 'sous-titre': font('.dfav-titles p'), onglet: font('.dfav-tab'), champ: font('.dfav-field input'), catégorie: font('.dfav-chip'),
        nombre: font('.dfav-total'), tri: font('.dfav-sort'), 'titre de carte': font('.dfav-title'), infos: font('.dfav-details'), prix: font('.dfav-price strong'),
        'prix au m²': font('.dfav-per-meter'), rendement: font('.dfav-yield'), 'plus disponible': font('.dfav-missing-title'), Retirer: font('.dfav-missing-remove'),
      };
    });
    expectSame(F, 'polices', favFonts, {
      titre: '36px 700', 'sous-titre': '15px 400', onglet: '15px 600', champ: '15px 400', catégorie: '15px 600', nombre: '15px 600', tri: '15px 600', 'titre de carte': '17px 700',
      infos: '15px 400', prix: '20px 700', 'prix au m²': '14px 500', rendement: '14px 600', 'plus disponible': '18px 700', Retirer: '15px 600',
    });
    await favShot(page, `favoris-${width}.png`);
    await page.click('.dfav-tab >> nth=1');
    await page.waitForSelector('.dfav-searches .saved-search');
    await waitForSearchCounts(page, F);
    if (page.url() !== `${base}/favoris/?onglet=recherches`) problems.push(`${F} : adresse de l'onglet Recherches ${page.url()}`);
    expectSame(F, 'onglet Recherches', [await page.$$eval('.dfav-tab', (els) => els.map((el) => el.getAttribute('aria-pressed'))), await page.locator('.dfav-tools, .dfav-grid').count()],
      [['false', 'true'], 0]);
    expectSame(F, 'recherches', await page.$$eval('.dfav-searches .saved-search', (cards) => cards.map((card) => [card.querySelector('h3')?.textContent ?? null,
      card.querySelector('.saved-search-text p')?.textContent.replace(/\s+/g, ' ') ?? null, card.querySelector('.alerts-on, .alerts-off')?.textContent.trim() ?? null,
      Math.round(card.getBoundingClientRect().width)])),
    [[ACCOUNT.saved_searches[0].name, 'Résidentiel · Lyon et alentours · Jusqu\'à 300 000 €', 'Alertes actives', width === 1440 ? 588 : 470],
      [ACCOUNT.saved_searches[1].name, 'Investir · Jusqu\'à 250 000 €', 'Alertes désactivées', width === 1440 ? 588 : 470]]);
    await favShot(page, `favoris-recherches-${width}.png`);
    await page.close();

    if (width === 1440) {
      const B = F;
      // Recherche dans les favoris (avec ses suggestions), catégories, tris et filtres : les cartes, leur ordre et le nombre.
      page = await open(favDesk, '/favoris/', `${B} recherche`);
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : recherche`);
      await page.fill('.dfav-field input', 'villeur');
      await waitForFavorites(page, [FAV_T2], '1 sur 4 biens', `${B} : « villeur »`);
      expectSame(B, 'suggestions de « villeur »', await page.$$eval('.dfav-suggestions button', (els) => els.map((el) => [...el.querySelectorAll('.dfav-suggestion-text > span')]
        .map((span) => span.textContent))), [['Villeurbanne', '69100 · Ville']]);
      await page.click('.dfav-suggestions button');
      expectSame(B, 'suggestion choisie', [await page.inputValue('.dfav-field input'), await page.locator('.dfav-suggestions').count()], ['Villeurbanne', 0]);
      await waitForFavorites(page, [FAV_T2], '1 sur 4 biens', `${B} : « Villeurbanne »`);
      await page.click('.dfav-clear');
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : recherche effacée`);
      for (const text of ['hôtel', 'HOTEL', '69007']) {
        await page.fill('.dfav-field input', text);
        await waitForFavorites(page, [text === '69007' ? FAV_STUDIO : FAV_HOTEL], '1 sur 4 biens', `${B} : « ${text} »`);
      }
      await page.fill('.dfav-field input', 'zzz');
      await page.waitForSelector('.dfav .account-empty');
      expectSame(B, 'aucun favori ne correspond', [await textOf(page, '.dfav .account-empty h2'), await textOf(page, '.dfav .account-empty p'), await textOf(page, '.dfav .account-empty button'),
        await textOf(page, '.dfav-total'), await page.locator('.dfav-missing').count()], ['Aucun favori ne correspond', 'Modifiez la recherche, la catégorie ou les filtres.', 'Tout afficher', '0 sur 4 biens', 0]);
      await page.click('.dfav .account-empty button');
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : « Tout afficher »`);
      if (await page.inputValue('.dfav-field input')) problems.push(`${B} : « Tout afficher » garde la recherche`);
      for (const [chip, titles] of [['Résidentiel', [FAV_FLAT]], ['Location', [FAV_STUDIO]], ['Investir', [FAV_T2]], ['Hôtels', [FAV_HOTEL]], ['Tous', FAV_ALL]]) {
        await page.locator('.dfav-chip', { hasText: chip }).click();
        await waitForFavorites(page, titles, titles.length === 4 ? '4 biens sauvegardés' : `${titles.length} sur 4 biens`, `${B} : catégorie ${chip}`);
        expectSame(B, `catégorie ${chip}`, await page.$$eval('.dfav-chip[aria-pressed="true"]', (els) => els.map((el) => el.textContent.trim())), [chip]);
      }
      for (const [sort, short, titles] of [['priceAscending', 'Prix ↑', [FAV_STUDIO, FAV_T2, FAV_FLAT, FAV_HOTEL]], ['priceDescending', 'Prix ↓', [FAV_HOTEL, FAV_FLAT, FAV_T2, FAV_STUDIO]],
        ['recentlyAdded', 'Récents', [FAV_STUDIO, FAV_HOTEL, FAV_T2, FAV_FLAT]], ['relevance', 'Pertinence', FAV_ALL]]) {
        await page.selectOption('.dfav-sort select', sort);
        await waitForFavorites(page, titles, '4 biens sauvegardés', `${B} : tri ${sort}`);
        expectSame(B, `tri ${sort}`, await page.textContent('.dfav-sort > span'), short);
      }
      // Recherche, catégorie et tri ensemble : les favoris qui correspondent, dans l'ordre du tri.
      await page.selectOption('.dfav-sort select', 'priceDescending');
      await page.fill('.dfav-field input', 'lyon');
      await waitForFavorites(page, [FAV_FLAT, FAV_STUDIO], '2 sur 4 biens', `${B} : « lyon », prix décroissant`);
      await page.locator('.dfav-chip', { hasText: 'Location' }).click();
      await waitForFavorites(page, [FAV_STUDIO], '1 sur 4 biens', `${B} : « lyon », Location`);
      await page.fill('.dfav-field input', '');
      await page.locator('.dfav-chip', { hasText: 'Tous' }).click();
      await page.selectOption('.dfav-sort select', 'relevance');
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : tout affiché`);
      // Filtres : ouverts sur la catégorie de la pastille (« Tous » : Résidentiel) ; appliqués aux favoris chargés.
      await page.click('.dfav-filters');
      await page.waitForSelector('dialog.filters-dialog[open]');
      expectSame(B, 'filtres : catégorie', await textOf(page, 'dialog[open] .mode-tab[aria-checked="true"]'), 'Résidentiel');
      await page.locator('dialog[open]').getByRole('group', { name: 'Pièces minimum et maximum' }).getByRole('button', { name: '3', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('dialog[open] .filters-apply .btn')?.textContent?.trim() === 'Afficher 1 bien', null, { timeout: 8000 })
        .catch(async () => problems.push(`${B} : filtres, bouton « ${await textOf(page, 'dialog[open] .filters-apply .btn')} » au lieu de « Afficher 1 bien »`));
      await page.click('dialog[open] .filters-apply .btn');
      await page.waitForSelector('dialog.filters-dialog', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${B} : les filtres restent ouverts`));
      await waitForFavorites(page, [FAV_FLAT], '1 sur 4 biens', `${B} : filtre « 3 pièces »`);
      expectSame(B, 'filtres appliqués', [await page.getAttribute('.dfav-filters', 'aria-label'), await textOf(page, '.dfav-filters-count'),
        await page.$$eval('.dfav-chip[aria-pressed="true"]', (els) => els.map((el) => el.textContent.trim()))], ['Filtres, 1 actifs', '1', ['Résidentiel']]);
      await page.locator('.dfav-chip', { hasText: 'Tous' }).click();
      // « Tous » garde les filtres posés (FavoritesView : filteredIDs) : seuls les favoris qui y correspondent restent.
      await waitForFavorites(page, [FAV_FLAT], '1 sur 4 biens', `${B} : filtre gardé sur « Tous »`);
      await page.close();

      // Comparer : le bouton de chaque carte (CompareButton) ajoute ou retire, 3 biens au plus, avec le toast de l'app ;
      // le bouton rond remplit une comparaison vide avec les 3 premiers favoris dans l'ordre du tri (fillIfEmpty), puis
      // ouvre Comparer. Rien n'est envoyé au serveur.
      page = await open(favDesk, '/favoris/', `${B} comparer`);
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : comparer`);
      const compareWrites = writes.length;
      const favCard = (title) => page.locator('.dfav-card', { has: page.locator('.dfav-title', { hasText: title }) });
      const comparedIds = () => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('nidalo.comparer') ?? 'null'); } catch { return 'illisible'; } });
      const roundButton = () => page.evaluate(() => [document.querySelector('.dfav-compare')?.getAttribute('aria-label') ?? null, document.querySelector('.dfav-compare-count')?.textContent ?? null]);
      const pressedCards = () => page.$$eval('.dfav-card', (cards) => cards.filter((card) => card.querySelector('.dfav-card-compare')?.getAttribute('aria-pressed') === 'true')
        .map((card) => card.querySelector('.dfav-title')?.textContent ?? null));
      await favCard(FAV_FLAT).locator('.dfav-card-compare').click();
      await waitForCompareNotice(page, { text: 'Ajouté à la comparaison', action: 'Voir' }, `${B} : ajout`);
      expectSame(B, 'après un ajout', [await comparedIds(), await roundButton(), await pressedCards(), await favCard(FAV_FLAT).locator('.dfav-card-compare').getAttribute('aria-label'),
        await page.getAttribute('.dfav-toast-box a', 'href'), page.url()],
      [{ ids: [favId(1)], referenceId: favId(1) }, ['Comparer, 1 bien', '1'], [FAV_FLAT], 'Retirer de la comparaison', '/comparer/', `${base}/favoris/`]);
      await favCard(FAV_FLAT).locator('.dfav-card-compare').click();
      await waitForCompareNotice(page, { text: 'Retiré de la comparaison', action: null }, `${B} : retrait`);
      expectSame(B, 'après un retrait', [await comparedIds(), await roundButton(), await pressedCards()], [{ ids: [], referenceId: null }, ['Comparer vos favoris', null], []]);
      // Tous les favoris comptent, pas seulement la catégorie affichée (FavoritesView : sorted(listings)).
      await page.selectOption('.dfav-sort select', 'priceAscending');
      await page.locator('.dfav-chip', { hasText: 'Hôtels' }).click();
      await waitForFavorites(page, [FAV_HOTEL], '1 sur 4 biens', `${B} : Hôtels, prix croissant`);
      await page.click('.dfav-compare');
      await page.waitForURL(`${base}/comparer/`).catch(() => problems.push(`${B} : le bouton rond n'ouvre pas /comparer/ (${page.url()})`));
      expectSame(B, 'bouton rond, comparaison vide', await comparedIds(), { ids: [favId(2), favId(3), favId(1)], referenceId: favId(2) });
      await page.goto(`${base}/favoris/`, { waitUntil: 'networkidle' });
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : retour aux favoris`);
      expectSame(B, 'trois biens comparés', [await roundButton(), await pressedCards()], [['Comparer, 3 biens', '3'], [FAV_T2, FAV_FLAT, FAV_STUDIO]]);
      // Un quatrième : refusé, « 3 biens maximum, retirez-en un » avec « Gérer » ; la comparaison ne change pas.
      await favCard(FAV_HOTEL).locator('.dfav-card-compare').click();
      await waitForCompareNotice(page, { text: '3 biens maximum, retirez-en un', action: 'Gérer' }, `${B} : quatrième bien`);
      expectSame(B, 'quatrième bien', [await comparedIds(), await pressedCards(), await page.getAttribute('.dfav-toast-box a', 'href')],
        [{ ids: [favId(2), favId(3), favId(1)], referenceId: favId(2) }, [FAV_T2, FAV_FLAT, FAV_STUDIO], '/comparer/']);
      // Retirer la référence la passe au premier qui reste ; l'hôtel a ensuite sa place.
      await favCard(FAV_STUDIO).locator('.dfav-card-compare').click();
      await waitForCompareNotice(page, { text: 'Retiré de la comparaison', action: null }, `${B} : retrait du studio`);
      await favCard(FAV_HOTEL).locator('.dfav-card-compare').click();
      await waitForCompareNotice(page, { text: 'Ajouté à la comparaison (3 biens)', action: 'Voir' }, `${B} : ajout de l'hôtel`);
      expectSame(B, 'comparaison changée', [await comparedIds(), await roundButton(), await pressedCards()],
        [{ ids: [favId(3), favId(1), favId(4)], referenceId: favId(3) }, ['Comparer, 3 biens', '3'], [FAV_T2, FAV_FLAT, FAV_HOTEL]]);
      // Comparaison commencée : le bouton rond l'ouvre telle quelle.
      await page.click('.dfav-compare');
      await page.waitForURL(`${base}/comparer/`).catch(() => problems.push(`${B} : le bouton rond n'ouvre pas /comparer/ (${page.url()})`));
      expectSame(B, 'bouton rond, comparaison commencée', await comparedIds(), { ids: [favId(3), favId(1), favId(4)], referenceId: favId(3) });
      if (writes.length !== compareWrites) problems.push(`${B} : la comparaison a écrit au serveur ${JSON.stringify(writes.slice(compareWrites))}`);
      await page.close();

      // Cœur et « Retirer » : FavoritesStore.toggle → DELETE favorites?listing_id=eq.<id> ; la carte quitte la grille.
      page = await open(favDesk, '/favoris/', `${B} cœur`);
      await waitForFavorites(page, FAV_ALL, '4 biens sauvegardés', `${B} : cœur`);
      let mark = writes.length;
      await favCard(FAV_FLAT).locator('.dfav-heart').click();
      await waitForFavorites(page, [FAV_T2, FAV_STUDIO, FAV_HOTEL], '3 biens sauvegardés', `${B} : après le cœur`);
      await expectWrites(mark, [['DELETE', 'favorites', { listing_id: `eq.${favId(1)}` }, null]], `${B} : cœur`);
      if (page.url() !== `${base}/favoris/`) problems.push(`${B} : le cœur a ouvert ${page.url()}`);
      mark = writes.length;
      await page.click('.dfav-missing-remove');
      await page.waitForSelector('.dfav-missing', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${B} : « Retirer » laisse l'annonce plus disponible`));
      await expectWrites(mark, [['DELETE', 'favorites', { listing_id: `eq.${GONE_ID}` }, null]], `${B} : « Retirer »`);
      expectSame(B, 'après les retraits', [await favoriteTitles(page), await textOf(page, '.dfav-total')], [[FAV_T2, FAV_STUDIO, FAV_HOTEL], '3 biens sauvegardés']);
      await page.close();

      // Onglet Recherches : les actions de SavedSearchesView, envoyées comme l'app (AccountStore.save, deleteSearch,
      // markSearchViewed) : nom, critères et alertes ensemble, mise à jour par l'id.
      page = await open(favDesk, '/favoris/?onglet=recherches', `${B} recherches`);
      await page.waitForSelector('.dfav-searches .saved-search');
      await waitForSearchCounts(page, `${B} : recherches`);
      const [lyon, invest] = ACCOUNT.saved_searches;
      const searchCard = (n) => page.locator('.dfav-searches .saved-search').nth(n);
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
      expectSame(B, 'renommer', [await dialogTitle(page), await page.inputValue('dialog[open] .text-input')], ['Renommer la recherche', lyon.name]);
      await page.fill('dialog[open] .text-input', 'Lyon centre');
      await page.locator('dialog[open]').getByRole('button', { name: 'Renommer', exact: true }).click();
      await expectWrites(mark, saved({ name: 'Lyon centre', query: lyon.query, alerts_enabled: true }), `${B} : renommer`);
      await page.waitForFunction(() => document.querySelector('.dfav-searches .saved-search h3')?.textContent === 'Lyon centre', null, { timeout: 8000 })
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
      await page.waitForFunction(() => document.querySelectorAll('.dfav-searches .saved-search').length === 1, null, { timeout: 8000 })
        .catch(() => problems.push(`${B} : la recherche supprimée reste affichée`));
      expectSame(B, 'après la suppression', [await textOf(page, '.dfav-tab-count'), await textOf(page, '.dfav-searches .saved-search h3')], ['(1)', 'Lyon centre']);
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
    // Aucun favori : le texte de l'app et « Rechercher un bien » ; rien à comparer.
    const { context } = await favContext(1440, 900, FAV_LISTINGS, { favorites: [] });
    page = await open(context, '/favoris/', 'favoris vide');
    await page.waitForSelector('.dfav .account-empty');
    expectSame('favoris vide', 'texte', [await textOf(page, '.dfav .account-empty h2'), await textOf(page, '.dfav .account-empty p'), await textOf(page, '.dfav .account-empty a'),
      await page.getAttribute('.dfav .account-empty a', 'href'), await page.isDisabled('.dfav-compare'), await page.locator('.dfav-toolbar').count()],
    ['Aucun favori pour l\'instant', 'Touchez le cœur d\'une annonce pour la retrouver ici et la comparer.', 'Rechercher un bien', '/recherche/', true, 0]);
    await page.close();
    await context.close();
  }
  {
    // Sans compte : l'invitation à se connecter, sans rien demander des favoris ni des recherches.
    const { context, server: guestServer } = await favContext(1440, 900, FAV_LISTINGS, FAV_ACCOUNT, false);
    page = await open(context, '/favoris/', 'favoris sans compte');
    await page.waitForSelector('.signin-card');
    await checkChrome(page, 'favoris sans compte', { signedIn: false, margin: 48 });
    expectSame('favoris sans compte', 'page', [await page.locator('.dfav').count(), guestServer.requests.filter((request) => ['favorites', 'saved_searches'].includes(request.table)).length], [0, 0]);
    await page.close();
    await context.close();
  }
  {
    // À 1023 px : la page du téléphone, inchangée.
    const context = await browser.newContext({ viewport: { width: 1023, height: 768 }, locale: 'fr-FR' });
    await mock(context, { signedIn: true, listingRows: FAV_LISTINGS, account: FAV_ACCOUNT });
    page = await open(context, '/favoris/', 'favoris 1023');
    await page.waitForSelector('.favorite-card');
    expectSame('favoris 1023', 'page du téléphone', [await page.locator('.favorite-card').count(), await page.locator('.dfav, .dtop, .dfoot').count()], [4, 0]);
    await page.close();
    await context.close();
  }

  // Mon espace sur ordinateur (maquette 5), à 1440 × 900 et 1024 × 768, avec le compte de test : la page au plus près
  // de la maquette, puis le contenu et les actions de l'app (ProfileView.swift, MySpaceComponents.swift) ; Mon agenda,
  // Ajouter une visite, Mon projet et Biens consultés dans la colonne de 640 px, avec ce qu'ils envoient au serveur
  // simulé, comparé à ce que l'app envoie. Horloge figée au vendredi 6 novembre 2026, 10 h 50 à Paris ; champs de date
  // et d'heure en français. Captures pour Romain : 5-mon-espace-*.png.
  const spaceBrowser = await chromium.launch({ env: { ...process.env, LANG: 'fr_FR.UTF-8', LANGUAGE: 'fr_FR:fr', LC_ALL: 'fr_FR.UTF-8' } });
  try {
    const spaceContext = async (width, height, space, viewed = SPACE_VIEWED) => {
      const context = await spaceBrowser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
      await context.clock.setFixedTime(CHAT_NOW);
      const server = await mock(context, { signedIn: true, listingRows: SPACE_LISTING_ROWS });
      await mockSpace(context, space);
      // Biens consultés de l'onglet, posés une seule fois : « Retirer » et « Vider » tiennent après un rechargement.
      await context.addInitScript((ids) => {
        try {
          if (sessionStorage.getItem('nidalo.consultes') === null) sessionStorage.setItem('nidalo.consultes', JSON.stringify(ids));
        } catch { /* stockage indisponible */ }
      }, viewed);
      return { context, server };
    };

    // La page au plus près de la maquette : projet Investissement à 57 %, agenda libre, 2 recherches, 4 biens consultés,
    // aucune annonce. Mesures de la maquette à 1440 px (contenu de 1200, colonne de 280, projet 544, agenda 320).
    for (const [width, height] of [[1440, 900], [1024, 768]]) {
      const E = `Mon espace ${width}`;
      const space = spaceState({ project: structuredClone(SPACE_PROJECTS.invest), visits: [], requests: [], myListings: [] });
      const { context } = await spaceContext(width, height, space);
      page = await open(context, '/compte/', E);
      await page.waitForFunction(() => document.querySelector('.dsp-project-subtitle')?.textContent === 'Investissement'
        && /2\s+recherches actives/.test(document.querySelector('.dsp-tiles')?.innerText ?? '') && /0\s+en ligne/.test(document.querySelector('.dsp-tiles')?.innerText ?? '')
        && document.querySelector('.dsp-agenda-title')?.textContent === 'Votre agenda est libre', null, { timeout: 8000 })
        .catch(() => problems.push(`${E} : page incomplète`));
      expectSame(E, 'projet', await spaceProjectCard(page), SPACE_PROJECT_CARDS.invest);
      expectSame(E, 'agenda libre', [await textOf(page, '.dsp-agenda-title'), await textOf(page, '.dsp-agenda-text > p:last-child')],
        ['Votre agenda est libre', 'Aucune visite prévue pour l\'instant.']);
      expectSame(E, 'activités', await page.$$eval('.dsp-tile', (tiles) => tiles.map((tile) => [tile.querySelector('.dsp-tile-title')?.textContent ?? null,
        tile.querySelector('.dsp-tile-number')?.textContent ?? null, tile.querySelector('.dsp-tile-rest')?.textContent ?? null])),
      [['Mes recherches', '2', 'recherches actives'], ['Biens consultés', '4', 'annonces'], ['Mes annonces', '0', 'en ligne']]);
      const spaceLayout = await page.evaluate(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect();
        return {
          content: Math.round(box('.dsp').width), aside: Math.round(box('.dsp-aside').width), gap: Math.round(box('.dsp-main').left - box('.dsp-aside').right),
          sticky: getComputedStyle(document.querySelector('.dsp-aside')).position, project: Math.round(box('.dsp-project').width), agenda: Math.round(box('.dsp-agenda').width),
          tiles: [...document.querySelectorAll('.dsp-tile')].map((tile) => Math.round(tile.getBoundingClientRect().width)), dossier: Math.round(box('.dsp-dossier').width),
          overflowX: document.documentElement.scrollWidth - innerWidth, footer: Boolean(document.querySelector('.dfoot')),
          current: document.querySelector('.dtop-space')?.getAttribute('aria-current') ?? null,
        };
      });
      expectSame(E, 'mise en page', spaceLayout, width === 1440
        ? { content: 1200, aside: 280, gap: 32, sticky: 'sticky', project: 544, agenda: 320, tiles: [280, 280, 280], dossier: 384, overflowX: 0, footer: true, current: 'page' }
        : { content: 960, aside: 280, gap: 32, sticky: 'sticky', project: 648, agenda: 648, tiles: [200, 200, 200], dossier: 648, overflowX: 0, footer: true, current: 'page' });
      // Tailles mesurées sur la maquette (titre 36/700, sections 24/700, cartes 20/700, nom 17/700, menu 15, lignes 15,5/600)
      // et police Inter partout, boutons compris.
      const spaceFonts = await page.evaluate(() => {
        const font = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const style = getComputedStyle(element);
          return `${style.fontSize} ${style.fontWeight}${style.fontFamily.startsWith('"Nidalo Inter"') ? '' : ` ${style.fontFamily}`}`;
        };
        return {
          titre: font('.dsp-title'), nom: font('.dsp-profile-name'), section: font('.dsp-section-title'), carte: font('.dsp-card-title'), menu: font('.dsp-nav a:not(.is-current)'),
          'menu actif': font('.dsp-nav a.is-current'), bouton: font('.dsp-project-button'), 'Se déconnecter': font('.dsp-logout'), nombre: font('.dsp-tile-number'),
          ligne: font('.dsp-row-title'),
        };
      });
      expectSame(E, 'polices', spaceFonts, {
        titre: '36px 700', nom: '17px 700', section: '24px 700', carte: '20px 700', menu: '15px 500', 'menu actif': '15px 600', bouton: '15px 600',
        'Se déconnecter': '15px 600', nombre: '34px 700', ligne: '15.5px 600',
      });
      await favShot(page, `5-mon-espace-${width}.png`);
      await page.close();
      await context.close();
    }

    // Contenu et actions de l'app, à 1440 px : projet Résidentiel, agenda de quatre visites et d'une demande, conversation
    // avec l'agence, une annonce en ligne et un brouillon.
    {
      const E = 'Mon espace';
      const space = spaceState({ conversations: SPACE_CONVERSATIONS });
      const { context } = await spaceContext(1440, 900, space);
      page = await open(context, '/compte/', E);
      await page.waitForFunction(() => document.querySelector('.dsp-agenda-title')?.textContent?.startsWith('3 visites')
        && /1\s+en ligne · 1 brouillon/.test(document.querySelector('.dsp-tiles')?.innerText ?? '')
        && document.querySelector('.dsp-project-subtitle')?.textContent === 'Résidence principale · Lyon', null, { timeout: 8000 })
        .catch(() => problems.push(`${E} : page incomplète`));
      expectSame(E, 'profil', [await textOf(page, '.dsp-profile-name'), await textOf(page, '.dsp-profile-email'), await page.getAttribute('.dsp-profile', 'href'),
        await textOf(page, '.dsp-badge'), await textOf(page, '.dsp-profile .avatar')], ['Claire Martin', USER_EMAIL, '/compte/?vue=informations', 'Particulier', 'CM']);
      // Sections dans l'ordre de l'app, la première mise en avant.
      expectSame(E, 'menu des sections', await page.$$eval('.dsp-nav a', (links) => links.map((link) => [link.textContent.trim(), link.getAttribute('href'), link.getAttribute('aria-current')])),
        [['Mon espace', '#mon-espace', 'location'], ['Mon agenda', '#mon-agenda', null], ['Mes activités', '#mes-activites', null],
          ['Contrats et location', '#contrats-et-location', null], ['Compte et sécurité', '#compte-et-securite', null], ['Paramètres et assistance', '#parametres-et-assistance', null]]);
      expectSame(E, 'titres', [await textOf(page, '.dsp-title'), await page.$$eval('.dsp-section-title', (titles) => titles.map((title) => title.textContent))],
        ['Mon espace', ['Mes activités', 'Contrats et location', 'Compte et sécurité', 'Paramètres et assistance']]);
      expectSame(E, 'projet', await spaceProjectCard(page), SPACE_PROJECT_CARDS.buy);
      expectSame(E, 'bouton du projet', [await textOf(page, '.dsp-project-button'), await page.getAttribute('.dsp-project-button', 'href')], ['Voir mon avancement', '/compte/?vue=projet']);
      // Mon agenda : trois visites à venir (la demande comprise), la prochaine aujourd'hui à 14h30 ; ses deux boutons.
      expectSame(E, 'agenda', [await textOf(page, '.dsp-agenda-title'), await page.$$eval('.dsp-agenda-text > p:not(.dsp-agenda-title)', (lines) => lines.map((line) => line.textContent)),
        await page.$$eval('.dsp-agenda-actions a', (links) => links.map((link) => [link.textContent.trim(), link.getAttribute('href')]))],
      ['3 visites à venir', ['Prochaine : Ven. 6 nov. · 14h30', 'Appartement lumineux avec balcon · Lyon 3e'],
        [['Voir mon agenda', '/compte/?vue=agenda'], ['Ajouter une visite', '/compte/?vue=ajouter-visite']]]);
      expectSame(E, 'activités', await page.$$eval('.dsp-tile', (tiles) => tiles.map((tile) => [tile.querySelector('.dsp-tile-title')?.textContent ?? null,
        tile.querySelector('.dsp-tile-number')?.textContent ?? null, tile.querySelector('.dsp-tile-rest')?.textContent ?? null, tile.getAttribute('href')])),
      [['Mes recherches', '2', 'recherches actives', '/compte/?vue=recherches'], ['Biens consultés', '4', 'annonces', '/compte/?vue=consultes'],
        ['Mes annonces', '1', 'en ligne · 1 brouillon', '/compte/?vue=annonces']]);
      // Contrats et location : les documents restent dans l'app iPhone.
      expectSame(E, 'dossier', [await textOf(page, '.dsp-dossier h3'), await textOf(page, '.dsp-dossier p'), await textOf(page, '.dsp-dossier-button')],
        ['Mon dossier immobilier', 'Dans l’app iPhone pour l’instant', 'Compléter mon dossier']);
      const IPHONE = 'Dans l’app iPhone pour l’instant';
      expectSame(E, 'contrats et location', await spaceRows(page, '#contrats-et-location'),
        [['Mon bail de location', IPHONE, null], ['Quittances de loyer', IPHONE, null], ['États des lieux', IPHONE, null], ['Offres et compromis', IPHONE, null],
          ['Documents à signer', IPHONE, null]]);
      expectSame(E, 'compte et sécurité', await spaceRows(page, '#compte-et-securite'),
        [['Connexion et sécurité', 'Mot de passe, Face ID, appareils', '/compte/?vue=securite'], ['Confidentialité et données', 'Consentements, export de mes données', '/compte/?vue=confidentialite'],
          ['Type de compte', 'Particulier · passer en professionnel', null]]);
      expectSame(E, 'paramètres et assistance', await spaceRows(page, '#parametres-et-assistance'),
        [['Notifications', 'Alertes, visites et messages', '/compte/?vue=notifications'], ['Alertes sur cet iPhone', IPHONE, null], ['Préférences', IPHONE, null],
          ['Aide et assistance', 'Questions fréquentes, nous contacter', '/aide/'], ['Donner mon avis', 'Notez l\'application', null],
          ['Informations légales', 'CGU, confidentialité, mentions légales', '/compte/?vue=legal']]);
      expectSame(E, 'bas de la colonne', [await textOf(page, '.dsp-logout'), await textOf(page, '.dsp-delete'), await page.getAttribute('.dsp-delete', 'href')],
        ['Se déconnecter', 'Supprimer mon compte', '/compte/?vue=supprimer']);
      // Ce que l'app garde sur l'iPhone : « Dans l'app iPhone pour l'instant », sans rien envoyer.
      let mark = writes.length;
      const spaceMark = space.calls.length;
      await page.click('.dsp-dossier-button');
      await iphoneOnly(page, E, 'Mon dossier immobilier');
      for (const title of ['Mon bail de location', 'Quittances de loyer', 'États des lieux', 'Offres et compromis', 'Documents à signer', 'Alertes sur cet iPhone', 'Préférences']) {
        await page.locator('.dsp-row', { hasText: title }).click();
        await iphoneOnly(page, E, title);
      }
      // Type de compte : la confirmation de l'app ; « Annuler » ne change rien.
      await page.locator('.dsp-row', { hasText: 'Type de compte' }).click();
      expectSame(E, 'type de compte', [await dialogTitle(page), await textOf(page, 'dialog.alert-dialog[open] .alert-body p'),
        await page.$$eval('dialog.alert-dialog[open] .alert-actions button', (buttons) => buttons.map((button) => button.textContent))],
      ['Passer en professionnel ?', 'Vous pourrez revenir en arrière à tout moment depuis Type de compte.', ['Passer en professionnel', 'Annuler']]);
      await alertButton(page, 'Annuler');
      await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${E} : la fenêtre du type de compte reste ouverte`));
      if (writes.length !== mark || space.calls.slice(spaceMark).some((call) => call.method !== 'GET' && !call.table.startsWith('rpc/'))) {
        problems.push(`${E} : écriture envoyée par une action de l'app iPhone (${JSON.stringify(writes.slice(mark))})`);
      }
      // Menu des sections : la section choisie est mise en avant.
      await page.click('.dsp-nav a[href="#compte-et-securite"]');
      await page.waitForFunction(() => document.querySelector('.dsp-nav a[aria-current="location"]')?.textContent.trim() === 'Compte et sécurité', null, { timeout: 8000 })
        .catch(async () => problems.push(`${E} : après « Compte et sécurité », section mise en avant « ${await textOf(page, '.dsp-nav a[aria-current="location"]')} »`));
      await page.evaluate(() => window.scrollTo(0, 0));

      // Projet de chaque sorte : sous-titre, anneau (part des critères renseignés) et étapes de l'app ; sans projet, celui par défaut.
      for (const kind of ['invest', 'rent', 'hotel', 'none', 'buy']) {
        space.project = kind === 'none' ? null : structuredClone(SPACE_PROJECTS[kind]);
        await page.reload({ waitUntil: 'networkidle' });
        const [subtitle] = SPACE_PROJECT_CARDS[kind];
        await page.waitForFunction((wanted) => document.querySelector('.dsp-project-subtitle')?.textContent === wanted, subtitle, { timeout: 8000 }).catch(() => undefined);
        await page.waitForTimeout(200);
        expectSame(E, `projet ${kind}`, await spaceProjectCard(page), SPACE_PROJECT_CARDS[kind]);
      }

      // « Voir mon agenda » ouvre Mon agenda.
      await page.click('.dsp-agenda-actions a[href="/compte/?vue=agenda"]');
      await page.waitForURL(`${base}/compte/?vue=agenda`, { timeout: 8000 }).catch(() => problems.push(`${E} : « Voir mon agenda » ouvre ${page.url()}`));
      await page.waitForSelector('.dsc-agenda-screen .dsc-visit', { timeout: 8000 }).catch(() => problems.push(`${E} : Mon agenda ne s'affiche pas`));

      // Mon agenda : onglets dans l'ordre de l'app avec leur nombre, cartes groupées par date, Itinéraire vers Plans.
      const A = 'Mon agenda';
      expectSame(A, 'en-tête', [await textOf(page, '.dsc-head h1'), await textOf(page, '.dsc-head p'), await page.getAttribute('.dsc-back', 'href'),
        await page.getAttribute('.dsc-square', 'href'), await page.getAttribute('.dsc-square', 'aria-label'), await textOf(page, '.dsc-add-visit'),
        await page.getAttribute('.dsc-add-visit', 'href')],
      ['Agenda des visites', 'Toutes vos visites à venir et passées.', '/compte/', '/compte/?vue=ajouter-visite&depuis=agenda', 'Programmer une visite',
        'Ajouter une visite manuellement', '/compte/?vue=ajouter-visite&depuis=agenda']);
      const agendaTabs = () => page.$$eval('.dsc-tab', (tabs) => tabs.map((tab) => [tab.childNodes[0]?.textContent ?? null, tab.querySelector('.dsc-tab-count')?.textContent ?? null,
        tab.getAttribute('aria-selected')]));
      expectSame(A, 'onglets', await agendaTabs(), [['À venir', '3', 'true'], ['Passées', '1', 'false'], ['Annulées', '1', 'false']]);
      const plans = (address) => `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`;
      const card = (fields) => ({ route: null, request: null, contact: true, menu: true, ...fields });
      expectSame(A, 'À venir', await agendaCards(page), [
        ['Aujourd\'hui', [card({ date: 'Ven. 6 nov. · 14h30', status: 'Confirmée', title: 'Appartement lumineux avec balcon', lines: ['Lyon 3e (69003)', 'Avec Agence du Parc'],
          route: plans('Lyon 3e (69003)') })]],
        ['Cette semaine', [
          card({ date: 'Lun. 9 nov. · 9h00', status: 'En attente', title: 'Studio meublé', lines: ['12 Rue de test, 69007 Lyon 7e', 'Avec Julien Moreau'],
            route: plans('12 Rue de test, 69007 Lyon 7e') }),
          // Demande envoyée, pas encore acceptée : son écran « Demande de visite » réunit ses actions (pas de menu « … »).
          card({ date: 'Mar. 10 nov. · 10h00', status: 'En attente', title: 'T2 vendu loué près du métro', lines: ['Villeurbanne', 'Avec Marc Petit', '3 créneaux proposés'],
            route: plans('Villeurbanne'), request: `/compte/?vue=demande-visite&id=${SPACE_REQUEST_ID}`, menu: false }),
        ]],
      ]);
      expectSame(A, 'lien Itinéraire', await page.$eval('.dsc-visit a.dsc-visit-action', (link) => [link.textContent, link.getAttribute('target'), link.getAttribute('rel')]),
        ['Itinéraire', '_blank', 'noopener noreferrer']);
      // Menu « … » d'une visite à venir : les actions de l'app, toutes dans l'app iPhone.
      const visitMenu = async (index) => {
        await page.locator('.dsc-visit').nth(index).locator('.dsc-menu-button').click();
        await page.waitForSelector('.dsc-menu-list');
        return textsOf(page, '.dsc-menu-list [role="menuitem"]');
      };
      expectSame(A, 'menu d\'une visite à venir', await visitMenu(0),
        ['Modifier la visite', 'Reprogrammer', 'Ajouter une note', 'Ajouter à mon calendrier', 'Annuler la visite', 'Supprimer']);
      await page.locator('.dsc-menu-list').getByRole('menuitem', { name: 'Ajouter à mon calendrier', exact: true }).click();
      await iphoneOnly(page, A, 'Ajouter à mon calendrier');
      // Contacter : la conversation liée à la visite.
      await page.route(new RegExp(`^${base}/messages/`), (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Messages</title>' }));
      await page.locator('.dsc-visit').nth(0).getByRole('button', { name: 'Contacter' }).click();
      await page.waitForURL(`${base}/messages/?c=E0000000-0000-4000-8000-000000000001`, { timeout: 8000 })
        .catch(() => problems.push(`${A} : « Contacter » ouvre ${page.url()} au lieu de la conversation liée`));
      await page.goBack({ waitUntil: 'networkidle' });
      await page.waitForSelector('.dsc-visit');
      await favShot(page, '5-mon-espace-agenda-1440.png');
      await page.click('.dsc-tab >> nth=1');
      expectSame(A, 'Passées', await agendaCards(page), [
        ['Ces 7 derniers jours', [card({ date: 'Lun. 2 nov. · 15h00', status: 'Terminée', title: 'T2 vendu loué près du métro',
          lines: ['Villeurbanne (69100)', 'Avec Camille Roux', 'Intéressant · À revoir'], route: plans('Villeurbanne (69100)') })]],
      ]);
      expectSame(A, 'menu d\'une visite terminée', await visitMenu(0), ['Ajouter une note', 'Ajouter à mon calendrier', 'Supprimer']);
      await page.keyboard.press('Escape');
      await page.click('.dsc-tab >> nth=2');
      expectSame(A, 'Annulées', await agendaCards(page), [
        ['Ces 7 derniers jours', [card({ date: 'Mer. 4 nov. · 17h00', status: 'Annulée', title: 'T2 vendu loué près du métro', lines: ['Adresse non renseignée', 'Avec Camille Roux'] })]],
      ]);
      expectSame(A, 'onglet choisi', await agendaTabs(), [['À venir', '3', 'false'], ['Passées', '1', 'false'], ['Annulées', '1', 'true']]);
      expectSame(A, 'menu d\'une visite annulée', await visitMenu(0), ['Reprogrammer', 'Ajouter une note', 'Ajouter à mon calendrier', 'Supprimer']);
      await page.keyboard.press('Escape');
      // Sans adresse : l'avis de l'app au lieu de l'itinéraire.
      await page.locator('.dsc-visit').nth(0).getByRole('button', { name: 'Itinéraire' }).click();
      expectSame(A, 'itinéraire sans adresse', await noticeText(page, A), 'Adresse non renseignée : l\'itinéraire sera disponible quand le vendeur l\'aura communiquée.');
      const agendaReads = space.calls.filter((call) => call.path === '/compte/' && ['agenda_visits', 'rpc/my_visit_requests'].includes(call.table));
      expectSame(A, 'lectures de l\'agenda', [...new Set(agendaReads.map((call) => `${call.method} ${call.table} ${call.search}`))].sort(),
        ['GET agenda_visits ?select=id,start_at,status,request_id,listing_id,visit', 'POST rpc/my_visit_requests ']);

      // Ajouter une visite (depuis l'agenda) : le bien d'une conversation, la date, la durée, le contact, deux participants,
      // les rappels et « Confirmée » ; « Enregistrer » insère dans agenda_visits la ligne que l'app insère.
      const V = 'Ajouter une visite';
      await page.click('.dsc-tab >> nth=0');
      await page.click('.dsc-add-visit');
      await page.waitForURL(`${base}/compte/?vue=ajouter-visite&depuis=agenda`, { timeout: 8000 }).catch(() => problems.push(`${V} : ouvert à ${page.url()}`));
      await page.waitForSelector('.dsc-form-screen .dsc-choose');
      const dateField = page.getByLabel('Date', { exact: true });
      const timeField = page.getByLabel('Heure de début', { exact: true });
      expectSame(V, 'formulaire vide', [await textOf(page, '.dsc-head h1'), await page.isDisabled('.dsc-head-action .dsc-button-primary'), await dateField.inputValue(),
        await timeField.inputValue(), await page.$$eval('.dsc-grid-3 .choice-chip', (chips) => chips.map((chip) => [chip.textContent, chip.getAttribute('aria-pressed')])),
        await textOf(page, '.dsc-end'), await page.$$eval('.dsc-form-screen .dsc-card-title', (titles) => titles.map((title) => title.textContent))],
      ['Nouvelle visite', true, '2026-11-07', '10:00', [['15 min', 'false'], ['30 min', 'false'], ['45 min', 'true'], ['1 h', 'false'], ['90 min', 'false'], ['2 h', 'false']],
        'Fin : 10:45', ['Bien concerné', 'Date et heure', 'Rendez-vous', 'Rappels et suivi']]);
      expectSame(V, 'rappels par défaut', await page.$$eval('.dsc-toggle', (toggles) => toggles.map((toggle) => [toggle.querySelector('.dsc-toggle-title')?.textContent ?? null,
        toggle.querySelector('input')?.checked ?? null, toggle.querySelector('.dsc-toggle-note')?.textContent ?? null])),
      [['La veille, à 18 h', true, null], ['2 heures avant', true, null], ['Rappel personnalisé', false, null], ['Confirmée par le contact', false, null],
        ['Ajouter à mon calendrier', null, IPHONE]]);
      await page.click('.dsc-prepare');
      await iphoneOnly(page, V, 'Préparer ma visite');
      // Bien concerné : Mes annonces, Mes favoris, Biens de mes conversations ; le bien de la conversation avec l'agence.
      await page.click('.dsc-choose');
      await page.waitForSelector('dialog.dsc-picker[open] .dsc-picker-section', { timeout: 8000 });
      expectSame(V, 'feuille Bien concerné', [await textOf(page, 'dialog.dsc-picker[open] h2'), await page.getAttribute('dialog.dsc-picker[open] input[type="search"]', 'placeholder'),
        await textOf(page, 'dialog.dsc-picker[open] .dsc-picker-manual'), await page.$$eval('dialog.dsc-picker[open] .dsc-picker-section h3', (titles) => titles.map((title) => title.textContent)),
        await textsOf(page, 'dialog.dsc-picker[open] .dsc-picker-section[aria-label="Biens de mes conversations"] .dsc-picker-row')],
      ['Bien concerné', 'Rechercher un bien, une ville…', 'Ajouter une adresse manuellement Pour un bien qui n\'est pas dans NIDALO', ['Mes annonces', 'Mes favoris', 'Biens de mes conversations'],
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
      await page.getByRole('button', { name: 'Contact NIDALO' }).click();
      expectSame(V, 'contacts NIDALO', await textsOf(page, '.dsc-menu-list [role="menuitem"]'), ['Agence du Parc']);
      await page.locator('.dsc-menu-list').getByRole('menuitem', { name: 'Agence du Parc' }).click();
      expectSame(V, 'participants', await page.$$eval('.dsc-participant', (rows) => rows.map((row) => row.querySelector('.dsc-participant-text')?.textContent ?? null)),
        ['Camille Roux06 39 98 11 22', 'Agence du Parc']);
      await page.getByRole('switch', { name: '2 heures avant' }).uncheck();
      await page.getByRole('switch', { name: 'Rappel personnalisé' }).check();
      await page.selectOption('.dsc-select select', '60');
      await page.getByRole('switch', { name: 'Confirmée par le contact' }).check();
      await page.waitForTimeout(200);
      await favShot(page, '5-mon-espace-ajouter-visite-1440.png');
      mark = space.calls.length;
      await page.click('.dsc-head-action .dsc-button-primary');
      const inserted = await oneSpaceCall(space, 'agenda_visits', 'POST', mark, V);
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
      await page.waitForFunction(() => document.querySelector('.dsc-tab .dsc-tab-count')?.textContent === '4', null, { timeout: 8000 })
        .catch(() => problems.push(`${V} : la visite enregistrée n'apparaît pas dans Mon agenda`));
      const added = (await agendaCards(page)).flatMap(([, cards]) => cards).find((item) => item.date === 'Mar. 10 nov. · 14h30');
      expectSame(V, 'visite dans l\'agenda', added, card({ date: 'Mar. 10 nov. · 14h30', status: 'Confirmée', title: 'Appartement lumineux avec balcon',
        lines: ['Lyon 3e (69003)', 'Avec Agence du Parc'], route: plans('Lyon 3e (69003)') }));

      // Mon projet : la sorte, le résumé et l'anneau ; une étape cochée et le partage, puis « Enregistrer mon projet »
      // envoie l'upsert de l'app (ProjectServerRow, sur user_id).
      const P = 'Mon projet';
      space.project = structuredClone(SPACE_PROJECTS.buy);
      await page.goto(`${base}/compte/`, { waitUntil: 'networkidle' });
      await page.click('.dsp-project-button');
      await page.waitForURL(`${base}/compte/?vue=projet`, { timeout: 8000 }).catch(() => problems.push(`${P} : « Voir mon avancement » ouvre ${page.url()}`));
      await page.waitForSelector('.dsc-project-screen .dsc-kinds', { timeout: 8000 });
      expectSame(P, 'en-tête et sortes', [await textOf(page, '.dsc-head h1'), await textOf(page, '.dsc-head p'), await textOf(page, '.dsc-active'),
        await page.$$eval('.dsc-kind', (kinds) => kinds.map((kind) => [kind.querySelector('.dsc-kind-title')?.textContent ?? null, kind.querySelector('.dsc-kind-subtitle')?.textContent ?? null,
          kind.getAttribute('aria-pressed')]))],
      ['Mon projet immobilier', 'Définissez vos critères pour trouver les biens qui vous correspondent', 'Projet actif',
        [['Résidentiel', 'Acheter pour habiter', 'true'], ['Investissement', 'Générer des revenus immobiliers', 'false'], ['Location', 'Trouver mon futur logement', 'false'],
          ['Hôtel', 'Acquérir ou reprendre un hôtel', 'false']]]);
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
      await page.waitForFunction(() => document.querySelectorAll('.dsp-steps li.is-done').length === 3, null, { timeout: 8000 })
        .catch(() => problems.push(`${P} : l'étape cochée n'apparaît pas sur Mon espace`));
      expectSame(P, 'carte après l\'enregistrement', await spaceProjectCard(page),
        ['Résidence principale · Lyon', '43 %', [['Recherche', true], ['Visites', true], ['Sélection', true], ['Offre', false], ['Signature', false]]]);

      // Biens consultés : du plus récent au plus ancien, « Retirer » puis « Vider l'historique » (rien n'est envoyé au serveur).
      const C = 'Biens consultés';
      await page.click('.dsp-tile[href="/compte/?vue=consultes"]');
      await page.waitForSelector('.dsc-viewed', { timeout: 8000 });
      expectSame(C, 'liste', [await textOf(page, '.dsc-head h1'), await textOf(page, '.dsc-head-action button'), await viewedRows(page),
        await page.$$eval('.dsc-viewed-remove', (buttons) => buttons.map((button) => [button.textContent.trim(), button.getAttribute('aria-label')]))],
      ['Biens consultés', 'Vider', [
        ['Maison 4 pièces avec jardin', 'Caluire-et-Cuire · 95 m²', '420 000 €Vendu', `/annonce/?id=${SPACE_SOLD.id}`],
        ['Appartement lumineux avec balcon', 'Lyon 3e · 62 m²', '238 000 €', `/annonce/?id=${listings[0].id}`],
        ['Studio meublé', 'Lyon 7e · 24 m²', '640 €/mois', `/annonce/?id=${listings[2].id}`],
        ['T2 vendu loué près du métro', 'Villeurbanne · 45 m²', '185 000 €', `/annonce/?id=${listings[1].id}`],
      ], Array(4).fill(['Retirer', 'Retirer de l\'historique'])]);
      await imagesLoaded(page, '.dsc-viewed img', 3, C);
      await favShot(page, '5-mon-espace-consultes-1440.png');
      mark = writes.length;
      const viewedMark = space.calls.length;
      await page.locator('.dsc-viewed', { hasText: 'Studio meublé' }).getByRole('button', { name: 'Retirer de l\'historique' }).click();
      await page.waitForFunction(() => document.querySelectorAll('.dsc-viewed').length === 3, null, { timeout: 8000 }).catch(() => problems.push(`${C} : « Retirer » n'a rien retiré`));
      expectSame(C, 'après « Retirer »', [(await viewedRows(page)).map((row) => row[0]), JSON.parse(await viewedStorage(page) ?? 'null')],
        [['Maison 4 pièces avec jardin', 'Appartement lumineux avec balcon', 'T2 vendu loué près du métro'], [SPACE_SOLD.id, listings[0].id, listings[1].id]]);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.dsc-viewed');
      expectSame(C, 'après un rechargement', (await viewedRows(page)).map((row) => row[0]), ['Maison 4 pièces avec jardin', 'Appartement lumineux avec balcon', 'T2 vendu loué près du métro']);
      await page.click('.dsc-head-action button');
      expectSame(C, 'confirmation', [await dialogTitle(page), await textOf(page, 'dialog.alert-dialog[open] .alert-body p'),
        await page.$$eval('dialog.alert-dialog[open] .alert-actions button', (buttons) => buttons.map((button) => button.textContent))],
      ['Vider l\'historique ?', 'Les 3 biens consultés seront retirés de cette liste.', ['Vider l\'historique', 'Annuler']]);
      await alertButton(page, 'Vider l\'historique');
      await page.waitForSelector('.dsc-viewed-screen .dsc-empty', { timeout: 8000 }).catch(() => problems.push(`${C} : la liste n'est pas vidée`));
      expectSame(C, 'historique vidé', [await textOf(page, '.dsc-empty h2'), await textOf(page, '.dsc-empty p'), await page.locator('.dsc-head-action button').count(), await viewedStorage(page)],
        ['Aucun bien consulté', 'Les annonces que vous ouvrez apparaîtront ici.', 0, '[]']);
      if (writes.length !== mark || space.calls.slice(viewedMark).some((call) => call.method !== 'GET' && !call.table.startsWith('rpc/'))) {
        problems.push(`${C} : écriture envoyée au serveur (${JSON.stringify(space.calls.slice(viewedMark).filter((call) => call.method !== 'GET'))})`);
      }
      await page.goto(`${base}/compte/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.dsp-tile');
      expectSame(C, 'tuile de Mon espace', await textOf(page, '.dsp-tile[href="/compte/?vue=consultes"]'), 'Biens consultés Aucun historique');

      // Supprimer mon compte : l'écran existant (rien n'est supprimé sans « Supprimer définitivement »).
      await page.click('.dsp-delete');
      await page.waitForURL(`${base}/compte/?vue=supprimer`, { timeout: 8000 }).catch(() => problems.push(`Supprimer mon compte : ouvre ${page.url()}`));
      await page.waitForSelector('.delete-card');
      expectSame('Supprimer mon compte', 'écran', [await textOf(page, '.delete-card h2'), await textOf(page, '.delete-card .danger-button')],
        ['Supprimer mon compte ?', 'Supprimer définitivement']);

      // Se déconnecter : la confirmation de l'app ; « Annuler » ne fait rien, « Se déconnecter » ferme la session.
      const D = 'Se déconnecter';
      await page.goto(`${base}/compte/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.dsp-logout');
      await page.click('.dsp-logout');
      expectSame(D, 'confirmation', [await dialogTitle(page), await textOf(page, 'dialog.alert-dialog[open] .alert-body p'),
        await page.$$eval('dialog.alert-dialog[open] .alert-actions button', (buttons) => buttons.map((button) => [button.textContent, button.className]))],
      ['Se déconnecter ?', 'Vous pourrez vous reconnecter avec votre adresse e-mail et votre mot de passe.', [['Se déconnecter', 'btn dsc-btn-danger'], ['Annuler', 'btn dsc-btn-quiet']]]);
      await alertButton(page, 'Annuler');
      await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${D} : la confirmation reste ouverte`));
      await page.waitForTimeout(300);
      if (space.logouts.length) problems.push(`${D} : session fermée après « Annuler »`);
      await page.click('.dsp-logout');
      await dialogTitle(page);
      await alertButton(page, 'Se déconnecter');
      await waitFor(() => space.logouts.length > 0, `${D} : appel au serveur`);
      expectSame(D, 'appel', space.logouts, [{ method: 'POST', search: '?scope=global' }]);
      await page.waitForSelector('.signin-card', { timeout: 8000 }).catch(() => problems.push(`${D} : la carte de connexion ne s'affiche pas`));
      expectSame(D, 'page après la déconnexion', [await page.locator('.dsp').count(), await page.evaluate(() => {
        try { return Object.keys(localStorage).filter((key) => key.startsWith('sb-')).length; } catch { return null; }
      })], [0, 0]);
      await page.close();
      await context.close();
    }

    // Mon projet de la maquette (Investissement, 57 %) : capture de l'écran entier.
    {
      const space = spaceState({ project: structuredClone(SPACE_PROJECTS.invest) });
      const { context } = await spaceContext(1440, 900, space);
      page = await open(context, '/compte/?vue=projet', 'Mon projet 1440');
      await page.waitForSelector('.dsc-project-screen .dsc-kinds');
      expectSame('Mon projet 1440', 'résumé', [await textOf(page, '.dsc-summary-ring .dsp-ring-label'), await textOf(page, '.dsc-steps-count'),
        await page.getAttribute('.dsc-kind[aria-pressed="true"]', 'aria-label'), (await contentWidth(page, '.account-wrap'))], ['57 %', '3 étapes sur 6',
        'Investissement, Générer des revenus immobiliers', 640]);
      await tallShot(page, '5-mon-espace-projet-1440.png');
      await page.close();
      await context.close();
    }

    // Compte professionnel : son espace garde son écran ; sur ordinateur, « Agenda des visites » ouvre Mon agenda.
    for (const [width, href] of [[1440, '/compte/?vue=agenda'], [1023, '/compte/?vue=bientot&ecran=agenda']]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'fr-FR' });
      await mock(context, { signedIn: true, account: { profiles: [{ ...ACCOUNT.profiles[0], account_type: 'professional', professional_profile_id: 'b2000000-0000-4000-8000-000000000001' }] } });
      page = await open(context, '/compte/', `espace pro ${width}`);
      await page.waitForSelector('.row-title');
      expectSame(`espace pro ${width}`, 'Agenda des visites', [await page.locator('.dsp').count(),
        await page.$$eval('a.row', (rows) => rows.filter((row) => row.querySelector('.row-title')?.textContent === 'Agenda des visites').map((row) => row.getAttribute('href')))], [0, [href]]);
      await page.close();
      await context.close();
    }

    // À 1023 px : la page du téléphone ; les écrans de l'ordinateur y sont « bientôt » et rien de l'agenda n'est demandé.
    {
      const context = await browser.newContext({ viewport: { width: 1023, height: 768 }, locale: 'fr-FR' });
      await mock(context, { signedIn: true });
      page = await open(context, '/compte/', 'Mon espace 1023');
      await page.waitForSelector('.project-card');
      expectSame('Mon espace 1023', 'page du téléphone', [await page.locator('.dsp, .dsc, .dtop, .dfoot').count(), await page.locator('.space-profile').count()], [0, 1]);
      await page.close();
      for (const [view, title] of [['agenda', 'Mon agenda'], ['ajouter-visite', 'Mon agenda'], ['projet', 'Mon projet immobilier'], ['consultes', 'Biens consultés']]) {
        page = await open(context, `/compte/?vue=${view}`, `${view} 1023`);
        await page.waitForSelector('.soon-card');
        expectSame(`${view} 1023`, 'écran « bientôt »', [await textOf(page, '.soon-card h2'), await page.locator('.dsc').count()], [title, 0]);
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
        expectSame(`${path} sans compte`, 'page', [await page.locator('.dsp, .dsc').count(), await textOf(page, '.signin-card h1')], [0, 'Bienvenue sur NIDALO']);
        await page.close();
      }
      const asked = guestServer.requests.filter((request) => ['real_estate_projects', 'agenda_visits', 'rpc/my_visit_requests', 'profiles'].includes(request.table));
      if (asked.length) problems.push(`Mon espace sans compte : ${asked.map((request) => request.table).join(', ')} demandé`);
      await context.close();
    }
  } finally {
    await spaceBrowser.close();
  }

  // Téléphone
  const phone = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  await mock(phone);
  page = await open(phone, '/', 'accueil-telephone');
  await page.waitForSelector('.home-section');
  await page.screenshot({ path: join(out, 'accueil-telephone.png') });
  await page.screenshot({ path: join(out, 'accueil-telephone-long.png'), fullPage: true });
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
  await page.click('.map-open');
  await page.waitForSelector('.map-marker', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'carte-telephone.png') });
  await page.tap('.map-marker');
  await page.waitForSelector('.map-preview');
  await page.screenshot({ path: join(out, 'carte-telephone-apercu.png') });
  await page.click('.map-close');
  await page.click('.filters-button');
  await page.waitForSelector('dialog.filters-dialog[open]');
  await checkApplyButton(page, 'filtres téléphone');
  await page.screenshot({ path: join(out, 'filtres-telephone.png') });
  await page.evaluate(() => document.querySelector('dialog[open] .filters-scroll')?.scrollTo(0, 1e6));
  await page.screenshot({ path: join(out, 'filtres-telephone-bas.png') });
  // « Voir sur la carte » : applique les filtres et ouvre la carte, gardée dans l'adresse.
  await page.evaluate(() => document.querySelector('dialog[open] .filters-scroll')?.scrollTo(0, 0));
  await page.click('dialog[open] .filters-map-link');
  await page.waitForSelector('.map-column.is-open');
  if (!page.url().includes('vue=carte')) problems.push(`carte : adresse sans « vue=carte » (${page.url()})`);
  await page.click('.map-close');
  if (page.url().includes('vue=carte')) problems.push(`carte : « vue=carte » reste après fermeture (${page.url()})`);
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
  const rentChips = await page.locator('dialog[open] .active-chip').allTextContents();
  if (!rentChips.some((c) => /^Dispo\. avant le /.test(c))) problems.push(`location : pastilles « ${rentChips.join(' | ')} »`);
  page = await open(phone, '/compte/', 'compte-connexion-telephone');
  await page.waitForSelector('.signin-card');
  await page.screenshot({ path: join(out, 'compte-connexion-telephone.png') });
  await phone.close();

  // Téléphone, avec le compte de test.
  const signedPhone = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  await mock(signedPhone, { signedIn: true });
  page = await open(signedPhone, '/compte/', 'compte-espace-telephone');
  await page.waitForSelector('.project-card');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'compte-espace-telephone.png') });
  await page.screenshot({ path: join(out, 'compte-espace-telephone-long.png'), fullPage: true });
  page = await open(signedPhone, '/favoris/', 'favoris-telephone');
  await page.waitForSelector('.favorite-card');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'favoris-telephone.png') });
  await page.screenshot({ path: join(out, 'favoris-telephone-long.png'), fullPage: true });
  page = await open(signedPhone, '/compte/?vue=informations', 'mes-informations-telephone');
  await page.waitForSelector('input[autocomplete="tel"]');
  await page.screenshot({ path: join(out, 'mes-informations-telephone-long.png'), fullPage: true });
  await signedPhone.close();
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
