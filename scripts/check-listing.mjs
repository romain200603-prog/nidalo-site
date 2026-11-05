// Vérification de la fiche d'une annonce (/annonce/) dans Chromium, sans réseau : le serveur Supabase, les services
// de lieux et la carte sont simulés avec des données inventées (fixtures/listings.json et fixtures/listing-extra.json).
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
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const base = `http://127.0.0.1:${port}`;

const extra = JSON.parse(await readFile(join(root, 'scripts/fixtures/listing-extra.json'), 'utf8'));
const listings = [...JSON.parse(await readFile(join(root, 'scripts/fixtures/listings.json'), 'utf8')), ...extra.listings];
const profiles = extra.profiles;
const photos = {};
for (const name of ['photo0.jpg', 'photo1.jpg', 'photo2.jpg']) photos[name] = await readFile(join(root, 'scripts/fixtures', name));
const tile = await readFile(join(root, 'scripts/fixtures/tile.png'));

const id = (end) => `6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1a${end}`;
const SALE = id('01'); // vente, adresse masquée, 2 photos, particulier
const LEASED = id('02'); // vente louée (investissement), agence
const RENTAL = id('03'); // location meublée, adresse exacte, sans photo, sans profil public
const HOTEL = id('04'); // hôtel avec chiffre d'affaires et EBITDA, 3 photos, agence
const HOUSE = id('05'); // maison non louée avec un loyer potentiel, DPE F
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
    if (url.pathname.endsWith('/rpc/public_profiles')) {
      // Profils publics : jamais de téléphone ni d'e-mail pour un visiteur sans compte.
      const ids = (request.method() === 'POST' ? request.postDataJSON()?.user_ids : null) ?? [];
      return json(route, profiles.filter((p) => ids.includes(p.user_id)));
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

const problems = [];
/** Messages WebGL de la console, par page, pour expliquer une carte qui ne se charge pas. */
const webglNotes = new Map();
const expect = (name, what, actual, wanted) => {
  const clean = typeof actual === 'string' ? actual.replace(/\s+/g, ' ').trim() : actual;
  const ok = wanted instanceof RegExp ? wanted.test(String(clean)) : clean === wanted;
  if (!ok) problems.push(`${name}: ${what} « ${clean} » au lieu de « ${wanted} »`);
};

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

/** Fiche chargée : résumé affiché et profil du vendeur demandé. */
async function ready(page, name) {
  await page.waitForSelector('.header-card .hc-price-value');
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
    const boxes = '.spec-banner-col, .spec-value-box, .spec-bar-line, .spec-total, .spec-segments, .spec-result-head, .spec-kpis li, .hc-fact, .hc-price, .feature-row, .origin-row, .features-column, .publisher-head, .visit-text, .action-bar-item, .full-map-text';
    for (const el of document.querySelectorAll(boxes)) {
      if (el.scrollWidth > el.clientWidth + 1) found.push(`débordement dans .${el.className.split(' ').join('.')} : « ${el.textContent.trim().slice(0, 70)} »`);
    }
    const tabbar = document.querySelector('.tabbar');
    if (tabbar && getComputedStyle(tabbar).display !== 'none') found.push('la barre d’onglets du site est visible sur la fiche');
    const bar = document.querySelector('.action-bar');
    if (!bar) found.push('pas de barre d’actions');
    else if (phone) {
      const box = bar.querySelector('.action-bar-capsule').getBoundingClientRect();
      if (getComputedStyle(bar).position !== 'fixed' || box.bottom > window.innerHeight || box.bottom < window.innerHeight - 80) found.push(`barre d’actions mal placée (bas à ${Math.round(box.bottom)} px)`);
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

const browser = await chromium.launch();
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

  // Vente : résumé, galerie, visionneuse, fenêtres, partage, carte.
  page = await open(desktop, `/annonce/?id=${SALE}`, 'vente-ordinateur');
  await ready(page, 'vente-ordinateur');
  await common(page, 'vente-ordinateur', { phone: false });
  expect('vente-ordinateur', 'titre de la page', await page.title(), 'Appartement lumineux avec balcon à Lyon 3e · Nidalo');
  expect('vente-ordinateur', 'lien de retour', await page.textContent('.listing-back-link'), 'Chercher un bien');
  expect('vente-ordinateur', 'adresse du retour', await page.getAttribute('.listing-back-link', 'href'), '/recherche/');
  expect('vente-ordinateur', 'interlocuteur', await page.textContent('.publisher-head'), /Claire E\..*Particulier.*Sur Nidalo depuis mars 2025.*1 annonce en ligne/);
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
  await page.click('.hc-offer');
  expect('vente-ordinateur', 'fenêtre de l’offre', await dialogTitle(page), 'Faire une offre');
  await page.screenshot({ path: join(out, 'vente-ordinateur-offre.png') });
  await closeAlert(page);
  await page.click('.action-bar-item >> nth=2');
  expect('vente-ordinateur', 'fenêtre du téléphone', await dialogTitle(page), 'Numéro non disponible');
  await closeAlert(page);
  await page.click('.action-bar-item >> nth=0');
  expect('vente-ordinateur', 'fenêtre des messages', await dialogTitle(page), 'Écrire au vendeur');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.alert-dialog[open]', { state: 'detached' });
  await page.click('.gallery-action[aria-label="Partager l\'annonce"]');
  await page.waitForSelector('.listing-toast.is-shown');
  expect('vente-ordinateur', 'message du partage', await page.textContent('.listing-toast'), 'Lien de l’annonce copié');
  expect('vente-ordinateur', 'lien copié', await page.evaluate(() => navigator.clipboard.readText()), `${base}/annonce/?id=${SALE}`);
  await checkMap(page, 'vente-ordinateur', { coordinate: [45.7597, 4.8491], approximate: true, shots: true });
  await page.close();

  // Vente louée en mode investissement : carte « Rentabilité » et simulateur de financement.
  page = await open(desktop, `/annonce/?id=${LEASED}&mode=invest`, 'investissement-ordinateur');
  await ready(page, 'investissement-ordinateur');
  await common(page, 'investissement-ordinateur', { phone: false });
  await page.waitForSelector('.listing-category .spec-card');
  expect('investissement-ordinateur', 'titre de la carte', await page.textContent('.listing-category .spec-header h2'), 'Rentabilité');
  expect('investissement-ordinateur', 'interlocuteur', await page.textContent('.publisher-head'), /Agence Démo Immobilier.*PRO.*Votre contact : Paul Démo.*Lyon \(69002\).*2 annonces en ligne/);
  await page.screenshot({ path: join(out, 'investissement-ordinateur-long.png'), fullPage: true });
  await checkSegment(page, 'investissement-ordinateur', { group: 'Durée', result: '.spec-simulator .spec-result-value' });
  await checkSegment(page, 'investissement-ordinateur', { group: 'Apport', result: '.spec-total-amount' });
  await page.click('.action-bar-item >> nth=0');
  expect('investissement-ordinateur', 'fenêtre des messages (agence)', await dialogTitle(page), 'Écrire à l’agence');
  await closeAlert(page);
  await page.close();

  // Location meublée, adresse exacte, sans photo.
  page = await open(desktop, `/annonce/?id=${RENTAL}`, 'location-ordinateur');
  await ready(page, 'location-ordinateur');
  await common(page, 'location-ordinateur', { phone: false });
  if (!(await page.$('.gallery-empty'))) problems.push('location-ordinateur: la galerie vide n’est pas affichée');
  if (await page.$('.hc-offer')) problems.push('location-ordinateur: « Faire une offre » sur une location');
  expect('location-ordinateur', 'titre de la carte', await page.textContent('.listing-category .spec-header h2'), 'Coût de la location');
  expect('location-ordinateur', 'interlocuteur sans profil', await page.textContent('.publisher-head'), /Particulier/);
  await page.screenshot({ path: join(out, 'location-ordinateur-long.png'), fullPage: true });
  await checkSegment(page, 'location-ordinateur', { group: 'Revenus', result: '.spec-simulator .spec-result-value' });
  await checkMap(page, 'location-ordinateur', { coordinate: [45.7485, 4.8412], approximate: false, shots: true });
  await page.close();

  // Hôtel : indicateurs, capacité d'emprunt, mosaïque de trois photos.
  page = await open(desktop, `/annonce/?id=${HOTEL}`, 'hotel-ordinateur');
  await ready(page, 'hotel-ordinateur');
  await common(page, 'hotel-ordinateur', { phone: false });
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
} catch (error) {
  problems.push(`arrêt : ${error.message.split('\n').slice(0, 14).join('\n  ')}`);
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
