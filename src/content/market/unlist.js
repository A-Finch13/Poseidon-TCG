// Aquaman, code de la page : marché, « Retirer mes ventes » à côté de « Vendre une carte ».

// À côté de « Vendre une carte » du jeu (le marché) : un bouton qui retire d'un coup toutes les ventes à prix fixe du
// joueur (les cartes redeviennent libres), l'une après l'autre au rythme qu'accepte le jeu. Les exemplaires en attente
// d'Aquaman sont mis en pause pendant ce temps (dans tous les onglets), sinon ils partiraient en vente dans les places
// libérées ; ils reprennent ensuite.
const SELL_CARD = /^vendre une carte$/i;
let unlisting = false;
function markUnlistButton() {
  if (!location.pathname.startsWith('/jeu')) return;
  const sell = [...document.querySelectorAll('button, a')].find((b) => !b.closest('.aqm-root') && SELL_CARD.test(b.textContent.trim()));
  if (!sell || sell.parentElement.querySelector(':scope > .aqm-unlist')) return;
  const btn = h('button', { type: 'button', class: `${sell.className} aqm-unlist`, onclick: () => unlistAll(btn) }, 'Retirer mes ventes');
  sell.after(btn);
}

async function unlistAll(btn) {
  if (unlisting) return;
  const sales = (n) => `${n} vente${n > 1 ? 's' : ''}`;
  let listings;
  try {
    listings = ((await gameWrite('/market/listings?mine=1', 'GET'))?.listings ?? []).filter((l) => l?.id);
  } catch (e) {
    return void askDialog('Retirer mes ventes', `Le jeu n’a pas donné tes ventes : ${e.message}`);
  }
  if (!listings.length) return void askDialog('Retirer mes ventes', 'Tu n’as aucune vente à prix fixe en cours.');
  const waiting = (await readList(SALES_WAITING)).length + ((await readSales())?.items.length ?? 0);
  const also = waiting ? `\n\nLa file d’attente d’Aquaman (${nCopies(waiting)}) est mise en pause le temps du retrait, puis réactivée.` : '';
  if (!(await askDialog('Retirer mes ventes', `Retirer tes ${sales(listings.length)} à prix fixe ? Les cartes redeviennent libres.${also}`, 'Retirer', 'Annuler'))) return;
  unlisting = true;
  const label = btn.textContent;
  let done = 0;
  let failed = null;
  try {
    // (une pause qui se termine toute seule si cette page est fermée entre-temps)
    await chrome.storage.local.set({ [SALES_PAUSED]: Date.now() + 15 * 60e3 });
    await stopSales(); // les exemplaires en cours d'envoi retournent dans ceux en attente
    let gap = 600;
    for (const l of listings) {
      if (stopped) break;
      btn.textContent = `Retrait… ${done}/${listings.length}`;
      for (let tries = 0; ; tries++) {
        try {
          await gameWrite(`/market/orders/${encodeURIComponent(l.id)}`, 'DELETE');
          done++;
          break;
        } catch (e) {
          if (e.slowDown && tries < 5) {
            gap = Math.min(4000, gap * 1.5);
            await pause(slowWait(e));
            continue;
          }
          failed = e.message; // (vendue entre-temps, déjà retirée…) : les suivantes continuent
          break;
        }
      }
      await pause(gap);
    }
  } finally {
    try {
      await chrome.storage.local.remove(SALES_PAUSED); // les exemplaires en attente reprennent
    } catch {}
    unlisting = false;
  }
  send({ type: 'collection-stale' });
  btn.textContent = `✅ ${sales(done)} retirée${done > 1 ? 's' : ''}`;
  if (failed) await askDialog('Retirer mes ventes', `${sales(listings.length - done)} non retirée${listings.length - done > 1 ? 's' : ''} : « ${failed} ».`);
  // La liste des ventes du jeu et ses Perles sont relues.
  setTimeout(() => (done ? location.reload() : (btn.textContent = label)), failed ? 0 : 1200);
}
