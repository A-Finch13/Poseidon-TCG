// Relais d'Aquaman (Cloudflare Worker) :
// - partage entre les appareils d'un joueur (ordinateur, téléphone, extension ou script) les boosters qu'ils ouvrent,
//   pour que les compteurs anti-malchance soient les mêmes partout, et ses séries favorites. Il garde, pour chaque id
//   de joueur, les boosters ouverts : { id, at, top } (id au hasard, moment, rang de la meilleure rareté), et les ids
//   des séries favorites ;
// - garde un historique public des « beaux tirages » du jeu (SSR, UR, SEC), les tirages que le jeu montre déjà à tous
//   les joueurs, envoyés par chaque Aquaman : qui a tiré quelle carte, son numéro et quand.
// L'historique public n'est jamais réécrit : un import ajoute les tirages pas encore connus et ne remplit que les
// champs vides des connus. Les imports passent par un seul Durable Object (PullsWriter) qui les traite un par un,
// chacun dans une transaction.
// Toutes les 5 minutes, le relais lit aussi lui-même le fil du jeu, avec la session du compte donnée dans le secret
// GAME_COOKIE (l'en-tête « cookie » d'une requête du jeu) ; ses tirages passent par la même file que les autres.
// Chaque Aquaman dit aussi, toutes les 10 minutes, qu'il est utilisé (id et nom du joueur, extension ou script,
// version) : une ligne par joueur et par sorte ; la liste n'est donnée qu'à l'auteur : à une requête signée par un des
// appareils approuvés de l'auteur (chaque appareil garde sa propre clé privée ; le relais garde les clés publiques), ou
// portant le secret ADMIN_TOKEN, qui ne sert qu'à approuver le premier appareil.
// Les cartes qu'un joueur attend de rechercher (au-delà des 100 du jeu) sont partagées entre ses appareils, comme les
// favoris.
// L'auteur publie les dessins de chaque sorte de booster (relevés sur l'accueil du jeu) : donnés à chaque Aquaman (GET
// /packs), qui ne dessine alors plus rien lui-même.
// Les cartes SSR, UR et SEC des joueurs vus dans les « beaux tirages » sont gardées aussi (lues par l'Aquaman qui les a
// vus, dans la collection publique du joueur, toutes les 12 heures au plus) : « Qui a cette carte ? » les liste.
// Liaisons : DB (base D1, schema.sql), PULLS_WRITER (Durable Object, la file des imports), GAME_COOKIE et ADMIN_TOKEN
// (secrets).

const KEEP = 500; // ouvertures renvoyées, les plus récentes : plus que la plus longue garantie
const SEC_RANK = 6; // le rang de la SEC dans le « top » des ouvertures
const MAX_IN = 200; // ouvertures acceptées dans une requête
const MAX_BODY = 64 * 1024;
const YEAR = 365 * 86400e3;
const PLAYER = /^[A-Za-z0-9_-]{6,64}$/;
const BOOSTER = /^[A-Za-z0-9_.:-]{1,64}$/;
const SERIES = /^[A-Za-z0-9_-]{1,64}$/;
const CARD = /^[A-Za-z0-9_-]{1,64}$/;
const RARE = new Set(['SSR', 'UR', 'SEC']);
const MAX_PULLS_IN = 100; // tirages acceptés dans une requête
const MONTH = 31 * 86400e3;
const GAME_FEED = 'https://poseidon-scans.net/api-game/v1/feed';
const EVERY_DAY = '0 4 * * *';
const MAX_FAVORITES = 500;
const MAX_WANTS = 400;
const MAX_HOLDINGS = 2000; // cartes d'un joueur
const HOLDINGS_BODY = 256 * 1024;
const RESCAN = 12 * 3600e3; // la collection d'un joueur est relue après ce délai
const MAX_STALE_ASKED = 40;
const KIND = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_PILE_HTML = 150 * 1024; // un dessin de la pile d'un booster
const MAX_PACK_DESIGNS = 150; // les dessins de l'auteur : chaque sorte de booster, chacune avec 1, 2 et 3+ boosters
const PACKS_BODY = 8 * 1024 * 1024;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, x-aqm-device, x-aqm-time, x-aqm-sig',
  'access-control-max-age': '86400'
};

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS, ...headers } });
// Les réponses publiques peuvent être gardées une minute par les navigateurs.
const shared = (body) => json(body, 200, { 'cache-control': 'public, max-age=60' });

