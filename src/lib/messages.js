// Aquaman : les réponses aux messages du code de la page.

import { getSettings, setSettings, SETTINGS } from './settings.js';
import { cached, forget, game, myId } from './api.js';
import { imageKey, ownership, playerSummary } from './collections.js';
import { boardKnown, claimedAlbums, friends } from './leaderboard.js';
import { collectionSnapshot } from './progress.js';
import { collectionStats, missingCards, rarityCounts } from './rarities.js';
import { boosterReport, loadCatalog } from './boosters.js';
import { pity, pityHistory, recordOpening, setPityRules } from './pity.js';
import { favoritesReport, globalPacks, packKinds, playerOwnership, searchedImages, seriesStatus, setFavorite, wantRoom } from './favorites.js';
import { guardedSeries, setGuarded } from './locked.js';
import { syncWants } from './wants.js';
import { syncMarket } from './market.js';
import { salesRecap, salesSync } from './sales.js';
import { pollFeed, recordFeed } from './feed.js';
import { scanPullers, whoPulled } from './pullers.js';
import { cardAuctions, cardListings, cardOwners, cardSale, knownPlayers, ownersAmong, searchCards } from './who-has.js';
import { access, sayHello } from './users.js';
import { approveWithCode, aquamanUsers, asAuthor, requestDevice } from './devices.js';

// ---------- messages du code de la page ----------

// Répond aux messages de données du code de la page (background.js dans l'extension, bridge.js dans le script).
export async function answer(msg) {
  try {
    switch (msg?.type) {
      case 'me-id':
        return { id: await myId() };
      case 'ownership':
        return await ownership();
      case 'sales-sync':
        return await salesSync();
      case 'sales-recap':
        return await salesRecap();
      case 'collection-stats':
        if (msg.fresh) forget('showcase:', 'series');
        return await collectionStats();
      case 'rarity-counts':
        return await rarityCounts();
      case 'missing-cards': {
        const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
        return await missingCards({ rarity: text(msg.rarity, 4), type: text(msg.kind, 40), q: text(msg.q, 80), manga: text(msg.manga, 64) });
      }
      case 'collection-snapshot': {
        const { point } = await collectionSnapshot();
        return { ok: true, owned: point.owned };
      }
      case 'searched-images':
        return { keys: await searchedImages() };
      case 'player-ownership':
        return await playerOwnership(msg);
      case 'card-images':
        return { keys: (await loadCatalog())?.map((c) => imageKey(c.image)).filter(Boolean) ?? null };
      case 'friends':
        return await friends();
      case 'player':
        return await playerSummary(msg.id, !!msg.fresh);
      case 'board-known':
        return await boardKnown();
      case 'claimed-albums':
        return await claimedAlbums(!!msg.fresh);
      case 'boosters':
        return await boosterReport(msg.query, msg.rarity, msg.field);
      case 'access':
        return await access();
      case 'settings':
        return { groups: SETTINGS, values: await getSettings() };
      case 'set-settings':
        return { values: await setSettings(msg.patch ?? {}) };
      case 'pity-history':
        return await pityHistory();
      case 'pity':
        return await pity(!!msg.fresh);
      case 'opened':
        return await recordOpening(msg.boosters ?? [], msg.best ?? [], msg.packs ?? [], msg.ids ?? []);
      case 'pity-rules':
        return await setPityRules(msg.rules);
      case 'favorites':
        return await favoritesReport(!!msg.fresh);
      case 'packs-global':
        return { packs: await globalPacks() };
      case 'pack-kinds':
        return { kinds: await packKinds() };
      case 'packs-publish':
        return await asAuthor('POST', '/admin/packs', { packs: msg.packs ?? {} });
      case 'favorite':
        return { favorites: await setFavorite(msg.id, !!msg.on) };
      case 'series-status':
        return await seriesStatus(msg.id);
      case 'guarded-series':
        return { series: await guardedSeries() };
      case 'set-guarded':
        return { series: await setGuarded(msg.id, msg.cardIds, !!msg.on) };
      case 'wants-changed':
        forget('wants', 'series');
        return { ok: true };
      case 'want-room':
        return await wantRoom(msg.waiting ?? [], msg.sent ?? []);
      case 'wants-sync':
        return await syncWants(!!msg.fresh);
      case 'market-sync':
        return await syncMarket(!!msg.fresh);
      case 'card-search':
        return { cards: await searchCards(msg.query) };
      case 'card-listings':
        if (msg.fresh) forget(`listings:${msg.id}`, 'showcase:', 'auctions');
        return { ...(await cardListings(msg.id)), auctions: await cardAuctions(msg.id).catch(() => null) };
      case 'card-sale':
        return await cardSale(msg.id ?? null, msg.image ?? null, msg.name ?? null, msg.series ?? null);
      case 'card-rarity':
        return { rarity: (await cached(`rarity:${msg.id}`, 60 * 60e3, () => game(`/cards/${encodeURIComponent(msg.id)}`)))?.rarity ?? null };
      case 'card-owners':
        return await cardOwners(msg.id);
      case 'known-players':
        return { players: await knownPlayers() };
      case 'owners-among':
        return await ownersAmong(msg.id, msg.players ?? []);
      case 'hello':
        return await sayHello(msg.kind);
      case 'aquaman-users':
        return await aquamanUsers();
      case 'admin-request':
        return { device: await requestDevice(msg.name) };
      case 'admin-code':
        return await approveWithCode(msg.token, msg.name);
      case 'admin-devices':
        return await asAuthor('GET', '/admin/devices');
      case 'admin-approve':
        return await asAuthor('POST', '/admin/devices/approve', { id: msg.id });
      case 'admin-revoke':
        return await asAuthor('POST', '/admin/devices/revoke', { id: msg.id });
      case 'admin-revoke-player':
        return await asAuthor('POST', '/admin/users/revoke', { id: msg.id, revoked: !!msg.revoked });
      case 'who-pulled':
        return await whoPulled(msg.query, msg.rarity);
      case 'feed-poll':
        return { kept: await pollFeed() };
      case 'feed-seen':
        scanPullers(msg.pulls);
        return { kept: await recordFeed(msg.pulls) };
      case 'collection-stale':
        forget('showcase:', 'shop', 'series', 'wants');
        return { ok: true };
      default:
        return { error: 'unknown_message' };
    }
  } catch (e) {
    return { error: e?.message || String(e), code: e?.code ?? null };
  }
}
