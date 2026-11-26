// Vérification de la carte de Votre recherche (étape 5 de « nidalo.fr comme l'app ») dans Chromium, sans réseau :
// Supabase, la Géoplateforme et les tuiles sont simulés avec des données inventées.
// Zone dessinée (MapTabView de l'app) : le crayon sous les deux commandes ; tracé au doigt (téléphone) et à la souris
// (ordinateur), la carte immobile pendant le tracé ; tracé trop petit ; cercle et son rayon ; carte de validation (nombre
// de biens, − et +, « Voir les N biens ») ; zone posée dans l'adresse et pastille « Zone dessinée » ; menu du crayon,
// clavier compris ; « Ajuster la taille », « Redessiner », « Annuler » et Échap qui gardent la zone d'avant, « Effacer la
// zone » ; « Zone autour du centre de la carte » au clavier ; alerte sans compte (connexion) et avec un compte (« Créer
// une alerte », « Activer l'alerte », « Alerte active ») ; recherche enregistrée avec une zone (« Zone dessinée » dans la
// liste, rouverte avec sa zone).
// Champs de lieu : « Autour de moi » (position accordée : la commune de la Géoplateforme ; refusée : le message et
// « Réessayer »), recherches récentes de chaque compte, flèches du clavier, un lieu choisi qui remplace la zone.
// Confidentialité : la phrase de l'app sur la position (« Autour de moi ») et le cas du site, sur la page construite et
// dans src/content/confidentialite.html.
// Captures : carte-*.png, zone-*.png, lieu-*.png.
// Lancer après la construction : node scripts/check-carte.mjs [dossier construit, docs/ par défaut] [dossier des captures]
// « --avant » : seulement les captures des écrans qui existaient déjà (carte, champs de lieu), sur l'ancien site.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2).filter((arg) => arg !== '--avant');
const before = process.argv.includes('--avant');
const docs = resolve(args[0] ?? join(root, 'docs'));
const out = resolve(args[1] ?? join(root, 'scripts', 'captures'));
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

const SUPABASE = 'https://izzsoitqtzzswkpvdozd.supabase.co';
const USER_ID = 'a0000000-0000-4000-8000-0000000000c5';
const USER_EMAIL = 'claire.martin@exemple.fr';
const PROFILE = {
  id: USER_ID, display_name: 'Claire Martin', avatar_path: null, account_type: 'individual', professional_profile_id: null,
  created_at: '2026-10-01T08:00:00Z', shows_full_name: false, findable_by_phone: false,
};
const fixture = JSON.parse(await readFile(join(root, 'scripts', 'fixtures', 'listings.json'), 'utf8'));
const photo = await readFile(join(root, 'scripts', 'fixtures', 'photo0.jpg'));
const tile = await readFile(join(root, 'scripts', 'fixtures', 'tile.png'));
const flat = (n, over) => ({ ...fixture[0], id: `6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1b0${n}`, ...over });
/** Six appartements à vendre autour de Lyon (Résidentiel), et une location qui n'y est jamais. */
const LISTINGS = [
  flat(1, { city: 'Lyon 3e', public_latitude: 45.7597, public_longitude: 4.8491, price: 238000 }),
  flat(2, { city: 'Lyon 6e', postal_code: '69006', insee_code: '69386', public_latitude: 45.769, public_longitude: 4.85, price: 312000, title: 'Appartement 4 pièces avec terrasse' }),
  flat(3, { city: 'Lyon 1er', postal_code: '69001', insee_code: '69381', public_latitude: 45.7675, public_longitude: 4.834, price: 275000, title: 'Appartement ancien sous les toits' }),
  flat(4, { city: 'Villeurbanne', postal_code: '69100', insee_code: '69266', public_latitude: 45.7665, public_longitude: 4.88, price: 199000, title: 'Appartement 2 pièces au calme' }),
  flat(5, { city: 'Caluire-et-Cuire', postal_code: '69300', insee_code: '69034', public_latitude: 45.796, public_longitude: 4.846, price: 345000, title: 'Appartement familial avec jardin' }),
  flat(6, { city: 'Vénissieux', postal_code: '69200', insee_code: '69259', public_latitude: 45.6975, public_longitude: 4.887, price: 168000, title: 'Appartement 3 pièces rénové' }),
  fixture[2],
];
const communes = [
  { nom: 'Lyon', code: '69123', codesPostaux: ['69001', '69002', '69003'], population: 520000, centre: { type: 'Point', coordinates: [4.835, 45.758] }, departement: { nom: 'Rhône' } },
];
/** Lieu récent gardé sans compte dans ce navigateur (même forme que le fichier de l'app). */
const RECENT_ANNECY = { id: '74010', kind: 'municipality', name: 'Annecy', postalCode: '74000', department: 'Haute-Savoie', coordinate: { latitude: 45.899, longitude: 6.129 } };
const RECENTS_KEY = 'nidalo.lieux-recents.';
/** Position simulée du navigateur (Lyon 2e). */
const POSITION = { latitude: 45.7612345, longitude: 4.8351234 };

// Zones : l'hexagone du centre de Lyon de scripts/fixtures/recherches-du-site.json (Lyon 3e, 6e et 1er dedans), une
// grande région (les six biens) et une zone sans bien (Grenoble).
const HEXAGON = [[45.77412, 4.82061], [45.7781, 4.84433], [45.76902, 4.86725], [45.75218, 4.86194], [45.74587, 4.83912], [45.75633, 4.8215]];
const REGION = [[46.4, 3.6], [46.3, 6.9], [44.6, 6.6], [44.7, 3.9]];
const EMPTY_ZONE = [[45.215, 5.68], [45.215, 5.78], [45.15, 5.78], [45.15, 5.68]];
const dessin = (zone) => zone.flat().join(',');
const savedFixtures = JSON.parse(await readFile(join(root, 'scripts', 'fixtures', 'recherches-du-site.json'), 'utf8'));
const ZONE_QUERY = savedFixtures.find((item) => item.query.drawnZone).query;
const ZONE_SEARCH = {
  id: 'b0000000-0000-4000-8000-000000000061', user_id: USER_ID, name: 'Centre de Lyon dessiné', query: ZONE_QUERY,
  alerts_enabled: true, created_at: '2026-11-12T18:00:00Z', last_notified_at: null, last_viewed_at: '2026-11-12T18:00:00Z',
};

// MARK: - Serveur simulé

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
const empty = (route, status = 204) => route.fulfill({ status, headers: cors, body: '' });
const problems = [];

function newState({ signedIn = false, saved = [] } = {}) {
  return { signedIn, saved: saved.map((row) => ({ ...row })), writes: [], reverse: [] };
}

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

