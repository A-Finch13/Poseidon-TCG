// Aquaman, code de la page : état partagé par plusieurs fonctions, et les réglages que le joueur a désactivés.

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const playersSeen = new Map(); // nom simplifié -> id des joueurs dont le jeu a lu les cartes (inject.js)
const foldName = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
let batch = null; // { kind, before, opened } : le dernier « Tout ouvrir », les boosters de sa sorte à ce moment, combien il en a ouvert (markOpenMore)

let settled = false; // la page a été prise en main par React : Aquaman peut la modifier (voir whenSettled)

// Les fonctions que le joueur a désactivées (« Plus › Réglages » ou la fenêtre de l'extension), lues au démarrage ; un
// changement s'applique une fois la page rechargée.
let feat = {};
let featLoaded = false;
const on = (key) => feat[key] !== false;
const featReady = chrome.storage.local
  .get('settings')
  .then(({ settings }) => (feat = settings ?? {}))
  .catch(() => {})
  .finally(() => (featLoaded = true));
