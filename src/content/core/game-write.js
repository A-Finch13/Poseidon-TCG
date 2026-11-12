// Aquaman, code de la page : changements envoyés au jeu depuis la page.

// ---------- changements envoyés depuis la page ----------

// Le jeu refuse les changements qui ne viennent pas de ses propres pages : ils partent d'ici (avec content.fetch sur
// Firefox, qui les envoie comme la page), jamais du service de fond.
const pageFetch = typeof content !== 'undefined' && content?.fetch ? content.fetch.bind(content) : window.fetch.bind(window);

async function gameWrite(path, method, data) {
  const headers = data === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' };
  const res = await pageFetch(`/api-game/v1${path}`, { method, credentials: 'include', headers, body: data === undefined ? undefined : JSON.stringify(data) });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(body?.error?.message || `Erreur ${res.status}`);
    // « Doucement ! Réessaie dans un instant. » : le jeu demande de ralentir, le changement peut être renvoyé.
    error.slowDown = res.status === 429 || /doucement|r[ée]essaie|trop de requ/i.test(error.message);
    // L'attente que demande le jeu : son en-tête Retry-After, sinon les secondes de son message (« Réessaie dans 12 s
    // »).
    error.wait = (Number(res.headers?.get?.('retry-after')) || Number(error.message.match(/(\d+)\s*(?:s\b|sec)/i)?.[1]) || 0) * 1000;
    throw error;
  }
  // Perles ou cartes changées (une vente, un retrait…) : le jeu les relit depuis l'API (inject.js). Les requêtes de
  // l'extension ne passent pas par le fetch de la page, où inject.js voit celles du jeu.
  if (method !== 'GET' && /^\/(market|trades|auctions|copies)\//.test(path)) window.postMessage({ aquamanCmd: 'reload-game', assets: true }, location.origin);
  return body;
}

// Met une carte dans la liste de recherche du joueur (on) ou l'en retire (aussi des cartes en attente dans Aquaman).
async function wantCard(id, on) {
  if (!on && (await takeWaiting([id]))) {
    send({ type: 'wants-changed' });
    return { wanted: false };
  }
  const res = await gameWrite(`/cards/${encodeURIComponent(id)}/want`, on ? 'PUT' : 'DELETE');
  send({ type: 'wants-changed' });
  return { wanted: !!res?.wanted };
}

// Met une carte en favoris
async function favoriteSerie(id, on) {
  const res = await gameWrite(`/series/${encodeURIComponent(id)}/favorite`, on ? 'PUT' : 'DELETE');
  return { favorite: !!res?.favorite };
}
