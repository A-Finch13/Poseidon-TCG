// Aquaman, code de la page : collection, cliquer-glisser les bandes horizontales.

// ---------- collection : cliquer-glisser les bandes horizontales ----------

let grab = null; // { el, id, x, left, moved }

function onGrabDown(e) {
  if (stopped || e.pointerType !== 'mouse' || e.button !== 0 || !location.pathname.startsWith('/jeu/collection')) return;
  if (e.target.closest?.('.aqm-slot, .aqm-root, input, textarea, select, [contenteditable]')) return;
  const el = sidewaysStrip(e.target);
  if (el) grab = { el, id: e.pointerId, x: e.clientX, left: el.scrollLeft, moved: false };
}

function onGrabMove(e) {
  if (!grab || e.pointerId !== grab.id) return;
  const dx = e.clientX - grab.x;
  if (!grab.moved) {
    if (Math.abs(dx) < 5) return;
    grab.moved = true;
    holdSnap(grab.el, 0);
    root.classList.add('aqm-grabbing');
    window.getSelection()?.removeAllRanges();
  }
  e.preventDefault();
  grab.el.scrollLeft = grab.left - dx;
}

function onGrabEnd(e) {
  if (!grab || e.pointerId !== grab.id) return;
  const g = grab;
  grab = null;
  if (!g.moved) return;
  root.classList.remove('aqm-grabbing');
  holdSnap(g.el, 250);
  if (e.type === 'pointerup') swallowClick();
}

// Les images et les liens du site lanceraient sinon le glisser du navigateur.
const onGrabDragStart = (e) => grab && grab.el.contains(e.target) && e.preventDefault();

// Curseur en main sur la bande des séries.
function markSeriesStrip() {
  if (!location.pathname.startsWith('/jeu/collection')) return;
  const strip = seriesStrip();
  if (strip && !strip.classList.contains('aqm-grab') && scrollsSideways(strip, getComputedStyle(strip))) strip.classList.add('aqm-grab');
}

function restoreSnap() {
  if (!snapBack) return;
  clearTimeout(snapBack.timer);
  snapBack.el.style.scrollSnapType = snapBack.snap;
  snapBack.el.style.scrollBehavior = snapBack.smooth;
  snapBack = null;
}
