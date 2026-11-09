// Aquaman, code de la page : accueil, compteurs anti-malchance sous le minuteur du booster gratuit, et l'historique des
// tirages.

// ---------- accueil : compteurs anti-malchance sous le minuteur du booster gratuit ----------

let pityReport = null; // { opened, sync, SSR: { since, known, every, left }, UR: { … } }
let pityAt = 0;
let pityLoading = false;
let pityRulesSent = '';

// Les chiffres du texte de la boutique « une SSR tous les 60 boosters et une UR tous les 190 boosters ».
function readPityRules() {
  for (const el of elementsWithText(document.body, /SSR tous les \d+ boosters/i)) {
    const m = el.textContent.match(/SSR tous les (\d+) boosters.*?UR tous les (\d+)/i);
    if (!m || pityRulesSent === m[0]) continue;
    pityRulesSent = m[0];
    send({ type: 'pity-rules', rules: { SSR: Number(m[1]), UR: Number(m[2]) } }).then(() => (pityReport = null));
  }
}

// Où vont les compteurs : après le minuteur « +1 booster dans … », sinon après les boutons « Acheter un booster ».
function pityPlace() {
  for (const label of elementsWithText(document.body, /booster dans|r[ée]serve pleine/i)) {
    let pill = label;
    while (pill.parentElement && pill.parentElement !== document.body && !pill.querySelector('svg, [role="progressbar"]') && pill.textContent.length < 120) pill = pill.parentElement;
    if (pill.querySelector('svg, [role="progressbar"]')) return pill;
  }
  const buy = [...document.querySelectorAll('button, a')].find((b) => !b.closest('.aqm-root') && /acheter un booster|tout ouvrir/i.test(b.textContent));
  return buy?.parentElement ?? null;
}

function showPity() {
  if (!/^\/jeu\/?$/.test(location.pathname)) return;
  const place = pityPlace();
  if (!place) return;
  if (place.nextElementSibling?.classList.contains('aqm-pity')) {
    if (!pityReport || Date.now() - pityAt > 60e3) loadPity();
    return;
  }
  document.querySelectorAll('.aqm-pity').forEach((el) => el.remove());
  place.after(h('div', { class: 'aqm-root aqm-pity', role: 'status' }));
  pityReport ? renderPity() : loadPity();
}

// Relit les compteurs (fresh : avec les ouvertures des autres appareils tout de suite).
async function loadPity(fresh = false) {
  if (pityLoading) return;
  pityLoading = true;
  pityAt = Date.now();
  try {
    const report = await send({ type: 'pity', fresh });
    if (report && !report.error) pityReport = report;
  } finally {
    pityLoading = false;
  }
  renderPity();
}

