// Aquaman, code de la page : collection, la molette fait défiler les bandes horizontales.

// ---------- collection : la molette fait défiler les bandes horizontales ----------

// Vrai pour une bande qui défile de côté : défilable, ou rognée avec plusieurs éléments (pas un titre coupé).
function scrollsSideways(el, style) {
  if (el.scrollWidth - el.clientWidth < 4) return false;
  if (/(auto|scroll)/.test(style.overflowX)) return true;
  return style.overflowX === 'hidden' && el.children.length >= 3 && style.textOverflow !== 'ellipsis';
}

let snapBack = null; // { el, snap, smooth, timer } : l'aimantation est remise une fois la molette arrêtée

function onWheel(e) {
  if (stopped || !location.pathname.startsWith('/jeu/collection') || e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  for (let el = e.target instanceof Element ? e.target : null; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (!scrollsSideways(el, style)) continue;
    // overflow-x: auto met aussi overflow-y à auto : seule une vraie liste verticale garde la molette.
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight - el.clientHeight > 24) return;
    const max = el.scrollWidth - el.clientWidth;
    const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * el.clientWidth : e.deltaY;
    if ((delta < 0 && el.scrollLeft <= 0) || (delta > 0 && el.scrollLeft >= max - 1)) return;
    e.preventDefault();
    holdSnap(el, 250);
    el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + delta));
    return;
  }
}

// Bande sous un point de la page Collection qui défile de côté, ou null.
function sidewaysStrip(from) {
  for (let el = from instanceof Element ? from : null; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (!scrollsSideways(el, style)) continue;
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight - el.clientHeight > 24) return null;
    return el;
  }
  return null;
}

// L'aimantation du défilement ramènerait un petit mouvement sur la même carte : coupée pendant le défilement, remise ms
// après le dernier mouvement.
function holdSnap(el, ms) {
  if (snapBack?.el !== el) {
    restoreSnap();
    snapBack = { el, snap: el.style.scrollSnapType, smooth: el.style.scrollBehavior, timer: 0 };
    el.style.scrollSnapType = 'none';
    el.style.scrollBehavior = 'auto';
  }
  clearTimeout(snapBack.timer);
  if (ms) snapBack.timer = setTimeout(restoreSnap, ms);
}

// Le clic qui termine un glisser n'ouvre pas ce qui est sous le pointeur.
function swallowClick() {
  const stop = (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
  };
  document.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => document.removeEventListener('click', stop, true), 400);
}
