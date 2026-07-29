# Rapport final — Jetson DADOO et K4000 — 30 juillet 2026

## Résultat

- Registre réseau centralisé installé sur les deux Jetson avec 4 machines et aucune IP dupliquée hors `config/jetson_fleet.json`.
- Ancien nom d’identité retiré : 147 occurrences exactes initiales sur DADOO, 0 sur K4000; seconde recherche texte, journaux et SQLite : 0 restante.
- Ancien libellé de voix remplacé par « Manix | Kyronext Studio » : 105 occurrences initiales dans 51 fichiers; seconde recherche : 0 restante. Les identifiants et modèles `guy_chapelier*.onnx/json` sont volontairement conservés.
- Menu Effet vocal installé sur les deux interfaces : Aucun, KITT Classic, KARR Classic, Studio. Effets indépendants de la voix et appliqués en un seul passage SoX par morceau streamé.
- DADOO verrouillé en KARR pour les flux streaming, non-streaming et vision. Maintenance administrative possible avec `KYRONEX_MAINTENANCE_MODE=1` après arrêt du service.
- Titre DADOO : KARR ambré, mêmes dimensions et animation. Titre K4000 : K.I.T.T. rouge inchangé.
- Fonds plein écran étirés à 100 % × 100 % : image KARR franco-belge sur DADOO; image Knight Rider 95 rouge sur K4000. Photos légèrement assombries, panneaux 50 % plus translucides et contours/animations fortement rehaussés.

## Tests réalisés

- `py_compile`, validation Bash et JSON : réussies.
- Services : DADOO `kitt-kyronex.service` actif, K4000 `kyronext.service` actif, `NRestarts=0`.
- Santé finale : DADOO `status=ok`, LLM/Whisper/Piper GPU opérationnels, verrou KARR confirmé; K4000 `status=en ligne`.
- Commande « Mode KITT » envoyée à DADOO : réponse KARR et verrou maintenu.
- TTS réel sur les 4 effets et les 2 Jetson : 8 WAV PCM mono valides; endpoints GET/POST validés.
- Sélection de la voix interne `guy` validée sur K4000 avec le libellé « Manix | Kyronext Studio ».
- Registre réseau : API et résolveur validés sur les deux machines; 4 machines retrouvées automatiquement.
- Interfaces et images rendues par Chromium headless; empreintes des images servies identiques aux fichiers choisis.
- Recherche finale anciens noms dans code, configuration, documentation, journaux et bases : 0 occurrence visible restante.

## Retour arrière

- DADOO : `/home/karr/kyronex-backups/ui_effects_20260730_005946`
- K4000 : `/home/K4000/kyronext-backups/combined_update_20260730_010332`
- Sauvegarde réseau K4000 antérieure : `/home/K4000/kyronext-backups/network_registry_20260730_004958`

## Fichiers source modifiés ou ajoutés

- `CLOUDFLARE_KARR_DADOO_SETUP.md`
- `CONFIG_AUTO_BOOT.sh`
- `FIX_KARR_DADOO_NOW.sh`
- `NOTES_BON_MAUVAIS_KYRONEXT_2026-07-29.md`
- `RAPPORT_HYPER_FLUID_FINAL_20260729.md`
- `SETUP_AUTO_START.sh`
- `assets/index-GMNqsHZD.js`
- `client/src/contexts/LanguageContext.tsx`
- `client/src/pages/Home.tsx`
- `client/src/pages/Karr.tsx`
- `cross_backup_kitt.sh`
- `indexdesecoure.html`
- `jetson/kyronex_server.py`
- `k4000/app/kitt_server.py`
- `k4000/app/start_kitt.sh`
- `k4000/app/static/index.html`
- `karr-control/config.py`
- `kitt-alien-mix.html`
- `kitt-improved.html`
- `kyronex_nano_8gb_hyper_fluid.env`
- `kyronex_server.py`
- `patch_5voices.py`
- `setup_cloudflare_karr_dadoo.sh`
- `start_k4000_hyper_fluid.sh`
- `start_karr_hyper_fluid.sh`
- `test_hyper_fluid.sh`
- `train_guy_chapelier.ipynb`
- `train_guy_nodocker.sh`
- `tunnel_skv3.json`
- `JETSON_NETWORK.md`
- `VOICE_EFFECTS.md`
- `config/jetson_fleet.json`
- `jetson_network.py`
- `k4000/app/static/k4000-wallpaper.jpeg`
- `static/index.html (DADOO actif, fichier local non suivi)`
- `static/karr-dadoo-wallpaper.jpeg (DADOO actif)`

## Recommandations

- Les réglages sont volontairement légers. Ajuster d’abord uniquement le délai/decay des profils Classic après écoute en voiture.
- L’effet actif est en mémoire vive; après redémarrage, le défaut revient à `Aucun`. Une préférence persistante globale pourra être ajoutée si souhaité.
- L’ensemble maintenu est sauvegardé dans le commit et le push final du 30 juillet 2026.
