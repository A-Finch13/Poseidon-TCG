// Aquaman, code de la page : la fenêtre de cartes, « Recycler les doublons » des cartes qu'on vient de tirer.

// ---------- la fenêtre de cartes : « Recycler les doublons » des cartes qu'on vient de tirer ----------
// À côté de « Voir ma collection » : les exemplaires des cartes tirées que le joueur a en plusieurs exemplaires,
// recyclés comme le fait « Recycler mes doublons » du jeu : le plus petit numéro de chaque carte est gardé, les cartes
// en vente (verrouillées) ou verrouillées par le joueur (protégées) ne sont jamais touchées. Deux clics : le nombre et
// les Perles d'abord, puis le recyclage.
// Avec « Recyclage automatique » (désactivé au départ), les N, R et SR partent tout de suite, sans clic ; les SSR, UR
// et SEC restent sur le bouton.
const AUTO_RARITIES = new Set(['N', 'R', 'SR']);
let pulledCards = new Set(); // les cartes des derniers boosters ouverts
let spareOffer = null; // { cards, state: loading|unread|ready|none|confirm|busy|done|failed, ids, perles, text, note }

// Les exemplaires à recycler parmi ceux des cartes tirées ({ id, rarity, perles }), le plus petit numéro gardé.
async function loadSpares(cards) {
  const [mine, rarities] = await Promise.all([gameWrite('/copies', 'GET'), gameWrite('/rarities', 'GET').catch(() => null)]);
  const list = Array.isArray(rarities) ? rarities : rarities?.rarities ?? [];
  const value = new Map(list.filter((r) => r?.code).map((r) => [r.code, Number(r.recycleValue) || 0]));
  const byCard = new Map();
  for (const c of Array.isArray(mine?.copies) ? mine.copies : []) {
    const id = c?.card?.id;
    if (!id || !cards.has(id) || c.locked) continue;
    if (!byCard.has(id)) byCard.set(id, []);
    byCard.get(id).push(c);
  }
  return [...byCard.values()]
    .flatMap((all) =>
      [...all]
        .sort((a, b) => Number(!!b.protected) - Number(!!a.protected) || (Number(a.serial) || 0) - (Number(b.serial) || 0))
        .slice(1)
        .filter((c) => !c.protected)
    )
    .map((c) => ({ id: c.copyId, rarity: c.card?.rarity ?? null, perles: value.get(c.card?.rarity) ?? 0 }))
    .filter((c) => typeof c.id === 'string' && c.id);
}

// Recycle les exemplaires (200 au plus par requête, comme le jeu les envoie) ; les Perles du jeu changent tout de
// suite.
async function recycleCopies(ids) {
  let gained = 0;
  let done = 0;
  let error = null;
  try {
    for (let i = 0; i < ids.length; i += 200) {
      const res = await gameWrite('/recycle', 'POST', { copyIds: ids.slice(i, i + 200) });
      done = Math.min(ids.length, i + 200);
      gained += Number(res?.gained) || 0;
      if (typeof res?.perles === 'number') window.postMessage({ aquamanCmd: 'set-perles', perles: res.perles }, location.origin);
    }
  } catch (e) {
    error = e;
  }
  if (done) {
    owned = null;
    send({ type: 'collection-stale' });
    guardSoon();
  }
  return { done, gained, error };
}
const recycledText = (done, gained) => `♻ ${fmt(done)} recyclée${done > 1 ? 's' : ''} · +${fmt(gained)} Perles`;

// Les exemplaires lus : le recyclage automatique d'abord (réglage), puis le bouton pour ce qui reste.
async function offerSpares(offer) {
  let spares;
  try {
    spares = await loadSpares(offer.cards);
  } catch (e) {
    // (affiché sur le bouton : un clic relit les exemplaires)
    console.warn('[Aquaman] doublons du tirage', e);
    return Object.assign(offer, { state: 'unread', text: '♻ Doublons : réessayer', error: e?.message || String(e) });
  }
  if (feat.autoRecycle === true) {
    const auto = spares.filter((c) => AUTO_RARITIES.has(c.rarity));
    if (auto.length) {
      offer.state = 'busy';
      markRecycleSpares();
      const r = await recycleCopies(auto.map((c) => c.id));
      offer.note = r.done ? `${recycledText(r.done, r.gained)} (auto)` : `Recyclage automatique refusé : ${r.error?.message ?? ''}`;
      const gone = new Set(auto.slice(0, r.done).map((c) => c.id));
      spares = spares.filter((c) => !gone.has(c.id));
    }
  }
  const left = on('recycleSpares') ? spares : [];
  Object.assign(offer, { ids: left.map((c) => c.id), perles: left.reduce((n, c) => n + c.perles, 0), state: left.length ? 'ready' : 'none' });
}

