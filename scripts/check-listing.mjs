// Vérification de la fiche d'une annonce (/annonce/) dans Chromium, sans réseau : le serveur Supabase, les services
// de lieux et la carte sont simulés avec des données inventées (fixtures/listings.json, fixtures/listing-extra.json et
// fixtures/listing-desktop.json). Sur ordinateur, avec le compte de test, les actions de la fiche (offre, visite,
// message, favori, comparaison) parlent au serveur simulé, qui note ce qu'elles envoient.
// Lancer après la construction : node scripts/check-listing.mjs [dossier construit, docs/ par défaut] [dossier des captures]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const root = resolve(fileURLToPath(import.meta.url), '../..');
const docs = resolve(process.argv[2] ?? join(root, 'docs'));
const out = resolve(process.argv[3] ?? join(root, 'scripts', 'captures'));
const port = Number(process.env.PORT ?? 8122);
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
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const base = `http://127.0.0.1:${port}`;

const extra = JSON.parse(await readFile(join(root, 'scripts/fixtures/listing-extra.json'), 'utf8'));
const desk = JSON.parse(await readFile(join(root, 'scripts/fixtures/listing-desktop.json'), 'utf8'));
const listings = [...JSON.parse(await readFile(join(root, 'scripts/fixtures/listings.json'), 'utf8')), ...extra.listings, ...desk.listings];
const profiles = [...extra.profiles, ...desk.profiles];
const photos = {};
for (const name of ['photo0.jpg', 'photo1.jpg', 'photo2.jpg']) photos[name] = await readFile(join(root, 'scripts/fixtures', name));
const tile = await readFile(join(root, 'scripts/fixtures/tile.png'));

const id = (end) => `6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1a${end}`;
const SALE = id('01'); // vente, adresse masquée, 2 photos, particulier
const LEASED = id('02'); // vente louée (investissement), agence
const RENTAL = id('03'); // location meublée, adresse exacte, sans photo, sans profil public
const HOTEL = id('04'); // hôtel avec chiffre d'affaires et EBITDA, 3 photos, agence
const HOUSE = id('05'); // maison non louée avec un loyer potentiel, DPE F
const FICHE = id('06'); // vente avec un loyer potentiel (rentabilité), 3 photos, agence avec un numéro, rue masquée
const MINE = id('07'); // annonce du compte de test, 1 photo
const UNKNOWN = id('ff'); // identifiant valide, aucune annonce
const BROKEN = id('ee'); // le serveur répond par une erreur
let brokenRequests = 0;

const cors = { 'access-control-allow-origin': '*' };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
function matches(row, key, filter) {
  if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
  if (filter.startsWith('in.(')) return filter.slice(4, -1).split(',').includes(String(row[key]));
  return true;
}

// Demandes en cours (et ratées) avec leur heure de départ, pour expliquer une carte qui ne se charge pas ; celles des
// workers de la carte n'ont pas de page, d'où l'heure plutôt que la page.
const pending = new Map();
const failedRequests = [];
async function mock(context) {
  context.on('request', (request) => pending.set(request, Date.now()));
  context.on('requestfinished', (request) => pending.delete(request));
  context.on('requestfailed', (request) => {
    failedRequests.push({ at: pending.get(request) ?? Date.now(), text: `${request.url().slice(0, 120)} ${request.failure()?.errorText ?? ''}` });
    pending.delete(request);
  });
  await context.route('https://izzsoitqtzzswkpvdozd.supabase.co/rest/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.replace('/rest/v1/', '');
    if (ACCOUNT_TABLES.includes(table)) {
      // Avec un compte, la route du compte (signIn) répond avant celle-ci : arriver ici, c'est demander sans compte.
      problems.push(`sans compte : ${table} demandé (${request.method()} ${decodeURIComponent(url.search)})`);
      return json(route, []);
    }
    if (url.pathname.endsWith('/rpc/public_profiles')) {
      // Profils publics : jamais de téléphone ni d'e-mail pour un visiteur sans compte.
      const ids = (request.method() === 'POST' ? request.postDataJSON()?.user_ids : null) ?? [];
      return json(route, profiles.filter((p) => ids.includes(p.user_id)).map((p) => ({ ...p, agency_phone: null })));
    }
    if (url.searchParams.get('id') === `eq.${BROKEN}`) {
      brokenRequests += 1;
      return json(route, { message: 'Erreur simulée', code: 'XX000', details: null, hint: null }, 500);
    }
    let rows = listings;
    for (const key of ['id', 'owner_id', 'transaction', 'status']) {
      const filter = url.searchParams.get(key);
      if (filter) rows = rows.filter((r) => matches(r, key, filter));
    }
    if (url.searchParams.get('select') === 'id') rows = rows.map((r) => ({ id: r.id }));
    return json(route, rows);
  });
  await context.route('https://izzsoitqtzzswkpvdozd.supabase.co/storage/**', (route) => {
    const name = route.request().url().split('/').pop();
    route.fulfill({ status: 200, contentType: 'image/jpeg', headers: cors, body: photos[name] ?? photos['photo0.jpg'] });
  });
  await context.route('https://geo.api.gouv.fr/**', (route) => json(route, []));
  await context.route('https://data.geopf.fr/**', (route) => {
    // Photo aérienne de l'IGN : une tuile unie ; recherche de lieux : aucun résultat.
    if (route.request().url().includes('/wmts?')) {
      return route.fulfill({ status: 200, contentType: 'image/png', headers: cors, body: tile });
    }
    return json(route, { type: 'FeatureCollection', features: [] });
  });
  // Playwright essaie les routes de la dernière enregistrée à la première : la description des tuiles du plan passe
  // donc après la règle générale (tuiles vides), sinon elle répondrait vide elle aussi.
  await context.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ status: 204, headers: cors, body: '' }));
  await context.route('https://tiles.openfreemap.org/planet', (route) =>
    json(route, { tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14, vector_layers: [], attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap' }));
}

// MARK: - Compte de test (le même que scripts/check-pages.mjs) : données inventées, numéro dans la plage de la fiction.

const USER_ID = 'a0000000-0000-4000-8000-0000000000c1';
const USER_EMAIL = 'claire.martin@exemple.fr';
const ACCOUNT_PROFILE = {
  id: USER_ID, display_name: 'Claire Martin', avatar_path: null, account_type: 'individual', professional_profile_id: null,
  created_at: '2026-10-01T08:00:00Z', shows_full_name: false, findable_by_phone: false,
};
const ACCOUNT_DETAILS = {
  user_id: USER_ID, first_name: 'Claire', last_name: 'Martin', birth_date: null, phone: '0639981234', street: null,
  postal_code: '69003', city: 'Lyon', insee_code: '69383', country_code: 'FR', professional_situation: 'employee',
};
/** Rue de la vente FICHE, dont l'adresse est masquée : jamais affichée. */
const HIDDEN_STREET = '8 rue des Essais';
const conversationId = (n) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_SECONDS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

/** Tables et fonctions du compte : jamais demandées sans compte. */
const ACCOUNT_TABLES = [
  'profiles', 'profile_details', 'favorites', 'notifications', 'rpc/mark_notifications_read', 'rpc/my_conversations',
  'rpc/start_listing_conversation', 'rpc/my_offers', 'rpc/make_offer', 'rpc/my_visit_requests', 'rpc/create_visit_request',
  'agenda_visits', 'saved_searches', 'real_estate_projects', 'professional_profiles', 'professional_profile_details',
];
/** Celles qui ne servent que sur ordinateur (pastilles, actions de la fiche) : sous 1024 px, rien ne change. */
const DESKTOP_ONLY = [
  'notifications', 'rpc/mark_notifications_read', 'rpc/my_conversations', 'rpc/start_listing_conversation', 'rpc/my_offers',
  'rpc/make_offer', 'rpc/my_visit_requests', 'rpc/create_visit_request', 'agenda_visits',
];

/** Appels du compte, dans l'ordre : ce que chaque bouton envoie est vérifié d'après eux. */
const calls = [];
const since = (mark, table) => calls.slice(mark).filter((call) => call.table === table);

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

/** Largeur de la page qui fait la demande (`null` pour un worker). */
function pageWidth(request) {
  try {
    return request.frame().page().viewportSize()?.width ?? null;
  } catch {
    return null;
  }
}

/** Heure de Paris, `days` jours après aujourd'hui (l'heure d'hiver ou d'été, selon le jour). */
function parisTime(days, hours) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() + days * 86_400_000));
  for (const offset of [1, 2]) {
    const guess = new Date(`${day}T${String(hours - offset).padStart(2, '0')}:00:00Z`);
    const shown = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).format(guess);
    if (Number.parseInt(shown, 10) === hours) return guess;
  }
  return new Date(`${day}T${String(hours - 1).padStart(2, '0')}:00:00Z`);
}

const isoSeconds = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const listingById = (listingId) => listings.find((row) => row.id === listingId);

/** Ce que le serveur sait du compte : conversations, offres, agenda, demandes de visite et favoris. */
function accountState() {
  return { conversations: [], offers: [], agenda: [], requests: [], favorites: [] };
}

/** Le compte comme sur la maquette : une conversation sur FICHE, une offre en attente et une visite confirmée. */
function seededState() {
  const state = accountState();
  const fiche = listingById(FICHE);
  state.conversations.push({ id: conversationId(1), listing: fiche });
  state.offers.push({
    id: 'f1000000-0000-4000-8000-000000000001', conversation_id: conversationId(1), listing_id: FICHE, buyer_id: USER_ID, seller_id: fiche.owner_id,
    amount: 228000, conditions: null, status: 'pending', created_at: isoSeconds(new Date(Date.now() - 2 * 86_400_000)),
    expires_at: isoSeconds(new Date(Date.now() + 5 * 86_400_000)),
  });
  const start = isoSeconds(parisTime(4, 18));
  state.agenda.push({
    id: 'e0000000-0000-4000-8000-000000000001', start_at: start, status: 'confirmed', request_id: 'f2000000-0000-4000-8000-000000000001', listing_id: FICHE,
    visit: { id: 'e0000000-0000-4000-8000-000000000001', listing: { listingId: FICHE, title: fiche.title, city: fiche.city }, start, durationMinutes: 60, status: 'confirmed' },
  });
  return state;
}

/** Ligne de my_conversations d'une conversation d'annonce (colonnes lues par la fiche et par la pastille Messages). */
function inboxRow({ id, listing }) {
  return {
    conversation_id: id, kind: 'listing', listing_id: listing.id,
    listing_snapshot: { listingId: listing.id, title: listing.title, price: listing.price, transaction: listing.transaction, city: listing.city },
    buyer_id: USER_ID, seller_id: listing.owner_id, other_user_id: listing.owner_id, created_by: USER_ID, created_at: '2026-11-05T09:00:00Z',
    is_archived: false, is_favorite: false, muted_until: null, unread_count: 0, last_message_preview: null, last_message_at: null,
  };
}

