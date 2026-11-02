// ==UserScript==
// @name         Aquaman
// @namespace    https://github.com/A-Finch13/Poseidon-TCG
// @version      1.1.0
// @description  Compagnon non officiel pour le jeu de cartes de poseidon-scans.net : classement entre amis, boosters rentables, cartes possédées dans les échanges, vitrine en glisser-déposer.
// @author       A-Finch13
// @license      MIT
// @match        https://poseidon-scans.net/*
// @icon         https://raw.githubusercontent.com/A-Finch13/Poseidon-TCG/main/icons/icon128.png
// @homepageURL  https://github.com/A-Finch13/Poseidon-TCG
// @supportURL   https://github.com/A-Finch13/Poseidon-TCG/issues
// @updateURL    https://github.com/A-Finch13/Poseidon-TCG/releases/latest/download/aquaman.user.js
// @downloadURL  https://github.com/A-Finch13/Poseidon-TCG/releases/latest/download/aquaman.user.js
// @run-at       document-start
// @inject-into  page
// @grant        none
// @noframes
// ==/UserScript==

/*
 * Aquaman — version script
 *
 * Ce script ajoute au jeu de cartes de poseidon-scans.net les mêmes fonctions que l'extension Aquaman :
 *  - onglet « Plus » à droite de Marché : classement des amis (cartes uniques, séries complètes)
 *    et boosters rentables (prix, taux de drop, persos et séries recherchés) ;
 *  - Échanges : cartes agrandies, pastille verte (carte possédée) ou rouge (manquante) ;
 *  - Collection : la molette fait défiler la bande des séries ;
 *  - Ma vitrine : glisser-déposer des cartes, à la souris ou au doigt ;
 *  - Accueil : cartes des « Beaux tirages » agrandies ;
 *  - visite guidée, nouveautés après chaque mise à jour, et réglages dans le menu « Plus ».
 *
 * Il ne communique qu'avec https://poseidon-scans.net : ta session reste dans ton navigateur et n'est envoyée nulle part ailleurs.
 * Si l'extension Aquaman est aussi installée, le script se met en retrait.
 *
 * Fichier généré par build.py à partir du code de l'extension (https://github.com/A-Finch13/Poseidon-TCG) : ne pas le modifier à la main.
 *
 * Parties du script, dans l'ordre :
 *  1. shim.js     — remplace les fonctions propres aux extensions (stockage, messages) ;
 *  2. aquaman.js  — accès à l'API du jeu, collections, calcul des boosters ;
 *  3. bridge.js   — fait dans la page le travail du service de fond de l'extension ;
 *  4. inject.js   — lit les réponses que le site reçoit déjà (boosters à ouvrir, collection modifiée) ;
 *  5. tutorial.js et content.js — étapes de la visite et nouveautés, puis tout ce qui s'affiche sur le site ;
 *  6. panel.js    — réglages dans le menu « Plus ».
 */
(() => {
'use strict';
if (window.__aquamanUserscript) return;
window.__aquamanUserscript = true;
const VERSION = '1.1.0';

// ---------- 1. src/userscript/shim.js : stockage et messages, à la place des fonctions d'extension ----------
// Userscript: the extension APIs used by the page code, rebuilt in the page.
// Storage in the site's localStorage under "aqm:" (in memory when full); messages answered by handle() (bridge.js).
const OWNER = 'userscript';

const chrome = (() => {
  const PREFIX = 'aqm:';
  const memory = new Map();
  const listeners = [];

  // Stored value of a key, or undefined.
  const read = (key) => {
    if (memory.has(key)) return memory.get(key);
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw != null) {
        const value = JSON.parse(raw);
        memory.set(key, value);
        return value;
      }
    } catch {}
    return undefined;
  };
  const write = (key, value) => {
    memory.set(key, value);
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {} // full: the value stays for this page
  };
  const drop = (key) => {
    memory.delete(key);
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {}
  };
  // Tells the listeners of storage.onChanged.
  const emit = (changes) => {
    if (!Object.keys(changes).length) return;
    setTimeout(() =>
      listeners.forEach((fn) => {
        try {
          fn(changes, 'local');
        } catch {}
      })
    );
  };
  const names = (keys) => (typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys ?? {}));

  // Another tab of the site changed a value.
  window.addEventListener('storage', (e) => {
    if (!e.key?.startsWith(PREFIX)) return;
    const key = e.key.slice(PREFIX.length);
    memory.delete(key);
    let newValue;
    try {
      newValue = e.newValue == null ? undefined : JSON.parse(e.newValue);
    } catch {}
    emit({ [key]: { newValue } });
  });

  return {
    runtime: {
      id: OWNER,
      getManifest: () => ({ version: VERSION }),
      sendMessage: (msg) => handle(msg).catch((e) => ({ error: e?.message ?? String(e) }))
    },
    storage: {
      local: {
        async get(keys) {
          const out = {};
          for (const key of names(keys)) {
            const value = read(key);
            if (value !== undefined) out[key] = value;
            else if (keys && typeof keys === 'object' && !Array.isArray(keys)) out[key] = keys[key];
          }
          return out;
        },
        async set(items) {
          const changes = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: read(key), newValue: value };
            write(key, value);
          }
          emit(changes);
        },
        async remove(keys) {
          const changes = {};
          for (const key of names(keys)) {
            changes[key] = { oldValue: read(key), newValue: undefined };
            drop(key);
          }
          emit(changes);
        }
      },
      onChanged: { addListener: (fn) => listeners.push(fn) }
    }
  };
})();

// ---------- 2. src/lib/aquaman.js : API du jeu, collections et boosters ----------
// Aquaman: access to the Poseidon Scans game API, collections, booster maths, settings and new versions.
// Used by the background worker (extension) and by bridge.js (userscript); content.js asks through messages.

const ORIGIN = 'https://poseidon-scans.net';
const REPO = 'A-Finch13/Poseidon-TCG';
const GAME = `${ORIGIN}/api-game/v1`;
const SOCIAL = `${ORIGIN}/api-social/v1`;
const RANK = { N: 1, R: 2, SR: 3, SSR: 4, UR: 5, SEC: 6 };

// ---------- settings ----------

const DEFAULTS = {
  notifyBoosters: true,
  notifyUpdated: true,
  syncPity: true,
  syncFavorites: true
};

// Settings with their default values.
async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...settings };
}

// Saves some settings.
async function setSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings });
  return settings;
}

// ---------- API ----------

