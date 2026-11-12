// Aquaman, code de la page : la visite guidée (ses étapes sont dans tour/steps.js).

// ---------- visite guidée ----------

const navLink =(route) => firstVisible(`a[data-tour="nav-${route}"]`) ?? firstVisible(`a[href="${route}"]`);

// Un élément du menu « Plus », ouvert pour la visite.
function menuItem(i) {
  const plus = firstVisible('.aqm-plus');
  if (!plus) return null;
  if (!menu || menu.anchor !== plus) openMenu(plus);
  return menu.querySelectorAll('.aqm-menu-item')[i];
}

// La bande des séries de la page Collection.
function seriesStrip() {
  for (const label of elementsWithText(document.body, /toutes les s[ée]ries/i)) {
    for (let el = label; el && el !== document.body; el = el.parentElement)
      if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return el;
    return label.closest('button, a') ?? label;
  }
  return null;
}

const FINDERS = {
  plus: () => firstVisible('.aqm-plus'),
  'menu-0': () => menuItem(0),
  'menu-1': () => menuItem(1),
  'menu-2': () => menuItem(2),
  'menu-3': () => menuItem(3),
  series: () => seriesStrip() ?? navLink('/jeu/collection'),
  vitrine: () => [...document.querySelectorAll('button, a')].find((b) => isVisible(b) && !b.closest('.aqm-root') && /ma vitrine/i.test(b.textContent))
};

// Élément entouré par une étape.
const stepTarget = (step) => (step.find ? FINDERS[step.find]?.() : step.target ? firstVisible(step.target) : null);
const stepText = (step) => (typeof step.text === 'string' ? step.text : canHover() ? step.text.hover : step.text.touch);

let tour = null; // { i, token, el, layer, hole, card, raf }

function startTour(i = 0) {
  if (stopped) return;
  closeOverlay();
  stopTour();
  const hole = h('div', { class: 'aqm-tour-hole' });
  const card = h('div', { class: 'aqm-tour-card', role: 'dialog', 'aria-live': 'polite' });
  const layer = h('div', { class: 'aqm-root aqm-tour' }, h('div', { class: 'aqm-tour-block' }), hole, card);
  document.body.append(layer);
  tour = { i: 0, token: 0, el: null, layer, hole, card, raf: 0 };
  const follow = () => {
    if (!tour) return;
    placeTour();
    tour.raf = requestAnimationFrame(follow);
  };
  follow();
  showStep(i);
}

function stopTour() {
  if (!tour) return;
  cancelAnimationFrame(tour.raf);
  tour.layer.remove();
  tour = null;
  session(TOUR_STEP, null);
  closeMenu();
  if (location.hash.startsWith(TOUR_HASH)) history.replaceState(null, '', location.pathname + location.search);
}

// Élément trouvé par find, une fois visible (null après ms).
async function waitFor(find, ms) {
  const end = Date.now() + ms;
  for (;;) {
    const el = find();
    if (el && isVisible(el)) return el;
    if (Date.now() > end || !tour) return null;
    await new Promise((r) => setTimeout(r, 150));
  }
}

// Affiche l'étape i : va sur sa page, puis entoure son élément.
async function showStep(i) {
  if (!tour) return;
  const step = TOUR[i];
  const token = ++tour.token;
  tour.i = i;
  tour.el = null;
  session(TOUR_STEP, String(i));
  if (!step.find?.startsWith('menu')) closeMenu();
  renderTourCard(step, true);
  if (step.page && location.pathname.replace(/\/$/, '') !== step.page) {
    const link = navLink(step.page);
    if (link) link.click();
    else return void location.assign(step.page); // la visite reprend après le chargement de la page
  }
  const el = step.find || step.target ? await waitFor(() => stepTarget(step), 6000) : null;
  if (!tour || token !== tour.token) return;
  tour.el = el;
  el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  renderTourCard(step, false);
}

function renderTourCard(step, loading) {
  const { i, card } = tour;
  const last = i === TOUR.length - 1;
  card.replaceChildren(
    h('p', { class: 'aqm-tour-count' }, `${i + 1} / ${TOUR.length}`),
    h('h3', { class: 'aqm-tour-title' }, step.title),
    h('p', { class: 'aqm-tour-text' }, loading && step.page ? 'Ouverture de la page…' : stepText(step)),
    h(
      'div',
      { class: 'aqm-tour-actions' },
      last ? null : h('button', { type: 'button', class: 'aqm-tour-skip', onclick: stopTour }, 'Passer'),
      h('span', { class: 'aqm-tour-gap' }),
      i > 0 ? h('button', { type: 'button', class: 'aqm-tour-btn', onclick: () => showStep(i - 1) }, 'Précédent') : null,
      h('button', { type: 'button', class: 'aqm-tour-btn is-main', onclick: () => (last ? stopTour() : showStep(i + 1)) }, last ? 'Terminer' : i === 0 ? 'C’est parti' : 'Suivant')
    )
  );
}

// Trou de lumière sur l'élément montré et une bulle à côté (en bas ou en haut de l'écran sur téléphone).
function placeTour() {
  const { el, hole, card, layer } = tour;
  const r = el && el.isConnected ? el.getBoundingClientRect() : null;
  const pad = 8;
  const shown = !!(r && r.width);
  if (shown) Object.assign(hole.style, { display: 'block', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
  else hole.style.display = 'none';
  layer.classList.toggle('is-dim', !shown);
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  let left;
  let top;
  if (!shown) {
    left = (innerWidth - cw) / 2;
    top = (innerHeight - ch) / 2;
  } else if (innerWidth < 640) {
    left = (innerWidth - cw) / 2;
    top = r.top + r.height / 2 > innerHeight / 2 ? 12 : innerHeight - ch - 12;
  } else {
    left = Math.max(12, Math.min(innerWidth - cw - 12, r.left + r.width / 2 - cw / 2));
    top = r.bottom + pad + 12 + ch < innerHeight ? r.bottom + pad + 12 : Math.max(12, r.top - pad - 12 - ch);
  }
  card.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}
