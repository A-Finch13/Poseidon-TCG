// Aquaman, code de la page : collection, l'onglet « Manquantes ».

// ---------- collection : un onglet « Manquantes » à côté de « Mes cartes / Mes doublons / Album complet » ----------
// Il montre l'album complet avec seulement les cartes marquées « Manquante » par le jeu ; le choix est gardé pour
// l'onglet.

// Seulement avec « Album complet ». Gardé pour l'onglet : de retour sur la collection (après un achat depuis la page
// d'une carte, qui recharge la page…), « Album complet » est choisi de nouveau et le filtre reprend.
// Le compte par rareté et les cartes ajoutées sont relus 2 minutes au plus tard (MISSING_FRESH), et tout de suite après
// un changement de la collection (un achat, un échange, un booster).
const MISSING_FRESH = 2 * 60e3;
function forgetMissing() {
  if (missingCounts) missingCounts.at = 0;
  if (missingExtra) missingExtra.at = 0;
}

const VIEW_TABS = /^(mes cartes|mes doublons|album complet)$/i;
// Les onglets de vue du jeu : des boutons, des liens (?vue=album) ou des boutons radio, selon ses versions.
const VIEW_TAB_TAGS = 'button, a, [role="radio"], [role="tab"]';
const tabText = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const viewTabs = () => [...document.querySelectorAll(VIEW_TAB_TAGS)].filter((b) => !b.closest('.aqm-root') && !b.classList.contains('aqm-missing-tab') && VIEW_TABS.test(tabText(b)) && !b.parentElement?.closest(VIEW_TAB_TAGS));
// L'onglet choisi : celui que le jeu marque comme tel, sinon celui dont l'aspect diffère des autres.
function pickedTab(tabs) {
  const marked = tabs.find((b) => ['aria-checked', 'aria-selected', 'aria-pressed'].some((a) => b.getAttribute(a) === 'true') || b.hasAttribute('aria-current') || b.getAttribute('data-state') === 'active');
  if (marked) return marked;
  const looks = tabs.map((b) => b.className);
  return tabs.length > 2 ? tabs.find((b) => looks.filter((c) => c === b.className).length === 1) : null;
}
const MISSING_KEY = 'aqm-missing-only';
let missingOn = (() => {
  try {
    return sessionStorage.getItem(MISSING_KEY) === '1';
  } catch {
    return false;
  }
})();
let missingAt = 0; // quand il a été activé : le jeu met un moment à afficher « Album complet »
let missingVisit = -1; // la visite de la page où « Album complet » a été remis
const missingOnly = () => missingOn;
const setMissingOnly = (on) => {
  missingOn = on;
  missingAt = on ? Date.now() : 0;
  filteredSize = -1;
  try {
    on ? sessionStorage.setItem(MISSING_KEY, '1') : sessionStorage.removeItem(MISSING_KEY);
  } catch {}
};

// Un onglet du jeu choisi par le joueur : le filtre s'arrête.
let clickingFull = false;
onStart(() => {
  addEventListener(
    'click',
    (e) => {
      const b = e.target.closest?.(VIEW_TAB_TAGS);
      if (!b || clickingFull || b.closest('.aqm-root') || b.classList.contains('aqm-missing-tab') || !VIEW_TABS.test(tabText(b))) return;
      setMissingOnly(false);
      setTimeout(markMissingTab, 50);
    },
    true
  );
});

