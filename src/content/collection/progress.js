// Aquaman, code de la page : collection, « Ma progression » et sa fenêtre.

// ---------- collection : « Ma progression » à côté du titre « Ta collection » ----------

// Le bouton se place à droite du titre du jeu, hors du flux de la page (absolu, dans le titre) : le titre garde sa
// largeur et les boutons du jeu (« Ma vitrine »…) leur place. Il a l'aspect de « Ma vitrine » (ses classes, celles de
// son icône, et les styles de texte que le titre lui donnerait sinon). Quand il n'y a pas de place à droite du titre
// (un écran étroit, les boutons du jeu dans le chemin), il va sous le titre à la place.
const statsTitle = () => [...document.querySelectorAll('main h1, h1')].find((el) => !el.closest('.aqm-root, .aqm-overlay') && /^\s*ta\s+collection/i.test(el.textContent));
const vitrineButton = () => [...document.querySelectorAll('main button, main a')].find((b) => !b.closest('.aqm-root, .aqm-overlay, .aqm-stats-open') && /^\s*ma vitrine\s*$/i.test(b.textContent));

function markCollectionStats() {
  if (!location.pathname.startsWith('/jeu/collection')) return;
  const shown = document.querySelector('.aqm-stats-open');
  // (replacé seulement quand le titre ou les boutons du jeu changent de taille : voir watchStatsPlace, aucune mesure
  // ici)
  if (shown?.isConnected && !shown.classList.contains('is-early')) return;
  const title = statsTitle();
  const vitrine = vitrineButton();
  if (!title || !vitrine) return;
  // Le bouton affiché par-dessus la page pendant son chargement (earlyStatsButton) va dans le titre, à la même place.
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

// Le bouton est replacé quand le titre ou la rangée des boutons du jeu change de taille (polices chargées, une fenêtre
// plus étroite…), et seulement à ce moment-là.
let statsWatch = null;
function watchStatsPlace(title) {
  statsWatch?.disconnect();
  statsWatch = new ResizeObserver(() => placeStatsButton());
  statsWatch.observe(title);
  const row = vitrineButton()?.parentElement;
  if (row) statsWatch.observe(row);
}

// Le bouton, avec l'aspect de « Ma vitrine » du jeu.
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
  // (dans le titre, le bouton prendrait sa grande police italique : il reçoit les styles de texte de « Ma vitrine »)
  const cs = getComputedStyle(vitrine);
  for (const p of ['font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height', 'text-transform', 'color'])
    btn.style.setProperty(p, cs.getPropertyValue(p));
  btn.style.setProperty('-webkit-text-fill-color', cs.getPropertyValue('color'));
  return btn;
}

// Pendant le chargement de la page, Aquaman n'y change rien (React ne trouverait pas ce qu'il attend : erreur #418) :
// le bouton est affiché tout de suite par-dessus la page (à la fin de <body>, que React laisse tranquille), à la place
// qu'il aura à côté du titre, et suit le titre jusqu'à ce que markCollectionStats l'y mette.
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
    earlyTimer = setInterval(follow, 250); // (la mise en page bouge pendant le chargement : polices, images)
  };
  look();
}
// En coordonnées de la page : à droite du titre, centré verticalement, sinon dessous (comme placeStatsButton).
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
  // (pas de place à droite du titre, un téléphone : le bouton va dans la rangée du jeu une fois la page prête, et ne
  // montre rien avant, jamais par-dessus le texte de la page)
  if (blocked || b.right > document.documentElement.clientWidth - 8) {
    stopEarlyStats();
    btn.remove();
  }
}

// À droite du titre quand il y tient, sinon dessous.
// À droite du titre quand il y tient ; sinon (un téléphone) au bout de la rangée de boutons du jeu, à côté de «
// Recycler mes doublons ». La place se calcule à partir des tailles seules, et le bouton ne bouge que quand elle change
// : son déplacement change la taille de la rangée, ce qui redemande (la même réponse, pas de boucle).
function placeStatsButton() {
  const btn = document.querySelector('.aqm-stats-open');
  if (!btn?.isConnected || btn.classList.contains('is-early')) return;
  const title = document.querySelector('[data-aqm-stats-title]');
  const row = vitrineButton()?.parentElement;
  if (!title) return;
  const t = title.getBoundingClientRect();
  const w = btn.offsetWidth;
  const hgt = btn.offsetHeight;
  const left = t.right + 20;
  const top = t.top + t.height / 2 - hgt / 2;
  const r = row?.getBoundingClientRect();
  const blocked = r && left + w + 8 > r.left && left < r.right && top < r.bottom && top + hgt > r.top;
  const fits = !blocked && left + w <= document.documentElement.clientWidth - 8;
  if (fits || !row) {
    if (btn.parentElement !== title) title.append(btn);
    btn.classList.remove('is-in-row');
    btn.classList.toggle('is-below', !fits);
  } else {
    if (btn.parentElement !== row) row.append(btn);
    btn.classList.remove('is-below');
    btn.classList.add('is-in-row');
  }
}
let statsResize = 0;
onStart(() => {
  addEventListener('resize', () => {
    clearTimeout(statsResize);
    statsResize = setTimeout(placeStatsButton, 150);
  });
});

// Une lecture de la collection toutes les 30 minutes sur les pages du jeu, et peu après un changement (un booster
// ouvert, un achat…) : les cartes gagnées chaque jour sont comptées même quand la fenêtre n'est jamais ouverte.
let snapAt = 0;
let snapTimer = 0;
function snapCollection(soon = false) {
  if (soon) {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      // (5 min au moins entre deux : une lecture télécharge toute la collection, plus de 1 Mo pour une grande)
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

  // Le chiffre principal : la part des cartes du jeu que le joueur possède.
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

  // Cartes de chaque rareté : cartes uniques possédées sur le total du jeu dans cette rareté, et les exemplaires.
  // Comptées série par série (la première fois, quelques centaines de séries : les lignes se remplissent pendant que la
  // fenêtre est ouverte).
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
  // Les séries pas encore comptées, RARITY_STEP à la fois, tant que la fenêtre est ouverte.
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
      if (counts.counted === before && counts.failed) break; // (le jeu refuse : réessayé à la prochaine ouverture)
    }
    if (view.isConnected && counts?.pending > 0) rarityNote.textContent = `Comptage arrêté à ${fmt(counts.counted)} séries sur ${fmt(counts.series)} : il reprendra à la prochaine ouverture.`;
  };

  // Les cartes gagnées chacun des 14 derniers jours (une barre par jour ; un jour sans lecture n'en a pas).
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
  const fromStart = first ? s.owned - (first.owned - first.gain) : 0; // depuis la première lecture gardée
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
