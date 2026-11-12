// Aquaman, code de la page : la boucle, run() et ses étapes, la page surveillée, l'arrêt et le démarrage. Chargé en
// dernier.

// ---------- boucle ----------

// Les étapes de run() qu'un réglage désactive (SETTINGS dans src/lib/settings.js).
const STEP_SETTING = new Map([
  [enlargePulls, 'bigPulls'],
  [markMissingSales, 'missingSales'],
  [markAlbum, 'albumButtons'],
  [watchGuards, 'albumButtons'],
  [markCardWho, 'cardWho'],
  [markSellDialog, 'sellTools'],
  [markUnlistButton, 'sellTools'],
  [hideBoughtCards, 'hideBought'],
  [markSalesCards, 'marketSales'],
  [markSalesKinds, 'marketSales'],
  [markMyBids, 'myBids'],
  [markOpenBids, 'myBids'],
  [markRecycleDialog, 'recycleHelp'],
  [markBoosterKinds, 'boosterWheel'],
  [markOpenMore, 'openMore'],
  [enhanceShowcaseEditor, 'showcaseDrag'],
  [markTrades, 'tradeMarks'],
  [markTradeFilters, 'tradeFilters'],
]);

function run() {
  if (stopped) return;
  if (!alive()) return shutdown();
  const inGame = location.pathname.startsWith('/jeu');
  // Hors du jeu, seuls les échanges envoyés dans les messages privés sont marqués.
  if (!inGame && !TRADE_PAGES.test(location.pathname)) return;
  if (location.pathname !== visitPath) {
    visitPath = location.pathname;
    pageVisit++;
  }
  const began = performance.now();
  runText = null;
  for (const step of [addPlusTab, enlargePulls, markMissingSales, markAlbum, watchGuards, markCardWho, markSellDialog, markUnlistButton, hideBoughtCards, markSalesCards, markSalesKinds, markMyBids, markOpenBids, watchSaleToast, markRecycleDialog, markBoosterKinds, markOpenMore, markRecycleSpares, resumeScan, enhanceShowcaseEditor, markTrades, markTradeFilters, pollFeedNow, syncSalesNow, sayHello, checkAccess, lookForUpdate, startOnce]) {
    if (STEP_SETTING.has(step) && !on(STEP_SETTING.get(step))) continue;
    if (!inGame && step !== markTrades && step !== checkAccess) continue;
    try {
      step();
    } catch (e) {
      console.warn('[Aquaman]', e);
    }
  }
  runText = undefined;
  runCost = performance.now() - began;
}

let queued = false;
let runCost = 0;
// Une visite d'une page : une nouvelle à chaque changement de chemin (une autre série garde le chemin).
let pageVisit = 0;
let visitPath = '';
let missedRun = false;
function schedule() {
  if (queued || stopped) return;
  if (document.hidden) return void (missedRun = true);
  queued = true;
  setTimeout(() => {
    const go = () => {
      queued = false;
      if (document.hidden) return void (missedRun = true);
      run();
    };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 1000 });
    else go();
  }, Math.min(1500, Math.max(150, runCost * 8)));
}
onStart(() => {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !missedRun) return;
    missedRun = false;
    schedule();
  });
});

const observer = new MutationObserver((records) => records.some((r) => !quietChange(r)) && schedule());
const listeners = [
  [document, 'wheel', onWheel, { passive: false, capture: true }],
  [document, 'pointerdown', onGrabDown, true],
  [document, 'pointermove', onGrabMove, { passive: false }],
  [document, 'pointerup', onGrabEnd],
  [document, 'pointercancel', onGrabEnd],
  [document, 'dragstart', onGrabDragStart, true],
  [document, 'pointermove', onPointerMove, { passive: false }],
  [document, 'touchmove', (e) => press?.active && e.preventDefault(), { passive: false }],
  [document, 'contextmenu', (e) => press && e.target.closest?.('.aqm-slot') && e.preventDefault()],
  [document, 'pointerup', (e) => press && e.pointerId === press.id && endPress(true, e)],
  [document, 'pointercancel', (e) => press && e.pointerId === press.id && endPress(false, e)],
  [document, 'pointerdown', onOutside, true],
  [document, 'click', onSellClick, true],
  [document, 'keydown', onKey],
  [window, 'resize', closeMenu],
  [window, 'popstate', closeOverlay],
  [window, 'hashchange', onHash],
  [window, 'message', onPageMessage],
  [window, 'focus', onBack],
  [document, 'visibilitychange', onBack]
];

