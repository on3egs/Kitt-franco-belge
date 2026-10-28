# KITT FLAG — Monde en blocs

Version Halloween du 28 octobre 2026 : [rubrique Jeux du site principal](https://kitt-franco-belge.be/jeux/) et [lien direct du jeu](https://kitt.kitt-franco-belge.be/static/games/kitt-blocks/). Le jeu figure dans les deux catalogues : le site principal React/GitHub Pages et le catalogue interne de l'AGX. Le service `kitt-block-mode` est actif et activé au démarrage de l'AGX.

## Mission du camion atelier FLAG

Apr?s le sauvetage de Bonnie et le rapport ? Devon, entre dans le camion atelier bleu. Appuie sur la commande **UTILISER** dans la cabine pour recevoir le briefing radio de Devon, puis une seconde fois pour descendre. R?unis deux noyaux, appelle KITT, attends-le pr?s de l?atelier et appuie sur **UTILISER** devant le camion pour r?parer KITT et recevoir 80 points. Le HUD affiche chaque ?tape et la condition de r?ussite.

## Lancer sur le PC

Node.js 20 ou ultérieur. Installer avec `npm ci`, puis `npm start` (`npm.cmd` dans PowerShell si npm.ps1 est bloqué). Ouvrir `http://127.0.0.1:8080/block-mode.html`. Le bouton **JEUX FLAG** de l'interface locale donne aussi accès au jeu.

Three.js est livré par le serveur depuis sa dépendance npm : aucune police, musique, image ou dépendance CDN n'est nécessaire pendant une partie. Les textures, avatars, sons et terrains sont construits par le code. Les photos de référence ne sont pas distribuées.

Pour intégrer le jeu à une autre page, charger `game/integration.js`, puis appeler `startBlockMode()` et `stopBlockMode()`. Facultativement, définir `window.KITT_BLOCK_MODE_URL` avant le script pour viser une instance HTTPS externe. L'intégration utilise une iframe et vérifie l'origine et la fenêtre qui demandent la fermeture. Le serveur utilise `game/catalog.html` si aucun `index.html` hôte n'est présent ; aucun fichier existant n'est remplacé.

## Jouer et configurer

Le clavier utilise les caractères réellement produits par le clavier : ZQSD en AZERTY, préréglage WASD en QWERTY. Les paramètres permettent d'enregistrer chaque commande dans le navigateur. Échap met la simulation en pause ; les boutons tactiles permettent de marcher, regarder en glissant, sauter, construire et conduire.

Souris pour regarder ; ZQSD pour avancer, reculer et faire des pas latéraux dans la direction du regard. Maj pour courir, Ctrl pour s'accroupir, Espace pour sauter. Les diagonales sont normalisées. La souris est capturée après un clic ; perdre la capture ou appuyer sur Échap suspend les commandes.

Inventaire avec Tab (I reste disponible) ; F appelle KITT ; E permet d'interagir à proximité, d'entrer dans KITT et de sortir. Espace active le Turbo Boost au volant. Clic gauche maintenu pour casser, clic droit pour poser, molette ou 1–9 pour changer d'emplacement. Les frites et gaufres restaurent vie et faim. Michael se trouve devant le hangar FLAG et présente une courte mission de construction d'abri. Le mode survie inclut chute, faim, provisions et craft. Le monde solo est sauvegardé localement après les modifications.

Le bestiaire comprend cinq moutons, trois spectres, deux gardes-citrouilles et trois chauves-souris animés. Ils sont amicaux ; E permet une interaction à proximité. Les créatures sont une ambiance locale déterministe, sans combat ni IA autoritaire multijoueur. Désactiver Halloween conserve les moutons. Des blocs citrouilles apparaissent au bord de la route.

Les dialogues et missions sont affichés dans de grandes bulles de bande dessinée. La lecture française utilise SpeechSynthesis et les voix installées/disponibles dans le navigateur ; V et les boutons 🔊 permettent de relire. Les sons du menu, de la construction, des pas, de KITT et des créatures ainsi que la musique sont synthétisés avec WebAudio après une interaction. F10 coupe le son. Les paramètres mémorisent la lecture vocale, Halloween et les volumes général, musique et effets. Aucun extrait sonore de la série n'est inclus.

Lilou et Alexia ont des modèles voxel et un aperçu 3D. Avant de jouer sous ces profils, le serveur vérifie le PIN. Les outils G (vol) et Origine (retour FLAG) sont réservés aux profils déverrouillés ; aucun outil de bannissement n'est exposé. Les PIN ne sont jamais enregistrés dans le navigateur ou dans les fichiers publics. La session privée est temporaire.

## Salles publiques

Le serveur accepte 16 joueurs par salle. Il valide les coordonnées, les matériaux, la portée de construction et la fréquence des messages ; il diffuse les positions, arrivées, départs et modifications. Les navigateurs interpolent les autres joueurs. Les blocs sont confirmés par le serveur et enregistrés dans un répertoire de données privé. Une reconnexion recharge l'état complet de la salle, car Socket.IO ne conserve pas automatiquement tous les messages manqués.

Cette version reste un petit jeu coopératif : pas de chat, de combat entre joueurs, de serveur moddé ni d'inventaire compétitif entièrement autoritaire. La limite de 16 est vérifiée par un test réseau ; elle ne constitue pas une mesure de performances de 16 navigateurs sur le Jetson.

## Tests

- `npm run test:network` : lance son serveur isolé avec des PIN temporaires, vérifie deux clients, les positions, les blocs, les outils admin, l'isolation des salles, la limite de 16, le départ et la persistance après redémarrage. Vérifie que les fichiers privés sont inaccessibles par HTTP.
- `npm run test:controls` : vérifie les vecteurs de déplacement dans six orientations, les pas latéraux, le recul, les diagonales et le cap de KITT.
- `npm run test:browser` : utilise le Chrome installé (variable `CHROME_PATH` si nécessaire), rend la scène WebGL et vérifie les paramètres persistants, AZERTY, inventaire, pause, KITT, profils, deux pages et le tactile. Les captures sont dans `test-results`, exclu de Git.
- `npm run test:season` : contrôle dans Chrome les déplacements après rotation de la souris, le saut, l'accroupissement, la pause, les 13 créatures, les réglages persistants, les dimensions des bulles, les appels SpeechSynthesis et un signal WebAudio non nul puis silencieux en mode muet. Le test ne prétend pas avoir entendu une voix si Chrome n'en fournit pas.
- `npm run test:public` : contrôle la version HTTPS publiée avec deux clients, les positions/départs, les fichiers privés et le PIN local sans l'afficher. `npm run test:live` contrôle le catalogue public, le chargement WebGL, la construction en solo, la conduite, le Turbo Boost et le retour au catalogue dans Chrome.
- `npm run test:site` : vérifie le vrai site principal, les recherches Minecraft/Halloween et plusieurs mots dans des ordres différents, l'intégration dans l'iframe, le saut tactile et le retour au catalogue entre les deux domaines.

Le rendu logiciel de Chrome utilisé en test valide le fonctionnement ; il ne mesure pas la cadence d'un GPU de PC moyen. Le mode Économique réduit les chunks, la résolution, le bloom et les ombres.

## Publication sur l'AGX

Le catalogue interne est `/home/kitt/kitt-ai/static/games/index.html`, servi par `kitt-kyronex` sur le port 3001. Ne pas le remplacer par le `index.html` local. Le site principal `kitt-franco-belge.be` est un autre projet : le React de la branche main de `on3egs/Kitt-franco-belge`, publié par GitHub Actions/Pages. Sa page `client/src/pages/Arcade.tsx` doit aussi contenir la carte vers l'URL HTTPS absolue du jeu. Sa recherche globale et sa recherche Jeux indexent les alias Minecraft, voxel, blocs et Halloween.

Installer le service isolé dans `/home/kitt/kitt-block-mode` avec `npm ci --omit=dev`. Créer `/home/kitt/.config/kitt-block-mode/server.env` en mode 600, hors des routes HTTP : `PORT=8812`, `BIND=127.0.0.1`, `BASE_PATH=/static/games/kitt-blocks`, `PUBLIC_ORIGIN=https://kitt.kitt-franco-belge.be`, `DATA_DIR=/home/kitt/.local/share/kitt-block-mode/rooms`, et les deux variables `ADMIN_PIN_LILOU` / `ADMIN_PIN_ALEXIA`. Le modèle de service systemd est dans `deploy/`.

Ajouter au tunnel Cloudflare existant une règle pour `kitt.kitt-franco-belge.be`, chemin `^/static/games/kitt-blocks(/.*)?$`, service `http://127.0.0.1:8812`, avant la route générale sur 3001. Ce chemin couvre aussi Socket.IO et les modules du moteur. Sauvegarder le catalogue et la configuration du tunnel avant les changements. Le service IA existant n'a pas besoin d'être redémarré.

## Références appliquées

- [Géométrie voxel Three.js](https://threejs.org/manual/pages/voxel-geometry.html) : faces visibles et géométrie par chunk ; la présente version fusionne aussi les rectangles contigus.
- [OutputPass](https://threejs.org/docs/pages/OutputPass.html) : conversion des couleurs et tone mapping en fin de chaîne.
- [MDN KeyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key) : respecter le caractère selon le clavier utilisé.
- [Bonnes pratiques WebAudio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) : démarrage après un geste utilisateur, volumes séparés et contrôle du son.
- [Garanties Socket.IO](https://socket.io/docs/v4/delivery-guarantees/) : confirmation des modifications et resynchronisation complète.
