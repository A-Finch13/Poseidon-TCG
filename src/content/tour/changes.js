// Aquaman, code de la page : les nouveautés de chaque version, affichées par tour/news.js.
// Chaque nouvelle version ajoute son entrée en tête de CHANGES (build.mjs refuse une version qui n'en a pas).

// Nouveautés de chaque version, la plus récente d'abord. Un élément est ['texte'] ou ['texte', 'id d'une étape de la
// visite'].
const CHANGES = [
  {
    version: '1.6.0',
    items: [
      ['Aquaman se charge plus vite sur les pages du jeu : son code et ses styles arrivent en 2 fichiers au lieu de 72.'],
      ['Mises à jour plus légères : l’extension compte 17 fichiers au lieu d’une centaine, le bouton « Mettre à jour » a moins à télécharger et à remplacer.'],
      ['Collection : le filtre « Manquantes » reste actif quand tu reviens sur la collection (après un achat depuis la page d’une carte, par exemple).', 'series'],
      ['Collection : « Masquer cartes verrouillées », à côté des filtres des séries, cache les cartes dont tous tes exemplaires sont verrouillés.', 'series'],
      ['Classement : le jeu a maintenant son propre classement. Sur sa page, « Amis » à côté de « Tous » montre toi et tes amis avec les points du jeu (calculés depuis leur collection pour ceux hors du top 100), avec le style du classement du jeu : un podium pour les 3 premiers et leur plus belle carte, puis les lignes de chacun. Le classement d’Aquaman quitte le menu Plus.', 'classement'],
      ['L’onglet Plus passe tout à droite de la barre du jeu, après Classement.', 'plus'],
      ['Garantie anti-malchance : une SSR, UR ou SEC tirée sans Aquaman (sur un autre appareil sans lui) mais vue dans les Beaux tirages du jeu remet son compteur à zéro.']
    ]
  },
  {
    version: '1.5.0',
    items: [
      ['Collection : dans « Album de la série », « 🔒 Verrouiller les uniques » verrouille les cartes de la série dont tu n’as qu’un exemplaire, puis celles qui descendent à un seul exemplaire (vente, échange, recyclage). Un 2e clic arrête la surveillance.'],
      ['Ma progression : les cartes gagnées chaque jour et le compte par rareté sont les mêmes sur tous tes appareils (réglage « Partage entre mes appareils › Ma progression »).', 'progression'],
      ['Boosters : après l’ouverture d’un ou plusieurs boosters, un bouton « ♻ Recycler les doublons » dans la fenêtre des cartes recycle en Perles les doublons des cartes tirées. Un 2e clic confirme ; le plus petit numéro de chaque carte est gardé, les cartes en vente ou verrouillées ne sont pas touchées.'],
      ['Réglages : « Recyclage automatique » (désactivé au départ) recycle tout seuls, sans clic, les doublons N, R et SR des cartes tirées à la fin de chaque ouverture ; les SSR, UR et SEC restent au bouton.'],
      ['Marché : l’écran noir après l’achat d’une carte depuis sa page (« Son prix au marché ») est corrigé. « Masquer ce que je viens d’acheter » et le filtre « ★ Favoris » ne touchent plus que la liste du marché, jamais le reste d’une page.'],
      ['Téléphone : sur la page Collection, les filtres des séries restent sur une ligne qui défile (ils ne débordent plus sur les séries), et « Ma progression » se range avec les boutons du jeu.']
    ]
  },
  {
    version: '1.4.9',
    items: [
      ['Collection : un bouton « Ma progression » à côté de « Ta collection » (aussi dans Plus) : le pourcentage du jeu que tu as, tes cartes par rareté, tes séries complètes, les cartes qui te manquent et les cartes uniques gagnées chaque jour sur les 14 derniers jours.', 'progression'],
      ['Collection : le bouton « Masquer séries avec badge » cache les séries dont tu as déjà réclamé l’album.', 'series'],
      ['Classement : les joueurs déjà lus gardent leur place et leurs chiffres ; seuls ceux lus il y a plus d’1 h (et toi) sont relus, sans tout retélécharger. « Actualiser » relit tout le monde.', 'classement'],
      ['Classement : l’onglet « Perles » est retiré. Aquaman n’envoie plus ton stock de Perles, et celui déjà partagé est effacé du relais.'],
      ['Collections : Aquaman vérifie que chaque vitrine lue est bien celle du joueur demandé, et oublie tout ce qu’il a lu dès que tu changes de compte : la collection d’un autre joueur n’est jamais prise pour la tienne.']
    ]
  },
  {
    version: '1.4.8',
    items: [
      ['Classement : « Global » compte aussi tes amis.'],
      ['iPhone et iPad : « Installer » dans le cadre d’une nouvelle version affiche les étapes pour mettre Aquaman à jour avec Userscripts.'],
      ['Garantie anti-malchance : un booster signalé deux fois n’est plus compté deux fois (un écart de 61 boosters pouvait apparaître pour une garantie de 60).']
    ]
  },
  {
    version: '1.4.7',
    items: [['Historique des tirages : le pack d’où vient chaque SSR, UR et SEC, sous sa carte, et un filtre par pack. Pour les cartes tirées avant cette version, le pack est déduit de la carte : Halloween pour une carte Halloween, Classique pour les autres.'], ['Boosters rentables : en cherchant un personnage, chaque suggestion montre son image et ses raretés.'], ['Accueil : après un « Tout ouvrir », un bouton « Ouvrir les 10 suivants » à côté de « Fermer » ouvre les boosters suivants du même pack, 10 par 10 (le jeu n’en ouvre pas plus d’un coup). La fenêtre des cartes se ferme toute seule 5 s après la dernière, sur les 10 suivantes s’il en reste : un clic dans la fenêtre l’arrête.'], ['Proposer un échange : à côté de « Doublons », les filtres « Mes recherches » et « Il me manque » dans « Tu demandes », et « Il lui manque » dans « Tu donnes » (avec « Doublons » : tes doublons qu’il n’a pas).'], ['Classement : « Global » à côté de « Amis » (les joueurs vus récemment dans les Beaux tirages et les utilisateurs d’Aquaman, pas la liste complète du jeu), et un onglet « Perles » : le stock de Perles des utilisateurs d’Aquaman qui le partagent (réglage « Mes Perles au classement »).']]
  },
  {
    version: '1.4.6',
    items: [['Page d’une carte : un bouton « Enchérir » sur chaque enchère en cours, qui ouvre sa page dans le jeu.']]
  },
  {
    version: '1.4.5',
    items: [['Page d’une carte : sous les annonces du marché, les 3 enchères en cours avec la mise la plus faible, avec le nombre d’enchères et le temps restant.']]
  },
  {
    version: '1.4.4',
    items: [
      ['Page d’une carte : après un achat avec « Acheter », la page ne se recharge plus ; tes Perles et tes exemplaires se mettent à jour sur place.'],
      ['Collection : « ★ Favoris », « Les plus avancées » et « Masquer séries <= 5 persos » apparaissent dès l’ouverture de l’onglet.']
    ]
  },
  {
    version: '1.4.3',
    items: [
      ['Échanges : la pastille verte ou rouge apparaît sur toutes les pages d’échange, et sur les propositions envoyées en MP.', 'echanges'],
      ['Échanges : les cartes gardent la taille du jeu.'],
      ['Page d’une carte SSR, UR ou SEC : un bouton « Qui a cette carte ? » sous « Mes exemplaires » montre les joueurs qui l’ont.'],
      ['Collection : « Masquer séries <= 5 persos », à côté de « Les plus avancées », cache les séries de 5 personnages ou moins.'],
      ['Collection : « En vente » à côté de « Manquante » indique seulement que la carte est vendue au marché : la pastille ne s’ouvre plus.'],
      ['Page d’une carte : les 5 annonces les moins chères du marché, sous la cote, avec « Acheter ».'],
      ['Téléphone : le bouton « Installer » du cadre de mise à jour ouvre le script dans une page que Tampermonkey et Userscripts savent installer (avant, le fichier était seulement téléchargé).']
    ]
  },
  {
    version: '1.4.2',
    items: [['Correction : avec « Tout ouvrir », le pack de l’animation prend l’image de la catégorie ouverte (Légendaire, Action, Magie…), et non celle de la catégorie ouverte juste avant.']]
  },
  {
    version: '1.4.1',
    items: [
      ['Réglages : Plus › Réglages permet d’activer ou de couper chaque fonction d’Aquaman (boosters par catégorie, lueur, garantie, « Manquantes », « En vente », échanges…). La même liste sur PC et téléphone, dans l’extension comme dans le script, et dans la fenêtre de l’extension.'],
      ['Collection : changer de série ne fait plus sauter la page ; la file d’attente des recherches reste en bas de l’écran et dans Séries favorites.'],
      ['Correction : en ouvrant des boosters à thème (Action, Magie…), le pack de l’animation d’ouverture a bien l’image de sa catégorie, et non celle du booster classique.']
    ]
  },
  {
    version: '1.4.0',
    items: [
      ['Garantie anti-malchance : un bouton « Historique » ouvre ton tracker. Il montre à quelle fréquence tu tires des SSR, UR et SEC comparé à la chance du jeu, tes 300 derniers boosters d’un coup d’œil, et combien de boosters il t’a fallu pour chacune.'],
      ['Correction : une UR ne remet plus le compteur de la garantie SSR à zéro, comme dans le jeu.'],
      ['Accueil : la lueur derrière le booster prend la couleur de son pack (doré, cyan, rouge…).'],
      ['Qui a cette carte ? : un même numéro n’apparaît plus chez deux joueurs ; celui vu le plus récemment l’emporte.']
    ]
  },
  {
    version: '1.3.2',
    items: [
      ['Collection : un bouton « En vente » à côté de chaque carte manquante que quelqu’un vend ; il ouvre les 5 annonces les moins chères du marché, avec « Acheter ». Elles ne sont plus ajoutées sur la page de la carte.'],
      ['Accueil : « N à ouvrir » compte les boosters de la catégorie affichée, et son nom n’est plus écrit au-dessus du pack (il est déjà dessus).'],
      ['Accueil : le booster du dessus bouge comme dans le jeu (il flotte et se tourne vers la souris), et sa lueur n’est plus coupée.'],
      ['Correction : la page Collection ne devient plus blanche quand on clique sur « Manquantes » dans une série.'],
      ['Échanges : la page ne gèle plus et ne plante plus quand Aquaman marque les cartes que tu as déjà.'],
      ['Téléphone : les boosters de l’accueil gardent leur forme (ils étaient écrasés) et ne glissent plus les uns derrière les autres quand on fait défiler la page ; les boutons « Ouvrir » et « Tout ouvrir » sont l’un sous l’autre, comme dans le jeu.'],
      ['Plus fluide : Aquaman travaille quand le navigateur est libre, se met en pause quand l’onglet est caché, et le marché comme la collection lui demandent moins de travail.']
    ]
  },
  {
    version: '1.3.1',
    items: [
      ['Marché : les cartes achetées dont les autres annonces sont masquées sont les mêmes sur tous tes appareils (PC, téléphone, extension ou script).'],
      ['Vendre mes doublons : la file des doublons en attente de vente est la même sur tous tes appareils ; celui qui a une page du site ouverte les met en vente dès qu’une place se libère.'],
      ['Réglages : « Partager les cartes achetées masquées et les doublons en attente de vente entre mes appareils », activé par défaut.']
    ]
  },
  {
    version: '1.3.0',
    items: [
      ['Vendre mes doublons (fenêtre du jeu) : quand le marché est plein, le doublon refusé et ceux encore cochés après lui attendent dans Aquaman (50 au plus), sans recliquer, et sont mis en vente tout seuls, au prix choisi, dès qu’une de tes ventes se conclut. La file s’affiche dans la fenêtre, avec « Vider la file » et « Réessayer maintenant ».'],
      ['Recycler des cartes (fenêtre du jeu) : aucune carte n’est cochée à l’ouverture, et un bouton « Tout sélectionner » coche toute la liste.'],
      ['Accueil : sous les garanties SSR et UR, le nombre de boosters depuis ta dernière SEC, sa fréquence moyenne et ta chance d’en avoir une dans les 100 prochains (la SEC n’a pas de garantie).', 'pity'],
      ['Accueil : quand tes boosters sont de plusieurs catégories, les boosters gratuits s’affichent d’abord, et des flèches passent aux autres catégories (3 visibles à la fois : celle du centre et une de chaque côté), chacune avec son rendu, l’image de son pack et ses boutons « Ouvrir » et « Tout ouvrir », qui n’ouvrent que ceux-là, avec l’animation du jeu. Leur dessin est gardé et partagé entre tes appareils, pour s’afficher tout de suite.'],
      ['Accueil : un pack acheté dans la boutique s’affiche dès le retour à l’accueil, sans recharger la page.'],
      ['Marché : un bouton « Retirer mes ventes » à côté de « Vendre une carte » retire toutes tes ventes à prix fixe d’un coup. La file d’attente des doublons est mise en pause le temps du retrait, puis réactivée.'],
      ['Marché : une fois une carte achetée, ses autres annonces de la même rareté ne s’affichent plus.'],
      ['Marché : un filtre « ★ Favoris » à côté de « Mes recherches » ne montre que les cartes de tes séries favorites.'],
      ['Collection : « Les plus avancées » à côté de ★ Favoris range les séries de celle où il te manque le moins de cartes à celle où il en manque le plus (les complètes à la fin). Le tri et la place de la bande sont gardés au retour de la page d’un personnage.'],
      ['Collection : un onglet « Manquantes » à côté de « Album complet », qui ne montre que les cartes qui te manquent.'],
      ['Page d’une carte : sous la cote, les 5 offres les moins chères du marché, de la moins chère à la plus chère, avec le vendeur, le numéro et un bouton « Acheter ».'],
      ['Qui a cette carte ? : la photo de profil de chaque joueur à côté de son nom.', 'qui'],
      ['Correction : la page Collection ne devient plus blanche quand on clique trop tôt sur « Manquantes » (Aquaman attend que le jeu ait fini de charger la page).']
    ]
  },
  {
    version: '1.2.0',
    items: [
      ['Ma vitrine : la fenêtre reste fluide même avec des centaines de cartes (seules celles proches de l’écran sont dessinées, et Aquaman ne fouille plus toute la fenêtre à chaque changement).', 'vitrine'],
      ['Qui a cette carte ? : quand quelqu’un fait un beau tirage (SSR, UR ou SEC), Aquaman lit sa collection publique et garde ses SSR, UR et SEC dans la base commune ; « Vus avec cette carte » liste ces joueurs.', 'qui'],
      ['Les cartes en attente de recherche (au-delà des 100 du jeu) sont les mêmes sur tous tes appareils.', 'favoris'],
      ['Script : une nouvelle version est cherchée toutes les 10 minutes et proposée en haut de l’écran (« Installer »). L’extension la cherche aussi toutes les 10 minutes.']
    ]
  },
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
