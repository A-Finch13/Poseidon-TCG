// Aquaman, code de la page : liste de recherche, les cartes à rechercher, envoyées une à une à travers les changements
// de page.

// ---------- liste de recherche : une file qui continue à travers les changements de page ----------
// Les cartes à rechercher sont gardées dans le stockage : n'importe quelle page ouverte du jeu les envoie, une à la
// fois, au rythme qu'accepte le jeu, et continue après un changement de page ou un rechargement. Un seul onglet
// travaille à la fois (le « propriétaire », avec un battement de cœur).

const QUEUE = 'wantQueue';
const TAB = Math.random().toString(36).slice(2);
const STALE = 10e3; // un onglet silencieux depuis aussi longtemps passe la main

let queueRunning = false;


const readQueue = async () => (await chrome.storage.local.get(QUEUE))[QUEUE] ?? null;
const writeQueue = (q) => chrome.storage.local.set({ [QUEUE]: q });
// L'attente avant de renvoyer quand le jeu demande de ralentir : le temps qu'il donne (5 s quand il n'en donne pas) et
// 1 s de plus. Jamais un refus : la carte ou l'exemplaire attend son tour.
const slowWait = (e) => (e.wait || 5000) + 1000;

// Vrai quand un autre onglet travaille sur la file en ce moment.
const busyElsewhere = (q) => !!q.owner && q.owner !== TAB && (Date.now() - q.beat < STALE || Date.now() < (q.until || 0) + STALE);

// Le jeu prend 100 cartes au plus dans la liste de recherche : les autres attendent dans Aquaman (WAITING) et sont
// envoyées à mesure que des places se libèrent, quand le joueur obtient des cartes de la liste. SENT : les cartes
// qu'Aquaman a mises dans la liste, retirées une fois possédées.
const WAITING = 'wantWaiting';
const SENT = 'wantSent';
const LIMIT = 'wantLimit';
const REFILL = 'wantRefillAt'; // dernière vérification des places libres, par n'importe quel onglet
const WAIT_MAX = 200; // cartes en attente dans Aquaman au plus, en plus de la liste du jeu
const ENTERED = 'wantEntered'; // cartes en attente passées dans la liste du jeu (ou obtenues) depuis le début de l'attente
const CHECK_EVERY = 120e3;
const FULL = /d[ée]j[àa]\s*(\d+)|retire|limite|maximum|plein/i; // la réponse du jeu quand la liste est pleine

const readList = async (key) => (await chrome.storage.local.get(key))[key] ?? [];

// Enregistre un changement des cartes en attente (ou de celles qu'Aquaman a mises dans la liste du jeu), daté, et
// l'envoie aux autres appareils du joueur un moment plus tard.
let wantsPush = 0;
async function saveWants(items) {
  await chrome.storage.local.set({ ...items, wantsAt: Date.now() });
  clearTimeout(wantsPush);
  wantsPush = setTimeout(() => send({ type: 'wants-sync', fresh: true }), 1500);
}

// Ajoute des cartes à la fin de celles en attente (chacune une fois, WAIT_MAX au plus) ; renvoie combien ont été
// ajoutées, et combien n'ont pas tenu.
async function park(ids) {
  const waiting = await readList(WAITING);
  const fresh = ids.filter((id) => !waiting.includes(id));
  const fit = fresh.slice(0, Math.max(0, WAIT_MAX - waiting.length));
  if (fit.length) await saveWants({ [WAITING]: [...waiting, ...fit], ...(waiting.length ? {} : { [ENTERED]: 0 }) });
  return { parked: fit.length, over: fresh.length - fit.length };
}

// Retire des cartes de celles en attente ; renvoie combien y étaient.
async function takeWaiting(ids) {
  const waiting = await readList(WAITING);
  const left = waiting.filter((id) => !ids.includes(id));
  if (left.length !== waiting.length) await saveWants({ [WAITING]: left });
  return waiting.length - left.length;
}

// Ajoute des cartes à la file (chacune une fois) ; renvoie { sent } avec combien ont été ajoutées. Tant que des cartes
// attendent une place, les nouvelles attendent derrière elles : { parked, over } (voir park).
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
  q.refill = refill && q.refill !== false; // les cartes ajoutées par le joueur affichent le cadre
  await writeQueue(q);
  runQueue();
  return { sent: fresh.length };
}

