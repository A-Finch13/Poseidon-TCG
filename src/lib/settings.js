// Aquaman : les réglages des fonctions, les mêmes dans la fenêtre de l'extension et dans « Plus › Réglages ».

// ---------- réglages ----------

// Tous les réglages, par groupe : la même liste dans la fenêtre de l'extension et dans « Plus › Réglages » (extension
// et script, sur ordinateur ou téléphone). Tous sont actifs au départ. Chaque élément : [clé, titre, aide, only] (only
// :
// « extension » pour ce que le script ne peut pas faire).
export const SETTINGS = [
  {
    title: 'Accueil',
    icon: '🏠',
    items: [
      ['boosterWheel', 'Boosters par catégorie', 'Classique, Magie, Action… côte à côte, avec le compte de chacun'],
      ['openMore', 'Ouvrir les 10 suivants', 'Après un « Tout ouvrir », un bouton ouvre les boosters suivants du même pack, 10 par 10'],
      ['recycleSpares', 'Recycler les doublons du tirage', 'Dans la fenêtre des cartes, un bouton recycle en Perles les doublons des cartes tirées (le plus petit numéro est gardé)'],
      ['autoRecycle', 'Recyclage automatique', 'Désactivé au départ. Après chaque ouverture, les doublons N, R et SR des cartes tirées sont recyclés tout seuls, sans clic (le plus petit numéro est gardé ; SSR, UR et SEC restent au bouton)'],
      ['openMoreAuto', 'Fermeture automatique', 'Après un « Tout ouvrir », la fenêtre des cartes se ferme 5 s après la dernière (sur les 10 suivantes s’il en reste)'],
      ['packGlow', 'Lueur du pack', 'La lueur derrière le booster prend la couleur de son pack'],
      ['pity', 'Garantie anti-malchance', 'Les boosters avant ta prochaine SSR et UR, et l’historique de tes tirages'],
      ['bigPulls', 'Beaux tirages agrandis', 'Les dernières cartes rares tirées par les joueurs, en plus grand']
    ]
  },
  {
    title: 'Collection',
    icon: '🗂️',
    items: [
      ['seriesTools', 'Bande des séries', 'Étoiles des séries favorites, tri « Les plus avancées » et boutons « Masquer séries <= 5 persos », « Masquer séries avec badge » et « Masquer cartes verrouillées »'],
      ['albumButtons', 'Boutons de l’album', '« Ajouter aux favoris », « Rechercher les manquantes » et « Verrouiller les uniques »'],
      ['missingTab', 'Onglet « Manquantes »', 'Seulement les cartes qu’il te manque'],
      ['missingSales', 'Pastille « En vente »', 'Sur les cartes manquantes vendues au marché'],
      ['collectionStats', 'Ma progression', 'Bouton à côté de « Ta collection » : pourcentage, raretés, séries complètes et cartes gagnées chaque jour'],
      ['friendsBoard', 'Classement des amis', 'Sur la page Classement, « Amis » à côté de « Tous » : toi et tes amis, avec les points du jeu'],
      ['cardWho', 'Bouton « Qui a cette carte ? »', 'Sur la page des cartes SSR, UR et SEC : les joueurs qui l’ont']
    ]
  },
  {
    title: 'Marché',
    icon: '🛒',
    items: [
      ['hideBought', 'Masquer ce que je viens d’acheter', 'Les autres annonces d’une carte achetée disparaissent'],
      ['marketFavorites', 'Filtre « ★ Favoris »', 'Les ventes de tes séries favorites seulement'],
      ['cardListings', 'Annonces sur la page d’une carte', 'Les 5 annonces les moins chères, avec « Acheter », et les enchères en cours'],
      ['sellTools', 'Vente des doublons', 'File d’attente de « Vendre mes doublons » et bouton « Retirer mes ventes »']
    ]
  },
  {
    title: 'Échanges et vitrine',
    icon: '🔁',
    items: [
      ['tradeMarks', 'Échanges', 'Pastille « déjà possédée » sur les cartes des échanges, dans le jeu et en MP'],
      ['tradeFilters', 'Filtres des échanges', 'Proposer un échange : « Mes recherches », « Il me manque » et « Il lui manque » à côté de « Doublons »'],
      ['showcaseDrag', 'Ma vitrine', 'Glisser-déposer pour ranger tes cartes'],
      ['recycleHelp', 'Recycler des cartes', 'Rien de coché au départ, bouton « Tout cocher »']
    ]
  },
  {
    title: 'Notifications',
    icon: '🔔',
    items: [
      ['notifyBoosters', 'Nouveaux boosters', 'Une notification quand des boosters t’attendent', 'extension'],
      ['notifyUpdated', 'Nouveautés', 'Ce qui a changé, après une mise à jour d’Aquaman']
    ]
  },
  {
    title: 'Partage entre mes appareils',
    icon: '☁️',
    items: [
      ['syncPity', 'Garantie anti-malchance', 'Le compte des boosters ouverts et l’historique'],
      ['syncFavorites', 'Séries favorites', 'Les mêmes séries sur PC et téléphone'],
      ['syncWants', 'Cartes recherchées', 'La file d’attente des recherches'],
      ['syncMarket', 'Marché', 'Cartes achetées masquées et doublons en attente de vente'],
      ['syncProgress', 'Ma progression', 'Les cartes gagnées chaque jour et le compte par rareté'],
      ['sharePulls', 'Beaux tirages', 'Envoyer ceux que je vois à la base commune (« Qui a cette carte ? »)']
    ]
  }
];

// Chaque fonction est active au départ, sauf celles qui changent toutes seules les cartes du joueur.
const OFF_AT_FIRST = new Set(['autoRecycle']);
export const DEFAULTS = Object.fromEntries(SETTINGS.flatMap((g) => g.items.map(([key]) => [key, !OFF_AT_FIRST.has(key)])));

// Les réglages avec leurs valeurs par défaut.
export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...settings };
}

// Enregistre des réglages.
export async function setSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings });
  return settings;
}
