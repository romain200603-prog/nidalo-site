// Vérification de « Publier une annonce » (/publier/) dans Chromium, sans réseau : le serveur Supabase et les services
// d'adresse sont simulés avec des données inventées et notent tout ce que la page envoie. Le compte de test publie une
// annonce de bout en bout (sept étapes, deux photos, prénom demandé, un refus du serveur puis la mise en ligne),
// enregistre un brouillon puis le reprend, modifie une annonce en ligne et ses photos. Les écritures suivent l'ordre de
// l'app (SupabaseListingRepository.publish) : l'annonce en brouillon, l'adresse exacte, les photos (sans métadonnées),
// puis la mise en ligne. Sans compte : l'invitation à se connecter. Sur toutes les largeurs : l'assistant plein écran de
// l'app, sans barre d'onglets (en-tête, barre d'étapes, barre du bas, brouillon, publication, modification depuis Mes
// annonces et depuis la fiche, confirmation en pleine page) ; à partir de 1024 px, la mise en page de l'ordinateur
// (maquette 12 : l'en-tête simple et la barre du bas sur toute la largeur, l'étape au milieu, « Quitter » et « Continuer »
// à droite), avec les mêmes écritures. Captures pour Romain : publier-*.png.
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
const [LISTED, , RENTAL_LISTED] = JSON.parse(await readFile(join(fixtures, 'listings.json'), 'utf8'));

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
/** Location en ligne du compte de test (appartement meublé), pour « Disponibilité ». */
const RENTAL_ID = '6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1b54';
const { listing_photos: _rentalPhotos, ...rentalRow } = RENTAL_LISTED;
const RENTAL = { ...rentalRow, id: RENTAL_ID, owner_id: USER_ID };
const RENTAL_PHOTOS = [{ ...ONLINE_PHOTOS[0], id: 'a1000000-0000-4000-8000-000000000004', listing_id: RENTAL_ID, storage_path: `${USER_ID}/${RENTAL_ID}/premiere.jpg` }];
const RENTAL_LOCATION = { ...ONLINE_LOCATION, listing_id: RENTAL_ID };
/**
 * Hôtel en ligne du compte de test, murs seuls, une chambre : son loyer annuel de 100 000 € est enregistré au mois
 * (8 333,33 €), comme l'app.
 */
