// Aquaman relay (Cloudflare Worker):
// - shares between the devices of a player (computer, phone, extension or userscript) the boosters they open, so that
//   the pity counters are the same everywhere, and their favourite series. It keeps, for each player id, the boosters
//   opened: { id, at, top } (random id, time, best rarity rank), and the ids of the favourite series;
// - keeps a public history of the game's "beaux tirages" (SSR, UR, SEC), the pulls the game already shows to every
//   player, sent by every Aquaman: who pulled which card, its number and when.
// The public history is never rewritten: an import adds the pulls not known yet and only fills the empty fields of
// the known ones. The imports go through one Durable Object (PullsWriter) that handles them one at a time, each in one
// transaction.
// Every 5 minutes, the relay also reads the game's feed itself, with the session of the account given in the secret
// GAME_COOKIE (the "cookie" header of a request of the game); its pulls go through the same queue as the others.
// Each Aquaman also says, every 6 hours at most, that it is used (player id and name, extension or userscript,
// version); the list is given only to the author: to a request signed by one of the author's approved devices (each
// device keeps its own private key; the relay keeps the public keys), or carrying the secret ADMIN_TOKEN, which is
// only used to approve the first device.
// Bindings: DB (D1 database, schema.sql), PULLS_WRITER (Durable Object, the queue of the imports), GAME_COOKIE and
// ADMIN_TOKEN (secrets).

const KEEP = 500; // openings sent back, the most recent: more than the longest pity
const MAX_IN = 200; // openings accepted in one request
const MAX_BODY = 64 * 1024;
const YEAR = 365 * 86400e3;
const PLAYER = /^[A-Za-z0-9_-]{6,64}$/;
const BOOSTER = /^[A-Za-z0-9_.:-]{1,64}$/;
const SERIES = /^[A-Za-z0-9_-]{1,64}$/;
const CARD = /^[A-Za-z0-9_-]{1,64}$/;
const RARE = new Set(['SSR', 'UR', 'SEC']);
const MAX_PULLS_IN = 100; // pulls accepted in one request
const MONTH = 31 * 86400e3;
const GAME_FEED = 'https://poseidon-scans.net/api-game/v1/feed';
const EVERY_DAY = '0 4 * * *';
const MAX_FAVORITES = 500;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, x-aqm-device, x-aqm-time, x-aqm-sig',
  'access-control-max-age': '86400'
};

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS, ...headers } });
// Public answers can be kept a minute by the browsers.
const shared = (body) => json(body, 200, { 'cache-control': 'public, max-age=60' });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const { pathname } = url;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (req.method === 'POST' && pathname === '/pity') return json(await pity(env, await readBody(req)));
      if (req.method === 'POST' && pathname === '/favorites') return json(await favorites(env, await readBody(req)));
      if (req.method === 'POST' && pathname === '/pulls') return json(await queuePulls(env, await readBody(req)));
      if (req.method === 'GET' && pathname === '/pulls') return shared(await findPulls(env, url.searchParams));
      if (req.method === 'GET' && pathname === '/players') return shared(await recentPlayers(env, url.searchParams));
      if (req.method === 'GET' && pathname === '/status') return json(await status(env));
      if (req.method === 'POST' && pathname === '/hello') return json(await hello(env, await readBody(req)));
      if (pathname.startsWith('/admin/')) return await admin(req, env, url);
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: e?.message || 'bad_request' }, 400);
    }
  },

  // Once a day: forgets the openings older than a year. Every 5 minutes: reads the game's feed.
  async scheduled(event, env, ctx) {
    if (event.cron === EVERY_DAY) await env.DB.prepare('DELETE FROM pity WHERE at < ?1').bind(Date.now() - YEAR).run();
    else ctx.waitUntil(readGameFeed(env));
  }
};

// JSON body of a request, refused above MAX_BODY.
async function readBody(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new Error('too_large');
  return JSON.parse(text);
}

// True for an opening as sent by the extension.
function valid(e) {
  const now = Date.now();
  return e && typeof e.id === 'string' && BOOSTER.test(e.id) && Number.isFinite(e.at) && e.at > now - YEAR && e.at < now + 86400e3 && Number.isInteger(e.top) && e.top >= 0 && e.top <= 6;
}

