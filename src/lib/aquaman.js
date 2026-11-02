// Aquaman: access to the Poseidon Scans game API, collections, booster maths, settings and new versions.
// Used by the background worker (extension) and by bridge.js (userscript); content.js asks through messages.

export const ORIGIN = 'https://poseidon-scans.net';
export const REPO = 'A-Finch13/Poseidon-TCG';
const GAME = `${ORIGIN}/api-game/v1`;
const SOCIAL = `${ORIGIN}/api-social/v1`;
export const RANK = { N: 1, R: 2, SR: 3, SSR: 4, UR: 5, SEC: 6 };

// ---------- settings ----------

export const DEFAULTS = {
  notifyBoosters: true,
  notifyUpdated: true,
  syncPity: true
};

// Settings with their default values.
export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...settings };
}

// Saves some settings.
export async function setSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings });
  return settings;
}

// ---------- API ----------

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

// JSON answer of the site, sent with the player's session.
async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { credentials: 'include', headers: { accept: 'application/json' } });
  } catch {
    throw new ApiError(0, 'network', 'Connexion impossible. Vérifie ta connexion internet.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error?.code || `http_${res.status}`, body?.error?.message || `Erreur ${res.status}`);
  return body;
}
const game = (path) => getJson(GAME + path);
const social = (path) => getJson(SOCIAL + path);

// Answers kept a while.
const memo = new Map();
function cached(key, ttl, load) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.promise;
  const promise = load();
  memo.set(key, { at: Date.now(), promise });
  promise.catch(() => memo.get(key)?.promise === promise && memo.delete(key));
  return promise;
}

// Forgets the cached answers whose key starts with one of the prefixes.
function forget(...prefixes) {
  for (const key of [...memo.keys()]) if (prefixes.some((p) => key.startsWith(p))) memo.delete(key);
}

// Id of the logged-in player.
export function myId() {
  return cached('me-id', 30 * 60e3, async () => {
    const ids = [];
    try {
      const a = await getJson(`${ORIGIN}/api/auth/check`);
      ids.push(a?.user?.id);
    } catch {}
    if (!ids.some(Boolean)) {
      try {
        const m = await game('/me');
        ids.push(m?.id, m?.userId, m?.player?.id, m?.user?.id);
      } catch {}
    }
    if (!ids.some(Boolean)) {
      try {
        const s = await social('/me');
        ids.push(s?.user?.id, s?.id);
      } catch {}
    }
    const id = ids.find((x) => typeof x === 'string' && x);
    if (!id) throw new ApiError(401, 'unauthorized', 'Connecte-toi au site pour utiliser Aquaman.');
    return id;
  });
}

// Game status of the player: boosters waiting to be opened and Perles.
export async function gameStatus() {
  const me = await game('/me');
  return { pending: Array.isArray(me?.pending) ? me.pending.length : 0, perles: typeof me?.perles === 'number' ? me.perles : null };
}

// ---------- collections ----------

const showcases = new Map(); // player id -> last collection read

// Collection of a player: { player, private, cards, copies, albums, owned, total }.
function showcase(id, ttl = 5 * 60e3) {
  return cached(`showcase:${id}`, ttl, async () => {
    const path = encodeURIComponent(id);
    let sc;
    try {
      sc = await game(`/players/${path}/showcase`);
    } catch {
      sc = await game(`/public/players/${path}/showcase`);
    }
    showcases.set(id, sc);
    return sc;
  });
}
const myShowcase = async (ttl = 60e3) => showcase(await myId(), ttl);

