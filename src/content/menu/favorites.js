// Aquaman, code de la page : la fenêtre des séries favorites.

async function openFavorites() {
  const body = openOverlay('Séries favorites', 'Les personnages de tes séries favorites : ceux que tu as, ceux qui te manquent, et ta liste de recherches du jeu.');
  body.parentElement.classList.add('aqm-panel-wide');
  const status = h('p', { class: 'aqm-note' }, 'Chargement de tes séries…');
  body.append(status);
  let report;
  let show = 'missing';
  const opened = new Set(); // séries dont les cartes sont affichées (« Détails »)
  let rarity = '';
  let fresh = true;
  const load = async () => {
    report = await ask({ type: 'favorites', fresh });
    fresh = false;
    favIds = new Set(report.favorites.map((s) => s.id));
    seriesBySlug = new Map(report.all.map((s) => [s.slug, s.id]));
  };
  try {
    await load();
  } catch (e) {
    status.textContent = e.message;
    return;
  }
  status.remove();

  const suggestions = h('datalist', { id: 'aqm-series-suggest' });
  const add = h('input', { type: 'search', class: 'aqm-search', placeholder: 'Ajouter une série aux favoris…', 'aria-label': 'Ajouter une série', list: 'aqm-series-suggest', autocomplete: 'off' });
  const found = h('ul', { class: 'aqm-fav-found' });
  const filters = h('div', { class: 'aqm-sorts' });
  const content = h('div', { class: 'aqm-fav-list' });
  body.append(h('div', { class: 'aqm-pick' }, add), found, filters, content, suggestions);
  // Une fois un ajout terminé ou les cartes en attente retirées, les séries montrent ce qui reste à rechercher.
  filters.before(
    searchPanel(async () => {
      fresh = true;
      try {
        await load();
      } catch {}
      render();
    })
  );

  // Séries qui correspondent à ce qui est tapé, chacune avec une étoile.
  const renderFound = () => {
    const q = add.value
      .trim()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    const fold = (s) =>
      String(s ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
    const hits = q ? report.all.filter((s) => fold(s.title).includes(q)).slice(0, 8) : [];
    suggestions.replaceChildren(...hits.map((s) => h('option', { value: s.title })));
    found.replaceChildren(
      ...hits.map((s) =>
        h(
          'li',
          {},
          h('img', { src: `/api/covers/${s.slug}.webp`, alt: '', loading: 'lazy' }),
          h('span', {}, h('strong', {}, s.title), h('small', {}, `${fmt(s.owned)}/${fmt(s.total)}`)),
          h(
            'button',
            {
              type: 'button',
              class: `aqm-chip${favIds.has(s.id) ? ' is-on' : ''}`,
              onclick: async () => {
                await toggleFavorite(s.id, !favIds.has(s.id));
                await load();
                renderFound();
                render();
              }
            },
            favIds.has(s.id) ? '★ Favorite' : '☆ Ajouter'
          )
        )
      )
    );
  };
  add.addEventListener('input', renderFound);

  const chip = (value, label, current, pick) =>
    h('button', { type: 'button', class: `aqm-chip${value === current ? ' is-on' : ''}`, 'aria-pressed': String(value === current), onclick: () => pick(value) }, label);

  function render() {
    filters.replaceChildren(
      h('span', { class: 'aqm-filter-name' }, 'Afficher'),
      ...[
        ['all', 'Toutes'],
        ['missing', 'Manquantes'],
        ['owned', 'Possédées'],
        ['wanted', 'Recherchées']
      ].map(([v, l]) =>
        chip(v, l, show, (x) => {
          show = x;
          render();
        })
      ),
      h('span', { class: 'aqm-filter-name aqm-gap' }, 'Rareté'),
      ...[['', 'Toutes'], ...RANKED.map((c) => [c, c])].map(([v, l]) =>
        chip(v, l, rarity, (x) => {
          rarity = x;
          render();
        })
      )
    );
    if (!report.favorites.length) {
      content.replaceChildren(h('p', { class: 'aqm-empty' }, 'Aucune série favorite pour le moment : ajoute-en avec le champ ci-dessus, ou avec l’étoile ☆ sur les séries de la page Collection.'));
      return;
    }
    content.replaceChildren(
      ...report.favorites.map((s) => {
        const keep = (c) => (!rarity || c.rarity === rarity) && (show === 'all' || (show === 'missing' && !c.owned) || (show === 'owned' && c.owned > 0) || (show === 'wanted' && c.wanted));
        const cards = s.cards.filter(keep).sort((a, b) => RANKED.indexOf(b.rarity) - RANKED.indexOf(a.rarity) || a.name.localeCompare(b.name));
        const missing = s.cards.filter((c) => !c.owned);
        const toWantIds = missing.filter((c) => !c.wanted).map((c) => c.id);
        const toWant = toWantIds.length;
        const note = h('p', { class: 'aqm-muted', role: 'status' });
        const wantAll = h(
          'button',
          {
            type: 'button',
            class: 'aqm-sort is-on',
            disabled: !toWant,
            onclick: async () => {
              wantAll.disabled = true;
              note.textContent = wantsNote(await enqueueWants(toWantIds), 'tu peux fermer cette fenêtre, changer de page ou ouvrir des boosters');
            }
          },
          h('strong', {}, toWant ? `Rechercher les ${toWant} manquante${toWant > 1 ? 's' : ''}` : 'Toutes les manquantes sont recherchées'),
          h('small', {}, 'Le jeu te prévient quand elles sont mises en vente')
        );
        return h(
          'section',
          { class: 'aqm-fav-series' },
          h(
            'div',
            { class: 'aqm-fav-head' },
            h('img', { src: `/api/covers/${s.slug}.webp`, alt: '', loading: 'lazy' }),
            h(
              'div',
              { class: 'aqm-fav-title' },
              h('strong', {}, s.title),
              h('small', {}, `${fmt(s.owned)}/${fmt(s.total)} cartes · ${fmt(missing.length)} manquante${missing.length > 1 ? 's' : ''}`),
              h('span', { class: 'aqm-bar' }, h('span', { style: `width:${s.total ? ((100 * s.owned) / s.total).toFixed(1) : 0}%` }))
            ),
            wantAll,
            h(
              'button',
              {
                type: 'button',
                class: `aqm-chip aqm-fav-details${opened.has(s.id) ? ' is-on' : ''}`,
                'aria-expanded': String(opened.has(s.id)),
                onclick: () => {
                  opened.has(s.id) ? opened.delete(s.id) : opened.add(s.id);
                  render();
                }
              },
              opened.has(s.id) ? 'Masquer ▴' : `Détails ▾`
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'aqm-chip is-on aqm-fav-unstar',
                title: 'Retirer des séries favorites',
                onclick: async () => {
                  await toggleFavorite(s.id, false);
                  await load();
                  render();
                }
              },
              '★'
            )
          ),
          note,
          !opened.has(s.id)
            ? null
            : cards.length
            ? h(
                'ul',
                { class: 'aqm-fav-cards' },
                cards.map((c) => {
                  const want = h(
                    'button',
                    {
                      type: 'button',
                      class: `aqm-want${c.wanted ? ' is-on' : ''}${c.waiting ? ' is-wait' : ''}`,
                      title: c.waiting ? 'En attente dans Aquaman (ta liste du jeu est pleine) : ne plus la chercher' : c.wanted ? 'Ne plus la chercher' : 'Je la cherche : être prévenu quand elle est mise en vente',
                      onclick: async (e) => {
                        e.preventDefault();
                        want.disabled = true;
                        try {
                          const r = await wantCard(c.id, !c.wanted);
                          c.wanted = r.wanted;
                          c.waiting = false;
                          want.classList.toggle('is-on', c.wanted);
                          want.classList.remove('is-wait');
                          want.title = c.wanted ? 'Ne plus la chercher' : 'Je la cherche : être prévenu quand elle est mise en vente';
                        } catch (err) {
                          want.title = err.message;
                        } finally {
                          want.disabled = false;
                        }
                      }
                    },
                    '🔭'
                  );
                  return h(
                    'li',
                    { class: `aqm-fav-card${c.owned ? ' is-owned' : ''}` },
                    h('a', { href: `/jeu/carte/${encodeURIComponent(c.id)}` }, h('img', { src: cardImageUrl(c.image), alt: '', loading: 'lazy' })),
                    h('p', { class: 'aqm-mini-name' }, rarityCode(c.rarity), ' ', c.name),
                    h('p', { class: 'aqm-muted' }, c.owned ? (c.owned > 1 ? `×${c.owned}` : 'Possédée') : 'Manquante'),
                    c.owned ? null : want
                  );
                })
              )
            : h('p', { class: 'aqm-muted' }, 'Aucune carte pour ce filtre.')
        );
      })
    );
  }

  render();
}
