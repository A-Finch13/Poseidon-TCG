// Aquaman, code de la page : marché › Enchères, le filtre « Mes mises ».

// Dans l'onglet « Enchères » du marché (?vue=encheres), avant les raretés de « Filtrer » : un filtre « Mes mises » qui
// ne montre que les enchères en cours où le joueur a fait une offre. Ces enchères viennent du jeu (GET
// /auctions?mine=bidding, comme « Mes offres » : { auctions: [{ id, status, endsAt… }] }), seulement celles encore
// ouvertes (status « open », pas encore finies). Gardé pour l'onglet.
// Le jeu ne charge qu'une partie des enchères ouvertes dans cet onglet (selon le tri choisi) : une enchère où le joueur
// a misé peut ne pas y être. Aquaman l'ajoute à la grille, dans une tuile copiée de celles du jeu et remplie avec
// l'enchère (lien, image, nom, série, numéro, offre actuelle, nombre d'offres, temps restant).
const MY_BIDS_KEY = 'aqm-market-my-bids';
const AUCTION_LINK = /^\/jeu\/encheres\/([^/?#]+)/;
let myBids = null; // { at, ids: Map(id -> enchère) }, ses enchères ouvertes
let myBidsLoading = false;
let myBidsAskedAt = 0;
const myBidsOn = () => {
  try {
    return sessionStorage.getItem(MY_BIDS_KEY) === '1';
  } catch {
    return false;
  }
};
const onAuctionsTab = () => /^\/jeu\/marche\/?$/.test(location.pathname) && new URLSearchParams(location.search).get('vue') === 'encheres';

async function loadMyBids() {
  if (myBidsLoading) return;
  myBidsLoading = true;
  try {
    const body = await gameWrite('/auctions?mine=bidding&sort=ending', 'GET');
    const ids = new Map();
    for (const a of Array.isArray(body?.auctions) ? body.auctions : []) {
      if (typeof a?.id === 'string' && a.status === 'open' && Date.parse(a.endsAt) > Date.now() && a.card?.name) ids.set(a.id, a);
    }
    myBids = { at: Date.now(), ids };
  } catch (e) {
    console.warn('[Aquaman] Mes mises :', e.message);
  } finally {
    myBidsLoading = false;
  }
}

// L'id de l'enchère d'une tuile, d'après son lien /jeu/encheres/{id}.
function auctionId(el) {
  const link = el.matches('a[href^="/jeu/encheres/"]') ? el : el.querySelector('a[href^="/jeu/encheres/"]');
  return link?.getAttribute('href')?.match(AUCTION_LINK)?.[1] ?? null;
}

function markMyBids() {
  const clear = () => {
    document.querySelectorAll('.aqm-bid-hidden').forEach((el) => el.classList.remove('aqm-bid-hidden'));
    document.querySelectorAll('.aqm-bid-extra').forEach((el) => el.remove());
  };
  if (!onAuctionsTab()) {
    document.querySelectorAll('.aqm-my-bids').forEach((el) => el.remove());
    return clear();
  }
  // Le groupe « Filtrer » du jeu (les raretés), sous « Trier ».
  const group = document.querySelector('[role="group"][aria-label="Filtrer"]');
  if (!group) return clear();
  const on = myBidsOn();
  let chip = group.querySelector(':scope > .aqm-my-bids');
  if (!chip) {
    // L'aspect des pastilles du jeu non choisies (une rareté), son propre état dessiné par Aquaman.
    const plain = [...group.querySelectorAll('button')].find((b) => b.getAttribute('aria-pressed') === 'false');
    chip = h(
      'button',
      {
        type: 'button',
        class: `${plain?.className ?? ''} aqm-my-bids`,
        title: 'Seulement les enchères en cours où tu as fait une offre',
        onclick: () => {
          try {
            myBidsOn() ? sessionStorage.removeItem(MY_BIDS_KEY) : sessionStorage.setItem(MY_BIDS_KEY, '1');
          } catch {}
          myBidsAskedAt = 0;
          markMyBids();
        }
      },
      'Mes mises'
    );
    group.prepend(chip);
  }
  chip.classList.toggle('is-on', on);
  chip.setAttribute('aria-pressed', String(on));
  if (!on) return clear();

  // (relues toutes les 30 s au plus tant que le filtre est choisi : une nouvelle mise, une enchère finie)
  if ((!myBids || Date.now() - myBids.at > 30e3) && Date.now() - myBidsAskedAt > 30e3) {
    myBidsAskedAt = Date.now();
    loadMyBids().then(() => !stopped && markMyBids());
  }
  if (!myBids) return;
  const open = new Map([...myBids.ids].filter(([, a]) => Date.parse(a.endsAt) > Date.now()));
  const mine = (id) => open.has(id);
  const label = `Mes mises (${open.size})`;
  if (chip.textContent !== label) chip.textContent = label;

  // Les enchères affichées : chaque tuile de la grille (un li), et celle mise en avant au-dessus des filtres (« bientôt
  // finie »), une partie de la page avant la barre de filtres.
  const bar = group.closest('[data-reveal]');
  const box = bar?.parentElement;
  const tiles = new Set();
  for (const link of (box ?? document).querySelectorAll('a[href^="/jeu/encheres/"]')) {
    if (link.closest('.aqm-root')) continue;
    let tile = link.closest('li');
    if (!tile && box) for (tile = link; tile.parentElement && tile.parentElement !== box; tile = tile.parentElement);
    if (tile && tile !== bar && !tile.contains(group)) tiles.add(tile);
  }
  for (const tile of tiles) {
    const id = auctionId(tile);
    tile.classList.toggle('aqm-bid-hidden', !!id && !mine(id));
  }
  addMissingBids(open, [...tiles].filter((t) => t.matches('li')));
}

// Les enchères du joueur que la grille du jeu n'a pas (seulement celles de la rareté choisie, s'il y en a une), à la
// suite des siennes.
function addMissingBids(open, lis) {
  const shown = new Set(lis.map(auctionId));
  const rarity = new URLSearchParams(location.search).get('rarete') || '';
  const wanted = [...open.values()].filter((a) => !shown.has(a.id) && (!rarity || a.card.rarity === rarity));
  const grid = lis[0]?.parentElement;
  for (const el of document.querySelectorAll('.aqm-bid-extra')) if (el.parentElement !== grid || !wanted.some((a) => a.id === el.dataset.aqmBid)) el.remove();
  if (!grid) return;
  // Le modèle : une tuile du jeu de la même rareté (son cadre et ses couleurs), une de ses enchères de préférence.
  const models = lis.map((li) => ({ li, a: open.get(auctionId(li)) ?? null, label: li.querySelector('a')?.getAttribute('aria-label') ?? '' }));
  for (const a of wanted) {
    let li = grid.querySelector(`:scope > .aqm-bid-extra[data-aqm-bid="${CSS.escape(a.id)}"]`);
    if (!li) {
      const rarityName = RARITY_NAMES[a.card.rarity] ?? '';
      const model =
        models.find((m) => m.a?.card.rarity === a.card.rarity) ??
        models.find((m) => rarityName && m.label.includes(`, ${rarityName}, `)) ??
        models.find((m) => m.a) ??
        models[0];
      li = bidTile(a, model);
      if (!li) continue;
      grid.append(li);
    }
    fillBidTile(li, a);
  }
}

const serialText = (card, serial) => (card?.maxCopies ? `#${serial}/${card.maxCopies}` : `#${serial}`);

// Une tuile copiée de celle du jeu (li > a[href=/jeu/encheres/…] > [la carte, les infos]), avec le nom, la série, la
// rareté et le numéro de l'enchère à la place de ceux du modèle.
function bidTile(a, model) {
  if (!model) return null;
  // Ce qu'affiche la carte du modèle : d'après son enchère, sinon son aria-label (« nom, rareté, #numéro… »).
  const [mName, mRarityName, mSerial] = model.a ? [model.a.card.name, RARITY_NAMES[model.a.card.rarity], serialText(model.a.card, model.a.serial)] : model.label.split(', ');
  const mCode = Object.keys(RARITY_NAMES).find((c) => RARITY_NAMES[c] === mRarityName);
  const li = bareCopy(model.li);
  li.classList.add('aqm-root', 'aqm-bid-extra');
  li.dataset.aqmBid = a.id;
  const link = li.querySelector('a');
  const card = link?.firstElementChild;
  if (!link || !card) return null;
  link.setAttribute('href', `/jeu/encheres/${encodeURIComponent(a.id)}`);
  const img = card.querySelector('img');
  if (img) {
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.src = cardImageUrl(a.card.image);
    img.alt = a.card.name;
    img.loading = 'lazy';
  }
  // Les textes de la carte : la série est celle qui suit le nom.
  const texts = [];
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent.trim()) texts.push(n);
  const nameAt = texts.findIndex((n) => n.textContent.trim() === mName);
  const seriesNode = nameAt >= 0 ? texts[nameAt + 1] : null;
  for (const n of texts) {
    const t = n.textContent.trim();
    if (t === mName) n.textContent = a.card.name;
    else if (n === seriesNode) n.textContent = a.card.series?.title ?? '';
    else if (mSerial && t === mSerial) n.textContent = serialText(a.card, a.serial);
    else if (mCode && t === mCode) n.textContent = a.card.rarity;
    else if (mRarityName && t === mRarityName) n.textContent = RARITY_NAMES[a.card.rarity] ?? a.card.rarity;
  }
  // (« Tu es en tête » seulement quand le jeu dit que le joueur est le meilleur enchérisseur ; jamais « Ça s'arrache »)
  const lead = !!meId && a.bidder?.id === meId;
  for (const span of card.querySelectorAll('span')) {
    const t = span.textContent.trim();
    if (/^ça s.arrache$/i.test(t) || (/^tu es en tête$/i.test(t) && !lead)) span.remove();
  }
  return li;
}

// L'aria-label, l'offre actuelle, le nombre d'offres et le temps restant (redits à chaque passage : le temps file).
function fillBidTile(li, a) {
  const link = li.querySelector('a');
  const info = link?.lastElementChild;
  const lead = !!meId && a.bidder?.id === meId;
  const label = `${a.card.name}, ${RARITY_NAMES[a.card.rarity] ?? a.card.rarity}, ${serialText(a.card, a.serial)}${lead ? ', tu es en tête' : ''}`;
  if (link && link.getAttribute('aria-label') !== label) link.setAttribute('aria-label', label);
  if (!info || info === link.firstElementChild) return;
  const priceRow = info.firstElementChild;
  const timeRow = info.lastElementChild;
  const price = priceRow?.firstElementChild;
  const offers = priceRow?.lastElementChild;
  const setText = (el, re, text) => {
    if (!el) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (re.test(n.textContent.trim())) return void (n.textContent !== text && (n.textContent = text));
  };
  setText(price, /^\d[\d\s  ]*$/, fmt(a.currentBid ?? a.startPrice));
  if (offers && offers !== price) {
    const text = a.bids ? `${a.bids} offre${a.bids > 1 ? 's' : ''}` : 'Mise à prix';
    if (offers.textContent !== text) offers.textContent = text;
  }
  setText(timeRow, /\d|instants/, timeLeft(Date.parse(a.endsAt) - Date.now()));
}

// Le temps restant comme l'écrit le jeu : « 21 h 19 min », « 7 h 01 min », « 12 min 05 s ».
function timeLeft(ms) {
  if (ms <= 0) return 'quelques instants';
  const s = Math.floor(ms / 1000);
  const [d, h, m, sec] = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
  const two = (n) => String(n).padStart(2, '0');
  if (d) return `${d} j ${two(h)} h`;
  if (h) return `${h} h ${two(m)} min`;
  return `${m} min ${two(sec)} s`;
}

// ---------- Marché › Mes offres : filtre « En cours » ----------
// Au-dessus de la grille de « Mes offres » (?vue=offres, les enchères où le joueur a fait une offre) : une pastille «
// En cours » qui cache les enchères terminées. Une enchère terminée est celle dont la ligne du temps porte l'issue que
// le jeu écrit à la place du compte à rebours (« Vendue », « Sans offre », « Retirée »). Gardé pour l'onglet.
const OPEN_BIDS_KEY = 'aqm-market-open-bids';
const AUCTION_ENDED = /^(vendue|sans offre|retirée)$/i;
const openBidsOn = () => {
  try {
    return sessionStorage.getItem(OPEN_BIDS_KEY) === '1';
  } catch {
    return false;
  }
};
const onOffersTab = () => /^\/jeu\/marche\/?$/.test(location.pathname) && new URLSearchParams(location.search).get('vue') === 'offres';

function markOpenBids() {
  const tiles = onOffersTab()
    ? [...document.querySelectorAll('main li a[href^="/jeu/encheres/"]')].filter((a) => !a.closest('.aqm-root')).map((a) => a.closest('li'))
    : [];
  const grid = tiles[0]?.parentElement;
  if (!grid) {
    document.querySelectorAll('.aqm-open-bids').forEach((el) => el.remove());
    document.querySelectorAll('.aqm-bid-ended').forEach((el) => el.classList.remove('aqm-bid-ended'));
    document.querySelectorAll('li[data-aqm-lead]').forEach((el) => (el.style.order = '', el.removeAttribute('data-aqm-lead')));
    return;
  }
  const ended = (li) => AUCTION_ENDED.test(li.querySelector('a')?.lastElementChild?.lastElementChild?.textContent.trim() ?? '');
  const on = openBidsOn();
  let row = grid.parentElement.querySelector(':scope > .aqm-open-bids');
  if (!row) {
    row = h(
      'div',
      { class: 'aqm-root aqm-market-sort aqm-open-bids', role: 'group', 'aria-label': 'Filtrer mes offres' },
      h('strong', {}, 'Afficher'),
      h('button', {
        type: 'button',
        class: 'aqm-market-sort-button',
        title: 'Seulement les enchères encore en cours',
        onclick: () => {
          try {
            openBidsOn() ? sessionStorage.removeItem(OPEN_BIDS_KEY) : sessionStorage.setItem(OPEN_BIDS_KEY, '1');
          } catch {}
          markOpenBids();
        }
      })
    );
  }
  if (row.nextElementSibling !== grid) grid.before(row);
  let open = 0;
  for (const li of tiles) {
    const done = ended(li);
    if (!done) open++;
    li.classList.toggle('aqm-bid-ended', on && done);
    // Les enchères que le joueur mène d'abord (le jeu finit leur aria-label par « , tu es en tête ») : rangées avec «
    // order » dans la grille du jeu, sans être déplacées ; les autres gardent leur ordre.
    const lead = /, tu es en tête$/i.test(li.querySelector('a')?.getAttribute('aria-label') ?? '');
    const order = lead ? '-1' : '';
    if (li.style.order !== order) li.style.order = order;
    li.toggleAttribute('data-aqm-lead', lead);
  }
  const chip = row.querySelector('button');
  const label = `En cours (${open})`;
  if (chip.textContent !== label) chip.textContent = label;
  chip.classList.toggle('is-on', on);
  chip.setAttribute('aria-pressed', String(on));
}
