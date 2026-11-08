// Aquaman : requêtes à l'API du jeu, gardées un moment, et le joueur connecté.

import { GAME, ORIGIN, SOCIAL } from './common.js';
import { showcases } from './collections.js';

// ---------- API ----------

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

// Réponse JSON du site, envoyée avec la session du joueur.
async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { credentials: 'include', headers: { accept: 'application/json' } });
  } catch {
    throw new ApiError(0, 'network', 'Connexion impossible. Vérifie ta connexion internet.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error?.code || `http_${res.status}`, body?.error?.message || `Erreur ${res.status}`);
  return body;
}
export const game = (path) => getJson(GAME + path);
export const social = (path) => getJson(SOCIAL + path);

// Réponses gardées un moment.
const memo = new Map();
export function cached(key, ttl, load) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.promise;
  const promise = load();
  memo.set(key, { at: Date.now(), promise });
  promise.catch(() => memo.get(key)?.promise === promise && memo.delete(key));
  return promise;
}

// Oublie les réponses gardées dont la clé commence par l'un des préfixes.
export function forget(...prefixes) {
  for (const key of [...memo.keys()]) if (prefixes.some((p) => key.startsWith(p))) memo.delete(key);
}

// Id du joueur connecté (relu après 20 s : un autre compte a pu se connecter entre-temps). Quand le compte a changé,
// toute réponse lue avec la session du précédent est oubliée (sa collection, ses amis, ses recherches…) : rien d'un
// compte n'est jamais montré à un autre.
export let account = null;
export function myId() {
  return cached('me-id', 20e3, async () => {
    const id = await readMyId();
    if (account && account !== id) for (const key of [...memo.keys()]) if (key !== 'me-id') memo.delete(key);
    if (account !== id) showcases.clear();
    account = id;
    return id;
  });
}

// Un id de joueur tel que le jeu les écrit ; tout le reste n'est jamais mis dans une adresse.
export const PLAYER_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const validPlayer = (id) => typeof id === 'string' && PLAYER_ID.test(id);

function readMyId() {
  return (async () => {
    const ids = [];
    try {
      const a = await getJson(`${ORIGIN}/api/auth/check`);
      ids.push(a?.user?.id);
    } catch {}
    if (!ids.some(Boolean)) {
      try {
        const m = await game('/me');
        ids.push(m?.id, m?.userId, m?.player?.id, m?.user?.id);
      } catch {}
    }
    if (!ids.some(Boolean)) {
      try {
        const s = await social('/me');
        ids.push(s?.user?.id, s?.id);
      } catch {}
    }
    const id = ids.find(validPlayer);
    if (!id) throw new ApiError(401, 'unauthorized', 'Connecte-toi au site pour utiliser Aquaman.');
    return id;
  })();
}

// État du joueur dans le jeu : boosters à ouvrir et Perles.
export async function gameStatus() {
  const me = await game('/me');
  return { pending: Array.isArray(me?.pending) ? me.pending.length : 0, perles: typeof me?.perles === 'number' ? me.perles : null };
}