function rest(state, route) {
  const request = route.request();
  const url = new URL(request.url());
  const table = url.pathname.replace('/rest/v1/', '');
  const method = request.method();
  if (method === 'OPTIONS') return empty(route, 200);
  const single = (request.headers().accept ?? '').includes('vnd.pgrst.object');
  let body = null;
  if (method !== 'GET' && method !== 'HEAD') {
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
    state.writes.push({ table, method, search: decodeURIComponent(url.search), body });
  }
  if (table === 'listings') {
    let rows = LISTINGS;
    const transaction = url.searchParams.get('transaction');
    if (transaction?.startsWith('eq.')) rows = rows.filter((row) => row.transaction === transaction.slice(3));
    const id = url.searchParams.get('id');
    if (id?.startsWith('eq.')) rows = rows.filter((row) => row.id === id.slice(3));
    return json(route, single ? rows[0] ?? null : rows);
  }
  if (state.signedIn && table === 'profiles' && method === 'GET') return json(route, single ? PROFILE : [PROFILE]);
  if (state.signedIn && table === 'saved_searches') {
    if (method === 'GET') return json(route, state.saved);
    if (method === 'POST') {
      const row = {
        id: `b0000000-0000-4000-8000-0000000001${String(state.saved.length).padStart(2, '0')}`, user_id: USER_ID,
        created_at: new Date().toISOString(), last_notified_at: null, last_viewed_at: null, ...body,
      };
      state.saved.push(row);
      return json(route, single ? row : [row], 201);
    }
    if (method === 'PATCH') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const row = state.saved.find((item) => item.id === id);
      if (row) Object.assign(row, body);
      return (request.headers().prefer ?? '').includes('return=representation') ? json(route, row ? [row] : []) : empty(route);
    }
  }
  if (method === 'GET' || table.startsWith('rpc/')) return json(route, []);
  return empty(route, method === 'POST' ? 201 : 204);
}

async function mock(context, state) {
  if (state.signedIn) {
    await context.addInitScript((value) => {
      try { localStorage.setItem('sb-izzsoitqtzzswkpvdozd-auth-token', value); } catch { /* stockage indisponible */ }
    }, JSON.stringify(fakeSession()));
  }
  await context.route(`${SUPABASE}/auth/v1/**`, (route) => {
    if (!state.signedIn) return json(route, { code: 'no_authorization', message: 'Pas de session' }, 401);
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/logout')) return empty(route);
    return json(route, path.endsWith('/user') ? fakeSession().user : fakeSession());
  });
  await context.route(`${SUPABASE}/rest/v1/**`, (route) => rest(state, route));
  await context.route(`${SUPABASE}/storage/**`, (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', headers: cors, body: photo }));
  await context.route('https://geo.api.gouv.fr/**', (route) => json(route, communes));
  await context.route('https://data.geopf.fr/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/wmts')) return route.fulfill({ status: 200, contentType: 'image/png', headers: cors, body: tile });
    if (url.pathname === '/geocodage/reverse') {
      // Géocodage inverse (« Autour de moi ») : une adresse inventée de Lyon 2e.
      state.reverse.push(Object.fromEntries(url.searchParams));
      return json(route, { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [4.8351, 45.7612] },
        properties: { label: '12 Rue de l\'Exemple 69002 Lyon', name: '12 Rue de l\'Exemple', type: 'housenumber', city: 'Lyon', postcode: '69002', citycode: '69382' } }] });
    }
    return json(route, { type: 'FeatureCollection', features: [] });
  });
  await context.route('https://tiles.openfreemap.org/**', (route) => empty(route));
}

const browser = await chromium.launch();
const PHONE = { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
const DESKTOP = { viewport: { width: 1440, height: 900 } };

/** Contexte simulé ; `geolocation` : position accordée au site. */
async function open(options, state, { geolocation = false, recents = null } = {}) {
  const context = await browser.newContext({ ...options, ...(geolocation ? { geolocation: POSITION, permissions: ['geolocation'] } : {}) });
  await mock(context, state);
  if (recents) {
    await context.addInitScript(([key, value]) => {
      try { if (!localStorage.getItem(key)) localStorage.setItem(key, value); } catch { /* stockage indisponible */ }
    }, [`${RECENTS_KEY}${recents.owner ?? 'sans-compte'}`, JSON.stringify({ items: recents.items })]);
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`erreur de la page : ${error.message}`));
  return { context, page };
}

// MARK: - Outils

const tidy = (text) => (text ?? '').replace(/[\s  ]+/g, ' ').trim();
function expectSame(name, what, actual, wanted) {
  const got = JSON.stringify(actual);
  const want = JSON.stringify(wanted);
  if (got !== want) problems.push(`${name} : ${what} ${got} au lieu de ${want}`);
}
function expectTrue(name, what, condition, detail = '') {
  if (!condition) problems.push(`${name} : ${what}${detail ? ` (${detail})` : ''}`);
}
const box = (page, selector) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
}, selector);
const texts = (page, selector) => page.$$eval(selector, (els) => els.map((el) => el.textContent.replace(/[\s  ]+/g, ' ').trim()));
const focused = (page) => page.evaluate(() => document.activeElement?.textContent.replace(/[\s  ]+/g, ' ').trim() || document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName);

/** Carte ouverte et prête, avec ses biens. */
async function mapReady(page, name, { markers = true } = {}) {
  await page.waitForSelector('.map-column.is-open .map-canvas[data-ready="oui"]', { timeout: 15000 })
    .catch(() => problems.push(`${name} : la carte ne s'affiche pas`));
  if (markers) {
    await page.waitForSelector('.map-column.is-open .map-marker, .map-column.is-open .map-cluster', { timeout: 15000 })
      .catch(() => problems.push(`${name} : aucun bien sur la carte`));
  }
  await page.waitForTimeout(400);
}

/** Biens montrés sur la carte : le pied de chaque vignette, le centre de chaque groupe, et combien de biens. */
const anchors = (page) => page.$$eval('.map-column .map-marker, .map-column .map-cluster', (els) => els.map((el) => {
  const r = el.getBoundingClientRect();
  const cluster = el.classList.contains('map-cluster');
  return { x: r.left + r.width / 2, y: cluster ? r.top + r.height / 2 : r.bottom - 6, count: cluster ? Number.parseInt(el.textContent, 10) || Number.parseInt(el.textContent.replace(/\D+/g, ' ').trim(), 10) : 1 };
}));
const shownCount = async (page) => (await anchors(page)).reduce((sum, a) => sum + a.count, 0);

function ellipse(cx, cy, rx, ry, steps = 36) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = (i / steps) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
}

/** Tracé au doigt (écran tactile simulé) ; `onPause` : appelé aux deux tiers du tracé, le doigt posé. */
async function touchStroke(page, points, onPause) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ x: point.x, y: point.y }] : [] });
  const pause = onPause ? Math.floor(points.length * 0.7) : points.length;
  await send('touchStart', points[0]);
  for (const point of points.slice(1, pause)) await send('touchMove', point);
  if (onPause) {
    await page.waitForTimeout(100);
    await onPause();
    for (const point of points.slice(pause)) await send('touchMove', point);
  }
  await send('touchEnd');
  await cdp.detach();
}

