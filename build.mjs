// Construit les paquets d'Aquaman dans dist/, avec esbuild.
//
//   npm run build    tout construire une fois
//   npm run watch    reconstruire dist/ à chaque fichier enregistré (puis recharger l'extension dans le navigateur)
//
// dist/chromium/              dossier à charger dans Brave / Chrome / Edge / Opera / Vivaldi (« Charger l'extension non empaquetée »)
// dist/firefox/               dossier à charger dans about:debugging
// dist/aquaman-chromium.zip   paquet pour Brave / Chrome / Edge / Opera / Vivaldi
// dist/aquaman-firefox.xpi    paquet pour Firefox
// dist/aquaman.user.js        script pour Tampermonkey / Violentmonkey / Userscripts (téléphones, iPhone)
// aquaman.user.js             le même script, gardé dans le dépôt (jamais modifié à la main ; pas en mode watch)
//
// Dans les paquets, les scripts de la page (src/content/, dans l'ordre de manifest.json) ne font plus qu'un fichier,
// contenu.js, et leurs styles un seul contenu.css ; background.js et popup.js embarquent leurs modules de src/lib/.
// Le dossier du dépôt reste chargeable tel quel dans le navigateur, sans construction.
import * as esbuild from 'esbuild';
import { zipSync } from 'fflate';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const REPO = 'A-Finch13/Poseidon-TCG';
const WATCH = process.argv.includes('--watch');

// Ce que les paquets reprennent tel quel (en plus de ce qu'esbuild construit).
const COPIED = ['icons', 'README.md', 'LICENSE', 'src/popup/popup.html', 'src/popup/popup.css', 'src/content/inject.js'];
// L'assistant de mise à jour Windows ne sert que Brave / Chrome / Edge / Opera / Vivaldi : pas dans le paquet Firefox.
const CHROMIUM_ONLY = ['updater', 'installer-mises-a-jour.bat'];
// Source des icônes, inutile aux navigateurs.
const SKIP = new Set(['trident.png']);

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const COMMON = { charset: 'utf8', target: 'es2022', legalComments: 'none', logLevel: 'silent', write: false };

// Fichiers sous un chemin du dépôt (un fichier ou un dossier), en chemins relatifs avec des « / ».
function listFiles(rel) {
  const full = path.join(ROOT, rel);
  if (fs.statSync(full).isFile()) return [rel];
  return fs
    .readdirSync(full, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && !SKIP.has(d.name))
    .map((d) => path.relative(ROOT, path.join(d.parentPath ?? d.path, d.name)).split(path.sep).join('/'))
    .sort();
}

// Les scripts de la page et leurs styles, dans l'ordre de manifest.json (le script de contenu qui n'est pas inject.js).
function pageFiles(manifest) {
  const page = manifest.content_scripts.find((c) => c.world !== 'MAIN');
  return { js: page.js, css: page.css ?? [] };
}

// Les scripts de la page bout à bout, dans une fonction à eux : leurs noms restent à part de ceux du reste.
const pageCode = (files) => `(() => {\n${files.map((f) => `// ----- ${f} -----\n${read(f)}`).join('\n')}\n})();\n`;

async function bundleCss(files) {
  const contents = files.map((f) => `@import "./${f}";`).join('\n');
  const r = await esbuild.build({ ...COMMON, stdin: { contents, resolveDir: ROOT, sourcefile: 'contenu.css', loader: 'css' }, bundle: true });
  return r.outputFiles[0].text;
}

async function bundleModule(entry) {
  const r = await esbuild.build({ ...COMMON, entryPoints: [path.join(ROOT, entry)], bundle: true, format: 'esm' });
  return r.outputFiles[0].text;
}

// Le script : shim.js remplace les fonctions propres aux extensions (esbuild branche sur lui chaque « chrome » et
// « OWNER » du code), bridge.js fait dans la page le travail du service de fond, puis inject.js et le code de la page.
async function userscript(version, page, css) {
  const latest = `https://github.com/${REPO}/releases/latest/download/aquaman.user.js`;
  const entry = `${read('src/content/inject.js')}
const start = () => {
  const style = document.createElement('style');
  style.id = 'aquaman-style';
  style.textContent = ${JSON.stringify(css)};
  document.head.appendChild(style);
${page}
  // (l'extension tourne sur cette page : le style du script s'en va)
  if (document.documentElement.dataset.aqmOwner !== OWNER) style.remove();
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
`;
  const r = await esbuild.build({
    ...COMMON,
    stdin: { contents: entry, resolveDir: ROOT, sourcefile: 'aquaman.user.js', loader: 'js' },
    bundle: true,
    format: 'iife',
    inject: [path.join(ROOT, 'src/userscript/shim.js')],
    define: { VERSION: JSON.stringify(version) }
  });
  const header = `// ==UserScript==
// @name         Aquaman
// @namespace    https://github.com/${REPO}
// @version      ${version}
// @description  Compagnon non officiel pour le jeu de cartes de poseidon-scans.net : classement entre amis, boosters rentables, cartes possédées dans les échanges, vitrine en glisser-déposer.
// @author       A-Finch13
// @license      MIT
// @match        https://poseidon-scans.net/*
// @icon         https://raw.githubusercontent.com/${REPO}/main/icons/icon128.png
// @homepageURL  https://github.com/${REPO}
// @supportURL   https://github.com/${REPO}/issues
// @updateURL    ${latest}
// @downloadURL  ${latest}
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
 * Fichier généré par build.mjs (esbuild) à partir du code de l'extension (https://github.com/${REPO}) : ne pas le
 * modifier à la main.
 *
 * Parties du script, dans l'ordre :
 *  1. src/lib/          — accès à l'API du jeu, collections, calcul des boosters (un module par sujet) ;
 *  2. src/userscript/ — stockage et messages à la place des fonctions d'extension, et le travail du service
 *                            de fond de l'extension, fait dans la page ;
 *  3. inject.js            — lit les réponses que le site reçoit déjà (boosters à ouvrir, collection modifiée) ;
 *  4. le code de la page (src/content/, dans l'ordre de manifest.json) — étapes de la visite et nouveautés,
 *     puis tout ce qui s'affiche sur le site (réglages compris, dans le menu « Plus », les mêmes que l'extension).
 */
`;
  return `${header}(() => {
'use strict';
if (window.__aquamanUserscript) return;
window.__aquamanUserscript = true;
${r.outputFiles[0].text}})();
`;
}

