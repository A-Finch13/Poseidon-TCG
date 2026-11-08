// Aquaman, code de la page : collection, l'onglet « Manquantes ».

// ---------- collection : un onglet « Manquantes » à côté de « Mes cartes / Mes doublons / Album complet » ----------
// Il montre l'album complet avec seulement les cartes marquées « Manquante » par le jeu ; le choix est gardé pour
// l'onglet.

// Seulement avec « Album complet ». Gardé pour l'onglet : de retour sur la collection (après un achat depuis la page
// d'une carte, qui recharge la page…), « Album complet » est choisi de nouveau et le filtre reprend.
const VIEW_TABS = /^(mes cartes|mes doublons|album complet)$/i;
const MISSING_KEY = 'aqm-missing-only';
let missingOn = (() => {
  try {
    return sessionStorage.getItem(MISSING_KEY) === '1';
  } catch {
    return false;
  }
})();
let missingAt = 0; // quand il a été activé : le jeu met un moment à afficher « Album complet »
let missingVisit = -1; // la visite de la page où « Album complet » a été remis
const missingOnly = () => missingOn;
const setMissingOnly = (on) => {
  missingOn = on;
  missingAt = on ? Date.now() : 0;
  filteredSize = -1;
  try {
    on ? sessionStorage.setItem(MISSING_KEY, '1') : sessionStorage.removeItem(MISSING_KEY);
  } catch {}
};

// Un onglet du jeu choisi par le joueur : le filtre s'arrête.
let clickingFull = false;
onStart(() => {
  addEventListener(
    'click',
    (e) => {
      const b = e.target.closest?.('button');
      if (!b || clickingFull || b.closest('.aqm-root') || b.classList.contains('aqm-missing-tab') || !VIEW_TABS.test(b.textContent.trim())) return;
      setMissingOnly(false);
      setTimeout(markMissingTab, 50);
    },
    true
  );
});

function markMissingTab() {
  if (!location.pathname.startsWith('/jeu/collection')) return;
  const tabs = [...document.querySelectorAll('button')].filter((b) => !b.closest('.aqm-root') && VIEW_TABS.test(b.textContent.trim()));
  const full = tabs.find((b) => /^album complet$/i.test(b.textContent.trim()));
  if (!full) return;
  // L'onglet sélectionné du jeu est celui dont l'aspect diffère des autres.
  const looks = tabs.map((b) => b.className);
  const selected = tabs.find((b) => looks.filter((c) => c === b.className).length === 1 && tabs.length > 2) ?? full;
  // Le filtre gardé, à une nouvelle visite de la page : « Album complet » est choisi de nouveau (une fois par visite).
  if (missingOn && missingVisit !== pageVisit) {
    missingVisit = pageVisit;
    missingAt = Date.now();
    if (selected !== full) {
      clickingFull = true;
      full.click();
      clickingFull = false;
    }
  }
  if (missingOn && selected !== full && Date.now() - missingAt > 2000) setMissingOnly(false); // une autre vue du jeu
  const on = missingOnly();
  const plain = tabs.find((b) => b !== selected) ?? full;
  let tab = full.parentElement.querySelector(':scope > .aqm-missing-tab');
  if (!tab) {
    tab = h('button', {
      type: 'button',
      onclick: () => {
        const now = !missingOnly();
        setMissingOnly(now);
        if (now && selected !== full) {
          clickingFull = true; // pas un choix du joueur : le filtre reste
          full.click();
          clickingFull = false;
        }
        markMissingTab();
      }
    });
    full.after(tab);
  }
  // Le jeu montre son onglet sélectionné avec une pastille dedans (une boîte posée sur l'onglet) : tant que le filtre
  // est actif, la pastille de « Album complet » est cachée et « Manquantes » en reçoit une pareille.
  const pill = [...full.querySelectorAll('*')].find((el) => getComputedStyle(el).position === 'absolute');
  // (ou le fond de l'onglet lui-même, quand le jeu colore le bouton directement)
  const source = pill ?? (selected === full && !on ? full : null);
  if (source && !pillLook) {
    const cs = getComputedStyle(source);
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none')
      pillLook = { background: cs.backgroundImage !== 'none' ? cs.backgroundImage : cs.backgroundColor, radius: cs.borderRadius, shadow: cs.boxShadow };
  }
  if (!plainColor) plainColor = getComputedStyle(plain).color;
  if (!pickedColor && selected === full && !on) pickedColor = getComputedStyle(full).color;
  pill?.toggleAttribute('data-aqm-pill-off', on);
  full.toggleAttribute('data-aqm-unpicked', on);
  full.style.setProperty('--aqm-plain-color', plainColor);
  const look = `${plain.className} aqm-missing-tab${on ? ' is-on' : ''}`;
  if (tab.className !== look) tab.className = look;
  tab.style.setProperty('--aqm-pill-bg', pillLook?.background || 'rgba(255, 255, 255, 0.12)');
  tab.style.setProperty('--aqm-pill-radius', pillLook?.radius || '999px');
  tab.style.setProperty('--aqm-pill-shadow', pillLook?.shadow && pillLook.shadow !== 'none' ? pillLook.shadow : 'none');
  tab.style.setProperty('--aqm-picked-color', pickedColor || '#fff');
  if (tab.textContent !== 'Manquantes') tab.textContent = 'Manquantes';
  tab.setAttribute('aria-pressed', String(on));
  filterMissing(on);
}
let pillLook = null; // la pastille du jeu de l'onglet sélectionné : sa couleur, son arrondi, son ombre
let plainColor = '';
let pickedColor = '';

