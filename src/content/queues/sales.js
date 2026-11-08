// Aquaman, code de la page : doublons en vente, les exemplaires refusés par le marché plein, retentés.

// ---------- doublons en vente : une file comme celle de la liste de recherche ----------
// La fenêtre « Vendre mes doublons » du jeu met elle-même les exemplaires sur le marché. Quand le marché ne prend plus
// de ventes du joueur, chaque exemplaire qu'il refuse ({ cardId, copyId, price, name }, lu par inject.js) attend dans
// Aquaman (SALES_MAX au plus) et est retenté toutes les 2 minutes, par un seul onglet à la fois : une vente conclue
// libère une place.

const SALES = 'sellQueue';
const SALES_WAITING = 'sellWaiting';
const SALES_AT = 'sellCheckAt'; // dernier essai des exemplaires en attente, par n'importe quel onglet
const SALES_LAST = 'sellLastAnswer'; // la dernière réponse du jeu à un essai des exemplaires en attente : { at, message, full }
const SALES_PAUSED = 'sellPausedUntil'; // les exemplaires en attente ne sont pas retentés avant ce moment (les ventes en cours de retrait)
const SALES_MAX = 50;
// La réponse du jeu quand son marché est plein : « 50 ordres en cours au plus. » (ses ventes et ordres d'achat
// ensemble).
// Tout autre refus concerne l'exemplaire lui-même : il quitte la file.
const SALES_FULL = /ordres? en cours/i;
let salesRunning = false;
onStart(() => {
  chrome.storage.local.remove('sellFullMessage');
}); // un refus pris autrefois pour un marché plein par les versions de test de la 1.3.0

const readSales = async () => (await chrome.storage.local.get(SALES))[SALES] ?? null;
const writeSales = (q) => chrome.storage.local.set({ [SALES]: q });
const nCopies = (n) => `${n} doublon${n > 1 ? 's' : ''}`;
const salesPaused = async () => ((await chrome.storage.local.get(SALES_PAUSED))[SALES_PAUSED] ?? 0) > Date.now();


// Ajoute des exemplaires à ceux en attente (chacun une fois, SALES_MAX au plus), devant pour ceux qui attendaient déjà
// ; renvoie combien n'ont pas tenu.
async function parkSales(items, front = false) {
  const before = await readList(SALES_WAITING);
  const fresh = items.filter((x, i) => !before.some((y) => y.copyId === x.copyId) && items.findIndex((y) => y.copyId === x.copyId) === i);
  const all = front ? [...fresh, ...before] : [...before, ...fresh];
  await saveSalesWaiting({ [SALES_WAITING]: all.slice(0, SALES_MAX), ...(front || !before.length ? { [SALES_AT]: Date.now() } : {}) });
  return Math.max(0, all.length - SALES_MAX);
}

// Enregistre un changement des exemplaires en attente, daté, et l'envoie aux autres appareils du joueur un moment plus
// tard (la liste la plus récente de tous les appareils l'emporte).
let marketPush = 0;
async function saveSalesWaiting(items) {
  await chrome.storage.local.set({ ...items, sellWaitingAt: Date.now() });
  pushMarket();
}
function pushMarket() {
  clearTimeout(marketPush);
  marketPush = setTimeout(() => send({ type: 'market-sync', fresh: true }), 1500);
}

// La fenêtre du jeu a eu une vente refusée : un marché plein garde l'exemplaire en attente dans Aquaman. Le jeu arrête
// son « Mettre N en vente » au premier refus : les exemplaires encore cochés dans sa liste (ticked, lu par inject.js)
// attendent aussi, sans recliquer.
async function onSellRefused(item, message, ticked) {
  if (salesRunning || !SALES_FULL.test(message)) return; // les ventes d'Aquaman lui-même (script), ou un refus qui concerne l'exemplaire
  const batch = Date.now() - sellOneAt > 15e3; // pas le « Vendre » d'une ligne
  const named = (x) => ({ cardId: x.cardId, copyId: x.copyId, price: x.price, name: x.name ?? ticked.find((t) => t.copyId === x.copyId)?.name ?? 'Une carte' });
  const after = batch ? ticked.slice(Math.max(0, ticked.findIndex((t) => t.copyId === item.copyId))) : [];
  await parkSales([item, ...after].map(named));
}

