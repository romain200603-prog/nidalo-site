// Vérification de la fiche d'une annonce (/annonce/) dans Chromium, sans réseau : le serveur Supabase, les services
// de lieux et la carte sont simulés avec des données inventées (fixtures/listings.json, fixtures/listing-extra.json et
// fixtures/listing-desktop.json). Avec le compte de test, les actions de la fiche (offre, visite, message ; favori et
// comparaison sur ordinateur) parlent au serveur simulé, qui note ce qu'elles envoient, sur ordinateur et sur téléphone.
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
/** Vues envoyées au serveur (record_listing_view), pour les Statistiques de l'espace pro. */
const viewCalls = [];
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
    if (table === 'rpc/record_listing_view') {
      // Vue d'une fiche, avec ou sans compte : notée ; la fonction du serveur ne répond rien.
      let body = null;
      try { body = request.postDataJSON(); } catch { body = request.postData(); }
      viewCalls.push(body);
      return route.fulfill({ status: 204, headers: cors, body: '' });
    }
    if (ACCOUNT_TABLES.includes(table)) {
      // Avec un compte, la route du compte (signIn) répond avant celle-ci : arriver ici, c'est demander sans compte.
      problems.push(`sans compte : ${table} demandé (${request.method()} ${decodeURIComponent(url.search)})`);
      return json(route, []);
    }
    if (url.pathname.endsWith('/rpc/public_profiles')) {
      // Profils publics : jamais de téléphone ni d'e-mail pour un visiteur sans compte.
      // Identifiants en majuscules (page Messages) ou en minuscules : le serveur ne fait pas la différence.
      const ids = ((request.method() === 'POST' ? request.postDataJSON()?.user_ids : null) ?? []).map((value) => String(value).toLowerCase());
      return json(route, profiles.filter((p) => ids.includes(p.user_id.toLowerCase())).map((p) => ({ ...p, agency_phone: null })));
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

/** Messagerie (page Messages, ouverte par « Envoyer un message » et après une offre). */
const MESSAGING_TABLES = [
  'messages', 'conversation_participants', 'user_blocks', 'rpc/my_communities', 'rpc/professional_contacts', 'rpc/mark_conversation_read',
  'message_reactions', 'conversation_preferences', 'listing_lots',
];
/** Tables et fonctions du compte : jamais demandées sans compte. */
const ACCOUNT_TABLES = [
  'profiles', 'profile_details', 'favorites', 'notifications', 'rpc/mark_notifications_read', 'rpc/my_conversations',
  'rpc/start_listing_conversation', 'rpc/my_offers', 'rpc/make_offer', 'rpc/my_visit_requests', 'rpc/create_visit_request',
  'rpc/list_open_slots', 'rpc/book_visit_slot', 'rpc/accept_visit_request', 'rpc/decline_visit_request', 'rpc/propose_visit_slots',
  'rpc/cancel_visit_request', 'agenda_visits', 'saved_searches', 'real_estate_projects', 'professional_profiles', 'professional_profile_details', 'reports',
  ...MESSAGING_TABLES,
];
/**
 * La fiche ne lit pas les notifications (leur cloche est celle de l'accueil et de Mon compte ; plus de barre du haut sur
 * ordinateur) : vérifié sous 1024 px (la page Messages lit les pastilles à toutes les tailles). Écrire, visiter et faire
 * une offre sont sur téléphone aussi, avec les mêmes tables que sur ordinateur.
 */
const DESKTOP_ONLY = ['notifications', 'rpc/mark_notifications_read'];

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

/** Chemin de la page qui fait la demande (« /annonce/ »…), vide pour un worker. */
function pagePath(request) {
  try {
    return new URL(request.frame().page().url()).pathname;
  } catch {
    return '';
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

/**
 * Ce que le serveur sait du compte : conversations, offres, agenda, demandes de visite, favoris, et les créneaux ouverts
 * par les vendeurs (visites groupées, avec l'annonce de leur séance).
 */
function accountState() {
  return { conversations: [], offers: [], messages: [], agenda: [], requests: [], favorites: [], openSlots: [] };
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

/** Personne qui demande à visiter l'annonce du compte (inventée). */
const REQUESTER = { userId: 'a1000000-0000-4000-8000-0000000000e5', name: 'Julie B.', kind: 'individual' };

/** Demande reçue pour l'annonce du compte (MINE) : deux créneaux à venir et un message, comme my_visit_requests la rend. */
function receivedRequest(n, fields = {}) {
  const mine = listingById(MINE);
  const created = isoSeconds(new Date(Date.now() - n * 3_600_000));
  return {
    id: `f3000000-0000-4000-8000-00000000000${n}`, listing_id: MINE,
    listing_snapshot: { listingId: MINE, title: mine.title, price: mine.price, transaction: mine.transaction, city: mine.city },
    requester: REQUESTER, recipient: { userId: USER_ID, name: 'Claire M.', kind: 'individual' },
    slots: [
      { id: `5a000000-0000-4000-8000-00000000000${n}`, start: isoSeconds(parisTime(3 + n, 10)), durationMinutes: 60 },
      { id: `5b000000-0000-4000-8000-00000000000${n}`, start: isoSeconds(parisTime(4 + n, 17)), durationMinutes: 60 },
    ],
    mode: 'onSite', message: 'Bonjour, je suis disponible ces deux jours.', status: 'pending', accepted_slot: null, proposed_slots: [], proposed_by: null,
    decline_reason: null, previous_request_id: null, created_at: created,
    history: [{ id: `e5000000-0000-4000-8000-00000000000${n}`, date: created, actorId: REQUESTER.userId, action: { sent: {} } }],
    ...fields,
  };
}

/**
 * Ligne de my_conversations d'une conversation d'annonce, avec toutes les colonnes de la fonction du serveur (lues par la
 * fiche, la pastille et la page Messages) ; le dernier message vient de ceux de la conversation.
 */
function inboxRow({ id, listing }, messages = []) {
  const last = messages.filter((message) => message.conversation_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1) ?? null;
  return {
    conversation_id: id, kind: 'listing', listing_id: listing.id,
    listing_snapshot: { listingId: listing.id, title: listing.title, price: listing.price, transaction: listing.transaction, city: listing.city },
    buyer_id: USER_ID, seller_id: listing.owner_id, group_name: null, group_details: null, group_image_path: null, group_purpose: null,
    ephemeral_seconds: null, created_by: USER_ID, created_at: '2026-11-05T09:00:00Z', my_role: 'member', joined_at: '2026-11-05T09:00:00Z', left_at: null,
    last_read_at: null, is_archived: false, is_favorite: false, muted_until: null, saves_photos: false, cleared_at: null, other_user_id: listing.owner_id,
    other_last_read_at: null, member_count: 2, unread_count: 0, last_message_id: last?.id ?? null, last_message_sender_id: last?.sender_id ?? null,
    last_message_kind: last?.kind ?? null, last_message_content: last?.content ?? null, last_message_preview: last?.preview ?? null,
    last_message_at: last?.created_at ?? null,
  };
}

/** Offre telle que my_offers la rend (OfferServerRow) : le compte est l'acheteur et l'auteur de ses offres. */
const offerRow = (offer) => ({
  author_id: USER_ID, parent_offer_id: null, responded_at: null, decline_reason: null, ...offer, my_role: 'buyer', is_mine: true,
  allowed_actions: offer.status === 'pending' ? ['withdraw'] : [],
});

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
      const rows = state.conversations.map((conversation) => inboxRow(conversation, state.messages));
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
      return json(route, state.offers.map(offerRow));
    case 'rpc/make_offer': {
      const conversation = state.conversations.find((item) => item.id === body?.p_conversation_id);
      if (!conversation) return refuse('Conversation introuvable.');
      const offer = {
        id: body.p_id, conversation_id: conversation.id, listing_id: conversation.listing.id, buyer_id: USER_ID, seller_id: conversation.listing.owner_id,
        amount: body.p_amount, conditions: body.p_conditions ?? null, status: 'pending', created_at: isoSeconds(new Date()),
        expires_at: body.p_expires_at ?? isoSeconds(new Date(Date.now() + 7 * 86_400_000)),
      };
      state.offers.push(offer);
      // Comme la fonction du serveur : la bulle de l'offre est écrite dans la conversation.
      state.messages.push({
        id: crypto.randomUUID(), conversation_id: conversation.id, sender_id: USER_ID, kind: 'offer', client_id: crypto.randomUUID(),
        content: { offer: { offerId: offer.id } }, created_at: new Date().toISOString(), expires_at: null, message_reactions: [], preview: '💶 Offre',
      });
      return json(route, [offerRow(offer)]);
    }
    case 'messages': {
      // Les 200 derniers messages de la conversation ouverte (aucun envoi ici).
      const filter = url.searchParams.get('conversation_id')?.slice(3)?.toLowerCase();
      const rows = state.messages.filter((message) => message.conversation_id === filter).sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, Number(url.searchParams.get('limit') ?? 1000)).map(({ preview, ...columns }) => columns);
      return json(route, rows);
    }
    case 'rpc/mark_conversation_read':
      return empty(204);
    case 'message_reactions':
    case 'conversation_preferences':
      return method === 'GET' ? json(route, []) : empty(method === 'DELETE' ? 204 : 201);
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
        created_at: isoSeconds(new Date()), history: [{ id: crypto.randomUUID(), date: isoSeconds(new Date()), actorId: USER_ID, action: { sent: {} } }],
      });
      return json(route, body.p_id);
    }
    case 'rpc/accept_visit_request':
    case 'rpc/decline_visit_request':
    case 'rpc/propose_visit_slots':
    case 'rpc/cancel_visit_request': {
      // Comme les fonctions du serveur (bloc 4) : l'état change, l'historique garde l'action ; rien n'est rendu.
      const request = state.requests.find((row) => row.id === body?.p_request_id);
      if (!request) return refuse('Demande introuvable.');
      const at = isoSeconds(new Date());
      let action;
      if (table === 'rpc/accept_visit_request') {
        const slot = [...request.slots, ...(request.proposed_slots ?? [])].find((item) => item.id === body.p_slot_id);
        if (!slot) return refuse('Ce créneau n\'est plus proposé ou il est déjà passé.');
        Object.assign(request, { status: 'accepted', accepted_slot: slot, proposed_slots: [], proposed_by: null });
        action = { accepted: { slotId: slot.id } };
      } else if (table === 'rpc/decline_visit_request') {
        const reason = body.p_reason?.trim() || null;
        Object.assign(request, { status: 'declined', decline_reason: reason, proposed_slots: [], proposed_by: null });
        action = { declined: reason ? { reason } : {} };
      } else if (table === 'rpc/propose_visit_slots') {
        Object.assign(request, { status: 'counterProposed', proposed_slots: body.p_slots, proposed_by: request.requester.userId === USER_ID ? 'requester' : 'recipient' });
        action = { proposed: { slots: body.p_slots } };
      } else {
        Object.assign(request, { status: 'cancelled', proposed_slots: [], proposed_by: null });
        action = { cancelled: {} };
      }
      request.history = [...(request.history ?? []), { id: crypto.randomUUID(), date: at, actorId: USER_ID, action }];
      return empty(204);
    }
    case 'rpc/list_open_slots':
      // Créneaux à venir des séances ouvertes de l'annonce (OpenSlotRow), sans les colonnes du serveur simulé.
      return json(route, state.openSlots.filter((slot) => slot.listing_id === body?.p_listing_id).map(({ listing_id: _, race: __, ...row }) => row));
    case 'rpc/book_visit_slot': {
      // Comme la fonction du serveur : le créneau est réservé et la demande, créée acceptée sur ce créneau ; elle rend
      // l'identifiant de la demande (p_id).
      const slot = state.openSlots.find((row) => row.session_id === body?.p_session_id && Date.parse(row.slot_start) === Date.parse(body?.p_slot_start ?? ''));
      if (!slot) return refuse('Ce créneau n\'est plus proposé.');
      // `race` : la dernière place est prise par quelqu'un d'autre juste avant.
      if (slot.race) Object.assign(slot, { places_left: 0, bookable: false, race: false });
      if (!slot.bookable) return refuse('Ce créneau est complet.');
      const listing = listingById(slot.listing_id);
      const owner = profiles.find((profile) => profile.user_id === listing.owner_id);
      const accepted = { id: crypto.randomUUID(), start: slot.slot_start, durationMinutes: slot.duration_minutes };
      state.requests.push({
        id: body.p_id, listing_id: listing.id, listing_snapshot: { listingId: listing.id, title: listing.title, price: listing.price, city: listing.city },
        requester: { userId: USER_ID, name: 'Claire M.', kind: 'individual' },
        recipient: owner?.account_type === 'professional' && owner.agency_id
          ? { userId: listing.owner_id, name: owner.agency_name, kind: 'agency', agencyId: owner.agency_id }
          : { userId: listing.owner_id, name: owner?.public_name ?? 'Particulier', kind: 'individual' },
        slots: [accepted], mode: 'onSite', message: body.p_message ?? null, status: 'accepted', accepted_slot: accepted, proposed_slots: null,
        created_at: isoSeconds(new Date()),
      });
      Object.assign(slot, { places_left: slot.places_left - 1, booked_by_me: true, bookable: false });
      return json(route, body.p_id);
    }
    case 'reports':
      // « Signaler l'annonce » : la ligne est enregistrée, le serveur ne répond rien.
      return empty(201);
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
      const ids = (request.postDataJSON()?.user_ids ?? []).map((value) => String(value).toLowerCase());
      return json(route, profiles.filter((p) => ids.includes(p.user_id.toLowerCase())));
    }
    if (!ACCOUNT_TABLES.includes(table)) return route.fallback();
    let body = null;
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
    const width = pageWidth(request);
    calls.push({ table, method: request.method(), search: decodeURIComponent(url.search), body, width });
    if (width !== null && width < 1024 && DESKTOP_ONLY.includes(table) && pagePath(request) === '/annonce/') {
      problems.push(`fiche sur téléphone : ${table} demandé (la cloche n'est que sur ordinateur)`);
    }
    return respond(route, state, table, request, url, body);
  });
  // Temps réel (page Messages, écran Notifications) : les abonnements sont acceptés, aucun changement n'est envoyé.
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

