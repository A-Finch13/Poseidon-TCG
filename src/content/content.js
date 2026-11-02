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
  const ICON_TROPHY =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M232,64H208V48a8,8,0,0,0-8-8H56a8,8,0,0,0-8,8V64H24A16,16,0,0,0,8,80V96a40,40,0,0,0,40,40h3.65A80.13,80.13,0,0,0,120,191.61V216H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16H136V191.58c31.94-3.23,58.44-25.64,68.08-55.58H208a40,40,0,0,0,40-40V80A16,16,0,0,0,232,64ZM48,120A24,24,0,0,1,24,96V80H48v32q0,4,.39,8Zm144-8.9c0,35.52-28.49,64.64-63.51,64.9H128a64,64,0,0,1-64-64V56H192ZM232,96a24,24,0,0,1-24,24h-.5a81.81,81.81,0,0,0,.5-8.9V80h24Z"/></svg>';
  const ICON_PACK =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M184,72H40A16,16,0,0,0,24,88V200a16,16,0,0,0,16,16H184a16,16,0,0,0,16-16V88A16,16,0,0,0,184,72Zm0,128H40V88H184V200ZM232,56V176a8,8,0,0,1-16,0V56H64a8,8,0,0,1,0-16H216A16,16,0,0,1,232,56Z"/></svg>';
  const ICON_X =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
  const ICON_COMPASS =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216ZM172.42,72.84l-64,32a8.05,8.05,0,0,0-3.58,3.58l-32,64A8,8,0,0,0,80,184a8.1,8.1,0,0,0,3.58-.84l64-32a8.05,8.05,0,0,0,3.58-3.58l32-64a8,8,0,0,0-10.74-10.74ZM138,138,97.89,158.11,118,118l40.15-20.07Z"/></svg>';
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

  async function gameWrite(path, method) {
    const res = await pageFetch(`/api-game/v1${path}`, { method, credentials: 'include', headers: { accept: 'application/json' } });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(body?.error?.message || `Erreur ${res.status}`);
      // "Doucement ! Réessaie dans un instant." : the game asks to slow down, the change can be sent again.
      error.slowDown = res.status === 429 || /doucement|r[ée]essaie|trop de requ/i.test(error.message);
      error.wait = (Number(res.headers?.get?.('retry-after')) || 0) * 1000;
      throw error;
    }
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
  let queueRunning = false;
  let settled = false; // the page was taken over by React: Aquaman may change it (see whenSettled)

  const readQueue = async () => (await chrome.storage.local.get(QUEUE))[QUEUE] ?? null;
  const writeQueue = (q) => chrome.storage.local.set({ [QUEUE]: q });
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

  // Adds cards at the end of the waiting ones (each once, WAIT_MAX at most); returns how many were added, and how
  // many didn't fit.
  async function park(ids) {
    const waiting = await readList(WAITING);
    const fresh = ids.filter((id) => !waiting.includes(id));
    const fit = fresh.slice(0, Math.max(0, WAIT_MAX - waiting.length));
    if (fit.length) await chrome.storage.local.set({ [WAITING]: [...waiting, ...fit], ...(waiting.length ? {} : { [ENTERED]: 0 }) });
    return { parked: fit.length, over: fresh.length - fit.length };
  }

  // Takes cards out of the waiting ones; returns how many were there.
  async function takeWaiting(ids) {
    const waiting = await readList(WAITING);
    const left = waiting.filter((id) => !ids.includes(id));
    if (left.length !== waiting.length) await chrome.storage.local.set({ [WAITING]: left });
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
    await chrome.storage.local.set({ [SENT]: room.sent, [WAITING]: left.slice(places), [ENTERED]: entered + waiting.length - room.waiting.length });
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
          await chrome.storage.local.set({ [SENT]: sent.includes(id) ? sent : [...sent, id], ...(q.refill ? { [ENTERED]: entered + 1 } : {}) });
          await writeQueue({ ...q, ids, done: q.done + 1, tries: 0, beat: Date.now(), finishedAt: ids.length ? 0 : Date.now() });
          if (ids.length) await pause(gap);
        } catch (e) {
          q = await readQueue();
          if (!q || q.finishedAt) break;
          if (e.slowDown && q.tries < 6) {
            gap = Math.min(4000, gap * 1.5);
            const wait = Math.max(e.wait, Math.min(30e3, 3000 * 2 ** q.tries));
            await writeQueue({ ...q, tries: q.tries + 1, beat: Date.now(), until: Date.now() + wait });
            await pause(wait);
          } else if (FULL.test(e.message)) {
            // The search list is full: the rest waits in Aquaman for free places.
            const limit = Number(e.message.match(FULL)?.[1]);
            if (limit > 0) await chrome.storage.local.set({ [LIMIT]: limit });
            const before = await readList(WAITING);
            const waiting = [...q.ids, ...before.filter((x) => !q.ids.includes(x))];
            const parked = Math.min(q.ids.length, WAIT_MAX);
            await chrome.storage.local.set({ [WAITING]: waiting.slice(0, WAIT_MAX), [REFILL]: Date.now(), ...(before.length || q.refill ? {} : { [ENTERED]: 0 }) });
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
    let box = document.querySelector('.aqm-queue');
    if (!q || (!q.ids.length && !q.finishedAt) || !location.pathname.startsWith('/jeu')) return void box?.remove();
    if (!box) box = document.body.appendChild(h('div', { class: 'aqm-root aqm-queue', role: 'status' }));
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

  // The queue changed (in this tab or another one): the box follows, and this tab takes over if needed.
  function onStorage(changes) {
    if (stopped || !settled || !changes[QUEUE]) return;
    renderBox();
    runQueue();
  }

  // Every 5 seconds: the countdown of a wait, and a tab that went silent.
  setInterval(async () => {
    if (stopped || !settled) return;
    const q = await readQueue();
    renderBox();
    if (q?.finishedAt && Date.now() - q.finishedAt > 60e3) chrome.storage.local.remove(QUEUE);
    else runQueue();
    checkRoom();
  }, 5000);

  // Messages posted by inject.js about the site's own requests.
  function onPageMessage(e) {
    if (e.source !== window || typeof e.data?.aquaman !== 'string') return;
    if (e.data.aquaman === 'collection-stale') {
      owned = null;
      send({ type: 'collection-stale' });
      setTimeout(schedule, 1500);
      setTimeout(() => checkRoom(20e3), 3000); // a card searched may just have been obtained
    } else if (e.data.aquaman === 'status') send({ type: 'status', pending: e.data.pending });
    else if (e.data.aquaman === 'feed' && Array.isArray(e.data.pulls)) send({ type: 'feed-seen', pulls: e.data.pulls });
    else if (e.data.aquaman === 'opened' && Array.isArray(e.data.boosters))
      send({ type: 'opened', boosters: e.data.boosters }).then((report) => {
        if (report && !report.error) {
          pityReport = report;
          pityAt = Date.now();
        }
        renderPity();
      });
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

  // Elements of the site with a text matching re.
  function elementsWithText(from, re) {
    const out = [];
    const walker = document.createTreeWalker(from, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (el && re.test(n.nodeValue) && !el.closest('.aqm-root')) out.push(el);
    }
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
      item('Classement des amis', 'Cartes uniques et séries complètes', ICON_TROPHY, openLeaderboard),
      item('Boosters rentables', 'Prix, taux de drop, persos et séries', ICON_PACK, openBoosters),
      item('Qui a cette carte ?', 'Ceux qui l’ont, la vendent ou l’ont tirée', ICON_SEARCH, openWhoHas),
      item('Séries favorites', 'Tes séries et leurs persos manquants', ICON_STAR, openFavorites),
      item('Visite guidée', 'Le tour de ce qu’ajoute Aquaman', ICON_COMPASS, () => startTour(0)),
      item('Nouveautés', 'Ce qui a changé dans Aquaman', ICON_SPARK, () => openNews()),
      meId === AUTHOR_ID ? item('Joueurs avec Aquaman', 'Réservé à l’auteur', ICON_TROPHY, openUsers) : null
    );
    menu.anchor = anchor;
    document.body.append(menu);
    anchor.setAttribute('aria-expanded', 'true');
    const r = anchor.getBoundingClientRect();
    const below = r.bottom + 8 + menu.offsetHeight < innerHeight;
    menu.style.top = `${below ? r.bottom + 8 : r.top - 8 - menu.offsetHeight}px`;
    menu.style.left = `${Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.left + r.width / 2 - menu.offsetWidth / 2))}px`;
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

  async function openLeaderboard() {
    const body = openOverlay('Classement des amis', 'Toi et tes amis, selon les cartes uniques et les séries complètes.');
    let sortBy = 'owned';
    let rows = [];
    const tabs = h('div');
    const status = h('p', { class: 'aqm-note' }, 'Chargement des collections…');
    const list = h('ol', { class: 'aqm-board' });
    body.append(tabs, status, list);

    const render = () => {
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
      const score = (r) => (r.state === 'ok' ? [r[sortBy], sortBy === 'owned' ? r.albums : r.owned] : [-1, -1]);
      const sorted = [...rows].sort((a, b) => {
        const [a1, a2] = score(a);
        const [b1, b2] = score(b);
        return b1 - a1 || b2 - a2 || String(a.name).localeCompare(String(b.name));
      });
      let place = 0;
      const topAlbums = Math.max(0, ...rows.filter((r) => r.state === 'ok').map((r) => r.albums));
      list.replaceChildren(
        ...sorted.map((r) => {
          if (r.state === 'ok') place++;
          const share = r.total ? r.owned / r.total : 0;
          // Only the number of the chosen tab; the bar of the series compares to the best of the list.
          const stats =
            r.state !== 'ok'
              ? [h('p', { class: 'aqm-muted' }, r.state === 'loading' ? 'Chargement…' : r.state === 'private' ? 'Collection privée' : 'Collection indisponible')]
              : sortBy === 'owned'
                ? [
                    h(
                      'div',
                      { class: 'aqm-stat is-on' },
                      h('strong', {}, fmt(r.owned)),
                      h('small', {}, `/ ${fmt(r.total)} cartes`),
                      h('span', { class: 'aqm-bar' }, h('span', { style: `width:${(100 * share).toFixed(2)}%` }))
                    )
                  ]
                : [
                    h(
                      'div',
                      { class: 'aqm-stat is-on' },
                      h('strong', {}, fmt(r.albums)),
                      h('small', {}, r.albums > 1 ? 'séries complètes' : 'série complète'),
                      h('span', { class: 'aqm-bar' }, h('span', { style: `width:${topAlbums ? ((100 * r.albums) / topAlbums).toFixed(2) : 0}%` }))
                    )
                  ];
          return h(
            'li',
            { class: `aqm-row${r.me ? ' is-me' : ''}` },
            h('span', { class: `aqm-place aqm-place-${place}` }, r.state === 'ok' ? String(place) : '–'),
            h('img', { class: 'aqm-avatar', src: avatarUrl(r.id), alt: '', loading: 'lazy' }),
            h('a', { class: 'aqm-name', href: `/profile/${encodeURIComponent(r.id)}` }, r.name || 'Joueur', r.me ? h('span', { class: 'aqm-tag' }, 'Toi') : null),
            h('div', { class: 'aqm-stats' }, stats)
          );
        })
      );
    };

    try {
      const { me, friends, friendsError: error } = await ask({ type: 'friends' });
      rows = [{ id: me, me: true }, ...friends].map((p) => ({ ...p, state: 'loading' }));
      render();
      await eachLimited(rows, 4, async (row) => {
        try {
          const p = await ask({ type: 'player', id: row.id });
          row.name ||= p.name;
          if (p.private) row.state = 'private';
          else Object.assign(row, { state: 'ok', owned: p.owned, total: p.total, albums: p.albums });
        } catch {
          row.state = 'error';
        }
        render();
      });
      status.textContent = error
        ? `Liste d'amis indisponible (${error}).`
        : friends.length
          ? `${friends.length} ami${friends.length > 1 ? 's' : ''} · une série est complète quand son album est réclamé.`
          : "Tu n'as pas encore d'amis dans le jeu : ajoute-en depuis leur profil pour te comparer à eux.";
    } catch (e) {
      status.textContent = e.message;
    }
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
    const suggestions = h('datalist', { id: 'aqm-suggest' });
    const search = h('input', { type: 'search', class: 'aqm-search', list: 'aqm-suggest', autocomplete: 'off' });
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
    body.append(goalRow, pickRow, sentence, sortRow, summary, list, how, suggestions);

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
        suggestions.replaceChildren(...(report.suggestions ?? []).map((s) => h('option', { value: s })));
        render();
      } catch {}
    }
    search.addEventListener('input', () => {
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
        if (pickRow.firstChild !== search) pickRow.replaceChildren(search);
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

  // One line of a list of players: the card's number, the player (link to their profile) and a detail on the right.
  const playerRow = (serial, player, right, card) =>
    h(
      'li',
      { class: 'aqm-owner' },
      h('span', { class: 'aqm-owner-serial' }, serial != null ? `#${serial}${card?.maxCopies ? `/${card.maxCopies}` : ''}` : ''),
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
          p.player?.id ? h('a', { href: `/profile/${encodeURIComponent(p.player.id)}` }, p.player.name || 'Un joueur') : h('span', {}, p.player?.name || 'Un joueur'),
          h('small', { title: new Date(p.at).toLocaleString('fr-FR') }, timeAgo(p.at))
        )
      )
    );

  async function openWhoHas() {
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
    showSearch();
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
    const body = openOverlay('Joueurs avec Aquaman', 'Les joueurs qui utilisent Aquaman, du plus récemment vu au plus ancien. Visible par toi seul.');
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

    function show(all) {
      const day = Date.now() - 86400e3;
      const week = Date.now() - 7 * 86400e3;
      const versions = {};
      for (const u of all) versions[u.version ?? '?'] = (versions[u.version ?? '?'] ?? 0) + 1;
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
              h('span', { class: `aqm-tag aqm-kind-${u.kind ?? 'x'}` }, u.kind === 'userscript' ? 'Script' : u.kind === 'extension' ? 'Extension' : '?'),
              h('span', { class: 'aqm-muted' }, u.version ? `v${u.version}` : ''),
              h('span', { class: 'aqm-user-seen', title: `Vu la première fois le ${new Date(u.firstSeen).toLocaleDateString('fr-FR')}` }, timeAgo(u.lastSeen))
            )
          )
        );
      };
      search.addEventListener('input', render);
      view.replaceChildren(
        h(
          'div',
          { class: 'aqm-who-stats aqm-users-stats' },
          stat('Joueurs', fmt(all.length)),
          stat('Vus ces 24 h', fmt(all.filter((u) => u.lastSeen >= day).length)),
          stat('Vus ces 7 jours', fmt(all.filter((u) => u.lastSeen >= week).length)),
          stat('Extension / script', `${fmt(all.filter((u) => u.kind === 'extension').length)} / ${fmt(all.filter((u) => u.kind === 'userscript').length)}`)
        ),
        h(
          'p',
          { class: 'aqm-note' },
          'Versions : ',
          Object.entries(versions)
            .sort((a, b) => b[1] - a[1])
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

  // Reads the favourites (fresh: with the changes made on the other devices right now) and repaints the stars.
  async function loadFavIds(fresh = false) {
    const res = await send({ type: 'favorites', fresh });
    if (!res || res.error) return;
    favIds = new Set(res.favorites.map((s) => s.id));
    seriesBySlug = new Map(res.all.map((s) => [s.slug, s.id]));
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
    if (!seriesBySlug) {
      if (!favLoading) {
        favLoading = true;
        loadFavIds().finally(() => {
          favLoading = false;
          schedule();
        });
      }
      return;
    }
    if (!strip.previousElementSibling?.classList.contains('aqm-fav-bar'))
      strip.before(
        h(
          'div',
          { class: 'aqm-root aqm-fav-bar' },
          h('button', { type: 'button', class: 'aqm-chip aqm-fav-open', onclick: openFavorites }, '★ Favoris ', h('b', {}, String(favIds?.size ?? 0)))
        )
      );
    for (const img of strip.querySelectorAll('img[src*="/api/covers/"]')) {
      const tile = img.closest('button, a, [role="radio"]') ?? img.parentElement;
      if (!tile) continue;
      anchorBadges(tile);
      if (tile.querySelector(':scope > .aqm-star')) continue;
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
      want.textContent = st.toWant ? `🔭 Rechercher les ${st.toWant} manquante${st.toWant > 1 ? 's' : ''}` : '🔭 Toutes les manquantes sont recherchées';
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
    // The progress of the adding and of the waiting cards; once it ended, the buttons show what is left to search.
    box.replaceChildren(fav, want, note, searchPanel(() => box.isConnected && renderAlbum(box, id)));
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

  // ---------- trades: bigger cards and an owned / missing dot ----------

  let owned = null; // { at, byImage }
  let tradesBusy = false;

  // Copies owned by image key, kept 30 seconds.
  async function ownedByImage() {
    if (owned && Date.now() - owned.at < 30e3) return owned.byImage;
    const res = await ask({ type: 'ownership' });
    owned = { at: Date.now(), byImage: res.byImage };
    return owned.byImage;
  }

  async function markTrades() {
    if (tradesBusy) return;
    const labels = elementsWithText(document.body, /^\s*tu (re[çc]ois|donnes)\s*:?\s*$/i);
    if (!labels.length) return;
    tradesBusy = true;
    try {
      const byImage = await ownedByImage();
      if (stopped) return;
      for (const label of labels) {
        const gives = /donnes/i.test(label.textContent);
        let box = label.parentElement;
        while (box && box !== document.body && !box.querySelector('img')) box = box.parentElement;
        if (!box || box === document.body) continue;
        for (const img of box.querySelectorAll('img')) {
          const src = img.currentSrc || img.src;
          if (!isCardImage(src) || img.closest('.aqm-root')) continue;
          const n = byImage[imageKey(src)] ?? 0;
          const frame = img.parentElement;
          let tile = frame;
          while (tile.parentElement && tile.parentElement !== box && tile.parentElement.querySelectorAll('img').length === 1) tile = tile.parentElement;
          tile.classList.add('aqm-trade-tile');
          anchorBadges(frame);
          let dot = frame.querySelector(':scope > .aqm-dot');
          if (!dot) dot = frame.appendChild(h('span', { class: 'aqm-root aqm-dot' }));
          setClass(dot, `aqm-root aqm-dot ${n ? 'is-yes' : 'is-no'}${n > 1 ? ' has-count' : ''}`);
          setText(dot, n > 1 ? `×${n}` : '');
          const title = !n
            ? 'Tu n’as pas cette carte'
            : gives
              ? n > 1
                ? `Tu en as ${n} : il t’en restera ${n - 1}`
                : 'Ton seul exemplaire'
              : n > 1
                ? `Tu l’as déjà (${n} exemplaires)`
                : 'Tu l’as déjà';
          if (dot.title !== title) dot.title = title;
        }
      }
    } catch (e) {
      console.warn('[Aquaman] échanges :', e);
    } finally {
      tradesBusy = false;
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

  // Slots of the showcase editor in order: the card and its row of 3 buttons (‹ › ✕).
  function showcaseSlots(dlg) {
    const slots = [];
    for (const el of dlg.querySelectorAll('div, li, span')) {
      if (el.closest('.aqm-root') || el.querySelector('img') || el.querySelectorAll('button').length !== 3) continue;
      if ([...el.children].some((c) => c.querySelectorAll('button').length === 3)) continue;
      let slot = el.parentElement;
      while (slot && slot !== dlg && !slot.querySelector('img')) slot = slot.parentElement;
      if (!slot || slot === dlg || slot.querySelectorAll('img').length !== 1) continue;
      slots.push({ slot, controls: el });
    }
    return slots;
  }

  // Windows titled "Ma vitrine".
  function showcaseDialogs() {
    const found = new Set();
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
    for (const dlg of showcaseDialogs()) {
      const slots = showcaseSlots(dlg);
      if (!slots.length) continue;
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
        { class: 'aqm-pity-line', title: p.known ? `${fmt(p.since)} booster${p.since > 1 ? 's' : ''} ouvert${p.since > 1 ? 's' : ''} depuis ta dernière ${code} ou mieux.` : `Aquaman n’a pas encore vu de ${code} sortir : il compte depuis son installation, donc la garantie peut arriver plus tôt.` },
        h('p', {}, rarityCode(code), ' garantie ', h('strong', {}, when), p.known ? '' : ' au plus'),
        h('span', { class: 'aqm-bar' }, h('span', { style: `width:${Math.min(100, (100 * p.since) / p.every).toFixed(1)}%` })),
        h('small', {}, p.known ? `${fmt(p.since)} / ${fmt(p.every)} depuis ta dernière ${code}` : `${fmt(p.since)} / ${fmt(p.every)} sans ${code} depuis qu’Aquaman compte`)
      );
    };
    box.replaceChildren(
      h('p', { class: 'aqm-label' }, 'Garantie anti-malchance'),
      h('div', { class: 'aqm-pity-lines' }, line('SSR'), line('UR')),
      h(
        'p',
        { class: 'aqm-pity-note' },
        {
          ok: 'Compté par Aquaman à chaque booster ouvert, et partagé entre tes appareils (PC, téléphone, extension ou script).',
          waiting: 'Compté par Aquaman à chaque booster ouvert, et partagé entre tes appareils dès ta prochaine ouverture.',
          error: 'Compté par Aquaman sur ce navigateur : le partage avec tes autres appareils ne répond pas pour le moment.',
          off: 'Compté par Aquaman à chaque booster ouvert sur ce navigateur (partage entre appareils désactivé).'
        }[pityReport.sync] ?? 'Compté par Aquaman à chaque booster ouvert.'
      )
    );
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
  }

  function onOutside(e) {
    if (menu && !menu.contains(e.target) && !menu.anchor?.contains(e.target) && !e.target.closest?.('.aqm-tour')) closeMenu();
  }

  // ---------- loop ----------

  function run() {
    if (stopped) return;
    if (!alive()) return shutdown();
    if (!location.pathname.startsWith('/jeu')) return;
    for (const step of [addPlusTab, enlargePulls, showPity, readPityRules, markSeriesStrip, markFavoriteSeries, markAlbum, enhanceShowcaseEditor, markTrades, pollFeedNow, startOnce]) {
      try {
        step();
      } catch (e) {
        console.warn('[Aquaman]', e);
      }
    }
  }

  // The script has no background worker: while a page of the game is open, the "beaux tirages" are read every minute.
  let feedAt = 0;
  function pollFeedNow() {
    if (Date.now() - feedAt < 60e3) return;
    feedAt = Date.now();
    send({ type: 'feed-poll' });
  }

  let queued = false;
  function schedule() {
    if (queued || stopped) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      run();
    }, 150);
  }

  const observer = new MutationObserver(schedule);
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
    for (const [target, type, fn, opts] of listeners) target.removeEventListener(type, fn, opts);
    if (tour) cancelAnimationFrame(tour.raf);
    tour = null;
    menu = null;
    overlay = null;
    document.querySelectorAll('.aqm-root, .aqm-plus').forEach((el) => el.remove());
    document.querySelectorAll('[class*="aqm-"]').forEach((el) => {
      for (const cls of [...el.classList]) if (cls.startsWith('aqm-')) el.classList.remove(cls);
    });
    document.querySelectorAll('[data-aqm-slot]').forEach((el) => delete el.dataset.aqmSlot);
    document.querySelectorAll('[data-aqm-anchor]').forEach((el) => {
      el.style.position = '';
      delete el.dataset.aqmAnchor;
    });
    root.classList.remove('aqm-lock');
    if (root.dataset.aqmOwner === owner) delete root.dataset.aqmOwner;
  }

  // Starts once the site's React has taken over the page sent by the server (hydration): an element added before
  // would not match what React expects ("Minified React error #418").
  function whenSettled(start) {
    const idle = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 300));
    if (document.readyState === 'complete') idle();
    else addEventListener('load', idle, { once: true });
  }

  whenSettled(() => {
    if (stopped) return;
    settled = true;
    accountId().then((id) => (meId = id));
    send({ type: 'hello', kind: owner });
    for (const [target, type, fn, opts] of listeners) target.addEventListener(type, fn, opts);
    chrome.storage.onChanged.addListener(onStorage);
    renderBox();
    runQueue();
    observer.observe(root, { childList: true, subtree: true });
    run();
  });
})();
