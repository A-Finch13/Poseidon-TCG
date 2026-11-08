// Aquaman, code de la page : « Recycler des cartes », rien de coché au départ, et un bouton pour tout cocher.

// ---------- « Recycler des cartes » : rien de coché au départ, et un bouton pour tout cocher ----------

const RECYCLE_TITLE = /^recycler des cartes$/i;
const recycleSeen = new WeakSet(); // lignes déjà décochées une fois
let recycleOpened = 0; // quand la fenêtre a été trouvée ouverte

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

// Le nombre de cartes cochées, d'après le bouton « Recycler N · +X » du jeu (juste « Recycler » sans aucune) ; null
// s'il est inconnu.
function recycleCount(dialog) {
  const b = [...dialog.querySelectorAll('button')].find((x) => !x.closest('.aqm-root') && /^recycler\b/i.test(x.textContent.trim()));
  return b ? Number(b.textContent.trim().match(/^recycler\s+([\d\s  ]+)/i)?.[1]?.replace(/\s/g, '') || 0) : null;
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

function markRecycleDialog() {
  if (!location.pathname.startsWith('/jeu')) return;
  const parts = recycleParts();
  if (!parts) return void (recycleOpened = 0);
  if (!recycleOpened) recycleOpened = Date.now();
  const { dialog, rows } = parts;
  if (!rows.length) return;
  // Les lignes dessinées dans les premières secondes démarrent décochées ; ensuite, les choix du joueur restent.
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

// Coche chaque ligne, ou les décoche toutes quand elles le sont toutes.
function toggleRecycle() {
  const parts = recycleParts();
  if (!parts) return;
  // Avec le nombre du jeu : aucune ou toutes cochées, chaque ligne change ; entre les deux, les décochées.
  const count = recycleCount(parts.dialog);
  const all = count != null ? count > 0 && count >= parts.rows.length : parts.rows.every((r) => isTicked(r.box));
  if (count === 0 || all) for (const r of parts.rows) r.box.click();
  else for (const r of parts.rows) if (!isTicked(r.box)) r.box.click();
  setTimeout(markRecycleDialog, 50);
}
