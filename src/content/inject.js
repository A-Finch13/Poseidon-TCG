// Runs in the page before it loads: tells content.js what the site's own requests change, without changing them.
//   { aquaman: 'status', pending }   boosters waiting, read from the site's /api-game/v1/me answers
//   { aquaman: 'opened', boosters }  boosters just opened, each as the rarities of its cards (for the pity counters)
//   { aquaman: 'feed', pulls }       the game's "beaux tirages", read from its /api-game/v1/feed answers
//   { aquaman: 'collection-stale' }  a booster was opened, or a trade, sale or purchase went through
(() => {
  if (window.__aquamanHook) return;
  window.__aquamanHook = true;

  const ME = /^\/api-game\/v1\/me$/;
  const FEED = /^\/api-game\/v1\/feed$/;
  const OPEN = /^\/api-game\/v1\/boosters\/([^/]+\/open|open-many|open)$/;
  const WRITE = /^\/api-game\/v1\/(boosters\/[^/]+\/open|boosters\/open(-many)?|shop\/booster|trades(\/.*)?|market\/.*|auctions(\/.*)?|copies(\/.*)?)$/;
  const RARITIES = ['N', 'R', 'SR', 'SSR', 'UR', 'SEC'];
  const original = window.fetch;

  const post = (data) => window.postMessage({ aquaman: data.type, ...data }, location.origin);

  // Path of a same-origin request, or null.
  function pathOf(input) {
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      return url.origin === location.origin ? url.pathname : null;
    } catch {
      return null;
    }
  }

  // Rarities of the cards of one booster's answer ({ pulls: [{ card: { rarity } }] }).
  const raritiesOf = (pulls) => pulls.map((p) => p?.card?.rarity ?? p?.rarity).filter((r) => RARITIES.includes(r));

  // The boosters of an opening answer: one booster, or several (open-many).
  function openedBoosters(body) {
    if (Array.isArray(body?.pulls)) return [raritiesOf(body.pulls)];
    const list = body?.boosters ?? body?.results ?? body?.opened ?? (Array.isArray(body) ? body : null);
    if (Array.isArray(list)) return list.filter((b) => Array.isArray(b?.pulls)).map((b) => raritiesOf(b.pulls));
    return [];
  }

  window.fetch = async function (input, init) {
    const res = await original.apply(this, arguments);
    try {
      const path = pathOf(input);
      const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (path && res.ok) {
        if (method === 'GET' && ME.test(path)) {
          res
            .clone()
            .json()
            .then((me) => Array.isArray(me?.pending) && post({ type: 'status', pending: me.pending.length }))
            .catch(() => {});
        } else if (method === 'GET' && FEED.test(path)) {
          res
            .clone()
            .json()
            .then((body) => Array.isArray(body?.pulls) && post({ type: 'feed', pulls: body.pulls }))
            .catch(() => {});
        } else if (method !== 'GET' && WRITE.test(path)) {
          if (OPEN.test(path))
            res
              .clone()
              .json()
              .then((body) => {
                const boosters = openedBoosters(body).filter((b) => b.length);
                if (boosters.length) post({ type: 'opened', boosters });
              })
              .catch(() => {});
          post({ type: 'collection-stale' });
        }
      }
    } catch {}
    return res;
  };
})();
