// Text of the guided tour and of the "Nouveautés" window, shown by content.js.
// Each new version adds its entry at the top of CHANGES (build.py refuses a version without one).

// Guided tour, one step per feature:
//   page: path to go to; target: CSS selectors of the element to circle (the first visible one);
//   find: element found by content.js ("plus", "menu-0", "menu-1", "series", "vitrine");
//   text: a string, or { hover, touch } for a computer with a mouse and for a phone.
// A step whose element can't be found is shown in the middle of the screen.
const TOUR = [
  {
    id: 'bienvenue',
    title: 'Bienvenue dans Aquaman',
    text: 'Aquaman ajoute quelques outils au jeu. Cette visite d’une minute te montre où les trouver ; tu peux la quitter à tout moment.'
  },
  {
    id: 'plus',
    title: 'L’onglet Plus',
    text: 'Les pages d’Aquaman sont rangées ici, à droite de Marché.',
    find: 'plus'
  },
  {
    id: 'classement',
    title: 'Classement des amis',
    text: 'Compare-toi à tes amis : nombre de cartes uniques et de séries complètes. Touche un nom pour ouvrir son profil.',
    find: 'menu-0'
  },
  {
    id: 'boosters',
    title: 'Quel booster ouvrir ?',
    text: 'Choisis ce que tu cherches (des cartes nouvelles, une rareté, un personnage, une série ou la valeur) : les boosters sont classés par taux de drop ou par prix, avec « ≈ 11 boosters à ouvrir en moyenne », le prix moyen en Perles et le meilleur et le pire taux en haut.',
    find: 'menu-1'
  },
  {
    id: 'qui',
    title: 'Qui a cette carte ?',
    text: 'Cherche n’importe quel personnage et choisis sa carte : combien de joueurs l’ont, la liste des détenteurs pour les cartes à tirage limité, ceux qui la vendent au marché, ceux de tes amis qui l’ont, et ceux qui l’ont tirée récemment.',
    find: 'menu-2'
  },
  {
    id: 'favoris',
    title: 'Séries favorites',
    text: 'Ajoute des séries à tes favoris (ici, ou avec l’étoile ☆ sur les séries de la page Collection) : elles sont les mêmes sur tous tes appareils. Tu vois leurs personnages, ceux qui te manquent, et un bouton met d’un coup toutes les cartes manquantes dans ta liste de recherches du jeu.',
    find: 'menu-3'
  },
  {
    id: 'etoiles',
    title: 'L’étoile des séries',
    text: 'Sur la page Collection, l’étoile ☆ ajoute une série à tes favoris ; le bouton « ★ Favoris » au-dessus ouvre la liste de leurs personnages. Quand une série est ouverte, son cadre « Album de la série » a aussi « Ajouter aux favoris » et « Rechercher les manquantes ».',
    page: '/jeu/collection',
    target: '.aqm-fav-bar, .aqm-star'
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
    text: 'Dans chaque proposition, les cartes sont plus grandes, avec une pastille verte si tu as déjà la carte (×2, ×3… si tu en as plusieurs) et rouge si tu ne l’as pas.',
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

// What's new in each version, the most recent first. An item is ['text'] or ['text', 'id of a tour step'].
const CHANGES = [
  {
    version: '1.1.1',
    items: [
      ['Qui a cette carte ? (menu Plus) : cherche n’importe quel personnage et vois les joueurs qui ont sa carte (détenteurs des cartes limitées, vendeurs au marché, amis) et tous ceux qui l’ont tirée.', 'qui'],
      ['Base commune des beaux tirages : chaque Aquaman relève les SSR, UR et SEC qui sortent chaque minute et les partage ; « Qui a cette carte ? » s’en sert pour dire qui a tiré une carte et combien de fois.', 'qui'],
      ['Collection : dans le cadre « Album de la série », « Ajouter aux favoris » et « Rechercher les manquantes » pour la série affichée.', 'etoiles'],
      ['Rechercher les manquantes : les cartes s’ajoutent au rythme que le jeu accepte, et l’ajout continue pendant que tu changes de page ou ouvres des boosters, avec sa progression en bas de l’écran.'],
      ['Jusqu’à 200 cartes recherchées de plus : quand la liste du jeu (100 cartes) est pleine, les suivantes attendent dans Aquaman et y entrent au fur et à mesure que tu obtiens les cartes recherchées (Aquaman retire de la liste celles qu’il y avait mises, une fois obtenues). L’ajout se fait en arrière-plan ; sa progression est dans Séries favorites.', 'favoris']
    ]
  },
  {
    version: '1.1.0',
    items: [
      ['Qui a tiré… ? (menu Plus) : les joueurs qui ont tiré récemment un personnage ou une carte d’une série, parmi les beaux tirages du jeu gardés 30 jours.', 'qui'],
      ['Séries favorites : une étoile ☆ sur chaque série de la page Collection, et une page avec leurs personnages (toutes, manquantes, possédées, recherchées, par rareté), les mêmes sur tous tes appareils.', 'favoris'],
      ['Séries favorites : « Rechercher les manquantes » met d’un coup toutes les cartes qui te manquent dans ta liste de recherches du jeu ; 🔭 pour une seule carte.', 'favoris'],
      ['Sur téléphone : la garantie anti-malchance s’affiche aussi quand la réserve de boosters est pleine.', 'pity']
    ]
  },
  {
    version: '1.0.0',
    items: [
      ['Onglet Plus à droite de Marché, avec le classement des amis (cartes uniques et séries complètes).', 'classement'],
      ['Quel booster ouvrir ? (Plus → Boosters rentables) : pour des cartes nouvelles, une rareté, un personnage, une série ou la valeur, les boosters classés par taux de drop ou par prix, avec le nombre de boosters à ouvrir en moyenne et le meilleur et le pire taux.', 'boosters'],
      ['Échanges : cartes plus grandes et pastille verte ou rouge selon que tu as la carte ou non.', 'echanges'],
      ['Collection : la bande des séries défile avec la molette, ou en l’attrapant avec un clic glissé.', 'series'],
      ['Ma vitrine : glisser-déposer des cartes, à la souris ou au doigt.', 'vitrine'],
      ['Accueil : les cartes des beaux tirages sont plus grandes.', 'tirages'],
      ['Accueil : la garantie anti-malchance, avec le nombre de boosters avant ta prochaine SSR et ta prochaine UR garanties, le même sur tous tes appareils.', 'pity'],
      ['Extension : le nombre de boosters à ouvrir sur l’icône, une notification quand il y en a de nouveaux, et le bouton « Mettre à jour » dans sa fenêtre.']
    ]
  }
];
