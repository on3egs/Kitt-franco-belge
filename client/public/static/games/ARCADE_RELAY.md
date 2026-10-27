# Relais arcade Kyronext

## Principe

Le serveur web KITT reste disponible normalement. Le relais de jeu, lui, est
à la demande : la route `GET /api/arcade/ws` ne crée un salon et ne conserve
des connexions que lorsqu'un joueur choisit un mode multijoueur. Quand le
dernier navigateur quitte, le salon est supprimé.

Le relais ne fait ni rendu graphique, ni IA, ni audio, ni vidéo. Il transporte
seulement de petits messages JSON (`join`, `state`, `event`, `ping`). Cela
permet de garder la charge très faible sur l'AGX et les futurs Nano.

## Déploiement sur une nouvelle Jetson

1. Déployer `games-advanced.js`, `arcade-config.js`, `index.html` et le serveur
   KITT avec la même version du protocole.
2. Dans `arcade-config.js`, renseigner l'origine WebSocket du relais central,
   par exemple `https://192.168.129.24:3000` pour un Nano client.
3. Conserver le chemin `/api/arcade/ws` identique sur toutes les machines.
4. Tester deux navigateurs : ils doivent rejoindre le même salon (`tetris`,
   `pacman` ou `ai`) et recevoir `player_joined`, `event` et `player_left`.

Le relais central actuel est l'AGX Manix (`192.168.129.24`). Si un futur
K4000/K95 devient le relais central, il suffit de changer cette origine dans
les pages clientes ; le protocole et le code client restent inchangés.
