// Vérification de la modération (15 novembre 2026) dans Chromium, sans réseau : Supabase est simulé.
// Signalements : la ligne « Signalements » de Mon compte n'apparaît que pour un compte modérateur (téléphone et
// ordinateur) ; la page montre les signalements à traiter (le plus ancien d'abord, « Plus de 24 h » quand il le faut),
// ce qui a été signalé et la personne visée ; chaque geste demande une confirmation, puis appelle moderation_resolve
// avec les bons arguments (dans un groupe, le membre choisi) ; un refus du serveur s'affiche en français ; « Traités »
// montre le dernier geste et « Lever la suspension ». Un compte qui n'est pas modérateur voit « Page réservée ».
// Filtre de mots interdits : Mes informations et la messagerie montrent le message du serveur, sans rien perdre.
// Suppression d'un compte « Continuer avec Apple » : la phrase pour couper le lien avec Apple ; rien pour les autres.
// Conditions d'utilisation : la phrase de la modération et la date du 15 novembre 2026.
// Captures pour Romain : signalements-*.png, moncompte-*.png, supprimer-apple-telephone.png, conditions-telephone.png.
// Lancer après la construction : node scripts/check-signalements.mjs [dossier construit, docs/ par défaut] [dossier des captures]
// « --avant » : seulement les captures des écrans qui existaient déjà (Mon compte, suppression, conditions), sur l'ancien site.
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
const USER_ID = 'a0000000-0000-4000-8000-0000000000c3';
const USER_EMAIL = 'claire.martin@exemple.fr';
const PAUL = 'ad111111-1111-4111-8111-111111111111';
const SAMI = 'ad222222-2222-4222-8222-222222222222';
const KARIM = 'ad333333-3333-4333-8333-333333333333';
const NOE = 'ad444444-4444-4444-8444-444444444444';
const OTHER = 'ad555555-5555-4555-8555-555555555555';
const CONVERSATION = 'f0000000-0000-4000-8000-0000000000e1';
const BANNED = { code: 'P0001', message: 'Ce texte contient un mot interdit. Modifiez-le pour continuer.', details: null, hint: 'contenu_interdit' };
const RESERVED = { code: 'P0001', message: 'Cette page est réservée à la modération de Nidalo.', details: null, hint: 'moderation_reservee' };

const PROFILE = {
  id: USER_ID, display_name: 'Claire Martin', avatar_path: null, account_type: 'individual', professional_profile_id: null,
  created_at: '2026-10-01T08:00:00Z', shows_full_name: false, findable_by_phone: false,
};
const DETAILS = {
  user_id: USER_ID, first_name: 'Claire', last_name: 'Martin', birth_date: null, phone: '0639981234', street: null,
  postal_code: '69003', city: 'Lyon', insee_code: '69383', country_code: 'FR', professional_situation: 'employee',
};

