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
const docs = join(root, 'docs');
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
const communes = [
  { nom: 'Lyon', code: '69123', codesPostaux: ['69001', '69002', '69003'], population: 520000, centre: { type: 'Point', coordinates: [4.835, 45.758] }, departement: { nom: 'Rhône' } },
  { nom: 'Lyons-la-Forêt', code: '27377', codesPostaux: ['27480'], population: 750, centre: { type: 'Point', coordinates: [1.47, 49.4] }, departement: { nom: 'Eure' } },
];

async function mock(context) {
  await context.route('https://izzsoitqtzzswkpvdozd.supabase.co/rest/v1/**', (route) => {
    const url = new URL(route.request().url());
    let rows = listings;
    const transaction = url.searchParams.get('transaction');
    if (transaction?.startsWith('eq.')) rows = rows.filter((r) => r.transaction === transaction.slice(3));
    const id = url.searchParams.get('id');
    if (id?.startsWith('eq.')) rows = rows.filter((r) => r.id === id.slice(3));
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(rows) });
  });
  await context.route('https://izzsoitqtzzswkpvdozd.supabase.co/storage/**', (route) => {
    const name = route.request().url().split('/').pop();
    route.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' }, body: photos[name] ?? photos['photo0.jpg'] });
  });
  await context.route('https://geo.api.gouv.fr/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(communes) }));
  await context.route('https://data.geopf.fr/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ type: 'FeatureCollection', features: [] }) }));
  await context.route('https://tiles.openfreemap.org/planet', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14, vector_layers: [], attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap' }) }));
  await context.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' }));
}

const problems = [];
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
  let page = await open(desktop, '/recherche/?mode=buy', 'recherche-ordinateur');
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
  await page.screenshot({ path: join(out, 'filtres-ordinateur.png') });
  await page.keyboard.press('Escape');
  for (const [path, name] of [['/aide/', 'aide'], ['/favoris/', 'favoris'], ['/page-inexistante/', '404']]) {
    const p = await open(desktop, path, name);
    await p.screenshot({ path: join(out, `${name}-ordinateur.png`) });
    await p.close();
  }
  await desktop.close();

  // Téléphone
  const phone = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' });
  await mock(phone);
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
  await page.screenshot({ path: join(out, 'filtres-telephone.png') });
  page = await open(phone, '/recherche/?mode=rent', 'location-telephone');
  await page.waitForSelector('.listing-card');
  await page.screenshot({ path: join(out, 'location-telephone.png'), fullPage: true });
  await phone.close();
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