async function open(context, path, name, { init, expectedStatus, before, quiet } = {}) {
  const page = await context.newPage();
  if (before) await before(page);
  page.on('console', (msg) => {
    const text = msg.text();
    if (/webgl|context lost/i.test(text)) (webglNotes.get(page) ?? webglNotes.set(page, []).get(page)).push(`${msg.type()} ${text.slice(0, 160)}`);
    // Le cas « erreur du serveur » répond exprès 500 : Chrome le signale dans la console, ce n'est pas une erreur du site.
    if (expectedStatus && text.includes(`status of ${expectedStatus}`)) return;
    // Échecs voulus (conversation refusée, réseau coupé) : Chrome les signale aussi dans la console.
    if (quiet?.test(text)) return;
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
    const boxes = '.spec-banner-col, .spec-value-box, .spec-bar-line, .spec-total, .spec-segments, .spec-result-head, .spec-kpis li, .hc-fact, .hc-price, .feature-row, .origin-row, .features-column, .publisher-head, .visit-text, .owner-bar-button, .full-map-text'
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
        // Capsules Duo (2 px au-dessus de la zone sûre, 10 px sans) ou barre blanche de sa propre annonce (en bas).
        const box = (bar.querySelector('.duo-row') ?? bar).getBoundingClientRect();
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

/** Couleurs de « Votre mois type » (MonthlyBreakdown.Kind.monthColorHex de l'app), le reste en vert comme les loyers. */
const MONTH_COLORS = {
  collectedRent: 'rgb(47, 122, 78)', loan: 'rgb(60, 92, 176)', nonRecoverableCharges: 'rgb(235, 104, 52)', propertyTax: 'rgb(27, 175, 122)',
  landlordInsurance: 'rgb(237, 161, 0)', managementFees: 'rgb(232, 123, 164)', maintenance: 'rgb(98, 80, 214)', reste: 'rgb(47, 122, 78)',
};

/**
 * « Votre mois type » comme l'app (MonthTypeBar, demande du 17/11) : barre de 14, un segment par dépense dans l'ordre
 * des lignes puis le reste, chacun de la couleur de sa sorte de ligne, 2 entre eux, la barre remplie ; dessous, le
 * libellé du loyer et « Reste » (vert) ou « Effort d'épargne » (rouge, avec le trait où s'arrêtent les loyers) du
 * cash-flow affiché ; devant chaque ligne, le carré de la couleur de son segment ; un seul texte lu pour la barre.
 */
async function checkMonthBar(page, name, { rentCaption }) {
  const info = await page.evaluate(() => {
    const plain = (text) => text?.replace(/[\u00a0\u202f]/g, ' ').trim() ?? null;
    const bar = document.querySelector('.month-bar');
    if (!bar) return null;
    const track = bar.querySelector('.month-bar-track').getBoundingClientRect();
    const flow = bar.querySelector('.month-bar-flow');
    return {
      height: track.height,
      width: track.width,
      segments: [...bar.querySelectorAll('.month-bar-segment')].map((el) => {
        const box = el.getBoundingClientRect();
        return { id: el.dataset.segment, left: box.left - track.left, right: box.right - track.left, color: getComputedStyle(el).backgroundColor };
      }),
      rows: [...document.querySelectorAll('.spec-month-rows .spec-bar-line')].map((line) => {
        const marker = line.querySelector('.spec-row-marker');
        return { label: plain(line.querySelector('.spec-bar-label')?.textContent), amount: plain(line.querySelector('.spec-bar-amount')?.textContent),
          marker: marker ? getComputedStyle(marker).backgroundColor : null };
      }),
      bars: document.querySelectorAll('.spec-month-rows .spec-bar-track').length,
      totals: bar.closest('.spec-card').querySelectorAll('.spec-total').length,
      role: bar.getAttribute('role'),
      label: plain(bar.getAttribute('aria-label')),
      hidden: [...bar.children].every((child) => child.getAttribute('aria-hidden') === 'true'),
      rent: plain(bar.querySelector('.month-bar-rent')?.textContent),
      flow: plain(flow?.textContent),
      flowColor: flow ? getComputedStyle(flow).color : null,
      marker: Boolean(bar.querySelector('.month-bar-marker')),
      cashFlow: plain(bar.closest('.spec-card').querySelector('.spec-value-box .spec-box-value')?.textContent),
    };
  });
  if (!info) {
    problems.push(`${name}: pas de barre « Votre mois type »`);
    return;
  }
  expect(name, 'hauteur de la barre du mois type', info.height, 14);
  const { segments } = info;
  if (!segments.length) problems.push(`${name}: barre du mois type sans segment`);
  for (const [index, segment] of segments.entries()) {
    if (segment.color !== MONTH_COLORS[segment.id]) problems.push(`${name}: segment « ${segment.id} » en ${segment.color}`);
    if (index > 0 && Math.abs(segment.left - segments[index - 1].right - 2) > 0.6) problems.push(`${name}: écart de ${(segment.left - segments[index - 1].right).toFixed(1)} avant « ${segment.id} »`);
  }
  if (segments.length && (Math.abs(segments[0].left) > 0.6 || Math.abs(segments.at(-1).right - info.width) > 0.6)) {
    problems.push(`${name}: la barre du mois type n'est pas remplie (${segments[0].left.toFixed(1)} à ${segments.at(-1).right.toFixed(1)} sur ${info.width.toFixed(1)})`);
  }
  // Les carrés des lignes de dépense, dans l'ordre, sont les couleurs des segments ; sans carré, une ligne à 0 €.
  const expenseMarkers = info.rows.slice(1).filter((row) => row.marker !== 'rgba(0, 0, 0, 0)').map((row) => row.marker);
  expectJSON(name, 'carrés des lignes du mois type', expenseMarkers, segments.filter((segment) => segment.id !== 'reste').map((segment) => segment.color));
  for (const row of info.rows.slice(1)) if (row.marker === 'rgba(0, 0, 0, 0)' && !/^[−-]?0 €$/.test(row.amount)) problems.push(`${name}: ligne « ${row.label} » (${row.amount}) sans carré`);
  expectJSON(name, 'ligne du loyer', [info.rows[0]?.label, info.rows[0]?.marker], [rentCaption, MONTH_COLORS.collectedRent]);
  expectJSON(name, 'lignes sans barre ni total « Cash-flow »', [info.bars, info.totals], [0, 0]);
  expectJSON(name, 'barre lue d\'un seul texte', [info.role, info.hidden, /^Sur [\d ]+ € de loyers : .+, (reste|effort d’épargne) [\d ]+ €$/.test(info.label ?? '')], ['img', true, true]);
  expect(name, 'libellé sous la barre', info.rent, rentCaption);
  // Sous la barre, le cash-flow de la case en euros entiers (CategoryFormat.euros de l'app ; la case garde les centimes).
  const value = Number((info.cashFlow ?? '').replace(/\/mois$/, '').replace('−', '-').replace(/[^\d,-]/g, '').replace(',', '.'));
  const negative = value < 0;
  const whole = Math.round(Math.abs(value));
  const amount = `${whole === 0 ? '' : negative ? '−' : '+'}${whole.toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ')} €`;
  expect(name, 'reste sous la barre', info.flow, negative ? `Effort d’épargne ${amount}` : `Reste ${amount}`);
  expectJSON(name, 'couleur du reste et trait des loyers', [info.flowColor, info.marker, segments.some((segment) => segment.id === 'reste')],
    negative ? ['rgb(192, 57, 43)', true, false] : ['rgb(87, 121, 101)', false, whole > 0]);
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
  // L'ordre et les noms de l'app (ListingLocationMapView) : Plans d'abord, puis Google Maps et Waze.
  expect(name, 'liens d’itinéraire', JSON.stringify(links), JSON.stringify([
    ['Plans', `https://maps.apple.com/?daddr=${point}`, '_blank'],
    ['Google Maps', `https://www.google.com/maps/dir/?api=1&destination=${point}`, '_blank'],
    ['Waze', `https://waze.com/ul?ll=${point}&navigate=yes`, '_blank'],
  ]));
  expect(name, 'message d’itinéraire', await page.textContent('dialog.alert-dialog[open] .alert-body p'),
    approximate ? 'Le vendeur n\'indique que le quartier : l\'itinéraire mène au centre de la zone.' : 'L\'itinéraire mène au point indiqué sur l\'annonce.');
  if (shots) await page.screenshot({ path: join(out, `${name}-itineraire.png`) });
  // Fenêtre de choix, pas une alerte : Échap la referme toujours (n° 45 ne touche que les alertes).
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached', timeout: 3000 }).catch(() => problems.push(`${name}: Échap ne referme pas « Itinéraire »`));
  if (!(await page.$('dialog.map-dialog[open]'))) problems.push(`${name}: Échap sur « Itinéraire » ferme aussi la carte`);
  await page.click('dialog.map-dialog[open] .full-map-card .btn-primary');
  expect(name, 'titre de la fenêtre rouverte', await dialogTitle(page), 'Itinéraire');
  await page.click('dialog.alert-dialog[open] .btn-light');
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
  // Sans connexion : « Pas de connexion Internet » et « Réessayer » (DomiaEmptyState.offline de l'app), puis la fiche.
  const name = `hors-ligne-${suffix}`;
  const listingRequest = /\/rest\/v1\/listings\?/;
  const page = await open(context, `/annonce/?id=${FICHE}`, name, {
    quiet: /ERR_INTERNET_DISCONNECTED|Failed to fetch/i,
    before: (p) => p.route(listingRequest, (route) => route.abort('internetdisconnected')),
  });
  await page.waitForSelector('.listing-state.app-offline h2');
  expect(name, 'titre', await page.textContent('.listing-state h2'), 'Pas de connexion Internet');
  expect(name, 'titre de la page', await page.title(), 'Pas de connexion Internet · Nidalo');
  await page.screenshot({ path: join(out, `${name}.png`) });
  await page.unroute(listingRequest);
  await page.click('.listing-state .app-offline-retry');
  await ready(page, name);
  await page.close();
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

/** Une alerte de la fiche ne se ferme que par ses boutons (n° 45, comme l'app) : ni Échap (deux fois), ni un clic à côté. */
async function expectAlertStays(page, name, title) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const box = await page.locator('dialog.alert-dialog[open] .alert-body').boundingBox();
  if (box) await page.mouse.click(Math.max(2, box.x / 2), Math.max(2, box.y / 2));
  await page.waitForTimeout(150);
  if (!(await page.$('dialog.alert-dialog[open]'))) problems.push(`${name}: « ${title} » se ferme sans ses boutons (Échap ou clic à côté)`);
  else expect(name, 'alerte toujours ouverte', await page.textContent('dialog.alert-dialog[open] .alert-body h2'), title);
}

/**
 * À poser avant le chargement de la page : note les étapes de l'arrivée de la barre Duo (d'après ses styles, en ms
 * depuis son apparition) et les animations lancées sur ses éléments (reflet, sonnerie, ondes, bulle, points).
 */
function recordDuo() {
  window.duoSteps = [];
  window.duoEffects = [];
  let start = null;
  let last = '';
  const kinds = { 'duo-shine': 'reflet', 'duo-phone': 'sonnerie', 'duo-wave': 'onde', 'duo-bubble': 'bulle' };
  const animate = Element.prototype.animate;
  Element.prototype.animate = function recorded(...args) {
    const found = Object.keys(kinds).find((name) => this.classList?.contains(name));
    const kind = found ? kinds[found] : this.parentElement?.classList.contains('duo-dots') ? 'point' : null;
    if (kind) window.duoEffects.push({ kind, t: start === null ? null : Math.round(performance.now() - start) });
    return animate.apply(this, args);
  };
  const sample = () => {
    const row = document.querySelector('.duo-bar .duo-row');
    if (row) {
      if (start === null) {
        start = performance.now();
        window.duoStart = start;
      }
      const slots = [...row.querySelectorAll('.duo-slot')].map((el) => (el.style.transform ? 'bas' : 'monte'));
      const widths = [...row.querySelectorAll('.duo-capsule')].map((el) => el.style.width);
      const texts = [...row.querySelectorAll('.duo-text')].map((el) => (el.classList.contains('is-shown') ? 'texte' : '-'));
      const state = `${slots} ${widths} ${texts}`;
      if (state !== last) {
        last = state;
        window.duoSteps.push({ t: Math.round(performance.now() - start), slots, widths, texts });
      }
    }
    if (start === null || performance.now() - start < 4000) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

/** La barre Duo ne bouge plus (arrivée et reflet finis : data-arrived ; repli, appui), avec `shown` textes affichés. */
async function duoStill(page, shown = 2) {
  await page.waitForFunction((shown) => {
    const row = document.querySelector('.duo-row');
    if (!row || row.dataset.arrived !== 'oui') return false;
    const moving = document.getAnimations().some((animation) => animation.playState === 'running' && row.contains(animation.effect?.target ?? null));
    return !moving && row.querySelectorAll('.duo-text.is-shown').length === shown;
  }, shown, { timeout: 8000 });
}

/**
 * Barre de contact « Duo » arrivée (ListingContactBar.swift) : deux capsules de 56 px à 10 px l'une de l'autre ;
 * « Appeler » blanche de 118 px (plus si son libellé n'y a pas 14 px de chaque côté), « Envoyer un message » bleue sur
 * le reste, titre court « Message » si le titre complet n'y a pas 14 px de chaque côté ; leurs noms et l'indice lus
 * par les lecteurs d'écran. Téléphone et tablette (`floating`) : à 20 px des bords (520 px au plus, au centre), 10 px
 * au-dessus du bas de l'écran (sans zone sûre), sur le dégradé des 112 px du bas, qui laisse passer les touchers.
 * Ordinateur : sur toute la largeur de la carte de la colonne de droite. Rend le titre affiché.
 */
async function checkDuo(page, name, { floating, seller }) {
  try {
    await duoStill(page);
  } catch {
    problems.push(`${name}: la barre Duo n'a pas fini d'arriver après 8 s`);
    return null;
  }
  const m = await page.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const row = document.querySelector('.duo-row');
    const [call, message] = [row.querySelector('.duo-call'), row.querySelector('.duo-message')];
    const style = getComputedStyle(call);
    // Libellés (pictogramme de 21 px, 8 px, texte) mesurés dans la police des capsules.
    const probe = document.createElement('span');
    Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', font: style.font, letterSpacing: style.letterSpacing });
    document.body.append(probe);
    const label = (text) => { probe.textContent = text; return 21 + 8 + probe.getBoundingClientRect().width; };
    const labels = { call: label('Appeler'), full: label('Envoyer un message') };
    probe.remove();
    const margins = (capsule) => {
      const outer = capsule.getBoundingClientRect();
      return [capsule.querySelector('.duo-icon').getBoundingClientRect().left - outer.left, outer.right - capsule.querySelector('.duo-text').getBoundingClientRect().right];
    };
    const hint = document.getElementById(message.getAttribute('aria-describedby') ?? '');
    const fade = document.querySelector('.duo-fade');
    const hit = (el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); };
    const under = fade ? document.elementFromPoint(innerWidth / 2, row.getBoundingClientRect().top - 30) : null;
    const contact = document.querySelector('.dl-contact');
    // Ordinateur : la colonne est sous la galerie ; le temps du test des touchers, les capsules au milieu de l'écran.
    const scrolled = window.scrollY;
    if (!fade) window.scrollTo({ top: scrolled + row.getBoundingClientRect().top - innerHeight / 2, behavior: 'instant' });
    const hits = [hit(call), hit(message)];
    if (!fade) window.scrollTo({ top: scrolled, behavior: 'instant' });
    return {
      viewport: [innerWidth, innerHeight], row: box(row), call: box(call), message: box(message), labels, contact: contact ? box(contact) : null,
      margins: [margins(call), margins(message)],
      texts: [call.textContent.trim(), message.textContent.trim()], names: [call.getAttribute('aria-label'), message.getAttribute('aria-label')],
      hint: hint?.textContent ?? null, hintHidden: hint ? hint.getBoundingClientRect().width <= 1 : null,
      font: `${style.fontWeight} ${style.fontSize} ${style.letterSpacing}`,
      colors: [getComputedStyle(call.querySelector('.duo-face')).backgroundColor, style.color,
        getComputedStyle(message.querySelector('.duo-face')).backgroundColor, getComputedStyle(message).color],
      fade: fade ? { height: fade.getBoundingClientRect().height, bottom: fade.getBoundingClientRect().bottom, events: getComputedStyle(fade).pointerEvents } : null,
      position: getComputedStyle(row.closest('.duo-bar') ?? row).position,
      hits, throughFade: fade ? Boolean(under && !under.closest('.duo-bar')) : null,
    };
  });
  const near = (a, b) => Math.abs(a - b) <= 0.6;
  const round = (value) => Math.round(value * 10) / 10;
  const callWidth = Math.max(118, m.labels.call + 28);
  const messageWidth = m.row.width - callWidth - 10;
  const title = m.labels.full + 28 <= messageWidth ? 'Envoyer un message' : 'Message';
  expectJSON(name, 'noms des capsules', m.names, ['Appeler', 'Envoyer un message']);
  expectJSON(name, 'titres des capsules', m.texts, ['Appeler', title]);
  expect(name, 'indice de « Envoyer un message »', m.hint, `Ouvre la conversation avec le ${seller}`);
  if (m.hintHidden !== true) problems.push(`${name}: l'indice de « Envoyer un message » est affiché`);
  expect(name, 'police des capsules', m.font, '600 17px -0.2px');
  expectJSON(name, 'couleurs des capsules', m.colors, ['rgba(255, 255, 255, 0.92)', 'rgb(60, 92, 176)', 'rgb(60, 92, 176)', 'rgb(255, 255, 255)']);
  if (!near(m.call.width, callWidth) || !near(m.message.width, messageWidth) || m.call.height !== 56 || m.message.height !== 56) {
    problems.push(`${name}: capsules de ${round(m.call.width)} × ${round(m.call.height)} et ${round(m.message.width)} × ${round(m.message.height)} au lieu de ${round(callWidth)} et ${round(messageWidth)} × 56`);
  }
  if (!near(m.call.top, m.message.top) || !near(m.message.left - m.call.right, 10) || !near(m.call.left, m.row.left) || !near(m.message.right, m.row.right)) {
    problems.push(`${name}: capsules mal placées (${round(m.call.left)} à ${round(m.call.right)}, ${round(m.message.left)} à ${round(m.message.right)} dans ${round(m.row.left)} à ${round(m.row.right)})`);
  }
  for (const [index, [left, right]] of m.margins.entries()) {
    if (left < 13.5 || right < 13.5) problems.push(`${name}: libellé de « ${m.names[index]} » à ${round(left)} et ${round(right)} px des bords (14 au moins)`);
  }
  if (!m.hits.every(Boolean)) problems.push(`${name}: une capsule ne reçoit pas les touchers (${m.hits})`);
  if (floating) {
    const [vw, vh] = m.viewport;
    const width = Math.min(520, vw - 40);
    if (m.position !== 'fixed' || !near(m.row.width, width) || !near(m.row.left, (vw - width) / 2) || !near(m.row.bottom, vh - 10)) {
      problems.push(`${name}: barre ${m.position} de ${round(m.row.width)} px, à ${round(m.row.left)} px du bord et ${round(vh - m.row.bottom)} px du bas au lieu de ${width}, ${(vw - width) / 2} et 10`);
    }
    if (!m.fade || !near(m.fade.height, 112) || !near(m.fade.bottom, vh) || m.fade.events !== 'none' || m.throughFade !== true) {
      problems.push(`${name}: dégradé du bas ${JSON.stringify(m.fade)}, touchers au travers : ${m.throughFade} (112 px sans toucher attendus)`);
    }
  } else if (!m.contact || !near(m.row.left, m.contact.left) || !near(m.row.width, m.contact.width)) {
    problems.push(`${name}: capsules de ${round(m.row.width)} px dans un bloc de ${round(m.contact?.width ?? 0)} px`);
  }
  return title;
}

/**
 * Arrivée de la barre Duo (recordDuo), comme l'app : deux ronds de 56 px, en bas et invisibles, qui montent (Appeler à
 * 0,35 s, Envoyer un message à 0,42 s), se déplient (0,87 s et 0,94 s), affichent leur texte (0,91 s et 0,98 s), puis
 * le reflet passe une fois (1,65 s). « Réduire les animations » : dépliées d'emblée, elles montent tout de suite, sans
 * reflet.
 */
async function checkDuoArrival(page, name, { reduced = false } = {}) {
  // Jusqu'à 2,6 s après l'apparition de la barre (fin de l'arrivée de l'app : 2,40 s).
  await page.waitForFunction(() => typeof window.duoStart === 'number' && performance.now() - window.duoStart > 2600, null, { timeout: 12000 })
    .catch(() => problems.push(`${name}: la barre Duo n'apparaît pas`));
  const { steps, effects } = await page.evaluate(() => ({ steps: window.duoSteps ?? [], effects: window.duoEffects ?? [] }));
  const first = steps[0];
  const at = (test) => steps.find(test)?.t ?? null;
  const shines = effects.filter((effect) => effect.kind === 'reflet');
  if (reduced) {
    const unfolded = first && first.widths.every((width) => width !== '56px') && first.texts.every((text) => text === 'texte');
    if (!first || first.slots.join() !== 'bas,bas' || !unfolded) problems.push(`${name}: barre avant l'arrivée ${JSON.stringify(first)} (dépliée, en bas)`);
    const risen = at((step) => step.slots.every((slot) => slot === 'monte'));
    if (risen === null || risen > 250) problems.push(`${name}: les capsules montent à ${risen} ms (tout de suite attendu)`);
    if (shines.length) problems.push(`${name}: le reflet passe avec « Réduire les animations »`);
    return;
  }
  expectJSON(name, 'barre avant l’arrivée', first && [first.slots, first.widths, first.texts], [['bas', 'bas'], ['56px', '56px'], ['-', '-']]);
  const times = [
    ['« Appeler » monte', at((step) => step.slots[0] === 'monte'), 350],
    ['« Envoyer un message » monte', at((step) => step.slots[1] === 'monte'), 420],
    ['« Appeler » se déplie', at((step) => step.widths[0] !== '56px'), 870],
    ['le texte d’« Appeler » paraît', at((step) => step.texts[0] === 'texte'), 910],
    ['« Envoyer un message » se déplie', at((step) => step.widths[1] !== '56px'), 940],
    ['le texte d’« Envoyer un message » paraît', at((step) => step.texts[1] === 'texte'), 980],
    ['le reflet passe', shines[0]?.t ?? null, 1650],
  ];
  let previous = 0;
  for (const [what, t, nominal] of times) {
    if (t === null || t < nominal - 40 || t > nominal + 400 || t < previous) problems.push(`${name}: ${what} à ${t} ms au lieu de ${nominal}`);
    previous = t ?? previous;
  }
  if (shines.length !== 1) problems.push(`${name}: le reflet passe ${shines.length} fois au lieu d'une`);
}

/**
 * Repli au défilement (ContactBarScroll de l'app) : 12 px vers le bas ne suffisent pas, 13 replient les capsules en
 * ronds de 56 px, sans texte ; repliée, la barre suit la descente et une remontée de plus de 12 px la déplie ; tout en
 * bas et en haut, dépliée. Repliées, les capsules restent touchables.
 */
async function checkDuoFold(page, name, { shot = null } = {}) {
  // Largeurs dépliées, en haut de la fiche.
  await page.evaluate(() => window.scrollTo(0, 0));
  await duoStill(page).catch(() => problems.push(`${name}: barre pas dépliée en haut de la fiche`));
  const widths = await page.$$eval('.duo-bar .duo-capsule', (els) => els.map((el) => el.getBoundingClientRect().width));
  const steps = [
    [0, false, 'en haut'], [12, false, '12 px vers le bas'], [13, true, '13 px vers le bas'], [300, true, 'en descendant'],
    [290, true, '10 px vers le haut'], [287, false, '13 px vers le haut'], [400, true, '113 px vers le bas'], ['bas', false, 'tout en bas'],
    [0, false, 'revenue en haut'],
  ];
  let shotTaken = false;
  for (const [target, folded, what] of steps) {
    await page.evaluate((target) => window.scrollTo(0, target === 'bas' ? document.documentElement.scrollHeight : target), target);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    try {
      await duoStill(page, folded ? 0 : 2);
    } catch {
      problems.push(`${name}: barre ${folded ? 'pas repliée' : 'pas dépliée'} ${what}`);
      continue;
    }
    const now = await page.evaluate(() => [...document.querySelectorAll('.duo-bar .duo-capsule')].map((el) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, hit: el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) };
    }));
    const wanted = folded ? [56, 56] : widths;
    if (now.some((capsule, index) => Math.abs(capsule.width - wanted[index]) > 0.6 || !capsule.hit)) {
      problems.push(`${name}: ${what}, capsules ${JSON.stringify(now)} au lieu de ${wanted.map((w) => Math.round(w * 10) / 10).join(' et ')} px touchables`);
    }
    if (folded && shot && !shotTaken) {
      await page.screenshot({ path: join(out, shot) });
      shotTaken = true;
    }
  }
}

