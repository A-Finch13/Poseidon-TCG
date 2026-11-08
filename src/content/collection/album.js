// Aquaman, code de la page : collection, boutons favori, recherche et verrouillage dans le panneau « Album de la série
// ».

// ---------- collection : boutons favori et recherche dans le panneau « Album de la série » ----------

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
  const fav = h('button', { type: 'button', class: 'aqm-album-btn' });
  const paintFav = () => {
    fav.classList.toggle('is-on', st.favorite);
    fav.textContent = st.favorite ? '★ Dans tes favoris' : '☆ Ajouter aux favoris';
    fav.title = st.favorite ? 'Retirer des séries favorites' : 'Ajouter aux séries favorites (Plus → Séries favorites)';
  };
  fav.addEventListener('click', async () => {
    fav.disabled = true;
    await toggleFavorite(id, !st.favorite);
    st.favorite = !st.favorite;
    paintFav();
    fav.disabled = false;
  });
  paintFav();
  const want = h('button', { type: 'button', class: 'aqm-album-btn is-main' });
  const paintWant = () => {
    want.hidden = !st.missing;
    want.disabled = !st.toWant;
    want.textContent = st.toWant > 1 ? `🔭 Rechercher les ${st.toWant} manquantes` : st.toWant ? '🔭 Rechercher la manquante' : '🔭 Toutes les manquantes sont recherchées';
    want.title = 'Les mettre dans ta liste de recherches : le jeu te prévient quand elles sont mises en vente';
  };
  want.addEventListener('click', async () => {
    want.disabled = true;
    const r = await enqueueWants(st.toWantIds);
    st.toWantIds = [];
    st.toWant = 0;
    paintWant();
    want.textContent = r.sent == null ? '🔭 En attente dans Aquaman' : '🔭 Recherche en cours…';
    note.textContent = wantsNote(r, 'tu peux changer de page ou ouvrir des boosters');
  });
  paintWant();
  // « Verrouiller les uniques » : les cartes de la série à un seul exemplaire sont verrouillées, et la série est
  // surveillée (une carte qui descend à un exemplaire est alors verrouillée). Un 2e clic arrête la surveillance (rien
  // n'est déverrouillé).
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
  // (pas de progression des cartes en attente ici : redessinée à chaque série, elle faisait sauter la page ; elle reste
  // en bas de l'écran et dans « Séries favorites »)
  box.replaceChildren(fav, want, guard, note);
}

const guardNote = (r) =>
  [
    r.locked ? `🔒 ${fmt(r.locked)} carte${r.locked > 1 ? 's' : ''} verrouillée${r.locked > 1 ? 's' : ''}` : 'Aucune carte à verrouiller pour le moment',
    r.already ? `${fmt(r.already)} déjà verrouillée${r.already > 1 ? 's' : ''}` : null,
    r.onSale ? `${fmt(r.onSale)} en vente (verrouillée${r.onSale > 1 ? 's' : ''} si elle${r.onSale > 1 ? 's' : ''} revien${r.onSale > 1 ? 'nent' : 't'})` : null,
    r.failed ? `${fmt(r.failed)} refusée${r.failed > 1 ? 's' : ''} par le jeu${r.error ? ` (« ${r.error} »)` : ''}` : null
  ]
    .filter(Boolean)
    .join(' · ') + '. Les cartes qui descendront à un seul exemplaire seront verrouillées aussi.';

// Verrouille l'unique exemplaire de chaque carte de la série (cards : ids) ; une carte en vente (verrouillée par le
// marché) est laissée, elle est verrouillée à son retour. Une requête à la fois, au rythme qu'accepte le jeu.
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
      const [c] = list;
      if (c.protected) {
        r.already++;
        continue;
      }
      if (c.locked) {
        r.onSale++;
        continue;
      }
      // (GET /copies donne l'id de chaque exemplaire en copyId, l'id que prend PUT /copies/{id}/protect)
      const { copyId } = c;
      if (typeof copyId !== 'string' || !copyId) {
        r.failed++;
        r.error ??= 'exemplaire sans identifiant';
        continue;
      }
      for (let tries = 0; ; tries++) {
        try {
          await gameWrite(`/copies/${encodeURIComponent(copyId)}/protect`, 'PUT');
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
    if (r.locked) lockedAt = 0; // (« Masquer cartes verrouillées » les relit)
    return r;
  });
  locking = run.catch(() => {});
  return run;
}

// Les séries surveillées : après un changement de cartes (une vente, un échange, un recyclage…) et toutes les 10
// minutes sur les pages du jeu, leurs cartes descendues à un seul exemplaire sont verrouillées.
let guardTimer = 0;
let guardAt = 0;
function guardSoon(delay = 8000) {
  clearTimeout(guardTimer);
  guardTimer = setTimeout(guardSeries, delay);
}
async function guardSeries() {
  if (stopped || !on('albumButtons')) return;
  // (pas pendant que la fenêtre de cartes est ouverte : un verrouillage fait relire son état au jeu, sa pile
  // redessinée)
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
