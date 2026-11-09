// Aquaman : les compteurs anti-malchance, les ouvertures partagées entre les appareils du joueur, l'historique des
// tirages.

import { RANK, RELAY } from './common.js';
import { getSettings } from './settings.js';
import { cached, game, myId } from './api.js';
import { loadCatalog, slotOdds } from './boosters.js';
import { globalPacks } from './favorites.js';

// ---------- anti-malchance (pity) ----------

// Boosters après lesquels le jeu garantit une carte de cette rareté ou mieux (le texte de la boutique peut les mettre à
// jour).
export const PITY = { SSR: 60, UR: 190 };
const PITY_EVENTS = 500; // plus que la plus longue garantie : les ouvertures plus anciennes ne changent rien
const PITY_PULL = 60e3; // les ouvertures des autres appareils sont lues une fois par minute au plus

// Ouvertures du joueur connecté gardées par Aquaman : { events: [{ id, at, top }], unsynced: [id], syncedAt, syncError,
// sec }. sec : le compte du relais de boosters depuis la dernière SEC ({ since, known }), sur plus que les ouvertures
// gardées.
async function pityState() {
  const id = await myId();
  const { pity = {}, pityRules } = await chrome.storage.local.get(['pity', 'pityRules']);
  const mine = { events: [], unsynced: [], syncedAt: 0, syncError: null, ...pity[id] };
  return { id, all: pity, mine, rules: { ...PITY, ...pityRules } };
}

async function savePity({ id, all, mine }) {
  await chrome.storage.local.set({ pity: { ...all, [id]: mine } });
}

// Chance d'une SEC dans un booster de tous les jours (4 cartes libres et une 5e d'au moins R), d'après les chances du
// jeu ; null si inconnue.
function secChance() {
  return cached('sec-chance', 30 * 60e3, async () => {
    const rarities = await game('/rarities').then((r) => r.rarities ?? []);
    if (!rarities.some((r) => r.code === 'SEC' && r.weight > 0)) return null;
    const miss = slotOdds(rarities, new Set(rarities.map((r) => r.code)), RANK.R).reduce((p, slot) => p * (1 - (slot.SEC ?? 0)), 1);
    return 1 - miss;
  }).catch(() => null);
}

// Chance que la meilleure carte d'un booster de tous les jours soit une SSR, une UR ou une SEC, d'après les chances du
// jeu, sans les garanties ({ SSR, UR, SEC }) ; null si inconnue.
function rarityChances() {
  return cached('rarity-chances', 30 * 60e3, async () => {
    const rarities = await game('/rarities').then((r) => r.rarities ?? []);
    if (!rarities.length) return null;
    const slots = slotOdds(rarities, new Set(rarities.map((r) => r.code)), RANK.R);
    // (une carte de ce rang ou mieux dans le booster)
    const atLeast = (rank) => 1 - slots.reduce((miss, slot) => miss * (1 - Object.entries(slot).reduce((p, [c, v]) => p + ((RANK[c] ?? 0) >= rank ? v : 0), 0)), 1);
    const out = {};
    for (const code of ['SSR', 'UR', 'SEC']) out[code] = atLeast(RANK[code]) - atLeast(RANK[code] + 1);
    return out;
  }).catch(() => null);
}

// La SEC, que le jeu ne garantit pas : les boosters depuis la dernière (le compte du relais quand il en a un, car il
// remonte plus loin), et la chance d'en avoir une par booster (chance).
function secReport(mine, chance) {
  const { events } = mine;
  let last = -1;
  for (let i = events.length - 1; i >= 0; i--)
    if (events[i].top >= RANK.SEC) {
      last = i;
      break;
    }
  const local = { since: last >= 0 ? events.length - 1 - last : events.length, known: last >= 0 };
  // (une SEC tirée sans Aquaman, vue dans les « beaux tirages » : le compte repart d'elle)
  const pulled = sinceLast(events, RANK.SEC, mine.pulls?.SEC);
  if (pulled.missed) return { since: pulled.since, known: true, chance };
  const sec = mine.sec && mine.sec.since >= local.since ? mine.sec : local;
  return { since: sec.since, known: !!sec.known, chance };
}

// Ce qui reste avant chaque garantie ; « known » dès qu'une carte de cette rareté a été vue, sinon une borne haute.
// Chaque compteur ne repart qu'avec une carte de sa propre rareté : une UR ne remet pas celui des SSR à zéro
// (l'historique montre des SSR arrivant 60 boosters après la SSR précédente, une UR entre les deux).
// Une carte de cette rareté tirée sans qu'Aquaman voie son booster (sur un autre appareil sans Aquaman, une ouverture
// manquée…) mais vue dans les « beaux tirages » du jeu (pulls : le dernier tirage de chaque rareté, d'après le relais)
// : le compte repart d'elle. Plus de 10 minutes après la dernière qu'Aquaman a vue, pour ne pas reprendre la même
// (l'heure du jeu et celle de l'appareil diffèrent un peu).
const PULL_SLACK = 10 * 60e3;
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