/**
 * Appui sans relâcher : « Appeler » s'enfonce à 95 %, « Envoyer un message » à 96 %, et leur fond fonce ; avec
 * « Réduire les animations », seule la couleur change. Le doigt glisse hors de la capsule avant d'être levé : la
 * capsule revient et rien ne s'ouvre.
 */
async function checkDuoPress(page, name, { reduced = false, shot = null } = {}) {
  for (const [selector, scale, what] of [['.duo-bar .duo-call', 0.95, 'Appeler'], ['.duo-bar .duo-message', 0.96, 'Envoyer un message']]) {
    const box = await page.locator(selector).boundingBox();
    const rest = await page.$eval(`${selector} .duo-face`, (el) => getComputedStyle(el).backgroundColor);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(300);
    const pressed = await page.$eval(selector, (el) => ({ pressed: el.classList.contains('is-pressed'), transform: getComputedStyle(el).transform, face: getComputedStyle(el.querySelector('.duo-face')).backgroundColor }));
    if (shot && what === 'Appeler') await page.screenshot({ path: join(out, shot) });
    await page.mouse.move(box.x + box.width / 2, box.y - 200, { steps: 4 });
    await page.mouse.up();
    const wanted = reduced ? 'none' : `matrix(${scale}, 0, 0, ${scale}, 0, 0)`;
    if (!pressed.pressed || pressed.transform !== wanted || pressed.face === rest) problems.push(`${name}: appui sur « ${what} » ${JSON.stringify(pressed)} (${wanted} et un fond autre que ${rest} attendus)`);
    await duoStill(page).catch(() => undefined);
    const after = await page.$eval(selector, (el) => ({ pressed: el.classList.contains('is-pressed'), transform: getComputedStyle(el).transform, face: getComputedStyle(el.querySelector('.duo-face')).backgroundColor }));
    if (after.pressed || !['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(after.transform) || after.face !== rest) problems.push(`${name}: « ${what} » ne revient pas après l'appui (${JSON.stringify(after)})`);
  }
  if (await page.$('dialog[open]')) problems.push(`${name}: une fenêtre s'ouvre alors que le doigt a glissé hors de la capsule`);
}

/**
 * Barre blanche de sa propre annonce (actionBar de l'app) : toute la largeur, en bas de l'écran, blanche ; deux boutons
 * de 46 px à 16 px des bords et 10 px l'un de l'autre, rayon 12, texte de 14 px gras ; « Voir les demandes » bleu
 * clair, « Gérer l'annonce » bleu. Pas de barre Duo.
 */
async function checkOwnerBar(page, name) {
  const m = await page.evaluate(() => {
    const bar = document.querySelector('.owner-bar');
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    return {
      viewport: [innerWidth, innerHeight], bar: [r.left, r.right, r.bottom], background: getComputedStyle(bar).backgroundColor,
      position: getComputedStyle(bar).position, duo: Boolean(document.querySelector('.duo-bar, .duo-capsule')),
      buttons: [...bar.querySelectorAll('.owner-bar-button')].map((el) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return { left: box.left, right: box.right, height: box.height, look: `${style.borderRadius} ${style.fontWeight} ${style.fontSize} ${style.backgroundColor} ${style.color}`, text: el.textContent.trim() };
      }),
    };
  });
  if (!m) {
    problems.push(`${name}: pas de barre blanche`);
    return;
  }
  const [vw, vh] = m.viewport;
  const near = (a, b) => Math.abs(a - b) <= 0.6;
  if (m.position !== 'fixed' || !near(m.bar[0], 0) || !near(m.bar[1], vw) || !near(m.bar[2], vh) || m.background !== 'rgb(255, 255, 255)') problems.push(`${name}: barre blanche ${JSON.stringify(m)}`);
  if (m.duo) problems.push(`${name}: la barre Duo est affichée sur sa propre annonce`);
  expectJSON(name, 'boutons de la barre blanche', m.buttons.map((button) => [button.text, button.look]), [
    ['Voir les demandes', '12px 700 14px rgb(238, 242, 250) rgb(60, 92, 176)'], ['Gérer l\'annonce', '12px 700 14px rgb(60, 92, 176) rgb(255, 255, 255)'],
  ]);
  const [requests, manage] = m.buttons;
  if (!requests || !manage || !near(requests.left, 16) || !near(manage.right, vw - 16) || !near(manage.left - requests.right, 10)
    || !near(requests.right - requests.left, manage.right - manage.left) || requests.height !== 46 || manage.height !== 46) {
    problems.push(`${name}: boutons de la barre blanche ${JSON.stringify(m.buttons.map(({ left, right, height }) => ({ left, right, height })))} (46 px, 16 px des bords, 10 px entre eux)`);
  }
}

/**
 * Pastille « Demander » : 32 px, comme « Agenda » à côté d'elle (téléphone : 13 px gras, aux couleurs des pastilles de
 * la fiche ; ordinateur : celles de la colonne).
 */
const PHONE_PILL = '32 13px 700 rgb(238, 242, 250) rgb(60, 92, 176)';
const DESKTOP_PILL = '32 14px 600 rgb(238, 242, 250) rgb(60, 92, 176)';

/** Pastille « Demander » de la carte « Aucune visite prévue » (agendaCard de l'app) : la capsule d'« Agenda ». */
async function checkVisitRequestPill(page, name, selector, look) {
  const pill = await page.$eval(selector, (el) => {
    const style = getComputedStyle(el);
    return `${el.tagName} ${el.textContent} | ${el.getAttribute('aria-label')} | ${Math.round(el.getBoundingClientRect().height)} ${style.fontSize} ${style.fontWeight} ${style.backgroundColor} ${style.color}`;
  }).catch(() => null);
  expect(name, 'pastille « Demander »', pill, `BUTTON Demander | Demander une visite | ${look}`);
}

/** Réponse du serveur quand la conversation est refusée (start_listing_conversation) : son message, en français. */
const REFUSED_CONVERSATION = { code: 'P0001', message: 'Annonce introuvable.', details: null, hint: null };
const CONVERSATION_ROUTE = '**/rest/v1/rpc/start_listing_conversation';

/**
 * Échecs de l'ouverture de la conversation sur la vente SALE (`suffix` : telephone ou ordinateur) : refus du serveur
 * (après une attente, pour voir les points dans la bulle), réseau coupé, puis « Faire une offre » refusée depuis la
 * fiche et depuis son adresse ; enfin un nouvel essai réussi ouvre `retryConversation` dans Messages.
 */
async function checkConversationFailures(context, suffix, { message, offer, listing, retryConversation }) {
  const quiet = /status of 400|ERR_INTERNET_DISCONNECTED/;
  const title = 'Impossible d\'ouvrir la conversation';
  const offline = 'La conversation n\'a pas pu s\'ouvrir. Vérifiez votre connexion.';
  let name = `conversation-refusee-${suffix}`;
  let page = await open(context, `/annonce/?id=${SALE}`, name, { init: recordDuo, quiet });
  await ready(page, name);
  await duoStill(page).catch(() => undefined);
  const address = page.url();
  let release = null;
  const answered = new Promise((resolve) => { release = resolve; });
  await page.route(CONVERSATION_ROUTE, async (route) => {
    await answered;
    await json(route, REFUSED_CONVERSATION, 400);
  });
  // Moment du clic, puis celui où les points paraissent dans la bulle.
  await page.evaluate((selector) => {
    const button = document.querySelector(selector);
    let clicked = null;
    window.dotsAfter = null;
    button.addEventListener('click', () => { clicked = performance.now(); }, { capture: true, once: true });
    new MutationObserver((records, observer) => {
      if (clicked !== null && button.querySelector('.duo-dots')) {
        window.dotsAfter = performance.now() - clicked;
        observer.disconnect();
      }
    }).observe(button, { childList: true, subtree: true });
  }, message);
  await page.click(message);
  await page.waitForSelector(`${message} .duo-dots`, { timeout: 5000 }).catch(() => problems.push(`${name}: pas de points dans la bulle pendant l'ouverture`));
  const dotsAfter = await page.evaluate(() => window.dotsAfter);
  if (dotsAfter === null || dotsAfter < 140 || dotsAfter > 1500) problems.push(`${name}: points ${dotsAfter === null ? 'absents' : `${Math.round(dotsAfter)} ms`} après le clic (0,15 s attendues)`);
  await page.waitForTimeout(400);
  // Les trois points sautillent, décalés (pas avec « Réduire les animations »).
  expect(name, 'points qui sautillent', await page.evaluate(() => window.duoEffects.filter((effect) => effect.kind === 'point').length), 3);
  const viewport = page.viewportSize();
  if (suffix === 'telephone') await page.screenshot({ path: join(out, 'duo-points-telephone.png'), clip: { x: 0, y: viewport.height - 140, width: viewport.width, height: 140 } });
  else await page.locator('.dl-contact').screenshot({ path: join(out, 'duo-points-ordinateur.png') });
  release();
  expect(name, 'titre de l’alerte', await dialogTitle(page), title);
  expect(name, 'message du serveur', await page.textContent('dialog[open] .alert-body p'), REFUSED_CONVERSATION.message);
  expect(name, 'boutons de l’alerte', await page.$$eval('dialog[open] .alert-actions .btn', (els) => els.map((el) => el.textContent.trim()).join(' | ')), 'OK');
  if (await page.$('.duo-dots')) problems.push(`${name}: les points restent après l'échec`);
  expect(name, 'adresse après l’échec', page.url(), address);
  await page.screenshot({ path: join(out, `${name}.png`) });
  await expectAlertStays(page, name, title);
  await closeAlert(page);

  // Réseau coupé : le message de la connexion.
  name = `conversation-sans-reseau-${suffix}`;
  await page.unroute(CONVERSATION_ROUTE);
  await page.route(CONVERSATION_ROUTE, (route) => route.abort('internetdisconnected'));
  await page.click(message);
  expect(name, 'titre de l’alerte', await dialogTitle(page), title);
  expect(name, 'message', await page.textContent('dialog[open] .alert-body p'), offline);
  expect(name, 'adresse après l’échec', page.url(), address);
  await closeAlert(page);

  // « Faire une offre » refusée : l'écran de l'offre ne s'ouvre pas, la fiche montre l'alerte.
  name = `offre-refusee-${suffix}`;
  await page.unroute(CONVERSATION_ROUTE);
  await page.route(CONVERSATION_ROUTE, (route) => json(route, REFUSED_CONVERSATION, 400));
  await page.click(offer);
  expect(name, 'titre de l’alerte', await dialogTitle(page), title);
  expect(name, 'message du serveur', await page.textContent('dialog[open] .alert-body p'), REFUSED_CONVERSATION.message);
  expect(name, 'adresse après l’échec', page.url(), address);
  if (await page.$('.dl-offer-screen')) problems.push(`${name}: l'écran de l'offre s'ouvre malgré l'échec`);
  await closeAlert(page);

  // Nouvel essai qui réussit : la conversation s'ouvre dans Messages.
  await page.unroute(CONVERSATION_ROUTE);
  await page.click(message);
  await waitForAddress(page, `${base}/messages/?c=${retryConversation}`);
  await page.close();

  // Adresse de l'offre ouverte directement, conversation refusée : la fiche (sans &vue=offre) et l'alerte.
  name = `adresse-offre-refusee-${suffix}`;
  page = await open(context, `/annonce/?id=${SALE}&vue=offre`, name, { quiet, before: (p) => p.route(CONVERSATION_ROUTE, (route) => json(route, REFUSED_CONVERSATION, 400)) });
  expect(name, 'titre de l’alerte', await dialogTitle(page), title);
  await page.waitForSelector(listing);
  expect(name, 'adresse', page.url(), `${base}/annonce/?id=${SALE}`);
  await closeAlert(page);
  await page.close();
}

/**
 * Mesures de la fiche sur ordinateur (maquette 2, à 1440 px) : contenu de 1200 px au plus, galerie de 466 px (la grande
 * photo sur les deux tiers, deux photos l'une sur l'autre ; une seule en dessous de trois photos), colonne de droite de
 * 380 px, titre en 36, prix en 40, boutons de 48 px (sa propre annonce) ou les deux capsules Duo de 56 px côte à côte.
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
      capsules: [...document.querySelectorAll('.dl-actions .duo-capsule')].map((el) => { const r = el.getBoundingClientRect(); return { top: r.top, h: r.height }; }),
    };
  });
  const content = Math.min(1200, width - 2 * (width >= 1280 ? 48 : 32));
  if (!m.inner || Math.abs(m.inner.w - content) > 1 || Math.abs(m.inner.x - (width - content) / 2) > 1) problems.push(`${name}: contenu ${JSON.stringify(m.inner)} au lieu de ${content} px centrés`);
  if (!m.gallery || Math.abs(m.gallery.h - 466) > 1) problems.push(`${name}: galerie de ${m.gallery?.h} px de haut au lieu de 466`);
  if (!m.aside || m.aside.w !== 380) problems.push(`${name}: colonne de droite de ${m.aside?.w} px au lieu de 380`);
  const gap = width >= 1280 ? 40 : 32;
  if (m.main && m.aside && Math.abs(m.aside.x - (m.main.x + m.main.w) - gap) > 1) problems.push(`${name}: ${Math.round(m.aside.x - m.main.x - m.main.w)} px entre les colonnes au lieu de ${gap}`);
  expect(name, 'taille du titre', m.title, '36px');
  expect(name, 'taille du prix', `${m.price} ${m.priceWeight}`, '40px 700');
  if (m.buttons.some((h) => h !== 48)) problems.push(`${name}: boutons de ${m.buttons.join(', ')} px au lieu de 48`);
  if (m.buttons.length + m.capsules.length === 0) problems.push(`${name}: ni boutons ni capsules dans la colonne de droite`);
  if (m.capsules.length && (m.capsules.length !== 2 || m.capsules.some((c) => c.h !== 56) || Math.abs(m.capsules[0].top - m.capsules[1].top) > 0.5)) {
    problems.push(`${name}: capsules ${JSON.stringify(m.capsules)} au lieu de deux capsules de 56 px côte à côte`);
  }
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

/** Écran de la colonne de 720 px (offre, visite, comparaison) : textes, débordements, colonne centrée de 688 px (720 avec ses marges de 16). */
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
    if (inner !== 688) found.push(`colonne de ${inner} px au lieu de 688`);
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
/**
 * Écran « Demander une visite » (page de la fiche) ou « Faire une offre » (feuille au-dessus de la fiche) sur téléphone :
 * rien ne déborde, pas de texte vide ou faux.
 */
async function checkPhoneScreen(page, name) {
  const issues = await page.evaluate(() => {
    const found = [];
    const text = document.body.innerText;
    for (const bad of ['NaN', 'undefined', 'null', 'Infinity', '[object']) if (text.includes(bad)) found.push(`le texte « ${bad} » est affiché`);
    if (document.documentElement.scrollWidth > window.innerWidth + 1) found.push(`la page déborde en largeur (${document.documentElement.scrollWidth} px pour ${window.innerWidth} px)`);
    const screen = document.querySelector('.listing-screen .dl-screen, dialog.offer-sheet[open] .dl-screen');
    if (!screen) return ['pas d’écran'];
    const box = screen.getBoundingClientRect();
    if (box.left < 0 || box.right > window.innerWidth + 0.5) found.push(`l’écran dépasse (${Math.round(box.left)} à ${Math.round(box.right)} px)`);
    for (const el of screen.querySelectorAll('button, a, input, select, textarea')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.left < box.left - 0.5 || r.right > box.right + 0.5) found.push(`« ${(el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40)} » sort de l’écran`);
    }
    // Bouton principal bleu (#3C5CB0) : les styles du téléphone (ecrans-fiche-telephone.css) s'appliquent.
    const submit = screen.querySelector('.dl-submit');
    if (!submit || getComputedStyle(submit).backgroundColor !== 'rgb(60, 92, 176)') found.push('les styles du téléphone ne s’appliquent pas au bouton principal');
    const tabbar = document.querySelector('.tabbar');
    if (tabbar && getComputedStyle(tabbar).display !== 'none') found.push('la barre d’onglets du site est visible');
    return found;
  });
  for (const issue of issues) problems.push(`${name}: ${issue}`);
}

/** Écran du téléphone : rien ne déborde, pas de texte vide ou faux. */
async function checkPhoneScreenWidth(page, name) {
  const issues = await page.evaluate(() => {
    const found = [];
    const text = document.body.innerText;
    for (const bad of ['NaN', 'undefined', 'null', 'Infinity', '[object']) if (text.includes(bad)) found.push(`le texte « ${bad} » est affiché`);
    if (document.documentElement.scrollWidth > window.innerWidth + 1) found.push(`la page déborde en largeur (${document.documentElement.scrollWidth} px pour ${window.innerWidth} px)`);
    return found;
  });
  for (const issue of issues) problems.push(`${name}: ${issue}`);
}

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
  // Le nom public tel que le serveur l'envoie (public_name, déjà réglé selon « Afficher mon nom complet »), sans être
  // raccourci une deuxième fois (n° 24).
  expect('vente-ordinateur', 'interlocuteur', await page.textContent('.publisher-head'), /Claire Essai.*Particulier.*Sur Nidalo depuis mars 2025.*1 annonce en ligne/);
  expect('vente-ordinateur', 'vendeur de la colonne', await page.textContent('.dl-aside .dl-seller-text'), /^Claire Essai\s*Particulier\s*Sur Nidalo depuis mars 2025$/);
  // Colonne de droite : les capsules « Appeler » et « Envoyer un message » de la barre Duo, côte à côte ; la visite se
  // demande avec « Demander » sur la carte « Aucune visite prévue », comme dans l'app.
  expect('vente-ordinateur', 'boutons de la colonne', await page.$$eval('.dl-aside .dl-button, .dl-aside .duo-capsule', (els) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent.trim()).join(' | ')), 'Appeler | Envoyer un message');
  await checkDuo(page, 'vente-ordinateur', { floating: false, seller: 'vendeur' });
  if (await page.$('.dl-aside .dl-visit, .dl-aside .dl-message, .dl-aside .dl-call')) problems.push('vente-ordinateur: les anciens boutons sont encore dans la colonne');
  expect('vente-ordinateur', 'carte des visites', await page.textContent('.dl-main .dl-visit-card'), 'Aucune visite prévueDemandez une visite au vendeur ou à l\'agence.Demander');
  await checkVisitRequestPill(page, 'vente-ordinateur', '.dl-main .dl-visit-request', DESKTOP_PILL);
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
  await page.click('.dl-aside .duo-call');
  expect('vente-ordinateur', 'fenêtre du téléphone', await dialogTitle(page), 'Numéro non disponible');
  expect('vente-ordinateur', 'message sans numéro', await page.textContent('dialog[open] .alert-body p'), 'Ce vendeur ne communique pas son numéro. Écrivez-lui sur Nidalo.');
  await page.screenshot({ path: join(out, 'vente-ordinateur-sans-numero.png') });
  await expectAlertStays(page, 'vente-ordinateur', 'Numéro non disponible');
  await closeAlert(page);
  await page.click('.dl-aside .duo-call');
  await dialogTitle(page);
  // « Envoyer un message » de la fenêtre : la même action que le bouton, donc la connexion d'abord.
  await expectSignIn(page, 'vente-ordinateur', 'Envoyer un message (fenêtre sans numéro)', 'dialog[open] .alert-actions .btn-primary');
  await expectSignIn(page, 'vente-ordinateur', 'Envoyer un message', '.dl-aside .duo-message');
  await page.click('.dl-main .dl-visit-request');
  await page.waitForSelector('dialog.signin-sheet[open] .signin-card', { timeout: 5000 }).catch(() => problems.push('vente-ordinateur: « Demander » n\'ouvre pas la connexion'));
  await page.screenshot({ path: join(out, 'vente-ordinateur-connexion.png') });
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.signin-sheet[open]', { state: 'detached' });
  if (page.url() !== `${base}/annonce/?id=${SALE}`) problems.push(`vente-ordinateur: adresse ${page.url()} après la connexion refermée`);
  await expectSignIn(page, 'vente-ordinateur', 'Enregistrer', '.dl-tools .dl-save');
  // « Signaler l'annonce », sous la note des risques : la connexion d'abord, comme dans l'app.
  await expectSignIn(page, 'vente-ordinateur', 'Signaler l\'annonce', '.dl .listing-report');
  await page.click('.dl-tools .dl-share');
  // Le message du bas de l'app (showToast), le même qu'au téléphone.
  await page.waitForSelector('.app-toast:not(.is-leaving)');
  expect('vente-ordinateur', 'message du partage', await page.textContent('.app-toast-text'), 'Lien de l’annonce copié');
  expect('vente-ordinateur', 'lien copié', await page.evaluate(() => navigator.clipboard.readText()), `${base}/annonce/?id=${SALE}`);
  await page.waitForSelector('.app-toast', { state: 'detached', timeout: 6000 }).catch(() => problems.push('vente-ordinateur: le message du partage ne disparaît pas'));
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
  if (await page.$('a.dl-call, a.duo-call')) problems.push('partage-ordinateur: un numéro est affiché sans compte');
  await page.click('.dl-tools .dl-share');
  await page.waitForFunction(() => !!window.sharedData);
  // Espaces insécables des nombres (Intl) ramenées à des espaces simples pour la comparaison.
  const shared = await page.evaluate(() => Object.fromEntries(Object.entries(window.sharedData).map(([key, value]) => [key, String(value).replace(/[  ]/g, ' ')])));
  expectJSON('partage-ordinateur', 'partage', shared, {
    title: 'Appartement 3 pièces à Lyon 2e · 238 000 €',
    text: 'Appartement 3 pièces · Lyon 2e (69002)\n238 000 € · 62 m² · 3 pièces\nÀ voir sur Nidalo',
    url: `${base}/annonce/?id=${FICHE}`,
  });
  if (await page.$('.app-toast')) problems.push('partage-ordinateur: le lien est copié alors que le navigateur a partagé');
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
  await checkMonthBar(page, 'investissement-ordinateur', { rentCaption: 'Loyer encaissé' });
  // Appartement vendu loué : « Vendu occupé » et « Loyer encaissé », comme l'app.
  expectJSON('investissement-ordinateur', 'situation locative', await page.$$eval('.features-item', (rows) => rows.map((row) => [row.querySelector('dt').textContent, row.querySelector('dd').textContent.replace(/[\u00a0\u202f]/g, ' ')])
    .filter(([title]) => ['Situation locative', 'Loyer encaissé', 'Loyer actuel', 'Fin du bail'].includes(title))), [['Situation locative', 'Vendu occupé'], ['Loyer encaissé', '850 €/mois']]);
  expect('investissement-ordinateur', 'interlocuteur', await page.textContent('.publisher-head'), /Agence Démo Immobilier.*PRO.*Votre contact : Paul Démo.*Lyon \(69002\).*2 annonces en ligne/);
  expect('investissement-ordinateur', 'agence de la colonne', await page.textContent('.dl-aside .dl-seller-text'), /^Agence Démo Immobilier\s*PRO\s*Votre contact : Paul Démo$/);
  await page.screenshot({ path: join(out, 'investissement-ordinateur-long.png'), fullPage: true });
  await checkSegment(page, 'investissement-ordinateur', { group: 'Durée', result: '.spec-simulator .spec-result-value' });
  // La ligne « Cash-flow » est partie (demande du 17/11) : l'apport change le reste sous la barre du mois type.
  await checkSegment(page, 'investissement-ordinateur', { group: 'Apport', result: '.month-bar-flow' });
  await checkMonthBar(page, 'investissement-ordinateur', { rentCaption: 'Loyer encaissé' });
  await expectSignIn(page, 'investissement-ordinateur', 'Envoyer un message (agence)', '.dl-aside .duo-message');
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
  // Location : « propriétaire » au lieu de « vendeur » (n° 74), dans la colonne, la carte des visites, l'interlocuteur
  // et la fenêtre sans numéro.
  await checkDuo(page, 'location-ordinateur', { floating: false, seller: 'propriétaire' });
  expect('location-ordinateur', 'carte des visites', await page.textContent('.dl-main .dl-visit-card'), 'Aucune visite prévueDemandez une visite au propriétaire ou à l\'agence.Demander');
  expect('location-ordinateur', 'bouton de l’interlocuteur', await page.textContent('.publisher .btn-primary'), 'Contacter le propriétaire');
  await page.click('.dl-aside .duo-call');
  expect('location-ordinateur', 'fenêtre du téléphone', await dialogTitle(page), 'Numéro non disponible');
  expect('location-ordinateur', 'message sans numéro', await page.textContent('dialog[open] .alert-body p'), 'Ce propriétaire ne communique pas son numéro. Écrivez-lui sur Nidalo.');
  await closeAlert(page);
  // « Simuler mon dossier » : 2,4 fois, 3 fois (arrondi à la centaine supérieure, choisi d'office) et 3,6 fois le loyer
  // charges comprises (640 + 50 €), chacun une fois (n° 181).
  expect('location-ordinateur', 'revenus proposés', await page.$$eval('.spec-segments[aria-label="Revenus"] .spec-segment',
    (els) => els.map((el) => `${el.textContent}${el.getAttribute('aria-pressed') === 'true' ? '*' : ''}`).join(' | ')), '1 700 € | 2 100 €* | 2 500 €');
  await page.screenshot({ path: join(out, 'location-ordinateur-long.png'), fullPage: true });
  await checkSegment(page, 'location-ordinateur', { group: 'Revenus', result: '.spec-simulator .spec-result-value' });
  await checkMap(page, 'location-ordinateur', { coordinate: [45.7485, 4.8412], approximate: false, shots: true });
  await page.close();

  // Partage d'une location (n° 69) : le loyer charges comprises, quand les charges sont connues.
  page = await open(desktop, `/annonce/?id=${RENTAL}`, 'partage-location-ordinateur', {
    init: () => {
      Object.defineProperty(navigator, 'share', { value: (data) => { window.sharedData = data; return Promise.resolve(); }, configurable: true });
    },
  });
  await ready(page, 'partage-location-ordinateur');
  await page.click('.dl-tools .dl-share');
  await page.waitForFunction(() => !!window.sharedData);
  expectJSON('partage-location-ordinateur', 'partage', await page.evaluate(() => Object.fromEntries(Object.entries(window.sharedData).map(([key, value]) => [key, String(value).replace(/[\u00a0\u202f]/g, ' ')]))), {
    title: 'Studio meublé à Lyon 7e · 690 €/mois charges comprises',
    text: 'Studio meublé · Lyon 7e (69007)\n690 €/mois charges comprises · 24 m² · 1 pièce\nÀ voir sur Nidalo',
    url: `${base}/annonce/?id=${RENTAL}`,
  });
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

  page = await open(phone, `/annonce/?id=${SALE}`, 'vente-telephone', { init: recordDuo });
  await ready(page, 'vente-telephone');
  await common(page, 'vente-telephone', { phone: true });
  await fitted(page, 'vente-telephone');
  // Barre de contact « Duo » : l'arrivée de l'app, puis ses mesures une fois arrivée.
  await checkDuoArrival(page, 'vente-telephone');
  await checkDuo(page, 'vente-telephone', { floating: true, seller: 'vendeur' });
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
  // Sans compte, comme sur ordinateur : « Envoyer un message », « Demander » (carte des visites) et « Faire une offre »
  // ouvrent d'abord la connexion ; « Appeler » n'a pas de numéro (le serveur ne le donne qu'avec un compte) et propose
  // d'écrire.
  expect('vente-telephone', 'boutons de la barre', await page.$$eval('.action-bar .duo-capsule', (els) => els.map((el) => el.getAttribute('aria-label')).join(' | ')), 'Appeler | Envoyer un message');
  expect('vente-telephone', 'offre', await page.textContent('.header-card button.hc-offer'), 'Faire une offre');
  expect('vente-telephone', 'carte des visites', await page.textContent('.visit-card .visit-text'), 'Aucune visite prévueDemandez une visite au vendeur ou à l\'agence.');
  await checkVisitRequestPill(page, 'vente-telephone', '.visit-card .visit-request', PHONE_PILL);
  // Clic plutôt que toucher pour les captures : le reflet bleu du toucher de Chromium y resterait affiché.
  await page.click('.visit-card .visit-request');
  await page.waitForSelector('dialog.signin-sheet[open] .signin-card', { timeout: 5000 }).catch(() => problems.push('vente-telephone: « Demander » n\'ouvre pas la connexion'));
  await page.screenshot({ path: join(out, 'vente-telephone-connexion.png') });
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.signin-sheet[open]', { state: 'detached' });
  if (page.url() !== `${base}/annonce/?id=${SALE}`) problems.push(`vente-telephone: adresse ${page.url()} après la connexion refermée`);
  await expectSignIn(page, 'vente-telephone', 'Envoyer un message', '.duo-bar .duo-message');
  await expectSignIn(page, 'vente-telephone', 'Faire une offre', '.header-card .hc-offer');
  if (await page.$('.action-bar a.duo-call, .action-bar a.action-bar-item')) problems.push('vente-telephone: un numéro est proposé sans compte');
  await page.click('.duo-bar .duo-call');
  expect('vente-telephone', 'fenêtre du téléphone', await dialogTitle(page), 'Numéro non disponible');
  // Le reflet de l'arrivée, la bulle qui grossit (« Envoyer un message »), la sonnerie et ses deux ondes (« Appeler »).
  expectJSON('vente-telephone', 'animations de la barre', await page.evaluate(() => window.duoEffects.map((effect) => effect.kind)), ['reflet', 'bulle', 'sonnerie', 'onde', 'onde']);
  expect('vente-telephone', 'message sans numéro', await page.textContent('dialog[open] .alert-body p'), 'Ce vendeur ne communique pas son numéro. Écrivez-lui sur Nidalo.');
  expect('vente-telephone', 'boutons sans numéro', await page.$$eval('dialog[open] .alert-actions .btn', (els) => els.map((el) => el.textContent.trim()).join(' | ')), 'Envoyer un message | Fermer');
  await page.screenshot({ path: join(out, 'vente-telephone-sans-numero.png') });
  await expectAlertStays(page, 'vente-telephone', 'Numéro non disponible');
  await expectSignIn(page, 'vente-telephone', 'Envoyer un message (fenêtre sans numéro)', 'dialog[open] .alert-actions .btn-primary');
  if (await page.$('dialog.alert-dialog[open]')) problems.push('vente-telephone: la fenêtre sans numéro reste ouverte');
  await checkMap(page, 'vente-telephone', { coordinate: [45.7597, 4.8491], approximate: true, shots: true });
  // Repli en ronds au défilement, puis l'appui (le doigt glisse hors de la capsule : rien ne s'ouvre).
  await checkDuoFold(page, 'vente-telephone', { shot: 'duo-repliee-telephone.png' });
  await checkDuoPress(page, 'vente-telephone', { shot: 'duo-appui-telephone.png' });
  await page.close();

  // « Voir le profil » (carte « Votre interlocuteur ») : le profil public de l'app à son adresse (&vue=profil), sans
  // compte ; « Ses annonces » (celles du vendeur), « Contacter le vendeur » demande la connexion, le retour revient à
  // la fiche. Sa photo ou son nom ouvrent le même écran.
  page = await open(phone, `/annonce/?id=${SALE}`, 'profil-telephone');
  await ready(page, 'profil-telephone');
  await page.tap('.publisher-buttons .btn-light');
  await waitForAddress(page, `${base}/annonce/?id=${SALE}&vue=profil`);
  await page.waitForSelector('.listing-profile .profile-name');
  expect('profil-telephone', 'titre', await page.textContent('.listing-profile .app-page-header-title'), 'Profil');
  expect('profil-telephone', 'en-tête', await page.textContent('.profile-head'), /^CEClaire EssaiParticulierSur Nidalo depuis mars 2025$/);
  expect('profil-telephone', 'titre de la page', await page.title(), 'Profil · Appartement lumineux avec balcon · Nidalo');
  await page.waitForFunction(() => !document.querySelector('.profile-listings .account-spinner'));
  expect('profil-telephone', 'ses annonces', await page.textContent('.profile-listings h2'), 'Ses annonces · 1');
  expect('profil-telephone', 'carte de son annonce', await page.getAttribute('.profile-listings a', 'href'), `/annonce/?id=${SALE}`);
  if (await page.$('.action-bar, .header-card')) problems.push('profil-telephone: la fiche reste affichée sous le profil');
  await fullShot(page, 'profil-telephone.png');
  await expectSignIn(page, 'profil-telephone', 'Contacter le vendeur', '.screen-bottom-bar .btn-primary');
  await page.tap('.listing-profile .app-page-header .app-round');
  await waitForAddress(page, `${base}/annonce/?id=${SALE}`);
  await page.waitForSelector('.header-card .hc-price-value');
  await page.tap('.publisher-head');
  await waitForAddress(page, `${base}/annonce/?id=${SALE}&vue=profil`);
  await page.close();

  page = await open(phone, `/annonce/?id=${LEASED}&mode=invest`, 'investissement-telephone');
  await ready(page, 'investissement-telephone');
  await common(page, 'investissement-telephone', { phone: true });
  await fitted(page, 'investissement-telephone');
  await checkDuo(page, 'investissement-telephone', { floating: true, seller: 'vendeur' });
  await checkMonthBar(page, 'investissement-telephone', { rentCaption: 'Loyer encaissé' });
  await partShot(page, '.spec-card', 'investissement-telephone-mois-type.png');
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
  // Location : « propriétaire » (n° 74) dans l'indice de « Envoyer un message », la carte des visites et l'interlocuteur.
  await checkDuo(page, 'location-telephone', { floating: true, seller: 'propriétaire' });
  expect('location-telephone', 'carte des visites', await page.textContent('.visit-card .visit-text'), 'Aucune visite prévueDemandez une visite au propriétaire ou à l\'agence.');
  expect('location-telephone', 'bouton de l’interlocuteur', await page.textContent('.publisher .btn-primary'), 'Contacter le propriétaire');
  await page.screenshot({ path: join(out, 'location-telephone.png') });
  await page.screenshot({ path: join(out, 'location-telephone-long.png'), fullPage: true });
  await page.tap('.gallery-action[aria-label="Partager l\'annonce"]');
  expect('location-telephone', 'fenêtre du partage', await dialogTitle(page), 'Partager l’annonce');
  expect('location-telephone', 'lien à copier', await page.inputValue('dialog[open] input.copy-link'), `${base}/annonce/?id=${RENTAL}`);
  await page.screenshot({ path: join(out, 'location-telephone-partage.png') });
  await expectAlertStays(page, 'location-telephone', 'Partager l’annonce');
  await closeAlert(page);
  await page.close();

  page = await open(phone, `/annonce/?id=${HOTEL}`, 'hotel-telephone');
  await ready(page, 'hotel-telephone');
  await common(page, 'hotel-telephone', { phone: true });
  await fitted(page, 'hotel-telephone');
  await checkDuo(page, 'hotel-telephone', { floating: true, seller: 'vendeur' });
  await page.screenshot({ path: join(out, 'hotel-telephone.png') });
  await page.screenshot({ path: join(out, 'hotel-telephone-long.png'), fullPage: true });
  await partShot(page, '.listing-category', 'hotel-telephone-cartes.png');
  await page.close();

  page = await open(phone, `/annonce/?id=${HOUSE}&mode=invest`, 'maison-telephone');
  await ready(page, 'maison-telephone');
  await common(page, 'maison-telephone', { phone: true });
  await fitted(page, 'maison-telephone');
  await checkDuo(page, 'maison-telephone', { floating: true, seller: 'vendeur' });
  await page.screenshot({ path: join(out, 'maison-telephone-long.png'), fullPage: true });
  await page.close();

  await checkStates(phone, 'telephone');

  // Adresse d'un écran ouverte sans compte, sur téléphone aussi : la fiche, puis la connexion.
  for (const view of ['visite', 'offre']) {
    const name = `adresse-${view}-sans-compte-telephone`;
    page = await open(phone, `/annonce/?id=${SALE}&vue=${view}`, name);
    await ready(page, name);
    await page.waitForSelector('dialog.signin-sheet[open] .signin-card', { timeout: 5000 }).catch(() => problems.push(`${name}: la connexion ne s'ouvre pas`));
    expect(name, 'adresse', page.url(), `${base}/annonce/?id=${SALE}`);
    if (await page.$('.dl-screen')) problems.push(`${name}: l'écran s'affiche sans compte`);
    if (await page.$('.soon-page')) problems.push(`${name}: un message « bientôt » est affiché`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog.signin-sheet[open]', { state: 'detached' });
    await page.close();
  }

  // Comparer ouvert sur téléphone : l'écran de l'app (CompareView, étape 2 du site comme l'app), vide sans bien
  // choisi ; plus de message « bientôt ».
  for (const [path, name, title] of [
    ['/comparer/', 'comparer-telephone', 'Comparer'],
  ]) {
    page = await open(phone, path, name);
    await page.waitForSelector('.cmpm h1');
    expect(name, 'titre', await page.textContent('.cmpm h1'), title);
    expect(name, 'vide', await page.textContent('.cmpm-empty h2'), 'Comparez vos biens préférés');
    expect(name, 'titre de la page', await page.title(), `${title} · Nidalo`);
    if (await page.$('.soon-page, .dl, .dl-screen, .cmp, .action-bar')) problems.push(`${name}: un message « bientôt » ou un autre écran`);
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
    // 320 px : « Message », le titre complet n'a pas 14 px de chaque côté (comme l'app sur iPhone SE).
    expect(name, 'titre de « Envoyer un message »', await checkDuo(page, name, { floating: true, seller: name.startsWith('location') ? 'propriétaire' : 'vendeur' }), 'Message');
    await page.screenshot({ path: join(out, `${name}.png`) });
    await partShot(page, '.listing-category', `${name}-carte.png`);
    await page.close();
  }
  await small.close();

  // Grand téléphone (430 px) et tablette (768 px) : « Envoyer un message » en entier ; sur tablette, les capsules
  // gardent 520 px au centre, comme l'ancienne barre.
  for (const [device, name] of [['iPhone 14 Pro Max', 'grand-telephone'], ['iPad Mini', 'tablette']]) {
    const context = await browser.newContext({ ...devices[device], locale: 'fr-FR' });
    await mock(context);
    page = await open(context, `/annonce/?id=${SALE}`, name);
    await ready(page, name);
    await common(page, name, { phone: true });
    expect(name, 'titre de « Envoyer un message »', await checkDuo(page, name, { floating: true, seller: 'vendeur' }), 'Envoyer un message');
    await page.screenshot({ path: join(out, `${name}.png`) });
    await page.close();
    await context.close();
  }

  // « Réduire les animations » (prefers-reduced-motion, le réglage de l'app) : la barre arrive dépliée, en fondu, sans
  // reflet ; elle ne se replie pas au défilement ; l'appui ne change que la couleur ; « Appeler » ne sonne pas.
  const still = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', reducedMotion: 'reduce' });
  await mock(still);
  page = await open(still, `/annonce/?id=${SALE}`, 'barre-reduite-telephone', { init: recordDuo });
  await ready(page, 'barre-reduite-telephone');
  await checkDuoArrival(page, 'barre-reduite-telephone', { reduced: true });
  await checkDuo(page, 'barre-reduite-telephone', { floating: true, seller: 'vendeur' });
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(700);
  expect('barre-reduite-telephone', 'textes après 400 px de défilement', await page.$$eval('.duo-bar .duo-text.is-shown', (els) => els.length), 2);
  await page.screenshot({ path: join(out, 'duo-reduit-telephone.png') });
  await checkDuoPress(page, 'barre-reduite-telephone', { reduced: true });
  await page.click('.duo-bar .duo-call');
  expect('barre-reduite-telephone', 'fenêtre du téléphone', await dialogTitle(page), 'Numéro non disponible');
  await closeAlert(page);
  expectJSON('barre-reduite-telephone', 'animations de la barre', await page.evaluate(() => window.duoEffects.map((effect) => effect.kind)), []);
  await page.close();
  await still.close();

  // Navigateur réglé en français, pour la suite (téléphone et ordinateur avec le compte de test) : le champ de date s'y
  // affiche « 19/11/2026 » (jour, mois), comme chez un visiteur français ; le navigateur par défaut l'écrit à
  // l'américaine (mois, jour).
  frenchBrowser = await chromium.launch({ env: { ...process.env, LANG: 'fr_FR.UTF-8', LANGUAGE: 'fr_FR:fr', LC_ALL: 'fr_FR.UTF-8' } });

  // Téléphone avec le compte de test (offre en attente et visite confirmée sur FICHE) : la fiche lit le compte comme sur
  // ordinateur, et montre l'état de l'offre et de la visite (offerStateLabel et agendaCard de l'app).
  const phoneMember = await frenchBrowser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await mock(phoneMember);
  await signIn(phoneMember, seededState());
  let phoneMark = calls.length;
  page = await open(phoneMember, `/annonce/?id=${FICHE}`, 'fiche-telephone-connecte');
  await ready(page, 'fiche-telephone-connecte');
  await page.waitForSelector('.header-card a.hc-offer');
  await common(page, 'fiche-telephone-connecte', { phone: true });
  await checkHiddenStreet(page, 'fiche-telephone-connecte');
  if (await page.$('.dl')) problems.push('fiche-telephone-connecte: la fiche de l’ordinateur est affichée sur téléphone');
  for (const table of ['rpc/my_conversations', 'rpc/my_offers', 'rpc/my_visit_requests', 'agenda_visits']) {
    if (!since(phoneMark, table).length) problems.push(`fiche-telephone-connecte: ${table} n'est pas lu`);
  }
  for (const table of ['rpc/start_listing_conversation', 'rpc/make_offer', 'rpc/create_visit_request']) {
    if (since(phoneMark, table).length) problems.push(`fiche-telephone-connecte: ${table} appelé sans action`);
  }
  expect('fiche-telephone-connecte', 'offre', await page.textContent('.header-card a.hc-offer'), 'Offre en attente');
  expect('fiche-telephone-connecte', 'lien de l’offre', await page.getAttribute('.header-card a.hc-offer', 'href'), `/messages/?c=${conversationId(1)}`);
  expect('fiche-telephone-connecte', 'carte des visites', await page.textContent('.visit-card .visit-subtitle'), 'Visite prévue · Visite confirmée');
  // « Agenda » ouvre Mon agenda, comme sur ordinateur (Mon agenda marche sur téléphone depuis le 14 novembre).
  expect('fiche-telephone-connecte', 'bouton Agenda', await page.$$eval('.visit-card a', (links) => links.map((link) => `${link.className} ${link.textContent} ${link.getAttribute('href')}`).join(' | ')),
    'visit-agenda Agenda /compte/?vue=agenda');
  // Avec un compte, le numéro de l'agence : « Appeler » l'appelle.
  await checkDuo(page, 'fiche-telephone-connecte', { floating: true, seller: 'vendeur' });
  expect('fiche-telephone-connecte', 'appel', await page.getAttribute('.duo-bar a.duo-call', 'href'), 'tel:0639984567');
  await page.screenshot({ path: join(out, 'fiche-telephone-connecte.png') });
  // La carte des visites et son bouton « Agenda », sous le résumé.
  await page.$eval('.header-card', (el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(out, 'telephone-fiche-agenda.png') });
  await page.close();
  // Une offre attend déjà une réponse : l'adresse de l'offre ouvre la conversation, qui la montre (comme l'app).
  page = await open(phoneMember, `/annonce/?id=${FICHE}&vue=offre`, 'adresse-offre-en-attente-telephone');
  await waitForAddress(page, `${base}/messages/?c=${conversationId(1)}`);
  await page.close();
  await phoneMember.close();

  // Téléphone, compte sans conversation ni offre : écrire, demander une visite et faire une offre, comme sur ordinateur.
  const phoneFresh = await frenchBrowser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await mock(phoneFresh);
  const phoneState = accountState();
  // Deux demandes reçues pour l'annonce du compte (« Voir les demandes », écran « Demande de visite »).
  phoneState.requests.push(receivedRequest(1), receivedRequest(2));
  await signIn(phoneFresh, phoneState);
  page = await open(phoneFresh, `/annonce/?id=${FICHE}`, 'fiche-telephone-actions');
  await ready(page, 'fiche-telephone-actions');
  expect('fiche-telephone-actions', 'offre', await page.textContent('.header-card button.hc-offer'), 'Faire une offre');
  expect('fiche-telephone-actions', 'carte des visites', await page.textContent('.visit-card .visit-text'), 'Aucune visite prévueDemandez une visite au vendeur ou à l\'agence.');
  if (await page.$('.visit-card a, a.visit-card')) problems.push('fiche-telephone-actions: la carte « Aucune visite prévue » est un lien');

  // « Demander » (carte « Aucune visite prévue ») : le formulaire à son adresse, create_visit_request, puis la
  // confirmation avec « Voir mon agenda », comme sur ordinateur ; « Fermer » revient à la fiche, dont la carte des
  // visites ouvre la demande.
  await checkVisitRequestPill(page, 'fiche-telephone-actions', '.visit-card .visit-request', PHONE_PILL);
  phoneMark = calls.length;
  await page.tap('.visit-card .visit-request');
  await waitForAddress(page, `${base}/annonce/?id=${FICHE}&vue=visite`);
  await page.waitForSelector('.listing-screen .dl-visit-screen h1');
  expect('visite-telephone', 'titre', await page.textContent('.dl-visit-screen h1'), 'Demander une visite');
  expect('visite-telephone', 'titre de la page', await page.title(), 'Demander une visite · Appartement 3 pièces · Nidalo');
  expect('visite-telephone', 'bien', await page.textContent('.dl-visit-listing-text'), 'Appartement 3 piècesLyon 2e238 000 €');
  expect('visite-telephone', 'sections', await page.$$eval('.dl-visit-screen .dl-form-section h2', (els) => els.map((el) => el.textContent).join(' | ')), 'Créneau souhaité | Type de visite | Message (facultatif)');
  if (await page.$('.action-bar, .header-card')) problems.push('visite-telephone: la fiche reste affichée sous le formulaire');
  await checkPhoneScreen(page, 'visite-telephone');
  // Heures des créneaux écrites « 10 h 00 », de 8 h 00 à 20 h 00 (n° 177).
  const hours = await page.locator('.dl-slot').nth(0).locator('select option').allTextContents();
  expect('visite-telephone', 'heures proposées', `${hours[0]} … ${hours.at(-1)} (${hours.length})`, '8 h 00 … 20 h 00 (25)');
  const phoneDay = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await page.locator('.dl-slot').nth(0).locator('input.dl-date').fill(phoneDay);
  await page.locator('.dl-slot').nth(0).locator('select').selectOption('1080');
  expect('visite-telephone', 'heure choisie', await page.locator('.dl-slot').nth(0).locator('select').getAttribute('aria-label'), 'Heure : 18 h 00');
  await page.fill('.dl-visit-screen textarea', 'Bonjour, je peux venir en fin de journée.');
  await fullShot(page, 'telephone-visite-formulaire.png');
  const phoneStart = await page.evaluate((day) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d, 18, 0).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }, phoneDay);
  phoneMark = calls.length;
  await page.tap('.dl-visit-screen .dl-submit');
  await page.waitForSelector('.dl-visit-screen .dl-sent');
  const phoneCreated = once('visite-telephone', phoneMark, 'rpc/create_visit_request');
  if (phoneCreated) {
    const body = phoneCreated.body ?? {};
    const slots = Array.isArray(body.p_slots) ? body.p_slots : [];
    if (!UUID.test(body.p_id ?? '') || slots.length !== 1 || !UUID.test(slots[0]?.id ?? '')) problems.push(`visite-telephone: identifiants ${JSON.stringify(body)}`);
    expectJSON('visite-telephone', 'arguments de create_visit_request', body, {
      p_id: body.p_id, p_listing_id: FICHE, p_slots: [{ id: slots[0]?.id, start: phoneStart, durationMinutes: 60 }],
      p_message: 'Bonjour, je peux venir en fin de journée.', p_mode: 'onSite',
    });
  }
  expect('visite-telephone', 'titre de la confirmation', await page.textContent('.dl-visit-screen h1'), 'Demande envoyée');
  expect('visite-telephone', 'texte de la confirmation', await page.textContent('.dl-sent-text'), 'Ce n\'est pas encore une visite confirmée : Agence Démo Centre doit choisir un créneau, ou en proposer un autre. Vous la retrouvez dans votre agenda (Mon compte).');
  expect('visite-telephone', 'créneau envoyé', await page.textContent('.dl-sent-slots li'), /^[A-ZÉ][a-zéû]+\. \d{1,2} [a-zéû]+\.? · 18 h 00$/);
  expect('visite-telephone', 'boutons de la confirmation', await page.$$eval('.dl-screen-actions > *', (els) => els.map((el) => `${el.tagName} ${el.textContent} ${el.getAttribute('href')}`).join(' | ')),
    'A Voir mon agenda /compte/?vue=agenda | BUTTON Fermer null');
  await checkPhoneScreen(page, 'visite-telephone-envoyee');
  await fullShot(page, 'telephone-visite-envoyee.png');
  await page.tap('.dl-screen-actions .dl-secondary');
  await waitForAddress(page, `${base}/annonce/?id=${FICHE}`);
  await page.waitForSelector('.header-card .hc-price-value');
  // L'arrivée de la barre se joue une fois par ouverture de la fiche : au retour, elle est là, dépliée.
  expectJSON('visite-telephone', 'barre au retour sur la fiche', await page.evaluate(() => ({
    texts: document.querySelectorAll('.duo-bar .duo-text.is-shown').length,
    low: [...document.querySelectorAll('.duo-bar .duo-slot')].filter((el) => el.style.transform).length,
    round: [...document.querySelectorAll('.duo-bar .duo-capsule')].filter((el) => el.style.width === '56px').length,
  })), { texts: 2, low: 0, round: 0 });
  expect('visite-telephone', 'carte des visites après l’envoi', await page.textContent('.visit-card .visit-text'), 'Demande de visite envoyéeEn attente · Agence Démo Centre');
  expect('visite-telephone', 'lien de la carte des visites', await page.getAttribute('a.visit-card', 'href'), `/compte/?vue=demande-visite&id=${phoneCreated?.body?.p_id}`);
  expect('visite-telephone', 'titre de la page après l’envoi', await page.title(), 'Appartement 3 pièces à Lyon 2e · Nidalo');
  await page.$eval('.header-card', (el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(out, 'telephone-fiche-demande-envoyee.png') });

  // « Envoyer un message » : la conversation de l'annonce (créée) ; son « + » › « Faire une offre » ouvre le même écran
  // d'offre, avec les mêmes styles que sur la fiche (ecrans-fiche-telephone.css). Fermé sans envoyer, puis retour à la
  // fiche.
  phoneMark = calls.length;
  await page.tap('.duo-bar .duo-message');
  await waitForAddress(page, `${base}/messages/?c=${conversationId(1)}`);
  const phoneFirst = once('messages-telephone', phoneMark, 'rpc/start_listing_conversation');
  if (phoneFirst) expectJSON('messages-telephone', 'arguments de start_listing_conversation', phoneFirst.body, { p_listing_id: FICHE });
  await page.waitForSelector('.dm-plus');
  await page.tap('.dm-plus');
  await page.tap('dialog[open] .dm-wide-row:has-text("Faire une offre")');
  await page.waitForSelector('.dm-pane .dl-offer-screen h1');
  expect('messages-telephone', 'écran de l’offre', await page.textContent('.dm-pane .dl-offer-screen .dl-screen-head p'), 'Appartement 3 pièces · prix affiché 238 000 €');
  expect('messages-telephone', 'couleur du bouton d’envoi', await page.$eval('.dm-pane .dl-offer-screen .dl-submit', (el) => getComputedStyle(el).backgroundColor), 'rgb(60, 92, 176)');
  await page.screenshot({ path: join(out, 'telephone-messages-offre.png') });
  await page.tap('.dl-screen-close');
  await page.waitForSelector('.dm-plus');
  if (since(phoneMark, 'rpc/make_offer').length) problems.push('messages-telephone: make_offer appelé sans envoi');
  await page.goBack();
  await waitForAddress(page, `${base}/annonce/?id=${FICHE}`);
  await page.waitForSelector('.header-card .hc-offer');

  // « Faire une offre » : la conversation de l'annonce (la même), l'écran de l'offre à son adresse, puis la conversation
  // de l'offre dans Messages ; « Retour » ramène à la fiche, qui montre « Offre en attente ».
  phoneMark = calls.length;
  await page.tap('.header-card .hc-offer');
  await waitForAddress(page, `${base}/annonce/?id=${FICHE}&vue=offre`);
  await page.waitForSelector('dialog.offer-sheet[open] .dl-offer-screen h1');
  // Feuille de l'app (OfferComposerSheet) : la fiche reste dessous.
  if (!(await page.$('.header-card .hc-price-value'))) problems.push('offre-telephone: la fiche n’est plus sous la feuille de l’offre');
  const phoneStarted = once('offre-telephone', phoneMark, 'rpc/start_listing_conversation');
  if (phoneStarted) expectJSON('offre-telephone', 'arguments de start_listing_conversation', phoneStarted.body, { p_listing_id: FICHE });
  if (since(phoneMark, 'rpc/make_offer').length) problems.push('offre-telephone: make_offer appelé avant l\'envoi');
  expect('offre-telephone', 'titre', await page.textContent('.dl-offer-screen h1'), 'Faire une offre');
  expect('offre-telephone', 'bien et prix', await page.textContent('.dl-offer-screen .dl-screen-head p'), 'Appartement 3 pièces · prix affiché 238 000 €');
  expect('offre-telephone', 'titre de la page', await page.title(), 'Faire une offre · Appartement 3 pièces · Nidalo');
  await page.locator('#offre-montant').pressSequentially('228000');
  expect('offre-telephone', 'montant saisi', await page.inputValue('#offre-montant'), '228 000');
  expect('offre-telephone', 'écart au prix', await page.textContent('#offre-ecart'), '228 000 € · 4,2 % sous le prix affiché');
  await page.tap('.dl-offer-screen .dl-chip');
  expect('offre-telephone', 'condition du prêt', await page.inputValue('#offre-conditions'), 'Sous réserve d\'obtention du prêt');
  await checkPhoneScreen(page, 'offre-telephone');
  await page.screenshot({ path: join(out, 'telephone-offre.png') });
  phoneMark = calls.length;
  await page.tap('.dl-offer-screen .dl-submit');
  await waitForAddress(page, `${base}/messages/?c=${conversationId(1)}`);
  await page.waitForSelector('.dm-thread .dm-offer .dm-offer-amount', { timeout: 10000 })
    .catch(() => problems.push('offre-telephone: la carte de l’offre n’apparaît pas dans la conversation'));
  const phoneOffer = once('offre-telephone', phoneMark, 'rpc/make_offer');
  if (phoneOffer) {
    const body = phoneOffer.body ?? {};
    expectJSON('offre-telephone', 'arguments de make_offer', body, {
      p_id: body.p_id, p_conversation_id: conversationId(1), p_amount: 228000, p_conditions: 'Sous réserve d\'obtention du prêt', p_expires_at: body.p_expires_at,
    });
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'telephone-offre-conversation.png') });
  await page.goBack();
  await waitForAddress(page, `${base}/annonce/?id=${FICHE}`);
  await page.waitForSelector('.header-card a.hc-offer');
  expect('offre-telephone', 'état de l’offre', await page.textContent('.header-card a.hc-offer'), 'Offre en attente');
  expect('offre-telephone', 'lien de l’offre', await page.getAttribute('.header-card a.hc-offer', 'href'), `/messages/?c=${conversationId(1)}`);
  await page.$eval('.header-card', (el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(out, 'telephone-fiche-apres-envoi.png') });

  // « Envoyer un message » : la même conversation (aucune autre n'est créée), dans Messages.
  phoneMark = calls.length;
  await page.tap('.duo-bar .duo-message');
  await waitForAddress(page, `${base}/messages/?c=${conversationId(1)}`);
  const phoneMessage = once('message-telephone', phoneMark, 'rpc/start_listing_conversation');
  if (phoneMessage) expectJSON('message-telephone', 'arguments de start_listing_conversation', phoneMessage.body, { p_listing_id: FICHE });
  if (phoneState.conversations.length !== 1) problems.push(`message-telephone: ${phoneState.conversations.length} conversations pour une seule annonce`);
  await page.close();

  // Vendeur sans numéro (SALE, un particulier) : « Appeler » propose d'écrire, qui ouvre la conversation.
  page = await open(phoneFresh, `/annonce/?id=${SALE}`, 'vente-telephone-connecte');
  await ready(page, 'vente-telephone-connecte');
  await page.tap('.duo-bar .duo-call');
  expect('vente-telephone-connecte', 'fenêtre du téléphone', await dialogTitle(page), 'Numéro non disponible');
  phoneMark = calls.length;
  await page.tap('dialog[open] .alert-actions .btn-primary');
  await waitForAddress(page, `${base}/messages/?c=${conversationId(2)}`);
  const saleMessage = once('vente-telephone-connecte', phoneMark, 'rpc/start_listing_conversation');
  if (saleMessage) expectJSON('vente-telephone-connecte', 'arguments de start_listing_conversation', saleMessage.body, { p_listing_id: SALE });
  await page.close();

  // « Signaler l'annonce » (bas de la fiche) : la feuille de l'app (motif obligatoire, description facultative de 500
  // caractères), la ligne de « reports » comme l'app, puis l'alerte « Signalement envoyé à l'équipe Nidalo. ».
  page = await open(phoneFresh, `/annonce/?id=${SALE}`, 'signaler-telephone');
  await ready(page, 'signaler-telephone');
  await page.$eval('.listing-report', (el) => el.scrollIntoView({ block: 'center' }));
  await page.tap('.listing-report');
  await page.waitForSelector('dialog.report-sheet[open] h2');
  await page.waitForTimeout(500);
  expect('signaler-telephone', 'titre', await page.textContent('dialog.report-sheet[open] h2'), 'Signaler l\'annonce');
  expect('signaler-telephone', 'motifs', await page.$$eval('dialog.report-sheet[open] .choice-chip', (els) => els.map((el) => el.textContent.trim()).join(' | ')),
    'Fraude immobilière ou arnaque | Annonce trompeuse | Spam | Contenu inapproprié | Autre');
  expect('signaler-telephone', 'bouton sans motif', await page.$eval('dialog.report-sheet[open] .sheet-submit', (el) => el.disabled), true);
  await page.tap('dialog.report-sheet[open] .choice-chip:has-text("Annonce trompeuse")');
  await page.fill('#signalement-details', 'Les photos ne correspondent pas au bien.');
  expect('signaler-telephone', 'compteur', await page.textContent('dialog.report-sheet[open] .form-count'), '40/500');
  await page.screenshot({ path: join(out, 'signaler-telephone.png') });
  phoneMark = calls.length;
  await page.tap('dialog.report-sheet[open] .sheet-submit');
  expect('signaler-telephone', 'alerte', await dialogTitle(page), 'Signalement envoyé à l\'équipe Nidalo.');
  const report = once('signaler-telephone', phoneMark, 'reports');
  if (report) {
    if (!/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/.test(report.body?.id ?? '')) problems.push(`signaler-telephone: identifiant ${report.body?.id}`);
    expectJSON('signaler-telephone', 'ligne du signalement', report.body, {
      id: report.body?.id, target_type: 'listing', target_id: SALE.toUpperCase(), reason: 'misleadingListing', details: 'Les photos ne correspondent pas au bien.',
    });
  }
  if (await page.$('dialog.report-sheet[open]')) problems.push('signaler-telephone: la feuille reste ouverte après l’envoi');
  await closeAlert(page);
  await page.close();

  // Adresses ouvertes directement : l'offre (aucune en attente) à son adresse, « Fermer » revient à la fiche ; pas
  // d'offre sur une location.
  page = await open(phoneFresh, `/annonce/?id=${SALE}&vue=offre`, 'adresse-offre-telephone');
  await page.waitForSelector('dialog.offer-sheet[open] .dl-offer-screen h1');
  expect('adresse-offre-telephone', 'adresse', page.url(), `${base}/annonce/?id=${SALE}&vue=offre`);
  expect('adresse-offre-telephone', 'bien et prix', await page.textContent('.dl-offer-screen .dl-screen-head p'), 'Appartement lumineux avec balcon · prix affiché 238 000 €');
  await page.tap('.dl-screen-close');
  await waitForAddress(page, `${base}/annonce/?id=${SALE}`);
  await page.waitForSelector('.header-card .hc-price-value');
  await page.close();
  page = await open(phoneFresh, `/annonce/?id=${RENTAL}&vue=offre`, 'adresse-offre-location-telephone');
  await waitForAddress(page, `${base}/annonce/?id=${RENTAL}`);
  await ready(page, 'adresse-offre-location-telephone');
  if (await page.$('.dl-screen, .hc-offer')) problems.push('adresse-offre-location-telephone: offre proposée sur une location');
  await page.close();

  // Sa propre annonce : « Voir les demandes » et « Gérer l'annonce », comme sur ordinateur ; rien du compte n'est lu.
  phoneMark = calls.length;
  page = await open(phoneFresh, `/annonce/?id=${MINE}`, 'mon-annonce-telephone');
  await ready(page, 'mon-annonce-telephone');
  await common(page, 'mon-annonce-telephone', { phone: true });
  expect('mon-annonce-telephone', 'boutons de la barre', await page.$$eval('.action-bar .owner-bar-button', (els) => els.map((el) => el.textContent.trim()).join(' | ')), 'Voir les demandes | Gérer l\'annonce');
  await checkOwnerBar(page, 'mon-annonce-telephone');
  if (await page.$('.hc-offer, .visit-card')) problems.push('mon-annonce-telephone: offre ou visite proposée sur sa propre annonce');
  for (const table of ['rpc/my_conversations', 'rpc/my_offers', 'rpc/my_visit_requests', 'agenda_visits', 'rpc/start_listing_conversation']) {
    if (since(phoneMark, table).length) problems.push(`mon-annonce-telephone: ${table} demandé pour sa propre annonce`);
  }
  // Capture avant les touchers : le reflet bleu du toucher de Chromium resterait sur le bouton.
  await page.screenshot({ path: join(out, 'mon-annonce-telephone.png') });
  // « Voir les demandes » : les demandes de visite du bien (MyVisitsView de l'app), à l'adresse &vue=demandes ; « À
  // traiter » d'emblée (deux demandes reçues), chaque ligne ouvre sa demande ; le retour rond revient à la fiche.
  phoneMark = calls.length;
  await page.tap('.owner-bar-button >> nth=0');
  await waitForAddress(page, `${base}/annonce/?id=${MINE}&vue=demandes`);
  await page.waitForSelector('.listing-screen .app-requests .app-request-row');
  once('demandes-telephone', phoneMark, 'rpc/my_visit_requests');
  expect('demandes-telephone', 'titre', await page.textContent('.app-requests .app-page-header-title'), 'Demandes de visite');
  expect('demandes-telephone', 'titre de la page', await page.title(), `Demandes de visite · ${listingById(MINE).title} · Nidalo`);
  expect('demandes-telephone', 'onglets', await page.$$eval('.app-request-tab', (els) => els.map((el) => `${el.textContent}${el.getAttribute('aria-selected') === 'true' ? ' (choisi)' : ''}`).join(' | ')),
    'À traiter2 (choisi) | À venir | Historique');
  const receivedIds = phoneState.requests.slice(0, 2).map((row) => row.id);
  expect('demandes-telephone', 'liens des lignes', await page.$$eval('.app-request-row-main', (els) => els.map((el) => el.getAttribute('href')).join(' | ')),
    receivedIds.map((requestId) => `/compte/?vue=demande-visite&id=${requestId}`).join(' | '));
  expect('demandes-telephone', 'personne', await page.textContent('.app-request-row >> nth=0 >> .app-request-row-person'), 'Julie B.Particulier· reçue');
  expect('demandes-telephone', 'créneaux', await page.textContent('.app-request-row >> nth=0 >> .app-request-row-slot'), /^[A-ZÉ][a-zéû]+\. \d{1,2} [a-zéû]+\.? · 10 h 00 · 2 créneaux$/);
  expect('demandes-telephone', 'statut', await page.textContent('.app-request-row >> nth=0 >> .app-request-badge'), 'En attente');
  expect('demandes-telephone', 'boutons', await page.$$eval('.app-request-row >> nth=0 >> .app-request-row-buttons button', (els) => els.map((el) => el.textContent).join(' | ')),
    'Message | Voir le bien');
  await checkPhoneScreenWidth(page, 'demandes-telephone');
  await page.screenshot({ path: join(out, 'telephone-demandes.png') });
  await page.tap('.app-request-tab >> nth=2');
  expect('demandes-telephone', 'historique vide', await page.textContent('.app-requests [role="tabpanel"] h2'), 'Aucun historique');
  await page.tap('.app-requests .app-page-header .app-round');
  await waitForAddress(page, `${base}/annonce/?id=${MINE}`);
  await page.waitForSelector('.action-bar .owner-bar-button');
  // « Gérer l'annonce » ouvre la modification de l'annonce, comme l'app (le dépôt, page /publier/).
  await page.tap('.owner-bar-button >> nth=1');
  await waitForAddress(page, `${base}/publier/?annonce=${MINE}`);
  await page.close();
  page = await open(phoneFresh, `/annonce/?id=${MINE}&vue=visite`, 'mon-annonce-visite-telephone');
  await waitForAddress(page, `${base}/annonce/?id=${MINE}`);
  await ready(page, 'mon-annonce-visite-telephone');
  if (await page.$('.dl-screen')) problems.push('mon-annonce-visite-telephone: demande de visite sur sa propre annonce');
  await page.close();

  // Écran « Demande de visite » (VisitRequestDetailView de l'app), demande reçue : le bien, l'état, Julie B., les
  // créneaux demandés avec « Accepter ce créneau », le message, les actions et l'historique ; accepter envoie
  // accept_visit_request puis relit la demande, qui devient « Confirmée ».
  const [firstReceived, secondReceived] = receivedIds;
  page = await open(phoneFresh, `/compte/?vue=demande-visite&id=${firstReceived}`, 'demande-recue-telephone');
  await page.waitForSelector('.app-request-card');
  const requestTexts = () => page.evaluate(() => ({
    header: document.querySelector('.app-page-header-title')?.textContent,
    badge: document.querySelector('.app-request-card .app-request-badge')?.textContent,
    mode: document.querySelector('.app-request-mode')?.textContent.trim(),
    person: document.querySelector('.app-request-person')?.innerText.replace(/\n/g, ' / '),
    explanation: document.querySelector('.app-request-explanation')?.textContent,
    sections: [...document.querySelectorAll('.app-request-section h2')].map((el) => el.textContent.trim()),
    accept: document.querySelectorAll('.app-request-open .app-request-primary').length,
    actions: [...document.querySelectorAll('.app-request-actions > *')].map((el) => el.textContent),
    history: [...document.querySelectorAll('.app-request-event')].map((el) => el.textContent),
    tabbar: (() => { const bar = document.querySelector('.tabbar'); return bar ? getComputedStyle(bar).display !== 'none' : false; })(),
  }));
  const mineTitle = listingById(MINE).title;
  expectJSON('demande-recue-telephone', 'écran', await requestTexts(), {
    header: 'Demande de visite',
    badge: 'En attente', mode: 'Sur place', person: 'JB / Julie B. / Particulier / Demande reçue',
    explanation: 'Julie B. souhaite visiter ce bien. Acceptez l\'un des créneaux, proposez-en un autre ou refusez.',
    sections: ['Créneaux demandés', 'Message', 'Historique'], accept: 2, actions: ['Proposer d\'autres créneaux', 'Refuser', 'Écrire à Julie B.'],
    history: ['Julie B. : demande envoyée'], tabbar: false,
  });
  expect('demande-recue-telephone', 'bien', await page.textContent('.app-request-listing-title'), mineTitle);
  expect('demande-recue-telephone', 'lien du bien', await page.getAttribute('.app-request-listing', 'href'), `/annonce/?id=${MINE}`);
  expect('demande-recue-telephone', 'créneau', await page.textContent('.app-request-open >> nth=0 >> .app-request-slot'), /^[A-ZÉ][a-zéû]+\. \d{1,2} [a-zéû]+\.? · 10 h 00· 1 h$/);
  await checkPhoneScreenWidth(page, 'demande-recue-telephone');
  await fullShot(page, 'telephone-demande-recue.png');
  phoneMark = calls.length;
  await page.tap('.app-request-open >> nth=0 >> .app-request-primary');
  await page.waitForFunction(() => document.querySelector('.app-request-card .app-request-badge')?.textContent === 'Confirmée');
  const acceptCall = once('demande-recue-telephone', phoneMark, 'rpc/accept_visit_request');
  if (acceptCall) expectJSON('demande-recue-telephone', 'arguments de accept_visit_request', acceptCall.body, { p_request_id: firstReceived, p_slot_id: phoneState.requests[0].slots[0].id });
  const requestReread = once('demande-recue-telephone', phoneMark, 'rpc/my_visit_requests');
  if (requestReread) expectJSON('demande-recue-telephone', 'relecture de la demande', requestReread.body, { p_request_id: firstReceived });
  const acceptedTexts = await requestTexts();
  expectJSON('demande-recue-telephone', 'après « Accepter ce créneau »', [acceptedTexts.explanation, acceptedTexts.sections, acceptedTexts.actions, acceptedTexts.history.length], [
    'La visite est confirmée et ajoutée à votre agenda.', ['Visite confirmée', 'Message', 'Historique'],
    ['Proposer un autre créneau', 'Annuler la visite', 'Écrire à Julie B.'], 2,
  ]);
  await page.close();

  // Demande reçue refusée : la fenêtre de l'app avec le motif facultatif, decline_visit_request avec le motif saisi.
  page = await open(phoneFresh, `/compte/?vue=demande-visite&id=${secondReceived}`, 'demande-refusee-telephone');
  await page.waitForSelector('.app-request-card');
  await page.tap('.app-request-actions button:has-text("Refuser")');
  expect('demande-refusee-telephone', 'fenêtre', await dialogTitle(page), 'Refuser la demande ?');
  await page.fill('dialog[open] .app-request-reason', 'Bien déjà loué');
  phoneMark = calls.length;
  await page.tap('dialog[open] .alert-actions button:has-text("Refuser")');
  await page.waitForFunction(() => document.querySelector('.app-request-card .app-request-badge')?.textContent === 'Refusée');
  const declineCall = once('demande-refusee-telephone', phoneMark, 'rpc/decline_visit_request');
  if (declineCall) expectJSON('demande-refusee-telephone', 'arguments de decline_visit_request', declineCall.body, { p_request_id: secondReceived, p_reason: 'Bien déjà loué' });
  expect('demande-refusee-telephone', 'texte', await page.textContent('.app-request-explanation'), 'Demande refusée. Motif : Bien déjà loué');
  expect('demande-refusee-telephone', 'actions', await page.$$eval('.app-request-actions > *', (els) => els.map((el) => el.textContent).join(' | ')), 'Écrire à Julie B.');
  await page.close();

  // Demande envoyée (celle de « Demander une visite », plus haut) : « Annuler la demande », sa fenêtre, puis
  // cancel_visit_request sans motif (l'app n'en envoie pas).
  if (phoneCreated?.body?.p_id) {
    page = await open(phoneFresh, `/compte/?vue=demande-visite&id=${phoneCreated.body.p_id}`, 'demande-envoyee-telephone');
    await page.waitForSelector('.app-request-card');
    expect('demande-envoyee-telephone', 'texte', await page.textContent('.app-request-explanation'), 'En attente de réponse : ce n\'est pas encore une visite confirmée.');
    expect('demande-envoyee-telephone', 'actions', await page.$$eval('.app-request-actions > *', (els) => els.map((el) => el.textContent).join(' | ')),
      'Annuler la demande | Écrire à Agence Démo Centre');
    await page.tap('.app-request-cancel');
    expect('demande-envoyee-telephone', 'fenêtre', await dialogTitle(page), 'Annuler la demande ?');
    phoneMark = calls.length;
    await page.tap('dialog[open] .alert-actions button:has-text("Annuler la demande")');
    await page.waitForFunction(() => document.querySelector('.app-request-card .app-request-badge')?.textContent === 'Annulée');
    const cancelCall = once('demande-envoyee-telephone', phoneMark, 'rpc/cancel_visit_request');
    if (cancelCall) expectJSON('demande-envoyee-telephone', 'arguments de cancel_visit_request', cancelCall.body, { p_request_id: phoneCreated.body.p_id });
    expect('demande-envoyee-telephone', 'texte après l’annulation', await page.textContent('.app-request-explanation'), 'Demande annulée.');
    await page.close();
  }

  // La conversation ne s'ouvre pas (n° 68, comme l'app) : « Envoyer un message » qui tarde montre les trois points dans
  // la bulle après 0,15 s, puis l'alerte « Impossible d'ouvrir la conversation » avec le message du serveur ; sans
  // réseau, celui de la connexion ; pareil pour « Faire une offre », depuis la fiche ou son adresse. La fiche reste
  // affichée, seul « OK » ferme l'alerte, et un nouvel essai qui réussit ouvre bien la conversation.
  await checkConversationFailures(phoneFresh, 'telephone', {
    message: '.duo-bar .duo-message', offer: '.header-card .hc-offer', listing: '.header-card .hc-price-value', retryConversation: conversationId(2),
  });
  await phoneFresh.close();

  // Petit téléphone (320 px) avec le compte : la barre de sa propre annonce, le formulaire de visite et l'offre tiennent.
  const smallMember = await frenchBrowser.newContext({ ...devices['iPhone SE'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await mock(smallMember);
  await signIn(smallMember, accountState());
  page = await open(smallMember, `/annonce/?id=${MINE}`, 'mon-annonce-petit-telephone');
  await ready(page, 'mon-annonce-petit-telephone');
  await common(page, 'mon-annonce-petit-telephone', { phone: true });
  await fitted(page, 'mon-annonce-petit-telephone');
  await checkOwnerBar(page, 'mon-annonce-petit-telephone');
  await page.screenshot({ path: join(out, 'mon-annonce-petit-telephone.png') });
  await page.close();
  page = await open(smallMember, `/annonce/?id=${FICHE}&vue=visite`, 'visite-petit-telephone');
  await page.waitForSelector('.listing-screen .dl-visit-screen h1');
  await page.click('.dl-link-button.is-strong');
  await page.waitForSelector('.dl-slot >> nth=1');
  await checkPhoneScreen(page, 'visite-petit-telephone');
  await fullShot(page, 'telephone-petit-visite-formulaire.png');
  await page.close();
  page = await open(smallMember, `/annonce/?id=${FICHE}&vue=offre`, 'offre-petit-telephone');
  await page.waitForSelector('dialog.offer-sheet[open] .dl-offer-screen h1');
  await page.locator('#offre-montant').pressSequentially('1250000');
  await checkPhoneScreen(page, 'offre-petit-telephone');
  await page.screenshot({ path: join(out, 'telephone-petit-offre.png') });
  await page.close();
  await smallMember.close();

  // Créneaux ouverts par le vendeur (visites groupées, OpenSlotsSection de l'app) : list_open_slots à l'ouverture du
  // formulaire, chaque créneau avec ses places et « Réserver » (ou « Complet ») ; un créneau pris entre-temps montre le
  // refus du serveur et les créneaux relus ; « Réserver » envoie book_visit_slot comme l'app, et la visite est confirmée.
  const phoneSlots = await frenchBrowser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await mock(phoneSlots);
  const slotsState = accountState();
  const SESSION = 'c3000000-0000-4000-8000-000000000001';
  const slotStart = parisTime(6, 10);
  const slotRow = (start, fields) => ({
    listing_id: FICHE, session_id: SESSION, slot_start: isoSeconds(start), slot_end: isoSeconds(new Date(start.getTime() + 30 * 60_000)),
    duration_minutes: 30, booked_by_me: false, ...fields,
  });
  slotsState.openSlots.push(
    slotRow(new Date(slotStart.getTime() + 30 * 60_000), { places_left: 1, bookable: true, race: true }),
    slotRow(slotStart, { places_left: 3, bookable: true }),
    slotRow(new Date(slotStart.getTime() + 60 * 60_000), { places_left: 0, bookable: false }),
  );
  await signIn(phoneSlots, slotsState);
  phoneMark = calls.length;
  // Le refus du créneau pris (400) est voulu : Chrome le signale dans la console.
  page = await open(phoneSlots, `/annonce/?id=${FICHE}&vue=visite`, 'creneaux-telephone', { expectedStatus: 400 });
  await page.waitForSelector('.listing-screen .dl-visit-screen .visit-open-slot');
  const slotsRead = once('creneaux-telephone', phoneMark, 'rpc/list_open_slots');
  if (slotsRead) expectJSON('creneaux-telephone', 'arguments de list_open_slots', slotsRead.body, { p_listing_id: FICHE });
  expect('creneaux-telephone', 'titre de la section', await page.textContent('.visit-open-slots .app-section-label'), 'Créneaux ouverts par le vendeur');
  const slotTexts = () => page.$$eval('.visit-open-slot', (els) => els.map((el) => [...el.children].map((child) => child.innerText.replace(/\n/g, ' / ')).join(' / ')));
  const openTexts = await slotTexts();
  const DAY = '[A-ZÉ][a-zéû]+\\. \\d{1,2} [a-zéû]+\\.?';
  expect('creneaux-telephone', 'créneaux', openTexts.join(' | '), new RegExp(`^${DAY} · 10 h 00 – 10 h 30 / 3 places / Réserver \\| ${DAY} · 10 h 30 – 11 h 00 / 1 place / Réserver \\| ${DAY} · 11 h 00 – 11 h 30 / Complet / Complet$`));
  expect('creneaux-telephone', 'nom du bouton', await page.getAttribute('.visit-open-slot >> nth=0 >> .visit-book', 'aria-label'), /^Réserver le créneau [A-ZÉ][a-zéû]+ \d{1,2} [a-zéû]+ à 10 h 00$/);
  expect('creneaux-telephone', 'sections', await page.$$eval('.dl-visit-screen .dl-form-section h2', (els) => els.map((el) => el.textContent).join(' | ')), 'Créneau souhaité | Type de visite | Message (facultatif)');
  await checkPhoneScreen(page, 'creneaux-telephone');
  await page.fill('.dl-visit-screen textarea', '  Bonjour, à bientôt.  ');
  await fullShot(page, 'telephone-visite-creneaux.png');
  // Le créneau de 10 h 30 a été pris entre-temps : le refus du serveur, puis les créneaux relus.
  phoneMark = calls.length;
  await page.tap('.visit-open-slot >> nth=1 >> .visit-book');
  await page.waitForSelector('.visit-bar-error');
  expect('creneaux-telephone', 'refus', await page.textContent('.visit-bar-error'), 'Ce créneau est complet.');
  await page.waitForFunction(() => document.querySelectorAll('.visit-book').length === 1);
  if (since(phoneMark, 'rpc/list_open_slots').length !== 1) problems.push('creneaux-telephone: les créneaux ne sont pas relus après le refus');
  expect('creneaux-telephone', 'créneau pris', (await slotTexts())[1], /\/ Complet \/ Complet$/);
  phoneMark = calls.length;
  await page.tap('.visit-open-slot >> nth=0 >> .visit-book');
  await page.waitForSelector('.dl-visit-screen .dl-sent');
  const booking = once('creneaux-telephone', phoneMark, 'rpc/book_visit_slot');
  if (booking) {
    const body = booking.body ?? {};
    if (!UUID.test(body.p_id ?? '') || !ISO_SECONDS.test(body.p_slot_start ?? '')) problems.push(`creneaux-telephone: identifiant ou heure ${JSON.stringify(body)}`);
    expectJSON('creneaux-telephone', 'arguments de book_visit_slot', body, {
      p_id: body.p_id, p_session_id: SESSION, p_slot_start: isoSeconds(slotStart), p_message: 'Bonjour, à bientôt.',
    });
    const reread = once('creneaux-telephone', phoneMark, 'rpc/my_visit_requests', (call) => call.body?.p_request_id);
    if (reread) expectJSON('creneaux-telephone', 'relecture de la demande', reread.body, { p_request_id: body.p_id });
  }
  if (since(phoneMark, 'rpc/create_visit_request').length) problems.push('creneaux-telephone: create_visit_request envoyé pour un créneau ouvert');
  expect('creneaux-telephone', 'titre de la confirmation', await page.textContent('.dl-visit-screen h1'), 'Visite confirmée');
  expect('creneaux-telephone', 'statut', await page.textContent('.dl-sent .dl-status-badge'), 'Confirmée');
  expect('creneaux-telephone', 'créneau réservé', await page.textContent('.dl-sent-slots li'), /^[A-ZÉ][a-zéû]+ \d{1,2} [a-zéû]+ · 10 h 00 – 10 h 30$/);
  expect('creneaux-telephone', 'texte de la confirmation', await page.textContent('.dl-sent-text'), 'Vous la retrouvez dans votre agenda (Mon compte), avec ses rappels.');
  expect('creneaux-telephone', 'boutons de la confirmation', await page.$$eval('.dl-screen-actions > *', (els) => els.map((el) => `${el.tagName} ${el.textContent} ${el.getAttribute('href')}`).join(' | ')),
    'A Voir mon agenda /compte/?vue=agenda | BUTTON Fermer null');
  if (await page.$('.visit-bar-error')) problems.push('creneaux-telephone: le refus reste affiché après la réservation');
  await checkPhoneScreen(page, 'creneaux-telephone-reserve');
  await fullShot(page, 'telephone-visite-reservee.png');
  await page.tap('.dl-screen-actions .dl-secondary');
  await waitForAddress(page, `${base}/annonce/?id=${FICHE}`);
  await page.waitForSelector('.header-card .hc-price-value');
  expect('creneaux-telephone', 'carte des visites après la réservation', await page.textContent('.visit-card .visit-text'), 'Demande de visite envoyéeConfirmée · Agence Démo Centre');
  await page.close();
  await phoneSlots.close();

  // ——— Ordinateur avec le compte de test : chaque action envoie au serveur simulé ce qu'envoie l'app ———
  // Après le téléphone, dont les étapes restent dans l'ordre et les conditions d'avant (navigateur réglé en français).
  const member = await frenchBrowser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await mock(member);
  const fresh = accountState();
  await signIn(member, fresh);

  // Fiche d'un autre : ce que l'app lit du compte, la colonne de droite, le numéro de l'agence.
  let mark = calls.length;
  page = await open(member, `/annonce/?id=${FICHE}`, 'fiche-connecte');
  await ready(page, 'fiche-connecte');
  await page.waitForSelector('.dl-aside a.duo-call');
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
  expect('fiche-connecte', 'boutons', await page.$$eval('.dl-aside .dl-button, .dl-aside .duo-capsule', (els) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent.trim()).join(' | ')), 'Appeler | Envoyer un message');
  await checkDuo(page, 'fiche-connecte', { floating: false, seller: 'vendeur' });
  expect('fiche-connecte', 'appel', `${await page.getAttribute('.duo-call', 'href')} ${await page.getAttribute('.duo-call', 'title')}`, 'tel:0639984567 Appeler le 06 39 98 45 67');
  expect('fiche-connecte', 'carte des visites', await page.textContent('.dl-main .dl-visit-card'), 'Aucune visite prévueDemandez une visite au vendeur ou à l\'agence.Demander');
  await checkVisitRequestPill(page, 'fiche-connecte', '.dl-main .dl-visit-request', DESKTOP_PILL);
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
  // Vente avec un loyer : la rentabilité suit le montant tapé (offerYields), d'abord celle du prix affiché.
  const offerYieldsText = () => page.$eval('#offre-rentabilite', (el) => [el.querySelector('.dl-yield-title')?.textContent,
    ...[...el.querySelectorAll('.dl-yield-row')].map((row) => [...row.children].map((span) => span.textContent).join(' '))].join(' | '))
    .catch(() => null);
  expect('offre', 'rentabilité au prix affiché', await offerYieldsText(), 'Rentabilité au prix affiché | Rendement brut 7,8 % | Rendement net 5,8 %');
  await page.locator('#offre-montant').pressSequentially('228000');
  expect('offre', 'montant saisi', await page.inputValue('#offre-montant'), '228 000');
  expect('offre', 'écart au prix', await page.textContent('#offre-ecart'), '228 000 € · 4,2 % sous le prix affiché');
  expect('offre', 'rentabilité au montant', await offerYieldsText(),
    'Rentabilité à 228 000 € | Rendement brut 8,1 % 7,8 % au prix affiché | Rendement net 6,1 % 5,8 % au prix affiché');
  expect('offre', 'champ décrit par l\'écart et la rentabilité', await page.getAttribute('#offre-montant', 'aria-describedby'), 'offre-ecart offre-rentabilite');
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
  // Comme l'app (ListingDetailView) : l'offre envoyée, sa conversation s'ouvre dans Messages, avec la carte de l'offre.
  await waitForAddress(page, `${base}/messages/?c=${conversationId(1)}`);
  await page.waitForSelector('.dm-thread .dm-offer .dm-offer-amount', { timeout: 10000 })
    .catch(() => problems.push('offre: la carte de l’offre n’apparaît pas dans la conversation'));
  expect('offre', 'carte dans la conversation', await page.textContent('.dm-thread .dm-offer').catch(() => null),
    /^Offre\s*En attente\s*228\s000\s€\s*4,2\s%\ssous le prix affiché\s*Sous réserve d'obtention du prêt\s*Valable jusqu'au .+Retirer$/);
  // Comme l'app (OfferCard dans le fil) : l'heure sous la carte, comme un message.
  expect('offre', 'heure sous la carte', await page.textContent('.dm-thread .dm-msg.is-card:has(.dm-offer) .dm-msg-status time').catch(() => null),
    /^\d{2}:\d{2}$/);
  const offerCalls = calls.length;
  // « Retour » : la fiche, avec « Offre en attente ».
  await page.goBack();
  await waitForAddress(page, `${base}/annonce/?id=${FICHE}`);
  await page.waitForSelector('.dl-aside a.dl-offer');
  if (calls.slice(offerCalls).some((call) => call.table === 'rpc/make_offer')) problems.push('offre: make_offer rappelé au retour sur la fiche');
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

  // « Demander » (carte « Aucune visite prévue ») : le formulaire de l'app à son adresse, create_visit_request, puis la
  // confirmation.
  mark = calls.length;
  await page.click('.dl-main .dl-visit-request');
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
  expect('visite', 'texte de la confirmation', await page.textContent('.dl-sent-text'), 'Ce n\'est pas encore une visite confirmée : Agence Démo Centre doit choisir un créneau, ou en proposer un autre. Vous la retrouvez dans votre agenda (Mon compte).');
  // Créneaux écrits « 10 h 00 » (n° 177) ; les dates d'une visite gardent « 18h00 » (pastille de la colonne, plus bas).
  expect('visite', 'créneaux envoyés', await page.$$eval('.dl-sent-slots li', (els) => els.map((el) => /\d+ h \d\d/.exec(el.textContent)?.[0]).join(' | ')), '18 h 00 | 10 h 00');
  // « Voir mon agenda » ouvre Mon agenda (Mon espace sur ordinateur).
  expect('visite', 'lien de l’agenda', await page.getAttribute('.dl-screen-actions a.dl-submit', 'href'), '/compte/?vue=agenda');
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
  await page.click('.dl-aside .duo-message');
  await waitForAddress(page, `${base}/messages/?c=${conversationId(1)}`);
  const messageStart = once('message', mark, 'rpc/start_listing_conversation');
  if (messageStart) expectJSON('message', 'arguments de start_listing_conversation', messageStart.body, { p_listing_id: FICHE });
  const messageRead = once('message', mark, 'rpc/my_conversations', (call) => call.body?.p_conversation_id);
  if (messageRead) expectJSON('message', 'relecture de la conversation', messageRead.body, { p_conversation_id: conversationId(1) });
  if (fresh.conversations.length !== 1) problems.push(`message: ${fresh.conversations.length} conversations pour une seule annonce`);
  await page.close();

  // La conversation ne s'ouvre pas (n° 68) : les mêmes alertes que sur téléphone, dans la colonne de droite.
  await checkConversationFailures(member, 'ordinateur', {
    message: '.dl-aside .duo-message', offer: '.dl-aside .dl-offer', listing: '.dl .dl-price-value', retryConversation: conversationId(2),
  });

  // Adresses des écrans ouvertes directement, avec le compte.
  page = await open(member, `/annonce/?id=${FICHE}&vue=visite`, 'adresse-visite');
  await page.waitForSelector('.dl-visit-screen h1');
  expect('adresse-visite', 'titre', await page.textContent('.dl-visit-screen h1'), 'Demander une visite');
  expect('adresse-visite', 'type de visite choisi', await page.textContent('.dl-visit-screen .dl-option[aria-pressed="true"]'), 'Sur place');
  await page.click('.dl-screen-close');
  await waitForAddress(page, `${base}/annonce/?id=${FICHE}`);
  await page.waitForSelector('.dl .dl-price-value');
  await page.close();
  // « Vidéo » des Détails d'une conversation (&type=visio) : le même formulaire, sur « En visio », comme l'app.
  page = await open(member, `/annonce/?id=${FICHE}&vue=visite&type=visio`, 'adresse-visite-visio');
  await page.waitForSelector('.dl-visit-screen h1');
  expect('adresse-visite-visio', 'type de visite choisi', await page.textContent('.dl-visit-screen .dl-option[aria-pressed="true"]'), 'En visio');
  await page.close();
  // Une offre attend déjà une réponse : comme l'app, l'offre ouvre la conversation, qui la montre.
  page = await open(member, `/annonce/?id=${FICHE}&vue=offre`, 'adresse-offre-en-attente');
  await waitForAddress(page, `${base}/messages/?c=${conversationId(1)}`);
  await page.close();
  page = await open(member, `/annonce/?id=${SALE}&vue=offre`, 'adresse-offre');
  await page.waitForSelector('.dl-offer-screen h1');
  expect('adresse-offre', 'adresse', page.url(), `${base}/annonce/?id=${SALE}&vue=offre`);
  expect('adresse-offre', 'bien et prix', await page.textContent('.dl-offer-screen .dl-screen-head p'), 'Appartement lumineux avec balcon · prix affiché 238 000 €');
  // Vente sans loyer : pas de carte « Rentabilité » sur la fiche, donc pas de rentabilité sous le montant.
  await page.locator('#offre-montant').pressSequentially('200000');
  if (await page.$('#offre-rentabilite')) problems.push('adresse-offre: rentabilité affichée pour une vente sans loyer');
  // Après chaque chiffre, le curseur est replacé à l'image suivante (onAmount) : attendre cette image, sinon elle peut
  // défaire la sélection de fill('') et le montant resterait (vu quand la machine est chargée).
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done())));
  await page.locator('#offre-montant').fill('');
  expect('adresse-offre', 'montant effacé', await page.inputValue('#offre-montant'), '');
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

  // Sa propre annonce : « Voir les demandes » (les demandes du bien) et « Gérer l'annonce » ; rien du compte n'est lu avant.
  mark = calls.length;
  page = await open(member, `/annonce/?id=${MINE}`, 'mon-annonce');
  await ready(page, 'mon-annonce');
  await common(page, 'mon-annonce', { phone: false });
  await checkDesktopLayout(page, 'mon-annonce');
  expect('mon-annonce', 'boutons', await page.$$eval('.dl-aside .dl-button', (els) => els.map((el) => el.textContent.trim()).join(' | ')), 'Voir les demandes | Gérer l\'annonce');
  if (await page.$('.dl-offer, .dl-message, .dl-call, .duo-capsule, .dl-visit-card, .dl-visit-request, .dl-pill-wide')) problems.push('mon-annonce: offre, message, appel ou visite proposés sur sa propre annonce');
  if (await page.$('.listing-report')) problems.push('mon-annonce: « Signaler l\'annonce » sur sa propre annonce');
  for (const table of ['rpc/my_offers', 'rpc/my_visit_requests', 'agenda_visits', 'rpc/start_listing_conversation']) {
    if (since(mark, table).length) problems.push(`mon-annonce: ${table} demandé pour sa propre annonce`);
  }
  await page.screenshot({ path: join(out, 'mon-annonce-1440.png') });
  // « Voir les demandes » : les demandes du bien dans la colonne de 720 px (aucune ici : « Aucune visite à venir »).
  mark = calls.length;
  await page.click('.dl-aside .dl-button >> nth=0');
  await waitForAddress(page, `${base}/annonce/?id=${MINE}&vue=demandes`);
  await page.waitForSelector('.app-requests [role="tabpanel"] h2');
  once('mon-annonce', mark, 'rpc/my_visit_requests');
  expect('mon-annonce', 'titre des demandes', await page.textContent('.app-requests h1'), 'Demandes de visite');
  expect('mon-annonce', 'demandes vides', await page.textContent('.app-requests [role="tabpanel"]'), 'Aucune visite à venirDemandez une visite depuis la fiche d\'une annonce : elle apparaîtra ici, en attente puis confirmée.');
  await checkColumn(page, 'mon-annonce-demandes', '.app-requests');
  await page.screenshot({ path: join(out, 'mon-annonce-demandes-1440.png') });
  await page.click('.app-requests .dl-screen-close');
  await waitForAddress(page, `${base}/annonce/?id=${MINE}`);
  await page.waitForSelector('.dl-aside .dl-button');
  // « Gérer l'annonce » : le lien de la modification de l'annonce (le dépôt), comme « Modifier » de Mes annonces.
  expect('mon-annonce', 'lien de « Gérer l\'annonce »', await page.getAttribute('.dl-aside .dl-button >> nth=1', 'href'), `/publier/?annonce=${MINE}`);
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
    // Le message du bas de l'app (showToast) : son bouton mène à /comparer/.
    await page.waitForFunction((wanted) => document.querySelector('.app-toast:not(.is-leaving) .app-toast-text')?.textContent === wanted, text, { timeout: 5000 })
      .catch(() => {});
    expect('comparer', `toast de ${target.slice(-2)}`, await page.textContent('.app-toast:not(.is-leaving) .app-toast-text'), text);
    expect('comparer', `bouton du toast de ${target.slice(-2)}`, await page.textContent('.app-toast:not(.is-leaving) .app-toast-action'), action);
    expect('comparer', `Comparer de ${target.slice(-2)}`, await page.getAttribute('.dl-tools .dl-compare', 'aria-pressed'), pressed);
    if (target === FICHE) {
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(out, 'comparer-toast-1440.png') });
    }
  }
  expectJSON('comparer', 'comparaison gardée dans l’onglet', JSON.parse(await page.evaluate(() => sessionStorage.getItem('nidalo.comparer'))), { ids: [FICHE, SALE, LEASED], referenceId: FICHE });
  await page.click('.app-toast:not(.is-leaving) .app-toast-action');
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
  // « Vider » est destructif dans l'app (CompareView) : bouton rouge, et le triangle d'alerte en tête de la fenêtre.
  expect('comparer', 'boutons pour vider', JSON.stringify(await page.$$eval('dialog[open] .alert-actions .btn', (els) => els.map((el) => [el.textContent, el.className]))),
    JSON.stringify([['Vider', 'btn btn-danger'], ['Annuler', 'btn btn-light']]));
  await page.click('dialog[open] .alert-actions .btn-danger');
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
  // L'état commun « Pas de connexion Internet » de l'app (n° 64).
  expect('comparer-erreur', 'message', await page.textContent('.cmp-error h2'), 'Pas de connexion Internet');
  if (await page.$('.cmp-table')) problems.push('comparer-erreur: tableau affiché sans aucun bien');
  const brokenBefore = brokenRequests;
  await page.click('.cmp-error .app-offline-retry');
  for (let i = 0; i < 30 && brokenRequests <= brokenBefore; i += 1) await page.waitForTimeout(100);
  if (brokenRequests <= brokenBefore) problems.push('comparer-erreur: « Réessayer » ne redemande pas le bien');
  await page.waitForSelector('.cmp-error');
  expectJSON('comparer-erreur', 'bien gardé dans la comparaison', JSON.parse(await page.evaluate(() => sessionStorage.getItem('nidalo.comparer'))), { ids: [BROKEN], referenceId: BROKEN });
  await page.screenshot({ path: join(out, 'comparer-erreur-1440.png') });
  await page.close();
  await member.close();

  // Vues (Statistiques de l'espace pro) : une seule par annonce et par jour dans un navigateur, sur téléphone sans
  // compte comme sur ordinateur avec le compte ; rien pour une annonce introuvable.
  for (const [name, options, member] of [
    ['vues-telephone', { ...devices['iPhone 13'] }, false],
    ['vues-ordinateur', { viewport: { width: 1440, height: 900 } }, true],
  ]) {
    const context = await browser.newContext({ ...options, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    await mock(context);
    if (member) await signIn(context, seededState());
    const before = viewCalls.length;
    for (const listingId of [FICHE, FICHE, SALE]) {
      page = await open(context, `/annonce/?id=${listingId}`, name);
      await ready(page, name);
      await page.close();
    }
    page = await open(context, `/annonce/?id=${UNKNOWN}`, name);
    await page.waitForLoadState('networkidle');
    await page.close();
    expectJSON(name, 'vues envoyées', viewCalls.slice(before), [{ p_listing_id: FICHE }, { p_listing_id: SALE }]);
    await context.close();
  }

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
    await checkDuo(page, name, { floating: false, seller: 'vendeur' });
    expect(name, 'état de l’offre', await page.textContent('.dl-aside a.dl-offer'), 'Offre en attente');
    expect(name, 'visite confirmée', await page.textContent('.dl-aside .dl-pill-wide'), /^Visite confirmée · \S+ \d{1,2} \S+, 18h00$/);
    expect(name, 'carte des visites', await page.textContent('.dl-main .dl-visit-card .dl-visit-subtitle'), 'Visite prévue · Visite confirmée');
    // « Agenda » et la pastille de la visite ouvrent Mon agenda (Mon espace sur ordinateur).
    expect(name, 'lien de l’agenda', await page.getAttribute('.dl-main .dl-visit-agenda', 'href'), '/compte/?vue=agenda');
    expect(name, 'lien de la visite confirmée', await page.getAttribute('.dl-aside .dl-pill-wide.is-confirmed', 'href'), '/compte/?vue=agenda');
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