const HOTEL_ID = '6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1b55';
const HOTEL = {
  ...listedRow, id: HOTEL_ID, owner_id: USER_ID, property_type: 'hotel', publish_category: 'hotel', title: 'Hôtel des Canuts', rooms: null, bedrooms: null,
  monthly_charges: null, rental_info: { isLeased: true, currentMonthlyRent: 8333.33 }, asset_details: { hotel: { _0: { rooms: 1, scope: 'wallsOnly' } } },
};
const HOTEL_PHOTOS = [{ ...ONLINE_PHOTOS[0], id: 'a1000000-0000-4000-8000-000000000005', listing_id: HOTEL_ID, storage_path: `${USER_ID}/${HOTEL_ID}/premiere.jpg` }];
const HOTEL_LOCATION = { ...ONLINE_LOCATION, listing_id: HOTEL_ID };
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
/** Demandes coupées exprès (pas de réseau) : Chrome les écrit aussi dans la console. */
let expectedNetworkFailures = 0;

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
    /** Mes informations refusées par le serveur (le prénom demandé avant la première publication n'est pas enregistré). */
    refuseDetails: false,
    /** Pas de réseau pour la recherche d'adresse, ou au moment d'écrire l'annonce (n° 80). */
    offlineGeocoding: false,
    offlineWrites: false,
    /** Relecture de l'annonce après l'enregistrement en échec (n° 80). */
    failRereads: false,
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
  const now = new Date().toISOString();
  const rows = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : [];
  // Pas de réseau au moment d'écrire l'annonce : la demande ne part pas.
  if (state.offlineWrites && LISTING_TABLES.includes(table) && method !== 'GET') {
    expectedNetworkFailures += 1;
    return route.abort('internetdisconnected');
  }
  switch (table) {
    case 'profiles':
      if (method === 'GET') return single ? json(route, state.profile) : json(route, [state.profile]);
      if (method === 'PATCH') { Object.assign(state.profile, body); return empty(route); }
      break;
    case 'profile_details':
      if (method === 'GET') return json(route, [state.details]);
      if (method === 'PATCH') {
        if (state.refuseDetails) {
          expectedServerErrors += 1;
          return json(route, { code: '23514', message: 'new row violates check constraint', details: null, hint: null }, 400);
        }
        Object.assign(state.details, body);
        return empty(route);
      }
      break;
    case 'listings': {
      // Relecture d'une annonce après l'enregistrement (pas la vérification « id, status » du début) : en échec.
      if (method === 'GET' && state.failRereads && params.has('id') && params.get('select') !== 'id,status') {
        expectedServerErrors += 1;
        return json(route, { message: 'indisponible' }, 500);
      }
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
  if (state.offlineGeocoding) {
    expectedNetworkFailures += 1;
    return route.abort('internetdisconnected');
  }
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
    if (expectedServerErrors > 0 && /status of (400|409|500)/.test(text)) {
      expectedServerErrors -= 1;
      return;
    }
    if (expectedNetworkFailures > 0 && /net::ERR_/.test(text)) {
      expectedNetworkFailures -= 1;
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
/**
 * Carte d'une catégorie à l'étape 1 : sur ordinateur (≥ 1024 px), l'icône et le titre seuls, son nom est le titre ;
 * en dessous, le titre puis le sous-titre (« Résidentiel, Logement ou terrain »).
 */
const categoryTile = (page, title) => page.getByRole('button',
  page.viewportSize().width >= 1024 ? { name: title, exact: true } : { name: new RegExp(`^${title},`) });
/** Adresse introuvable, comme l'app (PublishValidation). */
const ADDRESS_NOT_FOUND = 'Veuillez renseigner une adresse valide.';
/**
 * Titre et sous-titre de l'en-tête de l'assistant (PhoneHeader) ; le titre d'un écran sans assistant (« Annonce
 * introuvable »).
 */
const TITLE = ':is(.ppub-titles h1, .dsc-head h1)';
const SUBTITLE = '.ppub-titles p';
const head = async (page) => [await textOf(page, TITLE), await textOf(page, SUBTITLE)];
/**
 * Étape affichée, par son sous-titre (« Étape 3 sur 7 · Caractéristiques »), une fois arrivée : le glissement d'une
 * étape à l'autre terminé (la copie de l'étape quittée retirée).
 */
async function waitStep(page, number, title, name) {
  await page.waitForFunction(([n, t, sel]) => document.querySelector(sel)?.textContent === `Étape ${n} sur 7 · ${t}`, [number, title, SUBTITLE], { timeout: 8000 })
    .catch(async () => problems.push(`${name} : étape « ${(await head(page))[1]} » au lieu de « Étape ${number} sur 7 · ${title} »`));
  await slideEnd(page, name);
}
/** Fin du glissement entre deux étapes (StepSlide) : plus de copie de l'étape quittée, plus de mouvement. */
async function slideEnd(page, name) {
  await page.waitForFunction(() => !document.querySelector('.dpub-steps.is-sliding, .dpub-step-exit > *'), null, { timeout: 5000 })
    .catch(() => problems.push(`${name} : le glissement entre deux étapes ne se termine pas`));
}
const errorsOf = (page) => page.$$eval('.dpub .field-error', (els) => els.map((el) => el.textContent.trim()));
const card = (page, title) => page.locator('.dpub .dsc-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
/** Champ de montant par son libellé (Amount : <label> puis le champ). */
const amount = (page, label) => page.locator('.dpub .dsc-amount').filter({ has: page.locator('label', { hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`) }) }).locator('input');
const chip = (page, group, title) => page.locator('.dpub [role="group"]').filter({ has: page.locator('.field-label', { hasText: new RegExp(`^${group}$`) }) })
  .getByRole('button', { name: title, exact: true });
/**
 * Collage d'un texte dans un champ (événement « paste » avec ses données, comme ⌘V), le texte du champ sélectionné ;
 * un collage que la page laisse passer insère le texte tel quel, comme le navigateur.
 */
const pasteInto = (locator, text) => locator.evaluate((input, value) => {
  input.focus();
  input.select();
  const data = new DataTransfer();
  data.setData('text/plain', value);
  const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  if (!event.defaultPrevented) document.execCommand('insertText', false, value);
}, text);
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
/**
 * Capture de l'assistant sur téléphone : la fenêtre prend sa hauteur (mesurée sans le minimum d'un écran), pour que
 * l'en-tête reste en haut et la barre du bas en bas, sans le pied de page.
 */
async function phoneShot(page, file) {
  const viewport = page.viewportSize();
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('dialog')) document.activeElement.blur(); });
  await page.evaluate(() => document.fonts.ready);
  const height = await page.evaluate(() => {
    const flow = document.querySelector('.dpub-flow, .dpub-success');
    if (!flow || document.querySelector('dialog[open]')) return innerHeight;
    flow.style.minHeight = '0px';
    const rect = flow.getBoundingClientRect();
    const total = Math.ceil(rect.top + window.scrollY + rect.height);
    flow.style.minHeight = '';
    return total;
  });
  await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, height) });
  await page.evaluate(() => window.scrollTo(0, 0));
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

  // 1. Sans compte, sur ordinateur : l'écran de connexion des autres pages du compte, comme sur téléphone (sans barre
  //    d'onglets) ; rien n'est demandé.
  {
    const N = 'publier sans compte';
    const state = newState();
    const context = await desktop();
    await mock(context, state, { signedIn: false });
    const page = await open(context, '/publier/', N);
    await page.waitForSelector('.signin-card');
    expectSame(N, 'page', [await textOf(page, '.signin-card h1'), await page.locator('.dpub').count(), await page.locator('.tabbar').isVisible()],
      ['Votre prochain bien commence ici.', 0, false]);
    const asked = state.calls.filter((call) => LISTING_TABLES.includes(call.table) || call.table === 'storage');
    if (asked.length) problems.push(`${N} : ${writeNames(asked).join(', ')} demandé`);
    await shot(page, 'publier-sans-compte.png');
    await context.close();
  }

  // 2. Téléphone (iPhone 13, 390 px) : l'assistant plein écran de l'app (PublishFlowView), sans barre d'onglets. Sans
  //    compte : la connexion d'abord, en pleine page, sans rien demander au serveur. Avec le compte : l'en-tête collé en
  //    haut (ronds de 36, titre de 20 qui rapetisse jusqu'à 80 %, « Étape 1 sur 7 · Catégorie » de 13, pastille de 36),
  //    la barre d'étapes (traits de 4, 6 pour l'étape en cours, zones de 44), la barre du bas collée en bas de l'écran
  //    (« Retour » de 130, « Continuer » de 52, la flèche devant le mot, atténué sans catégorie), le glissement des
  //    étapes sans débordement, « Brouillon non enregistré » dans une fenêtre, « Brouillon enregistré », puis la
  //    publication de bout en bout, avec les écritures de l'ordinateur, et la confirmation en pleine page.
  const phone = () => browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  {
    const N = 'publier téléphone sans compte';
    const state = newState();
    const context = await phone();
    await mock(context, state, { signedIn: false });
    const page = await open(context, '/publier/', N);
    await page.waitForSelector('.signin-card');
    expectSame(N, 'connexion d\'abord', [await textOf(page, '.signin-card h1'), await page.locator('.dpub').count(), await page.locator('.tabbar').isVisible()],
      ['Votre prochain bien commence ici.', 0, false]);
    const asked = state.calls.filter((call) => LISTING_TABLES.includes(call.table) || call.table === 'storage');
    if (asked.length) problems.push(`${N} : ${writeNames(asked).join(', ')} demandé`);
    await shot(page, 'publier-telephone-sans-compte.png');
    await context.close();
  }
  {
    const N = 'publier téléphone';
    const state = newState();
    const context = await phone();
    await mock(context, state);
    const page = await open(context, '/publier/', N);
    await page.waitForSelector('.dpub .dpub-category-grid');
    /** Mesures de l'écran : ce qui reste du site autour, l'en-tête, la barre d'étapes, la barre du bas et ses boutons. */
    const frame = () => page.evaluate(() => {
      const box = (el) => {
        const rect = el.getBoundingClientRect();
        return [Math.round(rect.width), Math.round(rect.height)];
      };
      const one = (selector) => document.querySelector(selector);
      const css = (selector, property) => getComputedStyle(one(selector))[property];
      const bar = one('.dpub .dsc-action-bar');
      return {
        around: [...document.querySelectorAll('.tabbar, .topbar, .dpub .dsc-head')].filter((el) => el.getClientRects().length > 0).length,
        head: [css('.ppub-head', 'position'), Math.round(one('.ppub-head').getBoundingClientRect().top)],
        rounds: [box(one('.ppub-back')), box(one('.dpub-close')), css('.ppub-back', 'backgroundColor')],
        title: [css('.ppub-titles h1', 'fontSize'), css('.ppub-titles h1', 'fontWeight'), css('.ppub-titles p', 'fontSize')],
        pill: one('.ppub-pill') ? [one('.ppub-pill').textContent, box(one('.ppub-pill'))[1], css('.ppub-pill', 'backgroundColor')] : null,
        segments: [...document.querySelectorAll('.dpub-progress > * > span')].map((el) => Math.round(el.getBoundingClientRect().height)),
        zones: [...document.querySelectorAll('.dpub-progress > *')].map((el) => Math.round(el.getBoundingClientRect().height)),
        bar: [getComputedStyle(bar).position, Math.round(innerHeight - bar.getBoundingClientRect().bottom), getComputedStyle(bar).backgroundColor],
        buttons: [...bar.querySelectorAll('.dsc-action-buttons > .dsc-button')]
          .map((el) => [...box(el), el.firstElementChild?.tagName.toLowerCase() ?? null, el.textContent.trim(), getComputedStyle(el).opacity]),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    expectSame(N, 'étape 1 sans choix', [await frame(), await page.locator(CONTINUE).isDisabled()], [{
      around: 0, head: ['sticky', 0], rounds: [[36, 36], [36, 36], 'rgb(242, 240, 236)'], title: ['20px', '700', '13px'], pill: null,
      segments: [6, 4, 4, 4, 4, 4, 4], zones: [44, 44, 44, 44, 44, 44, 44], bar: ['sticky', 0, 'rgb(255, 255, 255)'],
      buttons: [[358, 52, 'svg', 'Continuer', '0.5']], overflow: 0,
    }, true]);
    await page.getByRole('button', { name: /^Résidentiel,/ }).click();
    await page.getByRole('button', { name: 'Appartement', exact: true }).click();
    // Avec la pastille « Brouillon », « Publier une annonce » ne tient plus : il rapetisse à 80 % (16 px), puis se coupe.
    await page.waitForFunction((sel) => getComputedStyle(document.querySelector(sel)).opacity === '1', CONTINUE, { timeout: 3000 }).catch(() => undefined);
    const chosen = await frame();
    expectSame(N, 'étape 1 choisie', [chosen.title, chosen.pill, chosen.buttons], [['16px', '700', '13px'], ['Brouillon', 36, 'rgb(238, 242, 250)'],
      [[358, 52, 'svg', 'Continuer', '1']]]);
    await phoneShot(page, 'publier-telephone-1-categorie.png');
    // L'étape suivante glisse de toute la largeur de l'écran, le sous-titre en fondu, sans faire défiler la page de côté.
    await page.click(CONTINUE);
    expectSame(N, 'glissement', await page.evaluate(() => ({
      sliding: document.querySelector('.dpub-steps').classList.contains('is-sliding'),
      animations: [getComputedStyle(document.querySelector('.dpub-step')).animationName, getComputedStyle(document.querySelector('.dpub-step-exit > *')).animationName,
        getComputedStyle(document.querySelector('.ppub-titles p')).animationName],
      overflow: document.documentElement.scrollWidth - innerWidth,
    })), { sliding: true, animations: ['ppub-step-from-right', 'ppub-step-to-left', 'app-fade-in'], overflow: 0 });
    await waitStep(page, 2, 'Informations principales', N);
    const second = await frame();
    expectSame(N, 'étape 2', [second.segments, second.buttons, second.overflow],
      [[4, 6, 4, 4, 4, 4, 4], [[130, 52, 'svg', 'Retour', '1'], [218, 52, 'svg', 'Continuer', '1']], 0]);
    // « Brouillon » trop tôt : la fenêtre de l'app, rien d'envoyé, rien dans la barre du bas.
    await page.click('.ppub-pill');
    await page.waitForSelector('dialog.alert-dialog[open]');
    expectSame(N, 'brouillon trop tôt', [await textOf(page, 'dialog[open] h2'), await textOf(page, 'dialog[open] p'),
      await page.$$eval('dialog[open] .alert-actions button', (els) => els.map((el) => el.textContent.trim())), await page.locator('.dsc-action-message').count(),
      writeNames(writesSince(state, 0))],
    ['Brouillon non enregistré', 'Pour enregistrer le brouillon, indiquez d’abord le type de bien, le code postal et la ville.', ['Compris'], 0, []]);
    await phoneShot(page, 'publier-telephone-brouillon-refuse.png');
    await page.click('dialog[open] button:text("Compris")');
    await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached' }).catch(() => undefined);
    await page.getByRole('combobox', { name: 'Rue et numéro (facultatif)' }).fill('12 rue Mercière');
    await page.getByRole('option', { name: /12 Rue Mercière/ }).click();
    await page.waitForTimeout(700);
    await amount(page, 'Prix de vente').fill('320000');
    let mark = state.calls.length;
    await page.click('.ppub-pill');
    await page.waitForSelector('.dsc-saved', { timeout: 8000 }).catch(() => problems.push(`${N} : « Brouillon enregistré » absent`));
    const draftId = state.listings[0]?.id;
    expectSame(N, 'brouillon enregistré', [writeNames(writesSince(state, mark)), await textOf(page, '.dsc-saved'), page.url(),
      await page.$eval('.dsc-saved', (el) => [Math.round(el.getBoundingClientRect().height), getComputedStyle(el).backgroundColor, el.firstElementChild?.classList.contains('ppub-check')])],
    [['POST listings', 'POST listing_locations'], 'Brouillon enregistré', `${base}/publier/?annonce=${draftId}`, [44, 'rgb(87, 121, 101)', true]]);
    await page.waitForSelector('.dsc-saved', { state: 'detached', timeout: 5000 }).catch(() => undefined);
    await phoneShot(page, 'publier-telephone-2-informations.png');
    await page.click(CONTINUE);
    await waitStep(page, 3, 'Caractéristiques', N);
    await amount(page, 'Surface habitable').fill('62');
    await chip(page, 'Pièces', '3').click();
    await chip(page, 'Chambres', '2').click();
    await page.getByRole('button', { name: 'DPE (classe énergie) C', exact: true }).click();
    await page.getByRole('button', { name: 'GES (classe climat) B', exact: true }).click();
    await amount(page, 'Dépenses d\'énergie minimum').fill('820');
    await amount(page, 'Dépenses d\'énergie maximum').fill('1150');
    // Pièces et chambres : cinq pastilles de 40 à 6 d'écart sur une ligne (RoomsPicker) ; « Studio » rapetisse un peu pour
    // tenir en entier, les chiffres gardent 13,5.
    expectSame(N, 'pièces', await page.$$eval('.dpub-choices-rooms', (rows) => rows.map((row) => {
      const chips = [...row.children];
      const rect = (el) => el.getBoundingClientRect();
      const title = chips[0].querySelector('.dpub-chip-title');
      return [chips.length, Math.round(rect(chips[1]).left - rect(chips[0]).right), Math.round(rect(chips[0]).height), title.textContent,
        title.scrollWidth <= title.clientWidth, Number(parseFloat(getComputedStyle(title).fontSize).toFixed(1))];
    })), [[5, 6, 40, 'Studio', true, 13.1], [5, 6, 40, '1', true, 13.5]]);
    await phoneShot(page, 'publier-telephone-3-caracteristiques.png');
    await page.click(CONTINUE);
    await waitStep(page, 4, 'Prix et finances', N);
    await page.click(CONTINUE);
    await waitStep(page, 5, 'Photos', N);
    await page.setInputFiles('.dpub input[type="file"]', [
      { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: PHOTO_GPS },
      { name: 'IMG_0002.jpg', mimeType: 'image/jpeg', buffer: PHOTO },
    ]);
    await imagesLoaded(page, '.dpub-photo img', 2, `${N} : photos choisies`);
    // Photos : trois colonnes à 8 d'écart, « Principale » de 20 sur le bleu, menu rond de 28 (PublishMediaStep).
    expectSame(N, 'photos', await page.evaluate(() => {
      const photos = [...document.querySelectorAll('.dpub-photo')];
      const rect = (el) => el.getBoundingClientRect();
      const main = document.querySelector('.dpub-photo-main');
      return [getComputedStyle(document.querySelector('.dpub-photos')).gridTemplateColumns.split(' ').length, Math.round(rect(photos[1]).left - rect(photos[0]).right),
        Math.round(rect(main).height), getComputedStyle(main).backgroundColor, Math.round(rect(document.querySelector('.dpub-photo-menu')).width)];
    }), [3, 8, 20, 'rgb(60, 92, 176)', 28]);
    await phoneShot(page, 'publier-telephone-5-photos.png');
    await page.click(CONTINUE);
    await waitStep(page, 6, 'Description et aperçu', N);
    await page.getByRole('button', { name: 'Proposer : « Appartement 3 pièces – Lyon »' }).click();
    await page.getByRole('button', { name: 'Rédiger à partir de mes informations' }).click();
    await page.click(CONTINUE);
    await waitStep(page, 7, 'Vérification', N);
    expectSame(N, 'récapitulatif', await page.$$eval('.dpub-recap-row', (rows) => rows.map((row) => `${row.querySelector('dt').textContent}: ${row.querySelector('dd span').textContent}`)),
      ['Catégorie: Résidentiel · Appartement', 'Adresse: 12 Rue Mercière, 69002 Lyon', 'Prix: 320 000 €', 'Surface: 62 m²', 'DPE: C', 'Photos: 2']);
    await phoneShot(page, 'publier-telephone-7-verification.png');
    // « Fermer » : la question de l'app, « Continuer » y reste.
    await page.click('.dpub-close');
    await page.waitForSelector('dialog.alert-dialog[open]');
    expectSame(N, 'quitter ?', [await textOf(page, 'dialog[open] h2'), await page.$$eval('dialog[open] .alert-actions button', (els) => els.map((el) => el.textContent.trim()))],
      ['Quitter la publication ?', ['Enregistrer le brouillon', 'Quitter sans enregistrer', 'Continuer']]);
    await page.click('dialog[open] button:text("Continuer")');
    await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached' }).catch(() => undefined);
    mark = state.calls.length;
    await page.getByRole('button', { name: 'Publier mon annonce' }).click();
    await page.waitForSelector('.dpub-success', { timeout: 15000 }).catch(() => problems.push(`${N} : confirmation absente`));
    expectSame(N, 'écritures', writeNames(writesSince(state, mark)), ['PATCH listings', 'POST listing_locations', 'POST storage', 'POST listing_photos', 'POST storage',
      'POST listing_photos', 'PATCH listings']);
    expectSame(N, 'annonce en ligne', [state.listings.length, state.listings[0]?.status, state.photos.length], [1, 'active', 2]);
    // Confirmation en pleine page : la coche verte de 64, le titre de 24, les trois boutons en bas de l'écran.
    expectSame(N, 'confirmation', await page.evaluate(() => {
      const rect = (el) => el.getBoundingClientRect();
      const success = document.querySelector('.dpub-success');
      const actions = [...document.querySelectorAll('.dpub-success-actions a')];
      return {
        page: [Math.round(rect(success).top), Math.round(rect(success).width), Math.round(rect(success).height) >= innerHeight],
        check: [Math.round(rect(document.querySelector('.dpub-success-check')).width), getComputedStyle(document.querySelector('.dpub-success-check')).color],
        title: [document.querySelector('.dpub-success h1').textContent, getComputedStyle(document.querySelector('.dpub-success h1')).fontSize],
        actions: actions.map((el) => [el.textContent.trim(), Math.round(rect(el).height)]),
        bottom: Math.round(innerHeight - rect(actions.at(-1)).bottom),
        around: [...document.querySelectorAll('.tabbar, .topbar')].filter((el) => el.getClientRects().length > 0).length,
      };
    }), {
      page: [0, 390, true], check: [64, 'rgb(87, 121, 101)'], title: ['Annonce publiée', '24px'],
      actions: [['Voir l\'annonce', 52], ['Mes annonces', 52], ['Fermer', 17]], bottom: 24, around: 0,
    });
    await phoneShot(page, 'publier-telephone-publiee.png');
    await context.close();
  }

  // 2 bis. Téléphone : « Modifier l'annonce » et « Mettre à jour les photos » depuis Mes annonces (n° E11), et « Gérer
  //    l'annonce » depuis sa fiche (n° E12) : l'assistant s'ouvre en modification, « Enregistrer » dans l'en-tête ;
  //    « Fermer » revient d'où il a été ouvert.
  {
    const N = 'modifier téléphone';
    const state = newState({ listings: [ONLINE], photos: ONLINE_PHOTOS, locations: [ONLINE_LOCATION] });
    const context = await phone();
    await mock(context, state);
    const page = await open(context, '/compte/?vue=annonces', N);
    await page.waitForSelector('.my-listing');
    // Le menu « … » de Mes annonces (étape 5) : des boutons de menu qui ouvrent l'assistant.
    await page.click('.my-listing .my-listing-menu .dsc-menu-button');
    expectSame(N, 'Mes annonces', [await page.getAttribute('.deposit-button', 'href'),
      await page.$$eval('.my-listing-actions a', (els) => els.map((el) => [el.textContent.trim(), el.getAttribute('href')])),
      await page.$$eval('.my-listing-menu [role=menuitem]', (els) => els.map((el) => el.textContent.trim()))], ['/publier/', [
      ['Voir', `/annonce/?id=${ONLINE_ID}`], ['Modifier', `/publier/?annonce=${ONLINE_ID}`]],
      ['Modifier l\'annonce', 'Mettre à jour les photos', 'Suspendre', 'Supprimer']]);
    await page.getByRole('menuitem', { name: 'Modifier l\'annonce' }).click();
    await page.waitForSelector('.dpub .dsc-card');
    await waitStep(page, 2, 'Informations principales', N);
    expectSame(N, 'ouverture', [...await head(page), await page.getAttribute('.ppub-pill', 'aria-label'), await textOf(page, '.ppub-pill'),
      await amount(page, 'Prix de vente').inputValue(), await page.locator('.tabbar').isVisible()],
    ['Modifier l\'annonce', 'Étape 2 sur 7 · Informations principales', 'Enregistrer les modifications', 'Enregistrer', '238 000', false]);
    await phoneShot(page, 'publier-telephone-modifier.png');
    await amount(page, 'Prix de vente').fill('230000');
    let mark = state.calls.length;
    await page.click('.ppub-pill');
    await page.waitForSelector('.dpub-success', { timeout: 15000 }).catch(() => problems.push(`${N} : confirmation absente`));
    expectSame(N, 'enregistrée', [writeNames(writesSince(state, mark)), state.listings[0].price, state.listings[0].status, await textOf(page, '.dpub-success h1'),
      await page.$$eval('.dpub-success-actions a', (links) => links.map((link) => [link.textContent.trim(), link.getAttribute('href')]))],
    [['PATCH listings', 'POST listing_locations'], 230000, 'active', 'Modifications enregistrées',
      [['Voir mon annonce', `/annonce/?id=${ONLINE_ID}`], ['Mes annonces', '/compte/?vue=annonces'], ['Fermer', '/compte/?vue=annonces']]]);
    // « Mettre à jour les photos » : l'annonce s'ouvre sur ses photos ; la seconde est retirée à l'enregistrement.
    await page.goto(`${base}/compte/?vue=annonces`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.my-listing');
    await page.click('.my-listing .my-listing-menu .dsc-menu-button');
    await page.getByRole('menuitem', { name: 'Mettre à jour les photos' }).click();
    await page.waitForSelector('.dpub-photo img');
    await waitStep(page, 5, 'Photos', N);
    await imagesLoaded(page, '.dpub-photo img', 2, `${N} photos`);
    await page.getByRole('button', { name: 'Options de la photo 2' }).click();
    await page.getByRole('menuitem', { name: 'Supprimer' }).click();
    mark = state.calls.length;
    await page.click('.ppub-pill');
    await page.waitForSelector('.dpub-success', { timeout: 15000 }).catch(() => problems.push(`${N} photos : confirmation absente`));
    expectSame(N, 'photo retirée', [writeNames(writesSince(state, mark)), state.photos.map((photo) => photo.id)],
      [['PATCH listings', 'POST listing_locations', 'DELETE listing_photos', 'DELETE storage'], [ONLINE_PHOTOS[0].id]]);
    // Depuis sa fiche : « Gérer l'annonce » ouvre la modification ; « Fermer », sans changement, ramène à la fiche.
    await page.goto(`${base}/annonce/?id=${ONLINE_ID}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Gérer l\'annonce' }).click();
    await page.waitForURL(`${base}/publier/?annonce=${ONLINE_ID}`);
    await page.waitForSelector('.dpub .dsc-card');
    await page.click('.dpub-close');
    await page.waitForURL(`${base}/annonce/?id=${ONLINE_ID}`, { timeout: 8000 }).catch(() => problems.push(`${N} : « Fermer » ne revient pas à la fiche (${page.url()})`));
    await context.close();
  }

  // 3. Publier de bout en bout, à 1440 px, avec un compte sans prénom : les sept étapes, deux photos (l'une avec sa
  //    position GPS), le prénom demandé, un refus du serveur, puis la mise en ligne. La mise en page de l'ordinateur
  //    (maquette 12) : l'en-tête et la barre du bas sur toute la largeur, l'étape au milieu, la confirmation aussi.
  {
    const N = 'publier';
    const state = newState({ firstName: '' });
    const context = await desktop();
    await mock(context, state);
    const page = await open(context, '/publier/', N);
    await page.waitForSelector('.dpub .dpub-category-grid');
    expectSame(N, 'en-tête', await head(page), ['Publier une annonce', 'Étape 1 sur 7 · Catégorie']);
    // Comme l'app : Résidentiel, Location, Investissement, Hôtels ; sur ordinateur, sans leurs sous-titres courts.
    expectSame(N, 'avant le choix', [await page.locator('.ppub-pill').count(), await page.locator(CONTINUE).isDisabled(),
      await page.$$eval('.dpub-category-tile .dpub-category-title', (els) => els.map((el) => el.textContent)), await page.locator('.dpub-category-subtitle').count()],
    [0, true, ['Résidentiel', 'Location', 'Investissement', 'Hôtels'], 0]);
    /** Place de l'assistant : la colonne, la largeur de l'étape, de l'en-tête et de la barre du bas. */
    const layout = () => page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const inner = (selector) => {
        const el = document.querySelector(selector);
        const style = getComputedStyle(el);
        return Math.round(el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      };
      return {
        column: [Math.round(rect('.account-wrap').left), Math.round(rect('.account-wrap').width)],
        step: inner('.dpub-steps'),
        head: [Math.round(rect('.ppub-head').width), Math.round(rect('.ppub-head-row').width), Math.round(rect('.ppub-head .dpub-progress').width)],
        bar: [Math.round(rect('.dpub .dsc-action-bar').width), Math.round(rect('.dpub .dsc-action-buttons').width)],
        around: [...document.querySelectorAll('.tabbar, .topbar, .dpub .dsc-head')].filter((el) => el.getClientRects().length > 0).length,
        overflowX: document.documentElement.scrollWidth - innerWidth,
      };
    });
    // L'en-tête et la barre du bas sur toute la largeur de la fenêtre, la ligne de l'en-tête et la barre d'étapes dans le
    // conteneur (1200 px au plus, 32 px de marge) ; l'étape au milieu (896 px de contenu) ; « Continuer » seul à droite ;
    // ni barre d'onglets ni autre en-tête.
    expectSame(N, 'colonne', await layout(), { column: [0, 1440], step: 896, head: [1440, 1200, 1200], bar: [1440, 240], around: 0, overflowX: 0 });
    // Les mesures de la maquette 12 : en-tête blanc collé en haut (le logo sans lien, le titre de 17, « Étape 1 sur 7 ·
    // Catégorie » de 13, « Quitter » de 42 à la place de la croix, la flèche cachée), barre d'étapes (traits de 5, 7 pour
    // l'étape en cours, zones de 25), barre du bas blanche collée en bas de la fenêtre, « Continuer » de 240 × 54 atténué
    // sans catégorie ; pas de pied de page du site.
    expectSame(N, 'écran de l\'ordinateur', await page.evaluate(() => {
      const one = (selector) => document.querySelector(selector);
      const size = (el) => [Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)];
      const bar = one('.dpub .dsc-action-bar');
      const brand = one('.ppub-head .ppub-brand');
      return {
        head: [getComputedStyle(one('.ppub-head')).position, Math.round(one('.ppub-head').getBoundingClientRect().top), getComputedStyle(one('.ppub-head')).backgroundColor],
        brand: [brand?.textContent ?? null, brand?.closest('a') ?? null, brand ? Math.round(brand.getBoundingClientRect().left) : null],
        rounds: [size(one('.ppub-back')), size(one('.dpub-close'))],
        quit: [one('.dpub-close').textContent.trim(), one('.dpub-close').getAttribute('aria-label')],
        title: [getComputedStyle(one('.ppub-titles h1')).fontSize, getComputedStyle(one('.ppub-titles p')).fontSize],
        segments: [...document.querySelectorAll('.dpub-progress > * > span')].map((el) => Math.round(el.getBoundingClientRect().height)),
        zones: [...document.querySelectorAll('.dpub-progress > *')].map((el) => Math.round(el.getBoundingClientRect().height)),
        bar: [getComputedStyle(bar).position, Math.round(innerHeight - bar.getBoundingClientRect().bottom), getComputedStyle(bar).backgroundColor],
        buttons: [...bar.querySelectorAll('.dsc-action-buttons > .dsc-button')]
          .map((el) => [...size(el), Math.round(el.getBoundingClientRect().right), el.textContent.trim(), getComputedStyle(el).opacity]),
        footer: [...document.querySelectorAll('.site-footer, .footer')].filter((el) => el.getClientRects().length > 0).length,
      };
    }), {
      head: ['sticky', 0, 'rgb(255, 255, 255)'], brand: ['NIDΛLONidalo', null, 152], rounds: [[0, 0], [102, 42]], quit: ['Quitter', 'Quitter la publication'],
      title: ['17px', '13px'], segments: [7, 5, 5, 5, 5, 5, 5], zones: [25, 25, 25, 25, 25, 25, 25],
      bar: ['sticky', 0, 'rgb(255, 255, 255)'], buttons: [[240, 54, 1168, 'Continuer', '0.5']], footer: 0,
    });
    await categoryTile(page, 'Résidentiel').click();
    await page.getByRole('button', { name: 'Appartement', exact: true }).click();
    const chosen = async () => [await textOf(page, '.dpub-category-tile[aria-pressed="true"] .dpub-category-title'), await textOf(page, '.dpub-types-grid [aria-pressed="true"]')];
    expectSame(N, 'catégorie choisie', [...await chosen(), await page.locator('.ppub-pill[aria-label="Enregistrer en brouillon"]').count(),
      await page.locator(CONTINUE).isDisabled()], ['Résidentiel', 'Appartement', 1, false]);
    // Fenêtre rétrécie un instant sous 1024 px : le même assistant sur toute la largeur de la fenêtre (l'étape et les
    // boutons dans 640 px), avec la même saisie ; puis la colonne à nouveau.
    const columnWidth = (width) => page.waitForFunction((w) => Math.round(document.querySelector('.account-wrap').getBoundingClientRect().width) === w, width, { timeout: 3000 })
      .catch(() => problems.push(`${N} : l'assistant ne fait pas ${width} px de large`));
    await page.setViewportSize({ width: 800, height: 900 });
    await columnWidth(800);
    const narrow = await layout();
    expectSame(N, 'fenêtre étroite', [...await chosen(), await textOf(page, '.ppub-titles h1'), narrow.column, narrow.step, narrow.bar, narrow.around],
      ['Résidentiel', 'Appartement', 'Publier une annonce', [0, 800], 640, [800, 640], 0]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await columnWidth(1440);
    expectSame(N, 'saisie gardée', [...await chosen(), (await layout()).column], ['Résidentiel', 'Appartement', [0, 1440]]);
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
    // Un montant en euros collé avec des points de milliers : « 250.000 » donne 250 000 (n° 242).
    await pasteInto(amount(page, 'Prix de vente'), '250.000');
    expectSame(N, 'prix collé', await amount(page, 'Prix de vente').inputValue(), '250 000');
    await amount(page, 'Prix de vente').fill('320000');
    await page.waitForTimeout(400);
    expectSame(N, 'prix saisi', await amount(page, 'Prix de vente').inputValue(), '320 000');
    // Sans réseau, l'adresse n'est pas « introuvable » : elle n'a pas pu être vérifiée (n° 80).
    state.offlineGeocoding = true;
    await page.click(CONTINUE);
    await page.waitForFunction(() => [...document.querySelectorAll('.dpub .field-error')].some((el) => el.textContent.startsWith('L\'adresse n\'a pas pu')), null, { timeout: 12000 })
      .catch(async () => problems.push(`${N} : adresse sans réseau non signalée (${JSON.stringify(await errorsOf(page))})`));
    expectSame(N, 'adresse sans réseau', [await errorsOf(page), await textOf(page, SUBTITLE)],
      [['L\'adresse n\'a pas pu être vérifiée. Vérifiez votre connexion, puis réessayez.'], 'Étape 2 sur 7 · Informations principales']);
    state.offlineGeocoding = false;
    await page.click(CONTINUE);
    // Adresse introuvable : le message de l'app (PublishValidation, n° E19).
    await page.waitForFunction((text) => [...document.querySelectorAll('.dpub .field-error')].some((el) => el.textContent === text), ADDRESS_NOT_FOUND, { timeout: 8000 })
      .catch(async () => problems.push(`${N} : adresse introuvable non signalée (${JSON.stringify(await errorsOf(page))})`));
    await waitStep(page, 2, 'Informations principales', N);
    // L'adresse modifiée, le message disparaît.
    await page.getByRole('combobox', { name: 'Code postal' }).fill('');
    expectSame(N, 'adresse modifiée', (await errorsOf(page)).filter((text) => text === ADDRESS_NOT_FOUND), []);
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
    // Logement avec un DPE : les deux dépenses d'énergie sont obligatoires (n° 84).
    await amount(page, 'Dépenses d\'énergie minimum').fill('820');
    await amount(page, 'Dépenses d\'énergie maximum').fill('1150');
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
    // Sur ordinateur : quatre colonnes à 10 px d'écart, « Principale » de 20, menu rond de 28 ; le menu « … » de 220 px.
    expectSame(N, 'grille des photos', await page.evaluate(() => {
      const photos = [...document.querySelectorAll('.dpub-photo')];
      const rect = (el) => el.getBoundingClientRect();
      return [getComputedStyle(document.querySelector('.dpub-photos')).gridTemplateColumns.split(' ').length, Math.round(rect(photos[1]).left - rect(photos[0]).right),
        Math.round(rect(photos[0]).width), Math.round(rect(document.querySelector('.dpub-photo-main')).height), Math.round(rect(document.querySelector('.dpub-photo-menu')).width)];
    }), [4, 10, 204, 20, 28]);
    await page.getByRole('button', { name: 'Options de la photo 2' }).click();
    expectSame(N, 'menu de la photo', await page.$eval('.dpub-photo .dsc-menu-list', (menu) => [Math.round(menu.getBoundingClientRect().width),
      [...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent.trim())]), [220, ['Photo principale', 'Déplacer avant', 'Supprimer']]);
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
    // Le prénom refusé par le serveur : la fenêtre s'intitule « Prénom non enregistré » (n° 190) ; rien n'est publié.
    state.refuseDetails = true;
    let mark = state.calls.length;
    await page.getByRole('button', { name: 'Publier mon annonce' }).click();
    await page.waitForSelector('dialog.alert-dialog[open] input[aria-label="Prénom"]');
    await page.fill('dialog[open] input[aria-label="Prénom"]', 'Claire');
    await page.click('dialog[open] button[type="submit"]');
    await page.waitForSelector('dialog.alert-dialog[open] h2:text("Prénom non enregistré")', { timeout: 15000 })
      .catch(() => problems.push(`${N} : « Prénom non enregistré » absent`));
    expectSame(N, 'prénom refusé', [await textOf(page, 'dialog[open] h2'), writeNames(writesSince(state, mark))],
      ['Prénom non enregistré', ['PATCH profiles', 'PATCH profile_details']]);
    await page.click('dialog[open] button:text("Compris")');
    await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached' }).catch(() => undefined);
    state.refuseDetails = false;
    // Premier essai : le serveur refuse la mise en ligne (message P0001 montré tel quel) ; l'annonce reste en brouillon.
    state.refuseOnline = 'Le DPE est obligatoire pour publier cette annonce.';
    mark = state.calls.length;
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
      'has_elevator', 'outdoor_spaces', 'postal_code', 'city', 'insee_code', 'location_precision', 'energy_class', 'climate_class', 'annual_energy_cost_min',
      'annual_energy_cost_max', 'rental_info', 'country_code'].map((key) => [key, inserted[key]])), {
      status: 'draft', transaction: 'sale', property_type: 'apartment', publish_category: 'residential', title: 'Appartement 3 pièces – Lyon', price: 320000, living_area: 62,
      rooms: 3, bedrooms: 2, floor: 2, has_elevator: true, outdoor_spaces: ['balcony'], postal_code: '69002', city: 'Lyon', insee_code: '69382',
      location_precision: 'approximate', energy_class: 'C', climate_class: 'B', annual_energy_cost_min: 820, annual_energy_cost_max: 1150, rental_info: null,
      country_code: 'FR',
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
    expectSame(N, 'après le refus', [state.listings[0]?.status, state.listings[0]?.published_at, await textOf(page, SUBTITLE)],
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
    // Confirmation sur ordinateur : l'en-tête réduit au logo, puis toute la largeur jusqu'en bas de la fenêtre ; la coche
    // verte de 64 ; les trois liens de 54 dans la barre du bas, « Voir l'annonce » (240) à droite de la colonne de 896 px.
    expectSame(N, 'confirmation : écran', await page.evaluate(() => {
      const rect = (el) => el.getBoundingClientRect();
      const success = document.querySelector('.dpub-success');
      const actions = [...document.querySelectorAll('.dpub-success-actions a')];
      return {
        page: [Math.round(rect(success).left), Math.round(rect(success).top), Math.round(rect(success).width), Math.round(rect(success).bottom) >= innerHeight],
        head: [...document.querySelectorAll('.dpub .ppub-head')].map((el) => [el.textContent, el.querySelectorAll('button, a, h1').length]),
        check: [Math.round(rect(document.querySelector('.dpub-success-check')).width), getComputedStyle(document.querySelector('.dpub-success-check')).color],
        actions: actions.map((el) => [el.textContent.trim(), Math.round(rect(el).height), Math.round(rect(el).right)]),
        width: Math.round(rect(actions[0]).width),
        bottom: Math.round(innerHeight - rect(actions.at(-1)).bottom),
        around: [...document.querySelectorAll('.tabbar, .topbar, .site-footer')].filter((el) => el.getClientRects().length > 0).length,
      };
    }), {
      page: [0, 77, 1440, true], head: [['NIDΛLONidalo', 0]], check: [64, 'rgb(87, 121, 101)'],
      actions: [['Voir l\'annonce', 54, 1168], ['Mes annonces', 54, 916], ['Fermer', 54, 716]], width: 240, bottom: 16, around: 0,
    });
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
    await page.waitForSelector('.dpub .dpub-category-grid');
    await categoryTile(page, 'Résidentiel').click();
    await page.getByRole('button', { name: 'Maison', exact: true }).click();
    // « Brouillon » trop tôt : la fenêtre de l'app, comme sur téléphone ; rien d'envoyé, rien dans la barre du bas.
    await page.click('.ppub-pill[aria-label="Enregistrer en brouillon"]');
    await page.waitForSelector('dialog.alert-dialog[open]');
    expectSame(N, 'brouillon trop tôt', [await textOf(page, 'dialog[open] h2'), await textOf(page, 'dialog[open] p'),
      await page.$$eval('dialog[open] .alert-actions button', (els) => els.map((el) => el.textContent.trim())), await page.locator('.dsc-action-message').count(),
      writeNames(writesSince(state, 0))],
    ['Brouillon non enregistré', 'Pour enregistrer le brouillon, indiquez d’abord le type de bien, le code postal et la ville.', ['Compris'], 0, []]);
    await page.click('dialog[open] button:text("Compris")');
    await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached' }).catch(() => undefined);
    await page.click(CONTINUE);
    await waitStep(page, 2, 'Informations principales', N);
    await page.getByRole('combobox', { name: 'Code postal' }).fill('69002');
    await page.getByRole('option', { name: /Lyon/ }).first().click();
    expectSame(N, 'commune choisie', [await page.getByRole('combobox', { name: 'Code postal' }).inputValue(), await page.getByRole('combobox', { name: 'Ville' }).inputValue()], ['69002', 'Lyon']);
    let mark = state.calls.length;
    await page.click('.ppub-pill[aria-label="Enregistrer en brouillon"]');
    await page.waitForSelector('.dsc-saved', { timeout: 8000 }).catch(() => problems.push(`${N} : « Brouillon enregistré » absent`));
    const saved = writesSince(state, mark);
    const draftId = state.listings[0]?.id;
    expectSame(N, 'brouillon enregistré', [writeNames(saved), await textOf(page, '.dsc-saved'), page.url()],
      [['POST listings', 'POST listing_locations'], 'Brouillon enregistré', `${base}/publier/?annonce=${draftId}`]);
    expectSame(N, 'ligne du brouillon', Object.fromEntries(['status', 'property_type', 'transaction', 'price', 'postal_code', 'city', 'insee_code'].map((key) => [key, saved[0]?.body?.[key]])),
      { status: 'draft', property_type: 'house', transaction: 'sale', price: 0, postal_code: '69002', city: 'Lyon', insee_code: '69123' });
    expectSame(N, 'position de la commune', saved[1]?.body, { listing_id: draftId, street: null, latitude: 45.758, longitude: 4.8351 });
    // Saisie non enregistrée : fermer l'onglet demande confirmation ; « Fermer » propose d'enregistrer.
    await amount(page, 'Prix de vente').fill('450000');
    unloadAnswers.set(page, 'rester');
    await page.close({ runBeforeUnload: true });
    await waitFor(() => unloadPrompts.includes(N), `${N} : « Quitter la page ? » à la fermeture`);
    if (page.isClosed()) problems.push(`${N} : la page s'est fermée malgré « Rester »`);
    unloadAnswers.delete(page);
    await page.click('.dpub-close');
    await page.waitForSelector('dialog.alert-dialog[open]');
    expectSame(N, 'quitter ?', [await textOf(page, 'dialog[open] h2'), await page.$$eval('dialog[open] .alert-actions button', (els) => els.map((el) => el.textContent.trim()))],
      // « Continuer » a le rôle d'annulation dans l'app (PublishFlowView) : pas d'« Annuler » en plus (n° E17).
      ['Quitter la publication ?', ['Enregistrer le brouillon', 'Quitter sans enregistrer', 'Continuer']]);
    await shot(page, 'publier-brouillon-quitter.png');
    await page.click('dialog[open] button:text("Continuer")');
    await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached' }).catch(() => undefined);
    await page.click('.dpub-close');
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
      await page.locator('.ppub-pill[aria-label="Enregistrer en brouillon"]').count()], ['Reprendre le brouillon', '450 000', 'Lyon', 1]);
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
    expectSame(N, 'ouverture', [...await head(page), await page.getAttribute('.ppub-pill', 'aria-label'), await textOf(page, '.ppub-pill'),
      await page.getByRole('combobox', { name: 'Rue et numéro (facultatif)' }).inputValue(), await amount(page, 'Prix de vente').inputValue()],
    ['Modifier l\'annonce', 'Étape 2 sur 7 · Informations principales', 'Enregistrer les modifications', 'Enregistrer', '8 rue Paul Bert', '238 000']);
    expectSame(N, 'largeur', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    await amount(page, 'Prix de vente').fill('230000');
    await page.getByRole('combobox', { name: 'Rue et numéro (facultatif)' }).fill('3 place Bellecour');
    await page.waitForSelector('.place-list:not([hidden]) [role="option"]');
    await page.keyboard.press('Escape');
    await shot(page, 'publier-modifier.png');
    let mark = state.calls.length;
    await page.click('.ppub-pill[aria-label="Enregistrer les modifications"]');
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
    await page.click('.ppub-pill[aria-label="Enregistrer les modifications"]');
    await page.waitForSelector('.dpub-success', { timeout: 15000 }).catch(() => problems.push(`${N} photos : confirmation absente`));
    const removed = writesSince(state, mark);
    expectSame(N, 'photo retirée', [writeNames(removed), removed.find((call) => call.table === 'storage')?.body, state.photos.map((photo) => photo.id)],
      [['PATCH listings', 'POST listing_locations', 'DELETE listing_photos', 'DELETE storage'], { prefixes: [ONLINE_PHOTOS[1].storage_path] }, [ONLINE_PHOTOS[0].id]]);
    await page.close();
    // L'annonce d'une autre personne, une annonce inconnue, une adresse mal formée : « Annonce introuvable », rien n'est
    // écrit. L'écran du téléphone dans la colonne : retour rond de 42, titre de 22, la carte sur les 688 px.
    mark = state.calls.length;
    for (const id of [OTHER_ID, UNKNOWN_ID, 'pas-un-identifiant']) {
      page = await open(context, `/publier/?annonce=${id}`, `${N} ${id}`);
      await page.waitForSelector('.dpub .dsc-empty');
      expectSame(`${N} ${id}`, 'introuvable', [(await head(page))[0], await textOf(page, '.dsc-empty p'), await page.getAttribute('.dsc-empty a', 'href')],
        ['Annonce introuvable', 'Cette annonce n\'existe plus ou n\'est pas l\'une des vôtres.', '/compte/?vue=annonces']);
      expectSame(`${N} ${id}`, 'écran du téléphone', await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
        return [Math.round(rect('.dpub .dsc-back').width), getComputedStyle(document.querySelector('.dpub .dsc-titles h1')).fontSize, Math.round(rect('.dpub .dsc-empty').left),
          Math.round(rect('.dpub .dsc-empty').width)];
      }), [42, '22px', 168, 688]);
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
    await page.click('.ppub-pill[aria-label="Enregistrer les modifications"]');
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

  // 7. Étapes : revenir librement et être guidé vers ce qui manque, sur ordinateur, sur tablette (iPad en paysage, et
  //    iPad Pro 12,9" en portrait : 1024 px) et sur téléphone. La flèche, « Retour », la barre d'étapes et le retour du
  //    navigateur ramènent en arrière sans rien demander ; « Continuer » et « Publier » mènent au premier champ à
  //    compléter, même dans une étape précédente (sous l'en-tête collé), et le prénom n'est demandé qu'une fois
  //    l'annonce complète.
  const tablet = (width, height) => browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: devices['iPad Pro 11'].userAgent, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  for (const [N, makeContext, touch, file] of [
    ['étapes ordinateur', () => desktop(), false, 'etapes-ordinateur'],
    ['étapes tablette paysage', () => tablet(1194, 834), true, 'etapes-tablette-paysage'],
    ['étapes tablette portrait', () => tablet(1024, 1366), true, 'etapes-tablette-portrait'],
    ['étapes téléphone', () => phone(), true, 'etapes-telephone'],
  ]) {
    const state = newState({ firstName: '' });
    const context = await makeContext();
    await mock(context, state);
    const page = await open(context, '/publier/', N);
    await page.waitForSelector('.dpub .dpub-category-grid');
    const subtitle = async () => (await head(page))[1];
    const bar = (n) => page.locator(`.dpub-progress button[aria-label^="Étape ${n} sur 7,"]`);
    const barState = () => page.$$eval('.dpub-progress > *', (els) => els.map((el) => (el.tagName !== 'BUTTON' ? 'à venir' : el.classList.contains('is-current') ? 'en cours' : 'atteinte')));
    const dialogs = () => page.locator('dialog.alert-dialog[open]').count();
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const historyBack = async () => { await page.evaluate(() => history.back()); await page.waitForTimeout(400); };
    /** Fin du défilement (doux, sauf mouvements réduits) : la position ne bouge plus. */
    const settle = async () => {
      let last = -1;
      for (let i = 0; i < 40; i += 1) {
        const y = await page.evaluate(() => Math.round(window.scrollY));
        if (y === last) return;
        last = y;
        await page.waitForTimeout(150);
      }
    };
    /**
     * Champ guidé : entièrement visible entre le bas de l'en-tête collé et la barre d'actions ; le curseur dedans
     * seulement avec une souris.
     */
    const guidedTo = async (field, what, { focus = true } = {}) => {
      await settle();
      const seen = await page.evaluate((guide) => {
        const anchor = document.querySelector(`.dpub [data-guide="${guide}"]`);
        if (!anchor) return { found: false };
        const rect = anchor.getBoundingClientRect();
        const barTop = document.querySelector('.dpub .dsc-action-bar')?.getBoundingClientRect().top ?? innerHeight;
        const headBottom = document.querySelector('.dpub .ppub-head')?.getBoundingClientRect().bottom ?? 0;
        const active = document.activeElement;
        return { found: true, visible: rect.top >= headBottom - 0.5 && rect.bottom <= barTop + 0.5, focused: active !== anchor && anchor.contains(active) };
      }, field);
      expectSame(N, what, focus ? seen : { found: seen.found, visible: seen.visible }, focus ? { found: true, visible: true, focused: !touch } : { found: true, visible: true });
    };
    const prompts = unloadPrompts.length;

    // Étapes 1 et 2 remplies, étape 3 ouverte.
    await categoryTile(page, 'Résidentiel').click();
    await page.getByRole('button', { name: 'Appartement', exact: true }).click();
    await page.click(CONTINUE);
    await waitStep(page, 2, 'Informations principales', N);
    expectSame(N, 'barre à l\'étape 2', await barState(), ['atteinte', 'en cours', 'à venir', 'à venir', 'à venir', 'à venir', 'à venir']);
    await page.getByRole('combobox', { name: 'Rue et numéro (facultatif)' }).fill('12 rue Mercière');
    await page.getByRole('option', { name: /12 Rue Mercière/ }).click();
    await page.waitForTimeout(700);
    await amount(page, 'Prix de vente').fill('320000');
    await page.click(CONTINUE);
    await waitStep(page, 3, 'Caractéristiques', N);
    // Ordinateur (à partir de 1024 px, tablettes comprises) : la barre d'étapes de la maquette 12 (zones de 25 px) et pas
    // de flèche en haut (« Retour », en bas, fait la même chose).
    const computer = await page.evaluate(() => matchMedia('(min-width: 1024px)').matches);
    const zone = computer ? 25 : 44;
    expectSame(N, `barre : zones de ${zone} px`, await page.$$eval('.dpub-progress > *', (els) => els.map((el) => Math.round(el.getBoundingClientRect().height))), Array(7).fill(zone));

    // La flèche du haut (sur ordinateur, cachée : « Retour ») : l'étape d'avant, sans question, saisie gardée.
    if (computer) {
      expectSame(N, 'flèche cachée', await page.locator('.ppub-back').isVisible(), false);
      await page.click('.dpub .dsc-action-buttons .dsc-button-light');
    } else {
      await page.click('.ppub-back');
    }
    await waitStep(page, 2, 'Informations principales', N);
    expectSame(N, computer ? 'Retour : étape 2' : 'flèche : étape 2', [await dialogs(), await amount(page, 'Prix de vente').inputValue(), await page.getByRole('combobox', { name: 'Ville' }).inputValue()], [0, '320 000', 'Lyon']);
    // La barre : toute étape déjà atteinte s'ouvre d'un clic, avant ou après celle en cours.
    await bar(3).click();
    await waitStep(page, 3, 'Caractéristiques', N);
    await bar(1).click();
    await waitStep(page, 1, 'Catégorie', N);
    expectSame(N, 'barre : étape 1', [await barState(), await textOf(page, '.dpub-category-tile[aria-pressed="true"] .dpub-category-title'), await dialogs()],
      [['en cours', 'atteinte', 'atteinte', 'à venir', 'à venir', 'à venir', 'à venir'], 'Résidentiel', 0]);
    await bar(3).click();
    await waitStep(page, 3, 'Caractéristiques', N);
    // « Retour » dans la barre d'actions : l'étape d'avant.
    await page.click('.dpub .dsc-action-buttons .dsc-button-light');
    await waitStep(page, 2, 'Informations principales', N);
    await bar(3).click();
    await waitStep(page, 3, 'Caractéristiques', N);

    // Le retour du navigateur : l'étape d'avant, sans « Quitter la page ? » ; à l'étape 1 avec une saisie, la question
    // de l'app, qu'un nouveau retour referme.
    await historyBack();
    await waitStep(page, 2, 'Informations principales', N);
    await historyBack();
    await waitStep(page, 1, 'Catégorie', N);
    expectSame(N, 'retour du navigateur', [await dialogs(), new URL(page.url()).pathname], [0, '/publier/']);
    await historyBack();
    await page.waitForSelector('dialog.alert-dialog[open]', { timeout: 5000 }).catch(() => problems.push(`${N} : pas de question au retour depuis l'étape 1`));
    expectSame(N, 'retour à l\'étape 1', [await textOf(page, 'dialog[open] h2'), new URL(page.url()).pathname], ['Quitter la publication ?', '/publier/']);
    await historyBack();
    await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached', timeout: 5000 }).catch(() => problems.push(`${N} : la question reste ouverte après un retour`));
    expectSame(N, 'question refermée', [await subtitle(), new URL(page.url()).pathname], ['Étape 1 sur 7 · Catégorie', '/publier/']);
    if (unloadPrompts.length !== prompts) problems.push(`${N} : « Quitter la page ? » du navigateur pendant les retours`);

    // « Continuer » sur une étape incomplète : ses champs signalés, l'écran amené sur le premier.
    await page.click(CONTINUE);
    await waitStep(page, 2, 'Informations principales', N);
    await page.click(CONTINUE);
    await waitStep(page, 3, 'Caractéristiques', N);
    await page.click(CONTINUE);
    await page.waitForSelector('.dpub .field-error');
    expectSame(N, 'étape 3 signalée', [await subtitle(), await errorsOf(page)],
      ['Étape 3 sur 7 · Caractéristiques', ['Indiquez la surface.', 'Indiquez le nombre de pièces.', 'Le DPE est obligatoire pour ce type de bien.']]);
    await guidedTo('livingArea', 'guidé vers la surface');
    await page.screenshot({ path: join(out, `${file}-guidage.png`) });
    // Chaque message disparaît dès que son champ est rempli.
    await amount(page, 'Surface habitable').fill('62');
    expectSame(N, 'surface remplie', await errorsOf(page), ['Indiquez le nombre de pièces.', 'Le DPE est obligatoire pour ce type de bien.']);
    await chip(page, 'Pièces', '3').click();
    await page.getByRole('button', { name: 'DPE (classe énergie) C', exact: true }).click();
    // Logement avec une classe DPE : le GES et les deux dépenses d'énergie deviennent obligatoires, signalés sous leurs
    // champs (n° 84).
    const ENERGY_COSTS = 'Les dépenses d\'énergie minimum et maximum sont obligatoires pour ce logement.';
    expectSame(N, 'DPE choisi', await errorsOf(page), ['Le GES est obligatoire pour ce logement.', ENERGY_COSTS]);
    await page.getByRole('button', { name: 'GES (classe climat) B', exact: true }).click();
    await amount(page, 'Dépenses d\'énergie minimum').fill('820');
    expectSame(N, 'GES et une dépense', await errorsOf(page), [ENERGY_COSTS]);
    await amount(page, 'Dépenses d\'énergie maximum').fill('1150');
    expectSame(N, 'étape 3 complète', await errorsOf(page), []);

    // Un champ vidé dans une étape précédente : « Continuer » y ramène.
    await bar(2).click();
    await waitStep(page, 2, 'Informations principales', N);
    await amount(page, 'Prix de vente').fill('');
    await bar(3).click();
    await waitStep(page, 3, 'Caractéristiques', N);
    await page.click(CONTINUE);
    await waitStep(page, 2, 'Informations principales', N);
    expectSame(N, 'ramené au prix', await errorsOf(page), ['Indiquez le prix.']);
    await guidedTo('price', 'guidé vers le prix');
    await amount(page, 'Prix de vente').fill('320000');
    expectSame(N, 'prix rempli', await errorsOf(page), []);
    await page.click(CONTINUE);
    await waitStep(page, 3, 'Caractéristiques', N);
    await page.click(CONTINUE);
    await waitStep(page, 4, 'Prix et finances', N);
    await page.click(CONTINUE);
    await waitStep(page, 5, 'Photos', N);
    await page.click(CONTINUE);
    expectSame(N, 'photos signalées', await errorsOf(page), ['Ajoutez au moins une photo.']);
    await guidedTo('photos', 'guidé vers les photos', { focus: false });
    await page.setInputFiles('.dpub input[type="file"]', [{ name: 'IMG_0002.jpg', mimeType: 'image/jpeg', buffer: PHOTO }]);
    await imagesLoaded(page, '.dpub-photo img', 1, `${N} : photo choisie`);
    expectSame(N, 'photo ajoutée', await errorsOf(page), []);
    await page.click(CONTINUE);
    await waitStep(page, 6, 'Description et aperçu', N);
    await page.click(CONTINUE);
    await page.waitForSelector('.dpub .field-error');
    expectSame(N, 'étape 6 signalée', [await subtitle(), (await errorsOf(page)).length], ['Étape 6 sur 7 · Description et aperçu', 2]);
    await guidedTo('title', 'guidé vers le titre');
    await page.getByRole('button', { name: 'Proposer : « Appartement 3 pièces – Lyon »' }).click();
    await page.getByRole('button', { name: 'Rédiger à partir de mes informations' }).click();
    expectSame(N, 'étape 6 complète', await errorsOf(page), []);
    await page.click(CONTINUE);
    await waitStep(page, 7, 'Vérification', N);
    const publishButton = page.locator(CONTINUE);
    const dimmed = async () => [await publishButton.evaluate((el) => el.classList.contains('is-dimmed')), await publishButton.isDisabled()];
    expectSame(N, 'Publier prêt', [await barState(), await dimmed(), await overflow()],
      [['atteinte', 'atteinte', 'atteinte', 'atteinte', 'atteinte', 'atteinte', 'en cours'], [false, false], 0]);

    // Un champ vidé puis « Publier » atténué : un clic mène au champ, sans demander le prénom ni rien envoyer.
    await bar(3).click();
    await waitStep(page, 3, 'Caractéristiques', N);
    await amount(page, 'Surface habitable').fill('');
    await bar(7).click();
    await waitStep(page, 7, 'Vérification', N);
    expectSame(N, 'Publier atténué', await dimmed(), [true, false]);
    await page.screenshot({ path: join(out, `${file}-publier-attenue.png`) });
    let mark = state.calls.length;
    await publishButton.click();
    await waitStep(page, 3, 'Caractéristiques', N);
    expectSame(N, 'Publier mène à la surface', [await errorsOf(page), await dialogs(), writeNames(writesSince(state, mark))], [['Indiquez la surface.'], 0, []]);
    await guidedTo('livingArea', 'guidé vers la surface depuis Publier');
    await amount(page, 'Surface habitable').fill('62');
    await bar(7).click();
    await waitStep(page, 7, 'Vérification', N);
    expectSame(N, 'Publier à nouveau prêt', await dimmed(), [false, false]);
    // Le GES retiré : aucun champ de la liste ne manque, mais « Publier » refuse encore l'étape 3. La carte le dit
    // (« Caractéristiques : à compléter », jamais « Prête à publier ») et « Corriger » mène au GES (n° 81).
    const firstCard = () => textOf(page, '.dpub .dpub-step .dsc-card-title');
    await bar(3).click();
    await waitStep(page, 3, 'Caractéristiques', N);
    await page.getByRole('button', { name: 'GES (classe climat) B', exact: true }).click();
    await bar(7).click();
    await waitStep(page, 7, 'Vérification', N);
    expectSame(N, 'étape à compléter', [await firstCard(), await page.$$eval('.dpub-missing li', (els) => els.map((el) => [...el.children].map((child) => child.textContent))),
      await dimmed()], ['À compléter', [['Caractéristiques : à compléter', 'Corriger']], [true, false]]);
    mark = state.calls.length;
    const fix = page.locator('.dpub-missing li button');
    // Sans « Corriger » (déjà signalé ci-dessus), la suite passe par la barre d'étapes.
    await ((await fix.count()) > 0 ? fix.first() : bar(3)).click();
    await waitStep(page, 3, 'Caractéristiques', N);
    expectSame(N, 'Corriger mène au GES', [await errorsOf(page), writeNames(writesSince(state, mark))], [['Le GES est obligatoire pour ce logement.'], []]);
    await guidedTo('climateClass', 'guidé vers le GES');
    await page.getByRole('button', { name: 'GES (classe climat) B', exact: true }).click();
    await bar(7).click();
    await waitStep(page, 7, 'Vérification', N);
    expectSame(N, 'à nouveau prête', [await firstCard(), await dimmed()], ['Prête à publier', [false, false]]);
    // Annonce complète : maintenant seulement, le prénom est demandé (compte sans prénom) ; « Annuler » n'envoie rien.
    mark = state.calls.length;
    await publishButton.click();
    await page.waitForSelector('dialog.alert-dialog[open] input[aria-label="Prénom"]', { timeout: 5000 }).catch(() => problems.push(`${N} : prénom non demandé`));
    await page.click('dialog[open] button:text("Annuler")');
    await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached' }).catch(() => undefined);
    expectSame(N, 'prénom annulé', [await subtitle(), writeNames(writesSince(state, mark)), await overflow()], ['Étape 7 sur 7 · Vérification', [], 0]);

    // « Fermer » : la question, puisque la saisie n'est pas enregistrée ; « Continuer » reste sur la page.
    await page.click('.dpub-close');
    await page.waitForSelector('dialog.alert-dialog[open]');
    expectSame(N, 'fermer', await textOf(page, 'dialog[open] h2'), 'Quitter la publication ?');
    await page.click('dialog[open] button:text("Continuer")');
    await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached' }).catch(() => undefined);
    expectSame(N, 'rien envoyé', writeNames(writesSince(state, 0)), []);
    if (unloadPrompts.length !== prompts) problems.push(`${N} : « Quitter la page ? » du navigateur inattendu`);
    await context.close();
  }

  // 8. Étape 1 comme l'app (PublishFlowView.categoryStep), à 1440 et 1024 px, dans la mise en page de la maquette 12 :
  //    « Que souhaitez-vous publier ? » de 34 sans carte autour, les quatre catégories sur une ligne (cartes de 137 px,
  //    14 px d'écart, l'icône et le titre sans sous-titre, le titre pour nom), la catégorie choisie bordée de 2 px à sa couleur avec sa pastille cochée ; « Type de bien »
  //    (« Type d'actif ») en tuiles de 64 px, trois par ligne, avec les icônes de l'app ; Hôtels : le texte
  //    d'information, sans types. Puis le glissement d'une étape à l'autre :
  //    l'étape arrive par la droite en avançant (par la gauche en revenant) pendant que la copie de l'étape quittée part
  //    de l'autre côté, sans débordement de la page ; un double clic sur « Continuer » n'avance que d'une étape ; avec
  //    « Réduire les animations », un fondu seul.
  for (const width of [1440, 1024]) {
    const N = `étape 1 à ${width} px`;
    const state = newState();
    const context = await desktop(width, 900);
    await mock(context, state);
    const page = await open(context, '/publier/', N);
    await page.waitForSelector('.dpub .dpub-category-grid');
    expectSame(N, 'titre et cartes', [await textOf(page, '.dpub-category-head h2'), await textOf(page, '.dpub-category-head p'),
      await page.getByRole('heading', { name: 'Que souhaitez-vous publier ?', exact: true }).count(),
      await page.$$eval('.dpub-category-tile', (els) => els.map((el) => [el.getAttribute('aria-label'), el.textContent, el.getAttribute('aria-pressed')])),
      await page.locator('.dpub .dsc-card').count(), await page.locator('.dpub-types').count()],
    ['Que souhaitez-vous publier ?', 'Choisissez la catégorie, puis le type de bien.', 1,
      [['Résidentiel', 'Résidentiel', 'false'], ['Location', 'Location', 'false'], ['Investissement', 'Investissement', 'false'], ['Hôtels', 'Hôtels', 'false']],
      0, 0]);
    /** Libellés et premiers traits des icônes des types proposés, ou le texte d'information (Hôtels). */
    const types = () => page.evaluate(() => {
      const section = document.querySelector('.dpub-types');
      const info = document.querySelector('.dpub-category-info');
      if (!section) return { info: info?.textContent ?? null };
      return {
        title: section.querySelector('.dpub-types-title').textContent,
        group: section.querySelector('[role="group"]').getAttribute('aria-labelledby') === section.querySelector('.dpub-types-title').id,
        tiles: [...section.querySelectorAll('.dpub-type-tile')].map((el) => [el.getAttribute('aria-label') ?? el.textContent, el.querySelector('svg :first-child').getAttribute('d')?.slice(0, 9) ?? 'rect']),
      };
    });
    const HOUSE = 'M15 21v-8';
    const FLAT = 'M10 12h4';
    const LAND = 'M10 10v.2';
    const SHOP = 'M15 21v-5';
    const OFFICE = 'M12 12h.0';
    await categoryTile(page, 'Investissement').click();
    expectSame(N, 'Investissement', await types(), {
      title: 'Type d\'actif', group: true,
      tiles: [['Appartement loué', FLAT], ['Maison locative', HOUSE], ['Immeuble de rapport', 'M12 10h.0'], ['Immeuble mixte, logements et commerces', 'M12.83 2.'],
        ['Local commercial', SHOP], ['Bureaux', OFFICE]],
    });
    // Un type manque : « Continuer » le signale sous les tuiles et y amène.
    await page.click(CONTINUE);
    await page.waitForSelector('.dpub-types .field-error');
    expectSame(N, 'type manquant', [await errorsOf(page), (await head(page))[1]], [['Choisissez le type de bien.'], 'Étape 1 sur 7 · Catégorie']);
    await page.getByRole('button', { name: 'Immeuble mixte, logements et commerces', exact: true }).click();
    expectSame(N, 'immeuble mixte choisi', [await errorsOf(page), await textOf(page, '.dpub-type-tile[aria-pressed="true"] .dpub-type-detail')], [[], 'logements et commerces']);
    await categoryTile(page, 'Location').click();
    expectSame(N, 'Location', await types(), {
      title: 'Type de bien', group: true,
      tiles: [['Appartement', FLAT], ['Maison', HOUSE], ['Parking ou box', 'rect'], ['Terrain', LAND], ['Local commercial', SHOP], ['Bureaux', OFFICE]],
    });
    await categoryTile(page, 'Hôtels').click();
    expectSame(N, 'Hôtels', await types(), { info: 'Hôtel à vendre : murs et fonds, murs seuls ou fonds seul, à préciser à l\'étape « Caractéristiques ».' });
    await categoryTile(page, 'Résidentiel').click();
    expectSame(N, 'Résidentiel', await types(), { title: 'Type de bien', group: true, tiles: [['Appartement', FLAT], ['Maison', HOUSE], ['Terrain', LAND]] });
    await page.getByRole('button', { name: 'Appartement', exact: true }).click();
    await page.waitForTimeout(700);
    const look = await page.evaluate(() => {
      const rect = (el) => el.getBoundingClientRect();
      const tiles = [...document.querySelectorAll('.dpub-category-tile')];
      const chosen = document.querySelector('.dpub-category-tile[aria-pressed="true"]');
      const other = document.querySelector('.dpub-category-tile:not([aria-pressed="true"])');
      const type = document.querySelector('.dpub-type-tile[aria-pressed="true"]');
      const typeTiles = [...document.querySelectorAll('.dpub-type-tile')];
      const label = document.querySelector('.dpub-types-title');
      const heading = document.querySelector('.dpub-category-head h2');
      return {
        title: [getComputedStyle(heading).fontSize, getComputedStyle(heading).fontWeight],
        tiles: tiles.map((el) => [Math.round(rect(el).width), Math.round(rect(el).height), getComputedStyle(el).borderRadius]),
        gaps: [Math.round(rect(tiles[1]).left - rect(tiles[0]).right), Math.round(rect(tiles[3]).top - rect(tiles[0]).top),
          Math.round(rect(typeTiles[1]).left - rect(typeTiles[0]).right)],
        chosen: [getComputedStyle(chosen, '::before').boxShadow, getComputedStyle(chosen).boxShadow, getComputedStyle(chosen.querySelector('.dpub-category-check')).opacity],
        other: [getComputedStyle(other, '::before').boxShadow, getComputedStyle(other.querySelector('.dpub-category-check')).opacity],
        icon: [getComputedStyle(chosen.querySelector('.dpub-category-icon')).backgroundColor, getComputedStyle(chosen.querySelector('.dpub-category-icon')).color],
        types: typeTiles.map((el) => [Math.round(rect(el).height), getComputedStyle(el).borderRadius]),
        label: [label.textContent, getComputedStyle(label).textTransform, getComputedStyle(label).fontSize, getComputedStyle(label).color],
        type: [getComputedStyle(type).backgroundColor, getComputedStyle(type, '::before').boxShadow, getComputedStyle(type.querySelector('.dpub-type-icon')).backgroundColor,
          getComputedStyle(type.querySelector('.dpub-type-title')).color],
      };
    });
    // Quatre cartes sur une ligne et 14 px d'écart dans les 896 px de l'étape, aux mêmes largeurs à 1440 et 1024 px.
    expectSame(N, 'cartes et tuiles', look, {
      title: ['34px', '800'],
      tiles: [[214, 137, '20px'], [214, 137, '20px'], [214, 137, '20px'], [214, 137, '20px']],
      gaps: [14, 0, 14],
      chosen: ['rgb(60, 92, 176) 0px 0px 0px 2px inset', 'rgba(60, 92, 176, 0.14) 0px 10px 26px 0px', '1'],
      other: ['rgb(236, 234, 230) 0px 0px 0px 1px inset', '0'],
      icon: ['rgb(238, 242, 250)', 'rgb(60, 92, 176)'],
      types: [[64, '16px'], [64, '16px'], [64, '16px']],
      label: ['Type de bien', 'uppercase', '13px', 'rgb(91, 101, 113)'],
      type: ['color(srgb 0.969412 0.974431 0.987608)', 'rgb(60, 92, 176) 0px 0px 0px 2px inset', 'rgb(255, 255, 255)', 'rgb(47, 74, 146)'],
    });
    await shot(page, `publier-categorie-${width}.png`);
    if (width !== 1440) {
      await context.close();
      continue;
    }

    // Le glissement vers l'étape 2 : pris juste après le clic, pendant le mouvement, coupé aux bords de l'étape (960 px,
    // ses marges comprises).
    const motion = () => page.evaluate(() => {
      const steps = document.querySelector('.dpub-steps');
      const box = document.querySelector('.dpub-step');
      const exit = document.querySelector('.dpub-step-exit');
      const copy = exit.firstElementChild;
      return {
        sliding: steps.classList.contains('is-sliding'),
        box: box.className,
        copy: copy ? [copy.className, copy.querySelector('h2, .dsc-card-title')?.textContent ?? null, copy.querySelectorAll('[id], [data-guide], [name]').length] : null,
        exit: [exit.getAttribute('aria-hidden'), exit.inert, getComputedStyle(exit).position],
        clip: [getComputedStyle(steps).overflowX, Math.round(steps.getBoundingClientRect().left), Math.round(steps.getBoundingClientRect().width)],
        animations: [getComputedStyle(box).animationName, copy ? getComputedStyle(copy).animationName : null,
          getComputedStyle(document.querySelector('.ppub-titles p')).animationName],
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    await page.click(CONTINUE);
    expectSame(N, 'glissement en avançant', await motion(), {
      sliding: true, box: 'dpub-step is-entering is-forward', copy: ['dpub-step-copy is-forward', 'Que souhaitez-vous publier ?', 0],
      exit: ['true', true, 'fixed'], clip: ['clip', 240, 960], animations: ['ppub-step-from-right', 'ppub-step-to-left', 'app-fade-in'], overflow: 0,
    });
    await waitStep(page, 2, 'Informations principales', N);
    expectSame(N, 'après le glissement', [await page.locator('.dpub-step').getAttribute('class'), await page.locator('.dpub-step-exit > *').count(),
      await page.locator('.dpub-steps').getAttribute('class')], ['dpub-step', 0, 'dpub-steps']);
    await page.click('.dpub .dsc-action-buttons .dsc-button-light');
    expectSame(N, 'glissement en revenant', await motion(), {
      sliding: true, box: 'dpub-step is-entering is-back', copy: ['dpub-step-copy is-back', 'Adresse du bien', 0],
      exit: ['true', true, 'fixed'], clip: ['clip', 240, 960], animations: ['ppub-step-from-left', 'ppub-step-to-right', 'app-fade-in'], overflow: 0,
    });
    await waitStep(page, 1, 'Catégorie', N);
    // Deux clics rapides : une seule étape (le second attend la fin du changement, sans vérifier l'étape 2).
    await page.dblclick(CONTINUE);
    await waitStep(page, 2, 'Informations principales', N);
    await page.waitForTimeout(300);
    expectSame(N, 'double clic', [(await head(page))[1], await errorsOf(page)], ['Étape 2 sur 7 · Informations principales', []]);
    await context.close();

    // « Réduire les animations » : l'étape apparaît en fondu, la copie de l'étape quittée s'efface sur place.
    const reduced = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: 'reduce' });
    await mock(reduced, newState());
    const calm = await open(reduced, '/publier/', `${N} réduit`);
    await calm.waitForSelector('.dpub .dpub-category-grid');
    await categoryTile(calm, 'Résidentiel').click();
    await calm.getByRole('button', { name: 'Appartement', exact: true }).click();
    await calm.click(CONTINUE);
    expectSame(`${N} réduit`, 'fondu seul', await calm.evaluate(() => {
      const box = document.querySelector('.dpub-step');
      const copy = document.querySelector('.dpub-step-exit > *');
      return [getComputedStyle(box).animationName, getComputedStyle(box).animationDuration, copy ? getComputedStyle(copy).animationName : null,
        getComputedStyle(document.querySelector('.dpub-category-check')).transform];
    }), ['app-fade-in', '0.25s', 'app-fade-out', 'none']);
    await waitStep(calm, 2, 'Informations principales', `${N} réduit`);
    await reduced.close();
  }

  // 9. « Disponibilité » d'une location (RentalAvailabilityChoice), comme « Ameublement » : « Tout de suite » enregistre
  //    la date du jour, au début du jour comme l'app (les cartes disent « Disponible de suite » dès le matin) ;
  //    « À partir du… » montre la date juste dessous (dans un mois par défaut) ; sans choix, rien n'est enregistré.
  //    Une annonce rouverte retrouve son choix : date du jour ou passée, « Tout de suite » ; date à venir, « À partir
  //    du… » avec sa date.
  {
    const N = 'disponibilité';
    const parisDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() + offset * 86400000));
    const later = parisDay(20);
    const state = newState({
      listings: [{ ...RENTAL, rental_info: { isLeased: false, isFurnished: true, availableFrom: `${later}T12:00:00.000Z` } }],
      photos: RENTAL_PHOTOS, locations: [RENTAL_LOCATION],
    });
    const context = await desktop();
    await mock(context, state);
    /** Annonce rouverte sur « Prix et finances » : [« Tout de suite », « À partir du… », date montrée]. */
    const reopen = async (what) => {
      const page = await open(context, `/publier/?annonce=${RENTAL_ID}`, `${N} ${what}`);
      await waitStep(page, 2, 'Informations principales', `${N} ${what}`);
      await page.locator('.dpub-progress button[aria-label^="Étape 4 sur 7,"]').click();
      await waitStep(page, 4, 'Prix et finances', `${N} ${what}`);
      return page;
    };
    const choice = async (page) => [await chip(page, 'Disponibilité', 'Tout de suite').getAttribute('aria-pressed'),
      await chip(page, 'Disponibilité', 'À partir du…').getAttribute('aria-pressed'),
      (await page.getByLabel('Disponible à partir du', { exact: true }).count()) ? await page.getByLabel('Disponible à partir du', { exact: true }).inputValue() : null];
    /** « Enregistrer les modifications », puis l'information locative envoyée. */
    const save = async (page) => {
      const mark = state.calls.length;
      await page.click('.ppub-pill[aria-label="Enregistrer les modifications"]');
      await page.waitForSelector('.dpub-success', { timeout: 15000 }).catch(() => problems.push(`${N} : confirmation absente`));
      const sent = writesSince(state, mark).find((call) => call.table === 'listings' && call.method === 'PATCH')?.body?.rental_info;
      await page.close();
      return sent;
    };

    let page = await reopen('date à venir');
    expectSame(N, 'date à venir', await choice(page), ['false', 'true', later]);
    const card = page.locator('.dpub .dsc-card').filter({ has: page.getByRole('heading', { name: 'Conditions de location', exact: true }) });
    expectSame(N, 'place dans la carte', await card.locator('.field-label, label').allTextContents(),
      ['Ameublement', 'Disponibilité', 'Disponible à partir du', 'Durée du bail']);
    await card.scrollIntoViewIfNeeded();
    await shot(page, 'publier-disponibilite-a-partir-du.png');
    await chip(page, 'Disponibilité', 'Tout de suite').click();
    expectSame(N, 'Tout de suite', await choice(page), ['true', 'false', null]);
    const startOfToday = await page.evaluate(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(); });
    let sent = await save(page);
    expectSame(N, 'Tout de suite enregistré', [sent?.availableFrom, new Date(sent?.availableFrom) <= new Date(), sent?.isFurnished], [startOfToday, true, true]);

    page = await reopen('tout de suite');
    expectSame(N, 'Tout de suite retrouvé', await choice(page), ['true', 'false', null]);
    // Retoucher le choix l'enlève : la disponibilité n'est plus précisée, et l'annonce s'enregistre quand même.
    await chip(page, 'Disponibilité', 'Tout de suite').click();
    expectSame(N, 'sans choix', await choice(page), ['false', 'false', null]);
    sent = await save(page);
    expectSame(N, 'sans choix enregistré', [sent && 'availableFrom' in sent, sent?.isFurnished], [false, true]);

    page = await reopen('sans choix');
    expectSame(N, 'sans choix retrouvé', await choice(page), ['false', 'false', null]);
    await chip(page, 'Disponibilité', 'À partir du…').click();
    const inOneMonth = await page.evaluate(() => {
      const now = new Date();
      const last = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
      const d = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(now.getDate(), last));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    expectSame(N, 'À partir du… : dans un mois', [...await choice(page), await page.getByLabel('Disponible à partir du', { exact: true }).getAttribute('min')],
      ['false', 'true', inOneMonth, parisDay()]);
    const chosenDay = parisDay(40);
    await page.getByLabel('Disponible à partir du', { exact: true }).fill(chosenDay);
    expectSame(N, 'date choisie', await choice(page), ['false', 'true', chosenDay]);
    sent = await save(page);
    expectSame(N, 'date enregistrée', sent?.availableFrom, `${chosenDay}T12:00:00.000Z`);

    page = await reopen('date choisie');
    expectSame(N, 'date retrouvée', await choice(page), ['false', 'true', chosenDay]);
    // « À partir du… » choisi avec la date du jour le reste d'une étape à l'autre, tant que la publication est ouverte
    // (n° 206).
    await page.getByLabel('Disponible à partir du', { exact: true }).fill(parisDay());
    expectSame(N, 'date du jour choisie', await choice(page), ['false', 'true', parisDay()]);
    await page.locator('.dpub-progress button[aria-label^="Étape 3 sur 7,"]').click();
    await waitStep(page, 3, 'Caractéristiques', N);
    await page.locator('.dpub-progress button[aria-label^="Étape 4 sur 7,"]').click();
    await waitStep(page, 4, 'Prix et finances', N);
    expectSame(N, 'date du jour gardée', await choice(page), ['false', 'true', parisDay()]);
    await page.close();
    // Date passée : « Tout de suite ».
    state.listings[0].rental_info = { ...state.listings[0].rental_info, availableFrom: '2026-10-01T12:00:00.000Z' };
    page = await reopen('date passée');
    expectSame(N, 'date passée', await choice(page), ['true', 'false', null]);
    await page.close();
    await context.close();
  }

  // 10. Hôtel en ligne, murs seuls : le loyer annuel de l'exploitant se relit tel quel (100 000 €, pas 99 999,96 €,
  //     n° 82) ; le titre proposé est au singulier (« Hôtel 1 chambre », n° 188). Sans réseau, « Enregistrer » le dit
  //     avec les mots de l'app ; une relecture qui échoue encore après un second essai laisse la réussite (n° 80).
  {
    const N = 'hôtel';
    const state = newState({ listings: [HOTEL], photos: HOTEL_PHOTOS, locations: [HOTEL_LOCATION] });
    const context = await desktop();
    await mock(context, state);
    const page = await open(context, `/publier/?annonce=${HOTEL_ID}`, N);
    await waitStep(page, 2, 'Informations principales', N);
    const go = async (number, title) => {
      await page.locator(`.dpub-progress button[aria-label^="Étape ${number} sur 7,"]`).click();
      await waitStep(page, number, title, N);
    };
    await go(4, 'Prix et finances');
    const rent = () => amount(page, 'Loyer annuel payé par l\'exploitant');
    expectSame(N, 'loyer annuel relu', await rent().inputValue(), '100 000');
    await rent().fill('84000');
    await go(3, 'Caractéristiques');
    await go(4, 'Prix et finances');
    expectSame(N, 'loyer annuel gardé', await rent().inputValue(), '84 000');
    await go(6, 'Description et aperçu');
    await page.getByLabel('Titre de l\'annonce').fill('');
    expectSame(N, 'titre proposé', await textOf(page, '.dpub-propose'), 'Proposer : « Hôtel 1 chambre – Lyon 3e »');
    await page.click('.dpub-propose');
    const save = '.ppub-pill[aria-label="Enregistrer les modifications"]';
    // Sans réseau : rien n'est écrit, la vérification le dit sous le récapitulatif.
    state.offlineWrites = true;
    let mark = state.calls.length;
    await page.click(save);
    await waitStep(page, 7, 'Vérification', N);
    await page.waitForSelector('.dpub .dpub-step .dpub-error', { timeout: 15000 }).catch(() => problems.push(`${N} : message sans réseau absent`));
    expectSame(N, 'sans réseau', [await textOf(page, '.dpub .dpub-step .dpub-error'), await page.locator('dialog.alert-dialog[open]').count(),
      writeNames(writesSince(state, mark)), state.listings[0].title],
    ['Les modifications n\'ont pas pu être enregistrées. Vérifiez votre connexion, puis réessayez.', 0, ['PATCH listings'], 'Hôtel des Canuts']);
    state.offlineWrites = false;
    // Enregistrée, mais relue deux fois sans succès (le second essai 1,5 s après) : « Modifications enregistrées » quand même.
    state.failRereads = true;
    mark = state.calls.length;
    await page.click(save);
    await page.waitForSelector('.dpub-success', { timeout: 15000 }).catch(() => problems.push(`${N} : confirmation absente sans relecture`));
    const rereads = state.calls.slice(mark).filter((call) => call.table === 'listings' && call.method === 'GET' && /[?&]id=eq\./.test(call.search)
      && !call.search.startsWith('?select=id,status&'));
    expectSame(N, 'enregistrée sans relecture', [await textOf(page, '.dpub-success h1'), rereads.length, writeNames(writesSince(state, mark)),
      state.listings[0].title, state.listings[0].rental_info],
    ['Modifications enregistrées', 2, ['PATCH listings', 'POST listing_locations'], 'Hôtel 1 chambre – Lyon 3e', { currentMonthlyRent: 7000, isLeased: true }]);
    state.failRereads = false;
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