// Adds the player's new openings, then sends back all of their recent ones.
async function pity(env, body) {
  const player = String(body?.player ?? '');
  if (!PLAYER.test(player)) throw new Error('bad_player');
  const events = (Array.isArray(body.events) ? body.events : []).slice(0, MAX_IN).filter(valid);
  if (events.length)
    await env.DB.batch(events.map((e) => env.DB.prepare('INSERT OR IGNORE INTO pity (player, id, at, top) VALUES (?1, ?2, ?3, ?4)').bind(player, e.id, Math.round(e.at), e.top)));
  const { results } = await env.DB.prepare('SELECT id, at, top FROM pity WHERE player = ?1 ORDER BY at DESC LIMIT ?2').bind(player, KEEP).all();
  return { events: results.reverse() };
}

// Keeps the most recent list of favourite series of the player (by the time of its change), and sends it back.
async function favorites(env, body) {
  const player = String(body?.player ?? '');
  if (!PLAYER.test(player)) throw new Error('bad_player');
  const saved = await env.DB.prepare('SELECT list, at FROM favorites WHERE player = ?1').bind(player).first();
  const list = Array.isArray(body.list) ? [...new Set(body.list.filter((id) => typeof id === 'string' && SERIES.test(id)))].slice(0, MAX_FAVORITES) : null;
  const at = Number(body.at);
  if (list && Number.isFinite(at) && at >= 0 && at < Date.now() + 86400e3 && (!saved || at > saved.at)) {
    await env.DB.prepare('INSERT INTO favorites (player, list, at) VALUES (?1, ?2, ?3) ON CONFLICT (player) DO UPDATE SET list = ?2, at = ?3')
      .bind(player, JSON.stringify(list), Math.round(at))
      .run();
    return { list, at: Math.round(at) };
  }
  return saved ? { list: JSON.parse(saved.list), at: saved.at } : { list: null, at: 0 };
}

// Lower case without accents, to search the names.
const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

// One pull of the game's feed as sent by Aquaman, checked; null when it doesn't look like one.
function cleanPull(p) {
  const card = p?.card;
  const at = Date.parse(p?.pulledAt);
  if (!card || !CARD.test(String(card.id ?? '')) || !RARE.has(card.rarity) || !text(card.name, 120)) return null;
  if (!Number.isFinite(at) || at < Date.now() - MONTH || at > Date.now() + 3600e3) return null;
  const serial = Number.isInteger(p.serial) && p.serial > 0 && p.serial < 1e7 ? p.serial : null;
  const playerId = PLAYER.test(String(p.player?.id ?? '')) ? p.player.id : null;
  const name = text(card.name, 120);
  const series = text(card.series?.title ?? card.series, 160);
  return {
    k: serial != null ? `${card.id}#${serial}` : `${card.id}#${playerId ?? ''}#${at}`,
    card_id: card.id,
    serial,
    card_name: name,
    rarity: card.rarity,
    image: text(card.image, 200),
    series,
    player_id: playerId,
    player_name: text(p.player?.name, 60),
    pulled_at: at,
    search: fold(`${name} ${series ?? ''}`),
    series_search: fold(series ?? '')
  };
}

// Hands an import to the queue: the checked pulls go to the one PullsWriter, which writes them after the earlier imports.
async function queuePulls(env, body) {
  const rows = (Array.isArray(body?.pulls) ? body.pulls : []).slice(0, MAX_PULLS_IN).map(cleanPull).filter(Boolean);
  if (!rows.length) return { received: 0 };
  const writer = env.PULLS_WRITER.get(env.PULLS_WRITER.idFromName('pulls'));
  const res = await writer.fetch('https://pulls-writer/import', { method: 'POST', body: JSON.stringify(rows) });
  if (!res.ok) throw new Error('import_failed');
  return res.json();
}