// Certains éléments sont gardés pour la rétro-compatibilité
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const { pathname } = url;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (req.method === 'POST' && pathname === '/pity') return json(await pity(env, await readBody(req)));
      if (req.method === 'POST' && pathname === '/pity/all') return json(await pityAll(env, await readBody(req)));
      if (req.method === 'POST' && pathname === '/favorites') return json(await favorites(env, await readBody(req)));
      if (req.method === 'GET' && pathname === '/favorites/transferred') return json(await favoritesTransferred(env, url.searchParams));
      if (req.method === 'POST' && pathname === '/favorites/transfer') return json(await favoritesTransfer(env, await readBody(req)));
      if (req.method === 'POST' && pathname === '/wants') return json(await wants(env, await readBody(req)));
      if (req.method === 'POST' && pathname === '/lists') return json(await playerList(env, await readBody(req, HOLDINGS_BODY))); // (Ma progression : un compte pour chaque série)
      if (req.method === 'GET' && pathname === '/packs') return shared(await packDesigns(env));
      if (req.method === 'POST' && pathname === '/holdings') return json(await saveHoldings(env, await readBody(req, HOLDINGS_BODY)));
      if (req.method === 'GET' && pathname === '/holdings') return json(await findHoldings(env, url.searchParams));
      if (req.method === 'GET' && pathname === '/holdings/stale') return json(await staleScans(env, url.searchParams));
      if (req.method === 'POST' && pathname === '/pulls') return json(await queuePulls(env, await readBody(req)));
      if (req.method === 'GET' && pathname === '/pulls') return shared(await findPulls(env, url.searchParams));
      if (req.method === 'GET' && pathname === '/players') return shared(await recentPlayers(env, url.searchParams));
      if (req.method === 'GET' && pathname === '/status') return json(await status(env));
      if (req.method === 'POST' && pathname === '/hello') return json(await hello(env, await readBody(req)));
      if (req.method === 'GET' && pathname === '/access') return json(await access(env, url.searchParams));
      if (pathname.startsWith('/admin/')) return await admin(req, env, url);
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: e?.message || 'bad_request' }, 400);
    }
  },

  // Une fois par jour : oublie les ouvertures de plus d'un an. Toutes les 5 minutes : lit le fil du jeu.
  async scheduled(event, env, ctx) {
    if (event.cron === EVERY_DAY) await env.DB.prepare('DELETE FROM pity WHERE at < ?1').bind(Date.now() - YEAR).run();
    else ctx.waitUntil(readGameFeed(env));
  }
};

// Corps JSON d'une requête, refusé au-delà de max.
async function readBody(req, max = MAX_BODY) {
  const text = await req.text();
  if (text.length > max) throw new Error('too_large');
  return JSON.parse(text);
}

// Vrai pour une ouverture telle que l'envoie l'extension.
function valid(e) {
  const now = Date.now();
  return e && typeof e.id === 'string' && BOOSTER.test(e.id) && Number.isFinite(e.at) && e.at > now - YEAR && e.at < now + 86400e3 && Number.isInteger(e.top) && e.top >= 0 && e.top <= 6;
}

