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
  syncPity: true,
  syncFavorites: true,
  syncWants: true,
  syncMarket: true,
  sharePulls: true
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

// Id of the logged-in player (read again after a minute: another account may have logged in meanwhile).
export function myId() {
  return cached('me-id', 60e3, async () => {
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
async function readShowcase(id) {
  const path = encodeURIComponent(id);
  try {
    return await game(`/players/${path}/showcase`);
  } catch {
    return game(`/public/players/${path}/showcase`);
  }
}

// The same, kept a while; its copies give the values of the cards.
function showcase(id, ttl = 5 * 60e3) {
  return cached(`showcase:${id}`, ttl, async () => {
    const sc = await readShowcase(id);
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

// Openings of the logged-in player kept by Aquaman: { events: [{ id, at, top }], unsynced: [id], syncedAt, syncError,
// sec }. sec: the relay's count of boosters since the last SEC ({ since, known }), over more than the events kept.
async function pityState() {
  const id = await myId();
  const { pity = {}, pityRules } = await chrome.storage.local.get(['pity', 'pityRules']);
  const mine = { events: [], unsynced: [], syncedAt: 0, syncError: null, ...pity[id] };
  return { id, all: pity, mine, rules: { ...PITY, ...pityRules } };
}

async function savePity({ id, all, mine }) {
  await chrome.storage.local.set({ pity: { ...all, [id]: mine } });
}

// Chance of a SEC in one everyday booster (4 free cards and a 5th of at least R), from the game's odds; null if unknown.
function secChance() {
  return cached('sec-chance', 30 * 60e3, async () => {
    const rarities = await game('/rarities').then((r) => r.rarities ?? []);
    if (!rarities.some((r) => r.code === 'SEC' && r.weight > 0)) return null;
    const miss = slotOdds(rarities, new Set(rarities.map((r) => r.code)), RANK.R).reduce((p, slot) => p * (1 - (slot.SEC ?? 0)), 1);
    return 1 - miss;
  }).catch(() => null);
}

// The SEC, which the game doesn't guarantee: boosters since the last one (the relay's count when it has one, as it
// goes further back), and the chance of one per booster (chance).
function secReport(mine, chance) {
  const { events } = mine;
  let last = -1;
  for (let i = events.length - 1; i >= 0; i--)
    if (events[i].top >= RANK.SEC) {
      last = i;
      break;
    }
  const local = { since: last >= 0 ? events.length - 1 - last : events.length, known: last >= 0 };
  const sec = mine.sec && mine.sec.since >= local.since ? mine.sec : local;
  return { since: sec.since, known: !!sec.known, chance };
}

// What's left before each guarantee; "known" once a card of that rarity was seen, else an upper bound.
function pityReport(mine, rules, sync, chance = null) {
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
  out.SEC = secReport(mine, chance);
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
    const { events, sec } = await res.json();
    mine.events = mergeEvents(mine.events, Array.isArray(events) ? events : []);
    mine.sec = Number.isFinite(sec?.since) ? { since: sec.since, known: !!sec.known } : null;
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
  return pityReport(state.mine, state.rules, on, await secChance());
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
  // The relay's SEC count goes on with the new openings until the next exchange.
  if (mine.sec) mine.sec = added.some((e) => e.top >= RANK.SEC) ? null : { ...mine.sec, since: mine.sec.since + added.length };
  mine.unsynced = [...new Set([...mine.unsynced, ...added.map((e) => e.id)])].slice(-PITY_EVENTS);
  const on = (await getSettings()).syncPity;
  if (on) await exchangePity(state, true);
  else await savePity(state);
  return pityReport(mine, rules, on, await secChance());
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

// ---------- favourite series and the game's searched cards ----------

// Series of the game with the player's progress: [{ id, slug, title, owned, total }].
export function seriesList() {
  return cached('series', 2 * 60e3, async () => (await game('/series')).series ?? []);
}

// Ids of the cards in the player's search list ("Je la cherche").
async function wantedIds() {
  const { wants } = await cached('wants', 30e3, () => game('/wants'));
  return new Set((wants ?? []).map((w) => w?.card?.id ?? w?.cardId).filter(Boolean));
}

// The cards searched by the player: those of the game's list, and those Aquaman keeps waiting for a free place
// (the game takes 100 cards at most).
async function searchedIds() {
  const [wanted, waiting] = await Promise.all([wantedIds().catch(() => new Set()), waitingIds()]);
  for (const id of waiting) wanted.add(id);
  return wanted;
}

// The cards waiting in Aquaman.
async function waitingIds() {
  return new Set((await chrome.storage.local.get('wantWaiting')).wantWaiting ?? []);
}

// Places of the game's search list: how many are taken, the cards Aquaman put there that the player now owns
// (to take out), those still searched, and the waiting cards still to send (neither owned nor already searched).
export async function wantRoom(waiting, sent) {
  forget('wants');
  const [wanted, { byCard }] = await Promise.all([wantedIds(), ownership()]);
  const has = (id) => byCard[id] > 0;
  return {
    count: wanted.size,
    obtained: sent.filter((id) => wanted.has(id) && has(id)),
    sent: sent.filter((id) => wanted.has(id) && !has(id)),
    waiting: waiting.filter((id) => !wanted.has(id) && !has(id))
  };
}

// Cards of one series, with the number of copies the player owns.
function seriesCards(id) {
  return cached(`series-cards:${id}`, 60e3, async () => (await game(`/cards?manga=${encodeURIComponent(id)}`)).cards ?? []);
}

const FAV_PULL = 60e3; // the other devices' favourites are read once a minute at most
let favSyncedAt = 0;

// The favourite series kept on this device: { list, at } (at: time of the last change, 0 if never changed here).
async function localFavorites() {
  const { favSeries, favAt } = await chrome.storage.local.get(['favSeries', 'favAt']);
  return { list: Array.isArray(favSeries) ? favSeries : [], at: Number(favAt) || 0 };
}

// Sends the list to the relay, which keeps the most recent one of all the player's devices, and takes it back.
async function exchangeFavorites(local) {
  try {
    const res = await fetch(`${RELAY}/favorites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ player: await myId(), list: local.list, at: local.at })
    });
    if (!res.ok) throw new Error(`relay_${res.status}`);
    const remote = await res.json();
    favSyncedAt = Date.now();
    if (Array.isArray(remote?.list) && Number(remote.at) > local.at) {
      await chrome.storage.local.set({ favSeries: remote.list, favAt: Number(remote.at) });
      return remote.list;
    }
  } catch {}
  return local.list;
}

// The drawings of every kind of booster published by the author (the relay keeps them a minute in the browsers).
export async function globalPacks() {
  try {
    const res = await fetch(`${RELAY}/packs`);
    if (!res.ok) throw new Error(`relay_${res.status}`);
    return (await res.json())?.packs ?? null;
  } catch {
    return null;
  }
}

// The kinds of boosters the shop sells ({ kind, name, art, types }), for the author's scan.
export async function packKinds() {
  const shop = await cached('shop', 60e3, () => game('/shop'));
  return (shop?.specials ?? []).map((s) => {
    const types = Array.isArray(s.types) ? s.types : [];
    return { kind: s.id, name: s.name ?? null, art: s.art ?? s.kindArt ?? s.image ?? (types[0] ? `/game/boosters/${types[0]}.webp` : null), types };
  });
}

// The favourite series, the same on every device when syncing is on.
export async function favoriteIds(fresh = false) {
  const local = await localFavorites();
  if (!(await getSettings()).syncFavorites || (!fresh && Date.now() - favSyncedAt < FAV_PULL)) return local.list;
  return exchangeFavorites(local);
}

// Adds (on) or removes a series from the favourites; returns the new list. Changes run one after the other,
// so that two stars clicked quickly both count.
let favChain = Promise.resolve();
export function setFavorite(id, on) {
  const run = favChain.then(async () => {
    const list = (await localFavorites()).list.filter((x) => x !== id);
    if (on) list.push(id);
    const local = { list, at: Date.now() };
    await chrome.storage.local.set({ favSeries: local.list, favAt: local.at });
    if ((await getSettings()).syncFavorites) await exchangeFavorites(local);
    return list;
  });
  favChain = run.catch(() => {});
  return run;
}

// The favourite series and their cards: owned copies and whether the player searches them.
export async function favoritesReport(fresh = false) {
  const [ids, all, wanted, waiting] = await Promise.all([favoriteIds(fresh), seriesList(), searchedIds(), waitingIds()]);
  const series = ids.map((id) => all.find((s) => s.id === id)).filter(Boolean);
  const cards = await Promise.all(series.map((s) => seriesCards(s.id).catch(() => [])));
  return {
    all: all.map((s) => ({ id: s.id, slug: s.slug, title: s.title, owned: s.owned ?? 0, total: s.total ?? 0 })),
    favorites: series.map((s, i) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      owned: s.owned ?? 0,
      total: s.total ?? 0,
      cards: cards[i].map((c) => ({ id: c.id, name: c.name, image: c.image, rarity: c.rarity, owned: c.owned ?? 0, wanted: wanted.has(c.id), waiting: waiting.has(c.id) }))
    }))
  };
}

// One series: cards the player doesn't have, those not searched yet, and whether it is a favourite.
export async function seriesStatus(id) {
  const [cards, wanted, favorites] = await Promise.all([seriesCards(id), searchedIds(), favoriteIds()]);
  const missing = cards.filter((c) => !(c.owned > 0));
  const toWant = missing.filter((c) => !wanted.has(c.id)).map((c) => c.id);
  return { missing: missing.length, toWant: toWant.length, toWantIds: toWant, favorite: favorites.includes(id) };
}

// ---------- the cards waiting in Aquaman, shared between the player's devices ----------

const WANTS_PULL = 60e3; // the other devices' list is read once a minute at most
let wantsSyncedAt = 0;

// The relay keeps the most recent lists of all the player's devices: it takes these ones if they are more recent
// (at: time of their last change), and sends back the ones it keeps.
async function postWants(body) {
  const res = await fetch(`${RELAY}/wants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`relay_${res.status}`);
  return res.json();
}

// The cards waiting for a place in the game's list, and those Aquaman put there, the same on every device: sent to the
// relay, and taken back when another device changed them later. content.js stamps wantsAt at each change; wantsFor:
// the account they belong to (a device that never synced adds its cards to those of the relay).
export async function syncWants(fresh = false) {
  if (!(await getSettings()).syncWants) return { off: true };
  if (!fresh && Date.now() - wantsSyncedAt < WANTS_PULL) return { skipped: true };
  wantsSyncedAt = Date.now();
  const player = await myId();
  const { wantWaiting = [], wantSent = [], wantsAt = 0, wantsFor } = await chrome.storage.local.get(['wantWaiting', 'wantSent', 'wantsAt', 'wantsFor']);
  const mine = wantsFor === player;
  const at = mine ? Number(wantsAt) || 0 : 0;
  try {
    let remote = await postWants({ player, waiting: mine ? wantWaiting : [], sent: mine ? wantSent : [], at });
    const theirs = Array.isArray(remote?.waiting) ? remote : { waiting: [], sent: [], at: 0 };
    if (!mine && wantsFor === undefined && (wantWaiting.length || wantSent.length)) {
      // First sync of this device: its cards join those of the other devices.
      const join = (x, y) => [...new Set([...x, ...y])];
      remote = await postWants({ player, waiting: join(theirs.waiting, wantWaiting).slice(0, 200), sent: join(theirs.sent ?? [], wantSent), at: Date.now() });
    } else if (Number(theirs.at) <= at) {
      if (!mine) await chrome.storage.local.set({ wantsFor: player });
      return { changed: false };
    } else remote = theirs;
    // A change made here meanwhile wins: it goes to the relay at the next sync.
    if (((await chrome.storage.local.get('wantsAt')).wantsAt ?? 0) !== wantsAt) return { changed: false };
    await chrome.storage.local.set({ wantWaiting: remote.waiting ?? [], wantSent: remote.sent ?? [], wantsAt: Number(remote.at) || Date.now(), wantsFor: player });
    return { changed: true };
  } catch (e) {
    wantsSyncedAt = 0;
    return { error: e?.message || 'relay' };
  }
}

// ---------- the market's lists, shared between the player's devices ----------
// marketBought: the cards bought on the market, their other sales hidden: joined from every device.
// sellWaiting: the copies waiting for a place on the market: the most recent list of any device wins (content.js
// stamps sellWaitingAt at each change), as the cards waiting for the search list.
// *For: the account each list belongs to (a device that never synced adds its own to those of the relay).

const MARKET_PULL = 60e3; // the other devices' lists are read once a minute at most
let marketSyncedAt = 0;

async function postList(body) {
  const res = await fetch(`${RELAY}/lists`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`relay_${res.status}`);
  return res.json();
}

export async function syncMarket(fresh = false) {
  if (!(await getSettings()).syncMarket) return { off: true };
  if (!fresh && Date.now() - marketSyncedAt < MARKET_PULL) return { skipped: true };
  marketSyncedAt = Date.now();
  try {
    const player = await myId();
    const bought = await syncBought(player);
    const sales = await syncSales(player);
    return { changed: bought || sales };
  } catch (e) {
    marketSyncedAt = 0;
    return { error: e?.message || 'relay' };
  }
}

// The cards bought on any device: the lists are joined, and the relay keeps the whole.
async function syncBought(player) {
  const { marketBought = [], marketBoughtFor } = await chrome.storage.local.get(['marketBought', 'marketBoughtFor']);
  const mine = marketBoughtFor === undefined || marketBoughtFor === player; // (another account's list stays out)
  const remote = await postList({ player, name: 'bought' });
  const theirs = Array.isArray(remote?.data) ? remote.data : [];
  const all = [...new Set([...theirs, ...(mine ? marketBought : [])])];
  if (all.length !== theirs.length) await postList({ player, name: 'bought', data: all, at: Math.max(Date.now(), (Number(remote?.at) || 0) + 1) });
  // (a card bought here meanwhile stays: it joins the relay's at the next sync)
  const now = (await chrome.storage.local.get('marketBought')).marketBought ?? [];
  const kept = [...new Set([...all, ...(mine ? now : [])])];
  const changed = kept.length !== now.length || !mine;
  if (changed || marketBoughtFor !== player) await chrome.storage.local.set({ marketBought: kept, marketBoughtFor: player });
  return changed;
}

// The copies waiting for a place on the market: the most recent list wins.
async function syncSales(player) {
  const { sellWaiting = [], sellWaitingAt = 0, sellWaitingFor } = await chrome.storage.local.get(['sellWaiting', 'sellWaitingAt', 'sellWaitingFor']);
  const mine = sellWaitingFor === player;
  const at = mine ? Number(sellWaitingAt) || 0 : 0;
  let remote = await postList({ player, name: 'sales', data: mine ? sellWaiting : [], at });
  const theirs = Array.isArray(remote?.data) ? remote : { data: [], at: 0 };
  if (!mine && sellWaitingFor === undefined && sellWaiting.length) {
    // First sync of this device: its copies join those of the other devices.
    const join = [...theirs.data, ...sellWaiting.filter((x) => !theirs.data.some((y) => y.copyId === x.copyId))].slice(0, 50);
    remote = await postList({ player, name: 'sales', data: join, at: Math.max(Date.now(), (Number(theirs.at) || 0) + 1) });
  } else if (Number(theirs.at) <= at) {
    if (!mine) await chrome.storage.local.set({ sellWaitingFor: player });
    return false;
  } else remote = theirs;
  // A change made here meanwhile wins: it goes to the relay at the next sync.
  if (((await chrome.storage.local.get('sellWaitingAt')).sellWaitingAt ?? 0) !== sellWaitingAt) return false;
  await chrome.storage.local.set({ sellWaiting: remote.data ?? [], sellWaitingAt: Number(remote.at) || Date.now(), sellWaitingFor: player });
  return true;
}

// ---------- the game's "beaux tirages": kept here, and shared in a public history on the relay ----------

const FEED_KEEP = 30 * 86400e3;
const FEED_MAX = 4000;
// The pulls seen are read every minute and sent to the relay every 5 minutes: the public history is at most
// 6 minutes behind the game while one Aquaman runs.
const SHARE_EVERY = 5 * 60e3;

// A pull kept here, in the shape of the game's feed (what the relay takes and gives back).
const asFeedPull = (p) => ({ card: { id: p.card.id, name: p.card.name, rarity: p.card.rarity, image: p.card.image, series: p.card.series }, serial: p.serial, player: p.player, pulledAt: new Date(p.at).toISOString() });

// Adds pulls of the game's feed to the history kept on this device (fromRelay: already in the public history).
export async function recordFeed(pulls, fromRelay = false) {
  const { feedLog = [], feedSince } = await chrome.storage.local.get(['feedLog', 'feedSince']);
  const byKey = new Map(feedLog.map((p) => [p.key, p]));
  for (const p of pulls ?? []) {
    const card = p?.card;
    if (!card?.id || !p.pulledAt) continue;
    const key = `${card.id}#${p.serial ?? ''}#${p.player?.id ?? ''}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      key,
      at: Date.parse(p.pulledAt) || Date.now(),
      serial: p.serial ?? null,
      player: p.player ? { id: p.player.id ?? null, name: p.player.name ?? null } : null,
      card: { id: card.id, name: card.name, image: card.image, rarity: card.rarity, maxCopies: card.maxCopies ?? null, series: card.series?.title ?? card.series ?? null },
      shared: fromRelay
    });
  }
  const since = Date.now() - FEED_KEEP;
  const kept = [...byKey.values()].filter((p) => p.at >= since).sort((a, b) => b.at - a.at).slice(0, FEED_MAX);
  await chrome.storage.local.set({ feedLog: kept, feedSince: feedSince ?? Date.now() });
  return kept.length;
}

// Sends the pulls not shared yet to the public history (every 5 minutes at most, "sharePulls" setting).
async function sharePulls(force = false) {
  const { feedSharedAt = 0 } = await chrome.storage.local.get('feedSharedAt');
  if (!force && Date.now() - feedSharedAt < SHARE_EVERY) return;
  if (!(await getSettings()).sharePulls) return;
  await chrome.storage.local.set({ feedSharedAt: Date.now() });
  // Everything waiting goes now, 100 pulls per request.
  for (let round = 0; round < 10; round++) {
    const { feedLog = [] } = await chrome.storage.local.get('feedLog');
    const todo = feedLog.filter((p) => !p.shared && ['SSR', 'UR', 'SEC'].includes(p.card.rarity)).slice(0, 100);
    if (!todo.length) return;
    try {
      const res = await fetch(`${RELAY}/pulls`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pulls: todo.map(asFeedPull) }) });
      if (!res.ok) return;
    } catch {
      return;
    }
    const sent = new Set(todo.map((p) => p.key));
    const { feedLog: now = [] } = await chrome.storage.local.get('feedLog');
    await chrome.storage.local.set({ feedLog: now.map((p) => (sent.has(p.key) ? { ...p, shared: true } : p)) });
  }
}

// Reads the game's feed (once a minute at most), keeps its pulls and shares them.
export async function pollFeed() {
  const { pulls } = await cached('feed', 50e3, () => game('/feed'));
  const kept = await recordFeed(pulls);
  await sharePulls();
  scanPullers(pulls);
  return kept;
}

// The public history of the relay ({ pulls, since, total }), or null when it doesn't answer.
async function relayPulls(params) {
  try {
    const res = await fetch(`${RELAY}/pulls?${new URLSearchParams(params)}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// ---------- the rare cards of the players seen in the "beaux tirages" ----------

const RARE = ['SSR', 'UR', 'SEC'];
const SCAN_AGAIN = 12 * 3600e3; // a player's collection is read again after 12 hours (the relay says the same)
const SCAN_MAX = 6; // collections read at each look at the feed
let scanning = false;

// The players who just pulled a SSR, UR or SEC: their collection is read (public ones only) and their SSR, UR and SEC
// cards go to the relay, which keeps who has which card for "Qui a cette carte ?" ("sharePulls" setting).
async function scanPullers(pulls) {
  if (scanning) return;
  const ids = [...new Set((pulls ?? []).filter((p) => RARE.includes(p?.card?.rarity) && p.player?.id).map((p) => p.player.id))];
  if (!ids.length || !(await getSettings()).sharePulls) return;
  scanning = true;
  try {
    const { scannedAt = {} } = await chrome.storage.local.get('scannedAt');
    const now = Date.now();
    for (const id in scannedAt) if (now - scannedAt[id] > SCAN_AGAIN) delete scannedAt[id];
    const todo = ids.filter((id) => !scannedAt[id]).slice(0, 40);
    if (!todo.length) return;
    // The relay says which ones nobody read lately (another Aquaman may have just done it).
    const res = await fetch(`${RELAY}/holdings/stale?players=${todo.map(encodeURIComponent).join(',')}`);
    if (!res.ok) return;
    const { stale = [] } = await res.json();
    const read = stale.slice(0, SCAN_MAX);
    for (const id of todo) if (!stale.includes(id) || read.includes(id)) scannedAt[id] = now;
    await chrome.storage.local.set({ scannedAt });
    for (const id of read) {
      try {
        const sc = await readShowcase(id);
        const cards = new Map();
        for (const copy of sc.private ? [] : sc?.copies ?? []) {
          if (!RARE.includes(copy?.card?.rarity) || !copy.card.id) continue;
          const c = cards.get(copy.card.id) ?? { id: copy.card.id, count: 0, serials: [] };
          c.count++;
          if (Number.isInteger(copy.serial)) c.serials.push(copy.serial);
          cards.set(c.id, c);
        }
        await fetch(`${RELAY}/holdings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ player: { id, name: sc.player?.name ?? null }, private: !!sc.private, cards: [...cards.values()] })
        });
      } catch {}
    }
  } catch {
  } finally {
    scanning = false;
  }
}

// The players the relay knows to have a card ({ owners, scanned }), or null when it doesn't answer.
async function relayHoldings(card) {
  try {
    const res = await fetch(`${RELAY}/holdings?card=${encodeURIComponent(card)}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Recent pulls whose character or series matches the query (the latest ones without a query), here and on the relay.
export async function whoPulled(query = '', rarity = '') {
  const q = fold(query);
  const [, remote] = await Promise.all([pollFeed().catch(() => {}), relayPulls(q.length >= 2 ? { q, limit: 200 } : { limit: 100 })]);
  if (remote?.pulls) await recordFeed(remote.pulls, true);
  const { feedLog = [], feedSince = null } = await chrome.storage.local.get(['feedLog', 'feedSince']);
  const hits = feedLog.filter((p) => (!rarity || p.card.rarity === rarity) && (!q || fold(p.card.name).includes(q) || fold(p.card.series).includes(q)));
  const names = q ? [...new Set(feedLog.filter((p) => fold(p.card.name).includes(q)).map((p) => p.card.name))].slice(0, 8) : [];
  return {
    pulls: hits.slice(0, 200),
    total: hits.length,
    kept: Math.max(feedLog.length, remote?.total ?? 0),
    since: Math.min(feedSince ?? Infinity, remote?.since ?? Infinity) === Infinity ? null : Math.min(feedSince ?? Infinity, remote?.since ?? Infinity),
    shared: !!remote,
    latest: remote?.latest ?? null,
    suggestions: names
  };
}

// ---------- who has a card ----------

// Cards of the whole game whose name matches (the game's own search).
export async function searchCards(query) {
  const q = String(query ?? '').trim();
  if (q.length < 2) return [];
  const { cards } = await cached(`card-search:${fold(q)}`, 5 * 60e3, () => game(`/cards?q=${encodeURIComponent(q)}&limit=12`));
  return (cards ?? []).map((c) => ({ id: c.id, name: c.name, variant: c.variant ?? null, image: c.image, rarity: c.rarity, series: c.series?.title ?? null, owned: c.owned ?? 0 }));
}

// The cheapest offers of a card on the market, the cheapest first (5 at most), and how many there are.
export async function cardListings(id) {
  const card = await cached(`card:${id}`, 5 * 60e3, () => game(`/cards/${encodeURIComponent(id)}`));
  const { listings } = await cached(`listings:${id}`, 30e3, () => game(`/market/listings?${new URLSearchParams({ sort: 'price', q: card.name })}`));
  const offers = (listings ?? [])
    .filter((l) => (l.card?.id ?? l.cardId) === id && typeof l.price === 'number')
    .map((l) => {
      const seller = l.seller ?? l.player ?? null;
      return { id: l.id ?? null, price: l.price, serial: l.serial ?? l.copy?.serial ?? null, player: seller ? { id: seller.id, name: seller.name } : null };
    })
    .sort((a, b) => a.price - b.price);
  return { offers: offers.slice(0, 5), count: offers.length, maxCopies: card.maxCopies ?? null };
}

// Everyone Aquaman can see with a card: holders (limited cards), sellers, friends, and recent pulls.
export async function cardOwners(id) {
  const card = await game(`/cards/${encodeURIComponent(id)}`);
  // The game lists the holders of the limited cards only (an empty list for the others means "not published").
  const holders = card.maxCopies && Array.isArray(card.holders) ? card.holders.map((x) => ({ serial: x.serial ?? null, player: x.player ? { id: x.player.id, name: x.player.name } : null })) : null;

  let market = [];
  try {
    const { listings } = await game(`/market/listings?${new URLSearchParams({ sort: 'price', q: card.name })}`);
    market = (listings ?? [])
      .filter((l) => (l.card?.id ?? l.cardId) === id)
      .map((l) => {
        const seller = l.seller ?? l.player ?? null;
        return { price: l.price ?? null, serial: l.serial ?? l.copy?.serial ?? null, player: seller ? { id: seller.id, name: seller.name } : null };
      });
  } catch {}

  let mates = [];
  try {
    const { me, friends: list } = await friends();
    const people = [{ id: me, name: null, me: true }, ...list];
    await Promise.all(
      people.map(async (p) => {
        try {
          const sc = await showcase(p.id);
          if (sc.private) return;
          const copies = (sc.copies ?? []).filter((c) => c.card?.id === id);
          if (copies.length) mates.push({ player: { id: p.id, name: p.name ?? sc.player?.name ?? null }, me: !!p.me, count: copies.length, serials: copies.map((c) => c.serial).filter((n) => n != null) });
        } catch {}
      })
    );
    mates.sort((a, b) => b.me - a.me || b.count - a.count);
  } catch {}

  // The players whose collection was read after one of their beaux tirages, other than the player and their friends.
  const known = await relayHoldings(id);
  const mateIds = new Set(mates.map((m) => m.player.id));
  const seen = (known?.owners ?? []).filter((o) => o.player?.id && !mateIds.has(o.player.id));

  const remote = await relayPulls({ card: id, limit: 200 });
  if (remote?.pulls) await recordFeed(remote.pulls, true);
  const { feedLog = [], feedSince = null } = await chrome.storage.local.get(['feedLog', 'feedSince']);
  const pulls = feedLog.filter((p) => p.card.id === id).map((p) => ({ at: p.at, serial: p.serial, player: p.player }));
  const since = Math.min(feedSince ?? Infinity, remote?.since ?? Infinity);

  return {
    card: {
      id: card.id ?? id,
      name: card.name,
      variant: card.variant ?? null,
      image: card.image,
      rarity: card.rarity,
      series: card.series?.title ?? null,
      owners: card.owners ?? null,
      circulation: card.circulation ?? null,
      wants: card.wants ?? null,
      minted: card.minted ?? null,
      maxCopies: card.maxCopies ?? null,
      owned: Array.isArray(card.copies) ? card.copies.length : 0
    },
    holders,
    market,
    friends: mates,
    seen,
    scanned: known?.scanned ?? null,
    pulls,
    pullsSince: since === Infinity ? null : since,
    shared: !!remote
  };
}

// Players seen in the "beaux tirages" kept by Aquaman (the most recent first), other than the player and their friends.
export async function knownPlayers(max = 120) {
  const { me, friends: list } = await friends().catch(() => ({ me: null, friends: [] }));
  const skip = new Set([me, ...list.map((f) => f.id)]);
  const { feedLog = [] } = await chrome.storage.local.get('feedLog');
  let remote = [];
  try {
    const res = await fetch(`${RELAY}/players?limit=${max}`);
    if (res.ok) remote = (await res.json()).players ?? [];
  } catch {}
  const seen = new Map();
  for (const p of [...remote, ...feedLog.map((x) => x.player).filter(Boolean)])
    if (p.id && !skip.has(p.id) && !seen.has(p.id)) seen.set(p.id, { id: p.id, name: p.name ?? null });
  return [...seen.values()].slice(0, max);
}

// Which of these players have the card, read in their public collections.
export async function ownersAmong(cardId, players) {
  const found = [];
  let hidden = 0;
  await Promise.all(
    players.slice(0, 12).map(async (p) => {
      try {
        const sc = await showcase(p.id, 30 * 60e3);
        if (sc.private) return void hidden++;
        const copies = (sc.copies ?? []).filter((c) => c.card?.id === cardId);
        if (copies.length) found.push({ player: { id: p.id, name: p.name ?? sc.player?.name ?? null }, count: copies.length, serials: copies.map((c) => c.serial).filter((n) => n != null) });
      } catch {
        hidden++;
      }
    })
  );
  return { found, hidden };
}

// ---------- who uses Aquaman (the author only) ----------

const HELLO_EVERY = 9.5 * 60e3; // content.js says hello every 10 minutes while a page of the game is open

// Tells the relay, every 10 minutes at most, that this player uses Aquaman (kind: "extension" or "userscript").
export async function sayHello(kind) {
  const id = await myId();
  const { helloAt = 0, helloKind, helloFor } = await chrome.storage.local.get(['helloAt', 'helloKind', 'helloFor']);
  if (Date.now() - helloAt < HELLO_EVERY && helloKind === kind && helloFor === id) return { ok: true, skipped: true };
  let name = null;
  try {
    name = (await showcase(id)).player?.name ?? null;
  } catch {}
  const res = await fetch(`${RELAY}/hello`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ player: id, name, kind, version: chrome.runtime.getManifest().version })
  });
  if (res.ok) await chrome.storage.local.set({ helloAt: Date.now(), helloKind: kind, helloFor: id });
  return { ok: res.ok };
}

// ---------- the author's devices: a key per device, approved once ----------

// The device's key pair, made once: the private key can't be read out (not even by Aquaman), only used to sign.
function keyStore(mode, use) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('aquaman-keys', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('keys', mode);
      const req = use(tx.objectStore('keys'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}

async function deviceKey() {
  let key = await keyStore('readonly', (store) => store.get('device'));
  if (!key) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
    key = { privateKey: pair.privateKey, pub: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y } };
    await keyStore('readwrite', (store) => store.put(key, 'device'));
  }
  return key;
}

const toBase64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// A request to the relay's /admin/ addresses, signed with this device's key once it has an id.
async function adminFetch(method, path, body, extra = {}) {
  const { adminDevice } = await chrome.storage.local.get('adminDevice');
  const text = body ? JSON.stringify(body) : '';
  const headers = { 'content-type': 'application/json', ...extra };
  if (adminDevice?.id) {
    const { privateKey } = await deviceKey();
    const time = Date.now();
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(`${method} ${path} ${time} ${text}`));
    Object.assign(headers, { 'x-aqm-device': adminDevice.id, 'x-aqm-time': String(time), 'x-aqm-sig': toBase64url(sig) });
  }
  return fetch(`${RELAY}${path}`, { method, headers, body: text || undefined });
}

// This device: { id, state: "pending" | "approved" } or null, checked with the relay while it waits.
async function adminDevice() {
  const { adminDevice: device } = await chrome.storage.local.get('adminDevice');
  if (device?.state !== 'pending') return device ?? null;
  const res = await fetch(`${RELAY}/admin/devices/state?id=${device.id}`);
  const { state } = res.ok ? await res.json() : { state: 'pending' };
  if (state === 'unknown') {
    await chrome.storage.local.remove('adminDevice');
    return null;
  }
  const next = { ...device, state };
  await chrome.storage.local.set({ adminDevice: next });
  return next;
}

// Asks the relay to approve this device (name: what the author will see, "Brave · Windows" for instance).
async function requestDevice(name) {
  const current = await adminDevice();
  if (current) return current;
  const { pub } = await deviceKey();
  const res = await fetch(`${RELAY}/admin/devices/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pub, name }) });
  if (!res.ok) throw new ApiError(res.status, 'relay', `Le relais refuse la demande (${res.status}).`);
  const device = await res.json();
  await chrome.storage.local.set({ adminDevice: device });
  return device;
}

// Approves this device with the owner's code (only needed for the first device).
async function approveWithCode(token, name) {
  const device = await requestDevice(name);
  const res = await fetch(`${RELAY}/admin/devices/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${String(token).trim()}` },
    body: JSON.stringify({ id: device.id })
  });
  if (res.status === 403) return { wrong: true, device };
  if (!res.ok) throw new ApiError(res.status, 'relay', `Le relais ne répond pas (${res.status}).`);
  const approved = { ...device, state: 'approved' };
  await chrome.storage.local.set({ adminDevice: approved });
  return { device: approved };
}

// A signed request of the author; a refused one means this device was revoked.
async function asAuthor(method, path, body) {
  const device = await adminDevice();
  if (device?.state !== 'approved') return { needDevice: true, device };
  const res = await adminFetch(method, path, body);
  if (res.status === 403) {
    await chrome.storage.local.remove('adminDevice');
    return { needDevice: true, device: null, revoked: true };
  }
  if (!res.ok) throw new ApiError(res.status, 'relay', `Le relais ne répond pas (${res.status}).`);
  return res.json();
}

// Every player who used Aquaman.
export const aquamanUsers = () => asAuthor('GET', '/admin/users');


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
      case 'favorites':
        return await favoritesReport(!!msg.fresh);
      case 'packs-global':
        return { packs: await globalPacks() };
      case 'pack-kinds':
        return { kinds: await packKinds() };
      case 'packs-publish':
        return await asAuthor('POST', '/admin/packs', { packs: msg.packs ?? {} });
      case 'favorite':
        return { favorites: await setFavorite(msg.id, !!msg.on) };
      case 'series-status':
        return await seriesStatus(msg.id);
      case 'wants-changed':
        forget('wants', 'series');
        return { ok: true };
      case 'want-room':
        return await wantRoom(msg.waiting ?? [], msg.sent ?? []);
      case 'wants-sync':
        return await syncWants(!!msg.fresh);
      case 'market-sync':
        return await syncMarket(!!msg.fresh);
      case 'card-search':
        return { cards: await searchCards(msg.query) };
      case 'card-listings':
        if (msg.fresh) forget(`listings:${msg.id}`, 'showcase:');
        return await cardListings(msg.id);
      case 'card-owners':
        return await cardOwners(msg.id);
      case 'known-players':
        return { players: await knownPlayers() };
      case 'owners-among':
        return await ownersAmong(msg.id, msg.players ?? []);
      case 'hello':
        return await sayHello(msg.kind);
      case 'aquaman-users':
        return await aquamanUsers();
      case 'admin-request':
        return { device: await requestDevice(msg.name) };
      case 'admin-code':
        return await approveWithCode(msg.token, msg.name);
      case 'admin-devices':
        return await asAuthor('GET', '/admin/devices');
      case 'admin-approve':
        return await asAuthor('POST', '/admin/devices/approve', { id: msg.id });
      case 'admin-revoke':
        return await asAuthor('POST', '/admin/devices/revoke', { id: msg.id });
      case 'who-pulled':
        return await whoPulled(msg.query, msg.rarity);
      case 'feed-poll':
        return { kept: await pollFeed() };
      case 'feed-seen':
        scanPullers(msg.pulls);
        return { kept: await recordFeed(msg.pulls) };
      case 'collection-stale':
        forget('showcase:', 'shop', 'series', 'wants');
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

// Stores { version, url, zip, xpi, script } when the latest GitHub release is newer than this version, else nothing.
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
      xpi: asset('aquaman-firefox.xpi'),
      script: asset('aquaman.user.js')
    };
    await chrome.storage.local.set({ update });
    return update;
  }
  await chrome.storage.local.remove('update');
  return null;
}
