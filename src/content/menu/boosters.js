// Aquaman, code de la page : « Quel booster ouvrir ? », les boosters rentables.

// ---------- boosters rentables ----------

// Image d'un booster : le dessin du site pour son type, ou un pack simple.
function packArt(b) {
  const art = b.types[0] && TYPE_NAMES[b.types[0]] ? `/game/boosters/${b.types[0]}.webp` : b.minRank >= 4 ? '/game/boosters/legendaire.webp' : null;
  return art ? h('img', { class: 'aqm-pack', src: art, alt: '' }) : h('span', { class: 'aqm-pack aqm-pack-plain' }, h('span', {}, 'Booster'));
}
const rarityCode = (code) => h('span', { class: `aqm-rarity aqm-r-${code}` }, code);
const perles = (n) => h('span', { class: 'aqm-perles', html: ICON_PEARL }, fmt(n));

// Petites cartes avec leur nom et une ligne dessous.
const cardStrip = (items, sub) =>
  h(
    'ul',
    { class: 'aqm-strip' },
    items.map((x) =>
      h(
        'li',
        { class: `aqm-mini${x.own ? ' is-owned' : ''}`, title: `${x.c.name} — ${x.c.series?.title ?? ''}` },
        h('img', { src: cardImageUrl(x.c.image), alt: '', loading: 'lazy' }),
        h('div', {}, h('p', { class: 'aqm-mini-name' }, rarityCode(x.c.rarity), ' ', x.c.name), h('p', { class: 'aqm-muted' }, sub(x)))
      )
    )
  );

// Ce que cherche le joueur, et la phrase sous les choix.
const GOALS = [
  ['collection', 'Ma collection'],
  ['rarity', 'Une rareté'],
  ['name', 'Un personnage'],
  ['series', 'Une série'],
  ['value', 'La valeur']
];

// Les deux ordres de chaque objectif : « rate » (la meilleure chance ou le meilleur rendement) et « price » (le moins
// de Perles).
const SORTS = {
  collection: { rate: ['Cartes nouvelles', 'le plus de cartes que tu n’as pas'], price: ['Prix', 'le moins de Perles par carte nouvelle'] },
  value: { rate: ['Rendement', 'les cartes qui valent le plus'], price: ['Prix', 'le booster le moins cher'] },
  other: { rate: ['Taux de drop', 'la meilleure chance par booster'], price: ['Prix', 'le moins de Perles dépensées'] }
};

const guaranteeOf = (b) => `${RARITY_NAMES[RANKED[b.minRank - 1]] ?? 'Rare'} garantie`;
const seriesOf = (b) =>
  b.series.length
    ? b.series
        .slice(0, 2)
        .map((s) => s.title)
        .join(', ') + (b.series.length > 2 ? ` +${b.series.length - 2}` : '')
    : b.types.length
      ? `Cartes ${b.types.map((t) => TYPE_NAMES[t] || t).join(' et ')}`
      : 'Toutes les séries';
// « ≈ 11 boosters » pour l'obtenir une fois, en moyenne.
const oneIn = (p) => (1 / p < 10 ? dec(1 / p, 1) : fmt(1 / p));
const boostersFor = (p) => (p >= 0.95 ? 'presque à chaque booster' : `≈ ${oneIn(p)} booster${1 / p >= 1.95 ? 's' : ''} à ouvrir en moyenne`);