// File name of a card image: the same key as the address of the image shown by the site.
export function imageKey(src) {
  if (!src) return null;
  let s = String(src);
  try {
    const u = new URL(s, ORIGIN);
    s = u.pathname.startsWith('/_next/image') ? u.searchParams.get('url') || '' : u.pathname;
    s = decodeURIComponent(s);
  } catch {}
  s = s.split(/[?#]/)[0];
  return s.slice(s.lastIndexOf('/') + 1) || null;
}

// Copies owned, by card id and by image key.
function countCopies(sc) {
  const byCard = {};
  const byImage = {};
  for (const copy of sc?.copies ?? []) {
    const card = copy.card;
    if (!card) continue;
    byCard[card.id] = (byCard[card.id] ?? 0) + 1;
    const key = imageKey(card.image);
    if (key) byImage[key] = (byImage[key] ?? 0) + 1;
  }
  return { byCard, byImage };
}

// Copies owned by the logged-in player.
export async function ownership() {
  return countCopies(await myShowcase());
}

// Unique cards, total and completed series of a player.
export async function playerSummary(id) {
  const sc = await showcase(id);
  if (sc.private) return { id, name: sc.player?.name ?? null, private: true };
  return { id, name: sc.player?.name ?? null, private: false, owned: sc.owned ?? 0, total: sc.total ?? 0, albums: sc.albums?.length ?? 0 };
}

// The logged-in player and their friends.
export async function friends() {
  const me = await myId();
  let list = [];
  let friendsError = null;
  try {
    list = (await cached('friends', 5 * 60e3, () => social('/friends'))).friends ?? [];
  } catch (e) {
    friendsError = e.message;
  }
  return {
    me,
    friendsError,
    friends: list.filter((f) => f?.user?.id && f.user.id !== me).map((f) => ({ id: f.user.id, name: f.user.name ?? null }))
  };
}

// ---------- boosters ----------

const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

// Cards of the game catalogue, with their series.
function collectCards(data) {
  const out = new Map();
  let left = 300000;
  const walk = (v, series, depth) => {
    if (!v || typeof v !== 'object' || depth > 8 || --left < 0) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, series, depth + 1);
      return;
    }
    if (typeof v.id === 'string' && typeof v.name === 'string' && RANK[v.rarity]) {
      const s = v.series ?? series;
      if (!out.has(v.id))
        out.set(v.id, {
          id: v.id,
          name: v.name,
          image: v.image,
          rarity: v.rarity,
          types: Array.isArray(v.types) ? v.types : [],
          extra: !!(v.variant || v.seasonId || v.baseId),
          series: s ? { id: s.id, title: s.title, slug: s.slug } : null
        });
      return;
    }
    const isSeries = typeof v.title === 'string' && typeof v.slug === 'string';
    for (const k in v) walk(v[k], isSeries ? v : series, depth + 1);
  };
  walk(data, null, 0);
  return [...out.values()];
}

// The whole catalogue, or null when the site doesn't give it.
function loadCatalog() {
  return cached('catalog', 30 * 60e3, async () => {
    for (const path of ['/cards/catalog', '/cards', '/series']) {
      try {
        const cards = collectCards(await game(path));
        if (cards.length > 50) return cards;
      } catch {}
    }
    return null;
  }).catch(() => null);
}

// Value of the cards in Perles: median of the copies seen in the collections read (the player's and their friends').
function valueTable() {
  const seen = new Map();
  const rarityOf = new Map();
  for (const sc of showcases.values())
    for (const copy of sc?.copies ?? []) {
      if (typeof copy.value !== 'number' || !copy.card) continue;
      if (!seen.has(copy.card.id)) seen.set(copy.card.id, []);
      seen.get(copy.card.id).push(copy.value);
      rarityOf.set(copy.card.id, copy.card.rarity);
    }
  const card = new Map();
  const byRarity = {};
  for (const [id, values] of seen) {
    values.sort((a, b) => a - b);
    const median = values[values.length >> 1];
    card.set(id, median);
    (byRarity[rarityOf.get(id)] ??= []).push(median);
  }
  const rarity = {};
  for (const r in byRarity) rarity[r] = byRarity[r].reduce((a, b) => a + b, 0) / byRarity[r].length;
  return { card, rarity };
}

// Boosters sold by the shop: the everyday one, then the special ones.
function boosterList(shop) {
  const list = [];
  if (shop?.boosterPrice != null) list.push({ id: 'base', name: 'Booster', price: shop.boosterPrice, minRank: 2, series: [], types: [], pool: shop.pool ?? null, endsAt: null });
  for (const s of shop?.specials ?? [])
    list.push({
      id: s.id,
      name: s.name,
      price: s.price ?? s.cost ?? 0,
      minRank: s.minRank || 2,
      series: (s.series ?? []).map((x) => ({ id: x.id, title: x.title, slug: x.slug })),
      types: s.types ?? [],
      pool: s.pool ?? null,
      endsAt: s.endsAt ?? null
    });
  return list;
}

// Cards a booster can give; with or without the variants and season cards, whichever is closer to the size the site gives.
function poolCards(b, catalog) {
  const sameSeries = (s, c) => (s.id && s.id === c.series?.id) || (s.slug && s.slug === c.series?.slug) || (s.title && s.title === c.series?.title);
  const all = catalog.filter((c) => (!b.series.length || b.series.some((s) => sameSeries(s, c))) && (!b.types.length || c.types.some((t) => b.types.includes(t))));
  const base = all.filter((c) => !c.extra);
  const want = b.pool?.cards;
  if (!want || base.length === all.length) return all;
  return Math.abs(base.length - want) < Math.abs(all.length - want) ? base : all;
}