class ApiError extends Error {
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
// Same as getJson for a change (PUT, DELETE…) without a body.
async function getJsonWith(url, method) {
  const res = await fetch(url, { method, credentials: 'include', headers: { accept: 'application/json' } });
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
function myId() {
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
async function gameStatus() {
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
function imageKey(src) {
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
async function ownership() {
  return countCopies(await myShowcase());
}

// Unique cards, total and completed series of a player.
async function playerSummary(id) {
  const sc = await showcase(id);
  if (sc.private) return { id, name: sc.player?.name ?? null, private: true };
  return { id, name: sc.player?.name ?? null, private: false, owned: sc.owned ?? 0, total: sc.total ?? 0, albums: sc.albums?.length ?? 0 };
}

// The logged-in player and their friends.
async function friends() {
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
async function boosterReport(query = '', rarity = '', field = '') {
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
const PITY = { SSR: 60, UR: 190 };
// Relay that shares the openings of a player between their devices (relay/ in the repository).
const RELAY = 'https://aquaman-relay.finch-arhold-git.workers.dev';
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
async function pity(fresh = false) {
  const state = await pityState();
  const on = (await getSettings()).syncPity;
  if (on) await exchangePity(state, fresh);
  return pityReport(state.mine, state.rules, on);
}

// Records opened boosters, each as the rarities of its cards; every opening gets its own id, sent once to the relay.
async function recordOpening(boosters) {
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
async function setPityRules(rules) {
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
function seriesList() {
  return cached('series', 2 * 60e3, async () => (await game('/series')).series ?? []);
}

// Ids of the cards in the player's search list ("Je la cherche").
async function wantedIds() {
  const { wants } = await cached('wants', 30e3, () => game('/wants'));
  return new Set((wants ?? []).map((w) => w?.card?.id ?? w?.cardId).filter(Boolean));
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

// The favourite series, the same on every device when syncing is on.
async function favoriteIds(fresh = false) {
  const local = await localFavorites();
  if (!(await getSettings()).syncFavorites || (!fresh && Date.now() - favSyncedAt < FAV_PULL)) return local.list;
  return exchangeFavorites(local);
}

// Adds (on) or removes a series from the favourites; returns the new list.
async function setFavorite(id, on) {
  const list = (await favoriteIds()).filter((x) => x !== id);
  if (on) list.push(id);
  const local = { list, at: Date.now() };
  await chrome.storage.local.set({ favSeries: local.list, favAt: local.at });
  if ((await getSettings()).syncFavorites) await exchangeFavorites(local);
  return list;
}

// The favourite series and their cards: owned copies and whether the player searches them.
async function favoritesReport(fresh = false) {
  const [ids, all, wanted] = await Promise.all([favoriteIds(fresh), seriesList(), wantedIds().catch(() => new Set())]);
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
      cards: cards[i].map((c) => ({ id: c.id, name: c.name, image: c.image, rarity: c.rarity, owned: c.owned ?? 0, wanted: wanted.has(c.id) }))
    }))
  };
}

// Puts one card in the player's search list (on) or takes it out.
async function wantCard(id, on) {
  const res = await getJsonWith(`${GAME}/cards/${encodeURIComponent(id)}/want`, on ? 'PUT' : 'DELETE');
  forget('wants');
  return { wanted: !!res?.wanted };
}

// Searches every card of a series the player doesn't have yet; stops at the first refusal of the game (a limit, for instance).
async function wantMissing(seriesId) {
  const [cards, wanted] = await Promise.all([seriesCards(seriesId), wantedIds()]);
  const todo = cards.filter((c) => !(c.owned > 0) && !wanted.has(c.id));
  let added = 0;
  let refused = null; // the game's message when it stops accepting
  for (const c of todo) {
    try {
      await getJsonWith(`${GAME}/cards/${encodeURIComponent(c.id)}/want`, 'PUT');
      added++;
    } catch (e) {
      refused = e.message;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  forget('wants');
  return { added, already: cards.filter((c) => !(c.owned > 0)).length - todo.length, left: todo.length - added, refused };
}

// ---------- who pulled a card: the game's "beaux tirages", kept a while ----------

const FEED_KEEP = 30 * 86400e3;
const FEED_MAX = 4000;

// Adds pulls of the game's feed to the history kept on this device.
async function recordFeed(pulls) {
  const { feedLog = [] } = await chrome.storage.local.get('feedLog');
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
      card: { id: card.id, name: card.name, image: card.image, rarity: card.rarity, maxCopies: card.maxCopies ?? null, series: card.series?.title ?? null }
    });
  }
  const since = Date.now() - FEED_KEEP;
  const kept = [...byKey.values()].filter((p) => p.at >= since).sort((a, b) => b.at - a.at).slice(0, FEED_MAX);
  await chrome.storage.local.set({ feedLog: kept, feedSince: (await chrome.storage.local.get('feedSince')).feedSince ?? Date.now() });
  return kept.length;
}

// Reads the game's feed (every 2 minutes at most) and keeps its pulls.
async function pollFeed() {
  const { pulls } = await cached('feed', 2 * 60e3, () => game('/feed'));
  return recordFeed(pulls);
}

// Recent pulls whose character or series matches the query (the latest ones without a query).
async function whoPulled(query = '', rarity = '') {
  await pollFeed().catch(() => {});
  const { feedLog = [], feedSince = null } = await chrome.storage.local.get(['feedLog', 'feedSince']);
  const q = fold(query);
  const hits = feedLog.filter((p) => (!rarity || p.card.rarity === rarity) && (!q || fold(p.card.name).includes(q) || fold(p.card.series).includes(q)));
  const names = q ? [...new Set(feedLog.filter((p) => fold(p.card.name).includes(q)).map((p) => p.card.name))].slice(0, 8) : [];
  return { pulls: hits.slice(0, 200), total: hits.length, kept: feedLog.length, since: feedSince, suggestions: names };
}

// ---------- messages from content.js ----------

// Answers the data messages of the page code (background.js in the extension, bridge.js in the userscript).
async function answer(msg) {
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
      case 'favorite':
        return { favorites: await setFavorite(msg.id, !!msg.on) };
      case 'want':
        return await wantCard(msg.id, !!msg.on);
      case 'want-missing':
        return await wantMissing(msg.id);
      case 'who-pulled':
        return await whoPulled(msg.query, msg.rarity);
      case 'feed-poll':
        return { kept: await pollFeed() };
      case 'feed-seen':
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
const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
};

// Stores { version, url, zip, xpi } when the latest GitHub release is newer than this version, else nothing.
async function checkUpdate() {
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

// ---------- 3. src/userscript/bridge.js : le travail du service de fond, dans la page ----------
// Userscript: the background worker's answers to the page code, done in the page.
// No badge, notifications or updater here: the script manager installs new versions by itself.

// Answers the messages of the page code.
async function handle(msg) {
  switch (msg?.type) {
    case 'status':
    case 'check-update':
      return { ok: true };
    case 'install-update':
      return { error: 'userscript' };
    case 'open':
      location.assign(msg.href);
      return { ok: true };
    default:
      return answer(msg);
  }
}

// ---------- 4. src/content/inject.js : lit les réponses que le site reçoit déjà ----------
// Runs in the page before it loads: tells content.js what the site's own requests change, without changing them.
//   { aquaman: 'status', pending }   boosters waiting, read from the site's /api-game/v1/me answers
//   { aquaman: 'opened', boosters }  boosters just opened, each as the rarities of its cards (for the pity counters)
//   { aquaman: 'feed', pulls }       the game's "beaux tirages", read from its /api-game/v1/feed answers
//   { aquaman: 'collection-stale' }  a booster was opened, or a trade, sale or purchase went through
(() => {
  if (window.__aquamanHook) return;
  window.__aquamanHook = true;

  const ME = /^\/api-game\/v1\/me$/;
  const FEED = /^\/api-game\/v1\/feed$/;
  const OPEN = /^\/api-game\/v1\/boosters\/([^/]+\/open|open-many|open)$/;
  const WRITE = /^\/api-game\/v1\/(boosters\/[^/]+\/open|boosters\/open(-many)?|shop\/booster|trades(\/.*)?|market\/.*|auctions(\/.*)?|copies(\/.*)?)$/;
  const RARITIES = ['N', 'R', 'SR', 'SSR', 'UR', 'SEC'];
  const original = window.fetch;

  const post = (data) => window.postMessage({ aquaman: data.type, ...data }, location.origin);

  // Path of a same-origin request, or null.
  function pathOf(input) {
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      return url.origin === location.origin ? url.pathname : null;
    } catch {
      return null;
    }
  }

  // Rarities of the cards of one booster's answer ({ pulls: [{ card: { rarity } }] }).
  const raritiesOf = (pulls) => pulls.map((p) => p?.card?.rarity ?? p?.rarity).filter((r) => RARITIES.includes(r));

  // The boosters of an opening answer: one booster, or several (open-many).
  function openedBoosters(body) {
    if (Array.isArray(body?.pulls)) return [raritiesOf(body.pulls)];
    const list = body?.boosters ?? body?.results ?? body?.opened ?? (Array.isArray(body) ? body : null);
    if (Array.isArray(list)) return list.filter((b) => Array.isArray(b?.pulls)).map((b) => raritiesOf(b.pulls));
    return [];
  }

  window.fetch = async function (input, init) {
    const res = await original.apply(this, arguments);
    try {
      const path = pathOf(input);
      const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (path && res.ok) {
        if (method === 'GET' && ME.test(path)) {
          res
            .clone()
            .json()
            .then((me) => Array.isArray(me?.pending) && post({ type: 'status', pending: me.pending.length }))
            .catch(() => {});
        } else if (method === 'GET' && FEED.test(path)) {
          res
            .clone()
            .json()
            .then((body) => Array.isArray(body?.pulls) && post({ type: 'feed', pulls: body.pulls }))
            .catch(() => {});
        } else if (method !== 'GET' && WRITE.test(path)) {
          if (OPEN.test(path))
            res
              .clone()
              .json()
              .then((body) => {
                const boosters = openedBoosters(body).filter((b) => b.length);
                if (boosters.length) post({ type: 'opened', boosters });
              })
              .catch(() => {});
          post({ type: 'collection-stale' });
        }
      }
    } catch {}
    return res;
  };
})();

const start = () => {
  const style = document.createElement('style');
  style.id = 'aquaman-style';
  style.textContent = `/* Aquaman : styles ajoutés au jeu de poseidon-scans.net. Tout est préfixé aqm-. */

.aqm-root {
  --aqm-bg: #0b0b0d;
  --aqm-panel: #121214;
  --aqm-card: #18181b;
  --aqm-line: rgba(255, 255, 255, 0.07);
  --aqm-text: #f4f4f5;
  --aqm-muted: #a1a1aa;
  --aqm-dim: #71717a;
  --aqm-accent: #60a5fa;
  --aqm-yes: #22c55e;
  --aqm-no: #ef4444;
  box-sizing: border-box;
}
.aqm-root *,
.aqm-root *::before,
.aqm-root *::after {
  box-sizing: border-box;
}

/* ---------- Onglet « Plus » et son menu ---------- */

.aqm-plus {
  cursor: pointer;
  background: none;
  border: 0;
}
.aqm-plus[aria-expanded='true'] {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}
.aqm-nav-ico,
.aqm-nav-ico svg {
  display: inline-block;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.aqm-menu {
  position: fixed;
  z-index: 2147483000;
  width: 290px;
  padding: 6px;
  border-radius: 18px;
  background: var(--aqm-panel);
  border: 1px solid var(--aqm-line);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  animation: aqm-pop 0.14s ease-out;
}
.aqm-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 12px;
  background: none;
  color: var(--aqm-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.aqm-menu-item:hover,
.aqm-menu-item:focus-visible {
  background: rgba(255, 255, 255, 0.06);
  outline: none;
}
.aqm-menu-item strong {
  display: block;
  font-size: 14px;
  font-weight: 800;
}
.aqm-menu-item small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--aqm-muted);
}
.aqm-menu-ico {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  background: rgba(96, 165, 250, 0.12);
  color: var(--aqm-accent);
}
.aqm-menu-ico svg {
  width: 18px;
  height: 18px;
}

@keyframes aqm-pop {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
}

/* ---------- Fenêtre ---------- */

html.aqm-lock {
  overflow: hidden;
}
.aqm-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147482000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 48px 16px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(6px);
  color: var(--aqm-text);
  animation: aqm-fade 0.16s ease-out;
}
@keyframes aqm-fade {
  from {
    opacity: 0;
  }
}
.aqm-panel {
  width: 100%;
  max-width: 860px;
  border-radius: 28px;
  background: var(--aqm-panel);
  border: 1px solid var(--aqm-line);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}
.aqm-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 26px 28px 8px;
}
.aqm-title {
  margin: 0;
  font-size: 22px;
  font-weight: 900;
  font-style: italic;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  color: #fff;
}
.aqm-sub {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--aqm-muted);
}
.aqm-close {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--aqm-muted);
  cursor: pointer;
}
.aqm-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
}
.aqm-close svg {
  width: 18px;
  height: 18px;
}
.aqm-body {
  padding: 12px 28px 28px;
}
.aqm-note {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--aqm-dim);
}
.aqm-muted {
  margin: 0;
  font-size: 12px;
  color: var(--aqm-muted);
}
.aqm-label {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--aqm-accent);
}

.aqm-empty {
  padding: 28px;
  text-align: center;
  color: var(--aqm-muted);
  list-style: none;
}

.aqm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.aqm-chip {
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--aqm-line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--aqm-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
}
.aqm-chip:hover {
  color: #fff;
}
.aqm-chip.is-on {
  border-color: rgba(96, 165, 250, 0.4);
  background: rgba(37, 99, 235, 0.22);
  color: #fff;
}

.aqm-place {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 13px;
  font-weight: 900;
  color: var(--aqm-muted);
}
.aqm-place-1 {
  background: linear-gradient(135deg, #fde68a, #f59e0b);
  color: #422006;
}
.aqm-place-2 {
  background: linear-gradient(135deg, #f4f4f5, #a1a1aa);
  color: #18181b;
}
.aqm-place-3 {
  background: linear-gradient(135deg, #fdba74, #c2410c);
  color: #fff7ed;
}

/* ---------- Classement des amis ---------- */

.aqm-board {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}
.aqm-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-radius: 18px;
  background: var(--aqm-card);
  border: 1px solid transparent;
}
.aqm-row.is-me {
  border-color: rgba(96, 165, 250, 0.35);
  background: linear-gradient(90deg, rgba(37, 99, 235, 0.14), var(--aqm-card) 60%);
}
.aqm-avatar {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 12px;
  object-fit: cover;
  background: #27272a;
}
.aqm-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 800;
  color: #fff;
  text-decoration: none;
}
.aqm-name:hover {
  text-decoration: underline;
}
.aqm-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(96, 165, 250, 0.18);
  color: #bfdbfe;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}
.aqm-stats {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-shrink: 0;
}
.aqm-stat {
  min-width: 170px;
  opacity: 0.6;
}
.aqm-stat.is-on {
  opacity: 1;
}
.aqm-stat strong {
  font-size: 18px;
  font-weight: 900;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.aqm-stat small {
  margin-left: 4px;
  font-size: 11px;
  color: var(--aqm-muted);
}
.aqm-bar {
  display: block;
  height: 4px;
  margin-top: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.aqm-bar > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
}

/* ---------- Boosters rentables ---------- */

.aqm-search {
  flex: 1 1 260px;
  height: 44px;
  padding: 0 18px;
  border: 1px solid var(--aqm-line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  font: inherit;
  font-size: 14px;
  outline: none;
}
.aqm-search:focus {
  border-color: rgba(96, 165, 250, 0.5);
}
.aqm-search::placeholder {
  color: var(--aqm-dim);
}

.aqm-pack {
  width: 64px;
  height: 92px;
  flex-shrink: 0;
  border-radius: 10px;
  object-fit: cover;
}
.aqm-pack-plain {
  display: grid;
  place-items: center;
  background: linear-gradient(160deg, #1e3a8a, #0ea5e9 55%, #e0f2fe);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
}
.aqm-pack-plain span {
  font-size: 11px;
  font-weight: 900;
  font-style: italic;
  text-transform: uppercase;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}

.aqm-perles {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-variant-numeric: tabular-nums;
}
.aqm-pearl {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: radial-gradient(circle at 35% 30%, #fff, #bfdbfe 45%, #60a5fa);
  box-shadow: 0 0 6px rgba(147, 197, 253, 0.6);
}

.aqm-strip {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.aqm-mini {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
}
.aqm-mini img {
  width: 34px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 5px;
  object-fit: cover;
}
.aqm-mini > div {
  min-width: 0;
}
.aqm-mini.is-owned img {
  box-shadow: 0 0 0 2px var(--aqm-yes);
}
.aqm-mini-name {
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 800;
  color: #fff;
}
.aqm-rarity {
  font-weight: 900;
  font-style: italic;
}
.aqm-r-N {
  color: #e4e4e7;
}
.aqm-r-R {
  color: #60a5fa;
}
.aqm-r-SR {
  color: #c4b5fd;
}
.aqm-r-SSR {
  color: #fde047;
}
.aqm-r-UR {
  color: #f9a8d4;
}
.aqm-r-SEC {
  color: #e2e8f0;
  text-shadow: 0 0 6px rgba(196, 181, 253, 0.8);
}

@media (max-width: 640px) {
  .aqm-overlay {
    padding: 16px 8px;
  }
  .aqm-head,
  .aqm-body {
    padding-left: 16px;
    padding-right: 16px;
  }
  .aqm-row {
    flex-wrap: wrap;
  }
  .aqm-stats {
    width: 100%;
    padding-left: 44px;
  }
  .aqm-stat {
    min-width: 0;
  }
  
  
  .aqm-pack {
    width: 48px;
    height: 69px;
  }
}

/* ---------- Échanges ---------- */

.aqm-trade-tile {
  zoom: 1.3;
}
.aqm-rel {
  position: relative;
}
.aqm-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  z-index: 5;
  min-width: 11px;
  height: 11px;
  border-radius: 999px;
  border: 2px solid rgba(0, 0, 0, 0.85);
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
  pointer-events: auto;
}
.aqm-dot.is-yes {
  background: var(--aqm-yes);
}
.aqm-dot.is-no {
  background: var(--aqm-no);
}
.aqm-dot.has-count {
  height: 13px;
  padding: 0 3px;
  font: 800 8px/9px system-ui, sans-serif;
  color: #052e16;
  text-align: center;
}

/* ---------- Accueil : beaux tirages ---------- */

.aqm-pull-thumb {
  zoom: 1.7;
}

/* ---------- Ma vitrine ---------- */

.aqm-hidden {
  display: none !important;
}
.aqm-slot {
  position: relative;
  cursor: grab;
  transition: transform 0.15s, opacity 0.15s;
}
.aqm-slot:active {
  cursor: grabbing;
}
.aqm-slot.aqm-dragging {
  opacity: 0.4;
}
.aqm-slot.aqm-over {
  transform: translateY(-4px);
  outline: 2px dashed #60a5fa;
  outline-offset: 3px;
  border-radius: 10px;
}
.aqm-moving .aqm-slot {
  pointer-events: none;
}
.aqm-slot-x {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 6;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(127, 29, 29, 0.9);
  color: #fecaca;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}
.aqm-slot-x svg {
  width: 12px;
  height: 12px;
}
.aqm-slot:hover .aqm-slot-x,
.aqm-slot-x:focus-visible {
  opacity: 1;
}
@media (hover: none) {
  .aqm-slot-x {
    opacity: 1;
  }
}
.aqm-slot {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.aqm-ghost {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483200;
  margin: 0;
  pointer-events: none;
  opacity: 0.92;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.6));
  will-change: transform;
}
.aqm-ghost .aqm-slot-x {
  display: none;
}

/* ---------- Visite guidée ---------- */

.aqm-tour {
  position: fixed;
  inset: 0;
  z-index: 2147483100;
  color: var(--aqm-text);
}
.aqm-tour-block {
  position: absolute;
  inset: 0;
}
.aqm-tour-hole {
  position: fixed;
  border-radius: 16px;
  box-shadow:
    0 0 0 2px rgba(96, 165, 250, 0.9),
    0 0 0 9999px rgba(0, 0, 0, 0.66);
  pointer-events: none;
  transition: all 0.25s ease;
}
.aqm-tour.is-dim .aqm-tour-block {
  background: rgba(0, 0, 0, 0.66);
}
.aqm-tour-card {
  position: fixed;
  top: 0;
  left: 0;
  width: min(360px, calc(100vw - 24px));
  padding: 18px 20px 16px;
  border-radius: 20px;
  background: var(--aqm-panel);
  border: 1px solid rgba(96, 165, 250, 0.25);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
  transition: transform 0.25s ease;
}
.aqm-tour-count {
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: var(--aqm-accent);
}
.aqm-tour-title {
  margin: 6px 0 0;
  font-size: 18px;
  font-weight: 900;
  font-style: italic;
  text-transform: uppercase;
  color: #fff;
}
.aqm-tour-text {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: #d4d4d8;
}
.aqm-tour-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}
.aqm-tour-gap {
  flex: 1;
}
.aqm-tour-skip,
.aqm-tour-btn {
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.aqm-tour-skip {
  padding: 0 4px;
  background: none;
  color: var(--aqm-dim);
}
.aqm-tour-skip:hover {
  color: #fff;
}
.aqm-tour-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.aqm-tour-btn.is-main {
  background: #2563eb;
}
.aqm-tour-btn:hover {
  filter: brightness(1.15);
}

/* ---------- Téléphone ---------- */

@media (max-width: 640px) {
  .aqm-overlay {
    padding: 0;
  }
  .aqm-panel {
    min-height: 100%;
    border-radius: 0;
    border: 0;
  }
  .aqm-head {
    position: sticky;
    top: 0;
    z-index: 2;
    padding-top: 18px;
    background: var(--aqm-panel);
  }
  .aqm-title {
    font-size: 19px;
  }
  .aqm-menu {
    width: min(290px, calc(100vw - 16px));
  }
  
  .aqm-strip {
    grid-template-columns: 1fr;
  }
  .aqm-pull-thumb {
    zoom: 1.4;
  }
  .aqm-trade-tile {
    zoom: 1.2;
  }
  .aqm-tour-actions {
    flex-wrap: wrap;
  }
}

/* ---------- Nouveautés ---------- */

.aqm-news-version {
  margin-top: 18px;
}
.aqm-news {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.aqm-news li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--aqm-card);
  font-size: 14px;
  line-height: 1.45;
  color: #e4e4e7;
}
.aqm-news .aqm-chip {
  flex-shrink: 0;
}
.aqm-news-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
@media (max-width: 640px) {
  .aqm-news li {
    flex-direction: column;
    align-items: flex-start;
  }
}

/* ---------- Boosters rentables : filtres, explications ---------- */

.aqm-filter-name {
  width: 86px;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--aqm-dim);
}
.aqm-chip-r {
  font-style: italic;
  font-weight: 900;
}
.aqm-chip-r.is-on {
  border-color: currentColor;
  background: rgba(255, 255, 255, 0.08);
}

.aqm-how {
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: 14px;
  background: var(--aqm-card);
  font-size: 13px;
  color: #d4d4d8;
}
.aqm-how summary {
  cursor: pointer;
  font-weight: 800;
  color: #fff;
}
.aqm-how ul {
  margin: 10px 0 0;
  padding-left: 18px;
  line-height: 1.55;
}
.aqm-how li + li {
  margin-top: 4px;
}

/* ---------- Collection : bandes attrapables ---------- */

.aqm-grab {
  cursor: grab;
}
html.aqm-grabbing,
html.aqm-grabbing * {
  cursor: grabbing !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}

/* ---------- Accueil : garantie anti-malchance ---------- */

.aqm-pity {
  width: min(460px, 100%);
  margin: 14px auto 0;
  padding: 12px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--aqm-line);
  text-align: left;
  color: var(--aqm-text);
}
.aqm-pity .aqm-label {
  margin-bottom: 8px;
  text-align: center;
}
.aqm-pity-lines {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.aqm-pity-line p {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #e4e4e7;
}
.aqm-pity-line strong {
  color: #fff;
  font-weight: 900;
}
.aqm-pity-line .aqm-bar {
  margin-top: 6px;
}
.aqm-pity-line small {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--aqm-muted);
  font-variant-numeric: tabular-nums;
}
.aqm-pity-line:has(.aqm-r-UR) .aqm-bar > span {
  background: linear-gradient(90deg, #38bdf8, #f472b6, #facc15);
}
.aqm-pity-line:has(.aqm-r-SSR) .aqm-bar > span {
  background: linear-gradient(90deg, #eab308, #fde047);
}
.aqm-pity-note {
  margin: 10px 0 0;
  font-size: 11px;
  text-align: center;
  color: var(--aqm-dim);
}
@media (max-width: 640px) {
  .aqm-pity-lines {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}

/* ---------- Quel booster ouvrir ? ---------- */

.aqm-panel.aqm-panel-wide {
  max-width: 1040px;
}
.aqm-goals {
  margin-top: 4px;
}
.aqm-goal {
  height: 38px;
  padding: 0 16px;
  font-size: 13px;
  text-transform: none;
  letter-spacing: 0;
}
.aqm-chip.aqm-goal.is-on {
  border-color: transparent;
  background: #2563eb;
}
.aqm-pick {
  margin-top: 10px;
}
.aqm-pick:empty {
  display: none;
}
.aqm-pick .aqm-chip {
  height: 36px;
  font-size: 13px;
  text-transform: none;
  letter-spacing: 0;
}
.aqm-pick .aqm-search {
  width: min(520px, 100%);
}
.aqm-sentence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin-top: 12px;
}
.aqm-sentence > p {
  margin: 0;
  font-size: 13px;
  color: #93c5fd;
}
.aqm-new .aqm-chip {
  height: 28px;
  padding: 0 10px;
  font-size: 11px;
}
.aqm-sorts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  margin-top: 14px;
}
.aqm-sorts .aqm-filter-name {
  width: auto;
  margin-right: 4px;
}
.aqm-sort {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 170px;
  padding: 9px 16px;
  border: 1px solid var(--aqm-line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  color: #fff;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.aqm-sort strong {
  font-size: 13px;
  font-weight: 800;
}
.aqm-sort small {
  font-size: 11px;
  color: var(--aqm-muted);
}
.aqm-sort:hover {
  background: rgba(255, 255, 255, 0.07);
}
.aqm-sort.is-on {
  border-color: transparent;
  background: #2563eb;
}
.aqm-sort.is-on small {
  color: #dbeafe;
}
.aqm-verdict {
  margin-top: 16px;
  padding: 14px 18px;
  border: 1px solid rgba(34, 197, 94, 0.55);
  border-radius: 16px;
  background: rgba(34, 197, 94, 0.06);
  font-size: 14px;
  line-height: 1.6;
  color: #e4e4e7;
}
.aqm-verdict p {
  margin: 0;
}
.aqm-verdict strong {
  color: #fff;
}
.aqm-ranking {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}
.aqm-rank {
  display: grid;
  grid-template-columns: 22px 44px minmax(0, 1fr) auto;
  align-items: start;
  gap: 4px 14px;
  padding: 14px 18px;
  border: 1px solid var(--aqm-line);
  border-radius: 16px;
  background: var(--aqm-card);
}
.aqm-rank.is-best {
  border-color: rgba(34, 197, 94, 0.6);
}
.aqm-rank-n {
  padding-top: 14px;
  font-size: 13px;
  font-weight: 800;
  color: var(--aqm-muted);
}
.aqm-rank .aqm-pack {
  width: 44px;
  height: 62px;
  border-radius: 7px;
}
.aqm-rank .aqm-pack-plain span {
  font-size: 7px;
}
.aqm-rank-main {
  min-width: 0;
}
.aqm-rank-main > p {
  margin: 0;
}
.aqm-rank-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}
.aqm-rank-title strong {
  font-size: 16px;
  font-weight: 900;
  color: #fff;
}
.aqm-rank-price {
  font-size: 12px;
  color: var(--aqm-muted);
}
.aqm-badge {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.aqm-badge.is-best {
  background: rgba(34, 197, 94, 0.16);
  color: #86efac;
}
.aqm-badge.is-cheap {
  background: rgba(96, 165, 250, 0.16);
  color: #bfdbfe;
}
.aqm-rank-head {
  margin-top: 4px !important;
  font-size: 14px;
  font-weight: 800;
  color: #fff;
}
.aqm-rank-sub {
  margin-top: 2px !important;
  font-size: 12px;
  color: var(--aqm-muted);
}
.aqm-rank-bar {
  height: 5px;
  margin-top: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  overflow: hidden;
}
.aqm-rank-bar > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22c55e, #eab308);
}
.aqm-rank-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding-top: 10px;
  text-align: right;
  white-space: nowrap;
}
.aqm-rank-side strong {
  font-size: 17px;
  font-weight: 900;
  color: #fff;
}
.aqm-rank-side small {
  font-size: 12px;
  color: var(--aqm-muted);
}
.aqm-rank-ref {
  margin-top: 10px;
  font-size: 12px;
  color: #93c5fd;
}
.aqm-rank-more {
  margin-top: 8px;
}
.aqm-rank-more > summary {
  width: fit-content;
  font-size: 12px;
  font-weight: 700;
  color: var(--aqm-muted);
  cursor: pointer;
}
.aqm-rank-more > summary:hover {
  color: #fff;
}
.aqm-rank-more[open] > summary {
  margin-bottom: 8px;
}
.aqm-rank-more .aqm-label {
  margin-top: 10px;
}
.aqm-rank-more .aqm-muted {
  margin-top: 8px;
}
.aqm-odds-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.aqm-odds-grid li {
  padding: 6px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
}
.aqm-odds-grid li > * {
  display: block;
}
.aqm-odds-grid strong {
  margin-top: 2px;
  font-size: 13px;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.aqm-odds-grid small {
  font-size: 10px;
  color: var(--aqm-muted);
}

@media (max-width: 640px) {
  .aqm-rank {
    grid-template-columns: 36px minmax(0, 1fr);
    padding: 12px;
  }
  .aqm-rank-n {
    display: none;
  }
  .aqm-rank .aqm-pack {
    width: 36px;
    height: 51px;
  }
  .aqm-rank-side {
    grid-column: 2;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    padding-top: 6px;
  }
  .aqm-rank-ref {
    margin-top: 0;
  }
  .aqm-sort {
    flex: 1 1 140px;
    min-width: 0;
  }
  .aqm-odds-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

/* ---------- Réglages du script ---------- */

.aqm-settings-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.aqm-switch {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--aqm-card);
  font-size: 14px;
  line-height: 1.45;
  color: #e4e4e7;
  cursor: pointer;
}
.aqm-switch input {
  margin-top: 3px;
  accent-color: #2563eb;
}

/* ---------- Qui a tiré… ? ---------- */

.aqm-pulled {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}
.aqm-pull {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 8px 14px 8px 8px;
  border-radius: 14px;
  background: var(--aqm-card);
}
.aqm-pull-card img {
  display: block;
  width: 40px;
  height: 56px;
  border-radius: 8px;
  object-fit: cover;
}
.aqm-pull-main {
  min-width: 0;
}
.aqm-pull-main > p {
  margin: 0;
}
.aqm-pull-series {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.aqm-pull-who {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 13px;
  font-weight: 700;
  text-align: right;
}
.aqm-pull-who a {
  color: #fff;
  text-decoration: none;
}
.aqm-pull-who a:hover {
  text-decoration: underline;
}
.aqm-pull-who small {
  font-size: 11px;
  font-weight: 400;
  color: var(--aqm-muted);
}

/* ---------- Séries favorites ---------- */

.aqm-star {
  position: absolute;
  top: 4px;
  right: 6px;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #a1a1aa;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}
.aqm-star:hover {
  color: #fde047;
}
.aqm-star.is-on {
  color: #facc15;
}
.aqm-fav-bar {
  display: flex;
  margin-bottom: 8px;
}
.aqm-fav-bar .aqm-chip {
  height: 32px;
  text-transform: none;
  letter-spacing: 0;
  font-size: 13px;
  color: #fde047;
}
.aqm-fav-bar .aqm-chip b {
  margin-left: 4px;
  color: #fff;
}
.aqm-fav-found {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.aqm-fav-found:empty {
  display: none;
}
.aqm-fav-found li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 10px 6px 6px;
  border-radius: 12px;
  background: var(--aqm-card);
}
.aqm-fav-found img {
  width: 32px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
}
.aqm-fav-found li > span {
  flex: 1;
  min-width: 0;
}
.aqm-fav-found strong,
.aqm-fav-found small {
  display: block;
}
.aqm-fav-found small {
  font-size: 12px;
  color: var(--aqm-muted);
}
.aqm-filter-name.aqm-gap {
  margin-left: 10px;
}
.aqm-fav-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
}
.aqm-fav-series {
  padding: 14px;
  border: 1px solid var(--aqm-line);
  border-radius: 18px;
  background: var(--aqm-card);
}
.aqm-fav-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.aqm-fav-head > img {
  width: 40px;
  height: 56px;
  border-radius: 8px;
  object-fit: cover;
}
.aqm-fav-title {
  flex: 1 1 200px;
  min-width: 0;
}
.aqm-fav-title strong {
  display: block;
  font-size: 16px;
  font-weight: 900;
  color: #fff;
}
.aqm-fav-title small {
  font-size: 12px;
  color: var(--aqm-muted);
}
.aqm-fav-head .aqm-chip.is-on {
  color: #facc15;
  font-size: 16px;
}
.aqm-fav-series > .aqm-muted {
  margin-top: 8px;
}
.aqm-fav-series > .aqm-muted:empty {
  display: none;
}
.aqm-fav-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 10px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}
.aqm-fav-card {
  position: relative;
  min-width: 0;
}
.aqm-fav-card img {
  display: block;
  width: 100%;
  aspect-ratio: 63 / 88;
  border-radius: 10px;
  object-fit: cover;
  filter: grayscale(0.85) brightness(0.6);
}
.aqm-fav-card.is-owned img {
  filter: none;
}
.aqm-fav-card > p {
  margin: 4px 0 0;
}
.aqm-fav-card .aqm-mini-name {
  font-size: 12px;
}
.aqm-want {
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  font-size: 15px;
  filter: grayscale(1);
  opacity: 0.75;
  cursor: pointer;
}
.aqm-want.is-on {
  background: rgba(37, 99, 235, 0.85);
  filter: none;
  opacity: 1;
}
.aqm-sort:disabled {
  opacity: 0.55;
  cursor: default;
}

@media (max-width: 640px) {
  .aqm-pull {
    grid-template-columns: 36px minmax(0, 1fr);
  }
  .aqm-pull-who {
    grid-column: 2;
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
  }
  .aqm-fav-cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
`;
  document.head.appendChild(style);
  // ---------- 5. src/content/tutorial.js et content.js : visite, nouveautés, puis tout ce qui s'affiche sur le site ----------
// Text of the guided tour and of the "Nouveautés" window, shown by content.js.
// Each new version adds its entry at the top of CHANGES (build.py refuses a version without one).

// Guided tour, one step per feature:
//   page: path to go to; target: CSS selectors of the element to circle (the first visible one);
//   find: element found by content.js ("plus", "menu-0", "menu-1", "series", "vitrine");
//   text: a string, or { hover, touch } for a computer with a mouse and for a phone.
// A step whose element can't be found is shown in the middle of the screen.
const TOUR = [
  {
    id: 'bienvenue',
    title: 'Bienvenue dans Aquaman',
    text: 'Aquaman ajoute quelques outils au jeu. Cette visite d’une minute te montre où les trouver ; tu peux la quitter à tout moment.'
  },
  {
    id: 'plus',
    title: 'L’onglet Plus',
    text: 'Les pages d’Aquaman sont rangées ici, à droite de Marché.',
    find: 'plus'
  },
  {
    id: 'classement',
    title: 'Classement des amis',
    text: 'Compare-toi à tes amis : nombre de cartes uniques et de séries complètes. Touche un nom pour ouvrir son profil.',
    find: 'menu-0'
  },
  {
    id: 'boosters',
    title: 'Quel booster ouvrir ?',
    text: 'Choisis ce que tu cherches (des cartes nouvelles, une rareté, un personnage, une série ou la valeur) : les boosters sont classés par taux de drop ou par prix, avec « ≈ 11 boosters à ouvrir en moyenne », le prix moyen en Perles et le meilleur et le pire taux en haut.',
    find: 'menu-1'
  },
  {
    id: 'qui',
    title: 'Qui a tiré… ?',
    text: 'Cherche un personnage ou une série : Aquaman te montre les joueurs qui l’ont tiré récemment, avec le numéro de la carte et quand. Il garde les beaux tirages du jeu (SSR, UR, SEC) pendant 30 jours.',
    find: 'menu-2'
  },
  {
    id: 'favoris',
    title: 'Séries favorites',
    text: 'Ajoute des séries à tes favoris (ici, ou avec l’étoile ☆ sur les séries de la page Collection) : elles sont les mêmes sur tous tes appareils. Tu vois leurs personnages, ceux qui te manquent, et un bouton met d’un coup toutes les cartes manquantes dans ta liste de recherches du jeu.',
    find: 'menu-3'
  },
  {
    id: 'etoiles',
    title: 'L’étoile des séries',
    text: 'Sur la page Collection, l’étoile ☆ ajoute une série à tes favoris ; le bouton « ★ Favoris » au-dessus ouvre la liste de leurs personnages.',
    page: '/jeu/collection',
    target: '.aqm-fav-bar, .aqm-star'
  },
  {
    id: 'tirages',
    title: 'Les beaux tirages',
    text: 'Sur l’accueil, les cartes des beaux tirages des joueurs sont affichées en plus grand.',
    page: '/jeu',
    target: '.aqm-pulls'
  },
  {
    id: 'pity',
    title: 'La garantie anti-malchance',
    text: 'Sous le minuteur du booster offert : combien de boosters il te reste avant la SSR et l’UR garanties. Aquaman compte chaque booster que tu ouvres, et partage ce compte entre tes appareils (PC, téléphone, extension ou script) : partout le même chiffre. Tant qu’il n’a pas vu sortir de SSR ou d’UR, il affiche « au plus ».',
    page: '/jeu',
    target: '.aqm-pity'
  },
  {
    id: 'echanges',
    title: 'Les échanges',
    text: 'Dans chaque proposition, les cartes sont plus grandes, avec une pastille verte si tu as déjà la carte (×2, ×3… si tu en as plusieurs) et rouge si tu ne l’as pas.',
    page: '/jeu/echanges',
    target: '.aqm-trade-tile, a[data-tour="nav-/jeu/echanges"]'
  },
  {
    id: 'series',
    title: 'Les séries de ta collection',
    text: {
      hover: 'Survole la bande des séries et tourne la molette de la souris, ou attrape-la avec un clic et fais-la glisser : elle défile de gauche à droite. Un simple clic ouvre toujours la série.',
      touch: 'La bande des séries défile du doigt. Sur ordinateur, la molette ou un clic glissé la font aussi défiler.'
    },
    page: '/jeu/collection',
    find: 'series'
  },
  {
    id: 'vitrine',
    title: 'Ma vitrine',
    text: {
      hover: 'Ouvre « Ma vitrine » et fais glisser une carte sur une autre case pour la déplacer. Pour retirer une carte, utilise la croix rouge en haut à droite de la carte.',
      touch: 'Ouvre « Ma vitrine », garde le doigt appuyé sur une carte, puis fais-la glisser sur une autre case pour la déplacer. Pour retirer une carte, touche la croix rouge en haut à droite de la carte.'
    },
    page: '/jeu/collection',
    find: 'vitrine'
  },
  {
    id: 'fin',
    title: 'C’est tout !',
    text: 'Tu peux relancer cette visite quand tu veux depuis Plus → Visite guidée. Bon jeu !'
  }
];

// What's new in each version, the most recent first. An item is ['text'] or ['text', 'id of a tour step'].
const CHANGES = [
  {
    version: '1.1.0',
    items: [
      ['Qui a tiré… ? (menu Plus) : les joueurs qui ont tiré récemment un personnage ou une carte d’une série, parmi les beaux tirages du jeu gardés 30 jours.', 'qui'],
      ['Séries favorites : une étoile ☆ sur chaque série de la page Collection, et une page avec leurs personnages (toutes, manquantes, possédées, recherchées, par rareté), les mêmes sur tous tes appareils.', 'favoris'],
      ['Séries favorites : « Rechercher les manquantes » met d’un coup toutes les cartes qui te manquent dans ta liste de recherches du jeu ; 🔭 pour une seule carte.', 'favoris'],
      ['Sur téléphone : la garantie anti-malchance s’affiche aussi quand la réserve de boosters est pleine.', 'pity']
    ]
  },
  {
    version: '1.0.0',
    items: [
      ['Onglet Plus à droite de Marché, avec le classement des amis (cartes uniques et séries complètes).', 'classement'],
      ['Quel booster ouvrir ? (Plus → Boosters rentables) : pour des cartes nouvelles, une rareté, un personnage, une série ou la valeur, les boosters classés par taux de drop ou par prix, avec le nombre de boosters à ouvrir en moyenne et le meilleur et le pire taux.', 'boosters'],
      ['Échanges : cartes plus grandes et pastille verte ou rouge selon que tu as la carte ou non.', 'echanges'],
      ['Collection : la bande des séries défile avec la molette, ou en l’attrapant avec un clic glissé.', 'series'],
      ['Ma vitrine : glisser-déposer des cartes, à la souris ou au doigt.', 'vitrine'],
      ['Accueil : les cartes des beaux tirages sont plus grandes.', 'tirages'],
      ['Accueil : la garantie anti-malchance, avec le nombre de boosters avant ta prochaine SSR et ta prochaine UR garanties, le même sur tous tes appareils.', 'pity'],
      ['Extension : le nombre de boosters à ouvrir sur l’icône, une notification quand il y en a de nouveaux, et le bouton « Mettre à jour » dans sa fenêtre.']
    ]
  }
];

// Aquaman: everything shown on the pages of poseidon-scans.net/jeu.
// Also built into the userscript (build.py), which defines OWNER and stand-ins for the extension APIs.
(() => {
  // ---------- one copy per tab ----------

  const owner = typeof OWNER === 'string' ? OWNER : 'extension';
  const root = document.documentElement;
  if (root.dataset.aqmOwner && root.dataset.aqmOwner !== owner) return;
  root.dataset.aqmOwner = owner;

  const RARITY_NAMES = { N: 'Commune', R: 'Rare', SR: 'Épique', SSR: 'Légendaire', UR: 'Mythique', SEC: 'Secrète' };
  const RANKED = ['N', 'R', 'SR', 'SSR', 'UR', 'SEC'];
  const TYPE_NAMES = { magie: 'Magie', action: 'Action', 'arts-martiaux': 'Arts martiaux', romance: 'Romance', waifu: 'Waifu', mechant: 'Méchants' };
  const TOUR_HASH = '#aqm-visite';
  const NEWS_HASH = '#aqm-nouveautes';
  const TOUR_STEP = 'aqm-tour-step'; // sessionStorage: step to resume after a page load

  const ICON_DOTS =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M144,128a16,16,0,1,1-16-16A16,16,0,0,1,144,128ZM60,112a16,16,0,1,0,16,16A16,16,0,0,0,60,112Zm136,0a16,16,0,1,0,16,16A16,16,0,0,0,196,112Z"/></svg>';
  const ICON_TROPHY =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M232,64H208V48a8,8,0,0,0-8-8H56a8,8,0,0,0-8,8V64H24A16,16,0,0,0,8,80V96a40,40,0,0,0,40,40h3.65A80.13,80.13,0,0,0,120,191.61V216H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16H136V191.58c31.94-3.23,58.44-25.64,68.08-55.58H208a40,40,0,0,0,40-40V80A16,16,0,0,0,232,64ZM48,120A24,24,0,0,1,24,96V80H48v32q0,4,.39,8Zm144-8.9c0,35.52-28.49,64.64-63.51,64.9H128a64,64,0,0,1-64-64V56H192ZM232,96a24,24,0,0,1-24,24h-.5a81.81,81.81,0,0,0,.5-8.9V80h24Z"/></svg>';
  const ICON_PACK =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M184,72H40A16,16,0,0,0,24,88V200a16,16,0,0,0,16,16H184a16,16,0,0,0,16-16V88A16,16,0,0,0,184,72Zm0,128H40V88H184V200ZM232,56V176a8,8,0,0,1-16,0V56H64a8,8,0,0,1,0-16H216A16,16,0,0,1,232,56Z"/></svg>';
  const ICON_X =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
  const ICON_COMPASS =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216ZM172.42,72.84l-64,32a8.05,8.05,0,0,0-3.58,3.58l-32,64A8,8,0,0,0,80,184a8.1,8.1,0,0,0,3.58-.84l64-32a8.05,8.05,0,0,0,3.58-3.58l32-64a8,8,0,0,0-10.74-10.74ZM138,138,97.89,158.11,118,118l40.15-20.07Z"/></svg>';
  const ICON_SPARK =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M197.58,129.06,146,110l-19-51.62a15.92,15.92,0,0,0-29.88,0L78,110l-51.62,19a15.92,15.92,0,0,0,0,29.88L78,178l19,51.62a15.92,15.92,0,0,0,29.88,0L146,178l51.62-19a15.92,15.92,0,0,0,0-29.88ZM137,164.22a8,8,0,0,0-4.74,4.74L112,223.85,91.78,169A8,8,0,0,0,87,164.22L32.15,144,87,123.78A8,8,0,0,0,91.78,119L112,64.15,132.22,119a8,8,0,0,0,4.74,4.74L191.85,144ZM144,40a8,8,0,0,1,8-8h16V16a8,8,0,0,1,16,0V32h16a8,8,0,0,1,0,16H184V64a8,8,0,0,1-16,0V48H152A8,8,0,0,1,144,40ZM248,88a8,8,0,0,1-8,8h-8v8a8,8,0,0,1-16,0V96h-8a8,8,0,0,1,0-16h8V72a8,8,0,0,1,16,0v8h8A8,8,0,0,1,248,88Z"/></svg>';
  const ICON_SEARCH =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/></svg>';
  const ICON_STAR =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M239.18,97.26A16.38,16.38,0,0,0,224.92,86l-59-4.76L143.14,26.15a16.36,16.36,0,0,0-30.27,0L90.11,81.23,31.08,86a16.46,16.46,0,0,0-9.37,28.86l45,38.83L53,211.75a16.38,16.38,0,0,0,24.5,17.82L128,198.49l50.53,31.08A16.4,16.4,0,0,0,203,211.75l-13.76-58.07,45-38.83A16.43,16.43,0,0,0,239.18,97.26Zm-15.34,5.47-48.7,42a8,8,0,0,0-2.56,7.91l14.88,62.8a.37.37,0,0,1-.17.48c-.18.14-.23.11-.38,0l-54.72-33.65a8,8,0,0,0-8.38,0L69.09,215.94c-.15.09-.19.12-.38,0a.37.37,0,0,1-.17-.48l14.88-62.8a8,8,0,0,0-2.56-7.91l-48.7-42c-.12-.1-.23-.19-.13-.5s.18-.27.33-.29l63.92-5.16A8,8,0,0,0,103,91.86l24.62-59.61c.08-.17.11-.25.35-.25s.27.08.35.25L153,91.86a8,8,0,0,0,6.75,4.92l63.92,5.16c.15,0,.24,0,.33.29S224,102.63,223.84,102.73Z"/></svg>';
  const ICON_PEARL = '<span class="aqm-pearl" aria-hidden="true"></span>';

  const nf = new Intl.NumberFormat('fr-FR');
  const fmt = (n) => nf.format(Math.round(n || 0));
  const dec = (n, digits = 2) => (n || 0).toLocaleString('fr-FR', { maximumFractionDigits: digits });
  const pct = (p) => {
    const v = 100 * (p || 0);
    return `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 0.1 ? 3 : v < 10 ? 2 : 1 })} %`;
  };

  // ---------- messages ----------

  // False once the extension was reloaded or updated: this copy then cleans up and stops.
  const alive = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };

  // Message to the background worker; null when it can't answer.
  async function send(msg) {
    if (!alive()) return shutdown(), null;
    try {
      return (await chrome.runtime.sendMessage(msg)) ?? null;
    } catch {
      return null;
    }
  }

  // Answer of a data message, or an error with a message for the player.
  async function ask(msg) {
    const res = await send(msg);
    if (!res) throw new Error('Aquaman ne répond pas : recharge la page.');
    if (res.error) throw new Error(res.error === 'unknown_message' ? 'Aquaman ne répond pas : recharge la page.' : res.error);
    return res;
  }

  // Messages posted by inject.js about the site's own requests.
  function onPageMessage(e) {
    if (e.source !== window || typeof e.data?.aquaman !== 'string') return;
    if (e.data.aquaman === 'collection-stale') {
      owned = null;
      send({ type: 'collection-stale' });
      setTimeout(schedule, 1500);
    } else if (e.data.aquaman === 'status') send({ type: 'status', pending: e.data.pending });
    else if (e.data.aquaman === 'feed' && Array.isArray(e.data.pulls)) send({ type: 'feed-seen', pulls: e.data.pulls });
    else if (e.data.aquaman === 'opened' && Array.isArray(e.data.boosters))
      send({ type: 'opened', boosters: e.data.boosters }).then((report) => {
        if (report && !report.error) {
          pityReport = report;
          pityAt = Date.now();
        }
        renderPity();
      });
  }

  // ---------- page helpers ----------

  // Element with its attributes, listeners and children (strings become text).
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v; // only for the SVG icons of this file
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
  }

  // Elements of the site with a text matching re.
  function elementsWithText(from, re) {
    const out = [];
    const walker = document.createTreeWalker(from, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (el && re.test(n.nodeValue) && !el.closest('.aqm-root')) out.push(el);
    }
    return out;
  }

  const setText = (el, text) => el.textContent !== text && (el.textContent = text);
  const setClass = (el, cls) => el.className !== cls && (el.className = cls);
  const isVisible = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const firstVisible = (selector) => [...document.querySelectorAll(selector)].find(isVisible) ?? null;
  const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

  // File name of a card image, the same key as the API's card.image.
  function imageKey(src) {
    if (!src) return null;
    let s = String(src);
    try {
      const u = new URL(s, location.origin);
      s = u.pathname.startsWith('/_next/image') ? u.searchParams.get('url') || '' : u.pathname;
      s = decodeURIComponent(s);
    } catch {}
    s = s.split(/[?#]/)[0];
    return s.slice(s.lastIndexOf('/') + 1) || null;
  }

  // True for the image of a game card.
  function isCardImage(src) {
    let s = String(src || '');
    try {
      s = decodeURIComponent(s);
    } catch {}
    return /\/api-media\/file\/|\/api-game\/v1\/content\/|media-library\//.test(s);
  }

  const cardImageUrl = (image) =>
    !image ? '' : image.startsWith('content/') ? `/api-game/v1/content/${image.slice(8)}` : `/api-media/file/${image.replace(/^media-library\//, '')}`;
  const avatarUrl = (id) => `/api/avatar/${encodeURIComponent(id)}`;

  // Calls fn on the items, limit at a time.
  async function eachLimited(items, limit, fn) {
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  }

  // Reads (value undefined), writes or removes (value null) a sessionStorage entry.
  function session(key, value) {
    try {
      if (value === undefined) return sessionStorage.getItem(key);
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch {}
    return null;
  }

  // ---------- "Plus" tab ----------

  // "Plus" button after each "Marché" link of the game's navigation.
  function addPlusTab() {
    for (const link of document.querySelectorAll('a[data-tour="nav-/jeu/marche"], a[href="/jeu/marche"]')) {
      if (link.closest('.aqm-root') || link.parentElement?.querySelector(':scope > .aqm-plus')) continue;
      const btn = h('button', {
        type: 'button',
        class: link.className,
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        onclick: (e) => {
          e.preventDefault();
          menu ? closeMenu() : openMenu(btn);
        }
      });
      btn.classList.remove('text-white');
      btn.classList.add('aqm-plus', 'text-zinc-400', 'hover:text-white');
      const icon = h('span', { class: 'aqm-nav-ico', html: ICON_DOTS });
      const iconClass = link.querySelector('svg')?.getAttribute('class');
      if (iconClass) icon.firstChild.setAttribute('class', iconClass);
      const text = [...link.querySelectorAll('span')].find((s) => !s.children.length && s.textContent.trim());
      btn.append(icon, h('span', { class: text?.className || null }, 'Plus'));
      link.after(btn);
    }
  }

  let menu = null;

  // Menu of the "Plus" tab.
  function openMenu(anchor) {
    closeMenu();
    const item = (title, text, icon, open) =>
      h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          class: 'aqm-menu-item',
          onclick: () => {
            closeMenu();
            open();
          }
        },
        h('span', { class: 'aqm-menu-ico', html: icon }),
        h('span', {}, h('strong', {}, title), h('small', {}, text))
      );
    menu = h(
      'div',
      { class: 'aqm-root aqm-menu', role: 'menu' },
      item('Classement des amis', 'Cartes uniques et séries complètes', ICON_TROPHY, openLeaderboard),
      item('Boosters rentables', 'Prix, taux de drop, persos et séries', ICON_PACK, openBoosters),
      item('Qui a tiré… ?', 'Les joueurs qui ont tiré un perso', ICON_SEARCH, openWhoPulled),
      item('Séries favorites', 'Tes séries et leurs persos manquants', ICON_STAR, openFavorites),
      item('Visite guidée', 'Le tour de ce qu’ajoute Aquaman', ICON_COMPASS, () => startTour(0)),
      item('Nouveautés', 'Ce qui a changé dans Aquaman', ICON_SPARK, () => openNews())
    );
    menu.anchor = anchor;
    document.body.append(menu);
    anchor.setAttribute('aria-expanded', 'true');
    const r = anchor.getBoundingClientRect();
    const below = r.bottom + 8 + menu.offsetHeight < innerHeight;
    menu.style.top = `${below ? r.bottom + 8 : r.top - 8 - menu.offsetHeight}px`;
    menu.style.left = `${Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.left + r.width / 2 - menu.offsetWidth / 2))}px`;
  }

  function closeMenu() {
    if (!menu) return;
    menu.anchor?.setAttribute('aria-expanded', 'false');
    menu.remove();
    menu = null;
  }

  // ---------- window of the extension's pages ----------

  let overlay = null;

  // Full window with a title; returns its body.
  function openOverlay(title, subtitle) {
    closeOverlay();
    const body = h('div', { class: 'aqm-body' });
    const panel = h(
      'div',
      { class: 'aqm-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h(
        'div',
        { class: 'aqm-head' },
        h('div', {}, h('h2', { class: 'aqm-title' }, title), subtitle ? h('p', { class: 'aqm-sub' }, subtitle) : null),
        h('button', { type: 'button', class: 'aqm-close', 'aria-label': 'Fermer', html: ICON_X, onclick: closeOverlay })
      ),
      body
    );
    overlay = h('div', { class: 'aqm-root aqm-overlay', onclick: (e) => e.target === e.currentTarget && closeOverlay() }, panel);
    document.body.append(overlay);
    root.classList.add('aqm-lock');
    panel.querySelector('.aqm-close').focus();
    return body;
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    root.classList.remove('aqm-lock');
  }

  // Row of chips, one of them selected.
  const chips = (options, current, onPick) =>
    h(
      'div',
      { class: 'aqm-chips', role: 'tablist' },
      options.map(([value, label]) =>
        h('button', { type: 'button', role: 'tab', class: `aqm-chip${value === current ? ' is-on' : ''}`, 'aria-selected': String(value === current), onclick: () => onPick(value) }, label)
      )
    );

  // ---------- friends' leaderboard ----------

  async function openLeaderboard() {
    const body = openOverlay('Classement des amis', 'Toi et tes amis, selon les cartes uniques et les séries complètes.');
    let sortBy = 'owned';
    let rows = [];
    const tabs = h('div');
    const status = h('p', { class: 'aqm-note' }, 'Chargement des collections…');
    const list = h('ol', { class: 'aqm-board' });
    body.append(tabs, status, list);

    const render = () => {
      tabs.replaceChildren(
        chips(
          [
            ['owned', 'Cartes uniques'],
            ['albums', 'Séries complètes']
          ],
          sortBy,
          (v) => {
            sortBy = v;
            render();
          }
        )
      );
      const score = (r) => (r.state === 'ok' ? [r[sortBy], sortBy === 'owned' ? r.albums : r.owned] : [-1, -1]);
      const sorted = [...rows].sort((a, b) => {
        const [a1, a2] = score(a);
        const [b1, b2] = score(b);
        return b1 - a1 || b2 - a2 || String(a.name).localeCompare(String(b.name));
      });
      let place = 0;
      const topAlbums = Math.max(0, ...rows.filter((r) => r.state === 'ok').map((r) => r.albums));
      list.replaceChildren(
        ...sorted.map((r) => {
          if (r.state === 'ok') place++;
          const share = r.total ? r.owned / r.total : 0;
          // Only the number of the chosen tab; the bar of the series compares to the best of the list.
          const stats =
            r.state !== 'ok'
              ? [h('p', { class: 'aqm-muted' }, r.state === 'loading' ? 'Chargement…' : r.state === 'private' ? 'Collection privée' : 'Collection indisponible')]
              : sortBy === 'owned'
                ? [
                    h(
                      'div',
                      { class: 'aqm-stat is-on' },
                      h('strong', {}, fmt(r.owned)),
                      h('small', {}, `/ ${fmt(r.total)} cartes`),
                      h('span', { class: 'aqm-bar' }, h('span', { style: `width:${(100 * share).toFixed(2)}%` }))
                    )
                  ]
                : [
                    h(
                      'div',
                      { class: 'aqm-stat is-on' },
                      h('strong', {}, fmt(r.albums)),
                      h('small', {}, r.albums > 1 ? 'séries complètes' : 'série complète'),
                      h('span', { class: 'aqm-bar' }, h('span', { style: `width:${topAlbums ? ((100 * r.albums) / topAlbums).toFixed(2) : 0}%` }))
                    )
                  ];
          return h(
            'li',
            { class: `aqm-row${r.me ? ' is-me' : ''}` },
            h('span', { class: `aqm-place aqm-place-${place}` }, r.state === 'ok' ? String(place) : '–'),
            h('img', { class: 'aqm-avatar', src: avatarUrl(r.id), alt: '', loading: 'lazy' }),
            h('a', { class: 'aqm-name', href: `/profile/${encodeURIComponent(r.id)}` }, r.name || 'Joueur', r.me ? h('span', { class: 'aqm-tag' }, 'Toi') : null),
            h('div', { class: 'aqm-stats' }, stats)
          );
        })
      );
    };

    try {
      const { me, friends, friendsError: error } = await ask({ type: 'friends' });
      rows = [{ id: me, me: true }, ...friends].map((p) => ({ ...p, state: 'loading' }));
      render();
      await eachLimited(rows, 4, async (row) => {
        try {
          const p = await ask({ type: 'player', id: row.id });
          row.name ||= p.name;
          if (p.private) row.state = 'private';
          else Object.assign(row, { state: 'ok', owned: p.owned, total: p.total, albums: p.albums });
        } catch {
          row.state = 'error';
        }
        render();
      });
      status.textContent = error
        ? `Liste d'amis indisponible (${error}).`
        : friends.length
          ? `${friends.length} ami${friends.length > 1 ? 's' : ''} · une série est complète quand son album est réclamé.`
          : "Tu n'as pas encore d'amis dans le jeu : ajoute-en depuis leur profil pour te comparer à eux.";
    } catch (e) {
      status.textContent = e.message;
    }
  }

  // ---------- profitable boosters ----------

  // Picture of a booster: the site's art of its type, or a plain pack.
  function packArt(b) {
    const art = b.types[0] && TYPE_NAMES[b.types[0]] ? `/game/boosters/${b.types[0]}.webp` : b.minRank >= 4 ? '/game/boosters/legendaire.webp' : null;
    return art ? h('img', { class: 'aqm-pack', src: art, alt: '' }) : h('span', { class: 'aqm-pack aqm-pack-plain' }, h('span', {}, 'Booster'));
  }
  const rarityCode = (code) => h('span', { class: `aqm-rarity aqm-r-${code}` }, code);
  const perles = (n) => h('span', { class: 'aqm-perles', html: ICON_PEARL }, fmt(n));

  // Small cards with their name and a line under it.
  const cardStrip = (items, sub) =>
    h(
      'ul',
      { class: 'aqm-strip' },
      items.map((x) =>
        h(
          'li',
          { class: `aqm-mini${x.own ? ' is-owned' : ''}`, title: `${x.c.name} — ${x.c.series?.title ?? ''}` },
          h('img', { src: cardImageUrl(x.c.image), alt: '', loading: 'lazy' }),
          h('div', {}, h('p', { class: 'aqm-mini-name' }, rarityCode(x.c.rarity), ' ', x.c.name), h('p', { class: 'aqm-muted' }, sub(x)))
        )
      )
    );

  // What the player is looking for, and the sentence under the choices.
  const GOALS = [
    ['collection', 'Ma collection'],
    ['rarity', 'Une rareté'],
    ['name', 'Un personnage'],
    ['series', 'Une série'],
    ['value', 'La valeur']
  ];

  // The two orders of each goal: "rate" (the best chance or yield) and "price" (the fewest Perles).
  const SORTS = {
    collection: { rate: ['Cartes nouvelles', 'le plus de cartes que tu n’as pas'], price: ['Prix', 'le moins de Perles par carte nouvelle'] },
    value: { rate: ['Rendement', 'les cartes qui valent le plus'], price: ['Prix', 'le booster le moins cher'] },
    other: { rate: ['Taux de drop', 'la meilleure chance par booster'], price: ['Prix', 'le moins de Perles dépensées'] }
  };

  const guaranteeOf = (b) => `${RARITY_NAMES[RANKED[b.minRank - 1]] ?? 'Rare'} garantie`;
  const seriesOf = (b) =>
    b.series.length
      ? b.series
          .slice(0, 2)
          .map((s) => s.title)
          .join(', ') + (b.series.length > 2 ? ` +${b.series.length - 2}` : '')
      : b.types.length
        ? `Cartes ${b.types.map((t) => TYPE_NAMES[t] || t).join(' et ')}`
        : 'Toutes les séries';
  // "≈ 11 boosters" to get it once, on average.
  const oneIn = (p) => (1 / p < 10 ? dec(1 / p, 1) : fmt(1 / p));
  const boostersFor = (p) => (p >= 0.95 ? 'presque à chaque booster' : `≈ ${oneIn(p)} booster${1 / p >= 1.95 ? 's' : ''} à ouvrir en moyenne`);

  async function openBoosters() {
    const body = openOverlay('Quel booster ouvrir ?', 'Les boosters en vente classés du plus rentable au moins rentable pour obtenir ce que tu cherches.');
    body.parentElement.classList.add('aqm-panel-wide');
    const status = h('p', { class: 'aqm-note' }, 'Chargement de la boutique…');
    body.append(status);
    let goal = 'collection';
    let rarity = 'UR';
    let query = '';
    let onlyNew = false;
    let sortBy = 'rate';
    let report;
    try {
      report = await ask({ type: 'boosters' });
    } catch (e) {
      status.textContent = e.message;
      return;
    }
    if (!report.rows.length || !report.rarities.length) {
      status.textContent = 'La boutique ne propose aucun booster pour le moment.';
      return;
    }
    if (!report.rarities.some((r) => r.code === rarity)) rarity = report.rarities.at(-1).code;
    const rarityName = (code) => report.rarities.find((r) => r.code === code)?.name || RARITY_NAMES[code] || code;

    const goalRow = h('div', { class: 'aqm-chips aqm-goals' });
    const pickRow = h('div', { class: 'aqm-pick' });
    const sentence = h('div', { class: 'aqm-sentence' });
    const sortRow = h('div', { class: 'aqm-sorts' });
    const summary = h('div', { class: 'aqm-verdict' });
    const list = h('ol', { class: 'aqm-ranking' });
    const suggestions = h('datalist', { id: 'aqm-suggest' });
    const search = h('input', { type: 'search', class: 'aqm-search', list: 'aqm-suggest', autocomplete: 'off' });
    const how = h(
      'details',
      { class: 'aqm-how' },
      h('summary', {}, 'Comment sont calculés ces chiffres ?'),
      h(
        'ul',
        {},
        h('li', {}, 'Un booster donne 5 cartes : 4 tirées avec les taux du jeu, et une 5e d’au moins la rareté garantie. Dans une rareté, chaque carte du booster a la même chance.'),
        h('li', {}, '« ≈ 11 boosters à ouvrir en moyenne » et « 1 sur 11 » : l’inverse de la chance par booster. « ≈ 6 594 en moyenne » : le prix du booster multiplié par ce nombre.'),
        h('li', {}, 'Valeur : le prix au marché de chaque carte, pris sur les exemplaires vus dans ta collection', report.friends ? ' et celles de tes amis' : '', '. Une carte jamais vue prend la valeur moyenne de sa rareté.'),
        h('li', {}, 'La garantie anti-malchance (une SSR tous les 60 boosters, une UR tous les 190) n’est pas comptée : les vraies chances sont un peu meilleures.'),
        report.catalog ? null : h('li', {}, 'Le catalogue complet du jeu est indisponible : les chances par personnage et par série ne peuvent pas être calculées.'),
        h('li', {}, 'Ce sont des moyennes : un booster reste un tirage au sort.')
      )
    );
    status.remove();
    body.append(goalRow, pickRow, sentence, sortRow, summary, list, how, suggestions);

    // Asks the numbers again for what was typed.
    let asked = 0;
    let timer = 0;
    async function refresh() {
      const n = ++asked;
      const field = goal === 'name' || goal === 'series' ? goal : '';
      try {
        const next = await ask({ type: 'boosters', query: field ? query : '', field });
        if (n !== asked) return;
        report = next;
        suggestions.replaceChildren(...(report.suggestions ?? []).map((s) => h('option', { value: s })));
        render();
      } catch {}
    }
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        query = search.value.trim();
        refresh();
      }, 250);
    });

    // Numbers of one booster for the goal chosen: rate (higher is better), cost (lower is better) and the texts.
    function measure({ b, a }) {
      const target =
        goal === 'rarity'
          ? `une ${rarityName(rarity)}${onlyNew ? ' que tu n’as pas' : ''}`
          : `« ${query} »${onlyNew ? ' (une carte que tu n’as pas)' : ''}`;
      if (goal === 'collection') {
        return {
          rate: a.fresh,
          cost: a.perFresh,
          head: `≈ ${dec(a.fresh, 1)} carte${a.fresh >= 2 ? 's' : ''} nouvelle${a.fresh >= 2 ? 's' : ''} par booster`,
          sub: `${pct(a.freshChance)} de chance d’en avoir au moins une`,
          big: a.perFresh == null ? '—' : h('span', {}, perles(a.perFresh)),
          bigSub: 'par carte nouvelle'
        };
      }
      if (goal === 'value') {
        return {
          rate: a.ratio,
          cost: b.price,
          head: a.ratio >= 1 ? `Tes cartes valent ×${dec(a.ratio)} le prix du booster` : `Tes cartes valent ${pct(a.ratio)} du prix du booster`,
          sub: h('span', {}, '≈ ', perles(a.ev), ' de cartes par booster, au prix du marché'),
          big: `×${dec(a.ratio)}`,
          bigSub: h('span', {}, '≈ ', perles(a.ev), ' de cartes')
        };
      }
      const p = goal === 'rarity' ? (onlyNew ? a.odds[rarity]?.freshChance : a.odds[rarity]?.chance) ?? 0 : (onlyNew ? a.targetNewChance : a.targetChance) ?? 0;
      return {
        rate: p,
        cost: p > 0 ? b.price / p : null,
        head: p > 0 ? `${boostersFor(p)} pour avoir ${target}` : `Ne peut pas te donner ${target}`,
        sub: `${pct(p)} de chance à chaque booster`,
        big: p > 0 ? `1 sur ${oneIn(Math.min(1, p))}` : '—',
        bigSub: p > 0 ? h('span', {}, '≈ ', perles(b.price / p), ' en moyenne') : ''
      };
    }

    // More about a booster: chances of each rarity, the searched or the most valuable missing cards.
    function moreOf({ b, a }) {
      const odds = h(
        'ul',
        { class: 'aqm-odds-grid' },
        report.rarities
          .filter((r) => a.odds[r.code])
          .map((r) => {
            const o = a.odds[r.code];
            return h('li', {}, rarityCode(r.code), h('strong', {}, pct(o.chance)), h('small', {}, `nouvelle : ${pct(o.freshChance)}`));
          })
      );
      const pool = b.pool?.cards
        ? b.pool.missing
          ? `${fmt(b.pool.cards)} cartes possibles, dont ${fmt(b.pool.missing)} que tu n’as pas encore (${pct(b.pool.missing / b.pool.cards)}).`
          : `${fmt(b.pool.cards)} cartes possibles : tu les as toutes.`
        : null;
      const cards =
        (goal === 'name' || goal === 'series') && a.targets.length
          ? [h('p', { class: 'aqm-label' }, `Cartes de « ${query} » dans ce booster`), cardStrip(a.targets.slice(0, 4), (x) => `${pct(x.chance)} par booster${x.own ? ` · tu l’as (${x.own})` : ' · tu ne l’as pas'}`)]
          : a.best.length
            ? [h('p', { class: 'aqm-label' }, 'Les cartes les plus chères qui te manquent'), cardStrip(a.best, (x) => h('span', {}, x.v ? h('span', {}, '≈ ', perles(x.v), ' · ') : '', `${pct(x.chance)} par booster`))]
            : [];
      return h(
        'details',
        { class: 'aqm-rank-more' },
        h('summary', {}, 'Détails'),
        h('p', { class: 'aqm-label' }, 'Chance d’avoir au moins une carte de chaque rareté'),
        odds,
        pool ? h('p', { class: 'aqm-muted' }, pool) : null,
        b.series.length > 2 ? h('p', { class: 'aqm-muted' }, `Séries : ${b.series.map((s) => s.title).join(', ')}.`) : null,
        ...cards
      );
    }

    function renderControls() {
      goalRow.replaceChildren(
        ...GOALS.map(([value, label]) =>
          h(
            'button',
            {
              type: 'button',
              class: `aqm-chip aqm-goal${value === goal ? ' is-on' : ''}`,
              'aria-pressed': String(value === goal),
              onclick: () => {
                if (value === goal) return;
                const typed = goal === 'name' || goal === 'series';
                goal = value;
                sortBy = 'rate';
                if (typed || goal === 'name' || goal === 'series') {
                  query = '';
                  search.value = '';
                  refresh();
                }
                render();
              }
            },
            label
          )
        )
      );
      if (goal === 'rarity')
        pickRow.replaceChildren(
          h(
            'div',
            { class: 'aqm-chips' },
            report.rarities.map((r) =>
              h(
                'button',
                {
                  type: 'button',
                  class: `aqm-chip aqm-chip-r aqm-r-${r.code}${r.code === rarity ? ' is-on' : ''}`,
                  'aria-pressed': String(r.code === rarity),
                  onclick: () => {
                    rarity = r.code;
                    render();
                  }
                },
                rarityName(r.code)
              )
            )
          )
        );
      else if (goal === 'name' || goal === 'series') {
        search.placeholder = goal === 'name' ? 'Nom d’un personnage…' : 'Nom d’une série…';
        search.setAttribute('aria-label', search.placeholder);
        if (pickRow.firstChild !== search) pickRow.replaceChildren(search);
      } else pickRow.replaceChildren();

      const newChips =
        goal === 'rarity' || goal === 'name' || goal === 'series'
          ? h(
              'div',
              { class: 'aqm-chips aqm-new' },
              [
                [false, 'Même celles que j’ai'],
                [true, 'Seulement celles qui me manquent']
              ].map(([value, label]) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: `aqm-chip${value === onlyNew ? ' is-on' : ''}`,
                    'aria-pressed': String(value === onlyNew),
                    onclick: () => {
                      onlyNew = value;
                      render();
                    }
                  },
                  label
                )
              )
            )
          : null;
      const text = {
        collection: 'Pour des cartes que tu n’as pas encore, de n’importe quelle rareté.',
        rarity: `Pour n’importe quelle carte ${rarityName(rarity)}${onlyNew ? ' que tu n’as pas encore' : ' (même une que tu as déjà)'}.`,
        name: query ? `Pour une carte de « ${query} »${onlyNew ? ' que tu n’as pas encore' : ' (même une que tu as déjà)'}.` : 'Tape le nom d’un personnage pour savoir quel booster te donne le plus de chances de l’avoir.',
        series: query ? `Pour une carte de la série « ${query} »${onlyNew ? ' que tu n’as pas encore' : ' (même une que tu as déjà)'}.` : 'Tape le nom d’une série pour savoir quel booster te donne le plus de ses cartes.',
        value: 'Pour la valeur au marché des 5 cartes du booster.'
      }[goal];
      sentence.replaceChildren(h('p', {}, text), newChips);

      const sorts = SORTS[goal] ?? SORTS.other;
      sortRow.replaceChildren(
        h('span', { class: 'aqm-filter-name' }, 'Classer par'),
        ...['price', 'rate'].map((key) =>
          h(
            'button',
            {
              type: 'button',
              class: `aqm-sort${key === sortBy ? ' is-on' : ''}`,
              'aria-pressed': String(key === sortBy),
              onclick: () => {
                sortBy = key;
                render();
              }
            },
            h('strong', {}, sorts[key][0]),
            h('small', {}, sorts[key][1])
          )
        )
      );
    }

    function render() {
      renderControls();
      if ((goal === 'name' || goal === 'series') && !query) {
        summary.hidden = true;
        summary.replaceChildren();
        list.replaceChildren();
        return;
      }
      if ((goal === 'name' || goal === 'series') && !report.catalog) {
        summary.hidden = true;
        summary.replaceChildren();
        list.replaceChildren(h('li', { class: 'aqm-empty' }, 'Le catalogue du jeu est indisponible : impossible de chercher un personnage ou une série pour le moment.'));
        return;
      }
      let rows = report.rows.map((r) => ({ ...r, m: measure(r) }));
      if (goal !== 'collection' && goal !== 'value') rows = rows.filter((r) => r.m.rate > 0);
      if (!rows.length) {
        summary.hidden = true;
        summary.replaceChildren();
        list.replaceChildren(h('li', { class: 'aqm-empty' }, goal === 'rarity' ? `Aucun booster en vente ne peut te donner une ${rarityName(rarity)}${onlyNew ? ' que tu n’as pas' : ''}.` : `Aucun booster en vente ne peut te donner « ${query} »${onlyNew ? ' (tu as peut-être déjà toutes ses cartes)' : ''}.`));
        return;
      }
      const last = Number.MAX_VALUE;
      rows.sort((x, y) => (sortBy === 'rate' ? y.m.rate - x.m.rate : (x.m.cost ?? last) - (y.m.cost ?? last)) || x.b.price - y.b.price);
      const topRate = Math.max(...rows.map((r) => r.m.rate));
      const bestRate = rows.reduce((x, y) => (y.m.rate > x.m.rate ? y : x));
      const cheapest = rows.reduce((x, y) => ((y.m.cost ?? last) < (x.m.cost ?? last) ? y : x));
      const worst = rows.reduce((x, y) => (y.m.rate < x.m.rate ? y : x));

      // Best and worst in two lines.
      const lines = [];
      if (goal === 'collection') {
        lines.push(['Le plus de cartes nouvelles', bestRate, ` · ≈ ${dec(bestRate.a.fresh, 1)} par booster.`]);
        if (cheapest.a.perFresh != null) lines.push(['Moins cher', cheapest, ` · ≈ ${fmt(cheapest.a.perFresh)} Perles par carte nouvelle.`]);
      } else if (goal === 'value') {
        lines.push(['Meilleur rendement', bestRate, ` · tes cartes valent ×${dec(bestRate.a.ratio)} le prix (≈ ${fmt(bestRate.a.ev)} Perles de cartes pour ${fmt(bestRate.b.price)}).`]);
      } else {
        const p = bestRate.m.rate;
        lines.push(['Meilleur taux', bestRate, ` · ${pct(p)} de chance à chaque booster, ${boostersFor(p)} (≈ ${fmt(bestRate.b.price / p)} Perles en moyenne).`]);
        if (cheapest !== bestRate && cheapest.m.cost != null) lines.push(['Moins cher', cheapest, ` · ≈ ${fmt(cheapest.m.cost)} Perles en moyenne, avec ${pct(cheapest.m.rate)} de chance par booster.`]);
      }
      if (rows.length > 1 && worst !== bestRate && worst.m.rate > 0)
        lines.push([goal === 'value' ? 'Pire rendement' : goal === 'collection' ? 'Le moins de cartes nouvelles' : 'Pire taux', worst, goal === 'value' ? ` · ×${dec(worst.a.ratio)} le prix.` : ` · ${dec(topRate / worst.m.rate, 1)} fois moins ${goal === 'collection' ? 'de cartes nouvelles' : 'de chances'} que le meilleur.`]);
      summary.hidden = false;
      summary.replaceChildren(...lines.map(([label, r, text]) => h('p', {}, h('strong', {}, `${label} : `), r.b.name, text)));

      list.replaceChildren(
        ...rows.map((r, i) => {
          const share = topRate > 0 ? r.m.rate / topRate : 0;
          const badges = [];
          if (r === bestRate) badges.push(h('span', { class: 'aqm-badge is-best' }, goal === 'value' ? 'Meilleur rendement' : goal === 'collection' ? 'Le plus de nouvelles' : 'Meilleur taux'));
          if (r === cheapest && cheapest !== bestRate && goal !== 'value') badges.push(h('span', { class: 'aqm-badge is-cheap' }, 'Moins cher'));
          return h(
            'li',
            { class: `aqm-rank${r === bestRate ? ' is-best' : ''}` },
            h('span', { class: 'aqm-rank-n' }, String(i + 1)),
            packArt(r.b),
            h(
              'div',
              { class: 'aqm-rank-main' },
              h('p', { class: 'aqm-rank-title' }, h('strong', {}, r.b.name), h('span', { class: 'aqm-rank-price' }, perles(r.b.price), ' le booster'), ...badges),
              h('p', { class: 'aqm-rank-head' }, r.m.head),
              h('p', { class: 'aqm-rank-sub' }, r.m.sub, ` · ${guaranteeOf(r.b)} · ${seriesOf(r.b)}`, r.b.endsAt ? ` · jusqu’au ${new Date(r.b.endsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''),
              h('div', { class: 'aqm-rank-bar' }, h('span', { style: `width:${(100 * share).toFixed(1)}%` })),
              moreOf(r)
            ),
            h(
              'div',
              { class: 'aqm-rank-side' },
              h('strong', {}, r.m.big),
              h('small', {}, r.m.bigSub),
              h('span', { class: 'aqm-rank-ref' }, r === bestRate ? `${goal === 'value' ? 'Rendement' : 'Taux'} 100 % (la référence)` : `${goal === 'value' ? 'Rendement' : 'Taux'} ${Math.round(100 * share)} % du meilleur`)
            )
          );
        })
      );
    }

    render();
  }

  // ---------- who pulled a character ----------

  // "il y a 5 min", "il y a 3 h", "il y a 2 j".
  function timeAgo(at) {
    const s = Math.max(0, (Date.now() - at) / 1000);
    if (s < 60) return 'à l’instant';
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    return `il y a ${Math.floor(s / 86400)} j`;
  }

  async function openWhoPulled() {
    const body = openOverlay('Qui a tiré… ?', 'Les joueurs qui ont tiré récemment un personnage ou une carte d’une série, parmi les beaux tirages du jeu.');
    const suggestions = h('datalist', { id: 'aqm-pulled-suggest' });
    const search = h('input', { type: 'search', class: 'aqm-search', placeholder: 'Nom d’un personnage ou d’une série…', 'aria-label': 'Personnage ou série', list: 'aqm-pulled-suggest', autocomplete: 'off' });
    const rarityRow = h('div', { class: 'aqm-chips' });
    const status = h('p', { class: 'aqm-note' }, 'Chargement des tirages…');
    const list = h('ol', { class: 'aqm-pulled' });
    body.append(h('div', { class: 'aqm-pick' }, search), h('div', { class: 'aqm-pick' }, rarityRow), status, list, suggestions);
    let rarity = '';
    let asked = 0;
    let timer = 0;

    const renderRarities = () =>
      rarityRow.replaceChildren(
        ...[['', 'Toutes'], ...['SSR', 'UR', 'SEC'].map((c) => [c, c])].map(([code, label]) =>
          h(
            'button',
            {
              type: 'button',
              class: `aqm-chip${code ? ` aqm-chip-r aqm-r-${code}` : ''}${code === rarity ? ' is-on' : ''}`,
              'aria-pressed': String(code === rarity),
              onclick: () => {
                rarity = code;
                load();
              }
            },
            label
          )
        )
      );

    async function load() {
      renderRarities();
      const n = ++asked;
      const query = search.value.trim();
      let res;
      try {
        res = await ask({ type: 'who-pulled', query, rarity });
      } catch (e) {
        status.textContent = e.message;
        return;
      }
      if (n !== asked) return;
      suggestions.replaceChildren(...res.suggestions.map((s) => h('option', { value: s })));
      const since = res.since ? new Date(res.since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : null;
      status.textContent = query
        ? res.total
          ? `${fmt(res.total)} tirage${res.total > 1 ? 's' : ''} de « ${query} » parmi les ${fmt(res.kept)} beaux tirages gardés${since ? ` depuis le ${since}` : ''}.`
          : `Personne n’a tiré « ${query} » parmi les ${fmt(res.kept)} beaux tirages gardés${since ? ` depuis le ${since}` : ''}.`
        : `Les derniers beaux tirages (${fmt(res.kept)} gardés${since ? ` depuis le ${since}` : ''}). Tape un nom pour chercher.`;
      list.replaceChildren(
        ...res.pulls.map((p) =>
          h(
            'li',
            { class: 'aqm-pull' },
            h('a', { href: `/jeu/carte/${encodeURIComponent(p.card.id)}`, class: 'aqm-pull-card' }, h('img', { src: cardImageUrl(p.card.image), alt: '', loading: 'lazy' })),
            h(
              'div',
              { class: 'aqm-pull-main' },
              h('p', { class: 'aqm-mini-name' }, rarityCode(p.card.rarity), ' ', p.card.name, p.serial != null ? h('span', { class: 'aqm-muted' }, ` #${p.serial}${p.card.maxCopies ? `/${p.card.maxCopies}` : ''}`) : null),
              p.card.series ? h('p', { class: 'aqm-muted aqm-pull-series' }, p.card.series) : null
            ),
            h(
              'div',
              { class: 'aqm-pull-who' },
              p.player?.id ? h('a', { href: `/profile/${encodeURIComponent(p.player.id)}` }, p.player.name || 'Un joueur') : h('span', {}, p.player?.name || 'Un joueur'),
              h('small', { title: new Date(p.at).toLocaleString('fr-FR') }, timeAgo(p.at))
            )
          )
        )
      );
    }

    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(load, 250);
    });
    load();
  }

