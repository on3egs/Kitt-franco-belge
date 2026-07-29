# Effets vocaux et identité des Jetson

Les effets sont définis dans `VOICE_EFFECTS` dans `kyronex_server.py` (KARR DADOO) et `k4000/app/kitt_server.py` (K4000). Ils sont indépendants de la voix choisie. Chaque profil contient un nom affiché et une liste d’arguments SoX; ajouter un effet consiste à ajouter une entrée au registre et une option dans l’interface.

API commune : `GET /api/voice-effects` liste les effets et `POST /api/voice-effect` avec `{"effect":"studio"}` sélectionne le profil. Le traitement est appliqué une fois par morceau audio déjà segmenté pour préserver le démarrage rapide. Le profil `none` contourne SoX.

KARR DADOO est verrouillé par `KYRONEX_CHARACTER_LOCK=KARR` avec `KYRONEX_MAINTENANCE_MODE=0` dans `kyronex_nano_8gb_hyper_fluid.env`. Pour une maintenance administrative temporaire, arrêter le service, passer `KYRONEX_MAINTENANCE_MODE=1`, puis redémarrer. Remettre impérativement la valeur à `0` après maintenance. K4000 ne définit aucun verrou de personnage.

Fonds d’écran : `static/karr-dadoo-wallpaper.jpeg` sur DADOO et `k4000/app/static/k4000-wallpaper.jpeg` sur K4000. Les panneaux utilisent un fond translucide pour préserver leur lisibilité.
