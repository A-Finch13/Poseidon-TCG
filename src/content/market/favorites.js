// Aquaman, code de la page : marché, le filtre « Favoris » à côté de « Mes recherches ».

// À côté de « Mes recherches » du jeu (le marché) : un filtre « Favoris » qui ne montre que les ventes des séries
// favorites. Gardé pour l'onglet.
const MARKET_FAV_KEY = 'aqm-market-fav';
let marketFavLoading = false;
let marketFavTried = false;
const marketFavOn = () => {
  try {
    return sessionStorage.getItem(MARKET_FAV_KEY) === '1';
  } catch {
    return false;
  }
};
function markMarketFavorites() {
  if (!onMarket()) return void document.querySelectorAll('[data-aqm-unfav]').forEach((el) => el.removeAttribute('data-aqm-unfav'));
  const mine = [...document.querySelectorAll('button')].find((b) => !b.closest('.aqm-root') && /^mes recherches$/i.test(b.textContent.trim()));
  if (!mine) return;
  const on = marketFavOn();
  let chip = mine.parentElement.querySelector(':scope > .aqm-market-fav');
  if (!chip) {
    // L'aspect des pastilles du jeu non choisies (celle d'une rareté), son propre état dessiné par Aquaman.
    const plain = [...mine.parentElement.querySelectorAll('button')].find((b) => b !== mine && /^(n|r|sr|ssr|ur|sec)\s*(commune|rare|épique|légendaire|mythique|secrète)$/i.test(b.textContent.trim()));
    chip = h('button', {
      type: 'button',
      class: `${plain?.className ?? mine.className} aqm-market-fav`,
      title: 'Seulement les cartes de tes séries favorites',
      onclick: () => {
        try {
          marketFavOn() ? sessionStorage.removeItem(MARKET_FAV_KEY) : sessionStorage.setItem(MARKET_FAV_KEY, '1');
        } catch {}
        markMarketFavorites();
      }
    }, '★ Favoris');
    mine.after(chip);
  }
  chip.classList.toggle('is-on', on);
  chip.setAttribute('aria-pressed', String(on));
  if (on && (!favIds || !seriesTitles)) {
    if (!marketFavLoading && !marketFavTried) {
      marketFavLoading = true;
      marketFavTried = true; // (une fois : sans réponse, toutes les ventes restent affichées)
      loadFavIds().finally(() => {
        marketFavLoading = false;
        markMarketFavorites();
      });
    }
    return;
  }
  const titles = new Set(on ? [...favIds].map((id) => seriesTitles.get(id)).filter(Boolean) : []);
  for (const { tile, texts } of marketTiles()) tile.toggleAttribute('data-aqm-unfav', on && !tile.matches(PAGE_PARTS) && !tile.querySelector(PAGE_PARTS) && ![...texts].some((t) => titles.has(t)));
}
