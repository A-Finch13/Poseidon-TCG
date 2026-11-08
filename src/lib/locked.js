// Aquaman : séries gardées verrouillées, leurs cartes à un seul exemplaire sont verrouillées.

import { myId } from './api.js';

// ---------- séries gardées verrouillées : leurs cartes à un seul exemplaire sont verrouillées (protégées) ----------
// Sous le compte du joueur, sur cet appareil : { seriesId: [ids des cartes] }. Le verrouillage lui-même se fait depuis
// la page (le jeu n'accepte de changements que de ses propres pages) ; les cartes d'une série sont gardées pour la
// surveiller sans la relire.

export async function guardedSeries() {
  const me = await myId();
  const { guardedSeries: all = {} } = await chrome.storage.local.get('guardedSeries');
  return all[me] ?? {};
}

export async function setGuarded(id, cardIds, on) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(id))) throw new Error('bad_series');
  const me = await myId();
  const { guardedSeries: all = {} } = await chrome.storage.local.get('guardedSeries');
  const mine = { ...(all[me] ?? {}) };
  if (on) mine[id] = (Array.isArray(cardIds) ? cardIds : []).filter((c) => typeof c === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(c)).slice(0, 2000);
  else delete mine[id];
  await chrome.storage.local.set({ guardedSeries: { ...all, [me]: mine } });
  return mine;
}
