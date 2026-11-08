// Vérification de « Publier une annonce » sur ordinateur (/publier/) dans Chromium, sans réseau : le serveur Supabase
// et les services d'adresse sont simulés avec des données inventées et notent tout ce que la page envoie. Le compte de
// test publie une annonce de bout en bout (sept étapes, deux photos, prénom demandé, un refus du serveur puis la mise
// en ligne), enregistre un brouillon puis le reprend, modifie une annonce en ligne et ses photos. Les écritures suivent
// l'ordre de l'app (SupabaseListingRepository.publish) : l'annonce en brouillon, l'adresse exacte, les photos (sans
// métadonnées), puis la mise en ligne. Sans compte : l'invitation à se connecter ; sous 1024 px : la page « bientôt »,
// sans rien demander au serveur. Captures pour Romain : publier-*.png.
// Lancer après la construction : node scripts/check-publish.mjs [dossier construit, docs/ par défaut] [dossier des captures]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const root = resolve(fileURLToPath(import.meta.url), '../..');
const docs = resolve(process.argv[2] ?? join(root, 'docs'));
const out = resolve(process.argv[3] ?? join(root, 'scripts', 'captures'));
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

// MARK: - Données inventées

const fixtures = join(root, 'scripts/fixtures');
const PHOTO = await readFile(join(fixtures, 'photo0.jpg'));
/** 2400 × 1200 px avec une orientation EXIF (à tourner d'un quart de tour), une position GPS, un appareil, un commentaire. */
const PHOTO_GPS = await readFile(join(fixtures, 'photo-gps.jpg'));
const [LISTED] = JSON.parse(await readFile(join(fixtures, 'listings.json'), 'utf8'));

const SUPABASE = 'https://izzsoitqtzzswkpvdozd.supabase.co';
const USER_ID = 'a0000000-0000-4000-8000-0000000000c1';
const USER_EMAIL = 'claire.martin@exemple.fr';
const OTHER_OWNER = '00000000-0000-4000-8000-0000000000aa';
const ONLINE_ID = '6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1b51'; // annonce en ligne du compte de test
const OTHER_ID = '6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1b52'; // annonce en ligne d'une autre personne
const UNKNOWN_ID = '6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1bff';
const PROFILE = {
  id: USER_ID, display_name: 'Claire Martin', avatar_path: null, account_type: 'individual', professional_profile_id: null,
  created_at: '2026-10-01T08:00:00Z', shows_full_name: false, findable_by_phone: false,
};
const DETAILS = {
  user_id: USER_ID, first_name: 'Claire', last_name: 'Martin', birth_date: null, phone: '0639981234', street: null,
  postal_code: '69003', city: 'Lyon', insee_code: '69383', country_code: 'FR', professional_situation: 'employee',
};
const { listing_photos: _listedPhotos, ...listedRow } = LISTED;
const ONLINE = { ...listedRow, id: ONLINE_ID, owner_id: USER_ID };
const OTHER = { ...listedRow, id: OTHER_ID, owner_id: OTHER_OWNER };
const ONLINE_PHOTOS = [
  { id: 'a1000000-0000-4000-8000-000000000001', listing_id: ONLINE_ID, owner_id: USER_ID, storage_path: `${USER_ID}/${ONLINE_ID}/premiere.jpg`, position: 0, width: 1400, height: 800 },
  { id: 'a1000000-0000-4000-8000-000000000002', listing_id: ONLINE_ID, owner_id: USER_ID, storage_path: `${USER_ID}/${ONLINE_ID}/seconde.jpg`, position: 1, width: 1400, height: 800 },
];
const ONLINE_LOCATION = { listing_id: ONLINE_ID, owner_id: USER_ID, street: '8 rue Paul Bert', latitude: 45.7597, longitude: 4.8491 };
/**
 * Partage dans l'agence : Claire est responsable de l'équipe de Rhône Immobilier, Inès y est agente. Claire modifie
 * l'annonce d'Inès : l'adresse et les photos restent au nom d'Inès, dans son dossier.
 */
const COLLEAGUE = 'c0000000-0000-4000-8000-0000000000b5';
const COLLEAGUE_ID = '6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1b53';
const COLLEAGUE_LISTING = { ...listedRow, id: COLLEAGUE_ID, owner_id: COLLEAGUE };
const COLLEAGUE_PHOTOS = [{ ...ONLINE_PHOTOS[0], id: 'a1000000-0000-4000-8000-000000000003', listing_id: COLLEAGUE_ID, owner_id: COLLEAGUE, storage_path: `${COLLEAGUE}/${COLLEAGUE_ID}/premiere.jpg` }];
const COLLEAGUE_LOCATION = { ...ONLINE_LOCATION, listing_id: COLLEAGUE_ID, owner_id: COLLEAGUE };
const TEAM_AGENCY = { agency_id: 'b0000000-0000-4000-8000-0000000000a1', role: 'manager', agency_name: 'Rhône Immobilier', logo_path: null, postal_code: '69006', city: 'Lyon' };
const TEAM_MEMBERS = [
  { user_id: '00000000-0000-4000-8000-0000000000ab', role: 'owner', public_name: 'Gérard G.', avatar_path: null, joined_at: '2026-09-01T08:00:00Z' },
  { user_id: USER_ID, role: 'manager', public_name: 'Claire M.', avatar_path: null, joined_at: '2026-10-01T08:00:00Z' },
  { user_id: COLLEAGUE, role: 'agent', public_name: 'Inès K.', avatar_path: null, joined_at: '2026-11-01T08:00:00Z' },
];

/** Lyon d'après geo.api.gouv.fr (centre de la commune) ; adresses de la Base Adresse Nationale (inventées). */
const LYON = {
  nom: 'Lyon', code: '69123', codesPostaux: ['69001', '69002', '69003', '69004', '69005', '69006', '69007', '69008', '69009'],
  departement: { code: '69', nom: 'Rhône' }, centre: { type: 'Point', coordinates: [4.8351, 45.758] }, population: 522250,
};
const ADDRESSES = [
  { words: ['mercière', 'merciere'], name: '12 Rue Mercière', postcode: '69002', citycode: '69382', latitude: 45.7616, longitude: 4.8321 },
  { words: ['bellecour'], name: '3 Place Bellecour', postcode: '69002', citycode: '69382', latitude: 45.7578, longitude: 4.832 },
];

// MARK: - Serveur simulé

const cors = { 'access-control-allow-origin': '*' };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
const empty = (route, status = 204) => route.fulfill({ status, headers: cors, body: '' });
const LISTING_TABLES = ['listings', 'listing_locations', 'listing_photos'];

const problems = [];
/** Réponses en erreur voulues (refus du serveur) : Chrome les écrit dans la console, ce ne sont pas des erreurs du site. */
let expectedServerErrors = 0;

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

/** Filtres PostgREST utiles ici : `col=eq.x` et `col=in.(a,b)`. */
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

function pageWidth(request) {
  try {
    return request.frame().page().viewportSize()?.width ?? null;
  } catch {
    return null;
  }
}

