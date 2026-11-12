// Aquaman : les joueurs du classement des amis déjà lus, et les amis.

import { cached, myId, social, validPlayer } from './api.js';

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
