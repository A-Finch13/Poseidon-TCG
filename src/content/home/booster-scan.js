// Aquaman, code de la page : le relevé par l'auteur de chaque sorte de booster, et l'ouverture depuis une pile copiée.

// ---------- le relevé par l'auteur de chaque sorte de booster ----------
// Sur l'accueil, le jeu dessine sa pile pour des boosters fabriqués de chaque sorte (les classiques et chaque sorte que
// vend la boutique) : les dessins sont publiés sur le relais, pour que chaque Aquaman les montre sans rien dessiner.

const SCAN_KEY = 'aqm-scan-packs';
const SHOP_KEY = 'aqm-scan-shop'; // les packs de la boutique lus avant l'accueil : [[kind, { html, w, h }], …]
const onShop = () => /^\/jeu\/boutique\/?$/.test(location.pathname);

// Le relevé commence dans la boutique (le site interdit de charger ses pages dans un cadre), puis continue sur
// l'accueil.
function startScan() {
  if (onShop()) return void scanShop();
  try {
    sessionStorage.setItem(SCAN_KEY, 'shop');
  } catch {}
  location.href = '/jeu/boutique';
}

// Le relevé reprend une fois la boutique, puis l'accueil, affichés.
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

// Le dessin de chaque pack que vend la boutique, gardé pour le relevé de l'accueil.
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

// Les packs de la boutique lus par scanShop (une fois).
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
  const frames = {}; // forme -> une pile dessinée par le jeu : { pile, buttons }, où vont les packs de la boutique
  const themed = {}; // forme -> une pile à thème dessinée par le jeu : { pile, buttons, art, name }
  let themedPack = null; // un booster à thème dessiné par le jeu : { style, html, art, name }
  let shop = [];
  try {
    try {
      shop = (await ask({ type: 'pack-kinds' })).kinds;
    } catch (e) {
      status.textContent = e.message;
    }
    // D'abord les boosters du joueur : le jeu ne dessine bien un booster qu'à partir de son vrai id. Chaque sorte est
    // dessinée avec autant de ses boosters que le joueur en a (1, 2, 3 et plus) : les formes des piles. Les packs de la
    // boutique viennent après, dans ces piles.
    const mine = boosterKinds().map((k) => ({ ...k, kind: k.key, ids: (pendingBoosters ?? []).filter((b) => (b.kind ?? 'classic') === k.key).map((b) => b.id) }));
    const kinds = mine;
    const all = kinds.map((k) => ({ key: k.kind, art: k.art }));
    for (const [i, k] of kinds.entries()) {
      const line = h('li', {}, h('strong', {}, k.name ?? k.kind), ' : ');
      list.append(line);
      const kind = { key: k.kind, art: k.art };
      const drawn = [];
      // La pile telle que le jeu la dessine avec 1, 2, et 3 boosters et plus (son éventail, son « Tout ouvrir »).
      for (const n of SHAPES) {
        if (k.ids.length < n) break; // pas assez de cette sorte pour cette forme
        status.textContent = `Dessin de ${k.name ?? k.kind} avec ${n} booster${n > 1 ? 's' : ''} (${i + 1}/${kinds.length})…`;
        const items = k.ids.slice(0, n).map((id) => ({ id }));
        if (!(await showKind('', true, false, items))) break;
        hideHome();
        let right = false;
        for (let t = 0; t < 84 && !(right = pileShows(findHomeParts()?.pile, kind, all)); t++) await pause(60);
        if (right) await pause(400).then(pileStill); // (le fondu du jeu des vagues vers l'image du pack)
        const parts = findHomeParts();
        if (!parts || !pileShows(parts.pile, kind, all)) continue;
        const buttons = copyOf(parts.buttons).outerHTML;
        packs[shapeKey(k.kind, n)] = { v: SHOTS_V, pile: copyOf(parts.pile).outerHTML, buttons, many: hasAllButton(parts.buttons) ? buttons : null, name: k.name, art: k.art };
        // La pile du jeu avec n boosters : le cadre des packs de la boutique plus bas (chacune de ses boîtes prend
        // celle du pack).
        if (!frames[n] || k.kind === 'classic') frames[n] = { pile: packs[shapeKey(k.kind, n)].pile, buttons };
        // Un booster à thème dessiné par le jeu : le modèle de tous les autres packs à thème (seuls son image et son
        // nom changent).
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
    await showKind('', false, true); // retour aux boosters du joueur
    await unveilTitle(title);
    drawing = false;
    scanning = false;
  }

  // Les packs de la boutique (chaque sorte qu'elle vend, possédée ou non), chacun mis dans les piles du jeu de 1, 2 et
  // 3+ boosters : pour les sortes et les formes que les boosters du joueur n'ont pas pu donner.
  // Les autres packs à thème (ceux de la boutique, et les formes que les boosters du joueur n'ont pas pu donner) : les
  // piles sont les mêmes pour chaque pack à thème, seuls l'image et le nom changent. Une pile à thème dessinée par le
  // jeu est copiée avec ces deux-là changés ; pour une forme qu'il n'a pas donnée, son booster à thème va dans la pile
  // du jeu de cette forme. Sans aucun booster à thème du joueur, les packs de la boutique sont lus sur la page de la
  // boutique.
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
      if (packs[shapeKey(k.kind, n)]) continue; // dessiné par le jeu à partir des boosters du joueur
      // Le pack de la boutique dans la pile du jeu de cette forme ; sinon (un pack que la page de la boutique ne montre
      // pas) une pile à thème dessinée par le jeu, avec l'image et le nom du pack.
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
  // Une fois le relevé fini, fermer sa fenêtre recharge la page (le jeu et les piles repartent de zéro), après la
  // publication si elle est encore en cours.
  let publishing = Promise.resolve();
  if (overlay?.contains(body)) overlayClosed = () => publishing.finally(() => location.reload());
  const n = Object.keys(packs).length; // un par sorte et par forme
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

// Un booster d'une pile dessinée par le jeu : sa boîte ({ style, html }, les faces dedans), avec l'image et le nom de
// sa sorte.
function packOf(pile, k) {
  const box = packBoxes(pile)[0];
  return box ? { style: box.getAttribute('style') ?? '', html: copyOf(box).innerHTML, art: k.art, name: k.name } : null;
}

// Un dessin à thème fait pour un autre pack : l'image du modèle (from.art) devient celle du pack (k.art), et son nom
// (from.name, tel que le jeu l'écrit) devient celui du pack.
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

// Une pile dessinée par le jeu avec un autre pack dans chacune de ses boîtes (design : { style, html }) ; son éventail,
// ses inclinaisons et son nombre restent. Null quand la pile n'a pas de boîte.
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

// La page de la boutique (affichée) : la boîte du pack de chaque sorte ({ style, html }), trouvée par son image ou son
// titre.
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
    if (found.size && t > 40) break; // les sortes restantes ne sont pas dans la boutique
  }
  return found;
}

