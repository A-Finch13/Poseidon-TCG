// Aquaman, code de la page : accueil, les boosters de chaque sorte, leurs piles copiées sur celle du jeu.

// ---------- accueil : les boosters de chaque sorte, côte à côte ----------
// « Tout ouvrir » ouvre tous les boosters en attente. Quand ils sont de plusieurs sortes (Classique, Magie…), la pile
// du jeu est dessinée une fois par sorte et montrée côte à côte, chacune avec les boutons « Ouvrir » et « Tout ouvrir »
// du jeu : inject.js ne donne au jeu que les boosters d'une sorte (sessionStorage) et demande à son store de les
// relire, Aquaman copie ce que le jeu a dessiné. Un clic sur un bouton copié met le jeu sur cette sorte et clique sur
// son vrai bouton, avec son animation ; ensuite les copies sont redessinées et le jeu retrouve tous ses boosters.

const KIND_KEY = 'aqm-booster-kind';
let pendingBoosters = null; // [{ id, kind, name, art }], tous les boosters en attente (inject.js)
let boostersAsked = false;
let piles = null; // { sig, shots: [{ key, name, count, pile, buttons }] }, les copies affichées
let drawing = false; // les copies sont en train d'être dessinées
let opening = false; // un clic sur un bouton copié : le jeu ouvre, les copies attendent
let homeParts = null; // { pile, buttons } du jeu, gardés une fois cachés

const setKind = (key) => {
  try {
    key ? sessionStorage.setItem(KIND_KEY, key) : sessionStorage.removeItem(KIND_KEY);
    return true;
  } catch {
    return false;
  }
};

// Met le jeu sur une sorte ('' pour toutes) et attend qu'il l'ait dessinée ; false quand son store est injoignable.
let refreshId = 0;
const refreshed = new Map();
// fresh : le jeu redessine sa pile (son image est choisie quand la pile apparaît), pour une copie ou une ouverture.
// reload : le jeu relit ses boosters depuis le serveur (après une ouverture). items : boosters fabriqués pour le relevé
// de l'auteur (une sorte à chaque fois).
function showKind(key, fresh = false, reload = false, items = null) {
  if (!setKind(key)) return Promise.resolve(false);
  const id = ++refreshId;
  return new Promise((resolve) => {
    const done = (ok) => {
      refreshed.delete(id);
      // Deux images et un moment pour que React dessine la pile et que les images arrivent.
      if (ok) requestAnimationFrame(() => requestAnimationFrame(() => pileStill().then(() => resolve(true))));
      else resolve(false);
    };
    refreshed.set(id, done);
    setTimeout(() => refreshed.get(id)?.(false), 4000);
    window.postMessage({ aquamanCmd: 'refresh-boosters', id, kind: key, fresh, reload, items }, location.origin);
  });
}
const onBoostersRefreshed = (id, ok) => refreshed.get(id)?.(ok);

// Les boosters en attente par sorte, dans l'ordre du jeu.
function boosterKinds() {
  const kinds = new Map();
  for (const b of pendingBoosters ?? []) {
    const key = b.kind ?? 'classic';
    if (!kinds.has(key)) kinds.set(key, { key, name: b.name ?? 'Classique', art: b.art ?? null, count: 0 });
    kinds.get(key).count++;
  }
  return [...kinds.values()];
}

// La pile de boosters du jeu (la grande boîte au-dessus de ses boutons, dans celle qui contient aussi le titre « 4 à
// ouvrir » s'il le faut) et sa rangée de boutons.
function findHomeParts() {
  if (homeParts?.pile.isConnected && homeParts.buttons.isConnected) return homeParts;
  // « Tout ouvrir », ou « Ouvrir » seul quand il y a un booster.
  const own = [...document.querySelectorAll('button')].filter((b) => !b.closest('.aqm-root'));
  const all = own.find((b) => /^tout ouvrir/i.test(b.textContent.trim())) ?? own.find((b) => /^ouvrir$/i.test(b.textContent.trim()));
  if (!all) return null;
  const buttons = all.parentElement;
  const TITLE = /à ouvrir/i;
  const big = (el) => !el.classList.contains('aqm-root') && el.getBoundingClientRect().height > 120;
  for (let el = buttons, up = 0; el && el !== document.body && up < 6; el = el.parentElement, up++)
    for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
      if (!big(sib)) continue;
      if (!TITLE.test(sib.textContent)) return (homeParts = { pile: sib, buttons });
      for (let box = sib; box; ) {
        const kids = [...box.children].reverse();
        const pile = kids.find((c) => big(c) && !TITLE.test(c.textContent));
        if (pile) return (homeParts = { pile, buttons });
        box = kids.find((c) => big(c) && TITLE.test(c.textContent)) ?? null;
      }
      return null;
    }
  return null;
}

