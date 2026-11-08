// Aquaman : les collections des joueurs et leurs résumés.

import { ORIGIN } from './common.js';
import { account, ApiError, cached, forget, game, myId, validPlayer } from './api.js';
import { keepOnBoard } from './leaderboard.js';

// ---------- collections ----------

export const showcases = new Map(); // id du joueur -> dernière collection lue

// Le joueur dont parle une réponse du jeu, quand elle le dit.
const ownerOf = (sc) => [sc?.player?.id, sc?.playerId, sc?.user?.id, sc?.userId].find((x) => typeof x === 'string' && x) ?? null;

// Collection d'un joueur : { player, private, cards, copies, albums, owned, total }. Le jeu la lit avec la session du
// joueur : une réponse sur un autre joueur que celui demandé (une redirection, la collection du joueur connecté donnée
// à la place…) est refusée, pour qu'une collection ne soit jamais prise pour une autre.
export async function readShowcase(id) {
  if (!validPlayer(id)) throw new ApiError(400, 'bad_player', 'Joueur inconnu.');
  const path = encodeURIComponent(id);
  let sc;
  try {
    sc = await game(`/players/${path}/showcase`);
  } catch {
    sc = await game(`/public/players/${path}/showcase`);
  }
  if (!sc || typeof sc !== 'object' || Array.isArray(sc)) throw new ApiError(502, 'bad_showcase', 'Collection illisible.');
  const owner = ownerOf(sc);
  if (owner && owner !== id) throw new ApiError(409, 'wrong_player', 'Le jeu a répondu pour un autre joueur.');
  return sc;
}

// La même, gardée un moment ; ses exemplaires donnent la valeur des cartes.
export function showcase(id, ttl = 5 * 60e3) {
  return cached(`showcase:${id}`, ttl, async () => {
    const sc = await readShowcase(id);
    showcases.set(id, sc);
    return sc;
  });
}

// La collection du joueur connecté : lue pour l'id de la session, et revérifiée avec lui une fois lue (le compte a pu
// changer entre-temps).
export async function myShowcase(ttl = 60e3) {
  const id = await myId();
  const sc = await showcase(id, ttl);
  if ((await myId()) !== id) throw new ApiError(409, 'account_changed', 'Le compte connecté a changé : recharge la page.');
  return sc;
}

// Nom de fichier de l'image d'une carte : la même clé que l'adresse de l'image affichée par le site.
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

// Exemplaires possédés, par id de carte et par clé d'image.
export function countCopies(sc) {
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

// Exemplaires possédés par le joueur connecté (me : à qui ils sont).
export async function ownership() {
  const sc = await myShowcase();
  return { me: account, ...countCopies(sc) };
}

// Cartes différentes d'un joueur, par rareté ({ N: 812, R: …}) : le score du classement du jeu en vient (chaque carte
// différente rapporte les points de sa rareté, les doublons ne comptent pas).
function distinctByRarity(sc) {
  const seen = new Set();
  const by = {};
  for (const copy of sc?.copies ?? []) {
    const card = copy?.card;
    if (!card?.id || !card.rarity || seen.has(card.id)) continue;
    seen.add(card.id);
    by[card.rarity] = (by[card.rarity] ?? 0) + 1;
  }
  return by;
}

// La plus belle carte d'un joueur, pour le podium du classement des amis : la plus rare, à rareté égale la moins
// tirée (maxCopies, puis minted). { id, name, image, rarity } ou null.
const RARITY_RANK = { N: 1, R: 2, SR: 3, SSR: 4, UR: 5, SEC: 6 };
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
      if (d > 0 || (d === 0 && (a1 < b1 || (a1 === b1 && a2 < b2)))) best = c;
    }
  }
  return best ? { id: best.id, name: best.name ?? null, image: best.image, rarity: best.rarity } : null;
}

// Cartes uniques, total, séries complètes et cartes différentes par rareté d'un joueur.
// (fresh : relu depuis le jeu, pas depuis les réponses gardées un moment)
export async function playerSummary(id, fresh = false) {
  if (!validPlayer(id)) throw new ApiError(400, 'bad_player', 'Joueur inconnu.');
  if (fresh) forget(`showcase:${id}`);
  const sc = await showcase(id);
  const summary = sc.private
    ? { id, name: sc.player?.name ?? null, private: true }
    : { id, name: sc.player?.name ?? null, private: false, owned: sc.owned ?? 0, total: sc.total ?? 0, albums: sc.albums?.length ?? 0, byRarity: distinctByRarity(sc), best: bestCard(sc) };
  await keepOnBoard(summary);
  return { ...summary, at: Date.now() };
}
