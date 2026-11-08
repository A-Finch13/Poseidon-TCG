// Aquaman, code de la page : accueil, la roue des boosters de chaque sorte, sa lueur et son inclinaison.

function markBoosterKinds() {
  if (!featLoaded || !on('boosterWheel') || !/^\/jeu\/?$/.test(location.pathname) || drawing || opening) return;
  // Le jeu a lu ses boosters avant qu'Aquaman n'écoute : inject.js les a écrits dans la page ; sinon Aquaman les lit
  // lui-même une fois (tous).
  try {
    const kept = JSON.parse(document.documentElement.getAttribute('data-aqm-boosters') || 'null');
    if (Array.isArray(kept)) pendingBoosters = kept.filter((b) => b?.id);
  } catch {}
  if (!pendingBoosters && !boostersAsked) {
    boostersAsked = true;
    setKind('');
    window.__aquamanSelf = true; // dans le script, inject.js laisse cette réponse entière
    const asked = pageFetch('/api-game/v1/me', { credentials: 'include', headers: { accept: 'application/json' } });
    window.__aquamanSelf = false;
    asked
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => {
        if (!Array.isArray(me?.pending) || pendingBoosters) return;
        pendingBoosters = me.pending.filter((b) => b?.id).map((b) => ({ id: b.id, kind: b.kindId ?? null, name: b.kindName ?? null, art: b.kindArt ?? null }));
        markBoosterKinds();
      })
      .catch(() => {});
  }
  const kinds = boosterKinds();
  const parts = findHomeParts();
  let strip = document.querySelector('.aqm-piles');
  const off = () => {
    showTitleCount(null);
    strip?.remove();
    document.querySelectorAll('[data-aqm-hidden]').forEach((el) => el.removeAttribute('data-aqm-hidden'));
  };
  if (!parts || kinds.length < 2) return off();
  const sig = kinds.map((k) => `${k.key}:${k.count}`).join('|');
  // Nouveaux nombres : les piles sont redessinées (pas pendant que le jeu montre une ouverture).
  if (piles?.sig !== sig) {
    if (!shotStore) return; // les copies gardées sont en cours de lecture
    // Les piles déjà vues sont montrées tout de suite ; le jeu ne dessine que les sortes jamais vues.
    const known = cachedShots(kinds);
    if (known) piles = { sig, shots: known };
    else {
      if (!gameBusy()) drawPiles(kinds, sig);
      return;
    }
  }
  if (!piles.shots) return off();
  parts.pile.setAttribute('data-aqm-hidden', '');
  parts.buttons.setAttribute('data-aqm-hidden', '');
  if (!strip || strip.previousElementSibling !== parts.pile) {
    strip?.remove();
    strip = h('div', { class: 'aqm-root aqm-piles' });
    parts.pile.after(strip);
  }
  if (strip.dataset.sig === sig) return void showTitleCount(titleCount);
  strip.dataset.sig = sig;
  renderWheel(strip, piles.shots);
}

