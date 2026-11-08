// Aquaman, code de la page : la fenêtre « Nouveautés » (ses textes sont dans tour/changes.js), et la première visite.

// ---------- nouveautés ----------

const versionNewer = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

// Entrées de CHANGES plus récentes que since (toutes sans since).
function openNews(since) {
  const entries = CHANGES.filter((c) => !since || versionNewer(c.version, since));
  const body = openOverlay('Nouveautés', since ? `Ce qui a changé depuis la version ${since}.` : 'Ce qui a changé dans chaque version d’Aquaman.');
  for (const entry of entries.length ? entries : CHANGES.slice(0, 1)) {
    body.append(
      h('p', { class: 'aqm-label aqm-news-version' }, `Version ${entry.version}`),
      h(
        'ul',
        { class: 'aqm-news' },
        entry.items.map(([text, stepId]) => {
          const at = stepId ? TOUR.findIndex((s) => s.id === stepId) : -1;
          return h('li', {}, h('span', {}, text), at >= 0 ? h('button', { type: 'button', class: 'aqm-chip', onclick: () => startTour(at) }, 'Montre-moi') : null);
        })
      )
    );
  }
  body.append(h('div', { class: 'aqm-news-foot' }, h('button', { type: 'button', class: 'aqm-tour-btn is-main', onclick: () => startTour(0) }, 'Visite guidée'), h('button', { type: 'button', class: 'aqm-tour-btn', onclick: closeOverlay }, 'Fermer')));
}

// Une fois par version : la visite la première fois, puis les nouveautés après une mise à jour (réglage « notifyUpdated
// »).
async function showTutorialOnce() {
  if (location.hash.startsWith(TOUR_HASH) || location.hash === NEWS_HASH || session(TOUR_STEP) != null) return;
  const version = chrome.runtime.getManifest().version;
  const { seenVersion, settings } = await chrome.storage.local.get(['seenVersion', 'settings']);
  if (seenVersion === version) return;
  await chrome.storage.local.set({ seenVersion: version });
  if (!seenVersion) startTour(0);
  else if (settings?.notifyUpdated !== false && versionNewer(version, seenVersion)) openNews(seenVersion);
}

// Ouvre la visite ou les nouveautés depuis l'adresse (#aqm-visite, #aqm-nouveautes), utilisé par la fenêtre de
// l'extension et les notifications.
function onHash() {
  const step = location.hash.startsWith(`${TOUR_HASH}-`) ? TOUR.findIndex((s) => s.id === location.hash.slice(TOUR_HASH.length + 1)) : -1;
  if (step >= 0 && !tour) startTour(step);
  else if (location.hash === TOUR_HASH && !tour) startTour(0);
  else if (location.hash === NEWS_HASH && !overlay) {
    openNews();
    history.replaceState(null, '', location.pathname + location.search);
  }
}

// Reprend la visite après un chargement de page, ou lance ce que demande l'adresse, une fois l'onglet « Plus » en
// place.
let started = false;
function startOnce() {
  if (started || !firstVisible('.aqm-plus')) return;
  started = true;
  const resume = session(TOUR_STEP);
  if (resume != null) startTour(Math.min(TOUR.length - 1, Number(resume) || 0));
  else onHash();
  showTutorialOnce();
}