async function openBoosters() {
  const body = openOverlay('Quel booster ouvrir ?', 'Les boosters en vente classés du plus rentable au moins rentable pour obtenir ce que tu cherches.');
  body.parentElement.classList.add('aqm-panel-wide');
  const status = h('p', { class: 'aqm-note' }, 'Chargement de la boutique…');
  body.append(status);
  let goal = 'collection';
  let rarity = 'UR';
  let query = '';
  let onlyNew = false;
  let sortBy = 'rate';
  let report;
  try {
    report = await ask({ type: 'boosters' });
  } catch (e) {
    status.textContent = e.message;
    return;
  }
  if (!report.rows.length || !report.rarities.length) {
    status.textContent = 'La boutique ne propose aucun booster pour le moment.';
    return;
  }
  if (!report.rarities.some((r) => r.code === rarity)) rarity = report.rarities.at(-1).code;
  const rarityName = (code) => report.rarities.find((r) => r.code === code)?.name || RARITY_NAMES[code] || code;

  const goalRow = h('div', { class: 'aqm-chips aqm-goals' });
  const pickRow = h('div', { class: 'aqm-pick' });
  const sentence = h('div', { class: 'aqm-sentence' });
  const sortRow = h('div', { class: 'aqm-sorts' });
  const summary = h('div', { class: 'aqm-verdict' });
  const list = h('ol', { class: 'aqm-ranking' });
  // Les suggestions sous le champ de recherche : chaque nom avec l'image d'une de ses cartes et ses raretés.
  const suggestions = h('ul', { class: 'aqm-suggest', id: 'aqm-suggest', role: 'listbox', hidden: true });
  const search = h('input', { type: 'search', class: 'aqm-search', role: 'combobox', 'aria-controls': 'aqm-suggest', 'aria-expanded': 'false', 'aria-autocomplete': 'list', autocomplete: 'off' });
  const searchBox = h('div', { class: 'aqm-suggest-box' }, search, suggestions);
  let picked = -1; // la suggestion choisie avec les flèches
  let typing = false; // la liste ne s'ouvre que pendant la frappe, pas une fois un nom choisi
  const showSuggestions = (open) => {
    suggestions.hidden = !open || !suggestions.childElementCount;
    search.setAttribute('aria-expanded', String(!suggestions.hidden));
  };
  const pickSuggestion = (name) => {
    typing = false;
    search.value = name;
    clearTimeout(timer);
    query = name;
    showSuggestions(false);
    refresh();
  };
  const fillSuggestions = (list) => {
    picked = -1;
    suggestions.replaceChildren(
      ...list.map((s, i) =>
        h(
          'li',
          {
            id: `aqm-suggest-${i}`,
            class: 'aqm-suggest-item',
            'data-name': s.name,
            role: 'option',
            'aria-selected': 'false',
            // (mousedown : avant que le champ ne perde le focus)
            onmousedown: (e) => {
              e.preventDefault();
              pickSuggestion(s.name);
            }
          },
          s.image ? h('img', { src: cardImageUrl(s.image), alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'aqm-suggest-blank' }),
          h('span', { class: 'aqm-suggest-name' }, s.name, goal === 'series' && s.cards ? h('small', {}, `${fmt(s.cards)} carte${s.cards > 1 ? 's' : ''}`) : null),
          goal === 'series' ? null : h('span', { class: 'aqm-suggest-rarities' }, (s.rarities ?? []).map((code) => rarityCode(code)))
        )
      )
    );
    showSuggestions(typing && document.activeElement === search && !!search.value.trim());
  };
  const movePick = (step) => {
    const items = [...suggestions.children];
    if (!items.length) return;
    showSuggestions(true);
    picked = (picked + step + items.length) % items.length;
    items.forEach((li, i) => li.setAttribute('aria-selected', String(i === picked)));
    items[picked].scrollIntoView({ block: 'nearest' });
    search.setAttribute('aria-activedescendant', items[picked].id);
  };
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      movePick(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter' && picked >= 0 && !suggestions.hidden) {
      e.preventDefault();
      pickSuggestion(suggestions.children[picked].dataset.name);
    } else if (e.key === 'Escape' && !suggestions.hidden) {
      e.stopPropagation();
      showSuggestions(false);
    }
  });
  search.addEventListener('focus', () => showSuggestions(typing && !!search.value.trim()));
  search.addEventListener('blur', () => showSuggestions(false));
  const how = h(
    'details',
    { class: 'aqm-how' },
    h('summary', {}, 'Comment sont calculés ces chiffres ?'),
    h(
      'ul',
      {},
      h('li', {}, 'Un booster donne 5 cartes : 4 tirées avec les taux du jeu, et une 5e d’au moins la rareté garantie. Dans une rareté, chaque carte du booster a la même chance.'),
      h('li', {}, '« ≈ 11 boosters à ouvrir en moyenne » et « 1 sur 11 » : l’inverse de la chance par booster. « ≈ 6 594 en moyenne » : le prix du booster multiplié par ce nombre.'),
      h('li', {}, 'Valeur : le prix au marché de chaque carte, pris sur les exemplaires vus dans ta collection', report.friends ? ' et celles de tes amis' : '', '. Une carte jamais vue prend la valeur moyenne de sa rareté.'),
      h('li', {}, 'La garantie anti-malchance (une SSR tous les 60 boosters, une UR tous les 190) n’est pas comptée : les vraies chances sont un peu meilleures.'),
      report.catalog ? null : h('li', {}, 'Le catalogue complet du jeu est indisponible : les chances par personnage et par série ne peuvent pas être calculées.'),
      h('li', {}, 'Ce sont des moyennes : un booster reste un tirage au sort.')
    )
  );
  status.remove();
  body.append(goalRow, pickRow, sentence, sortRow, summary, list, how);

  // Redemande les chiffres pour ce qui a été tapé.
  let asked = 0;
  let timer = 0;
  async function refresh() {
    const n = ++asked;
    const field = goal === 'name' || goal === 'series' ? goal : '';
    try {
      const next = await ask({ type: 'boosters', query: field ? query : '', field });
      if (n !== asked) return;
      report = next;
      fillSuggestions(report.suggestions ?? []);
      render();
    } catch {}
  }
  search.addEventListener('input', () => {
    typing = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      query = search.value.trim();
      refresh();
    }, 250);
  });

  // Chiffres d'un booster pour l'objectif choisi : rate (plus haut, c'est mieux), cost (plus bas, c'est mieux) et les
  // textes.
  function measure({ b, a }) {
    const target =
      goal === 'rarity'
        ? `une ${rarityName(rarity)}${onlyNew ? ' que tu n’as pas' : ''}`
        : `« ${query} »${onlyNew ? ' (une carte que tu n’as pas)' : ''}`;
    if (goal === 'collection') {
      return {
        rate: a.fresh,
        cost: a.perFresh,
        head: `≈ ${dec(a.fresh, 1)} carte${a.fresh >= 2 ? 's' : ''} nouvelle${a.fresh >= 2 ? 's' : ''} par booster`,
        sub: `${pct(a.freshChance)} de chance d’en avoir au moins une`,
        big: a.perFresh == null ? '—' : h('span', {}, perles(a.perFresh)),
        bigSub: 'par carte nouvelle'
      };
    }
    if (goal === 'value') {
      return {
        rate: a.ratio,
        cost: b.price,
        head: a.ratio >= 1 ? `Tes cartes valent ×${dec(a.ratio)} le prix du booster` : `Tes cartes valent ${pct(a.ratio)} du prix du booster`,
        sub: h('span', {}, '≈ ', perles(a.ev), ' de cartes par booster, au prix du marché'),
        big: `×${dec(a.ratio)}`,
        bigSub: h('span', {}, '≈ ', perles(a.ev), ' de cartes')
      };
    }
    const p = goal === 'rarity' ? (onlyNew ? a.odds[rarity]?.freshChance : a.odds[rarity]?.chance) ?? 0 : (onlyNew ? a.targetNewChance : a.targetChance) ?? 0;
    return {
      rate: p,
      cost: p > 0 ? b.price / p : null,
      head: p > 0 ? `${boostersFor(p)} pour avoir ${target}` : `Ne peut pas te donner ${target}`,
      sub: `${pct(p)} de chance à chaque booster`,
      big: p > 0 ? `1 sur ${oneIn(Math.min(1, p))}` : '—',
      bigSub: p > 0 ? h('span', {}, '≈ ', perles(b.price / p), ' en moyenne') : ''
    };
  }

  // Plus de détails sur un booster : chances de chaque rareté, les cartes manquantes recherchées ou de plus grande
  // valeur.
  function moreOf({ b, a }) {
    const odds = h(
      'ul',
      { class: 'aqm-odds-grid' },
      report.rarities
        .filter((r) => a.odds[r.code])
        .map((r) => {
          const o = a.odds[r.code];
          return h('li', {}, rarityCode(r.code), h('strong', {}, pct(o.chance)), h('small', {}, `nouvelle : ${pct(o.freshChance)}`));
        })
    );
    const pool = b.pool?.cards
      ? b.pool.missing
        ? `${fmt(b.pool.cards)} cartes possibles, dont ${fmt(b.pool.missing)} que tu n’as pas encore (${pct(b.pool.missing / b.pool.cards)}).`
        : `${fmt(b.pool.cards)} cartes possibles : tu les as toutes.`
      : null;
    const cards =
      (goal === 'name' || goal === 'series') && a.targets.length
        ? [h('p', { class: 'aqm-label' }, `Cartes de « ${query} » dans ce booster`), cardStrip(a.targets.slice(0, 4), (x) => `${pct(x.chance)} par booster${x.own ? ` · tu l’as (${x.own})` : ' · tu ne l’as pas'}`)]
        : a.best.length
          ? [h('p', { class: 'aqm-label' }, 'Les cartes les plus chères qui te manquent'), cardStrip(a.best, (x) => h('span', {}, x.v ? h('span', {}, '≈ ', perles(x.v), ' · ') : '', `${pct(x.chance)} par booster`))]
          : [];
    return h(
      'details',
      { class: 'aqm-rank-more' },
      h('summary', {}, 'Détails'),
      h('p', { class: 'aqm-label' }, 'Chance d’avoir au moins une carte de chaque rareté'),
      odds,
      pool ? h('p', { class: 'aqm-muted' }, pool) : null,
      b.series.length > 2 ? h('p', { class: 'aqm-muted' }, `Séries : ${b.series.map((s) => s.title).join(', ')}.`) : null,
      ...cards
    );
  }

  function renderControls() {
    goalRow.replaceChildren(
      ...GOALS.map(([value, label]) =>
        h(
          'button',
          {
            type: 'button',
            class: `aqm-chip aqm-goal${value === goal ? ' is-on' : ''}`,
            'aria-pressed': String(value === goal),
            onclick: () => {
              if (value === goal) return;
              const typed = goal === 'name' || goal === 'series';
              goal = value;
              sortBy = 'rate';
              if (typed || goal === 'name' || goal === 'series') {
                query = '';
                search.value = '';
                refresh();
              }
              render();
            }
          },
          label
        )
      )
    );
    if (goal === 'rarity')
      pickRow.replaceChildren(
        h(
          'div',
          { class: 'aqm-chips' },
          report.rarities.map((r) =>
            h(
              'button',
              {
                type: 'button',
                class: `aqm-chip aqm-chip-r aqm-r-${r.code}${r.code === rarity ? ' is-on' : ''}`,
                'aria-pressed': String(r.code === rarity),
                onclick: () => {
                  rarity = r.code;
                  render();
                }
              },
              rarityName(r.code)
            )
          )
        )
      );
    else if (goal === 'name' || goal === 'series') {
      search.placeholder = goal === 'name' ? 'Nom d’un personnage…' : 'Nom d’une série…';
      search.setAttribute('aria-label', search.placeholder);
      if (pickRow.firstChild !== searchBox) pickRow.replaceChildren(searchBox);
    } else pickRow.replaceChildren();

    const newChips =
      goal === 'rarity' || goal === 'name' || goal === 'series'
        ? h(
            'div',
            { class: 'aqm-chips aqm-new' },
            [
              [false, 'Même celles que j’ai'],
              [true, 'Seulement celles qui me manquent']
            ].map(([value, label]) =>
              h(
                'button',
                {
                  type: 'button',
                  class: `aqm-chip${value === onlyNew ? ' is-on' : ''}`,
                  'aria-pressed': String(value === onlyNew),
                  onclick: () => {
                    onlyNew = value;
                    render();
                  }
                },
                label
              )
            )
          )
        : null;
    const text = {
      collection: 'Pour des cartes que tu n’as pas encore, de n’importe quelle rareté.',
      rarity: `Pour n’importe quelle carte ${rarityName(rarity)}${onlyNew ? ' que tu n’as pas encore' : ' (même une que tu as déjà)'}.`,
      name: query ? `Pour une carte de « ${query} »${onlyNew ? ' que tu n’as pas encore' : ' (même une que tu as déjà)'}.` : 'Tape le nom d’un personnage pour savoir quel booster te donne le plus de chances de l’avoir.',
      series: query ? `Pour une carte de la série « ${query} »${onlyNew ? ' que tu n’as pas encore' : ' (même une que tu as déjà)'}.` : 'Tape le nom d’une série pour savoir quel booster te donne le plus de ses cartes.',
      value: 'Pour la valeur au marché des 5 cartes du booster.'
    }[goal];
    sentence.replaceChildren(h('p', {}, text), newChips);

    const sorts = SORTS[goal] ?? SORTS.other;
    sortRow.replaceChildren(
      h('span', { class: 'aqm-filter-name' }, 'Classer par'),
      ...['price', 'rate'].map((key) =>
        h(
          'button',
          {
            type: 'button',
            class: `aqm-sort${key === sortBy ? ' is-on' : ''}`,
            'aria-pressed': String(key === sortBy),
            onclick: () => {
              sortBy = key;
              render();
            }
          },
          h('strong', {}, sorts[key][0]),
          h('small', {}, sorts[key][1])
        )
      )
    );
  }

  function render() {
    renderControls();
    if ((goal === 'name' || goal === 'series') && !query) {
      summary.hidden = true;
      summary.replaceChildren();
      list.replaceChildren();
      return;
    }
    if ((goal === 'name' || goal === 'series') && !report.catalog) {
      summary.hidden = true;
      summary.replaceChildren();
      list.replaceChildren(h('li', { class: 'aqm-empty' }, 'Le catalogue du jeu est indisponible : impossible de chercher un personnage ou une série pour le moment.'));
      return;
    }
    let rows = report.rows.map((r) => ({ ...r, m: measure(r) }));
    if (goal !== 'collection' && goal !== 'value') rows = rows.filter((r) => r.m.rate > 0);
    if (!rows.length) {
      summary.hidden = true;
      summary.replaceChildren();
      list.replaceChildren(h('li', { class: 'aqm-empty' }, goal === 'rarity' ? `Aucun booster en vente ne peut te donner une ${rarityName(rarity)}${onlyNew ? ' que tu n’as pas' : ''}.` : `Aucun booster en vente ne peut te donner « ${query} »${onlyNew ? ' (tu as peut-être déjà toutes ses cartes)' : ''}.`));
      return;
    }
    const last = Number.MAX_VALUE;
    rows.sort((x, y) => (sortBy === 'rate' ? y.m.rate - x.m.rate : (x.m.cost ?? last) - (y.m.cost ?? last)) || x.b.price - y.b.price);
    const topRate = Math.max(...rows.map((r) => r.m.rate));
    const bestRate = rows.reduce((x, y) => (y.m.rate > x.m.rate ? y : x));
    const cheapest = rows.reduce((x, y) => ((y.m.cost ?? last) < (x.m.cost ?? last) ? y : x));
    const worst = rows.reduce((x, y) => (y.m.rate < x.m.rate ? y : x));

    // Le meilleur et le pire en deux lignes.
    const lines = [];
    if (goal === 'collection') {
      lines.push(['Le plus de cartes nouvelles', bestRate, ` · ≈ ${dec(bestRate.a.fresh, 1)} par booster.`]);
      if (cheapest.a.perFresh != null) lines.push(['Moins cher', cheapest, ` · ≈ ${fmt(cheapest.a.perFresh)} Perles par carte nouvelle.`]);
    } else if (goal === 'value') {
      lines.push(['Meilleur rendement', bestRate, ` · tes cartes valent ×${dec(bestRate.a.ratio)} le prix (≈ ${fmt(bestRate.a.ev)} Perles de cartes pour ${fmt(bestRate.b.price)}).`]);
    } else {
      const p = bestRate.m.rate;
      lines.push(['Meilleur taux', bestRate, ` · ${pct(p)} de chance à chaque booster, ${boostersFor(p)} (≈ ${fmt(bestRate.b.price / p)} Perles en moyenne).`]);
      if (cheapest !== bestRate && cheapest.m.cost != null) lines.push(['Moins cher', cheapest, ` · ≈ ${fmt(cheapest.m.cost)} Perles en moyenne, avec ${pct(cheapest.m.rate)} de chance par booster.`]);
    }
    if (rows.length > 1 && worst !== bestRate && worst.m.rate > 0)
      lines.push([goal === 'value' ? 'Pire rendement' : goal === 'collection' ? 'Le moins de cartes nouvelles' : 'Pire taux', worst, goal === 'value' ? ` · ×${dec(worst.a.ratio)} le prix.` : ` · ${dec(topRate / worst.m.rate, 1)} fois moins ${goal === 'collection' ? 'de cartes nouvelles' : 'de chances'} que le meilleur.`]);
    summary.hidden = false;
    summary.replaceChildren(...lines.map(([label, r, text]) => h('p', {}, h('strong', {}, `${label} : `), r.b.name, text)));

    list.replaceChildren(
      ...rows.map((r, i) => {
        const share = topRate > 0 ? r.m.rate / topRate : 0;
        const badges = [];
        if (r === bestRate) badges.push(h('span', { class: 'aqm-badge is-best' }, goal === 'value' ? 'Meilleur rendement' : goal === 'collection' ? 'Le plus de nouvelles' : 'Meilleur taux'));
        if (r === cheapest && cheapest !== bestRate && goal !== 'value') badges.push(h('span', { class: 'aqm-badge is-cheap' }, 'Moins cher'));
        return h(
          'li',
          { class: `aqm-rank${r === bestRate ? ' is-best' : ''}` },
          h('span', { class: 'aqm-rank-n' }, String(i + 1)),
          packArt(r.b),
          h(
            'div',
            { class: 'aqm-rank-main' },
            h('p', { class: 'aqm-rank-title' }, h('strong', {}, r.b.name), h('span', { class: 'aqm-rank-price' }, perles(r.b.price), ' le booster'), ...badges),
            h('p', { class: 'aqm-rank-head' }, r.m.head),
            h('p', { class: 'aqm-rank-sub' }, r.m.sub, ` · ${guaranteeOf(r.b)} · ${seriesOf(r.b)}`, r.b.endsAt ? ` · jusqu’au ${new Date(r.b.endsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''),
            h('div', { class: 'aqm-rank-bar' }, h('span', { style: `width:${(100 * share).toFixed(1)}%` })),
            moreOf(r)
          ),
          h(
            'div',
            { class: 'aqm-rank-side' },
            h('strong', {}, r.m.big),
            h('small', {}, r.m.bigSub),
            h('span', { class: 'aqm-rank-ref' }, r === bestRate ? `${goal === 'value' ? 'Rendement' : 'Taux'} 100 % (la référence)` : `${goal === 'value' ? 'Rendement' : 'Taux'} ${Math.round(100 * share)} % du meilleur`)
          )
        );
      })
    );
  }

  render();
}
