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
        if (table === 'saved_searches' && request.method() === 'PATCH' && (request.headers().prefer ?? '').includes('return=representation')) return json(route, 200, []);
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

/** Barre du haut et pied de page de l'ordinateur : mesures, liens, catégorie active, police. */
async function checkChrome(page, name, { signedIn, active = null, margin }) {
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
      modes: [...document.querySelectorAll('.dtop-mode')].map((link) => [link.textContent.trim(), link.getAttribute('href')]),
      active: [...document.querySelectorAll('.dtop-mode[aria-current="page"]')].map((link) => link.textContent.trim()),
      badges: document.querySelectorAll('.dtop-badge').length,
      avatar: document.querySelector('.dtop-avatar')?.textContent.trim() ?? null,
      avatarIcon: Boolean(document.querySelector('.dtop-avatar svg')),
      font: getComputedStyle(document.querySelector('.dtop-mode') ?? document.body).fontFamily,
      interLoaded: document.fonts.check('500 15px "Nidalo Inter"') && [...document.fonts].some((face) => face.family.includes('Nidalo Inter') && face.status === 'loaded'),
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
  const modes = JSON.stringify(info.modes);
  if (modes !== JSON.stringify([['Résidentiel', '/recherche/?mode=buy'], ['Location', '/recherche/?mode=rent'], ['Investir', '/recherche/?mode=invest'], ['Hôtels', '/recherche/?mode=hotel']])) {
    problems.push(`${name} : catégories ${modes}`);
  }
  if (JSON.stringify(info.active) !== JSON.stringify(active ? [active] : [])) problems.push(`${name} : catégorie active ${JSON.stringify(info.active)} au lieu de ${active}`);
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
  await page.waitForSelector('.map-marker', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'recherche-ordinateur.png') });
  await page.click('.map-marker');
  await page.waitForSelector('.map-preview');
  await page.screenshot({ path: join(out, 'recherche-ordinateur-apercu.png') });
  await page.fill('.place-field input', 'lyo');
  await page.waitForSelector('.place-list li');
  await page.screenshot({ path: join(out, 'recherche-suggestions.png'), clip: { x: 0, y: 0, width: 720, height: 520 } });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.search.includes('lieu=Lyon'));
  await page.click('.filters-button');
  await page.waitForSelector('dialog.filters-dialog[open]');
  await checkApplyButton(page, 'filtres ordinateur');
  // Un critère choisi apparaît en pastille retirable ; le DPE affiche sa fourchette.
  await page.getByRole('group', { name: 'Pièces minimum' }).getByRole('button', { name: '3', exact: true }).click();
  await page.getByRole('button', { name: 'DPE C', exact: true }).click();
  const dpe = await page.getByRole('group', { name: 'DPE maximum accepté' }).locator('.field-value').textContent();
  if (dpe !== 'DPE A à C') problems.push(`filtres : DPE affiché « ${dpe} » au lieu de « DPE A à C »`);
  const chips = await page.locator('dialog[open] .active-chip').allTextContents();
  if (!chips.some((c) => /pièce/.test(c)) || !chips.some((c) => /DPE/.test(c))) problems.push(`filtres : pastilles « ${chips.join(' | ')} »`);
  await page.screenshot({ path: join(out, 'filtres-ordinateur.png') });
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
  page = await open(signed, '/compte/', 'compte-espace');
  await page.waitForSelector('.space-profile');
  await page.waitForSelector('.project-card');
  await page.waitForFunction(() => /1 en ligne · 1 brouillon/.test(document.querySelector('.activity-tiles')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
  const space = (await page.textContent('.space'))?.replace(/\s+/g, ' ') ?? '';
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
  page = await open(signed, '/favoris/', 'favoris-connecte');
  await page.waitForSelector('.favorite-card');
  await page.waitForSelector('.missing-card');
  const favoriteCount = await page.locator('.favorite-card').count();
  if (favoriteCount !== 2) problems.push(`Favoris : ${favoriteCount} cartes au lieu de 2`);
  const total = (await page.textContent('.favorites-total'))?.trim();
  if (total !== '2 biens sauvegardés') problems.push(`Favoris : compteur « ${total} »`);
  await page.screenshot({ path: join(out, 'favoris-connecte-ordinateur.png'), fullPage: true });
  await page.fill('.favorites-search input', 'villeur');
  await page.waitForFunction(() => document.querySelector('.favorites-total')?.textContent?.trim() === '1 sur 2 biens', null, { timeout: 4000 })
    .catch(async () => problems.push(`Favoris : recherche « villeur », compteur « ${await page.textContent('.favorites-total')} »`));
  await page.screenshot({ path: join(out, 'favoris-recherche-ordinateur.png') });
  await page.click('.favorites-tabs button >> nth=1');
  await page.waitForSelector('.favorites-searches .saved-search');
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
    // Recherche : la catégorie ouverte est mise en avant ; la barre reste en haut, la carte dessous.
    page = await open(guest, '/recherche/?mode=invest', `recherche-${width}`);
    await page.waitForSelector('.listing-card');
    await checkChrome(page, `recherche ${width}`, { signedIn: false, active: 'Investir', margin });
    await page.click('.dtop-mode >> nth=1');
    await page.waitForURL(/\/recherche\/\?mode=rent$/);
    await page.waitForSelector('.listing-card');
    const rentActive = (await page.locator('.dtop-mode[aria-current="page"]').allTextContents()).map((text) => text.trim());
    if (JSON.stringify(rentActive) !== '["Location"]') problems.push(`recherche ${width} : après « Location », catégorie active ${JSON.stringify(rentActive)}`);
    // La carte occupe toute la hauteur sous la barre de 72 px ; la barre reste en haut quand la page défile.
    const map = await page.evaluate(() => { const box = document.querySelector('.map-column').getBoundingClientRect(); return [box.top, box.bottom]; });
    if (map[0] !== 72 || map[1] !== height) problems.push(`recherche ${width} : carte de ${map[0]} à ${map[1]} px au lieu de 72 à ${height}`);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    const scrolled = await page.evaluate(() => [window.scrollY, document.querySelector('.dtop').getBoundingClientRect().top]);
    if (scrolled[0] <= 0 || scrolled[1] !== 0) problems.push(`recherche ${width} : après défilement de ${scrolled[0]} px, barre à ${scrolled[1]} px`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(out, `recherche-${width}.png`) });
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
    page = await open(member, '/compte/', `compte-espace-${width}`);
    await page.waitForSelector('.project-card');
    if ((await contentWidth(page, '.account-wrap')) !== 608) problems.push(`Mon espace ${width} : largeur ${await contentWidth(page, '.account-wrap')} px au lieu de 608 (inchangée)`);
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
    // « Plus de critères » ouvre les filtres du site, sur la catégorie choisie.
    await page.click('.dhome-more');
    await page.waitForSelector('dialog.filters-dialog[open]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog.filters-dialog[open]', { state: 'detached' }).catch(() => undefined);
    // Investir : le lieu et 6 critères, sur une ligne à partir de 1280 px, sur deux lignes en dessous.
    await page.click('.mode-tab >> nth=2');
    const investRows = await page.evaluate(() => new Set([...document.querySelectorAll('.dhome-fields > *')].filter((el) => el.offsetParent).map((el) => Math.round(el.getBoundingClientRect().top))).size);
    if (investRows !== (width >= 1280 ? 1 : 2)) problems.push(`accueil ${width} : critères Investir sur ${investRows} ligne(s)`);
    await page.locator('.dhome-search').screenshot({ path: join(out, `accueil-maquette-${width}-investir.png`) });
    const clipped = await page.evaluate(() => [...document.querySelectorAll('.dhome-fields .criterion-label, .dhome-fields .criterion-value')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent));
    if (clipped.length) console.log(`accueil ${width} Investir, textes coupés : ${clipped.join(' | ')}`);
    await page.click('.mode-tab >> nth=3');
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

  // Largeurs limites : la barre du haut tient toujours sur une ligne (catégorie active en gras), avec des marges de
  // 32 px jusqu'à 1279 px puis de 48 px ; « Mon espace » s'écrit à partir de 1180 px, « une annonce » à partir de 1366 px.
  for (const width of [1179, 1180, 1279, 1280, 1365, 1366]) {
    const edge = await browser.newContext({ viewport: { width, height: 800 }, locale: 'fr-FR' });
    await mock(edge);
    const p = await open(edge, '/recherche/?mode=buy', `recherche-${width}`);
    await p.waitForSelector('.listing-card');
    await checkChrome(p, `recherche ${width}`, { signedIn: false, active: 'Résidentiel', margin: width >= 1280 ? 48 : 32 });
    const shown = await p.evaluate(() => [
      getComputedStyle(document.querySelector('.dtop-publish-end')).display !== 'none', getComputedStyle(document.querySelector('.dtop-space-label')).display !== 'none',
      document.querySelector('.dtop-publish').getAttribute('aria-label'), document.querySelector('.dtop-space').getAttribute('aria-label'),
    ]);
    // [« une annonce » affiché, « Mon espace » affiché, noms des deux liens]
    const wanted = [width >= 1366, width >= 1180, 'Publier une annonce', 'Mon espace'];
    if (JSON.stringify(shown) !== JSON.stringify(wanted)) problems.push(`barre ${width} : ${JSON.stringify(shown)} au lieu de ${JSON.stringify(wanted)}`);
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
      ['Prochaine visite Voir l’agenda', '/compte/?vue=bientot&ecran=agenda', 'VISITE CONFIRMÉE Jeu. 12 nov. · 18h00 Appartement 3 pièces · Lyon 2e 238 000 € AD Avec Agence Démo Lyon']);
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
    await page.waitForTimeout(300);
    await chatShot(page, `3-messages-details-${width}.png`);
    await page.click('.dm-details-bar button[aria-label="Retour"]');
    await page.waitForURL(`${base}/messages/?c=${chatId(1)}`);
    await page.waitForSelector('.dm-thread-inner');

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
