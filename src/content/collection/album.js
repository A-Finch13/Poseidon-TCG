// Aquaman : verrouillage des cartes uniques dans l'album d'une série.

let albumBusy = false;

function markAlbum() {
  if (!location.pathname.startsWith('/jeu/collection')) return;
  const id = new URLSearchParams(location.search).get('serie');
  const title = document.getElementById('album-title');
  if (!id || !title || albumBusy) return;
  const panel = title.closest('section') ?? title.parentElement?.parentElement;
  if (!panel || panel.closest('.aqm-root')) return;
  const box = panel.querySelector(':scope > .aqm-album');
  if (box?.dataset.series === id) return;
  box?.remove();
  const fresh = h('div', { class: 'aqm-root aqm-album', 'data-series': id });
  panel.append(fresh);
  renderAlbum(fresh, id);
}

async function renderAlbum(box, id) {
  albumBusy = true;
  let st;
  try {
    st = await ask({ type: 'series-status', id });
  } catch {
    box.remove();
    return;
  } finally {
    albumBusy = false;
  }
  if (!box.isConnected) return;
  const note = h('span', { class: 'aqm-album-note', role: 'status' });
  const guard = h('button', { type: 'button', class: 'aqm-album-btn aqm-guard' });
  const paintGuard = () => {
    guard.classList.toggle('is-on', !!st.guarded);
    guard.textContent = st.guarded ? '🔒 Uniques verrouillées' : '🔒 Verrouiller les uniques';
    guard.title = st.guarded
      ? 'Les cartes de cette série dont tu n’as qu’un exemplaire sont verrouillées, et celles qui descendent à un seul le seront aussi. Clique pour arrêter (rien n’est déverrouillé).'
      : 'Verrouille les cartes de cette série dont tu n’as qu’un exemplaire (ni vente, ni échange, ni recyclage), puis celles qui descendront à un seul exemplaire';
  };
  guard.addEventListener('click', async () => {
    guard.disabled = true;
    try {
      if (st.guarded) {
        await ask({ type: 'set-guarded', id, on: false });
        st.guarded = false;
        note.textContent = 'Cette série n’est plus surveillée. Les cartes déjà verrouillées le restent.';
      } else {
        guard.textContent = '🔒 Verrouillage…';
        const r = await lockSingles(new Set(st.cardIds ?? []));
        await ask({ type: 'set-guarded', id, cardIds: st.cardIds ?? [], on: true });
        st.guarded = true;
        note.textContent = guardNote(r);
      }
    } catch (e) {
      note.textContent = `Verrouillage impossible : ${e.message}`;
    }
    guard.disabled = false;
    paintGuard();
  });
  paintGuard();
  box.replaceChildren(guard, note);
}

const guardNote = (r) =>
  [
    r.locked ? `🔒 ${fmt(r.locked)} carte${r.locked > 1 ? 's' : ''} verrouillée${r.locked > 1 ? 's' : ''}` : 'Aucune carte à verrouiller pour le moment',
    r.already ? `${fmt(r.already)} déjà verrouillée${r.already > 1 ? 's' : ''}` : null,
    r.onSale ? `${fmt(r.onSale)} en vente (verrouillée${r.onSale > 1 ? 's' : ''} si elle${r.onSale > 1 ? 's' : ''} revient)` : null,
    r.failed ? `${fmt(r.failed)} refusée${r.failed > 1 ? 's' : ''} par le jeu${r.error ? ` (« ${r.error} »)` : ''}` : null
  ]
    .filter(Boolean)
    .join(' · ') + '. Les cartes qui descendront à un seul exemplaire seront verrouillées aussi.';

let locking = Promise.resolve();
function lockSingles(cards) {
  const run = locking.then(async () => {
    const r = { locked: 0, already: 0, onSale: 0, failed: 0, error: null };
    if (!cards.size) return r;
    const { copies } = (await gameWrite('/copies', 'GET')) ?? {};
    const byCard = new Map();
    for (const c of Array.isArray(copies) ? copies : []) {
      const id = c?.card?.id;
      if (!id || !cards.has(id)) continue;
      if (!byCard.has(id)) byCard.set(id, []);
      byCard.get(id).push(c);
    }
    for (const list of byCard.values()) {
      if (list.length !== 1) continue;
      const [copy] = list;
      if (copy.protected) {
        r.already++;
        continue;
      }
      if (copy.locked) {
        r.onSale++;
        continue;
      }
      if (typeof copy.copyId !== 'string' || !copy.copyId) {
        r.failed++;
        r.error ??= 'exemplaire sans identifiant';
        continue;
      }
      for (let tries = 0; ; tries++) {
        try {
          await gameWrite(`/copies/${encodeURIComponent(copy.copyId)}/protect`, 'PUT');
          r.locked++;
          break;
        } catch (e) {
          if (!e.slowDown || tries >= 3) {
            r.failed++;
            r.error ??= e.message;
            break;
          }
          await pause(e.wait || 3000);
        }
      }
    }
    if (r.locked) lockedAt = 0;
    return r;
  });
  locking = run.catch(() => {});
  return run;
}

let guardTimer = 0;
let guardAt = 0;
function guardSoon(delay = 8000) {
  clearTimeout(guardTimer);
  guardTimer = setTimeout(guardSeries, delay);
}
async function guardSeries() {
  if (stopped || !on('albumButtons')) return;
  if (cardsWindowRow() || opening || drawing) return void guardSoon(5000);
  guardAt = Date.now();
  try {
    const { series } = await ask({ type: 'guarded-series' });
    const cards = new Set(Object.values(series ?? {}).flat());
    if (!cards.size) return;
    const r = await lockSingles(cards);
    if (r.locked) {
      const box = document.querySelector('.aqm-album .aqm-album-note');
      if (box) box.textContent = `🔒 ${fmt(r.locked)} carte${r.locked > 1 ? 's' : ''} descendue${r.locked > 1 ? 's' : ''} à un exemplaire, verrouillée${r.locked > 1 ? 's' : ''}.`;
    }
  } catch {}
}
function watchGuards() {
  if (Date.now() - guardAt >= 10 * 60e3) guardSoon(1000);
}