// Ajoute les nouvelles ouvertures du joueur, puis renvoie toutes ses ouvertures récentes, et les boosters ouverts
// depuis sa dernière SEC sur toute l'année gardée (sec : { since, known } ; la SEC n'a pas de garantie, elle remonte
// souvent plus loin).
async function pity(env, body) {
  const player = String(body?.player ?? '');
  if (!PLAYER.test(player)) throw new Error('bad_player');
  const events = (Array.isArray(body.events) ? body.events : []).slice(0, MAX_IN).filter(valid);
  if (events.length)
    await env.DB.batch(
      events.map((e) => env.DB.prepare('INSERT OR IGNORE INTO pity (player, id, at, top, card) VALUES (?1, ?2, ?3, ?4, ?5)').bind(player, e.id, Math.round(e.at), e.top, pityCard(e)))
    );
  const [{ results }, sec, { results: last }] = await Promise.all([
    env.DB.prepare('SELECT id, at, top, card FROM pity WHERE player = ?1 ORDER BY at DESC LIMIT ?2').bind(player, KEEP).all(),
    env.DB.prepare(
      'SELECT (SELECT MAX(at) FROM pity WHERE player = ?1 AND top >= ?2) AS last, ' +
        '(SELECT COUNT(*) FROM pity WHERE player = ?1 AND at > COALESCE((SELECT MAX(at) FROM pity WHERE player = ?1 AND top >= ?2), -1)) AS since'
    )
      .bind(player, SEC_RANK)
      .first(),
    // (le dernier tirage SSR, UR et SEC du joueur vu dans les « beaux tirages » du jeu : il compte aussi les boosters
    // ouverts sans Aquaman, sur un autre appareil)
    env.DB.prepare("SELECT rarity, MAX(pulled_at) AS at FROM pulls WHERE player_id = ?1 AND rarity IN ('SSR', 'UR', 'SEC') GROUP BY rarity").bind(player).all()
  ]);
  // (avec la sorte de booster de chaque ouverture : la garantie ne compte pas les packs spéciaux)
  const withPack = results.reverse().map(({ card, ...e }) => {
    const { pack } = readPityCard(card);
    return pack ? { ...e, pack } : e;
  });
  return { events: withPack, sec: { since: sec?.since ?? 0, known: sec?.last != null }, pulls: Object.fromEntries(last.map((r) => [r.rarity, r.at])) };
}

// La meilleure carte d'une ouverture SSR, UR ou SEC ({ id, name, image, rarity }) et la sorte de booster de chaque
// ouverture (pack : { id, name } ; les packs spéciaux ne comptent pas pour la garantie), vérifiées, en JSON ; null
// quand il n'y a ni l'une ni l'autre.
function pityCard(e) {
  const c = e.top >= 4 ? e?.card : null;
  const card = c && CARD.test(String(c.id ?? '')) && RARE.has(c.rarity) ? { id: c.id, name: text(c.name, 120), image: text(c.image, 200), rarity: c.rarity } : {};
  const p = e?.pack;
  if (p && KIND.test(String(p.id ?? ''))) card.pack = { id: p.id, name: text(p.name, 60) };
  return Object.keys(card).length ? JSON.stringify(card) : null;
}

// La carte et la sorte de booster gardées avec une ouverture (pityCard).
function readPityCard(raw) {
  const { pack = null, ...card } = raw ? JSON.parse(raw) : {};
  return { card: card.id ? card : null, pack };
}

// Toutes les ouvertures gardées d'un joueur (un an), la plus ancienne d'abord, avec la carte de leurs SSR, UR et SEC
// quand elle a été gardée ; et les tirages du joueur vus dans les « beaux tirages » du jeu, pour trouver la carte des
// plus anciennes. Pour son historique (« Historique » de l'anti-malchance) ; lu seulement quand le joueur l'ouvre.
async function pityAll(env, body) {
  const player = String(body?.player ?? '');
  if (!PLAYER.test(player)) throw new Error('bad_player');
  const [{ results }, { results: pulls }] = await Promise.all([
    env.DB.prepare('SELECT id, at, top, card FROM pity WHERE player = ?1 ORDER BY at LIMIT 50000').bind(player).all(),
    env.DB.prepare('SELECT card_id, card_name, rarity, image, pulled_at FROM pulls WHERE player_id = ?1 ORDER BY pulled_at DESC LIMIT 2000').bind(player).all()
  ]);
  return {
    events: results.map((r) => ({ id: r.id, at: r.at, top: r.top, ...readPityCard(r.card) })),
    pulls: pulls.map((p) => ({ id: p.card_id, name: p.card_name, rarity: p.rarity, image: p.image, at: p.pulled_at }))
  };
}

// Garde la liste la plus récente de séries favorites du joueur (d'après le moment de son changement), et la renvoie.
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

// Vérifie si le joueur a transféré ses favoris
async function favoritesTransferred(env, urlSearchParams) {
  const player = String(urlSearchParams.get('player') ?? '');
  if (!PLAYER.test(player)) throw new Error('bad_player');
  const saved = await env.DB.prepare('SELECT transferred FROM favorites_transferred WHERE player = ?1').bind(player).first();
  return saved ? { transferred: Boolean(saved.transferred) } : { transferred: false };
}