const HOUR = 3_600_000;
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString();
const R_LISTING = 'e0000000-0000-4000-8000-000000000001';
const R_MESSAGE = 'e0000000-0000-4000-8000-000000000002';
const R_USER = 'e0000000-0000-4000-8000-000000000003';
const R_GROUP = 'e0000000-0000-4000-8000-000000000004';
const R_OLD = 'e0000000-0000-4000-8000-000000000005';
const report = (over) => ({
  status: 'open', details: null, target_snapshot: null, reporter_name: 'Lina R.', person_id: null, person_name: null,
  person_suspended: false, listing_status: null, listing_locked: false, message_exists: false, names: {}, last_action: null,
  last_action_at: null, ...over,
});
/** Signalements du serveur simulé : quatre à traiter (annonce, message, compte, groupe), un déjà classé. */
function reports() {
  return [
    report({
      id: R_LISTING, created_at: ago(26), target_type: 'listing', target_id: 'b0000000-0000-4000-8000-0000000000f1', reason: 'scam',
      details: 'Il demande un virement avant la visite.', person_id: PAUL, person_name: 'Paul M.', listing_status: 'active',
      target_snapshot: {
        owner_id: PAUL, status: 'active', title: 'Appartement T3 lumineux – Annecy', price: 289000, city: 'Annecy',
        description: 'Bel appartement de 68 m² au calme, balcon plein sud, cave et parking. Disponible tout de suite.',
      },
    }),
    report({
      id: R_MESSAGE, created_at: ago(3), target_type: 'message', target_id: 'c0000000-0000-4000-8000-0000000000a1', reason: 'harassment',
      reporter_name: 'Sami H.', person_id: KARIM, person_name: 'Karim B.', message_exists: true,
      target_snapshot: { sender_id: KARIM, kind: 'text', content: { text: { _0: 'Réponds-moi tout de suite ou tu vas le regretter.' } } },
    }),
    report({
      id: R_USER, created_at: ago(1), target_type: 'user', target_id: NOE, reason: 'impersonation',
      details: 'Se présente comme l\'agence Rhône Immobilier.', person_id: NOE, person_name: 'Noé F.',
    }),
    report({
      id: R_GROUP, created_at: ago(0.5), target_type: 'conversation', target_id: 'c0000000-0000-4000-8000-0000000000b1', reason: 'spam',
      reporter_name: 'Sami H.', names: { [PAUL]: 'Paul M.', [SAMI]: 'Sami H.' },
      target_snapshot: [
        { id: 'm1', sender_id: PAUL, created_at: ago(2), preview: 'Gagnez 500 € par jour, lien en message privé' },
        { id: 'm2', sender_id: SAMI, created_at: ago(1.5), preview: 'Merci de ne pas spammer le groupe' },
      ],
    }),
    report({
      id: R_OLD, created_at: ago(50), status: 'dismissed', target_type: 'listing', target_id: 'b0000000-0000-4000-8000-0000000000f2',
      reason: 'misleadingListing', person_id: OTHER, person_name: 'Julie T.', listing_status: 'active', last_action: 'dismiss',
      last_action_at: ago(40), target_snapshot: { title: 'Maison 5 pièces – Rumilly', price: 415000, city: 'Rumilly' },
    }),
  ];
}