/** Réponses du serveur simulé pour le compte, comme les fonctions du serveur. */
function respond(route, state, table, request, url, body) {
  const method = request.method();
  const empty = (status) => route.fulfill({ status, headers: cors, body: '' });
  const refuse = (message) => json(route, { code: 'P0001', message, details: null, hint: null }, 400);
  switch (table) {
    case 'profiles':
      return (request.headers().accept ?? '').includes('vnd.pgrst.object') ? json(route, ACCOUNT_PROFILE) : json(route, [ACCOUNT_PROFILE]);
    case 'profile_details':
      return json(route, [ACCOUNT_DETAILS]);
    case 'rpc/mark_notifications_read':
      return empty(204);
    case 'favorites': {
      if (method === 'POST') {
        if (!state.favorites.some((row) => row.listing_id === body?.listing_id)) state.favorites.push({ listing_id: body?.listing_id, created_at: new Date().toISOString() });
        return empty(201);
      }
      if (method === 'DELETE') {
        const filter = url.searchParams.get('listing_id');
        state.favorites = state.favorites.filter((row) => `eq.${row.listing_id}` !== filter);
        return empty(204);
      }
      return json(route, state.favorites);
    }
    case 'agenda_visits':
      return json(route, state.agenda);
    case 'rpc/my_conversations': {
      const rows = state.conversations.map(inboxRow);
      return json(route, body?.p_conversation_id ? rows.filter((row) => row.conversation_id === body.p_conversation_id) : rows);
    }
    case 'rpc/start_listing_conversation': {
      // Crée la conversation de l'annonce, ou rend celle qui existe déjà (jamais avec sa propre annonce).
      const listing = listingById(body?.p_listing_id);
      if (!listing) return refuse('Annonce introuvable.');
      if (listing.owner_id === USER_ID) return refuse('C\'est votre annonce.');
      let conversation = state.conversations.find((item) => item.listing.id === listing.id);
      if (!conversation) {
        conversation = { id: conversationId(state.conversations.length + 1), listing };
        state.conversations.push(conversation);
      }
      return json(route, conversation.id);
    }
    case 'rpc/my_offers':
      return json(route, state.offers);
    case 'rpc/make_offer': {
      const conversation = state.conversations.find((item) => item.id === body?.p_conversation_id);
      if (!conversation) return refuse('Conversation introuvable.');
      const offer = {
        id: body.p_id, conversation_id: conversation.id, listing_id: conversation.listing.id, buyer_id: USER_ID, seller_id: conversation.listing.owner_id,
        amount: body.p_amount, conditions: body.p_conditions ?? null, status: 'pending', created_at: isoSeconds(new Date()),
        expires_at: body.p_expires_at ?? isoSeconds(new Date(Date.now() + 7 * 86_400_000)),
      };
      state.offers.push(offer);
      return json(route, [offer]);
    }
    case 'rpc/my_visit_requests':
      return json(route, body?.p_request_id ? state.requests.filter((row) => row.id === body.p_request_id) : state.requests);
    case 'rpc/create_visit_request': {
      const listing = listingById(body?.p_listing_id);
      if (!listing) return refuse('Annonce introuvable.');
      const owner = profiles.find((profile) => profile.user_id === listing.owner_id);
      const agency = owner?.account_type === 'professional' && owner.agency_id;
      state.requests.push({
        id: body.p_id, listing_id: listing.id, listing_snapshot: { listingId: listing.id, title: listing.title, price: listing.price, city: listing.city },
        requester: { userId: USER_ID, name: 'Claire M.', kind: 'individual' },
        recipient: agency
          ? { userId: listing.owner_id, name: owner.agency_name, kind: 'agency', agencyId: owner.agency_id }
          : { userId: listing.owner_id, name: owner?.public_name ?? 'Particulier', kind: 'individual' },
        slots: body.p_slots, mode: body.p_mode, message: body.p_message ?? null, status: 'pending', accepted_slot: null, proposed_slots: null,
        created_at: isoSeconds(new Date()),
      });
      return json(route, body.p_id);
    }
    default:
      // Notifications, recherches enregistrées, projet, profil professionnel : rien pour ce compte.
      return json(route, []);
  }
}

/**
 * Connecte le compte de test dans ce contexte (session dans le stockage, comme supabase-js) et répond à ses tables
 * et fonctions avec `state`. À appeler après `mock(context)` : Playwright essaie d'abord la route la plus récente.
 */
async function signIn(context, state) {
  const session = JSON.stringify(fakeSession());
  await context.addInitScript((value) => {
    try { localStorage.setItem('sb-izzsoitqtzzswkpvdozd-auth-token', value); } catch { /* stockage indisponible */ }
  }, session);
  await context.route('https://izzsoitqtzzswkpvdozd.supabase.co/auth/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/logout')) return route.fulfill({ status: 204, headers: cors, body: '' });
    if (path.endsWith('/user')) return json(route, fakeSession().user);
    return json(route, fakeSession());
  });
  await context.route('https://izzsoitqtzzswkpvdozd.supabase.co/rest/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.replace('/rest/v1/', '');
    if (table === 'rpc/public_profiles') {
      // Avec un compte, le serveur donne aussi le numéro de l'agence.
      const ids = request.postDataJSON()?.user_ids ?? [];
      return json(route, profiles.filter((p) => ids.includes(p.user_id)));
    }
    if (!ACCOUNT_TABLES.includes(table)) return route.fallback();
    let body = null;
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
    const width = pageWidth(request);
    calls.push({ table, method: request.method(), search: decodeURIComponent(url.search), body, width });
    if (width !== null && width < 1024 && DESKTOP_ONLY.includes(table)) problems.push(`téléphone : ${table} demandé (rien ne doit changer sous 1024 px)`);
    return respond(route, state, table, request, url, body);
  });
  // Temps réel (pastilles de la barre du haut) : les abonnements sont acceptés, aucun changement n'est envoyé.
  await context.routeWebSocket(/^wss:\/\/izzsoitqtzzswkpvdozd\.supabase\.co\/realtime\//, (ws) => {
    ws.onMessage((message) => {
      let frame;
      try { frame = JSON.parse(String(message)); } catch { return; }
      if (!Array.isArray(frame)) return;
      const [joinRef, ref, topic, event, payload] = frame;
      const response = event === 'phx_join'
        ? { postgres_changes: (payload?.config?.postgres_changes ?? []).map((filter, index) => ({ ...filter, id: index + 1 })) }
        : {};
      ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]));
    });
  });
}

/** Objet aux clés triées, pour comparer des arguments sans dépendre de leur ordre. */
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  return value;
}

const problems = [];
/** Messages WebGL de la console, par page, pour expliquer une carte qui ne se charge pas. */
const webglNotes = new Map();
const expect = (name, what, actual, wanted) => {
  const clean = typeof actual === 'string' ? actual.replace(/\s+/g, ' ').trim() : actual;
  const ok = wanted instanceof RegExp ? wanted.test(String(clean)) : clean === wanted;
  if (!ok) problems.push(`${name}: ${what} « ${clean} » au lieu de « ${wanted} »`);
};
/** Arguments envoyés au serveur : exactement ceux attendus (mêmes clés, mêmes valeurs). */
const expectJSON = (name, what, actual, wanted) => {
  const got = JSON.stringify(sorted(actual ?? null));
  const want = JSON.stringify(sorted(wanted));
  if (got !== want) problems.push(`${name}: ${what} ${got} au lieu de ${want}`);
};
/** Un seul appel à `table` depuis `mark`, rendu pour vérifier ses arguments. */
function once(name, mark, table, filter = () => true) {
  const made = since(mark, table).filter(filter);
  if (made.length !== 1) problems.push(`${name}: ${table} appelé ${made.length} fois au lieu d'une (${made.map((call) => JSON.stringify(call.body)).join(' | ')})`);
  return made[0] ?? null;
}

async function open(context, path, name, { init, expectedStatus, before } = {}) {
  const page = await context.newPage();
  if (before) await before(page);
  page.on('console', (msg) => {
    const text = msg.text();
    if (/webgl|context lost/i.test(text)) (webglNotes.get(page) ?? webglNotes.set(page, []).get(page)).push(`${msg.type()} ${text.slice(0, 160)}`);
    // Le cas « erreur du serveur » répond exprès 500 : Chrome le signale dans la console, ce n'est pas une erreur du site.
    if (expectedStatus && text.includes(`status of ${expectedStatus}`)) return;
    if (msg.type() === 'error' || /Content Security Policy/i.test(text)) problems.push(`${name}: ${msg.type()} ${text}`);
  });
  page.on('pageerror', (error) => problems.push(`${name}: erreur ${error.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP bloque ${e.violatedDirective} ${e.blockedURI}`));
  });
  if (init) await page.addInitScript(init);
  await page.goto(base + path, { waitUntil: 'networkidle' });
  return page;
}

/** Fiche chargée : résumé affiché (le prix en haut de la colonne de gauche sur ordinateur) et profil du vendeur demandé. */
async function ready(page, name) {
  const desktopLayout = (page.viewportSize()?.width ?? 0) >= 1024;
  await page.waitForSelector(desktopLayout ? '.dl .dl-price-value' : '.header-card .hc-price-value');
  await page.waitForLoadState('networkidle');
  const isReady = await page.evaluate(() => document.body.classList.contains('page-listing-ready'));
  if (!isReady) problems.push(`${name}: la page n'a pas la classe page-listing-ready`);
}

/** Contrôles communs : textes vides ou faux, débordements, barres masquées. */
async function common(page, name, { phone }) {
  const issues = await page.evaluate((phone) => {
    const found = [];
    const text = document.body.innerText;
    for (const bad of ['NaN', 'undefined', 'null', 'Infinity', '[object']) if (text.includes(bad)) found.push(`le texte « ${bad} » est affiché`);
    if (document.documentElement.scrollWidth > window.innerWidth + 1) found.push(`la page déborde en largeur (${document.documentElement.scrollWidth} px pour ${window.innerWidth} px)`);
    const boxes = '.spec-banner-col, .spec-value-box, .spec-bar-line, .spec-total, .spec-segments, .spec-result-head, .spec-kpis li, .hc-fact, .hc-price, .feature-row, .origin-row, .features-column, .publisher-head, .visit-text, .action-bar-item, .full-map-text'
      + ', .dl-head-text, .dl-tool, .dl-price-line, .dl-fact dd, .dl-fact dt, .dl-visit-text, .dl-pill, .dl-pill-wide, .dl-seller-text, .dl-button';
    for (const el of document.querySelectorAll(boxes)) {
      if (el.scrollWidth > el.clientWidth + 1) found.push(`débordement dans .${el.className.split(' ').join('.')} : « ${el.textContent.trim().slice(0, 70)} »`);
    }
    const tabbar = document.querySelector('.tabbar');
    if (tabbar && getComputedStyle(tabbar).display !== 'none') found.push('la barre d’onglets du site est visible sur la fiche');
    const bar = document.querySelector('.action-bar');
    if (phone) {
      if (!bar) found.push('pas de barre d’actions');
      else {
        const box = bar.querySelector('.action-bar-capsule').getBoundingClientRect();
        if (getComputedStyle(bar).position !== 'fixed' || box.bottom > window.innerHeight || box.bottom < window.innerHeight - 80) found.push(`barre d’actions mal placée (bas à ${Math.round(box.bottom)} px)`);
      }
    } else {
      // Ordinateur : pas de barre d'actions du téléphone ; la colonne de droite reste visible pendant le défilement.
      if (bar) found.push('la barre d’actions du téléphone est affichée sur ordinateur');
      const aside = document.querySelector('.dl-aside');
      if (!aside) found.push('pas de colonne de droite');
      else if (getComputedStyle(aside).position !== 'sticky') found.push('la colonne de droite ne reste pas visible au défilement');
      if (document.querySelector('.gallery-actions, .gallery-back')) found.push('retour, partage ou cœur posés sur la photo');
    }
    for (const img of document.querySelectorAll('img.photo')) if (img.complete && img.naturalWidth === 0) found.push(`photo non chargée ${img.src}`);
    return found;
  }, phone);
  for (const issue of issues) problems.push(`${name}: ${issue}`);
}

