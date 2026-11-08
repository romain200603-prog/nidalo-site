// Vérification de l'espace professionnel dans Chromium, sans réseau : Supabase est simulé.
// Profil agence : un particulier passe en professionnel en remplissant la fiche agence (erreurs d'abord, puis la
// fiche, ses détails, le compte et le logo, dans l'ordre de l'app) ; un professionnel ouvre sa page agence, la modifie,
// change son logo (l'ancien est retiré) ; un refus du serveur s'affiche sans quitter le formulaire ; « Passer en
// professionnel » mène au formulaire depuis Mon compte, Mes informations et l'espace sur ordinateur.
// Outils de diffusion : les annonces en ligne seulement, avec leur lien copié, leur QR code (PNG téléchargé), leur
// texte copié et leur affiche A4 (une seule page en PDF) ; rien n'est écrit sur le serveur.
// Captures pour Romain : agence-*.png, diffusion-*.png, diffusion-affiche.pdf.
// Lancer après la construction : node scripts/check-espace-pro.mjs [dossier construit, docs/ par défaut] [dossier des captures]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
const [LISTED] = JSON.parse(await readFile(join(fixtures, 'listings.json'), 'utf8'));

const SUPABASE = 'https://izzsoitqtzzswkpvdozd.supabase.co';
const USER_ID = 'a0000000-0000-4000-8000-0000000000c3';
const USER_EMAIL = 'claire.martin@exemple.fr';
const AGENCY_ID = 'b0000000-0000-4000-8000-0000000000a1';
const OLD_LOGO = `${USER_ID}/agency-logo.jpg`;
const FORM_PATH = '/compte/?vue=agence&ecran=modifier';
const SAVE_MESSAGE = 'La fiche agence n\'a pas pu être enregistrée. Réessayez dans un instant.';

const PROFILE = {
  id: USER_ID, display_name: 'Claire Martin', avatar_path: null, account_type: 'individual', professional_profile_id: null,
  created_at: '2026-10-01T08:00:00Z', shows_full_name: false, findable_by_phone: false,
};
const DETAILS = {
  user_id: USER_ID, first_name: 'Claire', last_name: 'Martin', birth_date: null, phone: '0639981234', street: null,
  postal_code: '69003', city: 'Lyon', insee_code: '69383', country_code: 'FR', professional_situation: 'employee',
};
const AGENCY = {
  id: AGENCY_ID, owner_user_id: USER_ID, agency_name: 'Rhône Immobilier', logo_path: OLD_LOGO, postal_code: '69006', city: 'Lyon',
  is_verified: false, created_at: '2026-10-20T09:00:00Z', updated_at: '2026-10-20T09:00:00Z',
};
const AGENCY_DETAILS = {
  professional_profile_id: AGENCY_ID, siren: '443061841', siret: '44306184100005', professional_card_number: 'CPI 6901 2026 000 000 001',
  professional_card_cci: 'CCI Lyon Métropole', financial_guarantee: 'Galian', rcp_insurer: 'MMA', rcp_policy_number: 'RCP-2026-118',
  phone: '0478123456', email: 'contact@rhone-immobilier.fr', website: 'https://www.rhone-immobilier.fr', street: null,
  about: 'Vente et location à Lyon 6e depuis 2009.\nUne équipe de quatre conseillers.', updated_at: '2026-10-20T09:00:00Z',
};
const { listing_photos: LISTED_PHOTOS, ...listedRow } = LISTED;
const ONLINE = { ...listedRow, owner_id: USER_ID, status: 'active', listing_photos: LISTED_PHOTOS };
const [, SECOND, RENTAL] = JSON.parse(await readFile(join(fixtures, 'listings.json'), 'utf8'));
/** Outils de diffusion : une vente avec honoraires, une location sans photo, et un brouillon (jamais montré). */
const SALE = { ...ONLINE, agency_fees_amount: 9500, agency_fees_paid_by: 'buyer' };
const RENT = { ...RENTAL, owner_id: USER_ID, status: 'active' };
const DRAFT = { ...SECOND, owner_id: USER_ID, status: 'draft' };

// MARK: - Serveur simulé

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
const empty = (route, status = 204) => route.fulfill({ status, headers: cors, body: '' });

const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); };
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

/**
 * `pro` : un professionnel avec sa fiche agence, ses détails et (sauf `listings`) une annonce en ligne ; sinon un
 * particulier sans fiche.
 */
function newState({ pro = false, listings = null } = {}) {
  return {
    profile: pro ? { ...PROFILE, account_type: 'professional', professional_profile_id: AGENCY_ID } : { ...PROFILE },
    details: { ...DETAILS },
    agency: pro ? { ...AGENCY } : null,
    agencyDetails: pro ? { ...AGENCY_DETAILS } : null,
    listings: structuredClone(listings ?? (pro ? [ONLINE] : [])),
    files: new Map(pro ? [[OLD_LOGO, PHOTO]] : []),
    calls: [],
    /** Le serveur refuse les détails (contrôle d'une colonne). */
    refuseDetails: false,
  };
}

