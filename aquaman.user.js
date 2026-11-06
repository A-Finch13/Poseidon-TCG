// ==UserScript==
// @name         Aquaman
// @namespace    https://github.com/A-Finch13/Poseidon-TCG
// @version      1.4.8
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
 *  5. tutorial.js et content.js — étapes de la visite et nouveautés, puis tout ce qui s'affiche sur le site
 *     (réglages compris, dans le menu « Plus », les mêmes que l'extension).
 */
(() => {
'use strict';
if (window.__aquamanUserscript) return;
window.__aquamanUserscript = true;
const VERSION = '1.4.8';

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

// Every setting, by group: the same list in the extension's popup and in "Plus › Réglages" (extension and script, on
// a computer or a phone). All are on at first. Each item: [key, title, hint, only] (only: "extension" for what the
// script can't do).
const SETTINGS = [
  {
    title: 'Accueil',
    icon: '🏠',
    items: [
      ['boosterWheel', 'Boosters par catégorie', 'Classique, Magie, Action… côte à côte, avec le compte de chacun'],
      ['openMore', 'Ouvrir les 10 suivants', 'Après un « Tout ouvrir », un bouton ouvre les boosters suivants du même pack, 10 par 10'],
      ['openMoreAuto', 'Fermeture automatique', 'Après un « Tout ouvrir », la fenêtre des cartes se ferme 5 s après la dernière (sur les 10 suivantes s’il en reste)'],
      ['packGlow', 'Lueur du pack', 'La lueur derrière le booster prend la couleur de son pack'],
      ['pity', 'Garantie anti-malchance', 'Les boosters avant ta prochaine SSR et UR, et l’historique de tes tirages'],
      ['bigPulls', 'Beaux tirages agrandis', 'Les dernières cartes rares tirées par les joueurs, en plus grand']
    ]
  },
  {
    title: 'Collection',
    icon: '🗂️',
    items: [
      ['seriesTools', 'Bande des séries', 'Étoiles des séries favorites, tri « Les plus avancées » et bouton « Masquer séries <= 5 persos »'],
      ['albumButtons', 'Boutons de l’album', '« Ajouter aux favoris » et « Rechercher les manquantes »'],
      ['missingTab', 'Onglet « Manquantes »', 'Seulement les cartes qu’il te manque'],
      ['missingSales', 'Pastille « En vente »', 'Sur les cartes manquantes vendues au marché'],
      ['cardWho', 'Bouton « Qui a cette carte ? »', 'Sur la page des cartes SSR, UR et SEC : les joueurs qui l’ont']
    ]
  },
  {
    title: 'Marché',
    icon: '🛒',
    items: [
      ['hideBought', 'Masquer ce que je viens d’acheter', 'Les autres annonces d’une carte achetée disparaissent'],
      ['marketFavorites', 'Filtre « ★ Favoris »', 'Les ventes de tes séries favorites seulement'],
      ['cardListings', 'Annonces sur la page d’une carte', 'Les 5 annonces les moins chères, avec « Acheter », et les enchères en cours'],
      ['sellTools', 'Vente des doublons', 'File d’attente de « Vendre mes doublons » et bouton « Retirer mes ventes »']
    ]
  },
  {
    title: 'Échanges et vitrine',
    icon: '🔁',
    items: [
      ['tradeMarks', 'Échanges', 'Pastille « déjà possédée » sur les cartes des échanges, dans le jeu et en MP'],
      ['tradeFilters', 'Filtres des échanges', 'Proposer un échange : « Mes recherches », « Il me manque » et « Il lui manque » à côté de « Doublons »'],
      ['showcaseDrag', 'Ma vitrine', 'Glisser-déposer pour ranger tes cartes'],
      ['recycleHelp', 'Recycler des cartes', 'Rien de coché au départ, bouton « Tout cocher »']
    ]
  },
  {
    title: 'Notifications',
    icon: '🔔',
    items: [
      ['notifyBoosters', 'Nouveaux boosters', 'Une notification quand des boosters t’attendent', 'extension'],
      ['notifyUpdated', 'Nouveautés', 'Ce qui a changé, après une mise à jour d’Aquaman']
    ]
  },
  {
    title: 'Partage entre mes appareils',
    icon: '☁️',
    items: [
      ['syncPity', 'Garantie anti-malchance', 'Le compte des boosters ouverts et l’historique'],
      ['syncFavorites', 'Séries favorites', 'Les mêmes séries sur PC et téléphone'],
      ['syncWants', 'Cartes recherchées', 'La file d’attente des recherches'],
      ['syncMarket', 'Marché', 'Cartes achetées masquées et doublons en attente de vente'],
      ['sharePulls', 'Beaux tirages', 'Envoyer ceux que je vois à la base commune (« Qui a cette carte ? »)'],
      ['sharePerles', 'Mes Perles au classement', 'Montrer mon stock de Perles dans le classement des autres utilisateurs d’Aquaman']
    ]
  }
];

const DEFAULTS = Object.fromEntries(SETTINGS.flatMap((g) => g.items.map(([key]) => [key, true])));

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
function myId() {
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
async function gameStatus() {
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

// The Perles of players who use Aquaman and share them ({ [id]: perles }), from the relay; the player's own from the
// game, always.
async function sharedPerles(ids) {
  const me = await myId();
  const out = {};
  const others = [...new Set(ids)].filter((id) => id && id !== me);
  for (let i = 0; i < others.length; i += 400)
    try {
      const res = await fetch(`${RELAY}/perles`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: others.slice(i, i + 400) }) });
      if (!res.ok) throw new Error(`relay_${res.status}`);
      for (const p of (await res.json()).players ?? []) out[p.id] = p.perles;
    } catch {}
  if (ids.includes(me))
    try {
      out[me] = (await gameStatus()).perles;
    } catch {}
  return out;
}

// The players of the "Global" leaderboard: the player's friends, those the relay saw lately in the "beaux tirages"
// and those who share their Perles with Aquaman (not every player of the game: the game gives no such list).
// [{ id, name }]
async function globalPlayers() {
  const me = await myId();
  const read = async (path) => {
    const res = await fetch(`${RELAY}${path}`);
    if (!res.ok) throw new Error(`relay_${res.status}`);
    return (await res.json()).players ?? [];
  };
  const [mates, seen, rich] = await Promise.all([
    friends()
      .then((f) => f.friends)
      .catch(() => []),
    read('/players?limit=150').catch(() => []),
    read('/perles/top?limit=150').catch(() => [])
  ]);
  const byId = new Map();
  for (const p of [...mates, ...rich, ...seen]) if (p?.id && p.id !== me && !byId.has(p.id)) byId.set(p.id, { id: p.id, name: p.name ?? null });
  return { me, players: [...byId.values()] };
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
          // a card of the Halloween event: its type, its season or its picture say so
          halloween: [v.types, v.seasonId, v.season?.id, v.season?.name, v.season?.slug, v.season?.title, v.event, v.theme, v.image]
            .flat()
            .some((x) => typeof x === 'string' && /hallow/i.test(x)),
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
  // Names (or series) matching what was typed, for the suggestions of the search field: { name, image, rarities }
  // (rarities: the codes of its cards, lowest first; image: a card of it, its base one first, then the rarest).
  const suggestions = [];
  if (q && catalog) {
    const byName = new Map();
    for (const c of catalog.filter(field === 'series' ? inSeries : inName)) {
      const name = field === 'series' ? c.series?.title : c.name;
      if (!name) continue;
      if (!byName.has(name)) byName.set(name, { name, cards: [] });
      byName.get(name).cards.push(c);
    }
    // (the names starting with what was typed first)
    const starts = (name) => (fold(name).startsWith(q) ? 0 : 1);
    for (const { name, cards } of [...byName.values()].sort((a, b) => starts(a.name) - starts(b.name)).slice(0, 8)) {
      const cover = [...cards].sort((a, b) => a.extra - b.extra || (RANK[b.rarity] ?? 0) - (RANK[a.rarity] ?? 0)).find((c) => c.image);
      suggestions.push({
        name,
        image: cover?.image ?? null,
        rarities: [...new Set(cards.map((c) => c.rarity))].sort((a, b) => (RANK[a] ?? 0) - (RANK[b] ?? 0)),
        cards: cards.length
      });
    }
  }
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

// Chance that the best card of one everyday booster is a SSR, an UR or a SEC, from the game's odds, without the
// guarantees ({ SSR, UR, SEC }); null if unknown.
function rarityChances() {
  return cached('rarity-chances', 30 * 60e3, async () => {
    const rarities = await game('/rarities').then((r) => r.rarities ?? []);
    if (!rarities.length) return null;
    const slots = slotOdds(rarities, new Set(rarities.map((r) => r.code)), RANK.R);
    // (a card of this rank or better in the booster)
    const atLeast = (rank) => 1 - slots.reduce((miss, slot) => miss * (1 - Object.entries(slot).reduce((p, [c, v]) => p + ((RANK[c] ?? 0) >= rank ? v : 0), 0)), 1);
    const out = {};
    for (const code of ['SSR', 'UR', 'SEC']) out[code] = atLeast(RANK[code]) - atLeast(RANK[code] + 1);
    return out;
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

// What's left before each guarantee; "known" once a card of that rarity was seen, else an upper bound. Each counter
// starts again only with a card of its own rarity: an UR doesn't reset the SSR one (the history shows SSR coming 60
// boosters after the previous SSR across an UR).
function pityReport(mine, rules, sync, chance = null) {
  const { events } = mine;
  const out = { opened: events.length, sync: sync ? (mine.syncError ? 'error' : mine.syncedAt ? 'ok' : 'waiting') : 'off', syncedAt: mine.syncedAt || null };
  for (const code of Object.keys(PITY)) {
    let last = -1;
    for (let i = events.length - 1; i >= 0; i--)
      if (events[i].top === RANK[code]) {
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

// The kind of booster of an opening ({ id, name }), checked; null when unknown.
function cleanPack(p) {
  const id = typeof p?.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(p.id) ? p.id : null;
  return id ? { id, name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 60) : null } : null;
}

// Merges two lists of openings: each booster once, oldest first, the last PITY_EVENTS.
function mergeEvents(a, b) {
  const byId = new Map();
  for (const e of [...a, ...b])
    if (e?.id && !byId.has(e.id))
      byId.set(e.id, { id: String(e.id), at: Number(e.at) || 0, top: Number(e.top) || 0, ...(e.card ? { card: e.card } : {}), ...(e.pack ? { pack: e.pack } : {}) });
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
async function pity(fresh = false) {
  const state = await pityState();
  const on = (await getSettings()).syncPity;
  if (on) await exchangePity(state, fresh);
  return pityReport(state.mine, state.rules, on, await secChance());
}

// The player's history: for SSR, UR and SEC, each one got with the boosters opened for it since the previous one of
// that rarity, over all the openings the relay keeps (a year) and this device's.
// first: the count started with Aquaman, the real one may be higher. current: boosters opened since the last one.
async function pityHistory() {
  const state = await pityState();
  let events = state.mine.events;
  let pulls = [];
  if ((await getSettings()).syncPity)
    try {
      const all = await cached(`pity-all:${state.id}`, 60e3, async () => {
        const res = await fetch(`${RELAY}/pity/all`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ player: state.id }) });
        if (!res.ok) throw new Error(`relay_${res.status}`);
        return res.json();
      });
      pulls = all.pulls ?? [];
      const byId = new Map();
      for (const e of [...(all.events ?? []), ...events]) {
        if (!e?.id) continue;
        const known = byId.get(e.id);
        if (!known) byId.set(e.id, { at: Number(e.at) || 0, top: Number(e.top) || 0, card: e.card ?? null, pack: e.pack ?? null });
        else {
          if (!known.card && e.card) known.card = e.card;
          if (!known.pack && e.pack) known.pack = e.pack;
        }
      }
      events = [...byId.values()].sort((a, b) => a.at - b.at);
    } catch {}
  // The card of each SSR, UR and SEC: the one kept when it was opened, else the player's pull of that rarity in the
  // game's "beaux tirages" (relay) within 10 minutes of it, each pull given once.
  const used = new Set();
  const cardOf = (e, code) => {
    if (e.card) return e.card;
    let best = null;
    for (const [i, p] of pulls.entries()) {
      if (used.has(i) || p.rarity !== code) continue;
      const gap = Math.abs(p.at - e.at);
      if (gap < 10 * 60e3 && (!best || gap < best.gap)) best = { i, gap, p };
    }
    if (!best) return null;
    used.add(best.i);
    return { id: best.p.id, name: best.p.name, image: best.p.image, rarity: code };
  };
  const codeOf = (top) => Object.keys(RANK).find((k) => RANK[k] === top);
  for (const e of events) if (e.top >= RANK.SSR) e.card = cardOf(e, codeOf(e.top));
  await guessPacks(events);
  // (the tracker: the best rarity of the last 300 boosters, oldest first, and the game's odds)
  const out = { opened: events.length, since: events[0]?.at ?? null, recent: events.slice(-300).map((e) => e.top), chances: await rarityChances() };
  // (each rarity on its own: an UR is not counted among the SSR)
  for (const code of ['SSR', 'UR', 'SEC']) {
    const hits = [];
    let count = 0;
    for (const e of events) {
      count++;
      if (e.top !== RANK[code]) continue;
      hits.push({ at: e.at, top: codeOf(e.top) ?? code, card: e.card ?? null, pack: e.pack ?? null, after: count, first: !hits.length });
      count = 0;
    }
    out[code] = { hits: hits.reverse(), current: count };
  }
  return out;
}

// The pack of the SSR, UR and SEC opened before Aquaman kept it (1.4.7), from their card: a Halloween card can only
// come from the Halloween pack, any other is taken as from the Classique one (guessed: true). Left unknown without
// the card or the game's catalogue.
async function guessPacks(events) {
  const missing = events.filter((e) => e.top >= RANK.SSR && !e.pack && e.card?.id);
  if (!missing.length) return;
  const catalog = await loadCatalog();
  if (!catalog) return;
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const designs = await globalPacks();
  const halloween = Object.entries(designs ?? {}).find(([, d]) => /halloween/i.test(d?.name ?? ''))?.[0]?.replace(/--n\d+$/, '') ?? 'halloween';
  for (const e of missing) {
    const c = byId.get(e.card.id);
    if (!c) continue;
    e.pack = c.halloween ? { id: halloween, name: 'Halloween', guessed: true } : { id: 'classic', name: 'Classique', guessed: true };
  }
}

// Records opened boosters, each as the rarities of its cards; every opening gets its own id, sent once to the relay.
// best: the best card of each booster, and packs: its kind ({ id, name }), kept with the SSR, UR and SEC for the history.
// ids: the game's id of each booster, when known: the opening is kept under it ("g:<id>"), so that a booster told twice
// (the same answer read twice) is counted once; else a random id.
async function recordOpening(boosters, best = [], packs = [], ids = []) {
  const state = await pityState();
  const { mine, rules } = state;
  const now = Date.now();
  const known = new Set(mine.events.map((e) => e.id));
  const added = boosters
    .map((rarities, i) => {
      const top = Math.max(0, ...rarities.map((r) => RANK[r] ?? 0));
      const c = best[i];
      const card = top >= RANK.SSR && c?.id ? { id: String(c.id), name: c.name ?? null, image: c.image ?? null, rarity: c.rarity } : null;
      const pack = top >= RANK.SSR ? cleanPack(packs[i]) : null;
      const gameId = typeof ids[i] === 'string' && /^[A-Za-z0-9_.:-]{1,60}$/.test(ids[i]) ? `g:${ids[i]}` : null;
      return { id: gameId ?? `${(now + i).toString(36)}-${Math.random().toString(36).slice(2, 10)}`, at: now + i, top, ...(card ? { card } : {}), ...(pack ? { pack } : {}) };
    })
    .filter((e, i, all) => !known.has(e.id) && all.findIndex((x) => x.id === e.id) === i);
  if (!added.length) return pityReport(mine, rules, (await getSettings()).syncPity, await secChance());
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

// The cards searched by the player: those of the game's list, and those Aquaman keeps waiting for a free place
// (the game takes 100 cards at most).
async function searchedIds() {
  const [wanted, waiting] = await Promise.all([wantedIds().catch(() => new Set()), waitingIds()]);
  for (const id of waiting) wanted.add(id);
  return wanted;
}

// Image keys of the cards searched by the player (the filters of the exchanges tell the cards by their picture):
// the pictures of the game's list, and the catalogue's for Aquaman's waiting ones.
async function searchedImages() {
  const keys = new Set();
  const [ids, catalog] = await Promise.all([searchedIds(), loadCatalog()]);
  try {
    const { wants } = await cached('wants', 30e3, () => game('/wants'));
    for (const w of wants ?? []) {
      const key = imageKey(w?.card?.image);
      if (key) keys.add(key);
    }
  } catch {}
  for (const c of catalog ?? []) {
    const key = ids.has(c.id) && imageKey(c.image);
    if (key) keys.add(key);
  }
  return [...keys];
}

// The copies of another player by image key ({ found, private, byImage }), for the filter "Il lui manque" of the
// exchanges: by their id, else by their name among the friends, then among the players the relay saw.
async function playerOwnership({ id, name } = {}) {
  if (typeof id !== 'string' || !id) id = name ? await playerIdByName(name) : null;
  if (!id) return { found: false };
  const sc = await showcase(id);
  if (sc?.private) return { found: true, private: true };
  return { found: true, private: false, byImage: countCopies(sc).byImage };
}

async function playerIdByName(name) {
  const n = fold(name);
  if (!n) return null;
  try {
    const hit = (await friends()).friends.find((f) => fold(f.name) === n);
    if (hit) return hit.id;
  } catch {}
  try {
    const { players } = await cached('relay-players', 10 * 60e3, async () => {
      const res = await fetch(`${RELAY}/players?limit=300`);
      if (!res.ok) throw new Error(`relay_${res.status}`);
      return res.json();
    });
    return (players ?? []).find((p) => fold(p.name) === n)?.id ?? null;
  } catch {
    return null;
  }
}

// The cards waiting in Aquaman.
async function waitingIds() {
  return new Set((await chrome.storage.local.get('wantWaiting')).wantWaiting ?? []);
}

// Places of the game's search list: how many are taken, the cards Aquaman put there that the player now owns
// (to take out), those still searched, and the waiting cards still to send (neither owned nor already searched).
async function wantRoom(waiting, sent) {
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
async function globalPacks() {
  try {
    const res = await fetch(`${RELAY}/packs`);
    if (!res.ok) throw new Error(`relay_${res.status}`);
    return (await res.json())?.packs ?? null;
  } catch {
    return null;
  }
}

// The kinds of boosters the shop sells ({ kind, name, art, types }), for the author's scan.
async function packKinds() {
  const shop = await cached('shop', 60e3, () => game('/shop'));
  return (shop?.specials ?? []).map((s) => {
    const types = Array.isArray(s.types) ? s.types : [];
    return { kind: s.id, name: s.name ?? null, art: s.art ?? s.kindArt ?? s.image ?? (types[0] ? `/game/boosters/${types[0]}.webp` : null), types };
  });
}

// The favourite series, the same on every device when syncing is on.
async function favoriteIds(fresh = false) {
  const local = await localFavorites();
  if (!(await getSettings()).syncFavorites || (!fresh && Date.now() - favSyncedAt < FAV_PULL)) return local.list;
  return exchangeFavorites(local);
}

// Adds (on) or removes a series from the favourites; returns the new list. Changes run one after the other,
// so that two stars clicked quickly both count.
let favChain = Promise.resolve();
function setFavorite(id, on) {
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
async function favoritesReport(fresh = false) {
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
async function seriesStatus(id) {
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
async function syncWants(fresh = false) {
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

async function syncMarket(fresh = false) {
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
async function recordFeed(pulls, fromRelay = false) {
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
async function pollFeed() {
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
async function whoPulled(query = '', rarity = '') {
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
async function searchCards(query) {
  const q = String(query ?? '').trim();
  if (q.length < 2) return [];
  const { cards } = await cached(`card-search:${fold(q)}`, 5 * 60e3, () => game(`/cards?q=${encodeURIComponent(q)}&limit=12`));
  return (cards ?? []).map((c) => ({ id: c.id, name: c.name, variant: c.variant ?? null, image: c.image, rarity: c.rarity, series: c.series?.title ?? null, owned: c.owned ?? 0 }));
}

// The cheapest offers of a card on the market, the cheapest first (5 at most), and how many there are.
async function cardListings(id) {
  const card = await cached(`card:${id}`, 5 * 60e3, () => game(`/cards/${encodeURIComponent(id)}`));
  const { listings } = await cached(`listings:${id}`, 30e3, () => game(`/market/listings?${new URLSearchParams({ sort: 'price', q: card.name })}`));
  const offers = (listings ?? [])
    .filter((l) => (l.card?.id ?? l.cardId) === id && typeof l.price === 'number')
    .map((l) => {
      const seller = l.seller ?? l.player ?? null;
      return { id: l.id ?? null, price: l.price, serial: l.serial ?? l.copy?.serial ?? null, player: seller ? { id: seller.id, name: seller.name } : null };
    })
    .sort((a, b) => a.price - b.price);
  return { offers: offers.slice(0, 5), count: offers.length, maxCopies: card.maxCopies ?? null, name: card.name ?? null };
}

// The auctions of a card still running, the lowest bid first: the bid to beat (the highest bid, else the
// starting price), its end, its number, its seller and how many bids it has. The game's answer is read loosely (its
// fields may have other names): an auction whose card or bid can't be found is left out.
async function cardAuctions(id) {
  const body = await cached('auctions', 30e3, () => game('/auctions'));
  const list = Array.isArray(body) ? body : body?.auctions ?? body?.items ?? body?.data ?? [];
  const num = (...v) => v.find((x) => typeof x === 'number' && Number.isFinite(x)) ?? null;
  const time = (v) => (v == null ? null : typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v) || null);
  const now = Date.now();
  return list
    .filter((a) => (a?.card?.id ?? a?.cardId ?? a?.copy?.card?.id ?? a?.copy?.cardId) === id)
    .map((a) => {
      const top = a.highestBid ?? a.topBid ?? a.lastBid ?? null;
      const seller = a.seller ?? a.player ?? a.owner ?? null;
      return {
        id: a.id ?? null,
        bid: num(a.currentBid, a.currentPrice, typeof top === 'number' ? top : top?.amount, top?.price, a.bid, a.price, a.startingBid, a.startingPrice, a.startPrice, a.minBid),
        bids: num(a.bidCount, a.bidsCount, a._count?.bids, Array.isArray(a.bids) ? a.bids.length : null),
        endsAt: time(a.endsAt ?? a.endAt ?? a.endDate ?? a.expiresAt ?? a.closesAt),
        serial: a.serial ?? a.copy?.serial ?? null,
        player: seller ? { id: seller.id, name: seller.name } : null
      };
    })
    .filter((a) => a.bid != null && !(a.endsAt && a.endsAt <= now))
    .sort((a, b) => a.bid - b.bid || (a.endsAt ?? Infinity) - (b.endsAt ?? Infinity));
}

// A missing card of the collection, known by its id or else by its picture (image: its file name), found among the
// cards of its series or by its name: how many offers the market has of it.
async function cardSale(id, image, name, series) {
  const same = (c) => String(c.image ?? '').split(/[?#]/)[0].split('/').pop() === image;
  if (!id && image && series) id = (await seriesCards(series).catch(() => [])).find(same)?.id ?? null;
  if (!id && image && name && name.length >= 2) {
    const { cards } = await cached(`card-search:${fold(name)}`, 5 * 60e3, () => game(`/cards?q=${encodeURIComponent(name)}&limit=12`));
    id = (cards ?? []).find(same)?.id ?? null;
  }
  if (!id) return null;
  const r = await cardListings(id);
  return { id, name: r.name, count: r.count };
}

// Everyone Aquaman can see with a card: holders (limited cards), sellers, friends, and recent pulls.
async function cardOwners(id) {
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
  // A numbered copy has one owner: the one seen now (a friend's collection, an offer of the market) wins over the
  // relay's readings, which may be hours old (the copy changed hands since), and the most recent reading over the
  // older ones. A player left without any of their copies is not shown.
  const taken = new Set([...mates.flatMap((m) => m.serials), ...market.map((m) => m.serial)].filter((n) => n != null));
  const seen = [];
  for (const o of [...(known?.owners ?? [])].sort((a, b) => (b.seenAt ?? 0) - (a.seenAt ?? 0))) {
    if (!o.player?.id || mateIds.has(o.player.id)) continue;
    const serials = (o.serials ?? []).filter((n) => !taken.has(n));
    const count = (o.count ?? 1) - ((o.serials ?? []).length - serials.length);
    serials.forEach((n) => taken.add(n));
    if (count > 0) seen.push({ ...o, serials, count });
  }

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
async function knownPlayers(max = 120) {
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
async function ownersAmong(cardId, players) {
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
// revoked: the author took Aquaman back from this player; asked again at each start until given back.
async function sayHello(kind) {
  const id = await myId();
  const { helloAt = 0, helloKind, helloFor, helloShare, revokedFor } = await chrome.storage.local.get(['helloAt', 'helloKind', 'helloFor', 'helloShare', 'revokedFor']);
  const revoked = revokedFor === id;
  // The Perles of the player go with it when they share them (the leaderboard); a change of the setting is told at once.
  const share = (await getSettings()).sharePerles !== false;
  if (!revoked && Date.now() - helloAt < HELLO_EVERY && helloKind === kind && helloFor === id && helloShare === share) return { ok: true, skipped: true, revoked };
  let name = null;
  try {
    name = (await showcase(id)).player?.name ?? null;
  } catch {}
  let perles = null;
  if (share)
    try {
      perles = (await gameStatus()).perles;
    } catch {}
  const res = await fetch(`${RELAY}/hello`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ player: id, name, kind, version: chrome.runtime.getManifest().version, ...(share && perles == null ? {} : { perles }) })
  });
  if (!res.ok) return { ok: false, revoked };
  const now = !!(await res.json().catch(() => null))?.revoked;
  await chrome.storage.local.set({ helloAt: Date.now(), helloKind: kind, helloFor: id, helloShare: share });
  if (now) await chrome.storage.local.set({ revokedFor: id });
  else if (revoked) await chrome.storage.local.remove('revokedFor');
  return { ok: true, revoked: now };
}

// Whether the author took Aquaman back from this player, asked to the relay once a minute at most; when the relay
// doesn't answer, the last answer known.
async function access() {
  const id = await myId();
  return cached(`access:${id}`, 50e3, async () => {
    const { revokedFor } = await chrome.storage.local.get('revokedFor');
    try {
      const res = await fetch(`${RELAY}/access?player=${encodeURIComponent(id)}`);
      if (!res.ok) return { revoked: revokedFor === id };
      const revoked = !!(await res.json()).revoked;
      if (revoked) await chrome.storage.local.set({ revokedFor: id });
      else if (revokedFor === id) await chrome.storage.local.remove('revokedFor');
      return { revoked };
    } catch {
      return { revoked: revokedFor === id };
    }
  });
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
const aquamanUsers = () => asAuthor('GET', '/admin/users');


// ---------- messages from content.js ----------

// Answers the data messages of the page code (background.js in the extension, bridge.js in the userscript).
async function answer(msg) {
  try {
    switch (msg?.type) {
      case 'me-id':
        return { id: await myId() };
      case 'ownership':
        return await ownership();
      case 'shared-perles':
        return { perles: await sharedPerles(Array.isArray(msg.ids) ? msg.ids : []) };
      case 'global-players':
        return await globalPlayers();
      case 'searched-images':
        return { keys: await searchedImages() };
      case 'player-ownership':
        return await playerOwnership(msg);
      case 'card-images':
        return { keys: (await loadCatalog())?.map((c) => imageKey(c.image)).filter(Boolean) ?? null };
      case 'friends':
        return await friends();
      case 'player':
        return await playerSummary(msg.id);
      case 'boosters':
        return await boosterReport(msg.query, msg.rarity, msg.field);
      case 'access':
        return await access();
      case 'settings':
        return { groups: SETTINGS, values: await getSettings() };
      case 'set-settings':
        return { values: await setSettings(msg.patch ?? {}) };
      case 'pity-history':
        return await pityHistory();
      case 'pity':
        return await pity(!!msg.fresh);
      case 'opened':
        return await recordOpening(msg.boosters ?? [], msg.best ?? [], msg.packs ?? [], msg.ids ?? []);
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
        if (msg.fresh) forget(`listings:${msg.id}`, 'showcase:', 'auctions');
        return { ...(await cardListings(msg.id)), auctions: await cardAuctions(msg.id).catch(() => null) };
      case 'card-sale':
        return await cardSale(msg.id ?? null, msg.image ?? null, msg.name ?? null, msg.series ?? null);
      case 'card-rarity':
        return { rarity: (await cached(`rarity:${msg.id}`, 60 * 60e3, () => game(`/cards/${encodeURIComponent(msg.id)}`)))?.rarity ?? null };
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
      case 'admin-revoke-player':
        return await asAuthor('POST', '/admin/users/revoke', { id: msg.id, revoked: !!msg.revoked });
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
const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
};

// Stores { version, url, zip, xpi, script } when the latest GitHub release is newer than this version, else nothing.
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
      xpi: asset('aquaman-firefox.xpi'),
      // The text of the script, not GitHub's download: Tampermonkey and Userscripts only offer to install a script
      // shown as text, the release asset is saved as a file instead.
      script: rel.tag_name ? `https://raw.githubusercontent.com/${REPO}/${rel.tag_name}/aquaman.user.js` : asset('aquaman.user.js')
    };
    await chrome.storage.local.set({ update });
    return update;
  }
  await chrome.storage.local.remove('update');
  return null;
}

// ---------- 3. src/userscript/bridge.js : le travail du service de fond, dans la page ----------
// Userscript: the background worker's answers to the page code, done in the page.
// No badge, notifications or updater here: the script manager installs new versions; content.js offers them as soon as
// they are out.

const UPDATE_EVERY = 10 * 60e3;

// The latest GitHub release when it is newer than this script (looked for every 10 minutes at most, by any tab).
async function scriptUpdate() {
  const { updateCheckedAt = 0 } = await chrome.storage.local.get('updateCheckedAt');
  if (Date.now() - updateCheckedAt >= UPDATE_EVERY) {
    await chrome.storage.local.set({ updateCheckedAt: Date.now() });
    await checkUpdate().catch(() => null);
  }
  const { update } = await chrome.storage.local.get('update');
  return { update: update && newer(update.version, VERSION) ? update : null };
}

// Answers the messages of the page code.
async function handle(msg) {
  switch (msg?.type) {
    case 'status':
      return { ok: true };
    case 'check-update':
      return scriptUpdate();
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
// Runs in the page before it loads: tells content.js what the site's own requests change. It changes one answer
// only: the boosters waiting in /api-game/v1/me, limited to the kind chosen on the home page (see content.js).
//   { aquaman: 'status', pending, boosters }  boosters waiting, read from the site's /api-game/v1/me answers
//                                    (boosters: [{ id, kind, name, art }], kind and name null for a classic one)
//   { aquaman: 'opened', boosters }  boosters just opened, each as the rarities of its cards (for the pity counters)
//   { aquaman: 'feed', pulls }       the game's "beaux tirages", read from its /api-game/v1/feed answers
//   { aquaman: 'collection-stale' }  a booster was opened, or a trade, sale or purchase went through
//   { aquaman: 'sell-refused', item, message, ticked }  the game refused to put a copy on sale ({ cardId, copyId,
//                                    price }); ticked: the copies still ticked in its "Vendre mes doublons" window
(() => {
  if (window.__aquamanHook) return;
  window.__aquamanHook = true;

  const ME = /^\/api-game\/v1\/me$/;
  const FEED = /^\/api-game\/v1\/feed$/;
  const OPEN = /^\/api-game\/v1\/boosters\/([^/]+\/open|open-many|open)$/;
  const ORDERS = /^\/api-game\/v1\/market\/orders$/;
  const BUY = /^\/api-game\/v1\/shop\/booster$/;
  const PLAYER_PATH = /^\/api-game\/v1\/(?:public\/)?(?:players|users)\/([^/?]+)/;
  const MARKET_BUY = /^\/api-game\/v1\/market\/listings\/([^/]+)\/buy$/;
  // Changes of Perles or cards made outside the boosters (market, exchanges, auctions, copies sold or recycled): the
  // game's status and the card of the page are read again from the API afterwards. (Not the boosters: the game counts
  // their Perles and cards itself, and a status read again would redraw the pile in the middle of an opening.)
  const ASSETS = /^\/api-game\/v1\/(trades(\/.*)?|market\/.*|auctions(\/.*)?|copies(\/.*)?)$/;
  const MARKET_LIST = /^\/api-game\/v1\/market\/listings$/;
  // The card of each sale the market last showed (listing id -> { name, rarity }), for the card of a purchase.
  const listingCards = new Map();
  const WRITE = /^\/api-game\/v1\/(boosters\/[^/]+\/open|boosters\/open(-many)?|shop\/booster|trades(\/.*)?|market\/.*|auctions(\/.*)?|copies(\/.*)?)$/;
  const RARITIES = ['N', 'R', 'SR', 'SSR', 'UR', 'SEC'];
  const original = window.fetch;

  // The kind of boosters chosen on the home page ('classic' for the boosters without one), '' for all.
  const chosenKind = () => {
    try {
      return sessionStorage.getItem('aqm-booster-kind') || '';
    } catch {
      return '';
    }
  };

  const post = (data) => window.postMessage({ aquaman: data.type, ...data }, location.origin);

  // The page sent by the server is taken over by React piece by piece (hydration), the big ones (the album) sometimes
  // long after the page loaded, or at once when clicked. An element Aquaman adds in a piece not taken over yet doesn't
  // match what React expects (error #418) and may leave the page blank. React marks each element it took over
  // (__reactProps$…, seen only from the page): once every button and link of the page has its mark, data-aqm-hydrated
  // tells content.js it may change the page (after 15 s at most, for a page with buttons outside React).
  (function watchHydration() {
    const started = Date.now();
    const taken = (el) => Object.keys(el).some((k) => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'));
    const check = () => {
      // (the page's own content: the buttons of other scripts, outside <main>, are never taken over)
      const own = [...(document.querySelector('main') ?? document.body ?? document).querySelectorAll('button, a[href]')].filter((el) => !el.closest('[class*="aqm-"]'));
      if ((document.readyState === 'complete' && own.length && own.every(taken)) || Date.now() - started > 15e3)
        return void document.documentElement.setAttribute('data-aqm-hydrated', '');
      setTimeout(check, 150);
    };
    check();
  })();

  // The game's store of its status (/me: boosters, Perles…): its useGameStore hook (zustand), found among the site's
  // modules. Aquaman adds a module of its own to the site's Turbopack, which looks through the modules already loaded
  // (its context's c). Else, the state among the hooks of the game's components. Returns the state ({ load, … }).
  let storeHook = null;
  let storeState = null;
  async function gameStore() {
    if (storeHook) return storeHook.getState();
    if (storeState) return storeState;
    const T = globalThis.TURBOPACK;
    if (T && !Array.isArray(T) && typeof T.push === 'function') {
      const id = `aquaman-${Date.now()}`;
      try {
        // Two pushes: the module, then the order to run it (a chunk has one or the other).
        T.push([
          'aquaman-store.js',
          id,
          (ctx) => {
            for (const m of Object.values(ctx?.c ?? {}))
              try {
                const hook = m?.exports?.useGameStore;
                if (typeof hook?.getState === 'function' && typeof hook.getState()?.load === 'function') return void (storeHook = hook);
              } catch {}
          }
        ]);
        T.push(['aquaman-store-run.js', { otherChunks: [], runtimeModuleIds: [id] }]);
      } catch {}
      for (let i = 0; i < 10 && !storeHook; i++) await new Promise((r) => setTimeout(r, 20));
      if (storeHook) return storeHook.getState();
    }
    const el = document.querySelector('button, main, div');
    const key = el && Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    let fiber = key ? el[key] : null;
    while (fiber?.return) fiber = fiber.return;
    const isStore = (v) => v && typeof v === 'object' && typeof v.load === 'function' && typeof v.patch === 'function';
    const stack = fiber ? [fiber] : [];
    for (let n = 0; stack.length && n < 50000; n++) {
      const f = stack.pop();
      for (let hook = f.memoizedState, i = 0; hook && typeof hook === 'object' && 'next' in hook && i < 80; hook = hook.next, i++)
        for (const v of [hook.memoizedState, hook.queue?.lastRenderedState, Array.isArray(hook.memoizedState) ? hook.memoizedState[0] : null])
          if (isStore(v)) return (storeState = v);
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
    return null;
  }

  // All the waiting boosters, as the game's last /me gave them (before the filter). Also written on the page
  // (data-aqm-boosters), where content.js finds them as soon as it starts.
  let fullPending = null;
  let forcedPending = null; // the boosters made up for the author's scan, given to the game in its next /me
  function keepPending(pending) {
    fullPending = pending;
    try {
      document.documentElement.setAttribute('data-aqm-boosters', JSON.stringify(pending.map((b) => ({ id: b.id, kind: b.kindId ?? null, name: b.kindName ?? null, art: b.kindArt ?? null }))));
    } catch {}
  }

  // A card's page holds the card read from /cards/:id (with the player's copies) in a state of its components: the
  // card is read again from the API and given to that state, the page draws it at once. False if no such state.
  async function refreshCardState(id) {
    const res = await fetch(`/api-game/v1/cards/${encodeURIComponent(id)}`, { credentials: 'include', headers: { accept: 'application/json' } });
    if (!res.ok) return false;
    const fresh = await res.json().catch(() => null);
    if (!fresh || typeof fresh !== 'object') return false;
    const card = fresh.card ?? fresh;
    const start =
      [...document.querySelectorAll('main p, main span, main h2, main h3')].find((el) => /^mes exemplaires$/i.test(el.textContent.trim())) ??
      document.querySelector('main *');
    const key = start && Object.keys(start).find((k) => k.startsWith('__reactFiber$'));
    let done = false;
    for (let fiber = key ? start[key] : null; fiber; fiber = fiber.return) {
      for (let hook = typeof fiber.memoizedState === 'object' ? fiber.memoizedState : null; hook && 'next' in hook; hook = hook.next) {
        const s = hook.memoizedState;
        const dispatch = hook.queue?.dispatch;
        if (typeof dispatch !== 'function' || !s || typeof s !== 'object') continue;
        if (s.id === id && 'copies' in s) dispatch(card);
        else if (s.card?.id === id) dispatch({ ...s, ...(fresh.card ? fresh : { card }) });
        else continue;
        done = true;
      }
    }
    return done;
  }

  // After a change of Perles or cards, the game's status (/me: Perles…) and the card of the page are read again from
  // the API, once for a burst of changes.
  let assetsTimer = 0;
  function assetsChanged() {
    clearTimeout(assetsTimer);
    assetsTimer = setTimeout(() => {
      const cardId = location.pathname.match(/^\/jeu\/carte\/([^/?#]+)/)?.[1];
      window.postMessage({ aquamanCmd: 'reload-game', cardId: cardId ? decodeURIComponent(cardId) : undefined }, location.origin);
    }, 600);
  }

  // content.js asks the game to read its status again (its Perles after a purchase, its boosters…), and the card of
  // its page (cardId) after a purchase: straight from the API, the page isn't loaded again.
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.aquamanCmd !== 'reload-game') return;
    if (e.data.assets) return void assetsChanged(); // a change made by Aquaman itself, outside this page's fetch
    const { cardId, perles } = e.data;
    let fixed = false;
    if (typeof cardId === 'string')
      try {
        fixed = await refreshCardState(cardId);
      } catch {}
    if (!fixed)
      try {
        window.next?.router?.refresh?.(); // the page's own data (a card's copies…)
      } catch {}
    try {
      const store = await gameStore();
      if (typeof perles === 'number') store?.setPerles?.(perles); // the Perles the purchase answered, at once
      await store?.load().catch(() => {}); // then the game's status read again from /me
    } catch {}
  });

  // content.js sets the game on one kind ('' for all): the game's list of boosters is changed in its store at once
  // (patch, no request), else read again through the filter (load). Answers once it is done, or at once when the
  // store can't be found.
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.aquamanCmd !== 'refresh-boosters') return;
    let ok = false;
    try {
      const s = await gameStore();
      const kind = e.data.kind ?? '';
      const given = Array.isArray(e.data.items) ? e.data.items : null; // the author's scan: boosters made up by kind
      if (s && (given || e.data.fresh || e.data.reload || !fullPending || typeof s.patch !== 'function')) {
        // The game draws its pile afresh only when it reads its boosters itself (load: it goes through its loading
        // state, the pile comes back with the right picture). Its answer goes through the filter of the kind, or
        // carries the made-up boosters of the scan.
        // The scan gives the ids of the player's own boosters: the game gets them whole, as its server sent them (a
        // booster with an id it doesn't know is drawn with the classic picture).
        forcedPending = given && given.map((b) => fullPending?.find((x) => x?.id === b.id)).filter(Boolean);
        if (given && !forcedPending.length) forcedPending = null;
        try {
          await s.load().catch(() => {});
        } finally {
          forcedPending = null;
        }
        ok = true;
      } else if (s) {
        // Back to all the boosters while the game's pile is hidden: at once, without a request.
        s.patch(() => ({ pending: kind ? fullPending.filter((b) => (b?.kindId ?? 'classic') === kind) : fullPending }));
        ok = true;
      }
    } catch {}
    post({ type: 'boosters-refreshed', ok, id: e.data.id ?? null });
  });

  // Path of a same-origin request, or null.
  function pathOf(input) {
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      return url.origin === location.origin ? url.pathname : null;
    } catch {
      return null;
    }
  }

  // A copy in the props of the site's components ({ cardId, copyId, name, serial }), looked for a few levels deep:
  // { copyId } or a { id, serial }, its card beside it or around it (card: the card met on the way). Lists are left
  // out: their first copy would be every row's.
  function findCopy(v, depth, card = null) {
    if (!v || typeof v !== 'object' || Array.isArray(v) || depth > 4 || v instanceof Node || v.$$typeof) return null;
    const own = v.card && typeof v.card === 'object' && !Array.isArray(v.card) ? v.card : null;
    const near = own ?? card;
    const copyId = typeof v.copyId === 'string' ? v.copyId : typeof v.id === 'string' && 'serial' in v && v.id !== near?.id && !v.rarity ? v.id : null;
    const cardId = v.cardId ?? near?.id;
    if (copyId && typeof cardId === 'string') return { cardId, copyId, name: near?.name ?? v.name ?? null, serial: v.serial ?? null };
    for (const k in v) {
      if (k === 'children' || k.startsWith('_') || typeof v[k] !== 'object') continue;
      const found = findCopy(v[k], depth + 1, near);
      if (found) return found;
    }
    return null;
  }

  // The copy shown by an element: read in the props of the components around it.
  function copyOf(el) {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    let fiber = key ? el[key] : null;
    for (let i = 0; fiber && i < 20; i++, fiber = fiber.return) {
      const found = findCopy(fiber.memoizedProps, 0);
      if (found) return found;
    }
    return null;
  }

  // The copies met in the site's answers (copy id -> { cardId, copyId, name, serial }), and the names of the cards:
  // the rows of the "Vendre mes doublons" window are found there by their name and number.
  const seenCopies = new Map();
  const cardNames = new Map();

  function learnCopies(body) {
    let left = 300000;
    const walk = (v, card) => {
      if (!v || typeof v !== 'object' || --left < 0) return;
      if (Array.isArray(v)) {
        for (const x of v) walk(x, card);
        return;
      }
      const isCard = typeof v.rarity === 'string' && typeof v.name === 'string' && typeof v.id === 'string';
      if (isCard) cardNames.set(v.id, v.name);
      const own = v.card && typeof v.card === 'object' && !Array.isArray(v.card) ? v.card : null;
      const near = own ?? (isCard ? v : card);
      const copyId = typeof v.copyId === 'string' ? v.copyId : !isCard && typeof v.id === 'string' && typeof v.serial === 'number' ? v.id : null;
      const cardId = typeof v.cardId === 'string' ? v.cardId : near?.id;
      if (copyId && typeof cardId === 'string') seenCopies.set(copyId, { cardId, copyId, name: near?.name ?? null, serial: typeof v.serial === 'number' ? v.serial : null });
      for (const k in v) if (v[k] && typeof v[k] === 'object') walk(v[k], near);
    };
    walk(body, null);
  }

  // The copy of a row: its number (#518) and the longest card name found in its text.
  function copyOfRow(row, taken) {
    const text = row.textContent;
    const serial = Number(text.match(/#\s?(\d+)/)?.[1]);
    let best = null;
    for (const c of seenCopies.values()) {
      const name = c.name ?? cardNames.get(c.cardId);
      if (c.serial !== serial || !name || !text.includes(name) || taken.has(c.copyId)) continue;
      if (!best || name.length > best.name.length) best = { ...c, name };
    }
    return best;
  }

  // The copies still ticked in the "Vendre mes doublons" window, in its order, each with the price of its row (the
  // price typed, else its "Valeur ≈").
  function tickedCopies() {
    try {
      const buttons = [...document.querySelectorAll('button')].filter((b) => !b.closest('.aqm-root'));
      const bar = buttons.find((b) => /^tout (d[ée])?cocher/i.test(b.textContent.trim()));
      if (!bar) return [];
      const allTicked = /^tout d[ée]cocher/i.test(bar.textContent.trim());
      const out = [];
      const taken = new Set();
      for (const sell of buttons) {
        if (sell.textContent.trim() !== 'Vendre') continue;
        let row = sell;
        while (row.parentElement && !(row.querySelector('img') && /#\s?\d+/.test(row.textContent))) row = row.parentElement;
        const ticked = allTicked || !!row.querySelector('input[type="checkbox"]:checked, [role="checkbox"][aria-checked="true"], [data-state="checked"]');
        const copy = ticked ? copyOfRow(row, taken) ?? copyOf(sell) : null;
        if (!copy || taken.has(copy.copyId)) continue;
        taken.add(copy.copyId);
        const typed = Math.round(Number(row.querySelector('input:not([type="checkbox"])')?.value));
        const price = typed > 0 ? typed : Math.round(Number(row.textContent.match(/valeur\s*≈?\s*([\d\s  ]+)/i)?.[1]?.replace(/\s/g, '')));
        if (price > 0) out.push({ ...copy, price });
      }
      return out;
    } catch {
      return [];
    }
  }

  // Rarities of the cards of one booster's answer ({ pulls: [{ card: { rarity } }] }).
  const raritiesOf = (pulls) => pulls.map((p) => p?.card?.rarity ?? p?.rarity).filter((r) => RARITIES.includes(r));

  // The boosters of an opening answer: one booster, or several (open-many), each as the pulls of its cards.
  function openedBoosters(body) {
    if (Array.isArray(body?.pulls)) return [body];
    const list = body?.boosters ?? body?.results ?? body?.opened ?? (Array.isArray(body) ? body : null);
    return Array.isArray(list) ? list.filter((b) => Array.isArray(b?.pulls)) : [];
  }
  // The kind of each booster of an opening ({ id, name }, null when unknown): from the answer, else from the booster's
  // id (in the path or the body of the request) among the waiting ones, else the kind Aquaman shows the game, else
  // the only kind waiting.
  // The game's id of each booster of an opening (null when unknown): from the answer, else from the request (its path
  // or its body). Aquaman records each booster under it, so that a booster told twice is counted once.
  function askedIds(path, init) {
    let asked = [];
    try {
      const sent = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      asked = [sent?.ids, sent?.boosterIds, sent?.boosters].find(Array.isArray) ?? (sent?.boosterId ? [sent.boosterId] : []);
    } catch {}
    const inPath = path.match(/\/boosters\/([^/]+)\/open$/)?.[1];
    if (inPath) asked = [decodeURIComponent(inPath)];
    return asked.map((x) => x?.id ?? x);
  }
  function boosterIdsOf(boosters, path, init) {
    const asked = askedIds(path, init);
    return boosters.map((b, i) => {
      const id = b?.boosterId ?? b?.booster?.id ?? (asked.length === boosters.length ? asked[i] : null);
      return typeof id === 'string' && /^[A-Za-z0-9_.:-]{1,60}$/.test(id) ? id : null;
    });
  }

  function packsOf(boosters, path, init, waiting) {
    const list = Array.isArray(waiting) ? waiting : [];
    const named = (id, name) => ({ id: id ?? 'classic', name: name ?? list.find((b) => (b?.kindId ?? 'classic') === (id ?? 'classic'))?.kindName ?? (id && id !== 'classic' ? null : 'Classique') });
    const asked = askedIds(path, init);
    const shown = chosenKind();
    const kinds = new Set(list.map((b) => b?.kindId ?? 'classic'));
    return boosters.map((b, i) => {
      const kindId = b?.kindId ?? b?.booster?.kindId;
      if (kindId) return named(kindId, b?.kindName ?? b?.booster?.kindName);
      const id = b?.boosterId ?? b?.booster?.id ?? (asked.length === boosters.length ? asked[i] : null) ?? b?.id;
      const known = id != null && list.find((x) => x?.id === id);
      if (known) return named(known.kindId, known.kindName);
      if (shown) return named(shown);
      return kinds.size === 1 ? named([...kinds][0]) : null;
    });
  }
  // The best card of a booster ({ id, name, image, rarity }), for the history of the pity.
  function bestCard(pulls) {
    let best = null;
    for (const p of pulls) {
      const card = p?.card ?? p;
      const rarity = card?.rarity ?? p?.rarity;
      if (RARITIES.includes(rarity) && (!best || RARITIES.indexOf(rarity) > RARITIES.indexOf(best.rarity)))
        best = { id: card.id ?? null, name: card.name ?? null, image: card.image ?? null, rarity };
    }
    return best;
  }

  // ---------- the picture of a themed kind in the 3D pack of the opening ----------
  // The game draws the pack of its opening window in 3D (three.js) with the classic picture (classique.webp) when it
  // opens several boosters, whatever their kind. While Aquaman opens a themed kind (content.js writes its picture in
  // data-aqm-opening-art), that picture takes the classic one's place each time the game draws it or sends it to the
  // 3D: the same size (720 × 1080), nothing else changes. The classic picture the game keeps is never changed itself,
  // so each opening gets the picture of its own kind.
  const CLASSIC_ART = /\/game\/boosters\/classique\.(webp|png|jpe?g)/i;
  const openingArt = () => document.documentElement.getAttribute('data-aqm-opening-art') || '';
  const isClassicUrl = (url) => {
    try {
      return CLASSIC_ART.test(decodeURIComponent(String(url ?? '')));
    } catch {
      return CLASSIC_ART.test(String(url ?? ''));
    }
  };
  const bitmap = globalThis.createImageBitmap;
  const classicBlobs = new WeakSet(); // the classic picture fetched by the game
  const classicBitmaps = new WeakSet(); // and made into bitmaps
  const arts = new Map(); // picture -> { img, bitmap }, loaded once
  const artOf = (url) => {
    if (!arts.has(url)) {
      const art = { img: new Image(), bitmap: null };
      art.img.decoding = 'async';
      art.img.addEventListener('load', () => bitmap?.call(globalThis, art.img).then((b) => (art.bitmap = b)).catch(() => {}), { once: true });
      art.img.src = url;
      arts.set(url, art);
    }
    return arts.get(url);
  };
  new MutationObserver(() => openingArt() && artOf(openingArt())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-aqm-opening-art'] });
  // The themed picture to use in place of a classic one (as an image or a bitmap, like the source), once loaded.
  const swapFor = (source) => {
    const url = openingArt();
    if (!url || !source) return null;
    if (source instanceof HTMLImageElement) {
      if (!isClassicUrl(source.currentSrc || source.src)) return null;
      const { img } = artOf(url);
      return img.complete && img.naturalWidth ? img : null;
    }
    if (globalThis.ImageBitmap && source instanceof ImageBitmap && classicBitmaps.has(source)) return artOf(url).bitmap;
    return null;
  };
  const blob = Response.prototype.blob;
  Response.prototype.blob = function () {
    const out = blob.call(this);
    if (isClassicUrl(this.url)) out.then((b) => classicBlobs.add(b)).catch(() => {});
    return out;
  };
  if (bitmap)
    globalThis.createImageBitmap = function (source, ...rest) {
      const out = bitmap.call(this, source, ...rest);
      const classic = (source instanceof HTMLImageElement && isClassicUrl(source.currentSrc || source.src)) || (source instanceof Blob && classicBlobs.has(source));
      if (classic) out.then((b) => classicBitmaps.add(b)).catch(() => {});
      return out;
    };
  for (const proto of [CanvasRenderingContext2D.prototype, globalThis.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean)) {
    const draw = proto.drawImage;
    proto.drawImage = function (source, ...rest) {
      return draw.call(this, swapFor(source) ?? source, ...rest);
    };
  }
  for (const proto of [globalThis.WebGLRenderingContext?.prototype, globalThis.WebGL2RenderingContext?.prototype].filter(Boolean))
    for (const name of ['texImage2D', 'texSubImage2D']) {
      const upload = proto[name];
      proto[name] = function (...args) {
        for (let i = 0; i < args.length; i++) {
          const swap = swapFor(args[i]);
          if (swap) args[i] = swap;
        }
        return upload.apply(this, args);
      };
    }

  // Only the requests to the game's API are looked at; the others (analytics, images…) go straight through.
  window.fetch = function (input, init) {
    const path = pathOf(input);
    if (!path?.startsWith('/api-game/')) return original.apply(this, arguments);
    return watch(original.apply(this, arguments), path, input, init);
  };

  async function watch(pending, path, input, init) {
    const self = !!window.__aquamanSelf; // a request of Aquaman itself (userscript)
    const waiting = fullPending; // the boosters waiting when the request left (an opening: those it opens)
    const res = await pending;
    try {
      const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      // The game sees only the waiting boosters of the chosen kind (all of them when none is left).
      const kind = chosenKind();
      if (forcedPending && res.ok && method === 'GET' && ME.test(path)) {
        const me = await res.clone().json().catch(() => null);
        if (me && typeof me === 'object') {
          if (Array.isArray(me.pending)) keepPending(me.pending);
          return new Response(JSON.stringify({ ...me, pending: forcedPending }), { status: res.status, statusText: res.statusText, headers: res.headers });
        }
      }
      if (kind && !self && res.ok && method === 'GET' && ME.test(path)) {
        const me = await res.clone().json().catch(() => null);
        if (Array.isArray(me?.pending)) {
          keepPending(me.pending);
          const kept = me.pending.filter((b) => (b?.kindId ?? 'classic') === kind);
          if (kept.length) {
            post({ type: 'status', pending: me.pending.length, boosters: me.pending.map((b) => ({ id: b.id, kind: b.kindId ?? null, name: b.kindName ?? null, art: b.kindArt ?? null })) });
            return new Response(JSON.stringify({ ...me, pending: kept }), { status: res.status, statusText: res.statusText, headers: res.headers });
          }
        }
      }
      if (path && !res.ok && method === 'POST' && ORDERS.test(path) && res.status !== 429) {
        const order = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        if (order?.side === 'sell' && order.copyId)
          res
            .clone()
            .json()
            .catch(() => null)
            .then((body) =>
              post({
                type: 'sell-refused',
                item: { cardId: order.cardId, copyId: order.copyId, price: order.price },
                message: body?.error?.message || `Erreur ${res.status}`,
                ticked: tickedCopies()
              })
            );
      }
      if (path && res.ok && method === 'GET' && !FEED.test(path))
        res
          .clone()
          .json()
          .then(learnCopies)
          .catch(() => {});
      // A player whose cards the game reads (the partner of an exchange…): their id with their name, for the filter
      // "Il lui manque" of the exchanges.
      const player = path && res.ok && method === 'GET' ? path.match(PLAYER_PATH)?.[1] : null;
      if (player)
        res
          .clone()
          .json()
          .then((body) => post({ type: 'player-seen', id: decodeURIComponent(player), name: body?.player?.name ?? body?.user?.name ?? body?.name ?? null }))
          .catch(() => {});
      if (path && res.ok) {
        if (method === 'GET' && ME.test(path)) {
          res
            .clone()
            .json()
            .then(
              (me) =>
                Array.isArray(me?.pending) &&
                (keepPending(me.pending), true) &&
                post({
                  type: 'status',
                  pending: me.pending.length,
                  boosters: me.pending.map((b) => ({ id: b.id, kind: b.kindId ?? null, name: b.kindName ?? null, art: b.kindArt ?? null }))
                })
            )
            .catch(() => {});
        } else if (method === 'GET' && MARKET_LIST.test(path)) {
          res
            .clone()
            .json()
            .then((body) => {
              for (const l of Array.isArray(body?.listings) ? body.listings : []) if (l?.id && l.card?.name) listingCards.set(String(l.id), { name: l.card.name, rarity: l.card.rarity ?? null });
            })
            .catch(() => {});
        } else if (method === 'GET' && FEED.test(path)) {
          res
            .clone()
            .json()
            .then((body) => Array.isArray(body?.pulls) && post({ type: 'feed', pulls: body.pulls }))
            .catch(() => {});
        } else if (method !== 'GET' && WRITE.test(path)) {
          // A card bought on the market: its other sales are hidden (content.js), the player has it now.
          const bought = path.match(MARKET_BUY)?.[1];
          const card = bought && listingCards.get(decodeURIComponent(bought));
          if (card) post({ type: 'market-bought', name: card.name, rarity: card.rarity });
          // A booster bought in the shop: the game adds it to its boosters without reading /me again, Aquaman too.
          if (BUY.test(path) && fullPending)
            res
              .clone()
              .json()
              .then((body) => {
                const b = body?.booster;
                if (!b?.id || fullPending.some((x) => x?.id === b.id)) return;
                keepPending([...fullPending, b]);
                post({ type: 'status', pending: fullPending.length, boosters: fullPending.map((x) => ({ id: x.id, kind: x.kindId ?? null, name: x.kindName ?? null, art: x.kindArt ?? null })) });
              })
              .catch(() => {});
          // The boosters Aquaman opens itself (window.__aquamanSelf, in the userscript) are counted by Aquaman.
          if (OPEN.test(path) && !window.__aquamanSelf)
            res
              .clone()
              .json()
              .then((body) => {
                const all = openedBoosters(body);
                const packs = packsOf(all, path, init, waiting);
                const ids = boosterIdsOf(all, path, init);
                const opened = all.map((b, i) => ({ pulls: b.pulls, pack: packs[i], id: ids[i] })).filter((b) => raritiesOf(b.pulls).length);
                if (opened.length)
                  post({
                    type: 'opened',
                    boosters: opened.map((b) => raritiesOf(b.pulls)),
                    best: opened.map((b) => bestCard(b.pulls)),
                    packs: opened.map((b) => b.pack),
                    ids: opened.map((b) => b.id)
                  });
              })
              .catch(() => {});
          if (ASSETS.test(path) && res.ok) assetsChanged();
          post({ type: 'collection-stale' });
        }
      }
    } catch {}
    return res;
  }
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

/* ---------- Page d'une carte : « Qui a cette carte ? » ---------- */

.aqm-card-who {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.aqm-card-who-icon,
.aqm-card-who-icon svg {
  display: inline-block;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.aqm-card-who-row {
  margin-top: 12px;
}

/* ---------- Échanges ---------- */

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

/* The collection's cards of the window are drawn only near the screen. */
[data-aqm-lite] > * {
  content-visibility: auto;
  contain-intrinsic-size: auto var(--aqm-cell-w, 120px) auto var(--aqm-cell-h, 200px);
}

/* ---------- New version of the script ---------- */

.aqm-update .aqm-queue-head strong {
  color: #93c5fd;
}
.aqm-update-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.aqm-update-actions .aqm-queue-btn {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}
.aqm-update-actions .is-main {
  border-color: #2563eb;
  background: #2563eb;
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
.aqm-pity-line.is-sec {
  grid-column: 1 / -1;
  padding-top: 10px;
  border-top: 1px solid var(--aqm-line);
}
.aqm-pity-note {
  margin: 10px 0 0;
  font-size: 11px;
  text-align: center;
  color: var(--aqm-dim);
}
.aqm-pity-more {
  display: flex;
  justify-content: center;
  margin-top: 10px;
}

/* Historique des tirages (window of the pity's "Historique"): the tracker, the last boosters, the cards got */
.aqm-history {
  display: grid;
  gap: 14px;
}
.aqm-history-count {
  margin: 0;
  font-size: 12px;
  color: var(--aqm-dim);
}
.aqm-rates {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.aqm-rate {
  --aqm-rate: 148, 163, 184;
  position: relative;
  padding: 14px 16px;
  border: 1px solid rgba(var(--aqm-rate), 0.22);
  border-radius: 18px;
  background: radial-gradient(120% 90% at 0% 0%, rgba(var(--aqm-rate), 0.14), transparent 60%), var(--aqm-card);
  overflow: hidden;
}
.aqm-rate.is-SSR {
  --aqm-rate: 253, 224, 71;
}
.aqm-rate.is-UR {
  --aqm-rate: 244, 114, 182;
}
.aqm-rate.is-SEC {
  --aqm-rate: 196, 181, 253;
}
.aqm-rate-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 15px;
  font-weight: 900;
  font-style: italic;
}
.aqm-rate-value {
  margin: 10px 0 0;
  font-size: 26px;
  font-weight: 900;
  line-height: 1;
}
.aqm-rate-value small {
  font-size: 13px;
  font-weight: 700;
  color: var(--aqm-dim);
}
.aqm-rate-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--aqm-dim);
}
.aqm-rate-foot {
  margin: 12px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--aqm-line);
  font-size: 11px;
  color: var(--aqm-dim);
}
.aqm-luck {
  font-size: 10px;
  font-style: normal;
}
.aqm-luck.is-good {
  background: rgba(34, 197, 94, 0.18);
  color: #86efac;
}
.aqm-luck.is-bad {
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
}
.aqm-history-box {
  padding: 14px 16px;
  border: 1px solid var(--aqm-line);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.02);
}
.aqm-history-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.aqm-history-row .aqm-label {
  margin: 0;
}
.aqm-tracker-strip {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8px, 1fr));
  gap: 3px;
}
.aqm-cell {
  display: inline-block;
  height: 16px;
  min-width: 8px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.07);
  vertical-align: middle;
}
.aqm-cell.is-SSR {
  background: #fde047;
  box-shadow: 0 0 8px rgba(253, 224, 71, 0.45);
}
.aqm-cell.is-UR {
  background: #f472b6;
  box-shadow: 0 0 8px rgba(244, 114, 182, 0.55);
}
.aqm-cell.is-SEC {
  background: linear-gradient(180deg, #c4b5fd, #67e8f9);
  box-shadow: 0 0 10px rgba(196, 181, 253, 0.9);
}
.aqm-tracker-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin: 10px 0 0;
  font-size: 11px;
  color: var(--aqm-dim);
}
.aqm-tracker-legend > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.aqm-tracker-legend .aqm-cell {
  width: 8px;
  height: 12px;
}
.aqm-history-tabs {
  display: flex;
  gap: 4px;
  width: fit-content;
  padding: 4px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
}
.aqm-history-tabbtn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--aqm-dim);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.aqm-history-tabbtn.is-on {
  background: rgba(255, 255, 255, 0.1);
  color: var(--aqm-text);
}
.aqm-history-tabcount {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 11px;
  text-align: center;
}
.aqm-history-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin: 14px 0;
}
.aqm-history-stat {
  padding: 8px 10px;
  border-radius: 12px;
  background: var(--aqm-card);
}
.aqm-history-stat small {
  display: block;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--aqm-dim);
}
.aqm-history-stat strong {
  display: block;
  margin-top: 3px;
  font-size: 14px;
}
.aqm-history-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: 12px;
  max-height: 440px;
  padding: 2px 6px 2px 2px;
  overflow-y: auto;
}
/* A card got: its picture alone, sharp (no frame, no movement), and the boosters it took under it. */
.aqm-history-tile {
  display: block;
  color: inherit;
  text-decoration: none;
}
.aqm-history-tile > img,
.aqm-history-blank {
  display: block;
  width: 100%;
  aspect-ratio: 5 / 7;
  border-radius: 10px;
  object-fit: cover;
}
.aqm-history-tile:hover > img {
  filter: brightness(1.12);
}
.aqm-history-blank {
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.05);
  font-size: 22px;
  font-weight: 900;
  font-style: italic;
}
.aqm-history-after {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 900;
  text-align: center;
}
.aqm-history-pack {
  margin: 2px 0 0;
  overflow: hidden;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--aqm-dim);
}
.aqm-history-pack.is-unknown {
  opacity: 0.6;
}
/* The filter per pack, above the tabs of the rarities. */
.aqm-history-packs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.aqm-history-packbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: transparent;
  color: var(--aqm-dim);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.aqm-history-packbtn.is-on {
  border-color: transparent;
  background: rgba(255, 255, 255, 0.1);
  color: var(--aqm-text);
}
.aqm-history-empty {
  margin: 14px 0 0;
  font-size: 13px;
  color: var(--aqm-dim);
}
@media (max-width: 640px) {
  .aqm-rates {
    grid-template-columns: 1fr;
  }
  .aqm-history-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .aqm-history-grid {
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  }
}

/* Scroll bars of Aquaman's windows and lists: thin, dark, rounded. */
.aqm-root,
.aqm-root * {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
}
.aqm-root::-webkit-scrollbar,
.aqm-root *::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.aqm-root::-webkit-scrollbar-track,
.aqm-root *::-webkit-scrollbar-track {
  background: transparent;
}
.aqm-root::-webkit-scrollbar-thumb,
.aqm-root *::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18) padding-box;
}
.aqm-root::-webkit-scrollbar-thumb:hover,
.aqm-root *::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.32) padding-box;
}
.aqm-root::-webkit-scrollbar-button,
.aqm-root *::-webkit-scrollbar-button {
  display: none;
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
/* The window of cards after a "Tout ouvrir": the seconds before it closes (on the next ones, or alone). */
.aqm-open-count {
  margin-left: 2px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(96, 165, 250, 0.25);
  font-variant-numeric: tabular-nums;
}
.aqm-open-note {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
}
/* The suggestions of the search field: the picture of a card, the name, the rarities. */
.aqm-suggest-box {
  position: relative;
  width: min(520px, 100%);
}
.aqm-suggest-box .aqm-search {
  width: 100%;
}
.aqm-suggest {
  position: absolute;
  z-index: 5;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 360px;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--aqm-line);
  border-radius: 14px;
  background: var(--aqm-panel);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
}
.aqm-suggest[hidden] {
  display: none;
}
.aqm-suggest-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 10px 6px 6px;
  border-radius: 10px;
  cursor: pointer;
}
.aqm-suggest-item:hover,
.aqm-suggest-item[aria-selected='true'] {
  background: rgba(255, 255, 255, 0.07);
}
.aqm-suggest-item > img,
.aqm-suggest-blank {
  flex-shrink: 0;
  width: 34px;
  height: 48px;
  border-radius: 5px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.05);
}
.aqm-suggest-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aqm-suggest-name small {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--aqm-dim);
}
.aqm-suggest-rarities {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
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
.aqm-switch.is-off {
  opacity: 0.5;
  cursor: default;
}

/* Réglages: a card per group, each setting with its title, its hint and a switch on the right. */
.aqm-settings-groups {
  columns: 2 340px;
  column-gap: 14px;
}
.aqm-settings-group {
  break-inside: avoid;
  margin: 0 0 14px;
  padding: 6px 0;
  border: 1px solid var(--aqm-line);
  border-radius: 18px;
  background: var(--aqm-card);
}
.aqm-settings-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 16px 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #93c5fd;
}
.aqm-settings-title span {
  font-size: 15px;
  letter-spacing: 0;
}
.aqm-setting {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  cursor: pointer;
}
.aqm-setting + .aqm-setting {
  border-top: 1px solid var(--aqm-line);
}
.aqm-setting:hover {
  background: rgba(255, 255, 255, 0.025);
}
.aqm-setting.is-off {
  cursor: default;
  opacity: 0.45;
}
.aqm-setting-text {
  display: grid;
  flex: 1;
  gap: 2px;
  min-width: 0;
}
.aqm-setting-text strong {
  font-size: 14px;
  color: var(--aqm-text);
}
.aqm-setting-text small {
  font-size: 12px;
  line-height: 1.35;
  color: var(--aqm-dim);
}
.aqm-toggle {
  position: relative;
  flex: none;
  width: 40px;
  height: 24px;
  margin: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  transition: background 0.2s;
}
.aqm-toggle::before {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.aqm-toggle:checked {
  background: #2563eb;
}
.aqm-toggle:checked::before {
  transform: translateX(16px);
}
.aqm-toggle:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}
.aqm-toggle:disabled {
  cursor: default;
}
.aqm-settings-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
}
.aqm-settings-foot p {
  margin: 0;
  font-size: 12px;
  color: var(--aqm-dim);
}
.aqm-settings-actions {
  display: flex;
  gap: 8px;
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
.aqm-pull-player {
  display: flex;
  align-items: center;
  gap: 8px;
}
.aqm-pull-player .aqm-avatar-sm {
  width: 24px;
  height: 24px;
  border-radius: 7px;
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
.aqm-fav-head .aqm-fav-unstar {
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

/* ---------- Collection : album de la série ---------- */

.aqm-album {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  margin-top: 12px;
}
.aqm-album-btn {
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--aqm-line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: #e4e4e7;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.aqm-album-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.aqm-album-btn.is-on {
  border-color: rgba(250, 204, 21, 0.45);
  color: #fde047;
}
.aqm-album-btn.is-main {
  border-color: transparent;
  background: #2563eb;
  color: #fff;
}
.aqm-album-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.aqm-album-note {
  font-size: 12px;
  color: var(--aqm-muted);
}

/* ---------- Qui a cette carte ? ---------- */

.aqm-who-gap {
  margin-top: 18px;
}
.aqm-who-note {
  margin: 0 0 6px;
}
.aqm-who-cards .aqm-mini {
  cursor: pointer;
}
.aqm-who-cards .aqm-mini:hover,
.aqm-who-cards .aqm-mini:focus-visible {
  background: rgba(96, 165, 250, 0.14);
  outline: none;
}
.aqm-who-back {
  margin-bottom: 12px;
  text-transform: none;
  letter-spacing: 0;
}
.aqm-who-card {
  display: flex;
  gap: 16px;
  padding: 14px;
  border-radius: 18px;
  background: var(--aqm-card);
}
.aqm-who-card img {
  width: 92px;
  border-radius: 10px;
  aspect-ratio: 63 / 88;
  object-fit: cover;
}
.aqm-who-card > div {
  flex: 1;
  min-width: 0;
}
.aqm-who-card p {
  margin: 0 0 2px;
}
.aqm-pack-title {
  font-size: 17px;
  font-weight: 900;
  color: #fff;
}
.aqm-who-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.aqm-metric {
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}
.aqm-metric small {
  display: block;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--aqm-dim);
}
.aqm-metric strong {
  display: block;
  margin-top: 2px;
  font-size: 15px;
  font-weight: 800;
  color: #fff;
}
.aqm-owners {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.aqm-owner {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 6px 12px;
  border-radius: 12px;
  background: var(--aqm-card);
  font-size: 13px;
}
.aqm-avatar-sm {
  width: 30px;
  height: 30px;
  border-radius: 9px;
}
.aqm-owner .aqm-avatar-sm + a,
.aqm-owner .aqm-avatar-sm + span {
  min-width: 0;
}
.aqm-owner-serial {
  min-width: 52px;
  font-weight: 800;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.aqm-owner a {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #e4e4e7;
  font-weight: 700;
  text-decoration: none;
}
.aqm-owner a:hover {
  color: #fff;
  text-decoration: underline;
}
.aqm-owner-right {
  margin-left: auto;
  font-weight: 700;
  color: var(--aqm-muted);
  white-space: nowrap;
}
@media (max-width: 640px) {
  .aqm-who-card img {
    width: 72px;
  }
  .aqm-who-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* ---------- File de recherche ---------- */

.aqm-dock,
.aqm-update {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147482500;
  width: min(360px, calc(100vw - 32px));
}
.aqm-dock {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.aqm-queue,
.aqm-update {
  padding: 12px 14px;
  border: 1px solid rgba(96, 165, 250, 0.35);
  border-radius: 16px;
  background: var(--aqm-panel);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
  color: var(--aqm-text);
  font-size: 13px;
  animation: aqm-pop 0.16s ease-out;
}
.aqm-queue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.aqm-queue-head strong {
  font-size: 13px;
  font-weight: 800;
}
.aqm-queue-btn {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--aqm-line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.aqm-queue .aqm-bar {
  margin-top: 8px;
}
.aqm-album .aqm-fav-wait {
  flex-basis: 100%;
  width: 100%;
  margin: 4px 0 0;
}
.aqm-fav-wait {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid rgba(217, 119, 6, 0.4);
  border-radius: 12px;
}
.aqm-fav-wait .aqm-queue-head + .aqm-bar,
.aqm-fav-wait p + .aqm-queue-head {
  margin-top: 12px;
}
.aqm-fav-wait .aqm-queue-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--aqm-muted);
}
.aqm-steps {
  display: flex;
  height: 8px;
  margin-top: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}
.aqm-steps > span {
  transition: width 0.4s ease;
}
.aqm-steps .is-in,
.aqm-steps-legend .is-in::before {
  background: #22c55e;
}
.aqm-steps .is-sending,
.aqm-steps-legend .is-sending::before {
  background: #3b82f6;
}
.aqm-steps .is-waiting,
.aqm-steps-legend .is-waiting::before {
  background: #d97706;
}
.aqm-steps-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 8px;
  font-size: 12px;
}
.aqm-steps-legend span::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;
}
.aqm-fav-wait .aqm-bar {
  margin-top: 8px;
}
.aqm-fav-wait p {
  margin: 8px 0 0;
  font-size: 12px;
}
.aqm-want.is-wait {
  background: rgba(217, 119, 6, 0.85);
}
.aqm-queue p,
.aqm-update p {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--aqm-muted);
}
@media (max-width: 640px) {
  .aqm-dock,
  .aqm-update {
    right: 8px;
    left: 8px;
    bottom: 96px;
    width: auto;
  }
}

.aqm-fav-details {
  text-transform: none;
  letter-spacing: 0;
  font-size: 12px;
}
.aqm-fav-list {
  gap: 10px;
}
.aqm-fav-series .aqm-fav-cards {
  margin-top: 14px;
}

/* ---------- Vendre mes doublons ---------- */

.aqm-sales {
  border-color: rgba(34, 197, 94, 0.35);
}
.aqm-sell-wait {
  flex: none;
  align-self: stretch;
  margin: 0 0 12px;
  color: var(--aqm-text);
  font-size: 12px;
  line-height: 1.45;
}
.aqm-sell-wait > p:first-child {
  margin: 0;
}
.aqm-sell-waiting {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 2px 16px;
  max-height: 140px;
  margin: 8px 0 0;
  padding: 0 6px 0 0;
  overflow-y: auto;
  list-style: none;
  font-size: 12px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}
.aqm-sell-waiting::-webkit-scrollbar {
  width: 6px;
}
.aqm-sell-waiting::-webkit-scrollbar-track {
  background: transparent;
}
.aqm-sell-waiting::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
}
.aqm-sell-waiting::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.35);
}
.aqm-sell-waiting::-webkit-scrollbar-button {
  display: none;
}
.aqm-sell-last {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--aqm-muted);
}
.aqm-sell-waiting li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.aqm-sell-waiting li > span:first-child {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* ---------- Accueil : les boosters de chaque catégorie, côte à côte ---------- */

/* The game's pile and buttons, replaced by Aquaman's: unseen but still drawn (out of the flow), so that their
   pictures load (a picture loaded lazily never loads in a box that isn't shown). */
[data-aqm-hidden] {
  position: absolute !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
[data-aqm-veiled] {
  visibility: hidden;
}
.aqm-piles {
  position: relative;
  flex: none;
  align-self: auto;
  max-width: none;
  width: 100%;
  /* (room above for the count badge and the pack that rises under the pointer) */
  padding: 28px 0 8px;
  overflow: hidden;
  /* Cut on the sides only (the piles beside): the glow of a pack goes over the title and below. */
  overflow-x: clip;
  overflow-y: visible;
}
/* The glow behind the booster in front, in the colour of its pack (paintGlow); it fades from one colour to the next. */
@property --aqm-glow {
  syntax: '<color>';
  inherits: true;
  initial-value: rgb(37 99 235 / 0.38);
}
.aqm-wheel {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  isolation: isolate;
  transition: --aqm-glow 0.6s ease;
}
.aqm-wheel::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: -1;
  width: min(560px, 100%);
  aspect-ratio: 1;
  background: radial-gradient(closest-side, var(--aqm-glow, rgb(37 99 235 / 0.38)), transparent);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.aqm-wheel-track {
  display: grid;
}
.aqm-wheel-controls {
  display: flex;
  justify-content: center;
  margin-top: 4px;
}
.aqm-pile {
  display: flex;
  grid-area: 1 / 1;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  justify-self: center;
  transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s, filter 0.4s;
}
.aqm-pile:not(.is-front) {
  z-index: 0;
  opacity: 0.4;
  cursor: pointer;
}
.aqm-pile.is-front {
  z-index: 1;
}
.aqm-pile.is-away {
  opacity: 0;
  pointer-events: none;
}
.aqm-pile:not(.is-front) .aqm-pile-art {
  pointer-events: none;
}
/* The booster on top, as in the game: it floats, and turns toward the pointer (tiltOnHover). */
.aqm-pile-art [class*='__packPose'] {
  transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.aqm-pile-art .aqm-pose-follow {
  transition: transform 0.15s ease-out;
}
.aqm-pile.is-front [data-aqm-float] {
  animation: aqm-pack-float 2.35s ease-in-out infinite alternate;
}
@keyframes aqm-pack-float {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(0, -16px, 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .aqm-pile.is-front [data-aqm-float] {
    animation: none;
  }
}
.aqm-wheel-arrow {
  position: absolute;
  top: 45%;
  z-index: 3;
  width: 44px;
  height: 44px;
  border: 1px solid var(--aqm-line);
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.85);
  color: #fff;
  font: inherit;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}
.aqm-wheel-arrow:hover {
  border-color: #3b82f6;
  background: rgba(37, 99, 235, 0.35);
}
.aqm-wheel-arrow.is-prev {
  left: 8px;
}
.aqm-wheel-arrow.is-next {
  right: 8px;
}
.aqm-wheel-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 10px;
}
.aqm-wheel-dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  cursor: pointer;
}
.aqm-wheel-dot.is-on {
  width: 22px;
  border-radius: 999px;
  background: #3b82f6;
}
/* Drawn again (a new width): the piles go to their places at once, without sliding there. */
.aqm-piles.is-still .aqm-pile {
  transition: none;
}
@media (max-width: 640px) {
  /* The game's buttons one under the other, as the game shows them on a phone. */
  .aqm-wheel-controls > * {
    flex-direction: column;
  }
  .aqm-wheel-arrow {
    width: 36px;
    height: 36px;
    font-size: 22px;
  }
}
.aqm-queue-btn.is-main {
  border-color: #2563eb;
  background: #2563eb;
}
.aqm-queue-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.aqm-scan-list {
  display: grid;
  gap: 4px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
}

/* ---------- Page d'une carte : offres du marché ---------- */

.aqm-listings {
  margin-top: 16px;
  padding: 16px 18px;
  border: 1px solid var(--aqm-line);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.025);
}
.aqm-listings-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
  margin-bottom: 10px;
}
.aqm-listings-head .aqm-label {
  margin: 0;
}
.aqm-listings .aqm-owners {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.aqm-buy-cell {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}
.aqm-buy {
  height: 30px;
}
.aqm-buy-refused {
  margin: 8px 0 0;
  color: #fca5a5;
}

/* ---------- Collection : séries les plus avancées ---------- */

.aqm-fav-bar .aqm-sort-progress {
  margin-left: 8px;
}
.aqm-sort-progress.is-on {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.2);
  color: #fff;
}

/* ---------- Collection : onglet Manquantes ---------- */

[data-aqm-owned-card] {
  display: none !important;
}
/* "Manquante" and Aquaman's "En vente" on one line. */
[data-aqm-sale='on'] {
  display: inline-block !important;
  margin-right: 8px !important;
  vertical-align: middle;
}
/* Only a sign: a click goes through to the game's card. */
.aqm-sale {
  display: inline-block;
  flex: none;
  padding: 1px 7px;
  border: 1px solid rgba(59, 130, 246, 0.6);
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.22);
  color: #93c5fd;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  line-height: 1.6;
  white-space: nowrap;
  text-transform: uppercase;
  vertical-align: middle;
  pointer-events: none;
}
[data-aqm-pill-off] {
  opacity: 0 !important;
}
[data-aqm-unpicked] {
  background: transparent !important;
  box-shadow: none !important;
  color: var(--aqm-plain-color) !important;
}
.aqm-missing-tab.is-on {
  border-radius: var(--aqm-pill-radius);
  background: var(--aqm-pill-bg) !important;
  box-shadow: var(--aqm-pill-shadow);
  color: var(--aqm-picked-color) !important;
}

/* ---------- Recycler des cartes ---------- */

.aqm-recycle-bar {
  display: flex;
  justify-content: flex-end;
  margin: 0 0 8px;
}

/* ---------- Joueurs avec Aquaman (auteur) ---------- */

.aqm-users-code {
  display: flex;
  gap: 8px;
}
.aqm-users-stats {
  margin-top: 4px;
}
.aqm-users {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}
.aqm-user {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px 8px 8px;
  border-radius: 14px;
  background: var(--aqm-card);
  font-size: 13px;
}
.aqm-user .aqm-user-revoke {
  flex: none;
  padding: 6px 12px;
  font-size: 12px;
}
.aqm-tag.aqm-revoked {
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
}
.aqm-user .aqm-avatar {
  width: 32px;
  height: 32px;
}
.aqm-user .aqm-name {
  flex: 1;
  font-size: 13px;
}
.aqm-kind-userscript {
  background: rgba(34, 197, 94, 0.16);
  color: #86efac;
}
.aqm-user-kinds {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.aqm-online {
  background: rgba(37, 99, 235, 0.2);
  color: #93c5fd;
}
.aqm-user-seen {
  min-width: 90px;
  text-align: right;
  color: var(--aqm-muted);
}
.aqm-device-wait {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(37, 99, 235, 0.12);
  border: 1px solid rgba(96, 165, 250, 0.3);
}
.aqm-device-wait p {
  margin: 0;
}
.aqm-device-wait p + p {
  margin-top: 6px;
}
.aqm-device-wait strong,
.aqm-device-code {
  font: 800 15px ui-monospace, 'Cascadia Mono', Consolas, monospace;
  letter-spacing: 0.08em;
  color: #fff;
}

/* The new version box goes at the top: the box of the search list stays at the bottom. */
.aqm-update {
  top: 16px;
  bottom: auto;
}
@media (max-width: 640px) {
  .aqm-update {
    top: 8px;
    bottom: auto;
  }
}

/* ---------- Marché : « Retirer mes ventes » à côté de « Vendre une carte » ---------- */

.aqm-unlist {
  margin-left: 8px;
}

/* ---------- Fenêtre de question (à la place de celles du navigateur) ---------- */

.aqm-panel.is-ask {
  max-width: 520px;
}
.aqm-ask-text {
  margin: 0 0 12px;
  color: var(--aqm-text);
  font-size: 14px;
  line-height: 1.5;
}
.aqm-ask-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
.aqm-ask-actions .aqm-queue-btn {
  height: 36px;
  padding: 0 18px;
  font-weight: 700;
}

/* ---------- Marché : les autres annonces d'une carte qu'on vient d'acheter ---------- */

[data-aqm-bought] {
  display: none !important;
}

/* ---------- Marché : filtre « Favoris » à côté de « Mes recherches » ---------- */

.aqm-market-fav.is-on {
  background: #1e3a5f !important;
  color: #fff !important;
}
[data-aqm-unfav] {
  display: none !important;
}
/* The filters of Aquaman in the window of an exchange, beside the game's chips. */
.aqm-trade-filter.is-on {
  background: #1e3a5f !important;
  color: #fff !important;
}
.aqm-trade-filter.is-on.is-off {
  opacity: 0.55;
}
[data-aqm-tradehide] {
  display: none !important;
}
/* A card's page: its running auctions, under the market's offers. */
.aqm-auctions-head {
  margin-top: 18px;
}
.aqm-auction-cell {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
/* "Enchérir": a link to the auction's page, drawn like the "Acheter" button (not like a player's name). */
.aqm-owner a.aqm-buy {
  display: inline-flex;
  align-items: center;
  overflow: visible;
  color: #fff;
  font-weight: 800;
  text-decoration: none;
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
    title: 'Qui a cette carte ?',
    text: 'Cherche n’importe quel personnage et choisis sa carte : combien de joueurs l’ont, la liste des détenteurs pour les cartes à tirage limité, ceux qui la vendent au marché, ceux de tes amis qui l’ont, et ceux qui l’ont tirée récemment.',
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
    text: 'Sur la page Collection, l’étoile ☆ ajoute une série à tes favoris ; le bouton « ★ Favoris » au-dessus ouvre la liste de leurs personnages. Quand une série est ouverte, son cadre « Album de la série » a aussi « Ajouter aux favoris » et « Rechercher les manquantes ».',
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
    text: 'Dans chaque proposition, dans le jeu comme en MP, chaque carte porte une pastille verte si tu as déjà la carte (×2, ×3… si tu en as plusieurs) et rouge si tu ne l’as pas.',
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
    version: '1.4.8',
    items: [
      ['Classement : « Global » compte aussi tes amis.'],
      ['Garantie anti-malchance : un booster signalé deux fois n’est plus compté deux fois (un écart de 61 boosters pouvait apparaître pour une garantie de 60).']
    ]
  },
  {
    version: '1.4.7',
    items: [['Historique des tirages : le pack d’où vient chaque SSR, UR et SEC, sous sa carte, et un filtre par pack. Pour les cartes tirées avant cette version, le pack est déduit de la carte : Halloween pour une carte Halloween, Classique pour les autres.'], ['Boosters rentables : en cherchant un personnage, chaque suggestion montre son image et ses raretés.'], ['Accueil : après un « Tout ouvrir », un bouton « Ouvrir les 10 suivants » à côté de « Fermer » ouvre les boosters suivants du même pack, 10 par 10 (le jeu n’en ouvre pas plus d’un coup). La fenêtre des cartes se ferme toute seule 5 s après la dernière, sur les 10 suivantes s’il en reste : un clic dans la fenêtre l’arrête.'], ['Proposer un échange : à côté de « Doublons », les filtres « Mes recherches » et « Il me manque » dans « Tu demandes », et « Il lui manque » dans « Tu donnes » (avec « Doublons » : tes doublons qu’il n’a pas).'], ['Classement : « Global » à côté de « Amis » (les joueurs vus récemment dans les Beaux tirages et les utilisateurs d’Aquaman, pas la liste complète du jeu), et un onglet « Perles » : le stock de Perles des utilisateurs d’Aquaman qui le partagent (réglage « Mes Perles au classement »).']]
  },
  {
    version: '1.4.6',
    items: [['Page d’une carte : un bouton « Enchérir » sur chaque enchère en cours, qui ouvre sa page dans le jeu.']]
  },
  {
    version: '1.4.5',
    items: [['Page d’une carte : sous les annonces du marché, les 3 enchères en cours avec la mise la plus faible, avec le nombre d’enchères et le temps restant.']]
  },
  {
    version: '1.4.4',
    items: [
      ['Page d’une carte : après un achat avec « Acheter », la page ne se recharge plus ; tes Perles et tes exemplaires se mettent à jour sur place.'],
      ['Collection : « ★ Favoris », « Les plus avancées » et « Masquer séries <= 5 persos » apparaissent dès l’ouverture de l’onglet.']
    ]
  },
  {
    version: '1.4.3',
    items: [
      ['Échanges : la pastille verte ou rouge apparaît sur toutes les pages d’échange, et sur les propositions envoyées en MP.', 'echanges'],
      ['Échanges : les cartes gardent la taille du jeu.'],
      ['Page d’une carte SSR, UR ou SEC : un bouton « Qui a cette carte ? » sous « Mes exemplaires » montre les joueurs qui l’ont.'],
      ['Collection : « Masquer séries <= 5 persos », à côté de « Les plus avancées », cache les séries de 5 personnages ou moins.'],
      ['Collection : « En vente » à côté de « Manquante » indique seulement que la carte est vendue au marché : la pastille ne s’ouvre plus.'],
      ['Page d’une carte : les 5 annonces les moins chères du marché, sous la cote, avec « Acheter ».'],
      ['Téléphone : le bouton « Installer » du cadre de mise à jour ouvre le script dans une page que Tampermonkey et Userscripts savent installer (avant, le fichier était seulement téléchargé).']
    ]
  },
  {
    version: '1.4.2',
    items: [['Correction : avec « Tout ouvrir », le pack de l’animation prend l’image de la catégorie ouverte (Légendaire, Action, Magie…), et non celle de la catégorie ouverte juste avant.']]
  },
  {
    version: '1.4.1',
    items: [
      ['Réglages : Plus › Réglages permet d’activer ou de couper chaque fonction d’Aquaman (boosters par catégorie, lueur, garantie, « Manquantes », « En vente », échanges…). La même liste sur PC et téléphone, dans l’extension comme dans le script, et dans la fenêtre de l’extension.'],
      ['Collection : changer de série ne fait plus sauter la page ; la file d’attente des recherches reste en bas de l’écran et dans Séries favorites.'],
      ['Correction : en ouvrant des boosters à thème (Action, Magie…), le pack de l’animation d’ouverture a bien l’image de sa catégorie, et non celle du booster classique.']
    ]
  },
  {
    version: '1.4.0',
    items: [
      ['Garantie anti-malchance : un bouton « Historique » ouvre ton tracker. Il montre à quelle fréquence tu tires des SSR, UR et SEC comparé à la chance du jeu, tes 300 derniers boosters d’un coup d’œil, et combien de boosters il t’a fallu pour chacune.'],
      ['Correction : une UR ne remet plus le compteur de la garantie SSR à zéro, comme dans le jeu.'],
      ['Accueil : la lueur derrière le booster prend la couleur de son pack (doré, cyan, rouge…).'],
      ['Qui a cette carte ? : un même numéro n’apparaît plus chez deux joueurs ; celui vu le plus récemment l’emporte.']
    ]
  },
  {
    version: '1.3.2',
    items: [
      ['Collection : un bouton « En vente » à côté de chaque carte manquante que quelqu’un vend ; il ouvre les 5 annonces les moins chères du marché, avec « Acheter ». Elles ne sont plus ajoutées sur la page de la carte.'],
      ['Accueil : « N à ouvrir » compte les boosters de la catégorie affichée, et son nom n’est plus écrit au-dessus du pack (il est déjà dessus).'],
      ['Accueil : le booster du dessus bouge comme dans le jeu (il flotte et se tourne vers la souris), et sa lueur n’est plus coupée.'],
      ['Correction : la page Collection ne devient plus blanche quand on clique sur « Manquantes » dans une série.'],
      ['Échanges : la page ne gèle plus et ne plante plus quand Aquaman marque les cartes que tu as déjà.'],
      ['Téléphone : les boosters de l’accueil gardent leur forme (ils étaient écrasés) et ne glissent plus les uns derrière les autres quand on fait défiler la page ; les boutons « Ouvrir » et « Tout ouvrir » sont l’un sous l’autre, comme dans le jeu.'],
      ['Plus fluide : Aquaman travaille quand le navigateur est libre, se met en pause quand l’onglet est caché, et le marché comme la collection lui demandent moins de travail.']
    ]
  },
  {
    version: '1.3.1',
    items: [
      ['Marché : les cartes achetées dont les autres annonces sont masquées sont les mêmes sur tous tes appareils (PC, téléphone, extension ou script).'],
      ['Vendre mes doublons : la file des doublons en attente de vente est la même sur tous tes appareils ; celui qui a une page du site ouverte les met en vente dès qu’une place se libère.'],
      ['Réglages : « Partager les cartes achetées masquées et les doublons en attente de vente entre mes appareils », activé par défaut.']
    ]
  },
  {
    version: '1.3.0',
    items: [
      ['Vendre mes doublons (fenêtre du jeu) : quand le marché est plein, le doublon refusé et ceux encore cochés après lui attendent dans Aquaman (50 au plus), sans recliquer, et sont mis en vente tout seuls, au prix choisi, dès qu’une de tes ventes se conclut. La file s’affiche dans la fenêtre, avec « Vider la file » et « Réessayer maintenant ».'],
      ['Recycler des cartes (fenêtre du jeu) : aucune carte n’est cochée à l’ouverture, et un bouton « Tout sélectionner » coche toute la liste.'],
      ['Accueil : sous les garanties SSR et UR, le nombre de boosters depuis ta dernière SEC, sa fréquence moyenne et ta chance d’en avoir une dans les 100 prochains (la SEC n’a pas de garantie).', 'pity'],
      ['Accueil : quand tes boosters sont de plusieurs catégories, les boosters gratuits s’affichent d’abord, et des flèches passent aux autres catégories (3 visibles à la fois : celle du centre et une de chaque côté), chacune avec son rendu, l’image de son pack et ses boutons « Ouvrir » et « Tout ouvrir », qui n’ouvrent que ceux-là, avec l’animation du jeu. Leur dessin est gardé et partagé entre tes appareils, pour s’afficher tout de suite.'],
      ['Accueil : un pack acheté dans la boutique s’affiche dès le retour à l’accueil, sans recharger la page.'],
      ['Marché : un bouton « Retirer mes ventes » à côté de « Vendre une carte » retire toutes tes ventes à prix fixe d’un coup. La file d’attente des doublons est mise en pause le temps du retrait, puis réactivée.'],
      ['Marché : une fois une carte achetée, ses autres annonces de la même rareté ne s’affichent plus.'],
      ['Marché : un filtre « ★ Favoris » à côté de « Mes recherches » ne montre que les cartes de tes séries favorites.'],
      ['Collection : « Les plus avancées » à côté de ★ Favoris range les séries de celle où il te manque le moins de cartes à celle où il en manque le plus (les complètes à la fin). Le tri et la place de la bande sont gardés au retour de la page d’un personnage.'],
      ['Collection : un onglet « Manquantes » à côté de « Album complet », qui ne montre que les cartes qui te manquent.'],
      ['Page d’une carte : sous la cote, les 5 offres les moins chères du marché, de la moins chère à la plus chère, avec le vendeur, le numéro et un bouton « Acheter ».'],
      ['Qui a cette carte ? : la photo de profil de chaque joueur à côté de son nom.', 'qui'],
      ['Correction : la page Collection ne devient plus blanche quand on clique trop tôt sur « Manquantes » (Aquaman attend que le jeu ait fini de charger la page).']
    ]
  },
  {
    version: '1.2.0',
    items: [
      ['Ma vitrine : la fenêtre reste fluide même avec des centaines de cartes (seules celles proches de l’écran sont dessinées, et Aquaman ne fouille plus toute la fenêtre à chaque changement).', 'vitrine'],
      ['Qui a cette carte ? : quand quelqu’un fait un beau tirage (SSR, UR ou SEC), Aquaman lit sa collection publique et garde ses SSR, UR et SEC dans la base commune ; « Vus avec cette carte » liste ces joueurs.', 'qui'],
      ['Les cartes en attente de recherche (au-delà des 100 du jeu) sont les mêmes sur tous tes appareils.', 'favoris'],
      ['Script : une nouvelle version est cherchée toutes les 10 minutes et proposée en haut de l’écran (« Installer »). L’extension la cherche aussi toutes les 10 minutes.']
    ]
  },
  {
    version: '1.1.1',
    items: [
      ['Qui a cette carte ? (menu Plus) : cherche n’importe quel personnage et vois les joueurs qui ont sa carte (détenteurs des cartes limitées, vendeurs au marché, amis) et tous ceux qui l’ont tirée.', 'qui'],
      ['Base commune des beaux tirages : chaque Aquaman relève les SSR, UR et SEC qui sortent chaque minute et les partage ; « Qui a cette carte ? » s’en sert pour dire qui a tiré une carte et combien de fois.', 'qui'],
      ['Collection : dans le cadre « Album de la série », « Ajouter aux favoris » et « Rechercher les manquantes » pour la série affichée.', 'etoiles'],
      ['Rechercher les manquantes : les cartes s’ajoutent au rythme que le jeu accepte, et l’ajout continue pendant que tu changes de page ou ouvres des boosters, avec sa progression en bas de l’écran.'],
      ['Jusqu’à 200 cartes recherchées de plus : quand la liste du jeu (100 cartes) est pleine, les suivantes attendent dans Aquaman et y entrent au fur et à mesure que tu obtiens les cartes recherchées (Aquaman retire de la liste celles qu’il y avait mises, une fois obtenues). L’ajout se fait en arrière-plan ; sa progression est dans Séries favorites.', 'favoris']
    ]
  },
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
  const AUTHOR_ID = 'cmoht6nr312u6qs135zjtdojg'; // the author's account: the only one shown "Joueurs avec Aquaman"
  let meId = null;

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
  const ICON_GEAR =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Z"/></svg>';
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
  // The extension reloaded or updated while this page stayed open: its storage and messages throw "Extension context
  // invalidated" from any timer still running. This copy of Aquaman stops at the first one, quietly (the page's next
  // load brings the new one).
  const GONE = /extension context invalidated/i;
  const onGone = (e) => {
    if (!GONE.test(String(e.reason?.message ?? e.error?.message ?? e.message ?? ''))) return;
    e.preventDefault();
    shutdown();
  };
  addEventListener('unhandledrejection', onGone);
  addEventListener('error', onGone);

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

  // ---------- changes sent from the page ----------

  // The game refuses changes that don't come from its own pages: they are sent from here (with content.fetch on
  // Firefox, which sends them as the page), never from the background worker.
  const pageFetch = typeof content !== 'undefined' && content?.fetch ? content.fetch.bind(content) : window.fetch.bind(window);

  async function gameWrite(path, method, data) {
    const headers = data === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' };
    const res = await pageFetch(`/api-game/v1${path}`, { method, credentials: 'include', headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(body?.error?.message || `Erreur ${res.status}`);
      // "Doucement ! Réessaie dans un instant." : the game asks to slow down, the change can be sent again.
      error.slowDown = res.status === 429 || /doucement|r[ée]essaie|trop de requ/i.test(error.message);
      // The wait the game asks for: its Retry-After header, else the seconds in its message ("Réessaie dans 12 s").
      error.wait = (Number(res.headers?.get?.('retry-after')) || Number(error.message.match(/(\d+)\s*(?:s\b|sec)/i)?.[1]) || 0) * 1000;
      throw error;
    }
    // Perles or cards changed (a sale, a withdrawal…): the game reads them again from the API (inject.js). The
    // extension's requests don't go through the page's fetch, where inject.js sees the game's own.
    if (method !== 'GET' && /^\/(market|trades|auctions|copies)\//.test(path)) window.postMessage({ aquamanCmd: 'reload-game', assets: true }, location.origin);
    return body;
  }

  // Puts one card in the player's search list (on) or takes it out (also out of the cards waiting in Aquaman).
  async function wantCard(id, on) {
    if (!on && (await takeWaiting([id]))) {
      send({ type: 'wants-changed' });
      return { wanted: false };
    }
    const res = await gameWrite(`/cards/${encodeURIComponent(id)}/want`, on ? 'PUT' : 'DELETE');
    send({ type: 'wants-changed' });
    return { wanted: !!res?.wanted };
  }

  // ---------- search list: a queue that goes on through page changes ----------
  // The cards to search are kept in the storage: any open page of the game sends them, one at a time, at the pace the
  // game accepts, and goes on after a change of page or a reload. One tab works at a time (the "owner", with a heartbeat).

  const QUEUE = 'wantQueue';
  const TAB = Math.random().toString(36).slice(2);
  const STALE = 10e3; // a tab silent for this long hands the queue over
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const playersSeen = new Map(); // folded name -> id of the players whose cards the game read (inject.js)
  const foldName = (s) =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  let batch = null; // { kind, before, opened }: the last "Tout ouvrir", the boosters of its kind then, how many it opened (markOpenMore)
  let queueRunning = false;
  let settled = false; // the page was taken over by React: Aquaman may change it (see whenSettled)

  // The features the player turned off ("Plus › Réglages" or the extension's popup), read at start; a change applies
  // once the page is loaded again.
  let feat = {};
  let featLoaded = false;
  const on = (key) => feat[key] !== false;
  const featReady = chrome.storage.local
    .get('settings')
    .then(({ settings }) => (feat = settings ?? {}))
    .catch(() => {})
    .finally(() => (featLoaded = true));

  const readQueue = async () => (await chrome.storage.local.get(QUEUE))[QUEUE] ?? null;
  const writeQueue = (q) => chrome.storage.local.set({ [QUEUE]: q });
  // The wait before sending again when the game asks to slow down: the time it gives (5 s when it gives none) and 1 s
  // more. Never a refusal: the card or copy waits its turn.
  const slowWait = (e) => (e.wait || 5000) + 1000;

  // True when another tab is working on the queue right now.
  const busyElsewhere = (q) => !!q.owner && q.owner !== TAB && (Date.now() - q.beat < STALE || Date.now() < (q.until || 0) + STALE);

  // The game takes 100 cards at most in the search list: the others wait in Aquaman (WAITING) and are sent as places
  // free up, when the player gets cards of the list. SENT: the cards Aquaman put in the list, taken out once owned.
  const WAITING = 'wantWaiting';
  const SENT = 'wantSent';
  const LIMIT = 'wantLimit';
  const REFILL = 'wantRefillAt'; // last check of the free places, by any tab
  const WAIT_MAX = 200; // cards waiting in Aquaman at most, on top of the game's list
  const ENTERED = 'wantEntered'; // waiting cards gone into the game's list (or obtained) since the waiting list began
  const CHECK_EVERY = 120e3;
  const FULL = /d[ée]j[àa]\s*(\d+)|retire|limite|maximum|plein/i; // the game's answer when the list is full

  const readList = async (key) => (await chrome.storage.local.get(key))[key] ?? [];

  // Saves a change of the waiting cards (or of those Aquaman put in the game's list), stamped with its time, and sends
  // it to the player's other devices a moment later.
  let wantsPush = 0;
  async function saveWants(items) {
    await chrome.storage.local.set({ ...items, wantsAt: Date.now() });
    clearTimeout(wantsPush);
    wantsPush = setTimeout(() => send({ type: 'wants-sync', fresh: true }), 1500);
  }

  // Adds cards at the end of the waiting ones (each once, WAIT_MAX at most); returns how many were added, and how
  // many didn't fit.
  async function park(ids) {
    const waiting = await readList(WAITING);
    const fresh = ids.filter((id) => !waiting.includes(id));
    const fit = fresh.slice(0, Math.max(0, WAIT_MAX - waiting.length));
    if (fit.length) await saveWants({ [WAITING]: [...waiting, ...fit], ...(waiting.length ? {} : { [ENTERED]: 0 }) });
    return { parked: fit.length, over: fresh.length - fit.length };
  }

  // Takes cards out of the waiting ones; returns how many were there.
  async function takeWaiting(ids) {
    const waiting = await readList(WAITING);
    const left = waiting.filter((id) => !ids.includes(id));
    if (left.length !== waiting.length) await saveWants({ [WAITING]: left });
    return waiting.length - left.length;
  }

  // Adds cards to the queue (each once); returns { sent } with how many were added. While cards wait for a place,
  // the new ones wait behind them: { parked, over } (see park).
  async function enqueueWants(ids, refill = false) {
    if (!refill && (await readList(WAITING)).length) {
      const r = await park(ids);
      checkRoom(20e3);
      return r;
    }
    let q = await readQueue();
    if (!q || q.finishedAt) q = { ids: [], total: 0, done: 0, refused: null, owner: null, beat: 0, until: 0, tries: 0, finishedAt: 0 };
    const fresh = ids.filter((id) => !q.ids.includes(id));
    q.ids.push(...fresh);
    q.total += fresh.length;
    q.refill = refill && q.refill !== false; // cards added by the player show the box
    await writeQueue(q);
    runQueue();
    return { sent: fresh.length };
  }

  const nCards = (n) => `${n} carte${n > 1 ? 's' : ''}`;
  // Cards that didn't fit in the waiting ones.
  const overNote = (over) => (over ? ` ${nCards(over)} de trop : Aquaman en garde ${WAIT_MAX} en attente au plus.` : '');

  // What became of the cards given to enqueueWants (r: its answer).
  function wantsNote(r, free) {
    if (r.sent == null)
      return `Ta liste du jeu est pleine : ${nCards(r.parked)} de plus en attente dans Aquaman, ajoutée${r.parked > 1 ? 's' : ''} au fur et à mesure que tu obtiens les cartes recherchées.` + overNote(r.over);
    return `${nCards(r.sent)} en cours d’ajout : ${free}, la progression reste affichée (en haut de Séries favorites et en bas de l’écran).`;
  }

  // Sends waiting cards when the search list has free places: first takes out the cards Aquaman put there that the
  // player now owns. Runs after the collection changed, and every 2 minutes (wait: time since the last check).
  let roomBusy = false;
  async function checkRoom(wait = CHECK_EVERY) {
    if (stopped || roomBusy) return;
    roomBusy = true;
    try {
      await refill(wait);
    } finally {
      roomBusy = false;
    }
  }

  async function refill(wait) {
    const waiting = await readList(WAITING);
    if (!waiting.length) return;
    const q = await readQueue();
    if (q?.ids.length) return; // the queue first
    const { [REFILL]: at = 0, [LIMIT]: limit = 100 } = await chrome.storage.local.get([REFILL, LIMIT]);
    if (Date.now() - at < wait) return;
    await chrome.storage.local.set({ [REFILL]: Date.now() });
    const room = await send({ type: 'want-room', waiting, sent: await readList(SENT) });
    if (!room || room.error || stopped) return;
    let freed = 0;
    for (const id of room.obtained) {
      try {
        await gameWrite(`/cards/${encodeURIComponent(id)}/want`, 'DELETE');
        freed++;
      } catch {}
      await pause(900);
    }
    // Cards added or taken out of the waiting ones meanwhile are kept as they are.
    const now = await readList(WAITING);
    const left = now.filter((id) => !waiting.includes(id) || room.waiting.includes(id));
    const places = Math.max(0, limit - room.count + freed);
    // Waiting cards already searched or obtained count as done.
    const entered = (await chrome.storage.local.get(ENTERED))[ENTERED] ?? 0;
    await saveWants({ [SENT]: room.sent, [WAITING]: left.slice(places), [ENTERED]: entered + waiting.length - room.waiting.length });
    if (freed) send({ type: 'wants-changed' });
    if (places && left.length) await enqueueWants(left.slice(0, places), true);
  }

  async function stopQueue() {
    const q = await readQueue();
    if (!q) return;
    await writeQueue({ ...q, ids: [], refused: null, stopped: true, finishedAt: Date.now() });
  }

  // Sends the cards of the queue, waits when the game asks to slow down, stops at a real refusal (a full search list).
  async function runQueue() {
    if (queueRunning || stopped) return;
    const first = await readQueue();
    if (!first?.ids.length || busyElsewhere(first)) return;
    queueRunning = true;
    let gap = 900;
    try {
      while (!stopped) {
        let q = await readQueue();
        if (!q?.ids.length || busyElsewhere(q)) break;
        const id = q.ids[0];
        await writeQueue({ ...q, owner: TAB, beat: Date.now(), until: 0 });
        try {
          await gameWrite(`/cards/${encodeURIComponent(id)}/want`, 'PUT');
          q = await readQueue();
          if (!q || q.finishedAt) break; // stopped meanwhile
          const ids = q.ids.filter((x) => x !== id);
          const { [SENT]: sent = [], [ENTERED]: entered = 0 } = await chrome.storage.local.get([SENT, ENTERED]);
          await saveWants({ [SENT]: sent.includes(id) ? sent : [...sent, id], ...(q.refill ? { [ENTERED]: entered + 1 } : {}) });
          await writeQueue({ ...q, ids, done: q.done + 1, tries: 0, beat: Date.now(), finishedAt: ids.length ? 0 : Date.now() });
          if (ids.length) await pause(gap);
        } catch (e) {
          q = await readQueue();
          if (!q || q.finishedAt) break;
          if (e.slowDown) {
            gap = Math.min(4000, gap * 1.5);
            const wait = slowWait(e);
            await writeQueue({ ...q, tries: q.tries + 1, beat: Date.now(), until: Date.now() + wait });
            await pause(wait);
          } else if (FULL.test(e.message)) {
            // The search list is full: the rest waits in Aquaman for free places.
            const limit = Number(e.message.match(FULL)?.[1]);
            if (limit > 0) await chrome.storage.local.set({ [LIMIT]: limit });
            const before = await readList(WAITING);
            const waiting = [...q.ids, ...before.filter((x) => !q.ids.includes(x))];
            const parked = Math.min(q.ids.length, WAIT_MAX);
            await saveWants({ [WAITING]: waiting.slice(0, WAIT_MAX), [REFILL]: Date.now(), ...(before.length || q.refill ? {} : { [ENTERED]: 0 }) });
            await writeQueue({ ...q, parked, over: q.ids.length - parked, ids: [], finishedAt: Date.now() });
          } else await writeQueue({ ...q, refused: e.message, left: q.ids.length, ids: [], finishedAt: Date.now() });
        }
      }
    } finally {
      queueRunning = false;
      send({ type: 'wants-changed' });
    }
  }

  // The box at the bottom of every page of the game: the cards being added by the player. The waiting cards go in
  // the background, without a box (their progress is in the favourite series).
  async function renderBox() {
    const q = await readQueue();
    if (!stopped) renderQueue(q && !q.refill ? q : null);
  }

  // The search of the player and the waiting cards, for the favourite series, kept up to date while it is shown:
  // a bar in three parts (in the game's list / being sent / waiting in Aquaman). changed: called when cards were
  // taken out of the waiting ones, or when an adding ended (the series then show what is left to search).
  function searchPanel(changed) {
    const panel = h('div', { class: 'aqm-fav-wait', role: 'status', hidden: true });
    let wasRunning = null;
    const paint = async () => {
      if (stopped || !alive()) return void stop();
      if (!panel.isConnected && wasRunning !== null) return void stop();
      const { [QUEUE]: q = null, [WAITING]: waiting = [], [ENTERED]: entered = 0, [REFILL]: at = 0, [LIMIT]: limit = 100 } =
        await chrome.storage.local.get([QUEUE, WAITING, ENTERED, REFILL, LIMIT]);
      const running = !!q?.ids.length;
      if (wasRunning && !running) changed?.();
      wasRunning = running;
      const parts = [];
      const slow = running && q.until > Date.now() ? ` Le jeu demande de ralentir : reprise dans ${Math.ceil((q.until - Date.now()) / 1000)} s.` : '';

      // The cards the player just asked for.
      if (running && !q.refill)
        parts.push(
          h('div', { class: 'aqm-queue-head' }, h('strong', {}, `🔭 Ajout à ta liste du jeu · ${q.done}/${q.total}`)),
          h('span', { class: 'aqm-bar' }, h('span', { style: `width:${q.total ? ((100 * q.done) / q.total).toFixed(1) : 0}%` })),
          h('p', {}, `Les cartes entrent une à une dans ta liste de recherches du jeu (${limit} cartes au plus) ; au-delà, elles passent dans la file d’attente d’Aquaman.${slow}`)
        );

      // The waiting cards.
      const sending = running && q.refill ? q.ids.length : 0;
      const total = entered + sending + waiting.length;
      if (waiting.length || sending) {
        const pc = (n) => `${((100 * n) / total).toFixed(1)}%`;
        const ago = Math.round((Date.now() - at) / 60e3);
        const next = Math.max(0, Math.ceil((at + CHECK_EVERY - Date.now()) / 60e3));
        parts.push(
          h('div', { class: 'aqm-queue-head' },
            h('strong', {}, `⏳ File d’attente d’Aquaman · ${entered}/${total}`),
            h('button', {
              type: 'button',
              class: 'aqm-queue-btn',
              onclick: async () => {
                if (!confirm(`Retirer les ${nCards(waiting.length)} de la file d’attente d’Aquaman ? Celles déjà dans ta liste du jeu y restent.`)) return;
                await chrome.storage.local.remove([WAITING, ENTERED]);
                await send({ type: 'wants-changed' });
                changed?.();
              }
            }, 'Vider la file')),
          h('p', {}, `Ta liste de recherches du jeu est pleine (${limit} cartes). Aquaman garde les suivantes (${WAIT_MAX} au plus) et les y ajoute tout seul dès qu’une place se libère : quand tu obtiens une carte que tu recherches.`),
          h('span', { class: 'aqm-steps' },
            h('span', { class: 'is-in', style: `width:${pc(entered)}` }),
            h('span', { class: 'is-sending', style: `width:${pc(sending)}` }),
            h('span', { class: 'is-waiting', style: `width:${pc(waiting.length)}` })),
          h('div', { class: 'aqm-steps-legend' },
            h('span', { class: 'is-in' }, `${entered} entrée${entered > 1 ? 's' : ''} dans ta liste`),
            sending ? h('span', { class: 'is-sending' }, `${sending} en cours d’envoi`) : null,
            h('span', { class: 'is-waiting' }, `${waiting.length} en attente`)),
          h('div', { class: 'aqm-queue-actions' },
            h('small', {}, sending
              ? `Des places se sont libérées : envoi en cours.${slow}`
              : `Places vérifiées ${at ? (ago ? `il y a ${ago} min` : 'à l’instant') : 'jamais'}${next ? `, prochaine vérification dans ${next} min` : ''}.`),
            sending ? null : h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => checkRoom(0) }, 'Vérifier maintenant'))
        );
      }
      panel.hidden = !parts.length;
      panel.replaceChildren(...parts);
    };
    const onChange = (changes) => [QUEUE, WAITING, ENTERED, REFILL].some((k) => changes[k]) && paint();
    const timer = setInterval(paint, 5000);
    const stop = () => {
      clearInterval(timer);
      chrome.storage.onChanged.removeListener?.(onChange);
    };
    chrome.storage.onChanged.addListener(onChange);
    paint();
    return panel;
  }

  // The cards being added: progress, then the result.
  function renderQueue(q) {
    if (!q || (!q.ids.length && !q.finishedAt) || !location.pathname.startsWith('/jeu')) return void document.querySelector('.aqm-dock > .aqm-wants')?.remove();
    const box = dockBox('aqm-wants');
    const running = q.ids.length > 0;
    const added = `${nCards(q.done)} ajoutée${q.done > 1 ? 's' : ''} à ta liste de recherches du jeu`;
    let title;
    let lines;
    if (running) {
      title = `🔭 Recherche des manquantes · ${q.done}/${q.total}`;
      lines = [
        q.until > Date.now()
          ? `Le jeu demande de ralentir : reprise dans ${Math.ceil((q.until - Date.now()) / 1000)} s.`
          : 'La recherche continue même si tu changes de page ou ouvres des boosters.'
      ];
    } else if (q.stopped) {
      title = '🔭 Recherche arrêtée';
      lines = [`✅ ${added}.`];
    } else if (q.refused) {
      title = '🔭 Recherche interrompue';
      lines = [`✅ ${added}.`, `⛔ Le jeu a refusé la suite (« ${q.refused} ») : ${nCards(q.left)} non ajoutée${q.left > 1 ? 's' : ''}.`];
    } else if (q.parked) {
      title = '🔭 Ta liste du jeu est pleine';
      lines = [
        `✅ ${added}.`,
        `⏳ ${nCards(q.parked)} mise${q.parked > 1 ? 's' : ''} dans la file d’attente d’Aquaman : ${q.parked > 1 ? 'elles seront ajoutées' : 'elle sera ajoutée'} toute${q.parked > 1 ? 's' : ''} seule${q.parked > 1 ? 's' : ''} dès qu’une place se libère, quand tu obtiens une carte que tu recherches.`,
        q.over ? `⛔ ${nCards(q.over)} non gardée${q.over > 1 ? 's' : ''} : la file d’attente est pleine (${WAIT_MAX} cartes).` : null,
        'Suis la file dans Plus › Séries favorites.'
      ];
    } else {
      title = '🔭 Recherche terminée';
      lines = [`✅ ${added}.`, 'Le jeu te prévient quand elles sont mises en vente.'];
    }
    // The bar only while cards are sent (replaceChildren would show a null as text).
    box.replaceChildren(
      ...[
        h('div', { class: 'aqm-queue-head' }, h('strong', {}, title),
          h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => (running ? stopQueue() : chrome.storage.local.remove(QUEUE)) }, running ? 'Arrêter' : 'OK')),
        running && h('span', { class: 'aqm-bar' }, h('span', { style: `width:${q.total ? ((100 * q.done) / q.total).toFixed(1) : 0}%` })),
        ...lines.map((line) => line && h('p', {}, line))
      ].filter(Boolean)
    );
  }

  // A box of the bottom right corner (the cards being added, the duplicates being put on sale), one above the other.
  function dockBox(cls) {
    let box = document.querySelector(`.aqm-dock > .${cls}`);
    if (box) return box;
    const dock = document.querySelector('.aqm-dock') ?? document.body.appendChild(h('div', { class: 'aqm-root aqm-dock' }));
    return dock.appendChild(h('div', { class: `aqm-queue ${cls}`, role: 'status' }));
  }

  // ---------- duplicates on sale: a queue like the search list's ----------
  // The game's "Vendre mes doublons" window puts the copies on the market itself. When the market takes no more of the
  // player's sales, each copy it refuses ({ cardId, copyId, price, name }, read by inject.js) waits in Aquaman
  // (SALES_MAX at most) and is tried again every 2 minutes, by one tab at a time: a sale concluded frees a place.

  const SALES = 'sellQueue';
  const SALES_WAITING = 'sellWaiting';
  const SALES_AT = 'sellCheckAt'; // last try of the waiting copies, by any tab
  const SALES_LAST = 'sellLastAnswer'; // the game's last answer to a try of the waiting copies: { at, message, full }
  const SALES_PAUSED = 'sellPausedUntil'; // the waiting copies are not tried until then (the sales being withdrawn)
  const SALES_MAX = 50;
  // The game's answer when its market is full: "50 ordres en cours au plus." (its sales and purchase orders together).
  // Any other refusal is about the copy itself: it leaves the queue.
  const SALES_FULL = /ordres? en cours/i;
  let salesRunning = false;
  chrome.storage.local.remove('sellFullMessage'); // a refusal once taken for a full market by the test builds of version 1.3.0

  const readSales = async () => (await chrome.storage.local.get(SALES))[SALES] ?? null;
  const writeSales = (q) => chrome.storage.local.set({ [SALES]: q });
  const nCopies = (n) => `${n} doublon${n > 1 ? 's' : ''}`;
  const salesPaused = async () => ((await chrome.storage.local.get(SALES_PAUSED))[SALES_PAUSED] ?? 0) > Date.now();


  // Adds copies to the waiting ones (each once, SALES_MAX at most), at the front for those that were waiting already;
  // returns how many didn't fit.
  async function parkSales(items, front = false) {
    const before = await readList(SALES_WAITING);
    const fresh = items.filter((x, i) => !before.some((y) => y.copyId === x.copyId) && items.findIndex((y) => y.copyId === x.copyId) === i);
    const all = front ? [...fresh, ...before] : [...before, ...fresh];
    await saveSalesWaiting({ [SALES_WAITING]: all.slice(0, SALES_MAX), ...(front || !before.length ? { [SALES_AT]: Date.now() } : {}) });
    return Math.max(0, all.length - SALES_MAX);
  }

  // Saves a change of the waiting copies, stamped with its time, and sends it to the player's other devices a moment
  // later (the most recent list of any device wins).
  let marketPush = 0;
  async function saveSalesWaiting(items) {
    await chrome.storage.local.set({ ...items, sellWaitingAt: Date.now() });
    pushMarket();
  }
  function pushMarket() {
    clearTimeout(marketPush);
    marketPush = setTimeout(() => send({ type: 'market-sync', fresh: true }), 1500);
  }

  // The game's window had a sale refused: a full market keeps the copy waiting in Aquaman. The game stops its "Mettre N
  // en vente" at the first refusal: the copies still ticked in its list (ticked, read by inject.js) wait too, without
  // clicking again.
  async function onSellRefused(item, message, ticked) {
    if (salesRunning || !SALES_FULL.test(message)) return; // Aquaman's own sales (userscript), or a refusal about the copy
    const batch = Date.now() - sellOneAt > 15e3; // not the "Vendre" of one row
    const named = (x) => ({ cardId: x.cardId, copyId: x.copyId, price: x.price, name: x.name ?? ticked.find((t) => t.copyId === x.copyId)?.name ?? 'Une carte' });
    const after = batch ? ticked.slice(Math.max(0, ticked.findIndex((t) => t.copyId === item.copyId))) : [];
    await parkSales([item, ...after].map(named));
  }

  // Last click on the "Vendre" of one row of the game's window (a sale of one copy).
  let sellOneAt = 0;
  function onSellClick(e) {
    const b = e.target.closest?.('button');
    if (b && !b.closest('.aqm-root')) sellOneAt = b.textContent.trim() === 'Vendre' ? Date.now() : 0;
  }

  // Tries the waiting copies again (wait: time since the last try): they go to the queue, and back to the waiting
  // ones if the market is still full.
  async function checkSales(wait = CHECK_EVERY) {
    if (stopped || (await salesPaused())) return;
    const waiting = await readList(SALES_WAITING);
    const q = await readSales();
    if (!waiting.length || q?.items.length) return;
    const { [SALES_AT]: at = 0 } = await chrome.storage.local.get(SALES_AT);
    if (Date.now() - at < wait) return;
    await saveSalesWaiting({ [SALES_WAITING]: [], [SALES_AT]: Date.now() });
    await writeSales({ items: waiting, total: waiting.length, done: 0, skipped: [], owner: null, beat: 0, until: 0, tries: 0, finishedAt: 0 });
    runSales();
  }

  async function stopSales() {
    const q = await readSales();
    if (!q) return;
    await parkSales(q.items, true);
    await writeSales({ ...q, items: [], stopped: true, finishedAt: Date.now() });
  }

  // Puts the copies of the queue on sale, waits when the game asks to slow down, drops a copy it refuses, and puts
  // the rest back in the waiting ones once the market is full.
  async function runSales() {
    if (salesRunning || stopped) return;
    const first = await readSales();
    if (!first?.items.length || busyElsewhere(first)) return;
    salesRunning = true;
    let gap = 900;
    try {
      while (!stopped) {
        let q = await readSales();
        if (!q?.items.length || busyElsewhere(q) || (await salesPaused())) break;
        const item = q.items[0];
        await writeSales({ ...q, owner: TAB, beat: Date.now(), until: 0 });
        try {
          await gameWrite('/market/orders', 'POST', { cardId: item.cardId, side: 'sell', price: item.price, copyId: item.copyId });
          q = await readSales();
          if (!q || q.finishedAt) break; // stopped meanwhile
          const items = q.items.filter((x) => x.copyId !== item.copyId);
          await writeSales({ ...q, items, done: q.done + 1, tries: 0, beat: Date.now(), finishedAt: items.length ? 0 : Date.now() });
          chrome.storage.local.set({ [SALES_LAST]: { at: Date.now(), message: null, full: false } });
          if (items.length) await pause(gap);
        } catch (e) {
          q = await readSales();
          if (!q || q.finishedAt) break;
          const rest = q.items.filter((x) => x.copyId !== item.copyId);
          if (e.slowDown) {
            gap = Math.min(4000, gap * 1.5);
            const wait = slowWait(e);
            await writeSales({ ...q, tries: q.tries + 1, beat: Date.now(), until: Date.now() + wait });
            await pause(wait);
          } else if (SALES_FULL.test(e.message)) {
            chrome.storage.local.set({ [SALES_LAST]: { at: Date.now(), message: e.message, full: true } });
            await parkSales(q.items, true);
            await writeSales({ ...q, items: [], finishedAt: Date.now() });
          } else {
            // This copy can't be sold any more (sold by hand, already on sale, traded…): the next ones go on.
            chrome.storage.local.set({ [SALES_LAST]: { at: Date.now(), message: e.message, full: false } });
            const skipped = [...q.skipped, { ...item, reason: e.message }];
            await writeSales({ ...q, items: rest, skipped, tries: 0, beat: Date.now(), finishedAt: rest.length ? 0 : Date.now() });
            if (rest.length) await pause(gap);
          }
        }
      }
    } finally {
      salesRunning = false;
    }
  }

  // The box at the bottom of every page of the game while waiting copies go on sale, then what became of them (only
  // when at least one was sold: a market still full changes nothing).
  async function renderSalesBox() {
    const q = await readSales();
    const show = q && !q.stopped && (q.done > 0 || (q.items.length && q.items.length < q.total)) && location.pathname.startsWith('/jeu');
    if (!show || stopped) return void document.querySelector('.aqm-dock > .aqm-sales')?.remove();
    const box = dockBox('aqm-sales');
    const running = q.items.length > 0;
    const waiting = (await readList(SALES_WAITING)).length;
    const lines = [
      `✅ ${nCopies(q.done)} de la file d’attente d’Aquaman mis en vente.`,
      running
        ? q.until > Date.now()
          ? `Le jeu demande de ralentir : reprise dans ${Math.ceil((q.until - Date.now()) / 1000)} s.`
          : 'Une place s’est libérée sur le marché : les suivants partent.'
        : waiting
          ? `⏳ ${nCopies(waiting)} encore en attente : ils partiront aux prochaines ventes conclues.`
          : null,
      q.skipped.length ? `⛔ ${nCopies(q.skipped.length)} refusé${q.skipped.length > 1 ? 's' : ''} par le jeu (« ${q.skipped.at(-1).reason} »).` : null
    ];
    box.replaceChildren(
      ...[
        h('div', { class: 'aqm-queue-head' }, h('strong', {}, running ? `🏷️ Mise en vente des doublons · ${q.done}/${q.total}` : '🏷️ Doublons mis en vente'),
          h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => (running ? stopSales() : chrome.storage.local.remove(SALES)) }, running ? 'Arrêter' : 'OK')),
        running && h('span', { class: 'aqm-bar' }, h('span', { style: `width:${q.total ? ((100 * q.done) / q.total).toFixed(1) : 0}%` })),
        ...lines.map((line) => line && h('p', {}, line))
      ].filter(Boolean)
    );
  }

  // The game's "Vente conclue" toast: a place is free on the market, the waiting copies are tried right away.
  const saleToasts = new WeakSet();
  function watchSaleToast() {
    for (const el of elementsWithText(document.body, /^\s*vente conclue\s*$/i)) {
      if (saleToasts.has(el)) continue;
      saleToasts.add(el);
      setTimeout(() => checkSales(0), 1500);
    }
  }

  // In the game's "Vendre mes doublons" window, under its whole head (title, text and close button), above the bar
  // "Tout cocher": what Aquaman adds to it, and its waiting copies.
  const SELL_BAR = /^tout (d[ée])?cocher/i;
  function markSellDialog() {
    if (!location.pathname.startsWith('/jeu')) return;
    for (const title of document.querySelectorAll('h1, h2, h3, [role="dialog"] [id]')) {
      if (title.closest('.aqm-root') || !/^vendre mes doublons$/i.test(title.textContent.trim())) continue;
      const bar = [...(title.closest('[role="dialog"]') ?? document).querySelectorAll('button')].find((b) => SELL_BAR.test(b.textContent.trim()));
      if (!bar) continue; // not drawn yet
      // The box shared by the title and the bar, and its child that holds the bar: the panel goes just before it.
      let block = bar;
      while (block.parentElement && !block.parentElement.contains(title)) block = block.parentElement;
      if (!block.parentElement || block.parentElement === document.body || block.parentElement.querySelector(':scope > .aqm-sell-wait')) continue;
      // As wide as the game's head and bar: the same space on each side as before the bar.
      const panel = salesPanel();
      block.before(panel);
      const parent = block.parentElement;
      const inset = bar.getBoundingClientRect().left - parent.getBoundingClientRect().left - parseFloat(getComputedStyle(parent).paddingLeft || 0);
      if (inset > 0) panel.style.marginInline = `${Math.round(inset)}px`;
    }
  }

  // The market: once a card is bought, its other sales are hidden for good (the player has it now), kept in
  // Aquaman's storage.
  const BOUGHT_KEY = 'marketBought';
  // The cards bought: "rarity|name" in lower case (the rarity's code: n, r, sr, ssr, ur, sec), the same character in
  // another rarity stays shown. (A name alone: kept by the first days of this, any rarity.)
  const boughtNames = new Set();
  (async () => {
    try {
      for (const key of (await chrome.storage.local.get(BOUGHT_KEY))[BOUGHT_KEY] ?? []) boughtNames.add(key);
    } catch {}
    hideBoughtCards();
  })();
  function addBought(name, rarity) {
    const code = RANKED.includes(rarity) ? rarity.toLowerCase() : '';
    boughtNames.add(code ? `${code}|${name.trim().toLowerCase()}` : name.trim().toLowerCase());
    try {
      chrome.storage.local.set({ [BOUGHT_KEY]: [...boughtNames] });
    } catch {}
    pushMarket(); // to the player's other devices
    hideBoughtCards();
  }
  const BUY_BUTTON = /^(acheter|confirmer|trop cher)$/i;
  // The sales shown by the market: each is the highest box around its "Acheter" holding no other sale, with its texts
  // in lower case (the card's name, its series, its rarity as the game writes it: "N" and "Commune").
  // (the boxes are counted in one pass, the texts read only for the tiles that need them)
  function marketTiles() {
    const buys = [...document.querySelectorAll('button')].filter((b) => !b.closest('.aqm-root') && BUY_BUTTON.test(b.textContent.trim()));
    const held = new Map();
    for (const b of buys) for (let el = b.parentElement; el && el !== document.body; el = el.parentElement) held.set(el, (held.get(el) ?? 0) + 1);
    return buys.map((b) => {
      let tile = b;
      while (tile.parentElement && tile.parentElement !== document.body && held.get(tile.parentElement) === 1) tile = tile.parentElement;
      let texts = null;
      return {
        tile,
        get texts() {
          return (texts ??= new Set([...tile.querySelectorAll('*')].filter((el) => !el.childElementCount).map((el) => el.textContent.trim().toLowerCase())));
        }
      };
    });
  }

  function hideBoughtCards() {
    if (!on('hideBought') || !boughtNames.size || !location.pathname.startsWith('/jeu')) return;
    for (const t of marketTiles()) {
      const { tile } = t;
      if (tile.hasAttribute('data-aqm-bought')) continue;
      const { texts } = t;
      const rarity = RANKED.find((code) => texts.has(code.toLowerCase()) || texts.has(RARITY_NAMES[code].toLowerCase()))?.toLowerCase();
      const hidden = [...texts].some((t) => boughtNames.has(t) || (rarity && boughtNames.has(`${rarity}|${t}`)));
      if (hidden) tile.setAttribute('data-aqm-bought', '');
    }
  }

  // Beside the game's "Mes recherches" (the market): a "Favoris" filter that shows only the sales of the favourite
  // series. Kept for the tab.
  const MARKET_FAV_KEY = 'aqm-market-fav';
  let marketFavLoading = false;
  let marketFavTried = false;
  const marketFavOn = () => {
    try {
      return sessionStorage.getItem(MARKET_FAV_KEY) === '1';
    } catch {
      return false;
    }
  };
  function markMarketFavorites() {
    if (!location.pathname.startsWith('/jeu')) return;
    const mine = [...document.querySelectorAll('button')].find((b) => !b.closest('.aqm-root') && /^mes recherches$/i.test(b.textContent.trim()));
    if (!mine) return;
    const on = marketFavOn();
    let chip = mine.parentElement.querySelector(':scope > .aqm-market-fav');
    if (!chip) {
      // The look of the game's chips not picked (a rarity's), its own state drawn by Aquaman.
      const plain = [...mine.parentElement.querySelectorAll('button')].find((b) => b !== mine && /^(n|r|sr|ssr|ur|sec)\s*(commune|rare|épique|légendaire|mythique|secrète)$/i.test(b.textContent.trim()));
      chip = h('button', {
        type: 'button',
        class: `${plain?.className ?? mine.className} aqm-market-fav`,
        title: 'Seulement les cartes de tes séries favorites',
        onclick: () => {
          try {
            marketFavOn() ? sessionStorage.removeItem(MARKET_FAV_KEY) : sessionStorage.setItem(MARKET_FAV_KEY, '1');
          } catch {}
          markMarketFavorites();
        }
      }, '★ Favoris');
      mine.after(chip);
    }
    chip.classList.toggle('is-on', on);
    chip.setAttribute('aria-pressed', String(on));
    if (on && (!favIds || !seriesTitles)) {
      if (!marketFavLoading && !marketFavTried) {
        marketFavLoading = true;
        marketFavTried = true; // (once: without an answer, every sale stays shown)
        loadFavIds().finally(() => {
          marketFavLoading = false;
          markMarketFavorites();
        });
      }
      return;
    }
    const titles = new Set(on ? [...favIds].map((id) => seriesTitles.get(id)).filter(Boolean) : []);
    for (const { tile, texts } of marketTiles()) tile.toggleAttribute('data-aqm-unfav', on && ![...texts].some((t) => titles.has(t)));
  }

  // Beside the game's "Vendre une carte" (the market): a button that withdraws every fixed-price sale of the player at
  // once (the cards are free again), one after the other at the pace the game accepts. Aquaman's waiting copies are
  // paused meanwhile (in every tab), else they would go on sale in the places set free; they go on afterwards.
  const SELL_CARD = /^vendre une carte$/i;
  let unlisting = false;
  function markUnlistButton() {
    if (!location.pathname.startsWith('/jeu')) return;
    const sell = [...document.querySelectorAll('button, a')].find((b) => !b.closest('.aqm-root') && SELL_CARD.test(b.textContent.trim()));
    if (!sell || sell.parentElement.querySelector(':scope > .aqm-unlist')) return;
    const btn = h('button', { type: 'button', class: `${sell.className} aqm-unlist`, onclick: () => unlistAll(btn) }, 'Retirer mes ventes');
    sell.after(btn);
  }

  async function unlistAll(btn) {
    if (unlisting) return;
    const sales = (n) => `${n} vente${n > 1 ? 's' : ''}`;
    let listings;
    try {
      listings = ((await gameWrite('/market/listings?mine=1', 'GET'))?.listings ?? []).filter((l) => l?.id);
    } catch (e) {
      return void askDialog('Retirer mes ventes', `Le jeu n’a pas donné tes ventes : ${e.message}`);
    }
    if (!listings.length) return void askDialog('Retirer mes ventes', 'Tu n’as aucune vente à prix fixe en cours.');
    const waiting = (await readList(SALES_WAITING)).length + ((await readSales())?.items.length ?? 0);
    const also = waiting ? `\n\nLa file d’attente d’Aquaman (${nCopies(waiting)}) est mise en pause le temps du retrait, puis réactivée.` : '';
    if (!(await askDialog('Retirer mes ventes', `Retirer tes ${sales(listings.length)} à prix fixe ? Les cartes redeviennent libres.${also}`, 'Retirer', 'Annuler'))) return;
    unlisting = true;
    const label = btn.textContent;
    let done = 0;
    let failed = null;
    try {
      // (a pause that ends by itself if this page is closed meanwhile)
      await chrome.storage.local.set({ [SALES_PAUSED]: Date.now() + 15 * 60e3 });
      await stopSales(); // the copies being sent go back to the waiting ones
      let gap = 600;
      for (const l of listings) {
        if (stopped) break;
        btn.textContent = `Retrait… ${done}/${listings.length}`;
        for (let tries = 0; ; tries++) {
          try {
            await gameWrite(`/market/orders/${encodeURIComponent(l.id)}`, 'DELETE');
            done++;
            break;
          } catch (e) {
            if (e.slowDown && tries < 5) {
              gap = Math.min(4000, gap * 1.5);
              await pause(slowWait(e));
              continue;
            }
            failed = e.message; // (sold meanwhile, already withdrawn…): the next ones go on
            break;
          }
        }
        await pause(gap);
      }
    } finally {
      try {
        await chrome.storage.local.remove(SALES_PAUSED); // the waiting copies go on
      } catch {}
      unlisting = false;
    }
    send({ type: 'collection-stale' });
    btn.textContent = `✅ ${sales(done)} retirée${done > 1 ? 's' : ''}`;
    if (failed) await askDialog('Retirer mes ventes', `${sales(listings.length - done)} non retirée${listings.length - done > 1 ? 's' : ''} : « ${failed} ».`);
    // The game's list of sales and its Perles are read again.
    setTimeout(() => (done ? location.reload() : (btn.textContent = label)), failed ? 0 : 1200);
  }

  // The waiting copies, kept up to date while shown; without any, what Aquaman does when the market is full.
  function salesPanel() {
    const panel = h('div', { class: 'aqm-root aqm-fav-wait aqm-sell-wait', role: 'status' });
    let painted = false;
    const paint = async () => {
      if (stopped || !alive()) return void stop();
      if (!panel.isConnected && painted) return void stop();
      painted = true;
      const { [SALES]: q = null, [SALES_WAITING]: waiting = [], [SALES_AT]: at = 0, [SALES_LAST]: last = null } = await chrome.storage.local.get([SALES, SALES_WAITING, SALES_AT, SALES_LAST]);
      const sending = q?.items.length ?? 0;
      if (!waiting.length && !sending) {
        panel.replaceChildren(h('p', {}, `🔱 Aquaman : si le marché est plein, jusqu’à ${SALES_MAX} doublons de plus attendent dans Aquaman et sont mis en vente tout seuls, au prix choisi, dès qu’une de tes ventes se conclut.`));
        return;
      }
      const ago = Math.round((Date.now() - at) / 60e3);
      const next = Math.max(0, Math.ceil((at + CHECK_EVERY - Date.now()) / 60e3));
      panel.replaceChildren(
        h('div', { class: 'aqm-queue-head' },
          h('strong', {}, `⏳ File d’attente d’Aquaman · ${waiting.length}/${SALES_MAX}`),
          waiting.length
            ? h('button', {
                type: 'button',
                class: 'aqm-queue-btn',
                onclick: async () => {
                  if (!confirm(`Retirer les ${nCopies(waiting.length)} de la file d’attente d’Aquaman ? Ceux déjà en vente y restent.`)) return;
                  await saveSalesWaiting({ [SALES_WAITING]: [] });
                }
              }, 'Vider la file')
            : null),
        h('p', {}, `Le marché est plein : Aquaman garde le doublon refusé et ceux encore cochés après lui (${SALES_MAX} au plus) et les met en vente tout seul, au prix choisi, dès qu’une de tes ventes se conclut. Il vérifie en arrière-plan tant qu’une page du site est ouverte, même dans un autre onglet.`),
        waiting.length ? h('ul', { class: 'aqm-sell-waiting' }, waiting.map((x) => h('li', {}, h('span', {}, x.name), perles(x.price)))) : null,
        // What the game said at the last try: its own words, to see why the copies wait.
        last?.message
          ? h('p', { class: 'aqm-sell-last' }, `Dernière réponse du jeu ${timeAgo(last.at)} : « ${last.message} »${last.full ? ' (ses ventes et ses ordres d’achat en cours comptent ensemble).' : ' : ce doublon a été retiré de la file.'}`)
          : null,
        h('div', { class: 'aqm-queue-actions' },
          h('small', {}, sending
            ? `Une place s’est libérée : ${nCopies(sending)} en cours d’envoi.`
            : `Essayé ${at ? (ago ? `il y a ${ago} min` : 'à l’instant') : 'jamais'}${next ? `, prochain essai dans ${next} min` : ''}.`),
          sending ? null : h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => checkSales(0) }, 'Réessayer maintenant'))
      );
    };
    const onChange = (changes) => [SALES, SALES_WAITING, SALES_AT, SALES_LAST].some((k) => changes[k]) && paint();
    const timer = setInterval(paint, 5000);
    const stop = () => {
      clearInterval(timer);
      chrome.storage.onChanged.removeListener?.(onChange);
    };
    chrome.storage.onChanged.addListener(onChange);
    paint();
    return panel;
  }

  // The queue changed (in this tab or another one): the boxes follow, and this tab takes over if needed.
  function onStorage(changes) {
    if (stopped || !settled) return;
    // A feature turned on or off elsewhere (the extension's popup, another tab): offered to load the page again.
    if (changes.settings && !settingsOpen) {
      const now = changes.settings.newValue ?? {};
      const STEPS = new Set(STEP_SETTING.values()).add('packGlow');
      if ([...STEPS].some((key) => (now[key] !== false) !== on(key))) offerReload();
    }
    if (changes[QUEUE]) {
      renderBox();
      runQueue();
    }
    if (changes[SALES]) {
      renderSalesBox();
      runSales();
    }
    // The cards bought on another device (synced): their sales are hidden here too.
    if (changes[BOUGHT_KEY]) {
      for (const key of changes[BOUGHT_KEY].newValue ?? []) boughtNames.add(key);
      hideBoughtCards();
    }
  }

  let wantsPulledAt = 0;

  // Every 5 seconds: the countdowns of the waits, a tab that went silent, and the waiting cards and duplicates.
  setInterval(async () => {
    if (stopped || !settled) return;
    if (!alive()) return shutdown(); // the extension was reloaded: this copy stops
    const q = await readQueue();
    renderBox();
    if (q?.finishedAt && Date.now() - q.finishedAt > 60e3) chrome.storage.local.remove(QUEUE);
    else runQueue();
    checkRoom();
    const sales = await readSales();
    renderSalesBox();
    if (sales?.finishedAt && Date.now() - sales.finishedAt > 60e3) chrome.storage.local.remove(SALES);
    else runSales();
    checkSales();
    if (Date.now() - wantsPulledAt > 60e3) {
      wantsPulledAt = Date.now();
      send({ type: 'wants-sync' }); // the other devices' changes
      send({ type: 'market-sync' }); // (the cards bought on the market, the copies waiting for a place)
    }
  }, 5000);

  // Messages posted by inject.js about the site's own requests.
  function onPageMessage(e) {
    if (e.source !== window || typeof e.data?.aquaman !== 'string') return;
    if (e.data.aquaman === 'collection-stale') {
      owned = null;
      send({ type: 'collection-stale' });
      setTimeout(schedule, 1500);
      setTimeout(() => checkRoom(20e3), 3000); // a card searched may just have been obtained
    } else if (e.data.aquaman === 'sell-refused' && e.data.item?.copyId)
      onSellRefused(e.data.item, String(e.data.message ?? ''), Array.isArray(e.data.ticked) ? e.data.ticked.filter((t) => t?.copyId && t.price > 0) : []);
    else if (e.data.aquaman === 'status') {
      send({ type: 'status', pending: e.data.pending });
      if (Array.isArray(e.data.boosters)) {
        pendingBoosters = e.data.boosters.filter((b) => b?.id);
        markBoosterKinds();
      }
    }
    else if (e.data.aquaman === 'market-bought' && typeof e.data.name === 'string') addBought(e.data.name, e.data.rarity);
    else if (e.data.aquaman === 'feed' && Array.isArray(e.data.pulls)) send({ type: 'feed-seen', pulls: e.data.pulls });
    else if (e.data.aquaman === 'player-seen' && typeof e.data.id === 'string' && typeof e.data.name === 'string') playersSeen.set(foldName(e.data.name), e.data.id);
    else if (e.data.aquaman === 'opened' && Array.isArray(e.data.boosters)) {
      if (batch) batch.opened = e.data.boosters.length;
      send({ type: 'opened', boosters: e.data.boosters, best: Array.isArray(e.data.best) ? e.data.best : [], packs: Array.isArray(e.data.packs) ? e.data.packs : [], ids: Array.isArray(e.data.ids) ? e.data.ids : [] }).then((report) => {
        if (report && !report.error) {
          pityReport = report;
          pityAt = Date.now();
        }
        renderPity();
      });
    }
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

  // Text nodes of the site under from, without Aquaman's elements nor the "Ma vitrine" windows (hundreds of cards).
  // The page's are gathered once per run() and shared by its steps.
  let runText; // undefined: outside run(); null: in run(), not gathered yet
  const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG']);
  function textNodes(from) {
    if (from === document.body && runText) return runText;
    const nodes = [];
    const walker = document.createTreeWalker(from, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.nodeType === Node.TEXT_NODE
          ? NodeFilter.FILTER_ACCEPT
          : n !== from && (n.classList.contains('aqm-root') || vitrines.has(n) || SKIP_TEXT.has(n.tagName.toUpperCase()))
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_SKIP
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.trim()) nodes.push(n);
    if (from === document.body && runText === null) runText = nodes;
    return nodes;
  }

  // Elements of the site with a text matching re.
  function elementsWithText(from, re) {
    const out = [];
    for (const n of textNodes(from)) if (n.parentElement && re.test(n.nodeValue)) out.push(n.parentElement);
    return out;
  }

  const setText = (el, text) => el.textContent !== text && (el.textContent = text);
  // Lets a badge be placed in the corner of an element of the site. Inline style: the site rewrites the classes of its
  // elements (a selected series, for instance), which would take away a class of Aquaman.
  function anchorBadges(el) {
    const position = getComputedStyle(el).position;
    if (el.style.position === 'relative' || (position && position !== 'static')) return;
    el.style.position = 'relative';
    el.dataset.aqmAnchor = '1';
  }
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
      item('Classement', 'Amis ou global : cartes uniques, séries complètes et Perles', ICON_TROPHY, openLeaderboard),
      item('Boosters rentables', 'Prix, taux de drop, persos et séries', ICON_PACK, openBoosters),
      item('Qui a cette carte ?', 'Ceux qui l’ont, la vendent ou l’ont tirée', ICON_SEARCH, openWhoHas),
      item('Séries favorites', 'Tes séries et leurs persos manquants', ICON_STAR, openFavorites),
      item('Visite guidée', 'Le tour de ce qu’ajoute Aquaman', ICON_COMPASS, () => startTour(0)),
      item('Nouveautés', 'Ce qui a changé dans Aquaman', ICON_SPARK, () => openNews()),
      item('Réglages', 'Activer ou couper chaque fonction d’Aquaman', ICON_GEAR, openSettings),
      meId === AUTHOR_ID ? item('Joueurs avec Aquaman', 'Réservé à l’auteur', ICON_TROPHY, openUsers) : null,
      meId === AUTHOR_ID ? item('Scanner les packs', 'Publier le design de chaque booster', ICON_PACK, startScan) : null
    );
    menu.anchor = anchor;
    document.body.append(menu);
    anchor.setAttribute('aria-expanded', 'true');
    const r = anchor.getBoundingClientRect();
    const below = r.bottom + 8 + menu.offsetHeight < innerHeight;
    menu.style.top = `${below ? r.bottom + 8 : r.top - 8 - menu.offsetHeight}px`;
    menu.style.left = `${Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.left + r.width / 2 - menu.offsetWidth / 2))}px`;
  }

  // The settings, the same in the extension and the script, on a computer or a phone (SETTINGS in src/lib/aquaman.js).
  // A feature turned on or off applies once the window is closed: the page is loaded again.
  let settingsOpen = false;
  async function openSettings() {
    const body = openOverlay('Réglages', `Aquaman ${chrome.runtime.getManifest().version} · ${owner === 'userscript' ? 'script' : 'extension'} · les mêmes réglages sur PC et téléphone`);
    body.parentElement.classList.add('aqm-panel-wide');
    let r;
    try {
      r = await ask({ type: 'settings' });
    } catch (e) {
      body.append(h('p', { class: 'aqm-note' }, e.message));
      return;
    }
    const values = { ...r.values };
    const before = JSON.stringify(values);
    // A card per group, each setting with its title, its hint and a switch on the right.
    const row = ([key, title, hint, only]) => {
      const away = only === 'extension' && owner === 'userscript';
      const box = h('input', { type: 'checkbox', role: 'switch', class: 'aqm-toggle', disabled: away, 'aria-label': title });
      box.checked = !away && !!values[key];
      box.addEventListener('change', () => {
        values[key] = box.checked;
        ask({ type: 'set-settings', patch: { [key]: box.checked } }).catch(() => {});
      });
      return h(
        'label',
        { class: `aqm-setting${away ? ' is-off' : ''}` },
        h('span', { class: 'aqm-setting-text' }, h('strong', {}, title), h('small', {}, away ? `${hint} · extension sur PC seulement` : hint)),
        box
      );
    };
    body.append(
      h(
        'div',
        { class: 'aqm-settings-groups' },
        r.groups.map((group) =>
          h('section', { class: 'aqm-settings-group' }, h('p', { class: 'aqm-settings-title' }, h('span', { 'aria-hidden': 'true' }, group.icon ?? ''), group.title), group.items.map(row))
        )
      ),
      h(
        'div',
        { class: 'aqm-settings-foot' },
        h('p', {}, 'Un changement s’applique à la fermeture de cette fenêtre : la page se recharge.'),
        h('div', { class: 'aqm-settings-actions' }, h('button', { type: 'button', class: 'aqm-tour-btn', onclick: () => openNews() }, 'Nouveautés'), h('button', { type: 'button', class: 'aqm-tour-btn is-main', onclick: () => startTour(0) }, 'Visite guidée'))
      )
    );
    settingsOpen = true;
    overlayClosed = () => {
      settingsOpen = false;
      if (JSON.stringify(values) !== before) location.reload();
    };
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
    overlayClosed = null;
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
    const then = overlayClosed;
    overlayClosed = null;
    then?.();
  }
  let overlayClosed = null; // called once when the window is closed

  // A question in Aquaman's window, in place of the browser's: true for its main button, false when it is closed
  // another way. Without cancel, a message (its one button closes it). Paragraphs are separated by a blank line.
  function askDialog(title, text, ok = 'OK', cancel = null) {
    return new Promise((resolve) => {
      const body = openOverlay(title);
      body.closest('.aqm-panel')?.classList.add('is-ask');
      let answer = false;
      overlayClosed = () => resolve(answer);
      const pick = (value) => {
        answer = value;
        closeOverlay();
      };
      body.append(
        ...text.split('\n\n').map((p) => h('p', { class: 'aqm-ask-text' }, p)),
        h('div', { class: 'aqm-ask-actions' },
          cancel ? h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => pick(false) }, cancel) : null,
          h('button', { type: 'button', class: 'aqm-queue-btn is-main', onclick: () => pick(true) }, ok))
      );
      body.querySelector('.aqm-ask-actions .is-main').focus();
    });
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
  // "Amis": the player and their friends. "Global": the friends too, and the players the relay saw lately in the "beaux tirages" and
  // those who share their Perles with Aquaman (not every player: the game gives no such list). The collections are read
  // only for the tabs that need them; the Perles are those the players of Aquaman share (sharePerles).

  async function openLeaderboard() {
    const body = openOverlay('Classement', 'Toi et tes amis, ou plus largement, selon les cartes uniques, les séries complètes et les Perles.');
    let scope = 'friends';
    let sortBy = 'owned';
    const scopes = { friends: null, global: null }; // { rows, note, perlesAsked } of each scope, once read
    const scopeRow = h('div');
    const tabs = h('div');
    const status = h('p', { class: 'aqm-note' }, 'Chargement…');
    const list = h('ol', { class: 'aqm-board' });
    body.append(scopeRow, tabs, status, list);
    const alive = () => body.isConnected;

    let frame = 0;
    const later = () => frame || (frame = requestAnimationFrame(() => ((frame = 0), render())));

    const render = () => {
      scopeRow.replaceChildren(
        chips(
          [
            ['friends', 'Amis'],
            ['global', 'Global']
          ],
          scope,
          (v) => {
            scope = v;
            load();
            render();
          }
        )
      );
      tabs.replaceChildren(
        chips(
          [
            ['owned', 'Cartes uniques'],
            ['albums', 'Séries complètes'],
            ['perles', 'Perles']
          ],
          sortBy,
          (v) => {
            sortBy = v;
            load();
            render();
          }
        )
      );
      const s = scopes[scope];
      status.textContent = s?.note ?? 'Chargement…';
      const rows = s?.rows ?? [];
      // A row counts once its number of the tab is known.
      const known = (r) => (sortBy === 'perles' ? typeof r.perles === 'number' : r.state === 'ok');
      const score = (r) => (!known(r) ? [-1, -1] : sortBy === 'perles' ? [r.perles, 0] : [r[sortBy], sortBy === 'owned' ? r.albums : r.owned]);
      const sorted = [...rows].sort((a, b) => {
        const [a1, a2] = score(a);
        const [b1, b2] = score(b);
        return b1 - a1 || b2 - a2 || String(a.name).localeCompare(String(b.name));
      });
      let place = 0;
      const ok = rows.filter((r) => r.state === 'ok');
      const topAlbums = Math.max(0, ...ok.map((r) => r.albums));
      const topPerles = Math.max(0, ...rows.map((r) => (typeof r.perles === 'number' ? r.perles : 0)));
      const bar = (part) => h('span', { class: 'aqm-bar' }, h('span', { style: `width:${(100 * Math.min(1, part || 0)).toFixed(2)}%` }));
      list.replaceChildren(
        ...sorted.map((r) => {
          if (known(r)) place++;
          let stats;
          if (sortBy === 'perles')
            stats =
              typeof r.perles === 'number'
                ? h('div', { class: 'aqm-stat is-on' }, h('strong', {}, perles(r.perles)), h('small', {}, 'en stock'), bar(topPerles ? r.perles / topPerles : 0))
                : h('p', { class: 'aqm-muted', title: 'Seuls les joueurs qui utilisent Aquaman et partagent leurs Perles (réglage « Mes Perles au classement ») ont un montant.' }, r.perles === undefined ? 'Chargement…' : 'Non partagé');
          else if (r.state !== 'ok') stats = h('p', { class: 'aqm-muted' }, r.state === 'private' ? 'Collection privée' : r.state === 'error' ? 'Collection indisponible' : 'Chargement…');
          else if (sortBy === 'owned')
            stats = h('div', { class: 'aqm-stat is-on' }, h('strong', {}, fmt(r.owned)), h('small', {}, `/ ${fmt(r.total)} cartes`), bar(r.total ? r.owned / r.total : 0));
          else stats = h('div', { class: 'aqm-stat is-on' }, h('strong', {}, fmt(r.albums)), h('small', {}, r.albums > 1 ? 'séries complètes' : 'série complète'), bar(topAlbums ? r.albums / topAlbums : 0));
          return h(
            'li',
            { class: `aqm-row${r.me ? ' is-me' : ''}` },
            h('span', { class: `aqm-place aqm-place-${place}` }, known(r) ? String(place) : '–'),
            h('img', { class: 'aqm-avatar', src: avatarUrl(r.id), alt: '', loading: 'lazy' }),
            h('a', { class: 'aqm-name', href: `/profile/${encodeURIComponent(r.id)}` }, r.name || 'Joueur', r.me ? h('span', { class: 'aqm-tag' }, 'Toi') : null),
            h('div', { class: 'aqm-stats' }, stats)
          );
        })
      );
    };

    // The players of a scope, then what the tab shown needs: the Perles shared, or the collections (4 at a time).
    async function load() {
      const name = scope;
      let s = scopes[name];
      if (!s) {
        s = scopes[name] = { rows: [], note: 'Chargement…', perlesAsked: false, collectionsAsked: false };
        try {
          if (name === 'friends') {
            const { me, friends, friendsError: error } = await ask({ type: 'friends' });
            s.rows = [{ id: me, me: true }, ...friends].map((p) => ({ ...p, state: 'idle' }));
            s.note = error
              ? `Liste d'amis indisponible (${error}).`
              : friends.length
                ? `${friends.length} ami${friends.length > 1 ? 's' : ''} · une série est complète quand son album est réclamé.`
                : "Tu n'as pas encore d'amis dans le jeu : ajoute-en depuis leur profil pour te comparer à eux.";
          } else {
            const { me, players } = await ask({ type: 'global-players' });
            s.rows = [{ id: me, me: true }, ...players].map((p) => ({ ...p, state: 'idle' }));
            s.note = `${fmt(players.length + 1)} joueurs · ce n’est pas la liste complète du jeu : seulement tes amis, les joueurs vus récemment dans les « Beaux tirages » et ceux qui partagent leurs Perles avec Aquaman.`;
          }
        } catch (e) {
          s.note = e.message;
        }
        if (!alive()) return;
        later();
      }
      if (sortBy === 'perles' && !s.perlesAsked) {
        s.perlesAsked = true;
        try {
          const { perles: byId } = await ask({ type: 'shared-perles', ids: s.rows.map((r) => r.id) });
          for (const r of s.rows) r.perles = typeof byId?.[r.id] === 'number' ? byId[r.id] : null;
        } catch {
          for (const r of s.rows) r.perles = null;
        }
        if (alive()) later();
      }
      if (sortBy !== 'perles' && !s.collectionsAsked) {
        s.collectionsAsked = true;
        for (const r of s.rows) r.state = 'loading';
        later();
        await eachLimited(s.rows, 4, async (row) => {
          if (!alive()) return;
          try {
            const p = await ask({ type: 'player', id: row.id });
            row.name ||= p.name;
            if (p.private) row.state = 'private';
            else Object.assign(row, { state: 'ok', owned: p.owned, total: p.total, albums: p.albums });
          } catch {
            row.state = 'error';
          }
          later();
        });
      }
    }

    render();
    load();
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
    // The suggestions under the search field: each name with the picture of one of its cards and its rarities.
    const suggestions = h('ul', { class: 'aqm-suggest', id: 'aqm-suggest', role: 'listbox', hidden: true });
    const search = h('input', { type: 'search', class: 'aqm-search', role: 'combobox', 'aria-controls': 'aqm-suggest', 'aria-expanded': 'false', 'aria-autocomplete': 'list', autocomplete: 'off' });
    const searchBox = h('div', { class: 'aqm-suggest-box' }, search, suggestions);
    let picked = -1; // the suggestion chosen with the arrows
    let typing = false; // the list opens only while typing, not once a name is picked
    const showSuggestions = (open) => {
      suggestions.hidden = !open || !suggestions.childElementCount;
      search.setAttribute('aria-expanded', String(!suggestions.hidden));
    };
    const pickSuggestion = (name) => {
      typing = false;
      search.value = name;
      clearTimeout(timer);
      query = name;
      showSuggestions(false);
      refresh();
    };
    const fillSuggestions = (list) => {
      picked = -1;
      suggestions.replaceChildren(
        ...list.map((s, i) =>
          h(
            'li',
            {
              id: `aqm-suggest-${i}`,
              class: 'aqm-suggest-item',
              'data-name': s.name,
              role: 'option',
              'aria-selected': 'false',
              // (mousedown: before the field loses the focus)
              onmousedown: (e) => {
                e.preventDefault();
                pickSuggestion(s.name);
              }
            },
            s.image ? h('img', { src: cardImageUrl(s.image), alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'aqm-suggest-blank' }),
            h('span', { class: 'aqm-suggest-name' }, s.name, goal === 'series' && s.cards ? h('small', {}, `${fmt(s.cards)} carte${s.cards > 1 ? 's' : ''}`) : null),
            goal === 'series' ? null : h('span', { class: 'aqm-suggest-rarities' }, (s.rarities ?? []).map((code) => rarityCode(code)))
          )
        )
      );
      showSuggestions(typing && document.activeElement === search && !!search.value.trim());
    };
    const movePick = (step) => {
      const items = [...suggestions.children];
      if (!items.length) return;
      showSuggestions(true);
      picked = (picked + step + items.length) % items.length;
      items.forEach((li, i) => li.setAttribute('aria-selected', String(i === picked)));
      items[picked].scrollIntoView({ block: 'nearest' });
      search.setAttribute('aria-activedescendant', items[picked].id);
    };
    search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        movePick(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter' && picked >= 0 && !suggestions.hidden) {
        e.preventDefault();
        pickSuggestion(suggestions.children[picked].dataset.name);
      } else if (e.key === 'Escape' && !suggestions.hidden) {
        e.stopPropagation();
        showSuggestions(false);
      }
    });
    search.addEventListener('focus', () => showSuggestions(typing && !!search.value.trim()));
    search.addEventListener('blur', () => showSuggestions(false));
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
    body.append(goalRow, pickRow, sentence, sortRow, summary, list, how);

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
        fillSuggestions(report.suggestions ?? []);
        render();
      } catch {}
    }
    search.addEventListener('input', () => {
      typing = true;
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
        if (pickRow.firstChild !== searchBox) pickRow.replaceChildren(searchBox);
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

  // ---------- who has a card ----------

  // "il y a 5 min", "il y a 3 h", "il y a 2 j".
  function timeAgo(at) {
    const s = Math.max(0, (Date.now() - at) / 1000);
    if (s < 60) return 'à l’instant';
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    return `il y a ${Math.floor(s / 86400)} j`;
  }

  // Profile picture of a player (an empty square for a private profile), to find them again on the site.
  const avatarOf = (player) =>
    player?.id ? h('img', { class: 'aqm-avatar aqm-avatar-sm', src: avatarUrl(player.id), alt: '', loading: 'lazy' }) : h('span', { class: 'aqm-avatar aqm-avatar-sm' });

  // One line of a list of players: the card's number, the player (picture and link to their profile) and a detail
  // on the right.
  const playerRow = (serial, player, right, card) =>
    h(
      'li',
      { class: 'aqm-owner' },
      h('span', { class: 'aqm-owner-serial' }, serial != null ? `#${serial}${card?.maxCopies ? `/${card.maxCopies}` : ''}` : ''),
      avatarOf(player),
      player?.id ? h('a', { href: `/profile/${encodeURIComponent(player.id)}` }, player.name || 'Un joueur') : h('span', { class: 'aqm-muted' }, player?.name || 'Un joueur au profil privé'),
      h('span', { class: 'aqm-owner-right' }, right ?? '')
    );

  // Recent pulls of the "beaux tirages" kept by Aquaman, as rows.
  const pullRows = (pulls) =>
    pulls.map((p) =>
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
          h(
            'span',
            { class: 'aqm-pull-player' },
            avatarOf(p.player),
            p.player?.id ? h('a', { href: `/profile/${encodeURIComponent(p.player.id)}` }, p.player.name || 'Un joueur') : h('span', {}, p.player?.name || 'Un joueur')
          ),
          h('small', { title: new Date(p.at).toLocaleString('fr-FR') }, timeAgo(p.at))
        )
      )
    );

  // With a card id (its page's button), the window opens on that card.
  async function openWhoHas(cardId) {
    const body = openOverlay('Qui a cette carte ?', 'Cherche n’importe quel personnage : les joueurs qui ont sa carte, qui la vendent et qui l’ont tirée récemment.');
    const search = h('input', { type: 'search', class: 'aqm-search', placeholder: 'Nom d’un personnage ou d’une série…', 'aria-label': 'Personnage ou série', autocomplete: 'off' });
    const view = h('div', { class: 'aqm-who' });
    body.append(h('div', { class: 'aqm-pick' }, search), view);
    let asked = 0;
    let timer = 0;

    // Without a choice: the cards matching the search, then the recent pulls matching it.
    async function showSearch() {
      const n = ++asked;
      const query = search.value.trim();
      view.replaceChildren(h('p', { class: 'aqm-note' }, 'Recherche…'));
      const [found, pulled] = await Promise.all([
        query.length >= 2 ? ask({ type: 'card-search', query }).catch(() => ({ cards: [] })) : { cards: [] },
        ask({ type: 'who-pulled', query, rarity: '' }).catch((e) => ({ error: e.message }))
      ]);
      if (n !== asked) return;
      const parts = [];
      if (query.length >= 2) {
        parts.push(h('p', { class: 'aqm-label' }, 'Cartes du jeu'));
        parts.push(
          found.cards.length
            ? h(
                'ul',
                { class: 'aqm-strip aqm-who-cards' },
                found.cards.map((c) =>
                  h(
                    'li',
                    { class: `aqm-mini${c.owned ? ' is-owned' : ''}`, role: 'button', tabindex: '0', title: `Qui a ${c.name} ?`, onclick: () => showCard(c.id), onkeydown: (e) => e.key === 'Enter' && showCard(c.id) },
                    h('img', { src: cardImageUrl(c.image), alt: '', loading: 'lazy' }),
                    h('div', {}, h('p', { class: 'aqm-mini-name' }, rarityCode(c.rarity), ' ', c.name, c.variant ? ` (${c.variant})` : ''), h('p', { class: 'aqm-muted' }, c.series ?? ''))
                  )
                )
              )
            : h('p', { class: 'aqm-muted' }, `Aucune carte ne s’appelle « ${query} ».`)
        );
      } else parts.push(h('p', { class: 'aqm-note' }, 'Tape au moins 2 lettres du nom d’un personnage, puis choisis sa carte.'));
      if (!pulled.error) {
        const since = pulled.since ? new Date(pulled.since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : null;
        parts.push(h('p', { class: 'aqm-label aqm-who-gap' }, query ? 'Tirages récents' : 'Derniers beaux tirages'));
        parts.push(h('p', { class: 'aqm-note aqm-who-note' }, `Parmi ${pulled.kept > 1 ? `les ${fmt(pulled.kept)} beaux tirages` : `${fmt(pulled.kept)} beau tirage`} (SSR, UR, SEC) relevé${pulled.kept > 1 ? 's' : ''} par les joueurs qui ont Aquaman${since ? ` depuis le ${since}` : ''}${pulled.shared ? '' : ' (base commune injoignable : seulement ceux de cet appareil)'}.${pulled.latest ? ` Dernier tirage reçu ${timeAgo(pulled.latest)}.` : ''}`));
        parts.push(pulled.pulls.length ? h('ol', { class: 'aqm-pulled' }, pullRows(pulled.pulls.slice(0, 50))) : h('p', { class: 'aqm-muted' }, 'Aucun tirage récent.'));
      }
      view.replaceChildren(...parts);
    }

    // One card: everyone Aquaman can see with it.
    async function showCard(id) {
      const n = ++asked;
      view.replaceChildren(h('p', { class: 'aqm-note' }, 'Recherche des joueurs qui ont cette carte…'));
      let r;
      try {
        r = await ask({ type: 'card-owners', id });
      } catch (e) {
        view.replaceChildren(h('p', { class: 'aqm-note' }, e.message));
        return;
      }
      if (n !== asked) return;
      const c = r.card;
      const stat = (label, value) => (value == null ? null : h('div', { class: 'aqm-metric' }, h('small', {}, label), h('strong', {}, value)));
      const section = (title, items, empty) => [h('p', { class: 'aqm-label aqm-who-gap' }, title), items.length ? h('ul', { class: 'aqm-owners' }, items) : h('p', { class: 'aqm-muted' }, empty)];
      view.replaceChildren(
        h('button', { type: 'button', class: 'aqm-chip aqm-who-back', onclick: showSearch }, '← Retour à la recherche'),
        h(
          'div',
          { class: 'aqm-who-card' },
          h('a', { href: `/jeu/carte/${encodeURIComponent(c.id)}` }, h('img', { src: cardImageUrl(c.image), alt: '' })),
          h(
            'div',
            {},
            h('p', { class: 'aqm-pack-title' }, rarityCode(c.rarity), ' ', c.name, c.variant ? ` (${c.variant})` : ''),
            c.series ? h('p', { class: 'aqm-muted' }, c.series) : null,
            h('p', { class: 'aqm-muted' }, c.owned ? `Tu l’as${c.owned > 1 ? ` (${c.owned} exemplaires)` : ''}.` : 'Tu ne l’as pas.'),
            h(
              'div',
              { class: 'aqm-who-stats' },
              stat('Joueurs qui l’ont', c.owners != null ? fmt(c.owners) : null),
              stat('En circulation', c.circulation != null ? fmt(c.circulation) : null),
              stat('Recherchée par', c.wants != null ? fmt(c.wants) : null),
              stat('Tirage', c.maxCopies ? `${fmt(c.minted ?? 0)}/${fmt(c.maxCopies)}` : 'Illimité')
            )
          )
        ),
        ...(r.holders
          ? section(`Détenteurs · ${fmt(r.holders.length)}`, r.holders.map((x) => playerRow(x.serial, x.player, null, c)), 'Personne ne l’a encore.')
          : [
              h(
                'p',
                { class: 'aqm-note' },
                c.owners
                  ? `${fmt(c.owners)} joueur${c.owners > 1 ? 's l’ont' : ' l’a'}, mais le jeu ne publie la liste des détenteurs que pour les cartes à tirage limité. Voici ceux qu’Aquaman peut voir.`
                  : 'Personne n’a encore cette carte.'
              )
            ]),
        ...section(
          'En vente au marché',
          r.market.map((x) => playerRow(x.serial, x.player, x.price != null ? h('span', {}, perles(x.price)) : null, c)),
          'Personne ne la vend en ce moment.'
        ),
        ...section(
          'Parmi toi et tes amis',
          r.friends.map((x) => playerRow(x.serials[0] ?? null, { ...x.player, name: x.me ? `${x.player.name ?? 'Toi'} (toi)` : x.player.name }, x.count > 1 ? `×${x.count}` : null, c)),
          'Aucun de tes amis ne l’a (ou leur collection est privée).'
        ),
        ...(r.holders
          ? []
          : section(
              `Vus avec cette carte${r.seen?.length ? ` · ${fmt(r.seen.length)}` : ''}`,
              (r.seen ?? []).map((x) => playerRow(x.serials[0] ?? null, x.player, h('small', { title: `Collection lue le ${new Date(x.seenAt).toLocaleString('fr-FR')}` }, `${x.count > 1 ? `×${x.count} · ` : ''}${timeAgo(x.seenAt)}`), c)),
              r.scanned
                ? `Aucun des ${fmt(r.scanned)} joueurs dont Aquaman a lu la collection ne l’a.`
                : 'Aquaman lit la collection des joueurs qui font un beau tirage : ils apparaîtront ici au fil du temps.'
            )),
        ...section(
          r.pulls.length
            ? `Tirée ${r.pulls.length} fois${r.pullsSince ? ` depuis le ${new Date(r.pullsSince).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''}`
            : 'Tirée récemment',
          r.pulls.map((x) => playerRow(x.serial, x.player, h('small', { title: new Date(x.at).toLocaleString('fr-FR') }, timeAgo(x.at)), c)),
          `Aucun tirage relevé${r.pullsSince ? ` depuis le ${new Date(r.pullsSince).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''} par les joueurs qui ont Aquaman (le jeu ne publie que les beaux tirages SSR, UR et SEC).`
        ),
        ...(r.holders ? [] : farther(c, n))
      );
    }

    // "Chercher parmi les joueurs vus récemment": their public collections, read a few at a time.
    function farther(c, n) {
      const list = h('ul', { class: 'aqm-owners' });
      const note = h('p', { class: 'aqm-muted', role: 'status' });
      const go = h('button', { type: 'button', class: 'aqm-album-btn is-main' }, '🔍 Chercher parmi les joueurs vus récemment');
      go.addEventListener('click', async () => {
        go.disabled = true;
        let players;
        try {
          players = (await ask({ type: 'known-players' })).players;
        } catch (e) {
          note.textContent = e.message;
          return;
        }
        let done = 0;
        let found = 0;
        let hidden = 0;
        for (let i = 0; i < players.length; i += 6) {
          if (n !== asked) return; // the player went elsewhere
          note.textContent = `${done}/${players.length} joueurs regardés · ${found} l’${found > 1 ? 'ont' : 'a'}…`;
          const part = players.slice(i, i + 6);
          const r = await ask({ type: 'owners-among', id: c.id, players: part }).catch(() => ({ found: [], hidden: part.length }));
          done += part.length;
          hidden += r.hidden;
          found += r.found.length;
          list.append(...r.found.map((x) => playerRow(x.serials[0] ?? null, x.player, x.count > 1 ? `×${x.count}` : null, c)));
        }
        go.hidden = true;
        note.textContent = players.length
          ? `${players.length} joueur${players.length > 1 ? 's' : ''} vu${players.length > 1 ? 's' : ''} récemment regardé${players.length > 1 ? 's' : ''} : ${found} l’${found > 1 ? 'ont' : 'a'}${hidden ? ` (${hidden} collection${hidden > 1 ? 's' : ''} privée${hidden > 1 ? 's' : ''} ou illisible${hidden > 1 ? 's' : ''})` : ''}.`
          : 'Aquaman n’a pas encore vu d’autres joueurs : il les découvre dans les beaux tirages, au fil du temps.';
      });
      return [h('p', { class: 'aqm-label aqm-who-gap' }, 'Chercher plus loin'), h('p', { class: 'aqm-muted' }, 'Aquaman peut regarder la collection publique des joueurs vus dans les beaux tirages relevés par tous les joueurs qui l’ont.'), go, note, list];
    }

    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(showSearch, 300);
    });
    if (typeof cardId === 'string') showCard(cardId);
    else showSearch();
  }

  // ---------- card page: "Qui a cette carte ?" under "Mes exemplaires" ----------

  const cardRarity = new Map(); // card id -> its rarity, or a promise while the game is asked

  function markCardWho() {
    const id = decodeURIComponent(location.pathname.match(/^\/jeu\/carte\/([^/]+)/)?.[1] ?? '');
    if (!id) return;
    const rarity = cardRarity.get(id);
    if (rarity === undefined) {
      cardRarity.set(
        id,
        ask({ type: 'card-rarity', id })
          .then((r) => cardRarity.set(id, r.rarity ?? ''))
          .catch(() => cardRarity.delete(id))
          .finally(schedule)
      );
      return;
    }
    if (typeof rarity !== 'string' || RANKED.indexOf(rarity) < RANKED.indexOf('SSR')) return;
    const label = elementsWithText(document.body, /^\s*mes exemplaires\s*$/i)[0];
    if (!label) return;
    // The panel under the title: its row of buttons ("Voir au marché", "Je la cherche"), or the panel itself.
    let section = label.parentElement;
    while (section && section !== document.body && section.textContent.trim().length <= label.textContent.trim().length + 5) section = section.parentElement;
    if (!section || section === document.body) return;
    const old = section.querySelector('.aqm-card-who');
    if (old?.dataset.card === id) return;
    old?.remove();
    const game = [...section.querySelectorAll('button, a')].find((b) => !b.closest('.aqm-root') && /^(voir au march[ée]|je la cherche|je ne la cherche plus)/i.test(b.textContent.trim()));
    const btn = h('button', { type: 'button', class: `aqm-root aqm-card-who${game ? '' : ' aqm-album-btn'}`, 'data-card': id }, h('span', { class: 'aqm-card-who-icon', html: ICON_SEARCH }), 'Qui a cette carte ?');
    // The look of the game's own dark button, when there is one beside it.
    const twin = [...section.querySelectorAll('button')].filter((b) => !b.closest('.aqm-root')).pop();
    if (game && twin) btn.className = `${twin.className} aqm-root aqm-card-who`;
    btn.addEventListener('click', () => openWhoHas(id));
    if (game) game.parentElement.append(btn);
    else section.append(h('div', { class: 'aqm-root aqm-card-who-row' }, btn));
    btn.dataset.card = id;
  }

  // ---------- the players who use Aquaman (the author only) ----------

  // The account logged in on this page, asked to the site itself (never a remembered one: the account may change).
  async function accountId() {
    try {
      const res = await pageFetch('/api/auth/check', { credentials: 'include', headers: { accept: 'application/json' } });
      return (await res.json())?.user?.id ?? null;
    } catch {
      return null;
    }
  }

  async function openUsers() {
    meId = await accountId();
    if (meId !== AUTHOR_ID) return; // reserved to the author's account, checked again on the site
    const body = openOverlay('Joueurs avec Aquaman', 'Les joueurs qui utilisent Aquaman : toi d’abord, puis la version la plus récente en premier et, à version égale, le plus récemment vu. Visible par toi seul.');
    body.parentElement.classList.add('aqm-panel-wide');
    const view = h('div');
    body.append(view);

    // What the author sees in the list of devices, "Brave · Windows" for instance.
    const deviceName = () => {
      const ua = navigator.userAgent;
      const browser = navigator.brave ? 'Brave' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) && !/Chrome\//.test(ua) ? 'Safari' : 'Chrome';
      const system = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'Linux';
      return `${browser} · ${system}`;
    };
    const showCode = (id) => `${id.slice(0, 4)}-${id.slice(4)}`;
    let polling = 0;

    // This device isn't approved yet: the owner's code once, or the approval from a device already approved.
    function approve(r) {
      const input = h('input', { type: 'password', class: 'aqm-search', placeholder: 'Code propriétaire', 'aria-label': 'Code propriétaire', autocomplete: 'off' });
      const go = h('button', { type: 'button', class: 'aqm-album-btn is-main' }, 'Approuver');
      const note = h('p', { class: 'aqm-muted', role: 'status' }, r.wrong ? 'Ce code n’est pas le bon.' : r.revoked ? 'Cet appareil a été révoqué.' : '');
      const submit = async () => {
        if (!input.value.trim()) return;
        go.disabled = true;
        const res = await ask({ type: 'admin-code', token: input.value.trim(), name: deviceName() }).catch((e) => ({ error: e.message }));
        go.disabled = false;
        if (res.wrong) note.textContent = 'Ce code n’est pas le bon.';
        else if (res.error) note.textContent = res.error;
        else load();
      };
      go.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
      const pending = r.device?.state === 'pending';
      const other = h('button', { type: 'button', class: 'aqm-album-btn' }, 'Demander l’approbation à un autre appareil');
      other.addEventListener('click', async () => {
        other.disabled = true;
        await ask({ type: 'admin-request', name: deviceName() }).catch(() => {});
        load();
      });
      view.replaceChildren(
        h('p', { class: 'aqm-note' }, 'Cet appareil n’est pas encore approuvé. Il ne l’est qu’une fois : ensuite, plus rien à faire.'),
        pending
          ? h(
              'div',
              { class: 'aqm-device-wait' },
              h('p', {}, 'Code de cet appareil : ', h('strong', {}, showCode(r.device.id))),
              h('p', { class: 'aqm-muted' }, 'Ouvre « Joueurs avec Aquaman » sur un appareil déjà approuvé et approuve celui qui porte ce code. Cette page se met à jour toute seule.')
            )
          : h('div', { class: 'aqm-pick' }, other),
        h('p', { class: 'aqm-label aqm-who-gap' }, pending ? 'Ou avec le code propriétaire' : 'Avec le code propriétaire (premier appareil)'),
        h('div', { class: 'aqm-pick aqm-users-code' }, input, go),
        note
      );
      clearTimeout(polling);
      if (pending) polling = setTimeout(() => body.isConnected && load(), 5000);
    }

    // The devices of the author: those waiting (approve or refuse), those approved (revoke).
    async function devices(box) {
      const r = await ask({ type: 'admin-devices' }).catch(() => null);
      if (!r?.devices) return;
      const { adminDevice: mine } = await chrome.storage.local.get('adminDevice');
      const act = (label, type, id, main) => {
        const btn = h('button', { type: 'button', class: `aqm-album-btn${main ? ' is-main' : ''}` }, label);
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          await ask({ type, id }).catch(() => {});
          devices(box);
        });
        return btn;
      };
      box.replaceChildren(
        h('p', { class: 'aqm-label aqm-who-gap' }, 'Mes appareils'),
        h(
          'ul',
          { class: 'aqm-users' },
          r.devices.map((d) =>
            h(
              'li',
              { class: 'aqm-user' },
              h('strong', { class: 'aqm-device-code' }, showCode(d.id)),
              h('span', { class: 'aqm-name' }, d.name || 'Appareil', d.id === mine?.id ? h('span', { class: 'aqm-tag' }, 'Cet appareil') : null),
              h('span', { class: 'aqm-muted' }, d.state === 'pending' ? 'En attente' : d.lastUsed ? `Utilisé ${timeAgo(d.lastUsed)}` : 'Approuvé'),
              d.state === 'pending' ? [act('Approuver', 'admin-approve', d.id, true), act('Refuser', 'admin-revoke', d.id)] : act('Révoquer', 'admin-revoke', d.id)
            )
          )
        )
      );
    }

    async function load() {
      clearTimeout(polling);
      view.replaceChildren(h('p', { class: 'aqm-note' }, 'Chargement…'));
      let r;
      try {
        r = await ask({ type: 'aquaman-users' });
      } catch (e) {
        view.replaceChildren(h('p', { class: 'aqm-note' }, e.message));
        return;
      }
      if (r.needDevice) return approve(r);
      show(r.users);
      const box = h('div');
      view.append(box);
      devices(box);
    }

    // Each kind of Aquaman of a player (both when they use the extension and the script).
    const kindsOf = (u) => (u.installs?.length ? u.installs : [{ kind: u.kind, version: u.version, lastSeen: u.lastSeen }]);
    const kindName = (kind) => (kind === 'userscript' ? 'Script' : kind === 'extension' ? 'Extension' : '?');
    // Seen in the last 15 minutes: Aquaman says hello every 10 minutes while a page of the game is open.
    const online = (u) => Date.now() - u.lastSeen < 15 * 60e3;

    // A version as a number to compare ("1.4.10" after "1.4.9"); 0 when unknown.
    const versionRank = (v) => (/^\d+\.\d+\.\d+$/.test(v ?? '') ? v.split('.').reduce((n, x) => n * 1000 + Number(x), 0) : 0);
    const bestVersion = (u) => Math.max(0, ...kindsOf(u).map((i) => versionRank(i.version)));

    function show(players) {
      // The author first, then the most recent version of Aquaman first, then the most recently seen.
      const all = [...players].sort((a, b) => (b.id === AUTHOR_ID) - (a.id === AUTHOR_ID) || bestVersion(b) - bestVersion(a) || b.lastSeen - a.lastSeen);
      const day = Date.now() - 86400e3;
      const week = Date.now() - 7 * 86400e3;
      const versions = {};
      for (const u of all) for (const i of kindsOf(u)) versions[i.version ?? '?'] = (versions[i.version ?? '?'] ?? 0) + 1;
      const using = (kind) => all.filter((u) => kindsOf(u).some((i) => i.kind === kind)).length;
      const stat = (label, value) => h('div', { class: 'aqm-metric' }, h('small', {}, label), h('strong', {}, value));
      const search = h('input', { type: 'search', class: 'aqm-search', placeholder: 'Chercher un joueur…', 'aria-label': 'Chercher un joueur' });
      const list = h('ul', { class: 'aqm-users' });
      const render = () => {
        const q = search.value.trim().toLowerCase();
        const shown = q ? all.filter((u) => String(u.name ?? '').toLowerCase().includes(q) || u.id.includes(q)) : all;
        list.replaceChildren(
          ...shown.map((u) =>
            h(
              'li',
              { class: 'aqm-user' },
              h('img', { class: 'aqm-avatar', src: avatarUrl(u.id), alt: '', loading: 'lazy' }),
              h('a', { class: 'aqm-name', href: `/profile/${encodeURIComponent(u.id)}` }, u.name || u.id),
              h(
                'span',
                { class: 'aqm-user-kinds' },
                kindsOf(u).map((i) =>
                  h(
                    'span',
                    { class: `aqm-tag aqm-kind-${i.kind ?? 'x'}`, title: `${kindName(i.kind)} vu${i.lastSeen ? ` ${timeAgo(i.lastSeen)}` : ''}` },
                    `${kindName(i.kind)}${i.version ? ` v${i.version}` : ''}`
                  )
                )
              ),
              u.revoked ? h('span', { class: 'aqm-tag aqm-revoked' }, 'Révoqué') : online(u) ? h('span', { class: 'aqm-tag aqm-online' }, 'En ligne') : h('span'),
              h('span', { class: 'aqm-user-seen', title: `Vu la première fois le ${new Date(u.firstSeen).toLocaleDateString('fr-FR')}` }, timeAgo(u.lastSeen)),
              u.id === AUTHOR_ID ? null : revokeButton(u)
            )
          )
        );
      };
      // Takes Aquaman back from a player (it stops on their side within a minute), or gives it back.
      const revokeButton = (u) => {
        const btn = h('button', { type: 'button', class: 'aqm-album-btn aqm-user-revoke' }, u.revoked ? 'Rétablir' : 'Révoquer');
        btn.addEventListener('click', async () => {
          const name = u.name || u.id;
          if (!u.revoked && !confirm(`Révoquer Aquaman pour ${name} ? Il s’arrêtera chez ce joueur dans la minute, jusqu’à ce que tu le rétablisses.`)) return;
          btn.disabled = true;
          const res = await ask({ type: 'admin-revoke-player', id: u.id, revoked: !u.revoked }).catch((e) => ({ error: e.message }));
          if (res?.needDevice) return load();
          if (res?.ok) u.revoked = !u.revoked;
          render();
        });
        return btn;
      };
      search.addEventListener('input', render);
      view.replaceChildren(
        h(
          'div',
          { class: 'aqm-who-stats aqm-users-stats' },
          stat('Joueurs', fmt(all.length)),
          stat('En ligne', fmt(all.filter(online).length)),
          stat('Vus ces 24 h', fmt(all.filter((u) => u.lastSeen >= day).length)),
          stat('Vus ces 7 jours', fmt(all.filter((u) => u.lastSeen >= week).length)),
          stat('Extension / script', `${fmt(using('extension'))} / ${fmt(using('userscript'))}`)
        ),
        h(
          'p',
          { class: 'aqm-note' },
          'Versions : ',
          Object.entries(versions)
            .sort((a, b) => versionRank(b[0]) - versionRank(a[0]) || b[1] - a[1])
            .map(([v, n]) => `${v === '?' ? 'inconnue' : v} (${n})`)
            .join(', '),
          '.'
        ),
        h('div', { class: 'aqm-pick' }, search),
        list
      );
      render();
    }

    load();
  }

  // ---------- favourite series ----------

  let favIds = null; // ids of the favourite series, for the stars of the Collection page
  let seriesBySlug = null; // slug -> id, from the game's series
  let seriesTitles = null; // id -> title in lower case, from the game's series (the market's "Favoris" filter)

  // Reads the favourites (fresh: with the changes made on the other devices right now) and repaints the stars.
  async function loadFavIds(fresh = false) {
    const res = await send({ type: 'favorites', fresh });
    if (!res || res.error) return;
    favIds = new Set(res.favorites.map((s) => s.id));
    seriesBySlug = new Map(res.all.map((s) => [s.slug, s.id]));
    seriesTitles = new Map(res.all.map((s) => [s.id, String(s.title ?? '').trim().toLowerCase()]));
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
    // The buttons come at once with the strip; only the stars wait for the series (their count shows "…" until then).
    if (!seriesBySlug && !favLoading) {
      favLoading = true;
      loadFavIds().finally(() => {
        favLoading = false;
        schedule();
      });
    }
    if (!strip.previousElementSibling?.classList.contains('aqm-fav-bar'))
      strip.before(
        h(
          'div',
          { class: 'aqm-root aqm-fav-bar' },
          h('button', { type: 'button', class: 'aqm-chip aqm-fav-open', onclick: openFavorites }, '★ Favoris ', h('b', {}, favIds ? String(favIds.size) : '…')),
          h('button', {
            type: 'button',
            class: 'aqm-chip aqm-sort-progress',
            'aria-pressed': 'false',
            onclick: () => {
              setByProgress(!byProgress);
              sortByProgress(strip);
              strip.scrollTo?.({ left: 0, behavior: 'smooth' });
            },
            title: 'Les séries où il te manque le moins de cartes en premier'
          }, 'Les plus avancées'),
          h('button', {
            type: 'button',
            class: 'aqm-chip aqm-sort-progress aqm-small-series',
            'aria-pressed': 'false',
            onclick: () => {
              setSmallOnly(!smallOnly);
              sortByProgress(strip);
              strip.scrollTo?.({ left: 0, behavior: 'smooth' });
            },
            title: `Masquer les séries de ${SMALL_SERIES} personnages ou moins`
          }, `Masquer séries <= ${SMALL_SERIES} persos`)
        )
      );
    sortByProgress(strip);
    keepStripPlace(strip);
    if (!seriesBySlug) return;
    for (const img of strip.querySelectorAll('img[src*="/api/covers/"]')) {
      const tile = img.closest('button, a, [role="radio"]') ?? img.parentElement;
      if (!tile || tile.querySelector(':scope > .aqm-star')) continue;
      anchorBadges(tile);
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
      tile.append(star);
    }
  }

  // The series of the strip from the fewest missing cards to the most (their "15/29": 14 missing), the complete ones
  // last; "Toutes les séries" stays first. Only the order they are shown in changes (CSS order): the game's own
  // order is kept.
  // A series completed during the visit (its count reached its total): the strip is sorted so and shown from its
  // start, the series left to complete first.
  // Kept for the tab: back from a character's page, the strip is sorted the same way and shown at the same place.
  const BY_PROGRESS_KEY = 'aqm-by-progress';
  const STRIP_LEFT_KEY = 'aqm-strip-left';
  let byProgress = (() => {
    try {
      return sessionStorage.getItem(BY_PROGRESS_KEY) === '1';
    } catch {
      return false;
    }
  })();
  // "Masquer séries <= 5 persos": the series of at most SMALL_SERIES cards are hidden (kept for the tab too).
  const SMALL_SERIES = 5;
  const SMALL_ONLY_KEY = 'aqm-small-series';
  let smallOnly = (() => {
    try {
      return sessionStorage.getItem(SMALL_ONLY_KEY) === '1';
    } catch {
      return false;
    }
  })();
  function setSmallOnly(on) {
    smallOnly = on;
    try {
      on ? sessionStorage.setItem(SMALL_ONLY_KEY, '1') : sessionStorage.removeItem(SMALL_ONLY_KEY);
    } catch {}
  }
  function setByProgress(on) {
    byProgress = on;
    try {
      on ? sessionStorage.setItem(BY_PROGRESS_KEY, '1') : sessionStorage.removeItem(BY_PROGRESS_KEY);
    } catch {}
  }

  // The strip drawn by the game (again, after a change of page) is scrolled back to where the player left it, then
  // its place is kept as it scrolls.
  const placedStrips = new WeakSet();
  let placedVisit = -1; // the visit of the collection whose strip was put back in place
  function keepStripPlace(strip) {
    if (placedStrips.has(strip)) return;
    placedStrips.add(strip);
    // (the strip scrolls itself, else the box around it does)
    const around = [strip, strip.parentElement, strip.parentElement?.parentElement].find((el) => el && /(auto|scroll)/.test(getComputedStyle(el).overflowX));
    if (around && around !== strip) strip = around;
    let left = null;
    try {
      const kept = sessionStorage.getItem(STRIP_LEFT_KEY);
      if (kept != null) left = Number(kept) || 0;
    } catch {}
    // The game scrolls to the selected series in its own order (once, or smoothly, a moment after it draws the strip):
    // for 1.5 s the strip is put back each frame, until the player scrolls it. Without a place kept, the selected
    // series is shown where the sorting put it.
    // Only once a visit of the page: the strip the game draws again when another series is chosen is left to the
    // game's own scroll (put back each frame, it jerked between the two).
    let placing = placedVisit !== pageVisit;
    placedVisit = pageVisit;
    const until = Date.now() + 1500;
    const stop = () => (placing = false);
    for (const type of ['wheel', 'pointerdown', 'touchstart', 'keydown']) strip.addEventListener(type, stop, { passive: true, once: true });
    const place = () => {
      if (!placing || !strip.isConnected || Date.now() > until) return void (placing = false);
      if (left != null) {
        if (Math.abs(strip.scrollLeft - left) > 2) strip.scrollLeft = left;
      } else if (byProgress) {
        const picked = strip.querySelector('[aria-checked="true"]');
        if (picked) {
          const [p, s] = [picked.getBoundingClientRect(), strip.getBoundingClientRect()];
          const want = Math.max(0, Math.round(strip.scrollLeft + p.left - s.left - (strip.clientWidth - p.width) / 2));
          if (Math.abs(strip.scrollLeft - want) > 2) strip.scrollLeft = want;
        }
      }
      requestAnimationFrame(place);
    };
    if (placing) requestAnimationFrame(place);
    let timer = 0;
    strip.addEventListener(
      'scroll',
      () => {
        if (placing) return; // (the game's scroll, or Aquaman's: not the player's place)
        clearTimeout(timer);
        timer = setTimeout(() => {
          try {
            sessionStorage.setItem(STRIP_LEFT_KEY, String(Math.round(strip.scrollLeft)));
          } catch {}
        }, 150);
      },
      { passive: true }
    );
  }
  // series (its text without the count) -> missing cards last seen; kept for the tab (a purchase may load the page
  // again before the player comes back to the collection)
  const missingSeen = new Map(
    (() => {
      try {
        return Object.entries(JSON.parse(sessionStorage.getItem('aqm-missing-seen') || '{}'));
      } catch {
        return [];
      }
    })()
  );
  let missingSaved = '';
  function sortByProgress(strip) {
    const items = [...strip.children].filter((el) => !el.classList.contains('aqm-root'));
    const count = (el) => {
      const m = el.textContent.match(/(\d[\d  ]*)\s*\/\s*(\d[\d  ]*)/); // (a title's own figures are apart)
      if (!m) return null;
      const [owned, total] = [m[1], m[2]].map((x) => Number(x.replace(/\D/g, '')));
      return total ? { missing: Math.max(0, total - owned), rate: owned / total, total } : null;
    };
    const rows = items.map((el, i) => ({ el, i, c: count(el), all: /toutes les s[ée]ries/i.test(el.textContent) }));
    let completed = false;
    for (const { el, c, all } of rows) {
      if (!c || all) continue;
      const key = el.textContent.replace(/\d[\d  ]*\s*\/\s*\d[\d  ]*/, '').trim();
      if (missingSeen.get(key) > 0 && c.missing === 0) completed = true;
      missingSeen.set(key, c.missing);
    }
    if (completed) setByProgress(true);
    const seen = JSON.stringify(Object.fromEntries(missingSeen));
    if (seen !== missingSaved) {
      missingSaved = seen;
      try {
        sessionStorage.setItem('aqm-missing-seen', seen);
      } catch {}
    }
    const chip = strip.previousElementSibling?.querySelector('.aqm-sort-progress:not(.aqm-small-series)');
    chip?.classList.toggle('is-on', byProgress);
    chip?.setAttribute('aria-pressed', String(byProgress));
    const small = strip.previousElementSibling?.querySelector('.aqm-small-series');
    small?.classList.toggle('is-on', smallOnly);
    small?.setAttribute('aria-pressed', String(smallOnly));
    // Hidden: the small series. "Toutes les séries", the series shown and those without a count stay.
    for (const { el, c, all } of rows) {
      const hide = smallOnly && !all && c && c.total <= SMALL_SERIES && el.getAttribute('aria-checked') !== 'true' && !el.querySelector('[aria-checked="true"]');
      const display = hide ? 'none' : '';
      if (el.style.display !== display) el.style.display = display;
    }
    const ranked = rows
      .sort(
        (a, b) =>
          b.all - a.all ||
          !a.c - !b.c ||
          (a.c?.missing === 0) - (b.c?.missing === 0) ||
          (a.c?.missing ?? 0) - (b.c?.missing ?? 0) ||
          (b.c?.rate ?? 0) - (a.c?.rate ?? 0) ||
          a.i - b.i
      );
    ranked.forEach(({ el }, n) => {
      const order = byProgress ? String(n) : '';
      if (el.style.order !== order) el.style.order = order;
    });
    if (completed) strip.scrollTo?.({ left: 0, behavior: 'smooth' });
  }

  // ---------- "Recycler des cartes": nothing ticked at first, and a button to tick everything ----------

  const RECYCLE_TITLE = /^recycler des cartes$/i;
  const recycleSeen = new WeakSet(); // rows already unticked once
  let recycleOpened = 0; // when the window was found open

  // The tick box of a row: a real one, else the small square drawn before the card's picture.
  function tickBox(row) {
    const known = row.querySelector('input[type="checkbox"], [role="checkbox"], [aria-checked]');
    if (known) return known;
    const img = row.querySelector('img');
    for (const el of row.querySelectorAll('*')) {
      if (el.contains(img) || !(el.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const r = el.getBoundingClientRect();
      if (r.width >= 12 && r.width <= 32 && Math.abs(r.width - r.height) <= 4) return el;
    }
    return null;
  }

  // A drawn box is ticked when its ✓ shows (an unticked one may keep it hidden).
  function isTicked(box) {
    if (box.tagName === 'INPUT') return box.checked;
    const said = box.getAttribute('aria-checked') ?? (box.hasAttribute('data-state') ? String(box.getAttribute('data-state') === 'checked') : null);
    if (said != null) return said === 'true';
    const svg = box.querySelector('svg');
    if (!svg) return false;
    const r = svg.getBoundingClientRect();
    const cs = getComputedStyle(svg);
    return r.width > 0 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.1 && cs.color !== 'rgba(0, 0, 0, 0)';
  }

  // The number of cards ticked, from the game's "Recycler N · +X" button (just "Recycler" with none); null if unknown.
  function recycleCount(dialog) {
    const b = [...dialog.querySelectorAll('button')].find((x) => !x.closest('.aqm-root') && /^recycler\b/i.test(x.textContent.trim()));
    return b ? Number(b.textContent.trim().match(/^recycler\s+([\d\s  ]+)/i)?.[1]?.replace(/\s/g, '') || 0) : null;
  }

  // The window and its rows (one per card: its picture and its number), each with its tick box.
  function recycleParts() {
    const title = [...document.querySelectorAll('h1, h2, h3')].find((t) => !t.closest('.aqm-root') && RECYCLE_TITLE.test(t.textContent.trim()));
    const dialog = title?.closest('[role="dialog"]') ?? title?.parentElement?.parentElement?.parentElement;
    if (!dialog) return null;
    const rows = [];
    for (const img of dialog.querySelectorAll('img')) {
      let row = img;
      while (row.parentElement && row.parentElement !== dialog && row.parentElement.querySelectorAll('img').length === 1) row = row.parentElement;
      const box = row !== img && /#\s?\d+/.test(row.textContent) ? tickBox(row) : null;
      if (box) rows.push({ row, box });
    }
    return { dialog, rows };
  }

  function markRecycleDialog() {
    if (!location.pathname.startsWith('/jeu')) return;
    const parts = recycleParts();
    if (!parts) return void (recycleOpened = 0);
    if (!recycleOpened) recycleOpened = Date.now();
    const { dialog, rows } = parts;
    if (!rows.length) return;
    // The rows drawn in the first seconds start unticked; later, the player's choices stay.
    for (const { row, box } of rows) {
      if (recycleSeen.has(row)) continue;
      recycleSeen.add(row);
      if (Date.now() - recycleOpened < 3000 && isTicked(box)) box.click();
    }
    let btn = dialog.querySelector('.aqm-recycle-all');
    if (!btn) {
      btn = h('button', { type: 'button', class: 'aqm-queue-btn aqm-recycle-all', onclick: toggleRecycle });
      rows[0].row.parentElement.before(h('div', { class: 'aqm-root aqm-recycle-bar' }, btn));
    }
    const count = recycleCount(dialog);
    const all = count != null ? count > 0 && count >= rows.length : rows.every((r) => isTicked(r.box));
    const label = all ? 'Tout désélectionner' : `Tout sélectionner (${rows.length})`;
    if (btn.textContent !== label) btn.textContent = label;
  }

  // Ticks every row, or unticks them all when they all are.
  function toggleRecycle() {
    const parts = recycleParts();
    if (!parts) return;
    // With the game's count: none or all ticked, every row changes; in between, the unticked ones.
    const count = recycleCount(parts.dialog);
    const all = count != null ? count > 0 && count >= parts.rows.length : parts.rows.every((r) => isTicked(r.box));
    if (count === 0 || all) for (const r of parts.rows) r.box.click();
    else for (const r of parts.rows) if (!isTicked(r.box)) r.box.click();
    setTimeout(markRecycleDialog, 50);
  }

  // ---------- a card's page: its 5 cheapest offers on the market ----------
  // Under the game's "Cote" panel: the offers from the cheapest to the dearest, each with its seller and number.

  let listingsFor = null; // the card whose offers are shown (or being read)
  function markCardListings() {
    const id = location.pathname.match(/^\/jeu\/carte\/([^/?#]+)/)?.[1];
    const box = document.querySelector('.aqm-listings');
    if (!id) return void box?.remove();
    const cote = [...document.querySelectorAll('p, span, h2, h3, div')].find((el) => !el.closest('.aqm-root') && !el.childElementCount && /^cote$/i.test(el.textContent.trim()));
    // The panel of the "Cote": the highest box around its title that holds no other panel's title.
    let panel = cote;
    while (panel?.parentElement && !/mes exemplaires/i.test(panel.parentElement.textContent)) panel = panel.parentElement;
    if (!panel || panel === cote) return;
    if (box?.dataset.card === id && box.previousElementSibling === panel) return;
    if (listingsFor === id && box) return;
    box?.remove();
    listingsFor = id;
    const fresh = h('section', { class: 'aqm-root aqm-listings', 'data-card': id }, h('p', { class: 'aqm-label' }, 'En vente au marché'), h('p', { class: 'aqm-muted' }, 'Lecture des offres…'));
    panel.after(fresh);
    showListings(fresh, decodeURIComponent(id), false);
  }

  // The offers in their box, from the cheapest to the dearest, each with its seller, its number and a button to buy
  // it (not the player's own); read again after a purchase.
  function showListings(fresh, cardId, again) {
    ask({ type: 'card-listings', id: cardId, fresh: again })
      .then((r) => {
        if (!fresh.isConnected) return;
        const rows = r.offers.map((o) =>
          playerRow(
            o.serial,
            o.player,
            h('span', { class: 'aqm-buy-cell' }, perles(o.price), o.id && o.player?.id !== meId ? buyButton(o, fresh, cardId) : null),
            { maxCopies: r.maxCopies }
          )
        );
        fresh.replaceChildren(
          h('div', { class: 'aqm-listings-head' },
            h('p', { class: 'aqm-label' }, 'En vente au marché'),
            h('small', { class: 'aqm-muted' }, r.count ? `${r.count > 5 ? `5 moins chères sur ${fmt(r.count)}` : `${r.count} offre${r.count > 1 ? 's' : ''}`}, de la moins chère à la plus chère` : '')),
          rows.length ? h('ul', { class: 'aqm-owners' }, rows) : h('p', { class: 'aqm-muted' }, 'Personne ne la vend pour le moment.'),
          ...auctionsPart(r.auctions, r.maxCopies)
        );
      })
      .catch((e) => fresh.isConnected && fresh.replaceChildren(h('p', { class: 'aqm-label' }, 'En vente au marché'), h('p', { class: 'aqm-muted' }, e.message)));
  }

  // Time left before the end of an auction: "2 j 4 h", "3 h 12 min", "8 min".
  function timeLeft(at) {
    const m = Math.max(1, Math.round((at - Date.now()) / 60e3));
    if (m < 60) return `${m} min`;
    if (m < 1440) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
    return `${Math.floor(m / 1440)} j${Math.floor((m % 1440) / 60) ? ` ${Math.floor((m % 1440) / 60)} h` : ''}`;
  }

  // Under the offers, the card's 3 running auctions with the lowest bids, the lowest first: the bid to beat, the
  // time left and a button to the auction's page.
  // Nothing when they couldn't be read (null).
  function auctionsPart(auctions, maxCopies) {
    if (!auctions) return [];
    const rows = auctions.slice(0, 3).map((a) =>
      playerRow(
        a.serial,
        a.player,
        h(
          'span',
          { class: 'aqm-buy-cell' },
          h('span', { class: 'aqm-auction-cell' }, perles(a.bid), h('small', { class: 'aqm-muted' }, [a.bids != null ? `${a.bids} enchère${a.bids > 1 ? 's' : ''}` : null, a.endsAt ? `fin dans ${timeLeft(a.endsAt)}` : null].filter(Boolean).join(' · '))),
          // The auction's page in the game (/jeu/encheres/:id), where the player bids.
          a.id ? h('a', { class: 'aqm-queue-btn is-main aqm-buy', href: `/jeu/encheres/${encodeURIComponent(a.id)}` }, a.player?.id === meId ? 'Voir' : 'Enchérir') : null
        ),
        { maxCopies }
      )
    );
    return [
      h('div', { class: 'aqm-listings-head aqm-auctions-head' },
        h('p', { class: 'aqm-label' }, 'Aux enchères'),
        h('small', { class: 'aqm-muted' }, auctions.length ? `${auctions.length > 3 ? `3 mises les plus faibles sur ${fmt(auctions.length)}` : `${auctions.length} en cours`}, de la plus faible à la plus haute` : '')),
      rows.length ? h('ul', { class: 'aqm-owners' }, rows) : h('p', { class: 'aqm-muted' }, 'Aucune enchère en cours.')
    ];
  }

  // What the game's "Mes exemplaires" panel of the card says (to see whether it changed).
  function myCopiesText() {
    const label = [...document.querySelectorAll('p, span, h2, h3, div')].find((el) => !el.closest('.aqm-root') && !el.childElementCount && /^mes exemplaires$/i.test(el.textContent.trim()));
    // (the box around the title that also holds the panel's text)
    let box = label;
    while (box?.parentElement && box.textContent.trim().length <= (label?.textContent.trim().length ?? 0) + 5) box = box.parentElement;
    return box?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  }

  // Buys an offer at once, as the game's market does; the offers are read again afterwards.
  function buyButton(offer, box, cardId) {
    const btn = h('button', { type: 'button', class: 'aqm-queue-btn is-main aqm-buy' }, 'Acheter');
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = 'Achat…';
      try {
        const bought = await gameWrite(`/market/listings/${encodeURIComponent(offer.id)}/buy`, 'POST');
        btn.textContent = '✅ Achetée';
        if (offer.card?.name) addBought(offer.card.name, offer.card.rarity); // its other sales, hidden on the market
        owned = null;
        send({ type: 'collection-stale' });
        // The game's Perles and the card's copies ("Mes exemplaires") read again from the API and given to the page:
        // it is never loaded again (it lost the player's place). Once more if the copies still show the same after 2 s.
        const perles = bought?.perles ?? bought?.balance ?? bought?.buyer?.perles;
        const before = myCopiesText();
        const refresh = () => window.postMessage({ aquamanCmd: 'reload-game', cardId, perles: typeof perles === 'number' ? perles : undefined }, location.origin);
        refresh();
        setTimeout(() => myCopiesText() === before && refresh(), 2000);
        setTimeout(() => box.isConnected && showListings(box, cardId, true), 1200);
      } catch (e) {
        // The game's refusal under the offers (no Perles enough, the offer gone…), then the offers read again.
        btn.textContent = 'Refusé';
        btn.title = e.message;
        box.append(h('p', { class: 'aqm-muted aqm-buy-refused' }, `Achat refusé par le jeu : ${e.message}`));
        setTimeout(() => box.isConnected && showListings(box, cardId, true), 2500);
      }
    });
    return btn;
  }

  // ---------- collection: a "Manquantes" tab beside "Mes cartes / Mes doublons / Album complet" ----------
  // It shows the full album with only the cards marked "Manquante" by the game; the choice is kept for the tab.

  // Off at every visit (never kept: on "Mes cartes" it would hide every card), and only with "Album complet".
  const VIEW_TABS = /^(mes cartes|mes doublons|album complet)$/i;
  let missingOn = false;
  let missingAt = 0; // when it was turned on: the game takes a moment to show "Album complet"
  const missingOnly = () => missingOn;
  const setMissingOnly = (on) => {
    missingOn = on;
    missingAt = on ? Date.now() : 0;
    filteredSize = -1;
  };

  // A tab of the game chosen by the player: the filter stops.
  let clickingFull = false;
  addEventListener(
    'click',
    (e) => {
      const b = e.target.closest?.('button');
      if (!b || clickingFull || b.closest('.aqm-root') || b.classList.contains('aqm-missing-tab') || !VIEW_TABS.test(b.textContent.trim())) return;
      setMissingOnly(false);
      setTimeout(markMissingTab, 50);
    },
    true
  );

  function markMissingTab() {
    if (!location.pathname.startsWith('/jeu/collection')) return;
    const tabs = [...document.querySelectorAll('button')].filter((b) => !b.closest('.aqm-root') && VIEW_TABS.test(b.textContent.trim()));
    const full = tabs.find((b) => /^album complet$/i.test(b.textContent.trim()));
    if (!full) return;
    // The game's selected tab is the one whose look differs from the others.
    const looks = tabs.map((b) => b.className);
    const selected = tabs.find((b) => looks.filter((c) => c === b.className).length === 1 && tabs.length > 2) ?? full;
    if (missingOn && selected !== full && Date.now() - missingAt > 2000) setMissingOnly(false); // another view of the game
    const on = missingOnly();
    const plain = tabs.find((b) => b !== selected) ?? full;
    let tab = full.parentElement.querySelector(':scope > .aqm-missing-tab');
    if (!tab) {
      tab = h('button', {
        type: 'button',
        onclick: () => {
          const now = !missingOnly();
          setMissingOnly(now);
          if (now && selected !== full) {
            clickingFull = true; // not a choice of the player: the filter stays
            full.click();
            clickingFull = false;
          }
          markMissingTab();
        }
      });
      full.after(tab);
    }
    // The game shows its selected tab with a pill inside it (a box set over the tab): while the filter is on, the pill
    // of "Album complet" is hidden and "Manquantes" gets one like it.
    const pill = [...full.querySelectorAll('*')].find((el) => getComputedStyle(el).position === 'absolute');
    // (or the tab's own background, when the game colours the button itself)
    const source = pill ?? (selected === full && !on ? full : null);
    if (source && !pillLook) {
      const cs = getComputedStyle(source);
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none')
        pillLook = { background: cs.backgroundImage !== 'none' ? cs.backgroundImage : cs.backgroundColor, radius: cs.borderRadius, shadow: cs.boxShadow };
    }
    if (!plainColor) plainColor = getComputedStyle(plain).color;
    if (!pickedColor && selected === full && !on) pickedColor = getComputedStyle(full).color;
    pill?.toggleAttribute('data-aqm-pill-off', on);
    full.toggleAttribute('data-aqm-unpicked', on);
    full.style.setProperty('--aqm-plain-color', plainColor);
    const look = `${plain.className} aqm-missing-tab${on ? ' is-on' : ''}`;
    if (tab.className !== look) tab.className = look;
    tab.style.setProperty('--aqm-pill-bg', pillLook?.background || 'rgba(255, 255, 255, 0.12)');
    tab.style.setProperty('--aqm-pill-radius', pillLook?.radius || '999px');
    tab.style.setProperty('--aqm-pill-shadow', pillLook?.shadow && pillLook.shadow !== 'none' ? pillLook.shadow : 'none');
    tab.style.setProperty('--aqm-picked-color', pickedColor || '#fff');
    if (tab.textContent !== 'Manquantes') tab.textContent = 'Manquantes';
    tab.setAttribute('aria-pressed', String(on));
    filterMissing(on);
  }
  let pillLook = null; // the game's pill of the selected tab: its colour, its rounding, its shadow
  let plainColor = '';
  let pickedColor = '';

  // Hides the cards of the album that the player has (their label is "× N"), and the series left with none.
  // Done again only when the page's content changed (its number of elements), the album can hold thousands of cards.
  let filteredSize = -1;
  function filterMissing(on) {
    if (!on) {
      if (filteredSize !== -1 || document.querySelector('[data-aqm-owned-card]')) document.querySelectorAll('[data-aqm-owned-card]').forEach((el) => el.removeAttribute('data-aqm-owned-card'));
      filteredSize = -1;
      return;
    }
    const size = (document.querySelector('main') ?? document.body).getElementsByTagName('*').length;
    if (size === filteredSize) return;
    filteredSize = size;
    // The label under each card: "Manquante", or "× 1" (maybe in several pieces of text): the innermost element
    // whose whole text says it.
    const LABEL = /^(manquante|[×x]\s*\d+)$/i;
    const says = (el) => LABEL.test(el.textContent.replace(/\s+/g, ' ').trim());
    const page = document.querySelector('main') ?? document.body;
    const labels = [...page.querySelectorAll('*')].filter((el) => el.childElementCount < 4 && !el.closest('.aqm-root') && says(el) && ![...el.children].some(says));
    // How many labels each box holds, to find each card's tile: the highest box around its label holding no other,
    // inside the page. A label alone (a series of one card shown) is held alone by every box up to the page: its tile
    // is then the box around its picture, with the boxes wrapping only it.
    const held = new Map();
    for (const label of labels) for (let el = label; el; el = el.parentElement) held.set(el, (held.get(el) ?? 0) + 1);
    document.querySelectorAll('[data-aqm-owned-card]').forEach((el) => el.removeAttribute('data-aqm-owned-card'));
    for (const label of labels) {
      let tile = label;
      for (let up = tile.parentElement; up && up !== page && held.get(up) === 1; up = tile.parentElement) {
        if (labels.length === 1 && tile.querySelector('img') && up.childElementCount > 1) break;
        tile = up;
      }
      // (a label alone, not a card: no picture)
      tile.toggleAttribute('data-aqm-owned-card', tile !== label && !!tile.querySelector('img') && !/^manquante$/i.test(label.textContent.trim()));
    }
  }

  // ---------- collection: "En vente" beside each missing card that someone sells ----------
  // The market is read for the missing cards near the screen only, two at a time; a card's answer is kept 2 minutes.

  const saleOf = new Map(); // card picture -> { at, read: Promise<{ id, name, count } | null> }
  let saleWatch = null;
  function markMissingSales() {
    if (!location.pathname.startsWith('/jeu/collection')) return;
    saleWatch ??= new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          saleWatch.unobserve(e.target);
          showSale(e.target);
        }
      },
      { rootMargin: '300px' }
    );
    for (const el of elementsWithText(document.body, /^\s*manquante\s*$/i)) {
      if (el.childElementCount || el.hasAttribute('data-aqm-sale') || !/^manquante$/i.test(el.textContent.trim())) continue;
      el.setAttribute('data-aqm-sale', '');
      saleWatch.observe(el);
    }
  }

  let salesReading = 0;
  const salesWaiting = [];
  function readSale(ask) {
    return new Promise((resolve, reject) => {
      salesWaiting.push(() => ask().then(resolve, reject));
      nextSale();
    });
  }
  function nextSale() {
    while (salesReading < 2 && salesWaiting.length) {
      salesReading++;
      salesWaiting
        .shift()()
        .finally(() => {
          salesReading--;
          nextSale();
        });
    }
  }

  async function showSale(label) {
    // The card's tile: the closest box around the label with its picture.
    let tile = label.parentElement;
    for (let up = 0; tile && up < 6 && !tile.querySelector('img'); up++) tile = tile.parentElement;
    const img = tile?.querySelector('img');
    const image = imageKey(img?.currentSrc || img?.getAttribute('src'));
    if (!image) return;
    const link = tile.querySelector('a[href*="/jeu/carte/"]') ?? tile.closest('a[href*="/jeu/carte/"]');
    const id = link?.getAttribute('href').match(/\/jeu\/carte\/([^/?#]+)/)?.[1];
    let sale = saleOf.get(image);
    if (!sale || Date.now() - sale.at > 120e3) {
      const series = new URLSearchParams(location.search).get('serie');
      sale = { at: Date.now(), read: readSale(() => ask({ type: 'card-sale', id: id ? decodeURIComponent(id) : null, image, name: img.alt?.trim() || null, series })) };
      saleOf.set(image, sale);
    }
    const r = await sale.read.catch(() => null);
    if (!r?.count || !label.isConnected || label.nextElementSibling?.classList.contains('aqm-sale')) return;
    // Only a sign: a click goes through to the game's card.
    const offers = `En vente : ${r.count} offre${r.count > 1 ? 's' : ''} au marché`;
    label.after(h('span', { class: 'aqm-root aqm-sale', title: offers }, 'En vente'));
    label.setAttribute('data-aqm-sale', 'on');
  }

  // ---------- collection: favourite and search buttons in the "Album de la série" panel ----------

  let albumBusy = false;

  function markAlbum() {
    if (!location.pathname.startsWith('/jeu/collection')) return;
    const id = new URLSearchParams(location.search).get('serie');
    const title = document.getElementById('album-title');
    if (!id || !title || albumBusy) return;
    const panel = title.closest('section') ?? title.parentElement?.parentElement;
    if (!panel || panel.closest('.aqm-root')) return;
    const box = panel.querySelector(':scope > .aqm-album');
    if (box?.dataset.series === id) return;
    box?.remove();
    const fresh = h('div', { class: 'aqm-root aqm-album', 'data-series': id });
    panel.append(fresh);
    renderAlbum(fresh, id);
  }

  async function renderAlbum(box, id) {
    albumBusy = true;
    let st;
    try {
      st = await ask({ type: 'series-status', id });
    } catch {
      box.remove();
      return;
    } finally {
      albumBusy = false;
    }
    if (!box.isConnected) return;
    const note = h('span', { class: 'aqm-album-note', role: 'status' });
    const fav = h('button', { type: 'button', class: 'aqm-album-btn' });
    const paintFav = () => {
      fav.classList.toggle('is-on', st.favorite);
      fav.textContent = st.favorite ? '★ Dans tes favoris' : '☆ Ajouter aux favoris';
      fav.title = st.favorite ? 'Retirer des séries favorites' : 'Ajouter aux séries favorites (Plus → Séries favorites)';
    };
    fav.addEventListener('click', async () => {
      fav.disabled = true;
      await toggleFavorite(id, !st.favorite);
      st.favorite = !st.favorite;
      paintFav();
      fav.disabled = false;
    });
    paintFav();
    const want = h('button', { type: 'button', class: 'aqm-album-btn is-main' });
    const paintWant = () => {
      want.hidden = !st.missing;
      want.disabled = !st.toWant;
      want.textContent = st.toWant > 1 ? `🔭 Rechercher les ${st.toWant} manquantes` : st.toWant ? '🔭 Rechercher la manquante' : '🔭 Toutes les manquantes sont recherchées';
      want.title = 'Les mettre dans ta liste de recherches : le jeu te prévient quand elles sont mises en vente';
    };
    want.addEventListener('click', async () => {
      want.disabled = true;
      const r = await enqueueWants(st.toWantIds);
      st.toWantIds = [];
      st.toWant = 0;
      paintWant();
      want.textContent = r.sent == null ? '🔭 En attente dans Aquaman' : '🔭 Recherche en cours…';
      note.textContent = wantsNote(r, 'tu peux changer de page ou ouvrir des boosters');
    });
    paintWant();
    // (no progress of the waiting cards here: drawn again at each series, it made the page jump; it stays at the
    // bottom of the screen and in "Séries favorites")
    box.replaceChildren(fav, want, note);
  }

  async function openFavorites() {
    const body = openOverlay('Séries favorites', 'Les personnages de tes séries favorites : ceux que tu as, ceux qui te manquent, et ta liste de recherches du jeu.');
    body.parentElement.classList.add('aqm-panel-wide');
    const status = h('p', { class: 'aqm-note' }, 'Chargement de tes séries…');
    body.append(status);
    let report;
    let show = 'missing';
    const opened = new Set(); // series whose cards are shown ("Détails")
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
    // Once an adding ended or the waiting cards were taken out, the series show what is left to search.
    filters.before(
      searchPanel(async () => {
        fresh = true;
        try {
          await load();
        } catch {}
        render();
      })
    );

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
          const toWantIds = missing.filter((c) => !c.wanted).map((c) => c.id);
          const toWant = toWantIds.length;
          const note = h('p', { class: 'aqm-muted', role: 'status' });
          const wantAll = h(
            'button',
            {
              type: 'button',
              class: 'aqm-sort is-on',
              disabled: !toWant,
              onclick: async () => {
                wantAll.disabled = true;
                note.textContent = wantsNote(await enqueueWants(toWantIds), 'tu peux fermer cette fenêtre, changer de page ou ouvrir des boosters');
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
                  class: `aqm-chip aqm-fav-details${opened.has(s.id) ? ' is-on' : ''}`,
                  'aria-expanded': String(opened.has(s.id)),
                  onclick: () => {
                    opened.has(s.id) ? opened.delete(s.id) : opened.add(s.id);
                    render();
                  }
                },
                opened.has(s.id) ? 'Masquer ▴' : `Détails ▾`
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'aqm-chip is-on aqm-fav-unstar',
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
            !opened.has(s.id)
              ? null
              : cards.length
              ? h(
                  'ul',
                  { class: 'aqm-fav-cards' },
                  cards.map((c) => {
                    const want = h(
                      'button',
                      {
                        type: 'button',
                        class: `aqm-want${c.wanted ? ' is-on' : ''}${c.waiting ? ' is-wait' : ''}`,
                        title: c.waiting ? 'En attente dans Aquaman (ta liste du jeu est pleine) : ne plus la chercher' : c.wanted ? 'Ne plus la chercher' : 'Je la cherche : être prévenu quand elle est mise en vente',
                        onclick: async (e) => {
                          e.preventDefault();
                          want.disabled = true;
                          try {
                            const r = await wantCard(c.id, !c.wanted);
                            c.wanted = r.wanted;
                            c.waiting = false;
                            want.classList.toggle('is-on', c.wanted);
                            want.classList.remove('is-wait');
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

  // ---------- trades: an owned / missing dot ----------

  let owned = null; // { at, byImage }
  let tradesBusy = false;
  let cardImages = null; // { at, keys: Set | null }: image keys of the game catalogue, to tell cards from avatars

  // Pages that show exchanges: the game's own ones and the private messages, where a proposal is sent as an attachment.
  const TRADE_PAGES = /^\/(jeu\/echanges|messages)(\/|$)/;

  async function catalogImages() {
    if (cardImages && Date.now() - cardImages.at < 30 * 60e3) return cardImages.keys;
    const res = await ask({ type: 'card-images' });
    cardImages = { at: Date.now(), keys: res.keys ? new Set(res.keys) : null };
    return cardImages.keys;
  }

  // Copies owned by image key, kept 30 seconds.
  async function ownedByImage() {
    if (owned && Date.now() - owned.at < 30e3) return owned.byImage;
    const res = await ask({ type: 'ownership' });
    owned = { at: Date.now(), byImage: res.byImage };
    return owned.byImage;
  }

  // What each card of an exchange shows already ("picture|copies|gives"): only the new or changed ones are done again.
  const tradeDone = new WeakMap();

  async function markTrades() {
    if (tradesBusy) return;
    const labels = elementsWithText(document.body, /^\s*tu (re[çc]ois|donnes)\s*:?\s*$/i);
    const everyCard = TRADE_PAGES.test(location.pathname);
    if (!labels.length && !everyCard) return;
    tradesBusy = true;
    try {
      const [byImage, known] = await Promise.all([ownedByImage(), everyCard ? catalogImages().catch(() => null) : null]);
      if (stopped) return;
      const todo = [];
      const seen = new Set();
      const add = (img, box, gives) => {
        seen.add(img);
        const src = img.currentSrc || img.src;
        const frame = img.parentElement;
        if (!frame || !isCardImage(src) || img.closest('.aqm-root')) return;
        const key = imageKey(src);
        const n = byImage[key] ?? 0;
        // Outside a "Tu reçois / Tu donnes" block, only a picture of the catalogue (or an owned card) is a card: not an avatar.
        if (!box && !n && !known?.has(key)) return;
        const done = `${key}|${n}|${gives}`;
        if (tradeDone.get(img) === done && frame.querySelector(':scope > .aqm-dot')) return;
        todo.push({ img, frame, box, n, gives, done });
      };
      for (const label of labels) {
        if (!label.isConnected) continue;
        const gives = /donnes/i.test(label.textContent);
        let box = label.parentElement;
        while (box && box !== document.body && !box.querySelector('img')) box = box.parentElement;
        if (!box || box === document.body) continue;
        for (const img of box.querySelectorAll('img')) add(img, box, gives);
      }
      // A proposal in the messages, or a page of exchanges laid out without those words: every card gets its dot.
      if (everyCard) for (const img of document.body.querySelectorAll('img')) if (!seen.has(img)) add(img, null, null);
      // The styles are all read first, then the page is changed: a read after each change made the browser lay the
      // whole exchange out again once per card, which froze the page.
      for (const t of todo) t.anchor = t.frame.style.position !== 'relative' && getComputedStyle(t.frame).position === 'static';
      for (const { img, frame, box, n, gives, done, anchor } of todo) {
        let tile = frame;
        while (box && tile.parentElement && tile.parentElement !== box && tile.parentElement.querySelectorAll('img').length === 1) tile = tile.parentElement;
        tile.classList.add('aqm-trade-tile');
        if (anchor) {
          frame.style.position = 'relative';
          frame.dataset.aqmAnchor = '1';
        }
        tradeDone.set(img, done);
        let dot = frame.querySelector(':scope > .aqm-dot');
        if (!dot) dot = frame.appendChild(h('span', { class: 'aqm-root aqm-dot' }));
        setClass(dot, `aqm-root aqm-dot ${n ? 'is-yes' : 'is-no'}${n > 1 ? ' has-count' : ''}`);
        setText(dot, n > 1 ? `×${n}` : '');
        const title = !n
          ? 'Tu n’as pas cette carte'
          : gives === null
            ? n > 1
              ? `Tu l’as (${n} exemplaires)`
              : 'Tu l’as'
          : gives
            ? n > 1
              ? `Tu en as ${n} : il t’en restera ${n - 1}`
              : 'Ton seul exemplaire'
            : n > 1
              ? `Tu l’as déjà (${n} exemplaires)`
              : 'Tu l’as déjà';
        if (dot.title !== title) dot.title = title;
      }
    } catch (e) {
      console.warn('[Aquaman] échanges :', e);
    } finally {
      tradesBusy = false;
    }
  }

  // ---------- trades: filters "Mes recherches", "Il me manque", "Il lui manque" ----------
  // In the window "Proposer un échange", beside the game's chips (Toutes, Doublons, En vente): Aquaman's own filters,
  // which hide the cards that don't match, on top of the game's (with "Doublons": the duplicates that match).
  // "Tu demandes" (the partner's cards): Mes recherches, Il me manque. "Tu donnes" (the player's): Il lui manque.
  const TRADE_FILTERS = [
    { key: 'searched', label: 'Mes recherches', title: 'Seulement les cartes de ta liste de recherches', on: 'asks' },
    { key: 'mine', label: 'Il me manque', title: 'Seulement les cartes que tu n’as pas', on: 'asks' },
    { key: 'theirs', label: 'Il lui manque', title: 'Seulement les cartes que ton partenaire n’a pas', on: 'gives' }
  ];
  const tradeOn = new Set(); // the filters picked, kept while the page stays open
  let searchedKeys = null; // { at, keys: Set } the pictures of the searched cards
  let partner = null; // { name, at, state: 'loading' | 'ok' | 'private' | 'unknown', byImage }
  let tradeLoading = false;
  let tradeAskedAt = 0;
  const tradeTiles = new WeakMap(); // picture -> its tile in the grid

  // The window of an exchange being made: its chips, and which side is shown (gives: "Tu donnes").
  function tradeWindow() {
    const doubles = [...document.querySelectorAll('button')].find((b) => !b.closest('.aqm-root') && /^doublons\b/i.test(b.textContent.trim()));
    const chips = doubles?.parentElement;
    if (!chips || ![...chips.querySelectorAll('button')].some((b) => /^toutes$/i.test(b.textContent.trim()))) return null;
    const tabText = (b) => b.textContent.trim().toLowerCase();
    for (let box = chips.parentElement, up = 0; box && box !== document.body && up < 10; box = box.parentElement, up++) {
      const tabs = [...box.querySelectorAll('button, [role="tab"]')].filter((b) => /^(tu donnes|tu demandes|perles et mot)$/.test(tabText(b)));
      const gives = tabs.find((b) => tabText(b) === 'tu donnes');
      const asks = tabs.find((b) => tabText(b) === 'tu demandes');
      if (!gives || !asks) continue;
      // The tab shown: the one marked so, else the one drawn unlike the others.
      const marked = tabs.find((b) => b.getAttribute('aria-selected') === 'true' || b.getAttribute('data-state') === 'active' || b.getAttribute('aria-pressed') === 'true');
      const odd = tabs.find((b) => tabs.filter((x) => x.className === b.className).length === 1);
      const shown = marked ?? (tabs.length > 2 ? odd : null);
      if (!shown) return null;
      return { box, chips, side: shown === gives ? 'gives' : shown === asks ? 'asks' : null };
    }
    return null;
  }

  // The partner's name: "Avec Towntter" at the top of the window.
  function tradePartnerName(box) {
    for (const el of box.querySelectorAll('p, span, div, h2, h3')) {
      const text = el.textContent.trim();
      if (text.length > 80 || el.children.length > 3) continue;
      const m = text.match(/^avec\s+(.+)$/i);
      if (m) return m[1].trim();
    }
    return null;
  }

  async function loadTradeData(name) {
    if (tradeLoading) return;
    tradeLoading = true;
    try {
      const jobs = [];
      if (tradeOn.has('searched') && (!searchedKeys || Date.now() - searchedKeys.at > 60e3))
        jobs.push(
          ask({ type: 'searched-images' })
            .then((r) => (searchedKeys = { at: Date.now(), keys: new Set(r.keys ?? []) }))
            .catch(() => (searchedKeys = { at: Date.now(), keys: new Set() }))
        );
      if (tradeOn.has('mine')) jobs.push(ownedByImage().catch(() => null));
      if (tradeOn.has('theirs') && name && (partner?.name !== name || Date.now() - partner.at > 5 * 60e3)) {
        partner = { name, at: Date.now(), state: 'loading', byImage: null };
        jobs.push(
          ask({ type: 'player-ownership', id: playersSeen.get(foldName(name)) ?? null, name })
            .then((r) => {
              if (partner?.name !== name) return;
              partner.state = !r.found ? 'unknown' : r.private ? 'private' : 'ok';
              partner.byImage = r.byImage ?? null;
            })
            .catch(() => partner?.name === name && (partner.state = 'unknown'))
        );
      }
      await Promise.all(jobs);
    } finally {
      tradeLoading = false;
    }
  }

  function markTradeFilters() {
    const win = tradeWindow();
    if (!win) {
      if (!document.querySelector('.aqm-trade-filter')) return;
      document.querySelectorAll('.aqm-trade-filter').forEach((el) => el.remove());
      document.querySelectorAll('[data-aqm-tradehide]').forEach((el) => el.removeAttribute('data-aqm-tradehide'));
      return;
    }
    const { box, chips, side } = win;
    const name = tradePartnerName(box);
    // The chips of this side, after the game's.
    const plain = [...chips.querySelectorAll('button')].find((b) => !b.classList.contains('aqm-trade-filter') && /^doublons\b/i.test(b.textContent.trim()));
    for (const f of TRADE_FILTERS) {
      let chip = chips.querySelector(`:scope > .aqm-trade-filter[data-key="${f.key}"]`);
      if (f.on !== side) {
        chip?.remove();
        continue;
      }
      if (!chip) {
        chip = h(
          'button',
          {
            type: 'button',
            class: `${plain?.className ?? ''} aqm-trade-filter`,
            'data-key': f.key,
            onclick: () => {
              tradeOn.has(f.key) ? tradeOn.delete(f.key) : tradeOn.add(f.key);
              markTradeFilters();
            }
          },
          f.label
        );
        chips.append(chip);
      }
      const isOn = tradeOn.has(f.key);
      chip.classList.toggle('is-on', isOn);
      chip.setAttribute('aria-pressed', String(isOn));
      const state = f.key === 'theirs' && isOn ? partner?.state : null;
      const title = state === 'private' ? `${f.title} : sa collection est privée, rien n’est masqué.` : state === 'unknown' ? `${f.title} : Aquaman n’a pas trouvé ${name ?? 'ce joueur'}, rien n’est masqué.` : f.title;
      if (chip.title !== title) chip.title = title;
      chip.classList.toggle('is-off', state === 'private' || state === 'unknown');
    }

    // The filters of this side, with what they need.
    const active = TRADE_FILTERS.filter((f) => f.on === side && tradeOn.has(f.key)).map((f) => f.key);
    const mine = owned && Date.now() - owned.at < 30e3 ? owned.byImage : null;
    const needs =
      (active.includes('searched') && (!searchedKeys || Date.now() - searchedKeys.at > 60e3)) ||
      (active.includes('mine') && !mine) ||
      (active.includes('theirs') && name && (partner?.name !== name || Date.now() - partner.at > 5 * 60e3));
    // (once every 5 s at most: an answer that doesn't come doesn't ask again on every change of the page)
    if (needs && Date.now() - tradeAskedAt > 5000) {
      tradeAskedAt = Date.now();
      loadTradeData(name).then(() => !stopped && markTradeFilters());
    }
    const tests = [];
    if (active.includes('searched') && searchedKeys) tests.push((key) => searchedKeys.keys.has(key));
    if (active.includes('mine') && mine) tests.push((key) => !mine[key]);
    if (active.includes('theirs') && partner?.name === name && partner.state === 'ok') tests.push((key) => !partner.byImage[key]);

    // The cards of the grid: each picture's tile (its largest box holding only it), hidden when a filter says no.
    for (const img of box.querySelectorAll('img')) {
      const src = img.currentSrc || img.src;
      // (only the grid under the chips: not the partner's picture, nor the cards already put in the exchange above)
      if (img.closest('.aqm-root') || !(chips.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING) || chips.contains(img) || !isCardImage(src)) continue;
      let tile = tradeTiles.get(img);
      if (!tile?.isConnected || !tile.contains(img)) {
        tile = img;
        while (tile.parentElement && tile.parentElement !== box && tile.parentElement.querySelectorAll('img').length === 1) tile = tile.parentElement;
        tradeTiles.set(img, tile);
      }
      const key = imageKey(src);
      const hide = !!tests.length && !!key && !tests.every((t) => t(key));
      if (tile.hasAttribute('data-aqm-tradehide') !== hide) tile.toggleAttribute('data-aqm-tradehide', hide);
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

  const vitrines = new Set(); // "Ma vitrine" windows found: the page's text searches and changes skip them

  // Slots of the showcase editor in order: the card and its row of 3 buttons (‹ › ✕). Found from the buttons: the
  // window also lists every card of the collection, going through all of its elements would be slow.
  function showcaseSlots(dlg) {
    const slots = [];
    const seen = new Set();
    for (const btn of dlg.querySelectorAll('button')) {
      if (btn.querySelector('img') || btn.closest('.aqm-root')) continue;
      // The row: the closest parent with 3 buttons (more: it holds several rows, or other buttons).
      let el = btn.parentElement;
      for (let depth = 0; el && el !== dlg && depth < 4 && el.querySelectorAll('button').length < 3; depth++) el = el.parentElement;
      if (!el || el === dlg || seen.has(el)) continue;
      seen.add(el);
      if (!/^(DIV|LI|SPAN)$/.test(el.tagName) || el.querySelectorAll('button').length !== 3 || el.querySelector('img')) continue;
      let slot = el.parentElement;
      while (slot && slot !== dlg && !slot.querySelector('img')) slot = slot.parentElement;
      if (!slot || slot === dlg || slot.querySelectorAll('img').length !== 1) continue;
      slots.push({ slot, controls: el });
    }
    return slots;
  }

  // The list of the collection's cards in the window (the element with the most cards as children), drawn only
  // near the screen: hundreds of animated cards made the window slow.
  const vitrineGrids = new WeakMap(); // window -> list
  function lightenGrid(dlg) {
    const known = vitrineGrids.get(dlg);
    if (known?.isConnected && dlg.contains(known)) return;
    let grid = null;
    for (const el of dlg.querySelectorAll('div, ul, ol')) {
      if (el.children.length >= 12 && el.children.length > (grid?.children.length ?? 0) && el.firstElementChild?.querySelector('img') && !el.closest('.aqm-root')) grid = el;
    }
    if (!grid) return;
    vitrineGrids.set(dlg, grid);
    const cell = grid.firstElementChild.getBoundingClientRect();
    if (cell.height) grid.style.setProperty('--aqm-cell-h', `${Math.round(cell.height)}px`);
    if (cell.width) grid.style.setProperty('--aqm-cell-w', `${Math.round(cell.width)}px`);
    grid.dataset.aqmLite = '';
  }

  // True when a change of the page only concerns Aquaman or the card list of a "Ma vitrine" window: no need to run.
  function quietChange(r) {
    const target = r.target instanceof Element ? r.target : r.target.parentElement;
    if (!target || target.closest('.aqm-root, [data-aqm-lite]')) return true;
    const nodes = [...r.addedNodes, ...r.removedNodes];
    return nodes.length > 0 && nodes.every((n) => n instanceof Element && n.classList.contains('aqm-root'));
  }

  // Windows titled "Ma vitrine".
  function showcaseDialogs() {
    const found = new Set([...vitrines].filter((dlg) => dlg.isConnected));
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
    const dialogs = showcaseDialogs();
    vitrines.clear();
    for (const dlg of dialogs) {
      const slots = showcaseSlots(dlg);
      if (!slots.length) continue;
      vitrines.add(dlg);
      lightenGrid(dlg);
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
        { class: 'aqm-pity-line', title: p.known ? `${fmt(p.since)} booster${p.since > 1 ? 's' : ''} ouvert${p.since > 1 ? 's' : ''} depuis ta dernière ${code}.` : `Aquaman n’a pas encore vu de ${code} sortir : il compte depuis son installation, donc la garantie peut arriver plus tôt.` },
        h('p', {}, rarityCode(code), ' garantie ', h('strong', {}, when), p.known ? '' : ' au plus'),
        h('span', { class: 'aqm-bar' }, h('span', { style: `width:${Math.min(100, (100 * p.since) / p.every).toFixed(1)}%` })),
        h('small', {}, p.known ? `${fmt(p.since)} / ${fmt(p.every)} depuis ta dernière ${code}` : `${fmt(p.since)} / ${fmt(p.every)} sans ${code} depuis qu’Aquaman compte`)
      );
    };
    // The SEC has no guarantee: the boosters since the last one, and what the game's odds give, without a bar.
    const secLine = () => {
      const s = pityReport.SEC;
      if (!s) return null;
      const n = `${fmt(s.since)}${s.known ? '' : '+'} booster${s.since > 1 ? 's' : ''}`;
      const odds = s.chance > 0 ? `une tous les ~${fmt(1 / s.chance)} boosters en moyenne · ${pct(1 - (1 - s.chance) ** 100)} d’en avoir une dans les 100 prochains` : null;
      return h(
        'div',
        {
          class: 'aqm-pity-line is-sec',
          title: `Pas de garantie pour la SEC : chaque booster a la même chance, la malchance passée ne la rapproche pas.${s.known ? '' : ' Aquaman n’a pas encore vu de SEC sortir : il compte depuis son installation.'}`
        },
        h('p', {}, rarityCode('SEC'), ' ', h('strong', {}, n), ' sans SEC'),
        h('small', {}, odds ? `Pas de garantie : ${odds}.` : 'Pas de garantie pour la SEC.')
      );
    };
    box.replaceChildren(
      h('p', { class: 'aqm-label' }, 'Garantie anti-malchance'),
      h('div', { class: 'aqm-pity-lines' }, line('SSR'), line('UR'), secLine()),
      h(
        'p',
        { class: 'aqm-pity-note' },
        {
          ok: 'Compté par Aquaman à chaque booster ouvert, et partagé entre tes appareils (PC, téléphone, extension ou script).',
          waiting: 'Compté par Aquaman à chaque booster ouvert, et partagé entre tes appareils dès ta prochaine ouverture.',
          error: 'Compté par Aquaman sur ce navigateur : le partage avec tes autres appareils ne répond pas pour le moment.',
          off: 'Compté par Aquaman à chaque booster ouvert sur ce navigateur (partage entre appareils désactivé).'
        }[pityReport.sync] ?? 'Compté par Aquaman à chaque booster ouvert.'
      ),
      h('div', { class: 'aqm-pity-more' }, h('button', { type: 'button', class: 'aqm-album-btn', onclick: openPityHistory }, '📜 Historique'))
    );
  }

  // The tracker of the SSR, UR and SEC (each rarity on its own): how often each drops against
  // the game's odds, the last boosters opened at a glance, and for each rarity the cards got with the boosters each
  // one took, the most recent first.
  async function openPityHistory() {
    const body = openOverlay('Historique des tirages', 'À quelle fréquence tu tires des SSR, UR et SEC, et combien de boosters il t’a fallu pour chacune.');
    body.parentElement.classList.add('aqm-panel-wide');
    const view = h('div', { class: 'aqm-history' }, h('p', { class: 'aqm-note' }, 'Lecture de tes ouvertures…'));
    body.append(view);
    let r;
    try {
      r = await ask({ type: 'pity-history' });
    } catch (e) {
      view.replaceChildren(h('p', { class: 'aqm-note' }, e.message));
      return;
    }
    const CODES = ['SSR', 'UR', 'SEC'];
    const day = (at) => new Date(at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const boosters = (n) => `${fmt(n)} booster${n > 1 ? 's' : ''}`;
    const decimal = (x) => x.toFixed(1).replace('.', ',');
    const weeks = r.since ? Math.max(1 / 7, (Date.now() - r.since) / (7 * 86400e3)) : null;

    // One card per rarity: how often it drops, the game's odds (without the guarantee) and the luck.
    const rate = (code) => {
      const n = r[code].hits.length;
      const every = n ? r.opened / n : null;
      const expected = r.chances?.[code] > 0 ? 1 / r.chances[code] : null;
      const ratio = every && expected ? expected / every : null;
      const luck = ratio == null ? null : ratio >= 1.15 ? ['is-good', `${decimal(ratio)}× plus souvent`] : ratio <= 0.87 ? ['is-bad', `${decimal(1 / ratio)}× moins souvent`] : ['', 'Dans la moyenne'];
      const perWeek = weeks && n ? n / weeks : 0;
      return h(
        'div',
        { class: `aqm-rate is-${code}` },
        h('div', { class: 'aqm-rate-top' }, rarityCode(code), luck ? h('span', { class: `aqm-tag aqm-luck ${luck[0]}` }, luck[1]) : null),
        h('p', { class: 'aqm-rate-value' }, every ? ['1 ', h('small', {}, 'tous les'), ` ${fmt(every)}`] : '—'),
        h('p', { class: 'aqm-rate-sub' }, every ? 'boosters, chez toi' : `aucune en ${boosters(r.opened)}`),
        h(
          'p',
          { class: 'aqm-rate-foot', title: 'La chance du jeu pour un booster classique, sans la garantie anti-malchance.' },
          expected ? `Jeu : 1 tous les ~${fmt(expected)}` : 'Jeu : chance inconnue',
          perWeek ? ` · ≈ ${perWeek < 10 ? decimal(perWeek) : fmt(perWeek)}/sem.` : ''
        )
      );
    };

    // The last boosters, one square each, coloured by their best card.
    const strip = r.recent?.length
      ? h(
          'div',
          { class: 'aqm-history-box' },
          h('div', { class: 'aqm-history-row' }, h('p', { class: 'aqm-label' }, `Tes ${boosters(r.recent.length)} les plus récents`), h('small', { class: 'aqm-muted' }, 'du plus ancien au plus récent')),
          h(
            'div',
            { class: 'aqm-tracker-strip' },
            r.recent.map((top) => {
              const code = top >= 6 ? 'SEC' : top >= 5 ? 'UR' : top >= 4 ? 'SSR' : null;
              return h('span', { class: `aqm-cell${code ? ` is-${code}` : ''}`, title: code ?? 'Ni SSR, ni UR, ni SEC' });
            })
          ),
          h('p', { class: 'aqm-tracker-legend' }, [null, ...CODES].map((code) => h('span', {}, h('span', { class: `aqm-cell${code ? ` is-${code}` : ''}` }), code ?? 'Autre')))
        )
      : null;

    // The kind of booster each card came from (kept since Aquaman 1.4.7; before, guessed from the card: Halloween or
    // Classique; "Pack inconnu" when the card itself is unknown).
    const UNKNOWN = '?';
    const packKey = (x) => x.pack?.id ?? UNKNOWN;
    const packName = (x) => x.pack?.name ?? (x.pack?.id === 'classic' ? 'Classique' : x.pack ? 'Autre pack' : 'Pack inconnu');
    const packs = new Map();
    for (const code of CODES)
      for (const x of r[code].hits) {
        const key = packKey(x);
        if (!packs.has(key)) packs.set(key, { key, name: packName(x), count: 0 });
        packs.get(key).count++;
      }
    const packList = [...packs.values()].sort((a, b) => (a.key === UNKNOWN) - (b.key === UNKNOWN) || b.count - a.count);
    let pack = ''; // the pack shown ('' for all)
    let rarity = CODES.find((code) => r[code].hits.length) ?? 'SSR';
    const hitsOf = (code) => (pack ? r[code].hits.filter((x) => packKey(x) === pack) : r[code].hits);

    // The cards got for one rarity, as tiles: the picture, how many boosters it took, the pack, the day.
    const tiles = (code) => {
      const { current } = r[code];
      const hits = hitsOf(code);
      const full = hits.filter((x) => !x.first).map((x) => x.after);
      const stat = (label, value) => h('div', { class: 'aqm-history-stat' }, h('small', {}, label), h('strong', {}, value));
      const all = r[code].hits.length;
      return [
        h(
          'div',
          { class: 'aqm-history-stats' },
          stat('Obtenues', fmt(hits.length)),
          pack ? stat(`Part de tes ${code}`, all ? pct(hits.length / all) : '—') : stat('En moyenne', full.length ? boosters(full.reduce((a, b) => a + b, 0) / full.length) : '—'),
          stat('Plus rapide', full.length ? boosters(Math.min(...full)) : '—'),
          stat('Plus long', full.length ? boosters(Math.max(...full)) : '—'),
          stat('Depuis la dernière', boosters(current))
        ),
        hits.length
          ? h(
              'div',
              { class: 'aqm-history-grid' },
              hits.map((x) => {
                // The card's picture, the boosters it took and its pack (its name and day in the tooltip).
                const link = x.card?.id ? { href: `/jeu/carte/${encodeURIComponent(x.card.id)}` } : {};
                const tip = [x.card?.name ?? `${x.top}, carte inconnue`, x.pack?.guessed ? `${packName(x)} (déduit de la carte)` : packName(x), day(x.at), x.first ? 'Aquaman a commencé à compter après la précédente' : null].filter(Boolean).join(' · ');
                return h(
                  x.card?.id ? 'a' : 'div',
                  { class: 'aqm-history-tile', ...link, title: tip },
                  x.card?.image ? h('img', { src: cardImageUrl(x.card.image), alt: x.card.name ?? '', loading: 'lazy', decoding: 'async' }) : h('div', { class: 'aqm-history-blank' }, rarityCode(x.top)),
                  h('p', { class: 'aqm-history-after' }, x.first ? `≥ ${boosters(x.after)}` : boosters(x.after)),
                  h('p', { class: `aqm-history-pack${x.pack ? '' : ' is-unknown'}` }, packName(x))
                );
              })
            )
          : h('p', { class: 'aqm-history-empty' }, pack ? `Aucune ${code} tirée dans ce pack.` : `Aucune ${code} parmi tes ${boosters(r.opened)} comptés.`)
      ];
    };

    // A tab per rarity, the first one with cards open; above, a filter per pack (once a card's pack is known).
    const panel = h('div', { class: 'aqm-history-panel' });
    const tabs = h('div', { class: 'aqm-history-tabs', role: 'tablist' });
    const filter = h('div', { class: 'aqm-history-packs', role: 'group', 'aria-label': 'Pack' });
    const show = () => {
      if (packList.some((p) => p.key !== UNKNOWN))
        filter.replaceChildren(
          ...[{ key: '', name: 'Tous les packs', count: CODES.reduce((n, c) => n + r[c].hits.length, 0) }, ...packList].map((p) =>
            h(
              'button',
              {
                type: 'button',
                class: `aqm-history-packbtn${p.key === pack ? ' is-on' : ''}`,
                'aria-pressed': String(p.key === pack),
                title: p.key === UNKNOWN ? 'Cartes tirées avant la version 1.4.7 dont Aquaman ne connaît pas la carte : impossible de savoir leur pack.' : null,
                onclick: () => {
                  pack = p.key;
                  show();
                }
              },
              p.name,
              h('span', { class: 'aqm-history-tabcount' }, fmt(p.count))
            )
          )
        );
      tabs.replaceChildren(
        ...CODES.map((c) =>
          h(
            'button',
            {
              type: 'button',
              role: 'tab',
              class: `aqm-history-tabbtn${c === rarity ? ' is-on' : ''}`,
              'aria-selected': String(c === rarity),
              onclick: () => {
                rarity = c;
                show();
              }
            },
            rarityCode(c),
            h('span', { class: 'aqm-history-tabcount' }, fmt(hitsOf(c).length))
          )
        )
      );
      panel.replaceChildren(...tiles(rarity));
    };
    show();
    view.replaceChildren(
      h('p', { class: 'aqm-history-count' }, r.since ? `${boosters(r.opened)} comptés depuis le ${new Date(r.since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Aucun booster compté pour le moment.'),
      h('div', { class: 'aqm-rates' }, CODES.map(rate)),
      strip,
      h('div', { class: 'aqm-history-box' }, filter.childElementCount ? filter : null, tabs, panel)
    );
  }

  // ---------- home: the boosters of every kind, side by side ----------
  // "Tout ouvrir" opens every waiting booster. When they are of several kinds (Classique, Magie…), the game's pile is
  // drawn once per kind and shown side by side, each with the game's own "Ouvrir" and "Tout ouvrir" buttons: inject.js
  // gives the game only the boosters of one kind (sessionStorage) and asks its store to read them again, Aquaman
  // copies what the game drew. A click on a copied button sets the game on that kind and clicks its real button,
  // with its animation; afterwards the copies are drawn again and the game is back to all of its boosters.

  const KIND_KEY = 'aqm-booster-kind';
  let pendingBoosters = null; // [{ id, kind, name, art }], all the waiting boosters (inject.js)
  let boostersAsked = false;
  let piles = null; // { sig, shots: [{ key, name, count, pile, buttons }] }, the copies shown
  let drawing = false; // the copies are being drawn
  let opening = false; // a click on a copied button: the game opens, the copies wait
  let homeParts = null; // { pile, buttons } of the game, kept once hidden

  const setKind = (key) => {
    try {
      key ? sessionStorage.setItem(KIND_KEY, key) : sessionStorage.removeItem(KIND_KEY);
      return true;
    } catch {
      return false;
    }
  };

  // Sets the game on one kind ('' for all) and waits until it has drawn it; false when its store can't be reached.
  let refreshId = 0;
  const refreshed = new Map();
  // fresh: the game draws its pile afresh (its picture is picked when the pile appears), for a copy or an opening.
  // reload: the game reads its boosters again from the server (after an opening).
  // items: boosters made up for the author's scan (one kind each time).
  function showKind(key, fresh = false, reload = false, items = null) {
    if (!setKind(key)) return Promise.resolve(false);
    const id = ++refreshId;
    return new Promise((resolve) => {
      const done = (ok) => {
        refreshed.delete(id);
        // Two frames and a moment for React to draw the pile and the pictures to come.
        if (ok) requestAnimationFrame(() => requestAnimationFrame(() => pileStill().then(() => resolve(true))));
        else resolve(false);
      };
      refreshed.set(id, done);
      setTimeout(() => refreshed.get(id)?.(false), 4000);
      window.postMessage({ aquamanCmd: 'refresh-boosters', id, kind: key, fresh, reload, items }, location.origin);
    });
  }
  const onBoostersRefreshed = (id, ok) => refreshed.get(id)?.(ok);

  // The waiting boosters by kind, in the game's order.
  function boosterKinds() {
    const kinds = new Map();
    for (const b of pendingBoosters ?? []) {
      const key = b.kind ?? 'classic';
      if (!kinds.has(key)) kinds.set(key, { key, name: b.name ?? 'Classique', art: b.art ?? null, count: 0 });
      kinds.get(key).count++;
    }
    return [...kinds.values()];
  }

  // The game's pile of boosters (the big box above its buttons, inside the one that also holds the title "4 à
  // ouvrir" if need be) and its row of buttons.
  function findHomeParts() {
    if (homeParts?.pile.isConnected && homeParts.buttons.isConnected) return homeParts;
    // "Tout ouvrir", or "Ouvrir" alone when there is one booster.
    const own = [...document.querySelectorAll('button')].filter((b) => !b.closest('.aqm-root'));
    const all = own.find((b) => /^tout ouvrir/i.test(b.textContent.trim())) ?? own.find((b) => /^ouvrir$/i.test(b.textContent.trim()));
    if (!all) return null;
    const buttons = all.parentElement;
    const TITLE = /à ouvrir/i;
    const big = (el) => !el.classList.contains('aqm-root') && el.getBoundingClientRect().height > 120;
    for (let el = buttons, up = 0; el && el !== document.body && up < 6; el = el.parentElement, up++)
      for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
        if (!big(sib)) continue;
        if (!TITLE.test(sib.textContent)) return (homeParts = { pile: sib, buttons });
        for (let box = sib; box; ) {
          const kids = [...box.children].reverse();
          const pile = kids.find((c) => big(c) && !TITLE.test(c.textContent));
          if (pile) return (homeParts = { pile, buttons });
          box = kids.find((c) => big(c) && TITLE.test(c.textContent)) ?? null;
        }
        return null;
      }
    return null;
  }

  // A copy of what the game drew, without ids.
  function copyOf(el) {
    const copy = el.cloneNode(true);
    for (const x of [copy, ...copy.querySelectorAll('[id]')]) x.removeAttribute('id');
    copy.removeAttribute('data-aqm-hidden');
    // What is left of an entrance animation (a blur). The opacities stay: a booster stacks layers that the game hides
    // (a themed booster keeps the classic waves, invisible, over its own picture).
    for (const x of [copy, ...copy.querySelectorAll('[style]')]) if (/blur/.test(x.style.filter)) x.style.filter = '';
    return copy;
  }

  // The copies of the piles, kept for good in Aquaman's own storage (kept when the site's data is cleared), one per
  // kind whatever the number of its boosters: shown at once, with their counts set right. The game's buttons are kept
  // as they were with several boosters too ("Ouvrir" and "Tout ouvrir"), for when there are several again. Read once
  // when Aquaman starts (shotStore stays null until then).
  const SHOTS_KEY = 'boosterPiles';
  const KIND_ID = /^[A-Za-z0-9_-]{1,64}$/;
  // The shapes of a pile: 1, 2, and 3 boosters and more; the author's drawings are kept by kind and shape.
  const SHAPES = [1, 2, 3];
  const shapeKey = (kind, count) => `${kind}--n${Math.min(Math.max(count, 1), 3)}`;
  const SHOTS_V = 9; // the drawings of a pile the game drew itself (load) for its kind and shape, with its picture
  const ALL_BUTTON = /^tout ouvrir/i;
  const hasAllButton = (buttons) => [...buttons.querySelectorAll('button')].some((b) => ALL_BUTTON.test(b.textContent.trim()));
  let shotStore = null;
  const readShotStore = () => shotStore ?? {};

  async function loadShotStore() {
    let kept = {};
    try {
      kept = (await chrome.storage.local.get(SHOTS_KEY))[SHOTS_KEY] ?? {};
      // The copies of the previous version, kept by the site (localStorage).
      const old = JSON.parse(localStorage.getItem('aqm-booster-piles') || 'null');
      if (old) {
        kept = { ...old, ...kept };
        localStorage.removeItem('aqm-booster-piles');
        chrome.storage.local.set({ [SHOTS_KEY]: kept });
      }
    } catch {}
    shotStore = kept;
    loadGlobalPacks();
  }

  // The drawings of every kind published by the author (relay): used first, they are kept here too for the next
  // starts, and read again from the relay each time.
  const GLOBAL_KEY = 'globalPacks';
  let globalStore = {};
  async function loadGlobalPacks() {
    try {
      globalStore = (await chrome.storage.local.get(GLOBAL_KEY))[GLOBAL_KEY] ?? {};
    } catch {}
    const res = await send({ type: 'packs-global' });
    const fresh = res?.packs;
    if (!fresh || typeof fresh !== 'object' || JSON.stringify(fresh) === JSON.stringify(globalStore)) return;
    globalStore = fresh;
    try {
      chrome.storage.local.set({ [GLOBAL_KEY]: globalStore });
    } catch {}
    piles = null; // drawn again with the published drawings
    markBoosterKinds();
  }

  function saveShots(shots) {
    shotStore = { ...readShotStore() };
    // One drawing per kind and shape of pile (1, 2, 3 boosters and more): the game draws each shape once.
    for (const shot of shots)
      shotStore[shapeKey(shot.key, shot.count)] = { v: SHOTS_V, pile: shot.pile.outerHTML, buttons: shot.buttons.outerHTML, many: null, at: Date.now() };
    try {
      chrome.storage.local.set({ [SHOTS_KEY]: shotStore });
    } catch {}
  }

  // Elements from kept HTML: the game's drawing, but it may come back from the relay, which anyone can write to, so only
  // what draws is kept: known tags and attributes, pictures of the site only, styles without outside addresses.
  const SAFE_TAGS = new Set(['div', 'span', 'p', 'strong', 'small', 'b', 'i', 'em', 'button', 'img', 'picture', 'source', 'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'filter', 'fegaussianblur', 'feturbulence', 'fecolormatrix', 'feblend', 'fecomposite', 'feoffset', 'feflood', 'femerge', 'femergenode', 'fedisplacementmap', 'text', 'tspan']);
  const SAFE_ATTRS = /^(class|style|alt|role|title|type|disabled|width|height|viewbox|d|fill|stroke|stroke-[a-z-]+|fill-[a-z-]+|clip-[a-z-]+|opacity|transform|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|points|offset|stop-color|stop-opacity|gradientunits|gradienttransform|patternunits|preserveaspectratio|xmlns|loading|decoding|sizes|stddeviation|basefrequency|numoctaves|seed|in|in2|result|mode|operator|values|scale|dx|dy|flood-color|flood-opacity|text-anchor|font-[a-z-]+|letter-spacing|mask|filter|aria-[a-z-]+|data-[a-z0-9-]+)$/i;
  const siteUrl = (v) => /^\/(?!\/)/.test(v) || v.startsWith(`${location.origin}/`);
  // A style whose addresses are all of the site (or of the drawing itself: "#…"); a themed pack keeps its picture there.
  const siteStyle = (v) => {
    if (/expression|javascript:/i.test(v)) return false;
    const urls = [...v.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].map((m) => m[2].trim());
    return urls.length === (v.match(/url\(/gi) ?? []).length && urls.every((u) => u.startsWith('#') || siteUrl(u));
  };
  function fromHtml(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    const el = t.content.firstElementChild;
    if (!el) return null;
    for (const x of [...el.querySelectorAll('*')].reverse()) if (!SAFE_TAGS.has(x.tagName.toLowerCase())) x.remove();
    if (!SAFE_TAGS.has(el.tagName.toLowerCase())) return null;
    for (const x of [el, ...el.querySelectorAll('*')])
      for (const a of [...x.attributes]) {
        const name = a.name.toLowerCase();
        const value = a.value;
        const ok =
          name === 'src'
            ? siteUrl(value)
            : name === 'srcset'
              ? value.split(',').every((part) => siteUrl(part.trim().split(/\s+/)[0] ?? ''))
              : name === 'style' || name === 'filter' || name === 'mask' || name === 'fill' || name === 'stroke'
                ? siteStyle(value)
                : SAFE_ATTRS.test(name);
        if (!ok) x.removeAttribute(a.name);
      }
    return el;
  }

  // The picture of a themed pack, as the game sets it on each of its boosters (--pack-art): put back in a drawing made
  // without it (a copy of another pack's pile, an older drawing).
  function setPackArt(el, art) {
    if (!el || !art || !siteUrl(art)) return el;
    for (const x of packBoxes(el)) x.style.setProperty('--pack-art', `url('${art.replace(/['()\\]/g, encodeURIComponent)}')`);
    return el;
  }
  // The boosters drawn by the game in an element: their 3D boxes (the class ending in "__pack"), each holding its faces.
  const packBoxes = (el) => [el, ...el.querySelectorAll('[class]')].filter((x) => [...x.classList].some((c) => /__pack$/.test(c)));
  const packArtHtml = (html, art) => {
    const t = document.createElement('template');
    t.innerHTML = html;
    setPackArt(t.content.firstElementChild, art);
    return t.innerHTML;
  };

  // The count written by the game (the pile's "×5", the button's "Tout ouvrir ×5"), set to n.
  function setCount(el, n) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) if (/[×x]\s?\d+/.test(t.nodeValue)) t.nodeValue = t.nodeValue.replace(/([×x]\s?)\d+/, `$1${n}`);
    return el;
  }

  // The kept copies of every kind, or null when one is missing.
  function cachedShots(kinds) {
    const all = readShotStore();
    const shots = [];
    for (const k of kinds) {
      // The drawing of this kind with this shape of pile: the author's published one first, else this player's;
      // only the current ones (SHOTS_V): the older ones are drawn again.
      const key = shapeKey(k.key, k.count);
      // (this player's own drawing first: the game drew it from their real boosters; the published one fills in)
      const kept = all[key]?.v === SHOTS_V ? all[key] : globalStore[key]?.v === SHOTS_V ? globalStore[key] : null;
      const pile = kept && fromHtml(kept.pile);
      const buttons = kept && fromHtml(kept.buttons);
      if (!pile || !buttons) return null;
      shots.push({ ...k, pile: setCount(setPackArt(pile, k.art), k.count), buttons: setCount(buttons, k.count) });
    }
    return shots;
  }

  // The pictures shown in an element (its images, its backgrounds), by file name.
  function pictureFiles(el) {
    const files = new Set();
    for (const x of [el, ...el.querySelectorAll('*')]) {
      const src = x.tagName === 'IMG' ? x.currentSrc || x.getAttribute('src') : getComputedStyle(x).backgroundImage.match(/url\(["']?([^"')]+)/)?.[1];
      const file = src ? decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() || '') : '';
      // next/image: the file is in the "url" parameter.
      const inner = src?.includes('url=') ? decodeURIComponent(new URL(src, location.href).searchParams.get('url') ?? '').split('/').pop() : '';
      if (file) files.add(file);
      if (inner) files.add(inner);
    }
    return files;
  }

  // True when the game's pile shows the boosters of this kind: its own picture (Magie…), or none of the other kinds'
  // pictures for the classic ones.
  function pileShows(pile, k, kinds) {
    if (!pile) return false;
    const files = pictureFiles(pile);
    const fileOf = (art) => art.split(/[?#]/)[0].split('/').pop();
    if (k.art) {
      if (!files.has(fileOf(k.art))) return false;
      // Its picture loaded (until then the game shows the classic waves in its place).
      const imgs = [...pile.querySelectorAll('img')].filter((img) => (img.currentSrc || img.getAttribute('src') || '').includes(fileOf(k.art)));
      return !imgs.length || imgs.some((img) => img.complete && img.naturalWidth > 0);
    }
    return !kinds.some((x) => x.art && files.has(fileOf(x.art)));
  }

  // Waits until the game's pile no longer moves (its animations write inline styles), 1.2 s at most.
  async function pileStill() {
    const look = () => {
      const pile = findHomeParts()?.pile;
      return pile ? [...pile.querySelectorAll('[style]')].map((x) => x.getAttribute('style')).join('|') + pile.childElementCount : '';
    };
    let last = look();
    for (let still = 0, t = 0; still < 2 && t < 20; t++) {
      await pause(60);
      const now = look();
      still = now === last ? still + 1 : 0;
      last = now;
    }
  }

  // Hides the game's pile and buttons (Aquaman's piles take their place).
  function hideHome() {
    const parts = findHomeParts();
    parts?.pile.setAttribute('data-aqm-hidden', '');
    parts?.buttons.setAttribute('data-aqm-hidden', '');
    return parts;
  }

  // True while the game shows something above the page (the opening of a booster, a window).
  const gameBusy = () =>
    !!document.querySelector('[role="dialog"]:not(.aqm-root *), [aria-modal="true"]:not(.aqm-root *)') ||
    (!overlay && [document.body, document.documentElement].some((el) => getComputedStyle(el).overflow === 'hidden'));

  // Draws the game's pile for each kind, then puts the game back on all of its boosters.
  async function drawPiles(kinds, sig) {
    drawing = true;
    const title = [...document.querySelectorAll('h1, h2, h3')].find((t) => !t.closest('.aqm-root') && /à ouvrir/i.test(t.textContent));
    title?.setAttribute('data-aqm-veiled', ''); // its count follows the kind being drawn
    hideHome(); // the game's pile changes kind meanwhile
    const shots = [];
    try {
      for (const k of kinds) {
        // Without the game's store (or its pile), the game's page stays as it is.
        if (stopped || !(await showKind(k.key, true))) return void (piles = { sig, shots: null });
        hideHome(); // the game drew its pile again
        // The game may change the texts before the picture: the copy waits for the kind's own picture, loaded (5 s at most).
        let right = false;
        for (let t = 0; t < 84 && !(right = pileShows(findHomeParts()?.pile, k, kinds)); t++) await pause(60);
        if (right) await pause(400).then(pileStill); // (the game's fade from the waves to the pack's picture)
        const parts = findHomeParts();
        if (!parts) return void (piles = { sig, shots: null });
        shots.push({ ...k, pile: copyOf(parts.pile), buttons: copyOf(parts.buttons), right: pileShows(parts.pile, k, kinds) });
      }
      piles = { sig, shots };
      saveShots(shots.filter((shot) => shot.right)); // a wrong drawing is shown this once, never kept
    } finally {
      await showKind('');
      await unveilTitle(title);
      drawing = false;
    }
    markBoosterKinds();
  }

  // A click on a copied button: the game is set on that kind, then its own button is clicked.
  // ---------- the author's scan of every kind of booster ----------
  // On the home page, the game draws its pile for boosters made up of each kind (the classic ones and every kind the
  // shop sells): the drawings are published on the relay, for every Aquaman to show them without drawing anything.

  const SCAN_KEY = 'aqm-scan-packs';
  const SHOP_KEY = 'aqm-scan-shop'; // the shop's packs read before the home page: [[kind, { html, w, h }], …]
  const onShop = () => /^\/jeu\/boutique\/?$/.test(location.pathname);

  // The scan starts in the shop (the site forbids loading its pages in a frame), then goes on on the home page.
  function startScan() {
    if (onShop()) return void scanShop();
    try {
      sessionStorage.setItem(SCAN_KEY, 'shop');
    } catch {}
    location.href = '/jeu/boutique';
  }

  // The scan goes on once the shop, then the home page, shows.
  function resumeScan() {
    let step;
    try {
      step = sessionStorage.getItem(SCAN_KEY);
      if (meId !== AUTHOR_ID || !((step === 'shop' && onShop()) || (step === '1' && /^\/jeu\/?$/.test(location.pathname)))) return;
      sessionStorage.removeItem(SCAN_KEY);
    } catch {
      return;
    }
    if (step === 'shop') scanShop();
    else scanPacks();
  }

  // The design of each pack the shop sells, kept for the home page's scan.
  async function scanShop() {
    if (scanning) return;
    scanning = true;
    const body = openOverlay('Scanner les packs', 'Aquaman lit d’abord le design de chaque pack de la boutique, puis le jeu dessine tes boosters en attente sur l’accueil.');
    const status = h('p', { class: 'aqm-note' }, 'Lecture des packs de la boutique (jusqu’à 20 s)…');
    body.append(status);
    let designs = new Map();
    try {
      const kinds = (await ask({ type: 'pack-kinds' })).kinds.filter((k) => k.kind && KIND_ID.test(k.kind));
      designs = await readShopPacks(kinds);
    } catch (e) {
      status.textContent = e.message;
    } finally {
      scanning = false;
    }
    try {
      sessionStorage.setItem(SHOP_KEY, JSON.stringify([...designs]));
      sessionStorage.setItem(SCAN_KEY, '1');
    } catch {}
    status.textContent = `${designs.size} pack${designs.size > 1 ? 's' : ''} trouvé${designs.size > 1 ? 's' : ''} dans la boutique : retour à l’accueil…`;
    await pause(800);
    location.href = '/jeu';
  }

  // The shop's packs read by scanShop (once).
  function shopDesigns() {
    try {
      const list = JSON.parse(sessionStorage.getItem(SHOP_KEY) || '[]');
      sessionStorage.removeItem(SHOP_KEY);
      return new Map(list);
    } catch {
      return new Map();
    }
  }

  let scanning = false;
  async function scanPacks() {
    if (scanning) return;
    scanning = true;
    const body = openOverlay('Scanner les packs', 'Le jeu dessine tes boosters en attente (1, 2 et 3 boosters et plus), puis Aquaman met le design de chaque pack de la boutique dans ces piles ; les dessins sont publiés pour toutes les extensions.');
    const status = h('p', { class: 'aqm-note' }, 'Lecture des boosters de la boutique…');
    const list = h('ul', { class: 'aqm-scan-list' });
    body.append(status, list);
    while (drawing || opening) await pause(200);
    drawing = true;
    const title = [...document.querySelectorAll('h1, h2, h3')].find((t) => !t.closest('.aqm-root') && /à ouvrir/i.test(t.textContent));
    title?.setAttribute('data-aqm-veiled', '');
    const packs = {};
    const frames = {}; // shape -> a pile drawn by the game: { pile, buttons }, where the shop's packs go
    const themed = {}; // shape -> a themed pile drawn by the game: { pile, buttons, art, name }
    let themedPack = null; // one themed booster drawn by the game: { style, html, art, name }
    let shop = [];
    try {
      try {
        shop = (await ask({ type: 'pack-kinds' })).kinds;
      } catch (e) {
        status.textContent = e.message;
      }
      // First the player's own boosters: the game draws a booster rightly only from its real id. Each kind is drawn
      // with as many of its boosters as the player has (1, 2, 3 and more): the shapes of the piles. The shop's packs
      // come after, in these piles.
      const mine = boosterKinds().map((k) => ({ ...k, kind: k.key, ids: (pendingBoosters ?? []).filter((b) => (b.kind ?? 'classic') === k.key).map((b) => b.id) }));
      const kinds = mine;
      const all = kinds.map((k) => ({ key: k.kind, art: k.art }));
      for (const [i, k] of kinds.entries()) {
        const line = h('li', {}, h('strong', {}, k.name ?? k.kind), ' : ');
        list.append(line);
        const kind = { key: k.kind, art: k.art };
        const drawn = [];
        // The pile as the game draws it with 1, 2, and 3 boosters and more (its fan, its "Tout ouvrir").
        for (const n of SHAPES) {
          if (k.ids.length < n) break; // not enough of this kind for this shape
          status.textContent = `Dessin de ${k.name ?? k.kind} avec ${n} booster${n > 1 ? 's' : ''} (${i + 1}/${kinds.length})…`;
          const items = k.ids.slice(0, n).map((id) => ({ id }));
          if (!(await showKind('', true, false, items))) break;
          hideHome();
          let right = false;
          for (let t = 0; t < 84 && !(right = pileShows(findHomeParts()?.pile, kind, all)); t++) await pause(60);
          if (right) await pause(400).then(pileStill); // (the game's fade from the waves to the pack's picture)
          const parts = findHomeParts();
          if (!parts || !pileShows(parts.pile, kind, all)) continue;
          const buttons = copyOf(parts.buttons).outerHTML;
          packs[shapeKey(k.kind, n)] = { v: SHOTS_V, pile: copyOf(parts.pile).outerHTML, buttons, many: hasAllButton(parts.buttons) ? buttons : null, name: k.name, art: k.art };
          // The game's pile with n boosters: the frame of the shop's packs below (each of its boxes takes the pack's).
          if (!frames[n] || k.kind === 'classic') frames[n] = { pile: packs[shapeKey(k.kind, n)].pile, buttons };
          // A themed booster drawn by the game: the model of every other themed pack (only its picture and name change).
          if (k.art && !themed[n]) themed[n] = { pile: packs[shapeKey(k.kind, n)].pile, buttons, art: k.art, name: k.name };
          if (k.art && !themedPack) themedPack = packOf(parts.pile, k);
          drawn.push(n === 3 ? '3+' : String(n));
        }
        line.append(
          drawn.length
            ? `✅ dessiné par le jeu avec ${drawn.join(', ')} booster${drawn.length > 1 || drawn[0] !== '1' ? 's' : ''}${drawn.length < 3 ? ' (les autres formes viennent de la boutique)' : ''}.`
            : '⛔ dessin incomplet (image du booster introuvable).'
        );
      }
    } finally {
      await showKind('', false, true); // back to the player's own boosters
      await unveilTitle(title);
      drawing = false;
      scanning = false;
    }

    // The shop's packs (every kind it sells, owned or not), each put in the game's piles of 1, 2 and 3+ boosters:
    // for the kinds and the shapes the player's own boosters couldn't give.
    // The other themed packs (the shop's, and the shapes the player's boosters couldn't give): the piles are the same
    // for every themed pack, only the picture and the name change. A themed pile drawn by the game is copied with
    // them changed; for a shape it didn't give, its themed booster goes in the game's pile of that shape. Without any
    // themed booster of the player, the shop's packs are read in the shop page.
    const shapes = SHAPES.filter((n) => themed[n] || frames[n]);
    const owned = new Map(boosterKinds().filter((k) => k.art).map((k) => [k.key, k]));
    const wanted = [...shop.filter((k) => k.kind && KIND_ID.test(k.kind)), ...[...owned.values()].map((k) => ({ kind: k.key, name: k.name, art: k.art }))]
      .filter((k, i, all) => all.findIndex((x) => x.kind === k.kind) === i)
      .filter((k) => k.art && shapes.some((n) => !packs[shapeKey(k.kind, n)]));
    const designs = shopDesigns();
    if (wanted.length) status.textContent = `${designs.size} pack${designs.size > 1 ? 's' : ''} trouvé${designs.size > 1 ? 's' : ''} dans la boutique.`;
    for (const k of wanted) {
      const line = h('li', {}, h('strong', {}, k.name ?? k.kind), designs?.get(k.kind) ? ' (boutique) : ' : ' (copie) : ');
      list.append(line);
      const made = [];
      for (const n of shapes) {
        if (packs[shapeKey(k.kind, n)]) continue; // drawn by the game from the player's own boosters
        // The shop's pack in the game's pile of this shape; else (a pack the shop page doesn't show) a themed pile
        // drawn by the game, with the pack's picture and name.
        let pile = null;
        let buttons = frames[n]?.buttons ?? themed[n]?.buttons;
        if (frames[n] && designs?.get(k.kind)) pile = fillPile(frames[n].pile, designs.get(k.kind));
        else if (themed[n]) {
          pile = renamePack(themed[n].pile, themed[n], k);
          buttons = themed[n].buttons;
        } else if (frames[n] && themedPack) pile = fillPile(frames[n].pile, { ...themedPack, html: renamePack(themedPack.html, themedPack, k) });
        if (!pile || !buttons) continue;
        packs[shapeKey(k.kind, n)] = { v: SHOTS_V, pile: packArtHtml(pile, k.art), buttons, many: null, name: k.name, art: k.art };
        made.push(n === 3 ? '3+' : String(n));
      }
      line.append(made.length ? `✅ dessiné avec ${made.join(', ')} booster${made.length > 1 || made[0] !== '1' ? 's' : ''}.` : '⛔ pas de modèle pour ce pack.');
    }
    // Once the scan is over, closing its window loads the page again (the game and the piles start afresh), after
    // the publication if it is still under way.
    let publishing = Promise.resolve();
    if (overlay?.contains(body)) overlayClosed = () => publishing.finally(() => location.reload());
    const n = Object.keys(packs).length; // one per kind and shape
    if (!n) return void (status.textContent = 'Aucun dessin à publier.');
    status.textContent = `Publication de ${n} dessin${n > 1 ? 's' : ''}…`;
    publishing = send({ type: 'packs-publish', packs });
    const res = await publishing;
    if (res?.needDevice) status.textContent = 'Cet appareil n’est pas approuvé : approuve-le d’abord dans Plus › Joueurs avec Aquaman.';
    else if (!res || res.error) status.textContent = `Le relais a refusé la publication${res?.error ? ` (${res.error})` : ''}.`;
    else {
      status.textContent = `✅ ${res.published ?? n} dessin${n > 1 ? 's' : ''} publié${n > 1 ? 's' : ''} : toutes les extensions les affichent désormais.`;
      globalStore = { ...globalStore, ...packs };
      try {
        chrome.storage.local.set({ [GLOBAL_KEY]: globalStore });
      } catch {}
      piles = null;
      markBoosterKinds();
    }
  }

  // One booster of a pile drawn by the game: its box ({ style, html }, the faces inside), with its kind's art and name.
  function packOf(pile, k) {
    const box = packBoxes(pile)[0];
    return box ? { style: box.getAttribute('style') ?? '', html: copyOf(box).innerHTML, art: k.art, name: k.name } : null;
  }

  // A themed drawing made for another pack: the picture of the model (from.art) becomes the pack's (k.art), and its
  // name (from.name, as the game writes it) becomes the pack's.
  function renamePack(html, from, k) {
    const file = (art) => art.split(/[?#]/)[0].split('/').pop();
    const oldFile = file(from.art);
    const newArt = k.art.split(/[?#]/)[0];
    const t = document.createElement('template');
    t.innerHTML = html;
    for (const el of t.content.querySelectorAll('*'))
      for (const a of [...el.attributes]) if (a.value.includes(oldFile)) el.setAttribute(a.name, a.value.split(from.art.split(/[?#]/)[0]).join(newArt).split(oldFile).join(file(k.art)));
    if (from.name && k.name) {
      const walker = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.nodeValue.trim();
        if (text.toLowerCase() !== from.name.toLowerCase()) continue;
        const name = text === text.toUpperCase() ? k.name.toUpperCase() : k.name;
        n.nodeValue = n.nodeValue.replace(text, name);
      }
    }
    return [...t.content.childNodes].map((x) => x.outerHTML ?? '').join('');
  }

  // A pile drawn by the game with another pack in each of its boxes (design: { style, html }); its fan, its tilts
  // and its count stay. Null when the pile has no box.
  function fillPile(pileHtml, design) {
    const t = document.createElement('template');
    t.innerHTML = pileHtml;
    const pile = t.content.firstElementChild;
    const boxes = pile ? packBoxes(pile) : [];
    if (!boxes.length) return null;
    for (const box of boxes) {
      box.setAttribute('style', design.style ?? '');
      box.innerHTML = design.html;
    }
    return pile.outerHTML;
  }

  // The shop page (shown): the box of each kind's pack ({ style, html }), found by its picture or its title.
  async function readShopPacks(kinds) {
    const found = new Map();
    const fileOf = (art) => (art ?? '').split(/[?#]/)[0].split('/').pop();
    for (let t = 0; t < 80 && found.size < kinds.length; t++) {
      await pause(250);
      const boxes = packBoxes(document.body).filter((x) => !x.closest('.aqm-root'));
      for (const k of kinds) {
        if (found.has(k.kind)) continue;
        const name = k.name?.toLowerCase();
        const box =
          (k.art && boxes.find((x) => (x.getAttribute('style') ?? '').includes(fileOf(k.art)))) ||
          (name && boxes.find((x) => x.querySelector('[class*="__packTitle"]')?.textContent.trim().toLowerCase() === name));
        if (box) found.set(k.kind, { style: box.getAttribute('style') ?? '', html: copyOf(box).innerHTML });
      }
      if (found.size && t > 40) break; // the kinds left are not in the shop
    }
    return found;
  }

  // The title "N à ouvrir" stays hidden until the game's count (which it animates) is back to all the boosters.
  async function unveilTitle(title) {
    // (the number of boosters as inject.js last wrote it: it may change meanwhile, after an opening)
    const all = () => {
      try {
        return JSON.parse(document.documentElement.getAttribute('data-aqm-boosters') || '[]').length;
      } catch {
        return (pendingBoosters ?? []).length;
      }
    };
    for (let t = 0; t < 40 && title?.isConnected && !new RegExp(`^\\D*${all()}\\b`).test(title.textContent.trim()); t++) await pause(60);
    if (title) applyTitleCount(title, true); // shown at once with the count of the kind in front
    title?.removeAttribute('data-aqm-veiled');
  }

  // The title "N à ouvrir" counts the boosters of the kind in front of the wheel (the game counts them all). Kept when
  // the game writes its count again; left to the game while it draws a kind or opens one, and before React took the
  // page over (a text changed before would not match what React expects).
  let titleCount = null; // the count shown, null: the game's
  let titleWatch = null; // { title, observer }
  const homeTitle = () => [...document.querySelectorAll('h1, h2, h3')].find((t) => !t.closest('.aqm-root') && /à ouvrir/i.test(t.textContent));
  function showTitleCount(n) {
    titleCount = n;
    if (n == null) {
      titleWatch?.observer.disconnect();
      titleWatch = null;
      return;
    }
    const title = homeTitle();
    if (!title) return;
    if (titleWatch?.title !== title) {
      titleWatch?.observer.disconnect();
      const observer = new MutationObserver(() => applyTitleCount(title));
      observer.observe(title, { childList: true, subtree: true, characterData: true });
      titleWatch = { title, observer };
    }
    applyTitleCount(title);
  }
  function applyTitleCount(title, now = false) {
    if (titleCount == null || stopped || (!now && (drawing || opening)) || !(settled || document.documentElement.hasAttribute('data-aqm-hydrated'))) return;
    // The first text that starts with the count ("8", or "8 à ouvrir" in one piece).
    const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!/^\s*\d+/.test(t.nodeValue)) continue;
      const want = t.nodeValue.replace(/^(\s*)\d+/, `$1${titleCount}`);
      if (t.nodeValue !== want) t.nodeValue = want;
      return;
    }
  }

  // The game draws the 3D pack of its opening window with the classic picture when it opens several boosters: while
  // Aquaman opens a themed kind, its picture is written on the page for inject.js, which puts it in the classic one's
  // place.
  const OPENING_ART = 'data-aqm-opening-art';

  async function openFromCopy(key, index) {
    if (drawing || opening) return;
    opening = true;
    const title = [...document.querySelectorAll('h1, h2, h3')].find((t) => !t.closest('.aqm-root') && /à ouvrir/i.test(t.textContent));
    title?.setAttribute('data-aqm-veiled', ''); // its count goes through the kind's
    try {
      if (!(await showKind(key, true))) return;
      title?.removeAttribute('data-aqm-veiled'); // the game counts the boosters of the kind it opens
      const real = [...(findHomeParts()?.buttons.querySelectorAll('button') ?? [])][index];
      const art = boosterKinds().find((k) => k.key === key)?.art;
      if (art && siteUrl(art)) document.documentElement.setAttribute(OPENING_ART, art.split(/[?#]/)[0]);
      real?.click();
      // The game opens (its window shows): the copies are drawn again once it is done.
      const started = Date.now();
      while (!stopped && (Date.now() - started < 1500 || gameBusy())) await pause(500);
      // Back to all the boosters, read again (the opened ones are gone).
      title?.setAttribute('data-aqm-veiled', '');
      await showKind('', false, true);
      await unveilTitle(title);
    } finally {
      document.documentElement.removeAttribute(OPENING_ART);
      title?.removeAttribute('data-aqm-veiled');
      opening = false;
      piles = null;
      markBoosterKinds();
    }
  }

  // ---------- home: more than 10 boosters, 10 at a time ----------
  // The game's "Tout ouvrir" opens 10 boosters at most. When more of that kind wait, its window of cards gets, beside
  // "Fermer", a button "Ouvrir les 10 suivants": it closes the window and clicks the game's "Tout ouvrir" again, on
  // the same kind. Each opening is a real one of the game, with its animation; nothing goes past its limit.

  let chaining = false;
  const OPEN_ALL = /^tout ouvrir/i;

  // The kind a "Tout ouvrir" opens: the one in front of the piles, else the one the game is set on, else its only one.
  function kindOpened(button) {
    if (button?.closest('.aqm-piles')) return wheelKey;
    const set = (() => {
      try {
        return sessionStorage.getItem(KIND_KEY) || '';
      } catch {
        return '';
      }
    })();
    if (set) return set;
    const kinds = boosterKinds();
    return kinds.length === 1 ? kinds[0].key : '';
  }
  const kindCount = (key) => (key ? boosterKinds().find((k) => k.key === key)?.count : pendingBoosters?.length) ?? null;

  // A click of the player on a "Tout ouvrir" (the game's or a copy): what it opens is kept; on "Ouvrir" (one
  // booster), forgotten. (Aquaman's own clicks, untrusted, are not counted: openMore sets the batch itself.)
  document.addEventListener(
    'click',
    (e) => {
      const button = !stopped && e.isTrusted && e.target instanceof Element ? e.target.closest('button') : null;
      const text = button?.textContent.trim() ?? '';
      if (OPEN_ALL.test(text)) {
        const kind = kindOpened(button);
        batch = { kind, before: kindCount(kind), opened: null };
      } else if (/^ouvrir\b/i.test(text) && !button.classList.contains('aqm-open-more')) batch = null;
    },
    true
  );

  // The window of cards closes by itself AUTO_CLOSE ms after its last card (setting openMoreAuto): on the next ones
  // when some wait, else on the home page. A click in the window stops it, to look at the cards.
  const AUTO_CLOSE = 5000;
  let autoEnd = null; // { row, close, left, ends, timer, cancelled }

  function stopAuto(cancelled = false) {
    if (!autoEnd) return;
    clearInterval(autoEnd.timer);
    autoEnd.timer = 0;
    autoEnd.cancelled = cancelled;
    document.querySelectorAll('.aqm-open-count').forEach((el) => el.remove());
    if (!cancelled) autoEnd = null;
  }

  function tickAuto() {
    const a = autoEnd;
    if (!a?.timer) return;
    if (stopped || !a.row.isConnected) return stopAuto();
    const ms = a.ends - Date.now();
    if (ms <= 0) {
      stopAuto();
      a.left > 0 ? openMore(a.close) : a.close.click();
      return;
    }
    const text = `${Math.ceil(ms / 1000)} s`;
    for (const el of document.querySelectorAll('.aqm-open-count')) if (el.textContent !== text) el.textContent = text;
  }

  // (a click in the window of cards, but on Aquaman's button: the countdown stops)
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!autoEnd?.timer || !e.isTrusted || !(e.target instanceof Element) || e.target.closest('.aqm-open-more')) return;
      stopAuto(true);
    },
    true
  );

  function markOpenMore() {
    const old = document.querySelector('.aqm-open-more');
    if (!batch && !old && !autoEnd) return;
    // (several boosters opened at once; left: those of their kind still waiting)
    const multi = batch?.opened > 1;
    const left = multi && batch.before != null ? Math.max(0, batch.before - batch.opened) : 0;
    // The window of cards: its "Fermer" beside "Voir ma collection".
    const close = multi && !chaining ? [...document.querySelectorAll('button')].find((b) => !b.closest('.aqm-root') && /^fermer$/i.test(b.textContent.trim())) : null;
    const row = close?.parentElement;
    if (!row || ![...row.querySelectorAll('button')].some((b) => /collection/i.test(b.textContent))) {
      old?.remove();
      stopAuto();
      return;
    }
    const auto = on('openMoreAuto');
    if (auto && autoEnd?.row !== row) {
      stopAuto();
      autoEnd = { row, close, left, ends: Date.now() + AUTO_CLOSE, timer: setInterval(tickAuto, 200), cancelled: false };
    }
    const counting = !!autoEnd?.timer;
    // Nothing left: only the countdown, beside "Fermer".
    const next = Math.min(batch.opened, left);
    const label = left > 0 ? `Ouvrir ${next > 1 ? `les ${fmt(next)} suivants` : 'le dernier'} (${fmt(left)})` : 'Fermeture dans';
    const key = `${label}|${counting}`;
    if (old?.parentElement === row && old.dataset.key === key) return;
    old?.remove();
    if (left <= 0 && !counting) return;
    const count = counting ? h('span', { class: 'aqm-open-count' }, `${Math.ceil((autoEnd.ends - Date.now()) / 1000)} s`) : null;
    if (left > 0) {
      const icon = row.querySelector('button svg')?.cloneNode(true) ?? null;
      row.prepend(h('button', { type: 'button', class: `${row.querySelector('button')?.className ?? ''} aqm-open-more`, 'data-key': key, onclick: () => (stopAuto(), openMore(close)) }, icon, label, count));
    } else
      close.before(
        h('span', { class: 'aqm-open-more aqm-open-note', 'data-key': key, title: 'Clique dans la fenêtre pour la garder ouverte' }, label, ' ', count)
      );
  }

  // Closes the window of cards, waits for the home page, then opens the next ones of the same kind.
  async function openMore(close) {
    if (chaining || !batch) return;
    chaining = true;
    const { kind } = batch;
    const left = batch.before - batch.opened;
    document.querySelector('.aqm-open-more')?.remove();
    try {
      close.click();
      // (the window goes, then the copies of the piles are drawn again)
      const started = Date.now();
      while (!stopped && Date.now() - started < 15e3 && (gameBusy() || opening || drawing || !findHomeParts())) await pause(250);
      await pause(400);
      if (stopped || gameBusy()) return;
      batch = { kind, before: left, opened: null };
      const strip = document.querySelector('.aqm-piles');
      const shot = strip && piles?.shots?.find((s) => s.key === kind);
      if (shot) {
        const index = [...shot.buttons.querySelectorAll('button')].findIndex((b) => OPEN_ALL.test(b.textContent.trim()));
        if (index >= 0) openFromCopy(kind, index);
        return;
      }
      const real = [...(findHomeParts()?.buttons.querySelectorAll('button') ?? [])].find((b) => OPEN_ALL.test(b.textContent.trim()));
      real?.click();
    } finally {
      chaining = false;
    }
  }

  function markBoosterKinds() {
    if (!featLoaded || !on('boosterWheel') || !/^\/jeu\/?$/.test(location.pathname) || drawing || opening) return;
    // The game read its boosters before Aquaman listened: inject.js wrote them on the page; else Aquaman reads them
    // once itself (all of them).
    try {
      const kept = JSON.parse(document.documentElement.getAttribute('data-aqm-boosters') || 'null');
      if (Array.isArray(kept)) pendingBoosters = kept.filter((b) => b?.id);
    } catch {}
    if (!pendingBoosters && !boostersAsked) {
      boostersAsked = true;
      setKind('');
      window.__aquamanSelf = true; // in the userscript, inject.js leaves this answer whole
      const asked = pageFetch('/api-game/v1/me', { credentials: 'include', headers: { accept: 'application/json' } });
      window.__aquamanSelf = false;
      asked
        .then((res) => (res.ok ? res.json() : null))
        .then((me) => {
          if (!Array.isArray(me?.pending) || pendingBoosters) return;
          pendingBoosters = me.pending.filter((b) => b?.id).map((b) => ({ id: b.id, kind: b.kindId ?? null, name: b.kindName ?? null, art: b.kindArt ?? null }));
          markBoosterKinds();
        })
        .catch(() => {});
    }
    const kinds = boosterKinds();
    const parts = findHomeParts();
    let strip = document.querySelector('.aqm-piles');
    const off = () => {
      showTitleCount(null);
      strip?.remove();
      document.querySelectorAll('[data-aqm-hidden]').forEach((el) => el.removeAttribute('data-aqm-hidden'));
    };
    if (!parts || kinds.length < 2) return off();
    const sig = kinds.map((k) => `${k.key}:${k.count}`).join('|');
    // New counts: the piles are drawn again (not while the game shows an opening).
    if (piles?.sig !== sig) {
      if (!shotStore) return; // the kept copies are being read
      // The piles already seen are shown at once; the game draws only the kinds never seen.
      const known = cachedShots(kinds);
      if (known) piles = { sig, shots: known };
      else {
        if (!gameBusy()) drawPiles(kinds, sig);
        return;
      }
    }
    if (!piles.shots) return off();
    parts.pile.setAttribute('data-aqm-hidden', '');
    parts.buttons.setAttribute('data-aqm-hidden', '');
    if (!strip || strip.previousElementSibling !== parts.pile) {
      strip?.remove();
      strip = h('div', { class: 'aqm-root aqm-piles' });
      parts.pile.after(strip);
    }
    if (strip.dataset.sig === sig) return void showTitleCount(titleCount);
    strip.dataset.sig = sig;
    renderWheel(strip, piles.shots);
  }

  // The piles, the free boosters first: one in front and its neighbours beside it, in a row that turns (three kinds
  // or more), with arrows, a click on a pile beside or a swipe.
  let wheelKey = null; // the kind in front, kept while the piles are drawn again
  function renderWheel(strip, shots) {
    const ordered = [...shots].sort((a, b) => (b.key === 'classic') - (a.key === 'classic'));
    const n = ordered.length;
    let at = Math.max(0, ordered.findIndex((s) => s.key === wheelKey));
    // The game's buttons of each kind: under the piles, they don't move and follow the kind in front.
    const buttonsOf = ordered.map((shot) => {
      const buttons = shot.buttons.cloneNode(true);
      [...buttons.querySelectorAll('button')].forEach((b, j) =>
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openFromCopy(shot.key, j);
        })
      );
      return buttons;
    });
    const controls = h('div', { class: 'aqm-wheel-controls' });
    const items = ordered.map((shot, i) => {
      const art = h('div', { class: 'aqm-pile-art' }, shot.pile.cloneNode(true));
      tiltOnHover(art);
      const pick = () => {
        const front = ((at % n) + n) % n;
        if (i !== front) turn(i - front);
      };
      // (no name above it: the pack shows its kind)
      return h('div', { class: 'aqm-pile', title: shot.name, onclick: pick }, art);
    });
    const track = h('div', { class: 'aqm-wheel-track' }, items);
    const arrow = (dir, label) => h('button', { type: 'button', class: `aqm-wheel-arrow is-${dir < 0 ? 'prev' : 'next'}`, 'aria-label': label, onclick: () => turn(dir) }, dir < 0 ? '‹' : '›');
    const dots = h('div', { class: 'aqm-wheel-dots' });
    const prev = arrow(-1, 'Catégorie précédente');
    const next = arrow(1, 'Catégorie suivante');
    const wheel = h('div', { class: 'aqm-wheel' }, prev, track, next);
    strip.replaceChildren(wheel, controls, dots);

    let width = 0;
    function place() {
      fitStrip(strip);
      width = width || Math.max(...items.map((el) => el.offsetWidth)) || 360;
      const room = strip.clientWidth || width;
      // Three kinds shown at most: the one in front and a neighbour on each side (never over it, and only when the
      // field is wide enough); the others wait behind them, unseen. From three kinds on, the row goes round.
      const front = ((at % n) + n) % n;
      const half = Math.floor(n / 2);
      const side = 0.72;
      const offset = Math.round(width / 2 + (width * side) / 2 + 40);
      const fits = offset + (width * side) / 2 <= room / 2 - 8;
      items.forEach((el, i) => {
        const d = n >= 3 ? ((((i - front) % n) + n + half) % n) - half : i - front;
        el.style.transform = d ? `translateX(${Math.sign(d) * offset}px) scale(${Math.abs(d) > 1 ? side * 0.8 : side})` : 'none';
        el.classList.toggle('is-front', !d);
        el.classList.toggle('is-away', Math.abs(d) > 1 || (!!d && !fits));
      });
      wheelKey = ordered[front].key;
      showTitleCount(ordered[front].count);
      paintGlow(wheel, ordered[front]);
      if (controls.firstChild !== buttonsOf[front]) controls.replaceChildren(buttonsOf[front]);
      // Two kinds: no arrow toward nothing.
      prev.hidden = n < 3 && at === 0;
      next.hidden = n < 3 && at === n - 1;
      dots.replaceChildren(...ordered.map((s, i) => h('button', { type: 'button', class: `aqm-wheel-dot${i === front ? ' is-on' : ''}`, 'aria-label': s.name, title: s.name, onclick: () => turn(i - front) })));
    }
    // The wheel turns the shortest way; two kinds go from one to the other.
    function turn(dir) {
      if (n >= 3) at += dir > n / 2 ? dir - n : dir < -n / 2 ? dir + n : dir;
      else at = Math.min(n - 1, Math.max(0, at + Math.sign(dir)));
      place();
    }
    let touchX = null;
    track.addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
    track.addEventListener('touchend', (e) => {
      const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
      if (touchX != null && Math.abs(dx) > 40) turn(dx < 0 ? 1 : -1);
      touchX = null;
    });
    strip.classList.add('is-still');
    place();
    requestAnimationFrame(() => {
      width = 0;
      place();
      requestAnimationFrame(() => strip.classList.remove('is-still'));
    });
  }

  // The glow behind the booster in front takes the colour of its pack: the main colour of its picture (the most vivid
  // pixels count the most), the game's blue for the classic boosters. Read once per picture.
  const GLOW_BLUE = [37, 99, 235];
  const glowOf = new Map(); // picture -> Promise<[r, g, b] | null>
  function packColour(art) {
    if (!art) return Promise.resolve(null);
    if (!glowOf.has(art))
      glowOf.set(
        art,
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = 24;
              const g = canvas.getContext('2d', { willReadFrequently: true });
              g.drawImage(img, 0, 0, 24, 24);
              const d = g.getImageData(0, 0, 24, 24).data;
              let r = 0;
              let gr = 0;
              let b = 0;
              let w = 0;
              for (let i = 0; i < d.length; i += 4) {
                const max = Math.max(d[i], d[i + 1], d[i + 2]);
                const sat = max ? (max - Math.min(d[i], d[i + 1], d[i + 2])) / max : 0;
                const weight = (d[i + 3] / 255) * sat * sat * (max / 255);
                r += d[i] * weight;
                gr += d[i + 1] * weight;
                b += d[i + 2] * weight;
                w += weight;
              }
              if (w < 0.5) return resolve(null);
              // (as bright as the game's blue glow, whatever the picture)
              const c = [r / w, gr / w, b / w];
              const k = 235 / Math.max(...c);
              resolve(c.map((x) => Math.round(x * k)));
            } catch {
              resolve(null); // a picture of another site: its pixels can't be read
            }
          };
          img.onerror = () => resolve(null);
          img.src = art;
        })
      );
    return glowOf.get(art);
  }
  async function paintGlow(wheel, shot) {
    const c = (on('packGlow') && (await packColour(shot.art))) || GLOW_BLUE;
    if (wheelKey === shot.key) wheel.style.setProperty('--aqm-glow', `rgb(${c.join(' ')} / 0.38)`);
  }

  // The strip takes the whole inner width of the home's field (the rounded box around the boosters), whatever the
  // width of the column it is in.
  function fitStrip(strip) {
    let field = strip.parentElement;
    while (field && field !== document.body) {
      const cs = getComputedStyle(field);
      if (parseFloat(cs.borderTopLeftRadius) >= 16 && field.clientWidth >= 480) break;
      field = field.parentElement;
    }
    if (!field || field === document.body) field = document.querySelector('main') ?? strip.parentElement;
    const cs = getComputedStyle(field);
    const r = field.getBoundingClientRect();
    const left = r.left + parseFloat(cs.paddingLeft) + 16;
    const width = Math.max(0, r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 32);
    strip.style.width = `${Math.round(width)}px`;
    strip.style.left = '0px';
    strip.style.left = `${Math.round(left - strip.getBoundingClientRect().left)}px`;
  }
  let fitTimer = 0;
  let fitWidth = innerWidth;
  addEventListener('resize', () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      const strip = document.querySelector('.aqm-piles');
      // (on a phone, the address bar that shows or hides while scrolling changes the height only)
      if (stopped || !strip || innerWidth === fitWidth) return;
      fitWidth = innerWidth;
      delete strip.dataset.sig; // drawn again at the new width
      markBoosterKinds();
    }, 150);
  });

  // As in the game (measured on a recording of it): the booster on top of the pile floats up and down (16 px, 4.7 s
  // a round), and turns toward the pointer around its pose (rotateY(-20deg) rotateX(7deg)), about 9° each way from
  // left to right; the boosters fanned behind it don't move, nothing grows.
  function tiltOnHover(el) {
    // The booster on top: the one outside the fanned layers (aria-hidden).
    const pose = [...el.querySelectorAll('[class*="__packPose"]')].find((p) => !p.closest('[aria-hidden="true"]'));
    if (!pose) return;
    const scene = pose.closest('[class*="__packScene"]');
    scene?.parentElement?.setAttribute('data-aqm-float', '');
    const base = pose.style.transform || 'rotateY(-20deg) rotateX(7deg)';
    const ry = Number(base.match(/rotateY\((-?[\d.]+)deg\)/)?.[1] ?? -20);
    const rx = Number(base.match(/rotateX\((-?[\d.]+)deg\)/)?.[1] ?? 7);
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5));
      const y = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5));
      pose.classList.add('aqm-pose-follow');
      pose.style.transform = `rotateY(${(ry + x * 18).toFixed(2)}deg) rotateX(${(rx - y * 10).toFixed(2)}deg)`;
    });
    el.addEventListener('pointerleave', () => {
      pose.classList.remove('aqm-pose-follow');
      pose.style.transform = base;
    });
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
    if (location.hash.startsWith(TOUR_HASH)) history.replaceState(null, '', location.pathname + location.search);
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
    if (location.hash.startsWith(TOUR_HASH) || location.hash === NEWS_HASH || session(TOUR_STEP) != null) return;
    const version = chrome.runtime.getManifest().version;
    const { seenVersion, settings } = await chrome.storage.local.get(['seenVersion', 'settings']);
    if (seenVersion === version) return;
    await chrome.storage.local.set({ seenVersion: version });
    if (!seenVersion) startTour(0);
    else if (settings?.notifyUpdated !== false && versionNewer(version, seenVersion)) openNews(seenVersion);
  }

  // Opens the tour or what's new from the address (#aqm-visite, #aqm-nouveautes), used by the popup and the notifications.
  function onHash() {
    const step = location.hash.startsWith(`${TOUR_HASH}-`) ? TOUR.findIndex((s) => s.id === location.hash.slice(TOUR_HASH.length + 1)) : -1;
    if (step >= 0 && !tour) startTour(step);
    else if (location.hash === TOUR_HASH && !tour) startTour(0);
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
    send({ type: 'wants-sync', fresh: true });
  }

  function onOutside(e) {
    if (menu && !menu.contains(e.target) && !menu.anchor?.contains(e.target) && !e.target.closest?.('.aqm-tour')) closeMenu();
  }

  // ---------- loop ----------

  // The steps of run() that a setting turns off (SETTINGS in src/lib/aquaman.js).
  const STEP_SETTING = new Map([
    [enlargePulls, 'bigPulls'],
    [showPity, 'pity'],
    [markSeriesStrip, 'seriesTools'],
    [markFavoriteSeries, 'seriesTools'],
    [markAlbum, 'albumButtons'],
    [markMissingTab, 'missingTab'],
    [markMissingSales, 'missingSales'],
    [markCardWho, 'cardWho'],
    [markCardListings, 'cardListings'],
    [markSellDialog, 'sellTools'],
    [markUnlistButton, 'sellTools'],
    [hideBoughtCards, 'hideBought'],
    [markMarketFavorites, 'marketFavorites'],
    [markRecycleDialog, 'recycleHelp'],
    [markBoosterKinds, 'boosterWheel'],
    [markOpenMore, 'openMore'],
    [enhanceShowcaseEditor, 'showcaseDrag'],
    [markTrades, 'tradeMarks'],
    [markTradeFilters, 'tradeFilters']
  ]);

  function run() {
    if (stopped) return;
    if (!alive()) return shutdown();
    const inGame = location.pathname.startsWith('/jeu');
    // Out of the game, only the exchanges sent in the private messages are marked.
    if (!inGame && !TRADE_PAGES.test(location.pathname)) return;
    if (location.pathname !== visitPath) {
      visitPath = location.pathname;
      pageVisit++;
    }
    const began = performance.now();
    runText = null;
    for (const step of [addPlusTab, enlargePulls, showPity, readPityRules, markSeriesStrip, markFavoriteSeries, markAlbum, markMissingTab, markMissingSales, markCardWho, markCardListings, markSellDialog, markUnlistButton, hideBoughtCards, markMarketFavorites, watchSaleToast, markRecycleDialog, markBoosterKinds, markOpenMore, resumeScan, enhanceShowcaseEditor, markTrades, markTradeFilters, pollFeedNow, sayHello, checkAccess, lookForUpdate, startOnce]) {
      if (STEP_SETTING.has(step) && !on(STEP_SETTING.get(step))) continue;
      if (!inGame && step !== markTrades && step !== checkAccess) continue;
      try {
        step();
      } catch (e) {
        console.warn('[Aquaman]', e);
      }
    }
    runText = undefined;
    runCost = performance.now() - began;
  }

  // The script has no background worker: while a page of the game is open, the "beaux tirages" are read every minute.
  let feedAt = 0;
  function pollFeedNow() {
    if (Date.now() - feedAt < 60e3) return;
    feedAt = Date.now();
    send({ type: 'feed-poll' });
  }

  // While a page of the game is open, Aquaman tells the relay every 10 minutes that it is used (the author's list of
  // the players with Aquaman); the run of a page that changes nothing waits for the timer below.
  const HELLO_EVERY = 10 * 60e3;
  let helloAt = 0;
  function sayHello() {
    if (Date.now() - helloAt < HELLO_EVERY) return;
    helloAt = Date.now();
    send({ type: 'hello', kind: owner }).then((res) => res?.revoked && !stopped && revoke());
  }

  // The author took Aquaman back from this player: everything it added goes, and a word says why (once a visit).
  function revoke() {
    shutdown();
    if (session('aqm-revoked-told')) return;
    session('aqm-revoked-told', '1');
    const box = h(
      'div',
      { class: 'aqm-root aqm-update', role: 'status' },
      h('div', { class: 'aqm-queue-head' }, h('strong', {}, '🔱 Aquaman est désactivé')),
      h('p', {}, 'L’auteur d’Aquaman a désactivé son utilisation pour ton compte.'),
      h('div', { class: 'aqm-update-actions' }, h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => box.remove() }, 'OK'))
    );
    document.body.append(box);
  }
  const helloTimer = setInterval(() => {
    if (stopped || !settled || document.visibilityState !== 'visible') return;
    sayHello();
    checkAccess();
  }, 60e3);

  // Whether the author took Aquaman back from this player: asked once a minute while a page of the game is shown.
  let accessAt = 0;
  function checkAccess() {
    if (Date.now() - accessAt < 55e3) return;
    accessAt = Date.now();
    send({ type: 'access' }).then((res) => res?.revoked && !stopped && revoke());
  }

  // The script also looks for a new version every 10 minutes (the script managers only look once a day), and offers
  // it in a box at the bottom of the screen; the extension tells it with its notification and its window.
  const UPDATE_EVERY = 10 * 60e3;
  const SCRIPT_URL = 'https://raw.githubusercontent.com/A-Finch13/Poseidon-TCG/main/aquaman.user.js';
  let updateAt = 0;
  function lookForUpdate() {
    if (owner !== 'userscript' || Date.now() - updateAt < UPDATE_EVERY) return;
    updateAt = Date.now();
    send({ type: 'check-update' }).then((res) => !stopped && showUpdate(res?.update));
  }

  function showUpdate(update) {
    const version = chrome.runtime.getManifest().version;
    if (!update?.version || !versionNewer(update.version, version) || session('aqm-update-later') === update.version) return;
    if (document.querySelector('.aqm-update')) return;
    const box = h(
      'div',
      { class: 'aqm-root aqm-update', role: 'status' },
      h('div', { class: 'aqm-queue-head' }, h('strong', {}, `🔱 Aquaman ${update.version} est disponible`)),
      h('p', {}, `Tu as la version ${version}. Touche « Installer », puis : Android → « Mettre à jour » dans Tampermonkey ; iPhone → « AA » (ou 🧩) dans la barre d’adresse → Userscripts → « Installer ». Recharge ensuite cette page.`),
      h(
        'div',
        { class: 'aqm-update-actions' },
        h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => (session('aqm-update-later', update.version), box.remove()) }, 'Plus tard'),
        h('a', { class: 'aqm-queue-btn is-main', href: update.script || SCRIPT_URL, target: '_blank', rel: 'noopener', onclick: () => box.remove() }, 'Installer')
      )
    );
    document.body.append(box);
  }

  // A page that changes all the time (an exchange, its list of cards) would have Aquaman run over and over: the longer
  // its last run took, the longer it waits (8 times as long, 0.15 to 1.5 s), so the game keeps most of the time.
  // The run waits for a moment when the browser has nothing to draw (1 s more at most), and for the tab to be shown
  // again when it is hidden.
  // Settings changed elsewhere: a box offers to load the page again to apply them.
  function offerReload() {
    if (document.querySelector('.aqm-reload')) return;
    const box = h(
      'div',
      { class: 'aqm-root aqm-update aqm-reload', role: 'status' },
      h('div', { class: 'aqm-queue-head' }, h('strong', {}, '🔱 Réglages d’Aquaman modifiés')),
      h('p', {}, 'Recharge la page pour les appliquer.'),
      h(
        'div',
        { class: 'aqm-update-actions' },
        h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => box.remove() }, 'Plus tard'),
        h('button', { type: 'button', class: 'aqm-queue-btn is-main', onclick: () => location.reload() }, 'Recharger')
      )
    );
    document.body.append(box);
  }

  let queued = false;
  let runCost = 0;
  // A visit of a page: a new one each time the path changes (another series keeps the path).
  let pageVisit = 0;
  let visitPath = '';
  let missedRun = false;
  function schedule() {
    if (queued || stopped) return;
    if (document.hidden) return void (missedRun = true);
    queued = true;
    setTimeout(() => {
      const go = () => {
        queued = false;
        if (document.hidden) return void (missedRun = true);
        run();
      };
      if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 1000 });
      else go();
    }, Math.min(1500, Math.max(150, runCost * 8)));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !missedRun) return;
    missedRun = false;
    schedule();
  });

  const observer = new MutationObserver((records) => records.some((r) => !quietChange(r)) && schedule());
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
    [document, 'click', onSellClick, true],
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
    clearInterval(helloTimer);
    for (const [target, type, fn, opts] of listeners) target.removeEventListener(type, fn, opts);
    if (tour) cancelAnimationFrame(tour.raf);
    tour = null;
    menu = null;
    overlay = null;
    document.querySelectorAll('.aqm-root, .aqm-plus, .aqm-open-more, .aqm-trade-filter').forEach((el) => el.remove());
    document.querySelectorAll('[data-aqm-tradehide]').forEach((el) => el.removeAttribute('data-aqm-tradehide'));
    document.querySelectorAll('[class*="aqm-"]').forEach((el) => {
      for (const cls of [...el.classList]) if (cls.startsWith('aqm-')) el.classList.remove(cls);
    });
    document.querySelectorAll('[data-aqm-slot]').forEach((el) => delete el.dataset.aqmSlot);
    document.querySelectorAll('[data-aqm-lite]').forEach((el) => delete el.dataset.aqmLite);
    document.querySelectorAll('[data-aqm-anchor]').forEach((el) => {
      el.style.position = '';
      delete el.dataset.aqmAnchor;
    });
    root.classList.remove('aqm-lock');
    if (root.dataset.aqmOwner === owner) delete root.dataset.aqmOwner;
  }

  // Starts once the site's React has taken over the page sent by the server (hydration): an element added before
  // would not match what React expects ("Minified React error #418").
  // inject.js says when React took over every button of the page (data-aqm-hydrated): the album of the collection is
  // sometimes taken over long after the page loaded. (16 s at most, without inject.js.)
  function whenSettled(start) {
    const idle = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 300));
    const since = Date.now();
    const wait = () => (document.documentElement.hasAttribute('data-aqm-hydrated') || Date.now() - since > 16e3 ? idle() : setTimeout(wait, 150));
    if (document.readyState === 'complete') wait();
    else addEventListener('load', wait, { once: true });
  }

  // The home's boosters are shown as soon as the game draws its pile, without waiting for the whole page (see
  // whenSettled): the pile only comes once the game has read its boosters, after React took the page over. run()
  // takes over once the page is settled.
  addEventListener('message', (e) => {
    if (e.source === window && e.data?.aquaman === 'boosters-refreshed') onBoostersRefreshed(e.data.id, !!e.data.ok);
  });
  Promise.all([loadShotStore(), featReady]).then(() => !stopped && /^\/jeu\/?$/.test(location.pathname) && markBoosterKinds());
  // The series and favourites are read as soon as the script starts, in any page of the game: the stars of the
  // Collection come with its strip, even when it is the first page opened.
  featReady.then(() => {
    if (stopped || favLoading || seriesBySlug || !on('seriesTools') || !location.pathname.startsWith('/jeu')) return;
    favLoading = true;
    loadFavIds().finally(() => {
      favLoading = false;
      schedule();
    });
  });
  if (/^\/jeu\/?$/.test(location.pathname)) {
    let frame = 0;
    const early = new MutationObserver(() => {
      if (settled || stopped) return early.disconnect();
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (settled || stopped) return;
        try {
          markBoosterKinds();
        } catch (e) {
          console.warn('[Aquaman]', e);
        }
      });
    });
    early.observe(document.documentElement, { childList: true, subtree: true });
  }

  whenSettled(() => {
    if (stopped) return;
    settled = true;
    accountId().then((id) => (meId = id));
    for (const [target, type, fn, opts] of listeners) target.addEventListener(type, fn, opts);
    chrome.storage.onChanged.addListener(onStorage);
    renderBox();
    runQueue();
    renderSalesBox();
    runSales();
    observer.observe(root, { childList: true, subtree: true });
    run();
  });
})();

  // (the extension runs on this page: the script's style goes)
  if (document.documentElement.dataset.aqmOwner !== OWNER) style.remove();
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
})();