// Odds of each rarity for the 5 cards: 4 free draws and a 5th of at least minRank.
function slotOdds(rarities, present, minRank) {
  const avail = rarities.filter((r) => present.has(r.code));
  const odds = (list) => {
    const total = list.reduce((n, r) => n + r.weight, 0);
    return Object.fromEntries(list.map((r) => [r.code, total ? r.weight / total : 0]));
  };
  const free = odds(avail);
  const last = odds(avail.filter((r) => (r.rank ?? RANK[r.code]) >= minRank));
  return [free, free, free, free, last];
}

// Expected value, new cards, odds of each rarity and chance of the searched cards for one booster.
function analyse(b, { rarities, catalog, mine, values, match, rarity }) {
  let groups = null;
  if (catalog) {
    groups = {};
    for (const c of poolCards(b, catalog)) {
      const g = (groups[c.rarity] ??= { n: 0, missing: 0, value: 0, targets: 0, targetsNew: 0, cards: [] });
      const own = mine.byCard[c.id] ?? 0;
      const v = values.card.get(c.id) ?? values.rarity[c.rarity] ?? 0;
      g.n++;
      g.value += v;
      if (!own) g.missing++;
      if (match?.(c) && (!rarity || c.rarity === rarity)) {
        g.targets++;
        if (!own) g.targetsNew++;
      }
      g.cards.push({ c, own, v });
    }
    if (!Object.keys(groups).length) groups = null;
  }
  const present = new Set(groups ? Object.keys(groups) : rarities.map((r) => r.code));
  const missingShare = b.pool?.cards ? (b.pool.missing ?? 0) / b.pool.cards : 0;
  let ev = 0;
  let fresh = 0;
  let noTarget = 1;
  let noTargetNew = 1;
  let noFresh = 1;
  const perCard = {}; // chance of one given card of each rarity, over the whole booster
  const byRarity = {}; // code -> { count, none, fresh, noFresh }
  for (const odds of slotOdds(rarities, present, b.minRank)) {
    let hit = 0;
    let hitNew = 0;
    let freshHere = 0;
    for (const [code, p] of Object.entries(odds)) {
      const g = groups?.[code];
      const share = g ? g.missing / g.n : missingShare;
      const r = (byRarity[code] ??= { count: 0, none: 1, fresh: 0, noFresh: 1 });
      r.count += p;
      r.none *= 1 - p;
      r.fresh += p * share;
      r.noFresh *= 1 - p * share;
      ev += p * (g ? g.value / g.n : values.rarity[code] ?? 0);
      fresh += p * share;
      freshHere += p * share;
      if (g) {
        hit += (p * g.targets) / g.n;
        hitNew += (p * g.targetsNew) / g.n;
        perCard[code] = (perCard[code] ?? 0) + p / g.n;
      }
    }
    noTarget *= 1 - hit;
    noTargetNew *= 1 - hitNew;
    noFresh *= 1 - freshHere;
  }
  const odds = {};
  for (const [code, r] of Object.entries(byRarity))
    odds[code] = {
      chance: 1 - r.none, // at least one card of this rarity
      count: r.count, // cards of this rarity, on average
      freshChance: 1 - r.noFresh, // at least one new card of this rarity
      fresh: r.fresh, // new cards of this rarity, on average
      perFresh: r.fresh > 0 ? b.price / r.fresh : null,
      pool: groups?.[code]?.n ?? null,
      missing: groups?.[code]?.missing ?? null
    };
  const cards = groups ? Object.values(groups).flatMap((g) => g.cards) : [];
  const withChance = (x) => ({ ...x, chance: perCard[x.c.rarity] ?? 0 });
  const best = cards
    .filter((x) => !x.own && (!rarity || x.c.rarity === rarity))
    .sort((x, y) => y.v - x.v || RANK[y.c.rarity] - RANK[x.c.rarity] || x.c.name.localeCompare(y.c.name))
    .slice(0, 4)
    .map(withChance);
  const targets = match
    ? cards
        .filter((x) => match(x.c) && (!rarity || x.c.rarity === rarity))
        .map(withChance)
        .sort((x, y) => y.chance - x.chance)
        .slice(0, 6)
    : [];
  const targetChance = match && groups ? 1 - noTarget : null;
  const targetNewChance = match && groups ? 1 - noTargetNew : null;
  return {
    ev,
    ratio: b.price ? ev / b.price : 0,
    fresh,
    perFresh: fresh > 0 ? b.price / fresh : null,
    freshChance: 1 - noFresh, // at least one new card
    odds,
    targetChance,
    perTarget: targetChance ? b.price / targetChance : null,
    targetNewChance,
    targetsFound: groups ? Object.values(groups).reduce((n, g) => n + g.targets, 0) : 0,
    targetsMissing: groups ? Object.values(groups).reduce((n, g) => n + g.targetsNew, 0) : 0,
    targets,
    best
  };
}

