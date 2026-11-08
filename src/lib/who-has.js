// Aquaman : qui a une carte.

import { RELAY } from './common.js';
import { cached, game } from './api.js';
import { showcase } from './collections.js';
import { friends } from './leaderboard.js';
import { fold } from './boosters.js';
import { seriesCards } from './favorites.js';
import { recordFeed, relayPulls } from './feed.js';
import { relayHoldings } from './pullers.js';

// ---------- qui a une carte ----------

// Cartes de tout le jeu dont le nom correspond (la recherche du jeu lui-même).
export async function searchCards(query) {
  const q = String(query ?? '').trim();
  if (q.length < 2) return [];
  const { cards } = await cached(`card-search:${fold(q)}`, 5 * 60e3, () => game(`/cards?q=${encodeURIComponent(q)}&limit=12`));
  return (cards ?? []).map((c) => ({ id: c.id, name: c.name, variant: c.variant ?? null, image: c.image, rarity: c.rarity, series: c.series?.title ?? null, owned: c.owned ?? 0 }));
}

// Les offres les moins chères d'une carte sur le marché, la moins chère d'abord (5 au plus), et combien il y en a.
export async function cardListings(id) {
  const card = await cached(`card:${id}`, 5 * 60e3, () => game(`/cards/${encodeURIComponent(id)}`));
  const { listings } = await cached(`listings:${id}`, 30e3, () => game(`/market/listings?${new URLSearchParams({ sort: 'price', q: card.name })}`));
  const offers = (listings ?? [])
    .filter((l) => (l.card?.id ?? l.cardId) === id && typeof l.price === 'number')
    .map((l) => {
      const seller = l.seller ?? l.player ?? null;
      return { id: l.id ?? null, price: l.price, serial: l.serial ?? l.copy?.serial ?? null, player: seller ? { id: seller.id, name: seller.name } : null };
    })
    .sort((a, b) => a.price - b.price);
  return { offers: offers.slice(0, 5), count: offers.length, maxCopies: card.maxCopies ?? null, name: card.name ?? null };
}

// Les enchères d'une carte encore en cours, la plus basse d'abord : l'offre à battre (la plus haute, sinon le prix de
// départ), sa fin, son numéro, son vendeur et son nombre d'offres. La réponse du jeu est lue avec souplesse (ses champs
// peuvent avoir d'autres noms) : une enchère dont la carte ou l'offre est introuvable est laissée de côté.
export async function cardAuctions(id) {
  const body = await cached('auctions', 30e3, () => game('/auctions'));
  const list = Array.isArray(body) ? body : body?.auctions ?? body?.items ?? body?.data ?? [];
  const num = (...v) => v.find((x) => typeof x === 'number' && Number.isFinite(x)) ?? null;
  const time = (v) => (v == null ? null : typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v) || null);
  const now = Date.now();
  return list
    .filter((a) => (a?.card?.id ?? a?.cardId ?? a?.copy?.card?.id ?? a?.copy?.cardId) === id)
    .map((a) => {
      const top = a.highestBid ?? a.topBid ?? a.lastBid ?? null;
      const seller = a.seller ?? a.player ?? a.owner ?? null;
      return {
        id: a.id ?? null,
        bid: num(a.currentBid, a.currentPrice, typeof top === 'number' ? top : top?.amount, top?.price, a.bid, a.price, a.startingBid, a.startingPrice, a.startPrice, a.minBid),
        bids: num(a.bidCount, a.bidsCount, a._count?.bids, Array.isArray(a.bids) ? a.bids.length : null),
        endsAt: time(a.endsAt ?? a.endAt ?? a.endDate ?? a.expiresAt ?? a.closesAt),
        serial: a.serial ?? a.copy?.serial ?? null,
        player: seller ? { id: seller.id, name: seller.name } : null
      };
    })
    .filter((a) => a.bid != null && !(a.endsAt && a.endsAt <= now))
    .sort((a, b) => a.bid - b.bid || (a.endsAt ?? Infinity) - (b.endsAt ?? Infinity));
}

