// Aquaman, code de la page : collection, « En vente » à côté de chaque carte manquante que quelqu'un vend.

// ---------- collection : « En vente » à côté de chaque carte manquante que quelqu'un vend ----------
// Le marché n'est lu que pour les cartes manquantes proches de l'écran, deux à la fois ; la réponse pour une carte est
// gardée 2 minutes.

const saleOf = new Map(); // image de la carte -> { at, read: Promise<{ id, name, count } | null> }
let saleWatch = null;
function markMissingSales() {
  if (!location.pathname.startsWith('/jeu/collection')) return;
  saleWatch ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        saleWatch.unobserve(e.target);
        showSale(e.target);
      }
    },
    { rootMargin: '300px' }
  );
  for (const el of elementsWithText(document.body, /^\s*manquante\s*$/i)) {
    if (el.childElementCount || el.hasAttribute('data-aqm-sale') || !/^manquante$/i.test(el.textContent.trim())) continue;
    el.setAttribute('data-aqm-sale', '');
    saleWatch.observe(el);
  }
}

let salesReading = 0;
const salesWaiting = [];
function readSale(ask) {
  return new Promise((resolve, reject) => {
    salesWaiting.push(() => ask().then(resolve, reject));
    nextSale();
  });
}
function nextSale() {
  while (salesReading < 2 && salesWaiting.length) {
    salesReading++;
    salesWaiting
      .shift()()
      .finally(() => {
        salesReading--;
        nextSale();
      });
  }
}

async function showSale(label) {
  // La tuile de la carte : la boîte la plus proche autour de l'étiquette avec son image.
  let tile = label.parentElement;
  for (let up = 0; tile && up < 6 && !tile.querySelector('img'); up++) tile = tile.parentElement;
  const img = tile?.querySelector('img');
  const image = imageKey(img?.currentSrc || img?.getAttribute('src'));
  if (!image) return;
  const link = tile.querySelector('a[href*="/jeu/carte/"]') ?? tile.closest('a[href*="/jeu/carte/"]');
  const id = link?.getAttribute('href').match(/\/jeu\/carte\/([^/?#]+)/)?.[1];
  let sale = saleOf.get(image);
  if (!sale || Date.now() - sale.at > 120e3) {
    const series = new URLSearchParams(location.search).get('serie');
    sale = { at: Date.now(), read: readSale(() => ask({ type: 'card-sale', id: id ? decodeURIComponent(id) : null, image, name: img.alt?.trim() || null, series })) };
    saleOf.set(image, sale);
  }
  const r = await sale.read.catch(() => null);
  if (!r?.count || !label.isConnected || label.nextElementSibling?.classList.contains('aqm-sale')) return;
  // Seulement un signe : un clic passe jusqu'à la carte du jeu.
  const offers = `En vente : ${r.count} offre${r.count > 1 ? 's' : ''} au marché`;
  label.after(h('span', { class: 'aqm-root aqm-sale', title: offers }, 'En vente'));
  label.setAttribute('data-aqm-sale', 'on');
}
