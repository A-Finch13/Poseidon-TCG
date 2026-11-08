// Aquaman : les nouvelles versions publiées sur GitHub.

import { REPO } from './common.js';
import { ApiError } from './api.js';

// ---------- nouvelles versions publiées sur GitHub ----------

// Vrai quand la version a est plus récente que la version b.
export const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
};

// Garde { version, url, zip, xpi, script } quand la dernière version GitHub est plus récente que celle-ci, sinon rien.
export async function checkUpdate() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new ApiError(res.status, `github_${res.status}`);
  const rel = await res.json();
  const version = String(rel.tag_name ?? '').replace(/^v/, '');
  if (version && newer(version, chrome.runtime.getManifest().version)) {
    const asset = (name) => rel.assets?.find((a) => a.name === name)?.browser_download_url ?? null;
    const update = {
      version,
      url: rel.html_url ?? `https://github.com/${REPO}/releases/latest`,
      zip: asset('aquaman-chromium.zip'),
      xpi: asset('aquaman-firefox.xpi'),
      // Le texte du script, pas le téléchargement de GitHub : Tampermonkey et Userscripts ne proposent d'installer
      // qu'un script affiché comme texte, le fichier de la version est enregistré comme fichier à la place.
      script: rel.tag_name ? `https://raw.githubusercontent.com/${REPO}/${rel.tag_name}/aquaman.user.js` : asset('aquaman.user.js')
    };
    await chrome.storage.local.set({ update });
    return update;
  }
  await chrome.storage.local.remove('update');
  return null;
}