function markMissingTab() {
  if (!location.pathname.startsWith('/jeu/collection')) return;
  const tabs = viewTabs();
  const full = tabs.find((b) => /^album complet$/i.test(tabText(b)));
  if (!full) return;
  const selected = pickedTab(tabs) ?? full;
  // Le filtre gardé, à une nouvelle visite de la page : « Album complet » est choisi de nouveau (une fois par visite).
  if (missingOn && missingVisit !== pageVisit) {
    missingVisit = pageVisit;
    missingAt = Date.now();
    if (selected !== full) {
      clickingFull = true;
      full.click();
      clickingFull = false;
    }
  }
  if (missingOn && selected !== full && Date.now() - missingAt > 2000) setMissingOnly(false); // une autre vue du jeu
  const on = missingOnly();
  const plain = tabs.find((b) => b !== selected) ?? full;
  // L'onglet d'Aquaman : reconnu par sa classe, ou par sa marque (une propriété de l'élément, qui reste même si ses
  // classes lui sont retirées). Un onglet vide laissé par une version précédente (sans classe ni texte) est retiré.
  const group = full.parentElement;
  const ours = [...group.children].filter((el) => el.__aqmMissingTab || el.classList.contains('aqm-missing-tab'));
  let tab = ours[0] ?? null;
  for (const el of [...ours.slice(1), ...group.querySelectorAll(':scope > button:not([role]):not([class])')]) if (el !== tab && !el.textContent.trim()) el.remove();
  if (!tab) {
    tab = h('button', {
      type: 'button',
      class: `${plain.className} aqm-missing-tab`,
      onclick: () => {
        const now = !missingOnly();
        setMissingOnly(now);
        if (now && selected !== full) {
          clickingFull = true; // pas un choix du joueur : le filtre reste
          full.click();
          clickingFull = false;
        }
        markMissingTab();
      }
    }, 'Manquantes');
    tab.__aqmMissingTab = true;
    full.after(tab);
  }
  fitTabs(full.parentElement, tab, full);
  // Le jeu montre son onglet sélectionné avec une pastille dedans (une boîte posée sur l'onglet) : tant que le filtre
  // est actif, la pastille de « Album complet » est cachée et « Manquantes » en reçoit une pareille.
  // (ou un seul cadre qui glisse sous l'onglet choisi, posé à côté des onglets)
  const slider = [...full.parentElement.children].find((el) => !tabs.includes(el) && el !== tab && !el.closest('.aqm-root') && getComputedStyle(el).position === 'absolute');
  const pill = [...full.querySelectorAll('*')].find((el) => getComputedStyle(el).position === 'absolute') ?? (selected === full ? slider : null);
  if (slider && slider !== pill) slider.toggleAttribute('data-aqm-pill-off', on);
  // (ou le fond de l'onglet lui-même, quand le jeu colore le bouton directement)
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
  showMissingSummary(full.parentElement, on);
  showMissingExtras(on);
}

// ---------- les cartes manquantes que le jeu ne montre pas ----------
// La vue « Album complet » lit les cartes d'une rareté (ou de tout le jeu) en une requête, que le jeu ne renvoie pas
// en entier : des cartes manquantes n'y sont jamais. Avec le filtre « Manquantes », Aquaman ajoute à la suite celles
// qu'il connaît (lues série par série, voir missingCards) et que le jeu n'a pas renvoyées, avec l'aspect de ses
// tuiles, une fois toute la liste du jeu affichée.
let cardsShown = null; // { query, ids: Set, names: Map id -> [nom, série] } : la dernière réponse /cards de la page
let missingExtra = null; // { key, at, cards, pending } : la dernière réponse d'Aquaman pour ces filtres
let extraAsking = null;
let extraAskedAt = 0;
onStart(() =>
  addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    // (seulement la réponse de la vue affichée : dans le script, les lectures d'Aquaman série par série passent aussi par
    // la page)
    if (e.data?.aquaman === 'cards-shown' && Array.isArray(e.data.ids) && sameQuery(String(e.data.query ?? ''), pageFilter())) {
      cardsShown = { query: String(e.data.query ?? ''), ids: new Set(e.data.ids), names: new Map((e.data.names ?? []).filter((x) => Array.isArray(x)).map(([id, name, series]) => [id, [String(name ?? ''), String(series ?? '')]])) };
      markMissingTab();
    }
  })
);

// Les filtres de la page (son adresse : ?serie=&rarete=&type=&q=&vue=album), comme le jeu les envoie à /cards.
function pageFilter() {
  const p = new URLSearchParams(location.search);
  return { album: p.get('vue') === 'album', manga: p.get('serie') || '', rarity: p.get('rarete') || '', kind: p.get('type') || '', q: (p.get('q') || '').trim().slice(0, 80) };
}
const sameQuery = (query, f) => {
  const p = new URLSearchParams(query);
  return !p.has('owned') && (p.get('manga') || '') === f.manga && (p.get('rarity') || '') === f.rarity && (p.get('type') || '') === f.kind && (p.get('q') || '') === f.q;
};