/** Le serveur simulé : tables du compte et des annonces, fichiers des photos, demandes notées dans l'ordre. */
function newState({ firstName = 'Claire', listings = [], locations = [], photos = [], team = false } = {}) {
  return {
    profile: { ...PROFILE },
    details: { ...DETAILS, first_name: firstName },
    listings: structuredClone(listings),
    locations: structuredClone(locations),
    photos: structuredClone(photos),
    files: new Map(),
    calls: [],
    geocoding: [],
    /** Message P0001 du serveur pour la mise en ligne (« Publication refusée »), ou null. */
    refuseOnline: null,
    /** Équipe de l'agence dont Claire est responsable (partage : elle modifie les annonces de l'équipe). */
    team,
  };
}

/** Comptes dont Claire peut lire les brouillons et modifier les annonces : le sien, et ceux de son équipe. */
const editableOwners = (state) => (state.team ? TEAM_MEMBERS.map((member) => member.user_id) : [USER_ID]);
/** Auteur de l'annonce d'une adresse ou d'une photo. */
const ownerOf = (state, listingId) => state.listings.find((row) => row.id === listingId)?.owner_id ?? USER_ID;

const withPhotos = (state, row) => ({
  ...row,
  listing_photos: state.photos.filter((photo) => photo.listing_id === row.id)
    .map(({ id, storage_path, position, width, height }) => ({ id, storage_path, position, width, height })),
});

function rest(state, route, signedIn) {
  const request = route.request();
  const url = new URL(request.url());
  const table = url.pathname.replace('/rest/v1/', '');
  const method = request.method();
  const params = url.searchParams;
  const single = (request.headers().accept ?? '').includes('vnd.pgrst.object');
  let body = null;
  if (method !== 'GET' && method !== 'HEAD') {
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
  }
  const width = pageWidth(request);
  state.calls.push({ table, method, search: decodeURIComponent(url.search), body, width });
  if (!signedIn && (LISTING_TABLES.includes(table) || ['profiles', 'profile_details'].includes(table))) problems.push(`sans compte : ${method} ${table} demandé`);
  if (width !== null && width < 1024 && LISTING_TABLES.includes(table)) problems.push(`téléphone : ${method} ${table} demandé (rien ne doit changer sous 1024 px)`);
  const now = new Date().toISOString();
  const rows = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : [];
  switch (table) {
    case 'profiles':
      if (method === 'GET') return single ? json(route, state.profile) : json(route, [state.profile]);
      if (method === 'PATCH') { Object.assign(state.profile, body); return empty(route); }
      break;
    case 'profile_details':
      if (method === 'GET') return json(route, [state.details]);
      if (method === 'PATCH') { Object.assign(state.details, body); return empty(route); }
      break;
    case 'listings': {
      if (method === 'GET') {
        // Comme les règles du serveur : le brouillon d'une autre personne n'est jamais lu (sauf dans son équipe).
        const found = filtered(state.listings, params).filter((row) => editableOwners(state).includes(row.owner_id) || row.status !== 'draft');
        return json(route, found.map((row) => withPhotos(state, row)));
      }
      if (method === 'POST') {
        for (const row of rows) {
          if (state.listings.some((other) => other.id === row.id)) return json(route, { code: '23505', message: 'duplicate key value' }, 409);
          // owner_id : auth.uid() par défaut sur le serveur ; jamais envoyé par la page.
          if ('owner_id' in row) problems.push('listings : owner_id envoyé par la page');
          state.listings.push({
            owner_id: USER_ID, previous_price: null, public_latitude: null, public_longitude: null, public_street: null,
            published_at: null, created_at: now, updated_at: now, ...row,
          });
        }
        return empty(route, 201);
      }
      if (method === 'PATCH') {
        const targets = filtered(state.listings, params).filter((row) => editableOwners(state).includes(row.owner_id));
        if (targets.length === 0) problems.push(`listings : modification sans annonce du compte (${decodeURIComponent(url.search)})`);
        for (const row of targets) {
          if (body.status === 'active' && row.status === 'draft') {
            if (state.refuseOnline) {
              expectedServerErrors += 1;
              return json(route, { code: 'P0001', message: state.refuseOnline, details: null, hint: null }, 400);
            }
            row.published_at = now;
          }
          Object.assign(row, body, { updated_at: now });
        }
        return empty(route);
      }
      break;
    }
    case 'listing_locations':
      if (method === 'GET') return json(route, filtered(state.locations, params).map(({ street, latitude, longitude }) => ({ street, latitude, longitude })));
      if (method === 'POST') {
        // upsert sur listing_id (clé primaire de la table).
        if (params.get('on_conflict') !== 'listing_id') problems.push(`listing_locations : on_conflict « ${params.get('on_conflict')} »`);
        for (const row of rows) {
          // L'auteur n'est envoyé que pour l'annonce d'un collègue, et c'est toujours l'auteur de l'annonce.
          const owner = ownerOf(state, row.listing_id);
          if (owner === USER_ID ? 'owner_id' in row : row.owner_id !== owner) problems.push(`listing_locations : auteur ${row.owner_id} pour une annonce de ${owner}`);
          const index = state.locations.findIndex((other) => other.listing_id === row.listing_id);
          const next = { owner_id: USER_ID, ...row };
          if (index >= 0) state.locations[index] = next;
          else state.locations.push(next);
        }
        return empty(route, 201);
      }
      break;
    case 'listing_photos':
      if (method === 'GET') return json(route, filtered(state.photos, params));
      if (method === 'POST') {
        for (const row of rows) {
          const owner = ownerOf(state, row.listing_id);
          if (owner === USER_ID ? 'owner_id' in row : row.owner_id !== owner) problems.push(`listing_photos : auteur ${row.owner_id} pour une annonce de ${owner}`);
          if (!String(row.storage_path).startsWith(`${owner}/${row.listing_id}/`)) problems.push(`listing_photos : photo hors du dossier de l'auteur (${row.storage_path})`);
          state.photos.push({ id: randomUUID(), owner_id: USER_ID, ...row });
        }
        return empty(route, 201);
      }
      if (method === 'DELETE') {
        const gone = new Set(filtered(state.photos, params).map((row) => row.id));
        state.photos = state.photos.filter((row) => !gone.has(row.id));
        return empty(route);
      }
      if (method === 'PATCH') {
        for (const row of filtered(state.photos, params)) Object.assign(row, body);
        return empty(route);
      }
      break;
    case 'rpc/my_team_agency': return json(route, state.team ? [TEAM_AGENCY] : []);
    case 'rpc/my_agency_team': return json(route, state.team ? TEAM_MEMBERS : []);
    default:
      // Barre du haut (pastilles des messages et des notifications) : rien à montrer.
      if (method === 'GET' || table.startsWith('rpc/')) return json(route, []);
  }
  problems.push(`${table} : ${method} inattendu (${decodeURIComponent(url.search)})`);
  return json(route, { message: 'non simulé' }, 400);
}