// Une copie de ce que le jeu a dessiné, sans les ids.
function copyOf(el) {
  const copy = el.cloneNode(true);
  for (const x of [copy, ...copy.querySelectorAll('[id]')]) x.removeAttribute('id');
  copy.removeAttribute('data-aqm-hidden');
  // Ce qui reste d'une animation d'entrée (un flou). Les opacités restent : un booster empile des couches que le jeu
  // cache (un booster à thème garde les vagues du classique, invisibles, par-dessus sa propre image).
  for (const x of [copy, ...copy.querySelectorAll('[style]')]) if (/blur/.test(x.style.filter)) x.style.filter = '';
  return copy;
}

// Les copies des piles, gardées pour de bon dans le stockage d'Aquaman (conservées quand les données du site sont
// effacées), une par sorte quel que soit le nombre de ses boosters : montrées tout de suite, avec leurs nombres remis à
// jour. Les boutons du jeu sont gardés tels qu'ils étaient avec plusieurs boosters (« Ouvrir » et « Tout ouvrir »),
// pour quand il y en aura de nouveau plusieurs. Lues une fois au démarrage d'Aquaman (shotStore reste null jusque-là).
const SHOTS_KEY = 'boosterPiles';
const KIND_ID = /^[A-Za-z0-9_-]{1,64}$/;
// Les formes d'une pile : 1, 2, et 3 boosters et plus ; les dessins de l'auteur sont gardés par sorte et par forme.
const SHAPES = [1, 2, 3];
const shapeKey = (kind, count) => `${kind}--n${Math.min(Math.max(count, 1), 3)}`;
const SHOTS_V = 9; // les dessins d'une pile que le jeu a dessinée lui-même (load) pour sa sorte et sa forme, avec son image
const ALL_BUTTON = /^tout ouvrir/i;
const hasAllButton = (buttons) => [...buttons.querySelectorAll('button')].some((b) => ALL_BUTTON.test(b.textContent.trim()));
let shotStore = null;
const readShotStore = () => shotStore ?? {};

async function loadShotStore() {
  let kept = {};
  try {
    kept = (await chrome.storage.local.get(SHOTS_KEY))[SHOTS_KEY] ?? {};
    // Les copies de la version précédente, gardées par le site (localStorage).
    const old = JSON.parse(localStorage.getItem('aqm-booster-piles') || 'null');
    if (old) {
      kept = { ...old, ...kept };
      localStorage.removeItem('aqm-booster-piles');
      chrome.storage.local.set({ [SHOTS_KEY]: kept });
    }
  } catch {}
  shotStore = kept;
  loadGlobalPacks();
}

// Les dessins de chaque sorte publiés par l'auteur (relais) : utilisés en premier, ils sont aussi gardés ici pour les
// prochains démarrages, et relus depuis le relais à chaque fois.
const GLOBAL_KEY = 'globalPacks';
let globalStore = {};
async function loadGlobalPacks() {
  try {
    globalStore = (await chrome.storage.local.get(GLOBAL_KEY))[GLOBAL_KEY] ?? {};
  } catch {}
  const res = await send({ type: 'packs-global' });
  const fresh = res?.packs;
  if (!fresh || typeof fresh !== 'object' || JSON.stringify(fresh) === JSON.stringify(globalStore)) return;
  globalStore = fresh;
  try {
    chrome.storage.local.set({ [GLOBAL_KEY]: globalStore });
  } catch {}
  piles = null; // redessiné avec les dessins publiés
  markBoosterKinds();
}

function saveShots(shots) {
  shotStore = { ...readShotStore() };
  // Un dessin par sorte et par forme de pile (1, 2, 3 boosters et plus) : le jeu dessine chaque forme une fois.
  for (const shot of shots)
    shotStore[shapeKey(shot.key, shot.count)] = { v: SHOTS_V, pile: shot.pile.outerHTML, buttons: shot.buttons.outerHTML, many: null, at: Date.now() };
  try {
    chrome.storage.local.set({ [SHOTS_KEY]: shotStore });
  } catch {}
}

