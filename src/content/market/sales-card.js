// Aquaman, code de la page : Marché › « Tes cartes à vendre », les cartes déjà en vente et leur tri.
// (proposé par volcanofr, PR #2)

// ---------- Marché : « Déjà en vente » et « Trier par » dans « Tes cartes à vendre » ----------
// Les cartes du joueur déjà proposées au marché (ses annonces, GET /market/listings?mine=1) ou en enchère ouverte
// (GET /auctions?mine=selling) sont lues par inject.js dans les réponses que le jeu reçoit, et marquées « Déjà en
// vente » dans « Tes cartes à vendre ». Au-dessus, « Trier par » range ces cartes selon un ou plusieurs critères
// (recherchées, possédées, valeur estimée, nom), gardés pour l'onglet.
// Les cartes du jeu ne sont jamais déplacées (React les place lui-même) : le tri passe par la propriété CSS « order »
// de chacune dans la grille. Le repère qui fait charger la suite de la liste (48 cartes à la fois) est remonté en haut
// de la liste (en CSS aussi) tant qu'un tri est choisi : toute la liste se charge, et le tri porte sur toutes les
// cartes.

let marketSalesKeys = new Set();
const marketListingKeys = new Set();
const marketAuctionKeys = new Set();
const MARKET_SALES_PATH = /^\/jeu\/marche\/?$/;
const MARKET_SALES_MARK = 'data-aqm-market-sale';
const AQM_MARKET_SORT_KEY = 'aqm-market-sales-sort';
const AQM_MARKET_SORTS = [
  ['searches-desc', 'Recherchées ↓'],
  ['owned-desc', 'Possédées ↓'],
  ['owned-asc', 'Possédées ↑'],
  ['value-desc', 'Valeur (estimée) ↓'],
  ['value-asc', 'Valeur (estimée) ↑'],
  ['name-asc', 'Alphabétique A → Z'],
  ['name-desc', 'Alphabétique Z → A']
];
let aqmMarketSort = readMarketSort();
let marketSortMenu = null;

// Les cartes en vente, d'après les dernières réponses lues par inject.js (gardées sur <html> : le code de la page peut
// démarrer après elles).
function readMarketSales() {
  for (const [kind, target] of [
    ['listings', marketListingKeys],
    ['auctions', marketAuctionKeys]
  ]) {
    try {
      const keys = JSON.parse(document.documentElement.getAttribute(`data-aqm-market-sales-${kind}`) ?? '[]');
      target.clear();
      for (const key of keys) if (typeof key === 'string') target.add(key);
    } catch {}
  }
  marketSalesKeys = new Set([...marketListingKeys, ...marketAuctionKeys]);
}