// Indique que le joueur a transféré ses favoris
async function favoritesTransfer(env, body) {
  const player = String(body?.player ?? '');
  if (!PLAYER.test(player)) throw new Error('bad_player');
  await env.DB.prepare('INSERT INTO favorites_transferred (player, transferred) VALUES (?1, 1) ON CONFLICT (player) DO UPDATE SET transferred = 1').bind(player).run();
  return { transferred: true };
}

// Les dessins de chaque sorte de booster publiés par l'auteur : { kind: { v, pile, buttons, many, name, art, at } }.
async function packDesigns(env) {
  const { results } = await env.DB.prepare('SELECT kind, data, at FROM pack_designs ORDER BY kind LIMIT ?1').bind(MAX_PACK_DESIGNS).all();
  return { packs: Object.fromEntries(results.map((r) => [r.kind, { ...JSON.parse(r.data), at: r.at }])) };
}

// Le relevé de l'auteur : les dessins des sortes données remplacent ceux gardés.
async function publishPacks(env, body) {
  const html = (v) => (typeof v === 'string' && v.length <= MAX_PILE_HTML ? v : null);
  const text = (v) => (typeof v === 'string' ? v.slice(0, 200) : null);
  const now = Date.now();
  const writes = [];
  for (const [kind, v] of Object.entries(body?.packs && typeof body.packs === 'object' ? body.packs : {}).slice(0, MAX_PACK_DESIGNS)) {
    const data = { v: Number.isInteger(v?.v) ? v.v : 0, pile: html(v?.pile), buttons: html(v?.buttons), many: html(v?.many), name: text(v?.name), art: text(v?.art) };
    // kind : la sorte de booster et la forme de sa pile (« …--n1 », « …--n2 », « …--n3 » pour 3 et plus)
    if (!/^[A-Za-z0-9_-]{1,72}$/.test(kind) || !data.pile || !data.buttons) continue;
    writes.push(env.DB.prepare('INSERT INTO pack_designs (kind, data, at) VALUES (?1, ?2, ?3) ON CONFLICT (kind) DO UPDATE SET data = ?2, at = ?3').bind(kind, JSON.stringify(data), now));
  }
  if (writes.length) await env.DB.batch(writes);
  return { ok: true, published: writes.length };
}

// Garde les listes les plus récentes de cartes recherchées du joueur (d'après le moment de leur changement), et les
// renvoie.
async function wants(env, body) {
  const player = String(body?.player ?? '');
  if (!PLAYER.test(player)) throw new Error('bad_player');
  const clean = (v) => (Array.isArray(v) ? [...new Set(v.filter((id) => typeof id === 'string' && CARD.test(id)))].slice(0, MAX_WANTS) : null);
  const waiting = clean(body.waiting);
  const sent = clean(body.sent) ?? [];
  const at = Number(body.at);
  const saved = await env.DB.prepare('SELECT waiting, sent, at FROM wants WHERE player = ?1').bind(player).first();
  if (waiting && Number.isFinite(at) && at > 0 && at < Date.now() + 86400e3 && (!saved || at > saved.at)) {
    await env.DB.prepare('INSERT INTO wants (player, waiting, sent, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (player) DO UPDATE SET waiting = ?2, sent = ?3, at = ?4')
      .bind(player, JSON.stringify(waiting), JSON.stringify(sent), Math.round(at))
      .run();
    return { waiting, sent, at: Math.round(at) };
  }
  return saved ? { waiting: JSON.parse(saved.waiting), sent: JSON.parse(saved.sent), at: saved.at } : { waiting: null, sent: null, at: 0 };
}

// ---------- autres listes d'un joueur, les mêmes sur tous ses appareils ----------

// Une lecture de la collection (Ma progression) : des nombres entiers et un moment.
const count = (v) => Number.isInteger(v) && v >= 0 && v < 1e7;
const reading = (p) =>
  p && count(p.owned) && count(p.total) && count(p.complete) && Number.isFinite(p.at) && p.at > 0 && p.at < Date.now() + 86400e3
    ? { owned: p.owned, total: p.total, complete: p.complete, at: Math.round(p.at) }
    : null;
const RARITY_CODES = ['N', 'R', 'SR', 'SSR', 'UR', 'SEC'];

