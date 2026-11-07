# Aquaman — extension navigateur

Compagnon non officiel pour le jeu de cartes de [Poseidon Scans](https://poseidon-scans.net/jeu).

<p align="center"><img src="icons/icon128.png" alt="Aquaman" width="96"></p>

**Installation guidée (PC, Android, iPhone) : https://a-finch13.github.io/Poseidon-TCG/**

## Fonctions

| Fonction | Où |
| --- | --- |
| **Classement** | Onglet **Plus** (à droite de **Marché**) → **Classement** : toi et tes **amis**, ou en **global** (tes amis et les joueurs vus récemment dans les « Beaux tirages », pas la liste complète du jeu), classés par **cartes uniques** ou par **séries complètes**, avec la progression de chacun sur le total du jeu. Les joueurs déjà lus gardent leur place : seuls ceux lus il y a plus d’une heure (et toi) sont relus, **Actualiser** relit tout le monde. Un clic sur un nom ouvre son profil. Les collections privées sont signalées. |
| **Ma progression** | Page **Collection** : le bouton **Ma progression** à côté de « Ta collection » (ou **Plus** → **Ma progression**) montre le **pourcentage** des cartes du jeu que tu as, tes cartes **par rareté** (cartes uniques sur le total de la rareté, et exemplaires), tes **séries complètes**, les **cartes manquantes** et les cartes uniques gagnées **chaque jour** sur les 14 derniers jours. Aquaman relève ta collection une fois par jour où tu joues (sur cet appareil) : la courbe se remplit à partir de la première utilisation. |
| **Quel booster ouvrir ?** | Onglet **Plus** → **Boosters rentables**. Choisis ce que tu cherches : **ta collection** (des cartes que tu n'as pas), **une rareté** (Commune → Secrète), **un personnage** ou **une série** (avec suggestions), ou **la valeur** des cartes. Pour une rareté, un perso ou une série : même les cartes que tu as déjà, ou seulement celles qui te manquent. Les boosters sont classés par **taux de drop** ou par **prix** : « ≈ 11 boosters à ouvrir en moyenne pour avoir une Mythique », « 1 sur 11 », le prix moyen en Perles et une barre comparée au meilleur, avec le meilleur, le moins cher et le pire taux en haut. **Détails** sous chaque booster : chances de chaque rareté, cartes possibles et cartes les plus chères qui te manquent. |
| **Cartes possédées dans les échanges** | Pages **Échanges** et propositions reçues en **MP** : chaque carte porte une pastille **verte** si tu as déjà la carte (×N si tu en as plusieurs) et **rouge** si tu ne l'as pas. Au survol, côté « Tu donnes », la pastille dit s'il te restera un exemplaire. |
| **Filtres des échanges** | Fenêtre **Proposer un échange**, à côté de **Doublons** : dans **Tu demandes**, **Mes recherches** (les cartes de ta liste de recherches) et **Il me manque** (celles que tu n'as pas) ; dans **Tu donnes**, **Il lui manque** (celles que ton partenaire n'a pas, d'après sa collection publique). Ils se combinent avec les filtres du jeu : **Doublons** + **Il lui manque** montre tes doublons qui lui manquent. |
| **Faire défiler les séries** | Page **Collection** : la bande des séries (et les autres bandes horizontales) défile avec la **molette** quand la souris est dessus, ou en l'**attrapant d'un clic** et en la faisant glisser. Un simple clic ouvre toujours la série. |
| **Vitrine en glisser-déposer** | **Collection** → **Ma vitrine** : fais glisser une carte sur une autre case pour la déplacer (sur téléphone : appui long sur la carte, puis glisse). Les 3 boutons sous les cartes (‹ › ✕) sont retirés ; pour enlever une carte, utilise la croix rouge en haut à droite de la carte (au survol sur ordinateur, toujours visible sur téléphone). |
| **Qui a cette carte ?** | Onglet **Plus** → **Qui a cette carte ?**, ou le bouton du même nom sous « Mes exemplaires » sur la page d'une carte SSR, UR ou SEC : cherche **n'importe quel personnage** du jeu et choisis sa carte. Tu vois combien de joueurs l'ont, la **liste des détenteurs** (le jeu ne la publie que pour les cartes à tirage limité), ceux qui la **vendent au marché** avec leur prix, ceux de **tes amis** qui l'ont, et **tous ceux qui l'ont tirée** avec le nombre de tirages (« Tirée 3 fois depuis le 2 novembre »). Pour une carte non limitée, **Chercher parmi les joueurs vus récemment** regarde la collection publique des joueurs croisés dans les beaux tirages. |
| **Base commune des beaux tirages** | Chaque Aquaman relève **chaque minute** les beaux tirages du jeu (SSR, UR, SEC : ceux que le jeu montre à tout le monde sur l'accueil) et les envoie toutes les 5 minutes à une **base commune et publique** sur le relais : le relais relève aussi lui-même les beaux tirages du jeu toutes les 5 minutes : la base a donc au plus 5 minutes de retard, même quand personne n'a Aquaman ouvert. L'état de ce relevé est public : https://aquaman-relay.finch-arhold-git.workers.dev/status. Plus il y a de joueurs avec Aquaman, plus l'historique est complet ; « Qui a cette carte ? » s'en sert. Le partage se coupe dans les réglages. |
| **Séries favorites** | Une étoile ☆ sur chaque série de la page **Collection**, les boutons **Ajouter aux favoris** et **Rechercher les manquantes** dans le cadre « Album de la série » quand une série est ouverte, et le bouton **★ Favoris** au-dessus (ou **Plus** → **Séries favorites**) : les personnages de tes séries favorites, filtrés par **Toutes / Manquantes / Possédées / Recherchées** et par rareté. Tes favorites sont **les mêmes sur tous tes appareils** (PC, téléphone, extension ou script). **Rechercher les manquantes** ajoute toutes les cartes qui te manquent à ta liste de recherches du jeu (le jeu te prévient quand elles sont en vente), au rythme que le jeu accepte : l'ajout continue pendant que tu changes de page ou ouvres des boosters, avec sa progression en bas de l'écran et un bouton **Arrêter** ; 🔭 pour une seule carte. |
| **Doublons en file d'attente** | Fenêtre **Vendre mes doublons** du jeu : quand le marché est plein, le doublon que le jeu refuse et ceux encore cochés après lui attendent tout de suite dans Aquaman (**50 au plus**, sans recliquer sur « Mettre en vente ») et sont mis en vente tout seuls, au prix choisi, dès qu'une de tes ventes se conclut (nouvel essai toutes les 2 minutes). La file s'affiche dans la fenêtre, avec **Vider la file** et **Réessayer maintenant**. Elle est **la même sur tous tes appareils** (le partage se coupe dans les réglages). |
| **Recycler sans risque** | Fenêtre **Recycler des cartes** du jeu : aucune carte n'est cochée à l'ouverture ; le bouton **Tout sélectionner** coche toute la liste (puis **Tout désélectionner**). |
| **Boosters par catégorie** | Page d'**accueil** : quand tes boosters sont de plusieurs catégories (Classique, Magie, Action…), les boosters gratuits s'affichent d'abord et des flèches passent aux autres. **3 catégories visibles à la fois** : celle du centre et une de chaque côté. Chacune a le rendu et l'image de son pack, et ses boutons **Ouvrir** et **Tout ouvrir**, qui n'ouvrent que ceux-là, avec l'animation du jeu. Un pack acheté dans la boutique apparaît dès le retour à l'accueil. |
| **Retirer mes ventes** | Page **Marché**, à côté de **Vendre une carte** : retire toutes tes ventes à prix fixe d'un coup, au rythme que le jeu accepte. La file d'attente des doublons est mise en pause le temps du retrait, puis réactivée. |
| **Cartes achetées masquées** | Page **Marché** : une fois une carte achetée, ses autres annonces de la même rareté ne s'affichent plus (même après un rechargement), **sur tous tes appareils** (le partage se coupe dans les réglages). |
| **Filtre Favoris au marché** | Page **Marché**, à côté de **Mes recherches** : **★ Favoris** ne montre que les annonces de tes séries favorites, en plus des filtres du jeu. |
| **Manquantes et séries avancées** | Page **Collection** : un onglet **Manquantes** à côté de **Album complet** ne montre que les cartes qui te manquent ; **Les plus avancées** range les séries de celle où il te manque le moins de cartes à celle où il en manque le plus. **Masquer séries <= 5 persos** cache les séries de 5 personnages ou moins, **Masquer séries avec badge** celles dont tu as déjà réclamé l'album. Le tri, le filtre et la place de la bande sont gardés au retour de la page d'un personnage. |
| **Offres sur la page d'une carte** | Page d'une **carte** : sous la cote, les 5 offres les moins chères du marché, avec le vendeur, le numéro et un bouton **Acheter**, puis les 3 **enchères** en cours avec la mise la plus faible (nombre d'enchères, temps restant et bouton **Enchérir**). |
| **Garantie anti-malchance** | Page d'**accueil**, sous le minuteur du booster offert : le nombre de boosters avant la **SSR** (tous les 60) et l'**UR** (tous les 190) garanties, avec une barre de progression. En dessous, la **SEC** (sans garantie dans le jeu) : le nombre de boosters depuis ta dernière, sa fréquence moyenne selon les taux du jeu et ta chance d'en avoir une dans les 100 prochains. Aquaman compte les boosters que tu ouvres et **partage ce compte entre tes appareils** (PC, téléphone, extension ou script) : tu vois le même chiffre partout. Tant qu'il n'a pas vu sortir de SSR ou d'UR, il affiche « au plus », puis le compte devient exact. Le bouton **📜 Historique** montre chaque SSR, UR et SEC tirée, avec le nombre de boosters qu'elle a demandé et le **pack** d'où elle vient (filtre par pack). Le partage se coupe dans les réglages (popup ou Plus → Réglages). |
| **Beaux tirages plus grands** | Page d'**accueil** du jeu, section **Les beaux tirages** : les cartes sont nettement plus grandes. |
| **Visite guidée** | S'ouvre toute seule à la première visite du jeu et montre chaque fonction à sa place, page par page. Relance-la quand tu veux : **Plus** → **Visite guidée**. |
| **Nouveautés** | Après chaque mise à jour, une fenêtre résume ce qui a changé, avec un bouton **Montre-moi** qui t'emmène sur la fonction. Toujours accessible : **Plus** → **Nouveautés**. |
| **Boosters à ouvrir** (extension) | Le nombre de boosters qui t'attendent s'affiche sur l'icône d'Aquaman, avec une notification quand il y en a de nouveaux. |
| **Mises à jour** | Extension : notification et bouton **Mettre à jour** dans la fenêtre d'Aquaman (voir plus bas). Script : ton gestionnaire de scripts installe les nouvelles versions tout seul. |

Tout marche avec ton propre compte, sur ordinateur comme sur téléphone (pages adaptées aux petits écrans).

## Installer

Deux versions, avec les mêmes fonctions :

- l'**extension**, pour les navigateurs d'ordinateur ;
- le **script** `aquaman.user.js`, pour le téléphone (et pour les ordinateurs avec Tampermonkey).

### Sur téléphone

**Android** — Firefox :

1. Installe **Firefox** depuis le Play Store.
2. Ajoute le module **Tampermonkey** : menu ⋮ → **Modules complémentaires** → **Tampermonkey** → **Ajouter à Firefox**.
3. Ouvre **[aquaman.user.js](https://raw.githubusercontent.com/A-Finch13/Poseidon-TCG/main/aquaman.user.js)** dans ce navigateur : Tampermonkey propose de l'installer → **Installer**.
4. Ouvre [poseidon-scans.net/jeu](https://poseidon-scans.net/jeu) : la visite guidée démarre.

**iPhone / iPad** — Safari :

1. Installe l'app gratuite **Userscripts** depuis l'App Store.
2. Réglages → **Safari** → **Extensions** → **Userscripts** : active-la et autorise-la sur poseidon-scans.net.
3. Ouvre **[aquaman.user.js](https://raw.githubusercontent.com/A-Finch13/Poseidon-TCG/main/aquaman.user.js)** dans Safari, touche l'icône **Userscripts** (à gauche de la barre d'adresse) → **Installer**.
4. Ouvre [poseidon-scans.net/jeu](https://poseidon-scans.net/jeu).

Chrome sur téléphone n'accepte ni les extensions ni les scripts : utilise Firefox (Android) ou Safari (iPhone).

Pour les mises à jour, voir [Mettre à jour sur téléphone](#mettre-à-jour-sur-téléphone) plus bas.

### Mettre à jour sur téléphone

Quand une nouvelle version sort, un cadre **« 🔱 Aquaman X est disponible »** apparaît en haut des pages du jeu. Suis les étapes de ton téléphone.

**Android** — Firefox + Tampermonkey :

1. Sur une page du jeu, ouvre le menu **⋮** de Firefox → **Modules complémentaires** → **Tampermonkey**.
2. Touche **Rechercher des mises à jour des scripts utilisateurs**.
3. Tampermonkey télécharge la nouvelle version et l'installe. S'il affiche une page avec **Mettre à jour**, touche ce bouton.
4. Reviens sur l'onglet du jeu et **recharge la page**.

Si rien ne change, ouvre **[ce lien vers le script](https://raw.githubusercontent.com/A-Finch13/Poseidon-TCG/main/aquaman.user.js)** dans Firefox : Tampermonkey ouvre sa page d'installation → **Mettre à jour**. Puis recharge la page du jeu.

**iPhone / iPad** — Safari + Userscripts :

À partir de la 1.4.8, le bouton **Installer** du cadre affiche ces étapes :

1. Sur une page du jeu dans Safari, touche **ᴀA** (ou 🧩) à gauche de la barre d'adresse → **Userscripts**.
2. Dans le panneau de Userscripts, touche le bouton de **recherche de mises à jour** (↻), puis mets à jour **Aquaman**.
3. **Recharge la page** du jeu.

Userscripts ne trouve rien ? Télécharge la dernière version depuis la [page d'installation](https://a-finch13.github.io/Poseidon-TCG/) (onglet **iPhone / iPad**), puis dans l'app **Fichiers** → **Téléchargements**, garde le doigt sur **aquaman.user.js** → **Déplacer** → **Sur mon iPhone** (ou **Sur mon iPad**) → **Userscripts** → **Déplacer** → **Remplacer**, et recharge la page du jeu.

Jusqu'à la 1.4.7, le bouton **Installer** ouvre le code du script dans un nouvel onglet : sur cette page, touche **ᴀA** (ou 🧩) → **Userscripts** → **Installer**, ou suis les étapes ci-dessus.

Après le rechargement, la fenêtre **Nouveautés** s'ouvre et résume ce qui a changé. Pour vérifier ta version : **Plus** → **Nouveautés**, la première version de la liste est la tienne. Tes réglages, favoris et historique sont conservés : ils ne sont pas dans le script.

« Plus tard » cache le cadre jusqu'à la fermeture de l'onglet.

### Brave, Chrome, Edge, Opera, Vivaldi

1. Télécharge **[aquaman-chromium.zip](https://github.com/A-Finch13/Poseidon-TCG/releases/latest/download/aquaman-chromium.zip)**.
2. Clic droit sur le fichier → **Extraire tout…** → **Extraire**. Range le dossier obtenu dans un endroit où il restera (par exemple **Documents**) : l'extension en a besoin pour marcher.
3. Ouvre `chrome://extensions` (Edge : `edge://extensions`, Brave : `brave://extensions`).
4. Active le **Mode développeur** (en haut à droite).
5. Clique sur **Charger l'extension non empaquetée** et choisis le dossier extrait (celui qui contient `manifest.json`).
6. Recharge [poseidon-scans.net/jeu](https://poseidon-scans.net/jeu) : l'onglet **Plus** apparaît à droite de **Marché** et la visite guidée démarre.
7. (Conseillé) Double-clique sur **installer-mises-a-jour.bat** dans le dossier de l'extension : le bouton **Mettre à jour** pourra ensuite installer les nouvelles versions tout seul. À refaire seulement si tu déplaces le dossier.

### Firefox

1. Télécharge **[aquaman-firefox.xpi](https://github.com/A-Finch13/Poseidon-TCG/releases/latest/download/aquaman-firefox.xpi)**.
2. Ouvre `about:debugging#/runtime/this-firefox`.
3. Clique sur **Charger un module complémentaire temporaire…** et choisis le fichier téléchargé.

Firefox retire les modules temporaires à sa fermeture : il faut refaire l'étape 3 à chaque lancement. Pour une installation qui reste, prends plutôt le script avec Tampermonkey (comme sur téléphone).

### Mettre à jour l'extension

Quand une nouvelle version sort, une notification te prévient et la fenêtre d'Aquaman (clic sur son icône) affiche un bouton **Mettre à jour** :

- si tu as lancé **installer-mises-a-jour.bat** une fois, le bouton remplace les fichiers, l'extension redémarre et les onglets du site se rechargent ;
- sinon, télécharge **aquaman-chromium.zip**, remplace le contenu du dossier de l'extension, puis clique sur **↻** sous Aquaman dans `chrome://extensions`.

Pour retirer l'assistant de mise à jour : `installer-mises-a-jour.bat -Uninstall`.

## Comment sont faits les calculs

- **Cartes uniques** et **séries complètes** : les chiffres de la collection de chaque joueur, tels que le jeu les donne (une série compte quand son album est réclamé).
- **Taux de drop** : les poids de rareté du jeu. Un booster donne 5 cartes : 4 tirages libres et un 5e d'au moins la rareté garantie. Dans une rareté, chaque carte du booster a la même chance. La garantie anti-malchance (pity) n'est pas comptée.
- **Valeur estimée** : le prix médian (en Perles) des exemplaires vus dans ta collection, et dans celles de tes amis si tu as ouvert le classement juste avant. Une carte jamais vue prend la valeur moyenne de sa rareté.
- **Nouvelles cartes** : les cartes du booster qui ne sont pas dans ta collection.

Ce sont des moyennes : un booster reste un tirage au sort.

## Vie privée

Aquaman lit les informations du jeu avec ta session sur poseidon-scans.net, comme le site lui-même (ta collection, ta liste d'amis, la boutique). Ta session n'est jamais envoyée ailleurs.

Deux autres adresses sont contactées :

- l'API publique de GitHub, pour savoir si une nouvelle version existe (extension) ;
- le **relais Aquaman** (`aquaman-relay.finch-arhold-git.workers.dev`), pour partager la garantie anti-malchance et tes séries favorites entre tes appareils, et pour la base commune des beaux tirages. Il reçoit seulement ton identifiant de joueur, pour chaque booster ouvert un identifiant tiré au hasard, l'heure et la meilleure rareté obtenue, et la liste des identifiants de tes séries favorites. Rien d'autre (ni pseudo, ni session, ni cartes), et les ouvertures de plus d'un an sont effacées. Chaque partage se coupe dans les réglages ; tout reste alors seulement sur ton navigateur.
- Aquaman signale aussi au relais, au plus une fois toutes les 6 heures, qu'il est utilisé : ton identifiant et ton pseudo de joueur, extension ou script, et la version. Cette liste n'est **visible que par l'auteur d'Aquaman**, depuis ses appareils approuvés (chaque appareil a sa propre clé, et le relais n'accepte que les demandes signées par l'une d'elles) ; elle sert à savoir combien de joueurs l'utilisent et avec quelle version.
- La **base commune des beaux tirages** est **publique** : n'importe qui peut la lire. Elle ne contient que ce que le jeu affiche déjà à tous les joueurs dans « Les beaux tirages » (la carte, son numéro, le pseudo et l'identifiant du joueur qui l'a tirée, l'heure). Elle est gardée sans limite de durée, et n'est jamais réécrite : un import ajoute seulement les tirages qu'elle n'a pas et complète les champs vides de ceux qu'elle a ; les imports de tous les joueurs sont traités un par un. Seules les cartes SSR, UR et SEC y entrent.

Le navigateur garde tes réglages, la dernière version vue et tes ouvertures de boosters.

## Signaler un problème

Le site change souvent : si une fonction ne s'affiche plus, ouvre une [issue](https://github.com/A-Finch13/Poseidon-TCG/issues) en précisant la page et ce que tu vois.

---

Extension non officielle, sans lien avec l'équipe de Poseidon Scans. Licence [MIT](LICENSE) — © 2026 A-Finch13.