  // ---------- favourite series ----------

  let favIds = null; // ids of the favourite series, for the stars of the Collection page
  let seriesBySlug = null; // slug -> id, from the game's series

  // Reads the favourites (fresh: with the changes made on the other devices right now) and repaints the stars.
  async function loadFavIds(fresh = false) {
    const res = await send({ type: 'favorites', fresh });
    if (!res || res.error) return;
    favIds = new Set(res.favorites.map((s) => s.id));
    seriesBySlug = new Map(res.all.map((s) => [s.slug, s.id]));
    document.querySelectorAll('.aqm-star').forEach((star) => paintStar(star));
    const count = document.querySelector('.aqm-fav-open b');
    if (count) count.textContent = String(favIds.size);
  }

  async function toggleFavorite(id, on) {
    const res = await send({ type: 'favorite', id, on });
    if (res?.favorites) favIds = new Set(res.favorites);
    document.querySelectorAll('.aqm-star').forEach((star) => paintStar(star));
    const count = document.querySelector('.aqm-fav-open b');
    if (count) count.textContent = String(favIds?.size ?? 0);
  }

  function paintStar(star) {
    const on = !!favIds?.has(star.dataset.id);
    setText(star, on ? '★' : '☆');
    star.classList.toggle('is-on', on);
    star.title = on ? 'Retirer des séries favorites' : 'Ajouter aux séries favorites';
    star.setAttribute('aria-pressed', String(on));
  }

