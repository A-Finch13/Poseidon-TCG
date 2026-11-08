// Aquaman : progression de la collection (« Ma progression »), la même sur chaque appareil.

import { getSettings } from './settings.js';
import { myId } from './api.js';
import { myShowcase } from './collections.js';
import { seriesList } from './favorites.js';
import { postList } from './market.js';

// ---------- progression de la collection ----------
// Une lecture par jour de la collection du joueur connecté (la première et la dernière du jour), gardée sur cet
// appareil STATS_DAYS jours sous son id : les cartes gagnées chaque jour sont la différence entre deux jours.

const STATS_DAYS = 120;
export const dayKey = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE'); // « 2026-11-07 », heure locale

// Séries complètes : celles dont chaque carte est possédée, d'après la liste des séries du jeu ; sinon les albums
// réclamés.
const completeSeries = (series, sc) => (Array.isArray(series) && series.length ? series.filter((s) => s.total > 0 && s.owned >= s.total).length : sc?.albums?.length ?? 0);

async function recordDay(id, point) {
  const { collectionDays = {} } = await chrome.storage.local.get('collectionDays');
  const days = { ...(collectionDays[id] ?? {}) };
  const key = dayKey(point.at);
  days[key] = { first: days[key]?.first ?? point, last: point };
  collectionDays[id] = Object.fromEntries(
    Object.keys(days)
      .sort()
      .slice(-STATS_DAYS)
      .map((k) => [k, days[k]])
  );
  await chrome.storage.local.set({ collectionDays });
  return collectionDays[id];
}

// Lit la collection du joueur et garde la lecture du jour. { id, sc, series, point, days }
export async function collectionSnapshot() {
  const id = await myId();
  const [sc, series] = await Promise.all([myShowcase(), seriesList().catch(() => null)]);
  const point = { owned: sc.owned ?? 0, total: sc.total ?? 0, complete: completeSeries(series, sc), at: Date.now() };
  let days = await recordDay(id, point);
  if (await syncProgress(id).catch(() => false)) days = (await chrome.storage.local.get('collectionDays')).collectionDays?.[id] ?? days;
  return { id, sc, series, point, days };
}

// ---------- Ma progression, la même sur chaque appareil ----------
// Les jours de chaque appareil et les comptes de chaque série sont réunis sur le relais (listes « days » et « rarities
// ») : d'un jour, la première lecture la plus tôt et la dernière la plus tard ; d'une série, son compte le plus récent.
// Une fois par PROGRESS_PULL au plus (la fenêtre de Ma progression demande tout de suite).

const PROGRESS_PULL = 10 * 60e3;
let progressSyncedAt = 0;
let progressBusy = null;

const joinDays = (a, b) => {
  const all = { ...a };
  for (const [k, d] of Object.entries(b ?? {})) {
    const o = all[k];
    all[k] = o ? { first: o.first.at <= d.first.at ? o.first : d.first, last: o.last.at >= d.last.at ? o.last : d.last } : d;
  }
  return Object.fromEntries(
    Object.keys(all)
      .sort()
      .slice(-STATS_DAYS)
      .map((k) => [k, all[k]])
  );
};
const joinCounts = (a, b) => {
  const all = { ...a };
  for (const [k, s] of Object.entries(b ?? {})) if (!all[k] || s.at > all[k].at) all[k] = s;
  return all;
};

// Une liste du relais réunie avec celle de cet appareil : true quand celle de cet appareil a changé.
async function syncProgressList(player, name, key, toList, fromList, join) {
  const remote = await postList({ player, name });
  const theirs = fromList(Array.isArray(remote?.data) ? remote.data : []);
  const store = (await chrome.storage.local.get(key))[key] ?? {};
  const mine = store[player] ?? {};
  const all = join(mine, theirs);
  const same = (x) => JSON.stringify(toList(x)) === JSON.stringify(toList(all));
  if (!same(theirs)) await postList({ player, name, data: toList(all), at: Math.max(Date.now(), (Number(remote?.at) || 0) + 1) });
  if (same(mine)) return false;
  // (une lecture faite ici entre-temps reste : réunie à nouveau avec ce qui est gardé maintenant)
  const now = (await chrome.storage.local.get(key))[key] ?? {};
  await chrome.storage.local.set({ [key]: { ...now, [player]: join(now[player] ?? {}, all) } });
  return true;
}

export function syncProgress(player, fresh = false) {
  if (progressBusy) return progressBusy;
  progressBusy = (async () => {
    if (!(await getSettings()).syncProgress || (!fresh && Date.now() - progressSyncedAt < PROGRESS_PULL)) return false;
    progressSyncedAt = Date.now();
    try {
      const days = await syncProgressList(
        player,
        'days',
        'collectionDays',
        (d) => Object.keys(d).sort().map((day) => ({ day, ...d[day] })),
        (list) => Object.fromEntries(list.filter((x) => x?.day && x.first && x.last).map((x) => [x.day, { first: x.first, last: x.last }])),
        joinDays
      );
      const counts = await syncProgressList(
        player,
        'rarities',
        'rarityCache',
        (c) => Object.keys(c).sort().map((id) => ({ id, ...c[id] })),
        (list) => Object.fromEntries(list.filter((x) => x?.id).map(({ id, ...s }) => [id, s])),
        joinCounts
      );
      return days || counts;
    } catch {
      progressSyncedAt = 0;
      return false;
    } finally {
      progressBusy = null;
    }
  })();
  return progressBusy;
}