// Les piles, les boosters gratuits d'abord : une devant et ses voisines à côté, sur une rangée qui tourne (trois sortes
// ou plus), avec des flèches, un clic sur une pile d'à côté ou un glissé.
let wheelKey = null; // la sorte de devant, gardée pendant que les piles sont redessinées
function renderWheel(strip, shots) {
  const ordered = [...shots].sort((a, b) => (b.key === 'classic') - (a.key === 'classic'));
  const n = ordered.length;
  let at = Math.max(0, ordered.findIndex((s) => s.key === wheelKey));
  // Les boutons du jeu de chaque sorte : sous les piles, ils ne bougent pas et suivent la sorte de devant.
  const buttonsOf = ordered.map((shot) => {
    const buttons = shot.buttons.cloneNode(true);
    [...buttons.querySelectorAll('button')].forEach((b, j) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openFromCopy(shot.key, j);
      })
    );
    return buttons;
  });
  const controls = h('div', { class: 'aqm-wheel-controls' });
  const items = ordered.map((shot, i) => {
    const art = h('div', { class: 'aqm-pile-art' }, shot.pile.cloneNode(true));
    tiltOnHover(art);
    const pick = () => {
      const front = ((at % n) + n) % n;
      if (i !== front) turn(i - front);
    };
    // (pas de nom au-dessus : le pack montre sa sorte)
    return h('div', { class: 'aqm-pile', title: shot.name, onclick: pick }, art);
  });
  const track = h('div', { class: 'aqm-wheel-track' }, items);
  const arrow = (dir, label) => h('button', { type: 'button', class: `aqm-wheel-arrow is-${dir < 0 ? 'prev' : 'next'}`, 'aria-label': label, onclick: () => turn(dir) }, dir < 0 ? '‹' : '›');
  const dots = h('div', { class: 'aqm-wheel-dots' });
  const prev = arrow(-1, 'Catégorie précédente');
  const next = arrow(1, 'Catégorie suivante');
  const wheel = h('div', { class: 'aqm-wheel' }, prev, track, next);
  strip.replaceChildren(wheel, controls, dots);

  let width = 0;
  function place() {
    fitStrip(strip);
    width = width || Math.max(...items.map((el) => el.offsetWidth)) || 360;
    const room = strip.clientWidth || width;
    // Trois sortes affichées au plus : celle de devant et une voisine de chaque côté (jamais par-dessus, et seulement
    // quand le cadre est assez large) ; les autres attendent derrière, invisibles. À partir de trois sortes, la rangée
    // tourne en boucle.
    const front = ((at % n) + n) % n;
    const half = Math.floor(n / 2);
    const side = 0.72;
    const offset = Math.round(width / 2 + (width * side) / 2 + 40);
    const fits = offset + (width * side) / 2 <= room / 2 - 8;
    items.forEach((el, i) => {
      const d = n >= 3 ? ((((i - front) % n) + n + half) % n) - half : i - front;
      el.style.transform = d ? `translateX(${Math.sign(d) * offset}px) scale(${Math.abs(d) > 1 ? side * 0.8 : side})` : 'none';
      el.classList.toggle('is-front', !d);
      el.classList.toggle('is-away', Math.abs(d) > 1 || (!!d && !fits));
    });
    wheelKey = ordered[front].key;
    showTitleCount(ordered[front].count);
    paintGlow(wheel, ordered[front]);
    if (controls.firstChild !== buttonsOf[front]) controls.replaceChildren(buttonsOf[front]);
    // Deux sortes : pas de flèche vers le vide.
    prev.hidden = n < 3 && at === 0;
    next.hidden = n < 3 && at === n - 1;
    dots.replaceChildren(...ordered.map((s, i) => h('button', { type: 'button', class: `aqm-wheel-dot${i === front ? ' is-on' : ''}`, 'aria-label': s.name, title: s.name, onclick: () => turn(i - front) })));
  }
  // La roue tourne par le plus court chemin ; deux sortes passent de l'une à l'autre.
  function turn(dir) {
    if (n >= 3) at += dir > n / 2 ? dir - n : dir < -n / 2 ? dir + n : dir;
    else at = Math.min(n - 1, Math.max(0, at + Math.sign(dir)));
    place();
  }
  let touchX = null;
  track.addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
  track.addEventListener('touchend', (e) => {
    const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
    if (touchX != null && Math.abs(dx) > 40) turn(dx < 0 ? 1 : -1);
    touchX = null;
  });
  strip.classList.add('is-still');
  place();
  requestAnimationFrame(() => {
    width = 0;
    place();
    requestAnimationFrame(() => strip.classList.remove('is-still'));
  });
}

