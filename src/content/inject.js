// Tourne dans la page avant son chargement : dit au code de la page ce que changent les requêtes du site lui-même. Il
// ne change qu'une réponse : les boosters en attente dans /api-game/v1/me, limités à la sorte choisie sur l'accueil
// (voir home/booster-piles.js).
//   { aquaman: 'status', pending, boosters }  boosters en attente, lus dans les réponses /api-game/v1/me du site
//                                    (boosters : [{ id, kind, name, art }], kind et name null pour un classique)
//   { aquaman: 'opened', boosters }  boosters qui viennent d'être ouverts, chacun sous la forme des raretés de ses
//                                    cartes (pour les compteurs anti-malchance)
//   { aquaman: 'feed', pulls }       les « beaux tirages » du jeu, lus dans ses réponses /api-game/v1/feed
//   { aquaman: 'collection-stale' }  un booster a été ouvert, ou un échange, une vente ou un achat est passé
//   { aquaman: 'sell-refused', item, message, ticked }  le jeu a refusé de mettre un exemplaire en vente ({ cardId,
//                                    copyId, price }) ; ticked : les exemplaires encore cochés dans sa fenêtre
//                                    « Vendre mes doublons »
(() => {
  if (window.__aquamanHook) return;
  window.__aquamanHook = true;

  const ME = /^\/api-game\/v1\/me$/;
  const FEED = /^\/api-game\/v1\/feed$/;
  const OPEN = /^\/api-game\/v1\/boosters\/([^/]+\/open|open-many|open)$/;
  const ORDERS = /^\/api-game\/v1\/market\/orders$/;
  const BUY = /^\/api-game\/v1\/shop\/booster$/;
  const PLAYER_PATH = /^\/api-game\/v1\/(?:public\/)?(?:players|users)\/([^/?]+)/;
  const MARKET_BUY = /^\/api-game\/v1\/market\/listings\/([^/]+)\/buy$/;
  // Changements de Perles ou de cartes faits hors des boosters (marché, échanges, enchères, exemplaires vendus ou
  // recyclés) : l'état du jeu et la carte de la page sont relus depuis l'API ensuite. (Pas les boosters : le jeu compte
  // lui-même leurs Perles et leurs cartes, et un état relu redessinerait la pile au milieu d'une ouverture.)
  const ASSETS = /^\/api-game\/v1\/(trades(\/.*)?|market\/.*|auctions(\/.*)?|copies(\/.*)?)$/;
  const MARKET_LIST = /^\/api-game\/v1\/market\/listings$/;
  const AUCTIONS = /^\/api-game\/v1\/auctions$/;
  // La carte de chaque vente que le marché a montrée en dernier (id d'annonce -> { name, rarity }), pour la carte d'un
  // achat.
  const listingCards = new Map();
  const WRITE = /^\/api-game\/v1\/(boosters\/[^/]+\/open|boosters\/open(-many)?|shop\/booster|trades(\/.*)?|market\/.*|auctions(\/.*)?|copies(\/.*)?|recycle)$/;
  const RARITIES = ['N', 'R', 'SR', 'SSR', 'UR', 'SEC'];
  const original = window.fetch;

  // L'adresse complète d'une requête (avec ses paramètres), null si illisible.
  const requestUrl = (input) => {
    try {
      return new URL(input instanceof Request ? input.url : String(input), location.href);
    } catch {
      return null;
    }
  };
  // Les cartes que le joueur vend déjà : ses annonces (GET /market/listings?mine=1) ou ses enchères ouvertes (GET
  // /auctions?mine=selling), par id de carte ; gardées sur <html> (le code de la page peut démarrer après) et envoyées
  // au code de la page (« Déjà en vente » dans « Tes cartes à vendre »). (proposé par volcanofr)
  const emitMarketSales = (body, auctions) => {
    const kind = auctions ? 'auctions' : 'listings';
    const keys = [];
    for (const sale of Array.isArray(body?.[kind]) ? body[kind] : []) {
      if (auctions && sale?.status !== 'open') continue;
      if (typeof sale?.card?.id === 'string') keys.push(sale.card.id);
    }
    try {
      document.documentElement.setAttribute(`data-aqm-market-sales-${kind}`, JSON.stringify(keys));
    } catch {}
    post({ type: 'market-sales', kind, keys });
  };

  // La sorte de boosters choisie sur l'accueil ('classic' pour les boosters sans sorte), '' pour toutes.
  const chosenKind = () => {
    try {
      return sessionStorage.getItem('aqm-booster-kind') || '';
    } catch {
      return '';
    }
  };

  const post = (data) => window.postMessage({ aquaman: data.type, ...data }, location.origin);

  // La page envoyée par le serveur est prise en main par React morceau par morceau (hydratation), les gros (l'album)
  // parfois longtemps après le chargement de la page, ou tout de suite quand on clique dessus. Un élément qu'Aquaman
  // ajoute dans un morceau pas encore pris en main ne correspond pas à ce qu'attend React (erreur #418) et peut laisser
  // la page blanche. React marque chaque élément qu'il a pris en main (__reactProps$…, visible seulement depuis la
  // page) : dès que chaque bouton et chaque lien de la page a sa marque, data-aqm-hydrated dit au code de la page qu'il
  // peut modifier la page (après 15 s au plus, pour une page avec des boutons hors de React).
  (function watchHydration() {
    const started = Date.now();
    const taken = (el) => Object.keys(el).some((k) => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'));
    const check = () => {
      // (le contenu propre de la page : les boutons d'autres scripts, hors de <main>, ne sont jamais pris en main)
      const own = [...(document.querySelector('main') ?? document.body ?? document).querySelectorAll('button, a[href]')].filter((el) => !el.closest('[class*="aqm-"]'));
      if ((document.readyState === 'complete' && own.length && own.every(taken)) || Date.now() - started > 15e3)
        return void document.documentElement.setAttribute('data-aqm-hydrated', '');
      setTimeout(check, 150);
    };
    check();
  })();

  // Le store du jeu pour son état (/me : boosters, Perles…) : son hook useGameStore (zustand), trouvé parmi les modules
  // du site. Aquaman ajoute un module à lui dans le Turbopack du site, qui parcourt les modules déjà chargés (le c de
  // son contexte). Sinon, l'état parmi les hooks des composants du jeu. Renvoie l'état ({ load, … }).
  let storeHook = null;
  let storeState = null;
  async function gameStore() {
    if (storeHook) return storeHook.getState();
    if (storeState) return storeState;
    const T = globalThis.TURBOPACK;
    if (T && !Array.isArray(T) && typeof T.push === 'function') {
      const id = `aquaman-${Date.now()}`;
      try {
        // Deux push : le module, puis l'ordre de le lancer (un morceau a l'un ou l'autre).
        T.push([
          'aquaman-store.js',
          id,
          (ctx) => {
            for (const m of Object.values(ctx?.c ?? {}))
              try {
                const hook = m?.exports?.useGameStore;
                if (typeof hook?.getState === 'function' && typeof hook.getState()?.load === 'function') return void (storeHook = hook);
              } catch {}
          }
        ]);
        T.push(['aquaman-store-run.js', { otherChunks: [], runtimeModuleIds: [id] }]);
      } catch {}
      for (let i = 0; i < 10 && !storeHook; i++) await new Promise((r) => setTimeout(r, 20));
      if (storeHook) return storeHook.getState();
    }
    const el = document.querySelector('button, main, div');
    const key = el && Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    let fiber = key ? el[key] : null;
    while (fiber?.return) fiber = fiber.return;
    const isStore = (v) => v && typeof v === 'object' && typeof v.load === 'function' && typeof v.patch === 'function';
    const stack = fiber ? [fiber] : [];
    for (let n = 0; stack.length && n < 50000; n++) {
      const f = stack.pop();
      for (let hook = f.memoizedState, i = 0; hook && typeof hook === 'object' && 'next' in hook && i < 80; hook = hook.next, i++)
        for (const v of [hook.memoizedState, hook.queue?.lastRenderedState, Array.isArray(hook.memoizedState) ? hook.memoizedState[0] : null])
          if (isStore(v)) return (storeState = v);
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
    return null;
  }

  // Tous les boosters en attente, tels que les a donnés le dernier /me du jeu (avant le filtre). Aussi écrits dans la
  // page (data-aqm-boosters), où le code de la page les trouve dès qu'il démarre.
  let fullPending = null;
  let forcedPending = null; // les boosters fabriqués pour le relevé de l'auteur, donnés au jeu dans son prochain /me
  function keepPending(pending) {
    fullPending = pending;
    try {
      document.documentElement.setAttribute('data-aqm-boosters', JSON.stringify(pending.map((b) => ({ id: b.id, kind: b.kindId ?? null, name: b.kindName ?? null, art: b.kindArt ?? null }))));
    } catch {}
  }

  // La page d'une carte garde la carte lue depuis /cards/:id (avec les exemplaires du joueur) dans un état de ses
  // composants : la carte est relue depuis l'API et donnée à cet état, la page la dessine tout de suite. False sans un
  // tel état.
  async function refreshCardState(id) {
    const res = await fetch(`/api-game/v1/cards/${encodeURIComponent(id)}`, { credentials: 'include', headers: { accept: 'application/json' } });
    if (!res.ok) return false;
    const fresh = await res.json().catch(() => null);
    if (!fresh || typeof fresh !== 'object') return false;
    const card = fresh.card ?? fresh;
    const start =
      [...document.querySelectorAll('main p, main span, main h2, main h3')].find((el) => /^mes exemplaires$/i.test(el.textContent.trim())) ??
      document.querySelector('main *');
    const key = start && Object.keys(start).find((k) => k.startsWith('__reactFiber$'));
    const { card: _card, ...around } = fresh.card ? fresh : {};
    let done = false;
    for (let fiber = key ? start[key] : null; fiber; fiber = fiber.return) {
      for (let hook = typeof fiber.memoizedState === 'object' ? fiber.memoizedState : null; hook && 'next' in hook; hook = hook.next) {
        const s = hook.memoizedState;
        const dispatch = hook.queue?.dispatch;
        if (typeof dispatch !== 'function' || !s || typeof s !== 'object' || Array.isArray(s) || !plainState(hook.queue)) continue;
        // (l'état de la page garde sa forme : seuls les champs de même nature sont changés, aucun n'est perdu)
        if (s.id === id && 'copies' in s) dispatch(sameShape(s, { ...card, ...around }));
        else if (s.card?.id === id && s.card && typeof s.card === 'object') dispatch({ ...sameShape(s, around), card: sameShape(s.card, card) });
        else continue;
        done = true;
      }
    }
    return done;
  }

  // Un useState de la page (son réducteur rend ce qu'on lui donne), jamais un useReducer : un objet donné à un
  // réducteur qui attend une action casserait la page (une page noire après un achat).
  function plainState(queue) {
    const reducer = queue?.lastRenderedReducer;
    if (typeof reducer !== 'function') return false;
    const probe = {};
    try {
      return reducer(null, probe) === probe;
    } catch {
      return false;
    }
  }

  // old avec les champs de fresh qui ont la même nature (un tableau reste un tableau, un objet un objet, rien ne
  // devient vide), et les nouveaux champs : la page du jeu ne rencontre jamais une valeur qu'elle ne sait pas dessiner.
  function sameShape(old, fresh) {
    const next = { ...old };
    for (const [k, v] of Object.entries(fresh ?? {})) {
      if (!(k in old)) next[k] = v;
      else if (old[k] == null) next[k] = v;
      else if (v == null || Array.isArray(v) !== Array.isArray(old[k]) || typeof v !== typeof old[k]) continue;
      else next[k] = v;
    }
    return next;
  }

  // Après un changement de Perles ou de cartes, l'état du jeu (/me : Perles…) et la carte de la page sont relus depuis
  // l'API, une fois pour une rafale de changements.
  let assetsTimer = 0;
  function assetsChanged() {
    clearTimeout(assetsTimer);
    assetsTimer = setTimeout(() => {
      const cardId = location.pathname.match(/^\/jeu\/carte\/([^/?#]+)/)?.[1];
      window.postMessage({ aquamanCmd: 'reload-game', cardId: cardId ? decodeURIComponent(cardId) : undefined }, location.origin);
    }, 600);
  }

  // le code de la page demande au jeu de relire son état (ses Perles après un achat, ses boosters…), et la carte de sa
  // page (cardId) après un achat : directement depuis l'API, la page n'est pas rechargée.
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.aquamanCmd !== 'reload-game') return;
    if (e.data.assets) return void assetsChanged(); // un changement fait par Aquaman lui-même, hors du fetch de cette page
    const { cardId, perles } = e.data;
    let fixed = false;
    if (typeof cardId === 'string')
      try {
        fixed = await refreshCardState(cardId);
      } catch {}
    if (!fixed)
      try {
        window.next?.router?.refresh?.(); // les données propres de la page (les exemplaires d'une carte…)
      } catch {}
    try {
      const store = await gameStore();
      if (typeof perles === 'number') store?.setPerles?.(perles); // les Perles données par la réponse à l'achat, tout de suite
      await store?.load().catch(() => {}); // puis l'état du jeu relu depuis /me
    } catch {}
  });

  // le code de la page donne au jeu les Perles qu'a renvoyées un changement (un recyclage depuis la fenêtre de cartes)
  // : seul le nombre change, l'état n'est pas relu (il redessinerait la pile de boosters derrière la fenêtre).
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.aquamanCmd !== 'set-perles' || typeof e.data.perles !== 'number') return;
    try {
      (await gameStore())?.setPerles?.(e.data.perles);
    } catch {}
  });

  // le code de la page met le jeu sur une sorte ('' pour toutes) : la liste de boosters du jeu est changée tout de
  // suite dans son store (patch, sans requête), sinon relue à travers le filtre (load). Répond une fois que c'est fait,
  // ou tout de suite quand le store est introuvable.
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.aquamanCmd !== 'refresh-boosters') return;
    let ok = false;
    try {
      const s = await gameStore();
      const kind = e.data.kind ?? '';
      const given = Array.isArray(e.data.items) ? e.data.items : null; // le relevé de l'auteur : des boosters fabriqués par sorte
      if (s && (given || e.data.fresh || e.data.reload || !fullPending || typeof s.patch !== 'function')) {
        // Le jeu ne redessine sa pile que quand il lit ses boosters lui-même (load : il passe par son état de
        // chargement, la pile revient avec la bonne image). Sa réponse passe par le filtre de la sorte, ou porte les
        // boosters fabriqués du relevé.
        // Le relevé donne les ids des boosters du joueur : le jeu les reçoit entiers, tels que son serveur les a
        // envoyés (un booster avec un id qu'il ne connaît pas est dessiné avec l'image classique).
        forcedPending = given && given.map((b) => fullPending?.find((x) => x?.id === b.id)).filter(Boolean);
        if (given && !forcedPending.length) forcedPending = null;
        try {
          await s.load().catch(() => {});
        } finally {
          forcedPending = null;
        }
        ok = true;
      } else if (s) {
        // Retour à tous les boosters pendant que la pile du jeu est cachée : tout de suite, sans requête.
        s.patch(() => ({ pending: kind ? fullPending.filter((b) => (b?.kindId ?? 'classic') === kind) : fullPending }));
        ok = true;
      }
    } catch {}
    post({ type: 'boosters-refreshed', ok, id: e.data.id ?? null });
  });

  // Chemin d'une requête de même origine, ou null.
  function pathOf(input) {
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      return url.origin === location.origin ? url.pathname : null;
    } catch {
      return null;
    }
  }

  // Un exemplaire dans les props des composants du site ({ cardId, copyId, name, serial }), cherché quelques niveaux en
  // profondeur : { copyId } ou un { id, serial }, sa carte à côté ou autour (card : la carte rencontrée en chemin). Les
  // listes sont laissées de côté : leur premier exemplaire serait celui de chaque ligne.
  function findCopy(v, depth, card = null) {
    if (!v || typeof v !== 'object' || Array.isArray(v) || depth > 4 || v instanceof Node || v.$$typeof) return null;
    const own = v.card && typeof v.card === 'object' && !Array.isArray(v.card) ? v.card : null;
    const near = own ?? card;
    const copyId = typeof v.copyId === 'string' ? v.copyId : typeof v.id === 'string' && 'serial' in v && v.id !== near?.id && !v.rarity ? v.id : null;
    const cardId = v.cardId ?? near?.id;
    if (copyId && typeof cardId === 'string') return { cardId, copyId, name: near?.name ?? v.name ?? null, serial: v.serial ?? null };
    for (const k in v) {
      if (k === 'children' || k.startsWith('_') || typeof v[k] !== 'object') continue;
      const found = findCopy(v[k], depth + 1, near);
      if (found) return found;
    }
    return null;
  }

  // L'exemplaire affiché par un élément : lu dans les props des composants autour de lui.
  function copyOf(el) {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    let fiber = key ? el[key] : null;
    for (let i = 0; fiber && i < 20; i++, fiber = fiber.return) {
      const found = findCopy(fiber.memoizedProps, 0);
      if (found) return found;
    }
    return null;
  }

  // Les exemplaires rencontrés dans les réponses du site (id d'exemplaire -> { cardId, copyId, name, serial }), et les
  // noms des cartes : les lignes de la fenêtre « Vendre mes doublons » y sont retrouvées par leur nom et leur numéro.
  // Seulement les exemplaires du joueur connecté : la collection d'un autre joueur que lit la page (un profil, le
  // partenaire d'un échange…) n'est jamais apprise, pour que ses exemplaires ne soient jamais pris pour ceux du joueur.
  const seenCopies = new Map();
  const cardNames = new Map();
  let selfId = null; // le joueur connecté, d'après les réponses /me du jeu
  const idOfMe = (me) => [me?.id, me?.userId, me?.player?.id, me?.user?.id].find((x) => typeof x === 'string' && x) ?? null;
  function learnSelf(me) {
    const id = idOfMe(me);
    if (!id || id === selfId) return;
    if (selfId) seenCopies.clear(); // un autre compte : les exemplaires du précédent sont oubliés
    selfId = id;
  }
  // Vrai quand une réponse de ce chemin peut contenir les exemplaires du joueur : pas la collection d'un autre joueur.
  function ownAnswer(path) {
    const player = path.match(PLAYER_PATH)?.[1];
    if (!player) return true;
    try {
      return !!selfId && decodeURIComponent(player) === selfId;
    } catch {
      return false;
    }
  }

  function learnCopies(body) {
    let left = 300000;
    const walk = (v, card) => {
      if (!v || typeof v !== 'object' || --left < 0) return;
      if (Array.isArray(v)) {
        for (const x of v) walk(x, card);
        return;
      }
      const isCard = typeof v.rarity === 'string' && typeof v.name === 'string' && typeof v.id === 'string';
      if (isCard) cardNames.set(v.id, v.name);
      const own = v.card && typeof v.card === 'object' && !Array.isArray(v.card) ? v.card : null;
      const near = own ?? (isCard ? v : card);
      const copyId = typeof v.copyId === 'string' ? v.copyId : !isCard && typeof v.id === 'string' && typeof v.serial === 'number' ? v.id : null;
      const cardId = typeof v.cardId === 'string' ? v.cardId : near?.id;
      if (copyId && typeof cardId === 'string') seenCopies.set(copyId, { cardId, copyId, name: near?.name ?? null, serial: typeof v.serial === 'number' ? v.serial : null });
      for (const k in v) if (v[k] && typeof v[k] === 'object') walk(v[k], near);
    };
    walk(body, null);
  }

  // L'exemplaire d'une ligne : son numéro (#518) et le plus long nom de carte trouvé dans son texte.
  function copyOfRow(row, taken) {
    const text = row.textContent;
    const serial = Number(text.match(/#\s?(\d+)/)?.[1]);
    let best = null;
    for (const c of seenCopies.values()) {
      const name = c.name ?? cardNames.get(c.cardId);
      if (c.serial !== serial || !name || !text.includes(name) || taken.has(c.copyId)) continue;
      if (!best || name.length > best.name.length) best = { ...c, name };
    }
    return best;
  }

  // Les exemplaires encore cochés dans la fenêtre « Vendre mes doublons », dans son ordre, chacun avec le prix de sa
  // ligne (le prix tapé, sinon sa « Valeur ≈ »).
  function tickedCopies() {
    try {
      const buttons = [...document.querySelectorAll('button')].filter((b) => !b.closest('.aqm-root'));
      const bar = buttons.find((b) => /^tout (d[ée])?cocher/i.test(b.textContent.trim()));
      if (!bar) return [];
      const allTicked = /^tout d[ée]cocher/i.test(bar.textContent.trim());
      const out = [];
      const taken = new Set();
      for (const sell of buttons) {
        if (sell.textContent.trim() !== 'Vendre') continue;
        let row = sell;
        while (row.parentElement && !(row.querySelector('img') && /#\s?\d+/.test(row.textContent))) row = row.parentElement;
        const ticked = allTicked || !!row.querySelector('input[type="checkbox"]:checked, [role="checkbox"][aria-checked="true"], [data-state="checked"]');
        const copy = ticked ? copyOfRow(row, taken) ?? copyOf(sell) : null;
        if (!copy || taken.has(copy.copyId)) continue;
        taken.add(copy.copyId);
        const typed = Math.round(Number(row.querySelector('input:not([type="checkbox"])')?.value));
        const price = typed > 0 ? typed : Math.round(Number(row.textContent.match(/valeur\s*≈?\s*([\d\s  ]+)/i)?.[1]?.replace(/\s/g, '')));
        if (price > 0) out.push({ ...copy, price });
      }
      return out;
    } catch {
      return [];
    }
  }

  // Raretés des cartes de la réponse d'un booster ({ pulls: [{ card: { rarity } }] }).
  const raritiesOf = (pulls) => pulls.map((p) => p?.card?.rarity ?? p?.rarity).filter((r) => RARITIES.includes(r));

  // Les boosters d'une réponse d'ouverture : un booster, ou plusieurs (open-many), chacun sous la forme des tirages de
  // ses cartes.
  function openedBoosters(body) {
    if (Array.isArray(body?.pulls)) return [body];
    const list = body?.boosters ?? body?.results ?? body?.opened ?? (Array.isArray(body) ? body : null);
    return Array.isArray(list) ? list.filter((b) => Array.isArray(b?.pulls)) : [];
  }
  // La sorte de chaque booster d'une ouverture ({ id, name }, null quand elle est inconnue) : d'après la réponse, sinon
  // d'après l'id du booster (dans le chemin ou le corps de la requête) parmi ceux en attente, sinon la sorte qu'Aquaman
  // montre au jeu, sinon la seule sorte en attente.
  // L'id du jeu de chaque booster d'une ouverture (null quand il est inconnu) : d'après la réponse, sinon d'après la
  // requête (son chemin ou son corps). Aquaman enregistre chaque booster sous cet id, pour qu'un booster signalé deux
  // fois ne compte qu'une fois.
  function askedIds(path, init) {
    let asked = [];
    try {
      const sent = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      asked = [sent?.ids, sent?.boosterIds, sent?.boosters].find(Array.isArray) ?? (sent?.boosterId ? [sent.boosterId] : []);
    } catch {}
    const inPath = path.match(/\/boosters\/([^/]+)\/open$/)?.[1];
    if (inPath) asked = [decodeURIComponent(inPath)];
    return asked.map((x) => x?.id ?? x);
  }
  function boosterIdsOf(boosters, path, init) {
    const asked = askedIds(path, init);
    return boosters.map((b, i) => {
      const id = b?.boosterId ?? b?.booster?.id ?? (asked.length === boosters.length ? asked[i] : null);
      return typeof id === 'string' && /^[A-Za-z0-9_.:-]{1,60}$/.test(id) ? id : null;
    });
  }

  function packsOf(boosters, path, init, waiting) {
    const list = Array.isArray(waiting) ? waiting : [];
    const named = (id, name) => ({ id: id ?? 'classic', name: name ?? list.find((b) => (b?.kindId ?? 'classic') === (id ?? 'classic'))?.kindName ?? (id && id !== 'classic' ? null : 'Classique') });
    const asked = askedIds(path, init);
    const shown = chosenKind();
    const kinds = new Set(list.map((b) => b?.kindId ?? 'classic'));
    return boosters.map((b, i) => {
      const kindId = b?.kindId ?? b?.booster?.kindId;
      if (kindId) return named(kindId, b?.kindName ?? b?.booster?.kindName);
      const id = b?.boosterId ?? b?.booster?.id ?? (asked.length === boosters.length ? asked[i] : null) ?? b?.id;
      const known = id != null && list.find((x) => x?.id === id);
      if (known) return named(known.kindId, known.kindName);
      if (shown) return named(shown);
      return kinds.size === 1 ? named([...kinds][0]) : null;
    });
  }
  // La meilleure carte d'un booster ({ id, name, image, rarity }), pour l'historique anti-malchance.
  function bestCard(pulls) {
    let best = null;
    for (const p of pulls) {
      const card = p?.card ?? p;
      const rarity = card?.rarity ?? p?.rarity;
      if (RARITIES.includes(rarity) && (!best || RARITIES.indexOf(rarity) > RARITIES.indexOf(best.rarity)))
        best = { id: card.id ?? null, name: card.name ?? null, image: card.image ?? null, rarity };
    }
    return best;
  }

  // ---------- l'image d'une sorte à thème dans le pack 3D de l'ouverture ----------
  // Le jeu dessine en 3D (three.js) le pack de sa fenêtre d'ouverture avec l'image classique (classique.webp) quand il
  // ouvre plusieurs boosters, quelle que soit leur sorte. Pendant qu'Aquaman ouvre une sorte à thème (le code de la
  // page écrit son image dans data-aqm-opening-art), cette image prend la place de la classique chaque fois que le jeu
  // la dessine ou l'envoie à la 3D : la même taille (720 × 1080), rien d'autre ne change. L'image classique que garde
  // le jeu n'est jamais modifiée elle-même, donc chaque ouverture reçoit l'image de sa propre sorte.
  const CLASSIC_ART = /\/game\/boosters\/classique\.(webp|png|jpe?g)/i;
  const openingArt = () => document.documentElement.getAttribute('data-aqm-opening-art') || '';
  const isClassicUrl = (url) => {
    try {
      return CLASSIC_ART.test(decodeURIComponent(String(url ?? '')));
    } catch {
      return CLASSIC_ART.test(String(url ?? ''));
    }
  };
  const bitmap = globalThis.createImageBitmap;
  const classicBlobs = new WeakSet(); // l'image classique récupérée par le jeu
  const classicBitmaps = new WeakSet(); // et transformée en bitmaps
  const arts = new Map(); // image -> { img, bitmap }, chargée une fois
  const artOf = (url) => {
    if (!arts.has(url)) {
      const art = { img: new Image(), bitmap: null };
      art.img.decoding = 'async';
      art.img.addEventListener('load', () => bitmap?.call(globalThis, art.img).then((b) => (art.bitmap = b)).catch(() => {}), { once: true });
      art.img.src = url;
      arts.set(url, art);
    }
    return arts.get(url);
  };
  new MutationObserver(() => openingArt() && artOf(openingArt())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-aqm-opening-art'] });
  // L'image à thème à utiliser à la place d'une classique (en image ou en bitmap, comme la source), une fois chargée.
  const swapFor = (source) => {
    const url = openingArt();
    if (!url || !source) return null;
    if (source instanceof HTMLImageElement) {
      if (!isClassicUrl(source.currentSrc || source.src)) return null;
      const { img } = artOf(url);
      return img.complete && img.naturalWidth ? img : null;
    }
    if (globalThis.ImageBitmap && source instanceof ImageBitmap && classicBitmaps.has(source)) return artOf(url).bitmap;
    return null;
  };
  const blob = Response.prototype.blob;
  Response.prototype.blob = function () {
    const out = blob.call(this);
    if (isClassicUrl(this.url)) out.then((b) => classicBlobs.add(b)).catch(() => {});
    return out;
  };
  if (bitmap)
    globalThis.createImageBitmap = function (source, ...rest) {
      const out = bitmap.call(this, source, ...rest);
      const classic = (source instanceof HTMLImageElement && isClassicUrl(source.currentSrc || source.src)) || (source instanceof Blob && classicBlobs.has(source));
      if (classic) out.then((b) => classicBitmaps.add(b)).catch(() => {});
      return out;
    };
  for (const proto of [CanvasRenderingContext2D.prototype, globalThis.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean)) {
    const draw = proto.drawImage;
    proto.drawImage = function (source, ...rest) {
      return draw.call(this, swapFor(source) ?? source, ...rest);
    };
  }
  for (const proto of [globalThis.WebGLRenderingContext?.prototype, globalThis.WebGL2RenderingContext?.prototype].filter(Boolean))
    for (const name of ['texImage2D', 'texSubImage2D']) {
      const upload = proto[name];
      proto[name] = function (...args) {
        for (let i = 0; i < args.length; i++) {
          const swap = swapFor(args[i]);
          if (swap) args[i] = swap;
        }
        return upload.apply(this, args);
      };
    }

  // Seules les requêtes à l'API du jeu sont examinées ; les autres (statistiques, images…) passent tout droit.
  window.fetch = function (input, init) {
    const path = pathOf(input);
    if (!path?.startsWith('/api-game/')) return original.apply(this, arguments);
    return watch(original.apply(this, arguments), path, input, init);
  };

  async function watch(pending, path, input, init) {
    const self = !!window.__aquamanSelf; // une requête d'Aquaman lui-même (script)
    const waiting = fullPending; // les boosters en attente au départ de la requête (une ouverture : ceux qu'elle ouvre)
    const res = await pending;
    try {
      const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      // Le jeu ne voit que les boosters en attente de la sorte choisie (tous quand il n'en reste aucun).
      const kind = chosenKind();
      if (forcedPending && res.ok && method === 'GET' && ME.test(path)) {
        const me = await res.clone().json().catch(() => null);
        if (me && typeof me === 'object') {
          if (Array.isArray(me.pending)) keepPending(me.pending);
          return new Response(JSON.stringify({ ...me, pending: forcedPending }), { status: res.status, statusText: res.statusText, headers: res.headers });
        }
      }
      if (kind && !self && res.ok && method === 'GET' && ME.test(path)) {
        const me = await res.clone().json().catch(() => null);
        if (Array.isArray(me?.pending)) {
          keepPending(me.pending);
          const kept = me.pending.filter((b) => (b?.kindId ?? 'classic') === kind);
          if (kept.length) {
            post({ type: 'status', pending: me.pending.length, boosters: me.pending.map((b) => ({ id: b.id, kind: b.kindId ?? null, name: b.kindName ?? null, art: b.kindArt ?? null })) });
            return new Response(JSON.stringify({ ...me, pending: kept }), { status: res.status, statusText: res.statusText, headers: res.headers });
          }
        }
      }
      if (path && !res.ok && method === 'POST' && ORDERS.test(path) && res.status !== 429) {
        const order = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        if (order?.side === 'sell' && order.copyId)
          res
            .clone()
            .json()
            .catch(() => null)
            .then((body) =>
              post({
                type: 'sell-refused',
                item: { cardId: order.cardId, copyId: order.copyId, price: order.price },
                message: body?.error?.message || `Erreur ${res.status}`,
                ticked: tickedCopies()
              })
            );
      }
      if (path && res.ok && method === 'GET' && ME.test(path))
        res
          .clone()
          .json()
          .then(learnSelf)
          .catch(() => {});
      if (path && res.ok && method === 'GET' && !FEED.test(path) && ownAnswer(path))
        res
          .clone()
          .json()
          .then(learnCopies)
          .catch(() => {});
      // Un joueur dont le jeu lit les cartes (le partenaire d'un échange…) : son id avec son nom, pour le filtre « Il
      // lui manque » des échanges.
      const player = path && res.ok && method === 'GET' ? path.match(PLAYER_PATH)?.[1] : null;
      if (player)
        res
          .clone()
          .json()
          .then((body) => post({ type: 'player-seen', id: decodeURIComponent(player), name: body?.player?.name ?? body?.user?.name ?? body?.name ?? null }))
          .catch(() => {});
      if (path && res.ok) {
        if (method === 'GET' && ME.test(path)) {
          res
            .clone()
            .json()
            .then(
              (me) =>
                Array.isArray(me?.pending) &&
                (keepPending(me.pending), true) &&
                post({
                  type: 'status',
                  pending: me.pending.length,
                  boosters: me.pending.map((b) => ({ id: b.id, kind: b.kindId ?? null, name: b.kindName ?? null, art: b.kindArt ?? null }))
                })
            )
            .catch(() => {});
        } else if (method === 'GET' && MARKET_LIST.test(path)) {
          res
            .clone()
            .json()
            .then((body) => {
              for (const l of Array.isArray(body?.listings) ? body.listings : []) if (l?.id && l.card?.name) listingCards.set(String(l.id), { name: l.card.name, rarity: l.card.rarity ?? null });
              if (requestUrl(input)?.searchParams.get('mine') === '1') emitMarketSales(body, false);
            })
            .catch(() => {});
        } else if (method === 'GET' && AUCTIONS.test(path) && requestUrl(input)?.searchParams.get('mine') === 'selling') {
          res
            .clone()
            .json()
            .then((body) => emitMarketSales(body, true))
            .catch(() => {});
        } else if (method === 'GET' && path === '/api-game/v1/cards' && location.pathname.startsWith('/jeu/collection')) {
          // Les cartes que la vue de la collection a reçues (ses filtres et leurs ids) : les cartes manquantes que le jeu
          // n'a pas renvoyées sont ajoutées par Aquaman à la suite (le filtre « Manquantes »).
          let query = '';
          try {
            query = new URL(input instanceof Request ? input.url : String(input), location.href).search;
          } catch {}
          res
            .clone()
            .json()
            .then((body) => {
              const cards = Array.isArray(body?.cards) ? body.cards : [];
              post({ type: 'cards-shown', query, ids: cards.map((c) => c?.id).filter((id) => typeof id === 'string'), names: cards.slice(0, 400).map((c) => [c?.id, c?.name, c?.series?.title ?? '']) });
            })
            .catch(() => {});
        } else if (method === 'GET' && FEED.test(path)) {
          res
            .clone()
            .json()
            .then((body) => Array.isArray(body?.pulls) && post({ type: 'feed', pulls: body.pulls }))
            .catch(() => {});
        } else if (method !== 'GET' && WRITE.test(path)) {
          // Une carte achetée sur le marché : ses autres ventes sont cachées (le code de la page), le joueur l'a
          // maintenant.
          const bought = path.match(MARKET_BUY)?.[1];
          const card = bought && listingCards.get(decodeURIComponent(bought));
          if (card) post({ type: 'market-bought', name: card.name, rarity: card.rarity });
          // Un booster acheté dans la boutique : le jeu l'ajoute à ses boosters sans relire /me, Aquaman aussi.
          if (BUY.test(path) && fullPending)
            res
              .clone()
              .json()
              .then((body) => {
                const b = body?.booster;
                if (!b?.id || fullPending.some((x) => x?.id === b.id)) return;
                keepPending([...fullPending, b]);
                post({ type: 'status', pending: fullPending.length, boosters: fullPending.map((x) => ({ id: x.id, kind: x.kindId ?? null, name: x.kindName ?? null, art: x.kindArt ?? null })) });
              })
              .catch(() => {});
          // Les boosters qu'Aquaman ouvre lui-même (window.__aquamanSelf, dans le script) sont comptés par Aquaman.
          if (OPEN.test(path) && !window.__aquamanSelf)
            res
              .clone()
              .json()
              .then((body) => {
                const all = openedBoosters(body);
                const packs = packsOf(all, path, init, waiting);
                const ids = boosterIdsOf(all, path, init);
                const opened = all.map((b, i) => ({ pulls: b.pulls, pack: packs[i], id: ids[i] })).filter((b) => raritiesOf(b.pulls).length);
                if (opened.length)
                  post({
                    type: 'opened',
                    boosters: opened.map((b) => raritiesOf(b.pulls)),
                    best: opened.map((b) => bestCard(b.pulls)),
                    packs: opened.map((b) => b.pack),
                    ids: opened.map((b) => b.id),
                    // (les cartes tirées : leurs doublons peuvent être recyclés depuis la fenêtre de cartes)
                    cards: opened.map((b) => (Array.isArray(b.pulls) ? b.pulls : []).map((p) => (p?.card ?? p)?.id).filter((id) => typeof id === 'string'))
                  });
              })
              .catch(() => {});
          if (ASSETS.test(path) && res.ok) assetsChanged();
          post({ type: 'collection-stale' });
        }
      }
    } catch {}
    return res;
  }
})();