// Dernier clic sur le « Vendre » d'une ligne de la fenêtre du jeu (la vente d'un exemplaire).
let sellOneAt = 0;
function onSellClick(e) {
  const b = e.target.closest?.('button');
  if (b && !b.closest('.aqm-root')) sellOneAt = b.textContent.trim() === 'Vendre' ? Date.now() : 0;
}

// Retente les exemplaires en attente (wait : temps depuis le dernier essai) : ils vont dans la file, et retournent en
// attente si le marché est toujours plein.
async function checkSales(wait = CHECK_EVERY) {
  if (stopped || (await salesPaused())) return;
  const waiting = await readList(SALES_WAITING);
  const q = await readSales();
  if (!waiting.length || q?.items.length) return;
  const { [SALES_AT]: at = 0 } = await chrome.storage.local.get(SALES_AT);
  if (Date.now() - at < wait) return;
  await saveSalesWaiting({ [SALES_WAITING]: [], [SALES_AT]: Date.now() });
  await writeSales({ items: waiting, total: waiting.length, done: 0, skipped: [], owner: null, beat: 0, until: 0, tries: 0, finishedAt: 0 });
  runSales();
}

async function stopSales() {
  const q = await readSales();
  if (!q) return;
  await parkSales(q.items, true);
  await writeSales({ ...q, items: [], stopped: true, finishedAt: Date.now() });
}

// Met en vente les exemplaires de la file, attend quand le jeu demande de ralentir, abandonne un exemplaire qu'il
// refuse, et remet le reste en attente dès que le marché est plein.
async function runSales() {
  if (salesRunning || stopped) return;
  const first = await readSales();
  if (!first?.items.length || busyElsewhere(first)) return;
  salesRunning = true;
  let gap = 900;
  try {
    while (!stopped) {
      let q = await readSales();
      if (!q?.items.length || busyElsewhere(q) || (await salesPaused())) break;
      const item = q.items[0];
      await writeSales({ ...q, owner: TAB, beat: Date.now(), until: 0 });
      try {
        await gameWrite('/market/orders', 'POST', { cardId: item.cardId, side: 'sell', price: item.price, copyId: item.copyId });
        q = await readSales();
        if (!q || q.finishedAt) break; // arrêté entre-temps
        const items = q.items.filter((x) => x.copyId !== item.copyId);
        await writeSales({ ...q, items, done: q.done + 1, tries: 0, beat: Date.now(), finishedAt: items.length ? 0 : Date.now() });
        chrome.storage.local.set({ [SALES_LAST]: { at: Date.now(), message: null, full: false } });
        if (items.length) await pause(gap);
      } catch (e) {
        q = await readSales();
        if (!q || q.finishedAt) break;
        const rest = q.items.filter((x) => x.copyId !== item.copyId);
        if (e.slowDown) {
          gap = Math.min(4000, gap * 1.5);
          const wait = slowWait(e);
          await writeSales({ ...q, tries: q.tries + 1, beat: Date.now(), until: Date.now() + wait });
          await pause(wait);
        } else if (SALES_FULL.test(e.message)) {
          chrome.storage.local.set({ [SALES_LAST]: { at: Date.now(), message: e.message, full: true } });
          await parkSales(q.items, true);
          await writeSales({ ...q, items: [], finishedAt: Date.now() });
        } else {
          // Cet exemplaire ne peut plus être vendu (vendu à la main, déjà en vente, échangé…) : les suivants
          // continuent.
          chrome.storage.local.set({ [SALES_LAST]: { at: Date.now(), message: e.message, full: false } });
          const skipped = [...q.skipped, { ...item, reason: e.message }];
          await writeSales({ ...q, items: rest, skipped, tries: 0, beat: Date.now(), finishedAt: rest.length ? 0 : Date.now() });
          if (rest.length) await pause(gap);
        }
      }
    }
  } finally {
    salesRunning = false;
  }
}

