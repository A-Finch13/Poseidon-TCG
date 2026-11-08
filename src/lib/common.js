// Aquaman : adresses du jeu, du dépôt et du relais, raretés, les adresses qu'Aquaman peut ouvrir.

export const ORIGIN = 'https://poseidon-scans.net';
export const REPO = 'A-Finch13/Poseidon-TCG';
export const GAME = `${ORIGIN}/api-game/v1`;
export const SOCIAL = `${ORIGIN}/api-social/v1`;
export const RANK = { N: 1, R: 2, SR: 3, SSR: 4, UR: 5, SEC: 6 };

// Relais qui partage les ouvertures d'un joueur entre ses appareils (relay/ dans le dépôt).
export const RELAY = 'https://aquaman-relay.finch-arhold-git.workers.dev';

// Les seules adresses qu'Aquaman ouvre (sa fenêtre, ses notifications, le « open » du code de la page) : une page du
// jeu (un chemin « /… » ou une adresse complète du site) et les pages GitHub d'Aquaman (versions, script, page
// d'installation). Tout le reste (un autre site, « javascript: », « data: »…) donne null.
const OPEN_HOSTS = new Set(['poseidon-scans.net', 'github.com', 'raw.githubusercontent.com', 'a-finch13.github.io']);
export function safeHref(href) {
  if (typeof href !== 'string' || !href) return null;
  try {
    const url = /^\/(?!\/)/.test(href) ? new URL(href, ORIGIN) : new URL(href);
    return url.protocol === 'https:' && OPEN_HOSTS.has(url.hostname) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