// Every booster of the shop with its numbers; query narrows to a character (field "name") or a series ("series"), rarity to one rarity.
export async function boosterReport(query = '', rarity = '', field = '') {
  const [shop, rarities, mineSc, catalog] = await Promise.all([
    cached('shop', 60e3, () => game('/shop')),
    cached('rarities', 30 * 60e3, () => game('/rarities').then((r) => r.rarities ?? [])),
    myShowcase(),
    loadCatalog()
  ]);
  const mine = countCopies(mineSc);
  const values = valueTable();
  const q = fold(query);
  const inName = (c) => fold(c.name).includes(q);
  const inSeries = (c) => fold(c.series?.title).includes(q);
  const match = q ? (field === 'name' ? inName : field === 'series' ? inSeries : (c) => inName(c) || inSeries(c)) : null;
  const pick = RANK[rarity] ? rarity : '';
  const rows = boosterList(shop).map((b) => ({ b, a: analyse(b, { rarities, catalog, mine, values, match, rarity: pick }) }));
  // Names (or series) matching what was typed, for the suggestions of the search field.
  const suggestions =
    q && catalog
      ? [...new Set(catalog.filter(field === 'series' ? inSeries : inName).map((c) => (field === 'series' ? c.series?.title : c.name)))].filter(Boolean).slice(0, 8)
      : [];
  return {
    rows,
    suggestions,
    rarities: [...rarities].sort((x, y) => (x.rank ?? RANK[x.code]) - (y.rank ?? RANK[y.code])).map((r) => ({ code: r.code, name: r.name })),
    catalog: !!catalog,
    friends: showcases.size > 1
  };
}

// ---------- pity ----------

// Boosters after which the game guarantees a card of this rarity or better (the shop's text can update them).
export const PITY = { SSR: 60, UR: 190 };
// Relay that shares the openings of a player between their devices (relay/ in the repository).
export const RELAY = 'https://aquaman-relay.finch-arhold-git.workers.dev';
const PITY_EVENTS = 500; // more than the longest pity: older openings change nothing
const PITY_PULL = 60e3; // the other devices' openings are read once a minute at most

// Openings of the logged-in player kept by Aquaman: { events: [{ id, at, top }], unsynced: [id], syncedAt, syncError }.
async function pityState() {
  const id = await myId();
  const { pity = {}, pityRules } = await chrome.storage.local.get(['pity', 'pityRules']);
  const mine = { events: [], unsynced: [], syncedAt: 0, syncError: null, ...pity[id] };
  return { id, all: pity, mine, rules: { ...PITY, ...pityRules } };
}

async function savePity({ id, all, mine }) {
  await chrome.storage.local.set({ pity: { ...all, [id]: mine } });
}

// What's left before each guarantee; "known" once a card of that rarity was seen, else an upper bound.
function pityReport(mine, rules, sync) {
  const { events } = mine;
  const out = { opened: events.length, sync: sync ? (mine.syncError ? 'error' : mine.syncedAt ? 'ok' : 'waiting') : 'off', syncedAt: mine.syncedAt || null };
  for (const code of Object.keys(PITY)) {
    let last = -1;
    for (let i = events.length - 1; i >= 0; i--)
      if (events[i].top >= RANK[code]) {
        last = i;
        break;
      }
    const known = last >= 0;
    const since = known ? events.length - 1 - last : events.length;
    out[code] = { since, known, every: rules[code], left: Math.max(1, rules[code] - since) };
  }
  return out;
}

