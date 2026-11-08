// Vérification de « Continuer avec Google » dans Chromium, sans réseau : Supabase et Google sont simulés. Le départ
// vers Google doit viser l'adresse de retour déclarée dans Supabase (https://nidalo.fr/compte/, exactement) avec un
// défi PKCE ; au retour, Mon compte échange le code (même vérificateur que le défi), nettoie l'adresse, fait choisir
// son profil à un compte tout neuf et ramène un compte existant sur la page d'où il était parti. Google annulé ou
// code refusé : un message clair. Apple garde « Bientôt disponible ». Un lien d'e-mail marche toujours comme avant.
// Lancer après la construction : node scripts/check-google.mjs [dossier construit, docs/ par défaut]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const root = resolve(fileURLToPath(import.meta.url), '../..');
const docs = resolve(process.argv[2] ?? join(root, 'docs'));

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

const SUPABASE = 'https://izzsoitqtzzswkpvdozd.supabase.co';
const STORAGE_KEY = 'sb-izzsoitqtzzswkpvdozd-auth-token';
const RETURN_URL = 'https://nidalo.fr/compte/';
const GOOGLE_MESSAGE = 'La connexion avec Google n\'a pas abouti. Réessayez, ou connectez-vous avec votre adresse e-mail.';
const APPLE_MESSAGE = 'La connexion avec Apple arrivera dans une prochaine version. En attendant, connectez-vous avec votre adresse e-mail.';
const USER_ID = 'a0000000-0000-4000-8000-0000000000c2';
const USER_EMAIL = 'claire.martin@exemple.fr';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
const empty = (route, status = 204) => route.fulfill({ status, headers: cors, body: '' });

const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); };

/** Compte de test : `fresh` = créé par Google à l'instant ; sinon un compte par e-mail d'octobre, relié à Google. */
function user(fresh) {
  const now = new Date();
  const created = fresh ? new Date(now.getTime() - 3000).toISOString() : '2026-10-01T08:00:00Z';
  return {
    id: USER_ID, aud: 'authenticated', role: 'authenticated', email: USER_EMAIL, email_confirmed_at: created,
    app_metadata: fresh ? { provider: 'google', providers: ['google'] } : { provider: 'email', providers: ['email', 'google'] },
    user_metadata: fresh ? { full_name: 'Claire Martin', email: USER_EMAIL, email_verified: true } : {},
    created_at: created, last_sign_in_at: now.toISOString(),
  };
}

function session(fresh) {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const access = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, email: USER_EMAIL, role: 'authenticated', aud: 'authenticated', exp: now + 7200, iat: now })}.c2lnbmF0dXJl`;
  return { access_token: access, token_type: 'bearer', expires_in: 7200, expires_at: now + 7200, refresh_token: 'jeton-de-test', user: user(fresh) };
}

/**
 * Serveur simulé pour un scénario. `google` : où Google renvoie après le départ (`code` ou `error`) ; `fresh` : le
 * compte rendu à l'échange ; `refuse` : code d'erreur de l'échange.
 */
async function mock(context, { google = { code: 'code-google' }, fresh = false, refuse = null } = {}) {
  const state = { authorize: [], exchanges: [], writes: [], profileType: 'individual', signedIn: false };
  await context.route(`${SUPABASE}/auth/v1/**`, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/authorize')) {
      state.authorize.push(url);
      const back = new URL(`${base}/compte/`);
      for (const [key, value] of Object.entries(google)) back.searchParams.set(key, value);
      // Supabase → Google → Supabase → le site : ici directement le retour, sur le site de test.
      return route.fulfill({ status: 302, headers: { location: back.toString() } });
    }
    if (request.method() === 'OPTIONS') return empty(route, 200);
    if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'pkce') {
      let body = {};
      try { body = request.postDataJSON(); } catch { body = {}; }
      state.exchanges.push(body);
      if (refuse) return json(route, { code: 400, error_code: refuse, msg: 'refusé' }, 400);
      state.signedIn = true;
      return json(route, session(fresh));
    }
    if (url.pathname.endsWith('/logout')) return empty(route);
    if (!state.signedIn) return json(route, { code: 'no_authorization', message: 'Pas de session' }, 401);
    if (url.pathname.endsWith('/user')) return json(route, user(fresh));
    return json(route, session(fresh));
  });
  await context.route(`${SUPABASE}/rest/v1/**`, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.replace('/rest/v1/', '');
    const single = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    if (request.method() === 'OPTIONS') return empty(route, 200);
    if (request.method() !== 'GET' && request.method() !== 'HEAD') {
      let body = null;
      try { body = request.postDataJSON(); } catch { body = request.postData(); }
      state.writes.push({ method: request.method(), table, body });
      if (table === 'profiles' && body?.account_type) state.profileType = body.account_type;
      return request.method() === 'POST' && table.startsWith('rpc/') ? json(route, []) : empty(route);
    }
    const rows = {
      profiles: [{
        id: USER_ID, display_name: 'claire.martin', avatar_path: null, account_type: state.profileType, professional_profile_id: null,
        created_at: '2026-10-01T08:00:00Z', shows_full_name: false, findable_by_phone: false,
      }],
      profile_details: [{
        user_id: USER_ID, first_name: null, last_name: null, birth_date: null, phone: null, street: null, postal_code: null, city: null,
        insee_code: null, country_code: 'FR', professional_situation: null,
      }],
    }[table] ?? [];
    if (single) return rows.length === 1 ? json(route, rows[0]) : json(route, { code: 'PGRST116', message: 'no rows' }, 406);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { ...cors, 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` }, body: JSON.stringify(rows) });
  });
  await context.route(`${SUPABASE}/storage/v1/**`, (route) => empty(route, 404));
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
  return state;
}

async function open(context, path, name, { expectedErrors = 0 } = {}) {
  const page = await context.newPage();
  let tolerated = expectedErrors;
  page.on('console', (msg) => {
    const text = msg.text();
    if (tolerated > 0 && /status of (400|401|406)/.test(text)) { tolerated -= 1; return; }
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

const storageValue = (page, key) => page.evaluate((k) => window.localStorage.getItem(k), key);
const tidy = (text) => (text ?? '').replace(/[\s  ]+/g, ' ').trim();

/** Le départ vers Google : l'adresse de retour exacte et un défi PKCE qui correspond au vérificateur envoyé ensuite. */
function checkDeparture(name, state) {
  check(state.authorize.length === 1, `${name} : ${state.authorize.length} départ(s) vers Google au lieu d'un`);
  const url = state.authorize[0];
  if (!url) return;
  const params = url.searchParams;
  check(params.get('provider') === 'google', `${name} : provider ${params.get('provider')}`);
  check(params.get('redirect_to') === RETURN_URL, `${name} : retour ${params.get('redirect_to')} au lieu de ${RETURN_URL}`);
  check(params.get('code_challenge_method') === 's256', `${name} : méthode PKCE ${params.get('code_challenge_method')}`);
  check(!params.has('scopes') && !params.has('skip_http_redirect'), `${name} : paramètres en trop ${url.search}`);
  const exchange = state.exchanges[0];
  if (exchange) {
    const challenge = createHash('sha256').update(exchange.code_verifier ?? '').digest('base64url');
    check(challenge === params.get('code_challenge'), `${name} : le vérificateur PKCE ne correspond pas au défi`);
  }
}