// L'id de la carte d'une tuile, d'après son lien /jeu/marche/{carte}.
function cardSaleKey(tile) {
  const link = tile.querySelector('a[href^="/jeu/marche/"]');
  return link?.getAttribute('href')?.split(/[?#]/)[0].split('/').pop() ?? null;
}

function readMarketSort() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(AQM_MARKET_SORT_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((value, i) => AQM_MARKET_SORTS.some(([key]) => key === value) && saved.indexOf(value) === i) : [];
  } catch {
    return [];
  }
}

function cardNumber(card, re, fallback = 0) {
  const match = card.textContent.match(re);
  return match ? Number(match[1].replace(/[^\d]/g, '')) : fallback;
}

// La valeur d'une tuile pour un critère, lue dans ce que le jeu affiche : son nom, « N joueurs la cherchent », « × N »
// (exemplaires possédés), « ≈ N » (valeur estimée).
function cardSortValue(card, sort) {
  if (sort === 'name-asc' || sort === 'name-desc') {
    const label = card.querySelector('a[aria-label]')?.getAttribute('aria-label') ?? '';
    return label.split(/[:,]/, 1)[0].trim().toLocaleLowerCase('fr');
  }
  if (sort.startsWith('searches-')) {
    const match = [...card.querySelectorAll('[title]')]
      .map((el) => el.getAttribute('title') ?? '')
      .map((text) => text.match(/(\d[\d\s ]*)\s+joueurs?\s+la\s+cherche(?:nt)?/i))
      .find(Boolean);
    return match ? Number(match[1].replace(/[^\d]/g, '')) : 0;
  }
  if (sort === 'owned-asc' || sort === 'owned-desc') return cardNumber(card, /×\s*([\d\s ]+)/, 1);
  return cardNumber(card, /≈\s*([\d\s ]+)/);
}

// Range les tuiles avec « order » (la grille du jeu les affiche dans cet ordre, sans qu'elles bougent) ; sans tri, leur
// ordre est rendu au jeu. Le repère de chargement suit (voir plus haut).
function sortSalesCards(section) {
  const list = section.querySelector('ul');
  if (!list) return;
  const cards = [...list.children];
  const sentinel = [...(list.parentElement?.children ?? [])].find((child) => child !== list && child.matches('div[aria-hidden="true"]') && !child.childElementCount);
  if (sentinel) {
    sentinel.toggleAttribute('data-aqm-sentinel-up', aqmMarketSort.length > 0);
    list.parentElement.toggleAttribute('data-aqm-sentinel-box', aqmMarketSort.length > 0);
  }
  if (!aqmMarketSort.length) {
    for (const card of cards) if (card.style.order) card.style.removeProperty('order');
    return;
  }
  const ranked = cards.map((card, index) => ({ card, index }));
  ranked.sort((a, b) => {
    for (const sort of aqmMarketSort) {
      const aValue = cardSortValue(a.card, sort);
      const bValue = cardSortValue(b.card, sort);
      const difference = typeof aValue === 'string' && typeof bValue === 'string' ? aValue.localeCompare(bValue, 'fr') : aValue - bValue;
      if (difference !== 0) return sort.endsWith('-desc') ? -difference : difference;
    }
    return a.index - b.index;
  });
  ranked.forEach(({ card }, i) => {
    if (card.style.order !== String(i)) card.style.order = String(i);
  });
}

function updateMarketSort(index, value) {
  aqmMarketSort = aqmMarketSort.filter((sort, i) => i !== index && sort !== value);
  if (value) aqmMarketSort.splice(Math.min(index, aqmMarketSort.length), 0, value);
  try {
    sessionStorage.setItem(AQM_MARKET_SORT_KEY, JSON.stringify(aqmMarketSort));
  } catch {}
  markSalesCards();
}

function closeMarketSortMenu() {
  if (!marketSortMenu) return;
  marketSortMenu.anchor?.setAttribute('aria-expanded', 'false');
  marketSortMenu.remove();
  marketSortMenu = null;
}

const sortBase = (value) => value.replace(/-(asc|desc)$/, '');

function openMarketSortMenu(anchor, index) {
  closeMarketSortMenu();
  const selected = new Set(aqmMarketSort.filter((_, i) => i !== index).map(sortBase));
  const choices = [...(index < aqmMarketSort.length ? [['', 'Aucun tri']] : []), ...AQM_MARKET_SORTS.filter(([value]) => !selected.has(sortBase(value)))];
  marketSortMenu = h(
    'div',
    { class: 'aqm-root aqm-menu aqm-market-sort-menu', role: 'menu' },
    ...choices.map(([value, label]) =>
      h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          class: 'aqm-menu-item',
          onclick: () => {
            closeMarketSortMenu();
            updateMarketSort(index, value);
          }
        },
        label
      )
    )
  );
  marketSortMenu.anchor = anchor;
  document.body.append(marketSortMenu);
  anchor.setAttribute('aria-expanded', 'true');
  const r = anchor.getBoundingClientRect();
  const below = r.bottom + 8 + marketSortMenu.offsetHeight < innerHeight;
  marketSortMenu.style.top = `${below ? r.bottom + 8 : r.top - 8 - marketSortMenu.offsetHeight}px`;
  marketSortMenu.style.left = `${Math.max(8, Math.min(innerWidth - marketSortMenu.offsetWidth - 8, r.left))}px`;
}

// « Trier par » : un bouton par critère choisi, et « Ajouter un tri » tant qu'il en reste.
function renderMarketSort(section) {
  const previousBox = section.querySelector(':scope > .aqm-market-sort');
  const max = new Set(AQM_MARKET_SORTS.map(([value]) => sortBase(value))).size;
  const count = Math.min(aqmMarketSort.length + 1, max);
  const signature = JSON.stringify(aqmMarketSort);
  if (previousBox?.dataset.aqmSortSignature === signature) return;
  const box = h(
    'div',
    { class: 'aqm-root aqm-market-sort', 'data-aqm-sort-signature': signature },
    h('strong', {}, 'Trier par'),
    ...Array.from({ length: count }, (_, index) => {
      const current = aqmMarketSort[index];
      const label = AQM_MARKET_SORTS.find(([value]) => value === current)?.[1] ?? 'Ajouter un tri';
      return h(
        'button',
        {
          type: 'button',
          'aria-haspopup': 'menu',
          'aria-expanded': 'false',
          'aria-pressed': String(!!current),
          class: `aqm-market-sort-button${current ? ' is-on' : ''}`,
          onclick: (event) => openMarketSortMenu(event.currentTarget, index)
        },
        `${index + 1}. ${label}`
      );
    })
  );
  if (previousBox) previousBox.replaceWith(box);
  else section.firstElementChild ? section.firstElementChild.after(box) : section.append(box);
}

function markSalesCards() {
  if (!MARKET_SALES_PATH.test(location.pathname)) return;
  readMarketSales();
  const section = document.querySelector('section[aria-labelledby="sales-cards"]');
  if (!section) return;
  renderMarketSort(section);
  sortSalesCards(section);
  for (const card of section.querySelectorAll('ul > li')) {
    const old = card.querySelector(`[${MARKET_SALES_MARK}]`);
    if (!marketSalesKeys.has(cardSaleKey(card))) {
      old?.remove();
      continue;
    }
    if (old) continue;
    const status = card.querySelector('p.truncate');
    if (!status) continue;
    status.append(h('span', { class: 'aqm-root aqm-market-sale', title: 'Déjà en vente (au marché ou en enchère)', [MARKET_SALES_MARK]: '' }, 'Déjà en vente'));
  }
}
