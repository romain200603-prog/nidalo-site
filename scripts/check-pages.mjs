// Vérification du site construit (docs/) dans Chromium, sans réseau : le serveur Supabase, les services de lieux
// et la carte sont simulés avec des données inventées. Lancer : node scripts/check-pages.mjs [dossier des captures]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
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

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
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

async function mock(context, { signedIn = false } = {}) {
  const json = (route, status, body) =>
    route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: body === undefined ? '' : JSON.stringify(body) });
  await context.route('https://izzsoitqtzzswkpvdozd.supabase.co/rest/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.replace('/rest/v1/', '');
    const single = (request.headers().accept ?? '').includes('vnd.pgrst.object');
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
}

const problems = [];

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
    if (name === '404' && /status of 404/.test(text)) return;
    if (msg.type() === 'error' || /Content Security Policy/i.test(text)) problems.push(`${name}: ${msg.type()} ${text}`);
  });
  page.on('pageerror', (error) => problems.push(`${name}: erreur ${error.message}`));
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