// Cache les cartes de l'album que le joueur possède (leur étiquette est « × N »), et les séries qui n'en gardent
// aucune.
// Refait seulement quand le contenu de la page a changé (son nombre d'éléments), l'album peut contenir des milliers de
// cartes.
let filteredSize = -1;
function filterMissing(on) {
  if (!on) {
    if (filteredSize !== -1 || document.querySelector('[data-aqm-owned-card]')) document.querySelectorAll('[data-aqm-owned-card]').forEach((el) => el.removeAttribute('data-aqm-owned-card'));
    filteredSize = -1;
    return;
  }
  const size = (document.querySelector('main') ?? document.body).getElementsByTagName('*').length;
  if (size === filteredSize) return;
  filteredSize = size;
  // L'étiquette sous chaque carte : « Manquante », ou « × 1 » (parfois en plusieurs morceaux de texte) : l'élément le
  // plus intérieur dont tout le texte le dit.
  const LABEL = /^(manquante|[×x]\s*\d+)$/i;
  const says = (el) => LABEL.test(el.textContent.replace(/\s+/g, ' ').trim());
  const page = document.querySelector('main') ?? document.body;
  const labels = [...page.querySelectorAll('*')].filter((el) => el.childElementCount < 4 && !el.closest('.aqm-root') && says(el) && ![...el.children].some(says));
  // Combien d'étiquettes contient chaque boîte, pour trouver la tuile de chaque carte : la boîte la plus haute autour
  // de son étiquette qui n'en contient pas d'autre, dans la page. Une étiquette seule (une série d'une carte affichée)
  // est contenue seule par chaque boîte jusqu'à la page : sa tuile est alors la boîte autour de son image, avec les
  // boîtes qui n'entourent qu'elle.
  const held = new Map();
  for (const label of labels) for (let el = label; el; el = el.parentElement) held.set(el, (held.get(el) ?? 0) + 1);
  document.querySelectorAll('[data-aqm-owned-card]').forEach((el) => el.removeAttribute('data-aqm-owned-card'));
  for (const label of labels) {
    let tile = label;
    for (let up = tile.parentElement; up && up !== page && held.get(up) === 1; up = tile.parentElement) {
      if (labels.length === 1 && tile.querySelector('img') && up.childElementCount > 1) break;
      tile = up;
    }
    // (une étiquette seule, pas une carte : pas d'image)
    tile.toggleAttribute('data-aqm-owned-card', tile !== label && !!tile.querySelector('img') && !/^manquante$/i.test(label.textContent.trim()));
  }
}
