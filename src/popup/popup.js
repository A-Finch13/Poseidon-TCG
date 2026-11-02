import { ORIGIN, REPO, getSettings, setSettings } from '../lib/aquaman.js';

const $ = (s) => document.querySelector(s);
const FIREFOX = navigator.userAgent.includes('Firefox');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ZIP = `https://github.com/${REPO}/releases/latest/download/aquaman-chromium.zip`;

// ---------- links ----------

// Opens a page of the site (path) or any address, then closes the popup.
document.addEventListener('click', async (e) => {
  const link = e.target.closest('[data-open]');
  if (!link) return;
  e.preventDefault();
  const href = link.dataset.open;
  if (href.startsWith('http')) chrome.tabs.create({ url: href });
  else await chrome.runtime.sendMessage({ type: 'open', href });
  window.close();
});

// ---------- new version ----------

function renderUpdate(update) {
  $('#update').hidden = !update;
  if (!update) return;
  $('#update-version').textContent = update.version;
  $('#update-notes').dataset.open = update.url;
}

function updateHelp(html) {
  $('#update-help').hidden = false;
  $('#update-help').innerHTML = html;
}

// "Mettre à jour": the updater replaces the files, then the extension reloads (the popup closes).
$('#update-go').addEventListener('click', async () => {
  const btn = $('#update-go');
  btn.disabled = true;
  btn.textContent = 'Mise à jour…';
  const res = await chrome.runtime.sendMessage({ type: 'install-update' }).catch(() => null);
  if (res?.update) renderUpdate(res.update);
  if (res?.ok) {
    btn.textContent = 'Installée ✔';
    updateHelp(`Version ${esc(res.version)} installée ✔. L’extension redémarre et les onglets du site se rechargent tout seuls.`);
    return;
  }
  btn.disabled = false;
  btn.textContent = 'Réessayer';
  const download = `<a href="#" data-open="${esc(FIREFOX ? `https://github.com/${REPO}#installer` : ZIP)}">télécharger la mise à jour</a>`;
  if (res?.error === 'no_updater' || res?.error === 'unknown_extension') {
    updateHelp(
      FIREFOX
        ? `Sur Firefox, utilise plutôt la version script : elle se met à jour toute seule. Voir l’<a href="#" data-open="https://github.com/${REPO}#installer">installation</a>.`
        : `Pour que ce bouton installe tout seul, il faut le préparer <b>une seule fois</b> : ouvre le dossier de l’extension, double-clique sur <b>installer-mises-a-jour.bat</b>, puis clique ici sur « Réessayer ».<br>Ou bien ${download}, décompresse-la, copie son contenu dans le dossier de l’extension en remplaçant les anciens fichiers, puis clique sur ⟳ sous Aquaman dans <code>chrome://extensions</code>.`
    );
  } else {
    const detail = res?.detail ? ` (${esc(String(res.detail).slice(0, 200))})` : '';
    updateHelp(`La mise à jour n’a pas marché (${esc(res?.error ?? 'pas de réponse')}${detail}). Clique sur « Réessayer ». Sinon, ${download}, décompresse-la, copie son contenu dans le dossier de l’extension en remplaçant les anciens fichiers, puis clique sur ⟳ sous Aquaman dans <code>chrome://extensions</code>.`);
  }
});

// ---------- settings ----------

async function bindSettings() {
  const settings = await getSettings();
  for (const box of document.querySelectorAll('[data-setting]')) {
    box.checked = !!settings[box.dataset.setting];
    box.addEventListener('change', () => setSettings({ [box.dataset.setting]: box.checked }));
  }
}

// ---------- status ----------

// Boosters waiting, as shown on the icon.
async function renderStatus() {
  const text = await chrome.action.getBadgeText({});
  $('#status').textContent =
    text === '!' ? `Connecte-toi sur ${ORIGIN.replace('https://', '')} pour voir tes boosters.` : text ? `${text} booster${text === '1' ? '' : 's'} à ouvrir sur l’accueil du jeu.` : 'Aucun booster à ouvrir pour le moment.';
}

(async () => {
  $('#version').textContent = chrome.runtime.getManifest().version;
  bindSettings();
  renderStatus();
  renderUpdate((await chrome.storage.local.get('update')).update);
  chrome.runtime
    .sendMessage({ type: 'check-update' })
    .then(async () => renderUpdate((await chrome.storage.local.get('update')).update))
    .catch(() => {});
})();