async function mouseStroke(page, points, onPause) {
  const pause = onPause ? Math.floor(points.length * 0.7) : points.length;
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const point of points.slice(1, pause)) await page.mouse.move(point.x, point.y);
  if (onPause) {
    await page.waitForTimeout(100);
    await onPause();
    for (const point of points.slice(pause)) await page.mouse.move(point.x, point.y);
  }
  await page.mouse.up();
}

/** Nombre de biens de la carte de validation, une fois le calcul fini. */
async function cardCount(page, name) {
  await page.waitForFunction(() => {
    const text = document.querySelector('.zone-card-count')?.textContent ?? '';
    return text && !text.includes('Recherche des biens');
  }, null, { timeout: 6000 }).catch(() => problems.push(`${name} : le nombre de biens de la zone n'arrive pas`));
  const text = tidy(await page.textContent('.zone-card-count').catch(() => ''));
  if (text === 'Aucun bien dans cette zone') return 0;
  const match = text.match(/^(\d+) biens? dans cette zone$/);
  if (!match) problems.push(`${name} : nombre de la carte de validation « ${text} »`);
  return match ? Number(match[1]) : null;
}
const commitLabel = (count) => (count === 0 ? 'Valider la zone' : count === 1 ? 'Voir le bien' : `Voir les ${count} biens`);

/** Validation : le nombre, le bouton qui va avec, et l'annonce aux lecteurs d'écran. */
async function expectCard(page, name) {
  const count = await cardCount(page, name);
  if (count === null) return null;
  expectSame(name, 'bouton de la carte de validation', tidy(await page.textContent('.zone-commit')), commitLabel(count));
  await page.waitForTimeout(100);
  expectSame(name, 'annonce du nombre', await texts(page, '.zone-card [aria-live] span'), [count === 0 ? 'Aucun bien dans cette zone' : `${count} bien${count > 1 ? 's' : ''} dans cette zone`]);
  return count;
}

function zoneOf(url) {
  const text = new URL(url).searchParams.get('dessin');
  if (!text) return null;
  const numbers = text.split(',').map(Number);
  const zone = [];
  for (let i = 0; i < numbers.length; i += 2) zone.push({ latitude: numbers[i], longitude: numbers[i + 1] });
  return zone;
}
/** Le même test que le site et l'app (DrawnZone.contains) : rayon horizontal, pair ou impair. */
function inside(point, zone) {
  let isInside = false;
  for (let i = 0, j = zone.length - 1; i < zone.length; j = i++) {
    const a = zone[i];
    const b = zone[j];
    if ((a.latitude > point.latitude) !== (b.latitude > point.latitude)) {
      const crossing = ((b.longitude - a.longitude) * (point.latitude - a.latitude)) / (b.latitude - a.latitude) + a.longitude;
      if (point.longitude < crossing) isInside = !isInside;
    }
  }
  return isInside;
}
const salesInside = (zone) => LISTINGS.filter((row) => row.transaction === 'sale'
  && inside({ latitude: row.public_latitude, longitude: row.public_longitude }, zone)).length;

/** Un endroit de la carte sans bien (pour un tracé qui ne commence pas sur une vignette). */
async function emptySpot(page, rx, ry, area) {
  const shown = await anchors(page);
  for (let y = area.top + ry + 10; y <= area.bottom - ry - 10; y += 20) {
    for (let x = area.left + rx + 10; x <= area.right - rx - 10; x += 20) {
      const clear = shown.every((a) => ((a.x - x) / (rx + 60)) ** 2 + ((a.y - y) / (ry + 70)) ** 2 > 1);
      if (clear) return { x, y };
    }
  }
  return null;
}

async function waitForUrl(page, test, name, what) {
  await page.waitForFunction(test, null, { timeout: 5000 }).catch(() => problems.push(`${name} : ${what} (${page.url()})`));
}
const hasZoneInUrl = () => new URLSearchParams(location.search).has('dessin');
const noZoneInUrl = () => !new URLSearchParams(location.search).has('dessin');

// MARK: - Téléphone : la carte et la zone dessinée

