// Aquaman, code de la page : échanges, une pastille possédée / manquante sur les cartes.

// ---------- échanges : une pastille possédée / manquante ----------

let owned = null; // { at, byImage }
let tradesBusy = false;
let cardImages = null; // { at, keys: Set | null } : clés d'image du catalogue du jeu, pour distinguer les cartes des avatars

// Pages qui montrent des échanges : celles du jeu et les messages privés, où une proposition est envoyée en pièce
// jointe.
const TRADE_PAGES = /^\/(jeu\/echanges|messages)(\/|$)/;

async function catalogImages() {
  if (cardImages && Date.now() - cardImages.at < 30 * 60e3) return cardImages.keys;
  const res = await ask({ type: 'card-images' });
  cardImages = { at: Date.now(), keys: res.keys ? new Set(res.keys) : null };
  return cardImages.keys;
}

// Exemplaires possédés par clé d'image, gardés 30 secondes.
async function ownedByImage() {
  if (owned && Date.now() - owned.at < 30e3) return owned.byImage;
  const res = await ask({ type: 'ownership' });
  owned = { at: Date.now(), byImage: res.byImage };
  return owned.byImage;
}

// Ce que montre déjà chaque carte d'un échange (« image|exemplaires|donne ») : seules les nouvelles ou celles changées
// sont refaites.
const tradeDone = new WeakMap();

async function markTrades() {
  if (tradesBusy) return;
  const labels = elementsWithText(document.body, /^\s*tu (re[çc]ois|donnes)\s*:?\s*$/i);
  const everyCard = TRADE_PAGES.test(location.pathname);
  if (!labels.length && !everyCard) return;
  tradesBusy = true;
  try {
    const [byImage, known] = await Promise.all([ownedByImage(), everyCard ? catalogImages().catch(() => null) : null]);
    if (stopped) return;
    const todo = [];
    const seen = new Set();
    const add = (img, box, gives) => {
      seen.add(img);
      const src = img.currentSrc || img.src;
      const frame = img.parentElement;
      if (!frame || !isCardImage(src) || img.closest('.aqm-root')) return;
      const key = imageKey(src);
      const n = byImage[key] ?? 0;
      // Hors d'un bloc « Tu reçois / Tu donnes », seule une image du catalogue (ou une carte possédée) est une carte :
      // pas un avatar.
      if (!box && !n && !known?.has(key)) return;
      const done = `${key}|${n}|${gives}`;
      if (tradeDone.get(img) === done && frame.querySelector(':scope > .aqm-dot')) return;
      todo.push({ img, frame, box, n, gives, done });
    };
    for (const label of labels) {
      if (!label.isConnected) continue;
      const gives = /donnes/i.test(label.textContent);
      let box = label.parentElement;
      while (box && box !== document.body && !box.querySelector('img')) box = box.parentElement;
      if (!box || box === document.body) continue;
      for (const img of box.querySelectorAll('img')) add(img, box, gives);
    }
    // Une proposition dans les messages, ou une page d'échanges disposée sans ces mots : chaque carte reçoit sa
    // pastille.
    if (everyCard) for (const img of document.body.querySelectorAll('img')) if (!seen.has(img)) add(img, null, null);
    // Les styles sont tous lus d'abord, puis la page est modifiée : une lecture après chaque changement faisait
    // recalculer au navigateur la mise en page de tout l'échange une fois par carte, ce qui figeait la page.
    for (const t of todo) t.anchor = t.frame.style.position !== 'relative' && getComputedStyle(t.frame).position === 'static';
    for (const { img, frame, box, n, gives, done, anchor } of todo) {
      let tile = frame;
      while (box && tile.parentElement && tile.parentElement !== box && tile.parentElement.querySelectorAll('img').length === 1) tile = tile.parentElement;
      markEdit(tile).classList.add('aqm-trade-tile');
      if (anchor) {
        markEdit(frame).style.position = 'relative';
        frame.dataset.aqmAnchor = '1';
      }
      tradeDone.set(img, done);
      let dot = frame.querySelector(':scope > .aqm-dot');
      if (!dot) dot = frame.appendChild(h('span', { class: 'aqm-root aqm-dot' }));
      setClass(dot, `aqm-root aqm-dot ${n ? 'is-yes' : 'is-no'}`);
      setText(dot, '');
      const title = !n
        ? 'Tu n’as pas cette carte'
        : `Tu l’as (${n} exemplaire${n > 1 ? 's' : ''})`;
      if (dot.title !== title) markEdit(dot).title = title;
    }
  } catch (e) {
    console.warn('[Aquaman] échanges :', e);
  } finally {
    tradesBusy = false;
  }
}