// Les boosters que la garantie SSR et UR du jeu compte : les classiques (gratuits ou achetés à la boutique) et les packs
// à thème de la boutique (Action, Magie…, 250 Perles). Les packs spéciaux (Légendaire à 1 200 Perles, Halloween et
// les autres packs d'événement) ne la font ni avancer ni repartir. Une ouverture dont la sorte est inconnue (gardée
// avant 1.6.1, sauf les SSR, UR et SEC) est comptée.
const THEME_PRICE = 250;
const SPECIAL_NAME = /halloween|l[ée]gendaire|prestige|no[eë]l|saison|[ée]v[ée]nement/i;
function pityPacks() {
  return cached('pity-packs', 30 * 60e3, async () => {
    const shop = await game('/shop');
    const specials = Array.isArray(shop?.specials) ? shop.specials : [];
    const base = Number(shop?.boosterPrice) || 150;
    return Object.fromEntries(specials.filter((s) => typeof s?.id === 'string').map((s) => [s.id, Number(s.price) > 0 && Number(s.price) <= Math.max(THEME_PRICE, base)]));
  }).catch(() => null);
}
function pityCounts(packs) {
  return (e) => {
    const id = e?.pack?.id;
    if (!id || id === 'classic') return true;
    if (packs && id in packs) return packs[id];
    // (un pack que la boutique ne vend plus : un pack d'événement ; sans la boutique, d'après son nom)
    return packs ? false : !SPECIAL_NAME.test(e.pack.name ?? '');
  };
}

function pityReport(mine, rules, sync, chance = null, packs = null) {
  const { events } = mine;
  const out = { opened: events.length, sync: sync ? (mine.syncError ? 'error' : mine.syncedAt ? 'ok' : 'waiting') : 'off', syncedAt: mine.syncedAt || null };
  const counted = events.filter(pityCounts(packs));
  out.skipped = events.length - counted.length;
  for (const code of Object.keys(PITY)) {
    const { since, known, missed } = sinceLast(counted, RANK[code], mine.pulls?.[code]);
    // (au-delà de la garantie : le jeu a forcément donné une carte de cette rareté, qu'Aquaman n'a pas vue)
    out[code] = { since, known, missed, over: since >= rules[code], every: rules[code], left: Math.max(1, rules[code] - since) };
  }
  out.SEC = secReport(mine, chance);
  return out;
}

// La sorte de booster d'une ouverture ({ id, name }), vérifiée ; null quand elle est inconnue.
function cleanPack(p) {
  const id = typeof p?.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(p.id) ? p.id : null;
  return id ? { id, name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 60) : null } : null;
}

// Réunit deux listes d'ouvertures : chaque booster une fois, le plus ancien d'abord, les PITY_EVENTS derniers.
function mergeEvents(a, b) {
  const byId = new Map();
  for (const e of [...a, ...b]) {
    if (!e?.id) continue;
    const known = byId.get(e.id);
    if (!known) byId.set(e.id, { id: String(e.id), at: Number(e.at) || 0, top: Number(e.top) || 0, ...(e.card ? { card: e.card } : {}), ...(e.pack ? { pack: e.pack } : {}) });
    else if (!known.pack && e.pack) known.pack = e.pack; // (la sorte vue par l'autre appareil)
  }
  return [...byId.values()].sort((x, y) => x.at - y.at).slice(-PITY_EVENTS);
}

// Envoie au relais les nouvelles ouvertures de cet appareil et prend celles des autres appareils.
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
    const { events, sec, pulls } = await res.json();
    mine.events = mergeEvents(mine.events, Array.isArray(events) ? events : []);
    mine.sec = Number.isFinite(sec?.since) ? { since: sec.since, known: !!sec.known } : null;
    // (un relais plus ancien ne les donne pas : les dernières connues sont gardées)
    if (pulls && typeof pulls === 'object') mine.pulls = Object.fromEntries(['SSR', 'UR', 'SEC'].filter((k) => Number.isFinite(pulls[k])).map((k) => [k, pulls[k]]));
    mine.unsynced = mine.unsynced.filter((id) => !waiting.has(id));
    mine.syncedAt = Date.now();
    mine.syncError = null;
  } catch (e) {
    mine.syncError = e?.message || 'relay';
  }
  await savePity(state);
}

// Compteurs anti-malchance, avec les ouvertures des autres appareils quand la synchronisation est active (fresh :
// demande au relais même s'il vient d'être interrogé).
export async function pity(fresh = false) {
  const state = await pityState();
  const on = (await getSettings()).syncPity;
  if (on) await exchangePity(state, fresh);
  return pityReport(state.mine, state.rules, on, await secChance(), await pityPacks());
}