const browser = await chromium.launch();
try {
  // 1. Téléphone, Mon compte, compte tout neuf : départ, retour, choix du profil, puis l'espace du compte.
  {
    const name = 'nouveau compte (téléphone)';
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    const state = await mock(context, { fresh: true });
    const page = await open(context, '/compte/', name);
    await page.locator('.signin-card .provider-google').click();
    await page.getByRole('heading', { name: 'Quel est votre profil ?' }).waitFor({ timeout: 8000 })
      .catch(async () => problems.push(`${name} : « Quel est votre profil ? » absent (${page.url()} ; ${tidy(await page.locator('main').textContent().catch(() => '')).slice(0, 300)} ; échanges ${state.exchanges.length} ; départs ${state.authorize.length})`));
    checkDeparture(name, state);
    check(state.exchanges[0]?.auth_code === 'code-google', `${name} : code échangé ${state.exchanges[0]?.auth_code}`);
    const address = new URL(page.url());
    check(address.pathname === '/compte/' && address.search === '', `${name} : adresse ${address.pathname}${address.search} après le retour`);
    check(await storageValue(page, 'nidalo.googleReturn') === null, `${name} : marque du départ vers Google restée`);
    await page.getByRole('radio', { name: /Professionnel/ }).click();
    await page.getByRole('button', { name: /Continuer/ }).click();
    await page.getByRole('heading', { name: 'Quel est votre profil ?' }).waitFor({ state: 'detached', timeout: 8000 })
      .catch(() => problems.push(`${name} : le choix du profil ne se ferme pas`));
    const written = state.writes.filter((w) => w.table === 'profiles').map((w) => w.body?.account_type);
    check(written.join() === 'professional', `${name} : type écrit ${JSON.stringify(written)}`);
    check(await storageValue(page, 'nidalo.newAccount') === null, `${name} : compte encore « tout neuf » après le choix`);
    await context.close();
  }

  // 2. Ordinateur, Favoris, compte existant : retour sur Favoris, connecté, sans choix du profil.
  {
    const name = 'compte existant (ordinateur)';
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const state = await mock(context, { fresh: false });
    const page = await open(context, '/favoris/', name);
    await page.locator('.signin-card .provider-google').click();
    await page.waitForURL((url) => url.pathname === '/favoris/' && state.exchanges.length === 1, { timeout: 8000 })
      .catch(() => problems.push(`${name} : pas de retour sur Favoris (${page.url()})`));
    await page.waitForLoadState('networkidle');
    checkDeparture(name, state);
    check(await page.locator('.signin-card').count() === 0, `${name} : la carte de connexion est encore affichée sur Favoris`);
    check(await page.getByRole('heading', { name: 'Quel est votre profil ?' }).count() === 0, `${name} : choix du profil pour un compte existant`);
    check(await storageValue(page, 'nidalo.newAccount') === null, `${name} : compte existant marqué « tout neuf »`);
    check(await storageValue(page, STORAGE_KEY) !== null, `${name} : session absente après le retour`);
    const writes = state.writes.filter((w) => !w.table.startsWith('rpc/'));
    check(writes.length === 0, `${name} : écritures inattendues ${JSON.stringify(writes)}`);
    await context.close();
  }

  // 3. Google annulé (« Annuler » sur la page de Google) : message de Google, adresse nettoyée, aucun échange.
  {
    const name = 'Google annulé';
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const state = await mock(context, { google: { error: 'access_denied', error_code: 'access_denied', error_description: 'The user denied access' } });
    const page = await open(context, '/compte/', name);
    await page.locator('.signin-card .provider-google').click();
    await page.locator('.signin-card .signin-error').waitFor({ timeout: 8000 }).catch(() => {});
    check(tidy(await page.locator('.signin-card .signin-error').textContent().catch(() => null)) === GOOGLE_MESSAGE, `${name} : message « ${tidy(await page.locator('.signin-error').textContent().catch(() => ''))} »`);
    check(new URL(page.url()).search === '', `${name} : adresse non nettoyée ${new URL(page.url()).search}`);
    check(state.exchanges.length === 0, `${name} : échange de code sans code`);
    await context.close();
  }

  // 4. Code refusé par Supabase au retour : message de Google, pas celui des e-mails.
  {
    const name = 'code refusé';
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    await mock(context, { refuse: 'flow_state_not_found' });
    const page = await open(context, '/compte/', name, { expectedErrors: 1 });
    await page.locator('.signin-card .provider-google').click();
    await page.locator('.signin-card .signin-error').waitFor({ timeout: 8000 }).catch(() => {});
    check(tidy(await page.locator('.signin-card .signin-error').textContent().catch(() => null)) === GOOGLE_MESSAGE, `${name} : message « ${tidy(await page.locator('.signin-error').textContent().catch(() => ''))} »`);
    await context.close();
  }

  // 5. Apple : toujours « Bientôt disponible », sans départ ; le bouton Google ne part qu'au clic.
  {
    const name = 'Apple';
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    const state = await mock(context);
    const page = await open(context, '/compte/', name);
    await page.locator('.signin-card .provider-apple').click();
    const dialog = page.locator('.alert-dialog');
    await dialog.waitFor({ timeout: 4000 }).catch(() => problems.push(`${name} : pas de fenêtre « Bientôt disponible »`));
    const text = tidy(await dialog.textContent().catch(() => ''));
    check(text.includes('Bientôt disponible') && text.includes(APPLE_MESSAGE), `${name} : fenêtre « ${text} »`);
    await page.getByRole('button', { name: 'J\'ai compris' }).click();
    check(state.authorize.length === 0, `${name} : départ vers Google sans clic sur Google`);
    check(tidy(await page.locator('.signin-card .provider-google').textContent()) === 'Continuer avec Google', `${name} : bouton Google « ${tidy(await page.locator('.provider-google').textContent())} »`);
    await context.close();
  }

  // 6. Lien d'un e-mail de création de compte, sans Google : choix du profil comme avant ; lien expiré : message des e-mails.
  {
    const name = 'lien d\'e-mail';
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    const state = await mock(context, { fresh: false });
    await context.addInitScript((key) => {
      if (window.location.search.includes('code=lien-mail')) {
        localStorage.setItem(`${key}-code-verifier`, JSON.stringify('verificateur-du-mail'));
        localStorage.setItem('nidalo.authPendingLink', 'signup');
        localStorage.setItem('nidalo.newAccount', '1');
      }
    }, STORAGE_KEY);
    const page = await open(context, '/compte/?code=lien-mail', name);
    await page.getByRole('heading', { name: 'Quel est votre profil ?' }).waitFor({ timeout: 8000 })
      .catch(() => problems.push(`${name} : « Quel est votre profil ? » absent après le lien`));
    check(state.exchanges[0]?.auth_code === 'lien-mail' && state.exchanges[0]?.code_verifier === 'verificateur-du-mail', `${name} : échange ${JSON.stringify(state.exchanges[0])}`);
    check(new URL(page.url()).search === '', `${name} : adresse non nettoyée`);
    await context.close();

    const expired = await browser.newContext({ ...devices['iPhone 13'] });
    await mock(expired);
    const page2 = await open(expired, '/compte/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', `${name} expiré`);
    await page2.locator('.signin-card .signin-error').waitFor({ timeout: 8000 }).catch(() => {});
    const message = tidy(await page2.locator('.signin-card .signin-error').textContent().catch(() => null));
    check(message === 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.', `${name} expiré : message « ${message} »`);
    await expired.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.log(`check-google : ${problems.length} problème(s)`);
  for (const problem of problems) console.log(`- ${problem}`);
  process.exit(1);
}
console.log('check-google : connexion avec Google OK (6 scénarios : nouveau compte, compte existant, annulation, code refusé, Apple, lien d\'e-mail)');