// Chaque liste, et ce que peut être un de ses éléments : tout le reste est écarté.
const LISTS = {
  // Ma progression : la première et la dernière lecture de chaque jour { day: "2026-11-07", first, last }
  days: {
    max: 120,
    item: (v) => {
      const first = reading(v?.first);
      const last = reading(v?.last);
      return /^\d{4}-\d{2}-\d{2}$/.test(String(v?.day ?? '')) && first && last ? { day: v.day, first, last } : null;
    }
  },
  // Ma progression : les cartes de chaque rareté de chaque série { id, owned, total, at, by: { N: [possédées, cartes,
  // exemplaires] } }
  rarities: {
    max: 600,
    item: (v) => {
      if (!CARD.test(String(v?.id ?? '')) || !count(v.owned) || !count(v.total) || !Number.isFinite(v.at) || v.at <= 0) return null;
      const by = {};
      for (const r of RARITY_CODES) {
        const x = v.by?.[r];
        if (Array.isArray(x) && x.length === 3 && x.every(count)) by[r] = x;
      }
      return { id: v.id, owned: v.owned, total: v.total, at: Math.round(v.at), by };
    }
  },
  // les cartes achetées sur le marché : « rareté|nom » (ou un nom seul), en minuscules
  bought: { max: 3000, item: (v) => (typeof v === 'string' && v.length <= 160 && !/[<>]/.test(v) ? v : null) },
  // les exemplaires en attente d'une place sur le marché : { cardId, copyId, price, name }
  sales: {
    max: 50,
    item: (v) =>
      CARD.test(String(v?.cardId ?? '')) && CARD.test(String(v?.copyId ?? '')) && Number.isInteger(v.price) && v.price > 0 && v.price < 1e9
        ? { cardId: v.cardId, copyId: v.copyId, price: v.price, name: typeof v.name === 'string' ? v.name.slice(0, 120) : 'Une carte' }
        : null
  }
};

// Le relais garde la version la plus récente de chaque liste (at : moment de son dernier changement) : il prend celle
// envoyée si elle est plus récente, et renvoie celle qu'il garde. Une liste envoyée sans données ne fait que la lire.
async function playerList(env, body) {
  const player = String(body?.player ?? '');
  const kind = Object.hasOwn(LISTS, String(body?.name)) ? String(body.name) : null;
  if (!PLAYER.test(player)) throw new Error('bad_player');
  if (!kind) throw new Error('bad_list');
  const { max, item } = LISTS[kind];
  const data = Array.isArray(body.data) ? body.data.slice(0, max).map(item).filter(Boolean) : null;
  const at = Number(body.at);
  const saved = await env.DB.prepare('SELECT data, at FROM lists WHERE player = ?1 AND name = ?2').bind(player, kind).first();
  if (data && Number.isFinite(at) && at > 0 && at < Date.now() + 86400e3 && (!saved || at > saved.at)) {
    await env.DB.prepare('INSERT INTO lists (player, name, data, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (player, name) DO UPDATE SET data = ?3, at = ?4')
      .bind(player, kind, JSON.stringify(data), Math.round(at))
      .run();
    return { data, at: Math.round(at) };
  }
  return saved ? { data: JSON.parse(saved.data), at: saved.at } : { data: null, at: 0 };
}

// ---------- les cartes rares des joueurs vus dans les « beaux tirages » ----------

// Les joueurs de la liste (?players=id,id) dont la collection n'a pas été lue depuis RESCAN.
async function staleScans(env, params) {
  const ids = [...new Set(String(params.get('players') ?? '').split(','))].filter((id) => PLAYER.test(id)).slice(0, MAX_STALE_ASKED);
  if (!ids.length) return { stale: [] };
  const { results } = await env.DB.prepare(`SELECT player_id FROM scans WHERE at > ?1 AND player_id IN (${ids.map((_, i) => `?${i + 2}`).join(', ')})`)
    .bind(Date.now() - RESCAN, ...ids)
    .all();
  const fresh = new Set(results.map((r) => r.player_id));
  return { stale: ids.filter((id) => !fresh.has(id)) };
}

