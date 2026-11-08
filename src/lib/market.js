// Aquaman : les listes du marché, partagées entre les appareils du joueur.

import { RELAY } from './common.js';
import { getSettings } from './settings.js';
import { myId } from './api.js';

// ---------- les listes du marché, partagées entre les appareils du joueur ----------
// marketBought : les cartes achetées sur le marché, leurs autres ventes cachées : réunies depuis chaque appareil.
// sellWaiting : les exemplaires en attente d'une place sur le marché : la liste la plus récente de tous les appareils
// l'emporte (le code de la page date sellWaitingAt à chaque changement), comme les cartes en attente de la liste de
// recherche.
// *For : le compte auquel appartient chaque liste (un appareil jamais synchronisé ajoute la sienne à celles du relais).

const MARKET_PULL = 60e3; // les listes des autres appareils sont lues une fois par minute au plus
let marketSyncedAt = 0;

export async function postList(body) {
  const res = await fetch(`${RELAY}/lists`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`relay_${res.status}`);
  return res.json();
}

export async function syncMarket(fresh = false) {
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

// Les cartes achetées sur n'importe quel appareil : les listes sont réunies, et le relais garde le tout.
async function syncBought(player) {
  const { marketBought = [], marketBoughtFor } = await chrome.storage.local.get(['marketBought', 'marketBoughtFor']);
  const mine = marketBoughtFor === undefined || marketBoughtFor === player; // (la liste d'un autre compte reste à part)
  const remote = await postList({ player, name: 'bought' });
  const theirs = Array.isArray(remote?.data) ? remote.data : [];
  const all = [...new Set([...theirs, ...(mine ? marketBought : [])])];
  if (all.length !== theirs.length) await postList({ player, name: 'bought', data: all, at: Math.max(Date.now(), (Number(remote?.at) || 0) + 1) });
  // (une carte achetée ici entre-temps reste : elle rejoint celles du relais à la prochaine synchronisation)
  const now = (await chrome.storage.local.get('marketBought')).marketBought ?? [];
  const kept = [...new Set([...all, ...(mine ? now : [])])];
  const changed = kept.length !== now.length || !mine;
  if (changed || marketBoughtFor !== player) await chrome.storage.local.set({ marketBought: kept, marketBoughtFor: player });
  return changed;
}

// Les exemplaires en attente d'une place sur le marché : la liste la plus récente l'emporte.
async function syncSales(player) {
  const { sellWaiting = [], sellWaitingAt = 0, sellWaitingFor } = await chrome.storage.local.get(['sellWaiting', 'sellWaitingAt', 'sellWaitingFor']);
  const mine = sellWaitingFor === player;
  const at = mine ? Number(sellWaitingAt) || 0 : 0;
  let remote = await postList({ player, name: 'sales', data: mine ? sellWaiting : [], at });
  const theirs = Array.isArray(remote?.data) ? remote : { data: [], at: 0 };
  if (!mine && sellWaitingFor === undefined && sellWaiting.length) {
    // Première synchronisation de cet appareil : ses exemplaires rejoignent ceux des autres appareils.
    const join = [...theirs.data, ...sellWaiting.filter((x) => !theirs.data.some((y) => y.copyId === x.copyId))].slice(0, 50);
    remote = await postList({ player, name: 'sales', data: join, at: Math.max(Date.now(), (Number(theirs.at) || 0) + 1) });
  } else if (Number(theirs.at) <= at) {
    if (!mine) await chrome.storage.local.set({ sellWaitingFor: player });
    return false;
  } else remote = theirs;
  // Un changement fait ici entre-temps l'emporte : il part au relais à la prochaine synchronisation.
  if (((await chrome.storage.local.get('sellWaitingAt')).sellWaitingAt ?? 0) !== sellWaitingAt) return false;
  await chrome.storage.local.set({ sellWaiting: remote.data ?? [], sellWaitingAt: Number(remote.at) || Date.now(), sellWaitingFor: player });
  return true;
}
