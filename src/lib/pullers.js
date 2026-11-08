// Aquaman : les cartes rares des joueurs vus dans les « beaux tirages ».

import { RELAY } from './common.js';
import { getSettings } from './settings.js';
import { readShowcase } from './collections.js';
import { fold } from './boosters.js';
import { pollFeed, recordFeed, relayPulls } from './feed.js';

// ---------- les cartes rares des joueurs vus dans les « beaux tirages » ----------

const RARE = ['SSR', 'UR', 'SEC'];
const SCAN_AGAIN = 12 * 3600e3; // la collection d'un joueur est relue après 12 heures (le relais dit la même chose)
const SCAN_MAX = 6; // collections lues à chaque passage sur le fil
let scanning = false;

// Les joueurs qui viennent de tirer une SSR, une UR ou une SEC : leur collection est lue (publiques seulement) et leurs
// cartes SSR, UR et SEC partent au relais, qui garde qui a quelle carte pour « Qui a cette carte ? » (réglage «
// sharePulls »).
export async function scanPullers(pulls) {
  if (scanning) return;
  const ids = [...new Set((pulls ?? []).filter((p) => RARE.includes(p?.card?.rarity) && p.player?.id).map((p) => p.player.id))];
  if (!ids.length || !(await getSettings()).sharePulls) return;
  scanning = true;
  try {
    const { scannedAt = {} } = await chrome.storage.local.get('scannedAt');
    const now = Date.now();
    for (const id in scannedAt) if (now - scannedAt[id] > SCAN_AGAIN) delete scannedAt[id];
    const todo = ids.filter((id) => !scannedAt[id]).slice(0, 40);
    if (!todo.length) return;
    // Le relais dit lesquels personne n'a lus récemment (un autre Aquaman vient peut-être de le faire).
    const res = await fetch(`${RELAY}/holdings/stale?players=${todo.map(encodeURIComponent).join(',')}`);
    if (!res.ok) return;
    const { stale = [] } = await res.json();
    const read = stale.slice(0, SCAN_MAX);
    for (const id of todo) if (!stale.includes(id) || read.includes(id)) scannedAt[id] = now;
    await chrome.storage.local.set({ scannedAt });
    for (const id of read) {
      try {
        const sc = await readShowcase(id);
        const cards = new Map();
        for (const copy of sc.private ? [] : sc?.copies ?? []) {
          if (!RARE.includes(copy?.card?.rarity) || !copy.card.id) continue;
          const c = cards.get(copy.card.id) ?? { id: copy.card.id, count: 0, serials: [] };
          c.count++;
          if (Number.isInteger(copy.serial)) c.serials.push(copy.serial);
          cards.set(c.id, c);
        }
        await fetch(`${RELAY}/holdings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ player: { id, name: sc.player?.name ?? null }, private: !!sc.private, cards: [...cards.values()] })
        });
      } catch {}
    }
  } catch {
  } finally {
    scanning = false;
  }
}

// Les joueurs dont le relais sait qu'ils ont une carte ({ owners, scanned }), ou null quand il ne répond pas.
export async function relayHoldings(card) {
  try {
    const res = await fetch(`${RELAY}/holdings?card=${encodeURIComponent(card)}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Tirages récents dont le personnage ou la série correspond à la recherche (les derniers sans recherche), ici et sur le
// relais.
export async function whoPulled(query = '', rarity = '') {
  const q = fold(query);
  const [, remote] = await Promise.all([pollFeed().catch(() => {}), relayPulls(q.length >= 2 ? { q, limit: 200 } : { limit: 100 })]);
  if (remote?.pulls) await recordFeed(remote.pulls, true);
  const { feedLog = [], feedSince = null } = await chrome.storage.local.get(['feedLog', 'feedSince']);
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