// Les cartes rares d'un joueur, lues dans sa collection : elles remplacent celles gardées (une collection privée n'en
// garde aucune).
async function saveHoldings(env, body) {
  const player = String(body?.player?.id ?? '');
  if (!PLAYER.test(player)) throw new Error('bad_player');
  const last = await env.DB.prepare('SELECT at FROM scans WHERE player_id = ?1').bind(player).first();
  if (last && last.at > Date.now() - 30 * 60e3) return { skipped: true };
  const cards = new Map();
  if (!body.private)
    for (const c of Array.isArray(body.cards) ? body.cards.slice(0, MAX_HOLDINGS) : []) {
      if (!CARD.test(String(c?.id ?? '')) || cards.has(c.id)) continue;
      const count = Number.isInteger(c.count) && c.count > 0 && c.count < 1000 ? c.count : 1;
      const serials = (Array.isArray(c.serials) ? c.serials : []).filter((n) => Number.isInteger(n) && n > 0 && n < 1e7).slice(0, 20);
      cards.set(c.id, { id: c.id, count, serials: serials.length ? JSON.stringify(serials) : null });
    }
  const rows = JSON.stringify([...cards.values()]);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM holdings WHERE player_id = ?1').bind(player),
    env.DB.prepare(
      "INSERT INTO holdings (player_id, card_id, count, serials) SELECT ?1, json_extract(value, '$.id'), json_extract(value, '$.count'), json_extract(value, '$.serials') FROM json_each(?2)"
    ).bind(player, rows),
    env.DB.prepare(
      'INSERT INTO scans (player_id, player_name, at, private, cards) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (player_id) DO UPDATE SET player_name = COALESCE(?2, scans.player_name), at = ?3, private = ?4, cards = ?5'
    ).bind(player, text(body.player.name, 60), Date.now(), body.private ? 1 : 0, cards.size)
  ]);
  return { ok: true, cards: cards.size };
}

// Les joueurs dont on sait qu'ils ont une carte (?card=), avec le moment où leur collection a été lue ; et combien de
// collections ont été lues.
async function findHoldings(env, params) {
  const card = params.get('card') ?? '';
  if (!CARD.test(card)) throw new Error('bad_card');
  const [{ results }, total] = await Promise.all([
    env.DB.prepare(
      'SELECT h.player_id, s.player_name, h.count, h.serials, s.at FROM holdings h JOIN scans s ON s.player_id = h.player_id WHERE h.card_id = ?1 ORDER BY s.at DESC LIMIT 300'
    )
      .bind(card)
      .all(),
    // (combien de collections ont été lues : gardé 10 minutes, cela lit toute la table)
    remember('scans-count', 10 * 60e3, () => env.DB.prepare('SELECT COUNT(*) AS n FROM scans WHERE private = 0').first())
  ]);
  return {
    scanned: total?.n ?? 0,
    owners: results.map((r) => ({ player: { id: r.player_id, name: r.player_name }, count: r.count, serials: r.serials ? JSON.parse(r.serials) : [], seenAt: r.at }))
  };
}

// Minuscules sans accents, pour chercher dans les noms.
const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

// Un tirage du fil du jeu tel que l'envoie Aquaman, vérifié ; null quand il n'en a pas l'air.
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

// Confie un import à la file : les tirages vérifiés vont à l'unique PullsWriter, qui les écrit après les imports
// précédents.
async function queuePulls(env, body) {
  const rows = (Array.isArray(body?.pulls) ? body.pulls : []).slice(0, MAX_PULLS_IN).map(cleanPull).filter(Boolean);
  if (!rows.length) return { received: 0 };
  const writer = env.PULLS_WRITER.get(env.PULLS_WRITER.idFromName('pulls'));
  const res = await writer.fetch('https://pulls-writer/import', { method: 'POST', body: JSON.stringify(rows) });
  if (!res.ok) throw new Error('import_failed');
  return res.json();
}

// Nouveau tirage : ajouté. Tirage connu : seuls ses champs vides sont remplis ; rien de déjà écrit ne change jamais.
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

// La file des imports : une seule instance pour tout le relais, qui écrit les imports l'un après l'autre.
export class PullsWriter {
  constructor(state, env) {
    this.env = env;
    this.last = Promise.resolve();
  }

