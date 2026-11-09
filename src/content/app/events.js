// Aquaman, code de la page : changements du stockage, le minuteur de 5 secondes, messages d'inject.js, clavier.

// La file a changé (dans cet onglet ou un autre) : les cadres suivent, et cet onglet prend le relais s'il le faut.
function onStorage(changes) {
  if (stopped || !settled) return;
  // Une fonction activée ou désactivée ailleurs (la fenêtre de l'extension, un autre onglet) : proposé de recharger la
  // page.
  if (changes.settings && !settingsOpen) {
    const now = changes.settings.newValue ?? {};
    const STEPS = new Set(STEP_SETTING.values()).add('packGlow').add('recycleSpares');
    // (désactivé au départ : absent veut dire désactivé)
    if ((now.autoRecycle === true) !== (feat.autoRecycle === true)) offerReload();
    if ([...STEPS].some((key) => (now[key] !== false) !== on(key))) offerReload();
  }
  if (changes[QUEUE]) {
    renderBox();
    runQueue();
  }
  if (changes[SALES]) {
    renderSalesBox();
    runSales();
  }
  // Les cartes achetées sur un autre appareil (synchronisées) : leurs ventes sont cachées ici aussi.
  if (changes[BOUGHT_KEY]) {
    for (const key of changes[BOUGHT_KEY].newValue ?? []) boughtNames.add(key);
    hideBoughtCards();
  }
}

let wantsPulledAt = 0;

// Toutes les 5 secondes : les comptes à rebours des attentes, un onglet devenu silencieux, et les cartes et doublons en
// attente.
onStart(() => {
  setInterval(async () => {
    if (stopped || !settled) return;
    if (!alive()) return shutdown(); // l'extension a été rechargée : cette copie s'arrête
    const q = await readQueue();
    renderBox();
    if (q?.finishedAt && Date.now() - q.finishedAt > 60e3) chrome.storage.local.remove(QUEUE);
    else runQueue();
    checkRoom();
    const sales = await readSales();
    renderSalesBox();
    if (sales?.finishedAt && Date.now() - sales.finishedAt > 60e3) chrome.storage.local.remove(SALES);
    else runSales();
    checkSales();
    if (Date.now() - wantsPulledAt > 60e3) {
      wantsPulledAt = Date.now();
      send({ type: 'wants-sync' }); // les changements des autres appareils
      send({ type: 'market-sync' }); // (les cartes achetées sur le marché, les exemplaires en attente d'une place)
    }
  }, 5000);
});

// Messages envoyés par inject.js sur les requêtes du site lui-même.
function onPageMessage(e) {
  if (e.source !== window || e.origin !== location.origin || typeof e.data?.aquaman !== 'string') return;
  if (e.data.aquaman === 'collection-stale') {
    owned = null;
    send({ type: 'collection-stale' });
    guardSoon();
    if (on('collectionStats')) snapCollection(true);
    setTimeout(schedule, 1500);
    setTimeout(() => checkRoom(20e3), 3000); // une carte recherchée vient peut-être d'être obtenue
  } else if (e.data.aquaman === 'sell-refused' && e.data.item?.copyId)
    onSellRefused(e.data.item, String(e.data.message ?? ''), Array.isArray(e.data.ticked) ? e.data.ticked.filter((t) => t?.copyId && t.price > 0) : []);
  else if (e.data.aquaman === 'status') {
    send({ type: 'status', pending: e.data.pending });
    if (Array.isArray(e.data.boosters)) {
      pendingBoosters = e.data.boosters.filter((b) => b?.id);
      markBoosterKinds();
    }
  }
  else if (e.data.aquaman === 'market-bought' && typeof e.data.name === 'string') addBought(e.data.name, e.data.rarity);
  // (les cartes du joueur en vente, d'après ses annonces ou ses enchères : « Déjà en vente » au marché)
  else if (e.data.aquaman === 'market-sales' && Array.isArray(e.data.keys) && on('marketSales')) markSalesCards();
  else if (e.data.aquaman === 'feed' && Array.isArray(e.data.pulls)) send({ type: 'feed-seen', pulls: e.data.pulls });
  else if (e.data.aquaman === 'player-seen' && typeof e.data.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(e.data.id) && typeof e.data.name === 'string' && e.data.name.trim())
    playersSeen.set(foldName(e.data.name), e.data.id);
  else if (e.data.aquaman === 'opened' && Array.isArray(e.data.boosters)) {
    if (batch) batch.opened = e.data.boosters.length;
    pulledCards = new Set((Array.isArray(e.data.cards) ? e.data.cards.flat() : []).filter((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)));
    spareOffer = null;
    send({ type: 'opened', boosters: e.data.boosters, best: Array.isArray(e.data.best) ? e.data.best : [], packs: Array.isArray(e.data.packs) ? e.data.packs : [], ids: Array.isArray(e.data.ids) ? e.data.ids : [] }).then((report) => {
      if (report && !report.error) {
        pityReport = report;
        pityAt = Date.now();
      }
      renderPity();
    });
  }
}

// ---------- clavier ----------

function onKey(e) {
  if (tour) {
    if (e.key === 'Escape') stopTour();
    else if (e.key === 'ArrowRight' && tour.i < TOUR.length - 1) showStep(tour.i + 1);
    else if (e.key === 'ArrowLeft' && tour.i > 0) showStep(tour.i - 1);
    return;
  }
  if (e.key !== 'Escape') return;
  if (marketSortMenu) closeMarketSortMenu();
  else if (menu) closeMenu();
  else if (overlay) closeOverlay();
}

// De retour sur la page (un autre appareil a pu ouvrir des boosters entre-temps) : les compteurs sont relus.
function onBack() {
  if (document.visibilityState !== 'visible') return;
  if (document.querySelector('.aqm-pity')) loadPity(true);
  if (document.querySelector('.aqm-star')) loadFavIds(true);
  send({ type: 'wants-sync', fresh: true });
}

function onOutside(e) {
  if (menu && !menu.contains(e.target) && !menu.anchor?.contains(e.target) && !e.target.closest?.('.aqm-tour')) closeMenu();
  if (marketSortMenu && !marketSortMenu.contains(e.target) && !marketSortMenu.anchor?.contains(e.target)) closeMarketSortMenu();
}