/** Filtres PostgREST utiles ici : `col=eq.x`. */
function filtered(rows, params) {
  return rows.filter((row) => [...params].every(([column, value]) => (
    ['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(column) || !value.startsWith('eq.') || String(row[column]) === value.slice(3)
  )));
}

function rest(state, route) {
  const request = route.request();
  const url = new URL(request.url());
  const table = url.pathname.replace('/rest/v1/', '');
  const method = request.method();
  const params = url.searchParams;
  if (method === 'OPTIONS') return empty(route, 200);
  const single = (request.headers().accept ?? '').includes('vnd.pgrst.object');
  let body = null;
  if (method !== 'GET' && method !== 'HEAD') {
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
  }
  state.calls.push({ table, method, search: decodeURIComponent(url.search), body });
  const now = new Date().toISOString();
  switch (table) {
    case 'profiles':
      if (method === 'GET') return single ? json(route, state.profile) : json(route, [state.profile]);
      if (method === 'PATCH') { Object.assign(state.profile, body); return empty(route); }
      break;
    case 'profile_details':
      if (method === 'GET') return json(route, [state.details]);
      if (method === 'PATCH') { Object.assign(state.details, body); return empty(route); }
      break;
    case 'professional_profiles': {
      if (method === 'GET') return json(route, filtered(state.agency ? [state.agency] : [], params));
      if (method === 'POST') {
        // owner_user_id : auth.uid() par défaut sur le serveur ; is_verified n'est jamais écrit par la page.
        if ('owner_user_id' in body || 'is_verified' in body) problems.push(`professional_profiles : colonnes en trop ${Object.keys(body)}`);
        state.agency = { id: AGENCY_ID, owner_user_id: USER_ID, logo_path: null, is_verified: false, created_at: now, updated_at: now, ...body };
        return single ? json(route, { id: AGENCY_ID }, 201) : json(route, [{ id: AGENCY_ID }], 201);
      }
      if (method === 'PATCH') {
        if (!state.agency || params.get('id') !== `eq.${state.agency.id}`) problems.push(`professional_profiles : modification ${url.search}`);
        if ('is_verified' in body || 'owner_user_id' in body) problems.push(`professional_profiles : colonnes en trop ${Object.keys(body)}`);
        Object.assign(state.agency, body, { updated_at: now });
        return empty(route);
      }
      break;
    }
    case 'professional_profile_details':
      if (method === 'GET') return json(route, filtered(state.agencyDetails ? [state.agencyDetails] : [], params));
      if (method === 'POST') {
        if (params.get('on_conflict') !== 'professional_profile_id') problems.push(`détails : on_conflict « ${params.get('on_conflict')} »`);
        if (!/resolution=merge-duplicates/.test(request.headers().prefer ?? '')) problems.push(`détails : Prefer « ${request.headers().prefer} »`);
        if (state.refuseDetails) {
          expectedServerErrors += 1;
          return json(route, { code: '23514', message: 'new row violates check constraint', details: null, hint: null }, 400);
        }
        state.agencyDetails = { street: null, ...state.agencyDetails, ...body, updated_at: now };
        return empty(route, 201);
      }
      break;
    case 'listings':
      if (method === 'GET') return json(route, filtered(state.listings, params));
      break;
    default:
      // Barre du haut (pastilles), projet, recherches : rien à montrer.
      if (method === 'GET' || table.startsWith('rpc/')) return json(route, []);
  }
  problems.push(`${table} : ${method} inattendu (${decodeURIComponent(url.search)})`);
  return json(route, { message: 'non simulé' }, 400);
}

/** Fichier d'un envoi multipart (supabase-js envoie un Blob en FormData : cacheControl, puis le fichier). */
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

/** Largeur et hauteur d'un JPEG (premier segment SOF). */
function jpegSize(bytes) {
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xFF) {
    const marker = bytes[i + 1];
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xC0 && marker <= 0xC3) return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
    i += 2 + length;
  }
  return null;
}

async function storage(state, route) {
  const request = route.request();
  const method = request.method();
  const path = decodeURIComponent(new URL(request.url()).pathname);
  const PUBLIC = '/storage/v1/object/public/';
  const OBJECT = '/storage/v1/object/avatars';
  if (method === 'OPTIONS') return empty(route, 200);
  if (method === 'GET' && path.startsWith(PUBLIC)) {
    const [bucket, ...rest] = path.slice(PUBLIC.length).split('/');
    const name = rest.join('/');
    if (bucket === 'avatars' && !state.files.has(name)) problems.push(`stockage : logo ${name} demandé alors qu'il n'existe pas`);
    return route.fulfill({ status: 200, contentType: 'image/jpeg', headers: cors, body: state.files.get(name) ?? PHOTO });
  }
  if (method === 'POST' && path.startsWith(`${OBJECT}/`)) {
    const name = path.slice(OBJECT.length + 1);
    const file = multipartFile(request.postDataBuffer(), request.headers()['content-type']);
    state.files.set(name, file.bytes);
    state.calls.push({ table: 'storage', method, search: name, body: { type: file.type, cacheControl: file.fields.cacheControl, size: jpegSize(file.bytes) } });
    return json(route, { Key: `avatars/${name}`, Id: randomUUID() });
  }
  if (method === 'DELETE' && path === OBJECT) {
    const prefixes = request.postDataJSON()?.prefixes ?? [];
    for (const name of prefixes) state.files.delete(name);
    state.calls.push({ table: 'storage', method, search: '', body: { prefixes } });
    return json(route, prefixes.map((name) => ({ name })));
  }
  problems.push(`stockage : ${method} ${path} inattendu`);
  return json(route, { message: 'non simulé' }, 400);
}

