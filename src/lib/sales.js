// Aquaman : le récap des ventes du joueur (Perles gagnées par jour, à prix fixe et aux enchères).

import { game, myId } from './api.js';

// Les ventes viennent du jeu :
// - à prix fixe : GET /market/orders → { orders: [{ id, side, price, status, createdAt, closedAt }] }, les ordres de
//   vente (side « sell ») conclus (status « filled »), datés par closedAt ;
// - aux enchères : GET /auctions?mine=selling → { auctions: [{ id, currentBid, status, endsAt }] }, les enchères
//   vendues (status « sold ») au prix de leur dernière offre (currentBid). Le jeu ne garde que celles des 30 derniers
//   jours. Une enchère partie par achat immédiat garde parfois son endsAt prévu, encore à venir : elle est datée du
//   moment où Aquaman la voit vendue.
// Chaque vente est gardée par Aquaman (par joueur), au-delà de ce que le jeu garde : { at, net, kind }. net : les Perles
// touchées, après la commission de 5 % du jeu (prix - Math.floor(5 % du prix), comme le calcule le jeu).
const KEEP_DAYS = 120;
const net = (price) => price - Math.floor(0.05 * price);

async function readLedger(id) {
  const { salesLedger = {} } = await chrome.storage.local.get('salesLedger');
  return { all: salesLedger, mine: { ...salesLedger[id] } };
}

export async function salesRecap() {
  const id = await myId();
  const [orders, auctions] = await Promise.all([game('/market/orders'), game('/auctions?mine=selling')]);
  const { all, mine } = await readLedger(id);
  const now = Date.now();
  for (const o of Array.isArray(orders?.orders) ? orders.orders : []) {
    const price = Number(o?.price);
    if (typeof o?.id !== 'string' || o.side !== 'sell' || o.status !== 'filled' || !(price > 0)) continue;
    const at = Date.parse(o.closedAt);
    mine[`o:${o.id}`] = { at: Number.isFinite(at) ? Math.min(at, now) : (mine[`o:${o.id}`]?.at ?? now), net: net(price), kind: 'fixed' };
  }
  for (const a of Array.isArray(auctions?.auctions) ? auctions.auctions : []) {
    const price = Number(a?.currentBid);
    if (typeof a?.id !== 'string' || a.status !== 'sold' || !(price > 0)) continue;
    const end = Date.parse(a.endsAt);
    const known = mine[`a:${a.id}`]?.at;
    mine[`a:${a.id}`] = { at: Number.isFinite(end) && end <= now ? end : (known ?? now), net: net(price), kind: 'auction' };
  }
  const keepFrom = now - KEEP_DAYS * 864e5;
  for (const [key, s] of Object.entries(mine)) if (!(s?.at >= keepFrom)) delete mine[key];
  await chrome.storage.local.set({ salesLedger: { ...all, [id]: mine } });
  return { sales: Object.values(mine) };
}

// Le relevé en continu, comme Orm : toutes les 5 minutes au plus tant qu'une page du jeu est ouverte (pour tous ses
// onglets), pour qu'aucune vente ne se perde si le jeu ne garde qu'une partie de l'historique de ses ordres.
const SYNC_EVERY = 5 * 60e3;
export async function salesSync() {
  const { salesSyncAt = 0 } = await chrome.storage.local.get('salesSyncAt');
  if (Date.now() - salesSyncAt < SYNC_EVERY) return { skipped: true };
  await chrome.storage.local.set({ salesSyncAt: Date.now() });
  await salesRecap();
  return { ok: true };
}
