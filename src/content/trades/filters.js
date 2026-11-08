// Aquaman, code de la page : échanges, les filtres « Mes recherches », « Il me manque », « Il lui manque ».

// ---------- échanges : filtres « Mes recherches », « Il me manque », « Il lui manque » ----------
// Dans la fenêtre « Proposer un échange », à côté des pastilles du jeu (Toutes, Doublons, En vente) : les filtres
// d'Aquaman, qui cachent les cartes qui ne correspondent pas, en plus de ceux du jeu (avec « Doublons » : les doublons
// qui correspondent).
// « Tu demandes » (les cartes du partenaire) : Mes recherches, Il me manque. « Tu donnes » (celles du joueur) : Il lui
// manque.
const TRADE_FILTERS = [
  { key: 'searched', label: 'Mes recherches', title: 'Seulement les cartes de ta liste de recherches', on: 'asks' },
  { key: 'mine', label: 'Il me manque', title: 'Seulement les cartes que tu n’as pas', on: 'asks' },
  { key: 'theirs', label: 'Il lui manque', title: 'Seulement les cartes que ton partenaire n’a pas', on: 'gives' }
];
const tradeOn = new Set(); // les filtres choisis, gardés tant que la page reste ouverte
let searchedKeys = null; // { at, keys: Set } les images des cartes recherchées
let partner = null; // { name, at, state: 'loading' | 'ok' | 'private' | 'unknown', byImage }
let tradeLoading = false;
let tradeAskedAt = 0;
const tradeTiles = new WeakMap(); // image -> sa tuile dans la grille

// La fenêtre d'un échange en cours : ses pastilles, et le côté affiché (gives : « Tu donnes »).
function tradeWindow() {
  const doubles = [...document.querySelectorAll('button')].find((b) => !b.closest('.aqm-root') && /^doublons\b/i.test(b.textContent.trim()));
  const chips = doubles?.parentElement;
  if (!chips || ![...chips.querySelectorAll('button')].some((b) => /^toutes$/i.test(b.textContent.trim()))) return null;
  const tabText = (b) => b.textContent.trim().toLowerCase();
  for (let box = chips.parentElement, up = 0; box && box !== document.body && up < 10; box = box.parentElement, up++) {
    const tabs = [...box.querySelectorAll('button, [role="tab"]')].filter((b) => /^(tu donnes|tu demandes|perles et mot)$/.test(tabText(b)));
    const gives = tabs.find((b) => tabText(b) === 'tu donnes');
    const asks = tabs.find((b) => tabText(b) === 'tu demandes');
    if (!gives || !asks) continue;
    // L'onglet affiché : celui marqué comme tel, sinon celui dessiné autrement que les autres.
    const marked = tabs.find((b) => b.getAttribute('aria-selected') === 'true' || b.getAttribute('data-state') === 'active' || b.getAttribute('aria-pressed') === 'true');
    const odd = tabs.find((b) => tabs.filter((x) => x.className === b.className).length === 1);
    const shown = marked ?? (tabs.length > 2 ? odd : null);
    if (!shown) return null;
    return { box, chips, side: shown === gives ? 'gives' : shown === asks ? 'asks' : null };
  }
  return null;
}