/** `moderator` : le compte connecté est modérateur ; `apple` : compte créé par « Continuer avec Apple ». */
function newState({ moderator = true } = {}) {
  return {
    moderator,
    profile: { ...PROFILE },
    details: { ...DETAILS },
    reports: reports(),
    suspended: new Set(),
    calls: [],
    /** Prochain geste refusé par le serveur (une fois), par geste. */
    refuse: {},
    messages: [
      {
        id: 'c0000000-0000-4000-8000-0000000000d1', conversation_id: CONVERSATION, sender_id: OTHER, kind: 'text',
        client_id: 'c0000000-0000-4000-8000-0000000000d1', content: { text: { _0: 'Bonjour, la maison est-elle disponible ?' } },
        created_at: ago(5), expires_at: null, message_reactions: [], preview: 'Bonjour, la maison est-elle disponible ?',
      },
      {
        id: 'c0000000-0000-4000-8000-0000000000d2', conversation_id: CONVERSATION, sender_id: USER_ID, kind: 'text',
        client_id: 'c0000000-0000-4000-8000-0000000000d2', content: { text: { _0: 'Oui, toujours.' } },
        created_at: ago(4), expires_at: null, message_reactions: [], preview: 'Oui, toujours.',
      },
    ],
  };
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
const empty = (route, status = 204) => route.fulfill({ status, headers: cors, body: '' });

const problems = [];
let expectedServerErrors = 0;
const refuse = (route, error) => {
  expectedServerErrors += 1;
  return json(route, error, 400);
};

function fakeSession(apple = false) {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: USER_ID, aud: 'authenticated', role: 'authenticated', email: USER_EMAIL, email_confirmed_at: '2026-10-01T08:00:00Z',
    app_metadata: apple ? { provider: 'apple', providers: ['apple'] } : { provider: 'email', providers: ['email'] },
    user_metadata: {}, created_at: '2026-10-01T08:00:00Z', last_sign_in_at: '2026-11-15T08:00:00Z',
  };
  const access = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, email: USER_EMAIL, role: 'authenticated', aud: 'authenticated', exp: now + 7200, iat: now })}.c2lnbmF0dXJl`;
  return { access_token: access, token_type: 'bearer', expires_in: 7200, expires_at: now + 7200, refresh_token: 'jeton-de-test', user };
}

/** Ligne de moderation_reports avec l'état actuel du serveur simulé (personne suspendue). */
const shown = (state, row) => ({ ...row, person_suspended: row.person_id !== null && state.suspended.has(row.person_id) });

function resolveReport(state, route, body) {
  const row = state.reports.find((item) => item.id === body.p_report_id);
  const action = body.p_action;
  if (!row) return refuse(route, { code: 'P0001', message: 'Ce signalement n\'existe plus.', details: null, hint: 'moderation_cible_absente' });
  if (state.refuse[action]) {
    const error = state.refuse[action];
    delete state.refuse[action];
    // Le contenu a disparu entre-temps : le serveur le dit, la page relit la liste.
    if (action === 'delete_message') row.message_exists = false;
    return refuse(route, error);
  }
  const now = new Date().toISOString();
  const done = (status) => {
    row.last_action = action;
    row.last_action_at = now;
    if (status) row.status = status;
    return json(route, row.status);
  };
  switch (action) {
    case 'dismiss':
      return done('dismissed');
    case 'remove_listing':
      row.listing_status = 'archived';
      row.listing_locked = true;
      return done('reviewed');
    case 'delete_message':
      row.message_exists = false;
      return done('reviewed');
    case 'suspend_user':
    case 'unsuspend_user': {
      const person = body.p_user_id ?? row.person_id;
      if (!person) return refuse(route, { code: 'P0001', message: 'Choisissez le compte à suspendre.', details: null, hint: 'moderation_geste_invalide' });
      if (action === 'suspend_user') state.suspended.add(person);
      else state.suspended.delete(person);
      // Groupe : le membre suspendu devient la personne du signalement (journal du serveur).
      row.person_id = person;
      row.person_name ??= row.names[person] ?? null;
      return done(action === 'suspend_user' ? 'reviewed' : null);
    }
    default:
      return refuse(route, { code: 'P0001', message: 'Ce geste ne correspond pas à ce signalement.', details: null, hint: 'moderation_geste_invalide' });
  }
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
  }
  state.calls.push({ table, method, search: decodeURIComponent(url.search), body });
  switch (table) {
    case 'profiles':
      if (method === 'GET') return single ? json(route, state.profile) : json(route, [state.profile]);
      if (method === 'PATCH') { Object.assign(state.profile, body); return empty(route); }
      break;
    case 'profile_details':
      if (method === 'GET') return json(route, [state.details]);
      if (method === 'PATCH') {
        // Filtre du serveur : le prénom « Pourriture » contient un mot interdit.
        if (/pourriture/i.test(body?.first_name ?? '')) return refuse(route, BANNED);
        Object.assign(state.details, body);
        return empty(route);
      }
      break;
    case 'rpc/is_moderator':
      return json(route, state.moderator);
    case 'rpc/moderation_reports': {
      if (!state.moderator) return refuse(route, RESERVED);
      const closed = body?.p_closed === true;
      const rows = state.reports.filter((row) => (row.status === 'open') !== closed)
        .sort((a, b) => (closed ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at)));
      return json(route, rows.map((row) => shown(state, row)));
    }
    case 'rpc/moderation_resolve':
      if (!state.moderator) return refuse(route, RESERVED);
      return resolveReport(state, route, body ?? {});
    // Messagerie : une conversation à deux, avec un message de chaque côté.
    case 'rpc/my_conversations':
      return json(route, [{
        conversation_id: CONVERSATION, kind: 'direct', listing_id: null, listing_snapshot: null, buyer_id: USER_ID, seller_id: OTHER,
        group_name: null, group_details: null, group_image_path: null, group_purpose: null, ephemeral_seconds: null, created_by: USER_ID,
        created_at: ago(6), my_role: 'member', joined_at: ago(6), left_at: null, last_read_at: ago(4), is_archived: false, is_favorite: false,
        muted_until: null, saves_photos: false, cleared_at: null, other_user_id: OTHER, other_last_read_at: ago(4), member_count: 2,
        unread_count: 0, last_message_id: state.messages.at(-1).id, last_message_sender_id: USER_ID, last_message_kind: 'text',
        last_message_content: state.messages.at(-1).content, last_message_preview: state.messages.at(-1).preview,
        last_message_at: state.messages.at(-1).created_at,
      }]);
    case 'conversation_participants':
      return json(route, [
        { conversation_id: CONVERSATION, user_id: USER_ID, role: 'member', left_at: null, last_read_at: ago(4) },
        { conversation_id: CONVERSATION, user_id: OTHER, role: 'member', left_at: null, last_read_at: ago(4) },
      ]);
    case 'rpc/public_profiles':
      return json(route, [{
        user_id: OTHER, public_name: 'Julie T.', avatar_path: null, account_type: 'individual', member_since: '2026-01-15', agency_id: null,
        agency_name: null, agency_logo_path: null, agency_postal_code: null, agency_city: null, agency_phone: null,
      }].filter((row) => (body?.user_ids ?? []).map((id) => String(id).toLowerCase()).includes(row.user_id)));
    case 'messages': {
      if (method === 'POST') {
        if (/pourriture/i.test(JSON.stringify(body?.content ?? {}))) return refuse(route, BANNED);
        const row = {
          id: String(body.id).toLowerCase(), conversation_id: CONVERSATION, sender_id: USER_ID, kind: Object.keys(body.content ?? {})[0] ?? 'text',
          client_id: String(body.client_id).toLowerCase(), content: body.content, created_at: new Date().toISOString(), expires_at: null,
          message_reactions: [], preview: body.preview,
        };
        state.messages.push(row);
        const { preview, ...columns } = row;
        return json(route, single ? columns : [columns], 201);
      }
      return json(route, [...state.messages].reverse().map(({ preview, ...columns }) => columns));
    }
    default:
      break;
  }
  // Le reste (annonces, recherches, projet, agenda, notifications…) : vide.
  if (method === 'GET') return json(route, []);
  if (table.startsWith('rpc/')) return json(route, []);
  return empty(route, method === 'POST' ? 201 : 204);
}

async function mock(context, state, { apple = false } = {}) {
  const session = JSON.stringify(fakeSession(apple));
  await context.addInitScript((value) => {
    try { localStorage.setItem('sb-izzsoitqtzzswkpvdozd-auth-token', value); } catch { /* stockage indisponible */ }
  }, session);
  await context.route(`${SUPABASE}/auth/v1/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/logout')) return empty(route);
    if (path.endsWith('/user')) return json(route, fakeSession(apple).user);
    return json(route, fakeSession(apple));
  });
  await context.route(`${SUPABASE}/rest/v1/**`, (route) => rest(state, route));
  await context.route(`${SUPABASE}/storage/v1/**`, (route) => json(route, []));
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
/** Textes des éléments `selector` d'une page ou d'un élément (Locator). */
const texts = (scope, selector) => scope.locator(selector)
  .evaluateAll((els) => els.map((el) => el.textContent.replace(/[\s  ]+/g, ' ').trim()));