  let favLoading = false;

  // Stars on the series of the Collection page, and a "★ Favoris" button above them.
  function markFavoriteSeries() {
    if (!location.pathname.startsWith('/jeu/collection')) return;
    const strip = document.querySelector('[role="radiogroup"][aria-label="Série"], [role="radiogroup"][aria-label="Série"]') ?? seriesStrip();
    if (!strip || strip.closest('.aqm-root')) return;
    if (!seriesBySlug) {
      if (!favLoading) {
        favLoading = true;
        loadFavIds().finally(() => {
          favLoading = false;
          schedule();
        });
      }
      return;
    }
    if (!strip.previousElementSibling?.classList.contains('aqm-fav-bar'))
      strip.before(
        h(
          'div',
          { class: 'aqm-root aqm-fav-bar' },
          h('button', { type: 'button', class: 'aqm-chip aqm-fav-open', onclick: openFavorites }, '★ Favoris ', h('b', {}, String(favIds?.size ?? 0)))
        )
      );
    for (const img of strip.querySelectorAll('img[src*="/api/covers/"]')) {
      const tile = img.closest('button, a, [role="radio"]') ?? img.parentElement;
      if (!tile || tile.querySelector(':scope > .aqm-star')) continue;
      const slug = decodeURIComponent(img.getAttribute('src').match(/\/api\/covers\/([^/?#]+)\.webp/)?.[1] ?? '');
      const id = seriesBySlug.get(slug);
      if (!id) continue;
      const star = h('span', {
        class: 'aqm-root aqm-star',
        role: 'button',
        tabindex: '0',
        'data-id': id,
        onclick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(id, !favIds?.has(id));
        },
        onkeydown: (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(id, !favIds?.has(id));
        }
      });
      paintStar(star);
      tile.classList.add('aqm-rel');
      tile.append(star);
    }
  }

  async function openFavorites() {
    const body = openOverlay('Séries favorites', 'Les personnages de tes séries favorites : ceux que tu as, ceux qui te manquent, et ta liste de recherches du jeu.');
    body.parentElement.classList.add('aqm-panel-wide');
    const status = h('p', { class: 'aqm-note' }, 'Chargement de tes séries…');
    body.append(status);
    let report;
    let show = 'missing';
    let rarity = '';
    let fresh = true;
    const load = async () => {
      report = await ask({ type: 'favorites', fresh });
      fresh = false;
      favIds = new Set(report.favorites.map((s) => s.id));
      seriesBySlug = new Map(report.all.map((s) => [s.slug, s.id]));
    };
    try {
      await load();
    } catch (e) {
      status.textContent = e.message;
      return;
    }
    status.remove();

    const suggestions = h('datalist', { id: 'aqm-series-suggest' });
    const add = h('input', { type: 'search', class: 'aqm-search', placeholder: 'Ajouter une série aux favoris…', 'aria-label': 'Ajouter une série', list: 'aqm-series-suggest', autocomplete: 'off' });
    const found = h('ul', { class: 'aqm-fav-found' });
    const filters = h('div', { class: 'aqm-sorts' });
    const content = h('div', { class: 'aqm-fav-list' });
    body.append(h('div', { class: 'aqm-pick' }, add), found, filters, content, suggestions);

    // Series matching what is typed, each with a star.
    const renderFound = () => {
      const q = add.value
        .trim()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
      const fold = (s) =>
        String(s ?? '')
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase();
      const hits = q ? report.all.filter((s) => fold(s.title).includes(q)).slice(0, 8) : [];
      suggestions.replaceChildren(...hits.map((s) => h('option', { value: s.title })));
      found.replaceChildren(
        ...hits.map((s) =>
          h(
            'li',
            {},
            h('img', { src: `/api/covers/${s.slug}.webp`, alt: '', loading: 'lazy' }),
            h('span', {}, h('strong', {}, s.title), h('small', {}, `${fmt(s.owned)}/${fmt(s.total)}`)),
            h(
              'button',
              {
                type: 'button',
                class: `aqm-chip${favIds.has(s.id) ? ' is-on' : ''}`,
                onclick: async () => {
                  await toggleFavorite(s.id, !favIds.has(s.id));
                  await load();
                  renderFound();
                  render();
                }
              },
              favIds.has(s.id) ? '★ Favorite' : '☆ Ajouter'
            )
          )
        )
      );
    };
    add.addEventListener('input', renderFound);

    const chip = (value, label, current, pick) =>
      h('button', { type: 'button', class: `aqm-chip${value === current ? ' is-on' : ''}`, 'aria-pressed': String(value === current), onclick: () => pick(value) }, label);

    function render() {
      filters.replaceChildren(
        h('span', { class: 'aqm-filter-name' }, 'Afficher'),
        ...[
          ['all', 'Toutes'],
          ['missing', 'Manquantes'],
          ['owned', 'Possédées'],
          ['wanted', 'Recherchées']
        ].map(([v, l]) =>
          chip(v, l, show, (x) => {
            show = x;
            render();
          })
        ),
        h('span', { class: 'aqm-filter-name aqm-gap' }, 'Rareté'),
        ...[['', 'Toutes'], ...RANKED.map((c) => [c, c])].map(([v, l]) =>
          chip(v, l, rarity, (x) => {
            rarity = x;
            render();
          })
        )
      );
      if (!report.favorites.length) {
        content.replaceChildren(h('p', { class: 'aqm-empty' }, 'Aucune série favorite pour le moment : ajoute-en avec le champ ci-dessus, ou avec l’étoile ☆ sur les séries de la page Collection.'));
        return;
      }
      content.replaceChildren(
        ...report.favorites.map((s) => {
          const keep = (c) => (!rarity || c.rarity === rarity) && (show === 'all' || (show === 'missing' && !c.owned) || (show === 'owned' && c.owned > 0) || (show === 'wanted' && c.wanted));
          const cards = s.cards.filter(keep).sort((a, b) => RANKED.indexOf(b.rarity) - RANKED.indexOf(a.rarity) || a.name.localeCompare(b.name));
          const missing = s.cards.filter((c) => !c.owned);
          const toWant = missing.filter((c) => !c.wanted).length;
          const note = h('p', { class: 'aqm-muted', role: 'status' });
          const wantAll = h(
            'button',
            {
              type: 'button',
              class: 'aqm-sort is-on',
              disabled: !toWant,
              onclick: async () => {
                wantAll.disabled = true;
                note.textContent = `Ajout de ${toWant} carte${toWant > 1 ? 's' : ''} à ta liste de recherches…`;
                try {
                  const r = await ask({ type: 'want-missing', id: s.id });
                  note.textContent =
                    `${r.added} carte${r.added > 1 ? 's' : ''} ajoutée${r.added > 1 ? 's' : ''} à ta liste de recherches.` +
                    (r.refused ? ` Le jeu a refusé la suite (« ${r.refused} ») : ${r.left} restante${r.left > 1 ? 's' : ''}.` : '');
                  await load();
                  setTimeout(render, 1500);
                } catch (e) {
                  note.textContent = e.message;
                  wantAll.disabled = false;
                }
              }
            },
            h('strong', {}, toWant ? `Rechercher les ${toWant} manquante${toWant > 1 ? 's' : ''}` : 'Toutes les manquantes sont recherchées'),
            h('small', {}, 'Le jeu te prévient quand elles sont mises en vente')
          );
          return h(
            'section',
            { class: 'aqm-fav-series' },
            h(
              'div',
              { class: 'aqm-fav-head' },
              h('img', { src: `/api/covers/${s.slug}.webp`, alt: '', loading: 'lazy' }),
              h(
                'div',
                { class: 'aqm-fav-title' },
                h('strong', {}, s.title),
                h('small', {}, `${fmt(s.owned)}/${fmt(s.total)} cartes · ${fmt(missing.length)} manquante${missing.length > 1 ? 's' : ''}`),
                h('span', { class: 'aqm-bar' }, h('span', { style: `width:${s.total ? ((100 * s.owned) / s.total).toFixed(1) : 0}%` }))
              ),
              wantAll,
              h(
                'button',
                {
                  type: 'button',
                  class: 'aqm-chip is-on',
                  title: 'Retirer des séries favorites',
                  onclick: async () => {
                    await toggleFavorite(s.id, false);
                    await load();
                    render();
                  }
                },
                '★'
              )
            ),
            note,
            cards.length
              ? h(
                  'ul',
                  { class: 'aqm-fav-cards' },
                  cards.map((c) => {
                    const want = h(
                      'button',
                      {
                        type: 'button',
                        class: `aqm-want${c.wanted ? ' is-on' : ''}`,
                        title: c.wanted ? 'Ne plus la chercher' : 'Je la cherche : être prévenu quand elle est mise en vente',
                        onclick: async (e) => {
                          e.preventDefault();
                          want.disabled = true;
                          try {
                            const r = await ask({ type: 'want', id: c.id, on: !c.wanted });
                            c.wanted = r.wanted;
                            want.classList.toggle('is-on', c.wanted);
                            want.title = c.wanted ? 'Ne plus la chercher' : 'Je la cherche : être prévenu quand elle est mise en vente';
                          } catch (err) {
                            want.title = err.message;
                          } finally {
                            want.disabled = false;
                          }
                        }
                      },
                      '🔭'
                    );
                    return h(
                      'li',
                      { class: `aqm-fav-card${c.owned ? ' is-owned' : ''}` },
                      h('a', { href: `/jeu/carte/${encodeURIComponent(c.id)}` }, h('img', { src: cardImageUrl(c.image), alt: '', loading: 'lazy' })),
                      h('p', { class: 'aqm-mini-name' }, rarityCode(c.rarity), ' ', c.name),
                      h('p', { class: 'aqm-muted' }, c.owned ? (c.owned > 1 ? `×${c.owned}` : 'Possédée') : 'Manquante'),
                      c.owned ? null : want
                    );
                  })
                )
              : h('p', { class: 'aqm-muted' }, 'Aucune carte pour ce filtre.')
          );
        })
      );
    }

    render();
  }

  // ---------- trades: bigger cards and an owned / missing dot ----------

  let owned = null; // { at, byImage }
  let tradesBusy = false;

  // Copies owned by image key, kept 30 seconds.
  async function ownedByImage() {
    if (owned && Date.now() - owned.at < 30e3) return owned.byImage;
    const res = await ask({ type: 'ownership' });
    owned = { at: Date.now(), byImage: res.byImage };
    return owned.byImage;
  }

  async function markTrades() {
    if (tradesBusy) return;
    const labels = elementsWithText(document.body, /^\s*tu (re[çc]ois|donnes)\s*:?\s*$/i);
    if (!labels.length) return;
    tradesBusy = true;
    try {
      const byImage = await ownedByImage();
      if (stopped) return;
      for (const label of labels) {
        const gives = /donnes/i.test(label.textContent);
        let box = label.parentElement;
        while (box && box !== document.body && !box.querySelector('img')) box = box.parentElement;
        if (!box || box === document.body) continue;
        for (const img of box.querySelectorAll('img')) {
          const src = img.currentSrc || img.src;
          if (!isCardImage(src) || img.closest('.aqm-root')) continue;
          const n = byImage[imageKey(src)] ?? 0;
          const frame = img.parentElement;
          let tile = frame;
          while (tile.parentElement && tile.parentElement !== box && tile.parentElement.querySelectorAll('img').length === 1) tile = tile.parentElement;
          tile.classList.add('aqm-trade-tile');
          frame.classList.add('aqm-rel');
          let dot = frame.querySelector(':scope > .aqm-dot');
          if (!dot) dot = frame.appendChild(h('span', { class: 'aqm-root aqm-dot' }));
          setClass(dot, `aqm-root aqm-dot ${n ? 'is-yes' : 'is-no'}${n > 1 ? ' has-count' : ''}`);
          setText(dot, n > 1 ? `×${n}` : '');
          const title = !n
            ? 'Tu n’as pas cette carte'
            : gives
              ? n > 1
                ? `Tu en as ${n} : il t’en restera ${n - 1}`
                : 'Ton seul exemplaire'
              : n > 1
                ? `Tu l’as déjà (${n} exemplaires)`
                : 'Tu l’as déjà';
          if (dot.title !== title) dot.title = title;
        }
      }
    } catch (e) {
      console.warn('[Aquaman] échanges :', e);
    } finally {
      tradesBusy = false;
    }
  }

  // ---------- home: bigger "Les beaux tirages" ----------

  function enlargePulls() {
    if (!/^\/jeu\/?$/.test(location.pathname)) return;
    for (const label of elementsWithText(document.body, /^\s*(les )?beaux tirages\s*$/i)) {
      let section = label.parentElement;
      while (section && section !== document.body && section.querySelectorAll('img').length < 2) section = section.parentElement;
      if (!section || section === document.body) continue;
      section.classList.add('aqm-pulls');
      for (const img of section.querySelectorAll('img')) {
        if (img.closest('.aqm-pull-thumb')) continue;
        const parent = img.parentElement;
        const wrap = parent && parent !== section && parent.children.length === 1 && !parent.textContent.trim() && parent.tagName !== 'A' ? parent : img;
        wrap.classList.add('aqm-pull-thumb');
      }
    }
  }

  // ---------- collection: the wheel scrolls the horizontal strips ----------

  // True for a strip that scrolls sideways: scrollable, or clipped with several items (not a cut-off title).
  function scrollsSideways(el, style) {
    if (el.scrollWidth - el.clientWidth < 4) return false;
    if (/(auto|scroll)/.test(style.overflowX)) return true;
    return style.overflowX === 'hidden' && el.children.length >= 3 && style.textOverflow !== 'ellipsis';
  }

  let snapBack = null; // { el, snap, smooth, timer }: snapping is put back once the wheel stops

  function onWheel(e) {
    if (stopped || !location.pathname.startsWith('/jeu/collection') || e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    for (let el = e.target instanceof Element ? e.target : null; el && el !== document.body; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (!scrollsSideways(el, style)) continue;
      // overflow-x: auto turns overflow-y to auto too: only a real vertical list keeps the wheel.
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight - el.clientHeight > 24) return;
      const max = el.scrollWidth - el.clientWidth;
      const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * el.clientWidth : e.deltaY;
      if ((delta < 0 && el.scrollLeft <= 0) || (delta > 0 && el.scrollLeft >= max - 1)) return;
      e.preventDefault();
      holdSnap(el, 250);
      el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + delta));
      return;
    }
  }

  // Strip under a point of the Collection page that scrolls sideways, or null.
  function sidewaysStrip(from) {
    for (let el = from instanceof Element ? from : null; el && el !== document.body; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (!scrollsSideways(el, style)) continue;
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight - el.clientHeight > 24) return null;
      return el;
    }
    return null;
  }

