// Aquaman, code de la page : marché, les autres ventes d'une carte qu'on vient d'acheter sont cachées.

// Le marché : une fois une carte achetée, ses autres ventes sont cachées pour de bon (le joueur l'a maintenant),
// gardées dans le stockage d'Aquaman.
const BOUGHT_KEY = 'marketBought';
// (la liste du marché seulement : /jeu/marche/{carte} montre les ventes d'une carte sous son titre, elles partiraient
// toutes)
const onMarket = () => /^\/jeu\/marche\/?$/.test(location.pathname);
const PAGE_PARTS = 'main, nav, header, footer, h1, [role="dialog"], [role="alertdialog"], dialog';
// Les cartes achetées : « rareté|nom » en minuscules (le code de la rareté : n, r, sr, ssr, ur, sec), le même
// personnage dans une autre rareté reste affiché. (Un nom seul : gardé par les premiers jours de cette fonction, toute
// rareté.)
const boughtNames = new Set();
onStart(async () => {
  try {
    for (const key of (await chrome.storage.local.get(BOUGHT_KEY))[BOUGHT_KEY] ?? []) boughtNames.add(key);
  } catch {}
  hideBoughtCards();
});
function addBought(name, rarity) {
  const code = RANKED.includes(rarity) ? rarity.toLowerCase() : '';
  boughtNames.add(code ? `${code}|${name.trim().toLowerCase()}` : name.trim().toLowerCase());
  try {
    chrome.storage.local.set({ [BOUGHT_KEY]: [...boughtNames] });
  } catch {}
  pushMarket(); // vers les autres appareils du joueur
  hideBoughtCards();
}
const BUY_BUTTON = /^(acheter|confirmer|trop cher)$/i;
// Les ventes affichées par le marché : chacune est la boîte la plus haute autour de son « Acheter » qui ne contient
// aucune autre vente, avec ses textes en minuscules (le nom de la carte, sa série, sa rareté telle que l'écrit le jeu :
// « N » et « Commune »).
// (les boîtes sont comptées en un passage, les textes lus seulement pour les tuiles qui en ont besoin)
// Seulement sur la page du marché, jamais dans une fenêtre (le « Confirmer » du jeu), et une tuile ne remonte jamais
// jusqu'à une boîte qui contient le titre, le menu ou la partie principale de la page : sur la page d'une carte, un «
// Acheter » seul faisait de toute la page une « vente », cachée une fois cette carte achetée (une page noire).
function marketTiles() {
  if (!onMarket()) return [];
  const buys = [...document.querySelectorAll('button')].filter((b) => !b.closest('.aqm-root, [role="dialog"], [role="alertdialog"], dialog') && BUY_BUTTON.test(b.textContent.trim()));
  const held = new Map();
  for (const b of buys) for (let el = b.parentElement; el && el !== document.body; el = el.parentElement) held.set(el, (held.get(el) ?? 0) + 1);
  return buys.map((b) => {
    let tile = b;
    while (tile.parentElement && tile.parentElement !== document.body && held.get(tile.parentElement) === 1 && !tile.parentElement.matches(PAGE_PARTS) && !tile.parentElement.querySelector(PAGE_PARTS)) tile = tile.parentElement;
    let texts = null;
    return {
      tile,
      get texts() {
        return (texts ??= new Set([...tile.querySelectorAll('*')].filter((el) => !el.childElementCount).map((el) => el.textContent.trim().toLowerCase())));
      }
    };
  });
}

function hideBoughtCards() {
  // (les ventes cachées sur une page quittée sont réaffichées : le jeu peut garder ses boîtes d'une page à l'autre)
  if (!onMarket()) return void document.querySelectorAll('[data-aqm-bought]').forEach((el) => el.removeAttribute('data-aqm-bought'));
  if (!on('hideBought') || !boughtNames.size) return;
  for (const t of marketTiles()) {
    const { tile } = t;
    if (tile.hasAttribute('data-aqm-bought') || tile.matches(PAGE_PARTS) || tile.querySelector(PAGE_PARTS)) continue;
    const { texts } = t;
    const rarity = RANKED.find((code) => texts.has(code.toLowerCase()) || texts.has(RARITY_NAMES[code].toLowerCase()))?.toLowerCase();
    const hidden = [...texts].some((t) => boughtNames.has(t) || (rarity && boughtNames.has(`${rarity}|${t}`)));
    if (hidden) tile.setAttribute('data-aqm-bought', '');
  }
}