{
  const N = 'carte téléphone';
  const state = newState();
  const { context, page } = await open(PHONE, state);
  await page.goto(`${base}/recherche/?mode=buy&vue=carte`);
  await mapReady(page, N);
  await page.screenshot({ path: join(out, 'carte-telephone.png') });
  if (!before) {
    // Le crayon, troisième commande, sous « Vue plan » et « Recadrer » (48, 10 entre elles, 14 du bord).
    expectSame(N, 'commandes', await page.$$eval('.map-column .map-tools .map-round', (els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return [el.getAttribute('aria-label'), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    })), [['Vue plan', 328, 64, 48, 48], ['Recadrer sur les biens trouvés', 328, 122, 48, 48], ['Dessiner une zone', 328, 180, 48, 48]]);
    expectSame(N, 'surface du tracé hors du tracé', await page.locator('.map-draw').count(), 0);

    // Mode dessin : le bandeau à la place de la ligne du haut, l'outil en bas, le crayon bleu ; la mention des sources
    // 12 au-dessus de l'outil ; seule la surface du tracé bloque le défilement et le zoom de la page.
    await page.tap('.zone-pencil');
    await page.waitForSelector('.zone-banner');
    const banner = await box(page, '.zone-banner');
    const tools = await box(page, '.zone-tools');
    // La mention des sources quitte le haut du panneau du bas (0,36 s) pour se poser au-dessus de l'outil.
    await page.waitForTimeout(450);
    const attribution = await box(page, '.map-column .results-map-attribution');
    expectSame(N, 'tracé : bandeau, ligne du haut, outils', {
      banner, text: tidy(await page.textContent('.zone-banner-text')), cancel: tidy(await page.textContent('.zone-banner-cancel')),
      top: await page.locator('.map-app-top').count(),
      picker: await page.$$eval('.zone-tool', (els) => els.map((el) => [el.textContent.trim(), el.getAttribute('aria-pressed')])),
      pickerBox: [tools[1] + tools[3], tools[3], Math.round(tools[0] + tools[2] / 2)],
      pencil: await page.$eval('.zone-pencil', (el) => [el.getAttribute('aria-pressed'), el.classList.contains('is-active')]),
      tools: (await box(page, '.map-column .map-round'))[1],
      touchAction: await page.$eval('.map-draw', (el) => getComputedStyle(el).touchAction),
      attributionGap: tools[1] - (attribution[1] + attribution[3]),
    }, {
      banner: [14, 6, 362, 52], text: 'Tracez votre zone au doigt', cancel: 'Annuler', top: 0,
      picker: [['Tracé libre', 'true'], ['Cercle', 'false']], pickerBox: [832, 52, 195],
      pencil: ['true', true], tools: 68, touchAction: 'none', attributionGap: 12,
    });
    await page.screenshot({ path: join(out, 'zone-trace-telephone.png') });

    // Un trait droit n'est pas une zone : « Tracez une zone plus grande » pendant 2 s ; la carte n'a pas bougé.
    const shown = await anchors(page);
    const area = { left: 20, right: 310, top: 140, bottom: 760 };
    const spot = await emptySpot(page, 70, 10, area);
    await touchStroke(page, [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: spot.x - 70 + i * 23, y: spot.y })));
    await page.waitForTimeout(150);
    expectSame(N, 'trait droit', [tidy(await page.textContent('.zone-banner-text')), await page.locator('.zone-card').count(),
      JSON.stringify(await anchors(page)) === JSON.stringify(shown)], ['Tracez une zone plus grande', 0, true]);
    await page.waitForFunction(() => document.querySelector('.zone-banner-text')?.textContent === 'Tracez votre zone au doigt', null, { timeout: 4000 })
      .catch(() => problems.push(`${N} : « Tracez une zone plus grande » ne repart pas après 2 s`));

    // Tracé libre autour du premier bien (sur sa vignette, la surface du tracé est dessous : le trait commence à côté).
    const target = shown[0];
    const loop = ellipse(Math.min(Math.max(target.x, 100), 290), Math.min(Math.max(target.y, 230), 640), 85, 75);
    await touchStroke(page, loop, async () => {
      expectSame(N, 'tracé en cours (liseré, trait, pointillés, départ)', await page.evaluate(() => {
        const svg = document.querySelector('.map-draw-trace');
        if (!svg) return null;
        return [[...svg.querySelectorAll('path')].map((p) => [p.getAttribute('stroke'), p.getAttribute('stroke-width')]),
          svg.querySelector('line')?.getAttribute('stroke-dasharray'), [...svg.querySelectorAll('circle')].map((c) => c.getAttribute('r'))];
      }), [[['#FFFFFF', '8'], ['#435BAA', '4.5']], '2 7', ['7', '4.5']]);
      await page.screenshot({ path: join(out, 'zone-trace-en-cours-telephone.png') });
    });
    await page.waitForSelector('.zone-card', { timeout: 4000 }).catch(() => problems.push(`${N} : pas de carte de validation après le tracé`));
    const count = await expectCard(page, N);
    const card = await box(page, '.zone-card');
    const attributionNow = await box(page, '.map-column .results-map-attribution');
    expectSame(N, 'validation : bandeau, carte, mention des sources', [tidy(await page.textContent('.zone-banner-text')), card[0], card[2],
      card[1] + card[3], card[3], card[1] - (attributionNow[1] + attributionNow[3]), await page.locator('.zone-tools, .map-preview').count()],
    ['Votre zone est tracée', 14, 362, 836, 142, 12, 0]);
    await page.screenshot({ path: join(out, 'zone-validation-telephone.png') });

    // « + » puis « − » : recalcul (« Recherche des biens… » tout de suite), la carte ne bouge pas.
    await page.tap('.zone-size[aria-label="Agrandir la zone"]');
    expectSame(N, 'pendant le recalcul', [tidy(await page.textContent('.zone-card-count')), tidy(await page.textContent('.zone-commit'))], ['Recherche des biens…', 'Voir les biens']);
    const grown = await expectCard(page, `${N}, +`);
    await page.tap('.zone-size[aria-label="Réduire la zone"]');
    const shrunk = await expectCard(page, `${N}, −`);
    expectTrue(N, 'le nombre suit − et +', grown >= count && shrunk === count, `${count} → ${grown} → ${shrunk}`);

    // « Voir les biens » : la zone remplace le lieu, dans l'adresse ; la pastille sous la ligne du haut, « Zone
    // dessinée » dans le champ (sans le texte d'aide), le crayon ouvre maintenant le menu de la zone.
    await page.tap('.zone-commit');
    await waitForUrl(page, hasZoneInUrl, N, 'pas de zone dans l\'adresse après « Voir les biens »');
    await page.waitForTimeout(600);
    const zone = zoneOf(page.url());
    expectSame(N, 'zone posée : biens de la zone (adresse, carte de validation, carte)', [zone ? salesInside(zone) : null, count, await shownCount(page)],
      [count, count, count]);
    expectSame(N, 'zone posée : pastille, champ, crayon, commandes', {
      chip: (await box(page, '.zone-chip .criterion-chip'))?.filter((_, index) => index !== 2), chipText: tidy(await page.textContent('.zone-chip .criterion-chip-label')),
      idle: tidy(await page.textContent('.map-app-top .place-field-idle')), value: await page.inputValue('.map-app-top .place-field-app input'),
      placeholder: await page.$eval('.map-app-top .place-field-app input', (el) => getComputedStyle(el, '::placeholder').color),
      pencil: await page.$eval('.zone-pencil', (el) => [el.getAttribute('aria-label'), el.getAttribute('aria-haspopup'), el.classList.contains('is-active')]),
      tools: (await box(page, '.map-column .map-round'))[1], card: await page.locator('.zone-card, .zone-banner').count(),
      lieu: new URL(page.url()).searchParams.get('lieu'),
    }, {
      chip: [14, 64, 38], chipText: 'Zone dessinée', idle: 'Zone dessinée', value: '',
      placeholder: 'rgba(0, 0, 0, 0)', pencil: ['Options de la zone', 'menu', true], tools: 112, card: 0, lieu: null,
    });
    await page.screenshot({ path: join(out, 'zone-posee-telephone.png') });

    // Menu du crayon : quatre choix, « Effacer la zone » en rouge ; flèches, Début, Fin ; Échap rend le focus au crayon.
    await page.tap('.zone-pencil');
    await page.waitForSelector('.zone-menu [role="menu"]');
    expectSame(N, 'menu de la zone', await page.$$eval('.zone-menu [role="menuitem"]', (els) => els.map((el) => [el.textContent.trim(), el.disabled, el.classList.contains('is-danger')])),
      [['Redessiner', false, false], ['Ajuster la taille', false, false], ['Créer une alerte', false, false], ['Effacer la zone', false, true]]);
    expectSame(N, 'menu : rouge d\'« Effacer la zone »', await page.$eval('.zone-menu .is-danger', (el) => getComputedStyle(el).color), 'rgb(192, 57, 43)');
    await page.screenshot({ path: join(out, 'zone-menu-telephone.png') });
    const keys = [];
    keys.push(await focused(page));
    for (const key of ['ArrowDown', 'End', 'Home', 'ArrowUp']) {
      await page.keyboard.press(key);
      keys.push(await focused(page));
    }
    await page.keyboard.press('Escape');
    keys.push(await page.locator('.zone-menu [role="menu"]').count(), await page.evaluate(() => document.activeElement?.getAttribute('aria-label')));
    expectSame(N, 'menu au clavier', keys, ['Redessiner', 'Ajuster la taille', 'Effacer la zone', 'Redessiner', 'Effacer la zone', 0, 'Options de la zone']);
    expectSame(N, 'Échap du menu : la carte reste ouverte', await page.locator('.map-column.is-open').count(), 1);

    // « Ajuster la taille » : « Ajustez votre zone », la même zone ; « Annuler » la garde telle quelle.
    const posed = page.url();
    await page.tap('.zone-pencil');
    await page.tap('.zone-menu [role="menuitem"]:has-text("Ajuster la taille")');
    await page.waitForSelector('.zone-card');
    expectSame(N, 'Ajuster la taille', [tidy(await page.textContent('.zone-banner-text')), await cardCount(page, `${N}, Ajuster`)], ['Ajustez votre zone', count]);
    await page.tap('.zone-size[aria-label="Agrandir la zone"]');
    await page.tap('.zone-banner-cancel');
    await page.waitForSelector('.zone-chip');
    expectSame(N, '« Annuler » de l\'ajustement : la zone d\'avant', [page.url() === posed, await page.locator('.zone-card, .zone-banner').count()], [true, 0]);

    // « Redessiner », cercle : « Touchez le centre, puis écartez », le rayon près du milieu du rayon, jamais sous le doigt.
    await page.tap('.zone-pencil');
    await page.tap('.zone-menu [role="menuitem"]:has-text("Redessiner")');
    await page.waitForSelector('.zone-tools');
    expectSame(N, 'Redessiner : l\'ancienne zone cachée, la pastille aussi', await page.locator('.zone-chip').count(), 0);
    await page.tap('.zone-tool:has-text("Cercle")');
    // La consigne tient dans le bandeau : le texte rapetisse au besoin, jusqu'à 80 % (12 px), comme dans l'app.
    expectSame(N, 'cercle : consigne et outil', [tidy(await page.textContent('.zone-banner-text')),
      await page.$$eval('.zone-tool', (els) => els.map((el) => el.getAttribute('aria-pressed'))),
      await page.$eval('.zone-banner-text', (el) => [el.scrollWidth <= el.clientWidth, Number.parseFloat(getComputedStyle(el).fontSize) >= 12])],
    ['Touchez le centre, puis écartez', ['false', 'true'], [true, true]]);
    const center = await emptySpot(page, 60, 60, area);
    const radiusPoints = Array.from({ length: 11 }, (_, i) => ({ x: center.x + i * 6, y: center.y + i * 3.5 }));
    await touchStroke(page, radiusPoints, async () => {
      const label = await page.$eval('.map-draw-radius', (el) => {
        const r = el.getBoundingClientRect();
        return [el.textContent, r.left + r.width / 2, r.top + r.height / 2, Math.round(r.height)];
      }).catch(() => null);
      const finger = radiusPoints[Math.floor(radiusPoints.length * 0.7) - 1];
      expectTrue(N, 'cercle : étiquette « Rayon : … »', label && /^Rayon : \d+(,\d)? (m|km)$/.test(label[0]) && label[3] === 28, JSON.stringify(label));
      if (label) expectTrue(N, 'cercle : l\'étiquette n\'est pas sous le doigt', Math.hypot(label[1] - finger.x, label[2] - finger.y) > 20);
      await page.screenshot({ path: join(out, 'zone-cercle-telephone.png') });
    });
    await page.waitForSelector('.zone-card');
    await expectCard(page, `${N}, cercle`);
    await page.tap('.zone-commit');
    await page.waitForFunction((previous) => location.href !== previous, posed, { timeout: 5000 }).catch(() => undefined);
    expectSame(N, 'cercle posé : 48 points dans l\'adresse', zoneOf(page.url())?.length, 48);

    // L'outil reste celui choisi pendant la visite (MapSession de l'app).
    await page.tap('.zone-pencil');
    await page.tap('.zone-menu [role="menuitem"]:has-text("Redessiner")');
    expectSame(N, 'outil gardé', await page.$$eval('.zone-tool', (els) => els.map((el) => el.getAttribute('aria-pressed'))), ['false', 'true']);
    const circleUrl = page.url();
    await page.tap('.zone-banner-cancel');
    await page.waitForSelector('.zone-chip');
    expectSame(N, '« Annuler » du tracé : la zone d\'avant', page.url(), circleUrl);
    await page.tap('.zone-pencil');
    await page.tap('.zone-menu [role="menuitem"]:has-text("Redessiner")');
    await page.tap('.zone-tool:has-text("Tracé libre")');

    // Zone sans bien : « Aucun bien dans cette zone », « Valider la zone » ; « Recadrer » reste possible.
    const nowhere = await emptySpot(page, 60, 50, area);
    await touchStroke(page, ellipse(nowhere.x, nowhere.y, 60, 50));
    await page.waitForSelector('.zone-card');
    const none = await expectCard(page, `${N}, zone vide`);
    expectSame(N, 'zone sans bien', none, 0);
    await page.tap('.zone-commit');
    await page.waitForTimeout(800);
    expectSame(N, 'zone sans bien posée', [await shownCount(page), await page.$eval('.map-round[aria-label="Recadrer sur les biens trouvés"]', (el) => el.disabled)], [0, false]);
    await page.screenshot({ path: join(out, 'zone-vide-telephone.png') });

    // La croix de la pastille efface la zone : plus de zone dans l'adresse, le crayon redevient « Dessiner une zone ».
    await page.tap('.zone-chip .criterion-chip-remove');
    await waitForUrl(page, noZoneInUrl, N, 'la croix de « Zone dessinée » n\'efface pas la zone');
    expectSame(N, 'zone effacée', [await page.locator('.zone-chip').count(), await page.getAttribute('.zone-pencil', 'aria-label'),
      (await box(page, '.map-column .map-round'))[1]], [0, 'Dessiner une zone', 64]);

    // Sans compte, « Créer une alerte » demande de se connecter.
    await page.goto(`${base}/recherche/?mode=buy&vue=carte&dessin=${dessin(HEXAGON)}`);
    await mapReady(page, N);
    await page.tap('.zone-pencil');
    await page.tap('.zone-menu [role="menuitem"]:has-text("Créer une alerte")');
    await page.waitForSelector('dialog.signin-sheet[open]', { timeout: 4000 })
      .catch(() => problems.push(`${N} : « Créer une alerte » sans compte n'ouvre pas la connexion`));
    expectSame(N, 'alerte sans compte : rien d\'écrit', state.writes.filter((w) => w.table === 'saved_searches').length, 0);
  }
  await context.close();
}