function renderPity() {
  const box = document.querySelector('.aqm-pity');
  if (!box || !pityReport) return;
  const line = (code) => {
    const p = pityReport[code];
    // Plus de boosters comptés que la garantie : le jeu ne les compte pas tous comme Aquaman. Le compte repart à la
    // prochaine carte de cette rareté.
    if (p.over)
      return h(
        'div',
        { class: 'aqm-pity-line', title: `Le jeu garantit une ${code} tous les ${fmt(p.every)} boosters, mais Aquaman en a compté ${fmt(p.since)} depuis ta dernière ${code} (packs spéciaux exclus) : des boosters ouverts avant Aquaman 1.6.1 dont la sorte est inconnue étaient sans doute des packs spéciaux. Le compte repart à ta prochaine ${code}.` },
        h('p', {}, rarityCode(code), ' garantie ', h('strong', {}, 'au prochain booster'), ' en principe'),
        h('span', { class: 'aqm-bar' }, h('span', { style: 'width:100%' })),
        h('small', {}, `${fmt(p.since)} boosters comptés depuis ta dernière ${code}, plus que les ${fmt(p.every)} du jeu`)
      );
    const left = p.left;
    const when = left <= 1 ? 'au prochain booster' : `dans ${fmt(left)} boosters`;
    return h(
      'div',
      {
        class: 'aqm-pity-line',
        title: p.missed
          ? `${fmt(p.since)} booster${p.since > 1 ? 's' : ''} compté${p.since > 1 ? 's' : ''} par Aquaman depuis ta dernière ${code}, vue dans les Beaux tirages du jeu (tirée sans Aquaman).`
          : p.known
            ? `${fmt(p.since)} booster${p.since > 1 ? 's' : ''} ouvert${p.since > 1 ? 's' : ''} depuis ta dernière ${code}.`
            : `Aquaman n’a pas encore vu de ${code} sortir : il compte depuis son installation, donc la garantie peut arriver plus tôt.`
      },
      h('p', {}, rarityCode(code), ' garantie ', h('strong', {}, when), p.known ? '' : ' au plus'),
      h('span', { class: 'aqm-bar' }, h('span', { style: `width:${Math.min(100, (100 * p.since) / p.every).toFixed(1)}%` })),
      h('small', {}, p.known ? `${fmt(p.since)} / ${fmt(p.every)} depuis ta dernière ${code}` : `${fmt(p.since)} / ${fmt(p.every)} sans ${code} depuis qu’Aquaman compte`)
    );
  };
  // La SEC n'a pas de garantie : les boosters depuis la dernière, et ce que donnent les chances du jeu, sans barre.
  const secLine = () => {
    const s = pityReport.SEC;
    if (!s) return null;
    const n = `${fmt(s.since)}${s.known ? '' : '+'} booster${s.since > 1 ? 's' : ''}`;
    const odds = s.chance > 0 ? `une tous les ~${fmt(1 / s.chance)} boosters en moyenne · ${pct(1 - (1 - s.chance) ** 100)} d’en avoir une dans les 100 prochains` : null;
    return h(
      'div',
      {
        class: 'aqm-pity-line is-sec',
        title: `Pas de garantie pour la SEC : chaque booster a la même chance, la malchance passée ne la rapproche pas.${s.known ? '' : ' Aquaman n’a pas encore vu de SEC sortir : il compte depuis son installation.'}`
      },
      h('p', {}, rarityCode('SEC'), ' ', h('strong', {}, n), ' sans SEC'),
      h('small', {}, odds ? `Pas de garantie : ${odds}.` : 'Pas de garantie pour la SEC.')
    );
  };
  box.replaceChildren(
    h('p', { class: 'aqm-label' }, 'Garantie anti-malchance'),
    h('div', { class: 'aqm-pity-lines' }, line('SSR'), line('UR'), secLine()),
    h(
      'p',
      { class: 'aqm-pity-note' },
      {
        ok: 'Compté par Aquaman à chaque booster ouvert, et partagé entre tes appareils (PC, téléphone, extension ou script).',
        waiting: 'Compté par Aquaman à chaque booster ouvert, et partagé entre tes appareils dès ta prochaine ouverture.',
        error: 'Compté par Aquaman sur ce navigateur : le partage avec tes autres appareils ne répond pas pour le moment.',
        off: 'Compté par Aquaman à chaque booster ouvert sur ce navigateur (partage entre appareils désactivé).'
      }[pityReport.sync] ?? 'Compté par Aquaman à chaque booster ouvert.'
    ),
    // (comme dans le jeu, la garantie SSR et UR ne compte pas les packs spéciaux)
    pityReport.skipped > 0
      ? h('p', { class: 'aqm-pity-note' }, `${fmt(pityReport.skipped)} pack${pityReport.skipped > 1 ? 's' : ''} spécia${pityReport.skipped > 1 ? 'ux' : 'l'} (Légendaire, Halloween…) hors garantie, comme dans le jeu.`)
      : null,
    h('div', { class: 'aqm-pity-more' }, h('button', { type: 'button', class: 'aqm-album-btn', onclick: openPityHistory }, '📜 Historique'))
  );
}

