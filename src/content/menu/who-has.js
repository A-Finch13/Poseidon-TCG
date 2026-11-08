// Aquaman, code de la page : « Qui a tiré… ? », qui a une carte.

// ---------- qui a une carte ----------

// « il y a 5 min », « il y a 3 h », « il y a 2 j ».
function timeAgo(at) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

// Photo de profil d'un joueur (un carré vide pour un profil privé), pour le retrouver sur le site.
const avatarOf = (player) =>
  player?.id ? h('img', { class: 'aqm-avatar aqm-avatar-sm', src: avatarUrl(player.id), alt: '', loading: 'lazy' }) : h('span', { class: 'aqm-avatar aqm-avatar-sm' });

// Une ligne d'une liste de joueurs : le numéro de la carte, le joueur (photo et lien vers son profil) et un détail à
// droite.
const playerRow = (serial, player, right, card) =>
  h(
    'li',
    { class: 'aqm-owner' },
    h('span', { class: 'aqm-owner-serial' }, serial != null ? `#${serial}${card?.maxCopies ? `/${card.maxCopies}` : ''}` : ''),
    avatarOf(player),
    player?.id ? h('a', { href: `/profile/${encodeURIComponent(player.id)}` }, player.name || 'Un joueur') : h('span', { class: 'aqm-muted' }, player?.name || 'Un joueur au profil privé'),
    h('span', { class: 'aqm-owner-right' }, right ?? '')
  );

// Tirages récents des « beaux tirages » gardés par Aquaman, en lignes.
const pullRows = (pulls) =>
  pulls.map((p) =>
    h(
      'li',
      { class: 'aqm-pull' },
      h('a', { href: `/jeu/carte/${encodeURIComponent(p.card.id)}`, class: 'aqm-pull-card' }, h('img', { src: cardImageUrl(p.card.image), alt: '', loading: 'lazy' })),
      h(
        'div',
        { class: 'aqm-pull-main' },
        h('p', { class: 'aqm-mini-name' }, rarityCode(p.card.rarity), ' ', p.card.name, p.serial != null ? h('span', { class: 'aqm-muted' }, ` #${p.serial}${p.card.maxCopies ? `/${p.card.maxCopies}` : ''}`) : null),
        p.card.series ? h('p', { class: 'aqm-muted aqm-pull-series' }, p.card.series) : null
      ),
      h(
        'div',
        { class: 'aqm-pull-who' },
        h(
          'span',
          { class: 'aqm-pull-player' },
          avatarOf(p.player),
          p.player?.id ? h('a', { href: `/profile/${encodeURIComponent(p.player.id)}` }, p.player.name || 'Un joueur') : h('span', {}, p.player?.name || 'Un joueur')
        ),
        h('small', { title: new Date(p.at).toLocaleString('fr-FR') }, timeAgo(p.at))
      )
    )
  );

