// Aquaman: everything shown on the pages of poseidon-scans.net/jeu.
// Also built into the userscript (build.py), which defines OWNER and stand-ins for the extension APIs.
(() => {
  // ---------- one copy per tab ----------

  const owner = typeof OWNER === 'string' ? OWNER : 'extension';
  const root = document.documentElement;
  if (root.dataset.aqmOwner && root.dataset.aqmOwner !== owner) return;
  root.dataset.aqmOwner = owner;

  const RARITY_NAMES = { N: 'Commune', R: 'Rare', SR: 'Épique', SSR: 'Légendaire', UR: 'Mythique', SEC: 'Secrète' };
  const RANKED = ['N', 'R', 'SR', 'SSR', 'UR', 'SEC'];
  const TYPE_NAMES = { magie: 'Magie', action: 'Action', 'arts-martiaux': 'Arts martiaux', romance: 'Romance', waifu: 'Waifu', mechant: 'Méchants' };
  const TOUR_HASH = '#aqm-visite';
  const NEWS_HASH = '#aqm-nouveautes';
  const TOUR_STEP = 'aqm-tour-step'; // sessionStorage: step to resume after a page load
  const AUTHOR_ID = 'cmoht6nr312u6qs135zjtdojg'; // the author's account: the only one shown "Joueurs avec Aquaman"
  let meId = null;

  const ICON_DOTS =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M144,128a16,16,0,1,1-16-16A16,16,0,0,1,144,128ZM60,112a16,16,0,1,0,16,16A16,16,0,0,0,60,112Zm136,0a16,16,0,1,0,16,16A16,16,0,0,0,196,112Z"/></svg>';
  const ICON_CHART =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M232,208a8,8,0,0,1-8,8H32a8,8,0,0,1-8-8V48a8,8,0,0,1,16,0V156.69l50.34-50.35a8,8,0,0,1,11.32,0L128,132.69,180.69,80H160a8,8,0,0,1,0-16h40a8,8,0,0,1,8,8v40a8,8,0,0,1-16,0V91.31l-58.34,58.35a8,8,0,0,1-11.32,0L96,123.31l-56,56V200H224A8,8,0,0,1,232,208Z"/></svg>';
  const ICON_TROPHY =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M232,64H208V48a8,8,0,0,0-8-8H56a8,8,0,0,0-8,8V64H24A16,16,0,0,0,8,80V96a40,40,0,0,0,40,40h3.65A80.13,80.13,0,0,0,120,191.61V216H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16H136V191.58c31.94-3.23,58.44-25.64,68.08-55.58H208a40,40,0,0,0,40-40V80A16,16,0,0,0,232,64ZM48,120A24,24,0,0,1,24,96V80H48v32q0,4,.39,8Zm144-8.9c0,35.52-28.49,64.64-63.51,64.9H128a64,64,0,0,1-64-64V56H192ZM232,96a24,24,0,0,1-24,24h-.5a81.81,81.81,0,0,0,.5-8.9V80h24Z"/></svg>';
  const ICON_PACK =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M184,72H40A16,16,0,0,0,24,88V200a16,16,0,0,0,16,16H184a16,16,0,0,0,16-16V88A16,16,0,0,0,184,72Zm0,128H40V88H184V200ZM232,56V176a8,8,0,0,1-16,0V56H64a8,8,0,0,1,0-16H216A16,16,0,0,1,232,56Z"/></svg>';
  const ICON_X =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
  const ICON_COMPASS =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216ZM172.42,72.84l-64,32a8.05,8.05,0,0,0-3.58,3.58l-32,64A8,8,0,0,0,80,184a8.1,8.1,0,0,0,3.58-.84l64-32a8.05,8.05,0,0,0,3.58-3.58l32-64a8,8,0,0,0-10.74-10.74ZM138,138,97.89,158.11,118,118l40.15-20.07Z"/></svg>';
  const ICON_GEAR =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Z"/></svg>';
  const ICON_SPARK =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M197.58,129.06,146,110l-19-51.62a15.92,15.92,0,0,0-29.88,0L78,110l-51.62,19a15.92,15.92,0,0,0,0,29.88L78,178l19,51.62a15.92,15.92,0,0,0,29.88,0L146,178l51.62-19a15.92,15.92,0,0,0,0-29.88ZM137,164.22a8,8,0,0,0-4.74,4.74L112,223.85,91.78,169A8,8,0,0,0,87,164.22L32.15,144,87,123.78A8,8,0,0,0,91.78,119L112,64.15,132.22,119a8,8,0,0,0,4.74,4.74L191.85,144ZM144,40a8,8,0,0,1,8-8h16V16a8,8,0,0,1,16,0V32h16a8,8,0,0,1,0,16H184V64a8,8,0,0,1-16,0V48H152A8,8,0,0,1,144,40ZM248,88a8,8,0,0,1-8,8h-8v8a8,8,0,0,1-16,0V96h-8a8,8,0,0,1,0-16h8V72a8,8,0,0,1,16,0v8h8A8,8,0,0,1,248,88Z"/></svg>';
  const ICON_SEARCH =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/></svg>';
  const ICON_STAR =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M239.18,97.26A16.38,16.38,0,0,0,224.92,86l-59-4.76L143.14,26.15a16.36,16.36,0,0,0-30.27,0L90.11,81.23,31.08,86a16.46,16.46,0,0,0-9.37,28.86l45,38.83L53,211.75a16.38,16.38,0,0,0,24.5,17.82L128,198.49l50.53,31.08A16.4,16.4,0,0,0,203,211.75l-13.76-58.07,45-38.83A16.43,16.43,0,0,0,239.18,97.26Zm-15.34,5.47-48.7,42a8,8,0,0,0-2.56,7.91l14.88,62.8a.37.37,0,0,1-.17.48c-.18.14-.23.11-.38,0l-54.72-33.65a8,8,0,0,0-8.38,0L69.09,215.94c-.15.09-.19.12-.38,0a.37.37,0,0,1-.17-.48l14.88-62.8a8,8,0,0,0-2.56-7.91l-48.7-42c-.12-.1-.23-.19-.13-.5s.18-.27.33-.29l63.92-5.16A8,8,0,0,0,103,91.86l24.62-59.61c.08-.17.11-.25.35-.25s.27.08.35.25L153,91.86a8,8,0,0,0,6.75,4.92l63.92,5.16c.15,0,.24,0,.33.29S224,102.63,223.84,102.73Z"/></svg>';
  const ICON_PEARL = '<span class="aqm-pearl" aria-hidden="true"></span>';

  const nf = new Intl.NumberFormat('fr-FR');
  const fmt = (n) => nf.format(Math.round(n || 0));
  const dec = (n, digits = 2) => (n || 0).toLocaleString('fr-FR', { maximumFractionDigits: digits });
  const pct = (p) => {
    const v = 100 * (p || 0);
    return `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 0.1 ? 3 : v < 10 ? 2 : 1 })} %`;
  };

  // ---------- messages ----------

  // False once the extension was reloaded or updated: this copy then cleans up and stops.
  const alive = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };
  // The extension reloaded or updated while this page stayed open: its storage and messages throw "Extension context
  // invalidated" from any timer still running. This copy of Aquaman stops at the first one, quietly (the page's next
  // load brings the new one).
  const GONE = /extension context invalidated/i;
  const onGone = (e) => {
    if (!GONE.test(String(e.reason?.message ?? e.error?.message ?? e.message ?? ''))) return;
    e.preventDefault();
    shutdown();
  };
  addEventListener('unhandledrejection', onGone);
  addEventListener('error', onGone);

  // Message to the background worker; null when it can't answer.
  async function send(msg) {
    if (!alive()) return shutdown(), null;
    try {
      return (await chrome.runtime.sendMessage(msg)) ?? null;
    } catch {
      return null;
    }
  }

  // Answer of a data message, or an error with a message for the player.
  async function ask(msg) {
    const res = await send(msg);
    if (!res) throw new Error('Aquaman ne répond pas : recharge la page.');
    if (res.error) throw new Error(res.error === 'unknown_message' ? 'Aquaman ne répond pas : recharge la page.' : res.error);
    return res;
  }

  // ---------- changes sent from the page ----------

  // The game refuses changes that don't come from its own pages: they are sent from here (with content.fetch on
  // Firefox, which sends them as the page), never from the background worker.
  const pageFetch = typeof content !== 'undefined' && content?.fetch ? content.fetch.bind(content) : window.fetch.bind(window);

  async function gameWrite(path, method, data) {
    const headers = data === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' };
    const res = await pageFetch(`/api-game/v1${path}`, { method, credentials: 'include', headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(body?.error?.message || `Erreur ${res.status}`);
      // "Doucement ! Réessaie dans un instant." : the game asks to slow down, the change can be sent again.
      error.slowDown = res.status === 429 || /doucement|r[ée]essaie|trop de requ/i.test(error.message);
      // The wait the game asks for: its Retry-After header, else the seconds in its message ("Réessaie dans 12 s").
      error.wait = (Number(res.headers?.get?.('retry-after')) || Number(error.message.match(/(\d+)\s*(?:s\b|sec)/i)?.[1]) || 0) * 1000;
      throw error;
    }
    // Perles or cards changed (a sale, a withdrawal…): the game reads them again from the API (inject.js). The
    // extension's requests don't go through the page's fetch, where inject.js sees the game's own.
    if (method !== 'GET' && /^\/(market|trades|auctions|copies)\//.test(path)) window.postMessage({ aquamanCmd: 'reload-game', assets: true }, location.origin);
    return body;
  }

  // Puts one card in the player's search list (on) or takes it out (also out of the cards waiting in Aquaman).
  async function wantCard(id, on) {
    if (!on && (await takeWaiting([id]))) {
      send({ type: 'wants-changed' });
      return { wanted: false };
    }
    const res = await gameWrite(`/cards/${encodeURIComponent(id)}/want`, on ? 'PUT' : 'DELETE');
    send({ type: 'wants-changed' });
    return { wanted: !!res?.wanted };
  }

  // ---------- search list: a queue that goes on through page changes ----------
  // The cards to search are kept in the storage: any open page of the game sends them, one at a time, at the pace the
  // game accepts, and goes on after a change of page or a reload. One tab works at a time (the "owner", with a heartbeat).

  const QUEUE = 'wantQueue';
  const TAB = Math.random().toString(36).slice(2);
  const STALE = 10e3; // a tab silent for this long hands the queue over
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const playersSeen = new Map(); // folded name -> id of the players whose cards the game read (inject.js)
  const foldName = (s) =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  let batch = null; // { kind, before, opened }: the last "Tout ouvrir", the boosters of its kind then, how many it opened (markOpenMore)
  let queueRunning = false;
  let settled = false; // the page was taken over by React: Aquaman may change it (see whenSettled)

  // The features the player turned off ("Plus › Réglages" or the extension's popup), read at start; a change applies
  // once the page is loaded again.
  let feat = {};
  let featLoaded = false;
  const on = (key) => feat[key] !== false;
  const featReady = chrome.storage.local
    .get('settings')
    .then(({ settings }) => (feat = settings ?? {}))
    .catch(() => {})
    .finally(() => (featLoaded = true));

  const readQueue = async () => (await chrome.storage.local.get(QUEUE))[QUEUE] ?? null;
  const writeQueue = (q) => chrome.storage.local.set({ [QUEUE]: q });
  // The wait before sending again when the game asks to slow down: the time it gives (5 s when it gives none) and 1 s
  // more. Never a refusal: the card or copy waits its turn.
  const slowWait = (e) => (e.wait || 5000) + 1000;

  // True when another tab is working on the queue right now.
  const busyElsewhere = (q) => !!q.owner && q.owner !== TAB && (Date.now() - q.beat < STALE || Date.now() < (q.until || 0) + STALE);

  // The game takes 100 cards at most in the search list: the others wait in Aquaman (WAITING) and are sent as places
  // free up, when the player gets cards of the list. SENT: the cards Aquaman put in the list, taken out once owned.
  const WAITING = 'wantWaiting';
  const SENT = 'wantSent';
  const LIMIT = 'wantLimit';
  const REFILL = 'wantRefillAt'; // last check of the free places, by any tab
  const WAIT_MAX = 200; // cards waiting in Aquaman at most, on top of the game's list
  const ENTERED = 'wantEntered'; // waiting cards gone into the game's list (or obtained) since the waiting list began
  const CHECK_EVERY = 120e3;
  const FULL = /d[ée]j[àa]\s*(\d+)|retire|limite|maximum|plein/i; // the game's answer when the list is full

  const readList = async (key) => (await chrome.storage.local.get(key))[key] ?? [];

  // Saves a change of the waiting cards (or of those Aquaman put in the game's list), stamped with its time, and sends
  // it to the player's other devices a moment later.
  let wantsPush = 0;
  async function saveWants(items) {
    await chrome.storage.local.set({ ...items, wantsAt: Date.now() });
    clearTimeout(wantsPush);
    wantsPush = setTimeout(() => send({ type: 'wants-sync', fresh: true }), 1500);
  }

  // Adds cards at the end of the waiting ones (each once, WAIT_MAX at most); returns how many were added, and how
  // many didn't fit.
  async function park(ids) {
    const waiting = await readList(WAITING);
    const fresh = ids.filter((id) => !waiting.includes(id));
    const fit = fresh.slice(0, Math.max(0, WAIT_MAX - waiting.length));
    if (fit.length) await saveWants({ [WAITING]: [...waiting, ...fit], ...(waiting.length ? {} : { [ENTERED]: 0 }) });
    return { parked: fit.length, over: fresh.length - fit.length };
  }

  // Takes cards out of the waiting ones; returns how many were there.
  async function takeWaiting(ids) {
    const waiting = await readList(WAITING);
    const left = waiting.filter((id) => !ids.includes(id));
    if (left.length !== waiting.length) await saveWants({ [WAITING]: left });
    return waiting.length - left.length;
  }

  // Adds cards to the queue (each once); returns { sent } with how many were added. While cards wait for a place,
  // the new ones wait behind them: { parked, over } (see park).
  async function enqueueWants(ids, refill = false) {
    if (!refill && (await readList(WAITING)).length) {
      const r = await park(ids);
      checkRoom(20e3);
      return r;
    }
    let q = await readQueue();
    if (!q || q.finishedAt) q = { ids: [], total: 0, done: 0, refused: null, owner: null, beat: 0, until: 0, tries: 0, finishedAt: 0 };
    const fresh = ids.filter((id) => !q.ids.includes(id));
    q.ids.push(...fresh);
    q.total += fresh.length;
    q.refill = refill && q.refill !== false; // cards added by the player show the box
    await writeQueue(q);
    runQueue();
    return { sent: fresh.length };
  }

  const nCards = (n) => `${n} carte${n > 1 ? 's' : ''}`;
  // Cards that didn't fit in the waiting ones.
  const overNote = (over) => (over ? ` ${nCards(over)} de trop : Aquaman en garde ${WAIT_MAX} en attente au plus.` : '');

  // What became of the cards given to enqueueWants (r: its answer).
  function wantsNote(r, free) {
    if (r.sent == null)
      return `Ta liste du jeu est pleine : ${nCards(r.parked)} de plus en attente dans Aquaman, ajoutée${r.parked > 1 ? 's' : ''} au fur et à mesure que tu obtiens les cartes recherchées.` + overNote(r.over);
    return `${nCards(r.sent)} en cours d’ajout : ${free}, la progression reste affichée (en haut de Séries favorites et en bas de l’écran).`;
  }

  // Sends waiting cards when the search list has free places: first takes out the cards Aquaman put there that the
  // player now owns. Runs after the collection changed, and every 2 minutes (wait: time since the last check).
  let roomBusy = false;
  async function checkRoom(wait = CHECK_EVERY) {
    if (stopped || roomBusy) return;
    roomBusy = true;
    try {
      await refill(wait);
    } finally {
      roomBusy = false;
    }
  }

  async function refill(wait) {
    const waiting = await readList(WAITING);
    if (!waiting.length) return;
    const q = await readQueue();
    if (q?.ids.length) return; // the queue first
    const { [REFILL]: at = 0, [LIMIT]: limit = 100 } = await chrome.storage.local.get([REFILL, LIMIT]);
    if (Date.now() - at < wait) return;
    await chrome.storage.local.set({ [REFILL]: Date.now() });
    const room = await send({ type: 'want-room', waiting, sent: await readList(SENT) });
    if (!room || room.error || stopped) return;
    let freed = 0;
    for (const id of room.obtained) {
      try {
        await gameWrite(`/cards/${encodeURIComponent(id)}/want`, 'DELETE');
        freed++;
      } catch {}
      await pause(900);
    }
    // Cards added or taken out of the waiting ones meanwhile are kept as they are.
    const now = await readList(WAITING);
    const left = now.filter((id) => !waiting.includes(id) || room.waiting.includes(id));
    const places = Math.max(0, limit - room.count + freed);
    // Waiting cards already searched or obtained count as done.
    const entered = (await chrome.storage.local.get(ENTERED))[ENTERED] ?? 0;
    await saveWants({ [SENT]: room.sent, [WAITING]: left.slice(places), [ENTERED]: entered + waiting.length - room.waiting.length });
    if (freed) send({ type: 'wants-changed' });
    if (places && left.length) await enqueueWants(left.slice(0, places), true);
  }

  async function stopQueue() {
    const q = await readQueue();
    if (!q) return;
    await writeQueue({ ...q, ids: [], refused: null, stopped: true, finishedAt: Date.now() });
  }

  // Sends the cards of the queue, waits when the game asks to slow down, stops at a real refusal (a full search list).
  async function runQueue() {
    if (queueRunning || stopped) return;
    const first = await readQueue();
    if (!first?.ids.length || busyElsewhere(first)) return;
    queueRunning = true;
    let gap = 900;
    try {
      while (!stopped) {
        let q = await readQueue();
        if (!q?.ids.length || busyElsewhere(q)) break;
        const id = q.ids[0];
        await writeQueue({ ...q, owner: TAB, beat: Date.now(), until: 0 });
        try {
          await gameWrite(`/cards/${encodeURIComponent(id)}/want`, 'PUT');
          q = await readQueue();
          if (!q || q.finishedAt) break; // stopped meanwhile
          const ids = q.ids.filter((x) => x !== id);
          const { [SENT]: sent = [], [ENTERED]: entered = 0 } = await chrome.storage.local.get([SENT, ENTERED]);
          await saveWants({ [SENT]: sent.includes(id) ? sent : [...sent, id], ...(q.refill ? { [ENTERED]: entered + 1 } : {}) });
          await writeQueue({ ...q, ids, done: q.done + 1, tries: 0, beat: Date.now(), finishedAt: ids.length ? 0 : Date.now() });
          if (ids.length) await pause(gap);
        } catch (e) {
          q = await readQueue();
          if (!q || q.finishedAt) break;
          if (e.slowDown) {
            gap = Math.min(4000, gap * 1.5);
            const wait = slowWait(e);
            await writeQueue({ ...q, tries: q.tries + 1, beat: Date.now(), until: Date.now() + wait });
            await pause(wait);
          } else if (FULL.test(e.message)) {
            // The search list is full: the rest waits in Aquaman for free places.
            const limit = Number(e.message.match(FULL)?.[1]);
            if (limit > 0) await chrome.storage.local.set({ [LIMIT]: limit });
            const before = await readList(WAITING);
            const waiting = [...q.ids, ...before.filter((x) => !q.ids.includes(x))];
            const parked = Math.min(q.ids.length, WAIT_MAX);
            await saveWants({ [WAITING]: waiting.slice(0, WAIT_MAX), [REFILL]: Date.now(), ...(before.length || q.refill ? {} : { [ENTERED]: 0 }) });
            await writeQueue({ ...q, parked, over: q.ids.length - parked, ids: [], finishedAt: Date.now() });
          } else await writeQueue({ ...q, refused: e.message, left: q.ids.length, ids: [], finishedAt: Date.now() });
        }
      }
    } finally {
      queueRunning = false;
      send({ type: 'wants-changed' });
    }
  }

  // The box at the bottom of every page of the game: the cards being added by the player. The waiting cards go in
  // the background, without a box (their progress is in the favourite series).
  async function renderBox() {
    const q = await readQueue();
    if (!stopped) renderQueue(q && !q.refill ? q : null);
  }

  // The search of the player and the waiting cards, for the favourite series, kept up to date while it is shown:
  // a bar in three parts (in the game's list / being sent / waiting in Aquaman). changed: called when cards were
  // taken out of the waiting ones, or when an adding ended (the series then show what is left to search).
  function searchPanel(changed) {
    const panel = h('div', { class: 'aqm-fav-wait', role: 'status', hidden: true });
    let wasRunning = null;
    const paint = async () => {
      if (stopped || !alive()) return void stop();
      if (!panel.isConnected && wasRunning !== null) return void stop();
      const { [QUEUE]: q = null, [WAITING]: waiting = [], [ENTERED]: entered = 0, [REFILL]: at = 0, [LIMIT]: limit = 100 } =
        await chrome.storage.local.get([QUEUE, WAITING, ENTERED, REFILL, LIMIT]);
      const running = !!q?.ids.length;
      if (wasRunning && !running) changed?.();
      wasRunning = running;
      const parts = [];
      const slow = running && q.until > Date.now() ? ` Le jeu demande de ralentir : reprise dans ${Math.ceil((q.until - Date.now()) / 1000)} s.` : '';

      // The cards the player just asked for.
      if (running && !q.refill)
        parts.push(
          h('div', { class: 'aqm-queue-head' }, h('strong', {}, `🔭 Ajout à ta liste du jeu · ${q.done}/${q.total}`)),
          h('span', { class: 'aqm-bar' }, h('span', { style: `width:${q.total ? ((100 * q.done) / q.total).toFixed(1) : 0}%` })),
          h('p', {}, `Les cartes entrent une à une dans ta liste de recherches du jeu (${limit} cartes au plus) ; au-delà, elles passent dans la file d’attente d’Aquaman.${slow}`)
        );

      // The waiting cards.
      const sending = running && q.refill ? q.ids.length : 0;
      const total = entered + sending + waiting.length;
      if (waiting.length || sending) {
        const pc = (n) => `${((100 * n) / total).toFixed(1)}%`;
        const ago = Math.round((Date.now() - at) / 60e3);
        const next = Math.max(0, Math.ceil((at + CHECK_EVERY - Date.now()) / 60e3));
        parts.push(
          h('div', { class: 'aqm-queue-head' },
            h('strong', {}, `⏳ File d’attente d’Aquaman · ${entered}/${total}`),
            h('button', {
              type: 'button',
              class: 'aqm-queue-btn',
              onclick: async () => {
                if (!confirm(`Retirer les ${nCards(waiting.length)} de la file d’attente d’Aquaman ? Celles déjà dans ta liste du jeu y restent.`)) return;
                await chrome.storage.local.remove([WAITING, ENTERED]);
                await send({ type: 'wants-changed' });
                changed?.();
              }
            }, 'Vider la file')),
          h('p', {}, `Ta liste de recherches du jeu est pleine (${limit} cartes). Aquaman garde les suivantes (${WAIT_MAX} au plus) et les y ajoute tout seul dès qu’une place se libère : quand tu obtiens une carte que tu recherches.`),
          h('span', { class: 'aqm-steps' },
            h('span', { class: 'is-in', style: `width:${pc(entered)}` }),
            h('span', { class: 'is-sending', style: `width:${pc(sending)}` }),
            h('span', { class: 'is-waiting', style: `width:${pc(waiting.length)}` })),
          h('div', { class: 'aqm-steps-legend' },
            h('span', { class: 'is-in' }, `${entered} entrée${entered > 1 ? 's' : ''} dans ta liste`),
            sending ? h('span', { class: 'is-sending' }, `${sending} en cours d’envoi`) : null,
            h('span', { class: 'is-waiting' }, `${waiting.length} en attente`)),
          h('div', { class: 'aqm-queue-actions' },
            h('small', {}, sending
              ? `Des places se sont libérées : envoi en cours.${slow}`
              : `Places vérifiées ${at ? (ago ? `il y a ${ago} min` : 'à l’instant') : 'jamais'}${next ? `, prochaine vérification dans ${next} min` : ''}.`),
            sending ? null : h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => checkRoom(0) }, 'Vérifier maintenant'))
        );
      }
      panel.hidden = !parts.length;
      panel.replaceChildren(...parts);
    };
    const onChange = (changes) => [QUEUE, WAITING, ENTERED, REFILL].some((k) => changes[k]) && paint();
    const timer = setInterval(paint, 5000);
    const stop = () => {
      clearInterval(timer);
      chrome.storage.onChanged.removeListener?.(onChange);
    };
    chrome.storage.onChanged.addListener(onChange);
    paint();
    return panel;
  }

  // The cards being added: progress, then the result.
  function renderQueue(q) {
    if (!q || (!q.ids.length && !q.finishedAt) || !location.pathname.startsWith('/jeu')) return void document.querySelector('.aqm-dock > .aqm-wants')?.remove();
    const box = dockBox('aqm-wants');
    const running = q.ids.length > 0;
    const added = `${nCards(q.done)} ajoutée${q.done > 1 ? 's' : ''} à ta liste de recherches du jeu`;
    let title;
    let lines;
    if (running) {
      title = `🔭 Recherche des manquantes · ${q.done}/${q.total}`;
      lines = [
        q.until > Date.now()
          ? `Le jeu demande de ralentir : reprise dans ${Math.ceil((q.until - Date.now()) / 1000)} s.`
          : 'La recherche continue même si tu changes de page ou ouvres des boosters.'
      ];
    } else if (q.stopped) {
      title = '🔭 Recherche arrêtée';
      lines = [`✅ ${added}.`];
    } else if (q.refused) {
      title = '🔭 Recherche interrompue';
      lines = [`✅ ${added}.`, `⛔ Le jeu a refusé la suite (« ${q.refused} ») : ${nCards(q.left)} non ajoutée${q.left > 1 ? 's' : ''}.`];
    } else if (q.parked) {
      title = '🔭 Ta liste du jeu est pleine';
      lines = [
        `✅ ${added}.`,
        `⏳ ${nCards(q.parked)} mise${q.parked > 1 ? 's' : ''} dans la file d’attente d’Aquaman : ${q.parked > 1 ? 'elles seront ajoutées' : 'elle sera ajoutée'} toute${q.parked > 1 ? 's' : ''} seule${q.parked > 1 ? 's' : ''} dès qu’une place se libère, quand tu obtiens une carte que tu recherches.`,
        q.over ? `⛔ ${nCards(q.over)} non gardée${q.over > 1 ? 's' : ''} : la file d’attente est pleine (${WAIT_MAX} cartes).` : null,
        'Suis la file dans Plus › Séries favorites.'
      ];
    } else {
      title = '🔭 Recherche terminée';
      lines = [`✅ ${added}.`, 'Le jeu te prévient quand elles sont mises en vente.'];
    }
    // The bar only while cards are sent (replaceChildren would show a null as text).
    box.replaceChildren(
      ...[
        h('div', { class: 'aqm-queue-head' }, h('strong', {}, title),
          h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => (running ? stopQueue() : chrome.storage.local.remove(QUEUE)) }, running ? 'Arrêter' : 'OK')),
        running && h('span', { class: 'aqm-bar' }, h('span', { style: `width:${q.total ? ((100 * q.done) / q.total).toFixed(1) : 0}%` })),
        ...lines.map((line) => line && h('p', {}, line))
      ].filter(Boolean)
    );
  }

  // A box of the bottom right corner (the cards being added, the duplicates being put on sale), one above the other.
  function dockBox(cls) {
    let box = document.querySelector(`.aqm-dock > .${cls}`);
    if (box) return box;
    const dock = document.querySelector('.aqm-dock') ?? document.body.appendChild(h('div', { class: 'aqm-root aqm-dock' }));
    return dock.appendChild(h('div', { class: `aqm-queue ${cls}`, role: 'status' }));
  }

  // ---------- duplicates on sale: a queue like the search list's ----------
  // The game's "Vendre mes doublons" window puts the copies on the market itself. When the market takes no more of the
  // player's sales, each copy it refuses ({ cardId, copyId, price, name }, read by inject.js) waits in Aquaman
  // (SALES_MAX at most) and is tried again every 2 minutes, by one tab at a time: a sale concluded frees a place.

  const SALES = 'sellQueue';
  const SALES_WAITING = 'sellWaiting';
  const SALES_AT = 'sellCheckAt'; // last try of the waiting copies, by any tab
  const SALES_LAST = 'sellLastAnswer'; // the game's last answer to a try of the waiting copies: { at, message, full }
  const SALES_PAUSED = 'sellPausedUntil'; // the waiting copies are not tried until then (the sales being withdrawn)
  const SALES_MAX = 50;
  // The game's answer when its market is full: "50 ordres en cours au plus." (its sales and purchase orders together).
  // Any other refusal is about the copy itself: it leaves the queue.
  const SALES_FULL = /ordres? en cours/i;
  let salesRunning = false;
  chrome.storage.local.remove('sellFullMessage'); // a refusal once taken for a full market by the test builds of version 1.3.0

  const readSales = async () => (await chrome.storage.local.get(SALES))[SALES] ?? null;
  const writeSales = (q) => chrome.storage.local.set({ [SALES]: q });
  const nCopies = (n) => `${n} doublon${n > 1 ? 's' : ''}`;
  const salesPaused = async () => ((await chrome.storage.local.get(SALES_PAUSED))[SALES_PAUSED] ?? 0) > Date.now();


  // Adds copies to the waiting ones (each once, SALES_MAX at most), at the front for those that were waiting already;
  // returns how many didn't fit.
  async function parkSales(items, front = false) {
    const before = await readList(SALES_WAITING);
    const fresh = items.filter((x, i) => !before.some((y) => y.copyId === x.copyId) && items.findIndex((y) => y.copyId === x.copyId) === i);
    const all = front ? [...fresh, ...before] : [...before, ...fresh];
    await saveSalesWaiting({ [SALES_WAITING]: all.slice(0, SALES_MAX), ...(front || !before.length ? { [SALES_AT]: Date.now() } : {}) });
    return Math.max(0, all.length - SALES_MAX);
  }

  // Saves a change of the waiting copies, stamped with its time, and sends it to the player's other devices a moment
  // later (the most recent list of any device wins).
  let marketPush = 0;
  async function saveSalesWaiting(items) {
    await chrome.storage.local.set({ ...items, sellWaitingAt: Date.now() });
    pushMarket();
  }
  function pushMarket() {
    clearTimeout(marketPush);
    marketPush = setTimeout(() => send({ type: 'market-sync', fresh: true }), 1500);
  }

  // The game's window had a sale refused: a full market keeps the copy waiting in Aquaman. The game stops its "Mettre N
  // en vente" at the first refusal: the copies still ticked in its list (ticked, read by inject.js) wait too, without
  // clicking again.
  async function onSellRefused(item, message, ticked) {
    if (salesRunning || !SALES_FULL.test(message)) return; // Aquaman's own sales (userscript), or a refusal about the copy
    const batch = Date.now() - sellOneAt > 15e3; // not the "Vendre" of one row
    const named = (x) => ({ cardId: x.cardId, copyId: x.copyId, price: x.price, name: x.name ?? ticked.find((t) => t.copyId === x.copyId)?.name ?? 'Une carte' });
    const after = batch ? ticked.slice(Math.max(0, ticked.findIndex((t) => t.copyId === item.copyId))) : [];
    await parkSales([item, ...after].map(named));
  }

  // Last click on the "Vendre" of one row of the game's window (a sale of one copy).
  let sellOneAt = 0;
  function onSellClick(e) {
    const b = e.target.closest?.('button');
    if (b && !b.closest('.aqm-root')) sellOneAt = b.textContent.trim() === 'Vendre' ? Date.now() : 0;
  }

  // Tries the waiting copies again (wait: time since the last try): they go to the queue, and back to the waiting
  // ones if the market is still full.
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

  // Puts the copies of the queue on sale, waits when the game asks to slow down, drops a copy it refuses, and puts
  // the rest back in the waiting ones once the market is full.
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
          if (!q || q.finishedAt) break; // stopped meanwhile
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
            // This copy can't be sold any more (sold by hand, already on sale, traded…): the next ones go on.
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

  // The box at the bottom of every page of the game while waiting copies go on sale, then what became of them (only
  // when at least one was sold: a market still full changes nothing).
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

  // The game's "Vente conclue" toast: a place is free on the market, the waiting copies are tried right away.
  const saleToasts = new WeakSet();
  function watchSaleToast() {
    for (const el of elementsWithText(document.body, /^\s*vente conclue\s*$/i)) {
      if (saleToasts.has(el)) continue;
      saleToasts.add(el);
      setTimeout(() => checkSales(0), 1500);
    }
  }

  // In the game's "Vendre mes doublons" window, under its whole head (title, text and close button), above the bar
  // "Tout cocher": what Aquaman adds to it, and its waiting copies.
  const SELL_BAR = /^tout (d[ée])?cocher/i;
  function markSellDialog() {
    if (!location.pathname.startsWith('/jeu')) return;
    for (const title of document.querySelectorAll('h1, h2, h3, [role="dialog"] [id]')) {
      if (title.closest('.aqm-root') || !/^vendre mes doublons$/i.test(title.textContent.trim())) continue;
      const bar = [...(title.closest('[role="dialog"]') ?? document).querySelectorAll('button')].find((b) => SELL_BAR.test(b.textContent.trim()));
      if (!bar) continue; // not drawn yet
      // The box shared by the title and the bar, and its child that holds the bar: the panel goes just before it.
      let block = bar;
      while (block.parentElement && !block.parentElement.contains(title)) block = block.parentElement;
      if (!block.parentElement || block.parentElement === document.body || block.parentElement.querySelector(':scope > .aqm-sell-wait')) continue;
      // As wide as the game's head and bar: the same space on each side as before the bar.
      const panel = salesPanel();
      block.before(panel);
      const parent = block.parentElement;
      const inset = bar.getBoundingClientRect().left - parent.getBoundingClientRect().left - parseFloat(getComputedStyle(parent).paddingLeft || 0);
      if (inset > 0) panel.style.marginInline = `${Math.round(inset)}px`;
    }
  }

  // The market: once a card is bought, its other sales are hidden for good (the player has it now), kept in
  // Aquaman's storage.
  const BOUGHT_KEY = 'marketBought';
  // The cards bought: "rarity|name" in lower case (the rarity's code: n, r, sr, ssr, ur, sec), the same character in
  // another rarity stays shown. (A name alone: kept by the first days of this, any rarity.)
  const boughtNames = new Set();
  (async () => {
    try {
      for (const key of (await chrome.storage.local.get(BOUGHT_KEY))[BOUGHT_KEY] ?? []) boughtNames.add(key);
    } catch {}
    hideBoughtCards();
  })();
  function addBought(name, rarity) {
    const code = RANKED.includes(rarity) ? rarity.toLowerCase() : '';
    boughtNames.add(code ? `${code}|${name.trim().toLowerCase()}` : name.trim().toLowerCase());
    try {
      chrome.storage.local.set({ [BOUGHT_KEY]: [...boughtNames] });
    } catch {}
    pushMarket(); // to the player's other devices
    hideBoughtCards();
  }
  const BUY_BUTTON = /^(acheter|confirmer|trop cher)$/i;
  // The sales shown by the market: each is the highest box around its "Acheter" holding no other sale, with its texts
  // in lower case (the card's name, its series, its rarity as the game writes it: "N" and "Commune").
  // (the boxes are counted in one pass, the texts read only for the tiles that need them)
  function marketTiles() {
    const buys = [...document.querySelectorAll('button')].filter((b) => !b.closest('.aqm-root') && BUY_BUTTON.test(b.textContent.trim()));
    const held = new Map();
    for (const b of buys) for (let el = b.parentElement; el && el !== document.body; el = el.parentElement) held.set(el, (held.get(el) ?? 0) + 1);
    return buys.map((b) => {
      let tile = b;
      while (tile.parentElement && tile.parentElement !== document.body && held.get(tile.parentElement) === 1) tile = tile.parentElement;
      let texts = null;
      return {
        tile,
        get texts() {
          return (texts ??= new Set([...tile.querySelectorAll('*')].filter((el) => !el.childElementCount).map((el) => el.textContent.trim().toLowerCase())));
        }
      };
    });
  }

  function hideBoughtCards() {
    if (!on('hideBought') || !boughtNames.size || !location.pathname.startsWith('/jeu')) return;
    for (const t of marketTiles()) {
      const { tile } = t;
      if (tile.hasAttribute('data-aqm-bought')) continue;
      const { texts } = t;
      const rarity = RANKED.find((code) => texts.has(code.toLowerCase()) || texts.has(RARITY_NAMES[code].toLowerCase()))?.toLowerCase();
      const hidden = [...texts].some((t) => boughtNames.has(t) || (rarity && boughtNames.has(`${rarity}|${t}`)));
      if (hidden) tile.setAttribute('data-aqm-bought', '');
    }
  }

  // Beside the game's "Mes recherches" (the market): a "Favoris" filter that shows only the sales of the favourite
  // series. Kept for the tab.
  const MARKET_FAV_KEY = 'aqm-market-fav';
  let marketFavLoading = false;
  let marketFavTried = false;
  const marketFavOn = () => {
    try {
      return sessionStorage.getItem(MARKET_FAV_KEY) === '1';
    } catch {
      return false;
    }
  };
  function markMarketFavorites() {
    if (!location.pathname.startsWith('/jeu')) return;
    const mine = [...document.querySelectorAll('button')].find((b) => !b.closest('.aqm-root') && /^mes recherches$/i.test(b.textContent.trim()));
    if (!mine) return;
    const on = marketFavOn();
    let chip = mine.parentElement.querySelector(':scope > .aqm-market-fav');
    if (!chip) {
      // The look of the game's chips not picked (a rarity's), its own state drawn by Aquaman.
      const plain = [...mine.parentElement.querySelectorAll('button')].find((b) => b !== mine && /^(n|r|sr|ssr|ur|sec)\s*(commune|rare|épique|légendaire|mythique|secrète)$/i.test(b.textContent.trim()));
      chip = h('button', {
        type: 'button',
        class: `${plain?.className ?? mine.className} aqm-market-fav`,
        title: 'Seulement les cartes de tes séries favorites',
        onclick: () => {
          try {
            marketFavOn() ? sessionStorage.removeItem(MARKET_FAV_KEY) : sessionStorage.setItem(MARKET_FAV_KEY, '1');
          } catch {}
          markMarketFavorites();
        }
      }, '★ Favoris');
      mine.after(chip);
    }
    chip.classList.toggle('is-on', on);
    chip.setAttribute('aria-pressed', String(on));
    if (on && (!favIds || !seriesTitles)) {
      if (!marketFavLoading && !marketFavTried) {
        marketFavLoading = true;
        marketFavTried = true; // (once: without an answer, every sale stays shown)
        loadFavIds().finally(() => {
          marketFavLoading = false;
          markMarketFavorites();
        });
      }
      return;
    }
    const titles = new Set(on ? [...favIds].map((id) => seriesTitles.get(id)).filter(Boolean) : []);
    for (const { tile, texts } of marketTiles()) tile.toggleAttribute('data-aqm-unfav', on && ![...texts].some((t) => titles.has(t)));
  }

  // Beside the game's "Vendre une carte" (the market): a button that withdraws every fixed-price sale of the player at
  // once (the cards are free again), one after the other at the pace the game accepts. Aquaman's waiting copies are
  // paused meanwhile (in every tab), else they would go on sale in the places set free; they go on afterwards.
  const SELL_CARD = /^vendre une carte$/i;
  let unlisting = false;
  function markUnlistButton() {
    if (!location.pathname.startsWith('/jeu')) return;
    const sell = [...document.querySelectorAll('button, a')].find((b) => !b.closest('.aqm-root') && SELL_CARD.test(b.textContent.trim()));
    if (!sell || sell.parentElement.querySelector(':scope > .aqm-unlist')) return;
    const btn = h('button', { type: 'button', class: `${sell.className} aqm-unlist`, onclick: () => unlistAll(btn) }, 'Retirer mes ventes');
    sell.after(btn);
  }

  async function unlistAll(btn) {
    if (unlisting) return;
    const sales = (n) => `${n} vente${n > 1 ? 's' : ''}`;
    let listings;
    try {
      listings = ((await gameWrite('/market/listings?mine=1', 'GET'))?.listings ?? []).filter((l) => l?.id);
    } catch (e) {
      return void askDialog('Retirer mes ventes', `Le jeu n’a pas donné tes ventes : ${e.message}`);
    }
    if (!listings.length) return void askDialog('Retirer mes ventes', 'Tu n’as aucune vente à prix fixe en cours.');
    const waiting = (await readList(SALES_WAITING)).length + ((await readSales())?.items.length ?? 0);
    const also = waiting ? `\n\nLa file d’attente d’Aquaman (${nCopies(waiting)}) est mise en pause le temps du retrait, puis réactivée.` : '';
    if (!(await askDialog('Retirer mes ventes', `Retirer tes ${sales(listings.length)} à prix fixe ? Les cartes redeviennent libres.${also}`, 'Retirer', 'Annuler'))) return;
    unlisting = true;
    const label = btn.textContent;
    let done = 0;
    let failed = null;
    try {
      // (a pause that ends by itself if this page is closed meanwhile)
      await chrome.storage.local.set({ [SALES_PAUSED]: Date.now() + 15 * 60e3 });
      await stopSales(); // the copies being sent go back to the waiting ones
      let gap = 600;
      for (const l of listings) {
        if (stopped) break;
        btn.textContent = `Retrait… ${done}/${listings.length}`;
        for (let tries = 0; ; tries++) {
          try {
            await gameWrite(`/market/orders/${encodeURIComponent(l.id)}`, 'DELETE');
            done++;
            break;
          } catch (e) {
            if (e.slowDown && tries < 5) {
              gap = Math.min(4000, gap * 1.5);
              await pause(slowWait(e));
              continue;
            }
            failed = e.message; // (sold meanwhile, already withdrawn…): the next ones go on
            break;
          }
        }
        await pause(gap);
      }
    } finally {
      try {
        await chrome.storage.local.remove(SALES_PAUSED); // the waiting copies go on
      } catch {}
      unlisting = false;
    }
    send({ type: 'collection-stale' });
    btn.textContent = `✅ ${sales(done)} retirée${done > 1 ? 's' : ''}`;
    if (failed) await askDialog('Retirer mes ventes', `${sales(listings.length - done)} non retirée${listings.length - done > 1 ? 's' : ''} : « ${failed} ».`);
    // The game's list of sales and its Perles are read again.
    setTimeout(() => (done ? location.reload() : (btn.textContent = label)), failed ? 0 : 1200);
  }

  // The waiting copies, kept up to date while shown; without any, what Aquaman does when the market is full.
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
        // What the game said at the last try: its own words, to see why the copies wait.
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

  // The queue changed (in this tab or another one): the boxes follow, and this tab takes over if needed.
  function onStorage(changes) {
    if (stopped || !settled) return;
    // A feature turned on or off elsewhere (the extension's popup, another tab): offered to load the page again.
    if (changes.settings && !settingsOpen) {
      const now = changes.settings.newValue ?? {};
      const STEPS = new Set(STEP_SETTING.values()).add('packGlow');
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
    // The cards bought on another device (synced): their sales are hidden here too.
    if (changes[BOUGHT_KEY]) {
      for (const key of changes[BOUGHT_KEY].newValue ?? []) boughtNames.add(key);
      hideBoughtCards();
    }
  }

  let wantsPulledAt = 0;

  // Every 5 seconds: the countdowns of the waits, a tab that went silent, and the waiting cards and duplicates.
  setInterval(async () => {
    if (stopped || !settled) return;
    if (!alive()) return shutdown(); // the extension was reloaded: this copy stops
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
      send({ type: 'wants-sync' }); // the other devices' changes
      send({ type: 'market-sync' }); // (the cards bought on the market, the copies waiting for a place)
    }
  }, 5000);

  // Messages posted by inject.js about the site's own requests.
  function onPageMessage(e) {
    if (e.source !== window || e.origin !== location.origin || typeof e.data?.aquaman !== 'string') return;
    if (e.data.aquaman === 'collection-stale') {
      owned = null;
      send({ type: 'collection-stale' });
      if (on('collectionStats')) snapCollection(true);
      setTimeout(schedule, 1500);
      setTimeout(() => checkRoom(20e3), 3000); // a card searched may just have been obtained
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
    else if (e.data.aquaman === 'feed' && Array.isArray(e.data.pulls)) send({ type: 'feed-seen', pulls: e.data.pulls });
    else if (e.data.aquaman === 'player-seen' && typeof e.data.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(e.data.id) && typeof e.data.name === 'string' && e.data.name.trim())
      playersSeen.set(foldName(e.data.name), e.data.id);
    else if (e.data.aquaman === 'opened' && Array.isArray(e.data.boosters)) {
      if (batch) batch.opened = e.data.boosters.length;
      send({ type: 'opened', boosters: e.data.boosters, best: Array.isArray(e.data.best) ? e.data.best : [], packs: Array.isArray(e.data.packs) ? e.data.packs : [], ids: Array.isArray(e.data.ids) ? e.data.ids : [] }).then((report) => {
        if (report && !report.error) {
          pityReport = report;
          pityAt = Date.now();
        }
        renderPity();
      });
    }
  }

  // ---------- page helpers ----------

  // Element with its attributes, listeners and children (strings become text).
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v; // only for the SVG icons of this file
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
  }

  // Text nodes of the site under from, without Aquaman's elements nor the "Ma vitrine" windows (hundreds of cards).
  // The page's are gathered once per run() and shared by its steps.
  let runText; // undefined: outside run(); null: in run(), not gathered yet
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

  // Elements of the site with a text matching re.
  function elementsWithText(from, re) {
    const out = [];
    for (const n of textNodes(from)) if (n.parentElement && re.test(n.nodeValue)) out.push(n.parentElement);
    return out;
  }

  const setText = (el, text) => el.textContent !== text && (el.textContent = text);
  // Lets a badge be placed in the corner of an element of the site. Inline style: the site rewrites the classes of its
  // elements (a selected series, for instance), which would take away a class of Aquaman.
  function anchorBadges(el) {
    const position = getComputedStyle(el).position;
    if (el.style.position === 'relative' || (position && position !== 'static')) return;
    el.style.position = 'relative';
    el.dataset.aqmAnchor = '1';
  }
  const setClass = (el, cls) => el.className !== cls && (el.className = cls);
  const isVisible = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const firstVisible = (selector) => [...document.querySelectorAll(selector)].find(isVisible) ?? null;
  const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

  // File name of a card image, the same key as the API's card.image.
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

  // True for the image of a game card.
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

  // Calls fn on the items, limit at a time.
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

  // Reads (value undefined), writes or removes (value null) a sessionStorage entry.
  function session(key, value) {
    try {
      if (value === undefined) return sessionStorage.getItem(key);
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch {}
    return null;
  }

  // ---------- "Plus" tab ----------

  // "Plus" button after each "Marché" link of the game's navigation.
  function addPlusTab() {
    for (const link of document.querySelectorAll('a[data-tour="nav-/jeu/marche"], a[href="/jeu/marche"]')) {
      if (link.closest('.aqm-root') || link.parentElement?.querySelector(':scope > .aqm-plus')) continue;
      const btn = h('button', {
        type: 'button',
        class: link.className,
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        onclick: (e) => {
          e.preventDefault();
          menu ? closeMenu() : openMenu(btn);
        }
      });
      btn.classList.remove('text-white');
      btn.classList.add('aqm-plus', 'text-zinc-400', 'hover:text-white');
      const icon = h('span', { class: 'aqm-nav-ico', html: ICON_DOTS });
      const iconClass = link.querySelector('svg')?.getAttribute('class');
      if (iconClass) icon.firstChild.setAttribute('class', iconClass);
      const text = [...link.querySelectorAll('span')].find((s) => !s.children.length && s.textContent.trim());
      btn.append(icon, h('span', { class: text?.className || null }, 'Plus'));
      link.after(btn);
    }
  }

  let menu = null;

  // Menu of the "Plus" tab.
  function openMenu(anchor) {
    closeMenu();
    const item = (title, text, icon, open) =>
      h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          class: 'aqm-menu-item',
          onclick: () => {
            closeMenu();
            open();
          }
        },
        h('span', { class: 'aqm-menu-ico', html: icon }),
        h('span', {}, h('strong', {}, title), h('small', {}, text))
      );
    menu = h(
      'div',
      { class: 'aqm-root aqm-menu', role: 'menu' },
      item('Classement', 'Amis ou global : cartes uniques et séries complètes', ICON_TROPHY, openLeaderboard),
      item('Boosters rentables', 'Prix, taux de drop, persos et séries', ICON_PACK, openBoosters),
      item('Qui a cette carte ?', 'Ceux qui l’ont, la vendent ou l’ont tirée', ICON_SEARCH, openWhoHas),
      item('Séries favorites', 'Tes séries et leurs persos manquants', ICON_STAR, openFavorites),
      item('Ma progression', 'Ta collection, par rareté et jour par jour', ICON_CHART, openCollectionStats),
      item('Visite guidée', 'Le tour de ce qu’ajoute Aquaman', ICON_COMPASS, () => startTour(0)),
      item('Nouveautés', 'Ce qui a changé dans Aquaman', ICON_SPARK, () => openNews()),
      item('Réglages', 'Activer ou couper chaque fonction d’Aquaman', ICON_GEAR, openSettings),
      meId === AUTHOR_ID ? item('Joueurs avec Aquaman', 'Réservé à l’auteur', ICON_TROPHY, openUsers) : null,
      meId === AUTHOR_ID ? item('Scanner les packs', 'Publier le design de chaque booster', ICON_PACK, startScan) : null
    );
    menu.anchor = anchor;
    document.body.append(menu);
    anchor.setAttribute('aria-expanded', 'true');
    const r = anchor.getBoundingClientRect();
    const below = r.bottom + 8 + menu.offsetHeight < innerHeight;
    menu.style.top = `${below ? r.bottom + 8 : r.top - 8 - menu.offsetHeight}px`;
    menu.style.left = `${Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.left + r.width / 2 - menu.offsetWidth / 2))}px`;
  }

  // The settings, the same in the extension and the script, on a computer or a phone (SETTINGS in src/lib/aquaman.js).
  // A feature turned on or off applies once the window is closed: the page is loaded again.
  let settingsOpen = false;
  async function openSettings() {
    const body = openOverlay('Réglages', `Aquaman ${chrome.runtime.getManifest().version} · ${owner === 'userscript' ? 'script' : 'extension'} · les mêmes réglages sur PC et téléphone`);
    body.parentElement.classList.add('aqm-panel-wide');
    let r;
    try {
      r = await ask({ type: 'settings' });
    } catch (e) {
      body.append(h('p', { class: 'aqm-note' }, e.message));
      return;
    }
    const values = { ...r.values };
    const before = JSON.stringify(values);
    // A card per group, each setting with its title, its hint and a switch on the right.
    const row = ([key, title, hint, only]) => {
      const away = only === 'extension' && owner === 'userscript';
      const box = h('input', { type: 'checkbox', role: 'switch', class: 'aqm-toggle', disabled: away, 'aria-label': title });
      box.checked = !away && !!values[key];
      box.addEventListener('change', () => {
        values[key] = box.checked;
        ask({ type: 'set-settings', patch: { [key]: box.checked } }).catch(() => {});
      });
      return h(
        'label',
        { class: `aqm-setting${away ? ' is-off' : ''}` },
        h('span', { class: 'aqm-setting-text' }, h('strong', {}, title), h('small', {}, away ? `${hint} · extension sur PC seulement` : hint)),
        box
      );
    };
    body.append(
      h(
        'div',
        { class: 'aqm-settings-groups' },
        r.groups.map((group) =>
          h('section', { class: 'aqm-settings-group' }, h('p', { class: 'aqm-settings-title' }, h('span', { 'aria-hidden': 'true' }, group.icon ?? ''), group.title), group.items.map(row))
        )
      ),
      h(
        'div',
        { class: 'aqm-settings-foot' },
        h('p', {}, 'Un changement s’applique à la fermeture de cette fenêtre : la page se recharge.'),
        h('div', { class: 'aqm-settings-actions' }, h('button', { type: 'button', class: 'aqm-tour-btn', onclick: () => openNews() }, 'Nouveautés'), h('button', { type: 'button', class: 'aqm-tour-btn is-main', onclick: () => startTour(0) }, 'Visite guidée'))
      )
    );
    settingsOpen = true;
    overlayClosed = () => {
      settingsOpen = false;
      if (JSON.stringify(values) !== before) location.reload();
    };
  }

  function closeMenu() {
    if (!menu) return;
    menu.anchor?.setAttribute('aria-expanded', 'false');
    menu.remove();
    menu = null;
  }

  // ---------- window of the extension's pages ----------

  let overlay = null;

  // Full window with a title; returns its body.
  function openOverlay(title, subtitle) {
    closeOverlay();
    overlayClosed = null;
    const body = h('div', { class: 'aqm-body' });
    const panel = h(
      'div',
      { class: 'aqm-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h(
        'div',
        { class: 'aqm-head' },
        h('div', {}, h('h2', { class: 'aqm-title' }, title), subtitle ? h('p', { class: 'aqm-sub' }, subtitle) : null),
        h('button', { type: 'button', class: 'aqm-close', 'aria-label': 'Fermer', html: ICON_X, onclick: closeOverlay })
      ),
      body
    );
    overlay = h('div', { class: 'aqm-root aqm-overlay', onclick: (e) => e.target === e.currentTarget && closeOverlay() }, panel);
    document.body.append(overlay);
    root.classList.add('aqm-lock');
    panel.querySelector('.aqm-close').focus();
    return body;
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    root.classList.remove('aqm-lock');
    const then = overlayClosed;
    overlayClosed = null;
    then?.();
  }
  let overlayClosed = null; // called once when the window is closed

  // A question in Aquaman's window, in place of the browser's: true for its main button, false when it is closed
  // another way. Without cancel, a message (its one button closes it). Paragraphs are separated by a blank line.
  function askDialog(title, text, ok = 'OK', cancel = null) {
    return new Promise((resolve) => {
      const body = openOverlay(title);
      body.closest('.aqm-panel')?.classList.add('is-ask');
      let answer = false;
      overlayClosed = () => resolve(answer);
      const pick = (value) => {
        answer = value;
        closeOverlay();
      };
      body.append(
        ...text.split('\n\n').map((p) => h('p', { class: 'aqm-ask-text' }, p)),
        h('div', { class: 'aqm-ask-actions' },
          cancel ? h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => pick(false) }, cancel) : null,
          h('button', { type: 'button', class: 'aqm-queue-btn is-main', onclick: () => pick(true) }, ok))
      );
      body.querySelector('.aqm-ask-actions .is-main').focus();
    });
  }

  // Row of chips, one of them selected.
  const chips = (options, current, onPick) =>
    h(
      'div',
      { class: 'aqm-chips', role: 'tablist' },
      options.map(([value, label]) =>
        h('button', { type: 'button', role: 'tab', class: `aqm-chip${value === current ? ' is-on' : ''}`, 'aria-selected': String(value === current), onclick: () => onPick(value) }, label)
      )
    );

  // ---------- friends' leaderboard ----------
  // "Amis": the player and their friends. "Global": the friends too and the players the relay saw lately in the "beaux
  // tirages" (not every player: the game gives no such list).

  async function openLeaderboard() {
    const body = openOverlay('Classement', 'Toi et tes amis, ou plus largement, selon les cartes uniques et les séries complètes.');
    let scope = 'friends';
    let sortBy = 'owned';
    const scopes = { friends: null, global: null }; // { rows, note, collectionsAsked } of each scope, once read
    const scopeRow = h('div');
    const tabs = h('div');
    const status = h('p', { class: 'aqm-note' }, 'Chargement…');
    const list = h('ol', { class: 'aqm-board' });
    body.append(scopeRow, tabs, status, list);
    const alive = () => body.isConnected;

    let frame = 0;
    const later = () => frame || (frame = requestAnimationFrame(() => ((frame = 0), render())));

    const render = () => {
      scopeRow.replaceChildren(
        chips(
          [
            ['friends', 'Amis'],
            ['global', 'Global']
          ],
          scope,
          (v) => {
            scope = v;
            load();
            render();
          }
        )
      );
      tabs.replaceChildren(
        chips(
          [
            ['owned', 'Cartes uniques'],
            ['albums', 'Séries complètes']
          ],
          sortBy,
          (v) => {
            sortBy = v;
            render();
          }
        )
      );
      const s = scopes[scope];
      status.textContent = s?.note ?? 'Chargement…';
      paintRefresh();
      const rows = s?.rows ?? [];
      // A row counts once its number of the tab is known.
      const known = (r) => r.state === 'ok';
      const score = (r) => (!known(r) ? [-1, -1] : [r[sortBy], sortBy === 'owned' ? r.albums : r.owned]);
      const sorted = [...rows].sort((a, b) => {
        const [a1, a2] = score(a);
        const [b1, b2] = score(b);
        return b1 - a1 || b2 - a2 || String(a.name).localeCompare(String(b.name));
      });
      let place = 0;
      const ok = rows.filter((r) => r.state === 'ok');
      const topAlbums = Math.max(0, ...ok.map((r) => r.albums));
      const bar = (part) => h('span', { class: 'aqm-bar' }, h('span', { style: `width:${(100 * Math.min(1, part || 0)).toFixed(2)}%` }));
      list.replaceChildren(
        ...sorted.map((r) => {
          if (known(r)) place++;
          let stats;
          if (r.state !== 'ok') stats = h('p', { class: 'aqm-muted' }, r.state === 'private' ? 'Collection privée' : r.state === 'error' ? 'Collection indisponible' : 'Chargement…');
          else if (sortBy === 'owned')
            stats = h('div', { class: 'aqm-stat is-on' }, h('strong', {}, fmt(r.owned)), h('small', {}, `/ ${fmt(r.total)} cartes`), bar(r.total ? r.owned / r.total : 0));
          else stats = h('div', { class: 'aqm-stat is-on' }, h('strong', {}, fmt(r.albums)), h('small', {}, r.albums > 1 ? 'séries complètes' : 'série complète'), bar(topAlbums ? r.albums / topAlbums : 0));
          return h(
            'li',
            { class: `aqm-row${r.me ? ' is-me' : ''}` },
            h('span', { class: `aqm-place aqm-place-${place}` }, known(r) ? String(place) : '–'),
            h('img', { class: 'aqm-avatar', src: avatarUrl(r.id), alt: '', loading: 'lazy' }),
            h('a', { class: 'aqm-name', href: `/profile/${encodeURIComponent(r.id)}` }, r.name || 'Joueur', r.me ? h('span', { class: 'aqm-tag' }, 'Toi') : null),
            h('div', { class: 'aqm-stats' }, stats)
          );
        })
      );
    };

    // The players already read (on this device, for this account): shown at once in their places; only those read more
    // than `fresh` ago (1 h), and the player, are read again. "Actualiser" reads them all again.
    let board = null; // { fresh, players }
    const info = new Map(); // player id -> their latest summary ({ private, owned, total, albums, at })
    async function knownBoard() {
      if (board) return;
      try {
        board = await ask({ type: 'board-known' });
      } catch {
        board = { fresh: 3600e3, players: {} };
      }
      for (const p of Object.values(board.players ?? {})) if (p?.id && !info.has(p.id)) info.set(p.id, p);
    }
    const apply = (row, p) => {
      row.name ||= p.name;
      row.at = p.at;
      if (p.private) row.state = 'private';
      else Object.assign(row, { state: 'ok', owned: p.owned, total: p.total, albums: p.albums });
    };
    const ago = (t) => {
      const m = Math.round((Date.now() - t) / 60e3);
      return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 48 * 60 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
    };
    const refreshRow = h('div', { class: 'aqm-board-refresh' });
    status.after(refreshRow);
    const paintRefresh = () => {
      const s = scopes[scope];
      if (!s?.rows.length) return void refreshRow.replaceChildren();
      const oldest = Math.min(...s.rows.filter((r) => r.at).map((r) => r.at));
      refreshRow.replaceChildren(
        h(
          'span',
          { class: 'aqm-muted' },
          s.reading
            ? `Mise à jour de ${fmt(s.reading)} joueur${s.reading > 1 ? 's' : ''}…`
            : Number.isFinite(oldest)
              ? `${s.kept ? `${fmt(s.kept)} joueur${s.kept > 1 ? 's' : ''} gardé${s.kept > 1 ? 's' : ''} sans tout retélécharger · ` : ''}lecture la plus ancienne : ${ago(oldest)}`
              : ''
        ),
        h('button', { type: 'button', class: 'aqm-chip', disabled: s.reading ? true : null, onclick: () => load(true) }, 'Actualiser')
      );
    };

    // The players of a scope, then their collections (4 at a time): those not known or too old only, unless force.
    async function load(force = false) {
      const name = scope;
      let s = scopes[name];
      if (s && force && !s.reading) s.collectionsAsked = false;
      if (!s) {
        s = scopes[name] = { rows: [], note: 'Chargement…', collectionsAsked: false, kept: 0, reading: 0 };
        try {
          if (name === 'friends') {
            const { me, friends, friendsError: error } = await ask({ type: 'friends' });
            s.rows = [{ id: me, me: true }, ...friends].map((p) => ({ ...p, state: 'idle' }));
            s.note = error
              ? `Liste d'amis indisponible (${error}).`
              : friends.length
                ? `${friends.length} ami${friends.length > 1 ? 's' : ''} · une série est complète quand son album est réclamé.`
                : "Tu n'as pas encore d'amis dans le jeu : ajoute-en depuis leur profil pour te comparer à eux.";
          } else {
            const { me, players } = await ask({ type: 'global-players' });
            s.rows = [{ id: me, me: true }, ...players].map((p) => ({ ...p, state: 'idle' }));
            s.note = `${fmt(players.length + 1)} joueurs · ce n’est pas la liste complète du jeu : seulement tes amis et les joueurs vus récemment dans les « Beaux tirages ».`;
          }
        } catch (e) {
          s.note = e.message;
        }
        if (!alive()) return;
        later();
      }
      if (!s.collectionsAsked) {
        s.collectionsAsked = true;
        await knownBoard();
        if (!alive()) return;
        const fresh = board.fresh ?? 3600e3;
        const todo = [];
        for (const r of s.rows) {
          const p = info.get(r.id);
          if (p) apply(r, p);
          else r.state = 'loading';
          if (force || r.me || !p || !(Date.now() - p.at < fresh)) todo.push(r);
        }
        s.kept = s.rows.length - todo.length;
        s.reading = todo.length;
        later();
        await eachLimited(todo, 4, async (row) => {
          if (!alive()) return;
          try {
            const p = await ask({ type: 'player', id: row.id, fresh: force });
            info.set(row.id, p);
            apply(row, p);
          } catch {
            if (!info.has(row.id)) row.state = 'error'; // (a player known before keeps their last numbers)
          }
          s.reading--;
          later();
        });
        s.reading = 0;
        if (alive()) later();
      }
    }

    render();
    load();
  }

  // ---------- profitable boosters ----------

  // Picture of a booster: the site's art of its type, or a plain pack.
  function packArt(b) {
    const art = b.types[0] && TYPE_NAMES[b.types[0]] ? `/game/boosters/${b.types[0]}.webp` : b.minRank >= 4 ? '/game/boosters/legendaire.webp' : null;
    return art ? h('img', { class: 'aqm-pack', src: art, alt: '' }) : h('span', { class: 'aqm-pack aqm-pack-plain' }, h('span', {}, 'Booster'));
  }
  const rarityCode = (code) => h('span', { class: `aqm-rarity aqm-r-${code}` }, code);
  const perles = (n) => h('span', { class: 'aqm-perles', html: ICON_PEARL }, fmt(n));

  // Small cards with their name and a line under it.
  const cardStrip = (items, sub) =>
    h(
      'ul',
      { class: 'aqm-strip' },
      items.map((x) =>
        h(
          'li',
          { class: `aqm-mini${x.own ? ' is-owned' : ''}`, title: `${x.c.name} — ${x.c.series?.title ?? ''}` },
          h('img', { src: cardImageUrl(x.c.image), alt: '', loading: 'lazy' }),
          h('div', {}, h('p', { class: 'aqm-mini-name' }, rarityCode(x.c.rarity), ' ', x.c.name), h('p', { class: 'aqm-muted' }, sub(x)))
        )
      )
    );

  // What the player is looking for, and the sentence under the choices.
  const GOALS = [
    ['collection', 'Ma collection'],
    ['rarity', 'Une rareté'],
    ['name', 'Un personnage'],
    ['series', 'Une série'],
    ['value', 'La valeur']
  ];

  // The two orders of each goal: "rate" (the best chance or yield) and "price" (the fewest Perles).
  const SORTS = {
    collection: { rate: ['Cartes nouvelles', 'le plus de cartes que tu n’as pas'], price: ['Prix', 'le moins de Perles par carte nouvelle'] },
    value: { rate: ['Rendement', 'les cartes qui valent le plus'], price: ['Prix', 'le booster le moins cher'] },
    other: { rate: ['Taux de drop', 'la meilleure chance par booster'], price: ['Prix', 'le moins de Perles dépensées'] }
  };

  const guaranteeOf = (b) => `${RARITY_NAMES[RANKED[b.minRank - 1]] ?? 'Rare'} garantie`;
  const seriesOf = (b) =>
    b.series.length
      ? b.series
          .slice(0, 2)
          .map((s) => s.title)
          .join(', ') + (b.series.length > 2 ? ` +${b.series.length - 2}` : '')
      : b.types.length
        ? `Cartes ${b.types.map((t) => TYPE_NAMES[t] || t).join(' et ')}`
        : 'Toutes les séries';
  // "≈ 11 boosters" to get it once, on average.
  const oneIn = (p) => (1 / p < 10 ? dec(1 / p, 1) : fmt(1 / p));
  const boostersFor = (p) => (p >= 0.95 ? 'presque à chaque booster' : `≈ ${oneIn(p)} booster${1 / p >= 1.95 ? 's' : ''} à ouvrir en moyenne`);

  async function openBoosters() {
    const body = openOverlay('Quel booster ouvrir ?', 'Les boosters en vente classés du plus rentable au moins rentable pour obtenir ce que tu cherches.');
    body.parentElement.classList.add('aqm-panel-wide');
    const status = h('p', { class: 'aqm-note' }, 'Chargement de la boutique…');
    body.append(status);
    let goal = 'collection';
    let rarity = 'UR';
    let query = '';
    let onlyNew = false;
    let sortBy = 'rate';
    let report;
    try {
      report = await ask({ type: 'boosters' });
    } catch (e) {
      status.textContent = e.message;
      return;
    }
    if (!report.rows.length || !report.rarities.length) {
      status.textContent = 'La boutique ne propose aucun booster pour le moment.';
      return;
    }
    if (!report.rarities.some((r) => r.code === rarity)) rarity = report.rarities.at(-1).code;
    const rarityName = (code) => report.rarities.find((r) => r.code === code)?.name || RARITY_NAMES[code] || code;

    const goalRow = h('div', { class: 'aqm-chips aqm-goals' });
    const pickRow = h('div', { class: 'aqm-pick' });
    const sentence = h('div', { class: 'aqm-sentence' });
    const sortRow = h('div', { class: 'aqm-sorts' });
    const summary = h('div', { class: 'aqm-verdict' });
    const list = h('ol', { class: 'aqm-ranking' });
    // The suggestions under the search field: each name with the picture of one of its cards and its rarities.
    const suggestions = h('ul', { class: 'aqm-suggest', id: 'aqm-suggest', role: 'listbox', hidden: true });
    const search = h('input', { type: 'search', class: 'aqm-search', role: 'combobox', 'aria-controls': 'aqm-suggest', 'aria-expanded': 'false', 'aria-autocomplete': 'list', autocomplete: 'off' });
    const searchBox = h('div', { class: 'aqm-suggest-box' }, search, suggestions);
    let picked = -1; // the suggestion chosen with the arrows
    let typing = false; // the list opens only while typing, not once a name is picked
    const showSuggestions = (open) => {
      suggestions.hidden = !open || !suggestions.childElementCount;
      search.setAttribute('aria-expanded', String(!suggestions.hidden));
    };
    const pickSuggestion = (name) => {
      typing = false;
      search.value = name;
      clearTimeout(timer);
      query = name;
      showSuggestions(false);
      refresh();
    };
    const fillSuggestions = (list) => {
      picked = -1;
      suggestions.replaceChildren(
        ...list.map((s, i) =>
          h(
            'li',
            {
              id: `aqm-suggest-${i}`,
              class: 'aqm-suggest-item',
              'data-name': s.name,
              role: 'option',
              'aria-selected': 'false',
              // (mousedown: before the field loses the focus)
              onmousedown: (e) => {
                e.preventDefault();
                pickSuggestion(s.name);
              }
            },
            s.image ? h('img', { src: cardImageUrl(s.image), alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'aqm-suggest-blank' }),
            h('span', { class: 'aqm-suggest-name' }, s.name, goal === 'series' && s.cards ? h('small', {}, `${fmt(s.cards)} carte${s.cards > 1 ? 's' : ''}`) : null),
            goal === 'series' ? null : h('span', { class: 'aqm-suggest-rarities' }, (s.rarities ?? []).map((code) => rarityCode(code)))
          )
        )
      );
      showSuggestions(typing && document.activeElement === search && !!search.value.trim());
    };
    const movePick = (step) => {
      const items = [...suggestions.children];
      if (!items.length) return;
      showSuggestions(true);
      picked = (picked + step + items.length) % items.length;
      items.forEach((li, i) => li.setAttribute('aria-selected', String(i === picked)));
      items[picked].scrollIntoView({ block: 'nearest' });
      search.setAttribute('aria-activedescendant', items[picked].id);
    };
    search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        movePick(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter' && picked >= 0 && !suggestions.hidden) {
        e.preventDefault();
        pickSuggestion(suggestions.children[picked].dataset.name);
      } else if (e.key === 'Escape' && !suggestions.hidden) {
        e.stopPropagation();
        showSuggestions(false);
      }
    });
    search.addEventListener('focus', () => showSuggestions(typing && !!search.value.trim()));
    search.addEventListener('blur', () => showSuggestions(false));
    const how = h(
      'details',
      { class: 'aqm-how' },
      h('summary', {}, 'Comment sont calculés ces chiffres ?'),
      h(
        'ul',
        {},
        h('li', {}, 'Un booster donne 5 cartes : 4 tirées avec les taux du jeu, et une 5e d’au moins la rareté garantie. Dans une rareté, chaque carte du booster a la même chance.'),
        h('li', {}, '« ≈ 11 boosters à ouvrir en moyenne » et « 1 sur 11 » : l’inverse de la chance par booster. « ≈ 6 594 en moyenne » : le prix du booster multiplié par ce nombre.'),
        h('li', {}, 'Valeur : le prix au marché de chaque carte, pris sur les exemplaires vus dans ta collection', report.friends ? ' et celles de tes amis' : '', '. Une carte jamais vue prend la valeur moyenne de sa rareté.'),
        h('li', {}, 'La garantie anti-malchance (une SSR tous les 60 boosters, une UR tous les 190) n’est pas comptée : les vraies chances sont un peu meilleures.'),
        report.catalog ? null : h('li', {}, 'Le catalogue complet du jeu est indisponible : les chances par personnage et par série ne peuvent pas être calculées.'),
        h('li', {}, 'Ce sont des moyennes : un booster reste un tirage au sort.')
      )
    );
    status.remove();
    body.append(goalRow, pickRow, sentence, sortRow, summary, list, how);

    // Asks the numbers again for what was typed.
    let asked = 0;
    let timer = 0;
    async function refresh() {
      const n = ++asked;
      const field = goal === 'name' || goal === 'series' ? goal : '';
      try {
        const next = await ask({ type: 'boosters', query: field ? query : '', field });
        if (n !== asked) return;
        report = next;
        fillSuggestions(report.suggestions ?? []);
        render();
      } catch {}
    }
    search.addEventListener('input', () => {
      typing = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        query = search.value.trim();
        refresh();
      }, 250);
    });

    // Numbers of one booster for the goal chosen: rate (higher is better), cost (lower is better) and the texts.
    function measure({ b, a }) {
      const target =
        goal === 'rarity'
          ? `une ${rarityName(rarity)}${onlyNew ? ' que tu n’as pas' : ''}`
          : `« ${query} »${onlyNew ? ' (une carte que tu n’as pas)' : ''}`;
      if (goal === 'collection') {
        return {
          rate: a.fresh,
          cost: a.perFresh,
          head: `≈ ${dec(a.fresh, 1)} carte${a.fresh >= 2 ? 's' : ''} nouvelle${a.fresh >= 2 ? 's' : ''} par booster`,
          sub: `${pct(a.freshChance)} de chance d’en avoir au moins une`,
          big: a.perFresh == null ? '—' : h('span', {}, perles(a.perFresh)),
          bigSub: 'par carte nouvelle'
        };
      }
      if (goal === 'value') {
        return {
          rate: a.ratio,
          cost: b.price,
          head: a.ratio >= 1 ? `Tes cartes valent ×${dec(a.ratio)} le prix du booster` : `Tes cartes valent ${pct(a.ratio)} du prix du booster`,
          sub: h('span', {}, '≈ ', perles(a.ev), ' de cartes par booster, au prix du marché'),
          big: `×${dec(a.ratio)}`,
          bigSub: h('span', {}, '≈ ', perles(a.ev), ' de cartes')
        };
      }
      const p = goal === 'rarity' ? (onlyNew ? a.odds[rarity]?.freshChance : a.odds[rarity]?.chance) ?? 0 : (onlyNew ? a.targetNewChance : a.targetChance) ?? 0;
      return {
        rate: p,
        cost: p > 0 ? b.price / p : null,
        head: p > 0 ? `${boostersFor(p)} pour avoir ${target}` : `Ne peut pas te donner ${target}`,
        sub: `${pct(p)} de chance à chaque booster`,
        big: p > 0 ? `1 sur ${oneIn(Math.min(1, p))}` : '—',
        bigSub: p > 0 ? h('span', {}, '≈ ', perles(b.price / p), ' en moyenne') : ''
      };
    }

    // More about a booster: chances of each rarity, the searched or the most valuable missing cards.
    function moreOf({ b, a }) {
      const odds = h(
        'ul',
        { class: 'aqm-odds-grid' },
        report.rarities
          .filter((r) => a.odds[r.code])
          .map((r) => {
            const o = a.odds[r.code];
            return h('li', {}, rarityCode(r.code), h('strong', {}, pct(o.chance)), h('small', {}, `nouvelle : ${pct(o.freshChance)}`));
          })
      );
      const pool = b.pool?.cards
        ? b.pool.missing
          ? `${fmt(b.pool.cards)} cartes possibles, dont ${fmt(b.pool.missing)} que tu n’as pas encore (${pct(b.pool.missing / b.pool.cards)}).`
          : `${fmt(b.pool.cards)} cartes possibles : tu les as toutes.`
        : null;
      const cards =
        (goal === 'name' || goal === 'series') && a.targets.length
          ? [h('p', { class: 'aqm-label' }, `Cartes de « ${query} » dans ce booster`), cardStrip(a.targets.slice(0, 4), (x) => `${pct(x.chance)} par booster${x.own ? ` · tu l’as (${x.own})` : ' · tu ne l’as pas'}`)]
          : a.best.length
            ? [h('p', { class: 'aqm-label' }, 'Les cartes les plus chères qui te manquent'), cardStrip(a.best, (x) => h('span', {}, x.v ? h('span', {}, '≈ ', perles(x.v), ' · ') : '', `${pct(x.chance)} par booster`))]
            : [];
      return h(
        'details',
        { class: 'aqm-rank-more' },
        h('summary', {}, 'Détails'),
        h('p', { class: 'aqm-label' }, 'Chance d’avoir au moins une carte de chaque rareté'),
        odds,
        pool ? h('p', { class: 'aqm-muted' }, pool) : null,
        b.series.length > 2 ? h('p', { class: 'aqm-muted' }, `Séries : ${b.series.map((s) => s.title).join(', ')}.`) : null,
        ...cards
      );
    }

    function renderControls() {
      goalRow.replaceChildren(
        ...GOALS.map(([value, label]) =>
          h(
            'button',
            {
              type: 'button',
              class: `aqm-chip aqm-goal${value === goal ? ' is-on' : ''}`,
              'aria-pressed': String(value === goal),
              onclick: () => {
                if (value === goal) return;
                const typed = goal === 'name' || goal === 'series';
                goal = value;
                sortBy = 'rate';
                if (typed || goal === 'name' || goal === 'series') {
                  query = '';
                  search.value = '';
                  refresh();
                }
                render();
              }
            },
            label
          )
        )
      );
      if (goal === 'rarity')
        pickRow.replaceChildren(
          h(
            'div',
            { class: 'aqm-chips' },
            report.rarities.map((r) =>
              h(
                'button',
                {
                  type: 'button',
                  class: `aqm-chip aqm-chip-r aqm-r-${r.code}${r.code === rarity ? ' is-on' : ''}`,
                  'aria-pressed': String(r.code === rarity),
                  onclick: () => {
                    rarity = r.code;
                    render();
                  }
                },
                rarityName(r.code)
              )
            )
          )
        );
      else if (goal === 'name' || goal === 'series') {
        search.placeholder = goal === 'name' ? 'Nom d’un personnage…' : 'Nom d’une série…';
        search.setAttribute('aria-label', search.placeholder);
        if (pickRow.firstChild !== searchBox) pickRow.replaceChildren(searchBox);
      } else pickRow.replaceChildren();

      const newChips =
        goal === 'rarity' || goal === 'name' || goal === 'series'
          ? h(
              'div',
              { class: 'aqm-chips aqm-new' },
              [
                [false, 'Même celles que j’ai'],
                [true, 'Seulement celles qui me manquent']
              ].map(([value, label]) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: `aqm-chip${value === onlyNew ? ' is-on' : ''}`,
                    'aria-pressed': String(value === onlyNew),
                    onclick: () => {
                      onlyNew = value;
                      render();
                    }
                  },
                  label
                )
              )
            )
          : null;
      const text = {
        collection: 'Pour des cartes que tu n’as pas encore, de n’importe quelle rareté.',
        rarity: `Pour n’importe quelle carte ${rarityName(rarity)}${onlyNew ? ' que tu n’as pas encore' : ' (même une que tu as déjà)'}.`,
        name: query ? `Pour une carte de « ${query} »${onlyNew ? ' que tu n’as pas encore' : ' (même une que tu as déjà)'}.` : 'Tape le nom d’un personnage pour savoir quel booster te donne le plus de chances de l’avoir.',
        series: query ? `Pour une carte de la série « ${query} »${onlyNew ? ' que tu n’as pas encore' : ' (même une que tu as déjà)'}.` : 'Tape le nom d’une série pour savoir quel booster te donne le plus de ses cartes.',
        value: 'Pour la valeur au marché des 5 cartes du booster.'
      }[goal];
      sentence.replaceChildren(h('p', {}, text), newChips);

      const sorts = SORTS[goal] ?? SORTS.other;
      sortRow.replaceChildren(
        h('span', { class: 'aqm-filter-name' }, 'Classer par'),
        ...['price', 'rate'].map((key) =>
          h(
            'button',
            {
              type: 'button',
              class: `aqm-sort${key === sortBy ? ' is-on' : ''}`,
              'aria-pressed': String(key === sortBy),
              onclick: () => {
                sortBy = key;
                render();
              }
            },
            h('strong', {}, sorts[key][0]),
            h('small', {}, sorts[key][1])
          )
        )
      );
    }

    function render() {
      renderControls();
      if ((goal === 'name' || goal === 'series') && !query) {
        summary.hidden = true;
        summary.replaceChildren();
        list.replaceChildren();
        return;
      }
      if ((goal === 'name' || goal === 'series') && !report.catalog) {
        summary.hidden = true;
        summary.replaceChildren();
        list.replaceChildren(h('li', { class: 'aqm-empty' }, 'Le catalogue du jeu est indisponible : impossible de chercher un personnage ou une série pour le moment.'));
        return;
      }
      let rows = report.rows.map((r) => ({ ...r, m: measure(r) }));
      if (goal !== 'collection' && goal !== 'value') rows = rows.filter((r) => r.m.rate > 0);
      if (!rows.length) {
        summary.hidden = true;
        summary.replaceChildren();
        list.replaceChildren(h('li', { class: 'aqm-empty' }, goal === 'rarity' ? `Aucun booster en vente ne peut te donner une ${rarityName(rarity)}${onlyNew ? ' que tu n’as pas' : ''}.` : `Aucun booster en vente ne peut te donner « ${query} »${onlyNew ? ' (tu as peut-être déjà toutes ses cartes)' : ''}.`));
        return;
      }
      const last = Number.MAX_VALUE;
      rows.sort((x, y) => (sortBy === 'rate' ? y.m.rate - x.m.rate : (x.m.cost ?? last) - (y.m.cost ?? last)) || x.b.price - y.b.price);
      const topRate = Math.max(...rows.map((r) => r.m.rate));
      const bestRate = rows.reduce((x, y) => (y.m.rate > x.m.rate ? y : x));
      const cheapest = rows.reduce((x, y) => ((y.m.cost ?? last) < (x.m.cost ?? last) ? y : x));
      const worst = rows.reduce((x, y) => (y.m.rate < x.m.rate ? y : x));

      // Best and worst in two lines.
      const lines = [];
      if (goal === 'collection') {
        lines.push(['Le plus de cartes nouvelles', bestRate, ` · ≈ ${dec(bestRate.a.fresh, 1)} par booster.`]);
        if (cheapest.a.perFresh != null) lines.push(['Moins cher', cheapest, ` · ≈ ${fmt(cheapest.a.perFresh)} Perles par carte nouvelle.`]);
      } else if (goal === 'value') {
        lines.push(['Meilleur rendement', bestRate, ` · tes cartes valent ×${dec(bestRate.a.ratio)} le prix (≈ ${fmt(bestRate.a.ev)} Perles de cartes pour ${fmt(bestRate.b.price)}).`]);
      } else {
        const p = bestRate.m.rate;
        lines.push(['Meilleur taux', bestRate, ` · ${pct(p)} de chance à chaque booster, ${boostersFor(p)} (≈ ${fmt(bestRate.b.price / p)} Perles en moyenne).`]);
        if (cheapest !== bestRate && cheapest.m.cost != null) lines.push(['Moins cher', cheapest, ` · ≈ ${fmt(cheapest.m.cost)} Perles en moyenne, avec ${pct(cheapest.m.rate)} de chance par booster.`]);
      }
      if (rows.length > 1 && worst !== bestRate && worst.m.rate > 0)
        lines.push([goal === 'value' ? 'Pire rendement' : goal === 'collection' ? 'Le moins de cartes nouvelles' : 'Pire taux', worst, goal === 'value' ? ` · ×${dec(worst.a.ratio)} le prix.` : ` · ${dec(topRate / worst.m.rate, 1)} fois moins ${goal === 'collection' ? 'de cartes nouvelles' : 'de chances'} que le meilleur.`]);
      summary.hidden = false;
      summary.replaceChildren(...lines.map(([label, r, text]) => h('p', {}, h('strong', {}, `${label} : `), r.b.name, text)));

      list.replaceChildren(
        ...rows.map((r, i) => {
          const share = topRate > 0 ? r.m.rate / topRate : 0;
          const badges = [];
          if (r === bestRate) badges.push(h('span', { class: 'aqm-badge is-best' }, goal === 'value' ? 'Meilleur rendement' : goal === 'collection' ? 'Le plus de nouvelles' : 'Meilleur taux'));
          if (r === cheapest && cheapest !== bestRate && goal !== 'value') badges.push(h('span', { class: 'aqm-badge is-cheap' }, 'Moins cher'));
          return h(
            'li',
            { class: `aqm-rank${r === bestRate ? ' is-best' : ''}` },
            h('span', { class: 'aqm-rank-n' }, String(i + 1)),
            packArt(r.b),
            h(
              'div',
              { class: 'aqm-rank-main' },
              h('p', { class: 'aqm-rank-title' }, h('strong', {}, r.b.name), h('span', { class: 'aqm-rank-price' }, perles(r.b.price), ' le booster'), ...badges),
              h('p', { class: 'aqm-rank-head' }, r.m.head),
              h('p', { class: 'aqm-rank-sub' }, r.m.sub, ` · ${guaranteeOf(r.b)} · ${seriesOf(r.b)}`, r.b.endsAt ? ` · jusqu’au ${new Date(r.b.endsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''),
              h('div', { class: 'aqm-rank-bar' }, h('span', { style: `width:${(100 * share).toFixed(1)}%` })),
              moreOf(r)
            ),
            h(
              'div',
              { class: 'aqm-rank-side' },
              h('strong', {}, r.m.big),
              h('small', {}, r.m.bigSub),
              h('span', { class: 'aqm-rank-ref' }, r === bestRate ? `${goal === 'value' ? 'Rendement' : 'Taux'} 100 % (la référence)` : `${goal === 'value' ? 'Rendement' : 'Taux'} ${Math.round(100 * share)} % du meilleur`)
            )
          );
        })
      );
    }

    render();
  }

  // ---------- who has a card ----------

  // "il y a 5 min", "il y a 3 h", "il y a 2 j".
  function timeAgo(at) {
    const s = Math.max(0, (Date.now() - at) / 1000);
    if (s < 60) return 'à l’instant';
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    return `il y a ${Math.floor(s / 86400)} j`;
  }

  // Profile picture of a player (an empty square for a private profile), to find them again on the site.
  const avatarOf = (player) =>
    player?.id ? h('img', { class: 'aqm-avatar aqm-avatar-sm', src: avatarUrl(player.id), alt: '', loading: 'lazy' }) : h('span', { class: 'aqm-avatar aqm-avatar-sm' });

  // One line of a list of players: the card's number, the player (picture and link to their profile) and a detail
  // on the right.
  const playerRow = (serial, player, right, card) =>
    h(
      'li',
      { class: 'aqm-owner' },
      h('span', { class: 'aqm-owner-serial' }, serial != null ? `#${serial}${card?.maxCopies ? `/${card.maxCopies}` : ''}` : ''),
      avatarOf(player),
      player?.id ? h('a', { href: `/profile/${encodeURIComponent(player.id)}` }, player.name || 'Un joueur') : h('span', { class: 'aqm-muted' }, player?.name || 'Un joueur au profil privé'),
      h('span', { class: 'aqm-owner-right' }, right ?? '')
    );

  // Recent pulls of the "beaux tirages" kept by Aquaman, as rows.
  const pullRows = (pulls) =>
    pulls.map((p) =>
      h(
        'li',
        { class: 'aqm-pull' },
        h('a', { href: `/jeu/carte/${encodeURIComponent(p.card.id)}`, class: 'aqm-pull-card' }, h('img', { src: cardImageUrl(p.card.image), alt: '', loading: 'lazy' })),
        h(
          'div',
          { class: 'aqm-pull-main' },
          h('p', { class: 'aqm-mini-name' }, rarityCode(p.card.rarity), ' ', p.card.name, p.serial != null ? h('span', { class: 'aqm-muted' }, ` #${p.serial}${p.card.maxCopies ? `/${p.card.maxCopies}` : ''}`) : null),
          p.card.series ? h('p', { class: 'aqm-muted aqm-pull-series' }, p.card.series) : null
        ),
        h(
          'div',
          { class: 'aqm-pull-who' },
          h(
            'span',
            { class: 'aqm-pull-player' },
            avatarOf(p.player),
            p.player?.id ? h('a', { href: `/profile/${encodeURIComponent(p.player.id)}` }, p.player.name || 'Un joueur') : h('span', {}, p.player?.name || 'Un joueur')
          ),
          h('small', { title: new Date(p.at).toLocaleString('fr-FR') }, timeAgo(p.at))
        )
      )
    );

  // With a card id (its page's button), the window opens on that card.
  async function openWhoHas(cardId) {
    const body = openOverlay('Qui a cette carte ?', 'Cherche n’importe quel personnage : les joueurs qui ont sa carte, qui la vendent et qui l’ont tirée récemment.');
    const search = h('input', { type: 'search', class: 'aqm-search', placeholder: 'Nom d’un personnage ou d’une série…', 'aria-label': 'Personnage ou série', autocomplete: 'off' });
    const view = h('div', { class: 'aqm-who' });
    body.append(h('div', { class: 'aqm-pick' }, search), view);
    let asked = 0;
    let timer = 0;

    // Without a choice: the cards matching the search, then the recent pulls matching it.
    async function showSearch() {
      const n = ++asked;
      const query = search.value.trim();
      view.replaceChildren(h('p', { class: 'aqm-note' }, 'Recherche…'));
      const [found, pulled] = await Promise.all([
        query.length >= 2 ? ask({ type: 'card-search', query }).catch(() => ({ cards: [] })) : { cards: [] },
        ask({ type: 'who-pulled', query, rarity: '' }).catch((e) => ({ error: e.message }))
      ]);
      if (n !== asked) return;
      const parts = [];
      if (query.length >= 2) {
        parts.push(h('p', { class: 'aqm-label' }, 'Cartes du jeu'));
        parts.push(
          found.cards.length
            ? h(
                'ul',
                { class: 'aqm-strip aqm-who-cards' },
                found.cards.map((c) =>
                  h(
                    'li',
                    { class: `aqm-mini${c.owned ? ' is-owned' : ''}`, role: 'button', tabindex: '0', title: `Qui a ${c.name} ?`, onclick: () => showCard(c.id), onkeydown: (e) => e.key === 'Enter' && showCard(c.id) },
                    h('img', { src: cardImageUrl(c.image), alt: '', loading: 'lazy' }),
                    h('div', {}, h('p', { class: 'aqm-mini-name' }, rarityCode(c.rarity), ' ', c.name, c.variant ? ` (${c.variant})` : ''), h('p', { class: 'aqm-muted' }, c.series ?? ''))
                  )
                )
              )
            : h('p', { class: 'aqm-muted' }, `Aucune carte ne s’appelle « ${query} ».`)
        );
      } else parts.push(h('p', { class: 'aqm-note' }, 'Tape au moins 2 lettres du nom d’un personnage, puis choisis sa carte.'));
      if (!pulled.error) {
        const since = pulled.since ? new Date(pulled.since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : null;
        parts.push(h('p', { class: 'aqm-label aqm-who-gap' }, query ? 'Tirages récents' : 'Derniers beaux tirages'));
        parts.push(h('p', { class: 'aqm-note aqm-who-note' }, `Parmi ${pulled.kept > 1 ? `les ${fmt(pulled.kept)} beaux tirages` : `${fmt(pulled.kept)} beau tirage`} (SSR, UR, SEC) relevé${pulled.kept > 1 ? 's' : ''} par les joueurs qui ont Aquaman${since ? ` depuis le ${since}` : ''}${pulled.shared ? '' : ' (base commune injoignable : seulement ceux de cet appareil)'}.${pulled.latest ? ` Dernier tirage reçu ${timeAgo(pulled.latest)}.` : ''}`));
        parts.push(pulled.pulls.length ? h('ol', { class: 'aqm-pulled' }, pullRows(pulled.pulls.slice(0, 50))) : h('p', { class: 'aqm-muted' }, 'Aucun tirage récent.'));
      }
      view.replaceChildren(...parts);
    }

    // One card: everyone Aquaman can see with it.
    async function showCard(id) {
      const n = ++asked;
      view.replaceChildren(h('p', { class: 'aqm-note' }, 'Recherche des joueurs qui ont cette carte…'));
      let r;
      try {
        r = await ask({ type: 'card-owners', id });
      } catch (e) {
        view.replaceChildren(h('p', { class: 'aqm-note' }, e.message));
        return;
      }
      if (n !== asked) return;
      const c = r.card;
      const stat = (label, value) => (value == null ? null : h('div', { class: 'aqm-metric' }, h('small', {}, label), h('strong', {}, value)));
      const section = (title, items, empty) => [h('p', { class: 'aqm-label aqm-who-gap' }, title), items.length ? h('ul', { class: 'aqm-owners' }, items) : h('p', { class: 'aqm-muted' }, empty)];
      view.replaceChildren(
        h('button', { type: 'button', class: 'aqm-chip aqm-who-back', onclick: showSearch }, '← Retour à la recherche'),
        h(
          'div',
          { class: 'aqm-who-card' },
          h('a', { href: `/jeu/carte/${encodeURIComponent(c.id)}` }, h('img', { src: cardImageUrl(c.image), alt: '' })),
          h(
            'div',
            {},
            h('p', { class: 'aqm-pack-title' }, rarityCode(c.rarity), ' ', c.name, c.variant ? ` (${c.variant})` : ''),
            c.series ? h('p', { class: 'aqm-muted' }, c.series) : null,
            h('p', { class: 'aqm-muted' }, c.owned ? `Tu l’as${c.owned > 1 ? ` (${c.owned} exemplaires)` : ''}.` : 'Tu ne l’as pas.'),
            h(
              'div',
              { class: 'aqm-who-stats' },
              stat('Joueurs qui l’ont', c.owners != null ? fmt(c.owners) : null),
              stat('En circulation', c.circulation != null ? fmt(c.circulation) : null),
              stat('Recherchée par', c.wants != null ? fmt(c.wants) : null),
              stat('Tirage', c.maxCopies ? `${fmt(c.minted ?? 0)}/${fmt(c.maxCopies)}` : 'Illimité')
            )
          )
        ),
        ...(r.holders
          ? section(`Détenteurs · ${fmt(r.holders.length)}`, r.holders.map((x) => playerRow(x.serial, x.player, null, c)), 'Personne ne l’a encore.')
          : [
              h(
                'p',
                { class: 'aqm-note' },
                c.owners
                  ? `${fmt(c.owners)} joueur${c.owners > 1 ? 's l’ont' : ' l’a'}, mais le jeu ne publie la liste des détenteurs que pour les cartes à tirage limité. Voici ceux qu’Aquaman peut voir.`
                  : 'Personne n’a encore cette carte.'
              )
            ]),
        ...section(
          'En vente au marché',
          r.market.map((x) => playerRow(x.serial, x.player, x.price != null ? h('span', {}, perles(x.price)) : null, c)),
          'Personne ne la vend en ce moment.'
        ),
        ...section(
          'Parmi toi et tes amis',
          r.friends.map((x) => playerRow(x.serials[0] ?? null, { ...x.player, name: x.me ? `${x.player.name ?? 'Toi'} (toi)` : x.player.name }, x.count > 1 ? `×${x.count}` : null, c)),
          'Aucun de tes amis ne l’a (ou leur collection est privée).'
        ),
        ...(r.holders
          ? []
          : section(
              `Vus avec cette carte${r.seen?.length ? ` · ${fmt(r.seen.length)}` : ''}`,
              (r.seen ?? []).map((x) => playerRow(x.serials[0] ?? null, x.player, h('small', { title: `Collection lue le ${new Date(x.seenAt).toLocaleString('fr-FR')}` }, `${x.count > 1 ? `×${x.count} · ` : ''}${timeAgo(x.seenAt)}`), c)),
              r.scanned
                ? `Aucun des ${fmt(r.scanned)} joueurs dont Aquaman a lu la collection ne l’a.`
                : 'Aquaman lit la collection des joueurs qui font un beau tirage : ils apparaîtront ici au fil du temps.'
            )),
        ...section(
          r.pulls.length
            ? `Tirée ${r.pulls.length} fois${r.pullsSince ? ` depuis le ${new Date(r.pullsSince).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''}`
            : 'Tirée récemment',
          r.pulls.map((x) => playerRow(x.serial, x.player, h('small', { title: new Date(x.at).toLocaleString('fr-FR') }, timeAgo(x.at)), c)),
          `Aucun tirage relevé${r.pullsSince ? ` depuis le ${new Date(r.pullsSince).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''} par les joueurs qui ont Aquaman (le jeu ne publie que les beaux tirages SSR, UR et SEC).`
        ),
        ...(r.holders ? [] : farther(c, n))
      );
    }

    // "Chercher parmi les joueurs vus récemment": their public collections, read a few at a time.
    function farther(c, n) {
      const list = h('ul', { class: 'aqm-owners' });
      const note = h('p', { class: 'aqm-muted', role: 'status' });
      const go = h('button', { type: 'button', class: 'aqm-album-btn is-main' }, '🔍 Chercher parmi les joueurs vus récemment');
      go.addEventListener('click', async () => {
        go.disabled = true;
        let players;
        try {
          players = (await ask({ type: 'known-players' })).players;
        } catch (e) {
          note.textContent = e.message;
          return;
        }
        let done = 0;
        let found = 0;
        let hidden = 0;
        for (let i = 0; i < players.length; i += 6) {
          if (n !== asked) return; // the player went elsewhere
          note.textContent = `${done}/${players.length} joueurs regardés · ${found} l’${found > 1 ? 'ont' : 'a'}…`;
          const part = players.slice(i, i + 6);
          const r = await ask({ type: 'owners-among', id: c.id, players: part }).catch(() => ({ found: [], hidden: part.length }));
          done += part.length;
          hidden += r.hidden;
          found += r.found.length;
          list.append(...r.found.map((x) => playerRow(x.serials[0] ?? null, x.player, x.count > 1 ? `×${x.count}` : null, c)));
        }
        go.hidden = true;
        note.textContent = players.length
          ? `${players.length} joueur${players.length > 1 ? 's' : ''} vu${players.length > 1 ? 's' : ''} récemment regardé${players.length > 1 ? 's' : ''} : ${found} l’${found > 1 ? 'ont' : 'a'}${hidden ? ` (${hidden} collection${hidden > 1 ? 's' : ''} privée${hidden > 1 ? 's' : ''} ou illisible${hidden > 1 ? 's' : ''})` : ''}.`
          : 'Aquaman n’a pas encore vu d’autres joueurs : il les découvre dans les beaux tirages, au fil du temps.';
      });
      return [h('p', { class: 'aqm-label aqm-who-gap' }, 'Chercher plus loin'), h('p', { class: 'aqm-muted' }, 'Aquaman peut regarder la collection publique des joueurs vus dans les beaux tirages relevés par tous les joueurs qui l’ont.'), go, note, list];
    }

    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(showSearch, 300);
    });
    if (typeof cardId === 'string') showCard(cardId);
    else showSearch();
  }

  // ---------- card page: "Qui a cette carte ?" under "Mes exemplaires" ----------

  const cardRarity = new Map(); // card id -> its rarity, or a promise while the game is asked

  function markCardWho() {
    const id = decodeURIComponent(location.pathname.match(/^\/jeu\/carte\/([^/]+)/)?.[1] ?? '');
    if (!id) return;
    const rarity = cardRarity.get(id);
    if (rarity === undefined) {
      cardRarity.set(
        id,
        ask({ type: 'card-rarity', id })
          .then((r) => cardRarity.set(id, r.rarity ?? ''))
          .catch(() => cardRarity.delete(id))
          .finally(schedule)
      );
      return;
    }
    if (typeof rarity !== 'string' || RANKED.indexOf(rarity) < RANKED.indexOf('SSR')) return;
    const label = elementsWithText(document.body, /^\s*mes exemplaires\s*$/i)[0];
    if (!label) return;
    // The panel under the title: its row of buttons ("Voir au marché", "Je la cherche"), or the panel itself.
    let section = label.parentElement;
    while (section && section !== document.body && section.textContent.trim().length <= label.textContent.trim().length + 5) section = section.parentElement;
    if (!section || section === document.body) return;
    const old = section.querySelector('.aqm-card-who');
    if (old?.dataset.card === id) return;
    old?.remove();
    const game = [...section.querySelectorAll('button, a')].find((b) => !b.closest('.aqm-root') && /^(voir au march[ée]|je la cherche|je ne la cherche plus)/i.test(b.textContent.trim()));
    const btn = h('button', { type: 'button', class: `aqm-root aqm-card-who${game ? '' : ' aqm-album-btn'}`, 'data-card': id }, h('span', { class: 'aqm-card-who-icon', html: ICON_SEARCH }), 'Qui a cette carte ?');
    // The look of the game's own dark button, when there is one beside it.
    const twin = [...section.querySelectorAll('button')].filter((b) => !b.closest('.aqm-root')).pop();
    if (game && twin) btn.className = `${twin.className} aqm-root aqm-card-who`;
    btn.addEventListener('click', () => openWhoHas(id));
    if (game) game.parentElement.append(btn);
    else section.append(h('div', { class: 'aqm-root aqm-card-who-row' }, btn));
    btn.dataset.card = id;
  }

  // ---------- the players who use Aquaman (the author only) ----------

  // The account logged in on this page, asked to the site itself (never a remembered one: the account may change).
  async function accountId() {
    try {
      const res = await pageFetch('/api/auth/check', { credentials: 'include', headers: { accept: 'application/json' } });
      return (await res.json())?.user?.id ?? null;
    } catch {
      return null;
    }
  }

  async function openUsers() {
    meId = await accountId();
    if (meId !== AUTHOR_ID) return; // reserved to the author's account, checked again on the site
    const body = openOverlay('Joueurs avec Aquaman', 'Les joueurs qui utilisent Aquaman : toi d’abord, puis la version la plus récente en premier et, à version égale, le plus récemment vu. Visible par toi seul.');
    body.parentElement.classList.add('aqm-panel-wide');
    const view = h('div');
    body.append(view);

    // What the author sees in the list of devices, "Brave · Windows" for instance.
    const deviceName = () => {
      const ua = navigator.userAgent;
      const browser = navigator.brave ? 'Brave' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) && !/Chrome\//.test(ua) ? 'Safari' : 'Chrome';
      const system = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'Linux';
      return `${browser} · ${system}`;
    };
    const showCode = (id) => `${id.slice(0, 4)}-${id.slice(4)}`;
    let polling = 0;

    // This device isn't approved yet: the owner's code once, or the approval from a device already approved.
    function approve(r) {
      const input = h('input', { type: 'password', class: 'aqm-search', placeholder: 'Code propriétaire', 'aria-label': 'Code propriétaire', autocomplete: 'off' });
      const go = h('button', { type: 'button', class: 'aqm-album-btn is-main' }, 'Approuver');
      const note = h('p', { class: 'aqm-muted', role: 'status' }, r.wrong ? 'Ce code n’est pas le bon.' : r.revoked ? 'Cet appareil a été révoqué.' : '');
      const submit = async () => {
        if (!input.value.trim()) return;
        go.disabled = true;
        const res = await ask({ type: 'admin-code', token: input.value.trim(), name: deviceName() }).catch((e) => ({ error: e.message }));
        go.disabled = false;
        if (res.wrong) note.textContent = 'Ce code n’est pas le bon.';
        else if (res.error) note.textContent = res.error;
        else load();
      };
      go.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
      const pending = r.device?.state === 'pending';
      const other = h('button', { type: 'button', class: 'aqm-album-btn' }, 'Demander l’approbation à un autre appareil');
      other.addEventListener('click', async () => {
        other.disabled = true;
        await ask({ type: 'admin-request', name: deviceName() }).catch(() => {});
        load();
      });
      view.replaceChildren(
        h('p', { class: 'aqm-note' }, 'Cet appareil n’est pas encore approuvé. Il ne l’est qu’une fois : ensuite, plus rien à faire.'),
        pending
          ? h(
              'div',
              { class: 'aqm-device-wait' },
              h('p', {}, 'Code de cet appareil : ', h('strong', {}, showCode(r.device.id))),
              h('p', { class: 'aqm-muted' }, 'Ouvre « Joueurs avec Aquaman » sur un appareil déjà approuvé et approuve celui qui porte ce code. Cette page se met à jour toute seule.')
            )
          : h('div', { class: 'aqm-pick' }, other),
        h('p', { class: 'aqm-label aqm-who-gap' }, pending ? 'Ou avec le code propriétaire' : 'Avec le code propriétaire (premier appareil)'),
        h('div', { class: 'aqm-pick aqm-users-code' }, input, go),
        note
      );
      clearTimeout(polling);
      if (pending) polling = setTimeout(() => body.isConnected && load(), 5000);
    }

    // The devices of the author: those waiting (approve or refuse), those approved (revoke).
    async function devices(box) {
      const r = await ask({ type: 'admin-devices' }).catch(() => null);
      if (!r?.devices) return;
      const { adminDevice: mine } = await chrome.storage.local.get('adminDevice');
      const act = (label, type, id, main) => {
        const btn = h('button', { type: 'button', class: `aqm-album-btn${main ? ' is-main' : ''}` }, label);
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          await ask({ type, id }).catch(() => {});
          devices(box);
        });
        return btn;
      };
      box.replaceChildren(
        h('p', { class: 'aqm-label aqm-who-gap' }, 'Mes appareils'),
        h(
          'ul',
          { class: 'aqm-users' },
          r.devices.map((d) =>
            h(
              'li',
              { class: 'aqm-user' },
              h('strong', { class: 'aqm-device-code' }, showCode(d.id)),
              h('span', { class: 'aqm-name' }, d.name || 'Appareil', d.id === mine?.id ? h('span', { class: 'aqm-tag' }, 'Cet appareil') : null),
              h('span', { class: 'aqm-muted' }, d.state === 'pending' ? 'En attente' : d.lastUsed ? `Utilisé ${timeAgo(d.lastUsed)}` : 'Approuvé'),
              d.state === 'pending' ? [act('Approuver', 'admin-approve', d.id, true), act('Refuser', 'admin-revoke', d.id)] : act('Révoquer', 'admin-revoke', d.id)
            )
          )
        )
      );
    }

    async function load() {
      clearTimeout(polling);
      view.replaceChildren(h('p', { class: 'aqm-note' }, 'Chargement…'));
      let r;
      try {
        r = await ask({ type: 'aquaman-users' });
      } catch (e) {
        view.replaceChildren(h('p', { class: 'aqm-note' }, e.message));
        return;
      }
      if (r.needDevice) return approve(r);
      show(r.users);
      const box = h('div');
      view.append(box);
      devices(box);
    }

    // Each kind of Aquaman of a player (both when they use the extension and the script).
    const kindsOf = (u) => (u.installs?.length ? u.installs : [{ kind: u.kind, version: u.version, lastSeen: u.lastSeen }]);
    const kindName = (kind) => (kind === 'userscript' ? 'Script' : kind === 'extension' ? 'Extension' : '?');
    // Seen in the last 15 minutes: Aquaman says hello every 10 minutes while a page of the game is open.
    const online = (u) => Date.now() - u.lastSeen < 15 * 60e3;

    // A version as a number to compare ("1.4.10" after "1.4.9"); 0 when unknown.
    const versionRank = (v) => (/^\d+\.\d+\.\d+$/.test(v ?? '') ? v.split('.').reduce((n, x) => n * 1000 + Number(x), 0) : 0);
    const bestVersion = (u) => Math.max(0, ...kindsOf(u).map((i) => versionRank(i.version)));

    function show(players) {
      // The author first, then the most recent version of Aquaman first, then the most recently seen.
      const all = [...players].sort((a, b) => (b.id === AUTHOR_ID) - (a.id === AUTHOR_ID) || bestVersion(b) - bestVersion(a) || b.lastSeen - a.lastSeen);
      const day = Date.now() - 86400e3;
      const week = Date.now() - 7 * 86400e3;
      const versions = {};
      for (const u of all) for (const i of kindsOf(u)) versions[i.version ?? '?'] = (versions[i.version ?? '?'] ?? 0) + 1;
      const using = (kind) => all.filter((u) => kindsOf(u).some((i) => i.kind === kind)).length;
      const stat = (label, value) => h('div', { class: 'aqm-metric' }, h('small', {}, label), h('strong', {}, value));
      const search = h('input', { type: 'search', class: 'aqm-search', placeholder: 'Chercher un joueur…', 'aria-label': 'Chercher un joueur' });
      const list = h('ul', { class: 'aqm-users' });
      const render = () => {
        const q = search.value.trim().toLowerCase();
        const shown = q ? all.filter((u) => String(u.name ?? '').toLowerCase().includes(q) || u.id.includes(q)) : all;
        list.replaceChildren(
          ...shown.map((u) =>
            h(
              'li',
              { class: 'aqm-user' },
              h('img', { class: 'aqm-avatar', src: avatarUrl(u.id), alt: '', loading: 'lazy' }),
              h('a', { class: 'aqm-name', href: `/profile/${encodeURIComponent(u.id)}` }, u.name || u.id),
              h(
                'span',
                { class: 'aqm-user-kinds' },
                kindsOf(u).map((i) =>
                  h(
                    'span',
                    { class: `aqm-tag aqm-kind-${i.kind ?? 'x'}`, title: `${kindName(i.kind)} vu${i.lastSeen ? ` ${timeAgo(i.lastSeen)}` : ''}` },
                    `${kindName(i.kind)}${i.version ? ` v${i.version}` : ''}`
                  )
                )
              ),
              u.revoked ? h('span', { class: 'aqm-tag aqm-revoked' }, 'Révoqué') : online(u) ? h('span', { class: 'aqm-tag aqm-online' }, 'En ligne') : h('span'),
              h('span', { class: 'aqm-user-seen', title: `Vu la première fois le ${new Date(u.firstSeen).toLocaleDateString('fr-FR')}` }, timeAgo(u.lastSeen)),
              u.id === AUTHOR_ID ? null : revokeButton(u)
            )
          )
        );
      };
      // Takes Aquaman back from a player (it stops on their side within a minute), or gives it back.
      const revokeButton = (u) => {
        const btn = h('button', { type: 'button', class: 'aqm-album-btn aqm-user-revoke' }, u.revoked ? 'Rétablir' : 'Révoquer');
        btn.addEventListener('click', async () => {
          const name = u.name || u.id;
          if (!u.revoked && !confirm(`Révoquer Aquaman pour ${name} ? Il s’arrêtera chez ce joueur dans la minute, jusqu’à ce que tu le rétablisses.`)) return;
          btn.disabled = true;
          const res = await ask({ type: 'admin-revoke-player', id: u.id, revoked: !u.revoked }).catch((e) => ({ error: e.message }));
          if (res?.needDevice) return load();
          if (res?.ok) u.revoked = !u.revoked;
          render();
        });
        return btn;
      };
      search.addEventListener('input', render);
      view.replaceChildren(
        h(
          'div',
          { class: 'aqm-who-stats aqm-users-stats' },
          stat('Joueurs', fmt(all.length)),
          stat('En ligne', fmt(all.filter(online).length)),
          stat('Vus ces 24 h', fmt(all.filter((u) => u.lastSeen >= day).length)),
          stat('Vus ces 7 jours', fmt(all.filter((u) => u.lastSeen >= week).length)),
          stat('Extension / script', `${fmt(using('extension'))} / ${fmt(using('userscript'))}`)
        ),
        h(
          'p',
          { class: 'aqm-note' },
          'Versions : ',
          Object.entries(versions)
            .sort((a, b) => versionRank(b[0]) - versionRank(a[0]) || b[1] - a[1])
            .map(([v, n]) => `${v === '?' ? 'inconnue' : v} (${n})`)
            .join(', '),
          '.'
        ),
        h('div', { class: 'aqm-pick' }, search),
        list
      );
      render();
    }

    load();
  }

  // ---------- favourite series ----------

  let favIds = null; // ids of the favourite series, for the stars of the Collection page
  let seriesBySlug = null; // slug -> id, from the game's series
  let seriesTitles = null; // id -> title in lower case, from the game's series (the market's "Favoris" filter)

  // Reads the favourites (fresh: with the changes made on the other devices right now) and repaints the stars.
  async function loadFavIds(fresh = false) {
    const res = await send({ type: 'favorites', fresh });
    if (!res || res.error) return;
    favIds = new Set(res.favorites.map((s) => s.id));
    seriesBySlug = new Map(res.all.map((s) => [s.slug, s.id]));
    seriesTitles = new Map(res.all.map((s) => [s.id, String(s.title ?? '').trim().toLowerCase()]));
    document.querySelectorAll('.aqm-star').forEach((star) => paintStar(star));
    const count = document.querySelector('.aqm-fav-open b');
    if (count) count.textContent = String(favIds.size);
  }

  async function toggleFavorite(id, on) {
    const res = await send({ type: 'favorite', id, on });
    if (res?.favorites) favIds = new Set(res.favorites);
    document.querySelectorAll('.aqm-star').forEach((star) => paintStar(star));
    const count = document.querySelector('.aqm-fav-open b');
    if (count) count.textContent = String(favIds?.size ?? 0);
  }

  function paintStar(star) {
    const on = !!favIds?.has(star.dataset.id);
    setText(star, on ? '★' : '☆');
    star.classList.toggle('is-on', on);
    star.title = on ? 'Retirer des séries favorites' : 'Ajouter aux séries favorites';
    star.setAttribute('aria-pressed', String(on));
  }

  let favLoading = false;

  // Stars on the series of the Collection page, and a "★ Favoris" button above them.
  function markFavoriteSeries() {
    if (!location.pathname.startsWith('/jeu/collection')) return;
    const strip = document.querySelector('[role="radiogroup"][aria-label="Série"], [role="radiogroup"][aria-label="Série"]') ?? seriesStrip();
    if (!strip || strip.closest('.aqm-root')) return;
    // The buttons come at once with the strip; only the stars wait for the series (their count shows "…" until then).
    if (!seriesBySlug && !favLoading) {
      favLoading = true;
      loadFavIds().finally(() => {
        favLoading = false;
        schedule();
      });
    }
    if (!strip.previousElementSibling?.classList.contains('aqm-fav-bar'))
      strip.before(
        h(
          'div',
          { class: 'aqm-root aqm-fav-bar' },
          h('button', { type: 'button', class: 'aqm-chip aqm-fav-open', onclick: openFavorites }, '★ Favoris ', h('b', {}, favIds ? String(favIds.size) : '…')),
          h('button', {
            type: 'button',
            class: 'aqm-chip aqm-sort-progress',
            'aria-pressed': 'false',
            onclick: () => {
              setByProgress(!byProgress);
              sortByProgress(strip);
              strip.scrollTo?.({ left: 0, behavior: 'smooth' });
            },
            title: 'Les séries où il te manque le moins de cartes en premier'
          }, 'Les plus avancées'),
          h('button', {
            type: 'button',
            class: 'aqm-chip aqm-sort-progress aqm-small-series',
            'aria-pressed': 'false',
            onclick: () => {
              setSmallOnly(!smallOnly);
              sortByProgress(strip);
              strip.scrollTo?.({ left: 0, behavior: 'smooth' });
            },
            title: `Masquer les séries de ${SMALL_SERIES} personnages ou moins`
          }, `Masquer séries <= ${SMALL_SERIES} persos`),
          h('button', {
            type: 'button',
            class: 'aqm-chip aqm-sort-progress aqm-claimed-series',
            'aria-pressed': 'false',
            onclick: () => {
              setClaimedHidden(!claimedHidden);
              if (claimedHidden) loadClaimed(true);
              sortByProgress(strip);
              strip.scrollTo?.({ left: 0, behavior: 'smooth' });
            },
            title: 'Masquer les séries dont tu as déjà le badge (album réclamé)'
          }, 'Masquer séries avec badge')
        )
      );
    if (claimedHidden && Date.now() - claimedAt > 2 * 60e3) loadClaimed();
    sortByProgress(strip);
    keepStripPlace(strip);
    if (!seriesBySlug) return;
    for (const img of strip.querySelectorAll('img[src*="/api/covers/"]')) {
      const tile = img.closest('button, a, [role="radio"]') ?? img.parentElement;
      if (!tile || tile.querySelector(':scope > .aqm-star')) continue;
      anchorBadges(tile);
      const slug = decodeURIComponent(img.getAttribute('src').match(/\/api\/covers\/([^/?#]+)\.webp/)?.[1] ?? '');
      const id = seriesBySlug.get(slug);
      if (!id) continue;
      const star = h('span', {
        class: 'aqm-root aqm-star',
        role: 'button',
        tabindex: '0',
        'data-id': id,
        onclick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(id, !favIds?.has(id));
        },
        onkeydown: (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(id, !favIds?.has(id));
        }
      });
      paintStar(star);
      tile.append(star);
    }
  }

  // The series of the strip from the fewest missing cards to the most (their "15/29": 14 missing), the complete ones
  // last; "Toutes les séries" stays first. Only the order they are shown in changes (CSS order): the game's own
  // order is kept.
  // A series completed during the visit (its count reached its total): the strip is sorted so and shown from its
  // start, the series left to complete first.
  // Kept for the tab: back from a character's page, the strip is sorted the same way and shown at the same place.
  const BY_PROGRESS_KEY = 'aqm-by-progress';
  const STRIP_LEFT_KEY = 'aqm-strip-left';
  let byProgress = (() => {
    try {
      return sessionStorage.getItem(BY_PROGRESS_KEY) === '1';
    } catch {
      return false;
    }
  })();
  // "Masquer séries <= 5 persos": the series of at most SMALL_SERIES cards are hidden (kept for the tab too).
  const SMALL_SERIES = 5;
  const SMALL_ONLY_KEY = 'aqm-small-series';
  let smallOnly = (() => {
    try {
      return sessionStorage.getItem(SMALL_ONLY_KEY) === '1';
    } catch {
      return false;
    }
  })();
  function setSmallOnly(on) {
    smallOnly = on;
    try {
      on ? sessionStorage.setItem(SMALL_ONLY_KEY, '1') : sessionStorage.removeItem(SMALL_ONLY_KEY);
    } catch {}
  }
  // "Masquer séries avec badge": the series whose album the player claimed are hidden (kept for the tab too). Their
  // slugs come from the player's collection (its albums), matched with the cover of each series of the strip.
  const CLAIMED_KEY = 'aqm-hide-claimed';
  let claimedHidden = (() => {
    try {
      return sessionStorage.getItem(CLAIMED_KEY) === '1';
    } catch {
      return false;
    }
  })();
  function setClaimedHidden(on) {
    claimedHidden = on;
    try {
      on ? sessionStorage.setItem(CLAIMED_KEY, '1') : sessionStorage.removeItem(CLAIMED_KEY);
    } catch {}
  }
  let claimedSlugs = null; // Set of the slugs of the series with a badge, once read
  let claimedAt = 0;
  async function loadClaimed(fresh = false) {
    claimedAt = Date.now();
    const res = await send({ type: 'claimed-albums', fresh });
    if (!res || res.error || !Array.isArray(res.slugs)) return;
    claimedSlugs = new Set(res.slugs);
    const strip = seriesStrip();
    if (strip) sortByProgress(strip);
  }
  const coverSlug = (el) => {
    const src = el.querySelector('img[src*="/api/covers/"]')?.getAttribute('src');
    try {
      return src ? decodeURIComponent(src.match(/\/api\/covers\/([^/?#]+)\.webp/)?.[1] ?? '') : '';
    } catch {
      return '';
    }
  };
  function setByProgress(on) {
    byProgress = on;
    try {
      on ? sessionStorage.setItem(BY_PROGRESS_KEY, '1') : sessionStorage.removeItem(BY_PROGRESS_KEY);
    } catch {}
  }

  // The strip drawn by the game (again, after a change of page) is scrolled back to where the player left it, then
  // its place is kept as it scrolls.
  const placedStrips = new WeakSet();
  let placedVisit = -1; // the visit of the collection whose strip was put back in place
  function keepStripPlace(strip) {
    if (placedStrips.has(strip)) return;
    placedStrips.add(strip);
    // (the strip scrolls itself, else the box around it does)
    const around = [strip, strip.parentElement, strip.parentElement?.parentElement].find((el) => el && /(auto|scroll)/.test(getComputedStyle(el).overflowX));
    if (around && around !== strip) strip = around;
    let left = null;
    try {
      const kept = sessionStorage.getItem(STRIP_LEFT_KEY);
      if (kept != null) left = Number(kept) || 0;
    } catch {}
    // The game scrolls to the selected series in its own order (once, or smoothly, a moment after it draws the strip):
    // for 1.5 s the strip is put back each frame, until the player scrolls it. Without a place kept, the selected
    // series is shown where the sorting put it.
    // Only once a visit of the page: the strip the game draws again when another series is chosen is left to the
    // game's own scroll (put back each frame, it jerked between the two).
    let placing = placedVisit !== pageVisit;
    placedVisit = pageVisit;
    const until = Date.now() + 1500;
    const stop = () => (placing = false);
    for (const type of ['wheel', 'pointerdown', 'touchstart', 'keydown']) strip.addEventListener(type, stop, { passive: true, once: true });
    const place = () => {
      if (!placing || !strip.isConnected || Date.now() > until) return void (placing = false);
      if (left != null) {
        if (Math.abs(strip.scrollLeft - left) > 2) strip.scrollLeft = left;
      } else if (byProgress) {
        const picked = strip.querySelector('[aria-checked="true"]');
        if (picked) {
          const [p, s] = [picked.getBoundingClientRect(), strip.getBoundingClientRect()];
          const want = Math.max(0, Math.round(strip.scrollLeft + p.left - s.left - (strip.clientWidth - p.width) / 2));
          if (Math.abs(strip.scrollLeft - want) > 2) strip.scrollLeft = want;
        }
      }
      requestAnimationFrame(place);
    };
    if (placing) requestAnimationFrame(place);
    let timer = 0;
    strip.addEventListener(
      'scroll',
      () => {
        if (placing) return; // (the game's scroll, or Aquaman's: not the player's place)
        clearTimeout(timer);
        timer = setTimeout(() => {
          try {
            sessionStorage.setItem(STRIP_LEFT_KEY, String(Math.round(strip.scrollLeft)));
          } catch {}
        }, 150);
      },
      { passive: true }
    );
  }
  // series (its text without the count) -> missing cards last seen; kept for the tab (a purchase may load the page
  // again before the player comes back to the collection)
  const missingSeen = new Map(
    (() => {
      try {
        return Object.entries(JSON.parse(sessionStorage.getItem('aqm-missing-seen') || '{}'));
      } catch {
        return [];
      }
    })()
  );
  let missingSaved = '';
  function sortByProgress(strip) {
    const items = [...strip.children].filter((el) => !el.classList.contains('aqm-root'));
    const count = (el) => {
      const m = el.textContent.match(/(\d[\d  ]*)\s*\/\s*(\d[\d  ]*)/); // (a title's own figures are apart)
      if (!m) return null;
      const [owned, total] = [m[1], m[2]].map((x) => Number(x.replace(/\D/g, '')));
      return total ? { missing: Math.max(0, total - owned), rate: owned / total, total } : null;
    };
    const rows = items.map((el, i) => ({ el, i, c: count(el), all: /toutes les s[ée]ries/i.test(el.textContent) }));
    let completed = false;
    for (const { el, c, all } of rows) {
      if (!c || all) continue;
      const key = el.textContent.replace(/\d[\d  ]*\s*\/\s*\d[\d  ]*/, '').trim();
      if (missingSeen.get(key) > 0 && c.missing === 0) completed = true;
      missingSeen.set(key, c.missing);
    }
    if (completed) setByProgress(true);
    const seen = JSON.stringify(Object.fromEntries(missingSeen));
    if (seen !== missingSaved) {
      missingSaved = seen;
      try {
        sessionStorage.setItem('aqm-missing-seen', seen);
      } catch {}
    }
    const chip = strip.previousElementSibling?.querySelector('.aqm-sort-progress:not(.aqm-small-series)');
    chip?.classList.toggle('is-on', byProgress);
    chip?.setAttribute('aria-pressed', String(byProgress));
    const small = strip.previousElementSibling?.querySelector('.aqm-small-series');
    small?.classList.toggle('is-on', smallOnly);
    small?.setAttribute('aria-pressed', String(smallOnly));
    const claimedChip = strip.previousElementSibling?.querySelector('.aqm-claimed-series');
    claimedChip?.classList.toggle('is-on', claimedHidden);
    claimedChip?.setAttribute('aria-pressed', String(claimedHidden));
    // Hidden: the small series, the series with a badge. "Toutes les séries", the series shown and those without a
    // count stay.
    for (const { el, c, all } of rows) {
      const picked = el.getAttribute('aria-checked') === 'true' || !!el.querySelector('[aria-checked="true"]');
      const claimed = claimedHidden && !!claimedSlugs && !all && !picked && claimedSlugs.has(coverSlug(el));
      const hide = claimed || (smallOnly && !all && c && c.total <= SMALL_SERIES && !picked);
      const display = hide ? 'none' : '';
      if (el.style.display !== display) el.style.display = display;
    }
    const ranked = rows
      .sort(
        (a, b) =>
          b.all - a.all ||
          !a.c - !b.c ||
          (a.c?.missing === 0) - (b.c?.missing === 0) ||
          (a.c?.missing ?? 0) - (b.c?.missing ?? 0) ||
          (b.c?.rate ?? 0) - (a.c?.rate ?? 0) ||
          a.i - b.i
      );
    ranked.forEach(({ el }, n) => {
      const order = byProgress ? String(n) : '';
      if (el.style.order !== order) el.style.order = order;
    });
    if (completed) strip.scrollTo?.({ left: 0, behavior: 'smooth' });
  }

  // ---------- "Recycler des cartes": nothing ticked at first, and a button to tick everything ----------

  const RECYCLE_TITLE = /^recycler des cartes$/i;
  const recycleSeen = new WeakSet(); // rows already unticked once
  let recycleOpened = 0; // when the window was found open

  // The tick box of a row: a real one, else the small square drawn before the card's picture.
  function tickBox(row) {
    const known = row.querySelector('input[type="checkbox"], [role="checkbox"], [aria-checked]');
    if (known) return known;
    const img = row.querySelector('img');
    for (const el of row.querySelectorAll('*')) {
      if (el.contains(img) || !(el.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const r = el.getBoundingClientRect();
      if (r.width >= 12 && r.width <= 32 && Math.abs(r.width - r.height) <= 4) return el;
    }
    return null;
  }

  // A drawn box is ticked when its ✓ shows (an unticked one may keep it hidden).
  function isTicked(box) {
    if (box.tagName === 'INPUT') return box.checked;
    const said = box.getAttribute('aria-checked') ?? (box.hasAttribute('data-state') ? String(box.getAttribute('data-state') === 'checked') : null);
    if (said != null) return said === 'true';
    const svg = box.querySelector('svg');
    if (!svg) return false;
    const r = svg.getBoundingClientRect();
    const cs = getComputedStyle(svg);
    return r.width > 0 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.1 && cs.color !== 'rgba(0, 0, 0, 0)';
  }

  // The number of cards ticked, from the game's "Recycler N · +X" button (just "Recycler" with none); null if unknown.
  function recycleCount(dialog) {
    const b = [...dialog.querySelectorAll('button')].find((x) => !x.closest('.aqm-root') && /^recycler\b/i.test(x.textContent.trim()));
    return b ? Number(b.textContent.trim().match(/^recycler\s+([\d\s  ]+)/i)?.[1]?.replace(/\s/g, '') || 0) : null;
  }

  // The window and its rows (one per card: its picture and its number), each with its tick box.
  function recycleParts() {
    const title = [...document.querySelectorAll('h1, h2, h3')].find((t) => !t.closest('.aqm-root') && RECYCLE_TITLE.test(t.textContent.trim()));
    const dialog = title?.closest('[role="dialog"]') ?? title?.parentElement?.parentElement?.parentElement;
    if (!dialog) return null;
    const rows = [];
    for (const img of dialog.querySelectorAll('img')) {
      let row = img;
      while (row.parentElement && row.parentElement !== dialog && row.parentElement.querySelectorAll('img').length === 1) row = row.parentElement;
      const box = row !== img && /#\s?\d+/.test(row.textContent) ? tickBox(row) : null;
      if (box) rows.push({ row, box });
    }
    return { dialog, rows };
  }

  function markRecycleDialog() {
    if (!location.pathname.startsWith('/jeu')) return;
    const parts = recycleParts();
    if (!parts) return void (recycleOpened = 0);
    if (!recycleOpened) recycleOpened = Date.now();
    const { dialog, rows } = parts;
    if (!rows.length) return;
    // The rows drawn in the first seconds start unticked; later, the player's choices stay.
    for (const { row, box } of rows) {
      if (recycleSeen.has(row)) continue;
      recycleSeen.add(row);
      if (Date.now() - recycleOpened < 3000 && isTicked(box)) box.click();
    }
    let btn = dialog.querySelector('.aqm-recycle-all');
    if (!btn) {
      btn = h('button', { type: 'button', class: 'aqm-queue-btn aqm-recycle-all', onclick: toggleRecycle });
      rows[0].row.parentElement.before(h('div', { class: 'aqm-root aqm-recycle-bar' }, btn));
    }
    const count = recycleCount(dialog);
    const all = count != null ? count > 0 && count >= rows.length : rows.every((r) => isTicked(r.box));
    const label = all ? 'Tout désélectionner' : `Tout sélectionner (${rows.length})`;
    if (btn.textContent !== label) btn.textContent = label;
  }

  // Ticks every row, or unticks them all when they all are.
  function toggleRecycle() {
    const parts = recycleParts();
    if (!parts) return;
    // With the game's count: none or all ticked, every row changes; in between, the unticked ones.
    const count = recycleCount(parts.dialog);
    const all = count != null ? count > 0 && count >= parts.rows.length : parts.rows.every((r) => isTicked(r.box));
    if (count === 0 || all) for (const r of parts.rows) r.box.click();
    else for (const r of parts.rows) if (!isTicked(r.box)) r.box.click();
    setTimeout(markRecycleDialog, 50);
  }

  // ---------- a card's page: its 5 cheapest offers on the market ----------
  // Under the game's "Cote" panel: the offers from the cheapest to the dearest, each with its seller and number.

  let listingsFor = null; // the card whose offers are shown (or being read)
  function markCardListings() {
    const id = location.pathname.match(/^\/jeu\/carte\/([^/?#]+)/)?.[1];
    const box = document.querySelector('.aqm-listings');
    if (!id) return void box?.remove();
    const cote = [...document.querySelectorAll('p, span, h2, h3, div')].find((el) => !el.closest('.aqm-root') && !el.childElementCount && /^cote$/i.test(el.textContent.trim()));
    // The panel of the "Cote": the highest box around its title that holds no other panel's title.
    let panel = cote;
    while (panel?.parentElement && !/mes exemplaires/i.test(panel.parentElement.textContent)) panel = panel.parentElement;
    if (!panel || panel === cote) return;
    if (box?.dataset.card === id && box.previousElementSibling === panel) return;
    if (listingsFor === id && box) return;
    box?.remove();
    listingsFor = id;
    const fresh = h('section', { class: 'aqm-root aqm-listings', 'data-card': id }, h('p', { class: 'aqm-label' }, 'En vente au marché'), h('p', { class: 'aqm-muted' }, 'Lecture des offres…'));
    panel.after(fresh);
    showListings(fresh, decodeURIComponent(id), false);
  }

  // The offers in their box, from the cheapest to the dearest, each with its seller, its number and a button to buy
  // it (not the player's own); read again after a purchase.
  function showListings(fresh, cardId, again) {
    ask({ type: 'card-listings', id: cardId, fresh: again })
      .then((r) => {
        if (!fresh.isConnected) return;
        const rows = r.offers.map((o) =>
          playerRow(
            o.serial,
            o.player,
            h('span', { class: 'aqm-buy-cell' }, perles(o.price), o.id && o.player?.id !== meId ? buyButton(o, fresh, cardId) : null),
            { maxCopies: r.maxCopies }
          )
        );
        fresh.replaceChildren(
          h('div', { class: 'aqm-listings-head' },
            h('p', { class: 'aqm-label' }, 'En vente au marché'),
            h('small', { class: 'aqm-muted' }, r.count ? `${r.count > 5 ? `5 moins chères sur ${fmt(r.count)}` : `${r.count} offre${r.count > 1 ? 's' : ''}`}, de la moins chère à la plus chère` : '')),
          rows.length ? h('ul', { class: 'aqm-owners' }, rows) : h('p', { class: 'aqm-muted' }, 'Personne ne la vend pour le moment.'),
          ...auctionsPart(r.auctions, r.maxCopies)
        );
      })
      .catch((e) => fresh.isConnected && fresh.replaceChildren(h('p', { class: 'aqm-label' }, 'En vente au marché'), h('p', { class: 'aqm-muted' }, e.message)));
  }

  // Time left before the end of an auction: "2 j 4 h", "3 h 12 min", "8 min".
  function timeLeft(at) {
    const m = Math.max(1, Math.round((at - Date.now()) / 60e3));
    if (m < 60) return `${m} min`;
    if (m < 1440) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
    return `${Math.floor(m / 1440)} j${Math.floor((m % 1440) / 60) ? ` ${Math.floor((m % 1440) / 60)} h` : ''}`;
  }

  // Under the offers, the card's 3 running auctions with the lowest bids, the lowest first: the bid to beat, the
  // time left and a button to the auction's page.
  // Nothing when they couldn't be read (null).
  function auctionsPart(auctions, maxCopies) {
    if (!auctions) return [];
    const rows = auctions.slice(0, 3).map((a) =>
      playerRow(
        a.serial,
        a.player,
        h(
          'span',
          { class: 'aqm-buy-cell' },
          h('span', { class: 'aqm-auction-cell' }, perles(a.bid), h('small', { class: 'aqm-muted' }, [a.bids != null ? `${a.bids} enchère${a.bids > 1 ? 's' : ''}` : null, a.endsAt ? `fin dans ${timeLeft(a.endsAt)}` : null].filter(Boolean).join(' · '))),
          // The auction's page in the game (/jeu/encheres/:id), where the player bids.
          a.id ? h('a', { class: 'aqm-queue-btn is-main aqm-buy', href: `/jeu/encheres/${encodeURIComponent(a.id)}` }, a.player?.id === meId ? 'Voir' : 'Enchérir') : null
        ),
        { maxCopies }
      )
    );
    return [
      h('div', { class: 'aqm-listings-head aqm-auctions-head' },
        h('p', { class: 'aqm-label' }, 'Aux enchères'),
        h('small', { class: 'aqm-muted' }, auctions.length ? `${auctions.length > 3 ? `3 mises les plus faibles sur ${fmt(auctions.length)}` : `${auctions.length} en cours`}, de la plus faible à la plus haute` : '')),
      rows.length ? h('ul', { class: 'aqm-owners' }, rows) : h('p', { class: 'aqm-muted' }, 'Aucune enchère en cours.')
    ];
  }

  // What the game's "Mes exemplaires" panel of the card says (to see whether it changed).
  function myCopiesText() {
    const label = [...document.querySelectorAll('p, span, h2, h3, div')].find((el) => !el.closest('.aqm-root') && !el.childElementCount && /^mes exemplaires$/i.test(el.textContent.trim()));
    // (the box around the title that also holds the panel's text)
    let box = label;
    while (box?.parentElement && box.textContent.trim().length <= (label?.textContent.trim().length ?? 0) + 5) box = box.parentElement;
    return box?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  }

  // Buys an offer at once, as the game's market does; the offers are read again afterwards.
  function buyButton(offer, box, cardId) {
    const btn = h('button', { type: 'button', class: 'aqm-queue-btn is-main aqm-buy' }, 'Acheter');
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = 'Achat…';
      try {
        const bought = await gameWrite(`/market/listings/${encodeURIComponent(offer.id)}/buy`, 'POST');
        btn.textContent = '✅ Achetée';
        if (offer.card?.name) addBought(offer.card.name, offer.card.rarity); // its other sales, hidden on the market
        owned = null;
        send({ type: 'collection-stale' });
        // The game's Perles and the card's copies ("Mes exemplaires") read again from the API and given to the page:
        // it is never loaded again (it lost the player's place). Once more if the copies still show the same after 2 s.
        const perles = bought?.perles ?? bought?.balance ?? bought?.buyer?.perles;
        const before = myCopiesText();
        const refresh = () => window.postMessage({ aquamanCmd: 'reload-game', cardId, perles: typeof perles === 'number' ? perles : undefined }, location.origin);
        refresh();
        setTimeout(() => myCopiesText() === before && refresh(), 2000);
        setTimeout(() => box.isConnected && showListings(box, cardId, true), 1200);
      } catch (e) {
        // The game's refusal under the offers (no Perles enough, the offer gone…), then the offers read again.
        btn.textContent = 'Refusé';
        btn.title = e.message;
        box.append(h('p', { class: 'aqm-muted aqm-buy-refused' }, `Achat refusé par le jeu : ${e.message}`));
        setTimeout(() => box.isConnected && showListings(box, cardId, true), 2500);
      }
    });
    return btn;
  }

  // ---------- collection: a "Manquantes" tab beside "Mes cartes / Mes doublons / Album complet" ----------
  // It shows the full album with only the cards marked "Manquante" by the game; the choice is kept for the tab.

  // Off at every visit (never kept: on "Mes cartes" it would hide every card), and only with "Album complet".
  const VIEW_TABS = /^(mes cartes|mes doublons|album complet)$/i;
  let missingOn = false;
  let missingAt = 0; // when it was turned on: the game takes a moment to show "Album complet"
  const missingOnly = () => missingOn;
  const setMissingOnly = (on) => {
    missingOn = on;
    missingAt = on ? Date.now() : 0;
    filteredSize = -1;
  };

  // A tab of the game chosen by the player: the filter stops.
  let clickingFull = false;
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

  function markMissingTab() {
    if (!location.pathname.startsWith('/jeu/collection')) return;
    const tabs = [...document.querySelectorAll('button')].filter((b) => !b.closest('.aqm-root') && VIEW_TABS.test(b.textContent.trim()));
    const full = tabs.find((b) => /^album complet$/i.test(b.textContent.trim()));
    if (!full) return;
    // The game's selected tab is the one whose look differs from the others.
    const looks = tabs.map((b) => b.className);
    const selected = tabs.find((b) => looks.filter((c) => c === b.className).length === 1 && tabs.length > 2) ?? full;
    if (missingOn && selected !== full && Date.now() - missingAt > 2000) setMissingOnly(false); // another view of the game
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
            clickingFull = true; // not a choice of the player: the filter stays
            full.click();
            clickingFull = false;
          }
          markMissingTab();
        }
      });
      full.after(tab);
    }
    // The game shows its selected tab with a pill inside it (a box set over the tab): while the filter is on, the pill
    // of "Album complet" is hidden and "Manquantes" gets one like it.
    const pill = [...full.querySelectorAll('*')].find((el) => getComputedStyle(el).position === 'absolute');
    // (or the tab's own background, when the game colours the button itself)
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
  let pillLook = null; // the game's pill of the selected tab: its colour, its rounding, its shadow
  let plainColor = '';
  let pickedColor = '';

  // Hides the cards of the album that the player has (their label is "× N"), and the series left with none.
  // Done again only when the page's content changed (its number of elements), the album can hold thousands of cards.
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
    // The label under each card: "Manquante", or "× 1" (maybe in several pieces of text): the innermost element
    // whose whole text says it.
    const LABEL = /^(manquante|[×x]\s*\d+)$/i;
    const says = (el) => LABEL.test(el.textContent.replace(/\s+/g, ' ').trim());
    const page = document.querySelector('main') ?? document.body;
    const labels = [...page.querySelectorAll('*')].filter((el) => el.childElementCount < 4 && !el.closest('.aqm-root') && says(el) && ![...el.children].some(says));
    // How many labels each box holds, to find each card's tile: the highest box around its label holding no other,
    // inside the page. A label alone (a series of one card shown) is held alone by every box up to the page: its tile
    // is then the box around its picture, with the boxes wrapping only it.
    const held = new Map();
    for (const label of labels) for (let el = label; el; el = el.parentElement) held.set(el, (held.get(el) ?? 0) + 1);
    document.querySelectorAll('[data-aqm-owned-card]').forEach((el) => el.removeAttribute('data-aqm-owned-card'));
    for (const label of labels) {
      let tile = label;
      for (let up = tile.parentElement; up && up !== page && held.get(up) === 1; up = tile.parentElement) {
        if (labels.length === 1 && tile.querySelector('img') && up.childElementCount > 1) break;
        tile = up;
      }
      // (a label alone, not a card: no picture)
      tile.toggleAttribute('data-aqm-owned-card', tile !== label && !!tile.querySelector('img') && !/^manquante$/i.test(label.textContent.trim()));
    }
  }

  // ---------- collection: "En vente" beside each missing card that someone sells ----------
  // The market is read for the missing cards near the screen only, two at a time; a card's answer is kept 2 minutes.

  const saleOf = new Map(); // card picture -> { at, read: Promise<{ id, name, count } | null> }
  let saleWatch = null;
  function markMissingSales() {
    if (!location.pathname.startsWith('/jeu/collection')) return;
    saleWatch ??= new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          saleWatch.unobserve(e.target);
          showSale(e.target);
        }
      },
      { rootMargin: '300px' }
    );
    for (const el of elementsWithText(document.body, /^\s*manquante\s*$/i)) {
      if (el.childElementCount || el.hasAttribute('data-aqm-sale') || !/^manquante$/i.test(el.textContent.trim())) continue;
      el.setAttribute('data-aqm-sale', '');
      saleWatch.observe(el);
    }
  }

  let salesReading = 0;
  const salesWaiting = [];
  function readSale(ask) {
    return new Promise((resolve, reject) => {
      salesWaiting.push(() => ask().then(resolve, reject));
      nextSale();
    });
  }
  function nextSale() {
    while (salesReading < 2 && salesWaiting.length) {
      salesReading++;
      salesWaiting
        .shift()()
        .finally(() => {
          salesReading--;
          nextSale();
        });
    }
  }

  async function showSale(label) {
    // The card's tile: the closest box around the label with its picture.
    let tile = label.parentElement;
    for (let up = 0; tile && up < 6 && !tile.querySelector('img'); up++) tile = tile.parentElement;
    const img = tile?.querySelector('img');
    const image = imageKey(img?.currentSrc || img?.getAttribute('src'));
    if (!image) return;
    const link = tile.querySelector('a[href*="/jeu/carte/"]') ?? tile.closest('a[href*="/jeu/carte/"]');
    const id = link?.getAttribute('href').match(/\/jeu\/carte\/([^/?#]+)/)?.[1];
    let sale = saleOf.get(image);
    if (!sale || Date.now() - sale.at > 120e3) {
      const series = new URLSearchParams(location.search).get('serie');
      sale = { at: Date.now(), read: readSale(() => ask({ type: 'card-sale', id: id ? decodeURIComponent(id) : null, image, name: img.alt?.trim() || null, series })) };
      saleOf.set(image, sale);
    }
    const r = await sale.read.catch(() => null);
    if (!r?.count || !label.isConnected || label.nextElementSibling?.classList.contains('aqm-sale')) return;
    // Only a sign: a click goes through to the game's card.
    const offers = `En vente : ${r.count} offre${r.count > 1 ? 's' : ''} au marché`;
    label.after(h('span', { class: 'aqm-root aqm-sale', title: offers }, 'En vente'));
    label.setAttribute('data-aqm-sale', 'on');
  }

  // ---------- collection: favourite and search buttons in the "Album de la série" panel ----------

  let albumBusy = false;

  function markAlbum() {
    if (!location.pathname.startsWith('/jeu/collection')) return;
    const id = new URLSearchParams(location.search).get('serie');
    const title = document.getElementById('album-title');
    if (!id || !title || albumBusy) return;
    const panel = title.closest('section') ?? title.parentElement?.parentElement;
    if (!panel || panel.closest('.aqm-root')) return;
    const box = panel.querySelector(':scope > .aqm-album');
    if (box?.dataset.series === id) return;
    box?.remove();
    const fresh = h('div', { class: 'aqm-root aqm-album', 'data-series': id });
    panel.append(fresh);
    renderAlbum(fresh, id);
  }

  async function renderAlbum(box, id) {
    albumBusy = true;
    let st;
    try {
      st = await ask({ type: 'series-status', id });
    } catch {
      box.remove();
      return;
    } finally {
      albumBusy = false;
    }
    if (!box.isConnected) return;
    const note = h('span', { class: 'aqm-album-note', role: 'status' });
    const fav = h('button', { type: 'button', class: 'aqm-album-btn' });
    const paintFav = () => {
      fav.classList.toggle('is-on', st.favorite);
      fav.textContent = st.favorite ? '★ Dans tes favoris' : '☆ Ajouter aux favoris';
      fav.title = st.favorite ? 'Retirer des séries favorites' : 'Ajouter aux séries favorites (Plus → Séries favorites)';
    };
    fav.addEventListener('click', async () => {
      fav.disabled = true;
      await toggleFavorite(id, !st.favorite);
      st.favorite = !st.favorite;
      paintFav();
      fav.disabled = false;
    });
    paintFav();
    const want = h('button', { type: 'button', class: 'aqm-album-btn is-main' });
    const paintWant = () => {
      want.hidden = !st.missing;
      want.disabled = !st.toWant;
      want.textContent = st.toWant > 1 ? `🔭 Rechercher les ${st.toWant} manquantes` : st.toWant ? '🔭 Rechercher la manquante' : '🔭 Toutes les manquantes sont recherchées';
      want.title = 'Les mettre dans ta liste de recherches : le jeu te prévient quand elles sont mises en vente';
    };
    want.addEventListener('click', async () => {
      want.disabled = true;
      const r = await enqueueWants(st.toWantIds);
      st.toWantIds = [];
      st.toWant = 0;
      paintWant();
      want.textContent = r.sent == null ? '🔭 En attente dans Aquaman' : '🔭 Recherche en cours…';
      note.textContent = wantsNote(r, 'tu peux changer de page ou ouvrir des boosters');
    });
    paintWant();
    // (no progress of the waiting cards here: drawn again at each series, it made the page jump; it stays at the
    // bottom of the screen and in "Séries favorites")
    box.replaceChildren(fav, want, note);
  }

  // ---------- collection: "Ma progression" beside the "Ta collection" title ----------

  // The button sits at the right of the game's title, out of the page's flow (absolute, inside the title): the title
  // keeps its width and the game's buttons ("Ma vitrine"…) their place. It has the look of "Ma vitrine" (its classes,
  // its icon's, and the text styles the title would otherwise give it). Where there is no room at the right of the
  // title (a narrow screen, the game's buttons in the way), it goes under the title instead.
  const statsTitle = () => [...document.querySelectorAll('main h1, h1')].find((el) => !el.closest('.aqm-root, .aqm-overlay') && /^\s*ta\s+collection/i.test(el.textContent));
  const vitrineButton = () => [...document.querySelectorAll('main button, main a')].find((b) => !b.closest('.aqm-root, .aqm-overlay, .aqm-stats-open') && /^\s*ma vitrine\s*$/i.test(b.textContent));

  function markCollectionStats() {
    if (!location.pathname.startsWith('/jeu/collection')) return;
    const shown = document.querySelector('.aqm-stats-open');
    // (placed again only when the title or the game's buttons change size: see watchStatsPlace, no measure here)
    if (shown?.isConnected && !shown.classList.contains('is-early')) return;
    const title = statsTitle();
    const vitrine = vitrineButton();
    if (!title || !vitrine) return;
    // The button shown over the page while it loaded (earlyStatsButton) goes into the title, at the same place.
    const btn = shown?.isConnected ? shown : statsButton(vitrine);
    stopEarlyStats();
    btn.classList.remove('is-early');
    btn.style.removeProperty('--aqm-x');
    btn.style.removeProperty('--aqm-y');
    title.setAttribute('data-aqm-stats-title', '');
    title.append(btn);
    placeStatsButton();
    watchStatsPlace(title);
  }

  // The button is placed again when the title or the row of the game's buttons changes size (fonts loaded, a narrower
  // window…), and only then.
  let statsWatch = null;
  function watchStatsPlace(title) {
    statsWatch?.disconnect();
    statsWatch = new ResizeObserver(() => placeStatsButton());
    statsWatch.observe(title);
    const row = vitrineButton()?.parentElement;
    if (row) statsWatch.observe(row);
  }

  // The button, with the look of the game's "Ma vitrine".
  function statsButton(vitrine) {
    const gameIcon = vitrine.querySelector('svg');
    const icon = h('span', { html: ICON_CHART }).firstElementChild;
    icon.setAttribute('class', gameIcon?.getAttribute('class') || 'aqm-stats-ico');
    const btn = h(
      'button',
      {
        type: 'button',
        class: `${vitrine.className} aqm-stats-open`,
        title: 'Ta progression : pourcentage de la collection, cartes par rareté, séries complètes et cartes gagnées chaque jour',
        onclick: openCollectionStats
      },
      icon,
      'Ma progression'
    );
    // (inside the title, the button would take its big italic font: it gets the text styles of "Ma vitrine")
    const cs = getComputedStyle(vitrine);
    for (const p of ['font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height', 'text-transform', 'color'])
      btn.style.setProperty(p, cs.getPropertyValue(p));
    btn.style.setProperty('-webkit-text-fill-color', cs.getPropertyValue('color'));
    return btn;
  }

  // While the page loads, Aquaman changes nothing inside it (React would not find what it expects: error #418): the
  // button is shown at once over the page (at the end of <body>, which React leaves alone), at the place it will
  // have beside the title, and follows the title until markCollectionStats puts it in.
  let earlyTimer = 0;
  let earlyWatch = null;
  function stopEarlyStats() {
    clearInterval(earlyTimer);
    earlyTimer = 0;
    earlyWatch?.disconnect();
    earlyWatch = null;
  }
  function earlyStatsButton() {
    if (!location.pathname.startsWith('/jeu/collection') || !on('collectionStats')) return;
    const since = Date.now();
    const look = () => {
      if (stopped || document.querySelector('.aqm-stats-open')) return;
      const title = statsTitle();
      const vitrine = vitrineButton();
      if (!title || !vitrine || !document.body) return void (Date.now() - since < 15e3 && setTimeout(look, 80));
      const btn = statsButton(vitrine);
      btn.classList.add('aqm-root', 'is-early');
      document.body.append(btn);
      const follow = () => (btn.isConnected && btn.classList.contains('is-early') ? placeEarly(btn, title) : stopEarlyStats());
      follow();
      earlyWatch = new ResizeObserver(follow);
      earlyWatch.observe(title);
      earlyTimer = setInterval(follow, 250); // (the page's layout moves while it loads: fonts, pictures)
    };
    look();
  }
  // In page coordinates: at the right of the title, vertically centred, else under it (as placeStatsButton).
  function placeEarly(btn, title) {
    if (!title.isConnected) return void btn.remove();
    const t = title.getBoundingClientRect();
    const set = (x, y, below) => {
      btn.style.setProperty('--aqm-x', `${Math.round(x + scrollX)}px`);
      btn.style.setProperty('--aqm-y', `${Math.round(y + scrollY)}px`);
      btn.classList.toggle('is-below', below);
    };
    set(t.right + 20, t.top + t.height / 2, false);
    const b = btn.getBoundingClientRect();
    const row = vitrineButton()?.parentElement?.getBoundingClientRect();
    const blocked = row && b.right + 8 > row.left && b.left < row.right && b.top < row.bottom && b.bottom > row.top;
    if (blocked || b.right > document.documentElement.clientWidth - 8) set(t.left, t.bottom + 12, true);
  }

  // At the right of the title when it fits there, else under it.
  function placeStatsButton() {
    const btn = document.querySelector('.aqm-stats-open');
    if (!btn?.isConnected || btn.classList.contains('is-early')) return;
    btn.classList.remove('is-below');
    const b = btn.getBoundingClientRect();
    const row = vitrineButton()?.parentElement?.getBoundingClientRect();
    const blocked = row && b.right + 8 > row.left && b.left < row.right && b.top < row.bottom && b.bottom > row.top;
    if (blocked || b.right > document.documentElement.clientWidth - 8) btn.classList.add('is-below');
  }
  let statsResize = 0;
  addEventListener('resize', () => {
    clearTimeout(statsResize);
    statsResize = setTimeout(placeStatsButton, 150);
  });

  // One reading of the collection every 30 minutes on the game's pages, and soon after it changed (a booster opened, a
  // purchase…): the cards gained each day are counted even when the window is never opened.
  let snapAt = 0;
  let snapTimer = 0;
  function snapCollection(soon = false) {
    if (soon) {
      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => {
        // (5 min at most between two: a reading downloads the whole collection, over 1 MB for a big one)
        if (stopped || !on('collectionStats') || Date.now() - snapAt < 5 * 60e3) return;
        snapAt = Date.now();
        send({ type: 'collection-snapshot' });
      }, 10e3);
      return;
    }
    if (Date.now() - snapAt < 30 * 60e3) return;
    snapAt = Date.now();
    send({ type: 'collection-snapshot' });
  }

  const DAY_MS = 86400e3;
  const dayOf = (t) => new Date(t).toLocaleDateString('sv-SE');
  const dayLabel = (key, long = false) =>
    new Date(`${key}T12:00:00`).toLocaleDateString('fr-FR', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' });
  const signed = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');

  async function openCollectionStats() {
    const body = openOverlay('Ma progression', 'Ta collection sur le total du jeu, carte par rareté, et les cartes que tu gagnes chaque jour.');
    body.parentElement.classList.add('aqm-panel-wide');
    const view = h('div', { class: 'aqm-progress' }, h('p', { class: 'aqm-note' }, 'Lecture de ta collection…'));
    body.append(view);
    let s;
    try {
      s = await ask({ type: 'collection-stats', fresh: true });
    } catch (e) {
      if (view.isConnected) view.replaceChildren(h('p', { class: 'aqm-note' }, e.message));
      return;
    }
    if (!view.isConnected) return;
    snapAt = Date.now();
    const share = s.total ? s.owned / s.total : 0;
    const bar = (part, cls = '') => h('span', { class: `aqm-bar${cls}` }, h('span', { style: `width:${(100 * Math.min(1, Math.max(0, part || 0))).toFixed(2)}%` }));
    const byDay = new Map(s.history.map((d) => [d.day, d]));
    const todayGain = byDay.get(s.today)?.gain ?? 0;
    const tile = (label, value, sub) => h('div', { class: 'aqm-progress-tile' }, h('p', { class: 'aqm-label' }, label), h('strong', {}, value), sub ? h('small', {}, sub) : null);

    // The headline: the share of the game's cards the player has.
    const hero = h(
      'div',
      { class: 'aqm-progress-hero' },
      h('div', {}, h('strong', { class: 'aqm-progress-pct' }, pct(share)), h('p', { class: 'aqm-muted' }, `${fmt(s.owned)} cartes uniques sur ${fmt(s.total)}`)),
      bar(share, ' aqm-bar-big')
    );
    const tiles = h(
      'div',
      { class: 'aqm-progress-tiles' },
      tile('Cartes manquantes', fmt(s.missing), s.total ? `${pct(s.missing / s.total)} du jeu` : null),
      tile('Séries complètes', fmt(s.complete), s.series ? `sur ${fmt(s.series)} séries · ${fmt(s.albums)} album${s.albums > 1 ? 's' : ''} réclamé${s.albums > 1 ? 's' : ''}` : `${fmt(s.albums)} album${s.albums > 1 ? 's' : ''} réclamé${s.albums > 1 ? 's' : ''}`),
      tile('Aujourd’hui', signed(todayGain), todayGain === 1 || todayGain === -1 ? 'carte unique' : 'cartes uniques')
    );

    // Cards of each rarity: unique cards owned on the game's total of that rarity, and the copies. Counted series by
    // series (the first time, a few hundred series: the rows fill in while the window is open).
    const rarityList = h('ul', { class: 'aqm-progress-rarities' });
    const rarityNote = h('p', { class: 'aqm-note' });
    const paintRarities = (counts) => {
      const rows = counts ? Object.entries(counts.byRarity).filter(([, r]) => r.total || r.owned) : [];
      const counting = !counts || counts.pending > 0;
      rarityList.replaceChildren(
        ...rows.map(([code, r]) =>
          h(
            'li',
            { class: 'aqm-progress-rarity' },
            h('span', { class: 'aqm-progress-rname' }, rarityCode(code), h('small', {}, RARITY_NAMES[code] ?? code)),
            h(
              'div',
              { class: 'aqm-progress-rbar' },
              h('p', {}, h('strong', {}, fmt(r.owned)), r.total ? h('small', {}, ` / ${fmt(r.total)} · ${pct(r.owned / r.total)}`) : null),
              bar(r.total ? r.owned / r.total : 0, ` aqm-bar-${code}`)
            ),
            h('span', { class: 'aqm-progress-copies', title: 'Exemplaires de cette rareté (doublons compris)' }, `${fmt(r.copies)} ex.`)
          )
        )
      );
      rarityNote.textContent = !counts
        ? 'Comptage des cartes par rareté…'
        : counting
          ? `Comptage des cartes par rareté : ${fmt(counts.counted)} séries sur ${fmt(counts.series)}… (la première fois seulement ; ensuite, seules les séries qui ont changé sont relues)`
          : '';
      rarityNote.hidden = !rarityNote.textContent;
    };
    paintRarities(s.rarities);
    // The series not counted yet, RARITY_STEP at a time, while the window is open.
    const countRest = async () => {
      let counts = s.rarities;
      for (let tries = 0; view.isConnected && (!counts || counts.pending > 0) && tries < 100; tries++) {
        const before = counts?.counted ?? -1;
        try {
          counts = await ask({ type: 'rarity-counts' });
        } catch {
          break;
        }
        if (!view.isConnected) return;
        paintRarities(counts);
        if (counts.counted === before && counts.failed) break; // (the game refuses: tried again at the next opening)
      }
      if (view.isConnected && counts?.pending > 0) rarityNote.textContent = `Comptage arrêté à ${fmt(counts.counted)} séries sur ${fmt(counts.series)} : il reprendra à la prochaine ouverture.`;
    };

    // The cards gained each of the last 14 days (one bar a day; a day without a reading has none).
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(dayOf(Date.now() - i * DAY_MS));
    const top = Math.max(1, ...days.map((d) => byDay.get(d)?.gain ?? 0));
    const chart = h(
      'div',
      { class: 'aqm-days', role: 'img', 'aria-label': 'Cartes uniques gagnées chaque jour, sur les 14 derniers jours' },
      days.map((d) => {
        const r = byDay.get(d);
        const tip = r
          ? `${dayLabel(d, true)} : ${signed(r.gain)} carte${Math.abs(r.gain) > 1 ? 's' : ''} unique${Math.abs(r.gain) > 1 ? 's' : ''}${r.since && r.since !== dayOf(new Date(`${d}T12:00:00`).getTime() - DAY_MS) ? ` (depuis le ${dayLabel(r.since)})` : ''} · ${fmt(r.owned)} au total`
          : `${dayLabel(d, true)} : pas de relevé (Aquaman n’a pas été ouvert ce jour-là)`;
        const gain = r?.gain ?? 0;
        return h(
          'div',
          { class: `aqm-day${r ? '' : ' is-empty'}${d === s.today ? ' is-today' : ''}`, title: tip, tabindex: '0', 'aria-label': tip },
          h('span', { class: 'aqm-day-val' }, r && gain ? signed(gain) : ''),
          h('span', { class: 'aqm-day-col' }, h('span', { class: 'aqm-day-fill', style: `height:${r && gain > 0 ? Math.max(4, (100 * gain) / top).toFixed(1) : 0}%` })),
          h('span', { class: 'aqm-day-name' }, d === s.today ? 'Auj.' : new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric' }))
        );
      })
    );
    const recorded = s.history.filter((d) => days.includes(d.day));
    const twoWeeks = recorded.reduce((n, d) => n + d.gain, 0);
    const first = s.history[0];
    const fromStart = first ? s.owned - (first.owned - first.gain) : 0; // since the first reading kept
    const daysNote = s.history.length <= 1
      ? 'Aquaman relève ta collection chaque jour où tu joues : la courbe se remplit à partir d’aujourd’hui.'
      : `${signed(twoWeeks)} cartes uniques sur les 14 derniers jours · ${signed(fromStart)} depuis le ${dayLabel(first.day)}, premier relevé.`;

    view.replaceChildren(
      hero,
      tiles,
      h('h3', { class: 'aqm-progress-h' }, 'Par rareté'),
      rarityList,
      rarityNote,
      h('h3', { class: 'aqm-progress-h' }, 'Progression journalière'),
      chart,
      h('p', { class: 'aqm-note' }, daysNote)
    );
    countRest();
  }

  async function openFavorites() {
    const body = openOverlay('Séries favorites', 'Les personnages de tes séries favorites : ceux que tu as, ceux qui te manquent, et ta liste de recherches du jeu.');
    body.parentElement.classList.add('aqm-panel-wide');
    const status = h('p', { class: 'aqm-note' }, 'Chargement de tes séries…');
    body.append(status);
    let report;
    let show = 'missing';
    const opened = new Set(); // series whose cards are shown ("Détails")
    let rarity = '';
    let fresh = true;
    const load = async () => {
      report = await ask({ type: 'favorites', fresh });
      fresh = false;
      favIds = new Set(report.favorites.map((s) => s.id));
      seriesBySlug = new Map(report.all.map((s) => [s.slug, s.id]));
    };
    try {
      await load();
    } catch (e) {
      status.textContent = e.message;
      return;
    }
    status.remove();

    const suggestions = h('datalist', { id: 'aqm-series-suggest' });
    const add = h('input', { type: 'search', class: 'aqm-search', placeholder: 'Ajouter une série aux favoris…', 'aria-label': 'Ajouter une série', list: 'aqm-series-suggest', autocomplete: 'off' });
    const found = h('ul', { class: 'aqm-fav-found' });
    const filters = h('div', { class: 'aqm-sorts' });
    const content = h('div', { class: 'aqm-fav-list' });
    body.append(h('div', { class: 'aqm-pick' }, add), found, filters, content, suggestions);
    // Once an adding ended or the waiting cards were taken out, the series show what is left to search.
    filters.before(
      searchPanel(async () => {
        fresh = true;
        try {
          await load();
        } catch {}
        render();
      })
    );

    // Series matching what is typed, each with a star.
    const renderFound = () => {
      const q = add.value
        .trim()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
      const fold = (s) =>
        String(s ?? '')
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase();
      const hits = q ? report.all.filter((s) => fold(s.title).includes(q)).slice(0, 8) : [];
      suggestions.replaceChildren(...hits.map((s) => h('option', { value: s.title })));
      found.replaceChildren(
        ...hits.map((s) =>
          h(
            'li',
            {},
            h('img', { src: `/api/covers/${s.slug}.webp`, alt: '', loading: 'lazy' }),
            h('span', {}, h('strong', {}, s.title), h('small', {}, `${fmt(s.owned)}/${fmt(s.total)}`)),
            h(
              'button',
              {
                type: 'button',
                class: `aqm-chip${favIds.has(s.id) ? ' is-on' : ''}`,
                onclick: async () => {
                  await toggleFavorite(s.id, !favIds.has(s.id));
                  await load();
                  renderFound();
                  render();
                }
              },
              favIds.has(s.id) ? '★ Favorite' : '☆ Ajouter'
            )
          )
        )
      );
    };
    add.addEventListener('input', renderFound);

    const chip = (value, label, current, pick) =>
      h('button', { type: 'button', class: `aqm-chip${value === current ? ' is-on' : ''}`, 'aria-pressed': String(value === current), onclick: () => pick(value) }, label);

    function render() {
      filters.replaceChildren(
        h('span', { class: 'aqm-filter-name' }, 'Afficher'),
        ...[
          ['all', 'Toutes'],
          ['missing', 'Manquantes'],
          ['owned', 'Possédées'],
          ['wanted', 'Recherchées']
        ].map(([v, l]) =>
          chip(v, l, show, (x) => {
            show = x;
            render();
          })
        ),
        h('span', { class: 'aqm-filter-name aqm-gap' }, 'Rareté'),
        ...[['', 'Toutes'], ...RANKED.map((c) => [c, c])].map(([v, l]) =>
          chip(v, l, rarity, (x) => {
            rarity = x;
            render();
          })
        )
      );
      if (!report.favorites.length) {
        content.replaceChildren(h('p', { class: 'aqm-empty' }, 'Aucune série favorite pour le moment : ajoute-en avec le champ ci-dessus, ou avec l’étoile ☆ sur les séries de la page Collection.'));
        return;
      }
      content.replaceChildren(
        ...report.favorites.map((s) => {
          const keep = (c) => (!rarity || c.rarity === rarity) && (show === 'all' || (show === 'missing' && !c.owned) || (show === 'owned' && c.owned > 0) || (show === 'wanted' && c.wanted));
          const cards = s.cards.filter(keep).sort((a, b) => RANKED.indexOf(b.rarity) - RANKED.indexOf(a.rarity) || a.name.localeCompare(b.name));
          const missing = s.cards.filter((c) => !c.owned);
          const toWantIds = missing.filter((c) => !c.wanted).map((c) => c.id);
          const toWant = toWantIds.length;
          const note = h('p', { class: 'aqm-muted', role: 'status' });
          const wantAll = h(
            'button',
            {
              type: 'button',
              class: 'aqm-sort is-on',
              disabled: !toWant,
              onclick: async () => {
                wantAll.disabled = true;
                note.textContent = wantsNote(await enqueueWants(toWantIds), 'tu peux fermer cette fenêtre, changer de page ou ouvrir des boosters');
              }
            },
            h('strong', {}, toWant ? `Rechercher les ${toWant} manquante${toWant > 1 ? 's' : ''}` : 'Toutes les manquantes sont recherchées'),
            h('small', {}, 'Le jeu te prévient quand elles sont mises en vente')
          );
          return h(
            'section',
            { class: 'aqm-fav-series' },
            h(
              'div',
              { class: 'aqm-fav-head' },
              h('img', { src: `/api/covers/${s.slug}.webp`, alt: '', loading: 'lazy' }),
              h(
                'div',
                { class: 'aqm-fav-title' },
                h('strong', {}, s.title),
                h('small', {}, `${fmt(s.owned)}/${fmt(s.total)} cartes · ${fmt(missing.length)} manquante${missing.length > 1 ? 's' : ''}`),
                h('span', { class: 'aqm-bar' }, h('span', { style: `width:${s.total ? ((100 * s.owned) / s.total).toFixed(1) : 0}%` }))
              ),
              wantAll,
              h(
                'button',
                {
                  type: 'button',
                  class: `aqm-chip aqm-fav-details${opened.has(s.id) ? ' is-on' : ''}`,
                  'aria-expanded': String(opened.has(s.id)),
                  onclick: () => {
                    opened.has(s.id) ? opened.delete(s.id) : opened.add(s.id);
                    render();
                  }
                },
                opened.has(s.id) ? 'Masquer ▴' : `Détails ▾`
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'aqm-chip is-on aqm-fav-unstar',
                  title: 'Retirer des séries favorites',
                  onclick: async () => {
                    await toggleFavorite(s.id, false);
                    await load();
                    render();
                  }
                },
                '★'
              )
            ),
            note,
            !opened.has(s.id)
              ? null
              : cards.length
              ? h(
                  'ul',
                  { class: 'aqm-fav-cards' },
                  cards.map((c) => {
                    const want = h(
                      'button',
                      {
                        type: 'button',
                        class: `aqm-want${c.wanted ? ' is-on' : ''}${c.waiting ? ' is-wait' : ''}`,
                        title: c.waiting ? 'En attente dans Aquaman (ta liste du jeu est pleine) : ne plus la chercher' : c.wanted ? 'Ne plus la chercher' : 'Je la cherche : être prévenu quand elle est mise en vente',
                        onclick: async (e) => {
                          e.preventDefault();
                          want.disabled = true;
                          try {
                            const r = await wantCard(c.id, !c.wanted);
                            c.wanted = r.wanted;
                            c.waiting = false;
                            want.classList.toggle('is-on', c.wanted);
                            want.classList.remove('is-wait');
                            want.title = c.wanted ? 'Ne plus la chercher' : 'Je la cherche : être prévenu quand elle est mise en vente';
                          } catch (err) {
                            want.title = err.message;
                          } finally {
                            want.disabled = false;
                          }
                        }
                      },
                      '🔭'
                    );
                    return h(
                      'li',
                      { class: `aqm-fav-card${c.owned ? ' is-owned' : ''}` },
                      h('a', { href: `/jeu/carte/${encodeURIComponent(c.id)}` }, h('img', { src: cardImageUrl(c.image), alt: '', loading: 'lazy' })),
                      h('p', { class: 'aqm-mini-name' }, rarityCode(c.rarity), ' ', c.name),
                      h('p', { class: 'aqm-muted' }, c.owned ? (c.owned > 1 ? `×${c.owned}` : 'Possédée') : 'Manquante'),
                      c.owned ? null : want
                    );
                  })
                )
              : h('p', { class: 'aqm-muted' }, 'Aucune carte pour ce filtre.')
          );
        })
      );
    }

    render();
  }

  // ---------- trades: an owned / missing dot ----------

  let owned = null; // { at, byImage }
  let tradesBusy = false;
  let cardImages = null; // { at, keys: Set | null }: image keys of the game catalogue, to tell cards from avatars

  // Pages that show exchanges: the game's own ones and the private messages, where a proposal is sent as an attachment.
  const TRADE_PAGES = /^\/(jeu\/echanges|messages)(\/|$)/;

  async function catalogImages() {
    if (cardImages && Date.now() - cardImages.at < 30 * 60e3) return cardImages.keys;
    const res = await ask({ type: 'card-images' });
    cardImages = { at: Date.now(), keys: res.keys ? new Set(res.keys) : null };
    return cardImages.keys;
  }

  // Copies owned by image key, kept 30 seconds.
  async function ownedByImage() {
    if (owned && Date.now() - owned.at < 30e3) return owned.byImage;
    const res = await ask({ type: 'ownership' });
    owned = { at: Date.now(), byImage: res.byImage };
    return owned.byImage;
  }

  // What each card of an exchange shows already ("picture|copies|gives"): only the new or changed ones are done again.
  const tradeDone = new WeakMap();

  async function markTrades() {
    if (tradesBusy) return;
    const labels = elementsWithText(document.body, /^\s*tu (re[çc]ois|donnes)\s*:?\s*$/i);
    const everyCard = TRADE_PAGES.test(location.pathname);
    if (!labels.length && !everyCard) return;
    tradesBusy = true;
    try {
      const [byImage, known] = await Promise.all([ownedByImage(), everyCard ? catalogImages().catch(() => null) : null]);
      if (stopped) return;
      const todo = [];
      const seen = new Set();
      const add = (img, box, gives) => {
        seen.add(img);
        const src = img.currentSrc || img.src;
        const frame = img.parentElement;
        if (!frame || !isCardImage(src) || img.closest('.aqm-root')) return;
        const key = imageKey(src);
        const n = byImage[key] ?? 0;
        // Outside a "Tu reçois / Tu donnes" block, only a picture of the catalogue (or an owned card) is a card: not an avatar.
        if (!box && !n && !known?.has(key)) return;
        const done = `${key}|${n}|${gives}`;
        if (tradeDone.get(img) === done && frame.querySelector(':scope > .aqm-dot')) return;
        todo.push({ img, frame, box, n, gives, done });
      };
      for (const label of labels) {
        if (!label.isConnected) continue;
        const gives = /donnes/i.test(label.textContent);
        let box = label.parentElement;
        while (box && box !== document.body && !box.querySelector('img')) box = box.parentElement;
        if (!box || box === document.body) continue;
        for (const img of box.querySelectorAll('img')) add(img, box, gives);
      }
      // A proposal in the messages, or a page of exchanges laid out without those words: every card gets its dot.
      if (everyCard) for (const img of document.body.querySelectorAll('img')) if (!seen.has(img)) add(img, null, null);
      // The styles are all read first, then the page is changed: a read after each change made the browser lay the
      // whole exchange out again once per card, which froze the page.
      for (const t of todo) t.anchor = t.frame.style.position !== 'relative' && getComputedStyle(t.frame).position === 'static';
      for (const { img, frame, box, n, gives, done, anchor } of todo) {
        let tile = frame;
        while (box && tile.parentElement && tile.parentElement !== box && tile.parentElement.querySelectorAll('img').length === 1) tile = tile.parentElement;
        tile.classList.add('aqm-trade-tile');
        if (anchor) {
          frame.style.position = 'relative';
          frame.dataset.aqmAnchor = '1';
        }
        tradeDone.set(img, done);
        let dot = frame.querySelector(':scope > .aqm-dot');
        if (!dot) dot = frame.appendChild(h('span', { class: 'aqm-root aqm-dot' }));
        setClass(dot, `aqm-root aqm-dot ${n ? 'is-yes' : 'is-no'}${n > 1 ? ' has-count' : ''}`);
        setText(dot, n > 1 ? `×${n}` : '');
        const title = !n
          ? 'Tu n’as pas cette carte'
          : gives === null
            ? n > 1
              ? `Tu l’as (${n} exemplaires)`
              : 'Tu l’as'
          : gives
            ? n > 1
              ? `Tu en as ${n} : il t’en restera ${n - 1}`
              : 'Ton seul exemplaire'
            : n > 1
              ? `Tu l’as déjà (${n} exemplaires)`
              : 'Tu l’as déjà';
        if (dot.title !== title) dot.title = title;
      }
    } catch (e) {
      console.warn('[Aquaman] échanges :', e);
    } finally {
      tradesBusy = false;
    }
  }

  // ---------- trades: filters "Mes recherches", "Il me manque", "Il lui manque" ----------
  // In the window "Proposer un échange", beside the game's chips (Toutes, Doublons, En vente): Aquaman's own filters,
  // which hide the cards that don't match, on top of the game's (with "Doublons": the duplicates that match).
  // "Tu demandes" (the partner's cards): Mes recherches, Il me manque. "Tu donnes" (the player's): Il lui manque.
  const TRADE_FILTERS = [
    { key: 'searched', label: 'Mes recherches', title: 'Seulement les cartes de ta liste de recherches', on: 'asks' },
    { key: 'mine', label: 'Il me manque', title: 'Seulement les cartes que tu n’as pas', on: 'asks' },
    { key: 'theirs', label: 'Il lui manque', title: 'Seulement les cartes que ton partenaire n’a pas', on: 'gives' }
  ];
  const tradeOn = new Set(); // the filters picked, kept while the page stays open
  let searchedKeys = null; // { at, keys: Set } the pictures of the searched cards
  let partner = null; // { name, at, state: 'loading' | 'ok' | 'private' | 'unknown', byImage }
  let tradeLoading = false;
  let tradeAskedAt = 0;
  const tradeTiles = new WeakMap(); // picture -> its tile in the grid

  // The window of an exchange being made: its chips, and which side is shown (gives: "Tu donnes").
  function tradeWindow() {
    const doubles = [...document.querySelectorAll('button')].find((b) => !b.closest('.aqm-root') && /^doublons\b/i.test(b.textContent.trim()));
    const chips = doubles?.parentElement;
    if (!chips || ![...chips.querySelectorAll('button')].some((b) => /^toutes$/i.test(b.textContent.trim()))) return null;
    const tabText = (b) => b.textContent.trim().toLowerCase();
    for (let box = chips.parentElement, up = 0; box && box !== document.body && up < 10; box = box.parentElement, up++) {
      const tabs = [...box.querySelectorAll('button, [role="tab"]')].filter((b) => /^(tu donnes|tu demandes|perles et mot)$/.test(tabText(b)));
      const gives = tabs.find((b) => tabText(b) === 'tu donnes');
      const asks = tabs.find((b) => tabText(b) === 'tu demandes');
      if (!gives || !asks) continue;
      // The tab shown: the one marked so, else the one drawn unlike the others.
      const marked = tabs.find((b) => b.getAttribute('aria-selected') === 'true' || b.getAttribute('data-state') === 'active' || b.getAttribute('aria-pressed') === 'true');
      const odd = tabs.find((b) => tabs.filter((x) => x.className === b.className).length === 1);
      const shown = marked ?? (tabs.length > 2 ? odd : null);
      if (!shown) return null;
      return { box, chips, side: shown === gives ? 'gives' : shown === asks ? 'asks' : null };
    }
    return null;
  }

  // The partner's name: "Avec Towntter" at the top of the window.
  function tradePartnerName(box) {
    for (const el of box.querySelectorAll('p, span, div, h2, h3')) {
      const text = el.textContent.trim();
      if (text.length > 80 || el.children.length > 3) continue;
      const m = text.match(/^avec\s+(.+)$/i);
      if (m) return m[1].trim();
    }
    return null;
  }

  async function loadTradeData(name) {
    if (tradeLoading) return;
    tradeLoading = true;
    try {
      const jobs = [];
      if (tradeOn.has('searched') && (!searchedKeys || Date.now() - searchedKeys.at > 60e3))
        jobs.push(
          ask({ type: 'searched-images' })
            .then((r) => (searchedKeys = { at: Date.now(), keys: new Set(r.keys ?? []) }))
            .catch(() => (searchedKeys = { at: Date.now(), keys: new Set() }))
        );
      if (tradeOn.has('mine')) jobs.push(ownedByImage().catch(() => null));
      if (tradeOn.has('theirs') && name && (partner?.name !== name || Date.now() - partner.at > 5 * 60e3)) {
        partner = { name, at: Date.now(), state: 'loading', byImage: null };
        jobs.push(
          ask({ type: 'player-ownership', id: playersSeen.get(foldName(name)) ?? null, name })
            .then((r) => {
              if (partner?.name !== name) return;
              partner.state = !r.found ? 'unknown' : r.private ? 'private' : 'ok';
              partner.byImage = r.byImage ?? null;
            })
            .catch(() => partner?.name === name && (partner.state = 'unknown'))
        );
      }
      await Promise.all(jobs);
    } finally {
      tradeLoading = false;
    }
  }

  function markTradeFilters() {
    const win = tradeWindow();
    if (!win) {
      if (!document.querySelector('.aqm-trade-filter')) return;
      document.querySelectorAll('.aqm-trade-filter').forEach((el) => el.remove());
      document.querySelectorAll('[data-aqm-tradehide]').forEach((el) => el.removeAttribute('data-aqm-tradehide'));
      return;
    }
    const { box, chips, side } = win;
    const name = tradePartnerName(box);
    // The chips of this side, after the game's.
    const plain = [...chips.querySelectorAll('button')].find((b) => !b.classList.contains('aqm-trade-filter') && /^doublons\b/i.test(b.textContent.trim()));
    for (const f of TRADE_FILTERS) {
      let chip = chips.querySelector(`:scope > .aqm-trade-filter[data-key="${f.key}"]`);
      if (f.on !== side) {
        chip?.remove();
        continue;
      }
      if (!chip) {
        chip = h(
          'button',
          {
            type: 'button',
            class: `${plain?.className ?? ''} aqm-trade-filter`,
            'data-key': f.key,
            onclick: () => {
              tradeOn.has(f.key) ? tradeOn.delete(f.key) : tradeOn.add(f.key);
              markTradeFilters();
            }
          },
          f.label
        );
        chips.append(chip);
      }
      const isOn = tradeOn.has(f.key);
      chip.classList.toggle('is-on', isOn);
      chip.setAttribute('aria-pressed', String(isOn));
      const state = f.key === 'theirs' && isOn ? partner?.state : null;
      const title = state === 'private' ? `${f.title} : sa collection est privée, rien n’est masqué.` : state === 'unknown' ? `${f.title} : Aquaman n’a pas trouvé ${name ?? 'ce joueur'}, rien n’est masqué.` : f.title;
      if (chip.title !== title) chip.title = title;
      chip.classList.toggle('is-off', state === 'private' || state === 'unknown');
    }

    // The filters of this side, with what they need.
    const active = TRADE_FILTERS.filter((f) => f.on === side && tradeOn.has(f.key)).map((f) => f.key);
    const mine = owned && Date.now() - owned.at < 30e3 ? owned.byImage : null;
    const needs =
      (active.includes('searched') && (!searchedKeys || Date.now() - searchedKeys.at > 60e3)) ||
      (active.includes('mine') && !mine) ||
      (active.includes('theirs') && name && (partner?.name !== name || Date.now() - partner.at > 5 * 60e3));
    // (once every 5 s at most: an answer that doesn't come doesn't ask again on every change of the page)
    if (needs && Date.now() - tradeAskedAt > 5000) {
      tradeAskedAt = Date.now();
      loadTradeData(name).then(() => !stopped && markTradeFilters());
    }
    const tests = [];
    if (active.includes('searched') && searchedKeys) tests.push((key) => searchedKeys.keys.has(key));
    if (active.includes('mine') && mine) tests.push((key) => !mine[key]);
    if (active.includes('theirs') && partner?.name === name && partner.state === 'ok') tests.push((key) => !partner.byImage[key]);

    // The cards of the grid: each picture's tile (its largest box holding only it), hidden when a filter says no.
    for (const img of box.querySelectorAll('img')) {
      const src = img.currentSrc || img.src;
      // (only the grid under the chips: not the partner's picture, nor the cards already put in the exchange above)
      if (img.closest('.aqm-root') || !(chips.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING) || chips.contains(img) || !isCardImage(src)) continue;
      let tile = tradeTiles.get(img);
      if (!tile?.isConnected || !tile.contains(img)) {
        tile = img;
        while (tile.parentElement && tile.parentElement !== box && tile.parentElement.querySelectorAll('img').length === 1) tile = tile.parentElement;
        tradeTiles.set(img, tile);
      }
      const key = imageKey(src);
      const hide = !!tests.length && !!key && !tests.every((t) => t(key));
      if (tile.hasAttribute('data-aqm-tradehide') !== hide) tile.toggleAttribute('data-aqm-tradehide', hide);
    }
  }

  // ---------- home: bigger "Les beaux tirages" ----------

  function enlargePulls() {
    if (!/^\/jeu\/?$/.test(location.pathname)) return;
    for (const label of elementsWithText(document.body, /^\s*(les )?beaux tirages\s*$/i)) {
      let section = label.parentElement;
      while (section && section !== document.body && section.querySelectorAll('img').length < 2) section = section.parentElement;
      if (!section || section === document.body) continue;
      section.classList.add('aqm-pulls');
      for (const img of section.querySelectorAll('img')) {
        if (img.closest('.aqm-pull-thumb')) continue;
        const parent = img.parentElement;
        const wrap = parent && parent !== section && parent.children.length === 1 && !parent.textContent.trim() && parent.tagName !== 'A' ? parent : img;
        wrap.classList.add('aqm-pull-thumb');
      }
    }
  }

  // ---------- collection: the wheel scrolls the horizontal strips ----------

  // True for a strip that scrolls sideways: scrollable, or clipped with several items (not a cut-off title).
  function scrollsSideways(el, style) {
    if (el.scrollWidth - el.clientWidth < 4) return false;
    if (/(auto|scroll)/.test(style.overflowX)) return true;
    return style.overflowX === 'hidden' && el.children.length >= 3 && style.textOverflow !== 'ellipsis';
  }

  let snapBack = null; // { el, snap, smooth, timer }: snapping is put back once the wheel stops

  function onWheel(e) {
    if (stopped || !location.pathname.startsWith('/jeu/collection') || e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    for (let el = e.target instanceof Element ? e.target : null; el && el !== document.body; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (!scrollsSideways(el, style)) continue;
      // overflow-x: auto turns overflow-y to auto too: only a real vertical list keeps the wheel.
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

  // Strip under a point of the Collection page that scrolls sideways, or null.
  function sidewaysStrip(from) {
    for (let el = from instanceof Element ? from : null; el && el !== document.body; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (!scrollsSideways(el, style)) continue;
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight - el.clientHeight > 24) return null;
      return el;
    }
    return null;
  }

  // Scroll snapping would bring a small move back to the same card: off while scrolling, back ms after the last move.
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

  // The click that ends a drag doesn't open what is under the pointer.
  function swallowClick() {
    const stop = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    document.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', stop, true), 400);
  }

  // ---------- collection: click and drag the horizontal strips ----------

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

  // The site's images and links would start the browser's own drag instead.
  const onGrabDragStart = (e) => grab && grab.el.contains(e.target) && e.preventDefault();

  // Hand cursor on the strip of series.
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

  // ---------- "Ma vitrine": drag and drop ----------

  const slotKey = (slot) => imageKey(slot.querySelector('img')?.currentSrc || slot.querySelector('img')?.src);
  let press = null; // card pressed or dragged: { dlg, slot, key, x, y, id, touch, active, ghost }
  let moving = false;

  const vitrines = new Set(); // "Ma vitrine" windows found: the page's text searches and changes skip them

  // Slots of the showcase editor in order: the card and its row of 3 buttons (‹ › ✕). Found from the buttons: the
  // window also lists every card of the collection, going through all of its elements would be slow.
  function showcaseSlots(dlg) {
    const slots = [];
    const seen = new Set();
    for (const btn of dlg.querySelectorAll('button')) {
      if (btn.querySelector('img') || btn.closest('.aqm-root')) continue;
      // The row: the closest parent with 3 buttons (more: it holds several rows, or other buttons).
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

  // The list of the collection's cards in the window (the element with the most cards as children), drawn only
  // near the screen: hundreds of animated cards made the window slow.
  const vitrineGrids = new WeakMap(); // window -> list
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

  // True when a change of the page only concerns Aquaman or the card list of a "Ma vitrine" window: no need to run.
  function quietChange(r) {
    const target = r.target instanceof Element ? r.target : r.target.parentElement;
    if (!target || target.closest('.aqm-root, [data-aqm-lite]')) return true;
    const nodes = [...r.addedNodes, ...r.removedNodes];
    return nodes.length > 0 && nodes.every((n) => n instanceof Element && n.classList.contains('aqm-root'));
  }

  // Windows titled "Ma vitrine".
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

  // Hides the slot's buttons, adds the remove cross and the drag.
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

  // Starts dragging: a copy of the card follows the pointer.
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

  // Slot of the window under a point.
  function slotAt(dlg, x, y) {
    const slot = document.elementFromPoint(x, y)?.closest('.aqm-slot');
    return slot && dlg.contains(slot) ? slot : null;
  }

  const clearOver = (dlg) => dlg.querySelectorAll('.aqm-over').forEach((el) => el.classList.remove('aqm-over'));

  // Ends a press; a drop on another slot moves the card there.
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
      if (press.touch) return endPress(false); // the finger moved before the long press: a scroll
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

  // Moves the card with the site's arrows, one slot at a time, up to the slot wanted.
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

  // Waits until the card left its slot (0.8 s at most).
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

  // ---------- home: pity counters under the free booster timer ----------

  let pityReport = null; // { opened, sync, SSR: { since, known, every, left }, UR: { … } }
  let pityAt = 0;
  let pityLoading = false;
  let pityRulesSent = '';

  // The numbers of the shop's text "une SSR tous les 60 boosters et une UR tous les 190 boosters".
  function readPityRules() {
    for (const el of elementsWithText(document.body, /SSR tous les \d+ boosters/i)) {
      const m = el.textContent.match(/SSR tous les (\d+) boosters.*?UR tous les (\d+)/i);
      if (!m || pityRulesSent === m[0]) continue;
      pityRulesSent = m[0];
      send({ type: 'pity-rules', rules: { SSR: Number(m[1]), UR: Number(m[2]) } }).then(() => (pityReport = null));
    }
  }

  // Where the counters go: after the "+1 booster dans …" timer, else after the "Acheter un booster" buttons.
  function pityPlace() {
    for (const label of elementsWithText(document.body, /booster dans|r[ée]serve pleine/i)) {
      let pill = label;
      while (pill.parentElement && pill.parentElement !== document.body && !pill.querySelector('svg, [role="progressbar"]') && pill.textContent.length < 120) pill = pill.parentElement;
      if (pill.querySelector('svg, [role="progressbar"]')) return pill;
    }
    const buy = [...document.querySelectorAll('button, a')].find((b) => !b.closest('.aqm-root') && /acheter un booster|tout ouvrir/i.test(b.textContent));
    return buy?.parentElement ?? null;
  }

  function showPity() {
    if (!/^\/jeu\/?$/.test(location.pathname)) return;
    const place = pityPlace();
    if (!place) return;
    if (place.nextElementSibling?.classList.contains('aqm-pity')) {
      if (!pityReport || Date.now() - pityAt > 60e3) loadPity();
      return;
    }
    document.querySelectorAll('.aqm-pity').forEach((el) => el.remove());
    place.after(h('div', { class: 'aqm-root aqm-pity', role: 'status' }));
    pityReport ? renderPity() : loadPity();
  }

  // Reads the counters again (fresh: with the openings of the other devices right now).
  async function loadPity(fresh = false) {
    if (pityLoading) return;
    pityLoading = true;
    pityAt = Date.now();
    try {
      const report = await send({ type: 'pity', fresh });
      if (report && !report.error) pityReport = report;
    } finally {
      pityLoading = false;
    }
    renderPity();
  }

  function renderPity() {
    const box = document.querySelector('.aqm-pity');
    if (!box || !pityReport) return;
    const line = (code) => {
      const p = pityReport[code];
      const left = p.left;
      const when = left <= 1 ? 'au prochain booster' : `dans ${fmt(left)} boosters`;
      return h(
        'div',
        { class: 'aqm-pity-line', title: p.known ? `${fmt(p.since)} booster${p.since > 1 ? 's' : ''} ouvert${p.since > 1 ? 's' : ''} depuis ta dernière ${code}.` : `Aquaman n’a pas encore vu de ${code} sortir : il compte depuis son installation, donc la garantie peut arriver plus tôt.` },
        h('p', {}, rarityCode(code), ' garantie ', h('strong', {}, when), p.known ? '' : ' au plus'),
        h('span', { class: 'aqm-bar' }, h('span', { style: `width:${Math.min(100, (100 * p.since) / p.every).toFixed(1)}%` })),
        h('small', {}, p.known ? `${fmt(p.since)} / ${fmt(p.every)} depuis ta dernière ${code}` : `${fmt(p.since)} / ${fmt(p.every)} sans ${code} depuis qu’Aquaman compte`)
      );
    };
    // The SEC has no guarantee: the boosters since the last one, and what the game's odds give, without a bar.
    const secLine = () => {
      const s = pityReport.SEC;
      if (!s) return null;
      const n = `${fmt(s.since)}${s.known ? '' : '+'} booster${s.since > 1 ? 's' : ''}`;
      const odds = s.chance > 0 ? `une tous les ~${fmt(1 / s.chance)} boosters en moyenne · ${pct(1 - (1 - s.chance) ** 100)} d’en avoir une dans les 100 prochains` : null;
      return h(
        'div',
        {
          class: 'aqm-pity-line is-sec',
          title: `Pas de garantie pour la SEC : chaque booster a la même chance, la malchance passée ne la rapproche pas.${s.known ? '' : ' Aquaman n’a pas encore vu de SEC sortir : il compte depuis son installation.'}`
        },
        h('p', {}, rarityCode('SEC'), ' ', h('strong', {}, n), ' sans SEC'),
        h('small', {}, odds ? `Pas de garantie : ${odds}.` : 'Pas de garantie pour la SEC.')
      );
    };
    box.replaceChildren(
      h('p', { class: 'aqm-label' }, 'Garantie anti-malchance'),
      h('div', { class: 'aqm-pity-lines' }, line('SSR'), line('UR'), secLine()),
      h(
        'p',
        { class: 'aqm-pity-note' },
        {
          ok: 'Compté par Aquaman à chaque booster ouvert, et partagé entre tes appareils (PC, téléphone, extension ou script).',
          waiting: 'Compté par Aquaman à chaque booster ouvert, et partagé entre tes appareils dès ta prochaine ouverture.',
          error: 'Compté par Aquaman sur ce navigateur : le partage avec tes autres appareils ne répond pas pour le moment.',
          off: 'Compté par Aquaman à chaque booster ouvert sur ce navigateur (partage entre appareils désactivé).'
        }[pityReport.sync] ?? 'Compté par Aquaman à chaque booster ouvert.'
      ),
      h('div', { class: 'aqm-pity-more' }, h('button', { type: 'button', class: 'aqm-album-btn', onclick: openPityHistory }, '📜 Historique'))
    );
  }

  // The tracker of the SSR, UR and SEC (each rarity on its own): how often each drops against
  // the game's odds, the last boosters opened at a glance, and for each rarity the cards got with the boosters each
  // one took, the most recent first.
  async function openPityHistory() {
    const body = openOverlay('Historique des tirages', 'À quelle fréquence tu tires des SSR, UR et SEC, et combien de boosters il t’a fallu pour chacune.');
    body.parentElement.classList.add('aqm-panel-wide');
    const view = h('div', { class: 'aqm-history' }, h('p', { class: 'aqm-note' }, 'Lecture de tes ouvertures…'));
    body.append(view);
    let r;
    try {
      r = await ask({ type: 'pity-history' });
    } catch (e) {
      view.replaceChildren(h('p', { class: 'aqm-note' }, e.message));
      return;
    }
    const CODES = ['SSR', 'UR', 'SEC'];
    const day = (at) => new Date(at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const boosters = (n) => `${fmt(n)} booster${n > 1 ? 's' : ''}`;
    const decimal = (x) => x.toFixed(1).replace('.', ',');
    const weeks = r.since ? Math.max(1 / 7, (Date.now() - r.since) / (7 * 86400e3)) : null;

    // One card per rarity: how often it drops, the game's odds (without the guarantee) and the luck.
    const rate = (code) => {
      const n = r[code].hits.length;
      const every = n ? r.opened / n : null;
      const expected = r.chances?.[code] > 0 ? 1 / r.chances[code] : null;
      const ratio = every && expected ? expected / every : null;
      const luck = ratio == null ? null : ratio >= 1.15 ? ['is-good', `${decimal(ratio)}× plus souvent`] : ratio <= 0.87 ? ['is-bad', `${decimal(1 / ratio)}× moins souvent`] : ['', 'Dans la moyenne'];
      const perWeek = weeks && n ? n / weeks : 0;
      return h(
        'div',
        { class: `aqm-rate is-${code}` },
        h('div', { class: 'aqm-rate-top' }, rarityCode(code), luck ? h('span', { class: `aqm-tag aqm-luck ${luck[0]}` }, luck[1]) : null),
        h('p', { class: 'aqm-rate-value' }, every ? ['1 ', h('small', {}, 'tous les'), ` ${fmt(every)}`] : '—'),
        h('p', { class: 'aqm-rate-sub' }, every ? 'boosters, chez toi' : `aucune en ${boosters(r.opened)}`),
        h(
          'p',
          { class: 'aqm-rate-foot', title: 'La chance du jeu pour un booster classique, sans la garantie anti-malchance.' },
          expected ? `Jeu : 1 tous les ~${fmt(expected)}` : 'Jeu : chance inconnue',
          perWeek ? ` · ≈ ${perWeek < 10 ? decimal(perWeek) : fmt(perWeek)}/sem.` : ''
        )
      );
    };

    // The last boosters, one square each, coloured by their best card.
    const strip = r.recent?.length
      ? h(
          'div',
          { class: 'aqm-history-box' },
          h('div', { class: 'aqm-history-row' }, h('p', { class: 'aqm-label' }, `Tes ${boosters(r.recent.length)} les plus récents`), h('small', { class: 'aqm-muted' }, 'du plus ancien au plus récent')),
          h(
            'div',
            { class: 'aqm-tracker-strip' },
            r.recent.map((top) => {
              const code = top >= 6 ? 'SEC' : top >= 5 ? 'UR' : top >= 4 ? 'SSR' : null;
              return h('span', { class: `aqm-cell${code ? ` is-${code}` : ''}`, title: code ?? 'Ni SSR, ni UR, ni SEC' });
            })
          ),
          h('p', { class: 'aqm-tracker-legend' }, [null, ...CODES].map((code) => h('span', {}, h('span', { class: `aqm-cell${code ? ` is-${code}` : ''}` }), code ?? 'Autre')))
        )
      : null;

    // The kind of booster each card came from (kept since Aquaman 1.4.7; before, guessed from the card: Halloween or
    // Classique; "Pack inconnu" when the card itself is unknown).
    const UNKNOWN = '?';
    const packKey = (x) => x.pack?.id ?? UNKNOWN;
    const packName = (x) => x.pack?.name ?? (x.pack?.id === 'classic' ? 'Classique' : x.pack ? 'Autre pack' : 'Pack inconnu');
    const packs = new Map();
    for (const code of CODES)
      for (const x of r[code].hits) {
        const key = packKey(x);
        if (!packs.has(key)) packs.set(key, { key, name: packName(x), count: 0 });
        packs.get(key).count++;
      }
    const packList = [...packs.values()].sort((a, b) => (a.key === UNKNOWN) - (b.key === UNKNOWN) || b.count - a.count);
    let pack = ''; // the pack shown ('' for all)
    let rarity = CODES.find((code) => r[code].hits.length) ?? 'SSR';
    const hitsOf = (code) => (pack ? r[code].hits.filter((x) => packKey(x) === pack) : r[code].hits);

    // The cards got for one rarity, as tiles: the picture, how many boosters it took, the pack, the day.
    const tiles = (code) => {
      const { current } = r[code];
      const hits = hitsOf(code);
      const full = hits.filter((x) => !x.first).map((x) => x.after);
      const stat = (label, value) => h('div', { class: 'aqm-history-stat' }, h('small', {}, label), h('strong', {}, value));
      const all = r[code].hits.length;
      return [
        h(
          'div',
          { class: 'aqm-history-stats' },
          stat('Obtenues', fmt(hits.length)),
          pack ? stat(`Part de tes ${code}`, all ? pct(hits.length / all) : '—') : stat('En moyenne', full.length ? boosters(full.reduce((a, b) => a + b, 0) / full.length) : '—'),
          stat('Plus rapide', full.length ? boosters(Math.min(...full)) : '—'),
          stat('Plus long', full.length ? boosters(Math.max(...full)) : '—'),
          stat('Depuis la dernière', boosters(current))
        ),
        hits.length
          ? h(
              'div',
              { class: 'aqm-history-grid' },
              hits.map((x) => {
                // The card's picture, the boosters it took and its pack (its name and day in the tooltip).
                const link = x.card?.id ? { href: `/jeu/carte/${encodeURIComponent(x.card.id)}` } : {};
                const tip = [x.card?.name ?? `${x.top}, carte inconnue`, x.pack?.guessed ? `${packName(x)} (déduit de la carte)` : packName(x), day(x.at), x.first ? 'Aquaman a commencé à compter après la précédente' : null].filter(Boolean).join(' · ');
                return h(
                  x.card?.id ? 'a' : 'div',
                  { class: 'aqm-history-tile', ...link, title: tip },
                  x.card?.image ? h('img', { src: cardImageUrl(x.card.image), alt: x.card.name ?? '', loading: 'lazy', decoding: 'async' }) : h('div', { class: 'aqm-history-blank' }, rarityCode(x.top)),
                  h('p', { class: 'aqm-history-after' }, x.first ? `≥ ${boosters(x.after)}` : boosters(x.after)),
                  h('p', { class: `aqm-history-pack${x.pack ? '' : ' is-unknown'}` }, packName(x))
                );
              })
            )
          : h('p', { class: 'aqm-history-empty' }, pack ? `Aucune ${code} tirée dans ce pack.` : `Aucune ${code} parmi tes ${boosters(r.opened)} comptés.`)
      ];
    };

    // A tab per rarity, the first one with cards open; above, a filter per pack (once a card's pack is known).
    const panel = h('div', { class: 'aqm-history-panel' });
    const tabs = h('div', { class: 'aqm-history-tabs', role: 'tablist' });
    const filter = h('div', { class: 'aqm-history-packs', role: 'group', 'aria-label': 'Pack' });
    const show = () => {
      if (packList.some((p) => p.key !== UNKNOWN))
        filter.replaceChildren(
          ...[{ key: '', name: 'Tous les packs', count: CODES.reduce((n, c) => n + r[c].hits.length, 0) }, ...packList].map((p) =>
            h(
              'button',
              {
                type: 'button',
                class: `aqm-history-packbtn${p.key === pack ? ' is-on' : ''}`,
                'aria-pressed': String(p.key === pack),
                title: p.key === UNKNOWN ? 'Cartes tirées avant la version 1.4.7 dont Aquaman ne connaît pas la carte : impossible de savoir leur pack.' : null,
                onclick: () => {
                  pack = p.key;
                  show();
                }
              },
              p.name,
              h('span', { class: 'aqm-history-tabcount' }, fmt(p.count))
            )
          )
        );
      tabs.replaceChildren(
        ...CODES.map((c) =>
          h(
            'button',
            {
              type: 'button',
              role: 'tab',
              class: `aqm-history-tabbtn${c === rarity ? ' is-on' : ''}`,
              'aria-selected': String(c === rarity),
              onclick: () => {
                rarity = c;
                show();
              }
            },
            rarityCode(c),
            h('span', { class: 'aqm-history-tabcount' }, fmt(hitsOf(c).length))
          )
        )
      );
      panel.replaceChildren(...tiles(rarity));
    };
    show();
    view.replaceChildren(
      h('p', { class: 'aqm-history-count' }, r.since ? `${boosters(r.opened)} comptés depuis le ${new Date(r.since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Aucun booster compté pour le moment.'),
      h('div', { class: 'aqm-rates' }, CODES.map(rate)),
      strip,
      h('div', { class: 'aqm-history-box' }, filter.childElementCount ? filter : null, tabs, panel)
    );
  }

  // ---------- home: the boosters of every kind, side by side ----------
  // "Tout ouvrir" opens every waiting booster. When they are of several kinds (Classique, Magie…), the game's pile is
  // drawn once per kind and shown side by side, each with the game's own "Ouvrir" and "Tout ouvrir" buttons: inject.js
  // gives the game only the boosters of one kind (sessionStorage) and asks its store to read them again, Aquaman
  // copies what the game drew. A click on a copied button sets the game on that kind and clicks its real button,
  // with its animation; afterwards the copies are drawn again and the game is back to all of its boosters.

  const KIND_KEY = 'aqm-booster-kind';
  let pendingBoosters = null; // [{ id, kind, name, art }], all the waiting boosters (inject.js)
  let boostersAsked = false;
  let piles = null; // { sig, shots: [{ key, name, count, pile, buttons }] }, the copies shown
  let drawing = false; // the copies are being drawn
  let opening = false; // a click on a copied button: the game opens, the copies wait
  let homeParts = null; // { pile, buttons } of the game, kept once hidden

  const setKind = (key) => {
    try {
      key ? sessionStorage.setItem(KIND_KEY, key) : sessionStorage.removeItem(KIND_KEY);
      return true;
    } catch {
      return false;
    }
  };

  // Sets the game on one kind ('' for all) and waits until it has drawn it; false when its store can't be reached.
  let refreshId = 0;
  const refreshed = new Map();
  // fresh: the game draws its pile afresh (its picture is picked when the pile appears), for a copy or an opening.
  // reload: the game reads its boosters again from the server (after an opening).
  // items: boosters made up for the author's scan (one kind each time).
  function showKind(key, fresh = false, reload = false, items = null) {
    if (!setKind(key)) return Promise.resolve(false);
    const id = ++refreshId;
    return new Promise((resolve) => {
      const done = (ok) => {
        refreshed.delete(id);
        // Two frames and a moment for React to draw the pile and the pictures to come.
        if (ok) requestAnimationFrame(() => requestAnimationFrame(() => pileStill().then(() => resolve(true))));
        else resolve(false);
      };
      refreshed.set(id, done);
      setTimeout(() => refreshed.get(id)?.(false), 4000);
      window.postMessage({ aquamanCmd: 'refresh-boosters', id, kind: key, fresh, reload, items }, location.origin);
    });
  }
  const onBoostersRefreshed = (id, ok) => refreshed.get(id)?.(ok);

  // The waiting boosters by kind, in the game's order.
  function boosterKinds() {
    const kinds = new Map();
    for (const b of pendingBoosters ?? []) {
      const key = b.kind ?? 'classic';
      if (!kinds.has(key)) kinds.set(key, { key, name: b.name ?? 'Classique', art: b.art ?? null, count: 0 });
      kinds.get(key).count++;
    }
    return [...kinds.values()];
  }

  // The game's pile of boosters (the big box above its buttons, inside the one that also holds the title "4 à
  // ouvrir" if need be) and its row of buttons.
  function findHomeParts() {
    if (homeParts?.pile.isConnected && homeParts.buttons.isConnected) return homeParts;
    // "Tout ouvrir", or "Ouvrir" alone when there is one booster.
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

  // A copy of what the game drew, without ids.
  function copyOf(el) {
    const copy = el.cloneNode(true);
    for (const x of [copy, ...copy.querySelectorAll('[id]')]) x.removeAttribute('id');
    copy.removeAttribute('data-aqm-hidden');
    // What is left of an entrance animation (a blur). The opacities stay: a booster stacks layers that the game hides
    // (a themed booster keeps the classic waves, invisible, over its own picture).
    for (const x of [copy, ...copy.querySelectorAll('[style]')]) if (/blur/.test(x.style.filter)) x.style.filter = '';
    return copy;
  }

  // The copies of the piles, kept for good in Aquaman's own storage (kept when the site's data is cleared), one per
  // kind whatever the number of its boosters: shown at once, with their counts set right. The game's buttons are kept
  // as they were with several boosters too ("Ouvrir" and "Tout ouvrir"), for when there are several again. Read once
  // when Aquaman starts (shotStore stays null until then).
  const SHOTS_KEY = 'boosterPiles';
  const KIND_ID = /^[A-Za-z0-9_-]{1,64}$/;
  // The shapes of a pile: 1, 2, and 3 boosters and more; the author's drawings are kept by kind and shape.
  const SHAPES = [1, 2, 3];
  const shapeKey = (kind, count) => `${kind}--n${Math.min(Math.max(count, 1), 3)}`;
  const SHOTS_V = 9; // the drawings of a pile the game drew itself (load) for its kind and shape, with its picture
  const ALL_BUTTON = /^tout ouvrir/i;
  const hasAllButton = (buttons) => [...buttons.querySelectorAll('button')].some((b) => ALL_BUTTON.test(b.textContent.trim()));
  let shotStore = null;
  const readShotStore = () => shotStore ?? {};

  async function loadShotStore() {
    let kept = {};
    try {
      kept = (await chrome.storage.local.get(SHOTS_KEY))[SHOTS_KEY] ?? {};
      // The copies of the previous version, kept by the site (localStorage).
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

  // The drawings of every kind published by the author (relay): used first, they are kept here too for the next
  // starts, and read again from the relay each time.
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
    piles = null; // drawn again with the published drawings
    markBoosterKinds();
  }

  function saveShots(shots) {
    shotStore = { ...readShotStore() };
    // One drawing per kind and shape of pile (1, 2, 3 boosters and more): the game draws each shape once.
    for (const shot of shots)
      shotStore[shapeKey(shot.key, shot.count)] = { v: SHOTS_V, pile: shot.pile.outerHTML, buttons: shot.buttons.outerHTML, many: null, at: Date.now() };
    try {
      chrome.storage.local.set({ [SHOTS_KEY]: shotStore });
    } catch {}
  }

  // Elements from kept HTML: the game's drawing, but it may come back from the relay, which anyone can write to, so only
  // what draws is kept: known tags and attributes, pictures of the site only, styles without outside addresses.
  const SAFE_TAGS = new Set(['div', 'span', 'p', 'strong', 'small', 'b', 'i', 'em', 'button', 'img', 'picture', 'source', 'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'filter', 'fegaussianblur', 'feturbulence', 'fecolormatrix', 'feblend', 'fecomposite', 'feoffset', 'feflood', 'femerge', 'femergenode', 'fedisplacementmap', 'text', 'tspan']);
  const SAFE_ATTRS = /^(class|style|alt|role|title|type|disabled|width|height|viewbox|d|fill|stroke|stroke-[a-z-]+|fill-[a-z-]+|clip-[a-z-]+|opacity|transform|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|points|offset|stop-color|stop-opacity|gradientunits|gradienttransform|patternunits|preserveaspectratio|xmlns|loading|decoding|sizes|stddeviation|basefrequency|numoctaves|seed|in|in2|result|mode|operator|values|scale|dx|dy|flood-color|flood-opacity|text-anchor|font-[a-z-]+|letter-spacing|mask|filter|aria-[a-z-]+|data-[a-z0-9-]+)$/i;
  const siteUrl = (v) => /^\/(?!\/)/.test(v) || v.startsWith(`${location.origin}/`);
  // A style whose addresses are all of the site (or of the drawing itself: "#…"); a themed pack keeps its picture there.
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

  // The picture of a themed pack, as the game sets it on each of its boosters (--pack-art): put back in a drawing made
  // without it (a copy of another pack's pile, an older drawing).
  function setPackArt(el, art) {
    if (!el || !art || !siteUrl(art)) return el;
    for (const x of packBoxes(el)) x.style.setProperty('--pack-art', `url('${art.replace(/['()\\]/g, encodeURIComponent)}')`);
    return el;
  }
  // The boosters drawn by the game in an element: their 3D boxes (the class ending in "__pack"), each holding its faces.
  const packBoxes = (el) => [el, ...el.querySelectorAll('[class]')].filter((x) => [...x.classList].some((c) => /__pack$/.test(c)));
  const packArtHtml = (html, art) => {
    const t = document.createElement('template');
    t.innerHTML = html;
    setPackArt(t.content.firstElementChild, art);
    return t.innerHTML;
  };

  // The count written by the game (the pile's "×5", the button's "Tout ouvrir ×5"), set to n.
  function setCount(el, n) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) if (/[×x]\s?\d+/.test(t.nodeValue)) t.nodeValue = t.nodeValue.replace(/([×x]\s?)\d+/, `$1${n}`);
    return el;
  }

  // The kept copies of every kind, or null when one is missing.
  function cachedShots(kinds) {
    const all = readShotStore();
    const shots = [];
    for (const k of kinds) {
      // The drawing of this kind with this shape of pile: the author's published one first, else this player's;
      // only the current ones (SHOTS_V): the older ones are drawn again.
      const key = shapeKey(k.key, k.count);
      // (this player's own drawing first: the game drew it from their real boosters; the published one fills in)
      const kept = all[key]?.v === SHOTS_V ? all[key] : globalStore[key]?.v === SHOTS_V ? globalStore[key] : null;
      const pile = kept && fromHtml(kept.pile);
      const buttons = kept && fromHtml(kept.buttons);
      if (!pile || !buttons) return null;
      shots.push({ ...k, pile: setCount(setPackArt(pile, k.art), k.count), buttons: setCount(buttons, k.count) });
    }
    return shots;
  }

  // The pictures shown in an element (its images, its backgrounds), by file name.
  function pictureFiles(el) {
    const files = new Set();
    for (const x of [el, ...el.querySelectorAll('*')]) {
      const src = x.tagName === 'IMG' ? x.currentSrc || x.getAttribute('src') : getComputedStyle(x).backgroundImage.match(/url\(["']?([^"')]+)/)?.[1];
      const file = src ? decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() || '') : '';
      // next/image: the file is in the "url" parameter.
      const inner = src?.includes('url=') ? decodeURIComponent(new URL(src, location.href).searchParams.get('url') ?? '').split('/').pop() : '';
      if (file) files.add(file);
      if (inner) files.add(inner);
    }
    return files;
  }

  // True when the game's pile shows the boosters of this kind: its own picture (Magie…), or none of the other kinds'
  // pictures for the classic ones.
  function pileShows(pile, k, kinds) {
    if (!pile) return false;
    const files = pictureFiles(pile);
    const fileOf = (art) => art.split(/[?#]/)[0].split('/').pop();
    if (k.art) {
      if (!files.has(fileOf(k.art))) return false;
      // Its picture loaded (until then the game shows the classic waves in its place).
      const imgs = [...pile.querySelectorAll('img')].filter((img) => (img.currentSrc || img.getAttribute('src') || '').includes(fileOf(k.art)));
      return !imgs.length || imgs.some((img) => img.complete && img.naturalWidth > 0);
    }
    return !kinds.some((x) => x.art && files.has(fileOf(x.art)));
  }

  // Waits until the game's pile no longer moves (its animations write inline styles), 1.2 s at most.
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

  // Hides the game's pile and buttons (Aquaman's piles take their place).
  function hideHome() {
    const parts = findHomeParts();
    parts?.pile.setAttribute('data-aqm-hidden', '');
    parts?.buttons.setAttribute('data-aqm-hidden', '');
    return parts;
  }

  // True while the game shows something above the page (the opening of a booster, a window).
  const gameBusy = () =>
    !!document.querySelector('[role="dialog"]:not(.aqm-root *), [aria-modal="true"]:not(.aqm-root *)') ||
    (!overlay && [document.body, document.documentElement].some((el) => getComputedStyle(el).overflow === 'hidden'));

  // Draws the game's pile for each kind, then puts the game back on all of its boosters.
  async function drawPiles(kinds, sig) {
    drawing = true;
    const title = [...document.querySelectorAll('h1, h2, h3')].find((t) => !t.closest('.aqm-root') && /à ouvrir/i.test(t.textContent));
    title?.setAttribute('data-aqm-veiled', ''); // its count follows the kind being drawn
    hideHome(); // the game's pile changes kind meanwhile
    const shots = [];
    try {
      for (const k of kinds) {
        // Without the game's store (or its pile), the game's page stays as it is.
        if (stopped || !(await showKind(k.key, true))) return void (piles = { sig, shots: null });
        hideHome(); // the game drew its pile again
        // The game may change the texts before the picture: the copy waits for the kind's own picture, loaded (5 s at most).
        let right = false;
        for (let t = 0; t < 84 && !(right = pileShows(findHomeParts()?.pile, k, kinds)); t++) await pause(60);
        if (right) await pause(400).then(pileStill); // (the game's fade from the waves to the pack's picture)
        const parts = findHomeParts();
        if (!parts) return void (piles = { sig, shots: null });
        shots.push({ ...k, pile: copyOf(parts.pile), buttons: copyOf(parts.buttons), right: pileShows(parts.pile, k, kinds) });
      }
      piles = { sig, shots };
      saveShots(shots.filter((shot) => shot.right)); // a wrong drawing is shown this once, never kept
    } finally {
      await showKind('');
      await unveilTitle(title);
      drawing = false;
    }
    markBoosterKinds();
  }

  // A click on a copied button: the game is set on that kind, then its own button is clicked.
  // ---------- the author's scan of every kind of booster ----------
  // On the home page, the game draws its pile for boosters made up of each kind (the classic ones and every kind the
  // shop sells): the drawings are published on the relay, for every Aquaman to show them without drawing anything.

  const SCAN_KEY = 'aqm-scan-packs';
  const SHOP_KEY = 'aqm-scan-shop'; // the shop's packs read before the home page: [[kind, { html, w, h }], …]
  const onShop = () => /^\/jeu\/boutique\/?$/.test(location.pathname);

  // The scan starts in the shop (the site forbids loading its pages in a frame), then goes on on the home page.
  function startScan() {
    if (onShop()) return void scanShop();
    try {
      sessionStorage.setItem(SCAN_KEY, 'shop');
    } catch {}
    location.href = '/jeu/boutique';
  }

  // The scan goes on once the shop, then the home page, shows.
  function resumeScan() {
    let step;
    try {
      step = sessionStorage.getItem(SCAN_KEY);
      if (meId !== AUTHOR_ID || !((step === 'shop' && onShop()) || (step === '1' && /^\/jeu\/?$/.test(location.pathname)))) return;
      sessionStorage.removeItem(SCAN_KEY);
    } catch {
      return;
    }
    if (step === 'shop') scanShop();
    else scanPacks();
  }

  // The design of each pack the shop sells, kept for the home page's scan.
  async function scanShop() {
    if (scanning) return;
    scanning = true;
    const body = openOverlay('Scanner les packs', 'Aquaman lit d’abord le design de chaque pack de la boutique, puis le jeu dessine tes boosters en attente sur l’accueil.');
    const status = h('p', { class: 'aqm-note' }, 'Lecture des packs de la boutique (jusqu’à 20 s)…');
    body.append(status);
    let designs = new Map();
    try {
      const kinds = (await ask({ type: 'pack-kinds' })).kinds.filter((k) => k.kind && KIND_ID.test(k.kind));
      designs = await readShopPacks(kinds);
    } catch (e) {
      status.textContent = e.message;
    } finally {
      scanning = false;
    }
    try {
      sessionStorage.setItem(SHOP_KEY, JSON.stringify([...designs]));
      sessionStorage.setItem(SCAN_KEY, '1');
    } catch {}
    status.textContent = `${designs.size} pack${designs.size > 1 ? 's' : ''} trouvé${designs.size > 1 ? 's' : ''} dans la boutique : retour à l’accueil…`;
    await pause(800);
    location.href = '/jeu';
  }

  // The shop's packs read by scanShop (once).
  function shopDesigns() {
    try {
      const list = JSON.parse(sessionStorage.getItem(SHOP_KEY) || '[]');
      sessionStorage.removeItem(SHOP_KEY);
      return new Map(list);
    } catch {
      return new Map();
    }
  }

  let scanning = false;
  async function scanPacks() {
    if (scanning) return;
    scanning = true;
    const body = openOverlay('Scanner les packs', 'Le jeu dessine tes boosters en attente (1, 2 et 3 boosters et plus), puis Aquaman met le design de chaque pack de la boutique dans ces piles ; les dessins sont publiés pour toutes les extensions.');
    const status = h('p', { class: 'aqm-note' }, 'Lecture des boosters de la boutique…');
    const list = h('ul', { class: 'aqm-scan-list' });
    body.append(status, list);
    while (drawing || opening) await pause(200);
    drawing = true;
    const title = [...document.querySelectorAll('h1, h2, h3')].find((t) => !t.closest('.aqm-root') && /à ouvrir/i.test(t.textContent));
    title?.setAttribute('data-aqm-veiled', '');
    const packs = {};
    const frames = {}; // shape -> a pile drawn by the game: { pile, buttons }, where the shop's packs go
    const themed = {}; // shape -> a themed pile drawn by the game: { pile, buttons, art, name }
    let themedPack = null; // one themed booster drawn by the game: { style, html, art, name }
    let shop = [];
    try {
      try {
        shop = (await ask({ type: 'pack-kinds' })).kinds;
      } catch (e) {
        status.textContent = e.message;
      }
      // First the player's own boosters: the game draws a booster rightly only from its real id. Each kind is drawn
      // with as many of its boosters as the player has (1, 2, 3 and more): the shapes of the piles. The shop's packs
      // come after, in these piles.
      const mine = boosterKinds().map((k) => ({ ...k, kind: k.key, ids: (pendingBoosters ?? []).filter((b) => (b.kind ?? 'classic') === k.key).map((b) => b.id) }));
      const kinds = mine;
      const all = kinds.map((k) => ({ key: k.kind, art: k.art }));
      for (const [i, k] of kinds.entries()) {
        const line = h('li', {}, h('strong', {}, k.name ?? k.kind), ' : ');
        list.append(line);
        const kind = { key: k.kind, art: k.art };
        const drawn = [];
        // The pile as the game draws it with 1, 2, and 3 boosters and more (its fan, its "Tout ouvrir").
        for (const n of SHAPES) {
          if (k.ids.length < n) break; // not enough of this kind for this shape
          status.textContent = `Dessin de ${k.name ?? k.kind} avec ${n} booster${n > 1 ? 's' : ''} (${i + 1}/${kinds.length})…`;
          const items = k.ids.slice(0, n).map((id) => ({ id }));
          if (!(await showKind('', true, false, items))) break;
          hideHome();
          let right = false;
          for (let t = 0; t < 84 && !(right = pileShows(findHomeParts()?.pile, kind, all)); t++) await pause(60);
          if (right) await pause(400).then(pileStill); // (the game's fade from the waves to the pack's picture)
          const parts = findHomeParts();
          if (!parts || !pileShows(parts.pile, kind, all)) continue;
          const buttons = copyOf(parts.buttons).outerHTML;
          packs[shapeKey(k.kind, n)] = { v: SHOTS_V, pile: copyOf(parts.pile).outerHTML, buttons, many: hasAllButton(parts.buttons) ? buttons : null, name: k.name, art: k.art };
          // The game's pile with n boosters: the frame of the shop's packs below (each of its boxes takes the pack's).
          if (!frames[n] || k.kind === 'classic') frames[n] = { pile: packs[shapeKey(k.kind, n)].pile, buttons };
          // A themed booster drawn by the game: the model of every other themed pack (only its picture and name change).
          if (k.art && !themed[n]) themed[n] = { pile: packs[shapeKey(k.kind, n)].pile, buttons, art: k.art, name: k.name };
          if (k.art && !themedPack) themedPack = packOf(parts.pile, k);
          drawn.push(n === 3 ? '3+' : String(n));
        }
        line.append(
          drawn.length
            ? `✅ dessiné par le jeu avec ${drawn.join(', ')} booster${drawn.length > 1 || drawn[0] !== '1' ? 's' : ''}${drawn.length < 3 ? ' (les autres formes viennent de la boutique)' : ''}.`
            : '⛔ dessin incomplet (image du booster introuvable).'
        );
      }
    } finally {
      await showKind('', false, true); // back to the player's own boosters
      await unveilTitle(title);
      drawing = false;
      scanning = false;
    }

    // The shop's packs (every kind it sells, owned or not), each put in the game's piles of 1, 2 and 3+ boosters:
    // for the kinds and the shapes the player's own boosters couldn't give.
    // The other themed packs (the shop's, and the shapes the player's boosters couldn't give): the piles are the same
    // for every themed pack, only the picture and the name change. A themed pile drawn by the game is copied with
    // them changed; for a shape it didn't give, its themed booster goes in the game's pile of that shape. Without any
    // themed booster of the player, the shop's packs are read in the shop page.
    const shapes = SHAPES.filter((n) => themed[n] || frames[n]);
    const owned = new Map(boosterKinds().filter((k) => k.art).map((k) => [k.key, k]));
    const wanted = [...shop.filter((k) => k.kind && KIND_ID.test(k.kind)), ...[...owned.values()].map((k) => ({ kind: k.key, name: k.name, art: k.art }))]
      .filter((k, i, all) => all.findIndex((x) => x.kind === k.kind) === i)
      .filter((k) => k.art && shapes.some((n) => !packs[shapeKey(k.kind, n)]));
    const designs = shopDesigns();
    if (wanted.length) status.textContent = `${designs.size} pack${designs.size > 1 ? 's' : ''} trouvé${designs.size > 1 ? 's' : ''} dans la boutique.`;
    for (const k of wanted) {
      const line = h('li', {}, h('strong', {}, k.name ?? k.kind), designs?.get(k.kind) ? ' (boutique) : ' : ' (copie) : ');
      list.append(line);
      const made = [];
      for (const n of shapes) {
        if (packs[shapeKey(k.kind, n)]) continue; // drawn by the game from the player's own boosters
        // The shop's pack in the game's pile of this shape; else (a pack the shop page doesn't show) a themed pile
        // drawn by the game, with the pack's picture and name.
        let pile = null;
        let buttons = frames[n]?.buttons ?? themed[n]?.buttons;
        if (frames[n] && designs?.get(k.kind)) pile = fillPile(frames[n].pile, designs.get(k.kind));
        else if (themed[n]) {
          pile = renamePack(themed[n].pile, themed[n], k);
          buttons = themed[n].buttons;
        } else if (frames[n] && themedPack) pile = fillPile(frames[n].pile, { ...themedPack, html: renamePack(themedPack.html, themedPack, k) });
        if (!pile || !buttons) continue;
        packs[shapeKey(k.kind, n)] = { v: SHOTS_V, pile: packArtHtml(pile, k.art), buttons, many: null, name: k.name, art: k.art };
        made.push(n === 3 ? '3+' : String(n));
      }
      line.append(made.length ? `✅ dessiné avec ${made.join(', ')} booster${made.length > 1 || made[0] !== '1' ? 's' : ''}.` : '⛔ pas de modèle pour ce pack.');
    }
    // Once the scan is over, closing its window loads the page again (the game and the piles start afresh), after
    // the publication if it is still under way.
    let publishing = Promise.resolve();
    if (overlay?.contains(body)) overlayClosed = () => publishing.finally(() => location.reload());
    const n = Object.keys(packs).length; // one per kind and shape
    if (!n) return void (status.textContent = 'Aucun dessin à publier.');
    status.textContent = `Publication de ${n} dessin${n > 1 ? 's' : ''}…`;
    publishing = send({ type: 'packs-publish', packs });
    const res = await publishing;
    if (res?.needDevice) status.textContent = 'Cet appareil n’est pas approuvé : approuve-le d’abord dans Plus › Joueurs avec Aquaman.';
    else if (!res || res.error) status.textContent = `Le relais a refusé la publication${res?.error ? ` (${res.error})` : ''}.`;
    else {
      status.textContent = `✅ ${res.published ?? n} dessin${n > 1 ? 's' : ''} publié${n > 1 ? 's' : ''} : toutes les extensions les affichent désormais.`;
      globalStore = { ...globalStore, ...packs };
      try {
        chrome.storage.local.set({ [GLOBAL_KEY]: globalStore });
      } catch {}
      piles = null;
      markBoosterKinds();
    }
  }

  // One booster of a pile drawn by the game: its box ({ style, html }, the faces inside), with its kind's art and name.
  function packOf(pile, k) {
    const box = packBoxes(pile)[0];
    return box ? { style: box.getAttribute('style') ?? '', html: copyOf(box).innerHTML, art: k.art, name: k.name } : null;
  }

  // A themed drawing made for another pack: the picture of the model (from.art) becomes the pack's (k.art), and its
  // name (from.name, as the game writes it) becomes the pack's.
  function renamePack(html, from, k) {
    const file = (art) => art.split(/[?#]/)[0].split('/').pop();
    const oldFile = file(from.art);
    const newArt = k.art.split(/[?#]/)[0];
    const t = document.createElement('template');
    t.innerHTML = html;
    for (const el of t.content.querySelectorAll('*'))
      for (const a of [...el.attributes]) if (a.value.includes(oldFile)) el.setAttribute(a.name, a.value.split(from.art.split(/[?#]/)[0]).join(newArt).split(oldFile).join(file(k.art)));
    if (from.name && k.name) {
      const walker = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.nodeValue.trim();
        if (text.toLowerCase() !== from.name.toLowerCase()) continue;
        const name = text === text.toUpperCase() ? k.name.toUpperCase() : k.name;
        n.nodeValue = n.nodeValue.replace(text, name);
      }
    }
    return [...t.content.childNodes].map((x) => x.outerHTML ?? '').join('');
  }

  // A pile drawn by the game with another pack in each of its boxes (design: { style, html }); its fan, its tilts
  // and its count stay. Null when the pile has no box.
  function fillPile(pileHtml, design) {
    const t = document.createElement('template');
    t.innerHTML = pileHtml;
    const pile = t.content.firstElementChild;
    const boxes = pile ? packBoxes(pile) : [];
    if (!boxes.length) return null;
    for (const box of boxes) {
      box.setAttribute('style', design.style ?? '');
      box.innerHTML = design.html;
    }
    return pile.outerHTML;
  }

  // The shop page (shown): the box of each kind's pack ({ style, html }), found by its picture or its title.
  async function readShopPacks(kinds) {
    const found = new Map();
    const fileOf = (art) => (art ?? '').split(/[?#]/)[0].split('/').pop();
    for (let t = 0; t < 80 && found.size < kinds.length; t++) {
      await pause(250);
      const boxes = packBoxes(document.body).filter((x) => !x.closest('.aqm-root'));
      for (const k of kinds) {
        if (found.has(k.kind)) continue;
        const name = k.name?.toLowerCase();
        const box =
          (k.art && boxes.find((x) => (x.getAttribute('style') ?? '').includes(fileOf(k.art)))) ||
          (name && boxes.find((x) => x.querySelector('[class*="__packTitle"]')?.textContent.trim().toLowerCase() === name));
        if (box) found.set(k.kind, { style: box.getAttribute('style') ?? '', html: copyOf(box).innerHTML });
      }
      if (found.size && t > 40) break; // the kinds left are not in the shop
    }
    return found;
  }

  // The title "N à ouvrir" stays hidden until the game's count (which it animates) is back to all the boosters.
  async function unveilTitle(title) {
    // (the number of boosters as inject.js last wrote it: it may change meanwhile, after an opening)
    const all = () => {
      try {
        return JSON.parse(document.documentElement.getAttribute('data-aqm-boosters') || '[]').length;
      } catch {
        return (pendingBoosters ?? []).length;
      }
    };
    for (let t = 0; t < 40 && title?.isConnected && !new RegExp(`^\\D*${all()}\\b`).test(title.textContent.trim()); t++) await pause(60);
    if (title) applyTitleCount(title, true); // shown at once with the count of the kind in front
    title?.removeAttribute('data-aqm-veiled');
  }

  // The title "N à ouvrir" counts the boosters of the kind in front of the wheel (the game counts them all). Kept when
  // the game writes its count again; left to the game while it draws a kind or opens one, and before React took the
  // page over (a text changed before would not match what React expects).
  let titleCount = null; // the count shown, null: the game's
  let titleWatch = null; // { title, observer }
  const homeTitle = () => [...document.querySelectorAll('h1, h2, h3')].find((t) => !t.closest('.aqm-root') && /à ouvrir/i.test(t.textContent));
  function showTitleCount(n) {
    titleCount = n;
    if (n == null) {
      titleWatch?.observer.disconnect();
      titleWatch = null;
      return;
    }
    const title = homeTitle();
    if (!title) return;
    if (titleWatch?.title !== title) {
      titleWatch?.observer.disconnect();
      const observer = new MutationObserver(() => applyTitleCount(title));
      observer.observe(title, { childList: true, subtree: true, characterData: true });
      titleWatch = { title, observer };
    }
    applyTitleCount(title);
  }
  function applyTitleCount(title, now = false) {
    if (titleCount == null || stopped || (!now && (drawing || opening)) || !(settled || document.documentElement.hasAttribute('data-aqm-hydrated'))) return;
    // The first text that starts with the count ("8", or "8 à ouvrir" in one piece).
    const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!/^\s*\d+/.test(t.nodeValue)) continue;
      const want = t.nodeValue.replace(/^(\s*)\d+/, `$1${titleCount}`);
      if (t.nodeValue !== want) t.nodeValue = want;
      return;
    }
  }

  // The game draws the 3D pack of its opening window with the classic picture when it opens several boosters: while
  // Aquaman opens a themed kind, its picture is written on the page for inject.js, which puts it in the classic one's
  // place.
  const OPENING_ART = 'data-aqm-opening-art';

  async function openFromCopy(key, index) {
    if (drawing || opening) return;
    opening = true;
    const title = [...document.querySelectorAll('h1, h2, h3')].find((t) => !t.closest('.aqm-root') && /à ouvrir/i.test(t.textContent));
    title?.setAttribute('data-aqm-veiled', ''); // its count goes through the kind's
    try {
      if (!(await showKind(key, true))) return;
      title?.removeAttribute('data-aqm-veiled'); // the game counts the boosters of the kind it opens
      const real = [...(findHomeParts()?.buttons.querySelectorAll('button') ?? [])][index];
      const art = boosterKinds().find((k) => k.key === key)?.art;
      if (art && siteUrl(art)) document.documentElement.setAttribute(OPENING_ART, art.split(/[?#]/)[0]);
      real?.click();
      // The game opens (its window shows): the copies are drawn again once it is done.
      const started = Date.now();
      while (!stopped && (Date.now() - started < 1500 || gameBusy())) await pause(500);
      // Back to all the boosters, read again (the opened ones are gone).
      title?.setAttribute('data-aqm-veiled', '');
      await showKind('', false, true);
      await unveilTitle(title);
    } finally {
      document.documentElement.removeAttribute(OPENING_ART);
      title?.removeAttribute('data-aqm-veiled');
      opening = false;
      piles = null;
      markBoosterKinds();
    }
  }

  // ---------- home: more than 10 boosters, 10 at a time ----------
  // The game's "Tout ouvrir" opens 10 boosters at most. When more of that kind wait, its window of cards gets, beside
  // "Fermer", a button "Ouvrir les 10 suivants": it closes the window and clicks the game's "Tout ouvrir" again, on
  // the same kind. Each opening is a real one of the game, with its animation; nothing goes past its limit.

  let chaining = false;
  const OPEN_ALL = /^tout ouvrir/i;

  // The kind a "Tout ouvrir" opens: the one in front of the piles, else the one the game is set on, else its only one.
  function kindOpened(button) {
    if (button?.closest('.aqm-piles')) return wheelKey;
    const set = (() => {
      try {
        return sessionStorage.getItem(KIND_KEY) || '';
      } catch {
        return '';
      }
    })();
    if (set) return set;
    const kinds = boosterKinds();
    return kinds.length === 1 ? kinds[0].key : '';
  }
  const kindCount = (key) => (key ? boosterKinds().find((k) => k.key === key)?.count : pendingBoosters?.length) ?? null;

  // A click of the player on a "Tout ouvrir" (the game's or a copy): what it opens is kept; on "Ouvrir" (one
  // booster), forgotten. (Aquaman's own clicks, untrusted, are not counted: openMore sets the batch itself.)
  document.addEventListener(
    'click',
    (e) => {
      const button = !stopped && e.isTrusted && e.target instanceof Element ? e.target.closest('button') : null;
      const text = button?.textContent.trim() ?? '';
      if (OPEN_ALL.test(text)) {
        const kind = kindOpened(button);
        batch = { kind, before: kindCount(kind), opened: null };
      } else if (/^ouvrir\b/i.test(text) && !button.classList.contains('aqm-open-more')) batch = null;
    },
    true
  );

  // The window of cards closes by itself AUTO_CLOSE ms after its last card (setting openMoreAuto): on the next ones
  // when some wait, else on the home page. A click in the window stops it, to look at the cards.
  const AUTO_CLOSE = 5000;
  let autoEnd = null; // { row, close, left, ends, timer, cancelled }

  function stopAuto(cancelled = false) {
    if (!autoEnd) return;
    clearInterval(autoEnd.timer);
    autoEnd.timer = 0;
    autoEnd.cancelled = cancelled;
    document.querySelectorAll('.aqm-open-count').forEach((el) => el.remove());
    if (!cancelled) autoEnd = null;
  }

  function tickAuto() {
    const a = autoEnd;
    if (!a?.timer) return;
    if (stopped || !a.row.isConnected) return stopAuto();
    const ms = a.ends - Date.now();
    if (ms <= 0) {
      stopAuto();
      a.left > 0 ? openMore(a.close) : a.close.click();
      return;
    }
    const text = `${Math.ceil(ms / 1000)} s`;
    for (const el of document.querySelectorAll('.aqm-open-count')) if (el.textContent !== text) el.textContent = text;
  }

  // (a click in the window of cards, but on Aquaman's button: the countdown stops)
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!autoEnd?.timer || !e.isTrusted || !(e.target instanceof Element) || e.target.closest('.aqm-open-more')) return;
      stopAuto(true);
    },
    true
  );

  function markOpenMore() {
    const old = document.querySelector('.aqm-open-more');
    if (!batch && !old && !autoEnd) return;
    // (several boosters opened at once; left: those of their kind still waiting)
    const multi = batch?.opened > 1;
    const left = multi && batch.before != null ? Math.max(0, batch.before - batch.opened) : 0;
    // The window of cards: its "Fermer" beside "Voir ma collection".
    const close = multi && !chaining ? [...document.querySelectorAll('button')].find((b) => !b.closest('.aqm-root') && /^fermer$/i.test(b.textContent.trim())) : null;
    const row = close?.parentElement;
    if (!row || ![...row.querySelectorAll('button')].some((b) => /collection/i.test(b.textContent))) {
      old?.remove();
      stopAuto();
      return;
    }
    const auto = on('openMoreAuto');
    if (auto && autoEnd?.row !== row) {
      stopAuto();
      autoEnd = { row, close, left, ends: Date.now() + AUTO_CLOSE, timer: setInterval(tickAuto, 200), cancelled: false };
    }
    const counting = !!autoEnd?.timer;
    // Nothing left: only the countdown, beside "Fermer".
    const next = Math.min(batch.opened, left);
    const label = left > 0 ? `Ouvrir ${next > 1 ? `les ${fmt(next)} suivants` : 'le dernier'} (${fmt(left)})` : 'Fermeture dans';
    const key = `${label}|${counting}`;
    if (old?.parentElement === row && old.dataset.key === key) return;
    old?.remove();
    if (left <= 0 && !counting) return;
    const count = counting ? h('span', { class: 'aqm-open-count' }, `${Math.ceil((autoEnd.ends - Date.now()) / 1000)} s`) : null;
    if (left > 0) {
      const icon = row.querySelector('button svg')?.cloneNode(true) ?? null;
      row.prepend(h('button', { type: 'button', class: `${row.querySelector('button')?.className ?? ''} aqm-open-more`, 'data-key': key, onclick: () => (stopAuto(), openMore(close)) }, icon, label, count));
    } else
      close.before(
        h('span', { class: 'aqm-open-more aqm-open-note', 'data-key': key, title: 'Clique dans la fenêtre pour la garder ouverte' }, label, ' ', count)
      );
  }

  // Closes the window of cards, waits for the home page, then opens the next ones of the same kind.
  async function openMore(close) {
    if (chaining || !batch) return;
    chaining = true;
    const { kind } = batch;
    const left = batch.before - batch.opened;
    document.querySelector('.aqm-open-more')?.remove();
    try {
      close.click();
      // (the window goes, then the copies of the piles are drawn again)
      const started = Date.now();
      while (!stopped && Date.now() - started < 15e3 && (gameBusy() || opening || drawing || !findHomeParts())) await pause(250);
      await pause(400);
      if (stopped || gameBusy()) return;
      batch = { kind, before: left, opened: null };
      const strip = document.querySelector('.aqm-piles');
      const shot = strip && piles?.shots?.find((s) => s.key === kind);
      if (shot) {
        const index = [...shot.buttons.querySelectorAll('button')].findIndex((b) => OPEN_ALL.test(b.textContent.trim()));
        if (index >= 0) openFromCopy(kind, index);
        return;
      }
      const real = [...(findHomeParts()?.buttons.querySelectorAll('button') ?? [])].find((b) => OPEN_ALL.test(b.textContent.trim()));
      real?.click();
    } finally {
      chaining = false;
    }
  }

  function markBoosterKinds() {
    if (!featLoaded || !on('boosterWheel') || !/^\/jeu\/?$/.test(location.pathname) || drawing || opening) return;
    // The game read its boosters before Aquaman listened: inject.js wrote them on the page; else Aquaman reads them
    // once itself (all of them).
    try {
      const kept = JSON.parse(document.documentElement.getAttribute('data-aqm-boosters') || 'null');
      if (Array.isArray(kept)) pendingBoosters = kept.filter((b) => b?.id);
    } catch {}
    if (!pendingBoosters && !boostersAsked) {
      boostersAsked = true;
      setKind('');
      window.__aquamanSelf = true; // in the userscript, inject.js leaves this answer whole
      const asked = pageFetch('/api-game/v1/me', { credentials: 'include', headers: { accept: 'application/json' } });
      window.__aquamanSelf = false;
      asked
        .then((res) => (res.ok ? res.json() : null))
        .then((me) => {
          if (!Array.isArray(me?.pending) || pendingBoosters) return;
          pendingBoosters = me.pending.filter((b) => b?.id).map((b) => ({ id: b.id, kind: b.kindId ?? null, name: b.kindName ?? null, art: b.kindArt ?? null }));
          markBoosterKinds();
        })
        .catch(() => {});
    }
    const kinds = boosterKinds();
    const parts = findHomeParts();
    let strip = document.querySelector('.aqm-piles');
    const off = () => {
      showTitleCount(null);
      strip?.remove();
      document.querySelectorAll('[data-aqm-hidden]').forEach((el) => el.removeAttribute('data-aqm-hidden'));
    };
    if (!parts || kinds.length < 2) return off();
    const sig = kinds.map((k) => `${k.key}:${k.count}`).join('|');
    // New counts: the piles are drawn again (not while the game shows an opening).
    if (piles?.sig !== sig) {
      if (!shotStore) return; // the kept copies are being read
      // The piles already seen are shown at once; the game draws only the kinds never seen.
      const known = cachedShots(kinds);
      if (known) piles = { sig, shots: known };
      else {
        if (!gameBusy()) drawPiles(kinds, sig);
        return;
      }
    }
    if (!piles.shots) return off();
    parts.pile.setAttribute('data-aqm-hidden', '');
    parts.buttons.setAttribute('data-aqm-hidden', '');
    if (!strip || strip.previousElementSibling !== parts.pile) {
      strip?.remove();
      strip = h('div', { class: 'aqm-root aqm-piles' });
      parts.pile.after(strip);
    }
    if (strip.dataset.sig === sig) return void showTitleCount(titleCount);
    strip.dataset.sig = sig;
    renderWheel(strip, piles.shots);
  }

  // The piles, the free boosters first: one in front and its neighbours beside it, in a row that turns (three kinds
  // or more), with arrows, a click on a pile beside or a swipe.
  let wheelKey = null; // the kind in front, kept while the piles are drawn again
  function renderWheel(strip, shots) {
    const ordered = [...shots].sort((a, b) => (b.key === 'classic') - (a.key === 'classic'));
    const n = ordered.length;
    let at = Math.max(0, ordered.findIndex((s) => s.key === wheelKey));
    // The game's buttons of each kind: under the piles, they don't move and follow the kind in front.
    const buttonsOf = ordered.map((shot) => {
      const buttons = shot.buttons.cloneNode(true);
      [...buttons.querySelectorAll('button')].forEach((b, j) =>
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openFromCopy(shot.key, j);
        })
      );
      return buttons;
    });
    const controls = h('div', { class: 'aqm-wheel-controls' });
    const items = ordered.map((shot, i) => {
      const art = h('div', { class: 'aqm-pile-art' }, shot.pile.cloneNode(true));
      tiltOnHover(art);
      const pick = () => {
        const front = ((at % n) + n) % n;
        if (i !== front) turn(i - front);
      };
      // (no name above it: the pack shows its kind)
      return h('div', { class: 'aqm-pile', title: shot.name, onclick: pick }, art);
    });
    const track = h('div', { class: 'aqm-wheel-track' }, items);
    const arrow = (dir, label) => h('button', { type: 'button', class: `aqm-wheel-arrow is-${dir < 0 ? 'prev' : 'next'}`, 'aria-label': label, onclick: () => turn(dir) }, dir < 0 ? '‹' : '›');
    const dots = h('div', { class: 'aqm-wheel-dots' });
    const prev = arrow(-1, 'Catégorie précédente');
    const next = arrow(1, 'Catégorie suivante');
    const wheel = h('div', { class: 'aqm-wheel' }, prev, track, next);
    strip.replaceChildren(wheel, controls, dots);

    let width = 0;
    function place() {
      fitStrip(strip);
      width = width || Math.max(...items.map((el) => el.offsetWidth)) || 360;
      const room = strip.clientWidth || width;
      // Three kinds shown at most: the one in front and a neighbour on each side (never over it, and only when the
      // field is wide enough); the others wait behind them, unseen. From three kinds on, the row goes round.
      const front = ((at % n) + n) % n;
      const half = Math.floor(n / 2);
      const side = 0.72;
      const offset = Math.round(width / 2 + (width * side) / 2 + 40);
      const fits = offset + (width * side) / 2 <= room / 2 - 8;
      items.forEach((el, i) => {
        const d = n >= 3 ? ((((i - front) % n) + n + half) % n) - half : i - front;
        el.style.transform = d ? `translateX(${Math.sign(d) * offset}px) scale(${Math.abs(d) > 1 ? side * 0.8 : side})` : 'none';
        el.classList.toggle('is-front', !d);
        el.classList.toggle('is-away', Math.abs(d) > 1 || (!!d && !fits));
      });
      wheelKey = ordered[front].key;
      showTitleCount(ordered[front].count);
      paintGlow(wheel, ordered[front]);
      if (controls.firstChild !== buttonsOf[front]) controls.replaceChildren(buttonsOf[front]);
      // Two kinds: no arrow toward nothing.
      prev.hidden = n < 3 && at === 0;
      next.hidden = n < 3 && at === n - 1;
      dots.replaceChildren(...ordered.map((s, i) => h('button', { type: 'button', class: `aqm-wheel-dot${i === front ? ' is-on' : ''}`, 'aria-label': s.name, title: s.name, onclick: () => turn(i - front) })));
    }
    // The wheel turns the shortest way; two kinds go from one to the other.
    function turn(dir) {
      if (n >= 3) at += dir > n / 2 ? dir - n : dir < -n / 2 ? dir + n : dir;
      else at = Math.min(n - 1, Math.max(0, at + Math.sign(dir)));
      place();
    }
    let touchX = null;
    track.addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
    track.addEventListener('touchend', (e) => {
      const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
      if (touchX != null && Math.abs(dx) > 40) turn(dx < 0 ? 1 : -1);
      touchX = null;
    });
    strip.classList.add('is-still');
    place();
    requestAnimationFrame(() => {
      width = 0;
      place();
      requestAnimationFrame(() => strip.classList.remove('is-still'));
    });
  }

  // The glow behind the booster in front takes the colour of its pack: the main colour of its picture (the most vivid
  // pixels count the most), the game's blue for the classic boosters. Read once per picture.
  const GLOW_BLUE = [37, 99, 235];
  const glowOf = new Map(); // picture -> Promise<[r, g, b] | null>
  function packColour(art) {
    if (!art) return Promise.resolve(null);
    if (!glowOf.has(art))
      glowOf.set(
        art,
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = 24;
              const g = canvas.getContext('2d', { willReadFrequently: true });
              g.drawImage(img, 0, 0, 24, 24);
              const d = g.getImageData(0, 0, 24, 24).data;
              let r = 0;
              let gr = 0;
              let b = 0;
              let w = 0;
              for (let i = 0; i < d.length; i += 4) {
                const max = Math.max(d[i], d[i + 1], d[i + 2]);
                const sat = max ? (max - Math.min(d[i], d[i + 1], d[i + 2])) / max : 0;
                const weight = (d[i + 3] / 255) * sat * sat * (max / 255);
                r += d[i] * weight;
                gr += d[i + 1] * weight;
                b += d[i + 2] * weight;
                w += weight;
              }
              if (w < 0.5) return resolve(null);
              // (as bright as the game's blue glow, whatever the picture)
              const c = [r / w, gr / w, b / w];
              const k = 235 / Math.max(...c);
              resolve(c.map((x) => Math.round(x * k)));
            } catch {
              resolve(null); // a picture of another site: its pixels can't be read
            }
          };
          img.onerror = () => resolve(null);
          img.src = art;
        })
      );
    return glowOf.get(art);
  }
  async function paintGlow(wheel, shot) {
    const c = (on('packGlow') && (await packColour(shot.art))) || GLOW_BLUE;
    if (wheelKey === shot.key) wheel.style.setProperty('--aqm-glow', `rgb(${c.join(' ')} / 0.38)`);
  }

  // The strip takes the whole inner width of the home's field (the rounded box around the boosters), whatever the
  // width of the column it is in.
  function fitStrip(strip) {
    let field = strip.parentElement;
    while (field && field !== document.body) {
      const cs = getComputedStyle(field);
      if (parseFloat(cs.borderTopLeftRadius) >= 16 && field.clientWidth >= 480) break;
      field = field.parentElement;
    }
    if (!field || field === document.body) field = document.querySelector('main') ?? strip.parentElement;
    const cs = getComputedStyle(field);
    const r = field.getBoundingClientRect();
    const left = r.left + parseFloat(cs.paddingLeft) + 16;
    const width = Math.max(0, r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 32);
    strip.style.width = `${Math.round(width)}px`;
    strip.style.left = '0px';
    strip.style.left = `${Math.round(left - strip.getBoundingClientRect().left)}px`;
  }
  let fitTimer = 0;
  let fitWidth = innerWidth;
  addEventListener('resize', () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      const strip = document.querySelector('.aqm-piles');
      // (on a phone, the address bar that shows or hides while scrolling changes the height only)
      if (stopped || !strip || innerWidth === fitWidth) return;
      fitWidth = innerWidth;
      delete strip.dataset.sig; // drawn again at the new width
      markBoosterKinds();
    }, 150);
  });

  // As in the game (measured on a recording of it): the booster on top of the pile floats up and down (16 px, 4.7 s
  // a round), and turns toward the pointer around its pose (rotateY(-20deg) rotateX(7deg)), about 9° each way from
  // left to right; the boosters fanned behind it don't move, nothing grows.
  function tiltOnHover(el) {
    // The booster on top: the one outside the fanned layers (aria-hidden).
    const pose = [...el.querySelectorAll('[class*="__packPose"]')].find((p) => !p.closest('[aria-hidden="true"]'));
    if (!pose) return;
    const scene = pose.closest('[class*="__packScene"]');
    scene?.parentElement?.setAttribute('data-aqm-float', '');
    const base = pose.style.transform || 'rotateY(-20deg) rotateX(7deg)';
    const ry = Number(base.match(/rotateY\((-?[\d.]+)deg\)/)?.[1] ?? -20);
    const rx = Number(base.match(/rotateX\((-?[\d.]+)deg\)/)?.[1] ?? 7);
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5));
      const y = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5));
      pose.classList.add('aqm-pose-follow');
      pose.style.transform = `rotateY(${(ry + x * 18).toFixed(2)}deg) rotateX(${(rx - y * 10).toFixed(2)}deg)`;
    });
    el.addEventListener('pointerleave', () => {
      pose.classList.remove('aqm-pose-follow');
      pose.style.transform = base;
    });
  }

  // ---------- guided tour ----------

  const navLink =(route) => firstVisible(`a[data-tour="nav-${route}"]`) ?? firstVisible(`a[href="${route}"]`);

  // An item of the "Plus" menu, opened for the tour.
  function menuItem(i) {
    const plus = firstVisible('.aqm-plus');
    if (!plus) return null;
    if (!menu || menu.anchor !== plus) openMenu(plus);
    return menu.querySelectorAll('.aqm-menu-item')[i];
  }

  // The strip of series of the Collection page.
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

  // Element circled by a step.
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

  // Element found by find, once visible (null after ms).
  async function waitFor(find, ms) {
    const end = Date.now() + ms;
    for (;;) {
      const el = find();
      if (el && isVisible(el)) return el;
      if (Date.now() > end || !tour) return null;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // Shows step i: goes to its page, then circles its element.
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
      else return void location.assign(step.page); // the tour resumes after the page loads
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

  // Light hole over the element shown and a bubble next to it (at the bottom or top of the screen on a phone).
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

  // ---------- what's new ----------

  const versionNewer = (a, b) => {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  };

  // Entries of CHANGES newer than since (all of them without since).
  function openNews(since) {
    const entries = CHANGES.filter((c) => !since || versionNewer(c.version, since));
    const body = openOverlay('Nouveautés', since ? `Ce qui a changé depuis la version ${since}.` : 'Ce qui a changé dans chaque version d’Aquaman.');
    for (const entry of entries.length ? entries : CHANGES.slice(0, 1)) {
      body.append(
        h('p', { class: 'aqm-label aqm-news-version' }, `Version ${entry.version}`),
        h(
          'ul',
          { class: 'aqm-news' },
          entry.items.map(([text, stepId]) => {
            const at = stepId ? TOUR.findIndex((s) => s.id === stepId) : -1;
            return h('li', {}, h('span', {}, text), at >= 0 ? h('button', { type: 'button', class: 'aqm-chip', onclick: () => startTour(at) }, 'Montre-moi') : null);
          })
        )
      );
    }
    body.append(h('div', { class: 'aqm-news-foot' }, h('button', { type: 'button', class: 'aqm-tour-btn is-main', onclick: () => startTour(0) }, 'Visite guidée'), h('button', { type: 'button', class: 'aqm-tour-btn', onclick: closeOverlay }, 'Fermer')));
  }

  // Once per version: the tour the first time, then what's new after an update ("notifyUpdated" setting).
  async function showTutorialOnce() {
    if (location.hash.startsWith(TOUR_HASH) || location.hash === NEWS_HASH || session(TOUR_STEP) != null) return;
    const version = chrome.runtime.getManifest().version;
    const { seenVersion, settings } = await chrome.storage.local.get(['seenVersion', 'settings']);
    if (seenVersion === version) return;
    await chrome.storage.local.set({ seenVersion: version });
    if (!seenVersion) startTour(0);
    else if (settings?.notifyUpdated !== false && versionNewer(version, seenVersion)) openNews(seenVersion);
  }

  // Opens the tour or what's new from the address (#aqm-visite, #aqm-nouveautes), used by the popup and the notifications.
  function onHash() {
    const step = location.hash.startsWith(`${TOUR_HASH}-`) ? TOUR.findIndex((s) => s.id === location.hash.slice(TOUR_HASH.length + 1)) : -1;
    if (step >= 0 && !tour) startTour(step);
    else if (location.hash === TOUR_HASH && !tour) startTour(0);
    else if (location.hash === NEWS_HASH && !overlay) {
      openNews();
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  // Resumes the tour after a page load, or starts what the address asks for, once the "Plus" tab is there.
  let started = false;
  function startOnce() {
    if (started || !firstVisible('.aqm-plus')) return;
    started = true;
    const resume = session(TOUR_STEP);
    if (resume != null) startTour(Math.min(TOUR.length - 1, Number(resume) || 0));
    else onHash();
    showTutorialOnce();
  }

  // ---------- keyboard ----------

  function onKey(e) {
    if (tour) {
      if (e.key === 'Escape') stopTour();
      else if (e.key === 'ArrowRight' && tour.i < TOUR.length - 1) showStep(tour.i + 1);
      else if (e.key === 'ArrowLeft' && tour.i > 0) showStep(tour.i - 1);
      return;
    }
    if (e.key !== 'Escape') return;
    if (menu) closeMenu();
    else if (overlay) closeOverlay();
  }

  // Back on the page (another device may have opened boosters meanwhile): the counters are read again.
  function onBack() {
    if (document.visibilityState !== 'visible') return;
    if (document.querySelector('.aqm-pity')) loadPity(true);
    if (document.querySelector('.aqm-star')) loadFavIds(true);
    send({ type: 'wants-sync', fresh: true });
  }

  function onOutside(e) {
    if (menu && !menu.contains(e.target) && !menu.anchor?.contains(e.target) && !e.target.closest?.('.aqm-tour')) closeMenu();
  }

  // ---------- loop ----------

  // The steps of run() that a setting turns off (SETTINGS in src/lib/aquaman.js).
  const STEP_SETTING = new Map([
    [enlargePulls, 'bigPulls'],
    [showPity, 'pity'],
    [markSeriesStrip, 'seriesTools'],
    [markFavoriteSeries, 'seriesTools'],
    [markAlbum, 'albumButtons'],
    [markMissingTab, 'missingTab'],
    [markMissingSales, 'missingSales'],
    [markCollectionStats, 'collectionStats'],
    [snapCollection, 'collectionStats'],
    [markCardWho, 'cardWho'],
    [markCardListings, 'cardListings'],
    [markSellDialog, 'sellTools'],
    [markUnlistButton, 'sellTools'],
    [hideBoughtCards, 'hideBought'],
    [markMarketFavorites, 'marketFavorites'],
    [markRecycleDialog, 'recycleHelp'],
    [markBoosterKinds, 'boosterWheel'],
    [markOpenMore, 'openMore'],
    [enhanceShowcaseEditor, 'showcaseDrag'],
    [markTrades, 'tradeMarks'],
    [markTradeFilters, 'tradeFilters']
  ]);

  function run() {
    if (stopped) return;
    if (!alive()) return shutdown();
    const inGame = location.pathname.startsWith('/jeu');
    // Out of the game, only the exchanges sent in the private messages are marked.
    if (!inGame && !TRADE_PAGES.test(location.pathname)) return;
    if (location.pathname !== visitPath) {
      visitPath = location.pathname;
      pageVisit++;
    }
    const began = performance.now();
    runText = null;
    for (const step of [addPlusTab, enlargePulls, showPity, readPityRules, markSeriesStrip, markFavoriteSeries, markAlbum, markMissingTab, markMissingSales, markCollectionStats, snapCollection, markCardWho, markCardListings, markSellDialog, markUnlistButton, hideBoughtCards, markMarketFavorites, watchSaleToast, markRecycleDialog, markBoosterKinds, markOpenMore, resumeScan, enhanceShowcaseEditor, markTrades, markTradeFilters, pollFeedNow, sayHello, checkAccess, lookForUpdate, startOnce]) {
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

  // The script has no background worker: while a page of the game is open, the "beaux tirages" are read every minute.
  let feedAt = 0;
  function pollFeedNow() {
    if (Date.now() - feedAt < 60e3) return;
    feedAt = Date.now();
    send({ type: 'feed-poll' });
  }

  // While a page of the game is open, Aquaman tells the relay every 10 minutes that it is used (the author's list of
  // the players with Aquaman); the run of a page that changes nothing waits for the timer below.
  const HELLO_EVERY = 10 * 60e3;
  let helloAt = 0;
  function sayHello() {
    if (Date.now() - helloAt < HELLO_EVERY) return;
    helloAt = Date.now();
    send({ type: 'hello', kind: owner }).then((res) => res?.revoked && !stopped && revoke());
  }

  // The author took Aquaman back from this player: everything it added goes, and a word says why (once a visit).
  function revoke() {
    shutdown();
    if (session('aqm-revoked-told')) return;
    session('aqm-revoked-told', '1');
    const box = h(
      'div',
      { class: 'aqm-root aqm-update', role: 'status' },
      h('div', { class: 'aqm-queue-head' }, h('strong', {}, '🔱 Aquaman est désactivé')),
      h('p', {}, 'L’auteur d’Aquaman a désactivé son utilisation pour ton compte.'),
      h('div', { class: 'aqm-update-actions' }, h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => box.remove() }, 'OK'))
    );
    document.body.append(box);
  }
  const helloTimer = setInterval(() => {
    if (stopped || !settled || document.visibilityState !== 'visible') return;
    sayHello();
    checkAccess();
  }, 60e3);

  // Whether the author took Aquaman back from this player: asked once a minute while a page of the game is shown.
  let accessAt = 0;
  function checkAccess() {
    if (Date.now() - accessAt < 55e3) return;
    accessAt = Date.now();
    send({ type: 'access' }).then((res) => res?.revoked && !stopped && revoke());
  }

  // The script also looks for a new version every 10 minutes (the script managers only look once a day), and offers
  // it in a box at the bottom of the screen; the extension tells it with its notification and its window.
  const UPDATE_EVERY = 10 * 60e3;
  const SCRIPT_URL = 'https://raw.githubusercontent.com/A-Finch13/Poseidon-TCG/main/aquaman.user.js';
  let updateAt = 0;
  function lookForUpdate() {
    if (owner !== 'userscript' || Date.now() - updateAt < UPDATE_EVERY) return;
    updateAt = Date.now();
    send({ type: 'check-update' }).then((res) => !stopped && showUpdate(res?.update));
  }

  // iPhone and iPad (Safari with the Userscripts app): "Installer" shows the steps of Userscripts' own update (the
  // script has an update address), nothing is downloaded.
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const INSTALL_PAGE = 'https://a-finch13.github.io/Poseidon-TCG/';

  function showUpdate(update) {
    const version = chrome.runtime.getManifest().version;
    if (!update?.version || !versionNewer(update.version, version) || session('aqm-update-later') === update.version) return;
    if (document.querySelector('.aqm-update')) return;
    const url = update.script || SCRIPT_URL;
    const later = h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => (session('aqm-update-later', update.version), box.remove()) }, 'Plus tard');
    const iosSteps = () =>
      box.replaceChildren(
        h('div', { class: 'aqm-queue-head' }, h('strong', {}, `🔱 Installer Aquaman ${update.version}`)),
        h(
          'ol',
          { class: 'aqm-update-steps' },
          h('li', {}, 'Touche ', h('b', {}, 'ᴀA'), ' (ou ', h('b', {}, '🧩'), ') à gauche de la barre d’adresse, puis ', h('b', {}, 'Userscripts'), '.'),
          h('li', {}, 'Dans le panneau de Userscripts, touche le bouton de ', h('b', {}, 'recherche de mises à jour'), ' (↻), puis mets à jour ', h('b', {}, 'Aquaman'), '.'),
          h('li', {}, 'Touche ', h('b', {}, 'Recharger'), ' ci-dessous : les nouveautés de la version s’affichent.')
        ),
        h('p', { class: 'aqm-muted' }, 'Userscripts ne trouve rien ? Suis les étapes « Mettre à jour sur iPhone et iPad » de la ', h('a', { href: INSTALL_PAGE, target: '_blank', rel: 'noopener' }, 'page d’installation'), '.'),
        h('div', { class: 'aqm-update-actions' }, h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => box.remove() }, 'Fermer'), h('button', { type: 'button', class: 'aqm-queue-btn is-main', onclick: () => location.reload() }, 'Recharger'))
      );
    const box = h(
      'div',
      { class: 'aqm-root aqm-update', role: 'status' },
      h('div', { class: 'aqm-queue-head' }, h('strong', {}, `🔱 Aquaman ${update.version} est disponible`)),
      h(
        'p',
        {},
        IOS
          ? `Tu as la version ${version}. Touche « Installer » : les étapes pour mettre Aquaman à jour avec Userscripts s’affichent ici.`
          : `Tu as la version ${version}. Touche « Installer », puis « Mettre à jour » dans Tampermonkey. Recharge ensuite cette page.`
      ),
      h(
        'div',
        { class: 'aqm-update-actions' },
        later,
        IOS
          ? h('button', { type: 'button', class: 'aqm-queue-btn is-main', onclick: iosSteps }, 'Installer')
          : h('a', { class: 'aqm-queue-btn is-main', href: url, target: '_blank', rel: 'noopener', onclick: () => box.remove() }, 'Installer')
      )
    );
    document.body.append(box);
  }

  // A page that changes all the time (an exchange, its list of cards) would have Aquaman run over and over: the longer
  // its last run took, the longer it waits (8 times as long, 0.15 to 1.5 s), so the game keeps most of the time.
  // The run waits for a moment when the browser has nothing to draw (1 s more at most), and for the tab to be shown
  // again when it is hidden.
  // Settings changed elsewhere: a box offers to load the page again to apply them.
  function offerReload() {
    if (document.querySelector('.aqm-reload')) return;
    const box = h(
      'div',
      { class: 'aqm-root aqm-update aqm-reload', role: 'status' },
      h('div', { class: 'aqm-queue-head' }, h('strong', {}, '🔱 Réglages d’Aquaman modifiés')),
      h('p', {}, 'Recharge la page pour les appliquer.'),
      h(
        'div',
        { class: 'aqm-update-actions' },
        h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => box.remove() }, 'Plus tard'),
        h('button', { type: 'button', class: 'aqm-queue-btn is-main', onclick: () => location.reload() }, 'Recharger')
      )
    );
    document.body.append(box);
  }

  let queued = false;
  let runCost = 0;
  // A visit of a page: a new one each time the path changes (another series keeps the path).
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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !missedRun) return;
    missedRun = false;
    schedule();
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

  // Removes everything Aquaman added and stops.
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
    overlay = null;
    document.querySelectorAll('.aqm-root, .aqm-plus, .aqm-open-more, .aqm-trade-filter').forEach((el) => el.remove());
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

  // Starts once the site's React has taken over the page sent by the server (hydration): an element added before
  // would not match what React expects ("Minified React error #418").
  // inject.js says when React took over every button of the page (data-aqm-hydrated): the album of the collection is
  // sometimes taken over long after the page loaded. (16 s at most, without inject.js.)
  function whenSettled(start) {
    const idle = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 300));
    const since = Date.now();
    const wait = () => (document.documentElement.hasAttribute('data-aqm-hydrated') || Date.now() - since > 16e3 ? idle() : setTimeout(wait, 150));
    if (document.readyState === 'complete') wait();
    else addEventListener('load', wait, { once: true });
  }

  // The home's boosters are shown as soon as the game draws its pile, without waiting for the whole page (see
  // whenSettled): the pile only comes once the game has read its boosters, after React took the page over. run()
  // takes over once the page is settled.
  addEventListener('message', (e) => {
    if (e.source === window && e.data?.aquaman === 'boosters-refreshed') onBoostersRefreshed(e.data.id, !!e.data.ok);
  });
  Promise.all([loadShotStore(), featReady]).then(() => !stopped && /^\/jeu\/?$/.test(location.pathname) && markBoosterKinds());
  // "Ma progression" beside the title of the Collection as soon as the page shows it (see earlyStatsButton).
  featReady.then(() => !stopped && earlyStatsButton());
  // The series and favourites are read as soon as the script starts, in any page of the game: the stars of the
  // Collection come with its strip, even when it is the first page opened.
  featReady.then(() => {
    if (stopped || favLoading || seriesBySlug || !on('seriesTools') || !location.pathname.startsWith('/jeu')) return;
    favLoading = true;
    loadFavIds().finally(() => {
      favLoading = false;
      schedule();
    });
  });
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
})();