// New pull: added. Known pull: only its empty fields are filled; nothing already written ever changes.
const IMPORT = `INSERT INTO pulls (k, card_id, serial, card_name, rarity, image, series, player_id, player_name, pulled_at, search)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
  ON CONFLICT (k) DO UPDATE SET
    image = COALESCE(pulls.image, excluded.image),
    series = COALESCE(pulls.series, excluded.series),
    player_id = COALESCE(pulls.player_id, excluded.player_id),
    player_name = COALESCE(pulls.player_name, excluded.player_name),
    search = CASE WHEN pulls.series IS NULL AND excluded.series IS NOT NULL THEN pulls.search || ' ' || ?12 ELSE pulls.search END
  WHERE (pulls.image IS NULL AND excluded.image IS NOT NULL)
     OR (pulls.series IS NULL AND excluded.series IS NOT NULL)
     OR (pulls.player_id IS NULL AND excluded.player_id IS NOT NULL)
     OR (pulls.player_name IS NULL AND excluded.player_name IS NOT NULL)`;

// The queue of the imports: one instance for the whole relay, which writes the imports one after the other.
export class PullsWriter {
  constructor(state, env) {
    this.env = env;
    this.last = Promise.resolve();
  }

  async fetch(req) {
    const rows = await req.json();
    // Waits for the import before it, whatever its outcome, then writes this one in one transaction (D1 batch).
    const turn = this.last.catch(() => {}).then(() => this.write(rows));
    this.last = turn;
    return Response.json(await turn);
  }

  async write(rows) {
    const { DB } = this.env;
    const results = await DB.batch(rows.map((r) => DB.prepare(IMPORT).bind(r.k, r.card_id, r.serial, r.card_name, r.rarity, r.image, r.series, r.player_id, r.player_name, r.pulled_at, r.search, r.series_search)));
    const changed = results.reduce((n, x) => n + (x?.meta?.changes ?? 0), 0);
    return { received: rows.length, written: changed };
  }
}

// The pulls of a card (?card=), matching a name or a series (?q=), or the latest ones; with the start of the history.
async function findPulls(env, params) {
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 100));
  const card = params.get('card');
  const q = fold(params.get('q')).slice(0, 60);
  const cols = 'card_id, serial, card_name, rarity, image, series, player_id, player_name, pulled_at';
  let stmt;
  if (card && CARD.test(card)) stmt = env.DB.prepare(`SELECT ${cols} FROM pulls WHERE card_id = ?1 ORDER BY pulled_at DESC LIMIT ?2`).bind(card, limit);
  else if (q.length >= 2) stmt = env.DB.prepare(`SELECT ${cols} FROM pulls WHERE search LIKE ?1 ORDER BY pulled_at DESC LIMIT ?2`).bind(`%${q.replace(/[%_]/g, '')}%`, limit);
  else stmt = env.DB.prepare(`SELECT ${cols} FROM pulls ORDER BY pulled_at DESC LIMIT ?1`).bind(limit);
  const [{ results }, first] = await Promise.all([stmt.all(), env.DB.prepare('SELECT MIN(pulled_at) AS since, MAX(pulled_at) AS latest, COUNT(*) AS total FROM pulls').first()]);
  return {
    since: first?.since ?? null,
    latest: first?.latest ?? null,
    total: first?.total ?? 0,
    pulls: results.map((r) => ({
      card: { id: r.card_id, name: r.card_name, rarity: r.rarity, image: r.image, series: r.series },
      serial: r.serial,
      player: r.player_id || r.player_name ? { id: r.player_id, name: r.player_name } : null,
      pulledAt: new Date(r.pulled_at).toISOString()
    }))
  };
}

// Players seen in the recent pulls, the most recent first.
async function recentPlayers(env, params) {
  const limit = Math.min(300, Math.max(1, Number(params.get('limit')) || 150));
  const { results } = await env.DB.prepare(
    'SELECT player_id AS id, MAX(player_name) AS name, MAX(pulled_at) AS last FROM pulls WHERE player_id IS NOT NULL GROUP BY player_id ORDER BY last DESC LIMIT ?1'
  )
    .bind(limit)
    .all();
  return { players: results.map((r) => ({ id: r.id, name: r.name })) };
}