async function dialogTitle(page) {
  await page.waitForSelector('dialog[open] .alert-body h2');
  return page.textContent('dialog[open] .alert-body h2');
}

async function closeAlert(page) {
  await page.click('dialog[open] .alert-actions .btn >> nth=-1');
  await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached' });
}

/** Textes d'une ligne : coupés par « … » seulement après avoir rapetissé (minimumScaleFactor de l'app). Rend le nombre de textes réduits. */
async function fitted(page, name) {
  const { cut, shrunk } = await page.evaluate(() => {
    const items = [...document.querySelectorAll('[data-fit]')];
    return {
      cut: items.filter((el) => el.scrollWidth > el.clientWidth + 1 && !el.style.fontSize).map((el) => el.textContent.trim().slice(0, 60)),
      shrunk: items.filter((el) => el.style.fontSize).length,
    };
  });
  for (const text of cut) problems.push(`${name}: « ${text} » est coupé sans avoir rapetissé`);
  return shrunk;
}

/** Capture d'une partie de la fiche sans la barre d'actions, qui flotte sinon au milieu de l'image. */
async function partShot(page, selector, file) {
  await page.$eval('.action-bar', (bar) => { bar.style.visibility = 'hidden'; });
  await page.locator(selector).screenshot({ path: join(out, file) });
  await page.$eval('.action-bar', (bar) => { bar.style.visibility = ''; });
}

/** Mini carte, carte plein écran, vue satellite, recentrage et itinéraire. */
async function checkMap(page, name, { coordinate, approximate, shots }) {
  const section = page.locator('section[aria-labelledby="localisation"]');
  await section.scrollIntoViewIfNeeded();
  await page.waitForSelector('.mini-map .location-map-canvas[data-ready="oui"]', { timeout: 20000 });
  await page.waitForSelector(approximate ? '.mini-map .map-circle' : '.mini-map .map-house');
  await page.waitForTimeout(300);
  if (shots) await section.screenshot({ path: join(out, `${name}-localisation.png`) });
  const opened = Date.now();
  await page.click('section[aria-labelledby="localisation"] .btn-light');
  try {
    await page.waitForSelector('dialog.map-dialog[open] .location-map-canvas[data-ready="oui"]', { timeout: 20000 });
  } catch (error) {
    const state = await page.evaluate(async () => {
      // Images dessinées en une demi-seconde : 0 si la page ne rend plus rien.
      const frames = await new Promise((resolve) => {
        let count = 0;
        const start = performance.now();
        const tick = () => { count += 1; if (performance.now() - start < 500) requestAnimationFrame(tick); else resolve(count); };
        requestAnimationFrame(tick);
      });
      return {
        visibility: document.visibilityState,
        frames,
        dialogs: [...document.querySelectorAll('dialog')].map((d) => `${d.className}:${d.open}`),
        maps: [...document.querySelectorAll('.location-map-canvas')].map((el) => {
          const canvas = el.querySelector('canvas');
          const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
          return `${el.dataset.ready} ${el.clientWidth}x${el.clientHeight} canvas=${canvas?.width} perdu=${gl ? gl.isContextLost() : '?'}`;
        }),
        failed: document.querySelectorAll('.map-failed').length,
      };
    });
    await page.screenshot({ path: join(out, `${name}-carte-echec.png`) });
    const waiting = [...pending].filter(([, t]) => t >= opened && Date.now() - t > 3000).map(([r]) => `${r.method()} ${r.url().slice(0, 140)}`);
    const failures = failedRequests.filter((f) => f.at >= opened).map((f) => f.text);
    const notes = (webglNotes.get(page) ?? []).slice(-4);
    throw new Error(`carte plein écran pas prête : ${JSON.stringify(state)} ; demandes en attente : ${waiting.join(' | ') || 'aucune'} ; ratées : ${failures.join(' | ') || 'aucune'} ; WebGL : ${notes.join(' | ') || 'rien'}`);
  }
  await page.waitForTimeout(500);
  expect(name, 'mentions de la carte', await page.textContent('dialog.map-dialog[open] .full-map-bottom .map-attribution'), '© OpenMapTiles © OpenStreetMap');
  if (shots) await page.screenshot({ path: join(out, `${name}-carte.png`) });
  await page.click('dialog.map-dialog[open] [aria-label="Vue satellite"]');
  await page.waitForSelector('dialog.map-dialog[open] [aria-label="Vue plan"][aria-pressed="true"]');
  await page.waitForTimeout(800);
  expect(name, 'mentions de la vue satellite', await page.textContent('dialog.map-dialog[open] .full-map-bottom .map-attribution'), '© IGN – Géoplateforme © OpenStreetMap');
  if (shots) await page.screenshot({ path: join(out, `${name}-carte-satellite.png`) });
  await page.click('dialog.map-dialog[open] [aria-label="Recentrer sur le bien"]');
  await page.click('dialog.map-dialog[open] .full-map-card .btn-primary');
  expect(name, 'titre de la fenêtre', await dialogTitle(page), 'Itinéraire');
  const point = `${coordinate[0].toFixed(6)},${coordinate[1].toFixed(6)}`;
  const links = await page.$$eval('dialog.alert-dialog[open] a', (as) => as.map((a) => [a.textContent, a.getAttribute('href'), a.target]));
  expect(name, 'liens d’itinéraire', JSON.stringify(links), JSON.stringify([
    ['Google Maps', `https://www.google.com/maps/dir/?api=1&destination=${point}`, '_blank'],
    ['Plans d’Apple', `https://maps.apple.com/?daddr=${point}`, '_blank'],
    ['Waze', `https://waze.com/ul?ll=${point}&navigate=yes`, '_blank'],
  ]));
  expect(name, 'message d’itinéraire', await page.textContent('dialog.alert-dialog[open] .alert-body p'),
    approximate ? 'Le vendeur n\'indique que le quartier : l\'itinéraire mène au centre de la zone.' : 'L\'itinéraire mène au point indiqué sur l\'annonce.');
  if (shots) await page.screenshot({ path: join(out, `${name}-itineraire.png`) });
  await page.click('dialog.alert-dialog[open] .btn-quiet');
  await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached' });
  await page.click('dialog.map-dialog[open] [aria-label="Retour"]');
  await page.waitForSelector('dialog.map-dialog[open]', { state: 'detached' });
}

/** Une valeur du simulateur change quand on touche un autre choix du groupe (le premier qui n'est pas choisi). */
async function checkSegment(page, name, { group, result }) {
  const before = await page.textContent(result);
  const option = await page.evaluate((group) => {
    const button = [...document.querySelectorAll(`.spec-segments[aria-label="${group}"] .spec-segment`)].find((b) => b.getAttribute('aria-pressed') !== 'true');
    button?.click();
    return button?.textContent ?? null;
  }, group);
  if (option === null) {
    problems.push(`${name}: pas de choix « ${group} »`);
    return;
  }
  await page.waitForFunction(({ group, option }) => [...document.querySelectorAll(`.spec-segments[aria-label="${group}"] .spec-segment`)]
    .some((b) => b.textContent === option && b.getAttribute('aria-pressed') === 'true'), { group, option });
  const after = await page.textContent(result);
  if (before === after) problems.push(`${name}: « ${group} : ${option} » ne change pas « ${before} »`);
}

async function checkStates(context, suffix) {
  for (const [path, title, status, expectedStatus] of [
    ['/annonce/', 'Annonce introuvable', 'introuvable', null],
    ['/annonce/?id=abc', 'Annonce introuvable', 'introuvable-id', null],
    [`/annonce/?id=${UNKNOWN}`, 'Annonce introuvable', 'inconnue', null],
    [`/annonce/?id=${BROKEN}`, 'Annonce indisponible', 'erreur', 500],
  ]) {
    const name = `${status}-${suffix}`;
    const page = await open(context, path, name, { expectedStatus });
    await page.waitForSelector('.listing-state h1');
    expect(name, 'titre', await page.textContent('.listing-state h1'), title);
    expect(name, 'titre de la page', await page.title(), `${title} · Nidalo`);
    if (status === 'erreur') {
      const count = brokenRequests;
      await page.click('.listing-state .btn');
      for (let i = 0; i < 30 && brokenRequests <= count; i += 1) await page.waitForTimeout(100);
      await page.waitForSelector('.listing-state h1');
      await page.waitForLoadState('networkidle');
      if (brokenRequests <= count) problems.push(`${name}: « Réessayer » ne redemande pas l'annonce`);
    }
    if (status !== 'introuvable-id') await page.screenshot({ path: join(out, `${name}.png`) });
    await page.close();
  }
}

/** Sans compte, l'action ouvre d'abord la connexion du site (requireAccount), qu'on referme. */
async function expectSignIn(page, name, what, selector) {
  await page.click(selector);
  try {
    await page.waitForSelector('dialog.signin-sheet[open] .signin-card', { timeout: 5000 });
  } catch {
    problems.push(`${name}: « ${what} » n'ouvre pas la connexion`);
    return;
  }
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.signin-sheet[open]', { state: 'detached' });
}

/**
 * Mesures de la fiche sur ordinateur (maquette 2, à 1440 px) : contenu de 1200 px au plus, galerie de 466 px (la grande
 * photo sur les deux tiers, deux photos l'une sur l'autre ; une seule en dessous de trois photos), colonne de droite de
 * 380 px, titre en 36, prix en 40, boutons de 48 px.
 */