function askMissingExtra(f, key) {
  if (extraAsking || Date.now() - extraAskedAt < 10e3) return;
  extraAskedAt = Date.now();
  extraAsking = (async () => {
    // (la première fois, les séries sont lues 60 par 60 : redemandé tant qu'il en reste)
    for (let tries = 0; tries < 10 && !stopped; tries++) {
      const r = await ask({ type: 'missing-cards', rarity: f.rarity, kind: f.kind, q: f.q, manga: f.manga });
      missingExtra = { key, at: Date.now(), cards: r.cards ?? [], pending: r.pending ?? 0 };
      markMissingTab();
      if (!(r.pending > 0) || key !== JSON.stringify(pageFilter())) break;
    }
  })()
    .catch(() => {})
    .finally(() => (extraAsking = null));
}

function showMissingExtras(on) {
  const page = document.querySelector('main') ?? document.body;
  const old = page.querySelector('.aqm-missing-extra');
  const f = pageFilter();
  const key = JSON.stringify(f);
  const clear = () => old?.remove();
  if (!on || !f.album) return clear();
  if (!missingExtra || missingExtra.key !== key || Date.now() - missingExtra.at > MISSING_FRESH) askMissingExtra(f, key);
  if (!cardsShown || !sameQuery(cardsShown.query, f) || missingExtra?.key !== key) return clear();
  // Les listes de cartes du jeu, et seulement une fois qu'il les a toutes affichées (il les ajoute 48 par 48).
  const links = [...page.querySelectorAll('a[href^="/jeu/carte/"]')].filter((a) => !a.closest('.aqm-root'));
  const lists = [...new Set(links.map((a) => a.closest('ul')).filter(Boolean))];
  if (!lists.length || links.length < cardsShown.ids.size) return clear();
  const extras = missingExtra.cards.filter((c) => !cardsShown.ids.has(c.id));
  if (!extras.length) return clear();
  const sig = `${key}|${extras.map((c) => c.id).join(',')}`;
  const last = lists[lists.length - 1];
  if (old?.dataset.sig === sig && old.previousElementSibling === last) return;
  // Une tuile du jeu par rareté, pour modèle (celle de la même rareté : sa couleur et son étiquette).
  const tileOf = (a) => a.closest('li');
  const models = {};
  for (const a of links) {
    const label = a.getAttribute('aria-label') ?? '';
    const code = Object.keys(RARITY_NAMES).find((c) => label.includes(`, ${RARITY_NAMES[c]}`));
    const id = a.getAttribute('href').split('/').pop();
    if (code && !models[code] && cardsShown.names.has(id) && tileOf(a)) models[code] = { li: tileOf(a), id };
  }
  const box = h(
    'div',
    { class: 'aqm-root aqm-missing-extra', 'data-sig': sig },
    h('p', { class: 'aqm-missing-extra-note' }, `${fmt(extras.length)} carte${extras.length > 1 ? 's' : ''} manquante${extras.length > 1 ? 's' : ''} que le jeu n’affiche pas ici, ajoutée${extras.length > 1 ? 's' : ''} par Aquaman`),
    h('ul', { class: last.className }, extras.map((c) => missingTile(c, models[c.rarity] ?? Object.values(models)[0], cardsShown.names)))
  );
  old?.remove();
  last.after(box);
}

