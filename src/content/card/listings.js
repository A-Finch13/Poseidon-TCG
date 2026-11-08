// Aquaman, code de la page : la page d'une carte, ses offres et enchères les moins chères sur le marché.

// ---------- page d'une carte : ses 5 offres les moins chères sur le marché ----------
// Sous le panneau « Cote » du jeu : les offres de la moins chère à la plus chère, chacune avec son vendeur et son
// numéro.

let listingsFor = null; // la carte dont les offres sont affichées (ou en cours de lecture)
function markCardListings() {
  const id = location.pathname.match(/^\/jeu\/carte\/([^/?#]+)/)?.[1];
  const box = document.querySelector('.aqm-listings');
  if (!id) return void box?.remove();
  const cote = [...document.querySelectorAll('p, span, h2, h3, div')].find((el) => !el.closest('.aqm-root') && !el.childElementCount && /^cote$/i.test(el.textContent.trim()));
  // Le panneau de la « Cote » : la boîte la plus haute autour de son titre qui ne contient le titre d'aucun autre
  // panneau.
  let panel = cote;
  while (panel?.parentElement && !/mes exemplaires/i.test(panel.parentElement.textContent)) panel = panel.parentElement;
  if (!panel || panel === cote) return;
  if (box?.dataset.card === id && box.previousElementSibling === panel) return;
  if (listingsFor === id && box) return;
  box?.remove();
  listingsFor = id;
  const fresh = h('section', { class: 'aqm-root aqm-listings', 'data-card': id }, h('p', { class: 'aqm-label' }, 'En vente au marché'), h('p', { class: 'aqm-muted' }, 'Lecture des offres…'));
  panel.after(fresh);
  showListings(fresh, decodeURIComponent(id), false);
}

// Les offres dans leur boîte, de la moins chère à la plus chère, chacune avec son vendeur, son numéro et un bouton pour
// l'acheter (pas celles du joueur) ; relues après un achat.
function showListings(fresh, cardId, again) {
  ask({ type: 'card-listings', id: cardId, fresh: again })
    .then((r) => {
      if (!fresh.isConnected) return;
      const rows = r.offers.map((o) =>
        playerRow(
          o.serial,
          o.player,
          h('span', { class: 'aqm-buy-cell' }, perles(o.price), o.id && o.player?.id !== meId ? buyButton(o, fresh, cardId) : null),
          { maxCopies: r.maxCopies }
        )
      );
      fresh.replaceChildren(
        h('div', { class: 'aqm-listings-head' },
          h('p', { class: 'aqm-label' }, 'En vente au marché'),
          h('small', { class: 'aqm-muted' }, r.count ? `${r.count > 5 ? `5 moins chères sur ${fmt(r.count)}` : `${r.count} offre${r.count > 1 ? 's' : ''}`}, de la moins chère à la plus chère` : '')),
        rows.length ? h('ul', { class: 'aqm-owners' }, rows) : h('p', { class: 'aqm-muted' }, 'Personne ne la vend pour le moment.'),
        ...auctionsPart(r.auctions, r.maxCopies)
      );
    })
    .catch((e) => fresh.isConnected && fresh.replaceChildren(h('p', { class: 'aqm-label' }, 'En vente au marché'), h('p', { class: 'aqm-muted' }, e.message)));
}

// Temps restant avant la fin d'une enchère : « 2 j 4 h », « 3 h 12 min », « 8 min ».
function timeLeft(at) {
  const m = Math.max(1, Math.round((at - Date.now()) / 60e3));
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `${Math.floor(m / 1440)} j${Math.floor((m % 1440) / 60) ? ` ${Math.floor((m % 1440) / 60)} h` : ''}`;
}

// Sous les offres, les 3 enchères en cours de la carte avec les offres les plus basses, la plus basse d'abord : l'offre
// à battre, le temps restant et un bouton vers la page de l'enchère.
// Rien quand elles n'ont pas pu être lues (null).
function auctionsPart(auctions, maxCopies) {
  if (!auctions) return [];
  const rows = auctions.slice(0, 3).map((a) =>
    playerRow(
      a.serial,
      a.player,
      h(
        'span',
        { class: 'aqm-buy-cell' },
        h('span', { class: 'aqm-auction-cell' }, perles(a.bid), h('small', { class: 'aqm-muted' }, [a.bids != null ? `${a.bids} enchère${a.bids > 1 ? 's' : ''}` : null, a.endsAt ? `fin dans ${timeLeft(a.endsAt)}` : null].filter(Boolean).join(' · '))),
        // La page de l'enchère dans le jeu (/jeu/encheres/:id), où le joueur enchérit.
        a.id ? h('a', { class: 'aqm-queue-btn is-main aqm-buy', href: `/jeu/encheres/${encodeURIComponent(a.id)}` }, a.player?.id === meId ? 'Voir' : 'Enchérir') : null
      ),
      { maxCopies }
    )
  );
  return [
    h('div', { class: 'aqm-listings-head aqm-auctions-head' },
      h('p', { class: 'aqm-label' }, 'Aux enchères'),
      h('small', { class: 'aqm-muted' }, auctions.length ? `${auctions.length > 3 ? `3 mises les plus faibles sur ${fmt(auctions.length)}` : `${auctions.length} en cours`}, de la plus faible à la plus haute` : '')),
    rows.length ? h('ul', { class: 'aqm-owners' }, rows) : h('p', { class: 'aqm-muted' }, 'Aucune enchère en cours.')
  ];
}

// Ce que dit le panneau « Mes exemplaires » du jeu pour la carte (pour voir s'il a changé).
function myCopiesText() {
  const label = [...document.querySelectorAll('p, span, h2, h3, div')].find((el) => !el.closest('.aqm-root') && !el.childElementCount && /^mes exemplaires$/i.test(el.textContent.trim()));
  // (la boîte autour du titre qui contient aussi le texte du panneau)
  let box = label;
  while (box?.parentElement && box.textContent.trim().length <= (label?.textContent.trim().length ?? 0) + 5) box = box.parentElement;
  return box?.textContent.replace(/\s+/g, ' ').trim() ?? '';
}

// Achète une offre tout de suite, comme le fait le marché du jeu ; les offres sont relues ensuite.
function buyButton(offer, box, cardId) {
  const btn = h('button', { type: 'button', class: 'aqm-queue-btn is-main aqm-buy' }, 'Acheter');
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Achat…';
    try {
      const bought = await gameWrite(`/market/listings/${encodeURIComponent(offer.id)}/buy`, 'POST');
      btn.textContent = '✅ Achetée';
      if (offer.card?.name) addBought(offer.card.name, offer.card.rarity); // ses autres ventes, cachées sur le marché
      owned = null;
      send({ type: 'collection-stale' });
      // Les Perles du jeu et les exemplaires de la carte (« Mes exemplaires ») relus depuis l'API et donnés à la page :
      // elle n'est jamais rechargée (elle perdait la place du joueur). Une fois de plus si les exemplaires sont
      // toujours les mêmes après 2 s.
      const perles = bought?.perles ?? bought?.balance ?? bought?.buyer?.perles;
      const before = myCopiesText();
      const refresh = () => window.postMessage({ aquamanCmd: 'reload-game', cardId, perles: typeof perles === 'number' ? perles : undefined }, location.origin);
      refresh();
      setTimeout(() => myCopiesText() === before && refresh(), 2000);
      setTimeout(() => box.isConnected && showListings(box, cardId, true), 1200);
    } catch (e) {
      // Le refus du jeu sous les offres (pas assez de Perles, l'offre partie…), puis les offres relues.
      btn.textContent = 'Refusé';
      btn.title = e.message;
      box.append(h('p', { class: 'aqm-muted aqm-buy-refused' }, `Achat refusé par le jeu : ${e.message}`));
      setTimeout(() => box.isConnected && showListings(box, cardId, true), 2500);
    }
  });
  return btn;
}
