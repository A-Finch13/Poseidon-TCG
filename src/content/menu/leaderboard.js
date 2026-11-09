// Aquaman, code de la page : le classement des amis, sur la page Classement du jeu.

// ---------- classement des amis ----------
// Sous l'en-tête de /jeu/classement : « Tous » (le classement du jeu) ou « Amis » (toi et tes amis, à la place du
// podium et du top). Le jeu (GET /leaderboard) donne son top 100, ta ligne et son barème (points par rareté) ; un ami
// hors du top a son score calculé comme le jeu le fait, depuis sa collection : chaque carte différente rapporte les
// points de sa rareté.
// À côté, le tri : « Points », « Cartes » et, entre amis, « Séries complètes » (les albums dont le badge est récupéré).
// « Tous » rangé par cartes : le top 100 du jeu (le jeu ne donne que lui) rangé par cartes, dans un tableau d'Aquaman
// à l'aspect du jeu (les lignes du jeu, à React, ne sont jamais déplacées).
// Les choix sont gardés pour l'onglet.

const BOARD_SCOPE_KEY = 'aqm-board-scope';
const BOARD_SORT_KEY = 'aqm-board-sort';
const stored = (key, ok, fallback) => {
  try {
    const v = sessionStorage.getItem(key);
    return ok.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};
let boardScope = stored(BOARD_SCOPE_KEY, ['all', 'friends'], 'all');
let boardSort = stored(BOARD_SORT_KEY, ['points', 'cards', 'series'], 'points');
// (les séries complètes ne se lisent que dans les collections : entre amis seulement)
const sortNow = () => (boardScope === 'all' && boardSort === 'series' ? 'points' : boardSort);
const SORT_UNIT = {
  points: ['point', 'points', 'pts'],
  cards: ['carte', 'cartes', 'cartes'],
  series: ['série complète', 'séries complètes', 'séries']
};
const unitOf = (n, sort = sortNow()) => SORT_UNIT[sort][n > 1 ? 1 : 0];
const saveChoice = (key, v) => {
  try {
    sessionStorage.setItem(key, v);
  } catch {}
};
const ROW_MODEL = 'section[aria-labelledby="top-title"] li[data-row]:not([data-me])';
const PODIUM_MODEL = 'section[aria-label="Podium"]';
const STATUS_MODEL = 'section[aria-labelledby="ma-place"]';
const GAME_SECTIONS = 'section[aria-label="Podium"], section[aria-labelledby="top-title"], section[aria-labelledby="ma-place"]';

function markGameBoard() {
  if (location.pathname !== '/jeu/classement') return;
  const title = [...document.querySelectorAll('main h1')].find((el) => /classement/i.test(el.textContent));
  const header = title?.closest('header');
  if (!header || header.closest('.aqm-root')) return;
  let bar = header.nextElementSibling?.classList.contains('aqm-board-scope') ? header.nextElementSibling : null;
  if (!bar) {
    bar = h('div', { class: 'aqm-root aqm-board-scope' });
    header.after(bar);
  }
  let box = bar.nextElementSibling?.classList.contains('aqm-friends-board') ? bar.nextElementSibling : null;
  if (!box) {
    box = h('section', { class: 'aqm-root aqm-friends-board', 'aria-label': 'Classement des amis' });
    bar.after(box);
  }
  // (le classement du jeu tel quel : « Tous » rangé par points ; sinon celui d'Aquaman, à sa place)
  const ours = boardScope === 'friends' || sortNow() !== 'points';
  const shown = `${boardScope}|${sortNow()}`;
  if (bar.dataset.shown !== shown) {
    bar.dataset.shown = shown;
    const pick = (key, set) => (v) => {
      set(v);
      saveChoice(key, v);
      markGameBoard();
      box.repaint?.();
      // (le jeu place ses lignes animées selon le défilement : remontrées, il les replace)
      if (boardScope === 'all' && sortNow() === 'points') requestAnimationFrame(() => dispatchEvent(new Event('resize')));
    };
    bar.replaceChildren(
      chips(
        [
          ['all', 'Tous'],
          ['friends', 'Amis']
        ],
        boardScope,
        pick(BOARD_SCOPE_KEY, (v) => (boardScope = v))
      ),
      h(
        'div',
        { class: 'aqm-board-sort', 'aria-label': 'Ranger par' },
        h('span', { class: 'aqm-muted' }, 'Ranger par'),
        chips(
          [['points', 'Points'], ['cards', 'Cartes'], ...(boardScope === 'friends' ? [['series', 'Séries complètes']] : [])],
          sortNow(),
          pick(BOARD_SORT_KEY, (v) => (boardSort = v))
        )
      )
    );
  }
  box.hidden = !ours;
  for (const s of document.querySelectorAll(GAME_SECTIONS)) if (s.hasAttribute('data-aqm-board-off') !== ours) s.toggleAttribute('data-aqm-board-off', ours);
  // (les données d'une portée sont lues une fois ; changer de tri ne fait que redessiner)
  if (ours && box.dataset.loaded !== boardScope) {
    box.dataset.loaded = boardScope;
    box.card?.remove();
    box.card = null;
    loadBoard(box, boardScope);
  }
  // « Ma place » d'Aquaman : à la place de celle du jeu, au même endroit (dans son en-tête).
  const card = box.card;
  if (card) {
    card.hidden = !ours;
    const status = document.querySelector(STATUS_MODEL);
    if (status && status.nextElementSibling !== card) status.after(card);
  }
  // (les lignes du jeu, modèles des nôtres, arrivées après le premier dessin)
  if (ours && box.repaint && !box.querySelector('.aqm-board-game') && document.querySelector(ROW_MODEL)) box.repaint();
}

// Une ligne du classement des amis, copiée d'une ligne du jeu (model : li[data-row] > a > [place, avatar, nom et
// barre, cartes et rares, score]) puis remplie : même aspect que le classement du jeu. Les marques du jeu (data-row,
// data-me…) sont retirées : ses animations et « Voir ma ligne » ne la prennent pas pour une des siennes.
const ME_LOOK = ['bg-gradient-to-r', 'from-blue-500/[0.18]', 'via-blue-500/[0.07]', 'to-transparent', 'hover:bg-blue-500/[0.06]'];
const PLAIN_LOOK = ['bg-white/[0.025]', 'hover:bg-white/[0.055]'];
const ME_BAR = ['from-sky-400', 'to-white'];
const PLAIN_BAR = ['from-blue-600', 'to-sky-400'];
// « Ma place » parmi les amis, copiée de celle du jeu (section > [deux halos, grille > [place, score, objectif]]) :
// ta place parmi tes amis, ton score, et l'ami à dépasser (« Plus que 10 points pour dépasser Cielle (3e), soit
// environ 4 nouvelles R. ») ; « Voir ma ligne » mène à ta ligne du classement des amis.
function statusCard(model, d) {
  const sec = bareCopy(model);
  sec.setAttribute('aria-labelledby', 'aqm-ma-place');
  sec.classList.add('aqm-friends-status');
  const grid = [...sec.children].find((el) => el.tagName === 'DIV');
  const [where, , chase] = grid?.children ?? [];
  const title = where?.querySelector('h2');
  if (title) {
    title.id = 'aqm-ma-place';
    const badge = title.querySelector('span');
    if (badge) badge.textContent = d.place === 1 ? 'N°1' : d.place <= 3 ? 'Podium' : d.badge;
  }
  const [, big, among] = where?.children ?? [];
  const num = big?.querySelector('span');
  if (num) num.textContent = fmt(d.place);
  const sup = big?.querySelector('sup');
  if (sup) sup.textContent = d.place === 1 ? 'er' : 'e';
  if (among) among.textContent = d.among;
  const text = chase?.querySelector('p');
  if (text) {
    const strong = (t) => h('span', { class: 'font-bold text-white' }, t);
    if (!d.target) text.replaceChildren(`${d.first}${d.lead > 0 ? ', avec ' : '.'}`, ...(d.lead > 0 ? [strong(`${fmt(d.lead)} ${unitOf(d.lead)}`), ' d’avance sur le 2e.'] : []));
    else text.replaceChildren('Plus que ', strong(`${fmt(d.gap)} ${unitOf(d.gap)}`), ' pour dépasser ', strong(d.target.name), ` (${d.target.place}e)`, d.need ? `, soit environ ${d.need}.` : '.');
  }
  const jump = chase?.querySelector('button');
  if (jump) {
    jump.replaceWith(jump.cloneNode(true));
    chase.querySelector('button').addEventListener('click', () => document.querySelector('.aqm-friends-board [data-aqm-me], .aqm-friends-podium')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
  return sec;
}

// Les cartes à tirer pour combler un écart de points, comme le dit le jeu : la plus petite rareté dont 5 cartes au plus
// suffisent (« 4 nouvelles R »), sinon en UR.
function cardsFor(gap, points) {
  for (const code of ['N', 'R', 'SR', 'SSR', 'UR', 'SEC']) {
    const per = Number(points?.[code]);
    if (!per) continue;
    const n = Math.ceil(gap / per);
    if (n <= 5) return `${n} nouvelle${n > 1 ? 's' : ''} ${code}`;
  }
  const ur = Number(points?.UR);
  return ur ? `${Math.ceil(gap / ur)} nouvelles UR` : null;
}

// Une copie d'un élément du jeu, sans ses marques (data-…) ni les styles posés par ses animations.
function bareCopy(model) {
  const copy = model.cloneNode(true);
  for (const el of [copy, ...copy.querySelectorAll('*')]) {
    el.removeAttribute('style');
    for (const a of [...el.attributes]) if (a.name.startsWith('data-')) el.removeAttribute(a.name);
  }
  return copy;
}

// Le podium des amis, copié de celui du jeu (section[aria-label="Podium"] > ol > un li par place : la carte avec la
// couronne ou la médaille, puis le lien avec l'avatar, le nom, le score et « Toi », puis la marche) : ses 3 places
// remplies avec les 3 premiers amis (spots : [{ id, me, name, score, title, card }]).
const TOI_CLASS = 'shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-200';
function gamePodium(model, spots) {
  const sec = bareCopy(model);
  sec.setAttribute('aria-label', 'Podium des amis');
  sec.classList.add('aqm-friends-podium');
  const places = [...(sec.querySelector('ol')?.children ?? [])];
  spots.forEach((d, i) => {
    const li = places[i];
    if (!li) return;
    const [spot, head] = li.children;
    // (la carte : la plus belle du joueur ; la couronne et la médaille, posées dessus, restent)
    const card = [...(spot?.children ?? [])].find((el) => !el.classList.contains('absolute'));
    const look = 'display:block;width:100%;aspect-ratio:63/88;border-radius:1rem;object-fit:cover';
    const art = d.card?.image
      ? h('img', { src: cardImageUrl(d.card.image), alt: d.card.name ?? '', title: d.card.name ? `Carte de ${d.name} : ${d.card.name}` : null, loading: 'lazy', style: look })
      : h('div', { class: 'aspect-[63/88] rounded-[1rem] bg-white/[0.04]', style: look });
    card ? card.replaceWith(art) : spot?.append(art);
    if (head?.tagName === 'A') head.setAttribute('href', `/profile/${encodeURIComponent(d.id)}`);
    if (!head) return;
    head.title = d.title;
    const [sr, who, score] = head.children;
    if (sr?.classList.contains('sr-only')) sr.textContent = `${i + 1}e : `;
    const img = who?.querySelector('img');
    if (img) {
      img.removeAttribute('srcset');
      img.src = avatarUrl(d.id);
    }
    const name = who?.lastElementChild;
    if (name) name.textContent = d.name;
    if (score?.firstElementChild) score.firstElementChild.textContent = d.score;
    setUnit(score, d.unit);
    [...head.children].slice(3).forEach((el) => el.remove());
    if (d.me) head.append(h('span', { class: 'mt-2' }, h('span', { class: TOI_CLASS }, 'Toi')));
  });
  return sec;
}

function gameRow(model, d) {
  const li = bareCopy(model);
  li.classList.add('aqm-friend-row');
  if (d.me) li.setAttribute('data-aqm-me', '');
  const a = li.querySelector('a') ?? li;
  if (a.tagName === 'A') a.setAttribute('href', `/profile/${encodeURIComponent(d.id)}`);
  a.classList.remove(...(d.me ? PLAIN_LOOK : ME_LOOK));
  a.classList.add(...(d.me ? ME_LOOK : PLAIN_LOOK));
  a.title = d.title;
  const [place, avatar, main, stats, score] = a.children;
  if (place) place.replaceChildren(...[...place.children].filter((el) => el.classList.contains('sr-only')), d.place);
  // (l'avatar du jeu : son image remplacée par celle du joueur, toujours lisible)
  const img = avatar?.querySelector('img') ?? (avatar?.tagName === 'IMG' ? avatar : null);
  if (img) {
    img.removeAttribute('srcset');
    img.src = avatarUrl(d.id);
    img.alt = '';
  } else if (avatar) avatar.replaceChildren(h('img', { src: avatarUrl(d.id), alt: '', style: 'width:100%;height:100%;object-fit:cover;border-radius:inherit' }));
  const nameRow = main?.firstElementChild;
  const name = nameRow?.firstElementChild;
  if (name) {
    name.textContent = d.name;
    nameRow.replaceChildren(name);
    if (d.me) nameRow.append(h('span', { class: TOI_CLASS }, 'Toi'));
  }
  const bar = main?.lastElementChild?.firstElementChild;
  if (bar) {
    bar.style.width = `${d.width.toFixed(1)}%`;
    bar.classList.remove(...(d.me ? PLAIN_BAR : ME_BAR));
    bar.classList.add(...(d.me ? ME_BAR : PLAIN_BAR));
  }
  if (stats) stats.replaceChildren(...d.lines.flatMap((t, i) => (i ? [document.createElement('br'), t] : [t])));
  const value = score?.firstElementChild;
  if (value) value.textContent = d.score;
  setUnit(score, d.unit);
  return li;
}

// L'unité écrite après le nombre dans une copie du jeu (« pts ») : celle du tri choisi.
function setUnit(score, unit) {
  if (!score || !unit) return;
  const label = [...score.querySelectorAll('*')].find((el) => !el.children.length && /^\s*pts?\s*$/i.test(el.textContent));
  if (label) label.textContent = unit;
  else {
    // (« pts » écrit dans le même élément que le nombre)
    const node = [...score.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && /pts?/i.test(n.textContent));
    if (node) node.textContent = node.textContent.replace(/pts?/i, unit);
  }
}

// Le classement du jeu, lu 2 minutes au plus.
let gameBoard = null; // { at, read: Promise }
function readGameBoard(force) {
  if (force || !gameBoard || Date.now() - gameBoard.at > 120e3) gameBoard = { at: Date.now(), read: gameWrite('/leaderboard', 'GET') };
  return gameBoard.read;
}

// Le tableau d'Aquaman, pour une portée : « friends » (toi et tes amis : le score du jeu pour ceux de son top 100,
// calculé depuis leur collection pour les autres, et leurs séries complètes lues dans leur collection) ou « all » (le
// top 100 du jeu et toi). Rangé selon le tri choisi (sortNow), redessiné à chaque changement de tri sans relecture.
async function loadBoard(box, scope, force = false) {
  const id = (box.loadId = (box.loadId ?? 0) + 1);
  const current = () => box.isConnected && box.loadId === id;
  box.repaint = null;
  const friends = scope === 'friends';
  const status = h('p', { class: 'aqm-muted aqm-friends-note' }, friends ? 'Chargement de tes amis…' : 'Chargement du classement…');
  const podium = h('div', { class: 'aqm-friends-podium-box' });
  const list = h('ol', { class: 'aqm-board' });
  const foot = h('div', { class: 'aqm-board-refresh' });
  box.replaceChildren(status, podium, list, foot);
  let board;
  let mates = null;
  try {
    [board, mates] = await Promise.all([readGameBoard(force), friends ? ask({ type: 'friends' }) : null]);
  } catch (e) {
    if (current()) status.textContent = `Classement indisponible (${e.message}).`;
    return;
  }
  if (!current()) return;
  const points = board?.points ?? {};
  const topList = Array.isArray(board?.top) ? board.top : [];
  const top = new Map(topList.map((e) => [e?.player?.id, e]));
  const myId = friends ? mates.me : board?.me?.player?.id ?? null;
  const meEntry = board?.me?.player?.id && board.me.player.id === myId ? board.me : null;
  // Une ligne par joueur : celle du jeu quand il la donne (top 100, ou la tienne), sinon calculée.
  const people = friends
    ? [{ id: mates.me, me: true }, ...mates.friends]
    : [...topList.map((e) => ({ id: e?.player?.id, name: e?.player?.name })), ...(meEntry && !top.has(myId) ? [{ id: myId }] : [])].filter((p) => p.id).map((p) => ({ ...p, me: p.id === myId }));
  const rows = people.map((p) => {
    const official = top.get(p.id) ?? (p.me ? meEntry : null);
    return { ...p, name: official?.player?.name ?? p.name, image: official?.player?.image ?? null, official, state: official?.score != null ? 'ok' : 'loading' };
  });
  const note = () => {
    if (!friends) return `Le top 100 du jeu${meEntry && !top.has(myId) ? ' et toi' : ''}, rangé par nombre de cartes.`;
    if (mates.friendsError) return `Liste d'amis indisponible (${mates.friendsError}).`;
    if (!mates.friends.length) return "Tu n'as pas encore d'amis dans le jeu : ajoute-en depuis leur profil pour te comparer à eux.";
    const what = { points: 'les points du classement du jeu', cards: 'rangés par nombre de cartes', series: 'rangés par séries complètes (badge récupéré)' }[sortNow()];
    return `${mates.friends.length} ami${mates.friends.length > 1 ? 's' : ''} · ${what}.`;
  };

  // Les rares du jeu : le groupe de raretés dont le compte retrouve le tien (sinon, pas de rares pour les scores
  // calculés). Un score calculé qui retrouve celui du jeu pour toi est exact, sinon il est montré « ≈ ».
  let rareSet = null;
  let exact = false;
  const calibrate = (by) => {
    if (!meEntry || !by) return;
    rareSet = [['UR', 'SEC'], ['SSR', 'UR', 'SEC'], ['SR', 'SSR', 'UR', 'SEC']].find((set) => set.reduce((n, r) => n + (by[r] ?? 0), 0) === meEntry.rare) ?? null;
    exact = scoreOf(by) === meEntry.score;
  };
  const scoreOf = (by) => Object.entries(by ?? {}).reduce((n, [r, c]) => n + (Number(points[r]) || 0) * c, 0);
  const apply = (row, p) => {
    row.best = p.best ?? row.best ?? null; // (sa plus belle carte, pour le podium)
    if (!p.private && Number.isFinite(p.albums)) row.albums = p.albums; // (ses séries complètes : badges récupérés)
    if (row.official) {
      if (p.private) row.albumsHidden = true;
      return;
    }
    if (p.private) row.state = 'private';
    else if (!p.byRarity) row.state = 'error';
    else Object.assign(row, { state: 'ok', score: scoreOf(p.byRarity), cards: Object.values(p.byRarity).reduce((a, b) => a + b, 0), by: p.byRarity });
  };

  let frame = 0;
  const later = () => frame || (frame = requestAnimationFrame(() => ((frame = 0), paint())));
  const paint = () => {
    if (!current()) return;
    const sort = sortNow();
    status.textContent = note();
    const pointsOf = (r) => (r.state !== 'ok' ? null : r.official ? r.official.score : r.score);
    const cardsOf = (r) => (r.state !== 'ok' ? null : r.official ? r.official.cards : r.cards);
    const rareOf = (r) => (r.official ? r.official.rare : rareSet && r.by ? rareSet.reduce((n, k) => n + (r.by[k] ?? 0), 0) : null);
    // (la valeur du tri ; null tant qu'elle n'est pas connue : la ligne attend, sans place)
    const value = (r) => (sort === 'cards' ? cardsOf(r) : sort === 'series' ? (r.state === 'ok' && Number.isFinite(r.albums) ? r.albums : null) : pointsOf(r));
    const has = (r) => value(r) != null;
    const sorted = [...rows].sort((a, b) => has(b) - has(a) || (value(b) ?? 0) - (value(a) ?? 0) || (pointsOf(b) ?? -1) - (pointsOf(a) ?? -1) || String(a.name).localeCompare(String(b.name)));
    const leader = Math.max(1, ...sorted.map((r) => value(r) ?? 0));
    const approx = (r) => sort === 'points' && !r.official && !exact;
    const valueText = (r) => `${approx(r) ? '≈ ' : ''}${fmt(value(r))}`;
    const titleOf = (r) =>
      sort === 'series'
        ? 'Séries complètes : les albums dont le badge est récupéré'
        : r.official
          ? sort === 'cards'
            ? 'Cartes du classement du jeu'
            : 'Score du classement du jeu'
          : sort === 'cards'
            ? 'Cartes différentes, lues dans sa collection'
            : exact
              ? 'Calculé depuis sa collection, avec le barème du jeu'
              : 'Calculé depuis sa collection, avec le barème du jeu (peut différer un peu du jeu)';
    // Sous le nom : sa place au jeu et les autres chiffres que celui du tri.
    const linesOf = (r) => {
      const rare = rareOf(r);
      return [
        r.official?.rank ? `${fmt(r.official.rank)}e du jeu` : 'hors du top 100',
        sort !== 'points' ? `${pointsOf(r) != null && !r.official && !exact ? '≈ ' : ''}${fmt(pointsOf(r))} pts` : null,
        sort !== 'cards' ? `${fmt(cardsOf(r))} cartes` : null,
        sort !== 'series' && friends && Number.isFinite(r.albums) ? `${fmt(r.albums)} séries` : null,
        sort === 'points' && rare != null ? `${fmt(rare)} rares` : null
      ].filter(Boolean);
    };
    const waiting = (r) => (r.state === 'private' ? 'Collection privée' : r.state === 'error' ? 'Collection indisponible' : r.albumsHidden ? 'Collection privée' : 'Lecture…');
    // Les lignes du jeu (celles des places 4 à 10) servent de modèle : le classement d'Aquaman a leur aspect. Les 3
    // premiers montent sur un podium copié de celui du jeu, avec leur plus belle carte (celle du jeu pour son top 3).
    const model = document.querySelector(ROW_MODEL);
    const podiumModel = document.querySelector(PODIUM_MODEL);
    list.className = model ? `${model.parentElement.className} aqm-board-game` : 'aqm-board';
    const ranked = sorted.filter(has);
    const onPodium = model && podiumModel && ranked.length >= 3 ? ranked.slice(0, 3) : [];
    podium.replaceChildren(
      ...(onPodium.length
        ? [
            gamePodium(
              podiumModel,
              onPodium.map((r) => ({ id: r.id, me: !!r.me, name: r.name || 'Joueur', score: valueText(r), unit: SORT_UNIT[sort][2], title: titleOf(r), card: r.official?.best?.card ?? r.best ?? null }))
            )
          ]
        : [])
    );
    let place = onPodium.length;
    // « Ma place » (seulement quand le jeu montre la sienne, le joueur classé).
    const statusModel = document.querySelector(STATUS_MODEL);
    const mine = ranked.findIndex((r) => r.me);
    if (statusModel && mine >= 0) {
      const above = ranked[mine - 1];
      const gap = above ? value(above) - value(ranked[mine]) + 1 : 0;
      const card = statusCard(statusModel, {
        place: mine + 1,
        badge: friends ? 'Amis' : 'Cartes',
        among: friends ? `sur ${fmt(ranked.length)} avec tes amis` : `sur ${fmt(ranked.length)}, en cartes`,
        first: friends
          ? { points: 'Tu as la plus belle collection de tes amis', cards: 'Tu as le plus de cartes de tes amis', series: 'Tu as le plus de séries complètes de tes amis' }[sort]
          : 'Tu as le plus de cartes du top 100',
        target: above ? { name: above.name || 'Joueur', place: mine } : null,
        gap,
        need: above && sort === 'points' ? cardsFor(gap, points) : null,
        lead: ranked[1] && mine === 0 ? value(ranked[0]) - value(ranked[1]) : 0
      });
      card.hidden = box.hidden;
      box.card?.remove();
      box.card = card;
      statusModel.after(card);
    }
    if (model) {
      list.replaceChildren(
        ...sorted
          .filter((r) => !onPodium.includes(r))
          .map((r) => {
            const ok = has(r);
            if (ok) place++;
            return gameRow(model, {
              id: r.id,
              me: !!r.me,
              place: ok ? String(place) : '–',
              name: r.name || 'Joueur',
              width: ok ? Math.min(100, Math.max(1.5, (100 * value(r)) / leader)) : 0,
              lines: ok ? linesOf(r) : [waiting(r)],
              score: ok ? valueText(r) : '–',
              unit: SORT_UNIT[sort][2],
              title: titleOf(r)
            });
          })
      );
    } else
      list.replaceChildren(
        ...sorted.map((r) => {
          const ok = has(r);
          if (ok) place++;
          return h(
            'li',
            { class: `aqm-row${r.me ? ' is-me' : ''}`, ...(r.me ? { 'data-aqm-me': '' } : {}) },
            h('span', { class: `aqm-place aqm-place-${place}` }, ok ? String(place) : '–'),
            h('img', { class: 'aqm-avatar', src: r.image || avatarUrl(r.id), alt: '', loading: 'lazy' }),
            h(
              'div',
              { class: 'aqm-friend-main' },
              h('a', { class: 'aqm-name', href: `/profile/${encodeURIComponent(r.id)}` }, r.name || 'Joueur', r.me ? h('span', { class: 'aqm-tag' }, 'Toi') : null),
              h('small', { class: 'aqm-muted' }, ok ? linesOf(r).join(' · ') : waiting(r)),
              ok ? h('span', { class: 'aqm-bar' }, h('span', { style: `width:${((100 * value(r)) / leader).toFixed(2)}%` })) : null
            ),
            h('div', { class: 'aqm-friend-score', title: titleOf(r) }, ok ? h('strong', {}, valueText(r)) : null, ok ? h('small', {}, SORT_UNIT[sort][2]) : null)
          );
        })
      );
    const reading = rows.filter((r) => r.state === 'loading' || (friends && sort === 'series' && r.state === 'ok' && !Number.isFinite(r.albums) && !r.albumsHidden)).length;
    foot.replaceChildren(
      h(
        'span',
        { class: 'aqm-muted' },
        reading
          ? `Lecture de ${fmt(reading)} collection${reading > 1 ? 's' : ''}…`
          : friends
            ? 'Les amis hors du top 100 : score calculé depuis leur collection.'
            : 'Le jeu ne donne que son top 100 : les joueurs plus loin n’y sont pas.'
      ),
      h('button', { type: 'button', class: 'aqm-chip', disabled: reading ? true : null, onclick: () => loadBoard(box, scope, true) }, 'Actualiser')
    );
  };
  box.repaint = later;
  paint();

  // Les collections, 4 à la fois. Entre amis : la tienne (pour les rares et la vérification du score), celles des amis
  // hors du top (leur score), et celles de tous pour leur plus belle carte (le podium) et leurs séries complètes. Pour
  // « Tous » : seulement les 3 premiers en cartes sans carte du jeu, pour le podium. Celles lues il y a moins d'1 h (sur
  // cet appareil) sont reprises sans relecture, sauf « Actualiser ».
  let known = { fresh: 3600e3, players: {} };
  try {
    known = await ask({ type: 'board-known' });
  } catch {}
  if (!current()) return;
  const usable = (p) => p && (p.private || (p.byRarity && 'best' in p && 'albums' in p)) && Date.now() - p.at < (known.fresh ?? 3600e3);
  const todo = friends
    ? rows
    : [...rows]
        .sort((a, b) => (b.official?.cards ?? 0) - (a.official?.cards ?? 0))
        .slice(0, 3)
        .filter((r) => !r.official?.best?.card);
  for (const r of todo) {
    const p = known.players?.[r.id];
    if (!force && usable(p)) {
      if (r.me) calibrate(p.byRarity);
      apply(r, p);
    }
  }
  later();
  await eachLimited(
    todo.filter((r) => force || !usable(known.players?.[r.id])),
    4,
    async (row) => {
      if (!current()) return;
      try {
        const p = await ask({ type: 'player', id: row.id, fresh: force });
        if (row.me) calibrate(p.byRarity);
        apply(row, p);
      } catch {
        if (row.state === 'loading') row.state = 'error';
      }
      later();
    }
  );
  later();
}