// Éléments tirés d'un HTML gardé : le dessin du jeu, mais il peut revenir du relais, où tout le monde peut écrire, donc
// seul ce qui dessine est gardé : balises et attributs connus, images du site seulement, styles sans adresse
// extérieure.
const SAFE_TAGS = new Set(['div', 'span', 'p', 'strong', 'small', 'b', 'i', 'em', 'button', 'img', 'picture', 'source', 'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'filter', 'fegaussianblur', 'feturbulence', 'fecolormatrix', 'feblend', 'fecomposite', 'feoffset', 'feflood', 'femerge', 'femergenode', 'fedisplacementmap', 'text', 'tspan']);
const SAFE_ATTRS = /^(class|style|alt|role|title|type|disabled|width|height|viewbox|d|fill|stroke|stroke-[a-z-]+|fill-[a-z-]+|clip-[a-z-]+|opacity|transform|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|points|offset|stop-color|stop-opacity|gradientunits|gradienttransform|patternunits|preserveaspectratio|xmlns|loading|decoding|sizes|stddeviation|basefrequency|numoctaves|seed|in|in2|result|mode|operator|values|scale|dx|dy|flood-color|flood-opacity|text-anchor|font-[a-z-]+|letter-spacing|mask|filter|aria-[a-z-]+|data-[a-z0-9-]+)$/i;
const siteUrl = (v) => /^\/(?!\/)/.test(v) || v.startsWith(`${location.origin}/`);
// Un style dont toutes les adresses sont du site (ou du dessin lui-même : « #… ») ; un pack à thème y garde son image.
const siteStyle = (v) => {
  if (/expression|javascript:/i.test(v)) return false;
  const urls = [...v.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].map((m) => m[2].trim());
  return urls.length === (v.match(/url\(/gi) ?? []).length && urls.every((u) => u.startsWith('#') || siteUrl(u));
};
function fromHtml(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const el = t.content.firstElementChild;
  if (!el) return null;
  for (const x of [...el.querySelectorAll('*')].reverse()) if (!SAFE_TAGS.has(x.tagName.toLowerCase())) x.remove();
  if (!SAFE_TAGS.has(el.tagName.toLowerCase())) return null;
  for (const x of [el, ...el.querySelectorAll('*')])
    for (const a of [...x.attributes]) {
      const name = a.name.toLowerCase();
      const value = a.value;
      const ok =
        name === 'src'
          ? siteUrl(value)
          : name === 'srcset'
            ? value.split(',').every((part) => siteUrl(part.trim().split(/\s+/)[0] ?? ''))
            : name === 'style' || name === 'filter' || name === 'mask' || name === 'fill' || name === 'stroke'
              ? siteStyle(value)
              : SAFE_ATTRS.test(name);
      if (!ok) x.removeAttribute(a.name);
    }
  return el;
}

// L'image d'un pack à thème, telle que le jeu la pose sur chacun de ses boosters (--pack-art) : remise dans un dessin
// fait sans elle (une copie de la pile d'un autre pack, un dessin plus ancien).
function setPackArt(el, art) {
  if (!el || !art || !siteUrl(art)) return el;
  for (const x of packBoxes(el)) x.style.setProperty('--pack-art', `url('${art.replace(/['()\\]/g, encodeURIComponent)}')`);
  return el;
}
// Les boosters dessinés par le jeu dans un élément : leurs boîtes 3D (la classe qui finit par « __pack »), chacune avec
// ses faces.
const packBoxes = (el) => [el, ...el.querySelectorAll('[class]')].filter((x) => [...x.classList].some((c) => /__pack$/.test(c)));
const packArtHtml = (html, art) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  setPackArt(t.content.firstElementChild, art);
  return t.innerHTML;
};

// Le nombre écrit par le jeu (le « ×5 » de la pile, le « Tout ouvrir ×5 » du bouton), mis à n.
function setCount(el, n) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) if (/[×x]\s?\d+/.test(t.nodeValue)) t.nodeValue = t.nodeValue.replace(/([×x]\s?)\d+/, `$1${n}`);
  return el;
}

// Les copies gardées de chaque sorte, ou null quand il en manque une.
function cachedShots(kinds) {
  const all = readShotStore();
  const shots = [];
  for (const k of kinds) {
    // Le dessin de cette sorte avec cette forme de pile : celui publié par l'auteur d'abord, sinon celui de ce joueur ;
    // seulement les actuels (SHOTS_V) : les plus anciens sont redessinés.
    const key = shapeKey(k.key, k.count);
    // (le dessin de ce joueur d'abord : le jeu l'a fait à partir de ses vrais boosters ; celui publié complète)
    const kept = all[key]?.v === SHOTS_V ? all[key] : globalStore[key]?.v === SHOTS_V ? globalStore[key] : null;
    const pile = kept && fromHtml(kept.pile);
    const buttons = kept && fromHtml(kept.buttons);
    if (!pile || !buttons) return null;
    shots.push({ ...k, pile: setCount(setPackArt(pile, k.art), k.count), buttons: setCount(buttons, k.count) });
  }
  return shots;
}