// MARK: - Téléphone : l'alerte d'une zone avec un compte

if (!before) {
  const N = 'alerte de zone';
  const state = newState({ signedIn: true });
  const { context, page } = await open(PHONE, state);
  await page.goto(`${base}/recherche/?mode=buy&vue=carte&dessin=${dessin(HEXAGON)}`);
  await mapReady(page, N);
  expectSame(N, 'biens de l\'hexagone', await shownCount(page), salesInside(HEXAGON.map(([latitude, longitude]) => ({ latitude, longitude }))));
  // « Créer une alerte » : la feuille « Enregistrer la recherche », alerte cochée ; enregistrée ici sans alerte.
  await page.tap('.zone-pencil');
  await page.tap('.zone-menu [role="menuitem"]:has-text("Créer une alerte")');
  await page.waitForSelector('dialog.save-search-sheet[open] .save-search-name', { timeout: 4000 })
    .catch(() => problems.push(`${N} : « Créer une alerte » n'ouvre pas la feuille d'enregistrement`));
  expectSame(N, 'feuille : alerte cochée', await page.isChecked('dialog[open] .save-search-alert .switch'), true);
  await page.click('dialog[open] .save-search-alert .switch');
  await page.click('dialog[open] .save-search-submit');
  await page.waitForSelector('dialog.save-search-sheet[open]', { state: 'detached', timeout: 4000 }).catch(() => undefined);
  const created = state.writes.find((w) => w.table === 'saved_searches' && w.method === 'POST');
  expectSame(N, 'recherche enregistrée avec la zone', created ? [created.body.alerts_enabled, created.body.query?.drawnZone?.length ?? null,
    Boolean(created.body.query?.location?.area)] : null, [false, 6, true]);
  // « Activer l'alerte » : la même recherche, alerte activée ; puis « Alerte active », inactif.
  await page.tap('.zone-pencil');
  const third = page.locator('.zone-menu [role="menuitem"]').nth(2);
  expectSame(N, 'menu : alerte à activer', [tidy(await third.textContent()), await third.isDisabled()], ['Activer l’alerte', false]);
  await third.tap();
  await page.waitForTimeout(500);
  // La dernière écriture : enregistrer passe d'abord par une mise à jour (aucune ligne), puis crée la recherche.
  const patch = state.writes.filter((w) => w.table === 'saved_searches' && w.method === 'PATCH').at(-1);
  expectSame(N, 'alerte activée', patch ? [patch.search.includes(`id=eq.${state.saved[0]?.id}`), patch.body.alerts_enabled] : null, [true, true]);
  await page.tap('.zone-pencil');
  expectSame(N, 'menu : alerte active', [tidy(await page.locator('.zone-menu [role="menuitem"]').nth(2).textContent()),
    await page.locator('.zone-menu [role="menuitem"]').nth(2).isDisabled()], ['Alerte active', true]);
  await page.screenshot({ path: join(out, 'zone-alerte-active-telephone.png') });
  await context.close();
}