  // Scroll snapping would bring a small move back to the same card: off while scrolling, back ms after the last move.
  function holdSnap(el, ms) {
    if (snapBack?.el !== el) {
      restoreSnap();
      snapBack = { el, snap: el.style.scrollSnapType, smooth: el.style.scrollBehavior, timer: 0 };
      el.style.scrollSnapType = 'none';
      el.style.scrollBehavior = 'auto';
    }
    clearTimeout(snapBack.timer);
    if (ms) snapBack.timer = setTimeout(restoreSnap, ms);
  }

  // The click that ends a drag doesn't open what is under the pointer.
  function swallowClick() {
    const stop = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    document.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', stop, true), 400);
  }

  // ---------- collection: click and drag the horizontal strips ----------

  let grab = null; // { el, id, x, left, moved }

  function onGrabDown(e) {
    if (stopped || e.pointerType !== 'mouse' || e.button !== 0 || !location.pathname.startsWith('/jeu/collection')) return;
    if (e.target.closest?.('.aqm-slot, .aqm-root, input, textarea, select, [contenteditable]')) return;
    const el = sidewaysStrip(e.target);
    if (el) grab = { el, id: e.pointerId, x: e.clientX, left: el.scrollLeft, moved: false };
  }

  function onGrabMove(e) {
    if (!grab || e.pointerId !== grab.id) return;
    const dx = e.clientX - grab.x;
    if (!grab.moved) {
      if (Math.abs(dx) < 5) return;
      grab.moved = true;
      holdSnap(grab.el, 0);
      root.classList.add('aqm-grabbing');
      window.getSelection()?.removeAllRanges();
    }
    e.preventDefault();
    grab.el.scrollLeft = grab.left - dx;
  }