// Le cadre en bas de chaque page du jeu pendant que des exemplaires en attente partent en vente, puis ce qu'ils sont
// devenus (seulement quand au moins un a été vendu : un marché toujours plein ne change rien).
async function renderSalesBox() {
  const q = await readSales();
  const show = q && !q.stopped && (q.done > 0 || (q.items.length && q.items.length < q.total)) && location.pathname.startsWith('/jeu');
  if (!show || stopped) return void document.querySelector('.aqm-dock > .aqm-sales')?.remove();
  const box = dockBox('aqm-sales');
  const running = q.items.length > 0;
  const waiting = (await readList(SALES_WAITING)).length;
  const lines = [
    `✅ ${nCopies(q.done)} de la file d’attente d’Aquaman mis en vente.`,
    running
      ? q.until > Date.now()
        ? `Le jeu demande de ralentir : reprise dans ${Math.ceil((q.until - Date.now()) / 1000)} s.`
        : 'Une place s’est libérée sur le marché : les suivants partent.'
      : waiting
        ? `⏳ ${nCopies(waiting)} encore en attente : ils partiront aux prochaines ventes conclues.`
        : null,
    q.skipped.length ? `⛔ ${nCopies(q.skipped.length)} refusé${q.skipped.length > 1 ? 's' : ''} par le jeu (« ${q.skipped.at(-1).reason} »).` : null
  ];
  box.replaceChildren(
    ...[
      h('div', { class: 'aqm-queue-head' }, h('strong', {}, running ? `🏷️ Mise en vente des doublons · ${q.done}/${q.total}` : '🏷️ Doublons mis en vente'),
        h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => (running ? stopSales() : chrome.storage.local.remove(SALES)) }, running ? 'Arrêter' : 'OK')),
      running && h('span', { class: 'aqm-bar' }, h('span', { style: `width:${q.total ? ((100 * q.done) / q.total).toFixed(1) : 0}%` })),
      ...lines.map((line) => line && h('p', {}, line))
    ].filter(Boolean)
  );
}

// Le message « Vente conclue » du jeu : une place est libre sur le marché, les exemplaires en attente sont retentés
// tout de suite.
const saleToasts = new WeakSet();
function watchSaleToast() {
  for (const el of elementsWithText(document.body, /^\s*vente conclue\s*$/i)) {
    if (saleToasts.has(el)) continue;
    saleToasts.add(el);
    setTimeout(() => checkSales(0), 1500);
  }
}

// Dans la fenêtre « Vendre mes doublons » du jeu, sous tout son en-tête (titre, texte et bouton de fermeture),
// au-dessus de la barre « Tout cocher » : ce qu'Aquaman y ajoute, et ses exemplaires en attente.
const SELL_BAR = /^tout (d[ée])?cocher/i;
function markSellDialog() {
  if (!location.pathname.startsWith('/jeu')) return;
  for (const title of document.querySelectorAll('h1, h2, h3, [role="dialog"] [id]')) {
    if (title.closest('.aqm-root') || !/^vendre mes doublons$/i.test(title.textContent.trim())) continue;
    const bar = [...(title.closest('[role="dialog"]') ?? document).querySelectorAll('button')].find((b) => SELL_BAR.test(b.textContent.trim()));
    if (!bar) continue; // pas encore dessinée
    // La boîte commune au titre et à la barre, et son enfant qui contient la barre : le panneau va juste avant.
    let block = bar;
    while (block.parentElement && !block.parentElement.contains(title)) block = block.parentElement;
    if (!block.parentElement || block.parentElement === document.body || block.parentElement.querySelector(':scope > .aqm-sell-wait')) continue;
    // Aussi large que l'en-tête et la barre du jeu : le même espace de chaque côté qu'avant la barre.
    const panel = salesPanel();
    block.before(panel);
    const parent = block.parentElement;
    const inset = bar.getBoundingClientRect().left - parent.getBoundingClientRect().left - parseFloat(getComputedStyle(parent).paddingLeft || 0);
    if (inset > 0) panel.style.marginInline = `${Math.round(inset)}px`;
  }
}