// MARK: - Ordinateur : la carte et la zone dessinée

{
  const N = 'carte ordinateur';
  const state = newState();
  const { context, page } = await open(DESKTOP, state);
  await page.goto(`${base}/recherche/?mode=buy&vue=carte`);
  await mapReady(page, N);
  await page.screenshot({ path: join(out, 'carte-ordinateur.png') });
  if (!before) {
    // Tracé à la souris : le bandeau en haut au centre à la place de « Liste », sans zoom ; l'outil en bas au centre, à
    // 24 px du bas de la carte, au-dessus de la barre d'onglets (46 px).
    await page.click('.zone-pencil');
    await page.waitForSelector('.zone-banner');
    const banner = await box(page, '.zone-banner');
    const tools = await box(page, '.zone-tools');
    expectSame(N, 'tracé', {
      text: tidy(await page.textContent('.zone-banner-text')), center: Math.round(banner[0] + banner[2] / 2), width: banner[2], list: await page.locator('.map-close').count(),
      zoom: await page.$eval('.map-column .maplibregl-ctrl-top-right', (el) => getComputedStyle(el).visibility), tools: [Math.round(tools[0] + tools[2] / 2), 900 - tools[1] - tools[3]],
    }, { text: 'Tracez votre zone à la souris', center: 720, width: 480, list: 0, zoom: 'hidden', tools: [720, 24 + 46] });
    await page.screenshot({ path: join(out, 'zone-trace-ordinateur.png') });
    // La molette ne bouge pas la carte pendant le tracé.
    const shown = await anchors(page);
    await page.mouse.move(700, 500);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(400);
    expectSame(N, 'molette pendant le tracé', JSON.stringify(await anchors(page)) === JSON.stringify(shown), true);
    const target = shown[0];
    const loop = ellipse(Math.min(Math.max(target.x, 260), 1180), Math.min(Math.max(target.y, 330), 600), 160, 120);
    await mouseStroke(page, loop, () => page.screenshot({ path: join(out, 'zone-trace-en-cours-ordinateur.png') }));
    await page.waitForSelector('.zone-card');
    await expectCard(page, N);
    const card = await box(page, '.zone-card');
    expectSame(N, 'carte de validation au centre, en bas', [Math.round(card[0] + card[2] / 2), card[2], 900 - card[1] - card[3]], [720, 420, 24 + 46]);
    await page.screenshot({ path: join(out, 'zone-validation-ordinateur.png') });
    // Échap : rien n'est posé, « Liste » revient ; la molette zoome de nouveau.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.zone-card', { state: 'detached', timeout: 3000 }).catch(() => problems.push(`${N} : Échap ne referme pas l'ajustement`));
    expectSame(N, 'Échap', [new URL(page.url()).searchParams.has('dessin'), await page.locator('.map-close').count(), await page.locator('.map-column.is-open').count()], [false, 1, 1]);
    const still = await anchors(page);
    await page.mouse.move(700, 500);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(600);
    expectTrue(N, 'molette après le tracé : la carte zoome de nouveau', JSON.stringify(await anchors(page)) !== JSON.stringify(still));

    // Au clavier : Entrée sur le crayon, Tab vers « Zone autour du centre de la carte » (visible au focus), Entrée ; le
    // focus va sur « Voir les biens » ; Entrée pose la zone (un cercle de 48 points) et le focus revient au crayon.
    await page.focus('.zone-pencil');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.zone-banner');
    await page.keyboard.press('Tab');
    const hidden = await page.evaluate(() => [document.activeElement?.textContent, Math.round(document.activeElement?.getBoundingClientRect().width ?? 0) > 100]);
    expectSame(N, 'clavier : le bouton caché du bandeau', hidden, ['Zone autour du centre de la carte', true]);
    await page.screenshot({ path: join(out, 'zone-clavier-ordinateur.png') });
    await page.keyboard.press('Enter');
    await page.waitForSelector('.zone-card');
    const around = await expectCard(page, `${N}, au clavier`);
    expectSame(N, 'clavier : focus après « Zone autour du centre »', await page.evaluate(() => document.activeElement?.classList.contains('zone-commit')), true);
    await page.keyboard.press('Enter');
    await waitForUrl(page, hasZoneInUrl, N, 'Entrée sur « Voir les biens » ne pose pas la zone');
    await page.waitForTimeout(300);
    expectSame(N, 'clavier : zone posée', [zoneOf(page.url())?.length, salesInside(zoneOf(page.url()) ?? []), await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))],
      [48, around, 'Options de la zone']);
    // Menu au clavier : Entrée ouvre (focus sur « Redessiner »), ↑ va à « Effacer la zone », Entrée efface.
    await page.keyboard.press('Enter');
    await page.waitForSelector('.zone-menu [role="menu"]');
    await page.keyboard.press('ArrowUp');
    expectSame(N, 'clavier : ↑ depuis le premier choix', await focused(page), 'Effacer la zone');
    await page.keyboard.press('Enter');
    await waitForUrl(page, noZoneInUrl, N, '« Effacer la zone » n\'efface pas la zone');
    await page.waitForTimeout(200);
    expectSame(N, 'clavier : focus après « Effacer la zone »', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Dessiner une zone');
  }
  // Zone sur une ville (photo et plan), sur une grande région, et sans bien, ouvertes par l'adresse.
  await page.goto(`${base}/recherche/?mode=buy&vue=carte&dessin=${dessin(HEXAGON)}`);
  await mapReady(page, N);
  await page.screenshot({ path: join(out, 'zone-ville-ordinateur.png') });
  if (!before) {
    const hexagon = HEXAGON.map(([latitude, longitude]) => ({ latitude, longitude }));
    // La pastille à 16 px du haut de la fenêtre : plus de barre du haut au-dessus de la carte.
    expectSame(N, 'zone sur une ville : biens, pastille', [await shownCount(page), await box(page, '.zone-chip .criterion-chip').then((b) => b && b.slice(0, 2))],
      [salesInside(hexagon), [16, 16]]);
    await page.click('.map-round[aria-label="Vue plan"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(out, 'zone-ville-plan-ordinateur.png') });
    await page.goto(`${base}/recherche/?mode=buy&vue=carte&dessin=${dessin(REGION)}`);
    await mapReady(page, N);
    expectSame(N, 'zone sur une région', await shownCount(page), salesInside(REGION.map(([latitude, longitude]) => ({ latitude, longitude }))));
    await page.screenshot({ path: join(out, 'zone-region-ordinateur.png') });
    await page.goto(`${base}/recherche/?mode=buy&vue=carte&dessin=${dessin(EMPTY_ZONE)}`);
    await mapReady(page, N, { markers: false });
    expectSame(N, 'zone sans bien', [await shownCount(page), await page.$eval('.map-round[aria-label="Recadrer sur les biens trouvés"]', (el) => el.disabled)], [0, false]);
    await page.screenshot({ path: join(out, 'zone-vide-ordinateur.png') });
  }
  await context.close();
}