// Avec un id de carte (le bouton de sa page), la fenêtre s'ouvre sur cette carte.
async function openWhoHas(cardId) {
  const body = openOverlay('Qui a cette carte ?', 'Cherche n’importe quel personnage : les joueurs qui ont sa carte, qui la vendent et qui l’ont tirée récemment.');
  const search = h('input', { type: 'search', class: 'aqm-search', placeholder: 'Nom d’un personnage ou d’une série…', 'aria-label': 'Personnage ou série', autocomplete: 'off' });
  const view = h('div', { class: 'aqm-who' });
  body.append(h('div', { class: 'aqm-pick' }, search), view);
  let asked = 0;
  let timer = 0;

  // Sans choix : les cartes qui correspondent à la recherche, puis les tirages récents qui y correspondent.
  async function showSearch() {
    const n = ++asked;
    const query = search.value.trim();
    view.replaceChildren(h('p', { class: 'aqm-note' }, 'Recherche…'));
    const [found, pulled] = await Promise.all([
      query.length >= 2 ? ask({ type: 'card-search', query }).catch(() => ({ cards: [] })) : { cards: [] },
      ask({ type: 'who-pulled', query, rarity: '' }).catch((e) => ({ error: e.message }))
    ]);
    if (n !== asked) return;
    const parts = [];
    if (query.length >= 2) {
      parts.push(h('p', { class: 'aqm-label' }, 'Cartes du jeu'));
      parts.push(
        found.cards.length
          ? h(
              'ul',
              { class: 'aqm-strip aqm-who-cards' },
              found.cards.map((c) =>
                h(
                  'li',
                  { class: `aqm-mini${c.owned ? ' is-owned' : ''}`, role: 'button', tabindex: '0', title: `Qui a ${c.name} ?`, onclick: () => showCard(c.id), onkeydown: (e) => e.key === 'Enter' && showCard(c.id) },
                  h('img', { src: cardImageUrl(c.image), alt: '', loading: 'lazy' }),
                  h('div', {}, h('p', { class: 'aqm-mini-name' }, rarityCode(c.rarity), ' ', c.name, c.variant ? ` (${c.variant})` : ''), h('p', { class: 'aqm-muted' }, c.series ?? ''))
                )
              )
            )
          : h('p', { class: 'aqm-muted' }, `Aucune carte ne s’appelle « ${query} ».`)
      );
    } else parts.push(h('p', { class: 'aqm-note' }, 'Tape au moins 2 lettres du nom d’un personnage, puis choisis sa carte.'));
    if (!pulled.error) {
      const since = pulled.since ? new Date(pulled.since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : null;
      parts.push(h('p', { class: 'aqm-label aqm-who-gap' }, query ? 'Tirages récents' : 'Derniers beaux tirages'));
      parts.push(h('p', { class: 'aqm-note aqm-who-note' }, `Parmi ${pulled.kept > 1 ? `les ${fmt(pulled.kept)} beaux tirages` : `${fmt(pulled.kept)} beau tirage`} (SSR, UR, SEC) relevé${pulled.kept > 1 ? 's' : ''} par les joueurs qui ont Aquaman${since ? ` depuis le ${since}` : ''}${pulled.shared ? '' : ' (base commune injoignable : seulement ceux de cet appareil)'}.${pulled.latest ? ` Dernier tirage reçu ${timeAgo(pulled.latest)}.` : ''}`));
      parts.push(pulled.pulls.length ? h('ol', { class: 'aqm-pulled' }, pullRows(pulled.pulls.slice(0, 50))) : h('p', { class: 'aqm-muted' }, 'Aucun tirage récent.'));
    }
    view.replaceChildren(...parts);
  }

  // Une carte : tous ceux qu'Aquaman peut voir avec elle.
  async function showCard(id) {
    const n = ++asked;
    view.replaceChildren(h('p', { class: 'aqm-note' }, 'Recherche des joueurs qui ont cette carte…'));
    let r;
    try {
      r = await ask({ type: 'card-owners', id });
    } catch (e) {
      view.replaceChildren(h('p', { class: 'aqm-note' }, e.message));
      return;
    }
    if (n !== asked) return;
    const c = r.card;
    const stat = (label, value) => (value == null ? null : h('div', { class: 'aqm-metric' }, h('small', {}, label), h('strong', {}, value)));
    const section = (title, items, empty) => [h('p', { class: 'aqm-label aqm-who-gap' }, title), items.length ? h('ul', { class: 'aqm-owners' }, items) : h('p', { class: 'aqm-muted' }, empty)];
    view.replaceChildren(
      h('button', { type: 'button', class: 'aqm-chip aqm-who-back', onclick: showSearch }, '← Retour à la recherche'),
      h(
        'div',
        { class: 'aqm-who-card' },
        h('a', { href: `/jeu/carte/${encodeURIComponent(c.id)}` }, h('img', { src: cardImageUrl(c.image), alt: '' })),
        h(
          'div',
          {},
          h('p', { class: 'aqm-pack-title' }, rarityCode(c.rarity), ' ', c.name, c.variant ? ` (${c.variant})` : ''),
          c.series ? h('p', { class: 'aqm-muted' }, c.series) : null,
          h('p', { class: 'aqm-muted' }, c.owned ? `Tu l’as${c.owned > 1 ? ` (${c.owned} exemplaires)` : ''}.` : 'Tu ne l’as pas.'),
          h(
            'div',
            { class: 'aqm-who-stats' },
            stat('Joueurs qui l’ont', c.owners != null ? fmt(c.owners) : null),
            stat('En circulation', c.circulation != null ? fmt(c.circulation) : null),
            stat('Recherchée par', c.wants != null ? fmt(c.wants) : null),
            stat('Tirage', c.maxCopies ? `${fmt(c.minted ?? 0)}/${fmt(c.maxCopies)}` : 'Illimité')
          )
        )
      ),
      ...(r.holders
        ? section(`Détenteurs · ${fmt(r.holders.length)}`, r.holders.map((x) => playerRow(x.serial, x.player, null, c)), 'Personne ne l’a encore.')
        : [
            h(
              'p',
              { class: 'aqm-note' },
              c.owners
                ? `${fmt(c.owners)} joueur${c.owners > 1 ? 's l’ont' : ' l’a'}, mais le jeu ne publie la liste des détenteurs que pour les cartes à tirage limité. Voici ceux qu’Aquaman peut voir.`
                : 'Personne n’a encore cette carte.'
            )
          ]),
      ...section(
        'En vente au marché',
        r.market.map((x) => playerRow(x.serial, x.player, x.price != null ? h('span', {}, perles(x.price)) : null, c)),
        'Personne ne la vend en ce moment.'
      ),
      ...section(
        'Parmi toi et tes amis',
        r.friends.map((x) => playerRow(x.serials[0] ?? null, { ...x.player, name: x.me ? `${x.player.name ?? 'Toi'} (toi)` : x.player.name }, x.count > 1 ? `×${x.count}` : null, c)),
        'Aucun de tes amis ne l’a (ou leur collection est privée).'
      ),
      ...(r.holders
        ? []
        : section(
            `Vus avec cette carte${r.seen?.length ? ` · ${fmt(r.seen.length)}` : ''}`,
            (r.seen ?? []).map((x) => playerRow(x.serials[0] ?? null, x.player, h('small', { title: `Collection lue le ${new Date(x.seenAt).toLocaleString('fr-FR')}` }, `${x.count > 1 ? `×${x.count} · ` : ''}${timeAgo(x.seenAt)}`), c)),
            r.scanned
              ? `Aucun des ${fmt(r.scanned)} joueurs dont Aquaman a lu la collection ne l’a.`
              : 'Aquaman lit la collection des joueurs qui font un beau tirage : ils apparaîtront ici au fil du temps.'
          )),
      ...section(
        r.pulls.length
          ? `Tirée ${r.pulls.length} fois${r.pullsSince ? ` depuis le ${new Date(r.pullsSince).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''}`
          : 'Tirée récemment',
        r.pulls.map((x) => playerRow(x.serial, x.player, h('small', { title: new Date(x.at).toLocaleString('fr-FR') }, timeAgo(x.at)), c)),
        `Aucun tirage relevé${r.pullsSince ? ` depuis le ${new Date(r.pullsSince).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''} par les joueurs qui ont Aquaman (le jeu ne publie que les beaux tirages SSR, UR et SEC).`
      ),
      ...(r.holders ? [] : farther(c, n))
    );
  }

  // « Chercher parmi les joueurs vus récemment » : leurs collections publiques, lues quelques-unes à la fois.
  function farther(c, n) {
    const list = h('ul', { class: 'aqm-owners' });
    const note = h('p', { class: 'aqm-muted', role: 'status' });
    const go = h('button', { type: 'button', class: 'aqm-album-btn is-main' }, '🔍 Chercher parmi les joueurs vus récemment');
    go.addEventListener('click', async () => {
      go.disabled = true;
      let players;
      try {
        players = (await ask({ type: 'known-players' })).players;
      } catch (e) {
        note.textContent = e.message;
        return;
      }
      let done = 0;
      let found = 0;
      let hidden = 0;
      for (let i = 0; i < players.length; i += 6) {
        if (n !== asked) return; // le joueur est passé à autre chose
        note.textContent = `${done}/${players.length} joueurs regardés · ${found} l’${found > 1 ? 'ont' : 'a'}…`;
        const part = players.slice(i, i + 6);
        const r = await ask({ type: 'owners-among', id: c.id, players: part }).catch(() => ({ found: [], hidden: part.length }));
        done += part.length;
        hidden += r.hidden;
        found += r.found.length;
        list.append(...r.found.map((x) => playerRow(x.serials[0] ?? null, x.player, x.count > 1 ? `×${x.count}` : null, c)));
      }
      go.hidden = true;
      note.textContent = players.length
        ? `${players.length} joueur${players.length > 1 ? 's' : ''} vu${players.length > 1 ? 's' : ''} récemment regardé${players.length > 1 ? 's' : ''} : ${found} l’${found > 1 ? 'ont' : 'a'}${hidden ? ` (${hidden} collection${hidden > 1 ? 's' : ''} privée${hidden > 1 ? 's' : ''} ou illisible${hidden > 1 ? 's' : ''})` : ''}.`
        : 'Aquaman n’a pas encore vu d’autres joueurs : il les découvre dans les beaux tirages, au fil du temps.';
    });
    return [h('p', { class: 'aqm-label aqm-who-gap' }, 'Chercher plus loin'), h('p', { class: 'aqm-muted' }, 'Aquaman peut regarder la collection publique des joueurs vus dans les beaux tirages relevés par tous les joueurs qui l’ont.'), go, note, list];
  }

  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(showSearch, 300);
  });
  if (typeof cardId === 'string') showCard(cardId);
  else showSearch();
}