// La lueur derrière le booster de devant prend la couleur de son pack : la couleur principale de son image (les pixels
// les plus vifs comptent le plus), le bleu du jeu pour les boosters classiques. Lue une fois par image.
const GLOW_BLUE = [37, 99, 235];
const glowOf = new Map(); // image -> Promise<[r, g, b] | null>
function packColour(art) {
  if (!art) return Promise.resolve(null);
  if (!glowOf.has(art))
    glowOf.set(
      art,
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 24;
            const g = canvas.getContext('2d', { willReadFrequently: true });
            g.drawImage(img, 0, 0, 24, 24);
            const d = g.getImageData(0, 0, 24, 24).data;
            let r = 0;
            let gr = 0;
            let b = 0;
            let w = 0;
            for (let i = 0; i < d.length; i += 4) {
              const max = Math.max(d[i], d[i + 1], d[i + 2]);
              const sat = max ? (max - Math.min(d[i], d[i + 1], d[i + 2])) / max : 0;
              const weight = (d[i + 3] / 255) * sat * sat * (max / 255);
              r += d[i] * weight;
              gr += d[i + 1] * weight;
              b += d[i + 2] * weight;
              w += weight;
            }
            if (w < 0.5) return resolve(null);
            // (aussi lumineuse que la lueur bleue du jeu, quelle que soit l'image)
            const c = [r / w, gr / w, b / w];
            const k = 235 / Math.max(...c);
            resolve(c.map((x) => Math.round(x * k)));
          } catch {
            resolve(null); // une image d'un autre site : ses pixels ne peuvent pas être lus
          }
        };
        img.onerror = () => resolve(null);
        img.src = art;
      })
    );
  return glowOf.get(art);
}
async function paintGlow(wheel, shot) {
  const c = (on('packGlow') && (await packColour(shot.art))) || GLOW_BLUE;
  if (wheelKey === shot.key) wheel.style.setProperty('--aqm-glow', `rgb(${c.join(' ')} / 0.38)`);
}

// La bande prend toute la largeur intérieure du cadre de l'accueil (la boîte arrondie autour des boosters), quelle que
// soit la largeur de la colonne où elle se trouve.
function fitStrip(strip) {
  let field = strip.parentElement;
  while (field && field !== document.body) {
    const cs = getComputedStyle(field);
    if (parseFloat(cs.borderTopLeftRadius) >= 16 && field.clientWidth >= 480) break;
    field = field.parentElement;
  }
  if (!field || field === document.body) field = document.querySelector('main') ?? strip.parentElement;
  const cs = getComputedStyle(field);
  const r = field.getBoundingClientRect();
  const left = r.left + parseFloat(cs.paddingLeft) + 16;
  const width = Math.max(0, r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 32);
  strip.style.width = `${Math.round(width)}px`;
  strip.style.left = '0px';
  strip.style.left = `${Math.round(left - strip.getBoundingClientRect().left)}px`;
}
let fitTimer = 0;
let fitWidth = innerWidth;
onStart(() => {
  addEventListener('resize', () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      const strip = document.querySelector('.aqm-piles');
      // (sur téléphone, la barre d'adresse qui apparaît ou disparaît au défilement ne change que la hauteur)
      if (stopped || !strip || innerWidth === fitWidth) return;
      fitWidth = innerWidth;
      delete strip.dataset.sig; // redessiné à la nouvelle largeur
      markBoosterKinds();
    }, 150);
  });
});

// Comme dans le jeu (mesuré sur un enregistrement) : le booster du dessus de la pile flotte de haut en bas (16 px, 4,7
// s par cycle), et tourne vers le pointeur autour de sa pose (rotateY(-20deg) rotateX(7deg)), d'environ 9° de chaque
// côté de gauche à droite ; les boosters en éventail derrière lui ne bougent pas, rien ne grossit.
function tiltOnHover(el) {
  // Le booster du dessus : celui hors des couches en éventail (aria-hidden).
  const pose = [...el.querySelectorAll('[class*="__packPose"]')].find((p) => !p.closest('[aria-hidden="true"]'));
  if (!pose) return;
  const scene = pose.closest('[class*="__packScene"]');
  scene?.parentElement?.setAttribute('data-aqm-float', '');
  const base = pose.style.transform || 'rotateY(-20deg) rotateX(7deg)';
  const ry = Number(base.match(/rotateY\((-?[\d.]+)deg\)/)?.[1] ?? -20);
  const rx = Number(base.match(/rotateX\((-?[\d.]+)deg\)/)?.[1] ?? 7);
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const x = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5));
    const y = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5));
    pose.classList.add('aqm-pose-follow');
    pose.style.transform = `rotateY(${(ry + x * 18).toFixed(2)}deg) rotateX(${(rx - y * 10).toFixed(2)}deg)`;
  });
  el.addEventListener('pointerleave', () => {
    pose.classList.remove('aqm-pose-follow');
    pose.style.transform = base;
  });
}