  function onGrabEnd(e) {
    if (!grab || e.pointerId !== grab.id) return;
    const g = grab;
    grab = null;
    if (!g.moved) return;
    root.classList.remove('aqm-grabbing');
    holdSnap(g.el, 250);
    if (e.type === 'pointerup') swallowClick();
  }

  // The site's images and links would start the browser's own drag instead.
  const onGrabDragStart = (e) => grab && grab.el.contains(e.target) && e.preventDefault();

  // Hand cursor on the strip of series.
  function markSeriesStrip() {
    if (!location.pathname.startsWith('/jeu/collection')) return;
    const strip = seriesStrip();
    if (strip && !strip.classList.contains('aqm-grab') && scrollsSideways(strip, getComputedStyle(strip))) strip.classList.add('aqm-grab');
  }

  function restoreSnap() {
    if (!snapBack) return;
    clearTimeout(snapBack.timer);
    snapBack.el.style.scrollSnapType = snapBack.snap;
    snapBack.el.style.scrollBehavior = snapBack.smooth;
    snapBack = null;
  }

  // ---------- "Ma vitrine": drag and drop ----------

  const slotKey = (slot) => imageKey(slot.querySelector('img')?.currentSrc || slot.querySelector('img')?.src);
  let press = null; // card pressed or dragged: { dlg, slot, key, x, y, id, touch, active, ghost }
  let moving = false;

