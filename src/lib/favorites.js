// Aquaman : séries favorites et cartes recherchées dans le jeu.

import { RELAY } from './common.js';
import { cached, forget, game, myId, validPlayer } from './api.js';
import { countCopies, imageKey, ownership, showcase } from './collections.js';
import { friends } from './leaderboard.js';
import { fold, loadCatalog } from './boosters.js';
import { guardedSeries } from './locked.js';

// ---------- séries favorites et cartes recherchées dans le jeu ----------

// Séries du jeu avec la progression du joueur : [{ id, slug, title, owned, total }].
export function seriesList() {
  return cached('series', 2 * 60e3, async () => (await game('/series')).series ?? []);
}

// Ids des cartes de la liste de recherche du joueur (« Je la cherche »).
async function wantedIds() {
  const { wants } = await cached('wants', 30e3, () => game('/wants'));
  return new Set((wants ?? []).map((w) => w?.card?.id ?? w?.cardId).filter(Boolean));
}

// Les cartes recherchées par le joueur : celles de la liste du jeu, et celles qu'Aquaman garde en attente d'une place
// libre (le jeu en prend 100 au plus).
async function searchedIds() {
  const [wanted, waiting] = await Promise.all([wantedIds().catch(() => new Set()), waitingIds()]);
  for (const id of waiting) wanted.add(id);
  return wanted;
}

// Clés d'image des cartes recherchées par le joueur (les filtres des échanges reconnaissent les cartes à leur image) :
// les images de la liste du jeu, et celles du catalogue pour les cartes en attente dans Aquaman.
export async function searchedImages() {
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

// Les exemplaires d'un autre joueur par clé d'image ({ found, private, byImage }), pour le filtre « Il lui manque » des
// échanges : par son id, sinon par son nom parmi les amis, puis parmi les joueurs vus par le relais.
export async function playerOwnership({ id, name } = {}) {
  if (!validPlayer(id)) id = typeof name === 'string' && name ? await playerIdByName(name) : null;
  // (le partenaire d'un échange n'est jamais le joueur connecté : sa propre collection n'est pas prise pour celle du
  // partenaire)
  if (!validPlayer(id) || id === (await myId())) return { found: false };
  const sc = await showcase(id);
  // (la collection lue doit être celle du partenaire nommé dans la fenêtre)
  if (typeof name === 'string' && name && sc?.player?.name && fold(sc.player.name) !== fold(name)) return { found: false };
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

// Les cartes en attente dans Aquaman.
async function waitingIds() {
  return new Set((await chrome.storage.local.get('wantWaiting')).wantWaiting ?? []);
}

// Places de la liste de recherche du jeu : combien sont prises, les cartes qu'Aquaman y a mises et que le joueur
// possède maintenant (à retirer), celles encore recherchées, et les cartes en attente encore à envoyer (ni possédées ni
// déjà recherchées).
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

// Cartes d'une série, avec le nombre d'exemplaires que le joueur possède.
export function seriesCards(id) {
  return cached(`series-cards:${id}`, 60e3, async () => (await game(`/cards?manga=${encodeURIComponent(id)}`)).cards ?? []);
}

export async function seriesStatus(id) {
  const [cards, wanted, guarded] = await Promise.all([seriesCards(id), searchedIds(), guardedSeries()]);
  const missing = cards.filter((c) => !(c.owned > 0));
  const toWantIds = missing.filter((c) => !wanted.has(c.id)).map((c) => c.id);
  return {
    missing: missing.length,
    toWant: toWantIds.length,
    toWantIds,
    cardIds: cards.map((c) => c.id).filter(Boolean),
    guarded: Object.hasOwn(guarded, id)
  };
}

// Les dessins de chaque sorte de booster publiés par l'auteur (le relais les garde une minute dans les navigateurs).
export async function globalPacks() {
  try {
    const res = await fetch(`${RELAY}/packs`);
    if (!res.ok) throw new Error(`relay_${res.status}`);
    return (await res.json())?.packs ?? null;
  } catch {
    return null;
  }
}

// Les sortes de boosters que vend la boutique ({ kind, name, art, types }), pour le relevé de l'auteur.
export async function packKinds() {
  const shop = await cached('shop', 60e3, () => game('/shop'));
  return (shop?.specials ?? []).map((s) => {
    const types = Array.isArray(s.types) ? s.types : [];
    return { kind: s.id, name: s.name ?? null, art: s.art ?? s.kindArt ?? s.image ?? (types[0] ? `/game/boosters/${types[0]}.webp` : null), types };
  });
}