// ---------- the relay's own reading of the game's feed ----------

const setMeta = (env, values) =>
  env.DB.batch(Object.entries(values).map(([k, v]) => env.DB.prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?2').bind(k, String(v))));

// Reads the game's "beaux tirages" with the account's session and imports them like the pulls sent by the players.
async function readGameFeed(env) {
  if (!env.GAME_COOKIE) return;
  const now = Date.now();
  let res;
  try {
    res = await fetch(GAME_FEED, { headers: { cookie: env.GAME_COOKIE, accept: 'application/json', 'user-agent': 'Aquaman relay (https://github.com/A-Finch13/Poseidon-TCG)' } });
  } catch (e) {
    return setMeta(env, { feed_tried_at: now, feed_state: `network: ${e?.message ?? 'error'}` });
  }
  if (!res.ok) return setMeta(env, { feed_tried_at: now, feed_state: res.status === 401 ? 'session expired' : `http ${res.status}` });
  const body = await res.json().catch(() => null);
  const rows = (Array.isArray(body?.pulls) ? body.pulls : []).slice(0, MAX_PULLS_IN).map(cleanPull).filter(Boolean);
  let written = 0;
  if (rows.length) {
    const writer = env.PULLS_WRITER.get(env.PULLS_WRITER.idFromName('pulls'));
    const answer = await writer.fetch('https://pulls-writer/import', { method: 'POST', body: JSON.stringify(rows) });
    written = answer.ok ? (await answer.json()).written : 0;
  }
  await setMeta(env, { feed_tried_at: now, feed_ok_at: now, feed_state: 'ok', feed_seen: rows.length, feed_written: written });
}

// Whether the relay's reading works (nothing about the session itself).
async function status(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM meta WHERE key LIKE 'feed_%'").all();
  const meta = Object.fromEntries(results.map((r) => [r.key, r.value]));
  const latest = await env.DB.prepare('SELECT MAX(pulled_at) AS latest, COUNT(*) AS total FROM pulls').first();
  const time = (v) => (v ? new Date(Number(v)).toISOString() : null);
  return {
    reading: env.GAME_COOKIE ? meta.feed_state ?? 'waiting' : 'off',
    lastTry: time(meta.feed_tried_at),
    lastSuccess: time(meta.feed_ok_at),
    lastSeen: Number(meta.feed_seen ?? 0),
    lastWritten: Number(meta.feed_written ?? 0),
    latestPull: time(latest?.latest),
    pulls: latest?.total ?? 0
  };
}

// ---------- who uses Aquaman (the author only) ----------

const KINDS = new Set(['extension', 'userscript']);

// An Aquaman says it is used: its line is created, or brought up to date (name, kind, version, last seen).
async function hello(env, body) {
  const player = String(body?.player ?? '');
  if (!PLAYER.test(player)) throw new Error('bad_player');
  const kind = KINDS.has(body.kind) ? body.kind : null;
  const version = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(String(body.version ?? '')) ? body.version : null;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (player, name, kind, version, first_seen, last_seen) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     ON CONFLICT (player) DO UPDATE SET name = COALESCE(?2, users.name), kind = COALESCE(?3, users.kind), version = COALESCE(?4, users.version), last_seen = ?5`
  )
    .bind(player, text(body.name, 60), kind, version, now)
    .run();
  return { ok: true };
}

// True when the request carries the author's code (compared in constant time).
function isAuthor(req, env) {
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const want = env.ADMIN_TOKEN ?? '';
  if (!want || given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= given.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

// Every player who used Aquaman, the most recently seen first.
async function users(env) {
  const { results } = await env.DB.prepare('SELECT player, name, kind, version, first_seen, last_seen FROM users ORDER BY last_seen DESC LIMIT 5000').all();
  return { users: results.map((r) => ({ id: r.player, name: r.name, kind: r.kind, version: r.version, firstSeen: r.first_seen, lastSeen: r.last_seen })) };
}

// ---------- the author's devices ----------

const DEVICE = /^[A-Z0-9]{8}$/;
const PENDING_KEEP = 3600e3; // a device not approved within an hour is forgotten
const SIGNED_FOR = 120e3; // a signed request is valid two minutes

const fromBase64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

// True when the request is signed by an approved device: signature of "METHOD /path time body" with its key.
async function signedByDevice(req, env, url, body) {
  const id = req.headers.get('x-aqm-device') ?? '';
  const time = Number(req.headers.get('x-aqm-time'));
  const sig = req.headers.get('x-aqm-sig') ?? '';
  if (!DEVICE.test(id) || !sig || !Number.isFinite(time) || Math.abs(Date.now() - time) > SIGNED_FOR) return false;
  const row = await env.DB.prepare("SELECT pubkey FROM devices WHERE id = ?1 AND state = 'approved'").bind(id).first();
  if (!row) return false;
  try {
    const key = await crypto.subtle.importKey('jwk', JSON.parse(row.pubkey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const data = new TextEncoder().encode(`${req.method} ${url.pathname} ${time} ${body}`);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromBase64url(sig), data);
    if (ok) await env.DB.prepare('UPDATE devices SET last_used = ?2 WHERE id = ?1').bind(id, Date.now()).run();
    return ok;
  } catch {
    return false;
  }
}

// A new device asks to be approved: its public key is kept, waiting, with a code to show to the author.
async function requestDevice(env, body) {
  const pub = body?.pub;
  if (!pub || pub.kty !== 'EC' || pub.crv !== 'P-256' || typeof pub.x !== 'string' || typeof pub.y !== 'string') throw new Error('bad_key');
  await env.DB.prepare("DELETE FROM devices WHERE state = 'pending' AND created < ?1").bind(Date.now() - PENDING_KEEP).run();
  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM devices WHERE state = 'pending'").first();
  if ((pending?.n ?? 0) >= 20) throw new Error('too_many_pending');
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  await env.DB.prepare("INSERT INTO devices (id, pubkey, name, state, created) VALUES (?1, ?2, ?3, 'pending', ?4)")
    .bind(id, JSON.stringify({ kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y }), text(body.name, 60), Date.now())
    .run();
  return { id, state: 'pending' };
}

// The /admin/ addresses: asking for approval is open; everything else needs the author (approved device or ADMIN_TOKEN).
async function admin(req, env, url) {
  const body = req.method === 'GET' ? '' : await req.text();
  if (body.length > MAX_BODY) return json({ error: 'too_large' }, 400);
  const path = url.pathname;
  if (req.method === 'POST' && path === '/admin/devices/request') return json(await requestDevice(env, JSON.parse(body || '{}')));
  if (req.method === 'GET' && path === '/admin/devices/state') {
    const id = url.searchParams.get('id') ?? '';
    const row = DEVICE.test(id) ? await env.DB.prepare('SELECT state FROM devices WHERE id = ?1').bind(id).first() : null;
    return json({ state: row?.state ?? 'unknown' });
  }
  if (!(isAuthor(req, env) || (await signedByDevice(req, env, url, body)))) return json({ error: 'forbidden' }, 403);
  const data = body ? JSON.parse(body) : {};
  if (req.method === 'GET' && path === '/admin/users') return json(await users(env));
  if (req.method === 'GET' && path === '/admin/devices') {
    const { results } = await env.DB.prepare('SELECT id, name, state, created, last_used FROM devices ORDER BY state, created DESC').all();
    return json({ devices: results.map((r) => ({ id: r.id, name: r.name, state: r.state, created: r.created, lastUsed: r.last_used })) });
  }
  if (req.method === 'POST' && path === '/admin/devices/approve' && DEVICE.test(String(data.id ?? ''))) {
    await env.DB.prepare("UPDATE devices SET state = 'approved' WHERE id = ?1 AND state = 'pending'").bind(data.id).run();
    return json({ ok: true });
  }
  if (req.method === 'POST' && path === '/admin/devices/revoke' && DEVICE.test(String(data.id ?? ''))) {
    await env.DB.prepare('DELETE FROM devices WHERE id = ?1').bind(data.id).run();
    return json({ ok: true });
  }
  return json({ error: 'not_found' }, 404);
}