const rpcCalls = (state, name, mark = 0) => state.calls.slice(mark).filter((call) => call.table === `rpc/${name}`);

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
  await page.goto(base + path, { waitUntil: 'networkidle' });
  return page;
}

/** Capture de toute la page (la fenêtre prend la hauteur de la page). */
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

const openDialog = (page) => page.locator('dialog[open]');
/** Titres des cartes de signalement : type et motif. */
const cardTitles = (page) => page.$$eval('.dsc-report', (els) => els.map((el) => [
  el.querySelector('.dsc-report-type')?.textContent ?? '', el.querySelector('.dsc-report-reason')?.textContent ?? '',
].join(' · ')));
const card = (page, reason) => page.locator('.dsc-report').filter({ has: page.locator('.dsc-report-reason', { hasText: reason }) });
async function waitCards(page, count, name) {
  await page.waitForFunction((n) => document.querySelectorAll('.dsc-report').length === n && !document.querySelector('.account-spinner'), count, { timeout: 8000 })
    .catch(() => problems.push(`${name} : ${count} carte(s) attendue(s)`));
}
/** Un geste : le bouton de la carte, la fenêtre (son titre), puis « Annuler » ou le bouton rouge / bleu. */
async function act(page, reason, label, name, { cancel = false } = {}) {
  await card(page, reason).getByRole('button', { name: label, exact: true }).click();
  await openDialog(page).waitFor({ timeout: 8000 });
  const title = tidy(await openDialog(page).locator('h2').textContent());
  const tone = await openDialog(page).getByRole('button', { name: label, exact: true }).getAttribute('class');
  await openDialog(page).getByRole('button', { name: cancel ? 'Annuler' : label, exact: true }).click();
  await page.waitForSelector('dialog[open]', { state: 'detached', timeout: 8000 }).catch(() => problems.push(`${name} : la fenêtre reste ouverte`));
  return { title, danger: (tone ?? '').includes('btn-danger') };
}

// MARK: - Vérifications

