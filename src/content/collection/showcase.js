// Aquaman, code de la page : « Ma vitrine », glisser-déposer.

// ---------- « Ma vitrine » : glisser-déposer ----------

const slotKey = (slot) => imageKey(slot.querySelector('img')?.currentSrc || slot.querySelector('img')?.src);
let press = null; // carte pressée ou glissée : { dlg, slot, key, x, y, id, touch, active, ghost }
let moving = false;

const vitrines = new Set(); // fenêtres « Ma vitrine » trouvées : les recherches et changements de texte de la page les sautent

// Emplacements de l'éditeur de vitrine dans l'ordre : la carte et sa rangée de 3 boutons (‹ › ✕). Trouvés à partir des
// boutons : la fenêtre liste aussi chaque carte de la collection, parcourir tous ses éléments serait lent.
function showcaseSlots(dlg) {
  const slots = [];
  const seen = new Set();
  for (const btn of dlg.querySelectorAll('button')) {
    if (btn.querySelector('img') || btn.closest('.aqm-root')) continue;
    // La rangée : le parent le plus proche avec 3 boutons (plus : il contient plusieurs rangées, ou d'autres boutons).
    let el = btn.parentElement;
    for (let depth = 0; el && el !== dlg && depth < 4 && el.querySelectorAll('button').length < 3; depth++) el = el.parentElement;
    if (!el || el === dlg || seen.has(el)) continue;
    seen.add(el);
    if (!/^(DIV|LI|SPAN)$/.test(el.tagName) || el.querySelectorAll('button').length !== 3 || el.querySelector('img')) continue;
    let slot = el.parentElement;
    while (slot && slot !== dlg && !slot.querySelector('img')) slot = slot.parentElement;
    if (!slot || slot === dlg || slot.querySelectorAll('img').length !== 1) continue;
    slots.push({ slot, controls: el });
  }
  return slots;
}

// La liste des cartes de la collection dans la fenêtre (l'élément qui a le plus de cartes comme enfants), dessinée
// seulement près de l'écran : des centaines de cartes animées rendaient la fenêtre lente.
const vitrineGrids = new WeakMap(); // fenêtre -> liste
function lightenGrid(dlg) {
  const known = vitrineGrids.get(dlg);
  if (known?.isConnected && dlg.contains(known)) return;
  let grid = null;
  for (const el of dlg.querySelectorAll('div, ul, ol')) {
    if (el.children.length >= 12 && el.children.length > (grid?.children.length ?? 0) && el.firstElementChild?.querySelector('img') && !el.closest('.aqm-root')) grid = el;
  }
  if (!grid) return;
  vitrineGrids.set(dlg, grid);
  const cell = grid.firstElementChild.getBoundingClientRect();
  if (cell.height) grid.style.setProperty('--aqm-cell-h', `${Math.round(cell.height)}px`);
  if (cell.width) grid.style.setProperty('--aqm-cell-w', `${Math.round(cell.width)}px`);
  grid.dataset.aqmLite = '';
}

// Vrai quand un changement de la page ne concerne qu'Aquaman ou la liste de cartes d'une fenêtre « Ma vitrine » :
// inutile de lancer run().
function quietChange(r) {
  const target = r.target instanceof Element ? r.target : r.target.parentElement;
  if (!target || target.closest('.aqm-root, [data-aqm-lite]')) return true;
  const nodes = [...r.addedNodes, ...r.removedNodes];
  return nodes.length > 0 && nodes.every((n) => n instanceof Element && n.classList.contains('aqm-root'));
}

// Fenêtres intitulées « Ma vitrine ».
function showcaseDialogs() {
  const found = new Set([...vitrines].filter((dlg) => dlg.isConnected));
  for (const dlg of document.querySelectorAll('[role="dialog"], [aria-modal="true"]')) {
    if (dlg.closest('.aqm-root')) continue;
    if (/ma vitrine/i.test(dlg.querySelector('h1, h2, h3')?.textContent ?? '')) found.add(dlg);
  }
  if (!found.size)
    for (const label of elementsWithText(document.body, /^\s*ma vitrine\s*$/i)) {
      let el = label;
      while (el && el !== document.body && getComputedStyle(el).position !== 'fixed') el = el.parentElement;
      if (el && el !== document.body) found.add(el);
    }
  return [...found];
}

function enhanceShowcaseEditor() {
  const dialogs = showcaseDialogs();
  vitrines.clear();
  for (const dlg of dialogs) {
    const slots = showcaseSlots(dlg);
    if (!slots.length) continue;
    vitrines.add(dlg);
    lightenGrid(dlg);
    dlg.classList.add('aqm-vitrine');
    for (const s of slots) wireSlot(dlg, s);
  }
}