  async fetch(req) {
    const rows = await req.json();
    // Attend l'import d'avant, quel que soit son résultat, puis écrit celui-ci en une transaction (lot D1).
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

// Réponses gardées un moment dans cette instance du relais : la même question reposée ne lit rien.
const memo = new Map();
async function remember(key, ttl, make) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await make();
  if (memo.size > 500) memo.clear();
  memo.set(key, { at: Date.now(), value });
  return value;
}

// Le début et la fin de l'historique et sa taille, en quelques lignes : chaque agrégat seul utilise son index (ensemble
// dans un même SELECT ils lisent toute la table), et les tirages ne sont jamais supprimés, donc le dernier rowid les
// compte.
const pullsSpan = (env) =>
  remember('pulls-span', 60e3, () =>
    env.DB.prepare('SELECT (SELECT MIN(pulled_at) FROM pulls) AS since, (SELECT MAX(pulled_at) FROM pulls) AS latest, (SELECT MAX(rowid) FROM pulls) AS total').first()
  );

// Les tirages d'une carte (?card=), qui correspondent à un nom ou une série (?q=), ou les derniers ; avec le début de
// l'historique.
async function findPulls(env, params) {
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 100));
  const card = params.get('card');
  const q = fold(params.get('q')).slice(0, 60);
  const cols = 'card_id, serial, card_name, rarity, image, series, player_id, player_name, pulled_at';
  let stmt;
  if (card && CARD.test(card)) stmt = env.DB.prepare(`SELECT ${cols} FROM pulls WHERE card_id = ?1 ORDER BY pulled_at DESC LIMIT ?2`).bind(card, limit);
  else if (q.length >= 2) stmt = env.DB.prepare(`SELECT ${cols} FROM pulls WHERE search LIKE ?1 ORDER BY pulled_at DESC LIMIT ?2`).bind(`%${q.replace(/[%_]/g, '')}%`, limit);
  else stmt = env.DB.prepare(`SELECT ${cols} FROM pulls ORDER BY pulled_at DESC LIMIT ?1`).bind(limit);
  const key = `pulls:${card ?? ''}:${q}:${limit}`;
  const [results, first] = await Promise.all([remember(key, 60e3, async () => (await stmt.all()).results), pullsSpan(env)]);
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

// Joueurs vus dans les tirages récents, les plus récents d'abord.
async function recentPlayers(env, params) {
  const limit = Math.min(300, Math.max(1, Number(params.get('limit')) || 150));
  // (cela lit chaque tirage avec un joueur : gardé 10 minutes)
  const results = await remember(`players:${limit}`, 10 * 60e3, async () =>
    (
      await env.DB.prepare(
        'SELECT player_id AS id, MAX(player_name) AS name, MAX(pulled_at) AS last FROM pulls WHERE player_id IS NOT NULL GROUP BY player_id ORDER BY last DESC LIMIT ?1'
      )
        .bind(limit)
        .all()
    ).results
  );
  return { players: results.map((r) => ({ id: r.id, name: r.name })) };
}

// ---------- la lecture du fil du jeu par le relais lui-même ----------

