// Aquaman : qui utilise Aquaman (l'auteur seulement).

import { RELAY } from './common.js';
import { cached, myId } from './api.js';
import { showcase } from './collections.js';

// ---------- qui utilise Aquaman (l'auteur seulement) ----------

const HELLO_EVERY = 9.5 * 60e3; // le code de la page dit bonjour toutes les 10 minutes tant qu'une page du jeu est ouverte

// Dit au relais, toutes les 10 minutes au plus, que ce joueur utilise Aquaman (kind : « extension » ou « userscript »).
// revoked : l'auteur a retiré Aquaman à ce joueur ; redemandé à chaque démarrage jusqu'à ce qu'il soit rendu.
export async function sayHello(kind) {
  const id = await myId();
  const { helloAt = 0, helloKind, helloFor, revokedFor } = await chrome.storage.local.get(['helloAt', 'helloKind', 'helloFor', 'revokedFor']);
  const revoked = revokedFor === id;
  if (!revoked && Date.now() - helloAt < HELLO_EVERY && helloKind === kind && helloFor === id) return { ok: true, skipped: true, revoked };
  let name = null;
  try {
    name = (await showcase(id)).player?.name ?? null;
  } catch {}
  // « perles: null » : les Perles qu'une ancienne version partageait pour le classement sont reprises au relais.
  const res = await fetch(`${RELAY}/hello`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ player: id, name, kind, version: chrome.runtime.getManifest().version, perles: null })
  });
  if (!res.ok) return { ok: false, revoked };
  const now = !!(await res.json().catch(() => null))?.revoked;
  await chrome.storage.local.set({ helloAt: Date.now(), helloKind: kind, helloFor: id });
  if (now) await chrome.storage.local.set({ revokedFor: id });
  else if (revoked) await chrome.storage.local.remove('revokedFor');
  return { ok: true, revoked: now };
}

// Si l'auteur a retiré Aquaman à ce joueur, demandé au relais une fois par minute au plus ; quand le relais ne répond
// pas, la dernière réponse connue.
export async function access() {
  const id = await myId();
  return cached(`access:${id}`, 50e3, async () => {
    const { revokedFor } = await chrome.storage.local.get('revokedFor');
    try {
      const res = await fetch(`${RELAY}/access?player=${encodeURIComponent(id)}`);
      if (!res.ok) return { revoked: revokedFor === id };
      const revoked = !!(await res.json()).revoked;
      if (revoked) await chrome.storage.local.set({ revokedFor: id });
      else if (revokedFor === id) await chrome.storage.local.remove('revokedFor');
      return { revoked };
    } catch {
      return { revoked: revokedFor === id };
    }
  });
}