  // Slots of the showcase editor in order: the card and its row of 3 buttons (‹ › ✕).
  function showcaseSlots(dlg) {
    const slots = [];
    for (const el of dlg.querySelectorAll('div, li, span')) {
      if (el.closest('.aqm-root') || el.querySelector('img') || el.querySelectorAll('button').length !== 3) continue;
      if ([...el.children].some((c) => c.querySelectorAll('button').length === 3)) continue;
      let slot = el.parentElement;
      while (slot && slot !== dlg && !slot.querySelector('img')) slot = slot.parentElement;
      if (!slot || slot === dlg || slot.querySelectorAll('img').length !== 1) continue;
      slots.push({ slot, controls: el });
    }
    return slots;
  }

  // Windows titled "Ma vitrine".
  function showcaseDialogs() {
    const found = new Set();
    for (const dlg of document.querySelectorAll('[role="dialog"], [aria-modal="true"]')) {
      if (dlg.closest('.aqm-root')) continue;
      if (/ma vitrine/i.test(dlg.querySelector('h1, h2, h3')?.textContent ?? '')) found.add(dlg);
    }
    if (!found.size)
      for (const label of elementsWithText(document.body, /^\s*ma vitrine\s*$/i)) {
        let el = label;
        while (el && el !== document.body && getComputedStyle(el).position !== 'fixed') el = el.parentElement;
        if (el && el !== document.body) found.add(el);
      }
    return [...found];
  }

  function enhanceShowcaseEditor() {
    for (const dlg of showcaseDialogs()) {
      const slots = showcaseSlots(dlg);
      if (!slots.length) continue;
      dlg.classList.add('aqm-vitrine');
      for (const s of slots) wireSlot(dlg, s);
    }
  }