// L'historique du joueur : pour les SSR, UR et SEC, chacune obtenue avec les boosters ouverts pour elle depuis la
// précédente de cette rareté, sur toutes les ouvertures que garde le relais (un an) et celles de cet appareil. first :
// le compte a commencé avec Aquaman, le vrai peut être plus haut. current : boosters ouverts depuis la dernière.
export async function pityHistory() {
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
  // La carte de chaque SSR, UR et SEC : celle gardée à son ouverture, sinon le tirage du joueur de cette rareté dans
  // les « beaux tirages » du jeu (relais) dans les 10 minutes, chaque tirage donné une seule fois.
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
  // (le suivi : la meilleure rareté des 300 derniers boosters, le plus ancien d'abord, et les chances du jeu)
  const out = { opened: events.length, since: events[0]?.at ?? null, recent: events.slice(-300).map((e) => e.top), chances: await rarityChances() };
  // (chaque rareté à part : une UR n'est pas comptée parmi les SSR. Pour les SSR et UR, comme la garantie du jeu, les
  // packs spéciaux ne comptent pas : leurs cartes sont montrées, sans faire repartir le compte.)
  const counts = pityCounts(await pityPacks());
  for (const code of ['SSR', 'UR', 'SEC']) {
    const hits = [];
    let count = 0;
    for (const e of events) {
      const counted = code === 'SEC' || counts(e);
      if (counted) count++;
      if (e.top !== RANK[code]) continue;
      hits.push({ at: e.at, top: codeOf(e.top) ?? code, card: e.card ?? null, pack: e.pack ?? null, after: counted ? count : 0, first: !hits.length, special: !counted });
      if (counted) count = 0;
    }
    out[code] = { hits: hits.reverse(), current: count };
  }
  return out;
}

// Le pack des SSR, UR et SEC ouvertes avant qu'Aquaman ne le garde (1.4.7), d'après leur carte : une carte d'Halloween
// ne peut venir que du pack Halloween, toute autre est prise comme venant du Classique (guessed: true). Laissé inconnu
// sans la carte ou sans le catalogue du jeu.
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

// Enregistre des boosters ouverts, chacun sous la forme des raretés de ses cartes ; chaque ouverture reçoit son propre
// id, envoyé une fois au relais. best : la meilleure carte de chaque booster, et packs : sa sorte ({ id, name }),
// gardées avec les SSR, UR et SEC pour l'historique. ids : l'id du jeu de chaque booster, quand il est connu :
// l'ouverture est gardée sous lui (« g:<id> »), pour qu'un booster signalé deux fois (la même réponse lue deux fois) ne
// compte qu'une fois ; sinon un id au hasard.
export async function recordOpening(boosters, best = [], packs = [], ids = []) {
  const state = await pityState();
  const { mine, rules } = state;
  const now = Date.now();
  const known = new Set(mine.events.map((e) => e.id));
  const added = boosters
    .map((rarities, i) => {
      const top = Math.max(0, ...rarities.map((r) => RANK[r] ?? 0));
      const c = best[i];
      const card = top >= RANK.SSR && c?.id ? { id: String(c.id), name: c.name ?? null, image: c.image ?? null, rarity: c.rarity } : null;
      const pack = cleanPack(packs[i]); // (pour chaque booster : les packs spéciaux ne comptent pas pour la garantie)
      const gameId = typeof ids[i] === 'string' && /^[A-Za-z0-9_.:-]{1,60}$/.test(ids[i]) ? `g:${ids[i]}` : null;
      return { id: gameId ?? `${(now + i).toString(36)}-${Math.random().toString(36).slice(2, 10)}`, at: now + i, top, ...(card ? { card } : {}), ...(pack ? { pack } : {}) };
    })
    .filter((e, i, all) => !known.has(e.id) && all.findIndex((x) => x.id === e.id) === i);
  if (!added.length) return pityReport(mine, rules, (await getSettings()).syncPity, await secChance(), await pityPacks());
  mine.events = mergeEvents(mine.events, added);
  // Le compte de SEC du relais continue avec les nouvelles ouvertures jusqu'au prochain échange.
  if (mine.sec) mine.sec = added.some((e) => e.top >= RANK.SEC) ? null : { ...mine.sec, since: mine.sec.since + added.length };
  mine.unsynced = [...new Set([...mine.unsynced, ...added.map((e) => e.id)])].slice(-PITY_EVENTS);
  const on = (await getSettings()).syncPity;
  if (on) await exchangePity(state, true);
  else await savePity(state);
  return pityReport(mine, rules, on, await secChance(), await pityPacks());
}

// Garde les chiffres du texte de la boutique (« une SSR tous les 60 boosters et une UR tous les 190 »).
export async function setPityRules(rules) {
  const clean = Object.fromEntries(
    Object.keys(PITY)
      .filter((k) => Number(rules?.[k]) > 0)
      .map((k) => [k, Number(rules[k])])
  );
  if (Object.keys(clean).length) await chrome.storage.local.set({ pityRules: clean });
  return { ok: true };
}
