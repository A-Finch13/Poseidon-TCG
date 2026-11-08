// Script : les réponses du service de fond au code de la page, faites dans la page.
// Pas de badge, de notifications ni d'assistant de mise à jour ici : le gestionnaire de scripts installe les nouvelles
// versions ; le code de la page les propose dès qu'elles sortent.

import { safeHref } from '../lib/common.js';
import { answer } from '../lib/messages.js';
import { checkUpdate, newer } from '../lib/updates.js';

const UPDATE_EVERY = 10 * 60e3;

// La dernière version GitHub quand elle est plus récente que ce script (cherchée toutes les 10 minutes au plus, par
// n'importe quel onglet).
async function scriptUpdate() {
  const { updateCheckedAt = 0 } = await chrome.storage.local.get('updateCheckedAt');
  if (Date.now() - updateCheckedAt >= UPDATE_EVERY) {
    await chrome.storage.local.set({ updateCheckedAt: Date.now() });
    await checkUpdate().catch(() => null);
  }
  const { update } = await chrome.storage.local.get('update');
  return { update: update && newer(update.version, VERSION) ? update : null };
}

// Répond aux messages du code de la page.
export async function handle(msg) {
  switch (msg?.type) {
    case 'status':
      return { ok: true };
    case 'check-update':
      return scriptUpdate();
    case 'install-update':
      return { error: 'userscript' };
    case 'open': {
      // (seulement une page du jeu ou les pages GitHub d'Aquaman : jamais « javascript: » ni un autre site)
      const url = safeHref(msg.href);
      if (!url) return { error: 'bad_href' };
      location.assign(url);
      return { ok: true };
    }
    default:
      return answer(msg);
  }
}
