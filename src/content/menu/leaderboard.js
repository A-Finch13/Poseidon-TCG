// Aquaman, code de la page : le classement des amis, sur la page Classement du jeu.

// ---------- classement des amis ----------
// Sous l'en-tête de /jeu/classement : « Tous » (le classement du jeu) ou « Amis » (toi et tes amis, à la place du
// podium et du top). Le jeu (GET /leaderboard) donne son top 100, ta ligne et son barème (points par rareté) ; un ami
// hors du top a son score calculé comme le jeu le fait, depuis sa collection : chaque carte différente rapporte les
// points de sa rareté.
// Le choix est gardé pour l'onglet.

const BOARD_SCOPE_KEY = 'aqm-board-scope';
let boardScope = (() => {
  try {
    return sessionStorage.getItem(BOARD_SCOPE_KEY) === 'friends' ? 'friends' : 'all';
  } catch {
    return 'all';
  }
})();
const ROW_MODEL = 'section[aria-labelledby="top-title"] li[data-row]:not([data-me])';
const PODIUM_MODEL = 'section[aria-label="Podium"]';
const GAME_SECTIONS = 'section[aria-label="Podium"], section[aria-labelledby="top-title"]';

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
  const friendsOn = boardScope === 'friends';
  if (bar.dataset.scope !== boardScope) {
    bar.dataset.scope = boardScope;
    bar.replaceChildren(
      chips(
        [
          ['all', 'Tous'],
          ['friends', 'Amis']
        ],
        boardScope,
        (v) => {
          boardScope = v;
          try {
            sessionStorage.setItem(BOARD_SCOPE_KEY, v);
          } catch {}
          markGameBoard();
          // (le jeu place ses lignes animées selon le défilement : remontrées, il les replace)
          if (v === 'all') requestAnimationFrame(() => dispatchEvent(new Event('resize')));
        }
      )
    );
  }
  box.hidden = !friendsOn;
  for (const s of document.querySelectorAll(GAME_SECTIONS)) if (s.hasAttribute('data-aqm-board-off') !== friendsOn) s.toggleAttribute('data-aqm-board-off', friendsOn);
  if (friendsOn && !box.dataset.loaded) {
    box.dataset.loaded = '1';
    loadFriendsBoard(box);
  }
  // (les lignes du jeu, modèles de celles des amis, arrivées après le premier dessin)
  if (friendsOn && box.repaint && !box.querySelector('.aqm-board-game') && document.querySelector(ROW_MODEL)) box.repaint();
}

// Une ligne du classement des amis, copiée d'une ligne du jeu (model : li[data-row] > a > [place, avatar, nom et
// barre, cartes et rares, score]) puis remplie : même aspect que le classement du jeu. Les marques du jeu (data-row,
// data-me…) sont retirées : ses animations et « Voir ma ligne » ne la prennent pas pour une des siennes.
const ME_LOOK = ['bg-gradient-to-r', 'from-blue-500/[0.18]', 'via-blue-500/[0.07]', 'to-transparent', 'hover:bg-blue-500/[0.06]'];
const PLAIN_LOOK = ['bg-white/[0.025]', 'hover:bg-white/[0.055]'];
const ME_BAR = ['from-sky-400', 'to-white'];
const PLAIN_BAR = ['from-blue-600', 'to-sky-400'];
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
  return li;
}

// Le classement du jeu, lu 2 minutes au plus.
let gameBoard = null; // { at, read: Promise }
function readGameBoard(force) {
  if (force || !gameBoard || Date.now() - gameBoard.at > 120e3) gameBoard = { at: Date.now(), read: gameWrite('/leaderboard', 'GET') };
  return gameBoard.read;
}