// Le nom du partenaire : « Avec Towntter » en haut de la fenêtre.
function tradePartnerName(box) {
  for (const el of box.querySelectorAll('p, span, div, h2, h3')) {
    const text = el.textContent.trim();
    if (text.length > 80 || el.children.length > 3) continue;
    const m = text.match(/^avec\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  return null;
}

async function loadTradeData(name) {
  if (tradeLoading) return;
  tradeLoading = true;
  try {
    const jobs = [];
    if (tradeOn.has('searched') && (!searchedKeys || Date.now() - searchedKeys.at > 60e3))
      jobs.push(
        ask({ type: 'searched-images' })
          .then((r) => (searchedKeys = { at: Date.now(), keys: new Set(r.keys ?? []) }))
          .catch(() => (searchedKeys = { at: Date.now(), keys: new Set() }))
      );
    if (tradeOn.has('mine')) jobs.push(ownedByImage().catch(() => null));
    if (tradeOn.has('theirs') && name && (partner?.name !== name || Date.now() - partner.at > 5 * 60e3)) {
      partner = { name, at: Date.now(), state: 'loading', byImage: null };
      jobs.push(
        ask({ type: 'player-ownership', id: playersSeen.get(foldName(name)) ?? null, name })
          .then((r) => {
            if (partner?.name !== name) return;
            partner.state = !r.found ? 'unknown' : r.private ? 'private' : 'ok';
            partner.byImage = r.byImage ?? null;
          })
          .catch(() => partner?.name === name && (partner.state = 'unknown'))
      );
    }
    await Promise.all(jobs);
  } finally {
    tradeLoading = false;
  }
}

function markTradeFilters() {
  const win = tradeWindow();
  if (!win) {
    if (!document.querySelector('.aqm-trade-filter')) return;
    document.querySelectorAll('.aqm-trade-filter').forEach((el) => el.remove());
    document.querySelectorAll('[data-aqm-tradehide]').forEach((el) => el.removeAttribute('data-aqm-tradehide'));
    return;
  }
  const { box, chips, side } = win;
  const name = tradePartnerName(box);
  // Les pastilles de ce côté, après celles du jeu.
  const plain = [...chips.querySelectorAll('button')].find((b) => !b.classList.contains('aqm-trade-filter') && /^doublons\b/i.test(b.textContent.trim()));
  for (const f of TRADE_FILTERS) {
    let chip = chips.querySelector(`:scope > .aqm-trade-filter[data-key="${f.key}"]`);
    if (f.on !== side) {
      chip?.remove();
      continue;
    }
    if (!chip) {
      chip = h(
        'button',
        {
          type: 'button',
          class: `${plain?.className ?? ''} aqm-trade-filter`,
          'data-key': f.key,
          onclick: () => {
            tradeOn.has(f.key) ? tradeOn.delete(f.key) : tradeOn.add(f.key);
            markTradeFilters();
          }
        },
        f.label
      );
      chips.append(chip);
    }
    const isOn = tradeOn.has(f.key);
    chip.classList.toggle('is-on', isOn);
    chip.setAttribute('aria-pressed', String(isOn));
    const state = f.key === 'theirs' && isOn ? partner?.state : null;
    const title = state === 'private' ? `${f.title} : sa collection est privée, rien n’est masqué.` : state === 'unknown' ? `${f.title} : Aquaman n’a pas trouvé ${name ?? 'ce joueur'}, rien n’est masqué.` : f.title;
    if (chip.title !== title) chip.title = title;
    chip.classList.toggle('is-off', state === 'private' || state === 'unknown');
  }

  // Les filtres de ce côté, avec ce dont ils ont besoin.
  const active = TRADE_FILTERS.filter((f) => f.on === side && tradeOn.has(f.key)).map((f) => f.key);
  const mine = owned && Date.now() - owned.at < 30e3 ? owned.byImage : null;
  const needs =
    (active.includes('searched') && (!searchedKeys || Date.now() - searchedKeys.at > 60e3)) ||
    (active.includes('mine') && !mine) ||
    (active.includes('theirs') && name && (partner?.name !== name || Date.now() - partner.at > 5 * 60e3));
  // (une fois toutes les 5 s au plus : une réponse qui ne vient pas ne redemande pas à chaque changement de la page)
  if (needs && Date.now() - tradeAskedAt > 5000) {
    tradeAskedAt = Date.now();
    loadTradeData(name).then(() => !stopped && markTradeFilters());
  }
  const tests = [];
  if (active.includes('searched') && searchedKeys) tests.push((key) => searchedKeys.keys.has(key));
  if (active.includes('mine') && mine) tests.push((key) => !mine[key]);
  if (active.includes('theirs') && partner?.name === name && partner.state === 'ok') tests.push((key) => !partner.byImage[key]);

  // Les cartes de la grille : la tuile de chaque image (sa plus grande boîte qui ne contient qu'elle), cachée quand un
  // filtre dit non.
  for (const img of box.querySelectorAll('img')) {
    const src = img.currentSrc || img.src;
    // (seulement la grille sous les pastilles : ni l'image du partenaire, ni les cartes déjà mises dans l'échange
    // au-dessus)
    if (img.closest('.aqm-root') || !(chips.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING) || chips.contains(img) || !isCardImage(src)) continue;
    let tile = tradeTiles.get(img);
    if (!tile?.isConnected || !tile.contains(img)) {
      tile = img;
      while (tile.parentElement && tile.parentElement !== box && tile.parentElement.querySelectorAll('img').length === 1) tile = tile.parentElement;
      tradeTiles.set(img, tile);
    }
    const key = imageKey(src);
    const hide = !!tests.length && !!key && !tests.every((t) => t(key));
    if (tile.hasAttribute('data-aqm-tradehide') !== hide) tile.toggleAttribute('data-aqm-tradehide', hide);
  }
}
