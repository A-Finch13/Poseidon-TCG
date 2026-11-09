// Aquaman, code de la page : « Recycler des cartes », rien de coché au départ, et un bouton pour tout cocher.

// ---------- « Recycler des cartes » : rien de coché au départ, et un bouton pour tout cocher ----------
// En mode « Mes doublons », le jeu coche tous les doublons (il garde les cartes exclues, aucune au départ) et ne dessine
// ses lignes que 48 par 48, quand le bas de la liste approche : une ligne pas encore dessinée reste cochée. À
// l'ouverture, Aquaman fait donc charger toute la liste (en la faisant défiler jusqu'en bas), décoche chaque ligne au
// fur et à mesure, puis la remet en haut : le bouton « Recycler » du jeu ne compte plus que ce que le joueur coche.
// En mode « Choisir librement », rien n'est coché par le jeu et il a son propre « Tout décocher » : Aquaman n'y touche
// pas.

const RECYCLE_TITLE = /^recycler des cartes$/i;
const recycleSeen = new WeakSet(); // lignes déjà mises dans l'état voulu une fois
let recycleIntent = 'none'; // l'état des lignes qui apparaissent : 'none' (décochées) ou 'all' (cochées)
let recyclePrepared = null; // la fenêtre dont toute la liste a été chargée
let recycleJob = null; // le chargement de la liste en cours (une promesse)

// La case d'une ligne : une vraie, sinon le petit carré dessiné avant l'image de la carte.
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

// Une case dessinée est cochée quand son ✓ s'affiche (une case décochée peut le garder caché).
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

// Le nombre d'exemplaires cochés, d'après le bouton « Recycler N · +X » du jeu (juste « Recycler » sans aucun) ; null
// s'il est inconnu.
function recycleCount(dialog) {
  const b = [...dialog.querySelectorAll('button')].find((x) => !x.closest('.aqm-root') && /^recycler\b/i.test(x.textContent.trim()));
  return b ? Number(b.textContent.trim().match(/^recycler\s+([\d\s  ]+)/i)?.[1]?.replace(/\s/g, '') || 0) : null;
}

// Le mode « Mes doublons » du jeu et son nombre d'exemplaires (« Mes doublons (1394) ») ; null dans l'autre mode. Sans
// choix de mode (la fenêtre d'une seule carte), c'est le même fonctionnement.
function sparesMode(dialog) {
  const modes = dialog.querySelector('[role="radiogroup"]');
  if (!modes) return { total: null };
  const spares = [...modes.querySelectorAll('[role="radio"]')].find((b) => /mes doublons/i.test(b.textContent));
  if (spares?.getAttribute('aria-checked') !== 'true') return null;
  const total = Number(spares.textContent.match(/\(([\d\s  ]+)\)/)?.[1]?.replace(/\s/g, ''));
  return { total: Number.isFinite(total) ? total : null };
}

// La fenêtre et ses lignes (une par carte : son image et son nombre), chacune avec sa case.
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

// Met les lignes pas encore vues dans l'état voulu (recycleIntent).
function settleRows(rows) {
  for (const { row, box } of rows) {
    if (recycleSeen.has(row)) continue;
    recycleSeen.add(row);
    if (isTicked(box) !== (recycleIntent === 'all')) box.click();
  }
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));

// Fait charger toute la liste : la boîte qui défile est menée en bas tant que le jeu ajoute des lignes (il en ajoute
// 48 quand le bas approche), chaque nouvelle ligne mise dans l'état voulu ; puis elle revient là où elle était.
async function loadAllRecycleRows(dialog) {
  const first = recycleParts()?.rows[0]?.row;
  let scroller = first?.parentElement;
  while (scroller && scroller !== dialog && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
  if (!scroller) return;
  const top = scroller.scrollTop;
  let last = -1;
  for (let still = 0, guard = 0; still < 4 && guard < 400 && dialog.isConnected; guard++) {
    const parts = recycleParts();
    if (!parts) break;
    settleRows(parts.rows);
    if (parts.rows.length === last) still++;
    else [still, last] = [0, parts.rows.length];
    scroller.scrollTop = scroller.scrollHeight;
    await nextFrame();
  }
  const parts = recycleParts();
  if (parts) settleRows(parts.rows);
  scroller.scrollTop = top;
}

function prepareRecycle(dialog) {
  if (recyclePrepared === dialog) return Promise.resolve();
  recycleJob ??= loadAllRecycleRows(dialog)
    .catch(() => {})
    .finally(() => {
      recyclePrepared = dialog;
      recycleJob = null;
      markRecycleDialog();
    });
  return recycleJob;
}

function markRecycleDialog() {
  if (!location.pathname.startsWith('/jeu')) return;
  const parts = recycleParts();
  if (!parts) {
    recycleIntent = 'none';
    recyclePrepared = null;
    return;
  }
  const { dialog, rows } = parts;
  const mode = sparesMode(dialog);
  let bar = dialog.querySelector('.aqm-recycle-bar');
  if (bar) bar.hidden = !mode;
  if (!mode || !rows.length) return;
  settleRows(rows);
  if (recyclePrepared !== dialog) prepareRecycle(dialog);
  let btn = bar?.querySelector('.aqm-recycle-all');
  if (!btn) {
    btn = h('button', { type: 'button', class: 'aqm-queue-btn aqm-recycle-all', onclick: toggleRecycle });
    bar = h('div', { class: 'aqm-root aqm-recycle-bar' }, btn);
    rows[0].row.parentElement.before(bar);
  }
  // (tout est coché quand le bouton du jeu compte tous les doublons, ou chaque ligne sans son nombre)
  const count = recycleCount(dialog);
  const all = count != null && mode.total != null ? count > 0 && count >= mode.total : rows.every((r) => isTicked(r.box));
  const label = recycleJob ? 'Préparation de la liste…' : all ? 'Tout désélectionner' : 'Tout sélectionner';
  if (btn.textContent !== label) btn.textContent = label;
  btn.disabled = !!recycleJob;
}

// Coche chaque ligne, ou les décoche toutes quand elles le sont toutes ; les lignes chargées ensuite suivent.
async function toggleRecycle() {
  let parts = recycleParts();
  if (!parts) return;
  await prepareRecycle(parts.dialog);
  parts = recycleParts();
  if (!parts) return;
  const mode = sparesMode(parts.dialog) ?? { total: null };
  const count = recycleCount(parts.dialog);
  const all = count != null && mode.total != null ? count > 0 && count >= mode.total : parts.rows.every((r) => isTicked(r.box));
  recycleIntent = all ? 'none' : 'all';
  for (const r of parts.rows) if (isTicked(r.box) !== (recycleIntent === 'all')) r.box.click();
  setTimeout(markRecycleDialog, 50);
}