const browser = await chromium.launch();
try {
  const phone = () => browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const desktop = () => browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });

  // 0. Avant / après : Mon compte (téléphone et ordinateur), suppression d'un compte Apple, conditions d'utilisation.
  {
    const state = newState();
    let context = await phone();
    await mock(context, state);
    let page = await open(context, '/compte/', 'Mon compte (téléphone)');
    await page.locator('.app-menu-group').first().waitFor();
    await page.waitForTimeout(300);
    await shot(page, 'moncompte-telephone.png');
    await page.locator('.app-menu-group', { has: page.locator('.app-section-label', { hasText: 'Compte et sécurité' }) })
      .screenshot({ path: join(out, 'moncompte-telephone-section.png') });
    await page.goto(`${base}/conditions/`, { waitUntil: 'networkidle' });
    await shot(page, 'conditions-telephone.png');
    await page.locator('section.card', { has: page.locator('h2', { hasText: /^Signalement$/ }) })
      .screenshot({ path: join(out, 'conditions-signalement.png') });
    await context.close();

    context = await phone();
    await mock(context, newState(), { apple: true });
    page = await open(context, '/compte/?vue=supprimer', 'supprimer (Apple)');
    await page.locator('.delete-card').waitFor();
    await shot(page, 'supprimer-apple-telephone.png');
    // Capture de la carte seule : la barre du bas (fixe) est cachée pour ne pas la couvrir (par le CSSOM, que la
    // politique de sécurité du site laisse passer, contrairement à une balise <style>).
    await page.locator('nav.tabbar').evaluateAll((bars) => bars.forEach((bar) => bar.style.setProperty('display', 'none', 'important')));
    await page.locator('.delete-card').screenshot({ path: join(out, 'supprimer-apple-carte.png') });
    await context.close();

    context = await desktop();
    await mock(context, newState());
    page = await open(context, '/compte/', 'Mon espace (ordinateur)');
    await page.locator('#compte-et-securite').waitFor();
    await page.locator('#compte-et-securite').screenshot({ path: join(out, 'moncompte-ordinateur.png') });
    await context.close();
  }

  if (!before) {
    // 1. Téléphone, compte modérateur : la ligne, la page, les gestes et leurs confirmations.
    {
      const N = 'signalements (téléphone)';
      const state = newState();
      const context = await phone();
      await mock(context, state);
      const page = await open(context, '/compte/', N);
      await page.waitForFunction(() => [...document.querySelectorAll('.app-row-title')].some((el) => el.textContent === 'Signalements'), null, { timeout: 8000 })
        .catch(() => problems.push(`${N} : ligne « Signalements » absente`));
      const section = await page.$$eval('.app-menu-group', (els) => {
        const found = els.find((el) => el.querySelector('.app-section-label')?.textContent.includes('Compte et sécurité'));
        return found ? [...found.querySelectorAll('.app-row-title')].map((el) => el.textContent) : [];
      });
      expectSame(N, 'Compte et sécurité', section, ['Connexion et sécurité', 'Confidentialité et données', 'Type de compte', 'Signalements']);
      expectSame(N, 'is_moderator demandé une fois', rpcCalls(state, 'is_moderator').length, 1);
      await page.locator('.app-group a.app-row', { hasText: 'Signalements' }).click();
      await page.waitForURL(/vue=signalements/);
      await waitCards(page, 4, N);
      // En-tête de l'app sur téléphone : titre, bouton rond « Actualiser » (refresh-cw), puis la phrase sous le titre.
      expectSame(N, 'titre', [tidy(await page.locator('.screen-header h1').textContent()),
        await page.locator('.screen-header .app-page-header-trailing button.app-round[aria-label="Actualiser"]').count(),
        tidy(await page.locator('.reports-subtitle').textContent())], ['Signalements', 1, 'Chaque signalement est à traiter sous 24 heures.']);
      expectSame(N, 'onglets', await texts(page, '.dsc-tab'), ['À traiter4', 'Traités']);
      expectSame(N, 'ordre (le plus ancien d\'abord)', await cardTitles(page), [
        'Annonce · Fraude immobilière ou arnaque', 'Message · Harcèlement', 'Compte · Usurpation d\'identité', 'Conversation · Spam',
      ]);
      expectSame(N, 'retard', await page.$$eval('.dsc-report', (els) => els.map((el) => !!el.querySelector('.dsc-report-late'))), [true, false, false, false]);
      const listing = card(page, 'Fraude');
      expectSame(N, 'carte annonce', [
        tidy(await listing.locator('.dsc-report-details').textContent()), tidy(await listing.locator('.dsc-report-title').textContent()),
        tidy(await listing.locator('.dsc-report-line').textContent()), tidy(await listing.locator('.dsc-report-state').textContent()),
        tidy(await listing.locator('.dsc-report-person').textContent()), await texts(listing, '.dsc-report-actions button'),
        await listing.locator('.dsc-report-link').getAttribute('href'),
      ], [
        '« Il demande un virement avant la visite. »', 'Appartement T3 lumineux – Annecy', 'Annecy · 289 000 €', 'En ligneVoir l\'annonce',
        'Paul M.', ['Retirer l\'annonce', 'Suspendre le compte', 'Classer sans suite'], '/annonce/?id=b0000000-0000-4000-8000-0000000000f1',
      ]);
      expectSame(N, 'carte message', [
        tidy(await card(page, 'Harcèlement').locator('.dsc-report-text').textContent()),
        await texts(card(page, 'Harcèlement'), '.dsc-report-actions button'),
      ], ['Réponds-moi tout de suite ou tu vas le regretter.', ['Supprimer le message', 'Suspendre le compte', 'Classer sans suite']]);
      const group = card(page, 'Spam');
      expectSame(N, 'carte groupe', [
        await texts(group, '.dsc-report-thread li'), await texts(group, 'select option'), await texts(group, '.dsc-report-actions button'),
        await group.locator('.dsc-report-person').count(),
      ], [
        ['Paul M. Gagnez 500 € par jour, lien en message privé', 'Sami H. Merci de ne pas spammer le groupe'],
        ['Paul M.', 'Sami H.'], ['Suspendre le compte', 'Classer sans suite'], 0,
      ]);
      await shot(page, 'signalements-telephone.png');

      // Annuler ne fait rien ; « Retirer l'annonce » (rouge) appelle le serveur, puis la liste est relue.
      let mark = state.calls.length;
      expectSame(N, 'annuler', await act(page, 'Fraude', 'Retirer l\'annonce', N, { cancel: true }), { title: 'Retirer cette annonce ?', danger: true });
      expectSame(N, 'annuler : rien d\'appelé', rpcCalls(state, 'moderation_resolve', mark).length, 0);
      await card(page, 'Fraude').getByRole('button', { name: 'Retirer l\'annonce', exact: true }).click();
      await openDialog(page).waitFor();
      await page.screenshot({ path: join(out, 'signalements-confirmation-telephone.png') });
      await openDialog(page).getByRole('button', { name: 'Retirer l\'annonce', exact: true }).click();
      await waitCards(page, 3, `${N} : après le retrait`);
      expectSame(N, 'retrait', rpcCalls(state, 'moderation_resolve', mark).map((call) => call.body),
        [{ p_report_id: R_LISTING, p_action: 'remove_listing', p_user_id: null }]);
      expectSame(N, 'message bref', tidy(await page.locator('.account-toast').textContent().catch(() => null)), 'Annonce retirée');
      expectSame(N, 'onglet relu', await texts(page, '.dsc-tab'), ['À traiter3', 'Traités']);

      // Refus du serveur : le message disparu entre-temps ; l'erreur s'affiche et la carte se met à jour.
      state.refuse.delete_message = { code: 'P0001', message: 'Ce message n\'existe plus.', details: null, hint: 'moderation_cible_absente' };
      await act(page, 'Harcèlement', 'Supprimer le message', N);
      await page.locator('.dsc-report-failure').waitFor({ timeout: 8000 }).catch(() => undefined);
      await page.waitForFunction(() => !document.querySelector('.account-spinner') && document.querySelectorAll('.dsc-report').length === 3, null, { timeout: 8000 }).catch(() => undefined);
      expectSame(N, 'refus du serveur', [
        tidy(await page.locator('.dsc-report-failure').textContent().catch(() => null)),
        tidy(await card(page, 'Harcèlement').locator('.dsc-report-state').textContent().catch(() => null)),
        await texts(card(page, 'Harcèlement'), '.dsc-report-actions button'),
      ], ['Ce message n\'existe plus.', 'Message supprimé', ['Suspendre le compte', 'Classer sans suite']]);

      // Groupe : le membre choisi dans la liste est suspendu.
      mark = state.calls.length;
      await card(page, 'Spam').locator('select').selectOption({ label: 'Sami H.' });
      await card(page, 'Spam').locator('select').selectOption({ label: 'Paul M.' });
      expectSame(N, 'suspendre dans le groupe', await act(page, 'Spam', 'Suspendre le compte', N), { title: 'Suspendre le compte de Paul M. ?', danger: true });
      await waitCards(page, 2, `${N} : après la suspension`);
      expectSame(N, 'suspension', rpcCalls(state, 'moderation_resolve', mark).map((call) => call.body),
        [{ p_report_id: R_GROUP, p_action: 'suspend_user', p_user_id: PAUL }]);
      if (await page.locator('.dsc-report-failure').count()) problems.push(`${N} : l'ancienne erreur reste affichée après un geste réussi`);

      // Classer sans suite (bleu).
      mark = state.calls.length;
      expectSame(N, 'classer', await act(page, 'Usurpation', 'Classer sans suite', N), { title: 'Classer sans suite ?', danger: false });
      await waitCards(page, 1, `${N} : après le classement`);
      expectSame(N, 'classement', rpcCalls(state, 'moderation_resolve', mark).map((call) => call.body),
        [{ p_report_id: R_USER, p_action: 'dismiss', p_user_id: null }]);

      // Traités : le dernier geste de chacun, et « Lever la suspension » pour le membre suspendu.
      await page.getByRole('tab', { name: 'Traités' }).click();
      await waitCards(page, 4, `${N} : traités`);
      expectSame(N, 'traités (le plus récent d\'abord)', await cardTitles(page), [
        'Conversation · Spam', 'Compte · Usurpation d\'identité', 'Annonce · Fraude immobilière ou arnaque', 'Annonce · Annonce trompeuse',
      ]);
      const lines = await texts(page, '.dsc-report-done');
      if (!/^Compte suspendu le \d{1,2} nov\. à \d{2}:\d{2}$/.test(lines[0] ?? '') || !/^Classé sans suite le /.test(lines[1] ?? '')
        || !/^Annonce retirée le /.test(lines[2] ?? '') || !/^Classé sans suite le /.test(lines[3] ?? '')) problems.push(`${N} : lignes « traité » ${JSON.stringify(lines)}`);
      expectSame(N, 'groupe traité', [
        tidy(await card(page, 'Spam').locator('.dsc-report-person').textContent()), await texts(card(page, 'Spam'), '.dsc-report-actions button'),
        await texts(card(page, 'Fraude'), '.dsc-report-actions button'), tidy(await card(page, 'Fraude').locator('.dsc-report-state').textContent()),
        await card(page, 'Fraude').locator('.dsc-report-link').count(),
      ], ['Paul M.Suspendu', ['Lever la suspension'], ['Lever la suspension'], 'Retirée par la modération', 0]);
      await shot(page, 'signalements-traites-telephone.png');
      mark = state.calls.length;
      expectSame(N, 'lever', await act(page, 'Spam', 'Lever la suspension', N), { title: 'Lever la suspension de Paul M. ?', danger: false });
      await page.waitForFunction(() => !document.querySelector('.account-spinner') && document.querySelectorAll('.dsc-report-actions').length === 0, null, { timeout: 8000 })
        .catch(() => problems.push(`${N} : « Lever la suspension » reste affiché`));
      expectSame(N, 'suspension levée', rpcCalls(state, 'moderation_resolve', mark).map((call) => call.body),
        [{ p_report_id: R_GROUP, p_action: 'unsuspend_user', p_user_id: null }]);
      if ((await page.locator('.dsc-report-suspended').count()) !== 0) problems.push(`${N} : « Suspendu » reste affiché`);
      await context.close();
    }

    // 2. Ordinateur, compte modérateur (particulier : Mon espace) : la ligne, puis la page.
    {
      const N = 'signalements (ordinateur)';
      const state = newState();
      const context = await desktop();
      await mock(context, state);
      const page = await open(context, '/compte/', N);
      await page.locator('#compte-et-securite .app-row', { hasText: 'Signalements' }).waitFor({ timeout: 8000 })
        .catch(() => problems.push(`${N} : ligne « Signalements » absente`));
      expectSame(N, 'Compte et sécurité', await texts(page, '#compte-et-securite .app-row-title'),
        ['Connexion et sécurité', 'Confidentialité et données', 'Type de compte', 'Signalements']);
      await page.locator('#compte-et-securite .app-row', { hasText: 'Signalements' }).click();
      await page.waitForURL(/vue=signalements/);
      await waitCards(page, 4, N);
      await shot(page, 'signalements-ordinateur.png');
      await context.close();
    }

    // 3. Compte qui n'est pas modérateur : pas de ligne ; l'adresse de la page dit qu'elle est réservée.
    {
      const N = 'pas modérateur';
      const state = newState({ moderator: false });
      const context = await phone();
      await mock(context, state);
      const page = await open(context, '/compte/', N);
      await page.locator('.app-menu-group').first().waitFor();
      if (await page.locator('.app-row-title', { hasText: 'Signalements' }).count()) problems.push(`${N} : ligne « Signalements » affichée`);
      await page.goto(`${base}/compte/?vue=signalements`, { waitUntil: 'networkidle' });
      await page.locator('.dsc-empty').waitFor({ timeout: 8000 }).catch(() => undefined);
      expectSame(N, 'page réservée', [tidy(await page.locator('.dsc-empty').textContent().catch(() => null)), await page.locator('.dsc-tabs').count(),
        await page.locator('button[aria-label="Actualiser"]').count()], ['Page réservéeCette page est réservée à la modération de Nidalo.', 0, 0]);
      await context.close();
    }

    // 4. Filtre de mots interdits : Mes informations, puis la messagerie (le texte refusé reste dans le champ).
    {
      const N = 'filtre';
      const state = newState({ moderator: false });
      const context = await phone();
      await mock(context, state);
      const page = await open(context, '/compte/?vue=informations', N);
      const first = page.locator('label.form-field').filter({ has: page.locator('.field-label', { hasText: /^Prénom$/ }) }).locator('input');
      await first.fill('Pourriture');
      await page.locator('.save-capsule').click();
      await page.locator('.signin-error[role="alert"]').waitFor({ timeout: 8000 }).catch(() => undefined);
      expectSame(N, 'Mes informations', [tidy(await page.locator('.signin-error[role="alert"]').textContent().catch(() => null)), state.details.first_name],
        [BANNED.message, 'Claire']);

      await page.goto(`${base}/messages/?c=${CONVERSATION}`, { waitUntil: 'networkidle' });
      await page.locator('.dm-composer textarea').waitFor({ timeout: 8000 });
      await page.fill('.dm-composer textarea', 'Espèce de pourriture');
      await page.keyboard.press('Enter');
      await page.locator('dialog[open] h2').waitFor({ timeout: 8000 }).catch(() => undefined);
      expectSame(N, 'messagerie', [tidy(await page.locator('dialog[open] h2').textContent().catch(() => null)),
        await page.inputValue('.dm-composer textarea'), state.messages.length], [BANNED.message, 'Espèce de pourriture', 2]);
      await page.screenshot({ path: join(out, 'filtre-messagerie-telephone.png') });
      await page.locator('dialog[open]').getByRole('button', { name: 'OK', exact: true }).click();
      await page.fill('.dm-composer textarea', 'Merci, à demain');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => [...document.querySelectorAll('.dm-bubble.is-out .dm-text')].at(-1)?.textContent === 'Merci, à demain', null, { timeout: 8000 })
        .catch(() => problems.push(`${N} : un texte correct n'est plus envoyé`));
      await context.close();
    }

    // 5. Suppression du compte : la phrase Apple seulement pour un compte Apple ; conditions d'utilisation.
    {
      const N = 'suppression et conditions';
      let context = await phone();
      await mock(context, newState(), { apple: true });
      let page = await open(context, '/compte/?vue=supprimer', N);
      await page.locator('.delete-card').waitFor();
      expectSame(N, 'compte Apple', (await texts(page, '.delete-note')).length, 2);
      if (!(await texts(page, '.delete-note')).some((text) => text.includes('« Se connecter avec Apple »'))) problems.push(`${N} : phrase Apple absente`);
      await context.close();
      context = await phone();
      await mock(context, newState());
      page = await open(context, '/compte/?vue=supprimer', N);
      await page.locator('.delete-card').waitFor();
      expectSame(N, 'compte e-mail', (await texts(page, '.delete-note')).length, 1);
      await page.goto(`${base}/conditions/`, { waitUntil: 'networkidle' });
      const terms = tidy(await page.locator('main').textContent());
      if (!terms.includes('Dernière mise à jour : 15 novembre 2026')) problems.push(`${N} : date des conditions`);
      // Version des conditions, celle de l'app (n° 146).
      const version = tidy(await page.locator('dl dt', { hasText: /^Version$/ }).locator('xpath=following-sibling::dd[1]').textContent());
      if (version !== '1.0') problems.push(`${N} : version des conditions « ${version} » au lieu de « 1.0 »`);
      if (!terms.includes('Chaque signalement est examiné sous 24 heures')) problems.push(`${N} : phrase de la modération absente`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error(`${problems.length} problème(s) :\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Modération : tout est bon. Captures dans ${out}`);
