// Aquaman, code de la page : messages au service de fond (bridge.js dans le script).

// ---------- messages ----------

// Faux dès que l'extension a été rechargée ou mise à jour : cette copie fait alors le ménage et s'arrête.
const alive = () => {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
};
// L'extension a été rechargée ou mise à jour pendant que cette page restait ouverte : son stockage et ses messages
// lèvent « Extension context invalidated » depuis tout minuteur encore actif. Cette copie d'Aquaman s'arrête à la
// première, sans bruit (le prochain chargement de la page amène la nouvelle).
const GONE = /extension context invalidated/i;
const onGone = (e) => {
  if (!GONE.test(String(e.reason?.message ?? e.error?.message ?? e.message ?? ''))) return;
  e.preventDefault();
  shutdown();
};
onStart(() => {
  addEventListener('unhandledrejection', onGone);
  addEventListener('error', onGone);
});

// Message au service de fond ; null quand il ne peut pas répondre.
async function send(msg) {
  if (!alive()) return shutdown(), null;
  try {
    return (await chrome.runtime.sendMessage(msg)) ?? null;
  } catch {
    return null;
  }
}

// Réponse d'un message de données, ou une erreur avec un message pour le joueur.
async function ask(msg) {
  const res = await send(msg);
  if (!res) throw new Error('Aquaman ne répond pas : recharge la page.');
  if (res.error) throw new Error(res.error === 'unknown_message' ? 'Aquaman ne répond pas : recharge la page.' : res.error);
  return res;
}