  // Hides the slot's buttons, adds the remove cross and the drag.
  function wireSlot(dlg, { slot, controls }) {
    controls.classList.add('aqm-hidden');
    for (const img of slot.querySelectorAll('img')) if (img.draggable) img.draggable = false;
    if (slot.dataset.aqmSlot) return;
    slot.dataset.aqmSlot = '1';
    slot.classList.add('aqm-slot');
    slot.append(
      h('button', {
        type: 'button',
        class: 'aqm-root aqm-slot-x',
        title: 'Retirer de la vitrine',
        'aria-label': 'Retirer de la vitrine',
        html: ICON_X,
        onclick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          showcaseSlots(dlg)
            .find((s) => s.slot === slot)
            ?.controls.querySelectorAll('button')[2]
            ?.click();
        }
      })
    );
    slot.addEventListener('dragstart', (e) => e.preventDefault());
    slot.addEventListener('pointerdown', (e) => {
      if (moving || press || e.button !== 0 || e.target.closest('.aqm-slot-x')) return;
      const touch = e.pointerType !== 'mouse';
      press = { dlg, slot, key: slotKey(slot), x: e.clientX, y: e.clientY, id: e.pointerId, touch, active: false, ghost: null };
      if (touch) press.timer = setTimeout(() => press?.slot === slot && !press.active && beginDrag(), 350);
    });
  }

  // Starts dragging: a copy of the card follows the pointer.
  function beginDrag() {
    const r = press.slot.getBoundingClientRect();
    press.active = true;
    press.dx = press.x - r.left;
    press.dy = press.y - r.top;
    const ghost = press.slot.cloneNode(true);
    ghost.removeAttribute('data-aqm-slot');
    ghost.className = 'aqm-root aqm-ghost';
    ghost.style.cssText = `width:${r.width}px;height:${r.height}px;transform:translate(${r.left}px,${r.top}px)`;
    document.body.append(ghost);
    press.ghost = ghost;
    press.slot.classList.add('aqm-dragging');
    navigator.vibrate?.(15);
  }

  // Slot of the window under a point.
  function slotAt(dlg, x, y) {
    const slot = document.elementFromPoint(x, y)?.closest('.aqm-slot');
    return slot && dlg.contains(slot) ? slot : null;
  }

  const clearOver = (dlg) => dlg.querySelectorAll('.aqm-over').forEach((el) => el.classList.remove('aqm-over'));

  // Ends a press; a drop on another slot moves the card there.
  function endPress(drop, e) {
    if (!press) return;
    const p = press;
    press = null;
    clearTimeout(p.timer);
    if (!p.active) return;
    p.ghost.remove();
    p.slot.classList.remove('aqm-dragging');
    clearOver(p.dlg);
    swallowClick();
    if (!drop) return;
    const target = slotAt(p.dlg, e.clientX, e.clientY);
    const list = showcaseSlots(p.dlg);
    const to = list.findIndex((s) => s.slot === target);
    const from = list.findIndex((s) => slotKey(s.slot) === p.key);
    if (from >= 0 && to >= 0 && from !== to) moveSlot(p.dlg, p.key, to);
  }

  function onPointerMove(e) {
    if (!press || e.pointerId !== press.id) return;
    if (!press.active) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) return;
      if (press.touch) return endPress(false); // the finger moved before the long press: a scroll
      beginDrag();
    }
    e.preventDefault();
    press.ghost.style.transform = `translate(${e.clientX - press.dx}px,${e.clientY - press.dy}px)`;
    const over = slotAt(press.dlg, e.clientX, e.clientY);
    if (!over?.classList.contains('aqm-over')) {
      clearOver(press.dlg);
      if (over && over !== press.slot) over.classList.add('aqm-over');
    }
  }

  // Moves the card with the site's arrows, one slot at a time, up to the slot wanted.
  async function moveSlot(dlg, key, to) {
    if (moving) return;
    moving = true;
    dlg.classList.add('aqm-moving');
    try {
      for (let step = 0; step < 12; step++) {
        const list = showcaseSlots(dlg);
        const at = list.findIndex((s) => slotKey(s.slot) === key);
        if (at < 0 || at === to) break;
        const btn = list[at].controls.querySelectorAll('button')[to > at ? 1 : 0];
        if (!btn || btn.disabled) break;
        btn.click();
        await slotMoved(dlg, key, at);
      }
    } finally {
      moving = false;
      dlg.classList.remove('aqm-moving');
    }
  }

  // Waits until the card left its slot (0.8 s at most).
  function slotMoved(dlg, key, was) {
    return new Promise((resolve) => {
      let timer = 0;
      const obs = new MutationObserver(() => check());
      const done = () => {
        obs.disconnect();
        clearTimeout(timer);
        resolve();
      };
      const check = () => showcaseSlots(dlg).findIndex((s) => slotKey(s.slot) === key) !== was && done();
      obs.observe(dlg, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
      timer = setTimeout(done, 800);
      check();
    });
  }

  // ---------- home: pity counters under the free booster timer ----------

  let pityReport = null; // { opened, sync, SSR: { since, known, every, left }, UR: { … } }
  let pityAt = 0;
  let pityLoading = false;
  let pityRulesSent = '';

  // The numbers of the shop's text "une SSR tous les 60 boosters et une UR tous les 190 boosters".
  function readPityRules() {
    for (const el of elementsWithText(document.body, /SSR tous les \d+ boosters/i)) {
      const m = el.textContent.match(/SSR tous les (\d+) boosters.*?UR tous les (\d+)/i);
      if (!m || pityRulesSent === m[0]) continue;
      pityRulesSent = m[0];
      send({ type: 'pity-rules', rules: { SSR: Number(m[1]), UR: Number(m[2]) } }).then(() => (pityReport = null));
    }
  }

  // Where the counters go: after the "+1 booster dans …" timer, else after the "Acheter un booster" buttons.
  function pityPlace() {
    for (const label of elementsWithText(document.body, /booster dans|r[ée]serve pleine/i)) {
      let pill = label;
      while (pill.parentElement && pill.parentElement !== document.body && !pill.querySelector('svg, [role="progressbar"]') && pill.textContent.length < 120) pill = pill.parentElement;
      if (pill.querySelector('svg, [role="progressbar"]')) return pill;
    }
    const buy = [...document.querySelectorAll('button, a')].find((b) => !b.closest('.aqm-root') && /acheter un booster|tout ouvrir/i.test(b.textContent));
    return buy?.parentElement ?? null;
  }

  function showPity() {
    if (!/^\/jeu\/?$/.test(location.pathname)) return;
    const place = pityPlace();
    if (!place) return;
    if (place.nextElementSibling?.classList.contains('aqm-pity')) {
      if (!pityReport || Date.now() - pityAt > 60e3) loadPity();
      return;
    }
    document.querySelectorAll('.aqm-pity').forEach((el) => el.remove());
    place.after(h('div', { class: 'aqm-root aqm-pity', role: 'status' }));
    pityReport ? renderPity() : loadPity();
  }

  // Reads the counters again (fresh: with the openings of the other devices right now).
  async function loadPity(fresh = false) {
    if (pityLoading) return;
    pityLoading = true;
    pityAt = Date.now();
    try {
      const report = await send({ type: 'pity', fresh });
      if (report && !report.error) pityReport = report;
    } finally {
      pityLoading = false;
    }
    renderPity();
  }

  function renderPity() {
    const box = document.querySelector('.aqm-pity');
    if (!box || !pityReport) return;
    const line = (code) => {
      const p = pityReport[code];
      const left = p.left;
      const when = left <= 1 ? 'au prochain booster' : `dans ${fmt(left)} boosters`;
      return h(
        'div',
        { class: 'aqm-pity-line', title: p.known ? `${fmt(p.since)} booster${p.since > 1 ? 's' : ''} ouvert${p.since > 1 ? 's' : ''} depuis ta dernière ${code} ou mieux.` : `Aquaman n’a pas encore vu de ${code} sortir : il compte depuis son installation, donc la garantie peut arriver plus tôt.` },
        h('p', {}, rarityCode(code), ' garantie ', h('strong', {}, when), p.known ? '' : ' au plus'),
        h('span', { class: 'aqm-bar' }, h('span', { style: `width:${Math.min(100, (100 * p.since) / p.every).toFixed(1)}%` })),
        h('small', {}, p.known ? `${fmt(p.since)} / ${fmt(p.every)} depuis ta dernière ${code}` : `${fmt(p.since)} / ${fmt(p.every)} sans ${code} depuis qu’Aquaman compte`)
      );
    };
    box.replaceChildren(
      h('p', { class: 'aqm-label' }, 'Garantie anti-malchance'),
      h('div', { class: 'aqm-pity-lines' }, line('SSR'), line('UR')),
      h(
        'p',
        { class: 'aqm-pity-note' },
        {
          ok: 'Compté par Aquaman à chaque booster ouvert, et partagé entre tes appareils (PC, téléphone, extension ou script).',
          waiting: 'Compté par Aquaman à chaque booster ouvert, et partagé entre tes appareils dès ta prochaine ouverture.',
          error: 'Compté par Aquaman sur ce navigateur : le partage avec tes autres appareils ne répond pas pour le moment.',
          off: 'Compté par Aquaman à chaque booster ouvert sur ce navigateur (partage entre appareils désactivé).'
        }[pityReport.sync] ?? 'Compté par Aquaman à chaque booster ouvert.'
      )
    );
  }

  // ---------- guided tour ----------

  const navLink =(route) => firstVisible(`a[data-tour="nav-${route}"]`) ?? firstVisible(`a[href="${route}"]`);

  // An item of the "Plus" menu, opened for the tour.
  function menuItem(i) {
    const plus = firstVisible('.aqm-plus');
    if (!plus) return null;
    if (!menu || menu.anchor !== plus) openMenu(plus);
    return menu.querySelectorAll('.aqm-menu-item')[i];
  }

  // The strip of series of the Collection page.
  function seriesStrip() {
    for (const label of elementsWithText(document.body, /toutes les s[ée]ries/i)) {
      for (let el = label; el && el !== document.body; el = el.parentElement)
        if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return el;
      return label.closest('button, a') ?? label;
    }
    return null;
  }

  const FINDERS = {
    plus: () => firstVisible('.aqm-plus'),
    'menu-0': () => menuItem(0),
    'menu-1': () => menuItem(1),
    'menu-2': () => menuItem(2),
    'menu-3': () => menuItem(3),
    series: () => seriesStrip() ?? navLink('/jeu/collection'),
    vitrine: () => [...document.querySelectorAll('button, a')].find((b) => isVisible(b) && !b.closest('.aqm-root') && /ma vitrine/i.test(b.textContent))
  };

  // Element circled by a step.
  const stepTarget = (step) => (step.find ? FINDERS[step.find]?.() : step.target ? firstVisible(step.target) : null);
  const stepText = (step) => (typeof step.text === 'string' ? step.text : canHover() ? step.text.hover : step.text.touch);

  let tour = null; // { i, token, el, layer, hole, card, raf }

  function startTour(i = 0) {
    if (stopped) return;
    closeOverlay();
    stopTour();
    const hole = h('div', { class: 'aqm-tour-hole' });
    const card = h('div', { class: 'aqm-tour-card', role: 'dialog', 'aria-live': 'polite' });
    const layer = h('div', { class: 'aqm-root aqm-tour' }, h('div', { class: 'aqm-tour-block' }), hole, card);
    document.body.append(layer);
    tour = { i: 0, token: 0, el: null, layer, hole, card, raf: 0 };
    const follow = () => {
      if (!tour) return;
      placeTour();
      tour.raf = requestAnimationFrame(follow);
    };
    follow();
    showStep(i);
  }

  function stopTour() {
    if (!tour) return;
    cancelAnimationFrame(tour.raf);
    tour.layer.remove();
    tour = null;
    session(TOUR_STEP, null);
    closeMenu();
    if (location.hash === TOUR_HASH) history.replaceState(null, '', location.pathname + location.search);
  }

  // Element found by find, once visible (null after ms).
  async function waitFor(find, ms) {
    const end = Date.now() + ms;
    for (;;) {
      const el = find();
      if (el && isVisible(el)) return el;
      if (Date.now() > end || !tour) return null;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // Shows step i: goes to its page, then circles its element.
  async function showStep(i) {
    if (!tour) return;
    const step = TOUR[i];
    const token = ++tour.token;
    tour.i = i;
    tour.el = null;
    session(TOUR_STEP, String(i));
    if (!step.find?.startsWith('menu')) closeMenu();
    renderTourCard(step, true);
    if (step.page && location.pathname.replace(/\/$/, '') !== step.page) {
      const link = navLink(step.page);
      if (link) link.click();
      else return void location.assign(step.page); // the tour resumes after the page loads
    }
    const el = step.find || step.target ? await waitFor(() => stepTarget(step), 6000) : null;
    if (!tour || token !== tour.token) return;
    tour.el = el;
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    renderTourCard(step, false);
  }

  function renderTourCard(step, loading) {
    const { i, card } = tour;
    const last = i === TOUR.length - 1;
    card.replaceChildren(
      h('p', { class: 'aqm-tour-count' }, `${i + 1} / ${TOUR.length}`),
      h('h3', { class: 'aqm-tour-title' }, step.title),
      h('p', { class: 'aqm-tour-text' }, loading && step.page ? 'Ouverture de la page…' : stepText(step)),
      h(
        'div',
        { class: 'aqm-tour-actions' },
        last ? null : h('button', { type: 'button', class: 'aqm-tour-skip', onclick: stopTour }, 'Passer'),
        h('span', { class: 'aqm-tour-gap' }),
        i > 0 ? h('button', { type: 'button', class: 'aqm-tour-btn', onclick: () => showStep(i - 1) }, 'Précédent') : null,
        h('button', { type: 'button', class: 'aqm-tour-btn is-main', onclick: () => (last ? stopTour() : showStep(i + 1)) }, last ? 'Terminer' : i === 0 ? 'C’est parti' : 'Suivant')
      )
    );
  }

  // Light hole over the element shown and a bubble next to it (at the bottom or top of the screen on a phone).
  function placeTour() {
    const { el, hole, card, layer } = tour;
    const r = el && el.isConnected ? el.getBoundingClientRect() : null;
    const pad = 8;
    const shown = !!(r && r.width);
    if (shown) Object.assign(hole.style, { display: 'block', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    else hole.style.display = 'none';
    layer.classList.toggle('is-dim', !shown);
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    let left;
    let top;
    if (!shown) {
      left = (innerWidth - cw) / 2;
      top = (innerHeight - ch) / 2;
    } else if (innerWidth < 640) {
      left = (innerWidth - cw) / 2;
      top = r.top + r.height / 2 > innerHeight / 2 ? 12 : innerHeight - ch - 12;
    } else {
      left = Math.max(12, Math.min(innerWidth - cw - 12, r.left + r.width / 2 - cw / 2));
      top = r.bottom + pad + 12 + ch < innerHeight ? r.bottom + pad + 12 : Math.max(12, r.top - pad - 12 - ch);
    }
    card.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  // ---------- what's new ----------

  const versionNewer = (a, b) => {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  };

  // Entries of CHANGES newer than since (all of them without since).
  function openNews(since) {
    const entries = CHANGES.filter((c) => !since || versionNewer(c.version, since));
    const body = openOverlay('Nouveautés', since ? `Ce qui a changé depuis la version ${since}.` : 'Ce qui a changé dans chaque version d’Aquaman.');
    for (const entry of entries.length ? entries : CHANGES.slice(0, 1)) {
      body.append(
        h('p', { class: 'aqm-label aqm-news-version' }, `Version ${entry.version}`),
        h(
          'ul',
          { class: 'aqm-news' },
          entry.items.map(([text, stepId]) => {
            const at = stepId ? TOUR.findIndex((s) => s.id === stepId) : -1;
            return h('li', {}, h('span', {}, text), at >= 0 ? h('button', { type: 'button', class: 'aqm-chip', onclick: () => startTour(at) }, 'Montre-moi') : null);
          })
        )
      );
    }
    body.append(h('div', { class: 'aqm-news-foot' }, h('button', { type: 'button', class: 'aqm-tour-btn is-main', onclick: () => startTour(0) }, 'Visite guidée'), h('button', { type: 'button', class: 'aqm-tour-btn', onclick: closeOverlay }, 'Fermer')));
  }

  // Once per version: the tour the first time, then what's new after an update ("notifyUpdated" setting).
  async function showTutorialOnce() {
    if (location.hash === TOUR_HASH || location.hash === NEWS_HASH || session(TOUR_STEP) != null) return;
    const version = chrome.runtime.getManifest().version;
    const { seenVersion, settings } = await chrome.storage.local.get(['seenVersion', 'settings']);
    if (seenVersion === version) return;
    await chrome.storage.local.set({ seenVersion: version });
    if (!seenVersion) startTour(0);
    else if (settings?.notifyUpdated !== false && versionNewer(version, seenVersion)) openNews(seenVersion);
  }

  // Opens the tour or what's new from the address (#aqm-visite, #aqm-nouveautes), used by the popup and the notifications.
  function onHash() {
    if (location.hash === TOUR_HASH && !tour) startTour(0);
    else if (location.hash === NEWS_HASH && !overlay) {
      openNews();
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  // Resumes the tour after a page load, or starts what the address asks for, once the "Plus" tab is there.
  let started = false;
  function startOnce() {
    if (started || !firstVisible('.aqm-plus')) return;
    started = true;
    const resume = session(TOUR_STEP);
    if (resume != null) startTour(Math.min(TOUR.length - 1, Number(resume) || 0));
    else onHash();
    showTutorialOnce();
  }

  // ---------- keyboard ----------

  function onKey(e) {
    if (tour) {
      if (e.key === 'Escape') stopTour();
      else if (e.key === 'ArrowRight' && tour.i < TOUR.length - 1) showStep(tour.i + 1);
      else if (e.key === 'ArrowLeft' && tour.i > 0) showStep(tour.i - 1);
      return;
    }
    if (e.key !== 'Escape') return;
    if (menu) closeMenu();
    else if (overlay) closeOverlay();
  }

  // Back on the page (another device may have opened boosters meanwhile): the counters are read again.
  function onBack() {
    if (document.visibilityState !== 'visible') return;
    if (document.querySelector('.aqm-pity')) loadPity(true);
    if (document.querySelector('.aqm-star')) loadFavIds(true);
  }

  function onOutside(e) {
    if (menu && !menu.contains(e.target) && !menu.anchor?.contains(e.target) && !e.target.closest?.('.aqm-tour')) closeMenu();
  }

  // ---------- loop ----------

  function run() {
    if (stopped) return;
    if (!alive()) return shutdown();
    if (!location.pathname.startsWith('/jeu')) return;
    for (const step of [addPlusTab, enlargePulls, showPity, readPityRules, markSeriesStrip, markFavoriteSeries, enhanceShowcaseEditor, markTrades, pollFeedNow, startOnce]) {
      try {
        step();
      } catch (e) {
        console.warn('[Aquaman]', e);
      }
    }
  }

  // The script has no background worker: while a page of the game is open, the "beaux tirages" are read every 5 minutes.
  let feedAt = 0;
  function pollFeedNow() {
    if (Date.now() - feedAt < 5 * 60e3) return;
    feedAt = Date.now();
    send({ type: 'feed-poll' });
  }

  let queued = false;
  function schedule() {
    if (queued || stopped) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      run();
    }, 150);
  }

  const observer = new MutationObserver(schedule);
  const listeners = [
    [document, 'wheel', onWheel, { passive: false, capture: true }],
    [document, 'pointerdown', onGrabDown, true],
    [document, 'pointermove', onGrabMove, { passive: false }],
    [document, 'pointerup', onGrabEnd],
    [document, 'pointercancel', onGrabEnd],
    [document, 'dragstart', onGrabDragStart, true],
    [document, 'pointermove', onPointerMove, { passive: false }],
    [document, 'touchmove', (e) => press?.active && e.preventDefault(), { passive: false }],
    [document, 'contextmenu', (e) => press && e.target.closest?.('.aqm-slot') && e.preventDefault()],
    [document, 'pointerup', (e) => press && e.pointerId === press.id && endPress(true, e)],
    [document, 'pointercancel', (e) => press && e.pointerId === press.id && endPress(false, e)],
    [document, 'pointerdown', onOutside, true],
    [document, 'keydown', onKey],
    [window, 'resize', closeMenu],
    [window, 'popstate', closeOverlay],
    [window, 'hashchange', onHash],
    [window, 'message', onPageMessage],
    [window, 'focus', onBack],
    [document, 'visibilitychange', onBack]
  ];

  let stopped = false;

  // Removes everything Aquaman added and stops.
  function shutdown() {
    if (stopped) return;
    stopped = true;
    restoreSnap();
    observer.disconnect();
    for (const [target, type, fn, opts] of listeners) target.removeEventListener(type, fn, opts);
    if (tour) cancelAnimationFrame(tour.raf);
    tour = null;
    menu = null;
    overlay = null;
    document.querySelectorAll('.aqm-root, .aqm-plus').forEach((el) => el.remove());
    document.querySelectorAll('[class*="aqm-"]').forEach((el) => {
      for (const cls of [...el.classList]) if (cls.startsWith('aqm-')) el.classList.remove(cls);
    });
    document.querySelectorAll('[data-aqm-slot]').forEach((el) => delete el.dataset.aqmSlot);
    root.classList.remove('aqm-lock');
    if (root.dataset.aqmOwner === owner) delete root.dataset.aqmOwner;
  }

  for (const [target, type, fn, opts] of listeners) target.addEventListener(type, fn, opts);
  observer.observe(root, { childList: true, subtree: true });
  run();
})();

  // ---------- 6. src/userscript/panel.js : réglages ----------
  if (document.documentElement.dataset.aqmOwner === OWNER) {
// Userscript: settings in the "Plus" menu of the site, in place of the extension's popup.
(() => {
  const OPTIONS = [
    ['notifyUpdated', 'Afficher les nouveautés après une mise à jour du script'],
    ['syncPity', 'Partager le compte de la garantie anti-malchance entre mes appareils (PC, téléphone, extension et script)'],
    ['syncFavorites', 'Partager mes séries favorites entre mes appareils']
  ];
  const ICON_GEAR =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Z"/></svg>';

  // Settings window.
  async function openSettings() {
    document.querySelector('.aqm-settings')?.remove();
    const { settings } = await chrome.storage.local.get('settings');
    const current = { notifyUpdated: true, syncPity: true, syncFavorites: true, ...settings };
    const close = () => {
      back.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), close());
    const go = (hash) => {
      close();
      location.hash = hash;
    };
    const back = document.createElement('div');
    back.className = 'aqm-root aqm-overlay aqm-settings';
    back.innerHTML = `
      <div class="aqm-panel" role="dialog" aria-modal="true" aria-label="Réglages d’Aquaman">
        <div class="aqm-head">
          <div><h2 class="aqm-title">Réglages</h2><p class="aqm-sub">Script Aquaman · version ${VERSION}</p></div>
          <button type="button" class="aqm-close" aria-label="Fermer">✕</button>
        </div>
        <div class="aqm-body">
          <div class="aqm-settings-list"></div>
          <div class="aqm-news-foot">
            <button type="button" class="aqm-tour-btn" data-go="#aqm-nouveautes">Nouveautés</button>
            <button type="button" class="aqm-tour-btn is-main" data-go="#aqm-visite">Visite guidée</button>
          </div>
          <p class="aqm-note">Les mises à jour du script s’installent toutes seules par ton gestionnaire de scripts (Tampermonkey, Violentmonkey, Userscripts).</p>
        </div>
      </div>`;
    const list = back.querySelector('.aqm-settings-list');
    for (const [key, text] of OPTIONS) {
      const label = document.createElement('label');
      label.className = 'aqm-switch';
      label.innerHTML = '<input type="checkbox" /> <span></span>';
      label.querySelector('span').textContent = text;
      const box = label.querySelector('input');
      box.checked = !!current[key];
      box.addEventListener('change', async () => {
        const { settings: now } = await chrome.storage.local.get('settings');
        await chrome.storage.local.set({ settings: { ...now, [key]: box.checked } });
      });
      list.appendChild(label);
    }
    back.querySelector('.aqm-close').addEventListener('click', close);
    back.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
    back.addEventListener('click', (e) => e.target === back && close());
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
  }

  // "Réglages" entry at the end of the "Plus" menu each time it opens.
  new MutationObserver(() => {
    const menu = document.querySelector('.aqm-menu');
    if (!menu || menu.querySelector('.aqm-menu-settings')) return;
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.className = 'aqm-menu-item aqm-menu-settings';
    item.innerHTML = `<span class="aqm-menu-ico">${ICON_GEAR}</span><span><strong>Réglages</strong><small>Script Aquaman ${VERSION}</small></span>`;
    item.addEventListener('click', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); // closes the menu
      openSettings();
    });
    menu.appendChild(item);
  }).observe(document.body, { childList: true });
})();

  } else style.remove();
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
})();
