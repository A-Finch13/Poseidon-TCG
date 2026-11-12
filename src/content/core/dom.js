// Aquaman, code de la page : outils de page, éléments, textes du site, images des cartes.

// ---------- outils de page ----------

// Élément avec ses attributs, ses écouteurs et ses enfants (les chaînes deviennent du texte).
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  el.setAttribute('data-aqm-add', '');
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'html') el.innerHTML = v; // seulement pour les icônes SVG de ce fichier
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

// Nœuds de texte du site sous from, sans les éléments d'Aquaman ni les fenêtres « Ma vitrine » (des centaines de
// cartes).
// Ceux de la page sont rassemblés une fois par run() et partagés par ses étapes.
let runText; // undefined : hors de run() ; null : dans run(), pas encore rassemblés
const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG']);
function textNodes(from) {
  if (from === document.body && runText) return runText;
  const nodes = [];
  const walker = document.createTreeWalker(from, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.nodeType === Node.TEXT_NODE
        ? NodeFilter.FILTER_ACCEPT
        : n !== from && (n.classList.contains('aqm-root') || vitrines.has(n) || SKIP_TEXT.has(n.tagName.toUpperCase()))
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.trim()) nodes.push(n);
  if (from === document.body && runText === null) runText = nodes;
  return nodes;
}

// Éléments du site dont un texte correspond à re.
function elementsWithText(from, re) {
  const out = [];
  for (const n of textNodes(from)) if (n.parentElement && re.test(n.nodeValue)) out.push(n.parentElement);
  return out;
}

const setText = (el, text) => el.textContent !== text && (el.setAttribute('data-aqm-edit', ''), (el.textContent = text));
const markEdit = (el) => {
  el?.setAttribute('data-aqm-edit', '');
  return el;
};
// Permet de placer un badge dans le coin d'un élément du site. Style en ligne : le site réécrit les classes de ses
// éléments (une série sélectionnée, par exemple), ce qui enlèverait une classe d'Aquaman.
function anchorBadges(el) {
  const position = getComputedStyle(el).position;
  if (el.style.position === 'relative' || (position && position !== 'static')) return;
  el.style.position = 'relative';
  el.dataset.aqmAnchor = '1';
}
const setClass = (el, cls) => el.className !== cls && (el.setAttribute('data-aqm-edit', ''), (el.className = cls));
const isVisible = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const firstVisible = (selector) => [...document.querySelectorAll(selector)].find(isVisible) ?? null;
const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

// Nom de fichier de l'image d'une carte, la même clé que card.image de l'API.
function imageKey(src) {
  if (!src) return null;
  let s = String(src);
  try {
    const u = new URL(s, location.origin);
    s = u.pathname.startsWith('/_next/image') ? u.searchParams.get('url') || '' : u.pathname;
    s = decodeURIComponent(s);
  } catch {}
  s = s.split(/[?#]/)[0];
  return s.slice(s.lastIndexOf('/') + 1) || null;
}

// Vrai pour l'image d'une carte du jeu.
function isCardImage(src) {
  let s = String(src || '');
  try {
    s = decodeURIComponent(s);
  } catch {}
  return /\/api-media\/file\/|\/api-game\/v1\/content\/|media-library\//.test(s);
}

const cardImageUrl = (image) =>
  !image ? '' : image.startsWith('content/') ? `/api-game/v1/content/${image.slice(8)}` : `/api-media/file/${image.replace(/^media-library\//, '')}`;
const avatarUrl = (id) => `/api/avatar/${encodeURIComponent(id)}`;

// Appelle fn sur les éléments, limit à la fois.
async function eachLimited(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// Lit (value undefined), écrit ou retire (value null) une entrée de sessionStorage.
function session(key, value) {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {}
  return null;
}
