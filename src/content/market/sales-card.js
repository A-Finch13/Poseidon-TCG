// Aquaman, code de la page : marque les cartes déjà proposées à la vente.

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
let aqmMarketSort = [];
let marketSortMenu = null;

function readMarketSales() {
  for (const [kind, target] of [['listings', marketListingKeys], ['auctions', marketAuctionKeys]]) {
    try {
      const keys = JSON.parse(document.documentElement.getAttribute(`data-aqm-market-sales-${kind}`) ?? '[]');
      target.clear();
      for (const key of keys) if (typeof key === 'string') target.add(key);
    } catch {}
  }
  marketSalesKeys = new Set([...marketListingKeys, ...marketAuctionKeys]);
}

function cardSaleKey(tile) {
  const link = tile.querySelector('a[href^="/jeu/marche/"]');
  return link?.getAttribute('href')?.split('/').pop() ?? null;
}

function readMarketSort() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(AQM_MARKET_SORT_KEY) ?? '[]');
    aqmMarketSort = Array.isArray(saved) ? saved.filter((value, i) => AQM_MARKET_SORTS.some(([key]) => key === value) && saved.indexOf(value) === i) : [];
  } catch {
    aqmMarketSort = [];
  }
}

function cardNumber(card, re, fallback = 0) {
  const match = card.textContent.match(re);
  return match ? Number(match[1].replace(/[^\d]/g, '')) : fallback;
}

function cardSortValue(card, sort) {
  if (sort === 'name-asc' || sort === 'name-desc') {
    const label = card.querySelector('a[aria-label]')?.getAttribute('aria-label') ?? '';
    return label.split(/[:,]/, 1)[0].trim().toLocaleLowerCase('fr');
  }
  if (sort.startsWith('searches-')) {
    const sources = [...card.querySelectorAll('[title]')].map((el) => el.getAttribute('title')).filter(Boolean);
    const match = sources
      .map((text) => text.match(/(\d[\d\s\u202f]*)\s+joueurs?\s+la\s+cherche(?:nt)?/i))
      .find(Boolean);
    return match ? Number(match[1].replace(/[^\d]/g, '')) : 0;
  }
  if (sort === 'owned-asc' || sort === 'owned-desc') return cardNumber(card, /×\s*([\d\s\u202f]+)/, 1);
  return cardNumber(card, /≈\s*([\d\s\u202f]+)/);
}

function sortSalesCards(section) {
  const list = section.querySelector('ul');
  if (!list || !aqmMarketSort.length) return;
  const cards = [...list.children].map((card, index) => ({ card, index }));
  cards.sort((a, b) => {
    for (const sort of aqmMarketSort) {
      const aValue = cardSortValue(a.card, sort);
      const bValue = cardSortValue(b.card, sort);
      const difference =
        typeof aValue === 'string' && typeof bValue === 'string'
          ? aValue.localeCompare(bValue, 'fr')
          : aValue - bValue;
      if (difference !== 0) return sort.endsWith('-desc') ? -difference : difference;
    }
    return a.index - b.index;
  });
  const ordered = cards.map(({ card }) => card);
  if (ordered.some((card, index) => card !== list.children[index])) list.append(...ordered);
}

function updateMarketSort(index, value) {
  aqmMarketSort = aqmMarketSort.filter((sort, i) => i !== index && sort !== value);
  if (value) aqmMarketSort[index] = value;
  aqmMarketSort = aqmMarketSort.filter(Boolean);
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

function openMarketSortMenu(anchor, index) {
  closeMarketSortMenu();
  const base = (value) => value.replace(/-(asc|desc)$/, '');
  const selected = new Set(aqmMarketSort.filter((_, i) => i !== index).map(base));
  const choices = [
    ...(index < aqmMarketSort.length ? [['', 'Aucun filtre']] : []),
    ...AQM_MARKET_SORTS.filter(([value]) => !selected.has(base(value)))
  ];
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
            const section = document.querySelector('section[aria-labelledby="sales-cards"]');
            if (section) {
              renderMarketSort(section);
              sortSalesCards(section);
            }
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

function renderMarketSort(section) {
  if (!on('marketSales')) return;
  const previousBox = section.querySelector(':scope > .aqm-market-sort');
  const max = new Set(AQM_MARKET_SORTS.map(([value]) => value.replace(/-(asc|desc)$/, ''))).size;
  const count = Math.min(aqmMarketSort.length + 1, max);
  const base = (value) => value.replace(/-(asc|desc)$/, '');
  const choices = (index) => {
    if (index >= count) return [['', 'Aucun filtre']];
    const selected = new Set(aqmMarketSort.filter((_, i) => i !== index).map(base));
    return AQM_MARKET_SORTS.filter(([value]) => !selected.has(base(value)));
  };
  const signature = JSON.stringify(Array.from({ length: count }, (_, index) => [aqmMarketSort[index] ?? '', choices(index).map(([value]) => value)]));
  if (previousBox?.dataset.aqmSortSignature === signature) return;
  const box = h(
    'div',
    { class: 'aqm-market-sort mt-2', 'data-aqm-sort-signature': signature },
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
          class: `inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${
            current ? 'bg-blue-500/25 text-white' : 'bg-white/[0.04] text-zinc-400 hover:bg-white/[0.07] hover:text-white'
          } aqm-market-sort-button`,
          'data-aqm-sort-index': index,
          onclick: (event) => openMarketSortMenu(event.currentTarget, index)
        },
        `${index + 1}. ${label}`
      );
    })
  );
  if (previousBox) previousBox.replaceWith(box);
  else {
    const first = section.firstElementChild;
    if (first) first.after(box);
    else section.append(box);
  }
}

function markSalesCards() {
  readMarketSales();
  const section = document.querySelector('section[aria-labelledby="sales-cards"]');
  if (!section) return;
  renderMarketSort(section);
  const list = section.querySelector('ul');
  const sentinel = list?.parentElement && [...list.parentElement.children].find((child) => child !== list && child.matches('div[aria-hidden="true"]'));
  if (list && sentinel && list.previousElementSibling !== sentinel) list.before(sentinel);
  sortSalesCards(section);
  for (const card of section.querySelectorAll('li')) {
    const old = card.querySelector(`[${MARKET_SALES_MARK}]`);
    if (!MARKET_SALES_PATH.test(location.pathname) || !on('marketSales') || !marketSalesKeys.has(cardSaleKey(card))) {
      old?.remove();
      continue;
    }
    if (old) continue;
    const status = card.querySelector('p.truncate');
    if (!status) {
      console.warn('[Aquaman] Impossible de trouver le statut de la carte', card);
      continue;
    }
    const mark = h('span', { class: 'font-semibold text-green-300 whitespace-nowrap', title: 'Déjà en vente', [MARKET_SALES_MARK]: '' }, 'Déjà en vente');
    status.append(mark);
  }
}

let salesCardsQueued = false;
function observeSalesCards() {
  const observer = new MutationObserver((records) => {
    if (records.every((record) => record.target.closest?.('.aqm-market-sort'))) return;
    if (salesCardsQueued) return;
    salesCardsQueued = true;
    queueMicrotask(() => {
      markSalesCards();
      salesCardsQueued = false;
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

onStart(observeSalesCards);
