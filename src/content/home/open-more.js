// Aquaman, code de la page : accueil, plus de 10 boosters, 10 à la fois.

// ---------- accueil : plus de 10 boosters, 10 à la fois ----------
// Le « Tout ouvrir » du jeu ouvre 10 boosters au plus. Quand il en reste davantage de cette sorte, sa fenêtre de cartes
// reçoit, à côté de « Fermer », un bouton « Ouvrir les 10 suivants » : il ferme la fenêtre et clique de nouveau sur le
// « Tout ouvrir » du jeu, sur la même sorte. Chaque ouverture est une vraie ouverture du jeu, avec son animation ; rien
// ne dépasse sa limite.

let chaining = false;
const OPEN_ALL = /^tout ouvrir/i;

// La sorte qu'ouvre un « Tout ouvrir » : celle de devant des piles, sinon celle sur laquelle est le jeu, sinon sa
// seule.
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

// Un clic du joueur sur un « Tout ouvrir » (celui du jeu ou une copie) : ce qu'il ouvre est gardé ; sur « Ouvrir » (un
// booster), oublié. (Les clics d'Aquaman lui-même, non fiables, ne comptent pas : openMore fixe le lot lui-même.)
onStart(() => {
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
});

// La fenêtre de cartes se ferme toute seule AUTO_CLOSE ms après sa dernière carte (réglage openMoreAuto) : sur les
// suivants quand il en reste, sinon sur l'accueil. Un clic dans la fenêtre l'arrête, pour regarder les cartes.
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

// (un clic dans la fenêtre de cartes, sauf sur le bouton d'Aquaman : le compte à rebours s'arrête)
onStart(() => {
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!autoEnd?.timer || !e.isTrusted || !(e.target instanceof Element) || e.target.closest('.aqm-open-more')) return;
      stopAuto(true);
    },
    true
  );
});

function markOpenMore() {
  const old = document.querySelector('.aqm-open-more');
  if (!batch && !old && !autoEnd) return;
  // (plusieurs boosters ouverts d'un coup ; left : ceux de leur sorte encore en attente)
  const multi = batch?.opened > 1;
  const left = multi && batch.before != null ? Math.max(0, batch.before - batch.opened) : 0;
  // La fenêtre de cartes : son « Fermer » à côté de « Voir ma collection ».
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
  // Plus rien : seulement le compte à rebours, à côté de « Fermer ».
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

// Ferme la fenêtre de cartes, attend l'accueil, puis ouvre les suivants de la même sorte.
async function openMore(close) {
  if (chaining || !batch) return;
  chaining = true;
  const { kind } = batch;
  const left = batch.before - batch.opened;
  document.querySelector('.aqm-open-more')?.remove();
  try {
    close.click();
    // (la fenêtre s'en va, puis les copies des piles sont redessinées)
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