async function checkDesktopLayout(page, name) {
  const width = page.viewportSize().width;
  const m = await page.evaluate(() => {
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
    const one = (selector) => { const el = document.querySelector(selector); return el ? rect(el) : null; };
    const style = (selector) => { const el = document.querySelector(selector); return el ? getComputedStyle(el) : null; };
    return {
      inner: one('.dl-inner'), gallery: one('.dl .gallery'), aside: one('.dl-aside'), main: one('.dl-main'),
      pages: [...document.querySelectorAll('.dl .gallery-page')].filter((el) => getComputedStyle(el).display !== 'none').map(rect),
      photos: document.querySelectorAll('.dl .gallery-page').length,
      title: style('.dl-title')?.fontSize, price: style('.dl-price-value')?.fontSize, priceWeight: style('.dl-price-value')?.fontWeight,
      buttons: [...document.querySelectorAll('.dl-actions .dl-button')].map((el) => Math.round(el.getBoundingClientRect().height)),
    };
  });
  const content = Math.min(1200, width - 2 * (width >= 1280 ? 48 : 32));
  if (!m.inner || Math.abs(m.inner.w - content) > 1 || Math.abs(m.inner.x - (width - content) / 2) > 1) problems.push(`${name}: contenu ${JSON.stringify(m.inner)} au lieu de ${content} px centrés`);
  if (!m.gallery || Math.abs(m.gallery.h - 466) > 1) problems.push(`${name}: galerie de ${m.gallery?.h} px de haut au lieu de 466`);
  if (!m.aside || m.aside.w !== 380) problems.push(`${name}: colonne de droite de ${m.aside?.w} px au lieu de 380`);
  const gap = width >= 1280 ? 40 : 32;
  if (m.main && m.aside && Math.abs(m.aside.x - (m.main.x + m.main.w) - gap) > 1) problems.push(`${name}: ${Math.round(m.aside.x - m.main.x - m.main.w)} px entre les colonnes au lieu de ${gap}`);
  expect(name, 'taille du titre', m.title, '36px');
  expect(name, 'taille du prix', `${m.price} ${m.priceWeight}`, '40px 800');
  if (m.buttons.some((h) => h !== 48)) problems.push(`${name}: boutons de ${m.buttons.join(', ')} px au lieu de 48`);
  if (m.gallery && m.photos >= 3) {
    const [big, top, bottom] = m.pages;
    const third = (m.gallery.w - 10) / 3;
    if (m.pages.length !== 3 || Math.abs(big.w - 2 * third) > 1.5 || Math.abs(big.h - 466) > 1 || Math.abs(top.w - third) > 1.5 || Math.abs(top.h - 228) > 1 || Math.abs(bottom.h - 228) > 1) {
      problems.push(`${name}: galerie ${JSON.stringify(m.pages)} au lieu d'une photo sur les deux tiers et deux de 228 px`);
    }
  } else if (m.gallery && (m.pages.length !== 1 || Math.abs(m.pages[0].w - m.gallery.w) > 1)) {
    problems.push(`${name}: avec ${m.photos} photo(s), ${m.pages.length} photo(s) affichée(s) ${JSON.stringify(m.pages)} au lieu d'une sur toute la largeur`);
  }
}

/** Écran de la colonne de 640 px (offre, visite, comparaison) : textes, débordements, colonne centrée de 640 px. */
async function checkColumn(page, name, selector) {
  const issues = await page.evaluate((selector) => {
    const found = [];
    for (const bad of ['NaN', 'undefined', 'null', 'Infinity', '[object']) if (document.body.innerText.includes(bad)) found.push(`le texte « ${bad} » est affiché`);
    if (document.documentElement.scrollWidth > window.innerWidth + 1) found.push(`la page déborde en largeur (${document.documentElement.scrollWidth} px pour ${window.innerWidth} px)`);
    const column = document.querySelector(selector);
    if (!column) return [...found, `pas de ${selector}`];
    const box = column.getBoundingClientRect();
    const style = getComputedStyle(column);
    const inner = Math.round(box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    if (inner !== 640) found.push(`colonne de ${inner} px au lieu de 640`);
    if (Math.abs(box.left + box.width / 2 - document.documentElement.clientWidth / 2) > 1) found.push('colonne décentrée');
    for (const el of column.querySelectorAll('button, a, .dl-label, .dl-visit-listing-text > *, .cmp-value-text, .cmp-city')) {
      if (el.scrollWidth > el.clientWidth + 1) found.push(`débordement dans ${el.tagName.toLowerCase()}.${el.className} : « ${el.textContent.trim().slice(0, 60)} »`);
    }
    return found;
  }, selector);
  for (const issue of issues) problems.push(`${name}: ${issue}`);
}

/** Attend l'adresse ; sinon note l'adresse, le message affiché et une capture, puis arrête la vérification. */
async function waitForAddress(page, url, timeout = 10000) {
  try {
    await page.waitForURL(url, { timeout });
  } catch {
    const shown = await page.evaluate(() => [...document.querySelectorAll('.dl-error, [role="alert"], dialog[open] h2')].map((el) => el.textContent).join(' | ')).catch(() => '?');
    await page.screenshot({ path: join(out, 'adresse-echec.png') }).catch(() => undefined);
    throw new Error(`adresse ${page.url()} au lieu de ${url} ; message affiché : ${shown || 'aucun'} (capture adresse-echec.png)`);
  }
}

/**
 * Capture de toute la page en gardant sa largeur : la fenêtre est agrandie à la hauteur de la page le temps de la
 * capture. La capture « fullPage » de Chromium change un instant la largeur (sous 1024 px avec deviceScaleFactor 2) :
 * la page repasse alors en mise en page téléphone et un écran ouvert (offre, visite) repart de zéro.
 */
async function fullShot(page, file) {
  const viewport = page.viewportSize();
  const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
  await page.setViewportSize({ width: viewport.width, height: Math.max(height, viewport.height) });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(out, file) });
  await page.setViewportSize(viewport);
  await page.waitForTimeout(100);
}

/** Rien de l'adresse masquée (la rue) dans la page, ni dans le texte ni dans le code. */
async function checkHiddenStreet(page, name) {
  const found = await page.evaluate((street) => document.documentElement.outerHTML.includes(street) || document.title.includes(street), HIDDEN_STREET);
  if (found) problems.push(`${name}: la rue d'une adresse masquée est affichée`);
}