// Une tuile copiée de celle du jeu (li > a[href=/jeu/carte/…] > la carte, puis l'étiquette « Manquante »), remplie avec
// la carte : son lien, son image, son nom et sa série. Sans modèle, une tuile simple.
function missingTile(c, model, names) {
  const href = `/jeu/carte/${encodeURIComponent(c.id)}`;
  const label = `${c.name}, ${RARITY_NAMES[c.rarity] ?? c.rarity}, pas encore obtenue`;
  if (!model) return h('li', {}, h('a', { href, 'aria-label': label, class: 'aqm-missing-plain' }, h('img', { src: cardImageUrl(c.image), alt: c.name, loading: 'lazy' }), h('span', {}, c.name)), h('p', { class: 'aqm-muted' }, 'Manquante'));
  const li = bareCopy(model.li);
  li.querySelectorAll('.aqm-sale').forEach((el) => el.remove()); // (« En vente » de la carte modèle : relu pour celle-ci)
  const a = li.querySelector('a');
  if (a) {
    a.setAttribute('href', href);
    a.setAttribute('aria-label', label);
  }
  const img = li.querySelector('img');
  if (img) {
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.src = cardImageUrl(c.image);
    img.alt = c.name;
    img.loading = 'lazy';
  }
  // (le nom et la série du modèle, écrits dans la carte : remplacés par ceux de la carte)
  const [name, series] = names.get(model.id) ?? [];
  const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim();
    if (name && t === name) n.textContent = c.name;
    else if (series && t === series) n.textContent = c.series;
  }
  // L'étiquette sous la carte : « Manquante » (et « 12/50 » pour une carte à tirage limité).
  const tag = [...li.querySelectorAll('p')].find((p) => /^(manquante|[×x]\s*\d+)/i.test(p.textContent.trim()));
  if (tag) tag.replaceChildren(h('span', { class: 'text-zinc-600' }, 'Manquante'), ...(c.maxCopies ? [h('span', { class: 'text-zinc-500' }, `${c.minted ?? 0}/${c.maxCopies}`)] : []));
  return li;
}

// ---------- le compte des cartes manquantes par rareté, sous les onglets ----------
// « 70 N · 293 R · … · 948 au total » : les mêmes comptes que « Ma progression » (série par série, gardés sur
// l'appareil), sans avoir à faire défiler tout l'album, que le jeu affiche par morceaux.
let missingCounts = null; // { at, byRarity, pending }
let missingAsking = null;
let missingAskedAt = 0;
function askMissingCounts() {
  // (une demande à la fois, et 15 s au moins entre deux : un jeu qui refuse n'est pas redemandé à chaque passage)
  if (missingAsking || Date.now() - missingAskedAt < 15e3) return;
  missingAskedAt = Date.now();
  missingAsking = (async () => {
    // (la première fois, les séries sont comptées 40 par 40 : redemandé tant qu'il en reste)
    for (let tries = 0; tries < 15 && !stopped; tries++) {
      const counts = await ask({ type: 'rarity-counts' });
      missingCounts = { at: Date.now(), byRarity: counts.byRarity, pending: counts.pending, counted: counts.counted, series: counts.series };
      markMissingTab();
      if (!(counts.pending > 0) || counts.failed) break;
    }
  })()
    .catch(() => {})
    .finally(() => (missingAsking = null));
}
// (relu après un changement de la collection : un achat, un échange, un booster, sur n'importe quelle page du jeu)
onStart(() =>
  addEventListener('message', (e) => {
    if (e.source === window && e.data?.aquaman === 'collection-stale') forgetMissing();
  })
);