// MARK: - Ordinateur 1024 : le bandeau entre la pastille et les commandes

if (!before) {
  const N = 'carte 1024';
  const { context, page } = await open({ viewport: { width: 1024, height: 768 } }, newState());
  await page.goto(`${base}/recherche/?mode=buy&vue=carte&dessin=${dessin(HEXAGON)}`);
  await mapReady(page, N);
  await page.screenshot({ path: join(out, 'zone-ville-1024.png') });
  await page.click('.zone-pencil');
  await page.click('.zone-menu [role="menuitem"]:has-text("Ajuster la taille")');
  await page.waitForSelector('.zone-card');
  await cardCount(page, N);
  const banner = await box(page, '.zone-banner');
  const tools = await box(page, '.map-column .map-tools');
  const zoom = await box(page, '.map-column .maplibregl-ctrl-top-right');
  expectTrue(N, 'bandeau à gauche des commandes et du zoom', banner[0] + banner[2] <= Math.min(tools[0], zoom[0]) - 12, JSON.stringify([banner, tools, zoom]));
  expectSame(N, 'bandeau', tidy(await page.textContent('.zone-banner-text')), 'Ajustez votre zone');
  await page.screenshot({ path: join(out, 'zone-ajuster-1024.png') });
  await context.close();
}

// MARK: - Recherche enregistrée avec une zone : « Zone dessinée » dans la liste, rouverte avec sa zone

if (!before) {
  const N = 'recherche enregistrée';
  const state = newState({ signedIn: true, saved: [ZONE_SEARCH] });
  const { context, page } = await open(DESKTOP, state);
  await page.goto(`${base}/favoris/?onglet=recherches`);
  await page.waitForSelector('.dfav-searches .saved-search', { timeout: 8000 }).catch(() => problems.push(`${N} : la liste ne s'affiche pas`));
  await page.waitForFunction(() => /Voir les \d+ résultats/.test(document.querySelector('.saved-search .run-button')?.textContent ?? ''), null, { timeout: 6000 })
    .catch(() => undefined);
  expectSame(N, 'ligne de la recherche', [tidy(await page.textContent('.saved-search-text p')), tidy(await page.textContent('.saved-search .run-button'))],
    ['Résidentiel · Zone dessinée · Jusqu\'à 400 000 €', 'Voir les 3 résultats']);
  // L'onglet arrive en glissant (fav-panel-in) : capture une fois l'animation finie.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'
    || animation.effect?.getComputedTiming().endTime === Infinity), null, { timeout: 3000 }).catch(() => undefined);
  await page.screenshot({ path: join(out, 'zone-recherche-enregistree.png') });
  await page.click('.saved-search .run-button');
  await page.waitForURL(/\/recherche\//, { timeout: 6000 }).catch(() => problems.push(`${N} : la recherche ne s'ouvre pas`));
  const zone = zoneOf(page.url());
  expectSame(N, 'zone de la recherche ouverte', zone?.map((p) => [p.latitude, p.longitude]), ZONE_QUERY.drawnZone.map((p) => [p.latitude, p.longitude]));
  await page.waitForSelector('.listing-card', { timeout: 8000 }).catch(() => undefined);
  expectSame(N, 'biens de la recherche ouverte', await page.locator('.listing-card').count(), 3);
  await context.close();
}

// MARK: - Champs de lieu : « Autour de moi » et recherches récentes

{
  const N = 'lieu téléphone';
  const state = newState();
  const { context, page } = await open(PHONE, state, { geolocation: true, recents: { owner: null, items: [RECENT_ANNECY] } });
  await page.goto(`${base}/recherche/?mode=buy`);
  await page.waitForSelector('.search-app-top .place-field-app input');
  await page.waitForTimeout(500);
  await page.tap('.search-app-top .place-field-app input');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'lieu-telephone.png') });
  if (!before) {
    expectSame(N, 'raccourcis', [await texts(page, '.search-app-top .place-shortcuts .place-shortcut-name'), await texts(page, '.search-app-top .place-recents-head > *')],
      [['Autour de moi', 'Annecy'], ['Recherches récentes', 'Effacer']]);
    // Clavier : ↓ entre dans les raccourcis, Échap les ferme (le focus reste dans le champ), ↓ les rouvre.
    const shown = () => page.evaluate(() => [document.querySelectorAll('.search-app-top .place-shortcuts:not([hidden])').length, document.activeElement?.tagName]);
    await page.keyboard.press('ArrowDown');
    const down = await focused(page);
    await page.keyboard.press('Escape');
    const closed = await shown();
    await page.keyboard.press('ArrowDown');
    expectSame(N, 'clavier', [down, closed, await shown()], ['Autour de moi', [0, 'INPUT'], [1, 'INPUT']]);
    // Position accordée (Entrée sur « Autour de moi ») : la commune vient du géocodage inverse de la position exacte.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await waitForUrl(page, () => new URLSearchParams(location.search).get('autour') === 'Lyon', N, '« Autour de moi » ne cherche pas autour de Lyon');
    expectSame(N, 'géocodage inverse', state.reverse[0] ? [state.reverse[0].lat, state.reverse[0].lon, state.reverse[0].index, state.reverse[0].limit] : null,
      [String(POSITION.latitude), String(POSITION.longitude), 'address', '1']);
    expectSame(N, 'champ après « Autour de moi »', await page.inputValue('.search-app-top .place-field-app input'), 'Autour de moi');
  }
  await context.close();
}