/** Fichier d'un envoi multipart (supabase-js envoie une photo en FormData : cacheControl, puis le fichier). */
function multipartFile(buffer, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType ?? '');
  const result = { type: null, bytes: Buffer.alloc(0), fields: {} };
  if (!buffer || !boundary) return result;
  const marker = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  let start = buffer.indexOf(marker);
  while (start !== -1) {
    const next = buffer.indexOf(marker, start + marker.length);
    if (next === -1) break;
    const part = buffer.subarray(start + marker.length + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, split).toString('latin1');
    const content = part.subarray(split + 4);
    if (/filename=/.test(head)) {
      result.type = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? null;
      result.bytes = Buffer.from(content);
    } else {
      result.fields[/name="([^"]*)"/.exec(head)?.[1] ?? ''] = content.toString('utf8');
    }
    start = next;
  }
  return result;
}

/** Segments d'un JPEG : dimensions, EXIF (APP1), commentaire (COM), et textes de la photo d'origine. */
function jpegInfo(bytes) {
  const info = { jpeg: bytes[0] === 0xFF && bytes[1] === 0xD8, width: null, height: null, exif: false, comment: false };
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xFF) {
    const marker = bytes[i + 1];
    if (marker === 0xD9 || marker === 0xDA) break;
    const length = bytes.readUInt16BE(i + 2);
    const segment = bytes.subarray(i + 4, i + 2 + length);
    if (marker === 0xE1 && segment.subarray(0, 4).toString('latin1') === 'Exif') info.exif = true;
    if (marker === 0xFE) info.comment = true;
    if (marker >= 0xC0 && marker <= 0xC3) {
      info.height = segment.readUInt16BE(1);
      info.width = segment.readUInt16BE(3);
    }
    i += 2 + length;
  }
  info.traces = ['GPS', 'Appareil de test', 'position de test'].filter((text) => bytes.includes(Buffer.from(text, 'latin1')));
  return info;
}

async function storage(state, route) {
  const request = route.request();
  const method = request.method();
  const path = decodeURIComponent(new URL(request.url()).pathname);
  const PUBLIC = '/storage/v1/object/public/listing-photos/';
  const OBJECT = '/storage/v1/object/listing-photos';
  const width = pageWidth(request);
  if (method === 'GET' && path.startsWith(PUBLIC)) {
    const name = path.slice(PUBLIC.length);
    return route.fulfill({ status: 200, contentType: 'image/jpeg', headers: cors, body: state.files.get(name)?.bytes ?? PHOTO });
  }
  if (width !== null && width < 1024) problems.push(`téléphone : stockage ${method} demandé`);
  if (method === 'POST' && path.startsWith(`${OBJECT}/`)) {
    const name = path.slice(OBJECT.length + 1);
    const file = multipartFile(request.postDataBuffer(), request.headers()['content-type']);
    state.files.set(name, file);
    state.calls.push({ table: 'storage', method, search: name, body: { type: file.type, cacheControl: file.fields.cacheControl, ...jpegInfo(file.bytes) }, width });
    return json(route, { Key: `listing-photos/${name}`, Id: randomUUID() });
  }
  if (method === 'DELETE' && path === OBJECT) {
    const prefixes = request.postDataJSON()?.prefixes ?? [];
    for (const name of prefixes) state.files.delete(name);
    state.calls.push({ table: 'storage', method, search: '', body: { prefixes }, width });
    return json(route, prefixes.map((name) => ({ name })));
  }
  problems.push(`stockage : ${method} ${path} inattendu`);
  return json(route, { message: 'non simulé' }, 400);
}

function geocoding(state, route) {
  const url = new URL(route.request().url());
  const params = Object.fromEntries(url.searchParams);
  state.geocoding.push(params);
  const q = (params.q ?? '').toLowerCase();
  const features = [];
  for (const address of ADDRESSES) {
    if (!address.words.some((word) => q.includes(word))) continue;
    features.push({
      type: 'Feature', geometry: { type: 'Point', coordinates: [address.longitude, address.latitude] },
      properties: {
        id: `${address.citycode}_${address.name}`, label: `${address.name} ${address.postcode} Lyon`, name: address.name, postcode: address.postcode,
        city: 'Lyon', citycode: address.citycode, context: '69, Rhône, Auvergne-Rhône-Alpes', type: 'housenumber',
      },
    });
  }
  return json(route, { type: 'FeatureCollection', features });
}

function communes(state, route) {
  const params = new URL(route.request().url()).searchParams;
  const postal = params.get('codePostal');
  const name = (params.get('nom') ?? '').toLowerCase();
  const found = (postal && LYON.codesPostaux.includes(postal)) || (name && 'lyon'.startsWith(name)) ? [LYON] : [];
  return json(route, found);
}