const nCards = (n) => `${n} carte${n > 1 ? 's' : ''}`;
// Cartes qui n'ont pas tenu dans celles en attente.
const overNote = (over) => (over ? ` ${nCards(over)} de trop : Aquaman en garde ${WAIT_MAX} en attente au plus.` : '');

// Ce que sont devenues les cartes données à enqueueWants (r : sa réponse).
function wantsNote(r, free) {
  if (r.sent == null)
    return `Ta liste du jeu est pleine : ${nCards(r.parked)} de plus en attente dans Aquaman, ajoutée${r.parked > 1 ? 's' : ''} au fur et à mesure que tu obtiens les cartes recherchées.` + overNote(r.over);
  return `${nCards(r.sent)} en cours d’ajout : ${free}, la progression reste affichée (en haut de Séries favorites et en bas de l’écran).`;
}

// Envoie des cartes en attente quand la liste de recherche a des places libres : retire d'abord les cartes qu'Aquaman y
// a mises et que le joueur possède maintenant. Lancé après un changement de la collection, et toutes les 2 minutes
// (wait : temps depuis la dernière vérification).
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
  if (q?.ids.length) return; // la file d'abord
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
  // Les cartes ajoutées ou retirées de celles en attente entre-temps sont gardées telles quelles.
  const now = await readList(WAITING);
  const left = now.filter((id) => !waiting.includes(id) || room.waiting.includes(id));
  const places = Math.max(0, limit - room.count + freed);
  // Les cartes en attente déjà recherchées ou obtenues comptent comme faites.
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

// Envoie les cartes de la file, attend quand le jeu demande de ralentir, s'arrête à un vrai refus (une liste de
// recherche pleine).
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
        if (!q || q.finishedAt) break; // arrêté entre-temps
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
          // La liste de recherche est pleine : le reste attend dans Aquaman des places libres.
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

// Le cadre en bas de chaque page du jeu : les cartes en cours d'ajout par le joueur. Les cartes en attente partent en
// arrière-plan, sans cadre (leur progression est dans les séries favorites).
async function renderBox() {
  const q = await readQueue();
  if (!stopped) renderQueue(q && !q.refill ? q : null);
}

// La recherche du joueur et les cartes en attente, pour les séries favorites, tenues à jour tant qu'elles sont
// affichées : une barre en trois parties (dans la liste du jeu / en cours d'envoi / en attente dans Aquaman). changed :
// appelé quand des cartes ont été retirées de celles en attente, ou quand un ajout s'est terminé (les séries montrent
// alors ce qui reste à rechercher).
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

    // Les cartes que le joueur vient de demander.
    if (running && !q.refill)
      parts.push(
        h('div', { class: 'aqm-queue-head' }, h('strong', {}, `🔭 Ajout à ta liste du jeu · ${q.done}/${q.total}`)),
        h('span', { class: 'aqm-bar' }, h('span', { style: `width:${q.total ? ((100 * q.done) / q.total).toFixed(1) : 0}%` })),
        h('p', {}, `Les cartes entrent une à une dans ta liste de recherches du jeu (${limit} cartes au plus) ; au-delà, elles passent dans la file d’attente d’Aquaman.${slow}`)
      );

    // Les cartes en attente.
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

// Les cartes en cours d'ajout : la progression, puis le résultat.
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
  // La barre seulement pendant l'envoi de cartes (replaceChildren afficherait un null comme texte).
  box.replaceChildren(
    ...[
      h('div', { class: 'aqm-queue-head' }, h('strong', {}, title),
        h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => (running ? stopQueue() : chrome.storage.local.remove(QUEUE)) }, running ? 'Arrêter' : 'OK')),
      running && h('span', { class: 'aqm-bar' }, h('span', { style: `width:${q.total ? ((100 * q.done) / q.total).toFixed(1) : 0}%` })),
      ...lines.map((line) => line && h('p', {}, line))
    ].filter(Boolean)
  );
}

// Un cadre du coin en bas à droite (les cartes en cours d'ajout, les doublons en cours de mise en vente), l'un
// au-dessus de l'autre.
function dockBox(cls) {
  let box = document.querySelector(`.aqm-dock > .${cls}`);
  if (box) return box;
  const dock = document.querySelector('.aqm-dock') ?? document.body.appendChild(h('div', { class: 'aqm-root aqm-dock' }));
  return dock.appendChild(h('div', { class: `aqm-queue ${cls}`, role: 'status' }));
}