async function mock(context, state) {
  const session = JSON.stringify(fakeSession());
  await context.addInitScript((value) => {
    try { localStorage.setItem('sb-izzsoitqtzzswkpvdozd-auth-token', value); } catch { /* stockage indisponible */ }
  }, session);
  await context.route(`${SUPABASE}/auth/v1/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/logout')) return empty(route);
    if (path.endsWith('/user')) return json(route, fakeSession().user);
    return json(route, fakeSession());
  });
  await context.route(`${SUPABASE}/rest/v1/**`, (route) => rest(state, route));
  await context.route(`${SUPABASE}/storage/v1/**`, (route) => storage(state, route));
  await context.route('https://geo.api.gouv.fr/**', (route) => json(route, []));
  await context.route('https://data.geopf.fr/**', (route) => json(route, { type: 'FeatureCollection', features: [] }));
  await context.route('https://tiles.openfreemap.org/**', (route) => empty(route));
  await context.routeWebSocket(/^wss:\/\/izzsoitqtzzswkpvdozd\.supabase\.co\/realtime\//, (ws) => {
    ws.onMessage((message) => {
      let frame;
      try { frame = JSON.parse(String(message)); } catch { return; }
      if (!Array.isArray(frame)) return;
      const [joinRef, ref, topic, event, payload] = frame;
      const response = event === 'phx_join' ? { postgres_changes: (payload?.config?.postgres_changes ?? []).map((f, i) => ({ ...f, id: i + 1 })) } : {};
      ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]));
    });
  });
}

// MARK: - Outils

const tidy = (text) => (text ?? '').replace(/[\s  ]+/g, ' ').trim();
function expectSame(name, what, actual, wanted) {
  const got = JSON.stringify(actual);
  const want = JSON.stringify(wanted);
  if (got !== want) problems.push(`${name} : ${what} ${got} au lieu de ${want}`);
}
const texts = (page, selector) => page.$$eval(selector, (els) => els.map((el) => el.textContent.replace(/[\s  ]+/g, ' ').trim()));
/** Écritures depuis `mark` : « MÉTHODE table » (les lectures et les fonctions de lecture rpc/ sont laissées de côté). */
const writesSince = (state, mark) => state.calls.slice(mark).filter((call) => call.method !== 'GET' && !call.table.startsWith('rpc/'));
const writeNames = (calls) => calls.map((call) => `${call.method} ${call.table}`);

async function open(context, path, name) {
  const page = await context.newPage();
  page.on('console', (msg) => {
    const text = msg.text();
    if (expectedServerErrors > 0 && /status of 400/.test(text)) {
      expectedServerErrors -= 1;
      return;
    }
    if (msg.type() === 'error' || /Content Security Policy/i.test(text)) problems.push(`${name} : ${msg.type()} ${text}`);
  });
  page.on('pageerror', (error) => problems.push(`${name} : erreur ${error.message}`));
  page.on('dialog', async (dialog) => {
    problems.push(`${name} : fenêtre ${dialog.type()} « ${dialog.message()} »`);
    await dialog.dismiss();
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP bloque ${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto(base + path, { waitUntil: 'networkidle' });
  return page;
}

/** Capture de toute la page (la fenêtre prend la hauteur de la page, comme dans check-publish). */
async function shot(page, file) {
  const viewport = page.viewportSize();
  await page.mouse.move(0, 0);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.evaluate(() => document.fonts.ready);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: viewport.width, height: Math.max(height, viewport.height) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, file) });
  await page.setViewportSize(viewport);
  await page.waitForTimeout(100);
}

async function imagesLoaded(page, selector, count, name) {
  await page.waitForFunction(([sel, n]) => {
    const images = [...document.querySelectorAll(sel)];
    return images.length === n && images.every((img) => img.complete && img.naturalWidth > 0);
  }, [selector, count], { timeout: 10000 }).catch(() => problems.push(`${name} : ${count} image(s) ${selector} non chargée(s)`));
}

/** Champ par son libellé exact (le message d'erreur est aussi dans le <label>, comme dans Mes informations). */
const field = (page, label) => page.locator('label.form-field')
  .filter({ has: page.locator('.field-label', { hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`) }) })
  .locator('input, textarea');
const dialog = (page) => page.locator('dialog[open]');

/** Ce que montre la page de l'agence : nom, badges, lieu, lignes, site, biens. */
async function viewSummary(page) {
  return {
    title: tidy(await page.locator('.screen-header h1').textContent()),
    name: tidy(await page.locator('.agency-name').textContent()),
    badges: await texts(page, '.agency-badges > span'),
    place: tidy(await page.locator('.agency-place').textContent().catch(() => null)),
    cards: await texts(page, '.agency-card-title'),
    rows: await page.$$eval('.agency-rows > div', (els) => els.map((el) => `${el.querySelector('dt').textContent} : ${el.querySelector('dd').textContent}`)),
    site: await page.locator('.agency-site').evaluate((a) => [a.textContent.trim(), a.getAttribute('href')]).catch(() => null),
    listings: tidy(await page.locator('.agency-listings-title').textContent()),
    cardsShown: await page.locator('.agency-listings .listing-card').count(),
  };
}

// MARK: - Vérifications

/** Nombre de pages d'un PDF (objets « /Type /Page », sans « /Pages »). */
const pdfPages = (bytes) => (bytes.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

const browser = await chromium.launch();
try {
  const phone = () => browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const desktop = () => browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });

  // 1. Téléphone, particulier sans fiche : Mon compte › Type de compte › Passer en professionnel ouvre le formulaire.
  //    Vide, il signale les champs demandés sans rien écrire ; rempli avec un logo, il crée la fiche comme l'app.
  {
    const N = 'passer en professionnel (téléphone)';
    const state = newState();
    const context = await phone();
    await mock(context, state);
    const page = await open(context, '/compte/', N);
    await page.getByRole('link', { name: /Type de compte/ }).or(page.getByRole('button', { name: /Type de compte/ })).first().click();
    const link = dialog(page).getByRole('link', { name: 'Passer en professionnel' });
    expectSame(N, 'lien du choix', await link.getAttribute('href'), FORM_PATH);
    await link.click();
    await page.waitForURL(`**${FORM_PATH}`);
    await page.locator('.agency-status h2').waitFor();
    expectSame(N, 'formulaire', [
      tidy(await page.locator('.screen-header h1').textContent()),
      tidy(await page.locator('.agency-status h2').textContent()),
      tidy(await page.locator('.agency-save').textContent()),
      await field(page, 'E-mail de l\'agence (facultatif)').inputValue(),
      tidy(await page.locator('.agency-logo-row .field-hint').textContent()),
    ], ['Compte professionnel', 'Votre activité professionnelle', 'Passer en professionnel', USER_EMAIL, 'Facultatif · JPEG, PNG, HEIC ou WebP']);
    await shot(page, 'agence-telephone-formulaire.png');

    const mark = state.calls.length;
    await page.locator('.agency-save').click();
    expectSame(N, 'erreurs du formulaire vide', await texts(page, '.agency-form-screen .field-error'), [
      'Indiquez le numéro SIREN.', 'Indiquez le nom de l\'agence.', 'Indiquez la ville de l\'agence.', 'Vérifiez les champs en rouge.',
    ]);
    expectSame(N, 'écritures du formulaire vide', writeNames(writesSince(state, mark)), []);

    await field(page, 'SIREN (9 chiffres)').fill('443 061 841');
    await field(page, 'SIRET (facultatif, 14 chiffres)').fill('443 061 841 00005');
    await field(page, 'N° de carte professionnelle (facultatif)').fill('CPI 6901 2026 000 000 001');
    await field(page, 'Garantie financière : organisme garant (facultatif)').fill('Galian');
    await field(page, 'Nom de l\'agence').fill('  Agence du Parc ');
    await field(page, 'Code postal').fill('69006');
    await field(page, 'Ville').fill('Lyon');
    await field(page, 'Téléphone (facultatif)').fill('04 78 12 34 56');
    await field(page, 'Site internet (facultatif)').fill('www.agenceduparc.fr');
    await field(page, 'Présentation (facultative)').fill('Vente et gestion à Lyon 6e.\nÉquipe de trois conseillers.');
    await page.setInputFiles('.agency-form-screen input[type="file"]', { name: 'logo.jpg', mimeType: 'image/jpeg', buffer: PHOTO });
    await imagesLoaded(page, '.agency-logo-preview img', 1, `${N} : logo choisi`);
    expectSame(N, 'logo choisi', [
      await page.locator('.agency-logo-preview img').evaluate((img) => Math.max(img.naturalWidth, img.naturalHeight)),
      tidy(await page.locator('.agency-logo-row .field-hint').textContent()),
      tidy(await page.locator('.agency-logo-row .small-button').textContent()),
    ], [512, 'Envoyé à l’enregistrement', 'Changer']);

    const save = state.calls.length;
    await page.locator('.agency-save').click();
    await page.waitForURL('**/compte/?vue=agence', { timeout: 8000 }).catch(() => problems.push(`${N} : adresse ${page.url()} après l'enregistrement`));
    await page.locator('.agency-name').waitFor({ timeout: 8000 }).catch(() => problems.push(`${N} : page de l'agence absente`));
    const writes = writesSince(state, save);
    expectSame(N, 'écritures', writeNames(writes), [
      'POST professional_profiles', 'POST professional_profile_details', 'PATCH profiles', 'POST storage', 'PATCH professional_profiles',
    ]);
    expectSame(N, 'fiche créée', writes[0]?.body, { agency_name: 'Agence du Parc', postal_code: '69006', city: 'Lyon' });
    expectSame(N, 'détails', writes[1]?.body, {
      professional_profile_id: AGENCY_ID, siren: '443061841', siret: '44306184100005', professional_card_number: 'CPI 6901 2026 000 000 001',
      phone: '0478123456', email: USER_EMAIL, website: 'https://www.agenceduparc.fr', about: 'Vente et gestion à Lyon 6e.\nÉquipe de trois conseillers.',
      professional_card_cci: null, financial_guarantee: 'Galian', rcp_insurer: null, rcp_policy_number: null,
    });
    expectSame(N, 'compte', [writes[2]?.body, writes[2]?.search], [{ professional_profile_id: AGENCY_ID, account_type: 'professional' }, `?id=eq.${USER_ID}`]);
    const upload = writes[3];
    check(new RegExp(`^${USER_ID}/agency-logo-[0-9a-f-]{36}\\.jpg$`).test(upload?.search ?? ''), `${N} : logo envoyé sous ${upload?.search}`);
    expectSame(N, 'logo envoyé', [upload?.body?.type, upload?.body?.cacheControl, Math.max(...(upload?.body?.size ?? [0]))], ['image/jpeg', '3600', 512]);
    expectSame(N, 'logo sur la fiche', [writes[4]?.body, writes[4]?.search], [{ logo_path: upload?.search }, `?id=eq.${AGENCY_ID}`]);

    await imagesLoaded(page, '.agency-head .agency-logo img', 1, `${N} : logo de la page`);
    expectSame(N, 'message', tidy(await page.locator('.account-toast').textContent().catch(() => null)), 'Fiche agence enregistrée');
    expectSame(N, 'page de l\'agence', await viewSummary(page), {
      title: 'Profil agence', name: 'Agence du Parc', badges: ['PRO'], place: 'Lyon (69006)',
      cards: ['Présentation', 'Contact', 'Informations professionnelles'],
      rows: ['Téléphone : 04 78 12 34 56', `E-mail : ${USER_EMAIL}`, 'SIREN : 443061841', 'SIRET : 44306184100005', 'Carte professionnelle : CPI 6901 2026 000 000 001', 'Garantie financière : Galian'],
      site: ['www.agenceduparc.fr', 'https://www.agenceduparc.fr'], listings: 'Ses biens', cardsShown: 0,
    });
    expectSame(N, 'textes', [
      await page.locator('.agency-about').evaluate((p) => p.textContent),
      tidy(await page.locator('.agency-caption').textContent()),
      tidy(await page.locator('.agency-listings .agency-note').textContent()),
    ], [
      'Vente et gestion à Lyon 6e.\nÉquipe de trois conseillers.',
      'Ces informations sont déclarées par l\'agence et n\'ont pas encore été vérifiées par Nidalo.',
      'Aucune annonce en ligne pour le moment.',
    ]);
    await page.locator('.account-toast').waitFor({ state: 'detached', timeout: 5000 }).catch(() => problems.push(`${N} : le message reste affiché`));
    await shot(page, 'agence-telephone-page.png');

    // Retour à Mon compte : l'espace professionnel, la carte de l'agence mène à sa page.
    await page.locator('.screen-header .round-back').click();
    await page.waitForURL('**/compte/');
    await page.waitForFunction(() => document.querySelector('.space-profile-name')?.textContent === 'Agence du Parc', null, { timeout: 8000 })
      .catch(() => undefined);
    expectSame(N, 'espace professionnel', [
      tidy(await page.locator('.space-profile-name').textContent()),
      await page.locator('.space-profile').getAttribute('href'),
      await page.getByRole('link', { name: /Profil agence/ }).getAttribute('href'),
      await page.getByRole('link', { name: /Informations de l'agence/ }).getAttribute('href'),
    ], ['Agence du Parc', '/compte/?vue=agence', '/compte/?vue=agence', FORM_PATH]);
    await context.close();
  }

  // 2. Ordinateur, professionnel avec sa fiche et une annonce : sa page, puis « Modifier » ; quitter demande
  //    confirmation ; la fiche modifiée et un nouveau logo sont enregistrés, l'ancien logo retiré.
  {
    const N = 'modifier la fiche (ordinateur)';
    const state = newState({ pro: true });
    const context = await desktop();
    await mock(context, state);
    const page = await open(context, '/compte/', N);
    await page.locator('.space-profile').click();
    await page.waitForURL('**/compte/?vue=agence');
    await page.locator('.agency-name').waitFor();
    await imagesLoaded(page, '.agency-head .agency-logo img', 1, `${N} : logo`);
    await page.locator('.agency-listings .listing-card').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const img = document.querySelector('.agency-listings .listing-card img');
      return img && img.complete && img.naturalWidth > 0;
    }, null, { timeout: 8000 }).catch(() => problems.push(`${N} : photo de l'annonce non chargée`));
    await page.evaluate(() => window.scrollTo(0, 0));
    expectSame(N, 'page de l\'agence', await viewSummary(page), {
      title: 'Profil agence', name: 'Rhône Immobilier', badges: ['PRO'], place: 'Lyon (69006)',
      cards: ['Présentation', 'Contact', 'Informations professionnelles'],
      rows: [
        'Téléphone : 04 78 12 34 56', 'E-mail : contact@rhone-immobilier.fr', 'SIREN : 443061841', 'SIRET : 44306184100005',
        'Carte professionnelle : CPI 6901 2026 000 000 001', 'CCI de délivrance : CCI Lyon Métropole', 'Garantie financière : Galian',
        'Assurance RCP : MMA', 'Contrat RCP : RCP-2026-118',
      ],
      site: ['www.rhone-immobilier.fr', 'https://www.rhone-immobilier.fr'], listings: 'Ses biens · 1', cardsShown: 1,
    });
    expectSame(N, 'lien de l\'annonce', await page.locator('.agency-listings .listing-card a.stretched').getAttribute('href'), `/annonce/?id=${ONLINE.id}`);
    await shot(page, 'agence-ordinateur-page.png');

    await page.getByRole('link', { name: 'Modifier' }).click();
    await page.waitForURL(`**${FORM_PATH}`);
    await page.locator('.agency-status h2').waitFor();
    expectSame(N, 'formulaire rempli', [
      tidy(await page.locator('.agency-status h2').textContent()),
      tidy(await page.locator('.agency-save').textContent()),
      await field(page, 'SIREN (9 chiffres)').inputValue(),
      await field(page, 'Téléphone (facultatif)').inputValue(),
      await field(page, 'E-mail de l\'agence (facultatif)').inputValue(),
      await field(page, 'RCP : n° de contrat (facultatif)').inputValue(),
      await field(page, 'Présentation (facultative)').inputValue(),
    ], ['Vérification en attente', 'Enregistrer les modifications', '443061841', '04 78 12 34 56', 'contact@rhone-immobilier.fr', 'RCP-2026-118', AGENCY_DETAILS.about]);
    await imagesLoaded(page, '.agency-logo-preview img', 1, `${N} : logo actuel`);
    await shot(page, 'agence-ordinateur-formulaire.png');

    // Sans changement, Retour ramène à la page sans rien demander.
    await page.locator('.screen-header .round-back').click();
    await page.waitForURL('**/compte/?vue=agence');
    await page.getByRole('link', { name: 'Modifier' }).click();
    await page.waitForURL(`**${FORM_PATH}`);
    await page.locator('.agency-status h2').waitFor();

    await field(page, 'Code postal').fill('69100');
    await field(page, 'Ville').fill('Villeurbanne');
    await page.locator('.screen-header .round-back').click();
    expectSame(N, 'quitter', [
      tidy(await dialog(page).locator('h2').textContent()),
      await dialog(page).getByRole('link', { name: 'Quitter sans enregistrer' }).getAttribute('href'),
    ], ['Quitter sans enregistrer ?', '/compte/?vue=agence']);
    await dialog(page).getByRole('button', { name: 'Continuer' }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 3000 }).catch(() => problems.push(`${N} : la fenêtre « Quitter » reste ouverte`));
    await page.setInputFiles('.agency-form-screen input[type="file"]', { name: 'nouveau-logo.jpg', mimeType: 'image/jpeg', buffer: PHOTO });
    await imagesLoaded(page, '.agency-logo-preview img[src^="blob:"]', 1, `${N} : nouveau logo`);

    const mark = state.calls.length;
    await page.locator('.agency-save').click();
    await page.waitForURL('**/compte/?vue=agence', { timeout: 8000 }).catch(() => problems.push(`${N} : adresse ${page.url()} après l'enregistrement`));
    await page.locator('.agency-name').waitFor();
    const writes = writesSince(state, mark);
    expectSame(N, 'écritures', writeNames(writes), [
      'PATCH professional_profiles', 'POST professional_profile_details', 'PATCH profiles', 'POST storage', 'PATCH professional_profiles', 'DELETE storage',
    ]);
    expectSame(N, 'fiche modifiée', [writes[0]?.body, writes[0]?.search], [{ agency_name: 'Rhône Immobilier', postal_code: '69100', city: 'Villeurbanne' }, `?id=eq.${AGENCY_ID}`]);
    expectSame(N, 'détails gardés', writes[1]?.body?.rcp_policy_number, 'RCP-2026-118');
    expectSame(N, 'ancien logo retiré', writes[5]?.body, { prefixes: [OLD_LOGO] });
    check(state.agency.logo_path !== OLD_LOGO && state.files.has(state.agency.logo_path), `${N} : logo de la fiche ${state.agency.logo_path}`);
    expectSame(N, 'après l\'enregistrement', [
      tidy(await page.locator('.account-toast').textContent().catch(() => null)),
      tidy(await page.locator('.agency-place').textContent()),
    ], ['Modifications enregistrées', 'Villeurbanne (69100)']);
    await context.close();
  }

  // 3. Téléphone : le serveur refuse les détails ; le message s'affiche, le formulaire reste ouvert et rempli.
  {
    const N = 'refus du serveur (téléphone)';
    const state = newState({ pro: true });
    state.refuseDetails = true;
    const context = await phone();
    await mock(context, state);
    const page = await open(context, FORM_PATH, N);
    await page.locator('.agency-status h2').waitFor();
    await field(page, 'Ville').fill('Lyon 6e');
    await page.locator('.agency-save').click();
    await page.locator('.agency-form-screen .signin-error').waitFor({ timeout: 8000 }).catch(() => undefined);
    expectSame(N, 'après le refus', [
      tidy(await page.locator('.agency-form-screen .signin-error').textContent().catch(() => null)),
      new URL(page.url()).search,
      await field(page, 'Ville').inputValue(),
      tidy(await page.locator('.agency-save').textContent()),
    ], [SAVE_MESSAGE, '?vue=agence&ecran=modifier', 'Lyon 6e', 'Enregistrer les modifications']);
    expectSame(N, 'compte inchangé', state.profile.account_type, 'professional');
    await context.close();
  }

  // 4. Téléphone, Mes informations modifiées : « Passer en professionnel » demande d'abord de quitter sans
  //    enregistrer, puis ouvre le formulaire de l'agence.
  {
    const N = 'mes informations (téléphone)';
    const state = newState();
    const context = await phone();
    await mock(context, state);
    const page = await open(context, '/compte/?vue=informations', N);
    await field(page, 'Prénom').fill('Claire-Marie');
    await page.locator('.type-row .small-button').click();
    await dialog(page).getByRole('button', { name: 'Passer en professionnel' }).click();
    const leave = dialog(page).getByRole('link', { name: 'Quitter sans enregistrer' });
    await leave.waitFor({ timeout: 3000 }).catch(() => problems.push(`${N} : pas de fenêtre « Quitter sans enregistrer ? »`));
    expectSame(N, 'lien de sortie', await leave.getAttribute('href').catch(() => null), FORM_PATH);
    await leave.click();
    await page.waitForURL(`**${FORM_PATH}`);
    await page.locator('.agency-status h2').waitFor();
    expectSame(N, 'écritures', writeNames(writesSince(state, 0)), []);
    await context.close();
  }

  // 5. Ordinateur, particulier : Mon espace › Type de compte › Passer en professionnel ouvre le formulaire.
  {
    const N = 'mon espace (ordinateur)';
    const state = newState();
    const context = await desktop();
    await mock(context, state);
    const page = await open(context, '/compte/', N);
    await page.getByRole('button', { name: /Type de compte/ }).click();
    await dialog(page).getByRole('button', { name: 'Passer en professionnel' }).click();
    await page.waitForURL(`**${FORM_PATH}`, { timeout: 8000 }).catch(() => problems.push(`${N} : adresse ${page.url()}`));
    await page.locator('.agency-status h2').waitFor();
    expectSame(N, 'écritures', writeNames(writesSince(state, 0)), []);
    await context.close();
  }

  // 6. Ordinateur, professionnel : Outils de diffusion depuis Mon compte. Seules les annonces en ligne ; le lien et
  //    le texte sont copiés, le QR code téléchargé en PNG, l'affiche tient sur une page A4. Rien n'est écrit.
  {
    const N = 'outils de diffusion (ordinateur)';
    const state = newState({ pro: true, listings: [SALE, DRAFT, RENT] });
    const context = await desktop();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    await mock(context, state);
    const page = await open(context, '/compte/', N);
    const row = page.getByRole('link', { name: /Outils de diffusion/ });
    expectSame(N, 'ligne de Mon compte', await row.getAttribute('href'), '/compte/?vue=diffusion');
    await row.click();
    await page.waitForURL('**/compte/?vue=diffusion');
    await page.locator('.diffusion-card').first().waitFor();
    expectSame(N, 'annonces', [
      tidy(await page.locator('.screen-header h1').textContent()),
      await texts(page, '.diffusion-title'),
      await texts(page, '.diffusion-line'),
      await texts(page, '.diffusion-price'),
      await texts(page, '.diffusion-card:first-of-type .diffusion-tool'),
    ], [
      'Outils de diffusion', [SALE.title, RENT.title], ['Lyon 3e · 62 m²', 'Lyon 7e · 24 m²'],
      ['238 000 €', '690 €/mois charges comprises'], ['Lien', 'QR code', 'Texte', 'Affiche'],
    ]);
    await page.waitForFunction(() => [...document.querySelectorAll('.diffusion-thumb img')].every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 8000 })
      .catch(() => problems.push(`${N} : photo de l'annonce non chargée`));
    await shot(page, 'diffusion-ordinateur.png');

    const card = page.locator('.diffusion-card').first();
    // Lien : sans partage du navigateur (ordinateur), il est copié.
    await card.getByRole('button', { name: 'Lien' }).click();
    await page.locator('.account-toast').waitFor({ timeout: 3000 }).catch(() => undefined);
    expectSame(N, 'lien copié', [
      tidy(await page.locator('.account-toast').textContent().catch(() => null)),
      await page.evaluate(() => navigator.clipboard.readText()),
    ], ['Lien copié', `${base}/annonce/?id=${SALE.id}`]);

    // QR code : le dessin, l'adresse publique, et le PNG.
    await card.getByRole('button', { name: 'QR code' }).click();
    const qr = dialog(page);
    expectSame(N, 'fenêtre du QR code', [
      tidy(await qr.locator('h2').textContent()),
      tidy(await qr.locator('.diffusion-qr-url').textContent()),
      await qr.locator('svg.diffusion-qr').getAttribute('viewBox'),
    ], ['QR code de l\'annonce', `https://nidalo.fr/annonce/?id=${SALE.id}`, '0 0 45 45']);
    const [download] = await Promise.all([page.waitForEvent('download'), qr.getByRole('button', { name: 'Télécharger le QR code' }).click()]);
    const pngPath = join(out, 'diffusion-qr.png');
    await download.saveAs(pngPath);
    const png = await readFile(pngPath);
    expectSame(N, 'QR code téléchargé', [download.suggestedFilename(), png.subarray(1, 4).toString('latin1'), png.readUInt32BE(16), png.readUInt32BE(20)],
      ['nidalo-qr-appartement-lumineux-avec-balcon.png', 'PNG', 990, 990]);
    await qr.getByRole('button', { name: 'Fermer' }).click();

    // Texte : celui de « Partager », puis l'adresse publique ; copié.
    await card.getByRole('button', { name: 'Texte' }).click();
    const wanted = ['Appartement lumineux avec balcon · Lyon 3e (69003)', '238 000 € · 62 m² · 3 pièces', 'À voir sur Nidalo', `https://nidalo.fr/annonce/?id=${SALE.id}`].join('\n');
    const shown = await dialog(page).locator('textarea').inputValue();
    expectSame(N, 'texte', shown.replace(/[\u202f\u00a0]/g, ' '), wanted);
    await shot(page, 'diffusion-texte.png');
    await dialog(page).getByRole('button', { name: 'Copier le texte' }).click();
    await page.waitForFunction(() => document.querySelector('.account-toast')?.textContent?.includes('Texte copié'), null, { timeout: 3000 })
      .catch(() => problems.push(`${N} : pas de message « Texte copié »`));
    expectSame(N, 'texte copié', (await page.evaluate(() => navigator.clipboard.readText())) === shown, true);

    // Affiche : nouvel onglet, A4, une seule page en PDF.
    const poster = card.getByRole('link', { name: 'Affiche' });
    expectSame(N, 'lien de l\'affiche', [await poster.getAttribute('href'), await poster.getAttribute('target')], [`/compte/?vue=affiche&annonce=${SALE.id}`, '_blank']);
    const [tab] = await Promise.all([context.waitForEvent('page'), poster.click()]);
    await tab.waitForLoadState('networkidle');
    await tab.locator('.poster').waitFor();
    await tab.waitForFunction(() => [...document.querySelectorAll('.poster img')].every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 8000 })
      .catch(() => problems.push(`${N} : images de l'affiche non chargées`));
    expectSame(N, 'affiche', {
      band: tidy(await tab.locator('.poster-band').textContent()),
      title: tidy(await tab.locator('.poster-title').textContent()),
      place: tidy(await tab.locator('.poster-place').textContent()),
      price: tidy(await tab.locator('.poster-price').textContent()),
      facts: tidy(await tab.locator('.poster-facts').textContent()),
      energy: await texts(tab, '.poster-chip'),
      small: await texts(tab, '.poster-small'),
      agency: await texts(tab, '.poster-agency-text > *'),
      qr: await tab.locator('.poster-qr-code').getAttribute('aria-label'),
    }, {
      band: 'À vendre', title: SALE.title, place: 'Lyon 3e (69003)', price: '238 000 €', facts: '62 m² · 3 pièces',
      energy: ['DPEC', 'GESC'],
      small: ['Consommation : 160 kWh/m²/an', 'Dépenses d\'énergie estimées entre 820 € et 1 150 € par an.', 'Honoraires : 9 500 € à la charge de l\'acquéreur'],
      agency: ['Rhône Immobilier', 'Lyon (69006)', '04 78 12 34 56', 'contact@rhone-immobilier.fr'], qr: 'QR code de l\'annonce',
    });
    await shot(tab, 'diffusion-affiche-ecran.png');
    const pdf = await tab.pdf({ preferCSSPageSize: true, printBackground: true });
    await writeFile(join(out, 'diffusion-affiche.pdf'), pdf);
    expectSame(N, 'pages du PDF', pdfPages(pdf), 1);
    await tab.emulateMedia({ media: 'print' });
    expectSame(N, 'impression', await tab.evaluate(() => [
      getComputedStyle(document.querySelector('.poster-toolbar')).display,
      [...document.querySelectorAll('.dtop, .topbar, .dfoot, .footer, .tabbar')].every((el) => getComputedStyle(el).display === 'none'),
      Math.round(document.querySelector('.poster').getBoundingClientRect().width / 96 * 25.4),
    ]), ['none', true, 210]);
    expectSame(N, 'écritures', writeNames(writesSince(state, 0)), []);
    await context.close();
  }

  // 7. Téléphone : la même page ; sans annonce en ligne, un message ; l'affiche d'un brouillon n'existe pas.
  {
    const N = 'outils de diffusion (téléphone)';
    const state = newState({ pro: true, listings: [SALE, RENT] });
    const context = await phone();
    await mock(context, state);
    const page = await open(context, '/compte/?vue=diffusion', N);
    await page.locator('.diffusion-card').first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.diffusion-thumb img')].every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 8000 })
      .catch(() => undefined);
    await shot(page, 'diffusion-telephone.png');
    await page.locator('.diffusion-card').first().getByRole('button', { name: 'QR code' }).click();
    await dialog(page).locator('svg.diffusion-qr').waitFor();
    await shot(page, 'diffusion-telephone-qr.png');
    await context.close();

    const emptyState = newState({ pro: true, listings: [DRAFT] });
    const emptyContext = await phone();
    await mock(emptyContext, emptyState);
    const empty = await open(emptyContext, '/compte/?vue=diffusion', N);
    await empty.locator('.account-empty').waitFor();
    expectSame(N, 'sans annonce en ligne', [tidy(await empty.locator('.account-empty h2').textContent()), await empty.locator('.diffusion-card').count()],
      ['Aucune annonce en ligne', 0]);
    await empty.goto(`${base}/compte/?vue=affiche&annonce=${DRAFT.id}`, { waitUntil: 'networkidle' });
    await empty.locator('.account-empty').waitFor();
    expectSame(N, 'affiche d\'un brouillon', [tidy(await empty.locator('.account-empty h2').textContent()), await empty.locator('.poster').count()],
      ['Affiche indisponible', 0]);
    await emptyContext.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error(`${problems.length} problème(s) :\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Espace pro : tout est bon. Captures dans ${out}`);