// Le titre « N à ouvrir » reste caché jusqu'à ce que le nombre du jeu (qu'il anime) soit revenu à tous les boosters.
async function unveilTitle(title) {
  // (le nombre de boosters tel qu'inject.js l'a écrit en dernier : il peut changer entre-temps, après une ouverture)
  const all = () => {
    try {
      return JSON.parse(document.documentElement.getAttribute('data-aqm-boosters') || '[]').length;
    } catch {
      return (pendingBoosters ?? []).length;
    }
  };
  for (let t = 0; t < 40 && title?.isConnected && !new RegExp(`^\\D*${all()}\\b`).test(title.textContent.trim()); t++) await pause(60);
  if (title) applyTitleCount(title, true); // affiché tout de suite avec le nombre de la sorte de devant
  title?.removeAttribute('data-aqm-veiled');
}

// Le titre « N à ouvrir » compte les boosters de la sorte au-devant de la roue (le jeu les compte tous). Gardé quand le
// jeu réécrit son nombre ; laissé au jeu pendant qu'il dessine une sorte ou en ouvre une, et avant que React ait pris
// la page en main (un texte changé avant ne correspondrait pas à ce qu'attend React).
let titleCount = null; // le nombre affiché, null : celui du jeu
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
  // Le premier texte qui commence par le nombre (« 8 », ou « 8 à ouvrir » d'un seul tenant).
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!/^\s*\d+/.test(t.nodeValue)) continue;
    const want = t.nodeValue.replace(/^(\s*)\d+/, `$1${titleCount}`);
    if (t.nodeValue !== want) t.nodeValue = want;
    return;
  }
}

// Le jeu dessine le pack 3D de sa fenêtre d'ouverture avec l'image classique quand il ouvre plusieurs boosters :
// pendant qu'Aquaman ouvre une sorte à thème, son image est écrite dans la page pour inject.js, qui la met à la place
// de celle du classique.
const OPENING_ART = 'data-aqm-opening-art';

async function openFromCopy(key, index) {
  if (drawing || opening) return;
  opening = true;
  const title = [...document.querySelectorAll('h1, h2, h3')].find((t) => !t.closest('.aqm-root') && /à ouvrir/i.test(t.textContent));
  title?.setAttribute('data-aqm-veiled', ''); // son nombre passe par celui de la sorte
  try {
    if (!(await showKind(key, true))) return;
    title?.removeAttribute('data-aqm-veiled'); // le jeu compte les boosters de la sorte qu'il ouvre
    const real = [...(findHomeParts()?.buttons.querySelectorAll('button') ?? [])][index];
    const art = boosterKinds().find((k) => k.key === key)?.art;
    if (art && siteUrl(art)) document.documentElement.setAttribute(OPENING_ART, art.split(/[?#]/)[0]);
    real?.click();
    // Le jeu ouvre (sa fenêtre s'affiche) : les copies sont redessinées une fois qu'il a fini.
    const started = Date.now();
    while (!stopped && (Date.now() - started < 1500 || gameBusy())) await pause(500);
    // Retour à tous les boosters, relus (ceux ouverts sont partis).
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