let stopped = false;

// Retire tout ce qu'Aquaman a ajouté et s'arrête.
function shutdown() {
  if (stopped) return;
  stopped = true;
  restoreSnap();
  observer.disconnect();
  clearInterval(helloTimer);
  for (const [target, type, fn, opts] of listeners) target.removeEventListener(type, fn, opts);
  if (tour) cancelAnimationFrame(tour.raf);
  tour = null;
  menu = null;
  closeMarketSortMenu();
  overlay = null;
  document.querySelectorAll('.aqm-root, .aqm-plus, .aqm-open-more, .aqm-trade-filter, .aqm-my-bids').forEach((el) => el.remove());
  document.querySelectorAll('[data-aqm-tradehide]').forEach((el) => el.removeAttribute('data-aqm-tradehide'));
  document.querySelectorAll('[class*="aqm-"]').forEach((el) => {
    for (const cls of [...el.classList]) if (cls.startsWith('aqm-')) el.classList.remove(cls);
  });
  document.querySelectorAll('[data-aqm-slot]').forEach((el) => delete el.dataset.aqmSlot);
  document.querySelectorAll('[data-aqm-lite]').forEach((el) => delete el.dataset.aqmLite);
  document.querySelectorAll('[data-aqm-anchor]').forEach((el) => {
    el.style.position = '';
    delete el.dataset.aqmAnchor;
  });
  root.classList.remove('aqm-lock');
  if (root.dataset.aqmOwner === owner) delete root.dataset.aqmOwner;
}

// Démarre une fois que le React du site a pris en main la page envoyée par le serveur (hydratation) : un élément ajouté
// avant ne correspondrait pas à ce qu'attend React (« Minified React error #418 »). inject.js dit quand React a pris en
// main chaque bouton de la page (data-aqm-hydrated) : l'album de la collection est parfois pris en main longtemps après
// le chargement de la page. (16 s au plus, sans inject.js.)
function whenSettled(start) {
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 300));
  const since = Date.now();
  const wait = () => (document.documentElement.hasAttribute('data-aqm-hydrated') || Date.now() - since > 16e3 ? idle() : setTimeout(wait, 150));
  if (document.readyState === 'complete') wait();
  else addEventListener('load', wait, { once: true });
}

// Ce qui démarre avec la page : les boosters de l'accueil dès que le jeu les dessine, les séries et les favoris, puis
// le reste une fois la page stabilisée.
function begin() {
  // Les boosters de l'accueil sont montrés dès que le jeu dessine sa pile, sans attendre toute la page (voir
  // whenSettled) : la pile n'arrive qu'une fois que le jeu a lu ses boosters, après que React a pris la page en main.
  // run() prend le relais une fois la page stabilisée.
  addEventListener('message', (e) => {
    if (e.source === window && e.data?.aquaman === 'boosters-refreshed') onBoostersRefreshed(e.data.id, !!e.data.ok);
  });
  Promise.all([loadShotStore(), featReady]).then(() => !stopped && /^\/jeu\/?$/.test(location.pathname) && markBoosterKinds());
  // Les séries et les favoris sont lus dès le démarrage du script, sur n'importe quelle page du jeu : les étoiles de la
  // Collection arrivent avec sa bande, même quand c'est la première page ouverte.
  if (/^\/jeu\/?$/.test(location.pathname)) {
    let frame = 0;
    const early = new MutationObserver(() => {
      if (settled || stopped) return early.disconnect();
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (settled || stopped) return;
        try {
          markBoosterKinds();
        } catch (e) {
          console.warn('[Aquaman]', e);
        }
      });
    });
    early.observe(document.documentElement, { childList: true, subtree: true });
  }

  whenSettled(() => {
    if (stopped) return;
    settled = true;
    accountId().then((id) => (meId = id));
    for (const [target, type, fn, opts] of listeners) target.addEventListener(type, fn, opts);
    chrome.storage.onChanged.addListener(onStorage);
    renderBox();
    runQueue();
    renderSalesBox();
    runSales();
    observer.observe(root, { childList: true, subtree: true });
    run();
  });
}

// ---------- démarrage ----------

// (rien quand une autre copie d'Aquaman tourne dans cet onglet : voir core/base.js)
if (!otherCopy) {
  for (const fn of startups) fn();
  begin();
}
