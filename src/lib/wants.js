// Aquaman : les cartes en attente dans Aquaman, partagées entre les appareils du joueur.

import { RELAY } from './common.js';
import { getSettings } from './settings.js';
import { myId } from './api.js';

// ---------- les cartes en attente dans Aquaman, partagées entre les appareils du joueur ----------

const WANTS_PULL = 60e3; // la liste des autres appareils est lue une fois par minute au plus
let wantsSyncedAt = 0;

// Le relais garde les listes les plus récentes de tous les appareils du joueur : il prend celles-ci si elles sont plus
// récentes (at : moment de leur dernier changement), et renvoie celles qu'il garde.
async function postWants(body) {
  const res = await fetch(`${RELAY}/wants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`relay_${res.status}`);
  return res.json();
}

// Les cartes en attente d'une place dans la liste du jeu, et celles qu'Aquaman y a mises, les mêmes sur chaque appareil
// : envoyées au relais, et reprises quand un autre appareil les a changées plus tard. Le code de la page date wantsAt à
// chaque changement ; wantsFor : le compte auquel elles appartiennent (un appareil jamais synchronisé ajoute ses cartes
// à celles du relais).
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
      // Première synchronisation de cet appareil : ses cartes rejoignent celles des autres appareils.
      const join = (x, y) => [...new Set([...x, ...y])];
      remote = await postWants({ player, waiting: join(theirs.waiting, wantWaiting).slice(0, 200), sent: join(theirs.sent ?? [], wantSent), at: Date.now() });
    } else if (Number(theirs.at) <= at) {
      if (!mine) await chrome.storage.local.set({ wantsFor: player });
      return { changed: false };
    } else remote = theirs;
    // Un changement fait ici entre-temps l'emporte : il part au relais à la prochaine synchronisation.
    if (((await chrome.storage.local.get('wantsAt')).wantsAt ?? 0) !== wantsAt) return { changed: false };
    await chrome.storage.local.set({ wantWaiting: remote.waiting ?? [], wantSent: remote.sent ?? [], wantsAt: Number(remote.at) || Date.now(), wantsFor: player });
    return { changed: true };
  } catch (e) {
    wantsSyncedAt = 0;
    return { error: e?.message || 'relay' };
  }
}
