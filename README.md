# Aquaman — extension navigateur

Compagnon non officiel pour le jeu de cartes de [Poseidon Scans](https://poseidon-scans.net/jeu).

<p align="center"><img src="icons/icon128.png" alt="Aquaman" width="96"></p>

**Installation guidée (PC, Android, iPhone) : https://a-finch13.github.io/Poseidon-TCG/**

## Fonctions

| Fonction | Où |
| --- | --- |
| **Classement des amis** | Onglet **Plus** (à droite de **Marché**) → **Classement des amis** : toi et tes amis, classés par **cartes uniques** ou par **séries complètes**, avec la progression de chacun sur le total du jeu. Un clic sur un nom ouvre son profil. Les collections privées sont signalées. |
| **Quel booster ouvrir ?** | Onglet **Plus** → **Boosters rentables**. Choisis ce que tu cherches : **ta collection** (des cartes que tu n'as pas), **une rareté** (Commune → Secrète), **un personnage** ou **une série** (avec suggestions), ou **la valeur** des cartes. Pour une rareté, un perso ou une série : même les cartes que tu as déjà, ou seulement celles qui te manquent. Les boosters sont classés par **taux de drop** ou par **prix** : « ≈ 11 boosters à ouvrir en moyenne pour avoir une Mythique », « 1 sur 11 », le prix moyen en Perles et une barre comparée au meilleur, avec le meilleur, le moins cher et le pire taux en haut. **Détails** sous chaque booster : chances de chaque rareté, cartes possibles et cartes les plus chères qui te manquent. |
| **Cartes possédées dans les échanges** | Page **Échanges** : les cartes des propositions sont agrandies, avec une pastille **verte** si tu as déjà la carte (×N si tu en as plusieurs) et **rouge** si tu ne l'as pas. Au survol, côté « Tu donnes », la pastille dit s'il te restera un exemplaire. |
| **Faire défiler les séries** | Page **Collection** : la bande des séries (et les autres bandes horizontales) défile avec la **molette** quand la souris est dessus, ou en l'**attrapant d'un clic** et en la faisant glisser. Un simple clic ouvre toujours la série. |
| **Vitrine en glisser-déposer** | **Collection** → **Ma vitrine** : fais glisser une carte sur une autre case pour la déplacer (sur téléphone : appui long sur la carte, puis glisse). Les 3 boutons sous les cartes (‹ › ✕) sont retirés ; pour enlever une carte, utilise la croix rouge en haut à droite de la carte (au survol sur ordinateur, toujours visible sur téléphone). |
| **Qui a tiré… ?** | Onglet **Plus** → **Qui a tiré… ?** : cherche un personnage ou une série, et vois les joueurs qui l'ont tiré récemment (lien vers leur profil), avec le numéro de la carte et quand. Aquaman garde les **beaux tirages** du jeu (SSR, UR, SEC) pendant 30 jours ; l'extension les relève toutes les 5 minutes, le script quand une page du jeu est ouverte. |
| **Séries favorites** | Une étoile ☆ sur chaque série de la page **Collection**, et le bouton **★ Favoris** au-dessus (ou **Plus** → **Séries favorites**) : les personnages de tes séries favorites, filtrés par **Toutes / Manquantes / Possédées / Recherchées** et par rareté. Tes favorites sont **les mêmes sur tous tes appareils** (PC, téléphone, extension ou script). **Rechercher les manquantes** ajoute d'un coup toutes les cartes qui te manquent à ta liste de recherches du jeu (le jeu te prévient quand elles sont en vente) ; 🔭 pour une seule carte. |
| **Garantie anti-malchance** | Page d'**accueil**, sous le minuteur du booster offert : le nombre de boosters avant la **SSR** (tous les 60) et l'**UR** (tous les 190) garanties, avec une barre de progression. Aquaman compte les boosters que tu ouvres et **partage ce compte entre tes appareils** (PC, téléphone, extension ou script) : tu vois le même chiffre partout. Tant qu'il n'a pas vu sortir de SSR ou d'UR, il affiche « au plus », puis le compte devient exact. Le partage se coupe dans les réglages (popup ou Plus → Réglages). |
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
3. Ouvre **[aquaman.user.js](https://github.com/A-Finch13/Poseidon-TCG/releases/latest/download/aquaman.user.js)** dans ce navigateur : Tampermonkey propose de l'installer → **Installer**.
4. Ouvre [poseidon-scans.net/jeu](https://poseidon-scans.net/jeu) : la visite guidée démarre.

**iPhone / iPad** — Safari :

1. Installe l'app gratuite **Userscripts** depuis l'App Store.
2. Réglages → **Safari** → **Extensions** → **Userscripts** : active-la et autorise-la sur poseidon-scans.net.
3. Ouvre **[aquaman.user.js](https://github.com/A-Finch13/Poseidon-TCG/releases/latest/download/aquaman.user.js)** dans Safari, touche l'icône **Userscripts** (à gauche de la barre d'adresse) → **Installer**.
4. Ouvre [poseidon-scans.net/jeu](https://poseidon-scans.net/jeu).

Chrome sur téléphone n'accepte ni les extensions ni les scripts : utilise Firefox (Android) ou Safari (iPhone).

Le script se met à jour tout seul : Tampermonkey et Userscripts vérifient régulièrement s'il y a une nouvelle version.

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
- le **relais Aquaman** (`aquaman-relay.finch-arhold-git.workers.dev`), pour partager la garantie anti-malchance et tes séries favorites entre tes appareils. Il reçoit seulement ton identifiant de joueur, pour chaque booster ouvert un identifiant tiré au hasard, l'heure et la meilleure rareté obtenue, et la liste des identifiants de tes séries favorites. Rien d'autre (ni pseudo, ni session, ni cartes), et les ouvertures de plus d'un an sont effacées. Chaque partage se coupe dans les réglages ; tout reste alors seulement sur ton navigateur.

Le navigateur garde tes réglages, la dernière version vue et tes ouvertures de boosters.

## Signaler un problème

Le site change souvent : si une fonction ne s'affiche plus, ouvre une [issue](https://github.com/A-Finch13/Poseidon-TCG/issues) en précisant la page et ce que tu vois.

---

Extension non officielle, sans lien avec l'équipe de Poseidon Scans. Licence [MIT](LICENSE) — © 2026 A-Finch13.