// Cache les boutons de l'emplacement, ajoute la croix de retrait et le glisser.
function wireSlot(dlg, { slot, controls }) {
  controls.classList.add('aqm-hidden');
  for (const img of slot.querySelectorAll('img')) if (img.draggable) img.draggable = false;
  if (slot.dataset.aqmSlot) return;
  slot.dataset.aqmSlot = '1';
  slot.classList.add('aqm-slot');
  slot.append(
    h('button', {
      type: 'button',
      class: 'aqm-root aqm-slot-x',
      title: 'Retirer de la vitrine',
      'aria-label': 'Retirer de la vitrine',
      html: ICON_X,
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        showcaseSlots(dlg)
          .find((s) => s.slot === slot)
          ?.controls.querySelectorAll('button')[2]
          ?.click();
      }
    })
  );
  slot.addEventListener('dragstart', (e) => e.preventDefault());
  slot.addEventListener('pointerdown', (e) => {
    if (moving || press || e.button !== 0 || e.target.closest('.aqm-slot-x')) return;
    const touch = e.pointerType !== 'mouse';
    press = { dlg, slot, key: slotKey(slot), x: e.clientX, y: e.clientY, id: e.pointerId, touch, active: false, ghost: null };
    if (touch) press.timer = setTimeout(() => press?.slot === slot && !press.active && beginDrag(), 350);
  });
}

// Commence le glisser : une copie de la carte suit le pointeur.
function beginDrag() {
  const r = press.slot.getBoundingClientRect();
  press.active = true;
  press.dx = press.x - r.left;
  press.dy = press.y - r.top;
  const ghost = press.slot.cloneNode(true);
  ghost.removeAttribute('data-aqm-slot');
  ghost.className = 'aqm-root aqm-ghost';
  ghost.style.cssText = `width:${r.width}px;height:${r.height}px;transform:translate(${r.left}px,${r.top}px)`;
  document.body.append(ghost);
  press.ghost = ghost;
  press.slot.classList.add('aqm-dragging');
  navigator.vibrate?.(15);
}

// Emplacement de la fenêtre sous un point.
function slotAt(dlg, x, y) {
  const slot = document.elementFromPoint(x, y)?.closest('.aqm-slot');
  return slot && dlg.contains(slot) ? slot : null;
}

const clearOver = (dlg) => dlg.querySelectorAll('.aqm-over').forEach((el) => el.classList.remove('aqm-over'));

// Termine un appui ; un dépôt sur un autre emplacement y déplace la carte.
function endPress(drop, e) {
  if (!press) return;
  const p = press;
  press = null;
  clearTimeout(p.timer);
  if (!p.active) return;
  p.ghost.remove();
  p.slot.classList.remove('aqm-dragging');
  clearOver(p.dlg);
  swallowClick();
  if (!drop) return;
  const target = slotAt(p.dlg, e.clientX, e.clientY);
  const list = showcaseSlots(p.dlg);
  const to = list.findIndex((s) => s.slot === target);
  const from = list.findIndex((s) => slotKey(s.slot) === p.key);
  if (from >= 0 && to >= 0 && from !== to) moveSlot(p.dlg, p.key, to);
}

function onPointerMove(e) {
  if (!press || e.pointerId !== press.id) return;
  if (!press.active) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) return;
    if (press.touch) return endPress(false); // le doigt a bougé avant l'appui long : un défilement
    beginDrag();
  }
  e.preventDefault();
  press.ghost.style.transform = `translate(${e.clientX - press.dx}px,${e.clientY - press.dy}px)`;
  const over = slotAt(press.dlg, e.clientX, e.clientY);
  if (!over?.classList.contains('aqm-over')) {
    clearOver(press.dlg);
    if (over && over !== press.slot) over.classList.add('aqm-over');
  }
}

// Déplace la carte avec les flèches du site, d'un emplacement à la fois, jusqu'à l'emplacement voulu.
async function moveSlot(dlg, key, to) {
  if (moving) return;
  moving = true;
  dlg.classList.add('aqm-moving');
  try {
    for (let step = 0; step < 12; step++) {
      const list = showcaseSlots(dlg);
      const at = list.findIndex((s) => slotKey(s.slot) === key);
      if (at < 0 || at === to) break;
      const btn = list[at].controls.querySelectorAll('button')[to > at ? 1 : 0];
      if (!btn || btn.disabled) break;
      btn.click();
      await slotMoved(dlg, key, at);
    }
  } finally {
    moving = false;
    dlg.classList.remove('aqm-moving');
  }
}

// Attend que la carte ait quitté son emplacement (0,8 s au plus).
function slotMoved(dlg, key, was) {
  return new Promise((resolve) => {
    let timer = 0;
    const obs = new MutationObserver(() => check());
    const done = () => {
      obs.disconnect();
      clearTimeout(timer);
      resolve();
    };
    const check = () => showcaseSlots(dlg).findIndex((s) => slotKey(s.slot) === key) !== was && done();
    obs.observe(dlg, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
    timer = setTimeout(done, 800);
    check();
  });
}