// La fenêtre de cartes : la rangée de son « Voir ma collection » (un lien vers /jeu/collection, pas un bouton) et de «
// Fermer » (la page peut avoir d'autres « Fermer », cachés).
function cardsWindowRow() {
  for (const close of document.querySelectorAll('button')) {
    if (close.closest('.aqm-root') || !/^fermer$/i.test(close.textContent.trim())) continue;
    const row = close.parentElement;
    const mine = row && [...row.children].find((b) => (b.tagName === 'A' || b.tagName === 'BUTTON') && !b.classList.contains('aqm-recycle-spares') && /^voir ma collection$/i.test(b.textContent.trim()));
    if (mine) return { row, mine };
  }
  return null;
}

function markRecycleSpares() {
  const old = document.querySelector('.aqm-recycle-spares');
  const oldNote = document.querySelector('.aqm-recycle-note');
  const found = (on('recycleSpares') || feat.autoRecycle === true) && pulledCards.size ? cardsWindowRow() : null;
  if (!found) return void (old?.remove(), oldNote?.remove());
  const { row, mine } = found;
  if (spareOffer?.cards !== pulledCards) {
    const offer = (spareOffer = { cards: pulledCards, state: 'loading' });
    offerSpares(offer).finally(() => spareOffer === offer && markRecycleSpares());
  }
  const o = spareOffer;
  // Le résultat du recyclage automatique, à côté des boutons.
  let note = oldNote;
  if (o.note) {
    if (!note || note.parentElement !== row) {
      oldNote?.remove();
      note = h('span', { class: 'aqm-root aqm-recycle-note' });
      mine.after(note);
    }
    if (note.textContent !== o.note) note.textContent = o.note;
  } else oldNote?.remove();
  if (o.state === 'none' || o.state === 'loading' || (o.state === 'busy' && !o.ids)) return void old?.remove();
  const n = o.ids?.length ?? 0;
  const gain = o.perles ? ` · +${fmt(o.perles)} Perles` : '';
  const label = {
    unread: o.text,
    ready: `♻ Recycler les doublons (${fmt(n)})`,
    confirm: `Confirmer : ${fmt(n)} carte${n > 1 ? 's' : ''}${gain}`,
    busy: 'Recyclage…',
    done: o.text,
    failed: o.text
  }[o.state];
  const title =
    o.state === 'unread'
      ? `Tes exemplaires n’ont pas pu être lus (${o.error}). Clique pour réessayer.`
      : o.state === 'failed'
      ? 'Clique pour réessayer'
      : `Les doublons des cartes de ce tirage${gain}. On garde le plus petit numéro de chaque carte ; les cartes en vente ou verrouillées ne sont pas touchées.`;
  let btn = old;
  if (!btn || btn.parentElement !== row) {
    old?.remove();
    btn = h('button', { type: 'button', class: `${mine.className} aqm-recycle-spares`, onclick: recycleSpares });
    (note?.isConnected ? note : mine).after(btn);
  }
  if (btn.textContent !== label) btn.textContent = label;
  if (btn.title !== title) btn.title = title;
  btn.disabled = o.state === 'busy' || o.state === 'done';
  btn.classList.toggle('is-confirm', o.state === 'confirm');
}

async function recycleSpares() {
  const o = spareOffer;
  if (!o) return;
  // (les exemplaires n'ont pas pu être lus : relus)
  if (o.state === 'unread') {
    spareOffer = null;
    return markRecycleSpares();
  }
  if (o.state === 'ready' || o.state === 'failed') {
    o.state = 'confirm';
    // (pas de second clic dans les 6 s : retour à la première étape)
    setTimeout(() => o.state === 'confirm' && ((o.state = 'ready'), markRecycleSpares()), 6000);
    return markRecycleSpares();
  }
  if (o.state !== 'confirm') return;
  o.state = 'busy';
  markRecycleSpares();
  const { done, gained, error } = await recycleCopies(o.ids);
  o.ids = o.ids.slice(done);
  if (!error) {
    o.state = 'done';
    o.text = recycledText(done, gained);
  } else {
    o.state = o.ids.length ? 'failed' : 'done';
    o.text = done ? `${recycledText(done, gained)}, puis refus : ${error.message}` : `Refusé : ${error.message}`;
  }
  markRecycleSpares();
}
