// Aquaman, code de la page : la page d'une carte, « Qui a cette carte ? » sous « Mes exemplaires ».

// ---------- page d'une carte : « Qui a cette carte ? » sous « Mes exemplaires » ----------

const cardRarity = new Map(); // id de carte -> sa rareté, ou une promesse pendant qu'on interroge le jeu

function markCardWho() {
  const id = decodeURIComponent(location.pathname.match(/^\/jeu\/carte\/([^/]+)/)?.[1] ?? '');
  if (!id) return;
  const rarity = cardRarity.get(id);
  if (rarity === undefined) {
    cardRarity.set(
      id,
      ask({ type: 'card-rarity', id })
        .then((r) => cardRarity.set(id, r.rarity ?? ''))
        .catch(() => cardRarity.delete(id))
        .finally(schedule)
    );
    return;
  }
  if (typeof rarity !== 'string' || RANKED.indexOf(rarity) < RANKED.indexOf('SSR')) return;
  const label = elementsWithText(document.body, /^\s*mes exemplaires\s*$/i)[0];
  if (!label) return;
  // Le panneau sous le titre : sa rangée de boutons (« Voir au marché », « Je la cherche »), ou le panneau lui-même.
  let section = label.parentElement;
  while (section && section !== document.body && section.textContent.trim().length <= label.textContent.trim().length + 5) section = section.parentElement;
  if (!section || section === document.body) return;
  const old = section.querySelector('.aqm-card-who');
  if (old?.dataset.card === id) return;
  old?.remove();
  const game = [...section.querySelectorAll('button, a')].find((b) => !b.closest('.aqm-root') && /^(voir au march[ée]|je la cherche|je ne la cherche plus)/i.test(b.textContent.trim()));
  const btn = h('button', { type: 'button', class: `aqm-root aqm-card-who${game ? '' : ' aqm-album-btn'}`, 'data-card': id }, h('span', { class: 'aqm-card-who-icon', html: ICON_SEARCH }), 'Qui a cette carte ?');
  // L'aspect du bouton sombre du jeu, quand il y en a un à côté.
  const twin = [...section.querySelectorAll('button')].filter((b) => !b.closest('.aqm-root')).pop();
  if (game && twin) btn.className = `${twin.className} aqm-root aqm-card-who`;
  btn.addEventListener('click', () => openWhoHas(id));
  if (game) game.parentElement.append(btn);
  else section.append(h('div', { class: 'aqm-root aqm-card-who-row' }, btn));
  btn.dataset.card = id;
}