// Une carte manquante de la collection, connue par son id ou sinon par son image (image : son nom de fichier), trouvée
// parmi les cartes de sa série ou par son nom : combien d'offres le marché en a.
export async function cardSale(id, image, name, series) {
  const same = (c) => String(c.image ?? '').split(/[?#]/)[0].split('/').pop() === image;
  if (!id && image && series) id = (await seriesCards(series).catch(() => [])).find(same)?.id ?? null;
  if (!id && image && name && name.length >= 2) {
    const { cards } = await cached(`card-search:${fold(name)}`, 5 * 60e3, () => game(`/cards?q=${encodeURIComponent(name)}&limit=12`));
    id = (cards ?? []).find(same)?.id ?? null;
  }
  if (!id) return null;
  const r = await cardListings(id);
  return { id, name: r.name, count: r.count };
}

// Tous ceux qu'Aquaman peut voir avec une carte : détenteurs (cartes limitées), vendeurs, amis et tirages récents.
export async function cardOwners(id) {
  const card = await game(`/cards/${encodeURIComponent(id)}`);
  // Le jeu ne liste les détenteurs que des cartes limitées (une liste vide pour les autres veut dire « non publié »).
  const holders = card.maxCopies && Array.isArray(card.holders) ? card.holders.map((x) => ({ serial: x.serial ?? null, player: x.player ? { id: x.player.id, name: x.player.name } : null })) : null;

  let market = [];
  try {
    const { listings } = await game(`/market/listings?${new URLSearchParams({ sort: 'price', q: card.name })}`);
    market = (listings ?? [])
      .filter((l) => (l.card?.id ?? l.cardId) === id)
      .map((l) => {
        const seller = l.seller ?? l.player ?? null;
        return { price: l.price ?? null, serial: l.serial ?? l.copy?.serial ?? null, player: seller ? { id: seller.id, name: seller.name } : null };
      });
  } catch {}

  let mates = [];
  try {
    const { me, friends: list } = await friends();
    const people = [{ id: me, name: null, me: true }, ...list];
    await Promise.all(
      people.map(async (p) => {
        try {
          const sc = await showcase(p.id);
          if (sc.private) return;
          const copies = (sc.copies ?? []).filter((c) => c.card?.id === id);
          if (copies.length) mates.push({ player: { id: p.id, name: p.name ?? sc.player?.name ?? null }, me: !!p.me, count: copies.length, serials: copies.map((c) => c.serial).filter((n) => n != null) });
        } catch {}
      })
    );
    mates.sort((a, b) => b.me - a.me || b.count - a.count);
  } catch {}

  // Les joueurs dont la collection a été lue après un de leurs beaux tirages, autres que le joueur et ses amis.
  const known = await relayHoldings(id);
  const mateIds = new Set(mates.map((m) => m.player.id));
  // Un exemplaire numéroté n'a qu'un propriétaire : celui vu maintenant (la collection d'un ami, une offre du marché)
  // l'emporte sur les lectures du relais, qui peuvent dater de plusieurs heures (l'exemplaire a changé de mains
  // depuis), et la lecture la plus récente sur les plus anciennes. Un joueur à qui il ne reste aucun de ses exemplaires
  // n'est pas montré.
  const taken = new Set([...mates.flatMap((m) => m.serials), ...market.map((m) => m.serial)].filter((n) => n != null));
  const seen = [];
  for (const o of [...(known?.owners ?? [])].sort((a, b) => (b.seenAt ?? 0) - (a.seenAt ?? 0))) {
    if (!o.player?.id || mateIds.has(o.player.id)) continue;
    const serials = (o.serials ?? []).filter((n) => !taken.has(n));
    const count = (o.count ?? 1) - ((o.serials ?? []).length - serials.length);
    serials.forEach((n) => taken.add(n));
    if (count > 0) seen.push({ ...o, serials, count });
  }

  const remote = await relayPulls({ card: id, limit: 200 });
  if (remote?.pulls) await recordFeed(remote.pulls, true);
  const { feedLog = [], feedSince = null } = await chrome.storage.local.get(['feedLog', 'feedSince']);
  const pulls = feedLog.filter((p) => p.card.id === id).map((p) => ({ at: p.at, serial: p.serial, player: p.player }));
  const since = Math.min(feedSince ?? Infinity, remote?.since ?? Infinity);

  return {
    card: {
      id: card.id ?? id,
      name: card.name,
      variant: card.variant ?? null,
      image: card.image,
      rarity: card.rarity,
      series: card.series?.title ?? null,
      owners: card.owners ?? null,
      circulation: card.circulation ?? null,
      wants: card.wants ?? null,
      minted: card.minted ?? null,
      maxCopies: card.maxCopies ?? null,
      owned: Array.isArray(card.copies) ? card.copies.length : 0
    },
    holders,
    market,
    friends: mates,
    seen,
    scanned: known?.scanned ?? null,
    pulls,
    pullsSince: since === Infinity ? null : since,
    shared: !!remote
  };
}

// Joueurs vus dans les « beaux tirages » gardés par Aquaman (les plus récents d'abord), autres que le joueur et ses
// amis.
export async function knownPlayers(max = 120) {
  const { me, friends: list } = await friends().catch(() => ({ me: null, friends: [] }));
  const skip = new Set([me, ...list.map((f) => f.id)]);
  const { feedLog = [] } = await chrome.storage.local.get('feedLog');
  let remote = [];
  try {
    const res = await fetch(`${RELAY}/players?limit=${max}`);
    if (res.ok) remote = (await res.json()).players ?? [];
  } catch {}
  const seen = new Map();
  for (const p of [...remote, ...feedLog.map((x) => x.player).filter(Boolean)])
    if (p.id && !skip.has(p.id) && !seen.has(p.id)) seen.set(p.id, { id: p.id, name: p.name ?? null });
  return [...seen.values()].slice(0, max);
}

// Lesquels de ces joueurs ont la carte, lu dans leurs collections publiques.
export async function ownersAmong(cardId, players) {
  const found = [];
  let hidden = 0;
  await Promise.all(
    players.slice(0, 12).map(async (p) => {
      try {
        const sc = await showcase(p.id, 30 * 60e3);
        if (sc.private) return void hidden++;
        const copies = (sc.copies ?? []).filter((c) => c.card?.id === cardId);
        if (copies.length) found.push({ player: { id: p.id, name: p.name ?? sc.player?.name ?? null }, count: copies.length, serials: copies.map((c) => c.serial).filter((n) => n != null) });
      } catch {
        hidden++;
      }
    })
  );
  return { found, hidden };
}
