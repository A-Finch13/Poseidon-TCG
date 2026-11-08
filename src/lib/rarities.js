// Aquaman : cartes de chaque rareté, comptées série par série, et les statistiques de la collection.

import { RANK } from './common.js';
import { game, myId } from './api.js';
import { collectionSnapshot, dayKey, syncProgress } from './progress.js';
import { seriesList } from './favorites.js';

// ---------- cartes de chaque rareté, comptées série par série ----------
// Le catalogue du jeu ne donne qu'une partie de ses cartes (aucune Commune ni Rare), et une collection 2 000
// exemplaires au plus : les cartes de chaque rareté sont comptées à partir des cartes de chaque série (/cards?manga=,
// avec les exemplaires du joueur de chaque carte). Le compte de chaque série est gardé sur cet appareil sous le compte,
// et relu seulement quand les chiffres du jeu pour cette série ont changé (ses cartes possédées ou son total) ou après
// RARITY_AGAIN ; RARITY_STEP séries au plus par appel, la fenêtre redemande jusqu'à ce que chaque série soit comptée.

const RARITY_STEP = 40;
const RARITY_AGAIN = 24 * 3600e3; // (les exemplaires d'une série peuvent changer sans que ses cartes possédées changent)
let rarityBusy = Promise.resolve();

export function rarityCounts(budget = RARITY_STEP) {
  const run = rarityBusy.then(() => countRarities(budget));
  rarityBusy = run.catch(() => {});
  return run;
}

async function countRarities(budget) {
  const me = await myId();
  const series = (await seriesList()).filter((s) => s?.id);
  const { rarityCache = {} } = await chrome.storage.local.get('rarityCache');
  const mine = { ...(rarityCache[me] ?? {}) };
  const now = Date.now();
  const current = (s) => {
    const k = mine[s.id];
    return !!k && k.owned === (s.owned ?? 0) && k.total === (s.total ?? 0) && now - k.at < RARITY_AGAIN;
  };
  const todo = series.filter((s) => !current(s));
  const batch = todo.slice(0, Math.max(0, budget));
  let failed = 0;
  for (let i = 0; i < batch.length; i += 3)
    await Promise.all(
      batch.slice(i, i + 3).map(async (s) => {
        try {
          const cards = (await game(`/cards?manga=${encodeURIComponent(s.id)}`)).cards ?? [];
          const by = {}; // rareté -> [cartes uniques possédées, cartes, exemplaires]
          for (const c of cards) {
            if (!RANK[c?.rarity]) continue;
            const r = (by[c.rarity] ??= [0, 0, 0]);
            r[1]++;
            if (c.owned > 0) {
              r[0]++;
              r[2] += c.owned;
            }
          }
          mine[s.id] = { owned: s.owned ?? 0, total: s.total ?? 0, at: Date.now(), by };
        } catch {
          failed++;
        }
      })
    );
  const ids = new Set(series.map((s) => s.id));
  for (const k in mine) if (!ids.has(k)) delete mine[k]; // (une série que le jeu n'a plus)
  if (batch.length) await chrome.storage.local.set({ rarityCache: { ...rarityCache, [me]: mine } });
  const byRarity = Object.fromEntries(Object.keys(RANK).map((r) => [r, { owned: 0, total: 0, copies: 0 }]));
  for (const s of series)
    for (const [r, [owned, total, copies]] of Object.entries(mine[s.id]?.by ?? {})) {
      byRarity[r].owned += owned;
      byRarity[r].total += total;
      byRarity[r].copies += copies;
    }
  const counted = series.filter((s) => mine[s.id]).length;
  return { byRarity, counted, series: series.length, pending: todo.length - batch.length + failed, failed };
}

// La progression du joueur : cartes uniques et manquantes, séries complètes, cartes de chaque rareté (comptées
// jusqu'ici, voir rarityCounts), et les cartes gagnées chaque jour.
export async function collectionStats() {
  await syncProgress(await myId(), true).catch(() => false);
  const [{ id, sc, series, point, days }, rarities] = await Promise.all([collectionSnapshot(), rarityCounts(0).catch(() => null)]);
  const keys = Object.keys(days).sort();
  const history = keys.map((k, i) => ({
    day: k,
    owned: days[k].last.owned,
    complete: days[k].last.complete,
    // cartes gagnées ce jour-là : depuis la dernière lecture de la veille, sinon depuis la première lecture du jour
    gain: days[k].last.owned - (i > 0 ? days[keys[i - 1]].last.owned : days[k].first.owned),
    since: i > 0 ? keys[i - 1] : null
  }));
  return {
    id,
    name: sc.player?.name ?? null,
    owned: point.owned,
    total: point.total,
    missing: Math.max(0, point.total - point.owned),
    complete: point.complete,
    series: Array.isArray(series) ? series.length : null,
    albums: sc.albums?.length ?? 0,
    rarities, // { byRarity, counted, series, pending } ou null
    history,
    today: dayKey()
  };
}
