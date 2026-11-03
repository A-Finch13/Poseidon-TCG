// Userscript: settings in the "Plus" menu of the site, in place of the extension's popup.
(() => {
  const OPTIONS = [
    ['notifyUpdated', 'Afficher les nouveautés après une mise à jour du script'],
    ['syncPity', 'Partager le compte de la garantie anti-malchance entre mes appareils (PC, téléphone, extension et script)'],
    ['syncFavorites', 'Partager mes séries favorites entre mes appareils'],
    ['syncWants', 'Partager les cartes en attente de recherche entre mes appareils'],
    ['syncMarket', 'Partager les cartes achetées masquées et les doublons en attente de vente entre mes appareils'],
    ['sharePulls', 'Envoyer les beaux tirages que je vois à la base commune d’Aquaman (« Qui a cette carte ? »)']
  ];
  const ICON_GEAR =
    '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Z"/></svg>';

  // Settings window.
  async function openSettings() {
    document.querySelector('.aqm-settings')?.remove();
    const { settings } = await chrome.storage.local.get('settings');
    const current = { notifyUpdated: true, syncPity: true, syncFavorites: true, syncWants: true, syncMarket: true, sharePulls: true, ...settings };
    const close = () => {
      back.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), close());
    const go = (hash) => {
      close();
      location.hash = hash;
    };
    const back = document.createElement('div');
    back.className = 'aqm-root aqm-overlay aqm-settings';
    back.innerHTML = `
      <div class="aqm-panel" role="dialog" aria-modal="true" aria-label="Réglages d’Aquaman">
        <div class="aqm-head">
          <div><h2 class="aqm-title">Réglages</h2><p class="aqm-sub">Script Aquaman · version ${VERSION}</p></div>
          <button type="button" class="aqm-close" aria-label="Fermer">✕</button>
        </div>
        <div class="aqm-body">
          <div class="aqm-settings-list"></div>
          <div class="aqm-news-foot">
            <button type="button" class="aqm-tour-btn" data-go="#aqm-nouveautes">Nouveautés</button>
            <button type="button" class="aqm-tour-btn is-main" data-go="#aqm-visite">Visite guidée</button>
          </div>
          <p class="aqm-note">Aquaman cherche une nouvelle version toutes les 10 minutes et te la propose en haut de l’écran ; ton gestionnaire de scripts (Tampermonkey, Violentmonkey, Userscripts) l’installe.</p>
        </div>
      </div>`;
    const list = back.querySelector('.aqm-settings-list');
    for (const [key, text] of OPTIONS) {
      const label = document.createElement('label');
      label.className = 'aqm-switch';
      label.innerHTML = '<input type="checkbox" /> <span></span>';
      label.querySelector('span').textContent = text;
      const box = label.querySelector('input');
      box.checked = !!current[key];
      box.addEventListener('change', async () => {
        const { settings: now } = await chrome.storage.local.get('settings');
        await chrome.storage.local.set({ settings: { ...now, [key]: box.checked } });
      });
      list.appendChild(label);
    }
    back.querySelector('.aqm-close').addEventListener('click', close);
    back.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
    back.addEventListener('click', (e) => e.target === back && close());
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
  }

  // "Réglages" entry at the end of the "Plus" menu each time it opens.
  new MutationObserver(() => {
    const menu = document.querySelector('.aqm-menu');
    if (!menu || menu.querySelector('.aqm-menu-settings')) return;
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.className = 'aqm-menu-item aqm-menu-settings';
    item.innerHTML = `<span class="aqm-menu-ico">${ICON_GEAR}</span><span><strong>Réglages</strong><small>Script Aquaman ${VERSION}</small></span>`;
    item.addEventListener('click', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); // closes the menu
      openSettings();
    });
    menu.appendChild(item);
  }).observe(document.body, { childList: true });
})();
