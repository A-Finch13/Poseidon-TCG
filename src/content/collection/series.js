// Aquaman, code de la page : collection, séries favorites, et la bande des séries triée et filtrée.

// ---------- séries favorites ----------

let favIds = null; // ids des séries favorites, pour les étoiles de la page Collection
let seriesBySlug = null; // slug -> id, d'après les séries du jeu
let seriesTitles = null; // id -> titre en minuscules, d'après les séries du jeu (le filtre « Favoris » du marché)

// Lit les favoris (fresh : avec tout de suite les changements faits sur les autres appareils) et redessine les étoiles.
async function loadFavIds(fresh = false) {
  const res = await send({ type: 'favorites', fresh });
  if (!res || res.error) return;
  favIds = new Set(res.favorites.map((s) => s.id));
  seriesBySlug = new Map(res.all.map((s) => [s.slug, s.id]));
  seriesTitles = new Map(res.all.map((s) => [s.id, String(s.title ?? '').trim().toLowerCase()]));
  document.querySelectorAll('.aqm-star').forEach((star) => paintStar(star));
  const count = document.querySelector('.aqm-fav-open b');
  if (count) count.textContent = String(favIds.size);
}

async function toggleFavorite(id, on) {
  const res = await send({ type: 'favorite', id, on });
  if (res?.favorites) favIds = new Set(res.favorites);
  document.querySelectorAll('.aqm-star').forEach((star) => paintStar(star));
  const count = document.querySelector('.aqm-fav-open b');
  if (count) count.textContent = String(favIds?.size ?? 0);
}

function paintStar(star) {
  const on = !!favIds?.has(star.dataset.id);
  setText(star, on ? '★' : '☆');
  star.classList.toggle('is-on', on);
  star.title = on ? 'Retirer des séries favorites' : 'Ajouter aux séries favorites';
  star.setAttribute('aria-pressed', String(on));
}

let favLoading = false;