if (!before) {
  // Position refusée : le message pour un navigateur, et « Réessayer ».
  const N = 'lieu refusé';
  const { context, page } = await open(PHONE, newState());
  await page.goto(`${base}/recherche/?mode=buy`);
  await page.waitForSelector('.search-app-top .place-field-app input');
  await page.tap('.search-app-top .place-field-app input');
  await page.tap('.place-shortcuts .place-shortcut >> nth=0');
  await page.waitForSelector('.place-nearby-problem p', { timeout: 5000 }).catch(() => problems.push(`${N} : pas de message`));
  expectSame(N, 'message', [tidy(await page.textContent('.place-nearby-problem p')), tidy(await page.textContent('.place-nearby-retry'))],
    ['Nidalo n’a pas accès à votre position. Autorisez-la pour nidalo.fr dans les réglages de votre navigateur (souvent l’icône à gauche de l’adresse) pour chercher autour de vous.', 'Réessayer']);
  await page.screenshot({ path: join(out, 'lieu-refus-telephone.png') });
  await context.close();
}

if (!before) {
  // Avec un compte : sa propre liste (vide ici), celle sans compte reste à part ; un lieu choisi y entre.
  const N = 'lieux récents du compte';
  const { context, page } = await open(PHONE, newState({ signedIn: true }), { recents: { owner: null, items: [RECENT_ANNECY] } });
  await page.goto(`${base}/recherche/?mode=buy`);
  await page.waitForSelector('.search-app-top .place-field-app input');
  await page.waitForTimeout(600);
  await page.tap('.search-app-top .place-field-app input');
  await page.waitForTimeout(300);
  expectSame(N, 'raccourcis du compte', await texts(page, '.search-app-top .place-shortcuts .place-shortcut-name'), ['Autour de moi']);
  await page.fill('.search-app-top .place-field-app input', 'Lyon');
  await page.waitForSelector('.search-app-top .place-list[role="listbox"]:not([hidden]) [role="option"]', { timeout: 5000 }).catch(() => problems.push(`${N} : pas de suggestion`));
  await page.tap('.search-app-top .place-list[role="listbox"] [role="option"] >> nth=0');
  await page.waitForTimeout(400);
  expectSame(N, 'listes gardées', await page.evaluate(([prefix, user]) => [
    JSON.parse(localStorage.getItem(`${prefix}${user}`) ?? '{"items":[]}').items.map((item) => item.name),
    JSON.parse(localStorage.getItem(`${prefix}sans-compte`) ?? '{"items":[]}').items.map((item) => item.name),
  ], [RECENTS_KEY, USER_ID]), [['Lyon'], ['Annecy']]);
  await context.close();
}

{
  // Accueil (ordinateur) : « Autour de moi » sous le champ du lieu.
  const N = 'lieu accueil';
  const { context, page } = await open(DESKTOP, newState(), { recents: { owner: null, items: [RECENT_ANNECY] } });
  await page.goto(`${base}/`);
  await page.waitForSelector('.dhome-place input');
  await page.waitForTimeout(500);
  await page.click('.dhome-place input');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'lieu-accueil-ordinateur.png') });
  if (!before) {
    expectSame(N, 'raccourcis', await texts(page, '.dhome-place .place-shortcuts .place-shortcut-name'), ['Autour de moi', 'Annecy']);
    // Un lieu choisi remplace la zone dessinée (comme dans l'app).
    await page.goto(`${base}/recherche/?mode=buy&dessin=${dessin(HEXAGON)}`);
    await page.waitForSelector('.search-place-row input');
    await page.waitForTimeout(400);
    expectSame(N, 'zone sous le champ', tidy(await page.textContent('.search-place-label').catch(() => '')), 'Zone dessinée');
    await page.fill('.search-place-row input', 'Lyon');
    await page.waitForSelector('.search-place-row [role="option"]', { timeout: 5000 }).catch(() => problems.push(`${N} : pas de suggestion`));
    await page.click('.search-place-row [role="option"] >> nth=0');
    await waitForUrl(page, () => new URLSearchParams(location.search).get('lieu') === 'Lyon', N, 'le lieu choisi n\'est pas cherché');
    expectSame(N, 'le lieu remplace la zone', new URL(page.url()).searchParams.has('dessin'), false);
  }
  await context.close();
}

if (!before) {
  // Confidentialité : la phrase de l'app (LegalTexts, « Sur votre iPhone seulement ») et le cas du site (« Le site
  // nidalo.fr »), sur la page construite et dans src/content/confidentialite.html, que scripts/make-pages.py reprend.
  const N = 'confidentialité';
  const wanted = [
    'Votre position n’est utilisée que si vous la partagez dans une conversation, ou si vous touchez « Autour de moi » dans une recherche : elle sert alors à trouver votre commune (Géoplateforme de l’IGN) et les biens autour de vous ; si vous enregistrez cette recherche, son point est gardé avec elle.',
    'Pour « Autour de moi », votre navigateur vous demande d’abord l’accès à votre position. Vos derniers lieux cherchés restent dans ce navigateur, une liste par compte.',
  ];
  const { context, page } = await open(DESKTOP, newState());
  await page.goto(`${base}/confidentialite/`);
  await page.waitForSelector('main h1');
  const shown = tidy(await page.textContent('main'));
  const source = tidy((await readFile(join(root, 'src', 'content', 'confidentialite.html'), 'utf8')).replace(/<[^>]+>/g, ' '));
  for (const sentence of wanted) {
    expectTrue(N, 'phrase absente de la page', shown.includes(tidy(sentence)), sentence.slice(0, 50));
    expectTrue(N, 'phrase absente de src/content/confidentialite.html', source.includes(tidy(sentence)), sentence.slice(0, 50));
  }
  expectTrue(N, 'ancienne phrase sur la position encore là', !shown.includes('Votre position n’est envoyée que si') && !source.includes('Votre position n’est envoyée que si'));
  await context.close();
}

await browser.close();
server.close();
if (problems.length) {
  console.log(`${problems.length} problème(s) :\n- ${problems.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Aucun problème. Captures : ${out}`);
}