async function loadFriendsBoard(box, force = false) {
  const status = h('p', { class: 'aqm-muted aqm-friends-note' }, 'Chargement de tes amis…');
  const podium = h('div', { class: 'aqm-friends-podium-box' });
  const list = h('ol', { class: 'aqm-board' });
  const foot = h('div', { class: 'aqm-board-refresh' });
  box.replaceChildren(status, podium, list, foot);
  let board;
  let mates;
  try {
    [board, mates] = await Promise.all([readGameBoard(force), ask({ type: 'friends' })]);
  } catch (e) {
    status.textContent = `Classement indisponible (${e.message}).`;
    return;
  }
  if (!box.isConnected) return;
  const points = board?.points ?? {};
  const top = new Map((Array.isArray(board?.top) ? board.top : []).map((e) => [e?.player?.id, e]));
  const meEntry = board?.me?.player?.id === mates.me ? board.me : null;
  // Une ligne par joueur : celle du jeu quand il la donne (top 100, ou la tienne), sinon calculée.
  const rows = [{ id: mates.me, me: true }, ...mates.friends].map((p) => {
    const official = top.get(p.id) ?? (p.me ? meEntry : null);
    return { ...p, name: official?.player?.name ?? p.name, image: official?.player?.image ?? null, official, state: official?.score != null ? 'ok' : 'loading' };
  });
  if (mates.friendsError) status.textContent = `Liste d'amis indisponible (${mates.friendsError}).`;
  else if (!mates.friends.length) status.textContent = "Tu n'as pas encore d'amis dans le jeu : ajoute-en depuis leur profil pour te comparer à eux.";
  else status.textContent = `${mates.friends.length} ami${mates.friends.length > 1 ? 's' : ''} · les points du classement du jeu.`;

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
    if (row.official) return;
    if (p.private) row.state = 'private';
    else if (!p.byRarity) row.state = 'error';
    else Object.assign(row, { state: 'ok', score: scoreOf(p.byRarity), cards: Object.values(p.byRarity).reduce((a, b) => a + b, 0), by: p.byRarity });
  };

  let frame = 0;
  const later = () => frame || (frame = requestAnimationFrame(() => ((frame = 0), paint())));
  const paint = () => {
    if (!box.isConnected) return;
    const value = (r) => (r.state !== 'ok' ? -1 : r.official ? r.official.score : r.score);
    const sorted = [...rows].sort((a, b) => value(b) - value(a) || String(a.name).localeCompare(String(b.name)));
    const leader = Math.max(1, ...sorted.map(value));
    let place = 0;
    const scoreText = (r) => `${r.official || exact ? '' : '≈ '}${fmt(value(r))}`;
    const titleOf = (r) => (r.official ? 'Score du classement du jeu' : exact ? 'Calculé depuis sa collection, avec le barème du jeu' : 'Calculé depuis sa collection, avec le barème du jeu (peut différer un peu du jeu)');
    // Les lignes du jeu (celles des places 4 à 10) servent de modèle : le classement des amis a leur aspect. Les 3
    // premiers montent sur un podium copié de celui du jeu, avec leur plus belle carte (celle du jeu pour son top 3).
    const model = document.querySelector(ROW_MODEL);
    const podiumModel = document.querySelector(PODIUM_MODEL);
    list.className = model ? `${model.parentElement.className} aqm-board-game` : 'aqm-board';
    const ranked = sorted.filter((r) => r.state === 'ok');
    const onPodium = model && podiumModel && ranked.length >= 3 ? ranked.slice(0, 3) : [];
    podium.replaceChildren(
      ...(onPodium.length
        ? [
            gamePodium(
              podiumModel,
              onPodium.map((r) => ({ id: r.id, me: !!r.me, name: r.name || 'Joueur', score: fmt(value(r)), title: titleOf(r), card: r.official?.best?.card ?? r.best ?? null }))
            )
          ]
        : [])
    );
    place = onPodium.length;
    if (model) {
      list.replaceChildren(
        ...sorted.filter((r) => !onPodium.includes(r)).map((r) => {
          const ok = r.state === 'ok';
          if (ok) place++;
          const o = r.official;
          const cards = o ? o.cards : r.cards;
          const rare = o ? o.rare : rareSet && r.by ? rareSet.reduce((n, k) => n + (r.by[k] ?? 0), 0) : null;
          return gameRow(model, {
            id: r.id,
            me: !!r.me,
            place: ok ? String(place) : '–',
            name: r.name || 'Joueur',
            width: ok ? Math.min(100, Math.max(1.5, (100 * value(r)) / leader)) : 0,
            lines: ok
              ? [o?.rank ? `${fmt(o.rank)}e du jeu` : 'hors du top 100', `${fmt(cards)} cartes`, rare != null ? `${fmt(rare)} rares` : null].filter(Boolean)
              : [r.state === 'private' ? 'Collection privée' : r.state === 'error' ? 'Collection indisponible' : 'Lecture…'],
            score: ok ? scoreText(r) : '–',
            title: titleOf(r)
          });
        })
      );
    } else
    list.replaceChildren(
      ...sorted.map((r) => {
        const ok = r.state === 'ok';
        if (ok) place++;
        const o = r.official;
        const cards = o ? o.cards : r.cards;
        const rare = o ? o.rare : rareSet && r.by ? rareSet.reduce((n, k) => n + (r.by[k] ?? 0), 0) : null;
        const detail = ok
          ? [o?.rank ? `${fmt(o.rank)}e du jeu` : 'hors du top 100', `${fmt(cards)} cartes`, rare != null ? `${fmt(rare)} rares` : null].filter(Boolean).join(' · ')
          : r.state === 'private'
            ? 'Collection privée'
            : r.state === 'error'
              ? 'Collection indisponible'
              : 'Lecture de sa collection…';
        return h(
          'li',
          { class: `aqm-row${r.me ? ' is-me' : ''}` },
          h('span', { class: `aqm-place aqm-place-${place}` }, ok ? String(place) : '–'),
          h('img', { class: 'aqm-avatar', src: r.image || avatarUrl(r.id), alt: '', loading: 'lazy' }),
          h(
            'div',
            { class: 'aqm-friend-main' },
            h('a', { class: 'aqm-name', href: `/profile/${encodeURIComponent(r.id)}` }, r.name || 'Joueur', r.me ? h('span', { class: 'aqm-tag' }, 'Toi') : null),
            h('small', { class: 'aqm-muted' }, detail),
            ok ? h('span', { class: 'aqm-bar' }, h('span', { style: `width:${((100 * value(r)) / leader).toFixed(2)}%` })) : null
          ),
          h(
            'div',
            { class: 'aqm-friend-score', title: o ? 'Score du classement du jeu' : exact ? 'Calculé depuis sa collection, avec le barème du jeu' : 'Calculé depuis sa collection, avec le barème du jeu (peut différer un peu du jeu)' },
            ok ? h('strong', {}, `${o || exact ? '' : '≈ '}${fmt(value(r))}`) : null,
            ok ? h('small', {}, 'pts') : null
          )
        );
      })
    );
    const reading = rows.filter((r) => r.state === 'loading').length;
    foot.replaceChildren(
      h('span', { class: 'aqm-muted' }, reading ? `Lecture de ${fmt(reading)} collection${reading > 1 ? 's' : ''}…` : 'Les amis hors du top 100 : score calculé depuis leur collection.'),
      h('button', { type: 'button', class: 'aqm-chip', disabled: reading ? true : null, onclick: () => loadFriendsBoard(box, true) }, 'Actualiser')
    );
  };
  box.repaint = later;
  paint();

  // Les collections, 4 à la fois : la tienne (pour les rares et la vérification du score), celles des amis hors du top
  // (leur score), et celles de tous pour leur plus belle carte (le podium). Celles lues il y a moins d'1 h (sur cet
  // appareil) sont reprises sans relecture, sauf « Actualiser ».
  let known = { fresh: 3600e3, players: {} };
  try {
    known = await ask({ type: 'board-known' });
  } catch {}
  const usable = (p) => p && (p.private || (p.byRarity && 'best' in p)) && Date.now() - p.at < (known.fresh ?? 3600e3);
  const todo = rows;
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
      if (!box.isConnected) return;
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