// Les fichiers d'un paquet : chemin dans le paquet -> contenu.
function packageFiles(manifestText, built, firefox) {
  const manifest = JSON.parse(manifestText);
  const page = manifest.content_scripts.find((c) => c.world !== 'MAIN');
  page.js = ['src/content/contenu.js'];
  page.css = ['src/content/contenu.css'];
  const out = new Map([['manifest.json', JSON.stringify(manifest, null, 2) + '\n']]);
  for (const rel of [...COPIED, ...(firefox ? [] : CHROMIUM_ONLY)]) for (const f of listFiles(rel)) out.set(f, fs.readFileSync(path.join(ROOT, f)));
  for (const [f, text] of Object.entries(built)) out.set(f, text);
  return out;
}

function writeFolder(dir, files) {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [f, data] of files) {
    const dest = path.join(dir, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
  }
}

// (les entrées d'une archive ont toujours des « / » : Firefox refuse celles faites avec les séparateurs de Windows)
function writeZip(file, files) {
  const entries = {};
  for (const [f, data] of files) entries[f] = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  fs.writeFileSync(file, zipSync(entries, { level: 9 }));
}

async function build({ release }) {
  const began = performance.now();
  const chromium = read('manifest.json');
  const firefox = read('manifest.firefox.json');
  const version = JSON.parse(chromium).version;
  if (JSON.parse(firefox).version !== version) throw new Error('manifest.json et manifest.firefox.json n’ont pas la même version');
  if (!read('src/content/tour/changes.js').includes(`version: '${version}'`))
    throw new Error(`Ajoute les nouveautés de la version ${version} en tête de CHANGES (src/content/tour/changes.js)`);

  const { js, css } = pageFiles(JSON.parse(chromium));
  const page = pageCode(js);
  const [pageJs, pageCss, background, popup] = await Promise.all([
    esbuild.transform(page, { charset: 'utf8', target: 'es2022', legalComments: 'none', loader: 'js', sourcefile: 'contenu.js' }).then((r) => r.code),
    bundleCss(css),
    bundleModule('src/background.js'),
    bundleModule('src/popup/popup.js')
  ]);
  const script = await userscript(version, page, pageCss);
  const built = { 'src/content/contenu.js': pageJs, 'src/content/contenu.css': pageCss, 'src/background.js': background, 'src/popup/popup.js': popup };

  fs.mkdirSync(DIST, { recursive: true });
  const chromiumFiles = packageFiles(chromium, built, false);
  const firefoxFiles = packageFiles(firefox, built, true);
  writeFolder(path.join(DIST, 'chromium'), chromiumFiles);
  writeFolder(path.join(DIST, 'firefox'), firefoxFiles);
  fs.writeFileSync(path.join(DIST, 'aquaman.user.js'), script);
  if (release) {
    writeZip(path.join(DIST, 'aquaman-chromium.zip'), chromiumFiles);
    writeZip(path.join(DIST, 'aquaman-firefox.xpi'), firefoxFiles);
    fs.writeFileSync(path.join(ROOT, 'aquaman.user.js'), script); // gardé dans le dépôt
  }
  console.log(`Aquaman ${version} -> ${DIST} (${Math.round(performance.now() - began)} ms)`);
}

// Message d'une erreur d'esbuild ou du build : le fichier et la ligne en cause quand esbuild les donne.
const explain = (e) =>
  e.errors?.length ? e.errors.map((x) => `${x.location ? `${x.location.file}:${x.location.line}:${x.location.column} ` : ''}${x.text}`).join('\n') : e.message;

if (!WATCH) {
  try {
    await build({ release: true });
  } catch (e) {
    console.error(explain(e));
    process.exit(1);
  }
} else {
  let timer = 0;
  let running = Promise.resolve();
  const again = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      running = running.then(() => build({ release: false }).catch((e) => console.error(`Échec : ${explain(e)}`)));
    }, 150);
  };
  await build({ release: false }).catch((e) => console.error(`Échec : ${explain(e)}`));
  fs.watch(path.join(ROOT, 'src'), { recursive: true }, again);
  for (const f of ['manifest.json', 'manifest.firefox.json']) fs.watch(path.join(ROOT, f), again);
  console.log('En attente de modifications… (Ctrl+C pour arrêter)');
}
