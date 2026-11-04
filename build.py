"""Builds the browser packages into dist/.

    python build.py

dist/firefox/                 folder to load in about:debugging
dist/aquaman-firefox.xpi      package for Firefox
dist/aquaman-chromium.zip     package for Brave / Chrome / Edge / Opera / Vivaldi
dist/aquaman.user.js          userscript for Tampermonkey / Violentmonkey / Userscripts (phones, iPhone)
aquaman.user.js               the same userscript, kept in the repository (never edit it by hand)
"""
import json
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / 'dist'
REPO = 'A-Finch13/Poseidon-TCG'
SHARED = ['src', 'icons', 'updater', 'installer-mises-a-jour.bat', 'README.md', 'LICENSE']

# The Windows updater only serves Brave / Chrome / Edge / Opera / Vivaldi: not in the Firefox package.
CHROMIUM_ONLY = {'updater', 'installer-mises-a-jour.bat'}
# Source of the icons, not used by the browsers.
SKIP = {'trident.png'}


def files(firefox=False):
    for name in SHARED:
        if firefox and name in CHROMIUM_ONLY:
            continue
        p = ROOT / name
        if p.is_file():
            yield p
        else:
            yield from (f for f in sorted(p.rglob('*')) if f.is_file() and 'userscript' not in f.parts and f.name not in SKIP)


def package(out, manifest, firefox=False):
    # Entries always use forward slashes: Firefox rejects archives made with Windows separators.
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('manifest.json', manifest)
        for f in files(firefox):
            z.write(f, f.relative_to(ROOT).as_posix())


def userscript(version):
    """The same page code as the extension, with a stand-in for the extension APIs (src/userscript/)."""
    src = ROOT / 'src'
    read = lambda p: (src / p).read_text(encoding='utf-8').replace('\r\n', '\n')
    lib = read('lib/aquaman.js')
    lib = re.sub(r'^export (const|let|async function|function|class) ', r'\1 ', lib, flags=re.M)
    if re.search(r'^\s*export\b', lib, flags=re.M):
        raise SystemExit('src/lib/aquaman.js : un export n’est pas pris en charge par le script')
    css = read('content/content.css').replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
    latest = f'https://github.com/{REPO}/releases/latest/download/aquaman.user.js'
    header = f"""// ==UserScript==
// @name         Aquaman
// @namespace    https://github.com/{REPO}
// @version      {version}
// @description  Compagnon non officiel pour le jeu de cartes de poseidon-scans.net : classement entre amis, boosters rentables, cartes possédées dans les échanges, vitrine en glisser-déposer.
// @author       A-Finch13
// @license      MIT
// @match        https://poseidon-scans.net/*
// @icon         https://raw.githubusercontent.com/{REPO}/main/icons/icon128.png
// @homepageURL  https://github.com/{REPO}
// @supportURL   https://github.com/{REPO}/issues
// @updateURL    {latest}
// @downloadURL  {latest}
// @run-at       document-start
// @inject-into  page
// @grant        none
// @noframes
// ==/UserScript==

/*
 * Aquaman — version script
 *
 * Ce script ajoute au jeu de cartes de poseidon-scans.net les mêmes fonctions que l'extension Aquaman :
 *  - onglet « Plus » à droite de Marché : classement des amis (cartes uniques, séries complètes)
 *    et boosters rentables (prix, taux de drop, persos et séries recherchés) ;
 *  - Échanges : cartes agrandies, pastille verte (carte possédée) ou rouge (manquante) ;
 *  - Collection : la molette fait défiler la bande des séries ;
 *  - Ma vitrine : glisser-déposer des cartes, à la souris ou au doigt ;
 *  - Accueil : cartes des « Beaux tirages » agrandies ;
 *  - visite guidée, nouveautés après chaque mise à jour, et réglages dans le menu « Plus ».
 *
 * Il ne communique qu'avec https://poseidon-scans.net : ta session reste dans ton navigateur et n'est envoyée nulle part ailleurs.
 * Si l'extension Aquaman est aussi installée, le script se met en retrait.
 *
 * Fichier généré par build.py à partir du code de l'extension (https://github.com/{REPO}) : ne pas le modifier à la main.
 *
 * Parties du script, dans l'ordre :
 *  1. shim.js     — remplace les fonctions propres aux extensions (stockage, messages) ;
 *  2. aquaman.js  — accès à l'API du jeu, collections, calcul des boosters ;
 *  3. bridge.js   — fait dans la page le travail du service de fond de l'extension ;
 *  4. inject.js   — lit les réponses que le site reçoit déjà (boosters à ouvrir, collection modifiée) ;
 *  5. tutorial.js et content.js — étapes de la visite et nouveautés, puis tout ce qui s'affiche sur le site
 *     (réglages compris, dans le menu « Plus », les mêmes que l'extension).
 */
"""
    body = f"""(() => {{
'use strict';
if (window.__aquamanUserscript) return;
window.__aquamanUserscript = true;
const VERSION = '{version}';

// ---------- 1. src/userscript/shim.js : stockage et messages, à la place des fonctions d'extension ----------
{read('userscript/shim.js')}
// ---------- 2. src/lib/aquaman.js : API du jeu, collections et boosters ----------
{lib}
// ---------- 3. src/userscript/bridge.js : le travail du service de fond, dans la page ----------
{read('userscript/bridge.js')}
// ---------- 4. src/content/inject.js : lit les réponses que le site reçoit déjà ----------
{read('content/inject.js')}
const start = () => {{
  const style = document.createElement('style');
  style.id = 'aquaman-style';
  style.textContent = `{css}`;
  document.head.appendChild(style);
  // ---------- 5. src/content/tutorial.js et content.js : visite, nouveautés, puis tout ce qui s'affiche sur le site ----------
{read('content/tutorial.js')}
{read('content/content.js')}
  // (the extension runs on this page: the script's style goes)
  if (document.documentElement.dataset.aqmOwner !== OWNER) style.remove();
}};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {{ once: true }});
else start();
}})();
"""
    return header + body


def main():
    firefox = (ROOT / 'manifest.firefox.json').read_text(encoding='utf-8')
    chromium = (ROOT / 'manifest.json').read_text(encoding='utf-8')
    version = json.loads(chromium)['version']
    if json.loads(firefox)['version'] != version:
        raise SystemExit('manifest.json et manifest.firefox.json n’ont pas la même version')
    changes = (ROOT / 'src' / 'content' / 'tutorial.js').read_text(encoding='utf-8')
    if f"version: '{version}'" not in changes:
        raise SystemExit(f'Ajoute les nouveautés de la version {version} en tête de CHANGES (src/content/tutorial.js)')

    shutil.rmtree(DIST, ignore_errors=True)
    DIST.mkdir()

    folder = DIST / 'firefox'
    for f in files(firefox=True):
        dest = folder / f.relative_to(ROOT)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, dest)
    (folder / 'manifest.json').write_text(firefox, encoding='utf-8')

    package(DIST / 'aquaman-firefox.xpi', firefox, firefox=True)
    package(DIST / 'aquaman-chromium.zip', chromium)
    script = userscript(version)
    (DIST / 'aquaman.user.js').write_text(script, encoding='utf-8', newline='\n')
    (ROOT / 'aquaman.user.js').write_text(script, encoding='utf-8', newline='\n')  # kept in the repository
    print(f'Aquaman {version} -> {DIST}')


if __name__ == '__main__':
    main()