async function mock(context, state, { signedIn = true } = {}) {
  if (signedIn) {
    const session = JSON.stringify(fakeSession());
    await context.addInitScript((value) => {
      try { localStorage.setItem('sb-izzsoitqtzzswkpvdozd-auth-token', value); } catch { /* stockage indisponible */ }
    }, session);
  }
  await context.route(`${SUPABASE}/auth/v1/**`, (route) => {
    if (!signedIn) return json(route, { code: 'no_authorization', message: 'Pas de session' }, 401);
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/logout')) return empty(route);
    if (path.endsWith('/user')) return json(route, fakeSession().user);
    return json(route, fakeSession());
  });
  await context.route(`${SUPABASE}/rest/v1/**`, (route) => rest(state, route, signedIn));
  await context.route(`${SUPABASE}/storage/v1/**`, (route) => storage(state, route));
  await context.route('https://geo.api.gouv.fr/**', (route) => communes(state, route));
  await context.route('https://data.geopf.fr/**', (route) => geocoding(state, route));
  await context.route('https://tiles.openfreemap.org/**', (route) => empty(route));
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

// MARK: - Outils de vérification

/** Texte comparable : espaces (fines et insécables comprises) réduits à un seul ; clés triées. */
function tidy(value) {
  if (typeof value === 'string') return value.replace(/[\s  ]+/g, ' ').trim();
  if (Array.isArray(value)) return value.map(tidy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, tidy(value[key])]));
  return value;
}
function expectSame(name, what, actual, wanted) {
  const got = JSON.stringify(tidy(actual));
  const want = JSON.stringify(tidy(wanted));
  if (got !== want) problems.push(`${name} : ${what} ${got} au lieu de ${want}`);
}
async function textOf(page, selector) {
  const text = await page.locator(selector).first().textContent({ timeout: 3000 }).catch(() => null);
  return text === null ? null : tidy(text);
}
async function waitFor(condition, what, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (condition()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  problems.push(`${what} : délai dépassé`);
  return false;
}
/** Écritures (hors lectures) depuis `mark` : « MÉTHODE table ». */
const writesSince = (state, mark, tables = [...LISTING_TABLES, 'storage', 'profiles', 'profile_details']) => state.calls.slice(mark)
  .filter((call) => call.method !== 'GET' && tables.includes(call.table));
const writeNames = (calls) => calls.map((call) => `${call.method} ${call.table}`);

/** Réponses voulues aux fenêtres du navigateur : « Quitter la page ? » est accepté ou refusé selon le test. */
const unloadAnswers = new WeakMap();
const unloadPrompts = [];

async function open(context, path, name) {
  const page = await context.newPage();
  page.on('console', (msg) => {
    const text = msg.text();
    if (expectedServerErrors > 0 && /status of (400|409)/.test(text)) {
      expectedServerErrors -= 1;
      return;
    }
    if (msg.type() === 'error' || /Content Security Policy/i.test(text)) problems.push(`${name} : ${msg.type()} ${text}`);
  });
  page.on('pageerror', (error) => problems.push(`${name} : erreur ${error.message}`));
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'beforeunload') {
      unloadPrompts.push(name);
      const answer = unloadAnswers.get(page);
      if (!answer) problems.push(`${name} : « Quitter la page ? » inattendu`);
      if (answer === 'rester') await dialog.dismiss();
      else await dialog.accept();
      return;
    }
    problems.push(`${name} : fenêtre ${dialog.type()} « ${dialog.message()} »`);
    await dialog.dismiss();
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP bloque ${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto(base + path, { waitUntil: 'networkidle' });
  return page;
}

const CONTINUE = '.dpub .dsc-action-buttons .dsc-button-primary';
const head = async (page) => [await textOf(page, '.dsc-head h1'), await textOf(page, '.dsc-head .dsc-titles p')];
/** Étape affichée, par son sous-titre (« Étape 3 sur 7 · Caractéristiques »). */
async function waitStep(page, number, title, name) {
  await page.waitForFunction(([n, t]) => document.querySelector('.dsc-head .dsc-titles p')?.textContent === `Étape ${n} sur 7 · ${t}`, [number, title], { timeout: 8000 })
    .catch(async () => problems.push(`${name} : étape « ${(await head(page))[1]} » au lieu de « Étape ${number} sur 7 · ${title} »`));
}
const errorsOf = (page) => page.$$eval('.dpub .field-error', (els) => els.map((el) => el.textContent.trim()));
const card = (page, title) => page.locator('.dpub .dsc-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
/** Champ de montant par son libellé (Amount : <label> puis le champ). */
const amount = (page, label) => page.locator('.dpub .dsc-amount').filter({ has: page.locator('label', { hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`) }) }).locator('input');
const chip = (page, group, title) => page.locator('.dpub [role="group"]').filter({ has: page.locator('.field-label', { hasText: new RegExp(`^${group}$`) }) })
  .getByRole('button', { name: title, exact: true });
/**
 * Capture de toute la page : la fenêtre prend la hauteur de la page (sinon la barre d'actions collante est dessinée au
 * milieu), comme tallShot dans check-pages.
 */
async function shot(page, file) {
  const viewport = page.viewportSize();
  await page.mouse.move(0, 0);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('dialog')) document.activeElement.blur(); });
  await page.evaluate(() => document.fonts.ready);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: viewport.width, height: Math.max(height, viewport.height) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, file) });
  await page.setViewportSize(viewport);
  await page.waitForTimeout(100);
}
/** Toutes les images d'un sélecteur chargées (photos choisies, photos en ligne, aperçu). */
async function imagesLoaded(page, selector, count, name) {
  await page.waitForFunction(([sel, n]) => {
    const images = [...document.querySelectorAll(sel)];
    return images.length === n && images.every((img) => img.complete && img.naturalWidth > 0);
  }, [selector, count], { timeout: 10000 }).catch(() => problems.push(`${name} : ${count} image(s) ${selector} non chargée(s)`));
}

// MARK: - Vérifications

const browser = await chromium.launch();
try {
  const desktop = (width = 1440, height = 900) => browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });

  // 1. Sans compte, sur ordinateur : l'invitation à se connecter des autres pages du compte ; rien n'est demandé.
  {
    const N = 'publier sans compte';
    const state = newState();
    const context = await desktop();
    await mock(context, state, { signedIn: false });
    const page = await open(context, '/publier/', N);
    await page.waitForSelector('.signin-card');
    expectSame(N, 'page', [await textOf(page, '.signin-card h1'), await page.locator('.dpub').count()], ['Bienvenue sur NIDALO', 0]);
    await shot(page, 'publier-sans-compte.png');
    await context.close();
  }

  // 2. Sous 1024 px (iPhone, 1023 px) : le message « bientôt » du téléphone, même avec le compte ; rien n'est demandé.
  for (const [name, options] of [['publier iPhone', { ...devices['iPhone 13'], locale: 'fr-FR' }], ['publier 1023', { viewport: { width: 1023, height: 768 }, locale: 'fr-FR' }]]) {
    const state = newState({ listings: [ONLINE], photos: ONLINE_PHOTOS, locations: [ONLINE_LOCATION] });
    const context = await browser.newContext(options);
    await mock(context, state);
    for (const path of ['/publier/', `/publier/?annonce=${ONLINE_ID}`]) {
      const page = await open(context, path, `${name} ${path}`);
      await page.waitForSelector('.card.state h1');
      expectSame(`${name} ${path}`, 'page « bientôt »', [await textOf(page, '.card.state h1'), await textOf(page, '.card.state p'), await page.locator('.dpub').count()],
        ['Publier une annonce', 'Bientôt sur le site. Pour l’instant, une annonce se publie dans l’app : touchez le bouton + au centre de la barre du bas.', 0]);
      await page.close();
    }
    const asked = state.calls.filter((call) => LISTING_TABLES.includes(call.table) || call.table === 'storage');
    if (asked.length) problems.push(`${name} : ${writeNames(asked).join(', ')} demandé`);
    await context.close();
  }

  // 3. Publier de bout en bout, à 1440 px, avec un compte sans prénom : les sept étapes, deux photos (l'une avec sa
  //    position GPS), le prénom demandé, un refus du serveur, puis la mise en ligne.
  {
    const N = 'publier';
    const state = newState({ firstName: '' });
    const context = await desktop();
    await mock(context, state);
    const page = await open(context, '/publier/', N);
    await page.waitForSelector('.dpub .dsc-kinds');
    expectSame(N, 'en-tête', await head(page), ['Publier une annonce', 'Étape 1 sur 7 · Catégorie']);
    expectSame(N, 'avant le choix', [await page.locator('.dsc-head-action button').count(), await page.locator(CONTINUE).isDisabled(),
      await page.$$eval('.dsc-kind .dsc-kind-title', (els) => els.map((el) => el.textContent))], [0, true, ['Résidentiel', 'Investissement', 'Location', 'Hôtels']]);
    const layout = await page.evaluate(() => {
      const wrap = document.querySelector('.account-wrap');
      const style = getComputedStyle(wrap);
      return { column: Math.round(wrap.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)), overflowX: document.documentElement.scrollWidth - innerWidth };
    });
    expectSame(N, 'colonne', layout, { column: 640, overflowX: 0 });
    await page.getByRole('button', { name: /^Résidentiel,/ }).click();
    await page.getByRole('button', { name: 'Appartement', exact: true }).click();
    const chosen = async () => [await textOf(page, '.dsc-kind[aria-pressed="true"] .dsc-kind-title'), await textOf(page, '.dsc-choices-stack [aria-pressed="true"]')];
    expectSame(N, 'catégorie choisie', [...await chosen(), await page.locator('.dsc-head-action button[aria-label="Enregistrer en brouillon"]').count(),
      await page.locator(CONTINUE).isDisabled()], ['Résidentiel', 'Appartement', 1, false]);
    // Fenêtre rétrécie un instant sous 1024 px : le message du téléphone à la place, puis la saisie revient telle quelle.
    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForSelector('.card.state h1');
    expectSame(N, 'fenêtre étroite', [await page.locator('.dpub-root').isHidden(), await textOf(page, '.card.state h1')], [true, 'Publier une annonce']);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForSelector('.dpub .dsc-kinds');
    expectSame(N, 'saisie gardée', [...await chosen(), await page.locator('.card.state').count()], ['Résidentiel', 'Appartement', 0]);
    await shot(page, 'publier-1-categorie.png');
    expectSame(N, 'saisie gardée après la capture', await chosen(), ['Résidentiel', 'Appartement']);
    await page.click(CONTINUE);

    // Étape 2 : les champs obligatoires signalés, une adresse introuvable, puis l'adresse choisie dans les suggestions.
    await waitStep(page, 2, 'Informations principales', N);
    await page.click(CONTINUE);
    await page.waitForSelector('.dpub .field-error');
    expectSame(N, 'champs signalés', await errorsOf(page), ['Obligatoire', 'Obligatoire', 'Indiquez le prix.']);
    await page.getByRole('combobox', { name: 'Code postal' }).fill('99999');
    await page.getByRole('combobox', { name: 'Ville' }).fill('Nulleville');
    await amount(page, 'Prix de vente').fill('320000');
    await page.waitForTimeout(400);
    expectSame(N, 'prix saisi', await amount(page, 'Prix de vente').inputValue(), '320 000');
    await page.click(CONTINUE);
    await page.waitForFunction(() => [...document.querySelectorAll('.dpub .field-error')].some((el) => el.textContent.startsWith('Adresse introuvable')), null, { timeout: 8000 })
      .catch(async () => problems.push(`${N} : adresse introuvable non signalée (${JSON.stringify(await errorsOf(page))})`));
    await waitStep(page, 2, 'Informations principales', N);
    // L'adresse modifiée, « Adresse introuvable » disparaît.
    await page.getByRole('combobox', { name: 'Code postal' }).fill('');
    expectSame(N, 'adresse modifiée', (await errorsOf(page)).filter((text) => text.startsWith('Adresse introuvable')), []);
    await page.getByRole('combobox', { name: 'Ville' }).fill('');
    await page.getByRole('combobox', { name: 'Rue et numéro (facultatif)' }).fill('12 rue Mercière');
    await page.getByRole('option', { name: /12 Rue Mercière/ }).click();
    // Le code postal et la ville remplis par la suggestion n'ouvrent pas leurs propres listes.
    await page.waitForTimeout(700);
    expectSame(N, 'adresse choisie', [await page.getByRole('combobox', { name: 'Rue et numéro (facultatif)' }).inputValue(),
      await page.getByRole('combobox', { name: 'Code postal' }).inputValue(), await page.getByRole('combobox', { name: 'Ville' }).inputValue(),
      await page.locator('.dpub .place-list:not([hidden])').count(), await errorsOf(page)], ['12 Rue Mercière', '69002', 'Lyon', 0, []]);
    await shot(page, 'publier-2-adresse-prix.png');
    const geocodedBefore = state.geocoding.length;
    await page.click(CONTINUE);

    // Étape 3 : caractéristiques (position déjà connue par la suggestion : pas de nouvelle recherche d'adresse).
    await waitStep(page, 3, 'Caractéristiques', N);
    if (state.geocoding.length !== geocodedBefore) problems.push(`${N} : adresse recherchée à nouveau alors qu'une suggestion a été choisie`);
    await page.click(CONTINUE);
    expectSame(N, 'caractéristiques signalées', await errorsOf(page), ['Indiquez la surface.', 'Indiquez le nombre de pièces.', 'Le DPE est obligatoire pour ce type de bien.']);
    await amount(page, 'Surface habitable').fill('62');
    await chip(page, 'Pièces', '3').click();
    await chip(page, 'Chambres', '2').click();
    await amount(page, 'Étage (0 = RDC)').fill('2');
    await chip(page, 'Ascenseur', 'Oui').click();
    await chip(page, 'Extérieur', 'Balcon').click();
    await page.getByRole('button', { name: 'DPE (classe énergie) C', exact: true }).click();
    await page.getByRole('button', { name: 'GES (classe climat) B', exact: true }).click();
    await shot(page, 'publier-3-caracteristiques.png');
    await page.click(CONTINUE);

    // Étape 4 : prix et finances (facultatif pour une vente de logement).
    await waitStep(page, 4, 'Prix et finances', N);
    await shot(page, 'publier-4-prix-finances.png');
    await page.click(CONTINUE);

    // Étape 5 : photos. La photo GPS (2400 × 1200, à tourner) et une photo ordinaire ; la seconde devient la principale.
    await waitStep(page, 5, 'Photos', N);
    await page.click(CONTINUE);
    expectSame(N, 'photos signalées', await errorsOf(page), ['Ajoutez au moins une photo.']);
    await page.setInputFiles('.dpub input[type="file"]', [
      { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: PHOTO_GPS },
      { name: 'IMG_0002.jpg', mimeType: 'image/jpeg', buffer: PHOTO },
    ]);
    await imagesLoaded(page, '.dpub-photo img', 2, `${N} : photos choisies`);
    expectSame(N, 'photos choisies', [await page.$$eval('.dpub-photo img', (els) => els.map((img) => [img.naturalWidth, img.naturalHeight])), await textOf(page, '.dpub-photo-main')],
      [[[1024, 2048], [1400, 800]], 'Principale']);
    await page.getByRole('button', { name: 'Options de la photo 2' }).click();
    await page.getByRole('menuitem', { name: 'Photo principale' }).click();
    expectSame(N, 'photo principale changée', await page.$$eval('.dpub-photo img', (els) => els.map((img) => [img.naturalWidth, img.naturalHeight])), [[1400, 800], [1024, 2048]]);
    await shot(page, 'publier-5-photos.png');
    await page.click(CONTINUE);

    // Étape 6 : titre et description proposés à partir de la saisie, aperçu de la carte de résultat.
    await waitStep(page, 6, 'Description et aperçu', N);
    await page.getByRole('button', { name: 'Proposer : « Appartement 3 pièces – Lyon »' }).click();
    await page.getByRole('button', { name: 'Rédiger à partir de mes informations' }).click();
    expectSame(N, 'titre et description proposés', [await page.getByLabel('Titre de l\'annonce').inputValue(), await page.getByLabel('Description de l\'annonce').inputValue()],
      ['Appartement 3 pièces – Lyon', 'À vendre : appartement de 62 m² à Lyon. 3 pièces dont 2 chambres. 2e étage avec ascenseur. Balcon. DPE C, GES B.']);
    // La description s'écrit dans la police du site, comme le titre (un champ de texte long prendrait sinon une police
    // à chasse fixe).
    const fonts = await page.evaluate(() => ['.dpub textarea', '.dpub input.dsc-input'].map((selector) => getComputedStyle(document.querySelector(selector)).fontFamily));
    expectSame(N, 'police de la description', fonts[0], fonts[1]);
    // Aperçu : la carte de la recherche avec ses deux photos (la principale d'abord), inerte (ni lien ni favori).
    await page.locator('.dpub-preview').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const image = document.querySelector('.dpub-preview img');
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    }, null, { timeout: 10000 }).catch(() => problems.push(`${N} : photo de l'aperçu non chargée`));
    const beforePreview = page.url();
    expectSame(N, 'aperçu', [await textOf(page, '.dpub-preview .listing-card h3'), await page.locator('.dpub-preview').evaluate((element) => element.inert),
      await page.$eval('.dpub-preview img', (image) => [image.naturalWidth, image.naturalHeight])], ['Appartement 3 pièces – Lyon', true, [1400, 800]]);
    await page.locator('.dpub-preview .listing-card h3').click({ force: true });
    await page.waitForTimeout(300);
    expectSame(N, 'aperçu sans lien', [page.url(), (await head(page))[1]], [beforePreview, 'Étape 6 sur 7 · Description et aperçu']);
    await shot(page, 'publier-6-description-apercu.png');
    await page.click(CONTINUE);

    // Étape 7 : vérification, puis « Publier mon annonce » : le prénom est demandé (compte sans prénom).
    await waitStep(page, 7, 'Vérification', N);
    expectSame(N, 'récapitulatif', await page.$$eval('.dpub-recap-row', (rows) => rows.map((row) => `${row.querySelector('dt').textContent}: ${row.querySelector('dd span').textContent}`)),
      ['Catégorie: Résidentiel · Appartement', 'Adresse: 12 Rue Mercière, 69002 Lyon', 'Prix: 320 000 €', 'Surface: 62 m²', 'DPE: C', 'Photos: 2']);
    await shot(page, 'publier-7-verification.png');
    // Premier essai : le serveur refuse la mise en ligne (message P0001 montré tel quel) ; l'annonce reste en brouillon.
    state.refuseOnline = 'Le DPE est obligatoire pour publier cette annonce.';
    let mark = state.calls.length;
    await page.getByRole('button', { name: 'Publier mon annonce' }).click();
    await page.waitForSelector('dialog.alert-dialog[open] input[aria-label="Prénom"]');
    expectSame(N, 'prénom demandé', [await textOf(page, 'dialog[open] h2'), await textOf(page, 'dialog[open] p')], ['Votre prénom', 'Affiché sur l\'annonce : Prénom M.']);
    await page.fill('dialog[open] input[aria-label="Prénom"]', 'Claire');
    expectSame(N, 'nom affiché', await textOf(page, 'dialog[open] p'), 'Affiché sur l\'annonce : Claire M.');
    await shot(page, 'publier-prenom.png');
    await page.click('dialog[open] button[type="submit"]');
    await page.waitForSelector('dialog.alert-dialog[open] h2:text("Publication refusée")', { timeout: 15000 })
      .catch(() => problems.push(`${N} : « Publication refusée » absent`));
    expectSame(N, 'refus', await textOf(page, 'dialog[open] p'), 'Le DPE est obligatoire pour publier cette annonce.');
    await shot(page, 'publier-refus.png');
    const first = writesSince(state, mark);
    expectSame(N, 'premier essai : écritures', writeNames(first), ['PATCH profiles', 'PATCH profile_details', 'POST listings', 'POST listing_locations',
      'POST storage', 'POST listing_photos', 'POST storage', 'POST listing_photos', 'PATCH listings']);
    const listingId = state.listings[0]?.id;
    expectSame(N, 'prénom enregistré', [state.details.first_name, state.details.last_name, state.profile.display_name], ['Claire', 'Martin', 'Claire Martin']);
    const inserted = first.find((call) => call.table === 'listings' && call.method === 'POST')?.body ?? {};
    expectSame(N, 'annonce envoyée', Object.fromEntries(['status', 'transaction', 'property_type', 'publish_category', 'title', 'price', 'living_area', 'rooms', 'bedrooms', 'floor',
      'has_elevator', 'outdoor_spaces', 'postal_code', 'city', 'insee_code', 'location_precision', 'energy_class', 'climate_class', 'country_code'].map((key) => [key, inserted[key]])), {
      status: 'draft', transaction: 'sale', property_type: 'apartment', publish_category: 'residential', title: 'Appartement 3 pièces – Lyon', price: 320000, living_area: 62,
      rooms: 3, bedrooms: 2, floor: 2, has_elevator: true, outdoor_spaces: ['balcony'], postal_code: '69002', city: 'Lyon', insee_code: '69382',
      location_precision: 'approximate', energy_class: 'C', climate_class: 'B', country_code: 'FR',
    });
    expectSame(N, 'adresse exacte envoyée', first.find((call) => call.table === 'listing_locations')?.body,
      { listing_id: listingId, street: '12 Rue Mercière', latitude: 45.7616, longitude: 4.8321 });
    const uploads = first.filter((call) => call.table === 'storage');
    expectSame(N, 'photos envoyées', uploads.map((call) => ({ ...call.body, path: new RegExp(`^${USER_ID}/${listingId}/[0-9a-f-]{36}\\.jpg$`).test(call.search) })), [
      { type: 'image/jpeg', cacheControl: '31536000', jpeg: true, width: 1400, height: 800, exif: false, comment: false, traces: [], path: true },
      { type: 'image/jpeg', cacheControl: '31536000', jpeg: true, width: 1024, height: 2048, exif: false, comment: false, traces: [], path: true },
    ]);
    expectSame(N, 'lignes des photos', first.filter((call) => call.table === 'listing_photos').map((call) => call.body),
      uploads.map((call, position) => ({ listing_id: listingId, storage_path: call.search, position, width: call.body.width, height: call.body.height })));
    expectSame(N, 'après le refus', [state.listings[0]?.status, state.listings[0]?.published_at, await textOf(page, '.dsc-head .dsc-titles p')],
      ['draft', null, 'Étape 7 sur 7 · Vérification']);
    await page.click('dialog[open] button:text("Compris")');
    // Second essai : la mise en ligne passe. Les photos du premier essai sont remplacées, sans doublon.
    state.refuseOnline = null;
    const firstFiles = uploads.map((call) => call.search);
    mark = state.calls.length;
    await page.getByRole('button', { name: 'Publier mon annonce' }).click();
    await page.waitForSelector('.dpub-success', { timeout: 15000 }).catch(() => problems.push(`${N} : confirmation absente`));
    const second = writesSince(state, mark);
    expectSame(N, 'second essai : écritures', writeNames(second), ['PATCH listings', 'POST listing_locations', 'POST storage', 'POST listing_photos', 'POST storage',
      'POST listing_photos', 'DELETE listing_photos', 'DELETE storage', 'PATCH listings']);
    expectSame(N, 'second essai : statut', [second[0]?.body?.status, second.at(-1)?.body], [undefined, { status: 'active' }]);
    expectSame(N, 'photos remplacées', second.find((call) => call.method === 'DELETE' && call.table === 'storage')?.body?.prefixes?.slice().sort(), firstFiles.slice().sort());
    expectSame(N, 'annonce en ligne', [state.listings.length, state.listings[0]?.status, typeof state.listings[0]?.published_at, state.photos.map((photo) => [photo.position, photo.width, photo.height]),
      [...state.files.keys()].length], [1, 'active', 'string', [[0, 1400, 800], [1, 1024, 2048]], 2]);
    expectSame(N, 'confirmation', [await textOf(page, '.dpub-success h1'), await textOf(page, '.dpub-success p'),
      await page.$$eval('.dpub-success-actions a', (links) => links.map((link) => [link.textContent.trim(), link.getAttribute('href')]))],
    ['Annonce publiée', '« Appartement 3 pièces – Lyon » est en ligne : visible par tous dans la recherche, sur la carte et sur votre profil.',
      [['Voir l\'annonce', `/annonce/?id=${listingId}`], ['Mes annonces', '/compte/?vue=annonces'], ['Fermer', '/']]]);
    await shot(page, 'publier-publiee.png');
    // Plus rien à enregistrer : quitter la page ne demande rien.
    await page.click('.dpub-success-actions a:text("Mes annonces")');
    await page.waitForURL(`${base}/compte/?vue=annonces`);
    await context.close();
  }

  // 4. Brouillon : enregistré dès que le type, le code postal et la ville sont connus, repris ensuite ; quitter avec une
  //    saisie non enregistrée demande quoi faire.
  {
    const N = 'brouillon';
    const state = newState();
    const context = await desktop();
    await mock(context, state);
    const page = await open(context, '/publier/', N);
    await page.waitForSelector('.dpub .dsc-kinds');
    await page.getByRole('button', { name: /^Résidentiel,/ }).click();
    await page.getByRole('button', { name: 'Maison', exact: true }).click();
    await page.click('.dsc-head-action button[aria-label="Enregistrer en brouillon"]');
    expectSame(N, 'brouillon trop tôt', [await textOf(page, '.dsc-action-message'), writeNames(writesSince(state, 0))],
      ['Pour enregistrer le brouillon, indiquez d’abord le type de bien, le code postal et la ville.', []]);
    await page.click(CONTINUE);
    await waitStep(page, 2, 'Informations principales', N);
    await page.getByRole('combobox', { name: 'Code postal' }).fill('69002');
    await page.getByRole('option', { name: /Lyon/ }).first().click();
    expectSame(N, 'commune choisie', [await page.getByRole('combobox', { name: 'Code postal' }).inputValue(), await page.getByRole('combobox', { name: 'Ville' }).inputValue()], ['69002', 'Lyon']);
    let mark = state.calls.length;
    await page.click('.dsc-head-action button[aria-label="Enregistrer en brouillon"]');
    await page.waitForSelector('.dsc-saved', { timeout: 8000 }).catch(() => problems.push(`${N} : « Brouillon enregistré » absent`));
    const saved = writesSince(state, mark);
    const draftId = state.listings[0]?.id;
    expectSame(N, 'brouillon enregistré', [writeNames(saved), await textOf(page, '.dsc-saved'), page.url()],
      [['POST listings', 'POST listing_locations'], 'Brouillon enregistré', `${base}/publier/?annonce=${draftId}`]);
    expectSame(N, 'ligne du brouillon', Object.fromEntries(['status', 'property_type', 'transaction', 'price', 'postal_code', 'city', 'insee_code'].map((key) => [key, saved[0]?.body?.[key]])),
      { status: 'draft', property_type: 'house', transaction: 'sale', price: 0, postal_code: '69002', city: 'Lyon', insee_code: '69123' });
    expectSame(N, 'position de la commune', saved[1]?.body, { listing_id: draftId, street: null, latitude: 45.758, longitude: 4.8351 });
    // Saisie non enregistrée : fermer l'onglet demande confirmation ; « Retour » propose d'enregistrer.
    await amount(page, 'Prix de vente').fill('450000');
    unloadAnswers.set(page, 'rester');
    await page.close({ runBeforeUnload: true });
    await waitFor(() => unloadPrompts.includes(N), `${N} : « Quitter la page ? » à la fermeture`);
    if (page.isClosed()) problems.push(`${N} : la page s'est fermée malgré « Rester »`);
    unloadAnswers.delete(page);
    await page.click('.dsc-back');
    await page.waitForSelector('dialog.alert-dialog[open]');
    expectSame(N, 'quitter ?', [await textOf(page, 'dialog[open] h2'), await page.$$eval('dialog[open] .alert-actions button', (els) => els.map((el) => el.textContent.trim()))],
      ['Quitter la publication ?', ['Enregistrer le brouillon', 'Quitter sans enregistrer', 'Continuer']]);
    await shot(page, 'publier-brouillon-quitter.png');
    await page.click('dialog[open] button:text("Continuer")');
    await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached' }).catch(() => undefined);
    await page.click('.dsc-back');
    mark = state.calls.length;
    await page.click('dialog[open] button:text("Enregistrer le brouillon")');
    await page.waitForURL(`${base}/`, { timeout: 8000 }).catch(() => problems.push(`${N} : « Enregistrer le brouillon » ne quitte pas la page (${page.url()})`));
    expectSame(N, 'enregistré en quittant', [writeNames(writesSince(state, mark)), state.listings[0]?.price, state.listings[0]?.status], [['PATCH listings', 'POST listing_locations'], 450000, 'draft']);
    // Reprise depuis Mes annonces : « Reprendre » ouvre le brouillon, sur ses informations principales.
    await page.goto(`${base}/compte/?vue=annonces`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.deposit-button');
    expectSame(N, 'Mes annonces', [await page.getAttribute('.deposit-button', 'href'), await page.locator(`a.action-button[href="/publier/?annonce=${draftId}"]`).count()],
      ['/publier/', 1]);
    await page.click(`a.action-button[href="/publier/?annonce=${draftId}"]`);
    await page.waitForSelector('.dpub .dsc-card');
    await waitStep(page, 2, 'Informations principales', N);
    expectSame(N, 'brouillon repris', [(await head(page))[0], await amount(page, 'Prix de vente').inputValue(), await page.getByRole('combobox', { name: 'Ville' }).inputValue(),
      await page.locator('.dsc-head-action button[aria-label="Enregistrer en brouillon"]').count()], ['Reprendre le brouillon', '450 000', 'Lyon', 1]);
    await context.close();
  }

  // 5. Modifier une annonce en ligne : ouverte sur ses informations principales, « Enregistrer » (jamais de brouillon),
  //    adresse recalculée, statut et date de publication inchangés ; puis ses photos (une retirée).
  {
    const N = 'modifier';
    const state = newState({ listings: [ONLINE, OTHER], photos: ONLINE_PHOTOS, locations: [ONLINE_LOCATION] });
    const context = await desktop(1024, 768);
    await mock(context, state);
    let page = await open(context, `/publier/?annonce=${ONLINE_ID}`, N);
    await page.waitForSelector('.dpub .dsc-card');
    expectSame(N, 'ouverture', [...await head(page), await page.locator('.dsc-head-action button').getAttribute('aria-label'),
      await page.getByRole('combobox', { name: 'Rue et numéro (facultatif)' }).inputValue(), await amount(page, 'Prix de vente').inputValue()],
    ['Modifier l\'annonce', 'Étape 2 sur 7 · Informations principales', 'Enregistrer les modifications', '8 rue Paul Bert', '238 000']);
    expectSame(N, 'largeur', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    await amount(page, 'Prix de vente').fill('230000');
    await page.getByRole('combobox', { name: 'Rue et numéro (facultatif)' }).fill('3 place Bellecour');
    await page.waitForSelector('.place-list:not([hidden]) [role="option"]');
    await page.keyboard.press('Escape');
    await shot(page, 'publier-modifier.png');
    let mark = state.calls.length;
    await page.click('.dsc-head-action button');
    await page.waitForSelector('.dpub-success', { timeout: 15000 }).catch(() => problems.push(`${N} : confirmation absente`));
    const edited = writesSince(state, mark);
    expectSame(N, 'écritures', writeNames(edited), ['PATCH listings', 'POST listing_locations']);
    expectSame(N, 'modification', [edited[0]?.body?.price, 'status' in (edited[0]?.body ?? {}), edited[1]?.body, state.listings[0].status, state.listings[0].published_at],
      [230000, false, { listing_id: ONLINE_ID, street: '3 place Bellecour', latitude: 45.7578, longitude: 4.832 }, 'active', ONLINE.published_at]);
    expectSame(N, 'confirmation', [await textOf(page, '.dpub-success h1'), await page.getAttribute('.dpub-success-actions a >> nth=2', 'href')],
      ['Modifications enregistrées', '/compte/?vue=annonces']);
    await page.close();
    // « Mettre à jour les photos » : l'annonce s'ouvre sur ses photos ; la seconde est retirée à l'enregistrement.
    page = await open(context, `/publier/?annonce=${ONLINE_ID}&etape=photos`, `${N} photos`);
    await page.waitForSelector('.dpub-photo img');
    await waitStep(page, 5, 'Photos', `${N} photos`);
    await imagesLoaded(page, '.dpub-photo img', 2, `${N} photos`);
    await page.getByRole('button', { name: 'Options de la photo 2' }).click();
    await page.getByRole('menuitem', { name: 'Supprimer' }).click();
    mark = state.calls.length;
    await page.click('.dsc-head-action button');
    await page.waitForSelector('.dpub-success', { timeout: 15000 }).catch(() => problems.push(`${N} photos : confirmation absente`));
    const removed = writesSince(state, mark);
    expectSame(N, 'photo retirée', [writeNames(removed), removed.find((call) => call.table === 'storage')?.body, state.photos.map((photo) => photo.id)],
      [['PATCH listings', 'POST listing_locations', 'DELETE listing_photos', 'DELETE storage'], { prefixes: [ONLINE_PHOTOS[1].storage_path] }, [ONLINE_PHOTOS[0].id]]);
    await page.close();
    // L'annonce d'une autre personne, une annonce inconnue, une adresse mal formée : « Annonce introuvable », rien n'est écrit.
    mark = state.calls.length;
    for (const id of [OTHER_ID, UNKNOWN_ID, 'pas-un-identifiant']) {
      page = await open(context, `/publier/?annonce=${id}`, `${N} ${id}`);
      await page.waitForSelector('.dpub .dsc-empty');
      expectSame(`${N} ${id}`, 'introuvable', [(await head(page))[0], await textOf(page, '.dsc-empty p'), await page.getAttribute('.dsc-empty a', 'href')],
        ['Annonce introuvable', 'Cette annonce n\'existe plus ou n\'est pas l\'une des vôtres.', '/compte/?vue=annonces']);
      await page.close();
    }
    // L'annonce d'une autre personne est lue (elle est publiée) : sans équipe qui la partage, elle reste introuvable.
    expectSame(N, 'annonces introuvables : demandes', [writeNames(writesSince(state, mark)),
      state.calls.slice(mark).filter((call) => ['listings', 'listing_locations', 'rpc/my_team_agency'].includes(call.table)).map((call) => call.table)],
    [[], ['listings', 'rpc/my_team_agency', 'listings']]);
    await context.close();
  }

  // 6. Responsable d'une équipe : l'annonce d'Inès (agente) s'ouvre comme la sienne ; à l'enregistrement d'une photo de
  //    plus, l'adresse et la photo restent au nom d'Inès, dans son dossier (l'auteur n'est envoyé que pour elle).
  {
    const N = 'annonce d\'un collègue';
    const state = newState({ listings: [COLLEAGUE_LISTING], photos: COLLEAGUE_PHOTOS, locations: [COLLEAGUE_LOCATION], team: true });
    const context = await desktop(1024, 768);
    await mock(context, state);
    const page = await open(context, `/publier/?annonce=${COLLEAGUE_ID}&etape=photos`, N);
    await page.waitForSelector('.dpub-photo img');
    await waitStep(page, 5, 'Photos', N);
    expectSame(N, 'ouverture', (await head(page))[0], 'Modifier l\'annonce');
    await page.setInputFiles('.dpub input[type="file"]', [{ name: 'IMG_0003.jpg', mimeType: 'image/jpeg', buffer: PHOTO }]);
    await imagesLoaded(page, '.dpub-photo img', 2, `${N} : photo ajoutée`);
    const mark = state.calls.length;
    await page.click('.dsc-head-action button');
    await page.waitForSelector('.dpub-success', { timeout: 15000 }).catch(() => problems.push(`${N} : confirmation absente`));
    const saved = writesSince(state, mark);
    const upload = saved.find((call) => call.table === 'storage');
    const photo = saved.find((call) => call.table === 'listing_photos');
    expectSame(N, 'écritures', writeNames(saved), ['PATCH listings', 'POST listing_locations', 'POST storage', 'POST listing_photos']);
    expectSame(N, 'au nom d\'Inès', [
      saved[1]?.body?.owner_id, upload?.search.startsWith(`${COLLEAGUE}/${COLLEAGUE_ID}/`), photo?.body?.owner_id, photo?.body?.storage_path === upload?.search,
      'owner_id' in (saved[0]?.body ?? {}),
    ], [COLLEAGUE, true, COLLEAGUE, true, false]);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.log(`${problems.length} problème(s) :`);
  for (const problem of problems) console.log(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`Aucun problème. Captures : ${out}`);
}
