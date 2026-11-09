// ==UserScript==
// @name         Aquaman
// @namespace    https://github.com/A-Finch13/Poseidon-TCG
// @version      1.7.0
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
 * Fichier généré par build.mjs (esbuild) à partir du code de l'extension (https://github.com/A-Finch13/Poseidon-TCG) : ne pas le
 * modifier à la main.
 *
 * Parties du script, dans l'ordre :
 *  1. src/lib/          — accès à l'API du jeu, collections, calcul des boosters (un module par sujet) ;
 *  2. src/userscript/ — stockage et messages à la place des fonctions d'extension, et le travail du service
 *                            de fond de l'extension, fait dans la page ;
 *  3. inject.js            — lit les réponses que le site reçoit déjà (boosters à ouvrir, collection modifiée) ;
 *  4. le code de la page (src/content/, dans l'ordre de manifest.json) — étapes de la visite et nouveautés,
 *     puis tout ce qui s'affiche sur le site (réglages compris, dans le menu « Plus », les mêmes que l'extension).
 */
(() => {
'use strict';
if (window.__aquamanUserscript) return;
window.__aquamanUserscript = true;
(() => {
  // src/lib/common.js
  var ORIGIN = "https://poseidon-scans.net";
  var REPO = "A-Finch13/Poseidon-TCG";
  var GAME = `${ORIGIN}/api-game/v1`;
  var SOCIAL = `${ORIGIN}/api-social/v1`;
  var RANK = { N: 1, R: 2, SR: 3, SSR: 4, UR: 5, SEC: 6 };
  var RELAY = "https://aquaman-relay.finch-arhold-git.workers.dev";
  var OPEN_HOSTS = /* @__PURE__ */ new Set(["poseidon-scans.net", "github.com", "raw.githubusercontent.com", "a-finch13.github.io"]);
  function safeHref(href) {
    if (typeof href !== "string" || !href) return null;
    try {
      const url = /^\/(?!\/)/.test(href) ? new URL(href, ORIGIN) : new URL(href);
      return url.protocol === "https:" && OPEN_HOSTS.has(url.hostname) && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  }

  // src/lib/settings.js
  var SETTINGS = [
    {
      title: "Accueil",
      icon: "🏠",
      items: [
        ["boosterWheel", "Boosters par catégorie", "Classique, Magie, Action… côte à côte, avec le compte de chacun"],
        ["openMore", "Ouvrir les 10 suivants", "Après un « Tout ouvrir », un bouton ouvre les boosters suivants du même pack, 10 par 10"],
        ["recycleSpares", "Recycler les doublons du tirage", "Dans la fenêtre des cartes, un bouton recycle en Perles les doublons des cartes tirées (le plus petit numéro est gardé)"],
        ["autoRecycle", "Recyclage automatique", "Désactivé au départ. Après chaque ouverture, les doublons N, R et SR des cartes tirées sont recyclés tout seuls, sans clic (le plus petit numéro est gardé ; SSR, UR et SEC restent au bouton)"],
        ["openMoreAuto", "Fermeture automatique", "Après un « Tout ouvrir », la fenêtre des cartes se ferme 5 s après la dernière (sur les 10 suivantes s’il en reste)"],
        ["packGlow", "Lueur du pack", "La lueur derrière le booster prend la couleur de son pack"],
        ["pity", "Garantie anti-malchance", "Les boosters avant ta prochaine SSR et UR, et l’historique de tes tirages"],
        ["bigPulls", "Beaux tirages agrandis", "Les dernières cartes rares tirées par les joueurs, en plus grand"]
      ]
    },
    {
      title: "Collection",
      icon: "🗂️",
      items: [
        ["seriesTools", "Bande des séries", "Étoiles des séries favorites, tri « Les plus avancées » et boutons « Masquer séries <= 5 persos », « Masquer séries avec badge » et « Masquer cartes verrouillées »"],
        ["albumButtons", "Boutons de l’album", "« Ajouter aux favoris », « Rechercher les manquantes » et « Verrouiller les uniques »"],
        ["missingTab", "Onglet « Manquantes »", "Seulement les cartes qu’il te manque"],
        ["missingSales", "Pastille « En vente »", "Sur les cartes manquantes vendues au marché"],
        ["collectionStats", "Ma progression", "Bouton à côté de « Ta collection » : pourcentage, raretés, séries complètes et cartes gagnées chaque jour"],
        ["friendsBoard", "Classement des amis", "Sur la page Classement, « Amis » à côté de « Tous » : toi et tes amis, avec les points du jeu"],
        ["cardWho", "Bouton « Qui a cette carte ? »", "Sur la page des cartes SSR, UR et SEC : les joueurs qui l’ont"]
      ]
    },
    {
      title: "Marché",
      icon: "🛒",
      items: [
        ["hideBought", "Masquer ce que je viens d’acheter", "Les autres annonces d’une carte achetée disparaissent"],
        ["marketFavorites", "Filtre « ★ Favoris »", "Les ventes de tes séries favorites seulement"],
        ["marketSales", "Tes cartes à vendre", "« Déjà en vente » sur les cartes que tu vends déjà (au marché ou en enchère), et « Trier par » (recherchées, possédées, valeur, nom)"],
        ["cardListings", "Annonces sur la page d’une carte", "Les 5 annonces les moins chères, avec « Acheter », et les enchères en cours"],
        ["sellTools", "Vente des doublons", "File d’attente de « Vendre mes doublons » et bouton « Retirer mes ventes »"]
      ]
    },
    {
      title: "Échanges et vitrine",
      icon: "🔁",
      items: [
        ["tradeMarks", "Échanges", "Pastille « déjà possédée » sur les cartes des échanges, dans le jeu et en MP"],
        ["tradeFilters", "Filtres des échanges", "Proposer un échange : « Mes recherches », « Il me manque » et « Il lui manque » à côté de « Doublons »"],
        ["showcaseDrag", "Ma vitrine", "Glisser-déposer pour ranger tes cartes"],
        ["recycleHelp", "Recycler des cartes", "Rien de coché au départ, bouton « Tout cocher »"]
      ]
    },
    {
      title: "Notifications",
      icon: "🔔",
      items: [
        ["notifyBoosters", "Nouveaux boosters", "Une notification quand des boosters t’attendent", "extension"],
        ["notifyUpdated", "Nouveautés", "Ce qui a changé, après une mise à jour d’Aquaman"]
      ]
    },
    {
      title: "Partage entre mes appareils",
      icon: "☁️",
      items: [
        ["syncPity", "Garantie anti-malchance", "Le compte des boosters ouverts et l’historique"],
        ["syncFavorites", "Séries favorites", "Les mêmes séries sur PC et téléphone"],
        ["syncWants", "Cartes recherchées", "La file d’attente des recherches"],
        ["syncMarket", "Marché", "Cartes achetées masquées et doublons en attente de vente"],
        ["syncProgress", "Ma progression", "Les cartes gagnées chaque jour et le compte par rareté"],
        ["sharePulls", "Beaux tirages", "Envoyer ceux que je vois à la base commune (« Qui a cette carte ? »)"]
      ]
    }
  ];
  var OFF_AT_FIRST = /* @__PURE__ */ new Set(["autoRecycle"]);
  var DEFAULTS = Object.fromEntries(SETTINGS.flatMap((g) => g.items.map(([key]) => [key, !OFF_AT_FIRST.has(key)])));
  async function getSettings() {
    const { settings } = await chrome.storage.local.get("settings");
    return { ...DEFAULTS, ...settings };
  }
  async function setSettings(patch) {
    const settings = { ...await getSettings(), ...patch };
    await chrome.storage.local.set({ settings });
    return settings;
  }

  // src/lib/leaderboard.js
  var BOARD_FRESH = 36e5;
  var BOARD_KEEP = 14 * 864e5;
  var boardWrites = Promise.resolve();
  function keepOnBoard(summary) {
    const write = boardWrites.then(async () => {
      const me = await myId();
      const { board = {} } = await chrome.storage.local.get("board");
      const now = Date.now();
      const mine = { ...board[me] ?? {}, [summary.id]: { ...summary, at: now } };
      for (const id in mine) if (!(now - mine[id].at < BOARD_KEEP)) delete mine[id];
      await chrome.storage.local.set({ board: { ...board, [me]: mine } });
    });
    boardWrites = write.catch(() => {
    });
    return boardWrites;
  }
  async function boardKnown() {
    const me = await myId();
    const { board = {} } = await chrome.storage.local.get("board");
    return { me, fresh: BOARD_FRESH, players: board[me] ?? {} };
  }
  async function claimedAlbums(fresh = false) {
    const sc = await myShowcase(fresh ? 0 : 6e4);
    const series = (sc.albums ?? []).map((a) => a?.series).filter(Boolean);
    const covers = series.map((s) => imageKey(s.cover)?.replace(/\.[a-z0-9]+$/i, "")).filter(Boolean);
    return { ids: series.map((s) => s.id).filter(Boolean), slugs: [.../* @__PURE__ */ new Set([...series.map((s) => s.slug).filter(Boolean), ...covers])] };
  }
  async function friends() {
    const me = await myId();
    let list = [];
    let friendsError = null;
    try {
      list = (await cached(`friends:${me}`, 5 * 6e4, () => social("/friends"))).friends ?? [];
    } catch (e) {
      friendsError = e.message;
    }
    return {
      me,
      friendsError,
      friends: list.filter((f) => validPlayer(f?.user?.id) && f.user.id !== me).map((f) => ({ id: f.user.id, name: f.user.name ?? null }))
    };
  }

  // src/lib/collections.js
  var showcases = /* @__PURE__ */ new Map();
  var ownerOf = (sc) => [sc?.player?.id, sc?.playerId, sc?.user?.id, sc?.userId].find((x) => typeof x === "string" && x) ?? null;
  async function readShowcase(id) {
    if (!validPlayer(id)) throw new ApiError(400, "bad_player", "Joueur inconnu.");
    const path = encodeURIComponent(id);
    let sc;
    try {
      sc = await game(`/players/${path}/showcase`);
    } catch {
      sc = await game(`/public/players/${path}/showcase`);
    }
    if (!sc || typeof sc !== "object" || Array.isArray(sc)) throw new ApiError(502, "bad_showcase", "Collection illisible.");
    const owner = ownerOf(sc);
    if (owner && owner !== id) throw new ApiError(409, "wrong_player", "Le jeu a répondu pour un autre joueur.");
    return sc;
  }
  function showcase(id, ttl = 5 * 6e4) {
    return cached(`showcase:${id}`, ttl, async () => {
      const sc = await readShowcase(id);
      showcases.set(id, sc);
      return sc;
    });
  }
  async function myShowcase(ttl = 6e4) {
    const id = await myId();
    const sc = await showcase(id, ttl);
    if (await myId() !== id) throw new ApiError(409, "account_changed", "Le compte connecté a changé : recharge la page.");
    return sc;
  }
  function imageKey(src) {
    if (!src) return null;
    let s = String(src);
    try {
      const u = new URL(s, ORIGIN);
      s = u.pathname.startsWith("/_next/image") ? u.searchParams.get("url") || "" : u.pathname;
      s = decodeURIComponent(s);
    } catch {
    }
    s = s.split(/[?#]/)[0];
    return s.slice(s.lastIndexOf("/") + 1) || null;
  }
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
  async function ownership() {
    const sc = await myShowcase();
    return { me: account, ...countCopies(sc) };
  }
  function distinctByRarity(sc) {
    const seen = /* @__PURE__ */ new Set();
    const by = {};
    for (const copy of sc?.copies ?? []) {
      const card = copy?.card;
      if (!card?.id || !card.rarity || seen.has(card.id)) continue;
      seen.add(card.id);
      by[card.rarity] = (by[card.rarity] ?? 0) + 1;
    }
    return by;
  }
  var RARITY_RANK = { N: 1, R: 2, SR: 3, SSR: 4, UR: 5, SEC: 6 };
  function bestCard(sc) {
    let best = null;
    const scarce = (c) => [Number(c.maxCopies) || Infinity, Number(c.minted) || Infinity];
    for (const copy of sc?.copies ?? []) {
      const c = copy?.card;
      if (!c?.id || !c.image || !RARITY_RANK[c.rarity]) continue;
      if (!best) best = c;
      else {
        const d = RARITY_RANK[c.rarity] - RARITY_RANK[best.rarity];
        const [a1, a2] = scarce(c);
        const [b1, b2] = scarce(best);
        if (d > 0 || d === 0 && (a1 < b1 || a1 === b1 && a2 < b2)) best = c;
      }
    }
    return best ? { id: best.id, name: best.name ?? null, image: best.image, rarity: best.rarity } : null;
  }
  async function playerSummary(id, fresh = false) {
    if (!validPlayer(id)) throw new ApiError(400, "bad_player", "Joueur inconnu.");
    if (fresh) forget(`showcase:${id}`);
    const sc = await showcase(id);
    const summary = sc.private ? { id, name: sc.player?.name ?? null, private: true } : { id, name: sc.player?.name ?? null, private: false, owned: sc.owned ?? 0, total: sc.total ?? 0, albums: sc.albums?.length ?? 0, byRarity: distinctByRarity(sc), best: bestCard(sc) };
    await keepOnBoard(summary);
    return { ...summary, at: Date.now() };
  }

  // src/lib/api.js
  var ApiError = class extends Error {
    constructor(status, code, message) {
      super(message || code);
      this.status = status;
      this.code = code;
    }
  };
  async function getJson(url) {
    let res;
    try {
      res = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });
    } catch {
      throw new ApiError(0, "network", "Connexion impossible. Vérifie ta connexion internet.");
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, body?.error?.code || `http_${res.status}`, body?.error?.message || `Erreur ${res.status}`);
    return body;
  }
  var game = (path) => getJson(GAME + path);
  var social = (path) => getJson(SOCIAL + path);
  var memo = /* @__PURE__ */ new Map();
  function cached(key, ttl, load) {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.promise;
    const promise = load();
    memo.set(key, { at: Date.now(), promise });
    promise.catch(() => memo.get(key)?.promise === promise && memo.delete(key));
    return promise;
  }
  function forget(...prefixes) {
    for (const key of [...memo.keys()]) if (prefixes.some((p) => key.startsWith(p))) memo.delete(key);
  }
  var account = null;
  function myId() {
    return cached("me-id", 2e4, async () => {
      const id = await readMyId();
      if (account && account !== id) {
        for (const key of [...memo.keys()]) if (key !== "me-id") memo.delete(key);
      }
      if (account !== id) showcases.clear();
      account = id;
      return id;
    });
  }
  var PLAYER_ID = /^[A-Za-z0-9_-]{1,64}$/;
  var validPlayer = (id) => typeof id === "string" && PLAYER_ID.test(id);
  function readMyId() {
    return (async () => {
      const ids = [];
      try {
        const a = await getJson(`${ORIGIN}/api/auth/check`);
        ids.push(a?.user?.id);
      } catch {
      }
      if (!ids.some(Boolean)) {
        try {
          const m = await game("/me");
          ids.push(m?.id, m?.userId, m?.player?.id, m?.user?.id);
        } catch {
        }
      }
      if (!ids.some(Boolean)) {
        try {
          const s = await social("/me");
          ids.push(s?.user?.id, s?.id);
        } catch {
        }
      }
      const id = ids.find(validPlayer);
      if (!id) throw new ApiError(401, "unauthorized", "Connecte-toi au site pour utiliser Aquaman.");
      return id;
    })();
  }

  // src/lib/boosters.js
  var fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  function collectCards(data) {
    const out = /* @__PURE__ */ new Map();
    let left = 3e5;
    const walk = (v, series, depth) => {
      if (!v || typeof v !== "object" || depth > 8 || --left < 0) return;
      if (Array.isArray(v)) {
        for (const x of v) walk(x, series, depth + 1);
        return;
      }
      if (typeof v.id === "string" && typeof v.name === "string" && RANK[v.rarity]) {
        const s = v.series ?? series;
        if (!out.has(v.id))
          out.set(v.id, {
            id: v.id,
            name: v.name,
            image: v.image,
            rarity: v.rarity,
            types: Array.isArray(v.types) ? v.types : [],
            owned: typeof v.owned === "number" ? v.owned : null,
            // les exemplaires du joueur, quand le catalogue les donne
            extra: !!(v.variant || v.seasonId || v.baseId),
            // une carte de l'événement d'Halloween : son type, sa saison ou son image le disent
            halloween: [v.types, v.seasonId, v.season?.id, v.season?.name, v.season?.slug, v.season?.title, v.event, v.theme, v.image].flat().some((x) => typeof x === "string" && /hallow/i.test(x)),
            series: s ? { id: s.id, title: s.title, slug: s.slug } : null
          });
        return;
      }
      const isSeries = typeof v.title === "string" && typeof v.slug === "string";
      for (const k in v) walk(v[k], isSeries ? v : series, depth + 1);
    };
    walk(data, null, 0);
    return [...out.values()];
  }
  function loadCatalog() {
    return cached("catalog", 30 * 6e4, async () => {
      for (const path of ["/cards/catalog", "/cards", "/series"]) {
        try {
          const cards = collectCards(await game(path));
          if (cards.length > 50) return cards;
        } catch {
        }
      }
      return null;
    }).catch(() => null);
  }
  function valueTable() {
    const seen = /* @__PURE__ */ new Map();
    const rarityOf = /* @__PURE__ */ new Map();
    for (const sc of showcases.values())
      for (const copy of sc?.copies ?? []) {
        if (typeof copy.value !== "number" || !copy.card) continue;
        if (!seen.has(copy.card.id)) seen.set(copy.card.id, []);
        seen.get(copy.card.id).push(copy.value);
        rarityOf.set(copy.card.id, copy.card.rarity);
      }
    const card = /* @__PURE__ */ new Map();
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
  function boosterList(shop) {
    const list = [];
    if (shop?.boosterPrice != null) list.push({ id: "base", name: "Booster", price: shop.boosterPrice, minRank: 2, series: [], types: [], pool: shop.pool ?? null, endsAt: null });
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
  function poolCards(b, catalog) {
    const sameSeries = (s, c) => s.id && s.id === c.series?.id || s.slug && s.slug === c.series?.slug || s.title && s.title === c.series?.title;
    const all = catalog.filter((c) => (!b.series.length || b.series.some((s) => sameSeries(s, c))) && (!b.types.length || c.types.some((t) => b.types.includes(t))));
    const base = all.filter((c) => !c.extra);
    const want = b.pool?.cards;
    if (!want || base.length === all.length) return all;
    return Math.abs(base.length - want) < Math.abs(all.length - want) ? base : all;
  }
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
  function analyse(b, { rarities, catalog, mine, values, match, rarity }) {
    let groups = null;
    if (catalog) {
      groups = {};
      for (const c of poolCards(b, catalog)) {
        const g = groups[c.rarity] ??= { n: 0, missing: 0, value: 0, targets: 0, targetsNew: 0, cards: [] };
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
    const perCard = {};
    const byRarity = {};
    for (const odds2 of slotOdds(rarities, present, b.minRank)) {
      let hit = 0;
      let hitNew = 0;
      let freshHere = 0;
      for (const [code, p] of Object.entries(odds2)) {
        const g = groups?.[code];
        const share = g ? g.missing / g.n : missingShare;
        const r = byRarity[code] ??= { count: 0, none: 1, fresh: 0, noFresh: 1 };
        r.count += p;
        r.none *= 1 - p;
        r.fresh += p * share;
        r.noFresh *= 1 - p * share;
        ev += p * (g ? g.value / g.n : values.rarity[code] ?? 0);
        fresh += p * share;
        freshHere += p * share;
        if (g) {
          hit += p * g.targets / g.n;
          hitNew += p * g.targetsNew / g.n;
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
        chance: 1 - r.none,
        // au moins une carte de cette rareté
        count: r.count,
        // cartes de cette rareté, en moyenne
        freshChance: 1 - r.noFresh,
        // au moins une nouvelle carte de cette rareté
        fresh: r.fresh,
        // nouvelles cartes de cette rareté, en moyenne
        perFresh: r.fresh > 0 ? b.price / r.fresh : null,
        pool: groups?.[code]?.n ?? null,
        missing: groups?.[code]?.missing ?? null
      };
    const cards = groups ? Object.values(groups).flatMap((g) => g.cards) : [];
    const withChance = (x) => ({ ...x, chance: perCard[x.c.rarity] ?? 0 });
    const best = cards.filter((x) => !x.own && (!rarity || x.c.rarity === rarity)).sort((x, y) => y.v - x.v || RANK[y.c.rarity] - RANK[x.c.rarity] || x.c.name.localeCompare(y.c.name)).slice(0, 4).map(withChance);
    const targets = match ? cards.filter((x) => match(x.c) && (!rarity || x.c.rarity === rarity)).map(withChance).sort((x, y) => y.chance - x.chance).slice(0, 6) : [];
    const targetChance = match && groups ? 1 - noTarget : null;
    const targetNewChance = match && groups ? 1 - noTargetNew : null;
    return {
      ev,
      ratio: b.price ? ev / b.price : 0,
      fresh,
      perFresh: fresh > 0 ? b.price / fresh : null,
      freshChance: 1 - noFresh,
      // au moins une nouvelle carte
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
  async function boosterReport(query = "", rarity = "", field = "") {
    const [shop, rarities, mineSc, catalog] = await Promise.all([
      cached("shop", 6e4, () => game("/shop")),
      cached("rarities", 30 * 6e4, () => game("/rarities").then((r) => r.rarities ?? [])),
      myShowcase(),
      loadCatalog()
    ]);
    const mine = countCopies(mineSc);
    const values = valueTable();
    const q = fold(query);
    const inName = (c) => fold(c.name).includes(q);
    const inSeries = (c) => fold(c.series?.title).includes(q);
    const match = q ? field === "name" ? inName : field === "series" ? inSeries : (c) => inName(c) || inSeries(c) : null;
    const pick = RANK[rarity] ? rarity : "";
    const rows = boosterList(shop).map((b) => ({ b, a: analyse(b, { rarities, catalog, mine, values, match, rarity: pick }) }));
    const suggestions = [];
    if (q && catalog) {
      const byName = /* @__PURE__ */ new Map();
      for (const c of catalog.filter(field === "series" ? inSeries : inName)) {
        const name = field === "series" ? c.series?.title : c.name;
        if (!name) continue;
        if (!byName.has(name)) byName.set(name, { name, cards: [] });
        byName.get(name).cards.push(c);
      }
      const starts = (name) => fold(name).startsWith(q) ? 0 : 1;
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

  // src/lib/locked.js
  async function guardedSeries() {
    const me = await myId();
    const { guardedSeries: all = {} } = await chrome.storage.local.get("guardedSeries");
    return all[me] ?? {};
  }
  async function setGuarded(id, cardIds, on) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(id))) throw new Error("bad_series");
    const me = await myId();
    const { guardedSeries: all = {} } = await chrome.storage.local.get("guardedSeries");
    const mine = { ...all[me] ?? {} };
    if (on) mine[id] = (Array.isArray(cardIds) ? cardIds : []).filter((c) => typeof c === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(c)).slice(0, 2e3);
    else delete mine[id];
    await chrome.storage.local.set({ guardedSeries: { ...all, [me]: mine } });
    return mine;
  }

  // src/lib/favorites.js
  function seriesList() {
    return cached("series", 2 * 6e4, async () => (await game("/series")).series ?? []);
  }
  async function wantedIds() {
    const { wants } = await cached("wants", 3e4, () => game("/wants"));
    return new Set((wants ?? []).map((w) => w?.card?.id ?? w?.cardId).filter(Boolean));
  }
  async function searchedIds() {
    const [wanted, waiting] = await Promise.all([wantedIds().catch(() => /* @__PURE__ */ new Set()), waitingIds()]);
    for (const id of waiting) wanted.add(id);
    return wanted;
  }
  async function searchedImages() {
    const keys = /* @__PURE__ */ new Set();
    const [ids, catalog] = await Promise.all([searchedIds(), loadCatalog()]);
    try {
      const { wants } = await cached("wants", 3e4, () => game("/wants"));
      for (const w of wants ?? []) {
        const key = imageKey(w?.card?.image);
        if (key) keys.add(key);
      }
    } catch {
    }
    for (const c of catalog ?? []) {
      const key = ids.has(c.id) && imageKey(c.image);
      if (key) keys.add(key);
    }
    return [...keys];
  }
  async function playerOwnership({ id, name } = {}) {
    if (!validPlayer(id)) id = typeof name === "string" && name ? await playerIdByName(name) : null;
    if (!validPlayer(id) || id === await myId()) return { found: false };
    const sc = await showcase(id);
    if (typeof name === "string" && name && sc?.player?.name && fold(sc.player.name) !== fold(name)) return { found: false };
    if (sc?.private) return { found: true, private: true };
    return { found: true, private: false, byImage: countCopies(sc).byImage };
  }
  async function playerIdByName(name) {
    const n = fold(name);
    if (!n) return null;
    try {
      const hit = (await friends()).friends.find((f) => fold(f.name) === n);
      if (hit) return hit.id;
    } catch {
    }
    try {
      const { players } = await cached("relay-players", 10 * 6e4, async () => {
        const res = await fetch(`${RELAY}/players?limit=300`);
        if (!res.ok) throw new Error(`relay_${res.status}`);
        return res.json();
      });
      return (players ?? []).find((p) => fold(p.name) === n)?.id ?? null;
    } catch {
      return null;
    }
  }
  async function waitingIds() {
    return new Set((await chrome.storage.local.get("wantWaiting")).wantWaiting ?? []);
  }
  async function wantRoom(waiting, sent) {
    forget("wants");
    const [wanted, { byCard }] = await Promise.all([wantedIds(), ownership()]);
    const has = (id) => byCard[id] > 0;
    return {
      count: wanted.size,
      obtained: sent.filter((id) => wanted.has(id) && has(id)),
      sent: sent.filter((id) => wanted.has(id) && !has(id)),
      waiting: waiting.filter((id) => !wanted.has(id) && !has(id))
    };
  }
  function seriesCards(id) {
    return cached(`series-cards:${id}`, 6e4, async () => (await game(`/cards?manga=${encodeURIComponent(id)}`)).cards ?? []);
  }
  var FAV_PULL = 6e4;
  var favSyncedAt = 0;
  async function localFavorites() {
    const { favSeries, favAt } = await chrome.storage.local.get(["favSeries", "favAt"]);
    return { list: Array.isArray(favSeries) ? favSeries : [], at: Number(favAt) || 0 };
  }
  async function exchangeFavorites(local) {
    try {
      const res = await fetch(`${RELAY}/favorites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player: await myId(), list: local.list, at: local.at })
      });
      if (!res.ok) throw new Error(`relay_${res.status}`);
      const remote = await res.json();
      favSyncedAt = Date.now();
      if (Array.isArray(remote?.list) && Number(remote.at) > local.at) {
        await chrome.storage.local.set({ favSeries: remote.list, favAt: Number(remote.at) });
        return remote.list;
      }
    } catch {
    }
    return local.list;
  }
  async function globalPacks() {
    try {
      const res = await fetch(`${RELAY}/packs`);
      if (!res.ok) throw new Error(`relay_${res.status}`);
      return (await res.json())?.packs ?? null;
    } catch {
      return null;
    }
  }
  async function packKinds() {
    const shop = await cached("shop", 6e4, () => game("/shop"));
    return (shop?.specials ?? []).map((s) => {
      const types = Array.isArray(s.types) ? s.types : [];
      return { kind: s.id, name: s.name ?? null, art: s.art ?? s.kindArt ?? s.image ?? (types[0] ? `/game/boosters/${types[0]}.webp` : null), types };
    });
  }
  async function favoriteIds(fresh = false) {
    const local = await localFavorites();
    if (!(await getSettings()).syncFavorites || !fresh && Date.now() - favSyncedAt < FAV_PULL) return local.list;
    return exchangeFavorites(local);
  }
  var favChain = Promise.resolve();
  function setFavorite(id, on) {
    const run = favChain.then(async () => {
      const list = (await localFavorites()).list.filter((x) => x !== id);
      if (on) list.push(id);
      const local = { list, at: Date.now() };
      await chrome.storage.local.set({ favSeries: local.list, favAt: local.at });
      if ((await getSettings()).syncFavorites) await exchangeFavorites(local);
      return list;
    });
    favChain = run.catch(() => {
    });
    return run;
  }
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
  async function seriesStatus(id) {
    const [cards, wanted, favorites] = await Promise.all([seriesCards(id), searchedIds(), favoriteIds()]);
    const missing = cards.filter((c) => !(c.owned > 0));
    const toWant = missing.filter((c) => !wanted.has(c.id)).map((c) => c.id);
    const guarded = await guardedSeries();
    return {
      missing: missing.length,
      toWant: toWant.length,
      toWantIds: toWant,
      favorite: favorites.includes(id),
      cardIds: cards.map((c) => c.id).filter(Boolean),
      guarded: Object.hasOwn(guarded, id)
    };
  }

  // src/lib/market.js
  var MARKET_PULL = 6e4;
  var marketSyncedAt = 0;
  async function postList(body) {
    const res = await fetch(`${RELAY}/lists`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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
      return { error: e?.message || "relay" };
    }
  }
  async function syncBought(player) {
    const { marketBought = [], marketBoughtFor } = await chrome.storage.local.get(["marketBought", "marketBoughtFor"]);
    const mine = marketBoughtFor === void 0 || marketBoughtFor === player;
    const remote = await postList({ player, name: "bought" });
    const theirs = Array.isArray(remote?.data) ? remote.data : [];
    const all = [.../* @__PURE__ */ new Set([...theirs, ...mine ? marketBought : []])];
    if (all.length !== theirs.length) await postList({ player, name: "bought", data: all, at: Math.max(Date.now(), (Number(remote?.at) || 0) + 1) });
    const now = (await chrome.storage.local.get("marketBought")).marketBought ?? [];
    const kept = [.../* @__PURE__ */ new Set([...all, ...mine ? now : []])];
    const changed = kept.length !== now.length || !mine;
    if (changed || marketBoughtFor !== player) await chrome.storage.local.set({ marketBought: kept, marketBoughtFor: player });
    return changed;
  }
  async function syncSales(player) {
    const { sellWaiting = [], sellWaitingAt = 0, sellWaitingFor } = await chrome.storage.local.get(["sellWaiting", "sellWaitingAt", "sellWaitingFor"]);
    const mine = sellWaitingFor === player;
    const at = mine ? Number(sellWaitingAt) || 0 : 0;
    let remote = await postList({ player, name: "sales", data: mine ? sellWaiting : [], at });
    const theirs = Array.isArray(remote?.data) ? remote : { data: [], at: 0 };
    if (!mine && sellWaitingFor === void 0 && sellWaiting.length) {
      const join = [...theirs.data, ...sellWaiting.filter((x) => !theirs.data.some((y) => y.copyId === x.copyId))].slice(0, 50);
      remote = await postList({ player, name: "sales", data: join, at: Math.max(Date.now(), (Number(theirs.at) || 0) + 1) });
    } else if (Number(theirs.at) <= at) {
      if (!mine) await chrome.storage.local.set({ sellWaitingFor: player });
      return false;
    } else remote = theirs;
    if (((await chrome.storage.local.get("sellWaitingAt")).sellWaitingAt ?? 0) !== sellWaitingAt) return false;
    await chrome.storage.local.set({ sellWaiting: remote.data ?? [], sellWaitingAt: Number(remote.at) || Date.now(), sellWaitingFor: player });
    return true;
  }

  // src/lib/progress.js
  var STATS_DAYS = 120;
  var dayKey = (t = Date.now()) => new Date(t).toLocaleDateString("sv-SE");
  var completeSeries = (series, sc) => Array.isArray(series) && series.length ? series.filter((s) => s.total > 0 && s.owned >= s.total).length : sc?.albums?.length ?? 0;
  async function recordDay(id, point) {
    const { collectionDays = {} } = await chrome.storage.local.get("collectionDays");
    const days = { ...collectionDays[id] ?? {} };
    const key = dayKey(point.at);
    days[key] = { first: days[key]?.first ?? point, last: point };
    collectionDays[id] = Object.fromEntries(
      Object.keys(days).sort().slice(-STATS_DAYS).map((k) => [k, days[k]])
    );
    await chrome.storage.local.set({ collectionDays });
    return collectionDays[id];
  }
  async function collectionSnapshot() {
    const id = await myId();
    const [sc, series] = await Promise.all([myShowcase(), seriesList().catch(() => null)]);
    const point = { owned: sc.owned ?? 0, total: sc.total ?? 0, complete: completeSeries(series, sc), at: Date.now() };
    let days = await recordDay(id, point);
    if (await syncProgress(id).catch(() => false)) days = (await chrome.storage.local.get("collectionDays")).collectionDays?.[id] ?? days;
    return { id, sc, series, point, days };
  }
  var PROGRESS_PULL = 10 * 6e4;
  var progressSyncedAt = 0;
  var progressBusy = null;
  var joinDays = (a, b) => {
    const all = { ...a };
    for (const [k, d] of Object.entries(b ?? {})) {
      const o = all[k];
      all[k] = o ? { first: o.first.at <= d.first.at ? o.first : d.first, last: o.last.at >= d.last.at ? o.last : d.last } : d;
    }
    return Object.fromEntries(
      Object.keys(all).sort().slice(-STATS_DAYS).map((k) => [k, all[k]])
    );
  };
  var joinCounts = (a, b) => {
    const all = { ...a };
    for (const [k, s] of Object.entries(b ?? {})) if (!all[k] || s.at > all[k].at) all[k] = s;
    return all;
  };
  async function syncProgressList(player, name, key, toList, fromList, join) {
    const remote = await postList({ player, name });
    const theirs = fromList(Array.isArray(remote?.data) ? remote.data : []);
    const store = (await chrome.storage.local.get(key))[key] ?? {};
    const mine = store[player] ?? {};
    const all = join(mine, theirs);
    const same = (x) => JSON.stringify(toList(x)) === JSON.stringify(toList(all));
    if (!same(theirs)) await postList({ player, name, data: toList(all), at: Math.max(Date.now(), (Number(remote?.at) || 0) + 1) });
    if (same(mine)) return false;
    const now = (await chrome.storage.local.get(key))[key] ?? {};
    await chrome.storage.local.set({ [key]: { ...now, [player]: join(now[player] ?? {}, all) } });
    return true;
  }
  function syncProgress(player, fresh = false) {
    if (progressBusy) return progressBusy;
    progressBusy = (async () => {
      if (!(await getSettings()).syncProgress || !fresh && Date.now() - progressSyncedAt < PROGRESS_PULL) return false;
      progressSyncedAt = Date.now();
      try {
        const days = await syncProgressList(
          player,
          "days",
          "collectionDays",
          (d) => Object.keys(d).sort().map((day) => ({ day, ...d[day] })),
          (list) => Object.fromEntries(list.filter((x) => x?.day && x.first && x.last).map((x) => [x.day, { first: x.first, last: x.last }])),
          joinDays
        );
        const counts = await syncProgressList(
          player,
          "rarities",
          "rarityCache",
          (c) => Object.keys(c).sort().map((id) => ({ id, ...c[id] })),
          (list) => Object.fromEntries(list.filter((x) => x?.id).map(({ id, ...s }) => [id, s])),
          joinCounts
        );
        return days || counts;
      } catch {
        progressSyncedAt = 0;
        return false;
      } finally {
        progressBusy = null;
      }
    })();
    return progressBusy;
  }

  // src/lib/rarities.js
  var RARITY_STEP = 40;
  var RARITY_AGAIN = 24 * 36e5;
  var RARITY_FORMAT = 2;
  var rarityBusy = Promise.resolve();
  function rarityCounts(budget = RARITY_STEP) {
    const run = rarityBusy.then(() => countRarities(budget));
    rarityBusy = run.catch(() => {
    });
    return run;
  }
  async function countRarities(budget) {
    const me = await myId();
    const series = (await seriesList()).filter((s) => s?.id);
    const { rarityCache = {} } = await chrome.storage.local.get("rarityCache");
    const mine = { ...rarityCache[me] ?? {} };
    const now = Date.now();
    const current = (s) => {
      const k = mine[s.id];
      return !!k && k.v === RARITY_FORMAT && k.owned === (s.owned ?? 0) && k.total === (s.total ?? 0) && now - k.at < RARITY_AGAIN;
    };
    const todo = series.filter((s) => !current(s));
    const batch = todo.slice(0, Math.max(0, budget));
    let failed = 0;
    const misses = {};
    for (let i = 0; i < batch.length; i += 3)
      await Promise.all(
        batch.slice(i, i + 3).map(async (s) => {
          try {
            const cards = (await game(`/cards?manga=${encodeURIComponent(s.id)}`)).cards ?? [];
            misses[s.id] = missEntry(s, cards);
            const by = {};
            for (const c of cards) {
              if (!RANK[c?.rarity]) continue;
              const r = by[c.rarity] ??= [0, 0, 0];
              r[1]++;
              if (c.owned > 0) {
                r[0]++;
                r[2]++;
              }
            }
            mine[s.id] = { v: RARITY_FORMAT, owned: s.owned ?? 0, total: s.total ?? 0, at: Date.now(), by };
          } catch {
            failed++;
          }
        })
      );
    const ids = new Set(series.map((s) => s.id));
    for (const k in mine) if (!ids.has(k)) delete mine[k];
    if (batch.length) await chrome.storage.local.set({ rarityCache: { ...rarityCache, [me]: mine } });
    if (Object.keys(misses).length) await keepMisses(me, misses, ids);
    const byRarity = Object.fromEntries(Object.keys(RANK).map((r) => [r, { owned: 0, total: 0, copies: 0 }]));
    for (const s of series)
      for (const [r, [owned, total, copies]] of Object.entries(mine[s.id]?.by ?? {})) {
        byRarity[r].owned += owned;
        byRarity[r].total += total;
        byRarity[r].copies += copies;
      }
    const counted = series.filter((s) => mine[s.id]).length;
    return { byRarity, counted, series: series.length, pending: todo.length - batch.length + failed, failed };
  }
  var MISS_STEP = 60;
  var missBusy = Promise.resolve();
  var missEntry = (s, cards) => ({
    owned: s.owned ?? 0,
    total: s.total ?? 0,
    at: Date.now(),
    miss: cards.filter((c) => c?.id && RANK[c.rarity] && !(c.owned > 0)).map((c) => ({
      id: c.id,
      name: c.name ?? "",
      image: c.image ?? null,
      rarity: c.rarity,
      types: Array.isArray(c.types) ? c.types : [],
      series: c.series?.title ?? s.title ?? "",
      maxCopies: c.maxCopies ?? null,
      minted: c.minted ?? null
    }))
  });
  async function keepMisses(me, misses, ids) {
    const { missingCache = {} } = await chrome.storage.local.get("missingCache");
    const mine = { ...missingCache[me] ?? {}, ...misses };
    if (ids) {
      for (const k in mine) if (!ids.has(k)) delete mine[k];
    }
    await chrome.storage.local.set({ missingCache: { ...missingCache, [me]: mine } });
  }
  function missingCards(filter = {}) {
    const run = missBusy.then(() => readMissing(filter));
    missBusy = run.catch(() => {
    });
    return run;
  }
  async function readMissing({ rarity = "", type = "", q = "", manga = "" } = {}) {
    const me = await myId();
    const series = (await seriesList()).filter((s) => s?.id && (!manga || s.id === manga));
    const { missingCache = {} } = await chrome.storage.local.get("missingCache");
    const mine = missingCache[me] ?? {};
    const current = (s) => {
      const k = mine[s.id];
      return !!k && k.owned === (s.owned ?? 0) && k.total === (s.total ?? 0) && Date.now() - k.at < RARITY_AGAIN;
    };
    const todo = series.filter((s) => !current(s));
    const batch = todo.slice(0, MISS_STEP);
    const fresh = {};
    for (let i = 0; i < batch.length; i += 4)
      await Promise.all(
        batch.slice(i, i + 4).map(async (s) => {
          try {
            fresh[s.id] = missEntry(s, (await game(`/cards?manga=${encodeURIComponent(s.id)}`)).cards ?? []);
          } catch {
          }
        })
      );
    if (Object.keys(fresh).length) await keepMisses(me, fresh, manga ? null : new Set(series.map((s) => s.id)));
    const words = String(q).trim().toLowerCase();
    const cards = series.flatMap((s) => (fresh[s.id] ?? mine[s.id])?.miss ?? []).filter((c) => (!rarity || c.rarity === rarity) && (!type || c.types.includes(type)) && (!words || c.name.toLowerCase().includes(words) || c.series.toLowerCase().includes(words))).sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || a.name.localeCompare(b.name, "fr"));
    return { cards, pending: todo.length - Object.keys(fresh).length };
  }
  async function collectionStats() {
    await syncProgress(await myId(), true).catch(() => false);
    const [{ id, sc, series, point, days }, rarities] = await Promise.all([collectionSnapshot(), rarityCounts(0).catch(() => null)]);
    const keys = Object.keys(days).sort();
    const history2 = keys.map((k, i) => ({
      day: k,
      owned: days[k].last.owned,
      complete: days[k].last.complete,
      // cartes gagnées ce jour-là : depuis la dernière lecture de la veille, sinon depuis la première lecture du jour
      gain: days[k].last.owned - (i > 0 ? days[keys[i - 1]].last.owned : days[k].first.owned),
      since: i > 0 ? keys[i - 1] : null
    }));
    return {
      id,
      name: sc.player?.name ?? null,
      owned: point.owned,
      total: point.total,
      missing: Math.max(0, point.total - point.owned),
      complete: point.complete,
      series: Array.isArray(series) ? series.length : null,
      albums: sc.albums?.length ?? 0,
      rarities,
      // { byRarity, counted, series, pending } ou null
      history: history2,
      today: dayKey()
    };
  }

  // src/lib/pity.js
  var PITY = { SSR: 60, UR: 190 };
  var PITY_EVENTS = 500;
  var PITY_PULL = 6e4;
  async function pityState() {
    const id = await myId();
    const { pity: pity2 = {}, pityRules } = await chrome.storage.local.get(["pity", "pityRules"]);
    const mine = { events: [], unsynced: [], syncedAt: 0, syncError: null, ...pity2[id] };
    return { id, all: pity2, mine, rules: { ...PITY, ...pityRules } };
  }
  async function savePity({ id, all, mine }) {
    await chrome.storage.local.set({ pity: { ...all, [id]: mine } });
  }
  function secChance() {
    return cached("sec-chance", 30 * 6e4, async () => {
      const rarities = await game("/rarities").then((r) => r.rarities ?? []);
      if (!rarities.some((r) => r.code === "SEC" && r.weight > 0)) return null;
      const miss = slotOdds(rarities, new Set(rarities.map((r) => r.code)), RANK.R).reduce((p, slot) => p * (1 - (slot.SEC ?? 0)), 1);
      return 1 - miss;
    }).catch(() => null);
  }
  function rarityChances() {
    return cached("rarity-chances", 30 * 6e4, async () => {
      const rarities = await game("/rarities").then((r) => r.rarities ?? []);
      if (!rarities.length) return null;
      const slots = slotOdds(rarities, new Set(rarities.map((r) => r.code)), RANK.R);
      const atLeast = (rank) => 1 - slots.reduce((miss, slot) => miss * (1 - Object.entries(slot).reduce((p, [c, v]) => p + ((RANK[c] ?? 0) >= rank ? v : 0), 0)), 1);
      const out = {};
      for (const code of ["SSR", "UR", "SEC"]) out[code] = atLeast(RANK[code]) - atLeast(RANK[code] + 1);
      return out;
    }).catch(() => null);
  }
  function secReport(mine, chance) {
    const { events } = mine;
    let last = -1;
    for (let i = events.length - 1; i >= 0; i--)
      if (events[i].top >= RANK.SEC) {
        last = i;
        break;
      }
    const local = { since: last >= 0 ? events.length - 1 - last : events.length, known: last >= 0 };
    const pulled = sinceLast(events, RANK.SEC, mine.pulls?.SEC);
    if (pulled.missed) return { since: pulled.since, known: true, chance };
    const sec = mine.sec && mine.sec.since >= local.since ? mine.sec : local;
    return { since: sec.since, known: !!sec.known, chance };
  }
  var PULL_SLACK = 10 * 6e4;
  function sinceLast(events, top, pullAt) {
    let last = -1;
    for (let i = events.length - 1; i >= 0; i--)
      if (events[i].top === top) {
        last = i;
        break;
      }
    if (Number.isFinite(pullAt) && pullAt > (last >= 0 ? events[last].at : -Infinity) + PULL_SLACK && events.length && pullAt >= events[0].at)
      return { since: events.filter((e) => e.at > pullAt).length, known: true, missed: true };
    return { since: last >= 0 ? events.length - 1 - last : events.length, known: last >= 0, missed: false };
  }
  var THEME_PRICE = 250;
  var SPECIAL_NAME = /halloween|l[ée]gendaire|prestige|no[eë]l|saison|[ée]v[ée]nement/i;
  function pityPacks() {
    return cached("pity-packs", 30 * 6e4, async () => {
      const shop = await game("/shop");
      const specials = Array.isArray(shop?.specials) ? shop.specials : [];
      const base = Number(shop?.boosterPrice) || 150;
      return Object.fromEntries(specials.filter((s) => typeof s?.id === "string").map((s) => [s.id, Number(s.price) > 0 && Number(s.price) <= Math.max(THEME_PRICE, base)]));
    }).catch(() => null);
  }
  function pityCounts(packs) {
    return (e) => {
      const id = e?.pack?.id;
      if (!id || id === "classic") return true;
      if (packs && id in packs) return packs[id];
      return packs ? false : !SPECIAL_NAME.test(e.pack.name ?? "");
    };
  }
  function pityReport(mine, rules, sync, chance = null, packs = null) {
    const { events } = mine;
    const out = { opened: events.length, sync: sync ? mine.syncError ? "error" : mine.syncedAt ? "ok" : "waiting" : "off", syncedAt: mine.syncedAt || null };
    const counted = events.filter(pityCounts(packs));
    out.skipped = events.length - counted.length;
    for (const code of Object.keys(PITY)) {
      const { since, known, missed } = sinceLast(counted, RANK[code], mine.pulls?.[code]);
      out[code] = { since, known, missed, over: since >= rules[code], every: rules[code], left: Math.max(1, rules[code] - since) };
    }
    out.SEC = secReport(mine, chance);
    return out;
  }
  function cleanPack(p) {
    const id = typeof p?.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(p.id) ? p.id : null;
    return id ? { id, name: typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 60) : null } : null;
  }
  function mergeEvents(a, b) {
    const byId = /* @__PURE__ */ new Map();
    for (const e of [...a, ...b]) {
      if (!e?.id) continue;
      const known = byId.get(e.id);
      if (!known) byId.set(e.id, { id: String(e.id), at: Number(e.at) || 0, top: Number(e.top) || 0, ...e.card ? { card: e.card } : {}, ...e.pack ? { pack: e.pack } : {} });
      else if (!known.pack && e.pack) known.pack = e.pack;
    }
    return [...byId.values()].sort((x, y) => x.at - y.at).slice(-PITY_EVENTS);
  }
  async function exchangePity(state, force) {
    const { mine } = state;
    if (!force && !mine.unsynced.length && Date.now() - mine.syncedAt < PITY_PULL) return;
    const waiting = new Set(mine.unsynced);
    try {
      const res = await fetch(`${RELAY}/pity`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player: state.id, events: mine.events.filter((e) => waiting.has(e.id)) })
      });
      if (!res.ok) throw new Error(`relay_${res.status}`);
      const { events, sec, pulls } = await res.json();
      mine.events = mergeEvents(mine.events, Array.isArray(events) ? events : []);
      mine.sec = Number.isFinite(sec?.since) ? { since: sec.since, known: !!sec.known } : null;
      if (pulls && typeof pulls === "object") mine.pulls = Object.fromEntries(["SSR", "UR", "SEC"].filter((k) => Number.isFinite(pulls[k])).map((k) => [k, pulls[k]]));
      mine.unsynced = mine.unsynced.filter((id) => !waiting.has(id));
      mine.syncedAt = Date.now();
      mine.syncError = null;
    } catch (e) {
      mine.syncError = e?.message || "relay";
    }
    await savePity(state);
  }
  async function pity(fresh = false) {
    const state = await pityState();
    const on = (await getSettings()).syncPity;
    if (on) await exchangePity(state, fresh);
    return pityReport(state.mine, state.rules, on, await secChance(), await pityPacks());
  }
  async function pityHistory() {
    const state = await pityState();
    let events = state.mine.events;
    let pulls = [];
    if ((await getSettings()).syncPity)
      try {
        const all = await cached(`pity-all:${state.id}`, 6e4, async () => {
          const res = await fetch(`${RELAY}/pity/all`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ player: state.id }) });
          if (!res.ok) throw new Error(`relay_${res.status}`);
          return res.json();
        });
        pulls = all.pulls ?? [];
        const byId = /* @__PURE__ */ new Map();
        for (const e of [...all.events ?? [], ...events]) {
          if (!e?.id) continue;
          const known = byId.get(e.id);
          if (!known) byId.set(e.id, { at: Number(e.at) || 0, top: Number(e.top) || 0, card: e.card ?? null, pack: e.pack ?? null });
          else {
            if (!known.card && e.card) known.card = e.card;
            if (!known.pack && e.pack) known.pack = e.pack;
          }
        }
        events = [...byId.values()].sort((a, b) => a.at - b.at);
      } catch {
      }
    const used = /* @__PURE__ */ new Set();
    const cardOf = (e, code) => {
      if (e.card) return e.card;
      let best = null;
      for (const [i, p] of pulls.entries()) {
        if (used.has(i) || p.rarity !== code) continue;
        const gap = Math.abs(p.at - e.at);
        if (gap < 10 * 6e4 && (!best || gap < best.gap)) best = { i, gap, p };
      }
      if (!best) return null;
      used.add(best.i);
      return { id: best.p.id, name: best.p.name, image: best.p.image, rarity: code };
    };
    const codeOf = (top) => Object.keys(RANK).find((k) => RANK[k] === top);
    for (const e of events) if (e.top >= RANK.SSR) e.card = cardOf(e, codeOf(e.top));
    await guessPacks(events);
    const out = { opened: events.length, since: events[0]?.at ?? null, recent: events.slice(-300).map((e) => e.top), chances: await rarityChances() };
    const counts = pityCounts(await pityPacks());
    for (const code of ["SSR", "UR", "SEC"]) {
      const hits = [];
      let count = 0;
      for (const e of events) {
        const counted = code === "SEC" || counts(e);
        if (counted) count++;
        if (e.top !== RANK[code]) continue;
        hits.push({ at: e.at, top: codeOf(e.top) ?? code, card: e.card ?? null, pack: e.pack ?? null, after: counted ? count : 0, first: !hits.length, special: !counted });
        if (counted) count = 0;
      }
      out[code] = { hits: hits.reverse(), current: count };
    }
    return out;
  }
  async function guessPacks(events) {
    const missing = events.filter((e) => e.top >= RANK.SSR && !e.pack && e.card?.id);
    if (!missing.length) return;
    const catalog = await loadCatalog();
    if (!catalog) return;
    const byId = new Map(catalog.map((c) => [c.id, c]));
    const designs = await globalPacks();
    const halloween = Object.entries(designs ?? {}).find(([, d]) => /halloween/i.test(d?.name ?? ""))?.[0]?.replace(/--n\d+$/, "") ?? "halloween";
    for (const e of missing) {
      const c = byId.get(e.card.id);
      if (!c) continue;
      e.pack = c.halloween ? { id: halloween, name: "Halloween", guessed: true } : { id: "classic", name: "Classique", guessed: true };
    }
  }
  async function recordOpening(boosters, best = [], packs = [], ids = []) {
    const state = await pityState();
    const { mine, rules } = state;
    const now = Date.now();
    const known = new Set(mine.events.map((e) => e.id));
    const added = boosters.map((rarities, i) => {
      const top = Math.max(0, ...rarities.map((r) => RANK[r] ?? 0));
      const c = best[i];
      const card = top >= RANK.SSR && c?.id ? { id: String(c.id), name: c.name ?? null, image: c.image ?? null, rarity: c.rarity } : null;
      const pack = cleanPack(packs[i]);
      const gameId = typeof ids[i] === "string" && /^[A-Za-z0-9_.:-]{1,60}$/.test(ids[i]) ? `g:${ids[i]}` : null;
      return { id: gameId ?? `${(now + i).toString(36)}-${Math.random().toString(36).slice(2, 10)}`, at: now + i, top, ...card ? { card } : {}, ...pack ? { pack } : {} };
    }).filter((e, i, all) => !known.has(e.id) && all.findIndex((x) => x.id === e.id) === i);
    if (!added.length) return pityReport(mine, rules, (await getSettings()).syncPity, await secChance(), await pityPacks());
    mine.events = mergeEvents(mine.events, added);
    if (mine.sec) mine.sec = added.some((e) => e.top >= RANK.SEC) ? null : { ...mine.sec, since: mine.sec.since + added.length };
    mine.unsynced = [.../* @__PURE__ */ new Set([...mine.unsynced, ...added.map((e) => e.id)])].slice(-PITY_EVENTS);
    const on = (await getSettings()).syncPity;
    if (on) await exchangePity(state, true);
    else await savePity(state);
    return pityReport(mine, rules, on, await secChance(), await pityPacks());
  }
  async function setPityRules(rules) {
    const clean = Object.fromEntries(
      Object.keys(PITY).filter((k) => Number(rules?.[k]) > 0).map((k) => [k, Number(rules[k])])
    );
    if (Object.keys(clean).length) await chrome.storage.local.set({ pityRules: clean });
    return { ok: true };
  }

  // src/lib/wants.js
  var WANTS_PULL = 6e4;
  var wantsSyncedAt = 0;
  async function postWants(body) {
    const res = await fetch(`${RELAY}/wants`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`relay_${res.status}`);
    return res.json();
  }
  async function syncWants(fresh = false) {
    if (!(await getSettings()).syncWants) return { off: true };
    if (!fresh && Date.now() - wantsSyncedAt < WANTS_PULL) return { skipped: true };
    wantsSyncedAt = Date.now();
    const player = await myId();
    const { wantWaiting = [], wantSent = [], wantsAt = 0, wantsFor } = await chrome.storage.local.get(["wantWaiting", "wantSent", "wantsAt", "wantsFor"]);
    const mine = wantsFor === player;
    const at = mine ? Number(wantsAt) || 0 : 0;
    try {
      let remote = await postWants({ player, waiting: mine ? wantWaiting : [], sent: mine ? wantSent : [], at });
      const theirs = Array.isArray(remote?.waiting) ? remote : { waiting: [], sent: [], at: 0 };
      if (!mine && wantsFor === void 0 && (wantWaiting.length || wantSent.length)) {
        const join = (x, y) => [.../* @__PURE__ */ new Set([...x, ...y])];
        remote = await postWants({ player, waiting: join(theirs.waiting, wantWaiting).slice(0, 200), sent: join(theirs.sent ?? [], wantSent), at: Date.now() });
      } else if (Number(theirs.at) <= at) {
        if (!mine) await chrome.storage.local.set({ wantsFor: player });
        return { changed: false };
      } else remote = theirs;
      if (((await chrome.storage.local.get("wantsAt")).wantsAt ?? 0) !== wantsAt) return { changed: false };
      await chrome.storage.local.set({ wantWaiting: remote.waiting ?? [], wantSent: remote.sent ?? [], wantsAt: Number(remote.at) || Date.now(), wantsFor: player });
      return { changed: true };
    } catch (e) {
      wantsSyncedAt = 0;
      return { error: e?.message || "relay" };
    }
  }

  // src/lib/pullers.js
  var RARE = ["SSR", "UR", "SEC"];
  var SCAN_AGAIN = 12 * 36e5;
  var SCAN_MAX = 6;
  var scanning = false;
  async function scanPullers(pulls) {
    if (scanning) return;
    const ids = [...new Set((pulls ?? []).filter((p) => RARE.includes(p?.card?.rarity) && p.player?.id).map((p) => p.player.id))];
    if (!ids.length || !(await getSettings()).sharePulls) return;
    scanning = true;
    try {
      const { scannedAt = {} } = await chrome.storage.local.get("scannedAt");
      const now = Date.now();
      for (const id in scannedAt) if (now - scannedAt[id] > SCAN_AGAIN) delete scannedAt[id];
      const todo = ids.filter((id) => !scannedAt[id]).slice(0, 40);
      if (!todo.length) return;
      const res = await fetch(`${RELAY}/holdings/stale?players=${todo.map(encodeURIComponent).join(",")}`);
      if (!res.ok) return;
      const { stale = [] } = await res.json();
      const read = stale.slice(0, SCAN_MAX);
      for (const id of todo) if (!stale.includes(id) || read.includes(id)) scannedAt[id] = now;
      await chrome.storage.local.set({ scannedAt });
      for (const id of read) {
        try {
          const sc = await readShowcase(id);
          const cards = /* @__PURE__ */ new Map();
          for (const copy of sc.private ? [] : sc?.copies ?? []) {
            if (!RARE.includes(copy?.card?.rarity) || !copy.card.id) continue;
            const c = cards.get(copy.card.id) ?? { id: copy.card.id, count: 0, serials: [] };
            c.count++;
            if (Number.isInteger(copy.serial)) c.serials.push(copy.serial);
            cards.set(c.id, c);
          }
          await fetch(`${RELAY}/holdings`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ player: { id, name: sc.player?.name ?? null }, private: !!sc.private, cards: [...cards.values()] })
          });
        } catch {
        }
      }
    } catch {
    } finally {
      scanning = false;
    }
  }
  async function relayHoldings(card) {
    try {
      const res = await fetch(`${RELAY}/holdings?card=${encodeURIComponent(card)}`);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }
  async function whoPulled(query = "", rarity = "") {
    const q = fold(query);
    const [, remote] = await Promise.all([pollFeed().catch(() => {
    }), relayPulls(q.length >= 2 ? { q, limit: 200 } : { limit: 100 })]);
    if (remote?.pulls) await recordFeed(remote.pulls, true);
    const { feedLog = [], feedSince = null } = await chrome.storage.local.get(["feedLog", "feedSince"]);
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

  // src/lib/feed.js
  var FEED_KEEP = 30 * 864e5;
  var FEED_MAX = 4e3;
  var SHARE_EVERY = 5 * 6e4;
  var asFeedPull = (p) => ({ card: { id: p.card.id, name: p.card.name, rarity: p.card.rarity, image: p.card.image, series: p.card.series }, serial: p.serial, player: p.player, pulledAt: new Date(p.at).toISOString() });
  async function recordFeed(pulls, fromRelay = false) {
    const { feedLog = [], feedSince } = await chrome.storage.local.get(["feedLog", "feedSince"]);
    const byKey = new Map(feedLog.map((p) => [p.key, p]));
    for (const p of pulls ?? []) {
      const card = p?.card;
      if (!card?.id || !p.pulledAt) continue;
      const key = `${card.id}#${p.serial ?? ""}#${p.player?.id ?? ""}`;
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
  async function sharePulls(force = false) {
    const { feedSharedAt = 0 } = await chrome.storage.local.get("feedSharedAt");
    if (!force && Date.now() - feedSharedAt < SHARE_EVERY) return;
    if (!(await getSettings()).sharePulls) return;
    await chrome.storage.local.set({ feedSharedAt: Date.now() });
    for (let round = 0; round < 10; round++) {
      const { feedLog = [] } = await chrome.storage.local.get("feedLog");
      const todo = feedLog.filter((p) => !p.shared && ["SSR", "UR", "SEC"].includes(p.card.rarity)).slice(0, 100);
      if (!todo.length) return;
      try {
        const res = await fetch(`${RELAY}/pulls`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pulls: todo.map(asFeedPull) }) });
        if (!res.ok) return;
      } catch {
        return;
      }
      const sent = new Set(todo.map((p) => p.key));
      const { feedLog: now = [] } = await chrome.storage.local.get("feedLog");
      await chrome.storage.local.set({ feedLog: now.map((p) => sent.has(p.key) ? { ...p, shared: true } : p) });
    }
  }
  async function pollFeed() {
    const { pulls } = await cached("feed", 5e4, () => game("/feed"));
    const kept = await recordFeed(pulls);
    await sharePulls();
    scanPullers(pulls);
    return kept;
  }
  async function relayPulls(params) {
    try {
      const res = await fetch(`${RELAY}/pulls?${new URLSearchParams(params)}`);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  // src/lib/who-has.js
  async function searchCards(query) {
    const q = String(query ?? "").trim();
    if (q.length < 2) return [];
    const { cards } = await cached(`card-search:${fold(q)}`, 5 * 6e4, () => game(`/cards?q=${encodeURIComponent(q)}&limit=12`));
    return (cards ?? []).map((c) => ({ id: c.id, name: c.name, variant: c.variant ?? null, image: c.image, rarity: c.rarity, series: c.series?.title ?? null, owned: c.owned ?? 0 }));
  }
  async function cardListings(id) {
    const card = await cached(`card:${id}`, 5 * 6e4, () => game(`/cards/${encodeURIComponent(id)}`));
    const { listings } = await cached(`listings:${id}`, 3e4, () => game(`/market/listings?${new URLSearchParams({ sort: "price", q: card.name })}`));
    const offers = (listings ?? []).filter((l) => (l.card?.id ?? l.cardId) === id && typeof l.price === "number").map((l) => {
      const seller = l.seller ?? l.player ?? null;
      return { id: l.id ?? null, price: l.price, serial: l.serial ?? l.copy?.serial ?? null, player: seller ? { id: seller.id, name: seller.name } : null };
    }).sort((a, b) => a.price - b.price);
    return { offers: offers.slice(0, 5), count: offers.length, maxCopies: card.maxCopies ?? null, name: card.name ?? null };
  }
  async function cardAuctions(id) {
    const body = await cached("auctions", 3e4, () => game("/auctions"));
    const list = Array.isArray(body) ? body : body?.auctions ?? body?.items ?? body?.data ?? [];
    const num = (...v) => v.find((x) => typeof x === "number" && Number.isFinite(x)) ?? null;
    const time = (v) => v == null ? null : typeof v === "number" ? v < 1e12 ? v * 1e3 : v : Date.parse(v) || null;
    const now = Date.now();
    return list.filter((a) => (a?.card?.id ?? a?.cardId ?? a?.copy?.card?.id ?? a?.copy?.cardId) === id).map((a) => {
      const top = a.highestBid ?? a.topBid ?? a.lastBid ?? null;
      const seller = a.seller ?? a.player ?? a.owner ?? null;
      return {
        id: a.id ?? null,
        bid: num(a.currentBid, a.currentPrice, typeof top === "number" ? top : top?.amount, top?.price, a.bid, a.price, a.startingBid, a.startingPrice, a.startPrice, a.minBid),
        bids: num(a.bidCount, a.bidsCount, a._count?.bids, Array.isArray(a.bids) ? a.bids.length : null),
        endsAt: time(a.endsAt ?? a.endAt ?? a.endDate ?? a.expiresAt ?? a.closesAt),
        serial: a.serial ?? a.copy?.serial ?? null,
        player: seller ? { id: seller.id, name: seller.name } : null
      };
    }).filter((a) => a.bid != null && !(a.endsAt && a.endsAt <= now)).sort((a, b) => a.bid - b.bid || (a.endsAt ?? Infinity) - (b.endsAt ?? Infinity));
  }
  async function cardSale(id, image, name, series) {
    const same = (c) => String(c.image ?? "").split(/[?#]/)[0].split("/").pop() === image;
    if (!id && image && series) id = (await seriesCards(series).catch(() => [])).find(same)?.id ?? null;
    if (!id && image && name && name.length >= 2) {
      const { cards } = await cached(`card-search:${fold(name)}`, 5 * 6e4, () => game(`/cards?q=${encodeURIComponent(name)}&limit=12`));
      id = (cards ?? []).find(same)?.id ?? null;
    }
    if (!id) return null;
    const r = await cardListings(id);
    return { id, name: r.name, count: r.count };
  }
  async function cardOwners(id) {
    const card = await game(`/cards/${encodeURIComponent(id)}`);
    const holders = card.maxCopies && Array.isArray(card.holders) ? card.holders.map((x) => ({ serial: x.serial ?? null, player: x.player ? { id: x.player.id, name: x.player.name } : null })) : null;
    let market = [];
    try {
      const { listings } = await game(`/market/listings?${new URLSearchParams({ sort: "price", q: card.name })}`);
      market = (listings ?? []).filter((l) => (l.card?.id ?? l.cardId) === id).map((l) => {
        const seller = l.seller ?? l.player ?? null;
        return { price: l.price ?? null, serial: l.serial ?? l.copy?.serial ?? null, player: seller ? { id: seller.id, name: seller.name } : null };
      });
    } catch {
    }
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
          } catch {
          }
        })
      );
      mates.sort((a, b) => b.me - a.me || b.count - a.count);
    } catch {
    }
    const known = await relayHoldings(id);
    const mateIds = new Set(mates.map((m) => m.player.id));
    const taken = new Set([...mates.flatMap((m) => m.serials), ...market.map((m) => m.serial)].filter((n) => n != null));
    const seen = [];
    for (const o of [...known?.owners ?? []].sort((a, b) => (b.seenAt ?? 0) - (a.seenAt ?? 0))) {
      if (!o.player?.id || mateIds.has(o.player.id)) continue;
      const serials = (o.serials ?? []).filter((n) => !taken.has(n));
      const count = (o.count ?? 1) - ((o.serials ?? []).length - serials.length);
      serials.forEach((n) => taken.add(n));
      if (count > 0) seen.push({ ...o, serials, count });
    }
    const remote = await relayPulls({ card: id, limit: 200 });
    if (remote?.pulls) await recordFeed(remote.pulls, true);
    const { feedLog = [], feedSince = null } = await chrome.storage.local.get(["feedLog", "feedSince"]);
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
  async function knownPlayers(max = 120) {
    const { me, friends: list } = await friends().catch(() => ({ me: null, friends: [] }));
    const skip = /* @__PURE__ */ new Set([me, ...list.map((f) => f.id)]);
    const { feedLog = [] } = await chrome.storage.local.get("feedLog");
    let remote = [];
    try {
      const res = await fetch(`${RELAY}/players?limit=${max}`);
      if (res.ok) remote = (await res.json()).players ?? [];
    } catch {
    }
    const seen = /* @__PURE__ */ new Map();
    for (const p of [...remote, ...feedLog.map((x) => x.player).filter(Boolean)])
      if (p.id && !skip.has(p.id) && !seen.has(p.id)) seen.set(p.id, { id: p.id, name: p.name ?? null });
    return [...seen.values()].slice(0, max);
  }
  async function ownersAmong(cardId, players) {
    const found = [];
    let hidden = 0;
    await Promise.all(
      players.slice(0, 12).map(async (p) => {
        try {
          const sc = await showcase(p.id, 30 * 6e4);
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

  // src/lib/users.js
  var HELLO_EVERY = 9.5 * 6e4;
  async function sayHello(kind) {
    const id = await myId();
    const { helloAt = 0, helloKind, helloFor, revokedFor } = await chrome.storage.local.get(["helloAt", "helloKind", "helloFor", "revokedFor"]);
    const revoked = revokedFor === id;
    if (!revoked && Date.now() - helloAt < HELLO_EVERY && helloKind === kind && helloFor === id) return { ok: true, skipped: true, revoked };
    let name = null;
    try {
      name = (await showcase(id)).player?.name ?? null;
    } catch {
    }
    const res = await fetch(`${RELAY}/hello`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ player: id, name, kind, version: chrome.runtime.getManifest().version, perles: null })
    });
    if (!res.ok) return { ok: false, revoked };
    const now = !!(await res.json().catch(() => null))?.revoked;
    await chrome.storage.local.set({ helloAt: Date.now(), helloKind: kind, helloFor: id });
    if (now) await chrome.storage.local.set({ revokedFor: id });
    else if (revoked) await chrome.storage.local.remove("revokedFor");
    return { ok: true, revoked: now };
  }
  async function access() {
    const id = await myId();
    return cached(`access:${id}`, 5e4, async () => {
      const { revokedFor } = await chrome.storage.local.get("revokedFor");
      try {
        const res = await fetch(`${RELAY}/access?player=${encodeURIComponent(id)}`);
        if (!res.ok) return { revoked: revokedFor === id };
        const revoked = !!(await res.json()).revoked;
        if (revoked) await chrome.storage.local.set({ revokedFor: id });
        else if (revokedFor === id) await chrome.storage.local.remove("revokedFor");
        return { revoked };
      } catch {
        return { revoked: revokedFor === id };
      }
    });
  }

  // src/lib/devices.js
  function keyStore(mode, use) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open("aquaman-keys", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("keys");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction("keys", mode);
        const req = use(tx.objectStore("keys"));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      };
    });
  }
  async function deviceKey() {
    let key = await keyStore("readonly", (store) => store.get("device"));
    if (!key) {
      const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
      const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
      key = { privateKey: pair.privateKey, pub: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y } };
      await keyStore("readwrite", (store) => store.put(key, "device"));
    }
    return key;
  }
  var toBase64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  async function adminFetch(method, path, body, extra = {}) {
    const { adminDevice: adminDevice2 } = await chrome.storage.local.get("adminDevice");
    const text = body ? JSON.stringify(body) : "";
    const headers = { "content-type": "application/json", ...extra };
    if (adminDevice2?.id) {
      const { privateKey } = await deviceKey();
      const time = Date.now();
      const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(`${method} ${path} ${time} ${text}`));
      Object.assign(headers, { "x-aqm-device": adminDevice2.id, "x-aqm-time": String(time), "x-aqm-sig": toBase64url(sig) });
    }
    return fetch(`${RELAY}${path}`, { method, headers, body: text || void 0 });
  }
  async function adminDevice() {
    const { adminDevice: device } = await chrome.storage.local.get("adminDevice");
    if (device?.state !== "pending") return device ?? null;
    const res = await fetch(`${RELAY}/admin/devices/state?id=${device.id}`);
    const { state } = res.ok ? await res.json() : { state: "pending" };
    if (state === "unknown") {
      await chrome.storage.local.remove("adminDevice");
      return null;
    }
    const next = { ...device, state };
    await chrome.storage.local.set({ adminDevice: next });
    return next;
  }
  async function requestDevice(name) {
    const current = await adminDevice();
    if (current) return current;
    const { pub } = await deviceKey();
    const res = await fetch(`${RELAY}/admin/devices/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pub, name }) });
    if (!res.ok) throw new ApiError(res.status, "relay", `Le relais refuse la demande (${res.status}).`);
    const device = await res.json();
    await chrome.storage.local.set({ adminDevice: device });
    return device;
  }
  async function approveWithCode(token, name) {
    const device = await requestDevice(name);
    const res = await fetch(`${RELAY}/admin/devices/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${String(token).trim()}` },
      body: JSON.stringify({ id: device.id })
    });
    if (res.status === 403) return { wrong: true, device };
    if (!res.ok) throw new ApiError(res.status, "relay", `Le relais ne répond pas (${res.status}).`);
    const approved = { ...device, state: "approved" };
    await chrome.storage.local.set({ adminDevice: approved });
    return { device: approved };
  }
  async function asAuthor(method, path, body) {
    const device = await adminDevice();
    if (device?.state !== "approved") return { needDevice: true, device };
    const res = await adminFetch(method, path, body);
    if (res.status === 403) {
      await chrome.storage.local.remove("adminDevice");
      return { needDevice: true, device: null, revoked: true };
    }
    if (!res.ok) throw new ApiError(res.status, "relay", `Le relais ne répond pas (${res.status}).`);
    return res.json();
  }
  var aquamanUsers = () => asAuthor("GET", "/admin/users");

  // src/lib/messages.js
  async function answer(msg) {
    try {
      switch (msg?.type) {
        case "me-id":
          return { id: await myId() };
        case "ownership":
          return await ownership();
        case "collection-stats":
          if (msg.fresh) forget("showcase:", "series");
          return await collectionStats();
        case "rarity-counts":
          return await rarityCounts();
        case "missing-cards": {
          const text = (v, max) => typeof v === "string" ? v.slice(0, max) : "";
          return await missingCards({ rarity: text(msg.rarity, 4), type: text(msg.kind, 40), q: text(msg.q, 80), manga: text(msg.manga, 64) });
        }
        case "collection-snapshot": {
          const { point } = await collectionSnapshot();
          return { ok: true, owned: point.owned };
        }
        case "searched-images":
          return { keys: await searchedImages() };
        case "player-ownership":
          return await playerOwnership(msg);
        case "card-images":
          return { keys: (await loadCatalog())?.map((c) => imageKey(c.image)).filter(Boolean) ?? null };
        case "friends":
          return await friends();
        case "player":
          return await playerSummary(msg.id, !!msg.fresh);
        case "board-known":
          return await boardKnown();
        case "claimed-albums":
          return await claimedAlbums(!!msg.fresh);
        case "boosters":
          return await boosterReport(msg.query, msg.rarity, msg.field);
        case "access":
          return await access();
        case "settings":
          return { groups: SETTINGS, values: await getSettings() };
        case "set-settings":
          return { values: await setSettings(msg.patch ?? {}) };
        case "pity-history":
          return await pityHistory();
        case "pity":
          return await pity(!!msg.fresh);
        case "opened":
          return await recordOpening(msg.boosters ?? [], msg.best ?? [], msg.packs ?? [], msg.ids ?? []);
        case "pity-rules":
          return await setPityRules(msg.rules);
        case "favorites":
          return await favoritesReport(!!msg.fresh);
        case "packs-global":
          return { packs: await globalPacks() };
        case "pack-kinds":
          return { kinds: await packKinds() };
        case "packs-publish":
          return await asAuthor("POST", "/admin/packs", { packs: msg.packs ?? {} });
        case "favorite":
          return { favorites: await setFavorite(msg.id, !!msg.on) };
        case "series-status":
          return await seriesStatus(msg.id);
        case "guarded-series":
          return { series: await guardedSeries() };
        case "set-guarded":
          return { series: await setGuarded(msg.id, msg.cardIds, !!msg.on) };
        case "wants-changed":
          forget("wants", "series");
          return { ok: true };
        case "want-room":
          return await wantRoom(msg.waiting ?? [], msg.sent ?? []);
        case "wants-sync":
          return await syncWants(!!msg.fresh);
        case "market-sync":
          return await syncMarket(!!msg.fresh);
        case "card-search":
          return { cards: await searchCards(msg.query) };
        case "card-listings":
          if (msg.fresh) forget(`listings:${msg.id}`, "showcase:", "auctions");
          return { ...await cardListings(msg.id), auctions: await cardAuctions(msg.id).catch(() => null) };
        case "card-sale":
          return await cardSale(msg.id ?? null, msg.image ?? null, msg.name ?? null, msg.series ?? null);
        case "card-rarity":
          return { rarity: (await cached(`rarity:${msg.id}`, 60 * 6e4, () => game(`/cards/${encodeURIComponent(msg.id)}`)))?.rarity ?? null };
        case "card-owners":
          return await cardOwners(msg.id);
        case "known-players":
          return { players: await knownPlayers() };
        case "owners-among":
          return await ownersAmong(msg.id, msg.players ?? []);
        case "hello":
          return await sayHello(msg.kind);
        case "aquaman-users":
          return await aquamanUsers();
        case "admin-request":
          return { device: await requestDevice(msg.name) };
        case "admin-code":
          return await approveWithCode(msg.token, msg.name);
        case "admin-devices":
          return await asAuthor("GET", "/admin/devices");
        case "admin-approve":
          return await asAuthor("POST", "/admin/devices/approve", { id: msg.id });
        case "admin-revoke":
          return await asAuthor("POST", "/admin/devices/revoke", { id: msg.id });
        case "admin-revoke-player":
          return await asAuthor("POST", "/admin/users/revoke", { id: msg.id, revoked: !!msg.revoked });
        case "who-pulled":
          return await whoPulled(msg.query, msg.rarity);
        case "feed-poll":
          return { kept: await pollFeed() };
        case "feed-seen":
          scanPullers(msg.pulls);
          return { kept: await recordFeed(msg.pulls) };
        case "collection-stale":
          forget("showcase:", "shop", "series", "wants");
          return { ok: true };
        default:
          return { error: "unknown_message" };
      }
    } catch (e) {
      return { error: e?.message || String(e), code: e?.code ?? null };
    }
  }

  // src/lib/updates.js
  var newer = (a, b) => {
    const pa = String(a).replace(/^v/, "").split(".").map(Number);
    const pb = String(b).replace(/^v/, "").split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    }
    return false;
  };
  async function checkUpdate() {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: "application/vnd.github+json" } });
    if (!res.ok) throw new ApiError(res.status, `github_${res.status}`);
    const rel = await res.json();
    const version = String(rel.tag_name ?? "").replace(/^v/, "");
    if (version && newer(version, chrome.runtime.getManifest().version)) {
      const asset = (name) => rel.assets?.find((a) => a.name === name)?.browser_download_url ?? null;
      const update = {
        version,
        url: rel.html_url ?? `https://github.com/${REPO}/releases/latest`,
        zip: asset("aquaman-chromium.zip"),
        xpi: asset("aquaman-firefox.xpi"),
        // Le texte du script, pas le téléchargement de GitHub : Tampermonkey et Userscripts ne proposent d'installer
        // qu'un script affiché comme texte, le fichier de la version est enregistré comme fichier à la place.
        script: rel.tag_name ? `https://raw.githubusercontent.com/${REPO}/${rel.tag_name}/aquaman.user.js` : asset("aquaman.user.js")
      };
      await chrome.storage.local.set({ update });
      return update;
    }
    await chrome.storage.local.remove("update");
    return null;
  }

  // src/userscript/bridge.js
  var UPDATE_EVERY = 10 * 6e4;
  async function scriptUpdate() {
    const { updateCheckedAt = 0 } = await chrome.storage.local.get("updateCheckedAt");
    if (Date.now() - updateCheckedAt >= UPDATE_EVERY) {
      await chrome.storage.local.set({ updateCheckedAt: Date.now() });
      await checkUpdate().catch(() => null);
    }
    const { update } = await chrome.storage.local.get("update");
    return { update: update && newer(update.version, "1.7.0") ? update : null };
  }
  async function handle(msg) {
    switch (msg?.type) {
      case "status":
        return { ok: true };
      case "check-update":
        return scriptUpdate();
      case "install-update":
        return { error: "userscript" };
      case "open": {
        const url = safeHref(msg.href);
        if (!url) return { error: "bad_href" };
        location.assign(url);
        return { ok: true };
      }
      default:
        return answer(msg);
    }
  }

  // src/userscript/shim.js
  var OWNER = "userscript";
  var chrome = (() => {
    const PREFIX = "aqm:";
    const memory = /* @__PURE__ */ new Map();
    const listeners = [];
    const read = (key) => {
      if (memory.has(key)) return memory.get(key);
      try {
        const raw = localStorage.getItem(PREFIX + key);
        if (raw != null) {
          const value = JSON.parse(raw);
          memory.set(key, value);
          return value;
        }
      } catch {
      }
      return void 0;
    };
    const write = (key, value) => {
      memory.set(key, value);
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
      }
    };
    const drop = (key) => {
      memory.delete(key);
      try {
        localStorage.removeItem(PREFIX + key);
      } catch {
      }
    };
    const emit = (changes) => {
      if (!Object.keys(changes).length) return;
      setTimeout(
        () => listeners.forEach((fn) => {
          try {
            fn(changes, "local");
          } catch {
          }
        })
      );
    };
    const names = (keys) => typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys ?? {});
    window.addEventListener("storage", (e) => {
      if (!e.key?.startsWith(PREFIX)) return;
      const key = e.key.slice(PREFIX.length);
      memory.delete(key);
      let newValue;
      try {
        newValue = e.newValue == null ? void 0 : JSON.parse(e.newValue);
      } catch {
      }
      emit({ [key]: { newValue } });
    });
    return {
      runtime: {
        id: OWNER,
        getManifest: () => ({ version: "1.7.0" }),
        sendMessage: (msg) => handle(msg).catch((e) => ({ error: e?.message ?? String(e) }))
      },
      storage: {
        local: {
          async get(keys) {
            const out = {};
            for (const key of names(keys)) {
              const value = read(key);
              if (value !== void 0) out[key] = value;
              else if (keys && typeof keys === "object" && !Array.isArray(keys)) out[key] = keys[key];
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
              changes[key] = { oldValue: read(key), newValue: void 0 };
              drop(key);
            }
            emit(changes);
          }
        },
        onChanged: { addListener: (fn) => listeners.push(fn) }
      }
    };
  })();

  // aquaman.user.js
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
    const ASSETS = /^\/api-game\/v1\/(trades(\/.*)?|market\/.*|auctions(\/.*)?|copies(\/.*)?)$/;
    const MARKET_LIST = /^\/api-game\/v1\/market\/listings$/;
    const AUCTIONS = /^\/api-game\/v1\/auctions$/;
    const listingCards = /* @__PURE__ */ new Map();
    const WRITE = /^\/api-game\/v1\/(boosters\/[^/]+\/open|boosters\/open(-many)?|shop\/booster|trades(\/.*)?|market\/.*|auctions(\/.*)?|copies(\/.*)?|recycle)$/;
    const RARITIES = ["N", "R", "SR", "SSR", "UR", "SEC"];
    const original = window.fetch;
    const requestUrl = (input) => {
      try {
        return new URL(input instanceof Request ? input.url : String(input), location.href);
      } catch {
        return null;
      }
    };
    const emitMarketSales = (body, auctions) => {
      const kind = auctions ? "auctions" : "listings";
      const keys = [];
      for (const sale of Array.isArray(body?.[kind]) ? body[kind] : []) {
        if (auctions && sale?.status !== "open") continue;
        if (typeof sale?.card?.id === "string") keys.push(sale.card.id);
      }
      try {
        document.documentElement.setAttribute(`data-aqm-market-sales-${kind}`, JSON.stringify(keys));
      } catch {
      }
      post({ type: "market-sales", kind, keys });
    };
    const chosenKind = () => {
      try {
        return sessionStorage.getItem("aqm-booster-kind") || "";
      } catch {
        return "";
      }
    };
    const post = (data) => window.postMessage({ aquaman: data.type, ...data }, location.origin);
    (function watchHydration() {
      const started = Date.now();
      const taken = (el) => Object.keys(el).some((k) => k.startsWith("__reactProps$") || k.startsWith("__reactFiber$"));
      const check = () => {
        const own = [...(document.querySelector("main") ?? document.body ?? document).querySelectorAll("button, a[href]")].filter((el) => !el.closest('[class*="aqm-"]'));
        if (document.readyState === "complete" && own.length && own.every(taken) || Date.now() - started > 15e3)
          return void document.documentElement.setAttribute("data-aqm-hydrated", "");
        setTimeout(check, 150);
      };
      check();
    })();
    let storeHook = null;
    let storeState = null;
    async function gameStore() {
      if (storeHook) return storeHook.getState();
      if (storeState) return storeState;
      const T = globalThis.TURBOPACK;
      if (T && !Array.isArray(T) && typeof T.push === "function") {
        const id = `aquaman-${Date.now()}`;
        try {
          T.push([
            "aquaman-store.js",
            id,
            (ctx) => {
              for (const m of Object.values(ctx?.c ?? {}))
                try {
                  const hook = m?.exports?.useGameStore;
                  if (typeof hook?.getState === "function" && typeof hook.getState()?.load === "function") return void (storeHook = hook);
                } catch {
                }
            }
          ]);
          T.push(["aquaman-store-run.js", { otherChunks: [], runtimeModuleIds: [id] }]);
        } catch {
        }
        for (let i = 0; i < 10 && !storeHook; i++) await new Promise((r) => setTimeout(r, 20));
        if (storeHook) return storeHook.getState();
      }
      const el = document.querySelector("button, main, div");
      const key = el && Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
      let fiber = key ? el[key] : null;
      while (fiber?.return) fiber = fiber.return;
      const isStore = (v) => v && typeof v === "object" && typeof v.load === "function" && typeof v.patch === "function";
      const stack = fiber ? [fiber] : [];
      for (let n = 0; stack.length && n < 5e4; n++) {
        const f = stack.pop();
        for (let hook = f.memoizedState, i = 0; hook && typeof hook === "object" && "next" in hook && i < 80; hook = hook.next, i++)
          for (const v of [hook.memoizedState, hook.queue?.lastRenderedState, Array.isArray(hook.memoizedState) ? hook.memoizedState[0] : null])
            if (isStore(v)) return storeState = v;
        if (f.sibling) stack.push(f.sibling);
        if (f.child) stack.push(f.child);
      }
      return null;
    }
    let fullPending = null;
    let forcedPending = null;
    function keepPending(pending) {
      fullPending = pending;
      try {
        document.documentElement.setAttribute("data-aqm-boosters", JSON.stringify(pending.map((b) => ({ id: b.id, kind: b.kindId ?? null, name: b.kindName ?? null, art: b.kindArt ?? null }))));
      } catch {
      }
    }
    async function refreshCardState(id) {
      const res = await fetch(`/api-game/v1/cards/${encodeURIComponent(id)}`, { credentials: "include", headers: { accept: "application/json" } });
      if (!res.ok) return false;
      const fresh = await res.json().catch(() => null);
      if (!fresh || typeof fresh !== "object") return false;
      const card = fresh.card ?? fresh;
      const start2 = [...document.querySelectorAll("main p, main span, main h2, main h3")].find((el) => /^mes exemplaires$/i.test(el.textContent.trim())) ?? document.querySelector("main *");
      const key = start2 && Object.keys(start2).find((k) => k.startsWith("__reactFiber$"));
      const { card: _card, ...around } = fresh.card ? fresh : {};
      let done = false;
      for (let fiber = key ? start2[key] : null; fiber; fiber = fiber.return) {
        for (let hook = typeof fiber.memoizedState === "object" ? fiber.memoizedState : null; hook && "next" in hook; hook = hook.next) {
          const s = hook.memoizedState;
          const dispatch = hook.queue?.dispatch;
          if (typeof dispatch !== "function" || !s || typeof s !== "object" || Array.isArray(s) || !plainState(hook.queue)) continue;
          if (s.id === id && "copies" in s) dispatch(sameShape(s, { ...card, ...around }));
          else if (s.card?.id === id && s.card && typeof s.card === "object") dispatch({ ...sameShape(s, around), card: sameShape(s.card, card) });
          else continue;
          done = true;
        }
      }
      return done;
    }
    function plainState(queue) {
      const reducer = queue?.lastRenderedReducer;
      if (typeof reducer !== "function") return false;
      const probe = {};
      try {
        return reducer(null, probe) === probe;
      } catch {
        return false;
      }
    }
    function sameShape(old, fresh) {
      const next = { ...old };
      for (const [k, v] of Object.entries(fresh ?? {})) {
        if (!(k in old)) next[k] = v;
        else if (old[k] == null) next[k] = v;
        else if (v == null || Array.isArray(v) !== Array.isArray(old[k]) || typeof v !== typeof old[k]) continue;
        else next[k] = v;
      }
      return next;
    }
    let assetsTimer = 0;
    function assetsChanged() {
      clearTimeout(assetsTimer);
      assetsTimer = setTimeout(() => {
        const cardId = location.pathname.match(/^\/jeu\/carte\/([^/?#]+)/)?.[1];
        window.postMessage({ aquamanCmd: "reload-game", cardId: cardId ? decodeURIComponent(cardId) : void 0 }, location.origin);
      }, 600);
    }
    window.addEventListener("message", async (e) => {
      if (e.source !== window || e.data?.aquamanCmd !== "reload-game") return;
      if (e.data.assets) return void assetsChanged();
      const { cardId, perles } = e.data;
      let fixed = false;
      if (typeof cardId === "string")
        try {
          fixed = await refreshCardState(cardId);
        } catch {
        }
      if (!fixed)
        try {
          window.next?.router?.refresh?.();
        } catch {
        }
      try {
        const store = await gameStore();
        if (typeof perles === "number") store?.setPerles?.(perles);
        await store?.load().catch(() => {
        });
      } catch {
      }
    });
    window.addEventListener("message", async (e) => {
      if (e.source !== window || e.data?.aquamanCmd !== "set-perles" || typeof e.data.perles !== "number") return;
      try {
        (await gameStore())?.setPerles?.(e.data.perles);
      } catch {
      }
    });
    window.addEventListener("message", async (e) => {
      if (e.source !== window || e.data?.aquamanCmd !== "refresh-boosters") return;
      let ok = false;
      try {
        const s = await gameStore();
        const kind = e.data.kind ?? "";
        const given = Array.isArray(e.data.items) ? e.data.items : null;
        if (s && (given || e.data.fresh || e.data.reload || !fullPending || typeof s.patch !== "function")) {
          forcedPending = given && given.map((b) => fullPending?.find((x) => x?.id === b.id)).filter(Boolean);
          if (given && !forcedPending.length) forcedPending = null;
          try {
            await s.load().catch(() => {
            });
          } finally {
            forcedPending = null;
          }
          ok = true;
        } else if (s) {
          s.patch(() => ({ pending: kind ? fullPending.filter((b) => (b?.kindId ?? "classic") === kind) : fullPending }));
          ok = true;
        }
      } catch {
      }
      post({ type: "boosters-refreshed", ok, id: e.data.id ?? null });
    });
    function pathOf(input) {
      try {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        return url.origin === location.origin ? url.pathname : null;
      } catch {
        return null;
      }
    }
    function findCopy(v, depth, card = null) {
      if (!v || typeof v !== "object" || Array.isArray(v) || depth > 4 || v instanceof Node || v.$$typeof) return null;
      const own = v.card && typeof v.card === "object" && !Array.isArray(v.card) ? v.card : null;
      const near = own ?? card;
      const copyId = typeof v.copyId === "string" ? v.copyId : typeof v.id === "string" && "serial" in v && v.id !== near?.id && !v.rarity ? v.id : null;
      const cardId = v.cardId ?? near?.id;
      if (copyId && typeof cardId === "string") return { cardId, copyId, name: near?.name ?? v.name ?? null, serial: v.serial ?? null };
      for (const k in v) {
        if (k === "children" || k.startsWith("_") || typeof v[k] !== "object") continue;
        const found = findCopy(v[k], depth + 1, near);
        if (found) return found;
      }
      return null;
    }
    function copyOf(el) {
      const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
      let fiber = key ? el[key] : null;
      for (let i = 0; fiber && i < 20; i++, fiber = fiber.return) {
        const found = findCopy(fiber.memoizedProps, 0);
        if (found) return found;
      }
      return null;
    }
    const seenCopies = /* @__PURE__ */ new Map();
    const cardNames = /* @__PURE__ */ new Map();
    let selfId = null;
    const idOfMe = (me) => [me?.id, me?.userId, me?.player?.id, me?.user?.id].find((x) => typeof x === "string" && x) ?? null;
    function learnSelf(me) {
      const id = idOfMe(me);
      if (!id || id === selfId) return;
      if (selfId) seenCopies.clear();
      selfId = id;
    }
    function ownAnswer(path) {
      const player = path.match(PLAYER_PATH)?.[1];
      if (!player) return true;
      try {
        return !!selfId && decodeURIComponent(player) === selfId;
      } catch {
        return false;
      }
    }
    function learnCopies(body) {
      let left = 3e5;
      const walk = (v, card) => {
        if (!v || typeof v !== "object" || --left < 0) return;
        if (Array.isArray(v)) {
          for (const x of v) walk(x, card);
          return;
        }
        const isCard = typeof v.rarity === "string" && typeof v.name === "string" && typeof v.id === "string";
        if (isCard) cardNames.set(v.id, v.name);
        const own = v.card && typeof v.card === "object" && !Array.isArray(v.card) ? v.card : null;
        const near = own ?? (isCard ? v : card);
        const copyId = typeof v.copyId === "string" ? v.copyId : !isCard && typeof v.id === "string" && typeof v.serial === "number" ? v.id : null;
        const cardId = typeof v.cardId === "string" ? v.cardId : near?.id;
        if (copyId && typeof cardId === "string") seenCopies.set(copyId, { cardId, copyId, name: near?.name ?? null, serial: typeof v.serial === "number" ? v.serial : null });
        for (const k in v) if (v[k] && typeof v[k] === "object") walk(v[k], near);
      };
      walk(body, null);
    }
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
    function tickedCopies() {
      try {
        const buttons = [...document.querySelectorAll("button")].filter((b) => !b.closest(".aqm-root"));
        const bar = buttons.find((b) => /^tout (d[ée])?cocher/i.test(b.textContent.trim()));
        if (!bar) return [];
        const allTicked = /^tout d[ée]cocher/i.test(bar.textContent.trim());
        const out = [];
        const taken = /* @__PURE__ */ new Set();
        for (const sell of buttons) {
          if (sell.textContent.trim() !== "Vendre") continue;
          let row = sell;
          while (row.parentElement && !(row.querySelector("img") && /#\s?\d+/.test(row.textContent))) row = row.parentElement;
          const ticked = allTicked || !!row.querySelector('input[type="checkbox"]:checked, [role="checkbox"][aria-checked="true"], [data-state="checked"]');
          const copy = ticked ? copyOfRow(row, taken) ?? copyOf(sell) : null;
          if (!copy || taken.has(copy.copyId)) continue;
          taken.add(copy.copyId);
          const typed = Math.round(Number(row.querySelector('input:not([type="checkbox"])')?.value));
          const price = typed > 0 ? typed : Math.round(Number(row.textContent.match(/valeur\s*≈?\s*([\d\s  ]+)/i)?.[1]?.replace(/\s/g, "")));
          if (price > 0) out.push({ ...copy, price });
        }
        return out;
      } catch {
        return [];
      }
    }
    const raritiesOf = (pulls) => pulls.map((p) => p?.card?.rarity ?? p?.rarity).filter((r) => RARITIES.includes(r));
    function openedBoosters(body) {
      if (Array.isArray(body?.pulls)) return [body];
      const list = body?.boosters ?? body?.results ?? body?.opened ?? (Array.isArray(body) ? body : null);
      return Array.isArray(list) ? list.filter((b) => Array.isArray(b?.pulls)) : [];
    }
    function askedIds(path, init) {
      let asked = [];
      try {
        const sent = typeof init?.body === "string" ? JSON.parse(init.body) : null;
        asked = [sent?.ids, sent?.boosterIds, sent?.boosters].find(Array.isArray) ?? (sent?.boosterId ? [sent.boosterId] : []);
      } catch {
      }
      const inPath = path.match(/\/boosters\/([^/]+)\/open$/)?.[1];
      if (inPath) asked = [decodeURIComponent(inPath)];
      return asked.map((x) => x?.id ?? x);
    }
    function boosterIdsOf(boosters, path, init) {
      const asked = askedIds(path, init);
      return boosters.map((b, i) => {
        const id = b?.boosterId ?? b?.booster?.id ?? (asked.length === boosters.length ? asked[i] : null);
        return typeof id === "string" && /^[A-Za-z0-9_.:-]{1,60}$/.test(id) ? id : null;
      });
    }
    function packsOf(boosters, path, init, waiting) {
      const list = Array.isArray(waiting) ? waiting : [];
      const named = (id, name) => ({ id: id ?? "classic", name: name ?? list.find((b) => (b?.kindId ?? "classic") === (id ?? "classic"))?.kindName ?? (id && id !== "classic" ? null : "Classique") });
      const asked = askedIds(path, init);
      const shown = chosenKind();
      const kinds = new Set(list.map((b) => b?.kindId ?? "classic"));
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
    function bestCard2(pulls) {
      let best = null;
      for (const p of pulls) {
        const card = p?.card ?? p;
        const rarity = card?.rarity ?? p?.rarity;
        if (RARITIES.includes(rarity) && (!best || RARITIES.indexOf(rarity) > RARITIES.indexOf(best.rarity)))
          best = { id: card.id ?? null, name: card.name ?? null, image: card.image ?? null, rarity };
      }
      return best;
    }
    const CLASSIC_ART = /\/game\/boosters\/classique\.(webp|png|jpe?g)/i;
    const openingArt = () => document.documentElement.getAttribute("data-aqm-opening-art") || "";
    const isClassicUrl = (url) => {
      try {
        return CLASSIC_ART.test(decodeURIComponent(String(url ?? "")));
      } catch {
        return CLASSIC_ART.test(String(url ?? ""));
      }
    };
    const bitmap = globalThis.createImageBitmap;
    const classicBlobs = /* @__PURE__ */ new WeakSet();
    const classicBitmaps = /* @__PURE__ */ new WeakSet();
    const arts = /* @__PURE__ */ new Map();
    const artOf = (url) => {
      if (!arts.has(url)) {
        const art = { img: new Image(), bitmap: null };
        art.img.decoding = "async";
        art.img.addEventListener("load", () => bitmap?.call(globalThis, art.img).then((b) => art.bitmap = b).catch(() => {
        }), { once: true });
        art.img.src = url;
        arts.set(url, art);
      }
      return arts.get(url);
    };
    new MutationObserver(() => openingArt() && artOf(openingArt())).observe(document.documentElement, { attributes: true, attributeFilter: ["data-aqm-opening-art"] });
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
    Response.prototype.blob = function() {
      const out = blob.call(this);
      if (isClassicUrl(this.url)) out.then((b) => classicBlobs.add(b)).catch(() => {
      });
      return out;
    };
    if (bitmap)
      globalThis.createImageBitmap = function(source, ...rest) {
        const out = bitmap.call(this, source, ...rest);
        const classic = source instanceof HTMLImageElement && isClassicUrl(source.currentSrc || source.src) || source instanceof Blob && classicBlobs.has(source);
        if (classic) out.then((b) => classicBitmaps.add(b)).catch(() => {
        });
        return out;
      };
    for (const proto of [CanvasRenderingContext2D.prototype, globalThis.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean)) {
      const draw = proto.drawImage;
      proto.drawImage = function(source, ...rest) {
        return draw.call(this, swapFor(source) ?? source, ...rest);
      };
    }
    for (const proto of [globalThis.WebGLRenderingContext?.prototype, globalThis.WebGL2RenderingContext?.prototype].filter(Boolean))
      for (const name of ["texImage2D", "texSubImage2D"]) {
        const upload = proto[name];
        proto[name] = function(...args) {
          for (let i = 0; i < args.length; i++) {
            const swap = swapFor(args[i]);
            if (swap) args[i] = swap;
          }
          return upload.apply(this, args);
        };
      }
    window.fetch = function(input, init) {
      const path = pathOf(input);
      if (!path?.startsWith("/api-game/")) return original.apply(this, arguments);
      return watch(original.apply(this, arguments), path, input, init);
    };
    async function watch(pending, path, input, init) {
      const self = !!window.__aquamanSelf;
      const waiting = fullPending;
      const res = await pending;
      try {
        const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const kind = chosenKind();
        if (forcedPending && res.ok && method === "GET" && ME.test(path)) {
          const me = await res.clone().json().catch(() => null);
          if (me && typeof me === "object") {
            if (Array.isArray(me.pending)) keepPending(me.pending);
            return new Response(JSON.stringify({ ...me, pending: forcedPending }), { status: res.status, statusText: res.statusText, headers: res.headers });
          }
        }
        if (kind && !self && res.ok && method === "GET" && ME.test(path)) {
          const me = await res.clone().json().catch(() => null);
          if (Array.isArray(me?.pending)) {
            keepPending(me.pending);
            const kept = me.pending.filter((b) => (b?.kindId ?? "classic") === kind);
            if (kept.length) {
              post({ type: "status", pending: me.pending.length, boosters: me.pending.map((b) => ({ id: b.id, kind: b.kindId ?? null, name: b.kindName ?? null, art: b.kindArt ?? null })) });
              return new Response(JSON.stringify({ ...me, pending: kept }), { status: res.status, statusText: res.statusText, headers: res.headers });
            }
          }
        }
        if (path && !res.ok && method === "POST" && ORDERS.test(path) && res.status !== 429) {
          const order = typeof init?.body === "string" ? JSON.parse(init.body) : null;
          if (order?.side === "sell" && order.copyId)
            res.clone().json().catch(() => null).then(
              (body) => post({
                type: "sell-refused",
                item: { cardId: order.cardId, copyId: order.copyId, price: order.price },
                message: body?.error?.message || `Erreur ${res.status}`,
                ticked: tickedCopies()
              })
            );
        }
        if (path && res.ok && method === "GET" && ME.test(path))
          res.clone().json().then(learnSelf).catch(() => {
          });
        if (path && res.ok && method === "GET" && !FEED.test(path) && ownAnswer(path))
          res.clone().json().then(learnCopies).catch(() => {
          });
        const player = path && res.ok && method === "GET" ? path.match(PLAYER_PATH)?.[1] : null;
        if (player)
          res.clone().json().then((body) => post({ type: "player-seen", id: decodeURIComponent(player), name: body?.player?.name ?? body?.user?.name ?? body?.name ?? null })).catch(() => {
          });
        if (path && res.ok) {
          if (method === "GET" && ME.test(path)) {
            res.clone().json().then(
              (me) => Array.isArray(me?.pending) && (keepPending(me.pending), true) && post({
                type: "status",
                pending: me.pending.length,
                boosters: me.pending.map((b) => ({ id: b.id, kind: b.kindId ?? null, name: b.kindName ?? null, art: b.kindArt ?? null }))
              })
            ).catch(() => {
            });
          } else if (method === "GET" && MARKET_LIST.test(path)) {
            res.clone().json().then((body) => {
              for (const l of Array.isArray(body?.listings) ? body.listings : []) if (l?.id && l.card?.name) listingCards.set(String(l.id), { name: l.card.name, rarity: l.card.rarity ?? null });
              if (requestUrl(input)?.searchParams.get("mine") === "1") emitMarketSales(body, false);
            }).catch(() => {
            });
          } else if (method === "GET" && AUCTIONS.test(path) && requestUrl(input)?.searchParams.get("mine") === "selling") {
            res.clone().json().then((body) => emitMarketSales(body, true)).catch(() => {
            });
          } else if (method === "GET" && path === "/api-game/v1/cards" && location.pathname.startsWith("/jeu/collection")) {
            let query = "";
            try {
              query = new URL(input instanceof Request ? input.url : String(input), location.href).search;
            } catch {
            }
            res.clone().json().then((body) => {
              const cards = Array.isArray(body?.cards) ? body.cards : [];
              post({ type: "cards-shown", query, ids: cards.map((c) => c?.id).filter((id) => typeof id === "string"), names: cards.slice(0, 400).map((c) => [c?.id, c?.name, c?.series?.title ?? ""]) });
            }).catch(() => {
            });
          } else if (method === "GET" && FEED.test(path)) {
            res.clone().json().then((body) => Array.isArray(body?.pulls) && post({ type: "feed", pulls: body.pulls })).catch(() => {
            });
          } else if (method !== "GET" && WRITE.test(path)) {
            const bought = path.match(MARKET_BUY)?.[1];
            const card = bought && listingCards.get(decodeURIComponent(bought));
            if (card) post({ type: "market-bought", name: card.name, rarity: card.rarity });
            if (BUY.test(path) && fullPending)
              res.clone().json().then((body) => {
                const b = body?.booster;
                if (!b?.id || fullPending.some((x) => x?.id === b.id)) return;
                keepPending([...fullPending, b]);
                post({ type: "status", pending: fullPending.length, boosters: fullPending.map((x) => ({ id: x.id, kind: x.kindId ?? null, name: x.kindName ?? null, art: x.kindArt ?? null })) });
              }).catch(() => {
              });
            if (OPEN.test(path) && !window.__aquamanSelf)
              res.clone().json().then((body) => {
                const all = openedBoosters(body);
                const packs = packsOf(all, path, init, waiting);
                const ids = boosterIdsOf(all, path, init);
                const opened = all.map((b, i) => ({ pulls: b.pulls, pack: packs[i], id: ids[i] })).filter((b) => raritiesOf(b.pulls).length);
                if (opened.length)
                  post({
                    type: "opened",
                    boosters: opened.map((b) => raritiesOf(b.pulls)),
                    best: opened.map((b) => bestCard2(b.pulls)),
                    packs: opened.map((b) => b.pack),
                    ids: opened.map((b) => b.id),
                    // (les cartes tirées : leurs doublons peuvent être recyclés depuis la fenêtre de cartes)
                    cards: opened.map((b) => (Array.isArray(b.pulls) ? b.pulls : []).map((p) => (p?.card ?? p)?.id).filter((id) => typeof id === "string"))
                  });
              }).catch(() => {
              });
            if (ASSETS.test(path) && res.ok) assetsChanged();
            post({ type: "collection-stale" });
          }
        }
      } catch {
      }
      return res;
    }
  })();
  var start = () => {
    const style = document.createElement("style");
    style.id = "aquaman-style";
    style.textContent = '/* src/content/styles/01-base.css */\n.aqm-root {\n  --aqm-bg: #0b0b0d;\n  --aqm-panel: #121214;\n  --aqm-card: #18181b;\n  --aqm-line: rgba(255, 255, 255, 0.07);\n  --aqm-text: #f4f4f5;\n  --aqm-muted: #a1a1aa;\n  --aqm-dim: #71717a;\n  --aqm-accent: #60a5fa;\n  --aqm-yes: #22c55e;\n  --aqm-no: #ef4444;\n  box-sizing: border-box;\n}\n.aqm-root *,\n.aqm-root *::before,\n.aqm-root *::after {\n  box-sizing: border-box;\n}\n\n/* src/content/styles/02-plus-menu.css */\n.aqm-plus {\n  cursor: pointer;\n  background: none;\n  border: 0;\n}\n.aqm-plus[aria-expanded=true] {\n  color: #fff;\n  background: rgba(255, 255, 255, 0.1);\n}\n.aqm-nav-ico,\n.aqm-nav-ico svg {\n  display: inline-block;\n  width: 16px;\n  height: 16px;\n  flex-shrink: 0;\n}\n.aqm-menu {\n  position: fixed;\n  z-index: 2147483000;\n  width: 290px;\n  padding: 6px;\n  border-radius: 18px;\n  background: var(--aqm-panel);\n  border: 1px solid var(--aqm-line);\n  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);\n  animation: aqm-pop 0.14s ease-out;\n}\n.aqm-menu-item {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  width: 100%;\n  padding: 10px 12px;\n  border: 0;\n  border-radius: 12px;\n  background: none;\n  color: var(--aqm-text);\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n}\n.aqm-menu-item:hover,\n.aqm-menu-item:focus-visible {\n  background: rgba(255, 255, 255, 0.06);\n  outline: none;\n}\n.aqm-menu-item strong {\n  display: block;\n  font-size: 14px;\n  font-weight: 800;\n}\n.aqm-menu-item small {\n  display: block;\n  margin-top: 2px;\n  font-size: 12px;\n  color: var(--aqm-muted);\n}\n.aqm-menu-ico {\n  display: grid;\n  place-items: center;\n  width: 36px;\n  height: 36px;\n  flex-shrink: 0;\n  border-radius: 10px;\n  background: rgba(96, 165, 250, 0.12);\n  color: var(--aqm-accent);\n}\n.aqm-menu-ico svg {\n  width: 18px;\n  height: 18px;\n}\n@keyframes aqm-pop {\n  from {\n    opacity: 0;\n    transform: translateY(-4px) scale(0.98);\n  }\n}\n\n/* src/content/styles/03-window.css */\nhtml.aqm-lock {\n  overflow: hidden;\n}\n.aqm-overlay {\n  position: fixed;\n  inset: 0;\n  z-index: 2147482000;\n  display: flex;\n  align-items: flex-start;\n  justify-content: center;\n  padding: 48px 16px;\n  overflow-y: auto;\n  background: rgba(0, 0, 0, 0.72);\n  backdrop-filter: blur(6px);\n  color: var(--aqm-text);\n  animation: aqm-fade 0.16s ease-out;\n}\n@keyframes aqm-fade {\n  from {\n    opacity: 0;\n  }\n}\n.aqm-panel {\n  width: 100%;\n  max-width: 860px;\n  border-radius: 28px;\n  background: var(--aqm-panel);\n  border: 1px solid var(--aqm-line);\n  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7);\n  overflow: hidden;\n}\n.aqm-head {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 16px;\n  padding: 26px 28px 8px;\n}\n.aqm-title {\n  margin: 0;\n  font-size: 22px;\n  font-weight: 900;\n  font-style: italic;\n  text-transform: uppercase;\n  letter-spacing: -0.01em;\n  color: #fff;\n}\n.aqm-sub {\n  margin: 6px 0 0;\n  font-size: 14px;\n  color: var(--aqm-muted);\n}\n.aqm-close {\n  display: grid;\n  place-items: center;\n  width: 36px;\n  height: 36px;\n  flex-shrink: 0;\n  border: 0;\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.06);\n  color: var(--aqm-muted);\n  cursor: pointer;\n}\n.aqm-close:hover {\n  color: #fff;\n  background: rgba(255, 255, 255, 0.12);\n}\n.aqm-close svg {\n  width: 18px;\n  height: 18px;\n}\n.aqm-body {\n  padding: 12px 28px 28px;\n}\n.aqm-note {\n  margin: 14px 0 0;\n  font-size: 12px;\n  line-height: 1.5;\n  color: var(--aqm-dim);\n}\n.aqm-muted {\n  margin: 0;\n  font-size: 12px;\n  color: var(--aqm-muted);\n}\n.aqm-label {\n  margin: 0 0 8px;\n  font-size: 11px;\n  font-weight: 800;\n  letter-spacing: 0.14em;\n  text-transform: uppercase;\n  color: var(--aqm-accent);\n}\n.aqm-empty {\n  padding: 28px;\n  text-align: center;\n  color: var(--aqm-muted);\n  list-style: none;\n}\n.aqm-chips {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n.aqm-chip {\n  height: 34px;\n  padding: 0 14px;\n  border: 1px solid var(--aqm-line);\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.04);\n  color: var(--aqm-muted);\n  font: inherit;\n  font-size: 12px;\n  font-weight: 800;\n  text-transform: uppercase;\n  letter-spacing: 0.04em;\n  cursor: pointer;\n}\n.aqm-chip:hover {\n  color: #fff;\n}\n.aqm-chip.is-on {\n  border-color: rgba(96, 165, 250, 0.4);\n  background: rgba(37, 99, 235, 0.22);\n  color: #fff;\n}\n.aqm-place {\n  display: grid;\n  place-items: center;\n  width: 30px;\n  height: 30px;\n  flex-shrink: 0;\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.06);\n  font-size: 13px;\n  font-weight: 900;\n  color: var(--aqm-muted);\n}\n.aqm-place-1 {\n  background:\n    linear-gradient(\n      135deg,\n      #fde68a,\n      #f59e0b);\n  color: #422006;\n}\n.aqm-place-2 {\n  background:\n    linear-gradient(\n      135deg,\n      #f4f4f5,\n      #a1a1aa);\n  color: #18181b;\n}\n.aqm-place-3 {\n  background:\n    linear-gradient(\n      135deg,\n      #fdba74,\n      #c2410c);\n  color: #fff7ed;\n}\n\n/* src/content/styles/04-leaderboard.css */\n.aqm-board {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  margin: 16px 0 0;\n  padding: 0;\n  list-style: none;\n}\n.aqm-row {\n  display: flex;\n  align-items: center;\n  gap: 14px;\n  padding: 12px 16px;\n  border-radius: 18px;\n  background: var(--aqm-card);\n  border: 1px solid transparent;\n}\n.aqm-row.is-me {\n  border-color: rgba(96, 165, 250, 0.35);\n  background:\n    linear-gradient(\n      90deg,\n      rgba(37, 99, 235, 0.14),\n      var(--aqm-card) 60%);\n}\n.aqm-avatar {\n  width: 40px;\n  height: 40px;\n  flex-shrink: 0;\n  border-radius: 12px;\n  object-fit: cover;\n  background: #27272a;\n}\n.aqm-name {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n  flex: 1;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  font-size: 14px;\n  font-weight: 800;\n  color: #fff;\n  text-decoration: none;\n}\n.aqm-name:hover {\n  text-decoration: underline;\n}\n.aqm-tag {\n  padding: 2px 8px;\n  border-radius: 999px;\n  background: rgba(96, 165, 250, 0.18);\n  color: #bfdbfe;\n  font-size: 10px;\n  font-weight: 900;\n  text-transform: uppercase;\n}\n.aqm-stats {\n  display: flex;\n  align-items: center;\n  gap: 20px;\n  flex-shrink: 0;\n}\n.aqm-stat {\n  min-width: 170px;\n  opacity: 0.6;\n}\n.aqm-stat.is-on {\n  opacity: 1;\n}\n.aqm-stat strong {\n  font-size: 18px;\n  font-weight: 900;\n  color: #fff;\n  font-variant-numeric: tabular-nums;\n}\n.aqm-stat small {\n  margin-left: 4px;\n  font-size: 11px;\n  color: var(--aqm-muted);\n}\n.aqm-bar {\n  display: block;\n  height: 4px;\n  margin-top: 6px;\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.08);\n  overflow: hidden;\n}\n.aqm-bar > span {\n  display: block;\n  height: 100%;\n  border-radius: inherit;\n  background:\n    linear-gradient(\n      90deg,\n      #3b82f6,\n      #60a5fa);\n}\n.aqm-board-scope {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 12px;\n  margin: 40px auto 0;\n}\n.aqm-board-sort {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  font-size: 12px;\n}\n.aqm-board-sort .aqm-chips {\n  flex-wrap: wrap;\n  justify-content: center;\n}\n.aqm-friends-board {\n  margin: 32px auto 0;\n}\n.aqm-board-game {\n  margin-top: 16px;\n  padding: 0;\n  list-style: none;\n}\n.aqm-friends-board[hidden],\n.aqm-friends-status[hidden],\n[data-aqm-board-off] {\n  display: none !important;\n}\n.aqm-friends-note {\n  margin: 0;\n  text-align: center;\n  font-size: 13px;\n}\n.aqm-friend-main {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  min-width: 0;\n  flex: 1;\n}\n.aqm-friend-main .aqm-name {\n  flex: none;\n}\n.aqm-friend-main small {\n  font-size: 11px;\n}\n.aqm-friend-score {\n  flex-shrink: 0;\n  text-align: right;\n  white-space: nowrap;\n}\n.aqm-friend-score strong {\n  font-size: 18px;\n  font-weight: 900;\n  color: #fff;\n  font-variant-numeric: tabular-nums;\n}\n.aqm-friend-score small {\n  margin-left: 4px;\n  font-size: 11px;\n  color: var(--aqm-muted);\n}\n.aqm-friends-board .aqm-board-refresh {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  margin-top: 12px;\n  font-size: 12px;\n}\n@media (max-width: 640px) {\n  .aqm-friends-board .aqm-row {\n    gap: 10px;\n    padding: 10px 12px;\n  }\n  .aqm-friend-score strong {\n    font-size: 15px;\n  }\n}\n\n/* src/content/styles/05-boosters.css */\n.aqm-search {\n  flex: 1 1 260px;\n  height: 44px;\n  padding: 0 18px;\n  border: 1px solid var(--aqm-line);\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.04);\n  color: #fff;\n  font: inherit;\n  font-size: 14px;\n  outline: none;\n}\n.aqm-search:focus {\n  border-color: rgba(96, 165, 250, 0.5);\n}\n.aqm-search::placeholder {\n  color: var(--aqm-dim);\n}\n.aqm-pack {\n  width: 64px;\n  height: 92px;\n  flex-shrink: 0;\n  border-radius: 10px;\n  object-fit: cover;\n}\n.aqm-pack-plain {\n  display: grid;\n  place-items: center;\n  background:\n    linear-gradient(\n      160deg,\n      #1e3a8a,\n      #0ea5e9 55%,\n      #e0f2fe);\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);\n}\n.aqm-pack-plain span {\n  font-size: 11px;\n  font-weight: 900;\n  font-style: italic;\n  text-transform: uppercase;\n  color: #fff;\n  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);\n}\n.aqm-perles {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  font-variant-numeric: tabular-nums;\n}\n.aqm-pearl {\n  display: inline-block;\n  width: 10px;\n  height: 10px;\n  border-radius: 999px;\n  background:\n    radial-gradient(\n      circle at 35% 30%,\n      #fff,\n      #bfdbfe 45%,\n      #60a5fa);\n  box-shadow: 0 0 6px rgba(147, 197, 253, 0.6);\n}\n.aqm-strip {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));\n  gap: 8px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n.aqm-mini {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n  padding: 6px;\n  border-radius: 10px;\n  background: rgba(255, 255, 255, 0.035);\n}\n.aqm-mini img {\n  width: 34px;\n  height: 48px;\n  flex-shrink: 0;\n  border-radius: 5px;\n  object-fit: cover;\n}\n.aqm-mini > div {\n  min-width: 0;\n}\n.aqm-mini.is-owned img {\n  box-shadow: 0 0 0 2px var(--aqm-yes);\n}\n.aqm-mini-name {\n  margin: 0;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  font-size: 12px;\n  font-weight: 800;\n  color: #fff;\n}\n.aqm-rarity {\n  font-weight: 900;\n  font-style: italic;\n}\n.aqm-r-N {\n  color: #e4e4e7;\n}\n.aqm-r-R {\n  color: #60a5fa;\n}\n.aqm-r-SR {\n  color: #c4b5fd;\n}\n.aqm-r-SSR {\n  color: #fde047;\n}\n.aqm-r-UR {\n  color: #f9a8d4;\n}\n.aqm-r-SEC {\n  color: #e2e8f0;\n  text-shadow: 0 0 6px rgba(196, 181, 253, 0.8);\n}\n@media (max-width: 640px) {\n  .aqm-overlay {\n    padding: 16px 8px;\n  }\n  .aqm-head,\n  .aqm-body {\n    padding-left: 16px;\n    padding-right: 16px;\n  }\n  .aqm-row {\n    flex-wrap: wrap;\n  }\n  .aqm-stats {\n    width: 100%;\n    padding-left: 44px;\n  }\n  .aqm-stat {\n    min-width: 0;\n  }\n  .aqm-pack {\n    width: 48px;\n    height: 69px;\n  }\n}\n\n/* src/content/styles/06-card-trades-pulls.css */\n.aqm-card-who {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  cursor: pointer;\n}\n.aqm-card-who-icon,\n.aqm-card-who-icon svg {\n  display: inline-block;\n  width: 16px;\n  height: 16px;\n  flex-shrink: 0;\n}\n.aqm-card-who-row {\n  margin-top: 12px;\n}\n.aqm-dot {\n  position: absolute;\n  top: 3px;\n  right: 3px;\n  z-index: 5;\n  min-width: 11px;\n  height: 11px;\n  border-radius: 999px;\n  border: 2px solid rgba(0, 0, 0, 0.85);\n  box-shadow: 0 0 6px rgba(0, 0, 0, 0.6);\n  pointer-events: auto;\n}\n.aqm-dot.is-yes {\n  background: var(--aqm-yes);\n}\n.aqm-dot.is-no {\n  background: var(--aqm-no);\n}\n.aqm-dot.has-count {\n  height: 13px;\n  padding: 0 3px;\n  font: 800 8px/9px system-ui, sans-serif;\n  color: #052e16;\n  text-align: center;\n}\n.aqm-pull-thumb {\n  zoom: 1.7;\n}\n\n/* src/content/styles/07-showcase.css */\n.aqm-hidden {\n  display: none !important;\n}\n.aqm-slot {\n  position: relative;\n  cursor: grab;\n  transition: transform 0.15s, opacity 0.15s;\n}\n.aqm-slot:active {\n  cursor: grabbing;\n}\n.aqm-slot.aqm-dragging {\n  opacity: 0.4;\n}\n.aqm-slot.aqm-over {\n  transform: translateY(-4px);\n  outline: 2px dashed #60a5fa;\n  outline-offset: 3px;\n  border-radius: 10px;\n}\n.aqm-moving .aqm-slot {\n  pointer-events: none;\n}\n.aqm-slot-x {\n  position: absolute;\n  top: 4px;\n  right: 4px;\n  z-index: 6;\n  display: grid;\n  place-items: center;\n  width: 22px;\n  height: 22px;\n  padding: 0;\n  border: 0;\n  border-radius: 999px;\n  background: rgba(127, 29, 29, 0.9);\n  color: #fecaca;\n  cursor: pointer;\n  opacity: 0;\n  transition: opacity 0.15s;\n}\n.aqm-slot-x svg {\n  width: 12px;\n  height: 12px;\n}\n.aqm-slot:hover .aqm-slot-x,\n.aqm-slot-x:focus-visible {\n  opacity: 1;\n}\n@media (hover: none) {\n  .aqm-slot-x {\n    opacity: 1;\n  }\n}\n.aqm-slot {\n  user-select: none;\n  -webkit-user-select: none;\n  -webkit-touch-callout: none;\n}\n.aqm-ghost {\n  position: fixed;\n  top: 0;\n  left: 0;\n  z-index: 2147483200;\n  margin: 0;\n  pointer-events: none;\n  opacity: 0.92;\n  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.6));\n  will-change: transform;\n}\n.aqm-ghost .aqm-slot-x {\n  display: none;\n}\n[data-aqm-lite] > * {\n  content-visibility: auto;\n  contain-intrinsic-size: auto var(--aqm-cell-w, 120px) auto var(--aqm-cell-h, 200px);\n}\n\n/* src/content/styles/08-update.css */\n.aqm-update .aqm-queue-head strong {\n  color: #93c5fd;\n}\n.aqm-update-actions {\n  display: flex;\n  justify-content: flex-end;\n  gap: 8px;\n  margin-top: 10px;\n}\n.aqm-update-actions .aqm-queue-btn {\n  display: inline-flex;\n  align-items: center;\n  text-decoration: none;\n}\n.aqm-update-actions .is-main {\n  border-color: #2563eb;\n  background: #2563eb;\n}\n.aqm-update-steps {\n  display: grid;\n  gap: 6px;\n  margin: 8px 0 0;\n  padding-left: 20px;\n  font-size: 13px;\n  line-height: 1.45;\n}\n.aqm-update .aqm-muted {\n  margin: 8px 0 0;\n  font-size: 12px;\n}\n\n/* src/content/styles/09-tour.css */\n.aqm-tour {\n  position: fixed;\n  inset: 0;\n  z-index: 2147483100;\n  color: var(--aqm-text);\n}\n.aqm-tour-block {\n  position: absolute;\n  inset: 0;\n}\n.aqm-tour-hole {\n  position: fixed;\n  border-radius: 16px;\n  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.9), 0 0 0 9999px rgba(0, 0, 0, 0.66);\n  pointer-events: none;\n  transition: all 0.25s ease;\n}\n.aqm-tour.is-dim .aqm-tour-block {\n  background: rgba(0, 0, 0, 0.66);\n}\n.aqm-tour-card {\n  position: fixed;\n  top: 0;\n  left: 0;\n  width: min(360px, calc(100vw - 24px));\n  padding: 18px 20px 16px;\n  border-radius: 20px;\n  background: var(--aqm-panel);\n  border: 1px solid rgba(96, 165, 250, 0.25);\n  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);\n  transition: transform 0.25s ease;\n}\n.aqm-tour-count {\n  margin: 0;\n  font-size: 11px;\n  font-weight: 800;\n  letter-spacing: 0.14em;\n  color: var(--aqm-accent);\n}\n.aqm-tour-title {\n  margin: 6px 0 0;\n  font-size: 18px;\n  font-weight: 900;\n  font-style: italic;\n  text-transform: uppercase;\n  color: #fff;\n}\n.aqm-tour-text {\n  margin: 8px 0 0;\n  font-size: 14px;\n  line-height: 1.5;\n  color: #d4d4d8;\n}\n.aqm-tour-actions {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-top: 16px;\n}\n.aqm-tour-gap {\n  flex: 1;\n}\n.aqm-tour-skip,\n.aqm-tour-btn {\n  height: 36px;\n  padding: 0 14px;\n  border: 0;\n  border-radius: 999px;\n  font: inherit;\n  font-size: 13px;\n  font-weight: 800;\n  cursor: pointer;\n}\n.aqm-tour-skip {\n  padding: 0 4px;\n  background: none;\n  color: var(--aqm-dim);\n}\n.aqm-tour-skip:hover {\n  color: #fff;\n}\n.aqm-tour-btn {\n  background: rgba(255, 255, 255, 0.08);\n  color: #fff;\n}\n.aqm-tour-btn.is-main {\n  background: #2563eb;\n}\n.aqm-tour-btn:hover {\n  filter: brightness(1.15);\n}\n\n/* src/content/styles/10-phone.css */\n@media (max-width: 640px) {\n  .aqm-overlay {\n    padding: 0;\n  }\n  .aqm-panel {\n    min-height: 100%;\n    border-radius: 0;\n    border: 0;\n  }\n  .aqm-head {\n    position: sticky;\n    top: 0;\n    z-index: 2;\n    padding-top: 18px;\n    background: var(--aqm-panel);\n  }\n  .aqm-title {\n    font-size: 19px;\n  }\n  .aqm-menu {\n    width: min(290px, calc(100vw - 16px));\n  }\n  .aqm-strip {\n    grid-template-columns: 1fr;\n  }\n  .aqm-pull-thumb {\n    zoom: 1.4;\n  }\n  .aqm-tour-actions {\n    flex-wrap: wrap;\n  }\n}\n\n/* src/content/styles/11-news.css */\n.aqm-news-version {\n  margin-top: 18px;\n}\n.aqm-news {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n.aqm-news li {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 12px 14px;\n  border-radius: 14px;\n  background: var(--aqm-card);\n  font-size: 14px;\n  line-height: 1.45;\n  color: #e4e4e7;\n}\n.aqm-news .aqm-chip {\n  flex-shrink: 0;\n}\n.aqm-news-foot {\n  display: flex;\n  justify-content: flex-end;\n  gap: 8px;\n  margin-top: 20px;\n}\n@media (max-width: 640px) {\n  .aqm-news li {\n    flex-direction: column;\n    align-items: flex-start;\n  }\n}\n\n/* src/content/styles/12-boosters-filters.css */\n.aqm-filter-name {\n  width: 86px;\n  flex-shrink: 0;\n  font-size: 11px;\n  font-weight: 800;\n  letter-spacing: 0.1em;\n  text-transform: uppercase;\n  color: var(--aqm-dim);\n}\n.aqm-chip-r {\n  font-style: italic;\n  font-weight: 900;\n}\n.aqm-chip-r.is-on {\n  border-color: currentColor;\n  background: rgba(255, 255, 255, 0.08);\n}\n.aqm-how {\n  margin-top: 16px;\n  padding: 12px 16px;\n  border-radius: 14px;\n  background: var(--aqm-card);\n  font-size: 13px;\n  color: #d4d4d8;\n}\n.aqm-how summary {\n  cursor: pointer;\n  font-weight: 800;\n  color: #fff;\n}\n.aqm-how ul {\n  margin: 10px 0 0;\n  padding-left: 18px;\n  line-height: 1.55;\n}\n.aqm-how li + li {\n  margin-top: 4px;\n}\n\n/* src/content/styles/13-strips.css */\n.aqm-grab {\n  cursor: grab;\n}\nhtml.aqm-grabbing,\nhtml.aqm-grabbing * {\n  cursor: grabbing !important;\n  user-select: none !important;\n  -webkit-user-select: none !important;\n}\n\n/* src/content/styles/14-pity.css */\n.aqm-pity {\n  width: min(460px, 100%);\n  margin: 14px auto 0;\n  padding: 12px 16px;\n  border-radius: 18px;\n  background: rgba(255, 255, 255, 0.04);\n  border: 1px solid var(--aqm-line);\n  text-align: left;\n  color: var(--aqm-text);\n}\n.aqm-pity .aqm-label {\n  margin-bottom: 8px;\n  text-align: center;\n}\n.aqm-pity-lines {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 14px;\n}\n.aqm-pity-line p {\n  margin: 0;\n  font-size: 13px;\n  font-weight: 700;\n  color: #e4e4e7;\n}\n.aqm-pity-line strong {\n  color: #fff;\n  font-weight: 900;\n}\n.aqm-pity-line .aqm-bar {\n  margin-top: 6px;\n}\n.aqm-pity-line small {\n  display: block;\n  margin-top: 4px;\n  font-size: 11px;\n  color: var(--aqm-muted);\n  font-variant-numeric: tabular-nums;\n}\n.aqm-pity-line:has(.aqm-r-UR) .aqm-bar > span {\n  background:\n    linear-gradient(\n      90deg,\n      #38bdf8,\n      #f472b6,\n      #facc15);\n}\n.aqm-pity-line:has(.aqm-r-SSR) .aqm-bar > span {\n  background:\n    linear-gradient(\n      90deg,\n      #eab308,\n      #fde047);\n}\n.aqm-pity-line.is-sec {\n  grid-column: 1 / -1;\n  padding-top: 10px;\n  border-top: 1px solid var(--aqm-line);\n}\n.aqm-pity-note {\n  margin: 10px 0 0;\n  font-size: 11px;\n  text-align: center;\n  color: var(--aqm-dim);\n}\n.aqm-pity-more {\n  display: flex;\n  justify-content: center;\n  margin-top: 10px;\n}\n.aqm-history {\n  display: grid;\n  gap: 14px;\n}\n.aqm-history-count {\n  margin: 0;\n  font-size: 12px;\n  color: var(--aqm-dim);\n}\n.aqm-rates {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 10px;\n}\n.aqm-rate {\n  --aqm-rate:\n    148,\n    163,\n    184;\n  position: relative;\n  padding: 14px 16px;\n  border: 1px solid rgba(var(--aqm-rate), 0.22);\n  border-radius: 18px;\n  background:\n    radial-gradient(\n      120% 90% at 0% 0%,\n      rgba(var(--aqm-rate), 0.14),\n      transparent 60%),\n    var(--aqm-card);\n  overflow: hidden;\n}\n.aqm-rate.is-SSR {\n  --aqm-rate:\n    253,\n    224,\n    71;\n}\n.aqm-rate.is-UR {\n  --aqm-rate:\n    244,\n    114,\n    182;\n}\n.aqm-rate.is-SEC {\n  --aqm-rate:\n    196,\n    181,\n    253;\n}\n.aqm-rate-top {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  font-size: 15px;\n  font-weight: 900;\n  font-style: italic;\n}\n.aqm-rate-value {\n  margin: 10px 0 0;\n  font-size: 26px;\n  font-weight: 900;\n  line-height: 1;\n}\n.aqm-rate-value small {\n  font-size: 13px;\n  font-weight: 700;\n  color: var(--aqm-dim);\n}\n.aqm-rate-sub {\n  margin: 4px 0 0;\n  font-size: 12px;\n  color: var(--aqm-dim);\n}\n.aqm-rate-foot {\n  margin: 12px 0 0;\n  padding-top: 10px;\n  border-top: 1px solid var(--aqm-line);\n  font-size: 11px;\n  color: var(--aqm-dim);\n}\n.aqm-luck {\n  font-size: 10px;\n  font-style: normal;\n}\n.aqm-luck.is-good {\n  background: rgba(34, 197, 94, 0.18);\n  color: #86efac;\n}\n.aqm-luck.is-bad {\n  background: rgba(239, 68, 68, 0.18);\n  color: #fca5a5;\n}\n.aqm-history-box {\n  padding: 14px 16px;\n  border: 1px solid var(--aqm-line);\n  border-radius: 18px;\n  background: rgba(255, 255, 255, 0.02);\n}\n.aqm-history-row {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 8px;\n  margin-bottom: 10px;\n}\n.aqm-history-row .aqm-label {\n  margin: 0;\n}\n.aqm-tracker-strip {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(8px, 1fr));\n  gap: 3px;\n}\n.aqm-cell {\n  display: inline-block;\n  height: 16px;\n  min-width: 8px;\n  border-radius: 3px;\n  background: rgba(255, 255, 255, 0.07);\n  vertical-align: middle;\n}\n.aqm-cell.is-SSR {\n  background: #fde047;\n  box-shadow: 0 0 8px rgba(253, 224, 71, 0.45);\n}\n.aqm-cell.is-UR {\n  background: #f472b6;\n  box-shadow: 0 0 8px rgba(244, 114, 182, 0.55);\n}\n.aqm-cell.is-SEC {\n  background:\n    linear-gradient(\n      180deg,\n      #c4b5fd,\n      #67e8f9);\n  box-shadow: 0 0 10px rgba(196, 181, 253, 0.9);\n}\n.aqm-tracker-legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 14px;\n  margin: 10px 0 0;\n  font-size: 11px;\n  color: var(--aqm-dim);\n}\n.aqm-tracker-legend > span {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n}\n.aqm-tracker-legend .aqm-cell {\n  width: 8px;\n  height: 12px;\n}\n.aqm-history-tabs {\n  display: flex;\n  gap: 4px;\n  width: fit-content;\n  padding: 4px;\n  border-radius: 999px;\n  background: rgba(0, 0, 0, 0.35);\n}\n.aqm-history-tabbtn {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  padding: 7px 16px;\n  border: 0;\n  border-radius: 999px;\n  background: transparent;\n  color: var(--aqm-dim);\n  font: inherit;\n  font-size: 13px;\n  font-weight: 800;\n  cursor: pointer;\n}\n.aqm-history-tabbtn.is-on {\n  background: rgba(255, 255, 255, 0.1);\n  color: var(--aqm-text);\n}\n.aqm-history-tabcount {\n  min-width: 20px;\n  padding: 1px 6px;\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.08);\n  font-size: 11px;\n  text-align: center;\n}\n.aqm-history-stats {\n  display: grid;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n  gap: 8px;\n  margin: 14px 0;\n}\n.aqm-history-stat {\n  padding: 8px 10px;\n  border-radius: 12px;\n  background: var(--aqm-card);\n}\n.aqm-history-stat small {\n  display: block;\n  font-size: 10px;\n  font-weight: 800;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  color: var(--aqm-dim);\n}\n.aqm-history-stat strong {\n  display: block;\n  margin-top: 3px;\n  font-size: 14px;\n}\n.aqm-history-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));\n  gap: 12px;\n  max-height: 440px;\n  padding: 2px 6px 2px 2px;\n  overflow-y: auto;\n}\n.aqm-history-tile {\n  display: block;\n  color: inherit;\n  text-decoration: none;\n}\n.aqm-history-tile > img,\n.aqm-history-blank {\n  display: block;\n  width: 100%;\n  aspect-ratio: 5 / 7;\n  border-radius: 10px;\n  object-fit: cover;\n}\n.aqm-history-tile:hover > img {\n  filter: brightness(1.12);\n}\n.aqm-history-blank {\n  display: grid;\n  place-items: center;\n  background: rgba(255, 255, 255, 0.05);\n  font-size: 22px;\n  font-weight: 900;\n  font-style: italic;\n}\n.aqm-history-after {\n  margin: 6px 0 0;\n  font-size: 13px;\n  font-weight: 900;\n  text-align: center;\n}\n.aqm-history-pack {\n  margin: 2px 0 0;\n  overflow: hidden;\n  font-size: 11px;\n  font-weight: 700;\n  text-align: center;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--aqm-dim);\n}\n.aqm-history-pack.is-unknown {\n  opacity: 0.6;\n}\n.aqm-history-packs {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-bottom: 10px;\n}\n.aqm-history-packbtn {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  padding: 5px 12px;\n  border: 1px solid rgba(255, 255, 255, 0.1);\n  border-radius: 999px;\n  background: transparent;\n  color: var(--aqm-dim);\n  font: inherit;\n  font-size: 12px;\n  font-weight: 800;\n  cursor: pointer;\n}\n.aqm-history-packbtn.is-on {\n  border-color: transparent;\n  background: rgba(255, 255, 255, 0.1);\n  color: var(--aqm-text);\n}\n.aqm-history-empty {\n  margin: 14px 0 0;\n  font-size: 13px;\n  color: var(--aqm-dim);\n}\n@media (max-width: 640px) {\n  .aqm-rates {\n    grid-template-columns: 1fr;\n  }\n  .aqm-history-stats {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n  .aqm-history-grid {\n    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));\n  }\n}\n.aqm-root,\n.aqm-root * {\n  scrollbar-width: thin;\n  scrollbar-color: rgba(255, 255, 255, 0.18) transparent;\n}\n.aqm-root::-webkit-scrollbar,\n.aqm-root *::-webkit-scrollbar {\n  width: 8px;\n  height: 8px;\n}\n.aqm-root::-webkit-scrollbar-track,\n.aqm-root *::-webkit-scrollbar-track {\n  background: transparent;\n}\n.aqm-root::-webkit-scrollbar-thumb,\n.aqm-root *::-webkit-scrollbar-thumb {\n  border: 2px solid transparent;\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.18) padding-box;\n}\n.aqm-root::-webkit-scrollbar-thumb:hover,\n.aqm-root *::-webkit-scrollbar-thumb:hover {\n  background: rgba(255, 255, 255, 0.32) padding-box;\n}\n.aqm-root::-webkit-scrollbar-button,\n.aqm-root *::-webkit-scrollbar-button {\n  display: none;\n}\n@media (max-width: 640px) {\n  .aqm-pity-lines {\n    grid-template-columns: 1fr;\n    gap: 10px;\n  }\n}\n\n/* src/content/styles/15-booster-choice.css */\n.aqm-panel.aqm-panel-wide {\n  max-width: 1040px;\n}\n.aqm-goals {\n  margin-top: 4px;\n}\n.aqm-goal {\n  height: 38px;\n  padding: 0 16px;\n  font-size: 13px;\n  text-transform: none;\n  letter-spacing: 0;\n}\n.aqm-chip.aqm-goal.is-on {\n  border-color: transparent;\n  background: #2563eb;\n}\n.aqm-pick {\n  margin-top: 10px;\n}\n.aqm-pick:empty {\n  display: none;\n}\n.aqm-pick .aqm-chip {\n  height: 36px;\n  font-size: 13px;\n  text-transform: none;\n  letter-spacing: 0;\n}\n.aqm-pick .aqm-search {\n  width: min(520px, 100%);\n}\n.aqm-open-count {\n  margin-left: 2px;\n  padding: 1px 7px;\n  border-radius: 999px;\n  background: rgba(96, 165, 250, 0.25);\n  font-variant-numeric: tabular-nums;\n}\n.aqm-open-note {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  padding: 0 6px;\n  font-size: 12px;\n  font-weight: 700;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n  color: rgba(255, 255, 255, 0.6);\n}\n.aqm-suggest-box {\n  position: relative;\n  width: min(520px, 100%);\n}\n.aqm-suggest-box .aqm-search {\n  width: 100%;\n}\n.aqm-suggest {\n  position: absolute;\n  z-index: 5;\n  top: calc(100% + 6px);\n  left: 0;\n  right: 0;\n  max-height: 360px;\n  margin: 0;\n  padding: 6px;\n  overflow-y: auto;\n  list-style: none;\n  border: 1px solid var(--aqm-line);\n  border-radius: 14px;\n  background: var(--aqm-panel);\n  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);\n}\n.aqm-suggest[hidden] {\n  display: none;\n}\n.aqm-suggest-item {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 6px 10px 6px 6px;\n  border-radius: 10px;\n  cursor: pointer;\n}\n.aqm-suggest-item:hover,\n.aqm-suggest-item[aria-selected=true] {\n  background: rgba(255, 255, 255, 0.07);\n}\n.aqm-suggest-item > img,\n.aqm-suggest-blank {\n  flex-shrink: 0;\n  width: 34px;\n  height: 48px;\n  border-radius: 5px;\n  object-fit: cover;\n  background: rgba(255, 255, 255, 0.05);\n}\n.aqm-suggest-name {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  font-size: 14px;\n  font-weight: 700;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.aqm-suggest-name small {\n  display: block;\n  font-size: 11px;\n  font-weight: 600;\n  color: var(--aqm-dim);\n}\n.aqm-suggest-rarities {\n  display: flex;\n  flex-shrink: 0;\n  gap: 4px;\n}\n.aqm-sentence {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 8px 14px;\n  margin-top: 12px;\n}\n.aqm-sentence > p {\n  margin: 0;\n  font-size: 13px;\n  color: #93c5fd;\n}\n.aqm-new .aqm-chip {\n  height: 28px;\n  padding: 0 10px;\n  font-size: 11px;\n}\n.aqm-sorts {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 8px 10px;\n  margin-top: 14px;\n}\n.aqm-sorts .aqm-filter-name {\n  width: auto;\n  margin-right: 4px;\n}\n.aqm-sort {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 2px;\n  min-width: 170px;\n  padding: 9px 16px;\n  border: 1px solid var(--aqm-line);\n  border-radius: 14px;\n  background: rgba(255, 255, 255, 0.03);\n  color: #fff;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n}\n.aqm-sort strong {\n  font-size: 13px;\n  font-weight: 800;\n}\n.aqm-sort small {\n  font-size: 11px;\n  color: var(--aqm-muted);\n}\n.aqm-sort:hover {\n  background: rgba(255, 255, 255, 0.07);\n}\n.aqm-sort.is-on {\n  border-color: transparent;\n  background: #2563eb;\n}\n.aqm-sort.is-on small {\n  color: #dbeafe;\n}\n.aqm-verdict {\n  margin-top: 16px;\n  padding: 14px 18px;\n  border: 1px solid rgba(34, 197, 94, 0.55);\n  border-radius: 16px;\n  background: rgba(34, 197, 94, 0.06);\n  font-size: 14px;\n  line-height: 1.6;\n  color: #e4e4e7;\n}\n.aqm-verdict p {\n  margin: 0;\n}\n.aqm-verdict strong {\n  color: #fff;\n}\n.aqm-ranking {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  margin: 14px 0 0;\n  padding: 0;\n  list-style: none;\n}\n.aqm-rank {\n  display: grid;\n  grid-template-columns: 22px 44px minmax(0, 1fr) auto;\n  align-items: start;\n  gap: 4px 14px;\n  padding: 14px 18px;\n  border: 1px solid var(--aqm-line);\n  border-radius: 16px;\n  background: var(--aqm-card);\n}\n.aqm-rank.is-best {\n  border-color: rgba(34, 197, 94, 0.6);\n}\n.aqm-rank-n {\n  padding-top: 14px;\n  font-size: 13px;\n  font-weight: 800;\n  color: var(--aqm-muted);\n}\n.aqm-rank .aqm-pack {\n  width: 44px;\n  height: 62px;\n  border-radius: 7px;\n}\n.aqm-rank .aqm-pack-plain span {\n  font-size: 7px;\n}\n.aqm-rank-main {\n  min-width: 0;\n}\n.aqm-rank-main > p {\n  margin: 0;\n}\n.aqm-rank-title {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: 4px 10px;\n}\n.aqm-rank-title strong {\n  font-size: 16px;\n  font-weight: 900;\n  color: #fff;\n}\n.aqm-rank-price {\n  font-size: 12px;\n  color: var(--aqm-muted);\n}\n.aqm-badge {\n  padding: 2px 8px;\n  border-radius: 6px;\n  font-size: 10px;\n  font-weight: 900;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n.aqm-badge.is-best {\n  background: rgba(34, 197, 94, 0.16);\n  color: #86efac;\n}\n.aqm-badge.is-cheap {\n  background: rgba(96, 165, 250, 0.16);\n  color: #bfdbfe;\n}\n.aqm-rank-head {\n  margin-top: 4px !important;\n  font-size: 14px;\n  font-weight: 800;\n  color: #fff;\n}\n.aqm-rank-sub {\n  margin-top: 2px !important;\n  font-size: 12px;\n  color: var(--aqm-muted);\n}\n.aqm-rank-bar {\n  height: 5px;\n  margin-top: 10px;\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.07);\n  overflow: hidden;\n}\n.aqm-rank-bar > span {\n  display: block;\n  height: 100%;\n  border-radius: inherit;\n  background:\n    linear-gradient(\n      90deg,\n      #22c55e,\n      #eab308);\n}\n.aqm-rank-side {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-end;\n  gap: 2px;\n  padding-top: 10px;\n  text-align: right;\n  white-space: nowrap;\n}\n.aqm-rank-side strong {\n  font-size: 17px;\n  font-weight: 900;\n  color: #fff;\n}\n.aqm-rank-side small {\n  font-size: 12px;\n  color: var(--aqm-muted);\n}\n.aqm-rank-ref {\n  margin-top: 10px;\n  font-size: 12px;\n  color: #93c5fd;\n}\n.aqm-rank-more {\n  margin-top: 8px;\n}\n.aqm-rank-more > summary {\n  width: fit-content;\n  font-size: 12px;\n  font-weight: 700;\n  color: var(--aqm-muted);\n  cursor: pointer;\n}\n.aqm-rank-more > summary:hover {\n  color: #fff;\n}\n.aqm-rank-more[open] > summary {\n  margin-bottom: 8px;\n}\n.aqm-rank-more .aqm-label {\n  margin-top: 10px;\n}\n.aqm-rank-more .aqm-muted {\n  margin-top: 8px;\n}\n.aqm-odds-grid {\n  display: grid;\n  grid-template-columns: repeat(6, minmax(0, 1fr));\n  gap: 6px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n.aqm-odds-grid li {\n  padding: 6px 8px;\n  border-radius: 10px;\n  background: rgba(255, 255, 255, 0.035);\n}\n.aqm-odds-grid li > * {\n  display: block;\n}\n.aqm-odds-grid strong {\n  margin-top: 2px;\n  font-size: 13px;\n  color: #fff;\n  font-variant-numeric: tabular-nums;\n}\n.aqm-odds-grid small {\n  font-size: 10px;\n  color: var(--aqm-muted);\n}\n@media (max-width: 640px) {\n  .aqm-rank {\n    grid-template-columns: 36px minmax(0, 1fr);\n    padding: 12px;\n  }\n  .aqm-rank-n {\n    display: none;\n  }\n  .aqm-rank .aqm-pack {\n    width: 36px;\n    height: 51px;\n  }\n  .aqm-rank-side {\n    grid-column: 2;\n    flex-direction: row;\n    flex-wrap: wrap;\n    align-items: baseline;\n    gap: 2px 8px;\n    padding-top: 6px;\n  }\n  .aqm-rank-ref {\n    margin-top: 0;\n  }\n  .aqm-sort {\n    flex: 1 1 140px;\n    min-width: 0;\n  }\n  .aqm-odds-grid {\n    grid-template-columns: repeat(3, minmax(0, 1fr));\n  }\n}\n\n/* src/content/styles/16-settings.css */\n.aqm-settings-list {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n.aqm-switch {\n  display: flex;\n  align-items: flex-start;\n  gap: 10px;\n  padding: 12px 14px;\n  border-radius: 14px;\n  background: var(--aqm-card);\n  font-size: 14px;\n  line-height: 1.45;\n  color: #e4e4e7;\n  cursor: pointer;\n}\n.aqm-switch input {\n  margin-top: 3px;\n  accent-color: #2563eb;\n}\n.aqm-switch.is-off {\n  opacity: 0.5;\n  cursor: default;\n}\n.aqm-settings-groups {\n  columns: 2 340px;\n  column-gap: 14px;\n}\n.aqm-settings-group {\n  break-inside: avoid;\n  margin: 0 0 14px;\n  padding: 6px 0;\n  border: 1px solid var(--aqm-line);\n  border-radius: 18px;\n  background: var(--aqm-card);\n}\n.aqm-settings-title {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin: 0;\n  padding: 10px 16px 6px;\n  font-size: 11px;\n  font-weight: 800;\n  letter-spacing: 0.12em;\n  text-transform: uppercase;\n  color: #93c5fd;\n}\n.aqm-settings-title span {\n  font-size: 15px;\n  letter-spacing: 0;\n}\n.aqm-setting {\n  display: flex;\n  align-items: center;\n  gap: 14px;\n  padding: 10px 16px;\n  cursor: pointer;\n}\n.aqm-setting + .aqm-setting {\n  border-top: 1px solid var(--aqm-line);\n}\n.aqm-setting:hover {\n  background: rgba(255, 255, 255, 0.025);\n}\n.aqm-setting.is-off {\n  cursor: default;\n  opacity: 0.45;\n}\n.aqm-setting-text {\n  display: grid;\n  flex: 1;\n  gap: 2px;\n  min-width: 0;\n}\n.aqm-setting-text strong {\n  font-size: 14px;\n  color: var(--aqm-text);\n}\n.aqm-setting-text small {\n  font-size: 12px;\n  line-height: 1.35;\n  color: var(--aqm-dim);\n}\n.aqm-toggle {\n  position: relative;\n  flex: none;\n  width: 40px;\n  height: 24px;\n  margin: 0;\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.14);\n  appearance: none;\n  -webkit-appearance: none;\n  cursor: pointer;\n  transition: background 0.2s;\n}\n.aqm-toggle::before {\n  content: "";\n  position: absolute;\n  top: 3px;\n  left: 3px;\n  width: 18px;\n  height: 18px;\n  border-radius: 50%;\n  background: #fff;\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);\n  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n.aqm-toggle:checked {\n  background: #2563eb;\n}\n.aqm-toggle:checked::before {\n  transform: translateX(16px);\n}\n.aqm-toggle:focus-visible {\n  outline: 2px solid #93c5fd;\n  outline-offset: 2px;\n}\n.aqm-toggle:disabled {\n  cursor: default;\n}\n.aqm-settings-foot {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  margin-top: 4px;\n}\n.aqm-settings-foot p {\n  margin: 0;\n  font-size: 12px;\n  color: var(--aqm-dim);\n}\n.aqm-settings-actions {\n  display: flex;\n  gap: 8px;\n}\n\n/* src/content/styles/17-who-pulled.css */\n.aqm-pulled {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  margin: 12px 0 0;\n  padding: 0;\n  list-style: none;\n}\n.aqm-pull {\n  display: grid;\n  grid-template-columns: 40px minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 12px;\n  padding: 8px 14px 8px 8px;\n  border-radius: 14px;\n  background: var(--aqm-card);\n}\n.aqm-pull-card img {\n  display: block;\n  width: 40px;\n  height: 56px;\n  border-radius: 8px;\n  object-fit: cover;\n}\n.aqm-pull-main {\n  min-width: 0;\n}\n.aqm-pull-main > p {\n  margin: 0;\n}\n.aqm-pull-series {\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n.aqm-pull-who {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-end;\n  gap: 2px;\n  font-size: 13px;\n  font-weight: 700;\n  text-align: right;\n}\n.aqm-pull-player {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n.aqm-pull-player .aqm-avatar-sm {\n  width: 24px;\n  height: 24px;\n  border-radius: 7px;\n}\n.aqm-pull-who a {\n  color: #fff;\n  text-decoration: none;\n}\n.aqm-pull-who a:hover {\n  text-decoration: underline;\n}\n.aqm-pull-who small {\n  font-size: 11px;\n  font-weight: 400;\n  color: var(--aqm-muted);\n}\n\n/* src/content/styles/18-favorites.css */\n.aqm-star {\n  position: absolute;\n  top: 4px;\n  right: 6px;\n  z-index: 3;\n  display: grid;\n  place-items: center;\n  width: 24px;\n  height: 24px;\n  border-radius: 999px;\n  background: rgba(0, 0, 0, 0.55);\n  color: #a1a1aa;\n  font-size: 15px;\n  line-height: 1;\n  cursor: pointer;\n}\n.aqm-star:hover {\n  color: #fde047;\n}\n.aqm-star.is-on {\n  color: #facc15;\n}\n.aqm-fav-bar {\n  display: flex;\n  gap: 8px;\n  margin-bottom: 8px;\n  overflow-x: auto;\n  scrollbar-width: none;\n  -webkit-overflow-scrolling: touch;\n}\n.aqm-fav-bar::-webkit-scrollbar {\n  display: none;\n}\n.aqm-fav-bar .aqm-chip {\n  flex: 0 0 auto;\n  white-space: nowrap;\n  height: 32px;\n  text-transform: none;\n  letter-spacing: 0;\n  font-size: 13px;\n  color: #fde047;\n}\n.aqm-fav-bar .aqm-chip b {\n  margin-left: 4px;\n  color: #fff;\n}\n.aqm-fav-found {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  margin: 8px 0 0;\n  padding: 0;\n  list-style: none;\n}\n.aqm-fav-found:empty {\n  display: none;\n}\n.aqm-fav-found li {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 6px 10px 6px 6px;\n  border-radius: 12px;\n  background: var(--aqm-card);\n}\n.aqm-fav-found img {\n  width: 32px;\n  height: 44px;\n  border-radius: 6px;\n  object-fit: cover;\n}\n.aqm-fav-found li > span {\n  flex: 1;\n  min-width: 0;\n}\n.aqm-fav-found strong,\n.aqm-fav-found small {\n  display: block;\n}\n.aqm-fav-found small {\n  font-size: 12px;\n  color: var(--aqm-muted);\n}\n.aqm-filter-name.aqm-gap {\n  margin-left: 10px;\n}\n.aqm-fav-list {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  margin-top: 14px;\n}\n.aqm-fav-series {\n  padding: 14px;\n  border: 1px solid var(--aqm-line);\n  border-radius: 18px;\n  background: var(--aqm-card);\n}\n.aqm-fav-head {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 12px;\n}\n.aqm-fav-head > img {\n  width: 40px;\n  height: 56px;\n  border-radius: 8px;\n  object-fit: cover;\n}\n.aqm-fav-title {\n  flex: 1 1 200px;\n  min-width: 0;\n}\n.aqm-fav-title strong {\n  display: block;\n  font-size: 16px;\n  font-weight: 900;\n  color: #fff;\n}\n.aqm-fav-title small {\n  font-size: 12px;\n  color: var(--aqm-muted);\n}\n.aqm-fav-head .aqm-fav-unstar {\n  color: #facc15;\n  font-size: 16px;\n}\n.aqm-fav-series > .aqm-muted {\n  margin-top: 8px;\n}\n.aqm-fav-series > .aqm-muted:empty {\n  display: none;\n}\n.aqm-fav-cards {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));\n  gap: 10px;\n  margin: 12px 0 0;\n  padding: 0;\n  list-style: none;\n}\n.aqm-fav-card {\n  position: relative;\n  min-width: 0;\n}\n.aqm-fav-card img {\n  display: block;\n  width: 100%;\n  aspect-ratio: 63 / 88;\n  border-radius: 10px;\n  object-fit: cover;\n  filter: grayscale(0.85) brightness(0.6);\n}\n.aqm-fav-card.is-owned img {\n  filter: none;\n}\n.aqm-fav-card > p {\n  margin: 4px 0 0;\n}\n.aqm-fav-card .aqm-mini-name {\n  font-size: 12px;\n}\n.aqm-want {\n  position: absolute;\n  top: 6px;\n  right: 6px;\n  display: grid;\n  place-items: center;\n  width: 30px;\n  height: 30px;\n  padding: 0;\n  border: 0;\n  border-radius: 999px;\n  background: rgba(0, 0, 0, 0.6);\n  font-size: 15px;\n  filter: grayscale(1);\n  opacity: 0.75;\n  cursor: pointer;\n}\n.aqm-want.is-on {\n  background: rgba(37, 99, 235, 0.85);\n  filter: none;\n  opacity: 1;\n}\n.aqm-sort:disabled {\n  opacity: 0.55;\n  cursor: default;\n}\n@media (max-width: 640px) {\n  .aqm-pull {\n    grid-template-columns: 36px minmax(0, 1fr);\n  }\n  .aqm-pull-who {\n    grid-column: 2;\n    flex-direction: row;\n    align-items: baseline;\n    gap: 8px;\n  }\n  .aqm-fav-cards {\n    grid-template-columns: repeat(3, minmax(0, 1fr));\n  }\n}\n\n/* src/content/styles/19-album.css */\n.aqm-album {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 8px 10px;\n  margin-top: 12px;\n}\n.aqm-album-btn {\n  height: 34px;\n  padding: 0 14px;\n  border: 1px solid var(--aqm-line);\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.05);\n  color: #e4e4e7;\n  font: inherit;\n  font-size: 12px;\n  font-weight: 800;\n  cursor: pointer;\n}\n.aqm-album-btn:hover {\n  background: rgba(255, 255, 255, 0.1);\n}\n.aqm-album-btn.is-on {\n  border-color: rgba(250, 204, 21, 0.45);\n  color: #fde047;\n}\n.aqm-album-btn.is-main {\n  border-color: transparent;\n  background: #2563eb;\n  color: #fff;\n}\n.aqm-album-btn:disabled {\n  opacity: 0.55;\n  cursor: default;\n}\n.aqm-album-note {\n  font-size: 12px;\n  color: var(--aqm-muted);\n}\n\n/* src/content/styles/20-who-has.css */\n.aqm-who-gap {\n  margin-top: 18px;\n}\n.aqm-who-note {\n  margin: 0 0 6px;\n}\n.aqm-who-cards .aqm-mini {\n  cursor: pointer;\n}\n.aqm-who-cards .aqm-mini:hover,\n.aqm-who-cards .aqm-mini:focus-visible {\n  background: rgba(96, 165, 250, 0.14);\n  outline: none;\n}\n.aqm-who-back {\n  margin-bottom: 12px;\n  text-transform: none;\n  letter-spacing: 0;\n}\n.aqm-who-card {\n  display: flex;\n  gap: 16px;\n  padding: 14px;\n  border-radius: 18px;\n  background: var(--aqm-card);\n}\n.aqm-who-card img {\n  width: 92px;\n  border-radius: 10px;\n  aspect-ratio: 63 / 88;\n  object-fit: cover;\n}\n.aqm-who-card > div {\n  flex: 1;\n  min-width: 0;\n}\n.aqm-who-card p {\n  margin: 0 0 2px;\n}\n.aqm-pack-title {\n  font-size: 17px;\n  font-weight: 900;\n  color: #fff;\n}\n.aqm-who-stats {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 8px;\n  margin-top: 10px;\n}\n.aqm-metric {\n  padding: 8px 10px;\n  border-radius: 12px;\n  background: rgba(255, 255, 255, 0.04);\n}\n.aqm-metric small {\n  display: block;\n  font-size: 10px;\n  font-weight: 800;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  color: var(--aqm-dim);\n}\n.aqm-metric strong {\n  display: block;\n  margin-top: 2px;\n  font-size: 15px;\n  font-weight: 800;\n  color: #fff;\n}\n.aqm-owners {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));\n  gap: 6px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n.aqm-owner {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  min-height: 42px;\n  padding: 6px 12px;\n  border-radius: 12px;\n  background: var(--aqm-card);\n  font-size: 13px;\n}\n.aqm-avatar-sm {\n  width: 30px;\n  height: 30px;\n  border-radius: 9px;\n}\n.aqm-owner .aqm-avatar-sm + a,\n.aqm-owner .aqm-avatar-sm + span {\n  min-width: 0;\n}\n.aqm-owner-serial {\n  min-width: 52px;\n  font-weight: 800;\n  color: #fff;\n  font-variant-numeric: tabular-nums;\n}\n.aqm-owner a {\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  color: #e4e4e7;\n  font-weight: 700;\n  text-decoration: none;\n}\n.aqm-owner a:hover {\n  color: #fff;\n  text-decoration: underline;\n}\n.aqm-owner-right {\n  margin-left: auto;\n  font-weight: 700;\n  color: var(--aqm-muted);\n  white-space: nowrap;\n}\n@media (max-width: 640px) {\n  .aqm-who-card img {\n    width: 72px;\n  }\n  .aqm-who-stats {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n}\n\n/* src/content/styles/21-search-queue.css */\n.aqm-dock,\n.aqm-update {\n  position: fixed;\n  right: 16px;\n  bottom: 16px;\n  z-index: 2147482500;\n  width: min(360px, calc(100vw - 32px));\n}\n.aqm-dock {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n.aqm-queue,\n.aqm-update {\n  padding: 12px 14px;\n  border: 1px solid rgba(96, 165, 250, 0.35);\n  border-radius: 16px;\n  background: var(--aqm-panel);\n  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);\n  color: var(--aqm-text);\n  font-size: 13px;\n  animation: aqm-pop 0.16s ease-out;\n}\n.aqm-queue-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n}\n.aqm-queue-head strong {\n  font-size: 13px;\n  font-weight: 800;\n}\n.aqm-queue-btn {\n  height: 28px;\n  padding: 0 12px;\n  border: 1px solid var(--aqm-line);\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.06);\n  color: #fff;\n  font: inherit;\n  font-size: 12px;\n  font-weight: 800;\n  cursor: pointer;\n}\n.aqm-queue .aqm-bar {\n  margin-top: 8px;\n}\n.aqm-album .aqm-fav-wait {\n  flex-basis: 100%;\n  width: 100%;\n  margin: 4px 0 0;\n}\n.aqm-fav-wait {\n  margin: 0 0 12px;\n  padding: 10px 12px;\n  border: 1px solid rgba(217, 119, 6, 0.4);\n  border-radius: 12px;\n}\n.aqm-fav-wait .aqm-queue-head + .aqm-bar,\n.aqm-fav-wait p + .aqm-queue-head {\n  margin-top: 12px;\n}\n.aqm-fav-wait .aqm-queue-actions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  margin-top: 10px;\n  font-size: 12px;\n  color: var(--aqm-muted);\n}\n.aqm-steps {\n  display: flex;\n  height: 8px;\n  margin-top: 10px;\n  overflow: hidden;\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.08);\n}\n.aqm-steps > span {\n  transition: width 0.4s ease;\n}\n.aqm-steps .is-in,\n.aqm-steps-legend .is-in::before {\n  background: #22c55e;\n}\n.aqm-steps .is-sending,\n.aqm-steps-legend .is-sending::before {\n  background: #3b82f6;\n}\n.aqm-steps .is-waiting,\n.aqm-steps-legend .is-waiting::before {\n  background: #d97706;\n}\n.aqm-steps-legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 14px;\n  margin-top: 8px;\n  font-size: 12px;\n}\n.aqm-steps-legend span::before {\n  content: "";\n  display: inline-block;\n  width: 8px;\n  height: 8px;\n  margin-right: 6px;\n  border-radius: 50%;\n}\n.aqm-fav-wait .aqm-bar {\n  margin-top: 8px;\n}\n.aqm-fav-wait p {\n  margin: 8px 0 0;\n  font-size: 12px;\n}\n.aqm-want.is-wait {\n  background: rgba(217, 119, 6, 0.85);\n}\n.aqm-queue p,\n.aqm-update p {\n  margin: 8px 0 0;\n  font-size: 12px;\n  line-height: 1.45;\n  color: var(--aqm-muted);\n}\n@media (max-width: 640px) {\n  .aqm-dock,\n  .aqm-update {\n    right: 8px;\n    left: 8px;\n    bottom: 96px;\n    width: auto;\n  }\n}\n.aqm-fav-details {\n  text-transform: none;\n  letter-spacing: 0;\n  font-size: 12px;\n}\n.aqm-fav-list {\n  gap: 10px;\n}\n.aqm-fav-series .aqm-fav-cards {\n  margin-top: 14px;\n}\n\n/* src/content/styles/22-sell.css */\n.aqm-sales {\n  border-color: rgba(34, 197, 94, 0.35);\n}\n.aqm-sell-wait {\n  flex: none;\n  align-self: stretch;\n  margin: 0 0 12px;\n  color: var(--aqm-text);\n  font-size: 12px;\n  line-height: 1.45;\n}\n.aqm-sell-wait > p:first-child {\n  margin: 0;\n}\n.aqm-sell-waiting {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));\n  gap: 2px 16px;\n  max-height: 140px;\n  margin: 8px 0 0;\n  padding: 0 6px 0 0;\n  overflow-y: auto;\n  list-style: none;\n  font-size: 12px;\n  scrollbar-width: thin;\n  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;\n}\n.aqm-sell-waiting::-webkit-scrollbar {\n  width: 6px;\n}\n.aqm-sell-waiting::-webkit-scrollbar-track {\n  background: transparent;\n}\n.aqm-sell-waiting::-webkit-scrollbar-thumb {\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.2);\n}\n.aqm-sell-waiting::-webkit-scrollbar-thumb:hover {\n  background: rgba(255, 255, 255, 0.35);\n}\n.aqm-sell-waiting::-webkit-scrollbar-button {\n  display: none;\n}\n.aqm-sell-last {\n  margin: 8px 0 0;\n  font-size: 11px;\n  color: var(--aqm-muted);\n}\n.aqm-sell-waiting li {\n  display: flex;\n  justify-content: space-between;\n  gap: 8px;\n  min-width: 0;\n}\n.aqm-sell-waiting li > span:first-child {\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n\n/* src/content/styles/23-booster-wheel.css */\n[data-aqm-hidden] {\n  position: absolute !important;\n  visibility: hidden !important;\n  pointer-events: none !important;\n}\n[data-aqm-veiled] {\n  visibility: hidden;\n}\n.aqm-piles {\n  position: relative;\n  flex: none;\n  align-self: auto;\n  max-width: none;\n  width: 100%;\n  padding: 28px 0 8px;\n  overflow: hidden;\n  overflow-x: clip;\n  overflow-y: visible;\n}\n@property --aqm-glow { syntax: "<color>"; inherits: true; initial-value: rgb(37 99 235 / 0.38); }\n.aqm-wheel {\n  position: relative;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  isolation: isolate;\n  transition: --aqm-glow 0.6s ease;\n}\n.aqm-wheel::before {\n  content: "";\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  z-index: -1;\n  width: min(560px, 100%);\n  aspect-ratio: 1;\n  background:\n    radial-gradient(\n      closest-side,\n      var(--aqm-glow, rgb(37 99 235 / 0.38)),\n      transparent);\n  transform: translate(-50%, -50%);\n  pointer-events: none;\n}\n.aqm-wheel-track {\n  display: grid;\n}\n.aqm-wheel-controls {\n  display: flex;\n  justify-content: center;\n  margin-top: 4px;\n}\n.aqm-pile {\n  display: flex;\n  grid-area: 1 / 1;\n  flex-direction: column;\n  align-items: center;\n  gap: 12px;\n  justify-self: center;\n  transition:\n    transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1),\n    opacity 0.4s,\n    filter 0.4s;\n}\n.aqm-pile:not(.is-front) {\n  z-index: 0;\n  opacity: 0.4;\n  cursor: pointer;\n}\n.aqm-pile.is-front {\n  z-index: 1;\n}\n.aqm-pile.is-away {\n  opacity: 0;\n  pointer-events: none;\n}\n.aqm-pile:not(.is-front) .aqm-pile-art {\n  pointer-events: none;\n}\n.aqm-pile-art [class*=__packPose] {\n  transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n.aqm-pile-art .aqm-pose-follow {\n  transition: transform 0.15s ease-out;\n}\n.aqm-pile.is-front [data-aqm-float] {\n  animation: aqm-pack-float 2.35s ease-in-out infinite alternate;\n}\n@keyframes aqm-pack-float {\n  from {\n    transform: translate3d(0, 0, 0);\n  }\n  to {\n    transform: translate3d(0, -16px, 0);\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .aqm-pile.is-front [data-aqm-float] {\n    animation: none;\n  }\n}\n.aqm-wheel-arrow {\n  position: absolute;\n  top: 45%;\n  z-index: 3;\n  width: 44px;\n  height: 44px;\n  border: 1px solid var(--aqm-line);\n  border-radius: 50%;\n  background: rgba(15, 23, 42, 0.85);\n  color: #fff;\n  font: inherit;\n  font-size: 26px;\n  line-height: 1;\n  cursor: pointer;\n}\n.aqm-wheel-arrow:hover {\n  border-color: #3b82f6;\n  background: rgba(37, 99, 235, 0.35);\n}\n.aqm-wheel-arrow.is-prev {\n  left: 8px;\n}\n.aqm-wheel-arrow.is-next {\n  right: 8px;\n}\n.aqm-wheel-dots {\n  display: flex;\n  justify-content: center;\n  gap: 8px;\n  margin-top: 10px;\n}\n.aqm-wheel-dot {\n  width: 8px;\n  height: 8px;\n  padding: 0;\n  border: 0;\n  border-radius: 50%;\n  background: rgba(255, 255, 255, 0.25);\n  cursor: pointer;\n}\n.aqm-wheel-dot.is-on {\n  width: 22px;\n  border-radius: 999px;\n  background: #3b82f6;\n}\n.aqm-piles.is-still .aqm-pile {\n  transition: none;\n}\n@media (max-width: 640px) {\n  .aqm-wheel-controls > * {\n    flex-direction: column;\n  }\n  .aqm-wheel-arrow {\n    width: 36px;\n    height: 36px;\n    font-size: 22px;\n  }\n}\n.aqm-queue-btn.is-main {\n  border-color: #2563eb;\n  background: #2563eb;\n}\n.aqm-queue-btn:disabled {\n  opacity: 0.5;\n  cursor: default;\n}\n.aqm-scan-list {\n  display: grid;\n  gap: 4px;\n  margin: 10px 0 0;\n  padding: 0;\n  list-style: none;\n  font-size: 13px;\n}\n\n/* src/content/styles/24-card-listings.css */\n.aqm-listings {\n  margin-top: 16px;\n  padding: 16px 18px;\n  border: 1px solid var(--aqm-line);\n  border-radius: 18px;\n  background: rgba(255, 255, 255, 0.025);\n}\n.aqm-listings-head {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 4px 12px;\n  margin-bottom: 10px;\n}\n.aqm-listings-head .aqm-label {\n  margin: 0;\n}\n.aqm-listings .aqm-owners {\n  display: grid;\n  grid-template-columns: 1fr;\n  gap: 6px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n.aqm-buy-cell {\n  display: inline-flex;\n  align-items: center;\n  gap: 12px;\n}\n.aqm-buy {\n  height: 30px;\n}\n.aqm-buy-refused {\n  margin: 8px 0 0;\n  color: #fca5a5;\n}\n\n/* src/content/styles/25-collection.css */\n.aqm-sort-progress.is-on {\n  border-color: #3b82f6;\n  background: rgba(59, 130, 246, 0.2);\n  color: #fff;\n}\n[data-aqm-owned-card],\n[data-aqm-locked-card] {\n  display: none !important;\n}\n[data-aqm-sale=on] {\n  display: inline-block !important;\n  margin-right: 8px !important;\n  vertical-align: middle;\n}\n.aqm-sale {\n  display: inline-block;\n  flex: none;\n  padding: 1px 7px;\n  border: 1px solid rgba(59, 130, 246, 0.6);\n  border-radius: 999px;\n  background: rgba(37, 99, 235, 0.22);\n  color: #93c5fd;\n  font-size: 9px;\n  font-weight: 800;\n  letter-spacing: 0.06em;\n  line-height: 1.6;\n  white-space: nowrap;\n  text-transform: uppercase;\n  vertical-align: middle;\n  pointer-events: none;\n}\n[data-aqm-pill-off] {\n  opacity: 0 !important;\n}\n[data-aqm-unpicked] {\n  background: transparent !important;\n  box-shadow: none !important;\n  color: var(--aqm-plain-color) !important;\n}\n.aqm-missing-summary {\n  display: flex;\n  flex: 1 0 100%;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px 8px;\n  width: 100%;\n  margin: 12px 0 4px;\n  color: #a1a1aa;\n  font-size: 12px;\n  font-weight: 600;\n}\n.aqm-missing-summary .aqm-label {\n  margin-right: 4px;\n}\n.aqm-missing-summary[hidden] {\n  display: none;\n}\n.aqm-missing-extra-note {\n  margin: 32px 0 0;\n  color: #93c5fd;\n  font-size: 13px;\n  font-weight: 700;\n}\n.aqm-missing-extra > ul {\n  margin-top: 16px;\n  padding: 0;\n  list-style: none;\n}\n.aqm-missing-plain {\n  display: block;\n  color: #fff;\n  font-size: 12px;\n  font-weight: 700;\n}\n.aqm-missing-plain img {\n  display: block;\n  width: 100%;\n  aspect-ratio: 63 / 88;\n  border-radius: 1rem;\n  object-fit: cover;\n}\n.aqm-missing-count {\n  display: inline-flex;\n  align-items: baseline;\n  gap: 5px;\n  padding: 4px 10px;\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.04);\n  white-space: nowrap;\n}\n.aqm-missing-count strong {\n  color: #fff;\n  font-weight: 800;\n}\n.aqm-missing-count.is-total {\n  background: rgba(59, 130, 246, 0.15);\n  color: #bfdbfe;\n}\n.aqm-missing-tab.is-on {\n  border-radius: var(--aqm-pill-radius);\n  background: var(--aqm-pill-bg) !important;\n  box-shadow: var(--aqm-pill-shadow);\n  color: var(--aqm-picked-color) !important;\n}\n.aqm-recycle-bar {\n  display: flex;\n  justify-content: flex-end;\n  margin: 0 0 8px;\n}\n.aqm-recycle-bar[hidden] {\n  display: none;\n}\n.aqm-recycle-spares.is-confirm {\n  background: #f59e0b !important;\n  color: #111 !important;\n}\n.aqm-recycle-note {\n  align-self: center;\n  color: #86efac;\n  font-size: 13px;\n  font-weight: 700;\n  white-space: nowrap;\n}\n.aqm-recycle-spares:disabled {\n  opacity: 0.75;\n  cursor: default;\n}\n\n/* src/content/styles/26-players.css */\n.aqm-users-code {\n  display: flex;\n  gap: 8px;\n}\n.aqm-users-stats {\n  margin-top: 4px;\n}\n.aqm-users {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  margin: 12px 0 0;\n  padding: 0;\n  list-style: none;\n}\n.aqm-user {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 8px 14px 8px 8px;\n  border-radius: 14px;\n  background: var(--aqm-card);\n  font-size: 13px;\n}\n.aqm-user .aqm-user-revoke {\n  flex: none;\n  padding: 6px 12px;\n  font-size: 12px;\n}\n.aqm-tag.aqm-revoked {\n  background: rgba(239, 68, 68, 0.18);\n  color: #fca5a5;\n}\n.aqm-user .aqm-avatar {\n  width: 32px;\n  height: 32px;\n}\n.aqm-user .aqm-name {\n  flex: 1;\n  font-size: 13px;\n}\n.aqm-kind-userscript {\n  background: rgba(34, 197, 94, 0.16);\n  color: #86efac;\n}\n.aqm-user-kinds {\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  gap: 6px;\n}\n.aqm-online {\n  background: rgba(37, 99, 235, 0.2);\n  color: #93c5fd;\n}\n.aqm-user-seen {\n  min-width: 90px;\n  text-align: right;\n  color: var(--aqm-muted);\n}\n.aqm-device-wait {\n  margin-top: 10px;\n  padding: 12px 14px;\n  border-radius: 14px;\n  background: rgba(37, 99, 235, 0.12);\n  border: 1px solid rgba(96, 165, 250, 0.3);\n}\n.aqm-device-wait p {\n  margin: 0;\n}\n.aqm-device-wait p + p {\n  margin-top: 6px;\n}\n.aqm-device-wait strong,\n.aqm-device-code {\n  font:\n    800 15px ui-monospace,\n    "Cascadia Mono",\n    Consolas,\n    monospace;\n  letter-spacing: 0.08em;\n  color: #fff;\n}\n.aqm-update {\n  top: 16px;\n  bottom: auto;\n}\n@media (max-width: 640px) {\n  .aqm-update {\n    top: 8px;\n    bottom: auto;\n  }\n}\n\n/* src/content/styles/27-market.css */\n.aqm-unlist {\n  margin-left: 8px;\n}\n.aqm-panel.is-ask {\n  max-width: 520px;\n}\n.aqm-ask-text {\n  margin: 0 0 12px;\n  color: var(--aqm-text);\n  font-size: 14px;\n  line-height: 1.5;\n}\n.aqm-ask-actions {\n  display: flex;\n  justify-content: flex-end;\n  gap: 8px;\n  margin-top: 18px;\n}\n.aqm-ask-actions .aqm-queue-btn {\n  height: 36px;\n  padding: 0 18px;\n  font-weight: 700;\n}\n[data-aqm-bought] {\n  display: none !important;\n}\n.aqm-market-fav.is-on {\n  background: #1e3a5f !important;\n  color: #fff !important;\n}\n.aqm-market-sort {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px;\n  margin-top: 8px;\n  color: #a1a1aa;\n  font-size: 11px;\n  font-weight: 700;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n.aqm-market-sort-button {\n  padding: 8px 16px;\n  border: 0;\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.04);\n  color: #a1a1aa;\n  font: inherit;\n  white-space: nowrap;\n  cursor: pointer;\n}\n.aqm-market-sort-button:hover {\n  background: rgba(255, 255, 255, 0.07);\n  color: #fff;\n}\n.aqm-market-sort-button.is-on {\n  background: rgba(59, 130, 246, 0.25);\n  color: #fff;\n}\n.aqm-market-sale {\n  margin-left: 6px;\n  color: #86efac;\n  font-weight: 600;\n  white-space: nowrap;\n}\n[data-aqm-sentinel-box] {\n  position: relative;\n}\n[data-aqm-sentinel-up] {\n  position: absolute !important;\n  top: 0;\n  left: 0;\n  width: 1px;\n  height: 1px;\n  pointer-events: none;\n}\n[data-aqm-unfav] {\n  display: none !important;\n}\n.aqm-trade-filter.is-on {\n  background: #1e3a5f !important;\n  color: #fff !important;\n}\n.aqm-trade-filter.is-on.is-off {\n  opacity: 0.55;\n}\n[data-aqm-tradehide] {\n  display: none !important;\n}\n.aqm-auctions-head {\n  margin-top: 18px;\n}\n.aqm-auction-cell {\n  display: inline-flex;\n  flex-direction: column;\n  align-items: flex-end;\n  gap: 2px;\n}\n.aqm-owner a.aqm-buy {\n  display: inline-flex;\n  align-items: center;\n  overflow: visible;\n  color: #fff;\n  font-weight: 800;\n  text-decoration: none;\n}\n\n/* src/content/styles/28-progress.css */\n[data-aqm-stats-title] {\n  position: relative;\n}\n.aqm-stats-open {\n  position: absolute !important;\n  top: 50% !important;\n  left: 100% !important;\n  margin: 0 0 0 20px !important;\n  transform: translateY(-50%) !important;\n  white-space: nowrap;\n  text-shadow: none;\n  background-clip: border-box;\n  -webkit-background-clip: border-box;\n}\n.aqm-stats-open.is-below {\n  position: static !important;\n  display: flex;\n  width: fit-content;\n  margin: 12px 0 0 !important;\n  transform: none !important;\n}\n.aqm-stats-open.is-in-row {\n  position: static !important;\n  margin: 0 !important;\n  transform: none !important;\n}\n.aqm-stats-open.is-early {\n  position: absolute !important;\n  top: var(--aqm-y) !important;\n  left: var(--aqm-x) !important;\n  margin: 0 !important;\n  z-index: 5;\n}\n.aqm-stats-open.is-early.is-below {\n  transform: none !important;\n  width: fit-content;\n}\n.aqm-stats-ico {\n  flex-shrink: 0;\n  width: 16px;\n  height: 16px;\n}\n.aqm-progress {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n}\n.aqm-progress-hero {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  padding: 16px;\n  border: 1px solid var(--aqm-line);\n  border-radius: 14px;\n  background: var(--aqm-card);\n}\n.aqm-progress-pct {\n  font-size: 40px;\n  font-weight: 900;\n  line-height: 1.1;\n  color: #fff;\n  font-variant-numeric: tabular-nums;\n}\n.aqm-bar.aqm-bar-big {\n  height: 8px;\n  margin-top: 8px;\n}\n.aqm-progress-tiles {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));\n  gap: 10px;\n}\n.aqm-progress-tile {\n  padding: 12px 14px;\n  border: 1px solid var(--aqm-line);\n  border-radius: 12px;\n  background: var(--aqm-card);\n}\n.aqm-progress-tile .aqm-label {\n  margin: 0 0 4px;\n}\n.aqm-progress-tile strong {\n  display: block;\n  font-size: 24px;\n  font-weight: 900;\n  color: #fff;\n  font-variant-numeric: tabular-nums;\n}\n.aqm-progress-tile small {\n  font-size: 11px;\n  color: var(--aqm-muted);\n}\n.aqm-progress-h {\n  margin: 6px 0 0;\n  font-size: 14px;\n  font-weight: 900;\n  color: #fff;\n}\n.aqm-progress-rarities {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n.aqm-progress-rarity {\n  display: grid;\n  grid-template-columns: 130px 1fr auto;\n  align-items: center;\n  gap: 12px;\n  padding: 8px 12px;\n  border-radius: 10px;\n  background: var(--aqm-card);\n}\n.aqm-progress-rname {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n}\n.aqm-progress-rname small,\n.aqm-progress-rbar small,\n.aqm-progress-copies {\n  font-size: 11px;\n  color: var(--aqm-muted);\n}\n.aqm-progress-rbar p {\n  margin: 0;\n  font-variant-numeric: tabular-nums;\n}\n.aqm-progress-rbar strong {\n  color: #fff;\n  font-weight: 900;\n}\n.aqm-progress-copies {\n  min-width: 64px;\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n}\n.aqm-bar-N > span {\n  background: #d4d4d8;\n}\n.aqm-bar-R > span {\n  background: #60a5fa;\n}\n.aqm-bar-SR > span {\n  background: #a78bfa;\n}\n.aqm-bar-SSR > span {\n  background: #facc15;\n}\n.aqm-bar-UR > span {\n  background: #f472b6;\n}\n.aqm-bar-SEC > span {\n  background:\n    linear-gradient(\n      90deg,\n      #c4b5fd,\n      #e2e8f0);\n}\n.aqm-days {\n  display: grid;\n  grid-template-columns: repeat(14, 1fr);\n  gap: 2px;\n  height: 150px;\n  padding: 12px 8px 8px;\n  border: 1px solid var(--aqm-line);\n  border-radius: 12px;\n  background: var(--aqm-card);\n}\n.aqm-day {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  min-width: 0;\n  border-radius: 6px;\n  outline: none;\n}\n.aqm-day:hover,\n.aqm-day:focus-visible {\n  background: rgba(255, 255, 255, 0.05);\n}\n.aqm-day-val {\n  height: 16px;\n  font-size: 10px;\n  font-weight: 800;\n  color: #e4e4e7;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n.aqm-day-col {\n  display: flex;\n  align-items: flex-end;\n  justify-content: center;\n  flex: 1;\n  width: 100%;\n  border-bottom: 1px solid rgba(255, 255, 255, 0.12);\n}\n.aqm-day-fill {\n  display: block;\n  width: min(18px, 70%);\n  border-radius: 4px 4px 0 0;\n  background: #3b82f6;\n}\n.aqm-day.is-today .aqm-day-fill {\n  background: #60a5fa;\n}\n.aqm-day.is-empty .aqm-day-col {\n  border-bottom-style: dashed;\n}\n.aqm-day-name {\n  margin-top: 4px;\n  font-size: 10px;\n  color: var(--aqm-dim);\n}\n.aqm-day.is-today .aqm-day-name {\n  color: #fff;\n  font-weight: 800;\n}\n@media (max-width: 640px) {\n  .aqm-progress-pct {\n    font-size: 32px;\n  }\n  .aqm-progress-rarity {\n    grid-template-columns: 1fr auto;\n  }\n  .aqm-progress-rbar {\n    grid-column: 1 / -1;\n    grid-row: 2;\n  }\n  .aqm-days {\n    height: 130px;\n    padding: 10px 4px 6px;\n  }\n  .aqm-day-val {\n    font-size: 9px;\n  }\n}\n.aqm-board-refresh {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px 12px;\n  margin: -4px 0 10px;\n  font-size: 12px;\n}\n.aqm-board-refresh:empty {\n  display: none;\n}\n.aqm-board-refresh .aqm-chip:disabled {\n  opacity: 0.5;\n  cursor: default;\n}\n\n/* contenu.css */\n';
    document.head.appendChild(style);
    (() => {
      const TOUR = [
        {
          id: "bienvenue",
          title: "Bienvenue dans Aquaman",
          text: "Aquaman ajoute quelques outils au jeu. Cette visite d’une minute te montre où les trouver ; tu peux la quitter à tout moment."
        },
        {
          id: "plus",
          title: "L’onglet Plus",
          text: "Les pages d’Aquaman sont rangées ici, tout à droite de la barre du jeu.",
          find: "plus"
        },
        {
          id: "classement",
          title: "Classement des amis",
          text: "Sur la page Classement, « Amis » à côté de « Tous » : toi et tes amis, avec les points du jeu. Touche un nom pour ouvrir son profil.",
          find: "board"
        },
        {
          id: "boosters",
          title: "Quel booster ouvrir ?",
          text: "Choisis ce que tu cherches (des cartes nouvelles, une rareté, un personnage, une série ou la valeur) : les boosters sont classés par taux de drop ou par prix, avec « ≈ 11 boosters à ouvrir en moyenne », le prix moyen en Perles et le meilleur et le pire taux en haut.",
          find: "menu-0"
        },
        {
          id: "qui",
          title: "Qui a cette carte ?",
          text: "Cherche n’importe quel personnage et choisis sa carte : combien de joueurs l’ont, la liste des détenteurs pour les cartes à tirage limité, ceux qui la vendent au marché, ceux de tes amis qui l’ont, et ceux qui l’ont tirée récemment.",
          find: "menu-1"
        },
        {
          id: "favoris",
          title: "Séries favorites",
          text: "Ajoute des séries à tes favoris (ici, ou avec l’étoile ☆ sur les séries de la page Collection) : elles sont les mêmes sur tous tes appareils. Tu vois leurs personnages, ceux qui te manquent, et un bouton met d’un coup toutes les cartes manquantes dans ta liste de recherches du jeu.",
          find: "menu-2"
        },
        {
          id: "etoiles",
          title: "L’étoile des séries",
          text: "Sur la page Collection, l’étoile ☆ ajoute une série à tes favoris ; le bouton « ★ Favoris » au-dessus ouvre la liste de leurs personnages. Quand une série est ouverte, son cadre « Album de la série » a aussi « Ajouter aux favoris » et « Rechercher les manquantes ».",
          page: "/jeu/collection",
          target: ".aqm-fav-bar, .aqm-star"
        },
        {
          id: "progression",
          title: "Ta progression",
          text: "À côté de « Ta collection », « Ma progression » montre le pourcentage du jeu que tu as, tes cartes par rareté, tes séries complètes, les cartes qui te manquent et les cartes gagnées chaque jour.",
          page: "/jeu/collection",
          target: ".aqm-stats-open"
        },
        {
          id: "tirages",
          title: "Les beaux tirages",
          text: "Sur l’accueil, les cartes des beaux tirages des joueurs sont affichées en plus grand.",
          page: "/jeu",
          target: ".aqm-pulls"
        },
        {
          id: "pity",
          title: "La garantie anti-malchance",
          text: "Sous le minuteur du booster offert : combien de boosters il te reste avant la SSR et l’UR garanties. Aquaman compte chaque booster que tu ouvres, et partage ce compte entre tes appareils (PC, téléphone, extension ou script) : partout le même chiffre. Tant qu’il n’a pas vu sortir de SSR ou d’UR, il affiche « au plus ».",
          page: "/jeu",
          target: ".aqm-pity"
        },
        {
          id: "echanges",
          title: "Les échanges",
          text: "Dans chaque proposition, dans le jeu comme en MP, chaque carte porte une pastille verte si tu as déjà la carte (×2, ×3… si tu en as plusieurs) et rouge si tu ne l’as pas.",
          page: "/jeu/echanges",
          target: '.aqm-trade-tile, a[data-tour="nav-/jeu/echanges"]'
        },
        {
          id: "series",
          title: "Les séries de ta collection",
          text: {
            hover: "Survole la bande des séries et tourne la molette de la souris, ou attrape-la avec un clic et fais-la glisser : elle défile de gauche à droite. Un simple clic ouvre toujours la série.",
            touch: "La bande des séries défile du doigt. Sur ordinateur, la molette ou un clic glissé la font aussi défiler."
          },
          page: "/jeu/collection",
          find: "series"
        },
        {
          id: "vitrine",
          title: "Ma vitrine",
          text: {
            hover: "Ouvre « Ma vitrine » et fais glisser une carte sur une autre case pour la déplacer. Pour retirer une carte, utilise la croix rouge en haut à droite de la carte.",
            touch: "Ouvre « Ma vitrine », garde le doigt appuyé sur une carte, puis fais-la glisser sur une autre case pour la déplacer. Pour retirer une carte, touche la croix rouge en haut à droite de la carte."
          },
          page: "/jeu/collection",
          find: "vitrine"
        },
        {
          id: "fin",
          title: "C’est tout !",
          text: "Tu peux relancer cette visite quand tu veux depuis Plus → Visite guidée. Bon jeu !"
        }
      ];
      const CHANGES = [
        {
          version: "1.7.0",
          items: [
            ["Marché : dans « Tes cartes à vendre », les cartes que tu vends déjà (au marché ou en enchère) sont marquées « Déjà en vente », et « Trier par » les range selon un ou plusieurs critères : les plus recherchées, les plus ou moins possédées, la valeur estimée ou le nom. Se règle dans Plus › Réglages. Proposé par volcanofr."],
            ["Recycler des cartes : en mode « Mes doublons », plus aucune carte n’est cochée sans que tu la voies. Le jeu cochait d’office les doublons pas encore affichés (la liste se charge 48 par 48) : Aquaman charge toute la liste à l’ouverture et la décoche, puis « Tout sélectionner » agit sur toute la liste."],
            ["Garantie anti-malchance : comme dans le jeu, seuls les boosters classiques (gratuits ou de la boutique) et les packs à thème à 250 Perles comptent pour la SSR et l’UR garanties. Les packs spéciaux (Légendaire, Halloween…) ne les font plus avancer. Aquaman retient maintenant le pack de chaque booster ouvert : le compte devient exact au fil des ouvertures."],
            ["Collection : avec le filtre « Manquantes », le compte des cartes qui te manquent par rareté s’affiche sous les onglets (« 70 N · 293 R · … · 948 au total »), sans avoir à faire défiler tout l’album.", "series"],
            ["Collection : dans « Album complet » filtré par rareté, le jeu ne renvoie pas toutes les cartes et en oublie des manquantes. Avec « Manquantes », Aquaman ajoute à la suite celles que le jeu n’affiche pas, avec le même aspect (lien vers la carte compris).", "series"],
            ["Ma progression : la colonne « ex. » compte un exemplaire par carte, les doublons ne comptent plus. Les cartes gagnées en achetant ou en échangeant juste après une ouverture de boosters sont comptées dans la journée, au lieu d’attendre le relevé suivant.", "progression"],
            ["Classement : « Ranger par » sous « Tous / Amis ». Entre amis : par points, par cartes ou par séries complètes (les albums dont le badge est récupéré). Pour « Tous » : par points (le classement du jeu) ou par cartes (le top 100 du jeu rangé par nombre de cartes). « Ma place » suit le tri choisi.", "classement"],
            ["Classement des amis : le cadre « Ma place » en haut de la page montre ta place parmi tes amis et l’ami à dépasser (« Plus que 10 points pour dépasser… »), et « Voir ma ligne » mène à ta ligne.", "classement"]
          ]
        },
        {
          version: "1.6.0",
          items: [
            ["Aquaman se charge plus vite sur les pages du jeu : son code et ses styles arrivent en 2 fichiers au lieu de 72."],
            ["Mises à jour plus légères : l’extension compte 17 fichiers au lieu d’une centaine, le bouton « Mettre à jour » a moins à télécharger et à remplacer."],
            ["Collection : le filtre « Manquantes » reste actif quand tu reviens sur la collection (après un achat depuis la page d’une carte, par exemple).", "series"],
            ["Collection : « Masquer cartes verrouillées », à côté des filtres des séries, cache les cartes dont tous tes exemplaires sont verrouillés.", "series"],
            ["Classement : le jeu a maintenant son propre classement. Sur sa page, « Amis » à côté de « Tous » montre toi et tes amis avec les points du jeu (calculés depuis leur collection pour ceux hors du top 100), avec le style du classement du jeu : un podium pour les 3 premiers et leur plus belle carte, puis les lignes de chacun. Le classement d’Aquaman quitte le menu Plus.", "classement"],
            ["L’onglet Plus passe tout à droite de la barre du jeu, après Classement.", "plus"],
            ["Garantie anti-malchance : une SSR, UR ou SEC tirée sans Aquaman (sur un autre appareil sans lui) mais vue dans les Beaux tirages du jeu remet son compteur à zéro."]
          ]
        },
        {
          version: "1.5.0",
          items: [
            ["Collection : dans « Album de la série », « 🔒 Verrouiller les uniques » verrouille les cartes de la série dont tu n’as qu’un exemplaire, puis celles qui descendent à un seul exemplaire (vente, échange, recyclage). Un 2e clic arrête la surveillance."],
            ["Ma progression : les cartes gagnées chaque jour et le compte par rareté sont les mêmes sur tous tes appareils (réglage « Partage entre mes appareils › Ma progression »).", "progression"],
            ["Boosters : après l’ouverture d’un ou plusieurs boosters, un bouton « ♻ Recycler les doublons » dans la fenêtre des cartes recycle en Perles les doublons des cartes tirées. Un 2e clic confirme ; le plus petit numéro de chaque carte est gardé, les cartes en vente ou verrouillées ne sont pas touchées."],
            ["Réglages : « Recyclage automatique » (désactivé au départ) recycle tout seuls, sans clic, les doublons N, R et SR des cartes tirées à la fin de chaque ouverture ; les SSR, UR et SEC restent au bouton."],
            ["Marché : l’écran noir après l’achat d’une carte depuis sa page (« Son prix au marché ») est corrigé. « Masquer ce que je viens d’acheter » et le filtre « ★ Favoris » ne touchent plus que la liste du marché, jamais le reste d’une page."],
            ["Téléphone : sur la page Collection, les filtres des séries restent sur une ligne qui défile (ils ne débordent plus sur les séries), et « Ma progression » se range avec les boutons du jeu."]
          ]
        },
        {
          version: "1.4.9",
          items: [
            ["Collection : un bouton « Ma progression » à côté de « Ta collection » (aussi dans Plus) : le pourcentage du jeu que tu as, tes cartes par rareté, tes séries complètes, les cartes qui te manquent et les cartes uniques gagnées chaque jour sur les 14 derniers jours.", "progression"],
            ["Collection : le bouton « Masquer séries avec badge » cache les séries dont tu as déjà réclamé l’album.", "series"],
            ["Classement : les joueurs déjà lus gardent leur place et leurs chiffres ; seuls ceux lus il y a plus d’1 h (et toi) sont relus, sans tout retélécharger. « Actualiser » relit tout le monde.", "classement"],
            ["Classement : l’onglet « Perles » est retiré. Aquaman n’envoie plus ton stock de Perles, et celui déjà partagé est effacé du relais."],
            ["Collections : Aquaman vérifie que chaque vitrine lue est bien celle du joueur demandé, et oublie tout ce qu’il a lu dès que tu changes de compte : la collection d’un autre joueur n’est jamais prise pour la tienne."]
          ]
        },
        {
          version: "1.4.8",
          items: [
            ["Classement : « Global » compte aussi tes amis."],
            ["iPhone et iPad : « Installer » dans le cadre d’une nouvelle version affiche les étapes pour mettre Aquaman à jour avec Userscripts."],
            ["Garantie anti-malchance : un booster signalé deux fois n’est plus compté deux fois (un écart de 61 boosters pouvait apparaître pour une garantie de 60)."]
          ]
        },
        {
          version: "1.4.7",
          items: [["Historique des tirages : le pack d’où vient chaque SSR, UR et SEC, sous sa carte, et un filtre par pack. Pour les cartes tirées avant cette version, le pack est déduit de la carte : Halloween pour une carte Halloween, Classique pour les autres."], ["Boosters rentables : en cherchant un personnage, chaque suggestion montre son image et ses raretés."], ["Accueil : après un « Tout ouvrir », un bouton « Ouvrir les 10 suivants » à côté de « Fermer » ouvre les boosters suivants du même pack, 10 par 10 (le jeu n’en ouvre pas plus d’un coup). La fenêtre des cartes se ferme toute seule 5 s après la dernière, sur les 10 suivantes s’il en reste : un clic dans la fenêtre l’arrête."], ["Proposer un échange : à côté de « Doublons », les filtres « Mes recherches » et « Il me manque » dans « Tu demandes », et « Il lui manque » dans « Tu donnes » (avec « Doublons » : tes doublons qu’il n’a pas)."], ["Classement : « Global » à côté de « Amis » (les joueurs vus récemment dans les Beaux tirages et les utilisateurs d’Aquaman, pas la liste complète du jeu), et un onglet « Perles » : le stock de Perles des utilisateurs d’Aquaman qui le partagent (réglage « Mes Perles au classement »)."]]
        },
        {
          version: "1.4.6",
          items: [["Page d’une carte : un bouton « Enchérir » sur chaque enchère en cours, qui ouvre sa page dans le jeu."]]
        },
        {
          version: "1.4.5",
          items: [["Page d’une carte : sous les annonces du marché, les 3 enchères en cours avec la mise la plus faible, avec le nombre d’enchères et le temps restant."]]
        },
        {
          version: "1.4.4",
          items: [
            ["Page d’une carte : après un achat avec « Acheter », la page ne se recharge plus ; tes Perles et tes exemplaires se mettent à jour sur place."],
            ["Collection : « ★ Favoris », « Les plus avancées » et « Masquer séries <= 5 persos » apparaissent dès l’ouverture de l’onglet."]
          ]
        },
        {
          version: "1.4.3",
          items: [
            ["Échanges : la pastille verte ou rouge apparaît sur toutes les pages d’échange, et sur les propositions envoyées en MP.", "echanges"],
            ["Échanges : les cartes gardent la taille du jeu."],
            ["Page d’une carte SSR, UR ou SEC : un bouton « Qui a cette carte ? » sous « Mes exemplaires » montre les joueurs qui l’ont."],
            ["Collection : « Masquer séries <= 5 persos », à côté de « Les plus avancées », cache les séries de 5 personnages ou moins."],
            ["Collection : « En vente » à côté de « Manquante » indique seulement que la carte est vendue au marché : la pastille ne s’ouvre plus."],
            ["Page d’une carte : les 5 annonces les moins chères du marché, sous la cote, avec « Acheter »."],
            ["Téléphone : le bouton « Installer » du cadre de mise à jour ouvre le script dans une page que Tampermonkey et Userscripts savent installer (avant, le fichier était seulement téléchargé)."]
          ]
        },
        {
          version: "1.4.2",
          items: [["Correction : avec « Tout ouvrir », le pack de l’animation prend l’image de la catégorie ouverte (Légendaire, Action, Magie…), et non celle de la catégorie ouverte juste avant."]]
        },
        {
          version: "1.4.1",
          items: [
            ["Réglages : Plus › Réglages permet d’activer ou de couper chaque fonction d’Aquaman (boosters par catégorie, lueur, garantie, « Manquantes », « En vente », échanges…). La même liste sur PC et téléphone, dans l’extension comme dans le script, et dans la fenêtre de l’extension."],
            ["Collection : changer de série ne fait plus sauter la page ; la file d’attente des recherches reste en bas de l’écran et dans Séries favorites."],
            ["Correction : en ouvrant des boosters à thème (Action, Magie…), le pack de l’animation d’ouverture a bien l’image de sa catégorie, et non celle du booster classique."]
          ]
        },
        {
          version: "1.4.0",
          items: [
            ["Garantie anti-malchance : un bouton « Historique » ouvre ton tracker. Il montre à quelle fréquence tu tires des SSR, UR et SEC comparé à la chance du jeu, tes 300 derniers boosters d’un coup d’œil, et combien de boosters il t’a fallu pour chacune."],
            ["Correction : une UR ne remet plus le compteur de la garantie SSR à zéro, comme dans le jeu."],
            ["Accueil : la lueur derrière le booster prend la couleur de son pack (doré, cyan, rouge…)."],
            ["Qui a cette carte ? : un même numéro n’apparaît plus chez deux joueurs ; celui vu le plus récemment l’emporte."]
          ]
        },
        {
          version: "1.3.2",
          items: [
            ["Collection : un bouton « En vente » à côté de chaque carte manquante que quelqu’un vend ; il ouvre les 5 annonces les moins chères du marché, avec « Acheter ». Elles ne sont plus ajoutées sur la page de la carte."],
            ["Accueil : « N à ouvrir » compte les boosters de la catégorie affichée, et son nom n’est plus écrit au-dessus du pack (il est déjà dessus)."],
            ["Accueil : le booster du dessus bouge comme dans le jeu (il flotte et se tourne vers la souris), et sa lueur n’est plus coupée."],
            ["Correction : la page Collection ne devient plus blanche quand on clique sur « Manquantes » dans une série."],
            ["Échanges : la page ne gèle plus et ne plante plus quand Aquaman marque les cartes que tu as déjà."],
            ["Téléphone : les boosters de l’accueil gardent leur forme (ils étaient écrasés) et ne glissent plus les uns derrière les autres quand on fait défiler la page ; les boutons « Ouvrir » et « Tout ouvrir » sont l’un sous l’autre, comme dans le jeu."],
            ["Plus fluide : Aquaman travaille quand le navigateur est libre, se met en pause quand l’onglet est caché, et le marché comme la collection lui demandent moins de travail."]
          ]
        },
        {
          version: "1.3.1",
          items: [
            ["Marché : les cartes achetées dont les autres annonces sont masquées sont les mêmes sur tous tes appareils (PC, téléphone, extension ou script)."],
            ["Vendre mes doublons : la file des doublons en attente de vente est la même sur tous tes appareils ; celui qui a une page du site ouverte les met en vente dès qu’une place se libère."],
            ["Réglages : « Partager les cartes achetées masquées et les doublons en attente de vente entre mes appareils », activé par défaut."]
          ]
        },
        {
          version: "1.3.0",
          items: [
            ["Vendre mes doublons (fenêtre du jeu) : quand le marché est plein, le doublon refusé et ceux encore cochés après lui attendent dans Aquaman (50 au plus), sans recliquer, et sont mis en vente tout seuls, au prix choisi, dès qu’une de tes ventes se conclut. La file s’affiche dans la fenêtre, avec « Vider la file » et « Réessayer maintenant »."],
            ["Recycler des cartes (fenêtre du jeu) : aucune carte n’est cochée à l’ouverture, et un bouton « Tout sélectionner » coche toute la liste."],
            ["Accueil : sous les garanties SSR et UR, le nombre de boosters depuis ta dernière SEC, sa fréquence moyenne et ta chance d’en avoir une dans les 100 prochains (la SEC n’a pas de garantie).", "pity"],
            ["Accueil : quand tes boosters sont de plusieurs catégories, les boosters gratuits s’affichent d’abord, et des flèches passent aux autres catégories (3 visibles à la fois : celle du centre et une de chaque côté), chacune avec son rendu, l’image de son pack et ses boutons « Ouvrir » et « Tout ouvrir », qui n’ouvrent que ceux-là, avec l’animation du jeu. Leur dessin est gardé et partagé entre tes appareils, pour s’afficher tout de suite."],
            ["Accueil : un pack acheté dans la boutique s’affiche dès le retour à l’accueil, sans recharger la page."],
            ["Marché : un bouton « Retirer mes ventes » à côté de « Vendre une carte » retire toutes tes ventes à prix fixe d’un coup. La file d’attente des doublons est mise en pause le temps du retrait, puis réactivée."],
            ["Marché : une fois une carte achetée, ses autres annonces de la même rareté ne s’affichent plus."],
            ["Marché : un filtre « ★ Favoris » à côté de « Mes recherches » ne montre que les cartes de tes séries favorites."],
            ["Collection : « Les plus avancées » à côté de ★ Favoris range les séries de celle où il te manque le moins de cartes à celle où il en manque le plus (les complètes à la fin). Le tri et la place de la bande sont gardés au retour de la page d’un personnage."],
            ["Collection : un onglet « Manquantes » à côté de « Album complet », qui ne montre que les cartes qui te manquent."],
            ["Page d’une carte : sous la cote, les 5 offres les moins chères du marché, de la moins chère à la plus chère, avec le vendeur, le numéro et un bouton « Acheter »."],
            ["Qui a cette carte ? : la photo de profil de chaque joueur à côté de son nom.", "qui"],
            ["Correction : la page Collection ne devient plus blanche quand on clique trop tôt sur « Manquantes » (Aquaman attend que le jeu ait fini de charger la page)."]
          ]
        },
        {
          version: "1.2.0",
          items: [
            ["Ma vitrine : la fenêtre reste fluide même avec des centaines de cartes (seules celles proches de l’écran sont dessinées, et Aquaman ne fouille plus toute la fenêtre à chaque changement).", "vitrine"],
            ["Qui a cette carte ? : quand quelqu’un fait un beau tirage (SSR, UR ou SEC), Aquaman lit sa collection publique et garde ses SSR, UR et SEC dans la base commune ; « Vus avec cette carte » liste ces joueurs.", "qui"],
            ["Les cartes en attente de recherche (au-delà des 100 du jeu) sont les mêmes sur tous tes appareils.", "favoris"],
            ["Script : une nouvelle version est cherchée toutes les 10 minutes et proposée en haut de l’écran (« Installer »). L’extension la cherche aussi toutes les 10 minutes."]
          ]
        },
        {
          version: "1.1.1",
          items: [
            ["Qui a cette carte ? (menu Plus) : cherche n’importe quel personnage et vois les joueurs qui ont sa carte (détenteurs des cartes limitées, vendeurs au marché, amis) et tous ceux qui l’ont tirée.", "qui"],
            ["Base commune des beaux tirages : chaque Aquaman relève les SSR, UR et SEC qui sortent chaque minute et les partage ; « Qui a cette carte ? » s’en sert pour dire qui a tiré une carte et combien de fois.", "qui"],
            ["Collection : dans le cadre « Album de la série », « Ajouter aux favoris » et « Rechercher les manquantes » pour la série affichée.", "etoiles"],
            ["Rechercher les manquantes : les cartes s’ajoutent au rythme que le jeu accepte, et l’ajout continue pendant que tu changes de page ou ouvres des boosters, avec sa progression en bas de l’écran."],
            ["Jusqu’à 200 cartes recherchées de plus : quand la liste du jeu (100 cartes) est pleine, les suivantes attendent dans Aquaman et y entrent au fur et à mesure que tu obtiens les cartes recherchées (Aquaman retire de la liste celles qu’il y avait mises, une fois obtenues). L’ajout se fait en arrière-plan ; sa progression est dans Séries favorites.", "favoris"]
          ]
        },
        {
          version: "1.1.0",
          items: [
            ["Qui a tiré… ? (menu Plus) : les joueurs qui ont tiré récemment un personnage ou une carte d’une série, parmi les beaux tirages du jeu gardés 30 jours.", "qui"],
            ["Séries favorites : une étoile ☆ sur chaque série de la page Collection, et une page avec leurs personnages (toutes, manquantes, possédées, recherchées, par rareté), les mêmes sur tous tes appareils.", "favoris"],
            ["Séries favorites : « Rechercher les manquantes » met d’un coup toutes les cartes qui te manquent dans ta liste de recherches du jeu ; 🔭 pour une seule carte.", "favoris"],
            ["Sur téléphone : la garantie anti-malchance s’affiche aussi quand la réserve de boosters est pleine.", "pity"]
          ]
        },
        {
          version: "1.0.0",
          items: [
            ["Onglet Plus à droite de Marché, avec le classement des amis (cartes uniques et séries complètes).", "classement"],
            ["Quel booster ouvrir ? (Plus → Boosters rentables) : pour des cartes nouvelles, une rareté, un personnage, une série ou la valeur, les boosters classés par taux de drop ou par prix, avec le nombre de boosters à ouvrir en moyenne et le meilleur et le pire taux.", "boosters"],
            ["Échanges : cartes plus grandes et pastille verte ou rouge selon que tu as la carte ou non.", "echanges"],
            ["Collection : la bande des séries défile avec la molette, ou en l’attrapant avec un clic glissé.", "series"],
            ["Ma vitrine : glisser-déposer des cartes, à la souris ou au doigt.", "vitrine"],
            ["Accueil : les cartes des beaux tirages sont plus grandes.", "tirages"],
            ["Accueil : la garantie anti-malchance, avec le nombre de boosters avant ta prochaine SSR et ta prochaine UR garanties, le même sur tous tes appareils.", "pity"],
            ["Extension : le nombre de boosters à ouvrir sur l’icône, une notification quand il y en a de nouveaux, et le bouton « Mettre à jour » dans sa fenêtre."]
          ]
        }
      ];
      const owner = typeof OWNER === "string" ? OWNER : "extension";
      const root = document.documentElement;
      const otherCopy = !!root.dataset.aqmOwner && root.dataset.aqmOwner !== owner;
      if (!otherCopy) root.dataset.aqmOwner = owner;
      const startups = [];
      const onStart = (fn) => startups.push(fn);
      const RARITY_NAMES = { N: "Commune", R: "Rare", SR: "Épique", SSR: "Légendaire", UR: "Mythique", SEC: "Secrète" };
      const RANKED = ["N", "R", "SR", "SSR", "UR", "SEC"];
      const TYPE_NAMES = { magie: "Magie", action: "Action", "arts-martiaux": "Arts martiaux", romance: "Romance", waifu: "Waifu", mechant: "Méchants" };
      const TOUR_HASH = "#aqm-visite";
      const NEWS_HASH = "#aqm-nouveautes";
      const TOUR_STEP = "aqm-tour-step";
      const AUTHOR_ID = "cmoht6nr312u6qs135zjtdojg";
      let meId = null;
      const ICON_DOTS = '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M144,128a16,16,0,1,1-16-16A16,16,0,0,1,144,128ZM60,112a16,16,0,1,0,16,16A16,16,0,0,0,60,112Zm136,0a16,16,0,1,0,16,16A16,16,0,0,0,196,112Z"/></svg>';
      const ICON_CHART = '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M232,208a8,8,0,0,1-8,8H32a8,8,0,0,1-8-8V48a8,8,0,0,1,16,0V156.69l50.34-50.35a8,8,0,0,1,11.32,0L128,132.69,180.69,80H160a8,8,0,0,1,0-16h40a8,8,0,0,1,8,8v40a8,8,0,0,1-16,0V91.31l-58.34,58.35a8,8,0,0,1-11.32,0L96,123.31l-56,56V200H224A8,8,0,0,1,232,208Z"/></svg>';
      const ICON_TROPHY = '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M232,64H208V48a8,8,0,0,0-8-8H56a8,8,0,0,0-8,8V64H24A16,16,0,0,0,8,80V96a40,40,0,0,0,40,40h3.65A80.13,80.13,0,0,0,120,191.61V216H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16H136V191.58c31.94-3.23,58.44-25.64,68.08-55.58H208a40,40,0,0,0,40-40V80A16,16,0,0,0,232,64ZM48,120A24,24,0,0,1,24,96V80H48v32q0,4,.39,8Zm144-8.9c0,35.52-28.49,64.64-63.51,64.9H128a64,64,0,0,1-64-64V56H192ZM232,96a24,24,0,0,1-24,24h-.5a81.81,81.81,0,0,0,.5-8.9V80h24Z"/></svg>';
      const ICON_PACK = '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M184,72H40A16,16,0,0,0,24,88V200a16,16,0,0,0,16,16H184a16,16,0,0,0,16-16V88A16,16,0,0,0,184,72Zm0,128H40V88H184V200ZM232,56V176a8,8,0,0,1-16,0V56H64a8,8,0,0,1,0-16H216A16,16,0,0,1,232,56Z"/></svg>';
      const ICON_X = '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
      const ICON_COMPASS = '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216ZM172.42,72.84l-64,32a8.05,8.05,0,0,0-3.58,3.58l-32,64A8,8,0,0,0,80,184a8.1,8.1,0,0,0,3.58-.84l64-32a8.05,8.05,0,0,0,3.58-3.58l32-64a8,8,0,0,0-10.74-10.74ZM138,138,97.89,158.11,118,118l40.15-20.07Z"/></svg>';
      const ICON_GEAR = '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Z"/></svg>';
      const ICON_SPARK = '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M197.58,129.06,146,110l-19-51.62a15.92,15.92,0,0,0-29.88,0L78,110l-51.62,19a15.92,15.92,0,0,0,0,29.88L78,178l19,51.62a15.92,15.92,0,0,0,29.88,0L146,178l51.62-19a15.92,15.92,0,0,0,0-29.88ZM137,164.22a8,8,0,0,0-4.74,4.74L112,223.85,91.78,169A8,8,0,0,0,87,164.22L32.15,144,87,123.78A8,8,0,0,0,91.78,119L112,64.15,132.22,119a8,8,0,0,0,4.74,4.74L191.85,144ZM144,40a8,8,0,0,1,8-8h16V16a8,8,0,0,1,16,0V32h16a8,8,0,0,1,0,16H184V64a8,8,0,0,1-16,0V48H152A8,8,0,0,1,144,40ZM248,88a8,8,0,0,1-8,8h-8v8a8,8,0,0,1-16,0V96h-8a8,8,0,0,1,0-16h8V72a8,8,0,0,1,16,0v8h8A8,8,0,0,1,248,88Z"/></svg>';
      const ICON_SEARCH = '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/></svg>';
      const ICON_STAR = '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M239.18,97.26A16.38,16.38,0,0,0,224.92,86l-59-4.76L143.14,26.15a16.36,16.36,0,0,0-30.27,0L90.11,81.23,31.08,86a16.46,16.46,0,0,0-9.37,28.86l45,38.83L53,211.75a16.38,16.38,0,0,0,24.5,17.82L128,198.49l50.53,31.08A16.4,16.4,0,0,0,203,211.75l-13.76-58.07,45-38.83A16.43,16.43,0,0,0,239.18,97.26Zm-15.34,5.47-48.7,42a8,8,0,0,0-2.56,7.91l14.88,62.8a.37.37,0,0,1-.17.48c-.18.14-.23.11-.38,0l-54.72-33.65a8,8,0,0,0-8.38,0L69.09,215.94c-.15.09-.19.12-.38,0a.37.37,0,0,1-.17-.48l14.88-62.8a8,8,0,0,0-2.56-7.91l-48.7-42c-.12-.1-.23-.19-.13-.5s.18-.27.33-.29l63.92-5.16A8,8,0,0,0,103,91.86l24.62-59.61c.08-.17.11-.25.35-.25s.27.08.35.25L153,91.86a8,8,0,0,0,6.75,4.92l63.92,5.16c.15,0,.24,0,.33.29S224,102.63,223.84,102.73Z"/></svg>';
      const ICON_PEARL = '<span class="aqm-pearl" aria-hidden="true"></span>';
      const nf = new Intl.NumberFormat("fr-FR");
      const fmt = (n) => nf.format(Math.round(n || 0));
      const dec = (n, digits = 2) => (n || 0).toLocaleString("fr-FR", { maximumFractionDigits: digits });
      const pct = (p) => {
        const v = 100 * (p || 0);
        return `${v.toLocaleString("fr-FR", { maximumFractionDigits: v < 0.1 ? 3 : v < 10 ? 2 : 1 })} %`;
      };
      const alive = () => {
        try {
          return !!chrome.runtime?.id;
        } catch {
          return false;
        }
      };
      const GONE = /extension context invalidated/i;
      const onGone = (e) => {
        if (!GONE.test(String(e.reason?.message ?? e.error?.message ?? e.message ?? ""))) return;
        e.preventDefault();
        shutdown();
      };
      onStart(() => {
        addEventListener("unhandledrejection", onGone);
        addEventListener("error", onGone);
      });
      async function send(msg) {
        if (!alive()) return shutdown(), null;
        try {
          return await chrome.runtime.sendMessage(msg) ?? null;
        } catch {
          return null;
        }
      }
      async function ask(msg) {
        const res = await send(msg);
        if (!res) throw new Error("Aquaman ne répond pas : recharge la page.");
        if (res.error) throw new Error(res.error === "unknown_message" ? "Aquaman ne répond pas : recharge la page." : res.error);
        return res;
      }
      const pageFetch = typeof content !== "undefined" && content?.fetch ? content.fetch.bind(content) : window.fetch.bind(window);
      async function gameWrite(path, method, data) {
        const headers = data === void 0 ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" };
        const res = await pageFetch(`/api-game/v1${path}`, { method, credentials: "include", headers, body: data === void 0 ? void 0 : JSON.stringify(data) });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const error = new Error(body?.error?.message || `Erreur ${res.status}`);
          error.slowDown = res.status === 429 || /doucement|r[ée]essaie|trop de requ/i.test(error.message);
          error.wait = (Number(res.headers?.get?.("retry-after")) || Number(error.message.match(/(\d+)\s*(?:s\b|sec)/i)?.[1]) || 0) * 1e3;
          throw error;
        }
        if (method !== "GET" && /^\/(market|trades|auctions|copies)\//.test(path)) window.postMessage({ aquamanCmd: "reload-game", assets: true }, location.origin);
        return body;
      }
      async function wantCard(id, on2) {
        if (!on2 && await takeWaiting([id])) {
          send({ type: "wants-changed" });
          return { wanted: false };
        }
        const res = await gameWrite(`/cards/${encodeURIComponent(id)}/want`, on2 ? "PUT" : "DELETE");
        send({ type: "wants-changed" });
        return { wanted: !!res?.wanted };
      }
      const pause = (ms) => new Promise((r) => setTimeout(r, ms));
      const playersSeen = /* @__PURE__ */ new Map();
      const foldName = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
      let batch = null;
      let settled = false;
      let feat = {};
      let featLoaded = false;
      const on = (key) => feat[key] !== false;
      const featReady = chrome.storage.local.get("settings").then(({ settings }) => feat = settings ?? {}).catch(() => {
      }).finally(() => featLoaded = true);
      function h(tag, props = {}, ...kids) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
          if (v == null || v === false) continue;
          if (k === "class") el.className = v;
          else if (k === "style") el.style.cssText = v;
          else if (k === "html") el.innerHTML = v;
          else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
          else el.setAttribute(k, v === true ? "" : v);
        }
        for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
        return el;
      }
      let runText;
      const SKIP_TEXT = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG"]);
      function textNodes(from) {
        if (from === document.body && runText) return runText;
        const nodes = [];
        const walker = document.createTreeWalker(from, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => n.nodeType === Node.TEXT_NODE ? NodeFilter.FILTER_ACCEPT : n !== from && (n.classList.contains("aqm-root") || vitrines.has(n) || SKIP_TEXT.has(n.tagName.toUpperCase())) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP
        });
        for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.trim()) nodes.push(n);
        if (from === document.body && runText === null) runText = nodes;
        return nodes;
      }
      function elementsWithText(from, re) {
        const out = [];
        for (const n of textNodes(from)) if (n.parentElement && re.test(n.nodeValue)) out.push(n.parentElement);
        return out;
      }
      const setText = (el, text) => el.textContent !== text && (el.textContent = text);
      function anchorBadges(el) {
        const position = getComputedStyle(el).position;
        if (el.style.position === "relative" || position && position !== "static") return;
        el.style.position = "relative";
        el.dataset.aqmAnchor = "1";
      }
      const setClass = (el, cls) => el.className !== cls && (el.className = cls);
      const isVisible = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      const firstVisible = (selector) => [...document.querySelectorAll(selector)].find(isVisible) ?? null;
      const canHover = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
      function imageKey2(src) {
        if (!src) return null;
        let s = String(src);
        try {
          const u = new URL(s, location.origin);
          s = u.pathname.startsWith("/_next/image") ? u.searchParams.get("url") || "" : u.pathname;
          s = decodeURIComponent(s);
        } catch {
        }
        s = s.split(/[?#]/)[0];
        return s.slice(s.lastIndexOf("/") + 1) || null;
      }
      function isCardImage(src) {
        let s = String(src || "");
        try {
          s = decodeURIComponent(s);
        } catch {
        }
        return /\/api-media\/file\/|\/api-game\/v1\/content\/|media-library\//.test(s);
      }
      const cardImageUrl = (image) => !image ? "" : image.startsWith("content/") ? `/api-game/v1/content/${image.slice(8)}` : `/api-media/file/${image.replace(/^media-library\//, "")}`;
      const avatarUrl = (id) => `/api/avatar/${encodeURIComponent(id)}`;
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
      function session(key, value) {
        try {
          if (value === void 0) return sessionStorage.getItem(key);
          if (value === null) sessionStorage.removeItem(key);
          else sessionStorage.setItem(key, value);
        } catch {
        }
        return null;
      }
      const QUEUE = "wantQueue";
      const TAB = Math.random().toString(36).slice(2);
      const STALE = 1e4;
      let queueRunning = false;
      const readQueue = async () => (await chrome.storage.local.get(QUEUE))[QUEUE] ?? null;
      const writeQueue = (q) => chrome.storage.local.set({ [QUEUE]: q });
      const slowWait = (e) => (e.wait || 5e3) + 1e3;
      const busyElsewhere = (q) => !!q.owner && q.owner !== TAB && (Date.now() - q.beat < STALE || Date.now() < (q.until || 0) + STALE);
      const WAITING = "wantWaiting";
      const SENT = "wantSent";
      const LIMIT = "wantLimit";
      const REFILL = "wantRefillAt";
      const WAIT_MAX = 200;
      const ENTERED = "wantEntered";
      const CHECK_EVERY = 12e4;
      const FULL = /d[ée]j[àa]\s*(\d+)|retire|limite|maximum|plein/i;
      const readList = async (key) => (await chrome.storage.local.get(key))[key] ?? [];
      let wantsPush = 0;
      async function saveWants(items) {
        await chrome.storage.local.set({ ...items, wantsAt: Date.now() });
        clearTimeout(wantsPush);
        wantsPush = setTimeout(() => send({ type: "wants-sync", fresh: true }), 1500);
      }
      async function park(ids) {
        const waiting = await readList(WAITING);
        const fresh = ids.filter((id) => !waiting.includes(id));
        const fit = fresh.slice(0, Math.max(0, WAIT_MAX - waiting.length));
        if (fit.length) await saveWants({ [WAITING]: [...waiting, ...fit], ...waiting.length ? {} : { [ENTERED]: 0 } });
        return { parked: fit.length, over: fresh.length - fit.length };
      }
      async function takeWaiting(ids) {
        const waiting = await readList(WAITING);
        const left = waiting.filter((id) => !ids.includes(id));
        if (left.length !== waiting.length) await saveWants({ [WAITING]: left });
        return waiting.length - left.length;
      }
      async function enqueueWants(ids, refill2 = false) {
        if (!refill2 && (await readList(WAITING)).length) {
          const r = await park(ids);
          checkRoom(2e4);
          return r;
        }
        let q = await readQueue();
        if (!q || q.finishedAt) q = { ids: [], total: 0, done: 0, refused: null, owner: null, beat: 0, until: 0, tries: 0, finishedAt: 0 };
        const fresh = ids.filter((id) => !q.ids.includes(id));
        q.ids.push(...fresh);
        q.total += fresh.length;
        q.refill = refill2 && q.refill !== false;
        await writeQueue(q);
        runQueue();
        return { sent: fresh.length };
      }
      const nCards = (n) => `${n} carte${n > 1 ? "s" : ""}`;
      const overNote = (over) => over ? ` ${nCards(over)} de trop : Aquaman en garde ${WAIT_MAX} en attente au plus.` : "";
      function wantsNote(r, free) {
        if (r.sent == null)
          return `Ta liste du jeu est pleine : ${nCards(r.parked)} de plus en attente dans Aquaman, ajoutée${r.parked > 1 ? "s" : ""} au fur et à mesure que tu obtiens les cartes recherchées.` + overNote(r.over);
        return `${nCards(r.sent)} en cours d’ajout : ${free}, la progression reste affichée (en haut de Séries favorites et en bas de l’écran).`;
      }
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
        if (q?.ids.length) return;
        const { [REFILL]: at = 0, [LIMIT]: limit = 100 } = await chrome.storage.local.get([REFILL, LIMIT]);
        if (Date.now() - at < wait) return;
        await chrome.storage.local.set({ [REFILL]: Date.now() });
        const room = await send({ type: "want-room", waiting, sent: await readList(SENT) });
        if (!room || room.error || stopped) return;
        let freed = 0;
        for (const id of room.obtained) {
          try {
            await gameWrite(`/cards/${encodeURIComponent(id)}/want`, "DELETE");
            freed++;
          } catch {
          }
          await pause(900);
        }
        const now = await readList(WAITING);
        const left = now.filter((id) => !waiting.includes(id) || room.waiting.includes(id));
        const places = Math.max(0, limit - room.count + freed);
        const entered = (await chrome.storage.local.get(ENTERED))[ENTERED] ?? 0;
        await saveWants({ [SENT]: room.sent, [WAITING]: left.slice(places), [ENTERED]: entered + waiting.length - room.waiting.length });
        if (freed) send({ type: "wants-changed" });
        if (places && left.length) await enqueueWants(left.slice(0, places), true);
      }
      async function stopQueue() {
        const q = await readQueue();
        if (!q) return;
        await writeQueue({ ...q, ids: [], refused: null, stopped: true, finishedAt: Date.now() });
      }
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
              await gameWrite(`/cards/${encodeURIComponent(id)}/want`, "PUT");
              q = await readQueue();
              if (!q || q.finishedAt) break;
              const ids = q.ids.filter((x) => x !== id);
              const { [SENT]: sent = [], [ENTERED]: entered = 0 } = await chrome.storage.local.get([SENT, ENTERED]);
              await saveWants({ [SENT]: sent.includes(id) ? sent : [...sent, id], ...q.refill ? { [ENTERED]: entered + 1 } : {} });
              await writeQueue({ ...q, ids, done: q.done + 1, tries: 0, beat: Date.now(), finishedAt: ids.length ? 0 : Date.now() });
              if (ids.length) await pause(gap);
            } catch (e) {
              q = await readQueue();
              if (!q || q.finishedAt) break;
              if (e.slowDown) {
                gap = Math.min(4e3, gap * 1.5);
                const wait = slowWait(e);
                await writeQueue({ ...q, tries: q.tries + 1, beat: Date.now(), until: Date.now() + wait });
                await pause(wait);
              } else if (FULL.test(e.message)) {
                const limit = Number(e.message.match(FULL)?.[1]);
                if (limit > 0) await chrome.storage.local.set({ [LIMIT]: limit });
                const before = await readList(WAITING);
                const waiting = [...q.ids, ...before.filter((x) => !q.ids.includes(x))];
                const parked = Math.min(q.ids.length, WAIT_MAX);
                await saveWants({ [WAITING]: waiting.slice(0, WAIT_MAX), [REFILL]: Date.now(), ...before.length || q.refill ? {} : { [ENTERED]: 0 } });
                await writeQueue({ ...q, parked, over: q.ids.length - parked, ids: [], finishedAt: Date.now() });
              } else await writeQueue({ ...q, refused: e.message, left: q.ids.length, ids: [], finishedAt: Date.now() });
            }
          }
        } finally {
          queueRunning = false;
          send({ type: "wants-changed" });
        }
      }
      async function renderBox() {
        const q = await readQueue();
        if (!stopped) renderQueue(q && !q.refill ? q : null);
      }
      function searchPanel(changed) {
        const panel = h("div", { class: "aqm-fav-wait", role: "status", hidden: true });
        let wasRunning = null;
        const paint = async () => {
          if (stopped || !alive()) return void stop();
          if (!panel.isConnected && wasRunning !== null) return void stop();
          const { [QUEUE]: q = null, [WAITING]: waiting = [], [ENTERED]: entered = 0, [REFILL]: at = 0, [LIMIT]: limit = 100 } = await chrome.storage.local.get([QUEUE, WAITING, ENTERED, REFILL, LIMIT]);
          const running = !!q?.ids.length;
          if (wasRunning && !running) changed?.();
          wasRunning = running;
          const parts = [];
          const slow = running && q.until > Date.now() ? ` Le jeu demande de ralentir : reprise dans ${Math.ceil((q.until - Date.now()) / 1e3)} s.` : "";
          if (running && !q.refill)
            parts.push(
              h("div", { class: "aqm-queue-head" }, h("strong", {}, `🔭 Ajout à ta liste du jeu · ${q.done}/${q.total}`)),
              h("span", { class: "aqm-bar" }, h("span", { style: `width:${q.total ? (100 * q.done / q.total).toFixed(1) : 0}%` })),
              h("p", {}, `Les cartes entrent une à une dans ta liste de recherches du jeu (${limit} cartes au plus) ; au-delà, elles passent dans la file d’attente d’Aquaman.${slow}`)
            );
          const sending = running && q.refill ? q.ids.length : 0;
          const total = entered + sending + waiting.length;
          if (waiting.length || sending) {
            const pc = (n) => `${(100 * n / total).toFixed(1)}%`;
            const ago = Math.round((Date.now() - at) / 6e4);
            const next = Math.max(0, Math.ceil((at + CHECK_EVERY - Date.now()) / 6e4));
            parts.push(
              h(
                "div",
                { class: "aqm-queue-head" },
                h("strong", {}, `⏳ File d’attente d’Aquaman · ${entered}/${total}`),
                h("button", {
                  type: "button",
                  class: "aqm-queue-btn",
                  onclick: async () => {
                    if (!confirm(`Retirer les ${nCards(waiting.length)} de la file d’attente d’Aquaman ? Celles déjà dans ta liste du jeu y restent.`)) return;
                    await chrome.storage.local.remove([WAITING, ENTERED]);
                    await send({ type: "wants-changed" });
                    changed?.();
                  }
                }, "Vider la file")
              ),
              h("p", {}, `Ta liste de recherches du jeu est pleine (${limit} cartes). Aquaman garde les suivantes (${WAIT_MAX} au plus) et les y ajoute tout seul dès qu’une place se libère : quand tu obtiens une carte que tu recherches.`),
              h(
                "span",
                { class: "aqm-steps" },
                h("span", { class: "is-in", style: `width:${pc(entered)}` }),
                h("span", { class: "is-sending", style: `width:${pc(sending)}` }),
                h("span", { class: "is-waiting", style: `width:${pc(waiting.length)}` })
              ),
              h(
                "div",
                { class: "aqm-steps-legend" },
                h("span", { class: "is-in" }, `${entered} entrée${entered > 1 ? "s" : ""} dans ta liste`),
                sending ? h("span", { class: "is-sending" }, `${sending} en cours d’envoi`) : null,
                h("span", { class: "is-waiting" }, `${waiting.length} en attente`)
              ),
              h(
                "div",
                { class: "aqm-queue-actions" },
                h("small", {}, sending ? `Des places se sont libérées : envoi en cours.${slow}` : `Places vérifiées ${at ? ago ? `il y a ${ago} min` : "à l’instant" : "jamais"}${next ? `, prochaine vérification dans ${next} min` : ""}.`),
                sending ? null : h("button", { type: "button", class: "aqm-queue-btn", onclick: () => checkRoom(0) }, "Vérifier maintenant")
              )
            );
          }
          panel.hidden = !parts.length;
          panel.replaceChildren(...parts);
        };
        const onChange = (changes) => [QUEUE, WAITING, ENTERED, REFILL].some((k) => changes[k]) && paint();
        const timer = setInterval(paint, 5e3);
        const stop = () => {
          clearInterval(timer);
          chrome.storage.onChanged.removeListener?.(onChange);
        };
        chrome.storage.onChanged.addListener(onChange);
        paint();
        return panel;
      }
      function renderQueue(q) {
        if (!q || !q.ids.length && !q.finishedAt || !location.pathname.startsWith("/jeu")) return void document.querySelector(".aqm-dock > .aqm-wants")?.remove();
        const box = dockBox("aqm-wants");
        const running = q.ids.length > 0;
        const added = `${nCards(q.done)} ajoutée${q.done > 1 ? "s" : ""} à ta liste de recherches du jeu`;
        let title;
        let lines;
        if (running) {
          title = `🔭 Recherche des manquantes · ${q.done}/${q.total}`;
          lines = [
            q.until > Date.now() ? `Le jeu demande de ralentir : reprise dans ${Math.ceil((q.until - Date.now()) / 1e3)} s.` : "La recherche continue même si tu changes de page ou ouvres des boosters."
          ];
        } else if (q.stopped) {
          title = "🔭 Recherche arrêtée";
          lines = [`✅ ${added}.`];
        } else if (q.refused) {
          title = "🔭 Recherche interrompue";
          lines = [`✅ ${added}.`, `⛔ Le jeu a refusé la suite (« ${q.refused} ») : ${nCards(q.left)} non ajoutée${q.left > 1 ? "s" : ""}.`];
        } else if (q.parked) {
          title = "🔭 Ta liste du jeu est pleine";
          lines = [
            `✅ ${added}.`,
            `⏳ ${nCards(q.parked)} mise${q.parked > 1 ? "s" : ""} dans la file d’attente d’Aquaman : ${q.parked > 1 ? "elles seront ajoutées" : "elle sera ajoutée"} toute${q.parked > 1 ? "s" : ""} seule${q.parked > 1 ? "s" : ""} dès qu’une place se libère, quand tu obtiens une carte que tu recherches.`,
            q.over ? `⛔ ${nCards(q.over)} non gardée${q.over > 1 ? "s" : ""} : la file d’attente est pleine (${WAIT_MAX} cartes).` : null,
            "Suis la file dans Plus › Séries favorites."
          ];
        } else {
          title = "🔭 Recherche terminée";
          lines = [`✅ ${added}.`, "Le jeu te prévient quand elles sont mises en vente."];
        }
        box.replaceChildren(
          ...[
            h(
              "div",
              { class: "aqm-queue-head" },
              h("strong", {}, title),
              h("button", { type: "button", class: "aqm-queue-btn", onclick: () => running ? stopQueue() : chrome.storage.local.remove(QUEUE) }, running ? "Arrêter" : "OK")
            ),
            running && h("span", { class: "aqm-bar" }, h("span", { style: `width:${q.total ? (100 * q.done / q.total).toFixed(1) : 0}%` })),
            ...lines.map((line) => line && h("p", {}, line))
          ].filter(Boolean)
        );
      }
      function dockBox(cls) {
        let box = document.querySelector(`.aqm-dock > .${cls}`);
        if (box) return box;
        const dock = document.querySelector(".aqm-dock") ?? document.body.appendChild(h("div", { class: "aqm-root aqm-dock" }));
        return dock.appendChild(h("div", { class: `aqm-queue ${cls}`, role: "status" }));
      }
      const SALES = "sellQueue";
      const SALES_WAITING = "sellWaiting";
      const SALES_AT = "sellCheckAt";
      const SALES_LAST = "sellLastAnswer";
      const SALES_PAUSED = "sellPausedUntil";
      const SALES_MAX = 50;
      const SALES_FULL = /ordres? en cours/i;
      let salesRunning = false;
      onStart(() => {
        chrome.storage.local.remove("sellFullMessage");
      });
      const readSales = async () => (await chrome.storage.local.get(SALES))[SALES] ?? null;
      const writeSales = (q) => chrome.storage.local.set({ [SALES]: q });
      const nCopies = (n) => `${n} doublon${n > 1 ? "s" : ""}`;
      const salesPaused = async () => ((await chrome.storage.local.get(SALES_PAUSED))[SALES_PAUSED] ?? 0) > Date.now();
      async function parkSales(items, front = false) {
        const before = await readList(SALES_WAITING);
        const fresh = items.filter((x, i) => !before.some((y) => y.copyId === x.copyId) && items.findIndex((y) => y.copyId === x.copyId) === i);
        const all = front ? [...fresh, ...before] : [...before, ...fresh];
        await saveSalesWaiting({ [SALES_WAITING]: all.slice(0, SALES_MAX), ...front || !before.length ? { [SALES_AT]: Date.now() } : {} });
        return Math.max(0, all.length - SALES_MAX);
      }
      let marketPush = 0;
      async function saveSalesWaiting(items) {
        await chrome.storage.local.set({ ...items, sellWaitingAt: Date.now() });
        pushMarket();
      }
      function pushMarket() {
        clearTimeout(marketPush);
        marketPush = setTimeout(() => send({ type: "market-sync", fresh: true }), 1500);
      }
      async function onSellRefused(item, message, ticked) {
        if (salesRunning || !SALES_FULL.test(message)) return;
        const batch2 = Date.now() - sellOneAt > 15e3;
        const named = (x) => ({ cardId: x.cardId, copyId: x.copyId, price: x.price, name: x.name ?? ticked.find((t) => t.copyId === x.copyId)?.name ?? "Une carte" });
        const after = batch2 ? ticked.slice(Math.max(0, ticked.findIndex((t) => t.copyId === item.copyId))) : [];
        await parkSales([item, ...after].map(named));
      }
      let sellOneAt = 0;
      function onSellClick(e) {
        const b = e.target.closest?.("button");
        if (b && !b.closest(".aqm-root")) sellOneAt = b.textContent.trim() === "Vendre" ? Date.now() : 0;
      }
      async function checkSales(wait = CHECK_EVERY) {
        if (stopped || await salesPaused()) return;
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
      async function runSales() {
        if (salesRunning || stopped) return;
        const first = await readSales();
        if (!first?.items.length || busyElsewhere(first)) return;
        salesRunning = true;
        let gap = 900;
        try {
          while (!stopped) {
            let q = await readSales();
            if (!q?.items.length || busyElsewhere(q) || await salesPaused()) break;
            const item = q.items[0];
            await writeSales({ ...q, owner: TAB, beat: Date.now(), until: 0 });
            try {
              await gameWrite("/market/orders", "POST", { cardId: item.cardId, side: "sell", price: item.price, copyId: item.copyId });
              q = await readSales();
              if (!q || q.finishedAt) break;
              const items = q.items.filter((x) => x.copyId !== item.copyId);
              await writeSales({ ...q, items, done: q.done + 1, tries: 0, beat: Date.now(), finishedAt: items.length ? 0 : Date.now() });
              chrome.storage.local.set({ [SALES_LAST]: { at: Date.now(), message: null, full: false } });
              if (items.length) await pause(gap);
            } catch (e) {
              q = await readSales();
              if (!q || q.finishedAt) break;
              const rest = q.items.filter((x) => x.copyId !== item.copyId);
              if (e.slowDown) {
                gap = Math.min(4e3, gap * 1.5);
                const wait = slowWait(e);
                await writeSales({ ...q, tries: q.tries + 1, beat: Date.now(), until: Date.now() + wait });
                await pause(wait);
              } else if (SALES_FULL.test(e.message)) {
                chrome.storage.local.set({ [SALES_LAST]: { at: Date.now(), message: e.message, full: true } });
                await parkSales(q.items, true);
                await writeSales({ ...q, items: [], finishedAt: Date.now() });
              } else {
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
      async function renderSalesBox() {
        const q = await readSales();
        const show = q && !q.stopped && (q.done > 0 || q.items.length && q.items.length < q.total) && location.pathname.startsWith("/jeu");
        if (!show || stopped) return void document.querySelector(".aqm-dock > .aqm-sales")?.remove();
        const box = dockBox("aqm-sales");
        const running = q.items.length > 0;
        const waiting = (await readList(SALES_WAITING)).length;
        const lines = [
          `✅ ${nCopies(q.done)} de la file d’attente d’Aquaman mis en vente.`,
          running ? q.until > Date.now() ? `Le jeu demande de ralentir : reprise dans ${Math.ceil((q.until - Date.now()) / 1e3)} s.` : "Une place s’est libérée sur le marché : les suivants partent." : waiting ? `⏳ ${nCopies(waiting)} encore en attente : ils partiront aux prochaines ventes conclues.` : null,
          q.skipped.length ? `⛔ ${nCopies(q.skipped.length)} refusé${q.skipped.length > 1 ? "s" : ""} par le jeu (« ${q.skipped.at(-1).reason} »).` : null
        ];
        box.replaceChildren(
          ...[
            h(
              "div",
              { class: "aqm-queue-head" },
              h("strong", {}, running ? `🏷️ Mise en vente des doublons · ${q.done}/${q.total}` : "🏷️ Doublons mis en vente"),
              h("button", { type: "button", class: "aqm-queue-btn", onclick: () => running ? stopSales() : chrome.storage.local.remove(SALES) }, running ? "Arrêter" : "OK")
            ),
            running && h("span", { class: "aqm-bar" }, h("span", { style: `width:${q.total ? (100 * q.done / q.total).toFixed(1) : 0}%` })),
            ...lines.map((line) => line && h("p", {}, line))
          ].filter(Boolean)
        );
      }
      const saleToasts = /* @__PURE__ */ new WeakSet();
      function watchSaleToast() {
        for (const el of elementsWithText(document.body, /^\s*vente conclue\s*$/i)) {
          if (saleToasts.has(el)) continue;
          saleToasts.add(el);
          setTimeout(() => checkSales(0), 1500);
        }
      }
      const SELL_BAR = /^tout (d[ée])?cocher/i;
      function markSellDialog() {
        if (!location.pathname.startsWith("/jeu")) return;
        for (const title of document.querySelectorAll('h1, h2, h3, [role="dialog"] [id]')) {
          if (title.closest(".aqm-root") || !/^vendre mes doublons$/i.test(title.textContent.trim())) continue;
          const bar = [...(title.closest('[role="dialog"]') ?? document).querySelectorAll("button")].find((b) => SELL_BAR.test(b.textContent.trim()));
          if (!bar) continue;
          let block = bar;
          while (block.parentElement && !block.parentElement.contains(title)) block = block.parentElement;
          if (!block.parentElement || block.parentElement === document.body || block.parentElement.querySelector(":scope > .aqm-sell-wait")) continue;
          const panel = salesPanel();
          block.before(panel);
          const parent = block.parentElement;
          const inset = bar.getBoundingClientRect().left - parent.getBoundingClientRect().left - parseFloat(getComputedStyle(parent).paddingLeft || 0);
          if (inset > 0) panel.style.marginInline = `${Math.round(inset)}px`;
        }
      }
      function salesPanel() {
        const panel = h("div", { class: "aqm-root aqm-fav-wait aqm-sell-wait", role: "status" });
        let painted = false;
        const paint = async () => {
          if (stopped || !alive()) return void stop();
          if (!panel.isConnected && painted) return void stop();
          painted = true;
          const { [SALES]: q = null, [SALES_WAITING]: waiting = [], [SALES_AT]: at = 0, [SALES_LAST]: last = null } = await chrome.storage.local.get([SALES, SALES_WAITING, SALES_AT, SALES_LAST]);
          const sending = q?.items.length ?? 0;
          if (!waiting.length && !sending) {
            panel.replaceChildren(h("p", {}, `🔱 Aquaman : si le marché est plein, jusqu’à ${SALES_MAX} doublons de plus attendent dans Aquaman et sont mis en vente tout seuls, au prix choisi, dès qu’une de tes ventes se conclut.`));
            return;
          }
          const ago = Math.round((Date.now() - at) / 6e4);
          const next = Math.max(0, Math.ceil((at + CHECK_EVERY - Date.now()) / 6e4));
          panel.replaceChildren(
            h(
              "div",
              { class: "aqm-queue-head" },
              h("strong", {}, `⏳ File d’attente d’Aquaman · ${waiting.length}/${SALES_MAX}`),
              waiting.length ? h("button", {
                type: "button",
                class: "aqm-queue-btn",
                onclick: async () => {
                  if (!confirm(`Retirer les ${nCopies(waiting.length)} de la file d’attente d’Aquaman ? Ceux déjà en vente y restent.`)) return;
                  await saveSalesWaiting({ [SALES_WAITING]: [] });
                }
              }, "Vider la file") : null
            ),
            h("p", {}, `Le marché est plein : Aquaman garde le doublon refusé et ceux encore cochés après lui (${SALES_MAX} au plus) et les met en vente tout seul, au prix choisi, dès qu’une de tes ventes se conclut. Il vérifie en arrière-plan tant qu’une page du site est ouverte, même dans un autre onglet.`),
            waiting.length ? h("ul", { class: "aqm-sell-waiting" }, waiting.map((x) => h("li", {}, h("span", {}, x.name), perles(x.price)))) : null,
            // Ce qu'a dit le jeu au dernier essai : ses propres mots, pour voir pourquoi les exemplaires attendent.
            last?.message ? h("p", { class: "aqm-sell-last" }, `Dernière réponse du jeu ${timeAgo(last.at)} : « ${last.message} »${last.full ? " (ses ventes et ses ordres d’achat en cours comptent ensemble)." : " : ce doublon a été retiré de la file."}`) : null,
            h(
              "div",
              { class: "aqm-queue-actions" },
              h("small", {}, sending ? `Une place s’est libérée : ${nCopies(sending)} en cours d’envoi.` : `Essayé ${at ? ago ? `il y a ${ago} min` : "à l’instant" : "jamais"}${next ? `, prochain essai dans ${next} min` : ""}.`),
              sending ? null : h("button", { type: "button", class: "aqm-queue-btn", onclick: () => checkSales(0) }, "Réessayer maintenant")
            )
          );
        };
        const onChange = (changes) => [SALES, SALES_WAITING, SALES_AT, SALES_LAST].some((k) => changes[k]) && paint();
        const timer = setInterval(paint, 5e3);
        const stop = () => {
          clearInterval(timer);
          chrome.storage.onChanged.removeListener?.(onChange);
        };
        chrome.storage.onChanged.addListener(onChange);
        paint();
        return panel;
      }
      const BOUGHT_KEY = "marketBought";
      const onMarket = () => /^\/jeu\/marche\/?$/.test(location.pathname);
      const PAGE_PARTS = 'main, nav, header, footer, h1, [role="dialog"], [role="alertdialog"], dialog';
      const boughtNames = /* @__PURE__ */ new Set();
      onStart(async () => {
        try {
          for (const key of (await chrome.storage.local.get(BOUGHT_KEY))[BOUGHT_KEY] ?? []) boughtNames.add(key);
        } catch {
        }
        hideBoughtCards();
      });
      function addBought(name, rarity) {
        const code = RANKED.includes(rarity) ? rarity.toLowerCase() : "";
        boughtNames.add(code ? `${code}|${name.trim().toLowerCase()}` : name.trim().toLowerCase());
        try {
          chrome.storage.local.set({ [BOUGHT_KEY]: [...boughtNames] });
        } catch {
        }
        pushMarket();
        hideBoughtCards();
      }
      const BUY_BUTTON = /^(acheter|confirmer|trop cher)$/i;
      function marketTiles() {
        if (!onMarket()) return [];
        const buys = [...document.querySelectorAll("button")].filter((b) => !b.closest('.aqm-root, [role="dialog"], [role="alertdialog"], dialog') && BUY_BUTTON.test(b.textContent.trim()));
        const held = /* @__PURE__ */ new Map();
        for (const b of buys) for (let el = b.parentElement; el && el !== document.body; el = el.parentElement) held.set(el, (held.get(el) ?? 0) + 1);
        return buys.map((b) => {
          let tile = b;
          while (tile.parentElement && tile.parentElement !== document.body && held.get(tile.parentElement) === 1 && !tile.parentElement.matches(PAGE_PARTS) && !tile.parentElement.querySelector(PAGE_PARTS)) tile = tile.parentElement;
          let texts = null;
          return {
            tile,
            get texts() {
              return texts ??= new Set([...tile.querySelectorAll("*")].filter((el) => !el.childElementCount).map((el) => el.textContent.trim().toLowerCase()));
            }
          };
        });
      }
      function hideBoughtCards() {
        if (!onMarket()) return void document.querySelectorAll("[data-aqm-bought]").forEach((el) => el.removeAttribute("data-aqm-bought"));
        if (!on("hideBought") || !boughtNames.size) return;
        for (const t of marketTiles()) {
          const { tile } = t;
          if (tile.hasAttribute("data-aqm-bought") || tile.matches(PAGE_PARTS) || tile.querySelector(PAGE_PARTS)) continue;
          const { texts } = t;
          const rarity = RANKED.find((code) => texts.has(code.toLowerCase()) || texts.has(RARITY_NAMES[code].toLowerCase()))?.toLowerCase();
          const hidden = [...texts].some((t2) => boughtNames.has(t2) || rarity && boughtNames.has(`${rarity}|${t2}`));
          if (hidden) tile.setAttribute("data-aqm-bought", "");
        }
      }
      const MARKET_FAV_KEY = "aqm-market-fav";
      let marketFavLoading = false;
      let marketFavTried = false;
      const marketFavOn = () => {
        try {
          return sessionStorage.getItem(MARKET_FAV_KEY) === "1";
        } catch {
          return false;
        }
      };
      function markMarketFavorites() {
        if (!onMarket()) return void document.querySelectorAll("[data-aqm-unfav]").forEach((el) => el.removeAttribute("data-aqm-unfav"));
        const mine = [...document.querySelectorAll("button")].find((b) => !b.closest(".aqm-root") && /^mes recherches$/i.test(b.textContent.trim()));
        if (!mine) return;
        const on2 = marketFavOn();
        let chip = mine.parentElement.querySelector(":scope > .aqm-market-fav");
        if (!chip) {
          const plain = [...mine.parentElement.querySelectorAll("button")].find((b) => b !== mine && /^(n|r|sr|ssr|ur|sec)\s*(commune|rare|épique|légendaire|mythique|secrète)$/i.test(b.textContent.trim()));
          chip = h("button", {
            type: "button",
            class: `${plain?.className ?? mine.className} aqm-market-fav`,
            title: "Seulement les cartes de tes séries favorites",
            onclick: () => {
              try {
                marketFavOn() ? sessionStorage.removeItem(MARKET_FAV_KEY) : sessionStorage.setItem(MARKET_FAV_KEY, "1");
              } catch {
              }
              markMarketFavorites();
            }
          }, "★ Favoris");
          mine.after(chip);
        }
        chip.classList.toggle("is-on", on2);
        chip.setAttribute("aria-pressed", String(on2));
        if (on2 && (!favIds || !seriesTitles)) {
          if (!marketFavLoading && !marketFavTried) {
            marketFavLoading = true;
            marketFavTried = true;
            loadFavIds().finally(() => {
              marketFavLoading = false;
              markMarketFavorites();
            });
          }
          return;
        }
        const titles = new Set(on2 ? [...favIds].map((id) => seriesTitles.get(id)).filter(Boolean) : []);
        for (const { tile, texts } of marketTiles()) tile.toggleAttribute("data-aqm-unfav", on2 && !tile.matches(PAGE_PARTS) && !tile.querySelector(PAGE_PARTS) && ![...texts].some((t) => titles.has(t)));
      }
      let marketSalesKeys = /* @__PURE__ */ new Set();
      const marketListingKeys = /* @__PURE__ */ new Set();
      const marketAuctionKeys = /* @__PURE__ */ new Set();
      const MARKET_SALES_PATH = /^\/jeu\/marche\/?$/;
      const MARKET_SALES_MARK = "data-aqm-market-sale";
      const AQM_MARKET_SORT_KEY = "aqm-market-sales-sort";
      const AQM_MARKET_SORTS = [
        ["searches-desc", "Recherchées ↓"],
        ["owned-desc", "Possédées ↓"],
        ["owned-asc", "Possédées ↑"],
        ["value-desc", "Valeur (estimée) ↓"],
        ["value-asc", "Valeur (estimée) ↑"],
        ["name-asc", "Alphabétique A → Z"],
        ["name-desc", "Alphabétique Z → A"]
      ];
      let aqmMarketSort = readMarketSort();
      let marketSortMenu = null;
      function readMarketSales() {
        for (const [kind, target] of [
          ["listings", marketListingKeys],
          ["auctions", marketAuctionKeys]
        ]) {
          try {
            const keys = JSON.parse(document.documentElement.getAttribute(`data-aqm-market-sales-${kind}`) ?? "[]");
            target.clear();
            for (const key of keys) if (typeof key === "string") target.add(key);
          } catch {
          }
        }
        marketSalesKeys = /* @__PURE__ */ new Set([...marketListingKeys, ...marketAuctionKeys]);
      }
      function cardSaleKey(tile) {
        const link = tile.querySelector('a[href^="/jeu/marche/"]');
        return link?.getAttribute("href")?.split(/[?#]/)[0].split("/").pop() ?? null;
      }
      function readMarketSort() {
        try {
          const saved = JSON.parse(sessionStorage.getItem(AQM_MARKET_SORT_KEY) ?? "[]");
          return Array.isArray(saved) ? saved.filter((value, i) => AQM_MARKET_SORTS.some(([key]) => key === value) && saved.indexOf(value) === i) : [];
        } catch {
          return [];
        }
      }
      function cardNumber(card, re, fallback = 0) {
        const match = card.textContent.match(re);
        return match ? Number(match[1].replace(/[^\d]/g, "")) : fallback;
      }
      function cardSortValue(card, sort) {
        if (sort === "name-asc" || sort === "name-desc") {
          const label = card.querySelector("a[aria-label]")?.getAttribute("aria-label") ?? "";
          return label.split(/[:,]/, 1)[0].trim().toLocaleLowerCase("fr");
        }
        if (sort.startsWith("searches-")) {
          const match = [...card.querySelectorAll("[title]")].map((el) => el.getAttribute("title") ?? "").map((text) => text.match(/(\d[\d\s ]*)\s+joueurs?\s+la\s+cherche(?:nt)?/i)).find(Boolean);
          return match ? Number(match[1].replace(/[^\d]/g, "")) : 0;
        }
        if (sort === "owned-asc" || sort === "owned-desc") return cardNumber(card, /×\s*([\d\s ]+)/, 1);
        return cardNumber(card, /≈\s*([\d\s ]+)/);
      }
      function sortSalesCards(section) {
        const list = section.querySelector("ul");
        if (!list) return;
        const cards = [...list.children];
        const sentinel = [...list.parentElement?.children ?? []].find((child) => child !== list && child.matches('div[aria-hidden="true"]') && !child.childElementCount);
        if (sentinel) {
          sentinel.toggleAttribute("data-aqm-sentinel-up", aqmMarketSort.length > 0);
          list.parentElement.toggleAttribute("data-aqm-sentinel-box", aqmMarketSort.length > 0);
        }
        if (!aqmMarketSort.length) {
          for (const card of cards) if (card.style.order) card.style.removeProperty("order");
          return;
        }
        const ranked = cards.map((card, index) => ({ card, index }));
        ranked.sort((a, b) => {
          for (const sort of aqmMarketSort) {
            const aValue = cardSortValue(a.card, sort);
            const bValue = cardSortValue(b.card, sort);
            const difference = typeof aValue === "string" && typeof bValue === "string" ? aValue.localeCompare(bValue, "fr") : aValue - bValue;
            if (difference !== 0) return sort.endsWith("-desc") ? -difference : difference;
          }
          return a.index - b.index;
        });
        ranked.forEach(({ card }, i) => {
          if (card.style.order !== String(i)) card.style.order = String(i);
        });
      }
      function updateMarketSort(index, value) {
        aqmMarketSort = aqmMarketSort.filter((sort, i) => i !== index && sort !== value);
        if (value) aqmMarketSort.splice(Math.min(index, aqmMarketSort.length), 0, value);
        try {
          sessionStorage.setItem(AQM_MARKET_SORT_KEY, JSON.stringify(aqmMarketSort));
        } catch {
        }
        markSalesCards();
      }
      function closeMarketSortMenu() {
        if (!marketSortMenu) return;
        marketSortMenu.anchor?.setAttribute("aria-expanded", "false");
        marketSortMenu.remove();
        marketSortMenu = null;
      }
      const sortBase = (value) => value.replace(/-(asc|desc)$/, "");
      function openMarketSortMenu(anchor, index) {
        closeMarketSortMenu();
        const selected = new Set(aqmMarketSort.filter((_, i) => i !== index).map(sortBase));
        const choices = [...index < aqmMarketSort.length ? [["", "Aucun tri"]] : [], ...AQM_MARKET_SORTS.filter(([value]) => !selected.has(sortBase(value)))];
        marketSortMenu = h(
          "div",
          { class: "aqm-root aqm-menu aqm-market-sort-menu", role: "menu" },
          ...choices.map(
            ([value, label]) => h(
              "button",
              {
                type: "button",
                role: "menuitem",
                class: "aqm-menu-item",
                onclick: () => {
                  closeMarketSortMenu();
                  updateMarketSort(index, value);
                }
              },
              label
            )
          )
        );
        marketSortMenu.anchor = anchor;
        document.body.append(marketSortMenu);
        anchor.setAttribute("aria-expanded", "true");
        const r = anchor.getBoundingClientRect();
        const below = r.bottom + 8 + marketSortMenu.offsetHeight < innerHeight;
        marketSortMenu.style.top = `${below ? r.bottom + 8 : r.top - 8 - marketSortMenu.offsetHeight}px`;
        marketSortMenu.style.left = `${Math.max(8, Math.min(innerWidth - marketSortMenu.offsetWidth - 8, r.left))}px`;
      }
      function renderMarketSort(section) {
        const previousBox = section.querySelector(":scope > .aqm-market-sort");
        const max = new Set(AQM_MARKET_SORTS.map(([value]) => sortBase(value))).size;
        const count = Math.min(aqmMarketSort.length + 1, max);
        const signature = JSON.stringify(aqmMarketSort);
        if (previousBox?.dataset.aqmSortSignature === signature) return;
        const box = h(
          "div",
          { class: "aqm-root aqm-market-sort", "data-aqm-sort-signature": signature },
          h("strong", {}, "Trier par"),
          ...Array.from({ length: count }, (_, index) => {
            const current = aqmMarketSort[index];
            const label = AQM_MARKET_SORTS.find(([value]) => value === current)?.[1] ?? "Ajouter un tri";
            return h(
              "button",
              {
                type: "button",
                "aria-haspopup": "menu",
                "aria-expanded": "false",
                "aria-pressed": String(!!current),
                class: `aqm-market-sort-button${current ? " is-on" : ""}`,
                onclick: (event) => openMarketSortMenu(event.currentTarget, index)
              },
              `${index + 1}. ${label}`
            );
          })
        );
        if (previousBox) previousBox.replaceWith(box);
        else section.firstElementChild ? section.firstElementChild.after(box) : section.append(box);
      }
      function markSalesCards() {
        if (!MARKET_SALES_PATH.test(location.pathname)) return;
        readMarketSales();
        const section = document.querySelector('section[aria-labelledby="sales-cards"]');
        if (!section) return;
        renderMarketSort(section);
        sortSalesCards(section);
        for (const card of section.querySelectorAll("ul > li")) {
          const old = card.querySelector(`[${MARKET_SALES_MARK}]`);
          if (!marketSalesKeys.has(cardSaleKey(card))) {
            old?.remove();
            continue;
          }
          if (old) continue;
          const status = card.querySelector("p.truncate");
          if (!status) continue;
          status.append(h("span", { class: "aqm-root aqm-market-sale", title: "Déjà en vente (au marché ou en enchère)", [MARKET_SALES_MARK]: "" }, "Déjà en vente"));
        }
      }
      const SELL_CARD = /^vendre une carte$/i;
      let unlisting = false;
      function markUnlistButton() {
        if (!location.pathname.startsWith("/jeu")) return;
        const sell = [...document.querySelectorAll("button, a")].find((b) => !b.closest(".aqm-root") && SELL_CARD.test(b.textContent.trim()));
        if (!sell || sell.parentElement.querySelector(":scope > .aqm-unlist")) return;
        const btn = h("button", { type: "button", class: `${sell.className} aqm-unlist`, onclick: () => unlistAll(btn) }, "Retirer mes ventes");
        sell.after(btn);
      }
      async function unlistAll(btn) {
        if (unlisting) return;
        const sales = (n) => `${n} vente${n > 1 ? "s" : ""}`;
        let listings;
        try {
          listings = ((await gameWrite("/market/listings?mine=1", "GET"))?.listings ?? []).filter((l) => l?.id);
        } catch (e) {
          return void askDialog("Retirer mes ventes", `Le jeu n’a pas donné tes ventes : ${e.message}`);
        }
        if (!listings.length) return void askDialog("Retirer mes ventes", "Tu n’as aucune vente à prix fixe en cours.");
        const waiting = (await readList(SALES_WAITING)).length + ((await readSales())?.items.length ?? 0);
        const also = waiting ? `

La file d’attente d’Aquaman (${nCopies(waiting)}) est mise en pause le temps du retrait, puis réactivée.` : "";
        if (!await askDialog("Retirer mes ventes", `Retirer tes ${sales(listings.length)} à prix fixe ? Les cartes redeviennent libres.${also}`, "Retirer", "Annuler")) return;
        unlisting = true;
        const label = btn.textContent;
        let done = 0;
        let failed = null;
        try {
          await chrome.storage.local.set({ [SALES_PAUSED]: Date.now() + 15 * 6e4 });
          await stopSales();
          let gap = 600;
          for (const l of listings) {
            if (stopped) break;
            btn.textContent = `Retrait… ${done}/${listings.length}`;
            for (let tries = 0; ; tries++) {
              try {
                await gameWrite(`/market/orders/${encodeURIComponent(l.id)}`, "DELETE");
                done++;
                break;
              } catch (e) {
                if (e.slowDown && tries < 5) {
                  gap = Math.min(4e3, gap * 1.5);
                  await pause(slowWait(e));
                  continue;
                }
                failed = e.message;
                break;
              }
            }
            await pause(gap);
          }
        } finally {
          try {
            await chrome.storage.local.remove(SALES_PAUSED);
          } catch {
          }
          unlisting = false;
        }
        send({ type: "collection-stale" });
        btn.textContent = `✅ ${sales(done)} retirée${done > 1 ? "s" : ""}`;
        if (failed) await askDialog("Retirer mes ventes", `${sales(listings.length - done)} non retirée${listings.length - done > 1 ? "s" : ""} : « ${failed} ».`);
        setTimeout(() => done ? location.reload() : btn.textContent = label, failed ? 0 : 1200);
      }
      function addPlusTab() {
        for (const link of document.querySelectorAll('a[data-tour="nav-/jeu/marche"], a[href="/jeu/marche"]')) {
          if (link.closest(".aqm-root")) continue;
          const last = [...link.parentElement.children].filter((el) => el.tagName === "A").pop() ?? link;
          const placed = link.parentElement.querySelector(":scope > .aqm-plus");
          if (placed) {
            if (placed.previousElementSibling !== last) last.after(placed);
            continue;
          }
          const btn = h("button", {
            type: "button",
            class: link.className,
            "aria-haspopup": "menu",
            "aria-expanded": "false",
            onclick: (e) => {
              e.preventDefault();
              menu ? closeMenu() : openMenu(btn);
            }
          });
          btn.classList.remove("text-white");
          btn.classList.add("aqm-plus", "text-zinc-400", "hover:text-white");
          const icon = h("span", { class: "aqm-nav-ico", html: ICON_DOTS });
          const iconClass = link.querySelector("svg")?.getAttribute("class");
          if (iconClass) icon.firstChild.setAttribute("class", iconClass);
          const text = [...link.querySelectorAll("span")].find((s) => !s.children.length && s.textContent.trim());
          btn.append(icon, h("span", { class: text?.className || null }, "Plus"));
          last.after(btn);
        }
      }
      let menu = null;
      function openMenu(anchor) {
        closeMenu();
        const item = (title, text, icon, open) => h(
          "button",
          {
            type: "button",
            role: "menuitem",
            class: "aqm-menu-item",
            onclick: () => {
              closeMenu();
              open();
            }
          },
          h("span", { class: "aqm-menu-ico", html: icon }),
          h("span", {}, h("strong", {}, title), h("small", {}, text))
        );
        menu = h(
          "div",
          { class: "aqm-root aqm-menu", role: "menu" },
          item("Boosters rentables", "Prix, taux de drop, persos et séries", ICON_PACK, openBoosters),
          item("Qui a cette carte ?", "Ceux qui l’ont, la vendent ou l’ont tirée", ICON_SEARCH, openWhoHas),
          item("Séries favorites", "Tes séries et leurs persos manquants", ICON_STAR, openFavorites),
          item("Ma progression", "Ta collection, par rareté et jour par jour", ICON_CHART, openCollectionStats),
          item("Visite guidée", "Le tour de ce qu’ajoute Aquaman", ICON_COMPASS, () => startTour(0)),
          item("Nouveautés", "Ce qui a changé dans Aquaman", ICON_SPARK, () => openNews()),
          item("Réglages", "Activer ou couper chaque fonction d’Aquaman", ICON_GEAR, openSettings),
          meId === AUTHOR_ID ? item("Joueurs avec Aquaman", "Réservé à l’auteur", ICON_TROPHY, openUsers) : null,
          meId === AUTHOR_ID ? item("Scanner les packs", "Publier le design de chaque booster", ICON_PACK, startScan) : null
        );
        menu.anchor = anchor;
        document.body.append(menu);
        anchor.setAttribute("aria-expanded", "true");
        const r = anchor.getBoundingClientRect();
        const below = r.bottom + 8 + menu.offsetHeight < innerHeight;
        menu.style.top = `${below ? r.bottom + 8 : r.top - 8 - menu.offsetHeight}px`;
        menu.style.left = `${Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.left + r.width / 2 - menu.offsetWidth / 2))}px`;
      }
      let settingsOpen = false;
      async function openSettings() {
        const body = openOverlay("Réglages", `Aquaman ${chrome.runtime.getManifest().version} · ${owner === "userscript" ? "script" : "extension"} · les mêmes réglages sur PC et téléphone`);
        body.parentElement.classList.add("aqm-panel-wide");
        let r;
        try {
          r = await ask({ type: "settings" });
        } catch (e) {
          body.append(h("p", { class: "aqm-note" }, e.message));
          return;
        }
        const values = { ...r.values };
        const before = JSON.stringify(values);
        const row = ([key, title, hint, only]) => {
          const away = only === "extension" && owner === "userscript";
          const box = h("input", { type: "checkbox", role: "switch", class: "aqm-toggle", disabled: away, "aria-label": title });
          box.checked = !away && !!values[key];
          box.addEventListener("change", () => {
            values[key] = box.checked;
            ask({ type: "set-settings", patch: { [key]: box.checked } }).catch(() => {
            });
          });
          return h(
            "label",
            { class: `aqm-setting${away ? " is-off" : ""}` },
            h("span", { class: "aqm-setting-text" }, h("strong", {}, title), h("small", {}, away ? `${hint} · extension sur PC seulement` : hint)),
            box
          );
        };
        body.append(
          h(
            "div",
            { class: "aqm-settings-groups" },
            r.groups.map(
              (group) => h("section", { class: "aqm-settings-group" }, h("p", { class: "aqm-settings-title" }, h("span", { "aria-hidden": "true" }, group.icon ?? ""), group.title), group.items.map(row))
            )
          ),
          h(
            "div",
            { class: "aqm-settings-foot" },
            h("p", {}, "Un changement s’applique à la fermeture de cette fenêtre : la page se recharge."),
            h("div", { class: "aqm-settings-actions" }, h("button", { type: "button", class: "aqm-tour-btn", onclick: () => openNews() }, "Nouveautés"), h("button", { type: "button", class: "aqm-tour-btn is-main", onclick: () => startTour(0) }, "Visite guidée"))
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
        menu.anchor?.setAttribute("aria-expanded", "false");
        menu.remove();
        menu = null;
      }
      let overlay = null;
      function openOverlay(title, subtitle) {
        closeOverlay();
        overlayClosed = null;
        const body = h("div", { class: "aqm-body" });
        const panel = h(
          "div",
          { class: "aqm-panel", role: "dialog", "aria-modal": "true", "aria-label": title },
          h(
            "div",
            { class: "aqm-head" },
            h("div", {}, h("h2", { class: "aqm-title" }, title), subtitle ? h("p", { class: "aqm-sub" }, subtitle) : null),
            h("button", { type: "button", class: "aqm-close", "aria-label": "Fermer", html: ICON_X, onclick: closeOverlay })
          ),
          body
        );
        overlay = h("div", { class: "aqm-root aqm-overlay", onclick: (e) => e.target === e.currentTarget && closeOverlay() }, panel);
        document.body.append(overlay);
        root.classList.add("aqm-lock");
        panel.querySelector(".aqm-close").focus();
        return body;
      }
      function closeOverlay() {
        if (!overlay) return;
        overlay.remove();
        overlay = null;
        root.classList.remove("aqm-lock");
        const then = overlayClosed;
        overlayClosed = null;
        then?.();
      }
      let overlayClosed = null;
      function askDialog(title, text, ok = "OK", cancel = null) {
        return new Promise((resolve) => {
          const body = openOverlay(title);
          body.closest(".aqm-panel")?.classList.add("is-ask");
          let answer2 = false;
          overlayClosed = () => resolve(answer2);
          const pick = (value) => {
            answer2 = value;
            closeOverlay();
          };
          body.append(
            ...text.split("\n\n").map((p) => h("p", { class: "aqm-ask-text" }, p)),
            h(
              "div",
              { class: "aqm-ask-actions" },
              cancel ? h("button", { type: "button", class: "aqm-queue-btn", onclick: () => pick(false) }, cancel) : null,
              h("button", { type: "button", class: "aqm-queue-btn is-main", onclick: () => pick(true) }, ok)
            )
          );
          body.querySelector(".aqm-ask-actions .is-main").focus();
        });
      }
      const chips = (options, current, onPick) => h(
        "div",
        { class: "aqm-chips", role: "tablist" },
        options.map(
          ([value, label]) => h("button", { type: "button", role: "tab", class: `aqm-chip${value === current ? " is-on" : ""}`, "aria-selected": String(value === current), onclick: () => onPick(value) }, label)
        )
      );
      const BOARD_SCOPE_KEY = "aqm-board-scope";
      const BOARD_SORT_KEY = "aqm-board-sort";
      const stored = (key, ok, fallback) => {
        try {
          const v = sessionStorage.getItem(key);
          return ok.includes(v) ? v : fallback;
        } catch {
          return fallback;
        }
      };
      let boardScope = stored(BOARD_SCOPE_KEY, ["all", "friends"], "all");
      let boardSort = stored(BOARD_SORT_KEY, ["points", "cards", "series"], "points");
      const sortNow = () => boardScope === "all" && boardSort === "series" ? "points" : boardSort;
      const SORT_UNIT = {
        points: ["point", "points", "pts"],
        cards: ["carte", "cartes", "cartes"],
        series: ["série complète", "séries complètes", "séries"]
      };
      const unitOf = (n, sort = sortNow()) => SORT_UNIT[sort][n > 1 ? 1 : 0];
      const saveChoice = (key, v) => {
        try {
          sessionStorage.setItem(key, v);
        } catch {
        }
      };
      const ROW_MODEL = 'section[aria-labelledby="top-title"] li[data-row]:not([data-me])';
      const PODIUM_MODEL = 'section[aria-label="Podium"]';
      const STATUS_MODEL = 'section[aria-labelledby="ma-place"]';
      const GAME_SECTIONS = 'section[aria-label="Podium"], section[aria-labelledby="top-title"], section[aria-labelledby="ma-place"]';
      function markGameBoard() {
        if (location.pathname !== "/jeu/classement") return;
        const title = [...document.querySelectorAll("main h1")].find((el) => /classement/i.test(el.textContent));
        const header = title?.closest("header");
        if (!header || header.closest(".aqm-root")) return;
        let bar = header.nextElementSibling?.classList.contains("aqm-board-scope") ? header.nextElementSibling : null;
        if (!bar) {
          bar = h("div", { class: "aqm-root aqm-board-scope" });
          header.after(bar);
        }
        let box = bar.nextElementSibling?.classList.contains("aqm-friends-board") ? bar.nextElementSibling : null;
        if (!box) {
          box = h("section", { class: "aqm-root aqm-friends-board", "aria-label": "Classement des amis" });
          bar.after(box);
        }
        const ours = boardScope === "friends" || sortNow() !== "points";
        const shown = `${boardScope}|${sortNow()}`;
        if (bar.dataset.shown !== shown) {
          bar.dataset.shown = shown;
          const pick = (key, set) => (v) => {
            set(v);
            saveChoice(key, v);
            markGameBoard();
            box.repaint?.();
            if (boardScope === "all" && sortNow() === "points") requestAnimationFrame(() => dispatchEvent(new Event("resize")));
          };
          bar.replaceChildren(
            chips(
              [
                ["all", "Tous"],
                ["friends", "Amis"]
              ],
              boardScope,
              pick(BOARD_SCOPE_KEY, (v) => boardScope = v)
            ),
            h(
              "div",
              { class: "aqm-board-sort", "aria-label": "Ranger par" },
              h("span", { class: "aqm-muted" }, "Ranger par"),
              chips(
                [["points", "Points"], ["cards", "Cartes"], ...boardScope === "friends" ? [["series", "Séries complètes"]] : []],
                sortNow(),
                pick(BOARD_SORT_KEY, (v) => boardSort = v)
              )
            )
          );
        }
        box.hidden = !ours;
        for (const s of document.querySelectorAll(GAME_SECTIONS)) if (s.hasAttribute("data-aqm-board-off") !== ours) s.toggleAttribute("data-aqm-board-off", ours);
        if (ours && box.dataset.loaded !== boardScope) {
          box.dataset.loaded = boardScope;
          box.card?.remove();
          box.card = null;
          loadBoard(box, boardScope);
        }
        const card = box.card;
        if (card) {
          card.hidden = !ours;
          const status = document.querySelector(STATUS_MODEL);
          if (status && status.nextElementSibling !== card) status.after(card);
        }
        if (ours && box.repaint && !box.querySelector(".aqm-board-game") && document.querySelector(ROW_MODEL)) box.repaint();
      }
      const ME_LOOK = ["bg-gradient-to-r", "from-blue-500/[0.18]", "via-blue-500/[0.07]", "to-transparent", "hover:bg-blue-500/[0.06]"];
      const PLAIN_LOOK = ["bg-white/[0.025]", "hover:bg-white/[0.055]"];
      const ME_BAR = ["from-sky-400", "to-white"];
      const PLAIN_BAR = ["from-blue-600", "to-sky-400"];
      function statusCard(model, d) {
        const sec = bareCopy(model);
        sec.setAttribute("aria-labelledby", "aqm-ma-place");
        sec.classList.add("aqm-friends-status");
        const grid = [...sec.children].find((el) => el.tagName === "DIV");
        const [where, , chase] = grid?.children ?? [];
        const title = where?.querySelector("h2");
        if (title) {
          title.id = "aqm-ma-place";
          const badge = title.querySelector("span");
          if (badge) badge.textContent = d.place === 1 ? "N°1" : d.place <= 3 ? "Podium" : d.badge;
        }
        const [, big, among] = where?.children ?? [];
        const num = big?.querySelector("span");
        if (num) num.textContent = fmt(d.place);
        const sup = big?.querySelector("sup");
        if (sup) sup.textContent = d.place === 1 ? "er" : "e";
        if (among) among.textContent = d.among;
        const text = chase?.querySelector("p");
        if (text) {
          const strong = (t) => h("span", { class: "font-bold text-white" }, t);
          if (!d.target) text.replaceChildren(`${d.first}${d.lead > 0 ? ", avec " : "."}`, ...d.lead > 0 ? [strong(`${fmt(d.lead)} ${unitOf(d.lead)}`), " d’avance sur le 2e."] : []);
          else text.replaceChildren("Plus que ", strong(`${fmt(d.gap)} ${unitOf(d.gap)}`), " pour dépasser ", strong(d.target.name), ` (${d.target.place}e)`, d.need ? `, soit environ ${d.need}.` : ".");
        }
        const jump = chase?.querySelector("button");
        if (jump) {
          jump.replaceWith(jump.cloneNode(true));
          chase.querySelector("button").addEventListener("click", () => document.querySelector(".aqm-friends-board [data-aqm-me], .aqm-friends-podium")?.scrollIntoView({ behavior: "smooth", block: "center" }));
        }
        return sec;
      }
      function cardsFor(gap, points) {
        for (const code of ["N", "R", "SR", "SSR", "UR", "SEC"]) {
          const per = Number(points?.[code]);
          if (!per) continue;
          const n = Math.ceil(gap / per);
          if (n <= 5) return `${n} nouvelle${n > 1 ? "s" : ""} ${code}`;
        }
        const ur = Number(points?.UR);
        return ur ? `${Math.ceil(gap / ur)} nouvelles UR` : null;
      }
      function bareCopy(model) {
        const copy = model.cloneNode(true);
        for (const el of [copy, ...copy.querySelectorAll("*")]) {
          el.removeAttribute("style");
          for (const a of [...el.attributes]) if (a.name.startsWith("data-")) el.removeAttribute(a.name);
        }
        return copy;
      }
      const TOI_CLASS = "shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-200";
      function gamePodium(model, spots) {
        const sec = bareCopy(model);
        sec.setAttribute("aria-label", "Podium des amis");
        sec.classList.add("aqm-friends-podium");
        const places = [...sec.querySelector("ol")?.children ?? []];
        spots.forEach((d, i) => {
          const li = places[i];
          if (!li) return;
          const [spot, head] = li.children;
          const card = [...spot?.children ?? []].find((el) => !el.classList.contains("absolute"));
          const look = "display:block;width:100%;aspect-ratio:63/88;border-radius:1rem;object-fit:cover";
          const art = d.card?.image ? h("img", { src: cardImageUrl(d.card.image), alt: d.card.name ?? "", title: d.card.name ? `Carte de ${d.name} : ${d.card.name}` : null, loading: "lazy", style: look }) : h("div", { class: "aspect-[63/88] rounded-[1rem] bg-white/[0.04]", style: look });
          card ? card.replaceWith(art) : spot?.append(art);
          if (head?.tagName === "A") head.setAttribute("href", `/profile/${encodeURIComponent(d.id)}`);
          if (!head) return;
          head.title = d.title;
          const [sr, who, score] = head.children;
          if (sr?.classList.contains("sr-only")) sr.textContent = `${i + 1}e : `;
          const img = who?.querySelector("img");
          if (img) {
            img.removeAttribute("srcset");
            img.src = avatarUrl(d.id);
          }
          const name = who?.lastElementChild;
          if (name) name.textContent = d.name;
          if (score?.firstElementChild) score.firstElementChild.textContent = d.score;
          setUnit(score, d.unit);
          [...head.children].slice(3).forEach((el) => el.remove());
          if (d.me) head.append(h("span", { class: "mt-2" }, h("span", { class: TOI_CLASS }, "Toi")));
        });
        return sec;
      }
      function gameRow(model, d) {
        const li = bareCopy(model);
        li.classList.add("aqm-friend-row");
        if (d.me) li.setAttribute("data-aqm-me", "");
        const a = li.querySelector("a") ?? li;
        if (a.tagName === "A") a.setAttribute("href", `/profile/${encodeURIComponent(d.id)}`);
        a.classList.remove(...d.me ? PLAIN_LOOK : ME_LOOK);
        a.classList.add(...d.me ? ME_LOOK : PLAIN_LOOK);
        a.title = d.title;
        const [place, avatar, main, stats, score] = a.children;
        if (place) place.replaceChildren(...[...place.children].filter((el) => el.classList.contains("sr-only")), d.place);
        const img = avatar?.querySelector("img") ?? (avatar?.tagName === "IMG" ? avatar : null);
        if (img) {
          img.removeAttribute("srcset");
          img.src = avatarUrl(d.id);
          img.alt = "";
        } else if (avatar) avatar.replaceChildren(h("img", { src: avatarUrl(d.id), alt: "", style: "width:100%;height:100%;object-fit:cover;border-radius:inherit" }));
        const nameRow = main?.firstElementChild;
        const name = nameRow?.firstElementChild;
        if (name) {
          name.textContent = d.name;
          nameRow.replaceChildren(name);
          if (d.me) nameRow.append(h("span", { class: TOI_CLASS }, "Toi"));
        }
        const bar = main?.lastElementChild?.firstElementChild;
        if (bar) {
          bar.style.width = `${d.width.toFixed(1)}%`;
          bar.classList.remove(...d.me ? PLAIN_BAR : ME_BAR);
          bar.classList.add(...d.me ? ME_BAR : PLAIN_BAR);
        }
        if (stats) stats.replaceChildren(...d.lines.flatMap((t, i) => i ? [document.createElement("br"), t] : [t]));
        const value = score?.firstElementChild;
        if (value) value.textContent = d.score;
        setUnit(score, d.unit);
        return li;
      }
      function setUnit(score, unit) {
        if (!score || !unit) return;
        const label = [...score.querySelectorAll("*")].find((el) => !el.children.length && /^\s*pts?\s*$/i.test(el.textContent));
        if (label) label.textContent = unit;
        else {
          const node = [...score.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && /pts?/i.test(n.textContent));
          if (node) node.textContent = node.textContent.replace(/pts?/i, unit);
        }
      }
      let gameBoard = null;
      function readGameBoard(force) {
        if (force || !gameBoard || Date.now() - gameBoard.at > 12e4) gameBoard = { at: Date.now(), read: gameWrite("/leaderboard", "GET") };
        return gameBoard.read;
      }
      async function loadBoard(box, scope, force = false) {
        const id = box.loadId = (box.loadId ?? 0) + 1;
        const current = () => box.isConnected && box.loadId === id;
        box.repaint = null;
        const friends2 = scope === "friends";
        const status = h("p", { class: "aqm-muted aqm-friends-note" }, friends2 ? "Chargement de tes amis…" : "Chargement du classement…");
        const podium = h("div", { class: "aqm-friends-podium-box" });
        const list = h("ol", { class: "aqm-board" });
        const foot = h("div", { class: "aqm-board-refresh" });
        box.replaceChildren(status, podium, list, foot);
        let board;
        let mates = null;
        try {
          [board, mates] = await Promise.all([readGameBoard(force), friends2 ? ask({ type: "friends" }) : null]);
        } catch (e) {
          if (current()) status.textContent = `Classement indisponible (${e.message}).`;
          return;
        }
        if (!current()) return;
        const points = board?.points ?? {};
        const topList = Array.isArray(board?.top) ? board.top : [];
        const top = new Map(topList.map((e) => [e?.player?.id, e]));
        const myId2 = friends2 ? mates.me : board?.me?.player?.id ?? null;
        const meEntry = board?.me?.player?.id && board.me.player.id === myId2 ? board.me : null;
        const people = friends2 ? [{ id: mates.me, me: true }, ...mates.friends] : [...topList.map((e) => ({ id: e?.player?.id, name: e?.player?.name })), ...meEntry && !top.has(myId2) ? [{ id: myId2 }] : []].filter((p) => p.id).map((p) => ({ ...p, me: p.id === myId2 }));
        const rows = people.map((p) => {
          const official = top.get(p.id) ?? (p.me ? meEntry : null);
          return { ...p, name: official?.player?.name ?? p.name, image: official?.player?.image ?? null, official, state: official?.score != null ? "ok" : "loading" };
        });
        const note = () => {
          if (!friends2) return `Le top 100 du jeu${meEntry && !top.has(myId2) ? " et toi" : ""}, rangé par nombre de cartes.`;
          if (mates.friendsError) return `Liste d'amis indisponible (${mates.friendsError}).`;
          if (!mates.friends.length) return "Tu n'as pas encore d'amis dans le jeu : ajoute-en depuis leur profil pour te comparer à eux.";
          const what = { points: "les points du classement du jeu", cards: "rangés par nombre de cartes", series: "rangés par séries complètes (badge récupéré)" }[sortNow()];
          return `${mates.friends.length} ami${mates.friends.length > 1 ? "s" : ""} · ${what}.`;
        };
        let rareSet = null;
        let exact = false;
        const calibrate = (by) => {
          if (!meEntry || !by) return;
          rareSet = [["UR", "SEC"], ["SSR", "UR", "SEC"], ["SR", "SSR", "UR", "SEC"]].find((set) => set.reduce((n, r) => n + (by[r] ?? 0), 0) === meEntry.rare) ?? null;
          exact = scoreOf(by) === meEntry.score;
        };
        const scoreOf = (by) => Object.entries(by ?? {}).reduce((n, [r, c]) => n + (Number(points[r]) || 0) * c, 0);
        const apply = (row, p) => {
          row.best = p.best ?? row.best ?? null;
          if (!p.private && Number.isFinite(p.albums)) row.albums = p.albums;
          if (row.official) {
            if (p.private) row.albumsHidden = true;
            return;
          }
          if (p.private) row.state = "private";
          else if (!p.byRarity) row.state = "error";
          else Object.assign(row, { state: "ok", score: scoreOf(p.byRarity), cards: Object.values(p.byRarity).reduce((a, b) => a + b, 0), by: p.byRarity });
        };
        let frame = 0;
        const later = () => frame || (frame = requestAnimationFrame(() => (frame = 0, paint())));
        const paint = () => {
          if (!current()) return;
          const sort = sortNow();
          status.textContent = note();
          const pointsOf = (r) => r.state !== "ok" ? null : r.official ? r.official.score : r.score;
          const cardsOf = (r) => r.state !== "ok" ? null : r.official ? r.official.cards : r.cards;
          const rareOf = (r) => r.official ? r.official.rare : rareSet && r.by ? rareSet.reduce((n, k) => n + (r.by[k] ?? 0), 0) : null;
          const value = (r) => sort === "cards" ? cardsOf(r) : sort === "series" ? r.state === "ok" && Number.isFinite(r.albums) ? r.albums : null : pointsOf(r);
          const has = (r) => value(r) != null;
          const sorted = [...rows].sort((a, b) => has(b) - has(a) || (value(b) ?? 0) - (value(a) ?? 0) || (pointsOf(b) ?? -1) - (pointsOf(a) ?? -1) || String(a.name).localeCompare(String(b.name)));
          const leader = Math.max(1, ...sorted.map((r) => value(r) ?? 0));
          const approx = (r) => sort === "points" && !r.official && !exact;
          const valueText = (r) => `${approx(r) ? "≈ " : ""}${fmt(value(r))}`;
          const titleOf = (r) => sort === "series" ? "Séries complètes : les albums dont le badge est récupéré" : r.official ? sort === "cards" ? "Cartes du classement du jeu" : "Score du classement du jeu" : sort === "cards" ? "Cartes différentes, lues dans sa collection" : exact ? "Calculé depuis sa collection, avec le barème du jeu" : "Calculé depuis sa collection, avec le barème du jeu (peut différer un peu du jeu)";
          const linesOf = (r) => {
            const rare = rareOf(r);
            return [
              r.official?.rank ? `${fmt(r.official.rank)}e du jeu` : "hors du top 100",
              sort !== "points" ? `${pointsOf(r) != null && !r.official && !exact ? "≈ " : ""}${fmt(pointsOf(r))} pts` : null,
              sort !== "cards" ? `${fmt(cardsOf(r))} cartes` : null,
              sort !== "series" && friends2 && Number.isFinite(r.albums) ? `${fmt(r.albums)} séries` : null,
              sort === "points" && rare != null ? `${fmt(rare)} rares` : null
            ].filter(Boolean);
          };
          const waiting = (r) => r.state === "private" ? "Collection privée" : r.state === "error" ? "Collection indisponible" : r.albumsHidden ? "Collection privée" : "Lecture…";
          const model = document.querySelector(ROW_MODEL);
          const podiumModel = document.querySelector(PODIUM_MODEL);
          list.className = model ? `${model.parentElement.className} aqm-board-game` : "aqm-board";
          const ranked = sorted.filter(has);
          const onPodium = model && podiumModel && ranked.length >= 3 ? ranked.slice(0, 3) : [];
          podium.replaceChildren(
            ...onPodium.length ? [
              gamePodium(
                podiumModel,
                onPodium.map((r) => ({ id: r.id, me: !!r.me, name: r.name || "Joueur", score: valueText(r), unit: SORT_UNIT[sort][2], title: titleOf(r), card: r.official?.best?.card ?? r.best ?? null }))
              )
            ] : []
          );
          let place = onPodium.length;
          const statusModel = document.querySelector(STATUS_MODEL);
          const mine = ranked.findIndex((r) => r.me);
          if (statusModel && mine >= 0) {
            const above = ranked[mine - 1];
            const gap = above ? value(above) - value(ranked[mine]) + 1 : 0;
            const card = statusCard(statusModel, {
              place: mine + 1,
              badge: friends2 ? "Amis" : "Cartes",
              among: friends2 ? `sur ${fmt(ranked.length)} avec tes amis` : `sur ${fmt(ranked.length)}, en cartes`,
              first: friends2 ? { points: "Tu as la plus belle collection de tes amis", cards: "Tu as le plus de cartes de tes amis", series: "Tu as le plus de séries complètes de tes amis" }[sort] : "Tu as le plus de cartes du top 100",
              target: above ? { name: above.name || "Joueur", place: mine } : null,
              gap,
              need: above && sort === "points" ? cardsFor(gap, points) : null,
              lead: ranked[1] && mine === 0 ? value(ranked[0]) - value(ranked[1]) : 0
            });
            card.hidden = box.hidden;
            box.card?.remove();
            box.card = card;
            statusModel.after(card);
          }
          if (model) {
            list.replaceChildren(
              ...sorted.filter((r) => !onPodium.includes(r)).map((r) => {
                const ok = has(r);
                if (ok) place++;
                return gameRow(model, {
                  id: r.id,
                  me: !!r.me,
                  place: ok ? String(place) : "–",
                  name: r.name || "Joueur",
                  width: ok ? Math.min(100, Math.max(1.5, 100 * value(r) / leader)) : 0,
                  lines: ok ? linesOf(r) : [waiting(r)],
                  score: ok ? valueText(r) : "–",
                  unit: SORT_UNIT[sort][2],
                  title: titleOf(r)
                });
              })
            );
          } else
            list.replaceChildren(
              ...sorted.map((r) => {
                const ok = has(r);
                if (ok) place++;
                return h(
                  "li",
                  { class: `aqm-row${r.me ? " is-me" : ""}`, ...r.me ? { "data-aqm-me": "" } : {} },
                  h("span", { class: `aqm-place aqm-place-${place}` }, ok ? String(place) : "–"),
                  h("img", { class: "aqm-avatar", src: r.image || avatarUrl(r.id), alt: "", loading: "lazy" }),
                  h(
                    "div",
                    { class: "aqm-friend-main" },
                    h("a", { class: "aqm-name", href: `/profile/${encodeURIComponent(r.id)}` }, r.name || "Joueur", r.me ? h("span", { class: "aqm-tag" }, "Toi") : null),
                    h("small", { class: "aqm-muted" }, ok ? linesOf(r).join(" · ") : waiting(r)),
                    ok ? h("span", { class: "aqm-bar" }, h("span", { style: `width:${(100 * value(r) / leader).toFixed(2)}%` })) : null
                  ),
                  h("div", { class: "aqm-friend-score", title: titleOf(r) }, ok ? h("strong", {}, valueText(r)) : null, ok ? h("small", {}, SORT_UNIT[sort][2]) : null)
                );
              })
            );
          const reading = rows.filter((r) => r.state === "loading" || friends2 && sort === "series" && r.state === "ok" && !Number.isFinite(r.albums) && !r.albumsHidden).length;
          foot.replaceChildren(
            h(
              "span",
              { class: "aqm-muted" },
              reading ? `Lecture de ${fmt(reading)} collection${reading > 1 ? "s" : ""}…` : friends2 ? "Les amis hors du top 100 : score calculé depuis leur collection." : "Le jeu ne donne que son top 100 : les joueurs plus loin n’y sont pas."
            ),
            h("button", { type: "button", class: "aqm-chip", disabled: reading ? true : null, onclick: () => loadBoard(box, scope, true) }, "Actualiser")
          );
        };
        box.repaint = later;
        paint();
        let known = { fresh: 36e5, players: {} };
        try {
          known = await ask({ type: "board-known" });
        } catch {
        }
        if (!current()) return;
        const usable = (p) => p && (p.private || p.byRarity && "best" in p && "albums" in p) && Date.now() - p.at < (known.fresh ?? 36e5);
        const todo = friends2 ? rows : [...rows].sort((a, b) => (b.official?.cards ?? 0) - (a.official?.cards ?? 0)).slice(0, 3).filter((r) => !r.official?.best?.card);
        for (const r of todo) {
          const p = known.players?.[r.id];
          if (!force && usable(p)) {
            if (r.me) calibrate(p.byRarity);
            apply(r, p);
          }
        }
        later();
        await eachLimited(
          todo.filter((r) => force || !usable(known.players?.[r.id])),
          4,
          async (row) => {
            if (!current()) return;
            try {
              const p = await ask({ type: "player", id: row.id, fresh: force });
              if (row.me) calibrate(p.byRarity);
              apply(row, p);
            } catch {
              if (row.state === "loading") row.state = "error";
            }
            later();
          }
        );
        later();
      }
      function packArt(b) {
        const art = b.types[0] && TYPE_NAMES[b.types[0]] ? `/game/boosters/${b.types[0]}.webp` : b.minRank >= 4 ? "/game/boosters/legendaire.webp" : null;
        return art ? h("img", { class: "aqm-pack", src: art, alt: "" }) : h("span", { class: "aqm-pack aqm-pack-plain" }, h("span", {}, "Booster"));
      }
      const rarityCode = (code) => h("span", { class: `aqm-rarity aqm-r-${code}` }, code);
      const perles = (n) => h("span", { class: "aqm-perles", html: ICON_PEARL }, fmt(n));
      const cardStrip = (items, sub) => h(
        "ul",
        { class: "aqm-strip" },
        items.map(
          (x) => h(
            "li",
            { class: `aqm-mini${x.own ? " is-owned" : ""}`, title: `${x.c.name} — ${x.c.series?.title ?? ""}` },
            h("img", { src: cardImageUrl(x.c.image), alt: "", loading: "lazy" }),
            h("div", {}, h("p", { class: "aqm-mini-name" }, rarityCode(x.c.rarity), " ", x.c.name), h("p", { class: "aqm-muted" }, sub(x)))
          )
        )
      );
      const GOALS = [
        ["collection", "Ma collection"],
        ["rarity", "Une rareté"],
        ["name", "Un personnage"],
        ["series", "Une série"],
        ["value", "La valeur"]
      ];
      const SORTS = {
        collection: { rate: ["Cartes nouvelles", "le plus de cartes que tu n’as pas"], price: ["Prix", "le moins de Perles par carte nouvelle"] },
        value: { rate: ["Rendement", "les cartes qui valent le plus"], price: ["Prix", "le booster le moins cher"] },
        other: { rate: ["Taux de drop", "la meilleure chance par booster"], price: ["Prix", "le moins de Perles dépensées"] }
      };
      const guaranteeOf = (b) => `${RARITY_NAMES[RANKED[b.minRank - 1]] ?? "Rare"} garantie`;
      const seriesOf = (b) => b.series.length ? b.series.slice(0, 2).map((s) => s.title).join(", ") + (b.series.length > 2 ? ` +${b.series.length - 2}` : "") : b.types.length ? `Cartes ${b.types.map((t) => TYPE_NAMES[t] || t).join(" et ")}` : "Toutes les séries";
      const oneIn = (p) => 1 / p < 10 ? dec(1 / p, 1) : fmt(1 / p);
      const boostersFor = (p) => p >= 0.95 ? "presque à chaque booster" : `≈ ${oneIn(p)} booster${1 / p >= 1.95 ? "s" : ""} à ouvrir en moyenne`;
      async function openBoosters() {
        const body = openOverlay("Quel booster ouvrir ?", "Les boosters en vente classés du plus rentable au moins rentable pour obtenir ce que tu cherches.");
        body.parentElement.classList.add("aqm-panel-wide");
        const status = h("p", { class: "aqm-note" }, "Chargement de la boutique…");
        body.append(status);
        let goal = "collection";
        let rarity = "UR";
        let query = "";
        let onlyNew = false;
        let sortBy = "rate";
        let report;
        try {
          report = await ask({ type: "boosters" });
        } catch (e) {
          status.textContent = e.message;
          return;
        }
        if (!report.rows.length || !report.rarities.length) {
          status.textContent = "La boutique ne propose aucun booster pour le moment.";
          return;
        }
        if (!report.rarities.some((r) => r.code === rarity)) rarity = report.rarities.at(-1).code;
        const rarityName = (code) => report.rarities.find((r) => r.code === code)?.name || RARITY_NAMES[code] || code;
        const goalRow = h("div", { class: "aqm-chips aqm-goals" });
        const pickRow = h("div", { class: "aqm-pick" });
        const sentence = h("div", { class: "aqm-sentence" });
        const sortRow = h("div", { class: "aqm-sorts" });
        const summary = h("div", { class: "aqm-verdict" });
        const list = h("ol", { class: "aqm-ranking" });
        const suggestions = h("ul", { class: "aqm-suggest", id: "aqm-suggest", role: "listbox", hidden: true });
        const search = h("input", { type: "search", class: "aqm-search", role: "combobox", "aria-controls": "aqm-suggest", "aria-expanded": "false", "aria-autocomplete": "list", autocomplete: "off" });
        const searchBox = h("div", { class: "aqm-suggest-box" }, search, suggestions);
        let picked = -1;
        let typing = false;
        const showSuggestions = (open) => {
          suggestions.hidden = !open || !suggestions.childElementCount;
          search.setAttribute("aria-expanded", String(!suggestions.hidden));
        };
        const pickSuggestion = (name) => {
          typing = false;
          search.value = name;
          clearTimeout(timer);
          query = name;
          showSuggestions(false);
          refresh();
        };
        const fillSuggestions = (list2) => {
          picked = -1;
          suggestions.replaceChildren(
            ...list2.map(
              (s, i) => h(
                "li",
                {
                  id: `aqm-suggest-${i}`,
                  class: "aqm-suggest-item",
                  "data-name": s.name,
                  role: "option",
                  "aria-selected": "false",
                  // (mousedown : avant que le champ ne perde le focus)
                  onmousedown: (e) => {
                    e.preventDefault();
                    pickSuggestion(s.name);
                  }
                },
                s.image ? h("img", { src: cardImageUrl(s.image), alt: "", loading: "lazy", decoding: "async" }) : h("span", { class: "aqm-suggest-blank" }),
                h("span", { class: "aqm-suggest-name" }, s.name, goal === "series" && s.cards ? h("small", {}, `${fmt(s.cards)} carte${s.cards > 1 ? "s" : ""}`) : null),
                goal === "series" ? null : h("span", { class: "aqm-suggest-rarities" }, (s.rarities ?? []).map((code) => rarityCode(code)))
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
          items.forEach((li, i) => li.setAttribute("aria-selected", String(i === picked)));
          items[picked].scrollIntoView({ block: "nearest" });
          search.setAttribute("aria-activedescendant", items[picked].id);
        };
        search.addEventListener("keydown", (e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            movePick(e.key === "ArrowDown" ? 1 : -1);
          } else if (e.key === "Enter" && picked >= 0 && !suggestions.hidden) {
            e.preventDefault();
            pickSuggestion(suggestions.children[picked].dataset.name);
          } else if (e.key === "Escape" && !suggestions.hidden) {
            e.stopPropagation();
            showSuggestions(false);
          }
        });
        search.addEventListener("focus", () => showSuggestions(typing && !!search.value.trim()));
        search.addEventListener("blur", () => showSuggestions(false));
        const how = h(
          "details",
          { class: "aqm-how" },
          h("summary", {}, "Comment sont calculés ces chiffres ?"),
          h(
            "ul",
            {},
            h("li", {}, "Un booster donne 5 cartes : 4 tirées avec les taux du jeu, et une 5e d’au moins la rareté garantie. Dans une rareté, chaque carte du booster a la même chance."),
            h("li", {}, "« ≈ 11 boosters à ouvrir en moyenne » et « 1 sur 11 » : l’inverse de la chance par booster. « ≈ 6 594 en moyenne » : le prix du booster multiplié par ce nombre."),
            h("li", {}, "Valeur : le prix au marché de chaque carte, pris sur les exemplaires vus dans ta collection", report.friends ? " et celles de tes amis" : "", ". Une carte jamais vue prend la valeur moyenne de sa rareté."),
            h("li", {}, "La garantie anti-malchance (une SSR tous les 60 boosters, une UR tous les 190) n’est pas comptée : les vraies chances sont un peu meilleures."),
            report.catalog ? null : h("li", {}, "Le catalogue complet du jeu est indisponible : les chances par personnage et par série ne peuvent pas être calculées."),
            h("li", {}, "Ce sont des moyennes : un booster reste un tirage au sort.")
          )
        );
        status.remove();
        body.append(goalRow, pickRow, sentence, sortRow, summary, list, how);
        let asked = 0;
        let timer = 0;
        async function refresh() {
          const n = ++asked;
          const field = goal === "name" || goal === "series" ? goal : "";
          try {
            const next = await ask({ type: "boosters", query: field ? query : "", field });
            if (n !== asked) return;
            report = next;
            fillSuggestions(report.suggestions ?? []);
            render();
          } catch {
          }
        }
        search.addEventListener("input", () => {
          typing = true;
          clearTimeout(timer);
          timer = setTimeout(() => {
            query = search.value.trim();
            refresh();
          }, 250);
        });
        function measure({ b, a }) {
          const target = goal === "rarity" ? `une ${rarityName(rarity)}${onlyNew ? " que tu n’as pas" : ""}` : `« ${query} »${onlyNew ? " (une carte que tu n’as pas)" : ""}`;
          if (goal === "collection") {
            return {
              rate: a.fresh,
              cost: a.perFresh,
              head: `≈ ${dec(a.fresh, 1)} carte${a.fresh >= 2 ? "s" : ""} nouvelle${a.fresh >= 2 ? "s" : ""} par booster`,
              sub: `${pct(a.freshChance)} de chance d’en avoir au moins une`,
              big: a.perFresh == null ? "—" : h("span", {}, perles(a.perFresh)),
              bigSub: "par carte nouvelle"
            };
          }
          if (goal === "value") {
            return {
              rate: a.ratio,
              cost: b.price,
              head: a.ratio >= 1 ? `Tes cartes valent ×${dec(a.ratio)} le prix du booster` : `Tes cartes valent ${pct(a.ratio)} du prix du booster`,
              sub: h("span", {}, "≈ ", perles(a.ev), " de cartes par booster, au prix du marché"),
              big: `×${dec(a.ratio)}`,
              bigSub: h("span", {}, "≈ ", perles(a.ev), " de cartes")
            };
          }
          const p = goal === "rarity" ? (onlyNew ? a.odds[rarity]?.freshChance : a.odds[rarity]?.chance) ?? 0 : (onlyNew ? a.targetNewChance : a.targetChance) ?? 0;
          return {
            rate: p,
            cost: p > 0 ? b.price / p : null,
            head: p > 0 ? `${boostersFor(p)} pour avoir ${target}` : `Ne peut pas te donner ${target}`,
            sub: `${pct(p)} de chance à chaque booster`,
            big: p > 0 ? `1 sur ${oneIn(Math.min(1, p))}` : "—",
            bigSub: p > 0 ? h("span", {}, "≈ ", perles(b.price / p), " en moyenne") : ""
          };
        }
        function moreOf({ b, a }) {
          const odds = h(
            "ul",
            { class: "aqm-odds-grid" },
            report.rarities.filter((r) => a.odds[r.code]).map((r) => {
              const o = a.odds[r.code];
              return h("li", {}, rarityCode(r.code), h("strong", {}, pct(o.chance)), h("small", {}, `nouvelle : ${pct(o.freshChance)}`));
            })
          );
          const pool = b.pool?.cards ? b.pool.missing ? `${fmt(b.pool.cards)} cartes possibles, dont ${fmt(b.pool.missing)} que tu n’as pas encore (${pct(b.pool.missing / b.pool.cards)}).` : `${fmt(b.pool.cards)} cartes possibles : tu les as toutes.` : null;
          const cards = (goal === "name" || goal === "series") && a.targets.length ? [h("p", { class: "aqm-label" }, `Cartes de « ${query} » dans ce booster`), cardStrip(a.targets.slice(0, 4), (x) => `${pct(x.chance)} par booster${x.own ? ` · tu l’as (${x.own})` : " · tu ne l’as pas"}`)] : a.best.length ? [h("p", { class: "aqm-label" }, "Les cartes les plus chères qui te manquent"), cardStrip(a.best, (x) => h("span", {}, x.v ? h("span", {}, "≈ ", perles(x.v), " · ") : "", `${pct(x.chance)} par booster`))] : [];
          return h(
            "details",
            { class: "aqm-rank-more" },
            h("summary", {}, "Détails"),
            h("p", { class: "aqm-label" }, "Chance d’avoir au moins une carte de chaque rareté"),
            odds,
            pool ? h("p", { class: "aqm-muted" }, pool) : null,
            b.series.length > 2 ? h("p", { class: "aqm-muted" }, `Séries : ${b.series.map((s) => s.title).join(", ")}.`) : null,
            ...cards
          );
        }
        function renderControls() {
          goalRow.replaceChildren(
            ...GOALS.map(
              ([value, label]) => h(
                "button",
                {
                  type: "button",
                  class: `aqm-chip aqm-goal${value === goal ? " is-on" : ""}`,
                  "aria-pressed": String(value === goal),
                  onclick: () => {
                    if (value === goal) return;
                    const typed = goal === "name" || goal === "series";
                    goal = value;
                    sortBy = "rate";
                    if (typed || goal === "name" || goal === "series") {
                      query = "";
                      search.value = "";
                      refresh();
                    }
                    render();
                  }
                },
                label
              )
            )
          );
          if (goal === "rarity")
            pickRow.replaceChildren(
              h(
                "div",
                { class: "aqm-chips" },
                report.rarities.map(
                  (r) => h(
                    "button",
                    {
                      type: "button",
                      class: `aqm-chip aqm-chip-r aqm-r-${r.code}${r.code === rarity ? " is-on" : ""}`,
                      "aria-pressed": String(r.code === rarity),
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
          else if (goal === "name" || goal === "series") {
            search.placeholder = goal === "name" ? "Nom d’un personnage…" : "Nom d’une série…";
            search.setAttribute("aria-label", search.placeholder);
            if (pickRow.firstChild !== searchBox) pickRow.replaceChildren(searchBox);
          } else pickRow.replaceChildren();
          const newChips = goal === "rarity" || goal === "name" || goal === "series" ? h(
            "div",
            { class: "aqm-chips aqm-new" },
            [
              [false, "Même celles que j’ai"],
              [true, "Seulement celles qui me manquent"]
            ].map(
              ([value, label]) => h(
                "button",
                {
                  type: "button",
                  class: `aqm-chip${value === onlyNew ? " is-on" : ""}`,
                  "aria-pressed": String(value === onlyNew),
                  onclick: () => {
                    onlyNew = value;
                    render();
                  }
                },
                label
              )
            )
          ) : null;
          const text = {
            collection: "Pour des cartes que tu n’as pas encore, de n’importe quelle rareté.",
            rarity: `Pour n’importe quelle carte ${rarityName(rarity)}${onlyNew ? " que tu n’as pas encore" : " (même une que tu as déjà)"}.`,
            name: query ? `Pour une carte de « ${query} »${onlyNew ? " que tu n’as pas encore" : " (même une que tu as déjà)"}.` : "Tape le nom d’un personnage pour savoir quel booster te donne le plus de chances de l’avoir.",
            series: query ? `Pour une carte de la série « ${query} »${onlyNew ? " que tu n’as pas encore" : " (même une que tu as déjà)"}.` : "Tape le nom d’une série pour savoir quel booster te donne le plus de ses cartes.",
            value: "Pour la valeur au marché des 5 cartes du booster."
          }[goal];
          sentence.replaceChildren(h("p", {}, text), newChips);
          const sorts = SORTS[goal] ?? SORTS.other;
          sortRow.replaceChildren(
            h("span", { class: "aqm-filter-name" }, "Classer par"),
            ...["price", "rate"].map(
              (key) => h(
                "button",
                {
                  type: "button",
                  class: `aqm-sort${key === sortBy ? " is-on" : ""}`,
                  "aria-pressed": String(key === sortBy),
                  onclick: () => {
                    sortBy = key;
                    render();
                  }
                },
                h("strong", {}, sorts[key][0]),
                h("small", {}, sorts[key][1])
              )
            )
          );
        }
        function render() {
          renderControls();
          if ((goal === "name" || goal === "series") && !query) {
            summary.hidden = true;
            summary.replaceChildren();
            list.replaceChildren();
            return;
          }
          if ((goal === "name" || goal === "series") && !report.catalog) {
            summary.hidden = true;
            summary.replaceChildren();
            list.replaceChildren(h("li", { class: "aqm-empty" }, "Le catalogue du jeu est indisponible : impossible de chercher un personnage ou une série pour le moment."));
            return;
          }
          let rows = report.rows.map((r) => ({ ...r, m: measure(r) }));
          if (goal !== "collection" && goal !== "value") rows = rows.filter((r) => r.m.rate > 0);
          if (!rows.length) {
            summary.hidden = true;
            summary.replaceChildren();
            list.replaceChildren(h("li", { class: "aqm-empty" }, goal === "rarity" ? `Aucun booster en vente ne peut te donner une ${rarityName(rarity)}${onlyNew ? " que tu n’as pas" : ""}.` : `Aucun booster en vente ne peut te donner « ${query} »${onlyNew ? " (tu as peut-être déjà toutes ses cartes)" : ""}.`));
            return;
          }
          const last = Number.MAX_VALUE;
          rows.sort((x, y) => (sortBy === "rate" ? y.m.rate - x.m.rate : (x.m.cost ?? last) - (y.m.cost ?? last)) || x.b.price - y.b.price);
          const topRate = Math.max(...rows.map((r) => r.m.rate));
          const bestRate = rows.reduce((x, y) => y.m.rate > x.m.rate ? y : x);
          const cheapest = rows.reduce((x, y) => (y.m.cost ?? last) < (x.m.cost ?? last) ? y : x);
          const worst = rows.reduce((x, y) => y.m.rate < x.m.rate ? y : x);
          const lines = [];
          if (goal === "collection") {
            lines.push(["Le plus de cartes nouvelles", bestRate, ` · ≈ ${dec(bestRate.a.fresh, 1)} par booster.`]);
            if (cheapest.a.perFresh != null) lines.push(["Moins cher", cheapest, ` · ≈ ${fmt(cheapest.a.perFresh)} Perles par carte nouvelle.`]);
          } else if (goal === "value") {
            lines.push(["Meilleur rendement", bestRate, ` · tes cartes valent ×${dec(bestRate.a.ratio)} le prix (≈ ${fmt(bestRate.a.ev)} Perles de cartes pour ${fmt(bestRate.b.price)}).`]);
          } else {
            const p = bestRate.m.rate;
            lines.push(["Meilleur taux", bestRate, ` · ${pct(p)} de chance à chaque booster, ${boostersFor(p)} (≈ ${fmt(bestRate.b.price / p)} Perles en moyenne).`]);
            if (cheapest !== bestRate && cheapest.m.cost != null) lines.push(["Moins cher", cheapest, ` · ≈ ${fmt(cheapest.m.cost)} Perles en moyenne, avec ${pct(cheapest.m.rate)} de chance par booster.`]);
          }
          if (rows.length > 1 && worst !== bestRate && worst.m.rate > 0)
            lines.push([goal === "value" ? "Pire rendement" : goal === "collection" ? "Le moins de cartes nouvelles" : "Pire taux", worst, goal === "value" ? ` · ×${dec(worst.a.ratio)} le prix.` : ` · ${dec(topRate / worst.m.rate, 1)} fois moins ${goal === "collection" ? "de cartes nouvelles" : "de chances"} que le meilleur.`]);
          summary.hidden = false;
          summary.replaceChildren(...lines.map(([label, r, text]) => h("p", {}, h("strong", {}, `${label} : `), r.b.name, text)));
          list.replaceChildren(
            ...rows.map((r, i) => {
              const share = topRate > 0 ? r.m.rate / topRate : 0;
              const badges = [];
              if (r === bestRate) badges.push(h("span", { class: "aqm-badge is-best" }, goal === "value" ? "Meilleur rendement" : goal === "collection" ? "Le plus de nouvelles" : "Meilleur taux"));
              if (r === cheapest && cheapest !== bestRate && goal !== "value") badges.push(h("span", { class: "aqm-badge is-cheap" }, "Moins cher"));
              return h(
                "li",
                { class: `aqm-rank${r === bestRate ? " is-best" : ""}` },
                h("span", { class: "aqm-rank-n" }, String(i + 1)),
                packArt(r.b),
                h(
                  "div",
                  { class: "aqm-rank-main" },
                  h("p", { class: "aqm-rank-title" }, h("strong", {}, r.b.name), h("span", { class: "aqm-rank-price" }, perles(r.b.price), " le booster"), ...badges),
                  h("p", { class: "aqm-rank-head" }, r.m.head),
                  h("p", { class: "aqm-rank-sub" }, r.m.sub, ` · ${guaranteeOf(r.b)} · ${seriesOf(r.b)}`, r.b.endsAt ? ` · jusqu’au ${new Date(r.b.endsAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : ""),
                  h("div", { class: "aqm-rank-bar" }, h("span", { style: `width:${(100 * share).toFixed(1)}%` })),
                  moreOf(r)
                ),
                h(
                  "div",
                  { class: "aqm-rank-side" },
                  h("strong", {}, r.m.big),
                  h("small", {}, r.m.bigSub),
                  h("span", { class: "aqm-rank-ref" }, r === bestRate ? `${goal === "value" ? "Rendement" : "Taux"} 100 % (la référence)` : `${goal === "value" ? "Rendement" : "Taux"} ${Math.round(100 * share)} % du meilleur`)
                )
              );
            })
          );
        }
        render();
      }
      function timeAgo(at) {
        const s = Math.max(0, (Date.now() - at) / 1e3);
        if (s < 60) return "à l’instant";
        if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
        if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
        return `il y a ${Math.floor(s / 86400)} j`;
      }
      const avatarOf = (player) => player?.id ? h("img", { class: "aqm-avatar aqm-avatar-sm", src: avatarUrl(player.id), alt: "", loading: "lazy" }) : h("span", { class: "aqm-avatar aqm-avatar-sm" });
      const playerRow = (serial, player, right, card) => h(
        "li",
        { class: "aqm-owner" },
        h("span", { class: "aqm-owner-serial" }, serial != null ? `#${serial}${card?.maxCopies ? `/${card.maxCopies}` : ""}` : ""),
        avatarOf(player),
        player?.id ? h("a", { href: `/profile/${encodeURIComponent(player.id)}` }, player.name || "Un joueur") : h("span", { class: "aqm-muted" }, player?.name || "Un joueur au profil privé"),
        h("span", { class: "aqm-owner-right" }, right ?? "")
      );
      const pullRows = (pulls) => pulls.map(
        (p) => h(
          "li",
          { class: "aqm-pull" },
          h("a", { href: `/jeu/carte/${encodeURIComponent(p.card.id)}`, class: "aqm-pull-card" }, h("img", { src: cardImageUrl(p.card.image), alt: "", loading: "lazy" })),
          h(
            "div",
            { class: "aqm-pull-main" },
            h("p", { class: "aqm-mini-name" }, rarityCode(p.card.rarity), " ", p.card.name, p.serial != null ? h("span", { class: "aqm-muted" }, ` #${p.serial}${p.card.maxCopies ? `/${p.card.maxCopies}` : ""}`) : null),
            p.card.series ? h("p", { class: "aqm-muted aqm-pull-series" }, p.card.series) : null
          ),
          h(
            "div",
            { class: "aqm-pull-who" },
            h(
              "span",
              { class: "aqm-pull-player" },
              avatarOf(p.player),
              p.player?.id ? h("a", { href: `/profile/${encodeURIComponent(p.player.id)}` }, p.player.name || "Un joueur") : h("span", {}, p.player?.name || "Un joueur")
            ),
            h("small", { title: new Date(p.at).toLocaleString("fr-FR") }, timeAgo(p.at))
          )
        )
      );
      async function openWhoHas(cardId) {
        const body = openOverlay("Qui a cette carte ?", "Cherche n’importe quel personnage : les joueurs qui ont sa carte, qui la vendent et qui l’ont tirée récemment.");
        const search = h("input", { type: "search", class: "aqm-search", placeholder: "Nom d’un personnage ou d’une série…", "aria-label": "Personnage ou série", autocomplete: "off" });
        const view = h("div", { class: "aqm-who" });
        body.append(h("div", { class: "aqm-pick" }, search), view);
        let asked = 0;
        let timer = 0;
        async function showSearch() {
          const n = ++asked;
          const query = search.value.trim();
          view.replaceChildren(h("p", { class: "aqm-note" }, "Recherche…"));
          const [found, pulled] = await Promise.all([
            query.length >= 2 ? ask({ type: "card-search", query }).catch(() => ({ cards: [] })) : { cards: [] },
            ask({ type: "who-pulled", query, rarity: "" }).catch((e) => ({ error: e.message }))
          ]);
          if (n !== asked) return;
          const parts = [];
          if (query.length >= 2) {
            parts.push(h("p", { class: "aqm-label" }, "Cartes du jeu"));
            parts.push(
              found.cards.length ? h(
                "ul",
                { class: "aqm-strip aqm-who-cards" },
                found.cards.map(
                  (c) => h(
                    "li",
                    { class: `aqm-mini${c.owned ? " is-owned" : ""}`, role: "button", tabindex: "0", title: `Qui a ${c.name} ?`, onclick: () => showCard(c.id), onkeydown: (e) => e.key === "Enter" && showCard(c.id) },
                    h("img", { src: cardImageUrl(c.image), alt: "", loading: "lazy" }),
                    h("div", {}, h("p", { class: "aqm-mini-name" }, rarityCode(c.rarity), " ", c.name, c.variant ? ` (${c.variant})` : ""), h("p", { class: "aqm-muted" }, c.series ?? ""))
                  )
                )
              ) : h("p", { class: "aqm-muted" }, `Aucune carte ne s’appelle « ${query} ».`)
            );
          } else parts.push(h("p", { class: "aqm-note" }, "Tape au moins 2 lettres du nom d’un personnage, puis choisis sa carte."));
          if (!pulled.error) {
            const since = pulled.since ? new Date(pulled.since).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : null;
            parts.push(h("p", { class: "aqm-label aqm-who-gap" }, query ? "Tirages récents" : "Derniers beaux tirages"));
            parts.push(h("p", { class: "aqm-note aqm-who-note" }, `Parmi ${pulled.kept > 1 ? `les ${fmt(pulled.kept)} beaux tirages` : `${fmt(pulled.kept)} beau tirage`} (SSR, UR, SEC) relevé${pulled.kept > 1 ? "s" : ""} par les joueurs qui ont Aquaman${since ? ` depuis le ${since}` : ""}${pulled.shared ? "" : " (base commune injoignable : seulement ceux de cet appareil)"}.${pulled.latest ? ` Dernier tirage reçu ${timeAgo(pulled.latest)}.` : ""}`));
            parts.push(pulled.pulls.length ? h("ol", { class: "aqm-pulled" }, pullRows(pulled.pulls.slice(0, 50))) : h("p", { class: "aqm-muted" }, "Aucun tirage récent."));
          }
          view.replaceChildren(...parts);
        }
        async function showCard(id) {
          const n = ++asked;
          view.replaceChildren(h("p", { class: "aqm-note" }, "Recherche des joueurs qui ont cette carte…"));
          let r;
          try {
            r = await ask({ type: "card-owners", id });
          } catch (e) {
            view.replaceChildren(h("p", { class: "aqm-note" }, e.message));
            return;
          }
          if (n !== asked) return;
          const c = r.card;
          const stat = (label, value) => value == null ? null : h("div", { class: "aqm-metric" }, h("small", {}, label), h("strong", {}, value));
          const section = (title, items, empty) => [h("p", { class: "aqm-label aqm-who-gap" }, title), items.length ? h("ul", { class: "aqm-owners" }, items) : h("p", { class: "aqm-muted" }, empty)];
          view.replaceChildren(
            h("button", { type: "button", class: "aqm-chip aqm-who-back", onclick: showSearch }, "← Retour à la recherche"),
            h(
              "div",
              { class: "aqm-who-card" },
              h("a", { href: `/jeu/carte/${encodeURIComponent(c.id)}` }, h("img", { src: cardImageUrl(c.image), alt: "" })),
              h(
                "div",
                {},
                h("p", { class: "aqm-pack-title" }, rarityCode(c.rarity), " ", c.name, c.variant ? ` (${c.variant})` : ""),
                c.series ? h("p", { class: "aqm-muted" }, c.series) : null,
                h("p", { class: "aqm-muted" }, c.owned ? `Tu l’as${c.owned > 1 ? ` (${c.owned} exemplaires)` : ""}.` : "Tu ne l’as pas."),
                h(
                  "div",
                  { class: "aqm-who-stats" },
                  stat("Joueurs qui l’ont", c.owners != null ? fmt(c.owners) : null),
                  stat("En circulation", c.circulation != null ? fmt(c.circulation) : null),
                  stat("Recherchée par", c.wants != null ? fmt(c.wants) : null),
                  stat("Tirage", c.maxCopies ? `${fmt(c.minted ?? 0)}/${fmt(c.maxCopies)}` : "Illimité")
                )
              )
            ),
            ...r.holders ? section(`Détenteurs · ${fmt(r.holders.length)}`, r.holders.map((x) => playerRow(x.serial, x.player, null, c)), "Personne ne l’a encore.") : [
              h(
                "p",
                { class: "aqm-note" },
                c.owners ? `${fmt(c.owners)} joueur${c.owners > 1 ? "s l’ont" : " l’a"}, mais le jeu ne publie la liste des détenteurs que pour les cartes à tirage limité. Voici ceux qu’Aquaman peut voir.` : "Personne n’a encore cette carte."
              )
            ],
            ...section(
              "En vente au marché",
              r.market.map((x) => playerRow(x.serial, x.player, x.price != null ? h("span", {}, perles(x.price)) : null, c)),
              "Personne ne la vend en ce moment."
            ),
            ...section(
              "Parmi toi et tes amis",
              r.friends.map((x) => playerRow(x.serials[0] ?? null, { ...x.player, name: x.me ? `${x.player.name ?? "Toi"} (toi)` : x.player.name }, x.count > 1 ? `×${x.count}` : null, c)),
              "Aucun de tes amis ne l’a (ou leur collection est privée)."
            ),
            ...r.holders ? [] : section(
              `Vus avec cette carte${r.seen?.length ? ` · ${fmt(r.seen.length)}` : ""}`,
              (r.seen ?? []).map((x) => playerRow(x.serials[0] ?? null, x.player, h("small", { title: `Collection lue le ${new Date(x.seenAt).toLocaleString("fr-FR")}` }, `${x.count > 1 ? `×${x.count} · ` : ""}${timeAgo(x.seenAt)}`), c)),
              r.scanned ? `Aucun des ${fmt(r.scanned)} joueurs dont Aquaman a lu la collection ne l’a.` : "Aquaman lit la collection des joueurs qui font un beau tirage : ils apparaîtront ici au fil du temps."
            ),
            ...section(
              r.pulls.length ? `Tirée ${r.pulls.length} fois${r.pullsSince ? ` depuis le ${new Date(r.pullsSince).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : ""}` : "Tirée récemment",
              r.pulls.map((x) => playerRow(x.serial, x.player, h("small", { title: new Date(x.at).toLocaleString("fr-FR") }, timeAgo(x.at)), c)),
              `Aucun tirage relevé${r.pullsSince ? ` depuis le ${new Date(r.pullsSince).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : ""} par les joueurs qui ont Aquaman (le jeu ne publie que les beaux tirages SSR, UR et SEC).`
            ),
            ...r.holders ? [] : farther(c, n)
          );
        }
        function farther(c, n) {
          const list = h("ul", { class: "aqm-owners" });
          const note = h("p", { class: "aqm-muted", role: "status" });
          const go = h("button", { type: "button", class: "aqm-album-btn is-main" }, "🔍 Chercher parmi les joueurs vus récemment");
          go.addEventListener("click", async () => {
            go.disabled = true;
            let players;
            try {
              players = (await ask({ type: "known-players" })).players;
            } catch (e) {
              note.textContent = e.message;
              return;
            }
            let done = 0;
            let found = 0;
            let hidden = 0;
            for (let i = 0; i < players.length; i += 6) {
              if (n !== asked) return;
              note.textContent = `${done}/${players.length} joueurs regardés · ${found} l’${found > 1 ? "ont" : "a"}…`;
              const part = players.slice(i, i + 6);
              const r = await ask({ type: "owners-among", id: c.id, players: part }).catch(() => ({ found: [], hidden: part.length }));
              done += part.length;
              hidden += r.hidden;
              found += r.found.length;
              list.append(...r.found.map((x) => playerRow(x.serials[0] ?? null, x.player, x.count > 1 ? `×${x.count}` : null, c)));
            }
            go.hidden = true;
            note.textContent = players.length ? `${players.length} joueur${players.length > 1 ? "s" : ""} vu${players.length > 1 ? "s" : ""} récemment regardé${players.length > 1 ? "s" : ""} : ${found} l’${found > 1 ? "ont" : "a"}${hidden ? ` (${hidden} collection${hidden > 1 ? "s" : ""} privée${hidden > 1 ? "s" : ""} ou illisible${hidden > 1 ? "s" : ""})` : ""}.` : "Aquaman n’a pas encore vu d’autres joueurs : il les découvre dans les beaux tirages, au fil du temps.";
          });
          return [h("p", { class: "aqm-label aqm-who-gap" }, "Chercher plus loin"), h("p", { class: "aqm-muted" }, "Aquaman peut regarder la collection publique des joueurs vus dans les beaux tirages relevés par tous les joueurs qui l’ont."), go, note, list];
        }
        search.addEventListener("input", () => {
          clearTimeout(timer);
          timer = setTimeout(showSearch, 300);
        });
        if (typeof cardId === "string") showCard(cardId);
        else showSearch();
      }
      async function accountId() {
        try {
          const res = await pageFetch("/api/auth/check", { credentials: "include", headers: { accept: "application/json" } });
          return (await res.json())?.user?.id ?? null;
        } catch {
          return null;
        }
      }
      async function openUsers() {
        meId = await accountId();
        if (meId !== AUTHOR_ID) return;
        const body = openOverlay("Joueurs avec Aquaman", "Les joueurs qui utilisent Aquaman : toi d’abord, puis la version la plus récente en premier et, à version égale, le plus récemment vu. Visible par toi seul.");
        body.parentElement.classList.add("aqm-panel-wide");
        const view = h("div");
        body.append(view);
        const deviceName = () => {
          const ua = navigator.userAgent;
          const browser = navigator.brave ? "Brave" : /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) && !/Chrome\//.test(ua) ? "Safari" : "Chrome";
          const system = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : "Linux";
          return `${browser} · ${system}`;
        };
        const showCode = (id) => `${id.slice(0, 4)}-${id.slice(4)}`;
        let polling = 0;
        function approve(r) {
          const input = h("input", { type: "password", class: "aqm-search", placeholder: "Code propriétaire", "aria-label": "Code propriétaire", autocomplete: "off" });
          const go = h("button", { type: "button", class: "aqm-album-btn is-main" }, "Approuver");
          const note = h("p", { class: "aqm-muted", role: "status" }, r.wrong ? "Ce code n’est pas le bon." : r.revoked ? "Cet appareil a été révoqué." : "");
          const submit = async () => {
            if (!input.value.trim()) return;
            go.disabled = true;
            const res = await ask({ type: "admin-code", token: input.value.trim(), name: deviceName() }).catch((e) => ({ error: e.message }));
            go.disabled = false;
            if (res.wrong) note.textContent = "Ce code n’est pas le bon.";
            else if (res.error) note.textContent = res.error;
            else load();
          };
          go.addEventListener("click", submit);
          input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
          const pending = r.device?.state === "pending";
          const other = h("button", { type: "button", class: "aqm-album-btn" }, "Demander l’approbation à un autre appareil");
          other.addEventListener("click", async () => {
            other.disabled = true;
            await ask({ type: "admin-request", name: deviceName() }).catch(() => {
            });
            load();
          });
          view.replaceChildren(
            h("p", { class: "aqm-note" }, "Cet appareil n’est pas encore approuvé. Il ne l’est qu’une fois : ensuite, plus rien à faire."),
            pending ? h(
              "div",
              { class: "aqm-device-wait" },
              h("p", {}, "Code de cet appareil : ", h("strong", {}, showCode(r.device.id))),
              h("p", { class: "aqm-muted" }, "Ouvre « Joueurs avec Aquaman » sur un appareil déjà approuvé et approuve celui qui porte ce code. Cette page se met à jour toute seule.")
            ) : h("div", { class: "aqm-pick" }, other),
            h("p", { class: "aqm-label aqm-who-gap" }, pending ? "Ou avec le code propriétaire" : "Avec le code propriétaire (premier appareil)"),
            h("div", { class: "aqm-pick aqm-users-code" }, input, go),
            note
          );
          clearTimeout(polling);
          if (pending) polling = setTimeout(() => body.isConnected && load(), 5e3);
        }
        async function devices(box) {
          const r = await ask({ type: "admin-devices" }).catch(() => null);
          if (!r?.devices) return;
          const { adminDevice: mine } = await chrome.storage.local.get("adminDevice");
          const act = (label, type, id, main) => {
            const btn = h("button", { type: "button", class: `aqm-album-btn${main ? " is-main" : ""}` }, label);
            btn.addEventListener("click", async () => {
              btn.disabled = true;
              await ask({ type, id }).catch(() => {
              });
              devices(box);
            });
            return btn;
          };
          box.replaceChildren(
            h("p", { class: "aqm-label aqm-who-gap" }, "Mes appareils"),
            h(
              "ul",
              { class: "aqm-users" },
              r.devices.map(
                (d) => h(
                  "li",
                  { class: "aqm-user" },
                  h("strong", { class: "aqm-device-code" }, showCode(d.id)),
                  h("span", { class: "aqm-name" }, d.name || "Appareil", d.id === mine?.id ? h("span", { class: "aqm-tag" }, "Cet appareil") : null),
                  h("span", { class: "aqm-muted" }, d.state === "pending" ? "En attente" : d.lastUsed ? `Utilisé ${timeAgo(d.lastUsed)}` : "Approuvé"),
                  d.state === "pending" ? [act("Approuver", "admin-approve", d.id, true), act("Refuser", "admin-revoke", d.id)] : act("Révoquer", "admin-revoke", d.id)
                )
              )
            )
          );
        }
        async function load() {
          clearTimeout(polling);
          view.replaceChildren(h("p", { class: "aqm-note" }, "Chargement…"));
          let r;
          try {
            r = await ask({ type: "aquaman-users" });
          } catch (e) {
            view.replaceChildren(h("p", { class: "aqm-note" }, e.message));
            return;
          }
          if (r.needDevice) return approve(r);
          show(r.users);
          const box = h("div");
          view.append(box);
          devices(box);
        }
        const kindsOf = (u) => u.installs?.length ? u.installs : [{ kind: u.kind, version: u.version, lastSeen: u.lastSeen }];
        const kindName = (kind) => kind === "userscript" ? "Script" : kind === "extension" ? "Extension" : "?";
        const online = (u) => Date.now() - u.lastSeen < 15 * 6e4;
        const versionRank = (v) => /^\d+\.\d+\.\d+$/.test(v ?? "") ? v.split(".").reduce((n, x) => n * 1e3 + Number(x), 0) : 0;
        const bestVersion = (u) => Math.max(0, ...kindsOf(u).map((i) => versionRank(i.version)));
        function show(players) {
          const all = [...players].sort((a, b) => (b.id === AUTHOR_ID) - (a.id === AUTHOR_ID) || bestVersion(b) - bestVersion(a) || b.lastSeen - a.lastSeen);
          const day = Date.now() - 864e5;
          const week = Date.now() - 7 * 864e5;
          const versions = {};
          for (const u of all) for (const i of kindsOf(u)) versions[i.version ?? "?"] = (versions[i.version ?? "?"] ?? 0) + 1;
          const using = (kind) => all.filter((u) => kindsOf(u).some((i) => i.kind === kind)).length;
          const stat = (label, value) => h("div", { class: "aqm-metric" }, h("small", {}, label), h("strong", {}, value));
          const search = h("input", { type: "search", class: "aqm-search", placeholder: "Chercher un joueur…", "aria-label": "Chercher un joueur" });
          const list = h("ul", { class: "aqm-users" });
          const render = () => {
            const q = search.value.trim().toLowerCase();
            const shown = q ? all.filter((u) => String(u.name ?? "").toLowerCase().includes(q) || u.id.includes(q)) : all;
            list.replaceChildren(
              ...shown.map(
                (u) => h(
                  "li",
                  { class: "aqm-user" },
                  h("img", { class: "aqm-avatar", src: avatarUrl(u.id), alt: "", loading: "lazy" }),
                  h("a", { class: "aqm-name", href: `/profile/${encodeURIComponent(u.id)}` }, u.name || u.id),
                  h(
                    "span",
                    { class: "aqm-user-kinds" },
                    kindsOf(u).map(
                      (i) => h(
                        "span",
                        { class: `aqm-tag aqm-kind-${i.kind ?? "x"}`, title: `${kindName(i.kind)} vu${i.lastSeen ? ` ${timeAgo(i.lastSeen)}` : ""}` },
                        `${kindName(i.kind)}${i.version ? ` v${i.version}` : ""}`
                      )
                    )
                  ),
                  u.revoked ? h("span", { class: "aqm-tag aqm-revoked" }, "Révoqué") : online(u) ? h("span", { class: "aqm-tag aqm-online" }, "En ligne") : h("span"),
                  h("span", { class: "aqm-user-seen", title: `Vu la première fois le ${new Date(u.firstSeen).toLocaleDateString("fr-FR")}` }, timeAgo(u.lastSeen)),
                  u.id === AUTHOR_ID ? null : revokeButton(u)
                )
              )
            );
          };
          const revokeButton = (u) => {
            const btn = h("button", { type: "button", class: "aqm-album-btn aqm-user-revoke" }, u.revoked ? "Rétablir" : "Révoquer");
            btn.addEventListener("click", async () => {
              const name = u.name || u.id;
              if (!u.revoked && !confirm(`Révoquer Aquaman pour ${name} ? Il s’arrêtera chez ce joueur dans la minute, jusqu’à ce que tu le rétablisses.`)) return;
              btn.disabled = true;
              const res = await ask({ type: "admin-revoke-player", id: u.id, revoked: !u.revoked }).catch((e) => ({ error: e.message }));
              if (res?.needDevice) return load();
              if (res?.ok) u.revoked = !u.revoked;
              render();
            });
            return btn;
          };
          search.addEventListener("input", render);
          view.replaceChildren(
            h(
              "div",
              { class: "aqm-who-stats aqm-users-stats" },
              stat("Joueurs", fmt(all.length)),
              stat("En ligne", fmt(all.filter(online).length)),
              stat("Vus ces 24 h", fmt(all.filter((u) => u.lastSeen >= day).length)),
              stat("Vus ces 7 jours", fmt(all.filter((u) => u.lastSeen >= week).length)),
              stat("Extension / script", `${fmt(using("extension"))} / ${fmt(using("userscript"))}`)
            ),
            h(
              "p",
              { class: "aqm-note" },
              "Versions : ",
              Object.entries(versions).sort((a, b) => versionRank(b[0]) - versionRank(a[0]) || b[1] - a[1]).map(([v, n]) => `${v === "?" ? "inconnue" : v} (${n})`).join(", "),
              "."
            ),
            h("div", { class: "aqm-pick" }, search),
            list
          );
          render();
        }
        load();
      }
      async function openFavorites() {
        const body = openOverlay("Séries favorites", "Les personnages de tes séries favorites : ceux que tu as, ceux qui te manquent, et ta liste de recherches du jeu.");
        body.parentElement.classList.add("aqm-panel-wide");
        const status = h("p", { class: "aqm-note" }, "Chargement de tes séries…");
        body.append(status);
        let report;
        let show = "missing";
        const opened = /* @__PURE__ */ new Set();
        let rarity = "";
        let fresh = true;
        const load = async () => {
          report = await ask({ type: "favorites", fresh });
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
        const suggestions = h("datalist", { id: "aqm-series-suggest" });
        const add = h("input", { type: "search", class: "aqm-search", placeholder: "Ajouter une série aux favoris…", "aria-label": "Ajouter une série", list: "aqm-series-suggest", autocomplete: "off" });
        const found = h("ul", { class: "aqm-fav-found" });
        const filters = h("div", { class: "aqm-sorts" });
        const content2 = h("div", { class: "aqm-fav-list" });
        body.append(h("div", { class: "aqm-pick" }, add), found, filters, content2, suggestions);
        filters.before(
          searchPanel(async () => {
            fresh = true;
            try {
              await load();
            } catch {
            }
            render();
          })
        );
        const renderFound = () => {
          const q = add.value.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
          const fold2 = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
          const hits = q ? report.all.filter((s) => fold2(s.title).includes(q)).slice(0, 8) : [];
          suggestions.replaceChildren(...hits.map((s) => h("option", { value: s.title })));
          found.replaceChildren(
            ...hits.map(
              (s) => h(
                "li",
                {},
                h("img", { src: `/api/covers/${s.slug}.webp`, alt: "", loading: "lazy" }),
                h("span", {}, h("strong", {}, s.title), h("small", {}, `${fmt(s.owned)}/${fmt(s.total)}`)),
                h(
                  "button",
                  {
                    type: "button",
                    class: `aqm-chip${favIds.has(s.id) ? " is-on" : ""}`,
                    onclick: async () => {
                      await toggleFavorite(s.id, !favIds.has(s.id));
                      await load();
                      renderFound();
                      render();
                    }
                  },
                  favIds.has(s.id) ? "★ Favorite" : "☆ Ajouter"
                )
              )
            )
          );
        };
        add.addEventListener("input", renderFound);
        const chip = (value, label, current, pick) => h("button", { type: "button", class: `aqm-chip${value === current ? " is-on" : ""}`, "aria-pressed": String(value === current), onclick: () => pick(value) }, label);
        function render() {
          filters.replaceChildren(
            h("span", { class: "aqm-filter-name" }, "Afficher"),
            ...[
              ["all", "Toutes"],
              ["missing", "Manquantes"],
              ["owned", "Possédées"],
              ["wanted", "Recherchées"]
            ].map(
              ([v, l]) => chip(v, l, show, (x) => {
                show = x;
                render();
              })
            ),
            h("span", { class: "aqm-filter-name aqm-gap" }, "Rareté"),
            ...[["", "Toutes"], ...RANKED.map((c) => [c, c])].map(
              ([v, l]) => chip(v, l, rarity, (x) => {
                rarity = x;
                render();
              })
            )
          );
          if (!report.favorites.length) {
            content2.replaceChildren(h("p", { class: "aqm-empty" }, "Aucune série favorite pour le moment : ajoute-en avec le champ ci-dessus, ou avec l’étoile ☆ sur les séries de la page Collection."));
            return;
          }
          content2.replaceChildren(
            ...report.favorites.map((s) => {
              const keep = (c) => (!rarity || c.rarity === rarity) && (show === "all" || show === "missing" && !c.owned || show === "owned" && c.owned > 0 || show === "wanted" && c.wanted);
              const cards = s.cards.filter(keep).sort((a, b) => RANKED.indexOf(b.rarity) - RANKED.indexOf(a.rarity) || a.name.localeCompare(b.name));
              const missing = s.cards.filter((c) => !c.owned);
              const toWantIds = missing.filter((c) => !c.wanted).map((c) => c.id);
              const toWant = toWantIds.length;
              const note = h("p", { class: "aqm-muted", role: "status" });
              const wantAll = h(
                "button",
                {
                  type: "button",
                  class: "aqm-sort is-on",
                  disabled: !toWant,
                  onclick: async () => {
                    wantAll.disabled = true;
                    note.textContent = wantsNote(await enqueueWants(toWantIds), "tu peux fermer cette fenêtre, changer de page ou ouvrir des boosters");
                  }
                },
                h("strong", {}, toWant ? `Rechercher les ${toWant} manquante${toWant > 1 ? "s" : ""}` : "Toutes les manquantes sont recherchées"),
                h("small", {}, "Le jeu te prévient quand elles sont mises en vente")
              );
              return h(
                "section",
                { class: "aqm-fav-series" },
                h(
                  "div",
                  { class: "aqm-fav-head" },
                  h("img", { src: `/api/covers/${s.slug}.webp`, alt: "", loading: "lazy" }),
                  h(
                    "div",
                    { class: "aqm-fav-title" },
                    h("strong", {}, s.title),
                    h("small", {}, `${fmt(s.owned)}/${fmt(s.total)} cartes · ${fmt(missing.length)} manquante${missing.length > 1 ? "s" : ""}`),
                    h("span", { class: "aqm-bar" }, h("span", { style: `width:${s.total ? (100 * s.owned / s.total).toFixed(1) : 0}%` }))
                  ),
                  wantAll,
                  h(
                    "button",
                    {
                      type: "button",
                      class: `aqm-chip aqm-fav-details${opened.has(s.id) ? " is-on" : ""}`,
                      "aria-expanded": String(opened.has(s.id)),
                      onclick: () => {
                        opened.has(s.id) ? opened.delete(s.id) : opened.add(s.id);
                        render();
                      }
                    },
                    opened.has(s.id) ? "Masquer ▴" : `Détails ▾`
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      class: "aqm-chip is-on aqm-fav-unstar",
                      title: "Retirer des séries favorites",
                      onclick: async () => {
                        await toggleFavorite(s.id, false);
                        await load();
                        render();
                      }
                    },
                    "★"
                  )
                ),
                note,
                !opened.has(s.id) ? null : cards.length ? h(
                  "ul",
                  { class: "aqm-fav-cards" },
                  cards.map((c) => {
                    const want = h(
                      "button",
                      {
                        type: "button",
                        class: `aqm-want${c.wanted ? " is-on" : ""}${c.waiting ? " is-wait" : ""}`,
                        title: c.waiting ? "En attente dans Aquaman (ta liste du jeu est pleine) : ne plus la chercher" : c.wanted ? "Ne plus la chercher" : "Je la cherche : être prévenu quand elle est mise en vente",
                        onclick: async (e) => {
                          e.preventDefault();
                          want.disabled = true;
                          try {
                            const r = await wantCard(c.id, !c.wanted);
                            c.wanted = r.wanted;
                            c.waiting = false;
                            want.classList.toggle("is-on", c.wanted);
                            want.classList.remove("is-wait");
                            want.title = c.wanted ? "Ne plus la chercher" : "Je la cherche : être prévenu quand elle est mise en vente";
                          } catch (err) {
                            want.title = err.message;
                          } finally {
                            want.disabled = false;
                          }
                        }
                      },
                      "🔭"
                    );
                    return h(
                      "li",
                      { class: `aqm-fav-card${c.owned ? " is-owned" : ""}` },
                      h("a", { href: `/jeu/carte/${encodeURIComponent(c.id)}` }, h("img", { src: cardImageUrl(c.image), alt: "", loading: "lazy" })),
                      h("p", { class: "aqm-mini-name" }, rarityCode(c.rarity), " ", c.name),
                      h("p", { class: "aqm-muted" }, c.owned ? c.owned > 1 ? `×${c.owned}` : "Possédée" : "Manquante"),
                      c.owned ? null : want
                    );
                  })
                ) : h("p", { class: "aqm-muted" }, "Aucune carte pour ce filtre.")
              );
            })
          );
        }
        render();
      }
      const cardRarity = /* @__PURE__ */ new Map();
      function markCardWho() {
        const id = decodeURIComponent(location.pathname.match(/^\/jeu\/carte\/([^/]+)/)?.[1] ?? "");
        if (!id) return;
        const rarity = cardRarity.get(id);
        if (rarity === void 0) {
          cardRarity.set(
            id,
            ask({ type: "card-rarity", id }).then((r) => cardRarity.set(id, r.rarity ?? "")).catch(() => cardRarity.delete(id)).finally(schedule)
          );
          return;
        }
        if (typeof rarity !== "string" || RANKED.indexOf(rarity) < RANKED.indexOf("SSR")) return;
        const label = elementsWithText(document.body, /^\s*mes exemplaires\s*$/i)[0];
        if (!label) return;
        let section = label.parentElement;
        while (section && section !== document.body && section.textContent.trim().length <= label.textContent.trim().length + 5) section = section.parentElement;
        if (!section || section === document.body) return;
        const old = section.querySelector(".aqm-card-who");
        if (old?.dataset.card === id) return;
        old?.remove();
        const game2 = [...section.querySelectorAll("button, a")].find((b) => !b.closest(".aqm-root") && /^(voir au march[ée]|je la cherche|je ne la cherche plus)/i.test(b.textContent.trim()));
        const btn = h("button", { type: "button", class: `aqm-root aqm-card-who${game2 ? "" : " aqm-album-btn"}`, "data-card": id }, h("span", { class: "aqm-card-who-icon", html: ICON_SEARCH }), "Qui a cette carte ?");
        const twin = [...section.querySelectorAll("button")].filter((b) => !b.closest(".aqm-root")).pop();
        if (game2 && twin) btn.className = `${twin.className} aqm-root aqm-card-who`;
        btn.addEventListener("click", () => openWhoHas(id));
        if (game2) game2.parentElement.append(btn);
        else section.append(h("div", { class: "aqm-root aqm-card-who-row" }, btn));
        btn.dataset.card = id;
      }
      let listingsFor = null;
      function markCardListings() {
        const id = location.pathname.match(/^\/jeu\/carte\/([^/?#]+)/)?.[1];
        const box = document.querySelector(".aqm-listings");
        if (!id) return void box?.remove();
        const cote = [...document.querySelectorAll("p, span, h2, h3, div")].find((el) => !el.closest(".aqm-root") && !el.childElementCount && /^cote$/i.test(el.textContent.trim()));
        let panel = cote;
        while (panel?.parentElement && !/mes exemplaires/i.test(panel.parentElement.textContent)) panel = panel.parentElement;
        if (!panel || panel === cote) return;
        if (box?.dataset.card === id && box.previousElementSibling === panel) return;
        if (listingsFor === id && box) return;
        box?.remove();
        listingsFor = id;
        const fresh = h("section", { class: "aqm-root aqm-listings", "data-card": id }, h("p", { class: "aqm-label" }, "En vente au marché"), h("p", { class: "aqm-muted" }, "Lecture des offres…"));
        panel.after(fresh);
        showListings(fresh, decodeURIComponent(id), false);
      }
      function showListings(fresh, cardId, again) {
        ask({ type: "card-listings", id: cardId, fresh: again }).then((r) => {
          if (!fresh.isConnected) return;
          const rows = r.offers.map(
            (o) => playerRow(
              o.serial,
              o.player,
              h("span", { class: "aqm-buy-cell" }, perles(o.price), o.id && o.player?.id !== meId ? buyButton(o, fresh, cardId) : null),
              { maxCopies: r.maxCopies }
            )
          );
          fresh.replaceChildren(
            h(
              "div",
              { class: "aqm-listings-head" },
              h("p", { class: "aqm-label" }, "En vente au marché"),
              h("small", { class: "aqm-muted" }, r.count ? `${r.count > 5 ? `5 moins chères sur ${fmt(r.count)}` : `${r.count} offre${r.count > 1 ? "s" : ""}`}, de la moins chère à la plus chère` : "")
            ),
            rows.length ? h("ul", { class: "aqm-owners" }, rows) : h("p", { class: "aqm-muted" }, "Personne ne la vend pour le moment."),
            ...auctionsPart(r.auctions, r.maxCopies)
          );
        }).catch((e) => fresh.isConnected && fresh.replaceChildren(h("p", { class: "aqm-label" }, "En vente au marché"), h("p", { class: "aqm-muted" }, e.message)));
      }
      function timeLeft(at) {
        const m = Math.max(1, Math.round((at - Date.now()) / 6e4));
        if (m < 60) return `${m} min`;
        if (m < 1440) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
        return `${Math.floor(m / 1440)} j${Math.floor(m % 1440 / 60) ? ` ${Math.floor(m % 1440 / 60)} h` : ""}`;
      }
      function auctionsPart(auctions, maxCopies) {
        if (!auctions) return [];
        const rows = auctions.slice(0, 3).map(
          (a) => playerRow(
            a.serial,
            a.player,
            h(
              "span",
              { class: "aqm-buy-cell" },
              h("span", { class: "aqm-auction-cell" }, perles(a.bid), h("small", { class: "aqm-muted" }, [a.bids != null ? `${a.bids} enchère${a.bids > 1 ? "s" : ""}` : null, a.endsAt ? `fin dans ${timeLeft(a.endsAt)}` : null].filter(Boolean).join(" · "))),
              // La page de l'enchère dans le jeu (/jeu/encheres/:id), où le joueur enchérit.
              a.id ? h("a", { class: "aqm-queue-btn is-main aqm-buy", href: `/jeu/encheres/${encodeURIComponent(a.id)}` }, a.player?.id === meId ? "Voir" : "Enchérir") : null
            ),
            { maxCopies }
          )
        );
        return [
          h(
            "div",
            { class: "aqm-listings-head aqm-auctions-head" },
            h("p", { class: "aqm-label" }, "Aux enchères"),
            h("small", { class: "aqm-muted" }, auctions.length ? `${auctions.length > 3 ? `3 mises les plus faibles sur ${fmt(auctions.length)}` : `${auctions.length} en cours`}, de la plus faible à la plus haute` : "")
          ),
          rows.length ? h("ul", { class: "aqm-owners" }, rows) : h("p", { class: "aqm-muted" }, "Aucune enchère en cours.")
        ];
      }
      function myCopiesText() {
        const label = [...document.querySelectorAll("p, span, h2, h3, div")].find((el) => !el.closest(".aqm-root") && !el.childElementCount && /^mes exemplaires$/i.test(el.textContent.trim()));
        let box = label;
        while (box?.parentElement && box.textContent.trim().length <= (label?.textContent.trim().length ?? 0) + 5) box = box.parentElement;
        return box?.textContent.replace(/\s+/g, " ").trim() ?? "";
      }
      function buyButton(offer, box, cardId) {
        const btn = h("button", { type: "button", class: "aqm-queue-btn is-main aqm-buy" }, "Acheter");
        btn.addEventListener("click", async () => {
          if (btn.disabled) return;
          btn.disabled = true;
          btn.textContent = "Achat…";
          try {
            const bought = await gameWrite(`/market/listings/${encodeURIComponent(offer.id)}/buy`, "POST");
            btn.textContent = "✅ Achetée";
            if (offer.card?.name) addBought(offer.card.name, offer.card.rarity);
            owned = null;
            send({ type: "collection-stale" });
            const perles2 = bought?.perles ?? bought?.balance ?? bought?.buyer?.perles;
            const before = myCopiesText();
            const refresh = () => window.postMessage({ aquamanCmd: "reload-game", cardId, perles: typeof perles2 === "number" ? perles2 : void 0 }, location.origin);
            refresh();
            setTimeout(() => myCopiesText() === before && refresh(), 2e3);
            setTimeout(() => box.isConnected && showListings(box, cardId, true), 1200);
          } catch (e) {
            btn.textContent = "Refusé";
            btn.title = e.message;
            box.append(h("p", { class: "aqm-muted aqm-buy-refused" }, `Achat refusé par le jeu : ${e.message}`));
            setTimeout(() => box.isConnected && showListings(box, cardId, true), 2500);
          }
        });
        return btn;
      }
      let favIds = null;
      let seriesBySlug = null;
      let seriesTitles = null;
      async function loadFavIds(fresh = false) {
        const res = await send({ type: "favorites", fresh });
        if (!res || res.error) return;
        favIds = new Set(res.favorites.map((s) => s.id));
        seriesBySlug = new Map(res.all.map((s) => [s.slug, s.id]));
        seriesTitles = new Map(res.all.map((s) => [s.id, String(s.title ?? "").trim().toLowerCase()]));
        document.querySelectorAll(".aqm-star").forEach((star) => paintStar(star));
        const count = document.querySelector(".aqm-fav-open b");
        if (count) count.textContent = String(favIds.size);
      }
      async function toggleFavorite(id, on2) {
        const res = await send({ type: "favorite", id, on: on2 });
        if (res?.favorites) favIds = new Set(res.favorites);
        document.querySelectorAll(".aqm-star").forEach((star) => paintStar(star));
        const count = document.querySelector(".aqm-fav-open b");
        if (count) count.textContent = String(favIds?.size ?? 0);
      }
      function paintStar(star) {
        const on2 = !!favIds?.has(star.dataset.id);
        setText(star, on2 ? "★" : "☆");
        star.classList.toggle("is-on", on2);
        star.title = on2 ? "Retirer des séries favorites" : "Ajouter aux séries favorites";
        star.setAttribute("aria-pressed", String(on2));
      }
      let favLoading = false;
      function markFavoriteSeries() {
        if (!location.pathname.startsWith("/jeu/collection")) return;
        const strip = document.querySelector('[role="radiogroup"][aria-label="Série"], [role="radiogroup"][aria-label="Série"]') ?? seriesStrip();
        if (!strip || strip.closest(".aqm-root")) return;
        if (!seriesBySlug && !favLoading) {
          favLoading = true;
          loadFavIds().finally(() => {
            favLoading = false;
            schedule();
          });
        }
        if (!strip.previousElementSibling?.classList.contains("aqm-fav-bar"))
          strip.before(
            h(
              "div",
              { class: "aqm-root aqm-fav-bar" },
              h("button", { type: "button", class: "aqm-chip aqm-fav-open", onclick: openFavorites }, "★ Favoris", h("b", {}, favIds ? String(favIds.size) : "…")),
              h("button", {
                type: "button",
                class: "aqm-chip aqm-sort-progress",
                "aria-pressed": "false",
                onclick: () => {
                  setByProgress(!byProgress);
                  sortByProgress(strip);
                  strip.scrollTo?.({ left: 0, behavior: "smooth" });
                },
                title: "Les séries où il te manque le moins de cartes en premier"
              }, "Les plus avancées"),
              h("button", {
                type: "button",
                class: "aqm-chip aqm-sort-progress aqm-small-series",
                "aria-pressed": "false",
                onclick: () => {
                  setSmallOnly(!smallOnly);
                  sortByProgress(strip);
                  strip.scrollTo?.({ left: 0, behavior: "smooth" });
                },
                title: `Masquer les séries de ${SMALL_SERIES} personnages ou moins`
              }, `Masquer séries <= ${SMALL_SERIES} persos`),
              h("button", {
                type: "button",
                class: "aqm-chip aqm-sort-progress aqm-claimed-series",
                "aria-pressed": "false",
                onclick: () => {
                  setClaimedHidden(!claimedHidden);
                  if (claimedHidden) loadClaimed(true);
                  sortByProgress(strip);
                  strip.scrollTo?.({ left: 0, behavior: "smooth" });
                },
                title: "Masquer les séries dont tu as déjà le badge (album réclamé)"
              }, "Masquer séries avec badge"),
              h("button", {
                type: "button",
                class: "aqm-chip aqm-sort-progress aqm-locked-cards",
                "aria-pressed": "false",
                onclick: () => {
                  setLockedHidden(!lockedHidden);
                  if (lockedHidden) loadLocked();
                  filterLocked(true);
                  sortByProgress(strip);
                },
                title: "Masquer les cartes dont tous tes exemplaires sont verrouillés"
              }, "Masquer cartes verrouillées")
            )
          );
        if (claimedHidden && Date.now() - claimedAt > 2 * 6e4) loadClaimed();
        if (lockedHidden && Date.now() - lockedAt > 2 * 6e4) loadLocked();
        filterLocked();
        sortByProgress(strip);
        keepStripPlace(strip);
        if (!seriesBySlug) return;
        for (const img of strip.querySelectorAll('img[src*="/api/covers/"]')) {
          const tile = img.closest('button, a, [role="radio"]') ?? img.parentElement;
          if (!tile || tile.querySelector(":scope > .aqm-star")) continue;
          anchorBadges(tile);
          const slug = decodeURIComponent(img.getAttribute("src").match(/\/api\/covers\/([^/?#]+)\.webp/)?.[1] ?? "");
          const id = seriesBySlug.get(slug);
          if (!id) continue;
          const star = h("span", {
            class: "aqm-root aqm-star",
            role: "button",
            tabindex: "0",
            "data-id": id,
            onclick: (e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleFavorite(id, !favIds?.has(id));
            },
            onkeydown: (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              toggleFavorite(id, !favIds?.has(id));
            }
          });
          paintStar(star);
          tile.append(star);
        }
      }
      const BY_PROGRESS_KEY = "aqm-by-progress";
      const STRIP_LEFT_KEY = "aqm-strip-left";
      let byProgress = (() => {
        try {
          return sessionStorage.getItem(BY_PROGRESS_KEY) === "1";
        } catch {
          return false;
        }
      })();
      const SMALL_SERIES = 5;
      const SMALL_ONLY_KEY = "aqm-small-series";
      let smallOnly = (() => {
        try {
          return sessionStorage.getItem(SMALL_ONLY_KEY) === "1";
        } catch {
          return false;
        }
      })();
      function setSmallOnly(on2) {
        smallOnly = on2;
        try {
          on2 ? sessionStorage.setItem(SMALL_ONLY_KEY, "1") : sessionStorage.removeItem(SMALL_ONLY_KEY);
        } catch {
        }
      }
      const CLAIMED_KEY = "aqm-hide-claimed";
      let claimedHidden = (() => {
        try {
          return sessionStorage.getItem(CLAIMED_KEY) === "1";
        } catch {
          return false;
        }
      })();
      function setClaimedHidden(on2) {
        claimedHidden = on2;
        try {
          on2 ? sessionStorage.setItem(CLAIMED_KEY, "1") : sessionStorage.removeItem(CLAIMED_KEY);
        } catch {
        }
      }
      let claimedSlugs = null;
      let claimedAt = 0;
      async function loadClaimed(fresh = false) {
        claimedAt = Date.now();
        const res = await send({ type: "claimed-albums", fresh });
        if (!res || res.error || !Array.isArray(res.slugs)) return;
        claimedSlugs = new Set(res.slugs);
        const strip = seriesStrip();
        if (strip) sortByProgress(strip);
      }
      const LOCKED_KEY = "aqm-hide-locked";
      let lockedHidden = (() => {
        try {
          return sessionStorage.getItem(LOCKED_KEY) === "1";
        } catch {
          return false;
        }
      })();
      function setLockedHidden(on2) {
        lockedHidden = on2;
        try {
          on2 ? sessionStorage.setItem(LOCKED_KEY, "1") : sessionStorage.removeItem(LOCKED_KEY);
        } catch {
        }
      }
      let lockedImages = null;
      let lockedAt = 0;
      async function loadLocked() {
        lockedAt = Date.now();
        let copies;
        try {
          ({ copies } = await gameWrite("/copies", "GET") ?? {});
        } catch {
          return;
        }
        if (!Array.isArray(copies)) return;
        const byImage = /* @__PURE__ */ new Map();
        for (const c of copies) {
          const key = imageKey2(c?.card?.image);
          if (!key) continue;
          byImage.set(key, (byImage.get(key) ?? true) && !!c.protected);
        }
        lockedImages = new Set([...byImage].filter(([, all]) => all).map(([key]) => key));
        filterLocked(true);
      }
      let lockedSize = -1;
      const LAYOUT = '.aqm-root, [role="radiogroup"], [role="tablist"], #album-title, h1, h2';
      function filterLocked(force = false) {
        const marked = () => document.querySelectorAll("[data-aqm-locked-card]");
        const chip = document.querySelector(".aqm-locked-cards");
        chip?.classList.toggle("is-on", lockedHidden);
        chip?.setAttribute("aria-pressed", String(lockedHidden));
        if (!lockedHidden || !lockedImages || !location.pathname.startsWith("/jeu/collection")) {
          if (lockedSize !== -1) marked().forEach((el) => el.removeAttribute("data-aqm-locked-card"));
          lockedSize = -1;
          return;
        }
        const page = document.querySelector("main") ?? document.body;
        const size = page.getElementsByTagName("*").length;
        if (size === lockedSize && !force) return;
        lockedSize = size;
        marked().forEach((el) => el.removeAttribute("data-aqm-locked-card"));
        const imgs = [...page.querySelectorAll("img")].filter((img) => !img.closest(".aqm-root") && isCardImage(img.currentSrc || img.getAttribute("src")));
        const held = /* @__PURE__ */ new Map();
        for (const img of imgs) for (let el = img.parentElement; el && el !== page; el = el.parentElement) held.set(el, (held.get(el) ?? 0) + 1);
        for (const img of imgs) {
          if (!lockedImages.has(imageKey2(img.currentSrc || img.getAttribute("src")))) continue;
          let tile = img;
          for (let up = tile.parentElement; up && up !== page && held.get(up) === 1 && !up.querySelector(LAYOUT); up = tile.parentElement) tile = up;
          if (tile !== img) tile.setAttribute("data-aqm-locked-card", "");
        }
      }
      const coverSlug = (el) => {
        const src = el.querySelector('img[src*="/api/covers/"]')?.getAttribute("src");
        try {
          return src ? decodeURIComponent(src.match(/\/api\/covers\/([^/?#]+)\.webp/)?.[1] ?? "") : "";
        } catch {
          return "";
        }
      };
      function setByProgress(on2) {
        byProgress = on2;
        try {
          on2 ? sessionStorage.setItem(BY_PROGRESS_KEY, "1") : sessionStorage.removeItem(BY_PROGRESS_KEY);
        } catch {
        }
      }
      const placedStrips = /* @__PURE__ */ new WeakSet();
      let placedVisit = -1;
      function keepStripPlace(strip) {
        if (placedStrips.has(strip)) return;
        placedStrips.add(strip);
        const around = [strip, strip.parentElement, strip.parentElement?.parentElement].find((el) => el && /(auto|scroll)/.test(getComputedStyle(el).overflowX));
        if (around && around !== strip) strip = around;
        let left = null;
        try {
          const kept = sessionStorage.getItem(STRIP_LEFT_KEY);
          if (kept != null) left = Number(kept) || 0;
        } catch {
        }
        let placing = placedVisit !== pageVisit;
        placedVisit = pageVisit;
        const until = Date.now() + 1500;
        const stop = () => placing = false;
        for (const type of ["wheel", "pointerdown", "touchstart", "keydown"]) strip.addEventListener(type, stop, { passive: true, once: true });
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
          "scroll",
          () => {
            if (placing) return;
            clearTimeout(timer);
            timer = setTimeout(() => {
              try {
                sessionStorage.setItem(STRIP_LEFT_KEY, String(Math.round(strip.scrollLeft)));
              } catch {
              }
            }, 150);
          },
          { passive: true }
        );
      }
      const missingSeen = new Map(
        (() => {
          try {
            return Object.entries(JSON.parse(sessionStorage.getItem("aqm-missing-seen") || "{}"));
          } catch {
            return [];
          }
        })()
      );
      let missingSaved = "";
      function sortByProgress(strip) {
        const items = [...strip.children].filter((el) => !el.classList.contains("aqm-root"));
        const count = (el) => {
          const m = el.textContent.match(/(\d[\d  ]*)\s*\/\s*(\d[\d  ]*)/);
          if (!m) return null;
          const [owned2, total] = [m[1], m[2]].map((x) => Number(x.replace(/\D/g, "")));
          return total ? { missing: Math.max(0, total - owned2), rate: owned2 / total, total } : null;
        };
        const rows = items.map((el, i) => ({ el, i, c: count(el), all: /toutes les s[ée]ries/i.test(el.textContent) }));
        let completed = false;
        for (const { el, c, all } of rows) {
          if (!c || all) continue;
          const key = el.textContent.replace(/\d[\d  ]*\s*\/\s*\d[\d  ]*/, "").trim();
          if (missingSeen.get(key) > 0 && c.missing === 0) completed = true;
          missingSeen.set(key, c.missing);
        }
        if (completed) setByProgress(true);
        const seen = JSON.stringify(Object.fromEntries(missingSeen));
        if (seen !== missingSaved) {
          missingSaved = seen;
          try {
            sessionStorage.setItem("aqm-missing-seen", seen);
          } catch {
          }
        }
        const chip = strip.previousElementSibling?.querySelector(".aqm-sort-progress:not(.aqm-small-series)");
        chip?.classList.toggle("is-on", byProgress);
        chip?.setAttribute("aria-pressed", String(byProgress));
        const small = strip.previousElementSibling?.querySelector(".aqm-small-series");
        small?.classList.toggle("is-on", smallOnly);
        small?.setAttribute("aria-pressed", String(smallOnly));
        const claimedChip = strip.previousElementSibling?.querySelector(".aqm-claimed-series");
        claimedChip?.classList.toggle("is-on", claimedHidden);
        claimedChip?.setAttribute("aria-pressed", String(claimedHidden));
        for (const { el, c, all } of rows) {
          const picked = el.getAttribute("aria-checked") === "true" || !!el.querySelector('[aria-checked="true"]');
          const claimed = claimedHidden && !!claimedSlugs && !all && !picked && claimedSlugs.has(coverSlug(el));
          const hide = claimed || smallOnly && !all && c && c.total <= SMALL_SERIES && !picked;
          const display = hide ? "none" : "";
          if (el.style.display !== display) el.style.display = display;
        }
        const ranked = rows.sort(
          (a, b) => b.all - a.all || !a.c - !b.c || (a.c?.missing === 0) - (b.c?.missing === 0) || (a.c?.missing ?? 0) - (b.c?.missing ?? 0) || (b.c?.rate ?? 0) - (a.c?.rate ?? 0) || a.i - b.i
        );
        ranked.forEach(({ el }, n) => {
          const order = byProgress ? String(n) : "";
          if (el.style.order !== order) el.style.order = order;
        });
        if (completed) strip.scrollTo?.({ left: 0, behavior: "smooth" });
      }
      const MISSING_FRESH = 2 * 6e4;
      function forgetMissing() {
        if (missingCounts) missingCounts.at = 0;
        if (missingExtra) missingExtra.at = 0;
      }
      const VIEW_TABS = /^(mes cartes|mes doublons|album complet)$/i;
      const VIEW_TAB_TAGS = 'button, a, [role="radio"], [role="tab"]';
      const tabText = (el) => el.textContent.replace(/\s+/g, " ").trim();
      const viewTabs = () => [...document.querySelectorAll(VIEW_TAB_TAGS)].filter((b) => !b.closest(".aqm-root") && !b.classList.contains("aqm-missing-tab") && VIEW_TABS.test(tabText(b)) && !b.parentElement?.closest(VIEW_TAB_TAGS));
      function pickedTab(tabs) {
        const marked = tabs.find((b) => ["aria-checked", "aria-selected", "aria-pressed"].some((a) => b.getAttribute(a) === "true") || b.hasAttribute("aria-current") || b.getAttribute("data-state") === "active");
        if (marked) return marked;
        const looks = tabs.map((b) => b.className);
        return tabs.length > 2 ? tabs.find((b) => looks.filter((c) => c === b.className).length === 1) : null;
      }
      const MISSING_KEY = "aqm-missing-only";
      let missingOn = (() => {
        try {
          return sessionStorage.getItem(MISSING_KEY) === "1";
        } catch {
          return false;
        }
      })();
      let missingAt = 0;
      let missingVisit = -1;
      const missingOnly = () => missingOn;
      const setMissingOnly = (on2) => {
        missingOn = on2;
        missingAt = on2 ? Date.now() : 0;
        filteredSize = -1;
        try {
          on2 ? sessionStorage.setItem(MISSING_KEY, "1") : sessionStorage.removeItem(MISSING_KEY);
        } catch {
        }
      };
      let clickingFull = false;
      onStart(() => {
        addEventListener(
          "click",
          (e) => {
            const b = e.target.closest?.(VIEW_TAB_TAGS);
            if (!b || clickingFull || b.closest(".aqm-root") || b.classList.contains("aqm-missing-tab") || !VIEW_TABS.test(tabText(b))) return;
            setMissingOnly(false);
            setTimeout(markMissingTab, 50);
          },
          true
        );
      });
      function markMissingTab() {
        if (!location.pathname.startsWith("/jeu/collection")) return;
        const tabs = viewTabs();
        const full = tabs.find((b) => /^album complet$/i.test(tabText(b)));
        if (!full) return;
        const selected = pickedTab(tabs) ?? full;
        if (missingOn && missingVisit !== pageVisit) {
          missingVisit = pageVisit;
          missingAt = Date.now();
          if (selected !== full) {
            clickingFull = true;
            full.click();
            clickingFull = false;
          }
        }
        if (missingOn && selected !== full && Date.now() - missingAt > 2e3) setMissingOnly(false);
        const on2 = missingOnly();
        const plain = tabs.find((b) => b !== selected) ?? full;
        const group = full.parentElement;
        const ours = [...group.children].filter((el) => el.__aqmMissingTab || el.classList.contains("aqm-missing-tab"));
        let tab = ours[0] ?? null;
        for (const el of [...ours.slice(1), ...group.querySelectorAll(":scope > button:not([role]):not([class])")]) if (el !== tab && !el.textContent.trim()) el.remove();
        if (!tab) {
          tab = h("button", {
            type: "button",
            class: `${plain.className} aqm-missing-tab`,
            onclick: () => {
              const now = !missingOnly();
              setMissingOnly(now);
              if (now && selected !== full) {
                clickingFull = true;
                full.click();
                clickingFull = false;
              }
              markMissingTab();
            }
          }, "Manquantes");
          tab.__aqmMissingTab = true;
          full.after(tab);
        }
        fitTabs(full.parentElement, tab, full);
        const slider = [...full.parentElement.children].find((el) => !tabs.includes(el) && el !== tab && !el.closest(".aqm-root") && getComputedStyle(el).position === "absolute");
        const pill = [...full.querySelectorAll("*")].find((el) => getComputedStyle(el).position === "absolute") ?? (selected === full ? slider : null);
        if (slider && slider !== pill) slider.toggleAttribute("data-aqm-pill-off", on2);
        const source = pill ?? (selected === full && !on2 ? full : null);
        if (source && !pillLook) {
          const cs = getComputedStyle(source);
          if (cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none")
            pillLook = { background: cs.backgroundImage !== "none" ? cs.backgroundImage : cs.backgroundColor, radius: cs.borderRadius, shadow: cs.boxShadow };
        }
        if (!plainColor) plainColor = getComputedStyle(plain).color;
        if (!pickedColor && selected === full && !on2) pickedColor = getComputedStyle(full).color;
        pill?.toggleAttribute("data-aqm-pill-off", on2);
        full.toggleAttribute("data-aqm-unpicked", on2);
        full.style.setProperty("--aqm-plain-color", plainColor);
        const look = `${plain.className} aqm-missing-tab${on2 ? " is-on" : ""}`;
        if (tab.className !== look) tab.className = look;
        tab.style.setProperty("--aqm-pill-bg", pillLook?.background || "rgba(255, 255, 255, 0.12)");
        tab.style.setProperty("--aqm-pill-radius", pillLook?.radius || "999px");
        tab.style.setProperty("--aqm-pill-shadow", pillLook?.shadow && pillLook.shadow !== "none" ? pillLook.shadow : "none");
        tab.style.setProperty("--aqm-picked-color", pickedColor || "#fff");
        if (tab.textContent !== "Manquantes") tab.textContent = "Manquantes";
        tab.setAttribute("aria-pressed", String(on2));
        filterMissing(on2);
        showMissingSummary(full.parentElement, on2);
        showMissingExtras(on2);
      }
      let cardsShown = null;
      let missingExtra = null;
      let extraAsking = null;
      let extraAskedAt = 0;
      onStart(
        () => addEventListener("message", (e) => {
          if (e.source !== window || e.origin !== location.origin) return;
          if (e.data?.aquaman === "cards-shown" && Array.isArray(e.data.ids) && sameQuery(String(e.data.query ?? ""), pageFilter())) {
            cardsShown = { query: String(e.data.query ?? ""), ids: new Set(e.data.ids), names: new Map((e.data.names ?? []).filter((x) => Array.isArray(x)).map(([id, name, series]) => [id, [String(name ?? ""), String(series ?? "")]])) };
            markMissingTab();
          }
        })
      );
      function pageFilter() {
        const p = new URLSearchParams(location.search);
        return { album: p.get("vue") === "album", manga: p.get("serie") || "", rarity: p.get("rarete") || "", kind: p.get("type") || "", q: (p.get("q") || "").trim().slice(0, 80) };
      }
      const sameQuery = (query, f) => {
        const p = new URLSearchParams(query);
        return !p.has("owned") && (p.get("manga") || "") === f.manga && (p.get("rarity") || "") === f.rarity && (p.get("type") || "") === f.kind && (p.get("q") || "") === f.q;
      };
      function askMissingExtra(f, key) {
        if (extraAsking || Date.now() - extraAskedAt < 1e4) return;
        extraAskedAt = Date.now();
        extraAsking = (async () => {
          for (let tries = 0; tries < 10 && !stopped; tries++) {
            const r = await ask({ type: "missing-cards", rarity: f.rarity, kind: f.kind, q: f.q, manga: f.manga });
            missingExtra = { key, at: Date.now(), cards: r.cards ?? [], pending: r.pending ?? 0 };
            markMissingTab();
            if (!(r.pending > 0) || key !== JSON.stringify(pageFilter())) break;
          }
        })().catch(() => {
        }).finally(() => extraAsking = null);
      }
      function showMissingExtras(on2) {
        const page = document.querySelector("main") ?? document.body;
        const old = page.querySelector(".aqm-missing-extra");
        const f = pageFilter();
        const key = JSON.stringify(f);
        const clear = () => old?.remove();
        if (!on2 || !f.album) return clear();
        if (!missingExtra || missingExtra.key !== key || Date.now() - missingExtra.at > MISSING_FRESH) askMissingExtra(f, key);
        if (!cardsShown || !sameQuery(cardsShown.query, f) || missingExtra?.key !== key) return clear();
        const links = [...page.querySelectorAll('a[href^="/jeu/carte/"]')].filter((a) => !a.closest(".aqm-root"));
        const lists = [...new Set(links.map((a) => a.closest("ul")).filter(Boolean))];
        if (!lists.length || links.length < cardsShown.ids.size) return clear();
        const extras = missingExtra.cards.filter((c) => !cardsShown.ids.has(c.id));
        if (!extras.length) return clear();
        const sig = `${key}|${extras.map((c) => c.id).join(",")}`;
        const last = lists[lists.length - 1];
        if (old?.dataset.sig === sig && old.previousElementSibling === last) return;
        const tileOf = (a) => a.closest("li");
        const models = {};
        for (const a of links) {
          const label = a.getAttribute("aria-label") ?? "";
          const code = Object.keys(RARITY_NAMES).find((c) => label.includes(`, ${RARITY_NAMES[c]}`));
          const id = a.getAttribute("href").split("/").pop();
          if (code && !models[code] && cardsShown.names.has(id) && tileOf(a)) models[code] = { li: tileOf(a), id };
        }
        const box = h(
          "div",
          { class: "aqm-root aqm-missing-extra", "data-sig": sig },
          h("p", { class: "aqm-missing-extra-note" }, `${fmt(extras.length)} carte${extras.length > 1 ? "s" : ""} manquante${extras.length > 1 ? "s" : ""} que le jeu n’affiche pas ici, ajoutée${extras.length > 1 ? "s" : ""} par Aquaman`),
          h("ul", { class: last.className }, extras.map((c) => missingTile(c, models[c.rarity] ?? Object.values(models)[0], cardsShown.names)))
        );
        old?.remove();
        last.after(box);
      }
      function missingTile(c, model, names) {
        const href = `/jeu/carte/${encodeURIComponent(c.id)}`;
        const label = `${c.name}, ${RARITY_NAMES[c.rarity] ?? c.rarity}, pas encore obtenue`;
        if (!model) return h("li", {}, h("a", { href, "aria-label": label, class: "aqm-missing-plain" }, h("img", { src: cardImageUrl(c.image), alt: c.name, loading: "lazy" }), h("span", {}, c.name)), h("p", { class: "aqm-muted" }, "Manquante"));
        const li = bareCopy(model.li);
        li.querySelectorAll(".aqm-sale").forEach((el) => el.remove());
        const a = li.querySelector("a");
        if (a) {
          a.setAttribute("href", href);
          a.setAttribute("aria-label", label);
        }
        const img = li.querySelector("img");
        if (img) {
          img.removeAttribute("srcset");
          img.removeAttribute("sizes");
          img.src = cardImageUrl(c.image);
          img.alt = c.name;
          img.loading = "lazy";
        }
        const [name, series] = names.get(model.id) ?? [];
        const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const t = n.textContent.trim();
          if (name && t === name) n.textContent = c.name;
          else if (series && t === series) n.textContent = c.series;
        }
        const tag = [...li.querySelectorAll("p")].find((p) => /^(manquante|[×x]\s*\d+)/i.test(p.textContent.trim()));
        if (tag) tag.replaceChildren(h("span", { class: "text-zinc-600" }, "Manquante"), ...c.maxCopies ? [h("span", { class: "text-zinc-500" }, `${c.minted ?? 0}/${c.maxCopies}`)] : []);
        return li;
      }
      let missingCounts = null;
      let missingAsking = null;
      let missingAskedAt = 0;
      function askMissingCounts() {
        if (missingAsking || Date.now() - missingAskedAt < 15e3) return;
        missingAskedAt = Date.now();
        missingAsking = (async () => {
          for (let tries = 0; tries < 15 && !stopped; tries++) {
            const counts = await ask({ type: "rarity-counts" });
            missingCounts = { at: Date.now(), byRarity: counts.byRarity, pending: counts.pending, counted: counts.counted, series: counts.series };
            markMissingTab();
            if (!(counts.pending > 0) || counts.failed) break;
          }
        })().catch(() => {
        }).finally(() => missingAsking = null);
      }
      onStart(
        () => addEventListener("message", (e) => {
          if (e.source === window && e.data?.aquaman === "collection-stale") forgetMissing();
        })
      );
      function showMissingSummary(row, on2) {
        const bar = row?.parentElement;
        let box = bar?.parentElement?.querySelector(":scope > .aqm-missing-summary");
        if (!on2) {
          if (box) box.hidden = true;
          return;
        }
        if (!bar?.parentElement) return;
        if (!box) {
          box = h("div", { class: "aqm-root aqm-missing-summary", role: "status" });
          bar.after(box);
        }
        box.hidden = false;
        if (!missingCounts || Date.now() - missingCounts.at > MISSING_FRESH) askMissingCounts();
        const sig = JSON.stringify(missingCounts);
        if (box.dataset.sig === sig) return;
        box.dataset.sig = sig;
        if (!missingCounts) return void box.replaceChildren("Comptage des cartes manquantes…");
        const rows = Object.entries(missingCounts.byRarity ?? {}).map(([code, r]) => [code, Math.max(0, (r.total || 0) - (r.owned || 0))]).filter(([, n]) => n > 0);
        const sum = rows.reduce((n, [, m]) => n + m, 0);
        box.replaceChildren(
          ...[
            h("span", { class: "aqm-label" }, "Manquantes"),
            ...rows.map(([code, n]) => h("span", { class: "aqm-missing-count" }, h("strong", {}, fmt(n)), rarityCode(code))),
            h("span", { class: "aqm-missing-count is-total" }, h("strong", {}, fmt(sum)), "au total"),
            missingCounts.pending > 0 ? h("small", { class: "aqm-muted" }, `(comptage : ${fmt(missingCounts.counted)} séries sur ${fmt(missingCounts.series)}…)`) : null
          ].filter(Boolean)
          // (replaceChildren écrirait « null »)
        );
      }
      function fitTabs(group, tab, full) {
        if (!group) return;
        const cs = getComputedStyle(group);
        if (cs.display.includes("grid")) {
          const count = [...group.children].filter((el) => el === tab || el.getAttribute("role") === "radio" || el.matches("button, a")).length;
          const cols = `repeat(${count}, minmax(0, auto))`;
          if (group.style.gridTemplateColumns !== cols) group.style.gridTemplateColumns = cols;
        } else if (Math.abs(tab.getBoundingClientRect().top - full.getBoundingClientRect().top) > 4) {
          group.style.flexWrap = "nowrap";
        }
      }
      let pillLook = null;
      let plainColor = "";
      let pickedColor = "";
      let filteredSize = -1;
      function filterMissing(on2) {
        if (!on2) {
          if (filteredSize !== -1 || document.querySelector("[data-aqm-owned-card]")) document.querySelectorAll("[data-aqm-owned-card]").forEach((el) => el.removeAttribute("data-aqm-owned-card"));
          filteredSize = -1;
          return;
        }
        const size = (document.querySelector("main") ?? document.body).getElementsByTagName("*").length;
        if (size === filteredSize) return;
        filteredSize = size;
        const LABEL = /^(manquante|[×x]\s*\d+)$/i;
        const says = (el) => LABEL.test(el.textContent.replace(/\s+/g, " ").trim());
        const page = document.querySelector("main") ?? document.body;
        const labels = [...page.querySelectorAll("*")].filter((el) => el.childElementCount < 4 && !el.closest(".aqm-root") && says(el) && ![...el.children].some(says));
        const held = /* @__PURE__ */ new Map();
        for (const label of labels) for (let el = label; el; el = el.parentElement) held.set(el, (held.get(el) ?? 0) + 1);
        document.querySelectorAll("[data-aqm-owned-card]").forEach((el) => el.removeAttribute("data-aqm-owned-card"));
        for (const label of labels) {
          let tile = label;
          for (let up = tile.parentElement; up && up !== page && held.get(up) === 1; up = tile.parentElement) {
            if (labels.length === 1 && tile.querySelector("img") && up.childElementCount > 1) break;
            tile = up;
          }
          tile.toggleAttribute("data-aqm-owned-card", tile !== label && !!tile.querySelector("img") && !/^manquante$/i.test(label.textContent.trim()));
        }
      }
      const saleOf = /* @__PURE__ */ new Map();
      let saleWatch = null;
      function markMissingSales() {
        if (!location.pathname.startsWith("/jeu/collection")) return;
        saleWatch ??= new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              saleWatch.unobserve(e.target);
              showSale(e.target);
            }
          },
          { rootMargin: "300px" }
        );
        const extra = [...document.querySelectorAll(".aqm-missing-extra")].flatMap((box) => elementsWithText(box, /^\s*manquante\s*$/i));
        for (const el of [...elementsWithText(document.body, /^\s*manquante\s*$/i), ...extra]) {
          if (el.childElementCount || el.hasAttribute("data-aqm-sale") || !/^manquante$/i.test(el.textContent.trim())) continue;
          el.setAttribute("data-aqm-sale", "");
          saleWatch.observe(el);
        }
      }
      let salesReading = 0;
      const salesWaiting = [];
      function readSale(ask2) {
        return new Promise((resolve, reject) => {
          salesWaiting.push(() => ask2().then(resolve, reject));
          nextSale();
        });
      }
      function nextSale() {
        while (salesReading < 2 && salesWaiting.length) {
          salesReading++;
          salesWaiting.shift()().finally(() => {
            salesReading--;
            nextSale();
          });
        }
      }
      async function showSale(label) {
        let tile = label.parentElement;
        for (let up = 0; tile && up < 6 && !tile.querySelector("img"); up++) tile = tile.parentElement;
        const img = tile?.querySelector("img");
        const image = imageKey2(img?.currentSrc || img?.getAttribute("src"));
        if (!image) return;
        const link = tile.querySelector('a[href*="/jeu/carte/"]') ?? tile.closest('a[href*="/jeu/carte/"]');
        const id = link?.getAttribute("href").match(/\/jeu\/carte\/([^/?#]+)/)?.[1];
        let sale = saleOf.get(image);
        if (!sale || Date.now() - sale.at > 12e4) {
          const series = new URLSearchParams(location.search).get("serie");
          sale = { at: Date.now(), read: readSale(() => ask({ type: "card-sale", id: id ? decodeURIComponent(id) : null, image, name: img.alt?.trim() || null, series })) };
          saleOf.set(image, sale);
        }
        const r = await sale.read.catch(() => null);
        if (!r?.count || !label.isConnected || label.nextElementSibling?.classList.contains("aqm-sale")) return;
        const offers = `En vente : ${r.count} offre${r.count > 1 ? "s" : ""} au marché`;
        label.after(h("span", { class: "aqm-root aqm-sale", title: offers }, "En vente"));
        label.setAttribute("data-aqm-sale", "on");
      }
      let albumBusy = false;
      function markAlbum() {
        if (!location.pathname.startsWith("/jeu/collection")) return;
        const id = new URLSearchParams(location.search).get("serie");
        const title = document.getElementById("album-title");
        if (!id || !title || albumBusy) return;
        const panel = title.closest("section") ?? title.parentElement?.parentElement;
        if (!panel || panel.closest(".aqm-root")) return;
        const box = panel.querySelector(":scope > .aqm-album");
        if (box?.dataset.series === id) return;
        box?.remove();
        const fresh = h("div", { class: "aqm-root aqm-album", "data-series": id });
        panel.append(fresh);
        renderAlbum(fresh, id);
      }
      async function renderAlbum(box, id) {
        albumBusy = true;
        let st;
        try {
          st = await ask({ type: "series-status", id });
        } catch {
          box.remove();
          return;
        } finally {
          albumBusy = false;
        }
        if (!box.isConnected) return;
        const note = h("span", { class: "aqm-album-note", role: "status" });
        const fav = h("button", { type: "button", class: "aqm-album-btn" });
        const paintFav = () => {
          fav.classList.toggle("is-on", st.favorite);
          fav.textContent = st.favorite ? "★ Dans tes favoris" : "☆ Ajouter aux favoris";
          fav.title = st.favorite ? "Retirer des séries favorites" : "Ajouter aux séries favorites (Plus → Séries favorites)";
        };
        fav.addEventListener("click", async () => {
          fav.disabled = true;
          await toggleFavorite(id, !st.favorite);
          st.favorite = !st.favorite;
          paintFav();
          fav.disabled = false;
        });
        paintFav();
        const want = h("button", { type: "button", class: "aqm-album-btn is-main" });
        const paintWant = () => {
          want.hidden = !st.missing;
          want.disabled = !st.toWant;
          want.textContent = st.toWant > 1 ? `🔭 Rechercher les ${st.toWant} manquantes` : st.toWant ? "🔭 Rechercher la manquante" : "🔭 Toutes les manquantes sont recherchées";
          want.title = "Les mettre dans ta liste de recherches : le jeu te prévient quand elles sont mises en vente";
        };
        want.addEventListener("click", async () => {
          want.disabled = true;
          const r = await enqueueWants(st.toWantIds);
          st.toWantIds = [];
          st.toWant = 0;
          paintWant();
          want.textContent = r.sent == null ? "🔭 En attente dans Aquaman" : "🔭 Recherche en cours…";
          note.textContent = wantsNote(r, "tu peux changer de page ou ouvrir des boosters");
        });
        paintWant();
        const guard = h("button", { type: "button", class: "aqm-album-btn aqm-guard" });
        const paintGuard = () => {
          guard.classList.toggle("is-on", !!st.guarded);
          guard.textContent = st.guarded ? "🔒 Uniques verrouillées" : "🔒 Verrouiller les uniques";
          guard.title = st.guarded ? "Les cartes de cette série dont tu n’as qu’un exemplaire sont verrouillées, et celles qui descendent à un seul le seront aussi. Clique pour arrêter (rien n’est déverrouillé)." : "Verrouille les cartes de cette série dont tu n’as qu’un exemplaire (ni vente, ni échange, ni recyclage), puis celles qui descendront à un seul exemplaire";
        };
        guard.addEventListener("click", async () => {
          guard.disabled = true;
          try {
            if (st.guarded) {
              await ask({ type: "set-guarded", id, on: false });
              st.guarded = false;
              note.textContent = "Cette série n’est plus surveillée. Les cartes déjà verrouillées le restent.";
            } else {
              guard.textContent = "🔒 Verrouillage…";
              const r = await lockSingles(new Set(st.cardIds ?? []));
              await ask({ type: "set-guarded", id, cardIds: st.cardIds ?? [], on: true });
              st.guarded = true;
              note.textContent = guardNote(r);
            }
          } catch (e) {
            note.textContent = `Verrouillage impossible : ${e.message}`;
          }
          guard.disabled = false;
          paintGuard();
        });
        paintGuard();
        box.replaceChildren(fav, want, guard, note);
      }
      const guardNote = (r) => [
        r.locked ? `🔒 ${fmt(r.locked)} carte${r.locked > 1 ? "s" : ""} verrouillée${r.locked > 1 ? "s" : ""}` : "Aucune carte à verrouiller pour le moment",
        r.already ? `${fmt(r.already)} déjà verrouillée${r.already > 1 ? "s" : ""}` : null,
        r.onSale ? `${fmt(r.onSale)} en vente (verrouillée${r.onSale > 1 ? "s" : ""} si elle${r.onSale > 1 ? "s" : ""} revien${r.onSale > 1 ? "nent" : "t"})` : null,
        r.failed ? `${fmt(r.failed)} refusée${r.failed > 1 ? "s" : ""} par le jeu${r.error ? ` (« ${r.error} »)` : ""}` : null
      ].filter(Boolean).join(" · ") + ". Les cartes qui descendront à un seul exemplaire seront verrouillées aussi.";
      let locking = Promise.resolve();
      function lockSingles(cards) {
        const run2 = locking.then(async () => {
          const r = { locked: 0, already: 0, onSale: 0, failed: 0, error: null };
          if (!cards.size) return r;
          const { copies } = await gameWrite("/copies", "GET") ?? {};
          const byCard = /* @__PURE__ */ new Map();
          for (const c of Array.isArray(copies) ? copies : []) {
            const id = c?.card?.id;
            if (!id || !cards.has(id)) continue;
            if (!byCard.has(id)) byCard.set(id, []);
            byCard.get(id).push(c);
          }
          for (const list of byCard.values()) {
            if (list.length !== 1) continue;
            const [c] = list;
            if (c.protected) {
              r.already++;
              continue;
            }
            if (c.locked) {
              r.onSale++;
              continue;
            }
            const { copyId } = c;
            if (typeof copyId !== "string" || !copyId) {
              r.failed++;
              r.error ??= "exemplaire sans identifiant";
              continue;
            }
            for (let tries = 0; ; tries++) {
              try {
                await gameWrite(`/copies/${encodeURIComponent(copyId)}/protect`, "PUT");
                r.locked++;
                break;
              } catch (e) {
                if (!e.slowDown || tries >= 3) {
                  r.failed++;
                  r.error ??= e.message;
                  break;
                }
                await pause(e.wait || 3e3);
              }
            }
          }
          if (r.locked) lockedAt = 0;
          return r;
        });
        locking = run2.catch(() => {
        });
        return run2;
      }
      let guardTimer = 0;
      let guardAt = 0;
      function guardSoon(delay = 8e3) {
        clearTimeout(guardTimer);
        guardTimer = setTimeout(guardSeries, delay);
      }
      async function guardSeries() {
        if (stopped || !on("albumButtons")) return;
        if (cardsWindowRow() || opening || drawing) return void guardSoon(5e3);
        guardAt = Date.now();
        try {
          const { series } = await ask({ type: "guarded-series" });
          const cards = new Set(Object.values(series ?? {}).flat());
          if (!cards.size) return;
          const r = await lockSingles(cards);
          if (r.locked) {
            const box = document.querySelector(".aqm-album .aqm-album-note");
            if (box) box.textContent = `🔒 ${fmt(r.locked)} carte${r.locked > 1 ? "s" : ""} descendue${r.locked > 1 ? "s" : ""} à un exemplaire, verrouillée${r.locked > 1 ? "s" : ""}.`;
          }
        } catch {
        }
      }
      function watchGuards() {
        if (Date.now() - guardAt >= 10 * 6e4) guardSoon(1e3);
      }
      const statsTitle = () => [...document.querySelectorAll("main h1, h1")].find((el) => !el.closest(".aqm-root, .aqm-overlay") && /^\s*ta\s+collection/i.test(el.textContent));
      const vitrineButton = () => [...document.querySelectorAll("main button, main a")].find((b) => !b.closest(".aqm-root, .aqm-overlay, .aqm-stats-open") && /^\s*ma vitrine\s*$/i.test(b.textContent));
      function markCollectionStats() {
        if (!location.pathname.startsWith("/jeu/collection")) return;
        const shown = document.querySelector(".aqm-stats-open");
        if (shown?.isConnected && !shown.classList.contains("is-early")) return;
        const title = statsTitle();
        const vitrine = vitrineButton();
        if (!title || !vitrine) return;
        const btn = shown?.isConnected ? shown : statsButton(vitrine);
        stopEarlyStats();
        btn.classList.remove("is-early");
        btn.style.removeProperty("--aqm-x");
        btn.style.removeProperty("--aqm-y");
        title.setAttribute("data-aqm-stats-title", "");
        title.append(btn);
        placeStatsButton();
        watchStatsPlace(title);
      }
      let statsWatch = null;
      function watchStatsPlace(title) {
        statsWatch?.disconnect();
        statsWatch = new ResizeObserver(() => placeStatsButton());
        statsWatch.observe(title);
        const row = vitrineButton()?.parentElement;
        if (row) statsWatch.observe(row);
      }
      function statsButton(vitrine) {
        const gameIcon = vitrine.querySelector("svg");
        const icon = h("span", { html: ICON_CHART }).firstElementChild;
        icon.setAttribute("class", gameIcon?.getAttribute("class") || "aqm-stats-ico");
        const btn = h(
          "button",
          {
            type: "button",
            class: `${vitrine.className} aqm-stats-open`,
            title: "Ta progression : pourcentage de la collection, cartes par rareté, séries complètes et cartes gagnées chaque jour",
            onclick: openCollectionStats
          },
          icon,
          "Ma progression"
        );
        const cs = getComputedStyle(vitrine);
        for (const p of ["font-family", "font-size", "font-weight", "font-style", "letter-spacing", "line-height", "text-transform", "color"])
          btn.style.setProperty(p, cs.getPropertyValue(p));
        btn.style.setProperty("-webkit-text-fill-color", cs.getPropertyValue("color"));
        return btn;
      }
      let earlyTimer = 0;
      let earlyWatch = null;
      function stopEarlyStats() {
        clearInterval(earlyTimer);
        earlyTimer = 0;
        earlyWatch?.disconnect();
        earlyWatch = null;
      }
      function earlyStatsButton() {
        if (!location.pathname.startsWith("/jeu/collection") || !on("collectionStats")) return;
        const since = Date.now();
        const look = () => {
          if (stopped || document.querySelector(".aqm-stats-open")) return;
          const title = statsTitle();
          const vitrine = vitrineButton();
          if (!title || !vitrine || !document.body) return void (Date.now() - since < 15e3 && setTimeout(look, 80));
          const btn = statsButton(vitrine);
          btn.classList.add("aqm-root", "is-early");
          document.body.append(btn);
          const follow = () => btn.isConnected && btn.classList.contains("is-early") ? placeEarly(btn, title) : stopEarlyStats();
          follow();
          earlyWatch = new ResizeObserver(follow);
          earlyWatch.observe(title);
          earlyTimer = setInterval(follow, 250);
        };
        look();
      }
      function placeEarly(btn, title) {
        if (!title.isConnected) return void btn.remove();
        const t = title.getBoundingClientRect();
        const set = (x, y, below) => {
          btn.style.setProperty("--aqm-x", `${Math.round(x + scrollX)}px`);
          btn.style.setProperty("--aqm-y", `${Math.round(y + scrollY)}px`);
          btn.classList.toggle("is-below", below);
        };
        set(t.right + 20, t.top + t.height / 2, false);
        const b = btn.getBoundingClientRect();
        const row = vitrineButton()?.parentElement?.getBoundingClientRect();
        const blocked = row && b.right + 8 > row.left && b.left < row.right && b.top < row.bottom && b.bottom > row.top;
        if (blocked || b.right > document.documentElement.clientWidth - 8) {
          stopEarlyStats();
          btn.remove();
        }
      }
      function placeStatsButton() {
        const btn = document.querySelector(".aqm-stats-open");
        if (!btn?.isConnected || btn.classList.contains("is-early")) return;
        const title = document.querySelector("[data-aqm-stats-title]");
        const row = vitrineButton()?.parentElement;
        if (!title) return;
        const t = title.getBoundingClientRect();
        const w = btn.offsetWidth;
        const hgt = btn.offsetHeight;
        const left = t.right + 20;
        const top = t.top + t.height / 2 - hgt / 2;
        const r = row?.getBoundingClientRect();
        const blocked = r && left + w + 8 > r.left && left < r.right && top < r.bottom && top + hgt > r.top;
        const fits = !blocked && left + w <= document.documentElement.clientWidth - 8;
        if (fits || !row) {
          if (btn.parentElement !== title) title.append(btn);
          btn.classList.remove("is-in-row");
          btn.classList.toggle("is-below", !fits);
        } else {
          if (btn.parentElement !== row) row.append(btn);
          btn.classList.remove("is-below");
          btn.classList.add("is-in-row");
        }
      }
      let statsResize = 0;
      onStart(() => {
        addEventListener("resize", () => {
          clearTimeout(statsResize);
          statsResize = setTimeout(placeStatsButton, 150);
        });
      });
      let snapAt = 0;
      let snapTimer = 0;
      function snapCollection(soon = false) {
        if (soon) {
          clearTimeout(snapTimer);
          snapTimer = setTimeout(() => {
            if (stopped || !on("collectionStats")) return;
            snapAt = Date.now();
            send({ type: "collection-snapshot" });
          }, Math.max(1e4, snapAt + 5 * 6e4 - Date.now()));
          return;
        }
        if (Date.now() - snapAt < 30 * 6e4) return;
        snapAt = Date.now();
        send({ type: "collection-snapshot" });
      }
      const DAY_MS = 864e5;
      const dayOf = (t) => new Date(t).toLocaleDateString("sv-SE");
      const dayLabel = (key, long = false) => (/* @__PURE__ */ new Date(`${key}T12:00:00`)).toLocaleDateString("fr-FR", long ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "short" });
      const signed = (n) => n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : "0";
      async function openCollectionStats() {
        const body = openOverlay("Ma progression", "Ta collection sur le total du jeu, carte par rareté, et les cartes que tu gagnes chaque jour.");
        body.parentElement.classList.add("aqm-panel-wide");
        const view = h("div", { class: "aqm-progress" }, h("p", { class: "aqm-note" }, "Lecture de ta collection…"));
        body.append(view);
        let s;
        try {
          s = await ask({ type: "collection-stats", fresh: true });
        } catch (e) {
          if (view.isConnected) view.replaceChildren(h("p", { class: "aqm-note" }, e.message));
          return;
        }
        if (!view.isConnected) return;
        snapAt = Date.now();
        const share = s.total ? s.owned / s.total : 0;
        const bar = (part, cls = "") => h("span", { class: `aqm-bar${cls}` }, h("span", { style: `width:${(100 * Math.min(1, Math.max(0, part || 0))).toFixed(2)}%` }));
        const byDay = new Map(s.history.map((d) => [d.day, d]));
        const todayGain = byDay.get(s.today)?.gain ?? 0;
        const tile = (label, value, sub) => h("div", { class: "aqm-progress-tile" }, h("p", { class: "aqm-label" }, label), h("strong", {}, value), sub ? h("small", {}, sub) : null);
        const hero = h(
          "div",
          { class: "aqm-progress-hero" },
          h("div", {}, h("strong", { class: "aqm-progress-pct" }, pct(share)), h("p", { class: "aqm-muted" }, `${fmt(s.owned)} cartes uniques sur ${fmt(s.total)}`)),
          bar(share, " aqm-bar-big")
        );
        const tiles = h(
          "div",
          { class: "aqm-progress-tiles" },
          tile("Cartes manquantes", fmt(s.missing), s.total ? `${pct(s.missing / s.total)} du jeu` : null),
          tile("Séries complètes", fmt(s.complete), s.series ? `sur ${fmt(s.series)} séries · ${fmt(s.albums)} album${s.albums > 1 ? "s" : ""} réclamé${s.albums > 1 ? "s" : ""}` : `${fmt(s.albums)} album${s.albums > 1 ? "s" : ""} réclamé${s.albums > 1 ? "s" : ""}`),
          tile("Aujourd’hui", signed(todayGain), todayGain === 1 || todayGain === -1 ? "carte unique" : "cartes uniques")
        );
        const rarityList = h("ul", { class: "aqm-progress-rarities" });
        const rarityNote = h("p", { class: "aqm-note" });
        const paintRarities = (counts) => {
          const rows = counts ? Object.entries(counts.byRarity).filter(([, r]) => r.total || r.owned) : [];
          const counting = !counts || counts.pending > 0;
          rarityList.replaceChildren(
            ...rows.map(
              ([code, r]) => h(
                "li",
                { class: "aqm-progress-rarity" },
                h("span", { class: "aqm-progress-rname" }, rarityCode(code), h("small", {}, RARITY_NAMES[code] ?? code)),
                h(
                  "div",
                  { class: "aqm-progress-rbar" },
                  h("p", {}, h("strong", {}, fmt(r.owned)), r.total ? h("small", {}, ` / ${fmt(r.total)} · ${pct(r.owned / r.total)}`) : null),
                  bar(r.total ? r.owned / r.total : 0, ` aqm-bar-${code}`)
                ),
                h("span", { class: "aqm-progress-copies", title: "Exemplaires de cette rareté, un par carte (les doublons ne comptent pas)" }, `${fmt(r.copies)} ex.`)
              )
            )
          );
          rarityNote.textContent = !counts ? "Comptage des cartes par rareté…" : counting ? `Comptage des cartes par rareté : ${fmt(counts.counted)} séries sur ${fmt(counts.series)}… (la première fois seulement ; ensuite, seules les séries qui ont changé sont relues)` : "";
          rarityNote.hidden = !rarityNote.textContent;
        };
        paintRarities(s.rarities);
        const countRest = async () => {
          let counts = s.rarities;
          for (let tries = 0; view.isConnected && (!counts || counts.pending > 0) && tries < 100; tries++) {
            const before = counts?.counted ?? -1;
            try {
              counts = await ask({ type: "rarity-counts" });
            } catch {
              break;
            }
            if (!view.isConnected) return;
            paintRarities(counts);
            if (counts.counted === before && counts.failed) break;
          }
          if (view.isConnected && counts?.pending > 0) rarityNote.textContent = `Comptage arrêté à ${fmt(counts.counted)} séries sur ${fmt(counts.series)} : il reprendra à la prochaine ouverture.`;
        };
        const days = [];
        for (let i = 13; i >= 0; i--) days.push(dayOf(Date.now() - i * DAY_MS));
        const top = Math.max(1, ...days.map((d) => byDay.get(d)?.gain ?? 0));
        const chart = h(
          "div",
          { class: "aqm-days", role: "img", "aria-label": "Cartes uniques gagnées chaque jour, sur les 14 derniers jours" },
          days.map((d) => {
            const r = byDay.get(d);
            const tip = r ? `${dayLabel(d, true)} : ${signed(r.gain)} carte${Math.abs(r.gain) > 1 ? "s" : ""} unique${Math.abs(r.gain) > 1 ? "s" : ""}${r.since && r.since !== dayOf((/* @__PURE__ */ new Date(`${d}T12:00:00`)).getTime() - DAY_MS) ? ` (depuis le ${dayLabel(r.since)})` : ""} · ${fmt(r.owned)} au total` : `${dayLabel(d, true)} : pas de relevé (Aquaman n’a pas été ouvert ce jour-là)`;
            const gain = r?.gain ?? 0;
            return h(
              "div",
              { class: `aqm-day${r ? "" : " is-empty"}${d === s.today ? " is-today" : ""}`, title: tip, tabindex: "0", "aria-label": tip },
              h("span", { class: "aqm-day-val" }, r && gain ? signed(gain) : ""),
              h("span", { class: "aqm-day-col" }, h("span", { class: "aqm-day-fill", style: `height:${r && gain > 0 ? Math.max(4, 100 * gain / top).toFixed(1) : 0}%` })),
              h("span", { class: "aqm-day-name" }, d === s.today ? "Auj." : (/* @__PURE__ */ new Date(`${d}T12:00:00`)).toLocaleDateString("fr-FR", { day: "numeric" }))
            );
          })
        );
        const recorded = s.history.filter((d) => days.includes(d.day));
        const twoWeeks = recorded.reduce((n, d) => n + d.gain, 0);
        const first = s.history[0];
        const fromStart = first ? s.owned - (first.owned - first.gain) : 0;
        const daysNote = s.history.length <= 1 ? "Aquaman relève ta collection chaque jour où tu joues : la courbe se remplit à partir d’aujourd’hui." : `${signed(twoWeeks)} cartes uniques sur les 14 derniers jours · ${signed(fromStart)} depuis le ${dayLabel(first.day)}, premier relevé.`;
        view.replaceChildren(
          hero,
          tiles,
          h("h3", { class: "aqm-progress-h" }, "Par rareté"),
          rarityList,
          rarityNote,
          h("h3", { class: "aqm-progress-h" }, "Progression journalière"),
          chart,
          h("p", { class: "aqm-note" }, daysNote)
        );
        countRest();
      }
      function scrollsSideways(el, style2) {
        if (el.scrollWidth - el.clientWidth < 4) return false;
        if (/(auto|scroll)/.test(style2.overflowX)) return true;
        return style2.overflowX === "hidden" && el.children.length >= 3 && style2.textOverflow !== "ellipsis";
      }
      let snapBack = null;
      function onWheel(e) {
        if (stopped || !location.pathname.startsWith("/jeu/collection") || e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        for (let el = e.target instanceof Element ? e.target : null; el && el !== document.body; el = el.parentElement) {
          const style2 = getComputedStyle(el);
          if (!scrollsSideways(el, style2)) continue;
          if (/(auto|scroll)/.test(style2.overflowY) && el.scrollHeight - el.clientHeight > 24) return;
          const max = el.scrollWidth - el.clientWidth;
          const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * el.clientWidth : e.deltaY;
          if (delta < 0 && el.scrollLeft <= 0 || delta > 0 && el.scrollLeft >= max - 1) return;
          e.preventDefault();
          holdSnap(el, 250);
          el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + delta));
          return;
        }
      }
      function sidewaysStrip(from) {
        for (let el = from instanceof Element ? from : null; el && el !== document.body; el = el.parentElement) {
          const style2 = getComputedStyle(el);
          if (!scrollsSideways(el, style2)) continue;
          if (/(auto|scroll)/.test(style2.overflowY) && el.scrollHeight - el.clientHeight > 24) return null;
          return el;
        }
        return null;
      }
      function holdSnap(el, ms) {
        if (snapBack?.el !== el) {
          restoreSnap();
          snapBack = { el, snap: el.style.scrollSnapType, smooth: el.style.scrollBehavior, timer: 0 };
          el.style.scrollSnapType = "none";
          el.style.scrollBehavior = "auto";
        }
        clearTimeout(snapBack.timer);
        if (ms) snapBack.timer = setTimeout(restoreSnap, ms);
      }
      function swallowClick() {
        const stop = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        document.addEventListener("click", stop, { capture: true, once: true });
        setTimeout(() => document.removeEventListener("click", stop, true), 400);
      }
      let grab = null;
      function onGrabDown(e) {
        if (stopped || e.pointerType !== "mouse" || e.button !== 0 || !location.pathname.startsWith("/jeu/collection")) return;
        if (e.target.closest?.(".aqm-slot, .aqm-root, input, textarea, select, [contenteditable]")) return;
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
          root.classList.add("aqm-grabbing");
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
        root.classList.remove("aqm-grabbing");
        holdSnap(g.el, 250);
        if (e.type === "pointerup") swallowClick();
      }
      const onGrabDragStart = (e) => grab && grab.el.contains(e.target) && e.preventDefault();
      function markSeriesStrip() {
        if (!location.pathname.startsWith("/jeu/collection")) return;
        const strip = seriesStrip();
        if (strip && !strip.classList.contains("aqm-grab") && scrollsSideways(strip, getComputedStyle(strip))) strip.classList.add("aqm-grab");
      }
      function restoreSnap() {
        if (!snapBack) return;
        clearTimeout(snapBack.timer);
        snapBack.el.style.scrollSnapType = snapBack.snap;
        snapBack.el.style.scrollBehavior = snapBack.smooth;
        snapBack = null;
      }
      const slotKey = (slot) => imageKey2(slot.querySelector("img")?.currentSrc || slot.querySelector("img")?.src);
      let press = null;
      let moving = false;
      const vitrines = /* @__PURE__ */ new Set();
      function showcaseSlots(dlg) {
        const slots = [];
        const seen = /* @__PURE__ */ new Set();
        for (const btn of dlg.querySelectorAll("button")) {
          if (btn.querySelector("img") || btn.closest(".aqm-root")) continue;
          let el = btn.parentElement;
          for (let depth = 0; el && el !== dlg && depth < 4 && el.querySelectorAll("button").length < 3; depth++) el = el.parentElement;
          if (!el || el === dlg || seen.has(el)) continue;
          seen.add(el);
          if (!/^(DIV|LI|SPAN)$/.test(el.tagName) || el.querySelectorAll("button").length !== 3 || el.querySelector("img")) continue;
          let slot = el.parentElement;
          while (slot && slot !== dlg && !slot.querySelector("img")) slot = slot.parentElement;
          if (!slot || slot === dlg || slot.querySelectorAll("img").length !== 1) continue;
          slots.push({ slot, controls: el });
        }
        return slots;
      }
      const vitrineGrids = /* @__PURE__ */ new WeakMap();
      function lightenGrid(dlg) {
        const known = vitrineGrids.get(dlg);
        if (known?.isConnected && dlg.contains(known)) return;
        let grid = null;
        for (const el of dlg.querySelectorAll("div, ul, ol")) {
          if (el.children.length >= 12 && el.children.length > (grid?.children.length ?? 0) && el.firstElementChild?.querySelector("img") && !el.closest(".aqm-root")) grid = el;
        }
        if (!grid) return;
        vitrineGrids.set(dlg, grid);
        const cell = grid.firstElementChild.getBoundingClientRect();
        if (cell.height) grid.style.setProperty("--aqm-cell-h", `${Math.round(cell.height)}px`);
        if (cell.width) grid.style.setProperty("--aqm-cell-w", `${Math.round(cell.width)}px`);
        grid.dataset.aqmLite = "";
      }
      function quietChange(r) {
        const target = r.target instanceof Element ? r.target : r.target.parentElement;
        if (!target || target.closest(".aqm-root, [data-aqm-lite]")) return true;
        const nodes = [...r.addedNodes, ...r.removedNodes];
        return nodes.length > 0 && nodes.every((n) => n instanceof Element && n.classList.contains("aqm-root"));
      }
      function showcaseDialogs() {
        const found = new Set([...vitrines].filter((dlg) => dlg.isConnected));
        for (const dlg of document.querySelectorAll('[role="dialog"], [aria-modal="true"]')) {
          if (dlg.closest(".aqm-root")) continue;
          if (/ma vitrine/i.test(dlg.querySelector("h1, h2, h3")?.textContent ?? "")) found.add(dlg);
        }
        if (!found.size)
          for (const label of elementsWithText(document.body, /^\s*ma vitrine\s*$/i)) {
            let el = label;
            while (el && el !== document.body && getComputedStyle(el).position !== "fixed") el = el.parentElement;
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
          dlg.classList.add("aqm-vitrine");
          for (const s of slots) wireSlot(dlg, s);
        }
      }
      function wireSlot(dlg, { slot, controls }) {
        controls.classList.add("aqm-hidden");
        for (const img of slot.querySelectorAll("img")) if (img.draggable) img.draggable = false;
        if (slot.dataset.aqmSlot) return;
        slot.dataset.aqmSlot = "1";
        slot.classList.add("aqm-slot");
        slot.append(
          h("button", {
            type: "button",
            class: "aqm-root aqm-slot-x",
            title: "Retirer de la vitrine",
            "aria-label": "Retirer de la vitrine",
            html: ICON_X,
            onclick: (e) => {
              e.preventDefault();
              e.stopPropagation();
              showcaseSlots(dlg).find((s) => s.slot === slot)?.controls.querySelectorAll("button")[2]?.click();
            }
          })
        );
        slot.addEventListener("dragstart", (e) => e.preventDefault());
        slot.addEventListener("pointerdown", (e) => {
          if (moving || press || e.button !== 0 || e.target.closest(".aqm-slot-x")) return;
          const touch = e.pointerType !== "mouse";
          press = { dlg, slot, key: slotKey(slot), x: e.clientX, y: e.clientY, id: e.pointerId, touch, active: false, ghost: null };
          if (touch) press.timer = setTimeout(() => press?.slot === slot && !press.active && beginDrag(), 350);
        });
      }
      function beginDrag() {
        const r = press.slot.getBoundingClientRect();
        press.active = true;
        press.dx = press.x - r.left;
        press.dy = press.y - r.top;
        const ghost = press.slot.cloneNode(true);
        ghost.removeAttribute("data-aqm-slot");
        ghost.className = "aqm-root aqm-ghost";
        ghost.style.cssText = `width:${r.width}px;height:${r.height}px;transform:translate(${r.left}px,${r.top}px)`;
        document.body.append(ghost);
        press.ghost = ghost;
        press.slot.classList.add("aqm-dragging");
        navigator.vibrate?.(15);
      }
      function slotAt(dlg, x, y) {
        const slot = document.elementFromPoint(x, y)?.closest(".aqm-slot");
        return slot && dlg.contains(slot) ? slot : null;
      }
      const clearOver = (dlg) => dlg.querySelectorAll(".aqm-over").forEach((el) => el.classList.remove("aqm-over"));
      function endPress(drop, e) {
        if (!press) return;
        const p = press;
        press = null;
        clearTimeout(p.timer);
        if (!p.active) return;
        p.ghost.remove();
        p.slot.classList.remove("aqm-dragging");
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
          if (press.touch) return endPress(false);
          beginDrag();
        }
        e.preventDefault();
        press.ghost.style.transform = `translate(${e.clientX - press.dx}px,${e.clientY - press.dy}px)`;
        const over = slotAt(press.dlg, e.clientX, e.clientY);
        if (!over?.classList.contains("aqm-over")) {
          clearOver(press.dlg);
          if (over && over !== press.slot) over.classList.add("aqm-over");
        }
      }
      async function moveSlot(dlg, key, to) {
        if (moving) return;
        moving = true;
        dlg.classList.add("aqm-moving");
        try {
          for (let step = 0; step < 12; step++) {
            const list = showcaseSlots(dlg);
            const at = list.findIndex((s) => slotKey(s.slot) === key);
            if (at < 0 || at === to) break;
            const btn = list[at].controls.querySelectorAll("button")[to > at ? 1 : 0];
            if (!btn || btn.disabled) break;
            btn.click();
            await slotMoved(dlg, key, at);
          }
        } finally {
          moving = false;
          dlg.classList.remove("aqm-moving");
        }
      }
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
          obs.observe(dlg, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
          timer = setTimeout(done, 800);
          check();
        });
      }
      let owned = null;
      let tradesBusy = false;
      let cardImages = null;
      const TRADE_PAGES = /^\/(jeu\/echanges|messages)(\/|$)/;
      async function catalogImages() {
        if (cardImages && Date.now() - cardImages.at < 30 * 6e4) return cardImages.keys;
        const res = await ask({ type: "card-images" });
        cardImages = { at: Date.now(), keys: res.keys ? new Set(res.keys) : null };
        return cardImages.keys;
      }
      async function ownedByImage() {
        if (owned && Date.now() - owned.at < 3e4) return owned.byImage;
        const res = await ask({ type: "ownership" });
        owned = { at: Date.now(), byImage: res.byImage };
        return owned.byImage;
      }
      const tradeDone = /* @__PURE__ */ new WeakMap();
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
          const seen = /* @__PURE__ */ new Set();
          const add = (img, box, gives) => {
            seen.add(img);
            const src = img.currentSrc || img.src;
            const frame = img.parentElement;
            if (!frame || !isCardImage(src) || img.closest(".aqm-root")) return;
            const key = imageKey2(src);
            const n = byImage[key] ?? 0;
            if (!box && !n && !known?.has(key)) return;
            const done = `${key}|${n}|${gives}`;
            if (tradeDone.get(img) === done && frame.querySelector(":scope > .aqm-dot")) return;
            todo.push({ img, frame, box, n, gives, done });
          };
          for (const label of labels) {
            if (!label.isConnected) continue;
            const gives = /donnes/i.test(label.textContent);
            let box = label.parentElement;
            while (box && box !== document.body && !box.querySelector("img")) box = box.parentElement;
            if (!box || box === document.body) continue;
            for (const img of box.querySelectorAll("img")) add(img, box, gives);
          }
          if (everyCard) {
            for (const img of document.body.querySelectorAll("img")) if (!seen.has(img)) add(img, null, null);
          }
          for (const t of todo) t.anchor = t.frame.style.position !== "relative" && getComputedStyle(t.frame).position === "static";
          for (const { img, frame, box, n, gives, done, anchor } of todo) {
            let tile = frame;
            while (box && tile.parentElement && tile.parentElement !== box && tile.parentElement.querySelectorAll("img").length === 1) tile = tile.parentElement;
            tile.classList.add("aqm-trade-tile");
            if (anchor) {
              frame.style.position = "relative";
              frame.dataset.aqmAnchor = "1";
            }
            tradeDone.set(img, done);
            let dot = frame.querySelector(":scope > .aqm-dot");
            if (!dot) dot = frame.appendChild(h("span", { class: "aqm-root aqm-dot" }));
            setClass(dot, `aqm-root aqm-dot ${n ? "is-yes" : "is-no"}${n > 1 ? " has-count" : ""}`);
            setText(dot, n > 1 ? `×${n}` : "");
            const title = !n ? "Tu n’as pas cette carte" : gives === null ? n > 1 ? `Tu l’as (${n} exemplaires)` : "Tu l’as" : gives ? n > 1 ? `Tu en as ${n} : il t’en restera ${n - 1}` : "Ton seul exemplaire" : n > 1 ? `Tu l’as déjà (${n} exemplaires)` : "Tu l’as déjà";
            if (dot.title !== title) dot.title = title;
          }
        } catch (e) {
          console.warn("[Aquaman] échanges :", e);
        } finally {
          tradesBusy = false;
        }
      }
      const TRADE_FILTERS = [
        { key: "searched", label: "Mes recherches", title: "Seulement les cartes de ta liste de recherches", on: "asks" },
        { key: "mine", label: "Il me manque", title: "Seulement les cartes que tu n’as pas", on: "asks" },
        { key: "theirs", label: "Il lui manque", title: "Seulement les cartes que ton partenaire n’a pas", on: "gives" }
      ];
      const tradeOn = /* @__PURE__ */ new Set();
      let searchedKeys = null;
      let partner = null;
      let tradeLoading = false;
      let tradeAskedAt = 0;
      const tradeTiles = /* @__PURE__ */ new WeakMap();
      function tradeWindow() {
        const doubles = [...document.querySelectorAll("button")].find((b) => !b.closest(".aqm-root") && /^doublons\b/i.test(b.textContent.trim()));
        const chips2 = doubles?.parentElement;
        if (!chips2 || ![...chips2.querySelectorAll("button")].some((b) => /^toutes$/i.test(b.textContent.trim()))) return null;
        const tabText2 = (b) => b.textContent.trim().toLowerCase();
        for (let box = chips2.parentElement, up = 0; box && box !== document.body && up < 10; box = box.parentElement, up++) {
          const tabs = [...box.querySelectorAll('button, [role="tab"]')].filter((b) => /^(tu donnes|tu demandes|perles et mot)$/.test(tabText2(b)));
          const gives = tabs.find((b) => tabText2(b) === "tu donnes");
          const asks = tabs.find((b) => tabText2(b) === "tu demandes");
          if (!gives || !asks) continue;
          const marked = tabs.find((b) => b.getAttribute("aria-selected") === "true" || b.getAttribute("data-state") === "active" || b.getAttribute("aria-pressed") === "true");
          const odd = tabs.find((b) => tabs.filter((x) => x.className === b.className).length === 1);
          const shown = marked ?? (tabs.length > 2 ? odd : null);
          if (!shown) return null;
          return { box, chips: chips2, side: shown === gives ? "gives" : shown === asks ? "asks" : null };
        }
        return null;
      }
      function tradePartnerName(box) {
        for (const el of box.querySelectorAll("p, span, div, h2, h3")) {
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
          if (tradeOn.has("searched") && (!searchedKeys || Date.now() - searchedKeys.at > 6e4))
            jobs.push(
              ask({ type: "searched-images" }).then((r) => searchedKeys = { at: Date.now(), keys: new Set(r.keys ?? []) }).catch(() => searchedKeys = { at: Date.now(), keys: /* @__PURE__ */ new Set() })
            );
          if (tradeOn.has("mine")) jobs.push(ownedByImage().catch(() => null));
          if (tradeOn.has("theirs") && name && (partner?.name !== name || Date.now() - partner.at > 5 * 6e4)) {
            partner = { name, at: Date.now(), state: "loading", byImage: null };
            jobs.push(
              ask({ type: "player-ownership", id: playersSeen.get(foldName(name)) ?? null, name }).then((r) => {
                if (partner?.name !== name) return;
                partner.state = !r.found ? "unknown" : r.private ? "private" : "ok";
                partner.byImage = r.byImage ?? null;
              }).catch(() => partner?.name === name && (partner.state = "unknown"))
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
          if (!document.querySelector(".aqm-trade-filter")) return;
          document.querySelectorAll(".aqm-trade-filter").forEach((el) => el.remove());
          document.querySelectorAll("[data-aqm-tradehide]").forEach((el) => el.removeAttribute("data-aqm-tradehide"));
          return;
        }
        const { box, chips: chips2, side } = win;
        const name = tradePartnerName(box);
        const plain = [...chips2.querySelectorAll("button")].find((b) => !b.classList.contains("aqm-trade-filter") && /^doublons\b/i.test(b.textContent.trim()));
        for (const f of TRADE_FILTERS) {
          let chip = chips2.querySelector(`:scope > .aqm-trade-filter[data-key="${f.key}"]`);
          if (f.on !== side) {
            chip?.remove();
            continue;
          }
          if (!chip) {
            chip = h(
              "button",
              {
                type: "button",
                class: `${plain?.className ?? ""} aqm-trade-filter`,
                "data-key": f.key,
                onclick: () => {
                  tradeOn.has(f.key) ? tradeOn.delete(f.key) : tradeOn.add(f.key);
                  markTradeFilters();
                }
              },
              f.label
            );
            chips2.append(chip);
          }
          const isOn = tradeOn.has(f.key);
          chip.classList.toggle("is-on", isOn);
          chip.setAttribute("aria-pressed", String(isOn));
          const state = f.key === "theirs" && isOn ? partner?.state : null;
          const title = state === "private" ? `${f.title} : sa collection est privée, rien n’est masqué.` : state === "unknown" ? `${f.title} : Aquaman n’a pas trouvé ${name ?? "ce joueur"}, rien n’est masqué.` : f.title;
          if (chip.title !== title) chip.title = title;
          chip.classList.toggle("is-off", state === "private" || state === "unknown");
        }
        const active = TRADE_FILTERS.filter((f) => f.on === side && tradeOn.has(f.key)).map((f) => f.key);
        const mine = owned && Date.now() - owned.at < 3e4 ? owned.byImage : null;
        const needs = active.includes("searched") && (!searchedKeys || Date.now() - searchedKeys.at > 6e4) || active.includes("mine") && !mine || active.includes("theirs") && name && (partner?.name !== name || Date.now() - partner.at > 5 * 6e4);
        if (needs && Date.now() - tradeAskedAt > 5e3) {
          tradeAskedAt = Date.now();
          loadTradeData(name).then(() => !stopped && markTradeFilters());
        }
        const tests = [];
        if (active.includes("searched") && searchedKeys) tests.push((key) => searchedKeys.keys.has(key));
        if (active.includes("mine") && mine) tests.push((key) => !mine[key]);
        if (active.includes("theirs") && partner?.name === name && partner.state === "ok") tests.push((key) => !partner.byImage[key]);
        for (const img of box.querySelectorAll("img")) {
          const src = img.currentSrc || img.src;
          if (img.closest(".aqm-root") || !(chips2.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING) || chips2.contains(img) || !isCardImage(src)) continue;
          let tile = tradeTiles.get(img);
          if (!tile?.isConnected || !tile.contains(img)) {
            tile = img;
            while (tile.parentElement && tile.parentElement !== box && tile.parentElement.querySelectorAll("img").length === 1) tile = tile.parentElement;
            tradeTiles.set(img, tile);
          }
          const key = imageKey2(src);
          const hide = !!tests.length && !!key && !tests.every((t) => t(key));
          if (tile.hasAttribute("data-aqm-tradehide") !== hide) tile.toggleAttribute("data-aqm-tradehide", hide);
        }
      }
      function enlargePulls() {
        if (!/^\/jeu\/?$/.test(location.pathname)) return;
        for (const label of elementsWithText(document.body, /^\s*(les )?beaux tirages\s*$/i)) {
          let section = label.parentElement;
          while (section && section !== document.body && section.querySelectorAll("img").length < 2) section = section.parentElement;
          if (!section || section === document.body) continue;
          section.classList.add("aqm-pulls");
          for (const img of section.querySelectorAll("img")) {
            if (img.closest(".aqm-pull-thumb")) continue;
            const parent = img.parentElement;
            const wrap = parent && parent !== section && parent.children.length === 1 && !parent.textContent.trim() && parent.tagName !== "A" ? parent : img;
            wrap.classList.add("aqm-pull-thumb");
          }
        }
      }
      let pityReport2 = null;
      let pityAt = 0;
      let pityLoading = false;
      let pityRulesSent = "";
      function readPityRules() {
        for (const el of elementsWithText(document.body, /SSR tous les \d+ boosters/i)) {
          const m = el.textContent.match(/SSR tous les (\d+) boosters.*?UR tous les (\d+)/i);
          if (!m || pityRulesSent === m[0]) continue;
          pityRulesSent = m[0];
          send({ type: "pity-rules", rules: { SSR: Number(m[1]), UR: Number(m[2]) } }).then(() => pityReport2 = null);
        }
      }
      function pityPlace() {
        for (const label of elementsWithText(document.body, /booster dans|r[ée]serve pleine/i)) {
          let pill = label;
          while (pill.parentElement && pill.parentElement !== document.body && !pill.querySelector('svg, [role="progressbar"]') && pill.textContent.length < 120) pill = pill.parentElement;
          if (pill.querySelector('svg, [role="progressbar"]')) return pill;
        }
        const buy = [...document.querySelectorAll("button, a")].find((b) => !b.closest(".aqm-root") && /acheter un booster|tout ouvrir/i.test(b.textContent));
        return buy?.parentElement ?? null;
      }
      function showPity() {
        if (!/^\/jeu\/?$/.test(location.pathname)) return;
        const place = pityPlace();
        if (!place) return;
        if (place.nextElementSibling?.classList.contains("aqm-pity")) {
          if (!pityReport2 || Date.now() - pityAt > 6e4) loadPity();
          return;
        }
        document.querySelectorAll(".aqm-pity").forEach((el) => el.remove());
        place.after(h("div", { class: "aqm-root aqm-pity", role: "status" }));
        pityReport2 ? renderPity() : loadPity();
      }
      async function loadPity(fresh = false) {
        if (pityLoading) return;
        pityLoading = true;
        pityAt = Date.now();
        try {
          const report = await send({ type: "pity", fresh });
          if (report && !report.error) pityReport2 = report;
        } finally {
          pityLoading = false;
        }
        renderPity();
      }
      function renderPity() {
        const box = document.querySelector(".aqm-pity");
        if (!box || !pityReport2) return;
        const line = (code) => {
          const p = pityReport2[code];
          if (p.over)
            return h(
              "div",
              { class: "aqm-pity-line", title: `Le jeu garantit une ${code} tous les ${fmt(p.every)} boosters, mais Aquaman en a compté ${fmt(p.since)} depuis ta dernière ${code} (packs spéciaux exclus) : des boosters ouverts avant Aquaman 1.6.1 dont la sorte est inconnue étaient sans doute des packs spéciaux. Le compte repart à ta prochaine ${code}.` },
              h("p", {}, rarityCode(code), " garantie ", h("strong", {}, "au prochain booster"), " en principe"),
              h("span", { class: "aqm-bar" }, h("span", { style: "width:100%" })),
              h("small", {}, `${fmt(p.since)} boosters comptés depuis ta dernière ${code}, plus que les ${fmt(p.every)} du jeu`)
            );
          const left = p.left;
          const when = left <= 1 ? "au prochain booster" : `dans ${fmt(left)} boosters`;
          return h(
            "div",
            {
              class: "aqm-pity-line",
              title: p.missed ? `${fmt(p.since)} booster${p.since > 1 ? "s" : ""} compté${p.since > 1 ? "s" : ""} par Aquaman depuis ta dernière ${code}, vue dans les Beaux tirages du jeu (tirée sans Aquaman).` : p.known ? `${fmt(p.since)} booster${p.since > 1 ? "s" : ""} ouvert${p.since > 1 ? "s" : ""} depuis ta dernière ${code}.` : `Aquaman n’a pas encore vu de ${code} sortir : il compte depuis son installation, donc la garantie peut arriver plus tôt.`
            },
            h("p", {}, rarityCode(code), " garantie ", h("strong", {}, when), p.known ? "" : " au plus"),
            h("span", { class: "aqm-bar" }, h("span", { style: `width:${Math.min(100, 100 * p.since / p.every).toFixed(1)}%` })),
            h("small", {}, p.known ? `${fmt(p.since)} / ${fmt(p.every)} depuis ta dernière ${code}` : `${fmt(p.since)} / ${fmt(p.every)} sans ${code} depuis qu’Aquaman compte`)
          );
        };
        const secLine = () => {
          const s = pityReport2.SEC;
          if (!s) return null;
          const n = `${fmt(s.since)}${s.known ? "" : "+"} booster${s.since > 1 ? "s" : ""}`;
          const odds = s.chance > 0 ? `une tous les ~${fmt(1 / s.chance)} boosters en moyenne · ${pct(1 - (1 - s.chance) ** 100)} d’en avoir une dans les 100 prochains` : null;
          return h(
            "div",
            {
              class: "aqm-pity-line is-sec",
              title: `Pas de garantie pour la SEC : chaque booster a la même chance, la malchance passée ne la rapproche pas.${s.known ? "" : " Aquaman n’a pas encore vu de SEC sortir : il compte depuis son installation."}`
            },
            h("p", {}, rarityCode("SEC"), " ", h("strong", {}, n), " sans SEC"),
            h("small", {}, odds ? `Pas de garantie : ${odds}.` : "Pas de garantie pour la SEC.")
          );
        };
        box.replaceChildren(
          h("p", { class: "aqm-label" }, "Garantie anti-malchance"),
          h("div", { class: "aqm-pity-lines" }, line("SSR"), line("UR"), secLine()),
          h(
            "p",
            { class: "aqm-pity-note" },
            {
              ok: "Compté par Aquaman à chaque booster ouvert, et partagé entre tes appareils (PC, téléphone, extension ou script).",
              waiting: "Compté par Aquaman à chaque booster ouvert, et partagé entre tes appareils dès ta prochaine ouverture.",
              error: "Compté par Aquaman sur ce navigateur : le partage avec tes autres appareils ne répond pas pour le moment.",
              off: "Compté par Aquaman à chaque booster ouvert sur ce navigateur (partage entre appareils désactivé)."
            }[pityReport2.sync] ?? "Compté par Aquaman à chaque booster ouvert."
          ),
          // (comme dans le jeu, la garantie SSR et UR ne compte pas les packs spéciaux)
          pityReport2.skipped > 0 ? h("p", { class: "aqm-pity-note" }, `${fmt(pityReport2.skipped)} pack${pityReport2.skipped > 1 ? "s" : ""} spécia${pityReport2.skipped > 1 ? "ux" : "l"} (Légendaire, Halloween…) hors garantie, comme dans le jeu.`) : null,
          h("div", { class: "aqm-pity-more" }, h("button", { type: "button", class: "aqm-album-btn", onclick: openPityHistory }, "📜 Historique"))
        );
      }
      async function openPityHistory() {
        const body = openOverlay("Historique des tirages", "À quelle fréquence tu tires des SSR, UR et SEC, et combien de boosters il t’a fallu pour chacune.");
        body.parentElement.classList.add("aqm-panel-wide");
        const view = h("div", { class: "aqm-history" }, h("p", { class: "aqm-note" }, "Lecture de tes ouvertures…"));
        body.append(view);
        let r;
        try {
          r = await ask({ type: "pity-history" });
        } catch (e) {
          view.replaceChildren(h("p", { class: "aqm-note" }, e.message));
          return;
        }
        const CODES = ["SSR", "UR", "SEC"];
        const day = (at) => new Date(at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
        const boosters = (n) => `${fmt(n)} booster${n > 1 ? "s" : ""}`;
        const decimal = (x) => x.toFixed(1).replace(".", ",");
        const weeks = r.since ? Math.max(1 / 7, (Date.now() - r.since) / (7 * 864e5)) : null;
        const rate = (code) => {
          const n = r[code].hits.length;
          const every = n ? r.opened / n : null;
          const expected = r.chances?.[code] > 0 ? 1 / r.chances[code] : null;
          const ratio = every && expected ? expected / every : null;
          const luck = ratio == null ? null : ratio >= 1.15 ? ["is-good", `${decimal(ratio)}× plus souvent`] : ratio <= 0.87 ? ["is-bad", `${decimal(1 / ratio)}× moins souvent`] : ["", "Dans la moyenne"];
          const perWeek = weeks && n ? n / weeks : 0;
          return h(
            "div",
            { class: `aqm-rate is-${code}` },
            h("div", { class: "aqm-rate-top" }, rarityCode(code), luck ? h("span", { class: `aqm-tag aqm-luck ${luck[0]}` }, luck[1]) : null),
            h("p", { class: "aqm-rate-value" }, every ? ["1 ", h("small", {}, "tous les"), ` ${fmt(every)}`] : "—"),
            h("p", { class: "aqm-rate-sub" }, every ? "boosters, chez toi" : `aucune en ${boosters(r.opened)}`),
            h(
              "p",
              { class: "aqm-rate-foot", title: "La chance du jeu pour un booster classique, sans la garantie anti-malchance." },
              expected ? `Jeu : 1 tous les ~${fmt(expected)}` : "Jeu : chance inconnue",
              perWeek ? ` · ≈ ${perWeek < 10 ? decimal(perWeek) : fmt(perWeek)}/sem.` : ""
            )
          );
        };
        const strip = r.recent?.length ? h(
          "div",
          { class: "aqm-history-box" },
          h("div", { class: "aqm-history-row" }, h("p", { class: "aqm-label" }, `Tes ${boosters(r.recent.length)} les plus récents`), h("small", { class: "aqm-muted" }, "du plus ancien au plus récent")),
          h(
            "div",
            { class: "aqm-tracker-strip" },
            r.recent.map((top) => {
              const code = top >= 6 ? "SEC" : top >= 5 ? "UR" : top >= 4 ? "SSR" : null;
              return h("span", { class: `aqm-cell${code ? ` is-${code}` : ""}`, title: code ?? "Ni SSR, ni UR, ni SEC" });
            })
          ),
          h("p", { class: "aqm-tracker-legend" }, [null, ...CODES].map((code) => h("span", {}, h("span", { class: `aqm-cell${code ? ` is-${code}` : ""}` }), code ?? "Autre")))
        ) : null;
        const UNKNOWN = "?";
        const packKey = (x) => x.pack?.id ?? UNKNOWN;
        const packName = (x) => x.pack?.name ?? (x.pack?.id === "classic" ? "Classique" : x.pack ? "Autre pack" : "Pack inconnu");
        const packs = /* @__PURE__ */ new Map();
        for (const code of CODES)
          for (const x of r[code].hits) {
            const key = packKey(x);
            if (!packs.has(key)) packs.set(key, { key, name: packName(x), count: 0 });
            packs.get(key).count++;
          }
        const packList = [...packs.values()].sort((a, b) => (a.key === UNKNOWN) - (b.key === UNKNOWN) || b.count - a.count);
        let pack = "";
        let rarity = CODES.find((code) => r[code].hits.length) ?? "SSR";
        const hitsOf = (code) => pack ? r[code].hits.filter((x) => packKey(x) === pack) : r[code].hits;
        const tiles = (code) => {
          const { current } = r[code];
          const hits = hitsOf(code);
          const full = hits.filter((x) => !x.first && !x.special).map((x) => x.after);
          const stat = (label, value) => h("div", { class: "aqm-history-stat" }, h("small", {}, label), h("strong", {}, value));
          const all = r[code].hits.length;
          return [
            h(
              "div",
              { class: "aqm-history-stats" },
              stat("Obtenues", fmt(hits.length)),
              pack ? stat(`Part de tes ${code}`, all ? pct(hits.length / all) : "—") : stat("En moyenne", full.length ? boosters(full.reduce((a, b) => a + b, 0) / full.length) : "—"),
              stat("Plus rapide", full.length ? boosters(Math.min(...full)) : "—"),
              stat("Plus long", full.length ? boosters(Math.max(...full)) : "—"),
              stat("Depuis la dernière", boosters(current))
            ),
            hits.length ? h(
              "div",
              { class: "aqm-history-grid" },
              hits.map((x) => {
                const link = x.card?.id ? { href: `/jeu/carte/${encodeURIComponent(x.card.id)}` } : {};
                const tip = [x.card?.name ?? `${x.top}, carte inconnue`, x.pack?.guessed ? `${packName(x)} (déduit de la carte)` : packName(x), day(x.at), x.first ? "Aquaman a commencé à compter après la précédente" : null].filter(Boolean).join(" · ");
                return h(
                  x.card?.id ? "a" : "div",
                  { class: "aqm-history-tile", ...link, title: tip },
                  x.card?.image ? h("img", { src: cardImageUrl(x.card.image), alt: x.card.name ?? "", loading: "lazy", decoding: "async" }) : h("div", { class: "aqm-history-blank" }, rarityCode(x.top)),
                  // (une carte d'un pack spécial : hors garantie, elle ne fait pas repartir le compte)
                  h("p", { class: "aqm-history-after" }, x.special ? "Hors garantie" : x.first ? `≥ ${boosters(x.after)}` : boosters(x.after)),
                  h("p", { class: `aqm-history-pack${x.pack ? "" : " is-unknown"}` }, packName(x))
                );
              })
            ) : h("p", { class: "aqm-history-empty" }, pack ? `Aucune ${code} tirée dans ce pack.` : `Aucune ${code} parmi tes ${boosters(r.opened)} comptés.`)
          ];
        };
        const panel = h("div", { class: "aqm-history-panel" });
        const tabs = h("div", { class: "aqm-history-tabs", role: "tablist" });
        const filter = h("div", { class: "aqm-history-packs", role: "group", "aria-label": "Pack" });
        const show = () => {
          if (packList.some((p) => p.key !== UNKNOWN))
            filter.replaceChildren(
              ...[{ key: "", name: "Tous les packs", count: CODES.reduce((n, c) => n + r[c].hits.length, 0) }, ...packList].map(
                (p) => h(
                  "button",
                  {
                    type: "button",
                    class: `aqm-history-packbtn${p.key === pack ? " is-on" : ""}`,
                    "aria-pressed": String(p.key === pack),
                    title: p.key === UNKNOWN ? "Cartes tirées avant la version 1.4.7 dont Aquaman ne connaît pas la carte : impossible de savoir leur pack." : null,
                    onclick: () => {
                      pack = p.key;
                      show();
                    }
                  },
                  p.name,
                  h("span", { class: "aqm-history-tabcount" }, fmt(p.count))
                )
              )
            );
          tabs.replaceChildren(
            ...CODES.map(
              (c) => h(
                "button",
                {
                  type: "button",
                  role: "tab",
                  class: `aqm-history-tabbtn${c === rarity ? " is-on" : ""}`,
                  "aria-selected": String(c === rarity),
                  onclick: () => {
                    rarity = c;
                    show();
                  }
                },
                rarityCode(c),
                h("span", { class: "aqm-history-tabcount" }, fmt(hitsOf(c).length))
              )
            )
          );
          panel.replaceChildren(...tiles(rarity));
        };
        show();
        view.replaceChildren(
          h("p", { class: "aqm-history-count" }, r.since ? `${boosters(r.opened)} comptés depuis le ${new Date(r.since).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : "Aucun booster compté pour le moment."),
          h("div", { class: "aqm-rates" }, CODES.map(rate)),
          strip,
          h("div", { class: "aqm-history-box" }, filter.childElementCount ? filter : null, tabs, panel)
        );
      }
      const KIND_KEY = "aqm-booster-kind";
      let pendingBoosters = null;
      let boostersAsked = false;
      let piles = null;
      let drawing = false;
      let opening = false;
      let homeParts = null;
      const setKind = (key) => {
        try {
          key ? sessionStorage.setItem(KIND_KEY, key) : sessionStorage.removeItem(KIND_KEY);
          return true;
        } catch {
          return false;
        }
      };
      let refreshId = 0;
      const refreshed = /* @__PURE__ */ new Map();
      function showKind(key, fresh = false, reload = false, items = null) {
        if (!setKind(key)) return Promise.resolve(false);
        const id = ++refreshId;
        return new Promise((resolve) => {
          const done = (ok) => {
            refreshed.delete(id);
            if (ok) requestAnimationFrame(() => requestAnimationFrame(() => pileStill().then(() => resolve(true))));
            else resolve(false);
          };
          refreshed.set(id, done);
          setTimeout(() => refreshed.get(id)?.(false), 4e3);
          window.postMessage({ aquamanCmd: "refresh-boosters", id, kind: key, fresh, reload, items }, location.origin);
        });
      }
      const onBoostersRefreshed = (id, ok) => refreshed.get(id)?.(ok);
      function boosterKinds() {
        const kinds = /* @__PURE__ */ new Map();
        for (const b of pendingBoosters ?? []) {
          const key = b.kind ?? "classic";
          if (!kinds.has(key)) kinds.set(key, { key, name: b.name ?? "Classique", art: b.art ?? null, count: 0 });
          kinds.get(key).count++;
        }
        return [...kinds.values()];
      }
      function findHomeParts() {
        if (homeParts?.pile.isConnected && homeParts.buttons.isConnected) return homeParts;
        const own = [...document.querySelectorAll("button")].filter((b) => !b.closest(".aqm-root"));
        const all = own.find((b) => /^tout ouvrir/i.test(b.textContent.trim())) ?? own.find((b) => /^ouvrir$/i.test(b.textContent.trim()));
        if (!all) return null;
        const buttons = all.parentElement;
        const TITLE = /à ouvrir/i;
        const big = (el) => !el.classList.contains("aqm-root") && el.getBoundingClientRect().height > 120;
        for (let el = buttons, up = 0; el && el !== document.body && up < 6; el = el.parentElement, up++)
          for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
            if (!big(sib)) continue;
            if (!TITLE.test(sib.textContent)) return homeParts = { pile: sib, buttons };
            for (let box = sib; box; ) {
              const kids = [...box.children].reverse();
              const pile = kids.find((c) => big(c) && !TITLE.test(c.textContent));
              if (pile) return homeParts = { pile, buttons };
              box = kids.find((c) => big(c) && TITLE.test(c.textContent)) ?? null;
            }
            return null;
          }
        return null;
      }
      function copyOf(el) {
        const copy = el.cloneNode(true);
        for (const x of [copy, ...copy.querySelectorAll("[id]")]) x.removeAttribute("id");
        copy.removeAttribute("data-aqm-hidden");
        for (const x of [copy, ...copy.querySelectorAll("[style]")]) if (/blur/.test(x.style.filter)) x.style.filter = "";
        return copy;
      }
      const SHOTS_KEY = "boosterPiles";
      const KIND_ID = /^[A-Za-z0-9_-]{1,64}$/;
      const SHAPES = [1, 2, 3];
      const shapeKey = (kind, count) => `${kind}--n${Math.min(Math.max(count, 1), 3)}`;
      const SHOTS_V = 9;
      const ALL_BUTTON = /^tout ouvrir/i;
      const hasAllButton = (buttons) => [...buttons.querySelectorAll("button")].some((b) => ALL_BUTTON.test(b.textContent.trim()));
      let shotStore = null;
      const readShotStore = () => shotStore ?? {};
      async function loadShotStore() {
        let kept = {};
        try {
          kept = (await chrome.storage.local.get(SHOTS_KEY))[SHOTS_KEY] ?? {};
          const old = JSON.parse(localStorage.getItem("aqm-booster-piles") || "null");
          if (old) {
            kept = { ...old, ...kept };
            localStorage.removeItem("aqm-booster-piles");
            chrome.storage.local.set({ [SHOTS_KEY]: kept });
          }
        } catch {
        }
        shotStore = kept;
        loadGlobalPacks();
      }
      const GLOBAL_KEY = "globalPacks";
      let globalStore = {};
      async function loadGlobalPacks() {
        try {
          globalStore = (await chrome.storage.local.get(GLOBAL_KEY))[GLOBAL_KEY] ?? {};
        } catch {
        }
        const res = await send({ type: "packs-global" });
        const fresh = res?.packs;
        if (!fresh || typeof fresh !== "object" || JSON.stringify(fresh) === JSON.stringify(globalStore)) return;
        globalStore = fresh;
        try {
          chrome.storage.local.set({ [GLOBAL_KEY]: globalStore });
        } catch {
        }
        piles = null;
        markBoosterKinds();
      }
      function saveShots(shots) {
        shotStore = { ...readShotStore() };
        for (const shot of shots)
          shotStore[shapeKey(shot.key, shot.count)] = { v: SHOTS_V, pile: shot.pile.outerHTML, buttons: shot.buttons.outerHTML, many: null, at: Date.now() };
        try {
          chrome.storage.local.set({ [SHOTS_KEY]: shotStore });
        } catch {
        }
      }
      const SAFE_TAGS = /* @__PURE__ */ new Set(["div", "span", "p", "strong", "small", "b", "i", "em", "button", "img", "picture", "source", "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "defs", "lineargradient", "radialgradient", "stop", "clippath", "mask", "pattern", "filter", "fegaussianblur", "feturbulence", "fecolormatrix", "feblend", "fecomposite", "feoffset", "feflood", "femerge", "femergenode", "fedisplacementmap", "text", "tspan"]);
      const SAFE_ATTRS = /^(class|style|alt|role|title|type|disabled|width|height|viewbox|d|fill|stroke|stroke-[a-z-]+|fill-[a-z-]+|clip-[a-z-]+|opacity|transform|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|points|offset|stop-color|stop-opacity|gradientunits|gradienttransform|patternunits|preserveaspectratio|xmlns|loading|decoding|sizes|stddeviation|basefrequency|numoctaves|seed|in|in2|result|mode|operator|values|scale|dx|dy|flood-color|flood-opacity|text-anchor|font-[a-z-]+|letter-spacing|mask|filter|aria-[a-z-]+|data-[a-z0-9-]+)$/i;
      const siteUrl = (v) => /^\/(?!\/)/.test(v) || v.startsWith(`${location.origin}/`);
      const siteStyle = (v) => {
        if (/expression|javascript:/i.test(v)) return false;
        const urls = [...v.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].map((m) => m[2].trim());
        return urls.length === (v.match(/url\(/gi) ?? []).length && urls.every((u) => u.startsWith("#") || siteUrl(u));
      };
      function fromHtml(html) {
        const t = document.createElement("template");
        t.innerHTML = html;
        const el = t.content.firstElementChild;
        if (!el) return null;
        for (const x of [...el.querySelectorAll("*")].reverse()) if (!SAFE_TAGS.has(x.tagName.toLowerCase())) x.remove();
        if (!SAFE_TAGS.has(el.tagName.toLowerCase())) return null;
        for (const x of [el, ...el.querySelectorAll("*")])
          for (const a of [...x.attributes]) {
            const name = a.name.toLowerCase();
            const value = a.value;
            const ok = name === "src" ? siteUrl(value) : name === "srcset" ? value.split(",").every((part) => siteUrl(part.trim().split(/\s+/)[0] ?? "")) : name === "style" || name === "filter" || name === "mask" || name === "fill" || name === "stroke" ? siteStyle(value) : SAFE_ATTRS.test(name);
            if (!ok) x.removeAttribute(a.name);
          }
        return el;
      }
      function setPackArt(el, art) {
        if (!el || !art || !siteUrl(art)) return el;
        for (const x of packBoxes(el)) x.style.setProperty("--pack-art", `url('${art.replace(/['()\\]/g, encodeURIComponent)}')`);
        return el;
      }
      const packBoxes = (el) => [el, ...el.querySelectorAll("[class]")].filter((x) => [...x.classList].some((c) => /__pack$/.test(c)));
      const packArtHtml = (html, art) => {
        const t = document.createElement("template");
        t.innerHTML = html;
        setPackArt(t.content.firstElementChild, art);
        return t.innerHTML;
      };
      function setCount(el, n) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) if (/[×x]\s?\d+/.test(t.nodeValue)) t.nodeValue = t.nodeValue.replace(/([×x]\s?)\d+/, `$1${n}`);
        return el;
      }
      function cachedShots(kinds) {
        const all = readShotStore();
        const shots = [];
        for (const k of kinds) {
          const key = shapeKey(k.key, k.count);
          const kept = all[key]?.v === SHOTS_V ? all[key] : globalStore[key]?.v === SHOTS_V ? globalStore[key] : null;
          const pile = kept && fromHtml(kept.pile);
          const buttons = kept && fromHtml(kept.buttons);
          if (!pile || !buttons) return null;
          shots.push({ ...k, pile: setCount(setPackArt(pile, k.art), k.count), buttons: setCount(buttons, k.count) });
        }
        return shots;
      }
      function pictureFiles(el) {
        const files = /* @__PURE__ */ new Set();
        for (const x of [el, ...el.querySelectorAll("*")]) {
          const src = x.tagName === "IMG" ? x.currentSrc || x.getAttribute("src") : getComputedStyle(x).backgroundImage.match(/url\(["']?([^"')]+)/)?.[1];
          const file = src ? decodeURIComponent(src.split(/[?#]/)[0].split("/").pop() || "") : "";
          const inner = src?.includes("url=") ? decodeURIComponent(new URL(src, location.href).searchParams.get("url") ?? "").split("/").pop() : "";
          if (file) files.add(file);
          if (inner) files.add(inner);
        }
        return files;
      }
      function pileShows(pile, k, kinds) {
        if (!pile) return false;
        const files = pictureFiles(pile);
        const fileOf = (art) => art.split(/[?#]/)[0].split("/").pop();
        if (k.art) {
          if (!files.has(fileOf(k.art))) return false;
          const imgs = [...pile.querySelectorAll("img")].filter((img) => (img.currentSrc || img.getAttribute("src") || "").includes(fileOf(k.art)));
          return !imgs.length || imgs.some((img) => img.complete && img.naturalWidth > 0);
        }
        return !kinds.some((x) => x.art && files.has(fileOf(x.art)));
      }
      async function pileStill() {
        const look = () => {
          const pile = findHomeParts()?.pile;
          return pile ? [...pile.querySelectorAll("[style]")].map((x) => x.getAttribute("style")).join("|") + pile.childElementCount : "";
        };
        let last = look();
        for (let still = 0, t = 0; still < 2 && t < 20; t++) {
          await pause(60);
          const now = look();
          still = now === last ? still + 1 : 0;
          last = now;
        }
      }
      function hideHome() {
        const parts = findHomeParts();
        parts?.pile.setAttribute("data-aqm-hidden", "");
        parts?.buttons.setAttribute("data-aqm-hidden", "");
        return parts;
      }
      const gameBusy = () => !!document.querySelector('[role="dialog"]:not(.aqm-root *), [aria-modal="true"]:not(.aqm-root *)') || !overlay && [document.body, document.documentElement].some((el) => getComputedStyle(el).overflow === "hidden");
      async function drawPiles(kinds, sig) {
        drawing = true;
        const title = [...document.querySelectorAll("h1, h2, h3")].find((t) => !t.closest(".aqm-root") && /à ouvrir/i.test(t.textContent));
        title?.setAttribute("data-aqm-veiled", "");
        hideHome();
        const shots = [];
        try {
          for (const k of kinds) {
            if (stopped || !await showKind(k.key, true)) return void (piles = { sig, shots: null });
            hideHome();
            let right = false;
            for (let t = 0; t < 84 && !(right = pileShows(findHomeParts()?.pile, k, kinds)); t++) await pause(60);
            if (right) await pause(400).then(pileStill);
            const parts = findHomeParts();
            if (!parts) return void (piles = { sig, shots: null });
            shots.push({ ...k, pile: copyOf(parts.pile), buttons: copyOf(parts.buttons), right: pileShows(parts.pile, k, kinds) });
          }
          piles = { sig, shots };
          saveShots(shots.filter((shot) => shot.right));
        } finally {
          await showKind("");
          await unveilTitle(title);
          drawing = false;
        }
        markBoosterKinds();
      }
      const SCAN_KEY = "aqm-scan-packs";
      const SHOP_KEY = "aqm-scan-shop";
      const onShop = () => /^\/jeu\/boutique\/?$/.test(location.pathname);
      function startScan() {
        if (onShop()) return void scanShop();
        try {
          sessionStorage.setItem(SCAN_KEY, "shop");
        } catch {
        }
        location.href = "/jeu/boutique";
      }
      function resumeScan() {
        let step;
        try {
          step = sessionStorage.getItem(SCAN_KEY);
          if (meId !== AUTHOR_ID || !(step === "shop" && onShop() || step === "1" && /^\/jeu\/?$/.test(location.pathname))) return;
          sessionStorage.removeItem(SCAN_KEY);
        } catch {
          return;
        }
        if (step === "shop") scanShop();
        else scanPacks();
      }
      async function scanShop() {
        if (scanning2) return;
        scanning2 = true;
        const body = openOverlay("Scanner les packs", "Aquaman lit d’abord le design de chaque pack de la boutique, puis le jeu dessine tes boosters en attente sur l’accueil.");
        const status = h("p", { class: "aqm-note" }, "Lecture des packs de la boutique (jusqu’à 20 s)…");
        body.append(status);
        let designs = /* @__PURE__ */ new Map();
        try {
          const kinds = (await ask({ type: "pack-kinds" })).kinds.filter((k) => k.kind && KIND_ID.test(k.kind));
          designs = await readShopPacks(kinds);
        } catch (e) {
          status.textContent = e.message;
        } finally {
          scanning2 = false;
        }
        try {
          sessionStorage.setItem(SHOP_KEY, JSON.stringify([...designs]));
          sessionStorage.setItem(SCAN_KEY, "1");
        } catch {
        }
        status.textContent = `${designs.size} pack${designs.size > 1 ? "s" : ""} trouvé${designs.size > 1 ? "s" : ""} dans la boutique : retour à l’accueil…`;
        await pause(800);
        location.href = "/jeu";
      }
      function shopDesigns() {
        try {
          const list = JSON.parse(sessionStorage.getItem(SHOP_KEY) || "[]");
          sessionStorage.removeItem(SHOP_KEY);
          return new Map(list);
        } catch {
          return /* @__PURE__ */ new Map();
        }
      }
      let scanning2 = false;
      async function scanPacks() {
        if (scanning2) return;
        scanning2 = true;
        const body = openOverlay("Scanner les packs", "Le jeu dessine tes boosters en attente (1, 2 et 3 boosters et plus), puis Aquaman met le design de chaque pack de la boutique dans ces piles ; les dessins sont publiés pour toutes les extensions.");
        const status = h("p", { class: "aqm-note" }, "Lecture des boosters de la boutique…");
        const list = h("ul", { class: "aqm-scan-list" });
        body.append(status, list);
        while (drawing || opening) await pause(200);
        drawing = true;
        const title = [...document.querySelectorAll("h1, h2, h3")].find((t) => !t.closest(".aqm-root") && /à ouvrir/i.test(t.textContent));
        title?.setAttribute("data-aqm-veiled", "");
        const packs = {};
        const frames = {};
        const themed = {};
        let themedPack = null;
        let shop = [];
        try {
          try {
            shop = (await ask({ type: "pack-kinds" })).kinds;
          } catch (e) {
            status.textContent = e.message;
          }
          const mine = boosterKinds().map((k) => ({ ...k, kind: k.key, ids: (pendingBoosters ?? []).filter((b) => (b.kind ?? "classic") === k.key).map((b) => b.id) }));
          const kinds = mine;
          const all = kinds.map((k) => ({ key: k.kind, art: k.art }));
          for (const [i, k] of kinds.entries()) {
            const line = h("li", {}, h("strong", {}, k.name ?? k.kind), " : ");
            list.append(line);
            const kind = { key: k.kind, art: k.art };
            const drawn = [];
            for (const n2 of SHAPES) {
              if (k.ids.length < n2) break;
              status.textContent = `Dessin de ${k.name ?? k.kind} avec ${n2} booster${n2 > 1 ? "s" : ""} (${i + 1}/${kinds.length})…`;
              const items = k.ids.slice(0, n2).map((id) => ({ id }));
              if (!await showKind("", true, false, items)) break;
              hideHome();
              let right = false;
              for (let t = 0; t < 84 && !(right = pileShows(findHomeParts()?.pile, kind, all)); t++) await pause(60);
              if (right) await pause(400).then(pileStill);
              const parts = findHomeParts();
              if (!parts || !pileShows(parts.pile, kind, all)) continue;
              const buttons = copyOf(parts.buttons).outerHTML;
              packs[shapeKey(k.kind, n2)] = { v: SHOTS_V, pile: copyOf(parts.pile).outerHTML, buttons, many: hasAllButton(parts.buttons) ? buttons : null, name: k.name, art: k.art };
              if (!frames[n2] || k.kind === "classic") frames[n2] = { pile: packs[shapeKey(k.kind, n2)].pile, buttons };
              if (k.art && !themed[n2]) themed[n2] = { pile: packs[shapeKey(k.kind, n2)].pile, buttons, art: k.art, name: k.name };
              if (k.art && !themedPack) themedPack = packOf(parts.pile, k);
              drawn.push(n2 === 3 ? "3+" : String(n2));
            }
            line.append(
              drawn.length ? `✅ dessiné par le jeu avec ${drawn.join(", ")} booster${drawn.length > 1 || drawn[0] !== "1" ? "s" : ""}${drawn.length < 3 ? " (les autres formes viennent de la boutique)" : ""}.` : "⛔ dessin incomplet (image du booster introuvable)."
            );
          }
        } finally {
          await showKind("", false, true);
          await unveilTitle(title);
          drawing = false;
          scanning2 = false;
        }
        const shapes = SHAPES.filter((n2) => themed[n2] || frames[n2]);
        const owned2 = new Map(boosterKinds().filter((k) => k.art).map((k) => [k.key, k]));
        const wanted = [...shop.filter((k) => k.kind && KIND_ID.test(k.kind)), ...[...owned2.values()].map((k) => ({ kind: k.key, name: k.name, art: k.art }))].filter((k, i, all) => all.findIndex((x) => x.kind === k.kind) === i).filter((k) => k.art && shapes.some((n2) => !packs[shapeKey(k.kind, n2)]));
        const designs = shopDesigns();
        if (wanted.length) status.textContent = `${designs.size} pack${designs.size > 1 ? "s" : ""} trouvé${designs.size > 1 ? "s" : ""} dans la boutique.`;
        for (const k of wanted) {
          const line = h("li", {}, h("strong", {}, k.name ?? k.kind), designs?.get(k.kind) ? " (boutique) : " : " (copie) : ");
          list.append(line);
          const made = [];
          for (const n2 of shapes) {
            if (packs[shapeKey(k.kind, n2)]) continue;
            let pile = null;
            let buttons = frames[n2]?.buttons ?? themed[n2]?.buttons;
            if (frames[n2] && designs?.get(k.kind)) pile = fillPile(frames[n2].pile, designs.get(k.kind));
            else if (themed[n2]) {
              pile = renamePack(themed[n2].pile, themed[n2], k);
              buttons = themed[n2].buttons;
            } else if (frames[n2] && themedPack) pile = fillPile(frames[n2].pile, { ...themedPack, html: renamePack(themedPack.html, themedPack, k) });
            if (!pile || !buttons) continue;
            packs[shapeKey(k.kind, n2)] = { v: SHOTS_V, pile: packArtHtml(pile, k.art), buttons, many: null, name: k.name, art: k.art };
            made.push(n2 === 3 ? "3+" : String(n2));
          }
          line.append(made.length ? `✅ dessiné avec ${made.join(", ")} booster${made.length > 1 || made[0] !== "1" ? "s" : ""}.` : "⛔ pas de modèle pour ce pack.");
        }
        let publishing = Promise.resolve();
        if (overlay?.contains(body)) overlayClosed = () => publishing.finally(() => location.reload());
        const n = Object.keys(packs).length;
        if (!n) return void (status.textContent = "Aucun dessin à publier.");
        status.textContent = `Publication de ${n} dessin${n > 1 ? "s" : ""}…`;
        publishing = send({ type: "packs-publish", packs });
        const res = await publishing;
        if (res?.needDevice) status.textContent = "Cet appareil n’est pas approuvé : approuve-le d’abord dans Plus › Joueurs avec Aquaman.";
        else if (!res || res.error) status.textContent = `Le relais a refusé la publication${res?.error ? ` (${res.error})` : ""}.`;
        else {
          status.textContent = `✅ ${res.published ?? n} dessin${n > 1 ? "s" : ""} publié${n > 1 ? "s" : ""} : toutes les extensions les affichent désormais.`;
          globalStore = { ...globalStore, ...packs };
          try {
            chrome.storage.local.set({ [GLOBAL_KEY]: globalStore });
          } catch {
          }
          piles = null;
          markBoosterKinds();
        }
      }
      function packOf(pile, k) {
        const box = packBoxes(pile)[0];
        return box ? { style: box.getAttribute("style") ?? "", html: copyOf(box).innerHTML, art: k.art, name: k.name } : null;
      }
      function renamePack(html, from, k) {
        const file = (art) => art.split(/[?#]/)[0].split("/").pop();
        const oldFile = file(from.art);
        const newArt = k.art.split(/[?#]/)[0];
        const t = document.createElement("template");
        t.innerHTML = html;
        for (const el of t.content.querySelectorAll("*"))
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
        return [...t.content.childNodes].map((x) => x.outerHTML ?? "").join("");
      }
      function fillPile(pileHtml, design) {
        const t = document.createElement("template");
        t.innerHTML = pileHtml;
        const pile = t.content.firstElementChild;
        const boxes = pile ? packBoxes(pile) : [];
        if (!boxes.length) return null;
        for (const box of boxes) {
          box.setAttribute("style", design.style ?? "");
          box.innerHTML = design.html;
        }
        return pile.outerHTML;
      }
      async function readShopPacks(kinds) {
        const found = /* @__PURE__ */ new Map();
        const fileOf = (art) => (art ?? "").split(/[?#]/)[0].split("/").pop();
        for (let t = 0; t < 80 && found.size < kinds.length; t++) {
          await pause(250);
          const boxes = packBoxes(document.body).filter((x) => !x.closest(".aqm-root"));
          for (const k of kinds) {
            if (found.has(k.kind)) continue;
            const name = k.name?.toLowerCase();
            const box = k.art && boxes.find((x) => (x.getAttribute("style") ?? "").includes(fileOf(k.art))) || name && boxes.find((x) => x.querySelector('[class*="__packTitle"]')?.textContent.trim().toLowerCase() === name);
            if (box) found.set(k.kind, { style: box.getAttribute("style") ?? "", html: copyOf(box).innerHTML });
          }
          if (found.size && t > 40) break;
        }
        return found;
      }
      async function unveilTitle(title) {
        const all = () => {
          try {
            return JSON.parse(document.documentElement.getAttribute("data-aqm-boosters") || "[]").length;
          } catch {
            return (pendingBoosters ?? []).length;
          }
        };
        for (let t = 0; t < 40 && title?.isConnected && !new RegExp(`^\\D*${all()}\\b`).test(title.textContent.trim()); t++) await pause(60);
        if (title) applyTitleCount(title, true);
        title?.removeAttribute("data-aqm-veiled");
      }
      let titleCount = null;
      let titleWatch = null;
      const homeTitle = () => [...document.querySelectorAll("h1, h2, h3")].find((t) => !t.closest(".aqm-root") && /à ouvrir/i.test(t.textContent));
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
          const observer2 = new MutationObserver(() => applyTitleCount(title));
          observer2.observe(title, { childList: true, subtree: true, characterData: true });
          titleWatch = { title, observer: observer2 };
        }
        applyTitleCount(title);
      }
      function applyTitleCount(title, now = false) {
        if (titleCount == null || stopped || !now && (drawing || opening) || !(settled || document.documentElement.hasAttribute("data-aqm-hydrated"))) return;
        const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          if (!/^\s*\d+/.test(t.nodeValue)) continue;
          const want = t.nodeValue.replace(/^(\s*)\d+/, `$1${titleCount}`);
          if (t.nodeValue !== want) t.nodeValue = want;
          return;
        }
      }
      const OPENING_ART = "data-aqm-opening-art";
      async function openFromCopy(key, index) {
        if (drawing || opening) return;
        opening = true;
        const title = [...document.querySelectorAll("h1, h2, h3")].find((t) => !t.closest(".aqm-root") && /à ouvrir/i.test(t.textContent));
        title?.setAttribute("data-aqm-veiled", "");
        try {
          if (!await showKind(key, true)) return;
          title?.removeAttribute("data-aqm-veiled");
          const real = [...findHomeParts()?.buttons.querySelectorAll("button") ?? []][index];
          const art = boosterKinds().find((k) => k.key === key)?.art;
          if (art && siteUrl(art)) document.documentElement.setAttribute(OPENING_ART, art.split(/[?#]/)[0]);
          real?.click();
          const started2 = Date.now();
          while (!stopped && (Date.now() - started2 < 1500 || gameBusy())) await pause(500);
          title?.setAttribute("data-aqm-veiled", "");
          await showKind("", false, true);
          await unveilTitle(title);
        } finally {
          document.documentElement.removeAttribute(OPENING_ART);
          title?.removeAttribute("data-aqm-veiled");
          opening = false;
          piles = null;
          markBoosterKinds();
        }
      }
      let chaining = false;
      const OPEN_ALL = /^tout ouvrir/i;
      function kindOpened(button) {
        if (button?.closest(".aqm-piles")) return wheelKey;
        const set = (() => {
          try {
            return sessionStorage.getItem(KIND_KEY) || "";
          } catch {
            return "";
          }
        })();
        if (set) return set;
        const kinds = boosterKinds();
        return kinds.length === 1 ? kinds[0].key : "";
      }
      const kindCount = (key) => (key ? boosterKinds().find((k) => k.key === key)?.count : pendingBoosters?.length) ?? null;
      onStart(() => {
        document.addEventListener(
          "click",
          (e) => {
            const button = !stopped && e.isTrusted && e.target instanceof Element ? e.target.closest("button") : null;
            const text = button?.textContent.trim() ?? "";
            if (OPEN_ALL.test(text)) {
              const kind = kindOpened(button);
              batch = { kind, before: kindCount(kind), opened: null };
            } else if (/^ouvrir\b/i.test(text) && !button.classList.contains("aqm-open-more")) batch = null;
          },
          true
        );
      });
      const AUTO_CLOSE = 5e3;
      let autoEnd = null;
      function stopAuto(cancelled = false) {
        if (!autoEnd) return;
        clearInterval(autoEnd.timer);
        autoEnd.timer = 0;
        autoEnd.cancelled = cancelled;
        document.querySelectorAll(".aqm-open-count").forEach((el) => el.remove());
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
        const text = `${Math.ceil(ms / 1e3)} s`;
        for (const el of document.querySelectorAll(".aqm-open-count")) if (el.textContent !== text) el.textContent = text;
      }
      onStart(() => {
        document.addEventListener(
          "pointerdown",
          (e) => {
            if (!autoEnd?.timer || !e.isTrusted || !(e.target instanceof Element) || e.target.closest(".aqm-open-more")) return;
            stopAuto(true);
          },
          true
        );
      });
      function markOpenMore() {
        const old = document.querySelector(".aqm-open-more");
        if (!batch && !old && !autoEnd) return;
        const multi = batch?.opened > 1;
        const left = multi && batch.before != null ? Math.max(0, batch.before - batch.opened) : 0;
        const close = multi && !chaining ? [...document.querySelectorAll("button")].find((b) => !b.closest(".aqm-root") && /^fermer$/i.test(b.textContent.trim())) : null;
        const row = close?.parentElement;
        if (!row || ![...row.querySelectorAll("button")].some((b) => /collection/i.test(b.textContent))) {
          old?.remove();
          stopAuto();
          return;
        }
        const auto = on("openMoreAuto");
        if (auto && autoEnd?.row !== row) {
          stopAuto();
          autoEnd = { row, close, left, ends: Date.now() + AUTO_CLOSE, timer: setInterval(tickAuto, 200), cancelled: false };
        }
        const counting = !!autoEnd?.timer;
        const next = Math.min(batch.opened, left);
        const label = left > 0 ? `Ouvrir ${next > 1 ? `les ${fmt(next)} suivants` : "le dernier"} (${fmt(left)})` : "Fermeture dans";
        const key = `${label}|${counting}`;
        if (old?.parentElement === row && old.dataset.key === key) return;
        old?.remove();
        if (left <= 0 && !counting) return;
        const count = counting ? h("span", { class: "aqm-open-count" }, `${Math.ceil((autoEnd.ends - Date.now()) / 1e3)} s`) : null;
        if (left > 0) {
          const icon = row.querySelector("button svg")?.cloneNode(true) ?? null;
          row.prepend(h("button", { type: "button", class: `${row.querySelector("button")?.className ?? ""} aqm-open-more`, "data-key": key, onclick: () => (stopAuto(), openMore(close)) }, icon, label, count));
        } else
          close.before(
            h("span", { class: "aqm-open-more aqm-open-note", "data-key": key, title: "Clique dans la fenêtre pour la garder ouverte" }, label, " ", count)
          );
      }
      async function openMore(close) {
        if (chaining || !batch) return;
        chaining = true;
        const { kind } = batch;
        const left = batch.before - batch.opened;
        document.querySelector(".aqm-open-more")?.remove();
        try {
          close.click();
          const started2 = Date.now();
          while (!stopped && Date.now() - started2 < 15e3 && (gameBusy() || opening || drawing || !findHomeParts())) await pause(250);
          await pause(400);
          if (stopped || gameBusy()) return;
          batch = { kind, before: left, opened: null };
          const strip = document.querySelector(".aqm-piles");
          const shot = strip && piles?.shots?.find((s) => s.key === kind);
          if (shot) {
            const index = [...shot.buttons.querySelectorAll("button")].findIndex((b) => OPEN_ALL.test(b.textContent.trim()));
            if (index >= 0) openFromCopy(kind, index);
            return;
          }
          const real = [...findHomeParts()?.buttons.querySelectorAll("button") ?? []].find((b) => OPEN_ALL.test(b.textContent.trim()));
          real?.click();
        } finally {
          chaining = false;
        }
      }
      function markBoosterKinds() {
        if (!featLoaded || !on("boosterWheel") || !/^\/jeu\/?$/.test(location.pathname) || drawing || opening) return;
        try {
          const kept = JSON.parse(document.documentElement.getAttribute("data-aqm-boosters") || "null");
          if (Array.isArray(kept)) pendingBoosters = kept.filter((b) => b?.id);
        } catch {
        }
        if (!pendingBoosters && !boostersAsked) {
          boostersAsked = true;
          setKind("");
          window.__aquamanSelf = true;
          const asked = pageFetch("/api-game/v1/me", { credentials: "include", headers: { accept: "application/json" } });
          window.__aquamanSelf = false;
          asked.then((res) => res.ok ? res.json() : null).then((me) => {
            if (!Array.isArray(me?.pending) || pendingBoosters) return;
            pendingBoosters = me.pending.filter((b) => b?.id).map((b) => ({ id: b.id, kind: b.kindId ?? null, name: b.kindName ?? null, art: b.kindArt ?? null }));
            markBoosterKinds();
          }).catch(() => {
          });
        }
        const kinds = boosterKinds();
        const parts = findHomeParts();
        let strip = document.querySelector(".aqm-piles");
        const off = () => {
          showTitleCount(null);
          strip?.remove();
          document.querySelectorAll("[data-aqm-hidden]").forEach((el) => el.removeAttribute("data-aqm-hidden"));
        };
        if (!parts || kinds.length < 2) return off();
        const sig = kinds.map((k) => `${k.key}:${k.count}`).join("|");
        if (piles?.sig !== sig) {
          if (!shotStore) return;
          const known = cachedShots(kinds);
          if (known) piles = { sig, shots: known };
          else {
            if (!gameBusy()) drawPiles(kinds, sig);
            return;
          }
        }
        if (!piles.shots) return off();
        parts.pile.setAttribute("data-aqm-hidden", "");
        parts.buttons.setAttribute("data-aqm-hidden", "");
        if (!strip || strip.previousElementSibling !== parts.pile) {
          strip?.remove();
          strip = h("div", { class: "aqm-root aqm-piles" });
          parts.pile.after(strip);
        }
        if (strip.dataset.sig === sig) return void showTitleCount(titleCount);
        strip.dataset.sig = sig;
        renderWheel(strip, piles.shots);
      }
      let wheelKey = null;
      function renderWheel(strip, shots) {
        const ordered = [...shots].sort((a, b) => (b.key === "classic") - (a.key === "classic"));
        const n = ordered.length;
        let at = Math.max(0, ordered.findIndex((s) => s.key === wheelKey));
        const buttonsOf = ordered.map((shot) => {
          const buttons = shot.buttons.cloneNode(true);
          [...buttons.querySelectorAll("button")].forEach(
            (b, j) => b.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              openFromCopy(shot.key, j);
            })
          );
          return buttons;
        });
        const controls = h("div", { class: "aqm-wheel-controls" });
        const items = ordered.map((shot, i) => {
          const art = h("div", { class: "aqm-pile-art" }, shot.pile.cloneNode(true));
          tiltOnHover(art);
          const pick = () => {
            const front = (at % n + n) % n;
            if (i !== front) turn(i - front);
          };
          return h("div", { class: "aqm-pile", title: shot.name, onclick: pick }, art);
        });
        const track = h("div", { class: "aqm-wheel-track" }, items);
        const arrow = (dir, label) => h("button", { type: "button", class: `aqm-wheel-arrow is-${dir < 0 ? "prev" : "next"}`, "aria-label": label, onclick: () => turn(dir) }, dir < 0 ? "‹" : "›");
        const dots = h("div", { class: "aqm-wheel-dots" });
        const prev = arrow(-1, "Catégorie précédente");
        const next = arrow(1, "Catégorie suivante");
        const wheel = h("div", { class: "aqm-wheel" }, prev, track, next);
        strip.replaceChildren(wheel, controls, dots);
        let width = 0;
        function place() {
          fitStrip(strip);
          width = width || Math.max(...items.map((el) => el.offsetWidth)) || 360;
          const room = strip.clientWidth || width;
          const front = (at % n + n) % n;
          const half = Math.floor(n / 2);
          const side = 0.72;
          const offset = Math.round(width / 2 + width * side / 2 + 40);
          const fits = offset + width * side / 2 <= room / 2 - 8;
          items.forEach((el, i) => {
            const d = n >= 3 ? ((i - front) % n + n + half) % n - half : i - front;
            el.style.transform = d ? `translateX(${Math.sign(d) * offset}px) scale(${Math.abs(d) > 1 ? side * 0.8 : side})` : "none";
            el.classList.toggle("is-front", !d);
            el.classList.toggle("is-away", Math.abs(d) > 1 || !!d && !fits);
          });
          wheelKey = ordered[front].key;
          showTitleCount(ordered[front].count);
          paintGlow(wheel, ordered[front]);
          if (controls.firstChild !== buttonsOf[front]) controls.replaceChildren(buttonsOf[front]);
          prev.hidden = n < 3 && at === 0;
          next.hidden = n < 3 && at === n - 1;
          dots.replaceChildren(...ordered.map((s, i) => h("button", { type: "button", class: `aqm-wheel-dot${i === front ? " is-on" : ""}`, "aria-label": s.name, title: s.name, onclick: () => turn(i - front) })));
        }
        function turn(dir) {
          if (n >= 3) at += dir > n / 2 ? dir - n : dir < -n / 2 ? dir + n : dir;
          else at = Math.min(n - 1, Math.max(0, at + Math.sign(dir)));
          place();
        }
        let touchX = null;
        track.addEventListener("touchstart", (e) => touchX = e.touches[0].clientX, { passive: true });
        track.addEventListener("touchend", (e) => {
          const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
          if (touchX != null && Math.abs(dx) > 40) turn(dx < 0 ? 1 : -1);
          touchX = null;
        });
        strip.classList.add("is-still");
        place();
        requestAnimationFrame(() => {
          width = 0;
          place();
          requestAnimationFrame(() => strip.classList.remove("is-still"));
        });
      }
      const GLOW_BLUE = [37, 99, 235];
      const glowOf = /* @__PURE__ */ new Map();
      function packColour(art) {
        if (!art) return Promise.resolve(null);
        if (!glowOf.has(art))
          glowOf.set(
            art,
            new Promise((resolve) => {
              const img = new Image();
              img.onload = () => {
                try {
                  const canvas = document.createElement("canvas");
                  canvas.width = canvas.height = 24;
                  const g = canvas.getContext("2d", { willReadFrequently: true });
                  g.drawImage(img, 0, 0, 24, 24);
                  const d = g.getImageData(0, 0, 24, 24).data;
                  let r = 0;
                  let gr = 0;
                  let b = 0;
                  let w = 0;
                  for (let i = 0; i < d.length; i += 4) {
                    const max = Math.max(d[i], d[i + 1], d[i + 2]);
                    const sat = max ? (max - Math.min(d[i], d[i + 1], d[i + 2])) / max : 0;
                    const weight = d[i + 3] / 255 * sat * sat * (max / 255);
                    r += d[i] * weight;
                    gr += d[i + 1] * weight;
                    b += d[i + 2] * weight;
                    w += weight;
                  }
                  if (w < 0.5) return resolve(null);
                  const c = [r / w, gr / w, b / w];
                  const k = 235 / Math.max(...c);
                  resolve(c.map((x) => Math.round(x * k)));
                } catch {
                  resolve(null);
                }
              };
              img.onerror = () => resolve(null);
              img.src = art;
            })
          );
        return glowOf.get(art);
      }
      async function paintGlow(wheel, shot) {
        const c = on("packGlow") && await packColour(shot.art) || GLOW_BLUE;
        if (wheelKey === shot.key) wheel.style.setProperty("--aqm-glow", `rgb(${c.join(" ")} / 0.38)`);
      }
      function fitStrip(strip) {
        let field = strip.parentElement;
        while (field && field !== document.body) {
          const cs2 = getComputedStyle(field);
          if (parseFloat(cs2.borderTopLeftRadius) >= 16 && field.clientWidth >= 480) break;
          field = field.parentElement;
        }
        if (!field || field === document.body) field = document.querySelector("main") ?? strip.parentElement;
        const cs = getComputedStyle(field);
        const r = field.getBoundingClientRect();
        const left = r.left + parseFloat(cs.paddingLeft) + 16;
        const width = Math.max(0, r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 32);
        strip.style.width = `${Math.round(width)}px`;
        strip.style.left = "0px";
        strip.style.left = `${Math.round(left - strip.getBoundingClientRect().left)}px`;
      }
      let fitTimer = 0;
      let fitWidth = innerWidth;
      onStart(() => {
        addEventListener("resize", () => {
          clearTimeout(fitTimer);
          fitTimer = setTimeout(() => {
            const strip = document.querySelector(".aqm-piles");
            if (stopped || !strip || innerWidth === fitWidth) return;
            fitWidth = innerWidth;
            delete strip.dataset.sig;
            markBoosterKinds();
          }, 150);
        });
      });
      function tiltOnHover(el) {
        const pose = [...el.querySelectorAll('[class*="__packPose"]')].find((p) => !p.closest('[aria-hidden="true"]'));
        if (!pose) return;
        const scene = pose.closest('[class*="__packScene"]');
        scene?.parentElement?.setAttribute("data-aqm-float", "");
        const base = pose.style.transform || "rotateY(-20deg) rotateX(7deg)";
        const ry = Number(base.match(/rotateY\((-?[\d.]+)deg\)/)?.[1] ?? -20);
        const rx = Number(base.match(/rotateX\((-?[\d.]+)deg\)/)?.[1] ?? 7);
        el.addEventListener("pointermove", (e) => {
          const r = el.getBoundingClientRect();
          const x = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5));
          const y = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5));
          pose.classList.add("aqm-pose-follow");
          pose.style.transform = `rotateY(${(ry + x * 18).toFixed(2)}deg) rotateX(${(rx - y * 10).toFixed(2)}deg)`;
        });
        el.addEventListener("pointerleave", () => {
          pose.classList.remove("aqm-pose-follow");
          pose.style.transform = base;
        });
      }
      const RECYCLE_TITLE = /^recycler des cartes$/i;
      const recycleSeen = /* @__PURE__ */ new WeakSet();
      let recycleIntent = "none";
      let recyclePrepared = null;
      let recycleJob = null;
      function tickBox(row) {
        const known = row.querySelector('input[type="checkbox"], [role="checkbox"], [aria-checked]');
        if (known) return known;
        const img = row.querySelector("img");
        for (const el of row.querySelectorAll("*")) {
          if (el.contains(img) || !(el.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
          const r = el.getBoundingClientRect();
          if (r.width >= 12 && r.width <= 32 && Math.abs(r.width - r.height) <= 4) return el;
        }
        return null;
      }
      function isTicked(box) {
        if (box.tagName === "INPUT") return box.checked;
        const said = box.getAttribute("aria-checked") ?? (box.hasAttribute("data-state") ? String(box.getAttribute("data-state") === "checked") : null);
        if (said != null) return said === "true";
        const svg = box.querySelector("svg");
        if (!svg) return false;
        const r = svg.getBoundingClientRect();
        const cs = getComputedStyle(svg);
        return r.width > 0 && cs.visibility !== "hidden" && Number(cs.opacity) > 0.1 && cs.color !== "rgba(0, 0, 0, 0)";
      }
      function recycleCount(dialog) {
        const b = [...dialog.querySelectorAll("button")].find((x) => !x.closest(".aqm-root") && /^recycler\b/i.test(x.textContent.trim()));
        return b ? Number(b.textContent.trim().match(/^recycler\s+([\d\s  ]+)/i)?.[1]?.replace(/\s/g, "") || 0) : null;
      }
      function sparesMode(dialog) {
        const modes = dialog.querySelector('[role="radiogroup"]');
        if (!modes) return { total: null };
        const spares = [...modes.querySelectorAll('[role="radio"]')].find((b) => /mes doublons/i.test(b.textContent));
        if (spares?.getAttribute("aria-checked") !== "true") return null;
        const total = Number(spares.textContent.match(/\(([\d\s  ]+)\)/)?.[1]?.replace(/\s/g, ""));
        return { total: Number.isFinite(total) ? total : null };
      }
      function recycleParts() {
        const title = [...document.querySelectorAll("h1, h2, h3")].find((t) => !t.closest(".aqm-root") && RECYCLE_TITLE.test(t.textContent.trim()));
        const dialog = title?.closest('[role="dialog"]') ?? title?.parentElement?.parentElement?.parentElement;
        if (!dialog) return null;
        const rows = [];
        for (const img of dialog.querySelectorAll("img")) {
          let row = img;
          while (row.parentElement && row.parentElement !== dialog && row.parentElement.querySelectorAll("img").length === 1) row = row.parentElement;
          const box = row !== img && /#\s?\d+/.test(row.textContent) ? tickBox(row) : null;
          if (box) rows.push({ row, box });
        }
        return { dialog, rows };
      }
      function settleRows(rows) {
        for (const { row, box } of rows) {
          if (recycleSeen.has(row)) continue;
          recycleSeen.add(row);
          if (isTicked(box) !== (recycleIntent === "all")) box.click();
        }
      }
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
      async function loadAllRecycleRows(dialog) {
        const first = recycleParts()?.rows[0]?.row;
        let scroller = first?.parentElement;
        while (scroller && scroller !== dialog && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
        if (!scroller) return;
        const top = scroller.scrollTop;
        let last = -1;
        for (let still = 0, guard = 0; still < 4 && guard < 400 && dialog.isConnected; guard++) {
          const parts2 = recycleParts();
          if (!parts2) break;
          settleRows(parts2.rows);
          if (parts2.rows.length === last) still++;
          else [still, last] = [0, parts2.rows.length];
          scroller.scrollTop = scroller.scrollHeight;
          await nextFrame();
        }
        const parts = recycleParts();
        if (parts) settleRows(parts.rows);
        scroller.scrollTop = top;
      }
      function prepareRecycle(dialog) {
        if (recyclePrepared === dialog) return Promise.resolve();
        recycleJob ??= loadAllRecycleRows(dialog).catch(() => {
        }).finally(() => {
          recyclePrepared = dialog;
          recycleJob = null;
          markRecycleDialog();
        });
        return recycleJob;
      }
      function markRecycleDialog() {
        if (!location.pathname.startsWith("/jeu")) return;
        const parts = recycleParts();
        if (!parts) {
          recycleIntent = "none";
          recyclePrepared = null;
          return;
        }
        const { dialog, rows } = parts;
        const mode = sparesMode(dialog);
        let bar = dialog.querySelector(".aqm-recycle-bar");
        if (bar) bar.hidden = !mode;
        if (!mode || !rows.length) return;
        settleRows(rows);
        if (recyclePrepared !== dialog) prepareRecycle(dialog);
        let btn = bar?.querySelector(".aqm-recycle-all");
        if (!btn) {
          btn = h("button", { type: "button", class: "aqm-queue-btn aqm-recycle-all", onclick: toggleRecycle });
          bar = h("div", { class: "aqm-root aqm-recycle-bar" }, btn);
          rows[0].row.parentElement.before(bar);
        }
        const count = recycleCount(dialog);
        const all = count != null && mode.total != null ? count > 0 && count >= mode.total : rows.every((r) => isTicked(r.box));
        const label = recycleJob ? "Préparation de la liste…" : all ? "Tout désélectionner" : "Tout sélectionner";
        if (btn.textContent !== label) btn.textContent = label;
        btn.disabled = !!recycleJob;
      }
      async function toggleRecycle() {
        let parts = recycleParts();
        if (!parts) return;
        await prepareRecycle(parts.dialog);
        parts = recycleParts();
        if (!parts) return;
        const mode = sparesMode(parts.dialog) ?? { total: null };
        const count = recycleCount(parts.dialog);
        const all = count != null && mode.total != null ? count > 0 && count >= mode.total : parts.rows.every((r) => isTicked(r.box));
        recycleIntent = all ? "none" : "all";
        for (const r of parts.rows) if (isTicked(r.box) !== (recycleIntent === "all")) r.box.click();
        setTimeout(markRecycleDialog, 50);
      }
      const AUTO_RARITIES = /* @__PURE__ */ new Set(["N", "R", "SR"]);
      let pulledCards = /* @__PURE__ */ new Set();
      let spareOffer = null;
      async function loadSpares(cards) {
        const [mine, rarities] = await Promise.all([gameWrite("/copies", "GET"), gameWrite("/rarities", "GET").catch(() => null)]);
        const list = Array.isArray(rarities) ? rarities : rarities?.rarities ?? [];
        const value = new Map(list.filter((r) => r?.code).map((r) => [r.code, Number(r.recycleValue) || 0]));
        const byCard = /* @__PURE__ */ new Map();
        for (const c of Array.isArray(mine?.copies) ? mine.copies : []) {
          const id = c?.card?.id;
          if (!id || !cards.has(id) || c.locked) continue;
          if (!byCard.has(id)) byCard.set(id, []);
          byCard.get(id).push(c);
        }
        return [...byCard.values()].flatMap(
          (all) => [...all].sort((a, b) => Number(!!b.protected) - Number(!!a.protected) || (Number(a.serial) || 0) - (Number(b.serial) || 0)).slice(1).filter((c) => !c.protected)
        ).map((c) => ({ id: c.copyId, rarity: c.card?.rarity ?? null, perles: value.get(c.card?.rarity) ?? 0 })).filter((c) => typeof c.id === "string" && c.id);
      }
      async function recycleCopies(ids) {
        let gained = 0;
        let done = 0;
        let error = null;
        try {
          for (let i = 0; i < ids.length; i += 200) {
            const res = await gameWrite("/recycle", "POST", { copyIds: ids.slice(i, i + 200) });
            done = Math.min(ids.length, i + 200);
            gained += Number(res?.gained) || 0;
            if (typeof res?.perles === "number") window.postMessage({ aquamanCmd: "set-perles", perles: res.perles }, location.origin);
          }
        } catch (e) {
          error = e;
        }
        if (done) {
          owned = null;
          send({ type: "collection-stale" });
          guardSoon();
        }
        return { done, gained, error };
      }
      const recycledText = (done, gained) => `♻ ${fmt(done)} recyclée${done > 1 ? "s" : ""} · +${fmt(gained)} Perles`;
      async function offerSpares(offer) {
        let spares;
        try {
          spares = await loadSpares(offer.cards);
        } catch (e) {
          console.warn("[Aquaman] doublons du tirage", e);
          return Object.assign(offer, { state: "unread", text: "♻ Doublons : réessayer", error: e?.message || String(e) });
        }
        if (feat.autoRecycle === true) {
          const auto = spares.filter((c) => AUTO_RARITIES.has(c.rarity));
          if (auto.length) {
            offer.state = "busy";
            markRecycleSpares();
            const r = await recycleCopies(auto.map((c) => c.id));
            offer.note = r.done ? `${recycledText(r.done, r.gained)} (auto)` : `Recyclage automatique refusé : ${r.error?.message ?? ""}`;
            const gone = new Set(auto.slice(0, r.done).map((c) => c.id));
            spares = spares.filter((c) => !gone.has(c.id));
          }
        }
        const left = on("recycleSpares") ? spares : [];
        Object.assign(offer, { ids: left.map((c) => c.id), perles: left.reduce((n, c) => n + c.perles, 0), state: left.length ? "ready" : "none" });
      }
      function cardsWindowRow() {
        for (const close of document.querySelectorAll("button")) {
          if (close.closest(".aqm-root") || !/^fermer$/i.test(close.textContent.trim())) continue;
          const row = close.parentElement;
          const mine = row && [...row.children].find((b) => (b.tagName === "A" || b.tagName === "BUTTON") && !b.classList.contains("aqm-recycle-spares") && /^voir ma collection$/i.test(b.textContent.trim()));
          if (mine) return { row, mine };
        }
        return null;
      }
      function markRecycleSpares() {
        const old = document.querySelector(".aqm-recycle-spares");
        const oldNote = document.querySelector(".aqm-recycle-note");
        const found = (on("recycleSpares") || feat.autoRecycle === true) && pulledCards.size ? cardsWindowRow() : null;
        if (!found) return void (old?.remove(), oldNote?.remove());
        const { row, mine } = found;
        if (spareOffer?.cards !== pulledCards) {
          const offer = spareOffer = { cards: pulledCards, state: "loading" };
          offerSpares(offer).finally(() => spareOffer === offer && markRecycleSpares());
        }
        const o = spareOffer;
        let note = oldNote;
        if (o.note) {
          if (!note || note.parentElement !== row) {
            oldNote?.remove();
            note = h("span", { class: "aqm-root aqm-recycle-note" });
            mine.after(note);
          }
          if (note.textContent !== o.note) note.textContent = o.note;
        } else oldNote?.remove();
        if (o.state === "none" || o.state === "loading" || o.state === "busy" && !o.ids) return void old?.remove();
        const n = o.ids?.length ?? 0;
        const gain = o.perles ? ` · +${fmt(o.perles)} Perles` : "";
        const label = {
          unread: o.text,
          ready: `♻ Recycler les doublons (${fmt(n)})`,
          confirm: `Confirmer : ${fmt(n)} carte${n > 1 ? "s" : ""}${gain}`,
          busy: "Recyclage…",
          done: o.text,
          failed: o.text
        }[o.state];
        const title = o.state === "unread" ? `Tes exemplaires n’ont pas pu être lus (${o.error}). Clique pour réessayer.` : o.state === "failed" ? "Clique pour réessayer" : `Les doublons des cartes de ce tirage${gain}. On garde le plus petit numéro de chaque carte ; les cartes en vente ou verrouillées ne sont pas touchées.`;
        let btn = old;
        if (!btn || btn.parentElement !== row) {
          old?.remove();
          btn = h("button", { type: "button", class: `${mine.className} aqm-recycle-spares`, onclick: recycleSpares });
          (note?.isConnected ? note : mine).after(btn);
        }
        if (btn.textContent !== label) btn.textContent = label;
        if (btn.title !== title) btn.title = title;
        btn.disabled = o.state === "busy" || o.state === "done";
        btn.classList.toggle("is-confirm", o.state === "confirm");
      }
      async function recycleSpares() {
        const o = spareOffer;
        if (!o) return;
        if (o.state === "unread") {
          spareOffer = null;
          return markRecycleSpares();
        }
        if (o.state === "ready" || o.state === "failed") {
          o.state = "confirm";
          setTimeout(() => o.state === "confirm" && (o.state = "ready", markRecycleSpares()), 6e3);
          return markRecycleSpares();
        }
        if (o.state !== "confirm") return;
        o.state = "busy";
        markRecycleSpares();
        const { done, gained, error } = await recycleCopies(o.ids);
        o.ids = o.ids.slice(done);
        if (!error) {
          o.state = "done";
          o.text = recycledText(done, gained);
        } else {
          o.state = o.ids.length ? "failed" : "done";
          o.text = done ? `${recycledText(done, gained)}, puis refus : ${error.message}` : `Refusé : ${error.message}`;
        }
        markRecycleSpares();
      }
      const navLink = (route) => firstVisible(`a[data-tour="nav-${route}"]`) ?? firstVisible(`a[href="${route}"]`);
      function menuItem(i) {
        const plus = firstVisible(".aqm-plus");
        if (!plus) return null;
        if (!menu || menu.anchor !== plus) openMenu(plus);
        return menu.querySelectorAll(".aqm-menu-item")[i];
      }
      function seriesStrip() {
        for (const label of elementsWithText(document.body, /toutes les s[ée]ries/i)) {
          for (let el = label; el && el !== document.body; el = el.parentElement)
            if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return el;
          return label.closest("button, a") ?? label;
        }
        return null;
      }
      const FINDERS = {
        plus: () => firstVisible(".aqm-plus"),
        "menu-0": () => menuItem(0),
        "menu-1": () => menuItem(1),
        "menu-2": () => menuItem(2),
        "menu-3": () => menuItem(3),
        board: () => firstVisible(".aqm-board-scope") ?? navLink("/jeu/classement"),
        series: () => seriesStrip() ?? navLink("/jeu/collection"),
        vitrine: () => [...document.querySelectorAll("button, a")].find((b) => isVisible(b) && !b.closest(".aqm-root") && /ma vitrine/i.test(b.textContent))
      };
      const stepTarget = (step) => step.find ? FINDERS[step.find]?.() : step.target ? firstVisible(step.target) : null;
      const stepText = (step) => typeof step.text === "string" ? step.text : canHover() ? step.text.hover : step.text.touch;
      let tour = null;
      function startTour(i = 0) {
        if (stopped) return;
        closeOverlay();
        stopTour();
        const hole = h("div", { class: "aqm-tour-hole" });
        const card = h("div", { class: "aqm-tour-card", role: "dialog", "aria-live": "polite" });
        const layer = h("div", { class: "aqm-root aqm-tour" }, h("div", { class: "aqm-tour-block" }), hole, card);
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
        if (location.hash.startsWith(TOUR_HASH)) history.replaceState(null, "", location.pathname + location.search);
      }
      async function waitFor(find, ms) {
        const end = Date.now() + ms;
        for (; ; ) {
          const el = find();
          if (el && isVisible(el)) return el;
          if (Date.now() > end || !tour) return null;
          await new Promise((r) => setTimeout(r, 150));
        }
      }
      async function showStep(i) {
        if (!tour) return;
        const step = TOUR[i];
        const token = ++tour.token;
        tour.i = i;
        tour.el = null;
        session(TOUR_STEP, String(i));
        if (!step.find?.startsWith("menu")) closeMenu();
        renderTourCard(step, true);
        if (step.page && location.pathname.replace(/\/$/, "") !== step.page) {
          const link = navLink(step.page);
          if (link) link.click();
          else return void location.assign(step.page);
        }
        const el = step.find || step.target ? await waitFor(() => stepTarget(step), 6e3) : null;
        if (!tour || token !== tour.token) return;
        tour.el = el;
        el?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        renderTourCard(step, false);
      }
      function renderTourCard(step, loading) {
        const { i, card } = tour;
        const last = i === TOUR.length - 1;
        card.replaceChildren(
          h("p", { class: "aqm-tour-count" }, `${i + 1} / ${TOUR.length}`),
          h("h3", { class: "aqm-tour-title" }, step.title),
          h("p", { class: "aqm-tour-text" }, loading && step.page ? "Ouverture de la page…" : stepText(step)),
          h(
            "div",
            { class: "aqm-tour-actions" },
            last ? null : h("button", { type: "button", class: "aqm-tour-skip", onclick: stopTour }, "Passer"),
            h("span", { class: "aqm-tour-gap" }),
            i > 0 ? h("button", { type: "button", class: "aqm-tour-btn", onclick: () => showStep(i - 1) }, "Précédent") : null,
            h("button", { type: "button", class: "aqm-tour-btn is-main", onclick: () => last ? stopTour() : showStep(i + 1) }, last ? "Terminer" : i === 0 ? "C’est parti" : "Suivant")
          )
        );
      }
      function placeTour() {
        const { el, hole, card, layer } = tour;
        const r = el && el.isConnected ? el.getBoundingClientRect() : null;
        const pad = 8;
        const shown = !!(r && r.width);
        if (shown) Object.assign(hole.style, { display: "block", left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
        else hole.style.display = "none";
        layer.classList.toggle("is-dim", !shown);
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
      const versionNewer = (a, b) => {
        const pa = String(a).split(".").map(Number);
        const pb = String(b).split(".").map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
        return false;
      };
      function openNews(since) {
        const entries = CHANGES.filter((c) => !since || versionNewer(c.version, since));
        const body = openOverlay("Nouveautés", since ? `Ce qui a changé depuis la version ${since}.` : "Ce qui a changé dans chaque version d’Aquaman.");
        for (const entry of entries.length ? entries : CHANGES.slice(0, 1)) {
          body.append(
            h("p", { class: "aqm-label aqm-news-version" }, `Version ${entry.version}`),
            h(
              "ul",
              { class: "aqm-news" },
              entry.items.map(([text, stepId]) => {
                const at = stepId ? TOUR.findIndex((s) => s.id === stepId) : -1;
                return h("li", {}, h("span", {}, text), at >= 0 ? h("button", { type: "button", class: "aqm-chip", onclick: () => startTour(at) }, "Montre-moi") : null);
              })
            )
          );
        }
        body.append(h("div", { class: "aqm-news-foot" }, h("button", { type: "button", class: "aqm-tour-btn is-main", onclick: () => startTour(0) }, "Visite guidée"), h("button", { type: "button", class: "aqm-tour-btn", onclick: closeOverlay }, "Fermer")));
      }
      async function showTutorialOnce() {
        if (location.hash.startsWith(TOUR_HASH) || location.hash === NEWS_HASH || session(TOUR_STEP) != null) return;
        const version = chrome.runtime.getManifest().version;
        const { seenVersion, settings } = await chrome.storage.local.get(["seenVersion", "settings"]);
        if (seenVersion === version) return;
        await chrome.storage.local.set({ seenVersion: version });
        if (!seenVersion) startTour(0);
        else if (settings?.notifyUpdated !== false && versionNewer(version, seenVersion)) openNews(seenVersion);
      }
      function onHash() {
        const step = location.hash.startsWith(`${TOUR_HASH}-`) ? TOUR.findIndex((s) => s.id === location.hash.slice(TOUR_HASH.length + 1)) : -1;
        if (step >= 0 && !tour) startTour(step);
        else if (location.hash === TOUR_HASH && !tour) startTour(0);
        else if (location.hash === NEWS_HASH && !overlay) {
          openNews();
          history.replaceState(null, "", location.pathname + location.search);
        }
      }
      let started = false;
      function startOnce() {
        if (started || !firstVisible(".aqm-plus")) return;
        started = true;
        const resume = session(TOUR_STEP);
        if (resume != null) startTour(Math.min(TOUR.length - 1, Number(resume) || 0));
        else onHash();
        showTutorialOnce();
      }
      function onStorage(changes) {
        if (stopped || !settled) return;
        if (changes.settings && !settingsOpen) {
          const now = changes.settings.newValue ?? {};
          const STEPS = new Set(STEP_SETTING.values()).add("packGlow").add("recycleSpares");
          if (now.autoRecycle === true !== (feat.autoRecycle === true)) offerReload();
          if ([...STEPS].some((key) => now[key] !== false !== on(key))) offerReload();
        }
        if (changes[QUEUE]) {
          renderBox();
          runQueue();
        }
        if (changes[SALES]) {
          renderSalesBox();
          runSales();
        }
        if (changes[BOUGHT_KEY]) {
          for (const key of changes[BOUGHT_KEY].newValue ?? []) boughtNames.add(key);
          hideBoughtCards();
        }
      }
      let wantsPulledAt = 0;
      onStart(() => {
        setInterval(async () => {
          if (stopped || !settled) return;
          if (!alive()) return shutdown();
          const q = await readQueue();
          renderBox();
          if (q?.finishedAt && Date.now() - q.finishedAt > 6e4) chrome.storage.local.remove(QUEUE);
          else runQueue();
          checkRoom();
          const sales = await readSales();
          renderSalesBox();
          if (sales?.finishedAt && Date.now() - sales.finishedAt > 6e4) chrome.storage.local.remove(SALES);
          else runSales();
          checkSales();
          if (Date.now() - wantsPulledAt > 6e4) {
            wantsPulledAt = Date.now();
            send({ type: "wants-sync" });
            send({ type: "market-sync" });
          }
        }, 5e3);
      });
      function onPageMessage(e) {
        if (e.source !== window || e.origin !== location.origin || typeof e.data?.aquaman !== "string") return;
        if (e.data.aquaman === "collection-stale") {
          owned = null;
          send({ type: "collection-stale" });
          guardSoon();
          if (on("collectionStats")) snapCollection(true);
          setTimeout(schedule, 1500);
          setTimeout(() => checkRoom(2e4), 3e3);
        } else if (e.data.aquaman === "sell-refused" && e.data.item?.copyId)
          onSellRefused(e.data.item, String(e.data.message ?? ""), Array.isArray(e.data.ticked) ? e.data.ticked.filter((t) => t?.copyId && t.price > 0) : []);
        else if (e.data.aquaman === "status") {
          send({ type: "status", pending: e.data.pending });
          if (Array.isArray(e.data.boosters)) {
            pendingBoosters = e.data.boosters.filter((b) => b?.id);
            markBoosterKinds();
          }
        } else if (e.data.aquaman === "market-bought" && typeof e.data.name === "string") addBought(e.data.name, e.data.rarity);
        else if (e.data.aquaman === "market-sales" && Array.isArray(e.data.keys) && on("marketSales")) markSalesCards();
        else if (e.data.aquaman === "feed" && Array.isArray(e.data.pulls)) send({ type: "feed-seen", pulls: e.data.pulls });
        else if (e.data.aquaman === "player-seen" && typeof e.data.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(e.data.id) && typeof e.data.name === "string" && e.data.name.trim())
          playersSeen.set(foldName(e.data.name), e.data.id);
        else if (e.data.aquaman === "opened" && Array.isArray(e.data.boosters)) {
          if (batch) batch.opened = e.data.boosters.length;
          pulledCards = new Set((Array.isArray(e.data.cards) ? e.data.cards.flat() : []).filter((id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id)));
          spareOffer = null;
          send({ type: "opened", boosters: e.data.boosters, best: Array.isArray(e.data.best) ? e.data.best : [], packs: Array.isArray(e.data.packs) ? e.data.packs : [], ids: Array.isArray(e.data.ids) ? e.data.ids : [] }).then((report) => {
            if (report && !report.error) {
              pityReport2 = report;
              pityAt = Date.now();
            }
            renderPity();
          });
        }
      }
      function onKey(e) {
        if (tour) {
          if (e.key === "Escape") stopTour();
          else if (e.key === "ArrowRight" && tour.i < TOUR.length - 1) showStep(tour.i + 1);
          else if (e.key === "ArrowLeft" && tour.i > 0) showStep(tour.i - 1);
          return;
        }
        if (e.key !== "Escape") return;
        if (marketSortMenu) closeMarketSortMenu();
        else if (menu) closeMenu();
        else if (overlay) closeOverlay();
      }
      function onBack() {
        if (document.visibilityState !== "visible") return;
        if (document.querySelector(".aqm-pity")) loadPity(true);
        if (document.querySelector(".aqm-star")) loadFavIds(true);
        send({ type: "wants-sync", fresh: true });
      }
      function onOutside(e) {
        if (menu && !menu.contains(e.target) && !menu.anchor?.contains(e.target) && !e.target.closest?.(".aqm-tour")) closeMenu();
        if (marketSortMenu && !marketSortMenu.contains(e.target) && !marketSortMenu.anchor?.contains(e.target)) closeMarketSortMenu();
      }
      let feedAt = 0;
      function pollFeedNow() {
        if (Date.now() - feedAt < 6e4) return;
        feedAt = Date.now();
        send({ type: "feed-poll" });
      }
      const HELLO_EVERY2 = 10 * 6e4;
      let helloAt = 0;
      function sayHello2() {
        if (Date.now() - helloAt < HELLO_EVERY2) return;
        helloAt = Date.now();
        send({ type: "hello", kind: owner }).then((res) => res?.revoked && !stopped && revoke());
      }
      function revoke() {
        shutdown();
        if (session("aqm-revoked-told")) return;
        session("aqm-revoked-told", "1");
        const box = h(
          "div",
          { class: "aqm-root aqm-update", role: "status" },
          h("div", { class: "aqm-queue-head" }, h("strong", {}, "🔱 Aquaman est désactivé")),
          h("p", {}, "L’auteur d’Aquaman a désactivé son utilisation pour ton compte."),
          h("div", { class: "aqm-update-actions" }, h("button", { type: "button", class: "aqm-queue-btn", onclick: () => box.remove() }, "OK"))
        );
        document.body.append(box);
      }
      let helloTimer = 0;
      onStart(() => {
        helloTimer = setInterval(() => {
          if (stopped || !settled || document.visibilityState !== "visible") return;
          sayHello2();
          checkAccess();
        }, 6e4);
      });
      let accessAt = 0;
      function checkAccess() {
        if (Date.now() - accessAt < 55e3) return;
        accessAt = Date.now();
        send({ type: "access" }).then((res) => res?.revoked && !stopped && revoke());
      }
      const UPDATE_EVERY2 = 10 * 6e4;
      const SCRIPT_URL = "https://raw.githubusercontent.com/A-Finch13/Poseidon-TCG/main/aquaman.user.js";
      let updateAt = 0;
      function lookForUpdate() {
        if (owner !== "userscript" || Date.now() - updateAt < UPDATE_EVERY2) return;
        updateAt = Date.now();
        send({ type: "check-update" }).then((res) => !stopped && showUpdate(res?.update));
      }
      const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
      const INSTALL_PAGE = "https://a-finch13.github.io/Poseidon-TCG/";
      function showUpdate(update) {
        const version = chrome.runtime.getManifest().version;
        if (!update?.version || !versionNewer(update.version, version) || session("aqm-update-later") === update.version) return;
        if (document.querySelector(".aqm-update")) return;
        const url = update.script || SCRIPT_URL;
        const later = h("button", { type: "button", class: "aqm-queue-btn", onclick: () => (session("aqm-update-later", update.version), box.remove()) }, "Plus tard");
        const iosSteps = () => box.replaceChildren(
          h("div", { class: "aqm-queue-head" }, h("strong", {}, `🔱 Installer Aquaman ${update.version}`)),
          h(
            "ol",
            { class: "aqm-update-steps" },
            h("li", {}, "Touche ", h("b", {}, "ᴀA"), " (ou ", h("b", {}, "🧩"), ") à gauche de la barre d’adresse, puis ", h("b", {}, "Userscripts"), "."),
            h("li", {}, "Dans le panneau de Userscripts, touche le bouton de ", h("b", {}, "recherche de mises à jour"), " (↻), puis mets à jour ", h("b", {}, "Aquaman"), "."),
            h("li", {}, "Touche ", h("b", {}, "Recharger"), " ci-dessous : les nouveautés de la version s’affichent.")
          ),
          h("p", { class: "aqm-muted" }, "Userscripts ne trouve rien ? Suis les étapes « Mettre à jour sur iPhone et iPad » de la ", h("a", { href: INSTALL_PAGE, target: "_blank", rel: "noopener" }, "page d’installation"), "."),
          h("div", { class: "aqm-update-actions" }, h("button", { type: "button", class: "aqm-queue-btn", onclick: () => box.remove() }, "Fermer"), h("button", { type: "button", class: "aqm-queue-btn is-main", onclick: () => location.reload() }, "Recharger"))
        );
        const box = h(
          "div",
          { class: "aqm-root aqm-update", role: "status" },
          h("div", { class: "aqm-queue-head" }, h("strong", {}, `🔱 Aquaman ${update.version} est disponible`)),
          h(
            "p",
            {},
            IOS ? `Tu as la version ${version}. Touche « Installer » : les étapes pour mettre Aquaman à jour avec Userscripts s’affichent ici.` : `Tu as la version ${version}. Touche « Installer », puis « Mettre à jour » dans Tampermonkey. Recharge ensuite cette page.`
          ),
          h(
            "div",
            { class: "aqm-update-actions" },
            later,
            IOS ? h("button", { type: "button", class: "aqm-queue-btn is-main", onclick: iosSteps }, "Installer") : h("a", { class: "aqm-queue-btn is-main", href: url, target: "_blank", rel: "noopener", onclick: () => box.remove() }, "Installer")
          )
        );
        document.body.append(box);
      }
      function offerReload() {
        if (document.querySelector(".aqm-reload")) return;
        const box = h(
          "div",
          { class: "aqm-root aqm-update aqm-reload", role: "status" },
          h("div", { class: "aqm-queue-head" }, h("strong", {}, "🔱 Réglages d’Aquaman modifiés")),
          h("p", {}, "Recharge la page pour les appliquer."),
          h(
            "div",
            { class: "aqm-update-actions" },
            h("button", { type: "button", class: "aqm-queue-btn", onclick: () => box.remove() }, "Plus tard"),
            h("button", { type: "button", class: "aqm-queue-btn is-main", onclick: () => location.reload() }, "Recharger")
          )
        );
        document.body.append(box);
      }
      const STEP_SETTING = /* @__PURE__ */ new Map([
        [enlargePulls, "bigPulls"],
        [showPity, "pity"],
        [markSeriesStrip, "seriesTools"],
        [markFavoriteSeries, "seriesTools"],
        [markAlbum, "albumButtons"],
        [watchGuards, "albumButtons"],
        [markMissingTab, "missingTab"],
        [markMissingSales, "missingSales"],
        [markCollectionStats, "collectionStats"],
        [snapCollection, "collectionStats"],
        [markCardWho, "cardWho"],
        [markCardListings, "cardListings"],
        [markSellDialog, "sellTools"],
        [markUnlistButton, "sellTools"],
        [hideBoughtCards, "hideBought"],
        [markMarketFavorites, "marketFavorites"],
        [markSalesCards, "marketSales"],
        [markRecycleDialog, "recycleHelp"],
        [markBoosterKinds, "boosterWheel"],
        [markOpenMore, "openMore"],
        [enhanceShowcaseEditor, "showcaseDrag"],
        [markTrades, "tradeMarks"],
        [markTradeFilters, "tradeFilters"],
        [markGameBoard, "friendsBoard"]
      ]);
      function run() {
        if (stopped) return;
        if (!alive()) return shutdown();
        const inGame = location.pathname.startsWith("/jeu");
        if (!inGame && !TRADE_PAGES.test(location.pathname)) return;
        if (location.pathname !== visitPath) {
          visitPath = location.pathname;
          pageVisit++;
        }
        const began = performance.now();
        runText = null;
        for (const step of [addPlusTab, enlargePulls, showPity, readPityRules, markSeriesStrip, markFavoriteSeries, markAlbum, watchGuards, markMissingTab, markMissingSales, markCollectionStats, snapCollection, markCardWho, markCardListings, markSellDialog, markUnlistButton, hideBoughtCards, markMarketFavorites, markSalesCards, watchSaleToast, markRecycleDialog, markBoosterKinds, markOpenMore, markRecycleSpares, resumeScan, enhanceShowcaseEditor, markTrades, markTradeFilters, markGameBoard, pollFeedNow, sayHello2, checkAccess, lookForUpdate, startOnce]) {
          if (STEP_SETTING.has(step) && !on(STEP_SETTING.get(step))) continue;
          if (!inGame && step !== markTrades && step !== checkAccess) continue;
          try {
            step();
          } catch (e) {
            console.warn("[Aquaman]", e);
          }
        }
        runText = void 0;
        runCost = performance.now() - began;
      }
      let queued = false;
      let runCost = 0;
      let pageVisit = 0;
      let visitPath = "";
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
          if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 1e3 });
          else go();
        }, Math.min(1500, Math.max(150, runCost * 8)));
      }
      onStart(() => {
        document.addEventListener("visibilitychange", () => {
          if (document.hidden || !missedRun) return;
          missedRun = false;
          schedule();
        });
      });
      const observer = new MutationObserver((records) => records.some((r) => !quietChange(r)) && schedule());
      const listeners = [
        [document, "wheel", onWheel, { passive: false, capture: true }],
        [document, "pointerdown", onGrabDown, true],
        [document, "pointermove", onGrabMove, { passive: false }],
        [document, "pointerup", onGrabEnd],
        [document, "pointercancel", onGrabEnd],
        [document, "dragstart", onGrabDragStart, true],
        [document, "pointermove", onPointerMove, { passive: false }],
        [document, "touchmove", (e) => press?.active && e.preventDefault(), { passive: false }],
        [document, "contextmenu", (e) => press && e.target.closest?.(".aqm-slot") && e.preventDefault()],
        [document, "pointerup", (e) => press && e.pointerId === press.id && endPress(true, e)],
        [document, "pointercancel", (e) => press && e.pointerId === press.id && endPress(false, e)],
        [document, "pointerdown", onOutside, true],
        [document, "click", onSellClick, true],
        [document, "keydown", onKey],
        [window, "resize", closeMenu],
        [window, "popstate", closeOverlay],
        [window, "hashchange", onHash],
        [window, "message", onPageMessage],
        [window, "focus", onBack],
        [document, "visibilitychange", onBack]
      ];
      let stopped = false;
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
        closeMarketSortMenu();
        overlay = null;
        document.querySelectorAll(".aqm-root, .aqm-plus, .aqm-open-more, .aqm-trade-filter").forEach((el) => el.remove());
        document.querySelectorAll("[data-aqm-tradehide]").forEach((el) => el.removeAttribute("data-aqm-tradehide"));
        document.querySelectorAll('[class*="aqm-"]').forEach((el) => {
          for (const cls of [...el.classList]) if (cls.startsWith("aqm-")) el.classList.remove(cls);
        });
        document.querySelectorAll("[data-aqm-slot]").forEach((el) => delete el.dataset.aqmSlot);
        document.querySelectorAll("[data-aqm-lite]").forEach((el) => delete el.dataset.aqmLite);
        document.querySelectorAll("[data-aqm-anchor]").forEach((el) => {
          el.style.position = "";
          delete el.dataset.aqmAnchor;
        });
        root.classList.remove("aqm-lock");
        if (root.dataset.aqmOwner === owner) delete root.dataset.aqmOwner;
      }
      function whenSettled(start2) {
        const idle = () => window.requestIdleCallback ? requestIdleCallback(start2, { timeout: 1500 }) : setTimeout(start2, 300);
        const since = Date.now();
        const wait = () => document.documentElement.hasAttribute("data-aqm-hydrated") || Date.now() - since > 16e3 ? idle() : setTimeout(wait, 150);
        if (document.readyState === "complete") wait();
        else addEventListener("load", wait, { once: true });
      }
      function begin() {
        addEventListener("message", (e) => {
          if (e.source === window && e.data?.aquaman === "boosters-refreshed") onBoostersRefreshed(e.data.id, !!e.data.ok);
        });
        Promise.all([loadShotStore(), featReady]).then(() => !stopped && /^\/jeu\/?$/.test(location.pathname) && markBoosterKinds());
        featReady.then(() => !stopped && earlyStatsButton());
        featReady.then(() => {
          if (stopped || favLoading || seriesBySlug || !on("seriesTools") || !location.pathname.startsWith("/jeu")) return;
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
                console.warn("[Aquaman]", e);
              }
            });
          });
          early.observe(document.documentElement, { childList: true, subtree: true });
        }
        whenSettled(() => {
          if (stopped) return;
          settled = true;
          accountId().then((id) => meId = id);
          for (const [target, type, fn, opts] of listeners) target.addEventListener(type, fn, opts);
          chrome.storage.onChanged.addListener(onStorage);
          renderBox();
          runQueue();
          renderSalesBox();
          runSales();
          observer.observe(root, { childList: true, subtree: true });
          run();
        });
      }
      if (!otherCopy) {
        for (const fn of startups) fn();
        begin();
      }
    })();
    if (document.documentElement.dataset.aqmOwner !== OWNER) style.remove();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
})();