// Merges two lists of openings: each booster once, oldest first, the last PITY_EVENTS.
function mergeEvents(a, b) {
  const byId = new Map();
  for (const e of [...a, ...b]) if (e?.id && !byId.has(e.id)) byId.set(e.id, { id: String(e.id), at: Number(e.at) || 0, top: Number(e.top) || 0 });
  return [...byId.values()].sort((x, y) => x.at - y.at).slice(-PITY_EVENTS);
}

// Sends this device's new openings to the relay and takes those of the other devices.
async function exchangePity(state, force) {
  const { mine } = state;
  if (!force && !mine.unsynced.length && Date.now() - mine.syncedAt < PITY_PULL) return;
  const waiting = new Set(mine.unsynced);
  try {
    const res = await fetch(`${RELAY}/pity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ player: state.id, events: mine.events.filter((e) => waiting.has(e.id)) })
    });
    if (!res.ok) throw new Error(`relay_${res.status}`);
    const { events } = await res.json();
    mine.events = mergeEvents(mine.events, Array.isArray(events) ? events : []);
    mine.unsynced = mine.unsynced.filter((id) => !waiting.has(id));
    mine.syncedAt = Date.now();
    mine.syncError = null;
  } catch (e) {
    mine.syncError = e?.message || 'relay';
  }
  await savePity(state);
}

// Pity counters, with the other devices' openings when syncing is on (fresh: asks the relay even if it was just asked).
export async function pity(fresh = false) {
  const state = await pityState();
  const on = (await getSettings()).syncPity;
  if (on) await exchangePity(state, fresh);
  return pityReport(state.mine, state.rules, on);
}

// Records opened boosters, each as the rarities of its cards; every opening gets its own id, sent once to the relay.
export async function recordOpening(boosters) {
  const state = await pityState();
  const { mine, rules } = state;
  const now = Date.now();
  const added = boosters.map((rarities, i) => ({
    id: `${(now + i).toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    at: now + i,
    top: Math.max(0, ...rarities.map((r) => RANK[r] ?? 0))
  }));
  mine.events = mergeEvents(mine.events, added);
  mine.unsynced = [...new Set([...mine.unsynced, ...added.map((e) => e.id)])].slice(-PITY_EVENTS);
  const on = (await getSettings()).syncPity;
  if (on) await exchangePity(state, true);
  else await savePity(state);
  return pityReport(mine, rules, on);
}

// Keeps the numbers of the shop's text ("une SSR tous les 60 boosters et une UR tous les 190").
export async function setPityRules(rules) {
  const clean = Object.fromEntries(
    Object.keys(PITY)
      .filter((k) => Number(rules?.[k]) > 0)
      .map((k) => [k, Number(rules[k])])
  );
  if (Object.keys(clean).length) await chrome.storage.local.set({ pityRules: clean });
  return { ok: true };
}

// ---------- messages from content.js ----------

// Answers the data messages of the page code (background.js in the extension, bridge.js in the userscript).
export async function answer(msg) {
  try {
    switch (msg?.type) {
      case 'me-id':
        return { id: await myId() };
      case 'ownership':
        return await ownership();
      case 'friends':
        return await friends();
      case 'player':
        return await playerSummary(msg.id);
      case 'boosters':
        return await boosterReport(msg.query, msg.rarity, msg.field);
      case 'pity':
        return await pity(!!msg.fresh);
      case 'opened':
        return await recordOpening(msg.boosters ?? []);
      case 'pity-rules':
        return await setPityRules(msg.rules);
      case 'collection-stale':
        forget('showcase:', 'shop');
        return { ok: true };
      default:
        return { error: 'unknown_message' };
    }
  } catch (e) {
    return { error: e?.message || String(e), code: e?.code ?? null };
  }
}

// ---------- new versions published on GitHub ----------

// True when version a is newer than version b.
export const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
};

// Stores { version, url, zip, xpi } when the latest GitHub release is newer than this version, else nothing.
export async function checkUpdate() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new ApiError(res.status, `github_${res.status}`);
  const rel = await res.json();
  const version = String(rel.tag_name ?? '').replace(/^v/, '');
  if (version && newer(version, chrome.runtime.getManifest().version)) {
    const asset = (name) => rel.assets?.find((a) => a.name === name)?.browser_download_url ?? null;
    const update = {
      version,
      url: rel.html_url ?? `https://github.com/${REPO}/releases/latest`,
      zip: asset('aquaman-chromium.zip'),
      xpi: asset('aquaman-firefox.xpi')
    };
    await chrome.storage.local.set({ update });
    return update;
  }
  await chrome.storage.local.remove('update');
  return null;
}
