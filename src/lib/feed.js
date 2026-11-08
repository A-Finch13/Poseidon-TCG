// Aquaman : les « beaux tirages » du jeu, gardés ici et partagés sur le relais.

import { RELAY } from './common.js';
import { getSettings } from './settings.js';
import { cached, game } from './api.js';
import { scanPullers } from './pullers.js';

// ---------- les « beaux tirages » du jeu : gardés ici, et partagés dans un historique public sur le relais ----------

const FEED_KEEP = 30 * 86400e3;
const FEED_MAX = 4000;
// Les tirages vus sont lus toutes les minutes et envoyés au relais toutes les 5 minutes : l'historique public a au plus
// 6 minutes de retard sur le jeu tant qu'un Aquaman tourne.
const SHARE_EVERY = 5 * 60e3;

// Un tirage gardé ici, sous la forme du fil du jeu (ce que le relais prend et rend).
const asFeedPull = (p) => ({ card: { id: p.card.id, name: p.card.name, rarity: p.card.rarity, image: p.card.image, series: p.card.series }, serial: p.serial, player: p.player, pulledAt: new Date(p.at).toISOString() });

// Ajoute des tirages du fil du jeu à l'historique gardé sur cet appareil (fromRelay : déjà dans l'historique public).
export async function recordFeed(pulls, fromRelay = false) {
  const { feedLog = [], feedSince } = await chrome.storage.local.get(['feedLog', 'feedSince']);
  const byKey = new Map(feedLog.map((p) => [p.key, p]));
  for (const p of pulls ?? []) {
    const card = p?.card;
    if (!card?.id || !p.pulledAt) continue;
    const key = `${card.id}#${p.serial ?? ''}#${p.player?.id ?? ''}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      key,
      at: Date.parse(p.pulledAt) || Date.now(),
      serial: p.serial ?? null,
      player: p.player ? { id: p.player.id ?? null, name: p.player.name ?? null } : null,
      card: { id: card.id, name: card.name, image: card.image, rarity: card.rarity, maxCopies: card.maxCopies ?? null, series: card.series?.title ?? card.series ?? null },
      shared: fromRelay
    });
  }
  const since = Date.now() - FEED_KEEP;
  const kept = [...byKey.values()].filter((p) => p.at >= since).sort((a, b) => b.at - a.at).slice(0, FEED_MAX);
  await chrome.storage.local.set({ feedLog: kept, feedSince: feedSince ?? Date.now() });
  return kept.length;
}

// Envoie les tirages pas encore partagés à l'historique public (toutes les 5 minutes au plus, réglage « sharePulls »).
async function sharePulls(force = false) {
  const { feedSharedAt = 0 } = await chrome.storage.local.get('feedSharedAt');
  if (!force && Date.now() - feedSharedAt < SHARE_EVERY) return;
  if (!(await getSettings()).sharePulls) return;
  await chrome.storage.local.set({ feedSharedAt: Date.now() });
  // Tout ce qui attend part maintenant, 100 tirages par requête.
  for (let round = 0; round < 10; round++) {
    const { feedLog = [] } = await chrome.storage.local.get('feedLog');
    const todo = feedLog.filter((p) => !p.shared && ['SSR', 'UR', 'SEC'].includes(p.card.rarity)).slice(0, 100);
    if (!todo.length) return;
    try {
      const res = await fetch(`${RELAY}/pulls`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pulls: todo.map(asFeedPull) }) });
      if (!res.ok) return;
    } catch {
      return;
    }
    const sent = new Set(todo.map((p) => p.key));
    const { feedLog: now = [] } = await chrome.storage.local.get('feedLog');
    await chrome.storage.local.set({ feedLog: now.map((p) => (sent.has(p.key) ? { ...p, shared: true } : p)) });
  }
}

// Lit le fil du jeu (une fois par minute au plus), garde ses tirages et les partage.
export async function pollFeed() {
  const { pulls } = await cached('feed', 50e3, () => game('/feed'));
  const kept = await recordFeed(pulls);
  await sharePulls();
  scanPullers(pulls);
  return kept;
}

// L'historique public du relais ({ pulls, since, total }), ou null quand il ne répond pas.
export async function relayPulls(params) {
  try {
    const res = await fetch(`${RELAY}/pulls?${new URLSearchParams(params)}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