// Les images affichées dans un élément (ses images, ses fonds), par nom de fichier.
function pictureFiles(el) {
  const files = new Set();
  for (const x of [el, ...el.querySelectorAll('*')]) {
    const src = x.tagName === 'IMG' ? x.currentSrc || x.getAttribute('src') : getComputedStyle(x).backgroundImage.match(/url\(["']?([^"')]+)/)?.[1];
    const file = src ? decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() || '') : '';
    // next/image : le fichier est dans le paramètre « url ».
    const inner = src?.includes('url=') ? decodeURIComponent(new URL(src, location.href).searchParams.get('url') ?? '').split('/').pop() : '';
    if (file) files.add(file);
    if (inner) files.add(inner);
  }
  return files;
}

// Vrai quand la pile du jeu montre les boosters de cette sorte : sa propre image (Magie…), ou aucune des images des
// autres sortes pour les classiques.
function pileShows(pile, k, kinds) {
  if (!pile) return false;
  const files = pictureFiles(pile);
  const fileOf = (art) => art.split(/[?#]/)[0].split('/').pop();
  if (k.art) {
    if (!files.has(fileOf(k.art))) return false;
    // Son image chargée (jusque-là le jeu montre les vagues du classique à sa place).
    const imgs = [...pile.querySelectorAll('img')].filter((img) => (img.currentSrc || img.getAttribute('src') || '').includes(fileOf(k.art)));
    return !imgs.length || imgs.some((img) => img.complete && img.naturalWidth > 0);
  }
  return !kinds.some((x) => x.art && files.has(fileOf(x.art)));
}

// Attend que la pile du jeu ne bouge plus (ses animations écrivent des styles en ligne), 1,2 s au plus.
async function pileStill() {
  const look = () => {
    const pile = findHomeParts()?.pile;
    return pile ? [...pile.querySelectorAll('[style]')].map((x) => x.getAttribute('style')).join('|') + pile.childElementCount : '';
  };
  let last = look();
  for (let still = 0, t = 0; still < 2 && t < 20; t++) {
    await pause(60);
    const now = look();
    still = now === last ? still + 1 : 0;
    last = now;
  }
}

// Cache la pile et les boutons du jeu (les piles d'Aquaman prennent leur place).
function hideHome() {
  const parts = findHomeParts();
  parts?.pile.setAttribute('data-aqm-hidden', '');
  parts?.buttons.setAttribute('data-aqm-hidden', '');
  return parts;
}

// Vrai tant que le jeu montre quelque chose par-dessus la page (l'ouverture d'un booster, une fenêtre).
const gameBusy = () =>
  !!document.querySelector('[role="dialog"]:not(.aqm-root *), [aria-modal="true"]:not(.aqm-root *)') ||
  (!overlay && [document.body, document.documentElement].some((el) => getComputedStyle(el).overflow === 'hidden'));

// Dessine la pile du jeu pour chaque sorte, puis remet le jeu sur tous ses boosters.
async function drawPiles(kinds, sig) {
  drawing = true;
  const title = [...document.querySelectorAll('h1, h2, h3')].find((t) => !t.closest('.aqm-root') && /à ouvrir/i.test(t.textContent));
  title?.setAttribute('data-aqm-veiled', ''); // son nombre suit la sorte en cours de dessin
  hideHome(); // la pile du jeu change de sorte entre-temps
  const shots = [];
  try {
    for (const k of kinds) {
      // Sans le store du jeu (ou sa pile), la page du jeu reste telle quelle.
      if (stopped || !(await showKind(k.key, true))) return void (piles = { sig, shots: null });
      hideHome(); // le jeu a redessiné sa pile
      // Le jeu peut changer les textes avant l'image : la copie attend l'image propre à la sorte, chargée (5 s au
      // plus).
      let right = false;
      for (let t = 0; t < 84 && !(right = pileShows(findHomeParts()?.pile, k, kinds)); t++) await pause(60);
      if (right) await pause(400).then(pileStill); // (le fondu du jeu des vagues vers l'image du pack)
      const parts = findHomeParts();
      if (!parts) return void (piles = { sig, shots: null });
      shots.push({ ...k, pile: copyOf(parts.pile), buttons: copyOf(parts.buttons), right: pileShows(parts.pile, k, kinds) });
    }
    piles = { sig, shots };
    saveShots(shots.filter((shot) => shot.right)); // un dessin faux est montré cette fois-ci, jamais gardé
  } finally {
    await showKind('');
    await unveilTitle(title);
    drawing = false;
  }
  markBoosterKinds();
}

// Un clic sur un bouton copié : le jeu est mis sur cette sorte, puis son propre bouton est cliqué.
