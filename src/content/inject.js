// Runs in the page before it loads: tells content.js what the site's own requests change. It changes one answer
// only: the boosters waiting in /api-game/v1/me, limited to the kind chosen on the home page (see content.js).
//   { aquaman: 'status', pending, boosters }  boosters waiting, read from the site's /api-game/v1/me answers
//                                    (boosters: [{ id, kind, name, art }], kind and name null for a classic one)
//   { aquaman: 'opened', boosters }  boosters just opened, each as the rarities of its cards (for the pity counters)
//   { aquaman: 'feed', pulls }       the game's "beaux tirages", read from its /api-game/v1/feed answers
//   { aquaman: 'collection-stale' }  a booster was opened, or a trade, sale or purchase went through
//   { aquaman: 'sell-refused', item, message, ticked }  the game refused to put a copy on sale ({ cardId, copyId,
//                                    price }); ticked: the copies still ticked in its "Vendre mes doublons" window
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
  // Changes of Perles or cards made outside the boosters (market, exchanges, auctions, copies sold or recycled): the
  // game's status and the card of the page are read again from the API afterwards. (Not the boosters: the game counts
  // their Perles and cards itself, and a status read again would redraw the pile in the middle of an opening.)
  const ASSETS = /^\/api-game\/v1\/(trades(\/.*)?|market\/.*|auctions(\/.*)?|copies(\/.*)?)$/;
  const MARKET_LIST = /^\/api-game\/v1\/market\/listings$/;
  // The card of each sale the market last showed (listing id -> { name, rarity }), for the card of a purchase.
  const listingCards = new Map();
  const WRITE = /^\/api-game\/v1\/(boosters\/[^/]+\/open|boosters\/open(-many)?|shop\/booster|trades(\/.*)?|market\/.*|auctions(\/.*)?|copies(\/.*)?)$/;
  const RARITIES = ['N', 'R', 'SR', 'SSR', 'UR', 'SEC'];
  const original = window.fetch;

  // The kind of boosters chosen on the home page ('classic' for the boosters without one), '' for all.
  const chosenKind = () => {
    try {
      return sessionStorage.getItem('aqm-booster-kind') || '';
    } catch {
      return '';
    }
  };

  const post = (data) => window.postMessage({ aquaman: data.type, ...data }, location.origin);

  // The page sent by the server is taken over by React piece by piece (hydration), the big ones (the album) sometimes
  // long after the page loaded, or at once when clicked. An element Aquaman adds in a piece not taken over yet doesn't
  // match what React expects (error #418) and may leave the page blank. React marks each element it took over
  // (__reactProps$…, seen only from the page): once every button and link of the page has its mark, data-aqm-hydrated
  // tells content.js it may change the page (after 15 s at most, for a page with buttons outside React).
  (function watchHydration() {
    const started = Date.now();
    const taken = (el) => Object.keys(el).some((k) => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'));
    const check = () => {
      // (the page's own content: the buttons of other scripts, outside <main>, are never taken over)
      const own = [...(document.querySelector('main') ?? document.body ?? document).querySelectorAll('button, a[href]')].filter((el) => !el.closest('[class*="aqm-"]'));
      if ((document.readyState === 'complete' && own.length && own.every(taken)) || Date.now() - started > 15e3)
        return void document.documentElement.setAttribute('data-aqm-hydrated', '');
      setTimeout(check, 150);
    };
    check();
  })();

  // The game's store of its status (/me: boosters, Perles…): its useGameStore hook (zustand), found among the site's
  // modules. Aquaman adds a module of its own to the site's Turbopack, which looks through the modules already loaded
  // (its context's c). Else, the state among the hooks of the game's components. Returns the state ({ load, … }).
  let storeHook = null;
  let storeState = null;
  async function gameStore() {
    if (storeHook) return storeHook.getState();
    if (storeState) return storeState;
    const T = globalThis.TURBOPACK;
    if (T && !Array.isArray(T) && typeof T.push === 'function') {
      const id = `aquaman-${Date.now()}`;
      try {
        // Two pushes: the module, then the order to run it (a chunk has one or the other).
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

  // All the waiting boosters, as the game's last /me gave them (before the filter). Also written on the page
  // (data-aqm-boosters), where content.js finds them as soon as it starts.
  let fullPending = null;
  let forcedPending = null; // the boosters made up for the author's scan, given to the game in its next /me
  function keepPending(pending) {
    fullPending = pending;
    try {
      document.documentElement.setAttribute('data-aqm-boosters', JSON.stringify(pending.map((b) => ({ id: b.id, kind: b.kindId ?? null, name: b.kindName ?? null, art: b.kindArt ?? null }))));
    } catch {}
  }

  // A card's page holds the card read from /cards/:id (with the player's copies) in a state of its components: the
  // card is read again from the API and given to that state, the page draws it at once. False if no such state.
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
    let done = false;
    for (let fiber = key ? start[key] : null; fiber; fiber = fiber.return) {
      for (let hook = typeof fiber.memoizedState === 'object' ? fiber.memoizedState : null; hook && 'next' in hook; hook = hook.next) {
        const s = hook.memoizedState;
        const dispatch = hook.queue?.dispatch;
        if (typeof dispatch !== 'function' || !s || typeof s !== 'object') continue;
        if (s.id === id && 'copies' in s) dispatch(card);
        else if (s.card?.id === id) dispatch({ ...s, ...(fresh.card ? fresh : { card }) });
        else continue;
        done = true;
      }
    }
    return done;
  }

  // After a change of Perles or cards, the game's status (/me: Perles…) and the card of the page are read again from
  // the API, once for a burst of changes.
  let assetsTimer = 0;
  function assetsChanged() {
    clearTimeout(assetsTimer);
    assetsTimer = setTimeout(() => {
      const cardId = location.pathname.match(/^\/jeu\/carte\/([^/?#]+)/)?.[1];
      window.postMessage({ aquamanCmd: 'reload-game', cardId: cardId ? decodeURIComponent(cardId) : undefined }, location.origin);
    }, 600);
  }

  // content.js asks the game to read its status again (its Perles after a purchase, its boosters…), and the card of
  // its page (cardId) after a purchase: straight from the API, the page isn't loaded again.
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.aquamanCmd !== 'reload-game') return;
    if (e.data.assets) return void assetsChanged(); // a change made by Aquaman itself, outside this page's fetch
    const { cardId, perles } = e.data;
    let fixed = false;
    if (typeof cardId === 'string')
      try {
        fixed = await refreshCardState(cardId);
      } catch {}
    if (!fixed)
      try {
        window.next?.router?.refresh?.(); // the page's own data (a card's copies…)
      } catch {}
    try {
      const store = await gameStore();
      if (typeof perles === 'number') store?.setPerles?.(perles); // the Perles the purchase answered, at once
      await store?.load().catch(() => {}); // then the game's status read again from /me
    } catch {}
  });

  // content.js sets the game on one kind ('' for all): the game's list of boosters is changed in its store at once
  // (patch, no request), else read again through the filter (load). Answers once it is done, or at once when the
  // store can't be found.
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.aquamanCmd !== 'refresh-boosters') return;
    let ok = false;
    try {
      const s = await gameStore();
      const kind = e.data.kind ?? '';
      const given = Array.isArray(e.data.items) ? e.data.items : null; // the author's scan: boosters made up by kind
      if (s && (given || e.data.fresh || e.data.reload || !fullPending || typeof s.patch !== 'function')) {
        // The game draws its pile afresh only when it reads its boosters itself (load: it goes through its loading
        // state, the pile comes back with the right picture). Its answer goes through the filter of the kind, or
        // carries the made-up boosters of the scan.
        // The scan gives the ids of the player's own boosters: the game gets them whole, as its server sent them (a
        // booster with an id it doesn't know is drawn with the classic picture).
        forcedPending = given && given.map((b) => fullPending?.find((x) => x?.id === b.id)).filter(Boolean);
        if (given && !forcedPending.length) forcedPending = null;
        try {
          await s.load().catch(() => {});
        } finally {
          forcedPending = null;
        }
        ok = true;
      } else if (s) {
        // Back to all the boosters while the game's pile is hidden: at once, without a request.
        s.patch(() => ({ pending: kind ? fullPending.filter((b) => (b?.kindId ?? 'classic') === kind) : fullPending }));
        ok = true;
      }
    } catch {}
    post({ type: 'boosters-refreshed', ok, id: e.data.id ?? null });
  });

  // Path of a same-origin request, or null.
  function pathOf(input) {
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      return url.origin === location.origin ? url.pathname : null;
    } catch {
      return null;
    }
  }

  // A copy in the props of the site's components ({ cardId, copyId, name, serial }), looked for a few levels deep:
  // { copyId } or a { id, serial }, its card beside it or around it (card: the card met on the way). Lists are left
  // out: their first copy would be every row's.
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

  // The copy shown by an element: read in the props of the components around it.
  function copyOf(el) {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    let fiber = key ? el[key] : null;
    for (let i = 0; fiber && i < 20; i++, fiber = fiber.return) {
      const found = findCopy(fiber.memoizedProps, 0);
      if (found) return found;
    }
    return null;
  }

  // The copies met in the site's answers (copy id -> { cardId, copyId, name, serial }), and the names of the cards:
  // the rows of the "Vendre mes doublons" window are found there by their name and number. Only the logged-in
  // player's own copies: the collection of another player the page reads (a profile, the partner of an exchange…) is
  // never learnt, so that their copies are never taken for the player's.
  const seenCopies = new Map();
  const cardNames = new Map();
  let selfId = null; // the logged-in player, from the game's /me answers
  const idOfMe = (me) => [me?.id, me?.userId, me?.player?.id, me?.user?.id].find((x) => typeof x === 'string' && x) ?? null;
  function learnSelf(me) {
    const id = idOfMe(me);
    if (!id || id === selfId) return;
    if (selfId) seenCopies.clear(); // another account: the copies of the previous one are forgotten
    selfId = id;
  }
  // True when an answer of this path may hold the player's own copies: not another player's collection.
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

  // The copy of a row: its number (#518) and the longest card name found in its text.
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

  // The copies still ticked in the "Vendre mes doublons" window, in its order, each with the price of its row (the
  // price typed, else its "Valeur ≈").
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

  // Rarities of the cards of one booster's answer ({ pulls: [{ card: { rarity } }] }).
  const raritiesOf = (pulls) => pulls.map((p) => p?.card?.rarity ?? p?.rarity).filter((r) => RARITIES.includes(r));

  // The boosters of an opening answer: one booster, or several (open-many), each as the pulls of its cards.
  function openedBoosters(body) {
    if (Array.isArray(body?.pulls)) return [body];
    const list = body?.boosters ?? body?.results ?? body?.opened ?? (Array.isArray(body) ? body : null);
    return Array.isArray(list) ? list.filter((b) => Array.isArray(b?.pulls)) : [];
  }
  // The kind of each booster of an opening ({ id, name }, null when unknown): from the answer, else from the booster's
  // id (in the path or the body of the request) among the waiting ones, else the kind Aquaman shows the game, else
  // the only kind waiting.
  // The game's id of each booster of an opening (null when unknown): from the answer, else from the request (its path
  // or its body). Aquaman records each booster under it, so that a booster told twice is counted once.
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
  // The best card of a booster ({ id, name, image, rarity }), for the history of the pity.
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

  // ---------- the picture of a themed kind in the 3D pack of the opening ----------
  // The game draws the pack of its opening window in 3D (three.js) with the classic picture (classique.webp) when it
  // opens several boosters, whatever their kind. While Aquaman opens a themed kind (content.js writes its picture in
  // data-aqm-opening-art), that picture takes the classic one's place each time the game draws it or sends it to the
  // 3D: the same size (720 × 1080), nothing else changes. The classic picture the game keeps is never changed itself,
  // so each opening gets the picture of its own kind.
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
  const classicBlobs = new WeakSet(); // the classic picture fetched by the game
  const classicBitmaps = new WeakSet(); // and made into bitmaps
  const arts = new Map(); // picture -> { img, bitmap }, loaded once
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
  // The themed picture to use in place of a classic one (as an image or a bitmap, like the source), once loaded.
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

  // Only the requests to the game's API are looked at; the others (analytics, images…) go straight through.
  window.fetch = function (input, init) {
    const path = pathOf(input);
    if (!path?.startsWith('/api-game/')) return original.apply(this, arguments);
    return watch(original.apply(this, arguments), path, input, init);
  };

  async function watch(pending, path, input, init) {
    const self = !!window.__aquamanSelf; // a request of Aquaman itself (userscript)
    const waiting = fullPending; // the boosters waiting when the request left (an opening: those it opens)
    const res = await pending;
    try {
      const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      // The game sees only the waiting boosters of the chosen kind (all of them when none is left).
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
      // A player whose cards the game reads (the partner of an exchange…): their id with their name, for the filter
      // "Il lui manque" of the exchanges.
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
            })
            .catch(() => {});
        } else if (method === 'GET' && FEED.test(path)) {
          res
            .clone()
            .json()
            .then((body) => Array.isArray(body?.pulls) && post({ type: 'feed', pulls: body.pulls }))
            .catch(() => {});
        } else if (method !== 'GET' && WRITE.test(path)) {
          // A card bought on the market: its other sales are hidden (content.js), the player has it now.
          const bought = path.match(MARKET_BUY)?.[1];
          const card = bought && listingCards.get(decodeURIComponent(bought));
          if (card) post({ type: 'market-bought', name: card.name, rarity: card.rarity });
          // A booster bought in the shop: the game adds it to its boosters without reading /me again, Aquaman too.
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
          // The boosters Aquaman opens itself (window.__aquamanSelf, in the userscript) are counted by Aquaman.
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
                    ids: opened.map((b) => b.id)
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
