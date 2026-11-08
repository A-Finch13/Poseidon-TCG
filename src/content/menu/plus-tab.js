// Aquaman, code de la page : l'onglet « Plus », son menu et les réglages.

// ---------- onglet « Plus » ----------

// Bouton « Plus » tout à droite de chaque navigation du jeu (celle qui a le lien « Marché »), après « Classement ».
function addPlusTab() {
  for (const link of document.querySelectorAll('a[data-tour="nav-/jeu/marche"], a[href="/jeu/marche"]')) {
    if (link.closest('.aqm-root')) continue;
    // (le dernier lien de la navigation : le jeu peut en ajouter après coup, « Plus » le suit alors)
    const last = [...link.parentElement.children].filter((el) => el.tagName === 'A').pop() ?? link;
    const placed = link.parentElement.querySelector(':scope > .aqm-plus');
    if (placed) {
      if (placed.previousElementSibling !== last) last.after(placed);
      continue;
    }
    const btn = h('button', {
      type: 'button',
      class: link.className,
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      onclick: (e) => {
        e.preventDefault();
        menu ? closeMenu() : openMenu(btn);
      }
    });
    btn.classList.remove('text-white');
    btn.classList.add('aqm-plus', 'text-zinc-400', 'hover:text-white');
    const icon = h('span', { class: 'aqm-nav-ico', html: ICON_DOTS });
    const iconClass = link.querySelector('svg')?.getAttribute('class');
    if (iconClass) icon.firstChild.setAttribute('class', iconClass);
    const text = [...link.querySelectorAll('span')].find((s) => !s.children.length && s.textContent.trim());
    btn.append(icon, h('span', { class: text?.className || null }, 'Plus'));
    last.after(btn);
  }
}

let menu = null;

// Menu de l'onglet « Plus ».
function openMenu(anchor) {
  closeMenu();
  const item = (title, text, icon, open) =>
    h(
      'button',
      {
        type: 'button',
        role: 'menuitem',
        class: 'aqm-menu-item',
        onclick: () => {
          closeMenu();
          open();
        }
      },
      h('span', { class: 'aqm-menu-ico', html: icon }),
      h('span', {}, h('strong', {}, title), h('small', {}, text))
    );
  menu = h(
    'div',
    { class: 'aqm-root aqm-menu', role: 'menu' },
    item('Boosters rentables', 'Prix, taux de drop, persos et séries', ICON_PACK, openBoosters),
    item('Qui a cette carte ?', 'Ceux qui l’ont, la vendent ou l’ont tirée', ICON_SEARCH, openWhoHas),
    item('Séries favorites', 'Tes séries et leurs persos manquants', ICON_STAR, openFavorites),
    item('Ma progression', 'Ta collection, par rareté et jour par jour', ICON_CHART, openCollectionStats),
    item('Visite guidée', 'Le tour de ce qu’ajoute Aquaman', ICON_COMPASS, () => startTour(0)),
    item('Nouveautés', 'Ce qui a changé dans Aquaman', ICON_SPARK, () => openNews()),
    item('Réglages', 'Activer ou couper chaque fonction d’Aquaman', ICON_GEAR, openSettings),
    meId === AUTHOR_ID ? item('Joueurs avec Aquaman', 'Réservé à l’auteur', ICON_TROPHY, openUsers) : null,
    meId === AUTHOR_ID ? item('Scanner les packs', 'Publier le design de chaque booster', ICON_PACK, startScan) : null
  );
  menu.anchor = anchor;
  document.body.append(menu);
  anchor.setAttribute('aria-expanded', 'true');
  const r = anchor.getBoundingClientRect();
  const below = r.bottom + 8 + menu.offsetHeight < innerHeight;
  menu.style.top = `${below ? r.bottom + 8 : r.top - 8 - menu.offsetHeight}px`;
  menu.style.left = `${Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.left + r.width / 2 - menu.offsetWidth / 2))}px`;
}

// Les réglages, les mêmes dans l'extension et le script, sur ordinateur ou téléphone (SETTINGS dans
// src/lib/settings.js).
// Une fonction activée ou désactivée s'applique à la fermeture de la fenêtre : la page est rechargée.
let settingsOpen = false;
async function openSettings() {
  const body = openOverlay('Réglages', `Aquaman ${chrome.runtime.getManifest().version} · ${owner === 'userscript' ? 'script' : 'extension'} · les mêmes réglages sur PC et téléphone`);
  body.parentElement.classList.add('aqm-panel-wide');
  let r;
  try {
    r = await ask({ type: 'settings' });
  } catch (e) {
    body.append(h('p', { class: 'aqm-note' }, e.message));
    return;
  }
  const values = { ...r.values };
  const before = JSON.stringify(values);
  // Une carte par groupe, chaque réglage avec son titre, son aide et un interrupteur à droite.
  const row = ([key, title, hint, only]) => {
    const away = only === 'extension' && owner === 'userscript';
    const box = h('input', { type: 'checkbox', role: 'switch', class: 'aqm-toggle', disabled: away, 'aria-label': title });
    box.checked = !away && !!values[key];
    box.addEventListener('change', () => {
      values[key] = box.checked;
      ask({ type: 'set-settings', patch: { [key]: box.checked } }).catch(() => {});
    });
    return h(
      'label',
      { class: `aqm-setting${away ? ' is-off' : ''}` },
      h('span', { class: 'aqm-setting-text' }, h('strong', {}, title), h('small', {}, away ? `${hint} · extension sur PC seulement` : hint)),
      box
    );
  };
  body.append(
    h(
      'div',
      { class: 'aqm-settings-groups' },
      r.groups.map((group) =>
        h('section', { class: 'aqm-settings-group' }, h('p', { class: 'aqm-settings-title' }, h('span', { 'aria-hidden': 'true' }, group.icon ?? ''), group.title), group.items.map(row))
      )
    ),
    h(
      'div',
      { class: 'aqm-settings-foot' },
      h('p', {}, 'Un changement s’applique à la fermeture de cette fenêtre : la page se recharge.'),
      h('div', { class: 'aqm-settings-actions' }, h('button', { type: 'button', class: 'aqm-tour-btn', onclick: () => openNews() }, 'Nouveautés'), h('button', { type: 'button', class: 'aqm-tour-btn is-main', onclick: () => startTour(0) }, 'Visite guidée'))
    )
  );
  settingsOpen = true;
  overlayClosed = () => {
    settingsOpen = false;
    if (JSON.stringify(values) !== before) location.reload();
  };
}

function closeMenu() {
  if (!menu) return;
  menu.anchor?.setAttribute('aria-expanded', 'false');
  menu.remove();
  menu = null;
}
