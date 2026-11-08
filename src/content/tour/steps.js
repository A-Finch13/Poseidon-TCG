// Aquaman, code de la page : texte de la visite guidée (affichée par tour/tour.js).

// Visite guidée, une étape par fonction :
//   page : chemin où aller ; target : sélecteurs CSS de l'élément à entourer (le premier visible) ;
//   find : élément trouvé par tour/tour.js (FINDERS) (« plus », « menu-0 », « menu-1 », « series », « vitrine ») ;
//   text : une chaîne, ou { hover, touch } pour un ordinateur avec souris et pour un téléphone.
// Une étape dont l'élément est introuvable s'affiche au milieu de l'écran.
const TOUR = [
  {
    id: 'bienvenue',
    title: 'Bienvenue dans Aquaman',
    text: 'Aquaman ajoute quelques outils au jeu. Cette visite d’une minute te montre où les trouver ; tu peux la quitter à tout moment.'
  },
  {
    id: 'plus',
    title: 'L’onglet Plus',
    text: 'Les pages d’Aquaman sont rangées ici, tout à droite de la barre du jeu.',
    find: 'plus'
  },
  {
    id: 'classement',
    title: 'Classement des amis',
    text: 'Sur la page Classement, « Amis » à côté de « Tous » : toi et tes amis, avec les points du jeu. Touche un nom pour ouvrir son profil.',
    find: 'board'
  },
  {
    id: 'boosters',
    title: 'Quel booster ouvrir ?',
    text: 'Choisis ce que tu cherches (des cartes nouvelles, une rareté, un personnage, une série ou la valeur) : les boosters sont classés par taux de drop ou par prix, avec « ≈ 11 boosters à ouvrir en moyenne », le prix moyen en Perles et le meilleur et le pire taux en haut.',
    find: 'menu-0'
  },
  {
    id: 'qui',
    title: 'Qui a cette carte ?',
    text: 'Cherche n’importe quel personnage et choisis sa carte : combien de joueurs l’ont, la liste des détenteurs pour les cartes à tirage limité, ceux qui la vendent au marché, ceux de tes amis qui l’ont, et ceux qui l’ont tirée récemment.',
    find: 'menu-1'
  },
  {
    id: 'favoris',
    title: 'Séries favorites',
    text: 'Ajoute des séries à tes favoris (ici, ou avec l’étoile ☆ sur les séries de la page Collection) : elles sont les mêmes sur tous tes appareils. Tu vois leurs personnages, ceux qui te manquent, et un bouton met d’un coup toutes les cartes manquantes dans ta liste de recherches du jeu.',
    find: 'menu-2'
  },
  {
    id: 'etoiles',
    title: 'L’étoile des séries',
    text: 'Sur la page Collection, l’étoile ☆ ajoute une série à tes favoris ; le bouton « ★ Favoris » au-dessus ouvre la liste de leurs personnages. Quand une série est ouverte, son cadre « Album de la série » a aussi « Ajouter aux favoris » et « Rechercher les manquantes ».',
    page: '/jeu/collection',
    target: '.aqm-fav-bar, .aqm-star'
  },
  {
    id: 'progression',
    title: 'Ta progression',
    text: 'À côté de « Ta collection », « Ma progression » montre le pourcentage du jeu que tu as, tes cartes par rareté, tes séries complètes, les cartes qui te manquent et les cartes gagnées chaque jour.',
    page: '/jeu/collection',
    target: '.aqm-stats-open'
  },
  {
    id: 'tirages',
    title: 'Les beaux tirages',
    text: 'Sur l’accueil, les cartes des beaux tirages des joueurs sont affichées en plus grand.',
    page: '/jeu',
    target: '.aqm-pulls'
  },
  {
    id: 'pity',
    title: 'La garantie anti-malchance',
    text: 'Sous le minuteur du booster offert : combien de boosters il te reste avant la SSR et l’UR garanties. Aquaman compte chaque booster que tu ouvres, et partage ce compte entre tes appareils (PC, téléphone, extension ou script) : partout le même chiffre. Tant qu’il n’a pas vu sortir de SSR ou d’UR, il affiche « au plus ».',
    page: '/jeu',
    target: '.aqm-pity'
  },
  {
    id: 'echanges',
    title: 'Les échanges',
    text: 'Dans chaque proposition, dans le jeu comme en MP, chaque carte porte une pastille verte si tu as déjà la carte (×2, ×3… si tu en as plusieurs) et rouge si tu ne l’as pas.',
    page: '/jeu/echanges',
    target: '.aqm-trade-tile, a[data-tour="nav-/jeu/echanges"]'
  },
  {
    id: 'series',
    title: 'Les séries de ta collection',
    text: {
      hover: 'Survole la bande des séries et tourne la molette de la souris, ou attrape-la avec un clic et fais-la glisser : elle défile de gauche à droite. Un simple clic ouvre toujours la série.',
      touch: 'La bande des séries défile du doigt. Sur ordinateur, la molette ou un clic glissé la font aussi défiler.'
    },
    page: '/jeu/collection',
    find: 'series'
  },
  {
    id: 'vitrine',
    title: 'Ma vitrine',
    text: {
      hover: 'Ouvre « Ma vitrine » et fais glisser une carte sur une autre case pour la déplacer. Pour retirer une carte, utilise la croix rouge en haut à droite de la carte.',
      touch: 'Ouvre « Ma vitrine », garde le doigt appuyé sur une carte, puis fais-la glisser sur une autre case pour la déplacer. Pour retirer une carte, touche la croix rouge en haut à droite de la carte.'
    },
    page: '/jeu/collection',
    find: 'vitrine'
  },
  {
    id: 'fin',
    title: 'C’est tout !',
    text: 'Tu peux relancer cette visite quand tu veux depuis Plus → Visite guidée. Bon jeu !'
  }
];
