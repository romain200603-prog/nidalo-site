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

async function mock(context, { signedIn = false } = {}) {
  const json = (route, status, body) =>
    route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: body === undefined ? '' : JSON.stringify(body) });
  const state = messagingState();
  await context.route('https://izzsoitqtzzswkpvdozd.supabase.co/rest/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.replace('/rest/v1/', '');
    const single = (request.headers().accept ?? '').includes('vnd.pgrst.object');
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
    if (signedIn && table in ACCOUNT) {
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
      const rows = filtered(ACCOUNT[table], url.searchParams);
      if (single) return rows.length === 1 ? json(route, 200, rows[0]) : json(route, 406, { code: 'PGRST116', message: 'no rows' });
      return json(route, 200, rows);
    }
    let rows = listings;
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
  return { state, followed, pushChange };
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
  await page.waitForSelector('.gallery-action[aria-pressed]');
  if ((await page.getAttribute('.gallery-action[aria-pressed]', 'aria-pressed')) !== 'true') problems.push('annonce : le cœur d\'un favori n\'est pas rempli');
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
