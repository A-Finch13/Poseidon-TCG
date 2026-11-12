// Aquaman : transfert unique des anciennes séries favorites vers les favoris du site.

const TRANSFER_RELAY = 'https://aquaman-relay.finch-arhold-git.workers.dev';
const TRANSFER_PLAYER = /^[A-Za-z0-9_-]{6,64}$/;

let transferringFavorites = false;
async function transferFavorites() {
  if (transferringFavorites) return;
  const TRANSFER_SERIE_ID = /^[A-Za-z0-9_-]{1,64}$/;
  transferringFavorites = true;
  try {
    const me = await send({ type: 'me-id' });
    const player = me?.id;
    if (!TRANSFER_PLAYER.test(String(player ?? ''))) return;

    const status = await fetch(`${TRANSFER_RELAY}/favorites/transferred?player=${encodeURIComponent(player)}`);
    if (!status.ok) throw new Error(`relay_${status.status}`);
    if ((await status.json())?.transferred) return;

    const { favSeries } = await chrome.storage.local.get('favSeries');
    const ids = [...new Set((Array.isArray(favSeries) ? favSeries : []).filter((id) => TRANSFER_SERIE_ID.test(String(id))))];
    for (const id of ids) {
      for (let tries = 0; ; tries++) {
        try {
          await favoriteSerie(id, true);
          break;
        } catch (e) {
          if (!e.slowDown || tries >= 3) throw e;
          await new Promise((resolve) => setTimeout(resolve, e.wait || 3000));
        }
      }
    }

    const done = await fetch(`${TRANSFER_RELAY}/favorites/transfer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ player })
    });
    if (!done.ok) throw new Error(`relay_${done.status}`);
  } catch (e) {
    console.warn('[Aquaman] transfert des favoris impossible', e);
  } finally {
    transferringFavorites = false;
  }
}

onStart(() => transferFavorites());