const setMeta = (env, values) =>
  env.DB.batch(Object.entries(values).map(([k, v]) => env.DB.prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?2').bind(k, String(v))));

// Lit les « beaux tirages » du jeu avec la session du compte et les importe comme les tirages envoyés par les joueurs.
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

// Si la lecture du relais marche (rien sur la session elle-même).
async function status(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM meta WHERE key LIKE 'feed_%'").all();
  const meta = Object.fromEntries(results.map((r) => [r.key, r.value]));
  const latest = await pullsSpan(env);
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

// ---------- qui utilise Aquaman (l'auteur seulement) ----------

const KINDS = new Set(['extension', 'userscript']);

// Un Aquaman dit qu'il est utilisé : la ligne du joueur et la ligne de cette sorte d'Aquaman sont créées, ou mises à
// jour (nom, sorte, version, dernière fois vu).
async function hello(env, body) {
  const player = String(body?.player ?? '');
  if (!PLAYER.test(player)) throw new Error('bad_player');
  const kind = KINDS.has(body.kind) ? body.kind : null;
  const version = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(String(body.version ?? '')) ? body.version : null;
  const now = Date.now();
  const statements = [
    env.DB.prepare(
      `INSERT INTO users (player, name, kind, version, first_seen, last_seen) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT (player) DO UPDATE SET name = COALESCE(?2, users.name), kind = COALESCE(?3, users.kind), version = COALESCE(?4, users.version), last_seen = ?5`
    ).bind(player, text(body.name, 60), kind, version, now)
  ];
  // Le classement par Perles n'existe plus : les Perles qu'une ancienne version partageait sont reprises au prochain
  // bonjour du joueur, quoi qu'il envoie.
  statements.push(env.DB.prepare('UPDATE users SET perles = NULL, perles_at = NULL WHERE player = ?1 AND perles IS NOT NULL').bind(player));
  if (kind)
    statements.push(
      env.DB.prepare(
        `INSERT INTO installs (player, kind, version, first_seen, last_seen) VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT (player, kind) DO UPDATE SET version = COALESCE(?3, installs.version), last_seen = ?4`
      ).bind(player, kind, version, now)
    );
  await env.DB.batch(statements);
  // L'auteur a peut-être retiré Aquaman à ce joueur : son Aquaman s'arrête. (false tant que la colonne manque)
  const row = await env.DB.prepare('SELECT revoked FROM users WHERE player = ?1').bind(player).first().catch(() => null);
  return { ok: true, revoked: !!row?.revoked };
}

// Si l'auteur a retiré Aquaman à un joueur (?player=) : demandé chaque minute par chaque Aquaman, une ligne lue.
async function access(env, params) {
  const player = String(params.get('player') ?? '');
  if (!PLAYER.test(player)) throw new Error('bad_player');
  const row = await env.DB.prepare('SELECT revoked FROM users WHERE player = ?1').bind(player).first();
  return { revoked: !!row?.revoked };
}

// Vrai quand la requête porte le code de l'auteur (comparé en temps constant).
function isAuthor(req, env) {
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const want = env.ADMIN_TOKEN ?? '';
  if (!want || given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= given.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

// Tous les joueurs qui ont utilisé Aquaman, le plus récemment vu d'abord, avec chacune de leurs sortes d'Aquaman (les
// joueurs vus avant la table installs n'ont que leur dernière sorte).
async function users(env) {
  const [{ results }, { results: installs }] = await Promise.all([
    env.DB.prepare('SELECT * FROM users ORDER BY last_seen DESC LIMIT 5000').all(),
    env.DB.prepare('SELECT player, kind, version, last_seen FROM installs ORDER BY last_seen DESC').all()
  ]);
  const byPlayer = new Map();
  for (const i of installs) {
    if (!byPlayer.has(i.player)) byPlayer.set(i.player, []);
    byPlayer.get(i.player).push({ kind: i.kind, version: i.version, lastSeen: i.last_seen });
  }
  return {
    users: results.map((r) => ({
      id: r.player,
      name: r.name,
      kind: r.kind,
      version: r.version,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      revoked: !!r.revoked,
      installs: byPlayer.get(r.player) ?? (r.kind ? [{ kind: r.kind, version: r.version, lastSeen: r.last_seen }] : [])
    }))
  };
}

// ---------- les appareils de l'auteur ----------

const DEVICE = /^[A-Z0-9]{8}$/;
const PENDING_KEEP = 3600e3; // un appareil pas approuvé dans l'heure est oublié
const SIGNED_FOR = 120e3; // une requête signée est valable deux minutes

const fromBase64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

// Vrai quand la requête est signée par un appareil approuvé : signature de « MÉTHODE /chemin moment corps » avec sa
// clé.
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

// Un nouvel appareil demande à être approuvé : sa clé publique est gardée, en attente, avec un code à montrer à
// l'auteur.
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

// Les adresses /admin/ : demander une approbation est ouvert à tous ; tout le reste demande l'auteur (appareil approuvé
// ou ADMIN_TOKEN).
async function admin(req, env, url) {
  const body = req.method === 'GET' ? '' : await req.text();
  const path = url.pathname;
  if (body.length > (path === '/admin/packs' ? PACKS_BODY : MAX_BODY)) return json({ error: 'too_large' }, 400);
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
  if (req.method === 'POST' && path === '/admin/packs') return json(await publishPacks(env, data));
  // L'Aquaman d'un joueur retiré (revoked: true) ou rendu : il s'arrête en moins d'une minute (GET /access).
  if (req.method === 'POST' && path === '/admin/users/revoke' && PLAYER.test(String(data.id ?? ''))) {
    await env.DB.prepare('UPDATE users SET revoked = ?2 WHERE player = ?1').bind(data.id, data.revoked ? Date.now() : null).run();
    return json({ ok: true });
  }
  if (req.method === 'POST' && path === '/admin/devices/revoke' && DEVICE.test(String(data.id ?? ''))) {
    await env.DB.prepare('DELETE FROM devices WHERE id = ?1').bind(data.id).run();
    return json({ ok: true });
  }
  return json({ error: 'not_found' }, 404);
}