// Le suivi des SSR, UR et SEC (chaque rareté à part) : à quelle fréquence chacune tombe par rapport aux chances du jeu,
// les derniers boosters ouverts d'un coup d'œil, et pour chaque rareté les cartes obtenues avec les boosters que
// chacune a demandés, la plus récente d'abord.
async function openPityHistory() {
  const body = openOverlay('Historique des tirages', 'À quelle fréquence tu tires des SSR, UR et SEC, et combien de boosters il t’a fallu pour chacune.');
  body.parentElement.classList.add('aqm-panel-wide');
  const view = h('div', { class: 'aqm-history' }, h('p', { class: 'aqm-note' }, 'Lecture de tes ouvertures…'));
  body.append(view);
  let r;
  try {
    r = await ask({ type: 'pity-history' });
  } catch (e) {
    view.replaceChildren(h('p', { class: 'aqm-note' }, e.message));
    return;
  }
  const CODES = ['SSR', 'UR', 'SEC'];
  const day = (at) => new Date(at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const boosters = (n) => `${fmt(n)} booster${n > 1 ? 's' : ''}`;
  const decimal = (x) => x.toFixed(1).replace('.', ',');
  const weeks = r.since ? Math.max(1 / 7, (Date.now() - r.since) / (7 * 86400e3)) : null;

  // Une carte par rareté : à quelle fréquence elle tombe, les chances du jeu (sans la garantie) et la chance.
  const rate = (code) => {
    const n = r[code].hits.length;
    const every = n ? r.opened / n : null;
    const expected = r.chances?.[code] > 0 ? 1 / r.chances[code] : null;
    const ratio = every && expected ? expected / every : null;
    const luck = ratio == null ? null : ratio >= 1.15 ? ['is-good', `${decimal(ratio)}× plus souvent`] : ratio <= 0.87 ? ['is-bad', `${decimal(1 / ratio)}× moins souvent`] : ['', 'Dans la moyenne'];
    const perWeek = weeks && n ? n / weeks : 0;
    return h(
      'div',
      { class: `aqm-rate is-${code}` },
      h('div', { class: 'aqm-rate-top' }, rarityCode(code), luck ? h('span', { class: `aqm-tag aqm-luck ${luck[0]}` }, luck[1]) : null),
      h('p', { class: 'aqm-rate-value' }, every ? ['1 ', h('small', {}, 'tous les'), ` ${fmt(every)}`] : '—'),
      h('p', { class: 'aqm-rate-sub' }, every ? 'boosters, chez toi' : `aucune en ${boosters(r.opened)}`),
      h(
        'p',
        { class: 'aqm-rate-foot', title: 'La chance du jeu pour un booster classique, sans la garantie anti-malchance.' },
        expected ? `Jeu : 1 tous les ~${fmt(expected)}` : 'Jeu : chance inconnue',
        perWeek ? ` · ≈ ${perWeek < 10 ? decimal(perWeek) : fmt(perWeek)}/sem.` : ''
      )
    );
  };

  // Les derniers boosters, un carré chacun, coloré selon sa meilleure carte.
  const strip = r.recent?.length
    ? h(
        'div',
        { class: 'aqm-history-box' },
        h('div', { class: 'aqm-history-row' }, h('p', { class: 'aqm-label' }, `Tes ${boosters(r.recent.length)} les plus récents`), h('small', { class: 'aqm-muted' }, 'du plus ancien au plus récent')),
        h(
          'div',
          { class: 'aqm-tracker-strip' },
          r.recent.map((top) => {
            const code = top >= 6 ? 'SEC' : top >= 5 ? 'UR' : top >= 4 ? 'SSR' : null;
            return h('span', { class: `aqm-cell${code ? ` is-${code}` : ''}`, title: code ?? 'Ni SSR, ni UR, ni SEC' });
          })
        ),
        h('p', { class: 'aqm-tracker-legend' }, [null, ...CODES].map((code) => h('span', {}, h('span', { class: `aqm-cell${code ? ` is-${code}` : ''}` }), code ?? 'Autre')))
      )
    : null;

  // La sorte de booster d'où vient chaque carte (gardée depuis Aquaman 1.4.7 ; avant, devinée d'après la carte :
  // Halloween ou Classique ; « Pack inconnu » quand la carte elle-même est inconnue).
  const UNKNOWN = '?';
  const packKey = (x) => x.pack?.id ?? UNKNOWN;
  const packName = (x) => x.pack?.name ?? (x.pack?.id === 'classic' ? 'Classique' : x.pack ? 'Autre pack' : 'Pack inconnu');
  const packs = new Map();
  for (const code of CODES)
    for (const x of r[code].hits) {
      const key = packKey(x);
      if (!packs.has(key)) packs.set(key, { key, name: packName(x), count: 0 });
      packs.get(key).count++;
    }
  const packList = [...packs.values()].sort((a, b) => (a.key === UNKNOWN) - (b.key === UNKNOWN) || b.count - a.count);
  let pack = ''; // le pack affiché ('' pour tous)
  let rarity = CODES.find((code) => r[code].hits.length) ?? 'SSR';
  const hitsOf = (code) => (pack ? r[code].hits.filter((x) => packKey(x) === pack) : r[code].hits);

  // Les cartes obtenues pour une rareté, en tuiles : l'image, combien de boosters elle a demandés, le pack, le jour.
  const tiles = (code) => {
    const { current } = r[code];
    const hits = hitsOf(code);
    const full = hits.filter((x) => !x.first && !x.special).map((x) => x.after);
    const stat = (label, value) => h('div', { class: 'aqm-history-stat' }, h('small', {}, label), h('strong', {}, value));
    const all = r[code].hits.length;
    return [
      h(
        'div',
        { class: 'aqm-history-stats' },
        stat('Obtenues', fmt(hits.length)),
        pack ? stat(`Part de tes ${code}`, all ? pct(hits.length / all) : '—') : stat('En moyenne', full.length ? boosters(full.reduce((a, b) => a + b, 0) / full.length) : '—'),
        stat('Plus rapide', full.length ? boosters(Math.min(...full)) : '—'),
        stat('Plus long', full.length ? boosters(Math.max(...full)) : '—'),
        stat('Depuis la dernière', boosters(current))
      ),
      hits.length
        ? h(
            'div',
            { class: 'aqm-history-grid' },
            hits.map((x) => {
              // L'image de la carte, les boosters qu'elle a demandés et son pack (son nom et son jour dans
              // l'infobulle).
              const link = x.card?.id ? { href: `/jeu/carte/${encodeURIComponent(x.card.id)}` } : {};
              const tip = [x.card?.name ?? `${x.top}, carte inconnue`, x.pack?.guessed ? `${packName(x)} (déduit de la carte)` : packName(x), day(x.at), x.first ? 'Aquaman a commencé à compter après la précédente' : null].filter(Boolean).join(' · ');
              return h(
                x.card?.id ? 'a' : 'div',
                { class: 'aqm-history-tile', ...link, title: tip },
                x.card?.image ? h('img', { src: cardImageUrl(x.card.image), alt: x.card.name ?? '', loading: 'lazy', decoding: 'async' }) : h('div', { class: 'aqm-history-blank' }, rarityCode(x.top)),
                // (une carte d'un pack spécial : hors garantie, elle ne fait pas repartir le compte)
                h('p', { class: 'aqm-history-after' }, x.special ? 'Hors garantie' : x.first ? `≥ ${boosters(x.after)}` : boosters(x.after)),
                h('p', { class: `aqm-history-pack${x.pack ? '' : ' is-unknown'}` }, packName(x))
              );
            })
          )
        : h('p', { class: 'aqm-history-empty' }, pack ? `Aucune ${code} tirée dans ce pack.` : `Aucune ${code} parmi tes ${boosters(r.opened)} comptés.`)
    ];
  };

  // Un onglet par rareté, le premier qui a des cartes ouvert ; au-dessus, un filtre par pack (dès que le pack d'une
  // carte est connu).
  const panel = h('div', { class: 'aqm-history-panel' });
  const tabs = h('div', { class: 'aqm-history-tabs', role: 'tablist' });
  const filter = h('div', { class: 'aqm-history-packs', role: 'group', 'aria-label': 'Pack' });
  const show = () => {
    if (packList.some((p) => p.key !== UNKNOWN))
      filter.replaceChildren(
        ...[{ key: '', name: 'Tous les packs', count: CODES.reduce((n, c) => n + r[c].hits.length, 0) }, ...packList].map((p) =>
          h(
            'button',
            {
              type: 'button',
              class: `aqm-history-packbtn${p.key === pack ? ' is-on' : ''}`,
              'aria-pressed': String(p.key === pack),
              title: p.key === UNKNOWN ? 'Cartes tirées avant la version 1.4.7 dont Aquaman ne connaît pas la carte : impossible de savoir leur pack.' : null,
              onclick: () => {
                pack = p.key;
                show();
              }
            },
            p.name,
            h('span', { class: 'aqm-history-tabcount' }, fmt(p.count))
          )
        )
      );
    tabs.replaceChildren(
      ...CODES.map((c) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: `aqm-history-tabbtn${c === rarity ? ' is-on' : ''}`,
            'aria-selected': String(c === rarity),
            onclick: () => {
              rarity = c;
              show();
            }
          },
          rarityCode(c),
          h('span', { class: 'aqm-history-tabcount' }, fmt(hitsOf(c).length))
        )
      )
    );
    panel.replaceChildren(...tiles(rarity));
  };
  show();
  view.replaceChildren(
    h('p', { class: 'aqm-history-count' }, r.since ? `${boosters(r.opened)} comptés depuis le ${new Date(r.since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Aucun booster compté pour le moment.'),
    h('div', { class: 'aqm-rates' }, CODES.map(rate)),
    strip,
    h('div', { class: 'aqm-history-box' }, filter.childElementCount ? filter : null, tabs, panel)
  );
}
