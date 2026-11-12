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
    id: 'tirages',
    title: 'Les beaux tirages',
    text: 'Sur l’accueil, les cartes des beaux tirages des joueurs sont affichées en plus grand.',
    page: '/jeu',
    target: '.aqm-pulls'
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
