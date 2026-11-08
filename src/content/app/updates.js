// Aquaman, code de la page : fil, bonjour au relais, accès retiré, nouvelles versions, réglages changés ailleurs.

// Le script n'a pas de service de fond : tant qu'une page du jeu est ouverte, les « beaux tirages » sont lus toutes les
// minutes.
let feedAt = 0;
function pollFeedNow() {
  if (Date.now() - feedAt < 60e3) return;
  feedAt = Date.now();
  send({ type: 'feed-poll' });
}

// Tant qu'une page du jeu est ouverte, Aquaman dit au relais toutes les 10 minutes qu'il est utilisé (la liste de
// l'auteur des joueurs avec Aquaman) ; le passage d'une page qui ne change rien attend le minuteur plus bas.
const HELLO_EVERY = 10 * 60e3;
let helloAt = 0;
function sayHello() {
  if (Date.now() - helloAt < HELLO_EVERY) return;
  helloAt = Date.now();
  send({ type: 'hello', kind: owner }).then((res) => res?.revoked && !stopped && revoke());
}

// L'auteur a retiré Aquaman à ce joueur : tout ce qu'il a ajouté s'en va, et un mot dit pourquoi (une fois par visite).
function revoke() {
  shutdown();
  if (session('aqm-revoked-told')) return;
  session('aqm-revoked-told', '1');
  const box = h(
    'div',
    { class: 'aqm-root aqm-update', role: 'status' },
    h('div', { class: 'aqm-queue-head' }, h('strong', {}, '🔱 Aquaman est désactivé')),
    h('p', {}, 'L’auteur d’Aquaman a désactivé son utilisation pour ton compte.'),
    h('div', { class: 'aqm-update-actions' }, h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => box.remove() }, 'OK'))
  );
  document.body.append(box);
}
let helloTimer = 0;
onStart(() => {
  helloTimer = setInterval(() => {
    if (stopped || !settled || document.visibilityState !== 'visible') return;
    sayHello();
    checkAccess();
  }, 60e3);
});

// Si l'auteur a retiré Aquaman à ce joueur : demandé une fois par minute tant qu'une page du jeu est affichée.
let accessAt = 0;
function checkAccess() {
  if (Date.now() - accessAt < 55e3) return;
  accessAt = Date.now();
  send({ type: 'access' }).then((res) => res?.revoked && !stopped && revoke());
}

// Le script cherche aussi une nouvelle version toutes les 10 minutes (les gestionnaires de scripts ne cherchent qu'une
// fois par jour), et la propose dans un cadre en bas de l'écran ; l'extension le dit avec sa notification et sa
// fenêtre.
const UPDATE_EVERY = 10 * 60e3;
const SCRIPT_URL = 'https://raw.githubusercontent.com/A-Finch13/Poseidon-TCG/main/aquaman.user.js';
let updateAt = 0;
function lookForUpdate() {
  if (owner !== 'userscript' || Date.now() - updateAt < UPDATE_EVERY) return;
  updateAt = Date.now();
  send({ type: 'check-update' }).then((res) => !stopped && showUpdate(res?.update));
}

// iPhone et iPad (Safari avec l'app Userscripts) : « Installer » montre les étapes de la mise à jour propre à
// Userscripts (le script a une adresse de mise à jour), rien n'est téléchargé.
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const INSTALL_PAGE = 'https://a-finch13.github.io/Poseidon-TCG/';

function showUpdate(update) {
  const version = chrome.runtime.getManifest().version;
  if (!update?.version || !versionNewer(update.version, version) || session('aqm-update-later') === update.version) return;
  if (document.querySelector('.aqm-update')) return;
  const url = update.script || SCRIPT_URL;
  const later = h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => (session('aqm-update-later', update.version), box.remove()) }, 'Plus tard');
  const iosSteps = () =>
    box.replaceChildren(
      h('div', { class: 'aqm-queue-head' }, h('strong', {}, `🔱 Installer Aquaman ${update.version}`)),
      h(
        'ol',
        { class: 'aqm-update-steps' },
        h('li', {}, 'Touche ', h('b', {}, 'ᴀA'), ' (ou ', h('b', {}, '🧩'), ') à gauche de la barre d’adresse, puis ', h('b', {}, 'Userscripts'), '.'),
        h('li', {}, 'Dans le panneau de Userscripts, touche le bouton de ', h('b', {}, 'recherche de mises à jour'), ' (↻), puis mets à jour ', h('b', {}, 'Aquaman'), '.'),
        h('li', {}, 'Touche ', h('b', {}, 'Recharger'), ' ci-dessous : les nouveautés de la version s’affichent.')
      ),
      h('p', { class: 'aqm-muted' }, 'Userscripts ne trouve rien ? Suis les étapes « Mettre à jour sur iPhone et iPad » de la ', h('a', { href: INSTALL_PAGE, target: '_blank', rel: 'noopener' }, 'page d’installation'), '.'),
      h('div', { class: 'aqm-update-actions' }, h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => box.remove() }, 'Fermer'), h('button', { type: 'button', class: 'aqm-queue-btn is-main', onclick: () => location.reload() }, 'Recharger'))
    );
  const box = h(
    'div',
    { class: 'aqm-root aqm-update', role: 'status' },
    h('div', { class: 'aqm-queue-head' }, h('strong', {}, `🔱 Aquaman ${update.version} est disponible`)),
    h(
      'p',
      {},
      IOS
        ? `Tu as la version ${version}. Touche « Installer » : les étapes pour mettre Aquaman à jour avec Userscripts s’affichent ici.`
        : `Tu as la version ${version}. Touche « Installer », puis « Mettre à jour » dans Tampermonkey. Recharge ensuite cette page.`
    ),
    h(
      'div',
      { class: 'aqm-update-actions' },
      later,
      IOS
        ? h('button', { type: 'button', class: 'aqm-queue-btn is-main', onclick: iosSteps }, 'Installer')
        : h('a', { class: 'aqm-queue-btn is-main', href: url, target: '_blank', rel: 'noopener', onclick: () => box.remove() }, 'Installer')
    )
  );
  document.body.append(box);
}

// Une page qui change tout le temps (un échange, sa liste de cartes) ferait tourner Aquaman sans arrêt : plus son
// dernier passage a pris de temps, plus il attend (8 fois plus, de 0,15 à 1,5 s), pour que le jeu garde l'essentiel du
// temps. Le passage attend un moment où le navigateur n'a rien à dessiner (1 s de plus au plus), et que l'onglet soit
// de nouveau affiché quand il est caché.
// Réglages changés ailleurs : un cadre propose de recharger la page pour les appliquer.
function offerReload() {
  if (document.querySelector('.aqm-reload')) return;
  const box = h(
    'div',
    { class: 'aqm-root aqm-update aqm-reload', role: 'status' },
    h('div', { class: 'aqm-queue-head' }, h('strong', {}, '🔱 Réglages d’Aquaman modifiés')),
    h('p', {}, 'Recharge la page pour les appliquer.'),
    h(
      'div',
      { class: 'aqm-update-actions' },
      h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => box.remove() }, 'Plus tard'),
      h('button', { type: 'button', class: 'aqm-queue-btn is-main', onclick: () => location.reload() }, 'Recharger')
    )
  );
  document.body.append(box);
}