// Les exemplaires en attente, tenus à jour tant qu'ils sont affichés ; sans aucun, ce que fait Aquaman quand le marché
// est plein.
function salesPanel() {
  const panel = h('div', { class: 'aqm-root aqm-fav-wait aqm-sell-wait', role: 'status' });
  let painted = false;
  const paint = async () => {
    if (stopped || !alive()) return void stop();
    if (!panel.isConnected && painted) return void stop();
    painted = true;
    const { [SALES]: q = null, [SALES_WAITING]: waiting = [], [SALES_AT]: at = 0, [SALES_LAST]: last = null } = await chrome.storage.local.get([SALES, SALES_WAITING, SALES_AT, SALES_LAST]);
    const sending = q?.items.length ?? 0;
    if (!waiting.length && !sending) {
      panel.replaceChildren(h('p', {}, `🔱 Aquaman : si le marché est plein, jusqu’à ${SALES_MAX} doublons de plus attendent dans Aquaman et sont mis en vente tout seuls, au prix choisi, dès qu’une de tes ventes se conclut.`));
      return;
    }
    const ago = Math.round((Date.now() - at) / 60e3);
    const next = Math.max(0, Math.ceil((at + CHECK_EVERY - Date.now()) / 60e3));
    panel.replaceChildren(
      h('div', { class: 'aqm-queue-head' },
        h('strong', {}, `⏳ File d’attente d’Aquaman · ${waiting.length}/${SALES_MAX}`),
        waiting.length
          ? h('button', {
              type: 'button',
              class: 'aqm-queue-btn',
              onclick: async () => {
                if (!confirm(`Retirer les ${nCopies(waiting.length)} de la file d’attente d’Aquaman ? Ceux déjà en vente y restent.`)) return;
                await saveSalesWaiting({ [SALES_WAITING]: [] });
              }
            }, 'Vider la file')
          : null),
      h('p', {}, `Le marché est plein : Aquaman garde le doublon refusé et ceux encore cochés après lui (${SALES_MAX} au plus) et les met en vente tout seul, au prix choisi, dès qu’une de tes ventes se conclut. Il vérifie en arrière-plan tant qu’une page du site est ouverte, même dans un autre onglet.`),
      waiting.length ? h('ul', { class: 'aqm-sell-waiting' }, waiting.map((x) => h('li', {}, h('span', {}, x.name), perles(x.price)))) : null,
      // Ce qu'a dit le jeu au dernier essai : ses propres mots, pour voir pourquoi les exemplaires attendent.
      last?.message
        ? h('p', { class: 'aqm-sell-last' }, `Dernière réponse du jeu ${timeAgo(last.at)} : « ${last.message} »${last.full ? ' (ses ventes et ses ordres d’achat en cours comptent ensemble).' : ' : ce doublon a été retiré de la file.'}`)
        : null,
      h('div', { class: 'aqm-queue-actions' },
        h('small', {}, sending
          ? `Une place s’est libérée : ${nCopies(sending)} en cours d’envoi.`
          : `Essayé ${at ? (ago ? `il y a ${ago} min` : 'à l’instant') : 'jamais'}${next ? `, prochain essai dans ${next} min` : ''}.`),
        sending ? null : h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => checkSales(0) }, 'Réessayer maintenant'))
    );
  };
  const onChange = (changes) => [SALES, SALES_WAITING, SALES_AT, SALES_LAST].some((k) => changes[k]) && paint();
  const timer = setInterval(paint, 5000);
  const stop = () => {
    clearInterval(timer);
    chrome.storage.onChanged.removeListener?.(onChange);
  };
  chrome.storage.onChanged.addListener(onChange);
  paint();
  return panel;
}
