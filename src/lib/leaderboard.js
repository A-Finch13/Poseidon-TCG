// Aquaman : les joueurs du classement des amis déjà lus, et les amis.

import { cached, myId, social, validPlayer } from './api.js';
import { imageKey, myShowcase } from './collections.js';

// ---------- les joueurs du classement déjà lus ----------
// Le résumé de chaque joueur lu pour le classement, gardé sur cet appareil sous le compte connecté : le classement les
// montre tout de suite, à leur place connue, et ne relit que ceux plus vieux que BOARD_FRESH (ou tous sur « Actualiser
// »), au lieu de télécharger chaque collection à chaque ouverture.

export const BOARD_FRESH = 3600e3; // un joueur lu il y a moins d'une heure n'est pas relu
const BOARD_KEEP = 14 * 86400e3; // un joueur pas lu depuis aussi longtemps est oublié
let boardWrites = Promise.resolve(); // (une écriture à la fois : les collections sont lues 4 par 4)

export function keepOnBoard(summary) {
  const write = boardWrites.then(async () => {
    const me = await myId();
    const { board = {} } = await chrome.storage.local.get('board');
    const now = Date.now();
    const mine = { ...(board[me] ?? {}), [summary.id]: { ...summary, at: now } };
    for (const id in mine) if (!(now - mine[id].at < BOARD_KEEP)) delete mine[id];
    await chrome.storage.local.set({ board: { ...board, [me]: mine } });
  });
  boardWrites = write.catch(() => {});
  return boardWrites;
}

// Les résumés gardés pour le compte connecté : { [id]: { id, name, private, owned, total, albums, at } }.
export async function boardKnown() {
  const me = await myId();
  const { board = {} } = await chrome.storage.local.get('board');
  return { me, fresh: BOARD_FRESH, players: board[me] ?? {} };
}

// Les séries dont le joueur connecté a réclamé l'album (leur badge) : par id et par slug.
export async function claimedAlbums(fresh = false) {
  const sc = await myShowcase(fresh ? 0 : 60e3);
  const series = (sc.albums ?? []).map((a) => a?.series).filter(Boolean);
  // (la bande des séries montre chacune par sa couverture, /api/covers/<slug>.webp : son slug, et le nom propre de sa
  // couverture)
  const covers = series.map((s) => imageKey(s.cover)?.replace(/\.[a-z0-9]+$/i, '')).filter(Boolean);
  return { ids: series.map((s) => s.id).filter(Boolean), slugs: [...new Set([...series.map((s) => s.slug).filter(Boolean), ...covers])] };
}

// Le joueur connecté et ses amis.
export async function friends() {
  const me = await myId();
  let list = [];
  let friendsError = null;
  try {
    list = (await cached(`friends:${me}`, 5 * 60e3, () => social('/friends'))).friends ?? [];
  } catch (e) {
    friendsError = e.message;
  }
  return {
    me,
    friendsError,
    friends: list.filter((f) => validPlayer(f?.user?.id) && f.user.id !== me).map((f) => ({ id: f.user.id, name: f.user.name ?? null }))
  };
}