// Des étoiles sur les séries de la page Collection, et un bouton « ★ Favoris » au-dessus.
function markFavoriteSeries() {
  if (!location.pathname.startsWith('/jeu/collection')) return;
  const strip = document.querySelector('[role="radiogroup"][aria-label="Série"], [role="radiogroup"][aria-label="Série"]') ?? seriesStrip();
  if (!strip || strip.closest('.aqm-root')) return;
  // Les boutons arrivent tout de suite avec la bande ; seules les étoiles attendent les séries (leur nombre montre « …
  // » jusque-là).
  if (!seriesBySlug && !favLoading) {
    favLoading = true;
    loadFavIds().finally(() => {
      favLoading = false;
      schedule();
    });
  }
  if (!strip.previousElementSibling?.classList.contains('aqm-fav-bar'))
    strip.before(
      h(
        'div',
        { class: 'aqm-root aqm-fav-bar' },
        h('button', { type: 'button', class: 'aqm-chip aqm-fav-open', onclick: openFavorites }, '★ Favoris', h('b', {}, favIds ? String(favIds.size) : '…')),
        h('button', {
          type: 'button',
          class: 'aqm-chip aqm-sort-progress',
          'aria-pressed': 'false',
          onclick: () => {
            setByProgress(!byProgress);
            sortByProgress(strip);
            strip.scrollTo?.({ left: 0, behavior: 'smooth' });
          },
          title: 'Les séries où il te manque le moins de cartes en premier'
        }, 'Les plus avancées'),
        h('button', {
          type: 'button',
          class: 'aqm-chip aqm-sort-progress aqm-small-series',
          'aria-pressed': 'false',
          onclick: () => {
            setSmallOnly(!smallOnly);
            sortByProgress(strip);
            strip.scrollTo?.({ left: 0, behavior: 'smooth' });
          },
          title: `Masquer les séries de ${SMALL_SERIES} personnages ou moins`
        }, `Masquer séries <= ${SMALL_SERIES} persos`),
        h('button', {
          type: 'button',
          class: 'aqm-chip aqm-sort-progress aqm-claimed-series',
          'aria-pressed': 'false',
          onclick: () => {
            setClaimedHidden(!claimedHidden);
            if (claimedHidden) loadClaimed(true);
            sortByProgress(strip);
            strip.scrollTo?.({ left: 0, behavior: 'smooth' });
          },
          title: 'Masquer les séries dont tu as déjà le badge (album réclamé)'
        }, 'Masquer séries avec badge'),
        h('button', {
          type: 'button',
          class: 'aqm-chip aqm-sort-progress aqm-locked-cards',
          'aria-pressed': 'false',
          onclick: () => {
            setLockedHidden(!lockedHidden);
            if (lockedHidden) loadLocked();
            filterLocked(true);
            sortByProgress(strip);
          },
          title: 'Masquer les cartes dont tous tes exemplaires sont verrouillés'
        }, 'Masquer cartes verrouillées')
      )
    );
  if (claimedHidden && Date.now() - claimedAt > 2 * 60e3) loadClaimed();
  if (lockedHidden && Date.now() - lockedAt > 2 * 60e3) loadLocked();
  filterLocked();
  sortByProgress(strip);
  keepStripPlace(strip);
  if (!seriesBySlug) return;
  for (const img of strip.querySelectorAll('img[src*="/api/covers/"]')) {
    const tile = img.closest('button, a, [role="radio"]') ?? img.parentElement;
    if (!tile || tile.querySelector(':scope > .aqm-star')) continue;
    anchorBadges(tile);
    const slug = decodeURIComponent(img.getAttribute('src').match(/\/api\/covers\/([^/?#]+)\.webp/)?.[1] ?? '');
    const id = seriesBySlug.get(slug);
    if (!id) continue;
    const star = h('span', {
      class: 'aqm-root aqm-star',
      role: 'button',
      tabindex: '0',
      'data-id': id,
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(id, !favIds?.has(id));
      },
      onkeydown: (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(id, !favIds?.has(id));
      }
    });
    paintStar(star);
    tile.append(star);
  }
}

// Les séries de la bande de celle qui a le moins de cartes manquantes à celle qui en a le plus (leur « 15/29 » : 14
// manquantes), les complètes en dernier ; « Toutes les séries » reste en premier. Seul l'ordre d'affichage change (CSS
// order) : l'ordre du jeu lui-même est gardé.
// Une série complétée pendant la visite (son nombre a atteint son total) : la bande est triée ainsi et montrée depuis
// son début, les séries restant à compléter d'abord.
// Gardé pour l'onglet : de retour de la page d'un personnage, la bande est triée de la même façon et montrée au même
// endroit.
const BY_PROGRESS_KEY = 'aqm-by-progress';
const STRIP_LEFT_KEY = 'aqm-strip-left';
let byProgress = (() => {
  try {
    return sessionStorage.getItem(BY_PROGRESS_KEY) === '1';
  } catch {
    return false;
  }
})();
// « Masquer séries <= 5 persos » : les séries d'au plus SMALL_SERIES cartes sont cachées (gardé pour l'onglet aussi).
const SMALL_SERIES = 5;
const SMALL_ONLY_KEY = 'aqm-small-series';
let smallOnly = (() => {
  try {
    return sessionStorage.getItem(SMALL_ONLY_KEY) === '1';
  } catch {
    return false;
  }
})();
function setSmallOnly(on) {
  smallOnly = on;
  try {
    on ? sessionStorage.setItem(SMALL_ONLY_KEY, '1') : sessionStorage.removeItem(SMALL_ONLY_KEY);
  } catch {}
}
// « Masquer séries avec badge » : les séries dont le joueur a réclamé l'album sont cachées (gardé pour l'onglet aussi).
// Leurs slugs viennent de la collection du joueur (ses albums), rapprochés de la couverture de chaque série de la
// bande.
const CLAIMED_KEY = 'aqm-hide-claimed';
let claimedHidden = (() => {
  try {
    return sessionStorage.getItem(CLAIMED_KEY) === '1';
  } catch {
    return false;
  }
})();
function setClaimedHidden(on) {
  claimedHidden = on;
  try {
    on ? sessionStorage.setItem(CLAIMED_KEY, '1') : sessionStorage.removeItem(CLAIMED_KEY);
  } catch {}
}
let claimedSlugs = null; // Set des slugs des séries avec un badge, une fois lus
let claimedAt = 0;
async function loadClaimed(fresh = false) {
  claimedAt = Date.now();
  const res = await send({ type: 'claimed-albums', fresh });
  if (!res || res.error || !Array.isArray(res.slugs)) return;
  claimedSlugs = new Set(res.slugs);
  const strip = seriesStrip();
  if (strip) sortByProgress(strip);
}
// « Masquer cartes verrouillées » : les cartes dont tous les exemplaires du joueur sont verrouillés (protégés) sont
// cachées de la collection (gardé pour l'onglet aussi). Elles viennent de GET /copies, rapprochées de l'image de
// chaque carte affichée.
const LOCKED_KEY = 'aqm-hide-locked';
let lockedHidden = (() => {
  try {
    return sessionStorage.getItem(LOCKED_KEY) === '1';
  } catch {
    return false;
  }
})();
function setLockedHidden(on) {
  lockedHidden = on;
  try {
    on ? sessionStorage.setItem(LOCKED_KEY, '1') : sessionStorage.removeItem(LOCKED_KEY);
  } catch {}
}
let lockedImages = null; // Set des images (clé de imageKey) des cartes entièrement verrouillées, une fois lues
let lockedAt = 0;
async function loadLocked() {
  lockedAt = Date.now();
  let copies;
  try {
    ({ copies } = (await gameWrite('/copies', 'GET')) ?? {});
  } catch {
    return;
  }
  if (!Array.isArray(copies)) return;
  const byImage = new Map(); // image -> tous les exemplaires protégés ?
  for (const c of copies) {
    const key = imageKey(c?.card?.image);
    if (!key) continue;
    byImage.set(key, (byImage.get(key) ?? true) && !!c.protected);
  }
  lockedImages = new Set([...byImage].filter(([, all]) => all).map(([key]) => key));
  filterLocked(true);
}
// Refait seulement quand le contenu de la page a changé (son nombre d'éléments) : l'album peut contenir des milliers
// de cartes.
let lockedSize = -1;
const LAYOUT = '.aqm-root, [role="radiogroup"], [role="tablist"], #album-title, h1, h2';
function filterLocked(force = false) {
  const marked = () => document.querySelectorAll('[data-aqm-locked-card]');
  const chip = document.querySelector('.aqm-locked-cards');
  chip?.classList.toggle('is-on', lockedHidden);
  chip?.setAttribute('aria-pressed', String(lockedHidden));
  if (!lockedHidden || !lockedImages || !location.pathname.startsWith('/jeu/collection')) {
    if (lockedSize !== -1) marked().forEach((el) => el.removeAttribute('data-aqm-locked-card'));
    lockedSize = -1;
    return;
  }
  const page = document.querySelector('main') ?? document.body;
  const size = page.getElementsByTagName('*').length;
  if (size === lockedSize && !force) return;
  lockedSize = size;
  marked().forEach((el) => el.removeAttribute('data-aqm-locked-card'));
  // La tuile de chaque carte : la boîte la plus haute autour de son image qui ne contient pas d'autre carte.
  const imgs = [...page.querySelectorAll('img')].filter((img) => !img.closest('.aqm-root') && isCardImage(img.currentSrc || img.getAttribute('src')));
  const held = new Map();
  for (const img of imgs) for (let el = img.parentElement; el && el !== page; el = el.parentElement) held.set(el, (held.get(el) ?? 0) + 1);
  for (const img of imgs) {
    if (!lockedImages.has(imageKey(img.currentSrc || img.getAttribute('src')))) continue;
    let tile = img;
    // (jamais une boîte avec la bande, les onglets ou le titre de l'album : une série d'une carte affichée)
    for (let up = tile.parentElement; up && up !== page && held.get(up) === 1 && !up.querySelector(LAYOUT); up = tile.parentElement) tile = up;
    if (tile !== img) tile.setAttribute('data-aqm-locked-card', '');
  }
}
const coverSlug = (el) => {
  const src = el.querySelector('img[src*="/api/covers/"]')?.getAttribute('src');
  try {
    return src ? decodeURIComponent(src.match(/\/api\/covers\/([^/?#]+)\.webp/)?.[1] ?? '') : '';
  } catch {
    return '';
  }
};
function setByProgress(on) {
  byProgress = on;
  try {
    on ? sessionStorage.setItem(BY_PROGRESS_KEY, '1') : sessionStorage.removeItem(BY_PROGRESS_KEY);
  } catch {}
}

// La bande dessinée par le jeu (de nouveau, après un changement de page) est ramenée là où le joueur l'avait laissée,
// puis sa place est gardée à mesure qu'elle défile.
const placedStrips = new WeakSet();
let placedVisit = -1; // la visite de la collection dont la bande a été remise en place
function keepStripPlace(strip) {
  if (placedStrips.has(strip)) return;
  placedStrips.add(strip);
  // (la bande défile elle-même, sinon c'est la boîte autour d'elle)
  const around = [strip, strip.parentElement, strip.parentElement?.parentElement].find((el) => el && /(auto|scroll)/.test(getComputedStyle(el).overflowX));
  if (around && around !== strip) strip = around;
  let left = null;
  try {
    const kept = sessionStorage.getItem(STRIP_LEFT_KEY);
    if (kept != null) left = Number(kept) || 0;
  } catch {}
  // Le jeu fait défiler jusqu'à la série sélectionnée dans son propre ordre (une fois, ou en douceur, un moment après
  // avoir dessiné la bande) : pendant 1,5 s la bande est remise en place à chaque image, jusqu'à ce que le joueur la
  // fasse défiler. Sans place gardée, la série sélectionnée est montrée là où le tri l'a mise.
  // Seulement une fois par visite de la page : la bande que le jeu redessine quand une autre série est choisie est
  // laissée au défilement du jeu (remise en place à chaque image, elle sautait entre les deux).
  let placing = placedVisit !== pageVisit;
  placedVisit = pageVisit;
  const until = Date.now() + 1500;
  const stop = () => (placing = false);
  for (const type of ['wheel', 'pointerdown', 'touchstart', 'keydown']) strip.addEventListener(type, stop, { passive: true, once: true });
  const place = () => {
    if (!placing || !strip.isConnected || Date.now() > until) return void (placing = false);
    if (left != null) {
      if (Math.abs(strip.scrollLeft - left) > 2) strip.scrollLeft = left;
    } else if (byProgress) {
      const picked = strip.querySelector('[aria-checked="true"]');
      if (picked) {
        const [p, s] = [picked.getBoundingClientRect(), strip.getBoundingClientRect()];
        const want = Math.max(0, Math.round(strip.scrollLeft + p.left - s.left - (strip.clientWidth - p.width) / 2));
        if (Math.abs(strip.scrollLeft - want) > 2) strip.scrollLeft = want;
      }
    }
    requestAnimationFrame(place);
  };
  if (placing) requestAnimationFrame(place);
  let timer = 0;
  strip.addEventListener(
    'scroll',
    () => {
      if (placing) return; // (le défilement du jeu, ou celui d'Aquaman : pas la place du joueur)
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          sessionStorage.setItem(STRIP_LEFT_KEY, String(Math.round(strip.scrollLeft)));
        } catch {}
      }, 150);
    },
    { passive: true }
  );
}
// série (son texte sans le nombre) -> cartes manquantes vues en dernier ; gardé pour l'onglet (un achat peut recharger
// la page avant que le joueur ne revienne à la collection)
const missingSeen = new Map(
  (() => {
    try {
      return Object.entries(JSON.parse(sessionStorage.getItem('aqm-missing-seen') || '{}'));
    } catch {
      return [];
    }
  })()
);
let missingSaved = '';
function sortByProgress(strip) {
  const items = [...strip.children].filter((el) => !el.classList.contains('aqm-root'));
  const count = (el) => {
    const m = el.textContent.match(/(\d[\d  ]*)\s*\/\s*(\d[\d  ]*)/); // (les chiffres propres à un titre sont à part)
    if (!m) return null;
    const [owned, total] = [m[1], m[2]].map((x) => Number(x.replace(/\D/g, '')));
    return total ? { missing: Math.max(0, total - owned), rate: owned / total, total } : null;
  };
  const rows = items.map((el, i) => ({ el, i, c: count(el), all: /toutes les s[ée]ries/i.test(el.textContent) }));
  let completed = false;
  for (const { el, c, all } of rows) {
    if (!c || all) continue;
    const key = el.textContent.replace(/\d[\d  ]*\s*\/\s*\d[\d  ]*/, '').trim();
    if (missingSeen.get(key) > 0 && c.missing === 0) completed = true;
    missingSeen.set(key, c.missing);
  }
  if (completed) setByProgress(true);
  const seen = JSON.stringify(Object.fromEntries(missingSeen));
  if (seen !== missingSaved) {
    missingSaved = seen;
    try {
      sessionStorage.setItem('aqm-missing-seen', seen);
    } catch {}
  }
  const chip = strip.previousElementSibling?.querySelector('.aqm-sort-progress:not(.aqm-small-series)');
  chip?.classList.toggle('is-on', byProgress);
  chip?.setAttribute('aria-pressed', String(byProgress));
  const small = strip.previousElementSibling?.querySelector('.aqm-small-series');
  small?.classList.toggle('is-on', smallOnly);
  small?.setAttribute('aria-pressed', String(smallOnly));
  const claimedChip = strip.previousElementSibling?.querySelector('.aqm-claimed-series');
  claimedChip?.classList.toggle('is-on', claimedHidden);
  claimedChip?.setAttribute('aria-pressed', String(claimedHidden));
  // Cachées : les petites séries, les séries avec un badge. « Toutes les séries », la série affichée et celles sans
  // nombre restent.
  for (const { el, c, all } of rows) {
    const picked = el.getAttribute('aria-checked') === 'true' || !!el.querySelector('[aria-checked="true"]');
    const claimed = claimedHidden && !!claimedSlugs && !all && !picked && claimedSlugs.has(coverSlug(el));
    const hide = claimed || (smallOnly && !all && c && c.total <= SMALL_SERIES && !picked);
    const display = hide ? 'none' : '';
    if (el.style.display !== display) el.style.display = display;
  }
  const ranked = rows
    .sort(
      (a, b) =>
        b.all - a.all ||
        !a.c - !b.c ||
        (a.c?.missing === 0) - (b.c?.missing === 0) ||
        (a.c?.missing ?? 0) - (b.c?.missing ?? 0) ||
        (b.c?.rate ?? 0) - (a.c?.rate ?? 0) ||
        a.i - b.i
    );
  ranked.forEach(({ el }, n) => {
    const order = byProgress ? String(n) : '';
    if (el.style.order !== order) el.style.order = order;
  });
  if (completed) strip.scrollTo?.({ left: 0, behavior: 'smooth' });
}