// Sur sa propre ligne, sous la rangée du jeu qui porte les onglets (rareté et vues), au-dessus des types.
function showMissingSummary(row, on) {
  const bar = row?.parentElement;
  let box = bar?.parentElement?.querySelector(':scope > .aqm-missing-summary');
  if (!on) {
    if (box) box.hidden = true;
    return;
  }
  if (!bar?.parentElement) return;
  if (!box) {
    box = h('div', { class: 'aqm-root aqm-missing-summary', role: 'status' });
    bar.after(box);
  }
  box.hidden = false;
  if (!missingCounts || Date.now() - missingCounts.at > MISSING_FRESH) askMissingCounts();
  const sig = JSON.stringify(missingCounts);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  if (!missingCounts) return void box.replaceChildren('Comptage des cartes manquantes…');
  const rows = Object.entries(missingCounts.byRarity ?? {})
    .map(([code, r]) => [code, Math.max(0, (r.total || 0) - (r.owned || 0))])
    .filter(([, n]) => n > 0);
  const sum = rows.reduce((n, [, m]) => n + m, 0);
  box.replaceChildren(
    ...[
      h('span', { class: 'aqm-label' }, 'Manquantes'),
      ...rows.map(([code, n]) => h('span', { class: 'aqm-missing-count' }, h('strong', {}, fmt(n)), rarityCode(code))),
      h('span', { class: 'aqm-missing-count is-total' }, h('strong', {}, fmt(sum)), 'au total'),
      missingCounts.pending > 0 ? h('small', { class: 'aqm-muted' }, `(comptage : ${fmt(missingCounts.counted)} séries sur ${fmt(missingCounts.series)}…)`) : null
    ].filter(Boolean) // (replaceChildren écrirait « null »)
  );
}
// Le groupe d'onglets du jeu peut être une grille d'autant de colonnes que ses onglets (3) : « Manquantes » irait sur
// une 2e ligne, coupée par le cadre arrondi. La grille reçoit une colonne de plus ; un groupe en ligne qui ne passe pas
// à la ligne reste sur une seule ligne.
function fitTabs(group, tab, full) {
  if (!group) return;
  const cs = getComputedStyle(group);
  if (cs.display.includes('grid')) {
    const count = [...group.children].filter((el) => el === tab || el.getAttribute('role') === 'radio' || el.matches('button, a')).length;
    const cols = `repeat(${count}, minmax(0, auto))`;
    if (group.style.gridTemplateColumns !== cols) group.style.gridTemplateColumns = cols;
  } else if (Math.abs(tab.getBoundingClientRect().top - full.getBoundingClientRect().top) > 4) {
    group.style.flexWrap = 'nowrap';
  }
}
let pillLook = null; // la pastille du jeu de l'onglet sélectionné : sa couleur, son arrondi, son ombre
let plainColor = '';
let pickedColor = '';

// Cache les cartes de l'album que le joueur possède (leur étiquette est « × N »), et les séries qui n'en gardent
// aucune.
// Refait seulement quand le contenu de la page a changé (son nombre d'éléments), l'album peut contenir des milliers de
// cartes.
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
  // L'étiquette sous chaque carte : « Manquante », ou « × 1 » (parfois en plusieurs morceaux de texte) : l'élément le
  // plus intérieur dont tout le texte le dit.
  const LABEL = /^(manquante|[×x]\s*\d+)$/i;
  const says = (el) => LABEL.test(el.textContent.replace(/\s+/g, ' ').trim());
  const page = document.querySelector('main') ?? document.body;
  const labels = [...page.querySelectorAll('*')].filter((el) => el.childElementCount < 4 && !el.closest('.aqm-root') && says(el) && ![...el.children].some(says));
  // Combien d'étiquettes contient chaque boîte, pour trouver la tuile de chaque carte : la boîte la plus haute autour
  // de son étiquette qui n'en contient pas d'autre, dans la page. Une étiquette seule (une série d'une carte affichée)
  // est contenue seule par chaque boîte jusqu'à la page : sa tuile est alors la boîte autour de son image, avec les
  // boîtes qui n'entourent qu'elle.
  const held = new Map();
  for (const label of labels) for (let el = label; el; el = el.parentElement) held.set(el, (held.get(el) ?? 0) + 1);
  document.querySelectorAll('[data-aqm-owned-card]').forEach((el) => el.removeAttribute('data-aqm-owned-card'));
  for (const label of labels) {
    let tile = label;
    for (let up = tile.parentElement; up && up !== page && held.get(up) === 1; up = tile.parentElement) {
      if (labels.length === 1 && tile.querySelector('img') && up.childElementCount > 1) break;
      tile = up;
    }
    // (une étiquette seule, pas une carte : pas d'image)
    tile.toggleAttribute('data-aqm-owned-card', tile !== label && !!tile.querySelector('img') && !/^manquante$/i.test(label.textContent.trim()));
  }
}