const browser = await chromium.launch();
/** Navigateur des écrans du compte sur ordinateur, lancé après les étapes du téléphone (voir plus bas). */
let frenchBrowser = null;
try {
  // ——— Ordinateur ———
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'] });
  await mock(desktop);

  // Depuis la recherche : « Retour à la recherche » revient à la même recherche.
  let page = await open(desktop, '/recherche/?mode=buy', 'depuis-recherche');
  await page.waitForSelector('.listing-card');
  const card = page.locator(`.listing-card a.stretched[href="/annonce/?id=${SALE}"]`);
  if (await card.count()) await card.first().click();
  else {
    problems.push('depuis-recherche: aucun lien vers la fiche de la vente dans les résultats');
    await page.evaluate((target) => { location.href = `/annonce/?id=${target}`; }, SALE);
  }
  await ready(page, 'depuis-recherche');
  expect('depuis-recherche', 'lien de retour', await page.textContent('.listing-back-link'), 'Retour à la recherche');
  await page.click('.listing-back-link');
  await page.waitForURL(/\/recherche\/\?mode=buy/);
  await page.close();

  // Vente : en-tête, galerie, visionneuse, colonne de droite, fenêtres, partage, carte. Sans compte, ce qui demande un
  // compte (offre, message, visite, favori) ouvre d'abord la connexion du site.
  page = await open(desktop, `/annonce/?id=${SALE}`, 'vente-ordinateur');
  await ready(page, 'vente-ordinateur');
  await common(page, 'vente-ordinateur', { phone: false });
  await checkDesktopLayout(page, 'vente-ordinateur');
  expect('vente-ordinateur', 'titre de la page', await page.title(), 'Appartement lumineux avec balcon à Lyon 3e · Nidalo');
  expect('vente-ordinateur', 'lien de retour', await page.textContent('.listing-back-link'), 'Chercher un bien');
  expect('vente-ordinateur', 'adresse du retour', await page.getAttribute('.listing-back-link', 'href'), '/recherche/');
  expect('vente-ordinateur', 'catégorie', await page.textContent('.dl-category'), 'VENTE');
  expect('vente-ordinateur', 'titre', await page.textContent('h1.dl-title'), 'Appartement lumineux avec balcon');
  expect('vente-ordinateur', 'lieu', await page.textContent('.dl-place'), 'Lyon 3e (69003)');
  expect('vente-ordinateur', 'outils', await page.$$eval('.dl-tools .dl-tool', (els) => els.map((el) => el.textContent.trim()).join(' | ')), 'Partager | Enregistrer | Comparer');
  expect('vente-ordinateur', 'interlocuteur', await page.textContent('.publisher-head'), /Claire E\..*Particulier.*Sur Nidalo depuis mars 2025.*1 annonce en ligne/);
  expect('vente-ordinateur', 'vendeur de la colonne', await page.textContent('.dl-aside .dl-seller-text'), /^Claire E\.\s*Particulier\s*Sur Nidalo depuis mars 2025$/);
  expect('vente-ordinateur', 'boutons de la colonne', await page.$$eval('.dl-aside .dl-button', (els) => els.map((el) => el.textContent.trim()).join(' | ')), 'Envoyer un message | Demander une visite | Appeler');
  expect('vente-ordinateur', 'offre', await page.textContent('.dl-aside .dl-offer'), 'Faire une offre');
  await page.screenshot({ path: join(out, 'vente-ordinateur.png') });
  await page.screenshot({ path: join(out, 'vente-ordinateur-long.png'), fullPage: true });
  await page.click('.gallery-page >> nth=0');
  await page.waitForSelector('dialog.viewer-dialog[open]');
  expect('vente-ordinateur', 'compteur de la visionneuse', await page.textContent('.viewer-counter'), '1/2');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.viewer-counter')?.textContent === '2/2');
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(out, 'vente-ordinateur-visionneuse.png') });
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.viewer-dialog[open]', { state: 'detached' });
  await page.click('.gallery-all');
  await page.waitForSelector('dialog.viewer-dialog[open]');
  expect('vente-ordinateur', '« Voir les photos » ouvre la première', await page.textContent('.viewer-counter'), '1/2');
  await page.click('.viewer-close');
  await page.waitForSelector('dialog.viewer-dialog[open]', { state: 'detached' });
  await expectSignIn(page, 'vente-ordinateur', 'Faire une offre', '.dl-aside .dl-offer');
  await page.click('.dl-aside .dl-call');
  expect('vente-ordinateur', 'fenêtre du téléphone', await dialogTitle(page), 'Numéro non disponible');
  expect('vente-ordinateur', 'message sans numéro', await page.textContent('dialog[open] .alert-body p'), 'Ce vendeur ne communique pas son numéro. Écrivez-lui sur Nidalo.');
  await page.screenshot({ path: join(out, 'vente-ordinateur-sans-numero.png') });
  await closeAlert(page);
  await page.click('.dl-aside .dl-call');
  await dialogTitle(page);
  // « Envoyer un message » de la fenêtre : la même action que le bouton, donc la connexion d'abord.
  await expectSignIn(page, 'vente-ordinateur', 'Envoyer un message (fenêtre sans numéro)', 'dialog[open] .alert-actions .btn-primary');
  await expectSignIn(page, 'vente-ordinateur', 'Envoyer un message', '.dl-aside .dl-message');
  await page.click('.dl-aside .dl-visit');
  await page.waitForSelector('dialog.signin-sheet[open] .signin-card', { timeout: 5000 }).catch(() => problems.push('vente-ordinateur: « Demander une visite » n\'ouvre pas la connexion'));
  await page.screenshot({ path: join(out, 'vente-ordinateur-connexion.png') });
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.signin-sheet[open]', { state: 'detached' });
  if (page.url() !== `${base}/annonce/?id=${SALE}`) problems.push(`vente-ordinateur: adresse ${page.url()} après la connexion refermée`);
  await expectSignIn(page, 'vente-ordinateur', 'Enregistrer', '.dl-tools .dl-save');
  await page.click('.dl-tools .dl-share');
  await page.waitForSelector('.dl-toast.is-shown');
  expect('vente-ordinateur', 'message du partage', await page.textContent('.dl-toast'), 'Lien de l’annonce copié');
  expect('vente-ordinateur', 'lien copié', await page.evaluate(() => navigator.clipboard.readText()), `${base}/annonce/?id=${SALE}`);
  await page.waitForSelector('.dl-toast-box', { state: 'detached', timeout: 6000 }).catch(() => problems.push('vente-ordinateur: le message du partage ne disparaît pas'));
  await checkMap(page, 'vente-ordinateur', { coordinate: [45.7597, 4.8491], approximate: true, shots: true });
  await page.close();

  // Adresse d'un écran ouverte sans compte : la fiche, puis la connexion (l'écran s'ouvrira une fois connecté).
  for (const view of ['visite', 'offre']) {
    const name = `adresse-${view}-sans-compte`;
    page = await open(desktop, `/annonce/?id=${SALE}&vue=${view}`, name);
    await ready(page, name);
    await page.waitForSelector('dialog.signin-sheet[open] .signin-card', { timeout: 5000 }).catch(() => problems.push(`${name}: la connexion ne s'ouvre pas`));
    expect(name, 'adresse', page.url(), `${base}/annonce/?id=${SALE}`);
    if (await page.$('.dl-screen')) problems.push(`${name}: l'écran s'affiche sans compte`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog.signin-sheet[open]', { state: 'detached' });
    await page.close();
  }

  // Partage du navigateur (Web Share) : le texte de l'app (ListingShare), le lien de la page, jamais la rue masquée.
  page = await open(desktop, `/annonce/?id=${FICHE}`, 'partage-ordinateur', {
    init: () => {
      Object.defineProperty(navigator, 'share', { value: (data) => { window.sharedData = data; return Promise.resolve(); }, configurable: true });
    },
  });
  await ready(page, 'partage-ordinateur');
  await common(page, 'partage-ordinateur', { phone: false });
  await checkDesktopLayout(page, 'partage-ordinateur');
  await checkHiddenStreet(page, 'partage-ordinateur');
  // Sans compte, le serveur ne donne pas le numéro de l'agence : « Appeler » ouvre la fenêtre sans numéro.
  if (await page.$('a.dl-call')) problems.push('partage-ordinateur: un numéro est affiché sans compte');
  await page.click('.dl-tools .dl-share');
  await page.waitForFunction(() => !!window.sharedData);
  // Espaces insécables des nombres (Intl) ramenées à des espaces simples pour la comparaison.
  const shared = await page.evaluate(() => Object.fromEntries(Object.entries(window.sharedData).map(([key, value]) => [key, String(value).replace(/[  ]/g, ' ')])));
  expectJSON('partage-ordinateur', 'partage', shared, {
    title: 'Appartement 3 pièces à Lyon 2e · 238 000 €',
    text: 'Appartement 3 pièces · Lyon 2e (69002)\n238 000 € · 62 m² · 3 pièces\nÀ voir sur Nidalo',
    url: `${base}/annonce/?id=${FICHE}`,
  });
  if (await page.$('.dl-toast.is-shown')) problems.push('partage-ordinateur: le lien est copié alors que le navigateur a partagé');
  await page.click('.gallery-all');
  await page.waitForSelector('dialog.viewer-dialog[open]');
  expect('partage-ordinateur', 'compteur de « Voir les 3 photos »', await page.textContent('.viewer-counter'), '1/3');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.viewer-dialog[open]', { state: 'detached' });
  await page.click('.gallery-page >> nth=2');
  await page.waitForSelector('dialog.viewer-dialog[open]');
  expect('partage-ordinateur', 'compteur de la troisième photo', await page.textContent('.viewer-counter'), '3/3');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.viewer-dialog[open]', { state: 'detached' });
  await page.close();

  // Vente louée en mode investissement : carte « Rentabilité » et simulateur de financement.
  page = await open(desktop, `/annonce/?id=${LEASED}&mode=invest`, 'investissement-ordinateur');
  await ready(page, 'investissement-ordinateur');
  await common(page, 'investissement-ordinateur', { phone: false });
  await checkDesktopLayout(page, 'investissement-ordinateur');
  await page.waitForSelector('.dl-main .spec-card');
  expect('investissement-ordinateur', 'catégorie', await page.textContent('.dl-category'), 'INVESTISSEMENT LOCATIF');
  expect('investissement-ordinateur', 'titre de la carte', await page.textContent('.dl-main .spec-card .spec-header h2'), 'Rentabilité');
  expect('investissement-ordinateur', 'interlocuteur', await page.textContent('.publisher-head'), /Agence Démo Immobilier.*PRO.*Votre contact : Paul Démo.*Lyon \(69002\).*2 annonces en ligne/);
  expect('investissement-ordinateur', 'agence de la colonne', await page.textContent('.dl-aside .dl-seller-text'), /^Agence Démo Immobilier\s*PRO\s*Votre contact : Paul Démo$/);
  await page.screenshot({ path: join(out, 'investissement-ordinateur-long.png'), fullPage: true });
  await checkSegment(page, 'investissement-ordinateur', { group: 'Durée', result: '.spec-simulator .spec-result-value' });
  await checkSegment(page, 'investissement-ordinateur', { group: 'Apport', result: '.spec-total-amount' });
  await expectSignIn(page, 'investissement-ordinateur', 'Envoyer un message (agence)', '.dl-aside .dl-message');
  await page.close();

  // Location meublée, adresse exacte, sans photo.
  page = await open(desktop, `/annonce/?id=${RENTAL}`, 'location-ordinateur');
  await ready(page, 'location-ordinateur');
  await common(page, 'location-ordinateur', { phone: false });
  await checkDesktopLayout(page, 'location-ordinateur');
  if (!(await page.$('.gallery-empty'))) problems.push('location-ordinateur: la galerie vide n’est pas affichée');
  if (await page.$('.dl-offer')) problems.push('location-ordinateur: « Faire une offre » sur une location');
  expect('location-ordinateur', 'catégorie', await page.textContent('.dl-category'), 'LOCATION');
  expect('location-ordinateur', 'loyer', `${await page.textContent('.dl-price-value')} ${await page.textContent('.dl-price-secondary')}`, '640 € /mois hors charges');
  expect('location-ordinateur', 'titre de la carte', await page.textContent('.dl-main .spec-card .spec-header h2'), 'Coût de la location');
  expect('location-ordinateur', 'interlocuteur sans profil', await page.textContent('.publisher-head'), /Particulier/);
  await page.screenshot({ path: join(out, 'location-ordinateur-long.png'), fullPage: true });
  await checkSegment(page, 'location-ordinateur', { group: 'Revenus', result: '.spec-simulator .spec-result-value' });
  await checkMap(page, 'location-ordinateur', { coordinate: [45.7485, 4.8412], approximate: false, shots: true });
  await page.close();

  // Hôtel : indicateurs, capacité d'emprunt, mosaïque de trois photos.
  page = await open(desktop, `/annonce/?id=${HOTEL}`, 'hotel-ordinateur');
  await ready(page, 'hotel-ordinateur');
  await common(page, 'hotel-ordinateur', { phone: false });
  await checkDesktopLayout(page, 'hotel-ordinateur');
  expect('hotel-ordinateur', 'catégorie', await page.textContent('.dl-category'), 'HÔTEL');
  if (!(await page.$('.gallery-many'))) problems.push('hotel-ordinateur: la mosaïque de photos n’est pas affichée');
  if (!(await page.$('.spec-banner-hotel'))) problems.push('hotel-ordinateur: pas de bandeau de rentabilité hôtelière');
  await page.screenshot({ path: join(out, 'hotel-ordinateur.png') });
  await page.screenshot({ path: join(out, 'hotel-ordinateur-long.png'), fullPage: true });
  await checkSegment(page, 'hotel-ordinateur', { group: 'Durée', result: 'section[aria-labelledby="financement-hotel"] .spec-result-value' });
  await page.close();

  // Maison non louée avec un loyer potentiel : points d'attention.
  page = await open(desktop, `/annonce/?id=${HOUSE}&mode=invest`, 'maison-ordinateur');
  await ready(page, 'maison-ordinateur');
  await common(page, 'maison-ordinateur', { phone: false });
  const notes = await page.$$eval('.spec-note p', (ps) => ps.map((p) => p.textContent));
  if (!notes.some((n) => n.includes('pas loué actuellement'))) problems.push(`maison-ordinateur: pas de note sur le loyer potentiel (${notes.join(' | ')})`);
  if (!notes.some((n) => n.startsWith('DPE F'))) problems.push(`maison-ordinateur: pas de note sur le DPE F (${notes.join(' | ')})`);
  await page.screenshot({ path: join(out, 'maison-ordinateur-long.png'), fullPage: true });
  await page.close();

  // Description des tuiles du plan indisponible : les deux cartes s'affichent quand même (fond et repère). Sans le
  // dessin relancé après l'erreur, la carte plein écran restait une fois sur deux sans « load ».
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const name = `plan-indisponible-${attempt}`;
    page = await open(desktop, `/annonce/?id=${SALE}`, name, {
      expectedStatus: 503,
      before: (p) => p.route('https://tiles.openfreemap.org/planet', (route) => route.fulfill({ status: 503, headers: cors, body: '' })),
    });
    await ready(page, name);
    await page.locator('section[aria-labelledby="localisation"]').scrollIntoViewIfNeeded();
    await page.waitForSelector('.mini-map .location-map-canvas[data-ready="oui"]', { timeout: 20000 });
    await page.click('section[aria-labelledby="localisation"] .btn-light');
    await page.waitForSelector('dialog.map-dialog[open] .location-map-canvas[data-ready="oui"]', { timeout: 20000 });
    await page.close();
  }

  await checkStates(desktop, 'ordinateur');
  await desktop.close();

  // ——— Téléphone ———
  const phone = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  await mock(phone);

  page = await open(phone, `/annonce/?id=${SALE}`, 'vente-telephone');
  await ready(page, 'vente-telephone');
  await common(page, 'vente-telephone', { phone: true });
  await fitted(page, 'vente-telephone');
  await page.screenshot({ path: join(out, 'vente-telephone.png') });
  await page.screenshot({ path: join(out, 'vente-telephone-long.png'), fullPage: true });
  await page.$eval('.gallery-strip', (strip) => strip.scrollTo({ left: strip.clientWidth }));
  await page.waitForFunction(() => document.querySelector('.gallery-counter')?.textContent === '2/2');
  await page.tap('.gallery-page >> nth=1');
  await page.waitForSelector('dialog.viewer-dialog[open]');
  await page.waitForTimeout(400);
  expect('vente-telephone', 'compteur de la visionneuse', await page.textContent('.viewer-counter'), '2/2');
  await page.screenshot({ path: join(out, 'vente-telephone-visionneuse.png') });
  await page.tap('.viewer-close');
  await page.waitForSelector('dialog.viewer-dialog[open]', { state: 'detached' });
  await page.tap('.action-bar-item >> nth=1');
  expect('vente-telephone', 'fenêtre de la visite', await dialogTitle(page), 'Demander une visite');
  await page.screenshot({ path: join(out, 'vente-telephone-visite.png') });
  await closeAlert(page);
  await checkMap(page, 'vente-telephone', { coordinate: [45.7597, 4.8491], approximate: true, shots: true });
  await page.close();

  page = await open(phone, `/annonce/?id=${LEASED}&mode=invest`, 'investissement-telephone');
  await ready(page, 'investissement-telephone');
  await common(page, 'investissement-telephone', { phone: true });
  await fitted(page, 'investissement-telephone');
  await page.screenshot({ path: join(out, 'investissement-telephone.png') });
  await page.screenshot({ path: join(out, 'investissement-telephone-long.png'), fullPage: true });
  await partShot(page, '.listing-category', 'investissement-telephone-carte.png');
  await page.close();

  // Partage sans Web Share ni presse-papiers : la fenêtre avec le lien à copier.
  page = await open(phone, `/annonce/?id=${RENTAL}`, 'location-telephone', {
    init: () => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new DOMException('Refusé', 'NotAllowedError')) }, configurable: true });
    },
  });
  await ready(page, 'location-telephone');
  await common(page, 'location-telephone', { phone: true });
  await fitted(page, 'location-telephone');
  await page.screenshot({ path: join(out, 'location-telephone.png') });
  await page.screenshot({ path: join(out, 'location-telephone-long.png'), fullPage: true });
  await page.tap('.gallery-action[aria-label="Partager l\'annonce"]');
  expect('location-telephone', 'fenêtre du partage', await dialogTitle(page), 'Partager l’annonce');
  expect('location-telephone', 'lien à copier', await page.inputValue('dialog[open] input.copy-link'), `${base}/annonce/?id=${RENTAL}`);
  await page.screenshot({ path: join(out, 'location-telephone-partage.png') });
  await closeAlert(page);
  await page.close();

  page = await open(phone, `/annonce/?id=${HOTEL}`, 'hotel-telephone');
  await ready(page, 'hotel-telephone');
  await common(page, 'hotel-telephone', { phone: true });
  await fitted(page, 'hotel-telephone');
  await page.screenshot({ path: join(out, 'hotel-telephone.png') });
  await page.screenshot({ path: join(out, 'hotel-telephone-long.png'), fullPage: true });
  await partShot(page, '.listing-category', 'hotel-telephone-cartes.png');
  await page.close();

  page = await open(phone, `/annonce/?id=${HOUSE}&mode=invest`, 'maison-telephone');
  await ready(page, 'maison-telephone');
  await common(page, 'maison-telephone', { phone: true });
  await fitted(page, 'maison-telephone');
  await page.screenshot({ path: join(out, 'maison-telephone-long.png'), fullPage: true });
  await page.close();

  await checkStates(phone, 'telephone');

  // Écrans faits pour l'ordinateur, ouverts sur téléphone : le message « bientôt » (règle 6 du brief), rien d'autre.
  const accountSoon = 'Bientôt sur le site, avec votre compte Nidalo. En attendant, c’est déjà possible dans l’app Nidalo, avec le même compte.';
  const screenSoon = 'Cet écran arrive bientôt sur le site. En attendant, il est dans l’app Nidalo, avec le même compte.';
  for (const [path, name, title, text] of [
    [`/annonce/?id=${SALE}&vue=visite`, 'ecran-visite-telephone', 'Demander une visite', accountSoon],
    [`/annonce/?id=${SALE}&vue=offre`, 'ecran-offre-telephone', 'Faire une offre', accountSoon],
    ['/comparer/', 'comparer-telephone', 'Comparer', screenSoon],
  ]) {
    page = await open(phone, path, name);
    await page.waitForSelector('.card.state h1');
    expect(name, 'titre', await page.textContent('.card.state h1'), title);
    expect(name, 'message', await page.textContent('.card.state p'), text);
    expect(name, 'titre de la page', await page.title(), `${title} · Nidalo`);
    if (await page.$('.dl, .dl-screen, .cmp, .action-bar')) problems.push(`${name}: autre chose que le message « bientôt »`);
    await page.screenshot({ path: join(out, `${name}.png`) });
    await page.close();
  }
  await phone.close();

  // Petit téléphone (320 px) : les textes d'une ligne rapetissent comme dans l'app au lieu d'être coupés.
  const small = await browser.newContext({ ...devices['iPhone SE'], locale: 'fr-FR' });
  await mock(small);
  for (const [path, name] of [
    [`/annonce/?id=${LEASED}&mode=invest`, 'investissement-petit-telephone'],
    [`/annonce/?id=${RENTAL}`, 'location-petit-telephone'],
    [`/annonce/?id=${HOTEL}`, 'hotel-petit-telephone'],
  ]) {
    page = await open(small, path, name);
    await ready(page, name);
    await common(page, name, { phone: true });
    const shrunk = await fitted(page, name);
    if (name.startsWith('investissement')) expect(name, 'des textes ont rapetissé pour tenir', shrunk > 0, true);
    await page.screenshot({ path: join(out, `${name}.png`) });
    await partShot(page, '.listing-category', `${name}-carte.png`);
    await page.close();
  }
  await small.close();

  // Téléphone avec le compte de test : la fiche ne change pas (fenêtres « bientôt »), rien du compte n'est lu pour elle.
  const phoneMember = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await mock(phoneMember);
  await signIn(phoneMember, seededState());
  page = await open(phoneMember, `/annonce/?id=${FICHE}`, 'fiche-telephone-connecte');
  await ready(page, 'fiche-telephone-connecte');
  await common(page, 'fiche-telephone-connecte', { phone: true });
  await checkHiddenStreet(page, 'fiche-telephone-connecte');
  if (await page.$('.dl')) problems.push('fiche-telephone-connecte: la fiche de l’ordinateur est affichée sur téléphone');
  await page.tap('.action-bar-item >> nth=1');
  expect('fiche-telephone-connecte', 'fenêtre de la visite', await dialogTitle(page), 'Demander une visite');
  await closeAlert(page);
  await page.screenshot({ path: join(out, 'fiche-telephone-connecte.png') });
  await page.close();
  page = await open(phoneMember, `/annonce/?id=${FICHE}&vue=offre`, 'ecran-offre-telephone-connecte');
  await page.waitForSelector('.card.state h1');
  expect('ecran-offre-telephone-connecte', 'titre', await page.textContent('.card.state h1'), 'Faire une offre');
  await page.close();
  await phoneMember.close();

  // ——— Ordinateur avec le compte de test : chaque action envoie au serveur simulé ce qu'envoie l'app ———
  // Après le téléphone, dont les étapes restent dans l'ordre et les conditions d'avant. Navigateur réglé en français :
  // le champ de date s'y affiche « 12/11/2026 » (jour, mois), comme chez un visiteur français ; le navigateur par
  // défaut l'écrit à l'américaine (mois, jour).
  frenchBrowser = await chromium.launch({ env: { ...process.env, LANG: 'fr_FR.UTF-8', LANGUAGE: 'fr_FR:fr', LC_ALL: 'fr_FR.UTF-8' } });
  const member = await frenchBrowser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await mock(member);
  const fresh = accountState();
  await signIn(member, fresh);

  // Fiche d'un autre : ce que l'app lit du compte, la colonne de droite, le numéro de l'agence.
  let mark = calls.length;
  page = await open(member, `/annonce/?id=${FICHE}`, 'fiche-connecte');
  await ready(page, 'fiche-connecte');
  await page.waitForSelector('.dl-aside a.dl-call');
  await common(page, 'fiche-connecte', { phone: false });
  await checkDesktopLayout(page, 'fiche-connecte');
  await checkHiddenStreet(page, 'fiche-connecte');
  for (const table of ['rpc/my_conversations', 'rpc/my_offers', 'rpc/my_visit_requests']) {
    const made = since(mark, table);
    if (!made.length) problems.push(`fiche-connecte: ${table} n'est pas lu`);
    for (const call of made) expectJSON('fiche-connecte', `arguments de ${table}`, call.body, {});
  }
  const agendaRead = once('fiche-connecte', mark, 'agenda_visits');
  if (agendaRead) expect('fiche-connecte', 'colonnes de l’agenda', `${agendaRead.method} ${agendaRead.search}`, 'GET ?select=id,start_at,status,request_id,listing_id,visit');
  expect('fiche-connecte', 'titre de la page', await page.title(), 'Appartement 3 pièces à Lyon 2e · Nidalo');
  expect('fiche-connecte', 'catégorie', await page.textContent('.dl-category'), 'VENTE');
  expect('fiche-connecte', 'lieu', await page.textContent('.dl-place'), 'Lyon 2e (69002)');
  expect('fiche-connecte', 'prix', `${await page.textContent('.dl-price-value')} ${await page.textContent('.dl-price-secondary')}`, '238 000 € 3 839 €/m²');
  expect('fiche-connecte', 'chiffres clés', await page.$$eval('.dl-fact', (els) => els.map((el) => `${el.querySelector('dd').textContent} ${el.querySelector('dt').textContent}`).join(' | ')), '62 m² Surface | 3 Pièces | 2 Chambres | 2e Étage');
  expect('fiche-connecte', 'carte de rentabilité', await page.textContent('.dl-main .spec-card .spec-header h2'), 'Rentabilité');
  expect('fiche-connecte', 'offre', await page.textContent('.dl-aside .dl-offer'), 'Faire une offre');
  expect('fiche-connecte', 'agence de la colonne', await page.textContent('.dl-aside .dl-seller-text'), /^Agence Démo Centre\s*PRO\s*Votre contact : Sophie Démo$/);
  expect('fiche-connecte', 'boutons', await page.$$eval('.dl-aside .dl-button', (els) => els.map((el) => el.textContent.trim()).join(' | ')), 'Envoyer un message | Demander une visite | Appeler');
  expect('fiche-connecte', 'appel', `${await page.getAttribute('.dl-call', 'href')} ${await page.getAttribute('.dl-call', 'title')}`, 'tel:0639984567 Appeler le 06 39 98 45 67');
  expect('fiche-connecte', 'carte des visites', await page.textContent('.dl-main .dl-visit-card'), 'Aucune visite prévueDemandez une visite au vendeur ou à l\'agence.');
  if (await page.$('.dl-aside .dl-pill-wide')) problems.push('fiche-connecte: un état de visite est affiché sans visite ni demande');

  // « Enregistrer » : le favori de l'app (favorites), ajouté puis retiré.
  mark = calls.length;
  await page.click('.dl-tools .dl-save');
  await page.waitForSelector('.dl-tools .dl-save[aria-pressed="true"]');
  const favorite = once('fiche-connecte', mark, 'favorites', (call) => call.method === 'POST');
  if (favorite) {
    expectJSON('fiche-connecte', 'favori ajouté', favorite.body, { listing_id: FICHE });
    expect('fiche-connecte', 'favori sans doublon', favorite.search, '?on_conflict=user_id,listing_id');
  }
  await page.click('.dl-tools .dl-save');
  await page.waitForSelector('.dl-tools .dl-save[aria-pressed="false"]');
  const unfavorite = once('fiche-connecte', mark, 'favorites', (call) => call.method === 'DELETE');
  if (unfavorite) expect('fiche-connecte', 'favori retiré', unfavorite.search, `?listing_id=eq.${FICHE}`);

  // « Faire une offre » : la conversation de l'annonce (créée), les offres relues, puis l'écran de l'offre à son adresse.
  mark = calls.length;
  await page.click('.dl-aside .dl-offer');
  await waitForAddress(page, `${base}/annonce/?id=${FICHE}&vue=offre`);
  await page.waitForSelector('.dl-offer-screen h1');
  const started = once('offre', mark, 'rpc/start_listing_conversation');
  if (started) expectJSON('offre', 'arguments de start_listing_conversation', started.body, { p_listing_id: FICHE });
  const reread = once('offre', mark, 'rpc/my_conversations', (call) => call.body?.p_conversation_id);
  if (reread) expectJSON('offre', 'relecture de la conversation', reread.body, { p_conversation_id: conversationId(1) });
  if (!since(mark, 'rpc/my_offers').length) problems.push('offre: les offres ne sont pas relues avant l\'écran');
  if (since(mark, 'rpc/make_offer').length) problems.push('offre: make_offer appelé avant l\'envoi');
  expect('offre', 'titre', await page.textContent('.dl-offer-screen h1'), 'Faire une offre');
  expect('offre', 'bien et prix', await page.textContent('.dl-offer-screen .dl-screen-head p'), 'Appartement 3 pièces · prix affiché 238 000 €');
  expect('offre', 'titre de la page', await page.title(), 'Faire une offre · Appartement 3 pièces · Nidalo');
  expect('offre', 'champ du montant actif', await page.evaluate(() => document.activeElement?.id), 'offre-montant');
  expect('offre', 'durées', await page.$$eval('.dl-option', (els) => els.map((el) => `${el.textContent}${el.getAttribute('aria-pressed') === 'true' ? '*' : ''}`).join(' | ')), '3 jours | 7 jours* | 14 jours | 30 jours');
  await page.locator('#offre-montant').pressSequentially('228000');
  expect('offre', 'montant saisi', await page.inputValue('#offre-montant'), '228 000');
  expect('offre', 'écart au prix', await page.textContent('#offre-ecart'), '228 000 € · 4,2 % sous le prix affiché');
  await page.click('.dl-offer-screen .dl-chip');
  expect('offre', 'condition du prêt', await page.inputValue('#offre-conditions'), 'Sous réserve d\'obtention du prêt');
  if (await page.$('.dl-offer-screen .dl-chip')) problems.push('offre: la condition du prêt est encore proposée');
  await page.click('.dl-option:has-text("14 jours")');
  await page.waitForSelector('.dl-option[aria-pressed="true"]:has-text("14 jours")');
  await checkColumn(page, 'offre', '.dl-offer-screen');
  await fullShot(page, '2-fiche-offre-1440.png');
  mark = calls.length;
  const offerSentAt = Date.now();
  await page.click('.dl-offer-screen .dl-submit');
  await waitForAddress(page, `${base}/annonce/?id=${FICHE}`);
  await page.waitForSelector('.dl-aside a.dl-offer');
  const offer = once('offre', mark, 'rpc/make_offer');
  if (offer) {
    const body = offer.body ?? {};
    if (!UUID.test(body.p_id ?? '')) problems.push(`offre: identifiant ${body.p_id}`);
    if (!ISO_SECONDS.test(body.p_expires_at ?? '') || Math.abs(Date.parse(body.p_expires_at) - (offerSentAt + 14 * 86_400_000)) > 120_000) problems.push(`offre: fin de validité ${body.p_expires_at}`);
    expectJSON('offre', 'arguments de make_offer', body, {
      p_id: body.p_id, p_conversation_id: conversationId(1), p_amount: 228000, p_conditions: 'Sous réserve d\'obtention du prêt', p_expires_at: body.p_expires_at,
    });
  }
  if (!since(mark, 'rpc/my_offers').length) problems.push('offre: les offres ne sont pas relues après l\'envoi');
  expect('offre', 'état de l’offre', await page.textContent('.dl-aside a.dl-offer'), 'Offre en attente');
  expect('offre', 'lien de l’offre', await page.getAttribute('.dl-aside a.dl-offer', 'href'), `/messages/?c=${conversationId(1)}`);
  expect('offre', 'titre de la page après l’envoi', await page.title(), 'Appartement 3 pièces à Lyon 2e · Nidalo');

  // « Demander une visite » : le formulaire de l'app à son adresse, create_visit_request, puis la confirmation.
  mark = calls.length;
  await page.click('.dl-aside .dl-visit');
  await waitForAddress(page, `${base}/annonce/?id=${FICHE}&vue=visite`);
  await page.waitForSelector('.dl-visit-screen h1');
  expect('visite', 'titre', await page.textContent('.dl-visit-screen h1'), 'Demander une visite');
  expect('visite', 'titre de la page', await page.title(), 'Demander une visite · Appartement 3 pièces · Nidalo');
  expect('visite', 'bien', await page.textContent('.dl-visit-listing-text'), 'Appartement 3 piècesLyon 2e238 000 €');
  expect('visite', 'sections', await page.$$eval('.dl-visit-screen .dl-form-section h2', (els) => els.map((el) => el.textContent).join(' | ')), 'Créneau souhaité | Type de visite | Message (facultatif)');
  const days = await page.evaluate(() => [5, 6].map((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }));
  await page.locator('.dl-slot').nth(0).locator('input.dl-date').fill(days[0]);
  await page.locator('.dl-slot').nth(0).locator('select').selectOption('1080');
  await page.click('.dl-link-button.is-strong');
  await page.locator('.dl-slot').nth(1).locator('input.dl-date').fill(days[1]);
  await page.locator('.dl-slot').nth(1).locator('select').selectOption('600');
  await page.click('.dl-option:has-text("En visio")');
  await page.fill('.dl-visit-screen textarea', '  Bonjour, je suis disponible en fin de journée.  ');
  await checkColumn(page, 'visite', '.dl-visit-screen');
  await fullShot(page, '2-fiche-visite-1440.png');
  const starts = await page.evaluate(([first, second]) => [[first, 18], [second, 10]].map(([day, hour]) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d, hour, 0).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }), days);
  mark = calls.length;
  await page.click('.dl-visit-screen .dl-submit');
  await page.waitForSelector('.dl-visit-screen .dl-sent');
  const created = once('visite', mark, 'rpc/create_visit_request');
  let requestId = null;
  if (created) {
    const body = created.body ?? {};
    requestId = body.p_id;
    const slots = Array.isArray(body.p_slots) ? body.p_slots : [];
    if (!UUID.test(body.p_id ?? '') || slots.length !== 2 || !slots.every((slot) => UUID.test(slot.id ?? ''))) problems.push(`visite: identifiants ${JSON.stringify(body)}`);
    expectJSON('visite', 'arguments de create_visit_request', body, {
      p_id: body.p_id, p_listing_id: FICHE,
      p_slots: [{ id: slots[0]?.id, start: starts[0], durationMinutes: 60 }, { id: slots[1]?.id, start: starts[1], durationMinutes: 60 }],
      p_message: 'Bonjour, je suis disponible en fin de journée.', p_mode: 'video',
    });
  }
  const requestRead = once('visite', mark, 'rpc/my_visit_requests', (call) => call.body?.p_request_id);
  if (requestRead) expectJSON('visite', 'relecture de la demande', requestRead.body, { p_request_id: requestId });
  expect('visite', 'titre de la confirmation', await page.textContent('.dl-visit-screen h1'), 'Demande envoyée');
  expect('visite', 'statut', await page.textContent('.dl-sent .dl-status-badge'), 'En attente');
  expect('visite', 'texte de la confirmation', await page.textContent('.dl-sent-text'), 'Ce n\'est pas encore une visite confirmée : Agence Démo Centre doit choisir un créneau, ou en proposer un autre. Vous la retrouvez dans Mon compte › Mon agenda.');
  expect('visite', 'créneaux envoyés', await page.$$eval('.dl-sent-slots li', (els) => els.map((el) => /\d+h\d\d/.exec(el.textContent)?.[0]).join(' | ')), '18h00 | 10h00');
  expect('visite', 'lien de l’agenda', await page.getAttribute('.dl-screen-actions a.dl-submit', 'href'), '/compte/?vue=bientot&ecran=agenda');
  await fullShot(page, 'visite-envoyee-1440.png');
  await page.click('.dl-screen-actions .dl-secondary');
  await waitForAddress(page, `${base}/annonce/?id=${FICHE}`);
  await page.waitForSelector('.dl-aside .dl-pill-wide');
  expect('visite', 'état de la demande', await page.textContent('.dl-aside .dl-pill-wide'), 'Demande envoyée · En attente');
  expect('visite', 'lien de la demande', await page.getAttribute('.dl-aside .dl-pill-wide', 'href'), `/compte/?vue=demande-visite&id=${requestId}`);
  expect('visite', 'carte des visites', await page.textContent('.dl-main .dl-visit-card'), 'Demande de visite envoyéeEn attente · Agence Démo Centre');
  await page.screenshot({ path: join(out, 'fiche-apres-envoi-1440.png') });

  // « Envoyer un message » : la conversation de l'annonce (la même), puis Messages.
  mark = calls.length;
  await page.click('.dl-aside .dl-message');
  await waitForAddress(page, `${base}/messages/?c=${conversationId(1)}`);
  const messageStart = once('message', mark, 'rpc/start_listing_conversation');
  if (messageStart) expectJSON('message', 'arguments de start_listing_conversation', messageStart.body, { p_listing_id: FICHE });
  const messageRead = once('message', mark, 'rpc/my_conversations', (call) => call.body?.p_conversation_id);
  if (messageRead) expectJSON('message', 'relecture de la conversation', messageRead.body, { p_conversation_id: conversationId(1) });
  if (fresh.conversations.length !== 1) problems.push(`message: ${fresh.conversations.length} conversations pour une seule annonce`);
  await page.close();

  // Adresses des écrans ouvertes directement, avec le compte.
  page = await open(member, `/annonce/?id=${FICHE}&vue=visite`, 'adresse-visite');
  await page.waitForSelector('.dl-visit-screen h1');
  expect('adresse-visite', 'titre', await page.textContent('.dl-visit-screen h1'), 'Demander une visite');
  await page.click('.dl-screen-close');
  await waitForAddress(page, `${base}/annonce/?id=${FICHE}`);
  await page.waitForSelector('.dl .dl-price-value');
  await page.close();
  // Une offre attend déjà une réponse : comme l'app, l'offre ouvre la conversation, qui la montre.
  page = await open(member, `/annonce/?id=${FICHE}&vue=offre`, 'adresse-offre-en-attente');
  await waitForAddress(page, `${base}/messages/?c=${conversationId(1)}`);
  await page.close();
  page = await open(member, `/annonce/?id=${SALE}&vue=offre`, 'adresse-offre');
  await page.waitForSelector('.dl-offer-screen h1');
  expect('adresse-offre', 'adresse', page.url(), `${base}/annonce/?id=${SALE}&vue=offre`);
  expect('adresse-offre', 'bien et prix', await page.textContent('.dl-offer-screen .dl-screen-head p'), 'Appartement lumineux avec balcon · prix affiché 238 000 €');
  // Sans montant, rien ne part : le message de l'app.
  mark = calls.length;
  await page.click('.dl-offer-screen .dl-submit');
  expect('adresse-offre', 'montant manquant', await page.textContent('.dl-offer-screen .dl-error'), 'Indiquez un montant.');
  if (since(mark, 'rpc/make_offer').length) problems.push('adresse-offre: make_offer appelé sans montant');
  await page.click('.dl-screen-close');
  await waitForAddress(page, `${base}/annonce/?id=${SALE}`);
  await page.waitForSelector('.dl .dl-price-value');
  await page.close();
  page = await open(member, `/annonce/?id=${RENTAL}&vue=offre`, 'adresse-offre-location');
  await waitForAddress(page, `${base}/annonce/?id=${RENTAL}`);
  await ready(page, 'adresse-offre-location');
  if (await page.$('.dl-screen, .dl-offer')) problems.push('adresse-offre-location: offre proposée sur une location');
  await page.close();

  // Sa propre annonce : « Voir les demandes » et « Gérer l'annonce », qui restent dans l'app iPhone ; rien du compte n'est lu.
  mark = calls.length;
  page = await open(member, `/annonce/?id=${MINE}`, 'mon-annonce');
  await ready(page, 'mon-annonce');
  await common(page, 'mon-annonce', { phone: false });
  await checkDesktopLayout(page, 'mon-annonce');
  expect('mon-annonce', 'boutons', await page.$$eval('.dl-aside .dl-button', (els) => els.map((el) => el.textContent.trim()).join(' | ')), 'Voir les demandes | Gérer l\'annonce');
  if (await page.$('.dl-offer, .dl-message, .dl-call, .dl-visit-card, .dl-pill-wide')) problems.push('mon-annonce: offre, message, appel ou visite proposés sur sa propre annonce');
  for (const table of ['rpc/my_offers', 'rpc/my_visit_requests', 'agenda_visits', 'rpc/start_listing_conversation']) {
    if (since(mark, table).length) problems.push(`mon-annonce: ${table} demandé pour sa propre annonce`);
  }
  for (const [index, title] of [[0, 'Voir les demandes'], [1, 'Gérer l\'annonce']]) {
    await page.click(`.dl-aside .dl-button >> nth=${index}`);
    expect('mon-annonce', `fenêtre « ${title} »`, await dialogTitle(page), title);
    expect('mon-annonce', `message de « ${title} »`, await page.textContent('dialog[open] .alert-body p'), 'Dans l’app iPhone pour l’instant.');
    if (index === 1) await page.screenshot({ path: join(out, 'mon-annonce-1440.png') });
    await closeAlert(page);
  }
  await page.close();
  page = await open(member, `/annonce/?id=${MINE}&vue=visite`, 'mon-annonce-visite');
  await waitForAddress(page, `${base}/annonce/?id=${MINE}`);
  await ready(page, 'mon-annonce-visite');
  if (await page.$('.dl-screen')) problems.push('mon-annonce-visite: demande de visite sur sa propre annonce');
  await page.close();

  // « Comparer » : trois biens au plus, gardés dans l'onglet ; le toast et « Voir » mènent à /comparer/.
  page = await open(member, `/annonce/?id=${FICHE}`, 'comparer');
  for (const [target, text, action, pressed] of [
    [FICHE, 'Ajouté à la comparaison', 'Voir', 'true'],
    [SALE, 'Ajouté à la comparaison (2 biens)', 'Voir', 'true'],
    [LEASED, 'Ajouté à la comparaison (3 biens)', 'Voir', 'true'],
    [HOUSE, '3 biens maximum, retirez-en un', 'Gérer', 'false'],
  ]) {
    if (target !== FICHE) await page.goto(`${base}/annonce/?id=${target}`, { waitUntil: 'networkidle' });
    await ready(page, 'comparer');
    await page.click('.dl-tools .dl-compare');
    await page.waitForSelector('.dl-toast.is-shown');
    expect('comparer', `toast de ${target.slice(-2)}`, await page.textContent('.dl-toast-text'), text);
    expect('comparer', `bouton du toast de ${target.slice(-2)}`, `${await page.textContent('.dl-toast-box a')} ${await page.getAttribute('.dl-toast-box a', 'href')}`, `${action} /comparer/`);
    expect('comparer', `Comparer de ${target.slice(-2)}`, await page.getAttribute('.dl-tools .dl-compare', 'aria-pressed'), pressed);
    if (target === FICHE) {
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(out, 'comparer-toast-1440.png') });
    }
  }
  expectJSON('comparer', 'comparaison gardée dans l’onglet', JSON.parse(await page.evaluate(() => sessionStorage.getItem('nidalo.comparer'))), { ids: [FICHE, SALE, LEASED], referenceId: FICHE });
  await page.click('.dl-toast-box a');
  await waitForAddress(page, `${base}/comparer/`);
  await page.waitForSelector('.cmp-table');
  await page.waitForLoadState('networkidle');
  expect('comparer', 'titre de la page', await page.title(), 'Comparer · Nidalo');
  expect('comparer', 'biens comparés', await page.$$eval('.cmp-head .cmp-title', (els) => els.map((el) => el.textContent).join(' | ')), 'Appartement 3 pièces | Appartement lumineux avec balcon | T2 vendu loué près du métro');
  expect('comparer', 'référence', await page.$$eval('.cmp-head', (els) => els.map((el) => (el.classList.contains('is-reference') ? 'R' : '-')).join('')), 'R--');
  await checkColumn(page, 'comparer', '.cmp');
  await fullShot(page, '2-comparer-1440.png');
  await page.click('.cmp-make-reference >> nth=0');
  expect('comparer', 'nouvelle référence', await page.$$eval('.cmp-head', (els) => els.map((el) => (el.classList.contains('is-reference') ? 'R' : '-')).join('')), '-R-');
  await page.click('.cmp-head >> nth=2 >> .cmp-remove');
  await page.waitForFunction(() => document.querySelectorAll('.cmp-head').length === 2);
  if (!(await page.$('.cmp-add'))) problems.push('comparer: « Ajouter un bien » absent avec deux biens');
  await page.click('.cmp-clear');
  expect('comparer', 'fenêtre pour vider', await dialogTitle(page), 'Vider la comparaison ?');
  await page.click('dialog[open] .alert-actions .btn-primary');
  await page.waitForSelector('.cmp-empty');
  expectJSON('comparer', 'comparaison vidée', JSON.parse(await page.evaluate(() => sessionStorage.getItem('nidalo.comparer'))), { ids: [], referenceId: null });
  await page.screenshot({ path: join(out, 'comparer-vide-1440.png') });
  // Une annonce qui n'existe plus quitte la comparaison ; un serveur qui ne répond pas laisse « Réessayer » et le bien.
  await page.evaluate(([gone, kept]) => sessionStorage.setItem('nidalo.comparer', JSON.stringify({ ids: [gone, kept], referenceId: gone })), [UNKNOWN, FICHE]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.cmp-table');
  expect('comparer-introuvable', 'biens comparés', await page.$$eval('.cmp-head .cmp-title', (els) => els.map((el) => el.textContent).join(' | ')), 'Appartement 3 pièces');
  expectJSON('comparer-introuvable', 'annonce retirée de la comparaison', JSON.parse(await page.evaluate(() => sessionStorage.getItem('nidalo.comparer'))), { ids: [FICHE], referenceId: FICHE });
  await page.close();
  page = await open(member, '/comparer/', 'comparer-erreur', {
    expectedStatus: 500,
    init: `sessionStorage.setItem('nidalo.comparer', ${JSON.stringify(JSON.stringify({ ids: [BROKEN], referenceId: BROKEN }))});`,
  });
  await page.waitForSelector('.cmp-error');
  expect('comparer-erreur', 'message', await page.textContent('.cmp-error h2'), 'Comparaison indisponible');
  if (await page.$('.cmp-table')) problems.push('comparer-erreur: tableau affiché sans aucun bien');
  const brokenBefore = brokenRequests;
  await page.click('.cmp-error .cmp-discover');
  for (let i = 0; i < 30 && brokenRequests <= brokenBefore; i += 1) await page.waitForTimeout(100);
  if (brokenRequests <= brokenBefore) problems.push('comparer-erreur: « Réessayer » ne redemande pas le bien');
  await page.waitForSelector('.cmp-error');
  expectJSON('comparer-erreur', 'bien gardé dans la comparaison', JSON.parse(await page.evaluate(() => sessionStorage.getItem('nidalo.comparer'))), { ids: [BROKEN], referenceId: BROKEN });
  await page.screenshot({ path: join(out, 'comparer-erreur-1440.png') });
  await page.close();
  await member.close();

  // Captures pour Romain : la fiche comme sur la maquette (une offre en attente, une visite confirmée), à 1440 et 1024 px.
  for (const [width, height] of [[1440, 900], [1024, 768]]) {
    const name = `fiche-${width}`;
    const context = await frenchBrowser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    await mock(context);
    await signIn(context, seededState());
    page = await open(context, `/annonce/?id=${FICHE}`, name);
    await ready(page, name);
    await page.waitForSelector('.dl-aside a.dl-offer');
    await page.waitForSelector('.dl-aside .dl-pill-wide.is-confirmed');
    await common(page, name, { phone: false });
    await checkDesktopLayout(page, name);
    await checkHiddenStreet(page, name);
    expect(name, 'état de l’offre', await page.textContent('.dl-aside a.dl-offer'), 'Offre en attente');
    expect(name, 'visite confirmée', await page.textContent('.dl-aside .dl-pill-wide'), /^Visite confirmée · \S+ \d{1,2} \S+, 18h00$/);
    expect(name, 'carte des visites', await page.textContent('.dl-main .dl-visit-card .dl-visit-subtitle'), 'Visite prévue · Visite confirmée');
    expect(name, 'lien de l’agenda', await page.getAttribute('.dl-main .dl-visit-agenda', 'href'), '/compte/?vue=bientot&ecran=agenda');
    // La mini carte est dessinée avant la capture de toute la page.
    await page.locator('section[aria-labelledby="localisation"]').scrollIntoViewIfNeeded();
    await page.waitForSelector('.mini-map .location-map-canvas[data-ready="oui"]', { timeout: 20000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(out, `${name}-haut.png`) });
    await fullShot(page, `2-fiche-${width}.png`);
    // La colonne de droite reste visible en bas de la page.
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.dl-main').getBoundingClientRect().bottom + window.scrollY - window.innerHeight));
    await page.waitForTimeout(200);
    const asideTop = await page.$eval('.dl-aside', (el) => Math.round(el.getBoundingClientRect().top));
    if (asideTop < 0 || asideTop > 24) problems.push(`${name}: colonne de droite à ${asideTop} px du haut après le défilement (24 attendus)`);
    await page.close();
    await context.close();
  }
} catch (error) {
  problems.push(`arrêt : ${error.message.split('\n').slice(0, 14).join('\n  ')}`);
} finally {
  await browser.close();
  await frenchBrowser?.close();
  server.close();
}

if (problems.length) {
  console.log('Problèmes :\n' + problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Aucun problème. Captures : ${out}`);
}
